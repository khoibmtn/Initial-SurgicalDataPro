/**
 * Service Package Export Service
 * Xuất danh sách Gói DVYC ra file Excel (.xlsx) với định dạng chuẩn,
 * tiêu đề, nguồn dữ liệu và ưu tiên nhân sự gán gói cho thanh toán.
 */
import ExcelJS from 'exceljs';
import type { SurgeryRecord } from '../types';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
  PositionCatalogItem,
  getPositionShortLabel,
} from '../types/servicePackage';
import type { PaymentListsContext } from '../hooks/usePaymentLists';
import type { PaymentList } from '../types/paymentList';
import { formatDate } from '../utils/dateUtils';

const FONT_TIMES = 'Times New Roman';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const headerBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF94A3B8' } },
  left: { style: 'thin', color: { argb: 'FF94A3B8' } },
  bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
  right: { style: 'thin', color: { argb: 'FF94A3B8' } },
};

export interface ServicePackageExportItem {
  record: SurgeryRecord;
  assignment?: ServicePackageAssignment;
  compositeKey: string;
}

export interface ServicePackageExportOptions {
  items?: ServicePackageExportItem[];
  records?: SurgeryRecord[];
  assignments?: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  positionCatalog?: PositionCatalogItem[];
  paymentLists?: PaymentListsContext;
  currentList?: PaymentList;
  listFilter: string; // 'all' hoặc listId cụ thể
  dateRangeText?: string;
  dateFormat?: string;
  extraPositionCols?: [string, string][]; // [key, label]
  filename?: string;
}

export const BASE_STAFF_KEYS = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc', 'gv'] as const;

function formatDischargeDate(dtStr?: string): string {
  if (!dtStr) return '';
  const d = dtStr.substring(0, 10).split('-');
  if (d.length === 3) return `${d[2]}/${d[1]}/${d[0]}`;
  return dtStr;
}

/**
 * Lấy tên nhân sự cho 1 vị trí:
 * Ưu tiên: Nếu ca đó đã gán gói và có người gán (kể cả sửa tên) -> lấy tên sửa để thanh toán.
 * Ngược lại -> lấy tên phẫu thuật viên gốc từ ca mổ.
 */
export function getAssignedOrSurgeryStaff(
  r: SurgeryRecord,
  a: ServicePackageAssignment | undefined,
  posKey: string
): string {
  if (a) {
    const sa = a.staffAssignments?.find((s) => s.positionKey === posKey);
    if (sa && sa.staffName && sa.staffName.trim()) {
      return sa.staffName.trim();
    }
  }
  const surgeryName = (r as any)[posKey];
  return typeof surgeryName === 'string' ? surgeryName.trim() : '';
}

/**
 * Lấy tên nhân sự cho vị trí ngoài phẫu thuật (chuẩn bị, tư vấn...)
 */
export function getExtraPositionStaff(
  a: ServicePackageAssignment | undefined,
  posKey: string
): string {
  if (!a) return '';
  const sa = a.staffAssignments?.find((s) => s.positionKey === posKey);
  return sa?.staffName?.trim() || '';
}

/**
 * Tạo nội dung nguồn dữ liệu cho dòng phụ đề (Subtitle)
 */
export function buildDataSourceSubtitle(
  listFilter: string,
  currentList: PaymentList | undefined,
  dateRangeText?: string
): string {
  if (listFilter !== 'all' && currentList) {
    let batchYear = '';
    if (currentList.periodKey) {
      const parts = currentList.periodKey.split('-');
      if (parts[0] && parts[0].length === 4) batchYear = parts[0];
    }
    if (!batchYear && currentList.createdAt) {
      batchYear = new Date(currentList.createdAt).getFullYear().toString();
    }
    if (!batchYear && dateRangeText) {
      const match = dateRangeText.match(/\b(20\d\d)\b/);
      if (match) batchYear = match[1];
    }
    if (!batchYear) batchYear = new Date().getFullYear().toString();

    return `Lấy dữ liệu từ đợt thanh toán yêu cầu ở danh sách "${currentList.name}" - ${batchYear}`;
  }

  const range = dateRangeText ? dateRangeText.trim() : 'kỳ báo cáo hiện tại';
  return `Lấy dữ liệu từ ${range}`;
}

