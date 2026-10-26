import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from "../Firebase";
import { collection, onSnapshot, doc, getDoc, writeBatch } from "firebase/firestore";
import { useNavigate } from 'react-router-dom';
import "../styles/Calendar.scss";
import ReservationDetails from './ReservationDetails';
import { getApprovalTrackerSteps, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
import { isReservationEndReached } from '../services/reservationExpiration';

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

// --- EVENT DATE RANGE FORMATTER HELPER ---
const formatEventDateRange = (startDateStr, endDateStr, numDays) => {
  if (!startDateStr) return 'N/A';
  if (endDateStr && endDateStr !== startDateStr) {
    return `${startDateStr} - ${endDateStr}`;
  }
  const daysCount = Number(numDays) || 1;
  if (daysCount <= 1) return startDateStr;
  
  let parts = startDateStr.split(/[\/\-]/);
  if (parts.length !== 3) return startDateStr;
  const [m, d, y] = parts.map(Number);
  const current = new Date(y, m - 1, d);
  current.setDate(current.getDate() + (daysCount - 1));
  const mm = String(current.getMonth() + 1).padStart(2, '0');
  const dd = String(current.getDate()).padStart(2, '0');
  const yy = current.getFullYear();
  const endFormatted = `${mm}/${dd}/${yy}`;
  
  return `${startDateStr} - ${endFormatted}`;
};

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2000, month, 1).toLocaleString('default', { month: 'long' })
);

