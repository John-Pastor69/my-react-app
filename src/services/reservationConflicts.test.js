import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findFacilityConflict,
  getActiveFacilityReservations,
  getFacilityCapacityAvailability,
  getOverlappingFacilityReservations,
  getReservationDateRange,
  getReservationScheduleForFacility,
  reservationDateRangesOverlap
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

test('equipment reservation ranges only overlap when selected dates intersect', () => {
  const existing = getReservationDateRange({
    eventDate: '11/12/2026',
    endDate: '11/13/2026'
  });
  const sameDate = getReservationDateRange({ eventDate: '2026-11-13', days: 1 });
  const differentDate = getReservationDateRange({ eventDate: '11/14/2026', days: 1 });

  assert.equal(reservationDateRangesOverlap(existing, sameDate), true);
  assert.equal(reservationDateRangesOverlap(existing, differentDate), false);
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

test('facility capacity counts only reservations overlapping the selected time', () => {
  const reservations = [
    reservation('day-one', {
      expectedParticipants: 50,
      schedule: [{ date: '2026-10-05', startTime: '08:00', endTime: '10:00' }]
    }),
    reservation('day-two', {
      expectedParticipants: 60,
      schedule: [{ date: '2026-10-05', startTime: '10:00', endTime: '12:00' }]
    })
  ];
  const requestSchedule = [
    { date: '2026-10-05', startTime: '08:30', endTime: '09:30' }
  ];

  assert.equal(findFacilityConflict(
    reservations,
    request(requestSchedule, 40),
    [{ ...facility, capacity: 100 }]
  ), null);

  const conflict = findFacilityConflict(
    reservations,
    request(requestSchedule, 51),
    [{ ...facility, capacity: 100 }]
  );
  assert.equal(conflict.conflictType, 'capacity');
  assert.equal(conflict.occupiedCapacity, 50);
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

test('facility capacity allows a separate time slot even when other bookings used full capacity', () => {
  const existing = reservation('existing', {
    expectedParticipants: 99,
    schedule: [{ date: '2026-10-03', startTime: '13:00', endTime: '15:00' }]
  });

  const conflict = findFacilityConflict(
    [existing],
    request([{ date: '2026-10-03', startTime: '09:00', endTime: '11:00' }]),
    [facility]
  );
  assert.equal(conflict, null);
});

test('exclusive scheduling blocks overlapping reservations even when configured capacity remains', () => {
  const existing = reservation('existing', {
    expectedParticipants: 20,
    schedule: [{ date: '2026-10-03', startTime: '09:00', endTime: '11:00' }]
  });
  const selectedRequest = request([
    { date: '2026-10-03', startTime: '10:00', endTime: '12:00' }
  ], 20);
  const exclusiveFacility = { ...facility, capacity: 100, exclusiveScheduling: true };

  const conflict = findFacilityConflict([existing], selectedRequest, [exclusiveFacility]);
  assert.equal(conflict.conflictType, 'schedule');
  assert.equal(conflict.conflictFacilityName, 'Room A');
  assert.equal(findFacilityConflict(
    [existing],
    request([{ date: '2026-10-03', startTime: '11:00', endTime: '12:00' }], 20),
    [exclusiveFacility]
  ), null);
});

test('facility capacity uses per-facility participant counts when available', () => {
  const existing = reservation('existing', {
    facilities: ['room-a', 'room-b'],
    expectedParticipants: 80,
    facilityParticipants: { 'room-a': 30, 'room-b': 50 },
    schedule: [{ date: '2026-10-03', startTime: '09:00', endTime: '11:00' }]
  });
  const selectedRequest = {
    ...request([{ date: '2026-10-03', startTime: '09:30', endTime: '10:30' }], 20),
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

test('facility conflicts use each facility schedule instead of the legacy combined schedule', () => {
  const existing = reservation('existing', {
    facilities: ['room-a', 'room-b'],
    schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }],
    facilitySchedules: {
      'room-a': [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }],
      'room-b': [{ date: '2026-10-03', startTime: '14:00', endTime: '16:00' }]
    }
  });
  const selectedRequest = {
    facilities: ['room-a', 'room-b'],
    schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }],
    facilitySchedules: {
      'room-a': [{ date: '2026-10-03', startTime: '10:00', endTime: '12:00' }],
      'room-b': [{ date: '2026-10-03', startTime: '15:00', endTime: '17:00' }]
    }
  };

  const conflict = findFacilityConflict(
    [existing],
    selectedRequest,
    [{ id: 'room-a', name: 'Room A' }, { id: 'room-b', name: 'Room B' }]
  );
  assert.equal(conflict.conflictType, 'schedule');
  assert.equal(conflict.conflictFacilityName, 'Room B');
  assert.equal(conflict.conflictStartTime, '14:00');
});

test('facility schedule lookup prefers facility-specific entries and falls back to legacy schedule', () => {
  const reservationWithSchedules = reservation('existing', {
    schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }],
    facilitySchedules: {
      'room-a': [{ date: '2026-10-03', startTime: '13:00', endTime: '15:00' }],
      'room-b': []
    }
  });

  assert.deepEqual(getReservationScheduleForFacility(reservationWithSchedules, 'room-a'), [
    { date: '2026-10-03', startTime: '13:00', endTime: '15:00' }
  ]);
  assert.deepEqual(getReservationScheduleForFacility(reservationWithSchedules, 'room-b'), []);
  assert.deepEqual(getReservationScheduleForFacility(reservationWithSchedules, 'room-c'), [
    { date: '2026-10-03', startTime: '08:00', endTime: '10:00' }
  ]);
});

