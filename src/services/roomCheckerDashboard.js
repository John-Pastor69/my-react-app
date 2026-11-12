import { getReservationScheduleForFacility } from './reservationConflicts.js';
import { parseReservationTime } from './reservationTime.js';

const normalizeRoomName = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const getTimeMinutes = (value) => {
  const parsed = parseReservationTime(value);
  return parsed ? parsed.hours * 60 + parsed.minutes : null;
};

const matchesTimeRange = (start, startMinutes, endMinutes) => {
  if (start === null) return false;
  if (startMinutes === null && endMinutes === null) return true;
  if (startMinutes !== null && endMinutes !== null && startMinutes > endMinutes) {
    return start >= startMinutes || start <= endMinutes;
  }
  return (startMinutes === null || start >= startMinutes)
    && (endMinutes === null || start <= endMinutes);
};

const isScheduleEntryInDateRange = (date, startDate, endDate) => (
  (!startDate || date >= startDate)
  && (!endDate || date <= endDate)
);

export const getSpecificRoomReservedHours = (
  reservations,
  { startDate = '', endDate = '', startMinutes = null, endMinutes = null, status = 'all' } = {}
) => {
  const hoursByRoom = new Map();

  const addScheduledHours = (id, name, schedule) => {
    const room = hoursByRoom.get(id) || { id, name, hours: 0 };
    schedule.forEach((entry) => {
      if (!isScheduleEntryInDateRange(entry.date, startDate, endDate)) return;
      const start = getTimeMinutes(entry.startTime);
      const end = getTimeMinutes(entry.endTime);
      if (
        start === null
        || end === null
        || end <= start
        || !matchesTimeRange(start, startMinutes, endMinutes)
      ) return;

      room.hours += (end - start) / 60;
    });
    if (room.hours > 0) hoursByRoom.set(id, room);
  };

  reservations.forEach((reservation) => {
    if ((reservation.status || '').toLowerCase().trim() !== 'approved') return;
    if (status !== 'all' && status !== 'approved') return;

    const specificRoom = typeof reservation.specificRoom === 'string'
      ? reservation.specificRoom.trim()
      : '';
    if (specificRoom) {
      const key = normalizeRoomName(specificRoom);
      if (!key) return;
      addScheduledHours(
        `specific-room-${key}`,
        specificRoom,
        getReservationScheduleForFacility(reservation)
      );
    }
  });

  return [...hoursByRoom.values()].sort((first, second) => (
    second.hours - first.hours || first.name.localeCompare(second.name)
  ));
};

export const getLiveSpecificRoomOccupancy = (
  reservations,
  { startDate = '', endDate = '', today, nowMinutes }
) => {
  const rooms = new Map();

  reservations.forEach((reservation) => {
    const status = (reservation.status || '').toLowerCase().trim();
    if (!['approved', 'pending'].includes(status)) return;

    const name = typeof reservation.specificRoom === 'string'
      ? reservation.specificRoom.trim()
      : '';
    const key = normalizeRoomName(name);
    if (!key) return;

    const schedule = getReservationScheduleForFacility(reservation)
      .filter((entry) => isScheduleEntryInDateRange(entry.date, startDate, endDate))
      .flatMap((entry) => {
        const start = getTimeMinutes(entry.startTime);
        const end = getTimeMinutes(entry.endTime);
        if (start === null || end === null || end <= start) return [];

        const rawEntry = Array.isArray(reservation.schedule)
          ? reservation.schedule.find((candidate) => (
            candidate.date === entry.date
            && getTimeMinutes(candidate.startTime) === start
            && getTimeMinutes(candidate.endTime) === end
          ))
          : null;
        return [{
          reservationId: reservation.id,
          eventName: reservation.eventName || reservation.title || 'Untitled reservation',
          requestor: reservation.fullName || reservation.userEmail || 'Unknown requestor',
          status,
          date: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          start,
          end,
          aircon: typeof rawEntry?.aircon === 'boolean'
            ? rawEntry.aircon
            : Boolean(reservation.aircon)
        }];
      });

    if (!schedule.length) return;
    const room = rooms.get(key) || { id: key, name, bookings: [] };
    room.bookings.push(...schedule);
    rooms.set(key, room);
  });

  return [...rooms.values()].map((room) => {
    const activeBooking = room.bookings.find((booking) => (
      booking.status === 'approved'
      && booking.date === today
      && booking.start <= nowMinutes
      && nowMinutes < booking.end
    ));
    const activePendingBooking = room.bookings.find((booking) => (
      booking.status === 'pending'
      && booking.date === today
      && booking.start <= nowMinutes
      && nowMinutes < booking.end
    ));
    const nextBooking = room.bookings
      .filter((booking) => (
        booking.date > today || (booking.date === today && booking.start > nowMinutes)
      ))
      .sort((first, second) => (
        first.date.localeCompare(second.date) || first.start - second.start
      ))[0];
    const latestApprovedBooking = room.bookings
      .filter((booking) => (
        booking.status === 'approved'
        && (booking.date < today || (booking.date === today && booking.end <= nowMinutes))
      ))
      .sort((first, second) => (
        second.date.localeCompare(first.date) || second.end - first.end
      ))[0];
    const pendingBooking = room.bookings
      .filter((booking) => booking.status === 'pending')
      .sort((first, second) => (
        first.date.localeCompare(second.date) || first.start - second.start
      ))[0];
    const booking = activeBooking
      || activePendingBooking
      || nextBooking
      || latestApprovedBooking
      || pendingBooking;

    return {
      id: room.id,
      name: room.name,
      state: activeBooking
        ? 'In use'
        : activePendingBooking
          ? 'Pending approval'
          : booking?.status === 'pending'
            ? 'Pending approval'
            : nextBooking
              ? 'Upcoming'
              : latestApprovedBooking?.date === today
                ? 'Finished today'
                : 'Finished',
      aircon: booking?.aircon ?? false,
      ...booking
    };
  }).sort((first, second) => {
    const stateOrder = {
      'In use': 0,
      'Pending approval': 1,
      Upcoming: 2,
      'Finished today': 3,
      Finished: 4
    };
    return stateOrder[first.state] - stateOrder[second.state]
      || first.date.localeCompare(second.date)
      || first.start - second.start
      || first.name.localeCompare(second.name);
  });
};
