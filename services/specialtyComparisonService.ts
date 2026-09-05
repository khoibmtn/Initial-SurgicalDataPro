/**
 * Specialty Comparison Service
 * Phân tích so sánh số lượng phẫu thuật theo các chuyên khoa:
 * - Ngoại tổng hợp
 * - Chấn thương chỉnh hình
 * - Mắt
 * - Tai Mũi Họng
 * - Phụ sản
 * - Các nhóm chuyên khoa tùy chỉnh do người dùng tự tạo
 *
 * Quy tắc phân loại:
 * 1. Ưu tiên 1 (Cao nhất): Tùy chỉnh thủ công của người dùng (Custom Overrides) - áp dụng cho cả nhóm mặc định & nhóm mới tạo
 * 2. Đối với Phụ sản, Tai mũi họng, Mắt: LẤY THEO KHOA CỦA BÁC SĨ PHẪU THUẬT CHÍNH
 *    (Khoa Sản => Phụ sản, Khoa TMH => Tai Mũi Họng, Khoa Mắt => Mắt)
 * 3. Các phẫu thuật còn lại mới phân theo Chấn thương chỉnh hình và Ngoại tổng hợp.
 * 4. Nhóm tùy chỉnh mới tạo CHỈ nhận các kỹ thuật do người dùng tự chuyển đến.
 */

import { reportService } from './reportService';
import { PersistedSurgeryRecord, StaffMember, SurgeryCostItem, RolePrice, LaborConfigVersion } from '../types';
import { getConfigForDate } from './laborConfigService';

export type StandardSpecialtyCode = 'ngoai_th' | 'ctch' | 'mat' | 'tmh' | 'phu_san';
export type SpecialtyCode = StandardSpecialtyCode | string;

export type FinancialCategory = 'revenue' | 'cost' | 'profit';
export type CostSubtype = 'all' | 'medic' | 'vtth' | 'labor';

export interface SpecialtyMeta {
  code: SpecialtyCode;
  name: string;
  shortName: string;
  icon?: string;
  color: string;
  isCustom?: boolean;
}

export const DEFAULT_SPECIALTIES: SpecialtyMeta[] = [
  { code: 'ngoai_th', name: 'Ngoại tổng hợp', shortName: 'Ngoại TH', color: 'blue', isCustom: false },
  { code: 'ctch', name: 'Chấn thương chỉnh hình', shortName: 'CTCH', color: 'indigo', isCustom: false },
  { code: 'mat', name: 'Mắt', shortName: 'Mắt', color: 'amber', isCustom: false },
  { code: 'tmh', name: 'Tai Mũi Họng', shortName: 'TMH', color: 'cyan', isCustom: false },
  { code: 'phu_san', name: 'Phụ sản', shortName: 'Phụ sản', color: 'rose', isCustom: false },
];

export const SPECIALTIES = DEFAULT_SPECIALTIES;

export type ComparisonStatus = 'ALERT' | 'POSITIVE' | 'NORMAL';

export interface ComparisonRow {
  tenKT: string;
  maTuongDuong?: string;
  specialty: SpecialtyCode;
  specialtyName: string;
  // Số lượng (Count)
  currentCount: number;
  prevCount: number;
  prevDiff: number;
  prevChangePct: number | null;
  samePeriodCount: number;
  samePeriodDiff: number | null;
  samePeriodChangePct: number | null;
  // Viện phí (Revenue)
  currentRevenue: number;
  prevRevenue: number;
  prevRevenueDiff: number;
  prevRevenueChangePct: number | null;
  samePeriodRevenue: number;
  samePeriodRevenueDiff: number | null;
  samePeriodRevenueChangePct: number | null;

  // Chi phí & Lợi nhuận
  hasCostConfig: boolean; // Có định mức chi phí thuốc/VTTH
  currentMedicCost: number;
  prevMedicCost: number;
  samePeriodMedicCost: number;

  currentVtthCost: number;
  prevVtthCost: number;
  samePeriodVtthCost: number;

  currentLaborCost: number;
  prevLaborCost: number;
  samePeriodLaborCost: number;

  currentTotalCost: number;
  prevTotalCost: number;
  samePeriodTotalCost: number;

  currentProfit: number;
  prevProfit: number;
  samePeriodProfit: number;

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
  totalCurrentRevenue: number;
  totalPrevRevenue: number;
  totalSamePeriodRevenue: number;

