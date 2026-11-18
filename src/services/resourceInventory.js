// Ranking and alert rules for the MIS equipment and utility inventory, shared by the dashboard panels
// and the MIS PDF report so both always agree.

const compareNames = (first, second) => String(first.name || '').localeCompare(
  String(second.name || ''),
  undefined,
  { sensitivity: 'base' }
);

// Share of units that can't be borrowed right now: (reserved + under maintenance) / total units.
export const getEquipmentUsagePercent = (item) => (
  item.total > 0
    ? ((Number(item.reserved) || 0) + (Number(item.underMaintenance) || 0)) / item.total * 100
    : 100
);

// Alerts only; healthy items get none. "No stock" when nothing is available, "Low stock" below 30%
// available, and "High Maintenance" when half or more of the units are under maintenance.
export const getEquipmentAlerts = (item) => {
  const total = Number(item.total) || 0;
  const available = Number(item.available) || 0;
  const alerts = [];
  if (available === 0) {
    alerts.push({ key: 'no-stock', label: 'No stock' });
  } else if (available / total < 0.3) {
    alerts.push({ key: 'low-stock', label: 'Low stock' });
  }
  if (total > 0 && (Number(item.underMaintenance) || 0) / total >= 0.5) {
    alerts.push({ key: 'high-maintenance', label: 'High Maintenance' });
  }
  return alerts;
};

// Least available equipment first; ties alphabetically.
export const sortEquipmentByUsage = (equipment) => [...equipment].sort((first, second) => (
  getEquipmentUsagePercent(second) - getEquipmentUsagePercent(first) || compareNames(first, second)
));

// Most reserved utilities first; ties alphabetically.
export const sortUtilitiesByReserved = (utilities) => [...utilities].sort((first, second) => (
  (Number(second.reserved) || 0) - (Number(first.reserved) || 0) || compareNames(first, second)
));

// Most reserved equipment-hours first; ties alphabetically.
export const sortEquipmentByHours = (equipment) => [...equipment].sort((first, second) => (
  (Number(second.hours) || 0) - (Number(first.hours) || 0) || compareNames(first, second)
));

// Equipment Maintenance Index: share of all equipment units currently under maintenance (offline),
// = sum(underMaintenance) / sum(total units) * 100. Level: "healthy" below 15%, "watch" (shown as Warning) from 15% to
// 25%, "critical" above 25%. Each item also gets its own level from its own share. `items` lists equipment with units in maintenance, most first.
export const MAINTENANCE_WATCH_PERCENT = 15;
export const MAINTENANCE_CRITICAL_PERCENT = 25;

const getMaintenanceLevel = (percent) => {
  if (percent > MAINTENANCE_CRITICAL_PERCENT) return 'critical';
  return percent >= MAINTENANCE_WATCH_PERCENT ? 'watch' : 'healthy';
};

export const getEquipmentMaintenanceIndex = (equipment) => {
  const toCount = (value) => Math.max(0, Number(value) || 0);
  const totalUnits = equipment.reduce((total, item) => total + toCount(item.total), 0);
  const underMaintenance = equipment.reduce(
    (total, item) => total + Math.min(toCount(item.underMaintenance), toCount(item.total)),
    0
  );
  const percent = totalUnits ? underMaintenance / totalUnits * 100 : 0;
  return {
    percent,
    totalUnits,
    underMaintenance,
    level: getMaintenanceLevel(percent),
    items: equipment
      .filter((item) => toCount(item.underMaintenance) > 0)
      .map((item) => {
        const itemUnderMaintenance = Math.min(toCount(item.underMaintenance), toCount(item.total));
        const itemTotal = toCount(item.total);
        const itemPercent = itemTotal ? itemUnderMaintenance / itemTotal * 100 : 0;
        return {
          id: item.id,
          name: item.name || 'Unnamed equipment',
          underMaintenance: itemUnderMaintenance,
          total: itemTotal,
          percent: itemPercent,
          level: getMaintenanceLevel(itemPercent)
        };
      })
      .sort((first, second) => second.underMaintenance - first.underMaintenance || compareNames(first, second))
  };
};
