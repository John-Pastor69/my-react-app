import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  writeBatch, 
  getDoc 
} from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { sendReservationEmail } from '../services/emailService'; 
import '../styles/Reservation.scss';

const initialFormState = {
  fullName: '', 
  contactNumber: '', 
  emailAddress: '', 
  eventName: '', 
  expectedParticipants: '', 
  eventType: [], 
  purpose: '',
  facilities: [], 
  specificRoom: '', 
  airconOnTime: '', 
  airconOffTime: '',
  endorserName: '', 
  endorserDesignation: '', 
  endorserEmail: ''
};

// Helper function extracted outside component
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

// Name parsing helper function
const formatName = (fullName) => {
  if (!fullName) return '';
  let name = fullName.replace(/\s*\(Student\)/i, '').trim();
  if (name.includes(',')) {
      const parts = name.split(',');
      name = `${parts[1].trim()} ${parts[0].trim()}`;
  }
  return name;
};

const Reservation = () => {
  // --- AUTH & USER STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('requestor');

  // --- FORM STATES ---
  const [formData, setFormData] = useState(initialFormState);
  const [days, setDays] = useState(0);
  const [aircon, setAircon] = useState(false); // Default to off
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

  // --- ENDORSER DROPDOWN STATE ---
  const [endorsersList, setEndorsersList] = useState([]);
  const [showEndorserDropdown, setShowEndorserDropdown] = useState(false);

  // --- CONNECT TO ACCOUNT (Profile Auto-Fill & Role Check) ---
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUserRole(userData.role?.toLowerCase() || 'requestor');
            
            const cleanName = formatName(userData.name);

            setFormData(prev => ({
              ...prev,
              fullName: prev.fullName || cleanName,
              contactNumber: prev.contactNumber || userData.phone || '',
              emailAddress: prev.emailAddress || userData.email || user.email || '' 
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
  }, [formData, days, aircon, eventDate, startTime, endTime, selectedEquip]);

  // --- LIVE LISTEN TO FACILITIES, EQUIPMENTS, RESERVATIONS & USERS (For Endorsers) ---
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

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Map to clean format and filter for endorsers
      const endorsers = users
        .filter(user => user.role && user.role.toLowerCase() === 'endorser')
        .map(user => ({
          ...user,
          cleanName: formatName(user.name)
        }));
      setEndorsersList(endorsers);
    }, (error) => console.error('Failed to load users:', error));

    return () => {
      unsubEquipments();
      unsubFacilities();
      unsubReservations();
      unsubUsers();
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

    // Trigger Endorser Dropdown Logic
    if (field === 'endorserName') {
      setShowEndorserDropdown(value.length > 0);
    }
  };

  const handleEndorserSelect = (endorser) => {
    setFormData(prev => ({
      ...prev,
      endorserName: endorser.cleanName, // Populate with the cleaned First Last name
      endorserEmail: endorser.email
    }));
    setShowEndorserDropdown(false);
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

  const handleTimeBlur = (e, setter, fieldKey = null) => {
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
      
      const formattedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mod}`;
      
      if (fieldKey) {
        setFormData(prev => ({ ...prev, [fieldKey]: formattedTime }));
      } else {
        setter(formattedTime);
      }
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
    
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => (
      <div key={`blank-${i}`} className="calendar-day empty"></div>
    ));
    
    const renderDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
      <div key={day} className="calendar-day" onClick={() => selectDate(day)}>{day}</div>
    ));
    
    return [...blanks, ...renderDays];
  };

  // --- ACTION HANDLERS ---
  const handleDiscard = () => {
    setFormData(initialFormState);
    setDays(0);
    setAircon(false);
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

    // Required Fields Validation (Schedule is optional if no facility is booked)
    if (!formData.fullName || !formData.emailAddress || !eventDate || (hasFacility && (!startTime || !endTime))) {
      setCustomAlert({
        title: 'Missing Fields',
        message: hasFacility 
          ? 'Please fill in all required fields including Full Name, Email, Event Date, Start Time, and End Time.'
          : 'Please fill in all required fields including Full Name, Email, and Event Date.',
        isSuccess: false
      });
      return;
    }

    // Endorser Validation for Requestors
    if (userRole === 'requestor' || userRole === 'user') {
      if (!formData.endorserName || !formData.endorserDesignation || !formData.endorserEmail) {
        setCustomAlert({
          title: 'Endorser Required',
          message: 'Please complete all Endorser Information fields to proceed with your reservation.',
          isSuccess: false
        });
        return;
      }
    }

    // Selection Validation
    if (!hasFacility && !hasEquipment) {
      setCustomAlert({
        title: 'Selection Required',
        message: 'Please select at least one facility or equipment to reserve.',
        isSuccess: false
      });
      return;
    }

    try {
      // 1. OVERLAP CHECK (Only if facility is booked)
      if (hasFacility && startTime && endTime) {
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
      }

      // Generate a Unique Reference Number (e.g. RES-2026-0814)
      const generatedRefNo = `RES-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      // 2. SUBMIT RESERVATION WITH REFERENCE NUMBER
      await addDoc(collection(db, 'reservations'), {
        refNo: generatedRefNo,
        ...formData,
        userId: currentUser.uid,        
        userEmail: currentUser.email,   
        userRole: userRole,
        eventDate,
        startTime: startTime || 'N/A',
        endTime: endTime || 'N/A',
        durationHours,
        days,
        aircon,
        selectedEquip,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });

      // --- SEND EMAIL NOTIFICATION TO ENDORSER ---
      if (formData.endorserEmail) {
        await sendReservationEmail(
          formData.endorserEmail,
          formData.endorserName,
          { eventName: formData.eventName, eventDate: eventDate }, // Pass specific fields mapped for the template
          `A new reservation request for "${formData.eventName}" has been submitted by ${formData.fullName} and requires your endorsement.`
        );
      }
      // -------------------------------------------

      // 3. SYNC INVENTORY STATUS BACK TO DB
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
        message: `Reservation submitted successfully! Your Reference No. is ${generatedRefNo}.`,
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
        <div className="title">
          <i className="ph"></i>Reservation Form
        </div>
        <div className="required-note">
          All fields marked <span className="req">*</span> are required
        </div>
      </div>

      {/* SECTION 1: Requestor & Endorser Information */}
      <div className="form-card">
        <div className="section-header">
          <span className="step-badge">1</span> Requestor Information
        </div>

        <div className="form-grid col-2">
          <div className="input-group">
            <label>Full Name <span>*</span></label>
            <div className="input-with-icon right-icon">
              <input 
                type="text" 
                value={formData.fullName} 
                onChange={(e) => handleInputChange('fullName', e.target.value)} 
                maxLength={50}
                placeholder="Enter your full name" 
              />
            </div>
          </div>
          <div className="input-group">
            <label>Contact Number <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-phone"></i>
              <input 
                type="text" 
                value={formData.contactNumber} 
                onChange={(e) => handleInputChange('contactNumber', e.target.value.replace(/\D/g, '').slice(0, 11))} 
                maxLength={11}
                placeholder="09XX XXX XXXX" 
              />
            </div>
          </div>
          <div className="input-group full-width">
            <label>Email Address <span>*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph-fill ph-envelope-simple"></i>
              <input 
                type="email" 
                value={formData.emailAddress} 
                onChange={(e) => handleInputChange('emailAddress', e.target.value)} 
                maxLength={50}
                placeholder="your.email@domain.com" 
              />
            </div>
          </div>
        </div>

        {/* ENDORSER SECTION (Only visible for Requestors) */}
        {(userRole === 'requestor' || userRole === 'user') && (
          <>
            <hr className="section-divider" />
            <div className="section-header">
              <span className="step-badge">2</span> Endorser Information
            </div>
            <div className="form-grid col-2">
              <div className="input-group endorser-autocomplete">
                <label>Endorser's Full Name <span className="req">*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    value={formData.endorserName} 
                    onChange={(e) => handleInputChange('endorserName', e.target.value)} 
                    onFocus={() => setShowEndorserDropdown(formData.endorserName.length > 0)}
                    onBlur={() => setTimeout(() => setShowEndorserDropdown(false), 200)}
                    maxLength={50}
                    placeholder="Faculty/Adviser name" 
                    autoComplete="off"
                  />
                  {showEndorserDropdown && endorsersList.filter(e => e.cleanName.toLowerCase().includes(formData.endorserName.toLowerCase())).length > 0 && (
                    <div className="autocomplete-dropdown">
                      {endorsersList
                        .filter(e => e.cleanName.toLowerCase().includes(formData.endorserName.toLowerCase()))
                        .map(endorser => (
                          <div 
                            key={endorser.id} 
                            className="autocomplete-item"
                            onClick={() => handleEndorserSelect(endorser)}
                          >
                            <span className="endorser-dropdown-name">{endorser.cleanName}</span>
                            <span className="endorser-dropdown-email">{endorser.email}</span>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="input-group">
                <label>Endorser's Designation <span className="req">*</span></label>
                <input 
                  type="text" 
                  value={formData.endorserDesignation} 
                  onChange={(e) => handleInputChange('endorserDesignation', e.target.value)} 
                  maxLength={50}
                  placeholder="e.g. Dean, Faculty Adviser" 
                />
              </div>
              <div className="input-group full-width">
                <label>Endorser's Contact Email <span className="req">*</span></label>
                <div className="input-with-icon left-icon">
                  <i className="ph-fill ph-envelope-simple"></i>
                  <input 
                    type="email" 
                    value={formData.endorserEmail} 
                    onChange={(e) => handleInputChange('endorserEmail', e.target.value)} 
                    maxLength={50}
                    placeholder="endorser@university.edu.ph" 
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SECTION 3: Event Information */}
      <div className="form-card">
        <div className="section-header">
          <span className="step-badge">3</span> Event Information
        </div>
        <div className="form-grid col-2">
          <div className="input-group">
            <label>Event Name <span>*</span></label>
            <input 
              type="text" 
              value={formData.eventName} 
              onChange={(e) => handleInputChange('eventName', e.target.value)} 
              maxLength={75}
              placeholder="e.g. Annual General Assembly" 
            />
          </div>
          
          <div className="input-group">
            <label>Event Date <span>*</span></label>
            <div className="calendar-field">
              <div className="input-with-icon left-icon">
                <i className="ph ph-calendar-blank calendar-trigger" onClick={() => setShowCalendar(!showCalendar)}></i>
                <input 
                  type="text" 
                  value={eventDate} 
                  onChange={handleDateChange} 
                  maxLength={10}
                  placeholder="MM/DD/YYYY" 
                  onClick={() => setShowCalendar(true)} 
                  className={dateError ? 'input-error' : ''}
                />
              </div>
              {dateError && <span className="field-error">{dateError}</span>}
              
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
            <div className="event-type-grid">
              {['Academic', 'Cultural', 'Sports', 'Seminar', 'Training', 'Other'].map(type => (
                <label key={type} className="checkbox-option">
                  <input 
                    type="checkbox" 
                    checked={formData.eventType.includes(type)} 
                    onChange={() => handleCheckboxArrayChange('eventType', type)} 
                  /> 
                  {type}
                </label>
              ))}
            </div>
          </div>

          <div className="input-group full-width">
            <label>Purpose / Description <span>*</span></label>
            <textarea 
              value={formData.purpose} 
              onChange={(e) => handleInputChange('purpose', e.target.value)} 
              placeholder="Briefly describe the purpose and objectives of your event..."
            ></textarea>
          </div>
        </div>
      </div>

      {/* SECTION 4: Facility Usage Schedule */}
      <div className="form-card">
        <div className="section-header">
          <span className="step-badge">4</span> Facility Usage Schedule <span className="optional-badge">(Optional if only booking equipment)</span>
        </div>
        <div className="form-grid col-3">
          <div className="input-group">
            <label>Number of Days</label>
            <div className="day-stepper">
              <button type="button" className="stepper-btn" onClick={() => updateDays(-1)}>-</button>
              <input type="text" value={days} readOnly className="stepper-value" />
              <button type="button" className="stepper-btn" onClick={() => updateDays(1)}>+</button>
            </div>
          </div>
          <div className="input-group">
            <label>Start Time</label>
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
            <label>End Time</label>
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
        <div className="info-box green duration-box">
          <i className="ph ph-info"></i>
          <div>
            <strong>Total Duration: {durationHours > 0 ? durationHours : 0} hours / day — Across {days} day(s)</strong>
          </div>
        </div>
      </div>

      {/* SECTIONS 5: Facilities & Equipment */}
      <div className="split-cards">
        
        {/* Facilities Needed */}
        <div className="form-card">
          <div className="section-header">
            <span className="step-badge">5</span> Facilities Needed
          </div>
          
          <div className="checkbox-grid facility-list">
            {inventoryFacilities.length === 0 ? (
              <div className="empty-list">No facilities currently listed.</div>
            ) : (
              inventoryFacilities.map((item) => {
                const isLocked = item.status === 'Unavailable' || item.status === 'Maintenance';
                const isSelected = formData.facilities.includes(item.id);

                return (
                  <label 
                    key={item.id} 
                    className={`facility-option ${isSelected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''}`}
                  >
                    <input 
                      type="checkbox" 
                      className="facility-checkbox"
                      checked={isSelected} 
                      onChange={() => handleCheckboxArrayChange('facilities', item.id)} 
                      disabled={isLocked}
                    /> 
                    <div className="facility-icon">
                      <i className="ph ph-buildings"></i>
                    </div>
                    <div>
                      <strong>{item.name}</strong>
                      <span className="facility-meta">{item.location} | {item.capacity}</span>
                      <span className={`facility-status ${item.status?.toLowerCase() || ''}`}>
                        ● {item.status}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="input-group room-field">
            <label>Specific Room Number / Name</label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-door"></i>
              <input 
                type="text" 
                value={formData.specificRoom} 
                onChange={(e) => handleInputChange('specificRoom', e.target.value)} 
                placeholder="e.g. Room 301, Annex B" 
              />
            </div>
            <span className="helper-text">Leave blank if not applicable</span>
          </div>
        </div>

        {/* Equipment Needed */}
        <div className="form-card">
          <div className="section-header">
            <span className="step-badge">5</span> Equipment Needed
          </div>
          
          <div className="equipment-list">
            {mappedEquipmentList.length === 0 ? (
              <div className="empty-list">No equipment currently listed in inventory.</div>
            ) : (
              mappedEquipmentList.map((item) => {
                const count = selectedEquip[item.id] || 0;
                const isLocked = item.status === 'Unavailable' || item.status === 'Maintenance';
                const isAvailable = !isLocked && item.computedAvailable > 0;

                return (
                  <div className={`equip-item ${isLocked ? 'is-locked' : ''}`} key={item.id}>
                    <div className="equip-info">
                      <div className="icon-box bg-blue">
                        <i className="ph ph-package"></i>
                      </div>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.sku}</span>
                        <span className={`equip-status ${item.status?.toLowerCase() || ''}`}>
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
        <div className="section-header">
          <span className="step-badge">6</span> Air Condition
        </div>
        <div className="aircon-controls">
          
          <div className="aircon-inputs-row">
            <div className={`toggle-box ${aircon ? 'is-enabled' : 'is-disabled'}`} onClick={() => setAircon(!aircon)}>
              <div className="toggle-switch">
                <div className="toggle-knob"></div>
              </div>
              <div>
                <strong>Aircon {aircon ? 'Enabled' : 'Disabled'}</strong>
                <span>Click to toggle</span>
              </div>
            </div>

            <div className="time-inputs">
              <div className="input-group">
                <label>Aircon ON Time</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input 
                    type="text" 
                    value={formData.airconOnTime} 
                    onChange={(e) => handleInputChange('airconOnTime', e.target.value)}
                    onBlur={(e) => handleTimeBlur(e, null, 'airconOnTime')}
                    placeholder="08:00 AM" 
                    disabled={!aircon} 
                    className={!aircon ? 'input-disabled' : ''} 
                  />
                </div>
              </div>
              
              <i className="ph ph-arrow-right arrow"></i>
              
              <div className="input-group">
                <label>Aircon OFF Time</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input 
                    type="text" 
                    value={formData.airconOffTime} 
                    onChange={(e) => handleInputChange('airconOffTime', e.target.value)}
                    onBlur={(e) => handleTimeBlur(e, null, 'airconOffTime')}
                    placeholder="05:00 PM" 
                    disabled={!aircon} 
                    className={!aircon ? 'input-disabled' : ''} 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="info-box blue aircon-note">
            <i className="ph ph-info"></i>
            <div>Aircon will be scheduled based on approved timing. Ensure times are within facility operating hours (6:00 AM - 9:00 PM).</div>
          </div>

        </div>
      </div>

      {/* CERTIFICATION & ACTIONS */}
      <div className="certification">
        <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
        <p>I hereby certify that all information provided in this RASA form is true and correct. I agree to abide by the facility use policies and regulations of the institution. I understand that any misuse of the facility may result in the revocation of this reservation and/or other sanctions.</p>
      </div>

      <div className="form-actions">
        <button className="btn-outline" onClick={handleDiscard}>
          <i className="ph ph-trash"></i> Discard Form
        </button>
        <div className="right-actions">
          <button className="btn-outline" onClick={handleSaveDraft}>
            <i className="ph ph-floppy-disk"></i> {isDraftSaved ? '✓ Draft Saved' : 'Save Draft'}
          </button>
          <button 
            className="btn-primary" 
            onClick={handleSubmit} 
            disabled={!certified}
          >
            Submit Reservation
          </button>
        </div>
      </div>

      {/* Custom React Modal for General Alerts */}
      {customAlert && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 className={customAlert.isSuccess ? 'modal-title success' : 'modal-title error'}>
              {customAlert.title}
            </h3>
            <p className="modal-message">
              {customAlert.message}
            </p>
            <div className="modal-actions">
              <button onClick={() => setCustomAlert(null)} className="modal-button">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
  
      {/* Overlap Warning Modal */}
      {showOverlapWarning && (
        <div className="modal-overlay"> 
          <div className="modal-card">
            <h3 className="modal-title error">Schedule Conflict</h3>
            <p className="modal-message">
              The selected facility or room is already reserved on <strong>{eventDate}</strong> during an overlapping time window. Please adjust your <strong>Start/End Time</strong> or select a different facility.
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowOverlapWarning(false)} className="modal-button">
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