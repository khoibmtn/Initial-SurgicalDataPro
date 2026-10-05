import { describe, it, expect } from 'vitest';
import { parseTimeToShiftHours, formatDisplayTime } from '../services/scheduleConflictService';
import { parseTime24 } from '../components/common/TimeInput24';
import { getNowShiftHours } from '../components/scheduling/MobileScheduleList';

describe('parseTimeToShiftHours with suffixes', () => {
  it('does not merge the "+1" digit into minutes', () => {
    expect(parseTimeToShiftHours('07:30 (+1)', 7.5)).toBeCloseTo(31.5);
    expect(parseTimeToShiftHours('01:00 (+1)', 7.5)).toBeCloseTo(25);
  });
  it('keeps (sớm) as same day and plain early hours as next day', () => {
    expect(parseTimeToShiftHours('06:00 (sớm)', 7.5)).toBeCloseTo(6);
    expect(parseTimeToShiftHours('06:00', 7.5)).toBeCloseTo(30);
    expect(parseTimeToShiftHours('13:05', 7.5)).toBeCloseTo(13 + 5 / 60);
  });
});

describe('formatDisplayTime', () => {
  it('strips suffixes and pads', () => {
    expect(formatDisplayTime('07:30 (+1)')).toBe('07:30');
    expect(formatDisplayTime('6:5 (sớm)')).toBe('06:05');
    expect(formatDisplayTime('13:00')).toBe('13:00');
  });
});

describe('parseTime24 (24h input)', () => {
  it.each([
    ['13:05', '13:05'], ['1305', '13:05'], ['801', '08:01'], ['8', '08:00'],
    ['13h', '13:00'], ['13h5', '13:05'], ['00:00', '00:00'], ['23:59', '23:59'],
  ])('%s → %s', (input, out) => expect(parseTime24(input)).toBe(out));

  it.each(['24:00', '12:60', 'abc', '1:2:3', ''])('rejects %s', (input) => expect(parseTime24(input)).toBeNull());
});

describe('getNowShiftHours', () => {
  it('maps after-midnight time to the previous day shift (+24)', () => {
    const now = new Date(2026, 9, 4, 2, 0);
    expect(getNowShiftHours('2026-10-03', 7.5, now)).toBeCloseTo(26);
    expect(getNowShiftHours('2026-10-04', 7.5, now)).toBeNull();
  });
  it('returns plain hours during the day shift', () => {
    expect(getNowShiftHours('2026-10-03', 7.5, new Date(2026, 9, 3, 13, 30))).toBeCloseTo(13.5);
  });
});

import { computeOffHoursIntervals } from '../components/scheduling/DayTimelineView';

describe('computeOffHoursIntervals', () => {
  const winterSchedule = {
    morningFrom: '07:30',
    morningTo: '12:00',
    afternoonFrom: '13:30',
    afternoonTo: '17:00',
  };

  const summerSchedule = {
    morningFrom: '07:00',
    morningTo: '11:30',
    afternoonFrom: '13:30',
    afternoonTo: '17:00',
  };

  it('computes winter off-hours with standard 24h duty shift (07:30 to 31.5)', () => {
    const intervals = computeOffHoursIntervals(7.5, 31.5, winterSchedule, winterSchedule);
    expect(intervals).toHaveLength(2);
    // 1. Lunch break
    expect(intervals[0].start).toBeCloseTo(12.0);
    expect(intervals[0].end).toBeCloseTo(13.5);
    expect(intervals[0].label).toContain('12:00');
    expect(intervals[0].label).toContain('13:30');
    // 2. Evening through next morning duty start
    expect(intervals[1].start).toBeCloseTo(17.0);
    expect(intervals[1].end).toBeCloseTo(31.5);
    expect(intervals[1].label).toContain('17:00');
    expect(intervals[1].label).toContain('07:30');
  });

  it('computes summer off-hours with standard 24h duty shift (07:00 to 31.0)', () => {
    const intervals = computeOffHoursIntervals(7.0, 31.0, summerSchedule, summerSchedule);
    expect(intervals).toHaveLength(2);
    // 1. Lunch break
    expect(intervals[0].start).toBeCloseTo(11.5);
    expect(intervals[0].end).toBeCloseTo(13.5);
    expect(intervals[0].label).toContain('11:30');
    expect(intervals[0].label).toContain('13:30');
    // 2. Evening through next morning duty start
    expect(intervals[1].start).toBeCloseTo(17.0);
    expect(intervals[1].end).toBeCloseTo(31.0);
    expect(intervals[1].label).toContain('17:00');
    expect(intervals[1].label).toContain('07:00');
  });

  it('includes early morning off-hours if timeline is expanded before duty start', () => {
    const intervals = computeOffHoursIntervals(5.0, 31.5, winterSchedule, winterSchedule);
    expect(intervals[0].start).toBeCloseTo(5.0);
    expect(intervals[0].end).toBeCloseTo(7.5);
    expect(intervals[0].label).toContain('Ngoài giờ');
  });
});

