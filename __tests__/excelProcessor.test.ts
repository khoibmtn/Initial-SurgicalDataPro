/**
 * Test Nhóm C: Excel Processing
 * Kiểm thử thuật toán phân tích, chuẩn hóa và validate dữ liệu Excel đầu vào.
 */
import { describe, it, expect } from 'vitest';
import {
  parseVNDateTime,
  determineLoaiPT,
  determineLoaiTT,
  determineLoaiPTTT,
  checkDuplicateSurgeriesInExcel,
  filterSurgicalRecordsByDepartment,
} from '../services/excelProcessor';
import { SurgeryRecord } from '../types';
import { AppConfig } from '../contexts/ConfigContext';

// ─── parseVNDateTime ────────────────────────────────────────────────────────

describe('parseVNDateTime', () => {
  it('"15/06/2026 14:30" → Date chính xác', () => {
    const result = parseVNDateTime('15/06/2026 14:30');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(5); // June = 5 (0-indexed)
    expect(result!.getDate()).toBe(15);
    expect(result!.getHours()).toBe(14);
    expect(result!.getMinutes()).toBe(30);
  });

  it('"01/01/2026" (chỉ ngày, không giờ) → Date với 00:00', () => {
    const result = parseVNDateTime('01/01/2026');
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
  });

  it('null → null', () => {
    expect(parseVNDateTime(null)).toBeNull();
  });

  it('undefined → null', () => {
    expect(parseVNDateTime(undefined)).toBeNull();
  });

  it('chuỗi rỗng → null', () => {
    expect(parseVNDateTime('')).toBeNull();
  });

  it('"10/09/2026 07:00" → đúng giờ bắt đầu HC', () => {
    const result = parseVNDateTime('10/09/2026 07:00');
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(7);
  });

  it('"31/12/2026 23:59" → đúng cuối ngày', () => {
    const result = parseVNDateTime('31/12/2026 23:59');
    expect(result).not.toBeNull();
    expect(result!.getDate()).toBe(31);
    expect(result!.getMonth()).toBe(11); // Dec
    expect(result!.getHours()).toBe(23);
    expect(result!.getMinutes()).toBe(59);
  });
});

// ─── determineLoaiPTTT ─────────────────────────────────────────────────────

describe('determineLoaiPT', () => {
  it('cột J (index 9) có giá trị → "ĐB"', () => {
    const row = new Array(28).fill(null);
    row[9] = 'x';
    expect(determineLoaiPT(row)).toBe('ĐB');
  });

  it('cột K (index 10) có giá trị → "1"', () => {
    const row = new Array(28).fill(null);
    row[10] = 'x';
    expect(determineLoaiPT(row)).toBe('1');
  });

  it('cột L (index 11) có giá trị → "2"', () => {
    const row = new Array(28).fill(null);
    row[11] = 'x';
    expect(determineLoaiPT(row)).toBe('2');
  });

  it('cột M (index 12) có giá trị → "3"', () => {
    const row = new Array(28).fill(null);
    row[12] = 'x';
    expect(determineLoaiPT(row)).toBe('3');
  });

  it('không cột nào → ""', () => {
    const row = new Array(28).fill(null);
    expect(determineLoaiPT(row)).toBe('');
  });
});

describe('determineLoaiTT', () => {
  it('cột N (index 13) có giá trị → "ĐB"', () => {
    const row = new Array(28).fill(null);
    row[13] = 'x';
    expect(determineLoaiTT(row)).toBe('ĐB');
  });

  it('cột R (index 17) có giá trị → "KPL"', () => {
    const row = new Array(28).fill(null);
    row[17] = 'x';
    expect(determineLoaiTT(row)).toBe('KPL');
  });
});

