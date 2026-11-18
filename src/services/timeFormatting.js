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

// Readable date for an approval-history entry. Saved ISO timestamps ("2026-11-18T17:40:52.919Z") become
// "Nov 19, 2026 at 01:40 AM" in local time, matching the app's other history dates; already-readable
// dates are shown as saved.
export const formatHistoryDate = (value) => {
  if (!value) return 'Date unavailable';
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
};
