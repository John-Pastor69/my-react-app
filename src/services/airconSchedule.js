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

const formatEntry = (entry) => (
  `${formatDate(entry.date)} (${formatTimeRange(
    entry.airconOnTime || entry.startTime,
    entry.airconOffTime || entry.endTime
  )})`
);

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
      const entries = schedule
        .filter((entry) => typeof entry.aircon === 'boolean')
        .filter((entry) => entry.aircon)
        .map((entry) => ({
          date: formatDate(entry.date),
          time: formatTimeRange(
            entry.airconOnTime || entry.startTime,
            entry.airconOffTime || entry.endTime
          ),
          enabled: true
        }));
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
    const entries = schedule
      .filter((entry) => typeof entry.aircon === 'boolean')
      .filter((entry) => entry.aircon)
      .map((entry) => ({
        date: formatDate(entry.date),
        time: formatTimeRange(
          entry.airconOnTime || entry.startTime,
          entry.airconOffTime || entry.endTime
        ),
        enabled: true
      }));
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
