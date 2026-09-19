import React from 'react';
import '../../styles/mis/calendar.scss';

const MisCalendar = () => {
  return (
    <div className="calendar-page-container">
      
      {/* LEFT SIDE: MAIN CALENDAR */}
      <div className="calendar-main">
        
        <div className="calendar-header">
          <div className="month-nav">
            <button className="icon-btn"><i className="ph ph-caret-left"></i></button>
            <h2>September 2026</h2>
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
          <div className="day-cell prev-month"><span className="date">30</span></div>
          <div className="day-cell prev-month"><span className="date">31</span></div>
          <div className="day-cell"><span className="date">1</span></div>
          <div className="day-cell"><span className="date">2</span></div>
          <div className="day-cell"><span className="date">3</span></div>
          <div className="day-cell"><span className="date">4</span></div>
          <div className="day-cell"><span className="date">5</span></div>

          {/* Row 2 */}
          <div className="day-cell"><span className="date">6</span></div>
          <div className="day-cell"><span className="date">7</span></div>
          <div className="day-cell"><span className="date">8</span></div>
          <div className="day-cell"><span className="date">9</span></div>
          <div className="day-cell"><span className="date">10</span></div>
          <div className="day-cell"><span className="date">11</span></div>
          <div className="day-cell"><span className="date">12</span></div>

          {/* Row 3 */}
          <div className="day-cell"><span className="date">13</span></div>
          <div className="day-cell"><span className="date">14</span></div>
          <div className="day-cell"><span className="date">15</span></div>
          <div className="day-cell"><span className="date">16</span></div>
          <div className="day-cell"><span className="date">17</span></div>
          <div className="day-cell"><span className="date">18</span></div>
          <div className="day-cell"><span className="date">19</span></div>

          {/* Row 4 */}
          <div className="day-cell"><span className="date">20</span></div>
          <div className="day-cell"><span className="date">21</span></div>
          <div className="day-cell"><span className="date">22</span></div>
          <div className="day-cell"><span className="date">23</span></div>
          <div className="day-cell"><span className="date">24</span></div>
          <div className="day-cell"><span className="date">25</span></div>
          <div className="day-cell"><span className="date">26</span></div>

          {/* Row 5 */}
          <div className="day-cell"><span className="date">27</span></div>
          <div className="day-cell"><span className="date">28</span></div>
          <div className="day-cell"><span className="date">29</span></div>
          <div className="day-cell"><span className="date">30</span></div>
          <div className="day-cell prev-month"><span className="date">1</span></div>
          <div className="day-cell prev-month"><span className="date">2</span></div>
          <div className="day-cell prev-month"><span className="date">3</span></div>
        </div>
      </div>

      {/* RIGHT SIDE: DAILY DETAILS */}
      <div className="calendar-sidebar">
        
        <div className="sidebar-header">
          <div>
            <h3>Tuesday, Sep 1</h3>
            <p>Reservations for selected date</p>
          </div>
          <span className="event-count" style={{ background: '#F1F5F9', color: '#64748B' }}>0 events</span>
        </div>

        <div className="event-cards" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: '#94A3B8', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
            No reservations scheduled for this date.
          </p>
        </div>

        <button className="reserve-date-btn">
          <i className="ph ph-plus"></i> Reserve This Date
        </button>
      </div>

    </div>
  );
};

export default MisCalendar;