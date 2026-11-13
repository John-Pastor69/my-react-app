import { getReservationScheduleForFacility } from './reservationConflicts.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const normalizeDate = (value, parseDate) => {
  const parsedDate = parseDate(value);
  if (!parsedDate) return null;
  const date = new Date(parsedDate);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getReservationActivityDates = (reservation, parseDate) => {
  const scheduleDates = getReservationScheduleForFacility(reservation)
    .map(({ date }) => normalizeDate(date, parseDate))
    .filter(Boolean);
  if (scheduleDates.length) return scheduleDates;

  const eventDate = normalizeDate(
    reservation.eventDate || reservation.date,
    parseDate
  );
  return eventDate ? [eventDate] : [];
};

export const buildDashboardReservationTrend = (
  reservations,
  { startDate, endDate, parseDate }
) => {
  const from = startDate || endDate || new Date();
  const to = endDate || startDate || new Date();
  const firstDay = new Date(Math.min(from.getTime(), to.getTime()));
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(Math.max(from.getTime(), to.getTime()));
  lastDay.setHours(0, 0, 0, 0);
  const dayCount = Math.max(1, Math.floor((lastDay - firstDay) / DAY_IN_MS) + 1);
  const bucketCount = Math.min(7, dayCount);
  const reservationDates = reservations.map((reservation) => (
    getReservationActivityDates(reservation, parseDate)
  ));

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(
      firstDay.getTime() + Math.floor(index * dayCount / bucketCount) * DAY_IN_MS
    );
    const bucketEnd = new Date(
      firstDay.getTime() + Math.floor((index + 1) * dayCount / bucketCount) * DAY_IN_MS
    );

    return {
      label: dayCount <= 7
        ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' })
        : bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: reservationDates.filter((dates) => (
        dates.some((date) => (
          date >= bucketStart && date < bucketEnd
        ))
      )).length
    };
  });
};
