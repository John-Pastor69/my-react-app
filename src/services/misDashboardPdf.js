import { jsPDF } from 'jspdf';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';
import {
  addFooter,
  addReportTitle,
  addSectionHeading,
  addTable,
  drawTrendChart
} from './dashboardPdfCommon.js';
import { sortRankingByValue } from './facilityUtilization.js';
import {
  getEquipmentAlerts,
  sortEquipmentByHours,
  sortEquipmentByUsage,
  sortUtilitiesByReserved
} from './resourceInventory.js';

const REPORT_TITLE = 'MIS Dashboard Report';

// Live inventory sections, then the filtered analytics sections, in dashboard order.
export const MIS_PDF_INVENTORY_SECTIONS = ['equipmentInventory', 'utilityInventory'];
export const MIS_PDF_ANALYTICS_SECTIONS = [
  'activity',
  'equipmentHours',
  'groupConsumption',
  'equipmentRanking',
  'utilityRanking',
  'recentEquipment',
  'recentUtilities',
  'matched'
];
export const MIS_PDF_SECTIONS = [...MIS_PDF_INVENTORY_SECTIONS, ...MIS_PDF_ANALYTICS_SECTIONS];

const formatNumber = (value) => (Number(value) || 0).toFixed(1);
const formatUnits = (units) => `${units} unit${Number(units) === 1 ? '' : 's'}`;
const getItemName = (item) => (item.isOtherRequest ? `Other: ${item.name}` : item.name);

const addEquipmentInventorySection = (doc, report, y) => addTable(doc, {
  title: 'Equipment inventory (least available first)',
  headers: ['Rank', 'Equipment', 'Available', 'Reserved', 'Under maintenance', 'Total units', 'Alerts'],
  rows: sortEquipmentByUsage(report.equipmentInventory).map((item, index) => [
    index + 1,
    item.name,
    item.available,
    item.reserved,
    item.underMaintenance || 0,
    item.total,
    getEquipmentAlerts(item).map((alert) => alert.label).join(', ') || '—'
  ]),
  y
});

const addUtilityInventorySection = (doc, report, y) => addTable(doc, {
  title: 'Utility inventory (most reserved first)',
  headers: ['Rank', 'Utility', 'Reserved', 'Status'],
  rows: sortUtilitiesByReserved(report.utilityInventory).map((utility, index) => [
    index + 1,
    utility.name,
    utility.reserved,
    utility.status
  ]),
  y
});

const addActivitySection = (doc, report, y) => {
  y = addSectionHeading(doc, 'Reservation activity', y);
  y = drawTrendChart(doc, report.trend, y);
  y = addTable(doc, {
    title: 'Reservation activity data',
    headers: ['Period', 'Reservations'],
    rows: report.trend.map((bucket) => [bucket.label, bucket.count]),
    y
  });
  return addTable(doc, {
    title: 'Reservation status breakdown',
    headers: ['Matching reservations', 'Approved', 'Pending'],
    rows: [[report.summary.total, report.summary.approved, report.summary.pending]],
    y,
    fontSize: 8
  });
};

const addEquipmentHoursSection = (doc, report, y) => {
  const equipment = sortEquipmentByHours(report.equipmentUsage);
  y = addTable(doc, {
    title: 'Equipment usage hours',
    headers: ['Rank', 'Equipment', 'Reserved equipment-hours', 'Sessions'],
    rows: equipment.map((item, index) => [
      index + 1,
      getItemName(item),
      `${formatNumber(item.hours)} h`,
      item.sessions.length
    ]),
    y
  });
  return addTable(doc, {
    title: 'Equipment usage session breakdown',
    headers: ['Equipment', 'Date', 'Start', 'End', 'Units', 'Hours per unit', 'Equipment-hours'],
    rows: equipment.flatMap((item) => item.sessions.map((session) => [
      getItemName(item),
      session.date,
      session.startTime,
      session.endTime,
      session.quantity,
      formatNumber(session.durationHours),
      formatNumber(session.hours)
    ])),
    y,
    fontSize: 6.5
  });
};

const addGroupConsumptionSection = (doc, report, y) => {
  const totalUnits = report.groupConsumption.reduce((total, group) => total + (Number(group.units) || 0), 0);
  return addTable(doc, {
    title: `Resource consumption by requestor group (${formatUnits(totalUnits)})`,
    headers: ['Rank', 'Requestor group', 'Approved equipment units', 'Share of total'],
    rows: report.groupConsumption.map((group, index) => [
      index + 1,
      group.name,
      group.units,
      totalUnits ? `${formatNumber(group.units / totalUnits * 100)}%` : '0.0%'
    ]),
    y
  });
};

