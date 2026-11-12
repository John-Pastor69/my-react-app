import { getReservationScheduleForFacility } from './reservationConflicts.js';
import { parseReservationTime } from './reservationTime.js';

export const getOtherRequestDetails = (reservation, nameField, unitsField) => {
  const rawName = typeof reservation[nameField] === 'string'
    ? reservation[nameField].trim()
    : '';
  if (!rawName) return null;

  const legacyUnits = rawName.match(/\s*-\s*(\d+)(?:\s+units?)?\s*$/i);
  const name = (legacyUnits ? rawName.slice(0, legacyUnits.index) : rawName).trim();
  if (!name) return null;

  const requestedUnits = Number(reservation[unitsField]);
  return {
    name,
    key: name.toLowerCase(),
    quantity: Number.isFinite(requestedUnits) && requestedUnits > 0
      ? requestedUnits
      : Number(legacyUnits?.[1]) || 1
  };
};

export const getEquipmentReservedHours = (reservations, equipmentData) => {
  const hoursByEquipment = new Map(
    equipmentData.map((equipment) => [equipment.id, {
      id: equipment.id,
      name: equipment.name || 'Equipment',
      hours: 0,
      sessions: [],
      isOtherRequest: false
    }])
  );

  reservations
    .filter((reservation) => (reservation.status || '').toLowerCase().trim() === 'approved')
    .forEach((reservation) => {
      const scheduledSessions = getReservationScheduleForFacility(reservation).flatMap((entry) => {
        const startTime = parseReservationTime(entry.startTime);
        const endTime = parseReservationTime(entry.endTime);
        if (!startTime || !endTime) return [];

        const start = startTime.hours * 60 + startTime.minutes;
        const end = endTime.hours * 60 + endTime.minutes;
        return end <= start
          ? []
          : [{ ...entry, hours: (end - start) / 60 }];
      });
      const reservedHours = scheduledSessions.reduce((total, session) => total + session.hours, 0);
      if (reservedHours <= 0) return;

      const addEquipmentUsage = (equipment, quantity) => {
        equipment.hours += reservedHours * quantity;
        equipment.sessions.push(...scheduledSessions.map((session) => ({
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          quantity,
          durationHours: session.hours,
          hours: session.hours * quantity
        })));
      };

      Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
        const units = Number(quantity);
        if (!Number.isFinite(units) || units <= 0) return;

        const equipment = hoursByEquipment.get(equipmentId) || {
          id: equipmentId,
          name: equipmentId,
          hours: 0,
          sessions: [],
          isOtherRequest: false
        };
        addEquipmentUsage(equipment, units);
        hoursByEquipment.set(equipmentId, equipment);
      });

      const otherEquipment = getOtherRequestDetails(
        reservation,
        'otherEquipment',
        'otherEquipmentUnits'
      );
      if (otherEquipment) {
        const id = `other-${otherEquipment.key}`;
        const equipment = hoursByEquipment.get(id) || {
          id,
          name: otherEquipment.name,
          hours: 0,
          sessions: [],
          isOtherRequest: true
        };
        addEquipmentUsage(equipment, otherEquipment.quantity);
        hoursByEquipment.set(id, equipment);
      }
    });

  return [...hoursByEquipment.values()]
    .filter((equipment) => equipment.hours > 0)
    .sort((first, second) => second.hours - first.hours);
};

const normalizeDropdownLabel = (label) => String(label || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getRequestorSignupDropdown = (requestorInfo) => {
  const requestorRecords = Array.isArray(requestorInfo) ? requestorInfo : [requestorInfo];
  const dropdowns = requestorRecords.flatMap((requestorRecord) => {
    const signupDropdown = requestorRecord?.signupDropdown;
    return Array.isArray(signupDropdown) ? signupDropdown : [signupDropdown];
  }).filter((dropdown) => (
    typeof dropdown?.value === 'string' && dropdown.value.trim()
  ));
  return dropdowns.find((dropdown) => (
    /(department|office|course|program)/.test(normalizeDropdownLabel(
      dropdown.label || dropdown.id
    ))
  )) || dropdowns[0] || null;
};

export const getDepartmentalResourceConsumption = (reservations) => {
  const consumptionByGroup = new Map();
  reservations
    .filter((reservation) => (reservation.status || '').toLowerCase().trim() === 'approved')
    .forEach((reservation) => {
      const requestorInfo = reservation.requestorInfo || {};
      const signupDropdown = getRequestorSignupDropdown(requestorInfo);

      const equipmentUnits = Object.values(reservation.selectedEquip || {}).reduce(
        (total, quantity) => {
          const units = Number(quantity);
          return Number.isFinite(units) && units > 0 ? total + units : total;
        },
        0
      );
      const otherEquipment = getOtherRequestDetails(
        reservation,
        'otherEquipment',
        'otherEquipmentUnits'
      );
      const totalUnits = equipmentUnits + (otherEquipment?.quantity || 0);
      if (totalUnits <= 0) return;

      const label = typeof signupDropdown?.label === 'string' && signupDropdown.label.trim()
        ? signupDropdown.label.trim()
        : 'Requestor group';
      const value = typeof signupDropdown?.value === 'string'
        ? signupDropdown.value.trim()
        : '';
      const name = value ? `${label}: ${value}` : 'Unspecified requestor group';
      const key = name.toLowerCase().replace(/\s+/g, ' ');
      const group = consumptionByGroup.get(key) || { name, units: 0 };
      group.units += totalUnits;
      consumptionByGroup.set(key, group);
    });

  return [...consumptionByGroup.entries()]
    .map(([id, group]) => ({ id, ...group }))
    .sort((first, second) => second.units - first.units);
};
