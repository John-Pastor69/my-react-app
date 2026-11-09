export const parseReservationTime = (value) => {
  if (!value || value === 'N/A') return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (
    minutes > 59
    || (meridiem && (hours < 1 || hours > 12))
    || (!meridiem && hours > 23)
  ) return null;
  if (meridiem) hours = hours % 12 + (meridiem === 'PM' ? 12 : 0);
  return { hours, minutes };
};
