import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  arrayUnion,
  deleteField,
  getDocs, 
  query, 
  where, 
  writeBatch, 
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '../Firebase';
import { sendReservationEmail } from '../services/emailService'; 
import { isReservationActive } from '../services/reservationStatus';
import { isReservationEndReached } from '../services/reservationExpiration';
import {
  findFacilityConflict,
  getParticipantsForFacility,
  getActiveFacilityReservations,
  parseDateOrdinal
} from '../services/reservationConflicts';
import {
  getAvailableDatesInRange,
  findUnavailableDateInRange,
  getUnavailableDatesInRange
} from '../services/unavailableDates';
import {
  DEFAULT_ACCOUNT_TYPES,
  DEFAULT_COURSE_OPTIONS,
  DEFAULT_DEPARTMENT_OPTIONS,
  filterSignupTextValue,
  normalizeAccountTypes,
  normalizeSignupDropdowns
} from '../services/signupOptions';
import ReservationDetails from './ReservationDetails';
import { sanitizeEventName } from '../services/eventName';
import '../styles/Reservation.scss';

const initialFormState = {
  fullName: '', 
  requestorTypes: [],
  requestorAttributes: {},
  studentNumber: '',
  department: '',
  contactNumber: '09',
  emailAddress: '', 
  eventName: '', 
  expectedParticipants: '', 
  eventType: [], 
  purpose: '',
  facilities: [], 
  specificRoom: '', 
  specificRoomParticipants: '',
  otherEquipment: '',
  otherUtility: '',
  airconOnTime: '', 
  airconOffTime: '',
  endorserName: '', 
  endorserDesignation: '', 
  endorserAccountType: '',
  endorserAttributes: {},
  endorserEmail: ''
};

const parseOptionalCapacity = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
};

const normalizeUtilityUnits = (units, selectedUtilities = []) => {
  if (units && typeof units === 'object' && !Array.isArray(units)) {
    return Object.fromEntries(
      Object.entries(units)
        .filter(([, quantity]) => Number.isSafeInteger(Number(quantity)) && Number(quantity) > 0)
        .map(([id, quantity]) => [id, Number(quantity)])
    );
  }
  return Object.fromEntries(selectedUtilities.map((id) => [id, 1]));
};

const getEndorserNameWithoutFacultySuffix = (name) => (
  sanitizeAlphabeticName(name.replace(/\s*\(Faculty\)\s*/gi, ' ').trim())
);

const sanitizeAlphabeticName = (value) => value.replace(/[^A-Za-z ]/g, '');

const normalizeContactNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('09')) return digits.slice(0, 11);
  if (digits.startsWith('639')) return `0${digits.slice(2, 12)}`;
  if (digits.startsWith('9')) return `0${digits.slice(0, 10)}`;
  return `09${digits.slice(-9)}`;
};

const canSkipReservationLeadTime = (role) => {
  const normalizedRole = (role || '').toLowerCase().trim().replace(/_/g, ' ');
  return ['mis', 'mis admin', 'building admin', 'super admin'].includes(normalizedRole);
};

const getReservationDateMinimum = (role, skipLeadTime = false) => {
  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);
  if (!skipLeadTime && !canSkipReservationLeadTime(role)) minDate.setDate(minDate.getDate() + 3);
  return minDate;
};

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

const getFacilityParticipantFieldKey = (facilityId) => `participants-${facilityId}`;

