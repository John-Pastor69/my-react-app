import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvailableDatesInRange,
  findUnavailableDateInRange,
  getUnavailableDateId,
  getUnavailableDatesInRange
} from './unavailableDates.js';

test('normalizes supported calendar date formats to an ISO document id', () => {
  assert.equal(getUnavailableDateId('10/29/2026'), '2026-10-29');
  assert.equal(getUnavailableDateId('2026-10-29'), '2026-10-29');
  assert.equal(getUnavailableDateId('02/30/2026'), null);
});

test('finds an unavailable date on either boundary or inside a reservation range', () => {
  const unavailableDates = [
    { id: '2026-10-30', date: '2026-10-30', remark: 'Maintenance' }
  ];

 assert.deepEqual(
   findUnavailableDateInRange('10/29/2026', '10/30/2026', unavailableDates),
   unavailableDates[0]
 );
 assert.deepEqual(
   findUnavailableDateInRange('10/30/2026', '11/01/2026', unavailableDates),
   unavailableDates[0]
 );
 assert.deepEqual(
   findUnavailableDateInRange('10/29/2026', '10/31/2026', unavailableDates),
   unavailableDates[0]
 );
 assert.equal(findUnavailableDateInRange('10/29/2026', '10/29/2026', unavailableDates), null);
});

test('ignores malformed and reversed date ranges', () => {
 assert.equal(findUnavailableDateInRange('10/31/2026', '10/29/2026', []), null);
 assert.equal(findUnavailableDateInRange('invalid', '10/29/2026', []), null);
});

test('returns every unavailable date in a range so only those days can be skipped', () => {
  const unavailableDates = [
    { id: '2026-11-06', date: '2026-11-06', remark: 'Maintenance' },
    { id: '2026-11-07', date: '2026-11-07', remark: 'Maintenance' }
  ];

 assert.deepEqual(
   getUnavailableDatesInRange('11/01/2026', '11/10/2026', unavailableDates),
   unavailableDates
 );
 assert.deepEqual(
   getUnavailableDatesInRange('11/01/2026', '11/05/2026', unavailableDates),
   []
 );
 assert.deepEqual(
   getAvailableDatesInRange('11/01/2026', '11/10/2026', unavailableDates),
   [
     '2026-11-01',
     '2026-11-02',
     '2026-11-03',
     '2026-11-04',
     '2026-11-05',
     '2026-11-08',
     '2026-11-09',
     '2026-11-10'
   ]
 );
});
