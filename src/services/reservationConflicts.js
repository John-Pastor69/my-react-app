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

export const getReservationDateRange = (reservation) => {
  const start = parseDateOrdinal(reservation.eventDate || reservation.date);
  if (start === null) return null;

  const explicitEnd = parseDateOrdinal(reservation.endDate);
  const dayCount = Math.max(1, Number(reservation.days) || 1);
  const end = explicitEnd ?? start + dayCount - 1;
  return end < start ? null : { start, end };
};

export const reservationDateRangesOverlap = (firstRange, secondRange) => (
  firstRange.start <= secondRange.end && secondRange.start <= firstRange.end
);

const createScheduleEntry = (date, startTime, endTime) => {
  const dateOrdinal = parseDateOrdinal(date);
  const startMinute = parseTimeToMinutes(startTime);
  const endMinute = parseTimeToMinutes(endTime);
  if (
    dateOrdinal === null
    || startMinute === null
    || endMinute === null
    || endMinute <= startMinute
  ) return null;

  return {
    date: ordinalToISODate(dateOrdinal),
    dateOrdinal,
    startTime,
    endTime,
    startMinute,
    endMinute
  };
};

const getReservationSchedule = (reservation, facilityId) => {
  const facilitySchedule = facilityId
    ? reservation.facilitySchedules?.[facilityId]
    : null;
  const schedule = Array.isArray(facilitySchedule)
    ? facilitySchedule
    : reservation.schedule;
  if (Array.isArray(schedule)) {
    return schedule
      .map((entry) => createScheduleEntry(entry.date, entry.startTime, entry.endTime))
      .filter(Boolean);
  }

  const range = getReservationDateRange(reservation);
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

export const getReservationScheduleForFacility = (reservation, facilityId) => (
  getReservationSchedule(reservation, facilityId)
    .map(({ date, startTime, endTime }) => ({ date, startTime, endTime }))
);

const getRequestSchedule = (request, facilityId) => {
  const facilitySchedule = facilityId
    ? request.facilitySchedules?.[facilityId]
    : null;
  const schedule = Array.isArray(facilitySchedule)
    ? facilitySchedule
    : request.schedule;
  if (Array.isArray(schedule)) {
    return schedule
      .map((entry) => createScheduleEntry(entry.date, entry.startTime, entry.endTime))
      .filter(Boolean);
  }
  return getReservationSchedule(request, facilityId);
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
  const requestSchedule = getRequestSchedule(request, facilityId);
  if (requestSchedule.length === 0) return [];

  const overlaps = [];
  reservations.forEach((reservation) => {
    if (
      reservation.id === request.excludeReservationId
      || !isReservationActive(reservation)
      || hasRejectedApproval(reservation)
      || !(reservation.facilities || []).includes(facilityId)
    ) return;

    const reservationSchedule = getReservationSchedule(reservation, facilityId);
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

const normalizeSpecificRoom = (room) => String(room || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

export const findSpecificRoomConflict = (reservations, request) => {
  const requestedRoom = normalizeSpecificRoom(request.specificRoom);
  if (!requestedRoom) return null;

  const requestSchedule = getRequestSchedule(request);
  if (requestSchedule.length === 0) return null;

  for (const reservation of reservations) {
    if (
      reservation.id === request.excludeReservationId
      || !isReservationActive(reservation)
      || hasRejectedApproval(reservation)
      || normalizeSpecificRoom(reservation.specificRoom) !== requestedRoom
    ) continue;

    const reservationSchedule = getReservationSchedule(reservation);
    for (const requestEntry of requestSchedule) {
      const reservationEntry = reservationSchedule.find((entry) => (
        getScheduleOverlap(requestEntry, entry)
      ));
      if (reservationEntry) {
        return {
          ...reservation,
          conflictType: 'specific-room',
          conflictRoomName: String(reservation.specificRoom).trim(),
          conflictDate: requestEntry.date,
          conflictStartTime: reservationEntry.startTime,
          conflictEndTime: reservationEntry.endTime
        };
      }
    }
  }

  return null;
};

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

export const getFacilityCapacityAvailability = (reservations, request, facility) => {
  const maxCapacity = getFacilityCapacityLimits(facility).max;
  const requestSchedule = getRequestSchedule(request, facility.id);
  if (maxCapacity === null || requestSchedule.length === 0) {
    return {
      maxCapacity,
      scheduleAvailable: false,
      occupiedCapacity: 0,
      availableCapacity: null,
      hasUnknownCapacity: false
    };
  }

  let occupiedCapacity = 0;
  let hasUnknownCapacity = false;

  requestSchedule.forEach((requestEntry) => {
    const requestStart = requestEntry.dateOrdinal * 1440 + requestEntry.startMinute;
    const requestEnd = requestEntry.dateOrdinal * 1440 + requestEntry.endMinute;
    const overlappingEntries = [];

    reservations.forEach((reservation) => {
      if (
        reservation.id === request.excludeReservationId
        || !isReservationActive(reservation)
        || hasRejectedApproval(reservation)
        || !(reservation.facilities || []).includes(facility.id)
      ) return;

      const participants = getParticipantsForFacility(reservation, facility.id);
      getReservationSchedule(reservation, facility.id).forEach((reservationEntry) => {
        if (!getScheduleOverlap(requestEntry, reservationEntry)) return;
        const reservationStart = reservationEntry.dateOrdinal * 1440 + reservationEntry.startMinute;
        const reservationEnd = reservationEntry.dateOrdinal * 1440 + reservationEntry.endMinute;
        overlappingEntries.push({
          reservation,
          participants,
          start: Math.max(requestStart, reservationStart),
          end: Math.min(requestEnd, reservationEnd)
        });
      });
    });

    const boundaries = [...new Set([
      requestStart,
      requestEnd,
      ...overlappingEntries.flatMap(({ start, end }) => [start, end])
    ])].sort((first, second) => first - second);

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const segmentStart = boundaries[index];
      if (segmentStart >= requestEnd || boundaries[index + 1] <= requestStart) continue;

      const activeReservations = new Map();
      overlappingEntries.forEach(({ reservation, participants, start, end }) => {
        if (start <= segmentStart && end > segmentStart) {
          activeReservations.set(reservation.id || reservation, participants);
        }
      });

      let segmentOccupiedCapacity = 0;
      for (const participants of activeReservations.values()) {
        if (!Number.isInteger(participants) || participants <= 0) {
          hasUnknownCapacity = true;
          continue;
        }
        segmentOccupiedCapacity += participants;
      }

      occupiedCapacity = Math.max(occupiedCapacity, segmentOccupiedCapacity);
    }
  });

  return {
    maxCapacity,
    scheduleAvailable: true,
    occupiedCapacity,
    availableCapacity: hasUnknownCapacity
      ? 0
      : Math.max(0, maxCapacity - occupiedCapacity),
    hasUnknownCapacity
  };
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

    if (facility?.exclusiveScheduling) {
      const overlappingDetails = getOverlappingReservationDetails(
        reservations,
        request,
        facilityId
      );
      if (overlappingDetails.length > 0) {
        return createConflictResult(overlappingDetails[0], conflictDetails);
      }
      continue;
    }

    if (maxCapacity !== null) {
      const availability = getFacilityCapacityAvailability(reservations, request, facility);
      if (!availability.scheduleAvailable) continue;

      const overlappingReservations = getOverlappingFacilityReservations(
        reservations,
        request,
        facilityId
      );
      if (availability.hasUnknownCapacity) {
        return {
          ...overlappingReservations[0],
          ...conflictDetails,
          conflictType: 'unknown-capacity'
        };
      }

      const requestedCapacity = getParticipantsForFacility(request, facilityId);
      if (availability.occupiedCapacity + requestedCapacity > maxCapacity) {
        return {
          ...overlappingReservations[0],
          ...conflictDetails,
          conflictType: 'capacity',
          occupiedCapacity: availability.occupiedCapacity,
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
