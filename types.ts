export interface ProcessedStats {
  totalSurgeries: number;
  totalDurationMinutes: number;
  staffConflicts: number;
  machineConflicts: number;
  missingMachines: number;
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

export interface ProcessingResult {
  success: boolean;
  message: string;
  wb?: any;
  stats: ProcessedStats;
  paymentStats?: PaymentStats;
  conflicts: Conflict[];
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
