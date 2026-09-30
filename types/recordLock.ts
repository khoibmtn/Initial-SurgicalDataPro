// ─── Collaborative Record Lock Types ─────────────────────────────────────────
// Khóa chỉnh sửa ca mổ theo thời gian thực (Mục 3.3.2)
// Ngăn chặn 2 người dùng sửa đè dữ liệu cùng một lúc

export interface RecordEditingLock {
  recordId: string;
  patientId?: string;
  patientName?: string;
  tenKT?: string;
  userId: string;
  userName: string;
  userRole?: string;
  userDepartment?: string;
  startedAt: number;     // Timestamp khởi tạo (ms)
  lastHeartbeat: number; // Timestamp heartbeat gần nhất (ms)
}

/** Thông tin lock trả về khi kiểm tra 1 ca mổ */
export interface LockStatusResult {
  isLockedByOther: boolean;
  lock?: RecordEditingLock;
  message?: string;
}

/** Thời gian timeout mặc định của một lock (2 phút không có heartbeat) */
export const RECORD_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

/** Khoảng thời gian gửi heartbeat định kỳ (20 giây) */
export const RECORD_LOCK_HEARTBEAT_INTERVAL_MS = 20 * 1000;
