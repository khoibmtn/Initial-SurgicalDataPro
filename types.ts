export interface ProcessedStats {
  totalSurgeries: number;
  totalDurationMinutes: number;
  staffConflicts: number;
  machineConflicts: number;
  missingMachines: number;
  lowPaymentCount: number; // Num surgeries with soLuong < 1
  violateMinTimeCount: number; // Num surgeries violating min time rule
  missingAssistantCount?: number; // Num surgeries missing 'gv'
}

export interface ReportUISettings {
  rowsPerPage: number;
  dateFormat: string;
  visibleColumns: Record<string, Record<string, boolean>>; // tableName -> colKey -> boolean
  searchableColumns: Record<string, Record<string, boolean>>; // tableName -> colKey -> boolean
}

export interface UISettings {
  rowsPerPage: number;
  dateFormat: string;
  visibleColumns: Record<string, Record<string, boolean>>; // tableName -> colKey -> boolean
  searchableColumns: Record<string, Record<string, boolean>>; // tableName -> colKey -> boolean
  perReport?: {
    daily?: ReportUISettings;
    monthly?: ReportUISettings;
  };
}

export interface Conflict {
  id: string;
  resourceName: string; // Staff Name or Machine Code
  type: 'STAFF' | 'MACHINE';
  surgeryA: string;
  surgeryB: string;
  startTimeA: Date;
  endTimeA: Date;
  startTimeB: Date;
  endTimeB: Date;
  durationOverlap: number; // minutes
}

export interface PaymentStats {
  totalAmount: number;
}

export interface StaffMember {
  id: string; // Internal unique ID or Full Name + Position key
  name: string;
  position: 'BS PT' | 'BS GMHS' | 'Phụ' | '';
  taxId: string;
  department: string;
}

export interface SurgeryRecord {
  stt: any;
  patientId: string;
  patientName: string;
  gender: string;
  yob: string;
  bhyt: string;
  ngayCD: string;
  ngayBD: string;
  ngayKT: string;
  tenKT: string;
  loaiPTTT: string;
  soLuong: number;
  timeMinutes: number;
  ptChinh: string;
  ptPhu: string;
  bsGM: string;
  ktvGM: string;
  tdc: string;
  gv: string;
  machine: string;
  machineCode: string;
  machineId: string;
  start: Date | null;
  end: Date | null;
  key?: string;
  id?: string; // Firestore ID
  firestorePath?: string;
  maTuongDuong?: string; // Mã BHXH / Mã tương đương (XX.XXXX.XXXX)
  donGia?: number;       // Đơn giá (VNĐ)
  thanhTien?: number;    // Thành tiền (VNĐ)
  priceSource?: 'excel_dvkt' | 'catalog'; // Nguồn gốc giá: 'excel_dvkt' (từ file Excel Thống kê DVKT) hoặc 'catalog' (từ DM giá)
}

export type StaffRole = "PT_CHINH" | "PT_PHU" | "BS_GM" | "KTV_GM" | "TDC" | "GV";

export interface StaffConflict {
  staffName: string;
  role: StaffRole;
  violationType?: 'max1' | 'max2';
  patientId1: string;
  patientName1: string;
  tenKT1: string;
  start1: Date;
  end1: Date;
  patientId2: string;
  patientName2: string;
  tenKT2: string;
  start2: Date;
  end2: Date;
  rec1: SurgeryRecord;
  rec2: SurgeryRecord;
}

export interface MachineConflict {
  machine: string;
  machineCode: string;
  patientId1: string;
  patientName1: string;
  tenKT1: string;
  start1: Date;
  end1: Date;
  patientId2: string;
  patientName2: string;
  tenKT2: string;
  start2: Date;
  end2: Date;
  rec1: SurgeryRecord;
  rec2: SurgeryRecord;
}

export interface PaymentData {
  columns: string[];
  rows: {
    name: string;
    values: Record<string, number>;
    total?: number;
  }[];
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  wb?: any;
  stats: ProcessedStats;
  paymentStats?: PaymentStats;
  conflicts: Conflict[]; // Legacy formatted conflicts for old UI (can be removed later if unused)

