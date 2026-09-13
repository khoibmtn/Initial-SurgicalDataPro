// ─── Audit Log Types ──────────────────────────────────────────────────────────
// Truy vết chỉnh sửa số liệu, phê duyệt và thao tác quan trọng trong hệ thống
// Hỗ trợ kiểm toán y tế, đối soát thanh toán và minh bạch trách nhiệm

import { UserRole } from './auth';

export type AuditAction =
  | 'REPORT_LOCK'
  | 'REPORT_UNLOCK'
  | 'RECORD_EDIT'
  | 'ASSISTANT_FILL'
  | 'RECORD_DELETE'
  | 'DATA_SAVE'
  | 'USER_APPROVE'
  | 'USER_REJECT'
  | 'USER_ROLE_CHANGE'
  | 'SYSTEM_CONFIG';

export interface FieldDiff {
  fieldKey: string;
  fieldLabel: string;
  before: any;
  after: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  userId: string;
  userName: string;
  userRole: UserRole | 'guest';
  userDepartment?: string;
  action: AuditAction;
  targetType: 'surgery_record' | 'report' | 'user' | 'config';
  targetId?: string;
  targetLabel?: string; // e.g. "BN Nguyễn Văn A (123456)" hoặc "Tháng 09/2026"
  periodKey?: string; // e.g. "2026-09" hoặc "2026-09-13"
  department?: string; // Khoa liên quan
  description: string;
  diffs?: FieldDiff[];
}

export interface CreateAuditLogParams {
  userId: string;
  userName: string;
  userRole: UserRole | 'guest';
  userDepartment?: string;
  action: AuditAction;
  targetType: 'surgery_record' | 'report' | 'user' | 'config';
  targetId?: string;
  targetLabel?: string;
  periodKey?: string;
  department?: string;
  description: string;
  diffs?: FieldDiff[];
}

export interface AuditFilterParams {
  periodKey?: string;
  department?: string;
  action?: AuditAction | 'ALL';
  searchTerm?: string;
  userRole?: string;
  limit?: number;
}
