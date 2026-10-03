/**
 * Schedule Conflict Detection
 * Phát hiện xung đột trùng máy và trùng nhân sự giữa các ca mổ.
 */
import type { ScheduledSurgery, ScheduleConflict } from '../types/schedule';
import type { RoleFilterConfig } from '../contexts/ConfigContext';

/**
 * Convert time string to shift hours (0 to 36+)
 * e.g. If duty starts at 07:30:
 * - "08:00" => 8.0
 * - "23:30" => 23.5
 * - "01:00 (+1)" or "01:00" (< 7.5) => 25.0 (post-midnight of the 24h duty shift)
 */
export function parseTimeToShiftHours(t: string, dutyStartHour: number = 7.5): number {
  if (!t) return dutyStartHour;
  const isExplicitNextDay = t.includes('+1') || t.toLowerCase().includes('hs') || t.toLowerCase().includes('hôm sau');
  const isExplicitTodayEarly = t.toLowerCase().includes('sớm') || t.toLowerCase().includes('hôm nay');
  
  const match = t.match(/(\d{1,2})(?:\s*[:hH]\s*(\d{1,2}))?/);
  const h = match ? Number(match[1]) : NaN;
  const m = match && match[2] ? Number(match[2]) : 0;
  let hour = (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m) / 60;
  
  if (isExplicitNextDay) {
    return hour + 24;
  }
  if (!isExplicitTodayEarly && hour < dutyStartHour) {
    return hour + 24;
  }
  return hour;
}

/** Giờ hiển thị trên timeline: chỉ "HH:mm", bỏ các hậu tố như "(+1)", "(sớm)". */
export function formatDisplayTime(t: string): string {
  const match = (t || '').match(/(\d{1,2})(?:\s*[:hH]\s*(\d{1,2}))?/);
  if (!match) return t || '';
  return `${match[1].padStart(2, '0')}:${(match[2] || '0').padStart(2, '0')}`;
}

/** Kiểm tra 2 khoảng thời gian có overlap không trong ca trực 24h */
export function timeOverlaps(
  s1Start: string, s1End: string,
  s2Start: string, s2End: string,
  dutyStartHour: number = 7.5,
): boolean {
  const a1 = parseTimeToShiftHours(s1Start, dutyStartHour);
  let a2 = parseTimeToShiftHours(s1End, dutyStartHour);
  if (a2 <= a1) a2 += 24;

  const b1 = parseTimeToShiftHours(s2Start, dutyStartHour);
  let b2 = parseTimeToShiftHours(s2End, dutyStartHour);
  if (b2 <= b1) b2 += 24;

  // Overlap if one starts before the other ends
  return a1 < b2 && b1 < a2;
}

/** Khoảng giờ [start, end) của ca mổ theo giờ ca trực */
function toShiftInterval(s: ScheduledSurgery, dutyStartHour: number): [number, number] {
  const start = parseTimeToShiftHours(s.startTime, dutyStartHour);
  let end = parseTimeToShiftHours(s.endTime, dutyStartHour);
  if (end <= start) end += 24;
  return [start, end];
}

/**
 * Phát hiện tất cả xung đột trong danh sách ca mổ ngày đó.
 *
 * @param entries Danh sách ca mổ trong ngày
 * @param roleFilters Vị trí cần check trùng (từ Định mức bàn mổ, limit > 0)
 * @param dutyStartHour Giờ bắt đầu ca trực hành chính (7.5 mùa đông, 7.0 mùa hè)
 * @param roleLimits Định mức bàn mổ theo vị trí (vd bsGM = 2). Chỉ báo trùng khi
 *                   số ca đồng thời của 1 người VƯỢT định mức. Mặc định = 1.
 * @returns Danh sách xung đột
 */
export function detectConflicts(
  entries: ScheduledSurgery[],
  roleFilters?: RoleFilterConfig,
  dutyStartHour: number = 7.5,
  roleLimits?: Partial<Record<string, number>>,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  if (entries.length < 2) return conflicts;

  const intervals = new Map(entries.map((e) => [e.id, toShiftInterval(e, dutyStartHour)]));
  const rolesToCheck = roleFilters
    ? Object.entries(roleFilters)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
    : ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc'];

  /** Số ca tối đa cùng lúc của `person` (vị trí `role`) trong khoảng chồng lấn [from, to) */
  const maxConcurrent = (role: string, person: string, from: number, to: number): number => {
    const own = entries
      .filter((e) => e.staff?.[role]?.trim() === person)
      .map((e) => intervals.get(e.id)!)
      .filter(([s, e]) => s < to && from < e);
    const points = [from, ...own.map(([s]) => s).filter((s) => s >= from && s < to)];
    return Math.max(...points.map((p) => own.filter(([s, e]) => s <= p && p < e).length));
  };

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const [aStart, aEnd] = intervals.get(a.id)!;
      const [bStart, bEnd] = intervals.get(b.id)!;

      // Chỉ check nếu trùng thời gian
      if (!(aStart < bEnd && bStart < aEnd)) continue;

      // 1. Check trùng máy
      if (a.machineCode && b.machineCode && a.machineCode === b.machineCode) {
        conflicts.push({
          type: 'MACHINE',
          description: `Máy "${a.machineName}" bị trùng giữa ca ${a.patientName} (${a.startTime}–${a.endTime}) và ca ${b.patientName} (${b.startTime}–${b.endTime})`,
          surgeryIds: [a.id, b.id],
          resource: a.machineName || a.machineCode,
        });
      }

      // 2. Check trùng nhân sự (so cùng vị trí, chỉ khi vượt định mức)
      const overlapFrom = Math.max(aStart, bStart);
      const overlapTo = Math.min(aEnd, bEnd);
      for (const role of rolesToCheck) {
        const personA = a.staff?.[role]?.trim();
        const personB = b.staff?.[role]?.trim();
        if (!personA || personA !== personB) continue;

        const limit = Math.max(roleLimits?.[role] ?? 1, 1);
        if (limit > 1 && maxConcurrent(role, personA, overlapFrom, overlapTo) <= limit) continue;

        const alreadyExists = conflicts.some(
          (c) =>
            c.type === 'STAFF' &&
            c.resource === personA &&
            c.surgeryIds.includes(a.id) &&
            c.surgeryIds.includes(b.id)
        );
        if (!alreadyExists) {
          conflicts.push({
            type: 'STAFF',
            description: limit > 1
              ? `${personA} tham gia quá ${limit} ca cùng lúc: ${a.patientName} (${a.startTime}–${a.endTime}) và ${b.patientName} (${b.startTime}–${b.endTime})`
              : `${personA} tham gia 2 ca trùng giờ: ${a.patientName} (${a.startTime}–${a.endTime}) và ${b.patientName} (${b.startTime}–${b.endTime})`,
            surgeryIds: [a.id, b.id],
            resource: personA,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Lấy danh sách ID các ca bị xung đột.
 */
export function getConflictedSurgeryIds(conflicts: ScheduleConflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    ids.add(c.surgeryIds[0]);
    ids.add(c.surgeryIds[1]);
  }
  return ids;
}
