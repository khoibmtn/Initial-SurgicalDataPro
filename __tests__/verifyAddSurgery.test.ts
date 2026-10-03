import { describe, it, expect } from 'vitest';
import { parseTimeToShiftHours, formatDisplayTime } from '../services/scheduleConflictService';
import { stripUndefined } from '../services/scheduleService';
import { parseTime24 } from '../components/common/TimeInput24';

describe('Verify surgery modal inputs and payload', () => {
  it('correctly handles 24h format times and shift hours', () => {
    const dutyStartHour = 7.5;
    const start = '08:01';
    const end = '09:30';
    const sShift = parseTimeToShiftHours(start, dutyStartHour);
    const eShift = parseTimeToShiftHours(end, dutyStartHour);
    expect(sShift).toBeCloseTo(8 + 1/60);
    expect(eShift).toBeCloseTo(9.5);
    expect(eShift - sShift).toBeGreaterThan(0);
  });

  it('correctly handles overnight times (e.g. 23:00 to 01:00)', () => {
    const dutyStartHour = 7.5;
    const start = '23:00';
    const end = '01:00';
    const sShift = parseTimeToShiftHours(start, dutyStartHour);
    const eShift = parseTimeToShiftHours(end, dutyStartHour);
    expect(sShift).toBe(23);
    expect(eShift).toBe(25); // next day
    expect(eShift - sShift).toBe(2);
  });

  it('strips undefined note and fields so Firebase RTDB will not throw', () => {
    const payload = {
      date: '2026-10-03',
      patientId: '1234',
      patientName: 'Test Patient',
      tenKT: 'Test Surgery',
      startTime: '08:00',
      endTime: '09:00',
      machineCode: '',
      machineName: '',
      staff: {},
      note: undefined,
    };
    const cleaned = stripUndefined(payload);
    expect('note' in cleaned).toBe(false);
    expect(Object.keys(cleaned)).not.toContain('note');
  });
});
