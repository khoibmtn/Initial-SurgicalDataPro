import { describe, it, expect } from 'vitest';
import { normalizeLoaiPTTT, resolveDefaultLoaiPTTT } from '../services/defaultSurgeryLoaiMap';
import { getTimeRuleForRecord } from '../services/laborConfigService';
import {
  computeDraggedTimes,
  assignLanes,
  computeVerticalLayout,
  estimateHorizontalCardHeight,
  estimateHorizontalCardWidth,
} from '../components/scheduling/DayTimelineView';
import {
  getOrderedStaffEntries,
  abbreviateStaffName,
  STAFF_ROLE_SHORT_LABELS,
  type ScheduledSurgery,
} from '../types/schedule';

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

describe('getOrderedStaffEntries, abbreviateStaffName & estimateHorizontalCardHeight', () => {
  it('abbreviates Vietnamese staff names into uppercase family/middle initials + given name', () => {
    expect(abbreviateStaffName('Nguyễn Thị Thu Hương')).toBe('NTT Hương');
    expect(abbreviateStaffName('Đào Văn Điệp')).toBe('ĐV Điệp');
    expect(abbreviateStaffName('Lê Linh')).toBe('L Linh');
    expect(abbreviateStaffName('Hương')).toBe('Hương');
    // Multiple staff separated by comma
    expect(abbreviateStaffName('Nguyễn Thị Thu Hương, Đào Văn Điệp')).toBe('NTT Hương, ĐV Điệp');
  });

  it('orders staff roles in canonical surgical team order with full and short role labels/names', () => {
    const staff = {
      tdc: 'Hoàng Thị Mai',
      bsGM: 'Đào Văn Điệp',
      ptChinh: 'Nguyễn Thị Thu Hương',
      ptPhu: 'Trần Văn Bình',
      ktvGM: 'Phạm Quang Hưng',
    };
    expect(getOrderedStaffEntries(staff)).toEqual([
      {
        roleKey: 'ptChinh',
        roleLabel: 'PT Chính',
        roleShortLabel: STAFF_ROLE_SHORT_LABELS.ptChinh,
        name: 'Nguyễn Thị Thu Hương',
        shortName: 'NTT Hương',
      },
      {
        roleKey: 'ptPhu',
        roleLabel: 'PT Phụ',
        roleShortLabel: STAFF_ROLE_SHORT_LABELS.ptPhu,
        name: 'Trần Văn Bình',
        shortName: 'TV Bình',
      },
      {
        roleKey: 'bsGM',
        roleLabel: 'BS Gây mê',
        roleShortLabel: STAFF_ROLE_SHORT_LABELS.bsGM,
        name: 'Đào Văn Điệp',
        shortName: 'ĐV Điệp',
      },
      {
        roleKey: 'ktvGM',
        roleLabel: 'KTV Gây mê',
        roleShortLabel: STAFF_ROLE_SHORT_LABELS.ktvGM,
        name: 'Phạm Quang Hưng',
        shortName: 'PQ Hưng',
      },
      {
        roleKey: 'tdc',
        roleLabel: 'TDC',
        roleShortLabel: STAFF_ROLE_SHORT_LABELS.tdc,
        name: 'Hoàng Thị Mai',
        shortName: 'HT Mai',
      },
    ]);
  });

  it('auto-adjusts card vertical height based on staff count, character wrapping width, and shortStaffName mode', () => {
    const entry = {
      ...makeEntry('S1', '10:00', '11:00'),
      staff: {
        ptChinh: 'Nguyễn Thị Thu Hương',
        ptPhu: 'Trần Minh Tuấn, Lê Hoàng Nam',
        bsGM: 'Đào Văn Điệp',
        ktvGM: 'Đỗ Quang Huy',
        tdc: 'Vũ Thị Ngọc Mai',
      },
    };

    // When showStaff is false -> default 68px
    expect(estimateHorizontalCardHeight(entry, 180, false)).toBe(68);

    // When showStaff is true at wide width (240px) -> expands to fit all 5 positions
    const wideH = estimateHorizontalCardHeight(entry, 240, true);
    expect(wideH).toBeGreaterThan(130);

    // When card is narrower (100px) -> long name strings wrap onto more lines, so height increases further
    const narrowFullH = estimateHorizontalCardHeight(entry, 100, true, 0, false);
    expect(narrowFullH).toBeGreaterThan(wideH);

    // In shortStaffName mode on narrow card (100px) -> shorter strings ("PTC: NTT Hương") wrap less, reducing height
    const narrowShortH = estimateHorizontalCardHeight(entry, 100, true, 0, true);
    expect(narrowShortH).toBeLessThan(narrowFullH);
  });

  it('auto-adjusts card horizontal width to respect duration while guaranteeing readable width for staff names', () => {
    const entry = {
      ...makeEntry('S2', '10:00', '10:30', 'QUÀNG VĂN QUÊ'),
      staff: {
        ptChinh: 'Nguyễn Thị Thu Hương',
        bsGM: 'Đào Văn Điệp',
      },
    };

    // Short 30-min surgery at 80px/h -> durationWidth = 40px, widens to readable width
    const wShortStaff = estimateHorizontalCardWidth(entry, 40, 80, true, true);
    const wFullStaff = estimateHorizontalCardWidth(entry, 40, 80, true, false);
    expect(wShortStaff).toBeGreaterThanOrEqual(96);
    expect(wFullStaff).toBeGreaterThan(wShortStaff);

    // Long 2-hour surgery at 120px/h -> durationWidth = 240px is preserved
    expect(estimateHorizontalCardWidth(entry, 240, 120, true, true)).toBe(240);
  });
});



