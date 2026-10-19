import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, Clock, Cpu, User, Users, ZoomIn, ZoomOut,
  MoveHorizontal, MoveVertical, GripVertical, Lock,
} from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import type { ScheduledSurgery, ScheduleConflict } from '../../types/schedule';
import { STAFF_ROLE_LABELS, getOrderedStaffEntries } from '../../types/schedule';
import type { WorkingHours, SeasonSchedule, RoleFilterConfig } from '../../contexts/ConfigContext';
import { getScheduleForDate, getSeasonForDate } from '../../services/overtimeCalculationService';
import {
  parseTimeToShiftHours,
  formatDisplayTime,
  detectConflicts,
  getConflictedSurgeryIds,
} from '../../services/scheduleConflictService';

export type ZoomLevel = 40 | 60 | 80 | 120 | 180;
export type TimelineOrientation = 'horizontal' | 'vertical';

interface DayTimelineViewProps {
  entries: ScheduledSurgery[];
  conflictedIds: Set<string>;
  conflicts: ScheduleConflict[];
  onEntryClick: (entry: ScheduledSurgery) => void;
  /** Callback khi người dùng kéo thả khối ca mổ tới thời gian mới */
  onEntryTimeChange?: (entry: ScheduledSurgery, newStartTime: string, newEndTime: string) => void | Promise<void>;
  roleFilters?: RoleFilterConfig;
  roleLimits?: Record<string, number>;
  currentUserId?: string;
  /** Pixels per hour for horizontal mode */
  hourWidth?: ZoomLevel;
  onZoomChange?: (zoom: ZoomLevel) => void;
  /** Layout orientation: horizontal (Ngang ↔) or vertical (Dọc ↕) */
  orientation?: TimelineOrientation;
  onOrientationChange?: (orientation: TimelineOrientation) => void;
  /** Bật/tắt hiển thị danh sách kíp mổ (Vị trí: Họ tên) trong card */
  showStaff?: boolean;
  onShowStaffChange?: (show: boolean) => void;
  /** Bật/tắt chế độ rút gọn vị trí & họ tên kíp mổ (VD: PTC: NTT Hương) */
  shortStaffName?: boolean;
  onShortStaffNameChange?: (short: boolean) => void;
  selectedDate?: string;
  workingHours?: WorkingHours;
}

// Horizontal metrics
const H_BAR_HEIGHT = 68;
const H_BAR_GAP = 8;
const H_HEADER_HEIGHT = 34;
const H_LEFT_GUTTER = 56;

/**
 * Tính toán chiều cao card tự động co giãn theo số dòng vị trí kíp mổ và độ dài chuỗi ký tự
 * ứng với chiều ngang hiện tại của card trên timeline.
 */
export function estimateHorizontalCardHeight(
  entry: Pick<ScheduledSurgery, 'staff' | 'patientName' | 'tenKT'>,
  cardWidth: number,
  showStaff: boolean,
  conflictBadgeCount: number = 0,
  shortStaffName: boolean = false
): number {
  if (!showStaff) return H_BAR_HEIGHT;
  const staffItems = getOrderedStaffEntries(entry.staff);
  if (staffItems.length === 0) return H_BAR_HEIGHT;

  const innerWidth = Math.max(cardWidth - 20, 28);
  const charsPerLine = Math.max(5, Math.floor((innerWidth * 0.86) / 5.4));

  // Chiều cao phần đầu card (Họ tên BN + Giờ mổ + Tên kỹ thuật / Badge xung đột)
  const baseHeight = 56 + (conflictBadgeCount > 1 ? (conflictBadgeCount - 1) * 16 : 0);

  let staffLinesHeight = 0;
  for (const item of staffItems) {
    const label = shortStaffName ? item.roleShortLabel : item.roleLabel;
    const name = shortStaffName ? item.shortName : item.name;
    const fullText = `${label}: ${name}`;
    const wrappedLines = Math.max(1, Math.ceil(fullText.length / charsPerLine));
    staffLinesHeight += wrappedLines * 14 + 2;
  }

  // +10px cho đường kẻ phân cách (border-t + padding)
  return Math.max(H_BAR_HEIGHT, Math.ceil(baseHeight + 10 + staffLinesHeight));
}

// Vertical zoom levels
const V_ZOOM_LEVELS = [24, 34, 48, 68, 92, 124];
const V_ZOOM_LABELS: Record<number, string> = {
  24: 'Siêu nhỏ',
  34: 'Rất nhỏ',
  48: 'Thu nhỏ',
  68: 'Chuẩn',
  92: 'Rộng',
  124: 'Chi tiết',
};

const ZOOM_LEVELS: ZoomLevel[] = [40, 60, 80, 120, 180];
const ZOOM_LABELS: Record<ZoomLevel, string> = {
  40: 'Cả ngày',
  60: '2h',
  80: '1.5h',
  120: '1h',
  180: '30m',
};

function formatRange(start: string, end: string): string {
  return `${formatDisplayTime(start)} – ${formatDisplayTime(end)}`;
}

