import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesDashboardReservationDateRange } from './dashboardReservationDateFilter.js';

test('matches a reservation when any scheduled date is inside the selected range', () => {
  assert.equal(
    matchesDashboardReservationDateRange(
      ['2026-11-12', '2026-11-13'],
      { startDate: '2026-11-13', endDate: '2026-11-19' }
    ),
    true
  );
});

test('rejects schedules wholly outside the selected range and supports open bounds', () => {
  assert.equal(
    matchesDashboardReservationDateRange(
      ['2026-11-12'],
      { startDate: '2026-11-13', endDate: '2026-11-19' }
    ),
    false
  );
  assert.equal(
    matchesDashboardReservationDateRange(['2026-11-13'], { startDate: '2026-11-13' }),
    true
  );
});
