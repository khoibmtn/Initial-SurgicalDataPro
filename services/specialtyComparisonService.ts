/**
 * Specialty Comparison Service
 * Phân tích so sánh số lượng phẫu thuật theo 5 chuyên khoa:
 * - Ngoại tổng hợp
 * - Chấn thương chỉnh hình
 * - Mắt
 * - Tai Mũi Họng
 * - Phụ sản
 *
 * Hỗ trợ 2 chế độ:
 * 1. Chế độ Tháng (mặc định): So sánh 1 tháng cụ thể (T_m/Y) với tháng liền kề (T_{m-1}/Y) và cùng kỳ (T_m/Y-1).
 * 2. Chế độ Khoảng (linh hoạt): So sánh từ tháng X đến tháng Y của năm Z với kỳ liền kề trước đó (K tháng) và cùng kỳ năm trước (Z-1).
 */

import { reportService } from './reportService';
import { PersistedSurgeryRecord, StaffMember } from '../types';

export type SpecialtyCode = 'ngoai_th' | 'ctch' | 'mat' | 'tmh' | 'phu_san';

export interface SpecialtyMeta {
  code: SpecialtyCode;
  name: string;
  shortName: string;
  icon?: string;
  color: string;
}

export const SPECIALTIES: SpecialtyMeta[] = [
  { code: 'ngoai_th', name: 'Ngoại tổng hợp', shortName: 'Ngoại TH', color: 'blue' },
  { code: 'ctch', name: 'Chấn thương chỉnh hình', shortName: 'CTCH', color: 'indigo' },
  { code: 'mat', name: 'Mắt', shortName: 'Mắt', color: 'amber' },
  { code: 'tmh', name: 'Tai Mũi Họng', shortName: 'TMH', color: 'cyan' },
  { code: 'phu_san', name: 'Phụ sản', shortName: 'Phụ sản', color: 'rose' },
];

export type ComparisonStatus = 'ALERT' | 'POSITIVE' | 'NORMAL';

export interface ComparisonRow {
  tenKT: string;
  specialty: SpecialtyCode;
  specialtyName: string;
  currentCount: number;
  prevCount: number;
  prevChangePct: number | null;
  samePeriodCount: number;
  samePeriodChangePct: number | null;
  status: ComparisonStatus;
  statusLabel: 'CẢNH BÁO' | 'TÍCH CỰC' | 'ỔN ĐỊNH';
  note: string;
}

export interface SpecialtyReportGroup {
  specialty: SpecialtyMeta;
  rows: ComparisonRow[];
  totalCurrent: number;
  totalPrev: number;
  totalSamePeriod: number;
  alertCount: number;
  positiveCount: number;
  normalCount: number;
}

export interface ComparisonConfig {
  alertThreshold: number;   // Mặc định 10 (%)
  positiveThreshold: number; // Mặc định 5 (%)
}

export const DEFAULT_COMPARISON_CONFIG: ComparisonConfig = {
  alertThreshold: 10,
  positiveThreshold: 5,
};

const STORAGE_CONFIG_KEY = 'sdp_comparison_threshold_config';

export function getComparisonThresholdConfig(): ComparisonConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        alertThreshold: typeof parsed.alertThreshold === 'number' ? parsed.alertThreshold : DEFAULT_COMPARISON_CONFIG.alertThreshold,
        positiveThreshold: typeof parsed.positiveThreshold === 'number' ? parsed.positiveThreshold : DEFAULT_COMPARISON_CONFIG.positiveThreshold,
      };
    }
  } catch (e) {
    console.error('Error loading comparison config:', e);
  }
  return DEFAULT_COMPARISON_CONFIG;
}

export function saveComparisonThresholdConfig(cfg: Partial<ComparisonConfig>): void {
  try {
    const current = getComparisonThresholdConfig();
    const updated = { ...current, ...cfg };
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Error saving comparison config:', e);
  }
}

// ───────────────── CẤU TRÚC KỲ PHÂN TÍCH ─────────────────

export interface PeriodSpec {
  mode: 'single' | 'range';
  // Single mode
  targetMonth: number;
  targetYear: number;
  // Range mode
  fromMonth?: number;
  fromYear?: number;
  toMonth?: number;
  toYear?: number;
}

