import React from 'react';
import { useNavigate } from 'react-router-dom';
import "../../styles/mis/MisCalendar.scss";

const MisCalendar = () => {
  return (
    <div className="calendar-page-container">
      
      {/* --- LEFT: MAIN CALENDAR --- */}
      <div className="calendar-main">
        
        {/* Header Section */}
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
          </div>
        </div>

        {/* Calendar Grid / Mobile Agenda */}
        <div className="calendar-grid">
          <div className="weekday">SUN</div>
          <div className="weekday">MON</div>
          <div className="weekday">TUE</div>
          <div className="weekday">WED</div>
          <div className="weekday">THU</div>
          <div className="weekday">FRI</div>
          <div className="weekday">SAT</div>

          {/* Row 1 */}
          <div className="day-cell empty-day prev-month"><span className="date"><span>Sun</span> 29</span></div>
          <div className="day-cell empty-day prev-month"><span className="date"><span>Mon</span> 30</span></div>
          <div className="day-cell empty-day prev-month"><span className="date"><span>Tue</span> 31</span></div>
          <div className="day-cell">
            <span className="date"><span>Wed</span> 1</span>
            <div className="event-pill pill-green">Network Upgrade</div>
          </div>
          <div className="day-cell">
            <span className="date"><span>Thu</span> 2</span>
            <div className="event-pill pill-yellow">Server Room Booking</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Fri</span> 3</span></div>
          <div className="day-cell empty-day"><span className="date"><span>Sat</span> 4</span></div>

          {/* Row 2 */}
          <div className="day-cell">
            <span className="date"><span>Sun</span> 5</span>
            <div className="event-pill pill-green">IT Training Lab</div>
          </div>
          <div className="day-cell">
            <span className="date"><span>Mon</span> 6</span>
            <div className="event-pill pill-yellow">Equipment</div>
          </div>
          <div className="day-cell">
            <span className="date"><span>Tue</span> 7</span>
            <div className="event-pill pill-yellow">Software Demo</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Wed</span> 8</span></div>
          <div className="day-cell">
            <span className="date"><span>Thu</span> 9</span>
            <div className="event-pill pill-green">Data Center Tour</div>
          </div>
          <div className="day-cell">
            <span className="date"><span>Fri</span> 10</span>
            <div className="event-pill pill-yellow">System Maintenance</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Sat</span> 11</span></div>

          {/* Row 3 */}
          <div className="day-cell empty-day"><span className="date"><span>Sun</span> 12</span></div>
          <div className="day-cell">
            <span className="date"><span>Mon</span> 13</span>
            <div className="event-pill pill-green">Cybersecurity Briefing</div>
          </div>
          <div className="day-cell">
            <span className="date"><span>Tue</span> 14</span>
            <div className="event-pill pill-yellow">ERP Deployment</div>
            <div className="event-pill pill-yellow">Cloud Migration</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Wed</span> 15</span></div>
          <div className="day-cell">
            <span className="date"><span>Thu</span> 16</span>
            <div className="event-pill pill-green">Help Desk Workshop</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Fri</span> 17</span></div>
          <div className="day-cell empty-day"><span className="date"><span>Sat</span> 18</span></div>

          {/* Row 4 */}
          <div className="day-cell empty-day"><span className="date"><span>Sun</span> 19</span></div>
          <div className="day-cell">
            <span className="date"><span>Mon</span> 20</span>
            <div className="event-pill pill-yellow">IT Audit Prep</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Tue</span> 21</span></div>
          
          {/* Active Day */}
          <div className="day-cell active-day">
            <span className="date"><span>Wed</span> 22</span>
            <div className="event-pill pill-green">Infra Review</div>
            <div className="event-pill pill-yellow">Dev Environment</div>
            <div className="event-more">+1 more</div>
          </div>
          
          <div className="day-cell empty-day"><span className="date"><span>Thu</span> 23</span></div>
          <div className="day-cell">
            <span className="date"><span>Fri</span> 24</span>
            <div className="event-pill pill-yellow">Network Downtime</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Sat</span> 25</span></div>

          {/* Row 5 */}
          <div className="day-cell empty-day"><span className="date"><span>Sun</span> 26</span></div>
          <div className="day-cell">
            <span className="date"><span>Mon</span> 27</span>
            <div className="event-pill pill-green">Backup Procedures</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Tue</span> 28</span></div>
          <div className="day-cell">
            <span className="date"><span>Wed</span> 29</span>
            <div className="event-pill pill-yellow">Year-End IT Review</div>
          </div>
          <div className="day-cell empty-day"><span className="date"><span>Thu</span> 30</span></div>
          <div className="day-cell empty-day prev-month"><span className="date"><span>Fri</span> 1</span></div>
          <div className="day-cell empty-day prev-month"><span className="date"><span>Sat</span> 2</span></div>
        </div>
      </div>

      {/* --- RIGHT: SIDEBAR DETAILS --- */}
      <div className="calendar-sidebar">
        
        <div className="sidebar-header">
          <div>
            <h3>Wednesday, Nov 22</h3>
            <p>All reservations for selected date</p>
          </div>
          <span className="event-count">3 events</span>
        </div>

        <div className="sidebar-stats">
          <div className="stat-box">
            <span className="stat-num text-green">1</span>
            <span className="stat-label">Approved</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-box">
            <span className="stat-num text-yellow">1</span>
            <span className="stat-label">Pending</span>
          </div>
        </div>

        <div className="event-cards">
          
          {/* Card 1 */}
          <div className="event-card">
            <div className="card-top">
              <h4>Infrastructure Review</h4>
              <span className="status-badge bg-green">Approved</span>
            </div>
            <div className="card-details">
              <p><i className="ph ph-clock"></i> 09:00 AM - 11:00 AM</p>
              <p><i className="ph ph-map-pin"></i> Server Room B</p>
              <p><i className="ph ph-user"></i> Carlos Reyes</p>
            </div>
            <div className="card-actions">
              <button className="btn-view">View Details</button>
            </div>
          </div>

          {/* Card 2 */}
          <div className="event-card">
            <div className="card-top">
              <h4>Dev Environment Setup</h4>
              <span className="status-badge bg-yellow">Pending</span>
            </div>
            <div className="card-details">
              <p><i className="ph ph-clock"></i> 01:00 PM - 03:00 PM</p>
              <p><i className="ph ph-map-pin"></i> IT Lab Room 1</p>
              <p><i className="ph ph-user"></i> Jenna Park</p>
            </div>
            <div className="card-actions">
              <button className="btn-view">View Details</button>
            </div>
          </div>
        </div>

      </div>
      
    </div>
  );
};

export default MisCalendar;