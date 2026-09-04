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
  Filter, ChevronDown, MoreHorizontal, ToggleLeft, ToggleRight, Scan,
} from 'lucide-react';
import { SurgeryNamePrice, SurgeryCostItem, SurgeryProfile, RefillCandidateItem } from '../../types';
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
import { toggleCostItem, getCostRefPriceIds } from '../../services/surgeryCostService';
import { reportService } from '../../services/reportService';
import { RefillModal } from './RefillModal';

interface Props {
  surgeryNamePrices: SurgeryNamePrice[];
  costItems: SurgeryCostItem[];
  profiles?: SurgeryProfile[];
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

/** Bỏ dấu tiếng Việt để fuzzy search */
function removeVnTones(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** Parse giá trị số có thể kèm đơn vị (k, tr, m, nghìn, triệu) */
function parsePriceValue(valStr: string): number | null {
  const clean = valStr.trim().toLowerCase().replace(/[,.\s]/g, (match, offset, str) => {
    // Nếu là dấu . hoặc , ngăn cách phần thập phân (e.g. 1.5tr)
    return '.';
  });
  const m = clean.match(/^(\d+(?:\.\d+)?)\s*(k|tr|m|triệu|nghìn)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2];
  if (unit === 'k' || unit === 'nghìn') return Math.round(num * 1000);
  if (unit === 'tr' || unit === 'm' || unit === 'triệu') return Math.round(num * 1000000);
  return Math.round(num);
}

/** Parse chuỗi lọc giá: >500000, >500k, <=1tr, 500k-1tr, =500000, 500000-1000000 */
function parsePriceFilter(raw: string): ((price: number) => boolean) | null {
  const s = raw.trim();
  if (!s) return null;

  // Range: A - B (vd: 500k-1tr, 500000-1000000)
  if (s.includes('-') && !s.startsWith('-')) {
    const parts = s.split('-');
    if (parts.length === 2) {
      const lo = parsePriceValue(parts[0]);
      const hi = parsePriceValue(parts[1]);
      if (lo !== null && hi !== null) {
        return (p) => p >= lo && p <= hi;
      }
    }
  }

  // Operator: >=, <=, >, <, = (vd: >500k, <=1.5tr, =500000)
  const opMatch = s.match(/^(>=|<=|>|<|=)\s*(.+)$/);
  if (opMatch) {
    const op = opMatch[1];
    const val = parsePriceValue(opMatch[2]);
    if (val !== null) {
      switch (op) {
        case '>=': return (p) => p >= val;
        case '<=': return (p) => p <= val;
        case '>': return (p) => p > val;
        case '<': return (p) => p < val;
        case '=': return (p) => p === val;
      }
    }
  }

  // Số thuần (vd: 500000 hoặc 500k -> coi như =)
  const singleVal = parsePriceValue(s);
  if (singleVal !== null) {
    return (p) => p === singleVal;
  }

  return null;
}

/** Component Tooltip hiển thị tức thời (0ms delay) khi hover */
export const InstantTooltip: React.FC<{ content: string; children: React.ReactNode; position?: 'top' | 'bottom' }> = ({
  content,
  children,
  position = 'top',
}) => (
  <div className="relative group/tip inline-flex">
    {children}
    <div
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 hidden group-hover/tip:flex flex-col items-center z-50 animate-fade-in w-max max-w-xs ${
        position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      {position === 'bottom' && (
        <div className="w-2 h-2 -mb-1 rotate-45 bg-gray-900 border-l border-t border-gray-700"></div>
      )}
      <div className="bg-gray-900/95 text-white text-[11px] leading-tight font-normal px-2.5 py-1.5 rounded-lg shadow-xl border border-gray-700 backdrop-blur-sm text-center">
        {content}
      </div>
      {position === 'top' && (
        <div className="w-2 h-2 -mt-1 rotate-45 bg-gray-900 border-r border-b border-gray-700"></div>
      )}
    </div>
  </div>
);

export const SurgeryNamePriceConfig: React.FC<Props> = ({ surgeryNamePrices, costItems, profiles = [] }) => {
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

  // Advanced filter states
  const [showFilters, setShowFilters] = useState(false);
  const [hideCostItems, setHideCostItems] = useState(false);
  const [filterHasPrice, setFilterHasPrice] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCurrentlyValid, setFilterCurrentlyValid] = useState(false);
  const [filterPrice, setFilterPrice] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [showExcelMenu, setShowExcelMenu] = useState(false);

  // Cost item ref IDs set (for toggle & filter)
  const costRefIds = useMemo(() => getCostRefPriceIds(costItems), [costItems]);

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

  // --- Filter + Sort + Paginate (redesigned) ---
  const filtered = useMemo(() => {
    let result = surgeryNamePrices;
    const today = new Date().toISOString().slice(0, 10);

    // Fuzzy search: mã TĐ + tên KT
    const term = removeVnTones(searchTerm.trim());
    if (term) {
      result = result.filter(p =>
        removeVnTones(p.tenKT).includes(term) ||
        removeVnTones(p.maTuongDuong || '').includes(term)
      );
    }

    // Filter: chỉ DM chưa có giá
    if (filterZeroPrice) {
      result = result.filter(p => p.price === 0);
    }

    // Filter: chỉ DM có giá > 0
    if (filterHasPrice) {
      result = result.filter(p => p.price > 0);
    }

    // Filter: ẩn DM đã có trong DM chi phí
    if (hideCostItems) {
      result = result.filter(p => !costRefIds.has(p.id));
    }

    // Filter: hiệu lực theo ngày
    if (filterCurrentlyValid) {
      result = result.filter(p => {
        if (p.effectiveFrom && p.effectiveFrom > today) return false;
        if (p.effectiveTo && p.effectiveTo < today) return false;
        return true;
      });
    }
    if (filterDateFrom) {
      result = result.filter(p => !p.effectiveTo || p.effectiveTo >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter(p => !p.effectiveFrom || p.effectiveFrom <= filterDateTo);
    }

    // Filter: đơn giá (parse operator)
    const priceFn = parsePriceFilter(filterPrice);
    if (priceFn) {
      result = result.filter(p => priceFn(p.price));
    }

    // Filter: profile
    if (filterProfile && profiles.length > 0) {
      const prof = profiles.find(pr => pr.id === filterProfile);
      if (prof) {
        const nameSet = new Set(prof.surgeryNames.map(n => n.toLowerCase()));
        result = result.filter(p => nameSet.has(p.tenKT.toLowerCase()));
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'tenKT') cmp = a.tenKT.localeCompare(b.tenKT, 'vi');
      else if (sortField === 'price') cmp = a.price - b.price;
      else cmp = (a.effectiveFrom || '').localeCompare(b.effectiveFrom || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [surgeryNamePrices, searchTerm, filterZeroPrice, filterHasPrice, hideCostItems, filterCurrentlyValid, filterDateFrom, filterDateTo, filterPrice, filterProfile, profiles, costRefIds, sortField, sortDir]);

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
            {costRefIds.size > 0 && (
              <span className="text-emerald-600 font-semibold ml-2">• {costRefIds.size} trong DM chi phí</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quét DM thiếu (thay thế Tải DS từ dữ liệu) */}
          <InstantTooltip content="Quét toàn bộ ca PT trên hệ thống, so khớp mã tương đương + tên KT + khoảng hiệu lực. Nếu phát hiện ca chưa có DM giá phù hợp → đề xuất thêm mới.">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-300 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
            >
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
              {seeding ? seedProgress || 'Đang quét...' : 'Quét DM thiếu'}
            </button>
          </InstantTooltip>

          {/* Excel dropdown (gộp Excel mẫu, Xuất Excel, Import Excel) */}
          <div className="relative">
            <InstantTooltip content="Thao tác Excel: tải mẫu, xuất danh mục, import từ file">
              <button
                onClick={() => setShowExcelMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
                <ChevronDown className="h-3 w-3" />
              </button>
            </InstantTooltip>
            {showExcelMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExcelMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px]">
                  <button onClick={() => { exportNamePriceTemplate(); setShowExcelMenu(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2" title="Tải file Excel mẫu để import danh mục giá">
                    <Download className="h-3.5 w-3.5 text-gray-400" /> Tải Excel mẫu
                  </button>
                  <button onClick={() => { exportSurgeryNamePrices(surgeryNamePrices); setShowExcelMenu(false); }} disabled={surgeryNamePrices.length === 0} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50" title="Xuất toàn bộ danh mục giá ra file Excel">
                    <Download className="h-3.5 w-3.5 text-gray-400" /> Xuất Excel
                  </button>
                  <label className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 cursor-pointer" title="Import danh mục giá từ file Excel (.xlsx)">
                    <Upload className="h-3.5 w-3.5 text-blue-500" /> Import Excel
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { handleFileUpload(e); setShowExcelMenu(false); }} />
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Refill từ file Excel */}
          <InstantTooltip content="Quét các ca đã import từ file Excel DVKT để đối chiếu và cập nhật giá trong DM. Sau đó tự động áp giá cho các ca chưa có giá.">
            <button
              onClick={handleStartExcelRefill}
              disabled={isRefilling}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-emerald-400 bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isRefilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-emerald-600" />}
              {isRefilling ? refillProgress || 'Đang quét...' : 'Refill từ Excel'}
            </button>
          </InstantTooltip>

          {/* Thêm mới */}
          <InstantTooltip content="Thêm thủ công 1 kỹ thuật mới vào danh mục giá">
            <button
              onClick={handleStartAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-700 text-white rounded-lg hover:bg-primary-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm mới
            </button>
          </InstantTooltip>

          {selectedIds.size > 0 && (
            <InstantTooltip content="Xóa tất cả các mục đã chọn khỏi danh mục giá">
              <button
                onClick={handleBulkDelete}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa {selectedIds.size}
              </button>
            </InstantTooltip>
          )}
        </div>
      </div>

      {/* Search + Filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
            placeholder="Tìm mã tương đương hoặc tên kỹ thuật (hỗ trợ không dấu)..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>
        <InstantTooltip content="Bật/tắt bộ lọc nâng cao: hiệu lực, đơn giá, DM chi phí, profile">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg transition-colors whitespace-nowrap ${
              showFilters || hideCostItems || filterHasPrice || filterCurrentlyValid || filterDateFrom || filterDateTo || filterPrice || filterProfile
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Bộ lọc
          </button>
        </InstantTooltip>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Hiệu lực */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={filterCurrentlyValid} onChange={e => { setFilterCurrentlyValid(e.target.checked); setPage(0); }} className="rounded border-gray-300 text-primary-600" />
                <span className="font-semibold text-gray-600">Còn hiệu lực</span>
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 font-semibold">Từ:</span>
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }} className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none" />
              <span className="text-[10px] text-gray-500 font-semibold">Đến:</span>
              <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(0); }} className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none" />
            </div>

            {/* Đơn giá */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 font-semibold">Giá:</span>
              <input
                type="text"
                value={filterPrice}
                onChange={e => { setFilterPrice(e.target.value); setPage(0); }}
                placeholder=">500000, 500k-1tr"
                className="w-32 px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none font-mono"
                title="Gõ toán tử: >500000, <=1000000, =500000, hoặc khoảng: 500000-1000000"
              />
            </div>

            {/* Checkboxes */}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Chỉ hiện danh mục có đơn giá > 0">
              <input type="checkbox" checked={filterHasPrice} onChange={e => { setFilterHasPrice(e.target.checked); setFilterZeroPrice(false); setPage(0); }} className="rounded border-gray-300 text-emerald-600" />
              <span className="font-semibold text-gray-600">Có giá</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Chỉ hiện danh mục chưa có giá (giá = 0)">
              <input type="checkbox" checked={filterZeroPrice} onChange={e => { setFilterZeroPrice(e.target.checked); setFilterHasPrice(false); setPage(0); }} className="rounded border-gray-300 text-amber-600" />
              <span className="font-semibold text-gray-600">Chưa có giá</span>
              {zeroPriceCount > 0 && <span className="bg-amber-200 text-amber-800 px-1 py-0.5 rounded-full text-[9px] font-bold">{zeroPriceCount}</span>}
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" title="Ẩn những danh mục đã được thêm vào DM Chi phí PTTT. Bỏ check để hiển thị đầy đủ.">
              <input type="checkbox" checked={hideCostItems} onChange={e => { setHideCostItems(e.target.checked); setPage(0); }} className="rounded border-gray-300 text-blue-600" />
              <span className="font-semibold text-gray-600">Ẩn DM CP</span>
            </label>

            {/* Profile */}
            {profiles.length > 0 && (
              <select value={filterProfile} onChange={e => { setFilterProfile(e.target.value); setPage(0); }} className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none" title="Lọc theo profile nhóm kỹ thuật">
                <option value="">-- Profile --</option>
                {profiles.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            )}

            {/* Reset all filters */}
            <button
              onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterCurrentlyValid(false); setFilterHasPrice(false); setFilterZeroPrice(false); setHideCostItems(false); setFilterPrice(''); setFilterProfile(''); setPage(0); }}
              className="text-[10px] text-red-500 hover:text-red-700 font-semibold cursor-pointer"
              title="Xóa tất cả bộ lọc"
            >
              Xóa lọc
            </button>
          </div>
        </div>
      )}

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
            {searchTerm ? 'Thử từ khóa khác hoặc tắt bộ lọc' : 'Nhấn "Quét DM thiếu" hoặc "Import Excel" để bắt đầu'}
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
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold w-14" title="Bật/tắt trong DM Chi phí PTTT">DM CP</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p, idx) => {
                  const isEditing = editingId === p.id;
                  const isActive = !p.effectiveTo || p.effectiveTo >= new Date().toISOString().split('T')[0];
                  const isZeroPrice = p.price === 0;
                  const rowNum = page * PAGE_SIZE + idx + 1;
                  const isInCost = costRefIds.has(p.id);

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
                      <td className="px-2 py-2 text-center">
                        <InstantTooltip content={isInCost ? 'Đã có trong DM Chi phí. Bấm để tắt.' : 'Chưa có trong DM Chi phí. Bấm để bật.'}>
                          <button
                            onClick={async () => {
                              try {
                                await toggleCostItem(p, !isInCost, costItems);
                                showToast(isInCost ? 'Đã xóa khỏi DM chi phí' : 'Đã thêm vào DM chi phí');
                              } catch (err: any) {
                                showToast(err.message || 'Lỗi toggle', 'error');
                              }
                            }}
                            className={`p-0.5 rounded transition-colors ${
                              isInCost ? 'text-emerald-600 hover:text-emerald-800' : 'text-gray-300 hover:text-gray-500'
                            }`}
                          >
                            {isInCost ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                          </button>
                        </InstantTooltip>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <InstantTooltip content="Sửa mục này">
                            <button
                              onClick={() => handleStartEdit(p)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          </InstantTooltip>
                          <InstantTooltip content="Xóa mục này">
                            <button
                              onClick={() => handleDelete(p)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </InstantTooltip>
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
