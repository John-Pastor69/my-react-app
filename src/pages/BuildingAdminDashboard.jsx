import React from 'react';
import { RankingModeToggle } from './DashboardShared';

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

export const BuildingAdminExportActions = ({
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

export const BuildingAdminVenueUtilization = ({
  venues,
  dateRangeLabel
}) => (
  <section className="dashboard-panel venue-utilization-panel">
    <div className="panel-heading">
      <div>
        <h2>Facility Usage Rate</h2>
        <p>Booked reservation hours for {dateRangeLabel}.</p>
      </div>
    </div>
    {venues.length ? (
      <div className="venue-utilization-grid">
        {venues.map((venue) => {
          const displayedPercent = Math.min(venue.utilizationPercent, 100);
          return (
            <article className="venue-utilization-card" key={venue.id}>
              <div className="venue-utilization-details">
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
        })}
      </div>
    ) : (
      <p className="panel-empty">No facilities have booked operating hours in the selected date range.</p>
    )}
  </section>
);

export const BuildingAdminVenueTraffic = ({
  statusLabel,
  dateRangeLabel,
  selectedFacilityId,
  onFacilityChange,
  facilities,
  venues
}) => (
  <section className="dashboard-panel venue-traffic-panel">
    <div className="panel-heading">
      <div>
        <h2>Busiest Hours Map</h2>
        <p>{statusLabel} reservations for {dateRangeLabel}.</p>
      </div>
      <label className="venue-traffic-filter">
        <span>Facility</span>
        <select
          value={selectedFacilityId}
          onChange={(event) => onFacilityChange(event.target.value)}
        >
          <option value="all">All facilities</option>
          {facilities.map((facility) => (
            <option key={facility.id} value={String(facility.id)}>
              {facility.name || 'Facility'}
            </option>
          ))}
        </select>
      </label>
    </div>
    {venues.length ? (
      <div className="venue-heatmap-facilities">
        {venues.map((venue) => (
          <article className="venue-heatmap-facility" key={venue.id}>
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
        ))}
      </div>
    ) : (
      <p className="panel-empty">No facilities are available to calculate venue booking traffic.</p>
    )}
  </section>
);

export const BuildingAdminFacilityInsights = ({
  rankingModes,
  setRankingModes,
  facilities,
  facilityMaximum,
  matchedReservations
}) => (
  <>
    <article className="dashboard-panel ranking-panel">
      <div className="panel-heading">
        <div>
          <h2>{rankingModes.facilities === 'most' ? 'Most' : 'Least'} Requested Facilities</h2>
          <p>
            Approved facility reservations in the selected period
            {rankingModes.facilities === 'least' ? ', including facilities with no bookings' : ''}.
          </p>
        </div>
        <RankingModeToggle
          label="Facilities"
          value={rankingModes.facilities}
          onChange={(value) => setRankingModes((current) => ({ ...current, facilities: value }))}
        />
      </div>
      {facilities.length ? (
        <div className="ranking-list" tabIndex={0} aria-label="Facility request rankings">
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
      ) : (
        <p className="panel-empty">No approved facility bookings match these filters.</p>
      )}
    </article>
    {matchedReservations}
  </>
);
