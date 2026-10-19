import { describe, it, expect } from 'vitest';
import { normalizeLoaiPTTT, resolveDefaultLoaiPTTT } from '../services/defaultSurgeryLoaiMap';
import { getTimeRuleForRecord } from '../services/laborConfigService';
import {
  computeDraggedTimes,
  assignLanes,
  computeVerticalLayout,
} from '../components/scheduling/DayTimelineView';
import type { ScheduledSurgery } from '../types/schedule';

function makeEntry(
  id: string,
  startTime: string,
  endTime: string,
  patientName = `BN ${id}`
): ScheduledSurgery {
  return {
    id,
    date: '2026-10-19',
    patientId: `PID-${id}`,
    patientName,
    tenKT: 'Phẫu thuật nội soi',
    startTime,
    endTime,
    machineCode: 'M1',
    machineName: 'Phòng mổ 1',
    staff: {},
    createdBy: 'u1',
    createdByName: 'BS A',
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe('defaultSurgeryLoaiMap & PTTT minimum duration lookup', () => {
  it('normalizes PDB and TDB to PĐB and TĐB', () => {
    expect(normalizeLoaiPTTT('PDB')).toBe('PĐB');
    expect(normalizeLoaiPTTT('TDB')).toBe('TĐB');
    expect(normalizeLoaiPTTT('p1')).toBe('P1');
    expect(normalizeLoaiPTTT('T2')).toBe('T2');
  });

  it('resolves loaiPTTT from maTuongDuong and tenKT from Danh_muc_gia_phau_thuat.xlsx', () => {
    // By explicit loai
    expect(resolveDefaultLoaiPTTT('Bất kỳ', '00.00', 'PDB')).toBe('PĐB');
    // By maTuongDuong
    expect(resolveDefaultLoaiPTTT('Tên bất kỳ', '01.0303.0001')).toBe('T2');
    expect(resolveDefaultLoaiPTTT('Tên bất kỳ', '10.0155.0404')).toBe('PĐB');
    // By tenKT (case-insensitive)
    expect(resolveDefaultLoaiPTTT('Cắt bỏ tinh hoàn')).toBe('P1');
    expect(resolveDefaultLoaiPTTT('Bóc nang tuyến Bartholin')).toBe('P2');
  });

  it('computes minimum duration from resolved loaiPTTT via getTimeRuleForRecord', () => {
    const ruleP1 = getTimeRuleForRecord('P1', '2026-10-19');
    const ruleP2 = getTimeRuleForRecord('P2', '2026-10-19');
    const rulePDB = getTimeRuleForRecord('PĐB', '2026-10-19');

    expect(ruleP1?.min).toBe(120);
    expect(ruleP2?.min).toBe(60);
    expect(rulePDB?.min).toBe(180);
  });
});

describe('computeDraggedTimes (1-minute step resolution)', () => {
  it('shifts startTime and endTime by 1-minute increments based on pixel delta', () => {
    const entry = { startTime: '08:00', endTime: '09:30' };
    // At hourWidth = 120px/h, 2px = 1 minute
    expect(computeDraggedTimes(entry, 2, 120, 7.5)).toEqual({
      startTime: '08:01',
      endTime: '09:31',
    });
    // +34px = +17 minutes
    expect(computeDraggedTimes(entry, 34, 120, 7.5)).toEqual({
      startTime: '08:17',
      endTime: '09:47',
    });
    // -30px = -15 minutes
    expect(computeDraggedTimes(entry, -30, 120, 7.5)).toEqual({
      startTime: '07:45',
      endTime: '09:15',
    });
  });

  it('clamps within the 24-hour duty shift window (07:30 to 07:30 (+1))', () => {
    const entry = { startTime: '08:00', endTime: '09:00' };
    // Dragging far left stops at 07:30 (dutyStartHour = 7.5)
    expect(computeDraggedTimes(entry, -5000, 120, 7.5)).toEqual({
      startTime: '07:30',
      endTime: '08:30',
    });
    // Dragging far right stops at 06:30 – 07:30 (+1)
    expect(computeDraggedTimes(entry, 50000, 120, 7.5)).toEqual({
      startTime: '06:30',
      endTime: '07:30 (+1)',
    });
  });

  it('handles crossing midnight smoothly', () => {
    const entry = { startTime: '23:00', endTime: '00:00' };
    // +90 minutes (180px at 120px/h) -> 00:30 to 01:30
    expect(computeDraggedTimes(entry, 180, 120, 7.5)).toEqual({
      startTime: '00:30',
      endTime: '01:30',
    });
  });
});

describe('assignLanes & computeVerticalLayout with movedOrder', () => {
  it('places dragged entry at Lane 0 when moved to an empty time slot', () => {
    const entries = [
      makeEntry('A', '08:00', '09:00'),
      makeEntry('B', '08:15', '09:15'),
      makeEntry('D', '10:00', '11:00'), // Moved to empty slot 10:00-11:00
    ];

    const lanes = assignLanes(entries, 7.5, ['D']);
    expect(lanes.get('A')).toBe(0);
    expect(lanes.get('B')).toBe(1);
    expect(lanes.get('D')).toBe(0);

    const vLayout = computeVerticalLayout(entries, 7.5, ['D']);
    const dItem = vLayout.items.find((i) => i.entry.id === 'D');
    expect(dItem?.col).toBe(0);
  });

  it('pushes dragged entry to the bottom lane when overlapping existing cases (even if starting earlier)', () => {
    const entries = [
      makeEntry('A', '08:00', '10:00'),
      makeEntry('B', '08:30', '10:30'),
      // D is dragged to 07:50-09:00 (starts before A and B, overlaps both)
      makeEntry('D', '07:50', '09:00'),
    ];

    const lanes = assignLanes(entries, 7.5, ['D']);
    // Static cases A and B keep lanes 0 and 1; dragged case D is pushed to bottom (lane 2)
    expect(lanes.get('A')).toBe(0);
    expect(lanes.get('B')).toBe(1);
    expect(lanes.get('D')).toBe(2);

    const vLayout = computeVerticalLayout(entries, 7.5, ['D']);
    const aCol = vLayout.items.find((i) => i.entry.id === 'A')?.col;
    const bCol = vLayout.items.find((i) => i.entry.id === 'B')?.col;
    const dCol = vLayout.items.find((i) => i.entry.id === 'D')?.col;
    expect(aCol).toBe(0);
    expect(bCol).toBe(1);
    expect(dCol).toBe(2);
  });
});
