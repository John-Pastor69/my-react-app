import { isReservationActive } from './reservationStatus.js';

export const getUtilityReservedCount = (reservations, utilityId) => {
  if (!Array.isArray(reservations) || utilityId === null || utilityId === undefined) return 0;

  return reservations.reduce((total, reservation) => {
    if (
      !isReservationActive(reservation)
      || !Array.isArray(reservation.selectedUtilities)
      || !reservation.selectedUtilities.includes(utilityId)
    ) return total;

    const quantity = Number(reservation.selectedUtilityUnits?.[utilityId] ?? 1);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
};
