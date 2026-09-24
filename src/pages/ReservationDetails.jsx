import React, { useState } from 'react';
import '../styles/ReservationDetails.scss';

const ReservationDetails = () => {
  // Sample reservation data — replace with real data (props, route param, or fetch)
  const [reservation] = useState({
    refNo: 'RES-2023-1042',
    eventName: 'Annual Tech Symposium',
    eventType: 'Academic Conference',
    eventDate: 'October 24, 2023',
    eventTime: '9:00 AM – 5:00 PM',
    expectedAttendees: '150 attendees',
    organization: 'IT Department',
    description:
      'A full-day technology symposium featuring guest speakers, hands-on workshops, and networking sessions for students and faculty.',
    facilityName: 'Main Auditorium',
    building: 'Building A',
    roomCapacity: '200 seats',
    floorLocation: '2nd Floor, Building A',
    equipmentRequested: 'Projector, Laptop, Microphone',
    setupRequired: 'Theater-style seating',
    requestorName: 'Alex Johnson',
    studentId: 'EMP-2023-0142',
    department: 'IT Department',
    contactNumber: '+63 912 345 6789',
    email: 'alex.johnson@facilityres.com',
    dateSubmitted: 'Oct 20, 2023',
    endorsedBy: 'Sarah Lee, HR Department'
  });

  const [trackerSteps] = useState([
    { label: 'Requestor Submitted', status: 'Completed', date: 'Oct 20, 2023', sub: '', state: 'approved' },
    { label: 'Endorser Review', status: 'Approved', date: 'Oct 21, 2023', sub: '', state: 'approved' },
    { label: 'MIS Equipment Check', status: 'Approved', date: 'Oct 22, 2023', sub: '', state: 'approved' },
    { label: 'OSA Review', status: 'Approved', date: 'Oct 23, 2023', sub: '', state: 'approved' },
    { label: 'Academic Head Review', status: 'Approved', date: 'Oct 23, 2023', sub: '', state: 'approved' },
    { label: 'Building Admin', status: 'Your Turn', date: 'Pending', sub: '', state: 'your-turn' },
    { label: 'School Admin Final', status: 'Queued', date: '—', sub: '', state: 'queued' }
  ]);

  const [historyLogs] = useState([
    { role: 'Requestor', badge: 'Submitted', date: 'Oct 20, 2023', text: 'Reservation request submitted for Annual Tech Symposium.', state: 'approved' },
    { role: 'Endorser – Sarah Lee', badge: 'Approved', date: 'Oct 21, 2023', text: 'Endorsed for department event, all details verified.', state: 'approved' },
    { role: 'MIS Admin', badge: 'Approved', date: 'Oct 22, 2023', text: 'Equipment availability confirmed and reserved.', state: 'approved' },
    { role: 'Building Admin', badge: 'Pending', date: 'Awaiting', text: 'Reviewing facility booking and final approval.', state: 'pending' }
  ]);

  const [remarks, setRemarks] = useState('');

  const handleApprove = () => {
    // TODO: wire up to real approval logic (API call, state update, etc.)
    console.log('Approved with remarks:', remarks);
  };

  const handleReject = () => {
    // TODO: wire up to real rejection logic
    console.log('Rejected with remarks:', remarks);
  };

  const handleDownloadPdf = () => {
    // TODO: wire up to real PDF export logic
    console.log('Download PDF requested for', reservation.refNo);
  };

  return (
    <div className="mis-reservation-details-content">
      {/* Top Banner */}
      <div className="top-banner">
        <div className="banner-info">
          <span className="icon">🛡️</span>
          <div>
            <strong>Reservation Pending Your Approval</strong>
            <p>This reservation is currently waiting on your decision as Building Admin.</p>
          </div>
        </div>
        <span className="banner-badge">Step 6 of 7</span>
      </div>

      {/* Main Grid */}
      <div className="main-content-grid">
        {/* Left Column: Event / Facility / Requestor details */}
        <div className="details-col">
          {/* Card 1: Event Information */}
          <div className="card">
            <h3><span className="card-icon">📋</span> Event Information</h3>
            <div className="info-grid">
              <div>
                <label>EVENT NAME</label>
                <div className="val font-bold">{reservation.eventName}</div>
              </div>
              <div>
                <label>EVENT TYPE</label>
                <div className="val font-bold">{reservation.eventType}</div>
              </div>
              <div>
                <label>EVENT DATE</label>
                <div className="val">{reservation.eventDate}</div>
              </div>
              <div>
                <label>TIME</label>
                <div className="val">{reservation.eventTime}</div>
              </div>
              <div>
                <label>EXPECTED ATTENDEES</label>
                <div className="val">{reservation.expectedAttendees}</div>
              </div>
              <div>
                <label>ORGANIZATION</label>
                <div className="val">{reservation.organization}</div>
              </div>
            </div>
            <div className="full-width-field">
              <label>EVENT DESCRIPTION</label>
              <div className="val desc-text">{reservation.description}</div>
            </div>
          </div>

          {/* Card 2: Facility Details */}
          <div className="card">
            <h3><span className="card-icon">🏢</span> Facility Details</h3>
            <div className="info-grid">
              <div>
                <label>FACILITY NAME</label>
                <div className="val font-bold">{reservation.facilityName}</div>
              </div>
              <div>
                <label>BUILDING</label>
                <div className="val">{reservation.building}</div>
              </div>
              <div>
                <label>ROOM CAPACITY</label>
                <div className="val">{reservation.roomCapacity}</div>
              </div>
              <div>
                <label>FLOOR / LOCATION</label>
                <div className="val">{reservation.floorLocation}</div>
              </div>
              <div>
                <label>EQUIPMENT REQUESTED</label>
                <div className="val">{reservation.equipmentRequested}</div>
              </div>
              <div>
                <label>SETUP REQUIRED</label>
                <div className="val">{reservation.setupRequired}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Requestor Information */}
          <div className="card">
            <h3><span className="card-icon">👤</span> Requestor Information</h3>
            <div className="info-grid">
              <div>
                <label>FULL NAME</label>
                <div className="val font-bold">{reservation.requestorName}</div>
              </div>
              <div>
                <label>STUDENT / EMPLOYEE ID</label>
                <div className="val">{reservation.studentId}</div>
              </div>
              <div>
                <label>DEPARTMENT / COLLEGE</label>
                <div className="val">{reservation.department}</div>
              </div>
              <div>
                <label>CONTACT NUMBER</label>
                <div className="val">{reservation.contactNumber}</div>
              </div>
              <div>
                <label>EMAIL ADDRESS</label>
                <div className="val">{reservation.email}</div>
              </div>
              <div>
                <label>DATE SUBMITTED</label>
                <div className="val">{reservation.dateSubmitted}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Actions and Summary */}
        <div className="sidebar-col">
          {/* Reservation Summary */}
          <div className="card">
            <h3>Reservation Summary</h3>
            <div className="summary-list">
              <div className="summary-item">
                <span className="label">Reference No.</span>
                <span className="val ref-no">{reservation.refNo}</span>
              </div>
              <div className="summary-item">
                <span className="label">Facility</span>
                <span className="val">{reservation.facilityName}</span>
              </div>
              <div className="summary-item">
                <span className="label">Event Date</span>
                <span className="val">{reservation.eventDate}</span>
              </div>
              <div className="summary-item">
                <span className="label">Duration</span>
                <span className="val">{reservation.eventTime}</span>
              </div>
              <div className="summary-item">
                <span className="label">Attendees</span>
                <span className="val">{reservation.expectedAttendees}</span>
              </div>
              <div className="summary-item">
                <span className="label">Endorsed By</span>
                <span className="val">{reservation.endorsedBy}</span>
              </div>
            </div>
          </div>

          {/* Admin Approval Decision Card */}
          <div className="card">
            <div className="card-header-small">
              <h3>🛡️ Admin Approval</h3>
              <p>Your administrative decision</p>
            </div>

            <div className="user-profile-box">
              <div className="user-details">
                <div className="avatar">MR</div>
                <div>
                  <span className="sub-text">Approving as</span>
                  <strong>Marcus Reid</strong>
                </div>
              </div>
              <span className="role-tag">Building Admin</span>
            </div>

            <div className="form-group">
              <label>REMARKS <span>(optional)</span></label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add your administrative remarks or conditions here..."
                rows={3}
              />
              <span className="hint-text">Remarks will be recorded in the approval history and visible to all stakeholders.</span>
            </div>

            <div className="action-buttons">
              <button className="btn-approve" onClick={handleApprove}>✓ Approve Reservation</button>
              <button className="btn-reject" onClick={handleReject}>✕ Reject Reservation</button>
              <button className="btn-pdf" onClick={handleDownloadPdf}>📄 Download PDF</button>
            </div>

            <div className="warning-box">
              ⚠️ This is a final administrative decision. Approval will confirm the reservation and notify all parties. Rejection will terminate the workflow.
            </div>
          </div>
        </div>
      </div>

      {/* Approval Tracker */}
      <div className="card tracker-card">
        <h3>📊 Approval Tracker</h3>
        <p className="sub-header">Track this reservation through the approval pipeline</p>

        <div className="pipeline-container">
          {trackerSteps.map((step, index) => (
            <div key={index} className={`pipeline-step ${step.state}`}>
              {index < trackerSteps.length - 1 && <div className="step-line" />}
              <div className="step-circle">
                {step.state === 'approved' ? '✓' : step.state === 'your-turn' ? '🛡️' : index + 1}
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
          <div>Step <strong>6 of 7</strong> — Building Admin Approval</div>
        </div>
      </div>

      {/* History Logs */}
      <div className="card history-card">
        <h3>📑 Approval History & Remarks</h3>

        <div className="history-list">
          {historyLogs.map((log, index) => (
            <div key={index} className={`history-item ${log.state}`}>
              <div className="history-icon">
                {log.state === 'approved' ? '✓' : '🛡️'}
              </div>
              <div className="history-content">
                <div className="history-header">
                  <strong>
                    {log.role}
                    {log.badge && <span className="action-badge">{log.badge}</span>}
                  </strong>
                  <span className="history-date">{log.date}</span>
                </div>
                <p>{log.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// This exact line is required for React.lazy() to work
export default ReservationDetails;