export interface PeriodMetadata {
  mode: 'single' | 'range';
  currentLabel: string;        // e.g. "T7/2026" hoặc "T7-T9/2026"
  prevLabel: string;           // e.g. "T6/2026" hoặc "T4-T6/2026"
  samePeriodLabel: string;     // e.g. "T7/2025" hoặc "T7-T9/2025"
  prevColTitle: string;        // "So tháng trước" hoặc "So kỳ trước"
  subtitle: string;            // Phụ đề đầy đủ
  exportFilename: string;      // Tên file Excel
  hasSamePeriodData: boolean;  // True nếu có dữ liệu cùng kỳ
  hasPrevData: boolean;        // True nếu có dữ liệu kỳ trước
}

export interface ComparisonAnalysisResult {
  groups: SpecialtyReportGroup[];
  periodMeta: PeriodMetadata;
}

// ───────────────── PHÂN LOẠI CHUYÊN KHOA THÔNG MINH ─────────────────

const KEYWORDS_MAT = [
  'mộng', 'quặm', 'u mi', 'kết mạc', 'thể thủy tinh', 'thuy tinh the', 'giác mạc', 'giac mac',
  'võng mạc', 'vong mac', 'glôcôm', 'glocom', 'cườm', 'nhãn cầu', 'nhan cau', 'lệ đạo', 'le dao',
  'túi lệ', 'tui le', 'da mi', 'khâu mi', 'bóc mộng', 'tật khúc xạ', 'lasik', 'phaco', 'bệnh mắt',
  'khoét củng mạc', 'cắt mống mắt', 'mắt'
];

const KEYWORDS_TMH = [
  'amidan', 'a-mi-đan', 'v.a', 'va ', 'nạo va', 'vành tai', 'dái tai', 'u bã đậu dái tai', 'u nang vành tai',
  'vách ngăn', 'vẹo vách ngăn', 'xoang', 'nội soi mũi xoang', 'thanh quản', 'hạt xơ thanh dây',
  'polyp thanh quản', 'polyp mũi', 'màng nhĩ', 'vá nhĩ', 'viêm tai giữa', 'xương chũm',
  'rò luân nhĩ', 'cầm máu mũi', 'tai mũi họng', 'tai-mũi-họng', 'thanh nhiệt', 'mũi', 'họng', 'tai '
];

const KEYWORDS_PHU_SAN = [
  'lấy thai', 'mổ đẻ', 'thai ngoài tử cung', 'chửa ngoài tử cung', 'u nang buồng trứng', 'buồng trứng',
  'cắt tử cung', 'tử cung', 'bóc nhân xơ tử cung', 'sa sinh dục', 'sa tử cung', 'chửa trứng',
  'khâu vòng cổ tử cung', 'nạo hút thai', 'phá thai', 'soi cổ tử cung', 'vòi tử cung', 'phần phụ',
  'tầng sinh môn', 'khâu tầng sinh môn', 'bóc u nang buồng trứng', 'thai ', 'sản khoa', 'phụ khoa'
];

const KEYWORDS_CTCH = [
  'gãy xương', 'gay xuong', 'xương', 'xuong', 'kết hợp xương', 'ket hop xuong', 'tháo phương tiện',
  'tháo nẹp', 'thao nep', 'rút đinh', 'rut dinh', 'tháo đinh', 'thao dinh', 'tháo vít', 'thao vit',
  'nẹp vít', 'nep vit', 'đinh nội tủy', 'dinh noi tuy', 'xuyên kim', 'xuyen kim', 'kirschner',
  'khớp', 'khop', 'khớp háng', 'khop hang', 'khớp gối', 'khop goi', 'khớp vai', 'khop vai',
  'khớp cổ chân', 'khop co chan', 'khớp khuỷu', 'khop khuyu', 'khớp cổ tay', 'khop co tay',
  'dây chằng', 'day chang', 'tái tạo dây chằng', 'tai tao day chang', 'sụn chêm', 'sun chem',
  'nội soi khớp', 'noi soi khop', 'trật khớp', 'trat khop', 'thay khớp', 'thay khop',
  'đứt gân', 'dut gan', 'gân', 'gan ', 'nối gân', 'noi gan', 'chuyển gân', 'chuyen gan',
  'bao hoạt dịch', 'nang bao hoạt dịch', 'ống cổ tay', 'ong co tay', 'ngón tay lò xo', 'ngon tay co sung',
  'ngón tay cò súng', 'cắt cụt', 'tháo ngón', 'tháo đốt', 'bó bột', 'nắn chỉnh', 'chỉnh hình',
  'khuyết hổng phần mềm chi', 'viêm xương tủy', 'xương đòn', 'xương cánh tay', 'xương cẳng tay',
  'xương quay', 'xương trụ', 'xương đùi', 'xương bánh chè', 'xương chày', 'xương mác', 'xương gót'
];

