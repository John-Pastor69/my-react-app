const toNonNegativeInteger = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0;
};

// Maintenance comes out of the units that aren't reserved (available + any already in maintenance),
// so reserved units can never be put under maintenance: max = total - reserved.
export const getMaxMaintenanceCount = (totalCount, reservedCount = 0) => Math.max(
  0,
  toNonNegativeInteger(totalCount) - toNonNegativeInteger(reservedCount)
);

export const isValidEquipmentMaintenanceCount = (value, totalCount, reservedCount = 0) => {
  if (typeof value === 'string' && !value.trim()) return false;
  const maintenanceCount = Number(value);
  return Number.isSafeInteger(maintenanceCount)
    && maintenanceCount >= 0
    && maintenanceCount <= getMaxMaintenanceCount(totalCount, reservedCount);
};

export const getEquipmentAvailability = ({
  totalCount,
  underMaintenance = 0,
  reservedCount = 0
}) => {
  const total = toNonNegativeInteger(totalCount);
  const maintenanceCount = Math.min(total, toNonNegativeInteger(underMaintenance));
  const reserved = toNonNegativeInteger(reservedCount);
  const bookablePool = total - maintenanceCount;

  return {
    total,
    underMaintenance: maintenanceCount,
    reserved,
    bookablePool,
    available: Math.max(0, bookablePool - reserved),
    isOvercommitted: reserved > bookablePool
  };
};
