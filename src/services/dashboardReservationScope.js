const hasText = (value) => typeof value === 'string' && Boolean(value.trim());

const hasEquipmentRequest = (reservation) => (
  Object.values(reservation.selectedEquip || {}).some((quantity) => Number(quantity) > 0)
  || hasText(reservation.otherEquipment)
);

const hasUtilityRequest = (reservation) => (
  (Array.isArray(reservation.selectedUtilities) && reservation.selectedUtilities.some(hasText))
  || hasText(reservation.otherUtility)
);

const hasFacilityRequest = (reservation) => (
  Array.isArray(reservation.facilities)
  && reservation.facilities.some((facilityId) => Boolean(String(facilityId || '').trim()))
);

const hasSpecificRoomRequest = (reservation) => (
  typeof reservation.specificRoom === 'string'
  && Boolean(reservation.specificRoom.trim())
);

export const matchesDashboardReservationScope = (reservation, dashboardRole) => {
  if (['mis', 'mis admin'].includes(dashboardRole)) {
    return hasEquipmentRequest(reservation) || hasUtilityRequest(reservation);
  }
  if (dashboardRole === 'building admin') return hasFacilityRequest(reservation);
  if (dashboardRole === 'room checker') return hasSpecificRoomRequest(reservation);
  return true;
};
