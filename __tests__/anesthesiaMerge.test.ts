import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  isAnesthesiaRecord,
  mergeAnesthesiaProcedures,
  parseVNDateTime,
} from '../services/excelProcessor';
import { SurgeryRecord } from '../types';

function createMockRecord(overrides: Partial<SurgeryRecord>): SurgeryRecord {
  return {
    stt: 1,
    patientId: '2600148503',
    patientName: 'PHẠM THỊ HUỆ',
    gender: 'Nữ',
    yob: '1955',
    bhyt: 'GD43',
    ngayCD: '02/10/2026 21:05',
    ngayBD: '02/10/2026 21:10',
    ngayKT: '02/10/2026 22:10',
    tenKT: 'Chích áp xe phần mềm lớn',
    loaiPTTT: 'T2',
    soLuong: 1,
    timeMinutes: 60,
    ptChinh: 'Đào Văn Điệp',
    ptPhu: 'Hoàng Đình Đại',
    bsGM: '',
    ktvGM: '',
    tdc: 'Lại Thị Mùi',
    gv: '',
    machine: '',
    machineCode: '',
    machineId: '',
    start: parseVNDateTime('02/10/2026 21:10'),
    end: parseVNDateTime('02/10/2026 22:10'),
    ...overrides,
  };
}

describe('isAnesthesiaRecord', () => {
  it('detects "Gây mê khác" case-insensitively', () => {
    expect(isAnesthesiaRecord({ tenKT: 'Gây mê khác' })).toBe(true);
    expect(isAnesthesiaRecord({ tenKT: 'gây mê khác' })).toBe(true);
    expect(isAnesthesiaRecord({ tenKT: 'GÂY MÊ KHÁC' })).toBe(true);
    expect(isAnesthesiaRecord({ tenKT: '  gây  mê  khác  ' })).toBe(true);
  });

  it('rejects other surgery/procedure names', () => {
    expect(isAnesthesiaRecord({ tenKT: 'Chích áp xe phần mềm lớn' })).toBe(false);
    expect(isAnesthesiaRecord({ tenKT: 'Phẫu thuật kết hợp xương' })).toBe(false);
    expect(isAnesthesiaRecord({ tenKT: '' })).toBe(false);
    expect(isAnesthesiaRecord({})).toBe(false);
  });
});

