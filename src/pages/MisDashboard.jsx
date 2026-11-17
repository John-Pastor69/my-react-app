import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getEquipmentAlerts,
  sortEquipmentByHours,
  sortEquipmentByUsage,
  sortUtilitiesByReserved
} from '../services/resourceInventory';
import { IndeterminateCheckbox } from './DashboardShared';

const MIS_EXPORT_SECTION_GROUPS = [
  {
    key: 'inventory',
    legend: 'Live inventory',
    sections: [
      { key: 'equipmentInventory', label: 'Equipment inventory' },
      { key: 'utilityInventory', label: 'Utility inventory' }
    ]
  },
  {
    key: 'analytics',
    legend: 'Filtered analytics',
    sections: [
      { key: 'activity', label: 'Reservation activity' },
      { key: 'equipmentHours', label: 'Equipment usage hours' },
      { key: 'groupConsumption', label: 'Resource Consumption by Requestor Group' },
      { key: 'equipmentRanking', label: 'Most / Least Requested Equipment' },
      { key: 'utilityRanking', label: 'Most / Least Requested Utilities' },
      { key: 'recentEquipment', label: 'Recent Approved Equipment' },
      { key: 'recentUtilities', label: 'Recent Approved Utilities' },
      { key: 'matched', label: 'Matched reservations' }
    ]
  }
];
const ALL_MIS_EXPORT_SECTION_KEYS = MIS_EXPORT_SECTION_GROUPS.flatMap((group) => (
  group.sections.map((section) => section.key)
));

