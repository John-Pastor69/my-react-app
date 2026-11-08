import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNextApprovalStep,
  isReservationAssignedToEndorser
} from './approvalWorkflow.js';

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

test('returns only the first active approval step for a new reservation', () => {
  assert.equal(getNextApprovalStep({
    userRole: 'requestor',
    endorserName: 'Alex Smith',
    endorserEmail: 'alex@example.com',
    specificRoom: 'Room 101'
  }).key, 'endorser');
});

test('advances to the next role only after the previous step is approved', () => {
  const reservation = {
    userRole: 'requestor',
    endorserName: 'Alex Smith',
    endorserEmail: 'alex@example.com',
    specificRoom: 'Room 101',
    approvals: { endorser: { status: 'approved' } }
  };

  assert.equal(getNextApprovalStep(reservation).key, 'room checker');
  assert.equal(getNextApprovalStep({
    ...reservation,
    approvals: { endorser: { status: 'pending' } }
  }).key, 'endorser');
});

test('skips the endorser step for staff requestors', () => {
  assert.equal(getNextApprovalStep({
    userRole: 'faculty',
    endorserName: 'Alex Smith',
    endorserEmail: 'alex@example.com',
    specificRoom: 'Room 101'
  }).key, 'room checker');
});

test('skips the endorser step when no endorser is assigned', () => {
  assert.equal(getNextApprovalStep({
    userRole: 'requestor',
    specificRoom: ''
  }).key, 'osa');
});
