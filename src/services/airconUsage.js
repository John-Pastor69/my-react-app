import { getReservationScheduleForFacility, parseDateOrdinal } from './reservationConflicts.js';
import { parseReservationTime } from './reservationTime.js';

const getTimeMinutes = (value) => {
  const parsed = parseReservationTime(value);
  return parsed ? parsed.hours * 60 + parsed.minutes : null;
};

// Same rule as the dashboard's "Start time from/to" filter (supports ranges that wrap past midnight).
const matchesTimeRange = (start, startMinutes, endMinutes) => {
  if (startMinutes === null && endMinutes === null) return true;
  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
    return start >= startMinutes || start <= endMinutes;
  }
  return (startMinutes === null || start >= startMinutes)
    && (endMinutes === null || start <= endMinutes);
};

const getRoomLabel = (room) => {
  const numbers = room.match(/(?<!\d)\d{3}(?!\d)/g);
  return `Room ${numbers ? [...new Set(numbers)].join(' / ') : room}`;
};

// The aircon schedule for one facility (or the reservation's own schedule for a room-only booking).
// Each day carries its own aircon on/off and times; older reservations without a saved schedule fall
// back to the reservation-wide aircon switch over the facility's scheduled days.
const getAirconEntries = (reservation, facilityId) => {
  const facilitySchedule = facilityId ? reservation.facilitySchedules?.[facilityId] : null;
  const schedule = Array.isArray(facilitySchedule) ? facilitySchedule : reservation.schedule;
  if (Array.isArray(schedule)) {
    return schedule
      .filter((entry) => entry?.aircon === true)
      .map((entry) => ({
        date: entry.date,
        onTime: entry.airconOnTime || entry.startTime,
        offTime: entry.airconOffTime || entry.endTime
      }));
  }
  if (reservation.aircon !== true) return [];
  return getReservationScheduleForFacility(reservation, facilityId).map((entry) => ({
    date: entry.date,
    onTime: reservation.airconOnTime || entry.startTime,
    offTime: reservation.airconOffTime || entry.endTime
  }));
};

// Scheduled aircon-hours of approved reservations inside the selected date and start-time range.
// Each facility is counted separately (two rooms cooled for 3 hours = 6 aircon-hours); a room-only
// booking counts its specific room, and rooms sharing a 3-digit number are one room.
// Returns { totalHours, items: [{ id, name, hours, reservations }] } with items most hours first.
export const getAirconUsage = (
  reservations,
  {
    startDate = '',
    endDate = '',
    startMinutes = null,
    endMinutes = null,
    status = 'all',
    facilityData = [],
    getRoomKey = (room) => room
  } = {}
) => {
  const facilityNames = new Map(facilityData.map((facility) => [String(facility.id), facility.name || 'Facility']));
  const startOrdinal = startDate ? parseDateOrdinal(startDate) : null;
  const endOrdinal = endDate ? parseDateOrdinal(endDate) : null;
  const usage = new Map();

  const addEntries = (itemId, itemName, reservationId, entries) => {
    let hours = 0;
    entries.forEach((entry) => {
      const dateOrdinal = parseDateOrdinal(entry.date);
      if (dateOrdinal === null) return;
      if (startOrdinal !== null && dateOrdinal < startOrdinal) return;
      if (endOrdinal !== null && dateOrdinal > endOrdinal) return;
      const onMinutes = getTimeMinutes(entry.onTime);
      const offMinutes = getTimeMinutes(entry.offTime);
      if (onMinutes === null || offMinutes === null || offMinutes <= onMinutes) return;
      if (!matchesTimeRange(onMinutes, startMinutes, endMinutes)) return;
      hours += (offMinutes - onMinutes) / 60;
    });
    if (hours <= 0) return;
    const item = usage.get(itemId) || { id: itemId, name: itemName, hours: 0, reservationIds: new Set() };
    item.hours += hours;
    item.reservationIds.add(reservationId);
    usage.set(itemId, item);
  };

  // Aircon is only scheduled for approved reservations; a "Pending" status filter has none.
  if (status === 'all' || status === 'approved') {
    reservations
      .filter((reservation) => (reservation.status || '').toLowerCase().trim() === 'approved')
      .forEach((reservation) => {
        const facilityIds = [...new Set((reservation.facilities || []).map(String))];
        if (facilityIds.length) {
          facilityIds.forEach((facilityId) => addEntries(
            `facility-${facilityId}`,
            facilityNames.get(facilityId) || 'Facility',
            reservation.id,
            getAirconEntries(reservation, facilityId)
          ));
          return;
        }
        const specificRoom = typeof reservation.specificRoom === 'string' ? reservation.specificRoom.trim() : '';
        if (specificRoom) {
          addEntries(`room-${getRoomKey(specificRoom)}`, getRoomLabel(specificRoom), reservation.id, getAirconEntries(reservation, null));
        }
      });
  }

  const items = [...usage.values()]
    .map(({ reservationIds, ...item }) => ({ ...item, reservations: reservationIds.size }))
    .sort((first, second) => (
      second.hours - first.hours || first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
    ));
  return {
    totalHours: items.reduce((total, item) => total + item.hours, 0),
    items
  };
};
