import React, { useEffect, useState } from 'react';
import { SectionExportActions } from './DashboardShared';
import { getRoomLabel } from './RoomCheckerDashboard';
import { MisDashboardResourceConsumption } from './MisDashboard';

// Academic Head dashboard pieces. The shared Dashboard renders the common parts (approvals, upcoming
// events, Filter by Date, Reservation activity); everything Academic Head-specific lives here.

export const isAcademicHeadRole = (role) => (
  String(role || '').toLowerCase().trim().replace(/_/g, ' ') === 'academic head'
);

// "Export dashboard PDF" for the Academic Head: choose which sections go in the PDF.
export const AcademicHeadExportActions = (props) => (
  <SectionExportActions
    {...props}
    sections={[
      { key: 'activity', label: 'Reservation activity' },
      { key: 'roomHours', label: 'Room usage hours' },
      { key: 'roomConsumption', label: 'Room Reservations by Program' },
      { key: 'matched', label: 'Matched reservations' }
    ]}
  />
);

const formatHours = (hours) => `${(Number(hours) || 0).toFixed(1)} h`;

// Ranked rooms with their reserved hours, styled like Equipment usage hours.
const RoomUsageHoursEntries = ({ rooms, maximum, ariaLabel }) => (
  <div className="ranking-list" tabIndex={0} aria-label={ariaLabel}>
    {rooms.map((room, index) => (
      <div className="equipment-hours-entry" key={room.id}>
        <div className="ranking-row">
          <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
          <span className="ranking-name" title={room.name}>{getRoomLabel(room.name)}</span>
          <div className="ranking-track" aria-hidden="true">
            <span style={{ width: `${room.hours / maximum * 100}%` }} />
          </div>
          <strong>{formatHours(room.hours)}</strong>
        </div>
      </div>
    ))}
  </div>
);

// Top 3 specific rooms by approved reserved hours (rooms sharing a 3-digit number are one room),
// with View All for the rest.
const AcademicHeadRoomUsageHours = ({ rooms }) => {
  const [isAllOpen, setIsAllOpen] = useState(false);
  const maximum = Math.max(1, ...rooms.map((room) => room.hours));
  const entryProps = { maximum };

  useEffect(() => {
    if (!isAllOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsAllOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAllOpen]);

  return (
    <article className="dashboard-panel ranking-panel equipment-hours-panel">
      <div className="panel-heading">
        <div>
          <h2>Room usage hours</h2>
        </div>
      </div>
      {rooms.length ? (
        <>
          <RoomUsageHoursEntries
            {...entryProps}
            rooms={rooms.slice(0, 3)}
            ariaLabel="Top specific rooms ranked by reserved hours"
          />
          {rooms.length > 3 && (
            <button
              className="venue-utilization-view-all"
              type="button"
              onClick={() => setIsAllOpen(true)}
            >
              View All ({rooms.length})
            </button>
          )}
        </>
      ) : (
        <p className="panel-empty">No approved specific-room hours match the selected date and time filters.</p>
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
            aria-labelledby="room-usage-hours-all-title"
          >
            <div className="specific-rooms-heading">
              <div>
                <h2 id="room-usage-hours-all-title">All Room Usage Hours</h2>
                <p>Ranked from most to least reserved hours within the selected filters.</p>
              </div>
              <button
                className="specific-rooms-close"
                type="button"
                aria-label="Close all room usage hours"
                onClick={() => setIsAllOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="specific-rooms-list equipment-inventory-modal-list equipment-hours-modal-list">
              <RoomUsageHoursEntries
                {...entryProps}
                rooms={rooms}
                ariaLabel="All specific rooms ranked by reserved hours"
              />
            </div>
          </section>
        </div>
      )}
    </article>
  );
};

// Academic Head's analytics below Reservation activity: Room usage hours, then Matched reservations.
// (No equipment, utility, or facility rankings and no recent-approval lists.)
const formatReservations = (count) => `${count} reservation${count === 1 ? '' : 's'}`;

// Wording for the requestor-group chart when it counts specific-room reservations by program/course.
const ROOM_CONSUMPTION_LABELS = {
  title: 'Room Reservations by Program',
  formatCount: formatReservations,
  totalSuffix: 'room reservations',
  pieDescription: 'with a specific room',
  viewItems: 'View rooms',
  itemsListLabel: 'rooms',
  emptyMessage: 'No approved specific-room reservations by programs or courses match the selected filters.',
  allTitle: 'All Programs',
  allSubtitle: 'Approved specific-room reservations by program or course, most first.',
  dialogId: 'academic-head-room-consumption-all-title'
};

// Academic Head's analytics below Reservation activity: Room usage hours, which programs/courses reserve
// specific rooms the most, then Matched reservations.
export const AcademicHeadDashboardInsights = ({
  roomUsageHours = [],
  roomConsumptionChart,
  matchedReservations
}) => (
  <section className="matched-only-insights" aria-label="Academic Head filtered analytics">
    <AcademicHeadRoomUsageHours rooms={roomUsageHours} />
    {roomConsumptionChart && (
      <MisDashboardResourceConsumption chart={roomConsumptionChart} labels={ROOM_CONSUMPTION_LABELS} />
    )}
    {matchedReservations}
  </section>
);
