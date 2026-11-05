import assert from 'node:assert/strict';
import test from 'node:test';
import { isReservationAssignedToEndorser } from './approvalWorkflow.js';

test('matches an assigned endorser by email despite display-name differences', () => {
  assert.equal(isReservationAssignedToEndorser(
    { endorserName: 'Alex Smith', endorserEmail: 'alex@example.com' },
    { name: 'Alexander Smith', email: ' ALEX@example.com ' }
  ), true);
});

test('uses formatted names for reservations without an endorser email', () => {
  assert.equal(isReservationAssignedToEndorser(
    { endorserName: 'Smith, Alex (Student)' },
    { name: 'Alex Smith' }
  ), true);
});

test('does not fall back to a matching name when both emails are present but differ', () => {
  assert.equal(isReservationAssignedToEndorser(
    { endorserName: 'Alex Smith', endorserEmail: 'other@example.com' },
    { name: 'Alex Smith', email: 'alex@example.com' }
  ), false);
});
