/**
 * Specialty Comparison Service
 * Phân tích so sánh số lượng phẫu thuật theo 5 chuyên khoa:
 * - Ngoại tổng hợp
 * - Chấn thương chỉnh hình
 * - Mắt
 * - Tai Mũi Họng
 * - Phụ sản
 *
 * So sánh 3 kỳ:
 * 1. Tháng được chọn (T_m/Y)
 * 2. Tháng trước đó (T_{m-1}/Y hoặc T_{12}/Y-1)
 * 3. Cùng kỳ năm trước (T_m/Y-1)
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
  currentCount: number;       // T{m}/{y}
  prevCount: number;          // T{m-1}/{y}
  prevChangePct: number | null; // % so tháng trước
  samePeriodCount: number;    // T{m}/{y-1}
  samePeriodChangePct: number | null; // % so cùng kỳ
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

// ───────────────── PHÂN LOẠI CHUYÊN KHOA THÔNG MINH ─────────────────

/**
 * Danh sách từ khóa đặc thù cho từng chuyên khoa.
 * Ưu tiên: Mắt -> TMH -> Phụ sản -> Chấn thương chỉnh hình -> Ngoại tổng hợp
 */
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
  // Xương & Gãy xương
  'gãy xương', 'gay xuong', 'xương', 'xuong', 'kết hợp xương', 'ket hop xuong', 'tháo phương tiện',
  'tháo nẹp', 'thao nep', 'rút đinh', 'rut dinh', 'tháo đinh', 'thao dinh', 'tháo vít', 'thao vit',
  'nẹp vít', 'nep vit', 'đinh nội tủy', 'dinh noi tuy', 'xuyên kim', 'xuyen kim', 'kirschner',
  // Khớp & Dây chằng
  'khớp', 'khop', 'khớp háng', 'khop hang', 'khớp gối', 'khop goi', 'khớp vai', 'khop vai',
  'khớp cổ chân', 'khop co chan', 'khớp khuỷu', 'khop khuyu', 'khớp cổ tay', 'khop co tay',
  'dây chằng', 'day chang', 'tái tạo dây chằng', 'tai tao day chang', 'sụn chêm', 'sun chem',
  'nội soi khớp', 'noi soi khop', 'trật khớp', 'trat khop', 'thay khớp', 'thay khop',
  // Gân & Cơ & Chi
  'đứt gân', 'dut gan', 'gân', 'gan ', 'nối gân', 'noi gan', 'chuyển gân', 'chuyen gan',
  'bao hoạt dịch', 'nang bao hoạt dịch', 'ống cổ tay', 'ong co tay', 'ngón tay lò xo', 'ngon tay co sung',
  'ngón tay cò súng', 'cắt cụt', 'tháo ngón', 'tháo đốt', 'bó bột', 'nắn chỉnh', 'chỉnh hình',
  'khuyết hổng phần mềm chi', 'viêm xương tủy', 'xương đòn', 'xương cánh tay', 'xương cẳng tay',
  'xương quay', 'xương trụ', 'xương đùi', 'xương bánh chè', 'xương chày', 'xương mác', 'xương gót'
];

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu để so khớp
 */
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
 * Phân loại một ca phẫu thuật vào chuyên khoa
 */
export function classifySpecialty(
  tenKT: string,
  ptChinhName?: string,
  staffList?: StaffMember[]
): SpecialtyCode {
  const normKT = toSearchString(tenKT);

  // 1. Kiểm tra theo từ khóa Chuyên khoa Mắt
  for (const kw of KEYWORDS_MAT) {
    if (normKT.includes(toSearchString(kw))) return 'mat';
  }

  // 2. Kiểm tra theo từ khóa Tai Mũi Họng
  for (const kw of KEYWORDS_TMH) {
    if (normKT.includes(toSearchString(kw))) return 'tmh';
  }

  // 3. Kiểm tra theo từ khóa Phụ Sản
  for (const kw of KEYWORDS_PHU_SAN) {
    if (normKT.includes(toSearchString(kw))) return 'phu_san';
  }

  // 4. Kiểm tra Khoa của Bác sĩ nếu là Mắt, TMH, Phụ Sản
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

  // 5. Đối với Hệ Ngoại: Phân định giữa CTCH và Ngoại tổng hợp
  for (const kw of KEYWORDS_CTCH) {
    if (normKT.includes(toSearchString(kw))) return 'ctch';
  }

  // 6. Kiểm tra lại Khoa bác sĩ nếu có chữ CTCH / Chấn thương
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

  // 7. Mặc định các phẫu thuật ngoại khoa còn lại thuộc Ngoại tổng hợp
  return 'ngoai_th';
}

// ───────────────── TÍNH TOÁN DỮ LIỆU SO SÁNH ─────────────────

/**
 * Lấy danh sách bản ghi theo tháng và năm
 */
