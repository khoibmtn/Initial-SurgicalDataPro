/**
 * Excel & CSV Export Service for Specialty Comparison
 * Xuất báo cáo Excel/CSV phân tích so sánh phẫu thuật chuyên khoa:
 * - Excel: Sheet 1 là "Tổng hợp toàn viện" + Các sheet chuyên khoa riêng biệt
 * - CSV: 1 file tổng hợp chuẩn UTF-8 (BOM \uFEFF) kéo thả tối ưu cho NotebookLM
 * - Hỗ trợ đồng bộ hiển thị các cột số chênh tuyệt đối (± ca)
 */

import ExcelJS from 'exceljs';
import { SpecialtyReportGroup, ComparisonConfig, PeriodMetadata, ComparisonRow } from './specialtyComparisonService';

const FONT_NAME = 'Times New Roman';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
};

const fmtPctStr = (val: number | null) => {
  if (val === null) return '';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
};

const fmtDiffStr = (val: number | null) => {
  if (val === null) return '';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val}`;
};

export async function exportSpecialtyComparisonExcel(
  groups: SpecialtyReportGroup[],
  periodMeta: PeriodMetadata,
  config: ComparisonConfig,
  showDiff: boolean = true
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SurgicalDataPro';
  wb.created = new Date();

  // ═══════════════════════════════════════════════════════════════════════
  // SHEET 1: TỔNG HỢP TOÀN VIỆN (Tất cả chuyên khoa)
  // ═══════════════════════════════════════════════════════════════════════
  const wsAll = wb.addWorksheet('Tổng hợp toàn viện', { views: [{ showGridLines: true }] });

  // Định nghĩa cột cho sheet Tổng hợp
  const allCols: Partial<ExcelJS.Column>[] = [
    { key: 'tenKT', width: 44 },
    { key: 'specialty', width: 22 },
    { key: 'current', width: 13 },
    { key: 'prev', width: 13 },
  ];
  if (showDiff) {
    allCols.push({ key: 'prevDiff', width: 14 });
  }
  allCols.push({ key: 'prevChange', width: 15 });
  allCols.push({ key: 'samePeriod', width: 13 });
  if (showDiff) {
    allCols.push({ key: 'samePeriodDiff', width: 14 });
  }
  allCols.push({ key: 'samePeriodChange', width: 15 });
  allCols.push({ key: 'status', width: 18 });
  allCols.push({ key: 'note', width: 32 });

  wsAll.columns = allCols;

  const totalColCountAll = allCols.length;
  const lastColLetterAll = String.fromCharCode(64 + totalColCountAll);

  // Row 1: Title
  wsAll.mergeCells(`A1:${lastColLetterAll}1`);
  const titleCellAll = wsAll.getCell('A1');
  titleCellAll.value = `BÁO CÁO PHÂN TÍCH PHẪU THUẬT TOÀN VIỆN - TẤT CẢ CHUYÊN KHOA`;
  titleCellAll.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCellAll.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003366' } };
  titleCellAll.alignment = { horizontal: 'center', vertical: 'middle' };
  wsAll.getRow(1).height = 28;

  // Row 2: Subtitle
  wsAll.mergeCells(`A2:${lastColLetterAll}2`);
  const subCellAll = wsAll.getCell('A2');
  subCellAll.value = periodMeta.subtitle;
  subCellAll.font = { name: FONT_NAME, size: 10.5, italic: true, color: { argb: 'FF003366' } };
  subCellAll.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EDF7' } };
  subCellAll.alignment = { horizontal: 'center', vertical: 'middle' };
  wsAll.getRow(2).height = 22;

  // Row 3: Table Headers
  const headerValuesAll = [
    'Tên phẫu thuật',
    'Chuyên khoa',
    periodMeta.currentLabel,
    periodMeta.prevLabel,
  ];
  if (showDiff) headerValuesAll.push('± Kỳ trước (ca)');
  headerValuesAll.push(periodMeta.prevColTitle);
  headerValuesAll.push(periodMeta.samePeriodLabel);
  if (showDiff) headerValuesAll.push('± Cùng kỳ (ca)');
  headerValuesAll.push('So cùng kỳ');
  headerValuesAll.push('Nhận định');
  headerValuesAll.push('Ghi chú');

  const headerRowAll = wsAll.getRow(3);
  headerRowAll.values = headerValuesAll;
  headerRowAll.height = 26;

  for (let c = 1; c <= totalColCountAll; c++) {
    const cell = headerRowAll.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF104E8B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF002244' } },
      bottom: { style: 'medium', color: { argb: 'FF002244' } },
      left: { style: 'thin', color: { argb: 'FF336699' } },
      right: { style: 'thin', color: { argb: 'FF336699' } },
    };
  }

  // Rows Data Sheet 1
  const allUnifiedRows: ComparisonRow[] = [];
  groups.forEach(g => allUnifiedRows.push(...g.rows));

  let curRowIdxAll = 4;
  let grandTotalCur = 0;
  let grandTotalPrev = 0;
  let grandTotalSame = 0;
  let grandAlertCount = 0;
  let grandPositiveCount = 0;

  for (const r of allUnifiedRows) {
    grandTotalCur += r.currentCount;
    grandTotalPrev += r.prevCount;
    grandTotalSame += r.samePeriodCount;
    if (r.status === 'ALERT') grandAlertCount++;
    if (r.status === 'POSITIVE') grandPositiveCount++;

    const row = wsAll.getRow(curRowIdxAll);
    const rowValues = [
      r.tenKT,
      r.specialtyName,
      r.currentCount,
      r.prevCount,
    ];
    if (showDiff) rowValues.push(fmtDiffStr(r.prevDiff) as any);
    rowValues.push(fmtPctStr(r.prevChangePct) as any);
    rowValues.push(periodMeta.hasSamePeriodData ? r.samePeriodCount : ('' as any));
    if (showDiff) rowValues.push(periodMeta.hasSamePeriodData ? (fmtDiffStr(r.samePeriodDiff) as any) : ('' as any));
    rowValues.push(periodMeta.hasSamePeriodData ? (fmtPctStr(r.samePeriodChangePct) as any) : ('' as any));
    rowValues.push(r.statusLabel as any);
    rowValues.push(r.note as any);

    row.values = rowValues;
    row.height = 20;

    for (let c = 1; c <= totalColCountAll; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT_NAME, size: 10.5 };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c === 1 ? 'left' : (c === 2 ? 'left' : 'center'), vertical: 'middle' };

      // Highlight Alert / Positive
      if (c === totalColCountAll - 1) {
        if (r.status === 'ALERT') {
          cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: 'FFC00000' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
        } else if (r.status === 'POSITIVE') {
          cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: 'FF2E7D32' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        }
      }
    }

    curRowIdxAll++;
  }

  // Summary Row Sheet 1
  const summaryRowAll = wsAll.getRow(curRowIdxAll);
  const grandPrevDiff = grandTotalCur - grandTotalPrev;
  const grandPrevChange = grandTotalPrev > 0 ? ((grandTotalCur - grandTotalPrev) / grandTotalPrev) * 100 : null;
  const grandSameDiff = periodMeta.hasSamePeriodData ? (grandTotalCur - grandTotalSame) : null;
  const grandSameChange = (periodMeta.hasSamePeriodData && grandTotalSame > 0)
    ? ((grandTotalCur - grandTotalSame) / grandTotalSame) * 100
    : null;

  const summaryValuesAll = [
    'TỔNG CỘNG TOÀN VIỆN',
    `${allUnifiedRows.length} kỹ thuật`,
    grandTotalCur,
    grandTotalPrev,
  ];
  if (showDiff) summaryValuesAll.push(fmtDiffStr(grandPrevDiff) as any);
  summaryValuesAll.push(fmtPctStr(grandPrevChange) as any);
  summaryValuesAll.push(periodMeta.hasSamePeriodData ? (grandTotalSame as any) : ('' as any));
  if (showDiff) summaryValuesAll.push(periodMeta.hasSamePeriodData ? (fmtDiffStr(grandSameDiff) as any) : ('' as any));
  summaryValuesAll.push(periodMeta.hasSamePeriodData ? (fmtPctStr(grandSameChange) as any) : ('' as any));
  summaryValuesAll.push('' as any);
  summaryValuesAll.push(`Cảnh báo: ${grandAlertCount} | Tích cực: ${grandPositiveCount}` as any);

  summaryRowAll.values = summaryValuesAll;
  summaryRowAll.height = 24;

  for (let c = 1; c <= totalColCountAll; c++) {
    const cell = summaryRowAll.getCell(c);
    cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF002244' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
    cell.alignment = { horizontal: c <= 2 ? 'left' : (c === totalColCountAll ? 'left' : 'center'), vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF003366' } },
      bottom: { style: 'double', color: { argb: 'FF003366' } },
      left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SHEETS 2..N: TỪNG CHUYÊN KHOA RIÊNG BIỆT
  // ═══════════════════════════════════════════════════════════════════════
  for (const group of groups) {
    const sheetName = group.specialty.name.substring(0, 31);
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

    const specCols: Partial<ExcelJS.Column>[] = [
      { key: 'tenKT', width: 48 },
      { key: 'current', width: 13 },
      { key: 'prev', width: 13 },
    ];
    if (showDiff) {
      specCols.push({ key: 'prevDiff', width: 14 });
    }
    specCols.push({ key: 'prevChange', width: 15 });
    specCols.push({ key: 'samePeriod', width: 13 });
    if (showDiff) {
      specCols.push({ key: 'samePeriodDiff', width: 14 });
    }
    specCols.push({ key: 'samePeriodChange', width: 15 });
    specCols.push({ key: 'status', width: 18 });
    specCols.push({ key: 'note', width: 34 });

    ws.columns = specCols;
    const totalCols = specCols.length;
    const lastLetter = String.fromCharCode(64 + totalCols);

    // Row 1: Title
    ws.mergeCells(`A1:${lastLetter}1`);
    const titleCell = ws.getCell('A1');
    titleCell.value = `PHÂN TÍCH PHẪU THUẬT - ${group.specialty.name.toUpperCase()}`;
    titleCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003366' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Row 2: Subtitle
    ws.mergeCells(`A2:${lastLetter}2`);
    const subCell = ws.getCell('A2');
    subCell.value = periodMeta.subtitle;
    subCell.font = { name: FONT_NAME, size: 10.5, italic: true, color: { argb: 'FF003366' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EDF7' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    // Row 3: Headers
    const headerValues = [
      'Tên phẫu thuật',
      periodMeta.currentLabel,
      periodMeta.prevLabel,
    ];
    if (showDiff) headerValues.push('± Kỳ trước (ca)');
    headerValues.push(periodMeta.prevColTitle);
    headerValues.push(periodMeta.samePeriodLabel);
    if (showDiff) headerValues.push('± Cùng kỳ (ca)');
    headerValues.push('So cùng kỳ');
    headerValues.push('Nhận định');
    headerValues.push('Ghi chú');

    const headerRow = ws.getRow(3);
    headerRow.values = headerValues;
    headerRow.height = 26;

    for (let c = 1; c <= totalCols; c++) {
      const cell = headerRow.getCell(c);
      cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF104E8B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF002244' } },
        bottom: { style: 'medium', color: { argb: 'FF002244' } },
        left: { style: 'thin', color: { argb: 'FF336699' } },
        right: { style: 'thin', color: { argb: 'FF336699' } },
      };
    }

    // Data Rows
    let curRowIdx = 4;
    for (const r of group.rows) {
      const row = ws.getRow(curRowIdx);
      const rowValues = [
        r.tenKT,
        r.currentCount,
        r.prevCount,
      ];
      if (showDiff) rowValues.push(fmtDiffStr(r.prevDiff) as any);
      rowValues.push(fmtPctStr(r.prevChangePct) as any);
      rowValues.push(periodMeta.hasSamePeriodData ? r.samePeriodCount : ('' as any));
      if (showDiff) rowValues.push(periodMeta.hasSamePeriodData ? (fmtDiffStr(r.samePeriodDiff) as any) : ('' as any));
      rowValues.push(periodMeta.hasSamePeriodData ? (fmtPctStr(r.samePeriodChangePct) as any) : ('' as any));
      rowValues.push(r.statusLabel as any);
      rowValues.push(r.note as any);

      row.values = rowValues;
      row.height = 20;

      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        cell.font = { name: FONT_NAME, size: 10.5 };
        cell.border = thinBorder;
        cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };

        // Highlight Alert / Positive
        if (c === totalCols - 1) {
          if (r.status === 'ALERT') {
            cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: 'FFC00000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
          } else if (r.status === 'POSITIVE') {
            cell.font = { name: FONT_NAME, size: 10.5, bold: true, color: { argb: 'FF2E7D32' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
          }
        }
      }
      curRowIdx++;
    }

    // Summary Row
    const summaryRow = ws.getRow(curRowIdx);
    const prevDiff = group.totalCurrent - group.totalPrev;
    const prevTotalChange = group.totalPrev > 0 ? ((group.totalCurrent - group.totalPrev) / group.totalPrev) * 100 : null;
    const sameDiff = periodMeta.hasSamePeriodData ? (group.totalCurrent - group.totalSamePeriod) : null;
    const samePeriodTotalChange = (periodMeta.hasSamePeriodData && group.totalSamePeriod > 0)
      ? ((group.totalCurrent - group.totalSamePeriod) / group.totalSamePeriod) * 100
      : null;

    const summaryValues = [
      'TỔNG CỘNG',
      group.totalCurrent,
      group.totalPrev,
    ];
    if (showDiff) summaryValues.push(fmtDiffStr(prevDiff) as any);
    summaryValues.push(fmtPctStr(prevTotalChange) as any);
    summaryValues.push(periodMeta.hasSamePeriodData ? (group.totalSamePeriod as any) : ('' as any));
    if (showDiff) summaryValues.push(periodMeta.hasSamePeriodData ? (fmtDiffStr(sameDiff) as any) : ('' as any));
    summaryValues.push(periodMeta.hasSamePeriodData ? (fmtPctStr(samePeriodTotalChange) as any) : ('' as any));
    summaryValues.push('' as any);
    summaryValues.push(`Cảnh báo: ${group.alertCount} | Tích cực: ${group.positiveCount}` as any);

    summaryRow.values = summaryValues;
    summaryRow.height = 24;

    for (let c = 1; c <= totalCols; c++) {
      const cell = summaryRow.getCell(c);
      cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF002244' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
      cell.alignment = { horizontal: c === 1 ? 'left' : (c === totalCols ? 'left' : 'center'), vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF003366' } },
        bottom: { style: 'double', color: { argb: 'FF003366' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    }
  }

  // ── Download in browser ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = periodMeta.exportFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Xuất file CSV Tổng hợp Toàn viện chuẩn UTF-8 có BOM (\uFEFF)
 * Tương thích 100% với NotebookLM, Google Sheets và Excel không bị lỗi font tiếng Việt
 */
export function exportSpecialtyComparisonCSV(
  groups: SpecialtyReportGroup[],
  periodMeta: PeriodMetadata,
  showDiff: boolean = true
): void {
  const allRows: ComparisonRow[] = [];
  groups.forEach(g => allRows.push(...g.rows));

  // CSV escape helper
  const escapeCsv = (str: any) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers: string[] = [
    'Tên phẫu thuật',
    'Chuyên khoa',
    `Số ca ${periodMeta.currentLabel}`,
    `Số ca ${periodMeta.prevLabel}`,
  ];
  if (showDiff) {
    headers.push(`Chênh lệch so ${periodMeta.prevLabel} (ca)`);
  }
  headers.push(`Tỷ lệ so ${periodMeta.prevLabel} (%)`);
  headers.push(`Số ca ${periodMeta.samePeriodLabel}`);
  if (showDiff) {
    headers.push(`Chênh lệch so cùng kỳ ${periodMeta.samePeriodLabel} (ca)`);
  }
  headers.push(`Tỷ lệ so cùng kỳ ${periodMeta.samePeriodLabel} (%)`);
  headers.push('Nhận định');
  headers.push('Ghi chú');

  const csvLines: string[] = [];
  csvLines.push(headers.map(escapeCsv).join(','));

  for (const r of allRows) {
    const line: any[] = [
      r.tenKT,
      r.specialtyName,
      r.currentCount,
      r.prevCount,
    ];
    if (showDiff) line.push(r.prevDiff);
    line.push(r.prevChangePct !== null ? `${r.prevChangePct > 0 ? '+' : ''}${r.prevChangePct.toFixed(1)}%` : '');
    line.push(periodMeta.hasSamePeriodData ? r.samePeriodCount : '');
    if (showDiff) line.push(periodMeta.hasSamePeriodData && r.samePeriodDiff !== null ? r.samePeriodDiff : '');
    line.push(periodMeta.hasSamePeriodData && r.samePeriodChangePct !== null ? `${r.samePeriodChangePct > 0 ? '+' : ''}${r.samePeriodChangePct.toFixed(1)}%` : '');
    line.push(r.statusLabel);
    line.push(r.note);

    csvLines.push(line.map(escapeCsv).join(','));
  }

  // BOM \uFEFF ensures UTF-8 encoding is recognized by NotebookLM & Excel
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const csvFilename = periodMeta.exportFilename.replace(/\.xlsx$/i, '.csv');
  a.download = csvFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
