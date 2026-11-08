const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getExpiredReservationType,
  parseReservationDate,
  parseReservationTime
} = require('./cleanup.cjs');

test('parses supported reservation date formats strictly', () => {
  assert.equal(parseReservationDate('2026-11-08').getDate(), 8);
  assert.equal(parseReservationDate('11/08/2026').getMonth(), 10);
  assert.equal(parseReservationDate('2026-02-30'), null);
});

test('parses AM/PM and 24-hour reservation times', () => {
  assert.deepEqual(parseReservationTime('12:30 AM'), { hours: 0, minutes: 30 });
  assert.deepEqual(parseReservationTime('13:45'), { hours: 13, minutes: 45 });
  assert.equal(parseReservationTime('13:45 PM'), null);
});

test('archives approved reservations only after their scheduled end', () => {
  const reservation = {
    status: 'Approved',
    eventDate: '11/08/2026',
    schedule: [{ date: '11/08/2026', startTime: '9:00 AM', endTime: '10:00 AM' }]
  };

  assert.equal(getExpiredReservationType(reservation, new Date(2026, 10, 8, 9, 59)), null);
  assert.equal(getExpiredReservationType(reservation, new Date(2026, 10, 8, 10, 1)), 'approved');
});

test('expires pending reservations at their scheduled start', () => {
  const reservation = {
    status: 'Pending',
    eventDate: '11/08/2026',
    schedule: [{ date: '11/08/2026', startTime: '9:00 AM', endTime: '10:00 AM' }]
  };

  assert.equal(getExpiredReservationType(reservation, new Date(2026, 10, 8, 8, 59)), null);
  assert.equal(getExpiredReservationType(reservation, new Date(2026, 10, 8, 9, 1)), 'pending');
});

test('uses explicit end dates and ignores statuses outside the expiration workflow', () => {
  const reservation = {
    status: 'approved',
    eventDate: '11/08/2026',
    endDate: '11/10/2026',
    endTime: '10:00 AM'
  };

  assert.equal(getExpiredReservationType(reservation, new Date(2026, 10, 9, 12)), null);
  assert.equal(getExpiredReservationType({ ...reservation, status: 'rejected' }, new Date(2026, 10, 11)), null);
});
