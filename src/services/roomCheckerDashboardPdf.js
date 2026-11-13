import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';

const PAGE_MARGIN = 12;
const FOOTER_MARGIN = 18;

const toText = (value) => (value === null || value === undefined ? '' : String(value));

const addSectionHeading = (doc, title, y) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + 12 > pageHeight - FOOTER_MARGIN) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(23, 36, 59);
  doc.text(title, PAGE_MARGIN, y + 4);
  doc.setDrawColor(229, 234, 242);
  doc.line(PAGE_MARGIN, y + 7, doc.internal.pageSize.getWidth() - PAGE_MARGIN, y + 7);
  return y + 10;
};

const addTable = (doc, { title, headers, rows, y, fontSize = 7 }) => {
  const tableY = addSectionHeading(doc, title, y);
  autoTable(doc, {
    startY: tableY,
    head: [headers],
    body: rows.length ? rows : [headers.map((_, index) => (
      index === 0 ? 'No data available' : ''
    ))],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN, bottom: FOOTER_MARGIN },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize,
      cellPadding: 2,
      overflow: 'linebreak',
      textColor: [23, 36, 59],
      lineColor: [229, 234, 242],
      lineWidth: 0.15,
      valign: 'middle'
    },
    headStyles: {
      fillColor: [49, 95, 232],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    showHead: 'everyPage'
  });
  return doc.lastAutoTable.finalY + 8;
};

const drawTrendChart = (doc, trend, y) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + 72 > pageHeight - FOOTER_MARGIN) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  y = addSectionHeading(doc, 'Reservation activity chart', y);

  if (!trend.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('No reservation activity data is available.', PAGE_MARGIN, y + 5);
    return y + 14;
  }

  const chartWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const chartHeight = 38;
  const gap = 5;
  const columnWidth = (chartWidth - gap * (trend.length - 1)) / trend.length;
  const maximum = Math.max(1, ...trend.map((item) => Number(item.count) || 0));
  const baseline = y + chartHeight;
  doc.setDrawColor(210, 218, 231);
  doc.line(PAGE_MARGIN, baseline, PAGE_MARGIN + chartWidth, baseline);

  trend.forEach((item, index) => {
    const x = PAGE_MARGIN + index * (columnWidth + gap);
    const value = Number(item.count) || 0;
    const barHeight = value ? Math.max(2, value / maximum * (chartHeight - 8)) : 1;
    doc.setFillColor(49, 95, 232);
    doc.rect(x, baseline - barHeight, columnWidth, barHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(23, 36, 59);
    doc.text(String(value), x + columnWidth / 2, baseline - barHeight - 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(toText(item.label), x + columnWidth / 2, baseline + 5, {
      align: 'center',
      maxWidth: columnWidth + 2
    });
  });

  return baseline + 12;
};

const addFooter = (doc) => {
  const pageCount = doc.internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(229, 234, 242);
    doc.line(PAGE_MARGIN, pageHeight - 12, pageWidth - PAGE_MARGIN, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 128, 154);
    doc.text('Room Checker Dashboard Report', PAGE_MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 7, {
      align: 'right'
    });
  }
};

export const exportRoomCheckerDashboardPdf = (report) => {
  const arrayFields = [
    'approvals',
    'upcomingReservations',
    'liveOccupancy',
    'reservedHours',
    'roomRanking',
    'trend',
    'reservations'
  ];
  if (arrayFields.some((field) => !Array.isArray(report[field]))) {
    throw new TypeError('Room Checker dashboard PDF is missing one or more report sections.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(23, 36, 59);
  doc.text('Room Checker Dashboard Report', PAGE_MARGIN, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 128, 154);
  doc.text(`Generated ${toText(report.generatedAt)}`, PAGE_MARGIN, 23);

  let y = addSectionHeading(doc, 'Live operation', 29);
  y = addTable(doc, {
    title: 'Reservations awaiting your approval',
    headers: ['Reference', 'Event', 'Requestor', 'Event date', 'Start time'],
    rows: report.approvals.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.date,
      reservation.time
    ]),
    y,
    fontSize: 6.5
  });
  y = addTable(doc, {
    title: 'Upcoming events',
    headers: ['Reference', 'Event', 'Requestor', 'Event date', 'Start time', 'Specific room', 'Facilities'],
    rows: report.upcomingReservations.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.date,
      reservation.time,
      reservation.specificRoom,
      reservation.facilities
    ]),
    y,
    fontSize: 6.5
  });
  y = addSectionHeading(doc, 'Filtered analytics', y);
  y = addTable(doc, {
    title: 'Current dashboard selections',
    headers: ['Date range', 'Start-time range', 'Status', 'Upcoming window'],
    rows: [[
      report.filters.dates,
      report.filters.times,
      report.filters.status,
      report.filters.upcomingWindow
    ]],
    y
  });
  y = addTable(doc, {
    title: 'Filtered reservation summary',
    headers: ['Matching reservations', 'Approved', 'Pending', 'Approved equipment units'],
    rows: [[
      report.summary.total,
      report.summary.approved,
      report.summary.pending,
      report.summary.reservedUnits
    ]],
    y,
    fontSize: 8
  });
  y = drawTrendChart(doc, report.trend, y);
  y = addTable(doc, {
    title: 'Reservation activity data',
    headers: ['Period', 'Reservations'],
    rows: report.trend.map((bucket) => [bucket.label, bucket.count]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Room occupancy',
    headers: ['Specific room', 'Date', 'Event', 'Requestor', 'Time', 'Status', 'Scheduled air-con'],
    rows: report.liveOccupancy.map((room) => [
      room.name,
      room.date,
      room.event,
      room.requestor,
      room.time,
      room.status,
      room.aircon
    ]),
    y,
    fontSize: 6.5
  });
  y = addTable(doc, {
    title: 'Reserved Room hours',
    headers: ['Specific room', 'Reserved hours'],
    rows: report.reservedHours.map((room) => [room.name, `${Number(room.hours || 0).toFixed(1)} h`]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Most requested Rooms',
    headers: ['Specific room', 'Approved reservations'],
    rows: report.roomRanking.map((room) => [room.name, room.count]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'All matching reservations - event details',
    headers: ['Reference', 'Event', 'Requestor', 'Specific room', 'Dates', 'Participants', 'Status', 'Source'],
    rows: report.reservations.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.specificRoom,
      reservation.dates,
      reservation.participants,
      reservation.status,
      reservation.source
    ]),
    y,
    fontSize: 6
  });
  addTable(doc, {
    title: 'All matching reservations - schedules and requested resources',
    headers: ['Reference', 'Schedules and air-con', 'Facilities', 'Equipment', 'Utilities', 'Other requests'],
    rows: report.reservations.map((reservation) => [
      reservation.reference,
      reservation.schedule,
      reservation.facilities,
      reservation.equipment,
      reservation.utilities,
      reservation.otherRequests
    ]),
    y,
    fontSize: 5.5
  });

  addFooter(doc);
  const dateRange = getDashboardPdfDateRange(report.filters);
  doc.save(`Room Checker Dashboard - ${dateRange}.pdf`);
  return doc;
};
