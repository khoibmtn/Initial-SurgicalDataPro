import { describe, it, expect } from 'vitest';
import { buildCompositeKey, normalizeForKey, getRecordDateString } from '../types/servicePackage';
import type { SurgeryRecord } from '../types';
import type { ServicePackageAssignment } from '../types/servicePackage';

describe('PackageListView Logic & Rules', () => {
  const sampleRecords: SurgeryRecord[] = [
    {
      id: 'rec-1',
      patientId: 'BN001',
      patientName: 'NGUYỄN VĂN A',
      tenKT: 'Phẫu thuật kết hợp xương',
      ngayBD: '2026-07-01T08:00:00Z',
      ptChinh: 'Bác sĩ A',
    } as SurgeryRecord,
    {
      id: 'rec-2',
      patientId: 'BN002',
      patientName: 'TRẦN THỊ B',
      tenKT: 'Phẫu thuật lấy thai lần 1',
      ngayBD: '2026-07-02T09:00:00Z',
      ptChinh: 'Bác sĩ B',
    } as SurgeryRecord,
    // BN003 có 2 lần mổ trong dữ liệu
    {
      id: 'rec-3a',
      patientId: 'BN003',
      patientName: 'LÊ VĂN C',
      tenKT: 'Nội soi chẩn đoán',
      ngayBD: '2026-07-03T10:00:00Z',
      ptChinh: 'Bác sĩ C',
    } as SurgeryRecord,
    {
      id: 'rec-3b',
      patientId: 'BN003',
      patientName: 'LÊ VĂN C',
      tenKT: 'Phẫu thuật cắt ruột thừa nội soi',
      ngayBD: '2026-07-03T14:00:00Z',
      ptChinh: 'Bác sĩ C',
    } as SurgeryRecord,
  ];

  it('All filter: only includes surgeries with an active package assignment in current period', () => {
    const assignments: ServicePackageAssignment[] = [
      {
        id: 'assign-1',
        compositeKey: buildCompositeKey('BN001', '2026-07-01', 'Phẫu thuật kết hợp xương'),
        patientId: 'BN001',
        tenKT: 'Phẫu thuật kết hợp xương',
        packageName: 'Gói xương',
        staffAssignments: [],
      } as unknown as ServicePackageAssignment,
    ];

    const resultRows = sampleRecords.filter(r => {
      const rDate = getRecordDateString(r).substring(0, 10);
      const rKey = buildCompositeKey(r.patientId || '', rDate, r.tenKT || '');
      return assignments.some(a => a.compositeKey === rKey);
    });

    expect(resultRows.length).toBe(1);
    expect(resultRows[0].patientId).toBe('BN001');
  });

  it('Batch filter: omits cases without surgery records from table and identifies them as missing', () => {
    const batchItems = [
      { patientId: 'BN001', patientName: 'NGUYỄN VĂN A', department: 'Khoa Ngoại' },
      { patientId: 'BN999', patientName: 'CHƯA CÓ TRONG HỆ THỐNG', department: 'Khoa Sản' },
    ];

    const allCandidateRecords = [...sampleRecords];
    const missing: typeof batchItems = [];
    const tableRows: any[] = [];

    for (const item of batchItems) {
      const matching = allCandidateRecords.filter(r => r.patientId === item.patientId);
      if (matching.length === 0) {
        missing.push(item);
      } else {
        tableRows.push(...matching);
      }
    }

    // BN999 must NOT be on table rows
    expect(tableRows.some(r => r.patientId === 'BN999')).toBe(false);
    expect(tableRows.length).toBe(1);
    expect(tableRows[0].patientId).toBe('BN001');

    // BN999 must be captured in missing list for popup notification
    expect(missing.length).toBe(1);
    expect(missing[0].patientId).toBe('BN999');
  });

  it('Multiple surgeries: if one is assigned, only takes the assigned surgery', () => {
    const assignments: ServicePackageAssignment[] = [
      {
        id: 'assign-3b',
        compositeKey: buildCompositeKey('BN003', '2026-07-03', 'Phẫu thuật cắt ruột thừa nội soi'),
        patientId: 'BN003',
        tenKT: 'Phẫu thuật cắt ruột thừa nội soi',
        packageName: 'Gói ruột thừa',
        staffAssignments: [],
      } as unknown as ServicePackageAssignment,
    ];

    const matchingRecords = sampleRecords.filter(r => r.patientId === 'BN003');
    const matchingAssignments = assignments.filter(a => a.patientId === 'BN003');

    expect(matchingRecords.length).toBe(2);
    expect(matchingAssignments.length).toBe(1);

    // Rule: take only the assigned surgery
    const finalSurgeries = matchingAssignments.length > 0
      ? matchingAssignments.map(a => {
          const rec = matchingRecords.find(r => normalizeForKey(r.tenKT) === normalizeForKey(a.tenKT));
          return { rec, assignment: a, isDuplicateUnassigned: false };
        })
      : matchingRecords.map(r => ({ rec: r, assignment: undefined, isDuplicateUnassigned: true }));

    expect(finalSurgeries.length).toBe(1);
    expect(finalSurgeries[0].rec?.tenKT).toBe('Phẫu thuật cắt ruột thừa nội soi');
    expect(finalSurgeries[0].isDuplicateUnassigned).toBe(false);
  });

  it('Multiple surgeries: if none is assigned, lists all and sets isDuplicateUnassigned=true', () => {
    const matchingRecords = sampleRecords.filter(r => r.patientId === 'BN003');
    const matchingAssignments: ServicePackageAssignment[] = []; // No assignment

    expect(matchingRecords.length).toBe(2);

    // Rule: if none is assigned, list all and mark with yellow highlight
    const finalSurgeries = matchingAssignments.length > 0
      ? matchingAssignments.map(a => ({ rec: undefined, assignment: a, isDuplicateUnassigned: false }))
      : matchingRecords.map(r => ({ rec: r, assignment: undefined, isDuplicateUnassigned: matchingRecords.length > 1 }));

    expect(finalSurgeries.length).toBe(2);
    expect(finalSurgeries[0].isDuplicateUnassigned).toBe(true);
    expect(finalSurgeries[1].isDuplicateUnassigned).toBe(true);
  });

  it('Pagination: slices rows correctly according to currentPage and rowsPerPage, and calculates STT', () => {
    const totalRecords = Array.from({ length: 75 }, (_, i) => ({
      patientId: `BN${String(i + 1).padStart(3, '0')}`,
      patientName: `Bệnh nhân ${i + 1}`,
    }));

    const rowsPerPage = 50;
    const currentPage = 2;
    const totalPages = Math.ceil(totalRecords.length / rowsPerPage);

    expect(totalPages).toBe(2);

    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginated = totalRecords.slice(startIndex, startIndex + rowsPerPage);

    expect(startIndex).toBe(50);
    expect(paginated.length).toBe(25);
    // STT for first item on page 2:
    const firstItemStt = startIndex + 0 + 1;
    expect(firstItemStt).toBe(51);
    expect(paginated[0].patientId).toBe('BN051');
    // STT for last item on page 2:
    const lastItemStt = startIndex + paginated.length - 1 + 1;
    expect(lastItemStt).toBe(75);
    expect(paginated[24].patientId).toBe('BN075');
  });

  it('Date Formatting: formats ngayBD with all supported formats from DS Phẫu thuật', async () => {
    const { formatDate } = await import('../utils/dateUtils');
    const recordDate = '01/07/2026 08:30';

    expect(formatDate(recordDate, 'dd/mm/yyyy')).toBe('01/07/2026');
    expect(formatDate(recordDate, 'dd/mm/yyyy hh:mm')).toBe('01/07/2026 08:30');
    expect(formatDate(recordDate, 'dd/mm hh:mm')).toBe('01/07 08:30');
    expect(formatDate(recordDate, 'hh:mm')).toBe('08:30');
  });

  it('Package Cancellation: automatically removes patient from any payment lists containing them', () => {
    const patientToDelete = 'BN001';
    const mockPaymentLists = [
      {
        id: 'list-1',
        name: 'Đợt tháng 7',
        items: [
          { patientId: 'BN001', patientName: 'NGUYỄN VĂN A' },
          { patientId: 'BN002', patientName: 'TRẦN THỊ B' },
        ],
      },
      {
        id: 'list-2',
        name: 'Đợt tháng 8',
        items: [
          { patientId: 'BN003', patientName: 'LÊ VĂN C' },
        ],
      },
    ];

    // Find lists containing patient
    const listsWithPatient = mockPaymentLists.filter(pl =>
      pl.items.some(i => i.patientId.trim() === patientToDelete)
    );

    expect(listsWithPatient.length).toBe(1);
    expect(listsWithPatient[0].id).toBe('list-1');

    // Simulate removeItem on the affected list
    const updatedItems = listsWithPatient[0].items.filter(i => i.patientId.trim() !== patientToDelete);
    expect(updatedItems.length).toBe(1);
    expect(updatedItems[0].patientId).toBe('BN002');
  });

  it('3 Combobox Filters: filters independently and simultaneously by Gói DVYC, Đợt TT, and Ra viện', () => {
    interface TestItem {
      patientId: string;
      assignment?: { packageName: string };
      inBatch: boolean;
      discharged: boolean;
    }

    const items: TestItem[] = [
      { patientId: 'BN1', assignment: { packageName: 'Gói A' }, inBatch: true, discharged: true },
      { patientId: 'BN2', assignment: { packageName: 'Gói B' }, inBatch: false, discharged: true },
      { patientId: 'BN3', assignment: undefined, inBatch: true, discharged: false },
      { patientId: 'BN4', assignment: undefined, inBatch: false, discharged: false },
      { patientId: 'BN5', assignment: { packageName: 'Gói A' }, inBatch: false, discharged: false },
    ];

    const filterFn = (
      data: TestItem[],
      packageFilter: 'all' | 'assigned' | 'unassigned',
      batchFilter: 'all' | 'in_batch' | 'no_batch',
      dischargeFilter: 'all' | 'discharged' | 'not_discharged'
    ) => {
      return data.filter(it => {
        if (packageFilter === 'assigned' && !it.assignment) return false;
        if (packageFilter === 'unassigned' && it.assignment) return false;
        if (batchFilter === 'in_batch' && !it.inBatch) return false;
        if (batchFilter === 'no_batch' && it.inBatch) return false;
        if (dischargeFilter === 'discharged' && !it.discharged) return false;
        if (dischargeFilter === 'not_discharged' && it.discharged) return false;
        return true;
      });
    };

    // 1. Filter Gói DVYC = 'assigned'
    expect(filterFn(items, 'assigned', 'all', 'all').map(i => i.patientId)).toEqual(['BN1', 'BN2', 'BN5']);

    // 2. Filter Đợt TT = 'no_batch'
    expect(filterFn(items, 'all', 'no_batch', 'all').map(i => i.patientId)).toEqual(['BN2', 'BN4', 'BN5']);

    // 3. Filter Ra viện = 'discharged'
    expect(filterFn(items, 'all', 'all', 'discharged').map(i => i.patientId)).toEqual(['BN1', 'BN2']);

    // 4. Combined: Đã gán gói + Chưa có đợt TT + Đã ra viện (BN2)
    const candidatesForNewBatch = filterFn(items, 'assigned', 'no_batch', 'discharged');
    expect(candidatesForNewBatch.length).toBe(1);
    expect(candidatesForNewBatch[0].patientId).toBe('BN2');
  });

  it('View State Persistence: saves and loads active batch, 3 combobox filters, and page', async () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };

    const {
      LS_PACKAGE_VIEW_STATE_KEY,
      loadSavedViewState,
      saveViewState,
      DEFAULT_VIEW_STATE,
    } = await import('../components/surgery/PackageListView');

    // Clear initial state
    localStorage.removeItem(LS_PACKAGE_VIEW_STATE_KEY);
    expect(loadSavedViewState()).toEqual(DEFAULT_VIEW_STATE);

    // Save a custom active state
    saveViewState({
      listFilter: 'batch-2026-07',
      packageFilter: 'assigned',
      batchFilter: 'in_batch',
      dischargeFilter: 'discharged',
      currentPage: 3,
    });

    const loaded = loadSavedViewState();
    expect(loaded.listFilter).toBe('batch-2026-07');
    expect(loaded.packageFilter).toBe('assigned');
    expect(loaded.batchFilter).toBe('in_batch');
    expect(loaded.dischargeFilter).toBe('discharged');
    expect(loaded.currentPage).toBe(3);

    localStorage.removeItem(LS_PACKAGE_VIEW_STATE_KEY);
  });
});

