import React from 'react';
import { AlertTriangle, Cpu, User } from 'lucide-react';
import type { ScheduleConflict } from '../../types/schedule';

interface ConflictSummaryProps {
  conflicts: ScheduleConflict[];
  totalEntries: number;
}

export const ConflictSummary: React.FC<ConflictSummaryProps> = ({
  conflicts,
  totalEntries,
}) => {
  const machineConflicts = conflicts.filter((c) => c.type === 'MACHINE');
  const staffConflicts = conflicts.filter((c) => c.type === 'STAFF');

  if (conflicts.length === 0) {
    // Don't show anything when there are no surgeries at all
    if (totalEntries === 0) return null;

    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
        <span className="text-emerald-500">✓</span>
        {`${totalEntries} ca mổ — Không có xung đột`}
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-red-100/50 border-b border-red-200">
        <AlertTriangle size={14} className="text-red-500" />
        <span className="text-xs font-bold text-red-800">
          {totalEntries} ca mổ — {conflicts.length} xung đột phát hiện
        </span>
      </div>

      {/* Conflict list */}
      <div className="px-4 py-2 space-y-1.5 max-h-32 overflow-y-auto">
        {machineConflicts.map((c, i) => (
          <div key={`m-${i}`} className="flex items-start gap-2 text-[11px] text-red-800">
            <Cpu size={12} className="shrink-0 mt-0.5 text-red-400" />
            <span>{c.description}</span>
          </div>
        ))}
        {staffConflicts.map((c, i) => (
          <div key={`s-${i}`} className="flex items-start gap-2 text-[11px] text-red-800">
            <User size={12} className="shrink-0 mt-0.5 text-red-400" />
            <span>{c.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
