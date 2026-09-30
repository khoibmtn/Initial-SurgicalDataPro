/**
 * PackageListView — Tab Gói Dịch Vụ
 * 
 * Bảng 1 duy nhất, cột gọn: Mã KCB, Họ tên, Tên PT (wrap), 
 * Các vị trí PT (PT Chính, PT Phụ, BS GMHS, KTV, TDC, GV),
 * + cột động cho vị trí ngoài PT (Chuẩn bị PT, Tư vấn...),
 * Gói DV (hiển thị tên rút gọn), cột icon thao tác.
 * 
 * Nguồn dữ liệu:
 * 1. Các ca đã gán gói online (lưu trên Firestore) — mở máy khác không mất
 * 2. Các ca được thêm từ DS Phẫu thuật sang (lưu local draft tạm cho tới khi chọn gói)
 * 
 * Icon +  → mở modal chọn gói + nhân viên
 * Icon ✏️ → mở modal sửa nhân viên  
 * Icon 🗑️ → mở modal xác nhận xóa (không dùng window.confirm, không chớp tắt)
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Package,
  Search,
  X,
  Trash2,
  Plus,
  Edit3,
  Settings,
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  Rows3,
  Minus,
  ChevronDown,
  ListChecks,
  AlertTriangle,
} from 'lucide-react';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
  buildCompositeKey,
  getRecordDateString,
  normalizeForKey,
  clearPackageDrafts,
  LS_DRAFT_KEY,
} from '../../types/servicePackage';
import { SurgeryRecord, StaffMember } from '../../types';
import { deleteAssignment } from '../../services/servicePackageService';
import { PackageAssignmentModal } from './PackageAssignmentModal';

interface Props {
  assignments: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  records: SurgeryRecord[];
  staffList: StaffMember[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
}

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('vi-VN');
}

type FilterMode = 'all' | 'assigned' | 'unassigned';
type Density = 'compact' | 'default' | 'relaxed';

// Base surgery staff columns
const BASE_STAFF_COLS = [
  { key: 'ptChinh', label: 'PT Chính' },
  { key: 'ptPhu', label: 'PT Phụ' },
  { key: 'bsGM', label: 'BS GMHS' },
  { key: 'ktvGM', label: 'KTV' },
  { key: 'tdc', label: 'TDC' },
  { key: 'gv', label: 'GV' },
] as const;

const BASE_STAFF_KEYS = new Set(BASE_STAFF_COLS.map(c => c.key));

const LS_CONFIG_KEY = 'package_list_view_config';

interface ViewConfig {
  hiddenCols: string[];
  density: Density;
  fontSize: number; // in px, default 12
}

const DEFAULT_CONFIG: ViewConfig = {
  hiddenCols: [],
  density: 'default',
  fontSize: 12,
};

function loadConfig(): ViewConfig {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg: ViewConfig) {
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg));
  } catch {}
}

const DENSITY_PY: Record<Density, string> = {
  compact: 'py-1',
  default: 'py-2',
  relaxed: 'py-3',
};

const DENSITY_OPTIONS: { key: Density; label: string; icon: typeof Minimize2 }[] = [
  { key: 'compact', label: 'Chặt', icon: Minimize2 },
  { key: 'default', label: 'Mặc định', icon: Rows3 },
  { key: 'relaxed', label: 'Rộng', icon: Maximize2 },
];

interface DeleteTarget {
  type: 'assignment' | 'draft';
  id: string;
  patientName: string;
  compositeKey: string;
}

export const PackageListView: React.FC<Props> = ({
  assignments,
  packages,
  records,
  staffList,
  searchTerm,
  onSearchChange,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [config, setConfig] = useState<ViewConfig>(loadConfig);
  const [configOpen, setConfigOpen] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  // Modal state for assignment
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<SurgeryRecord[]>([]);
  const [modalExistingAssignment, setModalExistingAssignment] = useState<ServicePackageAssignment | null>(null);

  // React modal state for delete confirmation (prevents browser prompt flickering)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Local draft records state (staged cases from DS phẫu thuật)
  const [draftRecords, setDraftRecords] = useState<SurgeryRecord[]>(() => {
    try {
      const stored = localStorage.getItem(LS_DRAFT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const refreshDrafts = useCallback(() => {
    try {
      const stored = localStorage.getItem(LS_DRAFT_KEY);
      setDraftRecords(stored ? JSON.parse(stored) : []);
    } catch {}
  }, []);

  useEffect(() => {
    refreshDrafts();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_DRAFT_KEY) refreshDrafts();
    };
    const handleCustom = () => refreshDrafts();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('package_drafts_updated', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('package_drafts_updated', handleCustom);
    };
  }, [refreshDrafts]);

  // When report records change (user queried/reloaded data), clear unassigned drafts
  const prevRecordsRef = useRef(records);
  useEffect(() => {
    if (prevRecordsRef.current !== records) {
      prevRecordsRef.current = records;
      clearPackageDrafts();
    }
  }, [records]);

  // Close config dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setConfigOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updateConfig = useCallback((patch: Partial<ViewConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  // composite key → assignment map
  const assignmentMap = useMemo(() => {
    const map = new Map<string, ServicePackageAssignment>();
    for (const a of assignments) map.set(a.compositeKey, a);
    return map;
  }, [assignments]);

  // Clean up any draft records that are now assigned in Firestore
  useEffect(() => {
    if (draftRecords.length === 0 || assignments.length === 0) return;
    const assignedKeys = new Set(assignments.map(a => a.compositeKey));
    const remaining = draftRecords.filter(d => {
      const dDate = getRecordDateString(d).substring(0, 10);
      const dKey = buildCompositeKey(d.patientId || '', dDate, d.tenKT || '');
      return !assignedKeys.has(dKey);
    });
    if (remaining.length !== draftRecords.length) {
      setDraftRecords(remaining);
      try {
        localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(remaining));
      } catch {}
    }
  }, [assignments, draftRecords]);

  // Dynamic extra position columns (not in base staff)
  const extraPositionCols = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      for (const sa of a.staffAssignments) {
        if (!BASE_STAFF_KEYS.has(sa.positionKey as any) && !map.has(sa.positionKey)) {
          map.set(sa.positionKey, sa.positionLabel);
        }
      }
    }
    return Array.from(map.entries()); // [key, label][]
  }, [assignments]);

  // Configurable columns
  const allColumns = useMemo(() => [
    { key: 'patientId', label: 'Mã KCB' },
    { key: 'patientName', label: 'Họ tên' },
    { key: 'tenKT', label: 'Tên phẫu thuật' },
    ...BASE_STAFF_COLS.map(c => ({ key: c.key, label: c.label })),
    ...extraPositionCols.map(([k, label]) => ({ key: k, label })),
    { key: 'goiDV', label: 'Gói DV' },
  ], [extraPositionCols]);

  const toggleCol = (key: string) => {
    const hidden = config.hiddenCols.includes(key)
      ? config.hiddenCols.filter(k => k !== key)
      : [...config.hiddenCols, key];
    updateConfig({ hiddenCols: hidden });
  };

  const showAllCols = () => {
    updateConfig({ hiddenCols: [] });
  };

  const isColVisible = (key: string) => !config.hiddenCols.includes(key);
  const cellPy = DENSITY_PY[config.density] || DENSITY_PY.default;

  // Build combined list of rows:
  // 1. ALL online assignments (visible on any machine)
  // 2. Local drafts added from DS phẫu thuật (temporary until assigned)
  const enrichedRecords = useMemo(() => {
    const list: { record: SurgeryRecord; compositeKey: string; assignment?: ServicePackageAssignment }[] = [];
    const seenKeys = new Set<string>();

    // 1. Process all online assignments
    for (const a of assignments) {
      seenKeys.add(a.compositeKey);
      // Try to find matching surgery record in current report records or drafts
      let rec = records.find(r => {
        const rDate = getRecordDateString(r).substring(0, 10);
        if (rDate && buildCompositeKey(r.patientId || '', rDate, r.tenKT || '') === a.compositeKey) return true;
        // Resilient match: same patientId and normalized tenKT
        const cleanRecPid = (r.patientId || '').trim().toLowerCase();
        const cleanAPid = (a.patientId || '').trim().toLowerCase();
        if (cleanRecPid && cleanAPid && cleanRecPid === cleanAPid) {
          if (normalizeForKey(r.tenKT || '') === normalizeForKey(a.tenKT || '')) {
            return true;
          }
        }
        return false;
      });

      if (!rec) {
        rec = draftRecords.find(d => {
          const dDate = getRecordDateString(d).substring(0, 10);
          if (dDate && buildCompositeKey(d.patientId || '', dDate, d.tenKT || '') === a.compositeKey) return true;
          const cleanDPid = (d.patientId || '').trim().toLowerCase();
          const cleanAPid = (a.patientId || '').trim().toLowerCase();
          if (cleanDPid && cleanAPid && cleanDPid === cleanAPid) {
            if (normalizeForKey(d.tenKT || '') === normalizeForKey(a.tenKT || '')) {
              return true;
            }
          }
          return false;
        });
      }

      // If not in records (e.g. accessed on another PC or different report timeframe), synthesize from assignment
      if (!rec) {
        rec = {
          id: a.id,
          key: a.compositeKey,
          patientId: a.patientId,
          patientName: a.patientName,
          tenKT: a.tenKT,
          ngayBD: a.ngayBD,
          ptChinh: a.staffAssignments.find(s => s.positionKey === 'ptChinh')?.staffName || '',
          ptPhu: a.staffAssignments.find(s => s.positionKey === 'ptPhu')?.staffName || '',
          bsGM: a.staffAssignments.find(s => s.positionKey === 'bsGM')?.staffName || '',
          ktvGM: a.staffAssignments.find(s => s.positionKey === 'ktvGM')?.staffName || '',
          tdc: a.staffAssignments.find(s => s.positionKey === 'tdc')?.staffName || '',
          gv: a.staffAssignments.find(s => s.positionKey === 'gv')?.staffName || '',
        } as SurgeryRecord;
      }

      list.push({ record: rec, compositeKey: a.compositeKey, assignment: a });
    }

    // 2. Process local draft records (only those not yet assigned)
    for (const d of draftRecords) {
      const dDate = getRecordDateString(d).substring(0, 10);
      const dKey = buildCompositeKey(d.patientId || '', dDate, d.tenKT || '');
      if (!seenKeys.has(dKey)) {
        seenKeys.add(dKey);
        list.push({ record: d, compositeKey: dKey, assignment: undefined });
      }
    }

    return list;
  }, [assignments, records, draftRecords]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = enrichedRecords;
    if (filterMode === 'assigned') result = result.filter(r => r.assignment);
    if (filterMode === 'unassigned') result = result.filter(r => !r.assignment);
    if (searchTerm.trim()) {
      const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(({ record: r, assignment: a }) => {
        const matched = a
          ? (packages.find(p => p.id && a.packageId && p.id === a.packageId) ||
             packages.find(p => p.name && a.packageName && p.name.trim().toLowerCase() === a.packageName.trim().toLowerCase()))
          : undefined;
        const pkgShort = matched?.shortName || a?.packageShortName || '';
        const text = `${r.patientId} ${r.patientName} ${r.tenKT} ${r.ptChinh} ${r.ptPhu} ${a?.packageName || ''} ${pkgShort}`.toLowerCase();
        return terms.every(t => text.includes(t));
      });
    }
    return result;
  }, [enrichedRecords, filterMode, searchTerm, packages]);

  const assignedCount = enrichedRecords.filter(r => r.assignment).length;
  const unassignedCount = enrichedRecords.length - assignedCount;

  // Open modal for new assignment
  const handleAdd = (record: SurgeryRecord) => {
    setModalRecords([record]);
    setModalExistingAssignment(null);
    setModalOpen(true);
  };

  // Open modal for editing existing assignment
  const handleEdit = (record: SurgeryRecord, assignment: ServicePackageAssignment) => {
    setModalRecords([record]);
    setModalExistingAssignment(assignment);
    setModalOpen(true);
  };

  // Delete click opens clean React confirmation modal
  const handleRequestDeleteAssignment = (e: React.MouseEvent, a: ServicePackageAssignment, patientName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({
      type: 'assignment',
      id: a.id,
      patientName: patientName || a.patientName,
      compositeKey: a.compositeKey,
    });
  };

  const handleRequestRemoveDraft = (e: React.MouseEvent, r: SurgeryRecord, compositeKey: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({
      type: 'draft',
      id: r.id || r.key || compositeKey,
      patientName: r.patientName || '',
      compositeKey,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'assignment') {
        await deleteAssignment(deleteTarget.id);
      } else {
        // Remove from local drafts
        const nextDrafts = draftRecords.filter(d => {
          const dDate = getRecordDateString(d).substring(0, 10);
          const dKey = buildCompositeKey(d.patientId || '', dDate, d.tenKT || '');
          return dKey !== deleteTarget.compositeKey && d.id !== deleteTarget.id && d.key !== deleteTarget.id;
        });
        setDraftRecords(nextDrafts);
        try {
          localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(nextDrafts));
        } catch {}
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error('[PackageListView] delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleModalSaved = () => {
    setModalOpen(false);
    setModalRecords([]);
    setModalExistingAssignment(null);
    refreshDrafts();
  };

  // Get staff name for a position from assignment, and check if differs from surgery record
  const getStaffInfo = (r: SurgeryRecord, a: ServicePackageAssignment | undefined, posKey: string) => {
    if (!a) return { name: '', original: '', differs: false };
    const sa = a.staffAssignments.find(s => s.positionKey === posKey);
    const pkgStaffName = sa?.staffName || '';
    const surgeryStaffName = BASE_STAFF_KEYS.has(posKey as any) ? ((r as any)[posKey] || '') : '';
    const differs = Boolean(pkgStaffName && surgeryStaffName && pkgStaffName !== surgeryStaffName);
    return { name: pkgStaffName, original: surgeryStaffName, differs };
  };

  // Dynamic visible column count for empty table colSpan
  const totalVisibleCols = useMemo(() => {
    let count = 2; // STT + Actions
    if (isColVisible('patientId')) count++;
    if (isColVisible('patientName')) count++;
    if (isColVisible('tenKT')) count++;
    BASE_STAFF_COLS.forEach(c => { if (isColVisible(c.key)) count++; });
    extraPositionCols.forEach(([k]) => { if (isColVisible(k)) count++; });
    if (isColVisible('goiDV')) count++;
    return count;
  }, [config.hiddenCols, extraPositionCols]);

  return (
    <div className="space-y-2 font-inter">
      {/* Toolbar: Config button + Font size + Filter tabs + Search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Config dropdown (Ẩn/hiện cột + Mật độ bảng) */}
        <div className="relative" ref={configRef}>
          <button
            onClick={() => setConfigOpen(!configOpen)}
            title="Cấu hình hiển thị và mật độ bảng"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
              configOpen
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:text-teal-700'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Cấu hình</span>
            <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${configOpen ? 'rotate-180' : ''}`} />
          </button>

          {configOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50 space-y-3">
              {/* Density selector */}
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Mật độ hiển thị
                </span>
                <div className="grid grid-cols-3 gap-1 bg-gray-100 p-0.5 rounded-lg">
                  {DENSITY_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isActive = config.density === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => updateConfig({ density: opt.key })}
                        className={`flex items-center justify-center gap-1 py-1 rounded text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-white text-teal-700 shadow-sm font-semibold'
                            : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Column visibility */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Ẩn / Hiện cột
                  </span>
                  {config.hiddenCols.length > 0 && (
                    <button
                      onClick={showAllCols}
                      className="text-[10px] text-teal-600 hover:underline font-medium"
                    >
                      Hiện tất cả
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5 divide-y divide-gray-50">
                  {allColumns.map(col => {
                    const visible = isColVisible(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center justify-between py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-xs"
                      >
                        <span className={visible ? 'text-gray-700 font-medium' : 'text-gray-400'}>
                          {col.label}
                        </span>
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => toggleCol(col.key)}
                          className="h-3.5 w-3.5 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Font size control */}
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-1 bg-white shadow-sm">
          <button
            onClick={() => updateConfig({ fontSize: Math.max(10, config.fontSize - 1) })}
            className="p-0.5 text-gray-500 hover:text-gray-800 rounded transition-colors"
            title="Giảm cỡ chữ"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-[11px] font-mono font-semibold text-gray-600 px-1 min-w-[28px] text-center">
            {config.fontSize}px
          </span>
          <button
            onClick={() => updateConfig({ fontSize: Math.min(16, config.fontSize + 1) })}
            className="p-0.5 text-gray-500 hover:text-gray-800 rounded transition-colors"
            title="Tăng cỡ chữ"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterMode === 'all'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Tất cả ({enrichedRecords.length})
          </button>
          <button
            onClick={() => setFilterMode('assigned')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterMode === 'assigned'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Đã gán ({assignedCount})
          </button>
          <button
            onClick={() => setFilterMode('unassigned')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterMode === 'unassigned'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Chưa gán ({unassignedCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo mã KCB, tên BN, tên PT..."
            className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 outline-none bg-white shadow-sm"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Record count indicator */}
        <span className="text-xs text-gray-500 font-medium shrink-0 ml-auto">
          {filtered.length} ca
        </span>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
        <table
          className="w-full text-left"
          style={{ fontSize: `${config.fontSize}px` }}
        >
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 font-semibold text-gray-600">
            <tr>
              <th className={`px-2 ${cellPy} w-8 text-center text-gray-500 border-r border-gray-100`}>#</th>
              {isColVisible('patientId') && (
                <th className={`px-2 ${cellPy} text-gray-500 border-r border-gray-100 w-[85px]`}>Mã KCB</th>
              )}
              {isColVisible('patientName') && (
                <th className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 w-[140px]`}>Họ tên</th>
              )}
              {isColVisible('tenKT') && (
                <th className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 w-[160px]`}>Tên phẫu thuật</th>
              )}
              {/* Base surgery staff columns */}
              {BASE_STAFF_COLS.map(col => isColVisible(col.key) && (
                <th key={col.key} className={`px-1.5 ${cellPy} text-gray-500 border-r border-gray-100 text-center w-[75px]`}>
                  {col.label}
                </th>
              ))}
              {/* Dynamic extra positions from packages */}
              {extraPositionCols.map(([key, label]) => isColVisible(key) && (
                <th key={key} className={`px-1.5 ${cellPy} text-teal-700 border-r border-gray-100 text-center w-[75px] bg-teal-50/50`}>
                  {label}
                </th>
              ))}
              {/* Package column */}
              {isColVisible('goiDV') && (
                <th className={`px-2.5 ${cellPy} text-teal-800 border-r border-gray-100 bg-teal-50/30 w-[160px]`}>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                    <span>Gói DV</span>
                  </div>
                </th>
              )}
              {/* Action column */}
              <th className={`px-1 ${cellPy} w-[55px] text-center text-gray-500`}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={totalVisibleCols}
                  className="px-4 py-12 text-center text-gray-400 italic"
                >
                  {searchTerm
                    ? 'Không tìm thấy ca phẫu thuật phù hợp.'
                    : 'Chưa có ca gói dịch vụ nào. Hãy chọn ca từ tab "DS Phẫu thuật" và bấm "Gói DV" để thêm vào đây.'}
                </td>
              </tr>
            ) : filtered.map(({ record: r, compositeKey, assignment: a }, idx) => {
              const matchedPkg = a
                ? (packages.find(p => p.id && a.packageId && p.id === a.packageId) ||
                   packages.find(p => p.name && a.packageName && p.name.trim().toLowerCase() === a.packageName.trim().toLowerCase()))
                : undefined;
              const packageDisplay = a
                ? (matchedPkg?.shortName?.trim() ||
                   (a.packageShortName && a.packageShortName.trim() !== a.packageName.trim() ? a.packageShortName.trim() : '') ||
                   a.packageName)
                : '';

              return (
                <tr
                  key={compositeKey}
                  className={`transition-colors ${a ? 'bg-teal-50/30 hover:bg-teal-50/50' : 'hover:bg-gray-50/50'}`}
                >
                  {/* STT */}
                  <td className={`px-2 ${cellPy} text-center text-gray-400 border-r border-gray-100 font-mono`}>
                    {idx + 1}
                  </td>

                  {/* Mã KCB */}
                  {isColVisible('patientId') && (
                    <td className={`px-2 ${cellPy} font-mono text-gray-600 border-r border-gray-100 text-[0.9em]`}>
                      {r.patientId}
                    </td>
                  )}

                  {/* Họ tên */}
                  {isColVisible('patientName') && (
                    <td className={`px-2 ${cellPy} font-semibold text-gray-800 border-r border-gray-100 whitespace-normal break-words w-[140px]`}>
                      {r.patientName}
                    </td>
                  )}

                  {/* Tên phẫu thuật */}
                  {isColVisible('tenKT') && (
                    <td className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 whitespace-normal break-words w-[160px]`}>
                      {r.tenKT}
                    </td>
                  )}

                  {/* Base surgery staff + package staff overlay */}
                  {BASE_STAFF_COLS.map(col => {
                    if (!isColVisible(col.key)) return null;
                    const surgeryName = (r as any)[col.key] || '';
                    const info = getStaffInfo(r, a, col.key);
                    const displayName = a && info.name ? info.name : surgeryName;

                    return (
                      <td
                        key={col.key}
                        className={`px-1.5 ${cellPy} text-center border-r border-gray-100 whitespace-normal ${
                          a && info.name ? 'bg-teal-50/20' : ''
                        }`}
                      >
                        {info.differs && (
                          <div className="text-[0.75em] text-gray-400 line-through leading-tight">
                            {info.original}
                          </div>
                        )}
                        <span className={a && info.name ? 'text-teal-700 font-semibold' : 'text-gray-600'}>
                          {displayName || ''}
                        </span>
                      </td>
                    );
                  })}

                  {/* Dynamic extra position columns */}
                  {extraPositionCols.map(([key]) => {
                    if (!isColVisible(key)) return null;
                    if (!a) {
                      return <td key={key} className={`px-1.5 ${cellPy} text-center border-r border-gray-100 bg-teal-50/10`}></td>;
                    }
                    const sa = a.staffAssignments.find(s => s.positionKey === key);
                    return (
                      <td key={key} className={`px-1.5 ${cellPy} text-center border-r border-gray-100 bg-teal-50/10 whitespace-normal`}>
                        <span className="text-teal-700 font-semibold">
                          {sa?.staffName || ''}
                        </span>
                      </td>
                    );
                  })}

                  {/* Package name column with shortName support */}
                  {isColVisible('goiDV') && (
                    <td className={`px-2 ${cellPy} border-r border-gray-100 bg-teal-50/10 whitespace-normal w-[160px]`}>
                      {a ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded text-[0.85em] font-semibold border border-teal-200"
                          title={a.packageName ? `${a.packageName}${packageDisplay && packageDisplay !== a.packageName ? ` (${packageDisplay})` : ''}` : ''}
                        >
                          <Package className="h-3 w-3 shrink-0" />
                          <span>{packageDisplay}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300"></span>
                      )}
                    </td>
                  )}

                  {/* Actions column */}
                  <td className={`px-1 ${cellPy} text-center w-[55px]`}>
                    <div className="flex items-center justify-center gap-0.5">
                      {a ? (
                        <>
                          <button
                            onClick={() => handleEdit(r, a)}
                            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Sửa gói + nhân viên"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleRequestDeleteAssignment(e, a, r.patientName)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Gỡ gói"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAdd(r)}
                            className="p-1 rounded hover:bg-teal-50 text-teal-600 hover:text-teal-800 transition-colors"
                            title="Thêm gói dịch vụ"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => handleRequestRemoveDraft(e, r, compositeKey)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Loại bỏ ca này khỏi danh sách gói"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      {assignedCount > 0 && (
        <div className="flex items-center gap-4 px-3 py-2 bg-teal-50/70 rounded-lg border border-teal-200 text-xs">
          <span className="font-semibold text-teal-800">Tổng kết gói DV:</span>
          <span className="text-teal-700 font-medium">{assignedCount} ca đã gán gói</span>
          <span className="text-teal-800 font-mono font-bold ml-auto text-sm">
            {fmt(assignments.reduce((s, a) => s + a.staffAssignments.reduce((ss, sa) => ss + (sa.amount || 0), 0), 0))} đ
          </span>
        </div>
      )}

      {/* Clean In-App Delete Confirmation Modal (NO OS confirm, NO flickering) */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-800">
                  {deleteTarget.type === 'assignment' ? 'Xác nhận gỡ gói dịch vụ' : 'Xóa ca khỏi danh sách gói'}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {deleteTarget.type === 'assignment'
                    ? `Bạn có chắc muốn gỡ gói dịch vụ khỏi ca của bệnh nhân "${deleteTarget.patientName}"? Hành động này sẽ cập nhật trên dữ liệu online.`
                    : `Bạn có chắc muốn loại bỏ ca "${deleteTarget.patientName}" khỏi danh sách tạm?`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Đang xóa...' : deleteTarget.type === 'assignment' ? 'Gỡ gói' : 'Xóa'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {modalOpen && (
        <PackageAssignmentModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalRecords([]);
            setModalExistingAssignment(null);
          }}
          records={modalRecords}
          staffList={staffList}
          existingAssignment={modalExistingAssignment}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
};
