import assert from 'node:assert/strict';
import test from 'node:test';
import { getUtilityReservedCount } from './utilityAvailability.js';

test('utility reserved count sums active reservation quantities with a default of one', () => {
  const reservations = [
    { status: 'pending', selectedUtilities: ['chairs'], selectedUtilityUnits: { chairs: 3 } },
    { status: 'approved', selectedUtilities: ['chairs'] },
    { status: 'rejected', selectedUtilities: ['chairs'], selectedUtilityUnits: { chairs: 8 } }
  ];

  assert.equal(getUtilityReservedCount(reservations, 'chairs'), 4);
});

test('utility reserved count ignores invalid quantities and reservations without the utility', () => {
  const reservations = [
    { selectedUtilities: ['chairs'], selectedUtilityUnits: { chairs: -2 } },
    { selectedUtilities: ['chairs'], selectedUtilityUnits: { chairs: 'invalid' } },
    { selectedUtilities: ['tables'], selectedUtilityUnits: { tables: 5 } },
    { selectedUtilities: ['chairs', 'chairs'], selectedUtilityUnits: { chairs: 2 } }
  ];

  assert.equal(getUtilityReservedCount(reservations, 'chairs'), 2);
  assert.equal(getUtilityReservedCount(null, 'chairs'), 0);
});