function toSearchString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();
}

export function classifySpecialty(
  tenKT: string,
  ptChinhName?: string,
  staffList?: StaffMember[]
): SpecialtyCode {
  const normKT = toSearchString(tenKT);

  for (const kw of KEYWORDS_MAT) {
    if (normKT.includes(toSearchString(kw))) return 'mat';
  }

  for (const kw of KEYWORDS_TMH) {
    if (normKT.includes(toSearchString(kw))) return 'tmh';
  }

  for (const kw of KEYWORDS_PHU_SAN) {
    if (normKT.includes(toSearchString(kw))) return 'phu_san';
  }

  if (ptChinhName && staffList && staffList.length > 0) {
    const cleanDoc = ptChinhName.trim().toLowerCase();
    const docStaff = staffList.find(s => s.name.trim().toLowerCase() === cleanDoc);
    if (docStaff && docStaff.department) {
      const deptNorm = toSearchString(docStaff.department);
      if (deptNorm.includes('mat')) return 'mat';
      if (deptNorm.includes('tai mui hong') || deptNorm.includes('tmh')) return 'tmh';
      if (deptNorm.includes('san') || deptNorm.includes('phu san')) return 'phu_san';
    }
  }

  for (const kw of KEYWORDS_CTCH) {
    if (normKT.includes(toSearchString(kw))) return 'ctch';
  }

  if (ptChinhName && staffList && staffList.length > 0) {
    const cleanDoc = ptChinhName.trim().toLowerCase();
    const docStaff = staffList.find(s => s.name.trim().toLowerCase() === cleanDoc);
    if (docStaff && docStaff.department) {
      const deptNorm = toSearchString(docStaff.department);
      if (deptNorm.includes('chan thuong') || deptNorm.includes('ctch') || deptNorm.includes('chinh hinh')) {
        return 'ctch';
      }
    }
  }

  return 'ngoai_th';
}

// ───────────────── TÍNH TOÁN DỮ LIỆU SO SÁNH ─────────────────

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Lấy danh sách bản ghi trong một khoảng ngày ISO
 */
async function getRecordsBetweenDates(dateFrom: string, dateTo: string): Promise<PersistedSurgeryRecord[]> {
  try {
    const [monthly, daily] = await Promise.all([
      reportService.getReports(dateFrom, dateTo, 'MONTHLY'),
      reportService.getReports(dateFrom, dateTo, 'DAILY'),
    ]);

    if (monthly && monthly.length > 0) return monthly;
    return daily || [];
  } catch (error) {
    console.error(`Error fetching records from ${dateFrom} to ${dateTo}:`, error);
    return [];
  }
}

/**
 * Tính toán mốc thời gian và nhãn cho 3 kỳ phân tích
 */
