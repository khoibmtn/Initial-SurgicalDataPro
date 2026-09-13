// ─── Report Lock Types ────────────────────────────────────────────────────────
// Quản lý khóa sổ / chốt số liệu báo cáo theo kỳ (tháng hoặc ngày)
// Trưởng khoa / Admin có thể khóa báo cáo để ngăn nhân viên chỉnh sửa sau khi chốt số liệu.

import { UserRole } from './auth';

export interface ReportLock {
  /** ID khóa, ví dụ 'monthly_2026_09' hoặc 'daily_2026-09-13' */
  id: string;
  /** Loại kỳ báo cáo */
  periodType: 'monthly' | 'daily';
  /** Chuỗi định danh kỳ, ví dụ '2026-09' hoặc '2026-09-13' */
  periodKey: string;
  /** Trạng thái khóa */
  isLocked: boolean;
  /** Tên hoặc nickname người khóa */
  lockedBy: string;
  /** UID người khóa */
  lockedByUid: string;
  /** Vai trò người khóa */
  lockedByRole: UserRole;
  /** Khoa phụ trách khóa (nếu khóa phạm vi khoa) hoặc 'ALL' */
  department?: string;
  /** Thời điểm khóa (ISO string) */
  lockedAt: string;
  /** Thời điểm mở khóa gần nhất (nếu có) */
  unlockedAt?: string;
  /** Người mở khóa */
  unlockedBy?: string;
  /** UID người mở khóa */
  unlockedByUid?: string;
  /** Ghi chú lý do khóa (vd: 'Đã chốt phụ cấp PTTT tháng 09/2026 gửi phòng TCKT') */
  note?: string;
}

export interface LockReportParams {
  periodType: 'monthly' | 'daily';
  periodKey: string;
  lockedBy: string;
  lockedByUid: string;
  lockedByRole: UserRole;
  department?: string;
  note?: string;
}

export interface UnlockReportParams {
  lockKey: string;
  unlockedBy: string;
  unlockedByUid: string;
  reason?: string;
}
