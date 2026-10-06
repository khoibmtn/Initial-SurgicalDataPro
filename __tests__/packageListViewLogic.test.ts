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
});
