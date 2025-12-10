export interface ProcessedStats {
  totalSurgeries: number;
  totalDurationMinutes: number;
  staffConflicts: number;
  machineConflicts: number;
  missingMachines: number;
  lowPaymentCount: number; // Num surgeries with soLuong < 1
}

export interface UISettings {
  rowsPerPage: number;
  dateFormat: string; // 'dd/mm/yyyy', 'dd/mm/yyyy hh:mm', etc.
  visibleColumns: Record<string, Record<string, boolean>>; // tableName -> colKey -> boolean
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
}

export type StaffRole = "PT_CHINH" | "PT_PHU" | "BS_GM" | "KTV_GM" | "TDC" | "GV";

export interface StaffConflict {
  staffName: string;
  role: StaffRole;
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
