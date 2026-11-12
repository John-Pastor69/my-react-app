import assert from 'node:assert/strict';
import test from 'node:test';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';

test('formats a same-month date range like the Building Admin PDF filename', () => {
  assert.equal(
    getDashboardPdfDateRange({ startDate: '2026-11-12', endDate: '2026-11-18' }),
    'Nov 12-18, 2026'
  );
});

test('formats missing dates and cross-month ranges', () => {
  assert.equal(getDashboardPdfDateRange({ startDate: '', endDate: '' }), 'All dates');
  assert.equal(
    getDashboardPdfDateRange({ startDate: '2026-11-30', endDate: '2026-12-04' }),
    'Nov 30 to Dec 4, 2026'
  );
});

test('rejects invalid date filters', () => {
  assert.throws(
    () => getDashboardPdfDateRange({ startDate: '2026-02-30', endDate: '' }),
    /cannot be used in the PDF filename/
  );
});