const normalizeLocationMatchValue = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const matchesSpecificRoom = (requestedRoom, reservedRoom) => {
  const requested = normalizeLocationMatchValue(requestedRoom);
  const reserved = normalizeLocationMatchValue(reservedRoom);
  if (!requested || !reserved) return false;
  if (requested === reserved) return true;

  const requestedRoomNumbers = String(requestedRoom || '').match(/\d{3}/g) || [];
  const reservedRoomNumbers = String(reservedRoom || '').match(/\d{3}/g) || [];
  if (requestedRoomNumbers.some((number) => reservedRoomNumbers.includes(number))) return true;

  return Math.min(requested.length, reserved.length) >= 3
    && (requested.includes(reserved) || reserved.includes(requested));
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

const isWithinReservationHours = (time) => {
  const minutes = parseTimeToMinutes(time);
  return minutes !== null && minutes >= 7 * 60 && minutes <= 22 * 60;
};

const getReservationTimeValue = (hour, minute, period) => {
  const hour24 = (hour % 12) + (period === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

const ReservationTimePicker = ({ value, onChange, label, invalid = false, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);
  const totalMinutes = parseTimeToMinutes(value);
  const selectedMinutes = totalMinutes ?? 7 * 60;
  const selectedHour24 = Math.floor(selectedMinutes / 60);
  const selectedHour = selectedHour24 % 12 || 12;
  const selectedMinute = selectedMinutes % 60;
  const selectedPeriod = selectedHour24 >= 12 ? 'PM' : 'AM';
  const displayedTime = totalMinutes === null ? 'Select time' : formatTimeForStorage(value);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!pickerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const updateTime = (hour, minute, period) => {
    const nextTime = getReservationTimeValue(hour, minute, period);
    if (isWithinReservationHours(nextTime)) onChange(nextTime);
  };

  return (
    <div
      className="reservation-time-picker"
      ref={pickerRef}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        type="button"
        className={`reservation-time-trigger ${invalid ? 'input-error' : ''}`}
        aria-label={`${label}: ${displayedTime}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <i className="ph ph-clock" aria-hidden="true"></i>
        <span className={totalMinutes === null ? 'is-placeholder' : ''}>{displayedTime}</span>
        <i className={`ph ph-caret-down reservation-time-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true"></i>
      </button>
      {isOpen && (
        <div className="reservation-time-popover" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <div className="reservation-time-popover-header">
            <strong>Choose a time</strong>
            <span>7:00 AM–10:00 PM</span>
          </div>
          <div className="reservation-time-selects">
            <label>
              <span>Hour</span>
              <select
                value={selectedHour}
                aria-label={`${label} hour`}
                onChange={(event) => updateTime(Number(event.target.value), selectedMinute, selectedPeriod)}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                  <option
                    key={hour}
                    value={hour}
                    disabled={!isWithinReservationHours(getReservationTimeValue(hour, selectedMinute, selectedPeriod))}
                  >
                    {String(hour).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Minute</span>
              <select
                value={selectedMinute}
                aria-label={`${label} minute`}
                onChange={(event) => updateTime(selectedHour, Number(event.target.value), selectedPeriod)}
              >
                {Array.from({ length: 60 }, (_, minute) => minute).map((minute) => {
                  const nextTime = getReservationTimeValue(selectedHour, minute, selectedPeriod);
                  return (
                    <option key={minute} value={minute} disabled={!isWithinReservationHours(nextTime)}>
                      {String(minute).padStart(2, '0')}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>Period</span>
              <select
                value={selectedPeriod}
                aria-label={`${label} AM or PM`}
                onChange={(event) => updateTime(selectedHour, selectedMinute, event.target.value)}
              >
                {['AM', 'PM'].map((period) => {
                  const nextTime = getReservationTimeValue(selectedHour, selectedMinute, period);
                  return (
                    <option key={period} value={period} disabled={!isWithinReservationHours(nextTime)}>
                      {period}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="reservation-time-quick-select"
            onClick={() => {
              updateTime(7, 0, 'AM');
              setIsOpen(false);
            }}
          >
            Use 7:00 AM
          </button>
        </div>
      )}
    </div>
  );
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

const getSignupConfiguration = (data = {}) => {
  const courses = Array.isArray(data.courses) ? data.courses : DEFAULT_COURSE_OPTIONS;
  const departments = Array.isArray(data.departments) ? data.departments : DEFAULT_DEPARTMENT_OPTIONS;
  const accountTypes = normalizeAccountTypes(
    Array.isArray(data.accountTypes) ? data.accountTypes : DEFAULT_ACCOUNT_TYPES,
    courses,
    departments
  );
  return {
    accountTypes,
    dropdownTypes: normalizeSignupDropdowns(data.dropdownTypes, accountTypes)
  };
};

const getRequestorAttributes = (userData, accountType) => {
  const storedAttributes = userData.customAttributes || {};
  const legacyCustomFields = Array.isArray(userData.customFields) ? userData.customFields : [];
  const attributes = {};

  if (accountType?.dropdown) {
    const key = `dropdown:${accountType.dropdown}`;
    attributes[key] = storedAttributes[key]
      ?? (userData.signupDropdown?.id === accountType.dropdown
        ? userData.signupDropdown.value
        : accountType.dropdown === 'courses'
          ? userData.course || ''
          : accountType.dropdown === 'departments'
            ? userData.department || ''
            : '');
  }

  (accountType?.customFields || []).forEach((field) => {
    const key = `field:${field.id}`;
    const legacyField = legacyCustomFields.find((item) => item.id === field.id);
    attributes[key] = storedAttributes[key] ?? legacyField?.value ?? '';
  });

  return attributes;
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

const getScheduleDates = (startDate, endDate) => {
  const startOrdinal = parseDateOrdinal(startDate);
  const endOrdinal = parseDateOrdinal(endDate);
  if (startOrdinal === null || endOrdinal === null || endOrdinal < startOrdinal) return [];

  return Array.from({ length: endOrdinal - startOrdinal + 1 }, (_, index) => (
    new Date((startOrdinal + index) * 86400000).toISOString().slice(0, 10)
  ));
};

const getUnavailableDateMessage = (unavailableDate) => {
  const date = unavailableDate.date || unavailableDate.id;
  return `This reservation includes unavailable date ${date}${unavailableDate.remark ? `: ${unavailableDate.remark}` : '.'}`;
};

const formatScheduleDate = (date) => {
  const dateOrdinal = parseDateOrdinal(date);
  if (dateOrdinal === null) return date;
  return new Date(dateOrdinal * 86400000).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const Reservation = ({ currentUserRole }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editReservationId = searchParams.get('edit');
  const isAdminEditMode = searchParams.get('adminEdit') === 'true';
  // --- AUTH & USER STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(currentUserRole || 'requestor');
  const [signupConfiguration, setSignupConfiguration] = useState(() => getSignupConfiguration());
  const [isLoadingEdit, setIsLoadingEdit] = useState(Boolean(editReservationId));

  // --- FORM STATES ---
  const [formData, setFormData] = useState(initialFormState);
  const [days, setDays] = useState(0); // Default to 0 days
  const [endDateInput, setEndDateInput] = useState('');
  const [aircon, setAircon] = useState(false); // Default to off
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [dailyScheduleOverrides, setDailyScheduleOverrides] = useState({});
  const [removedScheduleDates, setRemovedScheduleDates] = useState([]);
  const [isDailyScheduleExpanded, setIsDailyScheduleExpanded] = useState(false);
  const [durationHours, setDurationHours] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resubmissionRemark, setResubmissionRemark] = useState('');
  
  // DYNAMIC SELECTION CARTS
  const [selectedEquip, setSelectedEquip] = useState({});
  const [selectedUtilities, setSelectedUtilities] = useState([]);
  const [selectedUtilityUnits, setSelectedUtilityUnits] = useState({});
  const [facilityParticipants, setFacilityParticipants] = useState({});

  const [certified, setCertified] = useState(false);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  
  // --- MODAL STATES ---
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [conflictEvent, setConflictEvent] = useState(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [customAlert, setCustomAlert] = useState(null); 

  // --- UI & VALIDATION STATES ---
  const [inventoryEquipments, setInventoryEquipments] = useState([]);
  const [inventoryUtilities, setInventoryUtilities] = useState([]);
  const [inventoryFacilities, setInventoryFacilities] = useState([]);
  const [reservationsData, setReservationsData] = useState([]);
  const [reservationsLoaded, setReservationsLoaded] = useState(false);
  const [unavailableDates, setUnavailableDates] = useState([]);
  const [unavailableDatesLoaded, setUnavailableDatesLoaded] = useState(false);
  const [unavailableDatesError, setUnavailableDatesError] = useState('');
  const [editingReservation, setEditingReservation] = useState(null);
  const [dateError, setDateError] = useState('');
  const [daysDateError, setDaysDateError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarView, setCalendarView] = useState(new Date());
  const [showDaysCalendar, setShowDaysCalendar] = useState(false);
  const [daysCalendarView, setDaysCalendarView] = useState(new Date());
  const [missingFields, setMissingFields] = useState({});
  const fieldRefs = useRef({});

  useEffect(() => {
    if (!editReservationId) return;

    document.querySelector('.page-content')?.scrollTo(0, 0);
  }, [editReservationId, editingReservation]);

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
          const userCollection = currentUserRole === 'super admin' ? 'super_users' : 'users';
          const userRef = doc(db, userCollection, user.uid);
          const [userSnap, signupOptionsSnap] = await Promise.all([
            getDoc(userRef),
            getDoc(doc(db, 'app_settings', 'signupOptions'))
          ]);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const nextSignupConfiguration = getSignupConfiguration(signupOptionsSnap.data() || {});
            setSignupConfiguration(nextSignupConfiguration);
            const normalizedRole = (currentUserRole || userData.role || 'requestor').toLowerCase().trim().replace(/_/g, ' ');
            setUserRole(normalizedRole);
            const accountType = userData.accountType || '';
            const configuredAccountType = nextSignupConfiguration.accountTypes.find(
              (type) => type.value === accountType
            );
            const requestorAttributes = getRequestorAttributes(userData, configuredAccountType);
            
            const profileName = [
              userData.firstName,
              userData.middleInitial ? `${userData.middleInitial}.` : '',
              userData.lastName
            ].filter(Boolean).join(' ')
              || userData.name
              || user.displayName
              || (normalizedRole === 'super admin' ? 'Super Admin' : '');
            const cleanName = formatName(profileName);

            setFormData(prev => ({
              ...prev,
              fullName: prev.fullName || cleanName,
              requestorTypes: accountType ? [accountType] : prev.requestorTypes,
              requestorAttributes: {
                ...requestorAttributes,
                ...prev.requestorAttributes
              },
              studentNumber: userData.studentNumber || prev.studentNumber,
              department: userData.department || prev.department,
              contactNumber: prev.contactNumber !== '09'
                ? prev.contactNumber
                : normalizeContactNumber(userData.phone),
              emailAddress: normalizedRole === 'super admin'
                ? 'null@gmail.com'
                : prev.emailAddress || userData.email || user.email || '',
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
  }, [currentUserRole]);

  useEffect(() => {
    if (!editReservationId) {
      setIsLoadingEdit(false);
      setEditingReservation(null);
      return;
    }
    if (!currentUser) return;

    let isActive = true;

    const loadReservationForEdit = async () => {
      try {
        const reservationSnap = await getDoc(doc(db, 'reservations', editReservationId));
        if (!reservationSnap.exists()) {
          throw new Error('The reservation could not be found.');
        }

        const reservation = { id: reservationSnap.id, ...reservationSnap.data() };
        const reservationStatus = (reservation.status || '').toLowerCase().trim();
        const isOwner = reservation.userId === currentUser.uid
          || reservation.userEmail === currentUser.email;
        const userCollection = currentUserRole === 'super admin' ? 'super_users' : 'users';
        const [userSnap, signupOptionsSnap] = await Promise.all([
          getDoc(doc(db, userCollection, currentUser.uid)),
          getDoc(doc(db, 'app_settings', 'signupOptions'))
        ]);
        const userData = userSnap.data() || {};
        const nextSignupConfiguration = getSignupConfiguration(signupOptionsSnap.data() || {});
        setSignupConfiguration(nextSignupConfiguration);
        const configuredAccountType = nextSignupConfiguration.accountTypes.find(
          (type) => type.value === userData.accountType
        );
        const currentRole = (userData.role || '').toLowerCase().trim().replace(/_/g, ' ');
        const canEditApprovedReservation = canSkipReservationLeadTime(currentRole)
          && reservationStatus === 'approved'
          && !isReservationEndReached(reservation);
        if (
          (isAdminEditMode && !canEditApprovedReservation)
          || (!isAdminEditMode && (!isOwner || reservationStatus !== 'to modify'))
        ) {
          throw new Error('This reservation is not available for modification.');
        }

        if (!isActive) return;

        const startDate = reservation.eventDate || reservation.date || '';
        const endDate = reservation.endDate
          || calculateEndDate(startDate, reservation.days || 1);
        const normalizedSchedule = Array.isArray(reservation.schedule)
          ? reservation.schedule.flatMap((entry) => {
            const dateOrdinal = parseDateOrdinal(entry.date);
            return dateOrdinal === null ? [] : [{
              date: new Date(dateOrdinal * 86400000).toISOString().slice(0, 10),
              startTime: formatTimeForPicker(entry.startTime || ''),
              endTime: formatTimeForPicker(entry.endTime || '')
            }];
          })
          : null;
        setEditingReservation(reservation);
        setFormData({
          fullName: reservation.fullName || '',
          requestorTypes: userData.accountType
            ? [userData.accountType]
            : Array.isArray(reservation.requestorTypes)
              ? reservation.requestorTypes.slice(0, 1)
              : [],
          requestorAttributes: {
            ...getRequestorAttributes(userData, configuredAccountType),
            ...(reservation.requestorAttributes || {})
          },
          studentNumber: reservation.studentNumber || userData.studentNumber || '',
          department: reservation.department || userData.department || '',
          contactNumber: normalizeContactNumber(reservation.contactNumber),
          emailAddress: reservation.emailAddress || '',
          eventName: sanitizeEventName(reservation.eventName).slice(0, 40),
          expectedParticipants: String(reservation.expectedParticipants || ''),
          eventType: Array.isArray(reservation.eventType)
            ? reservation.eventType.slice(0, 1)
            : reservation.eventType ? [reservation.eventType] : [],
          purpose: (reservation.purpose || '').slice(0, 600),
          facilities: reservation.facilities || [],
          specificRoom: reservation.specificRoom || '',
          specificRoomParticipants: reservation.specificRoomParticipants
            ?? ((reservation.facilities || []).length === 0 ? String(reservation.expectedParticipants || '') : ''),
          otherEquipment: reservation.otherEquipment || '',
          otherUtility: reservation.otherUtility || '',
          airconOnTime: reservation.airconOnTime || '',
          airconOffTime: reservation.airconOffTime || '',
          endorserName: sanitizeAlphabeticName(reservation.endorserName || ''),
          endorserDesignation: reservation.endorserDesignation || '',
          endorserAccountType: reservation.endorserAccountType || '',
          endorserAttributes: reservation.endorserAttributes || {},
          endorserEmail: reservation.endorserEmail || ''
        });
        setFacilityParticipants(
          reservation.facilityParticipants
          && typeof reservation.facilityParticipants === 'object'
          ? Object.fromEntries(
            (reservation.facilities || []).map((facilityId) => [
              facilityId,
              String(reservation.facilityParticipants[facilityId] ?? reservation.expectedParticipants ?? '')
            ])
          )
          : Object.fromEntries(
            (reservation.facilities || []).map((facilityId) => [
              facilityId,
              String(reservation.expectedParticipants || '')
            ])
          )
        );
        setEventDate(startDate);
        setEndDateInput(endDate);
        setStartTime(formatTimeForPicker(reservation.startTime || ''));
        setEndTime(formatTimeForPicker(reservation.endTime || ''));
        setDays(Number(reservation.days) || 1);
        setDailyScheduleOverrides(normalizedSchedule
          ? Object.fromEntries(normalizedSchedule.map(({ date, startTime: dayStartTime, endTime: dayEndTime }) => [
            date,
            { startTime: dayStartTime, endTime: dayEndTime }
          ]))
          : {});
        setRemovedScheduleDates(normalizedSchedule
          ? getScheduleDates(startDate, endDate).filter(
            (date) => !normalizedSchedule.some((entry) => entry.date === date)
          )
          : []);
        setAircon(Boolean(reservation.aircon));
        setSelectedEquip(reservation.selectedEquip || {});
        setSelectedUtilities(Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : []);
        setSelectedUtilityUnits(normalizeUtilityUnits(
          reservation.selectedUtilityUnits,
          Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : []
        ));
      } catch (error) {
        console.error('Failed to load reservation for modification:', error);
        if (isActive) {
          setCustomAlert({
            title: 'Unable to Edit Reservation',
            message: error.message || 'The reservation could not be loaded.',
            isSuccess: false
          });
        }
      } finally {
        if (isActive) setIsLoadingEdit(false);
      }
    };

    loadReservationForEdit();
    return () => {
      isActive = false;
    };
  }, [currentUser, currentUserRole, editReservationId, isAdminEditMode]);

  // --- LOAD DRAFT ON MOUNT ---
  useEffect(() => {
    if (editReservationId) return;
    const draft = localStorage.getItem('reservationDraft');
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.formData) {
          setFormData(prev => ({
            ...prev,
            ...parsed.formData,
            requestorTypes: Array.isArray(parsed.formData.requestorTypes) && parsed.formData.requestorTypes.length > 0
              ? parsed.formData.requestorTypes.slice(0, 1)
              : prev.requestorTypes,
            studentNumber: parsed.formData.studentNumber || prev.studentNumber,
            department: parsed.formData.department || prev.department,
            eventName: sanitizeEventName(parsed.formData.eventName).slice(0, 40),
            purpose: (parsed.formData.purpose || '').slice(0, 600),
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
        if (parsed.dailyScheduleOverrides && typeof parsed.dailyScheduleOverrides === 'object') {
          setDailyScheduleOverrides(parsed.dailyScheduleOverrides);
        } else if (Array.isArray(parsed.dailySchedule)) {
          setDailyScheduleOverrides(Object.fromEntries(parsed.dailySchedule.map((entry) => [
            entry.date,
            {
              startTime: formatTimeForPicker(entry.startTime || ''),
              endTime: formatTimeForPicker(entry.endTime || '')
            }
          ])));
        }
        if (Array.isArray(parsed.removedScheduleDates)) setRemovedScheduleDates(parsed.removedScheduleDates);
        if (parsed.selectedEquip) setSelectedEquip(parsed.selectedEquip);
        if (Array.isArray(parsed.selectedUtilities)) setSelectedUtilities(parsed.selectedUtilities);
        setFacilityParticipants(
          parsed.facilityParticipants && typeof parsed.facilityParticipants === 'object'
            ? parsed.facilityParticipants
            : Object.fromEntries(
              (parsed.formData?.facilities || []).map((facilityId) => [
                facilityId,
                String(parsed.formData?.expectedParticipants || '')
              ])
            )
        );
        setSelectedUtilityUnits(normalizeUtilityUnits(
          parsed.selectedUtilityUnits,
          Array.isArray(parsed.selectedUtilities) ? parsed.selectedUtilities : []
        ));
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
  }, [editReservationId]);

  // Reset Draft toggle when form changes
  useEffect(() => {
    if (isDraftSaved) setIsDraftSaved(false);
  }, [formData, days, endDateInput, aircon, eventDate, startTime, endTime, dailyScheduleOverrides, removedScheduleDates, selectedEquip, selectedUtilities, selectedUtilityUnits, facilityParticipants]);

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

    const unsubUtilities = onSnapshot(collection(db, 'utilities'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInventoryUtilities(list);
    }, (error) => console.error('Failed to load utilities:', error));

    const unsubFacilities = onSnapshot(collection(db, 'facilities'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInventoryFacilities(list);
    }, (error) => console.error('Failed to load facilities:', error));

    const unsubReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReservationsData(list);
      setReservationsLoaded(true);
    }, (error) => console.error('Failed to load reservations:', error));

    const unsubUnavailableDates = onSnapshot(collection(db, 'unavailableDates'), (snapshot) => {
      setUnavailableDates(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUnavailableDatesLoaded(true);
      setUnavailableDatesError('');
    }, (error) => {
      console.error('Failed to load unavailable dates:', error);
      setUnavailableDatesLoaded(false);
      setUnavailableDatesError('Calendar availability could not be loaded. Please try again later.');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const endorsers = users
        .filter(user => (user.role || user.personal_information?.role || '').toLowerCase() === 'endorser')
        .map(user => {
          const personalInformation = user.personal_information || {};
          const profileName = [
            user.firstName || personalInformation.first_name,
            user.middleInitial || personalInformation.middle_initial
              ? `${user.middleInitial || personalInformation.middle_initial}.`
              : '',
            user.lastName || personalInformation.last_name
          ]
            .filter(Boolean)
            .join(' ') || user.name;

          return {
            ...user,
            accountType: user.accountType || personalInformation.account_type || '',
            cleanName: formatName(profileName),
            department: user.department || personalInformation.department || '',
            email: user.email || personalInformation.email_address || ''
          };
        });
      setEndorsersList(endorsers);
    }, (error) => console.error('Failed to load users:', error));

    return () => {
      unsubEquipments();
      unsubUtilities();
      unsubFacilities();
      unsubReservations();
      unsubUnavailableDates();
      unsubUsers();
    };
  }, [currentUser]);

  // --- DYNAMICALLY CALCULATE AVAILABLE COUNTS ---
  const mappedEquipmentList = inventoryEquipments.map(item => {
    let reservedCount = 0;
    reservationsData.forEach(res => {
      if (res.id !== editReservationId && isReservationActive(res) && res.selectedEquip?.[item.id]) {
        reservedCount += Number(res.selectedEquip[item.id]);
      }
    });

    const total = Number(item.totalCount) || 0;
    const availableCount = item.status === 'Unavailable' ? 0 : Math.max(0, total - reservedCount);
    const effectiveStatus = availableCount === 0 ? 'Unavailable' : item.status;
    return { ...item, status: effectiveStatus, computedReserved: reservedCount, computedAvailable: availableCount };
  });
  const hasFacility = formData.facilities.length > 0 || Boolean(formData.specificRoom.trim());
  const selectedFacilityParticipants = Object.fromEntries(
    formData.facilities.map((facilityId) => [facilityId, Number(facilityParticipants[facilityId])])
  );
  const totalFacilityParticipants = formData.facilities.reduce(
    (total, facilityId) => total + (Number(facilityParticipants[facilityId]) || 0),
    0
  );
  const expectedParticipantCount = formData.facilities.length > 0
    ? totalFacilityParticipants
    : Number(formData.specificRoom.trim()
      ? formData.specificRoomParticipants || 0
      : formData.expectedParticipants || 0);
  const unavailableDatesInRange = getUnavailableDatesInRange(
    eventDate,
    endDateInput || eventDate,
    unavailableDates
  );
  const availableDateIds = new Set(getAvailableDatesInRange(
    eventDate,
    endDateInput,
    unavailableDates
  ));
  const dailySchedule = getScheduleDates(eventDate, endDateInput)
    .filter((date) => availableDateIds.has(date))
    .filter((date) => !removedScheduleDates.includes(date))
    .map((date) => ({
      date,
      startTime: dailyScheduleOverrides[date]?.startTime ?? startTime,
      endTime: dailyScheduleOverrides[date]?.endTime ?? endTime
    }));

  const conflictRequest = {
    eventDate,
    endDate: endDateInput,
    startTime,
    endTime,
    schedule: dailySchedule.map(({ date, startTime: dayStartTime, endTime: dayEndTime }) => ({
      date,
      startTime: dayStartTime,
      endTime: dayEndTime
    })),
    facilities: formData.facilities,
    expectedParticipants: String(expectedParticipantCount || ''),
    facilityParticipants: selectedFacilityParticipants,
    excludeReservationId: editReservationId
  };
  const getFacilityRemainingCapacity = (facility) => {
    const maxCapacity = getFacilityCapacityLimits(facility).max;
    if (maxCapacity === null) return null;

    const activeReservations = getActiveFacilityReservations(
      reservationsData,
      conflictRequest,
      facility.id
    );
    const hasUnknownCapacity = activeReservations.some((reservation) => {
      const participants = getParticipantsForFacility(reservation, facility.id);
      return !Number.isInteger(participants) || participants <= 0;
    });
    if (hasUnknownCapacity) return 0;

    const occupiedCapacity = activeReservations.reduce(
      (total, reservation) => total + getParticipantsForFacility(reservation, facility.id),
      0
    );
    return Math.max(0, maxCapacity - occupiedCapacity);
  };
  const selectedFacilityCapacities = inventoryFacilities
    .filter((facility) => formData.facilities.includes(facility.id))
    .map((facility) => ({
      facility,
      limits: getFacilityCapacityLimits(facility),
      available: getFacilityRemainingCapacity(facility)
    }));
  const facilityParticipantErrors = Object.fromEntries(
    selectedFacilityCapacities.map(({ facility, limits, available }) => {
      const participants = Number(facilityParticipants[facility.id]);
      const hasParticipantValue = String(facilityParticipants[facility.id] ?? '') !== '';
      return [
        facility.id,
        hasParticipantValue
        && Number.isInteger(participants)
        && participants > 0
        && ((limits.min !== null && participants < limits.min)
          || (available !== null && participants > available))
      ];
    })
  );
  const requestStartDate = parseDateOrdinal(eventDate);
  const requestEndDate = parseDateOrdinal(endDateInput);
  const invalidDateRange = requestStartDate !== null
    && requestEndDate !== null
    && requestEndDate < requestStartDate;
  const blockedStartDate = findUnavailableDateInRange(eventDate, eventDate, unavailableDates);
  const isDailyScheduleValid = dailySchedule.length > 0 && dailySchedule.every((entry) => {
    return isWithinReservationHours(entry.startTime)
      && isWithinReservationHours(entry.endTime)
      && parseTimeToMinutes(entry.startTime) !== parseTimeToMinutes(entry.endTime);
  });
  const isStartTimeValid = isWithinReservationHours(startTime);
  const isEndTimeValid = isWithinReservationHours(endTime);
  const isAirconOnTimeValid = !aircon || isWithinReservationHours(formData.airconOnTime);
  const isAirconOffTimeValid = !aircon || isWithinReservationHours(formData.airconOffTime);
  const totalScheduledHours = Math.round(dailySchedule.reduce((total, entry) => {
    const start = parseTimeToMinutes(entry.startTime);
    const end = parseTimeToMinutes(entry.endTime);
    if (start === null || end === null || start === end) return total;
    return total + ((end <= start ? end + 1440 : end) - start) / 60;
  }, 0) * 10) / 10;
  const liveConflict = reservationsLoaded
    && !dateError
    && !daysDateError
    && !invalidDateRange
    ? findFacilityConflict(reservationsData, conflictRequest, inventoryFacilities)
    : null;
  const selectedSchedule = reservationsData.find(
    (reservation) => reservation.id === selectedScheduleId
  );
  const selectedFacilityReferences = new Set(
    formData.facilities.flatMap((facilityId) => {
      const facility = inventoryFacilities.find((item) => item.id === facilityId);
      return [facilityId, facility?.name]
        .map(normalizeLocationMatchValue)
        .filter(Boolean);
    })
  );
  const takenScheduleReservations = reservationsData.filter((reservation) => {
    const statusLower = (reservation.status || '').toLowerCase().trim();
    const hasRejectedApproval = reservation.approvals && Object.values(reservation.approvals).some(
      (approval) => (typeof approval === 'string' && approval.toLowerCase() === 'rejected')
        || (approval && typeof approval.status === 'string' && approval.status.toLowerCase() === 'rejected')
    );
    if (!['pending', 'approved'].includes(statusLower) || hasRejectedApproval) return false;

    const reservationFacilityReferences = (reservation.facilities || []).flatMap((facilityId) => {
      const facility = inventoryFacilities.find((item) => item.id === facilityId);
      return [facilityId, facility?.name]
        .map(normalizeLocationMatchValue)
        .filter(Boolean);
    });
    const sharesSelectedFacility = reservationFacilityReferences.some(
      (reference) => selectedFacilityReferences.has(reference)
    );
    const matchesRoom = matchesSpecificRoom(formData.specificRoom, reservation.specificRoom);
    return sharesSelectedFacility || matchesRoom;
  });
  const normalizedCurrentRole = userRole.replace(/_/g, ' ').trim().toLowerCase();
  const showProfileDepartment = ['room checker', 'mis', 'osa', 'building admin', 'academic head', 'school admin']
    .includes(normalizedCurrentRole);
  const selectedRequestorAccountType = signupConfiguration.accountTypes.find(
    (accountType) => accountType.value === formData.requestorTypes[0]
  );
  const selectedRequestorDropdownType = signupConfiguration.dropdownTypes.find(
    (dropdown) => dropdown.value === selectedRequestorAccountType?.dropdown
  );
  const selectedEndorser = endorsersList.find(
    (endorser) => getEndorserNameWithoutFacultySuffix(endorser.cleanName).toLowerCase()
      === formData.endorserName.trim().toLowerCase()
  );
  const selectedEndorserAccountType = signupConfiguration.accountTypes.find(
    (accountType) => accountType.value === (selectedEndorser?.accountType || formData.endorserAccountType)
  );
  const selectedEndorserAttributes = selectedEndorser
    ? {
      ...formData.endorserAttributes,
      ...getRequestorAttributes(selectedEndorser, selectedEndorserAccountType)
    }
    : formData.endorserAttributes;
  const selectedEndorserDropdownType = signupConfiguration.dropdownTypes.find(
    (dropdown) => dropdown.value === selectedEndorserAccountType?.dropdown
  );
  const selectedEndorserDropdownValue = selectedEndorserAttributes[
    `dropdown:${selectedEndorserAccountType?.dropdown}`
  ] || '';
  const selectedEndorserDropdownOption = (selectedEndorserAccountType?.options || []).find(
    (option) => option.value === selectedEndorserDropdownValue
  );
  const endorserEmail = formData.endorserEmail || selectedEndorser?.email || '';
  const isSelectedScheduleOwner = Boolean(currentUser && selectedSchedule && (
    selectedSchedule.userId === currentUser.uid
    || (
      (selectedSchedule.userEmail || selectedSchedule.emailAddress || '').trim().toLowerCase()
      && (selectedSchedule.userEmail || selectedSchedule.emailAddress || '').trim().toLowerCase()
        === (currentUser.email || '').trim().toLowerCase()
    )
  ));
  const canViewSelectedScheduleIdentity = !['requestor', 'user'].includes(normalizedCurrentRole)
    || isSelectedScheduleOwner;

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
    const inputValue = field === 'eventName' ? sanitizeEventName(value).slice(0, 40)
      : field === 'purpose' ? value.slice(0, 600)
      : field === 'endorserName' ? sanitizeAlphabeticName(value) : value;
    if (field === 'specificRoom') setSelectedScheduleId('');

    setFormData(prev => {
      const updated = { ...prev, [field]: inputValue };

      if (field === 'endorserName') {
        const matchedEndorser = endorsersList.find(
          (endorser) => getEndorserNameWithoutFacultySuffix(endorser.cleanName).toLowerCase()
            === inputValue.trim().toLowerCase()
        );
        updated.endorserDesignation = matchedEndorser?.department || '';
        updated.endorserEmail = matchedEndorser?.email || '';
        updated.endorserAccountType = matchedEndorser?.accountType || '';
        const accountType = signupConfiguration.accountTypes.find(
          (type) => type.value === matchedEndorser?.accountType
        );
        updated.endorserAttributes = matchedEndorser
          ? getRequestorAttributes(matchedEndorser, accountType)
          : {};
        if (updated.endorserEmail) clearMissingField('endorserEmail');
      }

      return updated;
    });

    if (
      inputValue
      && String(inputValue).trim() !== ''
      && (field !== 'contactNumber' || /^09\d{9}$/.test(inputValue))
    ) {
      clearMissingField(field);
    }

    if (field === 'endorserName') {
      setShowEndorserDropdown(inputValue.length > 0);
    }
  };

  const handleRequestorAttributeChange = (key, value, field) => {
    const nextValue = field?.type === 'text'
      ? filterSignupTextValue(value, field.characterTypes)
      : value;
    setFormData((previous) => ({
      ...previous,
      requestorAttributes: {
        ...previous.requestorAttributes,
        [key]: nextValue
      }
    }));
    clearMissingField(`requestorAttribute:${key}`);
  };

  const handleEndorserSelect = (endorser) => {
    setFormData(prev => ({
      ...prev,
      endorserName: getEndorserNameWithoutFacultySuffix(endorser.cleanName),
      endorserDesignation: endorser.department || '',
      endorserAccountType: endorser.accountType || '',
      endorserAttributes: getRequestorAttributes(
        endorser,
        signupConfiguration.accountTypes.find((accountType) => accountType.value === endorser.accountType)
      ),
      endorserEmail: endorser.email
    }));
    clearMissingField('endorserName');
    clearMissingField('endorserEmail');
    setShowEndorserDropdown(false);
  };

  const handleCheckboxArrayChange = (field, value) => {
    if (field === 'facilities') {
      const updatedFacilities = formData.facilities.includes(value)
        ? formData.facilities.filter((item) => item !== value)
        : [...formData.facilities, value];
      setFormData((prev) => ({ ...prev, facilities: updatedFacilities }));
      setSelectedScheduleId('');
      setFacilityParticipants((prev) => Object.fromEntries(
        Object.entries(prev).filter(([facilityId]) => updatedFacilities.includes(facilityId))
      ));
      clearMissingField(getFacilityParticipantFieldKey(value));
      clearMissingField(field);
      return;
    }

    setFormData(prev => {
      if (field === 'eventType') {
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

  const handleFacilityParticipantsChange = (facilityId, value) => {
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) <= 0)) return;
    setFacilityParticipants((prev) => ({ ...prev, [facilityId]: value }));
    if (value !== '') clearMissingField(getFacilityParticipantFieldKey(facilityId));
  };

  const updateEquip = (item, delta) => {
    if (item.status === 'Unavailable') return;
    const currentSelected = selectedEquip[item.id] || 0;
    const newSelected = currentSelected + delta;
    if (newSelected < 0 || newSelected > item.computedAvailable) return;
    setSelectedEquip(prev => ({ ...prev, [item.id]: newSelected }));
  };

  const handleEquipInputChange = (item, val) => {
    if (item.status === 'Unavailable') return;
    if (val === '') {
      setSelectedEquip(prev => ({ ...prev, [item.id]: 0 }));
      return;
    }
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) return;
    const capped = Math.min(num, item.computedAvailable);
    setSelectedEquip(prev => ({ ...prev, [item.id]: capped }));
  };

  const handleUtilityUnitsChange = (item, value) => {
    if (!hasFacility || (item.status || '').toLowerCase() === 'unavailable' || !/^\d*$/.test(value)) return;
    const quantity = value === '' ? 0 : Number(value);
    if (!Number.isSafeInteger(quantity)) return;

    setSelectedUtilityUnits(prev => {
      const updated = { ...prev };
      if (quantity > 0) updated[item.id] = quantity;
      else delete updated[item.id];
      return updated;
    });
    setSelectedUtilities(prev => (
      quantity > 0
        ? prev.includes(item.id) ? prev : [...prev, item.id]
        : prev.filter(id => id !== item.id)
    ));
  };

  const handleDateChange = (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length >= 3 && val.length <= 4) val = val.slice(0, 2) + '/' + val.slice(2);
    else if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4, 8);
    
    setEventDate(val);
    setRemovedScheduleDates([]);
    
    if (val.length > 0) {
      const isValidFormat = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(val)
        && parseDateOrdinal(val) !== null;
      if (!isValidFormat) {
        setDateError('Invalid format. Use MM/DD/YYYY');
      } else {
        const [m, d, y] = val.split('/').map(Number);
        const inputDate = new Date(y, m - 1, d);
        
        const minDate = getReservationDateMinimum(userRole, Boolean(editingReservation));
        
        if (inputDate < minDate) {
          setDateError(canSkipReservationLeadTime(userRole) || editingReservation
            ? 'Date cannot be in the past'
            : 'Must be at least 3 days from today');
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
    setRemovedScheduleDates([]);
    
    if (val.length > 0) {
      const isValidFormat = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/.test(val)
        && parseDateOrdinal(val) !== null;
      if (!isValidFormat) {
        setDaysDateError('Invalid format. Use MM/DD/YYYY');
      } else {
        const [m, d, y] = val.split('/').map(Number);
        const inputDate = new Date(y, m - 1, d);
        
        const minDate = getReservationDateMinimum(userRole, Boolean(editingReservation));
        
        if (inputDate < minDate) {
          setDaysDateError(canSkipReservationLeadTime(userRole) || editingReservation
            ? 'Date cannot be in the past'
            : 'Must be at least 3 days from today');
        } else {
          setDaysDateError('');
          clearMissingField('endDateInput');
        }
      }
    } else {
      setDaysDateError('');
    }
  };

  const handlePrevMonth = () => setCalendarView(new Date(calendarView.getFullYear(), calendarView.getMonth() - 1, 1));
  const handleNextMonth = () => setCalendarView(new Date(calendarView.getFullYear(), calendarView.getMonth() + 1, 1));
  
  const selectDate = (day) => {
    const month = String(calendarView.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const selectedDate = `${month}/${formattedDay}/${calendarView.getFullYear()}`;
    const unavailableDate = findUnavailableDateInRange(selectedDate, selectedDate, unavailableDates);
    if (!unavailableDatesLoaded) {
      setDateError('Calendar availability is still loading. Please try again.');
      return;
    }
    if (unavailableDate) return;

    setEventDate(selectedDate);
    setRemovedScheduleDates([]);
    setDateError('');
    clearMissingField('eventDate');
    setShowCalendar(false); 
  };

  const renderCalendarDays = () => {
    const year = calendarView.getFullYear();
    const month = calendarView.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); 

    const minDate = getReservationDateMinimum(userRole, Boolean(editingReservation));
    
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => (
      <div key={`blank-${i}`} className="calendar-day empty"></div>
    ));
    
    const renderDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < minDate;
      const dateString = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
      const unavailableDate = findUnavailableDateInRange(dateString, dateString, unavailableDates);
      const isDisabled = isPast || Boolean(unavailableDate) || !unavailableDatesLoaded;
      return (
        <div
          key={day} 
          className={`calendar-day ${isDisabled ? 'disabled' : ''} ${unavailableDate ? 'unavailable' : ''}`}
          title={unavailableDate ? getUnavailableDateMessage(unavailableDate) : undefined}
          aria-disabled={isDisabled}
          onClick={() => !isDisabled && selectDate(day)}
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
    const selectedDate = `${month}/${formattedDay}/${daysCalendarView.getFullYear()}`;
    const unavailableDate = findUnavailableDateInRange(selectedDate, selectedDate, unavailableDates);
    if (!unavailableDatesLoaded) {
      setDaysDateError('Calendar availability is still loading. Please try again.');
      return;
    }
    if (unavailableDate) return;

    setEndDateInput(selectedDate);
    setRemovedScheduleDates([]);
    setDaysDateError('');
    clearMissingField('endDateInput');
    setShowDaysCalendar(false);
  };

  const renderDaysCalendarDays = () => {
    const year = daysCalendarView.getFullYear();
    const month = daysCalendarView.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); 

    const minDate = getReservationDateMinimum(userRole, Boolean(editingReservation));
    
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => (
      <div key={`blank-days-${i}`} className="calendar-day empty"></div>
    ));
    
    const renderDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
      const cellDate = new Date(year, month, day);
      const isPast = cellDate < minDate;
      const dateString = `${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
      const unavailableDate = findUnavailableDateInRange(dateString, dateString, unavailableDates);
      const isDisabled = isPast || Boolean(unavailableDate) || !unavailableDatesLoaded;
      return (
        <div 
          key={day} 
          className={`calendar-day ${isDisabled ? 'disabled' : ''} ${unavailableDate ? 'unavailable' : ''}`}
          title={unavailableDate ? getUnavailableDateMessage(unavailableDate) : undefined}
          aria-disabled={isDisabled}
          onClick={() => !isDisabled && selectDaysDate(day)}
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
    const retainedRequestorTypes = formData.requestorTypes;
    const retainedRequestorAttributes = formData.requestorAttributes;
    const retainedStudentNumber = formData.studentNumber;
    const retainedDepartment = formData.department;
    
    setFormData({
        ...initialFormState,
        fullName: retainedFullName,
        emailAddress: retainedEmail,
        requestorTypes: retainedRequestorTypes,
        requestorAttributes: retainedRequestorAttributes,
        studentNumber: retainedStudentNumber,
        department: retainedDepartment
    });
    if (!preserveSchedule) {
      setDays(0);
      setEndDateInput('');
      setEventDate('');
      setStartTime('');
      setEndTime('');
      setDailyScheduleOverrides({});
      setRemovedScheduleDates([]);
    }
    setAircon(false);
    setSelectedEquip({});
    setSelectedUtilities([]);
    setSelectedUtilityUnits({});
    setFacilityParticipants({});
    setCertified(false);
    setIsDraftSaved(false);
    setMissingFields({});
    localStorage.removeItem('reservationDraft');
  };

  const handleSaveDraft = () => {
    const draftData = {
      formData,
      days,
      endDateInput,
      aircon,
      eventDate,
      startTime,
      endTime,
      dailyScheduleOverrides,
      removedScheduleDates,
      selectedEquip,
      selectedUtilities,
      selectedUtilityUnits,
      facilityParticipants
    };
    localStorage.setItem('reservationDraft', JSON.stringify(draftData));
    setIsDraftSaved(true);
  };

  const handleSubmit = async () => {
    if (isAdminEditMode && (!editReservationId || !editingReservation)) return;
    if (!certified || isSubmitting) return;
    
    if (!currentUser) {
      setCustomAlert({
        title: 'Authentication Required',
        message: 'You must be logged in to submit a reservation.',
        isSuccess: false
      });
      return;
    }

    if (!unavailableDatesLoaded) {
      setCustomAlert({
        title: 'Calendar Availability Unavailable',
        message: unavailableDatesError || 'Calendar availability is still loading. Please try again.',
        isSuccess: false
      });
      return;
    }

    const hasEquipment = Object.values(selectedEquip).some(qty => qty > 0)
      || Boolean(formData.otherEquipment.trim());
    // Validate all required fields in top-to-bottom order
    const requiredOrder = [
      { key: 'fullName', missing: !formData.fullName.trim() },
      { key: 'contactNumber', missing: !/^09\d{9}$/.test(formData.contactNumber) },
      { key: 'emailAddress', missing: !formData.emailAddress.trim() },
      ...(userRole === 'requestor' ? [
        { key: 'requestorTypes', missing: formData.requestorTypes.length === 0 },
        ...(selectedRequestorAccountType?.dropdown ? [{
          key: `requestorAttribute:dropdown:${selectedRequestorAccountType.dropdown}`,
          missing: !formData.requestorAttributes[`dropdown:${selectedRequestorAccountType.dropdown}`]
        }] : []),
        ...(selectedRequestorAccountType?.dropdown === 'courses'
          || (!selectedRequestorAccountType && formData.requestorTypes.some(type => ['Student', 'Student Leader'].includes(type))) ? [
          { key: 'studentNumber', missing: !formData.studentNumber.trim() }
        ] : []),
        ...(!selectedRequestorAccountType && formData.requestorTypes.some(type => ['Admin', 'Staff', 'Faculty'].includes(type)) ? [
          { key: 'department', missing: !formData.department.trim() }
        ] : []),
        ...(selectedRequestorAccountType?.customFields || []).map((field) => {
          const value = formData.requestorAttributes[`field:${field.id}`] || '';
          const invalid = !value.trim()
            || (field.type === 'text' && (
              filterSignupTextValue(value, field.characterTypes) !== value
              || (field.min !== '' && field.min != null && value.length < Number(field.min))
              || (field.max !== '' && field.max != null && value.length > Number(field.max))
            ))
            || (field.type === 'number' && (
              !Number.isFinite(Number(value))
              || (field.min !== '' && field.min != null && Number(value) < Number(field.min))
              || (field.max !== '' && field.max != null && Number(value) > Number(field.max))
            ));
          return {
            key: `requestorAttribute:field:${field.id}`,
            missing: invalid
          };
        })
      ] : []),
      ...((userRole === 'requestor' || userRole === 'user') ? [
        { key: 'endorserName', missing: !formData.endorserName.trim() },
          { key: 'endorserEmail', missing: !endorserEmail.trim() }
      ] : []),
      { key: 'eventName', missing: !formData.eventName.trim() },
      ...(selectedFacilityCapacities.length > 0
        ? selectedFacilityCapacities.map(({ facility }) => ({
          key: getFacilityParticipantFieldKey(facility.id),
          missing: !Number.isInteger(Number(facilityParticipants[facility.id]))
            || Number(facilityParticipants[facility.id]) <= 0
        }))
        : []),
      ...(formData.specificRoom.trim() ? [{
        key: 'specificRoomParticipants',
        missing: !Number.isInteger(Number(formData.specificRoomParticipants))
          || Number(formData.specificRoomParticipants) <= 0
      }] : []),
      { key: 'eventType', missing: formData.eventType.length === 0 },
      { key: 'eventDate', missing: !eventDate.trim() || !!dateError || Boolean(blockedStartDate) },
      { key: 'endDateInput', missing: !endDateInput.trim() || !!daysDateError || days < 1 || invalidDateRange },
      { key: 'startTime', missing: !isStartTimeValid },
      { key: 'endTime', missing: !isEndTimeValid },
      { key: 'schedule', missing: !isDailyScheduleValid },
      { key: 'purpose', missing: !formData.purpose.trim() },
      ...(aircon ? [
        { key: 'airconOnTime', missing: !isAirconOnTimeValid },
        { key: 'airconOffTime', missing: !isAirconOffTimeValid }
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
      if (firstMissingKey === 'schedule') setIsDailyScheduleExpanded(true);
      const targetEl = fieldRefs.current[firstMissingKey];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inputEl = firstMissingKey === 'requestorTypes'
          ? targetEl.querySelector('input')
          : targetEl.querySelector('input:not([type="checkbox"]), select, textarea');
        if (inputEl && firstMissingKey !== 'eventDate' && firstMissingKey !== 'endDateInput') {
          inputEl.focus({ preventScroll: true });
        }
      }
      return;
    }

    if (selectedFacilityCapacities.length > 0) {
      const invalidFacility = selectedFacilityCapacities.find(({ facility, limits, available }) => {
        const participants = Number(facilityParticipants[facility.id]);
        return (limits.min !== null && participants < limits.min)
          || (available !== null && participants > available);
      });

      if (invalidFacility) {
        const { facility, limits, available } = invalidFacility;
        const key = getFacilityParticipantFieldKey(facility.id);
        const participants = Number(facilityParticipants[facility.id]);
        setMissingFields({ [key]: true });
        setCustomAlert({
          title: 'Participant Limit',
          message: limits.min !== null && participants < limits.min
            ? `${facility.name} requires at least ${limits.min} participants.`
            : `${facility.name} has capacity for up to ${available} more participants across active reservations.`,
          isSuccess: false
        });
        fieldRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
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
      setConflictEvent({
        eventName: liveConflict.eventName || 'Untitled Event',
        facilityName: liveConflict.conflictFacilityName,
        conflictType: liveConflict.conflictType,
        occupiedCapacity: liveConflict.occupiedCapacity,
        requestedCapacity: liveConflict.requestedCapacity,
        maxCapacity: liveConflict.maxCapacity,
        date: liveConflict.conflictDate
          ? formatScheduleDate(liveConflict.conflictDate)
          : liveConflict.eventDate || 'N/A',
        time: `${liveConflict.conflictStartTime || liveConflict.startTime || 'N/A'} - ${liveConflict.conflictEndTime || liveConflict.endTime || 'N/A'}`
      });
      setShowOverlapWarning(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const unavailableDateSnapshot = await getDocs(collection(db, 'unavailableDates'));
      const latestUnavailableDates = unavailableDateSnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      const latestAvailableDateIds = new Set(getAvailableDatesInRange(
        eventDate,
        endDateInput || eventDate,
        latestUnavailableDates
      ));
      const latestDailySchedule = dailySchedule.filter((entry) => (
        latestAvailableDateIds.has(entry.date)
      ));
      if (latestDailySchedule.length === 0) {
        setCustomAlert({
          title: 'Date Unavailable',
          message: 'Every date in this reservation range is unavailable. Choose a different date range.',
          isSuccess: false
        });
        return;
      }

      // Recheck against Firestore at submit time in case the live list is stale.
      if (hasFacility) {
        const snap = await getDocs(collection(db, 'reservations'));
        const reservations = snap.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));
        const conflictingReservation = findFacilityConflict(
          reservations,
          { ...conflictRequest, schedule: latestDailySchedule },
          inventoryFacilities
        );

        if (conflictingReservation) {
          setConflictEvent({
            eventName: conflictingReservation.eventName || 'Untitled Event',
            facilityName: conflictingReservation.conflictFacilityName,
            conflictType: conflictingReservation.conflictType,
            occupiedCapacity: conflictingReservation.occupiedCapacity,
            requestedCapacity: conflictingReservation.requestedCapacity,
            maxCapacity: conflictingReservation.maxCapacity,
            date: conflictingReservation.conflictDate
              ? formatScheduleDate(conflictingReservation.conflictDate)
              : conflictingReservation.eventDate || 'N/A',
            time: `${conflictingReservation.conflictStartTime || conflictingReservation.startTime || 'N/A'} - ${conflictingReservation.conflictEndTime || conflictingReservation.endTime || 'N/A'}`
          });
          setShowOverlapWarning(true);
          setIsSubmitting(false);
          return;
        }
      }

      const calculatedEndDate = endDateInput || calculateEndDate(eventDate, days);
      const generatedRefNo = editingReservation
        ? editingReservation.refNo
        : `RES-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

      const reservationUpdate = {
        refNo: generatedRefNo,
        ...formData,
        requestorTypes: editingReservation
          ? formData.requestorTypes
          : userRole === 'requestor' ? formData.requestorTypes : [],
        endorserDesignation: formData.endorserDesignation || selectedEndorser?.department || '',
        endorserEmail,
        userId: editingReservation?.userId || currentUser.uid,
        userEmail: editingReservation?.userEmail || currentUser.email,
        userRole: editingReservation?.userRole || userRole,
        eventDate,
        endDate: calculatedEndDate,
        startTime: formatTimeForStorage(startTime),
        endTime: formatTimeForStorage(endTime),
        schedule: latestDailySchedule.map((entry) => ({
          date: entry.date,
          startTime: formatTimeForStorage(entry.startTime),
          endTime: formatTimeForStorage(entry.endTime)
        })),
        durationHours,
        days,
        aircon,
        selectedEquip,
        selectedUtilities,
        selectedUtilityUnits,
        expectedParticipants: expectedParticipantCount,
        facilityParticipants: selectedFacilityParticipants,
        status: isAdminEditMode ? editingReservation?.status || 'Approved' : 'Pending',
        updatedAt: new Date().toISOString()
      };

      if (editingReservation && isAdminEditMode) {
        const adminEditLog = {
          id: `modified-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: userRole,
          badge: 'Modified',
          timestamp: reservationUpdate.updatedAt,
          date: new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          approverName: currentUser.email || 'Administrator',
          text: 'Reservation details updated by an administrator.',
          state: (editingReservation.status || 'approved').toLowerCase()
        };
        await updateDoc(doc(db, 'reservations', editingReservation.id), {
          ...reservationUpdate,
          historyLogs: arrayUnion(adminEditLog)
        });
      } else if (editingReservation) {
        const resubmissionLog = {
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          role: 'Requestor',
          badge: 'Resubmitted',
          remark: resubmissionRemark.trim(),
          timestamp: reservationUpdate.updatedAt,
          modificationRequestedByRoleKey: editingReservation.modificationRequestedByRoleKey || '',
          modificationRequestLogId: editingReservation.modificationRequestLogId || '',
          date: new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          approverName: formData.fullName,
          text: resubmissionRemark.trim() || 'Reservation updated and resubmitted for approval.',
          state: 'pending'
        };
        await updateDoc(doc(db, 'reservations', editingReservation.id), {
          ...reservationUpdate,
          modificationRemark: deleteField(),
          modificationRequestedBy: deleteField(),
          modificationRequestedByRoleKey: deleteField(),
          modificationRequestLogId: deleteField(),
          modificationRequestedAt: deleteField(),
          historyLogs: arrayUnion(resubmissionLog)
        });
        setResubmissionRemark('');
      } else {
        await addDoc(collection(db, 'reservations'), {
          ...reservationUpdate,
          createdAt: new Date().toISOString()
        });
      }

      if (formData.endorserEmail && !isAdminEditMode) {
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
      if (editingReservation) setEditingReservation(null);
      setCustomAlert({
        title: 'Success',
        message: editingReservation
          ? isAdminEditMode
            ? `Reservation ${generatedRefNo} has been updated.`
            : `Reservation ${generatedRefNo} has been updated and resubmitted for approval.`
          : `Reservation submitted successfully! Your Reference No. is ${generatedRefNo}.`,
        isSuccess: true,
        returnToSchedule: Boolean(editingReservation && !isAdminEditMode),
        returnToCalendar: Boolean(editingReservation && isAdminEditMode)
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
          <i className="ph"></i>{isAdminEditMode ? 'Edit Reservation' : editReservationId ? 'Modify Reservation' : 'Reservation Form'}
        </div>
        <div className="required-note">
          All fields marked <span className="req">*</span> are required
        </div>
      </div>
      {editingReservation?.modificationRemark && (
        <div className="info-box modification-request">
          <i className="ph ph-info"></i>
          <div>
            <strong>Requested changes:</strong>{' '}
            <span>{editingReservation.modificationRemark}</span>
          </div>
        </div>
      )}

      {/* Requestor & Endorser Information */}
      <div className="form-card">
        <div className="section-header">
          Requestor Information
        </div>

        <div className="form-grid col-3 requestor-information-grid">
          <div 
            className={`input-group requestor-name-group ${missingFields.fullName ? 'field-missing' : ''}`}
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
            {userRole === 'requestor' && (
              <div
                className="requestor-type-field"
              >
                <div
                  className={`input-group requestor-type-input ${missingFields.requestorTypes ? 'field-missing' : ''}`}
                  ref={el => fieldRefs.current.requestorTypes = el}
                >
                  <label>Requestor Type <span className="req">*</span></label>
                  <input
                    type="text"
                    value={formData.requestorTypes[0] || ''}
                    readOnly
                    aria-label="Requestor type from profile"
                    className={missingFields.requestorTypes ? 'input-error' : ''}
                  />
                </div>
                {selectedRequestorAccountType?.dropdown && (
                  <div
                    className={`input-group ${missingFields[`requestorAttribute:dropdown:${selectedRequestorAccountType.dropdown}`] ? 'field-missing' : ''}`}
                    ref={(element) => {
                      fieldRefs.current[`requestorAttribute:dropdown:${selectedRequestorAccountType.dropdown}`] = element;
                    }}
                  >
                    <label>{selectedRequestorDropdownType?.label || selectedRequestorAccountType.dropdown} <span className="req">*</span></label>
                    <select
                      value={formData.requestorAttributes[`dropdown:${selectedRequestorAccountType.dropdown}`] || ''}
                      onChange={(event) => handleRequestorAttributeChange(
                        `dropdown:${selectedRequestorAccountType.dropdown}`,
                        event.target.value
                      )}
                      disabled={selectedRequestorDropdownType?.editableOnProfile === false}
                      className={`requestor-dropdown-select ${missingFields[`requestorAttribute:dropdown:${selectedRequestorAccountType.dropdown}`] ? 'input-error' : ''}`}
                    >
                      <option value="">Select {selectedRequestorDropdownType?.label || 'an option'}</option>
                      {formData.requestorAttributes[`dropdown:${selectedRequestorAccountType.dropdown}`]
                        && !(selectedRequestorAccountType.options || []).some(
                          (option) => option.value === formData.requestorAttributes[`dropdown:${selectedRequestorAccountType.dropdown}`]
                        )
                        && (
                          <option value={formData.requestorAttributes[`dropdown:${selectedRequestorAccountType.dropdown}`]}>
                            {formData.requestorAttributes[`dropdown:${selectedRequestorAccountType.dropdown}`]}
                          </option>
                        )}
                      {(selectedRequestorAccountType.options || []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedRequestorAccountType?.dropdown === 'courses' && (
                  <div
                    className={`input-group ${missingFields.studentNumber ? 'field-missing' : ''}`}
                    ref={el => fieldRefs.current.studentNumber = el}
                  >
                    <label>Student Number <span className="req">*</span></label>
                    <input
                      type="text"
                      value={formData.studentNumber}
                      onChange={(e) => handleInputChange('studentNumber',   e.target.value)}
                      maxLength={30}
                      placeholder="Enter your student number"
                      className={missingFields.studentNumber ? 'input-error' : ''}
                    />
                  </div>
                )}
                {!selectedRequestorAccountType && ['Student', 'Student Leader'].includes(formData.requestorTypes[0]) && (
                  <div
                    className={`input-group ${missingFields.studentNumber ? 'field-missing' : ''}`}
                    ref={el => fieldRefs.current.studentNumber = el}
                  >
                    <label>Student Number <span className="req">*</span></label>
                    <input
                      type="text"
                      value={formData.studentNumber}
                      onChange={(e) => handleInputChange('studentNumber', e.target.value)}
                      maxLength={30}
                      placeholder="Enter your student number"
                      className={missingFields.studentNumber ? 'input-error' : ''}
                    />
                  </div>
                )}
                {!selectedRequestorAccountType && ['Admin', 'Staff', 'Faculty'].includes(formData.requestorTypes[0]) && (
                  <div
                    className={`input-group ${missingFields.department ? 'field-missing' : ''}`}
                    ref={el => fieldRefs.current.department = el}
                  >
                    <label>Department / Office <span className="req">*</span></label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => handleInputChange('department', e.target.value)}
                      maxLength={50}
                      placeholder="Enter your department or office"
                      className={missingFields.department ? 'input-error' : ''}
                    />
                  </div>
                )}
                {(selectedRequestorAccountType?.customFields || []).map((field) => {
                  const key = `field:${field.id}`;
                  const missingKey = `requestorAttribute:${key}`;
                  return (
                    <div
                      className={`input-group ${missingFields[missingKey] ? 'field-missing' : ''}`}
                      key={field.id}
                      ref={(element) => {
                        fieldRefs.current[missingKey] = element;
                      }}
                    >
                      <label>{field.label} <span className="req">*</span></label>
                      <input
                        type={field.type || 'text'}
                        value={formData.requestorAttributes[key] || ''}
                        onChange={(event) => handleRequestorAttributeChange(key, event.target.value, field)}
                        readOnly={field.editableOnProfile === false}
                        min={field.type === 'number' && field.min != null && field.min !== '' ? field.min : undefined}
                        max={field.type === 'number' && field.max != null && field.max !== '' ? field.max : undefined}
                        minLength={field.type === 'text' && field.min != null && field.min !== '' ? Number(field.min) : undefined}
                        maxLength={field.type === 'text' && field.max != null && field.max !== '' ? Number(field.max) : undefined}
                        required
                        className={missingFields[missingKey] ? 'input-error' : ''}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          <div 
            className={`input-group requestor-contact-group ${missingFields.contactNumber ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.contactNumber = el}
          >
            <label>Contact Number <span className="req">*</span></label>
            <div className="input-with-icon left-icon contact-number-input">
              <i className="ph ph-phone"></i>
              <span className="contact-number-prefix" aria-hidden="true">09</span>
              <input
                type="tel"
                inputMode="numeric"
                value={formData.contactNumber.slice(2)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  const nationalDigits = digits.startsWith('09') ? digits.slice(2) : digits;
                  handleInputChange('contactNumber', `09${nationalDigits.slice(0, 9)}`);
                }}
                maxLength={9}
                aria-label="Contact number, remaining 9 digits after 09"
                placeholder="XXX XXX XXX"
                className={missingFields.contactNumber ? 'input-error' : ''}
              />
            </div>
            {missingFields.contactNumber && (
              <span className="field-error">Enter a complete 11-digit mobile number starting with 09.</span>
            )}
          </div>
          {showProfileDepartment && (
            <div className="input-group">
              <label>Department</label>
              <input
                type="text"
                value={formData.department}
                readOnly
                placeholder="No department listed on profile"
              />
            </div>
          )}
          <div 
            className={`input-group requestor-email-group ${missingFields.emailAddress ? 'field-missing' : ''}`}
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
                            <span className="endorser-dropdown-name-row">
                              <span className="endorser-dropdown-name">
                                {endorser.cleanName.replace(/\s*\(Faculty\)\s*/gi, ' ').replace(/\s+/g, ' ').trim()}
                              </span>
                              {/\(Faculty\)/i.test(endorser.cleanName) && (
                                <span className="endorser-dropdown-role">Faculty</span>
                              )}
                            </span>
                            <span className="endorser-dropdown-email">{endorser.email}</span>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {selectedEndorserAccountType?.dropdown && (
                <div className="input-group">
                  <label>{selectedEndorserDropdownType?.label || selectedEndorserAccountType.dropdown}</label>
                  <input
                    type="text"
                    value={selectedEndorserDropdownOption?.label || selectedEndorserDropdownValue}
                    readOnly
                  />
                </div>
              )}
              {(selectedEndorserAccountType?.customFields || []).map((field) => (
                <div className="input-group" key={field.id}>
                  <label>{field.label}</label>
                  <input
                    type="text"
                    value={selectedEndorserAttributes[`field:${field.id}`] || ''}
                    readOnly
                  />
                </div>
              ))}
              <div 
                className={`input-group full-width ${missingFields.endorserEmail ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.endorserEmail = el}
              >
                <label>Endorser's Contact Email <span className="req">*</span></label>
                <div className="input-with-icon left-icon">
                  <i className="ph-fill ph-envelope-simple"></i>
                  <input 
                    type="email" 
                    value={endorserEmail}
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
                const limits = getFacilityCapacityLimits(item);
                const maxCapacity = limits.max;
                const displayCapacityLeft = getFacilityRemainingCapacity(item);
                const isLocked = item.status === 'Unavailable' || displayCapacityLeft === 0;
                const participantFieldKey = getFacilityParticipantFieldKey(item.id);

                return (
                  <div
                    key={item.id}
                    className={`facility-option reservation-facility-option ${isSelected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="facility-checkbox"
                      id={`facility-${item.id}`}
                      checked={isSelected}
                      onChange={() => handleCheckboxArrayChange('facilities', item.id)}
                      disabled={isLocked}
                    />
                    <label className="facility-info" htmlFor={`facility-${item.id}`}>
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
                    {isSelected && (
                      <div
                        className={`facility-participants ${missingFields[participantFieldKey] || facilityParticipantErrors[item.id] ? 'field-missing' : ''}`}
                        ref={(element) => { fieldRefs.current[participantFieldKey] = element; }}
                      >
                        <label htmlFor={`participants-${item.id}`}>
                          Number of Participants <span className="req">*</span>
                        </label>
                        <input
                          id={`participants-${item.id}`}
                          type="text"
                          inputMode="numeric"
                          value={facilityParticipants[item.id] ?? ''}
                          onKeyDown={(event) => {
                            if (event.key.length === 1 && !/[0-9]/.test(event.key)) event.preventDefault();
                          }}
                          onChange={(event) => handleFacilityParticipantsChange(
                            item.id,
                            event.target.value.replace(/\D/g, '')
                          )}
                          placeholder="Enter whole number"
                          className={`facility-participants-input ${missingFields[participantFieldKey] || facilityParticipantErrors[item.id] ? 'input-error' : ''}`}
                        />
                        {facilityParticipantErrors[item.id] && (
                          <span className="field-error">
                            {limits.min !== null && Number(facilityParticipants[item.id]) < limits.min
                              ? `Enter at least ${limits.min} participants.`
                              : `Enter no more than ${displayCapacityLeft} participants.`}
                          </span>
                        )}
                        {missingFields[participantFieldKey] && (
                          <span className="field-error">Enter a positive whole number of participants.</span>
                        )}
                      </div>
                    )}
                  </div>
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
          {formData.specificRoom.trim() && (
            <div
              className={`input-group ${missingFields.specificRoomParticipants ? 'field-missing' : ''}`}
              ref={(element) => { fieldRefs.current.specificRoomParticipants = element; }}
            >
              <label htmlFor="specific-room-participants">
                Number of Participants <span className="req">*</span>
              </label>
              <input
                id="specific-room-participants"
                type="text"
                inputMode="numeric"
                value={formData.specificRoomParticipants}
                onKeyDown={(event) => {
                  if (event.key.length === 1 && !/[0-9]/.test(event.key)) event.preventDefault();
                }}
                onChange={(event) => handleInputChange(
                  'specificRoomParticipants',
                  event.target.value.replace(/\D/g, '')
                )}
                placeholder="Enter whole number"
                className={`specific-room-participants-input ${missingFields.specificRoomParticipants ? 'input-error' : ''}`}
              />
              {missingFields.specificRoomParticipants && (
                <span className="field-error">Enter a positive whole number of participants.</span>
              )}
            </div>
          )}
        </div>

        <div className="form-card">
          <div className="section-header">Equipment</div>

          <div className="equipment-list">
            {mappedEquipmentList.length === 0 ? (
              <div className="empty-list">No equipment currently listed in inventory.</div>
            ) : (
              mappedEquipmentList.map((item) => {
                const count = selectedEquip[item.id] || 0;
                const isLocked = item.status === 'Unavailable' || !hasFacility;
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
                placeholder="e.g. Speaker - 20 units"
              />
            </div>
            <span className="helper-text">Leave blank if not applicable</span>
          </div>

        </div>

        <div className="form-card">
          <div className="section-header">Utility</div>
          <div className="checkbox-grid facility-list utility-list">
            {inventoryUtilities.length === 0 ? (
              <div className="empty-list">No utilities currently listed.</div>
            ) : (
              inventoryUtilities.map((item) => {
                const quantity = selectedUtilityUnits[item.id] || 0;
                const isSelected = quantity > 0;
                const isUnavailable = (item.status || '').toLowerCase() === 'unavailable';
                const isLocked = isUnavailable || !hasFacility;
                const status = isUnavailable ? 'Unavailable' : 'Available';

                return (
                  <div
                    key={item.id}
                    className={`facility-option ${isSelected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''}`}
                    title={!hasFacility ? 'Select a facility to choose utilities.' : undefined}
                  >
                    <input
                      type="checkbox"
                      className="facility-checkbox"
                      checked={isSelected}
                      onChange={(e) => handleUtilityUnitsChange(item, e.target.checked ? String(quantity || 1) : '')}
                      disabled={isLocked}
                    />
                    <div className="facility-icon">
                      <i className="ph ph-lightning"></i>
                    </div>
                    <div className="utility-info">
                      <strong>{item.name || 'Untitled Utility'}</strong>
                      <span className="facility-meta">{item.sku || 'Utility'}</span>
                      <span className="facility-availability">
                        <span className={`facility-status ${status.toLowerCase()}`}>
                          ● {status}
                        </span>
                      </span>
                    </div>
                    <div className="utility-quantity">
                      <div className="counter utility-counter">
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name || 'utility'} units`}
                          onClick={() => handleUtilityUnitsChange(item, String(Math.max(0, quantity - 1)))}
                          disabled={isLocked || quantity === 0}
                        >-</button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          aria-label={`${item.name || 'Utility'} units`}
                          value={quantity}
                          onChange={(e) => handleUtilityUnitsChange(item, e.target.value)}
                          disabled={isLocked}
                        />
                        <button
                          type="button"
                          aria-label={`Increase ${item.name || 'utility'} units`}
                          onClick={() => handleUtilityUnitsChange(item, String(quantity + 1))}
                          disabled={isLocked}
                        >+</button>
                      </div>
                      <span className="utility-quantity-label">units</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="input-group room-field utility-other-field">
            <label>Other Utility</label>
            <div className="input-with-icon left-icon">
              <i className="ph ph-lightning"></i>
              <input
                type="text"
                value={formData.otherUtility}
                onChange={(e) => handleInputChange('otherUtility', e.target.value)}
                placeholder="e.g. Blackboard - 5 units"
              />
            </div>
            <span className="helper-text">Leave blank if not applicable</span>
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="section-header">Air Conditioning</div>
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
                <ReservationTimePicker
                  value={formData.airconOnTime}
                  label="Aircon ON time"
                  disabled={!aircon}
                  invalid={Boolean(missingFields.airconOnTime || (formData.airconOnTime && !isAirconOnTimeValid))}
                  onChange={(value) => {
                    setFormData((previous) => ({
                      ...previous,
                      airconOnTime: formatTimeForStorage(value)
                    }));
                    clearMissingField('airconOnTime');
                  }}
                />
                {aircon && formData.airconOnTime && !isAirconOnTimeValid && (
                  <span className="field-error">Choose a time between 7:00 AM and 10:00 PM.</span>
                )}
              </div>
              <i className="ph ph-arrow-right arrow"></i>

              <div
                className={`input-group ${missingFields.airconOffTime ? 'field-missing' : ''}`}
                ref={el => fieldRefs.current.airconOffTime = el}
              >
                <label>Aircon OFF Time {aircon && <span className="req">*</span>}</label>
                <ReservationTimePicker
                  value={formData.airconOffTime}
                  label="Aircon OFF time"
                  disabled={!aircon}
                  invalid={Boolean(missingFields.airconOffTime || (formData.airconOffTime && !isAirconOffTimeValid))}
                  onChange={(value) => {
                    setFormData((previous) => ({
                      ...previous,
                      airconOffTime: formatTimeForStorage(value)
                    }));
                    clearMissingField('airconOffTime');
                  }}
                />
                {aircon && formData.airconOffTime && !isAirconOffTimeValid && (
                  <span className="field-error">Choose a time between 7:00 AM and 10:00 PM.</span>
                )}
              </div>
            </div>
          </div>

          <div className="info-box blue aircon-note">
            <i className="ph ph-info"></i>
            <div>Aircon will be scheduled based on approved timing. Choose times between 7:00 AM and 10:00 PM.</div>
          </div>

        </div>
      </div>

      {/* Event Information */}
      <div className="form-card">
        <div className="section-header">
          Event Information
        </div>
        <div className="form-grid col-3 event-information-grid">
          {/* Row 1 Left: Event Name */}
          <div 
            className={`input-group event-name-field ${missingFields.eventName ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.eventName = el}
          >
            <label>Event Name <span className="req">*</span></label>
            <input 
              type="text" 
              value={formData.eventName} 
              onChange={(e) => handleInputChange('eventName', e.target.value)} 
              pattern="[A-Za-z0-9 ]*"
              title="Use letters, numbers, and spaces only."
              maxLength={40}
              placeholder="e.g. Annual General Assembly" 
              className={missingFields.eventName ? 'input-error' : ''}
            />
          </div>
          
          {/* Row 2 Left: Event Type & Taken Schedules */}
          <div className="event-information-field-group">
            <div 
              className={`input-group event-type-field ${missingFields.eventType ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.eventType = el}
            >
              <label>Event Type <span className="req">*</span></label>
              <select
                value={formData.eventType[0] || ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setFormData((previous) => ({
                    ...previous,
                    eventType: value ? [value] : []
                  }));
                  if (value) clearMissingField('eventType');
                }}
                className={missingFields.eventType ? 'input-error' : ''}
              >
                <option value="">Select an event type</option>
                {['Academic', 'Cultural', 'Sports', 'Seminar', 'Training', 'Other'].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="input-group taken-schedules-field">
              <label>Taken Schedules (Reference)</label>
              <select
                value={selectedScheduleId}
                onChange={(event) => setSelectedScheduleId(event.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="" disabled>View pending & approved schedules...</option>
                {takenScheduleReservations.map(res => (
                    <option key={res.id} value={res.id}>
                      {res.eventName || 'Untitled Event'} | {res.eventDate} {res.endDate && res.endDate !== res.eventDate ? `to ${res.endDate}` : ''} | {res.startTime} - {res.endTime}
                      {' | '}{(res.facilities || [])
                        .map(facilityId => inventoryFacilities.find(facility => facility.id === facilityId)?.name || facilityId)
                        .join(', ') || 'No facility'}
                      {' | '}{res.status || 'Pending'}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Row 2 Right Column: Start Date & End Date Stacked */}
          <div className="event-information-field-group">
            {/* Start Date (Formerly Event Date) */}
            <div 
              className={`input-group start-date-field ${missingFields.eventDate ? 'field-missing' : ''}`}
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
                    className={(dateError || blockedStartDate || missingFields.eventDate) ? 'input-error' : ''}
                  />
                </div>
                {(dateError || blockedStartDate) && (
                  <span className="field-error">{dateError || getUnavailableDateMessage(blockedStartDate)}</span>
                )}
                {unavailableDatesError && <span className="field-error">{unavailableDatesError}</span>}
                
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
              className={`input-group end-date-field ${missingFields.endDateInput ? 'field-missing' : ''}`}
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
                {unavailableDatesInRange.length > 0 && !daysDateError && !invalidDateRange && (
                  <span className="helper-text">
                    Unavailable dates will be excluded from this reservation: {unavailableDatesInRange
                      .map((date) => formatScheduleDate(date.date || date.id))
                      .join(', ')}
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
          <div className="event-information-field-group event-time-fields">
            <div 
              className={`input-group ${missingFields.startTime ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.startTime = el}
            >
              <label>Default Start Time <span className="req">*</span></label>
              <ReservationTimePicker
                value={startTime}
                label="Default start time"
                invalid={Boolean(missingFields.startTime || (startTime && !isStartTimeValid))}
                onChange={(value) => {
                  setStartTime(value);
                  if (value) clearMissingField('startTime');
                }}
              />
              {startTime && !isStartTimeValid && (
                <span className="field-error">Choose a time between 7:00 AM and 10:00 PM.</span>
              )}
            </div>
            <div 
              className={`input-group ${missingFields.endTime ? 'field-missing' : ''}`}
              ref={el => fieldRefs.current.endTime = el}
            >
              <label>Default End Time <span className="req">*</span></label>
              <ReservationTimePicker
                value={endTime}
                label="Default end time"
                invalid={Boolean(missingFields.endTime || (endTime && !isEndTimeValid))}
                onChange={(value) => {
                  setEndTime(value);
                  if (value) clearMissingField('endTime');
                }}
              />
              {endTime && !isEndTimeValid && (
                <span className="field-error">Choose a time between 7:00 AM and 10:00 PM.</span>
              )}
            </div>
          </div>

          <div
            className={`input-group full-width schedule-override-group event-daily-schedule ${missingFields.schedule ? 'field-missing' : ''}`}
            ref={el => fieldRefs.current.schedule = el}
          >
            <button
              type="button"
              className="schedule-override-toggle"
              onClick={() => setIsDailyScheduleExpanded((expanded) => !expanded)}
              aria-expanded={isDailyScheduleExpanded}
              aria-controls="daily-schedule-options"
            >
              <span>
                <strong>Daily Schedule <span className="req">*</span></strong>
                <small className="schedule-override-count">
                  {dailySchedule.length} {dailySchedule.length === 1 ? 'date' : 'dates'}
                </small>
              </span>
              <span className="schedule-override-action">
                {isDailyScheduleExpanded ? 'Hide dates and times' : 'Show dates and times'}
                <i className={`schedule-override-chevron ${isDailyScheduleExpanded ? 'is-expanded' : ''}`} aria-hidden="true"></i>
              </span>
            </button>
            {isDailyScheduleExpanded && (
              <div id="daily-schedule-options" className="schedule-override-content">
                <span className="helper-text">
                  Default times are applied to each date. Adjust an individual day or remove it if it is not needed.
                </span>
                {dailySchedule.length === 0 ? (
                  <span className={missingFields.schedule ? 'field-error' : 'helper-text'}>
                    {missingFields.schedule
                      ? 'Add at least one date with a valid start and end time.'
                      : 'Select a valid start and end date to generate the daily schedule.'}
                  </span>
                ) : (
                  <div className="schedule-override-list">
                    {dailySchedule.map((entry) => (
                      <div className="schedule-override-row" key={entry.date}>
                        <strong>{formatScheduleDate(entry.date)}</strong>
                        <label>
                          <span>Start</span>
                          <ReservationTimePicker
                            value={entry.startTime}
                            label={`Start time for ${formatScheduleDate(entry.date)}`}
                            invalid={!isWithinReservationHours(entry.startTime)}
                            onChange={(value) => {
                              setDailyScheduleOverrides((overrides) => ({
                                ...overrides,
                                [entry.date]: {
                                  startTime: value,
                                  endTime: overrides[entry.date]?.endTime ?? entry.endTime
                                }
                              }));
                              clearMissingField('schedule');
                            }}
                          />
                        </label>
                        <label>
                          <span>End</span>
                          <ReservationTimePicker
                            value={entry.endTime}
                            label={`End time for ${formatScheduleDate(entry.date)}`}
                            invalid={!isWithinReservationHours(entry.endTime)}
                            onChange={(value) => {
                              setDailyScheduleOverrides((overrides) => ({
                                ...overrides,
                                [entry.date]: {
                                  startTime: overrides[entry.date]?.startTime ?? entry.startTime,
                                  endTime: value
                                }
                              }));
                              clearMissingField('schedule');
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="schedule-day-remove"
                          onClick={() => {
                            setRemovedScheduleDates((dates) => [...new Set([...dates, entry.date])]);
                          }}
                          aria-label={`Remove ${formatScheduleDate(entry.date)} from schedule`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {missingFields.schedule && dailySchedule.length > 0 && !isDailyScheduleValid && (
                  <span className="field-error">Each scheduled date needs start and end times between 7:00 AM and 10:00 PM, and the times must differ.</span>
                )}
              </div>
            )}
          </div>

          {liveConflict && (
            <div className="schedule-conflict-notice full-width" role="alert" aria-live="assertive">
              <strong>
                {liveConflict.conflictType === 'capacity'
                  ? 'Facility capacity exceeded — this reservation cannot be submitted.'
                  : 'Schedule conflict — this reservation cannot be submitted.'}
              </strong>
              <span><strong>Conflicting facility:</strong> {liveConflict.conflictFacilityName}.</span>
              {liveConflict.conflictType === 'schedule' && (
                <span>
                  {liveConflict.eventName || 'Another reservation'} is scheduled on{' '}
                  {liveConflict.conflictDate
                    ? formatScheduleDate(liveConflict.conflictDate)
                    : liveConflict.eventDate || 'an overlapping date'} at{' '}
                  {liveConflict.conflictStartTime || liveConflict.startTime}–
                  {liveConflict.conflictEndTime || liveConflict.endTime}.
                </span>
              )}
              {liveConflict.conflictType === 'capacity' && (
                <span>
                  {liveConflict.occupiedCapacity} of {liveConflict.maxCapacity} participants are already
                  {' '}reserved across active reservations. Adding {liveConflict.requestedCapacity} would exceed
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
              maxLength={600}
              placeholder="Others/Briefly describe the purpose and objectives of your event..."
              className={missingFields.purpose ? 'input-error' : ''}
            ></textarea>
          </div>
        </div>

        <div className="info-box green duration-box">
          <i className="ph ph-info"></i>
          <div>
            <strong>
              Total Duration: {totalScheduledHours} hours across {dailySchedule.length} scheduled day(s)
              {eventDate && days > 1 ? ` (Date range ends: ${endDateInput || calculateEndDate(eventDate, days)})` : ''}
            </strong>
          </div>
        </div>
      </div>

      {editingReservation && !isAdminEditMode && (
        <div className="form-card resubmission-remarks-card">
          <div className="section-header">Remarks</div>
          <div className="input-group">
            <label htmlFor="resubmission-remark">Add a remark for your resubmission</label>
            <textarea
              id="resubmission-remark"
              value={resubmissionRemark}
              onChange={(event) => setResubmissionRemark(event.target.value.slice(0, 1000))}
              placeholder="Explain the changes you made or add a note for the approver..."
              maxLength={1000}
              rows={4}
              disabled={isSubmitting}
            />
            <span className="remark-character-count">{resubmissionRemark.length}/1000</span>
          </div>
        </div>
      )}

      {/* CERTIFICATION & ACTIONS */}
      <div className="certification">
        <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
        <p>I hereby certify that all information provided in this RASA form is true and correct. I agree to abide by the facility use policies and regulations of the institution. I understand that any misuse of the facility may result in the revocation of this reservation and/or other sanctions.</p>
      </div>

      <div className="form-actions">
        <button
          className="btn-outline"
          onClick={() => editReservationId ? navigate(isAdminEditMode ? '/calendar' : '/schedule') : handleDiscard()}
          disabled={isSubmitting}
        >
          <i className={`ph ${editingReservation ? 'ph-arrow-left' : 'ph-trash'}`}></i>
          {editReservationId ? 'Cancel Changes' : 'Discard Form'}
        </button>
        <div className="right-actions">
          {!editReservationId && (
            <button className="btn-outline" onClick={handleSaveDraft}>
            <i className="ph ph-floppy-disk"></i> {isDraftSaved ? '✓ Draft Saved' : 'Save Draft'}
            </button>
          )}
          <button 
            className="btn-primary" 
            onClick={handleSubmit} 
            disabled={!certified || isSubmitting || !!liveConflict || isLoadingEdit || Boolean(editReservationId && !editingReservation)}
          >
            {isLoadingEdit
              ? 'Loading Reservation...'
              : isSubmitting
                ? isAdminEditMode ? 'Saving Changes...' : 'Submitting...'
                : isAdminEditMode ? 'Save Changes' : editingReservation ? 'Resubmit Reservation' : 'Submit Reservation'}
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
              <button
                onClick={() => {
                  const returnToSchedule = customAlert.returnToSchedule;
                  const returnToCalendar = customAlert.returnToCalendar;
                  setCustomAlert(null);
                  if (returnToCalendar) navigate('/calendar');
                  else if (returnToSchedule) navigate('/schedule');
                }}
                className="modal-button"
              >
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
                    <strong>{conflictEvent.facilityName}</strong> does not have enough total capacity available
                    for this reservation.
                  </>
                : <>
                    The conflict is with <strong>{conflictEvent?.facilityName || 'the selected facility'}</strong>,
                    {' '}which is already reserved during the selected multi-day time window
                    {conflictEvent && (
                      <> by <strong>{conflictEvent.eventName}</strong> ({conflictEvent.date}, {conflictEvent.time})</>
                    )}.
                  </>}
              {conflictEvent?.conflictType === 'capacity' && (
                <> {conflictEvent.occupiedCapacity} of {conflictEvent.maxCapacity} participants are already reserved across active reservations, and adding {conflictEvent.requestedCapacity} would exceed the maximum.</>
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
            <ReservationDetails
              data={selectedSchedule}
              showRequestorInfo={canViewSelectedScheduleIdentity}
              showApprovalHistory={canViewSelectedScheduleIdentity}
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default Reservation;
