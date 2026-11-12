import assert from 'node:assert/strict';
import test from 'node:test';
import { getDepartmentalResourceConsumption } from './dashboardResourceUsage.js';

test('groups approved equipment units by requestor signup dropdown and excludes pending requests', () => {
  const reservations = [
    {
      status: 'Approved',
      requestorInfo: {
        signupDropdown: { label: 'Department / Office', value: 'Engineering' }
      },
      selectedEquip: { projector: 2 },
      otherEquipment: 'Portable speaker',
      otherEquipmentUnits: 1
    },
    {
      status: 'approved',
      requestorInfo: {
        signupDropdown: { label: 'Department / Office', value: 'Engineering' }
      },
      selectedEquip: { projector: 3 }
    },
    {
      status: 'pending',
      requestorInfo: {
        signupDropdown: { label: 'Department / Office', value: 'Engineering' }
      },
      selectedEquip: { projector: 10 }
    }
  ];

  assert.deepEqual(
    getDepartmentalResourceConsumption(reservations),
    [{ id: 'department / office: engineering', name: 'Department / Office: Engineering', units: 6 }]
  );
});

test('reads nested requestor signup dropdown arrays by their saved label and value', () => {
  const reservations = [{
    status: 'approved',
    requestorInfo: [{
      signupDropdown: [
        { label: 'Department / Office', value: 'ICT' },
        { label: 'Course / Program', value: 'BSIT' }
      ]
    }],
    selectedEquip: { projector: 2 }
  }];

  assert.deepEqual(
    getDepartmentalResourceConsumption(reservations),
    [{ id: 'department / office: ict', name: 'Department / Office: ICT', units: 2 }]
  );
});
