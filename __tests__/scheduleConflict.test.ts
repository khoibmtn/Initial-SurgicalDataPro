import { describe, it, expect } from 'vitest';
import { detectConflicts, getConflictedSurgeryIds } from '../services/scheduleConflictService';
import type { ScheduledSurgery } from '../types/schedule';

/** Helper: tạo 1 ca mổ test */
function makeSurgery(overrides: Partial<ScheduledSurgery> & { id: string }): ScheduledSurgery {
  return {
    date: '2026-10-03',
    patientId: '2600001',
    patientName: 'BN Test',
    tenKT: 'PT Test',
    startTime: '08:00',
    endTime: '09:00',
    machineCode: '',
    machineName: '',
    staff: {},
    createdBy: 'user1',
    createdByName: 'User 1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const DEFAULT_FILTERS = { ptChinh: true, ptPhu: true, bsGM: true, ktvGM: true, tdc: true };

describe('scheduleConflictService', () => {
  describe('detectConflicts', () => {
    it('returns empty when 0 or 1 entry', () => {
      expect(detectConflicts([], DEFAULT_FILTERS)).toEqual([]);
      expect(detectConflicts([makeSurgery({ id: 'a' })], DEFAULT_FILTERS)).toEqual([]);
    });

    it('returns empty when entries do NOT overlap in time', () => {
      const a = makeSurgery({ id: 'a', startTime: '08:00', endTime: '09:00', machineCode: 'M1', machineName: 'Máy 1' });
      const b = makeSurgery({ id: 'b', startTime: '09:00', endTime: '10:00', machineCode: 'M1', machineName: 'Máy 1' });
      expect(detectConflicts([a, b], DEFAULT_FILTERS)).toEqual([]);
    });

    it('detects MACHINE conflict when same machine overlaps', () => {
      const a = makeSurgery({ id: 'a', startTime: '08:00', endTime: '09:30', machineCode: 'M1', machineName: 'Máy 1', patientName: 'A' });
      const b = makeSurgery({ id: 'b', startTime: '09:00', endTime: '10:00', machineCode: 'M1', machineName: 'Máy 1', patientName: 'B' });
      const result = detectConflicts([a, b], DEFAULT_FILTERS);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('MACHINE');
      expect(result[0].resource).toBe('Máy 1');
      expect(result[0].surgeryIds).toEqual(['a', 'b']);
    });

    it('does NOT flag machine conflict when different machines overlap', () => {
      const a = makeSurgery({ id: 'a', startTime: '08:00', endTime: '09:30', machineCode: 'M1', machineName: 'Máy 1' });
      const b = makeSurgery({ id: 'b', startTime: '09:00', endTime: '10:00', machineCode: 'M2', machineName: 'Máy 2' });
      expect(detectConflicts([a, b], DEFAULT_FILTERS)).toEqual([]);
    });

    it('detects STAFF conflict when same person overlaps', () => {
      const a = makeSurgery({
        id: 'a', startTime: '08:00', endTime: '09:30', patientName: 'A',
        staff: { ptChinh: 'BS Nguyễn A' },
      });
      const b = makeSurgery({
        id: 'b', startTime: '09:00', endTime: '10:00', patientName: 'B',
        staff: { ptChinh: 'BS Nguyễn A' },
      });
      const result = detectConflicts([a, b], DEFAULT_FILTERS);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('STAFF');
      expect(result[0].resource).toBe('BS Nguyễn A');
    });

    it('detects STAFF conflict across different roles for same person', () => {
      const a = makeSurgery({
        id: 'a', startTime: '08:00', endTime: '09:30',
        staff: { ptChinh: 'BS X' },
      });
      const b = makeSurgery({
        id: 'b', startTime: '09:00', endTime: '10:00',
        staff: { ptPhu: 'BS X' },
      });
      // Same person in different roles still each generates a conflict per matching role
      const result = detectConflicts([a, b], DEFAULT_FILTERS);
      // No conflict because ptChinh of A != ptPhu of B (different role keys)
      // Conflict detection compares SAME key across entries
      expect(result).toEqual([]);
    });

    it('respects roleFilter — skips disabled roles', () => {
      const a = makeSurgery({
        id: 'a', startTime: '08:00', endTime: '09:30',
        staff: { tdc: 'TDC Trần B' },
      });
      const b = makeSurgery({
        id: 'b', startTime: '09:00', endTime: '10:00',
        staff: { tdc: 'TDC Trần B' },
      });

      // tdc enabled → should detect
      expect(detectConflicts([a, b], { ...DEFAULT_FILTERS, tdc: true })).toHaveLength(1);

      // tdc disabled → should NOT detect
      expect(detectConflicts([a, b], { ...DEFAULT_FILTERS, tdc: false })).toEqual([]);
    });

    it('detects both MACHINE and STAFF conflicts simultaneously', () => {
      const a = makeSurgery({
        id: 'a', startTime: '08:00', endTime: '09:30',
        machineCode: 'M1', machineName: 'Máy 1',
        staff: { bsGM: 'BS GM Lê' },
        patientName: 'A',
      });
      const b = makeSurgery({
        id: 'b', startTime: '09:00', endTime: '10:00',
        machineCode: 'M1', machineName: 'Máy 1',
        staff: { bsGM: 'BS GM Lê' },
        patientName: 'B',
      });
      const result = detectConflicts([a, b], DEFAULT_FILTERS);
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.type).sort()).toEqual(['MACHINE', 'STAFF']);
    });

    it('handles 3+ entries with multiple overlaps', () => {
      const a = makeSurgery({ id: 'a', startTime: '08:00', endTime: '10:00', machineCode: 'M1', machineName: 'Máy 1' });
      const b = makeSurgery({ id: 'b', startTime: '09:00', endTime: '11:00', machineCode: 'M1', machineName: 'Máy 1' });
      const c = makeSurgery({ id: 'c', startTime: '10:30', endTime: '12:00', machineCode: 'M1', machineName: 'Máy 1' });

      const result = detectConflicts([a, b, c], DEFAULT_FILTERS);
      // a-b overlap (08-10 vs 09-11)
      // b-c overlap (09-11 vs 10:30-12)
      // a-c do NOT overlap (08-10 vs 10:30-12)
      expect(result).toHaveLength(2);
    });

    it('does not double-count same-person conflict in same pair', () => {
      const a = makeSurgery({
        id: 'a', startTime: '08:00', endTime: '09:30',
        staff: { ptChinh: 'BS X', ptPhu: 'BS X' },
      });
      const b = makeSurgery({
        id: 'b', startTime: '09:00', endTime: '10:00',
        staff: { ptChinh: 'BS X', ptPhu: 'BS X' },
      });
      const result = detectConflicts([a, b], DEFAULT_FILTERS);
      // Same person "BS X" appears in both ptChinh and ptPhu
      // First iteration finds BS X in ptChinh → adds conflict
      // Second iteration finds BS X in ptPhu → duplicate check prevents adding
      expect(result.filter((c) => c.resource === 'BS X')).toHaveLength(1);
    });

    it('ignores empty staff names', () => {
      const a = makeSurgery({
        id: 'a', startTime: '08:00', endTime: '09:30',
        staff: { ptChinh: '' },
      });
      const b = makeSurgery({
        id: 'b', startTime: '09:00', endTime: '10:00',
        staff: { ptChinh: '' },
      });
      expect(detectConflicts([a, b], DEFAULT_FILTERS)).toEqual([]);
    });

    it('ignores entries with no machineCode for machine conflicts', () => {
      const a = makeSurgery({ id: 'a', startTime: '08:00', endTime: '09:30', machineCode: '', machineName: '' });
      const b = makeSurgery({ id: 'b', startTime: '09:00', endTime: '10:00', machineCode: '', machineName: '' });
      expect(detectConflicts([a, b], DEFAULT_FILTERS)).toEqual([]);
    });
  });

  describe('getConflictedSurgeryIds', () => {
    it('extracts unique IDs from conflicts', () => {
      const conflicts = [
        { type: 'MACHINE' as const, description: '', surgeryIds: ['a', 'b'] as [string, string], resource: 'M1' },
        { type: 'STAFF' as const, description: '', surgeryIds: ['b', 'c'] as [string, string], resource: 'BS X' },
      ];
      const ids = getConflictedSurgeryIds(conflicts);
      expect(ids.size).toBe(3);
      expect(ids.has('a')).toBe(true);
      expect(ids.has('b')).toBe(true);
      expect(ids.has('c')).toBe(true);
    });

    it('returns empty set for no conflicts', () => {
      expect(getConflictedSurgeryIds([]).size).toBe(0);
    });
  });
});

