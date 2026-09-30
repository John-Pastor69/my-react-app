import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../Firebase';
import '../styles/ReservationDetails.scss';

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

const ReservationDetails = ({ data }) => {
  const [currentData, setCurrentData] = useState(data);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [requestorRole, setRequestorRole] = useState('requestor');

  // Real-time listener for this specific reservation doc[cite: 55]
  useEffect(() => {
    if (!data?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'reservations', data.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentData({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsubscribe();
  }, [data?.id]);

  // Fetch requestor's actual role to determine if endorser should be skipped[cite: 55]
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

  // Fetch facilities and equipments mapping[cite: 55]
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

  if (!currentData) return <div className="loading-text">Loading reservation details...</div>;

  // --- DYNAMIC DATA MAPPING ---[cite: 55]
  const refNo = currentData.refNo || 'N/A';
  const eventName = currentData.eventName || 'Untitled Event';
  const eventType = Array.isArray(currentData.eventType) ? currentData.eventType.join(', ') : (currentData.eventType || 'N/A');
  const eventDate = currentData.eventDate || 'N/A';
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

  // --- HIERARCHY & TRACKER LOGIC ---[cite: 55]
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

      if (prevIsApproved) {
        state = 'pending';
        statusText = 'Pending';
      } else {
        state = 'queued';
        statusText = 'Queued';
      }
    }

    return { label: step.label, status: statusText, date: isApproved ? actionDate : 'Pending', state: state };
  });

  const baseHistory = [{
    role: 'Requestor',
    badge: 'Submitted',
    date: dateSubmitted,
    text: `Reservation request submitted for ${eventName}.`,
    state: 'approved'
  }];
  const dbHistoryLogs = currentData.historyLogs || [];
  const fullHistory = [...baseHistory, ...dbHistoryLogs];

  const bannerStatusClass = currentData.status === 'Approved' ? 'approved' : currentData.status === 'Rejected' ? 'rejected' : 'pending';

  return (
    <div className="mis-reservation-details-content">
      {/* Top Banner */}
      <div className={`top-banner ${bannerStatusClass}`}>
        <div className="banner-info">
          <span className="icon">🛡</span>
          <div>
            <strong>Reservation {currentData.status === 'Rejected' ? 'Rejected' : currentData.status === 'Approved' ? 'Approved' : 'Pending for Approval'}</strong>
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
                <div className="val font-bold word-break">{eventName}</div>
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
              <div className="val desc-text word-break">{description}</div>
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
                <div className="val word-break">{locationDisplay}</div>
              </div>
              <div>
                <label>AIRCON</label>
                <div className="val">
                  {currentData.aircon 
                    ? "ON" + ((currentData.airconOnTime || currentData.airconOffTime) ? ` (${currentData.airconOnTime || '?'} - ${currentData.airconOffTime || '?'})` : "") 
                    : "OFF"}
                </div>
              </div>
              <div className="equipment-requested-field">
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
                <div className="val font-bold word-break">{requestorName}</div>
              </div>
              <div>
                <label>CONTACT NUMBER</label>
                <div className="val word-break">{contactNumber}</div>
              </div>
              <div>
                <label>EMAIL ADDRESS</label>
                <div className="val word-break">{email}</div>
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
                  <div className="val font-bold word-break">{endorserName}</div>
                </div>
                <div>
                  <label>DESIGNATION</label>
                  <div className="val word-break">{endorserDesignation}</div>
                </div>
                <div className="full-width-field endorser-full-width">
                  <label>CONTACT EMAIL</label>
                  <div className="val word-break">{endorserEmail}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Summary */}
        <div className="sidebar-col">
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
                  <span className="val word-break">{endorsedBy}</span>
                </div>
              )}
            </div>
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
                {step.state === 'approved' ? '✓' : step.state === 'rejected' ? '✕' : index + 1}
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
              <div key={index} className={`history-item ${log.state}`} style={log.state === 'rejected' ? { borderLeftColor: '#ef4444' } : {}}>
                <div className="history-icon" style={{ backgroundColor: iconBg, color: iconColor }}>
                  {log.state === 'approved' ? '✓' : log.state === 'rejected' ? '✕' : '🛡️'}
                </div>
                <div className="history-content">
                  <div className="history-header">
                    <strong>
                      {log.role}
                      {log.badge && <span className="action-badge" style={{ backgroundColor: badgeBg }}>{log.badge}</span>}
                    </strong>
                    <span className="history-date">{log.date}</span>
                  </div>
                  <p className="word-break">{log.text}</p>
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
                   <span className="history-date">Awaiting</span>
                 </div>
                 <p>Reviewing facility booking and awaiting next approval.</p>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReservationDetails;