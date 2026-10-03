import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Clock, User, Cpu, FileText, Search } from 'lucide-react';
import type { ScheduledSurgery, ScheduledSurgeryInput } from '../../types/schedule';
import { STAFF_ROLE_LABELS } from '../../types/schedule';
import type { StaffMember, MachineEntry, SurgeryNamePrice } from '../../types';
import type { RoleFilterConfig } from '../../contexts/ConfigContext';

interface ScheduleSurgeryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ScheduledSurgeryInput) => Promise<void>;
  /** Nếu có = chế độ sửa, không có = chế độ thêm mới */
  editingEntry?: ScheduledSurgery;
  date: string;
  staffList: StaffMember[];
  machineRegistry: MachineEntry[];
  surgeryNames: SurgeryNamePrice[];
  roleFilters: RoleFilterConfig;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export const ScheduleSurgeryModal: React.FC<ScheduleSurgeryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEntry,
  date,
  staffList,
  machineRegistry,
  surgeryNames,
  roleFilters,
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

  // Autocomplete states
  const [tenKTSearch, setTenKTSearch] = useState('');
  const [showTenKTDropdown, setShowTenKTDropdown] = useState(false);
  const [staffSearches, setStaffSearches] = useState<Record<string, string>>({});
  const [activeStaffDropdown, setActiveStaffDropdown] = useState<string | null>(null);

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
    } else {
      setPatientId('');
      setPatientName('');
      setTenKT('');
      setStartTime('08:00');
      setEndTime('09:00');
      setMachineCode('');
      setMachineName('');
      setStaff({});
      setNote('');
    }
    setTenKTSearch('');
    setStaffSearches({});
    setActiveStaffDropdown(null);
  }, [editingEntry, isOpen]);

  // Active roles from config
  const activeRoles = useMemo(() => {
    return Object.entries(roleFilters)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
  }, [roleFilters]);

  // Filtered surgery names for autocomplete
  const filteredSurgeryNames = useMemo(() => {
    if (!tenKTSearch.trim()) return surgeryNames.slice(0, 20);
    const q = tenKTSearch.toLowerCase();
    return surgeryNames.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [surgeryNames, tenKTSearch]);

  // Filtered staff for a specific role
  const getFilteredStaff = useCallback(
    (role: string) => {
      const q = (staffSearches[role] || '').toLowerCase();
      const surgicalStaff = staffList.filter((s) => !s.nonSurgical);
      if (!q) return surgicalStaff.slice(0, 15);
      return surgicalStaff.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 15);
    },
    [staffList, staffSearches]
  );

  // Active machines
  const activeMachines = useMemo(() => {
    return machineRegistry.filter((m) => m.active);
  }, [machineRegistry]);

  const handleMachineSelect = (machine: MachineEntry) => {
    setMachineCode(machine.machineCode);
    setMachineName(machine.machineName);
  };

  const handleStaffChange = (role: string, name: string) => {
    setStaff((prev) => ({ ...prev, [role]: name }));
  };

  const handleSubmit = async () => {
    if (!patientId.trim() || !patientName.trim() || !tenKT.trim()) return;
    if (!startTime || !endTime || startTime >= endTime) return;

    setIsSaving(true);
    try {
      const data: ScheduledSurgeryInput = {
        date,
        patientId: patientId.trim(),
        patientName: patientName.trim(),
        tenKT: tenKT.trim(),
        startTime,
        endTime,
        machineCode,
        machineName,
        staff,
        note: note.trim() || undefined,
      };
      await onSave(data);
      onClose();
    } catch (err) {
      console.error('Error saving schedule entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg sm:mx-4 max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-gray-200 bg-primary-50/50">
          <h2 className="text-sm font-bold text-primary-900">
            {editingEntry ? '✏️ Sửa ca mổ' : '➕ Đăng ký ca mổ'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Bệnh nhân */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                Mã KCB
              </label>
              <input
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all"
                placeholder="VD: 2600125423"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                Họ tên BN
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all"
                placeholder="Nguyễn Văn A"
              />
            </div>
          </div>

          {/* Tên kỹ thuật (autocomplete) */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
              <FileText className="inline h-3 w-3 mr-1" />
              Tên phẫu thuật / thủ thuật
            </label>
            <input
              type="text"
              value={tenKT}
              onChange={(e) => {
                setTenKT(e.target.value);
                setTenKTSearch(e.target.value);
                setShowTenKTDropdown(true);
              }}
              onFocus={() => setShowTenKTDropdown(true)}
              onBlur={() => setTimeout(() => setShowTenKTDropdown(false), 200)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all"
              placeholder="Gõ tên hoặc chọn từ danh mục..."
            />
            {showTenKTDropdown && filteredSurgeryNames.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {filteredSurgeryNames.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-primary-50 transition-colors cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setTenKT(s.name);
                      setShowTenKTDropdown(false);
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Thời gian */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                <Clock className="inline h-3 w-3 mr-1" />
                Giờ bắt đầu
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all cursor-pointer"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
                <Clock className="inline h-3 w-3 mr-1" />
                Giờ kết thúc
              </label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all cursor-pointer"
              >
                {TIME_OPTIONS.filter((t) => t > startTime).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Máy thực hiện */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
              <Cpu className="inline h-3 w-3 mr-1" />
              Máy thực hiện
            </label>
            <select
              value={machineCode}
              onChange={(e) => {
                const selected = activeMachines.find((m) => m.machineCode === e.target.value);
                setMachineCode(e.target.value);
                setMachineName(selected?.machineName || e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all cursor-pointer"
            >
              <option value="">— Không chọn —</option>
              {activeMachines.map((m) => (
                <option key={m.machineCode} value={m.machineCode}>
                  {m.machineName} ({m.machineCode})
                </option>
              ))}
            </select>
          </div>

          {/* Kíp mổ */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wide">
              <User className="inline h-3 w-3 mr-1" />
              Kíp mổ
            </label>
            <div className="space-y-2">
              {activeRoles.map((role) => (
                <div key={role} className="relative">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-600 w-20 shrink-0">
                      {STAFF_ROLE_LABELS[role] || role}
                    </span>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={staff[role] || ''}
                        onChange={(e) => {
                          handleStaffChange(role, e.target.value);
                          setStaffSearches((p) => ({ ...p, [role]: e.target.value }));
                          setActiveStaffDropdown(role);
                        }}
                        onFocus={() => {
                          setStaffSearches((p) => ({ ...p, [role]: staff[role] || '' }));
                          setActiveStaffDropdown(role);
                        }}
                        onBlur={() => setTimeout(() => setActiveStaffDropdown(null), 200)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none transition-all"
                        placeholder={`Chọn ${STAFF_ROLE_LABELS[role] || role}...`}
                      />
                      {activeStaffDropdown === role && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-32 overflow-y-auto">
                          {getFilteredStaff(role).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-primary-50 transition-colors cursor-pointer"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleStaffChange(role, s.name);
                                setActiveStaffDropdown(null);
                              }}
                            >
                              <span className="font-medium">{s.name}</span>
                              {s.position && (
                                <span className="text-gray-400 ml-1">({s.position})</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wide">
              Ghi chú
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-200 outline-none transition-all resize-none"
              placeholder="Ghi chú thêm (nếu có)..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving || !patientId.trim() || !patientName.trim() || !tenKT.trim() || startTime >= endTime}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all shadow-sm ${
              isSaving || !patientId.trim() || !patientName.trim() || !tenKT.trim() || startTime >= endTime
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-primary-700 text-white hover:bg-primary-800 active:scale-95 cursor-pointer'
            }`}
          >
            {isSaving ? 'Đang lưu...' : editingEntry ? 'Cập nhật' : 'Đăng ký ca mổ'}
          </button>
        </div>
      </div>
    </div>
  );
};