/**
 * Khởi tạo workbook ExcelJS với bố cục đầy đủ
 */
export async function buildPackageListWorkbook(options: ServicePackageExportOptions): Promise<ExcelJS.Workbook> {
  const {
    items = [],
    packages = [],
    positionCatalog,
    paymentLists,
    currentList,
    listFilter,
    dateRangeText,
    dateFormat = 'dd/mm/yyyy hh:mm',
    extraPositionCols = [],
  } = options;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SurgicalDataPro';
  wb.lastModifiedBy = 'SurgicalDataPro';
  wb.created = new Date();

  const ws = wb.addWorksheet('Gói DVYC', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Tên viết tắt các vị trí trong gói theo cấu hình hoặc mặc định
  const baseStaffCols = BASE_STAFF_KEYS.map((key) => ({
    key,
    label: getPositionShortLabel(key, positionCatalog, packages),
  }));

  // Xây dựng danh sách cột
  const columns: { header: string; key: string; width: number; align?: 'left' | 'center' | 'right' }[] = [
    { header: 'STT', key: 'stt', width: 6, align: 'center' },
    { header: 'Mã KCB', key: 'patientId', width: 14, align: 'center' },
    { header: 'Họ tên', key: 'patientName', width: 22, align: 'left' },
    { header: 'Ngày PT', key: 'ngayBD', width: 17, align: 'center' },
    { header: 'Tên phẫu thuật', key: 'tenKT', width: 34, align: 'left' },
    ...baseStaffCols.map((c) => ({
      header: c.label,
      key: c.key,
      width: 17,
      align: 'left' as const,
    })),
    ...extraPositionCols.map(([k, label]) => ({
      header: getPositionShortLabel(k, positionCatalog, packages) || label,
      key: k,
      width: 17,
      align: 'left' as const,
    })),
    { header: 'Gói DVYC', key: 'goiDV', width: 26, align: 'left' },
    { header: 'Ngày RV', key: 'raVien', width: 13, align: 'center' },
    { header: 'Đợt thanh toán', key: 'thanhToan', width: 18, align: 'center' },
  ];

  const totalCols = columns.length;

  // Hàng 1: Tiêu đề chính
  const titleRow = ws.addRow(['DANH SÁCH GÓI DỊCH VỤ YÊU CẦU']);
  titleRow.height = 30;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { name: FONT_TIMES, size: 15, bold: true, color: { argb: 'FF0F766E' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Hàng 2: Nguồn dữ liệu (Subtitle)
  const subtitleText = buildDataSourceSubtitle(listFilter, currentList, dateRangeText);
  const subtitleRow = ws.addRow([subtitleText]);
  subtitleRow.height = 20;
  ws.mergeCells(2, 1, 2, totalCols);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.font = { name: FONT_TIMES, size: 11, italic: true, color: { argb: 'FF475569' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Hàng 3: Hàng trống cách đoạn
  const blankRow = ws.addRow([]);
  blankRow.height = 8;

  // Hàng 4: Header của bảng dữ liệu
  const headerRowValues = columns.map((c) => c.header);
  const headerRow = ws.addRow(headerRowValues);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_TIMES, size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F4EA' }, // Nền xanh ngọc nhạt thanh lịch
    };
    cell.border = headerBorder;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // Hàng 5+: Bảng dữ liệu
  items.forEach((item, idx) => {
    const { record: r, assignment: a } = item;
    const pid = (r.patientId || a?.patientId || '').trim();
    const patientName = (r.patientName || a?.patientName || '').trim();
    const tenKT = (r.tenKT || a?.tenKT || '').trim();

    // Ngày phẫu thuật
    const ngayBDFormatted = r.ngayBD ? formatDate(r.ngayBD, dateFormat) : '';

    // Kíp mổ cơ bản: ưu tiên tên sửa/gán gói
    const staffValues: Record<string, string> = {};
    for (const col of baseStaffCols) {
      staffValues[col.key] = getAssignedOrSurgeryStaff(r, a, col.key);
    }

    // Các vị trí ngoài phẫu thuật
    for (const [key] of extraPositionCols) {
      staffValues[key] = getExtraPositionStaff(a, key);
    }

    // Tên gói
    let packageName = '';
    if (a) {
      if (a.packageName) {
        packageName = a.packageName;
      } else {
        const pkg = packages.find((p) => p.id === a.packageId || p.name === a.packageName);
        packageName = pkg?.shortName || pkg?.name || a.packageId || '';
      }
    }

    // Ngày ra viện
    let ngayRaStr = '';
    if (paymentLists?.discharge) {
      const dc = paymentLists.discharge[pid];
      if (dc?.ngayRa) {
        ngayRaStr = formatDischargeDate(dc.ngayRa);
      }
    }

    // Đợt thanh toán
    let batchNameStr = '';
    if (currentList) {
      batchNameStr = currentList.name;
    } else if (paymentLists?.membershipIndex) {
      const m = paymentLists.membershipIndex.get(pid);
      if (m) batchNameStr = m.listName;
    }

    const rowValues = [
      idx + 1,
      pid,
      patientName,
      ngayBDFormatted,
      tenKT,
      ...baseStaffCols.map((c) => staffValues[c.key] || ''),
      ...extraPositionCols.map(([k]) => staffValues[k] || ''),
      packageName,
      ngayRaStr,
      batchNameStr,
    ];

    const dataRow = ws.addRow(rowValues);
    // Để Excel tự tính chiều cao dòng theo wrapText, không đặt height cố định

    dataRow.eachCell((cell, colNumber) => {
      const colDef = columns[colNumber - 1];
      cell.font = { name: FONT_TIMES, size: 11, color: { argb: 'FF1E293B' } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef?.align || 'left',
        wrapText: true,
      };

      // Đảm bảo Mã KCB là kiểu text để không mất số 0
      if (colDef?.key === 'patientId') {
        cell.numFmt = '@';
      }
    });
  });

  // Hàng Tổng kết số lượng ca (Không gộp ô, để chữ hiển thị tự nhiên đè sang ô bên cạnh)
  const summaryRow = ws.addRow([`Tổng cộng: ${items.length} ca`]);
  summaryRow.height = 24;
  const summaryCell = ws.getCell(summaryRow.number, 1);
  summaryCell.font = { name: FONT_TIMES, size: 11, bold: true, color: { argb: 'FF0F766E' } };
  summaryCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };

  // Viền trên & dưới cho hàng tổng kết, không có viền dọc giữa các ô để chữ tràn tự nhiên
  for (let c = 1; c <= totalCols; c++) {
    ws.getCell(summaryRow.number, c).border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: c === 1 ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
      right: c === totalCols ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
    };
  }

  // Cân chỉnh độ rộng cột
  columns.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = col.width;
  });

  return wb;
}

/**
 * Xuất và kích hoạt tải file Excel xuống máy người dùng
 */
export async function exportPackageListToExcel(options: ServicePackageExportOptions): Promise<void> {
  const wb = await buildPackageListWorkbook(options);

  const cleanName = options.currentList
    ? options.currentList.name.replace(/[/\\:*?"<>|]/g, '_')
    : options.dateRangeText
    ? options.dateRangeText.replace(/[/\\:*?"<>|]/g, '_')
    : 'Tat_ca';

  const defaultFilename = `DS_Goi_DVYC_${cleanName}.xlsx`;
  const filename = options.filename || defaultFilename;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
