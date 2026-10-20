import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../Firebase';
import "../styles/Dashboard.scss";

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

const Dashboard = ({ currentUserRole }) => {
  const [reservationsData, setReservationsData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);
  const [facilitiesData, setFacilitiesData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 29 * DAY_IN_MS);
    return {
      startDate: toDateInputValue(thirtyDaysAgo),
      endDate: toDateInputValue(today),
      startTime: '',
      endTime: '',
      status: 'all'
    };
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });

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
      }, (error) => console.error('Failed to load users:', error))
    ];

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const currentUserRecord = usersData.find(
    (user) => user.uid === currentUser?.uid || user.id === currentUser?.uid
  );
  const approverRoleKey = currentUserRecord?.role?.toLowerCase().trim() || '';
  const dashboardRole = (currentUserRole || approverRoleKey)
    .toLowerCase()
    .trim()
    .replace(/_/g, ' ');
  const isAdminDashboard = ['building admin', 'mis', 'mis admin'].includes(dashboardRole);
  const roleHierarchy = ['requestor', 'endorser', 'building admin', 'osa', 'mis', 'academic head', 'school admin'];

  const scheduleCount = currentUser
    ? reservationsData.filter(
      (reservation) => reservation.userId === currentUser.uid || reservation.userEmail === currentUser.email
    ).length
    : 0;

  const pendingApprovals = reservationsData.filter((reservation) => {
    if (!approverRoleKey) return false;

    const myRecord = reservation.approvals?.[approverRoleKey];
    if (myRecord?.status === 'approved' || myRecord?.status === 'rejected') return false;
    if (reservation.status === 'Rejected' || reservation.status === 'Approved') return false;

    const myIndex = roleHierarchy.indexOf(approverRoleKey);
    if (myIndex <= 0) return false;

    const requestor = usersData.find(
      (user) => user.email === reservation.userEmail || user.uid === reservation.userId
    ) || {};
    const requestorRole = (requestor.role || 'requestor').toLowerCase().trim();
    const isStaffRequestor = requestorRole !== 'requestor' && requestorRole !== 'user';
    const hasEndorser = !!reservation.endorserName;

    if (approverRoleKey === 'endorser' && isStaffRequestor) return false;

    const previousRole = roleHierarchy[myIndex - 1];
    let previousStepApproved = false;
    if (previousRole === 'requestor') {
      previousStepApproved = true;
    } else if (previousRole === 'endorser') {
      previousStepApproved = isStaffRequestor || !hasEndorser
        ? true
        : reservation.approvals?.endorser?.status === 'approved';
    } else {
      previousStepApproved = reservation.approvals?.[previousRole]?.status === 'approved';
    }

    return previousStepApproved;
  }).length;

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
  const facilitiesById = useMemo(
    () => new Map(facilitiesData.map((facility) => [facility.id, facility])),
    [facilitiesData]
  );

  const equipmentInventory = useMemo(() => equipmentData.map((equipment) => {
    const reserved = reservationsData.reduce((total, reservation) => {
      const status = (reservation.status || '').toLowerCase();
      if (status === 'rejected' || status === 'cancelled') return total;
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
      .slice(0, 6)
      .map((reservation) => {
        const facilityNames = (reservation.facilities || [])
          .map((id) => facilitiesById.get(id)?.name || id)
          .filter(Boolean);
        const equipmentNames = Object.entries(reservation.selectedEquip || {})
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([id, quantity]) => `${quantity} × ${equipmentById.get(id)?.name || 'Equipment'}`);

        return {
          ...reservation,
          facilityNames,
          equipmentNames,
          eventDateValue: parseDate(reservation.eventDate || reservation.date)
        };
      });

    const lastBorrowedByEquipment = new Map();
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
      });

    return { recentReservations, lastBorrowedByEquipment };
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
  const chartMaximum = Math.max(1, ...trendData.map((bucket) => bucket.count));
  const equipmentMaximum = Math.max(1, ...usageByEquipment.map((equipment) => equipment.quantity));
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
    <div className={`mis-dashboard-content ${isAdminDashboard ? 'admin-dashboard' : 'personal-dashboard'}`}>
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>{isAdminDashboard ? 'Admin dashboard' : 'Dashboard'}</h1>
        </div>
      </header>

      {isAdminDashboard ? (
        <>
          <section className="dashboard-filters" aria-label="Dashboard filters">
            <div className="filter-heading">
              <div>
                <h2>Analytics filters</h2>
                <p>Filter booking metrics by event date, start time, and status.</p>
              </div>
              <button
                className="filter-reset"
                type="button"
                onClick={() => {
                  const today = new Date();
                  const thirtyDaysAgo = new Date(today.getTime() - 29 * DAY_IN_MS);
                  setFilters({
                    startDate: toDateInputValue(thirtyDaysAgo),
                    endDate: toDateInputValue(today),
                    startTime: '',
                    endTime: '',
                    status: 'all'
                  });
                }}
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
                  onChange={(event) => setFilters((current) => ({ ...current, startTime: event.target.value }))}
                />
              </label>
              <label>
                <span>Start time to</span>
                <input
                  type="time"
                  value={filters.endTime}
                  onChange={(event) => setFilters((current) => ({ ...current, endTime: event.target.value }))}
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
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
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

          <section className="dashboard-kpis" aria-label="Key analytics">
            <article className="kpi-card kpi-primary">
              <span className="kpi-label">Reservations in range</span>
              <strong>{metrics.total}</strong>
              <span className="kpi-footnote">Across the selected filters</span>
              <span className="kpi-symbol">R</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Approved bookings</span>
              <strong>{metrics.approved}</strong>
              <span className="kpi-footnote">{metrics.reservedUnits} equipment units requested</span>
              <span className="kpi-symbol kpi-success">✓</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Awaiting review</span>
              <strong>{metrics.pending}</strong>
              <span className="kpi-footnote">{pendingApprovals} assigned to your approval role</span>
              <span className="kpi-symbol kpi-warning">!</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Available equipment</span>
              <strong>{metrics.availableUnits}</strong>
              <span className="kpi-footnote">Units available in current inventory</span>
              <span className="kpi-symbol kpi-neutral">E</span>
            </article>
          </section>

          <section className="dashboard-charts">
            <article className="dashboard-panel reservations-trend-panel">
              <div className="panel-heading">
                <div>
                  <h2>Reservation activity</h2>
                  <p>Requests created for events within the selected date range.</p>
                </div>
                <span className="panel-total">{metrics.total} total</span>
              </div>
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
              <div className="status-breakdown">
                <span><i className="status-key approved" /> Approved <strong>{metrics.approved}</strong></span>
                <span><i className="status-key pending" /> Pending <strong>{metrics.pending}</strong></span>
                <span><i className="status-key rejected" /> Rejected <strong>{metrics.rejected + metrics.cancelled}</strong></span>
              </div>
            </article>

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
              <p className="snapshot-note">{usersData.length} registered users in the system</p>
            </article>
          </section>

          <section className="dashboard-insights">
            <article className="dashboard-panel ranking-panel">
              <div className="panel-heading">
                <div>
                  <h2>Most requested equipment</h2>
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
                  <h2>Most booked facilities</h2>
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

          <section className="dashboard-lower">
            <article className="dashboard-panel equipment-history-panel">
              <div className="panel-heading">
                <div>
                  <h2>Latest approved equipment reservations</h2>
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
                          <span>{equipment.sku || 'No SKU'}</span>
                        </div>
                        {equipment.lastBorrow ? (
                          <div className="equipment-history-borrow">
                            <strong>{equipment.lastBorrow.borrower}</strong>
                            <span>
                              {formatDate(equipment.lastBorrow.date)}
                              {equipment.lastBorrow.startTime ? ` · ${formatTime(equipment.lastBorrow.startTime)}` : ''}
                              {' · '}{equipment.lastBorrow.quantity} unit{equipment.lastBorrow.quantity === 1 ? '' : 's'}
                            </span>
                          </div>
                        ) : (
                          <div className="equipment-history-borrow no-history">No approved booking in range</div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="panel-empty">No equipment has been added to the inventory.</p>
              )}
            </article>

            <article className="dashboard-panel recent-activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent reservations</h2>
                  <p>Latest requests matching your filters.</p>
                </div>
              </div>
              {activity.recentReservations.length ? (
                <div className="recent-reservations-list">
                  {activity.recentReservations.map((reservation) => (
                    <div className="recent-reservation" key={reservation.id}>
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
                      </div>
                    </div>
                  ))}
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
    </div>
  );
};

export default Dashboard;