  // New Raw Data for Tables
  validRecords: SurgeryRecord[];
  staffConflicts: StaffConflict[];
  machineConflicts: MachineConflict[];
  missingRecords: SurgeryRecord[];
  paymentData: PaymentData;
  dateRangeText?: string; // Extracted from A5 of list file
  minDate?: Date;
  maxDate?: Date;
  extractedStaff?: StaffMember[];
}

export interface FileState {
  listFile: File | null;
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

// ================= FIRESTORE PERSISTENCE MODELS =================

export interface ReportMetadata {
  id: string;               // ID báo cáo
  type: 'DAILY' | 'MONTHLY'; // Phân loại
  date: string;             // Ngày tạo (ISO String)

  // Các thông tin quản lý cơ bản
  createdAt: number;        // Timestamp
  createdBy: string;        // User ID
}

export interface PersistedSurgeryRecord {
  // === 1. NHÓM HÀNH CHÍNH (Từ Excel gốc) ===
  stt: number | string;
  patientId: string;        // Mã BN
  patientName: string;
  gender: string;
  yob: string;              // Năm sinh
  bhyt: string;             // Số thẻ BHYT

  // === 2. NHÓM THỜI GIAN (Đã chuẩn hóa sang ISO/Timestamp) ===
  ngayCD: string;           // Ngày chỉ định
  ngayBD: string;           // Ngày bắt đầu (quan trọng nhất)
  ngayKT: string;           // Ngày kết thúc (quan trọng nhất)
  timeMinutes: number;      // Thời lượng (phút) - Lưu luôn để không phải tính lại

  // === 3. NHÓM CHUYÊN MÔN ===
  tenKT: string;            // Tên kỹ thuật
  loaiPTTT: string;         // Mã loại: "P1", "TĐB", "TKPL"... (Quan trọng cho tính tiền)
  soLuong: number;          // Số lượng quy đổi (đã nhân tỷ lệ %)

  // === 4. NHÓM NHÂN SỰ (Kíp mổ) ===
  ptChinh: string;
  ptPhu: string;
  bsGM: string;
  ktvGM: string;
  tdc: string;
  gv: string;

  // === 5. NHÓM TÀI NGUYÊN (Từ cột Máy TH trong file Danh sách PT) ===
  machine: string;          // Tên máy (backward-compatible, giữ nguyên dữ liệu cũ)
  machineCode: string;      // Mã máy (unique, dùng check trùng máy)
  machineId: string;        // ID máy (từ bảng danh mục)
  type: 'DAILY' | 'MONTHLY'; // Phân loại báo cáo
  id?: string;              // Firestore Document ID (để xóa)
  firestorePath?: string;   // Full Path

