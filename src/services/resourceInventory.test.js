import assert from 'node:assert/strict';
import test from 'node:test';
import { getEquipmentMaintenanceIndex } from './resourceInventory.js';

test('maintenance index is units under maintenance over all units', () => {
  const index = getEquipmentMaintenanceIndex([
    { id: 'lcd', name: 'LCD Projector', total: 19, underMaintenance: 0 },
    { id: 'mic', name: 'Microphone', total: 14, underMaintenance: 8 },
    { id: 'sound', name: 'Sound System', total: 10, underMaintenance: 0 },
    { id: 'wide', name: 'Widescreen', total: 13, underMaintenance: 2 }
  ]);

  assert.equal(index.totalUnits, 56);
  assert.equal(index.underMaintenance, 10);
  assert.equal(index.percent.toFixed(1), '17.9');
  assert.equal(index.level, 'watch'); // 15–25% is Warning
  assert.deepEqual(index.items.map((item) => [item.name, item.underMaintenance, item.level]), [
    ['Microphone', 8, 'critical'],
    ['Widescreen', 2, 'watch'] // 2 of 13 = 15.4%
  ]);
});

test('maintenance index levels and empty inventory', () => {
  assert.equal(getEquipmentMaintenanceIndex([{ total: 100, underMaintenance: 14 }]).level, 'healthy');
  assert.equal(getEquipmentMaintenanceIndex([{ total: 100, underMaintenance: 15 }]).level, 'watch');
  assert.equal(getEquipmentMaintenanceIndex([{ total: 100, underMaintenance: 25 }]).level, 'watch');
  assert.equal(getEquipmentMaintenanceIndex([{ total: 100, underMaintenance: 26 }]).level, 'critical');
  assert.deepEqual(
    [getEquipmentMaintenanceIndex([]).percent, getEquipmentMaintenanceIndex([]).level],
    [0, 'healthy']
  );
});
