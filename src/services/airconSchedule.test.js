import assert from 'node:assert/strict';
import test from 'node:test';
import { getAirconScheduleDetails, getAirconScheduleSummary } from './airconSchedule.js';

test('summarizes enabled aircon schedules by facility and date', () => {
  const summary = getAirconScheduleSummary({
    aircon: true,
    facilitySchedules: {
      hall: [
        {
          date: '2026-11-08',
          startTime: '09:00 AM',
          endTime: '12:00 PM',
          aircon: true
        },
        {
          date: '2026-11-09',
          startTime: '09:00 AM',
          endTime: '12:00 PM',
          aircon: false
        }
      ],
      lab: [{
        date: '2026-11-08',
        startTime: '01:00 PM',
        endTime: '03:00 PM',
        aircon: true
      }]
    }
  }, {
    hall: { name: 'Main Hall' },
    lab: { name: 'Computer Lab' }
  });

  assert.equal(
    summary,
    'ON — Main Hall: Nov 8, 2026 (9:00 AM – 12:00 PM); Computer Lab: Nov 8, 2026 (1:00 PM – 3:00 PM)'
  );
});

test('omits dates with aircon disabled from a daily aircon schedule', () => {
  assert.equal(getAirconScheduleSummary({
    schedule: [
      { date: '2026-11-08', startTime: '09:00 AM', endTime: '12:00 PM', aircon: true },
      { date: '2026-11-09', startTime: '09:00 AM', endTime: '12:00 PM', aircon: false }
    ]
  }), 'ON — Nov 8, 2026 (9:00 AM – 12:00 PM)');
});

test('returns facility-grouped aircon details for readable views and exports', () => {
  assert.deepEqual(getAirconScheduleDetails({
    facilitySchedules: {
      hall: [
        { date: '2026-11-08', startTime: '09:00 AM', endTime: '12:00 PM', aircon: true },
        { date: '2026-11-09', startTime: '09:00 AM', endTime: '12:00 PM', aircon: false }
      ]
    }
  }, {
    hall: { name: 'Main Hall' }
  }), {
    enabled: true,
    groups: [{
      name: 'Main Hall',
      entries: [
        { date: 'Nov 8, 2026', time: '9:00 AM – 12:00 PM', enabled: true }
      ]
    }]
  });
});

test('summarizes a reservation with all per-date aircon disabled as off', () => {
  assert.equal(getAirconScheduleSummary({
    aircon: true,
    schedule: [{ date: '2026-11-08', startTime: '09:00 AM', endTime: '12:00 PM', aircon: false }]
  }), 'OFF');
});

test('preserves legacy aircon summaries for existing reservations', () => {
  assert.equal(getAirconScheduleSummary({
    aircon: true,
    airconOnTime: '09:00 AM',
    airconOffTime: '12:00 PM'
  }), 'ON (9:00 AM – 12:00 PM)');
});
