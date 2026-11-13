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

test('Building Admin PDF puts live operation before filtered analytics and groups related data', () => {
  const pdf = createPdfOutput(exportBuildingAdminDashboardPdf, {
    generatedAt: 'test',
    filters: {
      dates: 'All dates',
      times: 'All times',
      status: 'All statuses',
      upcomingWindow: '7 days',
      alertCategory: 'All categories',
      heatmapFacility: 'All facilities'
    },
    summary: { total: 0, approved: 0, pending: 0, reservedUnits: 0 },
    approvals: [],
    upcomingReservations: [],
    alerts: [],
    snapshot: { facilities: 0, available: 0, maintenance: 0, unavailable: 0 },
    utilization: [],
    trend: [],
    facilityRanking: [],
    heatmapDateRangeLabel: 'All dates',
    heatmapStatusLabel: 'Approved',
    heatmaps: [],
    reservations: []
  });

  assertPdfSectionOrder(pdf, [
    'Live operation',
    'Reservations awaiting your approval',
    'Resource alerts',
    'Venue utilization details',
    'Filtered analytics',
    'Current dashboard selections',
    'Filtered reservation summary',
    'Reservation activity chart'
  ]);
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