export const MisDashboardExportActions = ({
  isExporting,
  error,
  onExport,
  dateRangeLabel,
  resultCount,
  rankingModes
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState(() => new Set(ALL_MIS_EXPORT_SECTION_KEYS));
  const closeModal = useCallback(() => setIsOpen(false), []);
  useEscapeToClose(isOpen && !isExporting, closeModal);

  const allSelected = selectedSections.size === ALL_MIS_EXPORT_SECTION_KEYS.length;
  const canExport = selectedSections.size > 0 && !isExporting;
  const getSectionLabel = (section) => {
    if (section.key === 'equipmentRanking') {
      return `${rankingModes?.equipment === 'least' ? 'Least' : 'Most'} Requested Equipment`;
    }
    if (section.key === 'utilityRanking') {
      return `${rankingModes?.utilities === 'least' ? 'Least' : 'Most'} Requested Utilities`;
    }
    return section.label;
  };
  const toggleSections = (keys, shouldSelect) => setSelectedSections((current) => {
    const next = new Set(current);
    keys.forEach((key) => (shouldSelect ? next.add(key) : next.delete(key)));
    return next;
  });

  const handleExport = async () => {
    if (!canExport) return;
    const succeeded = await onExport({
      sections: ALL_MIS_EXPORT_SECTION_KEYS.filter((key) => selectedSections.has(key))
    });
    if (succeeded) setIsOpen(false);
  };

  return (
    <div className="dashboard-export-actions">
      <button
        className="dashboard-export-button"
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isExporting}
      >
        {isExporting ? 'Generating PDF...' : 'Export dashboard PDF'}
      </button>
      {error && !isOpen && (
        <span className="dashboard-export-error" role="alert">
          {error}
        </span>
      )}

      {isOpen && (
        <div
          className="specific-rooms-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isExporting) closeModal();
          }}
        >
          <section
            className="specific-rooms-dialog dashboard-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mis-export-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="mis-export-title">Export MIS Report</h2>
                <p>
                  {dateRangeLabel} · {resultCount} {resultCount === 1 ? 'reservation' : 'reservations'} found
                </p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close export options"
                onClick={closeModal}
                disabled={isExporting}
              >
                ×
              </button>
            </div>

            <div className="specific-rooms-list dashboard-export-options">
              <label className="dashboard-export-option dashboard-export-option-all">
                <IndeterminateCheckbox
                  checked={allSelected}
                  indeterminate={selectedSections.size > 0 && !allSelected}
                  onChange={() => setSelectedSections(allSelected ? new Set() : new Set(ALL_MIS_EXPORT_SECTION_KEYS))}
                />
                <span>All sections</span>
              </label>
              {MIS_EXPORT_SECTION_GROUPS.map((group) => {
                const groupKeys = group.sections.map((section) => section.key);
                const selectedInGroup = groupKeys.filter((key) => selectedSections.has(key)).length;
                return (
                  <fieldset className="dashboard-export-group" key={group.key}>
                    <legend>
                      <label className="dashboard-export-option">
                        <IndeterminateCheckbox
                          checked={selectedInGroup === groupKeys.length}
                          indeterminate={selectedInGroup > 0 && selectedInGroup < groupKeys.length}
                          onChange={() => toggleSections(groupKeys, selectedInGroup < groupKeys.length)}
                        />
                        <span>{group.legend}</span>
                      </label>
                    </legend>
                    {group.sections.map((section) => (
                      <label className="dashboard-export-option dashboard-export-option-nested" key={section.key}>
                        <input
                          type="checkbox"
                          checked={selectedSections.has(section.key)}
                          onChange={() => toggleSections([section.key], !selectedSections.has(section.key))}
                        />
                        <span>{getSectionLabel(section)}</span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </div>

            <div className="dashboard-export-footer">
              {error && (
                <span className="dashboard-export-error" role="alert">{error}</span>
              )}
              <button
                className="dashboard-export-cancel"
                type="button"
                onClick={closeModal}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button
                className="dashboard-export-button"
                type="button"
                onClick={handleExport}
                disabled={!canExport}
              >
                {isExporting ? 'Generating PDF...' : 'Export PDF'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export const MisDashboardPendingAccounts = ({
  pendingUserCount,
  pendingProfileCount,
  canManagePendingProfiles
}) => (
  <article className="dashboard-panel pending-account-panel">
    <div className="panel-heading">
      <div>
        <h2>Pending accounts</h2>
      </div>
    </div>
    <div className="pending-account-actions">
      <Link className="pending-account-action" to="/user?filter=pending">
        <span>Pending users</span>
        <strong>{pendingUserCount}</strong>
        <small>View accounts</small>
      </Link>
      {canManagePendingProfiles && (
        <Link className="pending-account-action" to="/user?filter=pending-profile">
          <span>Pending profiles</span>
          <strong>{pendingProfileCount}</strong>
          <small>Review profiles</small>
        </Link>
      )}
    </div>
  </article>
);

const useEscapeToClose = (isOpen, onClose) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
};

const EquipmentInventoryItem = ({ item, rank }) => {
  const alerts = getEquipmentAlerts(item);
  return (
    <Link
      className="equipment-burn-item"
      to="/equipment"
      aria-label={`${item.name || 'Equipment'} inventory outlook${alerts.length
        ? `: ${alerts.map((alert) => alert.label).join(', ')}`
        : ''}. Open equipment management.`}
    >
      <div className="equipment-burn-item-heading">
        <strong>
          {rank !== undefined && <span className="equipment-burn-rank">#{rank}</span>}
          {item.name || 'Unnamed equipment'}
        </strong>
        {alerts.length > 0 && (
          <span className="equipment-burn-alerts">
            {alerts.map((alert) => (
              <span className={`equipment-burn-status ${alert.key}`} key={alert.key}>
                {alert.label}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="equipment-burn-meter">
        <strong>{item.available} available</strong>
        <span>{item.reserved} reserved</span>
        <span className="equipment-burn-maintenance">
          {item.underMaintenance} under maintenance
        </span>
        <span className="equipment-burn-total">{item.total} total units</span>
        <div
          className={`equipment-burn-bar${item.percentAvailable < 30 ? ' is-low' : ''}`}
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
  );
};

export const MisDashboardEquipmentInventory = ({ equipment }) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  // Most constrained first: highest share of units reserved or under maintenance; ties alphabetically.
  const rankedEquipment = useMemo(() => sortEquipmentByUsage(equipment), [equipment]);
  const topEquipment = rankedEquipment.slice(0, 3);
  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);

  return (
    <section className="dashboard-panel equipment-burn-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2>Equipment inventory</h2>
        </div>
      </div>
      {rankedEquipment.length ? (
        <>
          <div className="equipment-burn-list">
            {topEquipment.map((item) => (
              <EquipmentInventoryItem item={item} key={item.id} />
            ))}
          </div>
          {rankedEquipment.length > 3 && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View All ({rankedEquipment.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No equipment inventory to display.</p>
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
            aria-labelledby="equipment-inventory-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="equipment-inventory-all-title">All Equipment Inventory</h2>
                <p>Ranked from least to most available.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all equipment inventory"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list equipment-inventory-modal-list">
              <div className="equipment-burn-list">
                {rankedEquipment.map((item, index) => (
                  <EquipmentInventoryItem item={item} rank={index + 1} key={item.id} />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

const UtilityInventoryItem = ({ utility, rank }) => (
  <Link
    className="equipment-burn-item"
    to="/equipment#utilities"
    aria-label={`${utility.name || 'Utility'} inventory. ${utility.reserved} reserved. ${utility.status}. Open utilities.`}
  >
    <div className="equipment-burn-item-heading">
      <strong>
        {rank !== undefined && <span className="equipment-burn-rank">#{rank}</span>}
        {utility.name || 'Unnamed utility'}
      </strong>
      <span className={`equipment-burn-status${utility.status === 'Unavailable' ? ' unavailable' : ''}`}>
        {utility.status}
      </span>
    </div>
    <div className="equipment-burn-meter">
      <strong>{utility.reserved} reserved</strong>
    </div>
  </Link>
);

export const MisDashboardUtilityInventory = ({ utilities }) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  // Most reserved first; ties alphabetically.
  const rankedUtilities = useMemo(() => sortUtilitiesByReserved(utilities), [utilities]);
  const topUtilities = rankedUtilities.slice(0, 3);
  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);

  return (
    <section className="dashboard-panel equipment-burn-panel" aria-live="polite">
      <div className="panel-heading">
        <div>
          <h2>Utility inventory</h2>
        </div>
      </div>
      {rankedUtilities.length ? (
        <>
          <div className="equipment-burn-list">
            {topUtilities.map((utility) => (
              <UtilityInventoryItem utility={utility} key={utility.id} />
            ))}
          </div>
          {rankedUtilities.length > 3 && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View All ({rankedUtilities.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No utility inventory to display.</p>
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
            aria-labelledby="utility-inventory-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="utility-inventory-all-title">All Utility Inventory</h2>
                <p>Ranked from most to least reserved.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all utility inventory"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list equipment-inventory-modal-list">
              <div className="equipment-burn-list">
                {rankedUtilities.map((utility, index) => (
                  <UtilityInventoryItem utility={utility} rank={index + 1} key={utility.id} />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

const EquipmentUsageHoursEntries = ({
  equipment,
  maximum,
  formatDate,
  parseDate,
  formatTime,
  ariaLabel
}) => (
  <div className="ranking-list" tabIndex={0} aria-label={ariaLabel}>
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
);

export const MisDashboardEquipmentUsageHours = ({
  equipment,
  maximum,
  formatDate,
  parseDate,
  formatTime
}) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  // Most hours first; ties alphabetically.
  const rankedEquipment = useMemo(() => sortEquipmentByHours(equipment), [equipment]);
  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);
  const entryProps = { maximum, formatDate, parseDate, formatTime };

  return (
    <article className="dashboard-panel ranking-panel equipment-hours-panel">
      <div className="panel-heading">
        <div>
          <h2>Equipment usage hours</h2>
        </div>
      </div>
      {rankedEquipment.length ? (
        <>
          <EquipmentUsageHoursEntries
            {...entryProps}
            equipment={rankedEquipment.slice(0, 3)}
            ariaLabel="Top equipment ranked by reserved hours"
          />
          {rankedEquipment.length > 3 && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View All ({rankedEquipment.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No approved equipment bookings with scheduled hours match these filters.</p>
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
            aria-labelledby="equipment-hours-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="equipment-hours-all-title">All Equipment Usage Hours</h2>
                <p>Ranked from most to least reserved hours.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all equipment usage hours"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list equipment-inventory-modal-list equipment-hours-modal-list">
              <EquipmentUsageHoursEntries
                {...entryProps}
                equipment={rankedEquipment}
                ariaLabel="All equipment ranked by reserved hours"
              />
            </div>
          </section>
        </div>
      )}
    </article>
  );
};

const formatUnits = (units) => `${units} unit${units === 1 ? '' : 's'}`;

// Wording for the requestor-group chart. Defaults describe equipment units (MIS); OSA passes its own
// labels to count facility and room reservations instead.
export const EQUIPMENT_CONSUMPTION_LABELS = {
  title: 'Resource Consumption by Requestor Group',
  formatCount: formatUnits,
  totalSuffix: 'equipment units',
  pieDescription: 'of approved equipment',
  viewItems: 'View units',
  itemsListLabel: 'equipment units',
  emptyMessage: 'No approved equipment-unit requests match the selected date and time filters.',
  allTitle: 'All Requestor Groups',
  allSubtitle: 'Approved equipment units by requestor group, largest first.',
  dialogId: 'resource-consumption-all-title'
};

// `segments` are listed in the legend; `pieSegments` (defaults to the same list) describe the whole pie.
const ResourceConsumptionChart = ({
  totalUnits,
  segments,
  pieSegments = segments,
  background,
  labels = EQUIPMENT_CONSUMPTION_LABELS
}) => (
  <div className="departmental-resource-chart">
    <div className="departmental-resource-total">
      <div
        className="venue-utilization-donut departmental-resource-donut"
        role="img"
        aria-label={`${labels.formatCount(totalUnits)} ${labels.pieDescription}: ${
          pieSegments.map((segment) => (
            `${segment.name}, ${labels.formatCount(segment.units)}, ${segment.percent.toFixed(1)} percent`
          )).join('; ')
        }`}
        style={{ background }}
      />
      <p className="departmental-resource-unit-label">
        <strong>{totalUnits}</strong> {labels.totalSuffix}
      </p>
    </div>
    <ul className="departmental-resource-legend">
      {segments.map((segment) => (
        <li key={segment.id}>
          <span
            className="departmental-resource-swatch"
            style={{ backgroundColor: segment.color }}
            aria-hidden="true"
          />
          <span className="departmental-resource-name">
            {segment.name}
            {segment.items?.length > 0 && (
              // Collapsed by default, like "View session breakdown" in Equipment usage hours.
              <details className="departmental-resource-details">
                <summary>{labels.viewItems} ({segment.items.length})</summary>
                <ul
                  className="departmental-resource-items"
                  aria-label={`${segment.name} ${labels.itemsListLabel}`}
                >
                  {segment.items.map((item) => (
                    <li key={`${item.isOtherRequest ? 'other' : 'equipment'}-${item.name}`}>
                      <span>{item.isOtherRequest ? `Other: ${item.name}` : item.name}</span>
                      <strong>{labels.formatCount(item.units)}</strong>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </span>
          <strong>
            {labels.formatCount(segment.units)} <span>{segment.percent.toFixed(1)}%</span>
          </strong>
        </li>
      ))}
    </ul>
  </div>
);

export const MisDashboardResourceConsumption = ({ chart, labels = EQUIPMENT_CONSUMPTION_LABELS }) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);

  // The panel's legend lists only the 3 largest groups; the pie still shows every group so the
  // percentages stay accurate, and View All labels the rest.
  const hasMoreGroups = chart.segments.length > 3;

  return (
    <article className="dashboard-panel departmental-resource-panel">
      <div className="panel-heading">
        <div>
          <h2>{labels.title}</h2>
        </div>
      </div>
      {chart.segments.length ? (
        <>
          <ResourceConsumptionChart
            totalUnits={chart.totalUnits}
            segments={chart.segments.slice(0, 3)}
            pieSegments={chart.segments}
            background={chart.background}
            labels={labels}
          />
          {hasMoreGroups && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View All ({chart.segments.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">{labels.emptyMessage}</p>
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
            aria-labelledby={labels.dialogId}
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id={labels.dialogId}>{labels.allTitle}</h2>
                <p>{labels.allSubtitle}</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all requestor groups"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list equipment-inventory-modal-list">
              <ResourceConsumptionChart
                totalUnits={chart.totalUnits}
                segments={chart.segments}
                background={chart.background}
                labels={labels}
              />
            </div>
          </section>
        </div>
      )}
    </article>
  );
};
