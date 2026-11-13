const toNonNegativeInteger = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0;
};

export const isValidEquipmentMaintenanceCount = (value, totalCount) => {
  if (typeof value === 'string' && !value.trim()) return false;
  const maintenanceCount = Number(value);
  const total = toNonNegativeInteger(totalCount);
  return Number.isSafeInteger(maintenanceCount)
    && maintenanceCount >= 0
    && maintenanceCount <= total;
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
