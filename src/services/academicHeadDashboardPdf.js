import { jsPDF } from 'jspdf';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';
import {
  addFooter,
  addReportTitle,
  addSectionHeading,
  addTable,
  drawTrendChart
} from './dashboardPdfCommon.js';

const REPORT_TITLE = 'Academic Head Filtered Analytics';

// Filtered-analytics sections shown on the Academic Head dashboard, in dashboard order.
// Approvals and upcoming events are not included.
export const ACADEMIC_HEAD_PDF_SECTIONS = ['activity', 'roomHours', 'roomConsumption', 'matched'];

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

const addRoomHoursSection = (doc, report, y) => addTable(doc, {
  title: 'Room usage hours',
  headers: ['Rank', 'Room', 'Reserved hours'],
  rows: (report.roomUsageHours || []).map((room, index) => [index + 1, room.name, `${room.hours.toFixed(1)} h`]),
  y
});

const addRoomConsumptionSection = (doc, report, y) => {
  const groups = report.roomConsumption || [];
  const total = groups.reduce((sum, group) => sum + (Number(group.units) || 0), 0);
  return addTable(doc, {
    title: `Room Reservations by Program (${total} reservation${total === 1 ? '' : 's'})`,
    headers: ['Rank', 'Program / course', 'Rooms used', 'Reservations', 'Share of total'],
    rows: groups.map((group, index) => [
      index + 1,
      group.name,
      (group.items || []).map((item) => `${item.name} (${item.units})`).join(', ') || '—',
      group.units,
      total ? `${(group.units / total * 100).toFixed(1)}%` : '0.0%'
    ]),
    y
  });
};

const addMatchedSection = (doc, report, y) => addTable(doc, {
  title: 'Matched reservations',
  headers: ['Event', 'Requestor', 'Date and time', 'Specific room', 'Participants', 'Status'],
  rows: report.matchedReservations.map((reservation) => [
    reservation.event,
    reservation.requestor,
    reservation.dateTime,
    reservation.specificRoom || '—',
    reservation.participants || 'Not specified',
    reservation.status
  ]),
  y,
  fontSize: 6.5
});

const SECTION_RENDERERS = {
  activity: addActivitySection,
  roomHours: addRoomHoursSection,
  roomConsumption: addRoomConsumptionSection,
  matched: addMatchedSection
};

export const exportAcademicHeadDashboardPdf = (report) => {
  const requestedSections = new Set(report.sections || ACADEMIC_HEAD_PDF_SECTIONS);
  const sections = ACADEMIC_HEAD_PDF_SECTIONS.filter((key) => requestedSections.has(key));
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
  doc.save(`Academic Head Filtered Analytics - ${dateRange}.pdf`);
  return doc;
};
