import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEquipmentAvailability,
  isValidEquipmentMaintenanceCount
} from './equipmentAvailability.js';

test('subtracts maintenance and reserved units from total inventory', () => {
  assert.deepEqual(
    getEquipmentAvailability({ totalCount: 19, underMaintenance: 2, reservedCount: 8 }),
    {
      total: 19,
      underMaintenance: 2,
      reserved: 8,
      bookablePool: 17,
      available: 9,
      isOvercommitted: false
    }
  );
});

test('total inventory equals the available, reserved, and maintenance units', () => {
  const inventory = getEquipmentAvailability({
    totalCount: 20,
    underMaintenance: 8,
    reservedCount: 2
  });

  assert.equal(inventory.available, 10);
  assert.equal(
    inventory.available + inventory.reserved + inventory.underMaintenance,
    inventory.total
  );
});

test('supports older equipment records and prevents negative availability when overcommitted', () => {
  assert.equal(
    getEquipmentAvailability({ totalCount: 10, reservedCount: 3 }).available,
    7
  );
  assert.deepEqual(
    getEquipmentAvailability({ totalCount: 5, underMaintenance: 3, reservedCount: 4 }),
    {
      total: 5,
      underMaintenance: 3,
      reserved: 4,
      bookablePool: 2,
      available: 0,
      isOvercommitted: true
    }
  );
});

test('normalizes invalid or excessive inventory counts safely', () => {
  assert.deepEqual(
    getEquipmentAvailability({ totalCount: 4, underMaintenance: 7, reservedCount: -2 }),
    {
      total: 4,
      underMaintenance: 4,
      reserved: 0,
      bookablePool: 0,
      available: 0,
      isOvercommitted: false
    }
  );
});

test('maintenance count must be a whole number within total inventory', () => {
  assert.equal(isValidEquipmentMaintenanceCount(2, 19), true);
  assert.equal(isValidEquipmentMaintenanceCount(19, 19), true);
  assert.equal(isValidEquipmentMaintenanceCount(20, 19), false);
  assert.equal(isValidEquipmentMaintenanceCount(1.5, 19), false);
  assert.equal(isValidEquipmentMaintenanceCount('', 19), false);
});
