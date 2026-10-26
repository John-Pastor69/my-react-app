import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import "../styles/Approval.scss";
import PendingRequest from './PendingRequest';
import { archiveReservation } from '../services/archiveReservation';
import {
    getApprovalTrackerSteps,
    isApprovalStepReady,
    normalizeApprovalRoleKey
} from '../services/approvalWorkflow';

// --- NAME FORMATTER HELPER ---
const formatName = (fullName) => {
    if (!fullName) return 'Unknown User';
    let name = fullName.replace(/\s*\(Student\)/i, '').trim();
    if (name.includes(',')) {
        const parts = name.split(',');
        name = `${parts[1].trim()} ${parts[0].trim()}`;
    }
    return name;
};


const Approval = ({ currentUserRole = '' }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const normalizedCurrentUserRole = normalizeApprovalRoleKey(currentUserRole);
    const isSuperAdmin = normalizedCurrentUserRole === 'super admin';
    const canOverrideApprovalWorkflow = isSuperAdmin
        || ['mis', 'building admin'].includes(normalizedCurrentUserRole);
    const canFilterApprovalView = ['mis', 'building admin'].includes(normalizedCurrentUserRole);
    const canCancelReservations = ['mis', 'mis admin', 'building admin', 'super admin']
        .includes(normalizedCurrentUserRole);
    const [approvalView, setApprovalView] = useState('all');
    const [isApprovalViewLoaded, setIsApprovalViewLoaded] = useState(false);
    const [isSavingApprovalView, setIsSavingApprovalView] = useState(false);
    const [approvalViewError, setApprovalViewError] = useState('');

    // --- STATE MANAGEMENT ---
    const [search, setSearch] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [reservationToCancel, setReservationToCancel] = useState(null);
    const [cancellationRemark, setCancellationRemark] = useState('');
    const [cancellationError, setCancellationError] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);
    const [reservationsData, setReservationsData] = useState([]);
    const [usersData, setUsersData] = useState([]);
    const [approverRoleKey, setApproverRoleKey] = useState('');
    
    // --- REAL-TIME FIRESTORE LISTENERS ---
    useEffect(() => {
        if (!currentUser) return;

        const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
            const resList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setReservationsData(resList);
        }, (error) => console.error('Failed to load reservations:', error));

        const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setUsersData(usersList);
        }, (error) => console.error('Failed to load users:', error));

        return () => {
            unsubRes();
            unsubUsers();
        };
    }, [currentUser]);

    // --- FETCH CURRENT USER ROLE ---
    useEffect(() => {
        const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
            setCurrentUser(user);
            setIsApprovalViewLoaded(false);
            setApprovalViewError('');
            if (!user) {
                setApproverRoleKey('');
                setApprovalView('all');
                setIsApprovalViewLoaded(true);
                return;
            }

            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const rawRole = userData.role || 'user';
                    const normalizedRole = normalizeApprovalRoleKey(rawRole);
                    setApproverRoleKey(isSuperAdmin ? 'super admin' : normalizedRole);
                    if (canFilterApprovalView) {
                        setApprovalView(userData.approvalView === 'current' ? 'current' : 'all');
                    } else {
                        setApprovalView('all');
                    }
                }
            } catch (err) {
                console.error('Failed to fetch approver data and approval view:', err);
                setApprovalViewError('Unable to load your saved approval view.');
            } finally {
                setIsApprovalViewLoaded(true);
            }
        });
        return () => unsubscribeAuth();
    }, [currentUserRole, isSuperAdmin, canFilterApprovalView]);

    const handleApprovalViewChange = async (event) => {
        const nextView = event.target.value;
        if (!currentUser || !canFilterApprovalView || !['all', 'current'].includes(nextView)) return;

        setIsSavingApprovalView(true);
        setApprovalViewError('');
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { approvalView: nextView });
            setApprovalView(nextView);
        } catch (error) {
            console.error('Failed to save approval view:', error);
            setApprovalViewError('Unable to save your approval view. Please try again.');
        } finally {
            setIsSavingApprovalView(false);
        }
    };

    // --- GET CURRENT LOGGED-IN USER NAME ---
    const currentUserDoc = usersData.find(u => u.id === currentUser?.uid || u.email === currentUser?.email) || {};
    const currentUserName = formatName(currentUserDoc.name || '');

    const confirmCancellation = async () => {
        if (!reservationToCancel || !currentUser || !canCancelReservations) return;
        const remark = cancellationRemark.trim();
        if (!remark) {
            setCancellationError('A cancellation remark is required.');
            return;
        }

        setIsCancelling(true);
        setCancellationError('');
        try {
            const cancelledAt = new Date().toISOString();
            const cancellationLog = {
                id: `cancelled-${Date.now()}`,
                role: currentUserRole,
                badge: 'Cancelled',
                date: cancelledAt,
                approverName: currentUserDoc.name
                    ? currentUserName
                    : currentUser.email || 'Administrator',
                text: remark,
                state: 'cancelled'
            };
            await archiveReservation(reservationToCancel.id, {
                ...reservationToCancel.fullData,
                status: 'Cancelled',
                cancellationRemark: remark,
                cancelledAt,
                cancelledBy: currentUser.uid,
                cancelledByEmail: currentUser.email || '',
                historyLogs: [
                    ...(Array.isArray(reservationToCancel.fullData.historyLogs)
                        ? reservationToCancel.fullData.historyLogs
                        : []),
                    cancellationLog
                ]
            });
            setReservationToCancel(null);
            setCancellationRemark('');
        } catch (error) {
            console.error('Error cancelling reservation:', error);
            setCancellationError('The reservation could not be cancelled and moved to history. Please try again.');
        } finally {
            setIsCancelling(false);
        }
    };

    // --- MAP & JOIN DATA ---
    const approvalData = reservationsData.map((res) => {
        const requestor = usersData.find(u => u.email === res.userEmail || u.uid === res.userId) || {};
        
        let submitDate = 'Unknown';
        if (res.createdAt) {
            const d = new Date(res.createdAt);
            submitDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        let equipCount = 0;
        if (res.selectedEquip) {
            equipCount = Object.values(res.selectedEquip).filter(val => Number(val) > 0).length;
        }
        const facCount = (res.facilities || []).length;
        let reqSubtext = '';
        if (facCount > 0 || equipCount > 0) reqSubtext = `${facCount} Facility, ${equipCount} Equipment`;
        else reqSubtext = 'No items requested';

        let displayRole = 'Requestor';
        if (requestor.role) {
            displayRole = requestor.role.replace(/_/g, ' ').toUpperCase();
        }

        const cleanName = formatName(requestor.name || res.fullName);
        const reqRole = (requestor.role || res.userRole || 'requestor').toLowerCase().trim();
        const isStaffRequestor = reqRole !== 'requestor' && reqRole !== 'user';
        const isRoomCheckerRequestor = normalizeApprovalRoleKey(reqRole) === 'room checker';
        const stepContext = {
            hasEndorser: Boolean(res.endorserName),
            isStaffRequestor,
            isRoomCheckerRequestor,
            hasSpecificRoom: Boolean(res.specificRoom?.trim())
        };

        // --- DETERMINE USER NOTIFICATION STATUS ---
        const determineUserStatus = () => {
            if (!approverRoleKey) return null;
            
            const myRecord = res.approvals?.[approverRoleKey];
            if (!canOverrideApprovalWorkflow && myRecord?.status === 'approved') return 'approved';
            if (!canOverrideApprovalWorkflow && myRecord?.status === 'rejected') return 'rejected';

            if (['rejected', 'approved', 'to modify'].includes((res.status || '').toLowerCase().trim())) return null;
            if (canOverrideApprovalWorkflow) return 'your-turn';

            // Endorser specific check: matches the endorser name set up on the reservation, and must NOT be a staff requestor
            if (approverRoleKey === 'endorser') {
                if (isStaffRequestor) return null;
                if (!res.endorserName) return null;
                const cleanEndorserName = formatName(res.endorserName);
                if (cleanEndorserName.toLowerCase() !== currentUserName.toLowerCase()) {
                    return null;
                }
                return 'your-turn';
            }

            if (isApprovalStepReady(res.approvals, approverRoleKey, stepContext)) return 'your-turn';
            return null;
        };

        const isCurrentApproval = canOverrideApprovalWorkflow && (
            normalizedCurrentUserRole === 'super admin'
                ? getApprovalTrackerSteps({
                    approvals: res.approvals,
                    dateSubmitted: submitDate,
                    ...stepContext,
                    reservationStatus: res.status
                }).some((step) => step.state === 'pending')
                : !['approved', 'rejected'].includes(
                    res.approvals?.[normalizedCurrentUserRole]?.status?.toLowerCase()
                ) && isApprovalStepReady(res.approvals, normalizedCurrentUserRole, stepContext)
        );

        return {
            id: res.id,
            refNo: String(res.refNo || ''),
            event: res.eventName || 'Untitled Event',
            equip: reqSubtext,
            submit: submitDate,
            name: cleanName,
            role: displayRole,
            avatarUrl: requestor.avatarUrl || null,
            initial: cleanName.charAt(0).toUpperCase(),
            date: res.eventDate || 'No Date',
            time: `${res.startTime || ''} - ${res.endTime || ''}`,
            status: res.status || 'Pending',
            userActionStatus: determineUserStatus(),
            isCurrentApproval,
            rawDate: res.createdAt ? new Date(res.createdAt) : new Date(0),
            fullData: res 
        };
    }).filter(req => req.userActionStatus === 'your-turn')
      .sort((a, b) => b.rawDate - a.rawDate); 

    // --- SEARCH & FILTER LOGIC ---
    const requestsForView = canFilterApprovalView && approvalView === 'current'
        ? approvalData.filter((request) => request.isCurrentApproval)
        : approvalData;
    const pendingCount = requestsForView.length;
    const filteredRequests = requestsForView.filter((request) =>
        request.event.toLowerCase().includes(search.toLowerCase()) ||
        request.name.toLowerCase().includes(search.toLowerCase()) ||
        request.role.toLowerCase().includes(search.toLowerCase()) ||
        request.refNo.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="approval">
            <div className="approval-header">
                <div className="header-title">
                    <h1>Approval Overview</h1>
                </div>
            </div>

            <div className="approval-summary">
                <div className="summary-card">
                    <div className="summary-icon pending">◷</div>
                    <div className="summary-info">
                        <span>Pending</span>
                        <strong>{pendingCount}</strong>
                    </div>
                </div>
            </div>

            <div className="requests-container">
                <div className="requests-header">
                    <div className="requests-title">
                        <h2>Pending Request</h2>
                        <div className="approval-status-legend" aria-label="Reservation status legend">
                            <span><i className="status-legend-dot pending" /> Pending</span>
                            <span><i className="status-legend-dot approved" /> Approved</span>
                        </div>
                    </div>

                    <div className={`request-tools ${canFilterApprovalView ? 'has-approval-filter' : ''}`}>
                        <div className="search-field">
                            <span className="search-icon" aria-hidden="true">⌕</span>
                            <input
                                type="text"
                                placeholder="Search requests or reference no..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </div>
                        {canFilterApprovalView && (
                            <select
                                className="approval-view-select"
                                aria-label="Filter approval requests"
                                value={approvalView}
                                onChange={handleApprovalViewChange}
                                disabled={!isApprovalViewLoaded || isSavingApprovalView}
                            >
                                <option value="all">All Approval</option>
                                <option value="current">Current Approval</option>
                            </select>
                        )}
                    </div>
                    {approvalViewError && (
                        <p className="approval-view-error" role="alert">{approvalViewError}</p>
                    )}
                </div>

                <div className="request-table">
                    <div className="table-scroll-content">
                        <div className="table-head">
                            <span>EVENT NAME</span>
                            <span>REQUESTOR</span>
                            <span>DATE</span>
                            <span>ACTION</span>
                        </div>

                        {filteredRequests.length > 0 ? (
                            filteredRequests.map((request) => (
                                <div className="request-row" key={request.id}>
                                    
                                    <div className="event-info">
                                        <div className="event-text">
                                            <strong>
                                                {request.event}
                                                {request.userActionStatus === 'your-turn' && <span className="status-dot pending" title="Your Turn to Approve"></span>}
                                            </strong>
                                            <p>Submitted {request.submit} · {request.equip}</p>
                                        </div>
                                    </div>

                                    <div className="requestor-info">
                                        {request.avatarUrl ? (
                                            <img src={request.avatarUrl} alt="Avatar" className="avatar avatar-img" />
                                        ) : (
                                            <div className="avatar">{request.initial}</div>
                                        )}
                                        <div className="requestor-text">
                                            <strong>{request.name}</strong>
                                            <p>{request.role}</p>
                                        </div>
                                    </div>

                                    <div className="date-info">
                                        <strong>{request.date}</strong>
                                        <p>{request.time}</p>
                                    </div>

                                    <div className="request-actions">
                                        <button
                                            type="button"
                                            className="details-btn"
                                            onClick={() => setSelectedRequest(request)}
                                        >
                                            <i className="ph ph-eye"></i> View Details
                                        </button>
                                        {canCancelReservations && (
                                            <button
                                                type="button"
                                                className="approval-cancel-btn"
                                                onClick={() => {
                                                    setReservationToCancel(request);
                                                    setCancellationRemark('');
                                                    setCancellationError('');
                                                }}
                                                title="Cancel Reservation"
                                                aria-label={`Cancel reservation for ${request.event}`}
                                            >
                                                <i className="ph ph-x"></i>
                                            </button>
                                        )}
                                    </div>
                                    
                                </div>
                            ))
                        ) : (
                            <div className="empty-state">
                                No matching requests found.
                            </div>
                        )}

                    </div>
                </div>

                <div className="table-footer">
                    <span>
                        Showing all {filteredRequests.length} requests
                    </span>
                </div>
            </div>

            {selectedRequest && (
                <div className="modal-overlay"> 
                    <div className="modal-wrapper">
                        <button
                            type="button"
                            className="close-modal-btn"
                            onClick={() => setSelectedRequest(null)}
                            aria-label="Close"
                        >
                            ✕
                        </button>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <PendingRequest data={selectedRequest.fullData} isSuperAdmin={isSuperAdmin} />
                        </div>
                    </div>
                </div>
            )}

            {reservationToCancel && (
                <div className="approval-cancel-overlay">
                    <div
                        className="approval-cancel-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="approval-cancel-title"
                    >
                        <h3 id="approval-cancel-title">Confirm Cancelation</h3>
                        <p>
                            Add a remark to cancel the reservation for{' '}
                            <strong>{reservationToCancel.event}</strong>. It will be marked cancelled,
                            moved to history, and removed from the active schedule.
                        </p>
                        <label className="approval-cancellation-remark">
                            <span>Cancellation remark <strong>*</strong></span>
                            <textarea
                                value={cancellationRemark}
                                onChange={(event) => {
                                    setCancellationRemark(event.target.value.slice(0, 1000));
                                    if (event.target.value.trim()) setCancellationError('');
                                }}
                                placeholder="Explain why this reservation is being cancelled..."
                                rows={4}
                                maxLength={1000}
                                required
                                disabled={isCancelling}
                            />
                        </label>
                        {cancellationError && (
                            <p className="approval-cancellation-error" role="alert">
                                {cancellationError}
                            </p>
                        )}
                        <div className="approval-cancel-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    setReservationToCancel(null);
                                    setCancellationRemark('');
                                    setCancellationError('');
                                }}
                                disabled={isCancelling}
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={confirmCancellation}
                                disabled={isCancelling || !cancellationRemark.trim()}
                            >
                                {isCancelling ? 'Removing...' : 'Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Approval;