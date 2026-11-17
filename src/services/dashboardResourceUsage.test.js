import assert from 'node:assert/strict';
import test from 'node:test';
import { getDepartmentalResourceConsumption, getEquipmentReservedHours, getFacilityConsumptionByGroup } from './dashboardResourceUsage.js';

test('ranks approved equipment by scheduled hours times quantity, including other equipment', () => {
  const reservations = [
    {
      status: 'Approved',
      schedule: [{ date: '2026-11-12', startTime: '09:00 AM', endTime: '10:30 AM' }],
      selectedEquip: { projector: 2 },
      otherEquipment: 'Portable speaker',
      otherEquipmentUnits: 3
    },
    {
      status: 'approved',
      schedule: [{ date: '2026-11-13', startTime: '10:00', endTime: '12:00' }],
      selectedEquip: { projector: 1 }
    },
    {
      status: 'pending',
      schedule: [{ date: '2026-11-14', startTime: '09:00', endTime: '12:00' }],
      selectedEquip: { projector: 4 },
      otherEquipment: 'Portable speaker',
      otherEquipmentUnits: 4
    }
  ];

  assert.deepEqual(
    getEquipmentReservedHours(reservations, [{ id: 'projector', name: 'Projector' }]),
    [
      {
        id: 'projector',
        name: 'Projector',
        hours: 5,
        sessions: [
          {
            date: '2026-11-12',
            startTime: '09:00 AM',
            endTime: '10:30 AM',
            quantity: 2,
            durationHours: 1.5,
            hours: 3
          },
          {
            date: '2026-11-13',
            startTime: '10:00',
            endTime: '12:00',
            quantity: 1,
            durationHours: 2,
            hours: 2
          }
        ],
        isOtherRequest: false
      },
      {
        id: 'other-portable speaker',
        name: 'Portable speaker',
        hours: 4.5,
        sessions: [{
          date: '2026-11-12',
          startTime: '09:00 AM',
          endTime: '10:30 AM',
          quantity: 3,
          durationHours: 1.5,
          hours: 4.5
        }],
        isOtherRequest: true
      }
    ]
  );
});

test('requestor groups list the equipment their units came from', () => {
  const osa = { requestorInfo: { signupDropdown: { label: 'Department / Office', value: 'OSA' } } };
  const groups = getDepartmentalResourceConsumption([
    { ...osa, status: 'Approved', selectedEquip: { mic: 6, sound: 5 } },
    { ...osa, status: 'Approved', selectedEquip: { mic: 2 }, otherEquipment: 'Extension cord', otherEquipmentUnits: 3 },
    { ...osa, status: 'Pending', selectedEquip: { sound: 9 } }
  ], [{ id: 'mic', name: 'Microphone' }, { id: 'sound', name: 'Sound System' }]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].units, 16);
  assert.deepEqual(groups[0].items, [
    { name: 'Microphone', units: 8, isOtherRequest: false },
    { name: 'Sound System', units: 5, isOtherRequest: false },
    { name: 'Extension cord', units: 3, isOtherRequest: true }
  ]);
});

test('counts facility and room reservations per requestor group, merging rooms by number', async () => {
  const { getSpecificRoomKey } = await import('./reservationConflicts.js');
  const bsit = { requestorInfo: { signupDropdown: { label: 'Courses / Program', value: 'BSIT' } } };
  const osa = { requestorInfo: { signupDropdown: { label: 'Department / Office', value: 'OSA' } } };
  const groups = getFacilityConsumptionByGroup([
    { ...bsit, status: 'Approved', facilities: ['gym'], specificRoom: 'Room 401' },
    { ...bsit, status: 'Approved', specificRoom: 'rm. 401' },
    { ...bsit, status: 'Approved', facilities: ['gym', 'gym'] },
    { ...osa, status: 'Approved', facilities: ['dance'] },
    { ...osa, status: 'Pending', facilities: ['dance'] },
    { ...osa, status: 'Approved', selectedEquip: { mic: 2 } }
  ], [{ id: 'gym', name: 'Gymnasium' }, { id: 'dance', name: 'Dance Studio' }], getSpecificRoomKey);

  // Department accounts (OSA) are left out; only programs/courses are counted.
  assert.deepEqual(groups.map((group) => [group.name, group.units]), [
    ['Courses / Program: BSIT', 3]
  ]);
  assert.deepEqual(groups[0].items.map((item) => [item.name, item.units]), [
    ['Gymnasium', 2],
    ['Room 401', 2]
  ]);
});
