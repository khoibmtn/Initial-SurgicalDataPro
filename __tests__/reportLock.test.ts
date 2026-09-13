import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateLockKey,
  isPeriodLocked,
  lockReport,
  unlockReport,
} from '../services/reportLockService';
import type { ReportLock, LockReportParams, UnlockReportParams } from '../types/reportLock';

// Mock firebase/database
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  onValue: vi.fn(),
  get: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

describe('Report Lock / Unlock Service & Security', () => {
  describe('generateLockKey', () => {
    it('generates global monthly lock key correctly', () => {
      const key = generateLockKey('monthly', '2026-09');
      expect(key).toBe('monthly_2026_09');
    });

    it('treats department "ALL" as global lock key', () => {
      const key = generateLockKey('monthly', '2026-09', 'ALL');
      expect(key).toBe('monthly_2026_09');
    });

    it('generates department-specific monthly lock key', () => {
      const key = generateLockKey('monthly', '2026-09', 'Ngoại TH');
      expect(key).toContain('monthly_2026_09__');
      expect(key).not.toContain(' ');
    });

    it('generates daily lock key correctly', () => {
      const key = generateLockKey('daily', '2026-09-13');
      expect(key).toBe('daily_2026_09_13');
    });

    it('handles dates with slashes gracefully', () => {
      const key = generateLockKey('daily', '2026/09/13');
      expect(key).toBe('daily_2026_09_13');
    });
  });

  describe('isPeriodLocked logic and RBAC check', () => {
    it('returns false when lock is null or undefined', () => {
      expect(isPeriodLocked(null)).toBe(false);
      expect(isPeriodLocked(undefined)).toBe(false);
    });

    it('returns false when lock exists but isLocked is false', () => {
      const lock: ReportLock = {
        id: 'monthly_2026_09',
        periodType: 'monthly',
        periodKey: '2026-09',
        isLocked: false,
        lockedBy: 'Admin',
        lockedByUid: 'admin-1',
        lockedByRole: 'admin',
        lockedAt: new Date().toISOString(),
      };
      expect(isPeriodLocked(lock)).toBe(false);
    });

    it('returns true for all users when global lock (ALL) is active', () => {
      const globalLock: ReportLock = {
        id: 'monthly_2026_09',
        periodType: 'monthly',
        periodKey: '2026-09',
        isLocked: true,
        lockedBy: 'Admin Trưởng khoa',
        lockedByUid: 'admin-1',
        lockedByRole: 'admin',
        department: 'ALL',
        lockedAt: new Date().toISOString(),
        note: 'Đã gửi TCKT chốt danh sách',
      };

      expect(isPeriodLocked(globalLock, 'staff', 'Ngoại TH')).toBe(true);
      expect(isPeriodLocked(globalLock, 'head', 'Ngoại TH')).toBe(true);
      expect(isPeriodLocked(globalLock, 'admin')).toBe(true);
      expect(isPeriodLocked(globalLock, 'guest')).toBe(true);
    });

    it('applies department-specific lock only to that department', () => {
      const deptLock: ReportLock = {
        id: 'monthly_2026_09__Ngoai_TH',
        periodType: 'monthly',
        periodKey: '2026-09',
        isLocked: true,
        lockedBy: 'Trưởng khoa Ngoại',
        lockedByUid: 'head-ngoai',
        lockedByRole: 'head',
        department: 'Ngoại TH',
        lockedAt: new Date().toISOString(),
      };

      // User from Ngoại TH is locked
      expect(isPeriodLocked(deptLock, 'staff', 'Ngoại TH')).toBe(true);
      expect(isPeriodLocked(deptLock, 'head', 'Ngoại TH')).toBe(true);

      // User from another department is NOT affected by this lock
      expect(isPeriodLocked(deptLock, 'staff', 'Gây mê')).toBe(false);
      expect(isPeriodLocked(deptLock, 'head', 'Sản')).toBe(false);
    });
  });

  describe('lockReport & unlockReport execution', () => {
    it('lockReport creates correct lock object in Firebase RTDB', async () => {
      const { set } = await import('firebase/database');

      const params: LockReportParams = {
        periodType: 'monthly',
        periodKey: '2026-09',
        lockedBy: 'BS. Khoi',
        lockedByUid: 'uid-123',
        lockedByRole: 'head',
        department: 'Ngoại TH',
        note: 'Chốt số liệu phụ cấp',
      };

      const result = await lockReport(params);
      expect(result.success).toBe(true);
      expect(result.lockKey).toContain('monthly_2026_09');

      expect(set).toHaveBeenCalledTimes(1);
      const callArgs = (set as any).mock.calls[0];
      const savedData: ReportLock = callArgs[1];

      expect(savedData.isLocked).toBe(true);
      expect(savedData.lockedBy).toBe('BS. Khoi');
      expect(savedData.lockedByRole).toBe('head');
      expect(savedData.department).toBe('Ngoại TH');
      expect(savedData.note).toBe('Chốt số liệu phụ cấp');
      expect(savedData.lockedAt).toBeDefined();
    });

    it('unlockReport updates lock status and timestamps in Firebase RTDB', async () => {
      const { update } = await import('firebase/database');

      const params: UnlockReportParams = {
        lockKey: 'monthly_2026_09',
        unlockedBy: 'BS. Khoi Admin',
        unlockedByUid: 'admin-uid',
      };

      const result = await unlockReport(params);
      expect(result.success).toBe(true);

      expect(update).toHaveBeenCalledTimes(1);
      const callArgs = (update as any).mock.calls[0];
      const updatedFields = callArgs[1];

      expect(updatedFields.isLocked).toBe(false);
      expect(updatedFields.unlockedBy).toBe('BS. Khoi Admin');
      expect(updatedFields.unlockedByUid).toBe('admin-uid');
      expect(updatedFields.unlockedAt).toBeDefined();
    });
  });
});
