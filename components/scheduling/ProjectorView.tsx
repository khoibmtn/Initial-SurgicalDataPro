import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Activity, CalendarClock, CheckCircle2, ListChecks, Maximize2 } from 'lucide-react';
import type { ScheduledSurgery, ScheduleConflict } from '../../types/schedule';
import type { WorkingHours } from '../../contexts/ConfigContext';
import { DayTimelineView, type ZoomLevel } from './DayTimelineView';
import { MobileScheduleList, getNowShiftHours } from './MobileScheduleList';
import { parseTimeToShiftHours } from '../../services/scheduleConflictService';

interface ProjectorViewProps {
  entries: ScheduledSurgery[];
  conflicts: ScheduleConflict[];
  conflictedIds: Set<string>;
  onEntryClick: (entry: ScheduledSurgery) => void;
  onClose: () => void;
  selectedDate: string;
  dateLabel: string;
  dutyStartHour: number;
  dutyStartStr: string;
  workingHours?: WorkingHours;
  currentUserId?: string;
  /** Đang mở modal/dialog → Esc không thoát chế độ chiếu */
  isModalOpen?: boolean;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; tone: string }> = ({ icon, label, value, tone }) => (
  <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${tone}`}>
    {icon}
    <div className="leading-tight">
      <div className="text-3xl font-extrabold tabular-nums">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  </div>
);

const pad = (n: number) => n.toString().padStart(2, '0');

/** Chọn zoom để 24h vừa khung ngang (trừ panel bên phải ~420px). */
function pickZoom(width: number): ZoomLevel {
  const avail = width - 420 - 80;
  if (avail >= 24 * 80) return 80;
  if (avail >= 24 * 60) return 60;
  return 40;
}

/**
 * Chế độ màn hình chiếu: toàn màn hình, chữ lớn, đồng hồ lớn, tự cập nhật realtime.
 * Vẫn bấm vào ca để mở form chỉnh sửa (modal nằm trên lớp này).
 */
export const ProjectorView: React.FC<ProjectorViewProps> = ({
  entries, conflicts, conflictedIds, onEntryClick, onClose,
  selectedDate, dateLabel, dutyStartHour, dutyStartStr, workingHours, currentUserId, isModalOpen = false,
}) => {
  const modalOpenRef = React.useRef(isModalOpen);
  modalOpenRef.current = isModalOpen;
  const [now, setNow] = useState(() => new Date());
  const [zoom, setZoom] = useState<ZoomLevel>(() => pickZoom(window.innerWidth));
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onResize = () => setZoom(pickZoom(window.innerWidth));
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      // Esc khi không fullscreen → thoát chế độ chiếu (khi fullscreen, Esc của trình duyệt thoát fullscreen trước)
      if (e.key === 'Escape' && !document.fullscreenElement && !modalOpenRef.current) onClose();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const enterFullscreen = () => {
    // Fullscreen cả trang (không chỉ overlay) để modal chỉnh sửa vẫn hiển thị được
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const handleClose = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onClose();
  };

  const stats = useMemo(() => {
    const nowShift = getNowShiftHours(selectedDate, dutyStartHour, now);
    let live = 0, upcoming = 0, done = 0;
    for (const e of entries) {
      const s = parseTimeToShiftHours(e.startTime, dutyStartHour);
      let end = parseTimeToShiftHours(e.endTime, dutyStartHour);
      if (end <= s) end += 24;
      if (nowShift === null) continue;
      if (end <= nowShift) done++;
      else if (s <= nowShift) live++;
      else upcoming++;
    }
    return { live, upcoming, done, isCurrentShift: nowShift !== null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, selectedDate, dutyStartHour, now.getMinutes()]);

  const shiftEnd = (() => {
    const t = (dutyStartHour * 60 - 1 + 1440) % 1440;
    return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
  })();

  return (
    <div
      className="fixed inset-0 z-[9500] flex flex-col bg-gradient-to-br from-slate-50 via-white to-sky-50 animate-fade-in"
      role="region"
      aria-label="Màn hình chiếu lịch mổ"
    >
      {/* Header */}
      <header className="flex items-center gap-6 px-6 py-3 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex flex-col leading-none">
          <span className="text-5xl font-extrabold tabular-nums text-slate-900 tracking-tight">
            {pad(now.getHours())}:{pad(now.getMinutes())}
            <span className="text-2xl text-slate-400">:{pad(now.getSeconds())}</span>
          </span>
          <span className="mt-1 text-sm font-semibold text-slate-500">
            {dateLabel} · Tua trực {dutyStartStr} – {shiftEnd}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-center flex-wrap">
          <StatCard icon={<ListChecks className="h-7 w-7 text-primary-600" />} label="Tổng ca" value={entries.length} tone="bg-primary-50 border-primary-200 text-primary-900" />
          {stats.isCurrentShift && (
            <>
              <StatCard icon={<Activity className="h-7 w-7 text-emerald-600" />} label="Đang mổ" value={stats.live} tone="bg-emerald-50 border-emerald-200 text-emerald-900" />
              <StatCard icon={<CalendarClock className="h-7 w-7 text-sky-600" />} label="Sắp tới" value={stats.upcoming} tone="bg-sky-50 border-sky-200 text-sky-900" />
              <StatCard icon={<CheckCircle2 className="h-7 w-7 text-slate-500" />} label="Đã xong" value={stats.done} tone="bg-slate-50 border-slate-200 text-slate-700" />
            </>
          )}
          <StatCard
            icon={<AlertTriangle className={`h-7 w-7 ${conflicts.length ? 'text-red-600' : 'text-slate-400'}`} />}
            label="Xung đột"
            value={conflicts.length}
            tone={conflicts.length ? 'bg-red-50 border-red-300 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-600'}
          />
        </div>

        <div className="flex items-center gap-2">
          {!isFullscreen && (
            <button
              id="projector-fullscreen-btn"
              onClick={enterFullscreen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 cursor-pointer"
            >
              <Maximize2 size={16} /> Toàn màn hình
            </button>
          )}
          <button
            id="projector-close-btn"
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            title="Thoát chế độ chiếu (Esc)"
          >
            <X size={22} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_400px] gap-4 p-4">
        <div className="min-w-0 min-h-0 overflow-auto rounded-2xl">
          <DayTimelineView
            entries={entries}
            conflictedIds={conflictedIds}
            conflicts={conflicts}
            onEntryClick={onEntryClick}
            currentUserId={currentUserId}
            hourWidth={zoom}
            onZoomChange={setZoom}
            orientation="horizontal"
            selectedDate={selectedDate}
            workingHours={workingHours}
          />
        </div>
        <aside className="min-h-0 overflow-y-auto rounded-2xl bg-white/70 border border-slate-200 p-3 [&_.text-sm]:text-base [&_.text-xs]:text-sm">
          <MobileScheduleList
            entries={entries}
            conflictedIds={conflictedIds}
            conflicts={conflicts}
            onEntryClick={onEntryClick}
            dutyStartHour={dutyStartHour}
            selectedDate={selectedDate}
          />
        </aside>
      </div>
    </div>
  );
};