test('overnight schedules are invalid instead of extending past facility hours', () => {
  const overnight = reservation('overnight', {
    schedule: [{ date: '2026-10-03', startTime: '07:10', endTime: '07:00' }]
  });

  assert.deepEqual(getReservationScheduleForFacility(overnight, 'room-a'), []);
  assert.equal(findFacilityConflict(
    [overnight],
    request([{ date: '2026-10-03', startTime: '07:00', endTime: '08:00' }]),
    [facility]
  ), null);
});

test('capacity availability uses the peak overlapping participants across selected schedule entries', () => {
  const reservations = [
    reservation('morning', {
      expectedParticipants: 60,
      schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }]
    }),
    reservation('afternoon', {
      expectedParticipants: 70,
      schedule: [{ date: '2026-10-03', startTime: '13:00', endTime: '15:00' }]
    })
  ];
  const selectedRequest = request([
    { date: '2026-10-03', startTime: '09:00', endTime: '09:30' },
    { date: '2026-10-03', startTime: '13:30', endTime: '14:00' }
  ], 30);

  assert.deepEqual(
    getFacilityCapacityAvailability(reservations, selectedRequest, facility),
    {
      maxCapacity: 100,
      scheduleAvailable: true,
      occupiedCapacity: 70,
      availableCapacity: 30,
      hasUnknownCapacity: false
    }
  );
  assert.equal(findFacilityConflict(reservations, selectedRequest, [facility]), null);
});

test('capacity availability counts concurrent usage rather than every booking overlapping a long schedule', () => {
  const reservations = [
    reservation('morning', {
      expectedParticipants: 60,
      schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '09:00' }]
    }),
    reservation('afternoon', {
      expectedParticipants: 60,
      schedule: [{ date: '2026-10-03', startTime: '16:00', endTime: '17:00' }]
    })
  ];
  const selectedRequest = request([
    { date: '2026-10-03', startTime: '08:00', endTime: '17:00' }
  ], 40);

  assert.equal(
    getFacilityCapacityAvailability(reservations, selectedRequest, facility).availableCapacity,
    40
  );
  assert.equal(findFacilityConflict(reservations, selectedRequest, [facility]), null);
});

test('capacity availability requests a schedule before reporting remaining capacity', () => {
  assert.deepEqual(
    getFacilityCapacityAvailability([], request([]), facility),
    {
      maxCapacity: 100,
      scheduleAvailable: false,
      occupiedCapacity: 0,
      availableCapacity: null,
      hasUnknownCapacity: false
    }
  );
});

test('reservations with unknown participant counts only prevent availability when their schedule overlaps', () => {
  const existing = reservation('existing', {
    expectedParticipants: 0,
    schedule: [{ date: '2026-10-03', startTime: '08:00', endTime: '10:00' }]
  });
  const selectedRequest = request([
    { date: '2026-10-03', startTime: '13:00', endTime: '15:00' }
  ]);

  assert.equal(
    getFacilityCapacityAvailability([existing], selectedRequest, facility).availableCapacity,
    100
  );
  assert.equal(findFacilityConflict([existing], selectedRequest, [facility]), null);

  const overlappingRequest = request([
    { date: '2026-10-03', startTime: '09:00', endTime: '11:00' }
  ]);
  assert.equal(
    getFacilityCapacityAvailability([existing], overlappingRequest, facility).hasUnknownCapacity,
    true
  );
  assert.equal(
    findFacilityConflict([existing], overlappingRequest, [facility]).conflictType,
    'unknown-capacity'
  );
});
