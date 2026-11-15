import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { auth, db } from '../Firebase';
import MonthYearPicker from '../components/MonthYearPicker';
import {
  BuildingAdminExportActions,
  BuildingAdminFacilityInsights,
  BuildingAdminVenueTraffic,
  BuildingAdminVenueUtilization
} from './BuildingAdminDashboard';
import {
  MisDashboardEquipmentInventory,
  MisDashboardEquipmentUsageHours,
  MisDashboardExportActions,
  MisDashboardPendingAccounts,
  MisDashboardResourceConsumption,
  MisDashboardUtilityInventory
} from './MisDashboard';
import {
  RoomCheckerClassroomRankings,
  RoomCheckerExportActions,
  RoomCheckerOccupancy
} from './RoomCheckerDashboard';
import { RankingModeToggle, ResourceRankingPanel } from './DashboardShared';
import {
  APPROVAL_ROLE_HIERARCHY,
  isApprovalStepReady,
  isReservationAssignedToEndorser,
  normalizeApprovalRoleKey
} from '../services/approvalWorkflow';
import {
  getDepartmentalResourceConsumption,
  getEquipmentReservedHours,
  getOtherRequestDetails
} from '../services/dashboardResourceUsage';
import { matchesDashboardReservationDateRange } from '../services/dashboardReservationDateFilter';
import { matchesDashboardReservationScope } from '../services/dashboardReservationScope';
import { buildDashboardReservationTrend } from '../services/dashboardReservationTrend';
import { getEquipmentAvailability } from '../services/equipmentAvailability';
import { getFacilityOperatingHours } from '../services/facilityUtilization';
import { getReservationScheduleForFacility } from '../services/reservationConflicts';
import {
  getSpecificRoomReservedHours,
  getLiveSpecificRoomOccupancy
} from '../services/roomCheckerDashboard';
import { isReservationActive } from '../services/reservationStatus';
import { getUtilityReservedCount } from '../services/utilityAvailability';
import { formatTimeForDisplay } from '../services/timeFormatting';
import "../styles/Dashboard.scss";

const ReservationDetails = lazy(() => import('./ReservationDetails'));

