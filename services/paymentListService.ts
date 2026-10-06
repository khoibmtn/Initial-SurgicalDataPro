/**
 * Payment List Service — Firestore CRUD for service-package payment lists
 * (danh sách thanh toán gói dịch vụ). Each list is one doc with embedded items.
 * Locked lists are immutable; every mutation re-checks status inside a transaction.
 */
import {
  collection,
  doc,
  onSnapshot,
  getDocs,
  deleteDoc,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { PaymentList, PaymentListItem } from '../types/paymentList';

const PAYMENT_LISTS_COL = 'payment_lists';

// ─── Errors ──────────────────────────────────────────────────────────────────

export class PaymentListLockedError extends Error {
  constructor(name: string) {
    super(`Danh sách "${name}" đã chốt, không thể thay đổi.`);
    this.name = 'PaymentListLockedError';
  }
}

export interface PaymentListConflict {
  patientId: string;
  listId: string;
  listName: string;
}

export class PaymentListConflictError extends Error {
  constructor(public conflicts: PaymentListConflict[]) {
    super(`${conflicts.length} ca đã nằm trong danh sách khác.`);
    this.name = 'PaymentListConflictError';
  }
}

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

export function assertEditable(list: Pick<PaymentList, 'status' | 'name'>): void {
  if (list.status === 'locked') throw new PaymentListLockedError(list.name);
}

/** Append items, skipping patientIds already present. */
export function applyAddItems(items: PaymentListItem[], incoming: PaymentListItem[]): PaymentListItem[] {
  const seen = new Set(items.map(i => i.patientId));
  const result = [...items];
  for (const item of incoming) {
    if (seen.has(item.patientId)) continue;
    seen.add(item.patientId);
    result.push(item);
  }
  return result;
}

export function applyRemoveItem(items: PaymentListItem[], patientId: string): PaymentListItem[] {
  return items.filter(i => i.patientId !== patientId);
}

export function applyMoveItem(
  from: PaymentList,
  to: PaymentList,
  patientId: string,
): { from: PaymentListItem[]; to: PaymentListItem[] } {
  assertEditable(from);
  assertEditable(to);
  const item = from.items.find(i => i.patientId === patientId);
  if (!item) return { from: from.items, to: to.items };
  return {
    from: applyRemoveItem(from.items, patientId),
    to: applyAddItems(to.items, [item]),
  };
}

// ─── Firestore ───────────────────────────────────────────────────────────────

const listRef = (id: string) => doc(firestore, PAYMENT_LISTS_COL, id);

const stripUndefined = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

export function subscribeToPaymentLists(cb: (lists: PaymentList[]) => void): Unsubscribe {
  return onSnapshot(collection(firestore, PAYMENT_LISTS_COL), snap => {
    const lists = snap.docs.map(d => ({ ...(d.data() as PaymentList), id: d.id }));
    cb(lists.sort((a, b) => b.createdAt - a.createdAt));
  });
}

/** Mutate one list inside a transaction; rejects when locked. */
async function mutateList(listId: string, fn: (list: PaymentList) => Partial<PaymentList>): Promise<void> {
  await runTransaction(firestore, async tx => {
    const snap = await tx.get(listRef(listId));
    if (!snap.exists()) throw new Error('Danh sách không tồn tại.');
    const list = { ...(snap.data() as PaymentList), id: listId };
    assertEditable(list);
    tx.update(listRef(listId), stripUndefined({ ...fn(list), updatedAt: Date.now() }));
  });
}

async function findConflicts(patientIds: string[], excludeListId?: string): Promise<PaymentListConflict[]> {
  const snap = await getDocs(collection(firestore, PAYMENT_LISTS_COL));
  const wanted = new Set(patientIds);
  const conflicts: PaymentListConflict[] = [];
  snap.docs.forEach(d => {
    if (d.id === excludeListId) return;
    const l = d.data() as PaymentList;
    l.items.forEach(i => {
      if (wanted.has(i.patientId)) conflicts.push({ patientId: i.patientId, listId: d.id, listName: l.name });
    });
  });
  return conflicts;
}

export async function createPaymentList(params: {
  name: string;
  periodKey: string;
  items: Omit<PaymentListItem, 'addedAt'>[];
  createdBy?: string;
}): Promise<string> {
  const conflicts = await findConflicts(params.items.map(i => i.patientId));
  if (conflicts.length) throw new PaymentListConflictError(conflicts);
  const now = Date.now();
  const id = doc(collection(firestore, PAYMENT_LISTS_COL)).id;
  const list: PaymentList = {
    id,
    name: params.name,
    periodKey: params.periodKey,
    status: 'draft',
    items: applyAddItems([], params.items.map(i => ({ ...i, addedAt: now }))),
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
    updatedBy: params.createdBy,
  };
  await runTransaction(firestore, async tx => {
    tx.set(listRef(id), stripUndefined(list));
  });
  return id;
}

export async function addItems(listId: string, items: Omit<PaymentListItem, 'addedAt'>[], updatedBy?: string): Promise<void> {
  const conflicts = await findConflicts(items.map(i => i.patientId), listId);
  if (conflicts.length) throw new PaymentListConflictError(conflicts);
  const now = Date.now();
  await mutateList(listId, l => ({
    items: applyAddItems(l.items, items.map(i => ({ ...i, addedAt: now }))),
    ...(updatedBy ? { updatedBy } : {}),
  }));
}

export function updateItem(listId: string, patientId: string, patch: Partial<PaymentListItem>, updatedBy?: string): Promise<void> {
  return mutateList(listId, l => ({
    items: l.items.map(i => (i.patientId === patientId ? { ...i, ...patch, patientId } : i)),
    ...(updatedBy ? { updatedBy } : {}),
  }));
}

export function removeItem(listId: string, patientId: string, updatedBy?: string): Promise<void> {
  return mutateList(listId, l => ({
    items: applyRemoveItem(l.items, patientId),
    ...(updatedBy ? { updatedBy } : {}),
  }));
}

export function renameList(listId: string, name: string, updatedBy?: string): Promise<void> {
  return mutateList(listId, () => ({
    name,
    ...(updatedBy ? { updatedBy } : {}),
  }));
}

export async function moveItem(fromId: string, toId: string, patientId: string): Promise<void> {
  await runTransaction(firestore, async tx => {
    const [a, b] = await Promise.all([tx.get(listRef(fromId)), tx.get(listRef(toId))]);
    if (!a.exists() || !b.exists()) throw new Error('Danh sách không tồn tại.');
    const res = applyMoveItem({ ...(a.data() as PaymentList), id: fromId }, { ...(b.data() as PaymentList), id: toId }, patientId);
    const now = Date.now();
    tx.update(listRef(fromId), stripUndefined({ items: res.from, updatedAt: now }));
    tx.update(listRef(toId), stripUndefined({ items: res.to, updatedAt: now }));
  });
}

export async function deletePaymentList(listId: string): Promise<void> {
  await runTransaction(firestore, async tx => {
    const snap = await tx.get(listRef(listId));
    if (snap.exists()) assertEditable(snap.data() as PaymentList);
  });
  await deleteDoc(listRef(listId));
}

/** Permission is checked in the UI (canManageLock); `canLock` comes from reconcile. */
export async function lockList(listId: string, by: string, canLock = true): Promise<void> {
  if (!canLock) throw new Error('Còn ca lệch họ tên chưa làm rõ.');
  await mutateList(listId, () => ({ status: 'locked', lockedBy: by, lockedAt: Date.now() }));
}

export async function unlockList(listId: string): Promise<void> {
  await runTransaction(firestore, async tx => {
    const snap = await tx.get(listRef(listId));
    if (!snap.exists()) throw new Error('Danh sách không tồn tại.');
    tx.update(listRef(listId), {
      status: 'draft',
      lockedBy: null,
      lockedAt: null,
      updatedAt: Date.now(),
    });
  });
}
