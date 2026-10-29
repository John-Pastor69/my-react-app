import { parseDateOrdinal } from './reservationConflicts.js';

export const getUnavailableDateId = (date) => {
  const ordinal = parseDateOrdinal(date);
  return ordinal === null
    ? null
    : new Date(ordinal * 86400000).toISOString().slice(0, 10);
};

export const getUnavailableDatesInRange = (startDate, endDate, unavailableDates = []) => {
  const start = parseDateOrdinal(startDate);
  const end = parseDateOrdinal(endDate || startDate);
  if (start === null || end === null || end < start) return [];

  return unavailableDates.filter((unavailableDate) => {
    const ordinal = parseDateOrdinal(unavailableDate.date || unavailableDate.id);
    return ordinal !== null && ordinal >= start && ordinal <= end;
  });
};

export const getAvailableDatesInRange = (startDate, endDate, unavailableDates = []) => {
  const start = parseDateOrdinal(startDate);
  const end = parseDateOrdinal(endDate || startDate);
  if (start === null || end === null || end < start) return [];

  const unavailableOrdinals = new Set(getUnavailableDatesInRange(startDate, endDate, unavailableDates)
    .map((date) => parseDateOrdinal(date.date || date.id)));

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((ordinal) => !unavailableOrdinals.has(ordinal))
    .map((ordinal) => new Date(ordinal * 86400000).toISOString().slice(0, 10));
};

export const findUnavailableDateInRange = (startDate, endDate, unavailableDates = []) => (
  getUnavailableDatesInRange(startDate, endDate, unavailableDates)[0] || null
);
