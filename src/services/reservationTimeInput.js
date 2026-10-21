export const isReservationTimeInputValid = (value) => {
  if (value === '') return true;
  if (!/^[0-9:aApPmM\s]*$/.test(value) || value.length > 8) return false;

  const [hours, minutes] = value.replace(/[aApPmM\s]/g, '').split(':');
  if (value.replace(/[aApPmM\s]/g, '').split(':').length > 2) return false;
  if (hours?.length > 2 || minutes?.length > 2) return false;
  if (hours && (Number(hours) > 12 || (hours.length === 2 && Number(hours) === 0))) return false;
  if (minutes && Number(minutes) > 59) return false;
  return true;
};

export const formatReservationTimeInput = (value) => {
  const match = value.trim().toUpperCase().match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
  if (!match) return '';

  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours < 1 || hours > 12 || minutes > 59) return '';

  const meridiem = match[3] || (hours === 12 ? 'PM' : 'AM');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`;
};