  totalCurrentMedicCost: number;
  totalPrevMedicCost: number;
  totalSamePeriodMedicCost: number;

  totalCurrentVtthCost: number;
  totalPrevVtthCost: number;
  totalSamePeriodVtthCost: number;

  totalCurrentLaborCost: number;
  totalPrevLaborCost: number;
  totalSamePeriodLaborCost: number;

  totalCurrentTotalCost: number;
  totalPrevTotalCost: number;
  totalSamePeriodTotalCost: number;

  totalCurrentProfit: number;
  totalPrevProfit: number;
  totalSamePeriodProfit: number;

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
const STORAGE_OVERRIDES_KEY = 'sdp_specialty_custom_overrides';
const STORAGE_CUSTOM_GROUPS_KEY = 'sdp_custom_specialties_list';

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

// ───────────────── QUẢN LÝ NHÓM CHUYÊN KHOA TÙY CHỈNH ─────────────────

export function getCustomSpecialties(): SpecialtyMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_GROUPS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading custom specialties:', e);
  }
  return [];
}

export function getAllSpecialties(): SpecialtyMeta[] {
  const custom = getCustomSpecialties();
  return [...DEFAULT_SPECIALTIES, ...custom];
}

export function saveCustomSpecialty(name: string, shortName?: string): SpecialtyMeta {
  const custom = getCustomSpecialties();
  const slug = `custom_${Date.now()}`;
  const newSpec: SpecialtyMeta = {
    code: slug,
    name: name.trim(),
    shortName: shortName?.trim() || name.trim(),
    color: 'emerald',
    isCustom: true,
  };
  custom.push(newSpec);
  localStorage.setItem(STORAGE_CUSTOM_GROUPS_KEY, JSON.stringify(custom));
  return newSpec;
}

export function deleteCustomSpecialty(code: string): void {
  let custom = getCustomSpecialties();
  custom = custom.filter(s => s.code !== code);
  localStorage.setItem(STORAGE_CUSTOM_GROUPS_KEY, JSON.stringify(custom));

  // Tự động giải phóng các phẫu thuật đã gán vào nhóm này về lại phân loại tự động
  const overrides = getSpecialtyOverrides();
  let modified = false;
  for (const [key, val] of Object.entries(overrides)) {
    if (val === code) {
      delete overrides[key];
      modified = true;
    }
  }
  if (modified) {
    localStorage.setItem(STORAGE_OVERRIDES_KEY, JSON.stringify(overrides));
  }
}

// ───────────────── CUSTOM OVERRIDES QUẢN LÝ GÁN THỦ CÔNG ─────────────────

