/**
 * SurgeryNamePriceConfig — Manage per-surgery-name pricing catalog
 * Table with search, pagination, inline edit, Excel import/export, bulk seed
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus, Download, Upload, Trash2, Edit3, Save, X, Database,
  CheckCircle2, AlertTriangle, Search, ChevronLeft, ChevronRight,
  Loader2, FileSpreadsheet, Sparkles, RefreshCw,
} from 'lucide-react';
import { SurgeryNamePrice, RefillCandidateItem } from '../../types';
import {
  createSurgeryNamePrice,
  updateSurgeryNamePrice,
  deleteSurgeryNamePrice,
  bulkUpsertSurgeryNamePrices,
  bulkDeleteSurgeryNamePrices,
  seedSurgeryNamePrices,
  exportSurgeryNamePrices,
  exportNamePriceTemplate,
  parseImportedNamePriceExcel,
  migrateDateFormats,
  generateRefillCandidates,
  applyRefillCandidatesToCatalog,
} from '../../services/surgeryNamePriceService';
import { reportService } from '../../services/reportService';
import { RefillModal } from './RefillModal';

interface Props {
  surgeryNamePrices: SurgeryNamePrice[];
}

interface EditRow {
  tenKT: string;
  price: number | string;
  effectiveFrom: string;
  effectiveTo: string;
  maTuongDuong: string;
}

const EMPTY_ROW: EditRow = {
  tenKT: '',
  price: '',
  effectiveFrom: '',
  effectiveTo: '',
  maTuongDuong: '',
};

const PAGE_SIZE = 20;

const fmtMoney = (n: number) => n.toLocaleString('vi-VN') + ' ₫';

export const SurgeryNamePriceConfig: React.FC<Props> = ({ surgeryNamePrices }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editRow, setEditRow] = useState<EditRow>(EMPTY_ROW);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [sortField, setSortField] = useState<'tenKT' | 'price' | 'effectiveFrom'>('tenKT');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterZeroPrice, setFilterZeroPrice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refill states
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillCandidates, setRefillCandidates] = useState<RefillCandidateItem[]>([]);
  const [isRefilling, setIsRefilling] = useState(false);
  const [refillProgress, setRefillProgress] = useState('');

  // Auto-migrate yyyymmdd → yyyy-mm-dd (one-time per session)
  useEffect(() => {
    if (sessionStorage.getItem('namePriceDateMigrated')) return;
    sessionStorage.setItem('namePriceDateMigrated', '1');
    migrateDateFormats().then(r => {
      if (r.fixed > 0) {
        console.log(`[Migration] Đã chuyển ${r.fixed}/${r.total} bản ghi từ yyyymmdd → yyyy-mm-dd`);
      }
    }).catch(console.error);
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Filter + Sort + Paginate ---
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let result = surgeryNamePrices;
    if (term) {
      result = result.filter(p => p.tenKT.toLowerCase().includes(term));
    }
    if (filterZeroPrice) {
      result = result.filter(p => p.price === 0);
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'tenKT') cmp = a.tenKT.localeCompare(b.tenKT, 'vi');
      else if (sortField === 'price') cmp = a.price - b.price;
      else cmp = (a.effectiveFrom || '').localeCompare(b.effectiveFrom || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [surgeryNamePrices, searchTerm, filterZeroPrice, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // --- CRUD ---
  const handleStartEdit = (p: SurgeryNamePrice) => {
    setEditingId(p.id);
    setEditRow({
      tenKT: p.tenKT,
      price: p.price,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo || '',
      maTuongDuong: p.maTuongDuong || '',
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
    if (!editRow.tenKT.trim()) {
      showToast('Vui lòng nhập tên kỹ thuật', 'error');
      return;
    }
    if (!editRow.effectiveFrom) {
      showToast('Vui lòng nhập ngày bắt đầu hiệu lực', 'error');
      return;
    }
    const price = Number(editRow.price);
    if (isNaN(price) || price < 0) {
      showToast('Đơn giá không hợp lệ', 'error');
      return;
    }

    setSaving(true);
    try {
      const data = {
        tenKT: editRow.tenKT.trim(),
        price,
        effectiveFrom: editRow.effectiveFrom,
        effectiveTo: editRow.effectiveTo || null,
        maTuongDuong: editRow.maTuongDuong.trim(),
      };

      if (editingId) {
        await updateSurgeryNamePrice(editingId, data);
        showToast('Đã cập nhật');
      } else {
        await createSurgeryNamePrice(data);
        showToast('Đã thêm mới');
      }
      handleCancel();
    } catch (err: any) {
      showToast(err.message || 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: SurgeryNamePrice) => {
    if (!window.confirm(`Xóa "${p.tenKT}" (${fmtMoney(p.price)})?`)) return;
    try {
      await deleteSurgeryNamePrice(p.id);
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
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Xóa ${selectedIds.size} bản ghi đã chọn?`)) return;
    setSaving(true);
    try {
      const deleted = await bulkDeleteSurgeryNamePrices(Array.from(selectedIds));
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
    if (!window.confirm('Quét toàn bộ dữ liệu phẫu thuật trên hệ thống để lấy danh sách phẫu thuật. Tiếp tục?')) return;
    setSeeding(true);
    setSeedProgress('Đang quét...');
    try {
      const result = await seedSurgeryNamePrices(surgeryNamePrices, setSeedProgress);
      showToast(`Thêm ${result.added} tên mới, bỏ qua ${result.skipped} đã tồn tại`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi quét dữ liệu', 'error');
    } finally {
      setSeeding(false);
      setSeedProgress('');
    }
  };

  // --- Refill from Excel Sourced Records ---
  const handleStartExcelRefill = async () => {
    setIsRefilling(true);
    setRefillProgress('Đang quét dữ liệu Firestore...');
    try {
      const excelRecords = await reportService.fetchExcelSourcedRecords(setRefillProgress);
      if (excelRecords.length === 0) {
        showToast('Chưa có ca phẫu thuật nào được import giá từ file Excel DVKT.', 'error');
        setIsRefilling(false);
        setRefillProgress('');
        return;
      }

      setRefillProgress(`Tìm thấy ${excelRecords.length} ca. Đang đối chiếu với DM giá...`);
      const candidates = generateRefillCandidates(excelRecords, surgeryNamePrices);

      if (candidates.length === 0) {
        showToast('Không có mục nào cần cập nhật.', 'success');
        setIsRefilling(false);
        setRefillProgress('');
        return;
      }

      setRefillCandidates(candidates);
      setShowRefillModal(true);
    } catch (err: any) {
      showToast(err.message || 'Lỗi quét dữ liệu', 'error');
    } finally {
      setIsRefilling(false);
      setRefillProgress('');
    }
  };

  const handleConfirmRefill = async (selected: RefillCandidateItem[]) => {
    setIsRefilling(true);
    setRefillProgress('Đang cập nhật Danh mục giá...');
    try {
      // 1. Update/create items in Catalog (RTDB)
      const catRes = await applyRefillCandidatesToCatalog(selected);

      // 2. Build updated catalog snapshot for backfilling data
      const updatedCatalogMap = new Map<string, SurgeryNamePrice>();
      surgeryNamePrices.forEach(p => updatedCatalogMap.set(p.id, { ...p }));
      selected.forEach(c => {
        if (c.catalogId && updatedCatalogMap.has(c.catalogId)) {
          const item = updatedCatalogMap.get(c.catalogId)!;
          item.price = c.newPrice;
          item.maTuongDuong = c.maTuongDuong;
        } else if (c.action === 'create') {
          const tempId = `temp_${c.maTuongDuong}_${Date.now()}`;
          updatedCatalogMap.set(tempId, {
            id: tempId,
            tenKT: c.tenKT,
            price: c.newPrice,
            effectiveFrom: c.effectiveFrom,
            effectiveTo: c.effectiveTo,
            maTuongDuong: c.maTuongDuong,
            createdAt: Date.now(),
          });
        }
      });
      const updatedCatalogList = Array.from(updatedCatalogMap.values());

      setRefillProgress('Đang fill giá ngược vào các ca chưa có giá trong CSDL...');
      // 3. Backfill data in Firestore: only records where priceSource !== 'excel_dvkt' and has maTuongDuong
      const backfillRes = await reportService.backfillCatalogPrices(updatedCatalogList, setRefillProgress);

      showToast(
        `Hoàn tất Refill: ${catRes.updated} mục cập nhật & ${catRes.created} mục thêm vào DM giá. Đã điền giá cho ${backfillRes.updated} ca trong CSDL.`
      );
      setShowRefillModal(false);
    } catch (err: any) {
      showToast(`Lỗi xử lý Refill: ${err.message}`, 'error');
    } finally {
      setIsRefilling(false);
      setRefillProgress('');
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
        const parsed = parseImportedNamePriceExcel(wb);

        if (parsed.errors.length > 0) {
          showToast(`Lỗi: ${parsed.errors[0]}`, 'error');
          return;
        }

        if (parsed.items.length === 0) {
          showToast('Không tìm thấy dữ liệu hợp lệ', 'error');
          return;
        }

        if (!window.confirm(`Import ${parsed.items.length} bản ghi (upsert)? ${parsed.warnings.length > 0 ? `(${parsed.warnings.length} cảnh báo)` : ''}`)) return;

        setSaving(true);
        const result = await bulkUpsertSurgeryNamePrices(parsed.items, surgeryNamePrices);
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

  const zeroPriceCount = surgeryNamePrices.filter(p => p.price === 0).length;

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
          <h3 className="text-sm font-bold text-gray-800">Danh mục giá DVKT phẫu thuật</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {surgeryNamePrices.length} kỹ thuật
            {zeroPriceCount > 0 && (
              <span className="text-amber-600 font-semibold ml-2">• {zeroPriceCount} chưa có giá</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-300 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            {seeding ? seedProgress || 'Đang quét...' : 'Tải DS từ dữ liệu'}
          </button>
          <button
            onClick={exportNamePriceTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Excel mẫu
          </button>
          <button
            onClick={() => exportSurgeryNamePrices(surgeryNamePrices)}
            disabled={surgeryNamePrices.length === 0}
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
            onClick={handleStartExcelRefill}
            disabled={isRefilling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-emerald-400 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors shadow-sm"
            title="Quét các ca đã import từ file Excel để cập nhật DM giá và fill lại các ca chưa có giá"
          >
            {isRefilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-emerald-600" />}
            {isRefilling ? refillProgress || 'Đang quét...' : 'Refill từ file Excel'}
          </button>
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

      {/* Search + Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
            placeholder="Tìm tên phẫu thuật..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <label className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
          filterZeroPrice
            ? 'border-amber-400 bg-amber-50 text-amber-700'
            : 'border-gray-300 text-gray-500 hover:bg-gray-50'
        }`}>
          <input
            type="checkbox"
            checked={filterZeroPrice}
            onChange={e => { setFilterZeroPrice(e.target.checked); setPage(0); }}
            className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          DM chưa có giá {zeroPriceCount > 0 && <span className="bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">{zeroPriceCount}</span>}
        </label>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 space-y-3">
          <h4 className="text-xs font-bold text-emerald-800">➕ Thêm giá mới</h4>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Mã tương đương</label>
              <input
                value={editRow.maTuongDuong}
                onChange={e => setEditRow(r => ({ ...r, maTuongDuong: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500"
                placeholder="VD: A01.001"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Tên DVKT phê duyệt giá *</label>
              <input
                value={editRow.tenKT}
                onChange={e => setEditRow(r => ({ ...r, tenKT: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500"
                placeholder="VD: PT nội soi cắt túi mật"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Đơn giá (VNĐ)</label>
              <input
                type="number"
                min="0"
                value={editRow.price}
                onChange={e => setEditRow(r => ({ ...r, price: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-right focus:ring-2 focus:ring-primary-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Hiệu lực từ *</label>
              <input
                type="date"
                value={editRow.effectiveFrom}
                onChange={e => setEditRow(r => ({ ...r, effectiveFrom: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-0.5 block">Kết thúc</label>
              <input
                type="date"
                value={editRow.effectiveTo}
                onChange={e => setEditRow(r => ({ ...r, effectiveTo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-primary-500"
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
          <FileSpreadsheet className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">
            {searchTerm ? 'Không tìm thấy kết quả' : 'Chưa có danh mục giá'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {searchTerm ? 'Thử từ khóa khác' : 'Nhấn "Tải DS từ dữ liệu" để bắt đầu'}
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
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold w-28">Mã TĐ</th>
                  <th
                    className="px-3 py-2 text-left text-gray-500 font-semibold cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('tenKT')}
                  >
                    Tên DVKT phê duyệt giá <SortIcon field="tenKT" />
                  </th>
                  <th
                    className="px-3 py-2 text-right text-gray-500 font-semibold cursor-pointer hover:text-gray-700 select-none w-32"
                    onClick={() => handleSort('price')}
                  >
                    Đơn giá <SortIcon field="price" />
                  </th>
                  <th
                    className="px-3 py-2 text-center text-gray-500 font-semibold cursor-pointer hover:text-gray-700 select-none w-28"
                    onClick={() => handleSort('effectiveFrom')}
                  >
                    Từ <SortIcon field="effectiveFrom" />
                  </th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold w-28">Đến</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p, idx) => {
                  const isEditing = editingId === p.id;
                  const isActive = !p.effectiveTo || p.effectiveTo >= new Date().toISOString().split('T')[0];
                  const isZeroPrice = p.price === 0;
                  const rowNum = page * PAGE_SIZE + idx + 1;

                  if (isEditing) {
                    return (
                      <tr key={p.id} className="bg-blue-50 border-b border-blue-100">
                        <td className="px-2 py-2 text-center">
                          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-gray-300 text-primary-600 cursor-pointer" />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            value={editRow.maTuongDuong}
                            onChange={e => setEditRow(r => ({ ...r, maTuongDuong: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                            placeholder="Mã TĐ"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            value={editRow.tenKT}
                            onChange={e => setEditRow(r => ({ ...r, tenKT: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            type="number" min="0"
                            value={editRow.price}
                            onChange={e => setEditRow(r => ({ ...r, price: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-xs text-right focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            type="date"
                            value={editRow.effectiveFrom}
                            onChange={e => setEditRow(r => ({ ...r, effectiveFrom: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-1 py-1 text-[11px] focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-1">
                          <input
                            type="date"
                            value={editRow.effectiveTo}
                            onChange={e => setEditRow(r => ({ ...r, effectiveTo: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-1 py-1 text-[11px] focus:ring-2 focus:ring-blue-500"
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
                      key={p.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        isZeroPrice ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-gray-300 text-primary-600 cursor-pointer" />
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-[11px] font-mono">
                        {p.maTuongDuong || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-800 font-medium">
                        {p.tenKT}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        isZeroPrice ? 'text-amber-600' : 'text-gray-800'
                      }`}>
                        {isZeroPrice ? '—' : fmtMoney(p.price)}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{p.effectiveFrom}</td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {p.effectiveTo || (
                          <span className="text-emerald-600 text-[10px] font-bold">Đang áp dụng</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => handleStartEdit(p)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
                            title="Sửa"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Hiển thị {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}
              </span>
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
          )}
        </>
      )}

      {/* Refill Review & Confirmation Modal */}
      <RefillModal
        isOpen={showRefillModal}
        onClose={() => setShowRefillModal(false)}
        title="Refill Danh mục giá & Cập nhật Dữ liệu"
        subtitle="Quét toàn bộ ca phẫu thuật từ file Excel trên toàn hệ thống để cập nhật DM giá, sau đó tự động áp giá cho các ca chưa có giá trong CSDL."
        candidates={refillCandidates}
        onConfirm={handleConfirmRefill}
        isConfirming={isRefilling}
        confirmLabel="Áp dụng vào DM giá & Điền data"
      />
    </div>
  );
};
