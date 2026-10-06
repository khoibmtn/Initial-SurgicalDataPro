/**
 * PackageListView — Tab Gói Dịch Vụ
 * 
 * Bảng 1 duy nhất, cột gọn: Mã KCB, Họ tên, Tên PT (wrap), 
 * Các vị trí PT (PT Chính, PT Phụ, BS GMHS, KTV, TDC, GV),
 * + cột động cho vị trí ngoài PT (Chuẩn bị PT, Tư vấn...),
 * Gói DV (hiển thị tên rút gọn), Cột Ra viện (BQ), Cột Thanh toán gói DV, cột icon thao tác.
 * 
 * Nguồn dữ liệu:
 * 1. Các ca đã gán gói online (lưu trên Firestore) — mở máy khác không mất
 * 2. Các ca được thêm từ DS Phẫu thuật sang (lưu local draft tạm cho tới khi chọn gói)
 * 3. Các ca từ đợt thanh toán TCKT khi người dùng chọn lọc theo đợt
 * 
 * Thao tác trên thanh công cụ:
 * - Chọn đợt thanh toán: Tất cả ca toàn viện / Từng đợt
 * - [➕ Tạo đợt mới], [📥 Nhập thêm TCKT], [✏️ Đổi tên đợt], [🔒 Chốt đợt] / [🔓 Mở khóa], [🗑️ Xóa đợt]
 * - Lọc nhanh 1-chạm: Tất cả | Chưa thanh toán gói DV | Đã ra viện (BQ) | Chưa ra viện (BQ) | Chưa chốt
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
  Minimize2,
  Maximize2,
  Rows3,
  Minus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  AlertTriangle,
  Lock,
  Unlock,
  Upload,
  CheckCircle2,
  UserPlus,
  UserMinus,
  Sparkles,
  ArrowRightLeft,
  ListFilter,
  Check,
  FolderKanban,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
  buildCompositeKey,
  getRecordDateString,
  normalizeForKey,
  clearPackageDrafts,
  LS_DRAFT_KEY,
  calcNetPositionAmount,
  findPackageForAssignment,
} from '../../types/servicePackage';
import { SurgeryRecord, StaffMember } from '../../types';
import { deleteAssignment } from '../../services/servicePackageService';
import {
  renameList,
  deletePaymentList,
  lockList,
  unlockList,
  addItems,
  removeItem,
  moveItem,
} from '../../services/paymentListService';
import { reconcileItems, canLock } from '../../services/paymentListReconcile';
import { PaymentList } from '../../types/paymentList';
import { PackageAssignmentModal } from './PackageAssignmentModal';
import { PaymentListsContext, LookupRecord } from '../../hooks/usePaymentLists';
import { PaymentListImportModal } from './PaymentListImportModal';
import { PaymentListManagementModal } from './PaymentListManagementModal';
import { PageCombobox } from '../common/PageCombobox';
import { formatDate } from '../../utils/dateUtils';
import { useAuth } from '../../contexts/AuthContext';
import { exportPackageListToExcel } from '../../services/servicePackageExportService';

export const DATE_FORMATS = ['dd/mm/yyyy', 'dd/mm/yyyy hh:mm', 'dd/mm hh:mm', 'hh:mm'];

interface Props {
  assignments: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  records: SurgeryRecord[];
  staffList: StaffMember[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
  /** Monthly report only: adds a payment-status column and filter */
  paymentLists?: PaymentListsContext;
  rowsPerPage?: number;
  onRowsPerPageChange?: (rows: number) => void;
  dateFormat?: string;
  onDateFormatChange?: (fmt: string) => void;
  onListFilterChange?: (filter: string) => void;
  dateRangeText?: string;
}

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('vi-VN');
}

function formatDischargeDate(dtStr?: string): string {
  if (!dtStr) return '';
  const d = dtStr.substring(0, 10).split('-');
  if (d.length === 3) return `${d[2]}/${d[1]}/${d[0]}`;
  return dtStr;
}

export type ActiveFilter = 'all' | 'assigned' | 'unassigned' | 'discharged' | 'not_discharged';
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
  dateFormat?: string;
}

