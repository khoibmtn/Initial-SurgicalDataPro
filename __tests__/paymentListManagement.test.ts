import { describe, it, expect } from 'vitest';
import type { PaymentList } from '../types/paymentList';

describe('Payment List Management & Combobox Logic', () => {
  const sampleLists: PaymentList[] = [
    {
      id: 'list-2025-12',
      name: 'thang 12',
      periodKey: '2025-12',
      status: 'locked',
      items: new Array(50).fill({ patientId: 'p', patientName: 'N', addedAt: 1 }),
      createdAt: new Date('2025-12-28T10:00:00Z').getTime(),
      updatedAt: new Date('2025-12-28T10:00:00Z').getTime(),
      createdBy: 'Admin',
    },
    {
      id: 'list-2026-07',
      name: 'thang 7',
      periodKey: '2026-07',
      status: 'draft',
      items: new Array(88).fill({ patientId: 'p', patientName: 'N', addedAt: 1 }),
      createdAt: new Date('2026-07-15T08:30:00Z').getTime(),
      updatedAt: new Date('2026-07-16T09:00:00Z').getTime(),
      createdBy: 'BacSiKhoi',
      updatedBy: 'Admin',
    },
    {
      id: 'list-2026-08',
      name: 'thang 8',
      periodKey: '2026-08',
      status: 'draft',
      items: new Array(30).fill({ patientId: 'p', patientName: 'N', addedAt: 1 }),
      createdAt: new Date('2026-08-10T14:00:00Z').getTime(),
      updatedAt: new Date('2026-08-10T14:00:00Z').getTime(),
      createdBy: 'BacSiKhoi',
    },
    {
      id: 'list-2027-01',
      name: 'thang 1',
      periodKey: '2027-01',
      status: 'draft',
      items: new Array(40).fill({ patientId: 'p', patientName: 'N', addedAt: 1 }),
      createdAt: new Date('2027-01-20T11:00:00Z').getTime(),
      updatedAt: new Date('2027-01-20T11:00:00Z').getTime(),
      createdBy: 'Admin',
    },
  ];

  function getBatchYear(l: PaymentList): number {
    return l.createdAt
      ? new Date(l.createdAt).getFullYear()
      : (parseInt(l.periodKey?.slice(0, 4), 10) || new Date().getFullYear());
  }

  function getBatchFormattedName(l: PaymentList): string {
    const y = getBatchYear(l);
    return `${y} - ${l.name} (${l.items.length} ca)`;
  }

  function extractReportYears(dateFrom?: string, dateTo?: string, periodKey?: string): number[] {
    const set = new Set<number>();
    if (dateFrom) {
      const y = parseInt(dateFrom.slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    if (dateTo) {
      const y = parseInt(dateTo.slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    if (set.size === 0 && periodKey) {
      const y = parseInt(periodKey.slice(0, 4), 10);
      if (!isNaN(y)) set.add(y);
    }
    if (set.size === 0) set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => a - b);
  }

  it('formats batch name with year and case count: 2026 - thang 7 (88 ca)', () => {
    const list7 = sampleLists.find(l => l.id === 'list-2026-07')!;
    expect(getBatchFormattedName(list7)).toBe('2026 - thang 7 (88 ca)');
  });

  it('extracts report years correctly for single month (07/2026)', () => {
    const years = extractReportYears('2026-07-01', '2026-07-31');
    expect(years).toEqual([2026]);
  });

  it('extracts report years correctly for cross-year period (31/12/2026 - 31/01/2027)', () => {
    const years = extractReportYears('2026-12-31', '2027-01-31');
    expect(years).toEqual([2026, 2027]);
  });

  it('filters candidate lists strictly to the years of report by default', () => {
    const reportYears = extractReportYears('2026-07-01', '2026-07-31'); // [2026]
    const candidates = sampleLists.filter(l => reportYears.includes(getBatchYear(l)));

    expect(candidates.map(c => c.id)).toEqual(['list-2026-07', 'list-2026-08']);
    expect(candidates.some(c => c.id === 'list-2025-12')).toBe(false);
    expect(candidates.some(c => c.id === 'list-2027-01')).toBe(false);
  });

  it('filters candidate lists for cross-year period to 2026 and 2027', () => {
    const reportYears = extractReportYears('2026-12-31', '2027-01-31'); // [2026, 2027]
    const candidates = sampleLists.filter(l => reportYears.includes(getBatchYear(l)));

    expect(candidates.map(c => c.id)).toEqual(['list-2026-07', 'list-2026-08', 'list-2027-01']);
    expect(candidates.some(c => c.id === 'list-2025-12')).toBe(false);
  });

  it('modal table year filter separates batches by year created', () => {
    const year2025 = sampleLists.filter(l => getBatchYear(l) === 2025);
    expect(year2025.length).toBe(1);
    expect(year2025[0].id).toBe('list-2025-12');

    const year2026 = sampleLists.filter(l => getBatchYear(l) === 2026);
    expect(year2026.length).toBe(2);
  });
});
