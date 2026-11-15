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

test('MIS PDF puts live operation before filtered analytics and groups related data', () => {
  const pdf = createPdfOutput(exportMisDashboardPdf, {
    generatedAt: 'test',
    startDate: '',
    endDate: '',
    timeRange: 'All times',
    status: 'All statuses',
    upcomingWindow: '7 days',
    rankingModes: { equipment: 'most', utilities: 'most' },
    metrics: {
      pendingApprovals: 0,
      pendingUsers: 0,
      pendingProfiles: 0,
      total: 0,
      approved: 0,
      pending: 0,
      reservedUnits: 0,
      availableUnits: 0
    },
    snapshot: {
      equipmentCatalog: 0,
      utilitiesCatalog: 0,
      facilitiesAvailable: 0,
      facilitiesUnderMaintenance: 0,
      facilitiesUnavailable: 0,
      registeredUsers: 0
    },
    equipmentUsage: [],
    groupConsumption: [],
    trend: [],
    equipmentRanking: [],
    utilityRanking: [],
    equipmentInventory: [],
    utilityInventory: [],
    approvals: [],
    upcomingReservations: [],
    recentEquipment: [],
    recentUtilities: [],
    reservations: []
  });

  assertPdfSectionOrder(pdf, [
    'Live operation',
    'Reservations awaiting approval',
    'Upcoming events',
    'Action queue summary',
    'Equipment inventory',
    'Resource snapshot',
    'Utility inventory',
    'Filtered analytics',
    'Current dashboard selections',
    'Dashboard summary',
    'MIS resource metrics',
    'Reservation activity'
  ]);
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