const addRankingSection = (doc, items, mode, noun, y) => {
  const rankingMode = mode === 'least' ? 'least' : 'most';
  return addTable(doc, {
    title: `${rankingMode === 'least' ? 'Least' : 'Most'} Requested ${noun}`,
    headers: ['Rank', noun === 'Equipment' ? 'Equipment' : 'Utility', 'Approved units'],
    rows: sortRankingByValue(items, rankingMode, 'quantity')
      .map((item, index) => [index + 1, getItemName(item), item.quantity]),
    y
  });
};

const addRecentSection = (doc, title, itemHeader, items, y) => addTable(doc, {
  title,
  headers: [itemHeader, 'SKU / source', 'Booked by', 'Date and time', 'Units'],
  rows: items.map((item) => [
    item.name,
    item.sku,
    item.latestBooking?.borrower || 'No approved booking in this date range',
    item.latestBooking ? item.latestBooking.dateTime : '',
    item.latestBooking ? item.latestBooking.quantity : ''
  ]),
  y
});

// MIS focuses on resources, so this lists equipment and utilities (with units) rather than facilities.
const addMatchedSection = (doc, report, y) => addTable(doc, {
  title: 'Matched reservations',
  headers: ['Event', 'Requestor', 'Date and time', 'Equipment', 'Utilities', 'Status'],
  rows: report.matchedReservations.map((reservation) => [
    reservation.event,
    reservation.requestor,
    reservation.dateTime,
    reservation.equipment || 'None',
    reservation.utilities || 'None',
    reservation.status
  ]),
  y,
  fontSize: 6.5
});

const SECTION_RENDERERS = {
  equipmentInventory: addEquipmentInventorySection,
  utilityInventory: addUtilityInventorySection,
  activity: addActivitySection,
  equipmentHours: addEquipmentHoursSection,
  groupConsumption: addGroupConsumptionSection,
  equipmentRanking: (doc, report, y) => addRankingSection(
    doc, report.equipmentRanking, report.rankingModes.equipment, 'Equipment', y
  ),
  utilityRanking: (doc, report, y) => addRankingSection(
    doc, report.utilityRanking, report.rankingModes.utilities, 'Utilities', y
  ),
  recentEquipment: (doc, report, y) => addRecentSection(
    doc, 'Recent Approved Equipment', 'Equipment', report.recentEquipment, y
  ),
  recentUtilities: (doc, report, y) => addRecentSection(
    doc, 'Recent Approved Utilities', 'Utility', report.recentUtilities, y
  ),
  matched: addMatchedSection
};

export const exportMisDashboardPdf = (report) => {
  const requestedSections = new Set(report.sections || MIS_PDF_SECTIONS);
  const inventorySections = MIS_PDF_INVENTORY_SECTIONS.filter((key) => requestedSections.has(key));
  const analyticsSections = MIS_PDF_ANALYTICS_SECTIONS.filter((key) => requestedSections.has(key));
  if (!inventorySections.length && !analyticsSections.length) {
    throw new Error('Choose at least one section to export.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = addReportTitle(doc, REPORT_TITLE, report.generatedAt);

  if (inventorySections.length) {
    y = addSectionHeading(doc, `Live inventory (as of ${report.generatedAt})`, y);
    inventorySections.forEach((key) => {
      y = SECTION_RENDERERS[key](doc, report, y);
    });
  }

  if (analyticsSections.length) {
    y = addSectionHeading(doc, 'Filtered analytics', y);
    y = addTable(doc, {
      title: 'Filter by date',
      headers: ['Date range', 'Start-time range', 'Status', 'Equipment', 'Utilities', 'Reservations found'],
      rows: [[
        report.filters.dates,
        report.filters.times,
        report.filters.status,
        report.filters.equipment || 'All equipment',
        report.filters.utilities || 'All utilities',
        report.summary.total
      ]],
      y
    });
    analyticsSections.forEach((key) => {
      y = SECTION_RENDERERS[key](doc, report, y);
    });
  }

  addFooter(doc, REPORT_TITLE);
  const dateRange = getDashboardPdfDateRange(report.filters);
  doc.save(`MIS Dashboard Report - ${dateRange}.pdf`);
  return doc;
};
