import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReservationTime } from './reservationTime.js';

test('parses valid 12-hour and 24-hour reservation times', () => {
  assert.deepEqual(parseReservationTime('12:30 AM'), { hours: 0, minutes: 30 });
  assert.deepEqual(parseReservationTime('12:30 PM'), { hours: 12, minutes: 30 });
  assert.deepEqual(parseReservationTime('23:59'), { hours: 23, minutes: 59 });
});

test('rejects invalid reservation times instead of treating them as midnight', () => {
  assert.equal(parseReservationTime('00:30 AM'), null);
  assert.equal(parseReservationTime('13:30 PM'), null);
  assert.equal(parseReservationTime('12:60 PM'), null);
});