function formatTickLabel(shiftH: number): string {
  const normalizedH = ((shiftH % 24) + 24) % 24;
  let h = Math.floor(normalizedH);
  let m = Math.round((normalizedH - h) * 60);
  if (m === 60) { h = (h + 1) % 24; m = 0; }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Tính giờ bắt đầu và kết thúc mới khi kéo thả theo bước nhảy 1 phút.
 * Giữ nguyên thời lượng ca mổ và giới hạn trong khung ca trực 24h.
 */
export function computeDraggedTimes(
  entry: Pick<ScheduledSurgery, 'startTime' | 'endTime'>,
  deltaPx: number,
  pxPerHour: number,
  dutyStartHour: number = 7.5
): { startTime: string; endTime: string } {
  const origStartShift = parseTimeToShiftHours(entry.startTime, dutyStartHour);
  let origEndShift = parseTimeToShiftHours(entry.endTime, dutyStartHour);
  if (origEndShift <= origStartShift) origEndShift += 24;

  const durationMins = Math.max(1, Math.round((origEndShift - origStartShift) * 60));
  const origStartOffsetMins = Math.round((origStartShift - dutyStartHour) * 60);
  const deltaMins = pxPerHour > 0 ? Math.round((deltaPx / pxPerHour) * 60) : 0;

  const minOffset = Math.min(0, origStartOffsetMins);
  const maxOffset = Math.max(1440 - durationMins, origStartOffsetMins);
  const newStartOffsetMins = Math.max(minOffset, Math.min(maxOffset, origStartOffsetMins + deltaMins));
  const newEndOffsetMins = newStartOffsetMins + durationMins;

  const dutyStartTotalMins = Math.round(dutyStartHour * 60);

  const formatOffset = (offsetMins: number, isEnd: boolean): string => {
    const clockMins = (((dutyStartTotalMins + offsetMins) % 1440) + 1440) % 1440;
    const hh = Math.floor(clockMins / 60).toString().padStart(2, '0');
    const mm = (clockMins % 60).toString().padStart(2, '0');
    if (isEnd && offsetMins >= 1440 && clockMins >= dutyStartTotalMins) {
      return `${hh}:${mm} (+1)`;
    }
    return `${hh}:${mm}`;
  };

  return {
    startTime: formatOffset(newStartOffsetMins, false),
    endTime: formatOffset(newEndOffsetMins, true),
  };
}

/**
 * Assign horizontal lanes:
 * - Các khối tĩnh được xếp trước theo giờ bắt đầu (first-fit greedy).
 * - Các khối vừa kéo thả (`movedOrder`) được xếp sau theo quy tắc:
 *   + Nếu đến khoảng thời gian trống (không giao thoa ca nào) -> tự xếp lên sát timeline (Lane 0).
 *   + Nếu giao thoa với các ca đã có -> bị đẩy xuống dưới cùng (`maxOverlappingLane + 1`).
 */
export function assignLanes(
  entries: ScheduledSurgery[],
  dutyStartHour: number,
  movedOrder: string[] = []
): Map<string, number> {
  const movedSet = new Set(movedOrder);
  const staticEntries = entries
    .filter((e) => !movedSet.has(e.id))
    .sort((a, b) => {
      const sA = parseTimeToShiftHours(a.startTime, dutyStartHour);
      const sB = parseTimeToShiftHours(b.startTime, dutyStartHour);
      return sA - sB;
    });

  const entryById = new Map(entries.map((e) => [e.id, e]));
  const movedEntries = movedOrder
    .map((id) => entryById.get(id))
    .filter((e): e is ScheduledSurgery => Boolean(e));

  const placed: { id: string; start: number; end: number; lane: number }[] = [];
  const laneMap = new Map<string, number>();

  for (const entry of staticEntries) {
    const start = parseTimeToShiftHours(entry.startTime, dutyStartHour);
    let end = parseTimeToShiftHours(entry.endTime, dutyStartHour);
    if (end <= start) end += 24;

    let assignedLane = 0;
    while (
      placed.some((p) => p.lane === assignedLane && start < p.end && p.start < end)
    ) {
      assignedLane++;
    }
    placed.push({ id: entry.id, start, end, lane: assignedLane });
    laneMap.set(entry.id, assignedLane);
  }

  for (const entry of movedEntries) {
    const start = parseTimeToShiftHours(entry.startTime, dutyStartHour);
    let end = parseTimeToShiftHours(entry.endTime, dutyStartHour);
    if (end <= start) end += 24;

    const overlapping = placed.filter((p) => start < p.end && p.start < end);
    const assignedLane =
      overlapping.length === 0
        ? 0
        : Math.max(...overlapping.map((p) => p.lane)) + 1;

    placed.push({ id: entry.id, start, end, lane: assignedLane });
    laneMap.set(entry.id, assignedLane);
  }

  return laneMap;
}

export interface VerticalLayoutEntry {
  entry: ScheduledSurgery;
  startHours: number;
  endHours: number;
  col: number;
  totalCols: number;
}

/** Compute vertical columns for overlapping clusters (with movedOrder priority) */
export function computeVerticalLayout(
  entries: ScheduledSurgery[],
  dutyStartHour: number,
  movedOrder: string[] = []
): {
  items: VerticalLayoutEntry[];
  maxConcurrentCols: number;
} {
  if (entries.length === 0) return { items: [], maxConcurrentCols: 1 };

  const parsed = entries.map((entry) => {
    const start = parseTimeToShiftHours(entry.startTime, dutyStartHour);
    let end = parseTimeToShiftHours(entry.endTime, dutyStartHour);
    if (end <= start) end += 24;
    return { entry, start, end };
  });

  parsed.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

  const clusters: { entry: ScheduledSurgery; start: number; end: number }[][] = [];
  let currentCluster: { entry: ScheduledSurgery; start: number; end: number }[] = [];
  let clusterEnd = -1;

  for (const item of parsed) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.end;
    } else if (item.start < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.end;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const movedRank = new Map(movedOrder.map((id, idx) => [id, idx]));
  const items: VerticalLayoutEntry[] = [];
  let maxConcurrentCols = 1;

  for (const cluster of clusters) {
    const staticItems = cluster.filter((c) => !movedRank.has(c.entry.id));
    const movedItems = cluster
      .filter((c) => movedRank.has(c.entry.id))
      .sort((a, b) => (movedRank.get(a.entry.id) ?? 0) - (movedRank.get(b.entry.id) ?? 0));

    const placed: { id: string; start: number; end: number; col: number }[] = [];
    const entryCols = new Map<string, number>();

    for (const item of staticItems) {
      let assignedCol = 0;
      while (
        placed.some((p) => p.col === assignedCol && item.start < p.end && p.start < item.end)
      ) {
        assignedCol++;
      }
      placed.push({ id: item.entry.id, start: item.start, end: item.end, col: assignedCol });
      entryCols.set(item.entry.id, assignedCol);
    }

    for (const item of movedItems) {
      const overlapping = placed.filter((p) => item.start < p.end && p.start < item.end);
      const assignedCol =
        overlapping.length === 0
          ? 0
          : Math.max(...overlapping.map((p) => p.col)) + 1;
      placed.push({ id: item.entry.id, start: item.start, end: item.end, col: assignedCol });
      entryCols.set(item.entry.id, assignedCol);
    }

    let maxColInCluster = 0;
    entryCols.forEach((col) => {
      if (col > maxColInCluster) maxColInCluster = col;
    });
    const totalCols = Math.max(maxColInCluster + 1, 1);
    if (totalCols > maxConcurrentCols) maxConcurrentCols = totalCols;

    for (const item of cluster) {
      items.push({
        entry: item.entry,
        startHours: item.start,
        endHours: item.end,
        col: entryCols.get(item.entry.id) ?? 0,
        totalCols,
      });
    }
  }

  return { items, maxConcurrentCols };
}

// Adaptive styling rules for Vertical Timeline based on zoom level
function getVerticalZoomConfig(hourHeight: number) {
  if (hourHeight <= 28) {
    return {
      gutterWidth: 40,
      gutterText: 'text-[8px] font-bold',
      radiusClass: 'rounded-sm',
      paddingClass: 'p-0.5 px-1',
      timeTextClass: 'text-[8px] font-bold leading-none',
      nameTextClass: 'text-[8px] font-bold leading-none truncate',
      procTextClass: 'hidden',
      badgeClass: 'text-[7px] px-1 py-0 rounded',
      iconSize: 8,
      laneGap: 2,
      baseCardWidth: 160,
      minColWidth: 70,
    };
  }
  if (hourHeight <= 38) {
    return {
      gutterWidth: 44,
      gutterText: 'text-[8.5px] font-bold',
      radiusClass: 'rounded-md',
      paddingClass: 'p-1.5 px-2',
      timeTextClass: 'text-[9px] font-bold leading-tight',
      nameTextClass: 'text-[10px] font-bold leading-tight truncate',
      procTextClass: 'hidden',
      badgeClass: 'text-[8px] px-1 py-0 rounded',
      iconSize: 9,
      laneGap: 4,
      baseCardWidth: 205,
      minColWidth: 100,
    };
  }
  if (hourHeight <= 52) {
    return {
      gutterWidth: 48,
      gutterText: 'text-[9px] sm:text-[10px] font-bold',
      radiusClass: 'rounded-lg',
      paddingClass: 'p-1.5 sm:p-2',
      timeTextClass: 'text-[9px] sm:text-[10px] font-bold leading-tight',
      nameTextClass: 'text-[10px] sm:text-[11px] font-bold leading-tight truncate',
      procTextClass: 'text-[8.5px] sm:text-[9.5px] text-gray-600 truncate mt-0.5 leading-tight',
      badgeClass: 'text-[7.5px] sm:text-[8px] px-1.5 py-0.5 rounded',
      iconSize: 10,
      laneGap: 4,
      baseCardWidth: 240,
      minColWidth: 110,
    };
  }
  if (hourHeight <= 75) {
    return {
      gutterWidth: 52,
      gutterText: 'text-[10px] font-bold',
      radiusClass: 'rounded-xl',
      paddingClass: 'p-2 sm:p-2.5',
      timeTextClass: 'text-[10px] sm:text-[11px] font-bold leading-tight',
      nameTextClass: 'text-xs sm:text-sm font-bold leading-tight truncate',
      procTextClass: 'text-[9.5px] sm:text-[11px] text-gray-600 truncate mt-0.5 leading-tight',
      badgeClass: 'text-[8.5px] sm:text-[9px] px-1.5 py-0.5 rounded',
      iconSize: 11,
      laneGap: 5,
      baseCardWidth: 270,
      minColWidth: 120,
    };
  }
  return {
    gutterWidth: 56,
    gutterText: 'text-[11px] font-bold',
    radiusClass: 'rounded-xl',
    paddingClass: 'p-2.5 sm:p-3',
    timeTextClass: 'text-xs font-bold leading-tight',
    nameTextClass: 'text-sm font-bold leading-snug truncate',
    procTextClass: 'text-xs text-gray-600 truncate mt-1 leading-tight',
    badgeClass: 'text-[10px] px-2 py-0.5 rounded',
    iconSize: 12,
    laneGap: 6,
    baseCardWidth: 300,
    minColWidth: 130,
  };
}

// Clean, simplified color palette: 1px border with clean accent edge (Strictly No Purple/Violet)
const BAR_COLORS = [
  { bg: 'bg-white', border: 'border border-gray-200 border-l-[3px] border-l-primary-600', text: 'text-gray-900' },
  { bg: 'bg-white', border: 'border border-gray-200 border-l-[3px] border-l-emerald-600', text: 'text-gray-900' },
  { bg: 'bg-white', border: 'border border-gray-200 border-l-[3px] border-l-amber-600', text: 'text-gray-900' },
  { bg: 'bg-white', border: 'border border-gray-200 border-l-[3px] border-l-sky-600', text: 'text-gray-900' },
  { bg: 'bg-white', border: 'border border-gray-200 border-l-[3px] border-l-teal-600', text: 'text-gray-900' },
  { bg: 'bg-white', border: 'border border-gray-200 border-l-[3px] border-l-rose-600', text: 'text-gray-900' },
];

export interface OffHoursInterval {
  start: number;
  end: number;
  label: string;
}

export function computeOffHoursIntervals(
  timelineStart: number,
  timelineEnd: number,
  seasonSchedule?: SeasonSchedule,
  nextSchedule?: SeasonSchedule
): OffHoursInterval[] {
  if (!seasonSchedule) return [];

  const parseH = (t?: string, defaultH = 0) => {
    if (!t) return defaultH;
    const [h, m] = t.split(':').map(Number);
    return (isNaN(h) ? 0 : h) + (isNaN(m) ? 0 : m) / 60;
  };

  const mFrom = parseH(seasonSchedule.morningFrom, 7.5);
  const mTo = parseH(seasonSchedule.morningTo, 12.0);
  const aFrom = parseH(seasonSchedule.afternoonFrom, 13.5);
  const aTo = parseH(seasonSchedule.afternoonTo, 17.0);

  const nextMFrom = 24 + parseH(nextSchedule?.morningFrom, 7.5);
  const nextMTo = 24 + parseH(nextSchedule?.morningTo, 12.0);
  const nextAFrom = 24 + parseH(nextSchedule?.afternoonFrom, 13.5);
  const nextATo = 24 + parseH(nextSchedule?.afternoonTo, 17.0);

  const intervals: OffHoursInterval[] = [];

  // 1. Sáng sớm trước giờ làm việc nếu timeline mở rộng
  if (timelineStart < mFrom) {
    intervals.push({
      start: timelineStart,
      end: mFrom,
      label: `Ngoài giờ (${formatTickLabel(timelineStart)} – ${seasonSchedule.morningFrom})`,
    });
  }

  // 2. Buổi trưa giữa ca sáng và ca chiều
  if (mTo < aFrom) {
    intervals.push({
      start: mTo,
      end: aFrom,
      label: `Nghỉ trưa (${seasonSchedule.morningTo} – ${seasonSchedule.afternoonFrom})`,
    });
  }

  // 3. Từ chiều tối (sau ca chiều) đến ca sáng hôm sau
  intervals.push({
    start: aTo,
    end: nextMFrom,
    label: `Ngoài giờ (${seasonSchedule.afternoonTo} – ${nextSchedule?.morningFrom || '07:30'})`,
  });

  // 4. Nếu timeline mở rộng qua sáng hôm sau
  if (timelineEnd > nextMTo) {
    intervals.push({
      start: nextMTo,
      end: Math.min(nextAFrom, timelineEnd),
      label: `Nghỉ trưa hôm sau (${nextSchedule?.morningTo || '12:00'} – ${nextSchedule?.afternoonFrom || '13:30'})`,
    });
  }
  if (timelineEnd > nextATo) {
    intervals.push({
      start: nextATo,
      end: timelineEnd,
      label: `Ngoài giờ hôm sau (${nextSchedule?.afternoonTo || '17:00'}...)`,
    });
  }

  return intervals;
}

export const DayTimelineView: React.FC<DayTimelineViewProps> = ({
  entries,
  conflictedIds,
  conflicts = [],
  onEntryClick,
  onEntryTimeChange,
  roleFilters,
  roleLimits,
  currentUserId,
  hourWidth = 120,
  onZoomChange,
  orientation = 'horizontal',
  onOrientationChange,
  showStaff,
  onShowStaffChange,
  shortStaffName,
  onShortStaffNameChange,
  selectedDate,
  workingHours,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerGridRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1000
  );

  // Toggle hiển thị kíp mổ (Vị trí: Họ tên) trong card
  const [internalShowStaff, setInternalShowStaff] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('surgical_timeline_show_staff') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });
  const effectiveShowStaff = showStaff !== undefined ? showStaff : internalShowStaff;

  // Toggle hiển thị tên nhân viên & vị trí dạng vắn tắt (VD: PTC: NTT Hương)
  const [internalShortStaff, setInternalShortStaff] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('surgical_timeline_short_staff') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });
  const effectiveShortStaff = shortStaffName !== undefined ? shortStaffName : internalShortStaff;

  const [measuredCardHeights, setMeasuredCardHeights] = useState<Record<string, number>>({});

  const handleToggleShowStaff = useCallback(
    (next: boolean) => {
      setInternalShowStaff(next);
      setMeasuredCardHeights({});
      try {
        localStorage.setItem('surgical_timeline_show_staff', String(next));
      } catch {
        // ignore
      }
      onShowStaffChange?.(next);
    },
    [onShowStaffChange]
  );

  const handleToggleShortStaff = useCallback(
    (next: boolean) => {
      setInternalShortStaff(next);
      setMeasuredCardHeights({});
      try {
        localStorage.setItem('surgical_timeline_short_staff', String(next));
      } catch {
        // ignore
      }
      onShortStaffNameChange?.(next);
    },
    [onShortStaffNameChange]
  );

  // Drag & Drop state
  const [movedOrder, setMovedOrder] = useState<string[]>([]);
  const [dragState, setDragState] = useState<{
    entryId: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const suppressClickRef = useRef<boolean>(false);

  // Reset moved order when date changes
  useEffect(() => {
    setMovedOrder([]);
    setDragState(null);
  }, [selectedDate]);

  // Vertical zoom: on mobile default to 48px (Thu nhỏ) so ~10h fit on phone; on desktop default to 68px (Chuẩn)
  const [vZoomIdx, setVZoomIdx] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 2 : 3
  );
  const verticalHourHeight = V_ZOOM_LEVELS[vZoomIdx];
  const zoomConfig = useMemo(() => getVerticalZoomConfig(verticalHourHeight), [verticalHourHeight]);

  // Track container width for responsive column sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const isMobile = containerWidth < 640;

  // ── Duty shift season & start hour (07:30 in winter, 07:00 in summer) ──
  const { seasonSchedule, nextSchedule, isSummer } = useMemo(() => {
    const dateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
    const nextDate = new Date(dateObj.getTime() + 86400000);
    const schedule = getScheduleForDate(dateObj, workingHours);
    const next = getScheduleForDate(nextDate, workingHours);
    const summer = getSeasonForDate(dateObj, workingHours) === 'summer';
    return { seasonSchedule: schedule, nextSchedule: next, isSummer: summer };
  }, [selectedDate, workingHours]);

  const dutyStartStr = seasonSchedule?.morningFrom || '07:30';
  const dutyStartHour = useMemo(() => {
    const [h, m] = dutyStartStr.split(':').map(Number);
    return (isNaN(h) ? 7 : h) + (isNaN(m) ? 30 : m) / 60;
  }, [dutyStartStr]);

  // Live entries during drag
  const displayEntries = useMemo(() => {
    if (!dragState) return entries;
    return entries.map((e) =>
      e.id === dragState.entryId
        ? { ...e, startTime: dragState.startTime, endTime: dragState.endTime }
        : e
    );
  }, [entries, dragState]);

  const activeConflicts = useMemo(() => {
    if (!dragState) return conflicts;
    return detectConflicts(displayEntries, roleFilters, dutyStartHour, roleLimits);
  }, [dragState, conflicts, displayEntries, roleFilters, dutyStartHour, roleLimits]);

  const activeConflictedIds = useMemo(() => {
    if (!dragState) return conflictedIds;
    return getConflictedSurgeryIds(activeConflicts);
  }, [dragState, conflictedIds, activeConflicts]);

  // ── Dynamic 24h timeline window with auto-resize if surgeries fall outside ──
  const { timelineStart, timelineEnd, totalTimelineHours } = useMemo(() => {
    const nominalStart = dutyStartHour;
    const nominalEnd = dutyStartHour + 24;

    if (displayEntries.length === 0) {
      return {
        timelineStart: nominalStart,
        timelineEnd: nominalEnd,
        totalTimelineHours: 24,
      };
    }

    let minStart = nominalStart;
    let maxEnd = nominalEnd;

    for (const e of displayEntries) {
      const s = parseTimeToShiftHours(e.startTime, dutyStartHour);
      let end = parseTimeToShiftHours(e.endTime, dutyStartHour);
      if (end <= s) end += 24;
      if (s < minStart) minStart = s;
      if (end > maxEnd) maxEnd = end;
    }

    // Auto-resize timeline boundary to accommodate earlier or later scheduled cases
    const actualStart = Math.min(nominalStart, Math.floor(minStart));
    const actualEnd = Math.max(nominalEnd, Math.ceil(maxEnd));

    return {
      timelineStart: actualStart,
      timelineEnd: actualEnd,
      totalTimelineHours: Math.max(actualEnd - actualStart, 24),
    };
  }, [displayEntries, dutyStartHour]);

  // ── Off-hours intervals (Ngoài giờ hành chính) across timeline ──
  const offHoursIntervals = useMemo(
    () => computeOffHoursIntervals(timelineStart, timelineEnd, seasonSchedule, nextSchedule),
    [timelineStart, timelineEnd, seasonSchedule, nextSchedule]
  );

  // ── Timeline tick marks across duty shift ──
  const timelineTicks = useMemo(() => {
    const ticks: {
      shiftHour: number;
      offsetHours: number;
      label: string;
      subLabel?: string;
      isDutyStart: boolean;
      isDutyEnd: boolean;
      isNextDay: boolean;
    }[] = [];

    // Fraction start (e.g. 07:30)
    if (timelineStart % 1 !== 0) {
      ticks.push({
        shiftHour: timelineStart,
        offsetHours: 0,
        label: formatTickLabel(timelineStart),
        subLabel: 'Bắt đầu trực',
        isDutyStart: true,
        isDutyEnd: false,
        isNextDay: false,
      });
    }

    const firstWhole = Math.ceil(timelineStart);
    const lastWhole = Math.floor(timelineEnd);

    for (let h = firstWhole; h <= lastWhole; h++) {
      if (Math.abs(h - timelineStart) < 0.1 || Math.abs(h - timelineEnd) < 0.1) continue;
      const isDutyStart = Math.abs(h - dutyStartHour) < 0.1;
      const isDutyEnd = Math.abs(h - (dutyStartHour + 24)) < 0.1;
      const isNextDay = h >= 24;

      ticks.push({
        shiftHour: h,
        offsetHours: h - timelineStart,
        label: formatTickLabel(h),
        subLabel: isDutyStart ? 'Bắt đầu trực' : isDutyEnd ? 'Hết trực' : undefined,
        isDutyStart,
        isDutyEnd,
        isNextDay,
      });
    }

    // Fraction end (e.g. 07:30 +1)
    if (timelineEnd % 1 !== 0) {
      ticks.push({
        shiftHour: timelineEnd,
        offsetHours: timelineEnd - timelineStart,
        label: formatTickLabel(timelineEnd),
        subLabel: 'Hết trực',
        isDutyStart: false,
        isDutyEnd: true,
        isNextDay: true,
      });
    }

    return ticks.sort((a, b) => a.shiftHour - b.shiftHour);
  }, [timelineStart, timelineEnd, dutyStartHour]);

  // Filtered ticks for horizontal & vertical views according to zoom
  const visibleTicksV = useMemo(() => {
    if (verticalHourHeight <= 28) {
      return timelineTicks.filter((t) => t.isDutyStart || t.isDutyEnd || Math.floor(t.shiftHour) % 2 === 0);
    }
    return timelineTicks;
  }, [timelineTicks, verticalHourHeight]);

  const visibleTicksH = useMemo(() => {
    const step = hourWidth <= 40 ? 3 : hourWidth <= 60 ? 2 : 1;
    if (step === 1) return timelineTicks;
    return timelineTicks.filter((t) => t.isDutyStart || t.isDutyEnd || Math.floor(t.shiftHour) % step === 0);
  }, [timelineTicks, hourWidth]);

  // Horizontal lanes (with movedOrder priority)
  const laneMap = useMemo(
    () => assignLanes(displayEntries, dutyStartHour, movedOrder),
    [displayEntries, dutyStartHour, movedOrder]
  );
  const maxLane = useMemo(() => {
    let max = 0;
    laneMap.forEach((lane) => { if (lane > max) max = lane; });
    return max;
  }, [laneMap]);

  // Vertical layout items & max concurrent columns (with movedOrder priority)
  const { items: verticalItems, maxConcurrentCols } = useMemo(
    () => computeVerticalLayout(displayEntries, dutyStartHour, movedOrder),
    [displayEntries, dutyStartHour, movedOrder]
  );

  // Pre-calculate per-entry conflict details
  const entryConflictMap = useMemo(() => {
    const map = new Map<string, {
      machineConflicts: ScheduleConflict[];
      staffConflicts: ScheduleConflict[];
      hasMachine: boolean;
      hasStaff: boolean;
      hasOverlap: boolean;
    }>();

    for (const entry of displayEntries) {
      const entryConfs = activeConflicts.filter((c) => c.surgeryIds.includes(entry.id));
      const machineConfs = entryConfs.filter((c) => c.type === 'MACHINE');
      const staffConfs = entryConfs.filter((c) => c.type === 'STAFF');

      const startA = parseTimeToShiftHours(entry.startTime, dutyStartHour);
      let endA = parseTimeToShiftHours(entry.endTime, dutyStartHour);
      if (endA <= startA) endA += 24;

      const hasOverlap = displayEntries.some((other) => {
        if (other.id === entry.id) return false;
        const startB = parseTimeToShiftHours(other.startTime, dutyStartHour);
        let endB = parseTimeToShiftHours(other.endTime, dutyStartHour);
        if (endB <= startB) endB += 24;
        return startA < endB && startB < endA;
      });

      map.set(entry.id, {
        machineConflicts: machineConfs,
        staffConflicts: staffConfs,
        hasMachine: machineConfs.length > 0,
        hasStaff: staffConfs.length > 0,
        hasOverlap,
      });
    }
    return map;
  }, [displayEntries, activeConflicts, dutyStartHour]);

  // ── Drag & Drop Handlers (Desktop Mouse & Mobile Touch-and-Hold) ──
  const getTimelinePosPx = useCallback(
    (clientX: number, clientY: number): number => {
      const rect = innerGridRef.current?.getBoundingClientRect();
      if (orientation === 'horizontal') {
        return clientX - (rect?.left ?? 0);
      }
      return clientY - (rect?.top ?? 0);
    },
    [orientation]
  );

  const autoScrollOnDrag = useCallback(
    (clientX: number, clientY: number) => {
      const EDGE_PX = 48;
      const SCROLL_STEP = 14;
      if (orientation === 'horizontal' && containerRef.current) {
        const cRect = containerRef.current.getBoundingClientRect();
        if (clientX < cRect.left + H_LEFT_GUTTER + EDGE_PX) {
          containerRef.current.scrollLeft -= SCROLL_STEP;
        } else if (clientX > cRect.right - EDGE_PX) {
          containerRef.current.scrollLeft += SCROLL_STEP;
        }
      } else if (orientation === 'vertical') {
        if (!isMobile && containerRef.current) {
          const cRect = containerRef.current.getBoundingClientRect();
          if (clientY < cRect.top + EDGE_PX) {
            containerRef.current.scrollTop -= SCROLL_STEP;
          } else if (clientY > cRect.bottom - EDGE_PX) {
            containerRef.current.scrollTop += SCROLL_STEP;
          }
        } else if (typeof window !== 'undefined') {
          if (clientY < EDGE_PX + 56) {
            window.scrollBy(0, -SCROLL_STEP);
          } else if (clientY > window.innerHeight - EDGE_PX) {
            window.scrollBy(0, SCROLL_STEP);
          }
        }
      }
    },
    [orientation, isMobile]
  );

  const handleCardMouseDown = useCallback(
    (e: React.MouseEvent, entry: ScheduledSurgery) => {
      if (!onEntryTimeChange || entry.locked || e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startTimelinePos = getTimelinePosPx(startX, startY);
      const pxPerHour = orientation === 'horizontal' ? hourWidth : verticalHourHeight;

      let isDragging = false;
      let latestTimes = { startTime: entry.startTime, endTime: entry.endTime };

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
          isDragging = true;
          suppressClickRef.current = true;
          setMovedOrder((prev) => [...prev.filter((id) => id !== entry.id), entry.id]);
        }
        ev.preventDefault();
        autoScrollOnDrag(ev.clientX, ev.clientY);
        const currentTimelinePos = getTimelinePosPx(ev.clientX, ev.clientY);
        const deltaPx = currentTimelinePos - startTimelinePos;
        latestTimes = computeDraggedTimes(entry, deltaPx, pxPerHour, dutyStartHour);
        setDragState({
          entryId: entry.id,
          startTime: latestTimes.startTime,
          endTime: latestTimes.endTime,
        });
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (isDragging) {
          if (latestTimes.startTime !== entry.startTime || latestTimes.endTime !== entry.endTime) {
            onEntryTimeChange(entry, latestTimes.startTime, latestTimes.endTime);
          }
          setDragState(null);
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 120);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onEntryTimeChange, getTimelinePosPx, orientation, hourWidth, verticalHourHeight, autoScrollOnDrag, dutyStartHour]
  );

  const handleCardTouchStart = useCallback(
    (e: React.TouchEvent, entry: ScheduledSurgery) => {
      if (!onEntryTimeChange || entry.locked || e.touches.length !== 1) return;
      const t0 = e.touches[0];
      const startX = t0.clientX;
      const startY = t0.clientY;
      let startTimelinePos = getTimelinePosPx(startX, startY);
      const pxPerHour = orientation === 'horizontal' ? hourWidth : verticalHourHeight;

      let isDragging = false;
      let latestTimes = { startTime: entry.startTime, endTime: entry.endTime };

      const longPressTimer = window.setTimeout(() => {
        isDragging = true;
        suppressClickRef.current = true;
        startTimelinePos = getTimelinePosPx(startX, startY);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(25);
          } catch {
            // ignore
          }
        }
        setMovedOrder((prev) => [...prev.filter((id) => id !== entry.id), entry.id]);
        setDragState({
          entryId: entry.id,
          startTime: entry.startTime,
          endTime: entry.endTime,
        });
      }, 220);

      const cleanup = () => {
        window.clearTimeout(longPressTimer);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
      };

      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches.length !== 1) return;
        const t = ev.touches[0];
        if (!isDragging) {
          if (Math.hypot(t.clientX - startX, t.clientY - startY) > 10) {
            cleanup();
          }
          return;
        }
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
        autoScrollOnDrag(t.clientX, t.clientY);
        const currentTimelinePos = getTimelinePosPx(t.clientX, t.clientY);
        const deltaPx = currentTimelinePos - startTimelinePos;
        latestTimes = computeDraggedTimes(entry, deltaPx, pxPerHour, dutyStartHour);
        setDragState({
          entryId: entry.id,
          startTime: latestTimes.startTime,
          endTime: latestTimes.endTime,
        });
      };

      const onTouchEnd = (ev: TouchEvent) => {
        cleanup();
        if (isDragging) {
          if (ev.cancelable) ev.preventDefault();
          ev.stopPropagation();
          if (latestTimes.startTime !== entry.startTime || latestTimes.endTime !== entry.endTime) {
            onEntryTimeChange(entry, latestTimes.startTime, latestTimes.endTime);
          }
          setDragState(null);
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 200);
        }
      };

      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd, { passive: false });
      window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    },
    [onEntryTimeChange, getTimelinePosPx, orientation, hourWidth, verticalHourHeight, autoScrollOnDrag, dutyStartHour]
  );

  const totalWidth = totalTimelineHours * hourWidth;

  // Reset chiều cao đo được khi đổi chế độ hiển thị kíp mổ hoặc tên tắt để card co lại ngay lập tức
  useEffect(() => {
    setMeasuredCardHeights((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [effectiveShowStaff, effectiveShortStaff]);

  // Đo chiều cao DOM thực tế của các card khi bật hiển thị kíp mổ để tránh đè khối
  useEffect(() => {
    if (!effectiveShowStaff) {
      return;
    }
    const gridEl = innerGridRef.current;
    if (!gridEl) return;

    const measureAll = () => {
      const nodes = gridEl.querySelectorAll<HTMLElement>('[data-card-entry-id]');
      if (nodes.length === 0) return;
      setMeasuredCardHeights((prev) => {
        let changed = false;
        const next = { ...prev };
        nodes.forEach((node) => {
          const id = node.getAttribute('data-card-entry-id');
          if (!id) return;
          const h = Math.ceil(node.offsetHeight || node.scrollHeight || 0);
          if (h > 0 && Math.abs((prev[id] || 0) - h) > 1) {
            next[id] = h;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };

    measureAll();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measureAll());
      const nodes = gridEl.querySelectorAll<HTMLElement>('[data-card-entry-id]');
      nodes.forEach((node) => ro.observe(node));
      return () => ro.disconnect();
    }
  }, [effectiveShowStaff, effectiveShortStaff, displayEntries, hourWidth, verticalHourHeight, orientation]);

  // Tính toán vị trí (left, top, width, height) động cho từng card ở chế độ Ngang
  const { horizontalCardLayout, totalHeight } = useMemo(() => {
    const layoutMap = new Map<string, { left: number; top: number; width: number; height: number }>();
    const baseTotalHeight = H_HEADER_HEIGHT + (maxLane + 1) * (H_BAR_HEIGHT + H_BAR_GAP) + 20;

    if (displayEntries.length === 0) {
      return { horizontalCardLayout: layoutMap, totalHeight: baseTotalHeight };
    }

    const prepared = displayEntries
      .map((entry) => {
        const lane = laneMap.get(entry.id) ?? 0;
        const startH = parseTimeToShiftHours(entry.startTime, dutyStartHour);
        let endH = parseTimeToShiftHours(entry.endTime, dutyStartHour);
        if (endH <= startH) endH += 24;

        const left = H_LEFT_GUTTER + (startH - timelineStart) * hourWidth;
        const width = Math.max((endH - startH) * hourWidth, 36);
        const confInfo = entryConflictMap.get(entry.id);
        const conflictBadgeCount =
          (confInfo?.machineConflicts.length || 0) + (confInfo?.staffConflicts.length || 0);
        const estimatedH = estimateHorizontalCardHeight(
          entry,
          width,
          effectiveShowStaff,
          conflictBadgeCount,
          effectiveShortStaff
        );
        const height = effectiveShowStaff
          ? Math.max(estimatedH, measuredCardHeights[entry.id] || 0)
          : H_BAR_HEIGHT;

        return { entry, lane, left, right: left + width, width, height };
      })
      .sort((a, b) => a.lane - b.lane || a.left - b.left);

    const placed: {
      id: string;
      lane: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
    let maxBottom = 0;

    for (const item of prepared) {
      let top: number;
      if (!effectiveShowStaff) {
        top = H_HEADER_HEIGHT + item.lane * (H_BAR_HEIGHT + H_BAR_GAP) + 6;
      } else if (item.lane === 0) {
        top = H_HEADER_HEIGHT + 6;
      } else {
        const overlappingAbove = placed.filter(
          (p) => p.lane < item.lane && item.left < p.right && p.left < item.right
        );
        top =
          overlappingAbove.length > 0
            ? Math.max(...overlappingAbove.map((p) => p.bottom)) + H_BAR_GAP
            : H_HEADER_HEIGHT + item.lane * (H_BAR_HEIGHT + H_BAR_GAP) + 6;
      }

      const bottom = top + item.height;
      if (bottom > maxBottom) maxBottom = bottom;

      placed.push({
        id: item.entry.id,
        lane: item.lane,
        left: item.left,
        right: item.right,
        top,
        bottom,
      });

      layoutMap.set(item.entry.id, {
        left: item.left,
        top,
        width: item.width,
        height: item.height,
      });
    }

    return {
      horizontalCardLayout: layoutMap,
      totalHeight: Math.max(baseTotalHeight, maxBottom + 20),
    };
  }, [
    displayEntries,
    maxLane,
    laneMap,
    dutyStartHour,
    timelineStart,
    hourWidth,
    entryConflictMap,
    effectiveShowStaff,
    effectiveShortStaff,
    measuredCardHeights,
  ]);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const isToday = !selectedDate || selectedDate === todayStr;
  const nowShiftHours = parseTimeToShiftHours(`${now.getHours()}:${now.getMinutes()}`, dutyStartHour);
  const nowOffsetHours = nowShiftHours - timelineStart;
  const isNowVisible = isToday && nowOffsetHours >= 0 && nowOffsetHours <= totalTimelineHours;

  // Refs to track zoom levels and scroll state to anchor view on zoom instead of jumping to current time
  const prevHourWidthRef = useRef<number>(hourWidth);
  const prevVZoomHeightRef = useRef<number>(verticalHourHeight);
  const lastScrolledKeyRef = useRef<string>('');
  const visibleCenterHourRef = useRef<number | null>(null);
  const visibleCenterVHourRef = useRef<number | null>(null);

  // Track manual scrolling to keep focal center time accurate across user interactions
  const handleHorizontalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (hourWidth > 0 && target.clientWidth > 0) {
      const centerPx = target.scrollLeft + target.clientWidth / 2;
      visibleCenterHourRef.current = (centerPx - H_LEFT_GUTTER) / hourWidth;
    }
  }, [hourWidth]);

  const handleVerticalScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (verticalHourHeight > 0 && target.clientHeight > 0) {
      const centerPx = target.scrollTop + target.clientHeight / 2;
      visibleCenterVHourRef.current = centerPx / verticalHourHeight;
    }
  }, [verticalHourHeight]);

  // Horizontal zoom controls
  const currentZoomIdx = Math.max(0, ZOOM_LEVELS.indexOf(hourWidth as ZoomLevel));
  const canZoomInH = currentZoomIdx < ZOOM_LEVELS.length - 1;
  const canZoomOutH = currentZoomIdx > 0;

  // Vertical zoom controls
  const canZoomInV = vZoomIdx < V_ZOOM_LEVELS.length - 1;
  const canZoomOutV = vZoomIdx > 0;

  const handleZoomIn = useCallback(() => {
    if (orientation === 'horizontal') {
      if (canZoomInH && onZoomChange) {
        onZoomChange(ZOOM_LEVELS[currentZoomIdx + 1]);
      }
    } else {
      if (canZoomInV) {
        setVZoomIdx((i) => Math.min(i + 1, V_ZOOM_LEVELS.length - 1));
      }
    }
  }, [orientation, canZoomInH, onZoomChange, currentZoomIdx, canZoomInV]);

  const handleZoomOut = useCallback(() => {
    if (orientation === 'horizontal') {
      if (canZoomOutH && onZoomChange) {
        onZoomChange(ZOOM_LEVELS[currentZoomIdx - 1]);
      }
    } else {
      if (canZoomOutV) {
        setVZoomIdx((i) => Math.max(i - 1, 0));
      }
    }
  }, [orientation, canZoomOutH, onZoomChange, currentZoomIdx, canZoomOutV]);

  // Keyboard shortcuts: '+' (or '=') to zoom in, '-' (or '_') to zoom out
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept browser page zoom shortcuts like Ctrl/Cmd + / -
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Ignore if user is currently typing in an input, textarea, or select
      const target = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable) ||
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        Boolean((activeEl as HTMLElement)?.isContentEditable);

      if (isInput) return;

      // Do not zoom if a modal/dialog overlay is open
      if (document.querySelector('[role="dialog"], .fixed.inset-0.z-\\[9000\\], .fixed.inset-0.z-50')) {
        return;
      }

      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut]);

  // Auto-scroll on mount/date change AND anchor view position on zoom
  useEffect(() => {
    if (!containerRef.current) return;

    const currentKey = `${selectedDate || 'today'}_${orientation}`;
    const isNewContext = lastScrolledKeyRef.current !== currentKey;

    if (isNewContext) {
      lastScrolledKeyRef.current = currentKey;
      prevHourWidthRef.current = hourWidth;
      prevVZoomHeightRef.current = verticalHourHeight;

      if (orientation === 'horizontal') {
        const scrollOffset = isNowVisible ? nowOffsetHours : (dutyStartHour - timelineStart);
        const scrollTo = Math.max(scrollOffset * hourWidth - 100, 0);
        containerRef.current.scrollLeft = scrollTo;
        const centerPx = scrollTo + containerRef.current.clientWidth / 2;
        visibleCenterHourRef.current = (centerPx - H_LEFT_GUTTER) / hourWidth;
      } else if (!isMobile) {
        let targetHour = dutyStartHour;
        if (entries.length > 0) {
          const minH = Math.min(...entries.map((e) => parseTimeToShiftHours(e.startTime, dutyStartHour)));
          targetHour = Math.max(minH - 0.5, timelineStart);
        } else if (isNowVisible) {
          targetHour = Math.max(nowShiftHours - 1, timelineStart);
        }
        const scrollTop = Math.max((targetHour - timelineStart) * verticalHourHeight, 0);
        containerRef.current.scrollTop = scrollTop;
        const centerPx = scrollTop + containerRef.current.clientHeight / 2;
        visibleCenterVHourRef.current = centerPx / verticalHourHeight;
      }
      return;
    }

    // Context is the same -> check if ZOOM changed and keep user's current visible center anchored!
    if (orientation === 'horizontal') {
      const oldHourWidth = prevHourWidthRef.current;
      const newHourWidth = hourWidth;
      if (oldHourWidth > 0 && oldHourWidth !== newHourWidth && containerRef.current) {
        const container = containerRef.current;
        const centerHourOffset =
          visibleCenterHourRef.current !== null
            ? visibleCenterHourRef.current
            : (container.scrollLeft + container.clientWidth / 2 - H_LEFT_GUTTER) / oldHourWidth;

        const newCenterPx = H_LEFT_GUTTER + centerHourOffset * newHourWidth;
        const newScrollLeft = Math.max(newCenterPx - container.clientWidth / 2, 0);
        container.scrollLeft = newScrollLeft;
        visibleCenterHourRef.current = centerHourOffset;
      }
      prevHourWidthRef.current = newHourWidth;
    } else if (!isMobile) {
      const oldVHeight = prevVZoomHeightRef.current;
      const newVHeight = verticalHourHeight;
      if (oldVHeight > 0 && oldVHeight !== newVHeight && containerRef.current) {
        const container = containerRef.current;
        const centerHourOffset =
          visibleCenterVHourRef.current !== null
            ? visibleCenterVHourRef.current
            : (container.scrollTop + container.clientHeight / 2) / oldVHeight;

        const newCenterPx = centerHourOffset * newVHeight;
        const newScrollTop = Math.max(newCenterPx - container.clientHeight / 2, 0);
        container.scrollTop = newScrollTop;
        visibleCenterVHourRef.current = centerHourOffset;
      }
      prevVZoomHeightRef.current = newVHeight;
    }
  }, [
    orientation,
    hourWidth,
    verticalHourHeight,
    isMobile,
    dutyStartHour,
    timelineStart,
    isNowVisible,
    nowOffsetHours,
    nowShiftHours,
    selectedDate,
    entries,
  ]);

  const tooltipContent = (entry: ScheduledSurgery) => {
    const staffEntries = Object.entries(entry.staff || {}).filter(([, v]) => v);
    const confInfo = entryConflictMap.get(entry.id);
    return (
      <div className="space-y-1.5 text-[11px] min-w-[220px]">
        {entry.locked && (
          <div className="bg-amber-500/20 border border-amber-400/50 rounded p-1.5 text-[10px] text-amber-200 font-bold flex items-center gap-1">
            <Lock size={11} className="shrink-0 text-amber-300" />
            <span>Đã khóa chỉnh sửa{entry.lockedByName ? ` (${entry.lockedByName})` : ''}</span>
          </div>
        )}
        {confInfo && (confInfo.hasMachine || confInfo.hasStaff) && (
          <div className="bg-red-500/20 border border-red-400/40 rounded p-1.5 text-[10px] space-y-1">
            <div className="font-bold text-red-300 flex items-center gap-1">
              <AlertTriangle size={11} /> Cảnh báo xung đột:
            </div>
            {confInfo.machineConflicts.map((c, i) => (
              <div key={`m-${i}`} className="text-red-200">
                • Trùng máy: <span className="font-bold">{c.resource}</span>
              </div>
            ))}
            {confInfo.staffConflicts.map((c, i) => (
              <div key={`s-${i}`} className="text-blue-200">
                • Trùng nhân sự: <span className="font-bold">{c.resource}</span>
              </div>
            ))}
          </div>
        )}
        <div className="font-bold text-white/90 text-xs">
          {entry.patientName} {entry.patientId ? `(${entry.patientId})` : ''}
        </div>
        <div className="text-white/70">{entry.tenKT}</div>
        <div className="flex items-center gap-1 text-primary-300 font-semibold">
          <Clock size={10} />
          {formatRange(entry.startTime, entry.endTime)}
        </div>
        {entry.machineName && (
          <div className="flex items-center gap-1 text-emerald-300">
            <Cpu size={10} />
            {entry.machineName}
          </div>
        )}
        {staffEntries.length > 0 && (
          <div className="border-t border-white/20 pt-1 mt-1 space-y-0.5">
            {staffEntries.map(([role, name]) => (
              <div key={role} className="flex items-center gap-1 text-white/70">
                <User size={10} />
                <span className="text-white/50">{STAFF_ROLE_LABELS[role] || role}:</span>
                <span className="text-white/90">{name}</span>
              </div>
            ))}
          </div>
        )}
        {entry.note && (
          <div className="border-t border-white/20 pt-1 mt-1 text-white/60 italic">
            {entry.note}
          </div>
        )}
        <div className="text-[10px] text-white/40 pt-0.5">
          Đăng ký bởi: {entry.createdByName}
        </div>
      </div>
    );
  };

  // Card theme helper: Machine = RED, Staff = BLUE (distinct colors, strict purple ban)
  const getCardTheme = (entry: ScheduledSurgery, idx: number) => {
    const isConflicted = activeConflictedIds.has(entry.id);
    const confInfo = entryConflictMap.get(entry.id);
    const hasMachine = confInfo?.hasMachine;
    const hasStaff = confInfo?.hasStaff;

    let color = BAR_COLORS[idx % BAR_COLORS.length];
    if (hasMachine && hasStaff) {
      color = { bg: 'bg-rose-50/80', border: 'border border-rose-300 border-l-3 sm:border-l-4 border-l-rose-600', text: 'text-rose-950' };
    } else if (hasMachine) {
      // Trùng máy: Đỏ
      color = { bg: 'bg-red-50/80', border: 'border border-red-300 border-l-3 sm:border-l-4 border-l-red-600', text: 'text-red-950' };
    } else if (hasStaff) {
      // Trùng nhân sự: Xanh dương (phân biệt rõ ràng với đỏ, không dùng tím)
      color = { bg: 'bg-blue-50/80', border: 'border border-blue-300 border-l-3 sm:border-l-4 border-l-blue-600', text: 'text-blue-950' };
    } else if (isConflicted) {
      color = { bg: 'bg-amber-50/80', border: 'border border-amber-300 border-l-3 sm:border-l-4 border-l-amber-500', text: 'text-amber-950' };
    }

    return { color, isConflicted, confInfo, hasMachine, hasStaff };
  };

  // Responsive column calculation
  const effectiveGutter = isMobile ? 40 : zoomConfig.gutterWidth;
  const availableGridWidth = Math.max(containerWidth - effectiveGutter - (isMobile ? 6 : 18), 180);
  const totalColsNeeded = Math.max(maxConcurrentCols, 1);
  const laneGap = isMobile ? 2.5 : zoomConfig.laneGap;

  const calculatedColWidth = isMobile
    ? Math.floor((availableGridWidth - (totalColsNeeded - 1) * laneGap) / totalColsNeeded)
    : Math.min(
        Math.max(
          Math.floor((availableGridWidth - (totalColsNeeded - 1) * laneGap) / totalColsNeeded),
          zoomConfig.minColWidth
        ),
        zoomConfig.baseCardWidth
      );

  const totalGridWidth = isMobile
    ? '100%'
    : Math.max(effectiveGutter + totalColsNeeded * (calculatedColWidth + laneGap) + 24, containerWidth);

  return (
    <div className="relative border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
      {/* ── Toolbar: Orientation Switcher + Staff Toggle + Zoom Controls ── */}
      <div className="flex items-center justify-between px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-gray-200 bg-gray-50/90 text-xs gap-2 flex-wrap">
        {/* Orientation Switcher & Staff Display Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="text-[11px] font-semibold text-gray-500 hidden sm:inline">Bố trí:</span>
            <div className="flex items-center bg-white p-0.5 rounded-lg border border-gray-200 shadow-2xs">
              <button
                onClick={() => onOrientationChange?.('horizontal')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  orientation === 'horizontal'
                    ? 'bg-primary-700 text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Dòng thời gian nằm ngang (Horizontal)"
              >
                <MoveHorizontal size={13} />
                <span>Ngang</span>
              </button>
              <button
                onClick={() => onOrientationChange?.('vertical')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  orientation === 'vertical'
                    ? 'bg-primary-700 text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Dòng thời gian thẳng đứng (Vertical - Google Calendar style)"
              >
                <MoveVertical size={13} />
                <span>Dọc</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            data-testid="timeline-toggle-staff"
            aria-pressed={effectiveShowStaff}
            onClick={() => handleToggleShowStaff(!effectiveShowStaff)}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer shadow-2xs ${
              effectiveShowStaff
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-800'
            }`}
            title={
              effectiveShowStaff
                ? 'Đang hiển thị kíp mổ trên card (nhấn để ẩn)'
                : 'Bật hiển thị tên & vị trí kíp mổ trên từng card'
            }
          >
            <Users size={13} />
            <span>Kíp mổ</span>
          </button>

          {effectiveShowStaff && (
            <button
              type="button"
              data-testid="timeline-toggle-short-staff"
              aria-pressed={effectiveShortStaff}
              onClick={() => handleToggleShortStaff(!effectiveShortStaff)}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer shadow-2xs ${
                effectiveShortStaff
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-800'
              }`}
              title={
                effectiveShortStaff
                  ? 'Đang hiển thị tên & vị trí rút gọn (VD: PTC: NTT Hương) — nhấn để hiện đầy đủ'
                  : 'Bật hiển thị tên & vị trí vắn tắt (VD: PTC: NTT Hương)'
              }
            >
              <span className="text-[10px] font-extrabold px-1 py-0.2 rounded bg-black/10 leading-none">
                {effectiveShortStaff ? 'Tắt' : 'Đủ'}
              </span>
              <span>Tên tắt</span>
            </button>
          )}
        </div>

        {/* Duty shift window badge & Season indicator */}
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded-md border border-gray-200/60 flex-wrap">
          <Clock size={11} className="text-primary-600" />
          <span>Tua trực: <strong className="text-gray-800">{dutyStartStr}</strong> đến <strong className="text-gray-800">{formatTickLabel(dutyStartHour - 1 / 60)}</strong></span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold text-[9px] bg-amber-100/90 text-amber-900 border border-amber-300/60 shadow-2xs">
            <span>{isSummer ? '☀️ Mùa hè' : '❄️ Mùa đông'}</span>
            <span className="font-medium text-amber-800 text-[8.5px] hidden sm:inline">(HC: {seasonSchedule.morningFrom}–{seasonSchedule.morningTo}, {seasonSchedule.afternoonFrom}–{seasonSchedule.afternoonTo})</span>
          </span>
          {onEntryTimeChange && (
            <span className="hidden md:inline-flex items-center gap-0.5 text-[9px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/70">
              <GripVertical size={9} /> Giữ & kéo ca mổ để đổi giờ
            </span>
          )}
          {totalTimelineHours > 24 && (
            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded">Tự mở rộng ({totalTimelineHours}h)</span>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-white rounded-lg border border-gray-200 px-1 py-0.5 shadow-2xs">
          {orientation === 'horizontal' ? (
            <>
              <button
                onClick={handleZoomOut}
                disabled={!canZoomOutH || !onZoomChange}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  canZoomOutH && onZoomChange ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300'
                }`}
                title="Thu nhỏ tỉ lệ giờ (-)"
              >
                <ZoomOut size={12} />
              </button>
              <span className="text-[10px] font-bold text-gray-600 px-1 text-center min-w-9 select-none" title="Phím tắt: + phóng to, - thu nhỏ">
                {ZOOM_LABELS[hourWidth]}
              </span>
              <button
                onClick={handleZoomIn}
                disabled={!canZoomInH || !onZoomChange}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  canZoomInH && onZoomChange ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300'
                }`}
                title="Phóng to tỉ lệ giờ (+)"
              >
                <ZoomIn size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleZoomOut}
                disabled={!canZoomOutV}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  canZoomOutV ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300'
                }`}
                title="Thu nhỏ chiều cao khung giờ (-)"
              >
                <ZoomOut size={12} />
              </button>
              <span className="text-[10px] font-bold text-gray-600 px-1 text-center min-w-12 select-none" title="Phím tắt: + phóng to, - thu nhỏ">
                {V_ZOOM_LABELS[verticalHourHeight]}
              </span>
              <button
                onClick={handleZoomIn}
                disabled={!canZoomInV}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  canZoomInV ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300'
                }`}
                title="Phóng to chiều cao khung giờ (+)"
              >
                <ZoomIn size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODE 1: VERTICAL TIMELINE (DỌC ↕) ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {orientation === 'vertical' && (
        <div
          ref={containerRef}
          onScroll={handleVerticalScroll}
          className={`relative touch-pan-y ${
            isMobile
              ? 'overflow-x-hidden w-full'
              : 'overflow-y-auto overflow-x-auto max-h-[76vh] min-h-[440px]'
          }`}
        >
          <div
            ref={innerGridRef}
            className="relative w-full"
            style={{
              height: totalTimelineHours * verticalHourHeight + 36,
              minWidth: totalGridWidth,
            }}
          >
            {/* Left Time Axis Gutter */}
            <div
              className="absolute left-0 top-0 bottom-0 z-20 bg-white/95 border-r border-gray-200 select-none"
              style={{ width: effectiveGutter }}
            >
              {visibleTicksV.map((tick) => (
                <div
                  key={`vh-${tick.shiftHour}`}
                  className={`absolute text-right pr-1 sm:pr-2 w-full tabular-nums ${
                    tick.isDutyStart || tick.isDutyEnd
                      ? 'text-primary-700 font-extrabold text-[8px] sm:text-[9.5px]'
                      : tick.isNextDay
                      ? 'text-sky-700 font-medium text-[8px] sm:text-[9px]'
                      : isMobile ? 'text-[8.5px] font-semibold text-gray-400' : zoomConfig.gutterText + ' text-gray-400'
                  }`}
                  style={{ top: tick.offsetHours * verticalHourHeight - (verticalHourHeight <= 28 ? 5 : 6) }}
                  title={tick.subLabel}
                >
                  {tick.label}
                </div>
              ))}
            </div>

            {/* ── Off-Hours Background Highlights (Ngoài giờ hành chính) ── */}
            {offHoursIntervals.map((interval, idx) => {
              const s = Math.max(interval.start, timelineStart);
              const e = Math.min(interval.end, timelineEnd);
              if (e <= s) return null;
              const top = (s - timelineStart) * verticalHourHeight;
              const height = (e - s) * verticalHourHeight;

              return (
                <div
                  key={`v-off-${idx}`}
                  className="absolute right-0 bg-amber-50/70 border-t border-b border-amber-200/50 pointer-events-none z-0"
                  style={{
                    top,
                    height,
                    left: effectiveGutter,
                  }}
                >
                  <div className="absolute right-2 top-1 text-[8.5px] sm:text-[9.5px] font-bold text-amber-800/80 uppercase tracking-wide bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300/60 shadow-2xs select-none flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{interval.label}</span>
                  </div>
                </div>
              );
            })}

            {/* Horizontal Grid Lines */}
            {timelineTicks.map((tick) => (
              <div
                key={`vline-${tick.shiftHour}`}
                className={`absolute left-0 right-0 ${
                  tick.isDutyStart || tick.isDutyEnd
                    ? 'border-t-2 border-primary-200 z-10'
                    : 'border-t border-gray-100/80 z-[1]'
                }`}
                style={{ top: tick.offsetHours * verticalHourHeight, left: effectiveGutter }}
              />
            ))}

            {/* Current Time Indicator (if viewing today) */}
            {isNowVisible && (
              <div
                className="absolute right-0 border-t-2 border-red-500 z-30 pointer-events-none transition-all duration-300"
                style={{
                  top: nowOffsetHours * verticalHourHeight,
                  left: effectiveGutter - 5,
                }}
              >
                <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white shadow-xs" />
                <div className="absolute left-1.5 -top-2.5 px-1 py-0.2 bg-red-600 text-white text-[7.5px] sm:text-[8px] font-bold rounded shadow-xs">
                  {now.getHours().toString().padStart(2, '0')}:{now.getMinutes().toString().padStart(2, '0')}
                </div>
              </div>
            )}

            {/* Surgery Cards in Vertical Mode */}
            {verticalItems.map(({ entry, startHours, endHours, col }, idx) => {
              const { color, isConflicted, confInfo, hasMachine, hasStaff } = getCardTheme(entry, idx);
              const top = (startHours - timelineStart) * verticalHourHeight;
              const durationHours = endHours - startHours;
              const minCardH = verticalHourHeight <= 28 ? 20 : verticalHourHeight <= 38 ? 24 : 32;

              // Auto-resized column position
              const cardLeft = effectiveGutter + (isMobile ? 3 : 6) + col * (calculatedColWidth + laneGap);
              const cardWidth = calculatedColWidth;

              const staffItems = getOrderedStaffEntries(entry.staff);
              const hasVisibleStaff = effectiveShowStaff && staffItems.length > 0;
              const conflictBadgeCount =
                (confInfo?.machineConflicts.length || 0) + (confInfo?.staffConflicts.length || 0);
              const staffEstimatedH = hasVisibleStaff
                ? estimateHorizontalCardHeight(entry, cardWidth, true, conflictBadgeCount, effectiveShortStaff)
                : 0;
              const height = Math.max(
                durationHours * verticalHourHeight - 2,
                minCardH,
                staffEstimatedH,
                hasVisibleStaff ? measuredCardHeights[entry.id] || 0 : 0
              );

              const isNarrow = isMobile || cardWidth < 125;
              const isSuperCompact = !hasVisibleStaff && (verticalHourHeight <= 28 || height < 28);
              const isCompact = !hasVisibleStaff && (verticalHourHeight <= 38 || height < 46);
              const isBeingDragged = dragState?.entryId === entry.id;

              return (
                <Tooltip key={entry.id} content={tooltipContent(entry)} position="right" maxWidth={320} disabled={isMobile || Boolean(dragState)}>
                  <div
                    data-testid={`timeline-card-${entry.id}`}
                    data-card-entry-id={entry.id}
                    onMouseDown={(e) => handleCardMouseDown(e, entry)}
                    onTouchStart={(e) => handleCardTouchStart(e, entry)}
                    onClick={(e) => {
                      if (suppressClickRef.current) {
                        e.stopPropagation();
                        return;
                      }
                      onEntryClick(entry);
                    }}
                    className={`absolute ${zoomConfig.radiusClass} ${isNarrow ? 'p-1 px-1.5' : zoomConfig.paddingClass}
                      ${color.bg} ${color.border} ${color.text}
                      ${
                        isBeingDragged
                          ? 'z-40 shadow-xl ring-2 ring-primary-500 scale-[1.01] cursor-grabbing'
                          : `z-10 hover:shadow-sm active:scale-[0.99] transition-all duration-150 ${
                              onEntryTimeChange && !entry.locked ? 'cursor-grab' : 'cursor-pointer'
                            }`
                      }
                      overflow-hidden select-none flex flex-col ${hasVisibleStaff ? 'justify-start gap-0.5' : 'justify-between'} shadow-2xs
                    `}
                    style={{
                      top,
                      minHeight: height,
                      height: hasVisibleStaff ? 'auto' : height,
                      left: cardLeft,
                      width: cardWidth,
                    }}
                  >
                    {/* SUPER COMPACT MODE (Zoom 24px) */}
                    {isSuperCompact ? (
                      <div className="flex items-center justify-between gap-1 w-full h-full min-h-0">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {isConflicted && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0 animate-pulse" />
                          )}
                          <span className={zoomConfig.nameTextClass}>
                            {entry.patientName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isConflicted && !isBeingDragged ? (
                            <div className="flex items-center gap-0.5 text-[7px] font-bold truncate max-w-[70px]">
                              {confInfo?.machineConflicts[0]?.resource ? (
                                <span className="flex items-center gap-0.5 truncate text-red-600"><Cpu size={6} /> {confInfo.machineConflicts[0].resource}</span>
                              ) : confInfo?.staffConflicts[0]?.resource ? (
                                <span className="flex items-center gap-0.5 truncate text-blue-600"><User size={6} /> {confInfo.staffConflicts[0].resource}</span>
                              ) : (
                                <span className="text-red-600">!</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[7px] font-bold text-gray-500 tabular-nums shrink-0">
                              {isBeingDragged
                                ? `${formatDisplayTime(entry.startTime)}–${formatDisplayTime(entry.endTime)}`
                                : formatDisplayTime(entry.startTime)}
                            </span>
                          )}
                          {entry.locked && (
                            <span
                              data-testid={`timeline-card-lock-${entry.id}`}
                              title="Ca mổ đã khóa chỉnh sửa"
                              className="inline-flex items-center justify-center p-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0"
                            >
                              <Lock size={7} />
                            </span>
                          )}
                        </div>
                      </div>
                    ) : isCompact ? (
                      /* COMPACT MODE (Zoom 34px - 48px) */
                      <div className="flex flex-col justify-between h-full min-h-0">
                        <div className="flex items-center justify-between gap-0.5 mb-0.5">
                          <div className={`flex items-center gap-0.5 ${isNarrow ? 'text-[7.5px]' : zoomConfig.timeTextClass} text-gray-600 tabular-nums`}>
                            <Clock size={isNarrow ? 8 : zoomConfig.iconSize} className="shrink-0 text-primary-600" />
                            <span>{formatDisplayTime(entry.startTime)}–{formatDisplayTime(entry.endTime)}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isConflicted && (
                              <AlertTriangle size={isNarrow ? 9 : 10} className="text-red-500 shrink-0" />
                            )}
                            {entry.locked && (
                              <span
                                data-testid={`timeline-card-lock-${entry.id}`}
                                title="Ca mổ đã khóa chỉnh sửa"
                                className="inline-flex items-center justify-center p-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0"
                              >
                                <Lock size={isNarrow ? 8 : 9} />
                              </span>
                            )}
                          </div>
                        </div>

                        <div className={isNarrow ? 'text-[9.5px] font-bold truncate leading-tight' : zoomConfig.nameTextClass}>
                          {entry.patientName}
                        </div>

                        {/* Non-conflicted */}
                        {!isConflicted && height >= 36 && (
                          <div className="text-[8px] text-gray-500 truncate leading-tight mt-0.5">
                            {entry.tenKT}
                          </div>
                        )}

                        {/* Conflicted: machine = RED, staff = BLUE */}
                        {isConflicted && height >= 36 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap text-[7px]">
                            {confInfo?.machineConflicts.map((c, i) => (
                              <span key={`cmc-${i}`} className="inline-flex items-center gap-0.5 bg-red-600 text-white px-1 py-0.2 rounded font-bold truncate max-w-full shadow-2xs">
                                <Cpu size={7} className="shrink-0" />
                                <span className="truncate">{c.resource}</span>
                              </span>
                            ))}
                            {confInfo?.staffConflicts.map((c, i) => (
                              <span key={`csc-${i}`} className="inline-flex items-center gap-0.5 bg-blue-600 text-white px-1 py-0.2 rounded font-bold truncate max-w-full shadow-2xs">
                                <User size={7} className="shrink-0" />
                                <span className="truncate">{c.resource}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* STANDARD & DETAILED MODE (Zoom 68px - 124px, or when showStaff is enabled) */
                      <>
                        <div>
                          {/* Top Row: Time Range + Conflict/Lock Icons */}
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className={`flex items-center gap-1 ${isNarrow ? 'text-[8.5px]' : zoomConfig.timeTextClass} text-gray-700 tabular-nums`}>
                              <Clock size={isNarrow ? 9 : zoomConfig.iconSize} className="shrink-0 text-primary-600" />
                              <span>{formatDisplayTime(entry.startTime)}–{formatDisplayTime(entry.endTime)}</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isConflicted && (
                                <div className="flex items-center gap-0.5 text-red-600 shrink-0" title="Phát hiện trùng">
                                  <AlertTriangle size={isNarrow ? 9 : 11} className="text-red-500 animate-pulse" />
                                </div>
                              )}
                              {entry.locked && (
                                <span
                                  data-testid={`timeline-card-lock-${entry.id}`}
                                  title={entry.lockedByName ? `Đã khóa chỉnh sửa (${entry.lockedByName})` : 'Đã khóa chỉnh sửa'}
                                  className="inline-flex items-center justify-center p-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0 shadow-2xs"
                                >
                                  <Lock size={isNarrow ? 8.5 : 10} />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Patient Name */}
                          <div className={isNarrow ? 'text-[10px] font-bold truncate leading-tight' : zoomConfig.nameTextClass}>
                            {entry.patientName}
                          </div>

                          {/* Surgery Procedure Name */}
                          {(height >= 52 || hasVisibleStaff) && (
                            <p className={isNarrow ? 'text-[8.5px] text-gray-500 truncate mt-0.5 leading-tight' : zoomConfig.procTextClass}>
                              {entry.tenKT}
                            </p>
                          )}
                        </div>

                        {/* Conflicted Badges: Machine = RED, Staff = BLUE */}
                        {isConflicted && (
                          <div className="flex items-center gap-1 flex-wrap mt-0.5 text-[8px] sm:text-[9px]">
                            {confInfo?.machineConflicts.map((c, i) => (
                              <span
                                key={`mc-${i}`}
                                className={`inline-flex items-center gap-0.5 ${zoomConfig.badgeClass} bg-red-600 text-white font-bold truncate max-w-full shadow-2xs`}
                                title={`Trùng máy: ${c.resource}`}
                              >
                                <Cpu size={isNarrow ? 8 : zoomConfig.iconSize} className="shrink-0" />
                                <span className="truncate">{c.resource}</span>
                              </span>
                            ))}
                            {confInfo?.staffConflicts.map((c, i) => (
                              <span
                                key={`sc-${i}`}
                                className={`inline-flex items-center gap-0.5 ${zoomConfig.badgeClass} bg-blue-600 text-white font-bold truncate max-w-full shadow-2xs`}
                                title={`Trùng nhân sự: ${c.resource}`}
                              >
                                <User size={isNarrow ? 8 : zoomConfig.iconSize} className="shrink-0" />
                                <span className="truncate">{c.resource}</span>
                              </span>
                            ))}
                            {!hasMachine && !hasStaff && confInfo?.hasOverlap && (
                              <span
                                className={`inline-flex items-center gap-0.5 ${zoomConfig.badgeClass} bg-amber-100 text-amber-800 border border-amber-300 font-medium`}
                              >
                                <Clock size={isNarrow ? 7 : zoomConfig.iconSize - 1} className="shrink-0" />
                                <span>Trùng ca</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Staff List (Vị trí: Họ tên - 1 vị trí / dòng, tự xuống dòng) */}
                        {hasVisibleStaff && (
                          <div
                            data-testid={`timeline-card-staff-${entry.id}`}
                            className="mt-1 pt-1 border-t border-gray-200/80 flex flex-col gap-0.5 w-full min-w-0"
                          >
                            {staffItems.map((st) => {
                              const isRoleConflicted = confInfo?.staffConflicts.some(
                                (c) => c.resource.trim().toLowerCase() === st.name.toLowerCase()
                              );
                              const displayRole = effectiveShortStaff ? st.roleShortLabel : st.roleLabel;
                              const displayName = effectiveShortStaff ? st.shortName : st.name;
                              return (
                                <div
                                  key={st.roleKey}
                                  className={`text-[8.5px] sm:text-[9px] leading-snug whitespace-normal break-words ${
                                    isRoleConflicted
                                      ? 'text-blue-700 font-bold bg-blue-100/70 px-1 py-0.2 rounded'
                                      : 'text-gray-700'
                                  }`}
                                >
                                  <span className={isRoleConflicted ? 'text-blue-800 font-semibold' : 'text-gray-500 font-semibold'}>
                                    {displayRole}:
                                  </span>{' '}
                                  <span className={isRoleConflicted ? 'text-blue-950 font-bold' : 'text-gray-900 font-bold'}>
                                    {displayName}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Tooltip>
              );
            })}

            {/* Empty state */}
            {displayEntries.length === 0 && (
              <div
                className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm"
                style={{ left: effectiveGutter }}
              >
                <div className="text-center p-6 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30 text-primary-600" />
                  <p className="font-semibold text-gray-700 text-xs sm:text-sm">Chưa có ca mổ nào được đăng ký trong ngày</p>
                  <p className="text-[11px] text-gray-400 mt-1">Nhấn "+ Thêm ca mổ" để đăng ký ca mới</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ── MODE 2: HORIZONTAL TIMELINE (NGANG ↔) ── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      {orientation === 'horizontal' && (
        <div ref={containerRef} onScroll={handleHorizontalScroll} className="overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain">
          <div ref={innerGridRef} style={{ width: totalWidth + H_LEFT_GUTTER + 24, minHeight: Math.max(totalHeight, 220) }} className="relative">
            {/* Time axis header */}
            <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200" style={{ height: H_HEADER_HEIGHT }}>
              {visibleTicksH.map((tick) => (
                <div
                  key={`ht-${tick.shiftHour}`}
                  className={`absolute text-[10px] select-none tabular-nums ${
                    tick.isDutyStart || tick.isDutyEnd
                      ? 'text-primary-700 font-extrabold'
                      : tick.isNextDay
                      ? 'text-sky-700 font-medium'
                      : 'text-gray-400 font-semibold'
                  }`}
                  style={{ left: H_LEFT_GUTTER + tick.offsetHours * hourWidth, top: 8 }}
                  title={tick.subLabel}
                >
                  {tick.label}
                </div>
              ))}
            </div>

            {/* ── Off-Hours Background Highlights (Ngoài giờ hành chính) ── */}
            {offHoursIntervals.map((interval, idx) => {
              const s = Math.max(interval.start, timelineStart);
              const e = Math.min(interval.end, timelineEnd);
              if (e <= s) return null;
              const left = H_LEFT_GUTTER + (s - timelineStart) * hourWidth;
              const width = (e - s) * hourWidth;

              return (
                <div
                  key={`h-off-${idx}`}
                  className="absolute top-0 bottom-0 bg-amber-50/70 border-l border-r border-amber-200/50 pointer-events-none z-0"
                  style={{ left, width }}
                >
                  <div className="sticky top-2 left-2 text-[8.5px] sm:text-[9.5px] font-bold text-amber-800/80 uppercase tracking-wide bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300/60 shadow-2xs select-none inline-flex items-center gap-1 mt-1 ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{interval.label}</span>
                  </div>
                </div>
              );
            })}

            {/* Grid lines */}
            {timelineTicks.map((tick) => (
              <div
                key={`hline-${tick.shiftHour}`}
                className={`absolute top-0 bottom-0 ${
                  tick.isDutyStart || tick.isDutyEnd
                    ? 'border-l-2 border-primary-200 z-10'
                    : 'border-l border-gray-100/80 z-[1]'
                }`}
                style={{ left: H_LEFT_GUTTER + tick.offsetHours * hourWidth }}
              />
            ))}

            {/* Current time marker (if viewing today) */}
            {isNowVisible && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none"
                style={{ left: H_LEFT_GUTTER + nowOffsetHours * hourWidth }}
              >
                <div className="absolute -top-0 -left-1.5 w-3.5 h-3.5 rounded-full bg-red-400 border-2 border-white shadow-sm" />
              </div>
            )}

            {/* Surgery bars */}
            {displayEntries.map((entry, idx) => {
              const lane = laneMap.get(entry.id) ?? 0;
              const startH = parseTimeToShiftHours(entry.startTime, dutyStartHour);
              let endH = parseTimeToShiftHours(entry.endTime, dutyStartHour);
              if (endH <= startH) endH += 24;

              const layout = horizontalCardLayout.get(entry.id);
              const left = layout?.left ?? H_LEFT_GUTTER + (startH - timelineStart) * hourWidth;
              const width = layout?.width ?? Math.max((endH - startH) * hourWidth, 36);
              const top = layout?.top ?? H_HEADER_HEIGHT + lane * (H_BAR_HEIGHT + H_BAR_GAP) + 6;
              const cardHeight = layout?.height ?? H_BAR_HEIGHT;

              const { color, isConflicted, confInfo, hasMachine, hasStaff } = getCardTheme(entry, idx);
              const hasOverlap = confInfo?.hasOverlap;
              const hasBothMachineAndStaff = (confInfo?.machineConflicts.length || 0) > 0 && (confInfo?.staffConflicts.length || 0) > 0;
              // If card is narrow or has both machine and staff conflicts, stack staff badge below machine badge
              const shouldStackBadges = width < 230 || hasBothMachineAndStaff;
              const isBeingDragged = dragState?.entryId === entry.id;
              const staffItems = getOrderedStaffEntries(entry.staff);
              const hasVisibleStaff = effectiveShowStaff && staffItems.length > 0;

              return (
                <Tooltip key={entry.id} content={tooltipContent(entry)} position="bottom" maxWidth={320} disabled={isMobile || Boolean(dragState)}>
                  <div
                    data-testid={`timeline-card-${entry.id}`}
                    data-card-entry-id={entry.id}
                    className={`absolute rounded-xl ${color.bg} ${color.border} ${color.text}
                      ${
                        isBeingDragged
                          ? 'z-40 shadow-xl ring-2 ring-primary-500 scale-[1.01] cursor-grabbing'
                          : `z-10 hover:shadow-sm transition-all duration-150 ${
                              onEntryTimeChange && !entry.locked ? 'cursor-grab' : 'cursor-pointer'
                            }`
                      }
                      flex flex-col ${hasVisibleStaff ? 'justify-start gap-0.5 py-1.5' : 'justify-between py-1'} px-2 overflow-hidden select-none shadow-2xs
                    `}
                    style={{
                      left,
                      top,
                      width,
                      minHeight: cardHeight,
                      height: hasVisibleStaff ? 'auto' : cardHeight,
                    }}
                    onMouseDown={(e) => handleCardMouseDown(e, entry)}
                    onTouchStart={(e) => handleCardTouchStart(e, entry)}
                    onClick={(e) => {
                      if (suppressClickRef.current) {
                        e.stopPropagation();
                        return;
                      }
                      onEntryClick(entry);
                    }}
                  >
                    {/* Row 1: Full Patient Name + Lock Icon at top-right */}
                    <div className="flex items-center justify-between gap-1 w-full min-w-0">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {isConflicted && (
                          <AlertTriangle size={11} className="shrink-0 text-red-600 animate-pulse" />
                        )}
                        <span className="text-[10.5px] sm:text-[11px] font-bold text-gray-900 truncate leading-tight">
                          {entry.patientName}
                        </span>
                      </div>
                      {entry.locked && (
                        <span
                          data-testid={`timeline-card-lock-${entry.id}`}
                          title={entry.lockedByName ? `Đã khóa chỉnh sửa (${entry.lockedByName})` : 'Đã khóa chỉnh sửa'}
                          className="inline-flex items-center justify-center p-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0 shadow-2xs"
                        >
                          <Lock size={9.5} />
                        </span>
                      )}
                    </div>

                    {/* Row 2: Surgery Time Range (Below patient name) */}
                    <div className="flex items-center gap-1 text-[8.5px] text-gray-500 font-semibold tabular-nums leading-none">
                      <Clock size={8} className="shrink-0 text-primary-600" />
                      <span className={isBeingDragged ? 'text-primary-700 font-extrabold' : ''}>
                        {formatDisplayTime(entry.startTime)}–{formatDisplayTime(entry.endTime)}
                      </span>
                    </div>

                    {/* Bottom Area: Badges arranged below patient name OR procedure info */}
                    {isConflicted ? (
                      <div className={`flex ${shouldStackBadges ? 'flex-col items-start gap-0.5' : 'flex-wrap items-center gap-1'} w-full min-w-0 mt-0.5`}>
                        {/* Machine Conflict Badge (RED) */}
                        {confInfo?.machineConflicts.map((c, i) => (
                          <span
                            key={`hmc-${i}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-red-600 text-white text-[8px] sm:text-[8.5px] font-bold rounded shadow-2xs max-w-full"
                            title={`Trùng máy: ${c.resource}`}
                          >
                            <Cpu size={8} className="shrink-0" />
                            <span className="truncate">{c.resource}</span>
                          </span>
                        ))}

                        {/* Staff Conflict Badge (BLUE) - stacked below machine badge */}
                        {confInfo?.staffConflicts.map((c, i) => (
                          <span
                            key={`hsc-${i}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-blue-600 text-white text-[8px] sm:text-[8.5px] font-bold rounded shadow-2xs max-w-full"
                            title={`Trùng NV: ${c.resource}`}
                          >
                            <User size={8} className="shrink-0" />
                            <span className="truncate">{c.resource}</span>
                          </span>
                        ))}

                        {!hasMachine && !hasStaff && hasOverlap && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 text-[8px] font-medium rounded max-w-full"
                            title="Trùng khung giờ với ca khác"
                          >
                            <Clock size={7.5} className="shrink-0" />
                            <span className="truncate">Trùng ca</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      /* Non-conflicted: procedure name and room/machine */
                      <div className="flex items-center justify-between gap-1 w-full min-w-0 text-[9px] text-gray-600 mt-0.5">
                        <span className="truncate leading-none">{entry.tenKT}</span>
                        {entry.machineName && width >= 140 && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 font-medium shrink-0 text-[8px]">
                            <Cpu size={7.5} />
                            <span className="truncate max-w-[70px]">{entry.machineName}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Staff List (Vị trí: Họ tên - mỗi vị trí 1 dòng xếp dọc, tự xuống dòng) */}
                    {hasVisibleStaff && (
                      <div
                        data-testid={`timeline-card-staff-${entry.id}`}
                        className="mt-1 pt-1 border-t border-gray-200/80 flex flex-col gap-0.5 w-full min-w-0"
                      >
                        {staffItems.map((st) => {
                          const isRoleConflicted = confInfo?.staffConflicts.some(
                            (c) => c.resource.trim().toLowerCase() === st.name.toLowerCase()
                          );
                          const displayRole = effectiveShortStaff ? st.roleShortLabel : st.roleLabel;
                          const displayName = effectiveShortStaff ? st.shortName : st.name;
                          return (
                            <div
                              key={st.roleKey}
                              className={`text-[9px] sm:text-[9.5px] leading-snug whitespace-normal break-words ${
                                isRoleConflicted
                                  ? 'text-blue-700 font-bold bg-blue-100/70 px-1 py-0.2 rounded'
                                  : 'text-gray-700'
                              }`}
                            >
                              <span className={isRoleConflicted ? 'text-blue-800 font-semibold' : 'text-gray-500 font-semibold'}>
                                {displayRole}:
                              </span>{' '}
                              <span className={isRoleConflicted ? 'text-blue-950 font-bold' : 'text-gray-900 font-bold'}>
                                {displayName}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Tooltip>
              );
            })}

            {/* Empty state */}
            {displayEntries.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm" style={{ top: H_HEADER_HEIGHT }}>
                <div className="text-center">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">Chưa có ca mổ nào được đăng ký</p>
                  <p className="text-xs opacity-60">Nhấn "+ Thêm ca mổ" để bắt đầu</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
