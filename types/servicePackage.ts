/**
 * Service Package Module Types
 * 
 * Quản lý gói dịch vụ phẫu thuật — cấu hình gói, danh mục vị trí,
 * gán gói cho bệnh nhân, và cấu hình module.
 */

// ─── Position Catalog ────────────────────────────────────────────────────────

/** Danh mục vị trí — thống nhất 6 vị trí PTTT cũ + vị trí mới */
export interface PositionCatalogItem {
  id: string;
  key: string;              // 'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv' | 'chuanBiPT' | 'hoSinhDonBe' | 'nguoiTuVan' | custom...
  label: string;            // 'BS PT chính' | 'Điều dưỡng chuẩn bị BN phẫu thuật' | ...
  shortLabel: string;       // 'PT chính' | 'Chuẩn bị PT' | 'HS đón bé' | 'Tư vấn'
  group: PositionGroup;
  isSurgeryParticipant: boolean;  // true = tham gia cuộc mổ, false = không tham gia
  staffFilterKey?: string;        // Map to SurgeryRecord field for auto-fill: 'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv' | ''
  onlyNonSurgicalStaff?: boolean; // When true and no staffFilterKey: only list staff with nonSurgical === true
  sortOrder: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PositionGroup = 'surgeons' | 'anesthesiologists' | 'support' | 'assistants' | 'non_surgical';

/** Danh sách các cột phẫu thuật cho phép ánh xạ */
export const SURGERY_MAPPING_OPTIONS = [
  { key: 'ptChinh', label: 'PTV chính' },
  { key: 'ptPhu', label: 'PT phụ' },
  { key: 'bsGM', label: 'BS GMHS' },
  { key: 'ktvGM', label: 'KTV gây mê' },
  { key: 'tdc', label: 'Tít dụng cụ' },
  { key: 'gv', label: 'Giúp việc' },
] as const;

export function getSurgeryMappingLabel(key: string | undefined | null): string {
  if (!key) return '';
  const found = SURGERY_MAPPING_OPTIONS.find(o => o.key === key);
  return found ? found.label : key;
}

/** 9 vị trí mặc định để seed */
export const DEFAULT_POSITIONS: Omit<PositionCatalogItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { key: 'ptChinh',     label: 'BS PT chính',                              shortLabel: 'PT chính',     group: 'surgeons',           isSurgeryParticipant: true,  staffFilterKey: 'ptChinh', onlyNonSurgicalStaff: false, sortOrder: 1, active: true },
  { key: 'ptPhu',       label: 'BS PT phụ',                                shortLabel: 'PT phụ',       group: 'surgeons',           isSurgeryParticipant: true,  staffFilterKey: 'ptPhu',   onlyNonSurgicalStaff: false, sortOrder: 2, active: true },
  { key: 'bsGM',        label: 'BS gây mê hồi sức',                       shortLabel: 'BS GM',        group: 'anesthesiologists',  isSurgeryParticipant: true,  staffFilterKey: 'bsGM',    onlyNonSurgicalStaff: false, sortOrder: 3, active: true },
  { key: 'ktvGM',       label: 'KTV gây mê',                               shortLabel: 'KTV GM',       group: 'support',            isSurgeryParticipant: true,  staffFilterKey: 'ktvGM',   onlyNonSurgicalStaff: false, sortOrder: 4, active: true },
  { key: 'tdc',         label: 'Tít dụng cụ',                              shortLabel: 'TDC',          group: 'support',            isSurgeryParticipant: true,  staffFilterKey: 'tdc',     onlyNonSurgicalStaff: false, sortOrder: 5, active: true },
  { key: 'gv',          label: 'Giúp việc',                                shortLabel: 'GV',           group: 'assistants',         isSurgeryParticipant: true,  staffFilterKey: 'gv',      onlyNonSurgicalStaff: false, sortOrder: 6, active: true },
  { key: 'chuanBiPT',   label: 'Điều dưỡng chuẩn bị BN phẫu thuật',       shortLabel: 'Chuẩn bị PT',  group: 'non_surgical',       isSurgeryParticipant: false, onlyNonSurgicalStaff: true,  sortOrder: 7, active: true },
  { key: 'hoSinhDonBe', label: 'Hộ sinh đón bé',                           shortLabel: 'HS đón bé',    group: 'non_surgical',       isSurgeryParticipant: false, onlyNonSurgicalStaff: true,  sortOrder: 8, active: true },
  { key: 'nguoiTuVan',  label: 'Người tư vấn',                             shortLabel: 'Tư vấn',       group: 'non_surgical',       isSurgeryParticipant: false, onlyNonSurgicalStaff: true,  sortOrder: 9, active: true },
];

