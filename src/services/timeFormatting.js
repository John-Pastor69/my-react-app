export const formatTimeForDisplay = (value) => {
  if (value == null || String(value).trim() === '') return '';

  const time = String(value).trim();
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return time;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || (meridiem ? hours < 1 || hours > 12 : hours > 23)) return time;

  if (meridiem) {
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
};

export const formatTimeRange = (startTime, endTime, separator = '–') => (
  `${formatTimeForDisplay(startTime)} ${separator} ${formatTimeForDisplay(endTime)}`.trim()
);
