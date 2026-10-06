import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Calendar,
  Lock,
  Edit3,
  Trash2,
  Check,
  AlertTriangle,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react';
import { PaymentList } from '../../types/paymentList';
import { renameList, deletePaymentList } from '../../services/paymentListService';
import { subscribeToAllUsers } from '../../services/userManagementService';
import type { AppUser } from '../../types/auth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lists: PaymentList[];
  currentListId?: string;
  onSelectList?: (listId: string) => void;
  reportYears?: number[];
  userName: string;
}

function formatDateTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const PaymentListManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  lists,
  currentListId,
  onSelectList,
  reportYears = [],
  userName,
}) => {
  // Subscribe to all users to map emails/UIDs to display names
  const [users, setUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToAllUsers(list => {
      setUsers(list);
    });
    return () => unsub();
  }, [isOpen]);

  // Lookup map: email / uid / nickname -> Display Name
  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      const name = (u.displayName || u.nickname || '').trim();
      if (!name) continue;
      if (u.email) map.set(u.email.toLowerCase().trim(), name);
      if (u.nickname) map.set(u.nickname.toLowerCase().trim(), name);
      if (u.uid) map.set(u.uid, name);
    }
    return map;
  }, [users]);

  // Helper format user name (never show raw email with @domain)
  const formatUserName = (raw?: string): string => {
    if (!raw || !raw.trim()) return '—';
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (userNameMap.has(lower)) {
      return userNameMap.get(lower)!;
    }

    // Nếu là email (chứa @), loại bỏ domain @... để lấy username
    if (trimmed.includes('@')) {
      return trimmed.split('@')[0];
    }

    return trimmed;
  };

  // Collect all available creation years
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const l of lists) {
      const y = l.createdAt
        ? new Date(l.createdAt).getFullYear()
        : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [lists]);

  // Count batches per year
  const yearCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of lists) {
      const y = l.createdAt
        ? new Date(l.createdAt).getFullYear()
        : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
      if (y) map.set(y, (map.get(y) || 0) + 1);
    }
    return map;
  }, [lists]);

  // Year filter combobox state
  const defaultYear = reportYears.length > 0 ? reportYears[0].toString() : 'all';
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const [yearQuery, setYearQuery] = useState('');
  const [isYearOpen, setIsYearOpen] = useState(false);
  const yearComboboxRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');

  // Close year combobox on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearComboboxRef.current && !yearComboboxRef.current.contains(e.target as Node)) {
        setIsYearOpen(false);
        setYearQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter available years in dropdown when typing
  const filteredAvailableYears = useMemo(() => {
    if (!yearQuery.trim()) return availableYears;
    const q = yearQuery.trim().toLowerCase();
    return availableYears.filter(y => y.toString().includes(q));
  }, [availableYears, yearQuery]);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation state
  const [deletingList, setDeletingList] = useState<PaymentList | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered lists by year and search query
  const filteredLists = useMemo(() => {
    let result = [...lists];

    // 1. Lọc theo năm
    // Nếu đang mở dropdown và có gõ tìm năm
    const activeYearStr = isYearOpen && yearQuery.trim() ? yearQuery.trim() : selectedYear;
    if (activeYearStr !== 'all' && activeYearStr.trim()) {
      const parsedYear = parseInt(activeYearStr, 10);
      if (!isNaN(parsedYear) && parsedYear > 1900 && parsedYear < 2200) {
        result = result.filter(l => {
          const listY = l.createdAt
            ? new Date(l.createdAt).getFullYear()
            : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
          return listY === parsedYear;
        });
      }
    }

    // 2. Lọc theo ô tìm kiếm
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(l => {
        const creator = formatUserName(l.createdBy).toLowerCase();
        const updater = formatUserName(l.updatedBy || l.createdBy).toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          creator.includes(q) ||
          updater.includes(q)
        );
      });
    }

    return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [lists, selectedYear, isYearOpen, yearQuery, searchQuery, userNameMap]);

  if (!isOpen) return null;

  const handleStartEdit = (l: PaymentList) => {
    if (l.status === 'locked') return;
    setEditingId(l.id);
    setEditingName(l.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    setIsSavingEdit(true);
    try {
      await renameList(id, editingName.trim(), userName);
      setEditingId(null);
      setEditingName('');
    } catch (err: any) {
      alert(err?.message || 'Không thể đổi tên đợt thanh toán.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingList) return;
    setIsDeleting(true);
    try {
      await deletePaymentList(deletingList.id);
      if (currentListId === deletingList.id) {
        onSelectList?.('all');
      }
      setDeletingList(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa đợt thanh toán.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-inter">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-800 shadow-2xs border border-teal-200">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Danh sách đợt thanh toán gói dịch vụ
              </h2>
              <p className="text-xs text-slate-500">
                Quản lý, chỉnh sửa tên đợt, xem lịch sử tạo và người cập nhật cuối
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar: Bộ lọc năm (Combobox gõ tự do + bung năm) + Tìm kiếm */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
          {/* Lọc năm: Box gõ tự do + bung danh sách năm */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0">
              <Calendar className="h-4 w-4 text-teal-600" />
              <span>Năm tạo đợt:</span>
            </span>

            <div className="relative" ref={yearComboboxRef}>
              <div
                onClick={() => setIsYearOpen(prev => !prev)}
                className={`flex h-8 w-48 items-center justify-between gap-1.5 rounded-lg border bg-white px-2.5 shadow-2xs cursor-pointer transition-all ${
                  isYearOpen
                    ? 'border-teal-600 ring-2 ring-teal-500/20'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <input
                  type="text"
                  value={
                    isYearOpen
                      ? yearQuery
                      : selectedYear === 'all'
                      ? 'Tất cả các năm'
                      : `Năm ${selectedYear}`
                  }
                  onChange={e => {
                    setYearQuery(e.target.value);
                    if (!isYearOpen) setIsYearOpen(true);
                  }}
                  onFocus={e => {
                    setIsYearOpen(true);
                    e.target.select();
                  }}
                  placeholder="Gõ năm (VD: 2026)..."
                  style={{
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    padding: 0,
                    margin: 0,
                    backgroundColor: 'transparent',
                  }}
                  className="w-full !border-0 !border-none !outline-none !ring-0 !shadow-none !bg-transparent !p-0 !m-0 text-xs font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 cursor-text select-all"
                />

                <div className="flex items-center gap-1 text-slate-500 shrink-0">
                  {selectedYear !== 'all' && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedYear('all');
                        setYearQuery('');
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-800 rounded transition-colors"
                      title="Xem tất cả các năm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-500 transition-transform ${
                      isYearOpen ? 'rotate-180 text-slate-800' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Year Dropdown Menu */}
              {isYearOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-52 overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100">
                  {/* Option: Tất cả các năm */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedYear('all');
                      setIsYearOpen(false);
                      setYearQuery('');
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors ${
                      selectedYear === 'all'
                        ? 'bg-teal-50 font-bold text-teal-900 border border-teal-200'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>Tất cả các năm</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      ({lists.length} đợt)
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  {/* Danh sách các năm có đợt */}
                  {filteredAvailableYears.length === 0 ? (
                    <div className="px-2 py-2 text-center text-xs text-slate-400 italic">
                      Không có năm phù hợp
                    </div>
                  ) : (
                    filteredAvailableYears.map(y => {
                      const isSel = selectedYear === y.toString();
                      const count = yearCounts.get(y) || 0;
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setSelectedYear(y.toString());
                            setIsYearOpen(false);
                            setYearQuery('');
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors ${
                            isSel
                              ? 'bg-teal-50 font-bold text-teal-900 border border-teal-200'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>Năm {y}</span>
                          <span
                            className={`text-[11px] ${
                              isSel ? 'text-teal-700 font-bold' : 'text-slate-500'
                            }`}
                          >
                            {count} đợt
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search box */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên đợt, người tạo/sửa..."
              className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white text-slate-800 placeholder:text-slate-400 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Body Table */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          <div className="rounded-xl border border-slate-300 overflow-hidden shadow-2xs bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-center w-10">#</th>
                  <th className="px-3 py-2.5 min-w-[200px]">Tên đợt thanh toán</th>
                  <th className="px-2.5 py-2.5 text-center w-20">Số ca</th>
                  <th className="px-3 py-2.5 text-center w-28">Trạng thái</th>
                  <th className="px-3 py-2.5 text-center w-36">Ngày tạo</th>
                  <th className="px-3 py-2.5 w-36">Người tạo</th>
                  <th className="px-3 py-2.5 text-center w-36">Sửa đổi cuối</th>
                  <th className="px-3 py-2.5 w-36">Người sửa</th>
                  <th className="px-2.5 py-2.5 text-center w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLists.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400 italic">
                      {searchQuery
                        ? 'Không tìm thấy đợt thanh toán phù hợp với từ khóa.'
                        : 'Chưa có đợt thanh toán nào trong năm đã chọn.'}
                    </td>
                  </tr>
                ) : (
                  filteredLists.map((l, idx) => {
                    const isSelected = currentListId === l.id;
                    const isEditing = editingId === l.id;

                    return (
                      <tr
                        key={l.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-teal-50/60 hover:bg-teal-50/80'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* STT */}
                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>

                        {/* Tên đợt (Inline Edit) */}
                        <td className="px-3 py-2.5">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveEdit(l.id);
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                                autoFocus
                                className="w-full rounded border border-teal-500 px-2 py-1 text-xs font-bold outline-none ring-1 ring-teal-500 bg-white"
                              />
                              <button
                                onClick={() => handleSaveEdit(l.id)}
                                disabled={isSavingEdit || !editingName.trim()}
                                className="rounded bg-teal-600 p-1 text-white hover:bg-teal-700 disabled:opacity-50"
                                title="Lưu tên mới (Enter)"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSavingEdit}
                                className="rounded bg-gray-200 p-1 text-gray-700 hover:bg-gray-300"
                                title="Hủy (Esc)"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="group flex items-center justify-between gap-2">
                              <span
                                className="font-bold text-slate-800 cursor-pointer hover:text-teal-700 transition-colors"
                                onDoubleClick={() => handleStartEdit(l)}
                                title="Click đúp hoặc bấm icon để sửa tên"
                              >
                                {l.name}
                              </span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isSelected && (
                                  <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
                                    Đang xem
                                  </span>
                                )}
                                {l.status !== 'locked' && (
                                  <button
                                    onClick={() => handleStartEdit(l)}
                                    className="p-1 text-slate-400 hover:text-teal-700 rounded transition-colors"
                                    title="Sửa tên đợt"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Số ca */}
                        <td className="px-2.5 py-2.5 text-center font-bold text-slate-700 font-mono">
                          {l.items.length} ca
                        </td>

                        {/* Trạng thái */}
                        <td className="px-3 py-2.5 text-center">
                          {l.status === 'locked' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-400 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <Lock className="h-3 w-3 shrink-0" />
                              <span>Đã chốt</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-300 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              <span>📝</span>
                              <span>Đang mở</span>
                            </span>
                          )}
                        </td>

                        {/* Ngày tạo */}
                        <td className="px-3 py-2.5 text-center text-slate-600 font-mono text-[11px]">
                          {formatDateTime(l.createdAt)}
                        </td>

                        {/* Người tạo (hiển thị tên, không hiển thị email) */}
                        <td className="px-3 py-2.5 text-slate-800 font-medium">
                          {formatUserName(l.createdBy)}
                        </td>

                        {/* Ngày sửa đổi cuối */}
                        <td className="px-3 py-2.5 text-center text-slate-600 font-mono text-[11px]">
                          {formatDateTime(l.updatedAt)}
                        </td>

                        {/* Người sửa cuối (hiển thị tên, không hiển thị email) */}
                        <td className="px-3 py-2.5 text-slate-800 font-medium">
                          {formatUserName(l.updatedBy || l.createdBy)}
                        </td>

                        {/* Thao tác (Xóa đợt) */}
                        <td className="px-2.5 py-2.5 text-center">
                          <button
                            onClick={() => setDeletingList(l)}
                            disabled={l.status === 'locked'}
                            className={`p-1.5 rounded transition-colors ${
                              l.status === 'locked'
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                            }`}
                            title={
                              l.status === 'locked'
                                ? 'Đợt đã chốt thanh toán, không thể xóa'
                                : 'Xóa đợt thanh toán này'
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-600">
          <span>
            Hiển thị <strong>{filteredLists.length}</strong> / <strong>{lists.length}</strong> đợt thanh toán
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingList && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isDeleting && setDeletingList(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-slate-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-800">
                  Xác nhận xóa đợt thanh toán
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có chắc muốn xóa đợt thanh toán <strong>"{deletingList.name}"</strong> ({deletingList.items.length} ca)?
                </p>
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                  ⚠️ Hành động này không thể hoàn tác. Các ca trong đợt này sẽ được đưa về trạng thái chưa thanh toán gói DV.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeletingList(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Đang xóa...' : 'Xóa đợt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
