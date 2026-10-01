import React, { useState, useEffect } from 'react';
import { db } from "../Firebase";
import { collection, query, onSnapshot } from "firebase/firestore";
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

const Calendar = () => {
  // 1. STATE
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const [reservationsData, setReservationsData] = useState([]);
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);

  // 2. LIVE LISTENERS (Reservations, Facilities, Equipments)
  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      setReservationsData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error('Failed to load reservations:', error));

    const unsubFac = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const fMap = {};
      snapshot.forEach(doc => { fMap[doc.id] = doc.data(); });
      setFacilitiesMap(fMap);
    }, (error) => console.error('Failed to load facilities:', error));

    const unsubEq = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const eMap = {};
      snapshot.forEach(doc => { eMap[doc.id] = doc.data(); });
      setEquipmentMap(eMap);
    }, (error) => console.error('Failed to load equipments:', error));

    return () => { unsubRes(); unsubFac(); unsubEq(); };
  }, []);

  // 3. MAP DATA TO EVENTS
  const events = reservationsData.map(data => {
    const status = (data.status || 'pending').toLowerCase();
    
    // Map database text to your UI colors (yellow for pending)
    let uiStatusColor = 'yellow'; 
    if (status === 'approved') uiStatusColor = 'green';
    if (status === 'rejected') uiStatusColor = 'red';
    if (status === 'pending') uiStatusColor = 'yellow';

    // Map Names
    const facilityNames = (data.facilities || []).map(id => facilitiesMap[id]?.name || id);
    const facilityDisplay = facilityNames.length > 0 ? facilityNames.join(', ') : 'N/A';
    
    const equipArray = Object.entries(data.selectedEquip || {})
      .filter(([id, qty]) => Number(qty) > 0)
      .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
    const equipmentRequested = equipArray.length > 0 ? equipArray.join(', ') : 'N/A';

    return {
      id: data.id,
      title: data.eventName || data.title || "Untitled Event",
      date: data.eventDate || data.date,
      status: uiStatusColor, 
      time: (data.startTime && data.endTime) ? `${data.startTime} - ${data.endTime}` : "N/A",
      facility: facilityDisplay,
      equipment: equipmentRequested,
      requestor: formatName(data.fullName),
      endorser: data.endorserName ? formatName(data.endorserName) : 'N/A',
      fullData: data // Kept for modal injection
    };
  });

  // 4. NAVIGATION CONTROLLERS
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

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
      calendar.push({
        name: dayNames[d.getDay()],
        num: d.getDate(),
        date: formatDate(d),
        isGrayedOut: true
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      calendar.push({
        name: dayNames[d.getDay()],
        num: i,
        date: formatDate(d),
        isGrayedOut: false
      });
    }

    let nextMonthDay = 1;
    while (calendar.length < 42) {
      const d = new Date(year, month + 1, nextMonthDay);
      calendar.push({
        name: dayNames[d.getDay()],
        num: nextMonthDay,
        date: formatDate(d),
        isGrayedOut: true
      });
      nextMonthDay++;
    }

    return calendar;
  };

  const calendarDays = generateCalendar();
  const currentMonthYearString = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar-page-container">
      
      {/* --- LEFT: MAIN CALENDAR --- */}
      <div className="calendar-main">
        <div className="calendar-header">
          <div className="month-nav">
            <button className="icon-btn" onClick={handlePrevMonth}>&#10094;</button>
            <h2>{currentMonthYearString}</h2>
            <button className="icon-btn" onClick={handleNextMonth}>&#10095;</button>
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

          {/* DYNAMIC RENDER LOOP */}
          {calendarDays.map((day, index) => {
            const daysEvents = events.filter(e => e.date === day.date);
            const isEmpty = daysEvents.length === 0;

            return (
              <div 
                key={index} 
                onClick={() => setSelectedDate(day.date)}
                style={{ cursor: 'pointer' }}
                className={`day-cell ${isEmpty ? 'empty-day' : ''} ${day.isGrayedOut ? 'prev-month' : ''} ${selectedDate === day.date ? 'active-day' : ''}`}
              >
                <span className="date"><span>{day.name}</span> {day.num}</span>
                
                {daysEvents.map(event => (
                  <div key={event.id} className={`event-pill pill-${event.status}`}>
                    {event.title}
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
          const sidebarEvents = events.filter(e => e.date === selectedDate);
          const approvedCount = sidebarEvents.filter(e => e.status === 'green').length;
          const pendingCount = sidebarEvents.filter(e => e.status === 'yellow').length;
          const rejectedCount = sidebarEvents.filter(e => e.status === 'red').length;
          
          const displayDate = selectedDate 
            ? new Date(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })
            : "Select a date";

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
                <div className="stat-box">
                  <span className="stat-num text-green">{approvedCount}</span>
                  <span className="stat-label">Approved</span>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-box">
                  <span className="stat-num text-yellow">{pendingCount}</span>
                  <span className="stat-label">Pending</span>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-box">
                  <span className="stat-num text-red">{rejectedCount}</span>
                  <span className="stat-label">Rejected</span>
                </div>
              </div>

              <div className="event-cards">
                {sidebarEvents.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
                    No reservations scheduled for this date.
                  </p>
                ) : (
                  sidebarEvents.map(event => (
                    <div key={event.id} className="event-card">
                      <div className="card-top">
                        <h4>{event.title}</h4>
                        <span className={`status-badge bg-${event.status}`}>
                          {event.status === 'green' ? 'Approved' : event.status === 'red' ? 'Rejected' : 'Pending'}
                        </span>
                      </div>
                      <div className="card-details">
                        <p><i className="ph ph-user"></i> {event.requestor}</p>
                        <p><i className="ph ph-clock"></i> {event.time}</p>
                        <p><i className="ph ph-buildings"></i> {event.facility}</p>
                        <p><i className="ph ph-package"></i> {event.equipment}</p>
                        <p><i className="ph ph-signature"></i> {event.endorser}</p>
                      </div>
                      <div className="card-actions">
                        <button className="btn-view" onClick={() => setSelectedRequest(event.fullData)}>
                          View Details
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* --- MODAL POPUP --- */}
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setSelectedRequest(null)}>
              ✕
            </button>
            <div className="modal-content">
              <ReservationDetails data={selectedRequest} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Calendar;