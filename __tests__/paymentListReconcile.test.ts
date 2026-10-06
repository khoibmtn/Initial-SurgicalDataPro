import { describe, it, expect } from 'vitest';
import {
  reconcileItems,
  canLock,
  buildMembershipIndex,
  findConflicts,
  findUnpaid,
  normalizeName,
} from '../services/paymentListReconcile';
import type { PaymentList, PaymentListItem } from '../types/paymentList';

const a = (patientId: string, patientName: string) => ({ id: `a-${patientId}`, patientId, patientName });
const item = (patientId: string, patientName: string, extra: Partial<PaymentListItem> = {}): PaymentListItem => ({
  patientId,
  patientName,
  addedAt: 0,
  ...extra,
});
const list = (id: string, status: 'draft' | 'locked', ids: string[]): PaymentList => ({
  id,
  name: `L${id}`,
  periodKey: '2026-07',
  status,
  items: ids.map(i => item(i, 'X')),
  createdAt: 0,
  updatedAt: 0,
});

describe('reconcileItems', () => {
  it('classifies assigned / pending / notFound', () => {
    const ctx = { assignments: [a('1', 'NGUYEN A')], records: [{ patientId: '2', patientName: 'TRAN B' }] };
    const r = reconcileItems([item('1', 'NGUYEN A'), item('2', 'TRAN B'), item('3', 'LE C')], ctx);
    expect(r.map(x => x.status)).toEqual(['assigned', 'pending', 'notFound']);
    expect(r[0].assignmentIds).toEqual(['a-1']);
  });

  it('flags nameMismatch until confirmed; ignores accents/case', () => {
    const ctx = { assignments: [a('1', 'Nguyễn Thị A')], records: [] };
    expect(reconcileItems([item('1', 'NGUYEN THI A')], ctx)[0].status).toBe('assigned');
    const bad = item('1', 'TRAN THI B');
    expect(reconcileItems([bad], ctx)[0].status).toBe('nameMismatch');
    expect(reconcileItems([{ ...bad, nameConfirmed: true }], ctx)[0].status).toBe('assigned');
  });

  it('canLock is false while a mismatch remains', () => {
    const ctx = { assignments: [a('1', 'A')], records: [] };
    expect(canLock(reconcileItems([item('1', 'B')], ctx))).toBe(false);
    expect(canLock(reconcileItems([item('1', 'A')], ctx))).toBe(true);
  });
});

describe('membership', () => {
  const lists = [list('1', 'locked', ['10']), list('2', 'draft', ['20'])];

  it('finds conflicts in other lists only', () => {
    const idx = buildMembershipIndex(lists);
    const entries = [{ patientId: '10', patientName: 'X' }, { patientId: '20', patientName: 'X' }];
    expect(findConflicts(entries, idx).map(c => c.list.listId)).toEqual(['1', '2']);
    expect(findConflicts(entries, idx, '2').map(c => c.entry.patientId)).toEqual(['10']);
  });

  it('findUnpaid excludes locked-list cases and labels draft-list cases', () => {
    const r = findUnpaid([a('10', 'X'), a('20', 'X'), a('30', 'X')], lists);
    expect(r.map(u => u.assignment.patientId)).toEqual(['20', '30']);
    expect(r[0].inDraftList).toEqual({ id: '2', name: 'L2' });
    expect(r[1].inDraftList).toBeUndefined();
  });

  it('correctly isolates brand new entries from cases already in current or other lists', () => {
    const idx = buildMembershipIndex(lists); // list 1: ['10'], list 2: ['20']
    const entries = [
      { patientId: '10', patientName: 'A' }, // in other list 1
      { patientId: '20', patientName: 'B' }, // in current list 2
      { patientId: '30', patientName: 'C' }, // brand new
    ];

    const targetListId = '2';
    const brandNew = entries.filter(e => !idx.has(e.patientId));
    const inCurrent = entries.filter(e => idx.get(e.patientId)?.listId === targetListId);
    const inOther = entries.filter(e => idx.has(e.patientId) && idx.get(e.patientId)?.listId !== targetListId);

    expect(brandNew.map(e => e.patientId)).toEqual(['30']);
    expect(inCurrent.map(e => e.patientId)).toEqual(['20']);
    expect(inOther.map(e => e.patientId)).toEqual(['10']);
  });

  it('blocks re-adding when all 30 imported cases already exist in target list', () => {
    const existingIds = Array.from({ length: 30 }, (_, i) => `260000000${i}`);
    const currentList = list('target-thang7', 'draft', existingIds);
    const idx = buildMembershipIndex([currentList]);

    const importedEntries = existingIds.map((id, i) => ({ patientId: id, patientName: `BN ${i}` }));
    const brandNew = importedEntries.filter(e => !idx.has(e.patientId));

    expect(brandNew.length).toBe(0);
    // Button must be disabled because brandNew.length is 0
  });
});

describe('normalizeName', () => {
  it('strips accents and đ', () => {
    expect(normalizeName('  ĐỖ  Văn  ')).toBe('do van');
  });
});
