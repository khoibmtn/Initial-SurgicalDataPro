/**
 * RequiredMachineCatalogConfig — Quản lý Danh mục kỹ thuật (DMKT) phải sử dụng mã máy
 * - Mã tương đương, Tên DVKT, Ngày hiệu lực, Toggle bắt buộc
 * - Autocomplete / Fuzzy search từ DVKT đang còn hiệu lực trong Danh mục giá
 * - Xuất Excel & Nhập Excel
 * - Thêm / Sửa / Xóa dòng cấu hình
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Download, Upload, Trash2, Edit3, Save, X, Database,
  CheckCircle2, AlertTriangle, Search, ChevronLeft, ChevronRight,
  Loader2, FileSpreadsheet, Activity, Cpu, Check, Filter, Calendar
} from 'lucide-react';
import { RequiredMachineItem, SurgeryNamePrice } from '../../types';
import {
  addRequiredMachineItem,
  updateRequiredMachineItem,
  toggleRequiredMachineItem,
  deleteRequiredMachineItem,
  exportRequiredMachineExcel,
  importRequiredMachineExcel,
  subscribeToRequiredMachineItems,
} from '../../services/requiredMachineService';
import { subscribeToSurgeryNamePrices } from '../../services/surgeryNamePriceService';
import { normalizeForMatch } from '../../services/servicePriceProcessor';

interface Props {
  initialItems?: RequiredMachineItem[];
}

type FilterStatus = 'all' | 'required' | 'optional' | 'active' | 'expired';

export const RequiredMachineCatalogConfig: React.FC<Props> = ({ initialItems }) => {
  const [items, setItems] = useState<RequiredMachineItem[]>(initialItems || []);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Surgery name prices for autocomplete
  const [surgeryNamePrices, setSurgeryNamePrices] = useState<SurgeryNamePrice[]>([]);

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RequiredMachineItem | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formFrom, setFormFrom] = useState('2000-01-01');
  const [formTo, setFormTo] = useState('');
  const [formRequired, setFormRequired] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Autocomplete suggestions in modal
  const [searchSuggestion, setSearchSuggestion] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Delete confirmation modal state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<RequiredMachineItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to RTDB required_machine_catalog
  useEffect(() => {
    const unsub = subscribeToRequiredMachineItems((data) => {
      setItems(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Subscribe to surgery name prices for autocomplete
  useEffect(() => {
    const unsub = subscribeToSurgeryNamePrices((data) => {
      setSurgeryNamePrices(data);
    });
    return () => unsub();
  }, []);

  // Filter active procedures from surgeryNamePrices (effectiveTo === null || >= today)
  const activePriceProcedures = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map<string, { maTuongDuong: string; tenDVKT: string }>();

    for (const p of surgeryNamePrices) {
      const to = p.effectiveTo ? p.effectiveTo.trim() : null;
      if (!to || to >= today) {
        const code = (p.maTuongDuong || '').trim();
        const name = (p.tenKT || '').trim();
        if (code || name) {
          const key = `${code}__${name}`;
          if (!map.has(key)) {
            map.set(key, { maTuongDuong: code, tenDVKT: name });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.tenDVKT.localeCompare(b.tenDVKT, 'vi'));
  }, [surgeryNamePrices]);

  // Suggestions filtered for autocomplete in Add/Edit modal
  const filteredSuggestions = useMemo(() => {
    if (!searchSuggestion.trim()) return activePriceProcedures.slice(0, 30);
    const cleanSearch = normalizeForMatch(searchSuggestion);
    const searchTokens = cleanSearch.split(/\s+/).filter(Boolean);

    return activePriceProcedures
      .filter((p) => {
        const combined = `${normalizeForMatch(p.maTuongDuong)} ${normalizeForMatch(p.tenDVKT)}`;
        return searchTokens.every((token) => combined.includes(token));
      })
      .slice(0, 30);
  }, [activePriceProcedures, searchSuggestion]);

  // Filtered and searched items
  const filteredItems = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let list = items;

    // Filter by status
    if (filterStatus === 'required') {
      list = list.filter((i) => i.isRequired === true);
    } else if (filterStatus === 'optional') {
      list = list.filter((i) => i.isRequired === false);
    } else if (filterStatus === 'active') {
      list = list.filter((i) => i.effectiveTo === null || i.effectiveTo >= today);
    } else if (filterStatus === 'expired') {
      list = list.filter((i) => i.effectiveTo !== null && i.effectiveTo < today);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const cleanTerm = normalizeForMatch(searchTerm);
      const tokens = cleanTerm.split(/\s+/).filter(Boolean);
      list = list.filter((i) => {
        const combined = `${normalizeForMatch(i.maTuongDuong)} ${normalizeForMatch(i.tenDVKT)}`;
        return tokens.every((token) => combined.includes(token));
      });
    }

    return list;
  }, [items, filterStatus, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, pageSize]);

  // Click outside to close autocomplete dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormCode('');
    setFormName('');
    setFormFrom('2000-01-01');
    setFormTo('');
    setFormRequired(true);
    setSearchSuggestion('');
    setShowSuggestions(false);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (item: RequiredMachineItem) => {
    setEditingItem(item);
    setFormCode(item.maTuongDuong || '');
    setFormName(item.tenDVKT || '');
    setFormFrom(item.effectiveFrom || '2000-01-01');
    setFormTo(item.effectiveTo || '');
    setFormRequired(item.isRequired !== false);
    setSearchSuggestion(item.tenDVKT || item.maTuongDuong || '');
    setShowSuggestions(false);
    setIsModalOpen(true);
  };

  // Save Add/Edit
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() && !formName.trim()) {
      showToast('Vui lòng nhập Mã tương đương hoặc Tên DVKT', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        await updateRequiredMachineItem(editingItem.id, {
          maTuongDuong: formCode.trim(),
          tenDVKT: formName.trim(),
          effectiveFrom: formFrom.trim() || '2000-01-01',
          effectiveTo: formTo.trim() || null,
          isRequired: formRequired,
        });
        showToast('Đã cập nhật kỹ thuật thành công');
      } else {
        await addRequiredMachineItem({
          maTuongDuong: formCode.trim(),
          tenDVKT: formName.trim(),
          effectiveFrom: formFrom.trim() || '2000-01-01',
          effectiveTo: formTo.trim() || null,
          isRequired: formRequired,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        showToast('Đã thêm kỹ thuật mới thành công');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Save error:', err);
      showToast('Lỗi khi lưu: ' + (err.message || err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle isRequired inline
  const handleToggleRequired = async (item: RequiredMachineItem) => {
    const nextVal = !item.isRequired;
    try {
      await toggleRequiredMachineItem(item.id, nextVal);
      // Optimistic local update
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isRequired: nextVal } : i))
      );
    } catch (err: any) {
      console.error('Toggle error:', err);
      showToast('Lỗi khi đổi trạng thái: ' + (err.message || err), 'error');
    }
  };

  // Delete handler
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmItem) return;
    setIsDeleting(true);
    try {
      await deleteRequiredMachineItem(deleteConfirmItem.id);
      showToast(`Đã xóa kỹ thuật: ${deleteConfirmItem.tenDVKT || deleteConfirmItem.maTuongDuong}`);
      setDeleteConfirmItem(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      showToast('Lỗi khi xóa: ' + (err.message || err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Excel Export
  const handleExport = () => {
    if (items.length === 0) {
      showToast('Không có dữ liệu để xuất Excel', 'error');
      return;
    }
    exportRequiredMachineExcel(filteredItems);
    showToast(`Đã xuất ${filteredItems.length} dòng ra Excel`);
  };

  // Excel Import
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const res = await importRequiredMachineExcel(file);
      showToast(`Đã nhập thành công ${res.success} kỹ thuật (Bỏ qua: ${res.skipped})`);
    } catch (err: any) {
      console.error('Import error:', err);
      showToast('Lỗi nhập Excel: ' + (err.message || err), 'error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Stats
  const totalCount = items.length;
  const requiredCount = useMemo(() => items.filter((i) => i.isRequired !== false).length, [items]);
  const optionalCount = totalCount - requiredCount;

  return (
    <div className="space-y-4 animate-fade-in font-inter text-sm">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white transition-all text-xs font-medium ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header alert / Explanation */}
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 flex gap-3 text-sky-900">
        <Cpu className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-sky-950 text-sm">
            Danh mục dịch vụ kỹ thuật (DVKT) phải sử dụng mã máy
          </p>
          <p className="text-sky-800">
            Hệ thống căn cứ vào <strong>Mã tương đương</strong> (ưu tiên), hoặc <strong>Tên DVKT</strong>, và <strong>Ngày phẫu thuật</strong> để tra cứu.
            Chỉ những ca mổ thuộc kỹ thuật có trạng thái <strong>Bắt buộc</strong> trong thời gian hiệu lực mới bị cảnh báo lỗi <em>"Thiếu mã máy"</em>.
          </p>
        </div>
      </div>

      {/* KPI / Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tổng số DVKT</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{totalCount.toLocaleString('vi-VN')}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <div className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Bắt buộc dùng máy</div>
          <div className="text-xl font-bold text-emerald-800 mt-1">{requiredCount.toLocaleString('vi-VN')}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-[11px] font-medium text-amber-700 uppercase tracking-wider">Không bắt buộc</div>
          <div className="text-xl font-bold text-amber-800 mt-1">{optionalCount.toLocaleString('vi-VN')}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">Đang hiển thị</div>
          <div className="text-xl font-bold text-blue-800 mt-1">{filteredItems.length.toLocaleString('vi-VN')}</div>
        </div>
      </div>

      {/* Actions & Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã tương đương, tên DVKT..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFile}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 text-slate-700 disabled:opacity-50 transition-colors"
              title="Nhập danh mục từ file Excel"
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Nhập Excel
            </button>

            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 text-slate-700 transition-colors"
              title="Xuất danh mục hiện tại ra file Excel"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất Excel
            </button>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-md shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              Thêm DVKT
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Lọc:
          </span>

          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'required', label: 'Bắt buộc dùng máy' },
            { id: 'optional', label: 'Không bắt buộc' },
            { id: 'active', label: 'Đang hiệu lực' },
            { id: 'expired', label: 'Hết hiệu lực' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterStatus(pill.id as FilterStatus)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                filterStatus === pill.id
                  ? 'bg-sky-50 border-sky-400 text-sky-800 font-semibold'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}

        </div>
      </div>

      {/* Table Area */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            <p className="text-xs">Đang tải danh mục DVKT mã máy...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Cpu className="h-10 w-10 mx-auto text-slate-300" />
            <p className="font-medium text-slate-600">Không tìm thấy kỹ thuật nào</p>
            <p className="text-xs">Hãy thử thay đổi từ khóa tìm kiếm hoặc bộ lọc.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-12 text-center">STT</th>
                  <th className="py-3 px-3 w-36">Mã tương đương</th>
                  <th className="py-3 px-3">Tên dịch vụ kỹ thuật</th>
                  <th className="py-3 px-3 w-32">Hiệu lực từ</th>
                  <th className="py-3 px-3 w-32">Hiệu lực đến</th>
                  <th className="py-3 px-3 w-40 text-center">Bắt buộc dùng máy</th>
                  <th className="py-3 px-3 w-28 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedItems.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const isExpired = item.effectiveTo && item.effectiveTo < new Date().toISOString().slice(0, 10);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        !item.isRequired ? 'bg-slate-50/40 text-slate-500' : ''
                      } ${isExpired ? 'opacity-60' : ''}`}
                    >
                      {/* STT */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {globalIdx}
                      </td>

                      {/* Mã tương đương */}
                      <td className="py-2.5 px-3 font-mono text-slate-800 font-medium">
                        {item.maTuongDuong ? (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 text-[11px]">
                            {item.maTuongDuong}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </td>

                      {/* Tên DVKT */}
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.tenDVKT}
                      </td>

                      {/* Hiệu lực từ */}
                      <td className="py-2.5 px-3 text-slate-600">
                        {item.effectiveFrom ? (
                          <span className="font-mono text-[11px]">{item.effectiveFrom}</span>
                        ) : (
                          <span className="text-slate-400">2000-01-01</span>
                        )}
                      </td>

                      {/* Hiệu lực đến */}
                      <td className="py-2.5 px-3">
                        {item.effectiveTo ? (
                          <span
                            className={`font-mono text-[11px] ${
                              isExpired ? 'text-red-600 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {item.effectiveTo}
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Hiện tại
                          </span>
                        )}
                      </td>

                      {/* Toggle Bắt buộc */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRequired(item)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shadow-2xs border ${
                            item.isRequired
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                          title={item.isRequired ? 'Click để tắt bắt buộc' : 'Click để bật bắt buộc'}
                        >
                          <span
                            className={`w-2 h-2 rounded-full transition-colors ${
                              item.isRequired ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {item.isRequired ? 'Bắt buộc' : 'Không bắt buộc'}
                        </button>
                      </td>

                      {/* Thao tác */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                            title="Sửa kỹ thuật"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmItem(item)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Xóa kỹ thuật"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredItems.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Số dòng:</span>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-0.5 border border-slate-200 rounded text-xs font-semibold bg-white focus:ring-1 focus:ring-sky-500 outline-none">
                  {[20, 50, 100, 200].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <span>
                Đang xem{' '}
                <span className="font-semibold text-slate-800">
                  {(currentPage - 1) * pageSize + 1} –{' '}
                  {Math.min(currentPage * pageSize, filteredItems.length)}
                </span>{' '}
                trong tổng số{' '}
                <span className="font-semibold text-slate-800">
                  {filteredItems.length.toLocaleString('vi-VN')}
                </span>{' '}
                DVKT
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-slate-200 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="px-2.5 py-1 font-medium text-slate-700 bg-white border border-slate-200 rounded">
                Trang {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-slate-200 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL: THÊM / SỬA DVKT ─────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-sky-600" />
                <h3 className="font-semibold text-slate-900 text-sm">
                  {editingItem ? 'Chỉnh sửa DVKT dùng mã máy' : 'Thêm DVKT dùng mã máy mới'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body / Form */}
            <form onSubmit={handleSaveModal} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Autocomplete Search from Active Price Catalog */}
              <div className="relative" ref={suggestionsRef}>
                <label className="block font-medium text-slate-700 mb-1">
                  Tìm kiếm DVKT từ Danh mục giá đang còn hiệu lực:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchSuggestion}
                    onChange={(e) => {
                      setSearchSuggestion(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Gõ mã hoặc tên kỹ thuật để tìm kiếm..."
                    className="w-full pl-8 pr-8 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  {searchSuggestion && (
                    <button
                      type="button"
                      onClick={() => setSearchSuggestion('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown suggestions */}
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-56 bg-white border border-slate-200 rounded-lg shadow-xl overflow-y-auto z-50 divide-y divide-slate-100">
                    {filteredSuggestions.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 italic">
                        Không tìm thấy DVKT nào phù hợp trong danh mục giá
                      </div>
                    ) : (
                      filteredSuggestions.map((sug, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setFormCode(sug.maTuongDuong);
                            setFormName(sug.tenDVKT);
                            setSearchSuggestion(sug.tenDVKT);
                            setShowSuggestions(false);
                          }}
                          className="p-2.5 hover:bg-sky-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {sug.maTuongDuong && (
                              <span className="font-mono text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">
                                {sug.maTuongDuong}
                              </span>
                            )}
                            <span className="font-medium text-slate-800 flex-1 truncate">
                              {sug.tenDVKT}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3">
                {/* Mã tương đương */}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Mã tương đương:
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="VD: 01.0303.0001"
                    className="w-full px-3 py-2 font-mono text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                </div>

                {/* Tên DVKT */}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tên dịch vụ kỹ thuật: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: Siêu âm cấp cứu tại giường bệnh"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                </div>

                {/* Date range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Hiệu lực từ:
                    </label>
                    <input
                      type="date"
                      value={formFrom}
                      onChange={(e) => setFormFrom(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Hiệu lực đến (trống = Hiện tại):
                    </label>
                    <input
                      type="date"
                      value={formTo}
                      onChange={(e) => setFormTo(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                {/* Bắt buộc dùng máy Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <span className="font-semibold text-slate-800 block text-xs">
                      Bắt buộc sử dụng mã máy
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Nếu bật, ca mổ thiếu mã máy sẽ bị đánh dấu lỗi
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormRequired(!formRequired)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formRequired ? 'bg-sky-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        formRequired ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md shadow-sm disabled:opacity-50 transition-colors"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingItem ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: XÁC NHẬN XÓA ────────────────────────────────────────────── */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-full text-red-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Xóa DVKT dùng mã máy?</h4>
                <p className="text-xs text-slate-600 mt-1">
                  Bạn có chắc muốn xóa{' '}
                  <strong className="text-slate-800">
                    {deleteConfirmItem.tenDVKT || deleteConfirmItem.maTuongDuong}
                  </strong>{' '}
                  khỏi danh mục yêu cầu mã máy?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 text-xs transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium shadow-sm disabled:opacity-50 transition-colors"
              >
                {isDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
