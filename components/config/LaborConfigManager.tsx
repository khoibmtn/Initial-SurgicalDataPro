/**
 * LaborConfigManager — Timeline-based management UI for Định mức & Phụ cấp
 * 
 * Displays a list of labor config versions with effective date ranges.
 * Supports CRUD, duplicate, and inline editing of priceConfig + timeRules.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus, Copy, Trash2, Edit3, Save, X, Download, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Calendar, Clock, Pencil, Check,
} from 'lucide-react';
import { LaborConfigVersion, RolePrice, TimeRule, LOAI_PTTT_ORDER, LOAI_PTTT_LABELS } from '../../types';
import {
  addLaborConfig,
  updateLaborConfig,
  deleteLaborConfig,
  duplicateLaborConfig,
  exportLaborConfigsExcel,
} from '../../services/laborConfigService';

interface Props {
  laborConfigs: LaborConfigVersion[];
}

const SURGERY_TYPES = ["PĐB", "P1", "P2", "P3"];
const PROCEDURE_TYPES = ["TĐB", "T1", "T2", "T3", "TKPL"];

const fmtMoney = (n: number) => (n > 0 ? n.toLocaleString('vi-VN') : '0');

// Formatted number input with comma separators
const NumberInput: React.FC<{
  value: number;
  onChange: (val: number) => void;
  className?: string;
}> = ({ value, onChange, className = "" }) => {
  const [localVal, setLocalVal] = useState(value.toString());

  React.useEffect(() => {
    setLocalVal(value.toString());
  }, [value]);

  const handleBlur = () => setLocalVal(value.toString());
  const displayValue = localVal === '' ? '' : Number(localVal).toLocaleString('en-US');

  return (
    <input
      type="text"
      value={displayValue}
      onChange={(e) => {
        const val = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(val)) {
          onChange(Number(val));
          setLocalVal(val);
        }
      }}
      onBlur={handleBlur}
      className={className}
    />
  );
};

export const LaborConfigManager: React.FC<Props> = ({ laborConfigs }) => {
  const [expandedId, setExpandedId] = useState<string | null>(() =>
    laborConfigs.length > 0 ? laborConfigs[0]?.id : null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPriceRow, setEditingPriceRow] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPrices, setEditPrices] = useState<Record<string, RolePrice>>({});
  const [editTimes, setEditTimes] = useState<Record<string, TimeRule>>({});

  // New version form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrom, setNewFrom] = useState('');
  const [newNote, setNewNote] = useState('');

  // Duplicate state
  const [dupId, setDupId] = useState<string | null>(null);
  const [dupFrom, setDupFrom] = useState('');
  const [dupName, setDupName] = useState('');

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auto expand first if nothing selected
  React.useEffect(() => {
    if (expandedId === null && laborConfigs.length > 0) {
      setExpandedId(laborConfigs[0].id);
    }
  }, [laborConfigs, expandedId]);

  // ─── Edit handlers ─────────────────────────────────────────────────────

  const startEdit = useCallback((version: LaborConfigVersion) => {
    setEditingId(version.id);
    setEditName(version.name);
    setEditFrom(version.effectiveFrom);
    setEditTo(version.effectiveTo || '');
    setEditNote(version.note);
    setEditPrices({ ...version.priceConfig });
    setEditTimes({ ...version.timeRules });
    setEditingPriceRow(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingPriceRow(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateLaborConfig(editingId, {
        name: editName,
        effectiveFrom: editFrom,
        effectiveTo: editTo || null,
        note: editNote,
        priceConfig: editPrices,
        timeRules: editTimes,
      });
      setEditingId(null);
      setEditingPriceRow(null);
      showToast('Đã lưu thay đổi!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  }, [editingId, editName, editFrom, editTo, editNote, editPrices, editTimes, showToast]);

  const handlePriceChange = useCallback((loai: string, role: keyof RolePrice, val: number) => {
    setEditPrices(prev => ({
      ...prev,
      [loai]: { ...prev[loai], [role]: val },
    }));
  }, []);

  const handleTimeChange = useCallback((loai: string, field: 'min' | 'max', val: number) => {
    setEditTimes(prev => ({
      ...prev,
      [loai]: { ...prev[loai], [field]: val },
    }));
  }, []);

  const getPrice = (prices: Record<string, RolePrice>, loai: string, role: keyof RolePrice) =>
    prices[loai]?.[role] ?? 0;

  const getTime = (times: Record<string, TimeRule>, loai: string, field: 'min' | 'max') =>
    times[loai]?.[field] ?? 0;

  // ─── Create handler ────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !newFrom) {
      showToast('Vui lòng nhập tên và ngày hiệu lực', 'error');
      return;
    }
    setSaving(true);
    try {
      // Use defaults or copy from latest active version
      const latestActive = laborConfigs.find(c => c.effectiveTo === null);
      const prices = latestActive ? { ...latestActive.priceConfig } : undefined;
      const times = latestActive ? { ...latestActive.timeRules } : undefined;

      await addLaborConfig(
        newName.trim(),
        newFrom,
        prices || {
          "PĐB": { "Chính": 280000, "Phụ": 200000, "Giúp việc": 120000 },
          "P1": { "Chính": 125000, "Phụ": 90000, "Giúp việc": 70000 },
          "P2": { "Chính": 65000, "Phụ": 50000, "Giúp việc": 30000 },
          "P3": { "Chính": 50000, "Phụ": 30000, "Giúp việc": 15000 },
          "TĐB": { "Chính": 84000, "Phụ": 60000, "Giúp việc": 36000 },
          "T1": { "Chính": 37500, "Phụ": 27000, "Giúp việc": 21000 },
          "T2": { "Chính": 19500, "Phụ": 15000, "Giúp việc": 9000 },
          "T3": { "Chính": 15000, "Phụ": 9000, "Giúp việc": 4500 },
          "TKPL": { "Chính": 0, "Phụ": 0, "Giúp việc": 0 },
        },
        times || {
          "PĐB": { min: 180, max: 240 },
          "P1": { min: 120, max: 180 },
          "P2": { min: 60, max: 180 },
          "P3": { min: 60, max: 120 },
          "TĐB": { min: 180, max: 240 },
          "T1": { min: 120, max: 180 },
          "T2": { min: 60, max: 180 },
          "T3": { min: 60, max: 120 },
          "TKPL": { min: 0, max: 0 },
        },
        newNote,
        laborConfigs,
      );
      setShowNewForm(false);
      setNewName('');
      setNewFrom('');
      setNewNote('');
      showToast('Đã tạo phiên bản mới!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi tạo', 'error');
    } finally {
      setSaving(false);
    }
  }, [newName, newFrom, newNote, laborConfigs, showToast]);

  // ─── Duplicate handler ─────────────────────────────────────────────────

  const handleDuplicate = useCallback(async () => {
    if (!dupId || !dupFrom) return;
    setSaving(true);
    try {
      await duplicateLaborConfig(dupId, dupFrom, laborConfigs, dupName || undefined);
      setDupId(null);
      setDupFrom('');
      setDupName('');
      showToast('Đã nhân đôi phiên bản!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi nhân đôi', 'error');
    } finally {
      setSaving(false);
    }
  }, [dupId, dupFrom, dupName, laborConfigs, showToast]);

  // ─── Delete handler ────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    setSaving(true);
    try {
      await deleteLaborConfig(confirmDeleteId, laborConfigs);
      setConfirmDeleteId(null);
      if (expandedId === confirmDeleteId) setExpandedId(null);
      showToast('Đã xóa phiên bản!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa', 'error');
    } finally {
      setSaving(false);
    }
  }, [confirmDeleteId, laborConfigs, expandedId, showToast]);

  // ─── Render ────────────────────────────────────────────────────────────

  const renderPriceTable = (
    prices: Record<string, RolePrice>,
    times: Record<string, TimeRule>,
    isEditing: boolean
  ) => (
    <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
      <table className="w-full text-sm text-gray-700">
        <thead>
          <tr className="bg-primary-800 text-white text-xs font-bold uppercase">
            <th rowSpan={2} className="px-5 py-3 text-left min-w-[180px] align-middle">Loại PTTT</th>
            <th colSpan={3} className="px-4 py-2 text-center border-l border-primary-700/40">Phụ cấp PTTT (đồng)</th>
            <th colSpan={2} className="px-4 py-2 text-center border-l border-primary-700/40">Thời gian (phút)</th>
            {isEditing && <th rowSpan={2} className="px-3 py-3 w-[50px] border-l border-primary-700/40"></th>}
          </tr>
          <tr className="bg-primary-700/80 text-white text-xs font-semibold">
            <th className="px-4 py-2 text-center w-[110px] border-l border-primary-600/30">Chính</th>
            <th className="px-4 py-2 text-center w-[110px] border-l border-primary-600/30">Phụ</th>
            <th className="px-4 py-2 text-center w-[110px] border-l border-primary-600/30">Giúp việc</th>
            <th className="px-4 py-2 text-center w-[90px] border-l border-primary-600/30">Tối thiểu</th>
            <th className="px-4 py-2 text-center w-[90px] border-l border-primary-600/30">Tối đa</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Phẫu thuật section */}
          <tr className="bg-primary-50/60">
            <td colSpan={isEditing ? 7 : 6} className="px-5 py-2.5 text-primary-800 uppercase text-xs font-bold tracking-wider">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                Phẫu thuật
              </span>
            </td>
          </tr>
          {SURGERY_TYPES.map((type) => renderRow(type, prices, times, isEditing, 'primary'))}

          {/* Thủ thuật section */}
          <tr className="bg-teal-50/60">
            <td colSpan={isEditing ? 7 : 6} className="px-5 py-2.5 text-teal-800 uppercase text-xs font-bold tracking-wider">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                Thủ thuật
              </span>
            </td>
          </tr>
          {PROCEDURE_TYPES.map((type) => renderRow(type, prices, times, isEditing, 'teal'))}
        </tbody>
      </table>
    </div>
  );

  const renderRow = (
    type: string,
    prices: Record<string, RolePrice>,
    times: Record<string, TimeRule>,
    isEditing: boolean,
    color: 'primary' | 'teal',
  ) => {
    const isRowEditing = isEditing && editingPriceRow === type;
    const label = type === 'PĐB' ? 'Loại Đặc biệt'
      : type === 'TĐB' ? 'Loại Đặc biệt'
      : type === 'TKPL' ? 'Không phân loại'
      : type.startsWith('P') ? type.replace("P", "Loại ")
      : type.replace("T", "Loại ");

    const colorMap = {
      primary: { editBg: 'bg-primary-50/80', ring: 'ring-primary-200', border: 'border-primary-300', focus: 'focus:border-primary-500 focus:ring-primary-500', btn: 'bg-primary-600 hover:bg-primary-700', hoverBtn: 'hover:text-primary-600 hover:bg-primary-50' },
      teal: { editBg: 'bg-teal-50/80', ring: 'ring-teal-200', border: 'border-teal-300', focus: 'focus:border-teal-500 focus:ring-teal-500', btn: 'bg-teal-600 hover:bg-teal-700', hoverBtn: 'hover:text-teal-600 hover:bg-teal-50' },
    }[color];

    return (
      <tr key={type} className={`transition-all duration-150 ${isRowEditing ? `${colorMap.editBg} ring-1 ${colorMap.ring} ring-inset` : 'hover:bg-gray-50/80'}`}>
        <td className="px-5 py-3 font-medium text-gray-700 pl-8">{label}</td>
        {isRowEditing ? (
          <>
            <td className="px-2 py-1.5">
              <NumberInput value={getPrice(editPrices, type, 'Chính')} onChange={(val) => handlePriceChange(type, 'Chính', val)}
                className={`w-full px-3 py-1.5 text-right text-gray-900 border ${colorMap.border} ${colorMap.focus} focus:ring-1 rounded-lg bg-white outline-none transition-all`} />
            </td>
            <td className="px-2 py-1.5">
              <NumberInput value={getPrice(editPrices, type, 'Phụ')} onChange={(val) => handlePriceChange(type, 'Phụ', val)}
                className={`w-full px-3 py-1.5 text-right text-gray-900 border ${colorMap.border} ${colorMap.focus} focus:ring-1 rounded-lg bg-white outline-none transition-all`} />
            </td>
            <td className="px-2 py-1.5">
              <NumberInput value={getPrice(editPrices, type, 'Giúp việc')} onChange={(val) => handlePriceChange(type, 'Giúp việc', val)}
                className={`w-full px-3 py-1.5 text-right text-gray-900 border ${colorMap.border} ${colorMap.focus} focus:ring-1 rounded-lg bg-white outline-none transition-all`} />
            </td>
            <td className="px-2 py-1.5">
              <NumberInput value={getTime(editTimes, type, 'min')} onChange={(val) => handleTimeChange(type, 'min', val)}
                className="w-full px-3 py-1.5 text-right text-gray-900 border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-lg bg-white outline-none transition-all" />
            </td>
            <td className="px-2 py-1.5">
              <NumberInput value={getTime(editTimes, type, 'max')} onChange={(val) => handleTimeChange(type, 'max', val)}
                className="w-full px-3 py-1.5 text-right text-gray-900 border border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-lg bg-white outline-none transition-all" />
            </td>
            <td className="px-2 py-1.5 text-center">
              <button onClick={() => setEditingPriceRow(null)} className={`p-1.5 rounded-lg ${colorMap.btn} text-white transition-colors shadow-sm`} title="Xong">
                <Check className="h-3.5 w-3.5" />
              </button>
            </td>
          </>
        ) : (
          <>
            <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{fmtMoney(getPrice(prices, type, 'Chính'))}</td>
            <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{fmtMoney(getPrice(prices, type, 'Phụ'))}</td>
            <td className="px-4 py-3 text-right font-mono text-gray-800 tabular-nums">{fmtMoney(getPrice(prices, type, 'Giúp việc'))}</td>
            <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">{getTime(times, type, 'min').toLocaleString()}</td>
            <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">{getTime(times, type, 'max').toLocaleString()}</td>
            {isEditing && (
              <td className="px-2 py-3 text-center">
                <button onClick={() => setEditingPriceRow(type)} className={`p-1.5 rounded-lg text-gray-400 ${colorMap.hoverBtn} transition-colors`} title="Sửa">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </td>
            )}
          </>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Định mức & Phụ cấp theo thời gian</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {laborConfigs.length} phiên bản · Mỗi phiên bản có hiệu lực trong khoảng thời gian riêng
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportLaborConfigsExcel(laborConfigs)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            disabled={laborConfigs.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Xuất Excel
          </button>
          <button
            onClick={() => { setShowNewForm(true); setNewFrom(new Date().toISOString().slice(0, 10)); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm phiên bản
          </button>
        </div>
      </div>

      {/* New version form */}
      {showNewForm && (
        <div className="p-4 border border-primary-200 rounded-xl bg-primary-50/50 space-y-3">
          <h4 className="text-sm font-bold text-primary-800">Tạo phiên bản mới</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tên phiên bản *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ví dụ: Quy định 2026"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Hiệu lực từ *</label>
              <input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Tùy chọn"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-gray-400 outline-none" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            💡 Phiên bản trước sẽ tự đóng hiệu lực. Giá trị ban đầu sẽ được sao chép từ phiên bản đang hiệu lực.
          </p>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-50">
              {saving ? '⏳ Đang tạo...' : '✓ Tạo'}
            </button>
            <button onClick={() => setShowNewForm(false)}
              className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Duplicate form */}
      {dupId && (
        <div className="p-4 border border-blue-200 rounded-xl bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-bold text-blue-800">Nhân đôi phiên bản</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tên mới</label>
              <input type="text" value={dupName} onChange={(e) => setDupName(e.target.value)} placeholder="Tùy chọn"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Hiệu lực từ *</label>
              <input type="date" value={dupFrom} onChange={(e) => setDupFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDuplicate} disabled={saving || !dupFrom}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? '⏳...' : '✓ Nhân đôi'}
            </button>
            <button onClick={() => setDupId(null)}
              className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="p-4 border border-red-200 rounded-xl bg-red-50/50 space-y-3">
          <p className="text-sm text-red-800 font-medium">
            ⚠️ Xác nhận xóa phiên bản "<strong>{laborConfigs.find(c => c.id === confirmDeleteId)?.name}</strong>"?
            <br />
            <span className="text-xs text-red-600">Phiên bản trước sẽ tự mở rộng hiệu lực để không có khoảng trống.</span>
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={saving}
              className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
              Xác nhận xóa
            </button>
            <button onClick={() => setConfirmDeleteId(null)}
              className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Version list */}
      {laborConfigs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">Chưa có phiên bản nào</p>
          <p className="text-xs mt-1">Nhấn "Thêm phiên bản" để bắt đầu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {laborConfigs.map((version) => {
            const isExpanded = expandedId === version.id;
            const isVersionEditing = editingId === version.id;
            const isActive = version.effectiveTo === null;

            return (
              <div key={version.id} className={`border rounded-xl overflow-hidden transition-all ${
                isActive ? 'border-emerald-200 bg-white' : 'border-gray-200 bg-gray-50/30'
              }`}>
                {/* Version header */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50/80'
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : version.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800 truncate">{version.name}</span>
                      {isActive && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full uppercase tracking-wider">
                          Đang hiệu lực
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {version.effectiveFrom} → {version.effectiveTo || 'Hiện tại'}
                      </span>
                      {version.note && (
                        <span className="truncate max-w-[200px]">· {version.note}</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isVersionEditing && (
                      <>
                        <button onClick={() => startEdit(version)} title="Sửa"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { setDupId(version.id); setDupName(`${version.name} (mới)`); setDupFrom(new Date().toISOString().slice(0, 10)); }}
                          title="Nhân đôi"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setConfirmDeleteId(version.id)} title="Xóa"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                    {/* Edit header info */}
                    {isVersionEditing && (
                      <div className="mt-4 p-3 border border-primary-200 rounded-lg bg-primary-50/30 space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Tên</label>
                            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hiệu lực từ</label>
                            <input type="date" value={editFrom} onChange={(e) => setEditFrom(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hiệu lực đến</label>
                            <input type="date" value={editTo} onChange={(e) => setEditTo(e.target.value)} placeholder="Để trống = đang hiệu lực"
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
                            <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-gray-400" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Price + Time table */}
                    <div className="mt-4">
                      {renderPriceTable(
                        isVersionEditing ? editPrices : version.priceConfig,
                        isVersionEditing ? editTimes : version.timeRules,
                        isVersionEditing,
                      )}
                    </div>

                    {/* Edit footer */}
                    {isVersionEditing && (
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button onClick={cancelEdit}
                          className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                          <X className="h-3.5 w-3.5 inline mr-1" />
                          Hủy
                        </button>
                        <button onClick={saveEdit} disabled={saving}
                          className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-50">
                          <Save className="h-3.5 w-3.5" />
                          {saving ? 'Đang lưu...' : 'Lưu'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
