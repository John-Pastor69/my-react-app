import { jsPDF } from 'jspdf';
import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { getApprovalTrackerSteps, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
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

const ReservationDetails = ({ data }) => {
  const [currentData, setCurrentData] = useState(data);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [requestorRole, setRequestorRole] = useState('requestor');

  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('');

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const fetchCurrentUserRole = async () => {
      if (!currentUser) {
        setCurrentUserRole('');
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (isCurrent && userSnap.exists()) {
          setCurrentUserRole((userSnap.data().role || '').toLowerCase().trim());
        }
      } catch (error) {
        console.error('Failed to load current user role for PDF access:', error);
        if (isCurrent) setCurrentUserRole('');
      }
    };

    fetchCurrentUserRole();
    return () => {
      isCurrent = false;
    };
  }, [currentUser]);

  // Real-time listener for this specific reservation doc
  useEffect(() => {
    if (!currentUser || !data?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'reservations', data.id), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentData({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return () => unsubscribe();
  }, [currentUser, data?.id]);

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

  // Fetch facilities and equipments mapping
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

  if (!currentData) return <div className="loading-text">Loading reservation details...</div>;

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
    reservationStatus: currentData.status
  });

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

  const bannerStatusClass = currentData.status === 'Approved' ? 'approved' : currentData.status === 'Rejected' ? 'rejected' : 'pending';
  const isApprovedStatus = (currentData.status || '').toLowerCase().trim() === 'approved';
  const isPdfAdmin = ['building admin', 'mis', 'mis admin', 'super admin'].includes(
    currentUserRole.replace(/_/g, ' ')
  );
  const isReservationOwner = Boolean(currentUser && (
    currentData.userId === currentUser.uid
    || (currentData.userEmail || '').toLowerCase() === (currentUser.email || '').toLowerCase()
  ));
  const canDownloadPdf = isApprovedStatus && (isPdfAdmin || isReservationOwner);

  const airconDisplay = currentData.aircon 
    ? "ON" + ((currentData.airconOnTime || currentData.airconOffTime) ? ` (${currentData.airconOnTime || '?'} - ${currentData.airconOffTime || '?'})` : "") 
    : "OFF";

  // --- PROGRAMMATIC VECTOR PDF GENERATOR (NO SCREENSHOTS) ---
  const handleDownloadPDF = () => {
    if (!canDownloadPdf) return;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const colWidth = (contentWidth - 8) / 2;
    let y = 18;

    const checkPageBreak = (neededHeight) => {
      if (y + neededHeight > pageHeight - 15) {
        pdf.addPage();
        y = 18;
      }
    };

    // 1. Formal Institutional Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(15, 23, 42);
    pdf.text('STI COLLEGE GLOBAL CITY', pageWidth / 2, y, { align: 'center' });
    y += 6;

    pdf.setFontSize(11);
    pdf.text('FACILITY AND EQUIPMENT RESERVATION SLIP', pageWidth / 2, y, { align: 'center' });
    y += 5;

    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(0.6);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 7;

    // 2. Top Reference & Status Bar
    pdf.setFillColor(240, 253, 244);
    pdf.setDrawColor(167, 243, 208);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(margin, y, contentWidth, 12, 2, 2, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(6, 95, 70);
    pdf.text(`REFERENCE NO: ${refNo}`, margin + 4, y + 7.5);
    pdf.text(`STATUS: ${(currentData.status || 'APPROVED').toUpperCase()}`, pageWidth - margin - 4, y + 7.5, { align: 'right' });
    y += 18;

    // Helper: Draw Section Title
    const drawSectionHeader = (title) => {
      checkPageBreak(14);
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, y, contentWidth, 8, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(30, 41, 59);
      pdf.text(title.toUpperCase(), margin + 3, y + 5.5);
      y += 13;
    };

    // Helper: Draw 2-Column Row
    const drawTwoColRow = (label1, val1, label2, val2) => {
      const text1 = pdf.splitTextToSize(String(val1 || 'N/A'), colWidth - 2);
      const text2 = label2 ? pdf.splitTextToSize(String(val2 || 'N/A'), colWidth - 2) : [];
      const maxLines = Math.max(text1.length, text2.length, 1);
      const rowHeight = 5 + maxLines * 4.5 + 3;

      checkPageBreak(rowHeight);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(label1.toUpperCase(), margin + 2, y);
      if (label2) {
        pdf.text(label2.toUpperCase(), margin + colWidth + 6, y);
      }

      y += 4.5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(text1, margin + 2, y);
      if (label2) {
        pdf.text(text2, margin + colWidth + 6, y);
      }

      y += maxLines * 4.5 + 3;
    };

    // Helper: Draw Full-Width Row
    const drawFullRow = (label, val) => {
      const textLines = pdf.splitTextToSize(String(val || 'N/A'), contentWidth - 4);
      const rowHeight = 5 + textLines.length * 4.5 + 3;

      checkPageBreak(rowHeight);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(label.toUpperCase(), margin + 2, y);

      y += 4.5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(textLines, margin + 2, y);

      y += textLines.length * 4.5 + 4;
    };

    // 3. Section: Event Information
    drawSectionHeader('1. Event Information');
    drawTwoColRow('Event Name', eventName, 'Event Type', eventType);
    drawTwoColRow('Event Date', eventDate, 'Time', eventTime.replace('–', '-'));
    drawTwoColRow('Expected Attendees', expectedAttendees, '', '');
    drawFullRow('Event Description / Purpose', description);
    y += 2;

    // 4. Section: Facility & Equipment Details
    drawSectionHeader('2. Facility & Equipment Details');
    drawTwoColRow('Facility Name', facilityDisplay, 'Room Capacity', capacityDisplay);
    drawTwoColRow('Floor / Location', locationDisplay, 'Aircon', airconDisplay);
    drawFullRow('Equipment Requested', equipmentRequested);
    y += 2;

    // 5. Section: Requestor Information
    drawSectionHeader('3. Requestor Information');
    drawTwoColRow('Full Name', requestorName, 'Contact Number', contactNumber);
    drawTwoColRow('Email Address', email, 'Date Submitted', dateSubmitted);
    y += 2;

    // 6. Section: Endorser Information (if applicable)
    if (hasEndorser) {
      drawSectionHeader('4. Endorser Information');
      drawTwoColRow("Endorser's Full Name", endorserName, 'Designation', endorserDesignation);
      drawFullRow('Contact Email', endorserEmail);
      y += 2;
    }

    // 7. Footer Timestamp
    checkPageBreak(15);
    y += 4;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 5;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} — Official Reservation Slip (${refNo})`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    pdf.save(`${refNo}.pdf`);
  };

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
                <div className="val">{airconDisplay}</div>
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

          {/* Download PDF Button */}
          {canDownloadPdf && (
            <button
              className="download-pdf-btn is-approved"
              onClick={handleDownloadPDF}
            >
              📄 Download PDF
            </button>
          )}
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
            return (
              <div key={index} className={`history-item ${log.state}`}>
                <div className="history-icon">
                  {log.state === 'approved' ? '✓' : log.state === 'rejected' ? '✕' : '🛡️'}
                </div>
                <div className="history-content">
                  <div className="history-header">
                    <strong>
                      {log.role}
                      {log.badge && <span className="action-badge">{log.badge}</span>}
                    </strong>
                    <div className="history-meta-right">
                      <span className="history-date">{log.date}</span>
                      {log.approverName && <div className="history-approver-name">{log.approverName}</div>}
                    </div>
                  </div>
                  <p className="word-break">{log.text}</p>
                </div>
              </div>
            );
          })}
          {fullHistory.length === 1 && currentData.status !== 'Rejected' && currentData.status !== 'Approved' && (
             <div className="history-item pending">
               <div className="history-icon">🛡</div>
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
    </div>
  );
};

export default ReservationDetails;