async function getRecordsForMonthYear(year: number, month: number): Promise<PersistedSurgeryRecord[]> {
  const startDay = '01';
  const lastDay = new Date(year, month, 0).getDate().toString().padStart(2, '0');
  const monthStr = month.toString().padStart(2, '0');

  const dateFrom = `${year}-${monthStr}-${startDay}T00:00:00.000Z`;
  const dateTo = `${year}-${monthStr}-${lastDay}T23:59:59.999Z`;

  try {
    const [monthly, daily] = await Promise.all([
      reportService.getReports(dateFrom, dateTo, 'MONTHLY'),
      reportService.getReports(dateFrom, dateTo, 'DAILY'),
    ]);

    // Ưu tiên Monthly nếu có, nếu không lấy Daily
    if (monthly && monthly.length > 0) return monthly;
    return daily || [];
  } catch (error) {
    console.error(`Error fetching records for ${month}/${year}:`, error);
    return [];
  }
}

/**
 * Lấy dữ liệu phân tích so sánh đầy đủ cho 5 chuyên khoa
 */
export async function getSpecialtyComparisonData(
  targetYear: number,
  targetMonth: number,
  staffList: StaffMember[],
  thresholdConfig?: ComparisonConfig
): Promise<SpecialtyReportGroup[]> {
  const config = thresholdConfig || getComparisonThresholdConfig();

  // Xác định tháng trước (liền kề)
  let prevMonth = targetMonth - 1;
  let prevYear = targetYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = targetYear - 1;
  }

  // Xác định cùng kỳ năm trước
  const samePeriodMonth = targetMonth;
  const samePeriodYear = targetYear - 1;

  // Lấy dữ liệu 3 kỳ song song
  const [currentRecords, prevRecords, samePeriodRecords] = await Promise.all([
    getRecordsForMonthYear(targetYear, targetMonth),
    getRecordsForMonthYear(prevYear, prevMonth),
    getRecordsForMonthYear(samePeriodYear, samePeriodMonth),
  ]);

  // Gom đếm theo Tên KT & Chuyên khoa cho từng kỳ
  // Map key: `${specialtyCode}:::${normalizedName}`
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

  // Xử lý tính toán % tăng trưởng & Nhận định cho từng dòng
  const allRows: ComparisonRow[] = [];

  itemsMap.forEach(item => {
    const cur = item.current;
    const prev = item.prev;
    const same = item.samePeriod;

    // Tính % so tháng trước
    let prevChangePct: number | null = null;
    if (prev > 0) {
      prevChangePct = ((cur - prev) / prev) * 100;
    }

    // Tính % so cùng kỳ
    let samePeriodChangePct: number | null = null;
    if (same > 0) {
      samePeriodChangePct = ((cur - same) / same) * 100;
    }

    // Đánh giá Nhận định & Ghi chú
    let status: ComparisonStatus = 'NORMAL';
    let statusLabel: 'CẢNH BÁO' | 'TÍCH CỰC' | 'ỔN ĐỊNH' = 'ỔN ĐỊNH';
    let note = '';

    const alertThreshold = config.alertThreshold;     // e.g. 10
    const positiveThreshold = config.positiveThreshold; // e.g. 5

    // 1. Trường hợp không phát sinh trong kỳ hiện tại
    if (cur === 0 && (prev > 0 || same > 0)) {
      status = 'ALERT';
      statusLabel = 'CẢNH BÁO';
      note = `Không phát sinh trong T${targetMonth}/${targetYear}`;
    }
    // 2. Trường hợp mới phát sinh trong kỳ hiện tại
    else if (cur > 0 && prev === 0 && same === 0) {
      status = 'POSITIVE';
      statusLabel = 'TÍCH CỰC';
      note = `Mới phát sinh trong T${targetMonth}/${targetYear}`;
    }
    // 3. Trường hợp CẢNH BÁO: Giảm >= ngưỡng ở tháng trước HOẶC cùng kỳ
    else if (
      (prevChangePct !== null && prevChangePct <= -alertThreshold) ||
      (samePeriodChangePct !== null && samePeriodChangePct <= -alertThreshold)
    ) {
      status = 'ALERT';
      statusLabel = 'CẢNH BÁO';
    }
    // 4. Trường hợp TÍCH CỰC: Tăng >= ngưỡng ở tháng trước HOẶC cùng kỳ
    else if (
      (prevChangePct !== null && prevChangePct >= positiveThreshold) ||
      (samePeriodChangePct !== null && samePeriodChangePct >= positiveThreshold)
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
      samePeriodCount: same,
      samePeriodChangePct,
      status,
      statusLabel,
      note,
    });
  });

  // Gom theo từng Chuyên khoa và sắp xếp
  // Thứ tự ưu tiên dòng: CẢNH BÁO -> TÍCH CỰC -> ỔN ĐỊNH, sau đó theo số lượng giảm dần
  const groups: SpecialtyReportGroup[] = SPECIALTIES.map(spec => {
    const rows = allRows
      .filter(r => r.specialty === spec.code)
      .sort((a, b) => {
        // 1. Ưu tiên theo status: ALERT (1) -> POSITIVE (2) -> NORMAL (3)
        const order = { ALERT: 1, POSITIVE: 2, NORMAL: 3 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        // 2. Số lượng kỳ hiện tại giảm dần
        if (b.currentCount !== a.currentCount) {
          return b.currentCount - a.currentCount;
        }
        // 3. Tên KT theo alphabet tiếng Việt
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

  return groups;
}
