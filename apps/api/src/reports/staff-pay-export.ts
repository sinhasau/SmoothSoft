import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

type StaffPayRow = {
  fullName: string;
  classification: string | null;
  compensationModel: string;
  clients: number;
  scheduledHours: number;
  services: number;
  products: number;
  refunds: number;
  netRevenue: number;
  commissionPct: number | null;
  commissionPay: number;
  basePay: number;
  boothRent: number;
  tipsPayable: number;
  estimatedPay: number | null;
  needsConfiguration: boolean;
};

export type StaffPayReport = {
  rows: StaffPayRow[];
  totals: Record<string, number>;
  period: { from: string; to: string; days: number };
  warnings: string[];
};

const currency = '$#,##0.00;[Red]($#,##0.00);-';

export async function buildStaffPayWorkbook(report: StaffPayReport, locationName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SmoothSoft';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet('Pay Summary', { views: [{ state: 'frozen', ySplit: 6 }] });
  summary.properties.defaultRowHeight = 19;
  summary.getCell('A1').value = 'Revenue by Staff — Pay Review';
  summary.getCell('A2').value = locationName;
  summary.getCell('A3').value = `Pay period: ${report.period.from} through ${report.period.to} (${report.period.days} days)`;
  summary.mergeCells('A1:N1');
  summary.mergeCells('A2:N2');
  summary.mergeCells('A3:N3');
  summary.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A2').font = { name: 'Aptos', size: 12, color: { argb: 'FFE2E8F0' } };
  summary.getCell('A3').font = { name: 'Aptos', size: 10, color: { argb: 'FFCBD5E1' } };
  for (let row = 1; row <= 3; row += 1) summary.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17202A' } };

  const headers = ['Staff', 'Class', 'Pay model', 'Clients', 'Scheduled hrs', 'Service sales', 'Retail sales', 'Refunds', 'Net revenue', 'Commission %', 'Base pay', 'Booth rent', 'Tips payable', 'Est. settlement'];
  summary.getRow(6).values = headers;
  summary.getRow(6).font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  summary.getRow(6).alignment = { vertical: 'middle' };
  summary.autoFilter = { from: 'A6', to: 'N6' };

  report.rows.forEach((row, index) => {
    const excelRow = summary.getRow(7 + index);
    excelRow.values = [row.fullName, row.classification?.toUpperCase() ?? '—', row.compensationModel.replaceAll('_', ' '), row.clients, row.scheduledHours, row.services, row.products, -row.refunds, row.netRevenue, row.commissionPct == null ? null : row.commissionPct / 100, row.basePay, -row.boothRent, row.tipsPayable, row.estimatedPay];
    if (index % 2 === 1) excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    if (row.needsConfiguration) excelRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  });

  const totalRowNumber = 7 + report.rows.length;
  const totalRow = summary.getRow(totalRowNumber);
  totalRow.getCell(1).value = 'TOTAL';
  for (const col of [4, 5, 6, 7, 8, 9, 11, 12, 13, 14]) {
    const letter = summary.getColumn(col).letter;
    totalRow.getCell(col).value = { formula: `SUM(${letter}7:${letter}${Math.max(7, totalRowNumber - 1)})` };
  }
  totalRow.font = { bold: true };
  totalRow.border = { top: { style: 'double', color: { argb: 'FF334155' } } };

  [6, 7, 8, 9, 11, 12, 13, 14].forEach((col) => { summary.getColumn(col).numFmt = currency; });
  summary.getColumn(10).numFmt = '0.0%';
  summary.getColumn(5).numFmt = '0.0';
  const widths = [24, 10, 18, 10, 14, 15, 14, 13, 15, 14, 16, 13, 15, 16];
  widths.forEach((width, index) => { summary.getColumn(index + 1).width = width; });
  summary.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

  const notes = workbook.addWorksheet('Notes & Controls');
  notes.columns = [{ width: 24 }, { width: 100 }];
  notes.addRow(['Report control', 'Value']);
  notes.addRow(['Location', locationName]);
  notes.addRow(['Period', `${report.period.from} to ${report.period.to}`]);
  notes.addRow(['Generated', new Date().toISOString()]);
  notes.addRow(['Model status', report.rows.some((row) => row.needsConfiguration) ? 'REVIEW — compensation configuration missing' : 'READY FOR MANAGEMENT REVIEW']);
  notes.addRow([]);
  notes.addRow(['Important limitations', null]);
  report.warnings.forEach((warning) => notes.addRow([null, warning]));
  notes.addRow([null, 'Estimated settlement is a management aid and is not a payroll, tax, or legal calculation. Negative values mean the staff member owes the shop.']);
  notes.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  notes.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  notes.getRow(7).font = { bold: true, color: { argb: 'FF92400E' } };
  notes.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  notes.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildStaffPayPdf(report: StaffPayReport, locationName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 34, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, 792, 86).fill('#17202A');
    doc.fillColor('#FFFFFF').fontSize(19).font('Helvetica-Bold').text('Revenue by Staff — Pay Review', 34, 24);
    doc.fillColor('#CBD5E1').fontSize(10).font('Helvetica').text(`${locationName}  •  ${report.period.from} through ${report.period.to}`, 34, 54);

    const columns = [
      { label: 'Staff', x: 34, width: 118, align: 'left' as const },
      { label: 'Model', x: 152, width: 72, align: 'left' as const },
      { label: 'Clients', x: 224, width: 42, align: 'right' as const },
      { label: 'Svc sales', x: 266, width: 66, align: 'right' as const },
      { label: 'Retail', x: 332, width: 58, align: 'right' as const },
      { label: 'Refunds', x: 390, width: 58, align: 'right' as const },
      { label: 'Net rev.', x: 448, width: 66, align: 'right' as const },
      { label: 'Base pay', x: 514, width: 70, align: 'right' as const },
      { label: 'Rent', x: 584, width: 54, align: 'right' as const },
      { label: 'Tips', x: 638, width: 54, align: 'right' as const },
      { label: 'Settlement', x: 692, width: 66, align: 'right' as const },
    ];
    const fmt = (value: number | null) => value == null ? 'Review' : value < 0 ? `($${Math.abs(value).toFixed(2)})` : `$${value.toFixed(2)}`;
    let y = 102;
    const drawHeader = () => {
      doc.rect(34, y - 5, 724, 22).fill('#334155');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
      columns.forEach((col) => doc.text(col.label, col.x + 3, y + 1, { width: col.width - 6, align: col.align }));
      y += 23;
    };
    drawHeader();
    report.rows.forEach((row, index) => {
      if (y > 500) { doc.addPage(); y = 42; drawHeader(); }
      if (index % 2 === 1) doc.rect(34, y - 4, 724, 20).fill('#F8FAFC');
      doc.fillColor('#1F2937').font('Helvetica').fontSize(7.5);
      const values = [row.fullName, row.compensationModel.replaceAll('_', ' '), String(row.clients), fmt(row.services), fmt(row.products), fmt(-row.refunds), fmt(row.netRevenue), fmt(row.basePay), fmt(-row.boothRent), fmt(row.tipsPayable), fmt(row.estimatedPay)];
      columns.forEach((col, i) => doc.text(values[i], col.x + 3, y, { width: col.width - 6, align: col.align, ellipsis: true }));
      y += 20;
    });
    doc.moveTo(34, y).lineTo(758, y).lineWidth(1.2).strokeColor('#334155').stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
    doc.text('TOTAL', 37, y, { width: 110 });
    doc.text(String(report.totals.clients ?? 0), 227, y, { width: 36, align: 'right' });
    doc.text(fmt(report.totals.services ?? 0), 269, y, { width: 60, align: 'right' });
    doc.text(fmt(report.totals.products ?? 0), 335, y, { width: 52, align: 'right' });
    doc.text(fmt(-(report.totals.refunds ?? 0)), 393, y, { width: 52, align: 'right' });
    doc.text(fmt(report.totals.netRevenue ?? 0), 451, y, { width: 60, align: 'right' });
    doc.text(fmt(report.totals.tips ?? 0), 641, y, { width: 48, align: 'right' });
    doc.text(fmt(report.totals.estimatedPay ?? 0), 695, y, { width: 60, align: 'right' });

    y += 32;
    doc.rect(34, y, 724, 54).fill('#FFF7ED');
    doc.fillColor('#92400E').font('Helvetica-Bold').fontSize(8).text('Review before paying', 44, y + 9);
    doc.font('Helvetica').fontSize(7.5).fillColor('#78350F').text(report.warnings.join('  •  ') + '  Estimates exclude taxes, withholding, benefits, and overtime.', 44, y + 23, { width: 704 });

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      doc.fillColor('#64748B').fontSize(7).text(`Generated ${new Date().toISOString()}  •  Page ${i + 1} of ${pages.count}`, 34, 568, { width: 724, align: 'right' });
    }
    doc.end();
  });
}
