import { isReservationActive } from './reservationStatus.js';

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const modifier = match[3]?.toUpperCase();
  if (minutes > 59) return null;
  if (modifier) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12 && modifier === 'AM') hours = 0;
    if (hours < 12 && modifier === 'PM') hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
};

export const parseDateOrdinal = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return parseDateOrdinal(value.toDate());
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000);
  }

  const dateString = String(value).trim();
  let year;
  let month;
  let day;
  const monthFirstMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const yearFirstMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (monthFirstMatch) {
    [, month, day, year] = monthFirstMatch;
  } else if (yearFirstMatch) {
    [, year, month, day] = yearFirstMatch;
  } else {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.floor(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86400000);
  }

  year = Number(year);
  month = Number(month);
  day = Number(day);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return Math.floor(parsed.getTime() / 86400000);
};

const ordinalToISODate = (ordinal) => new Date(ordinal * 86400000).toISOString().slice(0, 10);

const getDateRange = (reservation) => {
  const start = parseDateOrdinal(reservation.eventDate || reservation.date);
  if (start === null) return null;

  const explicitEnd = parseDateOrdinal(reservation.endDate);
  const dayCount = Math.max(1, Number(reservation.days) || 1);
  const end = explicitEnd ?? start + dayCount - 1;
  return end < start ? null : { start, end };
};

const createScheduleEntry = (date, startTime, endTime) => {
  const dateOrdinal = parseDateOrdinal(date);
  const startMinute = parseTimeToMinutes(startTime);
  const endMinute = parseTimeToMinutes(endTime);
  if (
    dateOrdinal === null
    || startMinute === null
    || endMinute === null
    || startMinute === endMinute
  ) return null;

  return {
    date: ordinalToISODate(dateOrdinal),
    dateOrdinal,
    startTime,
    endTime,
    startMinute,
    endMinute: endMinute <= startMinute ? endMinute + 1440 : endMinute
  };
};

const getReservationSchedule = (reservation) => {
  if (Array.isArray(reservation.schedule)) {
    return reservation.schedule
      .map((entry) => createScheduleEntry(entry.date, entry.startTime, entry.endTime))
      .filter(Boolean);
  }

  const range = getDateRange(reservation);
  if (!range) return [];
  const entries = [];
  for (let dateOrdinal = range.start; dateOrdinal <= range.end; dateOrdinal += 1) {
    const entry = createScheduleEntry(
      ordinalToISODate(dateOrdinal),
      reservation.startTime,
      reservation.endTime
    );
    if (entry) entries.push(entry);
  }
  return entries;
};

const getRequestSchedule = (request) => {
  if (Array.isArray(request.schedule)) {
    return request.schedule
      .map((entry) => createScheduleEntry(entry.date, entry.startTime, entry.endTime))
      .filter(Boolean);
  }
  return getReservationSchedule(request);
};

const getScheduleOverlap = (firstEntry, secondEntry) => {
  const firstStart = firstEntry.dateOrdinal * 1440 + firstEntry.startMinute;
  const firstEnd = firstEntry.dateOrdinal * 1440 + firstEntry.endMinute;
  const secondStart = secondEntry.dateOrdinal * 1440 + secondEntry.startMinute;
  const secondEnd = secondEntry.dateOrdinal * 1440 + secondEntry.endMinute;
  return firstStart < secondEnd && firstEnd > secondStart;
};

const hasRejectedApproval = (reservation) => Object.values(reservation.approvals || {}).some((approval) => {
  const approvalStatus = typeof approval === 'string' ? approval : approval?.status;
  return (approvalStatus || '').toLowerCase() === 'rejected';
});

const getOverlappingReservationDetails = (reservations, request, facilityId) => {
  if (!facilityId || !Array.isArray(request.facilities) || !request.facilities.includes(facilityId)) {
    return [];
  }
  const requestSchedule = getRequestSchedule(request);
  if (requestSchedule.length === 0) return [];

  const overlaps = [];
  reservations.forEach((reservation) => {
    if (
      reservation.id === request.excludeReservationId
      || !isReservationActive(reservation)
      || hasRejectedApproval(reservation)
      || !(reservation.facilities || []).includes(facilityId)
    ) return;

    const reservationSchedule = getReservationSchedule(reservation);
    for (const requestEntry of requestSchedule) {
      const reservationEntry = reservationSchedule.find((entry) => (
        getScheduleOverlap(requestEntry, entry)
      ));
      if (reservationEntry) {
        overlaps.push({ reservation, requestEntry, reservationEntry });
      }
    }
  });
  return overlaps;
};

export const getOverlappingFacilityReservations = (reservations, request, facilityId) => (
  [...new Set(
    getOverlappingReservationDetails(reservations, request, facilityId)
      .map(({ reservation }) => reservation)
  )]
);

export const getActiveFacilityReservations = (reservations, request, facilityId) => {
  if (!facilityId) return [];
  return reservations.filter((reservation) => (
    reservation.id !== request.excludeReservationId
    && isReservationActive(reservation)
    && !hasRejectedApproval(reservation)
    && (reservation.facilities || []).includes(facilityId)
  ));
};

const getFacilityCapacityLimits = (facility) => ({
  max: Object.prototype.hasOwnProperty.call(facility, 'maxCapacity')
    ? parseCapacity(facility.maxCapacity)
    : parseCapacity(facility.capacity)
});

const parseCapacity = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
};

export const getParticipantsForFacility = (reservation, facilityId) => {
  const facilityParticipants = reservation.facilityParticipants;
  if (
    facilityParticipants
    && Object.prototype.hasOwnProperty.call(facilityParticipants, facilityId)
  ) {
    return Number(facilityParticipants[facilityId]);
  }
  return Number(reservation.expectedParticipants);
};

const createConflictResult = (overlap, conflictDetails) => ({
  ...overlap.reservation,
  ...conflictDetails,
  conflictDate: overlap.requestEntry.date,
  conflictStartTime: overlap.reservationEntry.startTime,
  conflictEndTime: overlap.reservationEntry.endTime
});

export const findFacilityConflict = (reservations, request, facilities) => {
  for (const facilityId of request.facilities || []) {
    const facility = facilities.find((item) => item.id === facilityId);
    const maxCapacity = facility ? getFacilityCapacityLimits(facility).max : null;
    const conflictDetails = {
      conflictFacilityName: facility?.name || facilityId,
      conflictType: 'schedule'
    };

    if (maxCapacity !== null) {
      const activeReservations = getActiveFacilityReservations(reservations, request, facilityId);
      const hasUnknownCapacity = activeReservations.some((reservation) => {
        const participants = getParticipantsForFacility(reservation, facilityId);
        return !Number.isInteger(participants) || participants <= 0;
      });
      if (hasUnknownCapacity) {
        return {
          ...activeReservations[0],
          ...conflictDetails,
          conflictType: 'unknown-capacity'
        };
      }

      const occupiedCapacity = activeReservations.reduce(
        (total, reservation) => total + getParticipantsForFacility(reservation, facilityId),
        0
      );
      const requestedCapacity = getParticipantsForFacility(request, facilityId);
      if (occupiedCapacity + requestedCapacity > maxCapacity) {
        return {
          ...activeReservations[0],
          ...conflictDetails,
          conflictType: 'capacity',
          occupiedCapacity,
          requestedCapacity,
          maxCapacity
        };
      }
      continue;
    }

    const overlappingDetails = getOverlappingReservationDetails(
      reservations,
      request,
      facilityId
    );
    if (overlappingDetails.length === 0) continue;
    return createConflictResult(overlappingDetails[0], conflictDetails);
  }
  return null;
};
