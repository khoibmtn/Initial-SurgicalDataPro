import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { SurgeryRecord, ProcessingResult } from '../types';
import { AppConfig } from '../contexts/ConfigContext';

// ──────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────

const FONT_TIMES = 'Times New Roman';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const TYPE_LABELS: Record<string, string> = {
  PĐB: 'Phẫu thuật đặc biệt',
  P1: 'Phẫu thuật loại 1',
  P2: 'Phẫu thuật loại 2',
  P3: 'Phẫu thuật loại 3',
  TĐB: 'Thủ thuật đặc biệt',
  T1: 'Thủ thuật loại 1',
  T2: 'Thủ thuật loại 2',
  T3: 'Thủ thuật loại 3',
  TKPL: 'Thủ thuật Khác/KPL',
};

const TYPE_ORDER = ['PĐB', 'P1', 'P2', 'P3', 'TĐB', 'T1', 'T2', 'T3', 'TKPL'];

const GROUP_MAP: Record<string, string> = {
  PĐB: 'Phẫu thuật ĐB',
  P1: 'Phẫu thuật loại 1',
  P2: 'Phẫu thuật loại 2',
  P3: 'Phẫu thuật loại 3',
  TĐB: 'Thủ thuật ĐB',
  T1: 'Thủ thuật loại 1',
  T2: 'Thủ thuật loại 2',
  T3: 'Thủ thuật loại 3',
  TKPL: 'Thủ thuật KPL',
};

function formatDateVal(val: any): string {
  if (!val) return '';
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return typeof val === 'string' ? val : '';
    const dd = String(d.getDate()).padStart(2, '0');
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
  } catch {
    return typeof val === 'string' ? val : '';
  }
}

function countSurgeryTypes(records: SurgeryRecord[]): { loai: string; label: string; count: number }[] {
  const counts: Record<string, number> = {};
  records.forEach(r => {
    if (r.loaiPTTT) {
      counts[r.loaiPTTT] = (counts[r.loaiPTTT] || 0) + (r.soLuong || 1);
    }
  });
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0]);
      const ib = TYPE_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([loai, count]) => ({
      loai,
      label: TYPE_LABELS[loai] || loai,
      count,
    }));
}

function addReportHeader(
  ws: ExcelJS.Worksheet,
  title: string,
  dateRange: string,
  hospitalName: string,
  totalCols: number,
  startRow: number,
): number {
  let row = startRow;
  const lastCol = totalCols;

  // Left-side header merge span (first ~5 cols, matching print preview)
  const leftMergeEnd = Math.min(5, lastCol);

  // Row 1: SỞ Y TẾ HẢI PHÒNG — left-aligned, text centered within merge
  ws.mergeCells(row, 1, row, leftMergeEnd);
  const r1 = ws.getRow(row);
  r1.getCell(1).value = 'SỞ Y TẾ HẢI PHÒNG';
  r1.getCell(1).font = { name: FONT_TIMES, size: 11, bold: true };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row++;

  // Row 2: Hospital Name — left-aligned, text centered within merge
  ws.mergeCells(row, 1, row, leftMergeEnd);
  const r2 = ws.getRow(row);
  r2.getCell(1).value = hospitalName;
  r2.getCell(1).font = { name: FONT_TIMES, size: 11, bold: true };
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row++;

  // Row 3: empty spacer
  row++;

  // Row 4: Title
  ws.mergeCells(row, 1, row, lastCol);
  const r4 = ws.getRow(row);
  r4.getCell(1).value = title;
  r4.getCell(1).font = { name: FONT_TIMES, size: 14, bold: true };
  r4.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row++;

  // Row 5: Date range
  ws.mergeCells(row, 1, row, lastCol);
  const r5 = ws.getRow(row);
  r5.getCell(1).value = dateRange;
  r5.getCell(1).font = { name: FONT_TIMES, size: 11, italic: true };
  r5.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  row++;

  // Row 6: empty spacer
  row++;

  return row;
}