export function getSpecialtyOverrides(): Record<string, SpecialtyCode> {
  try {
    const raw = localStorage.getItem(STORAGE_OVERRIDES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading specialty overrides:', e);
  }
  return {};
}

export function saveSpecialtyOverride(tenKT: string, specialty: SpecialtyCode): void {
  try {
    const current = getSpecialtyOverrides();
    const normKey = tenKT.trim().toLowerCase().replace(/\s+/g, ' ');
    current[normKey] = specialty;
    localStorage.setItem(STORAGE_OVERRIDES_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error saving specialty override:', e);
  }
}

export function removeSpecialtyOverride(tenKT: string): void {
  try {
    const current = getSpecialtyOverrides();
    const normKey = tenKT.trim().toLowerCase().replace(/\s+/g, ' ');
    delete current[normKey];
    localStorage.setItem(STORAGE_OVERRIDES_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Error removing specialty override:', e);
  }
}

// ───────────────── CẤU TRÚC KỲ PHÂN TÍCH ─────────────────

export interface PeriodSpec {
  mode: 'single' | 'range';
  targetMonth: number;
  targetYear: number;
  fromMonth?: number;
  fromYear?: number;
  toMonth?: number;
  toYear?: number;
}

export interface PeriodMetadata {
  mode: 'single' | 'range';
  currentLabel: string;
  prevLabel: string;
  samePeriodLabel: string;
  prevColTitle: string;
  subtitle: string;
  exportFilename: string;
  hasSamePeriodData: boolean;
  hasPrevData: boolean;
}

export interface ComparisonAnalysisResult {
  groups: SpecialtyReportGroup[];
  periodMeta: PeriodMetadata;
}

// ───────────────── PHÂN LOẠI CHUYÊN KHOA CHUẨN XÁC ─────────────────

/**
 * Danh sách từ khóa đặc thù cho Chấn thương chỉnh hình
 */
const KEYWORDS_CTCH = [
  // Xương & Gãy xương
  'gãy xương', 'gay xuong', 'xương', 'xuong', 'kết hợp xương', 'ket hop xuong', 'khx',
  'tháo phương tiện', 'tháo nẹp', 'thao nep', 'rút đinh', 'rut dinh', 'tháo đinh', 'thao dinh',
  'tháo vít', 'thao vit', 'nẹp vít', 'nep vit', 'đinh nội tủy', 'dinh noi tuy', 'xuyên kim', 'xuyen kim', 'kirschner',
  // Khớp & Dây chằng
  'khớp', 'khop', 'khớp háng', 'khop hang', 'khớp gối', 'khop goi', 'khớp vai', 'khop vai',
  'khớp cổ chân', 'khop co chan', 'khớp khuỷu', 'khop khuyu', 'khớp cổ tay', 'khop co tay',
  'dây chằng', 'day chang', 'tái tạo dây chằng', 'tai tao day chang', 'sụn chêm', 'sun chem',
  'nội soi khớp', 'noi soi khop', 'trật khớp', 'trat khop', 'thay khớp', 'thay khop',
  // Ngón tay & Ngón chân & Đốt bàn & Mắt cá
  'ngón tay', 'ngon tay', 'ngón chân', 'ngon chan', 'đốt bàn', 'dot ban', 'đốt ngón', 'dot ngon',
  'tháo bỏ các ngón', 'tháo ngón', 'tháo đốt', 'thao dot', 'thao ngon', 'cắt cụt ngón', 'mỏm cụt', 'mom cut',
  'mắt cá', 'mat ca', 'mắt cá cổ chân', 'mắt cá trong', 'mắt cá ngoài',
  // Gân & Cơ & Chi
  'đứt gân', 'dut gan', 'gân', 'gan ', 'nối gân', 'noi gan', 'chuyển gân', 'chuyen gan',
  'bao hoạt dịch', 'nang bao hoạt dịch', 'ống cổ tay', 'ong co tay', 'ngón tay lò xo', 'ngon tay co sung',
  'ngón tay cò súng', 'cắt cụt', 'bó bột', 'nắn chỉnh', 'chỉnh hình',
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

/**
 * Phân loại một ca phẫu thuật:
 * 1. Override do người dùng chỉnh (ƯU TIÊN CAO NHẤT - áp dụng cho cả nhóm mặc định và nhóm mới tạo)
 * 2. Khoa của Bác sĩ phẫu thuật chính (Sản => Phụ sản, TMH => TMH, Mắt => Mắt, CTCH => CTCH)
 * 3. Còn lại => Phân vào CTCH nếu khớp từ khóa xương/khớp/ngón/gân/mắt cá, ngược lại => Ngoại tổng hợp
 */
export function classifySpecialty(
  tenKT: string,
  ptChinhName?: string,
  staffList?: StaffMember[],
  customOverrides?: Record<string, SpecialtyCode>
): SpecialtyCode {
  const normKey = tenKT.trim().toLowerCase().replace(/\s+/g, ' ');

  // 1. Kiểm tra User Override trước tiên
  const overrides = customOverrides || getSpecialtyOverrides();
  if (overrides[normKey]) {
    return overrides[normKey];
  }

  // 2. Tìm Khoa của Bác sĩ phẫu thuật chính
  if (ptChinhName && staffList && staffList.length > 0) {
    const cleanDoc = ptChinhName.trim().toLowerCase();
    const docStaff = staffList.find(s => {
      const sName = s.name.trim().toLowerCase();
      return cleanDoc === sName || cleanDoc.includes(sName) || sName.includes(cleanDoc);
    });

    if (docStaff && docStaff.department) {
      const dept = docStaff.department.trim().toLowerCase();
      const deptNorm = toSearchString(dept);

      // Khoa Phụ sản => Phụ sản
      if (deptNorm.includes('san') || deptNorm.includes('phu san') || dept.includes('sản')) {
        return 'phu_san';
      }

      // Khoa Tai Mũi Họng => Tai Mũi Họng
      if (deptNorm.includes('tai mui hong') || dept.includes('tmh') || deptNorm.includes('tai mui')) {
        return 'tmh';
      }

      // Khoa Mắt => Mắt
      if (dept.includes('mắt') || dept.includes('mat') || deptNorm.includes('khoa mat')) {
        return 'mat';
      }

      // Khoa Chấn thương chỉnh hình => CTCH
      if (deptNorm.includes('chan thuong') || dept.includes('ctch') || deptNorm.includes('chinh hinh')) {
        return 'ctch';
      }
    }
  }

  // 3. Phân định giữa CTCH và Ngoại tổng hợp dựa trên từ khóa kỹ thuật
  const normKT = toSearchString(tenKT);

  for (const kw of KEYWORDS_CTCH) {
    if (normKT.includes(toSearchString(kw))) {
      return 'ctch';
    }
  }

  // Mặc định các phẫu thuật ngoại khoa còn lại thuộc Ngoại tổng hợp
  return 'ngoai_th';
}

// ───────────────── TÍNH TOÁN DỮ LIỆU SO SÁNH ─────────────────

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

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
    const fromM = spec.fromMonth || 1;
    const fromY = spec.fromYear || spec.targetYear || new Date().getFullYear();
    const toM = spec.toMonth || fromM;
    const toY = spec.toYear || fromY;

    const kMonths = (toY - fromY) * 12 + (toM - fromM) + 1;

    const currentLastDay = daysInMonth(toM, toY);
    const currentDateFrom = `${fromY}-${String(fromM).padStart(2, '0')}-01T00:00:00.000Z`;
    const currentDateTo = `${toY}-${String(toM).padStart(2, '0')}-${String(currentLastDay).padStart(2, '0')}T23:59:59.999Z`;

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

    const samePeriodStartY = fromY - 1;
    const samePeriodEndY = toY - 1;
    const samePeriodLastDay = daysInMonth(toM, samePeriodEndY);

    const samePeriodDateFrom = `${samePeriodStartY}-${String(fromM).padStart(2, '0')}-01T00:00:00.000Z`;
    const samePeriodDateTo = `${samePeriodEndY}-${String(toM).padStart(2, '0')}-${String(samePeriodLastDay).padStart(2, '0')}T23:59:59.999Z`;

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

// ───────────────── HELPER ÁNH XẠ CHI PHÍ & NHÂN CÔNG ─────────────────

function normalizeMaTuongDuong(raw?: string): string {
  if (!raw) return '';
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function isCostItemGayTe(item: SurgeryCostItem): boolean {
  const name = (item.tenKT || '').toLowerCase();
  const mtd = (item.maTuongDuong || '').trim().toUpperCase();
  return name.includes('[gây tê]') || name.includes('(gây tê)') || mtd.endsWith('_GT');
}

export function isRecordGayTe(mtd?: string, tenKT?: string): boolean {
  const m = (mtd || '').trim().toUpperCase();
  const t = (tenKT || '').toLowerCase();
  return m.endsWith('_GT') || t.includes('[gây tê]') || t.includes('(gây tê)');
}

function toLocalDateKey(raw?: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

export function findMatchingCostItem(
  r: PersistedSurgeryRecord,
  costItems: SurgeryCostItem[]
): SurgeryCostItem | undefined {
  if (!costItems || costItems.length === 0) return undefined;
  const rawMTD = normalizeMaTuongDuong(r.maTuongDuong);
  if (!rawMTD) return undefined;

  const baseMTD = rawMTD.replace(/_GT$/i, '');
  const isGT = isRecordGayTe(r.maTuongDuong, r.tenKT);
  const dateKey = toLocalDateKey(r.ngayBD || r.ngayCD);

  // 1. Lọc theo mã tương đương cơ bản
  const candidates = costItems.filter(item => {
    const itemBase = normalizeMaTuongDuong(item.maTuongDuong).replace(/_GT$/i, '');
    if (itemBase !== baseMTD) return false;

    // Nếu record có đơn giá, kiểm tra khớp đơn giá
    if (r.donGia && r.donGia > 0 && item.donGia && item.donGia > 0) {
      if (Math.abs(item.donGia - r.donGia) > 1) return false;
    }
    return true;
  });

  if (candidates.length === 0) return undefined;

  // 2. Lọc theo hiệu lực: Ưu tiên 1 là Hiệu lực Chi phí (A4)
  let dateMatched = candidates.filter(item => {
    if (!dateKey) return true;
    const from = item.costEffectiveFrom;
    const to = item.costEffectiveTo;
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    return !!from;
  });

  // Fallback sang Hiệu lực DVKT nếu không khớp Hiệu lực Chi phí (A4)
  if (dateMatched.length === 0) {
    dateMatched = candidates.filter(item => {
      if (!dateKey) return true;
      const from = item.dvktEffectiveFrom || item.effectiveFrom;
      const to = item.dvktEffectiveTo !== undefined ? item.dvktEffectiveTo : item.effectiveTo;
      if (from && dateKey < from) return false;
      if (to && dateKey > to) return false;
      return true;
    });
  }

  const pool = dateMatched.length > 0 ? dateMatched : candidates;

  // 3. Phân biệt gây tê vs gây mê
  const gtItems = pool.filter(isCostItemGayTe);
  const gmItems = pool.filter(it => !isCostItemGayTe(it));

  if (isGT) {
    return gtItems.length > 0 ? gtItems[0] : gmItems[0];
  } else {
    return gmItems.length > 0 ? gmItems[0] : gtItems[0];
  }
}

export function calculateLaborCost(
  r: PersistedSurgeryRecord,
  priceConfig?: Record<string, RolePrice>,
  laborConfigs?: LaborConfigVersion[],
): number {
  if (!r.loaiPTTT) return 0;

  // Timeline-based: lookup config for surgery date
  let resolvedPriceConfig = priceConfig;
  if (laborConfigs && laborConfigs.length > 0 && r.ngayBD) {
    const dateStr = typeof r.ngayBD === 'string' ? r.ngayBD.slice(0, 10) : new Date(r.ngayBD).toISOString().slice(0, 10);
    const resolved = getConfigForDate(dateStr, laborConfigs, priceConfig);
    resolvedPriceConfig = resolved.priceConfig;
  }

  if (!resolvedPriceConfig) return 0;
  const cfg = resolvedPriceConfig[r.loaiPTTT];
  if (!cfg) return 0;

  const qty = r.soLuong || 1;
  let unitCost = 0;
  if (r.ptChinh && r.ptChinh.trim()) unitCost += cfg["Chính"] || 0;
  if (r.ptPhu && r.ptPhu.trim()) unitCost += cfg["Phụ"] || 0;
  if (r.bsGM && r.bsGM.trim()) unitCost += cfg["Chính"] || 0;
  if (r.ktvGM && r.ktvGM.trim()) unitCost += cfg["Phụ"] || 0;
  if (r.tdc && r.tdc.trim()) unitCost += cfg["Phụ"] || 0;
  if (r.gv && r.gv.trim()) unitCost += cfg["Giúp việc"] || 0;

  return unitCost * qty;
}

export async function getSpecialtyComparisonData(
  periodSpec: PeriodSpec,
  staffList: StaffMember[],
  thresholdConfig?: ComparisonConfig,
  customOverrides?: Record<string, SpecialtyCode>,
  costItems?: SurgeryCostItem[],
  priceConfig?: Record<string, RolePrice>,
  laborConfigs?: LaborConfigVersion[],
): Promise<ComparisonAnalysisResult> {
  const config = thresholdConfig || getComparisonThresholdConfig();
  const overrides = customOverrides || getSpecialtyOverrides();
  const allSpecialties = getAllSpecialties();
  const defs = computePeriodDefinitions(periodSpec, config);

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
    maTuongDuong: string;
    specialty: SpecialtyCode;
    hasCostConfig: boolean;
    nameCostMap: Map<string, number>;
    current: number;
    prev: number;
    samePeriod: number;
    currentRevenue: number;
    prevRevenue: number;
    samePeriodRevenue: number;

    currentMedicCost: number;
    prevMedicCost: number;
    samePeriodMedicCost: number;

    currentVtthCost: number;
    prevVtthCost: number;
    samePeriodVtthCost: number;

    currentLaborCost: number;
    prevLaborCost: number;
    samePeriodLaborCost: number;

    currentTotalCost: number;
    prevTotalCost: number;
    samePeriodTotalCost: number;

    currentProfit: number;
    prevProfit: number;
    samePeriodProfit: number;
  }

  const itemsMap = new Map<string, ItemCounter>();

  const registerRecord = (
    r: PersistedSurgeryRecord,
    period: 'current' | 'prev' | 'samePeriod'
  ) => {
    if (!r.tenKT) return;
    const specialty = classifySpecialty(r.tenKT, r.ptChinh, staffList, overrides);
    const rawMTD = (r.maTuongDuong || '').trim();
    const isGT = isRecordGayTe(r.maTuongDuong, r.tenKT);
    const baseMTD = normalizeMaTuongDuong(rawMTD).replace(/_GT$/i, '');
    const method = isGT ? 'GT' : 'GM';
    const donGia = Math.round(Number(r.donGia) || 0);
    const normName = r.tenKT.trim().toLowerCase().replace(/\s+/g, ' ');

    // Khóa gom nhóm:
    // 1 tên kỹ thuật nếu cùng mã tương đương:
    // - khác phương pháp vô cảm (gây mê, gây tê) thì tách theo phương pháp vô cảm
    // - cùng phương pháp vô cảm và cùng giá: hiển thị chung (nếu khác tên thì lấy 1 tên nhiều chi phí nhất)
    // - chưa có mã tương đương: gom theo chuyên khoa + normName + phương pháp vô cảm + giá
    const key = baseMTD
      ? `${specialty}:::MTD_${baseMTD}:::${method}:::${donGia}`
      : `${specialty}:::NOMTD_${normName}:::${method}:::${donGia}`;

    // Mã tương đương hiển thị trên dòng:
    // Nếu có mã tương đương: ca gây tê có hậu tố _GT (nếu chưa có thì thêm _GT), ca gây mê dùng baseMTD
    // Nếu chưa có mã tương đương: để trống ""
    const rowMTD = baseMTD
      ? (isGT ? (rawMTD.toUpperCase().endsWith('_GT') ? rawMTD : `${baseMTD}_GT`) : baseMTD)
      : '';

    const qty = r.soLuong || 1;
    let rev = 0;
    if (r.thanhTien != null && !isNaN(Number(r.thanhTien))) {
      rev = Number(r.thanhTien);
    } else if (r.donGia != null && !isNaN(Number(r.donGia))) {
      rev = Number(r.donGia) * qty;
    }

    const matchedCost = costItems ? findMatchingCostItem(r, costItems) : undefined;
    const hasCost = !!matchedCost;
    const medic = matchedCost ? matchedCost.medicCost * qty : 0;
    const vtth = matchedCost ? matchedCost.vtthCost * qty : 0;
    const labor = calculateLaborCost(r, priceConfig, laborConfigs);
    const totalCost = hasCost ? (medic + vtth + labor) : 0;
    const profit = hasCost ? (rev - totalCost) : 0;

    if (!itemsMap.has(key)) {
      itemsMap.set(key, {
        displayName: r.tenKT.trim(),
        maTuongDuong: rowMTD,
        specialty,
        hasCostConfig: false,
        nameCostMap: new Map<string, number>(),
        current: 0,
        prev: 0,
        samePeriod: 0,
        currentRevenue: 0,
        prevRevenue: 0,
        samePeriodRevenue: 0,
        currentMedicCost: 0,
        prevMedicCost: 0,
        samePeriodMedicCost: 0,
        currentVtthCost: 0,
        prevVtthCost: 0,
        samePeriodVtthCost: 0,
        currentLaborCost: 0,
        prevLaborCost: 0,
        samePeriodLaborCost: 0,
        currentTotalCost: 0,
        prevTotalCost: 0,
        samePeriodTotalCost: 0,
        currentProfit: 0,
        prevProfit: 0,
        samePeriodProfit: 0,
      });
    }

    const item = itemsMap.get(key)!;
    if (hasCost) {
      item.hasCostConfig = true;
    }

    // Tích lũy chi phí/doanh thu theo từng biến thể tên kỹ thuật để chọn tên nhiều chi phí nhất
    const rawName = r.tenKT.trim();
    const currentNameCost = item.nameCostMap.get(rawName) || 0;
    item.nameCostMap.set(rawName, currentNameCost + (totalCost || rev || qty));

    if (!item.maTuongDuong && rowMTD) {
      item.maTuongDuong = rowMTD;
    }

    if (period === 'current') {
      item.current += qty;
      item.currentRevenue += rev;
      item.currentMedicCost += medic;
      item.currentVtthCost += vtth;
      item.currentLaborCost += labor;
      item.currentTotalCost += totalCost;
      item.currentProfit += profit;
    } else if (period === 'prev') {
      item.prev += qty;
      item.prevRevenue += rev;
      item.prevMedicCost += medic;
      item.prevVtthCost += vtth;
      item.prevLaborCost += labor;
      item.prevTotalCost += totalCost;
      item.prevProfit += profit;
    } else if (period === 'samePeriod') {
      item.samePeriod += qty;
      item.samePeriodRevenue += rev;
      item.samePeriodMedicCost += medic;
      item.samePeriodVtthCost += vtth;
      item.samePeriodLaborCost += labor;
      item.samePeriodTotalCost += totalCost;
      item.samePeriodProfit += profit;
    }
  };

  currentRecords.forEach(r => registerRecord(r, 'current'));
  prevRecords.forEach(r => registerRecord(r, 'prev'));
  samePeriodRecords.forEach(r => registerRecord(r, 'samePeriod'));

  const allRows: ComparisonRow[] = [];

  itemsMap.forEach(item => {
    const cur = item.current;
    const prev = item.prev;
    const same = item.samePeriod;

    const curRev = item.currentRevenue;
    const prevRev = item.prevRevenue;
    const sameRev = item.samePeriodRevenue;

    let prevChangePct: number | null = null;
    if (prev > 0) {
      prevChangePct = ((cur - prev) / prev) * 100;
    }

    let samePeriodChangePct: number | null = null;
    if (hasSamePeriodData && same > 0) {
      samePeriodChangePct = ((cur - same) / same) * 100;
    }

    const prevRevenueDiff = curRev - prevRev;
    let prevRevenueChangePct: number | null = null;
    if (prevRev > 0) {
      prevRevenueChangePct = ((curRev - prevRev) / prevRev) * 100;
    }

    const samePeriodRevenueDiff = hasSamePeriodData ? (curRev - sameRev) : null;
    let samePeriodRevenueChangePct: number | null = null;
    if (hasSamePeriodData && sameRev > 0) {
      samePeriodRevenueChangePct = ((curRev - sameRev) / sameRev) * 100;
    }

    let status: ComparisonStatus = 'NORMAL';
    let statusLabel: 'CẢNH BÁO' | 'TÍCH CỰC' | 'ỔN ĐỊNH' = 'ỔN ĐỊNH';
    let note = '';

    const alertThreshold = config.alertThreshold;
    const positiveThreshold = config.positiveThreshold;

    if (cur === 0 && (prev > 0 || (hasSamePeriodData && same > 0))) {
      status = 'ALERT';
      statusLabel = 'CẢNH BÁO';
      note = `Không phát sinh trong ${defs.meta.currentLabel}`;
    } else if (cur > 0 && prev === 0 && (!hasSamePeriodData || same === 0)) {
      status = 'POSITIVE';
      statusLabel = 'TÍCH CỰC';
      note = `Mới phát sinh trong ${defs.meta.currentLabel}`;
    } else if (
      (prevChangePct !== null && prevChangePct <= -alertThreshold) ||
      (hasSamePeriodData && samePeriodChangePct !== null && samePeriodChangePct <= -alertThreshold)
    ) {
      status = 'ALERT';
      statusLabel = 'CẢNH BÁO';
    } else if (
      (prevChangePct !== null && prevChangePct >= positiveThreshold) ||
      (hasSamePeriodData && samePeriodChangePct !== null && samePeriodChangePct >= positiveThreshold)
    ) {
      status = 'POSITIVE';
      statusLabel = 'TÍCH CỰC';
    }

    const specMeta = allSpecialties.find(s => s.code === item.specialty) || {
      code: item.specialty,
      name: item.specialty,
      shortName: item.specialty,
      color: 'gray',
    };

    const prevDiff = cur - prev;
    const samePeriodDiff = hasSamePeriodData ? (cur - same) : null;

    // Chọn tên kỹ thuật có tổng chi phí / doanh thu tích lũy lớn nhất
    let chosenName = item.displayName;
    let maxCost = -1;
    for (const [nameKey, costVal] of item.nameCostMap.entries()) {
      if (costVal > maxCost) {
        maxCost = costVal;
        chosenName = nameKey;
      }
    }

    allRows.push({
      tenKT: chosenName,
      maTuongDuong: item.maTuongDuong || '',
      specialty: item.specialty,
      specialtyName: specMeta.name,
      currentCount: cur,
      prevCount: prev,
      prevDiff,
      prevChangePct,
      samePeriodCount: hasSamePeriodData ? same : 0,
      samePeriodDiff,
      samePeriodChangePct,
      currentRevenue: curRev,
      prevRevenue: prevRev,
      prevRevenueDiff,
      prevRevenueChangePct,
      samePeriodRevenue: hasSamePeriodData ? sameRev : 0,
      samePeriodRevenueDiff,
      samePeriodRevenueChangePct,

      // Chi phí & Lợi nhuận
      hasCostConfig: item.hasCostConfig,
      currentMedicCost: item.currentMedicCost,
      prevMedicCost: item.prevMedicCost,
      samePeriodMedicCost: item.samePeriodMedicCost,

      currentVtthCost: item.currentVtthCost,
      prevVtthCost: item.prevVtthCost,
      samePeriodVtthCost: item.samePeriodVtthCost,

      currentLaborCost: item.currentLaborCost,
      prevLaborCost: item.prevLaborCost,
      samePeriodLaborCost: item.samePeriodLaborCost,

      currentTotalCost: item.currentTotalCost,
      prevTotalCost: item.prevTotalCost,
      samePeriodTotalCost: item.samePeriodTotalCost,

      currentProfit: item.currentProfit,
      prevProfit: item.prevProfit,
      samePeriodProfit: item.samePeriodProfit,

      status,
      statusLabel,
      note,
    });
  });

  // Xây dựng các group: bao gồm 5 chuyên khoa mặc định và các nhóm tùy chỉnh
  const groups: SpecialtyReportGroup[] = allSpecialties
    .map(spec => {
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

      const totalCurrentRevenue = rows.reduce((sum, r) => sum + r.currentRevenue, 0);
      const totalPrevRevenue = rows.reduce((sum, r) => sum + r.prevRevenue, 0);
      const totalSamePeriodRevenue = rows.reduce((sum, r) => sum + r.samePeriodRevenue, 0);

      const totalCurrentMedicCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.currentMedicCost, 0);
      const totalPrevMedicCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.prevMedicCost, 0);
      const totalSamePeriodMedicCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.samePeriodMedicCost, 0);

      const totalCurrentVtthCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.currentVtthCost, 0);
      const totalPrevVtthCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.prevVtthCost, 0);
      const totalSamePeriodVtthCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.samePeriodVtthCost, 0);

      const totalCurrentLaborCost = rows.reduce((sum, r) => sum + r.currentLaborCost, 0);
      const totalPrevLaborCost = rows.reduce((sum, r) => sum + r.prevLaborCost, 0);
      const totalSamePeriodLaborCost = rows.reduce((sum, r) => sum + r.samePeriodLaborCost, 0);

      const totalCurrentTotalCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.currentTotalCost, 0);
      const totalPrevTotalCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.prevTotalCost, 0);
      const totalSamePeriodTotalCost = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.samePeriodTotalCost, 0);

      const totalCurrentProfit = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.currentProfit, 0);
      const totalPrevProfit = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.prevProfit, 0);
      const totalSamePeriodProfit = rows.filter(r => r.hasCostConfig).reduce((sum, r) => sum + r.samePeriodProfit, 0);

      const alertCount = rows.filter(r => r.status === 'ALERT').length;
      const positiveCount = rows.filter(r => r.status === 'POSITIVE').length;
      const normalCount = rows.filter(r => r.status === 'NORMAL').length;

      return {
        specialty: spec,
        rows,
        totalCurrent,
        totalPrev,
        totalSamePeriod,
        totalCurrentRevenue,
        totalPrevRevenue,
        totalSamePeriodRevenue,
        totalCurrentMedicCost,
        totalPrevMedicCost,
        totalSamePeriodMedicCost,
        totalCurrentVtthCost,
        totalPrevVtthCost,
        totalSamePeriodVtthCost,
        totalCurrentLaborCost,
        totalPrevLaborCost,
        totalSamePeriodLaborCost,
        totalCurrentTotalCost,
        totalPrevTotalCost,
        totalSamePeriodTotalCost,
        totalCurrentProfit,
        totalPrevProfit,
        totalSamePeriodProfit,
        alertCount,
        positiveCount,
        normalCount,
      };
    })
    // Giữ lại 5 nhóm mặc định hoặc nhóm tùy chỉnh nếu có dữ liệu hoặc đã được định nghĩa
    .filter(g => !g.specialty.isCustom || g.rows.length > 0 || true);

  return {
    groups,
    periodMeta: defs.meta,
  };
}
