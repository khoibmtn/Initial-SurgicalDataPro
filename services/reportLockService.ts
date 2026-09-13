// ─── Report Lock Service ──────────────────────────────────────────────────────
// Quản lý khóa/mở khóa kỳ báo cáo bằng Firebase Realtime Database
// Hỗ trợ đồng bộ tức thì trên toàn bộ các máy trạm trong bệnh viện

import { ref, set, update, onValue, get } from 'firebase/database';
import { db } from '../lib/firebase';
import type { ReportLock, LockReportParams, UnlockReportParams } from '../types/reportLock';

const LOCKS_PATH = 'report_locks';

/**
 * Tạo khóa định danh chuẩn hóa cho kỳ báo cáo
 * @param periodType 'monthly' | 'daily'
 * @param periodKey 'YYYY-MM' cho tháng, 'YYYY-MM-DD' cho ngày
 * @param department Tùy chọn nếu khóa riêng cho từng khoa
 */
export function generateLockKey(
  periodType: 'monthly' | 'daily',
  periodKey: string,
  department?: string
): string {
  const cleanPeriod = periodKey.replace(/[\/-]/g, '_').replace(/[^0-9_]/g, '');
  const baseKey = `${periodType}_${cleanPeriod}`;
  if (department && department.trim() && department !== 'ALL') {
    const safeDept = encodeURIComponent(department.trim()).replace(/\./g, '_').replace(/%/g, '');
    return `${baseKey}__${safeDept}`;
  }
  return baseKey;
}

/**
 * Lắng nghe trạng thái khóa của một kỳ báo cáo cụ thể (realtime)
 */
export function subscribeToReportLock(
  lockKey: string,
  callback: (lock: ReportLock | null) => void
): () => void {
  if (!lockKey) {
    callback(null);
    return () => {};
  }

  const lockRef = ref(db, `${LOCKS_PATH}/${lockKey}`);
  const unsub = onValue(
    lockRef,
    (snapshot) => {
      const data = snapshot.val();
      callback(data && typeof data === 'object' ? (data as ReportLock) : null);
    },
    (err) => {
      console.error(`[reportLockService] Error subscribing to lock ${lockKey}:`, err);
      callback(null);
    }
  );

  return () => unsub();
}

/**
 * Lắng nghe tất cả các khóa báo cáo trong hệ thống (realtime)
 */
export function subscribeAllReportLocks(
  callback: (locks: Record<string, ReportLock>) => void
): () => void {
  const locksRef = ref(db, LOCKS_PATH);
  const unsub = onValue(
    locksRef,
    (snapshot) => {
      const data = snapshot.val();
      callback(data && typeof data === 'object' ? (data as Record<string, ReportLock>) : {});
    },
    (err) => {
      console.error('[reportLockService] Error subscribing to all locks:', err);
      callback({});
    }
  );

  return () => unsub();
}

/**
 * Khóa sổ kỳ báo cáo (Chỉ dành cho Trưởng khoa hoặc Admin)
 */
export async function lockReport(
  params: LockReportParams
): Promise<{ success: boolean; lockKey: string; error?: string }> {
  try {
    const lockKey = generateLockKey(params.periodType, params.periodKey, params.department);
    const lockData: ReportLock = {
      id: lockKey,
      periodType: params.periodType,
      periodKey: params.periodKey,
      isLocked: true,
      lockedBy: params.lockedBy,
      lockedByUid: params.lockedByUid,
      lockedByRole: params.lockedByRole,
      department: params.department || 'ALL',
      lockedAt: new Date().toISOString(),
      note: params.note?.trim() || '',
    };

    const lockRef = ref(db, `${LOCKS_PATH}/${lockKey}`);
    await set(lockRef, lockData);

    return { success: true, lockKey };
  } catch (err: any) {
    console.error('[reportLockService] lockReport error:', err);
    return { success: false, lockKey: '', error: err.message };
  }
}

/**
 * Mở khóa kỳ báo cáo (Chỉ dành cho Trưởng khoa hoặc Admin)
 */
export async function unlockReport(
  params: UnlockReportParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const lockRef = ref(db, `${LOCKS_PATH}/${params.lockKey}`);
    await update(lockRef, {
      isLocked: false,
      unlockedAt: new Date().toISOString(),
      unlockedBy: params.unlockedBy,
      unlockedByUid: params.unlockedByUid,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[reportLockService] unlockReport error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Kiểm tra xem kỳ báo cáo hiện tại có đang bị khóa hay không
 */
export function isPeriodLocked(
  lock: ReportLock | null | undefined,
  userRole?: string,
  userDept?: string
): boolean {
  if (!lock || !lock.isLocked) return false;

  // Nếu khóa chỉ áp dụng cho một khoa cụ thể
  if (lock.department && lock.department !== 'ALL') {
    if (userDept && userDept !== lock.department) {
      return false;
    }
  }

  return true;
}
