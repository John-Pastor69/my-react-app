const DAY_IN_MS = 24 * 60 * 60 * 1000;
const OPERATING_HOURS_PER_DAY = 15;

export const getFacilityOperatingHours = (startDate, endDate) => {
  if (
    !(startDate instanceof Date)
    || Number.isNaN(startDate.getTime())
    || !(endDate instanceof Date)
    || Number.isNaN(endDate.getTime())
  ) return 0;

  const startDay = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const endDay = Date.UTC(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  const dayCount = Math.floor((Math.max(startDay, endDay) - Math.min(startDay, endDay)) / DAY_IN_MS) + 1;
  return dayCount * OPERATING_HOURS_PER_DAY;
};
