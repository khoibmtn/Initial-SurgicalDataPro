import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, Clock, Cpu, User, ZoomIn, ZoomOut,
  MoveHorizontal, MoveVertical,
} from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import type { ScheduledSurgery, ScheduleConflict } from '../../types/schedule';
import { STAFF_ROLE_LABELS } from '../../types/schedule';
import type { WorkingHours } from '../../contexts/ConfigContext';
import { getScheduleForDate } from '../../services/overtimeCalculationService';
import { parseTimeToShiftHours } from '../../services/scheduleConflictService';

export type ZoomLevel = 40 | 60 | 80 | 120 | 180;
export type TimelineOrientation = 'horizontal' | 'vertical';

interface DayTimelineViewProps {
  entries: ScheduledSurgery[];
  conflictedIds: Set<string>;
  conflicts: ScheduleConflict[];
  onEntryClick: (entry: ScheduledSurgery) => void;
  currentUserId?: string;
  /** Pixels per hour for horizontal mode */
  hourWidth?: ZoomLevel;
  onZoomChange?: (zoom: ZoomLevel) => void;
  /** Layout orientation: horizontal (Ngang ↔) or vertical (Dọc ↕) */
  orientation?: TimelineOrientation;
  onOrientationChange?: (orientation: TimelineOrientation) => void;
  selectedDate?: string;
  workingHours?: WorkingHours;
}

// Horizontal metrics
const H_BAR_HEIGHT = 68;
const H_BAR_GAP = 8;
const H_HEADER_HEIGHT = 34;
const H_LEFT_GUTTER = 56;

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
  return `${start} – ${end}`;
}

function formatTickLabel(shiftH: number): string {
  const isNextDay = shiftH >= 24;
  const normalizedH = isNextDay ? shiftH - 24 : shiftH;
  const h = Math.floor(normalizedH);
  const m = Math.round((normalizedH - h) * 60);
  const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  return isNextDay ? `${timeStr} +1` : timeStr;
}

/** Assign horizontal lanes (first-fit greedy based on duty shift hours) */
function assignLanes(entries: ScheduledSurgery[], dutyStartHour: number): Map<string, number> {
  const sorted = [...entries].sort((a, b) => {
    const sA = parseTimeToShiftHours(a.startTime, dutyStartHour);
    const sB = parseTimeToShiftHours(b.startTime, dutyStartHour);
    return sA - sB;
  });
  const laneEnds: number[] = [];
  const laneMap = new Map<string, number>();

  for (const entry of sorted) {
    const start = parseTimeToShiftHours(entry.startTime, dutyStartHour);
    let end = parseTimeToShiftHours(entry.endTime, dutyStartHour);
    if (end <= start) end += 24;

    let assignedLane = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) {
        assignedLane = i;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[assignedLane] = end;
    laneMap.set(entry.id, assignedLane);
  }
  return laneMap;
}

interface VerticalLayoutEntry {
  entry: ScheduledSurgery;
  startHours: number;
  endHours: number;
  col: number;
  totalCols: number;
}

/** Compute vertical columns for overlapping clusters (Google Calendar day layout) */
function computeVerticalLayout(entries: ScheduledSurgery[], dutyStartHour: number): {
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

  const items: VerticalLayoutEntry[] = [];
  let maxConcurrentCols = 1;

  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const entryCols = new Map<string, number>();

    for (const item of cluster) {
      let assignedCol = -1;
      for (let i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= item.start) {
          assignedCol = i;
          break;
        }
      }
      if (assignedCol === -1) {
        assignedCol = colEnds.length;
        colEnds.push(item.end);
      } else {
        colEnds[assignedCol] = item.end;
      }
      entryCols.set(item.entry.id, assignedCol);
    }

    const totalCols = Math.max(colEnds.length, 1);
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

