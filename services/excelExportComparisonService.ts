/**
 * Excel & CSV Export Service for Specialty Comparison
 * Xuất báo cáo Excel/CSV phân tích so sánh phẫu thuật chuyên khoa:
 * - Excel: Sheet 1 là "Tổng hợp toàn viện" + Các sheet chuyên khoa riêng biệt
 * - CSV: 1 file tổng hợp chuẩn UTF-8 (BOM \uFEFF) kéo thả tối ưu cho NotebookLM
 * - Hỗ trợ đồng bộ hiển thị các cột số chênh tuyệt đối (± ca)
 */

import ExcelJS from 'exceljs';
import { SpecialtyReportGroup, ComparisonConfig, PeriodMetadata, ComparisonRow, FinancialCategory, CostSubtype } from './specialtyComparisonService';

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

function getFinancialLabel(financialCategory: FinancialCategory = 'revenue', costSubtype: CostSubtype = 'all'): string {
  if (financialCategory === 'revenue') return 'Viện phí';
  if (financialCategory === 'profit') return 'Lợi nhuận';
  if (costSubtype === 'medic') return 'CP Thuốc';
  if (costSubtype === 'vtth') return 'CP VTTH';
  if (costSubtype === 'labor') return 'CP Nhân công';
  return 'Tổng Chi phí';
}

function getExportRowMetrics(
  r: ComparisonRow,
  isRev: boolean,
  financialCategory: FinancialCategory = 'revenue',
  costSubtype: CostSubtype = 'all',
  hasSamePeriodData: boolean = true
) {
  if (!isRev) {
    return {
      cur: r.currentCount,
      prev: r.prevCount,
      diff: r.prevDiff,
      pct: r.prevChangePct,
      same: hasSamePeriodData ? r.samePeriodCount : null,
      sameDiff: r.samePeriodDiff,
      samePct: r.samePeriodChangePct,
      isValid: true,
    };
  }

  if (financialCategory === 'revenue') {
    return {
      cur: r.currentRevenue,
      prev: r.prevRevenue,
      diff: r.prevRevenueDiff,
      pct: r.prevRevenueChangePct,
      same: hasSamePeriodData ? r.samePeriodRevenue : null,
      sameDiff: r.samePeriodRevenueDiff,
      samePct: r.samePeriodRevenueChangePct,
      isValid: true,
    };
  }

  if (financialCategory === 'profit') {
    const isValid = r.hasCostConfig;
    const cur = isValid ? r.currentProfit : 0;
    const prev = isValid ? r.prevProfit : 0;
    const diff = cur - prev;
    const pct = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
    const same = hasSamePeriodData && isValid ? r.samePeriodProfit : null;
    const sameDiff = hasSamePeriodData && isValid ? (cur - (r.samePeriodProfit || 0)) : null;
    const samePct = (hasSamePeriodData && isValid && (r.samePeriodProfit || 0) !== 0)
      ? ((cur - (r.samePeriodProfit || 0)) / Math.abs(r.samePeriodProfit)) * 100
      : null;
    return { cur, prev, diff, pct, same, sameDiff, samePct, isValid };
  }

  // Cost
  if (costSubtype === 'labor') {
    const cur = r.currentLaborCost;
    const prev = r.prevLaborCost;
    const diff = cur - prev;
    const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
    const same = hasSamePeriodData ? r.samePeriodLaborCost : null;
    const sameDiff = hasSamePeriodData ? (cur - (r.samePeriodLaborCost || 0)) : null;
    const samePct = (hasSamePeriodData && (r.samePeriodLaborCost || 0) > 0)
      ? ((cur - (r.samePeriodLaborCost || 0)) / (r.samePeriodLaborCost || 1)) * 100
      : null;
    return { cur, prev, diff, pct, same, sameDiff, samePct, isValid: true };
  }

  const isValid = r.hasCostConfig;
  let cur = 0, prev = 0, sameVal: number | null = null;
  if (costSubtype === 'medic') {
    cur = isValid ? r.currentMedicCost : 0;
    prev = isValid ? r.prevMedicCost : 0;
    sameVal = hasSamePeriodData && isValid ? r.samePeriodMedicCost : null;
  } else if (costSubtype === 'vtth') {
    cur = isValid ? r.currentVtthCost : 0;
    prev = isValid ? r.prevVtthCost : 0;
    sameVal = hasSamePeriodData && isValid ? r.samePeriodVtthCost : null;
  } else {
    // all
    cur = isValid ? r.currentTotalCost : 0;
    prev = isValid ? r.prevTotalCost : 0;
    sameVal = hasSamePeriodData && isValid ? r.samePeriodTotalCost : null;
  }

  const diff = cur - prev;
  const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
  const sameDiff = hasSamePeriodData && isValid && sameVal !== null ? (cur - sameVal) : null;
  const samePct = (hasSamePeriodData && isValid && sameVal !== null && sameVal > 0)
    ? ((cur - sameVal) / sameVal) * 100
    : null;
  return { cur, prev, diff, pct, same: sameVal, sameDiff, samePct, isValid };
}
function getExportGroupMetrics(
  group: SpecialtyReportGroup,
  isRev: boolean,
  financialCategory: FinancialCategory = 'revenue',
  costSubtype: CostSubtype = 'all',
  hasSamePeriodData: boolean = true
) {
  if (!isRev) {
    const cur = group.totalCurrent;
    const prev = group.totalPrev;
    const same = hasSamePeriodData ? group.totalSamePeriod : null;
    const diff = cur - prev;
    const pct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
    const sameDiff = hasSamePeriodData ? (cur - (same || 0)) : null;
    const samePct = (hasSamePeriodData && (same || 0) > 0) ? ((cur - (same || 0)) / (same || 1)) * 100 : null;
    return { cur, prev, diff, pct, same, sameDiff, samePct };
  }

  let cur = 0;
  let prev = 0;
  let same: number | null = null;

  if (financialCategory === 'revenue') {
    cur = group.totalCurrentRevenue;
    prev = group.totalPrevRevenue;
    same = hasSamePeriodData ? group.totalSamePeriodRevenue : null;
  } else if (financialCategory === 'profit') {
    cur = group.totalCurrentProfit;
    prev = group.totalPrevProfit;
    same = hasSamePeriodData ? group.totalSamePeriodProfit : null;
  } else {
    // cost
    if (costSubtype === 'medic') {
      cur = group.totalCurrentMedicCost;
      prev = group.totalPrevMedicCost;
      same = hasSamePeriodData ? group.totalSamePeriodMedicCost : null;
    } else if (costSubtype === 'vtth') {
      cur = group.totalCurrentVtthCost;
      prev = group.totalPrevVtthCost;
      same = hasSamePeriodData ? group.totalSamePeriodVtthCost : null;
    } else if (costSubtype === 'labor') {
      cur = group.totalCurrentLaborCost;
      prev = group.totalPrevLaborCost;
      same = hasSamePeriodData ? group.totalSamePeriodLaborCost : null;
    } else {
      // all
      cur = group.totalCurrentTotalCost;
      prev = group.totalPrevTotalCost;
      same = hasSamePeriodData ? group.totalSamePeriodTotalCost : null;
    }
  }

  const diff = cur - prev;
  const pct = prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  const sameDiff = hasSamePeriodData && same !== null ? (cur - same) : null;
  const samePct = (hasSamePeriodData && same !== null && same !== 0) ? ((cur - same) / Math.abs(same)) * 100 : null;
  return { cur, prev, diff, pct, same, sameDiff, samePct };
}

