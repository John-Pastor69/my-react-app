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
