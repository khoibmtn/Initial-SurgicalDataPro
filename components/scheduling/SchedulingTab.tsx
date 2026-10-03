import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Calendar,
  BarChart3, Download, Copy, Filter, Cpu, User, X,
  List, Clock, MoveHorizontal, MoveVertical,
} from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { DayTimelineView, type ZoomLevel, type TimelineOrientation } from './DayTimelineView';
import { MobileScheduleList } from './MobileScheduleList';
import { WeekOverview } from './WeekOverview';
import { ConflictSummary } from './ConflictSummary';
import { ScheduleSurgeryModal } from './ScheduleSurgeryModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  subscribeScheduleForDate,
  addScheduledSurgery,
  updateScheduledSurgery,
  deleteScheduledSurgery,
} from '../../services/scheduleService';
import { detectConflicts, getConflictedSurgeryIds } from '../../services/scheduleConflictService';
import { subscribeToSurgeryNamePrices } from '../../services/surgeryNamePriceService';
import { exportScheduleToExcel } from '../../services/scheduleExportService';
import { getScheduleForDate } from '../../services/overtimeCalculationService';
import type { ScheduledSurgery, ScheduledSurgeryInput } from '../../types/schedule';
import type { SurgeryNamePrice } from '../../types';
import { Tooltip } from '../common/Tooltip';

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(d: Date): string {
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayName = dayNames[d.getDay()];
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dayName}, ${dd}/${mm}/${d.getFullYear()}`;
}

function formatShortDate(d: Date): string {
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}`;
}