describe('determineLoaiPTTT', () => {
  it('phẫu thuật loại ĐB → "PĐB"', () => {
    const row = new Array(28).fill(null);
    row[9] = 'x';
    expect(determineLoaiPTTT(row)).toBe('PĐB');
  });

  it('phẫu thuật loại 1 → "P1"', () => {
    const row = new Array(28).fill(null);
    row[10] = 'x';
    expect(determineLoaiPTTT(row)).toBe('P1');
  });

  it('thủ thuật loại 2 → "T2"', () => {
    const row = new Array(28).fill(null);
    row[15] = 'x'; // cột P = thủ thuật loại 2
    expect(determineLoaiPTTT(row)).toBe('T2');
  });

  it('thủ thuật KPL → "TKPL"', () => {
    const row = new Array(28).fill(null);
    row[17] = 'x';
    expect(determineLoaiPTTT(row)).toBe('TKPL');
  });

  it('không có cột nào → ""', () => {
    const row = new Array(28).fill(null);
    expect(determineLoaiPTTT(row)).toBe('');
  });

  it('ưu tiên phẫu thuật trước thủ thuật nếu cả hai đều có', () => {
    const row = new Array(28).fill(null);
    row[9] = 'x';   // PT ĐB
    row[14] = 'x';  // TT loại 1
    expect(determineLoaiPTTT(row)).toBe('PĐB');
  });
});

// ─── checkDuplicateSurgeriesInExcel ─────────────────────────────────────────

describe('checkDuplicateSurgeriesInExcel', () => {
  // Simulate minimal Excel data layout (header rows 0-7, data from row 8+)
  function makeExcelData(rows: Array<{ stt: number; name: string; ngayBD: string; ngayKT: string; tenKT: string; maBN: string }>): any[][] {
    // 8 header rows (indices 0-7)
    const data: any[][] = Array.from({ length: 8 }, () => []);
    rows.forEach(r => {
      const row = new Array(28).fill(null);
      row[0] = r.stt;
      row[1] = r.name;
      row[6] = r.ngayBD;
      row[7] = r.ngayKT;
      row[8] = r.tenKT;
      row[20] = r.maBN;
      data.push(row);
    });
    return data;
  }

  it('2 dòng trùng BN + PT + thời gian → phát hiện trùng', () => {
    const data = makeExcelData([
      { stt: 1, name: 'Nguyễn A', ngayBD: '10/09/2026 08:00', ngayKT: '10/09/2026 10:00', tenKT: 'Cắt ruột thừa', maBN: 'BN001' },
      { stt: 2, name: 'Nguyễn A', ngayBD: '10/09/2026 08:00', ngayKT: '10/09/2026 10:00', tenKT: 'Cắt ruột thừa', maBN: 'BN001' },
    ]);
    const error = checkDuplicateSurgeriesInExcel(data);
    expect(error).not.toBeNull();
    expect(error).toContain('trùng lặp');
  });

  it('2 dòng khác BN → KHÔNG trùng', () => {
    const data = makeExcelData([
      { stt: 1, name: 'Nguyễn A', ngayBD: '10/09/2026 08:00', ngayKT: '10/09/2026 10:00', tenKT: 'Cắt ruột thừa', maBN: 'BN001' },
      { stt: 2, name: 'Trần B', ngayBD: '10/09/2026 08:00', ngayKT: '10/09/2026 10:00', tenKT: 'Cắt ruột thừa', maBN: 'BN002' },
    ]);
    const error = checkDuplicateSurgeriesInExcel(data);
    expect(error).toBeNull();
  });

  it('cùng BN, khác PT → KHÔNG trùng', () => {
    const data = makeExcelData([
      { stt: 1, name: 'Nguyễn A', ngayBD: '10/09/2026 08:00', ngayKT: '10/09/2026 10:00', tenKT: 'Cắt ruột thừa', maBN: 'BN001' },
      { stt: 2, name: 'Nguyễn A', ngayBD: '10/09/2026 08:00', ngayKT: '10/09/2026 10:00', tenKT: 'Dẫn lưu ổ bụng', maBN: 'BN001' },
    ]);
    const error = checkDuplicateSurgeriesInExcel(data);
    expect(error).toBeNull();
  });

  it('mảng rỗng (chỉ header) → KHÔNG trùng', () => {
    const data = makeExcelData([]);
    const error = checkDuplicateSurgeriesInExcel(data);
    expect(error).toBeNull();
  });
});

