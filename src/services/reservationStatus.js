const RELEASED_RESERVATION_STATUSES = new Set([
  'rejected',
  'cancelled',
  'canceled',
  'expired',
  'archived'
]);

export const isReservationActive = (reservation) => (
  !RELEASED_RESERVATION_STATUSES.has((reservation.status || '').toLowerCase().trim())
);
