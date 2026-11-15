import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RankingModeToggle } from './DashboardShared';
import {
  sortFacilitiesByName,
  sortFacilityRanking,
  sortVenuesByUtilization
} from '../services/facilityUtilization';

const HEATMAP_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEATMAP_HOURS = Array.from({ length: 15 }, (_, index) => {
  const value = index + 7;
  return { value, label: `${value % 12 || 12}${value < 12 ? 'a' : 'p'}` };
});

const formatHeatmapTime = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};

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

export const BUILDING_ADMIN_EXPORT_SECTIONS = [
  { key: 'activity', label: 'Reservation activity' },
  { key: 'utilization', label: 'Facility Usage Rate' },
  { key: 'heatmap', label: 'Busiest Hours Map' },
  { key: 'ranking', label: 'Most / Least Requested Facilities' },
  { key: 'matched', label: 'Matched reservations' }
];

const IndeterminateCheckbox = ({ checked, indeterminate, ...props }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} {...props} />;
};

export const BuildingAdminExportActions = ({
  isExporting,
  error,
  onExport,
  dateRangeLabel,
  resultCount,
  rankingMode,
  heatmapFacilities
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState(
    () => new Set(BUILDING_ADMIN_EXPORT_SECTIONS.map((section) => section.key))
  );
  const [selectedFacilityIds, setSelectedFacilityIds] = useState(null);
  const sortedFacilities = useMemo(() => sortFacilitiesByName(heatmapFacilities), [heatmapFacilities]);
  // null means "every facility", so newly loaded facilities are included by default.
  const chosenFacilityIds = selectedFacilityIds
    ?? new Set(sortedFacilities.map((facility) => facility.id));
  const closeModal = useCallback(() => setIsOpen(false), []);
  useEscapeToClose(isOpen && !isExporting, closeModal);

  const allSectionsSelected = selectedSections.size === BUILDING_ADMIN_EXPORT_SECTIONS.length;
  const includesHeatmap = selectedSections.has('heatmap');
  const chosenFacilityCount = sortedFacilities.filter((facility) => chosenFacilityIds.has(facility.id)).length;
  const allFacilitiesSelected = chosenFacilityCount === sortedFacilities.length;
  const isHeatmapInvalid = includesHeatmap && sortedFacilities.length > 0 && chosenFacilityCount === 0;
  const canExport = selectedSections.size > 0 && !isHeatmapInvalid && !isExporting;
  const rankingLabel = rankingMode === 'least' ? 'Least Requested Facilities' : 'Most Requested Facilities';

  const toggleSection = (key) => {
    setSelectedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFacility = (id) => {
    const next = new Set(chosenFacilityIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFacilityIds(next);
  };

  const handleExport = async () => {
    if (!canExport) return;
    const succeeded = await onExport({
      sections: [...selectedSections],
      heatmapFacilityIds: sortedFacilities
        .filter((facility) => chosenFacilityIds.has(facility.id))
        .map((facility) => facility.id)
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
            aria-labelledby="dashboard-export-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="dashboard-export-title">Export Filtered Analytics</h2>
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
              <fieldset>
                <legend>Sections to export</legend>
                <label className="dashboard-export-option dashboard-export-option-all">
                  <IndeterminateCheckbox
                    checked={allSectionsSelected}
                    indeterminate={selectedSections.size > 0 && !allSectionsSelected}
                    onChange={() => setSelectedSections(allSectionsSelected
                      ? new Set()
                      : new Set(BUILDING_ADMIN_EXPORT_SECTIONS.map((section) => section.key)))}
                  />
                  <span>All sections</span>
                </label>
                {BUILDING_ADMIN_EXPORT_SECTIONS.map((section) => (
                  <React.Fragment key={section.key}>
                    <label className="dashboard-export-option">
                      <input
                        type="checkbox"
                        checked={selectedSections.has(section.key)}
                        onChange={() => toggleSection(section.key)}
                      />
                      <span>{section.key === 'ranking' ? rankingLabel : section.label}</span>
                    </label>

                    {section.key === 'heatmap' && includesHeatmap && (
                      <div className="dashboard-export-facilities">
                        {sortedFacilities.length ? (
                          <>
                            <div className="dashboard-export-facilities-heading">
                              <span>Facilities to include ({chosenFacilityCount} of {sortedFacilities.length})</span>
                              <button
                                type="button"
                                onClick={() => setSelectedFacilityIds(allFacilitiesSelected
                                  ? new Set()
                                  : null)}
                              >
                                {allFacilitiesSelected ? 'Clear all' : 'Select all'}
                              </button>
                            </div>
                            <div className="dashboard-export-facility-grid">
                              {sortedFacilities.map((facility) => (
                                <label className="dashboard-export-option" key={facility.id}>
                                  <input
                                    type="checkbox"
                                    checked={chosenFacilityIds.has(facility.id)}
                                    onChange={() => toggleFacility(facility.id)}
                                  />
                                  <span>{facility.name}</span>
                                </label>
                              ))}
                            </div>
                            {isHeatmapInvalid && (
                              <span className="dashboard-export-warning" role="alert">
                                Choose at least one facility, or untick Busiest Hours Map.
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="dashboard-export-warning">No facilities are available.</span>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </fieldset>
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

const VenueUtilizationCard = ({ venue, rank }) => {
  const displayedPercent = Math.min(venue.utilizationPercent, 100);
  return (
    <article className="venue-utilization-card">
      <div className="venue-utilization-details">
        {rank !== undefined && <span className="venue-utilization-rank">#{rank}</span>}
        <div className="venue-utilization-heading">
          <h3>{venue.name}</h3>
          <strong>{venue.utilizationPercent.toFixed(1)}%</strong>
        </div>
        <p>{venue.bookedHours.toFixed(1)} of {venue.operatingHours} operating hours reserved</p>
        <div
          className="venue-utilization-progress"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayedPercent}
          aria-valuetext={`${venue.utilizationPercent.toFixed(1)}% utilized`}
          aria-label={`${venue.name} facility usage rate`}
        >
          <span style={{ width: `${displayedPercent}%` }} />
        </div>
        {venue.utilizationPercent > 100 && (
          <span className="venue-utilization-overbooked">
            Reservations exceed the selected period’s operating hours
          </span>
        )}
      </div>
    </article>
  );
};

export const BuildingAdminVenueUtilization = ({
  venues,
  dateRangeLabel
}) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  const sortedVenues = useMemo(() => sortVenuesByUtilization(venues), [venues]);
  const topVenues = sortedVenues.filter((venue) => venue.bookedHours > 0).slice(0, 3);
  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);

  return (
    <section className="dashboard-panel venue-utilization-panel">
      <div className="panel-heading">
        <div>
          <h2>Facility Usage Rate</h2>
        </div>
      </div>
      {sortedVenues.length ? (
        <>
          {topVenues.length ? (
            <div className="venue-utilization-grid">
              {topVenues.map((venue) => (
                <VenueUtilizationCard venue={venue} key={venue.id} />
              ))}
            </div>
          ) : (
            <p className="panel-empty">No facilities have booked operating hours in the selected date range.</p>
          )}
          {/* With a single facility (e.g. one facility filtered), the panel already shows everything. */}
          {sortedVenues.length > 1 && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View All ({sortedVenues.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No facilities have booked operating hours in the selected date range.</p>
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
            aria-labelledby="venue-utilization-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="venue-utilization-all-title">All Facility Usage Rates</h2>
                <p>Ranked from highest to lowest usage for {dateRangeLabel}.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all facility usage rates"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list venue-utilization-modal-list">
              {sortedVenues.map((venue, index) => (
                <VenueUtilizationCard venue={venue} rank={index + 1} key={venue.id} />
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export const BuildingAdminVenueTraffic = ({
  statusLabel,
  dateRangeLabel,
  venues
}) => {
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [isAllOpen, setIsAllOpen] = useState(false);
  const sortedVenues = useMemo(() => sortFacilitiesByName(venues), [venues]);
  const foundIndex = sortedVenues.findIndex((venue) => venue.id === selectedVenueId);
  const selectedIndex = foundIndex === -1 ? 0 : foundIndex;
  const selectedVenue = sortedVenues[selectedIndex];

  const showVenueAt = (index) => {
    if (!sortedVenues.length) return;
    const wrappedIndex = (index + sortedVenues.length) % sortedVenues.length;
    setSelectedVenueId(sortedVenues[wrappedIndex].id);
  };

  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);

  return (
    <section className="dashboard-panel venue-traffic-panel">
      <div className="panel-heading">
        <div>
          <h2>Busiest Hours Map</h2>
          <p>{statusLabel} reservations for {dateRangeLabel}.</p>
        </div>
        {selectedVenue && (
          <div className="venue-traffic-switcher" role="group" aria-label="Switch facility">
            <button
              type="button"
              aria-label="Previous facility"
              onClick={() => showVenueAt(selectedIndex - 1)}
              disabled={sortedVenues.length < 2}
            >
              ‹
            </button>
            <span aria-live="polite" title={selectedVenue.name}>
              {selectedVenue.name}
              <small>{selectedIndex + 1} of {sortedVenues.length}</small>
            </span>
            <button
              type="button"
              aria-label="Next facility"
              onClick={() => showVenueAt(selectedIndex + 1)}
              disabled={sortedVenues.length < 2}
            >
              ›
            </button>
          </div>
        )}
      </div>
      {selectedVenue ? (
        <>
          <div className="venue-heatmap-facilities">
            <VenueHeatmap
              venue={selectedVenue}
              statusLabel={statusLabel}
              dateRangeLabel={dateRangeLabel}
            />
          </div>
          {sortedVenues.length > 1 && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View More ({sortedVenues.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No facilities are available to calculate venue booking traffic.</p>
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
            className="specific-rooms-dialog venue-traffic-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venue-traffic-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="venue-traffic-all-title">All Busiest Hours Maps</h2>
                <p>{statusLabel} reservations for {dateRangeLabel}, sorted alphabetically.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all busiest hours maps"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list venue-traffic-modal-list">
              <div className="venue-heatmap-facilities">
                {sortedVenues.map((venue) => (
                  <VenueHeatmap
                    key={venue.id}
                    venue={venue}
                    statusLabel={statusLabel}
                    dateRangeLabel={dateRangeLabel}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

const VenueHeatmap = ({ venue, statusLabel, dateRangeLabel }) => (
          <article className="venue-heatmap-facility">
            <h3>{venue.name}</h3>
            <div
              className="venue-heatmap-scroll"
              tabIndex={0}
              aria-label={`${venue.name} booking heatmap for ${dateRangeLabel}, 7 AM to 10 PM`}
            >
              <table className="venue-heatmap-table">
                <caption className="visually-hidden">
                  {venue.name} {statusLabel.toLowerCase()} booking hours by weekday from 7 AM to 10 PM for {dateRangeLabel}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    {HEATMAP_HOURS.map((hour) => (
                      <th scope="col" key={hour.value} title={formatHeatmapTime(hour.value * 60)}>
                        {hour.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HEATMAP_WEEKDAYS.map((day, weekday) => (
                    <tr key={day}>
                      <th scope="row">{day}</th>
                      {venue.cells[weekday].map((bookedMinutes, index) => {
                        const hour = HEATMAP_HOURS[index].value;
                        const intensity = venue.peakMinutes
                          ? bookedMinutes / venue.peakMinutes
                          : 0;
                        const level = bookedMinutes === 0
                          ? 0
                          : intensity >= 0.75
                            ? 4
                            : intensity >= 0.5
                              ? 3
                              : intensity >= 0.25
                                ? 2
                                : 1;
                        const cellLabel = `${day}, ${formatHeatmapTime(hour * 60)}–`
                          + `${formatHeatmapTime((hour + 1) * 60)}: `
                          + `${(bookedMinutes / 60).toFixed(1)} booked hours`;
                        return (
                          <td
                            className={`venue-heatmap-cell intensity-${level}`}
                            key={`${day}-${hour}`}
                            title={cellLabel}
                            aria-label={cellLabel}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="venue-heatmap-legend" aria-label="Booking intensity legend">
              <span>Less</span>
              {[1, 2, 3, 4].map((level) => (
                <i
                  className={`venue-heatmap-cell intensity-${level}`}
                  key={level}
                  aria-hidden="true"
                />
              ))}
              <span>More</span>
              <span className="venue-heatmap-note">Intensity is relative to this venue’s busiest hour.</span>
            </div>
            {venue.busiestCellsByWeekday.length ? (
              <div className="venue-heatmap-busiest">
                <strong>
                  Busiest cell{venue.busiestCellsByWeekday.reduce(
                    (total, day) => total + day.cells.length,
                    0
                  ) > 1 ? 's' : ''}:
                  {' '}{(venue.peakMinutes / 60).toFixed(1)} booked hours each
                </strong>
                <ul>
                  {venue.busiestCellsByWeekday.map((day) => (
                    <li key={day.weekday}>
                      <strong>{HEATMAP_WEEKDAYS[day.weekday]}</strong>
                      {' — '}{(day.totalMinutes / 60).toFixed(1)} total booked hours that day
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="venue-heatmap-busiest">No approved booking time in this date range.</p>
            )}
          </article>
);

const FacilityRankingRows = ({ facilities, facilityMaximum, ariaLabel }) => (
  <div className="ranking-list" tabIndex={0} aria-label={ariaLabel}>
    {facilities.map((facility, index) => (
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
);

export const BuildingAdminFacilityInsights = ({
  rankingModes,
  setRankingModes,
  facilities,
  matchedReservations
}) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  const isMost = rankingModes.facilities === 'most';
  const modeLabel = isMost ? 'Most' : 'Least';
  const rankedFacilities = useMemo(
    () => sortFacilityRanking(facilities, rankingModes.facilities),
    [facilities, rankingModes.facilities]
  );
  const topFacilities = (isMost
    ? rankedFacilities.filter((facility) => facility.count > 0)
    : rankedFacilities).slice(0, 3);
  const facilityMaximum = Math.max(1, ...rankedFacilities.map((facility) => facility.count));
  const closeAll = useCallback(() => setIsAllOpen(false), []);
  useEscapeToClose(isAllOpen, closeAll);

  return (
    <>
      <article className="dashboard-panel ranking-panel">
        <div className="panel-heading">
          <div>
            <h2>{modeLabel} Requested Facilities</h2>
          </div>
          <RankingModeToggle
            label="Facilities"
            value={rankingModes.facilities}
            onChange={(value) => setRankingModes((current) => ({ ...current, facilities: value }))}
          />
        </div>
        {topFacilities.length ? (
          <FacilityRankingRows
            facilities={topFacilities}
            facilityMaximum={facilityMaximum}
            ariaLabel="Facility request rankings"
          />
        ) : (
          <p className="panel-empty">No approved facility bookings match these filters.</p>
        )}
        {rankedFacilities.length > 1 && (
          <button
            className="venue-utilization-view-all"
            type="button"
            onClick={() => setIsAllOpen(true)}
          >
            View All ({rankedFacilities.length})
          </button>
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
              aria-labelledby="facility-ranking-all-title"
            >
              <div className="specific-rooms-heading">
                <div>
                  <h2 id="facility-ranking-all-title">All Facilities — {modeLabel} Requested</h2>
                </div>
                <button
                  className="specific-rooms-close"
                  type="button"
                  aria-label="Close all facility rankings"
                  onClick={() => setIsAllOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="specific-rooms-list facility-ranking-modal-list">
                <FacilityRankingRows
                  facilities={rankedFacilities}
                  facilityMaximum={facilityMaximum}
                  ariaLabel="All facility request rankings"
                />
              </div>
            </section>
          </div>
        )}
      </article>
      {matchedReservations}
    </>
  );
};
