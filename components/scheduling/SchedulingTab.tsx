import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Calendar,
  BarChart3, Download, Copy,
} from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { DayTimelineView, type ZoomLevel } from './DayTimelineView';
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
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(120);

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

  // Subscribe
  useEffect(() => {
    const unsub = subscribeScheduleForDate(dateStr, setEntries);
    return () => unsub();
  }, [dateStr]);

  useEffect(() => {
    const unsub = subscribeToSurgeryNamePrices((prices) => setSurgeryNames(prices));
    return () => unsub();
  }, []);

  // Conflicts
  const roleFilters = config.reportRoleFilters;
  const conflicts = useMemo(() => detectConflicts(entries, roleFilters), [entries, roleFilters]);
  const conflictedIds = useMemo(() => getConflictedSurgeryIds(conflicts), [conflicts]);

  // Nav
  const goToPrevDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const goToNextDay = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const goToToday = () => setCurrentDate(new Date());

  // Save
  const handleSave = useCallback(async (data: ScheduledSurgeryInput) => {
    if (!user) return;
    if (editingEntry) {
      await updateScheduledSurgery(editingEntry.date, editingEntry.id, data);
    } else {
      await addScheduledSurgery(data, user.uid, user.displayName || 'Unknown');
    }
  }, [user, editingEntry]);

  // Click entry — always open, permission checked in FAB/save
  const handleEntryClick = useCallback((entry: ScheduledSurgery) => {
    setEditingEntry(entry);
    setShowModal(true);
  }, []);

  // Delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteScheduledSurgery(deleteTarget.date, deleteTarget.id);
    setDeleteTarget(null);
    setEditingEntry(undefined);
    setShowModal(false);
  }, [deleteTarget]);

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
  const closeModal = () => { setShowModal(false); setEditingEntry(undefined); };

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
      <ConflictSummary conflicts={conflicts} totalEntries={entries.length} />

      {/* ── Main Content ── */}
      <div
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {isMobile ? (
          <MobileScheduleList
            entries={entries}
            conflictedIds={conflictedIds}
            onEntryClick={handleEntryClick}
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
          />
        )}
      </div>

      {/* ── Modal ── */}
      <ScheduleSurgeryModal
        isOpen={showModal}
        onClose={closeModal}
        onSave={handleSave}
        editingEntry={editingEntry}
        date={dateStr}
        staffList={config.staffList || []}
        machineRegistry={config.machineRegistry || []}
        surgeryNames={surgeryNames}
        roleFilters={roleFilters}
        readOnly={!!editingEntry && editingEntry.createdBy !== user?.uid && !canManageAll}
      />

      {/* ── Action FAB (when editing) ── */}
      {showModal && editingEntry && (editingEntry.createdBy === user?.uid || canManageAll) && (
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
