/**
 * LaborConfigManager — Flat-table management for Định mức & Phụ cấp
 * 
 * 3 sub-tabs:
 * 1. Phụ cấp PTTT — flat table grouped by loại, main/sub rows
 * 2. Định mức thời gian — similar flat table
 * 3. Định mức bàn mổ — per-position staff limits
 * 
 * Style: cpbq-react LookupEditor (flat, clean, minimal)
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus, Copy, Trash2, Edit3, Save, X, Download, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Calendar, Pencil, Check, Clock, Users,
  DollarSign, Timer,
} from 'lucide-react';
import { LaborConfigVersion, RolePrice, TimeRule, LOAI_PTTT_ORDER } from '../../types';
import {
  addLaborConfig,
  updateLaborConfig,
  deleteLaborConfig,
  duplicateLaborConfig,
  exportLaborConfigsExcel,
} from '../../services/laborConfigService';
import { useConfig, StaffLimitConfig } from '../../contexts/ConfigContext';

interface Props {
  laborConfigs: LaborConfigVersion[];
}

type NormsSubTab = 'allowance' | 'time-norms' | 'table-norms';

const SURGERY_TYPES = ["PĐB", "P1", "P2", "P3"];
const PROCEDURE_TYPES = ["TĐB", "T1", "T2", "T3", "TKPL"];
const ALL_TYPES = [...SURGERY_TYPES, ...PROCEDURE_TYPES];

const LOAI_LABELS: Record<string, string> = {
  "PĐB": "Đặc biệt", "P1": "Loại 1", "P2": "Loại 2", "P3": "Loại 3",
  "TĐB": "Đặc biệt", "T1": "Loại 1", "T2": "Loại 2", "T3": "Loại 3", "TKPL": "Không phân loại",
};

const GROUP_LABELS: Record<string, string> = {
  "PĐB": "Phẫu thuật", "P1": "Phẫu thuật", "P2": "Phẫu thuật", "P3": "Phẫu thuật",
  "TĐB": "Thủ thuật", "T1": "Thủ thuật", "T2": "Thủ thuật", "T3": "Thủ thuật", "TKPL": "Thủ thuật",
};

const fmtMoney = (n: number) => n > 0 ? n.toLocaleString('vi-VN') : '0';
const fmtDate = (d: string | null) => d || '—';

// Staff positions for Định mức bàn mổ
const STAFF_POSITIONS = [
  { key: 'ptChinh', label: 'BS PT chính', group: 'surgeons' },
  { key: 'ptPhu', label: 'BS PT phụ', group: 'surgeons' },
  { key: 'bsGM', label: 'BS gây mê hồi sức', group: 'anesthesiologists' },
  { key: 'ktvGM', label: 'KTV gây mê', group: 'support' },
  { key: 'tdc', label: 'Tít dụng cụ', group: 'support' },
  { key: 'gv', label: 'Giúp việc', group: 'assistants' },
] as const;

// Inline NumberInput
const NumberInput: React.FC<{
  value: number;
  onChange: (val: number) => void;
  className?: string;
}> = ({ value, onChange, className = "" }) => {
  const [localVal, setLocalVal] = React.useState(value.toString());
  React.useEffect(() => { setLocalVal(value.toString()); }, [value]);
  return (
    <input
      type="text"
      value={localVal === '' ? '' : Number(localVal).toLocaleString('en-US')}
      onChange={(e) => {
        const val = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(val)) { onChange(Number(val)); setLocalVal(val); }
      }}
      onBlur={() => setLocalVal(value.toString())}
      className={className}
    />
  );
};

export const LaborConfigManager: React.FC<Props> = ({ laborConfigs }) => {
  const { config, updateConfig } = useConfig();
  const [subTab, setSubTab] = useState<NormsSubTab>('allowance');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // Edit state
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingLoai, setEditingLoai] = useState<string | null>(null);
  const [editPrices, setEditPrices] = useState<Record<string, RolePrice>>({});
  const [editTimes, setEditTimes] = useState<Record<string, TimeRule>>({});

  // New version form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrom, setNewFrom] = useState('');
  const [newNote, setNewNote] = useState('');

  // Delete/Duplicate
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dupId, setDupId] = useState<string | null>(null);
  const [dupFrom, setDupFrom] = useState('');
  const [dupName, setDupName] = useState('');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── Flatten data for flat table ──────────────────────────────────────
  // Group by loại PTTT → for each loại, find active version + expired versions
  const flatRows = useMemo(() => {
    const result: {
      loai: string;
      group: string;
      loaiLabel: string;
      active: LaborConfigVersion | null;
      expired: LaborConfigVersion[];
    }[] = [];

    for (const loai of ALL_TYPES) {
      const versionsForLoai = laborConfigs.filter(v =>
        v.priceConfig[loai] || v.timeRules[loai]
      );
      const active = versionsForLoai.find(v => v.effectiveTo === null) || null;
      const expired = versionsForLoai
        .filter(v => v.effectiveTo !== null)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

      result.push({
        loai,
        group: GROUP_LABELS[loai] || '',
        loaiLabel: LOAI_LABELS[loai] || loai,
        active,
        expired,
      });
    }
    return result;
  }, [laborConfigs]);

  const toggleExpand = (loai: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      next.has(loai) ? next.delete(loai) : next.add(loai);
      return next;
    });
  };

  // ─── CRUD handlers ────────────────────────────────────────────────────
  const startEdit = useCallback((version: LaborConfigVersion, loai: string) => {
    setEditingVersionId(version.id);
    setEditingLoai(loai);
    setEditPrices({ ...version.priceConfig });
    setEditTimes({ ...version.timeRules });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingVersionId(null);
    setEditingLoai(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingVersionId) return;
    setSaving(true);
    try {
      await updateLaborConfig(editingVersionId, { priceConfig: editPrices, timeRules: editTimes });
      cancelEdit();
      showToast('Đã lưu!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  }, [editingVersionId, editPrices, editTimes, cancelEdit, showToast]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !newFrom) { showToast('Nhập tên và ngày hiệu lực', 'error'); return; }
    setSaving(true);
    try {
      const latestActive = laborConfigs.find(c => c.effectiveTo === null);
      const prices = latestActive ? { ...latestActive.priceConfig } : undefined;
      const times = latestActive ? { ...latestActive.timeRules } : undefined;
      await addLaborConfig(newName.trim(), newFrom, prices || {
        "PĐB": { "Chính": 280000, "Phụ": 200000, "Giúp việc": 120000 },
        "P1": { "Chính": 125000, "Phụ": 90000, "Giúp việc": 70000 },
        "P2": { "Chính": 65000, "Phụ": 50000, "Giúp việc": 30000 },
        "P3": { "Chính": 50000, "Phụ": 30000, "Giúp việc": 15000 },
        "TĐB": { "Chính": 84000, "Phụ": 60000, "Giúp việc": 36000 },
        "T1": { "Chính": 37500, "Phụ": 27000, "Giúp việc": 21000 },
        "T2": { "Chính": 19500, "Phụ": 15000, "Giúp việc": 9000 },
        "T3": { "Chính": 15000, "Phụ": 9000, "Giúp việc": 4500 },
        "TKPL": { "Chính": 0, "Phụ": 0, "Giúp việc": 0 },
      }, times || {
        "PĐB": { min: 180, max: 240 }, "P1": { min: 120, max: 180 },
        "P2": { min: 60, max: 180 }, "P3": { min: 60, max: 120 },
        "TĐB": { min: 180, max: 240 }, "T1": { min: 120, max: 180 },
        "T2": { min: 60, max: 180 }, "T3": { min: 60, max: 120 },
        "TKPL": { min: 0, max: 0 },
      }, newNote, laborConfigs);
      setShowNewForm(false); setNewName(''); setNewFrom(''); setNewNote('');
      showToast('Đã tạo phiên bản mới!');
    } catch (err: any) { showToast(err.message || 'Lỗi', 'error'); }
    finally { setSaving(false); }
  }, [newName, newFrom, newNote, laborConfigs, showToast]);

  const handleDuplicate = useCallback(async () => {
    if (!dupId || !dupFrom) return;
    setSaving(true);
    try {
      await duplicateLaborConfig(dupId, dupFrom, laborConfigs, dupName || undefined);
      setDupId(null); setDupFrom(''); setDupName('');
      showToast('Đã nhân đôi phiên bản!');
    } catch (err: any) { showToast(err.message || 'Lỗi', 'error'); }
    finally { setSaving(false); }
  }, [dupId, dupFrom, dupName, laborConfigs, showToast]);

  const handleDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    setSaving(true);
    try {
      await deleteLaborConfig(confirmDeleteId, laborConfigs);
      setConfirmDeleteId(null);
      showToast('Đã xóa!');
    } catch (err: any) { showToast(err.message || 'Lỗi', 'error'); }
    finally { setSaving(false); }
  }, [confirmDeleteId, laborConfigs, showToast]);

  // ─── Sub-tab: Phụ cấp PTTT (flat table) ──────────────────────────────
  const renderAllowanceTab = () => {
    let currentGroup = '';
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nhóm</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Loại PTTT</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Chính (₫)</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Phụ (₫)</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Giúp việc (₫)</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực từ</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực đến</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row) => {
              const showGroupHeader = row.group !== currentGroup;
              if (showGroupHeader) currentGroup = row.group;
              const isExpanded = expandedTypes.has(row.loai);
              const hasExpired = row.expired.length > 0;

              return (
                <React.Fragment key={row.loai}>
                  {/* Group separator */}
                  {showGroupHeader && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${row.group === 'Phẫu thuật' ? 'bg-primary-500' : 'bg-teal-500'}`}></span>
                          {row.group}
                        </span>
                      </td>
                    </tr>
                  )}

                  {/* Main row (active version) */}
                  {row.active ? (
                    renderAllowanceRow(row.active, row.loai, row.loaiLabel, false, hasExpired, isExpanded)
                  ) : (
                    <tr className="border-b border-gray-100">
                      <td className="px-2 py-2.5 text-center text-gray-300">
                        {hasExpired && (
                          <button onClick={() => toggleExpand(row.loai)} className="p-0.5 rounded hover:bg-gray-100 transition-colors">
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{row.group}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-700">{row.loaiLabel}</td>
                      <td colSpan={4} className="px-3 py-2.5 text-center text-gray-400 text-xs italic">Chưa có cấu hình</td>
                      <td></td>
                      <td></td>
                    </tr>
                  )}

                  {/* Sub rows (expired versions) */}
                  {isExpanded && row.expired.map((ver) => (
                    renderAllowanceRow(ver, row.loai, row.loaiLabel, true, false, false)
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAllowanceRow = (
    ver: LaborConfigVersion, loai: string, loaiLabel: string,
    isExpired: boolean, hasChildren: boolean, isExpanded: boolean
  ) => {
    const price = ver.priceConfig[loai] || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 };
    const isEditing = editingVersionId === ver.id && editingLoai === loai;
    const editPrice = editPrices[loai] || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 };

    return (
      <tr
        key={`${loai}-${ver.id}`}
        className={`border-b border-gray-100 transition-colors ${
          isExpired ? 'bg-gray-50/50' : 'hover:bg-blue-50/30'
        } ${isEditing ? 'bg-amber-50/60' : ''}`}
      >
        {/* Expand toggle */}
        <td className="px-2 py-2 text-center">
          {!isExpired && hasChildren && (
            <button onClick={() => toggleExpand(loai)} className="p-0.5 rounded hover:bg-gray-100 transition-colors text-gray-400">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </td>

        {/* Nhóm */}
        <td className={`px-3 py-2 text-xs ${isExpired ? 'text-gray-400 pl-6' : 'text-gray-500'}`}>
          {isExpired ? '' : GROUP_LABELS[loai]}
        </td>

        {/* Loại */}
        <td className={`px-3 py-2 ${isExpired ? 'text-gray-400 text-xs pl-6' : 'font-medium text-gray-800'}`}>
          {isExpired ? `↳ ${loaiLabel}` : loaiLabel}
        </td>

        {/* Chính */}
        <td className="px-3 py-1.5 text-right">
          {isEditing ? (
            <NumberInput value={editPrice["Chính"]} onChange={(v) => setEditPrices(p => ({ ...p, [loai]: { ...p[loai], "Chính": v } }))}
              className="w-full px-2 py-1 text-right text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
          ) : (
            <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-800'}`}>{fmtMoney(price["Chính"])}</span>
          )}
        </td>

        {/* Phụ */}
        <td className="px-3 py-1.5 text-right">
          {isEditing ? (
            <NumberInput value={editPrice["Phụ"]} onChange={(v) => setEditPrices(p => ({ ...p, [loai]: { ...p[loai], "Phụ": v } }))}
              className="w-full px-2 py-1 text-right text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
          ) : (
            <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-800'}`}>{fmtMoney(price["Phụ"])}</span>
          )}
        </td>

        {/* Giúp việc */}
        <td className="px-3 py-1.5 text-right">
          {isEditing ? (
            <NumberInput value={editPrice["Giúp việc"]} onChange={(v) => setEditPrices(p => ({ ...p, [loai]: { ...p[loai], "Giúp việc": v } }))}
              className="w-full px-2 py-1 text-right text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
          ) : (
            <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-800'}`}>{fmtMoney(price["Giúp việc"])}</span>
          )}
        </td>

        {/* Hiệu lực từ */}
        <td className={`px-3 py-2 text-center text-xs ${isExpired ? 'text-gray-400' : 'text-gray-600'}`}>
          {ver.effectiveFrom}
        </td>

        {/* Hiệu lực đến */}
        <td className={`px-3 py-2 text-center text-xs ${isExpired ? 'text-gray-400' : 'text-emerald-600 font-medium'}`}>
          {ver.effectiveTo || 'Hiện tại'}
        </td>

        {/* Actions */}
        <td className="px-2 py-1.5 text-center">
          {isEditing ? (
            <div className="flex gap-0.5 justify-center">
              <button onClick={saveEdit} disabled={saving} title="Lưu" className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancelEdit} title="Hủy" className="p-1 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-0.5 justify-center">
              <button onClick={() => startEdit(ver, loai)} title="Sửa" className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                <Pencil className="h-3 w-3" />
              </button>
              {!isExpired && (
                <>
                  <button onClick={() => { setDupId(ver.id); setDupName(`${ver.name} (mới)`); setDupFrom(new Date().toISOString().slice(0, 10)); }}
                    title="Nhân đôi" className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Copy className="h-3 w-3" />
                  </button>
                </>
              )}
              <button onClick={() => setConfirmDeleteId(ver.id)} title="Xóa" className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  // ─── Sub-tab: Định mức thời gian (flat table) ────────────────────────
  const renderTimeNormsTab = () => {
    let currentGroup = '';
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="px-2 py-2.5"></th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nhóm</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Loại PTTT</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tối thiểu (phút)</th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tối đa (phút)</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực từ</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực đến</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row) => {
              const showGroupHeader = row.group !== currentGroup;
              if (showGroupHeader) currentGroup = row.group;
              const isExpanded = expandedTypes.has(`time_${row.loai}`);
              const hasExpired = row.expired.length > 0;

              return (
                <React.Fragment key={row.loai}>
                  {showGroupHeader && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${row.group === 'Phẫu thuật' ? 'bg-primary-500' : 'bg-teal-500'}`}></span>
                          {row.group}
                        </span>
                      </td>
                    </tr>
                  )}

                  {row.active ? (
                    renderTimeRow(row.active, row.loai, row.loaiLabel, false, hasExpired, isExpanded)
                  ) : (
                    <tr className="border-b border-gray-100">
                      <td className="px-2 py-2.5 text-center text-gray-300">
                        {hasExpired && (
                          <button onClick={() => toggleExpand(`time_${row.loai}`)} className="p-0.5 rounded hover:bg-gray-100">
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{row.group}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-700">{row.loaiLabel}</td>
                      <td colSpan={3} className="px-3 py-2.5 text-center text-gray-400 text-xs italic">Chưa có cấu hình</td>
                      <td></td>
                      <td></td>
                    </tr>
                  )}

                  {isExpanded && row.expired.map((ver) => renderTimeRow(ver, row.loai, row.loaiLabel, true, false, false))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTimeRow = (
    ver: LaborConfigVersion, loai: string, loaiLabel: string,
    isExpired: boolean, hasChildren: boolean, isExpanded: boolean
  ) => {
    const time = ver.timeRules[loai] || { min: 0, max: 0 };
    const isEditing = editingVersionId === ver.id && editingLoai === `time_${loai}`;
    const editTime = editTimes[loai] || { min: 0, max: 0 };

    return (
      <tr key={`time_${loai}-${ver.id}`} className={`border-b border-gray-100 transition-colors ${isExpired ? 'bg-gray-50/50' : 'hover:bg-blue-50/30'} ${isEditing ? 'bg-amber-50/60' : ''}`}>
        <td className="px-2 py-2 text-center">
          {!isExpired && hasChildren && (
            <button onClick={() => toggleExpand(`time_${loai}`)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </td>
        <td className={`px-3 py-2 text-xs ${isExpired ? 'text-gray-400 pl-6' : 'text-gray-500'}`}>{isExpired ? '' : GROUP_LABELS[loai]}</td>
        <td className={`px-3 py-2 ${isExpired ? 'text-gray-400 text-xs pl-6' : 'font-medium text-gray-800'}`}>{isExpired ? `↳ ${loaiLabel}` : loaiLabel}</td>

        <td className="px-3 py-1.5 text-right">
          {isEditing ? (
            <NumberInput value={editTime.min} onChange={(v) => setEditTimes(p => ({ ...p, [loai]: { ...p[loai], min: v } }))}
              className="w-full px-2 py-1 text-right text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
          ) : (
            <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-600'}`}>{time.min}</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right">
          {isEditing ? (
            <NumberInput value={editTime.max} onChange={(v) => setEditTimes(p => ({ ...p, [loai]: { ...p[loai], max: v } }))}
              className="w-full px-2 py-1 text-right text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" />
          ) : (
            <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-600'}`}>{time.max}</span>
          )}
        </td>

        <td className={`px-3 py-2 text-center text-xs ${isExpired ? 'text-gray-400' : 'text-gray-600'}`}>{ver.effectiveFrom}</td>
        <td className={`px-3 py-2 text-center text-xs ${isExpired ? 'text-gray-400' : 'text-emerald-600 font-medium'}`}>{ver.effectiveTo || 'Hiện tại'}</td>

        <td className="px-2 py-1.5 text-center">
          {isEditing ? (
            <div className="flex gap-0.5 justify-center">
              <button onClick={saveEdit} disabled={saving} className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex gap-0.5 justify-center">
              <button onClick={() => { setEditingVersionId(ver.id); setEditingLoai(`time_${loai}`); setEditTimes({ ...ver.timeRules }); }}
                className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50"><Pencil className="h-3 w-3" /></button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  // ─── Sub-tab: Định mức bàn mổ (per-position) ─────────────────────────
  const renderTableNormsTab = () => {
    // Get individual position limits, falling back to group defaults
    const getPositionLimit = (posKey: string, groupKey: string): number => {
      const limits = config.staffLimits as any;
      if (limits[posKey] !== undefined) return limits[posKey];
      return limits[groupKey] ?? 1;
    };

    const updatePositionLimit = (posKey: string, val: number) => {
      updateConfig({
        staffLimits: {
          ...config.staffLimits,
          [posKey]: val,
        } as any,
      });
    };

    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '40px' }} />
            <col />
            <col style={{ width: '260px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">#</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Vị trí</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tùy chọn kiểm tra trùng giờ</th>
            </tr>
          </thead>
          <tbody>
            {STAFF_POSITIONS.map((pos, idx) => (
              <tr key={pos.key} className={`border-b border-gray-100 transition-colors hover:bg-blue-50/30 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                <td className="px-3 py-2.5 text-center text-gray-400 text-xs font-medium">{idx + 1}</td>
                <td className="px-3 py-2.5 font-medium text-gray-700">{pos.label}</td>
                <td className="px-3 py-2 text-center">
                  <select
                    value={getPositionLimit(pos.key, pos.group)}
                    onChange={(e) => updatePositionLimit(pos.key, Number(e.target.value))}
                    className="border-gray-300 rounded-md shadow-sm text-sm px-3 pr-9 py-1.5 min-w-[220px] outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value={0}>Không kiểm tra trùng giờ</option>
                    <option value={1}>Tối đa 1 bàn mổ (1 ca)</option>
                    <option value={2}>Tối đa 2 bàn mổ (2 ca)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────
  const subTabs: { key: NormsSubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'allowance', label: 'Phụ cấp PTTT', icon: <DollarSign className="h-3.5 w-3.5" /> },
    { key: 'time-norms', label: 'Định mức thời gian', icon: <Timer className="h-3.5 w-3.5" /> },
    { key: 'table-norms', label: 'Định mức bàn mổ', icon: <Users className="h-3.5 w-3.5" /> },
  ];

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

      {/* Sub-tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {subTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                subTab === tab.key
                  ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Header actions (for Phụ cấp + Định mức TG) */}
      {(subTab === 'allowance' || subTab === 'time-norms') && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {laborConfigs.length} phiên bản · Dòng chính = đang hiệu lực, dòng phụ = đã hết hiệu lực
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => exportLaborConfigsExcel(laborConfigs)} disabled={laborConfigs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> Xuất Excel
            </button>
            <button onClick={() => { setShowNewForm(true); setNewFrom(new Date().toISOString().slice(0, 10)); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Thêm phiên bản
            </button>
          </div>
        </div>
      )}

      {/* New form */}
      {showNewForm && (
        <div className="p-4 border border-primary-200 rounded-xl bg-primary-50/50 space-y-3">
          <h4 className="text-sm font-bold text-primary-800">Tạo phiên bản mới</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tên *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="VD: Quy định 2026"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Hiệu lực từ *</label>
              <input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-gray-400" />
            </div>
          </div>
          <p className="text-xs text-gray-500">💡 Phiên bản trước tự đóng hiệu lực. Giá trị sao chép từ bản đang hiệu lực.</p>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving} className="px-4 py-2 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 disabled:opacity-50">{saving ? '⏳...' : '✓ Tạo'}</button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Hủy</button>
          </div>
        </div>
      )}

      {/* Duplicate form */}
      {dupId && (
        <div className="p-4 border border-blue-200 rounded-xl bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-bold text-blue-800">Nhân đôi phiên bản</h4>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Tên mới</label>
              <input type="text" value={dupName} onChange={(e) => setDupName(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Hiệu lực từ *</label>
              <input type="date" value={dupFrom} onChange={(e) => setDupFrom(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDuplicate} disabled={saving || !dupFrom} className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '⏳...' : '✓ Nhân đôi'}</button>
            <button onClick={() => setDupId(null)} className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Hủy</button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="p-4 border border-red-200 rounded-xl bg-red-50/50 space-y-3">
          <p className="text-sm text-red-800 font-medium">⚠️ Xác nhận xóa phiên bản "<strong>{laborConfigs.find(c => c.id === confirmDeleteId)?.name}</strong>"?</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={saving} className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Xác nhận xóa</button>
            <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Hủy</button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div style={{ display: subTab === 'allowance' ? 'block' : 'none' }}>
        {renderAllowanceTab()}
      </div>
      <div style={{ display: subTab === 'time-norms' ? 'block' : 'none' }}>
        {renderTimeNormsTab()}
      </div>
      <div style={{ display: subTab === 'table-norms' ? 'block' : 'none' }}>
        {renderTableNormsTab()}
      </div>
    </div>
  );
};
