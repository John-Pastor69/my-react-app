import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSpecificRoomReservedHours,
  getLiveSpecificRoomOccupancy
} from './roomCheckerDashboard.js';

test('ranks only approved specific-room reserved hours by schedule dates', () => {
  const reservations = [
    {
      id: 'classroom-one',
      status: 'approved',
      facilities: ['classroom-a'],
      schedule: [
        { date: '2026-11-12', startTime: '09:00 AM', endTime: '11:00 AM' },
        { date: '2026-11-13', startTime: '09:00 AM', endTime: '10:00 AM' }
      ],
      facilitySchedules: {
        'classroom-a': [
          { date: '2026-11-12', startTime: '09:00 AM', endTime: '11:00 AM' },
          { date: '2026-11-13', startTime: '09:00 AM', endTime: '10:00 AM' }
        ]
      }
    },
    {
      id: 'named-room',
      status: 'Approved',
      specificRoom: 'Room 301',
      schedule: [{ date: '2026-11-12', startTime: '10:00 AM', endTime: '12:00 PM' }]
    },
    {
      id: 'pending-room',
      status: 'Pending',
      specificRoom: 'Room 301',
      schedule: [{ date: '2026-11-12', startTime: '09:00 AM', endTime: '01:00 PM' }]
    }
  ];

  assert.deepEqual(
    getSpecificRoomReservedHours(reservations, {
      startDate: '2026-11-12',
      endDate: '2026-11-12'
    }),
    [
      { id: 'specific-room-room301', name: 'Room 301', hours: 2 }
    ]
  );
});

test('applies scheduled start-time filters and supports overnight time ranges', () => {
  const reservations = [{
    status: 'approved',
    specificRoom: 'IT Lab 3',
    schedule: [
      { date: '2026-11-12', startTime: '08:00 AM', endTime: '09:00 AM' },
      { date: '2026-11-12', startTime: '11:00 PM', endTime: '11:30 PM' }
    ]
  }];

  assert.deepEqual(
    getSpecificRoomReservedHours(reservations, {
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      startMinutes: 22 * 60,
      endMinutes: 2 * 60
    }),
    [{ id: 'specific-room-itlab3', name: 'IT Lab 3', hours: 0.5 }]
  );
});

test('shows specific-room requests that match the selected date range', () => {
  const reservations = [
    {
      id: 'in-use',
      status: 'approved',
      specificRoom: 'Room 301',
      eventName: 'Lecture',
      schedule: [{
        date: '2026-11-12',
        startTime: '09:00 AM',
        endTime: '11:00 AM',
        aircon: true
      }]
    },
    {
      id: 'upcoming',
      status: 'approved',
      specificRoom: 'IT Lab 3',
      schedule: [{
        date: '2026-11-12',
        startTime: '02:00 PM',
        endTime: '03:00 PM',
        aircon: false
      }]
    },
    {
      id: 'pending',
      status: 'pending',
      specificRoom: 'Room 201',
      schedule: [{
        date: '2026-11-12',
        startTime: '09:30 AM',
        endTime: '10:30 AM'
      }]
    },
    {
      id: 'another-date',
      status: 'approved',
      specificRoom: 'Room 402',
      schedule: [{
        date: '2026-11-13',
        startTime: '09:00 AM',
        endTime: '10:00 AM'
      }]
    }
  ];

  assert.deepEqual(
    getLiveSpecificRoomOccupancy(reservations, {
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      today: '2026-11-12',
      nowMinutes: 10 * 60
    }),
    [
      {
        id: 'room301',
        name: 'Room 301',
        state: 'In use',
        aircon: true,
        reservationId: 'in-use',
        eventName: 'Lecture',
        requestor: 'Unknown requestor',
        status: 'approved',
        date: '2026-11-12',
        startTime: '09:00 AM',
        endTime: '11:00 AM',
        start: 540,
        end: 660
      },
      {
        id: 'room201',
        name: 'Room 201',
        state: 'Pending approval',
        aircon: false,
        reservationId: 'pending',
        eventName: 'Untitled reservation',
        requestor: 'Unknown requestor',
        status: 'pending',
        date: '2026-11-12',
        startTime: '09:30 AM',
        endTime: '10:30 AM',
        start: 570,
        end: 630
      },
      {
        id: 'itlab3',
        name: 'IT Lab 3',
        state: 'Upcoming',
        aircon: false,
        reservationId: 'upcoming',
        eventName: 'Untitled reservation',
        requestor: 'Unknown requestor',
        status: 'approved',
        date: '2026-11-12',
        startTime: '02:00 PM',
        endTime: '03:00 PM',
        start: 840,
        end: 900
      }
    ]
  );

  assert.deepEqual(
    getLiveSpecificRoomOccupancy(reservations, {
      startDate: '2026-11-13',
      endDate: '2026-11-13',
      today: '2026-11-12',
      nowMinutes: 10 * 60
    }),
    [{
      id: 'room402',
      name: 'Room 402',
      state: 'Upcoming',
      aircon: false,
      reservationId: 'another-date',
      eventName: 'Untitled reservation',
      requestor: 'Unknown requestor',
      status: 'approved',
      date: '2026-11-13',
      startTime: '09:00 AM',
      endTime: '10:00 AM',
      start: 540,
      end: 600
    }]
  );
});