const DEFAULT_CONFIG: ViewConfig = {
  hiddenCols: [],
  density: 'default',
  fontSize: 12,
  dateFormat: 'dd/mm/yyyy hh:mm',
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

export const LS_PACKAGE_VIEW_STATE_KEY = 'package_list_view_active_state';

export type PackageFilter = 'all' | 'assigned' | 'unassigned';
export type BatchFilter = 'all' | 'in_batch' | 'no_batch';
export type DischargeFilter = 'all' | 'discharged' | 'not_discharged';

export interface PackageViewState {
  listFilter: string;
  packageFilter: PackageFilter;
  batchFilter: BatchFilter;
  dischargeFilter: DischargeFilter;
  currentPage: number;
}

export const DEFAULT_VIEW_STATE: PackageViewState = {
  listFilter: 'all',
  packageFilter: 'all',
  batchFilter: 'all',
  dischargeFilter: 'all',
  currentPage: 1,
};

export function loadSavedViewState(): PackageViewState {
  try {
    const raw = localStorage.getItem(LS_PACKAGE_VIEW_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      let packageFilter: PackageFilter = parsed.packageFilter || 'all';
      let dischargeFilter: DischargeFilter = parsed.dischargeFilter || 'all';
      if (parsed.activeFilter === 'assigned') packageFilter = 'assigned';
      if (parsed.activeFilter === 'unassigned') packageFilter = 'unassigned';
      if (parsed.activeFilter === 'discharged') dischargeFilter = 'discharged';
      if (parsed.activeFilter === 'not_discharged') dischargeFilter = 'not_discharged';

      return {
        listFilter: typeof parsed.listFilter === 'string' ? parsed.listFilter : 'all',
        packageFilter,
        batchFilter: parsed.batchFilter || 'all',
        dischargeFilter,
        currentPage: typeof parsed.currentPage === 'number' && parsed.currentPage > 0 ? parsed.currentPage : 1,
      };
    }
  } catch {}
  return { ...DEFAULT_VIEW_STATE };
}

export function saveViewState(state: PackageViewState): void {
  try {
    localStorage.setItem(LS_PACKAGE_VIEW_STATE_KEY, JSON.stringify(state));
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
  patientId?: string;
}

interface MoveTarget {
  patientId: string;
  patientName: string;
  fromListId?: string;
  fromListName?: string;
  isFromLocked?: boolean;
}

interface RemoveFromBatchTarget {
  patientId: string;
  patientName: string;
  listId: string;
  listName: string;
}

export const PackageListView: React.FC<Props> = ({
  assignments,
  packages,
  records,
  staffList,
  searchTerm,
  onSearchChange,
  paymentLists,
  rowsPerPage,
  onRowsPerPageChange,
  dateFormat: propDateFormat,
  onDateFormatChange,
  onListFilterChange,
  dateRangeText,
}) => {
  const { isAdmin, can } = useAuth();
  const canAssign = isAdmin || can('assign_service_package');
  const savedViewState = useMemo(() => loadSavedViewState(), []);

  // Selected batch in dropdown ('all' or specific listId)
  const [listFilter, setListFilter] = useState<string>(() => savedViewState.listFilter);
  // 3 independent combobox filters: Gói DVYC, Đợt thanh toán, Ra viện
  const [packageFilter, setPackageFilter] = useState<PackageFilter>(() => savedViewState.packageFilter);
  const [batchFilter, setBatchFilter] = useState<BatchFilter>(() => savedViewState.batchFilter);
  const [dischargeFilter, setDischargeFilter] = useState<DischargeFilter>(() => savedViewState.dischargeFilter);

  // Modals for batch management
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingBatchItems, setMissingBatchItems] = useState<any[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTargetListId, setImportTargetListId] = useState<string | undefined>(undefined);
  // Searchable combobox for batch selection
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [comboboxQuery, setComboboxQuery] = useState('');
  const comboboxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Manage Payment Lists Modal state
  const [manageModalOpen, setManageModalOpen] = useState(false);

  // Lock / Unlock batch confirmation modal
  const [lockBatchTarget, setLockBatchTarget] = useState<PaymentList | null>(null);
  const [lockWarningMessage, setLockWarningMessage] = useState<string | null>(null);
  const [isLockingBatch, setIsLockingBatch] = useState(false);

  // Move patient to another batch modal
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [targetListId, setTargetListId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);

  // Remove patient from batch modal
  const [removeFromBatchTarget, setRemoveFromBatchTarget] = useState<RemoveFromBatchTarget | null>(null);
  const [isRemovingFromBatch, setIsRemovingFromBatch] = useState(false);

  // Table view config
  const [config, setConfig] = useState<ViewConfig>(loadConfig);
  const [configOpen, setConfigOpen] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  // Modal state for assignment
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<SurgeryRecord[]>([]);
  const [modalExistingAssignment, setModalExistingAssignment] = useState<ServicePackageAssignment | null>(null);

  // Delete assignment confirmation modal
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
    const handleCustom = () => {
      refreshDrafts();
      // Khi thêm ca nháp mới vào gói từ DS Phẫu thuật: Tự động chuyển Đợt thanh toán và các bộ lọc sang "Tất cả"
      setListFilter('all');
      setBatchFilter('all');
      setPackageFilter('all');
      setDischargeFilter('all');
      setCurrentPage(1);
    };
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

  // Close config dropdown and combobox on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setConfigOpen(false);
      }
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setComboboxOpen(false);
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

  const currentDateFormat = propDateFormat || config.dateFormat || 'dd/mm/yyyy hh:mm';

  const handleDateFormatChange = (fmt: string) => {
    updateConfig({ dateFormat: fmt });
    if (onDateFormatChange) {
      onDateFormatChange(fmt);
    }
  };

  // Currently selected list object (if viewing a specific batch)
  const currentList = useMemo(() => {
    if (!paymentLists || listFilter === 'all') return undefined;
    return paymentLists.lists.find(l => l.id === listFilter);
  }, [paymentLists, listFilter]);

  // Compute report years range from dateFrom/dateTo/periodKey
  const reportYears = useMemo<number[]>(() => {
    const set = new Set<number>();
    if (paymentLists?.dateFrom) {
      const y = parseInt(paymentLists.dateFrom.slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    if (paymentLists?.dateTo) {
      const y = parseInt(paymentLists.dateTo.slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    if (set.size === 0 && paymentLists?.periodKey) {
      const y = parseInt(paymentLists.periodKey.slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    if (set.size === 0) {
      set.add(new Date().getFullYear());
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [paymentLists?.dateFrom, paymentLists?.dateTo, paymentLists?.periodKey]);

  // Formatted batch name: e.g. "2026 - thang 7 (88 ca)"
  const getBatchFormattedName = useCallback((l: PaymentList) => {
    const y = l.createdAt
      ? new Date(l.createdAt).getFullYear()
      : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
    return `${y} - ${l.name} (${l.items.length} ca)`;
  }, []);

  const selectedLabel = useMemo(() => {
    if (listFilter === 'all' || !currentList) {
      return 'Tất cả DVYC trong DS PT';
    }
    return getBatchFormattedName(currentList);
  }, [listFilter, currentList, getBatchFormattedName]);

  const candidateLists = useMemo(() => {
    if (!paymentLists) return [];
    const inRange = paymentLists.lists.filter(l => {
      const y = l.createdAt ? new Date(l.createdAt).getFullYear() : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
      return reportYears.includes(y);
    });

    if (currentList && !inRange.some(l => l.id === currentList.id)) {
      inRange.unshift(currentList);
    }

    return inRange;
  }, [paymentLists?.lists, reportYears, currentList]);

  const filteredComboboxLists = useMemo(() => {
    if (!paymentLists) return [];
    if (!comboboxQuery.trim()) {
      return candidateLists;
    }
    const q = comboboxQuery.toLowerCase().trim();
    const matched = candidateLists.filter(l => {
      const formatted = getBatchFormattedName(l).toLowerCase();
      return formatted.includes(q) || l.name.toLowerCase().includes(q);
    });

    if (matched.length > 0) return matched;

    return paymentLists.lists.filter(l => {
      const formatted = getBatchFormattedName(l).toLowerCase();
      return formatted.includes(q) || l.name.toLowerCase().includes(q);
    });
  }, [paymentLists, candidateLists, comboboxQuery, getBatchFormattedName]);

  // Auto-fetch surgery records for all patient IDs in the selected batch
  useEffect(() => {
    if (currentList && currentList.items.length > 0 && paymentLists?.loadRecordsForPatients) {
      const pids = currentList.items.map(it => (it.patientId || '').trim()).filter(Boolean);
      paymentLists.loadRecordsForPatients(pids);
    }
  }, [currentList?.id, paymentLists?.loadRecordsForPatients]);

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
    { key: 'ngayBD', label: 'Ngày PT' },
    { key: 'tenKT', label: 'Tên phẫu thuật' },
    ...BASE_STAFF_COLS.map(c => ({ key: c.key, label: c.label })),
    ...extraPositionCols.map(([k, label]) => ({ key: k, label })),
    { key: 'goiDV', label: 'Gói DVYC' },
    ...(paymentLists ? [
      { key: 'raVien', label: 'Ngày RV' },
      { key: 'thanhToan', label: 'Đợt thanh toán' },
    ] : []),
  ], [extraPositionCols, paymentLists]);

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
  // 1. When listFilter === 'all': Only surgeries in the current report date range that have been assigned a service package (or local drafts)
  // 2. When a specific batch is selected: All cases in the batch, matched with surgery data, multiple surgeries grouped & highlighted, missing surgeries alerted via popup
  const enrichedRecords = useMemo<EnrichedRowItem[]>(() => {
    // ── Trường hợp 1: Chọn Đợt thanh toán là "Tất cả" ──
    // "nếu chọn Đợt thanh toán là tất cả => sẽ lấy toàn bộ các ca có áp gói thanh toán DV trong danh sách phẫu thuật trong khoảng thời gian lấy số liệu"
    if (listFilter === 'all') {
      const list: EnrichedRowItem[] = [];
      const seenKeys = new Set<string>();

      // Lấy toàn bộ các ca trong kỳ hiện tại đã được gán gói dịch vụ
      for (const r of records) {
        const rDate = getRecordDateString(r).substring(0, 10);
        const cleanPid = (r.patientId || '').trim().toLowerCase();
        const rKey = buildCompositeKey(r.patientId || '', rDate, r.tenKT || '');

        const a = assignments.find(assign => {
          if (assign.compositeKey === rKey) return true;
          const aPid = (assign.patientId || '').trim().toLowerCase();
          if (cleanPid && aPid && cleanPid === aPid) {
            return normalizeForKey(assign.tenKT || '') === normalizeForKey(r.tenKT || '');
          }
          return false;
        });

        if (a) {
          seenKeys.add(a.compositeKey);
          list.push({ record: r, compositeKey: a.compositeKey, assignment: a });
        }
      }

      // Bản ghi nháp tạm đang gán dở trong phiên (ưu tiên đưa lên đầu danh sách để quan sát ngay các ca mới thêm)
      const draftList: EnrichedRowItem[] = [];
      for (const d of draftRecords) {
        const dDate = getRecordDateString(d).substring(0, 10);
        const dKey = buildCompositeKey(d.patientId || '', dDate, d.tenKT || '');
        if (!seenKeys.has(dKey)) {
          seenKeys.add(dKey);
          draftList.push({ record: d, compositeKey: dKey, assignment: undefined });
        }
      }

      return [...draftList, ...list];
    }

    // ── Trường hợp 2: Chọn một Đợt thanh toán nhất định (currentList) ──
    // "nhưng nếu lấy theo danh sách nhất định (ví dụ như hình là thang 7) thì phải hiển thị đầy đủ các ca có trong danh sách, kể cả trường hợp ca đó không nằm trong DS phẫu thuật trong khoảng thời gian lấy số liệu"
    // "trường hợp ngoại lệ: chỉ hiển thị trên thông báo popup: những ca sau chưa có dữ liệu trong danh sách phẫu thuật..., còn trên bảng ở ứng dụng sẽ không hiển thị những ca này."
    // "Nếu bệnh nhân có nhiều lần mổ: lấy thông tin lần mổ nào được gán gói, nếu chưa lần nào được gán gói: liệt kê cả, xếp gần nhau và cho nền các ca đó màu vàng để user chú ý."
    if (currentList) {
      const list: EnrichedRowItem[] = [];
      const missing: any[] = [];

      // Tập hợp tất cả các bản ghi phẫu thuật đã biết (trong kỳ báo cáo hiện tại + từ kho lưu trữ tra cứu chéo kỳ)
      const allCandidateRecords: SurgeryRecord[] = [];
      const seenCandidateKeys = new Set<string>();

      const addCandidate = (r: any) => {
        if (!r || !r.patientId) return;
        const pid = (r.patientId || '').trim();
        const rDate = (getRecordDateString(r) || r.ngayBD || '').substring(0, 10);
        const ten = (r.tenKT || '').trim();
        const k = `${pid}__${rDate}__${ten}`;
        if (!seenCandidateKeys.has(k)) {
          seenCandidateKeys.add(k);
          allCandidateRecords.push(r as SurgeryRecord);
        }
      };

      (records || []).forEach(addCandidate);
      (paymentLists?.records || []).forEach(addCandidate);

      const allAssignments = paymentLists?.allAssignments || assignments;

      for (const item of currentList.items) {
        const pid = (item.patientId || '').trim();
        const cleanPid = pid.toLowerCase();

        // 1. Tìm tất cả ca phẫu thuật ứng với mã BN này
        const matchingRecords = allCandidateRecords.filter(
          r => (r.patientId || '').trim().toLowerCase() === cleanPid
        );

        // 2. Tìm tất cả phân công gói DV ứng với mã BN này
        const matchingAssignments = allAssignments.filter(
          a => (a.patientId || '').trim().toLowerCase() === cleanPid
        );

        // Trường hợp ngoại lệ: Hoàn toàn không có dữ liệu ca mổ trong hệ thống
        if (matchingRecords.length === 0 && matchingAssignments.length === 0) {
          missing.push(item);
          continue;
        }

        // Quy tắc: Nếu bệnh nhân có nhiều lần mổ: lấy thông tin lần mổ nào được gán gói
        if (matchingAssignments.length > 0) {
          for (const a of matchingAssignments) {
            let rec = matchingRecords.find(r => {
              const rDate = getRecordDateString(r).substring(0, 10);
              if (rDate && buildCompositeKey(r.patientId || '', rDate, r.tenKT || '') === a.compositeKey) return true;
              return normalizeForKey(r.tenKT || '') === normalizeForKey(a.tenKT || '');
            });

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
        } else {
          // Quy tắc: nếu chưa lần nào được gán gói: liệt kê cả, xếp gần nhau và cho nền các ca đó màu vàng để user chú ý.
          const isMulti = matchingRecords.length > 1;
          for (const rec of matchingRecords) {
            const rDate = getRecordDateString(rec).substring(0, 10);
            const key = buildCompositeKey(rec.patientId || '', rDate, rec.tenKT || '');
            list.push({
              record: rec,
              compositeKey: key,
              assignment: undefined,
              isDuplicateUnassigned: isMulti,
            });
          }
        }
      }

      setMissingBatchItems(missing);
      return list;
    }

    setMissingBatchItems([]);
    return [];
  }, [assignments, records, draftRecords, currentList, paymentLists, listFilter]);

  // Xuất danh sách Gói DVYC ra Excel
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = useCallback(async () => {
    if (enrichedRecords.length === 0) return;
    setIsExporting(true);
    try {
      await exportPackageListToExcel({
        items: enrichedRecords,
        packages,
        paymentLists,
        currentList,
        listFilter,
        dateRangeText,
        dateFormat: currentDateFormat,
        extraPositionCols,
      });
    } catch (err) {
      console.error('Lỗi xuất Excel Gói DVYC:', err);
    } finally {
      setIsExporting(false);
    }
  }, [
    enrichedRecords,
    packages,
    paymentLists,
    currentList,
    listFilter,
    dateRangeText,
    currentDateFormat,
    extraPositionCols,
  ]);

  // Chỉ mở modal thông báo ca thiếu dữ liệu phẫu thuật khi vừa import/paste lần đầu (không tự động bung khi mở lại danh sách đã lưu)
  const justImportedBatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentList && justImportedBatchIdRef.current === currentList.id) {
      justImportedBatchIdRef.current = null;
      if (missingBatchItems.length > 0) {
        setShowMissingModal(true);
      }
    }
  }, [currentList?.id, missingBatchItems]);

  // Compute counts for the 3 filter comboboxes
  const stats = useMemo(() => {
    let assignedCount = 0;
    let unassignedCount = 0;
    let inBatchCount = 0;
    let noBatchCount = 0;
    let dischargedCount = 0;
    let notDischargedCount = 0;

    for (const { record: r, assignment: a } of enrichedRecords) {
      const pid = (r.patientId || '').trim();
      const hasBatch = Boolean(currentList?.items.some(i => i.patientId.trim() === pid) || paymentLists?.membershipIndex.has(pid));
      const dc = paymentLists?.discharge[pid];

      if (a) assignedCount++;
      else unassignedCount++;

      if (hasBatch) inBatchCount++;
      else noBatchCount++;

      if (dc?.ngayRa) dischargedCount++;
      else notDischargedCount++;
    }

    return {
      total: enrichedRecords.length,
      assignedCount,
      unassignedCount,
      inBatchCount,
      noBatchCount,
      dischargedCount,
      notDischargedCount,
    };
  }, [enrichedRecords, currentList, paymentLists]);

  // Filter + search with 3 comboboxes
  const filtered = useMemo(() => {
    let result = enrichedRecords;

    // 1. Gói DVYC: Tất cả / Đã gán / Chưa gán
    if (packageFilter === 'assigned') {
      result = result.filter(r => Boolean(r.assignment));
    } else if (packageFilter === 'unassigned') {
      result = result.filter(r => !r.assignment);
    }

    // 2. Đợt thanh toán: Tất cả / Đã có đợt TT / Chưa có đợt TT
    if (batchFilter === 'in_batch') {
      result = result.filter(({ record: r }) => {
        const pid = (r.patientId || '').trim();
        return Boolean(currentList?.items.some(i => i.patientId.trim() === pid) || paymentLists?.membershipIndex.has(pid));
      });
    } else if (batchFilter === 'no_batch') {
      result = result.filter(({ record: r }) => {
        const pid = (r.patientId || '').trim();
        return !currentList?.items.some(i => i.patientId.trim() === pid) && !paymentLists?.membershipIndex.has(pid);
      });
    }

    // 3. Ra viện: Tất cả / Đã RV / Chưa có thông tin
    if (dischargeFilter === 'discharged') {
      result = result.filter(({ record: r }) => {
        const pid = (r.patientId || '').trim();
        return Boolean(paymentLists?.discharge[pid]?.ngayRa);
      });
    } else if (dischargeFilter === 'not_discharged') {
      result = result.filter(({ record: r }) => {
        const pid = (r.patientId || '').trim();
        return !paymentLists?.discharge[pid]?.ngayRa;
      });
    }

    // Search query
    if (searchTerm.trim()) {
      const terms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(({ record: r, assignment: a }) => {
        const matched = a
          ? (packages.find(p => p.id && a.packageId && p.id === a.packageId) ||
             packages.find(p => p.name && a.packageName && p.name.trim().toLowerCase() === a.packageName.trim().toLowerCase()))
          : undefined;
        const pkgShort = matched?.shortName || a?.packageShortName || '';
        const dept = (r as any).khoa || (r as any).department || '';
        const text = `${r.patientId} ${r.patientName} ${r.ngayBD || ''} ${r.tenKT} ${r.ptChinh} ${r.ptPhu} ${a?.packageName || ''} ${pkgShort} ${dept}`.toLowerCase();
        return terms.every(t => text.includes(t));
      });
    }
    return result;
  }, [enrichedRecords, packageFilter, batchFilter, dischargeFilter, searchTerm, packages, paymentLists, currentList]);

  // Pagination state (đồng bộ giao diện & trải nghiệm với tab DS PT)
  const [currentPage, setCurrentPage] = useState<number>(() => savedViewState.currentPage);
  const [localRowsPerPage, setLocalRowsPerPage] = useState(50);
  const currentRowsPerPage = rowsPerPage !== undefined ? rowsPerPage : localRowsPerPage;

  // Persist view state to localStorage whenever listFilter, packageFilter, batchFilter, dischargeFilter, or currentPage change
  useEffect(() => {
    saveViewState({ listFilter, packageFilter, batchFilter, dischargeFilter, currentPage });
    onListFilterChange?.(listFilter);
    window.dispatchEvent(new CustomEvent('package_list_filter_changed', { detail: listFilter }));
  }, [listFilter, packageFilter, batchFilter, dischargeFilter, currentPage, onListFilterChange]);

  // Tự động về trang 1 khi đổi từ khóa tìm kiếm, bộ lọc hoặc đổi đợt thanh toán (bỏ qua lần đầu mount)
  const isInitialMountRef = useRef(true);
  const prevFilterDepsRef = useRef({ searchTerm, packageFilter, batchFilter, dischargeFilter, listFilter });

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (
      prevFilterDepsRef.current.searchTerm !== searchTerm ||
      prevFilterDepsRef.current.packageFilter !== packageFilter ||
      prevFilterDepsRef.current.batchFilter !== batchFilter ||
      prevFilterDepsRef.current.dischargeFilter !== dischargeFilter ||
      prevFilterDepsRef.current.listFilter !== listFilter
    ) {
      prevFilterDepsRef.current = { searchTerm, packageFilter, batchFilter, dischargeFilter, listFilter };
      setCurrentPage(1);
    }
  }, [searchTerm, packageFilter, batchFilter, dischargeFilter, listFilter]);

  // Fallback nếu đợt thanh toán đã lưu bị xóa khỏi danh sách
  useEffect(() => {
    if (listFilter !== 'all' && paymentLists && paymentLists.lists.length > 0) {
      const exists = paymentLists.lists.some(l => l.id === listFilter);
      if (!exists) {
        setListFilter('all');
        setCurrentPage(1);
      }
    }
  }, [listFilter, paymentLists?.lists]);

  const totalPages = Math.ceil(filtered.length / currentRowsPerPage) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * currentRowsPerPage;
  const paginatedRows = useMemo(() => {
    return filtered.slice(startIndex, startIndex + currentRowsPerPage);
  }, [filtered, startIndex, currentRowsPerPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleActiveFilterChange = (nextFilter: ActiveFilter) => {
    setActiveFilter(nextFilter);
    setCurrentPage(1);
  };

  const assignedCount = stats.assignedCount;
  const unassignedCount = stats.unassignedCount;

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
  const handleRequestDeleteAssignment = (e: React.MouseEvent, a: ServicePackageAssignment, patientName: string, patientId?: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteTarget({
      type: 'assignment',
      id: a.id,
      patientName: patientName || a.patientName,
      compositeKey: a.compositeKey,
      patientId: patientId || a.patientId,
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
      patientId: r.patientId || '',
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'assignment') {
        await deleteAssignment(deleteTarget.id);
      } else {
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

      // Nghiệp vụ: Ngoài việc hủy gán gói, bỏ luôn ca đó ra khỏi bất kỳ danh sách đợt thanh toán nào
      const pid = (deleteTarget.patientId || '').trim();
      if (paymentLists && pid) {
        for (const pl of paymentLists.lists) {
          if (pl.items.some(i => i.patientId.trim() === pid)) {
            try {
              await removeItem(pl.id, pid, paymentLists.userName);
            } catch (err) {
              console.error(`[PackageListView] Failed to remove ${pid} from list ${pl.id}:`, err);
            }
          }
        }
      }

      setDeleteTarget(null);
    } catch (err) {
      console.error('[PackageListView] delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRequestLock = (list: PaymentList) => {
    if (!paymentLists) return;
    const recon = reconcileItems(list.items, {
      assignments: paymentLists.allAssignments,
      records: paymentLists.records,
    });
    const lockable = canLock(recon);
    if (!lockable) {
      const mismatchCount = recon.filter(r => r.status === 'nameMismatch').length;
      setLockWarningMessage(`Đợt này còn ${mismatchCount} ca lệch họ tên giữa danh sách TCKT và hệ thống. Vui lòng kiểm tra lại trước khi chốt.`);
    } else {
      setLockWarningMessage(null);
    }
    setLockBatchTarget(list);
  };

  const handleConfirmLock = async () => {
    if (!lockBatchTarget || !paymentLists) return;
    setIsLockingBatch(true);
    try {
      await lockList(lockBatchTarget.id, paymentLists.userName, true);
      setLockBatchTarget(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể chốt đợt thanh toán.');
    } finally {
      setIsLockingBatch(false);
    }
  };

  const handleUnlockBatch = async (list: PaymentList) => {
    if (!paymentLists) return;
    try {
      await unlockList(list.id);
    } catch (err: any) {
      alert(err?.message || 'Không thể mở khóa đợt thanh toán.');
    }
  };

  const handleOpenMoveModal = (
    patientId: string,
    patientName: string,
    batch: { listId: string; listName: string; isLocked: boolean } | null
  ) => {
    const fromListId = batch?.listId;
    const available = (paymentLists?.lists || []).filter(
      l => l.status !== 'locked' && l.id !== fromListId
    );
    setMoveTarget({
      patientId,
      patientName,
      fromListId,
      fromListName: batch?.listName,
      isFromLocked: batch?.isLocked,
    });
    setTargetListId(available[0]?.id || '');
  };

  const handleConfirmMove = async () => {
    if (!moveTarget || !targetListId) return;
    setIsMoving(true);
    try {
      if (moveTarget.fromListId) {
        await moveItem(moveTarget.fromListId, targetListId, moveTarget.patientId);
      } else {
        await addItems(targetListId, [
          { patientId: moveTarget.patientId, patientName: moveTarget.patientName, addedManually: true },
        ]);
      }
      setMoveTarget(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể chuyển đợt thanh toán.');
    } finally {
      setIsMoving(false);
    }
  };

  const handleRequestRemoveFromBatch = (
    patientId: string,
    patientName: string,
    listId: string,
    listName: string,
    isLocked: boolean
  ) => {
    if (isLocked) {
      alert(`Đợt thanh toán "${listName}" đã chốt, không thể xóa ca khỏi đợt.`);
      return;
    }
    setRemoveFromBatchTarget({
      patientId,
      patientName,
      listId,
      listName,
    });
  };

  const handleConfirmRemoveFromBatch = async () => {
    if (!removeFromBatchTarget) return;
    setIsRemovingFromBatch(true);
    try {
      await removeItem(removeFromBatchTarget.listId, removeFromBatchTarget.patientId);
      setRemoveFromBatchTarget(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa ca khỏi đợt thanh toán.');
    } finally {
      setIsRemovingFromBatch(false);
    }
  };

  const handleAddPatientToBatch = async (patientId: string, patientName: string) => {
    if (!currentList || currentList.status === 'locked') return;
    try {
      await addItems(currentList.id, [{ patientId, patientName, addedManually: true }]);
    } catch (err: any) {
      alert(err?.message || 'Không thể thêm ca vào đợt.');
    }
  };

  const handleRemovePatientFromBatch = async (patientId: string) => {
    if (!currentList || currentList.status === 'locked') return;
    try {
      await removeItem(currentList.id, patientId);
    } catch (err: any) {
      alert(err?.message || 'Không thể loại ca khỏi đợt.');
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
    if (isColVisible('ngayBD')) count++;
    if (isColVisible('tenKT')) count++;
    BASE_STAFF_COLS.forEach(c => { if (isColVisible(c.key)) count++; });
    extraPositionCols.forEach(([k]) => { if (isColVisible(k)) count++; });
    if (isColVisible('goiDV')) count++;
    if (paymentLists) {
      if (isColVisible('raVien')) count++;
      if (isColVisible('thanhToan')) count++;
    }
    return count;
  }, [config.hiddenCols, extraPositionCols, paymentLists]);

  return (
    <div className="space-y-2.5 font-inter">
      {/* ─── HÀNG 1: QUẢN LÝ ĐỢT THANH TOÁN (PAYMENT BATCH TOOLBAR) ─── */}
      {paymentLists && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-slate-300 shadow-xs font-inter">
          {/* Left: Dropdown chọn đợt + Thao tác đợt */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-800 shrink-0">
              Đợt thanh toán:
            </span>

            {/* Searchable Combobox chọn Đợt thanh toán (gõ tự do + lọc theo năm) */}
            <div className="relative" ref={comboboxRef}>
              <div
                onClick={() => {
                  if (!comboboxOpen) {
                    setComboboxOpen(true);
                  }
                  inputRef.current?.focus();
                }}
                className={`flex h-8.5 w-72 sm:w-80 items-center justify-between gap-1.5 rounded-lg border bg-white px-2.5 shadow-2xs cursor-text transition-all ${
                  comboboxOpen
                    ? 'border-teal-600 ring-2 ring-teal-500/20'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <div className="shrink-0 text-slate-500 flex items-center pointer-events-none">
                  {comboboxOpen && comboboxQuery ? (
                    <Search className="h-3.5 w-3.5 text-teal-600" />
                  ) : listFilter === 'all' ? (
                    <FolderKanban className="h-3.5 w-3.5 text-teal-600" />
                  ) : currentList?.status === 'locked' ? (
                    <Lock className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-slate-600" />
                  )}
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={comboboxOpen ? comboboxQuery : selectedLabel}
                  onChange={e => {
                    setComboboxQuery(e.target.value);
                    if (!comboboxOpen) setComboboxOpen(true);
                  }}
                  onFocus={() => {
                    if (!comboboxOpen) setComboboxOpen(true);
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    if (!comboboxOpen) setComboboxOpen(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setComboboxOpen(false);
                      setComboboxQuery('');
                      inputRef.current?.blur();
                    }
                  }}
                  placeholder={selectedLabel}
                  style={{
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    padding: 0,
                    margin: 0,
                    backgroundColor: 'transparent',
                  }}
                  className="w-full !border-0 !border-none !outline-none !ring-0 !shadow-none !bg-transparent !p-0 !m-0 text-xs font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 cursor-text"
                />

                <div className="flex items-center gap-0.5 text-slate-500 shrink-0">
                  {comboboxQuery && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setComboboxQuery('');
                        inputRef.current?.focus();
                      }}
                      className="p-1 text-slate-400 hover:text-slate-800 rounded transition-colors cursor-pointer"
                      title="Xóa tìm kiếm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (comboboxOpen) {
                        setComboboxOpen(false);
                        setComboboxQuery('');
                      } else {
                        setComboboxOpen(true);
                        inputRef.current?.focus();
                      }
                    }}
                    className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                    title={comboboxOpen ? "Đóng danh sách" : "Mở danh sách đợt thanh toán"}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${comboboxOpen ? 'rotate-180 text-teal-700' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Dropdown Options Menu */}
              {comboboxOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-84 sm:w-96 overflow-y-auto rounded-xl border border-slate-300 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                  <div className="p-1">
                    {/* Option: Tất cả */}
                    <button
                      type="button"
                      onClick={() => {
                        setListFilter('all');
                        setCurrentPage(1);
                        setComboboxOpen(false);
                        setComboboxQuery('');
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs text-left transition-colors ${
                        listFilter === 'all'
                          ? 'bg-teal-50 font-bold text-teal-900 border border-teal-200'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-teal-600" />
                        <span>Tất cả DVYC trong DS PT</span>
                      </div>
                      {listFilter === 'all' && <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />}
                    </button>
                  </div>

                  <div className="p-1">
                    {/* Header section */}
                    <div className="mt-1 mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                      <span>Đợt trong năm {reportYears.join(', ')}</span>
                      <span className="font-semibold text-slate-400">({candidateLists.length} đợt)</span>
                    </div>

                    {/* List items */}
                    {filteredComboboxLists.length === 0 ? (
                      <div className="px-2.5 py-4 text-center text-xs text-slate-400 italic">
                        Không tìm thấy đợt thanh toán phù hợp
                      </div>
                    ) : (
                      filteredComboboxLists.map(l => {
                        const isSelected = listFilter === l.id;
                        const formattedName = getBatchFormattedName(l);

                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setListFilter(l.id);
                              setCurrentPage(1);
                              setComboboxOpen(false);
                              setComboboxQuery('');
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors ${
                              isSelected
                                ? 'bg-teal-50 font-bold text-teal-900 border border-teal-200'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {l.status === 'locked' ? (
                                <Lock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              )}
                              <span className="truncate">{formattedName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                              {l.status === 'locked' && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  Đã chốt
                                </span>
                              )}
                              {isSelected && <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Thao tác theo ngữ cảnh khi chọn 1 đợt cụ thể */}
            {currentList && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                {currentList.status === 'draft' ? (
                  <>
                    {paymentLists?.canManage && (
                      <button
                        onClick={() => {
                          setImportTargetListId(currentList.id);
                          setImportModalOpen(true);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-colors shadow-2xs"
                        title="Nhập thêm danh sách TCKT vào đợt nháp này"
                      >
                        <Upload className="h-3.5 w-3.5 text-slate-600" />
                        <span>Nhập thêm TCKT</span>
                      </button>
                    )}

                    {paymentLists.canManage && (
                      <button
                        onClick={() => handleRequestLock(currentList)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 text-xs font-bold text-white shadow-2xs transition-colors"
                        title="Chốt đợt thanh toán gói dịch vụ"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>Chốt đợt</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-400 px-2.5 text-xs font-bold text-emerald-800 shadow-2xs">
                      <Lock className="h-3.5 w-3.5" />
                      <span>Đã chốt{currentList.lockedBy ? ` (${currentList.lockedBy})` : ''}</span>
                    </span>

                    {paymentLists.canManage && (
                      <button
                        onClick={() => handleUnlockBatch(currentList)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-colors shadow-2xs"
                        title="Mở khóa đợt thanh toán để chỉnh sửa"
                      >
                        <Unlock className="h-3.5 w-3.5 text-slate-600" />
                        <span>Mở khóa</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Phân cách nhẹ */}
            <div className="h-5 w-px bg-slate-300 mx-0.5 hidden sm:block" />

            {/* Nút Tạo đợt mới (đặt sau chốt đợt theo yêu cầu) */}
            {paymentLists?.canManage && (
              <button
                onClick={() => {
                  setImportTargetListId(undefined);
                  setImportModalOpen(true);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-3 text-xs font-bold text-white shadow-2xs transition-colors"
                title="Tạo đợt thanh toán mới từ danh sách TCKT"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tạo đợt mới</span>
              </button>
            )}

            {/* Nút DS đợt thanh toán */}
            <button
              onClick={() => setManageModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 shadow-2xs transition-colors"
              title="Quản lý danh sách các đợt thanh toán, đổi tên và lịch sử chỉnh sửa"
            >
              <ListFilter className="h-3.5 w-3.5 text-slate-600" />
              <span>DS đợt thanh toán</span>
            </button>
          </div>

          {/* Right: Thông báo ca thiếu dữ liệu PT nếu có */}
          {currentList && missingBatchItems.length > 0 && (
            <button
              onClick={() => setShowMissingModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 shadow-2xs transition-colors shrink-0"
              title="Xem danh sách các ca trong đợt chưa có dữ liệu phẫu thuật"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span>{missingBatchItems.length} ca chưa có dữ liệu PT</span>
            </button>
          )}
        </div>
      )}

      {/* ─── HÀNG 2: BỘ LỌC TINH GỌN & TÌM KIẾM & CẤU HÌNH ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-2xs">
        {/* Left: 3 Combobox Filters (Gói DVYC, Đợt thanh toán, Ra viện) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Combobox 1: Gói DVYC */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg shadow-2xs">
            <span className="text-[11px] font-bold text-gray-600 flex items-center gap-1 whitespace-nowrap">
              <Package className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              <span>Gói DVYC:</span>
            </span>
            <select
              value={packageFilter}
              onChange={e => {
                setPackageFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold shadow-2xs outline-none transition-colors cursor-pointer bg-white ${
                packageFilter !== 'all'
                  ? 'border-teal-500 bg-teal-50 text-teal-800 font-bold ring-1 ring-teal-400'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              <option value="all">Tất cả ({stats.total})</option>
              <option value="assigned">Đã gán ({stats.assignedCount})</option>
              <option value="unassigned">Chưa gán ({stats.unassignedCount})</option>
            </select>
          </div>

          {/* Combobox 2: Đợt thanh toán */}
          {paymentLists && (
            <div className="flex items-center gap-1.5 bg-blue-50/50 border border-blue-200/80 px-2 py-1 rounded-lg shadow-2xs">
              <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1 whitespace-nowrap">
                <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span>Đợt thanh toán:</span>
              </span>
              <select
                value={batchFilter}
                onChange={e => {
                  setBatchFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className={`rounded-md border px-2 py-0.5 text-xs font-semibold shadow-2xs outline-none transition-colors cursor-pointer bg-white ${
                  batchFilter !== 'all'
                    ? 'border-blue-500 bg-blue-50 text-blue-800 font-bold ring-1 ring-blue-400'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <option value="all">Tất cả ({stats.total})</option>
                <option value="in_batch">Đã có đợt TT ({stats.inBatchCount})</option>
                <option value="no_batch">Chưa có đợt TT ({stats.noBatchCount})</option>
              </select>
            </div>
          )}

          {/* Combobox 3: Ra viện */}
          {paymentLists && (
            <div className="flex items-center gap-1.5 bg-emerald-50/50 border border-emerald-200/80 px-2 py-1 rounded-lg shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-900 flex items-center gap-1 whitespace-nowrap">
                <Clock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Ra viện:</span>
              </span>
              <select
                value={dischargeFilter}
                onChange={e => {
                  setDischargeFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className={`rounded-md border px-2 py-0.5 text-xs font-semibold shadow-2xs outline-none transition-colors cursor-pointer bg-white ${
                  dischargeFilter !== 'all'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold ring-1 ring-emerald-400'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <option value="all">Tất cả ({stats.total})</option>
                <option value="discharged">Đã RV ({stats.dischargedCount})</option>
                <option value="not_discharged">Chưa có thông tin ({stats.notDischargedCount})</option>
              </select>
            </div>
          )}

          {/* Reset Filters button if any filter is active */}
          {(packageFilter !== 'all' || batchFilter !== 'all' || dischargeFilter !== 'all') && (
            <button
              onClick={() => {
                setPackageFilter('all');
                setBatchFilter('all');
                setDischargeFilter('all');
                setCurrentPage(1);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors shrink-0 shadow-2xs"
              title="Đặt lại tất cả 3 bộ lọc về Tất cả"
            >
              <X className="h-3 w-3" />
              <span>Đặt lại lọc</span>
            </button>
          )}
        </div>

        {/* Right: Search + Font Size + Cấu hình */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative w-56 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Tìm mã KCB, tên BN, PT, kíp..."
              className="w-full pl-8 pr-7 py-1 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 outline-none bg-white shadow-2xs"
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

          {/* Font size control */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white shadow-2xs">
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

          {/* Nút Xuất Excel */}
          <button
            onClick={handleExportExcel}
            disabled={isExporting || enrichedRecords.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 text-xs font-semibold transition-all shadow-2xs cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Xuất danh sách gói dịch vụ yêu cầu ra file Excel"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>{isExporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
          </button>

          {/* Config dropdown (Ẩn/hiện cột + Mật độ bảng) */}
          <div className="relative" ref={configRef}>
            <button
              onClick={() => setConfigOpen(!configOpen)}
              title="Cấu hình hiển thị, ngày giờ và mật độ bảng"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-all shadow-2xs ${
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
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50 space-y-3">
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
                              ? 'bg-white text-teal-700 shadow-2xs font-semibold'
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

                {/* Date format selector (tương tự tab DS Phẫu thuật) */}
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-teal-600" />
                    <span>Định dạng ngày giờ (Ngày PT)</span>
                  </span>
                  <div className="grid grid-cols-2 gap-1 bg-gray-100 p-0.5 rounded-lg">
                    {DATE_FORMATS.map(fmt => {
                      const isActive = currentDateFormat === fmt;
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => handleDateFormatChange(fmt)}
                          className={`flex items-center justify-center py-1 px-1 rounded text-[11px] font-medium transition-all ${
                            isActive
                              ? 'bg-white text-teal-700 shadow-2xs font-semibold'
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          <span>{fmt}</span>
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

          {/* Record count indicator */}
          <span className="text-xs text-gray-500 font-bold shrink-0">
            {filtered.length} ca
          </span>
        </div>
      </div>

      {/* ─── MAIN UNIFIED DATA TABLE ─── */}
      <div className="border border-gray-200 rounded-xl bg-white shadow-2xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
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
                <th className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 w-[115px]`}>Họ tên</th>
              )}
              {isColVisible('ngayBD') && (
                <th className={`px-1.5 ${cellPy} text-gray-700 border-r border-gray-100 text-center w-[90px]`}>
                  Ngày PT
                </th>
              )}
              {isColVisible('tenKT') && (
                <th className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 w-[220px]`}>Tên phẫu thuật</th>
              )}
              {/* Base surgery staff columns */}
              {BASE_STAFF_COLS.map(col => isColVisible(col.key) && (
                <th key={col.key} className={`px-1.5 ${cellPy} text-gray-500 border-r border-gray-100 text-center w-[88px]`}>
                  {col.label}
                </th>
              ))}
              {/* Dynamic extra positions from packages */}
              {extraPositionCols.map(([key, label]) => isColVisible(key) && (
                <th key={key} className={`px-1.5 ${cellPy} text-teal-700 border-r border-gray-100 text-center w-[88px] bg-teal-50/50`}>
                  {label}
                </th>
              ))}
              {/* Package column */}
              {isColVisible('goiDV') && (
                <th className={`px-2.5 ${cellPy} text-teal-800 border-r border-gray-100 bg-teal-50/30 w-[150px]`}>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                    <span>Gói DVYC</span>
                  </div>
                </th>
              )}
              {/* Dedicated BQ Discharge Column */}
              {paymentLists && isColVisible('raVien') && (
                <th className={`px-2 ${cellPy} text-emerald-800 border-r border-gray-100 bg-emerald-50/40 text-center w-[125px]`}>
                  <div className="flex flex-col items-center leading-tight">
                    <span className="font-bold">Ngày RV</span>
                    <span className="text-[10px] font-normal text-emerald-700">(Với BN BHYT)</span>
                  </div>
                </th>
              )}
              {/* Dedicated Service Package Payment Status Column */}
              {paymentLists && isColVisible('thanhToan') && (
                <th className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 w-[150px]`}>
                  Đợt thanh toán
                </th>
              )}
              {/* Action column */}
              <th className={`px-1.5 ${cellPy} w-[115px] text-center text-gray-500`}>Thao tác</th>
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
                    ? 'Không tìm thấy ca phẫu thuật phù hợp với từ khóa.'
                    : 'Chưa có ca phù hợp với bộ lọc hiện tại.'}
                </td>
              </tr>
            ) : paginatedRows.map(({ record: r, compositeKey, assignment: a, isDuplicateUnassigned }, idx) => {
              const matchedPkg = a
                ? (packages.find(p => p.id && a.packageId && p.id === a.packageId) ||
                   packages.find(p => p.name && a.packageName && p.name.trim().toLowerCase() === a.packageName.trim().toLowerCase()))
                : undefined;
              const packageDisplay = a
                ? (matchedPkg?.shortName?.trim() ||
                   (a.packageShortName && a.packageShortName.trim() !== a.packageName.trim() ? a.packageShortName.trim() : '') ||
                   a.packageName)
                : '';

              const pid = (r.patientId || '').trim();
              const inCurrentBatch = currentList?.items.some(i => i.patientId.trim() === pid);
              const m = paymentLists?.membershipIndex.get(pid);
              const dc = paymentLists?.discharge[pid];
              const isMultiUnassigned = Boolean(isDuplicateUnassigned);

              // Xác định thông tin đợt thanh toán của ca này
              const batchInfo = currentList
                ? { listId: currentList.id, listName: currentList.name, isLocked: currentList.status === 'locked' }
                : (m ? { listId: m.listId, listName: m.listName, isLocked: m.status === 'locked' } : null);

              return (
                <tr
                  key={compositeKey}
                  className={`transition-colors ${
                    isMultiUnassigned
                      ? 'bg-amber-50/80 hover:bg-amber-100/80 border-l-4 border-l-amber-500'
                      : !a
                      ? 'bg-emerald-50/40 hover:bg-emerald-50/70 border-l-4 border-l-teal-500'
                      : a
                      ? 'bg-teal-50/20 hover:bg-teal-50/40'
                      : 'hover:bg-gray-50/50'
                  }`}
                >
                  {/* STT */}
                  <td className={`px-2 ${cellPy} text-center text-gray-400 border-r border-gray-100 font-mono`}>
                    {startIndex + idx + 1}
                  </td>

                  {/* Mã KCB */}
                  {isColVisible('patientId') && (
                    <td className={`px-2 ${cellPy} font-mono text-gray-600 border-r border-gray-100 text-[0.9em]`}>
                      {r.patientId}
                    </td>
                  )}

                  {/* Họ tên */}
                  {isColVisible('patientName') && (
                    <td className={`px-2 ${cellPy} font-semibold text-gray-800 border-r border-gray-100 whitespace-normal break-words w-[115px] leading-snug`}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{r.patientName}</span>
                        {!a && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300"
                            title="Ca vừa được thêm vào Gói DV, chưa gán gói"
                          >
                            Mới thêm
                          </span>
                        )}
                        {isMultiUnassigned && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"
                            title="Bệnh nhân có nhiều ca phẫu thuật trong dữ liệu chưa gán gói"
                          >
                            Nhiều ca mổ
                          </span>
                        )}
                      </div>
                      {(r as any).department && (
                        <div className="text-[10px] text-teal-600 font-normal">
                          {((r as any).department)}
                        </div>
                      )}
                    </td>
                  )}

                  {/* Ngày PT (lấy từ Ngày bắt đầu phẫu thuật r.ngayBD) */}
                  {isColVisible('ngayBD') && (
                    <td className={`px-1.5 ${cellPy} text-center font-mono text-gray-600 border-r border-gray-100 text-[0.84em] w-[90px]`}>
                      {r.ngayBD ? (
                        (() => {
                          const formatted = formatDate(r.ngayBD, currentDateFormat);
                          const parts = formatted.split(' ');
                          if (parts.length === 2) {
                            return (
                              <div className="leading-tight">
                                <div>{parts[0]}</div>
                                <div className="text-[0.82em] text-gray-500">{parts[1]}</div>
                              </div>
                            );
                          }
                          return <div className="leading-tight whitespace-nowrap">{formatted}</div>;
                        })()
                      ) : '—'}
                    </td>
                  )}

                  {/* Tên phẫu thuật */}
                  {isColVisible('tenKT') && (
                    <td className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 whitespace-normal break-words w-[220px] leading-snug`}>
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
                        className={`px-1.5 ${cellPy} text-center border-r border-gray-100 whitespace-normal w-[88px] ${
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
                      return <td key={key} className={`px-1.5 ${cellPy} text-center border-r border-gray-100 bg-teal-50/10 w-[88px]`}></td>;
                    }
                    const sa = a.staffAssignments.find(s => s.positionKey === key);
                    return (
                      <td key={key} className={`px-1.5 ${cellPy} text-center border-r border-gray-100 bg-teal-50/10 whitespace-normal w-[88px]`}>
                        <span className="text-teal-700 font-semibold">
                          {sa?.staffName || ''}
                        </span>
                      </td>
                    );
                  })}

                  {/* Package name column */}
                  {isColVisible('goiDV') && (
                    <td className={`px-2 ${cellPy} border-r border-gray-100 bg-teal-50/10 whitespace-normal w-[150px]`}>
                      {a ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded text-[0.85em] font-semibold border border-teal-200"
                          title={a.packageName ? `${a.packageName}${packageDisplay && packageDisplay !== a.packageName ? ` (${packageDisplay})` : ''}` : ''}
                        >
                          <Package className="h-3 w-3 shrink-0" />
                          <span>{packageDisplay}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAdd(r)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-300 transition-colors shadow-2xs cursor-pointer"
                          title="Gán gói DVYC cho ca này"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Gán gói DV</span>
                        </button>
                      )}
                    </td>
                  )}

                  {/* Cột Ngày RV */}
                  {paymentLists && isColVisible('raVien') && (
                    <td className={`px-2 ${cellPy} border-r border-gray-100 whitespace-nowrap text-center`}>
                      {dc && dc.ngayRa ? (
                        <span
                          className="text-xs text-gray-800 font-mono font-medium"
                          title={`Ngày ra viện BHYT: ${formatDischargeDate(dc.ngayRa)}`}
                        >
                          {formatDischargeDate(dc.ngayRa)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">
                          (chưa có thông tin)
                        </span>
                      )}
                    </td>
                  )}

                  {/* Cột Thanh toán gói DV */}
                  {paymentLists && isColVisible('thanhToan') && (
                    <td className={`px-2 ${cellPy} border-r border-gray-100 whitespace-normal w-[150px]`}>
                      {m ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                            m.status === 'locked'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-blue-50 border-blue-200 text-blue-700'
                          }`}
                          title={m.status === 'locked' ? 'Đợt đã chốt thanh toán' : 'Đang nằm trong đợt nháp'}
                        >
                          {m.status === 'locked' ? <Lock className="h-3 w-3 shrink-0" /> : '📝'}
                          <span className="truncate max-w-[120px]">{m.listName}</span>
                        </span>
                      ) : a ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          <span>⚠️</span>
                          <span>Chưa thanh toán gói DV</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* Cột Thao tác */}
                  <td className={`px-1.5 ${cellPy} text-center w-[115px]`}>
                    <div className="flex items-center justify-center gap-0.5">
                      {/* 1. icon gán gói: Gán gói dịch vụ yêu cầu cho ca này */}
                      {!a && canAssign && (
                        <button
                          onClick={() => handleAdd(r)}
                          className="p-1 rounded text-teal-600 hover:bg-teal-50 hover:text-teal-800 transition-colors"
                          title="Gán gói dịch vụ yêu cầu cho ca này"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* 2. icon edit: Chỉnh sửa thông tin gói, nhân lực */}
                      {a && canAssign && (
                        <button
                          onClick={() => handleEdit(r, a)}
                          className="p-1 rounded hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors"
                          title="Chỉnh sửa thông tin gói, nhân lực"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* 3. icon di chuyển: Chuyển ca này sang đợt thanh toán khác */}
                      {paymentLists && paymentLists.canManage && (
                        <button
                          onClick={() => handleOpenMoveModal(pid, r.patientName || '', batchInfo)}
                          className="p-1 rounded text-gray-500 hover:bg-sky-50 hover:text-sky-600 transition-colors"
                          title="Chuyển ca này sang đợt thanh toán khác"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* 4. icon xóa khỏi gói: Xóa ca này ra khỏi đợt thanh toán này (vẫn giữ gói yêu cầu) */}
                      {paymentLists && paymentLists.canManage && batchInfo && (
                        <button
                          onClick={() =>
                            handleRequestRemoveFromBatch(
                              pid,
                              r.patientName || '',
                              batchInfo.listId,
                              batchInfo.listName,
                              batchInfo.isLocked
                            )
                          }
                          className={`p-1 rounded transition-colors ${
                            batchInfo.isLocked
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                          }`}
                          title="Xóa ca này ra khỏi đợt thanh toán này (vẫn giữ gói yêu cầu)"
                          disabled={batchInfo.isLocked}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* 5. icon xóa gói: Hủy bỏ gói yêu cầu khỏi ca này */}
                      {canAssign && (a ? (
                        <button
                          onClick={(e) => handleRequestDeleteAssignment(e, a, r.patientName, r.patientId || a.patientId)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Hủy bỏ gói yêu cầu khỏi ca này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : compositeKey.startsWith('draft_') ? (
                        <button
                          onClick={(e) => handleRequestRemoveDraft(e, r, compositeKey)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Hủy bỏ gói yêu cầu khỏi ca này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {/* Footer: Pagination (đồng bộ giao diện với tab DS PT) */}
        {filtered.length > 0 && (
          <div className="p-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 rounded-b-xl text-xs">
            <div className="flex items-center gap-2 text-gray-600">
              <span>Hiển thị</span>
              <select
                value={currentRowsPerPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (onRowsPerPageChange) {
                    onRowsPerPageChange(val);
                  } else {
                    setLocalRowsPerPage(val);
                  }
                  setCurrentPage(1);
                }}
                className="bg-white border border-gray-300 rounded-md px-3 pr-8 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[70px] relative z-20 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="hidden sm:inline-block ml-2 text-gray-400">
                | {startIndex + 1}-{Math.min(startIndex + currentRowsPerPage, filtered.length)} / {filtered.length} ca
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 cursor-pointer transition-colors"
                title="Trang trước"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <PageCombobox
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                size="sm"
                placement="top"
              />
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 cursor-pointer transition-colors"
                title="Trang tiếp"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {assignedCount > 0 && (
        <div className="flex items-center gap-4 px-3 py-2 bg-teal-50/70 rounded-lg border border-teal-200 text-xs">
          <span className="font-semibold text-teal-800">Tổng kết gói DVYC:</span>
          <span className="text-teal-700 font-medium">{assignedCount} ca đã gán gói</span>
          <span className="text-teal-800 font-mono font-bold ml-auto text-sm">
            {fmt(assignments.reduce((s, a) => {
              const deduction = findPackageForAssignment(a, packages)?.deduction;
              return s + a.staffAssignments.reduce((ss, sa) => ss + calcNetPositionAmount(sa.amount || 0, deduction), 0);
            }, 0))} đ
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
                  {deleteTarget.type === 'assignment' ? 'Hủy gói dịch vụ yêu cầu' : 'Xóa ca khỏi danh sách gói'}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {deleteTarget.type === 'assignment'
                    ? `Bạn có chắc muốn hủy gói dịch vụ yêu cầu khỏi ca của bệnh nhân "${deleteTarget.patientName}"? Ca này sẽ đồng thời được gỡ khỏi bất kỳ đợt thanh toán nào (nếu có).`
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

      {/* Modal Quản lý danh sách đợt thanh toán */}
      {paymentLists && (
        <PaymentListManagementModal
          isOpen={manageModalOpen}
          onClose={() => setManageModalOpen(false)}
          lists={paymentLists.lists}
          currentListId={listFilter}
          onSelectList={id => {
            setListFilter(id);
            setCurrentPage(1);
          }}
          reportYears={reportYears}
          userName={paymentLists.userName}
        />
      )}

      {/* Lock Batch Confirmation Modal */}
      {lockBatchTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isLockingBatch && setLockBatchTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-md w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0 mt-0.5">
                <Lock className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-800">
                  Chốt đợt thanh toán
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  Xác nhận chốt đợt &ldquo;<span className="font-semibold text-gray-900">{lockBatchTarget.name}</span>&rdquo; ({lockBatchTarget.items.length} ca)?
                </p>
                {lockWarningMessage ? (
                  <div className="mt-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>{lockWarningMessage}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 mt-2 bg-gray-50 p-2 rounded-lg">
                    Khi chốt, đợt này sẽ được khóa để tránh chỉnh sửa ngoài ý muốn. Admin và Trưởng khoa vẫn có thể mở khóa lại khi cần.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setLockBatchTarget(null)}
                disabled={isLockingBatch}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmLock}
                disabled={isLockingBatch || Boolean(lockWarningMessage)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{isLockingBatch ? 'Đang chốt...' : 'Xác nhận chốt'}</span>
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

      {/* Streamlined Import Modal (Tạo đợt mới hoặc nhập thêm ca TCKT) */}
      {paymentLists && importModalOpen && (
        <PaymentListImportModal
          ctx={paymentLists}
          targetListId={importTargetListId}
          onClose={() => {
            setImportModalOpen(false);
            setImportTargetListId(undefined);
          }}
          onSuccess={(newId) => {
            justImportedBatchIdRef.current = newId;
            setListFilter(newId);
            setCurrentPage(1);
          }}
        />
      )}

      {/* Modal thông báo ca chưa có dữ liệu trong danh sách phẫu thuật */}
      {showMissingModal && currentList && missingBatchItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-inter">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-amber-50/70 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-xs">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-800">
                    Ca chưa có dữ liệu trong danh sách phẫu thuật
                  </h2>
                  <p className="text-[11px] text-amber-700">
                    Đợt thanh toán: <strong>{currentList.name}</strong> ({missingBatchItems.length} ca chưa khớp)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMissingModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 rounded-lg bg-amber-50/80 p-3 border border-amber-200/80 text-xs text-amber-900 leading-relaxed">
                Những ca sau đây có trong đợt thanh toán (file TCKT) nhưng hệ thống <strong>chưa tìm thấy dữ liệu ca mổ</strong> tương ứng.
                Các ca này <strong>không được hiển thị trên bảng phẫu thuật</strong>. Vui lòng kiểm tra lại hoặc nạp bổ sung file báo cáo phẫu thuật của khoa liên quan.
              </div>
              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">#</th>
                      <th className="px-3 py-2 w-28">Mã KCB</th>
                      <th className="px-3 py-2">Họ và tên</th>
                      <th className="px-3 py-2">Khoa (TCKT)</th>
                      <th className="px-3 py-2 text-center w-28">Ngày RV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {missingBatchItems.map((item, idx) => {
                      const pid = (item.patientId || '').trim();
                      const dc = paymentLists?.discharge[pid];
                      return (
                        <tr key={pid} className="hover:bg-amber-50/40">
                          <td className="px-3 py-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                          <td className="px-3 py-2 font-mono font-bold text-gray-700">{item.patientId}</td>
                          <td className="px-3 py-2 font-bold text-gray-800">{item.patientName}</td>
                          <td className="px-3 py-2 text-gray-600">{item.department || '—'}</td>
                          <td className="px-3 py-2 text-center text-gray-600 font-mono text-[11px]">
                            {dc?.ngayRa ? formatDischargeDate(dc.ngayRa) : '(chưa có thông tin)'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50/70 px-5 py-3">
              <button
                onClick={() => setShowMissingModal(false)}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors shadow-xs"
              >
                Đã hiểu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chuyển ca sang đợt thanh toán khác */}
      {moveTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isMoving && setMoveTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-sky-600" />
                <span>Chuyển đợt thanh toán</span>
              </h4>
              <button
                onClick={() => setMoveTarget(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                <div className="font-semibold text-gray-800">{moveTarget.patientName}</div>
                <div className="text-gray-500 font-mono text-[11px]">Mã KCB: {moveTarget.patientId}</div>
                {moveTarget.fromListName && (
                  <div className="mt-1 text-[11px] text-gray-600">
                    Đợt hiện tại: <span className="font-bold text-gray-700">{moveTarget.fromListName}</span>
                  </div>
                )}
              </div>

              {moveTarget.isFromLocked ? (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs leading-relaxed">
                  ⚠️ Đợt thanh toán hiện tại <strong>{moveTarget.fromListName}</strong> đã được chốt. Không thể chuyển ca ra khỏi đợt đã chốt.
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Chọn đợt thanh toán chuyển đến
                  </label>
                  {(paymentLists?.lists || []).filter(l => l.status !== 'locked' && l.id !== moveTarget.fromListId).length === 0 ? (
                    <div className="p-2.5 bg-gray-50 border border-gray-200 text-gray-500 rounded-lg text-xs">
                      Không có đợt thanh toán nào khác đang mở (chưa chốt) để chuyển ca đến. Vui lòng tạo thêm đợt mới trước.
                    </div>
                  ) : (
                    <select
                      value={targetListId}
                      onChange={e => setTargetListId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-sky-500 bg-white"
                    >
                      {(paymentLists?.lists || [])
                        .filter(l => l.status !== 'locked' && l.id !== moveTarget.fromListId)
                        .map(l => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.items.length} ca)
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setMoveTarget(null)}
                disabled={isMoving}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {moveTarget.isFromLocked ? 'Đóng' : 'Hủy'}
              </button>
              {!moveTarget.isFromLocked && (paymentLists?.lists || []).filter(l => l.status !== 'locked' && l.id !== moveTarget.fromListId).length !== 0 && (
                <button
                  onClick={handleConfirmMove}
                  disabled={isMoving || !targetListId}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>{isMoving ? 'Đang chuyển...' : 'Xác nhận chuyển'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Xóa ca khỏi đợt thanh toán (vẫn giữ gói yêu cầu) */}
      {removeFromBatchTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isRemovingFromBatch && setRemoveFromBatchTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0 mt-0.5">
                <UserMinus className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-800">
                  Xóa ca khỏi đợt thanh toán
                </h4>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Bạn có chắc muốn xóa ca của bệnh nhân <strong>"{removeFromBatchTarget.patientName}"</strong> ra khỏi đợt thanh toán <strong>"{removeFromBatchTarget.listName}"</strong>?
                </p>
                <div className="mt-2 p-2 bg-blue-50/70 border border-blue-100 rounded text-[11px] text-blue-700">
                  ℹ️ Gói dịch vụ yêu cầu và thông tin kíp mổ vẫn được giữ nguyên.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setRemoveFromBatchTarget(null)}
                disabled={isRemovingFromBatch}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmRemoveFromBatch}
                disabled={isRemovingFromBatch}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-xs flex items-center gap-1.5"
              >
                <UserMinus className="h-3.5 w-3.5" />
                <span>{isRemovingFromBatch ? 'Đang xóa...' : 'Xóa khỏi đợt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
