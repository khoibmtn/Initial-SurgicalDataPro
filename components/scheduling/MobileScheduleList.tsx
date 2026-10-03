import React from 'react';
import { AlertTriangle, Clock, Cpu, User, ChevronRight } from 'lucide-react';
import type { ScheduledSurgery, ScheduleConflict } from '../../types/schedule';
import { STAFF_ROLE_LABELS } from '../../types/schedule';
import { parseTimeToShiftHours } from '../../services/scheduleConflictService';

interface MobileScheduleListProps {
  entries: ScheduledSurgery[];
  conflictedIds: Set<string>;
  conflicts?: ScheduleConflict[];
  onEntryClick: (entry: ScheduledSurgery) => void;
  dutyStartHour?: number;
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

/**
 * Mobile-friendly card list view cho lịch mổ.
 * Thay thế DayTimelineView trên màn hình nhỏ.
 * Mỗi ca = 1 card dọc, dễ tap, cuộn mượt.
 */
export const MobileScheduleList: React.FC<MobileScheduleListProps> = ({
  entries,
  conflictedIds,
  conflicts = [],
  onEntryClick,
  dutyStartHour = 7.5,
}) => {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Clock className="h-10 w-10 mb-3 opacity-30" />
        <p className="font-medium text-sm">Chưa có ca mổ nào</p>
        <p className="text-xs opacity-60">Nhấn "+" để thêm ca mổ mới</p>
      </div>
    );
  }

  // Group by duty shift time for visual separation
  const sorted = [...entries].sort((a, b) => {
    const sA = parseTimeToShiftHours(a.startTime, dutyStartHour);
    const sB = parseTimeToShiftHours(b.startTime, dutyStartHour);
    return sA - sB;
  });

  return (
    <div className="space-y-2">
      {sorted.map((entry, idx) => {
        const isConflicted = conflictedIds.has(entry.id);
        const staffEntries = Object.entries(entry.staff || {}).filter(([, v]) => v);
        const entryConfs = conflicts.filter((c) => c.surgeryIds.includes(entry.id));
        const hasMachine = entryConfs.some((c) => c.type === 'MACHINE');
        const hasStaff = entryConfs.some((c) => c.type === 'STAFF');
        const machineConflictResource = entryConfs.find((c) => c.type === 'MACHINE')?.resource;
        const staffConflictResource = entryConfs.find((c) => c.type === 'STAFF')?.resource;

        const colorClass = isConflicted
          ? 'border-l-red-500 bg-red-50/80'
          : CARD_COLORS[idx % CARD_COLORS.length];

        return (
          <button
            key={entry.id}
            onClick={() => onEntryClick(entry)}
            className={`w-full text-left border-l-4 rounded-xl p-3 transition-all
              active:scale-[0.98] shadow-sm border border-gray-200/50
              ${colorClass}
              ${isConflicted ? 'ring-1 ring-red-300' : ''}
            `}
          >
            {/* Row 1: Time + Patient */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isConflicted && (
                  <AlertTriangle size={14} className="shrink-0 text-red-500" />
                )}
                <span className="text-xs font-bold text-gray-500 shrink-0 tabular-nums">
                  {entry.startTime}–{entry.endTime}
                </span>
                <span className="text-sm font-bold text-gray-800 truncate">
                  {entry.patientName}
                </span>
              </div>
              <ChevronRight size={14} className="shrink-0 text-gray-300" />
            </div>

            {/* Row 2: Surgery name */}
            <p className="text-xs text-gray-600 truncate mb-1.5 pl-0.5">
              {entry.tenKT}
            </p>

            {/* If conflicted: show exact conflict badges. If not conflicted: only patient & surgery name are displayed */}
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
          </button>
        );
      })}
    </div>
  );
};