describe('mergeAnesthesiaProcedures', () => {
  it('merges single procedure matching "Gây mê khác" (like real file)', () => {
    const procedure = createMockRecord({
      stt: 1,
      tenKT: 'Chích áp xe phần mềm lớn',
      bsGM: '',
      ktvGM: '',
      machine: '',
      machineCode: '',
    });

    const anesthesia = createMockRecord({
      stt: 2,
      tenKT: 'Gây mê khác',
      ptChinh: '',
      ptPhu: '',
      tdc: '',
      bsGM: 'Đồng Thị Thu Huyền',
      ktvGM: 'Vũ Văn Giáp',
      machine: 'Máy GM 01',
      machineCode: 'GM.1.ASUB-0089',
      machineId: 'm1',
    });

    const { processedRecords, mergeSummary } = mergeAnesthesiaProcedures([procedure, anesthesia]);

    // Anesthesia row is removed
    expect(processedRecords).toHaveLength(1);
    expect(processedRecords[0].tenKT).toBe('Chích áp xe phần mềm lớn');
    expect(processedRecords[0].stt).toBe(1);

    // Procedure received anesthesia team and machine
    expect(processedRecords[0].bsGM).toBe('Đồng Thị Thu Huyền');
    expect(processedRecords[0].ktvGM).toBe('Vũ Văn Giáp');
    expect(processedRecords[0].machine).toBe('Máy GM 01');
    expect(processedRecords[0].machineCode).toBe('GM.1.ASUB-0089');
    expect(processedRecords[0].machineId).toBe('m1');

    // Summary assertions
    expect(mergeSummary.mergedCount).toBe(1);
    expect(mergeSummary.targetProceduresCount).toBe(1);
    expect(mergeSummary.orphanCount).toBe(0);
    expect(mergeSummary.mergedItems[0].patientName).toBe('PHẠM THỊ HUỆ');
    expect(mergeSummary.mergedItems[0].mergedProcedures).toHaveLength(1);
  });

  it('merges multiple consecutive procedures under 1 "Gây mê khác"', () => {
    const proc1 = createMockRecord({
      stt: 1,
      tenKT: 'Thủ thuật 1: Nội soi',
      ngayBD: '02/10/2026 08:00',
      ngayKT: '02/10/2026 08:45',
      start: parseVNDateTime('02/10/2026 08:00'),
      end: parseVNDateTime('02/10/2026 08:45'),
    });

    const proc2 = createMockRecord({
      stt: 2,
      tenKT: 'Thủ thuật 2: Sinh thiết',
      ngayBD: '02/10/2026 08:45',
      ngayKT: '02/10/2026 09:30',
      start: parseVNDateTime('02/10/2026 08:45'),
      end: parseVNDateTime('02/10/2026 09:30'),
    });

    const anesthesia = createMockRecord({
      stt: 3,
      tenKT: 'Gây mê khác',
      ngayBD: '02/10/2026 08:00',
      ngayKT: '02/10/2026 09:30',
      start: parseVNDateTime('02/10/2026 08:00'),
      end: parseVNDateTime('02/10/2026 09:30'),
      bsGM: 'Bác Sĩ An',
      ktvGM: 'KTV Bình',
      machineCode: 'MAY-01',
    });

    const { processedRecords, mergeSummary } = mergeAnesthesiaProcedures([proc1, proc2, anesthesia]);

    expect(processedRecords).toHaveLength(2);
    expect(processedRecords[0].bsGM).toBe('Bác Sĩ An');
    expect(processedRecords[0].ktvGM).toBe('KTV Bình');
    expect(processedRecords[0].machineCode).toBe('MAY-01');

    expect(processedRecords[1].bsGM).toBe('Bác Sĩ An');
    expect(processedRecords[1].ktvGM).toBe('KTV Bình');
    expect(processedRecords[1].machineCode).toBe('MAY-01');

    expect(mergeSummary.mergedCount).toBe(1);
    expect(mergeSummary.targetProceduresCount).toBe(2);
    expect(mergeSummary.orphanCount).toBe(0);
  });

  it('handles orphan "Gây mê khác" when no procedure matches the patient', () => {
    const anesthesia = createMockRecord({
      stt: 1,
      patientId: 'BN999999',
      patientName: 'NGUYỄN VĂN MỒ CÔI',
      tenKT: 'Gây mê khác',
      bsGM: 'BS X',
      ktvGM: 'KTV Y',
    });

    const otherPatientProc = createMockRecord({
      stt: 2,
      patientId: 'BN111111',
      patientName: 'LÊ VĂN A',
      tenKT: 'Khâu vết thương',
    });

    const { processedRecords, mergeSummary } = mergeAnesthesiaProcedures([anesthesia, otherPatientProc]);

    // Orphan anesthesia is NOT imported
    expect(processedRecords).toHaveLength(1);
    expect(processedRecords[0].patientId).toBe('BN111111');
    expect(processedRecords[0].bsGM).toBe('');

    // Summary tracks orphan
    expect(mergeSummary.mergedCount).toBe(0);
    expect(mergeSummary.orphanCount).toBe(1);
    expect(mergeSummary.orphanItems[0].patientId).toBe('BN999999');
    expect(mergeSummary.orphanItems[0].patientName).toBe('NGUYỄN VĂN MỒ CÔI');
  });

  it('does not merge if procedure is outside anesthesia time window', () => {
    const procAfter = createMockRecord({
      stt: 1,
      tenKT: 'Thủ thuật trễ',
      ngayBD: '02/10/2026 10:00',
      ngayKT: '02/10/2026 11:00',
      start: parseVNDateTime('02/10/2026 10:00'),
      end: parseVNDateTime('02/10/2026 11:00'),
    });

    const anesthesia = createMockRecord({
      stt: 2,
      tenKT: 'Gây mê khác',
      ngayBD: '02/10/2026 08:00',
      ngayKT: '02/10/2026 09:30',
      start: parseVNDateTime('02/10/2026 08:00'),
      end: parseVNDateTime('02/10/2026 09:30'),
      bsGM: 'Bác Sĩ An',
    });

    const { processedRecords, mergeSummary } = mergeAnesthesiaProcedures([procAfter, anesthesia]);

    expect(processedRecords).toHaveLength(1);
    expect(processedRecords[0].bsGM).toBe(''); // Not merged
    expect(mergeSummary.orphanCount).toBe(1); // Flagged as orphan
  });
});

