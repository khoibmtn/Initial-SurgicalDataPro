import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Calendar,
  BarChart3, Download, Copy, Filter, Cpu, User, Users, X,
  List, Clock, MoveHorizontal, MoveVertical, MonitorPlay,
} from 'lucide-react';
import { useConfig, type RoleFilterConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { DayTimelineView, type ZoomLevel, type TimelineOrientation } from './DayTimelineView';
import { MobileScheduleList } from './MobileScheduleList';
import { WeekOverview } from './WeekOverview';
import { ProjectorView } from './ProjectorView';
import { ConflictSummary } from './ConflictSummary';
import { ScheduleSurgeryModal } from './ScheduleSurgeryModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  subscribeScheduleForDate,
  getCachedSchedule,
  addScheduledSurgery,
  updateScheduledSurgery,
  deleteScheduledSurgery,
  setScheduledSurgeryLock,
} from '../../services/scheduleService';
import { detectConflicts, getConflictedSurgeryIds } from '../../services/scheduleConflictService';
import { subscribeToSurgeryNamePrices } from '../../services/surgeryNamePriceService';
import { exportScheduleToExcel } from '../../services/scheduleExportService';
import { getScheduleForDate } from '../../services/overtimeCalculationService';
import { getTableLimitForRole } from '../../services/laborConfigService';
import type { ScheduledSurgery, ScheduledSurgeryInput } from '../../types/schedule';
import type { SurgeryNamePrice } from '../../types';
import { Tooltip } from '../common/Tooltip';
import { AuthGuardView } from '../auth/AuthGuardView';

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

const VALID_ZOOM_LEVELS: ZoomLevel[] = [40, 60, 80, 120, 180];

interface SavedScheduleUIState {
  dateStr?: string;
  viewMode?: 'timeline' | 'list';
  orientation?: TimelineOrientation;
  zoomLevel?: ZoomLevel;
  showStaff?: boolean;
  shortStaffName?: boolean;
  showWeek?: boolean;
}

const memoryScheduleUIState: SavedScheduleUIState = {};

function readStorageItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function getWeekdayShort(d: Date): string {
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return names[d.getDay()];
}

