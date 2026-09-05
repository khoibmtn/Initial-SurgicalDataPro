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
import { SurgeryNamePrice, SurgeryCostItem, SurgeryProfile, RefillCandidateItem, MissingCatalogCandidate } from '../../types';
import {
  createSurgeryNamePrice,
  updateSurgeryNamePrice,
  deleteSurgeryNamePrice,
  bulkUpsertSurgeryNamePrices,
  bulkDeleteSurgeryNamePrices,
  seedSurgeryNamePrices,
  scanMissingCatalogCandidates,
  applyMissingCatalogCandidates,
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
import { MissingCatalogModal } from './MissingCatalogModal';

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

const DEFAULT_PAGE_SIZE = 20;

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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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

  // Missing catalog proposal states
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingCandidates, setMissingCandidates] = useState<MissingCatalogCandidate[]>([]);
  const [isAddingMissing, setIsAddingMissing] = useState(false);

  // Advanced filter states
  const [showFilters, setShowFilters] = useState(false);
  const [validityMode, setValidityMode] = useState<'all' | 'active' | 'expired' | 'range'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [priceMode, setPriceMode] = useState<'all' | 'has_price' | 'zero_price' | 'custom'>('all');
  const [filterPrice, setFilterPrice] = useState('');
  const [hideCostItems, setHideCostItems] = useState(false);
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

  // Helper kiểm tra ngày yyyy-mm-dd hợp lệ
  const isValidDateString = (s: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s);
    return !isNaN(d.getTime());
  };

  const isFilterActive =
    validityMode !== 'all' ||
    (validityMode === 'range' && Boolean(filterDateFrom || filterDateTo)) ||
    priceMode !== 'all' ||
    (priceMode === 'custom' && Boolean(filterPrice.trim())) ||
    hideCostItems ||
    Boolean(filterProfile);

  const handleResetFilters = () => {
    setValidityMode('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPriceMode('all');
    setFilterPrice('');
    setHideCostItems(false);
    setFilterProfile('');
    setPage(0);
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

    // 1. Filter: Giá theo priceMode
    if (priceMode === 'has_price') {
      result = result.filter(p => p.price > 0);
    } else if (priceMode === 'zero_price') {
      result = result.filter(p => p.price === 0);
    } else if (priceMode === 'custom' && filterPrice.trim()) {
      const priceFn = parsePriceFilter(filterPrice);
      if (priceFn) {
        result = result.filter(p => priceFn(p.price));
      }
    }

    // 2. Filter: Hiệu lực theo validityMode
    if (validityMode === 'active') {
      result = result.filter(p => {
        if (p.effectiveFrom && p.effectiveFrom > today) return false;
        if (p.effectiveTo && p.effectiveTo < today) return false;
        return true;
      });
    } else if (validityMode === 'expired') {
      result = result.filter(p => Boolean(p.effectiveTo && p.effectiveTo < today));
    } else if (validityMode === 'range') {
      // Khi 2 ô trống => coi như hiển thị tất cả. Nếu có ngày hợp lệ => lọc tức thì.
      const hasFrom = isValidDateString(filterDateFrom);
      const hasTo = isValidDateString(filterDateTo);

      if (hasFrom && hasTo) {
        const fromD = filterDateFrom <= filterDateTo ? filterDateFrom : filterDateTo;
        const toD = filterDateFrom <= filterDateTo ? filterDateTo : filterDateFrom;
        result = result.filter(p => (!p.effectiveTo || p.effectiveTo >= fromD) && (!p.effectiveFrom || p.effectiveFrom <= toD));
      } else if (hasFrom) {
        result = result.filter(p => !p.effectiveTo || p.effectiveTo >= filterDateFrom);
      } else if (hasTo) {
        result = result.filter(p => !p.effectiveFrom || p.effectiveFrom <= filterDateTo);
      }
    }

    // 3. Filter: ẩn DM đã có trong DM chi phí
    if (hideCostItems) {
      result = result.filter(p => !costRefIds.has(p.id));
    }

    // 4. Filter: profile
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
  }, [surgeryNamePrices, searchTerm, priceMode, filterPrice, validityMode, filterDateFrom, filterDateTo, hideCostItems, filterProfile, profiles, costRefIds, sortField, sortDir]);

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

  // --- Quét DM thiếu (không tự ý thêm, hiển thị modal đề xuất để user duyệt) ---
  const handleScanMissing = async () => {
    setSeeding(true);
    setSeedProgress('Đang quét CSDL...');
    try {
      const candidates = await scanMissingCatalogCandidates(surgeryNamePrices, setSeedProgress);
      if (candidates.length === 0) {
        showToast('Tất cả các ca phẫu thuật trong CSDL đều đã có Danh mục giá phù hợp!', 'success');
        return;
      }
      setMissingCandidates(candidates);
      setShowMissingModal(true);
    } catch (err: any) {
      showToast(err.message || 'Lỗi quét dữ liệu', 'error');
    } finally {
      setSeeding(false);
      setSeedProgress('');
    }
  };

  const handleConfirmMissing = async (selected: MissingCatalogCandidate[]) => {
    setIsAddingMissing(true);
    try {
      const added = await applyMissingCatalogCandidates(selected);
      showToast(`Đã thêm thành công ${added} kỹ thuật mới vào Danh mục giá`);
      setShowMissingModal(false);
    } catch (err: any) {
      showToast(err.message || 'Lỗi thêm danh mục', 'error');
    } finally {
      setIsAddingMissing(false);
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
          {/* Quét DM thiếu (phát hiện ca chưa có giá, hiển thị đề xuất để user duyệt) */}
          <InstantTooltip content="Quét toàn bộ ca PT trên hệ thống để phát hiện các kỹ thuật chưa có trong DM giá. Hiển thị danh sách đề xuất để bạn xem lại và tick chọn trước khi thêm.">
            <button
              onClick={handleScanMissing}
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
              showFilters || isFilterActive
                ? 'border-primary-400 bg-primary-50 text-primary-700 font-bold'
                : 'border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            Bộ lọc
            {isFilterActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600 animate-pulse" />
            )}
          </button>
        </InstantTooltip>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="bg-gray-50/90 border border-gray-200 rounded-xl p-3 space-y-3 animate-fade-in shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. Combobox Hiệu lực: Tất cả / Còn hiệu lực / Hết hiệu lực / Khoảng hiệu lực */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={validityMode}
                onChange={e => {
                  setValidityMode(e.target.value as any);
                  setPage(0);
                }}
                className="px-2.5 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-700 shadow-2xs"
                title="Lọc theo tình trạng hiệu lực"
              >
                <option value="all">Hiệu lực: Tất cả</option>
                <option value="active">Còn hiệu lực</option>
                <option value="expired">Hết hiệu lực</option>
                <option value="range">Khoảng hiệu lực...</option>
              </select>

              {/* Khi chọn 'Khoảng hiệu lực' mới hiển thị 2 ô Từ ... Đến */}
              {validityMode === 'range' && (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <span className="text-[10px] text-gray-500 font-semibold">Từ:</span>
                  <input
                    type="date"
                    value={filterDateFrom}
                    max={filterDateTo || undefined}
                    onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }}
                    className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none bg-white shadow-2xs"
                    title="Hiệu lực từ ngày (bỏ trống = từ trước tới nay)"
                  />
                  <span className="text-[10px] text-gray-500 font-semibold">Đến:</span>
                  <input
                    type="date"
                    value={filterDateTo}
                    min={filterDateFrom || undefined}
                    onChange={e => { setFilterDateTo(e.target.value); setPage(0); }}
                    className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none bg-white shadow-2xs"
                    title="Hiệu lực đến ngày (bỏ trống = đến hiện tại/tương lai)"
                  />
                  {(filterDateFrom || filterDateTo) && (
                    <button
                      onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setPage(0); }}
                      className="text-gray-400 hover:text-gray-600 text-xs px-0.5"
                      title="Xóa ngày"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-gray-300 hidden sm:block" />

            {/* 2. Toggle chuyển đổi trạng thái Giá: Tất cả / Có giá / Chưa có giá / Khoảng giá */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center p-0.5 bg-gray-200/80 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setPriceMode('all'); setPage(0); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    priceMode === 'all'
                      ? 'bg-white text-gray-800 shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => { setPriceMode('has_price'); setPage(0); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    priceMode === 'has_price'
                      ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  title="Chỉ hiện danh mục có đơn giá > 0"
                >
                  Có giá
                </button>
                <button
                  type="button"
                  onClick={() => { setPriceMode('zero_price'); setPage(0); }}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                    priceMode === 'zero_price'
                      ? 'bg-white text-amber-700 shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  title="Chỉ hiện danh mục chưa có giá (đơn giá = 0)"
                >
                  Chưa có giá
                  {zeroPriceCount > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                      priceMode === 'zero_price' ? 'bg-amber-100 text-amber-800' : 'bg-gray-300 text-gray-700'
                    }`}>
                      {zeroPriceCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setPriceMode('custom'); setPage(0); }}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    priceMode === 'custom'
                      ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  title="Lọc theo khoảng giá hoặc toán tử tự nhập"
                >
                  Khoảng giá
                </button>
              </div>

              {/* Khi chọn 'Khoảng giá' mới hiển thị box nhập khoảng giá */}
              {priceMode === 'custom' && (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <input
                    type="text"
                    value={filterPrice}
                    onChange={e => { setFilterPrice(e.target.value); setPage(0); }}
                    placeholder=">500000, 500k-1tr..."
                    autoFocus
                    className="w-36 px-2.5 py-1 text-xs border border-indigo-300 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none font-mono bg-white shadow-2xs"
                    title="Gõ toán tử: >500000, >500k, <=1tr, =500k, hoặc khoảng: 500k-1tr"
                  />
                  {filterPrice && (
                    <button
                      onClick={() => { setFilterPrice(''); setPage(0); }}
                      className="text-gray-400 hover:text-gray-600 text-xs px-0.5"
                      title="Xóa giá"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-gray-300 hidden sm:block" />

            {/* 3. Checkbox Ẩn DM CP */}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" title="Ẩn những danh mục đã được thêm vào DM Chi phí PTTT.">
              <input
                type="checkbox"
                checked={hideCostItems}
                onChange={e => { setHideCostItems(e.target.checked); setPage(0); }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-semibold text-gray-600">Ẩn DM CP</span>
            </label>

            {/* 4. Dropdown Profile */}
            {profiles.length > 0 && (
              <select
                value={filterProfile}
                onChange={e => { setFilterProfile(e.target.value); setPage(0); }}
                className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-500 outline-none bg-white text-gray-700 shadow-2xs font-medium"
                title="Lọc theo profile nhóm kỹ thuật"
              >
                <option value="">-- Profile --</option>
                {profiles.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
            )}

            {/* 5. Reset all filters button */}
            {isFilterActive && (
              <button
                onClick={handleResetFilters}
                className="text-xs text-red-500 hover:text-red-700 font-semibold cursor-pointer ml-auto flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-red-50"
                title="Xóa tất cả bộ lọc về mặc định"
              >
                ✕ Xóa lọc
              </button>
            )}
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
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold w-14" title="Bật/tắt trong DM Chi phí PTTT">DM Chi phí</th>
                  <th className="px-3 py-2 text-center text-gray-500 font-semibold w-20">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p, idx) => {
                  const isEditing = editingId === p.id;
                  const isActive = !p.effectiveTo || p.effectiveTo >= new Date().toISOString().split('T')[0];
                  const isZeroPrice = p.price === 0;
                  const rowNum = page * pageSize + idx + 1;
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

      {/* Missing Catalog Proposal & Confirmation Modal */}
      <MissingCatalogModal
        isOpen={showMissingModal}
        onClose={() => setShowMissingModal(false)}
        candidates={missingCandidates}
        onConfirm={handleConfirmMissing}
        isConfirming={isAddingMissing}
      />
    </div>
  );
};
