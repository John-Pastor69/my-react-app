import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { auth, db } from '../Firebase';
import MonthYearPicker from '../components/MonthYearPicker';
import {
  APPROVAL_ROLE_HIERARCHY,
  isApprovalStepReady,
  isReservationAssignedToEndorser,
  normalizeApprovalRoleKey
} from '../services/approvalWorkflow';
import { isReservationActive } from '../services/reservationStatus';
import { formatTimeForDisplay } from '../services/timeFormatting';
import "../styles/Dashboard.scss";

const ReservationDetails = lazy(() => import('./ReservationDetails'));

// Shared date and time helpers normalize values from filters and stored reservations.
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return parseDate(value.toDate());

  const dateString = String(value).trim();
  const yearFirstDate = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yearFirstDate) {
    const [, year, month, day] = yearFirstDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return parsed.getFullYear() === Number(year)
      && parsed.getMonth() === Number(month) - 1
      && parsed.getDate() === Number(day)
      ? parsed
      : null;
  }

  const monthFirstDate = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (monthFirstDate) {
    const [, month, day, year] = monthFirstDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return parsed.getFullYear() === Number(year)
      && parsed.getMonth() === Number(month) - 1
      && parsed.getDate() === Number(day)
      ? parsed
      : null;
  }

  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseTime = (value) => {
  if (!value || value === 'N/A') return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (hours > 23 || minutes > 59 || (meridiem && hours > 12)) return null;
  if (meridiem) {
    hours = hours % 12 + (meridiem === 'PM' ? 12 : 0);
  }
  return hours * 60 + minutes;
};

const formatDate = (date) => date
  ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : 'Date unavailable';

const getReservationAdditionalDetails = (reservation) => ({
  otherEquipment: typeof reservation.otherEquipment === 'string'
    ? reservation.otherEquipment.trim()
    : '',
  otherUtility: typeof reservation.otherUtility === 'string'
    ? reservation.otherUtility.trim()
    : '',
  specificRoom: typeof reservation.specificRoom === 'string'
    ? reservation.specificRoom.trim()
    : ''
});

const getOtherRequestDetails = (reservation, nameField, unitsField) => {
  const rawName = typeof reservation[nameField] === 'string'
    ? reservation[nameField].trim()
    : '';
  if (!rawName) return null;

  const legacyUnits = rawName.match(/\s*-\s*(\d+)(?:\s+units?)?\s*$/i);
  const name = (legacyUnits ? rawName.slice(0, legacyUnits.index) : rawName).trim();
  if (!name) return null;

  const requestedUnits = Number(reservation[unitsField]);
  return {
    name,
    key: name.toLowerCase(),
    quantity: Number.isFinite(requestedUnits) && requestedUnits > 0
      ? requestedUnits
      : Number(legacyUnits?.[1]) || 1
  };
};

