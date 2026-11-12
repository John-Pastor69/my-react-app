const toText = (value) => (value === null || value === undefined ? '' : String(value));

export const getDashboardPdfDateRange = ({ startDate, endDate }) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const parseFilterDate = (value) => {
    const dateString = toText(value).trim();
    if (!dateString) return null;
    if (!datePattern.test(dateString)) {
      throw new Error('The selected date range cannot be used in the PDF filename.');
    }

    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) {
      throw new Error('The selected date range cannot be used in the PDF filename.');
    }
    return date;
  };
  const start = parseFilterDate(startDate);
  const end = parseFilterDate(endDate);
  const formatMonth = (date) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  const formatDate = (date) => `${formatMonth(date)} ${date.getDate()}, ${date.getFullYear()}`;

  if (!start && !end) return 'All dates';
  if (!start) return `Through ${formatDate(end)}`;
  if (!end) return `From ${formatDate(start)}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${formatMonth(start)} ${start.getDate()} to ${formatMonth(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${formatMonth(start)} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`;
};
