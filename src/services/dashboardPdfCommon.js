import autoTable from 'jspdf-autotable';

// Shared layout helpers for the dashboard PDF reports (landscape A4, millimetres).
export const PAGE_MARGIN = 12;
export const FOOTER_MARGIN = 18;

export const toText = (value) => (value === null || value === undefined ? '' : String(value));

export const addSectionHeading = (doc, title, y) => {
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

export const addTable = (doc, { title, headers, rows, y, fontSize = 7, columnStyles = {} }) => {
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

export const drawTrendChart = (doc, trend, y) => {
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

export const addFooter = (doc, title) => {
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
    doc.text(title, PAGE_MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 7, { align: 'right' });
  }
};

// Report title and "Generated ..." line at the top of the first page; returns the next y position.
export const addReportTitle = (doc, title, generatedAt) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(23, 36, 59);
  doc.text(title, PAGE_MARGIN, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 128, 154);
  doc.text(`Generated ${toText(generatedAt)}`, PAGE_MARGIN, 23);
  return 29;
};
