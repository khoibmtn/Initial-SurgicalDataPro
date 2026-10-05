import { describe, it, expect } from 'vitest';
import { buildPackagePaymentRows, filterPackageRows } from '../services/packagePaymentRows';
import type {
  PositionCatalogItem,
  ServicePackageAssignment,
  ServicePackageDefinition,
} from '../types/servicePackage';
import type { StaffMember } from '../types';

const pos = (positionKey: string, positionLabel: string, amount: number) => ({
  positionId: positionKey,
  positionKey,
  positionLabel,
  amount,
});

const pkgNgoai = {
  id: 'ngoai',
  name: 'Ngoại',
  positions: [pos('ptChinh', 'PTV chính', 700_000), pos('chuanBiPT', 'Chuẩn bị PT', 110_000), pos('nguoiTuVan', 'Tư vấn', 200_000)],
} as unknown as ServicePackageDefinition;

const pkgSan = {
  id: 'san',
  name: 'Sản',
  deduction: { type: 'percent', value: 10 },
  positions: [pos('ptChinh', 'PTV chính', 500_000), pos('hoSinh', 'HS chuẩn bị', 100_000), pos('nguoiTuVan', 'Tư vấn', 200_000)],
} as unknown as ServicePackageDefinition;

const catalog = [
  { key: 'chuanBiPT', label: 'Điều dưỡng chuẩn bị BN', sortOrder: 7 },
  { key: 'hoSinh', label: 'Hộ sinh chuẩn bị BN', sortOrder: 8 },
  { key: 'nguoiTuVan', label: 'Người tư vấn', sortOrder: 9 },
] as unknown as PositionCatalogItem[];

const staffList = [{ id: '1', name: 'Quý', department: 'CTCH', taxId: '123' }] as unknown as StaffMember[];

const sa = (positionKey: string, staffName: string, amount: number) => ({
  positionId: positionKey,
  positionKey,
  positionLabel: positionKey,
  staffName,
  amount,
  autoFilled: false,
});

const assignment = (packageId: string, staff: ReturnType<typeof sa>[]) =>
  ({ packageId, packageName: packageId, staffAssignments: staff } as unknown as ServicePackageAssignment);

describe('buildPackagePaymentRows', () => {
  it('adds one virtual row per unassigned position with per-package counts', () => {
    const assignments = [
      assignment('ngoai', [sa('ptChinh', 'Quý', 700_000)]),
      assignment('ngoai', [sa('ptChinh', 'Quý', 700_000)]),
      assignment('san', [sa('ptChinh', 'Quý', 500_000)]),
    ];
    const rows = buildPackagePaymentRows(assignments, [pkgNgoai, pkgSan], staffList, catalog);

    expect(rows.map(r => r.staffName)).toEqual([
      'Quý',
      'Điều dưỡng chuẩn bị BN',
      'Hộ sinh chuẩn bị BN',
      'Người tư vấn',
    ]);
    const tuVan = rows.find(r => r.staffName === 'Người tư vấn')!;
    expect(tuVan.isUnassigned).toBe(true);
    expect(tuVan.cells.ngoai.nguoiTuVan.count).toBe(2);
    expect(tuVan.cells.san.nguoiTuVan.count).toBe(1);
    expect(rows.find(r => r.staffName === 'Hộ sinh chuẩn bị BN')!.cells.ngoai).toBeUndefined();
  });

  it('values unassigned cells at net pay (after deduction) and counts them in totals', () => {
    const rows = buildPackagePaymentRows([assignment('san', [sa('ptChinh', 'Quý', 500_000)])], [pkgSan], staffList, catalog);
    const tuVan = rows.find(r => r.staffName === 'Người tư vấn')!;
    expect(tuVan.cells.san.nguoiTuVan.amount).toBe(180_000);
    expect(tuVan.total).toBe(180_000);
    expect(tuVan.totalCount).toBe(1);
  });

  it('treats a saved blank staff name as unassigned and keeps real staff first', () => {
    const rows = buildPackagePaymentRows(
      [assignment('ngoai', [sa('ptChinh', '', 700_000), sa('chuanBiPT', 'Quý', 110_000), sa('nguoiTuVan', '  ', 200_000)])],
      [pkgNgoai],
      staffList,
      catalog,
    );
    expect(rows[0].isUnassigned).toBe(false);
    expect(rows[0].staffName).toBe('Quý');
    expect(rows.slice(1).map(r => r.cells.ngoai && Object.keys(r.cells.ngoai)[0])).toEqual(['nguoiTuVan', 'ptChinh']);
  });

  it('falls back to the position label when the catalog is unavailable', () => {
    const rows = buildPackagePaymentRows([assignment('ngoai', [sa('ptChinh', 'Quý', 700_000)])], [pkgNgoai], staffList);
    expect(rows.map(r => r.staffName)).toContain('Tư vấn');
  });

  it('returns no virtual rows when every position is assigned', () => {
    const rows = buildPackagePaymentRows(
      [assignment('ngoai', [sa('ptChinh', 'Quý', 700_000), sa('chuanBiPT', 'Quý', 110_000), sa('nguoiTuVan', 'Quý', 200_000)])],
      [pkgNgoai],
      staffList,
      catalog,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('buildPackagePaymentRows ordering (same logic as PTTT payment table)', () => {
  const members = [
    { id: '1', name: 'An', department: 'GMHS', position: 'Phụ', taxId: '1' },
    { id: '2', name: 'Bình', department: 'Ngoại', position: 'BS PT', taxId: '2' },
    { id: '3', name: 'Chi', department: 'GMHS', position: 'BS GMHS', taxId: '3' },
    { id: '4', name: 'Dũng', department: 'Ngoại', position: 'BS PT', taxId: '4' },
  ] as unknown as StaffMember[];
  const cat = [
    { key: 'ptChinh', label: 'PTV chính', sortOrder: 1 },
    { key: 'ptPhu', label: 'PTV phụ', sortOrder: 2 },
  ] as unknown as PositionCatalogItem[];
  const pkg = {
    id: 'p',
    name: 'P',
    positions: [pos('ptChinh', 'PTV chính', 1), pos('ptPhu', 'PTV phụ', 1)],
  } as unknown as ServicePackageDefinition;

  it('orders by configured department order, then staff position, then position order', () => {
    const rows = buildPackagePaymentRows(
      [assignment('p', [sa('ptPhu', 'Dũng', 1), sa('ptChinh', 'Bình', 1)]), assignment('p', [sa('ptChinh', 'An', 1), sa('ptPhu', 'Chi', 1)])],
      [pkg],
      members,
      cat,
      ['Ngoại', 'GMHS'],
    );
    expect(rows.map(r => r.staffName)).toEqual(['Bình', 'Dũng', 'Chi', 'An']);
  });

  it('filters rows by department, name or package name', () => {
    const rows = buildPackagePaymentRows([assignment('p', [sa('ptChinh', 'Bình', 1), sa('ptPhu', 'An', 1)])], [pkg], members, cat);
    expect(filterPackageRows(rows, 'ngoại', [pkg]).map(r => r.staffName)).toEqual(['Bình']);
    expect(filterPackageRows(rows, '', [pkg])).toHaveLength(rows.length);
    expect(filterPackageRows(rows, 'zzz', [pkg])).toHaveLength(0);
  });
});

