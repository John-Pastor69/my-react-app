import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getDashboardPdfDateRange } from './dashboardPdfDateRange.js';

const PAGE_MARGIN = 12;
const FOOTER_MARGIN = 18;

const toText = (value) => (value === null || value === undefined ? '' : String(value));

const formatNumber = (value) => (Number(value) || 0).toFixed(1);

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

const addTable = (doc, { title, headers, rows, y, fontSize = 8 }) => {
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
    doc.text('MIS Dashboard Report', PAGE_MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 7, {
      align: 'right'
    });
  }
};

export const exportMisDashboardPdf = (report) => {
  const reportArrayFields = [
    'equipmentUsage',
    'groupConsumption',
    'trend',
    'equipmentRanking',
    'utilityRanking',
    'equipmentInventory',
    'approvals',
    'upcomingReservations',
    'recentEquipment',
    'recentUtilities',
    'reservations'
  ];
  if (reportArrayFields.some((field) => !Array.isArray(report[field]))) {
    throw new TypeError('MIS dashboard PDF is missing one or more report sections.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(23, 36, 59);
  doc.text('MIS Dashboard Report', PAGE_MARGIN, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 128, 154);
  doc.text(`Generated ${toText(report.generatedAt)}`, PAGE_MARGIN, 23);

  const totalUnits = report.groupConsumption.reduce(
    (total, group) => total + (Number(group.units) || 0),
    0
  );
  const totalEquipmentHours = report.equipmentUsage.reduce(
    (total, equipment) => total + (Number(equipment.hours) || 0),
    0
  );
  const dateRange = getDashboardPdfDateRange(report);
  let y = addTable(doc, {
    title: 'Current dashboard selections',
    headers: [
      'Date range',
      'Time range',
      'Reservation status',
      'Upcoming window',
      'Equipment ranking',
      'Utility ranking'
    ],
    rows: [[
      dateRange,
      report.timeRange,
      report.status,
      report.upcomingWindow,
      report.rankingModes.equipment,
      report.rankingModes.utilities
    ]],
    y: 29
  });
  y = addTable(doc, {
    title: 'Dashboard summary',
    headers: [
      'Reservations in range',
      'Approved',
      'Pending',
      'Approved equipment units',
      'Equipment units available',
      'Assigned approvals',
      'Pending users',
      'Pending profiles'
    ],
    rows: [[
      report.metrics.total,
      report.metrics.approved,
      report.metrics.pending,
      report.metrics.reservedUnits,
      report.metrics.availableUnits,
      report.metrics.pendingApprovals,
      report.metrics.pendingUsers,
      report.metrics.pendingProfiles
    ]],
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'MIS resource metrics',
    headers: [
      'Equipment types',
      'Reserved equipment-hours',
      'Approved equipment units',
      'Requestor groups'
    ],
    rows: [[
      report.equipmentUsage.length,
      formatNumber(totalEquipmentHours),
      totalUnits,
      report.groupConsumption.length
    ]],
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Resource snapshot',
    headers: [
      'Equipment catalog',
      'Utility catalog',
      'Available facilities',
      'Facilities in maintenance',
      'Unavailable facilities',
      'Registered users'
    ],
    rows: [[
      report.snapshot.equipmentCatalog,
      report.snapshot.utilitiesCatalog,
      report.snapshot.facilitiesAvailable,
      report.snapshot.facilitiesUnderMaintenance,
      report.snapshot.facilitiesUnavailable,
      report.snapshot.registeredUsers
    ]],
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Equipment inventory',
    headers: ['Equipment', 'Total units', 'Reserved units', 'Available units', 'Inventory status'],
    rows: report.equipmentInventory.map((equipment) => [
      equipment.name,
      equipment.total,
      equipment.reserved,
      equipment.available,
      equipment.status
    ]),
    y
  });
  y = addTable(doc, {
    title: 'Reservations awaiting approval',
    headers: ['Reference', 'Event', 'Requestor', 'Event date', 'Start time'],
    rows: report.approvals.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.date,
      reservation.time
    ]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: `Upcoming events (${report.upcomingWindow})`,
    headers: ['Reference', 'Event', 'Requestor', 'Event date', 'Start time', 'Status', 'Facilities'],
    rows: report.upcomingReservations.map((reservation) => [
      reservation.reference,
      reservation.event,
      reservation.requestor,
      reservation.date,
      reservation.time,
      reservation.status,
      reservation.facilities
    ]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Reservation activity',
    headers: ['Matching reservations', 'Approved reservations', 'Pending reservations'],
    rows: [[report.metrics.total, report.metrics.approved, report.metrics.pending]],
    y
  });
  y = addTable(doc, {
    title: 'Reservation activity by date',
    headers: ['Period', 'Reservations'],
    rows: report.trend.map((bucket) => [bucket.label, bucket.count]),
    y
  });
  y = addTable(doc, {
    title: 'Equipment usage hours',
    headers: ['Equipment', 'Reserved equipment-hours', 'Sessions'],
    rows: report.equipmentUsage.map((equipment) => [
      equipment.isOtherRequest ? `Other: ${equipment.name}` : equipment.name,
      formatNumber(equipment.hours),
      equipment.sessions.length
    ]),
    y
  });
  y = addTable(doc, {
    title: 'Equipment usage session details',
    headers: [
      'Equipment',
      'Session date',
      'Start time',
      'End time',
      'Quantity',
      'Hours per unit',
      'Session equipment-hours'
    ],
    rows: report.equipmentUsage.flatMap((equipment) => equipment.sessions.map((session) => [
      equipment.isOtherRequest ? `Other: ${equipment.name}` : equipment.name,
      session.date,
      session.startTime,
      session.endTime,
      session.quantity,
      formatNumber(session.durationHours),
      formatNumber(session.hours)
    ])),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Resource consumption by requestor group',
    headers: ['Requestor group', 'Approved equipment units', 'Share of total'],
    rows: report.groupConsumption.map((group) => [
      group.name,
      group.units,
      totalUnits ? `${formatNumber(group.units / totalUnits * 100)}%` : '0.0%'
    ]),
    y
  });
  y = addTable(doc, {
    title: `${report.rankingModes.equipment === 'most' ? 'Most' : 'Least'} requested equipment`,
    headers: ['Equipment', 'Approved units', 'Last used'],
    rows: report.equipmentRanking.map((equipment) => [
      equipment.name,
      equipment.quantity,
      equipment.lastUsed ? new Date(equipment.lastUsed).toLocaleDateString() : 'No approved use'
    ]),
    y
  });
  y = addTable(doc, {
    title: `${report.rankingModes.utilities === 'most' ? 'Most' : 'Least'} requested utilities`,
    headers: ['Utility', 'Approved units', 'Last used'],
    rows: report.utilityRanking.map((utility) => [
      utility.name,
      utility.quantity,
      utility.lastUsed ? new Date(utility.lastUsed).toLocaleDateString() : 'No approved use'
    ]),
    y
  });
  y = addTable(doc, {
    title: 'Recent approved equipment',
    headers: ['Equipment', 'SKU / source', 'Latest borrower', 'Date', 'Time', 'Quantity', 'Request details'],
    rows: report.recentEquipment.map((equipment) => [
      equipment.name,
      equipment.sku,
      equipment.latestBooking?.borrower || 'No recent booking',
      equipment.latestBooking?.date || '',
      equipment.latestBooking?.time || '',
      equipment.latestBooking?.quantity ?? '',
      equipment.latestBooking?.details || ''
    ]),
    y,
    fontSize: 7
  });
  y = addTable(doc, {
    title: 'Recent approved utilities',
    headers: ['Utility', 'SKU / source', 'Latest requestor', 'Date', 'Time', 'Quantity', 'Request details'],
    rows: report.recentUtilities.map((utility) => [
      utility.name,
      utility.sku,
      utility.latestBooking?.borrower || 'No recent booking',
      utility.latestBooking?.date || '',
      utility.latestBooking?.time || '',
      utility.latestBooking?.quantity ?? '',
      utility.latestBooking?.details || ''
    ]),
    y,
    fontSize: 7
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
    fontSize: 6.5
  });
  addTable(doc, {
    title: 'All matching reservations - facilities and requested resources',
    headers: [
      'Reference',
      'Facilities',
      'Equipment',
      'Utilities',
      'Other equipment',
      'Other utility',
      'Specific room',
      'Participants'
    ],
    rows: report.reservations.map((reservation) => [
      reservation.reference,
      reservation.facilities,
      reservation.equipment,
      reservation.utilities,
      reservation.otherEquipment,
      reservation.otherUtility,
      reservation.specificRoom,
      reservation.participants
    ]),
    y,
    fontSize: 6
  });

  addFooter(doc);
  doc.save(`MIS Dashboard - ${dateRange}.pdf`);
  return doc;
};