export const DayTimelineView: React.FC<DayTimelineViewProps> = ({
  entries,
  conflictedIds,
  conflicts = [],
  onEntryClick,
  currentUserId,
  hourWidth = 120,
  onZoomChange,
  orientation = 'horizontal',
  onOrientationChange,
  selectedDate,
  workingHours,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1000
  );

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
  const seasonSchedule = useMemo(() => {
    const dateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
    return getScheduleForDate(dateObj, workingHours);
  }, [selectedDate, workingHours]);

  const dutyStartStr = seasonSchedule?.morningFrom || '07:30';
  const dutyStartHour = useMemo(() => {
    const [h, m] = dutyStartStr.split(':').map(Number);
    return (isNaN(h) ? 7 : h) + (isNaN(m) ? 30 : m) / 60;
  }, [dutyStartStr]);

  // ── Dynamic 24h timeline window with auto-resize if surgeries fall outside ──
  const { timelineStart, timelineEnd, totalTimelineHours } = useMemo(() => {
    const nominalStart = dutyStartHour;
    const nominalEnd = dutyStartHour + 24;

    if (entries.length === 0) {
      return {
        timelineStart: nominalStart,
        timelineEnd: nominalEnd,
        totalTimelineHours: 24,
      };
    }

    let minStart = nominalStart;
    let maxEnd = nominalEnd;

    for (const e of entries) {
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
  }, [entries, dutyStartHour]);

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

  // Horizontal lanes
  const laneMap = useMemo(() => assignLanes(entries, dutyStartHour), [entries, dutyStartHour]);
  const maxLane = useMemo(() => {
    let max = 0;
    laneMap.forEach((lane) => { if (lane > max) max = lane; });
    return max;
  }, [laneMap]);

  // Vertical layout items & max concurrent columns
  const { items: verticalItems, maxConcurrentCols } = useMemo(
    () => computeVerticalLayout(entries, dutyStartHour),
    [entries, dutyStartHour]
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

    for (const entry of entries) {
      const entryConfs = conflicts.filter((c) => c.surgeryIds.includes(entry.id));
      const machineConfs = entryConfs.filter((c) => c.type === 'MACHINE');
      const staffConfs = entryConfs.filter((c) => c.type === 'STAFF');

      const startA = parseTimeToShiftHours(entry.startTime, dutyStartHour);
      let endA = parseTimeToShiftHours(entry.endTime, dutyStartHour);
      if (endA <= startA) endA += 24;

      const hasOverlap = entries.some((other) => {
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
  }, [entries, conflicts, dutyStartHour]);

  const totalWidth = totalTimelineHours * hourWidth;
  const totalHeight = H_HEADER_HEIGHT + (maxLane + 1) * (H_BAR_HEIGHT + H_BAR_GAP) + 20;

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
  const currentZoomIdx = Math.max(0, ZOOM_LEVELS.indexOf(hourWidth));
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
    const isConflicted = conflictedIds.has(entry.id);
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
      {/* ── Toolbar: Orientation Switcher + Zoom Controls ── */}
      <div className="flex items-center justify-between px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-gray-200 bg-gray-50/90 text-xs gap-2 flex-wrap">
        {/* Orientation Switcher */}
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

        {/* Duty shift window badge */}
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded-md border border-gray-200/60">
          <Clock size={11} className="text-primary-600" />
          <span>Tua trực: <strong className="text-gray-800">{dutyStartStr}</strong> đến <strong className="text-gray-800">{dutyStartStr} (+1)</strong></span>
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

            {/* Horizontal Grid Lines */}
            {timelineTicks.map((tick) => (
              <div
                key={`vline-${tick.shiftHour}`}
                className={`absolute left-0 right-0 ${
                  tick.isDutyStart || tick.isDutyEnd
                    ? 'border-t-2 border-primary-200 z-10'
                    : 'border-t border-gray-100'
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
              const height = Math.max(durationHours * verticalHourHeight - 2, minCardH);

              // Auto-resized column position
              const cardLeft = effectiveGutter + (isMobile ? 3 : 6) + col * (calculatedColWidth + laneGap);
              const cardWidth = calculatedColWidth;

              const isNarrow = isMobile || cardWidth < 125;
              const isSuperCompact = verticalHourHeight <= 28 || height < 28;
              const isCompact = verticalHourHeight <= 38 || height < 46;

              return (
                <Tooltip key={entry.id} content={tooltipContent(entry)} position="right" maxWidth={320} disabled={isMobile}>
                  <div
                    onClick={() => onEntryClick(entry)}
                    className={`absolute ${zoomConfig.radiusClass} ${isNarrow ? 'p-1 px-1.5' : zoomConfig.paddingClass}
                      ${color.bg} ${color.border} ${color.text}
                      cursor-pointer hover:shadow-sm active:scale-[0.99] transition-all duration-150
                      overflow-hidden select-none flex flex-col justify-between shadow-2xs
                    `}
                    style={{
                      top,
                      height,
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
                        {isConflicted ? (
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
                            {entry.startTime}
                          </span>
                        )}
                      </div>
                    ) : isCompact ? (
                      /* COMPACT MODE (Zoom 34px - 48px) */
                      <div className="flex flex-col justify-between h-full min-h-0">
                        <div className="flex items-center justify-between gap-0.5 mb-0.5">
                          <div className={`flex items-center gap-0.5 ${isNarrow ? 'text-[7.5px]' : zoomConfig.timeTextClass} text-gray-600 tabular-nums`}>
                            <Clock size={isNarrow ? 8 : zoomConfig.iconSize} className="shrink-0 text-primary-600" />
                            <span>{entry.startTime}–{entry.endTime}</span>
                          </div>
                          {isConflicted && (
                            <AlertTriangle size={isNarrow ? 9 : 10} className="text-red-500 shrink-0" />
                          )}
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
                      /* STANDARD & DETAILED MODE (Zoom 68px - 124px) */
                      <>
                        <div>
                          {/* Top Row: Time Range + Conflict Icon */}
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className={`flex items-center gap-1 ${isNarrow ? 'text-[8.5px]' : zoomConfig.timeTextClass} text-gray-700 tabular-nums`}>
                              <Clock size={isNarrow ? 9 : zoomConfig.iconSize} className="shrink-0 text-primary-600" />
                              <span>{entry.startTime}–{entry.endTime}</span>
                            </div>

                            {isConflicted && (
                              <div className="flex items-center gap-0.5 text-red-600 shrink-0" title="Phát hiện trùng">
                                <AlertTriangle size={isNarrow ? 9 : 11} className="text-red-500 animate-pulse" />
                              </div>
                            )}
                          </div>

                          {/* Patient Name */}
                          <div className={isNarrow ? 'text-[10px] font-bold truncate leading-tight' : zoomConfig.nameTextClass}>
                            {entry.patientName}
                          </div>

                          {/* Surgery Procedure Name */}
                          {height >= 52 && (
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
                      </>
                    )}
                  </div>
                </Tooltip>
              );
            })}

            {/* Empty state */}
            {entries.length === 0 && (
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
          <div style={{ width: totalWidth + H_LEFT_GUTTER + 24, minHeight: Math.max(totalHeight, 220) }} className="relative">
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

            {/* Grid lines */}
            {timelineTicks.map((tick) => (
              <div
                key={`hline-${tick.shiftHour}`}
                className={`absolute top-0 bottom-0 ${
                  tick.isDutyStart || tick.isDutyEnd
                    ? 'border-l-2 border-primary-200 z-10'
                    : 'border-l border-gray-100'
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
            {entries.map((entry, idx) => {
              const lane = laneMap.get(entry.id) ?? 0;
              const startH = parseTimeToShiftHours(entry.startTime, dutyStartHour);
              let endH = parseTimeToShiftHours(entry.endTime, dutyStartHour);
              if (endH <= startH) endH += 24;

              const left = H_LEFT_GUTTER + (startH - timelineStart) * hourWidth;
              const width = Math.max((endH - startH) * hourWidth, 36);
              const top = H_HEADER_HEIGHT + lane * (H_BAR_HEIGHT + H_BAR_GAP) + 6;

              const { color, isConflicted, confInfo, hasMachine, hasStaff } = getCardTheme(entry, idx);
              const hasOverlap = confInfo?.hasOverlap;
              const hasBothMachineAndStaff = (confInfo?.machineConflicts.length || 0) > 0 && (confInfo?.staffConflicts.length || 0) > 0;
              // If card is narrow or has both machine and staff conflicts, stack staff badge below machine badge
              const shouldStackBadges = width < 230 || hasBothMachineAndStaff;

              return (
                <Tooltip key={entry.id} content={tooltipContent(entry)} position="bottom" maxWidth={320} disabled={isMobile}>
                  <div
                    className={`absolute rounded-xl ${color.bg} ${color.border} ${color.text}
                      cursor-pointer hover:shadow-sm transition-all duration-150
                      flex flex-col justify-between py-1 px-2 overflow-hidden select-none shadow-2xs
                    `}
                    style={{ left, top, width, height: H_BAR_HEIGHT }}
                    onClick={() => onEntryClick(entry)}
                  >
                    {/* Row 1: Full Patient Name (Takes 100% width, never truncated by time) */}
                    <div className="flex items-center gap-1 w-full min-w-0">
                      {isConflicted && (
                        <AlertTriangle size={11} className="shrink-0 text-red-600 animate-pulse" />
                      )}
                      <span className="text-[10.5px] sm:text-[11px] font-bold text-gray-900 truncate leading-tight">
                        {entry.patientName}
                      </span>
                    </div>

                    {/* Row 2: Surgery Time Range (Below patient name) */}
                    <div className="flex items-center gap-1 text-[8.5px] text-gray-500 font-semibold tabular-nums leading-none">
                      <Clock size={8} className="shrink-0 text-primary-600" />
                      <span>{entry.startTime}–{entry.endTime}</span>
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
                  </div>
                </Tooltip>
              );
            })}

            {/* Empty state */}
            {entries.length === 0 && (
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