export function computePeriodDefinitions(spec: PeriodSpec, config: ComparisonConfig): {
  currentDateFrom: string;
  currentDateTo: string;
  prevDateFrom: string;
  prevDateTo: string;
  samePeriodDateFrom: string;
  samePeriodDateTo: string;
  meta: PeriodMetadata;
} {
  if (spec.mode === 'single') {
    const m = spec.targetMonth;
    const y = spec.targetYear;

    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) {
      prevM = 12;
      prevY = y - 1;
    }
    const sameM = m;
    const sameY = y - 1;

    const currentLastDay = daysInMonth(m, y);
    const prevLastDay = daysInMonth(prevM, prevY);
    const sameLastDay = daysInMonth(sameM, sameY);

    const currentDateFrom = `${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`;
    const currentDateTo = `${y}-${String(m).padStart(2, '0')}-${String(currentLastDay).padStart(2, '0')}T23:59:59.999Z`;

    const prevDateFrom = `${prevY}-${String(prevM).padStart(2, '0')}-01T00:00:00.000Z`;
    const prevDateTo = `${prevY}-${String(prevM).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}T23:59:59.999Z`;

    const samePeriodDateFrom = `${sameY}-${String(sameM).padStart(2, '0')}-01T00:00:00.000Z`;
    const samePeriodDateTo = `${sameY}-${String(sameM).padStart(2, '0')}-${String(sameLastDay).padStart(2, '0')}T23:59:59.999Z`;

    const currentLabel = `T${m}/${y}`;
    const prevLabel = `T${prevM}/${prevY}`;
    const samePeriodLabel = `T${sameM}/${sameY}`;

    const subtitle = `So sánh tháng ${m}/${y} với tháng ${prevM}/${prevY} và tháng ${sameM}/${sameY}. Ngưỡng tích cực từ ${config.positiveThreshold}%; cảnh báo khi giảm từ ${config.alertThreshold}% hoặc không phát sinh trong kỳ hiện tại.`;
    const exportFilename = `Phan_tich_so_sanh_phau_thuat_T${m}_${y}.xlsx`;

    return {
      currentDateFrom,
      currentDateTo,
      prevDateFrom,
      prevDateTo,
      samePeriodDateFrom,
      samePeriodDateTo,
      meta: {
        mode: 'single',
        currentLabel,
        prevLabel,
        samePeriodLabel,
        prevColTitle: 'So tháng trước',
        subtitle,
        exportFilename,
        hasSamePeriodData: true,
        hasPrevData: true,
      },
    };
  } else {
    // Range mode
    const fromM = spec.fromMonth || 1;
    const fromY = spec.fromYear || spec.targetYear || new Date().getFullYear();
    const toM = spec.toMonth || fromM;
    const toY = spec.toYear || fromY;

    // Tổng số tháng K
    const kMonths = (toY - fromY) * 12 + (toM - fromM) + 1;

    // 1. Kỳ hiện tại
    const currentLastDay = daysInMonth(toM, toY);
    const currentDateFrom = `${fromY}-${String(fromM).padStart(2, '0')}-01T00:00:00.000Z`;
    const currentDateTo = `${toY}-${String(toM).padStart(2, '0')}-${String(currentLastDay).padStart(2, '0')}T23:59:59.999Z`;

    // 2. Kỳ trước (Lùi kMonths tháng từ trước fromM/fromY)
    let prevEndM = fromM - 1;
    let prevEndY = fromY;
    if (prevEndM === 0) {
      prevEndM = 12;
      prevEndY = fromY - 1;
    }

    const prevStartTotalMonths = (prevEndY * 12 + prevEndM - 1) - (kMonths - 1);
    const prevStartY = Math.floor(prevStartTotalMonths / 12);
    const prevStartM = (prevStartTotalMonths % 12) + 1;

    const prevLastDay = daysInMonth(prevEndM, prevEndY);
    const prevDateFrom = `${prevStartY}-${String(prevStartM).padStart(2, '0')}-01T00:00:00.000Z`;
    const prevDateTo = `${prevEndY}-${String(prevEndM).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}T23:59:59.999Z`;

    // 3. Cùng kỳ năm trước (Cùng khoảng fromM..toM của năm trước)
    const samePeriodStartY = fromY - 1;
    const samePeriodEndY = toY - 1;
    const samePeriodLastDay = daysInMonth(toM, samePeriodEndY);

    const samePeriodDateFrom = `${samePeriodStartY}-${String(fromM).padStart(2, '0')}-01T00:00:00.000Z`;
    const samePeriodDateTo = `${samePeriodEndY}-${String(toM).padStart(2, '0')}-${String(samePeriodLastDay).padStart(2, '0')}T23:59:59.999Z`;

    // Nhãn hiển thị
    const formatRangeLabel = (startM: number, startY: number, endM: number, endY: number) => {
      if (startM === endM && startY === endY) {
        return `T${startM}/${startY}`;
      }
      if (startY === endY) {
        return `T${startM}-T${endM}/${startY}`;
      }
      return `T${startM}/${startY}-T${endM}/${endY}`;
    };

    const currentLabel = formatRangeLabel(fromM, fromY, toM, toY);
    const prevLabel = formatRangeLabel(prevStartM, prevStartY, prevEndM, prevEndY);
    const samePeriodLabel = formatRangeLabel(fromM, samePeriodStartY, toM, samePeriodEndY);

    const subtitle = `So sánh giai đoạn ${currentLabel} với ${prevLabel} và cùng kỳ ${samePeriodLabel}. Ngưỡng tích cực từ ${config.positiveThreshold}%; cảnh báo khi giảm từ ${config.alertThreshold}% hoặc không phát sinh trong kỳ hiện tại.`;
    const exportFilename = `Phan_tich_so_sanh_phau_thuat_T${fromM}_T${toM}_${fromY}.xlsx`;

    return {
      currentDateFrom,
      currentDateTo,
      prevDateFrom,
      prevDateTo,
      samePeriodDateFrom,
      samePeriodDateTo,
      meta: {
        mode: 'range',
        currentLabel,
        prevLabel,
        samePeriodLabel,
        prevColTitle: 'So kỳ trước',
        subtitle,
        exportFilename,
        hasSamePeriodData: true,
        hasPrevData: true,
      },
    };
  }
}

