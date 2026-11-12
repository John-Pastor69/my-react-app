import assert from 'node:assert/strict';
import test from 'node:test';
import { getEquipmentReservedHours } from './dashboardResourceUsage.js';

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
