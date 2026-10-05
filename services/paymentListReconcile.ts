import { PaymentList, PaymentListItem, ParsedEntry, ReconciledItem } from '../types/paymentList';

/** Dữ liệu tối thiểu để đối soát (khớp ServicePackageAssignment / SurgeryRecord) */
export interface AssignmentLike {
  id: string;
  patientId: string;
  patientName?: string;
}
export interface RecordLike {
  patientId?: string;
  patientName?: string;
}

export function normalizeName(s: string | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const pid = (s: string | undefined) => (s || '').trim();

export interface ReconcileContext {
  assignments: AssignmentLike[];
  records: RecordLike[];
}

export function reconcileItems(items: PaymentListItem[], ctx: ReconcileContext): ReconciledItem[] {
  const byPatient = new Map<string, AssignmentLike[]>();
  for (const a of ctx.assignments) {
    const k = pid(a.patientId);
    if (!byPatient.has(k)) byPatient.set(k, []);
    byPatient.get(k)!.push(a);
  }
  const recByPatient = new Map<string, RecordLike>();
  for (const r of ctx.records) {
    const k = pid(r.patientId);
    if (k && !recByPatient.has(k)) recByPatient.set(k, r);
  }

  return items.map(item => {
    const assigns = byPatient.get(pid(item.patientId)) || [];
    const rec = recByPatient.get(pid(item.patientId));
    const systemName = assigns[0]?.patientName || rec?.patientName;
    if (!assigns.length && !rec) {
      return { ...item, status: 'notFound', assignmentIds: [] };
    }
    const mismatch =
      !item.nameConfirmed && !!systemName && normalizeName(systemName) !== normalizeName(item.patientName);
    return {
      ...item,
      status: mismatch ? 'nameMismatch' : assigns.length ? 'assigned' : 'pending',
      assignmentIds: assigns.map(a => a.id),
      systemName,
    };
  });
}

/** Chỉ chốt được khi không còn ca lệch tên chưa làm rõ */
export function canLock(reconciled: ReconciledItem[]): boolean {
  return !reconciled.some(i => i.status === 'nameMismatch');
}

export interface MembershipEntry {
  listId: string;
  listName: string;
  status: PaymentList['status'];
}

export function buildMembershipIndex(lists: PaymentList[]): Map<string, MembershipEntry> {
  const index = new Map<string, MembershipEntry>();
  for (const l of lists) {
    for (const it of l.items) {
      index.set(pid(it.patientId), { listId: l.id, listName: l.name, status: l.status });
    }
  }
  return index;
}

/** Entry đang nằm ở một danh sách khác (không tính danh sách hiện tại) */
export function findConflicts(
  entries: ParsedEntry[],
  index: Map<string, MembershipEntry>,
  currentListId?: string,
): { entry: ParsedEntry; list: MembershipEntry }[] {
  const out: { entry: ParsedEntry; list: MembershipEntry }[] = [];
  for (const entry of entries) {
    const m = index.get(pid(entry.patientId));
    if (m && m.listId !== currentListId) out.push({ entry, list: m });
  }
  return out;
}

export interface UnpaidAssignment<T extends AssignmentLike = AssignmentLike> {
  assignment: T;
  inDraftList?: { id: string; name: string };
}

/** Ca có gán gói mà chưa nằm trong danh sách đã chốt nào (không lọc ngày) */
export function findUnpaid<T extends AssignmentLike>(assignments: T[], lists: PaymentList[]): UnpaidAssignment<T>[] {
  const index = buildMembershipIndex(lists);
  const out: UnpaidAssignment<T>[] = [];
  for (const a of assignments) {
    const m = index.get(pid(a.patientId));
    if (m?.status === 'locked') continue;
    out.push({ assignment: a, inDraftList: m ? { id: m.listId, name: m.listName } : undefined });
  }
  return out;
}
