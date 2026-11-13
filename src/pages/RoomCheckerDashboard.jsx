import React from 'react';
import { RankingModeToggle } from './DashboardShared';

export const RoomCheckerExportActions = ({
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

export const RoomCheckerOccupancy = ({
  rooms,
  startDate,
  endDate,
  formatDate,
  parseDate,
  formatTime,
  onOpenReservation
}) => (
  <article className="dashboard-panel room-occupancy-panel" aria-live="polite">
    <div className="panel-heading">
      <div>
        <h2>Room occupancy</h2>
        <p>Specific-room requests within the selected date range.</p>
      </div>
      <span className="panel-total">
        {startDate ? formatDate(parseDate(startDate)) : 'Any date'}
        {' – '}
        {endDate ? formatDate(parseDate(endDate)) : 'Any date'}
        {' · '}{rooms.length} rooms
      </span>
    </div>
    {rooms.length ? (
      <div
        className="room-occupancy-list"
        tabIndex={0}
        aria-label="Scroll through specific-room occupancy"
      >
        {rooms.map((room) => (
          <button
            className="room-occupancy-row operation-row-button"
            key={room.id}
            type="button"
            aria-label={`View reservation details for ${room.name} on ${formatDate(parseDate(room.date))}: ${room.eventName}`}
            onClick={() => onOpenReservation(room.reservationId)}
          >
            <div className="room-occupancy-main">
              <strong>{room.name}</strong>
              <span>
                {formatDate(parseDate(room.date))} · {room.eventName}
                {' · '}{formatTime(room.startTime)}–{formatTime(room.endTime)}
              </span>
              <span>{room.requestor}</span>
            </div>
            <div className="room-occupancy-meta">
              <span className={`room-occupancy-state room-occupancy-state-${room.state.toLowerCase().replace(/\s+/g, '-')}`}>
                {room.state}
              </span>
              <span>
                Air-con {room.state === 'In use' ? 'expected' : 'scheduled'}{' '}
                {room.aircon ? 'ON' : 'OFF'}
              </span>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <p className="panel-empty">No specific-room requests match the selected date range.</p>
    )}
  </article>
);

export const RoomCheckerClassroomRankings = ({
  reservedHours,
  reservedHoursMaximum,
  requestedRooms,
  requestedRoomsMaximum,
  rankingMode,
  onRankingModeChange
}) => (
  <section className="room-checker-room-panels" aria-label="Specific room rankings">
    <article className="dashboard-panel ranking-panel room-hours-panel">
      <div className="panel-heading">
        <div>
          <h2>Reserved Room hours</h2>
          <p>Approved scheduled hours for specific-room reservations.</p>
        </div>
      </div>
      {reservedHours.length ? (
        <div className="ranking-list" tabIndex={0} aria-label="Specific rooms ranked by reserved hours">
          {reservedHours.map((room, index) => (
            <div className="ranking-row" key={room.id}>
              <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
              <span className="ranking-name" title={room.name}>{room.name}</span>
              <div className="ranking-track" aria-hidden="true">
                <span style={{ width: `${room.hours / reservedHoursMaximum * 100}%` }} />
              </div>
              <strong>{room.hours.toFixed(1)} h</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-empty">
          No approved specific-room hours match the selected date and time filters.
        </p>
      )}
    </article>
    <article className="dashboard-panel ranking-panel">
      <div className="panel-heading">
        <div>
          <h2>{rankingMode === 'most' ? 'Most' : 'Least'} Requested Rooms</h2>
          <p>Approved specific-room reservations in the selected period.</p>
        </div>
        <RankingModeToggle
          label="Specific rooms"
          value={rankingMode}
          onChange={onRankingModeChange}
        />
      </div>
      {requestedRooms.length ? (
        <div className="ranking-list" tabIndex={0} aria-label="Specific room request rankings">
          {requestedRooms.map((room, index) => (
            <div className="ranking-row" key={room.id}>
              <span className="ranking-position">{String(index + 1).padStart(2, '0')}</span>
              <span className="ranking-name" title={room.name}>{room.name}</span>
              <div className="ranking-track facility-track">
                <span style={{ width: `${room.count / requestedRoomsMaximum * 100}%` }} />
              </div>
              <strong>{room.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-empty">No approved specific-room requests match these filters.</p>
      )}
    </article>
  </section>
);
