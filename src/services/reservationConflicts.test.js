import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findFacilityConflict,
  getActiveFacilityReservations,
  getOverlappingFacilityReservations
} from './reservationConflicts.js';

const facility = { id: 'room-a', name: 'Room A', capacity: 100 };

const reservation = (id, overrides = {}) => ({
  id,
  status: 'Approved',
  facilities: ['room-a'],
  expectedParticipants: 20,
  ...overrides
});

const request = (schedule, expectedParticipants = 20) => ({
  schedule,
  facilities: ['room-a'],
  expectedParticipants
});

test('daily schedule overrides only conflict on an overlapping date and time', () => {
  const existing = reservation('existing', {
    schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }]
  });

  assert.equal(findFacilityConflict(
    [existing],
    request([{ date: '2026-10-03', startTime: '10:00', endTime: '12:00' }]),
    [facility]
  ), null);

  const conflict = findFacilityConflict(
    [existing],
    request([{ date: '2026-10-03', startTime: '09:00', endTime: '11:00' }]),
    [{ id: 'room-a', name: 'Room A' }]
  );
  assert.equal(conflict.conflictType, 'schedule');
  assert.equal(conflict.conflictDate, '2026-10-03');
});

test('facility capacity counts active reservations across all dates and times', () => {
  const reservations = [
    reservation('day-one', {
      expectedParticipants: 50,
      schedule: [{ date: '2026-10-01', startTime: '07:00', endTime: '11:00' }]
    }),
    reservation('day-two', {
      expectedParticipants: 60,
      schedule: [{ date: '2026-10-02', startTime: '07:00', endTime: '11:00' }]
    })
  ];
  const requestSchedule = [
    { date: '2026-10-05', startTime: '08:00', endTime: '10:00' }
  ];

  assert.equal(findFacilityConflict(
    reservations,
    request(requestSchedule, 40),
    [{ ...facility, capacity: 200 }]
  ), null);

  const conflict = findFacilityConflict(
    reservations,
    request(requestSchedule, 91),
    [{ ...facility, capacity: 200 }]
  );
  assert.equal(conflict.conflictType, 'capacity');
  assert.equal(conflict.occupiedCapacity, 110);
});

test('facility availability counts reservations even when that facility is not selected in the form', () => {
  const existing = reservation('existing', { expectedParticipants: 150 });

  assert.equal(getActiveFacilityReservations(
    [existing],
    { facilities: [] },
    'room-a'
  ).length, 1);
});

test('facilities without capacity reject overlapping schedule slots', () => {
  const existing = reservation('existing', {
    schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }]
  });

  assert.equal(findFacilityConflict(
    [existing],
    request([{ date: '2026-10-04', startTime: '09:00', endTime: '11:00' }], 5000),
    [{ id: 'room-a', name: 'Room A' }]
  ), null);

  const conflict = findFacilityConflict(
    [existing],
    request([{ date: '2026-10-03', startTime: '09:00', endTime: '11:00' }], 5000),
    [{ id: 'room-a', name: 'Room A' }]
  );
  assert.equal(conflict.conflictType, 'schedule');
});

test('legacy date-range reservations remain compatible with daily schedules', () => {
  const legacy = reservation('legacy', {
    eventDate: '10/01/2026',
    endDate: '10/03/2026',
    startTime: '07:00 AM',
    endTime: '11:00 AM'
  });
  const overlaps = getOverlappingFacilityReservations(
    [legacy],
    request([{ date: '2026-10-02', startTime: '08:00', endTime: '09:00' }]),
    'room-a'
  );

  assert.equal(overlaps.length, 1);
  assert.equal(findFacilityConflict(
    [legacy],
    request([{ date: '2026-10-02', startTime: '08:00', endTime: '09:00' }]),
    [{ id: 'room-a', name: 'Room A' }]
  )?.conflictType, 'schedule');
});

test('archived reservations release their facility capacity', () => {
  const existing = reservation('existing', {
    expectedParticipants: 100,
    status: 'Archived',
    schedule: [{ date: '2026-10-03', startTime: '13:00', endTime: '15:00' }]
  });

  assert.equal(findFacilityConflict(
    [existing],
    request([{ date: '2026-10-04', startTime: '09:00', endTime: '11:00' }]),
    [facility]
  ), null);
  assert.equal(getActiveFacilityReservations(
    [existing],
    request([{ date: '2026-10-04', startTime: '09:00', endTime: '11:00' }]),
    'room-a'
  ).length, 0);
});

test('facility capacity is enforced even when reservation schedules do not overlap', () => {
  const existing = reservation('existing', {
    expectedParticipants: 99,
    schedule: [{ date: '2026-10-03', startTime: '13:00', endTime: '15:00' }]
  });

  const conflict = findFacilityConflict(
    [existing],
    request([{ date: '2026-10-03', startTime: '09:00', endTime: '11:00' }]),
    [facility]
  );
  assert.equal(conflict.conflictType, 'capacity');
  assert.equal(conflict.occupiedCapacity, 99);
});

test('facility capacity uses per-facility participant counts when available', () => {
  const existing = reservation('existing', {
    facilities: ['room-a', 'room-b'],
    expectedParticipants: 80,
    facilityParticipants: { 'room-a': 30, 'room-b': 50 },
    schedule: [{ date: '2026-10-03', startTime: '13:00', endTime: '15:00' }]
  });
  const selectedRequest = {
    ...request([{ date: '2026-10-04', startTime: '09:00', endTime: '11:00' }], 20),
    facilityParticipants: { 'room-a': 15 }
  };

  assert.equal(findFacilityConflict(
    [existing],
    selectedRequest,
    [{ ...facility, capacity: 50 }]
  ), null);

  const conflict = findFacilityConflict(
    [existing],
    { ...selectedRequest, facilityParticipants: { 'room-a': 21 } },
    [{ ...facility, capacity: 50 }]
  );
  assert.equal(conflict.conflictType, 'capacity');
  assert.equal(conflict.occupiedCapacity, 30);
  assert.equal(conflict.requestedCapacity, 21);
});
