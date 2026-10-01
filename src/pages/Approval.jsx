import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import "../styles/Approval.scss";
import PendingRequest from './PendingRequest';

// --- NAME FORMATTER HELPER ---
// Converts "LastName, FirstName MiddleName (Student)" to "FirstName MiddleName LastName"
const formatName = (fullName) => {
    if (!fullName) return 'Unknown User';
    let name = fullName.replace(/\s*\(Student\)/i, '').trim();
    if (name.includes(',')) {
        const parts = name.split(',');
        name = `${parts[1].trim()} ${parts[0].trim()}`;
    }
    return name;
};

const Approval = () => {
    // --- STATE MANAGEMENT ---
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [reservationsData, setReservationsData] = useState([]);
    const [usersData, setUsersData] = useState([]);
    const [approverRoleKey, setApproverRoleKey] = useState('');
    
    const itemsPerPage = 5;

    // --- REAL-TIME FIRESTORE LISTENERS ---
    useEffect(() => {
        // Listen to all reservations
        const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
            const resList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setReservationsData(resList);
        }, (error) => console.error('Failed to load reservations:', error));

        // Listen to all users
        const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setUsersData(usersList);
        }, (error) => console.error('Failed to load users:', error));

        return () => {
            unsubRes();
            unsubUsers();
        };
    }, []);

    // --- FETCH CURRENT USER ROLE ---
    useEffect(() => {
        const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        const rawRole = userData.role || 'user';
                        setApproverRoleKey(rawRole.toLowerCase().trim());
                    }
                } catch (err) {
                    console.error("Failed to fetch approver data", err);
                }
            }
        });
        return () => unsubscribeAuth();
    }, []);

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

        // --- DETERMINE USER NOTIFICATION STATUS ---
        const determineUserStatus = () => {
            if (!approverRoleKey) return null;
            
            // Check if current user already acted
            const myRecord = res.approvals?.[approverRoleKey];
            if (myRecord?.status === 'approved') return 'approved';
            if (myRecord?.status === 'rejected') return 'rejected';

            // If overall is completed, no pending action needed
            if (res.status === 'Rejected' || res.status === 'Approved') return null;

            const roleHierarchy = ['requestor', 'endorser', 'building admin', 'osa', 'mis', 'academic head', 'school admin'];
            const myIndex = roleHierarchy.indexOf(approverRoleKey);
            if (myIndex <= 0) return null;

            const reqRole = (requestor.role || 'requestor').toLowerCase().trim();
            const isStaffRequestor = reqRole !== 'requestor' && reqRole !== 'user';
            const hasEndorser = !!res.endorserName;

            // FIX: If current user is an endorser and it's a staff/endorser requestor, skip endorser step
            if (approverRoleKey === 'endorser' && isStaffRequestor) return null;

            const prevStepKey = roleHierarchy[myIndex - 1];
            let prevIsApproved = false;

            if (prevStepKey === 'requestor') {
                prevIsApproved = true;
            } else if (prevStepKey === 'endorser') {
                if (isStaffRequestor || !hasEndorser) {
                    prevIsApproved = true;
                } else {
                    prevIsApproved = res.approvals?.['endorser']?.status === 'approved';
                }
            } else {
                prevIsApproved = res.approvals?.[prevStepKey]?.status === 'approved';
            }

            if (prevIsApproved) return 'your-turn';
            return null;
        };

        return {
            id: res.id,
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
            rawDate: res.createdAt ? new Date(res.createdAt) : new Date(0),
            fullData: res 
        };
    }).sort((a, b) => b.rawDate - a.rawDate); 

    // --- COUNTS FOR SUMMARY CARDS (Based purely on User's Individual Action) ---
    const pendingCount = approvalData.filter((req) => req.userActionStatus === 'your-turn').length;
    const approvedCount = approvalData.filter((req) => req.userActionStatus === 'approved').length;
    const rejectedCount = approvalData.filter((req) => req.userActionStatus === 'rejected').length;

    // --- SEARCH & FILTER LOGIC ---
    const handleSearch = (e) => {
        setSearch(e.target.value);
        setCurrentPage(1);
    };

    const filteredRequests = approvalData.filter((request) =>
        request.event.toLowerCase().includes(search.toLowerCase()) ||
        request.name.toLowerCase().includes(search.toLowerCase()) ||
        request.role.toLowerCase().includes(search.toLowerCase())
    );

    // --- PAGINATION LOGIC ---
    const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredRequests.slice(indexOfFirstItem, indexOfLastItem);

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

                <div className="summary-card">
                    <div className="summary-icon approved">✓</div>
                    <div className="summary-info">
                        <span>Approved</span>
                        <strong>{approvedCount}</strong>
                    </div>
                </div>

                <div className="summary-card">
                    <div className="summary-icon rejected">×</div>
                    <div className="summary-info">
                        <span>Rejected</span>
                        <strong>{rejectedCount}</strong>
                    </div>
                </div>
            </div>

            <div className="requests-container">
                <div className="requests-header">
                    <div className="requests-title">
                        <h2>Pending Request</h2>
                        <p>Review and manage facility reservation requests.</p>
                    </div>

                    <div className="request-tools">
                        <div className="search-field">
                            <span className="search-icon" aria-hidden="true">⌕</span>
                            <input
                                type="text"
                                placeholder="Search requests..."
                                value={search}
                                onChange={handleSearch}
                            />
                        </div>
                    </div>
                </div>

                <div className="request-table">
                    <div className="table-scroll-content">
                        <div className="table-head">
                            <span>EVENT NAME</span>
                            <span>REQUESTOR</span>
                            <span>DATE</span>
                            <span>ACTION</span>
                        </div>

                        {currentItems.length > 0 ? (
                            currentItems.map((request) => (
                                <div className="request-row" key={request.id}>
                                    
                                    <div className="event-info">
                                        <div className="event-text">
                                            <strong>
                                                {request.event}
                                                {request.userActionStatus === 'your-turn' && <span className="status-dot pending" title="Your Turn to Approve"></span>}
                                                {request.userActionStatus === 'approved' && <span className="status-dot approved" title="You Approved"></span>}
                                                {request.userActionStatus === 'rejected' && <span className="status-dot rejected" title="You Rejected"></span>}
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
                        Showing {filteredRequests.length === 0 ? 0 : indexOfFirstItem + 1} to{' '}
                        {Math.min(indexOfLastItem, filteredRequests.length)} of {filteredRequests.length} requests
                    </span>

                    <div className="pagination">
                        <button
                            type="button"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((prev) => prev - 1)}
                        >
                            Prev
                        </button>

                        {Array.from({ length: totalPages }, (_, index) => (
                            <button
                                type="button"
                                key={index + 1}
                                className={currentPage === index + 1 ? 'active' : ''}
                                onClick={() => setCurrentPage(index + 1)}
                            >
                                {index + 1}
                            </button>
                        ))}

                        <button
                            type="button"
                            disabled={currentPage === totalPages || filteredRequests.length === 0}
                            onClick={() => setCurrentPage((prev) => prev + 1)}
                        >
                            Next
                        </button>
                    </div>
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
                            <PendingRequest data={selectedRequest.fullData} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Approval;