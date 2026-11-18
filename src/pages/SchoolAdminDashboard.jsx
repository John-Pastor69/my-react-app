import React, { useEffect, useState } from 'react';
import { SectionExportActions } from './DashboardShared';

// School Admin dashboard pieces. The shared Dashboard renders the common parts (approvals, upcoming
// events, Filter by Date, Reservation activity); everything School Admin-specific lives here.

export const isSchoolAdminRole = (role) => (
  String(role || '').toLowerCase().trim().replace(/_/g, ' ') === 'school admin'
);

// "Export dashboard PDF" for the School Admin: choose which sections go in the PDF.
export const SchoolAdminExportActions = (props) => (
  <SectionExportActions
    {...props}
    sections={[
      { key: 'activity', label: 'Reservation activity' },
      { key: 'aircon', label: 'Aircon-Hours' },
      { key: 'maintenance', label: 'Equipment Maintenance Index' },
      { key: 'matched', label: 'Matched reservations' }
    ]}
  />
);

const formatHours = (hours) => `${(Number(hours) || 0).toFixed(1)} h`;

const AirconUsageRows = ({ items, maximum, ariaLabel }) => (
  <div className="ranking-list" tabIndex={0} aria-label={ariaLabel}>
    {items.map((item, index) => (
      <div className="ranking-row" key={item.id}>
        <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
        <span className="ranking-name" title={item.name}>
          {item.name}
          <small className="aircon-usage-reservations">
            {item.reservations} reservation{item.reservations === 1 ? '' : 's'}
          </small>
        </span>
        <div className="ranking-track" aria-hidden="true">
          <span style={{ width: `${item.hours / maximum * 100}%` }} />
        </div>
        <strong>{formatHours(item.hours)}</strong>
      </div>
    ))}
  </div>
);

