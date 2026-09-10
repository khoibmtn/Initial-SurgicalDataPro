/**
 * Test Nhóm A: Overtime Classification
 * Kiểm thử thuật toán phân loại ca mổ trong giờ / ngoài giờ / lễ tết
 * và tính toán thời gian ngoài giờ cho từng thành viên kíp mổ.
 */
import { describe, it, expect } from 'vitest';
import {
  getSeasonForDate,
  getScheduleForDate,
  formatDurationText,
  calculateOvertimeRows,
} from '../services/overtimeCalculationService';
import { SurgeryRecord, DutyScheduleDateConfig } from '../types';

// ─── getSeasonForDate ───────────────────────────────────────────────────────

describe('getSeasonForDate', () => {
  it('ngày giữa hè (15/06) → summer', () => {
    const date = new Date(2026, 5, 15); // June 15
    expect(getSeasonForDate(date)).toBe('summer');
  });

  it('ngày giữa đông (15/01) → winter', () => {
    const date = new Date(2026, 0, 15); // Jan 15
    expect(getSeasonForDate(date)).toBe('winter');
  });

  it('biên đầu hè: 01/05 → summer', () => {
    const date = new Date(2026, 4, 1); // May 1
    expect(getSeasonForDate(date)).toBe('summer');
  });

  it('biên cuối hè: 30/09 → summer', () => {
    const date = new Date(2026, 8, 30); // Sep 30
    expect(getSeasonForDate(date)).toBe('summer');
  });

  it('ngày sau mùa hè: 01/10 → winter', () => {
    const date = new Date(2026, 9, 1); // Oct 1
    expect(getSeasonForDate(date)).toBe('winter');
  });

  it('ngày trước mùa hè: 30/04 → winter', () => {
    const date = new Date(2026, 3, 30); // Apr 30
    expect(getSeasonForDate(date)).toBe('winter');
  });

  it('sử dụng configHours custom → phân mùa đúng', () => {
    const customHours = {
      summer: {
        dateFrom: '01/06',
        dateTo: '31/08',
        morningFrom: '06:30',
        morningTo: '11:00',
        afternoonFrom: '13:00',
        afternoonTo: '16:30',
      },
      winter: {
        dateFrom: '01/09',
        dateTo: '31/05',
        morningFrom: '07:30',
        morningTo: '12:00',
        afternoonFrom: '13:30',
        afternoonTo: '17:00',
      },
    };
    // May 15 với config hè từ 01/06 → winter
    expect(getSeasonForDate(new Date(2026, 4, 15), customHours)).toBe('winter');
    // June 15 → summer
    expect(getSeasonForDate(new Date(2026, 5, 15), customHours)).toBe('summer');
  });
});

// ─── getScheduleForDate ─────────────────────────────────────────────────────

describe('getScheduleForDate', () => {
  it('ngày hè → trả khung giờ summer mặc định', () => {
    const schedule = getScheduleForDate(new Date(2026, 6, 1)); // July
    expect(schedule.morningFrom).toBe('07:00');
    expect(schedule.morningTo).toBe('11:30');
    expect(schedule.afternoonFrom).toBe('13:30');
    expect(schedule.afternoonTo).toBe('17:00');
  });

  it('ngày đông → trả khung giờ winter mặc định', () => {
    const schedule = getScheduleForDate(new Date(2026, 0, 15)); // Jan
    expect(schedule.morningFrom).toBe('07:30');
    expect(schedule.morningTo).toBe('12:00');
    expect(schedule.afternoonFrom).toBe('13:30');
    expect(schedule.afternoonTo).toBe('17:00');
  });
});

// ─── formatDurationText ─────────────────────────────────────────────────────

describe('formatDurationText', () => {
  it('0 phút → "0ph"', () => {
    expect(formatDurationText(0)).toBe('0ph');
  });

  it('số âm → "0ph"', () => {
    expect(formatDurationText(-10)).toBe('0ph');
  });

  it('30 phút → "30ph"', () => {
    expect(formatDurationText(30)).toBe('30ph');
  });

  it('60 phút → "1h"', () => {
    expect(formatDurationText(60)).toBe('1h');
  });

  it('80 phút → "1h20"', () => {
    expect(formatDurationText(80)).toBe('1h20');
  });

  it('65 phút → "1h05"', () => {
    expect(formatDurationText(65)).toBe('1h05');
  });

  it('125 phút → "2h05"', () => {
    expect(formatDurationText(125)).toBe('2h05');
  });
});

// ─── calculateOvertimeRows ──────────────────────────────────────────────────