  // === 6. NHÓM GIÁ DVKT & TƯƠNG ĐƯƠNG ===
  maTuongDuong?: string;    // Mã BHXH / Mã tương đương chuẩn hóa (XX.XXXX.XXXX)
  donGia?: number;          // Đơn giá (VNĐ)
  thanhTien?: number;       // Thành tiền (VNĐ)
  priceSource?: 'excel_dvkt' | 'catalog'; // Nguồn gốc giá
}

// ================= STATISTICS MODULE TYPES =================

/** Loại PT/TT codes và thứ tự chuẩn */
export const LOAI_PTTT_ORDER = ['PĐB', 'P1', 'P2', 'P3', 'TĐB', 'T1', 'T2', 'T3', 'TKPL'] as const;
export type LoaiPTTT = typeof LOAI_PTTT_ORDER[number];

export const LOAI_PTTT_LABELS: Record<string, string> = {
  'PĐB': 'Phẫu thuật ĐB',
  'P1': 'Phẫu thuật loại 1',
  'P2': 'Phẫu thuật loại 2',
  'P3': 'Phẫu thuật loại 3',
  'TĐB': 'Thủ thuật ĐB',
  'T1': 'Thủ thuật loại 1',
  'T2': 'Thủ thuật loại 2',
  'T3': 'Thủ thuật loại 3',
  'TKPL': 'Thủ thuật KPL',
};

/** Phiên bản bảng giá dịch vụ PT/TT (lưu trong RTDB) */
export interface SurgeryPriceVersion {
  id: string;
  name: string;
  effectiveFrom: string;         // "2024-01-01" ISO date
  effectiveTo: string | null;    // null = đang hiệu lực
  createdAt: number;
  note: string;
  prices: Record<string, number>; // { "PĐB": 5000000, "P1": 3000000, ... }
}

/** Giá dịch vụ theo tên phẫu thuật cụ thể (flat: 1 record = 1 tên + 1 giá + hiệu lực) */
export interface SurgeryNamePrice {
  id: string;
  tenKT: string;                 // Tên kỹ thuật (exact match, normalized)
  price: number;                 // Đơn giá dịch vụ (VNĐ)
  effectiveFrom: string;         // "2024-01-01" ISO date — bắt đầu hiệu lực
  effectiveTo: string | null;    // ISO date | null — null = đang hiệu lực
  createdAt: number;             // timestamp
  maTuongDuong?: string;         // Mã tương đương (MA_TUONG_DUONG)
}

/** Ứng viên kỹ thuật thiếu trong danh mục giá do quét CSDL phát hiện */
export interface MissingCatalogCandidate {
  id: string;
  tenKT: string;
  maTuongDuong: string;
  effectiveFrom: string;         // yyyy-mm-dd (ngày mổ sớm nhất phát hiện)
  recordCount: number;           // Số ca trong CSDL
  price: number;                 // Đơn giá đề xuất (0 hoặc lấy từ ca có sẵn giá)
  selected: boolean;             // Trạng thái tick chọn của user
}

/** Chi phí PTTT — tham chiếu DM giá + thêm chi phí thuốc/VTTH */
export interface SurgeryCostItem {
  id: string;
  refPriceId: string;            // → SurgeryNamePrice.id
  maTuongDuong: string;          // Copy từ DM giá
  tenKT: string;                 // Copy từ DM giá
  donGia: number;                // Copy từ DM giá (đơn giá DVKT VNĐ)
  medicCost: number;             // Chi phí thuốc (VNĐ, > 0)
  vtthCost: number;              // Chi phí VTTH (VNĐ, > 0)
  
  // Hiệu lực DVKT (đồng bộ từ DM giá)
  dvktEffectiveFrom: string;     // "2026-01-01" ISO date
  dvktEffectiveTo: string | null;// null = hiện tại

  // Hiệu lực Chi phí (do người dùng quản lý riêng)
  costEffectiveFrom: string;     // "2026-01-01" ISO date
  costEffectiveTo: string | null;// null = hiện tại

  // Tương thích ngược với dữ liệu cũ
  effectiveFrom?: string;
  effectiveTo?: string | null;

