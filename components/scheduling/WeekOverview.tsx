import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { subscribeScheduleForWeek } from '../../services/scheduleService';
import { detectConflicts } from '../../services/scheduleConflictService';
import type { ScheduledSurgery } from '../../types/schedule';
import type { RoleFilterConfig } from '../../contexts/ConfigContext';

interface WeekOverviewProps {
  /** First day of the week (Monday) */
  weekStart: Date;
  onDayClick: (date: Date) => void;
  roleFilters: RoleFilterConfig;
  /** Currently selected date string (yyyy-mm-dd) */
  selectedDate: string;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_NAMES_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * Week overview: 7 compact day columns showing surgery count + conflict count.
 * Click on a day to navigate to that day's timeline.
 */
export const WeekOverview: React.FC<WeekOverviewProps> = ({
  weekStart,
  onDayClick,
  roleFilters,
  selectedDate,
}) => {
  const [entriesByDate, setEntriesByDate] = useState<Record<string, ScheduledSurgery[]>>({});

  const dates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const dateStrings = useMemo(() => dates.map(toDateString), [dates]);

  useEffect(() => {
    const unsub = subscribeScheduleForWeek(dateStrings, setEntriesByDate);
    return () => unsub();
  }, [dateStrings]);

  const todayStr = toDateString(new Date());

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {dates.map((date, i) => {
        const dateStr = dateStrings[i];
        const dayEntries = entriesByDate[dateStr] || [];
        const conflicts = detectConflicts(dayEntries, roleFilters);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;
        const dd = date.getDate();

        return (
          <button
            key={dateStr}
            onClick={() => onDayClick(date)}
            className={`flex flex-col items-center gap-0.5 py-2 sm:py-2.5 px-1 rounded-xl transition-all cursor-pointer
              border text-center min-w-0
              ${isSelected
                ? 'bg-primary-700 text-white border-primary-700 shadow-md'
                : isToday
                  ? 'bg-primary-50 text-primary-800 border-primary-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }
              active:scale-95
            `}
          >
            {/* Day name */}
            <span className={`text-[10px] font-bold uppercase ${
              isSelected ? 'text-white/70' : 'text-gray-400'
            }`}>
              {DAY_NAMES_SHORT[i]}
            </span>

            {/* Day number */}
            <span className={`text-base sm:text-lg font-bold leading-none ${
              isSelected ? 'text-white' : ''
            }`}>
              {dd}
            </span>

            {/* Surgery count */}
            {dayEntries.length > 0 && (
              <span className={`text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded-full ${
                isSelected
                  ? 'bg-white/20 text-white'
                  : 'bg-primary-100 text-primary-700'
              }`}>
                {dayEntries.length} ca
              </span>
            )}

            {/* Conflict indicator */}
            {conflicts.length > 0 && (
              <span className={`flex items-center gap-0.5 text-[9px] font-bold mt-0.5 ${
                isSelected ? 'text-red-200' : 'text-red-500'
              }`}>
                <AlertTriangle size={9} />
                {conflicts.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
