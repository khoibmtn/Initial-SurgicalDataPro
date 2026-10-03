/**
 * Surgery Schedule Service
 * Firebase RTDB CRUD operations for surgery schedule entries.
 * Path: surgery_schedules/{date}/{id}
 */
import { ref, push, set, update, remove, onValue, get, off } from 'firebase/database';
import { db } from '../lib/firebase';
import type { ScheduledSurgery, ScheduledSurgeryInput } from '../types/schedule';

const SCHEDULE_ROOT = 'surgery_schedules';

/** Tạo RTDB path cho 1 ngày cụ thể */
function datePath(date: string) {
  return `${SCHEDULE_ROOT}/${date}`;
}

/** Thêm ca mổ mới vào lịch */
export async function addScheduledSurgery(
  input: ScheduledSurgeryInput,
  userId: string,
  userName: string,
): Promise<string> {
  const dateRef = ref(db, datePath(input.date));
  const newRef = push(dateRef);
  const now = Date.now();

  const entry: ScheduledSurgery = {
    ...input,
    id: newRef.key!,
    createdBy: userId,
    createdByName: userName,
    createdAt: now,
    updatedAt: now,
  };

  await set(newRef, entry);
  return newRef.key!;
}

/** Cập nhật ca mổ đã tồn tại */
export async function updateScheduledSurgery(
  date: string,
  id: string,
  updates: Partial<ScheduledSurgeryInput>,
): Promise<void> {
  const entryRef = ref(db, `${datePath(date)}/${id}`);
  await update(entryRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/** Xóa ca mổ khỏi lịch */
export async function deleteScheduledSurgery(
  date: string,
  id: string,
): Promise<void> {
  const entryRef = ref(db, `${datePath(date)}/${id}`);
  await remove(entryRef);
}

/** Lấy toàn bộ ca mổ của 1 ngày (1 lần) */
export async function getScheduleForDate(date: string): Promise<ScheduledSurgery[]> {
  const dateRef = ref(db, datePath(date));
  const snapshot = await get(dateRef);
  if (!snapshot.exists()) return [];

  const data = snapshot.val() as Record<string, ScheduledSurgery>;
  return Object.values(data);
}

/**
 * Subscribe realtime ca mổ theo ngày.
 * Trả về hàm unsubscribe.
 */
export function subscribeScheduleForDate(
  date: string,
  callback: (entries: ScheduledSurgery[]) => void,
): () => void {
  const dateRef = ref(db, datePath(date));

  const handler = onValue(dateRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const data = snapshot.val() as Record<string, ScheduledSurgery>;
    const entries = Object.values(data).sort((a, b) => {
      // Sort by startTime
      return a.startTime.localeCompare(b.startTime);
    });
    callback(entries);
  });

  return () => off(dateRef, 'value', handler);
}

/**
 * Subscribe realtime ca mổ cho cả tuần (7 ngày).
 * Trả về hàm unsubscribe.
 */
export function subscribeScheduleForWeek(
  dates: string[],
  callback: (entriesByDate: Record<string, ScheduledSurgery[]>) => void,
): () => void {
  const result: Record<string, ScheduledSurgery[]> = {};
  const unsubs: (() => void)[] = [];

  dates.forEach((date) => {
    result[date] = [];
    const unsub = subscribeScheduleForDate(date, (entries) => {
      result[date] = entries;
      // Trigger callback with fresh copy
      callback({ ...result });
    });
    unsubs.push(unsub);
  });

  return () => unsubs.forEach((u) => u());
}
