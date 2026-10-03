/**
 * Schedule Conflict Detection
 * Phát hiện xung đột trùng máy và trùng nhân sự giữa các ca mổ.
 */
import type { ScheduledSurgery, ScheduleConflict } from '../types/schedule';
import type { RoleFilterConfig } from '../contexts/ConfigContext';

/** Kiểm tra 2 khoảng thời gian có overlap không */
function timeOverlaps(
  s1Start: string, s1End: string,
  s2Start: string, s2End: string,
): boolean {
  // Convert "HH:mm" to minutes since midnight
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const a1 = toMin(s1Start), a2 = toMin(s1End);
  const b1 = toMin(s2Start), b2 = toMin(s2End);

  // Overlap if one starts before the other ends
  return a1 < b2 && b1 < a2;
}

/**
 * Phát hiện tất cả xung đột trong danh sách ca mổ ngày đó.
 *
 * @param entries Danh sách ca mổ trong ngày
 * @param roleFilters Config vị trí cần check (từ AppConfig)
 * @returns Danh sách xung đột
 */
export function detectConflicts(
  entries: ScheduledSurgery[],
  roleFilters?: RoleFilterConfig,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  if (entries.length < 2) return conflicts;

  // Check từng cặp ca
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      // Chỉ check nếu trùng thời gian
      if (!timeOverlaps(a.startTime, a.endTime, b.startTime, b.endTime)) {
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
