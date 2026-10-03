import React, { useMemo, useRef, useEffect } from 'react';
import { AlertTriangle, Clock, Cpu, User, ZoomIn, ZoomOut } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';
import type { ScheduledSurgery, ScheduleConflict } from '../../types/schedule';
import { STAFF_ROLE_LABELS } from '../../types/schedule';

export type ZoomLevel = 60 | 120 | 180;

interface DayTimelineViewProps {
  entries: ScheduledSurgery[];
  conflictedIds: Set<string>;
  conflicts: ScheduleConflict[];
  onEntryClick: (entry: ScheduledSurgery) => void;
  currentUserId?: string;
  /** Pixels per hour */
  hourWidth?: ZoomLevel;
  onZoomChange?: (zoom: ZoomLevel) => void;
}

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const TIMELINE_START = 0;
const TIMELINE_END = 24;
const BAR_HEIGHT = 44;
const BAR_GAP = 6;
const HEADER_HEIGHT = 32;
const LEFT_GUTTER = 44;

const ZOOM_LEVELS: ZoomLevel[] = [60, 120, 180];
const ZOOM_LABELS: Record<ZoomLevel, string> = { 60: '2h', 120: '1h', 180: '30m' };

function timeToHours(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

function formatRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

function assignLanes(entries: ScheduledSurgery[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const laneEnds: number[] = [];
  const laneMap = new Map<string, number>();

  for (const entry of sorted) {
    const start = timeToHours(entry.startTime);
    let assignedLane = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) { assignedLane = i; break; }
    }
    if (assignedLane === -1) { assignedLane = laneEnds.length; laneEnds.push(0); }
    laneEnds[assignedLane] = timeToHours(entry.endTime);
    laneMap.set(entry.id, assignedLane);
  }
  return laneMap;
}

