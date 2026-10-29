import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { auth, db } from '../Firebase';
import { APPROVAL_ROLE_HIERARCHY, isApprovalStepReady, normalizeApprovalRoleKey } from '../services/approvalWorkflow';
import { isReservationActive } from '../services/reservationStatus';
import "../styles/Dashboard.scss";

const ReservationDetails = lazy(() => import('./ReservationDetails'));

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

const getStatusClass = (status) => {
  const normalizedStatus = (status || 'Pending').toLowerCase();
  if (normalizedStatus === 'approved') return 'approved';
  if (normalizedStatus === 'rejected' || normalizedStatus === 'cancelled') return 'rejected';
  return 'pending';
};

const normalizeName = (value) => {
  const name = (value || '').replace(/\s*\(Student\)/i, '').trim();
  if (!name.includes(',')) return name;
  const [lastName, ...firstNames] = name.split(',');
  return `${firstNames.join(',').trim()} ${lastName.trim()}`.trim();
};

const DashboardFilters = ({ filters, setFilters, setDatePreset, isAdminDashboard }) => (
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
      <label>
        <span>Date from</span>
        <input
          type="date"
          value={filters.startDate}
          max={filters.endDate || undefined}
          onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
        />
      </label>
      <label>
        <span>Date to</span>
        <input
          type="date"
          value={filters.endDate}
          min={filters.startDate || undefined}
          onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
        />
      </label>
      <label>
        <span>Start time from</span>
        <input
          type="time"
          value={filters.startTime}
          onChange={(event) => setFilters((current) => ({
            ...current,
            startTime: event.target.value
          }))}
        />
      </label>
      <label>
        <span>Start time to</span>
        <input
          type="time"
          value={filters.endTime}
          onChange={(event) => setFilters((current) => ({
            ...current,
            endTime: event.target.value
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
          {isAdminDashboard && (
            <>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </>
          )}
        </select>
      </label>
    </div>
    <div className="date-presets" aria-label="Quick date ranges">
      <span>Quick range</span>
      <button type="button" onClick={() => setDatePreset(7)}>Last 7 days</button>
      <button type="button" onClick={() => setDatePreset(30)}>Last 30 days</button>
      <button type="button" onClick={() => setDatePreset(90)}>Last 90 days</button>
    </div>
  </section>
);

const DashboardKpis = ({ metrics, pendingApprovals, pendingUsers, isAdminDashboard }) => (
  <section className="dashboard-kpis admin-dashboard-kpis" aria-label="Key analytics">
    <article className="kpi-card kpi-primary">
      <span className="kpi-label">Reservations in range</span>
      <strong>{metrics.total}</strong>
      <span className="kpi-footnote">Across the selected filters</span>
    </article>
    <article className="kpi-card">
      <span className="kpi-label">Approved reservation</span>
      <strong>{metrics.approved}</strong>
      <span className="kpi-footnote">{metrics.reservedUnits} equipment units requested</span>
    </article>
    <article className="kpi-card">
      <span className="kpi-label">Awaiting review</span>
      <strong>{metrics.pending}</strong>
      <span className="kpi-footnote">{pendingApprovals} assigned to your approval role</span>
    </article>
    {isAdminDashboard && (
      <article className="kpi-card">
        <span className="kpi-label">Available equipment</span>
        <strong>{metrics.availableUnits}</strong>
        <span className="kpi-footnote">Units available in current inventory</span>
      </article>
    )}
    {isAdminDashboard && (
      <Link className="kpi-card pending-users-kpi" to="/user?filter=pending">
        <span className="kpi-label">Pending users</span>
        <strong>{pendingUsers}</strong>
        <span className="kpi-footnote">View accounts with pending roles</span>
      </Link>
    )}
  </section>
);

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
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardSearchQuery = searchParams.get('search') || '';
  const [reservationsData, setReservationsData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [utilitiesData, setUtilitiesData] = useState([]);
  const [facilitiesData, setFacilitiesData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [unavailableDatesData, setUnavailableDatesData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [upcomingDays, setUpcomingDays] = useState('7');
  const [customUpcomingDays, setCustomUpcomingDays] = useState('30');
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

  const closeDashboardSearch = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('search');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    return auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
  }, []);

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

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser]);

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
  ).length;

  useEffect(() => {
    if (!currentUser) return; // Added safeguard

    return onSnapshot(collection(db, 'archive'), (snapshot) => {
      setHistoryData(snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data()
      })));
    }, (error) => console.error('Failed to load reservation history:', error));
  }, [currentUser]);

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
      if (isStaffRequestor || !reservation.endorserName) return false;
      if (normalizeName(reservation.endorserName).toLowerCase() !== normalizeName(currentUserRecord?.name).toLowerCase()) {
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
  }), [reservationsData, usersData, approverRoleKey, currentUserRecord, isSuperAdmin]);
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

  const upcomingReservations = today && weekAhead
    ? reservationsData
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

  const startMinutes = parseTime(filters.startTime);
  const endMinutes = parseTime(filters.endTime);
  const startDate = filters.startDate ? parseDate(filters.startDate) : null;
  const endDate = filters.endDate ? parseDate(filters.endDate) : null;

  const filteredReservations = useMemo(() => reservationsData.filter((reservation) => {
    const reservationDate = parseDate(reservation.eventDate || reservation.date);
    if (!reservationDate) return false;
    if (startDate && reservationDate < startDate) return false;
    if (endDate && reservationDate > new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999)) {
      return false;
    }

    const status = (reservation.status || 'Pending').toLowerCase();
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
  }), [reservationsData, filters.status, startDate, endDate, startMinutes, endMinutes]);

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
      ]);
      const equipmentValues = Object.entries(reservation.selectedEquip || {})
        .filter(([, quantity]) => Number(quantity) > 0)
        .flatMap(([id, quantity]) => [
          id,
          equipmentById.get(id)?.name || '',
          quantity
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
        ...facilityValues,
        ...equipmentValues,
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
  }, [reservationsData, historyData, usersData, facilitiesById, equipmentById]);

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
    const approved = filteredReservations.filter(
      (reservation) => (reservation.status || '').toLowerCase() === 'approved'
    );
    const pending = filteredReservations.filter(
      (reservation) => (reservation.status || 'pending').toLowerCase() === 'pending'
    );
    const cancelled = filteredReservations.filter(
      (reservation) => (reservation.status || '').toLowerCase() === 'cancelled'
    );
    const rejected = filteredReservations.filter(
      (reservation) => (reservation.status || '').toLowerCase() === 'rejected'
    );
    const reservedUnits = approved.reduce((total, reservation) => (
      total + Object.values(reservation.selectedEquip || {}).reduce(
        (quantity, value) => quantity + (Number(value) || 0),
        0
      )
    ), 0);
    const availableUnits = equipmentInventory.reduce((total, equipment) => total + equipment.available, 0);

    return {
      total: filteredReservations.length,
      approved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      cancelled: cancelled.length,
      reservedUnits,
      availableUnits
    };
  }, [filteredReservations, equipmentInventory]);

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
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        const reservationDate = parseDate(reservation.eventDate || reservation.date);
        if (!reservationDate) return;
        Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
          if (Number(quantity) <= 0) return;
          const existing = lastBorrowedByEquipment.get(equipmentId);
          if (!existing || reservationDate > existing.date) {
            lastBorrowedByEquipment.set(equipmentId, {
              date: reservationDate,
              quantity: Number(quantity),
              borrower: reservation.fullName || reservation.userEmail || 'Unknown borrower',
              startTime: reservation.startTime || ''
            });
          }
        });
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
                startTime: reservation.startTime || ''
              });
            }
          });
      });

    return { recentReservations, lastBorrowedByEquipment, lastReservedByUtility };
  }, [filteredReservations, facilitiesById, equipmentById]);

  const usageByEquipment = useMemo(() => {
    const totals = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
          const amount = Number(quantity) || 0;
          totals.set(equipmentId, (totals.get(equipmentId) || 0) + amount);
        });
      });

    return [...totals.entries()]
      .map(([id, quantity]) => ({
        id,
        quantity,
        name: equipmentById.get(id)?.name || 'Equipment'
      }))
      .sort((first, second) => second.quantity - first.quantity)
      .slice(0, 5);
  }, [filteredReservations, equipmentById]);

  const utilityUsage = useMemo(() => {
    const totals = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        (Array.isArray(reservation.selectedUtilities) ? reservation.selectedUtilities : [])
          .forEach((utilityId) => {
            const quantity = Number(reservation.selectedUtilityUnits?.[utilityId] ?? 1);
            if (!Number.isFinite(quantity) || quantity <= 0) return;
            totals.set(utilityId, (totals.get(utilityId) || 0) + quantity);
          });
      });

    return [...totals.entries()]
      .map(([id, quantity]) => ({
        id,
        quantity,
        name: utilitiesById.get(id)?.name || 'Utility'
      }))
      .sort((first, second) => second.quantity - first.quantity)
      .slice(0, 5);
  }, [filteredReservations, utilitiesById]);

  const facilityUsage = useMemo(() => {
    const totals = new Map();
    filteredReservations
      .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
      .forEach((reservation) => {
        (reservation.facilities || []).forEach((facilityId) => {
          totals.set(facilityId, (totals.get(facilityId) || 0) + 1);
        });
      });

    return [...totals.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: facilitiesById.get(id)?.name || 'Facility'
      }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 5);
  }, [filteredReservations, facilitiesById]);

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
        count: filteredReservations.filter((reservation) => {
          const date = parseDate(reservation.eventDate || reservation.date);
          return date && date >= bucketStart && date < bucketEnd;
        }).length
      };
    });
    return buckets;
  }, [filteredReservations, startDate, endDate]);

  const facilitiesAvailable = facilitiesData.filter((facility) => facility.status === 'Available').length;
  const facilitiesUnderMaintenance = facilitiesData.filter((facility) => facility.status === 'Maintenance').length;
  const facilitiesUnavailable = facilitiesData.filter((facility) => facility.status === 'Unavailable').length;
  const resourceAlerts = useMemo(() => {
    const alerts = [];
    const today = parseDate(todayKey);
    if (today) {
      const monthAhead = new Date(today);
      monthAhead.setDate(monthAhead.getDate() + 30);
      monthAhead.setHours(23, 59, 59, 999);
      unavailableDatesData
        .map((unavailableDate) => ({
          ...unavailableDate,
          dateValue: parseDate(unavailableDate.date || unavailableDate.id)
        }))
        .filter((unavailableDate) => (
          unavailableDate.dateValue
          && unavailableDate.dateValue >= today
          && unavailableDate.dateValue <= monthAhead
        ))
        .sort((first, second) => first.dateValue - second.dateValue)
        .slice(0, 3)
        .forEach((unavailableDate) => alerts.push({
          key: `unavailable-date-${unavailableDate.id}`,
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
        title: equipment.name || 'Unnamed equipment',
        detail: `${equipment.available} of ${equipment.total} units available`,
        link: '/equipment'
      })));

    facilitiesData
      .filter((facility) => ['maintenance', 'unavailable'].includes((facility.status || '').toLowerCase()))
      .forEach((facility) => alerts.push({
        key: `facility-${facility.id}`,
        title: facility.name || 'Unnamed facility',
        detail: `Facility status: ${facility.status}`,
        link: '/facility'
      }));

    if (today) {
      const weekAhead = new Date(today);
      weekAhead.setDate(weekAhead.getDate() + 7);
      weekAhead.setHours(23, 59, 59, 999);

      const reservationGroups = new Map();

      reservationsData
        .filter((reservation) => (reservation.status || '').toLowerCase() === 'approved')
        .forEach((reservation) => {
          const date = parseDate(reservation.eventDate || reservation.date);
          const start = parseTime(reservation.startTime);
          const end = parseTime(reservation.endTime);
          if (!date || date < today || date > weekAhead || start === null || end === null || end <= start) return;

          (reservation.facilities || []).forEach((facilityId) => {
            const key = `${toDateInputValue(date)}-${facilityId}`;
            const group = reservationGroups.get(key) || [];
            group.push({ reservation, date, start, end, facilityId });
            reservationGroups.set(key, group);
          });
        });

      const conflicts = [];
      for (const group of reservationGroups.values()) {
        group.sort((first, second) => first.start - second.start);
        for (let firstIndex = 0; firstIndex < group.length && conflicts.length < 6; firstIndex += 1) {
          const first = group[firstIndex];
          for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
            const second = group[secondIndex];
            if (second.start >= first.end) break;
            if (first.reservation.id === second.reservation.id) continue;
            conflicts.push({
              key: `conflict-${first.reservation.id}-${second.reservation.id}-${first.facilityId}`,
              title: facilitiesById.get(first.facilityId)?.name || 'Facility',
              detail: `${first.reservation.eventName || 'Reservation'} overlaps ${second.reservation.eventName || 'another reservation'} on ${formatDate(first.date)}`,
              link: '/calendar'
            });
            if (conflicts.length >= 6) break;
          }
        }
      }
      alerts.push(...conflicts);
    }

    return alerts.slice(0, 8);
  }, [equipmentInventory, facilitiesData, reservationsData, unavailableDatesData, facilitiesById, todayKey]);
  const chartMaximum = Math.max(1, ...trendData.map((bucket) => bucket.count));
  const equipmentMaximum = Math.max(1, ...usageByEquipment.map((equipment) => equipment.quantity));
  const utilityMaximum = Math.max(1, ...utilityUsage.map((utility) => utility.quantity));
  const facilityMaximum = Math.max(1, ...facilityUsage.map((facility) => facility.count));
  const formatTime = (time) => time || 'Time not set';

  const setDatePreset = (days) => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * DAY_IN_MS);
    setFilters((current) => ({
      ...current,
      startDate: toDateInputValue(start),
      endDate: toDateInputValue(end)
    }));
  };

  return (
    <div className={`mis-dashboard-content ${isAdminDashboard ? 'admin-dashboard' : hasAnalyticsDashboard ? 'staff-dashboard' : 'personal-dashboard'}`}>
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>{isAdminDashboard ? 'Admin dashboard' : 'Dashboard'}</h1>
        </div>
      </header>

      <section className="dashboard-operations" aria-label="Dashboard operations">
        {hasAnalyticsDashboard && (
          <DashboardFilters
            filters={filters}
            setFilters={setFilters}
            setDatePreset={setDatePreset}
            isAdminDashboard={isAdminDashboard}
          />
        )}
        {hasAnalyticsDashboard && (
          <DashboardKpis
            metrics={metrics}
            pendingApprovals={pendingApprovals}
            pendingUsers={pendingUserCount}
            isAdminDashboard={isAdminDashboard}
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
            </div>
            {resourceAlerts.length ? (
              <div className="resource-alert-list">
                {resourceAlerts.map((alert) => (
                  <div className="resource-alert-row" key={alert.key}>
                    <span className="resource-alert-icon">!</span>
                    <div>
                      <strong>{alert.title}</strong>
                      <span title={alert.detail}>{alert.detail}</span>
                    </div>
                    <Link to={alert.link}>View</Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-empty">No low-stock items, facility issues, or schedule conflicts were detected.</p>
            )}
          </article>
        )}

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
            {filteredSearchReservations.length ? (
              <div className="reservation-search-results">
                {filteredSearchReservations.map((reservation) => {
                  const facilityNames = (reservation.facilities || [])
                    .map((id) => facilitiesById.get(id)?.name || id);
                  const equipmentNames = Object.entries(reservation.selectedEquip || {})
                    .filter(([, quantity]) => Number(quantity) > 0)
                    .map(([id, quantity]) => `${quantity} × ${equipmentById.get(id)?.name || id}`);
                  if (typeof reservation.otherEquipment === 'string' && reservation.otherEquipment.trim()) {
                    equipmentNames.push(reservation.otherEquipment.trim());
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
                          {' · '}{reservation.startTime || 'Time not set'}
                          {' · '}{facilityNames.join(', ') || 'No facility'}
                        </span>
                        <span>{equipmentNames.join(', ') || 'No equipment listed'}</span>
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
          <section className="dashboard-charts">
            <article className="dashboard-panel reservations-trend-panel">
              <div className="panel-heading">
                <div>
                  <h2>Reservation activity</h2>
                  <p>Requests created for events within the selected date range.</p>
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
                <span><i className="status-key rejected" /> Rejected <strong>{metrics.rejected + metrics.cancelled}</strong></span>
              </div>
            </article>

            {isAdminDashboard && (
            <article className="dashboard-panel resource-summary-panel">
              <div className="panel-heading">
                <div>
                  <h2>Resource snapshot</h2>
                  <p>Current state of managed facilities and equipment.</p>
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
                  <span>Facility directory</span>
                  <strong>{facilitiesData.length} <small>facilities</small></strong>
                </div>
                <span className="resource-stat-detail">{facilitiesAvailable} available now</span>
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

          {hasAnalyticsDashboard && (
          <section className="dashboard-insights">
            <article className="dashboard-panel ranking-panel">
              <div className="panel-heading">
                <div>
                  <h2>Most Requested Equipment</h2>
                  <p>Approved equipment units in the selected period.</p>
                </div>
              </div>
              {usageByEquipment.length ? (
                <div className="ranking-list">
                  {usageByEquipment.map((equipment, index) => (
                    <div className="ranking-row" key={equipment.id}>
                      <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                      <span className="ranking-name" title={equipment.name}>{equipment.name}</span>
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
                  <h2>Most Requested Utilities</h2>
                  <p>Approved utility units in the selected period.</p>
                </div>
              </div>
              {utilityUsage.length ? (
                <div className="ranking-list">
                  {utilityUsage.map((utility, index) => (
                    <div className="ranking-row" key={utility.id}>
                      <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
                      <span className="ranking-name" title={utility.name}>{utility.name}</span>
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
                  <h2>Most Requested Facilities</h2>
                  <p>Approved facility reservations in the selected period.</p>
                </div>
              </div>
              {facilityUsage.length ? (
                <div className="ranking-list">
                  {facilityUsage.map((facility, index) => (
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

          <section className="dashboard-lower">
            {isAdminDashboard && (
            <article className="dashboard-panel equipment-history-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent Approved Equipment</h2>
                  <p>Most recent approved booking for each equipment item in range.</p>
                </div>
              </div>
              {equipmentData.length ? (
                <div className="equipment-history-list">
                  {equipmentData
                    .map((equipment) => ({
                      ...equipment,
                      lastBorrow: activity.lastBorrowedByEquipment.get(equipment.id)
                    }))
                    .sort((first, second) => {
                      const firstTime = first.lastBorrow?.date.getTime() || 0;
                      const secondTime = second.lastBorrow?.date.getTime() || 0;
                      return secondTime - firstTime;
                    })
                    .slice(0, 6)
                    .map((equipment) => (
                      <div className="equipment-history-row" key={equipment.id}>
                        <div className="equipment-initial">{(equipment.name || 'E').slice(0, 1).toUpperCase()}</div>
                        <div className="equipment-history-name">
                          <strong>{equipment.name || 'Unnamed equipment'}</strong>
                          <span className="equipment-history-sku">{equipment.sku || 'No SKU'}</span>
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
                          </div>
                        ) : (
                          <div className="equipment-history-borrow no-history">
                            <strong>No recent booking</strong>
                            <span>Nothing approved in this date range</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="panel-empty">No equipment has been added to the inventory.</p>
              )}
            </article>
            )}

            {hasAnalyticsDashboard && (
              <article className="dashboard-panel equipment-history-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent Approved Utilities</h2>
                    <p>Most recent approved booking for each utility in range.</p>
                  </div>
                </div>
                {utilitiesData.length ? (
                  <div className="equipment-history-list">
                    {utilitiesData
                      .map((utility) => ({
                        ...utility,
                        lastReservation: activity.lastReservedByUtility.get(utility.id)
                      }))
                      .sort((first, second) => {
                        const firstTime = first.lastReservation?.date.getTime() || 0;
                        const secondTime = second.lastReservation?.date.getTime() || 0;
                        return secondTime - firstTime;
                      })
                      .slice(0, 6)
                      .map((utility) => (
                        <div className="equipment-history-row" key={utility.id}>
                          <div className="equipment-initial">{(utility.name || 'U').slice(0, 1).toUpperCase()}</div>
                          <div className="equipment-history-name">
                            <strong>{utility.name || 'Unnamed utility'}</strong>
                            <span className="equipment-history-sku">{utility.sku || 'No SKU'}</span>
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
                            </div>
                          ) : (
                            <div className="equipment-history-borrow no-history">
                              <strong>No recent booking</strong>
                              <span>Nothing approved in this date range</span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="panel-empty">No utilities have been added to the inventory.</p>
                )}
              </article>
            )}

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

const Dashboard = ({ currentUserRole }) => {
  const normalizedRole = (currentUserRole || '').toLowerCase().trim().replace(/_/g, ' ');
  return normalizedRole === 'pending'
    ? <PendingAccountDashboard />
    : <DashboardContent currentUserRole={currentUserRole} />;
};

export default Dashboard;