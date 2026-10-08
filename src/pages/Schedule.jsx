import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { sendReservationEmail } from '../services/emailService'; 
import '../styles/Schedule.scss';
import ReservationDetails from './ReservationDetails';

// --- UPDATED EXPIRATION LOGIC ---
const isExpired = (eventDate, endDate, startTime, endTime, status, days = 1) => {
  if (!eventDate) return false;
  const now = new Date();
  
  const [month, day, year] = eventDate.split('/').map(Number);
  if (!month || !day || !year) return false;

  const isApproved = (status || '').toLowerCase() === 'approved';

  // Rule 1: If eventDate is today and hasn't gotten approved yet, account for startTime (if added)
  const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDateOnly = new Date(year, month - 1, day);
  const isToday = eventDateOnly.getTime() === todayDateOnly.getTime();

  if (isToday && !isApproved) {
    if (startTime && startTime !== 'N/A') {
      const matchStart = startTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (matchStart) {
        let [ , sHours, sMins, sMod ] = matchStart;
        sHours = parseInt(sHours, 10);
        if (sHours === 12 && sMod.toUpperCase() === 'AM') sHours = 0;
        if (sHours < 12 && sMod.toUpperCase() === 'PM') sHours += 12;
        const startDateTime = new Date(year, month - 1, day, sHours, parseInt(sMins, 10));
        if (now > startDateTime) return true;
      }
    } else {
      // If no start time is added, expires at the end of today
      const endOfToday = new Date(year, month - 1, day, 23, 59, 59);
      if (now > endOfToday) return true;
    }
  }

  // Rule 2 & 3: Calculate final expiration date (accounting for endDate or multi-day span)
  let finalYear = year, finalMonth = month - 1, finalDay = day;
  
  if (endDate) {
    const [em, ed, ey] = endDate.split('/').map(Number);
    if (em && ed && ey) {
      finalYear = ey;
      finalMonth = em - 1;
      finalDay = ed;
    }
  } else {
    const parsedDays = parseInt(days, 10) || 1;
    const baseDate = new Date(year, month - 1, day);
    baseDate.setDate(baseDate.getDate() + (parsedDays - 1));
    finalYear = baseDate.getFullYear();
    finalMonth = baseDate.getMonth();
    finalDay = baseDate.getDate();
  }
  
  let endDateTime;
  if (endTime && endTime !== 'N/A') {
    const match = endTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let [ , hours, minutes, modifier ] = match;
      hours = parseInt(hours, 10);
      if (hours === 12 && modifier.toUpperCase() === 'AM') hours = 0;
      if (hours < 12 && modifier.toUpperCase() === 'PM') hours += 12;
      
      endDateTime = new Date(finalYear, finalMonth, finalDay, hours, parseInt(minutes, 10));
    }
  }
  
  if (!endDateTime) {
    endDateTime = new Date(finalYear, finalMonth, finalDay, 23, 59, 59);
  }

  return now > endDateTime;
};

