import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { DayTimelineView } from './DayTimelineView';
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
import type { ScheduledSurgery, ScheduledSurgeryInput } from '../../types/schedule';
import type { SurgeryNamePrice } from '../../types';
import { Tooltip } from '../common/Tooltip';

/** Format yyyy-mm-dd */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format hiển thị: Thứ X, dd/mm/yyyy */
function formatDisplayDate(d: Date): string {
  const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dayName = dayNames[d.getDay()];
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dayName}, ${dd}/${mm}/${d.getFullYear()}`;
}

export const SchedulingTab: React.FC = () => {
  const { config } = useConfig();
  const { user, isAdmin, isHead } = useAuth();
  const canManageAll = isAdmin || isHead;

  // Navigation state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const dateStr = useMemo(() => toDateString(currentDate), [currentDate]);

  // Data state
  const [entries, setEntries] = useState<ScheduledSurgery[]>([]);
  const [surgeryNames, setSurgeryNames] = useState<SurgeryNamePrice[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduledSurgery | undefined>();

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ScheduledSurgery | null>(null);

  // Subscribe to schedule data
  useEffect(() => {
    const unsub = subscribeScheduleForDate(dateStr, setEntries);
    return () => unsub();
  }, [dateStr]);

  // Subscribe to surgery name catalog
  useEffect(() => {
    const unsub = subscribeToSurgeryNamePrices((prices) => setSurgeryNames(prices));
    return () => unsub();
  }, []);

  // Conflict detection
  const roleFilters = config.reportRoleFilters;
  const conflicts = useMemo(
    () => detectConflicts(entries, roleFilters),
    [entries, roleFilters]
  );
  const conflictedIds = useMemo(() => getConflictedSurgeryIds(conflicts), [conflicts]);

  // Date navigation
  const goToPrevDay = () => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 1);
      return n;
    });
  };

  const goToNextDay = () => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  // Save handler (add or update)
  const handleSave = useCallback(
    async (data: ScheduledSurgeryInput) => {
      if (!user) return;
      if (editingEntry) {
        await updateScheduledSurgery(editingEntry.date, editingEntry.id, data);
      } else {
        await addScheduledSurgery(data, user.uid, user.displayName || 'Unknown');
      }
    },
    [user, editingEntry]
  );

  // Click on a surgery bar
  const handleEntryClick = useCallback(
    (entry: ScheduledSurgery) => {
      // Can edit if owner or admin/head
      const canEdit = entry.createdBy === user?.uid || canManageAll;
      if (canEdit) {
        setEditingEntry(entry);
        setShowModal(true);
      }
    },
    [user, canManageAll]
  );

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteScheduledSurgery(deleteTarget.date, deleteTarget.id);
    setDeleteTarget(null);
    setEditingEntry(undefined);
    setShowModal(false);
  }, [deleteTarget]);

  // Open new modal
  const handleAddNew = () => {
    setEditingEntry(undefined);
    setShowModal(true);
  };

  const isToday = toDateString(new Date()) === dateStr;

  return (
    <div className="flex flex-col gap-3 p-4 animate-fade-in max-w-[1800px] mx-auto w-full">
      {/* ── Header: Date navigation ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tooltip content="Ngày trước" position="bottom">
            <button
              onClick={goToPrevDay}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
          </Tooltip>

          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary-600" />
            <h2 className="text-sm font-bold text-gray-800">
              {formatDisplayDate(currentDate)}
            </h2>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-[10px] font-semibold text-primary-600 hover:text-primary-800 underline cursor-pointer"
              >
                Hôm nay
              </button>
            )}
          </div>

          <Tooltip content="Ngày sau" position="bottom">
            <button
              onClick={goToNextDay}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </Tooltip>

          {/* Date picker */}
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setCurrentDate(new Date(e.target.value + 'T00:00:00'))}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 cursor-pointer focus:border-primary-400 outline-none"
          />
        </div>

        <Tooltip content="Đăng ký ca mổ mới cho ngày này" position="bottom">
          <button
            onClick={handleAddNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white font-bold text-xs rounded-xl
                       hover:bg-primary-800 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            Thêm ca mổ
          </button>
        </Tooltip>
      </div>

      {/* ── Conflict Summary ── */}
      <ConflictSummary conflicts={conflicts} totalEntries={entries.length} />

      {/* ── Timeline ── */}
      <DayTimelineView
        entries={entries}
        conflictedIds={conflictedIds}
        conflicts={conflicts}
        onEntryClick={handleEntryClick}
        currentUserId={user?.uid}
      />

      {/* ── Modal: Thêm / Sửa ca mổ ── */}
      <ScheduleSurgeryModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingEntry(undefined);
        }}
        onSave={handleSave}
        editingEntry={editingEntry}
        date={dateStr}
        staffList={config.staffList || []}
        machineRegistry={config.machineRegistry || []}
        surgeryNames={surgeryNames}
        roleFilters={roleFilters}
      />

      {/* ── Delete inside edit modal: context menu ── */}
      {showModal && editingEntry && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9001]">
          {(editingEntry.createdBy === user?.uid || canManageAll) && (
            <Tooltip content="Xóa ca mổ này khỏi lịch" position="top">
              <button
                onClick={() => setDeleteTarget(editingEntry)}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-full
                           hover:bg-red-700 active:scale-95 transition-all shadow-lg cursor-pointer"
              >
                <Trash2 size={14} />
                Xóa ca mổ
              </button>
            </Tooltip>
          )}
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
    </div>
  );
};
