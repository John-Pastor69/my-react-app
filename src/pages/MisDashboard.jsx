import React from 'react';
import { Link } from 'react-router-dom';

export const MisDashboardExportActions = ({
  isExporting,
  error,
  onExport
}) => (
  <div className="dashboard-export-actions">
    <button
      className="dashboard-export-button"
      type="button"
      onClick={onExport}
      disabled={isExporting}
    >
      {isExporting ? 'Generating PDF...' : 'Export dashboard PDF'}
    </button>
    {error && (
      <span className="dashboard-export-error" role="alert">
        {error}
      </span>
    )}
  </div>
);

export const MisDashboardPendingAccounts = ({
  pendingUserCount,
  pendingProfileCount,
  canManagePendingProfiles
}) => (
  <article className="dashboard-panel pending-account-panel">
    <div className="panel-heading">
      <div>
        <h2>Pending account reviews</h2>
        <p>Review user accounts and profile changes awaiting approval.</p>
      </div>
    </div>
    <div className="pending-account-actions">
      <Link className="pending-account-action" to="/user?filter=pending">
        <span>Pending users</span>
        <strong>{pendingUserCount}</strong>
        <small>View accounts with pending roles</small>
      </Link>
      {canManagePendingProfiles && (
        <Link className="pending-account-action" to="/user?filter=pending-profile">
          <span>Pending profiles</span>
          <strong>{pendingProfileCount}</strong>
          <small>Review profile picture and cover changes</small>
        </Link>
      )}
    </div>
  </article>
);

