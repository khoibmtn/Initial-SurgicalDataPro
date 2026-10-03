/**
 * Surgery Schedule Service
 * Firebase RTDB CRUD operations for surgery schedule entries.
 * Path: surgery_schedules/{date}/{id}
 */
import { ref, push, set, update, remove, onValue, get } from 'firebase/database';
import { db } from '../lib/firebase';
import type { ScheduledSurgery, ScheduledSurgeryInput } from '../types/schedule';

const SCHEDULE_ROOT = 'surgery_schedules';

/** Tạo RTDB path cho 1 ngày cụ thể */
function datePath(date: string) {
  return `${SCHEDULE_ROOT}/${date}`;
}

/** RTDB từ chối ghi giá trị undefined (vd note trống) → loại bỏ các key undefined. */
export function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
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

  await set(newRef, stripUndefined(entry));
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
    ...stripUndefined(updates),
    // note bị xoá trắng → null để RTDB xoá field cũ
    ...('note' in updates && updates.note === undefined ? { note: null } : {}),
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

// ── Per-date cache (stale-while-revalidate) ──
const CACHE_PREFIX = 'schedule_cache_v1:';
const CACHE_INDEX_KEY = 'schedule_cache_v1__index';
const CACHE_MAX_DATES = 21;
const memoryCache = new Map<string, ScheduledSurgery[]>();

/** Lấy lịch đã cache của 1 ngày (bộ nhớ → localStorage). undefined = chưa từng tải. */
export function getCachedSchedule(date: string): ScheduledSurgery[] | undefined {
  const mem = memoryCache.get(date);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + date);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ScheduledSurgery[];
    if (!Array.isArray(parsed)) return undefined;
    memoryCache.set(date, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCache(date: string, entries: ScheduledSurgery[]): void {
  memoryCache.set(date, entries);
  try {
    localStorage.setItem(CACHE_PREFIX + date, JSON.stringify(entries));
    const index: string[] = JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) || '[]');
    const next = [date, ...index.filter((d) => d !== date)];
    next.slice(CACHE_MAX_DATES).forEach((d) => localStorage.removeItem(CACHE_PREFIX + d));
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(next.slice(0, CACHE_MAX_DATES)));
  } catch {
    // quota / private mode — memory cache vẫn hoạt động
  }
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

  const unsub = onValue(dateRef, (snapshot) => {
    const entries = snapshot.exists()
      ? Object.values(snapshot.val() as Record<string, ScheduledSurgery>).sort((a, b) =>
          a.startTime.localeCompare(b.startTime),
        )
      : [];
    writeCache(date, entries);
    callback(entries);
  });

  return unsub;
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
    result[date] = getCachedSchedule(date) ?? [];
    const unsub = subscribeScheduleForDate(date, (entries) => {
      result[date] = entries;
      // Trigger callback with fresh copy
      callback({ ...result });
    });
    unsubs.push(unsub);
  });

  return () => unsubs.forEach((u) => u());
}
