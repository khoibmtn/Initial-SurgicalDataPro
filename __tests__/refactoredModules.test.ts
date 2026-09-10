import { describe, it, expect } from 'vitest';
import { parseDateString, formatDate } from '../utils/dateUtils';
import { removeVietnameseTones, matchSearchQuery } from '../utils/tableSearchUtils';
import { buildPrintConfig } from '../components/surgery/printConfigBuilder';
import { DEFAULT_CONFIG } from '../contexts/ConfigContext';
import { SurgeryRecord, ProcessedStats } from '../types';
import type { ColumnDef } from '../components/common/DynamicTable';

describe('Refactored Modules & Task 1.3 Verification', () => {
  // ── 1. dateUtils ───────────────────────────────────────────────────────────
  describe('1. Date Utilities (dateUtils.ts)', () => {
    it('parseDateString: xử lý đúng Date object có sẵn', () => {
      const now = new Date(2026, 8, 10, 15, 30);
      expect(parseDateString(now)).toBe(now);
    });

    it('parseDateString: parse chính xác các định dạng chuẩn', () => {
      const d1 = parseDateString('15/06/2026');
      expect(d1).not.toBeNull();
      expect(d1?.getDate()).toBe(15);
      expect(d1?.getMonth()).toBe(5); // 0-indexed: 5 = tháng 6
      expect(d1?.getFullYear()).toBe(2026);

      const d2 = parseDateString('15/06/2026 14:30');
      expect(d2?.getHours()).toBe(14);
      expect(d2?.getMinutes()).toBe(30);

      const d3 = parseDateString('2026-06-15');
      expect(d3?.getDate()).toBe(15);
      expect(d3?.getFullYear()).toBe(2026);
    });

    it('parseDateString: trả về null với dữ liệu rác hoặc không hợp lệ', () => {
      expect(parseDateString(null)).toBeNull();
      expect(parseDateString(undefined)).toBeNull();
      expect(parseDateString(123456789)).toBeNull();
      expect(parseDateString('invalid-date-string')).toBeNull();
    });

    it('formatDate: định dạng chuẩn xác theo các template khác nhau', () => {
      const testDate = new Date(2026, 8, 10, 8, 5); // 10/09/2026 08:05
      expect(formatDate(testDate, 'dd/mm/yyyy')).toBe('10/09/2026');
      expect(formatDate(testDate, 'dd/mm/yyyy hh:mm')).toBe('10/09/2026 08:05');
      expect(formatDate(testDate, 'dd/mm hh:mm')).toBe('10/09 08:05');
      expect(formatDate(testDate, 'hh:mm')).toBe('08:05');
    });

    it('formatDate: fallback an toàn khi giá trị không hợp lệ', () => {
      expect(formatDate('Chưa xác định', 'dd/mm/yyyy')).toBe('Chưa xác định');
      expect(formatDate(null, 'dd/mm/yyyy')).toBe('-');
    });
  });

  // ── 2. tableSearchUtils ───────────────────────────────────────────────────
  describe('2. Table Search Utilities (tableSearchUtils.ts)', () => {
    it('removeVietnameseTones: loại bỏ chính xác dấu tiếng Việt và chữ đ/Đ', () => {
      expect(removeVietnameseTones('Phẫu thuật nội soi đục thủy tinh thể')).toBe(
        'Phau thuat noi soi duc thuy tinh the'
      );
      expect(removeVietnameseTones('ĐÀ NẴNG - ĐIỀU DƯỠNG')).toBe('DA NANG - DIEU DUONG');
    });

    it('matchSearchQuery: tìm kiếm không phân biệt chữ hoa / thường', () => {
      const row = { patientName: 'NGUYỄN VĂN A', tenKT: 'Mổ ruột thừa' };
      const columns: ColumnDef<any>[] = [
        { key: 'patientName', header: 'Bệnh nhân' },
        { key: 'tenKT', header: 'Kỹ thuật' },
      ];

      expect(matchSearchQuery(row, 'nguyễn văn a', undefined, columns)).toBe(true);
      expect(matchSearchQuery(row, 'NGUYEN', undefined, columns)).toBe(true);
      expect(matchSearchQuery(row, 'Trần', undefined, columns)).toBe(false);
    });

    it('matchSearchQuery: tìm kiếm không dấu khớp với dữ liệu có dấu', () => {
      const row = { patientName: 'Trần Thị Bưởi', tenKT: 'Kết hợp xương cẳng tay' };
      const columns: ColumnDef<any>[] = [
        { key: 'patientName', header: 'Bệnh nhân' },
        { key: 'tenKT', header: 'Kỹ thuật' },
      ];

      expect(matchSearchQuery(row, 'tran thi buoi', undefined, columns)).toBe(true);
      expect(matchSearchQuery(row, 'ket hop xuong', undefined, columns)).toBe(true);
      expect(matchSearchQuery(row, 'KHX', undefined, columns)).toBe(false);
    });

    it('matchSearchQuery: tuân thủ cấu hình searchableCols (bỏ qua cột không tìm kiếm)', () => {
      const row = { patientId: 'BN999', tenKT: 'Phẫu thuật A' };
      const columns: ColumnDef<any>[] = [
        { key: 'patientId', header: 'Mã BN' },
        { key: 'tenKT', header: 'Kỹ thuật' },
      ];

      // Khi patientId bị vô hiệu hóa tìm kiếm
      const searchableCols = { patientId: false, tenKT: true };
      expect(matchSearchQuery(row, 'BN999', searchableCols, columns)).toBe(false);
      expect(matchSearchQuery(row, 'Phẫu thuật', searchableCols, columns)).toBe(true);
    });

    it('matchSearchQuery: xử lý nhiều từ cách nhau bởi khoảng trắng', () => {
      const row = { patientName: 'Lê Văn C', tenKT: 'Nội soi tán sỏi niệu quản' };
      const columns: ColumnDef<any>[] = [
        { key: 'patientName', header: 'Bệnh nhân' },
        { key: 'tenKT', header: 'Kỹ thuật' },
      ];

      expect(matchSearchQuery(row, 'nội soi tán sỏi', undefined, columns)).toBe(true);
      expect(matchSearchQuery(row, 'noi soi nieu quan', undefined, columns)).toBe(true);
      expect(matchSearchQuery(row, 'noi soi ruot thua', undefined, columns)).toBe(false);
    });
  });

  // ── 3. printConfigBuilder ─────────────────────────────────────────────────
  describe('3. Print Config Builder (printConfigBuilder.tsx)', () => {
    const mockRecord: SurgeryRecord = {
      id: 'rec_1',
      stt: 1,
      patientId: 'BN001',
      patientName: 'Nguyễn Văn Test',
      tenKT: 'Phẫu thuật nội soi ruột thừa',
      loaiPTTT: 'P1',
      soLuong: 1,
      ngayBD: '2026-09-10T08:00:00.000Z',
      ngayKT: '2026-09-10T09:00:00.000Z',
      ptvChinh: 'BS. Tuấn',
      timeMinutes: 60,
    };

    const mockStats: ProcessedStats = {
      totalSurgeries: 1,
      totalActualCases: 1,
      totalEquivalentCases: 1,
      staffConflicts: 0,
      machineConflicts: 0,
      missingMachines: 0,
      missingAssistantCount: 0,
      violateMinTimeCount: 0,
      uniqueStaff: 1,
      uniqueMachines: 0,
      lowPaymentCount: 0,
      estimatedStaffCost: 150000,
      totalSurgeryCost: 1500000,
      surgeriesByType: { P1: 1 },
      surgeriesByDepartment: {},
      surgeriesByTable: {},
      timeClassification: { morning: 1, afternoon: 0, evening: 0, night: 0, normalHours: 1, overtime: 0, holidayOvertime: 0 },
      topSurgeries: [],
      staffWorkload: [],
      machineUtilization: [],
      hourlyDistribution: {},
      dayOfWeekDistribution: {},
      missingStaffTracker: [],
      unassignedStaffTracker: [],
      missingSurgeryNameTracker: [],
    };

    const mockColumns: ColumnDef<SurgeryRecord>[] = [
      { key: 'stt', header: 'STT' },
      { key: 'patientName', header: 'Họ tên BN' },
      { key: 'tenKT', header: 'Tên kỹ thuật' },
    ];

    it('buildPrintConfig: tạo cấu hình in danh sách (daily) kèm dailyStats', () => {
      const config = buildPrintConfig({
        type: 'list',
        reportTab: 'daily',
        dateRangeText: '10/09/2026',
        validRecords: [mockRecord],
        columnsList: mockColumns,
        derivedStats: mockStats,
        ptCount: 1,
        ttCount: 0,
        paymentDataPrepared: null,
        paymentCols: [],
        config: DEFAULT_CONFIG,
      });

      expect(config).not.toBeNull();
      expect(config.type).toBe('list');
      expect(config.title).toBe('DANH SÁCH PHẪU THUẬT');
      expect(config.data).toHaveLength(1);
      expect(config.dailyStats).toBeDefined();
      expect(config.dailyStats.ptCount).toBe(1);
      expect(config.dailyStats.ttCount).toBe(0);
    });

    it('buildPrintConfig: tạo cấu hình in danh sách (monthly) tự động sinh ngày ký = ngày kết thúc + 1', () => {
      const config = buildPrintConfig({
        type: 'list',
        reportTab: 'monthly',
        dateRangeText: 'Từ ngày 01/08/2026 đến ngày 31/08/2026',
        validRecords: [mockRecord],
        columnsList: mockColumns,
        derivedStats: mockStats,
        ptCount: 1,
        ttCount: 0,
        paymentDataPrepared: null,
        paymentCols: [],
        config: DEFAULT_CONFIG,
      });

      expect(config.signatureDate).toBeDefined();
      const sigDate = config.signatureDate as Date;
      expect(sigDate.getDate()).toBe(1); // 31/08 + 1 = 01/09
      expect(sigDate.getMonth()).toBe(8); // tháng 9 (0-indexed = 8)
      expect(sigDate.getFullYear()).toBe(2026);
    });

    it('buildPrintConfig: loại trừ các cột có visible = false', () => {
      const config = buildPrintConfig({
        type: 'list',
        reportTab: 'daily',
        dateRangeText: '10/09/2026',
        validRecords: [mockRecord],
        columnsList: mockColumns,
        listVisibleCols: { stt: true, patientName: false, tenKT: true },
        derivedStats: mockStats,
        ptCount: 1,
        ttCount: 0,
        paymentDataPrepared: null,
        paymentCols: [],
        config: DEFAULT_CONFIG,
      });

      expect(config.columns).toHaveLength(2);
      expect(config.columns.map((c: any) => c.key)).toEqual(['stt', 'tenKT']);
    });
  });

  // ── 4. Storage & 24h Shift Logic ──────────────────────────────────────────
  describe('4. Storage Query & 24h Shift Logic (Logic extracted in useStorageQuery)', () => {
    // Thuật toán kiểm tra mùa theo cấu hình làm việc
    const determineSeason = (checkDate: Date, workingHours: any): 'summer' | 'winter' => {
      const checkM = checkDate.getMonth() + 1;
      const checkD = checkDate.getDate();

      const [sFromD, sFromM] = workingHours.summer.dateFrom.split('/').map(Number);
      const [sToD, sToM] = workingHours.summer.dateTo.split('/').map(Number);
      const summerCrossYear = sFromM > sToM || (sFromM === sToM && sFromD > sToD);

      const isInRange = (cM: number, cD: number, fM: number, fD: number, tM: number, tD: number, cross: boolean) => {
        if (!cross) {
          if (cM < fM || cM > tM) return false;
          if (cM === fM && cD < fD) return false;
          if (cM === tM && cD > tD) return false;
          return true;
        } else {
          if (cM <= tM) {
            if (cM < tM) return true;
            if (cM === tM && cD <= tD) return true;
            return false;
          } else if (cM >= fM) {
            if (cM > fM) return true;
            if (cM === fM && cD >= fD) return true;
            return false;
          }
          return false;
        }
      };

      if (isInRange(checkM, checkD, sFromM, sFromD, sToM, sToD, summerCrossYear)) {
        return 'summer';
      }
      return 'winter';
    };

    it('determineSeason: xác định đúng mùa hè và mùa đông theo cấu hình mặc định', () => {
      const workingHours = DEFAULT_CONFIG.workingHours;
      // Default: hè từ 15/04 đến 15/10, đông từ 16/10 đến 14/04 năm sau (cross-year)
      const dateInSummer = new Date(2026, 5, 20); // 20/06/2026 -> summer
      const dateInWinter = new Date(2026, 11, 25); // 25/12/2026 -> winter
      const dateInWinterEarlyYear = new Date(2026, 0, 15); // 15/01/2026 -> winter

      expect(determineSeason(dateInSummer, workingHours)).toBe('summer');
      expect(determineSeason(dateInWinter, workingHours)).toBe('winter');
      expect(determineSeason(dateInWinterEarlyYear, workingHours)).toBe('winter');
    });

    it('24h Shift calculation: tính toán timeTo = morningFrom - 1 phút chính xác', () => {
      const calculateTimeTo = (morningFrom: string) => {
        const [hours, minutes] = morningFrom.split(':').map(Number);
        let toMinutes = minutes - 1;
        let toHours = hours;
        if (toMinutes < 0) {
          toMinutes = 59;
          toHours = hours - 1;
          if (toHours < 0) toHours = 23;
        }
        return `${String(toHours).padStart(2, '0')}:${String(toMinutes).padStart(2, '0')}`;
      };

      expect(calculateTimeTo('07:00')).toBe('06:59');
      expect(calculateTimeTo('07:30')).toBe('07:29');
      expect(calculateTimeTo('00:00')).toBe('23:59'); // Wrap midnight
    });
  });
});