// ─── filterSurgicalRecordsByDepartment ──────────────────────────────────────

describe('filterSurgicalRecordsByDepartment', () => {
  function makeRec(overrides: Partial<SurgeryRecord> = {}): SurgeryRecord {
    return {
      stt: 1,
      patientId: 'BN001',
      patientName: 'Nguyễn A',
      gender: 'Nam',
      yob: '1980',
      bhyt: '',
      ngayCD: '',
      ngayBD: '10/09/2026 08:00',
      ngayKT: '10/09/2026 10:00',
      tenKT: 'Cắt ruột thừa',
      loaiPTTT: 'P2',
      soLuong: 1,
      timeMinutes: 120,
      ptChinh: 'BS Nguyễn A',
      ptPhu: '',
      bsGM: '',
      ktvGM: '',
      tdc: '',
      gv: '',
      machine: '',
      machineCode: '',
      machineId: '',
      start: new Date(2026, 8, 10, 8, 0),
      end: new Date(2026, 8, 10, 10, 0),
      key: 'BN001-test',
      excelRowIndex: 9,
      ...overrides,
    };
  }

  it('NV thuộc khoa cho phép → include ca mổ', () => {
    const config: AppConfig = {
      departments: ['Ngoại TH'],
      departmentDetails: { 'Ngoại TH': { fullName: 'Khoa Ngoại Tổng Hợp', includeInReport: true } },
      staffList: [{ name: 'BS Nguyễn A', department: 'Ngoại TH', position: 'BS PT' }],
      reportRoleFilters: { ptChinh: true, ptPhu: true, bsGM: true, ktvGM: true, tdc: true },
    };
    const records = [makeRec()];
    const { filteredRecords, filterSummary } = filterSurgicalRecordsByDepartment(records, config);
    expect(filteredRecords).toHaveLength(1);
    expect(filterSummary.importedCount).toBe(1);
  });

  it('NV thuộc khoa KHÔNG cho phép → exclude ca mổ', () => {
    const config: AppConfig = {
      departments: ['Ngoại TH'],
      departmentDetails: { 'Ngoại TH': { fullName: 'Khoa Ngoại Tổng Hợp', includeInReport: false } },
      staffList: [{ name: 'BS Nguyễn A', department: 'Ngoại TH', position: 'BS PT' }],
      reportRoleFilters: { ptChinh: true, ptPhu: true, bsGM: true, ktvGM: true, tdc: true },
    };
    const records = [makeRec()];
    const { filteredRecords, filterSummary } = filterSurgicalRecordsByDepartment(records, config);
    expect(filteredRecords).toHaveLength(0);
    expect(filterSummary.excludedCount).toBe(1);
  });

  it('NV không có trong danh mục nhân sự → missingStaffCount tăng', () => {
    const config: AppConfig = {
      departments: ['Ngoại TH'],
      departmentDetails: { 'Ngoại TH': { fullName: 'Khoa Ngoại Tổng Hợp', includeInReport: true } },
      staffList: [], // Danh mục rỗng
      reportRoleFilters: { ptChinh: true, ptPhu: true, bsGM: true, ktvGM: true, tdc: true },
    };
    const records = [makeRec()];
    const { filteredRecords, filterSummary } = filterSurgicalRecordsByDepartment(records, config);
    expect(filteredRecords).toHaveLength(0);
    expect(filterSummary.missingStaffCount).toBe(1);
  });

  it('tắt hết tất cả role filters → không import ca nào', () => {
    const config: AppConfig = {
      departments: ['Ngoại TH'],
      departmentDetails: { 'Ngoại TH': { fullName: 'Khoa Ngoại Tổng Hợp', includeInReport: true } },
      staffList: [{ name: 'BS Nguyễn A', department: 'Ngoại TH', position: 'BS PT' }],
      reportRoleFilters: { ptChinh: false, ptPhu: false, bsGM: false, ktvGM: false, tdc: false },
    };
    const records = [makeRec()];
    const { filteredRecords } = filterSurgicalRecordsByDepartment(records, config);
    expect(filteredRecords).toHaveLength(0);
  });
});
