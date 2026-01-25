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
  start: Date | null;
  end: Date | null;
  key?: string;
  id?: string; // Firestore ID
  firestorePath?: string;
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
  dateRangeText?: string; // Extracted from A5 of list file / A3 of detail file
  minDate?: Date;
  maxDate?: Date;
  extractedStaff?: StaffMember[];
}

export interface FileState {
  listFile: File | null;
  detailFile: File | null;
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

  // === 5. NHÓM TÀI NGUYÊN (Từ file Chi tiết PT) ===
  machine: string;          // Mã máy (Quan trọng để kiểm tra trùng máy)
  type: 'DAILY' | 'MONTHLY'; // Phân loại báo cáo
  id?: string;              // Firestore Document ID (để xóa)
  firestorePath?: string;   // Full Path
}