describe('calculateOvertimeRows', () => {
  // Helper: tạo SurgeryRecord mock
  function makeSurgeryRecord(overrides: Partial<SurgeryRecord> = {}): SurgeryRecord {
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
      ptChinh: 'BS Nguyễn A',
      ptPhu: 'BS Trần B',
      bsGM: 'BS Lê C',
      ktvGM: 'KTV Phạm D',
      tdc: 'ĐD Hoàng E',
      gv: '',
      machine: '',
      machineCode: '',
      machineId: '',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
      key: 'BN001-test',
      excelRowIndex: 9,
    };
    return { ...defaults, ...overrides };
  }

  const emptyDutySchedules: Record<string, DutyScheduleDateConfig> = {};

  it('ca mổ hoàn toàn trong giờ hành chính → không có row ngoài giờ', () => {
    // Ca mổ: 08:00 - 10:00 ngày thường (Thứ 5, 10/09/2026)
    const records = [makeSurgeryRecord()];
    const rows = calculateOvertimeRows(records, emptyDutySchedules);
    expect(rows).toHaveLength(0);
  });

  it('ca mổ hoàn toàn ngoài giờ hành chính → có row ngoài giờ', () => {
    // Ca mổ: 19:00 - 21:00 ngày thường
    const records = [makeSurgeryRecord({
      start: new Date(2026, 8, 10, 19, 0),
      end: new Date(2026, 8, 10, 21, 0),
      ngayBD: '10/09/2026 19:00',
      ngayKT: '10/09/2026 21:00',
    })];
    const rows = calculateOvertimeRows(records, emptyDutySchedules);
    expect(rows.length).toBeGreaterThan(0);
    // Tổng thời gian ngoài giờ phải = 120 phút
    const totalMinutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0);
    expect(totalMinutes).toBe(120);
  });

  it('ca mổ bắt đầu trong giờ, kết thúc ngoài giờ → chỉ phần ngoài giờ có row', () => {
    // Ca mổ: 16:00 - 18:30 (hè: giờ HC kết thúc 17:00)
    // → 16:00-17:00 = trong giờ, 17:00-18:30 = ngoài giờ (90 phút)
    const records = [makeSurgeryRecord({
      start: new Date(2026, 6, 10, 16, 0), // July 10 = summer
      end: new Date(2026, 6, 10, 18, 30),
      ngayBD: '10/07/2026 16:00',
      ngayKT: '10/07/2026 18:30',
    })];
    const rows = calculateOvertimeRows(records, emptyDutySchedules);
    expect(rows.length).toBeGreaterThan(0);
    const totalMinutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0);
    expect(totalMinutes).toBe(90);
  });

  it('ca mổ bắt đầu sau 17h → Kíp tăng cường (không phải Kíp mổ phiên)', () => {
    // Ca mổ: 19:00 - 21:00 ngày thường
    const records = [makeSurgeryRecord({
      start: new Date(2026, 8, 10, 19, 0),
      end: new Date(2026, 8, 10, 21, 0),
      ngayBD: '10/09/2026 19:00',
      ngayKT: '10/09/2026 21:00',
    })];
    const rows = calculateOvertimeRows(records, emptyDutySchedules);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.ghiChu === 'Kíp tăng cường')).toBe(true);
  });

  it('ca mổ bắt đầu trước 17h nhưng kéo dài ngoài giờ → Kíp mổ phiên', () => {
    // Ca mổ: 16:00 - 18:00 → bắt đầu trong giờ HC, kéo dài ngoài giờ
    const records = [makeSurgeryRecord({
      start: new Date(2026, 6, 10, 16, 0), // July summer
      end: new Date(2026, 6, 10, 18, 0),
      ngayBD: '10/07/2026 16:00',
      ngayKT: '10/07/2026 18:00',
    })];
    const rows = calculateOvertimeRows(records, emptyDutySchedules);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.ghiChu === 'Kíp mổ phiên')).toBe(true);
  });

  it('records rỗng → trả mảng rỗng', () => {
    const rows = calculateOvertimeRows([], emptyDutySchedules);
    expect(rows).toHaveLength(0);
  });

  it('record có start > end → bỏ qua', () => {
    const records = [makeSurgeryRecord({
      start: new Date(2026, 8, 10, 10, 0),
      end: new Date(2026, 8, 10, 8, 0),
    })];
    const rows = calculateOvertimeRows(records, emptyDutySchedules);
    expect(rows).toHaveLength(0);
  });

  it('nhân viên đang trực → KHÔNG tính ngoài giờ', () => {
    // Ca mổ ngoài giờ: 20:00 - 22:00
    // BS Nguyễn A đang trực ngày 10/09/2026
    const records = [makeSurgeryRecord({
      start: new Date(2026, 8, 10, 20, 0),
      end: new Date(2026, 8, 10, 22, 0),
      ngayBD: '10/09/2026 20:00',
      ngayKT: '10/09/2026 22:00',
    })];
    const dutySchedules: Record<string, DutyScheduleDateConfig> = {
      '2026-09-10': {
        date: '2026-09-10',
        isHoliday: false,
        onCallStaff: ['BS Nguyễn A'],
      },
    };
    const rows = calculateOvertimeRows(records, dutySchedules);
    // BS Nguyễn A (ptChinh) đang trực → không có trong row ngoài giờ
    const hasNguyenA = rows.some(r => r.ptChinh === 'BS Nguyễn A');
    expect(hasNguyenA).toBe(false);
  });
});
