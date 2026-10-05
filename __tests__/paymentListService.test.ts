import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn(), getDocs: vi.fn(),
  deleteDoc: vi.fn(), runTransaction: vi.fn(),
}));

import {
  assertEditable, applyAddItems, applyRemoveItem, applyMoveItem, PaymentListLockedError,
} from '../services/paymentListService';
import type { PaymentList, PaymentListItem } from '../types/paymentList';

const item = (id: string): PaymentListItem => ({ patientId: id, patientName: `N${id}`, addedAt: 1 });
const list = (id: string, status: 'draft' | 'locked', ids: string[]): PaymentList => ({
  id, name: id, periodKey: '2026-07', status, items: ids.map(item), createdAt: 1, updatedAt: 1,
});

describe('paymentListService pure helpers', () => {
  it('assertEditable throws when locked', () => {
    expect(() => assertEditable(list('A', 'locked', []))).toThrow(PaymentListLockedError);
    expect(() => assertEditable(list('A', 'draft', []))).not.toThrow();
  });

  it('applyAddItems skips duplicates', () => {
    const res = applyAddItems([item('1')], [item('1'), item('2'), item('2')]);
    expect(res.map(i => i.patientId)).toEqual(['1', '2']);
  });

  it('applyRemoveItem removes only the target', () => {
    expect(applyRemoveItem([item('1'), item('2')], '1').map(i => i.patientId)).toEqual(['2']);
  });

  it('applyMoveItem moves between drafts', () => {
    const res = applyMoveItem(list('A', 'draft', ['1', '2']), list('B', 'draft', ['3']), '1');
    expect(res.from.map(i => i.patientId)).toEqual(['2']);
    expect(res.to.map(i => i.patientId)).toEqual(['3', '1']);
  });

  it('applyMoveItem rejects when either side is locked', () => {
    expect(() => applyMoveItem(list('A', 'locked', ['1']), list('B', 'draft', []), '1')).toThrow(PaymentListLockedError);
    expect(() => applyMoveItem(list('A', 'draft', ['1']), list('B', 'locked', []), '1')).toThrow(PaymentListLockedError);
  });
});
