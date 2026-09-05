/**
 * LaborConfigManager — Flat-table CPBQ-style for Định mức & Phụ cấp
 * 
 * Each row = 1 loại PTTT from a LaborConfigVersion, displayed independently.
 * When editing a row, only that loại's values are changed within the version.
 * Adding a new row for a loại = creates a new version (or duplicates existing).
 * 
 * 3 sub-tabs:
 * 1. Phụ cấp PTTT — flat table, each loại row independent with effectiveFrom/To
 * 2. Định mức thời gian — same pattern
 * 3. Định mức bàn mổ — per-position staff limits (static config)
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus, Trash2, Save, X, Download,
  CheckCircle2, AlertTriangle, Pencil, Check,
  DollarSign, Timer, Users, ChevronDown, ChevronRight,
} from 'lucide-react';
import { LaborConfigVersion, RolePrice, TimeRule } from '../../types';
import {
  updateLaborConfig,
  exportLaborConfigsExcel,
} from '../../services/laborConfigService';
import { ref, push, set, remove, update } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useConfig } from '../../contexts/ConfigContext';

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

const LABOR_CONFIG_PATH = 'labor_config_versions';

// Staff positions for Định mức bàn mổ
const STAFF_POSITIONS = [
  { key: 'ptChinh', label: 'BS PT chính', group: 'surgeons' },
  { key: 'ptPhu', label: 'BS PT phụ', group: 'surgeons' },
  { key: 'bsGM', label: 'BS gây mê hồi sức', group: 'anesthesiologists' },
  { key: 'ktvGM', label: 'KTV gây mê', group: 'support' },
  { key: 'tdc', label: 'Tít dụng cụ', group: 'support' },
  { key: 'gv', label: 'Giúp việc', group: 'assistants' },
] as const;

// ─── Flatten data: each row = 1 loại × 1 version ────────────────────────────
interface FlatRow {
  rowKey: string;          // unique key: `${loai}_${versionId}`
  loai: string;            // PĐB, P1, ...
  group: string;           // Phẫu thuật / Thủ thuật
  loaiLabel: string;       // Đặc biệt, Loại 1, ...
  versionId: string;
  versionName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;       // effectiveTo === null
  price: RolePrice;
  time: TimeRule;
}

function buildFlatRows(configs: LaborConfigVersion[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const ver of configs) {
    for (const loai of ALL_TYPES) {
      const price = ver.priceConfig[loai];
      const time = ver.timeRules[loai];
      if (price || time) {
        rows.push({
          rowKey: `${loai}_${ver.id}`,
          loai,
          group: GROUP_LABELS[loai] || '',
          loaiLabel: LOAI_LABELS[loai] || loai,
          versionId: ver.id,
          versionName: ver.name,
          effectiveFrom: ver.effectiveFrom,
          effectiveTo: ver.effectiveTo,
          isActive: ver.effectiveTo === null,
          price: price || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 },
          time: time || { min: 0, max: 0 },
        });
      }
    }
  }
  return rows;
}

// Group rows by loại: active first, then expired sorted newest-first
function groupByLoai(rows: FlatRow[]): Map<string, { active: FlatRow[]; expired: FlatRow[] }> {
  const map = new Map<string, { active: FlatRow[]; expired: FlatRow[] }>();
  for (const loai of ALL_TYPES) {
    map.set(loai, { active: [], expired: [] });
  }
  for (const row of rows) {
    const group = map.get(row.loai)!;
    if (row.isActive) {
      group.active.push(row);
    } else {
      group.expired.push(row);
    }
  }
  // Sort expired by effectiveFrom desc
  for (const [, group] of map) {
    group.expired.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }
  return map;
}

// Inline editable number
const NumInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  className?: string;
}> = ({ value, onChange, className = "" }) => {
  const [local, setLocal] = React.useState(value.toString());
  React.useEffect(() => { setLocal(value.toString()); }, [value]);
  return (
    <input
      type="text"
      value={local === '' ? '' : Number(local).toLocaleString('en-US')}
      onChange={(e) => {
        const v = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(v)) { onChange(Number(v)); setLocal(v); }
      }}
      onBlur={() => setLocal(value.toString())}
      className={className}
    />
  );
};

export const LaborConfigManager: React.FC<Props> = ({ laborConfigs }) => {
  const { config, updateConfig } = useConfig();
  const [subTab, setSubTab] = useState<NormsSubTab>('allowance');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // Inline edit state for single row
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<RolePrice>({ "Chính": 0, "Phụ": 0, "Giúp việc": 0 });
  const [editTime, setEditTime] = useState<TimeRule>({ min: 0, max: 0 });
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');

  // Add new row
  const [addingForLoai, setAddingForLoai] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<RolePrice>({ "Chính": 0, "Phụ": 0, "Giúp việc": 0 });
  const [newTime, setNewTime] = useState<TimeRule>({ min: 0, max: 0 });
  const [newFrom, setNewFrom] = useState('');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Flatten and group
  const flatRows = useMemo(() => buildFlatRows(laborConfigs), [laborConfigs]);
  const grouped = useMemo(() => groupByLoai(flatRows), [flatRows]);

  const toggleExpand = (loai: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      next.has(loai) ? next.delete(loai) : next.add(loai);
      return next;
    });
  };

  // ─── Start editing a single row ───────────────────────────────────────
  const startEdit = useCallback((row: FlatRow) => {
    setEditingKey(row.rowKey);
    setEditPrice({ ...row.price });
    setEditTime({ ...row.time });
    setEditFrom(row.effectiveFrom);
    setEditTo(row.effectiveTo || '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
  }, []);

  // Save: update only this loai within the version
  const saveRowEdit = useCallback(async (row: FlatRow) => {
    setSaving(true);
    try {
      const version = laborConfigs.find(v => v.id === row.versionId);
      if (!version) throw new Error('Không tìm thấy phiên bản');

      await updateLaborConfig(row.versionId, {
        priceConfig: { ...version.priceConfig, [row.loai]: editPrice },
        timeRules: { ...version.timeRules, [row.loai]: editTime },
        effectiveFrom: editFrom || version.effectiveFrom,
        effectiveTo: editTo || null,
      });
      setEditingKey(null);
      showToast('Đã lưu!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  }, [laborConfigs, editPrice, editTime, editFrom, editTo, showToast]);

  // ─── Add new row for a specific loại ──────────────────────────────────
  const startAdd = useCallback((loai: string, row?: FlatRow) => {
    setAddingForLoai(loai);
    setNewFrom(new Date().toISOString().slice(0, 10));
    if (row) {
      setNewPrice({ ...row.price });
      setNewTime({ ...row.time });
    } else {
      setNewPrice({ "Chính": 0, "Phụ": 0, "Giúp việc": 0 });
      setNewTime({ min: 0, max: 0 });
    }
  }, []);

  const cancelAdd = useCallback(() => {
    setAddingForLoai(null);
  }, []);

  // When adding a new row for a loại:
  // 1. Close the currently active version's effectiveTo for that loại
  // 2. Create a new version with only this loại's data (+ copy all others from active)
  const saveNewRow = useCallback(async (loai: string) => {
    if (!newFrom) { showToast('Nhập ngày hiệu lực', 'error'); return; }
    setSaving(true);
    try {
      const now = Date.now();
      
      // Find currently active version
      const activeVersion = laborConfigs.find(v => v.effectiveTo === null);
      
      if (activeVersion) {
        // Close the active version
        const closedEnd = (() => {
          const d = new Date(newFrom);
          d.setDate(d.getDate() - 1);
          return d.toISOString().slice(0, 10);
        })();
        
        await update(ref(db, `${LABOR_CONFIG_PATH}/${activeVersion.id}`), {
          effectiveTo: closedEnd,
          updatedAt: now,
        });

        // Create new version with updated loai data
        const newPriceConfig = { ...activeVersion.priceConfig, [loai]: newPrice };
        const newTimeRules = { ...activeVersion.timeRules, [loai]: newTime };

        const newRef = push(ref(db, LABOR_CONFIG_PATH));
        await set(newRef, {
          name: `Cập nhật ${loai} ${newFrom}`,
          effectiveFrom: newFrom,
          effectiveTo: null,
          priceConfig: newPriceConfig,
          timeRules: newTimeRules,
          note: `Cập nhật ${loai}`,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // No active version — create fresh
        const newRef = push(ref(db, LABOR_CONFIG_PATH));
        await set(newRef, {
          name: `Cập nhật ${loai} ${newFrom}`,
          effectiveFrom: newFrom,
          effectiveTo: null,
          priceConfig: { [loai]: newPrice },
          timeRules: { [loai]: newTime },
          note: '',
          createdAt: now,
          updatedAt: now,
        });
      }

      setAddingForLoai(null);
      showToast('Đã thêm dòng mới!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  }, [newFrom, newPrice, newTime, laborConfigs, showToast]);

  // ─── Delete row ───────────────────────────────────────────────────────
  const deleteRow = useCallback(async (row: FlatRow) => {
    if (!window.confirm(`Xóa dòng ${row.loaiLabel} (${row.effectiveFrom})?`)) return;
    setSaving(true);
    try {
      // Check if this is the only loai in the version
      const version = laborConfigs.find(v => v.id === row.versionId);
      if (!version) return;

      const otherPrices = { ...version.priceConfig };
      delete otherPrices[row.loai];
      const otherTimes = { ...version.timeRules };
      delete otherTimes[row.loai];

      if (Object.keys(otherPrices).length === 0 && Object.keys(otherTimes).length === 0) {
        // This was the only loai — delete the entire version
        await remove(ref(db, `${LABOR_CONFIG_PATH}/${row.versionId}`));
      } else {
        // Remove just this loai from the version
        await updateLaborConfig(row.versionId, {
          priceConfig: otherPrices,
          timeRules: otherTimes,
        });
      }
      showToast('Đã xóa!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  }, [laborConfigs, showToast]);

  // ─── Input cell styles ────────────────────────────────────────────────
  const editCls = "w-full px-2 py-1 text-right text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500";
  const dateCls = "w-full px-2 py-1 text-center text-xs border border-gray-300 rounded-md bg-white outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500";

  // ─── Tab: Phụ cấp PTTT ────────────────────────────────────────────────
  const renderAllowanceTab = () => {
    let currentGroup = '';
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '95px' }} />
            <col style={{ width: '95px' }} />
            <col style={{ width: '95px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '72px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="px-1 py-2.5"></th>
              <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nhóm</th>
              <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Loại PTTT</th>
              <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Chính (₫)</th>
              <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Phụ (₫)</th>
              <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Giúp việc (₫)</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực từ</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực đến</th>
              <th className="px-1 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {ALL_TYPES.map((loai) => {
              const data = grouped.get(loai)!;
              const showGroupHeader = GROUP_LABELS[loai] !== currentGroup;
              if (showGroupHeader) currentGroup = GROUP_LABELS[loai];
              const isExpanded = expandedTypes.has(loai);
              const hasExpired = data.expired.length > 0;
              const activeRow = data.active[0]; // Usually 1 active

              return (
                <React.Fragment key={loai}>
                  {/* Group separator */}
                  {showGroupHeader && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${currentGroup === 'Phẫu thuật' ? 'bg-primary-500' : 'bg-teal-500'}`}></span>
                          {currentGroup}
                        </span>
                      </td>
                    </tr>
                  )}

                  {/* Active row */}
                  {activeRow ? renderAllowanceRow(activeRow, false, hasExpired, isExpanded) : (
                    <tr className="border-b border-gray-100">
                      <td className="px-1 py-2 text-center">{hasExpired && (
                        <button onClick={() => toggleExpand(loai)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      )}</td>
                      <td className="px-2 py-2 text-gray-400 text-xs">{GROUP_LABELS[loai]}</td>
                      <td className="px-2 py-2 font-medium text-gray-700">{LOAI_LABELS[loai]}</td>
                      <td colSpan={4} className="px-2 py-2 text-center text-gray-400 text-xs italic">Chưa có</td>
                      <td className="px-1 py-1 text-center">
                        <button onClick={() => startAdd(loai)} title="Thêm" className="p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"><Plus className="h-3 w-3" /></button>
                      </td>
                      <td></td>
                    </tr>
                  )}

                  {/* Add new row form (inline) */}
                  {addingForLoai === loai && renderAddRow(loai, 'allowance')}

                  {/* Expired sub-rows */}
                  {isExpanded && data.expired.map(row => renderAllowanceRow(row, true, false, false))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAllowanceRow = (row: FlatRow, isExpired: boolean, hasChildren: boolean, isExpanded: boolean) => {
    const isEditing = editingKey === row.rowKey;

    return (
      <tr key={row.rowKey} className={`border-b border-gray-100 transition-colors ${isExpired ? 'bg-gray-50/50' : 'hover:bg-blue-50/30'} ${isEditing ? 'bg-amber-50/60' : ''}`}>
        <td className="px-1 py-2 text-center">
          {!isExpired && hasChildren && (
            <button onClick={() => toggleExpand(row.loai)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </td>
        <td className={`px-2 py-2 text-xs ${isExpired ? 'text-gray-400 pl-5' : 'text-gray-500'}`}>{isExpired ? '' : GROUP_LABELS[row.loai]}</td>
        <td className={`px-2 py-2 ${isExpired ? 'text-gray-400 text-xs pl-5' : 'font-medium text-gray-800'}`}>{isExpired ? `↳ ${row.loaiLabel}` : row.loaiLabel}</td>

        {/* Chính */}
        <td className="px-2 py-1 text-right">
          {isEditing ? <NumInput value={editPrice["Chính"]} onChange={v => setEditPrice(p => ({ ...p, "Chính": v }))} className={editCls} />
            : <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-800'}`}>{fmtMoney(row.price["Chính"])}</span>}
        </td>
        {/* Phụ */}
        <td className="px-2 py-1 text-right">
          {isEditing ? <NumInput value={editPrice["Phụ"]} onChange={v => setEditPrice(p => ({ ...p, "Phụ": v }))} className={editCls} />
            : <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-800'}`}>{fmtMoney(row.price["Phụ"])}</span>}
        </td>
        {/* Giúp việc */}
        <td className="px-2 py-1 text-right">
          {isEditing ? <NumInput value={editPrice["Giúp việc"]} onChange={v => setEditPrice(p => ({ ...p, "Giúp việc": v }))} className={editCls} />
            : <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-800'}`}>{fmtMoney(row.price["Giúp việc"])}</span>}
        </td>

        {/* Hiệu lực từ */}
        <td className="px-1 py-1 text-center">
          {isEditing ? <input type="date" value={editFrom} onChange={e => setEditFrom(e.target.value)} className={dateCls} />
            : <span className={`text-xs ${isExpired ? 'text-gray-400' : 'text-gray-600'}`}>{row.effectiveFrom}</span>}
        </td>
        {/* Hiệu lực đến */}
        <td className="px-1 py-1 text-center">
          {isEditing ? <input type="date" value={editTo} onChange={e => setEditTo(e.target.value)} className={dateCls} />
            : <span className={`text-xs ${isExpired ? 'text-gray-400' : 'text-emerald-600 font-medium'}`}>{row.effectiveTo || '—'}</span>}
        </td>

        {/* Actions */}
        <td className="px-1 py-1 text-center">
          {isEditing ? (
            <div className="flex gap-0.5 justify-center">
              <button onClick={() => saveRowEdit(row)} disabled={saving} className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex gap-0.5 justify-center">
              <button onClick={() => startEdit(row)} title="Sửa" className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50"><Pencil className="h-3 w-3" /></button>
              {!isExpired && <button onClick={() => startAdd(row.loai, row)} title="Thêm dòng mới" className="p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"><Plus className="h-3 w-3" /></button>}
              <button onClick={() => deleteRow(row)} title="Xóa" className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  // ─── Tab: Định mức thời gian ──────────────────────────────────────────
  const renderTimeNormsTab = () => {
    let currentGroup = '';
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '72px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="px-1 py-2.5"></th>
              <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nhóm</th>
              <th className="px-2 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Loại PTTT</th>
              <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tối thiểu (phút)</th>
              <th className="px-2 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tối đa (phút)</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực từ</th>
              <th className="px-2 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hiệu lực đến</th>
              <th className="px-1 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {ALL_TYPES.map((loai) => {
              const data = grouped.get(loai)!;
              const showGroupHeader = GROUP_LABELS[loai] !== currentGroup;
              if (showGroupHeader) currentGroup = GROUP_LABELS[loai];
              const isExpanded = expandedTypes.has(`t_${loai}`);
              const hasExpired = data.expired.length > 0;
              const activeRow = data.active[0];

              return (
                <React.Fragment key={loai}>
                  {showGroupHeader && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${currentGroup === 'Phẫu thuật' ? 'bg-primary-500' : 'bg-teal-500'}`}></span>
                          {currentGroup}
                        </span>
                      </td>
                    </tr>
                  )}

                  {activeRow ? renderTimeRow(activeRow, false, hasExpired, isExpanded) : (
                    <tr className="border-b border-gray-100">
                      <td className="px-1 py-2 text-center">{hasExpired && (
                        <button onClick={() => toggleExpand(`t_${loai}`)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      )}</td>
                      <td className="px-2 py-2 text-gray-400 text-xs">{GROUP_LABELS[loai]}</td>
                      <td className="px-2 py-2 font-medium text-gray-700">{LOAI_LABELS[loai]}</td>
                      <td colSpan={3} className="px-2 py-2 text-center text-gray-400 text-xs italic">Chưa có</td>
                      <td className="px-1 py-1 text-center">
                        <button onClick={() => startAdd(loai)} className="p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"><Plus className="h-3 w-3" /></button>
                      </td>
                      <td></td>
                    </tr>
                  )}

                  {addingForLoai === loai && renderAddRow(loai, 'time')}
                  {isExpanded && data.expired.map(row => renderTimeRow(row, true, false, false))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTimeRow = (row: FlatRow, isExpired: boolean, hasChildren: boolean, isExpanded: boolean) => {
    const isEditing = editingKey === `t_${row.rowKey}`;

    return (
      <tr key={`t_${row.rowKey}`} className={`border-b border-gray-100 transition-colors ${isExpired ? 'bg-gray-50/50' : 'hover:bg-blue-50/30'} ${isEditing ? 'bg-amber-50/60' : ''}`}>
        <td className="px-1 py-2 text-center">
          {!isExpired && hasChildren && (
            <button onClick={() => toggleExpand(`t_${row.loai}`)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </td>
        <td className={`px-2 py-2 text-xs ${isExpired ? 'text-gray-400 pl-5' : 'text-gray-500'}`}>{isExpired ? '' : GROUP_LABELS[row.loai]}</td>
        <td className={`px-2 py-2 ${isExpired ? 'text-gray-400 text-xs pl-5' : 'font-medium text-gray-800'}`}>{isExpired ? `↳ ${row.loaiLabel}` : row.loaiLabel}</td>

        <td className="px-2 py-1 text-right">
          {isEditing ? <NumInput value={editTime.min} onChange={v => setEditTime(p => ({ ...p, min: v }))} className={editCls} />
            : <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-600'}`}>{row.time.min}</span>}
        </td>
        <td className="px-2 py-1 text-right">
          {isEditing ? <NumInput value={editTime.max} onChange={v => setEditTime(p => ({ ...p, max: v }))} className={editCls} />
            : <span className={`font-mono tabular-nums ${isExpired ? 'text-gray-400 text-xs' : 'text-gray-600'}`}>{row.time.max}</span>}
        </td>

        <td className="px-1 py-1 text-center">
          {isEditing ? <input type="date" value={editFrom} onChange={e => setEditFrom(e.target.value)} className={dateCls} />
            : <span className={`text-xs ${isExpired ? 'text-gray-400' : 'text-gray-600'}`}>{row.effectiveFrom}</span>}
        </td>
        <td className="px-1 py-1 text-center">
          {isEditing ? <input type="date" value={editTo} onChange={e => setEditTo(e.target.value)} className={dateCls} />
            : <span className={`text-xs ${isExpired ? 'text-gray-400' : 'text-emerald-600 font-medium'}`}>{row.effectiveTo || '—'}</span>}
        </td>

        <td className="px-1 py-1 text-center">
          {isEditing ? (
            <div className="flex gap-0.5 justify-center">
              <button onClick={() => saveRowEdit(row)} disabled={saving} className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={cancelEdit} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex gap-0.5 justify-center">
              <button onClick={() => { setEditingKey(`t_${row.rowKey}`); setEditTime({ ...row.time }); setEditFrom(row.effectiveFrom); setEditTo(row.effectiveTo || ''); }}
                title="Sửa" className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50"><Pencil className="h-3 w-3" /></button>
              {!isExpired && <button onClick={() => startAdd(row.loai, row)} title="Thêm dòng mới" className="p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"><Plus className="h-3 w-3" /></button>}
              <button onClick={() => deleteRow(row)} title="Xóa" className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  // ─── Inline add row (used in both tabs) ───────────────────────────────
  const renderAddRow = (loai: string, mode: 'allowance' | 'time') => (
    <tr className="border-b border-gray-100 bg-emerald-50/40">
      <td className="px-1 py-1"></td>
      <td className="px-2 py-1 text-xs text-emerald-700 font-bold" colSpan={mode === 'allowance' ? 1 : 1}>+</td>
      <td className="px-2 py-1 text-xs text-emerald-700 font-semibold">{LOAI_LABELS[loai]} (mới)</td>

      {mode === 'allowance' ? (
        <>
          <td className="px-2 py-1"><NumInput value={newPrice["Chính"]} onChange={v => setNewPrice(p => ({ ...p, "Chính": v }))} className={editCls} /></td>
          <td className="px-2 py-1"><NumInput value={newPrice["Phụ"]} onChange={v => setNewPrice(p => ({ ...p, "Phụ": v }))} className={editCls} /></td>
          <td className="px-2 py-1"><NumInput value={newPrice["Giúp việc"]} onChange={v => setNewPrice(p => ({ ...p, "Giúp việc": v }))} className={editCls} /></td>
        </>
      ) : (
        <>
          <td className="px-2 py-1"><NumInput value={newTime.min} onChange={v => setNewTime(p => ({ ...p, min: v }))} className={editCls} /></td>
          <td className="px-2 py-1"><NumInput value={newTime.max} onChange={v => setNewTime(p => ({ ...p, max: v }))} className={editCls} /></td>
        </>
      )}

      <td className="px-1 py-1"><input type="date" value={newFrom} onChange={e => setNewFrom(e.target.value)} className={dateCls} /></td>
      <td className="px-1 py-1 text-center text-xs text-gray-400">—</td>
      <td className="px-1 py-1 text-center">
        <div className="flex gap-0.5 justify-center">
          <button onClick={() => saveNewRow(loai)} disabled={saving} className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
          <button onClick={cancelAdd} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      </td>
    </tr>
  );

  // ─── Tab: Định mức bàn mổ ─────────────────────────────────────────────
  const renderTableNormsTab = () => {
    const getPositionLimit = (posKey: string, groupKey: string): number => {
      const limits = config.staffLimits as any;
      if (limits[posKey] !== undefined) return limits[posKey];
      return limits[groupKey] ?? 1;
    };
    const updatePositionLimit = (posKey: string, val: number) => {
      updateConfig({ staffLimits: { ...config.staffLimits, [posKey]: val } as any });
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
                    onChange={e => updatePositionLimit(pos.key, Number(e.target.value))}
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

  const totalRows = flatRows.length;

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

      {/* Header info + actions */}
      {(subTab === 'allowance' || subTab === 'time-norms') && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {totalRows} dòng · Mỗi dòng là 1 item độc lập với hiệu lực riêng
          </span>
          <button onClick={() => exportLaborConfigsExcel(laborConfigs)} disabled={laborConfigs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Xuất Excel
          </button>
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