  createdAt: number;
  updatedAt: number;
}

/** Profile nhóm tên kỹ thuật PT/TT (lưu Firestore, global) */
export interface SurgeryProfile {
  id: string;
  name: string;                    // Tên profile (unique, global)
  surgeryNames: string[];          // Danh sách tên KT (lowercase chuẩn hóa)
  createdAt: number;
  updatedAt: number;
}

/** Chế độ lọc bảng thống kê PTTT */
export type PTTTFilterMode = 'all' | 'chapter' | 'profile';

/** Danh mục chương — phân loại phẫu thuật theo chương */
export interface ChapterCatalog {
  id: string;
  ma_chuong: string;             // VD: "I", "II", "III"...
  ten_chuong: string;            // VD: "Bệnh nhiễm trùng và ký sinh trùng"
  createdAt: number;             // timestamp
}

/** Danh mục mã máy — quản lý thiết bị phẫu thuật */
export interface MachineEntry {
  id: string;                // Internal unique ID (auto-generated)
  machineId: string;         // ID máy (mã nội bộ bệnh viện)
  machineCode: string;       // Mã máy (unique key, dùng để lookup)
  machineName: string;       // Tên máy
  active: boolean;           // true = Đang sử dụng, false = Không sử dụng
}

/** Số liệu tổng hợp theo tháng (computed, không lưu DB) */
export interface MonthlyAggregate {
  month: number;
  year: number;
  actualCases: number;
  equivalentCases: number;
  byType: Record<string, number>;
  byTypeEquivalent: Record<string, number>;
  byName: Record<string, number>;
  byNameEquivalent: Record<string, number>;
  serviceCost: number;
  laborCost: number;
  serviceCostByType: Record<string, number>;
  laborCostByType: Record<string, number>;
  namePriceCost: number;                       // Doanh thu dịch vụ theo tên PT
  namePriceCostByType: Record<string, number>; // Doanh thu theo loại (PĐB, P1...)
  namePriceCostByName: Record<string, number>; // Viện phí theo tên PTTT (normalized)
  maTuongDuongByName: Record<string, string>;  // normalizedName → maTuongDuong (for chapter filter)
  dataSource: 'MONTHLY' | 'DAILY';
}

/** Số liệu tổng hợp theo ngày (tháng hiện tại) */
export interface DailyAggregate {
  date: string;
  cases: number;
  cumulative: number;
  equivalentCases: number;
  cumulativeEquivalent: number;
  serviceCost: number;
  cumulativeServiceCost: number;
  laborCost: number;
  cumulativeLaborCost: number;
  namePriceCost: number;
  cumulativeNamePriceCost: number;
  byType: Record<string, number>;
  byName: Record<string, number>;
}

/** Dữ liệu dự báo — V5+ Cumulative Seasonal Model */
export interface ForecastData {
  daysElapsed: number;
  totalDaysInMonth: number;
  currentCumulative: number;
  forecastTotal: number;                    // Dự báo tháng hiện tại (blended)
  lastYearSameMonth: number;
  completionVsLastYear: number | null;
  confidence: 'low' | 'medium' | 'high';
  // V5+ extensions
  yearEstimate: number | null;              // Ước lượng tổng năm (top-down)
  forecastMonthly: Record<number, number>;  // Forecast lũy kế theo tháng (1-12) cho chart
  seasonalWeight: number;                   // Weight seasonal thực tế đã dùng
  modelNote: string;                        // Ghi chú model (fallback/seasonal/blend)
}

/** Thống kê theo tên PT/TT cho cả năm */
export interface SurgeryNameStats {
  name: string;
  normalizedName: string;
  maTuongDuong?: string;
  totalCases: number;
  totalEquivalent: number;
  percentage: number;
  changeVsCompare: number | null;
  monthlyBreakdown: number[];
}

/** Bất thường vận hành theo ngày */
export interface DailyAnomaly {
  date: string;
  type: 'zero_cases' | 'drop_50pct' | 'spike_200pct';
  message: string;
}

/** Kết quả tổng hợp thống kê cho UI */
export interface StatisticsData {
  primaryYear: number;
  compareYear: number;
  selectedMonth: number; // 1-12, the month for daily aggregation
  primary: MonthlyAggregate[];
  compare: MonthlyAggregate[];
  currentMonthDaily: DailyAggregate[];
  previousMonthDaily: DailyAggregate[];
  compareMonthDaily: DailyAggregate[];
  forecast: ForecastData | null;
  topSurgeries: SurgeryNameStats[];
  anomalies: DailyAnomaly[];
  paceVsLastYear: number | null;
  targetCases: number | null;
  validation: DataValidationResult;
}

/** Bản ghi trùng key phục vụ kiểm tra đối chiếu */
export interface DuplicateSurgeryRecord extends PersistedSurgeryRecord {
  duplicateGroup: number;
  duplicateGroupCount: number;
  duplicateKey: string;
}

/** Bản ghi ca mổ chưa có giá phục vụ xuất Excel chi tiết */
export interface MissingSurgeryNameRecord {
  maBN: string;
  patientName?: string;
  gender?: string;
  yob?: string;
  bhyt?: string;
  ngayPT: string;
  tenKT: string;
  loaiPTTT?: string;
  ptChinh?: string;
  ptPhu?: string;
  bsGM?: string;
  thanhTien?: number;
  donGia?: number;
  type?: 'DAILY' | 'MONTHLY';
  machine?: string;
  maTuongDuong?: string;
}

/** Kết quả kiểm tra chất lượng dữ liệu */
export interface DataValidationResult {
  duplicateCount: number;
  duplicateRecords?: DuplicateSurgeryRecord[];
  missingPriceMonths: string[];
  missingSurgeryNames: string[];   // danh sách tên KT chưa có giá (unique, chỉ hiển thị)
  missingSurgeryNameRecords: MissingSurgeryNameRecord[];  // chi tiết từng ca, xuất Excel
  totalRecords: number;
}

// ================= SERVICE PRICE MODULE TYPES =================

export interface ServicePriceItem {
  stt: number;
  maBHXH: string;
  maTuongDuong: string;
  maDV: string;
  mahh: string;
  tenDichVu: string;
  soLuong: number;
  dvt: string;
  donGia: number;
  thanhTien: number;
}

export interface PatientServicePriceGroup {
  patientId: string;
  patientName: string;
  services: ServicePriceItem[];
}

export interface ServicePriceParseResult {
  valid: boolean;
  error?: string;
  dateRangeText?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  timeFrom?: string; // HH:mm
  timeToStr?: string; // HH:mm
  patientGroups: PatientServicePriceGroup[];
  serviceCount: number;
  totalAmount: number;
}

// ───────────────── REFILL MODULE TYPES ─────────────────

export interface RefillCandidateItem {
  catalogId?: string;       // ID item trong RTDB (nếu cập nhật)
  tenKT: string;            // Tên kỹ thuật
  maTuongDuong: string;     // Mã tương đương (XX.XXXX.XXXX)
  effectiveFrom: string;    // Từ ngày (YYYY-MM-DD)
  effectiveTo: string | null; // Đến ngày (YYYY-MM-DD hoặc null)
  oldPrice?: number;        // Đơn giá hiện tại trong DM giá (nếu có)
  newPrice: number;         // Đơn giá mới từ dữ liệu Excel
  action: 'update' | 'create'; // Cập nhật giá mới hay tạo mới mục giá
  matchedCount: number;     // Số ca phẫu thuật mang giá này (chỉ BHYT)
  sampleDate: string;       // Ngày thực hiện mẫu (YYYY-MM-DD)
  selected?: boolean;       // Trạng thái tick chọn
  conflictWarning?: string; // Cảnh báo khi cùng catalogId có nhiều mức giá BHYT
}


export interface RefillProcessReport {
  totalExcelRecords: number;
  catalogUpdatedCount: number;
  catalogCreatedCount: number;
  dataBackfilledCount: number;
}

export interface RolePrice {
  'Chính': number;
  'Phụ': number;
  'Giúp việc': number;
}

export interface TimeRule {
  min: number;
  max: number;
}

/** Timeline-based labor config version — each version holds priceConfig + timeRules for a date range */
export interface LaborConfigVersion {
  id: string;
  name: string;                                    // e.g. "Quy định 2025"
  effectiveFrom: string;                           // yyyy-mm-dd
  effectiveTo: string | null;                      // null = currently active
  priceConfig: Record<string, RolePrice>;          // PĐB, P1, P2... → { Chính, Phụ, Giúp việc }
  timeRules: Record<string, TimeRule>;             // PĐB, P1... → { min, max }
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** Flat independent timeline items for each PTTT allowance rate */
export interface LaborAllowanceItem {
  id: string;
  loai: string;             // PĐB, P1, P2, P3, TĐB, T1, T2, T3, TKPL
  chinh: number;
  phu: number;
  giupViec: number;
  effectiveFrom: string;    // yyyy-mm-dd
  effectiveTo: string | null; // null = currently active
  createdAt: number;
  updatedAt: number;
}

/** Flat independent timeline items for each PTTT time norm */
export interface LaborTimeItem {
  id: string;
  loai: string;             // PĐB, P1, P2, P3, TĐB, T1, T2, T3, TKPL
  min: number;              // minutes
  max: number;              // minutes
  effectiveFrom: string;    // yyyy-mm-dd
  effectiveTo: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Flat independent timeline items for each staff operating table limit */
export interface LaborTableItem {
  id: string;
  posKey: string;           // ptChinh, ptPhu, bsGM, ktvGM, tdc, gv
  label: string;            // BS PT chính, ...
  limit: number;            // 0: Không kiểm tra, 1: Tối đa 1 bàn, 2: Tối đa 2 bàn
  effectiveFrom: string;    // yyyy-mm-dd
  effectiveTo: string | null;
  createdAt: number;
  updatedAt: number;
}
/** Flat timeline items for technical services requiring machine code */
export interface RequiredMachineItem {
  id: string;
  maTuongDuong: string;            // Mã tương đương (VD: 01.0303.0001)
  tenDVKT: string;                 // Tên dịch vụ kỹ thuật
  effectiveFrom: string;           // yyyy-mm-dd
  effectiveTo: string | null;      // null = currently active
  isRequired: boolean;             // true: Bắt buộc dùng mã máy, false: Không bắt buộc
  createdAt?: number;
  updatedAt?: number;
}
