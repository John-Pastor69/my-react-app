import { jsPDF } from 'jspdf';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';
import {
  addFooter,
  addReportTitle,
  addSectionHeading,
  addTable,
  drawTrendChart
} from './dashboardPdfCommon.js';

const REPORT_TITLE = 'School Admin Filtered Analytics';

// Filtered-analytics sections shown on the School Admin dashboard, in dashboard order.
// Approvals and upcoming events are not included.
export const SCHOOL_ADMIN_PDF_SECTIONS = ['activity', 'aircon', 'maintenance', 'matched'];

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

// Scheduled aircon-hours per facility/room (booked cooling time, not metered electricity).
const addAirconSection = (doc, report, y) => {
  const usage = report.aircon || { totalHours: 0, items: [] };
  return addTable(doc, {
    title: `Aircon-Hours (${(usage.totalHours || 0).toFixed(1)} h total)`,
    headers: ['Rank', 'Facility / room', 'Aircon-hours', 'Reservations', 'Share of total'],
    rows: usage.items.map((item, index) => [
      index + 1,
      item.name,
      item.hours.toFixed(1),
      item.reservations,
      usage.totalHours ? `${(item.hours / usage.totalHours * 100).toFixed(1)}%` : '0.0%'
    ]),
    y
  });
};

// Equipment Maintenance Index: units under maintenance over all units (live inventory at export time).
const addMaintenanceSection = (doc, report, y) => {
  const index = report.maintenanceIndex || { percent: 0, totalUnits: 0, underMaintenance: 0, level: 'healthy', items: [] };
  const levelLabel = { healthy: 'Healthy', watch: 'Warning', critical: 'Critical' }[index.level] || 'Healthy';
  y = addTable(doc, {
    title: 'Equipment Maintenance Index',
    headers: ['Under maintenance', 'Total units', 'Index', 'Level (Healthy < 15%, Warning 15-25%, Critical > 25%)'],
    rows: [[index.underMaintenance, index.totalUnits, `${index.percent.toFixed(1)}%`, levelLabel]],
    y,
    fontSize: 8
  });
  return addTable(doc, {
    title: 'Equipment under maintenance',
    headers: ['Equipment', 'Under maintenance', 'Total units', 'Share', 'Level'],
    rows: index.items.map((item) => [
      item.name,
      item.underMaintenance,
      item.total,
      `${(item.percent || 0).toFixed(1)}%`,
      { healthy: 'Healthy', watch: 'Warning', critical: 'Critical' }[item.level] || ''
    ]),
    y
  });
};

// School Admin: reservations that booked a facility, listing the facilities (no specific room).
const addMatchedSection = (doc, report, y) => addTable(doc, {
  title: 'Matched reservations',
  headers: ['Event', 'Requestor', 'Date and time', 'Facilities', 'Status'],
  rows: report.matchedReservations.map((reservation) => [
    reservation.event,
    reservation.requestor,
    reservation.dateTime,
    reservation.facilities || '—',
    reservation.status
  ]),
  y,
  fontSize: 6.5
});

const SECTION_RENDERERS = {
  activity: addActivitySection,
  aircon: addAirconSection,
  maintenance: addMaintenanceSection,
  matched: addMatchedSection
};

export const exportSchoolAdminDashboardPdf = (report) => {
  const requestedSections = new Set(report.sections || SCHOOL_ADMIN_PDF_SECTIONS);
  const sections = SCHOOL_ADMIN_PDF_SECTIONS.filter((key) => requestedSections.has(key));
  if (!sections.length) throw new Error('Choose at least one section to export.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = addReportTitle(doc, REPORT_TITLE, report.generatedAt);
  y = addSectionHeading(doc, 'Filtered analytics', y);
  y = addTable(doc, {
    title: 'Filter by date',
    headers: ['Date range', 'Start-time range', 'Status', 'Reservations found'],
    rows: [[
      report.filters.dates,
      report.filters.times,
      report.filters.status,
      report.summary.total
    ]],
    y
  });

  sections.forEach((key) => {
    y = SECTION_RENDERERS[key](doc, report, y);
  });

  addFooter(doc, REPORT_TITLE);
  const dateRange = getDashboardPdfDateRange(report.filters);
  doc.save(`School Admin Filtered Analytics - ${dateRange}.pdf`);
  return doc;
};