const DashboardDatePicker = ({ id, value, min, max, label, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseDate(value) || new Date());
  const pickerRef = useRef(null);
  const selectedDate = parseDate(value);
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const calendarCells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;

    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const dateValue = toDateInputValue(date);
    return {
      day,
      date,
      dateValue,
      isDisabled: Boolean((min && dateValue < min) || (max && dateValue > max))
    };
  });

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

  return (
    <div className="dashboard-date-picker" ref={pickerRef}>
      <button
        id={id}
        type="button"
        className="dashboard-date-trigger"
        aria-label={`${label}: ${selectedDate?.toLocaleDateString() || 'Select date'}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          setViewDate(selectedDate || new Date());
          setIsOpen((open) => !open);
        }}
      >
        <i className="ph ph-calendar-blank" aria-hidden="true"></i>
        <span className={selectedDate ? '' : 'is-placeholder'}>
          {selectedDate?.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' }) || 'mm/dd/yyyy'}
        </span>
      </button>
      {isOpen && (
        <div className="dashboard-date-popover" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <div className="dashboard-date-calendar-header">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            >
              &#10094;
            </button>
            <MonthYearPicker date={viewDate} onChange={setViewDate} />
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            >
              &#10095;
            </button>
          </div>
          <div className="dashboard-date-calendar-grid">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <span className="dashboard-date-weekday" key={day}>{day}</span>
            ))}
            {calendarCells.map((cell, index) => cell ? (
              <button
                type="button"
                key={cell.dateValue}
                disabled={cell.isDisabled}
                aria-label={cell.date.toLocaleDateString()}
                aria-pressed={cell.dateValue === value}
                className={cell.dateValue === value ? 'is-selected' : ''}
                onClick={() => {
                  onChange(cell.dateValue);
                  setIsOpen(false);
                }}
              >
                {cell.day}
              </button>
            ) : <span className="is-empty" key={`empty-${index}`} />)}
          </div>
        </div>
      )}
    </div>
  );
};

// Display helpers keep status badges and requestor names consistent.
const getStatusClass = (status) => {
  const normalizedStatus = (status || 'Pending').toLowerCase();
  if (normalizedStatus === 'approved') return 'approved';
  if (normalizedStatus === 'rejected' || normalizedStatus === 'cancelled') return 'rejected';
  return 'pending';
};

// Reusable selector for dashboard time filters.
const DashboardTimePicker = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef(null);
  const totalMinutes = parseTime(value);
  const selectedHour24 = totalMinutes === null ? 0 : Math.floor(totalMinutes / 60);
  const selectedHour = selectedHour24 % 12 || 12;
  const selectedMinute = totalMinutes === null ? 0 : totalMinutes % 60;
  const selectedPeriod = selectedHour24 >= 12 ? 'PM' : 'AM';
  const displayedTime = totalMinutes === null
    ? 'Select time'
    : `${selectedHour}:${String(selectedMinute).padStart(2, '0')} ${selectedPeriod}`;

  // Close the popover when focus leaves it or the user clicks outside.
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
    const hour24 = (hour % 12) + (period === 'PM' ? 12 : 0);
    onChange(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };

  // Render the accessible hour, minute, and AM/PM controls.
  return (
    <div
      className="dashboard-time-picker"
      ref={pickerRef}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        type="button"
        className="dashboard-time-trigger"
        aria-label={`${label}: ${displayedTime}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <i className="ph ph-clock" aria-hidden="true"></i>
        <span className={totalMinutes === null ? 'is-placeholder' : ''}>{displayedTime}</span>
        <i className={`ph ph-caret-down dashboard-time-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true"></i>
      </button>
      {isOpen && (
        <div className="dashboard-time-popover" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <div className="dashboard-time-popover-header">
            <strong>Choose a time</strong>
            <span>12:00 AM–11:59 PM</span>
          </div>
          <div className="dashboard-time-selects">
            <label>
              <span>Hour</span>
              <select
                value={selectedHour}
                aria-label={`${label} hour`}
                onChange={(event) => updateTime(Number(event.target.value), selectedMinute, selectedPeriod)}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                  <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>
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
                {Array.from({ length: 60 }, (_, minute) => (
                  <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Period</span>
              <select
                value={selectedPeriod}
                aria-label={`${label} AM or PM`}
                onChange={(event) => updateTime(selectedHour, selectedMinute, event.target.value)}
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="dashboard-time-clear"
            onClick={() => {
              onChange('');
              setIsOpen(false);
            }}
          >
            Clear time
          </button>
        </div>
      )}
    </div>
  );
};

// Date, time, status, and quick-range filters for analytics dashboards.
const DashboardFilters = ({ filters, setFilters, setDatePreset }) => (
  <section className="dashboard-filters" aria-label="Dashboard filters">
    <div className="filter-heading">
      <div>
        <h2>Filter by Date</h2>
        <p>Filter reservation by event date, start time, and status.</p>
      </div>
      <button
        className="filter-reset"
        type="button"
        onClick={() => setFilters({
          startDate: '',
          endDate: '',
          startTime: '',
          endTime: '',
          status: 'all'
        })}
      >
        Reset filters
      </button>
    </div>
    <div className="filter-fields">
      <div className="dashboard-date-field">
        <label htmlFor="dashboard-filter-date-from">Date from</label>
        <DashboardDatePicker
          id="dashboard-filter-date-from"
          value={filters.startDate}
          max={filters.endDate}
          label="Date from"
          onChange={(date) => setFilters((current) => ({ ...current, startDate: date }))}
        />
      </div>
      <div className="dashboard-date-field">
        <label htmlFor="dashboard-filter-date-to">Date to</label>
        <DashboardDatePicker
          id="dashboard-filter-date-to"
          value={filters.endDate}
          min={filters.startDate}
          label="Date to"
          onChange={(date) => setFilters((current) => ({ ...current, endDate: date }))}
        />
      </div>
      <label>
        <span>Start time from</span>
        <DashboardTimePicker
          value={filters.startTime}
          label="Start time from"
          onChange={(time) => setFilters((current) => ({
            ...current,
            startTime: time
          }))}
        />
      </label>
      <label>
        <span>Start time to</span>
        <DashboardTimePicker
          value={filters.endTime}
          label="Start time to"
          onChange={(time) => setFilters((current) => ({
            ...current,
            endTime: time
          }))}
        />
      </label>
      <label>
        <span>Reservation status</span>
        <select
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
        </select>
      </label>
    </div>
    <div className="date-presets" aria-label="Quick date ranges">
      <span className="date-presets-label">Quick range</span>
      <div className="date-preset-group" aria-label="Past date ranges">
        <span>Last</span>
        {[7, 14, 30].map((days) => (
          <button type="button" key={`last-${days}`} onClick={() => setDatePreset(days, 'last')}>
            {days} days
          </button>
        ))}
      </div>
      <div className="date-preset-group" aria-label="Upcoming date ranges">
        <span>Next</span>
        {[7, 14, 30].map((days) => (
          <button type="button" key={`next-${days}`} onClick={() => setDatePreset(days, 'next')}>
            {days} days
          </button>
        ))}
      </div>
    </div>
  </section>
);

// Summary metrics shown to staff and administrators.
const DashboardKpis = ({
  metrics,
  pendingApprovals,
  pendingUsers,
  pendingProfiles,
  canManagePendingProfiles,
  isAdminDashboard,
  canReviewApprovals
}) => {
  const awaitingReviewCard = (
    <>
      <span className="kpi-label">Awaiting review</span>
      <strong>{metrics.pending}</strong>
      <span className="kpi-footnote">{pendingApprovals} assigned to your approval role</span>
    </>
  );

  return (
    <section
      className={`dashboard-kpis admin-dashboard-kpis${canManagePendingProfiles ? ' has-pending-profiles' : ''}`}
      aria-label="Key analytics"
    >
      <article className="kpi-card kpi-primary">
        <span className="kpi-label">Reservations in range</span>
        <strong>{metrics.total}</strong>
        <span className="kpi-footnote">Pending and approved across selected filters</span>
      </article>
      <article className="kpi-card">
        <span className="kpi-label">Approved reservation</span>
        <strong>{metrics.approved}</strong>
        <span className="kpi-footnote">{metrics.reservedUnits} equipment units requested</span>
      </article>
      {canReviewApprovals ? (
        <Link className="kpi-card kpi-card-link" to="/approval">
          {awaitingReviewCard}
        </Link>
      ) : (
        <article className="kpi-card">{awaitingReviewCard}</article>
      )}
      {isAdminDashboard && (
        <Link className="kpi-card kpi-card-link" to="/equipment">
          <span className="kpi-label">Available equipment</span>
          <strong>{metrics.availableUnits}</strong>
          <span className="kpi-footnote">Units available in current inventory</span>
        </Link>
      )}
      {isAdminDashboard && (
        <Link className="kpi-card kpi-card-link" to="/user?filter=pending">
          <span className="kpi-label">Pending users</span>
          <strong>{pendingUsers}</strong>
          <span className="kpi-footnote">View accounts with pending roles</span>
        </Link>
      )}
      {canManagePendingProfiles && (
        <Link className="kpi-card kpi-card-link" to="/user?filter=pending-profile">
          <span className="kpi-label">Pending profiles</span>
          <strong>{pendingProfiles}</strong>
          <span className="kpi-footnote">Review profile picture and cover changes</span>
        </Link>
      )}
    </section>
  );
};

const RankingModeToggle = ({ label, value, onChange }) => (
  <div className="ranking-mode-toggle" role="group" aria-label={`${label} ranking`}>
    <button type="button" aria-pressed={value === 'most'} onClick={() => onChange('most')}>Most</button>
    <button type="button" aria-pressed={value === 'least'} onClick={() => onChange('least')}>Least</button>
  </div>
);

// Restricted landing page for accounts awaiting review.
const PendingAccountDashboard = () => (
  <div className="mis-dashboard-content pending-account-dashboard">
    <header className="dashboard-header">
      <div className="dashboard-title">
        <span className="dashboard-eyebrow">Account status</span>
        <h1>Account review</h1>
      </div>
    </header>
    <section className="dashboard-panel pending-review-panel" aria-live="polite">
      <div className="pending-review-indicator" aria-hidden="true">!</div>
      <div>
        <h2>Account review in progress</h2>
        <p>Your current account is being reviewed. Kindly wait while we process and verify your account. Thank you!</p>
      </div>
    </section>
  </div>
);

const DashboardContent = ({ currentUserRole }) => {
  // Data, role, search, and filter state for the dashboard.
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardSearchQuery = searchParams.get('search') || '';
  const [reservationsData, setReservationsData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [utilitiesData, setUtilitiesData] = useState([]);
  const [facilitiesData, setFacilitiesData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [pendingProfilesData, setPendingProfilesData] = useState([]);
  const [unavailableDatesData, setUnavailableDatesData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [upcomingDays, setUpcomingDays] = useState('7');
  const [customUpcomingDays, setCustomUpcomingDays] = useState('30');
  const [resourceAlertCategory, setResourceAlertCategory] = useState('all');
  const [rankingModes, setRankingModes] = useState({
    equipment: 'most',
    utilities: 'most',
    facilities: 'most'
  });
  const [isSpecificRoomsOpen, setIsSpecificRoomsOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [reservationSearchFilters, setReservationSearchFilters] = useState({
    query: dashboardSearchQuery,
    status: 'all',
    source: 'all',
    startDate: '',
    endDate: '',
    sort: 'latest'
  });
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    status: 'all'
  });

  // Remove the search query from the URL when the search dialog closes.
  const closeDashboardSearch = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('search');
      return next;
    }, { replace: true });
  };

  // Track authentication before loading role-protected dashboard data.
  useEffect(() => {
    return auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
  }, []);

  // Subscribe to live reservations, inventory, users, and unavailable dates.
  useEffect(() => {
    if (!currentUser) return undefined;

    const unsubscribers = [
      onSnapshot(collection(db, 'reservations'), (snapshot) => {
        setReservationsData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      }, (error) => console.error('Failed to load reservations:', error)),
      onSnapshot(collection(db, 'equipments'), (snapshot) => {
        setEquipmentData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      }, (error) => console.error('Failed to load equipment:', error)),
      onSnapshot(collection(db, 'utilities'), (snapshot) => {
        setUtilitiesData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      }, (error) => console.error('Failed to load utilities:', error)),
      onSnapshot(collection(db, 'facilities'), (snapshot) => {
        setFacilitiesData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      }, (error) => console.error('Failed to load facilities:', error)),
      onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsersData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      }, (error) => console.error('Failed to load users:', error)),
      onSnapshot(collection(db, 'unavailableDates'), (snapshot) => {
        setUnavailableDatesData(snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        })));
      }, (error) => console.error('Failed to load unavailable dates:', error))
    ];

    const dashboardRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
    if (['building admin', 'mis', 'super admin'].includes(dashboardRole)) {
      unsubscribers.push(
        onSnapshot(collection(db, 'pending_profiles'), (snapshot) => {
          setPendingProfilesData(snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data()
          })));
        }, (error) => console.error('Failed to load pending profile requests:', error))
      );
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser, currentUserRole]);

  // Resolve the current user's role and role-specific dashboard permissions.
  const currentUserRecord = usersData.find(
    (user) => user.uid === currentUser?.uid
      || user.id === currentUser?.uid
      || user.email === currentUser?.email
  );
  const normalizedCurrentRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  const isSuperAdmin = normalizedCurrentRole === 'super admin';
  const approverRoleKey = isSuperAdmin
    ? 'super admin'
    : normalizeApprovalRoleKey(currentUserRecord?.role);
  const dashboardRole = (currentUserRole || approverRoleKey)
    .toLowerCase()
    .trim()
    .replace(/_/g, ' ');
  const isAdminDashboard = ['building admin', 'mis', 'mis admin', 'super admin'].includes(dashboardRole);
  const canViewResourceSnapshot = isAdminDashboard || dashboardRole === 'room checker';
  const canManagePendingProfiles = ['building admin', 'mis', 'super admin'].includes(dashboardRole);
  const isGeneralStaffDashboard = Boolean(dashboardRole)
    && !['requestor', 'user'].includes(dashboardRole)
    && !isAdminDashboard;
  const hasAnalyticsDashboard = isAdminDashboard || isGeneralStaffDashboard;
  const visibleUserCount = usersData.filter(
    (user) => {
      const role = (user.role || '').toLowerCase().trim().replace(/_/g, ' ');
      return role !== 'super admin';
    }
  ).length;
  const pendingUserCount = usersData.filter(
    (user) => (user.role || '').toLowerCase().trim().replace(/_/g, ' ') === 'pending'
      && user.emailVerified === true
  ).length;
  const pendingProfileCount = pendingProfilesData.length;

  // Load archived reservations for history and cross-source search.
  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    return onSnapshot(collection(db, 'archive'), (snapshot) => {
      setHistoryData(snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data()
      })));
    }, (error) => console.error('Failed to load reservation history:', error));
  }, [currentUser]);

  // Build role-aware approval queues and matching users for global search.
  const scheduleCount = currentUser
    ? reservationsData.filter(
      (reservation) => reservation.userId === currentUser.uid || reservation.userEmail === currentUser.email
    ).length
    : 0;

  const pendingApprovalReservations = useMemo(() => reservationsData.filter((reservation) => {
    if (!approverRoleKey) return false;

    const myRecord = reservation.approvals?.[approverRoleKey];
    const reservationStatus = (reservation.status || 'pending').toLowerCase().trim();
    if (!isSuperAdmin && (myRecord?.status === 'approved' || myRecord?.status === 'rejected')) return false;
    if (['rejected', 'approved', 'to modify'].includes(reservationStatus)) return false;

    if (!isSuperAdmin && APPROVAL_ROLE_HIERARCHY.indexOf(approverRoleKey) <= 0) return false;

    const requestor = usersData.find(
      (user) => user.email === reservation.userEmail || user.uid === reservation.userId
    ) || {};
    const requestorRole = (requestor.role || reservation.userRole || 'requestor').toLowerCase().trim();
    const isStaffRequestor = requestorRole !== 'requestor' && requestorRole !== 'user';
    const isRoomCheckerRequestor = normalizeApprovalRoleKey(requestorRole) === 'room checker';

    if (!isSuperAdmin && approverRoleKey === 'endorser') {
      if (isStaffRequestor || (!reservation.endorserName && !reservation.endorserEmail)) return false;
      if (!isReservationAssignedToEndorser(reservation, {
        email: currentUserRecord?.email || currentUser?.email,
        name: currentUserRecord?.name
      })) {
        return false;
      }
    }

    return isSuperAdmin || isApprovalStepReady(reservation.approvals, approverRoleKey, {
      hasEndorser: Boolean(reservation.endorserName),
      isStaffRequestor,
      isRoomCheckerRequestor,
      hasSpecificRoom: Boolean(reservation.specificRoom?.trim())
    });
  }).sort((first, second) => {
    const firstDate = parseDate(first.createdAt || first.eventDate)?.getTime() || 0;
    const secondDate = parseDate(second.createdAt || second.eventDate)?.getTime() || 0;
    return secondDate - firstDate;
  }), [reservationsData, usersData, approverRoleKey, currentUserRecord, currentUser?.email, isSuperAdmin]);
  const pendingApprovals = pendingApprovalReservations.length;
  const canReviewApprovals = isSuperAdmin || APPROVAL_ROLE_HIERARCHY.indexOf(approverRoleKey) > 0;
  const matchingUsers = useMemo(() => {
    const query = reservationSearchFilters.query.trim().toLowerCase();
    if (!query) return [];

    const normalizedPhoneQuery = query.replace(/\D/g, '');
    return usersData
      .filter((user) => {
        const role = (user.role || '').toLowerCase().trim().replace(/_/g, ' ');
        if (role === 'super admin' || (!isAdminDashboard && role === 'pending')) return false;
        const name = (user.name || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const phone = String(user.phone || '');
        return name.includes(query)
          || email.includes(query)
          || (normalizedPhoneQuery && phone.replace(/\D/g, '').includes(normalizedPhoneQuery));
      });
  }, [usersData, reservationSearchFilters.query, isAdminDashboard]);

  // Select approved events scheduled within the chosen upcoming window.
  const todayKey = toDateInputValue(new Date());
  const today = parseDate(todayKey);
  const weekAhead = today ? new Date(today) : null;
  const upcomingRangeDays = upcomingDays === 'custom'
    ? Math.min(365, Math.max(1, Number(customUpcomingDays) || 1))
    : Number(upcomingDays);
  if (weekAhead) {
    weekAhead.setDate(weekAhead.getDate() + upcomingRangeDays);
    weekAhead.setHours(23, 59, 59, 999);
  }

  const dashboardReservations = useMemo(() => {
    const activeReservationIds = new Set(reservationsData.map(({ id }) => id));
    const approvedArchivedReservations = historyData.filter((reservation) => (
      !activeReservationIds.has(reservation.id)
      && (reservation.status || '').toLowerCase().trim() === 'approved'
    ));
    return [...reservationsData, ...approvedArchivedReservations];
  }, [reservationsData, historyData]);

  const upcomingReservations = today && weekAhead
    ? dashboardReservations
      .map((reservation) => ({
        ...reservation,
        eventDateValue: parseDate(reservation.eventDate || reservation.date)
      }))
      .filter((reservation) => {
        const status = (reservation.status || 'pending').toLowerCase().trim();
        const isOwnedByUser = Boolean(currentUser && (
          reservation.userId === currentUser.uid
          || reservation.userEmail === currentUser.email
        ));
        return status === 'approved'
          && reservation.eventDateValue
          && reservation.eventDateValue >= today
          && reservation.eventDateValue <= weekAhead
          && (hasAnalyticsDashboard || isOwnedByUser);
      })
      .sort((first, second) => (
        first.eventDateValue - second.eventDateValue
        || (parseTime(first.startTime) ?? -1) - (parseTime(second.startTime) ?? -1)
      ))
      .slice(0, 6)
    : [];

  // Apply the main date, status, and start-time filters to active and approved archived reservations.
  const startMinutes = parseTime(filters.startTime);
  const endMinutes = parseTime(filters.endTime);
  const startDate = filters.startDate ? parseDate(filters.startDate) : null;
  const endDate = filters.endDate ? parseDate(filters.endDate) : null;

  const filteredReservations = useMemo(() => dashboardReservations.filter((reservation) => {
    const reservationDate = parseDate(reservation.eventDate || reservation.date);
    if (!reservationDate) return false;
    if (startDate && reservationDate < startDate) return false;
    if (endDate && reservationDate > new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999)) {
      return false;
    }

    const status = (reservation.status || 'Pending').toLowerCase();
    if (!['approved', 'pending'].includes(status)) return false;
    if (filters.status !== 'all' && status !== filters.status) return false;

    if (startMinutes !== null || endMinutes !== null) {
      const reservationStart = parseTime(reservation.startTime);
      if (reservationStart === null) return false;
      if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
        if (reservationStart < startMinutes && reservationStart > endMinutes) return false;
      } else {
        if (startMinutes !== null && reservationStart < startMinutes) return false;
        if (endMinutes !== null && reservationStart > endMinutes) return false;
      }
    }

    return true;
  }), [dashboardReservations, filters.status, startDate, endDate, startMinutes, endMinutes]);
  const countedReservations = useMemo(() => filteredReservations.filter((reservation) => (
    ['approved', 'pending'].includes((reservation.status || 'pending').toLowerCase().trim())
  )), [filteredReservations]);

  // Index inventory by ID to support fast lookups in calculations and search.
  const equipmentById = useMemo(
    () => new Map(equipmentData.map((equipment) => [equipment.id, equipment])),
    [equipmentData]
  );
  const utilitiesById = useMemo(
    () => new Map(utilitiesData.map((utility) => [utility.id, utility])),
    [utilitiesData]
  );
  const facilitiesById = useMemo(
    () => new Map(facilitiesData.map((facility) => [facility.id, facility])),
    [facilitiesData]
  );
  const specificRoomReservations = useMemo(() => [
    ...reservationsData.map((reservation) => ({ ...reservation, source: 'active' })),
    ...historyData.map((reservation) => ({ ...reservation, source: 'archived' }))
  ].flatMap((reservation) => {
    const specificRoom = typeof reservation.specificRoom === 'string'
      ? reservation.specificRoom.trim()
      : '';
    return specificRoom ? [{ ...reservation, specificRoom }] : [];
  }), [reservationsData, historyData]);
  // Combine and normalize active and archived reservations for global search.
  const searchableReservations = useMemo(() => {
    const activeRecords = reservationsData.map((reservation) => ({ ...reservation, source: 'active' }));
    const archivedRecords = historyData.map((reservation) => ({ ...reservation, source: 'archived' }));

    return [...activeRecords, ...archivedRecords].map((reservation) => {
      const requestor = usersData.find((user) => (
        user.uid === reservation.userId
        || user.id === reservation.userId
        || (reservation.userEmail && user.email?.toLowerCase() === reservation.userEmail.toLowerCase())
      )) || {};
      const facilityValues = (reservation.facilities || []).flatMap((id) => [
        id,
        facilitiesById.get(id)?.name || ''
      ]).concat(reservation.specificRoom || []);
      const equipmentValues = Object.entries(reservation.selectedEquip || {})
        .filter(([, quantity]) => Number(quantity) > 0)
        .flatMap(([id, quantity]) => [
          id,
          equipmentById.get(id)?.name || '',
          quantity
        ]);
      const utilityValues = (Array.isArray(reservation.selectedUtilities)
        ? reservation.selectedUtilities
        : []).flatMap((id) => [
        id,
        utilitiesById.get(id)?.name || '',
        reservation.selectedUtilityUnits?.[id] ?? 1
      ]);
      const eventDateValue = parseDate(reservation.eventDate || reservation.date);
      const startTimeValue = parseTime(reservation.startTime);
      const searchableText = [
        reservation.refNo,
        reservation.eventName,
        reservation.title,
        reservation.fullName,
        reservation.userEmail,
        reservation.userRole,
        requestor.name,
        requestor.email,
        requestor.role,
        requestor.department,
        reservation.endorserName,
        reservation.endorserEmail,
        reservation.eventDate,
        reservation.endDate,
        reservation.startTime,
        reservation.endTime,
        reservation.status,
        reservation.purpose,
        reservation.eventType,
        reservation.otherEquipment,
        reservation.otherUtility,
        ...facilityValues,
        ...equipmentValues,
        ...utilityValues,
        JSON.stringify(reservation)
      ].flat().filter(Boolean).join(' ').toLowerCase();

      return {
        ...reservation,
        requestor,
        eventDateValue,
        startTimeValue,
        searchableText
      };
    });
  }, [reservationsData, historyData, usersData, facilitiesById, equipmentById, utilitiesById]);

  // Filter and sort search results by text, status, source, and event date.
  const filteredSearchReservations = useMemo(() => {
    const searchText = reservationSearchFilters.query.trim().toLowerCase();
    const fromDate = reservationSearchFilters.startDate
      ? parseDate(reservationSearchFilters.startDate)
      : null;
    const throughDate = reservationSearchFilters.endDate
      ? parseDate(reservationSearchFilters.endDate)
      : null;

    return searchableReservations
      .filter((reservation) => {
        const status = (reservation.status || 'pending').toLowerCase();
        if (searchText && !reservation.searchableText.includes(searchText)) return false;
        if (reservationSearchFilters.status !== 'all' && status !== reservationSearchFilters.status) return false;
        if (reservationSearchFilters.source !== 'all' && reservation.source !== reservationSearchFilters.source) return false;
        if (fromDate && (!reservation.eventDateValue || reservation.eventDateValue < fromDate)) return false;
        if (throughDate && (
          !reservation.eventDateValue
          || reservation.eventDateValue > new Date(
            throughDate.getFullYear(),
            throughDate.getMonth(),
            throughDate.getDate(),
            23,
            59,
            59,
            999
          )
        )) return false;
        return true;
      })
      .sort((first, second) => {
        const firstDateTime = (first.eventDateValue?.getTime() || 0) + (first.startTimeValue ?? 0) * 60_000;
        const secondDateTime = (second.eventDateValue?.getTime() || 0) + (second.startTimeValue ?? 0) * 60_000;
        const direction = reservationSearchFilters.sort === 'latest' ? -1 : 1;
        return direction * (firstDateTime - secondDateTime);
      });
  }, [searchableReservations, reservationSearchFilters]);

  // Calculate remaining equipment and reservation totals for the selected range.
  const equipmentInventory = useMemo(() => equipmentData.map((equipment) => {
    const reserved = reservationsData.reduce((total, reservation) => {
      if (!isReservationActive(reservation)) return total;
      return total + (Number(reservation.selectedEquip?.[equipment.id]) || 0);
    }, 0);
    const total = Number(equipment.totalCount) || 0;
    const available = equipment.status === 'Unavailable' ? 0 : Math.max(0, total - reserved);
    return { ...equipment, total, reserved, available };
  }), [equipmentData, reservationsData]);

  const metrics = useMemo(() => {
    const approved = countedReservations.filter(
      (reservation) => (reservation.status || '').toLowerCase().trim() === 'approved'
    );
    const pending = countedReservations.filter(
      (reservation) => (reservation.status || 'pending').toLowerCase().trim() === 'pending'
    );
    const reservedUnits = approved.reduce((total, reservation) => (
      total + Object.values(reservation.selectedEquip || {}).reduce(
        (quantity, value) => quantity + (Number(value) || 0),
        0
      )
    ), 0);
    const availableUnits = equipmentInventory.reduce((total, equipment) => total + equipment.available, 0);

    return {
      total: countedReservations.length,
      approved: approved.length,
      pending: pending.length,
      reservedUnits,
      availableUnits
    };
  }, [countedReservations, equipmentInventory]);

  // Prepare recent bookings and the latest borrower/reservation per resource.
  const activity = useMemo(() => {
    const recentReservations = [...filteredReservations]
      .sort((first, second) => {
        const firstDate = parseDate(first.createdAt || first.eventDate)?.getTime() || 0;
        const secondDate = parseDate(second.createdAt || second.eventDate)?.getTime() || 0;
        return secondDate - firstDate;
      })
      .map((reservation) => {
        const facilityNames = (reservation.facilities || [])
          .map((id) => facilitiesById.get(id)?.name || id)
          .filter(Boolean);
        const equipmentNames = Object.entries(reservation.selectedEquip || {})
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([id, quantity]) => `${quantity} × ${equipmentById.get(id)?.name || 'Equipment'}`);
        if (typeof reservation.otherEquipment === 'string' && reservation.otherEquipment.trim()) {
          equipmentNames.push(reservation.otherEquipment.trim());
        }

        return {
          ...reservation,
          facilityNames,
          equipmentNames,
          eventDateValue: parseDate(reservation.eventDate || reservation.date)
        };
      });

    const lastBorrowedByEquipment = new Map();
    const lastReservedByUtility = new Map();
    const lastBorrowedByOtherEquipment = new Map();
    const lastReservedByOtherUtility = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        const reservationDate = parseDate(reservation.eventDate || reservation.date);
        if (!reservationDate) return;
        const borrower = reservation.fullName || reservation.userEmail || 'Unknown borrower';
        const startTime = reservation.startTime || '';
        Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
          if (Number(quantity) <= 0) return;
          const existing = lastBorrowedByEquipment.get(equipmentId);
          if (!existing || reservationDate > existing.date) {
            lastBorrowedByEquipment.set(equipmentId, {
              date: reservationDate,
              quantity: Number(quantity),
              borrower,
              startTime,
              reservation,
              ...getReservationAdditionalDetails(reservation)
            });
          }
        });
        const otherEquipment = getOtherRequestDetails(
          reservation,
          'otherEquipment',
          'otherEquipmentUnits'
        );
        if (otherEquipment) {
          const existing = lastBorrowedByOtherEquipment.get(otherEquipment.key);
          if (!existing || reservationDate > existing.date) {
            lastBorrowedByOtherEquipment.set(otherEquipment.key, {
              ...otherEquipment,
              date: reservationDate,
              borrower,
              startTime,
              reservation
            });
          }
        }
        (Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : [])
          .forEach((utilityId) => {
            const quantity = Number(reservation.selectedUtilityUnits?.[utilityId] ?? 1);
            if (!Number.isFinite(quantity) || quantity <= 0) return;
            const existing = lastReservedByUtility.get(utilityId);
            if (!existing || reservationDate > existing.date) {
              lastReservedByUtility.set(utilityId, {
                date: reservationDate,
                quantity,
                borrower: reservation.fullName || reservation.userEmail || 'Unknown requestor',
                startTime,
                reservation,
                ...getReservationAdditionalDetails(reservation)
              });
            }
          });
        const otherUtility = getOtherRequestDetails(
          reservation,
          'otherUtility',
          'otherUtilityUnits'
        );
        if (otherUtility) {
          const existing = lastReservedByOtherUtility.get(otherUtility.key);
          if (!existing || reservationDate > existing.date) {
            lastReservedByOtherUtility.set(otherUtility.key, {
              ...otherUtility,
              date: reservationDate,
              borrower: reservation.fullName || reservation.userEmail || 'Unknown requestor',
              startTime,
              reservation
            });
          }
        }
      });

    return {
      recentReservations,
      lastBorrowedByEquipment,
      lastReservedByUtility,
      lastBorrowedByOtherEquipment,
      lastReservedByOtherUtility
    };
  }, [filteredReservations, facilitiesById, equipmentById]);

  // Rank approved equipment, utility, and facility usage.
  const { most: usageByEquipment, least: leastUsedEquipment } = useMemo(() => {
    const totals = new Map();
    const otherRequests = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
          const amount = Number(quantity) || 0;
          totals.set(equipmentId, (totals.get(equipmentId) || 0) + amount);
        });
        const otherEquipment = getOtherRequestDetails(
          reservation,
          'otherEquipment',
          'otherEquipmentUnits'
        );
        if (otherEquipment) {
          const current = otherRequests.get(otherEquipment.key)
            || { name: otherEquipment.name, quantity: 0 };
          otherRequests.set(otherEquipment.key, {
            ...current,
            quantity: current.quantity + otherEquipment.quantity
          });
        }
      });

    const rankedUsage = equipmentData.map((equipment) => ({
      id: equipment.id,
      quantity: totals.get(equipment.id) || 0,
      name: equipment.name || 'Equipment',
      isOtherRequest: false
    })).concat(
      [...otherRequests.entries()].map(([id, value]) => ({
        id: `other-${id}`,
        ...value,
        isOtherRequest: true
      }))
    );

    return {
      most: [...rankedUsage].sort((first, second) => second.quantity - first.quantity),
      least: [...rankedUsage].sort((first, second) => first.quantity - second.quantity)
    };
  }, [filteredReservations, equipmentData]);

  const { most: utilityUsage, least: leastUsedUtilities } = useMemo(() => {
    const totals = new Map();
    const otherRequests = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        (Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : [])
          .forEach((utilityId) => {
            const quantity = Number(reservation.selectedUtilityUnits?.[utilityId] ?? 1);
            if (!Number.isFinite(quantity) || quantity <= 0) return;
            totals.set(utilityId, (totals.get(utilityId) || 0) + quantity);
          });
        const otherUtility = getOtherRequestDetails(
          reservation,
          'otherUtility',
          'otherUtilityUnits'
        );
        if (otherUtility) {
          const current = otherRequests.get(otherUtility.key)
            || { name: otherUtility.name, quantity: 0 };
          otherRequests.set(otherUtility.key, {
            ...current,
            quantity: current.quantity + otherUtility.quantity
          });
        }
      });

    const rankedUsage = utilitiesData.map((utility) => ({
      id: utility.id,
      quantity: totals.get(utility.id) || 0,
      name: utility.name || 'Utility',
      isOtherRequest: false
    })).concat(
      [...otherRequests.entries()].map(([id, value]) => ({
        id: `other-${id}`,
        ...value,
        isOtherRequest: true
      }))
    );

    return {
      most: [...rankedUsage].sort((first, second) => second.quantity - first.quantity),
      least: [...rankedUsage].sort((first, second) => first.quantity - second.quantity)
    };
  }, [filteredReservations, utilitiesData]);

  const { most: facilityUsage, least: leastUsedFacilities } = useMemo(() => {
    const totals = new Map();
    const specificRoomUsage = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        (reservation.facilities || []).forEach((facilityId) => {
          totals.set(facilityId, (totals.get(facilityId) || 0) + 1);
        });
        const specificRoom = typeof reservation.specificRoom === 'string'
          ? reservation.specificRoom.trim()
          : '';
        if (specificRoom) {
          const key = specificRoom.toLowerCase()
            .replace(/^room\s+(?=\d)/, '')
            .replace(/\s+/g, ' ');
          const current = specificRoomUsage.get(key) || { name: specificRoom, count: 0 };
          specificRoomUsage.set(key, { ...current, count: current.count + 1 });
        }
      });

    const rankedUsage = facilitiesData.map((facility) => ({
      id: facility.id,
      count: totals.get(facility.id) || 0,
      name: facility.name || 'Facility'
    })).concat(
      [...specificRoomUsage.entries()].map(([key, value]) => ({
        id: `specific-room-${key}`,
        name: `Specific room: ${value.name}`,
        count: value.count
      }))
    );

    return {
      most: [...rankedUsage].sort((first, second) => second.count - first.count),
      least: [...rankedUsage].sort((first, second) => first.count - second.count)
    };
  }, [filteredReservations, facilitiesData]);

  // Group filtered reservations into chart buckets and find resource alerts.
  const trendData = useMemo(() => {
    const from = startDate || endDate || new Date();
    const to = endDate || startDate || new Date();
    const firstDay = new Date(Math.min(from.getTime(), to.getTime()));
    firstDay.setHours(0, 0, 0, 0);
    const lastDay = new Date(Math.max(from.getTime(), to.getTime()));
    lastDay.setHours(0, 0, 0, 0);
    const dayCount = Math.max(1, Math.floor((lastDay - firstDay) / DAY_IN_MS) + 1);
    const bucketCount = Math.min(7, dayCount);
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(firstDay.getTime() + Math.floor(index * dayCount / bucketCount) * DAY_IN_MS);
      const bucketEnd = new Date(firstDay.getTime() + Math.floor((index + 1) * dayCount / bucketCount) * DAY_IN_MS);
      return {
        label: dayCount <= 7
          ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' })
          : bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        count: countedReservations.filter((reservation) => {
          const date = parseDate(reservation.eventDate || reservation.date);
          return date && date >= bucketStart && date < bucketEnd;
        }).length
      };
    });
    return buckets;
  }, [countedReservations, startDate, endDate]);

  const facilitiesAvailable = facilitiesData.filter((facility) => facility.status === 'Available').length;
  const facilitiesUnderMaintenance = facilitiesData.filter((facility) => facility.status === 'Maintenance').length;
  const facilitiesUnavailable = facilitiesData.filter((facility) => facility.status === 'Unavailable').length;
  const resourceAlerts = useMemo(() => {
    const alerts = [];
    const today = parseDate(todayKey);
    if (today) {
      unavailableDatesData
        .map((unavailableDate) => ({
          ...unavailableDate,
          dateValue: parseDate(unavailableDate.date || unavailableDate.id)
        }))
        .filter((unavailableDate) => (
          unavailableDate.dateValue
          && unavailableDate.dateValue >= today
        ))
        .sort((first, second) => first.dateValue - second.dateValue)
          .forEach((unavailableDate) => alerts.push({
          key: `unavailable-date-${unavailableDate.id}`,
          category: 'unavailable-date',
          title: formatDate(unavailableDate.dateValue),
          detail: `Unavailable · ${unavailableDate.remark?.trim() || 'No reason provided'}`,
          link: '/calendar'
        }));
    }

    alerts.push(...equipmentInventory
      .filter((equipment) => (
        equipment.total > 0
        && equipment.available <= Math.ceil(equipment.total * 0.2)
      ))
      .map((equipment) => ({
        key: `equipment-${equipment.id}`,
        category: 'low-stock',
        title: equipment.name || 'Unnamed equipment',
        detail: `${equipment.available} of ${equipment.total} units available`,
        link: '/equipment'
      })));

    facilitiesData
      .filter((facility) => ['maintenance', 'unavailable'].includes((facility.status || '').toLowerCase()))
      .forEach((facility) => alerts.push({
        key: `facility-${facility.id}`,
        category: 'facility-status',
        title: facility.name || 'Unnamed facility',
        detail: `Facility status: ${facility.status}`,
        link: '/facility'
      }));

    return alerts;
  }, [equipmentInventory, facilitiesData, unavailableDatesData, todayKey]);
  const resourceAlertCounts = useMemo(() => resourceAlerts.reduce((counts, alert) => {
    counts[alert.category] = (counts[alert.category] || 0) + 1;
    return counts;
  }, {}), [resourceAlerts]);
  const visibleResourceAlerts = resourceAlertCategory === 'all'
    ? resourceAlerts
    : resourceAlerts.filter((alert) => alert.category === resourceAlertCategory);
  // Calculate chart scales and quick date-range presets for the rendered panels.
  const chartMaximum = Math.max(1, ...trendData.map((bucket) => bucket.count));
  const equipmentRanking = rankingModes.equipment === 'most' ? usageByEquipment : leastUsedEquipment;
  const utilitiesRanking = rankingModes.utilities === 'most' ? utilityUsage : leastUsedUtilities;
  const facilitiesRanking = rankingModes.facilities === 'most' ? facilityUsage : leastUsedFacilities;
  const equipmentMaximum = Math.max(1, ...equipmentRanking.map((equipment) => equipment.quantity));
  const utilityMaximum = Math.max(1, ...utilitiesRanking.map((utility) => utility.quantity));
  const facilityMaximum = Math.max(1, ...facilitiesRanking.map((facility) => facility.count));
  const formatTime = (time) => time ? formatTimeForDisplay(time) : 'Time not set';
  const recentEquipmentActivity = [
    ...equipmentData.map((equipment) => ({
      ...equipment,
      lastBorrow: activity.lastBorrowedByEquipment.get(equipment.id),
      isOtherRequest: false
    })),
    ...[...activity.lastBorrowedByOtherEquipment.entries()].map(([key, lastBorrow]) => ({
      id: `other-${key}`,
      name: lastBorrow.name,
      lastBorrow,
      isOtherRequest: true
    }))
  ].sort((first, second) => (
    (second.lastBorrow?.date.getTime() || 0) - (first.lastBorrow?.date.getTime() || 0)
  )).slice(0, 6);
  const recentUtilityActivity = [
    ...utilitiesData.map((utility) => ({
      ...utility,
      lastReservation: activity.lastReservedByUtility.get(utility.id),
      isOtherRequest: false
    })),
    ...[...activity.lastReservedByOtherUtility.entries()].map(([key, lastReservation]) => ({
      id: `other-${key}`,
      name: lastReservation.name,
      lastReservation,
      isOtherRequest: true
    }))
  ].sort((first, second) => (
    (second.lastReservation?.date.getTime() || 0) - (first.lastReservation?.date.getTime() || 0)
  )).slice(0, 6);

  const setDatePreset = (days, direction) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = direction === 'next'
      ? today
      : new Date(today.getTime() - (days - 1) * DAY_IN_MS);
    const end = direction === 'next'
      ? new Date(today.getTime() + (days - 1) * DAY_IN_MS)
      : today;
    setFilters((current) => ({
      ...current,
      startDate: toDateInputValue(start),
      endDate: toDateInputValue(end)
    }));
  };

  // Render dashboard operations, search, analytics, and resource summaries.
  return (
    <div className={`mis-dashboard-content ${isAdminDashboard ? 'admin-dashboard' : hasAnalyticsDashboard ? 'staff-dashboard' : 'personal-dashboard'}${dashboardRole === 'room checker' ? ' room-checker-dashboard' : ''}`}>
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>{isAdminDashboard ? 'Admin dashboard' : 'Dashboard'}</h1>
        </div>
      </header>

      {/* Operations include date filters, key metrics, approval queues, and upcoming events. */}
      <section className="dashboard-operations" aria-label="Dashboard operations">
        {hasAnalyticsDashboard && (
          <DashboardFilters
            filters={filters}
            setFilters={setFilters}
            setDatePreset={setDatePreset}
          />
        )}
        {hasAnalyticsDashboard && (
          <DashboardKpis
            metrics={metrics}
            pendingApprovals={pendingApprovals}
            pendingUsers={pendingUserCount}
            pendingProfiles={pendingProfileCount}
            canManagePendingProfiles={canManagePendingProfiles}
            isAdminDashboard={isAdminDashboard}
            canReviewApprovals={canReviewApprovals}
          />
        )}

        <article className="dashboard-panel operations-panel approval-panel">
          <div className="panel-heading">
            <div>
              <h2>{hasAnalyticsDashboard ? 'Approval' : 'Requests needing your review'}</h2>
              <p>Reservations currently waiting for your approval.</p>
            </div>
            {canReviewApprovals && (
              <Link className="panel-action-link" to="/approval">Open Approval</Link>
            )}
          </div>
          {pendingApprovalReservations.length ? (
            <div className="operations-list">
              {pendingApprovalReservations.slice(0, 5).map((reservation) => (
                <button
                  className="operation-row operation-row-button"
                  key={reservation.id}
                  type="button"
                  onClick={() => setSelectedReservation({ data: reservation, source: 'active' })}
                >
                  <div className="operation-row-main">
                    <strong>{reservation.eventName || 'Untitled reservation'}</strong>
                    <span>{reservation.fullName || reservation.userEmail || 'Unknown requestor'}</span>
                  </div>
                  <div className="operation-row-meta">
                    <span className="operation-row-date">
                      {formatDate(parseDate(reservation.eventDate || reservation.date))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="panel-empty">
              {canReviewApprovals ? 'No reservations are waiting for your approval.' : 'No approval queue is assigned to your role.'}
            </p>
          )}
        </article>

        <article className="dashboard-panel operations-panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <h2>{hasAnalyticsDashboard ? 'Upcoming Events' : 'Your Upcoming Events'}</h2>
              <p>Events scheduled within your selected date range.</p>
            </div>
            <label className="upcoming-range-control">
              <span>Show next</span>
              <select value={upcomingDays} onChange={(event) => setUpcomingDays(event.target.value)}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>
          {upcomingDays === 'custom' && (
            <label className="custom-upcoming-days">
              Number of days
              <input
                type="number"
                min="1"
                max="365"
                value={customUpcomingDays}
                onChange={(event) => setCustomUpcomingDays(event.target.value)}
              />
            </label>
          )}
          {upcomingReservations.length ? (
            <div className="operations-list">
              {upcomingReservations.map((reservation) => (
                <button
                  className="operation-row operation-row-button"
                  key={reservation.id}
                  type="button"
                  onClick={() => setSelectedReservation({ data: reservation, source: 'active' })}
                >
                  <div className="operation-row-main">
                    <strong>{reservation.eventName || 'Untitled reservation'}</strong>
                    <span>
                      {hasAnalyticsDashboard
                        ? (reservation.fullName || reservation.userEmail || 'Unknown requestor')
                        : (reservation.facilities || []).map((id) => facilitiesById.get(id)?.name || id).join(', ') || 'No facility listed'}
                    </span>
                  </div>
                  <div className="operation-row-meta">
                    <span className={`reservation-status ${getStatusClass(reservation.status)}`}>
                      {reservation.status || 'Pending'}
                    </span>
                    <span className="operation-row-date">
                      {formatDate(reservation.eventDateValue)} · {formatTime(reservation.startTime)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="panel-empty">
              {hasAnalyticsDashboard
                ? `No events are scheduled in the next ${upcomingRangeDays} days.`
                : `You have no events scheduled in the next ${upcomingRangeDays} days.`}
            </p>
          )}
        </article>

        {isAdminDashboard && (
          <article className="dashboard-panel resource-alerts-panel">
            <div className="panel-heading">
              <div>
                <h2>Resource alerts</h2>
                <p>Low stock, facility status, and upcoming unavailable dates.</p>
              </div>
              <label className="resource-alert-filter">
                <span>Category</span>
                <select
                  value={resourceAlertCategory}
                  onChange={(event) => setResourceAlertCategory(event.target.value)}
                >
                  <option value="all">All categories ({resourceAlerts.length})</option>
                  <option value="low-stock">Low stock ({resourceAlertCounts['low-stock'] || 0})</option>
                  <option value="facility-status">Facility status ({resourceAlertCounts['facility-status'] || 0})</option>
                  <option value="unavailable-date">Unavailable dates ({resourceAlertCounts['unavailable-date'] || 0})</option>
                </select>
              </label>
            </div>
            {visibleResourceAlerts.length ? (
              <div className="resource-alert-list" aria-live="polite">
                {visibleResourceAlerts.map((alert) => (
                  <div className="resource-alert-row" key={alert.key}>
                    <span className="resource-alert-icon">!</span>
                    <div>
                      <strong>{alert.title}</strong>
                      <span title={alert.detail}>{alert.detail}</span>
                    </div>
                    <div className="resource-alert-actions">
                      <span className="resource-alert-category">
                        {alert.category === 'low-stock' && 'Low stock'}
                        {alert.category === 'facility-status' && 'Facility status'}
                        {alert.category === 'unavailable-date' && 'Unavailable date'}
                      </span>
                      <Link to={alert.link}>View</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-empty">
                {resourceAlerts.length
                  ? 'No alerts in this category.'
                  : 'No low-stock items, facility issues, or upcoming unavailable dates were detected.'}
              </p>
            )}
          </article>
        )}

          {/* Global search covers active and archived reservations and admin user matches. */}
          {dashboardSearchQuery && (
            <div
              className="dashboard-search-modal-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDashboardSearch();
              }}
            >
              <section
                className="dashboard-search-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashboard-search-title"
              >
                <button
                  type="button"
                  className="dashboard-search-modal-close"
                  aria-label="Close dashboard search"
                  onClick={closeDashboardSearch}
                >
                  ×
                </button>
                <div className="dashboard-panel reservation-search-panel">
            <div className="panel-heading">
              <div>
                <h2 id="dashboard-search-title">Search</h2>
                <p>Search active and archived records by reference, event, people, date, time, facility, or equipment.</p>
              </div>
              <span className="panel-total">
                {isAdminDashboard
                  ? `${matchingUsers.length} users · ${filteredSearchReservations.length} reservations`
                  : `${filteredSearchReservations.length} results`}
              </span>
            </div>
            <div className="reservation-search-fields">
              <label className="reservation-search-query">
                <span>{isAdminDashboard ? 'Search users and reservations' : 'Search all reservation details'}</span>
                <input
                  type="search"
                  placeholder={isAdminDashboard
                    ? 'Name, email, phone, reference, facility, equipment...'
                    : 'Reference, name, facility, equipment, etc...'}
                  value={reservationSearchFilters.query}
                  onChange={(event) => setReservationSearchFilters((current) => ({
                    ...current,
                    query: event.target.value
                  }))}
                />
              </label>
              <label className="reservation-search-status">
                <span>Status</span>
                <select
                  value={reservationSearchFilters.status}
                  onChange={(event) => setReservationSearchFilters((current) => ({
                    ...current,
                    status: event.target.value
                  }))}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label className="reservation-search-source">
                <span>Record source</span>
                <select
                  value={reservationSearchFilters.source}
                  onChange={(event) => setReservationSearchFilters((current) => ({
                    ...current,
                    source: event.target.value
                  }))}
                >
                  <option value="all">Active and archived</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="reservation-search-date-from">
                <span>Event date from</span>
                <input
                  type="date"
                  inputMode="none"
                  value={reservationSearchFilters.startDate}
                  max={reservationSearchFilters.endDate || undefined}
                  onChange={(event) => setReservationSearchFilters((current) => ({
                    ...current,
                    startDate: event.target.value
                  }))}
                />
              </label>
              <label className="reservation-search-date-to">
                <span>Event date to</span>
                <input
                  type="date"
                  inputMode="none"
                  value={reservationSearchFilters.endDate}
                  min={reservationSearchFilters.startDate || undefined}
                  onChange={(event) => setReservationSearchFilters((current) => ({
                    ...current,
                    endDate: event.target.value
                  }))}
                />
              </label>
              <label className="reservation-search-sort">
                <span>Sort by event date</span>
                <select
                  value={reservationSearchFilters.sort}
                  onChange={(event) => setReservationSearchFilters((current) => ({
                    ...current,
                    sort: event.target.value
                  }))}
                >
                  <option value="latest">Latest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>
            <button
              className="filter-reset reservation-search-reset"
              type="button"
              onClick={() => {
                setReservationSearchFilters({
                  query: '',
                  status: 'all',
                  source: 'all',
                  startDate: '',
                  endDate: '',
                  sort: 'latest'
                });
              }}
            >
              Clear search and filters
            </button>
            {/* Admin-only user matches are separate from reservation search results. */}
            {isAdminDashboard && reservationSearchFilters.query.trim() && (
              <section className="reservation-search-user-results" aria-label="Matching users">
                <div className="reservation-search-subheading">
                  <h3>Users</h3>
                  <span>{matchingUsers.length} matches</span>
                </div>
                {matchingUsers.length ? (
                  <div className="user-search-results">
                    {matchingUsers.map((user) => (
                      <Link
                        className="user-search-result"
                        key={user.id}
                        to={`/account?userId=${encodeURIComponent(user.id)}`}
                      >
                        <span className="user-search-avatar">
                          {user.avatarUrl
                            ? <img src={user.avatarUrl} alt="" />
                            : (user.name || user.email || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="user-search-result-copy">
                          <strong>{user.name || 'Unnamed user'}</strong>
                          <span>{user.email || 'No email listed'}</span>
                        </span>
                        <span className="user-search-result-meta">
                          <span>{user.phone || 'No phone listed'}</span>
                          <span>{(user.role || 'requestor').replace(/_/g, ' ')}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="panel-empty">No users match that name, email, or phone number.</p>
                )}
              </section>
            )}
            <div className="reservation-search-subheading">
              <h3>Reservations</h3>
              <span>{filteredSearchReservations.length} matches</span>
            </div>
            {/* Open a selected result in the reservation details dialog. */}
            {filteredSearchReservations.length ? (
              <div className="reservation-search-results">
                {filteredSearchReservations.map((reservation) => {
                  const facilityNames = (reservation.facilities || [])
                    .map((id) => facilitiesById.get(id)?.name || id);
                  if (reservation.specificRoom) facilityNames.push(`Room: ${reservation.specificRoom}`);
                  const equipmentNames = Object.entries(reservation.selectedEquip || {})
                    .filter(([, quantity]) => Number(quantity) > 0)
                    .map(([id, quantity]) => `${quantity} × ${equipmentById.get(id)?.name || id}`);
                  if (typeof reservation.otherEquipment === 'string' && reservation.otherEquipment.trim()) {
                    equipmentNames.push(reservation.otherEquipment.trim());
                  }
                  const utilityNames = (Array.isArray(reservation.selectedUtilities)
                    ? reservation.selectedUtilities
                    : []).map((id) => {
                    const quantity = Number(reservation.selectedUtilityUnits?.[id] ?? 1);
                    return `${quantity} × ${utilitiesById.get(id)?.name || id}`;
                  });
                  if (typeof reservation.otherUtility === 'string' && reservation.otherUtility.trim()) {
                    utilityNames.push(reservation.otherUtility.trim());
                  }

                  return (
                    <button
                      className="reservation-search-result"
                      key={`${reservation.source}-${reservation.id}`}
                      type="button"
                      onClick={() => setSelectedReservation({
                        data: reservation,
                        source: reservation.source
                      })}
                    >
                      <span className={`reservation-source-badge ${reservation.source}`}>
                        {reservation.source === 'active' ? 'Active' : 'Archived'}
                      </span>
                      <span className="reservation-search-result-main">
                        <strong>{reservation.eventName || reservation.title || 'Untitled reservation'}</strong>
                        <span>
                          {reservation.refNo || 'No reference'}
                          {' · '}{reservation.fullName || reservation.userEmail || 'Unknown user'}
                        </span>
                        <span>
                          {reservation.eventDateValue ? formatDate(reservation.eventDateValue) : 'Date unavailable'}
                          {' · '}{formatTime(reservation.startTime)}
                          {' · '}{facilityNames.join(', ') || 'No facility'}
                        </span>
                        <span>{equipmentNames.join(', ') || 'No equipment listed'}</span>
                        <span>{utilityNames.join(', ') || 'No utilities listed'}</span>
                      </span>
                      <span className={`reservation-status ${getStatusClass(reservation.status)}`}>
                        {reservation.status || 'Pending'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="panel-empty">No reservations match the current search and filters.</p>
            )}
                </div>
              </section>
            </div>
          )}
      </section>

      {hasAnalyticsDashboard ? (
        <>
          {/* Summarize reservation trends and current resource availability. */}
          <section className="dashboard-charts">
            <article className="dashboard-panel reservations-trend-panel">
              <div className="panel-heading">
                <div>
                  <h2>Reservation activity</h2>
                  <p>Pending and approved reservations matching the selected filters.</p>
                </div>
                <span className="panel-total">{metrics.total} total</span>
              </div>
              <div className="trend-chart-scroll" tabIndex={0} aria-label="Scroll to view reservation activity by date">
                <div className="trend-chart" role="img" aria-label="Reservations by date">
                  {trendData.map((bucket, index) => (
                    <div className="trend-column" key={`${bucket.label}-${index}`}>
                      <span className="trend-value">{bucket.count}</span>
                      <div className="trend-bar-track">
                        <div
                          className="trend-bar"
                          style={{ height: `${Math.max(bucket.count ? 9 : 3, bucket.count / chartMaximum * 100)}%` }}
                        />
                      </div>
                      <span className="trend-label">{bucket.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="status-breakdown">
                <span><i className="status-key approved" /> Approved <strong>{metrics.approved}</strong></span>
                <span><i className="status-key pending" /> Pending <strong>{metrics.pending}</strong></span>
              </div>
            </article>

            {canViewResourceSnapshot && (
            <article className="dashboard-panel resource-summary-panel">
              <div className="panel-heading">
                <div>
                  <h2>Resource snapshot</h2>
                  <p>Current state of managed facilities, equipment, and utilities.</p>
                </div>
              </div>
              <div className="resource-stat">
                <div className="resource-stat-copy">
                  <span>Equipment catalog</span>
                  <strong>{equipmentData.length} <small>items</small></strong>
                </div>
                <span className="resource-stat-detail">{metrics.availableUnits} available units</span>
              </div>
              <div className="resource-stat">
                <div className="resource-stat-copy">
                  <span>Utility catalog</span>
                  <strong>{utilitiesData.length} <small>utilities</small></strong>
                </div>
                <span className="resource-stat-detail">Managed utility items</span>
              </div>
              <div className="resource-stat">
                <div className="resource-stat-copy">
                  <span>Facility directory</span>
                  <strong>{facilitiesData.length} <small>facilities</small></strong>
                </div>
                <span className="resource-stat-detail">{facilitiesAvailable} available now</span>
              </div>
              <div className="resource-stat">
                <div className="resource-stat-copy">
                  <span>Specific rooms</span>
                  <strong>{specificRoomReservations.length} <small>requests</small></strong>
                </div>
                <button
                  type="button"
                  className="resource-stat-detail specific-room-view-button"
                  onClick={() => setIsSpecificRoomsOpen(true)}
                  aria-haspopup="dialog"
                >
                  View details
                </button>
              </div>
              <div className="facility-status-summary">
                <span><i className="status-key approved" /> Available <strong>{facilitiesAvailable}</strong></span>
                <span><i className="status-key pending" /> Maintenance <strong>{facilitiesUnderMaintenance}</strong></span>
                <span><i className="status-key rejected" /> Unavailable <strong>{facilitiesUnavailable}</strong></span>
              </div>
              <p className="snapshot-note">{visibleUserCount} registered users in the system</p>
            </article>
            )}
          </section>

          {/* Rank requested resources for the selected period. */}
          {hasAnalyticsDashboard && (
          <section className="dashboard-insights">
            <article className="dashboard-panel ranking-panel">
              <div className="panel-heading">
                <div>
                  <h2>{rankingModes.equipment === 'most' ? 'Most' : 'Least'} Requested Equipment</h2>
                  <p>Approved equipment units and other equipment requests in the selected period{rankingModes.equipment === 'least' ? ', including items with no requests' : ''}.</p>
                </div>
                <RankingModeToggle
                  label="Equipment"
                  value={rankingModes.equipment}
                  onChange={(value) => setRankingModes((current) => ({ ...current, equipment: value }))}
                />
              </div>
              {equipmentRanking.length ? (
                <div className="ranking-list" tabIndex={0} aria-label="Equipment request rankings">
                  {equipmentRanking.map((equipment, index) => (
                    <div className="ranking-row" key={equipment.id}>
                      <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                      <span
                        className="ranking-name"
                        title={equipment.isOtherRequest ? `Other equipment: ${equipment.name}` : equipment.name}
                      >
                        {equipment.isOtherRequest ? `Other: ${equipment.name}` : equipment.name}
                      </span>
                      <div className="ranking-track">
                        <span style={{ width: `${equipment.quantity / equipmentMaximum * 100}%` }} />
                      </div>
                      <strong>{equipment.quantity}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-empty">No approved equipment requests match these filters.</p>
              )}
            </article>

            <article className="dashboard-panel ranking-panel">
              <div className="panel-heading">
                <div>
                  <h2>{rankingModes.utilities === 'most' ? 'Most' : 'Least'} Requested Utilities</h2>
                  <p>Approved utility units and other utility requests in the selected period{rankingModes.utilities === 'least' ? ', including items with no requests' : ''}.</p>
                </div>
                <RankingModeToggle
                  label="Utilities"
                  value={rankingModes.utilities}
                  onChange={(value) => setRankingModes((current) => ({ ...current, utilities: value }))}
                />
              </div>
              {utilitiesRanking.length ? (
                <div className="ranking-list" tabIndex={0} aria-label="Utility request rankings">
                  {utilitiesRanking.map((utility, index) => (
                    <div className="ranking-row" key={utility.id}>
                      <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                      <span
                        className="ranking-name"
                        title={utility.isOtherRequest ? `Other utility: ${utility.name}` : utility.name}
                      >
                        {utility.isOtherRequest ? `Other: ${utility.name}` : utility.name}
                      </span>
                      <div className="ranking-track utility-track">
                        <span style={{ width: `${utility.quantity / utilityMaximum * 100}%` }} />
                      </div>
                      <strong>{utility.quantity}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-empty">No approved utility requests match these filters.</p>
              )}
            </article>

            <article className="dashboard-panel ranking-panel">
              <div className="panel-heading">
                <div>
                  <h2>{rankingModes.facilities === 'most' ? 'Most' : 'Least'} Requested Facilities</h2>
                  <p>Approved facility and specific room reservations in the selected period{rankingModes.facilities === 'least' ? ', including facilities with no bookings' : ''}.</p>
                </div>
                <RankingModeToggle
                  label="Facilities"
                  value={rankingModes.facilities}
                  onChange={(value) => setRankingModes((current) => ({ ...current, facilities: value }))}
                />
              </div>
              {facilitiesRanking.length ? (
                <div className="ranking-list" tabIndex={0} aria-label="Facility request rankings">
                  {facilitiesRanking.map((facility, index) => (
                    <div className="ranking-row" key={facility.id}>
                      <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                      <span className="ranking-name" title={facility.name}>{facility.name}</span>
                      <div className="ranking-track facility-track">
                        <span style={{ width: `${facility.count / facilityMaximum * 100}%` }} />
                      </div>
                      <strong>{facility.count}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="panel-empty">No approved facility bookings match these filters.</p>
              )}
            </article>
          </section>
          )}

          {/* Show the latest approved equipment and utility activity. */}
          <section className="dashboard-lower">
            {isAdminDashboard && (
            <article className="dashboard-panel equipment-history-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent Approved Equipment</h2>
                  <p>Most recent approved booking for each equipment item and other request in range.</p>
                </div>
              </div>
              {recentEquipmentActivity.length ? (
                <div className="equipment-history-list">
                  {recentEquipmentActivity.map((equipment) => {
                    const Row = equipment.lastBorrow?.reservation ? 'button' : 'div';
                    return (
                      <Row
                        className={`equipment-history-row${equipment.lastBorrow?.reservation ? ' equipment-history-row-clickable' : ''}`}
                        key={equipment.id}
                        {...(equipment.lastBorrow?.reservation ? {
                          type: 'button',
                          'aria-label': `View reservation details for ${equipment.name}, booked by ${equipment.lastBorrow.borrower}`,
                          onClick: () => setSelectedReservation({
                            data: equipment.lastBorrow.reservation,
                            source: 'active'
                          })
                        } : {})}
                      >
                        <div className="equipment-initial">{(equipment.name || 'E').slice(0, 1).toUpperCase()}</div>
                        <div className="equipment-history-name">
                          <strong>{equipment.name || 'Unnamed equipment'}</strong>
                          <span className="equipment-history-sku">
                            {equipment.isOtherRequest ? 'Other request' : equipment.sku || 'No SKU'}
                          </span>
                        </div>
                        {equipment.lastBorrow ? (
                          <div className="equipment-history-borrow">
                            <strong>{equipment.lastBorrow.borrower}</strong>
                            <div className="equipment-history-meta">
                              <span>
                                {formatDate(equipment.lastBorrow.date)}
                                {equipment.lastBorrow.startTime ? ` · ${formatTime(equipment.lastBorrow.startTime)}` : ''}
                              </span>
                              <span className="equipment-quantity">
                                {equipment.lastBorrow.quantity} unit{equipment.lastBorrow.quantity === 1 ? '' : 's'}
                              </span>
                            </div>
                            {(equipment.lastBorrow.otherEquipment
                              || equipment.lastBorrow.otherUtility
                              || equipment.lastBorrow.specificRoom) && (
                              <div className="equipment-history-request-details">
                                {equipment.lastBorrow.otherEquipment && (
                                  <span><strong>Other equipment:</strong> {equipment.lastBorrow.otherEquipment}</span>
                                )}
                                {equipment.lastBorrow.otherUtility && (
                                  <span><strong>Other utility:</strong> {equipment.lastBorrow.otherUtility}</span>
                                )}
                                {equipment.lastBorrow.specificRoom && (
                                  <span><strong>Specific room number/name:</strong> {equipment.lastBorrow.specificRoom}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="equipment-history-borrow no-history">
                            <strong>No recent booking</strong>
                            <span>Nothing approved in this date range</span>
                          </div>
                        )}
                      </Row>
                    );
                  })}
                </div>
              ) : (
                <p className="panel-empty">No approved equipment requests match these filters.</p>
              )}
            </article>
            )}

            {hasAnalyticsDashboard && (
              <article className="dashboard-panel equipment-history-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent Approved Utilities</h2>
                    <p>Most recent approved booking for each utility and other request in range.</p>
                  </div>
                </div>
                  {recentUtilityActivity.length ? (
                    <div className="equipment-history-list">
                      {recentUtilityActivity.map((utility) => {
                        const Row = utility.lastReservation?.reservation ? 'button' : 'div';
                        return (
                          <Row
                            className={`equipment-history-row${utility.lastReservation?.reservation ? ' equipment-history-row-clickable' : ''}`}
                            key={utility.id}
                            {...(utility.lastReservation?.reservation ? {
                              type: 'button',
                              'aria-label': `View reservation details for ${utility.name}, booked by ${utility.lastReservation.borrower}`,
                              onClick: () => setSelectedReservation({
                                data: utility.lastReservation.reservation,
                                source: 'active'
                              })
                            } : {})}
                          >
                            <div className="equipment-initial">{(utility.name || 'U').slice(0, 1).toUpperCase()}</div>
                            <div className="equipment-history-name">
                              <strong>{utility.name || 'Unnamed utility'}</strong>
                              <span className="equipment-history-sku">
                                {utility.isOtherRequest ? 'Other request' : utility.sku || 'No SKU'}
                              </span>
                          </div>
                          {utility.lastReservation ? (
                            <div className="equipment-history-borrow">
                              <strong>{utility.lastReservation.borrower}</strong>
                              <div className="equipment-history-meta">
                                <span>
                                  {formatDate(utility.lastReservation.date)}
                                  {utility.lastReservation.startTime ? ` · ${formatTime(utility.lastReservation.startTime)}` : ''}
                                </span>
                                <span className="equipment-quantity">
                                  {utility.lastReservation.quantity} unit{utility.lastReservation.quantity === 1 ? '' : 's'}
                                </span>
                              </div>
                              {(utility.lastReservation.otherEquipment
                                || utility.lastReservation.otherUtility
                                || utility.lastReservation.specificRoom) && (
                                <div className="equipment-history-request-details">
                                  {utility.lastReservation.otherEquipment && (
                                    <span><strong>Other equipment:</strong> {utility.lastReservation.otherEquipment}</span>
                                  )}
                                  {utility.lastReservation.otherUtility && (
                                    <span><strong>Other utility:</strong> {utility.lastReservation.otherUtility}</span>
                                  )}
                                  {utility.lastReservation.specificRoom && (
                                    <span><strong>Specific room number/name:</strong> {utility.lastReservation.specificRoom}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="equipment-history-borrow no-history">
                              <strong>No recent booking</strong>
                              <span>Nothing approved in this date range</span>
                            </div>
                          )}
                        </Row>
                        );
                      })}
                  </div>
                ) : (
                  <p className="panel-empty">No approved utility requests match these filters.</p>
                )}
              </article>
            )}

            {/* List matching reservations with requestor, schedule, and resource details. */}
            <article className="dashboard-panel recent-activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Matched reservations</h2>
                  <p>All requests matching your filters.</p>
                </div>
              </div>
              {activity.recentReservations.length ? (
                <div className="recent-reservations-list">
                  {activity.recentReservations.map((reservation) => {
                    const participantCount = reservation.specificRoomParticipants || reservation.expectedParticipants;
                    const roomAndParticipants = [
                      reservation.specificRoom,
                      participantCount ? `${participantCount} participants` : ''
                    ].filter(Boolean).join(' · ');

                    return (
                      <button
                        className="recent-reservation"
                        key={reservation.id}
                        type="button"
                        onClick={() => setSelectedReservation({ data: reservation, source: 'active' })}
                      >
                        <div className={`reservation-status-dot ${getStatusClass(reservation.status)}`} />
                        <div className="recent-reservation-main">
                          <div className="recent-reservation-title">
                            <strong>{reservation.eventName || 'Untitled reservation'}</strong>
                            <span className={`reservation-status ${getStatusClass(reservation.status)}`}>
                              {reservation.status || 'Pending'}
                            </span>
                          </div>
                          <span className="recent-reservation-requestor">
                            {reservation.fullName || reservation.userEmail || 'Unknown requestor'}
                          </span>
                          <span className="recent-reservation-meta">
                            {reservation.eventDateValue ? formatDate(reservation.eventDateValue) : 'Date unavailable'}
                            {' · '}{formatTime(reservation.startTime)}
                          </span>
                          {(reservation.facilityNames.length > 0 || reservation.equipmentNames.length > 0) && (
                            <span className="recent-reservation-resources">
                              {[...reservation.facilityNames, ...reservation.equipmentNames].slice(0, 2).join(' · ')}
                            </span>
                          )}
                          {roomAndParticipants && (
                            <span className="recent-reservation-resources">{roomAndParticipants}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="panel-empty">No reservations match this date, time, and status selection.</p>
              )}
            </article>
          </section>
        </>
      ) : (
        <section className="dashboard-kpis personal-kpis" aria-label="Dashboard summary">
          <article className="kpi-card">
            <span className="kpi-label">Your reservations</span>
            <strong>{scheduleCount}</strong>
            <span className="kpi-footnote">All reservations submitted by you</span>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Pending approvals</span>
            <strong>{pendingApprovals}</strong>
            <span className="kpi-footnote">Requests awaiting your review</span>
          </article>
        </section>
      )}

      {/* Display the selected active or archived reservation in a lazy-loaded dialog. */}
      {isSpecificRoomsOpen && (
        <div
          className="specific-rooms-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSpecificRoomsOpen(false);
          }}
        >
          <section
            className="specific-rooms-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="specific-rooms-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="specific-rooms-title">Specific room requests</h2>
                <p>Click a request to view its reservation details.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close specific room requests"
                onClick={() => setIsSpecificRoomsOpen(false)}
              >
                ×
              </button>
            </div>
            {specificRoomReservations.length ? (
              <div className="specific-rooms-list">
                {specificRoomReservations.map((reservation) => {
                  const participantCount = Number(
                    reservation.specificRoomParticipants ?? reservation.expectedParticipants
                  );
                  const startDate = parseDate(reservation.eventDate || reservation.date);
                  const savedEndDate = parseDate(reservation.endDate);
                  const endDate = savedEndDate || (startDate ? new Date(startDate.getTime()) : null);
                  if (!savedEndDate && endDate) {
                    endDate.setDate(endDate.getDate() + Math.max(0, (Number(reservation.days) || 1) - 1));
                  }
                  const status = (reservation.status || 'Unknown').trim();
                  const statusClass = status.toLowerCase().replace(/\s+/g, '-');
                  return (
                    <button
                      className="specific-room-request"
                      key={`${reservation.source}-${reservation.id}`}
                      type="button"
                      onClick={() => {
                        setIsSpecificRoomsOpen(false);
                        setSelectedReservation({
                          data: reservation,
                          source: reservation.source
                        });
                      }}
                    >
                      <span className="specific-room-request-copy">
                        <strong>{reservation.specificRoom}</strong>
                        <span>{reservation.eventName || reservation.title || 'Untitled reservation'}</span>
                        <span className="specific-room-date-range">
                          Start: {startDate ? formatDate(startDate) : 'Not set'}
                          {' · '}
                          End: {endDate ? formatDate(endDate) : 'Not set'}
                        </span>
                      </span>
                      <span className="specific-room-request-meta">
                        <span className={`specific-room-status ${statusClass}`}>{status}</span>
                        <span className="specific-room-participants">
                          {Number.isFinite(participantCount) && participantCount > 0
                            ? `${participantCount} expected participants`
                            : 'Participants not specified'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="specific-rooms-empty">No specific rooms have been requested.</p>
            )}
          </section>
        </div>
      )}
      {selectedReservation && (
        <div
          className="dashboard-detail-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedReservation(null);
          }}
        >
          <div
            className="dashboard-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Reservation details"
          >
            <button
              className="dashboard-detail-close"
              type="button"
              aria-label="Close reservation details"
              onClick={() => setSelectedReservation(null)}
            >
              ×
            </button>
            <div className="dashboard-detail-content">
              <Suspense fallback={<p className="panel-empty">Loading reservation details...</p>}>
                <ReservationDetails
                  key={`${selectedReservation.source}-${selectedReservation.data.id}`}
                  data={selectedReservation.data}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Route pending accounts to review status; render the full dashboard for other roles.
const Dashboard = ({ currentUserRole }) => {
  const normalizedRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  return normalizedRole === 'pending'
    ? <PendingAccountDashboard />
    : <DashboardContent currentUserRole={currentUserRole} />;
};

export default Dashboard;