// ─── Data Types for Excel Staging & Smart Validation ──────────────────────────
// Phục vụ màn hình xem trước và chỉnh sửa trực tiếp dữ liệu ca mổ trước khi nạp vào CSDL

import type { SurgeryRecord } from '../types';

export type StagingIssueSeverity = 'error' | 'warning';

export type StagingIssueCode =
  | 'MISSING_PATIENT_ID'
  | 'MISSING_PATIENT_NAME'
  | 'INVALID_TIME'
  | 'NEGATIVE_TIME'
  | 'MISSING_SURGEON'
  | 'INVALID_SURGERY_TYPE'
  | 'OUTLIER_TOO_SHORT'
  | 'OUTLIER_TOO_LONG'
  | 'MISSING_ANESTHESIA'
  | 'POTENTIAL_DUPLICATE'
  | 'UNASSIGNED_STAFF';

export interface StagingIssue {
  field: keyof SurgeryRecord | '_general';
  fieldLabel: string;
  message: string;
  severity: StagingIssueSeverity;
  code: StagingIssueCode;
}

export type StagingStatus = 'valid' | 'warning' | 'error';

export interface StagingRecord extends SurgeryRecord {
  _stagingId: string;
  _issues: StagingIssue[];
  _status: StagingStatus;
  _isExcluded?: boolean;
  _isModified?: boolean;
}

export interface StagingSummary {
  total: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  excludedCount: number;
}