const BAR_COLORS = [
  { bg: 'bg-primary-100', border: 'border-primary-300', text: 'text-primary-900' },
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900' },
  { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900' },
  { bg: 'bg-sky-100', border: 'border-sky-300', text: 'text-sky-900' },
  { bg: 'bg-violet-100', border: 'border-violet-300', text: 'text-violet-900' },
  { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-900' },
];

export const DayTimelineView: React.FC<DayTimelineViewProps> = ({
  entries,
  conflictedIds,
  onEntryClick,
  currentUserId,
  hourWidth = 120,
  onZoomChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const laneMap = useMemo(() => assignLanes(entries), [entries]);
  const maxLane = useMemo(() => {
    let max = 0;
    laneMap.forEach((lane) => { if (lane > max) max = lane; });
    return max;
  }, [laneMap]);

  const totalWidth = (TIMELINE_END - TIMELINE_START) * hourWidth;
  const totalHeight = HEADER_HEIGHT + (maxLane + 1) * (BAR_HEIGHT + BAR_GAP) + 20;

  const now = new Date();
  const currentHours = now.getHours() + now.getMinutes() / 60;

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (containerRef.current) {
      const scrollTo = Math.max(currentHours * hourWidth - 100, 0);
      containerRef.current.scrollLeft = scrollTo;
    }
  }, [hourWidth]);

  // Zoom controls
  const currentZoomIdx = ZOOM_LEVELS.indexOf(hourWidth);
  const canZoomIn = currentZoomIdx < ZOOM_LEVELS.length - 1;
  const canZoomOut = currentZoomIdx > 0;

  const tooltipContent = (entry: ScheduledSurgery) => {
    const staffEntries = Object.entries(entry.staff || {}).filter(([, v]) => v);
    return (
      <div className="space-y-1.5 text-[11px] min-w-[200px]">
        <div className="font-bold text-white/90 text-xs">
          {entry.patientName} — {entry.patientId}
        </div>
        <div className="text-white/80">{entry.tenKT}</div>
        <div className="flex items-center gap-1 text-white/70">
          <Clock size={10} />
          {formatRange(entry.startTime, entry.endTime)}
        </div>
        {entry.machineName && (
          <div className="flex items-center gap-1 text-white/70">
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

  // Show hour labels with appropriate step based on zoom
  const hourStep = hourWidth <= 60 ? 2 : 1;
  const visibleHours = HOURS.filter((h) => h % hourStep === 0);

  return (
    <div className="relative border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      {/* Zoom controls */}
      {onZoomChange && (
        <div className="absolute top-1 right-2 z-20 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 px-1 py-0.5 shadow-sm">
          <button
            onClick={() => canZoomOut && onZoomChange(ZOOM_LEVELS[currentZoomIdx - 1])}
            disabled={!canZoomOut}
            className={`p-1 rounded transition-colors cursor-pointer ${canZoomOut ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300'}`}
          >
            <ZoomOut size={12} />
          </button>
          <span className="text-[9px] font-bold text-gray-500 w-6 text-center">
            {ZOOM_LABELS[hourWidth]}
          </span>
          <button
            onClick={() => canZoomIn && onZoomChange(ZOOM_LEVELS[currentZoomIdx + 1])}
            disabled={!canZoomIn}
            className={`p-1 rounded transition-colors cursor-pointer ${canZoomIn ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300'}`}
          >
            <ZoomIn size={12} />
          </button>
        </div>
      )}

      {/* Scrollable container */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden">
        <div style={{ width: totalWidth + LEFT_GUTTER, minHeight: Math.max(totalHeight, 160) }} className="relative">
          {/* Time axis header */}
          <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200" style={{ height: HEADER_HEIGHT }}>
            {visibleHours.map((h) => (
              <div
                key={h}
                className="absolute text-[10px] font-semibold text-gray-400 select-none"
                style={{ left: LEFT_GUTTER + h * hourWidth, top: 8 }}
              >
                {h.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Grid lines */}
          {visibleHours.map((h) => (
            <div
              key={`line-${h}`}
              className="absolute top-0 bottom-0 border-l border-gray-100"
              style={{ left: LEFT_GUTTER + h * hourWidth }}
            />
          ))}

          {/* Half-hour grid */}
          {hourWidth >= 120 && HOURS.slice(0, 24).map((h) => (
            <div
              key={`half-${h}`}
              className="absolute top-0 bottom-0 border-l border-gray-50"
              style={{ left: LEFT_GUTTER + h * hourWidth + hourWidth / 2 }}
            />
          ))}

          {/* Current time marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20 pointer-events-none"
            style={{ left: LEFT_GUTTER + currentHours * hourWidth }}
          >
            <div className="absolute -top-0 -left-1.5 w-3.5 h-3.5 rounded-full bg-red-400 border-2 border-white shadow-sm" />
          </div>

          {/* Surgery bars */}
          {entries.map((entry, idx) => {
            const lane = laneMap.get(entry.id) ?? 0;
            const startH = timeToHours(entry.startTime);
            const endH = timeToHours(entry.endTime);
            const left = LEFT_GUTTER + startH * hourWidth;
            const width = Math.max((endH - startH) * hourWidth, 36);
            const top = HEADER_HEIGHT + lane * (BAR_HEIGHT + BAR_GAP) + 6;
            const isConflicted = conflictedIds.has(entry.id);
            const color = isConflicted
              ? { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-900' }
              : BAR_COLORS[idx % BAR_COLORS.length];

            return (
              <Tooltip key={entry.id} content={tooltipContent(entry)} position="bottom" maxWidth={320}>
                <div
                  className={`absolute rounded-lg border-2 ${color.bg} ${color.border} ${color.text}
                    cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-150
                    flex items-center gap-1 px-2 overflow-hidden select-none
                    ${isConflicted ? 'ring-2 ring-red-300 ring-offset-1' : ''}
                  `}
                  style={{ left, top, width, height: BAR_HEIGHT }}
                  onClick={() => onEntryClick(entry)}
                >
                  {isConflicted && (
                    <AlertTriangle size={12} className="shrink-0 text-red-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate leading-tight">
                      {entry.patientName}
                    </div>
                    {width > 80 && (
                      <div className="text-[10px] opacity-70 truncate leading-tight">
                        {entry.tenKT}
                      </div>
                    )}
                  </div>
                  {width > 140 && entry.machineName && (
                    <span className="text-[9px] font-medium bg-white/50 px-1 py-0.5 rounded shrink-0">
                      {entry.machineName}
                    </span>
                  )}
                </div>
              </Tooltip>
            );
          })}

          {/* Empty state */}
          {entries.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm" style={{ top: HEADER_HEIGHT }}>
              <div className="text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium">Chưa có ca mổ nào được đăng ký</p>
                <p className="text-xs opacity-60">Nhấn "+ Thêm ca mổ" để bắt đầu</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
