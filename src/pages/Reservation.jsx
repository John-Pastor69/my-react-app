import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../Firebase';
import '../styles/Reservation.scss';

const Reservation = ({ currentUserRole = 'requestor' }) => {
  const [days, setDays] = useState(0);
  const [aircon, setAircon] = useState(true);
  const isRequestor = currentUserRole === 'requestor';

  // --- DYNAMIC EQUIPMENT STATES ---
  const [inventoryEquipments, setInventoryEquipments] = useState([]);
  const [selectedEquip, setSelectedEquip] = useState({}); // Stores { [equipmentId]: quantitySelected }

  // --- LIVE LISTEN TO FIRESTORE "equipments" COLLECTION ---
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'equipments'),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setInventoryEquipments(list);
      },
      (error) => {
        console.error('Failed to load equipment for reservation:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  // --- DATE & CALENDAR STATES ---
  const [eventDate, setEventDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarView, setCalendarView] = useState(new Date());

  // --- TIME STATES ---
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationHours, setDurationHours] = useState(0);

  // --- CALCULATE DURATION EFFECT ---
  useEffect(() => {
    if (!startTime || !endTime) {
      setDurationHours(0);
      return;
    }

    const parseTimeToDecimal = (timeStr) => {
      const match = timeStr.trim().match(/^(\d{2}):(\d{2})\s(AM|PM)$/i);
      if (!match) return null;
      
      let [ , hours, minutes, modifier ] = match;
      hours = parseInt(hours, 10);
      minutes = parseInt(minutes, 10);

      if (hours === 12 && modifier.toUpperCase() === 'AM') hours = 0;
      if (hours < 12 && modifier.toUpperCase() === 'PM') hours += 12;

      return hours + (minutes / 60);
    };

    const startDecimal = parseTimeToDecimal(startTime);
    const endDecimal = parseTimeToDecimal(endTime);

    if (startDecimal !== null && endDecimal !== null) {
      let diff = endDecimal - startDecimal;
      if (diff < 0) diff += 24; 
      setDurationHours(Math.round(diff * 10) / 10);
    } else {
      setDurationHours(0);
    }
  }, [startTime, endTime]);

  // --- HANDLERS ---
  const updateDays = (amount) => setDays(prev => Math.max(0, prev + amount));

  // Real-time Firestore Equipment Counter Handler
  const updateEquip = async (item, delta) => {
    const currentSelected = selectedEquip[item.id] || 0;
    const newSelected = currentSelected + delta;

    // Validation: Cannot go below 0 selected, and cannot exceed total inventory stock
    if (newSelected < 0 || newSelected > item.totalCount) return;

    // Validation: Cannot increase if no more units are available in Firestore
    if (delta > 0 && item.availableCount < delta) return;

    // Update local selection state
    setSelectedEquip(prev => ({ ...prev, [item.id]: newSelected }));

    // Calculate new available count in Firestore
    const newAvailableCount = item.availableCount - delta;
    const newStatus = newAvailableCount === 0 ? 'Unavailable' : 'Available';
    const newStatusClass = newStatus === 'Unavailable' ? 'status-unavailable' : 'status-available';

    try {
      // Instantly update Firestore so MIS Management & Overview update in real time
      await updateDoc(doc(db, 'equipments', item.id), {
        availableCount: newAvailableCount,
        status: newStatus,
        statusClass: newStatusClass,
        lastUpdated: 'Just now'
      });
    } catch (error) {
      console.error('Failed to update equipment inventory in real-time:', error);
    }
  };

  const handleDateChange = (e) => {
    let val = e.target.value;
    val = val.replace(/\D/g, '');
    if (val.length >= 3 && val.length <= 4) val = val.slice(0, 2) + '/' + val.slice(2);
    else if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4, 8);
    
    setEventDate(val);

    const isValid = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(val);
    if (val.length > 0 && !isValid) {
      setDateError('Invalid format. Use MM/DD/YYYY');
    } else {
      setDateError('');
    }
  };

  const handleTimeBlur = (e, setter) => {
    let val = e.target.value.trim().toUpperCase();
    if (!val) return;
    
    const match = val.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
    if (match) {
      let [ , h, m, mod ] = match;
      h = parseInt(h, 10);
      m = m || '00';
      
      if (!mod) {
        if (h > 12) { mod = 'PM'; h -= 12; }
        else if (h === 12) { mod = 'PM'; }
        else if (h === 0) { h = 12; mod = 'AM'; }
        else { mod = 'AM'; }
      }
      
      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mod}`;
      setter(formatted);
    }
  };

  const handlePrevMonth = () => setCalendarView(new Date(calendarView.getFullYear(), calendarView.getMonth() - 1, 1));
  const handleNextMonth = () => setCalendarView(new Date(calendarView.getFullYear(), calendarView.getMonth() + 1, 1));
  
  const selectDate = (day) => {
    const month = String(calendarView.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const year = calendarView.getFullYear();
    setEventDate(`${month}/${formattedDay}/${year}`);
    setDateError('');
    setShowCalendar(false); 
  };

  const renderCalendarDays = () => {
    const year = calendarView.getFullYear();
    const month = calendarView.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); 

    const blanks = Array.from({ length: firstDayIndex }, (_, i) => <div key={`blank-${i}`} className="calendar-day empty"></div>);
    const renderDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
      <div key={day} className="calendar-day" onClick={() => selectDate(day)}>
        {day}
      </div>
    ));

    return [...blanks, ...renderDays];
  };

  return (
    <div className="reservation-container">
      
      <div className="form-header">
        <div className="title"><i className="ph"></i> Reservation Form</div>
        <div className="required-note">All fields marked <span style={{color: '#EF4444'}}>*</span> are required</div>
      </div>

      {/* SECTION 1: Requestor Information */}
      <div className="form-card">
        <div className="section-header"><span className="step-badge">1</span> Requestor Information</div>

        <div className="form-grid col-2">
          <div className="input-group">
            <label>Full Name <span>*</span></label>
            <div className="input-with-icon right-icon">
              <input type="text" defaultValue="" placeholder="Enter your full name" />
            </div>
          </div>
          <div className="input-group">
            <label>Contact Number <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-phone"></i>
              <input type="text" defaultValue="" placeholder="+63 9XX XXX XXXX" />
            </div>
          </div>
          
          <div className="input-group">
            <label>Role <span>*</span></label>
            <div className="radio-group">
              <label><input type="radio" name="role" /> Student</label>
              <label><input type="radio" name="role" /> Endorser</label>
              <label><input type="radio" name="role" /> Admin Staff</label>
            </div>
          </div>
          {isRequestor && (
            <div className="input-group">
              <label>Course & Section <span>*</span></label>
              <input type="text" defaultValue="" placeholder="e.g. BS Computer Science 3-A" />
            </div>
          )}
        </div>

        {isRequestor && (
          <>
            <div className="divider"><span>Endorser Information</span></div>

            <div className="form-grid col-2">
              <div className="input-group">
                <label>Endorser's Full Name <span>*</span></label>
                <input type="text" defaultValue="" placeholder="Faculty/Adviser name" />
              </div>
              <div className="input-group">
                <label>Endorser's Designation <span>*</span></label>
                <input type="text" defaultValue="" placeholder="e.g. Dean, Faculty Adviser" />
              </div>
              <div className="input-group" style={{gridColumn: '1 / -1'}}>
                <label>Endorser's Contact Email <span>*</span></label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-envelope-simple"></i>
                  <input type="email" defaultValue="" placeholder="endorser@university.edu.ph" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SECTION 2: Event Information */}
      <div className="form-card">
        <div className="section-header"><span className="step-badge">2</span> Event Information</div>
        <div className="form-grid col-2">
          <div className="input-group">
            <label>Event Name <span>*</span></label>
            <input type="text" defaultValue="" placeholder="e.g. Annual General Assembly" />
          </div>
          
          <div className="input-group">
            <label>Event Date <span>*</span></label>
            <div style={{ position: 'relative' }}>
              <div className="input-with-icon left-icon">
                <i className="ph ph-calendar-blank" onClick={() => setShowCalendar(!showCalendar)} style={{ cursor: 'pointer', zIndex: 2 }}></i>
                <input 
                  type="text" 
                  value={eventDate} 
                  onChange={handleDateChange} 
                  maxLength={10}
                  placeholder="MM/DD/YYYY" 
                  onClick={() => setShowCalendar(true)} 
                  style={{ borderColor: dateError ? '#EF4444' : '' }}
                />
              </div>
              {dateError && <span style={{ color: '#EF4444', fontSize: '10px', marginTop: '4px', display: 'block' }}>{dateError}</span>}
              
              {showCalendar && (
                <>
                  <div className="calendar-overlay" onClick={() => setShowCalendar(false)}></div>
                  <div className="custom-calendar-popup">
                    <div className="calendar-header">
                      <button type="button" onClick={handlePrevMonth}><i className="ph ph-caret-left"></i></button>
                      <span>{calendarView.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                      <button type="button" onClick={handleNextMonth}><i className="ph ph-caret-right"></i></button>
                    </div>
                    <div className="calendar-grid">
                      <div className="calendar-day-name">Su</div>
                      <div className="calendar-day-name">Mo</div>
                      <div className="calendar-day-name">Tu</div>
                      <div className="calendar-day-name">We</div>
                      <div className="calendar-day-name">Th</div>
                      <div className="calendar-day-name">Fr</div>
                      <div className="calendar-day-name">Sa</div>
                      {renderCalendarDays()}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="input-group">
            <label>Expected Number of Participants <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-users"></i>
              <input type="number" defaultValue="" placeholder="e.g. 150" />
            </div>
          </div>
          <div className="input-group">
            <label>Event Type <span>*</span></label>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'}}>
              <label style={{fontWeight: 400}}><input type="checkbox"/> Academic</label>
              <label style={{fontWeight: 400}}><input type="checkbox"/> Cultural</label>
              <label style={{fontWeight: 400}}><input type="checkbox"/> Sports</label>
              <label style={{fontWeight: 400}}><input type="checkbox"/> Seminar</label>
              <label style={{fontWeight: 400}}><input type="checkbox"/> Training</label>
              <label style={{fontWeight: 400}}><input type="checkbox"/> Other <span className="helper-text">specify below</span></label>
            </div>
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
            <label>Purpose / Description <span>*</span></label>
            <textarea defaultValue="" placeholder="Briefly describe the purpose and objectives of your event..."></textarea>
          </div>
        </div>
      </div>

      {/* SECTION 3: Facility Usage Schedule */}
      <div className="form-card">
        <div className="section-header"><span className="step-badge">3</span> Facility Usage Schedule</div>
        <div className="form-grid col-3">
          <div className="input-group">
            <label>Number of Days <span>*</span></label>
            <div style={{display: 'flex', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#F8FAFC'}}>
              <button type="button" onClick={() => updateDays(-1)} style={{border: 'none', background: 'transparent', padding: '10px 16px', cursor: 'pointer'}}>-</button>
              <input type="text" value={days} readOnly style={{border: 'none', textAlign: 'center', width: '100%'}} />
              <button type="button" onClick={() => updateDays(1)} style={{border: 'none', background: 'transparent', padding: '10px 16px', cursor: 'pointer'}}>+</button>
            </div>
          </div>
          <div className="input-group">
            <label>Start Time <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-clock"></i>
              <input 
                type="text" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onBlur={(e) => handleTimeBlur(e, setStartTime)}
                placeholder="08:00 AM" 
              />
            </div>
          </div>
          <div className="input-group">
            <label>End Time <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-clock"></i>
              <input 
                type="text" 
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onBlur={(e) => handleTimeBlur(e, setEndTime)}
                placeholder="05:00 PM" 
              />
            </div>
          </div>
        </div>
        <div className="info-box green" style={{marginTop: '16px', marginBottom: '0'}}>
          <i className="ph ph-info"></i>
          <div>
            <strong>Total Duration: {durationHours > 0 ? durationHours : 0} hours / day — Across {days} day(s)</strong>
          </div>
        </div>
      </div>

      {/* SECTIONS 4 & 5 (Side by side on PC) */}
      <div className="split-cards">
        
        {/* SECTION 4: Facilities Needed */}
        <div className="form-card">
          <div className="section-header"><span className="step-badge">4</span> Facilities Needed</div>
          <div className="checkbox-grid" style={{gridTemplateColumns: '1fr'}}>
            <label><input type="checkbox" /> <i className="ph ph-buildings"></i> Auditorium</label>
            <label><input type="checkbox" /> <i className="ph ph-barbell"></i> Gymnasium</label>
            <label><input type="checkbox" /> <i className="ph ph-chalkboard-teacher"></i> Conference Room</label>
            <label><input type="checkbox" /> <i className="ph ph-monitor-play"></i> AVR (Audio Visual Room)</label>
            <label><input type="checkbox" /> <i className="ph ph-court-basketball"></i> Covered Court</label>
            <label><input type="checkbox" /> <i className="ph ph-star"></i> Function Hall</label>
          </div>
          <div className="input-group">
            <label>Specific Room Number / Name</label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-door"></i>
              <input type="text" defaultValue="" placeholder="e.g. Room 301, Annex B" />
            </div>
            <span className="helper-text">Leave blank if not applicable</span>
          </div>
        </div>

        {/* SECTION 5: Equipment Needed (Real-Time Firestore Sync & Scroll) */}
        <div className="form-card">
          <div className="section-header"><span className="step-badge">5</span> Equipment Needed</div>
          
          <div className="equipment-list" style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
            {inventoryEquipments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#64748B', fontSize: '13px' }}>
                No equipment currently listed in inventory.
              </div>
            ) : (
              inventoryEquipments.map((item) => {
                const count = selectedEquip[item.id] || 0;
                const isAvailable = item.status === 'Available' && item.availableCount > 0;
                const statusColor = isAvailable ? '#10B981' : '#EF4444';

                return (
                  <div className="equip-item" key={item.id}>
                    <div className="equip-info">
                      <div className="icon-box bg-blue"><i className="ph ph-package"></i></div>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.sku}</span>
                        <span style={{ fontSize: '11px', color: statusColor, fontWeight: 500, marginTop: '2px', display: 'block' }}>
                          ● {item.status} ({item.availableCount} / {item.totalCount} units available)
                        </span>
                      </div>
                    </div>
                    <div className="counter">
                      {/* Decrement: returns stock back to Firestore inventory */}
                      <button 
                        type="button" 
                        onClick={() => updateEquip(item, -1)}
                        disabled={count <= 0}
                      >-</button>
                      <input type="text" value={count} readOnly />
                      {/* Increment: takes stock from Firestore inventory in real time */}
                      <button 
                        type="button" 
                        onClick={() => updateEquip(item, 1)}
                        disabled={!isAvailable || item.availableCount <= 0}
                      >+</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* SECTION 6: Air Conditioning Schedule */}
      <div className="form-card">
        <div className="section-header"><span className="step-badge">6</span> Air Conditioning Schedule</div>
        <div className="aircon-controls">
          
          <div className="aircon-inputs-row">
            <div className="toggle-box" onClick={() => setAircon(!aircon)} style={{ cursor: 'pointer', borderColor: aircon ? '#10B981' : '#CBD5E1', background: aircon ? '#ECFDF5' : '#F8FAFC' }}>
              <div style={{ width: '36px', height: '20px', borderRadius: '10px', position: 'relative', background: aircon ? '#10B981' : '#CBD5E1', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '2px', width: '16px', height: '16px', background: 'white', borderRadius: '50%', transition: 'left 0.2s', left: aircon ? '18px' : '2px' }}></div>
              </div>
              <div>
                <strong style={{ color: aircon ? '#065F46' : '#64748B', whiteSpace: 'nowrap' }}>Aircon {aircon ? 'Enabled' : 'Disabled'}</strong>
                <span style={{ color: aircon ? '#059669' : '#94A3B8', display: 'block', whiteSpace: 'nowrap' }}>Click to toggle</span>
              </div>
            </div>

            <div className="time-inputs">
              <div className="input-group">
                <label>Aircon ON Time</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input type="text" defaultValue="" placeholder="08:00 AM" disabled={!aircon} style={{ background: !aircon ? '#F1F5F9' : '#F8FAFC' }} />
                </div>
              </div>
              
              <i className="ph ph-arrow-right arrow" style={{ marginTop: '24px' }}></i>
              
              <div className="input-group">
                <label>Aircon OFF Time</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input type="text" defaultValue="" placeholder="05:00 PM" disabled={!aircon} style={{ background: !aircon ? '#F1F5F9' : '#F8FAFC' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="info-box blue" style={{marginBottom: 0, padding: '10px 12px'}}>
            <i className="ph ph-info"></i>
            <div style={{fontSize: '11px'}}>Aircon will be scheduled based on approved timing. Ensure times are within facility operating hours (6:00 AM - 9:00 PM).</div>
          </div>

        </div>
      </div>

      {/* CERTIFICATION & ACTIONS */}
      <div className="certification">
        <input type="checkbox" />
        <p>I hereby certify that all information provided in this RASA form is true and correct. I agree to abide by the facility use policies and regulations of the institution. I understand that any misuse of the facility may result in the revocation of this reservation and/or other sanctions.</p>
      </div>

      <div className="form-actions">
        <button className="btn-outline"><i className="ph ph-trash"></i> Discard Form</button>
        <div className="right-actions">
          <button className="btn-outline"><i className="ph ph-floppy-disk"></i> Save Draft</button>
          <button className="btn-primary">Submit Reservation</button>
        </div>
      </div>

    </div>
  );
};

export default Reservation;