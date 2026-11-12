import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const PAGE_MARGIN = 12;
const FOOTER_MARGIN = 18;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toText = (value) => (value === null || value === undefined ? '' : String(value));

const getFilenameDateRange = ({ startDate, endDate }) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const parseFilterDate = (value) => {
    const dateString = toText(value).trim();
    if (!dateString) return null;
    if (!datePattern.test(dateString)) {
      throw new Error('The selected date range cannot be used in the PDF filename.');
    }

    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) {
      throw new Error('The selected date range cannot be used in the PDF filename.');
    }
    return date;
  };
  const start = parseFilterDate(startDate);
  const end = parseFilterDate(endDate);
  const formatMonth = (date) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  const formatDate = (date) => `${formatMonth(date)} ${date.getDate()}, ${date.getFullYear()}`;

  if (!start && !end) return 'All dates';
  if (!start) return `Through ${formatDate(end)}`;
  if (!end) return `From ${formatDate(start)}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${formatMonth(start)} ${start.getDate()} to ${formatMonth(end)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${formatMonth(start)} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`;
};

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

const addTable = (doc, { title, headers, rows, y, fontSize = 7, columnStyles = {} }) => {
  const tableY = addSectionHeading(doc, title, y);
  autoTable(doc, {
    startY: tableY,
    head: [headers],
    body: rows.length ? rows : [headers.map((_, index) => (index === 0 ? 'No data available' : ''))],
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
    columnStyles,
    showHead: 'everyPage'
  });
  return doc.lastAutoTable.finalY + 8;
};

const addAnalyticsSectionCapture = async (doc, element, title) => {
  if (!element) throw new Error('The filtered analytics section is unavailable for capture.');

  const canvas = await html2canvas(element, {
    scale: 1.5,
    backgroundColor: '#f4f7fe',
    useCORS: true,
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
    windowHeight: Math.max(window.innerHeight, element.scrollHeight),
    scrollX: 0,
    scrollY: 0,
    ignoreElements: (candidate) => candidate.classList?.contains('dashboard-filters'),
    onclone: (clonedDocument) => {
      clonedDocument.querySelectorAll('.trend-chart-scroll, .venue-heatmap-scroll').forEach((container) => {
        container.style.overflow = 'visible';
        container.style.maxWidth = 'none';
      });
    }
  });
  if (!canvas.width || !canvas.height) throw new Error('The filtered analytics section produced an empty image.');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imageWidth = pageWidth - PAGE_MARGIN * 2;
  const imageTop = PAGE_MARGIN + 9;
  const imageHeight = pageHeight - imageTop - FOOTER_MARGIN;
  const sourceSliceHeight = Math.max(1, Math.floor(canvas.width * imageHeight / imageWidth));

  for (let offsetY = 0; offsetY < canvas.height; offsetY += sourceSliceHeight) {
    const sliceHeight = Math.min(sourceSliceHeight, canvas.height - offsetY);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const context = slice.getContext('2d');
    if (!context) throw new Error('Could not prepare an analytics image for the PDF.');
    context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(23, 36, 59);
    doc.text(`${title} - dashboard view`, PAGE_MARGIN, PAGE_MARGIN + 4);
    doc.addImage(
      slice.toDataURL('image/jpeg', 0.94),
      'JPEG',
      PAGE_MARGIN,
      imageTop,
      imageWidth,
      sliceHeight * imageWidth / canvas.width
    );
  }

  return pageHeight;
};

const addAnalyticsCapture = async (doc, sections) => {
  for (const section of sections) {
    await addAnalyticsSectionCapture(doc, section.element, section.title);
  }
  return doc.internal.pageSize.getHeight();
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
    doc.text('Building Admin Dashboard Report', PAGE_MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 7, { align: 'right' });
  }
};

