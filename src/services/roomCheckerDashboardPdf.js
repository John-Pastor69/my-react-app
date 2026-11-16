import { jsPDF } from 'jspdf';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';
import {
  addFooter,
  addReportTitle,
  addSectionHeading,
  addTable,
  drawTrendChart
} from './dashboardPdfCommon.js';
import { sortRankingByValue, sortVenuesByUtilization } from './facilityUtilization.js';

const REPORT_TITLE = 'Room Checker Filtered Analytics';

// Filtered-analytics sections, in dashboard order. Approvals and upcoming events are not included.
export const ROOM_CHECKER_PDF_SECTIONS = ['activity', 'roomHours', 'roomRanking', 'matched'];

const formatNumber = (value) => (Number(value) || 0).toFixed(1);

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
  title: 'Reserved Room Hours',
  headers: ['Rank', 'Room', 'Reserved hours', 'Operating hours', 'Usage rate'],
  rows: sortVenuesByUtilization(report.roomUsage).map((room, index) => [
    index + 1,
    room.name,
    formatNumber(room.bookedHours),
    Number(room.operatingHours) || 0,
    `${formatNumber(room.utilizationPercent)}%`
  ]),
  y
});

const addRoomRankingSection = (doc, report, y) => {
  const mode = report.rankingMode === 'least' ? 'least' : 'most';
  return addTable(doc, {
    title: `${mode === 'least' ? 'Least' : 'Most'} Requested Rooms`,
    headers: ['Rank', 'Room', 'Approved reservations'],
    rows: sortRankingByValue(report.roomRanking, mode, 'quantity')
      .map((room, index) => [index + 1, room.name, room.quantity]),
    y
  });
};

const addMatchedSection = (doc, report, y) => addTable(doc, {
  title: 'Matched reservations',
  headers: ['Event', 'Requestor', 'Date and time', 'Specific room', 'Status'],
  rows: report.matchedReservations.map((reservation) => [
    reservation.event,
    reservation.requestor,
    reservation.dateTime,
    reservation.specificRoom || '—',
    reservation.status
  ]),
  y,
  fontSize: 6.5
});

const SECTION_RENDERERS = {
  activity: addActivitySection,
  roomHours: addRoomHoursSection,
  roomRanking: addRoomRankingSection,
  matched: addMatchedSection
};

export const exportRoomCheckerDashboardPdf = (report) => {
  const requestedSections = new Set(report.sections || ROOM_CHECKER_PDF_SECTIONS);
  const sections = ROOM_CHECKER_PDF_SECTIONS.filter((key) => requestedSections.has(key));
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
  doc.save(`Room Checker Filtered Analytics - ${dateRange}.pdf`);
  return doc;
};