function getWeekStart(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export const SchedulingTab: React.FC = () => {
  const { config } = useConfig();
  const { user, isAdmin, isHead } = useAuth();
  const canManageAll = isAdmin || isHead;
  const isMobile = useIsMobile();

  // Navigation
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const dateStr = useMemo(() => toDateString(currentDate), [currentDate]);
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);

  // View
  const [showWeek, setShowWeek] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 80 : 120
  );
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');
  const [timelineOrientation, setTimelineOrientation] = useState<TimelineOrientation>(() => {
    if (typeof window !== 'undefined') {
      const isSmall = window.innerWidth < 768;
      const key = isSmall ? 'surgical_timeline_orientation_mobile' : 'surgical_timeline_orientation_desktop';
      const saved = localStorage.getItem(key) || localStorage.getItem('surgical_timeline_orientation');
      if (saved === 'horizontal' || saved === 'vertical') return saved;
      return isSmall ? 'vertical' : 'horizontal';
    }
    return 'horizontal';
  });

  const handleOrientationChange = (o: TimelineOrientation) => {
    setTimelineOrientation(o);
    try {
      const isSmall = window.innerWidth < 768;
      const key = isSmall ? 'surgical_timeline_orientation_mobile' : 'surgical_timeline_orientation_desktop';
      localStorage.setItem(key, o);
      localStorage.setItem('surgical_timeline_orientation', o);
    } catch {
      // ignore
    }
  };

  // Auto-adapt when screen resizes across mobile/desktop breakpoint if user hasn't explicitly set for that mode
  useEffect(() => {
    const handleResize = () => {
      const isSmall = window.innerWidth < 768;
      const key = isSmall ? 'surgical_timeline_orientation_mobile' : 'surgical_timeline_orientation_desktop';
      const saved = localStorage.getItem(key);
      if (saved === 'horizontal' || saved === 'vertical') {
        setTimelineOrientation(saved);
      } else {
        setTimelineOrientation(isSmall ? 'vertical' : 'horizontal');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Data
  const [entries, setEntries] = useState<ScheduledSurgery[]>([]);
  const [surgeryNames, setSurgeryNames] = useState<SurgeryNamePrice[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduledSurgery | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<ScheduledSurgery | null>(null);

  // Duplicate
  const [duplicateTarget, setDuplicateTarget] = useState<ScheduledSurgery | null>(null);
  const [duplicateDate, setDuplicateDate] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Conflict filters
  const [conflictFilter, setConflictFilter] = useState<'ALL' | 'MACHINE' | 'STAFF'>('ALL');
  const [filterMachine, setFilterMachine] = useState<string>('');
  const [filterStaff, setFilterStaff] = useState<string>('');
  const [showFilterBar, setShowFilterBar] = useState(false);

  // Subscribe
  useEffect(() => {
    const unsub = subscribeScheduleForDate(dateStr, setEntries);
    return () => unsub();
  }, [dateStr]);

  useEffect(() => {
    const unsub = subscribeToSurgeryNamePrices((prices) => setSurgeryNames(prices));
    return () => unsub();
  }, []);

  // Duty shift season & start hour (07:30 in winter, 07:00 in summer)
  const seasonSchedule = useMemo(() => {
    return getScheduleForDate(currentDate, config.workingHours);
  }, [currentDate, config.workingHours]);

  const dutyStartStr = seasonSchedule?.morningFrom || '07:30';
  const dutyStartHour = useMemo(() => {
    const [h, m] = dutyStartStr.split(':').map(Number);
    return (isNaN(h) ? 7 : h) + (isNaN(m) ? 30 : m) / 60;
  }, [dutyStartStr]);

  // Conflicts
  const roleFilters = config.reportRoleFilters;
  const allConflicts = useMemo(() => detectConflicts(entries, roleFilters, dutyStartHour), [entries, roleFilters, dutyStartHour]);
  
  // Filtered conflicts based on filter selections
  const conflicts = useMemo(() => {
    let filtered = allConflicts;
    if (conflictFilter !== 'ALL') {
      filtered = filtered.filter((c) => c.type === conflictFilter);
    }
    if (filterMachine) {
      filtered = filtered.filter((c) => c.type === 'MACHINE' && c.resource === filterMachine);
    }
    if (filterStaff) {
      filtered = filtered.filter((c) => c.type === 'STAFF' && c.resource === filterStaff);
    }
    return filtered;
  }, [allConflicts, conflictFilter, filterMachine, filterStaff]);

  const conflictedIds = useMemo(() => getConflictedSurgeryIds(conflicts), [conflicts]);

  // Unique machines and staff in conflicts for filter dropdowns
  const conflictMachines = useMemo(() => {
    const set = new Set<string>();
    allConflicts.filter((c) => c.type === 'MACHINE').forEach((c) => set.add(c.resource));
    return Array.from(set);
  }, [allConflicts]);

  const conflictStaffNames = useMemo(() => {
    const set = new Set<string>();
    allConflicts.filter((c) => c.type === 'STAFF').forEach((c) => set.add(c.resource));
    return Array.from(set);
  }, [allConflicts]);

  const hasActiveFilter = conflictFilter !== 'ALL' || !!filterMachine || !!filterStaff;
  const clearFilters = () => { setConflictFilter('ALL'); setFilterMachine(''); setFilterStaff(''); };

  // Nav
  const goToPrevDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const goToNextDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const goToToday = () => setCurrentDate(new Date());

  // Save — cho phép người dùng chỉnh sửa ca mổ để sắp xếp lại và xóa trùng lịch
  const handleSave = useCallback(async (data: ScheduledSurgeryInput) => {
    const creatorId = user?.uid || 'guest';
    const creatorName = user?.displayName || (user ? 'Unknown' : 'Người dùng');
    if (editingEntry) {
      await updateScheduledSurgery(editingEntry.date, editingEntry.id, data);
    } else {
      await addScheduledSurgery(data, creatorId, creatorName);
    }
  }, [user, editingEntry]);

  // Click entry — always open for view/edit
  const handleEntryClick = useCallback((entry: ScheduledSurgery) => {
    setEditingEntry(entry);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingEntry(undefined);
  }, []);

  // Delete directly from modal or FAB
  const handleDeleteDirect = useCallback(async (entry: ScheduledSurgery) => {
    await deleteScheduledSurgery(entry.date, entry.id);
    closeModal();
  }, [closeModal]);

  // Delete from confirm dialog
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteScheduledSurgery(deleteTarget.date, deleteTarget.id);
    setDeleteTarget(null);
    closeModal();
  }, [deleteTarget, closeModal]);

  // Duplicate — copy surgery to another date
  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicateTarget || !duplicateDate || !user) return;
    setIsDuplicating(true);
    try {
      const input: ScheduledSurgeryInput = {
        date: duplicateDate,
        patientId: duplicateTarget.patientId,
        patientName: duplicateTarget.patientName,
        tenKT: duplicateTarget.tenKT,
        startTime: duplicateTarget.startTime,
        endTime: duplicateTarget.endTime,
        machineCode: duplicateTarget.machineCode,
        machineName: duplicateTarget.machineName,
        staff: { ...duplicateTarget.staff },
        note: duplicateTarget.note,
      };
      await addScheduledSurgery(input, user.uid, user.displayName || 'Unknown');
      setDuplicateTarget(null);
      setDuplicateDate('');
      // Navigate to the duplicated date
      setCurrentDate(new Date(duplicateDate + 'T00:00:00'));
    } finally {
      setIsDuplicating(false);
    }
  }, [duplicateTarget, duplicateDate, user]);

  // Export
  const handleExport = useCallback(() => {
    if (entries.length === 0) return;
    exportScheduleToExcel(entries, dateStr);
  }, [entries, dateStr]);

  const handleAddNew = () => { setEditingEntry(undefined); setShowModal(true); };

  const isToday = toDateString(new Date()) === dateStr;

  // Swipe
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(diff) > 80) { diff > 0 ? goToPrevDay() : goToNextDay(); }
    setTouchStartX(null);
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 animate-fade-in max-w-[1800px] mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <button
            onClick={goToPrevDay}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer shrink-0"
          >
            <ChevronLeft size={isMobile ? 16 : 18} />
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar size={14} className="text-primary-600 shrink-0 hidden sm:block" />
            <h2 className="text-xs sm:text-sm font-bold text-gray-800 truncate">
              {isMobile ? formatShortDate(currentDate) : formatDisplayDate(currentDate)}
            </h2>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-[10px] font-semibold text-primary-600 hover:text-primary-800 underline cursor-pointer shrink-0"
              >
                Nay
              </button>
            )}
          </div>

          <button
            onClick={goToNextDay}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer shrink-0"
          >
            <ChevronRight size={isMobile ? 16 : 18} />
          </button>

          <input
            type="date"
            value={dateStr}
            onChange={(e) => setCurrentDate(new Date(e.target.value + 'T00:00:00'))}
            className="hidden sm:block text-xs border border-gray-300 rounded-lg px-2 py-1.5 cursor-pointer focus:border-primary-400 outline-none"
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* View Mode Toggle: Timeline vs List */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 shrink-0">
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-primary-700 shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Dòng thời gian (Timeline)"
            >
              <Clock size={13} />
              <span className="hidden xs:inline">Timeline</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-primary-700 shadow-xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Danh sách (List)"
            >
              <List size={13} />
              <span className="hidden xs:inline">Danh sách</span>
            </button>
          </div>

          {/* Orientation Toggle (when in Timeline mode) */}
          {viewMode === 'timeline' && (
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 shrink-0 animate-fade-in">
              <button
                onClick={() => handleOrientationChange('horizontal')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                  timelineOrientation === 'horizontal'
                    ? 'bg-white text-primary-700 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Bố trí Dòng thời gian nằm ngang (↔)"
              >
                <MoveHorizontal size={13} />
                <span className="hidden sm:inline">Ngang</span>
              </button>
              <button
                onClick={() => handleOrientationChange('vertical')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                  timelineOrientation === 'vertical'
                    ? 'bg-white text-primary-700 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Bố trí Dòng thời gian thẳng đứng (↕)"
              >
                <MoveVertical size={13} />
                <span className="hidden sm:inline">Dọc</span>
              </button>
            </div>
          )}

          {/* Export */}
          <Tooltip content="Xuất lịch mổ ra Excel" position="bottom">
            <button
              onClick={handleExport}
              disabled={entries.length === 0}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${
                entries.length === 0 ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <Download size={isMobile ? 14 : 16} />
            </button>
          </Tooltip>

          {/* Week toggle */}
          <Tooltip content={showWeek ? 'Ẩn tuần' : 'Xem tổng quan tuần'} position="bottom">
            <button
              onClick={() => setShowWeek((v) => !v)}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${
                showWeek ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <BarChart3 size={isMobile ? 14 : 16} />
            </button>
          </Tooltip>

          {/* Add */}
          <Tooltip content="Đăng ký ca mổ mới" position="bottom">
            <button
              onClick={handleAddNew}
              className="flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary-700 text-white font-bold
                         text-[11px] sm:text-xs rounded-xl hover:bg-primary-800 active:scale-95 transition-all
                         shadow-sm cursor-pointer"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Thêm ca mổ</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Week Overview ── */}
      {showWeek && (
        <div className="animate-slide-down">
          <WeekOverview
            weekStart={weekStart}
            onDayClick={(d) => setCurrentDate(d)}
            roleFilters={roleFilters}
            selectedDate={dateStr}
          />
        </div>
      )}

      {/* ── Conflict Summary ── */}
      <ConflictSummary conflicts={allConflicts} totalEntries={entries.length} />

      {/* ── Conflict Filter Bar ── */}
      {allConflicts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 animate-fade-in">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilterBar(!showFilterBar)}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                hasActiveFilter
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Filter size={12} />
              Bộ lọc xung đột
              {hasActiveFilter && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full text-[9px]">ON</span>
              )}
            </button>

            {/* Quick filter chips */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setConflictFilter('ALL'); setFilterMachine(''); setFilterStaff(''); }}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                  conflictFilter === 'ALL' && !filterMachine && !filterStaff
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Tất cả ({allConflicts.length})
              </button>
              {allConflicts.some((c) => c.type === 'MACHINE') && (
                <button
                  onClick={() => { setConflictFilter('MACHINE'); setFilterStaff(''); }}
                  className={`flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                    conflictFilter === 'MACHINE' && !filterMachine
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  <Cpu size={10} /> Trùng máy ({allConflicts.filter((c) => c.type === 'MACHINE').length})
                </button>
              )}
              {allConflicts.some((c) => c.type === 'STAFF') && (
                <button
                  onClick={() => { setConflictFilter('STAFF'); setFilterMachine(''); }}
                  className={`flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                    conflictFilter === 'STAFF' && !filterStaff
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  <User size={10} /> Trùng nhân sự ({allConflicts.filter((c) => c.type === 'STAFF').length})
                </button>
              )}
            </div>

            {hasActiveFilter && (
              <button onClick={clearFilters}
                className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={10} /> Xóa lọc
              </button>
            )}
          </div>

          {/* Expanded filter: specific machine / staff */}
          {showFilterBar && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
              {conflictMachines.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-medium">Máy:</span>
                  {conflictMachines.map((m) => (
                    <button key={m}
                      onClick={() => { setFilterMachine(filterMachine === m ? '' : m); setConflictFilter(filterMachine === m ? 'ALL' : 'MACHINE'); setFilterStaff(''); }}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                        filterMachine === m ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
              {conflictStaffNames.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-medium">NV:</span>
                  {conflictStaffNames.map((s) => (
                    <button key={s}
                      onClick={() => { setFilterStaff(filterStaff === s ? '' : s); setConflictFilter(filterStaff === s ? 'ALL' : 'STAFF'); setFilterMachine(''); }}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full transition-all cursor-pointer ${
                        filterStaff === s ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Main Content ── */}
      <div
        onTouchStart={isMobile && (viewMode === 'list' || timelineOrientation === 'vertical') ? handleTouchStart : undefined}
        onTouchEnd={isMobile && (viewMode === 'list' || timelineOrientation === 'vertical') ? handleTouchEnd : undefined}
      >
        {viewMode === 'list' ? (
          <MobileScheduleList
            entries={entries}
            conflictedIds={conflictedIds}
            conflicts={conflicts}
            onEntryClick={handleEntryClick}
            dutyStartHour={dutyStartHour}
          />
        ) : (
          <DayTimelineView
            entries={entries}
            conflictedIds={conflictedIds}
            conflicts={conflicts}
            onEntryClick={handleEntryClick}
            currentUserId={user?.uid}
            hourWidth={zoomLevel}
            onZoomChange={setZoomLevel}
            orientation={timelineOrientation}
            onOrientationChange={handleOrientationChange}
            selectedDate={dateStr}
            workingHours={config.workingHours}
          />
        )}
      </div>

      {/* ── Modal ── */}
      <ScheduleSurgeryModal
        isOpen={showModal}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDeleteDirect}
        editingEntry={editingEntry}
        date={dateStr}
        staffList={config.staffList || []}
        machineRegistry={config.machineRegistry || []}
        surgeryNames={surgeryNames}
        roleFilters={roleFilters}
        tableItems={config.tableItems || []}
        readOnly={false}
        conflicts={allConflicts}
        allEntries={entries}
        onSelectEntry={(entry) => setEditingEntry(entry)}
        workingHours={config.workingHours}
      />

      {/* ── Action FAB (when editing) ── */}
      {showModal && editingEntry && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9001] flex items-center gap-2">
          <Tooltip content="Sao chép ca mổ sang ngày khác" position="top">
            <button
              onClick={() => {
                setDuplicateTarget(editingEntry);
                setDuplicateDate('');
                closeModal();
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-full
                         hover:bg-sky-700 active:scale-95 transition-all shadow-lg cursor-pointer"
            >
              <Copy size={14} />
              Sao chép
            </button>
          </Tooltip>
          <Tooltip content="Xóa ca mổ này khỏi lịch" position="top">
            <button
              onClick={() => setDeleteTarget(editingEntry)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-full
                         hover:bg-red-700 active:scale-95 transition-all shadow-lg cursor-pointer"
            >
              <Trash2 size={14} />
              Xóa
            </button>
          </Tooltip>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Xác nhận xóa ca mổ"
        message={`Bạn có chắc chắn muốn xóa ca mổ của bệnh nhân "${deleteTarget?.patientName}" (${deleteTarget?.startTime}–${deleteTarget?.endTime}) khỏi lịch?`}
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Duplicate Dialog ── */}
      {duplicateTarget && (
        <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm sm:mx-4 p-5 animate-slide-in">
            <h3 className="text-sm font-bold text-gray-800 mb-3">
              📋 Sao chép ca mổ sang ngày khác
            </h3>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-600">
              <p className="font-semibold text-gray-800">{duplicateTarget.patientName}</p>
              <p>{duplicateTarget.tenKT}</p>
              <p className="text-gray-400">{duplicateTarget.startTime}–{duplicateTarget.endTime}</p>
            </div>

            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Chọn ngày đích
            </label>
            <input
              type="date"
              value={duplicateDate}
              onChange={(e) => setDuplicateDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none mb-4"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setDuplicateTarget(null); setDuplicateDate(''); }}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleDuplicateConfirm}
                disabled={!duplicateDate || isDuplicating}
                className={`px-5 py-2 text-xs font-bold rounded-lg transition-all shadow-sm ${
                  !duplicateDate || isDuplicating
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-sky-600 text-white hover:bg-sky-700 active:scale-95 cursor-pointer'
                }`}
              >
                {isDuplicating ? 'Đang sao chép...' : 'Sao chép'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
