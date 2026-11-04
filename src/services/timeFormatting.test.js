import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTimeForDisplay, formatTimeRange } from './timeFormatting.js';

test('formats 24-hour times as 12-hour AM/PM values', () => {
  assert.equal(formatTimeForDisplay('07:00'), '7:00 AM');
  assert.equal(formatTimeForDisplay('12:00'), '12:00 PM');
  assert.equal(formatTimeForDisplay('13:30'), '1:30 PM');
  assert.equal(formatTimeForDisplay('22:00'), '10:00 PM');
});

test('normalizes existing AM/PM values and preserves unrecognized input', () => {
  assert.equal(formatTimeForDisplay('07:00 am'), '7:00 AM');
  assert.equal(formatTimeForDisplay('12:00 AM'), '12:00 AM');
  assert.equal(formatTimeForDisplay('N/A'), 'N/A');
  assert.equal(formatTimeForDisplay(''), '');
  assert.equal(formatTimeForDisplay('not a time'), 'not a time');
});

test('formats time ranges for display', () => {
  assert.equal(formatTimeRange('07:00', '22:00'), '7:00 AM – 10:00 PM');
});
