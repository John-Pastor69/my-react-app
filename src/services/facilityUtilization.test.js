import assert from 'node:assert/strict';
import test from 'node:test';
import { getFacilityOperatingHours } from './facilityUtilization.js';

test('facility operating hours scale by the inclusive selected date range', () => {
  assert.equal(
    getFacilityOperatingHours(new Date(2026, 0, 1), new Date(2026, 0, 30)),
    450
  );
});

test('facility operating hours include one operating day for a one-day range', () => {
  const date = new Date(2026, 0, 1);
  assert.equal(getFacilityOperatingHours(date, date), 15);
});

test('facility sorting helpers break ties alphabetically', async () => {
  const { sortFacilityRanking, sortVenuesByUtilization, sortFacilitiesByName } = await import('./facilityUtilization.js');
  const facilities = [
    { name: 'Gymnasium', count: 1, utilizationPercent: 14.3 },
    { name: 'auditorium', count: 0, utilizationPercent: 14.3 },
    { name: 'Dance Studio', count: 1, utilizationPercent: 47.6 }
  ];
  assert.deepEqual(sortFacilityRanking(facilities, 'most').map((f) => f.name), ['Dance Studio', 'Gymnasium', 'auditorium']);
  assert.deepEqual(sortFacilityRanking(facilities, 'least').map((f) => f.name), ['auditorium', 'Dance Studio', 'Gymnasium']);
  assert.deepEqual(sortVenuesByUtilization(facilities).map((f) => f.name), ['Dance Studio', 'auditorium', 'Gymnasium']);
  assert.deepEqual(sortFacilitiesByName(facilities).map((f) => f.name), ['auditorium', 'Dance Studio', 'Gymnasium']);
});