/**
 * Lấy tên viết tắt (shortLabel) của vị trí trong gói dịch vụ.
 * Ưu tiên: Danh mục vị trí cấu hình (positionCatalog) > Vị trí trong gói (packages) > DEFAULT_POSITIONS > Tên key.
 */
export function getPositionShortLabel(
  key: string,
  positionCatalog?: PositionCatalogItem[],
  packages?: { positions?: { positionKey: string; positionLabel?: string }[] }[]
): string {
  if (!key) return '';
  const cat = positionCatalog?.find((p) => p.key === key);
  if (cat?.shortLabel) return cat.shortLabel;

  if (packages) {
    for (const pkg of packages) {
      const pos = pkg.positions?.find((p) => p.positionKey === key);
      if (pos?.positionLabel) return pos.positionLabel;
    }
  }

  const def = DEFAULT_POSITIONS.find((p) => p.key === key);
  if (def?.shortLabel) return def.shortLabel;

  switch (key) {
    case 'ptChinh': return 'PT chính';
    case 'ptPhu': return 'PT phụ';
    case 'bsGM': return 'BS GM';
    case 'ktvGM': return 'KTV GM';
    case 'tdc': return 'TDC';
    case 'gv': return 'GV';
    default: return key;
  }
}

// ─── Service Package Definition ──────────────────────────────────────────────

/** Cách tính khấu trừ thêm: % trên số tiền vị trí, hoặc số tiền cố định cho mỗi vị trí */
export type DeductionType = 'percent' | 'amount';

/** Khấu trừ thêm áp dụng cho từng vị trí trong gói */
export interface PackageDeduction {
  type: DeductionType;
  value: number;             // % (0-100) hoặc số tiền VNĐ tuỳ theo type
  note?: string;             // Diễn giải lý do khấu trừ
}

/** Cấu hình 1 gói dịch vụ */
export interface ServicePackageDefinition {
  id: string;
  name: string;              // "Phẫu thuật chọn bác sĩ", "PT chọn BS sản khoa"...
  shortName?: string;        // Tên rút gọn hiển thị trên bảng, e.g. "BS yêu cầu"
  totalAmount: number;       // Tổng số tiền gói (VNĐ), e.g. 2_000_000
  taxPercent?: number;       // Thuế (%) tính trên tổng số tiền gói
  deduction?: PackageDeduction;  // Khấu trừ thêm cho từng vị trí khi tính thực lĩnh
  positions: ServicePackagePosition[];  // Danh sách vị trí + số tiền
  active: boolean;           // true = đang hoạt động, false = ẩn/disabled
  sortOrder: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** 1 vị trí trong gói */
export interface ServicePackagePosition {
  positionId: string;        // → PositionCatalogItem.id
  positionKey: string;       // → PositionCatalogItem.key (denormalized for fast lookup)
  positionLabel: string;     // → PositionCatalogItem.shortLabel (denormalized)
  amount: number;            // Số tiền chi cho vị trí này (VNĐ)
}

// ─── Service Package Assignment ──────────────────────────────────────────────

/** Gán gói dịch vụ cho 1 cuộc mổ của bệnh nhân */
export interface ServicePackageAssignment {
  id: string;                // Firestore auto-id

  // === Composite Key (unique per cuộc mổ) ===
  patientId: string;         // Mã bệnh nhân
  ngayBD: string;            // Ngày bắt đầu (ISO date or datetime string)
  tenKT: string;             // Tên cuộc phẫu thuật
  compositeKey: string;      // `${patientId}_${ngayBDNormalized}_${normalizedTenKT}` — indexed

  // === Patient Info (denormalized from SurgeryRecord) ===
  patientName: string;
  gender?: string;
  yob?: string;

  // === Package Info ===
  packageId: string;         // → ServicePackageDefinition.id
  packageName: string;       // Denormalized: tên gói
  packageShortName?: string;  // Denormalized: tên rút gọn của gói

  // === Staff Assignment (per position) ===
  staffAssignments: PackageStaffAssignment[];

  // === Surgery Records linked ===
  linkedSurgeryKeys: string[];  // Danh sách surgery record keys gom vào cuộc mổ này

