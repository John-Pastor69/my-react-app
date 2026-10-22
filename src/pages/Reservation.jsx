import React, { useState, useEffect, useRef } from 'react';
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
import { formatReservationTimeInput, isReservationTimeInputValid } from '../services/reservationTimeInput';
import ReservationDetails from './ReservationDetails';
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
  otherEquipment: '',
  airconOnTime: '', 
  airconOffTime: '',
  endorserName: '', 
  endorserDesignation: '', 
  endorserEmail: ''
};

const parseOptionalCapacity = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
};

const sanitizeAlphabeticName = (value) => value.replace(/[^A-Za-z ]/g, '');

const getFacilityCapacityLimits = (facility) => ({
  min: parseOptionalCapacity(facility.minCapacity),
  max: Object.prototype.hasOwnProperty.call(facility, 'maxCapacity')
    ? parseOptionalCapacity(facility.maxCapacity)
    : parseOptionalCapacity(facility.capacity)
});

const getFacilityCapacityLabel = (facility) => {
  const { min, max } = getFacilityCapacityLimits(facility);
  if (min && max) return `${min}–${max} people`;
  if (min) return `${min}+ people`;
  if (max) return `Up to ${max} people`;
  return 'Capacity not specified';
};

// Helper function extracted outside component
const parseTimeToDecimal = (timeStr) => {
  const minutes = parseTimeToMinutes(timeStr);
  return minutes === null ? null : minutes / 60;
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const modifier = match[3]?.toUpperCase();
  if (minutes > 59) return null;
  if (modifier) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12 && modifier === 'AM') hours = 0;
    if (hours < 12 && modifier === 'PM') hours += 12;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const formatTimeForStorage = (timeStr) => {
  const totalMinutes = parseTimeToMinutes(timeStr);
  if (totalMinutes === null) return 'N/A';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`;
};

const formatTimeForPicker = (timeStr) => {
  const totalMinutes = parseTimeToMinutes(timeStr);
  if (totalMinutes === null) return '';
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseDateOrdinal = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return parseDateOrdinal(value.toDate());
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000);
  }

  const dateString = String(value).trim();
  let year;
  let month;
  let day;
  const monthFirstMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const yearFirstMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (monthFirstMatch) {
    [, month, day, year] = monthFirstMatch;
  } else if (yearFirstMatch) {
    [, year, month, day] = yearFirstMatch;
  } else {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.floor(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86400000);
  }

  year = Number(year);
  month = Number(month);
  day = Number(day);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return Math.floor(parsed.getTime() / 86400000);
};

const getReservationDateRange = (reservation) => {
  const start = parseDateOrdinal(reservation.eventDate || reservation.date);
  if (start === null) return null;

  const explicitEnd = parseDateOrdinal(reservation.endDate);
  const dayCount = Math.max(1, Number(reservation.days) || 1);
  const end = explicitEnd ?? start + dayCount - 1;
  return end < start ? null : { start, end };
};

const timeRangesOverlapAcrossDates = (firstRange, firstStart, firstEnd, secondRange, secondStart, secondEnd) => {
  const firstEndMinute = firstEnd <= firstStart ? firstEnd + 1440 : firstEnd;
  const secondEndMinute = secondEnd <= secondStart ? secondEnd + 1440 : secondEnd;

  for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
    const firstDayStart = Math.max(firstRange.start, secondRange.start - dayOffset);
    const firstDayEnd = Math.min(firstRange.end, secondRange.end - dayOffset);
    if (firstDayStart > firstDayEnd) continue;

    const shiftedSecondStart = secondStart + dayOffset * 1440;
    const shiftedSecondEnd = secondEndMinute + dayOffset * 1440;
    if (firstStart < shiftedSecondEnd && firstEndMinute > shiftedSecondStart) {
      return true;
    }
  }
  return false;
};

const getOverlappingFacilityReservations = (reservations, request, facilityId) => {
  const requestStart = parseDateOrdinal(request.eventDate);
  const requestEnd = parseDateOrdinal(request.endDate);
  const requestStartTime = parseTimeToMinutes(request.startTime);
  const requestEndTime = parseTimeToMinutes(request.endTime);
  if (
    requestStart === null
    || requestEnd === null
    || requestEnd < requestStart
    || requestStartTime === null
    || requestEndTime === null
    || requestEndTime === requestStartTime
    || !facilityId
  ) return [];

  return reservations.filter((reservation) => {
    const status = (reservation.status || '').toLowerCase().trim();
    if (['rejected', 'cancelled', 'expired', 'archived'].includes(status)) return false;

    const hasRejectedApproval = Object.values(reservation.approvals || {}).some((approval) => {
      const approvalStatus = typeof approval === 'string' ? approval : approval?.status;
      return (approvalStatus || '').toLowerCase() === 'rejected';
    });
    if (hasRejectedApproval) return false;

    const existingRange = getReservationDateRange(reservation);
    if (!existingRange) return false;

    const existingStartTime = parseTimeToMinutes(reservation.startTime);
    const existingEndTime = parseTimeToMinutes(reservation.endTime);
    if (
      existingStartTime === null
      || existingEndTime === null
      || existingEndTime === existingStartTime
    ) return false;

    const sharesFacility = (reservation.facilities || []).includes(facilityId);
    return sharesFacility && timeRangesOverlapAcrossDates(
      { start: requestStart, end: requestEnd },
      requestStartTime,
      requestEndTime,
      existingRange,
      existingStartTime,
      existingEndTime
    );
  });
};

const findFacilityConflict = (reservations, request, facilities) => {
  for (const facilityId of request.facilities) {
    const overlappingReservations = getOverlappingFacilityReservations(
      reservations,
      request,
      facilityId
    );
    if (overlappingReservations.length === 0) continue;

    const facility = facilities.find((item) => item.id === facilityId);
    const maxCapacity = facility ? getFacilityCapacityLimits(facility).max : null;
    const conflictDetails = {
      conflictFacilityName: facility?.name || facilityId,
      conflictType: 'schedule'
    };
    if (maxCapacity === null) {
      return { ...overlappingReservations[0], ...conflictDetails };
    }

    const hasUnknownCapacity = overlappingReservations.some((reservation) => {
      const participants = Number(reservation.expectedParticipants);
      return !Number.isInteger(participants) || participants <= 0;
    });
    if (hasUnknownCapacity) {
      return {
        ...overlappingReservations[0],
        ...conflictDetails,
        conflictType: 'unknown-capacity'
      };
    }

    const occupiedCapacity = overlappingReservations.reduce(
      (total, reservation) => total + Number(reservation.expectedParticipants),
      0
    );
    const requestedCapacity = Number(request.expectedParticipants);
    if (occupiedCapacity + requestedCapacity > maxCapacity) {
      return {
        ...overlappingReservations[0],
        ...conflictDetails,
        conflictType: 'capacity',
        occupiedCapacity,
        requestedCapacity,
        maxCapacity
      };
    }
  }

  return null;
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

// Helper to generate all date strings in a multi-day range (MM/DD/YYYY)
const getDatesInRange = (startDateStr, numDays) => {
  const dates = [];
  if (!startDateStr) return dates;
  const [m, d, y] = startDateStr.split('/').map(Number);
  if (!m || !d || !y) return [startDateStr];
  
  const current = new Date(y, m - 1, d);
  const totalDays = Math.max(1, numDays);
  
  for (let i = 0; i < totalDays; i++) {
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const yy = current.getFullYear();
    dates.push(`${mm}/${dd}/${yy}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

// Helper to calculate end date string from start date and days
const calculateEndDate = (startDateStr, numDays) => {
  const dates = getDatesInRange(startDateStr, numDays);
  return dates[dates.length - 1] || startDateStr;
};

const Reservation = () => {
  // --- AUTH & USER STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('requestor');

  // --- FORM STATES ---
  const [formData, setFormData] = useState(initialFormState);
  const [days, setDays] = useState(0); // Default to 0 days
  const [endDateInput, setEndDateInput] = useState('');
  const [aircon, setAircon] = useState(false); // Default to off
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationHours, setDurationHours] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // DYNAMIC SELECTION CARTS
  const [selectedEquip, setSelectedEquip] = useState({});

  const [certified, setCertified] = useState(false);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  
  // --- MODAL STATES ---
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [conflictEvent, setConflictEvent] = useState(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [customAlert, setCustomAlert] = useState(null); 

  // --- UI & VALIDATION STATES ---
  const [inventoryEquipments, setInventoryEquipments] = useState([]);
  const [inventoryFacilities, setInventoryFacilities] = useState([]);
  const [reservationsData, setReservationsData] = useState([]);
  const [reservationsLoaded, setReservationsLoaded] = useState(false);
  const [dateError, setDateError] = useState('');
  const [daysDateError, setDaysDateError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarView, setCalendarView] = useState(new Date());
  const [showDaysCalendar, setShowDaysCalendar] = useState(false);
  const [daysCalendarView, setDaysCalendarView] = useState(new Date());
  const [missingFields, setMissingFields] = useState({});
  const fieldRefs = useRef({});

  // --- ENDORSER DROPDOWN STATE ---
  const [endorsersList, setEndorsersList] = useState([]);
  const [showEndorserDropdown, setShowEndorserDropdown] = useState(false);

  const clearMissingField = (fieldKey) => {
    setMissingFields(prev => {
      if (!prev[fieldKey]) return prev;
      const updated = { ...prev };
      delete updated[fieldKey];
      return updated;
    });
  };

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
              emailAddress: prev.emailAddress || userData.email || user.email || '',
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
        if (parsed.formData) {
          setFormData(prev => ({
            ...prev,
            ...parsed.formData,
            eventName: sanitizeAlphabeticName(parsed.formData.eventName || ''),
            endorserName: sanitizeAlphabeticName(parsed.formData.endorserName || ''),
            eventType: Array.isArray(parsed.formData.eventType)
              ? parsed.formData.eventType.slice(0, 1)
              : []
          }));
        }
        if (parsed.days !== undefined) setDays(parsed.days);
        if (parsed.endDateInput !== undefined) setEndDateInput(parsed.endDateInput);
        if (parsed.aircon !== undefined) setAircon(parsed.aircon);
        if (parsed.eventDate) setEventDate(parsed.eventDate);
        if (parsed.startTime) setStartTime(formatTimeForPicker(parsed.startTime));
        if (parsed.endTime) setEndTime(formatTimeForPicker(parsed.endTime));
        if (parsed.selectedEquip) setSelectedEquip(parsed.selectedEquip);
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
  }, []);

  // Reset Draft toggle when form changes
  useEffect(() => {
    if (isDraftSaved) setIsDraftSaved(false);
  }, [formData, days, endDateInput, aircon, eventDate, startTime, endTime, selectedEquip]);

  // Automatically calculate `days` from `eventDate` and `endDateInput`
  useEffect(() => {
    const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
    if (dateRegex.test(eventDate) && dateRegex.test(endDateInput)) {
      const [m1, d1, y1] = eventDate.split('/').map(Number);
      const [m2, d2, y2] = endDateInput.split('/').map(Number);
      const startObj = new Date(y1, m1 - 1, d1);
      const endObj = new Date(y2, m2 - 1, d2);
      const diffDays = Math.floor((endObj - startObj) / (1000 * 60 * 60 * 24)) + 1;
      setDays(diffDays > 0 ? diffDays : 0);
    } else if (dateRegex.test(eventDate) && !endDateInput) {
      setDays(1);
    } else {
      setDays(0);
    }
  }, [eventDate, endDateInput]);

  // --- LIVE LISTEN TO FACILITIES, EQUIPMENTS, RESERVATIONS & USERS (For Endorsers) ---
  useEffect(() => {
    if (!currentUser) return; // Added safeguard

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
      setReservationsLoaded(true);
    }, (error) => console.error('Failed to load reservations:', error));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  }, [currentUser]);

  // --- DYNAMICALLY CALCULATE AVAILABLE COUNTS ---
  const mappedEquipmentList = inventoryEquipments.map(item => {
    let reservedCount = 0;
    reservationsData.forEach(res => {
      const statusLower = (res.status || '').toLowerCase().trim();
      if (statusLower !== 'rejected' && statusLower !== 'cancelled') {
        if (res.selectedEquip && res.selectedEquip[item.id]) {
          reservedCount += Number(res.selectedEquip[item.id]);
        }
      }
    });

    const total = Number(item.totalCount) || 0;
    const availableCount = item.status === 'Unavailable' ? 0 : Math.max(0, total - reservedCount);
    const effectiveStatus = availableCount === 0 ? 'Unavailable' : item.status;
    return { ...item, status: effectiveStatus, computedReserved: reservedCount, computedAvailable: availableCount };
  });
  const selectedFacility = inventoryFacilities.find((facility) => formData.facilities.includes(facility.id));
  const selectedFacilityCapacity = selectedFacility
    ? getFacilityCapacityLimits(selectedFacility)
    : { min: null, max: null };
  const hasFacility = formData.facilities.length > 0;
  const expectedParticipantCount = Number(formData.expectedParticipants);
  const participantCountOutOfRange = Boolean(formData.expectedParticipants && (
    !Number.isInteger(expectedParticipantCount)
    || expectedParticipantCount <= 0
    || (selectedFacilityCapacity.max !== null && expectedParticipantCount > selectedFacilityCapacity.max)
  ));

  const conflictRequest = {
    eventDate,
    endDate: endDateInput,
    startTime,
    endTime,
    facilities: formData.facilities,
    expectedParticipants: formData.expectedParticipants
  };
  const getAvailableFacilityCapacity = (facility) => {
    const maxCapacity = getFacilityCapacityLimits(facility).max;
    if (maxCapacity === null) return null;

    const overlappingReservations = getOverlappingFacilityReservations(
      reservationsData,
      conflictRequest,
      facility.id
    );
    const hasUnknownCapacity = overlappingReservations.some((reservation) => {
      const participants = Number(reservation.expectedParticipants);
      return !Number.isInteger(participants) || participants <= 0;
    });
    if (hasUnknownCapacity) return 0;

    const occupiedCapacity = overlappingReservations.reduce(
      (total, reservation) => total + Number(reservation.expectedParticipants),
      0
    );

    return Math.max(0, maxCapacity - occupiedCapacity);
  };
  const requestStartDate = parseDateOrdinal(eventDate);
  const requestEndDate = parseDateOrdinal(endDateInput);
  const invalidDateRange = requestStartDate !== null
    && requestEndDate !== null
    && requestEndDate < requestStartDate;
  const liveConflict = reservationsLoaded
    && !dateError
    && !daysDateError
    && !invalidDateRange
    ? findFacilityConflict(reservationsData, conflictRequest, inventoryFacilities)
    : null;
  const liveConflictEndDate = liveConflict?.endDate
    || calculateEndDate(liveConflict?.eventDate, liveConflict?.days || 1);
  const selectedSchedule = reservationsData.find(
    (reservation) => reservation.id === selectedScheduleId
  );

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
    const inputValue = ['eventName', 'endorserName'].includes(field)
      ? sanitizeAlphabeticName(value)
      : value;

    setFormData(prev => {
      const updated = { ...prev, [field]: inputValue };

      if (field === 'endorserName') {
        const matchedEndorser = endorsersList.find(
          e => e.cleanName.toLowerCase() === inputValue.trim().toLowerCase()
        );
        if (matchedEndorser && matchedEndorser.department) {
          updated.endorserDesignation = matchedEndorser.department;
          clearMissingField('endorserDesignation');
        }
      }

      return updated;
    });

    if (inputValue && String(inputValue).trim() !== '') {
      clearMissingField(field);
    }

    if (field === 'endorserName') {
      setShowEndorserDropdown(inputValue.length > 0);
    }
  };

  const handleEndorserSelect = (endorser) => {
    setFormData(prev => ({
      ...prev,
      endorserName: sanitizeAlphabeticName(endorser.cleanName),
      endorserDesignation: endorser.department || prev.endorserDesignation,
      endorserEmail: endorser.email
    }));
    clearMissingField('endorserName');
    if (endorser.department) {
      clearMissingField('endorserDesignation');
    }
    clearMissingField('endorserEmail');
    setShowEndorserDropdown(false);
  };

  const handleCheckboxArrayChange = (field, value) => {
    setFormData(prev => {
      if (field === 'facilities') {
        clearMissingField('expectedParticipants');
        const updated = prev[field].includes(value)
          ? prev[field].filter(item => item !== value)
          : [...prev[field], value];
        if (updated.length > 0) clearMissingField(field);
        return { ...prev, [field]: updated };
      } else if (field === 'eventType') {
        const updated = prev[field].includes(value) ? [] : [value];
        if (updated.length > 0) clearMissingField(field);
        return { ...prev, [field]: updated };
      } else {
        const updated = prev[field].includes(value)
          ? prev[field].filter(item => item !== value)
          : [...prev[field], value];
        if (updated.length > 0) {
          clearMissingField(field);
        }
        return { ...prev, [field]: updated };
      }
    });
  };

  const updateEquip = (item, delta) => {
    if (item.status === 'Unavailable' || item.status === 'Maintenance') return;
    const currentSelected = selectedEquip[item.id] || 0;
    const newSelected = currentSelected + delta;
    if (newSelected < 0 || newSelected > item.computedAvailable) return;
    setSelectedEquip(prev => ({ ...prev, [item.id]: newSelected }));
  };

  const handleEquipInputChange = (item, val) => {
    if (item.status === 'Unavailable' || item.status === 'Maintenance') return;
    if (val === '') {
      setSelectedEquip(prev => ({ ...prev, [item.id]: 0 }));
      return;
    }
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;
    const capped = Math.min(num, item.computedAvailable);
    setSelectedEquip(prev => ({ ...prev, [item.id]: capped }));
  };

  const handleDateChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length >= 3 && val.length <= 4) val = val.slice(0, 2) + '/' + val.slice(2);
    else if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4, 8);
    
    setEventDate(val);
    
    if (val.length > 0) {
      const isValidFormat = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(val)
        && parseDateOrdinal(val) !== null;
      if (!isValidFormat) {
        setDateError('Invalid format. Use MM/DD/YYYY');
      } else {
        const [m, d, y] = val.split('/').map(Number);
        const inputDate = new Date(y, m - 1, d);
        
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + 7);
        
        if (inputDate < minDate) {
          setDateError('Must be at least 7 days from today');
        } else {
          setDateError('');
          clearMissingField('eventDate');
        }
      }
    } else {
      setDateError('');
    }
  };

  const handleDaysDateChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length >= 3 && val.length <= 4) val = val.slice(0, 2) + '/' + val.slice(2);
    else if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4, 8);
    
    setEndDateInput(val);
    
    if (val.length > 0) {
      const isValidFormat = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(val)
        && parseDateOrdinal(val) !== null;
      if (!isValidFormat) {
        setDaysDateError('Invalid format. Use MM/DD/YYYY');
      } else {
        const [m, d, y] = val.split('/').map(Number);
        const inputDate = new Date(y, m - 1, d);
        
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + 7);
        
        if (inputDate < minDate) {
          setDaysDateError('Must be at least 7 days from today');
        } else {
          setDaysDateError('');
          clearMissingField('endDateInput');
        }
      }
    } else {
      setDaysDateError('');
    }
  };

  // Restricts input strictly to 12-hour AM/PM time (disallows 13:00, 00:00, etc.)
  const handleTimeInput = (e, setter, stateKey, isFormData = false) => {
    const val = e.target.value;
    if (!isReservationTimeInputValid(val)) return;
    if (val === '') {
      if (isFormData) {
        setFormData(prev => ({ ...prev, [stateKey]: '' }));
      } else {
        setter('');
      }
      return;
    }

    if (isFormData) {
      handleInputChange(stateKey, val);
    } else {
      setter(val);
      if (val.trim() !== '') clearMissingField(stateKey);
    }
  };

  const handleTimeBlur = (e, setter, fieldKey = null, missingKey = null) => {
    const val = e.target.value.trim();
    if (!val) return;
    const formattedTime = formatReservationTimeInput(val);
    if (formattedTime) {
      if (fieldKey) {
        setFormData(prev => ({ ...prev, [fieldKey]: formattedTime }));
        clearMissingField(fieldKey);
      } else {
        setter(formattedTime);
        if (missingKey) clearMissingField(missingKey);
      }
    } else {
      if (fieldKey) {
        setFormData(prev => ({ ...prev, [fieldKey]: '' }));
      } else {
        setter('');
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
    clearMissingField('eventDate');
    setShowCalendar(false); 
  };

  const renderCalendarDays = () => {
    const year = calendarView.getFullYear();
    const month = calendarView.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); 

    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() + 7); // 7-day restriction rule
    
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => (
      <div key={`blank-${i}`} className="calendar-day empty"></div>
    ));
    
    const renderDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < minDate;
      return (
        <div 
          key={day} 
          className={`calendar-day ${isPast ? 'disabled' : ''}`} 
          onClick={() => !isPast && selectDate(day)}
        >
          {day}
        </div>
      );
    });
    
    return [...blanks, ...renderDays];
  };

  const handleDaysPrevMonth = () => setDaysCalendarView(new Date(daysCalendarView.getFullYear(), daysCalendarView.getMonth() - 1, 1));
  const handleDaysNextMonth = () => setDaysCalendarView(new Date(daysCalendarView.getFullYear(), daysCalendarView.getMonth() + 1, 1));

  const selectDaysDate = (day) => {
    const month = String(daysCalendarView.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    setEndDateInput(`${month}/${formattedDay}/${daysCalendarView.getFullYear()}`);
    setDaysDateError('');
    clearMissingField('endDateInput');
    setShowDaysCalendar(false);
  };

  const renderDaysCalendarDays = () => {
    const year = daysCalendarView.getFullYear();
    const month = daysCalendarView.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); 

    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() + 7); // 7-day restriction rule
    
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => (
      <div key={`blank-days-${i}`} className="calendar-day empty"></div>
    ));
    
    const renderDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < minDate;
      return (
        <div 
          key={day} 
          className={`calendar-day ${isPast ? 'disabled' : ''}`} 
          onClick={() => !isPast && selectDaysDate(day)}
        >
          {day}
        </div>
      );
    });
    
    return [...blanks, ...renderDays];
  };

  // --- ACTION HANDLERS ---
  const handleDiscard = (preserveSchedule = false) => {
    // Keep auto-filled readonly data when discarding
    const retainedFullName = formData.fullName;
    const retainedEmail = formData.emailAddress;
    
    setFormData({
        ...initialFormState,
        fullName: retainedFullName,
        emailAddress: retainedEmail
    });
    if (!preserveSchedule) {
      setDays(0);
      setEndDateInput('');
      setEventDate('');
      setStartTime('');
      setEndTime('');
    }
    setAircon(false);
    setSelectedEquip({});
    setCertified(false);
    setIsDraftSaved(false);
    setMissingFields({});
    localStorage.removeItem('reservationDraft');
  };

  const handleSaveDraft = () => {
    const draftData = { formData, days, endDateInput, aircon, eventDate, startTime, endTime, selectedEquip };
    localStorage.setItem('reservationDraft', JSON.stringify(draftData));
    setIsDraftSaved(true);
  };

  const handleSubmit = async () => {
    if (!certified || isSubmitting) return;
    
    if (!currentUser) {
      setCustomAlert({
        title: 'Authentication Required',
        message: 'You must be logged in to submit a reservation.',
        isSuccess: false
      });
      return;
    }

    const hasEquipment = Object.values(selectedEquip).some(qty => qty > 0)
      || Boolean(formData.otherEquipment.trim());
    // Validate all required fields in top-to-bottom order
    const requiredOrder = [
      { key: 'fullName', missing: !formData.fullName.trim() },
      { key: 'contactNumber', missing: !formData.contactNumber.trim() },
      { key: 'emailAddress', missing: !formData.emailAddress.trim() },
      ...((userRole === 'requestor' || userRole === 'user') ? [
        { key: 'endorserName', missing: !formData.endorserName.trim() },
        { key: 'endorserDesignation', missing: !formData.endorserDesignation.trim() },
        { key: 'endorserEmail', missing: !formData.endorserEmail.trim() }
      ] : []),
      { key: 'eventName', missing: !formData.eventName.trim() },
      { key: 'expectedParticipants', missing: !formData.expectedParticipants.trim() },
      { key: 'eventType', missing: formData.eventType.length === 0 },
      { key: 'eventDate', missing: !eventDate.trim() || !!dateError },
      { key: 'endDateInput', missing: !endDateInput.trim() || !!daysDateError || days < 1 || invalidDateRange },
      { key: 'startTime', missing: !startTime.trim() },
      { key: 'endTime', missing: !endTime.trim() },
      { key: 'purpose', missing: !formData.purpose.trim() },
      ...(aircon ? [
        { key: 'airconOnTime', missing: !formData.airconOnTime.trim() },
        { key: 'airconOffTime', missing: !formData.airconOffTime.trim() }
      ] : [])
    ];

    const newMissing = {};
    let firstMissingKey = null;

    requiredOrder.forEach(({ key, missing }) => {
      if (missing) {
        newMissing[key] = true;
        if (!firstMissingKey) firstMissingKey = key;
      }
    });

    if (firstMissingKey) {
      setMissingFields(newMissing);
      const targetEl = fieldRefs.current[firstMissingKey];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inputEl = targetEl.querySelector('input:not([type="checkbox"]), textarea');
        if (inputEl && firstMissingKey !== 'eventDate' && firstMissingKey !== 'endDateInput') {
          inputEl.focus({ preventScroll: true });
        }
      }
      return;
    }

    if (
      !Number.isInteger(expectedParticipantCount)
      || expectedParticipantCount <= 0
      || (selectedFacilityCapacity.max !== null && expectedParticipantCount > selectedFacilityCapacity.max)
    ) {
      setMissingFields({ expectedParticipants: true });
      setCustomAlert({
        title: 'Participant Limit',
        message: expectedParticipantCount <= 0 || !Number.isInteger(expectedParticipantCount)
          ? 'Enter a positive whole number of participants.'
          : `The selected facility can accommodate up to ${selectedFacilityCapacity.max} participants.`,
        isSuccess: false
      });
      fieldRefs.current.expectedParticipants?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    const submittedStartTime = parseTimeToMinutes(startTime);
    const submittedEndTime = parseTimeToMinutes(endTime);
    if (submittedStartTime === null || submittedEndTime === null || submittedEndTime === submittedStartTime) {
      setCustomAlert({
        title: 'Invalid Time Range',
        message: 'Enter a valid time range. Start and end times cannot be the same.',
        isSuccess: false
      });
      return;
    }

    if (liveConflict) {
      const conflictEndDate = liveConflict.endDate
        || calculateEndDate(liveConflict.eventDate, liveConflict.days || 1);
      setConflictEvent({
        eventName: liveConflict.eventName || 'Untitled Event',
        facilityName: liveConflict.conflictFacilityName,
        conflictType: liveConflict.conflictType,
        occupiedCapacity: liveConflict.occupiedCapacity,
        requestedCapacity: liveConflict.requestedCapacity,
        maxCapacity: liveConflict.maxCapacity,
        date: conflictEndDate !== liveConflict.eventDate
          ? `${liveConflict.eventDate} - ${conflictEndDate}`
          : liveConflict.eventDate || 'N/A',
        time: `${liveConflict.startTime || 'N/A'} - ${liveConflict.endTime || 'N/A'}`
      });
      setShowOverlapWarning(true);
      return;
    }

    setIsSubmitting(true);

    try {
      // Recheck against Firestore at submit time in case the live list is stale.
      if (hasFacility) {
        const snap = await getDocs(collection(db, 'reservations'));
        const reservations = snap.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));
        const conflictingReservation = findFacilityConflict(
          reservations,
          conflictRequest,
          inventoryFacilities
        );

        if (conflictingReservation) {
          const conflictEndDate = conflictingReservation.endDate
            || calculateEndDate(conflictingReservation.eventDate, conflictingReservation.days || 1);
          setConflictEvent({
            eventName: conflictingReservation.eventName || 'Untitled Event',
            facilityName: conflictingReservation.conflictFacilityName,
            conflictType: conflictingReservation.conflictType,
            occupiedCapacity: conflictingReservation.occupiedCapacity,
            requestedCapacity: conflictingReservation.requestedCapacity,
            maxCapacity: conflictingReservation.maxCapacity,
            date: conflictEndDate !== conflictingReservation.eventDate
              ? `${conflictingReservation.eventDate} - ${conflictEndDate}`
              : conflictingReservation.eventDate || 'N/A',
            time: `${conflictingReservation.startTime || 'N/A'} - ${conflictingReservation.endTime || 'N/A'}`
          });
          setShowOverlapWarning(true);
          setIsSubmitting(false);
          return;
        }
      }

      const generatedRefNo = `RES-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
      const calculatedEndDate = endDateInput || calculateEndDate(eventDate, days);

      // 2. SUBMIT RESERVATION WITH END DATE
      await addDoc(collection(db, 'reservations'), {
        refNo: generatedRefNo,
        ...formData,
        userId: currentUser.uid,        
        userEmail: currentUser.email,   
        userRole: userRole,
        eventDate,
        endDate: calculatedEndDate,
        startTime: formatTimeForStorage(startTime),
        endTime: formatTimeForStorage(endTime),
        durationHours,
        days,
        aircon,
        selectedEquip,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });

      if (formData.endorserEmail) {
        await sendReservationEmail(
          formData.endorserEmail,
          formData.endorserName,
          { eventName: formData.eventName, eventDate: eventDate },
          `A new reservation request for "${formData.eventName}" has been submitted by ${formData.fullName} and requires your endorsement.`
        );
      }

      try {
        const batch = writeBatch(db);
        const updateTimestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        
        for (const [eqId, qty] of Object.entries(selectedEquip)) {
          if (qty > 0) {
            batch.update(doc(db, 'equipments', eqId), { lastUpdated: updateTimestamp });
          }
        }

        await batch.commit();
      } catch (inventoryErr) {
        console.warn("Inventory update skipped due to permissions:", inventoryErr);
      }

      handleDiscard(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`reservation-container ${isSubmitting ? 'is-submitting' : ''}`}
      aria-busy={isSubmitting}
      onKeyDownCapture={(event) => {
        if (isSubmitting) event.preventDefault();
      }}
    >
      {isSubmitting && (
        <div className="reservation-submitting-overlay" role="status" aria-live="assertive">
          <div className="reservation-loading-screen">
            <span className="reservation-submitting-spinner" aria-hidden="true" />
            <strong>Submitting reservation</strong>
            <span>Please wait while we process your request.</span>
          </div>
        </div>
      )}
      
      <div className="form-header">
        <div className="title">
          <i className="ph"></i>Reservation Form
        </div>
        <div className="required-note">
          All fields marked <span className="req">*</span> are required
        </div>
      </div>

      {/* Requestor & Endorser Information */}
      <div className="form-card">
        <div className="section-header">
          Requestor Information
        </div>

        <div className="form-grid col-2">
          <div 
            className={`input-group ${missingFields.fullName ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.fullName = el}
          >
            <label>Full Name <span className="req">*</span></label>
            <div className="input-with-icon right-icon">
              <input
                type="text" 
                value={formData.fullName} 
                onChange={(e) => handleInputChange('fullName', e.target.value)} 
                maxLength={50}
                placeholder="Enter your full name" 
                readOnly={true}
                className={missingFields.fullName ? 'input-error' : ''}
              />
            </div>
          </div>
          <div 
            className={`input-group ${missingFields.contactNumber ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.contactNumber = el}
          >
            <label>Contact Number <span className="req">*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-phone"></i>
              <input
                type="text" 
                value={formData.contactNumber} 
                onChange={(e) => handleInputChange('contactNumber', e.target.value.replace(/\D/g, '').slice(0, 11))} 
                maxLength={11}
                placeholder="09XX XXX XXXX" 
                className={missingFields.contactNumber ? 'input-error' : ''}
              />
            </div>
          </div>
          <div 
            className={`input-group full-width ${missingFields.emailAddress ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.emailAddress = el}
          >
            <label>Email Address <span className="req">*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph-fill ph-envelope-simple"></i>
              <input 
                type="email" 
                value={formData.emailAddress} 
                onChange={(e) => handleInputChange('emailAddress', e.target.value)} 
                maxLength={50}
                placeholder="your.email@domain.com" 
                readOnly={true}
                className={missingFields.emailAddress ? 'input-error' : ''}
              />
            </div>
          </div>
        </div>

        {/* ENDORSER SECTION (Only visible for Requestors) */}
        {(userRole === 'requestor' || userRole === 'user') && (
          <>
            <hr className="section-divider" />
            <div className="section-header">
              Endorser Information
            </div>
            <div className="form-grid col-2">
              <div 
                className={`input-group endorser-autocomplete ${missingFields.endorserName ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.endorserName = el}
              >
                <label>Endorser's Full Name <span className="req">*</span></label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    value={formData.endorserName} 
                    onChange={(e) => handleInputChange('endorserName', e.target.value)} 
                    pattern="[A-Za-z ]*"
                    onFocus={() => setShowEndorserDropdown(formData.endorserName.length > 0)}
                    onBlur={() => setTimeout(() => setShowEndorserDropdown(false), 200)}
                    maxLength={50}
                    placeholder="type faculty or endorser's name" 
                    autoComplete="off"
                    className={missingFields.endorserName ? 'input-error' : ''}
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
              <div 
                className={`input-group ${missingFields.endorserDesignation ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.endorserDesignation = el}
              >
                <label>Department <span className="req">*</span></label>
                <input 
                  type="text" 
                  value={formData.endorserDesignation} 
                  onChange={(e) => handleInputChange('endorserDesignation', e.target.value)} 
                  maxLength={50}
                  placeholder="e.g. Dean, Faculty Adviser" 
                  className={missingFields.endorserDesignation ? 'input-error' : ''}
                />
              </div>
              <div 
                className={`input-group full-width ${missingFields.endorserEmail ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.endorserEmail = el}
              >
                <label>Endorser's Contact Email <span className="req">*</span></label>
                <div className="input-with-icon left-icon">
                  <i className="ph-fill ph-envelope-simple"></i>
                  <input 
                    type="email" 
                    value={formData.endorserEmail} 
                    onChange={(e) => handleInputChange('endorserEmail', e.target.value)} 
                    maxLength={50}
                    placeholder="endorser@university.edu.ph" 
                    readOnly={true}
                    className={missingFields.endorserEmail ? 'input-error' : ''}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="split-cards">
        <div className="form-card">
          <div className="section-header">Facility</div>

          <div className="checkbox-grid facility-list">
            {inventoryFacilities.length === 0 ? (
              <div className="empty-list">No facilities currently listed.</div>
            ) : (
              inventoryFacilities.map((item) => {
                const isSelected = formData.facilities.includes(item.id);
                const isLocked = item.status === 'Unavailable' || item.status === 'Maintenance';
                const maxCapacity = getFacilityCapacityLimits(item).max;

                const displayCapacityLeft = getAvailableFacilityCapacity(item);

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
                      <span className="facility-meta">
                        {[item.location, getFacilityCapacityLabel(item)].filter(Boolean).join(' | ')}
                      </span>
                      <span className="facility-availability">
                        <span className={`facility-status ${item.status?.toLowerCase() || ''}`}>
                          ● {item.status}
                        </span>
                        {maxCapacity !== null && item.status?.toLowerCase() === 'available' && (
                          <span className="facility-capacity-left">
                            {displayCapacityLeft} / {maxCapacity} capacity left
                          </span>
                        )}
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

        <div className="form-card">
          <div className="section-header">Equipment</div>

          <div className="equipment-list">
            {mappedEquipmentList.length === 0 ? (
              <div className="empty-list">No equipment currently listed in inventory.</div>
            ) : (
              mappedEquipmentList.map((item) => {
                const count = selectedEquip[item.id] || 0;
                const isLocked = item.status === 'Unavailable' || item.status === 'Maintenance' || !hasFacility;
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
                      <input
                        type="text"
                        inputMode="numeric"
                        value={count}
                        onChange={(e) => handleEquipInputChange(item, e.target.value)}
                        disabled={isLocked}
                      />
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

          <div className="input-group room-field">
            <label>Other Equipment</label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-package"></i>
              <input
                type="text"
                value={formData.otherEquipment}
                onChange={(e) => handleInputChange('otherEquipment', e.target.value)}
                placeholder="e.g. TV Remote, Speaker"
              />
            </div>
            <span className="helper-text">Leave blank if not applicable</span>
          </div>

        </div>
      </div>

      {/* Event Information */}
      <div className="form-card">
        <div className="section-header">
          Event Information
        </div>
        <div className="form-grid col-2">
          {/* Row 1 Left: Event Name */}
          <div 
            className={`input-group ${missingFields.eventName ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.eventName = el}
          >
            <label>Event Name <span className="req">*</span></label>
            <input 
              type="text" 
              value={formData.eventName} 
              onChange={(e) => handleInputChange('eventName', e.target.value)} 
              pattern="[A-Za-z ]*"
              maxLength={75}
              placeholder="e.g. Annual General Assembly" 
              className={missingFields.eventName ? 'input-error' : ''}
            />
          </div>
          
          {/* Row 1 Right: Expected Number of Participants */}
          <div 
            className={`input-group ${missingFields.expectedParticipants || participantCountOutOfRange ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.expectedParticipants = el}
          >
            <label>Expected Number of Participants <span className="req">*</span></label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-users"></i>
              <input 
              type="number"
              min="1"
              step="1"
              max={selectedFacilityCapacity.max ?? undefined}
              value={formData.expectedParticipants}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || (/^\d+$/.test(value) && Number(value) > 0)) {
                  handleInputChange('expectedParticipants', value);
                }
              }}
              placeholder="e.g. 150"
              className={missingFields.expectedParticipants || participantCountOutOfRange ? 'input-error' : ''}
            />
            </div>
          </div>

          {/* Row 2 Left: Event Type & Taken Schedules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div 
              className={`input-group ${missingFields.eventType ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.eventType = el}
            >
              <label>Event Type <span className="req">*</span></label>
              <div className="event-type-grid">
                {['Academic', 'Cultural', 'Sports', 'Seminar', 'Training', 'Other'].map(type => (
                  <label
                    key={type}
                    className={`checkbox-option ${formData.eventType.length > 0 && !formData.eventType.includes(type) ? 'is-disabled' : ''}`}
                  >
                    <input 
                      type="checkbox" 
                      checked={formData.eventType.includes(type)} 
                      onChange={() => handleCheckboxArrayChange('eventType', type)} 
                      disabled={formData.eventType.length > 0 && !formData.eventType.includes(type)}
                    /> 
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Taken Schedules (Reference)</label>
              <select
                value={selectedScheduleId}
                onChange={(event) => setSelectedScheduleId(event.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="" disabled>View pending & approved schedules...</option>
                {reservationsData
                  .filter(res => {
                    const statusLower = (res.status || '').toLowerCase().trim();
                    const hasRejectedApproval = res.approvals && Object.values(res.approvals).some(
                      a => (typeof a === 'string' && a.toLowerCase() === 'rejected') || (a && typeof a.status === 'string' && a.status.toLowerCase() === 'rejected')
                    );
                    return (statusLower === 'pending' || statusLower === 'approved') && !hasRejectedApproval;
                  })
                  .map(res => (
                    <option key={res.id} value={res.id}>
                      {res.eventName || 'Untitled Event'} | {res.eventDate} {res.endDate && res.endDate !== res.eventDate ? `to ${res.endDate}` : ''} | {res.startTime} - {res.endTime}
                      {' | '}{(res.facilities || [])
                        .map(facilityId => inventoryFacilities.find(facility => facility.id === facilityId)?.name || facilityId)
                        .join(', ') || 'No facility'}
                      {' | '}{res.status || 'Pending'}
                    </option>
                  ))
                }
              </select>
            </div>
          </div>

          {/* Row 2 Right Column: Start Date & End Date Stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Start Date (Formerly Event Date) */}
            <div 
              className={`input-group ${missingFields.eventDate ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.eventDate = el}
            >
              <label>Start Date <span className="req">*</span></label>
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
                    className={(dateError || missingFields.eventDate) ? 'input-error' : ''}
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

            {/* End Date (Formerly Number of Days) */}
            <div 
              className={`input-group ${missingFields.endDateInput ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.endDateInput = el}
            >
              <label>End Date <span className="req">*</span></label>
              <div className="calendar-field">
                <div className="input-with-icon left-icon">
                  <i className="ph ph-calendar-blank calendar-trigger" onClick={() => setShowDaysCalendar(!showDaysCalendar)}></i>
                  <input 
                    type="text" 
                    value={endDateInput} 
                    onChange={handleDaysDateChange} 
                    maxLength={10}
                    placeholder="MM/DD/YYYY" 
                    onClick={() => setShowDaysCalendar(true)} 
                    className={(daysDateError || invalidDateRange || missingFields.endDateInput) ? 'input-error' : ''}
                  />
                </div>
                {(daysDateError || invalidDateRange) && (
                  <span className="field-error">
                    {daysDateError || 'End date must be on or after start date'}
                  </span>
                )}
                
                {showDaysCalendar && (
                  <>
                    <div className="calendar-overlay" onClick={() => setShowDaysCalendar(false)}></div>
                    <div className="custom-calendar-popup">
                      <div className="calendar-header">
                        <button type="button" onClick={handleDaysPrevMonth}><i className="ph ph-caret-left"></i></button>
                        <span>{daysCalendarView.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                        <button type="button" onClick={handleDaysNextMonth}><i className="ph ph-caret-right"></i></button>
                      </div>
                      <div className="calendar-grid">
                        <div className="calendar-day-name">Su</div>
                        <div className="calendar-day-name">Mo</div>
                        <div className="calendar-day-name">Tu</div>
                        <div className="calendar-day-name">We</div>
                        <div className="calendar-day-name">Th</div>
                        <div className="calendar-day-name">Fr</div>
                        <div className="calendar-day-name">Sa</div>
                        {renderDaysCalendarDays()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Row 3 Right Column: Start Time & End Time Stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div 
              className={`input-group ${missingFields.startTime ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.startTime = el}
            >
              <label>Start Time <span className="req">*</span></label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  if (e.target.value) clearMissingField('startTime');
                }}
                className={missingFields.startTime ? 'input-error' : ''}
              />
            </div>
            <div 
              className={`input-group ${missingFields.endTime ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.endTime = el}
            >
              <label>End Time <span className="req">*</span></label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  if (e.target.value) clearMissingField('endTime');
                }}
                className={missingFields.endTime ? 'input-error' : ''}
              />
            </div>
          </div>

          {liveConflict && (
            <div className="schedule-conflict-notice full-width" role="alert" aria-live="assertive">
              <strong>
                {liveConflict.conflictType === 'capacity'
                  ? 'Facility capacity exceeded — this reservation cannot be submitted.'
                  : 'Schedule conflict — this reservation cannot be submitted.'}
              </strong>
              <span><strong>Conflicting facility:</strong> {liveConflict.conflictFacilityName}.</span>
              <span>
                {liveConflict.eventName || 'Another reservation'} is scheduled from{' '}
                {liveConflict.eventDate || 'an overlapping date'}
                {liveConflictEndDate && liveConflictEndDate !== liveConflict.eventDate
                  ? ` to ${liveConflictEndDate}` : ''} at{' '}
                {liveConflict.startTime}–{liveConflict.endTime}.
              </span>
              {liveConflict.conflictType === 'capacity' && (
                <span>
                  {liveConflict.occupiedCapacity} of {liveConflict.maxCapacity} participants are already
                  {' '}reserved during this time. Adding {liveConflict.requestedCapacity} would exceed
                  {' '}the facility maximum by{' '}
                  {liveConflict.occupiedCapacity + liveConflict.requestedCapacity - liveConflict.maxCapacity}.
                </span>
              )}
              {liveConflict.conflictType === 'unknown-capacity' && (
                <span>
                  The existing reservation does not have a valid participant count, so the facility’s
                  {' '}remaining capacity cannot be verified.
                </span>
              )}
            </div>
          )}

          {/* Full Width: Purpose / Description */}
          <div 
            className={`input-group full-width ${missingFields.purpose ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.purpose = el}
          >
            <label>Purpose / Description <span className="req">*</span></label>
            <textarea 
              value={formData.purpose} 
              onChange={(e) => handleInputChange('purpose', e.target.value)} 
              placeholder="Others/Briefly describe the purpose and objectives of your event..."
              className={missingFields.purpose ? 'input-error' : ''}
            ></textarea>
          </div>
        </div>

        <div className="info-box green duration-box">
          <i className="ph ph-info"></i>
          <div>
            <strong>Total Duration: {durationHours > 0 ? durationHours : 0} hours / day — Across {days} day(s) {eventDate && days > 1 ? `(Ends: ${endDateInput || calculateEndDate(eventDate, days)})` : ''}</strong>
          </div>
        </div>
      </div>

      {/* Air Conditioning Schedule */}
      <div className="form-card">
        <div className="section-header">
          Air Condition
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
              <div 
                className={`input-group ${missingFields.airconOnTime ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.airconOnTime = el}
              >
                <label>Aircon ON Time {aircon && <span className="req">*</span>}</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input 
                    type="text" 
                    value={formData.airconOnTime} 
                    onChange={(e) => handleTimeInput(e, null, 'airconOnTime', true)}
                    onBlur={(e) => handleTimeBlur(e, null, 'airconOnTime')}
                    placeholder="08:00 AM" 
                    disabled={!aircon} 
                    className={`${!aircon ? 'input-disabled' : ''} ${missingFields.airconOnTime ? 'input-error' : ''}`.trim()} 
                  />
                </div>
              </div>
              
              <i className="ph ph-arrow-right arrow"></i>
              
              <div 
                className={`input-group ${missingFields.airconOffTime ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.airconOffTime = el}
              >
                <label>Aircon OFF Time {aircon && <span className="req">*</span>}</label>
                <div className="input-with-icon left-icon">
                  <i className="ph ph-clock"></i>
                  <input 
                    type="text" 
                    value={formData.airconOffTime} 
                    onChange={(e) => handleTimeInput(e, null, 'airconOffTime', true)}
                    onBlur={(e) => handleTimeBlur(e, null, 'airconOffTime')}
                    placeholder="05:00 PM" 
                    disabled={!aircon} 
                    className={`${!aircon ? 'input-disabled' : ''} ${missingFields.airconOffTime ? 'input-error' : ''}`.trim()} 
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
        <button className="btn-outline" onClick={() => handleDiscard()}>
          <i className="ph ph-trash"></i> Discard Form
        </button>
        <div className="right-actions">
          <button className="btn-outline" onClick={handleSaveDraft}>
            <i className="ph ph-floppy-disk"></i> {isDraftSaved ? '✓ Draft Saved' : 'Save Draft'}
          </button>
          <button 
            className="btn-primary" 
            onClick={handleSubmit} 
            disabled={!certified || isSubmitting || !!liveConflict}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Reservation'}
          </button>
        </div>
      </div>

      {/* Custom React Modal for General Alerts */}
      {customAlert && (
        <div className={`modal-overlay ${customAlert.isSuccess ? 'reservation-success-overlay' : ''}`}>
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
              {conflictEvent?.conflictType === 'capacity'
                ? <>
                    <strong>{conflictEvent.facilityName}</strong> has a capacity conflict with{' '}
                    <strong>{conflictEvent.eventName}</strong> ({conflictEvent.date}, {conflictEvent.time}).
                  </>
                : <>
                    The conflict is with <strong>{conflictEvent?.facilityName || 'the selected facility'}</strong>,
                    {' '}which is already reserved during the selected multi-day time window
                    {conflictEvent && (
                      <> by <strong>{conflictEvent.eventName}</strong> ({conflictEvent.date}, {conflictEvent.time})</>
                    )}.
                  </>}
              {conflictEvent?.conflictType === 'capacity' && (
                <>. {conflictEvent.occupiedCapacity} of {conflictEvent.maxCapacity} participants are already reserved, and adding {conflictEvent.requestedCapacity} would exceed the maximum.</>
              )}
              {' '}Please adjust your dates, <strong>Start/End Time</strong>, or select a different facility.
            </p>
            <div className="modal-actions">
              <button onClick={() => { setShowOverlapWarning(false); setConflictEvent(null); }} className="modal-button">
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSchedule && (
        <div className="modal-overlay schedule-details-overlay" onClick={() => setSelectedScheduleId('')}>
          <div
            className="schedule-details-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedSchedule.eventName || 'Reservation'} details`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="schedule-details-close"
              onClick={() => setSelectedScheduleId('')}
              aria-label="Close reservation details"
            >
              ×
            </button>
            <ReservationDetails data={selectedSchedule} />
          </div>
        </div>
      )}

    </div>
  );
};

export default Reservation;