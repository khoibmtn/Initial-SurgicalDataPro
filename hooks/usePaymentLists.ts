import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaymentList } from '../types/paymentList';
import { ServicePackageAssignment } from '../types/servicePackage';
import { subscribeToPaymentLists } from '../services/paymentListService';
import { subscribeToAllAssignments } from '../services/servicePackageService';
import { buildMembershipIndex, RecordLike, MembershipEntry, findUnpaid } from '../services/paymentListReconcile';
import { lookupDischarge, DischargeMap } from '../services/dischargeLookupService';
import { reportService } from '../services/reportService';

/** Full record kept for lookup (needed to open the package-assign modal) */
export type LookupRecord = RecordLike & Record<string, any>;

/** Bundle passed to the table router when payment lists are enabled (monthly report only) */
export interface PaymentListsContext {
  lists: PaymentList[];
  allAssignments: ServicePackageAssignment[];
  membershipIndex: Map<string, MembershipEntry>;
  /** Discharge info for unpaid cases; missing id = unknown (treated as discharged) */
  discharge: DischargeMap;
  /** Records of the open report + cross-month lookup window, merged */
  records: LookupRecord[];
  ensureRecordsLoaded: () => Promise<void>;
  loadRecordsForPatients: (patientIds: string[]) => Promise<LookupRecord[]>;
  canManage: boolean;
  userName: string;
  periodKey: string;
  dateFrom?: string;
  dateTo?: string;
  isLoading?: boolean;
}

/** First day of the month before `dateFrom` (YYYY-MM-DD) */
export function lookupWindowStart(dateFrom: string): string {
  const [y, m] = dateFrom.split('-').map(Number);
  if (!y || !m) return dateFrom;
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Data for service-package payment lists. Only subscribes when `enabled` (monthly report).
 * Records for cross-month lookup are loaded lazily via `ensureRecordsLoaded` and cached.
 */
export function usePaymentLists(params: { enabled: boolean; dateFrom?: string; dateTo?: string }) {
  const { enabled, dateFrom, dateTo } = params;
  const [lists, setLists] = useState<PaymentList[]>([]);
  const [allAssignments, setAllAssignments] = useState<ServicePackageAssignment[]>([]);
  const [lookupRecords, setLookupRecords] = useState<LookupRecord[]>([]);
  const [isListsLoading, setIsListsLoading] = useState(enabled);
  const [isRecordsLoading, setIsRecordsLoading] = useState(false);
  const cache = useRef(new Map<string, LookupRecord[]>());

  useEffect(() => {
    if (!enabled) {
      setIsListsLoading(false);
      return;
    }
    setIsListsLoading(true);
    let loadedLists = false;
    let loadedAssign = false;
    const checkDone = () => {
      if (loadedLists && loadedAssign) setIsListsLoading(false);
    };

    const unsubLists = subscribeToPaymentLists((items) => {
      setLists(items);
      loadedLists = true;
      checkDone();
    });
    const unsubAssign = subscribeToAllAssignments((items) => {
      setAllAssignments(items);
      loadedAssign = true;
      checkDone();
    });
    return () => {
      unsubLists();
      unsubAssign();
    };
  }, [enabled]);

  const ensureRecordsLoaded = useCallback(async () => {
    if (!enabled || !dateFrom) return;
    const from = lookupWindowStart(dateFrom);
    const to = dateTo || dateFrom;
    const key = `${from}_${to}`;
    const cached = cache.current.get(key);
    if (cached) {
      setLookupRecords(cached);
      return;
    }
    const [monthly, daily] = await Promise.all([
      reportService.getReports(from, to, 'MONTHLY'),
      reportService.getReports(from, to, 'DAILY'),
    ]);
    const byId = new Map<string, LookupRecord>();
    [...monthly, ...daily].forEach(r => {
      const id = (r.patientId || '').trim();
      if (id && !byId.has(id)) byId.set(id, r);
    });
    const merged = [...byId.values()];
    cache.current.set(key, merged);
    setLookupRecords(merged);
  }, [enabled, dateFrom, dateTo]);

  const membershipIndex = useMemo(() => buildMembershipIndex(lists), [lists]);

  // Enrichment only: failures yield {} and cases stay visible (assumed discharged)
  const [discharge, setDischarge] = useState<DischargeMap>({});
  const relevantIdsKey = useMemo(() => {
    const ids = new Set<string>();
    allAssignments.forEach(a => {
      const pid = (a.patientId || '').trim();
      if (pid) ids.add(pid);
    });
    lists.forEach(l => {
      l.items.forEach(it => {
        const pid = (it.patientId || '').trim();
        if (pid) ids.add(pid);
      });
    });
    return Array.from(ids).sort().join(',');
  }, [allAssignments, lists]);

  useEffect(() => {
    if (!enabled || !relevantIdsKey) return;
    let cancelled = false;
    lookupDischarge(relevantIdsKey.split(',')).then(m => {
      if (!cancelled) setDischarge(m);
    });
    return () => { cancelled = true; };
  }, [enabled, relevantIdsKey]);

  const loadRecordsForPatients = useCallback(async (patientIds: string[]) => {
    if (!enabled || !patientIds || patientIds.length === 0) return [];
    const cleanIds = Array.from(new Set(patientIds.map(id => (id || '').trim()).filter(Boolean)));
    if (cleanIds.length === 0) return [];

    try {
      setIsRecordsLoading(true);
      const fetched = await reportService.getSurgeryRecordsByPatientIds(cleanIds);
      if (fetched.length > 0) {
        setLookupRecords(prev => {
          const map = new Map<string, LookupRecord>();
          prev.forEach(r => {
            const k = `${(r.patientId || '').trim()}__${r.ngayBD || (r as any).start || ''}__${(r.tenKT || '').trim()}`;
            map.set(k, r);
          });
          fetched.forEach(r => {
            const k = `${(r.patientId || '').trim()}__${r.ngayBD || ''}__${(r.tenKT || '').trim()}`;
            if (!map.has(k)) {
              map.set(k, r);
            }
          });
          return Array.from(map.values());
        });
      }
      return fetched;
    } catch (err) {
      console.error('Error in loadRecordsForPatients:', err);
      return [];
    } finally {
      setIsRecordsLoading(false);
    }
  }, [enabled]);

  // Eager prefetch: Khi có lists đợt thanh toán, tự động nạp trước thông tin các ca mổ của đợt thanh toán đang chọn
  useEffect(() => {
    if (!enabled || lists.length === 0) return;
    try {
      const raw = localStorage.getItem('package_list_view_state');
      let targetListId = '';
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.listFilter === 'string' && parsed.listFilter !== 'all') {
          targetListId = parsed.listFilter;
        }
      }
      const targetList = targetListId ? lists.find(l => l.id === targetListId) : undefined;
      if (targetList && targetList.items.length > 0) {
        const pids = targetList.items.map(it => (it.patientId || '').trim()).filter(Boolean);
        loadRecordsForPatients(pids);
      }
    } catch {}
  }, [enabled, lists, loadRecordsForPatients]);

  const isLoading = isListsLoading || isRecordsLoading;

  return { lists, allAssignments, membershipIndex, discharge, lookupRecords, ensureRecordsLoaded, loadRecordsForPatients, isLoading };
}