export const SchedulingTab: React.FC = () => {
  const { config } = useConfig();
  const { user, isAdmin, isHead, isAuthenticated, can } = useAuth();
  const canManageAll = isAdmin || isHead;
  const canManageSchedule = isAdmin || can('manage_schedule');
  const canLockSchedule = isAdmin || can('lock_schedule');
  const canUnlockSchedule = isAdmin || can('unlock_schedule');
  const isMobile = useIsMobile();

  // Navigation — giữ nguyên ngày đang chọn khi chuyển tab hoặc tải lại
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const saved = memoryScheduleUIState.dateStr || readStorageItem('surgical_schedule_selected_date');
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      const parsed = new Date(saved + 'T00:00:00');
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const dateStr = useMemo(() => toDateString(currentDate), [currentDate]);
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);

  useEffect(() => {
    memoryScheduleUIState.dateStr = dateStr;
    writeStorageItem('surgical_schedule_selected_date', dateStr);
  }, [dateStr]);

  // View — lưu trữ đầy đủ trạng thái hiển thị
  const [showWeek, setShowWeek] = useState<boolean>(() => {
    if (memoryScheduleUIState.showWeek !== undefined) return memoryScheduleUIState.showWeek;
    return readStorageItem('surgical_schedule_show_week') === 'true';
  });

  const handleShowWeekChange = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setShowWeek((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      memoryScheduleUIState.showWeek = next;
      writeStorageItem('surgical_schedule_show_week', String(next));
      return next;
    });
  }, []);

  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(() => {
    if (memoryScheduleUIState.zoomLevel) return memoryScheduleUIState.zoomLevel;
    const saved = Number(readStorageItem('surgical_timeline_zoom_h'));
    if (VALID_ZOOM_LEVELS.includes(saved as ZoomLevel)) return saved as ZoomLevel;
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 80 : 120;
  });

  const handleZoomLevelChange = useCallback((next: ZoomLevel) => {
    setZoomLevel(next);
    memoryScheduleUIState.zoomLevel = next;
    writeStorageItem('surgical_timeline_zoom_h', String(next));
  }, []);

  const [viewMode, setViewMode] = useState<'timeline' | 'list'>(() => {
    if (memoryScheduleUIState.viewMode) return memoryScheduleUIState.viewMode;
    const saved = readStorageItem('surgical_schedule_view_mode');
    if (saved === 'timeline' || saved === 'list') return saved;
    return 'timeline';
  });

  const handleViewModeChange = useCallback((next: 'timeline' | 'list') => {
    setViewMode(next);
    memoryScheduleUIState.viewMode = next;
    writeStorageItem('surgical_schedule_view_mode', next);
  }, []);

  const [showProjector, setShowProjector] = useState(false);
  const [showStaff, setShowStaff] = useState<boolean>(() => {
    if (memoryScheduleUIState.showStaff !== undefined) return memoryScheduleUIState.showStaff;
    return readStorageItem('surgical_timeline_show_staff') === 'true';
  });

  const handleShowStaffChange = useCallback((next: boolean) => {
    setShowStaff(next);
    memoryScheduleUIState.showStaff = next;
    writeStorageItem('surgical_timeline_show_staff', String(next));
  }, []);

  const [shortStaffName, setShortStaffName] = useState<boolean>(() => {
    if (memoryScheduleUIState.shortStaffName !== undefined) return memoryScheduleUIState.shortStaffName;
    return readStorageItem('surgical_timeline_short_staff') === 'true';
  });

  const handleShortStaffNameChange = useCallback((next: boolean) => {
    setShortStaffName(next);
    memoryScheduleUIState.shortStaffName = next;
    writeStorageItem('surgical_timeline_short_staff', String(next));
  }, []);

  const [timelineOrientation, setTimelineOrientation] = useState<TimelineOrientation>(() => {
    if (memoryScheduleUIState.orientation) return memoryScheduleUIState.orientation;
    const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
    const key = isSmall ? 'surgical_timeline_orientation_mobile' : 'surgical_timeline_orientation_desktop';
    const saved = readStorageItem('surgical_timeline_orientation') || readStorageItem(key);
    if (saved === 'horizontal' || saved === 'vertical') return saved;
    return isSmall ? 'vertical' : 'horizontal';
  });

  const handleOrientationChange = useCallback((o: TimelineOrientation) => {
    setTimelineOrientation(o);
    memoryScheduleUIState.orientation = o;
    const isSmall = typeof window !== 'undefined' && window.innerWidth < 768;
    const key = isSmall ? 'surgical_timeline_orientation_mobile' : 'surgical_timeline_orientation_desktop';
    writeStorageItem(key, o);
    writeStorageItem('surgical_timeline_orientation', o);
  }, []);

  // Chỉ tự điều chỉnh hướng khi vượt qua ranh giới breakpoint mobile/desktop VÀ người dùng chưa từng lưu cài đặt
  useEffect(() => {
    let prevIsSmall = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    const handleResize = () => {
      const isSmall = window.innerWidth < 768;
      if (isSmall === prevIsSmall) return;
      prevIsSmall = isSmall;
      const savedGlobal = readStorageItem('surgical_timeline_orientation');
      const key = isSmall ? 'surgical_timeline_orientation_mobile' : 'surgical_timeline_orientation_desktop';
      const savedKey = readStorageItem(key);
      const saved = savedKey || savedGlobal;
      if (saved === 'horizontal' || saved === 'vertical') {
        setTimelineOrientation(saved);
      } else if (!memoryScheduleUIState.orientation) {
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

  // Subscribe — hiển thị ngay dữ liệu cache, rồi cập nhật realtime
  const [scheduleStatus, setScheduleStatus] = useState<'loading' | 'cached' | 'live'>(() =>
    getCachedSchedule(toDateString(new Date())) ? 'cached' : 'loading'
  );
  useEffect(() => {
    if (!isAuthenticated) return;
    const cached = getCachedSchedule(dateStr);
    setEntries(cached ?? []);
    setScheduleStatus(cached ? 'cached' : 'loading');
    const unsub = subscribeScheduleForDate(dateStr, (next) => {
      setEntries(next);
      setScheduleStatus('live');
    });
    return () => unsub();
  }, [dateStr, isAuthenticated]);

  // Prefetch ngày trước/sau để chuyển ngày tức thì (payload nhỏ)
  useEffect(() => {
    if (scheduleStatus !== 'live') return;
    const shift = (days: number) => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + days);
      return toDateString(d);
    };
    const unsubs = [shift(-1), shift(1)].map((d) => subscribeScheduleForDate(d, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [currentDate, scheduleStatus === 'live']); // eslint-disable-line react-hooks/exhaustive-deps

  // Danh mục tên PT (~2.5MB) chỉ cần cho modal → tải khi mở modal lần đầu
  const [needSurgeryNames, setNeedSurgeryNames] = useState(false);
  useEffect(() => {
    if (showModal) setNeedSurgeryNames(true);
  }, [showModal]);
  useEffect(() => {
    if (!needSurgeryNames) return;
    const unsub = subscribeToSurgeryNamePrices((prices) => setSurgeryNames(prices));
    return () => unsub();
  }, [needSurgeryNames]);

  // Duty shift season & start hour (07:30 in winter, 07:00 in summer)
  const seasonSchedule = useMemo(() => {
    return getScheduleForDate(currentDate, config.workingHours);
  }, [currentDate, config.workingHours]);

  const dutyStartStr = seasonSchedule?.morningFrom || '07:30';
  const dutyStartHour = useMemo(() => {
    const [h, m] = dutyStartStr.split(':').map(Number);
    return (isNaN(h) ? 7 : h) + (isNaN(m) ? 30 : m) / 60;
  }, [dutyStartStr]);

  // Conflicts — vị trí cần check trùng lấy từ "Định mức bàn mổ" (limit > 0),
  // KHÔNG dùng reportRoleFilters (đó là bộ lọc nhập báo cáo, không liên quan xếp lịch)
  const roleLimits = useMemo<Record<string, number>>(() => {
    const keys = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc'];
    return Object.fromEntries(
      keys.map((k) => [k, getTableLimitForRole(k, dateStr, config.tableItems, config.staffLimits)])
    );
  }, [config.tableItems, config.staffLimits, dateStr]);
  const roleFilters = useMemo<RoleFilterConfig>(() => ({
    ptChinh: roleLimits.ptChinh > 0,
    ptPhu: roleLimits.ptPhu > 0,
    bsGM: roleLimits.bsGM > 0,
    ktvGM: roleLimits.ktvGM > 0,
    tdc: roleLimits.tdc > 0,
  }), [roleLimits]);
  const allConflicts = useMemo(
    () => detectConflicts(entries, roleFilters, dutyStartHour, roleLimits),
    [entries, roleFilters, dutyStartHour, roleLimits]
  );
  
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

  // Save — cho phép người dùng chỉnh sửa ca mổ khi có quyền manage_schedule và ca mổ chưa khóa
  const handleSave = useCallback(async (data: ScheduledSurgeryInput) => {
    if (!canManageSchedule) return;
    const creatorId = user?.uid || 'guest';
    const creatorName = user?.displayName || (user ? 'Unknown' : 'Người dùng');
    if (editingEntry) {
      if (editingEntry.locked) return;
      await updateScheduledSurgery(editingEntry.date, editingEntry.id, data);
    } else {
      await addScheduledSurgery(data, creatorId, creatorName);
    }
  }, [user, editingEntry, canManageSchedule]);

  // Khóa / Mở khóa ca mổ trên lịch
  const handleToggleLock = useCallback(
    async (entry: ScheduledSurgery, nextLocked: boolean) => {
      if (nextLocked && !canLockSchedule) return;
      if (!nextLocked && !canUnlockSchedule) return;
      const actorName = user?.displayName || user?.nickname || 'Người dùng';
      const now = Date.now();
      const updatedEntry: ScheduledSurgery = {
        ...entry,
        locked: nextLocked,
        lockedBy: nextLocked ? user?.uid : undefined,
        lockedByName: nextLocked ? actorName : undefined,
        lockedAt: nextLocked ? now : undefined,
        updatedAt: now,
      };
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updatedEntry : e)));
      setEditingEntry((prev) => (prev && prev.id === entry.id ? updatedEntry : prev));

      await setScheduledSurgeryLock(entry.date, entry.id, nextLocked, {
        userId: user?.uid,
        userName: actorName,
        userRole: user?.role,
        department: user?.department,
        patientName: entry.patientName,
      });
    },
    [canLockSchedule, canUnlockSchedule, user]
  );

  // Drag & Drop time update — cập nhật tức thì trên UI rồi lưu lên Firebase (chặn nếu ca đã khóa hoặc không có quyền)
  const handleEntryTimeChange = useCallback(
    async (entry: ScheduledSurgery, newStartTime: string, newEndTime: string) => {
      if (!canManageSchedule || entry.locked) return;
      if (newStartTime === entry.startTime && newEndTime === entry.endTime) return;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, startTime: newStartTime, endTime: newEndTime } : e
        )
      );
      try {
        await updateScheduledSurgery(entry.date, entry.id, {
          date: entry.date,
          patientId: entry.patientId,
          patientName: entry.patientName,
          tenKT: entry.tenKT,
          startTime: newStartTime,
          endTime: newEndTime,
          machineCode: entry.machineCode,
          machineName: entry.machineName,
          staff: entry.staff || {},
          ...(entry.note ? { note: entry.note } : {}),
        });
      } catch (err) {
        console.error('Error updating dragged surgery time:', err);
      }
    },
    [canManageSchedule]
  );

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
    if (!canManageSchedule || entry.locked) return;
    await deleteScheduledSurgery(entry.date, entry.id);
    closeModal();
  }, [closeModal, canManageSchedule]);

  // Delete from confirm dialog
  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !canManageSchedule || deleteTarget.locked) return;
    await deleteScheduledSurgery(deleteTarget.date, deleteTarget.id);
    setDeleteTarget(null);
    closeModal();
  }, [deleteTarget, closeModal, canManageSchedule]);

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

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 bg-gray-50/50 p-4">
        <AuthGuardView
          featureName="Lịch mổ phẫu thuật"
          description="Lịch mổ và kíp mổ trực tuyến được đồng bộ realtime từ dữ liệu lưu trữ. Vui lòng đăng nhập để theo dõi và sắp xếp lịch mổ."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:gap-3 p-2.5 sm:p-4 pb-20 sm:pb-4 animate-fade-in max-w-[1800px] mx-auto w-full">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {/* Date Navigation & Picker — luôn hiển thị đầy đủ trên cả điện thoại và máy tính */}
        <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2 min-w-0 w-full sm:w-auto bg-white sm:bg-transparent px-2 py-1.5 sm:p-0 rounded-xl border border-gray-200 sm:border-0 shadow-2xs sm:shadow-none">
          <button
            type="button"
            data-testid="schedule-prev-day"
            onClick={goToPrevDay}
            title="Ngày trước"
            className="p-1.5 sm:p-2 rounded-lg border border-gray-200 sm:border-0 bg-gray-50 sm:bg-transparent hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer shrink-0"
          >
            <ChevronLeft size={isMobile ? 16 : 18} />
          </button>

          <div className="flex items-center justify-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
            <Calendar size={14} className="text-primary-600 shrink-0 hidden sm:block" />
            <span className="inline-flex sm:hidden items-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 border border-primary-200 text-[11px] font-bold shrink-0">
              {getWeekdayShort(currentDate)}
            </span>
            <h2 className="hidden md:block text-xs sm:text-sm font-bold text-gray-800 truncate">
              {formatDisplayDate(currentDate)}
            </h2>
            <input
              type="date"
              data-testid="schedule-date-picker"
              aria-label="Chọn ngày hiển thị lịch mổ"
              value={dateStr}
              onChange={(e) => {
                if (e.target.value) {
                  setCurrentDate(new Date(e.target.value + 'T00:00:00'));
                }
              }}
              className="block text-xs font-bold sm:font-medium text-gray-800 border border-gray-300 rounded-lg px-2 py-1 sm:py-1.5 bg-white cursor-pointer focus:border-primary-500 outline-none shrink-0"
            />
            {scheduleStatus !== 'live' && (
              <span
                className="flex items-center gap-1 text-[10px] font-medium text-gray-400 shrink-0"
                title={scheduleStatus === 'cached' ? 'Đang hiển thị bản lưu gần nhất, đang đồng bộ…' : 'Đang tải lịch mổ…'}
              >
                <span className="w-2.5 h-2.5 border-2 border-primary-300 border-t-transparent rounded-full animate-spin" />
                <span className="hidden sm:inline">{scheduleStatus === 'cached' ? 'Đang đồng bộ' : 'Đang tải'}</span>
              </span>
            )}
            {!isToday && (
              <button
                type="button"
                data-testid="schedule-today-btn"
                onClick={goToToday}
                className="px-2 py-1 rounded-md bg-primary-50 hover:bg-primary-100 text-[10px] sm:text-[11px] font-bold text-primary-700 border border-primary-200 cursor-pointer shrink-0 transition-colors"
                title="Quay về ngày hôm nay"
              >
                Hôm nay
              </button>
            )}
          </div>

          <button
            type="button"
            data-testid="schedule-next-day"
            onClick={goToNextDay}
            title="Ngày tiếp theo"
            className="p-1.5 sm:p-2 rounded-lg border border-gray-200 sm:border-0 bg-gray-50 sm:bg-transparent hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer shrink-0"
          >
            <ChevronRight size={isMobile ? 16 : 18} />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-1.5 w-full sm:w-auto flex-wrap">
          {/* View Mode Toggle: Timeline vs List */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 shrink-0">
            <button
              type="button"
              onClick={() => handleViewModeChange('timeline')}
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
              type="button"
              onClick={() => handleViewModeChange('list')}
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
                type="button"
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
                type="button"
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

          {/* Toggle hiển thị kíp mổ trên card */}
          <Tooltip content={showStaff ? 'Ẩn tên kíp mổ trên card' : 'Hiển thị tên & vị trí kíp mổ trên card'} position="bottom">
            <button
              type="button"
              onClick={() => handleShowStaffChange(!showStaff)}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                showStaff
                  ? 'bg-primary-100 text-primary-700 border-primary-300 shadow-2xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Users size={14} />
              <span className="hidden md:inline">Kíp mổ</span>
            </button>
          </Tooltip>

          {/* Toggle hiển thị tên nhân viên & vị trí dạng vắn tắt (chỉ hiện khi bật Kíp mổ) */}
          {showStaff && (
            <Tooltip
              content={
                shortStaffName
                  ? 'Đang hiện tên tắt (VD: PTC: NTT Hương) — nhấn để hiện tên đầy đủ'
                  : 'Rút gọn tên vị trí & nhân viên (VD: PTC: NTT Hương)'
              }
              position="bottom"
            >
              <button
                type="button"
                data-testid="header-toggle-short-staff"
                aria-pressed={shortStaffName}
                onClick={() => handleShortStaffNameChange(!shortStaffName)}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  shortStaffName
                    ? 'bg-teal-100 text-teal-800 border-teal-300 shadow-2xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <span className="text-[10px] font-extrabold px-1 py-0.2 rounded bg-black/5 leading-none">
                  {shortStaffName ? 'Tắt' : 'Đủ'}
                </span>
                <span className="hidden md:inline">Tên tắt</span>
              </button>
            </Tooltip>
          )}

          {/* Projector / large screen mode */}
          {!isMobile && (
            <Tooltip content="Màn hình chiếu (theo dõi toàn màn hình)" position="bottom">
              <button
                type="button"
                id="schedule-projector-btn"
                onClick={() => setShowProjector(true)}
                className="p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer shrink-0 hover:bg-gray-100 text-gray-500"
              >
                <MonitorPlay size={16} />
              </button>
            </Tooltip>
          )}

          {/* Export */}
          <Tooltip content="Xuất lịch mổ ra Excel" position="bottom">
            <button
              type="button"
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
              type="button"
              onClick={() => handleShowWeekChange((v) => !v)}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${
                showWeek ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <BarChart3 size={isMobile ? 14 : 16} />
            </button>
          </Tooltip>

          {/* Add */}
          {canManageSchedule && (
            <Tooltip content="Đăng ký ca mổ mới" position="bottom">
              <button
                type="button"
                onClick={handleAddNew}
                className="flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary-700 text-white font-bold
                           text-[11px] sm:text-xs rounded-xl hover:bg-primary-800 active:scale-95 transition-all
                           shadow-sm cursor-pointer"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Thêm ca mổ</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── Week Overview ── */}
      {showWeek && (
        <div className="animate-slide-down">
          <WeekOverview
            weekStart={weekStart}
            onDayClick={(d) => setCurrentDate(d)}
            roleFilters={roleFilters}
            roleLimits={roleLimits}
            dutyStartHour={dutyStartHour}
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
                      ? 'bg-primary-700 text-white'
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
                        filterStaff === s ? 'bg-primary-700 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
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
        onTouchStart={isMobile && viewMode === 'list' ? handleTouchStart : undefined}
        onTouchEnd={isMobile && viewMode === 'list' ? handleTouchEnd : undefined}
      >
        {viewMode === 'list' ? (
          <MobileScheduleList
            entries={entries}
            conflictedIds={conflictedIds}
            conflicts={conflicts}
            onEntryClick={handleEntryClick}
            dutyStartHour={dutyStartHour}
            selectedDate={dateStr}
            showStaff={showStaff}
            shortStaffName={shortStaffName}
          />
        ) : (
          <DayTimelineView
            entries={entries}
            conflictedIds={conflictedIds}
            conflicts={conflicts}
            onEntryClick={handleEntryClick}
            onEntryTimeChange={canManageSchedule ? handleEntryTimeChange : undefined}
            roleFilters={roleFilters}
            roleLimits={roleLimits}
            currentUserId={user?.uid}
            hourWidth={zoomLevel}
            onZoomChange={handleZoomLevelChange}
            orientation={timelineOrientation}
            onOrientationChange={handleOrientationChange}
            showStaff={showStaff}
            onShowStaffChange={handleShowStaffChange}
            shortStaffName={shortStaffName}
            onShortStaffNameChange={handleShortStaffNameChange}
            selectedDate={dateStr}
            workingHours={config.workingHours}
          />
        )}
      </div>

      {/* ── Mobile FAB: thêm ca mổ ── */}
      {isMobile && !showModal && canManageSchedule && (
        <button
          id="schedule-add-fab"
          onClick={handleAddNew}
          aria-label="Thêm ca mổ"
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full bg-primary-700 text-white shadow-lg shadow-primary-900/30 flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
        >
          <Plus size={26} />
        </button>
      )}

      {/* ── Projector mode ── */}
      {showProjector && (
        <ProjectorView
          entries={entries}
          conflicts={allConflicts}
          conflictedIds={conflictedIds}
          onEntryClick={handleEntryClick}
          onEntryTimeChange={canManageSchedule ? handleEntryTimeChange : undefined}
          roleFilters={roleFilters}
          roleLimits={roleLimits}
          onClose={() => setShowProjector(false)}
          selectedDate={dateStr}
          dateLabel={formatDisplayDate(currentDate)}
          dutyStartHour={dutyStartHour}
          dutyStartStr={dutyStartStr}
          workingHours={config.workingHours}
          currentUserId={user?.uid}
          isModalOpen={showModal || !!deleteTarget || !!duplicateTarget}
          showStaff={showStaff}
          onShowStaffChange={handleShowStaffChange}
          shortStaffName={shortStaffName}
          onShortStaffNameChange={handleShortStaffNameChange}
        />
      )}

      {/* ── Modal ── */}
      <ScheduleSurgeryModal
        isOpen={showModal}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDeleteDirect}
        onDuplicate={
          canManageSchedule
            ? (entry) => {
                setDuplicateTarget(entry);
                setDuplicateDate('');
                closeModal();
              }
            : undefined
        }
        onToggleLock={handleToggleLock}
        canLock={canLockSchedule}
        canUnlock={canUnlockSchedule}
        editingEntry={editingEntry}
        date={dateStr}
        staffList={config.staffList || []}
        machineRegistry={config.machineRegistry || []}
        surgeryNames={surgeryNames}
        roleFilters={roleFilters}
        tableItems={config.tableItems || []}
        timeItemsList={config.timeItemsList}
        timeRules={config.timeRules}
        readOnly={!canManageSchedule}
        conflicts={allConflicts}
        allEntries={entries}
        onSelectEntry={(entry) => setEditingEntry(entry)}
        workingHours={config.workingHours}
      />

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
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
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
                    : 'bg-primary-700 text-white hover:bg-primary-800 active:scale-95 cursor-pointer'
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
