import React from 'react';
import '../../styles/mis/calendar.scss'; // Make sure this path points correctly to your styles folder

const MisCalendar = () => {
  return (
    <div className="calendar-page-container">
      
      {/* LEFT SIDE: MAIN CALENDAR */}
      <div className="calendar-main">
        
        <div className="calendar-header">
          <div className="month-nav">
            <button className="icon-btn"><i className="ph ph-caret-left"></i></button>
            <h2>November 2023</h2>
            <button className="icon-btn"><i className="ph ph-caret-right"></i></button>
            <button className="today-btn">Today</button>
          </div>
          
          <div className="calendar-legend">
            <span className="legend-item"><span className="dot dot-yellow"></span> Pending</span>
            <span className="legend-item"><span className="dot dot-green"></span> Approved</span>
            <span className="legend-item"><span className="dot dot-red"></span> Rejected</span>
          </div>

          <button className="new-res-btn">
            <i className="ph ph-plus"></i> New Reservation
          </button>
        </div>

        <div className="calendar-grid">
          {/* Days of the week */}
          <div className="weekday">SUN</div>
          <div className="weekday">MON</div>
          <div className="weekday">TUE</div>
          <div className="weekday">WED</div>
          <div className="weekday">THU</div>
          <div className="weekday">FRI</div>
          <div className="weekday">SAT</div>

          {/* Row 1 */}
          <div className="day-cell prev-month"><span className="date">29</span></div>
          <div className="day-cell prev-month"><span className="date">30</span></div>
          <div className="day-cell prev-month"><span className="date">31</span></div>
          <div className="day-cell"><span className="date">1</span></div>
          <div className="day-cell">
            <span className="date">2</span>
            <div className="event-pill pill-red">Q3 Marketing Review</div>
          </div>
          <div className="day-cell"><span className="date">3</span></div>
          <div className="day-cell"><span className="date">4</span></div>

          {/* Row 2 */}
          <div className="day-cell">
            <span className="date">5</span>
            <div className="event-pill pill-green">Client Pitch Pres...</div>
          </div>
          <div className="day-cell"><span className="date">6</span></div>
          <div className="day-cell">
            <span className="date">7</span>
            <div className="event-pill pill-yellow">Design Sprint</div>
          </div>
          <div className="day-cell"><span className="date">8</span></div>
          <div className="day-cell">
            <span className="date">9</span>
            <div className="event-pill pill-green">Leadership Talk</div>
          </div>
          <div className="day-cell">
            <span className="date">10</span>
            <div className="event-pill pill-yellow">Dept. All-Hands</div>
          </div>
          <div className="day-cell"><span className="date">11</span></div>

          {/* Row 3 */}
          <div className="day-cell"><span className="date">12</span></div>
          <div className="day-cell">
            <span className="date">13</span>
            <div className="event-pill pill-green">Investor Briefing</div>
          </div>
          <div className="day-cell">
            <span className="date">14</span>
            <div className="event-pill pill-red">Product Roadmap</div>
            <div className="event-pill pill-yellow">UX Review</div>
          </div>
          <div className="day-cell"><span className="date">15</span></div>
          <div className="day-cell">
            <span className="date">16</span>
            <div className="event-pill pill-green">Annual Gala Planning</div>
          </div>
          <div className="day-cell"><span className="date">17</span></div>
          <div className="day-cell"><span className="date">18</span></div>

          {/* Row 4 (Selected Date) */}
          <div className="day-cell"><span className="date">19</span></div>
          <div className="day-cell">
            <span className="date">20</span>
            <div className="event-pill pill-yellow">Training Session</div>
          </div>
          <div className="day-cell"><span className="date">21</span></div>
          <div className="day-cell selected-day">
            <span className="date active">22</span>
            <div className="event-pill pill-green">HR Town Hall</div>
            <div className="event-pill pill-yellow">Budget Meeting</div>
            <div className="event-more">+1 more</div>
          </div>
          <div className="day-cell"><span className="date">23</span></div>
          <div className="day-cell">
            <span className="date">24</span>
            <div className="event-pill pill-red">Staff Workshop</div>
          </div>
          <div className="day-cell"><span className="date">25</span></div>

          {/* Row 5 */}
          <div className="day-cell"><span className="date">26</span></div>
          <div className="day-cell">
            <span className="date">27</span>
            <div className="event-pill pill-green">Graduation Ceremony</div>
          </div>
          <div className="day-cell"><span className="date">28</span></div>
          <div className="day-cell">
            <span className="date">29</span>
            <div className="event-pill pill-yellow">Year-End Review</div>
          </div>
          <div className="day-cell"><span className="date">30</span></div>
          <div className="day-cell prev-month"><span className="date">1</span></div>
          <div className="day-cell prev-month"><span className="date">2</span></div>
        </div>
      </div>

      {/* RIGHT SIDE: DAILY DETAILS */}
      <div className="calendar-sidebar">
        
        <div className="sidebar-header">
          <div>
            <h3>Wednesday, Nov 22</h3>
            <p>Reservations for selected date</p>
          </div>
          <span className="event-count">3 events</span>
        </div>

        <div className="event-cards">
          <div className="event-card">
            <div className="card-top">
              <h4>HR Town Hall Meeting</h4>
              <span className="status-badge bg-green">Approved</span>
            </div>
            <div className="card-details">
              <p><i className="ph ph-clock"></i> 09:00 AM – 11:00 AM</p>
              <p><i className="ph ph-map-pin"></i> Main Auditorium</p>
              <p><i className="ph ph-user"></i> Alex Johnson</p>
            </div>
            <button className="view-btn">View Details</button>
          </div>

          <div className="event-card">
            <div className="card-top">
              <h4>Q4 Budget Meeting</h4>
              <span className="status-badge bg-yellow">Pending</span>
            </div>
            <div className="card-details">
              <p><i className="ph ph-clock"></i> 01:00 PM – 03:00 PM</p>
              <p><i className="ph ph-map-pin"></i> Executive Boardroom</p>
              <p><i className="ph ph-user"></i> Alex Johnson</p>
            </div>
            <button className="view-btn">View Details</button>
          </div>

          <div className="event-card">
            <div className="card-top">
              <h4>Product Launch Event</h4>
              <span className="status-badge bg-red">Rejected</span>
            </div>
            <div className="card-details">
              <p><i className="ph ph-clock"></i> 04:00 PM – 06:00 PM</p>
              <p><i className="ph ph-map-pin"></i> Conference Room A</p>
              <p><i className="ph ph-user"></i> Alex Johnson</p>
            </div>
            <button className="view-btn">View Details</button>
          </div>
        </div>

        <button className="reserve-date-btn">
          <i className="ph ph-plus"></i> Reserve This Date
        </button>
      </div>

    </div>
  );
};

// This exact line is required for React.lazy() to work
export default MisCalendar;