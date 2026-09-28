import React, { useState } from 'react';
import '../styles/Schedule.scss';
import ReservationDetails from './ReservationDetails';

const Schedule = () => {
  // --- STATE MANAGEMENT ---
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const itemsPerPage = 5;

  const scheduleData = [
    {
      id: 1,
      event: 'Annual Tech Symposium',
      equip: 'Projector, Laptop, Mic',
      submit: 'Oct 20, 2023',
      name: 'Alex Johnson',
      dept: 'IT Department',
      date: 'Oct 24, 2023',
      time: '09:00 AM - 05:00 PM',
      iconClass: 'icon-blue',
      icon: 'ph-monitor-play',
      initial: 'A'
    },
    {
      id: 2,
      event: 'Team Offsite Workshop',
      equip: 'Monitor, Webcam',
      submit: 'Oct 22, 2023',
      name: 'Sarah Lee',
      dept: 'HR Department',
      date: 'Oct 28, 2023',
      time: '10:00 AM - 02:00 PM',
      iconClass: 'icon-purple',
      icon: 'ph-webcam',
      initial: 'S'
    },
    {
      id: 3,
      event: 'Q3 Marketing Review',
      equip: 'Video Conferencing Kit',
      submit: 'Oct 23, 2023',
      name: 'James Cruz',
      dept: 'Marketing',
      date: 'Nov 02, 2023',
      time: '01:00 PM - 03:30 PM',
      iconClass: 'icon-yellow',
      icon: 'ph-presentation-chart',
      initial: 'J'
    },
    {
      id: 4,
      event: 'Client Pitch Presentation',
      equip: 'Projector, Clicker, HDMI',
      submit: 'Oct 24, 2023',
      name: 'Nina Reyes',
      dept: 'Sales',
      date: 'Nov 05, 2023',
      time: '11:00 AM - 12:30 PM',
      iconClass: 'icon-green',
      icon: 'ph-lightning',
      initial: 'N'
    },
    {
      id: 5,
      event: 'Department All-Hands',
      equip: 'Wireless Mic, PA System',
      submit: 'Oct 25, 2023',
      name: 'Marco Tan',
      dept: 'Operations',
      date: 'Nov 10, 2023',
      time: '03:00 PM - 04:30 PM',
      iconClass: 'icon-pink',
      icon: 'ph-microphone-stage',
      initial: 'M'
    }
  ];

  // --- SEARCH & FILTER LOGIC ---
  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); 
  };

  const filteredData = scheduleData.filter((row) =>
    row.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.dept.toLowerCase().includes(searchQuery.toLowerCase())
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
            <p>Manage and track upcoming facility and equipment reservations</p>
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
                    <div className={`event-icon ${row.iconClass}`}>
                      <i className={`ph ${row.icon}`}></i>
                    </div>
                    <div className="event-details">
                      <strong>{row.event}</strong>
                      <span>Submitted {row.submit} · {row.equip}</span>
                    </div>
                  </div>
                  <div className="col-requestor">
                    <div className="avatar">{row.initial}</div>
                    <div className="requestor-details">
                      <strong>{row.name}</strong>
                      <span>{row.dept}</span>
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
            Showing {currentData.length > 0 ? startIndex + 1 : 0} to {startIndex + currentData.length} of {filteredData.length} requests
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
              disabled={currentPage === totalPages} 
              onClick={handleNextPage}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* --- UPDATED MODAL POPUP --- */}
      {selectedRequest && (
        <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
          <div className="modal-wrapper">
            <button className="close-modal-btn" onClick={() => setSelectedRequest(null)}>
              ✕
            </button>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <ReservationDetails data={selectedRequest} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedule;