import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Clock, User, Cpu, FileText, Search, AlertTriangle, Trash2, Copy } from 'lucide-react';
import type { ScheduledSurgery, ScheduledSurgeryInput, ScheduleConflict } from '../../types/schedule';
import type { StaffMember, MachineEntry, SurgeryNamePrice, LaborTableItem } from '../../types';
import type { RoleFilterConfig, WorkingHours } from '../../contexts/ConfigContext';
import { getScheduleForDate } from '../../services/overtimeCalculationService';
import { parseTimeToShiftHours, formatDisplayTime } from '../../services/scheduleConflictService';
import { TimeInput24 } from '../common/TimeInput24';
import { STAFF_POSITIONS } from '../../services/laborConfigService';

interface ScheduleSurgeryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ScheduledSurgeryInput) => Promise<void>;
  /** Xóa ca mổ đang sửa */
  onDelete?: (entry: ScheduledSurgery) => void;
  /** Sao chép ca mổ sang ngày khác */
  onDuplicate?: (entry: ScheduledSurgery) => void;
  /** Nếu có = chế độ sửa, không có = chế độ thêm mới */
  editingEntry?: ScheduledSurgery;
  date: string;
  staffList: StaffMember[];
  machineRegistry: MachineEntry[];
  surgeryNames: SurgeryNamePrice[];
  roleFilters: RoleFilterConfig;
  /** Định mức bàn mổ — danh sách các vị trí kíp mổ */
  tableItems?: LaborTableItem[];
  /** Danh sách xung đột để hiển thị cảnh báo chi tiết */
  conflicts?: ScheduleConflict[];
  /** Toàn bộ danh sách ca mổ trong ngày để tham chiếu ca trùng */
  allEntries?: ScheduledSurgery[];
  /** Chuyển sang xem ca mổ khác khi nhấn vào ca bị trùng */
  onSelectEntry?: (entry: ScheduledSurgery) => void;
  /** True = chế độ xem, không cho sửa */
  readOnly?: boolean;
  workingHours?: WorkingHours;
}

export const ScheduleSurgeryModal: React.FC<ScheduleSurgeryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  editingEntry,
  date,
  staffList,
  machineRegistry,
  surgeryNames,
  roleFilters,
  tableItems = [],
  conflicts = [],
  allEntries = [],
  onSelectEntry,
  readOnly = false,
  workingHours,
}) => {
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [tenKT, setTenKT] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [machineCode, setMachineCode] = useState('');
  const [machineName, setMachineName] = useState('');
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (isOpen) setSaveError('');
  }, [isOpen, editingEntry]);

  // Duty shift season & start hour (07:30 in winter, 07:00 in summer)
  const seasonSchedule = useMemo(() => {
    const dateObj = date ? new Date(date + 'T00:00:00') : new Date();
    return getScheduleForDate(dateObj, workingHours);
  }, [date, workingHours]);

  const dutyStartStr = seasonSchedule?.morningFrom || '07:30';
  const dutyStartHour = useMemo(() => {
    const [h, m] = dutyStartStr.split(':').map(Number);
    return (isNaN(h) ? 7 : h) + (isNaN(m) ? 30 : m) / 60;
  }, [dutyStartStr]);

  // ── Giờ tự do (đến từng phút) ──
  // Giá trị lưu dạng "HH:mm". Giờ < giờ bắt đầu trực tự động hiểu là hôm sau (+1)
  // trong ca trực 24h (xem parseTimeToShiftHours).
  const toInputTime = (t: string) => (t ? formatDisplayTime(t) : '');

  const addMinutes = (t: string, mins: number) => {
    const [h, m] = toInputTime(t).split(':').map(Number);
    const total = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
  };

  const startShift = parseTimeToShiftHours(startTime, dutyStartHour);
  const rawEndShift = parseTimeToShiftHours(endTime, dutyStartHour);
  // Kết thúc đúng giờ giao ca sáng hôm sau (vd 07:30) → +24h
  const endsAtShiftEnd = rawEndShift <= startShift && Math.abs(rawEndShift - dutyStartHour) < 0.01;
  const endShift = endsAtShiftEnd ? rawEndShift + 24 : rawEndShift;
  const durationMins = Math.round((endShift - startShift) * 60);
  const isTimeValid = !!startTime && !!endTime && durationMins > 0;

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m} phút`;
  };

  // Autocomplete states
  const [tenKTSearch, setTenKTSearch] = useState('');
  const [showTenKTDropdown, setShowTenKTDropdown] = useState(false);
  const [staffSearches, setStaffSearches] = useState<Record<string, string>>({});
  const [activeStaffDropdown, setActiveStaffDropdown] = useState<string | null>(null);
  // Machine search
  const [machineSearch, setMachineSearch] = useState('');
  const [showMachineDropdown, setShowMachineDropdown] = useState(false);

  // Populate when editing
  useEffect(() => {
    if (editingEntry) {
      setPatientId(editingEntry.patientId);
      setPatientName(editingEntry.patientName);
      setTenKT(editingEntry.tenKT);
      setStartTime(editingEntry.startTime);
      setEndTime(editingEntry.endTime);
      setMachineCode(editingEntry.machineCode);
      setMachineName(editingEntry.machineName);
      setStaff(editingEntry.staff || {});
      setNote(editingEntry.note || '');
      setMachineSearch(editingEntry.machineName || '');
    } else {
      setPatientId('');
      setPatientName('');
      setTenKT('');
      setStartTime(dutyStartStr);
      const nextH = Math.floor(dutyStartHour + 1);
      const nextM = Math.round(((dutyStartHour + 1) - nextH) * 60);
      setEndTime(`${nextH.toString().padStart(2, '0')}:${nextM.toString().padStart(2, '0')}`);
      setMachineCode('');
      setMachineName('');
      setStaff({});
      setNote('');
      setMachineSearch('');
    }
    setTenKTSearch('');
    setStaffSearches({});
    setActiveStaffDropdown(null);
    setShowMachineDropdown(false);
  }, [editingEntry, isOpen, dutyStartStr, dutyStartHour]);

  // ── ROLES: Lấy từ STAFF_POSITIONS kết hợp tableItems (Định mức bàn mổ) & roleFilters ──
  // Quy tắc chuẩn:
  // - Duyệt qua tất cả vị trí tiêu chuẩn từ STAFF_POSITIONS (ptChinh, ptPhu, bsGM, ktvGM, tdc, gv).
  // - Tra cứu xem có mốc hiệu lực trong tableItems trên ngày `date` hay không (nếu có dùng limit/label đó, nếu không dùng pos.defaultLimit).
  // - Nếu limit <= 0 (như Giúp việc 'gv' mặc định limit = 0): KHÔNG hiển thị.
  // - Nếu bị tắt trong roleFilters (reportRoleFilters): KHÔNG hiển thị.
  // - Còn lại: hiển thị đầy đủ (BS PT chính, BS PT phụ, BS gây mê hồi sức, KTV gây mê, Tít dụng cụ).
  const displayRoles = useMemo(() => {
    const targetDate = date || new Date().toISOString().split('T')[0];

    return STAFF_POSITIONS.map((pos) => {
      const candidates = tableItems
        .filter((item) => item.posKey === pos.key && (!item.effectiveFrom || item.effectiveFrom <= targetDate))
        .filter((item) => !item.effectiveTo || item.effectiveTo >= targetDate)
        .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));

      const activeItem = candidates[0];
      const limit = activeItem ? Number(activeItem.limit) : pos.defaultLimit;
      const label = activeItem?.label || pos.label;

      return {
        id: activeItem?.id || pos.key,
        posKey: pos.key,
        label,
        limit,
        effectiveFrom: activeItem?.effectiveFrom || '2020-01-01',
        effectiveTo: activeItem?.effectiveTo || null,
        createdAt: activeItem?.createdAt || 0,
        updatedAt: activeItem?.updatedAt || 0,
      } as LaborTableItem;
    }).filter((item) => {
      // Loại bỏ vị trí có định mức <= 0 (như giúp việc gv mặc định limit = 0)
      if (item.limit <= 0) return false;
      // Loại bỏ nếu roleFilters tắt vị trí này
      if (roleFilters && item.posKey in roleFilters && !roleFilters[item.posKey as keyof RoleFilterConfig]) {
        return false;
      }
      return true;
    });
  }, [tableItems, roleFilters, date]);

  // ── Conflicts for editingEntry ──
  const entryConflicts = useMemo(() => {
    if (!editingEntry) return [];
    return conflicts.filter((c) => c.surgeryIds.includes(editingEntry.id));
  }, [editingEntry, conflicts]);

  const machineConflicts = useMemo(
    () => entryConflicts.filter((c) => c.type === 'MACHINE'),
    [entryConflicts]
  );

  const staffConflicts = useMemo(
    () => entryConflicts.filter((c) => c.type === 'STAFF'),
    [entryConflicts]
  );

  const conflictingStaffRoles = useMemo(() => {
    const set = new Set<string>();
    for (const c of staffConflicts) {
      for (const [roleKey, name] of Object.entries(staff || {})) {
        if (name && String(name).trim().toLowerCase() === c.resource.trim().toLowerCase()) {
          set.add(roleKey);
        }
      }
    }
    return set;
  }, [staffConflicts, staff]);

  // ── Surgery name autocomplete — Filter only currently active items on target date ──
  // Chỉ tính khi modal mở (danh mục ~3.000+ mục) để không làm chậm lúc tải lịch
  const activeSurgeryCatalog = useMemo(() => {
    if (!isOpen) return [] as SurgeryNamePrice[];
    const targetDate = date || new Date().toISOString().split('T')[0];
    // Filter active items (effectiveFrom <= date and !effectiveTo or effectiveTo >= date)
    const active = surgeryNames.filter((s) => {
      const name = s.tenKT || (s as any).name;
      if (!name) return false;
      if (s.effectiveFrom && s.effectiveFrom > targetDate) return false;
      if (s.effectiveTo && s.effectiveTo < targetDate) return false;
      return true;
    });

    // Deduplicate by normalized name, keeping the one with newest effectiveFrom or valid maTuongDuong
    const map = new Map<string, SurgeryNamePrice>();
    for (const item of active) {
      const name = (item.tenKT || (item as any).name).trim();
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (!existing || (item.effectiveFrom && (!existing.effectiveFrom || item.effectiveFrom > existing.effectiveFrom))) {
        map.set(key, item);
      }
    }

    // Fallback: if no active items found for date, use all surgeryNames
    if (map.size === 0 && surgeryNames.length > 0) {
      for (const item of surgeryNames) {
        const name = (item.tenKT || (item as any).name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (!map.has(key)) map.set(key, item);
      }
    }

    return Array.from(map.values());
  }, [surgeryNames, date, isOpen]);

  // Khóa tìm kiếm không dấu tính sẵn 1 lần, không tính lại mỗi lần gõ phím
  const removeVnTones = (str: string) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();

  const catalogSearchKeys = useMemo(
    () => activeSurgeryCatalog.map((s) => removeVnTones(`${s.tenKT || (s as any).name || ''} ${s.maTuongDuong || ''}`)),
    [activeSurgeryCatalog]
  );

  const filteredSurgeryNames = useMemo(() => {
    if (!tenKTSearch.trim()) return activeSurgeryCatalog.slice(0, 50);
    const q = removeVnTones(tenKTSearch.trim());
    const result: SurgeryNamePrice[] = [];
    for (let i = 0; i < activeSurgeryCatalog.length && result.length < 50; i++) {
      if (catalogSearchKeys[i].includes(q)) result.push(activeSurgeryCatalog[i]);
    }
    return result;
  }, [activeSurgeryCatalog, catalogSearchKeys, tenKTSearch]);

  // ── Staff autocomplete ──
  const getFilteredStaff = useCallback(
    (role: string) => {
      const q = (staffSearches[role] || '').toLowerCase();
      const surgicalStaff = staffList.filter((s) => !s.nonSurgical && s.name);
      if (!q) return surgicalStaff.slice(0, 15);
      return surgicalStaff.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 15);
    },
    [staffList, staffSearches]
  );

  // ── Machine search/filter ──
  const activeMachines = useMemo(() => machineRegistry.filter((m) => m.active), [machineRegistry]);

  const filteredMachines = useMemo(() => {
    if (!machineSearch.trim()) return activeMachines;
    const q = machineSearch.toLowerCase();
    return activeMachines.filter(
      (m) => m.machineName.toLowerCase().includes(q) || m.machineCode.toLowerCase().includes(q)
    );
  }, [activeMachines, machineSearch]);

  const handleMachineSelect = (machine: MachineEntry) => {
    setMachineCode(machine.machineCode);
    setMachineName(machine.machineName);
    setMachineSearch(machine.machineName);
    setShowMachineDropdown(false);
  };

  const handleMachineClear = () => {
    setMachineCode('');
    setMachineName('');
    setMachineSearch('');
  };

  const handleStaffChange = (role: string, name: string) => {
    setStaff((prev) => ({ ...prev, [role]: name }));
  };

  const handleSubmit = async () => {
    if (!patientId.trim() || !patientName.trim() || !tenKT.trim()) return;
    if (!isTimeValid) return;

    setIsSaving(true);
    setSaveError('');
    try {
      // Chỉ lưu các vị trí hợp lệ trong displayRoles (đã được kiểm tra trùng)
      const cleanStaff: Record<string, string> = {};
      for (const role of displayRoles) {
        const val = staff[role.posKey]?.trim();
        if (val) cleanStaff[role.posKey] = val;
      }

      const data: ScheduledSurgeryInput = {
        date,
        patientId: patientId.trim(),
        patientName: patientName.trim(),
        tenKT: tenKT.trim(),
        startTime,
        endTime: endsAtShiftEnd ? `${toInputTime(endTime)} (+1)` : endTime,
        machineCode,
        machineName,
        staff: cleanStaff,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      await onSave(data);
      onClose();
    } catch (err) {
      console.error('Error saving schedule entry:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(
        /permission/i.test(msg)
          ? 'Không có quyền lưu lịch mổ. Vui lòng đăng nhập lại.'
          : `Không lưu được ca mổ: ${msg}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg sm:mx-4 max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-gray-200 bg-primary-50/50">
          <div>
            <h2 className="text-sm font-bold text-primary-950">
              {readOnly ? 'Chi tiết ca mổ' : editingEntry ? 'Chỉnh sửa ca mổ' : 'Đăng ký ca mổ mới'}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {editingEntry
                ? 'Điều chỉnh giờ mổ, máy hoặc nhân sự để sắp xếp lại ca mổ và khắc phục trùng lịch'
                : `Thêm ca phẫu thuật / thủ thuật vào lịch ngày ${date}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          {/* ⚠️ Xung đột phát hiện trên ca này */}
          {entryConflicts.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/90 p-3 sm:p-3.5 space-y-2.5 animate-fade-in shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                  <AlertTriangle size={16} className="shrink-0 text-red-600 animate-pulse" />
                  <span>Phát hiện {entryConflicts.length} xung đột ở ca này:</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-red-200 text-red-900 rounded-full">
                  Cần điều chỉnh
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {machineConflicts.map((c, i) => {
                  const otherId = c.surgeryIds.find((id) => id !== editingEntry?.id);
                  const otherSurgery = allEntries?.find((e) => e.id === otherId);
                  return (
                    <div
                      key={`mc-${i}`}
                      className="p-2.5 rounded-lg bg-white border border-red-200 shadow-xs flex items-start justify-between gap-2"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="p-1 rounded bg-red-100 text-red-600 shrink-0 mt-0.5">
                          <Cpu size={14} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-red-900 leading-tight">
                            Trùng máy: <span className="underline decoration-red-300">{c.resource}</span>
                          </p>
                          {otherSurgery ? (
                            <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                              Trùng giờ với ca <strong className="text-gray-900">{otherSurgery.patientName}</strong> ({otherSurgery.startTime}–{otherSurgery.endTime})
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-500 mt-0.5">{c.description}</p>
                          )}
                        </div>
                      </div>
                      {otherSurgery && onSelectEntry && (
                        <button
                          type="button"
                          onClick={() => onSelectEntry(otherSurgery)}
                          className="shrink-0 px-2.5 py-1.5 bg-red-100 hover:bg-red-200 active:scale-95 text-red-800 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
                        >
                          Xem ca trùng →
                        </button>
                      )}
                    </div>
                  );
                })}

                {staffConflicts.map((c, i) => {
                  const otherId = c.surgeryIds.find((id) => id !== editingEntry?.id);
                  const otherSurgery = allEntries?.find((e) => e.id === otherId);
                  const roleKey = Object.entries(editingEntry?.staff || {}).find(([, name]) => name && String(name).trim().toLowerCase() === c.resource.trim().toLowerCase())?.[0];
                  const roleLabel = displayRoles.find((r) => r.posKey === roleKey)?.label || 'Nhân sự';
                  return (
                    <div
                      key={`sc-${i}`}
                      className="p-2.5 rounded-lg bg-white border border-blue-200 shadow-xs flex items-start justify-between gap-2"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="p-1 rounded bg-blue-100 text-blue-600 shrink-0 mt-0.5">
                          <User size={14} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-blue-950 leading-tight">
                            Trùng {roleLabel}: <span className="underline decoration-blue-300">{c.resource}</span>
                          </p>
                          {otherSurgery ? (
                            <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                              Tham gia ca <strong className="text-gray-900">{otherSurgery.patientName}</strong> ({otherSurgery.startTime}–{otherSurgery.endTime})
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-500 mt-0.5">{c.description}</p>
                          )}
                        </div>
                      </div>
                      {otherSurgery && onSelectEntry && (
                        <button
                          type="button"
                          onClick={() => onSelectEntry(otherSurgery)}
                          className="shrink-0 px-2.5 py-1.5 bg-blue-100 hover:bg-blue-200 active:scale-95 text-blue-800 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
                        >
                          Xem ca trùng →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bệnh nhân */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">Mã KCB</label>
              <input type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} disabled={readOnly}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                placeholder="VD: 2600125423" />
            </div>
            <div className="col-span-3">
              <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">Họ tên BN</label>
              <input type="text" value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={readOnly}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                placeholder="Nguyễn Văn A" />
            </div>
          </div>

          {/* Tên kỹ thuật (autocomplete) */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                <FileText className="inline h-3 w-3 mr-1" />
                Tên phẫu thuật / thủ thuật
              </label>
              {activeSurgeryCatalog.length > 0 && (
                <span className="text-[10px] text-gray-400">
                  {activeSurgeryCatalog.length.toLocaleString('vi-VN')} PTTT hiệu lực
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={tenKT}
                onChange={(e) => {
                  setTenKT(e.target.value);
                  setTenKTSearch(e.target.value);
                  setShowTenKTDropdown(true);
                }}
                onFocus={() => {
                  setTenKTSearch(tenKT);
                  setShowTenKTDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowTenKTDropdown(false), 250)}
                disabled={readOnly}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                placeholder="Gõ để tìm theo tên hoặc mã tương đương..."
              />
              {tenKT && !readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setTenKT('');
                    setTenKTSearch('');
                    setShowTenKTDropdown(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {showTenKTDropdown && filteredSurgeryNames.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                {filteredSurgeryNames.map((s) => {
                  const name = s.tenKT || (s as any).name;
                  return (
                    <button
                      key={s.id || name}
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs hover:bg-primary-50 transition-colors cursor-pointer flex items-center justify-between border-b border-gray-50 last:border-0"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTenKT(name);
                        setTenKTSearch('');
                        setShowTenKTDropdown(false);
                      }}
                    >
                      <span className="font-medium text-gray-800">{name}</span>
                      {s.maTuongDuong && (
                        <span className="text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded text-[10px] shrink-0 font-mono ml-2 border border-primary-100">
                          {s.maTuongDuong}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {showTenKTDropdown && filteredSurgeryNames.length === 0 && tenKTSearch.trim() && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-center text-xs text-gray-400">
                Không tìm thấy phẫu thuật phù hợp trong danh mục hiệu lực
              </div>
            )}
          </div>

          {/* Thời gian — nhập tự do đến từng phút */}
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="schedule-start-time" className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                  <Clock className="inline h-3 w-3 mr-1" /> Giờ bắt đầu
                </label>
                <TimeInput24
                  id="schedule-start-time"
                  value={toInputTime(startTime)}
                  disabled={readOnly}
                  onChange={(newStart) => {
                    setStartTime(newStart);
                    const prevDuration = isTimeValid ? durationMins : 60;
                    if (parseTimeToShiftHours(endTime, dutyStartHour) <= parseTimeToShiftHours(newStart, dutyStartHour)) {
                      setEndTime(addMinutes(newStart, prevDuration));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm tabular-nums focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                />
                {startShift >= 24 && (
                  <span className="inline-block mt-1 text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">Hôm sau (+1)</span>
                )}
              </div>
              <div>
                <label htmlFor="schedule-end-time" className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                  <Clock className="inline h-3 w-3 mr-1" /> Giờ kết thúc
                </label>
                <TimeInput24
                  id="schedule-end-time"
                  value={toInputTime(endTime)}
                  disabled={readOnly}
                  aria-invalid={!isTimeValid}
                  onChange={setEndTime}
                  className={`w-full px-3 py-2 rounded-lg border text-sm tabular-nums focus:ring-1 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50 ${
                    isTimeValid
                      ? 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'
                      : 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-200'
                  }`}
                />
                {endShift >= 24 && isTimeValid && (
                  <span className="inline-block mt-1 text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">Hôm sau (+1)</span>
                )}
              </div>
            </div>
            <p className={`mt-1.5 text-[10.5px] ${isTimeValid ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>
              {isTimeValid
                ? <>Thời lượng: <span className="font-bold text-gray-700">{formatDuration(durationMins)}</span> · Ca trực bắt đầu {dutyStartStr}, giờ trước {dutyStartStr} tính là hôm sau</>
                : 'Giờ kết thúc phải sau giờ bắt đầu (trong ca trực 24h)'}
            </p>
          </div>

          {/* Máy thực hiện — searchable dropdown */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
              <Cpu className="inline h-3 w-3 mr-1" /> Máy thực hiện
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={machineSearch}
                onChange={(e) => { setMachineSearch(e.target.value); setShowMachineDropdown(true); if (!e.target.value.trim()) handleMachineClear(); }}
                onFocus={() => setShowMachineDropdown(true)}
                onBlur={() => setTimeout(() => setShowMachineDropdown(false), 200)}
                disabled={readOnly}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50"
                placeholder="Gõ để tìm máy..." />
              {machineCode && !readOnly && (
                <button type="button" onClick={handleMachineClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>
            {machineCode && (
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-primary-100 text-primary-700 rounded-full">
                  <Cpu size={10} /> {machineName} ({machineCode})
                </span>
              </div>
            )}
            {machineConflicts.length > 0 && (
              <div className="mt-1.5 p-1.5 rounded-md bg-red-100/90 border border-red-300 text-red-800 text-[11px] font-semibold flex items-center gap-1.5">
                <AlertTriangle size={13} className="shrink-0 text-red-600" />
                <span>Máy "{machineName}" đang bị trùng giờ! Vui lòng chọn máy khác hoặc đổi giờ mổ.</span>
              </div>
            )}
            {showMachineDropdown && filteredMachines.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {filteredMachines.map((m) => (
                  <button key={m.machineCode} type="button"
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 transition-colors cursor-pointer flex items-center gap-2 ${machineCode === m.machineCode ? 'bg-primary-50 font-bold' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); handleMachineSelect(m); }}>
                    <Cpu size={11} className="text-gray-400 shrink-0" />
                    <span className="font-medium">{m.machineName}</span>
                    <span className="text-gray-400 ml-auto text-[10px]">{m.machineCode}</span>
                  </button>
                ))}
              </div>
            )}
            {showMachineDropdown && filteredMachines.length === 0 && machineSearch.trim() && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-center text-xs text-gray-400">
                Không tìm thấy máy phù hợp
              </div>
            )}
          </div>

          {/* Kíp mổ — roles from tableItems */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wide">
              <User className="inline h-3 w-3 mr-1" /> Kíp mổ
            </label>
            <div className="space-y-2">
              {displayRoles.map((role) => {
                const isRoleConflicted = conflictingStaffRoles.has(role.posKey);
                return (
                  <div key={role.posKey} className="relative">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold w-24 shrink-0 text-gray-700">
                        {role.label}
                      </span>
                      <div className="relative flex-1">
                        <input type="text" value={staff[role.posKey] || ''}
                          onChange={(e) => { handleStaffChange(role.posKey, e.target.value); setStaffSearches((p) => ({ ...p, [role.posKey]: e.target.value })); setActiveStaffDropdown(role.posKey); }}
                          onFocus={() => { setStaffSearches((p) => ({ ...p, [role.posKey]: staff[role.posKey] || '' })); setActiveStaffDropdown(role.posKey); }}
                          onBlur={() => setTimeout(() => setActiveStaffDropdown(null), 200)}
                          disabled={readOnly}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:ring-1 outline-none transition-all disabled:opacity-50 disabled:bg-gray-50 ${
                            isRoleConflicted
                              ? 'border-orange-400 bg-orange-50/30 focus:border-orange-500 focus:ring-orange-200'
                              : 'border-gray-200 focus:border-primary-400 focus:ring-primary-200'
                          }`}
                          placeholder={`Chọn ${role.label}...`} />
                        {activeStaffDropdown === role.posKey && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-32 overflow-y-auto">
                            {getFilteredStaff(role.posKey).map((s) => (
                              <button key={s.id} type="button"
                                className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-primary-50 transition-colors cursor-pointer"
                                onMouseDown={(e) => { e.preventDefault(); handleStaffChange(role.posKey, s.name); setActiveStaffDropdown(null); }}>
                                <span className="font-medium">{s.name}</span>
                                {s.position && <span className="text-gray-400 ml-1">({s.position})</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {isRoleConflicted && (
                      <div className="ml-26 mt-0.5 flex items-center gap-1 text-[10px] text-orange-700 font-semibold">
                        <AlertTriangle size={11} className="shrink-0 text-orange-500" />
                        <span>{role.label} "{staff[role.posKey]}" đang bị trùng giờ ở ca khác!</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">Ghi chú</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} disabled={readOnly}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all resize-none disabled:opacity-50 disabled:bg-gray-50"
              placeholder="Ghi chú thêm (nếu có)..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          {editingEntry && !readOnly ? (
            <div className="flex items-center gap-1.5">
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Bạn có chắc chắn muốn xóa ca mổ của bệnh nhân "${editingEntry.patientName}"?`)) {
                      onDelete(editingEntry);
                    }
                  }}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-red-600 hover:bg-red-50 hover:border-red-300 border border-red-200 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  title="Xóa ca mổ khỏi lịch"
                >
                  <Trash2 size={13} />
                  <span>Xóa ca mổ</span>
                </button>
              )}
              {onDuplicate && (
                <button
                  type="button"
                  onClick={() => onDuplicate(editingEntry)}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 hover:border-sky-300 border border-sky-200 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  title="Sao chép ca mổ sang ngày khác"
                >
                  <Copy size={13} />
                  <span>Sao chép</span>
                </button>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {saveError && (
              <span role="alert" className="text-[11px] font-semibold text-red-600 max-w-[260px]">{saveError}</span>
            )}
            {readOnly ? (
              <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors cursor-pointer">
                Đóng
              </button>
            ) : (
              <>
                <button onClick={onClose} className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer">Hủy</button>
                <button onClick={handleSubmit}
                  disabled={
                    isSaving ||
                    !patientId.trim() ||
                    !patientName.trim() ||
                    !tenKT.trim() ||
                    !isTimeValid
                  }
                  className={`px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-bold rounded-lg transition-all shadow-sm ${
                    isSaving ||
                    !patientId.trim() ||
                    !patientName.trim() ||
                    !tenKT.trim() ||
                    !isTimeValid
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-primary-700 text-white hover:bg-primary-800 active:scale-95 cursor-pointer'
                  }`}>
                  {isSaving ? 'Đang lưu...' : editingEntry ? 'Lưu thay đổi' : 'Đăng ký ca mổ'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
