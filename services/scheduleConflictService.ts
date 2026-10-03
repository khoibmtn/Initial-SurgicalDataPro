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
  
  const clean = t.replace(/[^\d:]/g, '').trim();
  const [h, m] = clean.split(':').map(Number);
  let hour = (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m) / 60;
  
  if (isExplicitNextDay) {
    return hour + 24;
  }
  if (!isExplicitTodayEarly && hour < dutyStartHour) {
    return hour + 24;
  }
  return hour;
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

/**
 * Phát hiện tất cả xung đột trong danh sách ca mổ ngày đó.
 *
 * @param entries Danh sách ca mổ trong ngày
 * @param roleFilters Config vị trí cần check (từ AppConfig)
 * @param dutyStartHour Giờ bắt đầu ca trực hành chính (7.5 mùa đông, 7.0 mùa hè)
 * @returns Danh sách xung đột
 */
export function detectConflicts(
  entries: ScheduledSurgery[],
  roleFilters?: RoleFilterConfig,
  dutyStartHour: number = 7.5,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  if (entries.length < 2) return conflicts;

  // Check từng cặp ca
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      // Chỉ check nếu trùng thời gian
      if (!timeOverlaps(a.startTime, a.endTime, b.startTime, b.endTime, dutyStartHour)) {
        continue;
      }

      // 1. Check trùng máy
      if (
        a.machineCode && b.machineCode &&
        a.machineCode === b.machineCode
      ) {
        conflicts.push({
          type: 'MACHINE',
          description: `Máy "${a.machineName}" bị trùng giữa ca ${a.patientName} (${a.startTime}–${a.endTime}) và ca ${b.patientName} (${b.startTime}–${b.endTime})`,
          surgeryIds: [a.id, b.id],
          resource: a.machineName || a.machineCode,
        });
      }

      // 2. Check trùng nhân sự (chỉ check các vị trí có trong roleFilters)
      const rolesToCheck = roleFilters
        ? Object.entries(roleFilters)
            .filter(([, enabled]) => enabled)
            .map(([key]) => key)
        : ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc'];

      for (const role of rolesToCheck) {
        const personA = a.staff?.[role]?.trim();
        const personB = b.staff?.[role]?.trim();

        if (personA && personB && personA === personB) {
          // Check xem đã có conflict này chưa (avoid duplicate)
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
              description: `${personA} tham gia 2 ca trùng giờ: ${a.patientName} (${a.startTime}–${a.endTime}) và ${b.patientName} (${b.startTime}–${b.endTime})`,
              surgeryIds: [a.id, b.id],
              resource: personA,
            });
          }
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
