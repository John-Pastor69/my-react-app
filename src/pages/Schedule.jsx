import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import '../styles/Schedule.scss';
import ReservationDetails from './ReservationDetails';

const Schedule = () => {
  // --- STATE MANAGEMENT ---
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reservationsData, setReservationsData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const itemsPerPage = 5;

  // --- REAL-TIME FIRESTORE LISTENERS ---
  useEffect(() => {
    // Listen to all reservations
    const unsubRes = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const resList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReservationsData(resList);
    }, (error) => console.error('Failed to load reservations:', error));

    // Listen to all users (for joining profile pic, name, and role)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsersData(usersList);
    }, (error) => console.error('Failed to load users:', error));

    return () => {
      unsubRes();
      unsubUsers();
    };
  }, []);

  // --- MAP & JOIN DATA ---
  const scheduleData = reservationsData.map((res, index) => {
    // Find the user who made the reservation using their email or ID
    const requestor = usersData.find(u => u.email === res.userEmail || u.uid === res.userId) || {};
    
    // Format submission date
    let submitDate = 'Unknown';
    if (res.createdAt) {
      const d = new Date(res.createdAt);
      submitDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Determine equipment & facility summaries
    let equipCount = 0;
    if (res.selectedEquip) {
      equipCount = Object.values(res.selectedEquip).filter(val => Number(val) > 0).length;
    }
    const facCount = (res.facilities || []).length;
    let reqSubtext = '';
    if (facCount > 0 || equipCount > 0) reqSubtext = `${facCount} Facility, ${equipCount} Equipment`;
    else reqSubtext = 'No items requested';

    // Cycle through a few nice background colors for the icons
    const icons = ['icon-blue', 'icon-purple', 'icon-yellow', 'icon-green', 'icon-pink'];
    const iconClass = icons[index % icons.length];

    // Determine Role string
    let displayRole = 'Requestor';
    if (requestor.role) {
      displayRole = requestor.role.replace(/_/g, ' ').toUpperCase();
    }

    // Clean up name by removing "(Student)"
    let cleanName = requestor.name || res.fullName || 'Unknown User';
    cleanName = cleanName.replace(/\s*\(Student\)/i, '').trim();

    // --- SCHEDULE STATUS LOGIC ---
    const getScheduleStatus = () => {
      const status = (res.status || 'Pending').toLowerCase();
      if (status === 'approved') return 'approved';
      if (status === 'rejected') return 'rejected';
      return 'pending'; // Stays pending when first created
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
  }).sort((a, b) => b.rawDate - a.rawDate); // Sort newest first

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
                      <span>Submitted {row.submit} · {row.equip}</span>
                    </div>
                  </div>
                  <div className="col-requestor">
                    {/* Dynamic Avatar Loading */}
                    {row.avatarUrl ? (
                      <img src={row.avatarUrl} alt="Avatar" className="avatar" style={{ objectFit: 'cover' }} />
                    ) : (
                      <div className="avatar">{row.initial}</div>
                    )}
                    <div className="requestor-details">
                      <strong>{row.name}</strong>
                      <span>{row.role}</span>
                    </div>
                  </div>
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
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px', borderBottom: '1px solid #E2E8F0' }}>
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
            <div className="modal-content">
              <ReservationDetails data={selectedRequest.fullData} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;