/**
 * Lấy dữ liệu phân tích so sánh đầy đủ (hỗ trợ cả Tháng và Khoảng)
 */
export async function getSpecialtyComparisonData(
  periodSpec: PeriodSpec,
  staffList: StaffMember[],
  thresholdConfig?: ComparisonConfig
): Promise<ComparisonAnalysisResult> {
  const config = thresholdConfig || getComparisonThresholdConfig();
  const defs = computePeriodDefinitions(periodSpec, config);

  // Lấy dữ liệu 3 kỳ song song
  const [currentRecords, prevRecords, samePeriodRecords] = await Promise.all([
    getRecordsBetweenDates(defs.currentDateFrom, defs.currentDateTo),
    getRecordsBetweenDates(defs.prevDateFrom, defs.prevDateTo),
    getRecordsBetweenDates(defs.samePeriodDateFrom, defs.samePeriodDateTo),
  ]);

  const hasSamePeriodData = samePeriodRecords.length > 0;
  const hasPrevData = prevRecords.length > 0;
  defs.meta.hasSamePeriodData = hasSamePeriodData;
  defs.meta.hasPrevData = hasPrevData;

  interface ItemCounter {
    displayName: string;
    specialty: SpecialtyCode;
    current: number;
    prev: number;
    samePeriod: number;
  }

  const itemsMap = new Map<string, ItemCounter>();

  const registerRecord = (
    r: PersistedSurgeryRecord,
    period: 'current' | 'prev' | 'samePeriod'
  ) => {
    if (!r.tenKT) return;
    const specialty = classifySpecialty(r.tenKT, r.ptChinh, staffList);
    const normName = r.tenKT.trim().toLowerCase().replace(/\s+/g, ' ');
    const key = `${specialty}:::${normName}`;

    if (!itemsMap.has(key)) {
      itemsMap.set(key, {
        displayName: r.tenKT.trim(),
        specialty,
        current: 0,
        prev: 0,
        samePeriod: 0,
      });
    }

    const item = itemsMap.get(key)!;
    if (period === 'current') item.current += (r.soLuong || 1);
    else if (period === 'prev') item.prev += (r.soLuong || 1);
    else if (period === 'samePeriod') item.samePeriod += (r.soLuong || 1);
  };

  currentRecords.forEach(r => registerRecord(r, 'current'));
  prevRecords.forEach(r => registerRecord(r, 'prev'));
  samePeriodRecords.forEach(r => registerRecord(r, 'samePeriod'));

  const allRows: ComparisonRow[] = [];

  itemsMap.forEach(item => {
    const cur = item.current;
    const prev = item.prev;
    const same = item.samePeriod;

    // Tính % so kỳ trước
    let prevChangePct: number | null = null;
    if (prev > 0) {
      prevChangePct = ((cur - prev) / prev) * 100;
    }

    // Tính % so cùng kỳ (chỉ tính khi có dữ liệu cùng kỳ)
    let samePeriodChangePct: number | null = null;
    if (hasSamePeriodData && same > 0) {
      samePeriodChangePct = ((cur - same) / same) * 100;
    }

    // Đánh giá Nhận định & Ghi chú
    let status: ComparisonStatus = 'NORMAL';
    let statusLabel: 'CẢNH BÁO' | 'TÍCH CỰC' | 'ỔN ĐỊNH' = 'ỔN ĐỊNH';
    let note = '';

    const alertThreshold = config.alertThreshold;
    const positiveThreshold = config.positiveThreshold;

    // 1. Không phát sinh trong kỳ hiện tại
    if (cur === 0 && (prev > 0 || (hasSamePeriodData && same > 0))) {
      status = 'ALERT';
      statusLabel = 'CẢNH BÁO';
      note = `Không phát sinh trong ${defs.meta.currentLabel}`;
    }
    // 2. Mới phát sinh trong kỳ hiện tại
    else if (cur > 0 && prev === 0 && (!hasSamePeriodData || same === 0)) {
      status = 'POSITIVE';
      statusLabel = 'TÍCH CỰC';
      note = `Mới phát sinh trong ${defs.meta.currentLabel}`;
    }
    // 3. CẢNH BÁO: Giảm >= ngưỡng ở kỳ trước HOẶC cùng kỳ
    else if (
      (prevChangePct !== null && prevChangePct <= -alertThreshold) ||
      (hasSamePeriodData && samePeriodChangePct !== null && samePeriodChangePct <= -alertThreshold)
    ) {
      status = 'ALERT';
      statusLabel = 'CẢNH BÁO';
    }
    // 4. TÍCH CỰC: Tăng >= ngưỡng ở kỳ trước HOẶC cùng kỳ
    else if (
      (prevChangePct !== null && prevChangePct >= positiveThreshold) ||
      (hasSamePeriodData && samePeriodChangePct !== null && samePeriodChangePct >= positiveThreshold)
    ) {
      status = 'POSITIVE';
      statusLabel = 'TÍCH CỰC';
    }

    const specMeta = SPECIALTIES.find(s => s.code === item.specialty)!;

    allRows.push({
      tenKT: item.displayName,
      specialty: item.specialty,
      specialtyName: specMeta.name,
      currentCount: cur,
      prevCount: prev,
      prevChangePct,
      samePeriodCount: hasSamePeriodData ? same : 0,
      samePeriodChangePct,
      status,
      statusLabel,
      note,
    });
  });

  // Gom theo từng Chuyên khoa và sắp xếp: ALERT -> POSITIVE -> NORMAL
  const groups: SpecialtyReportGroup[] = SPECIALTIES.map(spec => {
    const rows = allRows
      .filter(r => r.specialty === spec.code)
      .sort((a, b) => {
        const order = { ALERT: 1, POSITIVE: 2, NORMAL: 3 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        if (b.currentCount !== a.currentCount) {
          return b.currentCount - a.currentCount;
        }
        return a.tenKT.localeCompare(b.tenKT, 'vi');
      });

    const totalCurrent = rows.reduce((sum, r) => sum + r.currentCount, 0);
    const totalPrev = rows.reduce((sum, r) => sum + r.prevCount, 0);
    const totalSamePeriod = rows.reduce((sum, r) => sum + r.samePeriodCount, 0);

    const alertCount = rows.filter(r => r.status === 'ALERT').length;
    const positiveCount = rows.filter(r => r.status === 'POSITIVE').length;
    const normalCount = rows.filter(r => r.status === 'NORMAL').length;

    return {
      specialty: spec,
      rows,
      totalCurrent,
      totalPrev,
      totalSamePeriod,
      alertCount,
      positiveCount,
      normalCount,
    };
  });

  return {
    groups,
    periodMeta: defs.meta,
  };
}