// Scheduled aircon-hours of approved reservations in the Filter by Date range: a campus total, then the
// top 3 facilities/rooms (View All for the rest). Measures booked cooling time, not metered electricity.
const SchoolAdminAirconUsage = ({ usage, dateRangeLabel }) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  const items = usage?.items || [];
  const maximum = Math.max(1, ...items.map((item) => item.hours));

  useEffect(() => {
    if (!isAllOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsAllOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAllOpen]);

  return (
    <article className="dashboard-panel ranking-panel aircon-usage-panel">
      <div className="panel-heading">
        <div>
          <h2>Aircon-Hours</h2>
        </div>
      </div>
      <div className="aircon-usage-total" aria-live="polite">
        <strong>{formatHours(usage?.totalHours)}</strong>
        <span>
          total across {items.length} facilit{items.length === 1 ? 'y' : 'ies'} and room{items.length === 1 ? '' : 's'}
        </span>
      </div>
      {items.length ? (
        <>
          <AirconUsageRows items={items.slice(0, 3)} maximum={maximum} ariaLabel="Facilities ranked by aircon-hours" />
          {items.length > 3 && (
            <button className="venue-utilization-view-all" type="button" onClick={() => setIsAllOpen(true)}>
              View All ({items.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No approved reservations with aircon match the selected filters.</p>
      )}

      {isAllOpen && (
        <div
          className="specific-rooms-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsAllOpen(false);
          }}
        >
          <section
            className="specific-rooms-dialog equipment-inventory-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aircon-usage-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="aircon-usage-all-title">All Aircon-Hours</h2>
                <p>{formatHours(usage?.totalHours)} total, {dateRangeLabel}.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all aircon-hours"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list equipment-inventory-modal-list">
              <AirconUsageRows items={items} maximum={maximum} ariaLabel="All facilities ranked by aircon-hours" />
            </div>
          </section>
        </div>
      )}
    </article>
  );
};

const MAINTENANCE_LEVEL_LABELS = {
  healthy: 'Healthy',
  watch: 'Warning',
  critical: 'Critical'
};

// Half-circle gauge for a 0–100% value.
const SemiCircleGauge = ({ percent, level, label }) => {
  const radius = 80;
  const circumference = Math.PI * radius;
  const shown = Math.min(100, Math.max(0, percent));
  return (
    <svg className={`maintenance-gauge is-${level}`} viewBox="0 0 200 128" role="img" aria-label={label}>
      <path className="maintenance-gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" />
      <path
        className="maintenance-gauge-fill"
        d="M 20 100 A 80 80 0 0 1 180 100"
        strokeDasharray={`${circumference * shown / 100} ${circumference}`}
      />
      <text className="maintenance-gauge-value" x="100" y="92" textAnchor="middle">
        {percent.toFixed(1)}%
      </text>
      <text className="maintenance-gauge-scale" x="20" y="126" textAnchor="middle">0%</text>
      <text className="maintenance-gauge-scale" x="180" y="126" textAnchor="middle">100%</text>
    </svg>
  );
};

// Equipment Maintenance Index: share of all equipment units currently under maintenance (live inventory,
// not tied to Filter by Date). Healthy < 15%, Warning 15–25%, Critical > 25%. Each item is coloured by
// its own share under maintenance.
const MaintenanceItemList = ({ items, ariaLabel }) => (
  <ul className="maintenance-index-items" aria-label={ariaLabel}>
    {items.map((item) => (
      <li key={item.id}>
        <span>{item.name}</span>
        <strong className={`is-${item.level}`}>
          {item.underMaintenance} of {item.total} units
          <small> ({Math.round(item.percent)}%)</small>
        </strong>
      </li>
    ))}
  </ul>
);

export const SchoolAdminMaintenanceIndex = ({ index }) => {
  const levelLabel = MAINTENANCE_LEVEL_LABELS[index.level];
  const [isAllOpen, setIsAllOpen] = useState(false);

  useEffect(() => {
    if (!isAllOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsAllOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAllOpen]);
  return (
    <article className="dashboard-panel maintenance-index-panel">
      <div className="panel-heading">
        <div>
          <h2>Equipment Maintenance Index</h2>
          <p>Share of all equipment units currently under maintenance (live inventory).</p>
        </div>
      </div>
      {index.totalUnits ? (
        <div className="maintenance-index-body">
          <div className="maintenance-index-gauge">
            <SemiCircleGauge
              percent={index.percent}
              level={index.level}
              label={`${index.percent.toFixed(1)}% of equipment under maintenance, ${levelLabel}`}
            />
            <span className={`maintenance-index-level is-${index.level}`}>{levelLabel}</span>
            <p>
              <strong>{index.underMaintenance}</strong> of {index.totalUnits} units under maintenance
            </p>
          </div>
          <div className="maintenance-index-details">
            <p className="maintenance-index-scale">Healthy below 15% · Warning 15–25% · Critical above 25%</p>
            {index.items.length ? (
              <>
                <MaintenanceItemList items={index.items.slice(0, 3)} ariaLabel="Equipment under maintenance" />
                {index.items.length > 3 && (
                  <button className="venue-utilization-view-all" type="button" onClick={() => setIsAllOpen(true)}>
                    View More ({index.items.length})
                  </button>
                )}
              </>
            ) : (
              <p className="panel-empty">No equipment is under maintenance.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="panel-empty">No equipment inventory to measure.</p>
      )}

      {isAllOpen && (
        <div
          className="specific-rooms-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsAllOpen(false);
          }}
        >
          <section
            className="specific-rooms-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-index-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="maintenance-index-all-title">All Equipment Under Maintenance</h2>
                <p>{index.underMaintenance} of {index.totalUnits} units ({index.percent.toFixed(1)}%), most first.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all equipment under maintenance"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list maintenance-index-modal-list">
              <MaintenanceItemList items={index.items} ariaLabel="All equipment under maintenance" />
            </div>
          </section>
        </div>
      )}
    </article>
  );
};

// School Admin's analytics below Reservation activity: Aircon-Hours, then Matched reservations.
// (No equipment, utility, or facility rankings and no recent-approval lists.) The Equipment Maintenance
// Index is shown above Filtered analytics, since it is live inventory rather than filtered data.
export const SchoolAdminDashboardInsights = ({
  airconUsage,
  dateRangeLabel,
  matchedReservations
}) => (
  <section className="matched-only-insights" aria-label="School Admin filtered analytics">
    {airconUsage && <SchoolAdminAirconUsage usage={airconUsage} dateRangeLabel={dateRangeLabel} />}
    {matchedReservations}
  </section>
);
