import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, onSnapshot, updateDoc, setDoc, arrayUnion, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { sendReservationEmail } from '../services/emailService'; 
import { getApprovalTrackerSteps, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
import '../styles/PendingRequest.scss';

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

// --- EVENT DATE RANGE FORMATTER HELPER ---
const formatEventDateRange = (startDateStr, numDays) => {
  if (!startDateStr) return 'N/A';
  let parts = startDateStr.split(/[\/\-]/);
  if (parts.length !== 3) return startDateStr;
  const [m, d, y] = parts.map(Number);
  const startFormatted = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${y}`;
  
  const daysCount = Number(numDays) || 1;
  if (daysCount <= 1) return startFormatted;

  const current = new Date(y, m - 1, d);
  current.setDate(current.getDate() + (daysCount - 1));
  const mm = String(current.getMonth() + 1).padStart(2, '0');
  const dd = String(current.getDate()).padStart(2, '0');
  const yy = current.getFullYear();
  const endFormatted = `${mm}-${dd}-${yy}`;

  return `${startFormatted} - ${endFormatted}`;
};

const PendingRequest = ({ data, isSuperAdmin = false }) => {
  // Live sync state for this specific reservation document
  const [currentData, setCurrentData] = useState(data);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [requestorRole, setRequestorRole] = useState('requestor');
  
  // States for processing & modals
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAlert, setCustomAlert] = useState(null); 
  const [pendingAction, setPendingAction] = useState(null);
  const [actionRemarkError, setActionRemarkError] = useState('');
  
  const [currentUser, setCurrentUser] = useState(null);

  // State for the currently logged-in user (Approver)
  const [approver, setApprover] = useState({
    name: 'Loading...',
    role: '...',
    roleKey: '', 
    avatarUrl: '',
    initials: ''
  });

  // Real-time listener for this specific reservation doc so changes reflect instantly
  useEffect(() => {
  if (!currentUser || !data?.id) return; // Added safeguard
  const unsubscribe = onSnapshot(doc(db, 'reservations', data.id), (docSnap) => {
    if (docSnap.exists()) {
      setCurrentData({ id: docSnap.id, ...docSnap.data() });
    }
  });
  return () => unsubscribe();
}, [currentUser, data?.id]); // Added dependency

  // Fetch requestor's actual role to determine if endorser should be skipped
  useEffect(() => {
    const fetchRequestorRole = async () => {
      if (!currentData) return;
      try {
        let userDoc = null;
        if (currentData.userId) {
          const docRef = doc(db, 'users', currentData.userId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            userDoc = docSnap.data();
          }
        }
        if (!userDoc && currentData.userEmail) {
          const q = query(collection(db, 'users'), where('email', '==', currentData.userEmail));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            userDoc = querySnap.docs[0].data();
          }
        }
        if (userDoc && userDoc.role) {
          setRequestorRole(userDoc.role.toLowerCase().trim());
        }
      } catch (err) {
        console.error("Error fetching requestor role:", err);
      }
    };
    fetchRequestorRole();
  }, [currentData]);

  // 1. Fetch current logged-in user for "Approving as" box
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user); // Added
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            
            const cleanName = formatName(userData.name);
            const rawRole = userData.role || 'user';
            
            let displayRole = isSuperAdmin ? 'super admin' : rawRole.replace(/_/g, ' ').toLowerCase().trim();
            if (displayRole === 'mis' || displayRole === 'osa') {
              displayRole = displayRole.toUpperCase();
            } else {
              displayRole = displayRole.replace(/\b\w/g, l => l.toUpperCase());
            }

            setApprover({
              name: cleanName,
              role: displayRole,
              roleKey: isSuperAdmin ? 'super admin' : normalizeApprovalRoleKey(rawRole),
              avatarUrl: userData.avatarUrl || '',
              initials: cleanName.charAt(0).toUpperCase()
            });
          }
        } catch (err) {
          console.error("Failed to fetch approver data", err);
        }
      }
    });
    return () => unsubscribeAuth();
  }, [isSuperAdmin]);
  // 2. Fetch facilities and equipments mapping
  useEffect(() => {
    if (!currentUser) return; // Added safeguard
    const unsubFac = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const fMap = {};
      snapshot.forEach(doc => { fMap[doc.id] = doc.data(); });
      setFacilitiesMap(fMap);
    });

    const unsubEq = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const eMap = {};
      snapshot.forEach(doc => { eMap[doc.id] = doc.data(); });
      setEquipmentMap(eMap);
    });

    return () => { unsubFac(); unsubEq(); };
  }, [currentUser]); // Added dependency

  if (!currentData) return <div className="loading-container">Loading request details...</div>;

  // --- DYNAMIC DATA MAPPING ---
  const refNo = currentData.refNo || 'N/A';
  const eventName = currentData.eventName || 'Untitled Event';
  const eventType = Array.isArray(currentData.eventType) ? currentData.eventType.join(', ') : (currentData.eventType || 'N/A');
  const eventDate = formatEventDateRange(currentData.eventDate, currentData.days);
  const eventTime = `${currentData.startTime || ''} – ${currentData.endTime || ''}`;
  const expectedAttendees = currentData.expectedParticipants ? `${currentData.expectedParticipants} attendees` : 'N/A';
  const description = currentData.purpose || 'No description provided.';
  
  const facilityNames = (currentData.facilities || []).map(id => facilitiesMap[id]?.name || id);
  const facilityDisplay = facilityNames.length > 0 ? facilityNames.join(', ') : 'None';
  
  const roomCapacities = (currentData.facilities || []).map((id) => {
    const facility = facilitiesMap[id];
    if (!facility) return null;
    const minCapacity = Number(facility.minCapacity) || null;
    const maxCapacity = facility.maxCapacity !== undefined
      ? Number(facility.maxCapacity) || null
      : Number(facility.capacity) || null;
    if (minCapacity && maxCapacity) return `${minCapacity}–${maxCapacity}`;
    if (minCapacity) return `${minCapacity}+`;
    if (maxCapacity) return `Up to ${maxCapacity}`;
    return null;
  }).filter(Boolean);
  const capacityDisplay = roomCapacities.length > 0 ? roomCapacities.join(', ') + ' people' : 'N/A';

  const floorLocations = (currentData.facilities || []).map(id => facilitiesMap[id]?.location).filter(Boolean);
  const locationDisplay = currentData.specificRoom 
    ? currentData.specificRoom
    : (floorLocations.length > 0 ? floorLocations.join(' | ') : 'N/A');

  const equipArray = Object.entries(currentData.selectedEquip || {})
    .filter(([id, qty]) => Number(qty) > 0)
    .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
  if (typeof currentData.otherEquipment === 'string' && currentData.otherEquipment.trim()) {
    equipArray.push(currentData.otherEquipment.trim());
  }
  const equipmentRequested = equipArray.length > 0 ? equipArray.join(', ') : 'None';

  const requestorName = formatName(currentData.fullName);
  const contactNumber = currentData.contactNumber || 'N/A';
  const email = currentData.emailAddress || currentData.userEmail || 'N/A';
  
  let dateSubmitted = 'Unknown';
  if (currentData.createdAt) {
    dateSubmitted = new Date(currentData.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const hasEndorser = !!currentData.endorserName;
  const endorserName = currentData.endorserName ? formatName(currentData.endorserName) : 'N/A';
  const endorserDesignation = currentData.endorserDesignation || 'N/A';
  const endorserEmail = currentData.endorserEmail || 'N/A';
  const endorsedBy = currentData.endorserName ? `${endorserName} (${currentData.endorserDesignation})` : 'N/A';

  const isStaffRequestor = requestorRole && requestorRole !== 'requestor' && requestorRole !== 'user';
  const isRoomCheckerRequestor = normalizeApprovalRoleKey(requestorRole) === 'room checker'
    || normalizeApprovalRoleKey(currentData.userRole) === 'room checker';

  // --- HIERARCHY & TRACKER LOGIC ---
  const trackerSteps = getApprovalTrackerSteps({
    approvals: currentData.approvals,
    dateSubmitted,
    hasEndorser,
    isStaffRequestor,
    isRoomCheckerRequestor,
    hasSpecificRoom: Boolean(currentData.specificRoom?.trim()),
    activeRoleKey: approver.roleKey,
    reservationStatus: currentData.status
  });

  const nextSuperAdminStep = isSuperAdmin
    ? trackerSteps.find((step) => (
      step.key !== 'requestor'
      && step.state !== 'approved'
      && step.state !== 'rejected'
    ))
    : null;
  const approvalRoleKey = isSuperAdmin ? nextSuperAdminStep?.key : approver.roleKey;
  const approvalRoleLabel = isSuperAdmin && nextSuperAdminStep
    ? `${nextSuperAdminStep.label} (Super Admin)`
    : approver.role;
  const myStep = trackerSteps.find((step) => step.key === approver.roleKey);
  const canAct = (currentData.status || '').toLowerCase() === 'pending'
    && (isSuperAdmin
      ? Boolean(nextSuperAdminStep)
      : !currentData.approvals?.[approver.roleKey] && myStep?.state === 'your-turn');

  const myApprovalStatus = isSuperAdmin
    ? null
    : currentData.approvals?.[approver.roleKey]?.status;

  const baseHistory = [{
    role: 'Requestor',
    badge: 'Submitted',
    date: dateSubmitted,
    approverName: requestorName,
    text: `Reservation request submitted for ${eventName}.`,
    state: 'approved'
  }];
  const dbHistoryLogs = currentData.historyLogs || [];
  const fullHistory = [...baseHistory, ...dbHistoryLogs];

  // --- ACTION HANDLERS ---
  const requestActionConfirmation = (actionType) => {
    if (['rejected', 'to_modify'].includes(actionType) && !remarks.trim()) {
      setActionRemarkError('Enter a remark above before continuing.');
      return;
    }
    setActionRemarkError('');
    setPendingAction(actionType);
  };

  const handleAction = async (actionType) => {
    const remark = remarks.trim();
    if (['rejected', 'to_modify'].includes(actionType) && !remark) {
      setActionRemarkError('Enter a remark above before continuing.');
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    setActionRemarkError('');
    if (!canAct || isProcessing) return;
    setIsProcessing(true);

    try {
      const now = new Date();
      const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dateTimeString = `${dateString} at ${timeString}`;

      const isApprove = actionType === 'approved';
      const isReject = actionType === 'rejected';
      const isToModify = actionType === 'to_modify';
      
      const newLog = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        role: approvalRoleLabel,
        badge: isApprove ? 'Approved' : isReject ? 'Rejected' : 'To Modify',
        date: dateTimeString,
        approverName: approver.name,
        text: remark || 'Approved reservation request without remarks.',
        state: isApprove ? 'approved' : isReject ? 'rejected' : 'to_modify'
      };

      const updatePayload = { historyLogs: arrayUnion(newLog) };
      const currentApprovalRecord = currentData.approvals?.[approvalRoleKey];
      const archivedApprovals = {
        ...currentData.approvals,
        [approvalRoleKey]: {
          ...(currentApprovalRecord && typeof currentApprovalRecord === 'object'
            ? currentApprovalRecord
            : {}),
          status: isApprove ? 'approved' : 'rejected',
          date: dateString
        }
      };

      if (isToModify) {
        updatePayload.status = 'To Modify';
        updatePayload.modificationRemark = remark;
        updatePayload.modificationRequestedBy = approver.name;
        updatePayload.modificationRequestedAt = dateTimeString;
      } else {
        updatePayload[`approvals.${approvalRoleKey}.status`] = isApprove ? 'approved' : 'rejected';
        updatePayload[`approvals.${approvalRoleKey}.date`] = dateString;
      }

      if (isReject) {
        updatePayload.status = 'Rejected';
      } else if (isApprove && approvalRoleKey === 'school admin') {
        updatePayload.status = 'Approved';
      }

      if (isApprove || isToModify) {
        await updateDoc(doc(db, 'reservations', currentData.id), updatePayload);
      } else {
        const batch = writeBatch(db);
        batch.update(doc(db, 'reservations', currentData.id), updatePayload);
        const cleanHistoryData = { ...currentData };
        delete cleanHistoryData.id;
        batch.set(doc(db, 'archive', currentData.id), {
          ...cleanHistoryData,
          approvals: archivedApprovals,
          historyLogs: [...(currentData.historyLogs || []), newLog],
          status: 'Rejected',
          rejectionRemark: remarks.trim()
        }, { merge: true });
        await batch.commit();
      }

      // --- AUTO-SYNC TO HISTORY COLLECTION UPON SCHOOL ADMIN APPROVAL ---
      if (isApprove && approvalRoleKey === 'school admin') {
        try {
          const updatedResData = {
            ...currentData,
            status: 'Approved',
            approvals: archivedApprovals,
            historyLogs: [...(currentData.historyLogs || []), newLog]
          };
          const { id, ...cleanHistoryData } = updatedResData;

          await setDoc(doc(db, 'archive', currentData.id), cleanHistoryData, { merge: true });
        } catch (historyErr) {
          console.error('Failed to back up approved reservation to archive:', historyErr);
        }
      }
      // -----------------------------------------------------------------

      // --- SEND EMAIL NOTIFICATION ---
      const emailMessage = isApprove 
        ? `Your reservation has been approved by the ${approvalRoleLabel}.`
        : isReject
          ? `Your reservation has been rejected by the ${approvalRoleLabel}. Remarks: ${remark}`
          : `Your reservation has been returned for modification by the ${approvalRoleLabel}. Please review the remarks: ${remark}`;

      await sendReservationEmail(
        email, 
        requestorName, 
        currentData, 
        emailMessage
      );
      // -------------------------------

      setRemarks(''); 
    } catch (err) {
      console.error("Error updating reservation:", err);
      setCustomAlert({
        title: 'Error',
        message: 'Failed to process the reservation update.',
        isSuccess: false
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const normalizedReservationStatus = (currentData.status || '').toLowerCase().trim();
  const bannerStatusClass = normalizedReservationStatus === 'approved'
    ? 'approved'
    : normalizedReservationStatus === 'rejected' ? 'rejected' : 'pending';

  return (
    <div className="mis-reservation-details-content">
      {/* Top Banner */}
      <div className={`top-banner ${bannerStatusClass}`}>
        <div className="banner-info">
          <span className="icon">🛡</span>
          <div>
            <strong>
              Reservation {normalizedReservationStatus === 'rejected'
                ? 'Rejected'
                : normalizedReservationStatus === 'approved'
                  ? 'Approved'
                  : normalizedReservationStatus === 'to modify'
                    ? 'Returned for Modification'
                    : 'Pending for Approval'}
            </strong>
            <p>This reservation is currently {canAct || myApprovalStatus ? `waiting on your decision as ${approver.role}` : `processing through the approval pipeline.`}</p>
          </div>
        </div>
        <span className="banner-badge">Status: {currentData.status || 'Pending'}</span>
      </div>

      {/* Main Grid */}
      <div className="main-content-grid">
        <div className="details-col">
          {/* Card 1: Event Information */}
          <div className="card">
            <h3><span className="card-icon">📋</span> Event Information</h3>
            <div className="info-grid">
              <div>
                <label>EVENT NAME</label>
                <div className="val font-bold">{eventName}</div>
              </div>
              <div>
                <label>EVENT TYPE</label>
                <div className="val font-bold">{eventType}</div>
              </div>
              <div>
                <label>EVENT DATE</label>
                <div className="val">{eventDate}</div>
              </div>
              <div>
                <label>TIME</label>
                <div className="val">{eventTime}</div>
              </div>
              <div>
                <label>EXPECTED ATTENDEES</label>
                <div className="val">{expectedAttendees}</div>
              </div>
            </div>
            <div className="full-width-field">
              <label>EVENT DESCRIPTION / PURPOSE</label>
              <div className="val desc-text">{description}</div>
            </div>
          </div>

          {/* Card 2: Facility Details */}
          <div className="card">
            <h3><span className="card-icon">🏢</span> Facility Details</h3>
            <div className="info-grid">
              <div>
                <label>FACILITY NAME</label>
                <div className="val font-bold">{facilityDisplay}</div>
              </div>
              <div>
                <label>ROOM CAPACITY</label>
                <div className="val">{capacityDisplay}</div>
              </div>
              <div>
                <label>FLOOR / LOCATION</label>
                <div className="val">{locationDisplay}</div>
              </div>
              <div>
                <label>AIRCON</label>
                <div className="val">
                  {currentData.aircon 
                    ? "ON" + ((currentData.airconOnTime || currentData.airconOffTime) ? ` (${currentData.airconOnTime || '?'} - ${currentData.airconOffTime || '?'})` : "") 
                    : "OFF"}
                </div>
              </div>
              <div className="equipment-grid-col">
                <label>EQUIPMENT REQUESTED</label>
                <div className="val">{equipmentRequested}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Requestor Information */}
          <div className="card">
            <h3><span className="card-icon">👤</span> Requestor Information</h3>
            <div className="info-grid">
              <div>
                <label>FULL NAME</label>
                <div className="val font-bold">{requestorName}</div>
              </div>
              <div>
                <label>CONTACT NUMBER</label>
                <div className="val">{contactNumber}</div>
              </div>
              <div>
                <label>EMAIL ADDRESS</label>
                <div className="val">{email}</div>
              </div>
              <div>
                <label>DATE SUBMITTED</label>
                <div className="val">{dateSubmitted}</div>
              </div>
            </div>
          </div>

          {/* Card 4: Endorser Information (Conditional) */}
          {hasEndorser && (
            <div className="card">
              <div className="endorser-header-row">
                <h3><span className="card-icon">🤵</span> Endorser Information</h3>
                <span className="endorser-badge">Student Role Only</span>
              </div>
              <div className="info-grid col-2">
                <div>
                  <label>ENDORSER'S FULL NAME</label>
                  <div className="val font-bold">{endorserName}</div>
                </div>
                <div>
                  <label>DESIGNATION</label>
                  <div className="val">{endorserDesignation}</div>
                </div>
                <div className="full-width-field endorser-full-width">
                  <label>CONTACT EMAIL</label>
                  <div className="val">{endorserEmail}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions and Summary */}
        <div className="sidebar-col">
          {/* Reservation Summary */}
          <div className="card">
            <h3>Reservation Summary</h3>
            <div className="summary-list">
              <div className="summary-item">
                <span className="label">Reference No.</span>
                <span className="val ref-no">{refNo}</span>
              </div>
              <div className="summary-item">
                <span className="label">Facility</span>
                <span className="val">{facilityDisplay}</span>
              </div>
              <div className="summary-item">
                <span className="label">Equipment</span>
                <span className="val">{equipmentRequested}</span>
              </div>
              <div className="summary-item">
                <span className="label">Event Date</span>
                <span className="val">{eventDate}</span>
              </div>
              <div className="summary-item">
                <span className="label">Duration</span>
                <span className="val">{eventTime}</span>
              </div>
              <div className="summary-item">
                <span className="label">Attendees</span>
                <span className="val">{expectedAttendees}</span>
              </div>
              
              {hasEndorser && (
                <div className="summary-item">
                  <span className="label">Endorsed By</span>
                  <span className="val">{endorsedBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Admin Approval Decision Card */}
          <div className="card">
            <div className="card-header-small">
              <h3>🛡️ {approver.role} Approval</h3>
              <p>Your administrative decision</p>
            </div>

            <div className="user-profile-box">
              <div className="user-details">
                {approver.avatarUrl ? (
                  <img src={approver.avatarUrl} alt="Avatar" className="avatar avatar-cover" />
                ) : (
                  <div className="avatar">{approver.initials}</div>
                )}
                <div>
                  <span className="sub-text">Approving as</span>
                  <strong>{approver.name}</strong>
                </div>
              </div>
              <span className="role-tag">{approver.role}</span>
            </div>

            <div className="form-group">
              <label htmlFor="approvalRemarks">
                REMARKS <span>(required for reject or modify)</span>
              </label>
              <textarea
                id="approvalRemarks"
                name="approvalRemarks"
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value);
                  if (e.target.value.trim()) setActionRemarkError('');
                }}
                placeholder={canAct ? "Add your administrative remarks or conditions here..." : "You can only add remarks when it is your turn to approve."}
                rows={3}
                disabled={!canAct || isProcessing || !!myApprovalStatus}
              />
              {actionRemarkError && <p className="action-remark-error" role="alert">{actionRemarkError}</p>}
            </div>

            <div className="action-buttons">
              {myApprovalStatus ? (
                <div className={`already-acted-msg ${myApprovalStatus}`}>
                  You have already {myApprovalStatus} this request.
                </div>
              ) : (
                <>
                  <button 
                    className="btn-approve"
                    onClick={() => requestActionConfirmation('approved')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✓ Approve Reservation'}
                  </button>
                  <button
                    className="btn-modify"
                    onClick={() => requestActionConfirmation('to_modify')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✎ To Modify Reservation'}
                  </button>
                  <button 
                    className="btn-reject" 
                    onClick={() => requestActionConfirmation('rejected')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✕ Reject Reservation'}
                  </button>
                </>
              )}
            </div>
            
            {!canAct && !myApprovalStatus && !['rejected', 'approved', 'to modify'].includes(normalizedReservationStatus) && (
              <div className="hierarchy-disabled-hint">
                {isSuperAdmin
                  ? 'The approval tracker is complete.'
                  : 'Buttons are disabled because it is not currently your turn in the approval hierarchy.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approval Tracker */}
      <div className="card tracker-card">
        <h3>📊 Approval Tracker</h3>

        <div className="pipeline-container">
          {trackerSteps.map((step, index) => (
            <div key={index} className={`pipeline-step ${step.state}`}>
              {index < trackerSteps.length - 1 && <div className="step-line" />}
              <div className="step-circle">
                {step.state === 'approved' ? '✓' : step.state === 'rejected' ? '✕' : step.state === 'your-turn' ? '🛡️' : index + 1}
              </div>
              <div className="step-title">{step.label}</div>
              <span className="step-status">{step.status}</span>
              <div className="step-date">{step.date}</div>
              <div className="step-sub">{step.sub}</div>
            </div>
          ))}
        </div>

        <div className="tracker-legend">
          <div className="legend-items">
            <span><span className="dot dot-approved">●</span> Approved</span>
            <span><span className="dot dot-yourturn">●</span> Your Turn</span>
            <span><span className="dot dot-rejected">●</span> Rejected</span>
            <span><span className="dot dot-queued">●</span> Queued</span>
          </div>
        </div>
      </div>

      {/* History Logs */}
      <div className="card history-card">
        <h3>📑 Approval History & Remarks</h3>

        <div className="history-list">
          {fullHistory.map((log, index) => {
            const badgeBg = log.state === 'approved' ? '#10b981' : log.state === 'rejected' ? '#ef4444' : '#3b82f6';
            const iconBg = log.state === 'approved' ? '#d1fae5' : log.state === 'rejected' ? '#fee2e2' : '#dbeafe';
            const iconColor = log.state === 'approved' ? '#047857' : log.state === 'rejected' ? '#ef4444' : '#1d4ed8';

            return (
              <div key={index} className={`history-item ${log.state}`}>
                <div className="history-icon" style={{ backgroundColor: iconBg, color: iconColor }}>
                  {log.state === 'approved' ? '✓' : log.state === 'rejected' ? '✕' : '🛡️'}
                </div>
                <div className="history-content">
                  <div className="history-header">
                    <strong>
                      {log.role}
                      {log.badge && <span className="action-badge" style={{ backgroundColor: badgeBg }}>{log.badge}</span>}
                    </strong>
                    <div className="history-meta-right">
                      <span className="history-date">{log.date}</span>
                      {log.approverName && <div className="history-approver-name">{log.approverName}</div>}
                    </div>
                  </div>
                  <p>{log.text}</p>
                </div>
              </div>
            );
          })}
          {fullHistory.length === 1 && currentData.status !== 'Rejected' && currentData.status !== 'Approved' && (
             <div className="history-item pending">
               <div className="history-icon">🛡️</div>
               <div className="history-content">
                 <div className="history-header">
                   <strong>
                     Pending Next Action
                     <span className="action-badge">Pending</span>
                   </strong>
                   <div className="history-meta-right">
                     <span className="history-date">Awaiting</span>
                   </div>
                 </div>
                 <p>Reviewing facility booking and awaiting next approval.</p>
               </div>
             </div>
          )}
        </div>
      </div>

      {/* --- ACTION CONFIRMATION MODAL --- */}
      {pendingAction && (
        <div className="modal-overlay high-z">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className={`modal-title ${pendingAction === 'approved' ? 'success' : 'error'}`}>
              Confirm {pendingAction === 'approved' ? 'Approval' : pendingAction === 'rejected' ? 'Rejection' : 'Return for Modification'}
            </h3>
            <p className="modal-message">
              {pendingAction === 'to_modify'
                ? 'This will return the reservation to the requestor for changes and notify them using the remark entered above.'
                : pendingAction === 'rejected'
                  ? 'This will reject the reservation and notify the requestor using the remark entered above.'
                  : 'This action will update the status and notify the requestor.'}
            </p>
            <div className="modal-actions">
              <button 
                onClick={() => {
                  setPendingAction(null);
                  setActionRemarkError('');
                }}
                className="modal-button cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction(pendingAction)}
                disabled={['rejected', 'to_modify'].includes(pendingAction) && !remarks.trim()}
                className={`modal-button ${pendingAction === 'approved'
                  ? 'confirm-approve-btn'
                  : pendingAction === 'to_modify' ? 'confirm-modify-btn' : 'confirm-reject-btn'}`}
              >
                {pendingAction === 'approved' ? 'Approve' : pendingAction === 'rejected' ? 'Reject' : 'To Modify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {customAlert && (
        <div className="modal-overlay alert-z">
          <div className="modal-card">
            <h3 className={customAlert.isSuccess ? 'modal-title success' : 'modal-title error'}>
              {customAlert.title}
            </h3>
            <p className="modal-message">
              {customAlert.message}
            </p>
            <div className="modal-actions">
              <button onClick={() => setCustomAlert(null)} className="modal-button understood-btn">
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PendingRequest;