function addSignatures(
  ws: ExcelJS.Worksheet,
  startRow: number,
  totalCols: number,
  type: 'list' | 'payment',
  signatureDate?: Date,
) {
  let row = startRow;

  // Date line — use provided signatureDate or fallback to today
  const d = signatureDate || new Date();
  const dateStr = `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;

  const dateStartCol = Math.max(1, totalCols - 3);
  ws.mergeCells(row, dateStartCol, row, totalCols);
  const dateCell = ws.getRow(row).getCell(dateStartCol);
  dateCell.value = dateStr;
  dateCell.font = { name: FONT_TIMES, size: 11, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
  row++;

  // All signatories on ONE row, directly below the date line.
  // "Người lập" occupies the same column span as the date (rightmost cols).
  // Other titles split the remaining left-side columns evenly.
  const leftTitles = type === 'list'
    ? ['Giám đốc', 'KHTH', 'TCKT', 'Trưởng khoa']
    : ['Giám đốc', 'TCKT', 'Trưởng khoa'];

  const leftCols = dateStartCol - 1; // columns available for left titles
  const colsPerLeft = leftCols > 0 ? Math.floor(leftCols / leftTitles.length) : 0;

  const sigRow = ws.getRow(row);

  // Left-side titles
  leftTitles.forEach((name, idx) => {
    const sc = idx * colsPerLeft + 1;
    const ec = Math.min(sc + colsPerLeft - 1, leftCols);
    if (sc <= ec) {
      ws.mergeCells(row, sc, row, ec);
      const cell = sigRow.getCell(sc);
      cell.value = name.toUpperCase();
      cell.font = { name: FONT_TIMES, size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  // "Người lập" — same span as date line (rightmost cols)
  ws.mergeCells(row, dateStartCol, row, totalCols);
  const nlCell = sigRow.getCell(dateStartCol);
  nlCell.value = 'NGƯỜI LẬP';
  nlCell.font = { name: FONT_TIMES, size: 11, bold: true };
  nlCell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function addSurgeryStats(
  ws: ExcelJS.Worksheet,
  records: SurgeryRecord[],
  startRow: number,
): number {
  const stats = countSurgeryTypes(records);
  let row = startRow;

  stats.forEach(s => {
    const countStr = Number.isInteger(s.count) ? String(s.count) : s.count.toFixed(2);
    const cell = ws.getRow(row).getCell(1);
    cell.value = `${s.label}: ${countStr} ca`;
    cell.font = { name: FONT_TIMES, size: 12, bold: true };
    row++;
  });

  return row;
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────────
// 1) Export LIST (DS Phẫu thuật) — Formatted
// ──────────────────────────────────────────────────────────

interface ListExportColumn {
  key: string;
  label: string;
}

export async function exportListExcel(
  records: SurgeryRecord[],
  columns: ListExportColumn[],
  dateRange: string,
  hospitalName: string,
  existingWb?: ExcelJS.Workbook,
  signatureDate?: Date,
) {
  const wb = existingWb || new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DS Phẫu thuật', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  const totalCols = columns.length;

  // Header section
  let row = addReportHeader(ws, 'DANH SÁCH PHẪU THUẬT', dateRange, hospitalName, totalCols, 1);

  // Table Header
  const headerRow = ws.getRow(row);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.label;
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });
  headerRow.height = 24;
  row++;

  // Data rows
  records.forEach((rec, idx) => {
    const dataRow = ws.getRow(row);
    columns.forEach((col, cIdx) => {
      const cell = dataRow.getCell(cIdx + 1);
      let value: any = '';

      switch (col.key) {
        case 'stt': value = idx + 1; break;
        case 'ngayCD': value = formatDateVal(rec.ngayCD); break;
        case 'ngayBD': value = formatDateVal(rec.ngayBD); break;
        case 'ngayKT': value = formatDateVal(rec.ngayKT); break;
        case 'reason': {
          // We don't have config here, just leave empty — reason is computed in UI
          value = '';
          break;
        }
        default: value = (rec as any)[col.key] ?? '';
      }

      cell.value = value;
      cell.font = { name: FONT_TIMES, size: 10 };
      cell.border = thinBorder;

      // Alignment
      if (['stt', 'gender', 'yob', 'loaiPTTT', 'soLuong', 'timeMinutes'].includes(col.key)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    });
    row++;
  });

  // Surgery type stats (no extra spacer)
  row = addSurgeryStats(ws, records, row);

  // Signatures (directly after stats)
  addSignatures(ws, row, totalCols, 'list', signatureDate);

  // Auto-width columns
  columns.forEach((col, idx) => {
    const wsCol = ws.getColumn(idx + 1);
    switch (col.key) {
      case 'stt': wsCol.width = 5; break;
      case 'patientId': wsCol.width = 10; break;
      case 'patientName': wsCol.width = 22; break;
      case 'gender': wsCol.width = 5; break;
      case 'yob': wsCol.width = 8; break;
      case 'bhyt': wsCol.width = 15; break;
      case 'ngayCD': case 'ngayBD': case 'ngayKT': wsCol.width = 16; break;
      case 'tenKT': wsCol.width = 35; break;
      case 'loaiPTTT': wsCol.width = 6; break;
      case 'soLuong': wsCol.width = 6; break;
      case 'timeMinutes': wsCol.width = 6; break;
      case 'ptChinh': case 'ptPhu': case 'bsGM': case 'ktvGM': case 'tdc': case 'gv': wsCol.width = 16; break;
      case 'machine': wsCol.width = 22; break;
      case 'reason': wsCol.width = 10; break;
      default: wsCol.width = 12; break;
    }
  });

  if (!existingWb) {
    const filename = `DS_Phau_thuat_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
}