// Shared date and time helpers normalize values from filters and stored reservations.
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CONSUMPTION_COLORS = [
  '#315fe8',
  '#14a779',
  '#f59e0b',
  '#8b5cf6',
  '#e34b76',
  '#0e9fbb',
  '#64748b'
];
const HEATMAP_HOURS = Array.from({ length: 15 }, (_, index) => {
  const hour = index + 7;
  return {
    value: hour,
    label: `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`
  };
});
const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDashboardFilters = () => {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  return {
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(endDate),
    startTime: '',
    endTime: '',
    status: 'all',
    // IDs to include for each checkbox filter; an empty list means all.
    facilities: [],
    equipment: [],
    utilities: []
  };
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

// One card in "Recent Approved Equipment" / "Recent Approved Utilities": the item and units, then who
// booked it and when. Clicking it opens the full reservation.
const RecentResourceRow = ({ item, booking, fallbackName, formatTime, onOpen }) => {
  const name = item.name || fallbackName;
  const isClickable = Boolean(booking?.reservation);
  const Row = isClickable ? 'button' : 'div';

  return (
    <Row
      className={`recent-resource-row${isClickable ? ' is-clickable' : ''}`}
      {...(isClickable ? {
        type: 'button',
        'aria-label': `View reservation details for ${name}, booked by ${booking.borrower}`,
        onClick: () => onOpen(booking.reservation)
      } : {})}
    >
      <div className="recent-resource-header">
        <span className="recent-resource-initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <div className="recent-resource-title">
          <strong title={name}>{name}</strong>
          <span>{item.isOtherRequest ? 'Other request' : item.sku || 'No SKU'}</span>
        </div>
        {booking && (
          <span className="recent-resource-quantity">
            {booking.quantity} unit{booking.quantity === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {booking ? (
        <div className="recent-resource-booking">
          <span className="recent-resource-borrower">{booking.borrower}</span>
          <span className="recent-resource-when">
            {formatDate(booking.date)}
            {booking.startTime ? ` · ${formatTime(booking.startTime)}` : ''}
          </span>
        </div>
      ) : (
        <p className="recent-resource-empty">No approved booking in this date range.</p>
      )}
    </Row>
  );
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
// `checkboxFilters`: optional checkbox rows ({ key, legend, allLabel, options }) where `key` is the
// filters field holding the ticked IDs; none ticked means all.
const DashboardFilters = ({ filters, setFilters, setDatePreset, resultCount, checkboxFilters }) => (
  <section className="dashboard-filters" aria-label="Dashboard filters">
    <div className="filter-heading">
      <div>
        <h2>Filter by Date</h2>
      </div>
      <button
        className="filter-reset"
        type="button"
        onClick={() => setFilters(getDefaultDashboardFilters())}
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
    {(checkboxFilters || []).map((group) => (
      <fieldset className="dashboard-facility-filter" key={group.key}>
        <legend>{group.legend}</legend>
        <div className="dashboard-facility-filter-options">
          <label className="dashboard-facility-filter-option">
            <input
              type="checkbox"
              checked={filters[group.key].length === 0}
              onChange={() => setFilters((current) => ({ ...current, [group.key]: [] }))}
            />
            <span>{group.allLabel}</span>
          </label>
          {group.options.map((option) => {
            const optionId = String(option.id);
            const isChecked = filters[group.key].includes(optionId);
            return (
              <label className="dashboard-facility-filter-option" key={optionId}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => setFilters((current) => ({
                    ...current,
                    [group.key]: isChecked
                      ? current[group.key].filter((id) => id !== optionId)
                      : [...current[group.key], optionId]
                  }))}
                />
                <span>{option.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    ))}
    <label className="date-presets">
      <span className="date-presets-label">Quick range</span>
      <select
        aria-label="Quick date range"
        value=""
        onChange={(event) => {
          if (!event.target.value) return;
          const [direction, days] = event.target.value.split('-');
          setDatePreset(Number(days), direction);
        }}
      >
        <option value="">Select a range</option>
        <optgroup label="Past">
          <option value="last-1">Last 24 hours</option>
          <option value="last-7">Last 7 days</option>
          <option value="last-14">Last 14 days</option>
          <option value="last-30">Last 30 days</option>
        </optgroup>
        <optgroup label="Upcoming">
          <option value="next-1">Next 24 hours</option>
          <option value="next-7">Next 7 days</option>
          <option value="next-14">Next 14 days</option>
          <option value="next-30">Next 30 days</option>
        </optgroup>
      </select>
      {resultCount !== undefined && (
        <span className="date-presets-result" role="status" aria-live="polite">
          <strong>{resultCount}</strong> {resultCount === 1 ? 'reservation' : 'reservations'} found
        </span>
      )}
    </label>
  </section>
);

// Summary metrics shown to staff and administrators.
const DashboardKpis = ({
  metrics,
  pendingUsers,
  pendingProfiles,
  canManagePendingProfiles,
  isAdminDashboard,
  isBuildingAdminDashboard,
  isMisDashboard
}) => {
  // The filtered reservation count is shown beside Quick range ("x reservations found"), so only the
  // super admin's inventory and account cards remain here.
  const showSuperAdminCards = isAdminDashboard && !isBuildingAdminDashboard && !isMisDashboard;
  const showPendingProfiles = canManagePendingProfiles && !isBuildingAdminDashboard && !isMisDashboard;
  if (!showSuperAdminCards && !showPendingProfiles) return null;

  return (
    <section
      className={`dashboard-kpis admin-dashboard-kpis${showSuperAdminCards ? ' has-super-admin-kpis' : ''}`}
      aria-label="Key analytics"
    >
      {showSuperAdminCards && (
        <Link className="kpi-card kpi-card-link" to="/equipment">
          <span className="kpi-label">Available equipment</span>
          <strong>{metrics.availableUnits}</strong>
          <span className="kpi-footnote">Units available in current inventory</span>
        </Link>
      )}
      {showSuperAdminCards && (
        <Link className="kpi-card kpi-card-link" to="/user?filter=pending">
          <span className="kpi-label">Pending users</span>
          <strong>{pendingUsers}</strong>
          <span className="kpi-footnote">View accounts with pending roles</span>
        </Link>
      )}
      {showPendingProfiles && (
        <Link className="kpi-card kpi-card-link" to="/user?filter=pending-profile">
          <span className="kpi-label">Pending profiles</span>
          <strong>{pendingProfiles}</strong>
          <span className="kpi-footnote">Review profile picture and cover changes</span>
        </Link>
      )}
    </section>
  );
};

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
  const [filters, setFilters] = useState(getDefaultDashboardFilters);
  const [liveOccupancyNow, setLiveOccupancyNow] = useState(() => new Date());
  const [isExportingDashboardPdf, setIsExportingDashboardPdf] = useState(false);
  const [dashboardPdfExportError, setDashboardPdfExportError] = useState('');
  const [isExportingMisDashboardPdf, setIsExportingMisDashboardPdf] = useState(false);
  const [misDashboardPdfExportError, setMisDashboardPdfExportError] = useState('');

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
  const isMisDashboard = ['mis', 'mis admin'].includes(dashboardRole);
  const isBuildingAdminDashboard = dashboardRole === 'building admin';
  const isRoomCheckerDashboard = dashboardRole === 'room checker';
  const canManagePendingProfiles = ['building admin', 'mis', 'super admin'].includes(dashboardRole);
  const isGeneralStaffDashboard = Boolean(dashboardRole)
    && !['requestor', 'user'].includes(dashboardRole)
    && !isAdminDashboard;
  const hasAnalyticsDashboard = isAdminDashboard || isGeneralStaffDashboard;

  useEffect(() => {
    if (!isRoomCheckerDashboard) return undefined;
    const intervalId = window.setInterval(() => setLiveOccupancyNow(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, [isRoomCheckerDashboard]);
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

  // Facility filter (building admin): options come from the live facilities list, so new facilities appear
  // automatically. Every facility-based panel uses `reportFacilities` instead of the full list.
  const facilityFilterOptions = useMemo(
    () => [...facilitiesData]
      .map((facility) => ({ id: facility.id, name: facility.name || 'Facility' }))
      .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })),
    [facilitiesData]
  );
  // Ticked facilities that still exist; none ticked means every facility.
  const selectedFilterFacilities = useMemo(
    () => facilitiesData.filter((facility) => filters.facilities.includes(String(facility.id))),
    [facilitiesData, filters.facilities]
  );
  const selectedFilterFacilityIds = useMemo(
    () => (selectedFilterFacilities.length
      ? new Set(selectedFilterFacilities.map((facility) => String(facility.id)))
      : null),
    [selectedFilterFacilities]
  );
  const reportFacilities = selectedFilterFacilities.length ? selectedFilterFacilities : facilitiesData;
  const selectedFilterFacilityLabel = selectedFilterFacilities.length
    ? selectedFilterFacilities.map((facility) => facility.name || 'Facility').sort().join(', ')
    : 'All facilities';
  // Equipment and utility filters (MIS): same idea as the facility filter, from the live inventory lists.
  const toFilterOptions = (items, fallbackName) => [...items]
    .map((item) => ({ id: item.id, name: item.name || fallbackName }))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: 'base' }));
  const equipmentFilterOptions = useMemo(() => toFilterOptions(equipmentData, 'Equipment'), [equipmentData]);
  const utilityFilterOptions = useMemo(() => toFilterOptions(utilitiesData, 'Utility'), [utilitiesData]);
  const getTickedIds = (items, tickedIds) => {
    const ids = items.map((item) => String(item.id)).filter((id) => tickedIds.includes(id));
    return ids.length ? new Set(ids) : null;
  };
  // null means "all" (nothing ticked).
  const selectedFilterEquipmentIds = useMemo(
    () => getTickedIds(equipmentData, filters.equipment),
    [equipmentData, filters.equipment]
  );
  const selectedFilterUtilityIds = useMemo(
    () => getTickedIds(utilitiesData, filters.utilities),
    [utilitiesData, filters.utilities]
  );
  const getSelectedFilterLabel = (options, selectedIds, allLabel) => (selectedIds
    ? options.filter((option) => selectedIds.has(String(option.id))).map((option) => option.name).join(', ')
    : allLabel);
  // Equipment/utility rows shown in item panels: only ticked catalogue items while a filter is active
  // ("Other:" free-text requests aren't in the checkbox list, so they're left out then).
  const matchesEquipmentFilter = (item) => !selectedFilterEquipmentIds
    || (!item.isOtherRequest && selectedFilterEquipmentIds.has(String(item.id)));
  const matchesUtilityFilter = (item) => !selectedFilterUtilityIds
    || (!item.isOtherRequest && selectedFilterUtilityIds.has(String(item.id)));

  // Drop ticked facilities, equipment, or utilities that have been deleted, so a filter never points
  // at a missing item.
  useEffect(() => {
    const sources = { facilities: facilitiesData, equipment: equipmentData, utilities: utilitiesData };
    const updates = {};
    Object.entries(sources).forEach(([key, items]) => {
      if (!items.length) return;
      const existingIds = new Set(items.map((item) => String(item.id)));
      if (filters[key].some((id) => !existingIds.has(id))) {
        updates[key] = filters[key].filter((id) => existingIds.has(id));
      }
    });
    if (Object.keys(updates).length) setFilters((current) => ({ ...current, ...updates }));
  }, [facilitiesData, equipmentData, utilitiesData, filters.facilities, filters.equipment, filters.utilities]);

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
  const heatmapStartValue = startDate ? toDateInputValue(startDate) : '';
  const heatmapEndValue = endDate ? toDateInputValue(endDate) : '';
  const heatmapDateRangeLabel = startDate && endDate
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : startDate
      ? `From ${formatDate(startDate)}`
      : endDate
        ? `Through ${formatDate(endDate)}`
        : 'All available reservation history';
  const heatmapStatusLabel = filters.status === 'all'
    ? 'Approved and pending'
    : filters.status === 'pending'
      ? 'Pending'
      : 'Approved';
  const liveVenueUtilization = useMemo(() => {
    if (!isBuildingAdminDashboard) return [];

    const scheduledDates = dashboardReservations
      .flatMap((reservation) => getReservationScheduleForFacility(reservation)
        .map((entry) => parseDate(entry.date))
        .filter(Boolean));
    const earliestScheduledDate = scheduledDates.length
      ? new Date(Math.min(...scheduledDates.map((date) => date.getTime())))
      : null;
    const latestScheduledDate = scheduledDates.length
      ? new Date(Math.max(...scheduledDates.map((date) => date.getTime())))
      : null;
    const fallbackDate = parseDate(toDateInputValue(new Date()));
    let rangeStart = startDate || earliestScheduledDate || endDate || fallbackDate;
    let rangeEnd = endDate || latestScheduledDate || startDate || fallbackDate;
    if (rangeStart > rangeEnd) {
      if (startDate && !endDate) rangeEnd = rangeStart;
      else if (endDate && !startDate) rangeStart = rangeEnd;
      else [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    }
    const operatingHours = getFacilityOperatingHours(rangeStart, rangeEnd);

    return reportFacilities.map((facility) => {
      const bookedMinutes = dashboardReservations.reduce((reservationTotal, reservation) => {
        if (
          (reservation.status || '').toLowerCase().trim() !== 'approved'
          || !Array.isArray(reservation.facilities)
          || !reservation.facilities.includes(facility.id)
        ) return reservationTotal;

        return reservationTotal + getReservationScheduleForFacility(reservation, facility.id)
          .reduce((scheduleTotal, entry) => {
            const date = parseDate(entry.date);
            const start = parseTime(entry.startTime);
            const end = parseTime(entry.endTime);
            if (
              !date
              || (startDate && date < startDate)
              || (endDate && date > endDate)
              || start === null
              || end === null
              || end <= start
            ) return scheduleTotal;
            return scheduleTotal + end - start;
          }, 0);
      }, 0);

      return {
        id: facility.id,
        name: facility.name || 'Facility',
        bookedHours: bookedMinutes / 60,
        operatingHours,
        dateRangeLabel: heatmapDateRangeLabel,
        utilizationPercent: operatingHours
          ? bookedMinutes / (operatingHours * 60) * 100
          : 0
      };
    });
  }, [
    isBuildingAdminDashboard,
    reportFacilities,
    dashboardReservations,
    startDate,
    endDate,
    heatmapDateRangeLabel
  ]);
  const venueTrafficHeatmaps = useMemo(() => {
    if (!isBuildingAdminDashboard) return [];

    const reservationsById = new Map(
      reservationsData.map((reservation) => [reservation.id, reservation])
    );
    historyData.forEach((reservation) => {
      if (!reservationsById.has(reservation.id)) {
        reservationsById.set(reservation.id, reservation);
      }
    });

    return reportFacilities.map((facility) => {
      const cells = Array.from({ length: 7 }, () => (
        Array.from({ length: HEATMAP_HOURS.length }, () => 0)
      ));
      const includedStatuses = filters.status === 'all'
        ? ['approved', 'pending']
        : [filters.status];

      reservationsById.forEach((reservation) => {
        const status = (reservation.status || 'pending').toLowerCase().trim();
        if (
          !includedStatuses.includes(status)
          || !Array.isArray(reservation.facilities)
          || !reservation.facilities.includes(facility.id)
        ) return;

        getReservationScheduleForFacility(reservation, facility.id).forEach((entry) => {
          if (entry.date < heatmapStartValue || entry.date > heatmapEndValue) return;
          const date = parseDate(entry.date);
          const start = parseTime(entry.startTime);
          const end = parseTime(entry.endTime);
          if (!date || start === null || end === null || end <= start) return;

          const weekday = date.getDay();
          HEATMAP_HOURS.forEach(({ value: hour }, index) => {
            const overlap = Math.max(
              0,
              Math.min(end, (hour + 1) * 60) - Math.max(start, hour * 60)
            );
            cells[weekday][index] += overlap;
          });
        });
      });

      const peakMinutes = Math.max(0, ...cells.flat());
      const weekdayTotals = cells.map((dayCells) => (
        dayCells.reduce((total, bookedMinutes) => total + bookedMinutes, 0)
      ));
      const busiestCellsByWeekday = peakMinutes
        ? cells.flatMap((dayCells, weekday) => {
          const busiestCells = dayCells.flatMap((bookedMinutes, hourIndex) => (
            bookedMinutes === peakMinutes
              ? [{
                startHour: HEATMAP_HOURS[hourIndex].value,
                bookedMinutes
              }]
              : []
          ));

          return busiestCells.length
            ? [{ weekday, totalMinutes: weekdayTotals[weekday], cells: busiestCells }]
            : [];
        }).sort((first, second) => (
          second.totalMinutes - first.totalMinutes
          || ((first.weekday + 6) % 7) - ((second.weekday + 6) % 7)
        ))
        : [];

      return {
        id: facility.id,
        name: facility.name || 'Facility',
        cells,
        peakMinutes,
        busiestCellsByWeekday
      };
    });
  }, [
    isBuildingAdminDashboard,
    reportFacilities,
    reservationsData,
    historyData,
    heatmapStartValue,
    heatmapEndValue,
    filters.status
  ]);

  const filteredReservations = useMemo(() => dashboardReservations.filter((reservation) => {
    if (!matchesDashboardReservationScope(reservation, dashboardRole)) return false;
    if (
      selectedFilterFacilityIds
      && !(reservation.facilities || []).some((facilityId) => selectedFilterFacilityIds.has(String(facilityId)))
    ) return false;
    // Equipment/utility filters: keep reservations that include any ticked equipment or utility.
    if (selectedFilterEquipmentIds || selectedFilterUtilityIds) {
      const hasTickedEquipment = Boolean(selectedFilterEquipmentIds) && Object.entries(reservation.selectedEquip || {})
        .some(([equipmentId, quantity]) => Number(quantity) > 0 && selectedFilterEquipmentIds.has(String(equipmentId)));
      const hasTickedUtility = Boolean(selectedFilterUtilityIds)
        && (Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : [])
          .some((utilityId) => selectedFilterUtilityIds.has(String(utilityId)));
      if (!hasTickedEquipment && !hasTickedUtility) return false;
    }

    const reservationDate = parseDate(reservation.eventDate || reservation.date);
    const scheduledDates = getReservationScheduleForFacility(reservation)
      .map((entry) => entry.date);
    const dateValues = scheduledDates.length
      ? scheduledDates
      : reservationDate
        ? [toDateInputValue(reservationDate)]
        : [];
    if (!matchesDashboardReservationDateRange(dateValues, {
      startDate: filters.startDate,
      endDate: filters.endDate
    })) return false;

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
  }), [
    dashboardReservations,
    dashboardRole,
    filters.startDate,
    filters.endDate,
    filters.status,
    selectedFilterFacilityIds,
    selectedFilterEquipmentIds,
    selectedFilterUtilityIds,
    startMinutes,
    endMinutes
  ]);
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
    const inventory = getEquipmentAvailability({
      totalCount: equipment.totalCount,
      underMaintenance: equipment.underMaintenance,
      reservedCount: reserved
    });
    const available = equipment.status === 'Unavailable' ? 0 : inventory.available;
    return {
      ...equipment,
      total: inventory.total,
      underMaintenance: inventory.underMaintenance,
      reserved: inventory.reserved,
      available,
      isOvercommitted: inventory.isOvercommitted
    };
  }), [equipmentData, reservationsData]);

  const equipmentTabAvailability = useMemo(() => equipmentInventory.map((equipment) => {
    const available = equipment.available;
    const status = available === 0 ? 'Unavailable' : equipment.status;
    return {
      ...equipment,
      available,
      percentAvailable: equipment.total > 0
        ? Math.round((available / equipment.total) * 100)
        : 0,
      isUnavailable: status === 'Unavailable',
      isRunningLow: equipment.total > 0
        && available > 0
        && available <= Math.ceil(equipment.total * 0.2)
    };
  }), [equipmentInventory]);

  const utilityInventory = useMemo(() => utilitiesData.map((utility) => ({
    ...utility,
    reserved: getUtilityReservedCount(reservationsData, utility.id),
    status: String(utility.status || '').trim().toLowerCase() === 'unavailable'
      ? 'Unavailable'
      : 'Available'
  })), [utilitiesData, reservationsData]);

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
        const catalogEquipment = Object.entries(reservation.selectedEquip || {})
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([id, quantity]) => `${quantity} × ${equipmentById.get(id)?.name || 'Equipment'}`);
        const equipmentNames = [...catalogEquipment];
        if (typeof reservation.otherEquipment === 'string' && reservation.otherEquipment.trim()) {
          equipmentNames.push(reservation.otherEquipment.trim());
        }
        // Equipment and utilities with their units ("6 × Microphone"), including "Other" requests.
        const formatOtherRequest = (field, unitsField) => {
          const other = getOtherRequestDetails(reservation, field, unitsField);
          const text = typeof reservation[field] === 'string' ? reservation[field].trim() : '';
          if (other) return `${other.quantity} × ${other.name}`;
          return text || null;
        };
        const otherEquipmentWithUnits = formatOtherRequest('otherEquipment', 'otherEquipmentUnits');
        const equipmentWithUnits = otherEquipmentWithUnits
          ? [...catalogEquipment, otherEquipmentWithUnits]
          : catalogEquipment;
        const utilityNames = (Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : [])
          .map((id) => {
            const quantity = Number(reservation.selectedUtilityUnits?.[id] ?? 1);
            return `${Number.isFinite(quantity) && quantity > 0 ? quantity : 1} × ${utilitiesById.get(id)?.name || 'Utility'}`;
          });
        const otherUtilityWithUnits = formatOtherRequest('otherUtility', 'otherUtilityUnits');
        if (otherUtilityWithUnits) utilityNames.push(otherUtilityWithUnits);

        return {
          ...reservation,
          facilityNames,
          equipmentNames,
          equipmentWithUnits,
          utilityNames,
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
  }, [filteredReservations, facilitiesById, equipmentById, utilitiesById]);

  // Rank approved equipment, utility, and facility usage.
  const { most: usageByEquipment } = useMemo(() => {
    const totals = new Map();
    const lastUsedByEquipment = new Map();
    const otherRequests = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        const usageDate = parseDate(reservation.eventDate || reservation.date)?.getTime() || 0;
        Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
          const amount = Number(quantity) || 0;
          totals.set(equipmentId, (totals.get(equipmentId) || 0) + amount);
          if (amount > 0) {
            lastUsedByEquipment.set(
              equipmentId,
              Math.max(lastUsedByEquipment.get(equipmentId) || 0, usageDate)
            );
          }
        });
        const otherEquipment = getOtherRequestDetails(
          reservation,
          'otherEquipment',
          'otherEquipmentUnits'
        );
        if (otherEquipment) {
          const current = otherRequests.get(otherEquipment.key)
            || { name: otherEquipment.name, quantity: 0, lastUsed: 0 };
          otherRequests.set(otherEquipment.key, {
            ...current,
            quantity: current.quantity + otherEquipment.quantity,
            lastUsed: Math.max(current.lastUsed, usageDate)
          });
        }
      });

    const rankedUsage = equipmentData.map((equipment) => ({
      id: equipment.id,
      quantity: totals.get(equipment.id) || 0,
      lastUsed: lastUsedByEquipment.get(equipment.id) || 0,
      name: equipment.name || 'Equipment',
      isOtherRequest: false
    })).concat(
      [...otherRequests.entries()].map(([id, value]) => ({
        id: `other-${id}`,
        ...value,
        isOtherRequest: true
      }))
    ).filter(matchesEquipmentFilter);

    return {
      most: [...rankedUsage].sort((first, second) => (
        second.quantity - first.quantity || second.lastUsed - first.lastUsed
      )),
      least: [...rankedUsage].sort((first, second) => first.quantity - second.quantity)
    };
  }, [filteredReservations, equipmentData, selectedFilterEquipmentIds]);

  const equipmentHoursRanking = useMemo(
    () => getEquipmentReservedHours(filteredReservations, equipmentData).filter(matchesEquipmentFilter),
    [filteredReservations, equipmentData, selectedFilterEquipmentIds]
  );
  const specificRoomReservedHours = useMemo(
    () => getSpecificRoomReservedHours(dashboardReservations, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      startMinutes,
      endMinutes,
      status: filters.status
    }),
    [
      dashboardReservations,
      filters.startDate,
      filters.endDate,
      filters.status,
      startMinutes,
      endMinutes
    ]
  );
  const liveSpecificRoomOccupancy = useMemo(
    () => getLiveSpecificRoomOccupancy(
      reservationsData,
      {
        startDate: filters.startDate,
        endDate: filters.endDate,
        today: toDateInputValue(liveOccupancyNow),
        nowMinutes: liveOccupancyNow.getHours() * 60 + liveOccupancyNow.getMinutes()
      }
    ),
    [reservationsData, filters.startDate, filters.endDate, liveOccupancyNow]
  );
  // With an equipment filter, only the ticked equipment's units count toward each requestor group.
  const departmentalResourceConsumption = useMemo(
    () => getDepartmentalResourceConsumption(selectedFilterEquipmentIds
      ? filteredReservations.map((reservation) => ({
        ...reservation,
        selectedEquip: Object.fromEntries(Object.entries(reservation.selectedEquip || {})
          .filter(([equipmentId]) => selectedFilterEquipmentIds.has(String(equipmentId)))),
        otherEquipment: '',
        otherEquipmentUnits: ''
      }))
      : filteredReservations),
    [filteredReservations, selectedFilterEquipmentIds]
  );

  const { most: utilityUsage } = useMemo(() => {
    const totals = new Map();
    const lastUsedByUtility = new Map();
    const otherRequests = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        const usageDate = parseDate(reservation.eventDate || reservation.date)?.getTime() || 0;
        (Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : [])
          .forEach((utilityId) => {
            const quantity = Number(reservation.selectedUtilityUnits?.[utilityId] ?? 1);
            if (!Number.isFinite(quantity) || quantity <= 0) return;
            totals.set(utilityId, (totals.get(utilityId) || 0) + quantity);
            lastUsedByUtility.set(
              utilityId,
              Math.max(lastUsedByUtility.get(utilityId) || 0, usageDate)
            );
          });
        const otherUtility = getOtherRequestDetails(
          reservation,
          'otherUtility',
          'otherUtilityUnits'
        );
        if (otherUtility) {
          const current = otherRequests.get(otherUtility.key)
            || { name: otherUtility.name, quantity: 0, lastUsed: 0 };
          otherRequests.set(otherUtility.key, {
            ...current,
            quantity: current.quantity + otherUtility.quantity,
            lastUsed: Math.max(current.lastUsed, usageDate)
          });
        }
      });

    const rankedUsage = utilitiesData.map((utility) => ({
      id: utility.id,
      quantity: totals.get(utility.id) || 0,
      lastUsed: lastUsedByUtility.get(utility.id) || 0,
      name: utility.name || 'Utility',
      isOtherRequest: false
    })).concat(
      [...otherRequests.entries()].map(([id, value]) => ({
        id: `other-${id}`,
        ...value,
        isOtherRequest: true
      }))
    ).filter(matchesUtilityFilter);

    return {
      most: [...rankedUsage].sort((first, second) => (
        second.quantity - first.quantity || second.lastUsed - first.lastUsed
      )),
      least: [...rankedUsage].sort((first, second) => first.quantity - second.quantity)
    };
  }, [filteredReservations, utilitiesData, selectedFilterUtilityIds]);

  const { most: facilityUsage, least: leastUsedFacilities } = useMemo(() => {
    const totals = new Map();
    const lastUsedByFacility = new Map();
    const specificRoomUsage = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        const usageDate = parseDate(reservation.eventDate || reservation.date)?.getTime() || 0;
        (reservation.facilities || []).forEach((facilityId) => {
          totals.set(facilityId, (totals.get(facilityId) || 0) + 1);
          lastUsedByFacility.set(
            facilityId,
            Math.max(lastUsedByFacility.get(facilityId) || 0, usageDate)
          );
        });
        const specificRoom = typeof reservation.specificRoom === 'string'
          ? reservation.specificRoom.trim()
          : '';
        if (specificRoom) {
          const key = specificRoom.toLowerCase()
            .replace(/^room\s+(?=\d)/, '')
            .replace(/\s+/g, ' ');
          const current = specificRoomUsage.get(key) || { name: specificRoom, count: 0, lastUsed: 0 };
          specificRoomUsage.set(key, {
            ...current,
            count: current.count + 1,
            lastUsed: Math.max(current.lastUsed, usageDate)
          });
        }
      });

    const rankedUsage = facilitiesData.map((facility) => ({
      id: facility.id,
      count: totals.get(facility.id) || 0,
      lastUsed: lastUsedByFacility.get(facility.id) || 0,
      name: facility.name || 'Facility'
    })).concat(
      [...specificRoomUsage.entries()].map(([key, value]) => ({
        id: `specific-room-${key}`,
        name: `Specific room: ${value.name}`,
        count: value.count
      }))
    );

    return {
      most: [...rankedUsage].sort((first, second) => (
        second.count - first.count || second.lastUsed - first.lastUsed
      )),
      least: [...rankedUsage].sort((first, second) => first.count - second.count)
    };
  }, [filteredReservations, facilitiesData]);

  // Group filtered reservations into chart buckets and find resource alerts.
  const trendData = useMemo(() => {
    return buildDashboardReservationTrend(countedReservations, {
      startDate,
      endDate,
      parseDate
    });
  }, [countedReservations, startDate, endDate]);

  // Calculate chart scales and quick date-range presets for the rendered panels.
  const chartMaximum = Math.max(1, ...trendData.map((bucket) => bucket.count));
  const equipmentHoursMaximum = Math.max(
    1,
    ...equipmentHoursRanking.map((equipment) => equipment.hours)
  );
  const specificRoomHoursMaximum = Math.max(
    1,
    ...specificRoomReservedHours.map((room) => room.hours)
  );
  const departmentalResourceChart = useMemo(() => {
    const totalUnits = departmentalResourceConsumption.reduce(
      (total, group) => total + group.units,
      0
    );
    const { segments } = departmentalResourceConsumption.reduce(
      (result, group, index) => {
        const percent = totalUnits ? group.units / totalUnits * 100 : 0;
        const endPercent = index === departmentalResourceConsumption.length - 1
          ? 100
          : result.accumulatedPercent + percent;
        return {
          accumulatedPercent: endPercent,
          segments: [...result.segments, {
            ...group,
            percent,
            startPercent: result.accumulatedPercent,
            endPercent,
            color: RESOURCE_CONSUMPTION_COLORS[index % RESOURCE_CONSUMPTION_COLORS.length]
          }]
        };
      },
      { accumulatedPercent: 0, segments: [] }
    );

    return {
      totalUnits,
      segments,
      background: segments.length
        ? `conic-gradient(${segments.map((segment) => (
          `${segment.color} ${segment.startPercent}% ${segment.endPercent}%`
        )).join(', ')})`
        : ''
    };
  }, [departmentalResourceConsumption]);
  const facilitiesRanking = (rankingModes.facilities === 'most'
    ? facilityUsage
    : leastUsedFacilities)
    .filter((facility) => {
      const isSpecificRoom = String(facility.id).startsWith('specific-room-');
      if (isBuildingAdminDashboard && isSpecificRoom) return false;
      if (isRoomCheckerDashboard) return isSpecificRoom;
      return rankingModes.facilities === 'most' ? facility.count > 0 : true;
    });
  const buildingAdminFacilityUsage = useMemo(
    () => facilityUsage.filter((facility) => (
      !String(facility.id).startsWith('specific-room-')
      && (!selectedFilterFacilityIds || selectedFilterFacilityIds.has(String(facility.id)))
    )),
    [facilityUsage, selectedFilterFacilityIds]
  );
  const facilityMaximum = Math.max(1, ...facilitiesRanking.map((facility) => facility.count));
  const formatTime = (time) => time ? formatTimeForDisplay(time) : 'Time not set';
  const exportMisDashboardReport = async ({ sections }) => {
    setIsExportingMisDashboardPdf(true);
    setMisDashboardPdfExportError('');

    try {
      const { exportMisDashboardPdf } = await import('../services/misDashboardPdf');
      const toRecentRow = (item, booking) => ({
        name: item.isOtherRequest ? `Other: ${item.name}` : item.name || 'Unnamed item',
        sku: item.isOtherRequest ? 'Other request' : item.sku || 'No SKU',
        latestBooking: booking
          ? {
            borrower: booking.borrower,
            dateTime: `${formatDate(booking.date)}${booking.startTime ? ` · ${formatTime(booking.startTime)}` : ''}`,
            quantity: booking.quantity
          }
          : null
      });

      exportMisDashboardPdf({
        generatedAt: new Date().toLocaleString(),
        sections,
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dates: startDate || endDate
            ? `${startDate ? formatDate(startDate) : 'Any date'} - ${endDate ? formatDate(endDate) : 'Any date'}`
            : 'All dates',
          times: startMinutes !== null || endMinutes !== null
            ? `${filters.startTime ? formatTime(filters.startTime) : 'Any time'} - ${filters.endTime ? formatTime(filters.endTime) : 'Any time'}`
            : 'All times',
          status: filters.status === 'all'
            ? 'Approved and pending'
            : filters.status[0].toUpperCase() + filters.status.slice(1),
          equipment: getSelectedFilterLabel(equipmentFilterOptions, selectedFilterEquipmentIds, 'All equipment'),
          utilities: getSelectedFilterLabel(utilityFilterOptions, selectedFilterUtilityIds, 'All utilities')
        },
        summary: metrics,
        rankingModes: {
          equipment: rankingModes.equipment,
          utilities: rankingModes.utilities
        },
        equipmentInventory: equipmentTabAvailability.map((equipment) => ({
          name: equipment.name || 'Unnamed equipment',
          total: equipment.total,
          underMaintenance: equipment.underMaintenance || 0,
          reserved: equipment.reserved,
          available: equipment.available
        })),
        utilityInventory: utilityInventory.map((utility) => ({
          name: utility.name || 'Unnamed utility',
          reserved: utility.reserved,
          status: utility.status
        })),
        trend: trendData,
        equipmentUsage: equipmentHoursRanking,
        groupConsumption: departmentalResourceConsumption,
        // Every item, including ones with no requests, like the dashboard's View All lists.
        equipmentRanking: usageByEquipment.map((equipment) => ({
          name: equipment.name,
          isOtherRequest: equipment.isOtherRequest,
          quantity: equipment.quantity
        })),
        utilityRanking: utilityUsage.map((utility) => ({
          name: utility.name,
          isOtherRequest: utility.isOtherRequest,
          quantity: utility.quantity
        })),
        recentEquipment: recentEquipmentActivity.map((equipment) => toRecentRow(equipment, equipment.lastBorrow)),
        recentUtilities: recentUtilityActivity.map((utility) => toRecentRow(utility, utility.lastReservation)),
        // MIS: equipment and utilities with their units instead of facilities and participants.
        matchedReservations: activity.recentReservations.map((reservation) => ({
          event: reservation.eventName || 'Untitled reservation',
          requestor: reservation.fullName || reservation.userEmail || 'Unknown requestor',
          dateTime: `${reservation.eventDateValue ? formatDate(reservation.eventDateValue) : 'Date unavailable'}`
            + ` · ${formatTime(reservation.startTime)}`,
          equipment: reservation.equipmentWithUnits.join(', '),
          utilities: reservation.utilityNames.join(', '),
          status: reservation.status || 'Pending'
        }))
      });
      return true;
    } catch (error) {
      console.error('Failed to export the MIS dashboard PDF:', error);
      setMisDashboardPdfExportError('The PDF report could not be generated. Please try again.');
      return false;
    } finally {
      setIsExportingMisDashboardPdf(false);
    }
  };
  const exportDashboardPdf = async ({ sections, heatmapFacilityIds }) => {
    setIsExportingDashboardPdf(true);
    setDashboardPdfExportError('');

    try {
      const { exportBuildingAdminDashboardPdf } = await import('../services/buildingAdminDashboardPdf');
      const selectedHeatmapIds = new Set(heatmapFacilityIds);

      await exportBuildingAdminDashboardPdf({
        generatedAt: new Date().toLocaleString(),
        sections,
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dates: startDate || endDate
            ? `${startDate ? formatDate(startDate) : 'Any date'} - ${endDate ? formatDate(endDate) : 'Any date'}`
            : 'All dates',
          times: startMinutes !== null || endMinutes !== null
            ? `${filters.startTime ? formatTime(filters.startTime) : 'Any time'} - ${filters.endTime ? formatTime(filters.endTime) : 'Any time'}`
            : 'All times',
          status: filters.status === 'all'
            ? 'Approved and pending'
            : filters.status[0].toUpperCase() + filters.status.slice(1),
          facility: selectedFilterFacilityLabel
        },
        summary: metrics,
        trend: trendData,
        utilization: liveVenueUtilization.map((venue) => ({
          name: venue.name,
          bookedHours: venue.bookedHours,
          operatingHours: venue.operatingHours,
          utilizationPercent: venue.utilizationPercent
        })),
        heatmapDateRangeLabel,
        heatmapStatusLabel,
        heatmaps: venueTrafficHeatmaps.filter((venue) => selectedHeatmapIds.has(venue.id)),
        rankingMode: rankingModes.facilities,
        facilityRanking: buildingAdminFacilityUsage.map((facility) => ({
          name: facility.name,
          count: facility.count
        })),
        matchedReservations: activity.recentReservations.map((reservation) => {
          const participantCount = reservation.specificRoomParticipants || reservation.expectedParticipants;
          return {
            event: reservation.eventName || 'Untitled reservation',
            requestor: reservation.fullName || reservation.userEmail || 'Unknown requestor',
            dateTime: `${reservation.eventDateValue ? formatDate(reservation.eventDateValue) : 'Date unavailable'}`
              + ` · ${formatTime(reservation.startTime)}`,
            facilities: reservation.facilityNames.join(', ') || 'No facility',
            participants: participantCount ? `${participantCount}` : 'Not specified',
            status: reservation.status || 'Pending'
          };
        })
      });
      return true;
    } catch (error) {
      console.error('Failed to export the Building Admin dashboard PDF:', error);
      setDashboardPdfExportError('The PDF report could not be generated. Please try again.');
      return false;
    } finally {
      setIsExportingDashboardPdf(false);
    }
  };
  const exportRoomCheckerDashboardReport = async () => {
    setIsExportingDashboardPdf(true);
    setDashboardPdfExportError('');

    try {
      const { exportRoomCheckerDashboardPdf } = await import('../services/roomCheckerDashboardPdf');
      const activeReservationIds = new Set(reservationsData.map((reservation) => reservation.id));
      const reservationRows = filteredReservations.map((reservation) => {
        const eventDate = parseDate(reservation.eventDate || reservation.date);
        const endDate = parseDate(reservation.endDate)
          || (eventDate
            ? new Date(eventDate.getTime() + (Math.max(1, Number(reservation.days) || 1) - 1) * DAY_IN_MS)
            : null);
        const schedules = getReservationScheduleForFacility(reservation).map((entry) => {
          const rawEntry = Array.isArray(reservation.schedule)
            ? reservation.schedule.find((candidate) => (
              candidate.date === entry.date
              && candidate.startTime === entry.startTime
              && candidate.endTime === entry.endTime
            ))
            : null;
          const aircon = typeof rawEntry?.aircon === 'boolean'
            ? rawEntry.aircon
            : Boolean(reservation.aircon);
          const airconStart = rawEntry?.airconOnTime
            || reservation.airconOnTime
            || entry.startTime;
          const airconEnd = rawEntry?.airconOffTime
            || reservation.airconOffTime
            || entry.endTime;
          return `${formatDate(parseDate(entry.date))} ${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`
            + ` · Air-con ${aircon ? `ON (${formatTime(airconStart)}–${formatTime(airconEnd)})` : 'OFF'}`;
        });
        const equipmentRequests = Object.entries(reservation.selectedEquip || [])
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([id, quantity]) => `${equipmentById.get(id)?.name || 'Equipment'} (${Number(quantity)})`);
        const utilityRequests = (Array.isArray(reservation.selectedUtilities)
          ? reservation.selectedUtilities
          : [])
          .map((id) => {
            const quantity = Number(reservation.selectedUtilityUnits?.[id] ?? 1);
            return `${utilitiesById.get(id)?.name || 'Utility'} (${quantity})`;
          });
        const otherRequests = [
          reservation.otherEquipment && `Other equipment: ${reservation.otherEquipment}`,
          reservation.otherUtility && `Other utility: ${reservation.otherUtility}`
        ].filter(Boolean);

        return {
          reference: reservation.refNo || reservation.id || 'No reference',
          event: reservation.eventName || reservation.title || 'Untitled reservation',
          requestor: reservation.fullName || reservation.userEmail || 'Unknown requestor',
          specificRoom: reservation.specificRoom || 'Not specified',
          participants: reservation.specificRoomParticipants || reservation.expectedParticipants || 'Not specified',
          dates: `${eventDate ? formatDate(eventDate) : 'Date unavailable'}${endDate && eventDate
            && endDate.toDateString() !== eventDate.toDateString()
            ? ` - ${formatDate(endDate)}`
            : ''}`,
          schedule: schedules.join('\n') || `${formatTime(reservation.startTime)}–${formatTime(reservation.endTime)}`,
          facilities: (reservation.facilities || [])
            .map((id) => facilitiesById.get(id)?.name || id)
            .join(', ') || 'No facility',
          equipment: equipmentRequests.join(', ') || 'None listed',
          utilities: utilityRequests.join(', ') || 'None listed',
          otherRequests: otherRequests.join(', ') || 'None listed',
          status: reservation.status || 'Pending',
          source: activeReservationIds.has(reservation.id) ? 'Active' : 'Archived'
        };
      });

      await exportRoomCheckerDashboardPdf({
        generatedAt: new Date().toLocaleString(),
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          dates: startDate || endDate
            ? `${startDate ? formatDate(startDate) : 'Any date'} - ${endDate ? formatDate(endDate) : 'Any date'}`
            : 'All dates',
          times: startMinutes !== null || endMinutes !== null
            ? `${filters.startTime ? formatTime(filters.startTime) : 'Any time'} - ${filters.endTime ? formatTime(filters.endTime) : 'Any time'}`
            : 'All times',
          status: filters.status === 'all'
            ? 'Approved and pending'
            : filters.status[0].toUpperCase() + filters.status.slice(1),
          upcomingWindow: `${upcomingRangeDays} days`
        },
        summary: metrics,
        approvals: pendingApprovalReservations.slice(0, 5).map((reservation) => ({
          reference: reservation.refNo || reservation.id || 'No reference',
          event: reservation.eventName || 'Untitled reservation',
          requestor: reservation.fullName || reservation.userEmail || 'Unknown requestor',
          date: formatDate(parseDate(reservation.eventDate || reservation.date)),
          time: formatTime(reservation.startTime)
        })),
        upcomingReservations: upcomingReservations.map((reservation) => ({
          reference: reservation.refNo || reservation.id || 'No reference',
          event: reservation.eventName || 'Untitled reservation',
          requestor: reservation.fullName || reservation.userEmail || 'Unknown requestor',
          date: formatDate(reservation.eventDateValue),
          time: formatTime(reservation.startTime),
          specificRoom: reservation.specificRoom || 'Not specified',
          facilities: (reservation.facilities || [])
            .map((id) => facilitiesById.get(id)?.name || id)
            .join(', ') || 'No facility'
        })),
        liveOccupancy: liveSpecificRoomOccupancy.map((room) => ({
          name: room.name,
          date: formatDate(parseDate(room.date)),
          event: room.eventName,
          requestor: room.requestor,
          time: `${formatTime(room.startTime)}–${formatTime(room.endTime)}`,
          status: room.state,
          aircon: room.aircon ? 'Scheduled ON' : 'Scheduled OFF'
        })),
        reservedHours: specificRoomReservedHours,
        roomRanking: facilitiesRanking.map((room) => ({
          name: room.name,
          count: room.count
        })),
        trend: trendData,
        reservations: reservationRows
      });
    } catch (error) {
      console.error('Failed to export the Room Checker dashboard PDF:', error);
      setDashboardPdfExportError('The PDF report could not be generated. Please try again.');
    } finally {
      setIsExportingDashboardPdf(false);
    }
  };
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
  ].filter(matchesEquipmentFilter).sort((first, second) => (
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
  ].filter(matchesUtilityFilter).sort((first, second) => (
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

  const matchedReservationsPanel = (
    <article className="dashboard-panel recent-activity-panel">
      <div className="panel-heading">
        <div>
          <h2>Matched reservations</h2>
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
                  {isBuildingAdminDashboard ? (
                    <>
                      {reservation.facilityNames.length > 0 && (
                        <span className="recent-reservation-resources">
                          {reservation.facilityNames.join(' · ')}
                        </span>
                      )}
                    </>
                  ) : isMisDashboard ? (
                    // MIS: equipment and utilities with their units, instead of facilities and participants.
                    <>
                      {reservation.equipmentWithUnits.length > 0 && (
                        <span className="recent-reservation-resources recent-reservation-resource-list">
                          <span className="recent-reservation-resource-label">Equipment:</span>{' '}
                          {reservation.equipmentWithUnits.join(' · ')}
                        </span>
                      )}
                      {reservation.utilityNames.length > 0 && (
                        <span className="recent-reservation-resources recent-reservation-resource-list">
                          <span className="recent-reservation-resource-label">Utilities:</span>{' '}
                          {reservation.utilityNames.join(' · ')}
                        </span>
                      )}
                      {reservation.equipmentWithUnits.length === 0 && reservation.utilityNames.length === 0 && (
                        <span className="recent-reservation-resources">No equipment or utilities requested</span>
                      )}
                    </>
                  ) : (
                    <>
                      {(reservation.facilityNames.length > 0 || reservation.equipmentNames.length > 0) && (
                        <span className="recent-reservation-resources">
                          {[...reservation.facilityNames, ...reservation.equipmentNames].slice(0, 2).join(' · ')}
                        </span>
                      )}
                      {roomAndParticipants && (
                        <span className="recent-reservation-resources">{roomAndParticipants}</span>
                      )}
                    </>
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
  );

  const dashboardKpis = (
    <DashboardKpis
      metrics={metrics}
      pendingUsers={pendingUserCount}
      pendingProfiles={pendingProfileCount}
      canManagePendingProfiles={canManagePendingProfiles}
      isAdminDashboard={isAdminDashboard}
      isBuildingAdminDashboard={isBuildingAdminDashboard}
      isMisDashboard={isMisDashboard}
    />
  );

  // Render dashboard operations, search, analytics, and resource summaries.
  return (
    <div className={`mis-dashboard-content ${isAdminDashboard ? 'admin-dashboard' : hasAnalyticsDashboard ? 'staff-dashboard' : 'personal-dashboard'}${isBuildingAdminDashboard ? ' building-admin-dashboard' : ''}${dashboardRole === 'room checker' ? ' room-checker-dashboard' : ''}`}>
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>{isAdminDashboard ? 'Admin dashboard' : 'Dashboard'}</h1>
        </div>
        {isBuildingAdminDashboard && (
          <BuildingAdminExportActions
            isExporting={isExportingDashboardPdf}
            error={dashboardPdfExportError}
            onExport={exportDashboardPdf}
            dateRangeLabel={selectedFilterFacilities.length
              ? `${heatmapDateRangeLabel} · ${selectedFilterFacilities.length === 1
                ? selectedFilterFacilityLabel
                : `${selectedFilterFacilities.length} facilities`}`
              : heatmapDateRangeLabel}
            resultCount={metrics.total}
            rankingMode={rankingModes.facilities}
            heatmapFacilities={venueTrafficHeatmaps}
          />
        )}
        {isRoomCheckerDashboard && (
          <RoomCheckerExportActions
            isExporting={isExportingDashboardPdf}
            error={dashboardPdfExportError}
            onExport={exportRoomCheckerDashboardReport}
          />
        )}
        {isMisDashboard && (
          <MisDashboardExportActions
            isExporting={isExportingMisDashboardPdf}
            error={misDashboardPdfExportError}
            onExport={exportMisDashboardReport}
            dateRangeLabel={heatmapDateRangeLabel}
            resultCount={metrics.total}
            rankingModes={rankingModes}
          />
        )}
      </header>

      {/* Operations include date filters, key metrics, approval queues, and upcoming events. */}
      <section className="dashboard-live-section" aria-label="Live operation">
        <section
          className={`dashboard-operations${isMisDashboard ? ' has-pending-accounts' : ''}`}
          aria-label="Dashboard operations"
        >

        <article className="dashboard-panel operations-panel approval-panel">
          <div className="panel-heading">
            <div>
              <h2>{hasAnalyticsDashboard ? 'Approval' : 'Requests needing your review'}</h2>
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

        {/* MIS: shown as a third, narrower column beside Approval and Upcoming Events. */}
        {isMisDashboard && (
          <MisDashboardPendingAccounts
            pendingUserCount={pendingUserCount}
            pendingProfileCount={pendingProfileCount}
            canManagePendingProfiles={canManagePendingProfiles}
          />
        )}
        </section>

        {isMisDashboard && (
          <div className="mis-inventory-panels">
            <MisDashboardEquipmentInventory equipment={equipmentTabAvailability} />
            <MisDashboardUtilityInventory utilities={utilityInventory} />
          </div>
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

      <section className="dashboard-filtered-section" aria-label="Filtered analytics">
        <div className="dashboard-section-heading">
          <h2>Filtered analytics</h2>
        </div>
      {hasAnalyticsDashboard ? (
        <>
          <DashboardFilters
            filters={filters}
            setFilters={setFilters}
            setDatePreset={setDatePreset}
            isAdminDashboard={isAdminDashboard}
            resultCount={metrics.total}
            checkboxFilters={isBuildingAdminDashboard
              ? [{ key: 'facilities', legend: 'Facilities', allLabel: 'All facilities', options: facilityFilterOptions }]
              : isMisDashboard
                ? [
                  { key: 'equipment', legend: 'Equipment', allLabel: 'All equipment', options: equipmentFilterOptions },
                  { key: 'utilities', legend: 'Utilities', allLabel: 'All utilities', options: utilityFilterOptions }
                ]
                : undefined}
          />
          {!isBuildingAdminDashboard && dashboardKpis}
          {/* Summarize reservation trends. */}
          <section className="dashboard-charts">
            <article className="dashboard-panel reservations-trend-panel">
              <div className="panel-heading">
                <div>
                  <h2>Reservation activity</h2>
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

            {isBuildingAdminDashboard && (
              <BuildingAdminVenueUtilization
                venues={liveVenueUtilization}
                dateRangeLabel={heatmapDateRangeLabel}
              />
            )}

            {isRoomCheckerDashboard && (
              <RoomCheckerOccupancy
                rooms={liveSpecificRoomOccupancy}
                startDate={filters.startDate}
                endDate={filters.endDate}
                formatDate={formatDate}
                parseDate={parseDate}
                formatTime={formatTime}
                onOpenReservation={(reservationId) => {
                  const reservation = reservationsData.find(
                    (item) => item.id === reservationId
                  );
                  if (reservation) {
                    setSelectedReservation({ data: reservation, source: 'active' });
                  }
                }}
              />
            )}

            {isRoomCheckerDashboard && (
              <RoomCheckerClassroomRankings
                reservedHours={specificRoomReservedHours}
                reservedHoursMaximum={specificRoomHoursMaximum}
                requestedRooms={facilitiesRanking}
                requestedRoomsMaximum={facilityMaximum}
                rankingMode={rankingModes.facilities}
                onRankingModeChange={(value) => (
                  setRankingModes((current) => ({ ...current, facilities: value }))
                )}
              />
            )}

            {isMisDashboard && (
              <MisDashboardEquipmentUsageHours
                equipment={equipmentHoursRanking}
                maximum={equipmentHoursMaximum}
                formatDate={formatDate}
                parseDate={parseDate}
                formatTime={formatTime}
              />
            )}

            {isMisDashboard && (
              <MisDashboardResourceConsumption chart={departmentalResourceChart} />
            )}

          </section>

          {isBuildingAdminDashboard && (
            <BuildingAdminVenueTraffic
              statusLabel={heatmapStatusLabel}
              dateRangeLabel={heatmapDateRangeLabel}
              venues={venueTrafficHeatmaps}
            />
          )}

          {/* Rank requested resources for the selected period. */}
          {hasAnalyticsDashboard && (
          <section className="dashboard-insights">
            {!isBuildingAdminDashboard && (
            <>
            {!isRoomCheckerDashboard && (
              <ResourceRankingPanel
                title="Equipment"
                modeLabel="Equipment"
                mode={rankingModes.equipment}
                onModeChange={(value) => setRankingModes((current) => ({ ...current, equipment: value }))}
                items={usageByEquipment}
                itemLabel="equipment"
                otherLabel="Other equipment"
                emptyMessage="No approved equipment requests match these filters."
              />
            )}

            {!isRoomCheckerDashboard && (
              <ResourceRankingPanel
                title="Utilities"
                modeLabel="Utilities"
                mode={rankingModes.utilities}
                onModeChange={(value) => setRankingModes((current) => ({ ...current, utilities: value }))}
                items={utilityUsage}
                itemLabel="utility"
                otherLabel="Other utility"
                trackClassName="utility-track"
                emptyMessage="No approved utility requests match these filters."
              />
            )}
            </>
            )}

            {isBuildingAdminDashboard ? (
              <BuildingAdminFacilityInsights
                rankingModes={rankingModes}
                setRankingModes={setRankingModes}
                facilities={buildingAdminFacilityUsage}
                matchedReservations={matchedReservationsPanel}
              />
            ) : !isMisDashboard && !isRoomCheckerDashboard && (
              <article className="dashboard-panel ranking-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{rankingModes.facilities === 'most' ? 'Most' : 'Least'} Requested Facilities</h2>
                    <p>
                      Approved facility and specific room reservations in the selected period
                      {rankingModes.facilities === 'least' ? ', including facilities with no bookings' : ''}.
                    </p>
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
            )}
          </section>
          )}

          {/* Show the latest approved equipment and utility activity. */}
          <section className="dashboard-lower">
            {isAdminDashboard && !isBuildingAdminDashboard && (
            <article className="dashboard-panel equipment-history-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent Approved Equipment</h2>                </div>
              </div>
              {recentEquipmentActivity.length ? (
                <div className="recent-resource-list">
                  {recentEquipmentActivity.map((equipment) => (
                    <RecentResourceRow
                      key={equipment.id}
                      item={equipment}
                      booking={equipment.lastBorrow}
                      fallbackName="Unnamed equipment"
                      formatTime={formatTime}
                      onOpen={(reservation) => setSelectedReservation({ data: reservation, source: 'active' })}
                    />
                  ))}
                </div>
              ) : (
                <p className="panel-empty">No approved equipment requests match these filters.</p>
              )}
            </article>
            )}

            {hasAnalyticsDashboard && !isBuildingAdminDashboard && !isRoomCheckerDashboard && (
              <article className="dashboard-panel equipment-history-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent Approved Utilities</h2>                  </div>
                </div>
                  {recentUtilityActivity.length ? (
                    <div className="recent-resource-list">
                      {recentUtilityActivity.map((utility) => (
                        <RecentResourceRow
                          key={utility.id}
                          item={utility}
                          booking={utility.lastReservation}
                          fallbackName="Unnamed utility"
                          formatTime={formatTime}
                          onOpen={(reservation) => setSelectedReservation({ data: reservation, source: 'active' })}
                        />
                      ))}
                  </div>
                ) : (
                  <p className="panel-empty">No approved utility requests match these filters.</p>
                )}
              </article>
            )}

            {!isBuildingAdminDashboard && matchedReservationsPanel}
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
      </section>

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