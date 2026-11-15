import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportBuildingAdminDashboardPdf } from './buildingAdminDashboardPdf.js';
import { exportMisDashboardPdf } from './misDashboardPdf.js';
import { exportRoomCheckerDashboardPdf } from './roomCheckerDashboardPdf.js';

const createPdfOutput = (exportReport, report) => {
  const originalWorkingDirectory = process.cwd();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'dashboard-pdf-structure-'));
  try {
    process.chdir(temporaryDirectory);
    return exportReport(report).output();
  } finally {
    process.chdir(originalWorkingDirectory);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

const assertPdfSectionOrder = (pdf, orderedHeadings) => {
  const positions = orderedHeadings.map((heading) => pdf.indexOf(heading));
  assert.ok(
    positions.every((position) => position >= 0),
    `expected all report sections to be rendered: ${orderedHeadings
      .filter((_, index) => positions[index] < 0)
      .join(', ')}`
  );
  assert.deepEqual(positions, [...positions].sort((first, second) => first - second));
};

const misReport = (overrides = {}) => ({
  generatedAt: 'test',
  filters: {
    startDate: '2026-11-15',
    endDate: '2026-11-21',
    dates: 'Nov 15, 2026 - Nov 21, 2026',
    times: 'All times',
    status: 'Approved and pending',
    equipment: 'Sound System',
    utilities: 'All utilities'
  },
  summary: { total: 2, approved: 1, pending: 1 },
  rankingModes: { equipment: 'most', utilities: 'least' },
  equipmentInventory: [
    { name: 'LCD Projector', total: 19, underMaintenance: 0, reserved: 3, available: 16 },
    { name: 'Microphone', total: 14, underMaintenance: 8, reserved: 6, available: 0 }
  ],
  utilityInventory: [
    { name: 'Chair', reserved: 0, status: 'Available' },
    { name: 'Whiteboard', reserved: 18, status: 'Available' }
  ],
  trend: [{ label: 'Sun', count: 1 }],
  equipmentUsage: [{
    id: 'sound',
    name: 'Sound System',
    hours: 10,
    sessions: [{ date: '2026-11-16', startTime: '10:00 AM', endTime: '12:00 PM', quantity: 5, durationHours: 2, hours: 10 }]
  }],
  groupConsumption: [{ name: 'Department / Office: OSA', units: 5 }],
  equipmentRanking: [{ name: 'Sound System', quantity: 5 }],
  utilityRanking: [{ name: 'Whiteboard', quantity: 1 }, { name: 'Chair', quantity: 0 }],
  recentEquipment: [{
    name: 'Sound System',
    sku: 'NEW-1874',
    latestBooking: { borrower: 'Requestor', dateTime: 'Nov 16, 2026 · 10:00 AM', quantity: 5 }
  }],
  recentUtilities: [{ name: 'Chair', sku: 'UTIL-1', latestBooking: null }],
  matchedReservations: [{
    event: 'STI Celebration',
    requestor: 'Requestor',
    dateTime: 'Nov 17, 2026 · 9:00 AM',
    equipment: '5 × Sound System',
    utilities: '1 × Whiteboard',
    status: 'Pending'
  }],
  ...overrides
});

test('MIS PDF puts live inventory first, then the filter table and analytics in dashboard order', () => {
  const pdf = createPdfOutput(exportMisDashboardPdf, misReport());

  assertPdfSectionOrder(pdf, [
    'Live inventory',
    'Equipment inventory',
    'Utility inventory',
    'Filtered analytics',
    'Filter by date',
    'Reservation activity chart',
    'Equipment usage hours',
    'Resource consumption by requestor group',
    'Most Requested Equipment',
    'Least Requested Utilities',
    'Recent Approved Equipment',
    'Recent Approved Utilities',
    'Matched reservations'
  ]);
  assert.equal(pdf.indexOf('Reservations awaiting approval'), -1);
  assert.equal(pdf.indexOf('Pending users'), -1);
});

test('MIS PDF includes only the chosen sections', () => {
  const inventoryOnly = createPdfOutput(exportMisDashboardPdf, misReport({ sections: ['utilityInventory'] }));
  assert.ok(inventoryOnly.includes('Utility inventory'));
  assert.equal(inventoryOnly.indexOf('Equipment inventory'), -1);
  assert.equal(inventoryOnly.indexOf('Filter by date'), -1);

  const analyticsOnly = createPdfOutput(exportMisDashboardPdf, misReport({ sections: ['matched'] }));
  assertPdfSectionOrder(analyticsOnly, ['Filtered analytics', 'Filter by date', 'Matched reservations']);
  assert.equal(analyticsOnly.indexOf('Live inventory'), -1);
  assert.equal(analyticsOnly.indexOf('Reservation activity chart'), -1);
});

test('MIS PDF refuses an export with no sections', () => {
  assert.throws(
    () => createPdfOutput(exportMisDashboardPdf, misReport({ sections: [] })),
    /at least one section/
  );
});

const buildingAdminReport = (overrides = {}) => ({
  generatedAt: 'test',
  filters: {
    startDate: '2026-11-15',
    endDate: '2026-11-21',
    dates: 'Nov 15, 2026 - Nov 21, 2026',
    times: 'All times',
    status: 'Approved and pending'
  },
  summary: { total: 2, approved: 1, pending: 1 },
  trend: [{ label: 'Sun', count: 1 }],
  utilization: [
    { name: 'Gymnasium', bookedHours: 15, operatingHours: 105, utilizationPercent: 14.3 },
    { name: 'Dance Studio', bookedHours: 50, operatingHours: 105, utilizationPercent: 47.6 },
    { name: 'Auditorium', bookedHours: 15, operatingHours: 105, utilizationPercent: 14.3 }
  ],
  heatmapDateRangeLabel: 'Nov 15, 2026 - Nov 21, 2026',
  heatmapStatusLabel: 'Approved',
  heatmaps: [
    { id: 'gym', name: 'Gymnasium', cells: Array.from({ length: 7 }, () => Array(15).fill(0)), peakMinutes: 0, busiestCellsByWeekday: [] },
    { id: 'aud', name: 'Auditorium', cells: Array.from({ length: 7 }, () => Array(15).fill(0)), peakMinutes: 0, busiestCellsByWeekday: [] }
  ],
  rankingMode: 'most',
  facilityRanking: [
    { name: 'Gymnasium', count: 1 },
    { name: 'Auditorium', count: 0 },
    { name: 'Dance Studio', count: 1 }
  ],
  matchedReservations: [{
    event: 'STI Celebration',
    requestor: 'Requestor',
    dateTime: 'Nov 17, 2026 · 9:00 AM',
    facilities: 'Gymnasium',
    participants: '600',
    status: 'Pending'
  }],
  ...overrides
});

test('Building Admin PDF exports only filtered analytics, in dashboard order', () => {
  const pdf = createPdfOutput(exportBuildingAdminDashboardPdf, buildingAdminReport());

  assertPdfSectionOrder(pdf, [
    'Filtered analytics',
    'Filter by date',
    'Reservation activity chart',
    'Facility Usage Rate',
    'Busiest Hours Map',
    'Auditorium booking heatmap',
    'Gymnasium booking heatmap',
    'Most Requested Facilities',
    'Matched reservations'
  ]);
  assert.equal(pdf.indexOf('Live operation'), -1);
  assert.equal(pdf.indexOf('Resource alerts'), -1);
});

test('Building Admin PDF includes only the chosen sections and heatmap facilities', () => {
  const pdf = createPdfOutput(exportBuildingAdminDashboardPdf, buildingAdminReport({
    sections: ['heatmap', 'ranking'],
    rankingMode: 'least',
    heatmaps: [buildingAdminReport().heatmaps[0]]
  }));

  assertPdfSectionOrder(pdf, [
    'Filter by date',
    'Busiest Hours Map',
    'Gymnasium booking heatmap',
    'Least Requested Facilities'
  ]);
  assert.equal(pdf.indexOf('Auditorium booking heatmap'), -1);
  assert.equal(pdf.indexOf('Reservation activity chart'), -1);
  assert.equal(pdf.indexOf('Facility usage rate details'), -1);
  assert.equal(pdf.indexOf('Matched reservations'), -1);
});

test('Building Admin PDF refuses an export with no sections', () => {
  assert.throws(
    () => createPdfOutput(exportBuildingAdminDashboardPdf, buildingAdminReport({ sections: [] })),
    /at least one section/
  );
});

test('Room Checker PDF puts live operation before filtered analytics and groups related data', () => {
  const pdf = createPdfOutput(exportRoomCheckerDashboardPdf, {
    generatedAt: 'test',
    filters: {
      dates: 'All dates',
      times: 'All times',
      status: 'All statuses',
      upcomingWindow: '7 days'
    },
    summary: { total: 0, approved: 0, pending: 0, reservedUnits: 0 },
    approvals: [],
    upcomingReservations: [],
    liveOccupancy: [],
    reservedHours: [],
    roomRanking: [],
    trend: [],
    reservations: []
  });

  assertPdfSectionOrder(pdf, [
    'Live operation',
    'Reservations awaiting your approval',
    'Filtered analytics',
    'Current dashboard selections',
    'Filtered reservation summary',
    'Reservation activity chart',
    'Reservation activity data',
    'Room occupancy',
    'Reserved Room hours'
  ]);
});
