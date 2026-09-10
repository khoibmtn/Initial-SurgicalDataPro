/**
 * Test Nhóm B: Staff & Machine Conflict Detection
 * Kiểm thử thuật toán phát hiện trùng nhân viên và trùng máy mổ.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase modules BEFORE importing services that depend on them
vi.mock('../lib/firebase', () => ({
  db: {},
  firestore: {},
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  push: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import { detectStaffConflicts, detectMachineConflicts } from '../services/reprocess';
import { isWeekend, formatDateKey, getDutyDateKey } from '../services/dutyScheduleService';
import { SurgeryRecord } from '../types';
import { AppConfig } from '../contexts/ConfigContext';

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<SurgeryRecord> = {}): SurgeryRecord {
  const defaults: SurgeryRecord = {
    stt: 1,
    patientId: 'BN001',
    patientName: 'Nguyễn Văn A',
    gender: 'Nam',
    yob: '1980',
    bhyt: '',
    ngayCD: '',
    ngayBD: '10/09/2026 08:00',
    ngayKT: '10/09/2026 10:00',
    tenKT: 'Cắt ruột thừa',
    loaiPTTT: 'P2',
    soLuong: 1,
    timeMinutes: 120,
    ptChinh: '',
    ptPhu: '',
    bsGM: '',
    ktvGM: '',
    tdc: '',
    gv: '',
    machine: '',
    machineCode: '',
    machineId: '',
    start: new Date(2026, 8, 10, 8, 0),
    end: new Date(2026, 8, 10, 10, 0),
    key: 'BN001-test-1',
    excelRowIndex: 9,
  };
  return { ...defaults, ...overrides };
}

const minimalConfig: AppConfig = {
  departments: [],
  staffList: [],
  staffLimits: {
    PT_CHINH: 1,
    PT_PHU: 1,
    BS_GM: 2,
    KTV_GM: 1,
    TDC: 1,
    GV: 0,
  },
};

// ─── isWeekend ──────────────────────────────────────────────────────────────

describe('isWeekend', () => {
  it('Thứ 7 (Saturday) → true', () => {
    // 2026-09-12 is Saturday
    expect(isWeekend('2026-09-12')).toBe(true);
  });

  it('Chủ nhật (Sunday) → true', () => {
    // 2026-09-13 is Sunday
    expect(isWeekend('2026-09-13')).toBe(true);
  });

  it('ngày thường (Thứ 4) → false', () => {
    // 2026-09-09 is Wednesday
    expect(isWeekend('2026-09-09')).toBe(false);
  });

  it('chuỗi rỗng → false', () => {
    expect(isWeekend('')).toBe(false);
  });

  it('chuỗi không hợp lệ → false', () => {
    expect(isWeekend('invalid')).toBe(false);
  });
});

// ─── formatDateKey ──────────────────────────────────────────────────────────

describe('formatDateKey', () => {
  it('Date → "YYYY-MM-DD" đúng format', () => {
    const date = new Date(2026, 8, 10); // Sep 10
    expect(formatDateKey(date)).toBe('2026-09-10');
  });

  it('ngày 1 chữ số → padding zero', () => {
    const date = new Date(2026, 0, 5); // Jan 5
    expect(formatDateKey(date)).toBe('2026-01-05');
  });
});

// ─── getDutyDateKey ─────────────────────────────────────────────────────────

describe('getDutyDateKey', () => {
  it('sau 07:00 → ngày hiện tại', () => {
    const date = new Date(2026, 8, 10, 10, 30); // 10:30
    expect(getDutyDateKey(date)).toBe('2026-09-10');
  });

  it('trước 07:00 → ngày hôm trước', () => {
    const date = new Date(2026, 8, 10, 3, 0); // 03:00
    expect(getDutyDateKey(date)).toBe('2026-09-09');
  });

  it('đúng 07:00 → ngày hiện tại', () => {
    const date = new Date(2026, 8, 10, 7, 0);
    expect(getDutyDateKey(date)).toBe('2026-09-10');
  });

  it('custom morningStart "06:30" → trước 06:30 thuộc ngày hôm trước', () => {
    const date = new Date(2026, 8, 10, 6, 0);
    expect(getDutyDateKey(date, '06:30')).toBe('2026-09-09');
  });
});

// ─── detectStaffConflicts ───────────────────────────────────────────────────

describe('detectStaffConflicts', () => {
  it('PTV chính trùng 2 ca cùng lúc → phát hiện conflict', () => {
    const rec1 = makeRecord({
      key: 'ca1',
      patientId: 'BN001',
      ptChinh: 'BS Nguyễn A',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      patientName: 'Trần Văn B',
      ptChinh: 'BS Nguyễn A',
      start: new Date(2026, 8, 10, 9, 0),
      end: new Date(2026, 8, 10, 11, 0),
    });
    const conflicts = detectStaffConflicts([rec1, rec2], minimalConfig);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts.some(c => c.staffName === 'BS Nguyễn A')).toBe(true);
  });

  it('2 ca khác giờ (không chồng chéo) → KHÔNG conflict', () => {
    const rec1 = makeRecord({
      key: 'ca1',
      ptChinh: 'BS Nguyễn A',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      ptChinh: 'BS Nguyễn A',
      start: new Date(2026, 8, 10, 11, 0),
      end: new Date(2026, 8, 10, 13, 0),
    });
    const conflicts = detectStaffConflicts([rec1, rec2], minimalConfig);
    expect(conflicts).toHaveLength(0);
  });

  it('boundary: ca A kết thúc đúng giờ bắt đầu ca B → tùy theo isOverlap (<=)', () => {
    const rec1 = makeRecord({
      key: 'ca1',
      ptChinh: 'BS Nguyễn A',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      ptChinh: 'BS Nguyễn A',
      start: new Date(2026, 8, 10, 10, 0),
      end: new Date(2026, 8, 10, 12, 0),
    });
    const conflicts = detectStaffConflicts([rec1, rec2], minimalConfig);
    // isOverlap uses <= so end=start DOES overlap → should detect conflict
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('cùng surgical session (cùng BN, cùng giờ) → KHÔNG conflict', () => {
    // Multi-procedure: 2 kỹ thuật cùng BN, cùng thời gian = 1 ca mổ
    const rec1 = makeRecord({
      key: 'ca1-kt1',
      patientId: 'BN001',
      ptChinh: 'BS Nguyễn A',
      tenKT: 'Cắt ruột thừa',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca1-kt2',
      stt: 2,
      patientId: 'BN001',
      patientName: 'Nguyễn Văn A',
      ptChinh: 'BS Nguyễn A',
      tenKT: 'Dẫn lưu ổ bụng',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const conflicts = detectStaffConflicts([rec1, rec2], minimalConfig);
    expect(conflicts).toHaveLength(0);
  });

  it('BS GMHS limit=2: trùng 2 ca → KHÔNG conflict (trong ngưỡng kiêm nhiệm)', () => {
    const config: AppConfig = {
      ...minimalConfig,
      staffLimits: {
        PT_CHINH: 1,
        PT_PHU: 1,
        BS_GM: 2,
        KTV_GM: 1,
        TDC: 1,
        GV: 0,
      },
    };
    const rec1 = makeRecord({
      key: 'ca1',
      patientId: 'BN001',
      bsGM: 'BS Lê C',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      bsGM: 'BS Lê C',
      start: new Date(2026, 8, 10, 9, 0),
      end: new Date(2026, 8, 10, 11, 0),
    });
    const conflicts = detectStaffConflicts([rec1, rec2], config);
    // BS_GM limit=2, chỉ có 2 ca → KHÔNG conflict
    expect(conflicts).toHaveLength(0);
  });

  it('BS GMHS limit=2: trùng 3 ca cùng lúc → phát hiện conflict', () => {
    const config: AppConfig = {
      ...minimalConfig,
      staffLimits: {
        PT_CHINH: 1,
        PT_PHU: 1,
        BS_GM: 2,
        KTV_GM: 1,
        TDC: 1,
        GV: 0,
      },
    };
    const rec1 = makeRecord({
      key: 'ca1',
      patientId: 'BN001',
      bsGM: 'BS Lê C',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 11, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      bsGM: 'BS Lê C',
      start: new Date(2026, 8, 10, 9, 0),
      end: new Date(2026, 8, 10, 11, 0),
    });
    const rec3 = makeRecord({
      key: 'ca3',
      stt: 3,
      patientId: 'BN003',
      bsGM: 'BS Lê C',
      start: new Date(2026, 8, 10, 9, 30),
      end: new Date(2026, 8, 10, 11, 30),
    });
    const conflicts = detectStaffConflicts([rec1, rec2, rec3], config);
    // 3 ca cùng lúc, limit=2 → vượt → conflict
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── detectMachineConflicts ─────────────────────────────────────────────────

describe('detectMachineConflicts', () => {
  it('2 ca cùng máy mổ trùng giờ → phát hiện conflict', () => {
    const rec1 = makeRecord({
      key: 'ca1',
      patientId: 'BN001',
      machineCode: 'CARM-01',
      machine: 'C-Arm Phòng 1',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      machineCode: 'CARM-01',
      machine: 'C-Arm Phòng 1',
      start: new Date(2026, 8, 10, 9, 0),
      end: new Date(2026, 8, 10, 11, 0),
    });
    const conflicts = detectMachineConflicts([rec1, rec2]);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('2 ca cùng máy KHÔNG trùng giờ → KHÔNG conflict', () => {
    const rec1 = makeRecord({
      key: 'ca1',
      patientId: 'BN001',
      machineCode: 'CARM-01',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      machineCode: 'CARM-01',
      start: new Date(2026, 8, 10, 11, 0),
      end: new Date(2026, 8, 10, 13, 0),
    });
    const conflicts = detectMachineConflicts([rec1, rec2]);
    expect(conflicts).toHaveLength(0);
  });

  it('2 ca khác máy trùng giờ → KHÔNG conflict', () => {
    const rec1 = makeRecord({
      key: 'ca1',
      patientId: 'BN001',
      machineCode: 'CARM-01',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const rec2 = makeRecord({
      key: 'ca2',
      stt: 2,
      patientId: 'BN002',
      machineCode: 'CARM-02',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
    });
    const conflicts = detectMachineConflicts([rec1, rec2]);
    expect(conflicts).toHaveLength(0);
  });
});
