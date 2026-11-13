import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardReservationTrend } from './dashboardReservationTrend.js';

const parseLocalDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? date
    : null;
};

test('counts each multi-day reservation on its scheduled dates inside the selected range', () => {
  const trend = buildDashboardReservationTrend([
    {
      eventDate: '2026-11-11',
      endDate: '2026-11-15',
      startTime: '08:00',
      endTime: '09:00'
    },
    {
      eventDate: '2026-11-10',
      endDate: '2026-11-12',
      startTime: '08:00',
      endTime: '09:00'
    }
  ], {
    startDate: new Date(2026, 10, 13),
    endDate: new Date(2026, 10, 19),
    parseDate: parseLocalDate
  });

  assert.deepEqual(trend.map((bucket) => bucket.count), [1, 1, 1, 0, 0, 0, 0]);
});

test('counts a reservation at most once in a grouped bucket', () => {
  const trend = buildDashboardReservationTrend([{
    eventDate: '2026-11-13',
    endDate: '2026-11-14',
    startTime: '08:00',
    endTime: '09:00'
  }], {
    startDate: new Date(2026, 10, 13),
    endDate: new Date(2026, 10, 27),
    parseDate: parseLocalDate
  });

  assert.deepEqual(trend.map((bucket) => bucket.count), [1, 0, 0, 0, 0, 0, 0]);
});
