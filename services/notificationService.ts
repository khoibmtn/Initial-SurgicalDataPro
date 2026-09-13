// ─── Notification Service ──────────────────────────────────────────────────────
// Quản lý thông báo thời gian thực bằng Firebase Realtime Database
// Đồng bộ tức thời khi có đăng ký mới, khóa báo cáo, hoặc cập nhật dữ liệu

import { ref, set, onValue, query, limitToLast } from 'firebase/database';
import { db } from '../lib/firebase';
import type { AppNotification, SendNotificationParams, NotificationType } from '../types/notification';
import type { UserRole } from '../types/auth';

const NOTIFICATIONS_PATH = 'system_notifications';

/**
 * Gửi một thông báo mới vào hệ thống
 */
export async function sendNotification(params: SendNotificationParams): Promise<string> {
  try {
    const timestamp = new Date().toISOString();
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const notification: AppNotification = {
      id,
      type: params.type,
      title: params.title,
      message: params.message,
      timestamp,
      read: false,
      targetRole: params.targetRole || 'all',
      department: params.department || 'ALL',
      targetUserId: params.targetUserId,
      actionTab: params.actionTab,
      actionSubTab: params.actionSubTab,
      createdBy: params.createdBy,
    };

    const notifRef = ref(db, `${NOTIFICATIONS_PATH}/${id}`);
    await set(notifRef, notification);

    return id;
  } catch (err) {
    console.error('[notificationService] sendNotification error:', err);
    return '';
  }
}

/**
 * Lấy danh sách ID thông báo đã đọc của user từ localStorage
 */
export function getReadNotificationIds(userId: string): Set<string> {
  try {
    const key = `read_notifs_${userId || 'guest'}`;
    const saved = localStorage.getItem(key);
    if (!saved) return new Set();
    const arr = JSON.parse(saved);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Đánh dấu một thông báo là đã đọc
 */
export function markNotificationAsRead(id: string, userId: string): void {
  try {
    const readSet = getReadNotificationIds(userId);
    readSet.add(id);
    const key = `read_notifs_${userId || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(Array.from(readSet)));
  } catch (err) {
    console.warn('[notificationService] Failed to mark as read:', err);
  }
}

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
export function markAllNotificationsAsRead(ids: string[], userId: string): void {
  try {
    const readSet = getReadNotificationIds(userId);
    ids.forEach((id) => readSet.add(id));
    const key = `read_notifs_${userId || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(Array.from(readSet)));
  } catch (err) {
    console.warn('[notificationService] Failed to mark all as read:', err);
  }
}

/**
 * Kiểm tra xem thông báo có áp dụng cho user hiện tại không
 */
export function isNotificationForUser(
  notif: AppNotification,
  userRole: UserRole | 'guest',
  userDept?: string,
  userId?: string
): boolean {
  // 1. Nếu có đích danh userId
  if (notif.targetUserId && notif.targetUserId !== userId) {
    return false;
  }

  // 2. Kiểm tra vai trò
  if (notif.targetRole && notif.targetRole !== 'all') {
    if (notif.targetRole === 'admin' && userRole !== 'admin') {
      return false;
    }
    if (notif.targetRole === 'head' && userRole !== 'admin' && userRole !== 'head') {
      return false;
    }
  }

  // 3. Kiểm tra khoa
  if (notif.department && notif.department !== 'ALL') {
    if (userRole !== 'admin' && userDept && userDept !== notif.department) {
      return false;
    }
  }

  return true;
}

/**
 * Lắng nghe thông báo realtime phù hợp với user
 */
export function subscribeNotifications(
  userRole: UserRole | 'guest',
  userDept: string | undefined,
  userId: string | undefined,
  callback: (notifications: AppNotification[]) => void,
  maxCount: number = 60
): () => void {
  try {
    const notifsRef = ref(db, NOTIFICATIONS_PATH);
    const notifsQuery = query(notifsRef, limitToLast(maxCount));

    const unsub = onValue(
      notifsQuery,
      (snapshot) => {
        const val = snapshot.val();
        if (!val || typeof val !== 'object') {
          callback([]);
          return;
        }

        const readIds = getReadNotificationIds(userId || 'guest');
        const rawList: AppNotification[] = Object.values(val);

        // Lọc thông báo thuộc quyền xem của user
        const matched = rawList.filter((n) => isNotificationForUser(n, userRole, userDept, userId));

        // Gắn cờ read theo trạng thái cá nhân hóa
        const enriched = matched.map((n) => ({
          ...n,
          read: readIds.has(n.id),
        }));

        // Sắp xếp mới nhất lên đầu
        enriched.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        callback(enriched);
      },
      (err) => {
        console.error('[notificationService] Error subscribing to notifications:', err);
        callback([]);
      }
    );

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  } catch (err) {
    console.error('[notificationService] Subscription failed:', err);
    callback([]);
    return () => {};
  }
}