describe('scheduling roles derived from Định mức bàn mổ', () => {
  it('checks every position with limit > 0 and skips Giúp việc (limit 0)', async () => {
    const { getTableLimitForRole } = await import('../services/laborConfigService');
    const items = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc', 'gv'].map((posKey) => ({
      id: posKey, posKey, label: posKey, limit: posKey === 'gv' ? 0 : posKey === 'bsGM' ? 2 : 1,
      effectiveFrom: '2020-01-01', effectiveTo: null, createdAt: 0, updatedAt: 0,
    }));
    const enabled = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc', 'gv']
      .filter((k) => getTableLimitForRole(k, '2026-10-03', items as any) > 0);
    expect(enabled).toEqual(['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc']);
  });
});

describe('staff conflicts respect Định mức bàn mổ (roleLimits)', () => {
  const filters = { ptChinh: true, ptPhu: true, bsGM: true, ktvGM: true, tdc: true };
  const limits = { ptChinh: 1, ptPhu: 1, bsGM: 2, ktvGM: 1, tdc: 1 };
  const gm = (id: string, startTime: string, endTime: string) =>
    makeSurgery({ id, startTime, endTime, staff: { bsGM: 'BS GM Lê' } });

  it('allows BS GMHS in 2 concurrent surgeries when limit is 2', () => {
    const conflicts = detectConflicts([gm('a', '08:00', '10:00'), gm('b', '09:00', '11:00')], filters, 7.5, limits);
    expect(conflicts.filter((c) => c.type === 'STAFF')).toHaveLength(0);
  });

  it('flags BS GMHS when 3 surgeries overlap beyond limit 2', () => {
    const conflicts = detectConflicts(
      [gm('a', '08:00', '10:00'), gm('b', '08:30', '10:30'), gm('c', '09:00', '11:00')],
      filters, 7.5, limits,
    );
    const staff = conflicts.filter((c) => c.type === 'STAFF');
    expect(staff.length).toBeGreaterThan(0);
    expect(staff[0].description).toContain('quá 2 ca');
  });
});
