// ─── Notification Types ────────────────────────────────────────────────────────
// Quản lý thông báo thời gian thực (In-App Realtime Notifications)
// Thông báo về phê duyệt thành viên, khóa/mở khóa báo cáo và dữ liệu mới

import { UserRole } from './auth';

export type NotificationType =
  | 'PENDING_USER'
  | 'REPORT_LOCKED'
  | 'REPORT_UNLOCKED'
  | 'DATA_SAVED'
  | 'RECORD_EDITED'
  | 'SYSTEM_ALERT';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO string
  read: boolean;
  /** Vai trò được nhận: 'admin' | 'head' | 'staff' | 'all' */
  targetRole?: 'admin' | 'head' | 'staff' | 'all';
  /** Khoa nhận thông báo (hoặc 'ALL') */
  department?: string;
  /** UID người nhận cụ thể (nếu gửi riêng cá nhân) */
  targetUserId?: string;
  /** Dẫn hướng đến Tab khi click (e.g. 'config' | 'daily' | 'monthly') */
  actionTab?: string;
  /** Sub-tab nếu có (e.g. 'users') */
  actionSubTab?: string;
  /** Người phát sinh thông báo */
  createdBy?: string;
}

export interface SendNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  targetRole?: 'admin' | 'head' | 'staff' | 'all';
  department?: string;
  targetUserId?: string;
  actionTab?: string;
  actionSubTab?: string;
  createdBy?: string;
}