const Schedule = () => {
  // --- STATE MANAGEMENT ---
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [deleteModalData, setDeleteModalData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reservationsData, setReservationsData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [approverRoleKey, setApproverRoleKey] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  
  // Auto-Removal Alert State
  const [autoRemovedAlerts, setAutoRemovedAlerts] = useState([]);
  
  const itemsPerPage = 5;

  // --- REAL-TIME FIRESTORE LISTENERS ---
  useEffect(() => {
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const resList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReservationsData(resList);
    }, (error) => console.error('Failed to load reservations:', error));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsersData(usersList);
    }, (error) => console.error('Failed to load users:', error));

    return () => {
      unsubRes();
      unsubUsers();
    };
  }, []);

  // --- FETCH CURRENT USER ROLE & DATA ---
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
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
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- AUTO-REMOVE EXPIRED RESERVATIONS ---
  useEffect(() => {
    if (!currentUser || reservationsData.length === 0) return;

    const checkExpirations = async () => {
      const expiredEvents = [];

      for (const res of reservationsData) {
        if (res.userId === currentUser.uid || res.userEmail === currentUser.email) {
           if (isExpired(res.eventDate, res.endDate, res.startTime, res.endTime, res.status, res.days)) {
              expiredEvents.push(res.eventName || 'Untitled Event');
              try {
                await sendReservationEmail(
                  res.userEmail, 
                  res.fullName, 
                  res, 
                  "Your schedule exceeded the given time and/or date and was auto-removed."
                );
                
                await deleteDoc(doc(db, 'reservations', res.id));
              } catch (e) {
                console.error("Error auto-deleting", e);
              }
           }
        }
      }

      if (expiredEvents.length > 0) {
         setAutoRemovedAlerts(prev => {
           const newAlerts = expiredEvents.filter(e => !prev.includes(e));
           return [...prev, ...newAlerts];
         });
      }
    };

    checkExpirations();
  }, [reservationsData, currentUser]);

  // --- MAP & JOIN DATA ---
  const scheduleData = reservationsData
    .filter(res => currentUser && (res.userId === currentUser.uid || res.userEmail === currentUser.email))
    .map((res, index) => {
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

      const icons = ['icon-blue', 'icon-purple', 'icon-yellow', 'icon-green', 'icon-pink'];
      const iconClass = icons[index % icons.length];

      let displayRole = 'Requestor';
      if (requestor.role) {
        displayRole = requestor.role.replace(/_/g, ' ').toUpperCase();
      }

      const fullName = (requestor.name || res.fullName || 'Unknown User')
        .replace(/\s*\(Student\)/i, '')
        .trim();
      const [lastName, ...givenNames] = fullName.split(',');
      const cleanName = givenNames.length
        ? `${givenNames.join(',').trim()} ${lastName.trim()}`
        : fullName;

      const getScheduleStatus = () => {
        const status = (res.status || 'Pending').toLowerCase();
        if (status === 'approved') return 'approved';
        if (status === 'rejected') return 'rejected';
        return 'pending'; 
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
        scheduleStatus: getScheduleStatus(),
        iconClass: iconClass,
        icon: 'ph-calendar-check',
        rawDate: res.createdAt ? new Date(res.createdAt) : new Date(0),
        fullData: res 
      };
    }).sort((a, b) => b.rawDate - a.rawDate); 

  // --- SEARCH & FILTER LOGIC ---
  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); 
  };

  const filteredData = scheduleData.filter((row) =>
    row.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- PAGINATION LOGIC ---
  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  // --- DELETION LOGIC ---
  const confirmDelete = async () => {
    if (!deleteModalData) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'reservations', deleteModalData.id));
      setDeleteModalData(null);
    } catch (error) {
      console.error("Error deleting reservation:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="schedule-container">
      <div className="schedule-main-card">
        <div className="card-header">
          <div className="title-group">
            <h3>Schedule</h3>
          </div>
          <div className="controls-group">
            <div className="search-box">
              <i className="ph ph-magnifying-glass"></i>
              <input 
                type="text" 
                placeholder="Search requests..." 
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <div className="col-event">EVENT NAME</div>
            <div className="col-requestor">REQUESTOR</div>
            <div className="col-resources">RESOURCES</div>
            <div className="col-date">DATE</div>
            <div className="col-action">ACTION</div>
          </div>

          <div className="table-body">
            {currentData.length > 0 ? (
              currentData.map((row) => (
                <div className="table-row" key={row.id}>
                  <div className="col-event">
                    <div className="event-details">
                      <strong>
                        {row.event}
                        {row.scheduleStatus === 'pending' && <span className="status-dot pending" title="Pending"></span>}
                        {row.scheduleStatus === 'approved' && <span className="status-dot approved" title="Approved"></span>}
                        {row.scheduleStatus === 'rejected' && <span className="status-dot rejected" title="Rejected"></span>}
                      </strong>
                      <span>Submitted {row.submit}</span>
                    </div>
                  </div>
                  <div className="col-requestor">
                    {row.avatarUrl ? (
                      <img src={row.avatarUrl} alt="Avatar" className="avatar avatar-cover" />
                    ) : (
                      <div className="avatar">{row.initial}</div>
                    )}
                    <div className="requestor-details">
                      <strong>{row.name}</strong>
                      <span>{row.role}</span>
                    </div>
                  </div>
                  <div className="col-resources">{row.equip}</div>
                  <div className="col-date">
                    <div className="date-details">
                      <strong>{row.date}</strong>
                      <span>{row.time}</span>
                    </div>
                  </div>
                  <div className="col-action">
                    <button className="btn-view" onClick={() => setSelectedRequest(row)}>
                      <i className="ph ph-eye"></i> View Details
                    </button>
                    <button className="btn-delete" onClick={() => setDeleteModalData(row)} title="Delete Reservation">
                      <i className="ph ph-x"></i>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-events-message">
                No matching events found.
              </div>
            )}
          </div>
        </div>

        <div className="card-footer">
          <span className="showing-text">
            Showing {currentData.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filteredData.length)} of {filteredData.length} requests
          </span>
          <div className="pagination">
            <button 
              disabled={currentPage === 1} 
              onClick={handlePrevPage}
            >
              Prev
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button 
                key={page}
                className={currentPage === page ? 'active' : ''} 
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}

            <button 
              disabled={currentPage === totalPages || filteredData.length === 0} 
              onClick={handleNextPage}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* --- MODAL POPUP --- */}
      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setSelectedRequest(null)}>
              ✕
            </button>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <ReservationDetails data={selectedRequest.fullData} />
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deleteModalData && (
        <div className="modal-overlay delete-modal-overlay">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title error">Confirm Deletion</h3>
            <p className="modal-message">
              Are you sure you want to delete the reservation for <strong>{deleteModalData.event}</strong>? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button 
                onClick={() => setDeleteModalData(null)}
                className="modal-button btn-modal-cancel"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="modal-button btn-modal-confirm"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- AUTO-REMOVED NOTIFICATION MODAL --- */}
      {autoRemovedAlerts.length > 0 && (
        <div className="modal-overlay delete-modal-overlay">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title error">Auto-Removed</h3>
            <div className="modal-message">
              Your schedule exceeded the given time and/or date for the following event(s):
              <ul className="auto-removed-list">
                {autoRemovedAlerts.map((evt, idx) => (
                  <li key={idx}>{evt}</li>
                ))}
              </ul>
            </div>
            <div className="modal-actions">
              <button 
                onClick={() => setAutoRemovedAlerts([])}
                className="modal-button btn-modal-cancel btn-modal-acknowledge"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;