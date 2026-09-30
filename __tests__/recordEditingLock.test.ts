import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRecordLockKey,
  checkRecordLockStatus,
  acquireRecordLock,
  renewRecordLock,
  releaseRecordLock,
} from '../services/recordLockService';
import { RECORD_LOCK_TIMEOUT_MS } from '../types/recordLock';
import { get, set, update } from 'firebase/database';

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  set: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  onValue: vi.fn(),
  get: vi.fn(),
  onDisconnect: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

describe('Collaborative Record Lock Service (3.3.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRecordLockKey', () => {
    it('uses record.id when present', () => {
      const key = getRecordLockKey({ id: 'rec_abc_123' });
      expect(key).toBe('rec_abc_123');
    });

    it('generates deterministic key from patientId, date and stt when id missing', () => {
      const key = getRecordLockKey({
        patientId: 'BN12345',
        ngayBD: '2026-09-13T08:30:00Z',
        stt: 1,
      });
      expect(key).toContain('rec_BN12345_');
      expect(key).toContain('_1');
    });
  });

  describe('checkRecordLockStatus', () => {
    it('returns isLockedByOther: false if no lock exists', async () => {
      vi.mocked(get).mockResolvedValueOnce({
        val: () => null,
      } as any);

      const res = await checkRecordLockStatus('rec_1', 'user_a');
      expect(res.isLockedByOther).toBe(false);
    });

    it('returns isLockedByOther: false if same user holds the lock', async () => {
      vi.mocked(get).mockResolvedValueOnce({
        val: () => ({
          userId: 'user_a',
          userName: 'Bs. Tuấn',
          lastHeartbeat: Date.now(),
        }),
      } as any);

      const res = await checkRecordLockStatus('rec_1', 'user_a');
      expect(res.isLockedByOther).toBe(false);
    });

    it('returns isLockedByOther: true if different user holds active lock', async () => {
      vi.mocked(get).mockResolvedValueOnce({
        val: () => ({
          userId: 'user_b',
          userName: 'Bs. Mai',
          userDepartment: 'Khoa Ngoại',
          lastHeartbeat: Date.now(),
        }),
      } as any);

      const res = await checkRecordLockStatus('rec_1', 'user_a');
      expect(res.isLockedByOther).toBe(true);
      expect(res.lock?.userName).toBe('Bs. Mai');
      expect(res.message).toContain('Bs. Mai');
    });

    it('clears expired lock and returns isLockedByOther: false', async () => {
      const expiredTimestamp = Date.now() - RECORD_LOCK_TIMEOUT_MS - 5000;
      vi.mocked(get).mockResolvedValueOnce({
        val: () => ({
          userId: 'user_b',
          userName: 'Bs. Mai',
          lastHeartbeat: expiredTimestamp,
        }),
      } as any);

      const res = await checkRecordLockStatus('rec_1', 'user_a');
      expect(res.isLockedByOther).toBe(false);
      expect(set).toHaveBeenCalledWith(expect.anything(), null);
    });
  });

  describe('acquireRecordLock', () => {
    it('acquires lock when no other user is editing', async () => {
      vi.mocked(get).mockResolvedValueOnce({ val: () => null } as any);

      const res = await acquireRecordLock(
        'rec_1',
        { uid: 'user_a', displayName: 'Bs. Hùng', department: 'Khoa GMHS' },
        { patientName: 'Nguyễn Văn Test' }
      );

      expect(res.success).toBe(true);
      expect(res.isLockedByOther).toBe(false);
      expect(res.lock?.userName).toBe('Bs. Hùng');
      expect(set).toHaveBeenCalled();
    });

    it('fails to acquire lock when another user is actively editing', async () => {
      vi.mocked(get).mockResolvedValueOnce({
        val: () => ({
          userId: 'user_b',
          userName: 'Bs. Lan',
          lastHeartbeat: Date.now(),
        }),
      } as any);

      const res = await acquireRecordLock('rec_1', { uid: 'user_a', displayName: 'Bs. Hùng' });

      expect(res.success).toBe(false);
      expect(res.isLockedByOther).toBe(true);
      expect(res.lock?.userName).toBe('Bs. Lan');
    });
  });

  describe('renewRecordLock & releaseRecordLock', () => {
    it('renews lock heartbeat if caller is the lock owner', async () => {
      vi.mocked(get).mockResolvedValueOnce({
        val: () => ({ userId: 'user_a', lastHeartbeat: 1000 }),
      } as any);

      const success = await renewRecordLock('rec_1', 'user_a');
      expect(success).toBe(true);
      expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        lastHeartbeat: expect.any(Number),
      }));
    });

    it('releases lock cleanly', async () => {
      vi.mocked(get).mockResolvedValueOnce({
        val: () => ({ userId: 'user_a' }),
      } as any);

      await releaseRecordLock('rec_1', 'user_a');
      expect(set).toHaveBeenCalledWith(expect.anything(), null);
    });
  });
});
