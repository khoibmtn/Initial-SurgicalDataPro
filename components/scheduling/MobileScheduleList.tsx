import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Cpu, User, ChevronRight } from 'lucide-react';
import type { ScheduledSurgery, ScheduleConflict } from '../../types/schedule';
import { parseTimeToShiftHours, formatDisplayTime } from '../../services/scheduleConflictService';

interface MobileScheduleListProps {
  entries: ScheduledSurgery[];
  conflictedIds: Set<string>;
  conflicts?: ScheduleConflict[];
  onEntryClick: (entry: ScheduledSurgery) => void;
  dutyStartHour?: number;
  /** yyyy-mm-dd của ca trực đang xem — dùng để nhóm Đang mổ / Sắp tới / Đã xong */
  selectedDate?: string;
}

/** Color palette mirroring DayTimelineView */
const CARD_COLORS = [
  'border-l-primary-400 bg-primary-50/50',
  'border-l-emerald-400 bg-emerald-50/50',
  'border-l-amber-400 bg-amber-50/50',
  'border-l-sky-400 bg-sky-50/50',
  'border-l-teal-400 bg-teal-50/50',
  'border-l-rose-400 bg-rose-50/50',
];

type Group = 'live' | 'upcoming' | 'done';
const GROUP_META: Record<Group, { label: string; dot: string }> = {
  live: { label: 'Đang mổ', dot: 'bg-emerald-500 animate-pulse' },
  upcoming: { label: 'Sắp tới', dot: 'bg-sky-500' },
  done: { label: 'Đã xong', dot: 'bg-gray-400' },
};

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Giờ hiện tại quy về thang giờ ca trực (07:30 → 31:29) nếu đang thuộc ca trực của selectedDate, ngược lại null. */
export function getNowShiftHours(selectedDate: string | undefined, dutyStartHour: number, now: Date = new Date()): number | null {
  if (!selectedDate) return null;
  const h = now.getHours() + now.getMinutes() / 60;
  const shiftDate = new Date(now);
  if (h < dutyStartHour) shiftDate.setDate(shiftDate.getDate() - 1);
  if (toDateKey(shiftDate) !== selectedDate) return null;
  return h < dutyStartHour ? h + 24 : h;
}

function useNowTick(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Mobile-friendly card list view cho lịch mổ.
 * Ca trực hiện tại được nhóm theo trạng thái: Đang mổ → Sắp tới → Đã xong.
 */
export const MobileScheduleList: React.FC<MobileScheduleListProps> = ({
  entries,
  conflictedIds,
  conflicts = [],
  onEntryClick,
  dutyStartHour = 7.5,
  selectedDate,
}) => {
  const now = useNowTick();
  const nowShift = getNowShiftHours(selectedDate, dutyStartHour, now);

  const sorted = useMemo(
    () =>
      entries
        .map((entry) => {
          const start = parseTimeToShiftHours(entry.startTime, dutyStartHour);
          let end = parseTimeToShiftHours(entry.endTime, dutyStartHour);
          if (end <= start) end += 24;
          return { entry, start, end };
        })
        .sort((a, b) => a.start - b.start),
    [entries, dutyStartHour]
  );

  const groups = useMemo(() => {
    if (nowShift === null) return [{ key: null as Group | null, items: sorted }];
    const by: Record<Group, typeof sorted> = { live: [], upcoming: [], done: [] };
    for (const item of sorted) {
      const g: Group = item.end <= nowShift ? 'done' : item.start <= nowShift ? 'live' : 'upcoming';
      by[g].push(item);
    }
    return (['live', 'upcoming', 'done'] as Group[])
      .filter((k) => by[k].length > 0)
      .map((k) => ({ key: k as Group | null, items: by[k] }));
  }, [sorted, nowShift]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Clock className="h-10 w-10 mb-3 opacity-30" />
        <p className="font-medium text-sm">Chưa có ca mổ nào</p>
        <p className="text-xs opacity-60">Nhấn "+" để thêm ca mổ mới</p>
      </div>
    );
  }

  const indexOf = new Map<string, number>(sorted.map((s, i) => [s.entry.id, i]));

  return (
    <div className="space-y-3 pb-20">
      {groups.map(({ key, items }) => (
        <section key={key ?? 'all'} className="space-y-2">
          {key && (
            <h3 className="sticky top-0 z-10 flex items-center gap-2 px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-500 bg-gray-50/95 backdrop-blur-sm">
              <span className={`w-2 h-2 rounded-full ${GROUP_META[key].dot}`} />
              {GROUP_META[key].label}
              <span className="text-gray-400 font-semibold">({items.length})</span>
            </h3>
          )}
          {items.map(({ entry, start, end }) => {
            const isConflicted = conflictedIds.has(entry.id);
            const entryConfs = conflicts.filter((c) => c.surgeryIds.includes(entry.id));
            const hasMachine = entryConfs.some((c) => c.type === 'MACHINE');
            const hasStaff = entryConfs.some((c) => c.type === 'STAFF');
            const isLive = key === 'live';
            const isDone = key === 'done';
            const progress = isLive && nowShift !== null ? Math.min(100, ((nowShift - start) / (end - start)) * 100) : 0;
            const surgeon = entry.staff?.ptChinh;

            const colorClass = isConflicted
              ? 'border-l-red-500 bg-red-50/80'
              : CARD_COLORS[(indexOf.get(entry.id) ?? 0) % CARD_COLORS.length];

            return (
              <button
                key={entry.id}
                onClick={() => onEntryClick(entry)}
                className={`relative w-full text-left border-l-4 rounded-xl p-3 transition-all overflow-hidden
                  active:scale-[0.98] shadow-sm border border-gray-200/50
                  ${colorClass}
                  ${isConflicted ? 'ring-1 ring-red-300' : ''}
                  ${isDone ? 'opacity-60' : ''}
                `}
              >
                {/* Row 1: Patient (full width) */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {isConflicted && <AlertTriangle size={14} className="shrink-0 text-red-500" />}
                    <span className="text-sm font-bold text-gray-800 truncate">{entry.patientName}</span>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-gray-300 mt-0.5" />
                </div>

                {/* Row 2: Time + surgeon */}
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 tabular-nums">
                  <span className="inline-flex items-center gap-1 font-bold">
                    <Clock size={11} className="text-primary-600" />
                    {formatDisplayTime(entry.startTime)}–{formatDisplayTime(entry.endTime)}
                  </span>
                  {surgeon && (
                    <span className="inline-flex items-center gap-1 truncate min-w-0">
                      <User size={11} className="shrink-0" /> <span className="truncate">{surgeon}</span>
                    </span>
                  )}
                </div>

                {/* Row 3: Surgery name */}
                <p className="text-xs text-gray-600 truncate mt-1 pl-0.5">{entry.tenKT}</p>

                {isConflicted && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100">
                    {entryConfs.filter((c) => c.type === 'MACHINE').map((c, i) => (
                      <span key={`m-${i}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded shadow-2xs">
                        <Cpu size={10} /> {c.resource}
                      </span>
                    ))}
                    {entryConfs.filter((c) => c.type === 'STAFF').map((c, i) => (
                      <span key={`s-${i}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow-2xs">
                        <User size={10} /> {c.resource}
                      </span>
                    ))}
                    {!hasMachine && !hasStaff && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded">
                        <AlertTriangle size={10} /> Trùng giờ
                      </span>
                    )}
                  </div>
                )}

                {isLive && (
                  <span className="absolute left-0 bottom-0 h-0.5 bg-emerald-500" style={{ width: `${progress}%` }} />
                )}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
};
