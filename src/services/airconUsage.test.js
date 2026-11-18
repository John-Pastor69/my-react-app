import assert from 'node:assert/strict';
import test from 'node:test';
import { getAirconUsage } from './airconUsage.js';
import { getSpecificRoomKey } from './reservationConflicts.js';

const facilityData = [{ id: 'gym', name: 'Gymnasium' }, { id: 'dance', name: 'Dance Studio' }];
const day = (date, aircon, startTime = '07:00 AM', endTime = '10:00 AM') => ({
  date, startTime, endTime, aircon,
  airconOnTime: aircon ? startTime : '',
  airconOffTime: aircon ? endTime : ''
});

test('counts aircon-hours per facility, day by day, only where aircon is on', () => {
  const usage = getAirconUsage([
    {
      id: 'a',
      status: 'Approved',
      facilities: ['gym', 'dance'],
      facilitySchedules: {
        gym: [day('2026-11-16', true), day('2026-11-17', false)],
        dance: [day('2026-11-16', true, '01:00 PM', '02:00 PM')]
      }
    },
    { id: 'b', status: 'Pending', facilities: ['gym'], facilitySchedules: { gym: [day('2026-11-16', true)] } }
  ], { startDate: '2026-11-16', endDate: '2026-11-22', facilityData });

  // Gymnasium 3 h (aircon off on the 17th), Dance Studio 1 h; the pending reservation is not counted.
  assert.equal(usage.totalHours, 4);
  assert.deepEqual(usage.items.map((item) => [item.name, item.hours, item.reservations]), [
    ['Gymnasium', 3, 1],
    ['Dance Studio', 1, 1]
  ]);
});

test('follows the date range, start-time and status filters', () => {
  const reservations = [{
    id: 'a',
    status: 'Approved',
    facilities: ['gym'],
    facilitySchedules: {
      gym: [day('2026-11-10', true), day('2026-11-16', true), day('2026-11-17', true, '01:00 PM', '03:00 PM')]
    }
  }];
  const options = { facilityData, startDate: '2026-11-16', endDate: '2026-11-22' };

  assert.equal(getAirconUsage(reservations, options).totalHours, 5);
  assert.equal(getAirconUsage(reservations, { ...options, startMinutes: 12 * 60 }).totalHours, 2);
  assert.equal(getAirconUsage(reservations, { ...options, status: 'pending' }).totalHours, 0);
});

test('room-only bookings count their room, merging rooms by number', () => {
  const usage = getAirconUsage([
    { id: 'a', status: 'Approved', specificRoom: 'Room 401', schedule: [day('2026-11-16', true)] },
    { id: 'b', status: 'Approved', specificRoom: 'rm. 401', schedule: [day('2026-11-17', true)] }
  ], { startDate: '2026-11-16', endDate: '2026-11-22', getRoomKey: getSpecificRoomKey });

  assert.deepEqual(usage.items.map((item) => [item.name, item.hours, item.reservations]), [['Room 401', 6, 2]]);
});