export const exportBuildingAdminDashboardPdf = async (report, analyticsSections) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(23, 36, 59);
  doc.text('Building Admin Dashboard Report', PAGE_MARGIN, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 128, 154);
  doc.text(`Generated ${toText(report.generatedAt)}`, PAGE_MARGIN, 23);

  let y = addTable(doc, {
    title: 'Current dashboard selections',
    headers: ['Date range', 'Start-time range', 'Status', 'Upcoming window', 'Alert category', 'Heatmap facility'],
    rows: [[
      report.filters.dates,
      report.filters.times,
      report.filters.status,
      report.filters.upcomingWindow,
      report.filters.alertCategory,
      report.filters.heatmapFacility
    ]],
    y: 29,
    fontSize: 7
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

  y = addSectionHeading(doc, 'Live operation', y);
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
    title: 'Upcoming approved reservations',
    headers: ['Reference', 'Event', 'Requestor', 'Event date', 'Start time', 'Facilities'],
    rows: report.upcomingReservations.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.date,
      reservation.time,
      reservation.facilities
    ]),
    y,
    fontSize: 6.5
  });
  y = addTable(doc, {
    title: 'Resource alerts',
    headers: ['Category', 'Item', 'Details'],
    rows: report.alerts.map((alert) => [alert.category, alert.title, alert.detail]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Facility snapshot',
    headers: ['Facilities in directory', 'Available', 'Maintenance', 'Unavailable'],
    rows: [[
      report.snapshot.facilities,
      report.snapshot.available,
      report.snapshot.maintenance,
      report.snapshot.unavailable
    ]],
    y,
    fontSize: 8
  });
  y = addTable(doc, {
    title: 'Venue utilization details',
    headers: ['Facility', 'Booked hours', 'Utilization', 'Week'],
    rows: report.utilization.map((venue) => [
      venue.name,
      Number(venue.bookedHours || 0).toFixed(1),
      `${Number(venue.utilizationPercent || 0).toFixed(1)}%`,
      `${venue.weekStart} - ${venue.weekEnd}`
    ]),
    y,
    fontSize: 7
  });

  y = await addAnalyticsCapture(doc, analyticsSections);
  y = addTable(doc, {
    title: 'Reservation activity data',
    headers: ['Period', 'Reservations'],
    rows: report.trend.map((bucket) => [bucket.label, bucket.count]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Facility ranking',
    headers: ['Facility', 'Approved reservations'],
    rows: report.facilityRanking.map((facility) => [facility.name, facility.count]),
    y,
    fontSize: 7
  });

  report.heatmaps.forEach((venue) => {
    const hourHeaders = Array.from({ length: 15 }, (_, index) => {
      const hour = index + 7;
      return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
    });
    y = addTable(doc, {
      title: `${venue.name} heatmap values (${report.heatmapStatusLabel.toLowerCase()}, ${report.heatmapDateRangeLabel})`,
      headers: ['Weekday', ...hourHeaders],
      rows: WEEKDAYS.map((day, weekday) => [
        day,
        ...venue.cells[weekday].map((minutes) => (Number(minutes || 0) / 60).toFixed(1))
      ]),
      y,
      fontSize: 5.5,
      columnStyles: { 0: { halign: 'left', cellWidth: 22 } }
    });
  });

  y = addTable(doc, {
    title: 'All matching reservations - event details',
    headers: ['Reference', 'Event', 'Requestor', 'Dates', 'Times', 'Status', 'Source'],
    rows: report.reservations.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.dates,
      reservation.times,
      reservation.status,
      reservation.source
    ]),
    y,
    fontSize: 6
  });
  addTable(doc, {
    title: 'All matching reservations - facilities and requested resources',
    headers: ['Reference', 'Facilities', 'Requested resources'],
    rows: report.reservations.map((reservation) => [
      reservation.reference,
      reservation.facilities,
      reservation.resources
    ]),
    y,
    fontSize: 6
  });

  addFooter(doc);
  const dateRange = getFilenameDateRange(report.filters);
  doc.save(`Building Admin Dashboard - ${dateRange}.pdf`);
  return doc;
};
