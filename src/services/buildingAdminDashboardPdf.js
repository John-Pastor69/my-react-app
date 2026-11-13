import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';

const PAGE_MARGIN = 12;
const FOOTER_MARGIN = 18;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEATMAP_COLORS = [
  [241, 245, 249],
  [219, 234, 254],
  [147, 197, 253],
  [59, 130, 246],
  [30, 64, 175]
];

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

const drawTrendChart = (doc, trend, y) => {
  y = addSectionHeading(doc, 'Reservation activity chart', y);
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + 62 > pageHeight - FOOTER_MARGIN) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  if (!trend.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('No reservation activity data is available.', PAGE_MARGIN, y + 5);
    return y + 14;
  }

  const chartWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const chartHeight = 38;
  const baseline = y + chartHeight;
  const gap = 5;
  const columnWidth = (chartWidth - gap * (trend.length - 1)) / trend.length;
  const maximum = Math.max(1, ...trend.map((item) => Number(item.count) || 0));
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

const drawDonut = (doc, centerX, centerY, radius, percentage) => {
  const clampedPercent = Math.min(100, Math.max(0, Number(percentage) || 0));
  doc.setFillColor(232, 237, 245);
  doc.circle(centerX, centerY, radius, 'F');

  const segmentCount = Math.round(clampedPercent / 100 * 48);
  if (segmentCount) {
    doc.setFillColor(49, 95, 232);
    for (let index = 0; index < segmentCount; index += 1) {
      const startAngle = -Math.PI / 2 + index / 48 * Math.PI * 2;
      const endAngle = -Math.PI / 2 + (index + 1) / 48 * Math.PI * 2;
      doc.triangle(
        centerX,
        centerY,
        centerX + Math.cos(startAngle) * radius,
        centerY + Math.sin(startAngle) * radius,
        centerX + Math.cos(endAngle) * radius,
        centerY + Math.sin(endAngle) * radius,
        'F'
      );
    }
  }

  doc.setFillColor(255, 255, 255);
  doc.circle(centerX, centerY, radius * 0.62, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(23, 36, 59);
  doc.text(`${(Number(percentage) || 0).toFixed(1)}%`, centerX, centerY + 1, { align: 'center' });
};

const drawUtilizationChart = (doc, utilization, y) => {
  y = addSectionHeading(doc, 'Venue utilization chart', y);
  if (!utilization.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('No facility utilization data is available.', PAGE_MARGIN, y + 5);
    return y + 14;
  }

  const perPage = 3;
  const cardWidth = (doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2) / perPage;
  let rowY = y + 12;
  utilization.forEach((venue, index) => {
    const position = index % perPage;
    if (position === 0 && index > 0) {
      rowY += 34;
      if (rowY + 28 > doc.internal.pageSize.getHeight() - FOOTER_MARGIN) {
        doc.addPage();
        rowY = PAGE_MARGIN + 18;
      }
    }
    const x = PAGE_MARGIN + position * cardWidth;
    drawDonut(doc, x + 12, rowY, 10, venue.utilizationPercent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(23, 36, 59);
    doc.text(toText(venue.name), x + 27, rowY - 2, { maxWidth: cardWidth - 30 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 128, 154);
    doc.text(`${Number(venue.bookedHours || 0).toFixed(1)} of 105 hours booked`, x + 27, rowY + 5, {
      maxWidth: cardWidth - 30
    });
  });
  return rowY + 22;
};

const heatmapIntensity = (minutes, peak) => {
  if (!minutes || !peak) return 0;
  const ratio = minutes / peak;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
};

const drawHeatmap = (doc, venue, dateRangeLabel, statusLabel, y) => {
  const busiestDays = venue.busiestCellsByWeekday || [];
  const busiestCellCount = busiestDays.reduce((total, day) => total + day.cells.length, 0);
  const busiestSummaryHeight = busiestDays.length
    ? 8 + busiestDays.length * 5 + 3
    : 7;
  const heatmapHeight = 10 + 79 + 13 + busiestSummaryHeight;
  if (y + heatmapHeight > doc.internal.pageSize.getHeight() - FOOTER_MARGIN) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  y = addSectionHeading(doc, `${venue.name} booking heatmap`, y);

  const labelWidth = 25;
  const gridWidth = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2 - labelWidth;
  const cellWidth = gridWidth / 15;
  const cellHeight = 8;
  const gridY = y + 8;
  const hours = Array.from({ length: 15 }, (_, index) => index + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(113, 128, 154);
  doc.text(`${statusLabel} booking hours by weekday, ${dateRangeLabel}`, PAGE_MARGIN, y + 3);

  hours.forEach((hour, index) => {
    const label = `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
    doc.text(label, PAGE_MARGIN + labelWidth + index * cellWidth + cellWidth / 2, gridY + 5, { align: 'center' });
  });

  WEEKDAYS.forEach((day, weekday) => {
    const rowY = gridY + 8 + weekday * (cellHeight + 1);
    doc.setFontSize(6);
    doc.setTextColor(23, 36, 59);
    doc.text(day, PAGE_MARGIN, rowY + 5.5);
    hours.forEach((_, hourIndex) => {
      const minutes = Number(venue.cells?.[weekday]?.[hourIndex]) || 0;
      const level = heatmapIntensity(minutes, venue.peakMinutes);
      const [red, green, blue] = HEATMAP_COLORS[level];
      doc.setFillColor(red, green, blue);
      doc.setDrawColor(255, 255, 255);
      doc.rect(
        PAGE_MARGIN + labelWidth + hourIndex * cellWidth,
        rowY,
        Math.max(1, cellWidth - 0.6),
        cellHeight,
        'FD'
      );
    });
  });

  const gridBottom = gridY + 8 + WEEKDAYS.length * (cellHeight + 1);
  let legendX = PAGE_MARGIN;
  doc.setFontSize(6);
  doc.setTextColor(113, 128, 154);
  doc.text('Less', legendX, gridBottom + 6);
  legendX += 12;
  HEATMAP_COLORS.slice(1).forEach(([red, green, blue]) => {
    doc.setFillColor(red, green, blue);
    doc.rect(legendX, gridBottom + 2, 8, 5, 'F');
    legendX += 10;
  });
  doc.text('More (relative to this facility peak)', legendX + 2, gridBottom + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(23, 36, 59);
  const busiestY = gridBottom + 13;
  if (!busiestDays.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`No ${statusLabel.toLowerCase()} booking time in this date range.`, PAGE_MARGIN, busiestY);
    return busiestY + 7;
  }

  doc.text(
    `Busiest cell${busiestCellCount === 1 ? '' : 's'}: ${(venue.peakMinutes / 60).toFixed(1)} booked hours each`,
    PAGE_MARGIN,
    busiestY
  );
  doc.setFontSize(7.5);
  busiestDays.forEach((day, index) => {
    const rowY = busiestY + 8 + index * 5;
    doc.setFillColor(113, 128, 154);
    doc.circle(PAGE_MARGIN + 1, rowY - 1, 0.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(23, 36, 59);
    doc.text(WEEKDAYS[day.weekday], PAGE_MARGIN + 5, rowY);
    const weekdayWidth = doc.getTextWidth(WEEKDAYS[day.weekday]);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(113, 128, 154);
    doc.text(` — ${(day.totalMinutes / 60).toFixed(1)} total booked hours that day`, PAGE_MARGIN + 5 + weekdayWidth, rowY);
  });
  return busiestY + 8 + busiestDays.length * 5 + 3;
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

export const exportBuildingAdminDashboardPdf = (report) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(23, 36, 59);
  doc.text('Building Admin Dashboard Report', PAGE_MARGIN, 17);
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
  y = drawUtilizationChart(doc, report.utilization, y);
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

  y = addSectionHeading(doc, 'Filtered analytics', y);
  y = addTable(doc, {
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
    y,
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
  y = drawTrendChart(doc, report.trend, y);
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
    y = drawHeatmap(
      doc,
      venue,
      report.heatmapDateRangeLabel,
      report.heatmapStatusLabel,
      y
    );
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
  const dateRange = getDashboardPdfDateRange(report.filters);
  doc.save(`Building Admin Dashboard - ${dateRange}.pdf`);
  return doc;
};
