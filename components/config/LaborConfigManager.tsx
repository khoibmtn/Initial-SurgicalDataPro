/**
 * LaborConfigManager — Flat Timeline Management for:
 * 1. Phụ cấp PTTT (labor_allowance_items)
 * 2. Định mức thời gian (labor_time_items)
 * 3. Định mức bàn mổ (labor_table_items)
 * 
 * Each row is an independent item with its own ID and date validity range.
 * Fully supports:
 * - Direct inline editing (including effective dates)
 * - Safe custom delete modal with auto-reopening of predecessor active items
 * - New milestone addition (+) with auto-closing of predecessor
 * - Expandable history of expired rows
 * - Full Excel export for all 3 tabs
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Trash2, X, Download,
  CheckCircle2, AlertTriangle, Pencil, Check,
  DollarSign, Timer, Users, ChevronDown, ChevronRight,
  RotateCcw, Calendar, ShieldAlert
} from 'lucide-react';
import {
  LaborAllowanceItem,
  LaborTimeItem,
  LaborTableItem,
  LaborConfigVersion,
  RolePrice,
  TimeRule,
} from '../../types';
import {
  subscribeToAllowanceItems,
  subscribeToTimeItems,
  subscribeToTableItems,
  addAllowanceItem,
  updateAllowanceItem,
  deleteAllowanceItem,
  addTimeItem,
  updateTimeItem,
  deleteTimeItem,
  addTableItem,
  updateTableItem,
  deleteTableItem,
  exportLaborConfigsExcel,
  ensureFlatLaborItems,
  STAFF_POSITIONS,
  ALL_PTTT_TYPES,
  DEFAULT_PRICE_CONFIG,
  DEFAULT_TIME_RULES,
} from '../../services/laborConfigService';

type NormsSubTab = 'allowance' | 'time-norms' | 'table-norms';

interface Props {
  laborConfigs?: LaborConfigVersion[];
}

const SURGERY_TYPES = ["PĐB", "P1", "P2", "P3"];
const PROCEDURE_TYPES = ["TĐB", "T1", "T2", "T3", "TKPL"];

const LOAI_LABELS: Record<string, string> = {
  "PĐB": "Đặc biệt", "P1": "Loại 1", "P2": "Loại 2", "P3": "Loại 3",
  "TĐB": "Đặc biệt", "T1": "Loại 1", "T2": "Loại 2", "T3": "Loại 3", "TKPL": "Không phân loại",
};

const GROUP_LABELS: Record<string, string> = {
  "PĐB": "Phẫu thuật", "P1": "Phẫu thuật", "P2": "Phẫu thuật", "P3": "Phẫu thuật",
  "TĐB": "Thủ thuật", "T1": "Thủ thuật", "T2": "Thủ thuật", "T3": "Thủ thuật", "TKPL": "Thủ thuật",
};

const TABLE_LIMIT_LABELS: Record<number, string> = {
  0: 'Không kiểm tra trùng giờ',
  1: 'Tối đa 1 bàn mổ (1 ca)',
  2: 'Tối đa 2 bàn mổ (2 ca)',
};

const fmtMoney = (n: number) => n > 0 ? n.toLocaleString('vi-VN') : '0';

// Inline editable number component
const NumInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  className?: string;
}> = ({ value, onChange, className = "" }) => {
  const safeVal = value ?? 0;
  const [local, setLocal] = React.useState(safeVal.toString());
  React.useEffect(() => { setLocal((value ?? 0).toString()); }, [value]);
  return (
    <input
      type="text"
      value={local === '' ? '' : Number(local).toLocaleString('en-US')}
      onChange={(e) => {
        const v = e.target.value.replace(/,/g, '');
        if (/^\d*$/.test(v)) { onChange(Number(v)); setLocal(v); }
      }}
      onBlur={() => setLocal((value ?? 0).toString())}
      className={className}
    />
  );
};

export const LaborConfigManager: React.FC<Props> = () => {
  const [subTab, setSubTab] = useState<NormsSubTab>('allowance');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Realtime datasets
  const [allowanceItems, setAllowanceItems] = useState<LaborAllowanceItem[]>([]);
  const [timeItems, setTimeItems] = useState<LaborTimeItem[]>([]);
  const [tableItems, setTableItems] = useState<LaborTableItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to flat items
  useEffect(() => {
    ensureFlatLaborItems().catch(console.error);

    const unsubAllow = subscribeToAllowanceItems(items => {
      setAllowanceItems(items);
      setLoading(false);
    });
    const unsubTime = subscribeToTimeItems(items => {
      setTimeItems(items);
    });
    const unsubTable = subscribeToTableItems(items => {
      setTableItems(items);
    });

    return () => {
      unsubAllow();
      unsubTime();
      unsubTable();
    };
  }, []);

  // UI States
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Inline Edit State ───────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'allowance' | 'time' | 'table' | null>(null);

  // Allowance edit fields
  const [editChinh, setEditChinh] = useState(0);
  const [editPhu, setEditPhu] = useState(0);
  const [editGiupViec, setEditGiupViec] = useState(0);

  // Time edit fields
  const [editMin, setEditMin] = useState(0);
  const [editMax, setEditMax] = useState(0);

  // Table edit fields
  const [editLimit, setEditLimit] = useState(1);

  // Shared date fields
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');

  // ─── Add Milestone Modal State ──────────────────────────────────────────
  const [addModal, setAddModal] = useState<{
    type: 'allowance' | 'time' | 'table';
    key: string; // loai or posKey
    label: string;
    groupLabel?: string;
  } | null>(null);

  const [newChinh, setNewChinh] = useState(0);
  const [newPhu, setNewPhu] = useState(0);
  const [newGiupViec, setNewGiupViec] = useState(0);
  const [newMin, setNewMin] = useState(0);
  const [newMax, setNewMax] = useState(0);
  const [newLimit, setNewLimit] = useState(1);
  const [newEffectiveFrom, setNewEffectiveFrom] = useState('');

  // ─── Safe Custom Delete Dialog State ─────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'allowance' | 'time' | 'table';
    id: string;
    title: string;
    subtitle: string;
    isActive: boolean;
  } | null>(null);

  // Toggle expand/collapse
  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ─── Start Inline Edit ───────────────────────────────────────────────────
  const startEditAllowance = (item: LaborAllowanceItem) => {
    setEditingId(item.id);
    setEditingType('allowance');
    setEditChinh(item.chinh);
    setEditPhu(item.phu);
    setEditGiupViec(item.giupViec);
    setEditFrom(item.effectiveFrom);
    setEditTo(item.effectiveTo || '');
  };

  const startEditTime = (item: LaborTimeItem) => {
    setEditingId(item.id);
    setEditingType('time');
    setEditMin(item.min);
    setEditMax(item.max);
    setEditFrom(item.effectiveFrom);
    setEditTo(item.effectiveTo || '');
  };

  const startEditTable = (item: LaborTableItem) => {
    setEditingId(item.id);
    setEditingType('table');
    setEditLimit(item.limit);
    setEditFrom(item.effectiveFrom);
    setEditTo(item.effectiveTo || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingType(null);
  };

  // ─── Save Inline Edit ────────────────────────────────────────────────────
  const saveInlineEdit = async () => {
    if (!editingId || !editingType) return;
    if (!editFrom) {
      showToast('Vui lòng nhập ngày hiệu lực từ', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingType === 'allowance') {
        await updateAllowanceItem(editingId, {
          chinh: Number(editChinh) || 0,
          phu: Number(editPhu) || 0,
          giupViec: Number(editGiupViec) || 0,
          effectiveFrom: editFrom,
          effectiveTo: editTo ? editTo : null,
        });
      } else if (editingType === 'time') {
        await updateTimeItem(editingId, {
          min: Number(editMin) || 0,
          max: Number(editMax) || 0,
          effectiveFrom: editFrom,
          effectiveTo: editTo ? editTo : null,
        });
      } else if (editingType === 'table') {
        await updateTableItem(editingId, {
          limit: Number(editLimit) ?? 1,
          effectiveFrom: editFrom,
          effectiveTo: editTo ? editTo : null,
        });
      }
      setEditingId(null);
      setEditingType(null);
      showToast('Đã lưu thay đổi thành công!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi lưu dữ liệu', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Open Add Milestone ──────────────────────────────────────────────────
  const openAddAllowance = (loai: string, currentItem?: LaborAllowanceItem) => {
    setAddModal({
      type: 'allowance',
      key: loai,
      label: LOAI_LABELS[loai] || loai,
      groupLabel: GROUP_LABELS[loai] || '',
    });
    setNewChinh(currentItem ? currentItem.chinh : DEFAULT_PRICE_CONFIG[loai]?.["Chính"] || 0);
    setNewPhu(currentItem ? currentItem.phu : DEFAULT_PRICE_CONFIG[loai]?.["Phụ"] || 0);
    setNewGiupViec(currentItem ? currentItem.giupViec : DEFAULT_PRICE_CONFIG[loai]?.["Giúp việc"] || 0);
    setNewEffectiveFrom(new Date().toISOString().slice(0, 10));
  };

  const openAddTime = (loai: string, currentItem?: LaborTimeItem) => {
    setAddModal({
      type: 'time',
      key: loai,
      label: LOAI_LABELS[loai] || loai,
      groupLabel: GROUP_LABELS[loai] || '',
    });
    setNewMin(currentItem ? currentItem.min : DEFAULT_TIME_RULES[loai]?.min || 0);
    setNewMax(currentItem ? currentItem.max : DEFAULT_TIME_RULES[loai]?.max || 0);
    setNewEffectiveFrom(new Date().toISOString().slice(0, 10));
  };

  const openAddTable = (posKey: string, label: string, currentItem?: LaborTableItem) => {
    setAddModal({
      type: 'table',
      key: posKey,
      label,
    });
    setNewLimit(currentItem ? currentItem.limit : 1);
    setNewEffectiveFrom(new Date().toISOString().slice(0, 10));
  };

  const saveAddMilestone = async () => {
    if (!addModal || !newEffectiveFrom) {
      showToast('Vui lòng nhập ngày hiệu lực từ', 'error');
      return;
    }
    setSaving(true);
    try {
      if (addModal.type === 'allowance') {
        await addAllowanceItem(
          addModal.key,
          newChinh,
          newPhu,
          newGiupViec,
          newEffectiveFrom,
          allowanceItems
        );
      } else if (addModal.type === 'time') {
        await addTimeItem(
          addModal.key,
          newMin,
          newMax,
          newEffectiveFrom,
          timeItems
        );
      } else if (addModal.type === 'table') {
        await addTableItem(
          addModal.key,
          addModal.label,
          newLimit,
          newEffectiveFrom,
          tableItems
        );
      }
      setAddModal(null);
      showToast('Đã thêm mốc hiệu lực mới!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thêm mốc', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Execute Safe Delete ─────────────────────────────────────────────────
  const executeDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      if (confirmDelete.type === 'allowance') {
        await deleteAllowanceItem(confirmDelete.id, allowanceItems);
      } else if (confirmDelete.type === 'time') {
        await deleteTimeItem(confirmDelete.id, timeItems);
      } else if (confirmDelete.type === 'table') {
        await deleteTableItem(confirmDelete.id, tableItems);
      }
      setConfirmDelete(null);
      showToast('Đã xóa thành công!');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xóa', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Common input styles
  const editNumCls = "w-full px-2 py-1 text-right text-xs font-mono font-medium border border-teal-500 rounded bg-teal-50/40 outline-none focus:ring-1 focus:ring-teal-500";
  const editDateCls = "w-full px-2 py-1 text-center text-xs border border-teal-500 rounded bg-teal-50/40 outline-none focus:ring-1 focus:ring-teal-500";
  const editSelectCls = "w-full px-2 py-1 text-xs border border-teal-500 rounded bg-teal-50/40 outline-none focus:ring-1 focus:ring-teal-500 text-gray-800 font-medium";

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 1: PHỤ CẤP PTTT
  // ─────────────────────────────────────────────────────────────────────────
  const renderAllowanceTab = () => {
    let currentGroup = '';

    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '32px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '115px' }} />
            <col style={{ width: '115px' }} />
            <col style={{ width: '115px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80 text-gray-600 text-xs font-semibold uppercase tracking-wider border-b border-gray-200">
              <th className="py-2.5 px-2 text-center"></th>
              <th className="py-2.5 px-3 text-left">Nhóm</th>
              <th className="py-2.5 px-3 text-left">Loại PTTT</th>
              <th className="py-2.5 px-3 text-right">Chính (₫)</th>
              <th className="py-2.5 px-3 text-right">Phụ (₫)</th>
              <th className="py-2.5 px-3 text-right">Giúp việc (₫)</th>
              <th className="py-2.5 px-2 text-center">Hiệu lực từ</th>
              <th className="py-2.5 px-2 text-center">Hiệu lực đến</th>
              <th className="py-2.5 px-2 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ALL_PTTT_TYPES.map(loai => {
              const group = GROUP_LABELS[loai] || '';
              const showGroupHeader = group !== currentGroup;
              if (showGroupHeader) currentGroup = group;

              // Items for this loai
              const itemsForLoai = allowanceItems.filter(i => i.loai === loai);
              // Active item is the one with effectiveTo === null (or latest)
              const activeItem = itemsForLoai.find(i => i.effectiveTo === null) || itemsForLoai[0];
              const expiredItems = itemsForLoai.filter(i => activeItem && i.id !== activeItem.id);
              const isExpanded = expandedKeys.has(loai);
              const hasHistory = expiredItems.length > 0;

              return (
                <React.Fragment key={loai}>
                  {showGroupHeader && (
                    <tr className="bg-slate-50/90 border-t border-b border-slate-200">
                      <td colSpan={9} className="py-2 px-3 text-xs font-bold text-slate-700 tracking-wider">
                        <span className="inline-block w-2 h-2 rounded-full bg-teal-600 mr-2"></span>
                        {group.toUpperCase()}
                      </td>
                    </tr>
                  )}

                  {/* Main Active Row */}
                  {activeItem ? (
                    (() => {
                      const isEditing = editingId === activeItem.id && editingType === 'allowance';
                      return (
                        <tr className={`transition-colors ${isEditing ? 'bg-teal-50/30' : 'hover:bg-slate-50/60'}`}>
                          {/* Expand chevron */}
                          <td className="py-2.5 px-2 text-center">
                            {hasHistory && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(loai)}
                                className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
                                title={isExpanded ? "Thu gọn lịch sử" : `Xem ${expiredItems.length} mốc cũ`}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-teal-600" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-gray-500 text-xs">{group}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900">{LOAI_LABELS[loai] || loai}</td>

                          {/* Chính */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <NumInput value={editChinh} onChange={setEditChinh} className={editNumCls} />
                            ) : (
                              <span className="font-mono text-gray-900 font-semibold">{fmtMoney(activeItem.chinh)}</span>
                            )}
                          </td>

                          {/* Phụ */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <NumInput value={editPhu} onChange={setEditPhu} className={editNumCls} />
                            ) : (
                              <span className="font-mono text-gray-700 font-medium">{fmtMoney(activeItem.phu)}</span>
                            )}
                          </td>

                          {/* Giúp việc */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <NumInput value={editGiupViec} onChange={setEditGiupViec} className={editNumCls} />
                            ) : (
                              <span className="font-mono text-gray-700 font-medium">{fmtMoney(activeItem.giupViec)}</span>
                            )}
                          </td>

                          {/* Hiệu lực từ */}
                          <td className="py-2.5 px-2 text-center text-xs">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editFrom}
                                onChange={e => setEditFrom(e.target.value)}
                                className={editDateCls}
                              />
                            ) : (
                              <span className="font-mono text-gray-600">{activeItem.effectiveFrom}</span>
                            )}
                          </td>

                          {/* Hiệu lực đến */}
                          <td className="py-2.5 px-2 text-center text-xs">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editTo}
                                onChange={e => setEditTo(e.target.value)}
                                placeholder="Để trống nếu áp dụng"
                                className={editDateCls}
                              />
                            ) : (
                              <span className="text-emerald-600 font-medium">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={saveInlineEdit}
                                  disabled={saving}
                                  className="p-1 rounded text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs"
                                  title="Lưu"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="p-1 rounded text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                                  title="Hủy"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => startEditAllowance(activeItem)}
                                  className="p-1 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                  title="Sửa dòng này"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAddAllowance(loai, activeItem)}
                                  className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="Thêm mốc hiệu lực mới"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete({
                                    type: 'allowance',
                                    id: activeItem.id,
                                    title: `Xóa phụ cấp "${LOAI_LABELS[loai] || loai}"`,
                                    subtitle: `Hiệu lực từ ${activeItem.effectiveFrom}${activeItem.effectiveTo ? ' đến ' + activeItem.effectiveTo : ' (Hiện tại)'}`,
                                    isActive: activeItem.effectiveTo === null,
                                  })}
                                  className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Xóa dòng này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })()
                  ) : (
                    /* Fallback if no active item */
                    <tr className="hover:bg-slate-50/60">
                      <td></td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs">{group}</td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{LOAI_LABELS[loai] || loai}</td>
                      <td colSpan={5} className="py-2.5 px-3 text-center text-xs text-gray-400 italic">Chưa có dữ liệu</td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => openAddAllowance(loai)}
                          className="px-2 py-0.5 text-xs rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                        >
                          Thêm
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* Sub-rows: Expired history */}
                  {isExpanded && expiredItems.map(item => {
                    const isEditing = editingId === item.id && editingType === 'allowance';
                    return (
                      <tr key={item.id} className={`bg-gray-50/50 transition-colors ${isEditing ? 'bg-teal-50/30' : 'hover:bg-gray-100/60'}`}>
                        <td></td>
                        <td></td>
                        <td className="py-2 px-3 text-xs text-gray-500 pl-6 flex items-center gap-1.5">
                          <span className="text-gray-400">↳</span>
                          <span>{LOAI_LABELS[loai] || loai}</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <NumInput value={editChinh} onChange={setEditChinh} className={editNumCls} />
                          ) : (
                            <span className="font-mono text-xs text-gray-500">{fmtMoney(item.chinh)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <NumInput value={editPhu} onChange={setEditPhu} className={editNumCls} />
                          ) : (
                            <span className="font-mono text-xs text-gray-500">{fmtMoney(item.phu)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <NumInput value={editGiupViec} onChange={setEditGiupViec} className={editNumCls} />
                          ) : (
                            <span className="font-mono text-xs text-gray-500">{fmtMoney(item.giupViec)}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editFrom}
                              onChange={e => setEditFrom(e.target.value)}
                              className={editDateCls}
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-400">{item.effectiveFrom}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editTo}
                              onChange={e => setEditTo(e.target.value)}
                              className={editDateCls}
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-400">{item.effectiveTo}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={saveInlineEdit}
                                disabled={saving}
                                className="p-1 rounded text-white bg-teal-600 hover:bg-teal-700 transition-colors shadow-xs"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-1 rounded text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => startEditAllowance(item)}
                                className="p-1 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                title="Sửa dòng lịch sử"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete({
                                  type: 'allowance',
                                  id: item.id,
                                  title: `Xóa mốc cũ "${LOAI_LABELS[loai] || loai}"`,
                                  subtitle: `Từ ${item.effectiveFrom} đến ${item.effectiveTo}`,
                                  isActive: false,
                                })}
                                className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Xóa mốc lịch sử này"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 2: ĐỊNH MỨC THỜI GIAN
  // ─────────────────────────────────────────────────────────────────────────
  const renderTimeTab = () => {
    let currentGroup = '';

    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '32px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80 text-gray-600 text-xs font-semibold uppercase tracking-wider border-b border-gray-200">
              <th className="py-2.5 px-2 text-center"></th>
              <th className="py-2.5 px-3 text-left">Nhóm</th>
              <th className="py-2.5 px-3 text-left">Loại PTTT</th>
              <th className="py-2.5 px-3 text-right">Tối thiểu (phút)</th>
              <th className="py-2.5 px-3 text-right">Tối đa (phút)</th>
              <th className="py-2.5 px-2 text-center">Hiệu lực từ</th>
              <th className="py-2.5 px-2 text-center">Hiệu lực đến</th>
              <th className="py-2.5 px-2 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ALL_PTTT_TYPES.map(loai => {
              const group = GROUP_LABELS[loai] || '';
              const showGroupHeader = group !== currentGroup;
              if (showGroupHeader) currentGroup = group;

              const itemsForLoai = timeItems.filter(i => i.loai === loai);
              const activeItem = itemsForLoai.find(i => i.effectiveTo === null) || itemsForLoai[0];
              const expiredItems = itemsForLoai.filter(i => activeItem && i.id !== activeItem.id);
              const isExpanded = expandedKeys.has(`time_${loai}`);
              const hasHistory = expiredItems.length > 0;

              return (
                <React.Fragment key={loai}>
                  {showGroupHeader && (
                    <tr className="bg-slate-50/90 border-t border-b border-slate-200">
                      <td colSpan={8} className="py-2 px-3 text-xs font-bold text-slate-700 tracking-wider">
                        <span className="inline-block w-2 h-2 rounded-full bg-cyan-600 mr-2"></span>
                        {group.toUpperCase()}
                      </td>
                    </tr>
                  )}

                  {/* Active Row */}
                  {activeItem && (
                    (() => {
                      const isEditing = editingId === activeItem.id && editingType === 'time';
                      return (
                        <tr className={`transition-colors ${isEditing ? 'bg-cyan-50/30' : 'hover:bg-slate-50/60'}`}>
                          <td className="py-2.5 px-2 text-center">
                            {hasHistory && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(`time_${loai}`)}
                                className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-cyan-600" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-gray-500 text-xs">{group}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900">{LOAI_LABELS[loai] || loai}</td>

                          {/* Tối thiểu */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <NumInput value={editMin} onChange={setEditMin} className={editNumCls} />
                            ) : (
                              <span className="font-mono text-gray-900 font-semibold">{activeItem.min}</span>
                            )}
                          </td>

                          {/* Tối đa */}
                          <td className="py-2.5 px-3 text-right">
                            {isEditing ? (
                              <NumInput value={editMax} onChange={setEditMax} className={editNumCls} />
                            ) : (
                              <span className="font-mono text-gray-900 font-semibold">{activeItem.max}</span>
                            )}
                          </td>

                          {/* Hiệu lực từ */}
                          <td className="py-2.5 px-2 text-center text-xs">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editFrom}
                                onChange={e => setEditFrom(e.target.value)}
                                className={editDateCls}
                              />
                            ) : (
                              <span className="font-mono text-gray-600">{activeItem.effectiveFrom}</span>
                            )}
                          </td>

                          {/* Hiệu lực đến */}
                          <td className="py-2.5 px-2 text-center text-xs">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editTo}
                                onChange={e => setEditTo(e.target.value)}
                                placeholder="Để trống nếu áp dụng"
                                className={editDateCls}
                              />
                            ) : (
                              <span className="text-emerald-600 font-medium">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={saveInlineEdit}
                                  disabled={saving}
                                  className="p-1 rounded text-white bg-cyan-600 hover:bg-cyan-700 transition-colors shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="p-1 rounded text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => startEditTime(activeItem)}
                                  className="p-1 rounded text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                                  title="Sửa"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAddTime(loai, activeItem)}
                                  className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="Thêm mốc mới"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete({
                                    type: 'time',
                                    id: activeItem.id,
                                    title: `Xóa định mức thời gian "${LOAI_LABELS[loai] || loai}"`,
                                    subtitle: `Hiệu lực từ ${activeItem.effectiveFrom}${activeItem.effectiveTo ? ' đến ' + activeItem.effectiveTo : ' (Hiện tại)'}`,
                                    isActive: activeItem.effectiveTo === null,
                                  })}
                                  className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Xóa dòng"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })()
                  )}

                  {/* Expired sub-rows */}
                  {isExpanded && expiredItems.map(item => {
                    const isEditing = editingId === item.id && editingType === 'time';
                    return (
                      <tr key={item.id} className={`bg-gray-50/50 transition-colors ${isEditing ? 'bg-cyan-50/30' : 'hover:bg-gray-100/60'}`}>
                        <td></td>
                        <td></td>
                        <td className="py-2 px-3 text-xs text-gray-500 pl-6 flex items-center gap-1.5">
                          <span className="text-gray-400">↳</span>
                          <span>{LOAI_LABELS[loai] || loai}</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <NumInput value={editMin} onChange={setEditMin} className={editNumCls} />
                          ) : (
                            <span className="font-mono text-xs text-gray-500">{item.min}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isEditing ? (
                            <NumInput value={editMax} onChange={setEditMax} className={editNumCls} />
                          ) : (
                            <span className="font-mono text-xs text-gray-500">{item.max}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editFrom}
                              onChange={e => setEditFrom(e.target.value)}
                              className={editDateCls}
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-400">{item.effectiveFrom}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editTo}
                              onChange={e => setEditTo(e.target.value)}
                              className={editDateCls}
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-400">{item.effectiveTo}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={saveInlineEdit}
                                disabled={saving}
                                className="p-1 rounded text-white bg-cyan-600 hover:bg-cyan-700 transition-colors shadow-xs"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-1 rounded text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => startEditTime(item)}
                                className="p-1 rounded text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete({
                                  type: 'time',
                                  id: item.id,
                                  title: `Xóa mốc cũ "${LOAI_LABELS[loai] || loai}"`,
                                  subtitle: `Từ ${item.effectiveFrom} đến ${item.effectiveTo}`,
                                  isActive: false,
                                })}
                                className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 3: ĐỊNH MỨC BÀN MỔ (Flat Timeline per position)
  // ─────────────────────────────────────────────────────────────────────────
  const renderTableNormsTab = () => {
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs bg-white">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '32px' }} />
            <col style={{ width: '50px' }} />
            <col style={{ width: '220px' }} />
            <col style={{ width: '280px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50/80 text-gray-600 text-xs font-semibold uppercase tracking-wider border-b border-gray-200">
              <th className="py-2.5 px-2 text-center"></th>
              <th className="py-2.5 px-2 text-center">#</th>
              <th className="py-2.5 px-3 text-left">Vị trí (Đối tượng)</th>
              <th className="py-2.5 px-3 text-left">Định mức bàn mổ</th>
              <th className="py-2.5 px-2 text-center">Hiệu lực từ</th>
              <th className="py-2.5 px-2 text-center">Hiệu lực đến</th>
              <th className="py-2.5 px-2 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {STAFF_POSITIONS.map((pos, idx) => {
              const itemsForPos = tableItems.filter(i => i.posKey === pos.key);
              const activeItem = itemsForPos.find(i => i.effectiveTo === null) || itemsForPos[0];
              const expiredItems = itemsForPos.filter(i => activeItem && i.id !== activeItem.id);
              const isExpanded = expandedKeys.has(`table_${pos.key}`);
              const hasHistory = expiredItems.length > 0;

              return (
                <React.Fragment key={pos.key}>
                  {/* Active Row */}
                  {activeItem ? (
                    (() => {
                      const isEditing = editingId === activeItem.id && editingType === 'table';
                      return (
                        <tr className={`transition-colors ${isEditing ? 'bg-indigo-50/30' : 'hover:bg-slate-50/60'}`}>
                          {/* Chevron */}
                          <td className="py-2.5 px-2 text-center">
                            {hasHistory && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(`table_${pos.key}`)}
                                className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
                                title={isExpanded ? "Thu gọn lịch sử" : `Xem ${expiredItems.length} mốc cũ`}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-indigo-600" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center text-xs text-gray-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900">{pos.label}</td>

                          {/* Định mức bàn mổ (Dropdown in edit mode) */}
                          <td className="py-2.5 px-3">
                            {isEditing ? (
                              <select
                                value={editLimit}
                                onChange={e => setEditLimit(Number(e.target.value))}
                                className={editSelectCls}
                              >
                                <option value={1}>Tối đa 1 bàn mổ (1 ca)</option>
                                <option value={2}>Tối đa 2 bàn mổ (2 ca)</option>
                                <option value={0}>Không kiểm tra trùng giờ</option>
                              </select>
                            ) : (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                activeItem.limit === 1
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : activeItem.limit === 2
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}>
                                {TABLE_LIMIT_LABELS[activeItem.limit] || `Tối đa ${activeItem.limit} bàn`}
                              </span>
                            )}
                          </td>

                          {/* Hiệu lực từ */}
                          <td className="py-2.5 px-2 text-center text-xs">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editFrom}
                                onChange={e => setEditFrom(e.target.value)}
                                className={editDateCls}
                              />
                            ) : (
                              <span className="font-mono text-gray-600">{activeItem.effectiveFrom}</span>
                            )}
                          </td>

                          {/* Hiệu lực đến */}
                          <td className="py-2.5 px-2 text-center text-xs">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editTo}
                                onChange={e => setEditTo(e.target.value)}
                                placeholder="Để trống nếu áp dụng"
                                className={editDateCls}
                              />
                            ) : (
                              <span className="text-emerald-600 font-medium">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={saveInlineEdit}
                                  disabled={saving}
                                  className="p-1 rounded text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs"
                                  title="Lưu"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="p-1 rounded text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                                  title="Hủy"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => startEditTable(activeItem)}
                                  className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                  title="Sửa định mức"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAddTable(pos.key, pos.label, activeItem)}
                                  className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="Thêm mốc hiệu lực mới"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete({
                                    type: 'table',
                                    id: activeItem.id,
                                    title: `Xóa định mức bàn mổ "${pos.label}"`,
                                    subtitle: `Hiệu lực từ ${activeItem.effectiveFrom}${activeItem.effectiveTo ? ' đến ' + activeItem.effectiveTo : ' (Hiện tại)'}`,
                                    isActive: activeItem.effectiveTo === null,
                                  })}
                                  className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Xóa dòng"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })()
                  ) : (
                    /* Fallback if no item */
                    <tr className="hover:bg-slate-50/60">
                      <td></td>
                      <td className="py-2.5 px-2 text-center text-xs text-gray-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{pos.label}</td>
                      <td colSpan={3} className="py-2.5 px-3 text-center text-xs text-gray-400 italic">Chưa có dữ liệu</td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => openAddTable(pos.key, pos.label)}
                          className="px-2 py-0.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                        >
                          Thêm
                        </button>
                      </td>
                    </tr>
                  )}

                  {/* Sub-rows: Expired history */}
                  {isExpanded && expiredItems.map(item => {
                    const isEditing = editingId === item.id && editingType === 'table';
                    return (
                      <tr key={item.id} className={`bg-gray-50/50 transition-colors ${isEditing ? 'bg-indigo-50/30' : 'hover:bg-gray-100/60'}`}>
                        <td></td>
                        <td></td>
                        <td className="py-2 px-3 text-xs text-gray-500 pl-6 flex items-center gap-1.5">
                          <span className="text-gray-400">↳</span>
                          <span>{pos.label}</span>
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <select
                              value={editLimit}
                              onChange={e => setEditLimit(Number(e.target.value))}
                              className={editSelectCls}
                            >
                              <option value={1}>Tối đa 1 bàn mổ (1 ca)</option>
                              <option value={2}>Tối đa 2 bàn mổ (2 ca)</option>
                              <option value={0}>Không kiểm tra trùng giờ</option>
                            </select>
                          ) : (
                            <span className="text-xs text-gray-500 font-medium">
                              {TABLE_LIMIT_LABELS[item.limit] || `Tối đa ${item.limit} bàn`}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editFrom}
                              onChange={e => setEditFrom(e.target.value)}
                              className={editDateCls}
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-400">{item.effectiveFrom}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editTo}
                              onChange={e => setEditTo(e.target.value)}
                              className={editDateCls}
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-400">{item.effectiveTo}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={saveInlineEdit}
                                disabled={saving}
                                className="p-1 rounded text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-1 rounded text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => startEditTable(item)}
                                className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete({
                                  type: 'table',
                                  id: item.id,
                                  title: `Xóa mốc cũ "${pos.label}"`,
                                  subtitle: `Từ ${item.effectiveFrom} đến ${item.effectiveTo}`,
                                  isActive: false,
                                })}
                                className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium transition-all transform animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-teal-50 border-teal-200 text-teal-800'
        }`}>
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Sub-tab Pills Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('allowance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              subTab === 'allowance'
                ? 'bg-white text-gray-900 shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-teal-600" />
            <span>Phụ cấp PTTT</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('time-norms')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              subTab === 'time-norms'
                ? 'bg-white text-gray-900 shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Timer className="w-3.5 h-3.5 text-cyan-600" />
            <span>Định mức thời gian</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('table-norms')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              subTab === 'table-norms'
                ? 'bg-white text-gray-900 shadow-xs font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>Định mức bàn mổ</span>
          </button>
        </div>

        {/* Export Excel Button */}
        <button
          type="button"
          onClick={() => exportLaborConfigsExcel(allowanceItems, timeItems, tableItems)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs"
        >
          <Download className="w-3.5 h-3.5 text-gray-500" />
          <span>Xuất Excel</span>
        </button>
      </div>

      {/* Helper text */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>
          Mỗi dòng là một đối tượng độc lập có lịch sử hiệu lực riêng. Dòng trên cùng là mốc đang áp dụng.
        </span>
        <span className="font-mono text-gray-400">
          {subTab === 'allowance' && `${allowanceItems.length} bản ghi phụ cấp`}
          {subTab === 'time-norms' && `${timeItems.length} bản ghi thời gian`}
          {subTab === 'table-norms' && `${tableItems.length} bản ghi bàn mổ`}
        </span>
      </div>

      {/* Main Tab Content */}
      {subTab === 'allowance' && renderAllowanceTab()}
      {subTab === 'time-norms' && renderTimeTab()}
      {subTab === 'table-norms' && renderTableNormsTab()}

      {/* ─── MODAL THÊM MỐC HIỆU LỰC MỚI (+) ─── */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Thêm mốc hiệu lực mới
                  </h3>
                  <p className="text-xs text-gray-500">
                    {addModal.groupLabel ? `${addModal.groupLabel} — ` : ''}{addModal.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddModal(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Effective Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ngày bắt đầu hiệu lực (*)
                </label>
                <input
                  type="date"
                  value={newEffectiveFrom}
                  onChange={e => setNewEffectiveFrom(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Mốc đang áp dụng hiện tại sẽ tự động kết thúc vào ngày trước đó.
                </p>
              </div>

              {/* Allowance Fields */}
              {addModal.type === 'allowance' && (
                <div className="space-y-3 pt-1 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phụ cấp Chính (₫)</label>
                    <NumInput
                      value={newChinh}
                      onChange={setNewChinh}
                      className="w-full px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phụ cấp Phụ (₫)</label>
                    <NumInput
                      value={newPhu}
                      onChange={setNewPhu}
                      className="w-full px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phụ cấp Giúp việc (₫)</label>
                    <NumInput
                      value={newGiupViec}
                      onChange={setNewGiupViec}
                      className="w-full px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Time Fields */}
              {addModal.type === 'time' && (
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tối thiểu (phút)</label>
                    <NumInput
                      value={newMin}
                      onChange={setNewMin}
                      className="w-full px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tối đa (phút)</label>
                    <NumInput
                      value={newMax}
                      onChange={setNewMax}
                      className="w-full px-3 py-1.5 text-sm font-mono border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Table Fields */}
              {addModal.type === 'table' && (
                <div className="pt-1 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Định mức bàn mổ</label>
                  <select
                    value={newLimit}
                    onChange={e => setNewLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                  >
                    <option value={1}>Tối đa 1 bàn mổ (1 ca)</option>
                    <option value={2}>Tối đa 2 bàn mổ (2 ca)</option>
                    <option value={0}>Không kiểm tra trùng giờ</option>
                  </select>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModal(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={saveAddMilestone}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
              >
                {saving ? 'Đang lưu...' : 'Lưu mốc mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL XÁC NHẬN XÓA AN TOÀN (Custom Dialog) ─── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden transform transition-all animate-in zoom-in-95 duration-150">
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">
                Xác nhận xóa dòng này?
              </h3>
              <p className="text-sm font-semibold text-gray-700 mb-1">
                {confirmDelete.title}
              </p>
              <p className="text-xs text-gray-500 mb-4 font-mono">
                {confirmDelete.subtitle}
              </p>

              {confirmDelete.isActive && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4 text-left leading-relaxed">
                  <span className="font-semibold">Lưu ý:</span> Đây là mốc đang có hiệu lực. Sau khi xóa, hệ thống sẽ tự động kích hoạt lại mốc hiệu lực liền trước (nếu có).
                </div>
              )}

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={executeDelete}
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
                >
                  {saving ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
