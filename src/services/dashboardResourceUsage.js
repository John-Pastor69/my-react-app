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

// The requestor's program/course from their saved sign-up details, or null (e.g. department accounts).
export const getRequestorProgram = (requestorInfo) => {
  const requestorRecords = Array.isArray(requestorInfo) ? requestorInfo : [requestorInfo];
  const dropdown = requestorRecords
    .flatMap((record) => {
      const signupDropdown = record?.signupDropdown;
      return Array.isArray(signupDropdown) ? signupDropdown : [signupDropdown];
    })
    .find((candidate) => (
      typeof candidate?.value === 'string'
      && candidate.value.trim()
      && /(course|program)/.test(normalizeDropdownLabel(`${candidate.label || ''} ${candidate.id || ''}`))
    ));
  if (!dropdown) return null;
  const label = typeof dropdown.label === 'string' && dropdown.label.trim() ? dropdown.label.trim() : 'Program';
  const name = `${label}: ${dropdown.value.trim()}`;
  return { name, key: name.toLowerCase().replace(/\s+/g, ' ') };
};

// Approved reservations that booked a facility or specific room, per program/course (department and
// office accounts are left out). Uses the same shape as getDepartmentalResourceConsumption, with `units` = reservations;
// `items` lists the facilities and rooms used, each counted once per reservation. Rooms sharing a 3-digit
// number are one room. `getRoomKey` groups rooms; `facilityData` supplies facility names.
export const getFacilityConsumptionByGroup = (reservations, facilityData = [], getRoomKey = (room) => room) => {
  const facilityNames = new Map(facilityData.map((facility) => [
    String(facility.id),
    facility.name || 'Facility'
  ]));
  const groups = new Map();
  reservations
    .filter((reservation) => (reservation.status || '').toLowerCase().trim() === 'approved')
    .forEach((reservation) => {
      const facilityIds = [...new Set((reservation.facilities || []).map(String))];
      const specificRoom = typeof reservation.specificRoom === 'string' ? reservation.specificRoom.trim() : '';
      if (!facilityIds.length && !specificRoom) return;

      // Programs/courses only; reservations from department or office accounts are not counted.
      const program = getRequestorProgram(reservation.requestorInfo || {});
      if (!program) return;
      const { name, key } = program;
      const group = groups.get(key) || { name, units: 0, itemCounts: new Map() };
      group.units += 1;
      const addItem = (itemKey, itemName, isRoom) => {
        const item = group.itemCounts.get(itemKey) || { name: itemName, units: 0, isRoom };
        item.units += 1;
        group.itemCounts.set(itemKey, item);
      };
      facilityIds.forEach((id) => addItem(`facility-${id}`, facilityNames.get(id) || 'Facility', false));
      if (specificRoom) {
        const roomNumbers = specificRoom.match(/(?<!\d)\d{3}(?!\d)/g);
        addItem(
          `room-${getRoomKey(specificRoom)}`,
          `Room ${roomNumbers ? [...new Set(roomNumbers)].join(' / ') : specificRoom}`,
          true
        );
      }
      groups.set(key, group);
    });

  return [...groups.entries()]
    .map(([id, { itemCounts, ...group }]) => ({
      id,
      ...group,
      items: [...itemCounts.values()].sort((first, second) => (
        second.units - first.units || first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
      ))
    }))
    .sort((first, second) => (
      second.units - first.units || first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
    ));
};

// Approved equipment units per requestor group. Each group also lists the equipment those units were
// made of (`items`: [{ name, units, isOtherRequest }], most units first). `equipmentData` supplies names.
export const getDepartmentalResourceConsumption = (reservations, equipmentData = []) => {
  const equipmentNames = new Map(equipmentData.map((equipment) => [
    String(equipment.id),
    equipment.name || 'Equipment'
  ]));
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
      const group = consumptionByGroup.get(key) || { name, units: 0, itemUnits: new Map() };
      group.units += totalUnits;
      const addItem = (itemKey, itemName, units, isOtherRequest) => {
        const item = group.itemUnits.get(itemKey) || { name: itemName, units: 0, isOtherRequest };
        item.units += units;
        group.itemUnits.set(itemKey, item);
      };
      Object.entries(reservation.selectedEquip || {}).forEach(([equipmentId, quantity]) => {
        const units = Number(quantity);
        if (!Number.isFinite(units) || units <= 0) return;
        addItem(`equipment-${equipmentId}`, equipmentNames.get(String(equipmentId)) || 'Equipment', units, false);
      });
      if (otherEquipment) {
        addItem(`other-${otherEquipment.key}`, otherEquipment.name, otherEquipment.quantity, true);
      }
      consumptionByGroup.set(key, group);
    });

  return [...consumptionByGroup.entries()]
    .map(([id, { itemUnits, ...group }]) => ({
      id,
      ...group,
      items: [...itemUnits.values()].sort((first, second) => (
        second.units - first.units || first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
      ))
    }))
    .sort((first, second) => second.units - first.units);
};