describe('Real sample file verification (/Users/buiminhkhoi/Documents/TEMP/10. Danh sách PT thang 10-1.xlsx)', () => {
  it('merges PHẠM THỊ HUỆ anesthesia row into Chích áp xe phần mềm lớn', async () => {
    const filePath = '/Users/buiminhkhoi/Documents/TEMP/10. Danh sách PT thang 10-1.xlsx';
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    // Read using processListData
    const { processSurgicalFiles } = await import('../services/excelProcessor');
    const { readFileSync } = await import('fs');
    const buffer = readFileSync(filePath);
    const file = new File([buffer], '10. Danh sách PT thang 10-1.xlsx');

    const result = await processSurgicalFiles(file, {
      departments: ['Gây mê hồi sức', 'Ngoại'],
      departmentDetails: {
        'Gây mê hồi sức': { includeInReport: true },
        'Ngoại': { includeInReport: true },
      },
      reportRoleFilters: {
        ptChinh: true,
        ptPhu: true,
        bsGM: true,
        ktvGM: true,
        tdc: true,
      },
      staffList: [
        { name: 'Đồng Thị Thu Huyền', position: 'Bác sĩ', department: 'Gây mê hồi sức', active: true },
        { name: 'Đào Văn Điệp', position: 'Bác sĩ', department: 'Ngoại', active: true },
      ],
      machineRegistry: [
        {
          machineId: 'gm1',
          machineName: 'Máy GM 01',
          machineCode: 'GM.1.ASUB-0089',
          active: true,
        },
      ],
    } as any);

    expect(result.success).toBe(true);

    // Verify summary exists
    expect(result.anesthesiaMergeSummary).toBeDefined();
    expect(result.anesthesiaMergeSummary!.mergedCount).toBe(1);
    expect(result.anesthesiaMergeSummary!.targetProceduresCount).toBe(1);
    expect(result.anesthesiaMergeSummary!.orphanCount).toBe(0);

    // Find the merged procedure
    const hueRecord = result.validRecords.find((r) => r.patientId === '2600148503');
    expect(hueRecord).toBeDefined();
    expect(hueRecord!.patientName).toBe('PHẠM THỊ HUỆ');
    expect(hueRecord!.tenKT).toBe('Chích áp xe phần mềm lớn');
    expect(hueRecord!.ptChinh).toBe('Đào Văn Điệp');
    expect(hueRecord!.ptPhu).toBe('Hoàng Đình Đại');
    expect(hueRecord!.bsGM).toBe('Đồng Thị Thu Huyền');
    expect(hueRecord!.ktvGM).toBe('Vũ Văn Giáp');
    expect(hueRecord!.machineCode).toBe('GM.1.ASUB-0089');

    // Confirm that NO record has tenKT 'Gây mê khác'
    const gmRecord = result.validRecords.find((r) => isAnesthesiaRecord(r));
    expect(gmRecord).toBeUndefined();
  });
});
