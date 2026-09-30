/**
 * Test Nhóm D: Financial Calculation (Phụ cấp PTTT)
 * Kiểm thử thuật toán tính phụ cấp phẫu thuật thủ thuật theo QĐ73/2011/QĐ-TTg.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase modules
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

import {
  getAllowanceForRecord,
  normalizeDate,
  DEFAULT_PRICE_CONFIG,
  DEFAULT_TIME_RULES,
  ALL_PTTT_TYPES,
  STAFF_POSITIONS,
} from '../services/laborConfigService';

// ─── DEFAULT_PRICE_CONFIG (Snapshot Test) ───────────────────────────────────

describe('DEFAULT_PRICE_CONFIG — Giá trị phụ cấp theo QĐ73', () => {
  it('phải có đủ 9 loại PTTT', () => {
    const types = Object.keys(DEFAULT_PRICE_CONFIG);
    expect(types).toEqual(expect.arrayContaining(['PĐB', 'P1', 'P2', 'P3', 'TĐB', 'T1', 'T2', 'T3', 'TKPL']));
    expect(types).toHaveLength(9);
  });

  it('PĐB: Chính=280000, Phụ=200000, GV=120000', () => {
    expect(DEFAULT_PRICE_CONFIG['PĐB']).toEqual({
      'Chính': 280000,
      'Phụ': 200000,
      'Giúp việc': 120000,
    });
  });

  it('P1: Chính=125000, Phụ=90000, GV=70000', () => {
    expect(DEFAULT_PRICE_CONFIG['P1']).toEqual({
      'Chính': 125000,
      'Phụ': 90000,
      'Giúp việc': 70000,
    });
  });

  it('P2: Chính=65000, Phụ=50000, GV=30000', () => {
    expect(DEFAULT_PRICE_CONFIG['P2']).toEqual({
      'Chính': 65000,
      'Phụ': 50000,
      'Giúp việc': 30000,
    });
  });

  it('P3: Chính=50000, Phụ=30000, GV=15000', () => {
    expect(DEFAULT_PRICE_CONFIG['P3']).toEqual({
      'Chính': 50000,
      'Phụ': 30000,
      'Giúp việc': 15000,
    });
  });

  it('TKPL: tất cả = 0 (Thủ thuật không phân loại)', () => {
    expect(DEFAULT_PRICE_CONFIG['TKPL']).toEqual({
      'Chính': 0,
      'Phụ': 0,
      'Giúp việc': 0,
    });
  });

  it('giá phẫu thuật luôn > giá thủ thuật cùng loại', () => {
    const levels = ['ĐB', '1', '2', '3'];
    levels.forEach(level => {
      const pt = DEFAULT_PRICE_CONFIG[`P${level}`];
      const tt = DEFAULT_PRICE_CONFIG[`T${level}`];
      expect(pt['Chính']).toBeGreaterThan(tt['Chính']);
      expect(pt['Phụ']).toBeGreaterThan(tt['Phụ']);
      expect(pt['Giúp việc']).toBeGreaterThan(tt['Giúp việc']);
    });
  });

  it('mỗi loại: Chính >= Phụ >= Giúp việc', () => {
    ALL_PTTT_TYPES.forEach(type => {
      const price = DEFAULT_PRICE_CONFIG[type];
      expect(price['Chính']).toBeGreaterThanOrEqual(price['Phụ']);
      expect(price['Phụ']).toBeGreaterThanOrEqual(price['Giúp việc']);
    });
  });
});

// ─── DEFAULT_TIME_RULES ─────────────────────────────────────────────────────

describe('DEFAULT_TIME_RULES — Định mức thời gian', () => {
  it('phải có đủ 9 loại PTTT', () => {
    expect(Object.keys(DEFAULT_TIME_RULES)).toHaveLength(9);
  });

  it('TKPL: min=0, max=0 (không kiểm tra)', () => {
    expect(DEFAULT_TIME_RULES['TKPL']).toEqual({ min: 0, max: 0 });
  });

  it('mỗi loại: min <= max', () => {
    ALL_PTTT_TYPES.forEach(type => {
      const rule = DEFAULT_TIME_RULES[type];
      expect(rule.min).toBeLessThanOrEqual(rule.max);
    });
  });
});

// ─── STAFF_POSITIONS ────────────────────────────────────────────────────────

describe('STAFF_POSITIONS — Danh sách vị trí kíp mổ', () => {
  it('phải có 6 vị trí', () => {
    expect(STAFF_POSITIONS).toHaveLength(6);
  });

  it('BS gây mê có defaultLimit = 2 (ngoại lệ kiêm nhiệm)', () => {
    const bsGM = STAFF_POSITIONS.find(p => p.key === 'bsGM');
    expect(bsGM).toBeDefined();
    expect(bsGM!.defaultLimit).toBe(2);
  });

  it('PTV chính và phụ có defaultLimit = 1 (tuyệt đối 1 bàn)', () => {
    const ptChinh = STAFF_POSITIONS.find(p => p.key === 'ptChinh');
    const ptPhu = STAFF_POSITIONS.find(p => p.key === 'ptPhu');
    expect(ptChinh!.defaultLimit).toBe(1);
    expect(ptPhu!.defaultLimit).toBe(1);
  });

  it('Giúp việc có defaultLimit = 0 (không kiểm tra)', () => {
    const gv = STAFF_POSITIONS.find(p => p.key === 'gv');
    expect(gv!.defaultLimit).toBe(0);
  });
});

// ─── getAllowanceForRecord ───────────────────────────────────────────────────

describe('getAllowanceForRecord', () => {
  it('loại PĐB, không có allAllowanceItems → trả DEFAULT', () => {
    const price = getAllowanceForRecord('PĐB', '2026-09-10');
    expect(price).toEqual({
      'Chính': 280000,
      'Phụ': 200000,
      'Giúp việc': 120000,
    });
  });

  it('loại P1 → trả giá đúng', () => {
    const price = getAllowanceForRecord('P1', '2026-09-10');
    expect(price['Chính']).toBe(125000);
  });

  it('loại TKPL → trả {0, 0, 0}', () => {
    const price = getAllowanceForRecord('TKPL', '2026-09-10');
    expect(price['Chính']).toBe(0);
    expect(price['Phụ']).toBe(0);
    expect(price['Giúp việc']).toBe(0);
  });

  it('loại không tồn tại → trả {0, 0, 0} fallback', () => {
    const price = getAllowanceForRecord('UNKNOWN', '2026-09-10');
    expect(price).toEqual({ 'Chính': 0, 'Phụ': 0, 'Giúp việc': 0 });
  });

  it('có fallbackPrices custom → dùng fallback thay vì default', () => {
    const customPrices = {
      'P2': { 'Chính': 99000, 'Phụ': 77000, 'Giúp việc': 55000 },
    };
    const price = getAllowanceForRecord('P2', '2026-09-10', undefined, customPrices);
    expect(price['Chính']).toBe(99000);
  });
});

// ─── normalizeDate ──────────────────────────────────────────────────────────

describe('normalizeDate', () => {
  it('"15/06/2026" (dd/mm/yyyy) → "2026-06-15"', () => {
    expect(normalizeDate('15/06/2026')).toBe('2026-06-15');
  });

  it('"2026-09-10" (ISO) → "2026-09-10"', () => {
    expect(normalizeDate('2026-09-10')).toBe('2026-09-10');
  });

  it('"2026/09/10" (slash) → "2026-09-10"', () => {
    expect(normalizeDate('2026/09/10')).toBe('2026-09-10');
  });

  it('"20260910" (compact) → "2026-09-10"', () => {
    expect(normalizeDate('20260910')).toBe('2026-09-10');
  });

  it('Date object → "YYYY-MM-DD"', () => {
    const d = new Date(2026, 8, 10); // Sep 10
    expect(normalizeDate(d)).toBe('2026-09-10');
  });

  it('null → ""', () => {
    expect(normalizeDate(null)).toBe('');
  });

  it('"" → ""', () => {
    expect(normalizeDate('')).toBe('');
  });

  it('"2026-09-10 14:30:00" (ISO with time) → "2026-09-10"', () => {
    expect(normalizeDate('2026-09-10 14:30:00')).toBe('2026-09-10');
  });

  it('"5/1/2026" (single digit) → "2026-01-05" (padded)', () => {
    expect(normalizeDate('5/1/2026')).toBe('2026-01-05');
  });
});
