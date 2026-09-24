import React, { useState, useEffect } from 'react';
import { db } from "../../Firebase";
import { collection, query, onSnapshot } from "firebase/firestore";
import "../../styles/mis/MisCalendar.scss";

const MisCalendar = () => {
  // 1. NEW STATE: Tracks the currently viewed month (defaults to today's date)
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState("");
  
  const [events, setEvents] = useState([]);

  // live websocket
  useEffect(() => {
    const q = query(collection(db, "reservations"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveData = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // Map database text to your UI colors
        let uiStatusColor = 'yellow'; // default
        if (data.status === 'approved') uiStatusColor = 'green';
        if (data.status === 'rejected') uiStatusColor = 'red';
        if (data.status === 'pending') uiStatusColor = 'yellow';

        return {
          id: doc.id,
          title: data.title || "Untitled Event",
          date: data.date, // must be "YYYY-MM-DD"
          status: uiStatusColor, 
          
          // Pulling extra data for the sidebar cards
          time: data.time || "TBA",
          facility: data.facility || "No facility assigned",
          requestor: data.requestor || "Unknown"
        };
      });

      setEvents(liveData);
    }, (error) => {
      console.error("Error fetching live calendar data:", error);
    });

    // Cleanup the listener when the user leaves the page
    return () => unsubscribe();
  }, []);

  // 2. NAVIGATION CONTROLLERS
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // 3. DYNAMIC CALENDAR GENERATOR
  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const calendar = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Helper to format dates as "YYYY-MM-DD" securely across all timezones
    const formatDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Step A: Fill empty slots from the PREVIOUS month
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

    // Step B: Fill the CURRENT month
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      calendar.push({
        name: dayNames[d.getDay()],
        num: i,
        date: formatDate(d),
        isGrayedOut: false
      });
    }

    // Step C: Fill empty slots for the NEXT month (Locks grid to exactly 42 cells / 6 rows)
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
  
  // Formats the header title (e.g., "November 2023") based on current state
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
                onClick={() => setSelectedDate(day.date)} // Sets the clicked date
                style={{ cursor: 'pointer' }} // Changes mouse to a clicking hand
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
      {/* --- RIGHT: SIDEBAR DETAILS --- */}
      <div className="calendar-sidebar">
        
        {/* Calculates sidebar data based on the clicked date */}
        {(() => {
          const sidebarEvents = events.filter(e => e.date === selectedDate);
          const approvedCount = sidebarEvents.filter(e => e.status === 'green').length;
          const pendingCount = sidebarEvents.filter(e => e.status === 'yellow').length;
          
          // Formats the selected date for the title (e.g., "Tuesday, Sep 15")
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
                          {event.status === 'green' ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                      <div className="card-details">
                        <p><i className="ph ph-clock"></i> {event.time}</p>
                        <p><i className="ph ph-map-pin"></i> {event.facility}</p>
                        <p><i className="ph ph-user"></i> {event.requestor}</p>
                      </div>
                      <div className="card-actions">
                        <button className="btn-view">View Details</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default MisCalendar;