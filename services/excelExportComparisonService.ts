/**
 * Excel Export Service for Specialty Comparison
 * Xuất báo cáo Excel phân tích so sánh phẫu thuật 5 chuyên khoa
 * Mỗi chuyên khoa là 1 Sheet riêng biệt chuẩn màu sắc & format y tế
 * Hỗ trợ cả chế độ Tháng đơn và Khoảng tháng linh hoạt
 */

import ExcelJS from 'exceljs';
import { SpecialtyReportGroup, ComparisonConfig, PeriodMetadata } from './specialtyComparisonService';

const FONT_NAME = 'Times New Roman';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
};

export async function exportSpecialtyComparisonExcel(
  groups: SpecialtyReportGroup[],
  periodMeta: PeriodMetadata,
  config: ComparisonConfig
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SurgicalDataPro';
  wb.created = new Date();

  for (const group of groups) {
    const sheetName = group.specialty.name.substring(0, 31);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    // ── Columns definition ──
    ws.columns = [
      { key: 'tenKT', width: 48 },
      { key: 'current', width: 14 },
      { key: 'prev', width: 14 },
      { key: 'prevChange', width: 16 },
      { key: 'samePeriod', width: 14 },
      { key: 'samePeriodChange', width: 16 },
      { key: 'status', width: 18 },
      { key: 'note', width: 34 },
    ];

    // ── Row 1: Title (Navy Blue) ──
    const titleText = `PHÂN TÍCH PHẪU THUẬT - ${group.specialty.name.toUpperCase()}`;
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = titleText;
    titleCell.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF003366' }, // Dark Navy
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // ── Row 2: Subtitle (Light Blue) ──
    const subtitleText = periodMeta.subtitle;
    ws.mergeCells('A2:H2');
    const subCell = ws.getCell('A2');
    subCell.value = subtitleText;
    subCell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: 'FF003366' } };
    subCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EDF7' }, // Soft Sky Blue
    };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 24;

    // ── Row 3: Table Headers ──
    const headerRow = ws.getRow(3);
    headerRow.values = [
      'Tên phẫu thuật',
      periodMeta.currentLabel,
      periodMeta.prevLabel,
      periodMeta.prevColTitle,
      periodMeta.samePeriodLabel,
      'So cùng kỳ',
      'Nhận định',
      'Ghi chú',
    ];
    headerRow.height = 28;

    for (let c = 1; c <= 8; c++) {
      const cell = headerRow.getCell(c);
      cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF104E8B' }, // Deep Blue Header
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF002244' } },
        bottom: { style: 'medium', color: { argb: 'FF002244' } },
        left: { style: 'thin', color: { argb: 'FF336699' } },
        right: { style: 'thin', color: { argb: 'FF336699' } },
      };
    }

    // ── Rows: Data ──
    let curRowIdx = 4;

    for (const r of group.rows) {
      const row = ws.getRow(curRowIdx);

      const fmtPctStr = (val: number | null) => {
        if (val === null) return '';
        const sign = val > 0 ? '+' : '';
        return `${sign}${val.toFixed(1)}%`;
      };

      row.values = [
        r.tenKT,
        r.currentCount,
        r.prevCount,
        fmtPctStr(r.prevChangePct),
        periodMeta.hasSamePeriodData ? r.samePeriodCount : '',
        periodMeta.hasSamePeriodData ? fmtPctStr(r.samePeriodChangePct) : '',
        r.statusLabel,
        r.note,
      ];
      row.height = 22;

      // Col A: Tên phẫu thuật
      const cellA = row.getCell(1);
      cellA.font = { name: FONT_NAME, size: 11 };
      cellA.alignment = { horizontal: 'left', vertical: 'middle' };
      cellA.border = thinBorder;

      // Col B: Kỳ hiện tại
      const cellB = row.getCell(2);
      cellB.font = { name: FONT_NAME, size: 11, bold: true };
      cellB.alignment = { horizontal: 'center', vertical: 'middle' };
      cellB.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEBF5FB' },
      };
      cellB.border = thinBorder;

      // Col C: Kỳ trước
      const cellC = row.getCell(3);
      cellC.font = { name: FONT_NAME, size: 11 };
      cellC.alignment = { horizontal: 'center', vertical: 'middle' };
      cellC.border = thinBorder;

      // Col D: So kỳ trước
      const cellD = row.getCell(4);
      cellD.font = {
        name: FONT_NAME,
        size: 11,
        bold: r.prevChangePct !== null && Math.abs(r.prevChangePct) >= 5,
        color: {
          argb: r.prevChangePct !== null && r.prevChangePct < 0 ? 'FFC00000' : (r.prevChangePct !== null && r.prevChangePct > 0 ? 'FF2E7D32' : 'FF333333'),
        },
      };
      cellD.alignment = { horizontal: 'center', vertical: 'middle' };
      cellD.border = thinBorder;

      // Col E: Cùng kỳ
      const cellE = row.getCell(5);
      cellE.font = { name: FONT_NAME, size: 11 };
      cellE.alignment = { horizontal: 'center', vertical: 'middle' };
      cellE.border = thinBorder;

      // Col F: So cùng kỳ
      const cellF = row.getCell(6);
      cellF.font = {
        name: FONT_NAME,
        size: 11,
        bold: r.samePeriodChangePct !== null && Math.abs(r.samePeriodChangePct) >= 5,
        color: {
          argb: r.samePeriodChangePct !== null && r.samePeriodChangePct < 0 ? 'FFC00000' : (r.samePeriodChangePct !== null && r.samePeriodChangePct > 0 ? 'FF2E7D32' : 'FF333333'),
        },
      };
      cellF.alignment = { horizontal: 'center', vertical: 'middle' };
      cellF.border = thinBorder;

      // Col G: Nhận định (Highlight)
      const cellG = row.getCell(7);
      cellG.border = thinBorder;
      cellG.alignment = { horizontal: 'center', vertical: 'middle' };

      if (r.status === 'ALERT') {
        cellG.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FFC00000' } };
        cellG.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFCE4D6' }, // Light Orange/Peach
        };
      } else if (r.status === 'POSITIVE') {
        cellG.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF2E7D32' } };
        cellG.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2EFDA' }, // Light Green
        };
      } else {
        cellG.font = { name: FONT_NAME, size: 11, color: { argb: 'FF666666' } };
      }

      // Col H: Ghi chú
      const cellH = row.getCell(8);
      cellH.font = { name: FONT_NAME, size: 10.5, italic: true, color: { argb: 'FF555555' } };
      cellH.alignment = { horizontal: 'left', vertical: 'middle' };
      cellH.border = thinBorder;

      curRowIdx++;
    }

    // ── Summary Row ──
    const summaryRow = ws.getRow(curRowIdx);
    const prevTotalChange = group.totalPrev > 0 ? ((group.totalCurrent - group.totalPrev) / group.totalPrev) * 100 : null;
    const samePeriodTotalChange = (periodMeta.hasSamePeriodData && group.totalSamePeriod > 0)
      ? ((group.totalCurrent - group.totalSamePeriod) / group.totalSamePeriod) * 100
      : null;

    const fmtPctTotStr = (val: number | null) => {
      if (val === null) return '';
      const sign = val > 0 ? '+' : '';
      return `${sign}${val.toFixed(1)}%`;
    };

    summaryRow.values = [
      'TỔNG CỘNG',
      group.totalCurrent,
      group.totalPrev,
      fmtPctTotStr(prevTotalChange),
      periodMeta.hasSamePeriodData ? group.totalSamePeriod : '',
      periodMeta.hasSamePeriodData ? fmtPctTotStr(samePeriodTotalChange) : '',
      '',
      `Cảnh báo: ${group.alertCount} | Tích cực: ${group.positiveCount}`,
    ];
    summaryRow.height = 26;

    for (let c = 1; c <= 8; c++) {
      const cell = summaryRow.getCell(c);
      cell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF002244' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F4F7' },
      };
      cell.alignment = { horizontal: c === 1 ? 'left' : (c === 8 ? 'left' : 'center'), vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF003366' } },
        bottom: { style: 'double', color: { argb: 'FF003366' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      };
    }
  }

  // ── Save and trigger download in browser ──
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
