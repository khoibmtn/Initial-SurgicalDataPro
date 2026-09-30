// ─── Collaborative Record Lock Service ────────────────────────────────────────
// Quản lý khóa sửa ca mổ theo thời gian thực (Mục 3.3.2)
// Ngăn chặn xung đột và ghi đè dữ liệu khi nhiều bác sĩ/nhân viên thao tác cùng lúc

import { ref, set, get, update, onValue, onDisconnect } from 'firebase/database';
import { db } from '../lib/firebase';
import {
  RecordEditingLock,
  LockStatusResult,
  RECORD_LOCK_TIMEOUT_MS,
} from '../types/recordLock';

const RECORD_LOCKS_PATH = 'record_editing_locks';

/**
 * Sinh khóa định danh duy nhất cho một bản ghi phẫu thuật
 */
export function getRecordLockKey(record: {
  id?: string;
  patientId?: string;
  ngayBD?: string;
  stt?: any;
}): string {
  if (record.id && String(record.id).trim()) {
    return String(record.id).trim().replace(/[\/\.#\$\[\]]/g, '_');
  }
  const pid = (record.patientId || 'anon').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const datePart = (record.ngayBD || '').replace(/[^0-9]/g, '').slice(0, 14);
  const sttPart = String(record.stt || 0);
  return `rec_${pid}_${datePart}_${sttPart}`;
}

/**
 * Kiểm tra xem một ca mổ có đang bị người khác khóa hay không
 */
export async function checkRecordLockStatus(
  recordKey: string,
  currentUserId?: string
): Promise<LockStatusResult> {
  if (!recordKey) return { isLockedByOther: false };

  try {
    const lockRef = ref(db, `${RECORD_LOCKS_PATH}/${recordKey}`);
    const snapshot = await get(lockRef);
    const existing = snapshot.val() as RecordEditingLock | null;

    if (!existing) {
      return { isLockedByOther: false };
    }

    const isExpired = Date.now() - (existing.lastHeartbeat || 0) > RECORD_LOCK_TIMEOUT_MS;
    if (isExpired) {
      // Lock đã hết hạn → tự động dọn dẹp
      await set(lockRef, null);
      return { isLockedByOther: false };
    }

    if (currentUserId && existing.userId === currentUserId) {
      // Chính người dùng hiện tại đang giữ lock
      return { isLockedByOther: false, lock: existing };
    }

    return {
      isLockedByOther: true,
      lock: existing,
      message: `Đồng nghiệp ${existing.userName || 'khác'}${existing.userDepartment ? ` (${existing.userDepartment})` : ''} đang chỉnh sửa ca mổ này.`,
    };
  } catch (err) {
    console.warn('[recordLockService] checkRecordLockStatus error:', err);
    return { isLockedByOther: false };
  }
}

/**
 * Cố gắng cấp quyền khóa (Acquire Lock) khi bắt đầu mở modal sửa ca mổ
 */
export async function acquireRecordLock(
  recordKey: string,
  user: {
    uid: string;
    displayName?: string;
    nickname?: string;
    role?: string;
    department?: string;
  },
  recordInfo?: {
    patientId?: string;
    patientName?: string;
    tenKT?: string;
  }
): Promise<{ success: boolean; lock?: RecordEditingLock; isLockedByOther: boolean }> {
  if (!recordKey || !user.uid) {
    return { success: false, isLockedByOther: false };
  }

  const lockRef = ref(db, `${RECORD_LOCKS_PATH}/${recordKey}`);

  try {
    const status = await checkRecordLockStatus(recordKey, user.uid);
    if (status.isLockedByOther && status.lock) {
      return { success: false, lock: status.lock, isLockedByOther: true };
    }

    const now = Date.now();
    const newLock: RecordEditingLock = {
      recordId: recordKey,
      patientId: recordInfo?.patientId || '',
      patientName: recordInfo?.patientName || '',
      tenKT: recordInfo?.tenKT || '',
      userId: user.uid,
      userName: user.displayName || user.nickname || 'Bác sĩ',
      userRole: user.role || 'staff',
      userDepartment: user.department || '',
      startedAt: status.lock?.startedAt || now,
      lastHeartbeat: now,
    };

    await set(lockRef, newLock);

    // Tự động xóa lock khi mất kết nối mạng hoặc tắt trình duyệt
    try {
      onDisconnect(lockRef).remove();
    } catch {}

    return { success: true, lock: newLock, isLockedByOther: false };
  } catch (err) {
    console.warn('[recordLockService] acquireRecordLock failed:', err);
    // Nếu lỗi kết nối Firebase, vẫn cho phép mở để không chặn người dùng cục bộ
    return { success: true, isLockedByOther: false };
  }
}

/**
 * Gia hạn thời gian sống của lock (Heartbeat)
 */
export async function renewRecordLock(recordKey: string, userId: string): Promise<boolean> {
  if (!recordKey || !userId) return false;

  const lockRef = ref(db, `${RECORD_LOCKS_PATH}/${recordKey}`);
  try {
    const snapshot = await get(lockRef);
    const existing = snapshot.val() as RecordEditingLock | null;
    if (existing && existing.userId === userId) {
      await update(lockRef, { lastHeartbeat: Date.now() });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Giải phóng lock khi đóng modal hoặc lưu xong
 */
export async function releaseRecordLock(recordKey: string, userId?: string): Promise<void> {
  if (!recordKey) return;

  const lockRef = ref(db, `${RECORD_LOCKS_PATH}/${recordKey}`);
  try {
    if (userId) {
      const snapshot = await get(lockRef);
      const existing = snapshot.val() as RecordEditingLock | null;
      if (existing && existing.userId !== userId) {
        // Không xóa lock của người khác
        return;
      }
    }
    await set(lockRef, null);
  } catch (err) {
    console.warn('[recordLockService] releaseRecordLock error:', err);
  }
}

/**
 * Lắng nghe trạng thái lock của 1 bản ghi cụ thể (realtime)
 */
export function subscribeToRecordLock(
  recordKey: string,
  callback: (lock: RecordEditingLock | null) => void
): () => void {
  if (!recordKey) {
    callback(null);
    return () => {};
  }

  const lockRef = ref(db, `${RECORD_LOCKS_PATH}/${recordKey}`);
  const unsub = onValue(
    lockRef,
    (snapshot) => {
      const data = snapshot.val() as RecordEditingLock | null;
      if (!data) {
        callback(null);
        return;
      }
      const isExpired = Date.now() - (data.lastHeartbeat || 0) > RECORD_LOCK_TIMEOUT_MS;
      if (isExpired) {
        callback(null);
      } else {
        callback(data);
      }
    },
    (err) => {
      console.warn(`[recordLockService] subscribe error on ${recordKey}:`, err);
      callback(null);
    }
  );

  return () => unsub();
}

/**
 * Lắng nghe tất cả các ca mổ đang bị khóa chỉnh sửa (phục vụ hiển thị badge trên bảng ca mổ)
 */
export function subscribeToAllActiveRecordLocks(
  callback: (locksMap: Record<string, RecordEditingLock>) => void
): () => void {
  const allLocksRef = ref(db, RECORD_LOCKS_PATH);

  const unsub = onValue(
    allLocksRef,
    (snapshot) => {
      const data = snapshot.val() as Record<string, RecordEditingLock> | null;
      if (!data || typeof data !== 'object') {
        callback({});
        return;
      }

      const now = Date.now();
      const validMap: Record<string, RecordEditingLock> = {};

      for (const [key, lock] of Object.entries(data)) {
        if (lock && typeof lock === 'object' && lock.lastHeartbeat) {
          if (now - lock.lastHeartbeat <= RECORD_LOCK_TIMEOUT_MS) {
            validMap[key] = lock;
          }
        }
      }

      callback(validMap);
    },
    (err) => {
      console.warn('[recordLockService] subscribeToAllActiveRecordLocks error:', err);
      callback({});
    }
  );

  return () => unsub();
}
