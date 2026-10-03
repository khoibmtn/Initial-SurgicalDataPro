import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners: Record<string, (snap: any) => void> = {};
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, cb: (snap: any) => void) => {
    listeners[path] = cb;
    return () => delete listeners[path];
  },
  get: vi.fn(), set: vi.fn(), update: vi.fn(), remove: vi.fn(), push: vi.fn(),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));

const snap = (val: unknown) => ({ exists: () => val != null, val: () => val });

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe('schedule per-date cache', () => {
  beforeEach(() => localStorage.clear());

  it('returns undefined before load, then cached sorted entries after a snapshot', async () => {
    const { getCachedSchedule, subscribeScheduleForDate } = await import('../services/scheduleService');
    expect(getCachedSchedule('2026-10-04')).toBeUndefined();
    const cb = vi.fn();
    subscribeScheduleForDate('2026-10-04', cb);
    const path = Object.keys(listeners).find((p) => p.includes('2026-10-04'))!;
    listeners[path](snap({ b: { id: 'b', startTime: '10:00' }, a: { id: 'a', startTime: '08:00' } }));
    expect(cb).toHaveBeenCalledWith([{ id: 'a', startTime: '08:00' }, { id: 'b', startTime: '10:00' }]);
    expect(getCachedSchedule('2026-10-04')?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(localStorage.getItem('schedule_cache_v1:2026-10-04')).toContain('"a"');
  });

  it('caches empty days as [] (loaded, no surgeries)', async () => {
    const { getCachedSchedule, subscribeScheduleForDate } = await import('../services/scheduleService');
    subscribeScheduleForDate('2026-10-05', () => {});
    const path = Object.keys(listeners).find((p) => p.includes('2026-10-05'))!;
    listeners[path](snap(null));
    expect(getCachedSchedule('2026-10-05')).toEqual([]);
  });
});

describe('stripUndefined (RTDB rejects undefined values)', () => {
  it('removes undefined keys but keeps falsy values', async () => {
    const { stripUndefined } = await import('../services/scheduleService');
    expect(stripUndefined({ a: 1, note: undefined, b: '', c: 0 })).toEqual({ a: 1, b: '', c: 0 });
  });
});
