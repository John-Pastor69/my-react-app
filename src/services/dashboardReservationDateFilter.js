export const matchesDashboardReservationDateRange = (
  dates,
  { startDate = '', endDate = '' } = {}
) => Array.isArray(dates) && dates.some((date) => (
  typeof date === 'string'
  && (!startDate || date >= startDate)
  && (!endDate || date <= endDate)
));
