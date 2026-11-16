import React from 'react';
import { ResourceRankingPanel, SectionExportActions } from './DashboardShared';
import { BuildingAdminVenueUtilization } from './BuildingAdminDashboard';

// Every room has a unique 3-digit number, so the rankings show just that ("rooooom 401" -> "401").
// Names without a 3-digit number fall back to the name without the "Specific room:" prefix.
export const getRoomLabel = (name) => {
  const text = String(name || '').replace(/^specific room:\s*/i, '').trim();
  const numbers = text.match(/(?<!\d)\d{3}(?!\d)/g);
  return numbers ? [...new Set(numbers)].join(' / ') : text || 'Room';
};

// Room Checker export: the shared section-picker pop-up with the Room Checker's sections.
export const RoomCheckerExportActions = ({ rankingMode, ...props }) => (
  <SectionExportActions
    {...props}
    sections={[
      { key: 'activity', label: 'Reservation activity' },
      { key: 'roomHours', label: 'Reserved Room Hours' },
      { key: 'roomRanking', label: `${rankingMode === 'least' ? 'Least' : 'Most'} Requested Rooms` },
      { key: 'matched', label: 'Matched reservations' }
    ]}
  />
);

export const RoomCheckerClassroomRankings = ({
  roomUsage,
  dateRangeLabel,
  requestedRooms,
  rankingMode,
  onRankingModeChange,
  matchedReservations
}) => (
  // Reserved Room Hours full width on top; Most/Least Requested Rooms and Matched reservations side by side.
  <section className="room-checker-room-panels" aria-label="Specific room rankings">
    {/* Same panel as the Building Admin's Facility Usage Rate, for specific rooms. */}
    <BuildingAdminVenueUtilization
      venues={roomUsage}
      dateRangeLabel={dateRangeLabel}
      title="Reserved Room Hours"
      allTitle="All Reserved Room Hours"
      emptyMessage="No rooms have reserved hours in the selected date range."
      dialogId="room-usage-all-title"
    />
    <div className="room-checker-room-row">
    {/* Same panel as Most/Least Requested Equipment: top 3, ties alphabetical, View All pop-up. */}
    <ResourceRankingPanel
      title="Rooms"
      modeLabel="Rooms"
      mode={rankingMode}
      onModeChange={onRankingModeChange}
      items={requestedRooms.map((room) => ({
        id: room.id,
        name: getRoomLabel(room.name),
        quantity: room.count
      }))}
      itemLabel="room"
      otherLabel="Other room"
      trackClassName="facility-track"
      emptyMessage="No approved specific-room requests match these filters."
    />
    {matchedReservations}
    </div>
  </section>
);
