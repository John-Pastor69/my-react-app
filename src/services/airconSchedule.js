import { formatTimeRange } from './timeFormatting.js';

const formatDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || 'Date unavailable');

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
};

const getDateOrdinal = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return Math.floor(date.getTime() / 86_400_000);
};

const formatDateRange = (startValue, endValue) => {
  if (startValue === endValue) return formatDate(startValue);

  const [, startYear, startMonth, startDay] = startValue.match(/^(\d{4})-(\d{2})-(\d{2})$/).map(Number);
  const [, endYear, endMonth, endDay] = endValue.match(/^(\d{4})-(\d{2})-(\d{2})$/).map(Number);
  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  const startMonthName = monthFormatter.format(start);
  const endMonthName = monthFormatter.format(end);

  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonthName} ${startDay}–${endDay}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startMonthName} ${startDay} – ${endMonthName} ${endDay}, ${startYear}`;
  }
  return `${formatDate(startValue)} – ${formatDate(endValue)}`;
};

const formatScheduleEntries = (schedule) => {
  const entries = schedule
    .filter((entry) => typeof entry.aircon === 'boolean' && entry.aircon)
    .map((entry) => ({
      date: entry.date,
      dateOrdinal: getDateOrdinal(entry.date),
      time: formatTimeRange(
        entry.airconOnTime || entry.startTime,
        entry.airconOffTime || entry.endTime
      ),
      enabled: true
    }));
  const groupedEntries = [];

  entries.forEach((entry) => {
    const previous = groupedEntries[groupedEntries.length - 1];
    if (
      previous
      && entry.dateOrdinal !== null
      && previous.endDateOrdinal !== null
      && entry.dateOrdinal === previous.endDateOrdinal + 1
      && entry.time === previous.time
    ) {
      previous.endDate = entry.date;
      previous.endDateOrdinal = entry.dateOrdinal;
      return;
    }

    groupedEntries.push({
      ...entry,
      endDate: entry.date,
      endDateOrdinal: entry.dateOrdinal
    });
  });

  return groupedEntries.map((entry) => ({
    date: entry.dateOrdinal === null || entry.endDateOrdinal === null
      ? formatDate(entry.date)
      : formatDateRange(entry.date, entry.endDate),
    time: entry.time,
    enabled: entry.enabled
  }));
};

export const getAirconScheduleDetails = (reservation, facilities = {}) => {
  const facilitySchedules = reservation.facilitySchedules
    && typeof reservation.facilitySchedules === 'object'
    ? Object.entries(reservation.facilitySchedules).filter(([, schedule]) => Array.isArray(schedule))
    : [];
  const hasFacilityAirconSchedule = facilitySchedules.some(([, schedule]) => (
    schedule.some((entry) => typeof entry.aircon === 'boolean')
  ));

  if (hasFacilityAirconSchedule) {
    const groups = facilitySchedules.flatMap(([facilityId, schedule], index) => {
      const entries = formatScheduleEntries(schedule);
      if (entries.length === 0) return [];

      return [{
        name: facilities[facilityId]?.name || `Facility ${index + 1}`,
        entries
      }];
    });
    return {
      enabled: groups.some((group) => group.entries.some((entry) => entry.enabled)),
      groups
    };
  }

  const schedule = Array.isArray(reservation.schedule) ? reservation.schedule : [];
  if (schedule.some((entry) => typeof entry.aircon === 'boolean')) {
    const entries = formatScheduleEntries(schedule);
    return {
      enabled: entries.some((entry) => entry.enabled),
      groups: [{ name: '', entries }]
    };
  }

  return {
    enabled: Boolean(reservation.aircon),
    groups: reservation.aircon ? [{
      name: '',
      entries: [{
        date: '',
        time: reservation.airconOnTime || reservation.airconOffTime
          ? formatTimeRange(reservation.airconOnTime || '?', reservation.airconOffTime || '?')
          : '',
        enabled: true
      }]
    }] : []
  };
};

export const getAirconScheduleSummary = (reservation, facilities = {}) => {
  const details = getAirconScheduleDetails(reservation, facilities);
  if (!details.enabled) return 'OFF';

  const isLegacySummary = details.groups.length === 1
    && !details.groups[0].name
    && details.groups[0].entries.length === 1
    && !details.groups[0].entries[0].date;
  if (isLegacySummary) {
    const time = details.groups[0].entries[0].time;
    return `ON${time ? ` (${time})` : ''}`;
  }

  const groups = details.groups.map(({ name, entries }) => {
    const formattedEntries = entries.map((entry) => (
      entry.date
        ? entry.enabled
          ? `${entry.date} (${entry.time})`
          : `${entry.date} (OFF)`
        : entry.time
    )).filter(Boolean);
    return `${name ? `${name}: ` : ''}${formattedEntries.join(', ')}`;
  }).filter((group) => group.trim());

  return `ON${groups.length ? ` — ${groups.join('; ')}` : ''}`;
};
