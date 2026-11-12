import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesDashboardReservationScope } from './dashboardReservationScope.js';

test('MIS dashboard scope includes equipment and utility requests, including other items', () => {
  assert.equal(matchesDashboardReservationScope({ selectedEquip: { projector: 1 } }, 'mis'), true);
  assert.equal(matchesDashboardReservationScope({ selectedUtilities: ['electricity'] }, 'mis admin'), true);
  assert.equal(matchesDashboardReservationScope({ otherEquipment: 'Microphone' }, 'mis'), true);
  assert.equal(matchesDashboardReservationScope({ otherUtility: 'Internet' }, 'mis'), true);
  assert.equal(matchesDashboardReservationScope({ selectedEquip: { projector: 0 } }, 'mis'), false);
  assert.equal(matchesDashboardReservationScope({ facilities: ['hall-a'] }, 'mis'), false);
});

test('Building Admin scope requires a selected facility and does not treat a specific room as one', () => {
  assert.equal(matchesDashboardReservationScope({ facilities: ['hall-a'] }, 'building admin'), true);
  assert.equal(matchesDashboardReservationScope({ specificRoom: 'Room 301' }, 'building admin'), false);
  assert.equal(matchesDashboardReservationScope({
    facilities: ['hall-a'],
    specificRoom: 'Room 301'
  }, 'building admin'), true);
});

test('Room Checker scope requires a non-empty specific room', () => {
  assert.equal(matchesDashboardReservationScope({ specificRoom: 'Room 301' }, 'room checker'), true);
  assert.equal(matchesDashboardReservationScope({ specificRoom: '   ' }, 'room checker'), false);
  assert.equal(matchesDashboardReservationScope({ facilities: ['hall-a'] }, 'room checker'), false);
});
