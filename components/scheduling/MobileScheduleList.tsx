import React from 'react';
import { AlertTriangle, Clock, Cpu, User, ChevronRight } from 'lucide-react';
import type { ScheduledSurgery } from '../../types/schedule';
import { STAFF_ROLE_LABELS } from '../../types/schedule';

interface MobileScheduleListProps {
  entries: ScheduledSurgery[];
  conflictedIds: Set<string>;
  onEntryClick: (entry: ScheduledSurgery) => void;
}

/** Color palette mirroring DayTimelineView */
const CARD_COLORS = [
  'border-l-primary-400 bg-primary-50/50',
  'border-l-emerald-400 bg-emerald-50/50',
  'border-l-amber-400 bg-amber-50/50',
  'border-l-sky-400 bg-sky-50/50',
  'border-l-violet-400 bg-violet-50/50',
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
  onEntryClick,
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

  // Group by time for visual separation
  const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="space-y-2">
      {sorted.map((entry, idx) => {
        const isConflicted = conflictedIds.has(entry.id);
        const staffEntries = Object.entries(entry.staff || {}).filter(([, v]) => v);
        const colorClass = isConflicted
          ? 'border-l-red-500 bg-red-50'
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

            {/* Row 3: Machine + key staff */}
            <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-500">
              {entry.machineName && (
                <span className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                  <Cpu size={10} />
                  {entry.machineName}
                </span>
              )}
              {staffEntries.slice(0, 3).map(([role, name]) => (
                <span key={role} className="flex items-center gap-0.5">
                  <User size={9} className="text-gray-400" />
                  <span className="text-gray-400">{STAFF_ROLE_LABELS[role]?.slice(0, 4)}:</span>
                  <span className="font-medium text-gray-600">{name}</span>
                </span>
              ))}
              {staffEntries.length > 3 && (
                <span className="text-gray-400">+{staffEntries.length - 3}</span>
              )}
            </div>

            {/* Conflict warning */}
            {isConflicted && (
              <div className="mt-1.5 text-[10px] text-red-600 font-semibold flex items-center gap-1">
                <AlertTriangle size={10} />
                Xung đột thời gian
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
