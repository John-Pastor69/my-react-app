const DAY_IN_MS = 24 * 60 * 60 * 1000;
const OPERATING_HOURS_PER_DAY = 15;

const compareNames = (first, second) => String(first.name || '').localeCompare(
  String(second.name || ''),
  undefined,
  { sensitivity: 'base' }
);

export const sortFacilitiesByName = (facilities) => [...facilities].sort(compareNames);

export const sortVenuesByUtilization = (venues) => [...venues].sort((first, second) => (
  (Number(second.utilizationPercent) || 0) - (Number(first.utilizationPercent) || 0)
  || compareNames(first, second)
));

// Most/least ranking by a numeric field (e.g. `count`, `quantity`); ties are listed alphabetically.
export const sortRankingByValue = (items, mode = 'most', valueKey = 'count') => [...items].sort((first, second) => (
  (mode === 'most'
    ? (Number(second[valueKey]) || 0) - (Number(first[valueKey]) || 0)
    : (Number(first[valueKey]) || 0) - (Number(second[valueKey]) || 0))
  || compareNames(first, second)
));

export const sortFacilityRanking = (facilities, mode = 'most') => sortRankingByValue(facilities, mode, 'count');

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
