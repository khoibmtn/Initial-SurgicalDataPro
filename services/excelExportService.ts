import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
  SurgeryRecord,
  ProcessingResult,
  LaborAllowanceItem,
  OvertimeRecordRow,
  DutyScheduleDateConfig,
  StaffMember,
} from '../types';
import { AppConfig } from '../contexts/ConfigContext';
import { getAllowanceForRecord } from './laborConfigService';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
  PositionCatalogItem,
  ServicePackageModuleConfig,
  DEFAULT_MODULE_CONFIG,
  calcNetPositionAmount,
  formatDeductionValue,
} from '../types/servicePackage';
import { buildPackagePaymentRows, filterPackageRows, getUsedPackages } from './packagePaymentRows';
import { calculateOvertimeRows, getScheduleForDate } from './overtimeCalculationService';
import {
  formatDateKey,
  formatDisplayDate,
  getDayOfWeekLabel,
  getDutyDateKey,
  isWeekend,
} from './dutyScheduleService';

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
  allowanceItems?: LaborAllowanceItem[],
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

  const repDate = records[0]?.ngayBD || records[0]?.start || '';
  cols.forEach((col, idx) => {
    const [loai, role] = col.split('-');
    let configRole = 'Giúp việc';
    if (role === 'Chính') configRole = 'Chính';
    else if (role === 'Phụ') configRole = 'Phụ';
    else if (role === 'Giúp việc') configRole = 'Giúp việc';
    let price = 0;
    if (allowanceItems && allowanceItems.length > 0) {
      const allow = getAllowanceForRecord(loai, repDate, allowanceItems, priceConfig as any);
      price = (allow as any)[configRole] || 0;
    } else {
      price = priceConfig[loai]?.[configRole] || 0;
    }
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

export interface ExtraFullExcelExportData {
  dutySchedules?: Record<string, DutyScheduleDateConfig>;
  packageAssignments?: ServicePackageAssignment[];
  packageDefinitions?: ServicePackageDefinition[];
  positionCatalog?: PositionCatalogItem[];
  packageModuleConfig?: ServicePackageModuleConfig;
  packageSearchTerm?: string;
  packageSubtitle?: string;
  includeGV?: boolean;
  /** Nếu false thì chỉ trả về workbook (phục vụ unit test), mặc định true sẽ tải file về máy */
  saveFile?: boolean;
}

/**
 * 2b) Xuất Bảng Thanh Toán Gói Dịch Vụ (Theo Số lượng hoặc Theo Số tiền)
 */
export async function exportPackagePaymentExcel(
  assignments: ServicePackageAssignment[],
  packages: ServicePackageDefinition[],
  staffList: StaffMember[],
  positionCatalog: PositionCatalogItem[],
  departments: string[],
  dateRange: string,
  hospitalName: string,
  mode: 'count' | 'amount',
  existingWb?: ExcelJS.Workbook,
  signatureDate?: Date,
  packageModuleConfig?: ServicePackageModuleConfig,
  searchTerm: string = '',
): Promise<ExcelJS.Workbook> {
  const wb = existingWb || new ExcelJS.Workbook();
  const sheetName = mode === 'count' ? 'TT Gói DV (Số lượng)' : 'TT Gói DV (Số tiền)';
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  const usedPkgs = getUsedPackages(assignments, packages);
  const activePkgs = (usedPkgs.length > 0 ? usedPkgs : packages).filter(
    (p) => Array.isArray(p.positions) && p.positions.length > 0,
  );
  const allRows = buildPackagePaymentRows(assignments, packages, staffList, positionCatalog, departments);
  const rows = filterPackageRows(allRows, searchTerm, packages);

  const flatPositions: {
    packageId: string;
    packageName: string;
    positionKey: string;
    positionLabel: string;
    amount: number;
    netAmount: number;
  }[] = [];

  activePkgs.forEach((pkg) => {
    pkg.positions.forEach((pos) => {
      flatPositions.push({
        packageId: pkg.id,
        packageName: pkg.name,
        positionKey: pos.positionKey,
        positionLabel: pos.positionLabel,
        amount: pos.amount,
        netAmount: calcNetPositionAmount(pos.amount, pkg.deduction),
      });
    });
  });

  const fixedHeaders = ['STT', 'Khoa', 'Mã số thuế', 'Họ tên'];
  const fixedColCount = fixedHeaders.length;
  const totalCols = fixedColCount + flatPositions.length + 2; // + Tổng SL, Thành tiền

  const baseTitle =
    packageModuleConfig?.printTitle ||
    DEFAULT_MODULE_CONFIG.printTitle ||
    'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU';
  const title =
    mode === 'count'
      ? `${baseTitle.toUpperCase()} (THEO SỐ LƯỢNG)`
      : `${baseTitle.toUpperCase()} (THEO SỐ TIỀN)`;

  let row = addReportHeader(ws, title, dateRange, hospitalName, Math.max(totalCols, 6), 1);

  // ── Two-level table header ──
  const headerRow1 = row;
  const headerRow2 = row + 1;

  fixedHeaders.forEach((label, idx) => {
    ws.mergeCells(headerRow1, idx + 1, headerRow2, idx + 1);
    const cell = ws.getRow(headerRow1).getCell(idx + 1);
    cell.value = label;
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    ws.getRow(headerRow2).getCell(idx + 1).border = thinBorder;
  });

  let colIdx = fixedColCount + 1;
  activePkgs.forEach((pkg) => {
    const startCol = colIdx;
    const endCol = colIdx + pkg.positions.length - 1;

    if (pkg.positions.length > 1) {
      ws.mergeCells(headerRow1, startCol, headerRow1, endCol);
    }
    const groupCell = ws.getRow(headerRow1).getCell(startCol);
    groupCell.value = pkg.name;
    groupCell.font = { name: FONT_TIMES, size: 10, bold: true, color: { argb: 'FF115E59' } };
    groupCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4F1' } };

    for (let c = startCol; c <= endCol; c++) {
      ws.getRow(headerRow1).getCell(c).border = thinBorder;
    }

    pkg.positions.forEach((pos, sIdx) => {
      const cell = ws.getRow(headerRow2).getCell(startCol + sIdx);
      cell.value = pos.positionLabel;
      cell.font = { name: FONT_TIMES, size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    });

    colIdx = endCol + 1;
  });

  const trailHeaders = ['Tổng SL', 'Thành tiền'];
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

  ws.getRow(headerRow1).height = 24;
  ws.getRow(headerRow2).height = 22;
  row = headerRow2 + 1;

  // ── Unit price row (Đơn giá thực lĩnh) ──
  const priceRow = ws.getRow(row);
  for (let i = 1; i <= fixedColCount; i++) {
    priceRow.getCell(i).border = thinBorder;
  }
  priceRow.getCell(4).value = 'Đơn giá thực lĩnh';
  priceRow.getCell(4).font = { name: FONT_TIMES, size: 9, italic: true, bold: true };
  priceRow.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };

  flatPositions.forEach((fp, idx) => {
    const cell = priceRow.getCell(fixedColCount + idx + 1);
    cell.value = fp.netAmount > 0 ? fp.netAmount : '';
    cell.font = { name: FONT_TIMES, size: 9, italic: true };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = thinBorder;
    if (fp.netAmount > 0) {
      cell.numFmt = '#,##0';
    }
  });
  priceRow.getCell(fixedColCount + flatPositions.length + 1).border = thinBorder;
  priceRow.getCell(fixedColCount + flatPositions.length + 2).border = thinBorder;
  row++;

  // ── Data rows ──
  let prevDept = '';
  rows.forEach((pRow, rIdx) => {
    const dataRow = ws.getRow(row);
    const currDept = pRow.isUnassigned ? '__UNASSIGNED__' : pRow.department || '';
    const isNewDept = rIdx > 0 && currDept !== prevDept;
    prevDept = currDept;

    dataRow.getCell(1).value = rIdx + 1;
    dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(2).value = pRow.isUnassigned ? 'Chưa gán NV' : pRow.department || '';
    dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    dataRow.getCell(3).value = pRow.taxId || '';
    dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(4).value = pRow.staffName;
    dataRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

    for (let i = 1; i <= fixedColCount; i++) {
      dataRow.getCell(i).font = {
        name: FONT_TIMES,
        size: 10,
        italic: pRow.isUnassigned,
      };
      dataRow.getCell(i).border = thinBorder;
      if (pRow.isUnassigned) {
        dataRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      }
    }

    flatPositions.forEach((fp, idx) => {
      const cellData = pRow.cells[fp.packageId]?.[fp.positionKey];
      const val = cellData ? (mode === 'count' ? cellData.count : cellData.amount) : 0;
      const cell = dataRow.getCell(fixedColCount + idx + 1);
      cell.value = val > 0 ? val : '';
      cell.font = { name: FONT_TIMES, size: 10 };
      cell.alignment = {
        horizontal: mode === 'count' ? 'center' : 'right',
        vertical: 'middle',
      };
      cell.border = thinBorder;
      if (mode === 'amount' && val > 0) {
        cell.numFmt = '#,##0';
      }
      if (pRow.isUnassigned) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      }
    });

    const tqtyCell = dataRow.getCell(fixedColCount + flatPositions.length + 1);
    tqtyCell.value = pRow.totalCount;
    tqtyCell.font = { name: FONT_TIMES, size: 10, bold: true };
    tqtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tqtyCell.border = thinBorder;

    const tamtCell = dataRow.getCell(fixedColCount + flatPositions.length + 2);
    tamtCell.value = pRow.total;
    tamtCell.font = { name: FONT_TIMES, size: 10, bold: true };
    tamtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    tamtCell.border = thinBorder;
    tamtCell.numFmt = '#,##0';

    if (isNewDept) {
      for (let i = 1; i <= totalCols; i++) {
        dataRow.getCell(i).border = {
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

  flatPositions.forEach((fp, idx) => {
    const colSum = rows.reduce((sum, r) => {
      const c = r.cells[fp.packageId]?.[fp.positionKey];
      return sum + (c ? (mode === 'count' ? c.count : c.amount) : 0);
    }, 0);
    const cell = footRow.getCell(fixedColCount + idx + 1);
    cell.value = colSum > 0 ? colSum : '';
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = {
      horizontal: mode === 'count' ? 'center' : 'right',
      vertical: 'middle',
    };
    cell.border = thinBorder;
    if (mode === 'amount' && colSum > 0) {
      cell.numFmt = '#,##0';
    }
  });

  const grandCount = rows.reduce((sum, r) => sum + r.totalCount, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const fTqtyCell = footRow.getCell(fixedColCount + flatPositions.length + 1);
  fTqtyCell.value = grandCount;
  fTqtyCell.font = { name: FONT_TIMES, size: 10, bold: true };
  fTqtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  fTqtyCell.border = thinBorder;

  const fTamtCell = footRow.getCell(fixedColCount + flatPositions.length + 2);
  fTamtCell.value = grandTotal;
  fTamtCell.font = { name: FONT_TIMES, size: 10, bold: true };
  fTamtCell.alignment = { horizontal: 'right', vertical: 'middle' };
  fTamtCell.border = thinBorder;
  fTamtCell.numFmt = '#,##0';
  row++;

  // ── Deduction notes (if any) ──
  const deductionPkgs = activePkgs.filter((p) => p.deduction && p.deduction.value > 0);
  deductionPkgs.forEach((p) => {
    ws.mergeCells(row, 1, row, Math.max(totalCols, 6));
    const noteCell = ws.getRow(row).getCell(1);
    noteCell.value = `* ${p.shortName || p.name}: thực lĩnh đã trừ khấu trừ ${formatDeductionValue(p.deduction)}/vị trí${p.deduction?.note ? ` — ${p.deduction.note}` : ''}`;
    noteCell.font = { name: FONT_TIMES, size: 9, italic: true };
    noteCell.alignment = { horizontal: 'left', vertical: 'middle' };
    row++;
  });

  row++;
  addSignatures(ws, row, Math.max(totalCols, 6), 'payment', signatureDate);

  // Column widths
  ws.getColumn(1).width = 5;  // STT
  ws.getColumn(2).width = 12; // Khoa
  ws.getColumn(3).width = 14; // MST
  ws.getColumn(4).width = 22; // Họ tên
  for (let i = 0; i < flatPositions.length; i++) {
    ws.getColumn(fixedColCount + i + 1).width = mode === 'amount' ? 12 : 8;
  }
  ws.getColumn(fixedColCount + flatPositions.length + 1).width = 9;  // Tổng SL
  ws.getColumn(fixedColCount + flatPositions.length + 2).width = 15; // Thành tiền

  if (!existingWb) {
    const suffix = mode === 'count' ? 'so_luong' : 'so_tien';
    const filename = `Bang_thanh_toan_goi_dich_vu_${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
  return wb;
}

/**
 * 2b-summary) Xuất Bảng Thanh Toán Gói Dịch Vụ Rút Gọn (mỗi gói DV chỉ gồm 2 cột: Số lượng & Thành tiền,
 * cột Tổng cộng gồm 2 cột: Số lượng & Tổng tiền)
 */
export async function exportPackagePaymentSummaryExcel(
  assignments: ServicePackageAssignment[],
  packages: ServicePackageDefinition[],
  staffList: StaffMember[],
  positionCatalog: PositionCatalogItem[],
  departments: string[],
  dateRange: string,
  hospitalName: string = 'BỆNH VIỆN',
  existingWb?: ExcelJS.Workbook,
  signatureDate?: Date,
  packageModuleConfig?: ServicePackageModuleConfig,
  searchTerm: string = '',
): Promise<ExcelJS.Workbook> {
  const wb = existingWb || new ExcelJS.Workbook();
  const sheetName = 'TT Gói DV (Rút gọn)';
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  const usedPkgs = getUsedPackages(assignments, packages);
  const activePkgs = (usedPkgs.length > 0 ? usedPkgs : packages).filter(
    (p) => Array.isArray(p.positions) && p.positions.length > 0,
  );
  const allRows = buildPackagePaymentRows(assignments, packages, staffList, positionCatalog, departments);
  const rows = filterPackageRows(allRows, searchTerm, packages);

  const fixedHeaders = ['STT', 'Khoa', 'Mã số thuế', 'Họ tên'];
  const fixedColCount = fixedHeaders.length;
  // Mỗi gói DV có 2 cột (Số lượng, Thành tiền) + 2 cột Tổng (Số lượng, Tổng tiền)
  const totalCols = fixedColCount + activePkgs.length * 2 + 2;

  const baseTitle =
    packageModuleConfig?.printTitle ||
    DEFAULT_MODULE_CONFIG.printTitle ||
    'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU';
  const title = `${baseTitle.toUpperCase()} (RÚT GỌN)`;

  let row = addReportHeader(ws, title, dateRange, hospitalName, Math.max(totalCols, 6), 1);

  // ── Two-level table header ──
  const headerRow1 = row;
  const headerRow2 = row + 1;

  fixedHeaders.forEach((label, idx) => {
    ws.mergeCells(headerRow1, idx + 1, headerRow2, idx + 1);
    const cell = ws.getRow(headerRow1).getCell(idx + 1);
    cell.value = label;
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    ws.getRow(headerRow2).getCell(idx + 1).border = thinBorder;
  });

  let colIdx = fixedColCount + 1;
  activePkgs.forEach((pkg) => {
    const startCol = colIdx;
    const endCol = colIdx + 1;

    ws.mergeCells(headerRow1, startCol, headerRow1, endCol);
    const groupCell = ws.getRow(headerRow1).getCell(startCol);
    groupCell.value = pkg.name;
    groupCell.font = { name: FONT_TIMES, size: 10, bold: true, color: { argb: 'FF115E59' } };
    groupCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4F1' } };

    ws.getRow(headerRow1).getCell(startCol).border = thinBorder;
    ws.getRow(headerRow1).getCell(endCol).border = thinBorder;

    const subLabels = ['Số lượng', 'Thành tiền'];
    subLabels.forEach((lbl, sIdx) => {
      const cell = ws.getRow(headerRow2).getCell(startCol + sIdx);
      cell.value = lbl;
      cell.font = { name: FONT_TIMES, size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    });

    colIdx += 2;
  });

  // Cột Tổng cộng (2 cột: Số lượng, Tổng tiền)
  const totalStartCol = colIdx;
  const totalEndCol = colIdx + 1;
  ws.mergeCells(headerRow1, totalStartCol, headerRow1, totalEndCol);
  const totalGroupCell = ws.getRow(headerRow1).getCell(totalStartCol);
  totalGroupCell.value = 'Tổng cộng';
  totalGroupCell.font = { name: FONT_TIMES, size: 10, bold: true };
  totalGroupCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  totalGroupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  ws.getRow(headerRow1).getCell(totalStartCol).border = thinBorder;
  ws.getRow(headerRow1).getCell(totalEndCol).border = thinBorder;

  ['Số lượng', 'Tổng tiền'].forEach((lbl, idx) => {
    const cell = ws.getRow(headerRow2).getCell(totalStartCol + idx);
    cell.value = lbl;
    cell.font = { name: FONT_TIMES, size: 9, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });

  ws.getRow(headerRow1).height = 28;
  ws.getRow(headerRow2).height = 20;
  row = headerRow2 + 1;

  // ── Data rows ──
  let prevDept = '';
  rows.forEach((pRow, rIdx) => {
    const dataRow = ws.getRow(row);
    const currDept = pRow.isUnassigned ? '__UNASSIGNED__' : pRow.department || '';
    const isNewDept = rIdx > 0 && currDept !== prevDept;
    prevDept = currDept;

    dataRow.getCell(1).value = rIdx + 1;
    dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(2).value = pRow.isUnassigned ? 'Chưa gán NV' : pRow.department || '';
    dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    dataRow.getCell(3).value = pRow.taxId || '';
    dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(4).value = pRow.staffName;
    dataRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    for (let i = 1; i <= fixedColCount; i++) {
      dataRow.getCell(i).font = {
        name: FONT_TIMES,
        size: 10,
        italic: pRow.isUnassigned,
      };
      dataRow.getCell(i).border = thinBorder;
      if (pRow.isUnassigned) {
        dataRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      }
    }

    activePkgs.forEach((pkg, pIdx) => {
      const pkgCells = pRow.cells[pkg.id] || {};
      let pkgCount = 0;
      let pkgAmount = 0;
      Object.values(pkgCells).forEach((c) => {
        pkgCount += c.count || 0;
        pkgAmount += c.amount || 0;
      });

      const countCol = fixedColCount + pIdx * 2 + 1;
      const amtCol = fixedColCount + pIdx * 2 + 2;

      const countCell = dataRow.getCell(countCol);
      countCell.value = pkgCount > 0 ? pkgCount : '';
      countCell.font = { name: FONT_TIMES, size: 10 };
      countCell.alignment = { horizontal: 'center', vertical: 'middle' };
      countCell.border = thinBorder;

      const amtCell = dataRow.getCell(amtCol);
      amtCell.value = pkgAmount > 0 ? pkgAmount : '';
      amtCell.font = { name: FONT_TIMES, size: 10 };
      amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
      amtCell.border = thinBorder;
      if (pkgAmount > 0) {
        amtCell.numFmt = '#,##0';
      }

      if (pRow.isUnassigned) {
        countCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        amtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      }
    });

    const tqtyCell = dataRow.getCell(totalStartCol);
    tqtyCell.value = pRow.totalCount;
    tqtyCell.font = { name: FONT_TIMES, size: 10, bold: true };
    tqtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tqtyCell.border = thinBorder;

    const tamtCell = dataRow.getCell(totalEndCol);
    tamtCell.value = pRow.total;
    tamtCell.font = { name: FONT_TIMES, size: 10, bold: true };
    tamtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    tamtCell.border = thinBorder;
    tamtCell.numFmt = '#,##0';

    if (isNewDept) {
      for (let i = 1; i <= totalCols; i++) {
        dataRow.getCell(i).border = {
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

  activePkgs.forEach((pkg, pIdx) => {
    let pkgCountSum = 0;
    let pkgAmtSum = 0;
    rows.forEach((r) => {
      const pkgCells = r.cells[pkg.id] || {};
      Object.values(pkgCells).forEach((c) => {
        pkgCountSum += c.count || 0;
        pkgAmtSum += c.amount || 0;
      });
    });

    const countCol = fixedColCount + pIdx * 2 + 1;
    const amtCol = fixedColCount + pIdx * 2 + 2;

    const fCountCell = footRow.getCell(countCol);
    fCountCell.value = pkgCountSum > 0 ? pkgCountSum : '';
    fCountCell.font = { name: FONT_TIMES, size: 10, bold: true };
    fCountCell.alignment = { horizontal: 'center', vertical: 'middle' };
    fCountCell.border = thinBorder;

    const fAmtCell = footRow.getCell(amtCol);
    fAmtCell.value = pkgAmtSum > 0 ? pkgAmtSum : '';
    fAmtCell.font = { name: FONT_TIMES, size: 10, bold: true };
    fAmtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    fAmtCell.border = thinBorder;
    if (pkgAmtSum > 0) {
      fAmtCell.numFmt = '#,##0';
    }
  });

  const grandCount = rows.reduce((sum, r) => sum + r.totalCount, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const fTqtyCell = footRow.getCell(totalStartCol);
  fTqtyCell.value = grandCount;
  fTqtyCell.font = { name: FONT_TIMES, size: 10, bold: true };
  fTqtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
  fTqtyCell.border = thinBorder;

  const fTamtCell = footRow.getCell(totalEndCol);
  fTamtCell.value = grandTotal;
  fTamtCell.font = { name: FONT_TIMES, size: 10, bold: true };
  fTamtCell.alignment = { horizontal: 'right', vertical: 'middle' };
  fTamtCell.border = thinBorder;
  fTamtCell.numFmt = '#,##0';
  row++;

  // ── Deduction notes (if any) ──
  const deductionPkgs = activePkgs.filter((p) => p.deduction && p.deduction.value > 0);
  deductionPkgs.forEach((p) => {
    ws.mergeCells(row, 1, row, Math.max(totalCols, 6));
    const noteCell = ws.getRow(row).getCell(1);
    noteCell.value = `* ${p.shortName || p.name}: thực lĩnh đã trừ khấu trừ ${formatDeductionValue(p.deduction)}/vị trí${p.deduction?.note ? ` — ${p.deduction.note}` : ''}`;
    noteCell.font = { name: FONT_TIMES, size: 9, italic: true };
    noteCell.alignment = { horizontal: 'left', vertical: 'middle' };
    row++;
  });

  row++;
  addSignatures(ws, row, Math.max(totalCols, 6), 'payment', signatureDate);

  // Column widths — căn chỉnh nhỏ gọn, vừa khít nội dung từng cột (cột Số lượng giữ độ rộng vừa phải = 8.5)
  const maxDeptLen = rows.reduce((max, r) => {
    const txt = r.isUnassigned ? 'Chưa gán NV' : r.department || '';
    return Math.max(max, txt.length);
  }, 4);
  const maxStaffNameLen = rows.reduce((max, r) => {
    if (r.isUnassigned) return max; // các dòng Chưa gán NV dài tự động xuống dòng (wrapText)
    return Math.max(max, (r.staffName || '').length);
  }, 14);

  ws.getColumn(1).width = 4.2; // STT
  ws.getColumn(2).width = Math.min(11, Math.max(8.5, maxDeptLen * 0.95 + 1)); // Khoa
  ws.getColumn(3).width = 11;  // Mã số thuế (vừa khít 10 chữ số)
  ws.getColumn(4).width = Math.min(19, Math.max(16, maxStaffNameLen * 0.9 + 1.5)); // Họ tên

  activePkgs.forEach((pkg, i) => {
    let maxAmtVal = 0;
    let pkgAmtSum = 0;
    rows.forEach((r) => {
      const pkgCells = r.cells[pkg.id] || {};
      let rowAmt = 0;
      Object.values(pkgCells).forEach((c) => {
        rowAmt += c.amount || 0;
      });
      if (rowAmt > maxAmtVal) maxAmtVal = rowAmt;
      pkgAmtSum += rowAmt;
    });
    const largestPkgAmt = Math.max(maxAmtVal, pkgAmtSum);
    const formattedLen = largestPkgAmt > 0 ? largestPkgAmt.toLocaleString('en-US').length : 0;

    ws.getColumn(fixedColCount + i * 2 + 1).width = 8.5; // Số lượng (không quá nhỏ, hiển thị trọn chữ "Số lượng")
    ws.getColumn(fixedColCount + i * 2 + 2).width = Math.min(12.5, Math.max(10.2, formattedLen * 0.95 + 1.2)); // Thành tiền vừa khít con số
  });

  const grandTotalLen = grandTotal > 0 ? grandTotal.toLocaleString('en-US').length : 0;
  ws.getColumn(totalStartCol).width = 8.5; // Tổng cộng - Số lượng
  ws.getColumn(totalEndCol).width = Math.min(13, Math.max(10.8, grandTotalLen * 0.95 + 1.5)); // Tổng cộng - Tổng tiền

  if (!existingWb) {
    const filename = `Bang_thanh_toan_goi_dich_vu_rut_gon_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
  return wb;
}

// ──────────────────────────────────────────────────────────
// Helpers cho Sheet Lịch Trực
// ──────────────────────────────────────────────────────────

function parseDateRangeForDuty(text?: string): { startKey?: string; endKey?: string } {
  if (!text) return {};
  const dmyMatches = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g);
  if (dmyMatches && dmyMatches.length >= 2) {
    const [d1, m1, y1] = dmyMatches[0].split('/').map(Number);
    const [d2, m2, y2] = dmyMatches[1].split('/').map(Number);
    const startKey = `${y1}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    const endKey = `${y2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
    return { startKey, endKey };
  }
  const ymdMatches = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/g);
  if (ymdMatches && ymdMatches.length >= 2) {
    return { startKey: ymdMatches[0], endKey: ymdMatches[1] };
  }
  return {};
}

export function buildDutyScheduleExportModel(
  records: SurgeryRecord[],
  dutySchedules: Record<string, DutyScheduleDateConfig>,
  config: AppConfig,
  dateRange: string,
) {
  const { startKey: queryStartKey, endKey: queryEndKey } = parseDateRangeForDuty(dateRange);
  let earliestDutyDateStr: string | null = queryStartKey || null;
  let latestEndDate: Date | null = queryEndKey
    ? new Date(
        Number(queryEndKey.split('-')[0]),
        Number(queryEndKey.split('-')[1]) - 1,
        Number(queryEndKey.split('-')[2]),
      )
    : null;

  (records || []).forEach((r) => {
    const start = r.start || (r.ngayBD ? new Date(r.ngayBD) : null);
    const end = r.end || (r.ngayKT ? new Date(r.ngayKT) : null);
    if (start && !isNaN(start.getTime())) {
      const schedule = getScheduleForDate(start, config?.workingHours);
      const dutyDateKey = getDutyDateKey(start, schedule.morningFrom || '07:00');
      if (!earliestDutyDateStr || dutyDateKey < earliestDutyDateStr) {
        earliestDutyDateStr = dutyDateKey;
      }
    }
    if (end && !isNaN(end.getTime())) {
      if (!latestEndDate || end.getTime() > latestEndDate.getTime()) {
        latestEndDate = end;
      }
    }
  });

  // Cũng xét cả các ngày có trong dutySchedules nếu chưa có trong khoảng ngày
  Object.keys(dutySchedules || {}).forEach((dateKey) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      if (!earliestDutyDateStr) earliestDutyDateStr = dateKey;
      if (!latestEndDate) {
        const [y, m, d] = dateKey.split('-').map(Number);
        latestEndDate = new Date(y, m - 1, d);
      }
    }
  });

  const dutyDates: string[] = [];
  if (earliestDutyDateStr) {
    const latestEndDateKey = latestEndDate ? formatDateKey(latestEndDate) : earliestDutyDateStr;
    const finalEndKey = latestEndDateKey >= earliestDutyDateStr ? latestEndDateKey : earliestDutyDateStr;
    const [startYear, startMonth, startDay] = earliestDutyDateStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = finalEndKey.split('-').map(Number);
    const cursor = new Date(startYear, startMonth - 1, startDay);
    const stopDate = new Date(endYear, endMonth - 1, endDay);
    while (cursor.getTime() <= stopDate.getTime()) {
      dutyDates.push(formatDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Trích xuất và sắp xếp danh sách nhân viên
  const staffMap = new Map<
    string,
    { name: string; department: string; derivedPos: string; deptWeight: number }
  >();
  const configuredStaff = config?.staffList || [];
  const deptOrderMap = new Map<string, number>();
  (config?.departments || []).forEach((dept, idx) => deptOrderMap.set(dept, idx));

  const addStaffName = (rawName: string, fallbackPos: string) => {
    const trimmed = (rawName || '').toString().trim();
    if (!trimmed || staffMap.has(trimmed)) return;
    const cleanName = trimmed.toLowerCase();
    const matched =
      configuredStaff.find((s) => s.name === trimmed) ||
      configuredStaff.find((s) => s.name.trim().toLowerCase() === cleanName);
    const dept = matched?.department || 'Khác';
    const pos = matched?.position || fallbackPos;
    const deptWeight = deptOrderMap.get(dept) ?? 999;
    staffMap.set(trimmed, {
      name: trimmed,
      department: dept,
      derivedPos: pos,
      deptWeight,
    });
  };

  const roleFields: Array<keyof SurgeryRecord> = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc', 'gv'];
  (records || []).forEach((r) => {
    roleFields.forEach((rf) => {
      const rawName = (r[rf] || '').toString().trim();
      if (!rawName) return;
      const defaultPos = rf === 'ptChinh' || rf === 'ptPhu' ? 'BS PT' : rf === 'bsGM' ? 'BS GMHS' : 'Phụ';
      addStaffName(rawName, defaultPos);
    });
  });

  // Bổ sung nhân viên có trong dutySchedules thuộc các ngày đang xét
  dutyDates.forEach((dateKey) => {
    const onCall = dutySchedules?.[dateKey]?.onCallStaff || [];
    onCall.forEach((name) => addStaffName(name, 'BS PT'));
  });

  const staffList = Array.from(staffMap.values()).sort((a, b) => {
    if (a.deptWeight !== b.deptWeight) return a.deptWeight - b.deptWeight;
    if (a.department !== b.department) return (a.department || '').localeCompare(b.department || '', 'vi');
    const posWeight: Record<string, number> = { 'BS PT': 1, 'BS GMHS': 2, 'Phụ': 3 };
    const wA = posWeight[a.derivedPos] || 99;
    const wB = posWeight[b.derivedPos] || 99;
    if (wA !== wB) return wA - wB;
    return a.name.localeCompare(b.name, 'vi');
  });

  return { dutyDates, staffList };
}

/**
 * 2c) Xuất Bảng Phân Công Lịch Trực 24h sang file Excel
 */
export async function exportDutyScheduleToExcel(
  records: SurgeryRecord[],
  dutySchedules: Record<string, DutyScheduleDateConfig>,
  config: AppConfig,
  dateRange: string,
  hospitalName: string = 'BỆNH VIỆN',
  existingWb?: ExcelJS.Workbook,
  signatureDate?: Date,
): Promise<ExcelJS.Workbook> {
  const wb = existingWb || new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lịch trực', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  const { dutyDates, staffList } = buildDutyScheduleExportModel(records, dutySchedules, config, dateRange);
  const fixedHeaders = ['STT', 'Khoa/Phòng', 'Họ và tên nhân viên', 'Chức danh', 'Tổng buổi trực'];
  const fixedColCount = fixedHeaders.length;
  const totalCols = fixedColCount + dutyDates.length;

  let row = addReportHeader(
    ws,
    'BẢNG PHÂN CÔNG LỊCH TRỰC 24H',
    dateRange,
    hospitalName,
    Math.max(totalCols, 6),
    1,
  );

  // Header Row 1: Fixed columns + Date columns
  const headerRow1 = row;
  const headerRow2 = row + 1;

  fixedHeaders.forEach((label, idx) => {
    ws.mergeCells(headerRow1, idx + 1, headerRow2, idx + 1);
    const cell = ws.getRow(headerRow1).getCell(idx + 1);
    cell.value = label;
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    ws.getRow(headerRow2).getCell(idx + 1).border = thinBorder;
  });

  dutyDates.forEach((dateKey, dIdx) => {
    const colNum = fixedColCount + dIdx + 1;
    const dayCfg = dutySchedules?.[dateKey];
    const isHoliday = dayCfg ? dayCfg.isHoliday : isWeekend(dateKey);
    const displayDate = formatDisplayDate(dateKey).substring(0, 5); // DD/MM
    const dow = getDayOfWeekLabel(dateKey);

    const c1 = ws.getRow(headerRow1).getCell(colNum);
    c1.value = `${displayDate}\n(${dow})`;
    c1.font = { name: FONT_TIMES, size: 9, bold: true };
    c1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c1.border = thinBorder;
    c1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isHoliday ? 'FFFEF3C7' : 'FFE8E8E8' },
    };

    const c2 = ws.getRow(headerRow2).getCell(colNum);
    c2.value = isHoliday ? 'Nghỉ/Lễ' : 'Thường';
    c2.font = { name: FONT_TIMES, size: 8, italic: true, bold: isHoliday };
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    c2.border = thinBorder;
    c2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isHoliday ? 'FFFDE68A' : 'FFF5F5F5' },
    };
  });

  ws.getRow(headerRow1).height = 26;
  ws.getRow(headerRow2).height = 18;
  row = headerRow2 + 1;

  // Data rows
  let prevDept = '';
  staffList.forEach((staff, sIdx) => {
    const dataRow = ws.getRow(row);
    const isNewDept = sIdx > 0 && staff.department !== prevDept;
    prevDept = staff.department;

    let dutyCount = 0;
    dutyDates.forEach((dateKey) => {
      const onCall = dutySchedules?.[dateKey]?.onCallStaff || [];
      if (onCall.includes(staff.name)) dutyCount++;
    });

    dataRow.getCell(1).value = sIdx + 1;
    dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(2).value = staff.department;
    dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    dataRow.getCell(3).value = staff.name;
    dataRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    dataRow.getCell(4).value = staff.derivedPos;
    dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(5).value = dutyCount;
    dataRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let i = 1; i <= fixedColCount; i++) {
      dataRow.getCell(i).font = { name: FONT_TIMES, size: 10, bold: i === 5 };
      dataRow.getCell(i).border = thinBorder;
    }

    dutyDates.forEach((dateKey, dIdx) => {
      const colNum = fixedColCount + dIdx + 1;
      const onCall = dutySchedules?.[dateKey]?.onCallStaff || [];
      const isOnCall = onCall.includes(staff.name);
      const cell = dataRow.getCell(colNum);
      cell.value = isOnCall ? 'X' : '';
      cell.font = { name: FONT_TIMES, size: 10, bold: isOnCall, color: { argb: isOnCall ? 'FF1D4ED8' : 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (isOnCall) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      }
    });

    if (isNewDept) {
      for (let i = 1; i <= totalCols; i++) {
        dataRow.getCell(i).border = {
          ...thinBorder,
          top: { style: 'medium' },
        };
      }
    }

    row++;
  });

  // Footer row: Tổng số người trực mỗi ngày
  const footRow = ws.getRow(row);
  ws.mergeCells(row, 1, row, 4);
  footRow.getCell(1).value = 'TỔNG SỐ NGƯỜI TRỰC';
  footRow.getCell(1).font = { name: FONT_TIMES, size: 10, bold: true };
  footRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  for (let i = 1; i <= 4; i++) {
    footRow.getCell(i).border = thinBorder;
  }

  let grandDutyCount = 0;
  dutyDates.forEach((dateKey, dIdx) => {
    const colNum = fixedColCount + dIdx + 1;
    const onCall = dutySchedules?.[dateKey]?.onCallStaff || [];
    const count = staffList.filter((s) => onCall.includes(s.name)).length;
    grandDutyCount += count;
    const cell = footRow.getCell(colNum);
    cell.value = count > 0 ? count : '';
    cell.font = { name: FONT_TIMES, size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  footRow.getCell(5).value = grandDutyCount;
  footRow.getCell(5).font = { name: FONT_TIMES, size: 10, bold: true };
  footRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  footRow.getCell(5).border = thinBorder;
  row += 2;

  addSignatures(ws, row, Math.max(totalCols, 6), 'list', signatureDate);

  ws.getColumn(1).width = 5;  // STT
  ws.getColumn(2).width = 14; // Khoa
  ws.getColumn(3).width = 22; // Họ tên
  ws.getColumn(4).width = 11; // Chức danh
  ws.getColumn(5).width = 12; // Tổng buổi trực
  for (let i = 0; i < dutyDates.length; i++) {
    ws.getColumn(fixedColCount + i + 1).width = 7;
  }

  if (!existingWb) {
    const filename = `Bang_lich_truc_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
  return wb;
}

// ──────────────────────────────────────────────────────────
// 3) Combined Export — All sheets formatted & raw
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

/**
 * Bổ sung các sheet dữ liệu thô (Gói DV Số lượng, Gói DV Số tiền, Thống kê Ngoài giờ, Lịch trực)
 * vào SheetJS Workbook khi người dùng tải file Excel "Không định dạng".
 */
export function appendExtraRawSheetsToWorkbook(
  rawWb: XLSX.WorkBook,
  records: SurgeryRecord[],
  config: AppConfig,
  dateRange: string,
  extraData?: ExtraFullExcelExportData,
) {
  const assignments = extraData?.packageAssignments || [];
  const packages = extraData?.packageDefinitions || [];
  const staffList = config.staffList || [];
  const positionCatalog = extraData?.positionCatalog || [];
  const departments = config.departments || [];
  const dutySchedules = extraData?.dutySchedules || {};
  const includeGV = extraData?.includeGV ?? false;

  // 1 & 2. Hai bảng thanh toán gói dịch vụ (Theo Số lượng & Theo Số tiền)
  const usedPkgs = getUsedPackages(assignments, packages);
  const activePkgs = (usedPkgs.length > 0 ? usedPkgs : packages).filter(
    (p) => Array.isArray(p.positions) && p.positions.length > 0,
  );
  const allPkgRows = buildPackagePaymentRows(assignments, packages, staffList, positionCatalog, departments);
  const pkgRows = filterPackageRows(allPkgRows, extraData?.packageSearchTerm || '', packages);

  (['count', 'amount'] as const).forEach((mode) => {
    const sheetName = mode === 'count' ? 'TT_GOI_DV_SL' : 'TT_GOI_DV_TIEN';
    const header1: any[] = ['STT', 'Khoa', 'Mã số thuế', 'Họ tên'];
    const header2: any[] = ['', '', '', ''];
    const flatPos: { packageId: string; positionKey: string }[] = [];

    activePkgs.forEach((pkg) => {
      pkg.positions.forEach((pos, idx) => {
        header1.push(idx === 0 ? pkg.name : '');
        header2.push(pos.positionLabel);
        flatPos.push({ packageId: pkg.id, positionKey: pos.positionKey });
      });
    });
    header1.push('Tổng SL', 'Thành tiền');
    header2.push('', '');

    const aoa: any[][] = [header1, header2];
    pkgRows.forEach((r, idx) => {
      const rowArr: any[] = [
        idx + 1,
        r.isUnassigned ? 'Chưa gán NV' : r.department || '',
        r.taxId || '',
        r.staffName,
      ];
      flatPos.forEach((fp) => {
        const c = r.cells[fp.packageId]?.[fp.positionKey];
        const val = c ? (mode === 'count' ? c.count : c.amount) : 0;
        rowArr.push(val > 0 ? val : '');
      });
      rowArr.push(r.totalCount, r.total);
      aoa.push(rowArr);
    });

    const totalRow: any[] = ['', '', '', 'TỔNG CỘNG'];
    flatPos.forEach((fp) => {
      const sum = pkgRows.reduce((s, r) => {
        const c = r.cells[fp.packageId]?.[fp.positionKey];
        return s + (c ? (mode === 'count' ? c.count : c.amount) : 0);
      }, 0);
      totalRow.push(sum > 0 ? sum : '');
    });
    totalRow.push(
      pkgRows.reduce((s, r) => s + r.totalCount, 0),
      pkgRows.reduce((s, r) => s + r.total, 0),
    );
    aoa.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(rawWb, ws, sheetName);
  });

  // 2b. Sheet Thanh toán Gói dịch vụ Rút gọn (TT_GOI_DV_RUT_GON)
  {
    const sumHeader1: any[] = ['STT', 'Khoa', 'Mã số thuế', 'Họ tên'];
    const sumHeader2: any[] = ['', '', '', ''];
    activePkgs.forEach((pkg) => {
      sumHeader1.push(pkg.name, '');
      sumHeader2.push('Số lượng', 'Thành tiền');
    });
    sumHeader1.push('Tổng cộng', '');
    sumHeader2.push('Số lượng', 'Tổng tiền');

    const sumAoa: any[][] = [sumHeader1, sumHeader2];
    pkgRows.forEach((r, idx) => {
      const rowArr: any[] = [
        idx + 1,
        r.isUnassigned ? 'Chưa gán NV' : r.department || '',
        r.taxId || '',
        r.staffName,
      ];
      activePkgs.forEach((pkg) => {
        const pkgCells = r.cells[pkg.id] || {};
        let pkgCount = 0;
        let pkgAmt = 0;
        Object.values(pkgCells).forEach((c) => {
          pkgCount += c.count || 0;
          pkgAmt += c.amount || 0;
        });
        rowArr.push(pkgCount > 0 ? pkgCount : '', pkgAmt > 0 ? pkgAmt : '');
      });
      rowArr.push(r.totalCount, r.total);
      sumAoa.push(rowArr);
    });

    const sumTotalRow: any[] = ['', '', '', 'TỔNG CỘNG'];
    activePkgs.forEach((pkg) => {
      let pkgCountSum = 0;
      let pkgAmtSum = 0;
      pkgRows.forEach((r) => {
        const pkgCells = r.cells[pkg.id] || {};
        Object.values(pkgCells).forEach((c) => {
          pkgCountSum += c.count || 0;
          pkgAmtSum += c.amount || 0;
        });
      });
      sumTotalRow.push(pkgCountSum > 0 ? pkgCountSum : '', pkgAmtSum > 0 ? pkgAmtSum : '');
    });
    sumTotalRow.push(
      pkgRows.reduce((s, r) => s + r.totalCount, 0),
      pkgRows.reduce((s, r) => s + r.total, 0),
    );
    sumAoa.push(sumTotalRow);

    const wsSum = XLSX.utils.aoa_to_sheet(sumAoa);
    XLSX.utils.book_append_sheet(rawWb, wsSum, 'TT_GOI_DV_RUT_GON');
  }

  // 3. Sheet Thống kê Ngoài giờ
  const overtimeRows = calculateOvertimeRows(records, dutySchedules, config.workingHours, includeGV);
  const otHeaders = [
    'STT',
    'Mã BN',
    'Họ và tên người bệnh',
    'Tên phẫu thuật, thủ thuật',
    'Ngày BĐ',
    'Ngày KT',
    'PT chính',
    'PT phụ',
    'BS GM',
    'KTV GM',
    'TDC',
    ...(includeGV ? ['GV'] : []),
    'Ngoài giờ (từ)',
    'Ngoài giờ (đến)',
    'TS giờ',
    'Kíp phẫu thuật',
  ];
  const otAoa: any[][] = [otHeaders];
  overtimeRows.forEach((r, idx) => {
    otAoa.push([
      idx + 1,
      r.patientId,
      r.patientName,
      r.tenKT,
      r.ngayBD,
      r.ngayKT,
      r.ptChinh || '',
      r.ptPhu || '',
      r.bsGM || '',
      r.ktvGM || '',
      r.tdc || '',
      ...(includeGV ? [r.gv || ''] : []),
      r.timeFrom,
      r.timeTo,
      r.durationText,
      r.ghiChu,
    ]);
  });
  const wsOt = XLSX.utils.aoa_to_sheet(otAoa);
  XLSX.utils.book_append_sheet(rawWb, wsOt, 'THONG_KE_NGOAI_GIO');

  // 4. Sheet Lịch trực
  const { dutyDates, staffList: dutyStaff } = buildDutyScheduleExportModel(
    records,
    dutySchedules,
    config,
    dateRange,
  );
  const dutyHeader = [
    'STT',
    'Khoa/Phòng',
    'Họ và tên nhân viên',
    'Chức danh',
    'Tổng buổi trực',
    ...dutyDates.map((d) => `${formatDisplayDate(d).substring(0, 5)} (${getDayOfWeekLabel(d)})`),
  ];
  const dutyAoa: any[][] = [dutyHeader];
  dutyStaff.forEach((s, idx) => {
    const marks = dutyDates.map((d) =>
      (dutySchedules?.[d]?.onCallStaff || []).includes(s.name) ? 'X' : '',
    );
    const totalDuty = marks.filter((m) => m === 'X').length;
    dutyAoa.push([idx + 1, s.department, s.name, s.derivedPos, totalDuty, ...marks]);
  });
  const wsDuty = XLSX.utils.aoa_to_sheet(dutyAoa);
  XLSX.utils.book_append_sheet(rawWb, wsDuty, 'LICH_TRUC');
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
  extraData?: ExtraFullExcelExportData,
): Promise<ExcelJS.Workbook> {
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

  // 3. Formatted Bảng Thanh toán Phụ cấp PTTT sheet
  if (paymentPrepared) {
    const { enrichedRows, groups, cols, footerTotals, columnTotals } = paymentPrepared;
    await exportPaymentExcel(
      enrichedRows, groups, cols, footerTotals, columnTotals,
      config.priceConfig as unknown as Record<string, Record<string, number>>, records, dateRange, hospitalName, wb, signatureDate,
      config.allowanceItems,
    );
  }

  // 4 & 5. Hai Bảng Thanh toán Gói dịch vụ (Theo Số lượng & Theo Số tiền)
  const pkgAssignments = extraData?.packageAssignments || [];
  const pkgDefinitions = extraData?.packageDefinitions || [];
  const posCatalog = extraData?.positionCatalog || [];
  const pkgModuleCfg = extraData?.packageModuleConfig;
  const pkgSubtitle = extraData?.packageSubtitle || dateRange;
  const pkgSearchTerm = extraData?.packageSearchTerm || '';
  const staffList = config.staffList || [];
  const departments = config.departments || [];

  await exportPackagePaymentExcel(
    pkgAssignments,
    pkgDefinitions,
    staffList,
    posCatalog,
    departments,
    pkgSubtitle,
    hospitalName,
    'count',
    wb,
    signatureDate,
    pkgModuleCfg,
    pkgSearchTerm,
  );

  await exportPackagePaymentExcel(
    pkgAssignments,
    pkgDefinitions,
    staffList,
    posCatalog,
    departments,
    pkgSubtitle,
    hospitalName,
    'amount',
    wb,
    signatureDate,
    pkgModuleCfg,
    pkgSearchTerm,
  );

  await exportPackagePaymentSummaryExcel(
    pkgAssignments,
    pkgDefinitions,
    staffList,
    posCatalog,
    departments,
    pkgSubtitle,
    hospitalName,
    wb,
    signatureDate,
    pkgModuleCfg,
    pkgSearchTerm,
  );

  // 6. Sheet Thống kê Ngoài giờ
  const dutySchedules = extraData?.dutySchedules || {};
  const includeGV = extraData?.includeGV ?? false;
  const overtimeRows = calculateOvertimeRows(records, dutySchedules, config.workingHours, includeGV);
  await exportOvertimeToExcel(
    overtimeRows,
    dateRange,
    hospitalName,
    includeGV,
    wb,
    signatureDate,
    'Thống kê Ngoài giờ',
  );

  // 7. Sheet Lịch trực
  await exportDutyScheduleToExcel(
    records,
    dutySchedules,
    config,
    dateRange,
    hospitalName,
    wb,
    signatureDate,
  );

  // Save combined workbook
  if (extraData?.saveFile !== false) {
    const filename = `Ket_qua_dinh_dang_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
  return wb;
}

/**
 * Xuất danh sách Phẫu thuật Ngoài giờ hành chính sang file Excel
 */
export async function exportOvertimeToExcel(
  rows: OvertimeRecordRow[],
  dateRange: string,
  hospitalName: string = 'BỆNH VIỆN',
  includeGV: boolean = false,
  existingWb?: ExcelJS.Workbook,
  signatureDate?: Date,
  sheetName: string = 'Phẫu thuật Ngoài giờ',
) {
  const wb = existingWb || new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  const cols = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Mã BN', key: 'patientId', width: 12 },
    { header: 'Họ và tên người bệnh', key: 'patientName', width: 22 },
    { header: 'Tên phẫu thuật, thủ thuật', key: 'tenKT', width: 34 },
    { header: 'Ngày BĐ', key: 'ngayBD', width: 18 },
    { header: 'Ngày KT', key: 'ngayKT', width: 18 },
    { header: 'PT chính', key: 'ptChinh', width: 18 },
    { header: 'PT phụ', key: 'ptPhu', width: 18 },
    { header: 'BS GM', key: 'bsGM', width: 18 },
    { header: 'KTV GM', key: 'ktvGM', width: 18 },
    { header: 'TDC', key: 'tdc', width: 18 },
    ...(includeGV ? [{ header: 'GV', key: 'gv', width: 18 }] : []),
    { header: 'Ngoài giờ (từ)', key: 'timeFrom', width: 14 },
    { header: 'Ngoài giờ (đến)', key: 'timeTo', width: 14 },
    { header: 'TS giờ', key: 'durationText', width: 12 },
    { header: 'Kíp phẫu thuật', key: 'ghiChu', width: 16 },
  ];

  const totalCols = cols.length;
  let row = addReportHeader(
    ws,
    'BẢNG THỐNG KÊ PHẪU THUẬT NGOÀI GIỜ HÀNH CHÍNH',
    dateRange,
    hospitalName,
    totalCols,
    1
  );

  // Dòng tiêu đề bảng
  const headerRow = ws.getRow(row);
  cols.forEach((c, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = c.header;
    cell.font = { name: FONT_TIMES, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003366' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
    ws.getColumn(idx + 1).width = c.width;
  });
  headerRow.height = 26;
  row++;

  // Dòng dữ liệu
  rows.forEach((r, idx) => {
    const dataRow = ws.getRow(row);
    let colIdx = 1;
    dataRow.getCell(colIdx++).value = idx + 1;
    dataRow.getCell(colIdx++).value = r.patientId;
    dataRow.getCell(colIdx++).value = r.patientName;
    dataRow.getCell(colIdx++).value = r.tenKT;
    dataRow.getCell(colIdx++).value = r.ngayBD;
    dataRow.getCell(colIdx++).value = r.ngayKT;
    dataRow.getCell(colIdx++).value = r.ptChinh || '';
    dataRow.getCell(colIdx++).value = r.ptPhu || '';
    dataRow.getCell(colIdx++).value = r.bsGM || '';
    dataRow.getCell(colIdx++).value = r.ktvGM || '';
    dataRow.getCell(colIdx++).value = r.tdc || '';
    if (includeGV) {
      dataRow.getCell(colIdx++).value = r.gv || '';
    }
    dataRow.getCell(colIdx++).value = r.timeFrom;
    dataRow.getCell(colIdx++).value = r.timeTo;
    dataRow.getCell(colIdx++).value = r.durationText;
    dataRow.getCell(colIdx++).value = r.ghiChu;

    for (let c = 1; c <= totalCols; c++) {
      const cell = dataRow.getCell(c);
      cell.font = { name: FONT_TIMES, size: 10 };
      cell.border = thinBorder;
      if (c === 1 || c === 2 || c === 5 || c === 6 || c >= totalCols - 3) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    }
    dataRow.height = 20;
    row++;
  });

  // Dòng tổng cộng
  const totalRow = ws.getRow(row);
  ws.mergeCells(row, 1, row, 4);
  totalRow.getCell(1).value = `Tổng cộng: ${rows.length} lượt phẫu thuật ngoài giờ`;
  totalRow.getCell(1).font = { name: FONT_TIMES, size: 10, bold: true };
  totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  for (let c = 1; c <= totalCols; c++) {
    totalRow.getCell(c).border = thinBorder;
  }
  row += 2;

  addSignatures(ws, row, totalCols, 'list', signatureDate);

  if (!existingWb) {
    const filename = `Bang_thong_ke_ngoai_gio_${new Date().toISOString().split('T')[0]}.xlsx`;
    await saveWorkbook(wb, filename);
  }
}

