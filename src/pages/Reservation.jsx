import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, addDoc, getDocs, query, where, writeBatch, getDoc } from 'firebase/firestore';
import { db, auth } from '../Firebase';
import '../styles/Reservation.scss';

const initialFormState = {
  fullName: '', contactNumber: '', 
  eventName: '', expectedParticipants: '', eventType: [], purpose: '',
  facilities: [], specificRoom: '', airconOnTime: '', airconOffTime: ''
};

// Extracted to be reused outside useEffect
const parseTimeToDecimal = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) return null;
  
  let [ , hours, minutes, modifier ] = match;
  hours = parseInt(hours, 10);
  minutes = parseInt(minutes, 10);

  if (hours === 12 && modifier.toUpperCase() === 'AM') hours = 0;
  if (hours < 12 && modifier.toUpperCase() === 'PM') hours += 12;

  return hours + (minutes / 60);
};

const Reservation = () => {
  // --- AUTH & USER STATE ---
  const [currentUser, setCurrentUser] = useState(null);

  // --- FORM STATES ---
  const [formData, setFormData] = useState(initialFormState);
  const [days, setDays] = useState(0);
  const [aircon, setAircon] = useState(true);
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationHours, setDurationHours] = useState(0);
  
  // DYNAMIC SELECTION CARTS
  const [selectedEquip, setSelectedEquip] = useState({});

  const [certified, setCertified] = useState(false);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  
  // --- MODAL STATES ---
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [customAlert, setCustomAlert] = useState(null); 

  // --- UI STATES ---
  const [inventoryEquipments, setInventoryEquipments] = useState([]);
  const [inventoryFacilities, setInventoryFacilities] = useState([]);
  const [reservationsData, setReservationsData] = useState([]);
  const [dateError, setDateError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarView, setCalendarView] = useState(new Date());

  // --- CONNECT TO ACCOUNT (Profile Auto-Fill) ---
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setFormData(prev => ({
              ...prev,
              fullName: prev.fullName || userData.name || '',
              contactNumber: prev.contactNumber || userData.phone || ''
            }));
          }
        } catch (err) {
          console.error("Failed to fetch user data for auto-fill", err);
        }
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- LOAD DRAFT ON MOUNT ---
  useEffect(() => {
    const draft = localStorage.getItem('reservationDraft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.formData) setFormData(prev => ({ ...prev, ...parsed.formData }));
        if (parsed.days !== undefined) setDays(parsed.days);
        if (parsed.aircon !== undefined) setAircon(parsed.aircon);
        if (parsed.eventDate) setEventDate(parsed.eventDate);
        if (parsed.startTime) setStartTime(parsed.startTime);
        if (parsed.endTime) setEndTime(parsed.endTime);
        if (parsed.selectedEquip) setSelectedEquip(parsed.selectedEquip);
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
  }, []);

  // Reset Draft toggle when form changes
  useEffect(() => {
    if (isDraftSaved) setIsDraftSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, days, aircon, eventDate, startTime, endTime, selectedEquip]);

  // --- LIVE LISTEN TO FACILITIES, EQUIPMENTS & RESERVATIONS ---
  useEffect(() => {
    const unsubEquipments = onSnapshot(collection(db, 'equipments'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInventoryEquipments(list);
    }, (error) => console.error('Failed to load equipment:', error));

    const unsubFacilities = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInventoryFacilities(list);
    }, (error) => console.error('Failed to load facilities:', error));

    const unsubReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReservationsData(list);
    }, (error) => console.error('Failed to load reservations:', error));

    return () => {
      unsubEquipments();
      unsubFacilities();
      unsubReservations();
    };
  }, []);

  // --- DYNAMICALLY CALCULATE AVAILABLE COUNTS ---
  const mappedEquipmentList = inventoryEquipments.map(item => {
    let reservedCount = 0;
    reservationsData.forEach(res => {
      if (res.status !== 'Rejected' && res.status !== 'Cancelled') {
        if (res.selectedEquip && res.selectedEquip[item.id]) {
          reservedCount += Number(res.selectedEquip[item.id]);
        }
      }
    });
    const total = Number(item.totalCount) || 0;
    const availableCount = Math.max(0, total - reservedCount);
    return { ...item, computedReserved: reservedCount, computedAvailable: availableCount };
  });

  // --- CALCULATE DURATION ---
  useEffect(() => {
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
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxArrayChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }));
  };

  const updateDays = (amount) => setDays(prev => Math.max(0, prev + amount));

  const updateEquip = (item, delta) => {
    if (item.status === 'Unavailable' || item.status === 'Maintenance') return;
    const currentSelected = selectedEquip[item.id] || 0;
    const newSelected = currentSelected + delta;
    if (newSelected < 0 || newSelected > item.computedAvailable) return;
    setSelectedEquip(prev => ({ ...prev, [item.id]: newSelected }));
  };

  const handleDateChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length >= 3 && val.length <= 4) val = val.slice(0, 2) + '/' + val.slice(2);
    else if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4, 8);
    
    setEventDate(val);
    const isValid = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(val);
    setDateError(val.length > 0 && !isValid ? 'Invalid format. Use MM/DD/YYYY' : '');
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
      setter(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${mod}`);
    }
  };

  const handlePrevMonth = () => setCalendarView(new Date(calendarView.getFullYear(), calendarView.getMonth() - 1, 1));
  const handleNextMonth = () => setCalendarView(new Date(calendarView.getFullYear(), calendarView.getMonth() + 1, 1));
  const selectDate = (day) => {
    const month = String(calendarView.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    setEventDate(`${month}/${formattedDay}/${calendarView.getFullYear()}`);
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
      <div key={day} className="calendar-day" onClick={() => selectDate(day)}>{day}</div>
    ));
    return [...blanks, ...renderDays];
  };

  // --- ACTION HANDLERS ---
  const handleDiscard = () => {
    setFormData(initialFormState);
    setDays(0);
    setAircon(true);
    setEventDate('');
    setStartTime('');
    setEndTime('');
    setSelectedEquip({});
    setCertified(false);
    setIsDraftSaved(false);
    localStorage.removeItem('reservationDraft');
  };

  const handleSaveDraft = () => {
    const draftData = { formData, days, aircon, eventDate, startTime, endTime, selectedEquip };
    localStorage.setItem('reservationDraft', JSON.stringify(draftData));
    setIsDraftSaved(true);
  };

  const handleSubmit = async () => {
    if (!certified) return;
    
    if (!currentUser) {
      setCustomAlert({
        title: 'Authentication Required',
        message: 'You must be logged in to submit a reservation.',
        isSuccess: false
      });
      return;
    }

    const hasEquipment = Object.values(selectedEquip).some(qty => qty > 0);
    const hasFacility = formData.facilities.length > 0;

    if (!formData.fullName || !eventDate || !startTime || !endTime) {
      setCustomAlert({
        title: 'Missing Fields',
        message: 'Please fill in all required fields including Full Name, Event Date, and Time.',
        isSuccess: false
      });
      return;
    }

    if (!hasFacility && !hasEquipment) {
      setCustomAlert({
        title: 'Selection Required',
        message: 'Please select at least one facility or equipment to reserve.',
        isSuccess: false
      });
      return;
    }

    try {
      // 1. OVERLAP CHECK
      const q = query(collection(db, 'reservations'), where('eventDate', '==', eventDate));
      const snap = await getDocs(q);
      
      const isOverlapping = snap.docs.some(d => {
        const res = d.data();
        if (res.status === 'Rejected' || res.status === 'Cancelled') return false;

        const startA = parseTimeToDecimal(startTime);
        const endA = parseTimeToDecimal(endTime);
        const startB = parseTimeToDecimal(res.startTime);
        const endB = parseTimeToDecimal(res.endTime);
        if (startA === null || endA === null || startB === null || endB === null) return false;
        
        const timeOverlap = startA < endB && endA > startB;

        const hasFacilityOverlap = formData.facilities.length > 0 && res.facilities && formData.facilities.some(f => res.facilities.includes(f));
        const hasRoomOverlap = formData.specificRoom && res.specificRoom && 
                               formData.specificRoom.toLowerCase().trim() === res.specificRoom.toLowerCase().trim();

        return timeOverlap && (hasFacilityOverlap || hasRoomOverlap);
      });

      if (isOverlapping) {
        setShowOverlapWarning(true);
        return;
      }

      // 2. SUBMIT RESERVATION
      await addDoc(collection(db, 'reservations'), {
        ...formData,
        userId: currentUser.uid,        
        userEmail: currentUser.email,   
        eventDate,
        startTime,
        endTime,
        durationHours,
        days,
        aircon,
        selectedEquip,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });

      // 3. SYNC INVENTORY STATUS BACK TO DB (Only needed for equipments to ping the lastUpdated timestamp)
      const batch = writeBatch(db);
      const updateTimestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      
      for (const [eqId, qty] of Object.entries(selectedEquip)) {
        if (qty > 0) {
          batch.update(doc(db, 'equipments', eqId), { lastUpdated: updateTimestamp });
        }
      }
      await batch.commit();

      handleDiscard(); 
      setCustomAlert({
        title: 'Success',
        message: 'Reservation submitted successfully!',
        isSuccess: true
      });

    } catch (error) {
      console.error("Error submitting reservation: ", error);
      setCustomAlert({
        title: 'Error',
        message: 'Failed to submit reservation.',
        isSuccess: false
      });
    }
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
              <input type="text" value={formData.fullName} onChange={(e) => handleInputChange('fullName', e.target.value)} placeholder="Enter your full name" />
            </div>
          </div>
          <div className="input-group">
            <label>Contact Number <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-phone"></i>
              <input 
                type="text" 
                value={formData.contactNumber} 
                onChange={(e) => handleInputChange('contactNumber', e.target.value.replace(/\D/g, ''))} 
                placeholder="09XX XXX XXXX" 
              />
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
            <input type="text" value={formData.eventName} onChange={(e) => handleInputChange('eventName', e.target.value)} placeholder="e.g. Annual General Assembly" />
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
              <input 
                type="text" 
                value={formData.expectedParticipants} 
                onChange={(e) => handleInputChange('expectedParticipants', e.target.value.replace(/\D/g, ''))} 
                placeholder="e.g. 150" 
              />
            </div>
          </div>
          <div className="input-group">
            <label>Event Type <span>*</span></label>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'}}>
              {['Academic', 'Cultural', 'Sports', 'Seminar', 'Training', 'Other'].map(type => (
                <label key={type} style={{fontWeight: 400}}>
                  <input type="checkbox" checked={formData.eventType.includes(type)} onChange={() => handleCheckboxArrayChange('eventType', type)} /> {type}
                </label>
              ))}
            </div>
          </div>
          <div className="input-group" style={{gridColumn: '1 / -1'}}>
            <label>Purpose / Description <span>*</span></label>
            <textarea value={formData.purpose} onChange={(e) => handleInputChange('purpose', e.target.value)} placeholder="Briefly describe the purpose and objectives of your event..."></textarea>
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

      {/* SECTIONS 4 & 5 */}
      <div className="split-cards">
        
        {/* SECTION 4: Facilities Needed (Dynamic DB List) */}
        <div className="form-card">
          <div className="section-header"><span className="step-badge">4</span> Facilities Needed</div>
          
          <div className="checkbox-grid" style={{ gridTemplateColumns: '1fr', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
            {inventoryFacilities.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#64748B', fontSize: '13px' }}>
                No facilities currently listed.
              </div>
            ) : (
              inventoryFacilities.map((item) => {
                const isLocked = item.status === 'Unavailable' || item.status === 'Maintenance';
                
                let statusColor = '#10B981';
                if (item.status === 'Maintenance') statusColor = '#F59E0B'; 
                else if (isLocked) statusColor = '#EF4444'; 

                return (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', cursor: isLocked ? 'not-allowed' : 'pointer', opacity: isLocked ? 0.6 : 1, transition: 'all 0.2s', background: formData.facilities.includes(item.id) ? '#F0F9FF' : '#FFF', borderColor: formData.facilities.includes(item.id) ? '#38BDF8' : '#E2E8F0' }}>
                    <input 
                      type="checkbox" 
                      style={{ marginRight: '16px', width: '18px', height: '18px', cursor: 'inherit' }}
                      checked={formData.facilities.includes(item.id)} 
                      onChange={() => handleCheckboxArrayChange('facilities', item.id)} 
                      disabled={isLocked}
                    /> 
                    <div className="icon-box" style={{ marginRight: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: '#E0F2FE', color: '#0284C7', flexShrink: 0 }}>
                      <i className="ph ph-buildings" style={{ fontSize: '20px' }}></i>
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '14px', color: '#1E293B', marginBottom: '2px' }}>{item.name}</strong>
                      <span style={{ fontSize: '12px', color: '#64748B', display: 'block', marginBottom: '2px' }}>{item.location} | {item.capacity}</span>
                      <span style={{ fontSize: '11px', color: statusColor, fontWeight: 500 }}>● {item.status}</span>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="input-group" style={{ marginTop: 'auto' }}>
            <label>Specific Room Number / Name</label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-door"></i>
              <input type="text" value={formData.specificRoom} onChange={(e) => handleInputChange('specificRoom', e.target.value)} placeholder="e.g. Room 301, Annex B" />
            </div>
            <span className="helper-text">Leave blank if not applicable</span>
          </div>
        </div>

        {/* SECTION 5: Equipment Needed */}
        <div className="form-card">
          <div className="section-header"><span className="step-badge">5</span> Equipment Needed</div>
          
          <div className="equipment-list" style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
            {mappedEquipmentList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#64748B', fontSize: '13px' }}>
                No equipment currently listed in inventory.
              </div>
            ) : (
              mappedEquipmentList.map((item) => {
                const count = selectedEquip[item.id] || 0;
                
                const isLocked = item.status === 'Unavailable' || item.status === 'Maintenance';
                const isAvailable = !isLocked && item.computedAvailable > 0;
                
                let statusColor = '#10B981';
                if (item.status === 'Maintenance') statusColor = '#F59E0B';
                else if (isLocked || !isAvailable) statusColor = '#EF4444';

                return (
                  <div className="equip-item" key={item.id} style={{ opacity: isLocked ? 0.6 : 1 }}>
                    <div className="equip-info">
                      <div className="icon-box bg-blue"><i className="ph ph-package"></i></div>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.sku}</span>
                        <span style={{ fontSize: '11px', color: statusColor, fontWeight: 500, marginTop: '2px', display: 'block' }}>
                          ● {item.status} ({item.computedAvailable} / {item.totalCount} units)
                        </span>
                      </div>
                    </div>
                    <div className="counter">
                      <button 
                        type="button" 
                        onClick={() => updateEquip(item, -1)}
                        disabled={count <= 0 || isLocked}
                      >-</button>
                      <input type="text" value={count} readOnly />
                      <button 
                        type="button" 
                        onClick={() => updateEquip(item, 1)}
                        disabled={isLocked || !isAvailable || item.computedAvailable <= count}
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
                  <input type="text" value={formData.airconOnTime} onChange={(e) => handleInputChange('airconOnTime', e.target.value)} placeholder="08:00 AM" disabled={!aircon} style={{ background: !aircon ? '#F1F5F9' : '#F8FAFC' }} />
                </div>
              </div>
              
              <i className="ph ph-arrow-right arrow" style={{ marginTop: '24px' }}></i>
              
              <div className="input-group">
                <label>Aircon OFF Time</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input type="text" value={formData.airconOffTime} onChange={(e) => handleInputChange('airconOffTime', e.target.value)} placeholder="05:00 PM" disabled={!aircon} style={{ background: !aircon ? '#F1F5F9' : '#F8FAFC' }} />
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
        <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
        <p>I hereby certify that all information provided in this RASA form is true and correct. I agree to abide by the facility use policies and regulations of the institution. I understand that any misuse of the facility may result in the revocation of this reservation and/or other sanctions.</p>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleDiscard}><i className="ph ph-trash"></i> Discard Form</button>
        <div className="right-actions">
          <button className="btn-outline" onClick={handleSaveDraft}>
            <i className="ph ph-floppy-disk"></i> {isDraftSaved ? '✓ Draft Saved' : 'Save Draft'}
          </button>
          <button 
            className="btn-primary" 
            onClick={handleSubmit} 
            disabled={!certified}
            style={{ opacity: !certified ? 0.6 : 1, cursor: !certified ? 'not-allowed' : 'pointer' }}
          >
            Submit Reservation
          </button>
        </div>
      </div>

      {/* Custom React Modal for General Alerts */}
      {customAlert && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '360px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: customAlert.isSuccess ? '#10B981' : '#DC2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {customAlert.title}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
              {customAlert.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setCustomAlert(null)}
                style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlap Warning Modal */}
      {showOverlapWarning && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '360px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '8px' }}>Schedule Conflict</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
              The selected facility or room is already reserved on <strong>{eventDate}</strong> during an overlapping time window. Please adjust your <strong>Start/End Time</strong> or select a different facility.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowOverlapWarning(false)}
                style={{ background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Reservation;