export const MisDashboardEquipmentInventory = ({ equipment }) => (
  <section className="dashboard-panel equipment-burn-panel" aria-live="polite">
    <div className="panel-heading">
      <div>
        <h2>Equipment inventory</h2>
        <p>Live availability</p>
      </div>
    </div>
    {equipment.length ? (
      <div className="equipment-burn-list">
        {equipment.map((item) => (
          <Link
            className="equipment-burn-item"
            key={item.id}
            to="/equipment"
            aria-label={`${item.name || 'Equipment'} inventory outlook. Open equipment management.`}
          >
            <div className="equipment-burn-item-heading">
              <strong>{item.name || 'Unnamed equipment'}</strong>
              <span className={item.total === 0
                ? 'equipment-burn-status no-stock'
                : item.isUnavailable
                  ? 'equipment-burn-status unavailable'
                  : item.isRunningLow
                    ? 'equipment-burn-status running-low'
                    : 'equipment-burn-status'}>
                {item.total === 0
                  ? 'No stock'
                  : item.isUnavailable
                    ? 'Unavailable'
                    : item.isRunningLow
                      ? 'Running low'
                      : 'On track'}
              </span>
            </div>
            <div className="equipment-burn-meter">
              <strong>{item.available} available</strong>
              <span>{item.reserved} reserved</span>
              <span className="equipment-burn-maintenance">
                {item.underMaintenance} under maintenance
              </span>
              <span className="equipment-burn-total">{item.total} total units</span>
              <div
                className={`equipment-burn-bar${item.percentAvailable <= 20 ? ' is-low' : ''}`}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.percentAvailable}
                aria-label={`${item.available} of ${item.total} units available`}
              >
                <span style={{ width: `${item.percentAvailable}%` }} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    ) : (
      <p className="panel-empty">No equipment inventory to display.</p>
    )}
  </section>
);

export const MisDashboardUtilityInventory = ({ utilities }) => (
  <section className="dashboard-panel equipment-burn-panel" aria-live="polite">
    <div className="panel-heading">
      <div>
        <h2>Utility inventory</h2>
        <p>Live reservations and status</p>
      </div>
    </div>
    {utilities.length ? (
      <div className="equipment-burn-list">
        {utilities.map((utility) => (
          <Link
            className="equipment-burn-item"
            key={utility.id}
            to="/equipment#utilities"
            aria-label={`${utility.name || 'Utility'} inventory. ${utility.reserved} reserved. ${utility.status}. Open utilities.`}
          >
            <div className="equipment-burn-item-heading">
              <strong>{utility.name || 'Unnamed utility'}</strong>
              <span className={`equipment-burn-status${utility.status === 'Unavailable' ? ' unavailable' : ''}`}>
                {utility.status}
              </span>
            </div>
            <div className="equipment-burn-meter">
              <strong>{utility.reserved} reserved</strong>
            </div>
          </Link>
        ))}
      </div>
    ) : (
      <p className="panel-empty">No utility inventory to display.</p>
    )}
  </section>
);

export const MisDashboardEquipmentUsageHours = ({
  equipment,
  maximum,
  formatDate,
  parseDate,
  formatTime
}) => (
  <article className="dashboard-panel ranking-panel equipment-hours-panel">
    <div className="panel-heading">
      <div>
        <h2>Equipment usage hours</h2>
        <p>
          Estimated reserved equipment-hours from approved reservations in the selected period.
          Each session shows hours per unit multiplied by quantity.
        </p>
      </div>
    </div>
    {equipment.length ? (
      <div className="ranking-list" tabIndex={0} aria-label="Equipment ranked by reserved hours">
        {equipment.map((item, index) => (
          <div className="equipment-hours-entry" key={item.id}>
            <div className="ranking-row">
              <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
              <span
                className="ranking-name"
                title={item.isOtherRequest ? `Other equipment: ${item.name}` : item.name}
              >
                {item.isOtherRequest ? `Other: ${item.name}` : item.name}
              </span>
              <div className="ranking-track" aria-hidden="true">
                <span style={{ width: `${item.hours / maximum * 100}%` }} />
              </div>
              <strong>{item.hours.toFixed(1)} h</strong>
            </div>
            <details className="equipment-hours-details">
              <summary>View session breakdown ({item.sessions.length})</summary>
              <ul className="equipment-hours-sessions" aria-label={`${item.name} scheduled sessions`}>
                {item.sessions.map((session, sessionIndex) => (
                  <li
                    className="equipment-hours-session"
                    key={`${session.date}-${session.startTime}-${session.endTime}-${sessionIndex}`}
                  >
                    <span>
                      {formatDate(parseDate(session.date))},{' '}
                      {formatTime(session.startTime)}–{formatTime(session.endTime)}
                    </span>
                    <strong>
                      {session.quantity} unit{session.quantity === 1 ? '' : 's'} ×{' '}
                      {session.durationHours.toFixed(1)} h/unit = {session.hours.toFixed(1)} equipment-hours
                    </strong>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    ) : (
      <p className="panel-empty">No approved equipment bookings with scheduled hours match these filters.</p>
    )}
  </article>
);

export const MisDashboardResourceConsumption = ({ chart }) => (
  <article className="dashboard-panel departmental-resource-panel">
    <div className="panel-heading">
      <div>
        <h2>Resource Consumption by Requestor Group</h2>
        <p>
          Approved equipment units grouped by each reservation’s saved requestor signup dropdown.
        </p>
      </div>
    </div>
    {chart.segments.length ? (
      <div className="departmental-resource-chart">
        <div className="departmental-resource-total">
          <div
            className="venue-utilization-donut departmental-resource-donut"
            role="img"
            aria-label={`${chart.totalUnits} approved equipment units: ${
              chart.segments.map((segment) => (
                `${segment.name}, ${segment.units} units, ${segment.percent.toFixed(1)} percent`
              )).join('; ')
            }`}
            style={{ background: chart.background }}
          />
          <p className="departmental-resource-unit-label">
            <strong>{chart.totalUnits}</strong> equipment units
          </p>
        </div>
        <ul className="departmental-resource-legend">
          {chart.segments.map((segment) => (
            <li key={segment.id}>
              <span
                className="departmental-resource-swatch"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="departmental-resource-name">{segment.name}</span>
              <strong>
                {segment.units} units <span>{segment.percent.toFixed(1)}%</span>
              </strong>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <p className="panel-empty">
        No approved equipment-unit requests match the selected date and time filters.
      </p>
    )}
  </article>
);
