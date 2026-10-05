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
});

describe('normalizeName', () => {
  it('strips accents and đ', () => {
    expect(normalizeName('  ĐỖ  Văn  ')).toBe('do van');
  });
});