const Calendar = ({ currentUserRole }) => {
  const navigate = useNavigate();
  // 1. STATE & REFS
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const [reservationsData, setReservationsData] = useState([]);
  const [historyData, setHistoryData] = useState([]); 
  const [facilitiesMap, setFacilitiesMap] = useState({});
  const [equipmentMap, setEquipmentMap] = useState({});
  const [utilitiesMap, setUtilitiesMap] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [userRole, setUserRole] = useState('');
  
  const sidebarRef = useRef(null);
  
  // ARCHIVE STATES
  const [isArchiveVisible, setIsArchiveVisible] = useState(false);
  const [showArchiveList, setShowArchiveList] = useState(false);
  const [historySelectedRequest, setHistorySelectedRequest] = useState(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState('All');
  const [archiveSort, setArchiveSort] = useState('Latest');
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const [currentUser, setCurrentUser] = useState(null);

  const handleDateClick = (dateStr) => {
    setSelectedDate(dateStr);
    if (!window.matchMedia('(min-width: 51.2rem)').matches && sidebarRef.current) {
      setTimeout(() => {
        sidebarRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  const toggleArchiveMode = () => {
    setIsArchiveVisible(v => {
      const next = !v;
      if (!next) setShowArchiveList(false); 
      return next;
    });
  };

  // 1.5. FETCH CURRENT USER ROLE
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
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

  // 2. LIVE LISTENERS
  useEffect(() => {
    if (!currentUser) return;

    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const resData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservationsData(resData);
    }, (error) => console.error('Failed to load reservations:', error));

    const unsubHistory = onSnapshot(collection(db, 'archive'), (snapshot) => {
      setHistoryData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error('Failed to load archive:', error));

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

    const unsubUtilities = onSnapshot(collection(db, 'utilities'), (snapshot) => {
      const uMap = {};
      snapshot.forEach(doc => { uMap[doc.id] = doc.data(); });
      setUtilitiesMap(uMap);
    }, (error) => console.error('Failed to load utilities:', error));

    return () => { unsubRes(); unsubHistory(); unsubFac(); unsubEq(); unsubUtilities(); };
  }, [currentUser]);

  // 3. REUSABLE MAPPING FUNCTION WITH RANGE EXPANSION
  const mapToEvents = (sourceData, includeRejected = false, isHistoryEvent = false) => {
    return sourceData.flatMap(data => {
      const status = (data.status || 'pending').toLowerCase().trim();
      if (status === 'rejected' && !includeRejected) return [];
      
      let uiStatusColor = 'yellow'; 
      if (status === 'approved') uiStatusColor = 'green';
      if (status === 'pending') uiStatusColor = 'yellow';
      if (status === 'cancelled') uiStatusColor = 'gray';
      if (status === 'rejected') uiStatusColor = 'red';
      if (status === 'expired') uiStatusColor = 'charcoal';

      const facilityNames = (data.facilities || []).map(id => facilitiesMap[id]?.name || id);
      const facilityDisplay = facilityNames.length > 0 ? facilityNames.join(', ') : 'N/A';
      
      const equipArray = Object.entries(data.selectedEquip || {})
        .filter(([id, qty]) => Number(qty) > 0)
        .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
      if (typeof data.otherEquipment === 'string' && data.otherEquipment.trim()) {
        equipArray.push(data.otherEquipment.trim());
      }
      const equipmentRequested = equipArray.length > 0 ? equipArray.join(', ') : 'N/A';

      const datesRange = getDatesInRange(data.eventDate || data.date, data.days || 1);

      return datesRange.map((dateStr, index) => {
        return {
          id: `${data.id}-${index}`,
          originalId: data.id,
          title: data.eventName || data.title || "Untitled Event",
          date: dateStr,
          status: uiStatusColor, 
          time: (data.startTime && data.endTime) ? `${data.startTime} - ${data.endTime}` : "N/A",
          startTimeOnly: data.startTime || "",
          facility: facilityDisplay,
          equipment: equipmentRequested,
          requestor: formatName(data.fullName),
          endorser: data.endorserName ? formatName(data.endorserName) : 'N/A',
          isStart: index === 0,
          isHistory: isHistoryEvent, 
          fullData: data 
        };
      });
    });
  };

  const activeEvents = mapToEvents(reservationsData);
  const activeReservationIds = new Set(reservationsData.map(({ id }) => id));
  const archivedRecords = historyData.filter(({ id }) => !activeReservationIds.has(id));
  const historyEvents = mapToEvents(archivedRecords, true, true);

  const events = isArchiveVisible ? historyEvents : activeEvents;

  const normalizedRole = (currentUserRole || userRole).toLowerCase().trim();
  const normalizedRoleKey = normalizedRole.replace(/_/g, ' ');
  const canModifyReservations = ['mis', 'mis admin', 'building admin', 'super admin'].includes(normalizedRoleKey);
  const canModifySelectedRequest = Boolean(
    selectedRequest
    && (selectedRequest.status || '').toLowerCase().trim() === 'approved'
    && canModifyReservations
    && reservationsData.some((reservation) => reservation.id === selectedRequest.id)
    && !isReservationEndReached(selectedRequest)
  );
  const canOpenArchiveList = ['mis', 'mis admin', 'building admin', 'super admin'].includes(
    normalizedRole.replace(/_/g, ' ')
  );

  // --- ARCHIVE COMPUTATIONS ---
  const filteredHistory = archivedRecords.filter(item => {
    const statusMatch = archiveFilter === 'All' || (item.status || '').toLowerCase() === archiveFilter.toLowerCase();
    const searchStr = archiveSearch.toLowerCase();
    const textMatch = !searchStr || 
       (item.refNo || '').toLowerCase().includes(searchStr) ||
       (item.eventName || '').toLowerCase().includes(searchStr) ||
       (item.fullName || '').toLowerCase().includes(searchStr) ||
       (item.eventDate || '').toLowerCase().includes(searchStr);
    return statusMatch && textMatch;
  }).sort((a, b) => {
    const dateA = new Date(a.createdAt || a.eventDate || 0).getTime();
    const dateB = new Date(b.createdAt || b.eventDate || 0).getTime();
    return archiveSort === 'Latest' ? dateB - dateA : dateA - dateB;
  });

  const archivedReservation = historySelectedRequest?.fullData;
  const submittedAt = archivedReservation?.createdAt;
  const submittedDate = submittedAt
    ? (typeof submittedAt.toDate === 'function' ? submittedAt.toDate() : new Date(submittedAt))
    : null;
  const archiveDateSubmitted = submittedDate && !Number.isNaN(submittedDate.getTime())
    ? submittedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown';
  const archivedRequestorRole = (
    archivedReservation?.userRole
    || archivedReservation?.role
    || 'requestor'
  ).toLowerCase().trim();
  const archiveTrackerSteps = archivedReservation
    ? getApprovalTrackerSteps({
      approvals: archivedReservation.approvals,
      dateSubmitted: archiveDateSubmitted,
      hasEndorser: Boolean(archivedReservation.endorserName),
      isStaffRequestor: !['requestor', 'user'].includes(archivedRequestorRole),
      isRoomCheckerRequestor: normalizeApprovalRoleKey(archivedRequestorRole) === 'room checker',
      hasSpecificRoom: Boolean(archivedReservation.specificRoom?.trim()),
      reservationStatus: archivedReservation.status
    })
    : [];

  const handleViewArchiveItem = (data) => {
    const facilityNames = (data.facilities || []).map(id => facilitiesMap[id]?.name || id);
    const facilityDisplay = facilityNames.length > 0 ? facilityNames.join(', ') : 'N/A';
    
    const equipArray = Object.entries(data.selectedEquip || {})
      .filter(([id, qty]) => Number(qty) > 0)
      .map(([id, qty]) => `${qty}x ${equipmentMap[id]?.name || id}`);
    if (typeof data.otherEquipment === 'string' && data.otherEquipment.trim()) {
      equipArray.push(data.otherEquipment.trim());
    }
    const equipmentRequested = equipArray.length > 0 ? equipArray.join(', ') : 'N/A';

    setHistorySelectedRequest({
      title: data.eventName || data.title || "Untitled Event",
      date: formatEventDateRange(data.eventDate, data.endDate, data.days),
      time: (data.startTime && data.endTime) ? `${data.startTime} - ${data.endTime}` : "N/A",
      facility: facilityDisplay,
      equipment: equipmentRequested,
      requestor: formatName(data.fullName),
      endorser: data.endorserName ? formatName(data.endorserName) : 'N/A',
      fullData: data
    });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleteError('');
    try {
      if (itemToDelete.type === 'single') {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'archive', itemToDelete.id));
        batch.delete(doc(db, 'reservations', itemToDelete.id));
        await batch.commit();
      } else if (itemToDelete.type === 'all') {
        for (let startIndex = 0; startIndex < filteredHistory.length; startIndex += 250) {
          const batch = writeBatch(db);
          filteredHistory.slice(startIndex, startIndex + 250).forEach(item => {
            batch.delete(doc(db, 'archive', item.id));
            batch.delete(doc(db, 'reservations', item.id));
          });
          await batch.commit();
        }
      }
      setItemToDelete(null);
    } catch (error) {
      console.error("Error deleting history:", error);
      setDeleteError('Failed to delete reservation. Please try again.');
    }
  };

  // 4. NAVIGATION CONTROLLERS
  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

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
  const firstYearOption = Math.min(1950, currentDate.getFullYear() - 20);
  const lastYearOption = Math.max(new Date().getFullYear() + 20, currentDate.getFullYear() + 20);
  const yearOptions = Array.from(
    { length: lastYearOption - firstYearOption + 1 },
    (_, index) => firstYearOption + index
  );

  return (
    <div className="calendar-page-container">
      
      {/* --- LEFT: MAIN CALENDAR / ARCHIVE SUMMARY --- */}
      <div className={`calendar-main ${showArchiveList ? 'archive-active' : ''}`}>
        <div className="calendar-header">
          <div className="month-nav">
            {!showArchiveList && (
              <>
                <button className="icon-btn" onClick={handlePrevMonth}>&#10094;</button>
                <details className="month-picker">
                  <summary className="month-picker-trigger" aria-label={`Choose month and year, currently ${currentMonthYearString}`}>
                    {currentMonthYearString}
                  </summary>
                  <div className="month-picker-menu">
                    <label>
                      Month
                      <select
                        value={currentDate.getMonth()}
                        onChange={(event) => setCurrentDate(new Date(
                          currentDate.getFullYear(),
                          Number(event.target.value),
                          1
                        ))}
                      >
                        {monthNames.map((monthName, month) => (
                          <option key={month} value={month}>{monthName}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Year
                      <select
                        value={currentDate.getFullYear()}
                        onChange={(event) => setCurrentDate(new Date(
                          Number(event.target.value),
                          currentDate.getMonth(),
                          1
                        ))}
                      >
                        {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </label>
                  </div>
                </details>
                <button className="icon-btn" onClick={handleNextMonth}>&#10095;</button>
              </>
            )}
            
            <button
              className="history-btn"
              onClick={toggleArchiveMode}
              aria-expanded={isArchiveVisible}
            >
              {isArchiveVisible ? 'View Active' : 'View Archive'}
            </button>
          </div>
          
          <div className="header-right" style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.8rem' }}>
            <div className="calendar-legend" style={{ margin: 0 }}>
              {/* Only show Pending if we are NOT in the Archive View */}
              {!isArchiveVisible && (
                <span className="legend-item"><span className="dot dot-yellow"></span> Pending</span>
              )}
              
              <span className="legend-item"><span className="dot dot-green"></span> Approved</span>
              
              {isArchiveVisible && (
                <>
                  <span className="legend-item"><span className="dot dot-red"></span> Rejected</span>
                  <span className="legend-item"><span className="dot dot-gray"></span> Cancelled</span>
                  <span className="legend-item"><span className="dot dot-charcoal"></span> Expired</span>
                </>
              )}
            </div>
            
            {/* The new button underneath the legend */}
            {canOpenArchiveList && isArchiveVisible && !showArchiveList && (
              <button 
                className="history-btn" 
                onClick={() => setShowArchiveList(true)}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                Open Archive List
              </button>
            )}
            {canOpenArchiveList && showArchiveList && (
              <button 
                className="history-btn" 
                onClick={() => setShowArchiveList(false)}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                Back to Calendar
              </button>
            )}
          </div>
        </div>

        {showArchiveList ? (
          <div className="archive-summary-view">
            <div className="archive-controls">
              <div className="controls-left">
                <input 
                  type="text" 
                  placeholder="Search Ref No, Event, Name..." 
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                />
                <select value={archiveFilter} onChange={(e) => setArchiveFilter(e.target.value)}>
                  <option value="All">All Status</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Expired">Expired</option>
                </select>
              </div>
              <div className="controls-right">
                <select value={archiveSort} onChange={(e) => setArchiveSort(e.target.value)}>
                  <option value="Latest">Latest First</option>
                  <option value="Oldest">Oldest First</option>
                </select>
                <button className="btn-danger" onClick={() => {
                  setDeleteError('');
                  setItemToDelete({ type: 'all' });
                }} disabled={filteredHistory.length === 0}>
                  Delete All
                </button>
              </div>
            </div>

            <div className="archive-list">
              {filteredHistory.length === 0 ? (
                <div className="empty-state-text">No matching records found.</div>
              ) : (
                filteredHistory.map(item => {
                  const itemStatus = (item.status || '').toLowerCase().trim();

                  return (
                    <div key={item.id} className="archive-list-item">
                      <div className="item-info">
                        <div className="item-ref">{item.refNo}</div>
                        <div className="item-title">{item.eventName}</div>
                        <div className="item-meta">{item.eventDate} | {formatName(item.fullName)}</div>
                      </div>
                      <div className={`item-status status-${itemStatus}`}>
                        {item.status}
                      </div>
                      <div className="item-actions">
                        <button className="btn-view" onClick={() => handleViewArchiveItem(item)}>View</button>
                        <button className="btn-delete" onClick={() => {
                          setDeleteError('');
                          setItemToDelete({ type: 'single', id: item.id });
                        }}>Delete</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
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
                  onClick={() => handleDateClick(day.date)}
                  className={`day-cell ${isEmpty ? 'empty-day' : ''} ${day.isGrayedOut ? 'prev-month' : ''} ${selectedDate === day.date ? 'active-day' : ''}`}
                >
                  <span className="date"><span>{day.name}</span> {day.num}</span>
                  {daysEvents.map(event => (
                    <div 
                      key={event.id} 
                      className={`event-pill pill-${event.status}`}
                      title={event.title}
                    >
                      {event.startTimeOnly && event.startTimeOnly !== "N/A" && (
                        <span className="event-pill-time">{event.startTimeOnly}</span>
                      )}
                      <span className="event-pill-title">{event.title}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- RIGHT: SIDEBAR DETAILS (HIDDEN IN ARCHIVE LIST VIEW) --- */}
      {!showArchiveList && (
        <div className="calendar-sidebar" ref={sidebarRef}>
          {(() => {
            const sidebarEvents = events.filter(e => e.date === selectedDate); 
            const approvedCount = sidebarEvents.filter(e => e.status === 'green').length;
            const pendingCount = sidebarEvents.filter(e => e.status === 'yellow').length;
            const displayDate = selectedDate ? new Date(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' }) : "Select a date";

            return (
              <>
                <div className="sidebar-header">
                  <div>
                    <h3>{displayDate}</h3>
                    <p>{isArchiveVisible ? "Archived reservations for selected date" : "All reservations for selected date"}</p>
                  </div>
                  <span className="event-count">{sidebarEvents.length} events</span>
                </div>
                
                {!isArchiveVisible && (
                  <div className="sidebar-stats">
                    <div className="stat-box"><span className="stat-num text-green">{approvedCount}</span><span className="stat-label">Approved</span></div>
                    <div className="stat-divider"></div>
                    <div className="stat-box"><span className="stat-num text-yellow">{pendingCount}</span><span className="stat-label">Pending</span></div>
                  </div>
                )}

                <div className="event-cards">
                  {sidebarEvents.length === 0 ? (
                    <p className="empty-state-text">No reservations scheduled for this date.</p>
                  ) : (
                    sidebarEvents.map(event => (
                      <div key={event.id} className="event-card">
                        <div className="card-top">
                          <span className={`status-badge bg-${event.status}`}>
                            {event.status === 'green' ? 'Approved' : event.status === 'yellow' ? 'Pending' : event.status === 'red' ? 'Rejected' : event.status === 'charcoal' ? 'Expired' : 'Cancelled'}
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
                          <button 
                            className="btn-view" 
                            onClick={() => {
                              if (event.isHistory) {
                                setHistorySelectedRequest(event);
                              } else {
                                setSelectedRequest(event.fullData);
                              }
                            }}
                          >
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
      )}

      {/* --- MODAL POPUP FOR ACTIVE DETAILS --- */}
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setSelectedRequest(null)}>✕</button>
            <div className="modal-content">
              <ReservationDetails
                data={selectedRequest}
                additionalActions={canModifySelectedRequest ? (
                  <div className="calendar-modify-actions">
                    <button
                      type="button"
                      className="calendar-modify-button"
                      onClick={() => navigate(`/reserve?edit=${encodeURIComponent(selectedRequest.id)}&adminEdit=true`)}
                    >
                      Edit Reservation
                    </button>
                  </div>
                ) : null}
              />
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
                      <div>
                        <div className="details-label">Event Date</div>
                        <div className="details-value">
                          {formatEventDateRange(historySelectedRequest.fullData.eventDate, historySelectedRequest.fullData.endDate, historySelectedRequest.fullData.days)}
                        </div>
                      </div>
                      <div><div className="details-label">Time</div><div className="details-value">{historySelectedRequest.time || 'N/A – N/A'}</div></div>
                      <div className="details-full-width"><div className="details-label">Expected Attendees</div><div className="details-value">{historySelectedRequest.fullData.expectedParticipants || 'N/A'}</div></div>
                      <div className="details-full-width"><div className="details-label">Event Description / Purpose</div><div className="details-value">{historySelectedRequest.fullData.purpose || 'N/A'}</div></div>
                    </div>
                  </div>

                  {historySelectedRequest.fullData.cancellationRemark && (
                    <div className="details-card">
                      <h3 className="details-card-header">Cancellation Remark</h3>
                      <div className="details-grid">
                        <div className="details-full-width">
                          <div className="details-value">{historySelectedRequest.fullData.cancellationRemark}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {historySelectedRequest.fullData.rejectionRemark && (
                    <div className="details-card">
                      <h3 className="details-card-header">Rejection Remark</h3>
                      <div className="details-grid">
                        <div className="details-full-width">
                          <div className="details-value">{historySelectedRequest.fullData.rejectionRemark}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {historySelectedRequest.fullData.modificationRemark && (
                    <div className="details-card">
                      <h3 className="details-card-header">Requested Changes</h3>
                      <div className="details-grid">
                        <div className="details-full-width">
                          <div className="details-value">{historySelectedRequest.fullData.modificationRemark}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="details-card">
                    <h3 className="details-card-header">🏢 Facility Details</h3>
                    <div className="details-grid">
                      <div><div className="details-label">Facility Name</div><div className="details-value">{historySelectedRequest.facility || 'None'}</div></div>
                      <div><div className="details-label">Room Capacity</div><div className="details-value">{historySelectedRequest.fullData.capacity || 'N/A'}</div></div>
                      <div><div className="details-label">Floor / Location</div><div className="details-value">{historySelectedRequest.fullData.location || 'N/A'}</div></div>
                      <div><div className="details-label">Air Conditioning</div><div className="details-value">{historySelectedRequest.fullData.aircon === true ? `ON${historySelectedRequest.fullData.airconOnTime || historySelectedRequest.fullData.airconOffTime ? ` (${historySelectedRequest.fullData.airconOnTime || '?'} - ${historySelectedRequest.fullData.airconOffTime || '?'})` : ''}` : (historySelectedRequest.fullData.aircon === false ? 'OFF' : 'N/A')}</div></div>
                      <div className="details-full-width"><div className="details-label">Utility Requested</div><div className="details-value">{[
                        ...(Array.isArray(historySelectedRequest.fullData.selectedUtilities)
                          ? historySelectedRequest.fullData.selectedUtilities.map((id) => utilitiesMap[id]?.name || id)
                          : []),
                        ...(typeof historySelectedRequest.fullData.otherUtility === 'string' && historySelectedRequest.fullData.otherUtility.trim()
                          ? [historySelectedRequest.fullData.otherUtility.trim()]
                          : [])
                      ].join(', ') || 'None'}</div></div>
                      <div className="details-full-width"><div className="details-label">Equipment Requested</div><div className="details-value">{historySelectedRequest.equipment || 'N/A'}</div></div>
                    </div>
                  </div>

                  <div className="details-card">
                    <h3 className="details-card-header">👤 Requestor Information</h3>
                    <div className="details-grid">
                      <div><div className="details-label">Full Name</div><div className="details-value">{historySelectedRequest.requestor || 'N/A'}</div></div>
                      <div><div className="details-label">Requestor Type</div><div className="details-value">{Array.isArray(historySelectedRequest.fullData.requestorTypes) && historySelectedRequest.fullData.requestorTypes.length > 0 ? historySelectedRequest.fullData.requestorTypes.join(', ') : 'N/A'}</div></div>
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

                  <div className="details-card archive-tracker-card">
                    <h3 className="details-card-header">📊 Approval Tracker</h3>
                    <div className="archive-tracker-pipeline">
                      {archiveTrackerSteps.map((step, index) => (
                        <div key={step.key} className={`archive-tracker-step ${step.state}`}>
                          {index < archiveTrackerSteps.length - 1 && <div className="archive-tracker-line" />}
                          <div className="archive-tracker-circle">
                            {step.state === 'approved' ? '✓' : step.state === 'rejected' ? '✕' : index + 1}
                          </div>
                          <div className="archive-tracker-title">{step.label}</div>
                          <span className="archive-tracker-status">{step.status}</span>
                          <div className="archive-tracker-date">{step.date}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="details-card archive-history-card">
                    <h3 className="details-card-header">📑 Approval History &amp; Remarks</h3>
                    <div className="archive-history-list">
                      <div className="archive-history-entry approved">
                        <strong>Requestor <span>Submitted</span></strong>
                        <span>{archiveDateSubmitted}</span>
                        <p>Reservation request submitted for {historySelectedRequest.title || 'Untitled Event'}.</p>
                      </div>
                      {(Array.isArray(historySelectedRequest.fullData.historyLogs)
                        ? historySelectedRequest.fullData.historyLogs
                        : []
                      ).map((log, index) => (
                        <div className={`archive-history-entry ${log.state || 'pending'}`} key={log.id || index}>
                          <strong>
                            {log.role || 'Approver'}
                            {log.badge && <span>{log.badge}</span>}
                          </strong>
                          <span>{log.date || 'Date unavailable'}{log.approverName ? ` · ${log.approverName}` : ''}</span>
                          <p>{log.text || 'No remarks provided.'}</p>
                        </div>
                      ))}
                      {historySelectedRequest.fullData.cancellationRemark && (
                        <div className="archive-history-entry cancelled">
                          <strong>Cancellation Remark</strong>
                          <span>{historySelectedRequest.fullData.cancelledAt || 'Date unavailable'}</span>
                          <p>{historySelectedRequest.fullData.cancellationRemark}</p>
                        </div>
                      )}
                      {historySelectedRequest.fullData.rejectionRemark && (
                        <div className="archive-history-entry rejected">
                          <strong>Rejection Remark</strong>
                          <span>{historySelectedRequest.fullData.rejectedAt || 'Date unavailable'}</span>
                          <p>{historySelectedRequest.fullData.rejectionRemark}</p>
                        </div>
                      )}
                      {historySelectedRequest.fullData.expiredAt && (
                        <div className="archive-history-entry pending">
                          <strong>Reservation Expired</strong>
                          <span>{historySelectedRequest.fullData.expiredAt}</span>
                          <p>Pending reservation expired after its scheduled start date and time.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="details-right-column details-card">
                  <h3 className="summary-header">Reservation Summary</h3>
                  <div className="summary-list">
                    <div><div className="details-label">Reference No.</div><div className="details-value summary-ref">{historySelectedRequest.fullData.refNo || 'N/A'}</div></div>
                    <div><div className="details-label">Facility</div><div className="details-value">{historySelectedRequest.facility || 'None'}</div></div>
                    <div><div className="details-label">Equipment</div><div className="details-value">{historySelectedRequest.equipment || 'N/A'}</div></div>
                    <div>
                      <div className="details-label">Event Date</div>
                      <div className="details-value">
                        {formatEventDateRange(historySelectedRequest.fullData.eventDate, historySelectedRequest.fullData.endDate, historySelectedRequest.fullData.days)}
                      </div>
                    </div>
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

      {/* --- CONFIRM DELETE MODAL --- */}
      {itemToDelete && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <h3 className="modal-title error">Confirm Deletion</h3>
            <p className="modal-message">
              {itemToDelete.type === 'all' 
                ? "Are you sure you want to permanently delete ALL matching archive records and their calendar reservations? This cannot be undone."
                : "Are you sure you want to permanently delete this archive record and its calendar reservation? This cannot be undone."}
            </p>
            {deleteError && <p className="modal-message" role="alert">{deleteError}</p>}
            <div className="modal-actions" style={{ gap: '0.8rem' }}>
              <button onClick={() => {
                setDeleteError('');
                setItemToDelete(null);
              }} className="btn-cancel">Cancel</button>
              <button onClick={confirmDelete} className="btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Calendar;