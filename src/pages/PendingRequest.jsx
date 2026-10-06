import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, onSnapshot, updateDoc, setDoc, arrayUnion, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { sendReservationEmail } from '../services/emailService'; 
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

const PendingRequest = ({ data }) => {
  // Live sync state for this specific reservation document
  const [currentData, setCurrentData] = useState(data);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [requestorRole, setRequestorRole] = useState('requestor');
  
  // States for processing & modals
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customAlert, setCustomAlert] = useState(null); 
  const [pendingAction, setPendingAction] = useState(null); // 'approved' or 'rejected' for confirmation modal
  
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
    if (!data?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'reservations', data.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentData({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsubscribe();
  }, [data?.id]);

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
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            
            const cleanName = formatName(userData.name);
            const rawRole = userData.role || 'user';
            
            let displayRole = rawRole.replace(/_/g, ' ').toLowerCase().trim();
            if (displayRole === 'mis' || displayRole === 'osa') {
              displayRole = displayRole.toUpperCase();
            } else {
              displayRole = displayRole.replace(/\b\w/g, l => l.toUpperCase());
            }

            setApprover({
              name: cleanName,
              role: displayRole,
              roleKey: rawRole.toLowerCase().trim(),
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
  }, []);

  // 2. Fetch facilities and equipments mapping
  useEffect(() => {
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
  }, []);

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
  
  const roomCapacities = (currentData.facilities || []).map(id => facilitiesMap[id]?.capacity).filter(Boolean);
  const capacityDisplay = roomCapacities.length > 0 ? roomCapacities.join(', ') + ' seats' : 'N/A';

  const floorLocations = (currentData.facilities || []).map(id => facilitiesMap[id]?.location).filter(Boolean);
  const locationDisplay = currentData.specificRoom 
    ? `Room: ${currentData.specificRoom}` 
    : (floorLocations.length > 0 ? floorLocations.join(' | ') : 'N/A');

  const equipArray = Object.entries(currentData.selectedEquip || {})
    .filter(([id, qty]) => Number(qty) > 0)
    .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
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

  // --- HIERARCHY & TRACKER LOGIC ---
  const roleHierarchy = [
    { key: 'requestor', label: 'Requestor Submitted' },
    { key: 'endorser', label: 'Endorser' },
    { key: 'building admin', label: 'Building Admin' },
    { key: 'osa', label: 'OSA' },
    { key: 'mis', label: 'MIS' },
    { key: 'academic head', label: 'Academic Head' },
    { key: 'school admin', label: 'School Admin' }
  ];

  const trackerSteps = roleHierarchy.map((step, index) => {
    if (step.key === 'requestor') return { label: step.label, status: 'Completed', date: dateSubmitted, state: 'approved' };
    
    if (step.key === 'endorser') {
      if (isStaffRequestor) {
        return { label: step.label, status: 'Skipped', date: dateSubmitted, state: 'approved' };
      }
      if (!hasEndorser) {
        return { label: step.label, status: 'Skipped', date: '—', state: 'approved' };
      }
    }

    const approvalRecord = currentData.approvals?.[step.key];
    const isApproved = approvalRecord?.status === 'approved';
    const isRejected = approvalRecord?.status === 'rejected';
    const actionDate = approvalRecord?.date || 'Pending';

    let state = 'pending';
    let statusText = 'Pending';

    if (isApproved) {
      state = 'approved';
      statusText = 'Completed';
    } else if (isRejected) {
      state = 'rejected';
      statusText = 'Rejected';
    } else {
      const prevStepKey = roleHierarchy[index - 1].key;
      let prevIsApproved = false;

      if (prevStepKey === 'requestor') {
        prevIsApproved = true;
      } else if (prevStepKey === 'endorser') {
        if (isStaffRequestor || !hasEndorser) {
          prevIsApproved = true;
        } else {
          prevIsApproved = currentData.approvals?.['endorser']?.status === 'approved';
        }
      } else {
        prevIsApproved = currentData.approvals?.[prevStepKey]?.status === 'approved';
      }

      if (prevIsApproved && step.key === approver.roleKey && currentData.status !== 'Rejected') {
        state = 'your-turn';
        statusText = 'Your Turn';
      } else if (!prevIsApproved) {
        state = 'queued';
        statusText = 'Queued';
      }
    }

    return { label: step.label, status: statusText, date: isApproved || isRejected ? actionDate : 'Pending', state: state };
  });

  const myStepIndex = roleHierarchy.findIndex(s => s.key === approver.roleKey);
  const canAct = myStepIndex !== -1 && trackerSteps[myStepIndex].state === 'your-turn' && !currentData.approvals?.[approver.roleKey];

  const myApprovalRecord = currentData.approvals?.[approver.roleKey];
  const myApprovalStatus = myApprovalRecord?.status;

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
  const handleAction = async (actionType) => {
    setPendingAction(null);
    if (!canAct || isProcessing) return;
    setIsProcessing(true);

    try {
      const now = new Date();
      const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const dateTimeString = `${dateString} at ${timeString}`;

      const isApprove = actionType === 'approved';
      
      const newLog = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        role: approver.role,
        badge: isApprove ? 'Approved' : 'Rejected',
        date: dateTimeString,
        approverName: approver.name,
        text: remarks.trim() ? remarks : (isApprove ? 'Approved reservation request without remarks.' : 'Rejected reservation request.'),
        state: isApprove ? 'approved' : 'rejected'
      };

      const updatePayload = {
        [`approvals.${approver.roleKey}.status`]: isApprove ? 'approved' : 'rejected',
        [`approvals.${approver.roleKey}.date`]: dateString,
        historyLogs: arrayUnion(newLog)
      };

      if (!isApprove) {
        updatePayload.status = 'Rejected';
      } else if (isApprove && approver.roleKey === 'school admin') {
        updatePayload.status = 'Approved';
      }

      await updateDoc(doc(db, 'reservations', currentData.id), updatePayload);

      // --- AUTO-SYNC TO HISTORY COLLECTION UPON SCHOOL ADMIN APPROVAL ---
      if (isApprove && approver.roleKey === 'school admin') {
        try {
          const updatedResData = {
            ...currentData,
            status: 'Approved'
          };
          const { id, approvals, historyLogs, ...cleanHistoryData } = updatedResData;

          // Writes/overwrites directly to the history collection excluding approvals and historyLogs, using the same reservation ID
          await setDoc(doc(db, 'history', currentData.id), cleanHistoryData, { merge: true });
        } catch (historyErr) {
          console.error('Failed to backup approved reservation to history:', historyErr);
        }
      }
      // -----------------------------------------------------------------

      // --- SEND EMAIL NOTIFICATION ---
      const emailMessage = isApprove 
        ? `Your reservation has been approved by the ${approver.role}.` 
        : `Your reservation has been rejected by the ${approver.role}. Remarks: ${remarks || 'None'}`;

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

  const bannerStatusClass = currentData.status === 'Approved' ? 'approved' : currentData.status === 'Rejected' ? 'rejected' : 'pending';

  return (
    <div className="mis-reservation-details-content">
      {/* Top Banner */}
      <div className={`top-banner ${bannerStatusClass}`}>
        <div className="banner-info">
          <span className="icon">🛡</span>
          <div>
            <strong>Reservation {currentData.status === 'Rejected' ? 'Rejected' : currentData.status === 'Approved' ? 'Approved' : 'Pending for Approval'}</strong>
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
              <label htmlFor="approvalRemarks">REMARKS <span>(optional)</span></label>
              <textarea
                id="approvalRemarks"
                name="approvalRemarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={canAct ? "Add your administrative remarks or conditions here..." : "You can only add remarks when it is your turn to approve."}
                rows={3}
                disabled={!canAct || isProcessing || !!myApprovalStatus}
              />
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
                    onClick={() => setPendingAction('approved')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✓ Approve Reservation'}
                  </button>
                  <button 
                    className="btn-reject" 
                    onClick={() => setPendingAction('rejected')}
                    disabled={!canAct || isProcessing}
                  >
                    {isProcessing ? 'Processing...' : '✕ Reject Reservation'}
                  </button>
                </>
              )}
            </div>
            
            {!canAct && !myApprovalStatus && currentData.status !== 'Rejected' && currentData.status !== 'Approved' && (
              <div className="hierarchy-disabled-hint">
                Buttons are disabled because it is not currently your turn in the approval hierarchy.
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
            <h3 className={`modal-title ${pendingAction === 'rejected' ? 'error' : 'success'}`}>
              Confirm {pendingAction === 'approved' ? 'Approval' : 'Rejection'}
            </h3>
            <p className="modal-message">
              This action will update the status and notify the requestor.
            </p>
            <div className="modal-actions">
              <button 
                onClick={() => setPendingAction(null)}
                className="modal-button cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAction(pendingAction)}
                className={`modal-button ${pendingAction === 'rejected' ? 'confirm-reject-btn' : 'confirm-approve-btn'}`}
              >
                {pendingAction === 'approved' ? 'Approve' : 'Reject'}
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