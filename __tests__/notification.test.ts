import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNotificationForUser,
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sendNotification,
  subscribeNotifications,
} from '../services/notificationService';
import type { AppNotification } from '../types/notification';
import { set, onValue } from 'firebase/database';

// Mock Firebase Realtime Database
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  set: vi.fn().mockResolvedValue(undefined),
  onValue: vi.fn(),
  query: vi.fn((q: any) => q),
  limitToLast: vi.fn((n: number) => ({ limit: n })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

// Mock localStorage for node test environment
const storageMock: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => (key in storageMock ? storageMock[key] : null),
  setItem: (key: string, val: string) => {
    storageMock[key] = String(val);
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    Object.keys(storageMock).forEach((k) => delete storageMock[k]);
  },
  key: (i: number) => Object.keys(storageMock)[i] ?? null,
  length: 0,
};

describe('Notification Service & RBAC Routing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('isNotificationForUser', () => {
    const baseNotif: AppNotification = {
      id: 'notif_1',
      type: 'DATA_SAVED',
      title: 'Báo cáo đã lưu',
      message: 'Khoa Ngoại đã lưu báo cáo',
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'all',
      department: 'ALL',
    };

    it('allows all users to receive global notifications (targetRole: all, department: ALL)', () => {
      expect(isNotificationForUser(baseNotif, 'admin', 'Ngoại', 'u_admin')).toBe(true);
      expect(isNotificationForUser(baseNotif, 'head', 'Ngoại', 'u_head')).toBe(true);
      expect(isNotificationForUser(baseNotif, 'staff', 'Gây mê', 'u_staff')).toBe(true);
      expect(isNotificationForUser(baseNotif, 'guest')).toBe(true);
    });

    it('restricts admin-only notifications to admin users only', () => {
      const adminNotif: AppNotification = {
        ...baseNotif,
        type: 'PENDING_USER',
        targetRole: 'admin',
      };

      expect(isNotificationForUser(adminNotif, 'admin', 'ALL', 'u_admin')).toBe(true);
      expect(isNotificationForUser(adminNotif, 'head', 'Ngoại', 'u_head')).toBe(false);
      expect(isNotificationForUser(adminNotif, 'staff', 'Ngoại', 'u_staff')).toBe(false);
      expect(isNotificationForUser(adminNotif, 'guest')).toBe(false);
    });

    it('allows admin and head to receive head-targeted notifications, but blocks staff', () => {
      const headNotif: AppNotification = {
        ...baseNotif,
        type: 'REPORT_LOCKED',
        targetRole: 'head',
      };

      expect(isNotificationForUser(headNotif, 'admin', 'ALL', 'u_admin')).toBe(true);
      expect(isNotificationForUser(headNotif, 'head', 'Ngoại', 'u_head')).toBe(true);
      expect(isNotificationForUser(headNotif, 'staff', 'Ngoại', 'u_staff')).toBe(false);
    });

    it('filters department-specific notifications for non-admin users', () => {
      const deptNotif: AppNotification = {
        ...baseNotif,
        department: 'Ngoại Tổng hợp',
      };

      // Admin sees everything
      expect(isNotificationForUser(deptNotif, 'admin', 'Tai Mũi Họng', 'u_admin')).toBe(true);

      // Same department receives
      expect(isNotificationForUser(deptNotif, 'head', 'Ngoại Tổng hợp', 'u_head_ngoai')).toBe(true);
      expect(isNotificationForUser(deptNotif, 'staff', 'Ngoại Tổng hợp', 'u_staff_ngoai')).toBe(true);

      // Different department does NOT receive
      expect(isNotificationForUser(deptNotif, 'head', 'Sản Phụ khoa', 'u_head_san')).toBe(false);
      expect(isNotificationForUser(deptNotif, 'staff', 'Sản Phụ khoa', 'u_staff_san')).toBe(false);
    });

    it('delivers direct notifications only to the designated targetUserId', () => {
      const directNotif: AppNotification = {
        ...baseNotif,
        targetUserId: 'user_specific_123',
      };

      expect(isNotificationForUser(directNotif, 'staff', 'Ngoại', 'user_specific_123')).toBe(true);
      expect(isNotificationForUser(directNotif, 'admin', 'ALL', 'other_user')).toBe(false);
    });
  });

  describe('Read State Management (localStorage)', () => {
    const userId = 'dr_khoi';

    it('returns empty set when no notifications have been read', () => {
      const readSet = getReadNotificationIds(userId);
      expect(readSet.size).toBe(0);
    });

    it('marks a single notification as read and persists in localStorage', () => {
      markNotificationAsRead('n_101', userId);
      const readSet = getReadNotificationIds(userId);

      expect(readSet.has('n_101')).toBe(true);
      expect(readSet.has('n_102')).toBe(false);

      const saved = JSON.parse(localStorage.getItem(`read_notifs_${userId}`) || '[]');
      expect(saved).toContain('n_101');
    });

    it('marks multiple notifications as read in bulk', () => {
      markAllNotificationsAsRead(['n_1', 'n_2', 'n_3'], userId);
      const readSet = getReadNotificationIds(userId);

      expect(readSet.has('n_1')).toBe(true);
      expect(readSet.has('n_2')).toBe(true);
      expect(readSet.has('n_3')).toBe(true);
      expect(readSet.size).toBe(3);
    });

    it('isolates read states between different users', () => {
      markNotificationAsRead('n_shared', 'user_A');

      const readA = getReadNotificationIds('user_A');
      const readB = getReadNotificationIds('user_B');

      expect(readA.has('n_shared')).toBe(true);
      expect(readB.has('n_shared')).toBe(false);
    });
  });

  describe('sendNotification & subscribeNotifications', () => {
    it('creates notification with timestamp and persists via Firebase set', async () => {
      const notifId = await sendNotification({
        type: 'REPORT_LOCKED',
        title: 'Khóa sổ',
        message: 'Báo cáo tháng 09/2026 đã khóa',
        targetRole: 'head',
        department: 'Ngoại',
        actionTab: 'monthly',
      });

      expect(notifId).toBeTruthy();
      expect(set).toHaveBeenCalledTimes(1);
    });

    it('subscribes, filters by user role/dept, sorts newest first and enriches read status', () => {
      const mockData = {
        n1: {
          id: 'n1',
          type: 'DATA_SAVED',
          title: 'Lưu cũ',
          message: 'Tin 1',
          timestamp: '2026-09-10T10:00:00Z',
          targetRole: 'all',
          department: 'ALL',
        },
        n2: {
          id: 'n2',
          type: 'PENDING_USER',
          title: 'Duyệt tài khoản mới',
          message: 'Tin 2',
          timestamp: '2026-09-12T10:00:00Z',
          targetRole: 'admin',
          department: 'ALL',
        },
        n3: {
          id: 'n3',
          type: 'REPORT_LOCKED',
          title: 'Khóa sổ mới nhất',
          message: 'Tin 3',
          timestamp: '2026-09-13T08:00:00Z',
          targetRole: 'all',
          department: 'Ngoại',
        },
      };

      // Mark n1 as read
      markNotificationAsRead('n1', 'u_test');

      let received: AppNotification[] = [];
      (onValue as any).mockImplementationOnce((_query: any, callback: (snapshot: any) => void) => {
        callback({
          val: () => mockData,
        });
        return vi.fn();
      });

      const unsub = subscribeNotifications('staff', 'Ngoại', 'u_test', (items) => {
        received = items;
      });

      // Staff of Ngoại shouldn't see n2 (admin-only)
      // Should see n3 and n1, with n3 first (newest timestamp)
      expect(received.length).toBe(2);
      expect(received[0].id).toBe('n3');
      expect(received[0].read).toBe(false);
      expect(received[1].id).toBe('n1');
      expect(received[1].read).toBe(true);

      unsub();
    });
  });
});
