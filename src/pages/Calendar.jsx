import React, { useState, useEffect } from 'react';
import { db, auth } from "../Firebase";
import { collection, onSnapshot, doc, setDoc, getDoc } from "firebase/firestore"; 
import "../styles/Calendar.scss";
import ReservationDetails from './ReservationDetails';

// --- NAME FORMATTER HELPER ---
const formatName = (fullName) => {
  if (!fullName) return 'N/A';
  let name = fullName.replace(/\s*\(Student\)/i, '').trim();
  if (name.includes(',')) {
    const parts = name.split(',');
    name = `${parts[1].trim()} ${parts[0].trim()}`;
  }
  return name;
};

// --- HELPER TO GET ALL DATES IN A RANGE ---
const getDatesInRange = (startDateStr, numDays) => {
  const dates = [];
  if (!startDateStr) return dates;
  let parts = startDateStr.split(/[\/\-]/);
  if (parts.length !== 3) return [startDateStr];
  const [m, d, y] = parts.map(Number);
  
  const current = new Date(y, m - 1, d);
  const totalDays = Math.max(1, Number(numDays) || 1);
  
  for (let i = 0; i < totalDays; i++) {
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const yy = current.getFullYear();
    dates.push(`${mm}/${dd}/${yy}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const Calendar = () => {
  // 1. STATE
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const [reservationsData, setReservationsData] = useState([]);
  const [historyData, setHistoryData] = useState([]); 
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [userRole, setUserRole] = useState('');
  
  // STATE: For the history modal
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date());
  
  // STATE: For the specific history "View Details" click
  const [historySelectedRequest, setHistorySelectedRequest] = useState(null);

  // 1.5. FETCH CURRENT USER ROLE
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUserRole((userData.role || '').toLowerCase().trim());
          }
        } catch (err) {
          console.error("Failed to fetch user role for calendar:", err);
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. LIVE LISTENERS (Reservations, History, Facilities, Equipments)
  useEffect(() => {
    // A. Main Reservations Listener (and sync to History)
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const resData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservationsData(resData);

      // --- AUTO-SYNC LOGIC ---
      resData.forEach(async (res) => {
        if (res.status === 'Approved' || (res.status || '').toLowerCase() === 'approved') {
          try {
            const { id, approvals, historyLogs, ...cleanHistoryData } = res;
            await setDoc(doc(db, 'history', id), cleanHistoryData, { merge: true });
          } catch (err) {
            console.error('Failed to backup approved reservation to history:', err);
          }
        }
      });
    }, (error) => console.error('Failed to load reservations:', error));

    // B. New History Collection Listener
    const unsubHistory = onSnapshot(collection(db, 'history'), (snapshot) => {
      setHistoryData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error('Failed to load history:', error));

    // C. Facilities Listener
    const unsubFac = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const fMap = {};
      snapshot.forEach(doc => { fMap[doc.id] = doc.data(); });
      setFacilitiesMap(fMap);
    }, (error) => console.error('Failed to load facilities:', error));

    // D. Equipments Listener
    const unsubEq = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const eMap = {};
      snapshot.forEach(doc => { eMap[doc.id] = doc.data(); });
      setEquipmentMap(eMap);
    }, (error) => console.error('Failed to load equipments:', error));

    return () => { unsubRes(); unsubHistory(); unsubFac(); unsubEq(); };
  }, []);

  // 3. REUSABLE MAPPING FUNCTION WITH RANGE EXPANSION
  const mapToEvents = (sourceData) => {
    return sourceData.flatMap(data => {
      const status = (data.status || 'pending').toLowerCase();
      
      let uiStatusColor = 'yellow'; 
      if (status === 'approved') uiStatusColor = 'green';
      if (status === 'rejected') uiStatusColor = 'red';
      if (status === 'pending') uiStatusColor = 'yellow';

      const facilityNames = (data.facilities || []).map(id => facilitiesMap[id]?.name || id);
      const facilityDisplay = facilityNames.length > 0 ? facilityNames.join(', ') : 'N/A';
      
      const equipArray = Object.entries(data.selectedEquip || {})
        .filter(([id, qty]) => Number(qty) > 0)
        .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
      const equipmentRequested = equipArray.length > 0 ? equipArray.join(', ') : 'N/A';

      const datesRange = getDatesInRange(data.eventDate || data.date, data.days || 1);

      return datesRange.map((dateStr, index) => {
        let positionClass = '';
        const total = datesRange.length;
        if (total > 1) {
          if (index === 0) positionClass = 'multi-start';
          else if (index === total - 1) positionClass = 'multi-end';
          else positionClass = 'multi-middle';
        }

        return {
          id: `${data.id}-${index}`,
          originalId: data.id,
          title: data.eventName || data.title || "Untitled Event",
          date: dateStr,
          status: uiStatusColor, 
          time: (data.startTime && data.endTime) ? `${data.startTime} - ${data.endTime}` : "N/A",
          facility: facilityDisplay,
          equipment: equipmentRequested,
          requestor: formatName(data.fullName),
          endorser: data.endorserName ? formatName(data.endorserName) : 'N/A',
          positionClass,
          isStart: index === 0,
          fullData: data 
        };
      });
    });
  };

  const events = mapToEvents(reservationsData);
  const historyEvents = mapToEvents(historyData);

  // 4. NAVIGATION CONTROLLERS
  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const handleHistoryPrevMonth = () => setHistoryDate(new Date(historyDate.getFullYear(), historyDate.getMonth() - 1, 1));
  const handleHistoryNextMonth = () => setHistoryDate(new Date(historyDate.getFullYear(), historyDate.getMonth() + 1, 1));
  const handleOpenHistory = () => { setHistoryDate(currentDate); setIsHistoryModalOpen(true); };

  // 5. DYNAMIC CALENDAR GENERATOR
  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const calendar = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const formatDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${m}/${day}/${y}`; 
    };

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      calendar.push({ name: dayNames[d.getDay()], num: d.getDate(), date: formatDate(d), isGrayedOut: true });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      calendar.push({ name: dayNames[d.getDay()], num: i, date: formatDate(d), isGrayedOut: false });
    }

    let nextMonthDay = 1;
    while (calendar.length < 42) {
      const d = new Date(year, month + 1, nextMonthDay);
      calendar.push({ name: dayNames[d.getDay()], num: nextMonthDay, date: formatDate(d), isGrayedOut: true });
      nextMonthDay++;
    }

    return calendar;
  };

  const calendarDays = generateCalendar();
  const currentMonthYearString = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const historyMonthYearString = historyDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar-page-container">
      
      {/* --- LEFT: MAIN CALENDAR --- */}
      <div className="calendar-main">
        <div className="calendar-header">
          <div className="month-nav">
            <button className="icon-btn" onClick={handlePrevMonth}>&#10094;</button>
            <h2>{currentMonthYearString}</h2>
            <button className="icon-btn" onClick={handleNextMonth}>&#10095;</button>
            
            {userRole === 'mis' && (
              <button className="icon-btn history-btn" onClick={handleOpenHistory} title="View History">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
              </button>
            )}
          </div>
          <div className="calendar-legend">
            <span className="legend-item"><span className="dot dot-yellow"></span> Pending</span>
            <span className="legend-item"><span className="dot dot-green"></span> Approved</span>
            <span className="legend-item"><span className="dot dot-red"></span> Rejected</span>
          </div>
        </div>

        <div className="calendar-grid">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
          {calendarDays.map((day, index) => {
            const daysEvents = events.filter(e => e.date === day.date);
            const isEmpty = daysEvents.length === 0;

            return (
              <div 
                key={index} 
                onClick={() => setSelectedDate(day.date)}
                className={`day-cell ${isEmpty ? 'empty-day' : ''} ${day.isGrayedOut ? 'prev-month' : ''} ${selectedDate === day.date ? 'active-day' : ''}`}
              >
                <span className="date"><span>{day.name}</span> {day.num}</span>
                {daysEvents.map(event => (
                  <div 
                    key={event.id} 
                    className={`event-pill pill-${event.status} ${event.positionClass}`}
                    data-days={event.fullData.days > 1 && event.isStart ? `${event.fullData.days} Days` : ''}
                    title={event.title}
                  >
                    <span className="event-pill-title">{event.title}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- RIGHT: SIDEBAR DETAILS --- */}
      <div className="calendar-sidebar">
        {(() => {
          const sidebarEvents = events.filter(e => e.date === selectedDate && e.isStart); // Ensure we only display unique events in sidebar
          const approvedCount = sidebarEvents.filter(e => e.status === 'green').length;
          const pendingCount = sidebarEvents.filter(e => e.status === 'yellow').length;
          const rejectedCount = sidebarEvents.filter(e => e.status === 'red').length;
          const displayDate = selectedDate ? new Date(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' }) : "Select a date";

          return (
            <>
              <div className="sidebar-header">
                <div>
                  <h3>{displayDate}</h3>
                  <p>All reservations for selected date</p>
                </div>
                <span className="event-count">{sidebarEvents.length} events</span>
              </div>
              <div className="sidebar-stats">
                <div className="stat-box"><span className="stat-num text-green">{approvedCount}</span><span className="stat-label">Approved</span></div>
                <div className="stat-divider"></div>
                <div className="stat-box"><span className="stat-num text-yellow">{pendingCount}</span><span className="stat-label">Pending</span></div>
                <div className="stat-divider"></div>
                <div className="stat-box"><span className="stat-num text-red">{rejectedCount}</span><span className="stat-label">Rejected</span></div>
              </div>
              <div className="event-cards">
                {sidebarEvents.length === 0 ? (
                  <p className="empty-state-text">No reservations scheduled for this date.</p>
                ) : (
                  sidebarEvents.map(event => (
                    <div key={event.id} className="event-card">
                      <div className="card-top">
                        <span className={`status-badge bg-${event.status}`}>
                          {event.status === 'green' ? 'Approved' : event.status === 'red' ? 'Rejected' : 'Pending'}
                        </span>
                        <h4>{event.title}</h4>
                      </div>
                      <div className="card-details">
                        <p><i className="ph ph-user"></i> {event.requestor}</p>
                        <p><i className="ph ph-clock"></i> {event.time}</p>
                        <p><i className="ph ph-buildings"></i> {event.facility}</p>
                        <p><i className="ph ph-package"></i> {event.equipment}</p>
                        <p><i className="ph ph-signature"></i> {event.endorser}</p>
                      </div>
                      <div className="card-actions">
                        <button className="btn-view" onClick={() => setSelectedRequest(event.fullData)}>View Details</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* --- MODAL POPUP FOR DETAILS --- */}
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setSelectedRequest(null)}>✕</button>
            <div className="modal-content">
              <ReservationDetails data={selectedRequest} />
            </div>
          </div>
        </div>
      )}

      {/* --- HISTORY MODAL --- */}
      {isHistoryModalOpen && (
        <div className="modal-overlay">
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setIsHistoryModalOpen(false)}>✕</button>
            <div className="history-modal-content">
              <h2>Calendar History</h2>
              <div className="history-card">
                <div className="calendar-header history-inner-header">
                  <div className="month-nav">
                    <button className="icon-btn" onClick={handleHistoryPrevMonth}>&#10094;</button>
                    <h2>{historyMonthYearString}</h2>
                    <button className="icon-btn" onClick={handleHistoryNextMonth}>&#10095;</button>
                  </div>
                  <div className="calendar-legend">
                    <span className="legend-item"><span className="dot dot-green"></span> Approved</span>
                  </div>
                </div>
                
                {(() => {
                  const approvedEventsThisMonth = historyEvents.filter(e => {
                    if (!e.date) return false;
                    const eDate = new Date(e.date);
                    return eDate.getMonth() === historyDate.getMonth() && eDate.getFullYear() === historyDate.getFullYear() && e.isStart;
                  }).sort((a, b) => new Date(a.date) - new Date(b.date));

                  const groupedHistory = {};
                  approvedEventsThisMonth.forEach(e => {
                    const d = new Date(e.date);
                    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = d.getDate();
                    const groupKey = `${dayName} ${dayNum}`;
                    if (!groupedHistory[groupKey]) groupedHistory[groupKey] = [];
                    groupedHistory[groupKey].push(e);
                  });

                  const groupKeys = Object.keys(groupedHistory);
                  if (groupKeys.length === 0) {
                    return <p className="empty-state-text">No history records found for {historyMonthYearString}.</p>;
                  }

                  return (
                    <div className="history-group-list">
                      {groupKeys.map(dateKey => (
                        <div key={dateKey} className="history-date-group">
                          <h4>{dateKey}</h4>
                          <div className="history-events-container">
                            {groupedHistory[dateKey].map(event => (
                              <div key={event.id} className="history-event-item">
                                <div className="history-event-header">
                                  <span className="event-title">{event.title}</span>
                                  <button className="btn-view-details" onClick={() => setHistorySelectedRequest(event)}>
                                    View Details
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- HISTORY DETAILS MODAL --- */}
      {historySelectedRequest && (
        <div className="details-modal-overlay">
          <div className="details-modal-wrapper">
            <button className="close-modal-btn" onClick={() => setHistorySelectedRequest(null)}>✕</button>
            <div className="details-modal-content">
              <div className="details-flex-container">
                <div className="details-left-column">
                  <div className="details-card">
                    <h3 className="details-card-header">📋 Event Information</h3>
                    <div className="details-grid">
                      <div><div className="details-label">Event Name</div><div className="details-value">{historySelectedRequest.title || 'N/A'}</div></div>
                      <div><div className="details-label">Event Type</div>
                        <div className="details-value">
                          {historySelectedRequest.fullData.eventType ? (Array.isArray(historySelectedRequest.fullData.eventType) ? historySelectedRequest.fullData.eventType.join(', ') : historySelectedRequest.fullData.eventType) : 'N/A'}
                        </div>
                      </div>
                      <div><div className="details-label">Event Date</div><div className="details-value">{historySelectedRequest.fullData.eventDate || 'N/A'}</div></div>
                      <div><div className="details-label">Time</div><div className="details-value">{historySelectedRequest.time || 'N/A – N/A'}</div></div>
                      <div className="details-full-width"><div className="details-label">Expected Attendees</div><div className="details-value">{historySelectedRequest.fullData.expectedParticipants || 'N/A'}</div></div>
                      <div className="details-full-width"><div className="details-label">Event Description / Purpose</div><div className="details-value">{historySelectedRequest.fullData.purpose || 'N/A'}</div></div>
                    </div>
                  </div>

                  <div className="details-card">
                    <h3 className="details-card-header">🏢 Facility Details</h3>
                    <div className="details-grid">
                      <div><div className="details-label">Facility Name</div><div className="details-value">{historySelectedRequest.facility || 'None'}</div></div>
                      <div><div className="details-label">Room Capacity</div><div className="details-value">{historySelectedRequest.fullData.capacity || 'N/A'}</div></div>
                      <div><div className="details-label">Floor / Location</div><div className="details-value">{historySelectedRequest.fullData.location || 'N/A'}</div></div>
                      <div><div className="details-label">Aircon</div><div className="details-value">{historySelectedRequest.fullData.aircon === true ? 'ON' : (historySelectedRequest.fullData.aircon === false ? 'OFF' : 'N/A')}</div></div>
                      <div className="details-full-width"><div className="details-label">Equipment Requested</div><div className="details-value">{historySelectedRequest.equipment || 'N/A'}</div></div>
                    </div>
                  </div>

                  <div className="details-card">
                    <h3 className="details-card-header">👤 Requestor Information</h3>
                    <div className="details-grid">
                      <div><div className="details-label">Full Name</div><div className="details-value">{historySelectedRequest.requestor || 'N/A'}</div></div>
                      <div><div className="details-label">Contact Number</div><div className="details-value">{historySelectedRequest.fullData.contactNumber || 'N/A'}</div></div>
                      <div><div className="details-label">Email Address</div><div className="details-value">{historySelectedRequest.fullData.userEmail || historySelectedRequest.fullData.emailAddress || 'N/A'}</div></div>
                      <div><div className="details-label">Date Submitted</div><div className="details-value">{historySelectedRequest.fullData.createdAt || 'N/A'}</div></div>
                    </div>
                  </div>

                  {(historySelectedRequest.fullData.userRole === 'student' || historySelectedRequest.endorser !== 'N/A') && (
                    <div className="details-card">
                      <h3 className="details-card-header">
                        👨‍💼 Endorser Information <span className="student-badge">Student Role Only</span>
                      </h3>
                      <div className="details-grid">
                        <div><div className="details-label">Endorser's Full Name</div><div className="details-value">{historySelectedRequest.endorser || 'N/A'}</div></div>
                        <div><div className="details-label">Designation</div><div className="details-value">{historySelectedRequest.fullData.endorserDesignation || 'N/A'}</div></div>
                        <div className="details-full-width"><div className="details-label">Contact Email</div><div className="details-value">{historySelectedRequest.fullData.endorserEmail || 'N/A'}</div></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="details-right-column details-card">
                  <h3 className="summary-header">Reservation Summary</h3>
                  <div className="summary-list">
                    <div><div className="details-label">Reference No.</div><div className="details-value summary-ref">{historySelectedRequest.fullData.refNo || 'N/A'}</div></div>
                    <div><div className="details-label">Facility</div><div className="details-value">{historySelectedRequest.facility || 'None'}</div></div>
                    <div><div className="details-label">Equipment</div><div className="details-value">{historySelectedRequest.equipment || 'N/A'}</div></div>
                    <div><div className="details-label">Event Date</div><div className="details-value">{historySelectedRequest.fullData.eventDate || 'N/A'}</div></div>
                    <div><div className="details-label">Duration</div><div className="details-value">{historySelectedRequest.fullData.durationHours ? `${historySelectedRequest.fullData.durationHours} Hours` : 'N/A – N/A'}</div></div>
                    <div><div className="details-label">Attendees</div><div className="details-value">{historySelectedRequest.fullData.expectedParticipants || 'N/A'}</div></div>
                    <div><div className="details-label">Endorsed By</div><div className="details-value">{historySelectedRequest.endorser !== 'N/A' ? `${historySelectedRequest.endorser} (${historySelectedRequest.fullData.endorserDesignation || 'N/A'})` : 'N/A'}</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Calendar;