// ──────────────────────────────────────────────────────────
// 2) Export PAYMENT (Bảng Thanh toán) — Formatted
// ──────────────────────────────────────────────────────────

interface PaymentGroup {
  name: string;
  label: string;
  subCols: string[];
}

interface PaymentRow {
  stt: number;
  department: string;
  taxId: string;
  name: string;
  values: Record<string, number>;
  totalQty?: number;
  total_qty?: number;
  total_amount?: string;
  isNewDept?: boolean;
}

export async function exportPaymentExcel(
  enrichedRows: PaymentRow[],
  groups: PaymentGroup[],
  cols: string[],
  footerTotals: { total_qty: number; total_amount_val: number },
  columnTotals: Record<string, number>,
  priceConfig: Record<string, Record<string, number>>,
  records: SurgeryRecord[],
  dateRange: string,
  hospitalName: string,
  existingWb?: ExcelJS.Workbook,
  signatureDate?: Date,
) {
  const wb = existingWb || new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bảng Thanh toán', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Fixed columns: STT, Khoa, MST, Họ tên
  const fixedColCount = 4;
  // Dynamic: each col in cols[]
  // Trailing: Tổng số, Thành tiền
  const trailColCount = 2;
  const totalCols = fixedColCount + cols.length + trailColCount;

  // Header section
  let row = addReportHeader(ws, 'BẢNG THANH TOÁN PHẪU THUẬT, THỦ THUẬT', dateRange, hospitalName, totalCols, 1);

  // ── Two-level table header ──

  const headerRow1 = row;
  const headerRow2 = row + 1;

  // Fixed columns (span 2 rows)
  const fixedHeaders = ['STT', 'Khoa', 'Mã số thuế', 'Họ tên'];
  fixedHeaders.forEach((label, idx) => {
    ws.mergeCells(headerRow1, idx + 1, headerRow2, idx + 1);
    const cell = ws.getRow(headerRow1).getCell(idx + 1);
    cell.value = label;
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    // Also set border on row2 merged cell
    ws.getRow(headerRow2).getCell(idx + 1).border = thinBorder;
  });

  // Group headers (row 1) + Sub-col headers (row 2)
  let colIdx = fixedColCount + 1; // 1-indexed, starts after fixed
  groups.forEach(grp => {
    const startCol = colIdx;
    const endCol = colIdx + grp.subCols.length - 1;

    // Row 1: Group header (merge across subCols)
    if (grp.subCols.length > 1) {
      ws.mergeCells(headerRow1, startCol, headerRow1, endCol);
    }
    const groupCell = ws.getRow(headerRow1).getCell(startCol);
    groupCell.value = grp.label;
    groupCell.font = { name: FONT_TIMES, size: 10, bold: true };
    groupCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    groupCell.border = thinBorder;
    groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

    // Set border for all cells in merged range row1
    for (let c = startCol; c <= endCol; c++) {
      ws.getRow(headerRow1).getCell(c).border = thinBorder;
    }

    // Row 2: Sub-column headers
    grp.subCols.forEach((role, sIdx) => {
      const cell = ws.getRow(headerRow2).getCell(startCol + sIdx);
      cell.value = role;
      cell.font = { name: FONT_TIMES, size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    });

    colIdx = endCol + 1;
  });

  // Trailing columns (span 2 rows)
  const trailHeaders = ['Tổng số', 'Thành tiền'];
  trailHeaders.forEach((label, idx) => {
    const c = colIdx + idx;
    ws.mergeCells(headerRow1, c, headerRow2, c);
    const cell = ws.getRow(headerRow1).getCell(c);
    cell.value = label;
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    ws.getRow(headerRow2).getCell(c).border = thinBorder;
  });

  row = headerRow2 + 1;

  // ── Unit price row (italic) ──
  const priceRow = ws.getRow(row);
  // Empty cells for fixed cols
  for (let i = 1; i <= fixedColCount; i++) {
    priceRow.getCell(i).border = thinBorder;
  }
  // "Đơn giá" label in "Họ tên" col
  priceRow.getCell(4).value = 'Đơn giá';
  priceRow.getCell(4).font = { name: FONT_TIMES, size: 10, italic: true, bold: true };
  priceRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };

  cols.forEach((col, idx) => {
    const [loai, role] = col.split('-');
    let configRole = 'Giúp việc';
    if (role === 'Chính') configRole = 'Chính';
    else if (role === 'Phụ') configRole = 'Phụ';
    else if (role === 'Giúp việc') configRole = 'Giúp việc';
    const price = priceConfig[loai]?.[configRole] || 0;
    const cell = priceRow.getCell(fixedColCount + idx + 1);
    cell.value = price > 0 ? price : '';
    cell.font = { name: FONT_TIMES, size: 10, italic: true };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = thinBorder;
    if (price > 0) {
      cell.numFmt = '#,##0';
    }
  });
  // Empty trailing cols
  priceRow.getCell(fixedColCount + cols.length + 1).border = thinBorder;
  priceRow.getCell(fixedColCount + cols.length + 2).border = thinBorder;
  const priceRowNum = row; // track for SUMPRODUCT formulas
  row++;
  const firstDataRowNum = row; // track for footer SUM

  // Helper to convert 0-based column index to Excel column letter (e.g. 0->A, 25->Z, 26->AA)
  const getColLetter = (idx: number): string => {
    if (idx < 26) return String.fromCharCode(65 + idx);
    return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
  };

  // ── Data rows ──
  enrichedRows.forEach((pRow) => {
    const dataRow = ws.getRow(row);

    // Fixed cells
    dataRow.getCell(1).value = pRow.stt;
    dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(2).value = pRow.department;
    dataRow.getCell(3).value = pRow.taxId;
    dataRow.getCell(4).value = pRow.name;

    for (let i = 1; i <= fixedColCount; i++) {
      dataRow.getCell(i).font = { name: FONT_TIMES, size: 10 };
      dataRow.getCell(i).border = thinBorder;
      dataRow.getCell(i).alignment = { ...dataRow.getCell(i).alignment, vertical: 'middle' };
    }

    // Value cells
    cols.forEach((col, idx) => {
      const val = pRow.values[col] || 0;
      const cell = dataRow.getCell(fixedColCount + idx + 1);
      cell.value = val > 0 ? val : '';
      cell.font = { name: FONT_TIMES, size: 10 };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // Total qty
    const tqtyCell = dataRow.getCell(fixedColCount + cols.length + 1);
    tqtyCell.value = pRow.total_qty || pRow.totalQty || 0;
    tqtyCell.font = { name: FONT_TIMES, size: 10, bold: true };
    tqtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tqtyCell.border = thinBorder;

    // Total amount — SUMPRODUCT formula (qty * price)
    const tamtCell = dataRow.getCell(fixedColCount + cols.length + 2);
    const fCol = getColLetter(fixedColCount);
    const lCol = getColLetter(fixedColCount + cols.length - 1);
    tamtCell.value = { formula: `SUMPRODUCT(${fCol}${row}:${lCol}${row},${fCol}${priceRowNum}:${lCol}${priceRowNum})` };
    tamtCell.font = { name: FONT_TIMES, size: 10, bold: true };
    tamtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    tamtCell.border = thinBorder;
    tamtCell.numFmt = '#,##0';

    // Department separator — thicker bottom border
    if (pRow.isNewDept) {
      for (let i = 1; i <= totalCols; i++) {
        const c = dataRow.getCell(i);
        c.border = {
          ...thinBorder,
          top: { style: 'medium' },
        };
      }
    }

    row++;
  });

  // ── Footer totals row ──
  const footRow = ws.getRow(row);
  for (let i = 1; i <= 3; i++) {
    footRow.getCell(i).border = thinBorder;
  }
  footRow.getCell(4).value = 'TỔNG CỘNG';
  footRow.getCell(4).font = { name: FONT_TIMES, size: 11, bold: true };
  footRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
  footRow.getCell(4).border = thinBorder;

  cols.forEach((col, idx) => {
    const cell = footRow.getCell(fixedColCount + idx + 1);
    const val = columnTotals[col] || 0;
    cell.value = val > 0 ? val : '';
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });

  const fTqtyCell = footRow.getCell(fixedColCount + cols.length + 1);
  fTqtyCell.value = footerTotals.total_qty;
  fTqtyCell.font = { name: FONT_TIMES, size: 10, bold: true };
  fTqtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  fTqtyCell.border = thinBorder;

  const fTamtCell = footRow.getCell(fixedColCount + cols.length + 2);
  const amtColLetter = getColLetter(fixedColCount + cols.length + 1);
  fTamtCell.value = { formula: `SUM(${amtColLetter}${firstDataRowNum}:${amtColLetter}${row - 1})` };
  fTamtCell.font = { name: FONT_TIMES, size: 10, bold: true };
  fTamtCell.alignment = { horizontal: 'right', vertical: 'middle' };
  fTamtCell.border = thinBorder;
  fTamtCell.numFmt = '#,##0';
  row++;

  // Surgery type stats (no extra spacer)
  row = addSurgeryStats(ws, records, row);

  // Signatures (directly after stats)
  addSignatures(ws, row, totalCols, 'payment', signatureDate);

  // Auto-width columns
  ws.getColumn(1).width = 5;  // STT
  ws.getColumn(2).width = 10; // Khoa
  ws.getColumn(3).width = 14; // MST
  ws.getColumn(4).width = 22; // Họ tên
  for (let i = 0; i < cols.length; i++) {
    ws.getColumn(fixedColCount + i + 1).width = 6;
  }
  ws.getColumn(fixedColCount + cols.length + 1).width = 7;  // Tổng số
  ws.getColumn(fixedColCount + cols.length + 2).width = 14; // Thành tiền

  if (!existingWb) {
    const filename = `Bang_thanh_toan_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
}

// ──────────────────────────────────────────────────────────
// 3) Combined Export — All sheets, DS PT + Bảng TT formatted
// ──────────────────────────────────────────────────────────

function copySheetJSToExcelJS(
  rawWb: XLSX.WorkBook,
  sheetName: string,
  excelWb: ExcelJS.Workbook,
  targetName: string,
) {
  const rawSheet = rawWb.Sheets[sheetName];
  if (!rawSheet) return;

  const ws = excelWb.addWorksheet(targetName);
  const data: any[][] = XLSX.utils.sheet_to_json(rawSheet, { header: 1, defval: '' });

  data.forEach((rowData, rIdx) => {
    const excelRow = ws.getRow(rIdx + 1);
    rowData.forEach((cellVal: any, cIdx: number) => {
      excelRow.getCell(cIdx + 1).value = cellVal;
    });
  });
}

export async function exportFormattedFullExcel(
  rawResult: ProcessingResult,
  config: AppConfig,
  listColumns: { key: string; label: string }[],
  paymentPrepared: {
    enrichedRows: PaymentRow[];
    groups: PaymentGroup[];
    cols: string[];
    footerTotals: { total_qty: number; total_amount_val: number };
    columnTotals: Record<string, number>;
  } | null,
  signatureDate?: Date,
) {
  const wb = new ExcelJS.Workbook();
  const records = rawResult.validRecords;
  const dateRange = rawResult.dateRangeText || '';
  const hospitalName = config.hospitalName || 'Trung tâm Y tế Thủy Nguyên';

  // 1. Formatted DS Phẫu thuật sheet
  await exportListExcel(records, listColumns, dateRange, hospitalName, wb, signatureDate);

  // 2. Copy raw non-formatted sheets from SheetJS workbook
  const rawWb = rawResult.wb;
  if (rawWb) {
    const formattedSheets = ['BANG_KET_QUA', 'BANG_THANH_TOAN'];
    rawWb.SheetNames.forEach((name: string) => {
      if (!formattedSheets.includes(name)) {
        copySheetJSToExcelJS(rawWb, name, wb, name);
      }
    });
  }

  // 3. Formatted Bảng Thanh toán sheet
  if (paymentPrepared) {
    const { enrichedRows, groups, cols, footerTotals, columnTotals } = paymentPrepared;
    await exportPaymentExcel(
      enrichedRows, groups, cols, footerTotals, columnTotals,
      config.priceConfig as unknown as Record<string, Record<string, number>>, records, dateRange, hospitalName, wb, signatureDate,
    );
  }

  // Save combined workbook
  const filename = `Ket_qua_dinh_dang_${new Date().toISOString().split('T')[0]}.xlsx`;
  await saveWorkbook(wb, filename);
}