  // === Metadata ===
  createdAt: number;
  updatedAt: number;
  createdBy?: string;         // User ID
}

/** Nhân sự được gán vào 1 vị trí của gói */
export interface PackageStaffAssignment {
  positionId: string;         // → PositionCatalogItem.id
  positionKey: string;        // e.g. 'ptChinh', 'nguoiTuVan'
  positionLabel: string;      // Short label
  staffName: string;          // Tên nhân viên
  amount: number;             // Số tiền cho vị trí này (from package definition)
  autoFilled: boolean;        // true = tự động lấy từ DS PT, false = user chọn thủ công
}

// ─── Module Config ───────────────────────────────────────────────────────────

/** Cấu hình chung của module gói dịch vụ (lưu trong Firestore) */
export interface ServicePackageModuleConfig {
  allowOverrideAutoFilledStaff: boolean;  // Cho phép chỉnh PTV chính/phụ... sau auto-fill
  printTitle?: string;                    // Tiêu đề bản in bảng thanh toán gói dịch vụ
}

export const DEFAULT_MODULE_CONFIG: ServicePackageModuleConfig = {
  allowOverrideAutoFilledStaff: true,
  printTitle: 'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU',
};

// ─── Tax / Deduction Calculations ────────────────────────────────────────────

/** Tiền thuế của gói = tổng gói × thuế% */
export function calcTaxAmount(totalAmount: number, taxPercent?: number): number {
  if (!totalAmount || !taxPercent || taxPercent <= 0) return 0;
  return Math.round(totalAmount * taxPercent / 100);
}

/** Số tiền bị khấu trừ trên 1 vị trí (không vượt quá số tiền của vị trí) */
export function calcDeductionAmount(positionAmount: number, deduction?: PackageDeduction): number {
  if (!deduction || !deduction.value || deduction.value <= 0 || positionAmount <= 0) return 0;
  const raw = deduction.type === 'percent'
    ? Math.round(positionAmount * deduction.value / 100)
    : deduction.value;
  return Math.min(raw, positionAmount);
}

/** Số tiền thực lĩnh của 1 vị trí = số tiền vị trí − khấu trừ thêm */
export function calcNetPositionAmount(positionAmount: number, deduction?: PackageDeduction): number {
  return Math.max(0, (positionAmount || 0) - calcDeductionAmount(positionAmount || 0, deduction));
}

/** Số tiền còn phải kê cho các vị trí = tổng gói − thuế − tổng đã kê (không tính khấu trừ) */
export function calcPackageRemaining(totalAmount: number, taxPercent: number | undefined, positionsSum: number): number {
  return (totalAmount || 0) - calcTaxAmount(totalAmount, taxPercent) - (positionsSum || 0);
}

/** Tìm định nghĩa gói của 1 lần gán (ưu tiên id, sau đó theo tên) */
export function findPackageForAssignment(
  a: Pick<ServicePackageAssignment, 'packageId' | 'packageName'>,
  packages: ServicePackageDefinition[],
): ServicePackageDefinition | undefined {
  return packages.find(p => p.id && a.packageId && p.id === a.packageId)
    || packages.find(p => p.name && a.packageName && p.name.trim().toLowerCase() === a.packageName.trim().toLowerCase());
}

/** Mô tả ngắn khấu trừ để hiển thị: "20%" hoặc "300.000 đ" */
export function formatDeductionValue(deduction?: PackageDeduction): string {
  if (!deduction || !deduction.value) return '';
  return deduction.type === 'percent'
    ? `${deduction.value}%`
    : `${deduction.value.toLocaleString('vi-VN')} đ`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lấy chuỗi ngày an toàn từ SurgeryRecord kể cả khi start/ngayBD là string hoặc Date */
export function getRecordDateString(rec: any): string {
  if (!rec) return '';
  if (rec.start instanceof Date) return rec.start.toISOString();
  if (typeof rec.start === 'string' && rec.start) return rec.start;
  if (rec.ngayBD instanceof Date) return (rec.ngayBD as Date).toISOString();
  if (typeof rec.ngayBD === 'string' && rec.ngayBD) return rec.ngayBD;
  return '';
}

/** Normalize tên kỹ thuật để tạo composite key */
export function normalizeForKey(s: string): string {
  return (s || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Tạo composite key cho 1 cuộc mổ */
export function buildCompositeKey(patientId: string, ngayBD: string, tenKT: string): string {
  // Normalize ngayBD: chỉ lấy phần date YYYY-MM-DD
  const dateKey = (ngayBD || '').substring(0, 10);
  return `${(patientId || '').trim()}_${dateKey}_${normalizeForKey(tenKT || '')}`;
}

export const LS_DRAFT_KEY = 'package_draft_records';

/** Xóa danh sách ca tạm chưa gán gói (khi nạp lại dữ liệu hoặc khởi động lại) */
export function clearPackageDrafts(): void {
  try {
    localStorage.removeItem(LS_DRAFT_KEY);
    sessionStorage.removeItem(LS_DRAFT_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('package_drafts_updated'));
    }
  } catch (err) {
    console.error('Failed to clear package drafts:', err);
  }
}
