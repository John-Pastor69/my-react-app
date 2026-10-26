import { isReservationActive } from './reservationStatus';

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

const getReservationDateRange = (reservation) => {
  const start = parseDateOrdinal(reservation.eventDate || reservation.date);
  if (start === null) return null;

  const explicitEnd = parseDateOrdinal(reservation.endDate);
  const dayCount = Math.max(1, Number(reservation.days) || 1);
  const end = explicitEnd ?? start + dayCount - 1;
  return end < start ? null : { start, end };
};

const timeRangesOverlapAcrossDates = (firstRange, firstStart, firstEnd, secondRange, secondStart, secondEnd) => {
  const firstEndMinute = firstEnd <= firstStart ? firstEnd + 1440 : firstEnd;
  const secondEndMinute = secondEnd <= secondStart ? secondEnd + 1440 : secondEnd;

  for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
    const firstDayStart = Math.max(firstRange.start, secondRange.start - dayOffset);
    const firstDayEnd = Math.min(firstRange.end, secondRange.end - dayOffset);
    if (firstDayStart > firstDayEnd) continue;

    const shiftedSecondStart = secondStart + dayOffset * 1440;
    const shiftedSecondEnd = secondEndMinute + dayOffset * 1440;
    if (firstStart < shiftedSecondEnd && firstEndMinute > shiftedSecondStart) return true;
  }
  return false;
};

export const getOverlappingFacilityReservations = (reservations, request, facilityId) => {
  const requestStart = parseDateOrdinal(request.eventDate);
  const requestEnd = parseDateOrdinal(request.endDate);
  const requestStartTime = parseTimeToMinutes(request.startTime);
  const requestEndTime = parseTimeToMinutes(request.endTime);
  if (
    requestStart === null
    || requestEnd === null
    || requestEnd < requestStart
    || requestStartTime === null
    || requestEndTime === null
    || requestEndTime === requestStartTime
    || !facilityId
  ) return [];

  return reservations.filter((reservation) => {
    if (reservation.id === request.excludeReservationId) return false;
    if (!isReservationActive(reservation)) return false;

    const hasRejectedApproval = Object.values(reservation.approvals || {}).some((approval) => {
      const approvalStatus = typeof approval === 'string' ? approval : approval?.status;
      return (approvalStatus || '').toLowerCase() === 'rejected';
    });
    if (hasRejectedApproval) return false;

    const existingRange = getReservationDateRange(reservation);
    if (!existingRange) return false;
    const existingStartTime = parseTimeToMinutes(reservation.startTime);
    const existingEndTime = parseTimeToMinutes(reservation.endTime);
    if (
      existingStartTime === null
      || existingEndTime === null
      || existingEndTime === existingStartTime
    ) return false;

    return (reservation.facilities || []).includes(facilityId)
      && timeRangesOverlapAcrossDates(
        { start: requestStart, end: requestEnd },
        requestStartTime,
        requestEndTime,
        existingRange,
        existingStartTime,
        existingEndTime
      );
  });
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

export const findFacilityConflict = (reservations, request, facilities) => {
  for (const facilityId of request.facilities) {
    const overlappingReservations = getOverlappingFacilityReservations(
      reservations,
      request,
      facilityId
    );
    if (overlappingReservations.length === 0) continue;

    const facility = facilities.find((item) => item.id === facilityId);
    const maxCapacity = facility ? getFacilityCapacityLimits(facility).max : null;
    const conflictDetails = {
      conflictFacilityName: facility?.name || facilityId,
      conflictType: 'schedule'
    };
    if (maxCapacity === null) return { ...overlappingReservations[0], ...conflictDetails };

    const hasUnknownCapacity = overlappingReservations.some((reservation) => {
      const participants = Number(reservation.expectedParticipants);
      return !Number.isInteger(participants) || participants <= 0;
    });
    if (hasUnknownCapacity) {
      return {
        ...overlappingReservations[0],
        ...conflictDetails,
        conflictType: 'unknown-capacity'
      };
    }

    const occupiedCapacity = overlappingReservations.reduce(
      (total, reservation) => total + Number(reservation.expectedParticipants),
      0
    );
    const requestedCapacity = Number(request.expectedParticipants);
    if (occupiedCapacity + requestedCapacity > maxCapacity) {
      return {
        ...overlappingReservations[0],
        ...conflictDetails,
        conflictType: 'capacity',
        occupiedCapacity,
        requestedCapacity,
        maxCapacity
      };
    }
  }
  return null;
};
