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
  ListChecks,
  AlertTriangle,
  Lock,
  Unlock,
  Upload,
  CheckCircle2,
  UserPlus,
  UserMinus,
  Sparkles,
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
} from '../../services/paymentListService';
import { reconcileItems, canLock } from '../../services/paymentListReconcile';
import { PaymentList } from '../../types/paymentList';
import { PackageAssignmentModal } from './PackageAssignmentModal';
import { PaymentListsContext, LookupRecord } from '../../hooks/usePaymentLists';
import { PaymentListManagerModal } from './PaymentListManagerModal';
import { PaymentListImportModal } from './PaymentListImportModal';

interface Props {
  assignments: ServicePackageAssignment[];
  packages: ServicePackageDefinition[];
  records: SurgeryRecord[];
  staffList: StaffMember[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
  /** Monthly report only: adds a payment-status column and filter */
  paymentLists?: PaymentListsContext;
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

type FilterMode = 'all' | 'assigned' | 'unassigned';
type QuickFilter = 'all' | 'unpaid_pkg' | 'discharged' | 'not_discharged' | 'unlocked';
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
  paymentLists,
}) => {
  // Selected batch in dropdown ('all' or specific listId)
  const [listFilter, setListFilter] = useState<string>('all');
  // Quick 1-touch filter pills
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  // Sub-filter for assigned/unassigned
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Modals for batch management
  const [showListManager, setShowListManager] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTargetListId, setImportTargetListId] = useState<string | undefined>(undefined);

  // Rename batch modal
  const [renameTargetList, setRenameTargetList] = useState<PaymentList | null>(null);
  const [renameNameInput, setRenameNameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete batch confirmation modal
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<PaymentList | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Lock / Unlock batch confirmation modal
  const [lockBatchTarget, setLockBatchTarget] = useState<PaymentList | null>(null);
  const [lockWarningMessage, setLockWarningMessage] = useState<string | null>(null);
  const [isLockingBatch, setIsLockingBatch] = useState(false);

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

  // Currently selected list object (if viewing a specific batch)
  const currentList = useMemo(() => {
    if (!paymentLists || listFilter === 'all') return undefined;
    return paymentLists.lists.find(l => l.id === listFilter);
  }, [paymentLists, listFilter]);

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
    ...(paymentLists ? [
      { key: 'raVien', label: 'Ra viện (BQ)' },
      { key: 'thanhToan', label: 'Thanh toán gói DV' },
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
  // 1. ALL online assignments (visible on any machine)
  // 2. Local drafts added from DS phẫu thuật (temporary until assigned)
  // 3. If a specific batch is selected, also include any items from that batch that are not yet assigned
  const enrichedRecords = useMemo(() => {
    const list: { record: SurgeryRecord; compositeKey: string; assignment?: ServicePackageAssignment }[] = [];
    const seenKeys = new Set<string>();

    // 1. Process all online assignments
    for (const a of assignments) {
      seenKeys.add(a.compositeKey);
      let rec = records.find(r => {
        const rDate = getRecordDateString(r).substring(0, 10);
        if (rDate && buildCompositeKey(r.patientId || '', rDate, r.tenKT || '') === a.compositeKey) return true;
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

    // 3. If a specific payment batch is selected, include any items in it not yet in list
    if (currentList) {
      for (const item of currentList.items) {
        const pid = item.patientId.trim();
        const alreadyInList = list.some(entry => (entry.record.patientId || '').trim() === pid);
        if (!alreadyInList) {
          const foundRec = paymentLists?.records.find(rec => (rec.patientId || '').trim() === pid);
          const rec: SurgeryRecord = foundRec
            ? (foundRec as any)
            : ({
                id: `tckt-${pid}`,
                key: `tckt-${pid}`,
                patientId: item.patientId,
                patientName: item.patientName,
                tenKT: item.department ? `[${item.department}]` : 'Chờ gán phẫu thuật',
                ngayBD: '',
                ptChinh: '',
                ptPhu: '',
                bsGM: '',
                ktvGM: '',
                tdc: '',
                gv: '',
              } as SurgeryRecord);
          list.push({ record: rec, compositeKey: `tckt-${pid}`, assignment: undefined });
        }
      }
    }

    return list;
  }, [assignments, records, draftRecords, currentList, paymentLists]);

  // Compute status counts for Quick Filter pills
  const stats = useMemo(() => {
    let unpaidPkgCount = 0;
    let dischargedCount = 0;
    let notDischargedCount = 0;
    let unlockedCount = 0;

    for (const { record: r, assignment: a } of enrichedRecords) {
      const pid = (r.patientId || '').trim();
      const m = paymentLists?.membershipIndex.get(pid);
      const dc = paymentLists?.discharge[pid];

      const isAssigned = Boolean(a);
      const isLocked = m?.status === 'locked';
      const isDischarged = Boolean(dc?.ngayRa);

      if (isAssigned && !isLocked) {
        unpaidPkgCount++;
      }
      if (isDischarged) {
        dischargedCount++;
      } else {
        notDischargedCount++;
      }
      if (!isLocked) {
        unlockedCount++;
      }
    }

    return { unpaidPkgCount, dischargedCount, notDischargedCount, unlockedCount };
  }, [enrichedRecords, paymentLists]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = enrichedRecords;

    // Filter by batch selection dropdown
    if (paymentLists && listFilter !== 'all') {
      result = result.filter(({ record: r }) => {
        const pid = (r.patientId || '').trim();
        const m = paymentLists.membershipIndex.get(pid);
        return m?.listId === listFilter;
      });
    }

    // Filter by assign mode (Đã gán / Chưa gán)
    if (filterMode === 'assigned') result = result.filter(r => r.assignment);
    if (filterMode === 'unassigned') result = result.filter(r => !r.assignment);

    // Quick filter pills
    if (paymentLists && quickFilter !== 'all') {
      result = result.filter(({ record: r, assignment: a }) => {
        const pid = (r.patientId || '').trim();
        const m = paymentLists.membershipIndex.get(pid);
        const dc = paymentLists.discharge[pid];
        const isLocked = m?.status === 'locked';
        const isDischarged = Boolean(dc?.ngayRa);

        if (quickFilter === 'unpaid_pkg') {
          // Chưa thanh toán gói DV: đã gán gói nhưng chưa chốt trong đợt nào
          return Boolean(a) && !isLocked;
        }
        if (quickFilter === 'discharged') {
          return isDischarged;
        }
        if (quickFilter === 'not_discharged') {
          return !isDischarged;
        }
        if (quickFilter === 'unlocked') {
          return !isLocked;
        }
        return true;
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
        const text = `${r.patientId} ${r.patientName} ${r.tenKT} ${r.ptChinh} ${r.ptPhu} ${a?.packageName || ''} ${pkgShort} ${dept}`.toLowerCase();
        return terms.every(t => text.includes(t));
      });
    }
    return result;
  }, [enrichedRecords, filterMode, quickFilter, searchTerm, packages, paymentLists, listFilter]);

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

  // Batch action handlers
  const handleRenameBatch = async () => {
    if (!renameTargetList || !renameNameInput.trim()) return;
    setIsRenaming(true);
    try {
      await renameList(renameTargetList.id, renameNameInput.trim());
      setRenameTargetList(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể đổi tên đợt thanh toán.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!deleteBatchTarget) return;
    setIsDeletingBatch(true);
    try {
      await deletePaymentList(deleteBatchTarget.id);
      if (listFilter === deleteBatchTarget.id) {
        setListFilter('all');
      }
      setDeleteBatchTarget(null);
    } catch (err: any) {
      alert(err?.message || 'Không thể xóa đợt thanh toán.');
    } finally {
      setIsDeletingBatch(false);
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
      setLockWarningMessage(`Đợt này còn ${mismatchCount} ca lệch họ tên giữa danh sách TCKT và hệ thống chưa được xác nhận. Vui lòng mở "Bảng đối soát" để kiểm tra trước khi chốt.`);
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
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-teal-50/90 via-white to-emerald-50/70 p-2.5 rounded-xl border border-teal-200/80 shadow-2xs">
          {/* Left: Dropdown chọn đợt + Nút thao tác đợt */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-teal-900 shrink-0">
              Đợt thanh toán:
            </span>

            {/* Dropdown chọn Đợt */}
            <select
              value={listFilter}
              onChange={e => setListFilter(e.target.value)}
              aria-label="Chọn đợt thanh toán gói dịch vụ"
              className="h-8 max-w-[260px] rounded-lg border border-teal-300 bg-white px-2.5 text-xs font-bold text-teal-900 shadow-2xs outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="all">📂 Tất cả ca gán gói (Toàn viện)</option>
              {paymentLists.lists.map(l => (
                <option key={l.id} value={l.id}>
                  {l.status === 'locked' ? '🔒 ' : '📝 '} {l.name} ({l.items.length} ca)
                </option>
              ))}
            </select>

            {/* Nút Tạo đợt mới */}
            <button
              onClick={() => {
                setImportTargetListId(undefined);
                setImportModalOpen(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white shadow-2xs hover:bg-teal-700 transition-colors"
              title="Tạo đợt thanh toán mới từ danh sách TCKT"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tạo đợt mới</span>
            </button>

            {/* Thao tác theo ngữ cảnh khi chọn 1 đợt cụ thể */}
            {currentList && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-teal-200">
                {currentList.status === 'draft' ? (
                  <>
                    <button
                      onClick={() => {
                        setImportTargetListId(currentList.id);
                        setImportModalOpen(true);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-2.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
                      title="Nhập thêm danh sách TCKT vào đợt nháp này"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Nhập thêm TCKT</span>
                    </button>

                    <button
                      onClick={() => {
                        setRenameTargetList(currentList);
                        setRenameNameInput(currentList.name);
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      title="Đổi tên đợt thanh toán"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Đổi tên</span>
                    </button>

                    {paymentLists.canManage && (
                      <button
                        onClick={() => handleRequestLock(currentList)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                        title="Chốt đợt thanh toán gói dịch vụ"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>Chốt đợt</span>
                      </button>
                    )}

                    <button
                      onClick={() => setDeleteBatchTarget(currentList)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      title="Xóa đợt thanh toán này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa đợt</span>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-100/80 border border-emerald-300 px-2.5 text-xs font-bold text-emerald-800">
                      <Lock className="h-3.5 w-3.5" />
                      <span>Đã chốt{currentList.lockedBy ? ` (${currentList.lockedBy})` : ''}</span>
                    </span>

                    {paymentLists.canManage && (
                      <button
                        onClick={() => handleUnlockBatch(currentList)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                        title="Mở khóa đợt thanh toán để chỉnh sửa"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Mở khóa</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Bảng đối soát chi tiết */}
          <button
            onClick={() => setShowListManager(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 text-xs font-bold text-teal-800 hover:bg-teal-50 shadow-2xs transition-colors shrink-0"
            title="Mở bảng đối soát chuyên sâu chi tiết từng ca"
          >
            <ListChecks className="h-3.5 w-3.5 text-teal-600" />
            <span>Bảng đối soát chi tiết</span>
          </button>
        </div>
      )}

      {/* ─── HÀNG 2: BỘ LỌC 1-CHẠM & TÌM KIẾM & CẤU HÌNH ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-2xs">
        {/* Left: Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Quick Filter Pills by Payment & Discharge */}
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setQuickFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                quickFilter === 'all'
                  ? 'bg-white text-gray-800 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Tất cả ({enrichedRecords.length})
            </button>

            {paymentLists && (
              <>
                <button
                  onClick={() => setQuickFilter('unpaid_pkg')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    quickFilter === 'unpaid_pkg'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                  title="Các ca đã gán gói dịch vụ nhưng chưa chốt trong đợt thanh toán nào"
                >
                  ⚠️ Chưa thanh toán gói DV ({stats.unpaidPkgCount})
                </button>

                <button
                  onClick={() => setQuickFilter('discharged')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    quickFilter === 'discharged'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                  title="Các ca đã có ngày ra viện theo dữ liệu BigQuery BHYT"
                >
                  ✅ Đã ra viện (BQ) ({stats.dischargedCount})
                </button>

                <button
                  onClick={() => setQuickFilter('not_discharged')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    quickFilter === 'not_discharged'
                      ? 'bg-slate-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Các ca chưa có ngày ra viện trong dữ liệu BigQuery"
                >
                  ⏳ Chưa ra viện (BQ) ({stats.notDischargedCount})
                </button>

                <button
                  onClick={() => setQuickFilter('unlocked')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    quickFilter === 'unlocked'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                  title="Các ca chưa vào đợt nào hoặc đang ở đợt nháp"
                >
                  📝 Chưa chốt ({stats.unlockedCount})
                </button>
              </>
            )}
          </div>

          {/* Sub-filter: Đã gán / Chưa gán */}
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                filterMode === 'all'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mọi ca
            </button>
            <button
              onClick={() => setFilterMode('assigned')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                filterMode === 'assigned'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Đã gán ({assignedCount})
            </button>
            <button
              onClick={() => setFilterMode('unassigned')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                filterMode === 'unassigned'
                  ? 'bg-white text-teal-700 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Chưa gán ({unassignedCount})
            </button>
          </div>
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

          {/* Config dropdown (Ẩn/hiện cột + Mật độ bảng) */}
          <div className="relative" ref={configRef}>
            <button
              onClick={() => setConfigOpen(!configOpen)}
              title="Cấu hình hiển thị và mật độ bảng"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-all shadow-2xs ${
                configOpen
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Cột</span>
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
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-2xs">
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
                <th className={`px-2.5 ${cellPy} text-teal-800 border-r border-gray-100 bg-teal-50/30 w-[150px]`}>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                    <span>Gói DV</span>
                  </div>
                </th>
              )}
              {/* Dedicated BQ Discharge Column */}
              {paymentLists && isColVisible('raVien') && (
                <th className={`px-2 ${cellPy} text-emerald-800 border-r border-gray-100 bg-emerald-50/40 text-center w-[115px]`}>
                  Ra viện (BQ)
                </th>
              )}
              {/* Dedicated Service Package Payment Status Column */}
              {paymentLists && isColVisible('thanhToan') && (
                <th className={`px-2 ${cellPy} text-gray-700 border-r border-gray-100 w-[160px]`}>
                  Thanh toán gói DV
                </th>
              )}
              {/* Action column */}
              <th className={`px-1.5 ${cellPy} w-[75px] text-center text-gray-500`}>Thao tác</th>
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

              const pid = (r.patientId || '').trim();
              const inCurrentBatch = currentList?.items.some(i => i.patientId.trim() === pid);
              const m = paymentLists?.membershipIndex.get(pid);
              const dc = paymentLists?.discharge[pid];

              return (
                <tr
                  key={compositeKey}
                  className={`transition-colors ${a ? 'bg-teal-50/20 hover:bg-teal-50/40' : 'hover:bg-gray-50/50'}`}
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
                      {(r as any).department && (
                        <div className="text-[10px] text-teal-600 font-normal">
                          {((r as any).department)}
                        </div>
                      )}
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
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* Cột Ra viện (BQ) */}
                  {paymentLists && isColVisible('raVien') && (
                    <td className={`px-2 ${cellPy} border-r border-gray-100 whitespace-nowrap text-center`}>
                      {dc && dc.ngayRa ? (
                        <div className="inline-flex flex-col items-center">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono text-[11px] font-bold border border-emerald-200"
                            title={`Ngày ra viện BHYT: ${formatDischargeDate(dc.ngayRa)}`}
                          >
                            <span>✅</span>
                            <span>{formatDischargeDate(dc.ngayRa)}</span>
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium">
                            QT: T{dc.thangQt}/{dc.namQt}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] italic"
                          title="Chưa có dữ liệu quyết toán ra viện trong BigQuery BHYT"
                        >
                          <span>⏳</span>
                          <span>Chưa có ngày ra</span>
                        </span>
                      )}
                    </td>
                  )}

                  {/* Cột Thanh toán gói DV */}
                  {paymentLists && isColVisible('thanhToan') && (
                    <td className={`px-2 ${cellPy} border-r border-gray-100 whitespace-normal w-[160px]`}>
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
                          <span className="truncate max-w-[130px]">{m.listName}</span>
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
                  <td className={`px-1.5 ${cellPy} text-center w-[75px]`}>
                    <div className="flex items-center justify-center gap-0.5">
                      {/* Thao tác thêm/gỡ khỏi đợt nháp đang chọn */}
                      {currentList && currentList.status === 'draft' && (
                        inCurrentBatch ? (
                          <button
                            onClick={() => handleRemovePatientFromBatch(pid)}
                            className="p-1 rounded text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                            title={`Gỡ khỏi đợt "${currentList.name}"`}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAddPatientToBatch(pid, r.patientName || '')}
                            className="p-1 rounded text-teal-600 hover:bg-teal-50 hover:text-teal-800 transition-colors"
                            title={`Thêm vào đợt "${currentList.name}"`}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}

                      {/* Thao tác gán / sửa / xóa gói */}
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
                            title="Gán gói dịch vụ cho ca này"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          {compositeKey.startsWith('draft_') && (
                            <button
                              onClick={(e) => handleRequestRemoveDraft(e, r, compositeKey)}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              title="Loại bỏ ca này khỏi danh sách gói tạm"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
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

      {/* Rename Batch Modal */}
      {renameTargetList && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isRenaming && setRenameTargetList(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-teal-600" />
                <span>Đổi tên đợt thanh toán</span>
              </h4>
              <button
                onClick={() => setRenameTargetList(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                Tên đợt mới
              </label>
              <input
                type="text"
                value={renameNameInput}
                onChange={e => setRenameNameInput(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setRenameTargetList(null)}
                disabled={isRenaming}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleRenameBatch}
                disabled={isRenaming || !renameNameInput.trim()}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
              >
                {isRenaming ? 'Đang lưu...' : 'Lưu tên'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Batch Confirmation Modal */}
      {deleteBatchTarget && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-xs font-inter"
          onClick={() => !isDeletingBatch && setDeleteBatchTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 border border-gray-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-xl shrink-0 mt-0.5">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-800">
                  Xóa đợt thanh toán
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  Bạn có chắc muốn xóa đợt &ldquo;<span className="font-semibold text-gray-700">{deleteBatchTarget.name}</span>&rdquo; ({deleteBatchTarget.items.length} ca)?
                </p>
                <p className="text-[11px] text-amber-600 mt-2 bg-amber-50 p-2 rounded-lg">
                  Lưu ý: Các ca trong đợt này sẽ chuyển về trạng thái &ldquo;Chưa thanh toán gói DV&rdquo;, không bị xóa khỏi danh sách phẫu thuật.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setDeleteBatchTarget(null)}
                disabled={isDeletingBatch}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={isDeletingBatch}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeletingBatch ? 'Đang xóa...' : 'Xóa đợt'}</span>
              </button>
            </div>
          </div>
        </div>
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
            setListFilter(newId);
          }}
        />
      )}

      {/* Detailed Reconciliation Table Modal */}
      {paymentLists && showListManager && (
        <PaymentListManagerModal
          ctx={paymentLists}
          onClose={() => setShowListManager(false)}
          onAssignPackage={(recs) => {
            setModalRecords(recs);
            setModalExistingAssignment(null);
            setModalOpen(true);
          }}
        />
      )}
    </div>
  );
};
