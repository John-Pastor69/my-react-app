import { jsPDF } from 'jspdf';
import {
  addFooter,
  addReportTitle,
  addSectionHeading,
  addTable
} from './dashboardPdfCommon.js';

const REPORT_TITLE = 'Calendar Reservations';

// Exports the reservations the calendar is showing for the month (after its status and facility/room
// filters), in the same layout as the dashboard PDFs: a filter table, then one row per calendar entry
// (a reservation appears once per scheduled day and facility).
export const exportCalendarReservationsPdf = (report) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = addReportTitle(doc, REPORT_TITLE, report.generatedAt);
  y = addSectionHeading(doc, report.view === 'archive' ? 'Archived reservations' : 'Active reservations', y);

  y = addTable(doc, {
    title: 'Calendar filters',
    headers: ['Month', 'View', 'Status', 'Facility / room', 'Reservations', 'Calendar entries'],
    rows: [[
      report.monthLabel,
      report.view === 'archive' ? 'Archive' : 'Active',
      report.statusLabel,
      report.locationLabel,
      report.reservationCount,
      report.entries.length
    ]],
    y
  });

  addTable(doc, {
    title: `Reservations shown on the calendar (${report.monthLabel})`,
    headers: ['Date', 'Time', 'Event', 'Facility / room', 'Requestor', 'Equipment', 'Status'],
    rows: report.entries.map((entry) => [
      entry.date,
      entry.time,
      entry.event,
      entry.location,
      entry.requestor,
      entry.equipment,
      entry.status
    ]),
    y,
    fontSize: 6.5
  });

  addFooter(doc, REPORT_TITLE);
  doc.save(`${REPORT_TITLE} - ${report.monthLabel}.pdf`);
  return doc;
};