export async function exportSpecialtyComparisonExcel(
  groups: SpecialtyReportGroup[],
  periodMeta: PeriodMetadata,
  config: ComparisonConfig,
  showDiff: boolean = true,
  metricMode: 'count' | 'revenue' = 'count',
  financialCategory: FinancialCategory = 'revenue',
  costSubtype: CostSubtype = 'all'
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SurgicalDataPro';
  wb.created = new Date();
  const isRev = metricMode === 'revenue';
  const finLabel = getFinancialLabel(financialCategory, costSubtype);
  const unitLabel = isRev ? 'VNĐ' : 'ca';

  // ═══════════════════════════════════════════════════════════════════════
  // SHEET 1: TỔNG HỢP TOÀN VIỆN (Tất cả chuyên khoa)
  // ═══════════════════════════════════════════════════════════════════════
  const wsAll = wb.addWorksheet('Tổng hợp toàn viện', { views: [{ showGridLines: true }] });

  // Định nghĩa cột cho sheet Tổng hợp
  const allCols: Partial<ExcelJS.Column>[] = [
    { key: 'tenKT', width: 44 },
    { key: 'specialty', width: 22 },
    { key: 'current', width: isRev ? 16 : 13 },
    { key: 'prev', width: isRev ? 16 : 13 },
  ];
  if (showDiff) {
    allCols.push({ key: 'prevDiff', width: isRev ? 16 : 14 });
  }
  allCols.push({ key: 'prevChange', width: 15 });
  allCols.push({ key: 'samePeriod', width: isRev ? 16 : 13 });
  if (showDiff) {
    allCols.push({ key: 'samePeriodDiff', width: isRev ? 16 : 14 });
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
  titleCellAll.value = `BÁO CÁO PHÂN TÍCH ${isRev ? finLabel.toUpperCase() + ' ' : ''}PHẪU THUẬT TOÀN VIỆN - TẤT CẢ CHUYÊN KHOA`;
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
    `${periodMeta.currentLabel}${isRev ? ` (${finLabel})` : ''}`,
    `${periodMeta.prevLabel}${isRev ? ` (${finLabel})` : ''}`,
  ];
  if (showDiff) headerValuesAll.push(`± Kỳ trước (${unitLabel})`);
  headerValuesAll.push(periodMeta.prevColTitle);
  headerValuesAll.push(`${periodMeta.samePeriodLabel}${isRev ? ` (${finLabel})` : ''}`);
  if (showDiff) headerValuesAll.push(`± Cùng kỳ (${unitLabel})`);
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
  let grandAlertCount = 0;
  let grandPositiveCount = 0;

  for (const r of allUnifiedRows) {
    const metrics = getExportRowMetrics(r, isRev, financialCategory, costSubtype, periodMeta.hasSamePeriodData);
    if (r.status === 'ALERT') grandAlertCount++;
    if (r.status === 'POSITIVE') grandPositiveCount++;

    const curVal = metrics.isValid ? metrics.cur : '—';
    const prevVal = metrics.isValid ? metrics.prev : '—';
    const sameVal = metrics.isValid ? (periodMeta.hasSamePeriodData ? metrics.same : '') : (periodMeta.hasSamePeriodData ? '—' : '');
    const prevDiffVal = metrics.isValid ? metrics.diff : null;
    const prevChangePctVal = metrics.isValid ? metrics.pct : null;
    const sameDiffVal = (metrics.isValid && periodMeta.hasSamePeriodData) ? metrics.sameDiff : null;
    const sameChangePctVal = (metrics.isValid && periodMeta.hasSamePeriodData) ? metrics.samePct : null;

    const row = wsAll.getRow(curRowIdxAll);
    const rowValues = [
      r.tenKT,
      r.specialtyName,
      curVal,
      prevVal,
    ];
    if (showDiff) rowValues.push((prevDiffVal !== null ? fmtDiffStr(prevDiffVal) : (metrics.isValid ? '' : '—')) as any);
    rowValues.push((prevChangePctVal !== null ? fmtPctStr(prevChangePctVal) : (metrics.isValid ? '' : '—')) as any);
    rowValues.push(sameVal as any);
    if (showDiff) rowValues.push((sameDiffVal !== null ? fmtDiffStr(sameDiffVal) : (metrics.isValid ? '' : (periodMeta.hasSamePeriodData ? '—' : ''))) as any);
    rowValues.push((sameChangePctVal !== null ? fmtPctStr(sameChangePctVal) : (metrics.isValid ? '' : (periodMeta.hasSamePeriodData ? '—' : ''))) as any);
    rowValues.push(r.statusLabel as any);
    
    let noteText = r.note || '';
    if (!metrics.isValid) {
      noteText = noteText ? `${noteText} (Chưa có định mức CP)` : 'Chưa có định mức CP';
    }
    rowValues.push(noteText as any);

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

  // Summary Row Sheet 1: Grand total aggregated from groups
  let grandTotalCur = 0;
  let grandTotalPrev = 0;
  let grandTotalSame = 0;
  for (const g of groups) {
    const gMetrics = getExportGroupMetrics(g, isRev, financialCategory, costSubtype, periodMeta.hasSamePeriodData);
    grandTotalCur += gMetrics.cur;
    grandTotalPrev += gMetrics.prev;
    grandTotalSame += (gMetrics.same || 0);
  }

  const summaryRowAll = wsAll.getRow(curRowIdxAll);
  const grandPrevDiff = grandTotalCur - grandTotalPrev;
  const grandPrevChange = grandTotalPrev !== 0 ? ((grandTotalCur - grandTotalPrev) / Math.abs(grandTotalPrev)) * 100 : null;
  const grandSameDiff = periodMeta.hasSamePeriodData ? (grandTotalCur - grandTotalSame) : null;
  const grandSameChange = (periodMeta.hasSamePeriodData && grandTotalSame !== 0)
    ? ((grandTotalCur - grandTotalSame) / Math.abs(grandTotalSame)) * 100
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
  // CÁC SHEET CHUYÊN KHOA RIÊNG BIỆT
  // ═══════════════════════════════════════════════════════════════════════
  for (const group of groups) {
    const sheetName = group.specialty.name.substring(0, 31);
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

    const specCols: Partial<ExcelJS.Column>[] = [
      { key: 'tenKT', width: 48 },
      { key: 'current', width: isRev ? 16 : 13 },
      { key: 'prev', width: isRev ? 16 : 13 },
    ];
    if (showDiff) {
      specCols.push({ key: 'prevDiff', width: isRev ? 16 : 14 });
    }
    specCols.push({ key: 'prevChange', width: 15 });
    specCols.push({ key: 'samePeriod', width: isRev ? 16 : 13 });
    if (showDiff) {
      specCols.push({ key: 'samePeriodDiff', width: isRev ? 16 : 14 });
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
    titleCell.value = `PHÂN TÍCH ${isRev ? finLabel.toUpperCase() + ' ' : ''}PHẪU THUẬT - ${group.specialty.name.toUpperCase()}`;
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
      `${periodMeta.currentLabel}${isRev ? ` (${finLabel})` : ''}`,
      `${periodMeta.prevLabel}${isRev ? ` (${finLabel})` : ''}`,
    ];
    if (showDiff) headerValues.push(`± Kỳ trước (${unitLabel})`);
    headerValues.push(periodMeta.prevColTitle);
    headerValues.push(`${periodMeta.samePeriodLabel}${isRev ? ` (${finLabel})` : ''}`);
    if (showDiff) headerValues.push(`± Cùng kỳ (${unitLabel})`);
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
      const metrics = getExportRowMetrics(r, isRev, financialCategory, costSubtype, periodMeta.hasSamePeriodData);
      const curVal = metrics.isValid ? metrics.cur : '—';
      const prevVal = metrics.isValid ? metrics.prev : '—';
      const sameVal = metrics.isValid ? (periodMeta.hasSamePeriodData ? metrics.same : '') : (periodMeta.hasSamePeriodData ? '—' : '');
      const prevDiffVal = metrics.isValid ? metrics.diff : null;
      const prevChangePctVal = metrics.isValid ? metrics.pct : null;
      const sameDiffVal = (metrics.isValid && periodMeta.hasSamePeriodData) ? metrics.sameDiff : null;
      const sameChangePctVal = (metrics.isValid && periodMeta.hasSamePeriodData) ? metrics.samePct : null;

      const row = ws.getRow(curRowIdx);
      const rowValues = [
        r.tenKT,
        curVal,
        prevVal,
      ];
      if (showDiff) rowValues.push((prevDiffVal !== null ? fmtDiffStr(prevDiffVal) : (metrics.isValid ? '' : '—')) as any);
      rowValues.push((prevChangePctVal !== null ? fmtPctStr(prevChangePctVal) : (metrics.isValid ? '' : '—')) as any);
      rowValues.push(sameVal as any);
      if (showDiff) rowValues.push((sameDiffVal !== null ? fmtDiffStr(sameDiffVal) : (metrics.isValid ? '' : (periodMeta.hasSamePeriodData ? '—' : ''))) as any);
      rowValues.push((sameChangePctVal !== null ? fmtPctStr(sameChangePctVal) : (metrics.isValid ? '' : (periodMeta.hasSamePeriodData ? '—' : ''))) as any);
      rowValues.push(r.statusLabel as any);
      
      let noteText = r.note || '';
      if (!metrics.isValid) {
        noteText = noteText ? `${noteText} (Chưa có định mức CP)` : 'Chưa có định mức CP';
      }
      rowValues.push(noteText as any);

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
    const gMetrics = getExportGroupMetrics(group, isRev, financialCategory, costSubtype, periodMeta.hasSamePeriodData);
    const curTot = gMetrics.cur;
    const prevTot = gMetrics.prev;
    const sameTot = gMetrics.same || 0;

    const prevDiff = curTot - prevTot;
    const prevTotalChange = prevTot !== 0 ? ((curTot - prevTot) / Math.abs(prevTot)) * 100 : null;
    const sameDiff = periodMeta.hasSamePeriodData ? (curTot - sameTot) : null;
    const samePeriodTotalChange = (periodMeta.hasSamePeriodData && sameTot !== 0)
      ? ((curTot - sameTot) / Math.abs(sameTot)) * 100
      : null;

    const summaryValues = [
      'TỔNG CỘNG',
      curTot,
      prevTot,
    ];
    if (showDiff) summaryValues.push(fmtDiffStr(prevDiff) as any);
    summaryValues.push(fmtPctStr(prevTotalChange) as any);
    summaryValues.push(periodMeta.hasSamePeriodData ? (sameTot as any) : ('' as any));
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
  let fileNameSuffix = '';
  if (isRev) {
    fileNameSuffix = `_${finLabel.replace(/\s+/g, '_')}`;
  }
  a.download = periodMeta.exportFilename.replace(/\.xlsx$/i, `${fileNameSuffix}.xlsx`);
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
  showDiff: boolean = true,
  metricMode: 'count' | 'revenue' = 'count',
  financialCategory: FinancialCategory = 'revenue',
  costSubtype: CostSubtype = 'all'
): void {
  const allRows: ComparisonRow[] = [];
  groups.forEach(g => allRows.push(...g.rows));
  const isRev = metricMode === 'revenue';
  const finLabel = getFinancialLabel(financialCategory, costSubtype);
  const unitLabel = isRev ? 'VNĐ' : 'ca';

  // CSV escape helper
  const escapeCsv = (str: any) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers: string[] = [
    'Tên phẫu thuật',
    'Chuyên khoa',
    `${isRev ? finLabel : 'Số ca'} ${periodMeta.currentLabel}${isRev ? ' (VNĐ)' : ''}`,
    `${isRev ? finLabel : 'Số ca'} ${periodMeta.prevLabel}${isRev ? ' (VNĐ)' : ''}`,
  ];
  if (showDiff) {
    headers.push(`Chênh lệch so ${periodMeta.prevLabel} (${unitLabel})`);
  }
  headers.push(`Tỷ lệ so ${periodMeta.prevLabel} (%)`);
  headers.push(`${isRev ? finLabel : 'Số ca'} ${periodMeta.samePeriodLabel}${isRev ? ' (VNĐ)' : ''}`);
  if (showDiff) {
    headers.push(`Chênh lệch so cùng kỳ ${periodMeta.samePeriodLabel} (${unitLabel})`);
  }
  headers.push(`Tỷ lệ so cùng kỳ ${periodMeta.samePeriodLabel} (%)`);
  headers.push('Nhận định');
  headers.push('Ghi chú');

  const csvLines: string[] = [];
  csvLines.push(headers.map(escapeCsv).join(','));

  for (const r of allRows) {
    const metrics = getExportRowMetrics(r, isRev, financialCategory, costSubtype, periodMeta.hasSamePeriodData);
    const curVal = metrics.isValid ? metrics.cur : '—';
    const prevVal = metrics.isValid ? metrics.prev : '—';
    const sameVal = metrics.isValid ? (periodMeta.hasSamePeriodData ? metrics.same : '') : (periodMeta.hasSamePeriodData ? '—' : '');
    const prevDiffVal = metrics.isValid ? metrics.diff : '';
    const prevChangePctVal = metrics.isValid ? metrics.pct : null;
    const sameDiffVal = (metrics.isValid && periodMeta.hasSamePeriodData) ? metrics.sameDiff : '';
    const sameChangePctVal = (metrics.isValid && periodMeta.hasSamePeriodData) ? metrics.samePct : null;

    let noteText = r.note || '';
    if (!metrics.isValid) {
      noteText = noteText ? `${noteText} (Chưa có định mức CP)` : 'Chưa có định mức CP';
    }

    const line: any[] = [
      r.tenKT,
      r.specialtyName,
      curVal,
      prevVal,
    ];
    if (showDiff) line.push(prevDiffVal);
    line.push(prevChangePctVal !== null ? `${prevChangePctVal > 0 ? '+' : ''}${prevChangePctVal.toFixed(1)}%` : (metrics.isValid ? '' : '—'));
    line.push(sameVal);
    if (showDiff) line.push(sameDiffVal);
    line.push(sameChangePctVal !== null ? `${sameChangePctVal > 0 ? '+' : ''}${sameChangePctVal.toFixed(1)}%` : (metrics.isValid ? '' : (periodMeta.hasSamePeriodData ? '—' : '')));
    line.push(r.statusLabel);
    line.push(noteText);

    csvLines.push(line.map(escapeCsv).join(','));
  }

  // BOM \uFEFF ensures UTF-8 encoding is recognized by NotebookLM & Excel
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  let fileNameSuffix = '';
  if (isRev) {
    fileNameSuffix = `_${finLabel.replace(/\s+/g, '_')}`;
  }
  const csvFilename = periodMeta.exportFilename.replace(/\.xlsx$/i, `${fileNameSuffix}.csv`);
  a.download = csvFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
