/**
 * ChapterCatalogConfig — Manage chapter catalog (Danh mục chương)
 * Table with search, inline edit, Excel import/export, seed default
 */
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Download, Upload, Trash2, Edit3, Save, X, Database,
  CheckCircle2, AlertTriangle, Search, ChevronLeft, ChevronRight,
  Loader2, FileSpreadsheet, BookOpen,
} from 'lucide-react';
import { ChapterCatalog } from '../../types';
import {
  createChapter,
  updateChapter,
  deleteChapter,
  bulkDeleteChapters,
  bulkUpsertChapters,
  seedDefaultChapters,
  exportChapters,
  exportChapterTemplate,
  parseImportedChapterExcel,
} from '../../services/chapterCatalogService';

interface Props {
  chapters: ChapterCatalog[];
}

interface EditRow {
  ma_chuong: string;
  ten_chuong: string;
}

const EMPTY_ROW: EditRow = {
  ma_chuong: '',
  ten_chuong: '',
};

const DEFAULT_PAGE_SIZE = 30;

export const ChapterCatalogConfig: React.FC<Props> = ({ chapters }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editRow, setEditRow] = useState<EditRow>(EMPTY_ROW);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [sortField, setSortField] = useState<'ma_chuong' | 'ten_chuong'>('ma_chuong');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Filter + Sort + Paginate ---
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let result = chapters;
    if (term) {
      result = result.filter(c =>
        c.ma_chuong.toLowerCase().includes(term) ||
        c.ten_chuong.toLowerCase().includes(term)
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'ma_chuong') cmp = a.ma_chuong.localeCompare(b.ma_chuong, 'vi');
      else cmp = a.ten_chuong.localeCompare(b.ten_chuong, 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [chapters, searchTerm, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // --- CRUD ---
  const handleStartEdit = (c: ChapterCatalog) => {
    setEditingId(c.id);
    setEditRow({
      ma_chuong: c.ma_chuong,
      ten_chuong: c.ten_chuong,
    });
    setShowAddForm(false);
  };

  const handleStartAdd = () => {
    setShowAddForm(true);
    setEditingId(null);
    setEditRow(EMPTY_ROW);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    setEditRow(EMPTY_ROW);
  };

  const handleSave = async () => {
    if (!editRow.ma_chuong.trim()) {
      showToast('Vui lòng nhập mã chương', 'error');
      return;
    }
    if (!editRow.ten_chuong.trim()) {
      showToast('Vui lòng nhập tên chương', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ma_chuong: editRow.ma_chuong.trim(),
        ten_chuong: editRow.ten_chuong.trim(),
      };

      if (editingId) {
        await updateChapter(editingId, data);
        showToast('Đã cập nhật');
      } else {
        await createChapter(data);
        showToast('Đã thêm mới');
      }
      handleCancel();
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: ChapterCatalog) => {
    if (!window.confirm(`Xóa chương "${c.ma_chuong} - ${c.ten_chuong}"?`)) return;
    try {
      await deleteChapter(c.id);
      showToast('Đã xóa');
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa', 'error');
    }
  };

  // --- Selection ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Xóa ${selectedIds.size} bản ghi đã chọn?`)) return;
    setSaving(true);
    try {
      const deleted = await bulkDeleteChapters(Array.from(selectedIds));
      setSelectedIds(new Set());
      showToast(`Đã xóa ${deleted} bản ghi`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa hàng loạt', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Seed ---
  const handleSeed = async () => {
    if (!window.confirm('Nạp danh sách 28 chương mặc định (bỏ qua các mã đã tồn tại)?')) return;
    setSeeding(true);
    try {
      const result = await seedDefaultChapters(chapters);
      showToast(`Thêm ${result.added} chương mới, bỏ qua ${result.skipped} đã tồn tại`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi nạp dữ liệu', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // --- Excel Import ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const parsed = parseImportedChapterExcel(wb);

        if (parsed.errors.length > 0) {
          showToast(`Lỗi: ${parsed.errors[0]}`, 'error');
          return;
        }

        if (parsed.items.length === 0) {
          showToast('Không tìm thấy dữ liệu hợp lệ', 'error');
          return;
        }

        if (!window.confirm(`Import ${parsed.items.length} chương (upsert)?`)) return;

        setSaving(true);
        const result = await bulkUpsertChapters(parsed.items, chapters);
        showToast(`Import: ${result.created} mới, ${result.updated} cập nhật`);
      } catch (err) {
        showToast('Không thể đọc file Excel', 'error');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Sort indicator ---
  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-primary-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-4">
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Danh mục chương</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {chapters.length} chương
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-300 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            {seeding ? 'Đang nạp...' : 'Nạp mặc định'}
          </button>
          <button
            onClick={exportChapterTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Excel mẫu
          </button>
          <button
            onClick={() => exportChapters(chapters)}
            disabled={chapters.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Xuất Excel
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors">
            <Upload className="h-3.5 w-3.5" />
            Import Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
          <button
            onClick={handleStartAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm mới
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Xóa {selectedIds.size} đã chọn
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
          placeholder="Tìm mã hoặc tên chương..."
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 space-y-3">
          <h4 className="text-xs font-bold text-emerald-800">➕ Thêm chương mới</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Mã chương *</label>
              <input
                value={editRow.ma_chuong}
                onChange={e => setEditRow(r => ({ ...r, ma_chuong: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500"
                placeholder="VD: I, PT-I"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Tên chương *</label>
              <input
                value={editRow.ten_chuong}
                onChange={e => setEditRow(r => ({ ...r, ten_chuong: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500"
                placeholder="VD: Bệnh nhiễm trùng và ký sinh trùng"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 transition-colors">
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Đang lưu...' : 'Thêm'}
            </button>
            <button onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              <X className="h-3.5 w-3.5" /> Hủy
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">
            {searchTerm ? 'Không tìm thấy kết quả' : 'Chưa có danh mục chương'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {searchTerm ? 'Thử từ khóa khác' : 'Nhấn "Nạp mặc định" để bắt đầu'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 py-2 text-center w-8">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold w-10">#</th>
                  <th
                    className="px-3 py-2 text-left text-gray-500 font-semibold cursor-pointer hover:text-gray-700 select-none w-28"
                    onClick={() => handleSort('ma_chuong')}
                  >
                    Mã chương <SortIcon field="ma_chuong" />
                  </th>
                  <th
                    className="px-3 py-2 text-left text-gray-500 font-semibold cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('ten_chuong')}
                  >
                    Tên chương <SortIcon field="ten_chuong" />
                  </th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c, idx) => {
                  const isEditing = editingId === c.id;
                  const rowNum = page * pageSize + idx + 1;

                  if (isEditing) {
                    return (
                      <tr key={c.id} className="bg-blue-50 border-b border-blue-100">
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-gray-300 text-primary-600 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400 text-[10px]">{rowNum}</td>
                        <td className="px-3 py-1">
                          <input
                            value={editRow.ma_chuong}
                            onChange={e => setEditRow(r => ({ ...r, ma_chuong: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            value={editRow.ten_chuong}
                            onChange={e => setEditRow(r => ({ ...r, ten_chuong: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={handleSave} disabled={saving}
                              className="p-1 rounded hover:bg-blue-200 text-blue-600 disabled:opacity-50">
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={handleCancel}
                              className="p-1 rounded hover:bg-gray-200 text-gray-500">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded border-gray-300 text-primary-600 cursor-pointer" />
                      </td>
                      <td className="px-3 py-2 text-center text-gray-400 text-[10px]">{rowNum}</td>
                      <td className="px-3 py-2 text-gray-800 font-bold text-[11px] font-mono">
                        {c.ma_chuong}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {c.ten_chuong}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => handleStartEdit(c)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
                            title="Sửa"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                            title="Xóa"
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

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">Số dòng:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} className="px-2 py-0.5 border border-gray-200 rounded text-xs font-semibold bg-white focus:ring-1 focus:ring-blue-500 outline-none">
                  {[10, 20, 30, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <span>
                Đang xem {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} trong tổng số {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-semibold">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
