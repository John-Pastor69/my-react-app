import React, { useState } from 'react';
import '../../styles/user/EndorserReservation.scss';

const EndorserReservation = () => {
  // --- STATE MANAGEMENT ---
  const [days, setDays] = useState(0);
  
  const [equip, setEquip] = useState({
    sound: 0,
    mic: 0,
    projector: 0,
    tables: 0,
    chairs: 0,
    laptop: 0
  });

  const [aircon, setAircon] = useState(true);

  // --- HANDLERS ---
  const updateDays = (amount) => setDays(prev => Math.max(0, prev + amount));
  const updateEquip = (key, amount) => setEquip(prev => ({ ...prev, [key]: Math.max(0, prev[key] + amount) }));

  return (
    <div className="reservation-container">
      
      <div className="form-header">
        <div className="title"><i className="ph ph-lock-key"></i> RASA Form — New Reservation Request</div>
        <div className="required-note">All fields marked <span style={{color: '#EF4444'}}>*</span> are required</div>
      </div>

      {/* SECTION 1: Requestor Information */}
      <div className="form-card">
        <div className="section-header"><span className="step-badge">1</span> Requestor Information</div>
        
        <div className="info-box blue">
          <i className="ph ph-user-focus"></i>
          <div>
            <strong>Endorser Required</strong><br/>
            Since you selected <strong>Student</strong> as your role, an endorser's information is required below.
          </div>
        </div>

        <div className="form-grid col-2">
          <div className="input-group">
            <label>Full Name <span>*</span></label>
            <div className="input-with-icon right-icon">
              <input type="text" defaultValue="" placeholder="Enter your full name" />
              <i className="ph ph-lock-key"></i>
            </div>
            <span className="helper-text">Auto-filled from your account</span>
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
              <label><input type="radio" name="role" /> Teacher</label>
              <label><input type="radio" name="role" /> Admin Staff</label>
            </div>
          </div>
          <div className="input-group">
            <label>Organization Name <span>*</span></label>
            <input type="text" defaultValue="" placeholder="e.g. College of Engineering Student Council" />
          </div>

          <div className="input-group">
            <label>Course & Section <span>*</span></label>
            <input type="text" defaultValue="" placeholder="e.g. BS Computer Science 3-A" />
          </div>
          <div className="input-group">
            <label>Department <span>*</span></label>
            <div className="input-with-icon right-icon">
              <select><option>Select department</option></select>
              <i className="ph ph-caret-down"></i>
            </div>
          </div>
        </div>

        <div className="divider"><span>Endorser Information (Students Role Only)</span></div>

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
            <div className="input-with-icon left-icon right-icon">
              <i className="ph ph-calendar-blank"></i>
              <input type="text" defaultValue="" placeholder="MM/DD/YYYY" />
              <i className="ph ph-calendar-blank" style={{left: 'auto', right: '12px'}}></i>
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
              <label style={{fontWeight: 400}}><input type="checkbox"/> Other</label>
            </div>
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
            <label>Purpose / Description <span>*</span></label>
            <textarea defaultValue="" placeholder="Briefly describe the purpose and objectives of your event..."></textarea>
            <span className="helper-text">Minimum 50 characters</span>
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
            <div className="input-with-icon left-icon right-icon">
              <i className="ph ph-clock"></i>
              <input type="text" defaultValue="" placeholder="--:-- --" />
              <i className="ph ph-clock" style={{left: 'auto', right: '12px'}}></i>
            </div>
          </div>
          <div className="input-group">
            <label>End Time <span>*</span></label>
            <div className="input-with-icon left-icon right-icon">
              <i className="ph ph-clock"></i>
              <input type="text" defaultValue="" placeholder="--:-- --" />
              <i className="ph ph-clock" style={{left: 'auto', right: '12px'}}></i>
            </div>
          </div>
        </div>
        <div className="info-box green" style={{marginTop: '16px', marginBottom: '0'}}>
          <i className="ph ph-info"></i>
          <div><strong>Total Duration: {days * 9} hours / day — Across {days} day(s)</strong></div>
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

        {/* SECTION 5: Equipment Needed */}
        <div className="form-card">
          <div className="section-header"><span className="step-badge">5</span> Equipment Needed</div>
          <div className="equipment-list">
            
            <div className="equip-item">
              <div className="equip-info">
                <div className="icon-box bg-purple"><i className="ph ph-speaker-high"></i></div>
                <div><strong>Sound System</strong><span>Full audio setup</span></div>
              </div>
              <div className="counter"><button type="button" onClick={() => updateEquip('sound', -1)}>-</button><input type="text" value={equip.sound} readOnly /><button type="button" onClick={() => updateEquip('sound', 1)}>+</button></div>
            </div>

            <div className="equip-item">
              <div className="equip-info">
                <div className="icon-box bg-blue"><i className="ph ph-microphone"></i></div>
                <div><strong>Microphone</strong><span>Wired / wireless</span></div>
              </div>
              <div className="counter"><button type="button" onClick={() => updateEquip('mic', -1)}>-</button><input type="text" value={equip.mic} readOnly /><button type="button" onClick={() => updateEquip('mic', 1)}>+</button></div>
            </div>

            <div className="equip-item">
              <div className="equip-info">
                <div className="icon-box bg-yellow"><i className="ph ph-projector-screen"></i></div>
                <div><strong>Projector</strong><span>With screen / standalone</span></div>
              </div>
              <div className="counter"><button type="button" onClick={() => updateEquip('projector', -1)}>-</button><input type="text" value={equip.projector} readOnly /><button type="button" onClick={() => updateEquip('projector', 1)}>+</button></div>
            </div>

            <div className="equip-item">
              <div className="equip-info">
                <div className="icon-box bg-green"><i className="ph ph-table"></i></div>
                <div><strong>Tables</strong><span>Rectangular / round</span></div>
              </div>
              <div className="counter"><button type="button" onClick={() => updateEquip('tables', -1)}>-</button><input type="text" value={equip.tables} readOnly /><button type="button" onClick={() => updateEquip('tables', 1)}>+</button></div>
            </div>

            <div className="equip-item">
              <div className="equip-info">
                <div className="icon-box bg-red"><i className="ph ph-chair"></i></div>
                <div><strong>Chairs</strong><span>Monobloc / cushioned</span></div>
              </div>
              <div className="counter"><button type="button" onClick={() => updateEquip('chairs', -1)}>-</button><input type="text" value={equip.chairs} readOnly /><button type="button" onClick={() => updateEquip('chairs', 1)}>+</button></div>
            </div>

            <div className="equip-item">
              <div className="equip-info">
                <div className="icon-box bg-cyan"><i className="ph ph-laptop"></i></div>
                <div><strong>Laptop / PC</strong><span>Presentation device</span></div>
              </div>
              <div className="counter"><button type="button" onClick={() => updateEquip('laptop', -1)}>-</button><input type="text" value={equip.laptop} readOnly /><button type="button" onClick={() => updateEquip('laptop', 1)}>+</button></div>
            </div>

          </div>
        </div>

      </div>

      {/* SECTION 6: Air Conditioning Schedule */}
      <div className="form-card">
        <div className="section-header"><span className="step-badge">6</span> Air Conditioning Schedule</div>
        <div className="aircon-controls">
          
          <div className="toggle-box" onClick={() => setAircon(!aircon)} style={{ cursor: 'pointer', borderColor: aircon ? '#10B981' : '#CBD5E1', background: aircon ? '#ECFDF5' : '#F8FAFC' }}>
            {/* Custom Interactive Switch */}
            <div style={{ width: '36px', height: '20px', borderRadius: '10px', position: 'relative', background: aircon ? '#10B981' : '#CBD5E1', transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: '2px', width: '16px', height: '16px', background: 'white', borderRadius: '50%', transition: 'left 0.2s', left: aircon ? '18px' : '2px' }}></div>
            </div>
            <div>
              <strong style={{ color: aircon ? '#065F46' : '#64748B' }}>Aircon {aircon ? 'Enabled' : 'Disabled'}</strong>
              <span style={{ color: aircon ? '#059669' : '#94A3B8' }}>Click to toggle on/off</span>
            </div>
          </div>

          <div className="time-inputs">
            <div className="input-group">
              <label>Aircon ON Time</label>
              <div className="input-with-icon left-icon">
                <i className="ph ph-clock"></i>
                <input type="text" defaultValue="" placeholder="--:-- --" disabled={!aircon} style={{ background: !aircon ? '#F1F5F9' : '#F8FAFC' }} />
              </div>
            </div>
            <i className="ph ph-arrow-right arrow"></i>
            <div className="input-group">
              <label>Aircon OFF Time</label>
              <div className="input-with-icon left-icon">
                <i className="ph ph-clock"></i>
                <input type="text" defaultValue="" placeholder="--:-- --" disabled={!aircon} style={{ background: !aircon ? '#F1F5F9' : '#F8FAFC' }} />
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

export default EndorserReservation;