import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildDataSourceSubtitle,
  getAssignedOrSurgeryStaff,
  getExtraPositionStaff,
  buildPackageListWorkbook,
  ServicePackageExportItem,
} from '../services/servicePackageExportService';
import {
  exportFormattedFullExcel,
  appendExtraRawSheetsToWorkbook,
} from '../services/excelExportService';
import { calculateOvertimeRows } from '../services/overtimeCalculationService';
import { deduplicateAssignments, toDeterministicAssignmentDocId } from '../services/servicePackageService';
import { buildPackagePaymentPrintConfig } from '../hooks/usePrintController';
import { getPositionShortLabel, buildCompositeKey, findMatchingAssignmentForRecord } from '../types/servicePackage';
import type { SurgeryRecord } from '../types';
import type { ServicePackageAssignment, ServicePackageDefinition, PositionCatalogItem } from '../types/servicePackage';
import type { PaymentList } from '../types/paymentList';

describe('Service Package Excel Export Service', () => {
  describe('getPositionShortLabel (Tên viết tắt của vị trí trong gói)', () => {
    it('should return short abbreviation for default positions instead of surgery report names', () => {
      // Must return 'PT chính', 'PT phụ', 'BS GM', 'KTV GM', 'TDC', 'GV'
      expect(getPositionShortLabel('ptChinh')).toBe('PT chính');
      expect(getPositionShortLabel('ptPhu')).toBe('PT phụ');
      expect(getPositionShortLabel('bsGM')).toBe('BS GM'); // Not 'BS GMHS'
      expect(getPositionShortLabel('ktvGM')).toBe('KTV GM'); // Not 'KTV'
      expect(getPositionShortLabel('tdc')).toBe('TDC');
      expect(getPositionShortLabel('gv')).toBe('GV');
    });

    it('should prefer custom shortLabel from positionCatalog if provided', () => {
      const customCatalog: PositionCatalogItem[] = [
        {
          id: 'pos-1',
          key: 'bsGM',
          label: 'Bác sĩ gây mê',
          shortLabel: 'Gây Mê',
          group: 'anesthesiologists',
          isSurgeryParticipant: true,
          sortOrder: 1,
          active: true,
          createdAt: 0,
          updatedAt: 0,
        },
      ];
      expect(getPositionShortLabel('bsGM', customCatalog)).toBe('Gây Mê');
    });
  });
  describe('buildDataSourceSubtitle', () => {
    it('should format subtitle for "all" option using dateRangeText', () => {
      const subtitle = buildDataSourceSubtitle('all', undefined, 'Tháng 7 - 2026');
      expect(subtitle).toBe('Lấy dữ liệu từ Tháng 7 - 2026');
    });

    it('should format subtitle for "all" option with date range', () => {
      const subtitle = buildDataSourceSubtitle('all', undefined, 'Từ 1/1/2026 đến 30/4/2026');
      expect(subtitle).toBe('Lấy dữ liệu từ Từ 1/1/2026 đến 30/4/2026');
    });

    it('should format subtitle for specific batch with list name and year', () => {
      const mockList: PaymentList = {
        id: 'list-1',
        name: 'tháng 7',
        periodKey: '2026-07',
        status: 'draft',
        items: [],
        createdAt: 1783382400000,
        updatedAt: 1783382400000,
      };

      const subtitle = buildDataSourceSubtitle('list-1', mockList, 'Tháng 7 - 2026');
      expect(subtitle).toBe('Lấy dữ liệu từ đợt thanh toán yêu cầu ở danh sách "tháng 7" - 2026');
    });

    it('should extract year from createdAt when periodKey has no year', () => {
      const mockList: PaymentList = {
        id: 'list-2',
        name: 'Đợt bổ sung',
        periodKey: '',
        status: 'draft',
        items: [],
        createdAt: new Date('2026-08-15T00:00:00Z').getTime(),
        updatedAt: new Date('2026-08-15T00:00:00Z').getTime(),
      };

      const subtitle = buildDataSourceSubtitle('list-2', mockList);
      expect(subtitle).toBe('Lấy dữ liệu từ đợt thanh toán yêu cầu ở danh sách "Đợt bổ sung" - 2026');
    });
  });

  describe('Staff Precedence Rule: "các ô nào mà có cả tên PTV và tên người gán gói (sửa tên) thì chỉ lấy tên sửa để thanh toán"', () => {
    const mockSurgeryRecord: SurgeryRecord = {
      id: 'rec-1',
      patientId: '2600123456',
      patientName: 'NGUYỄN VĂN A',
      tenKT: 'Phẫu thuật lấy thai',
      ptChinh: 'Bác sĩ Gốc',
      ptPhu: 'Phụ tá Gốc',
      bsGM: 'Bác sĩ Gây mê Gốc',
      ktvGM: 'KTV Gốc',
      tdc: 'TDC Gốc',
      gv: 'GV Gốc',
    } as SurgeryRecord;

    it('should return package assigned/edited name when assignment exists and has staffName', () => {
      const mockAssignment: ServicePackageAssignment = {
        id: 'assign-1',
        compositeKey: 'key-1',
        patientId: '2600123456',
        patientName: 'NGUYỄN VĂN A',
        tenKT: 'Phẫu thuật lấy thai',
        packageId: 'pkg-1',
        packageName: 'Gói Mổ Đẻ',
        staffAssignments: [
          { positionKey: 'ptChinh', positionLabel: 'PT Chính', staffName: 'Bác sĩ Sửa Tên' },
          { positionKey: 'ptPhu', positionLabel: 'PT Phụ', staffName: '' }, // Rỗng
        ],
        createdAt: 1000,
        updatedAt: 1000,
      };

      // PT Chính: Có cả tên gốc và tên sửa trong gói -> lấy tên sửa
      const ptChinh = getAssignedOrSurgeryStaff(mockSurgeryRecord, mockAssignment, 'ptChinh');
      expect(ptChinh).toBe('Bác sĩ Sửa Tên');

      // PT Phụ: Tên gói rỗng -> fallback về tên gốc
      const ptPhu = getAssignedOrSurgeryStaff(mockSurgeryRecord, mockAssignment, 'ptPhu');
      expect(ptPhu).toBe('Phụ tá Gốc');

      // BS GMHS: Không có trong staffAssignments -> fallback về tên gốc
      const bsGM = getAssignedOrSurgeryStaff(mockSurgeryRecord, mockAssignment, 'bsGM');
      expect(bsGM).toBe('Bác sĩ Gây mê Gốc');
    });

    it('should return surgery record name when no assignment exists', () => {
      const ptChinh = getAssignedOrSurgeryStaff(mockSurgeryRecord, undefined, 'ptChinh');
      expect(ptChinh).toBe('Bác sĩ Gốc');
    });

    it('should handle extra position staff correctly', () => {
      const mockAssignment: ServicePackageAssignment = {
        id: 'assign-2',
        compositeKey: 'key-2',
        patientId: '2600123456',
        patientName: 'NGUYỄN VĂN A',
        tenKT: 'Phẫu thuật lấy thai',
        packageId: 'pkg-1',
        staffAssignments: [
          { positionKey: 'chuanBiPT', positionLabel: 'Chuẩn bị PT', staffName: 'Điều dưỡng Chuẩn Bị' },
        ],
        createdAt: 1000,
        updatedAt: 1000,
      };

      expect(getExtraPositionStaff(mockAssignment, 'chuanBiPT')).toBe('Điều dưỡng Chuẩn Bị');
      expect(getExtraPositionStaff(mockAssignment, 'nonExistent')).toBe('');
      expect(getExtraPositionStaff(undefined, 'chuanBiPT')).toBe('');
    });
  });

  describe('buildPackageListWorkbook', () => {
    it('should build a complete ExcelJS workbook with title, subtitle, headers, and correct cell values', async () => {
      const mockRecords: ServicePackageExportItem[] = [
        {
          record: {
            id: 'r1',
            patientId: '2600111111',
            patientName: 'TRẦN THỊ B',
            ngayBD: '2026-07-15T08:30:00Z',
            tenKT: 'Nội soi chẩn đoán',
            ptChinh: 'BS Gốc A',
            ptPhu: 'BS Phụ A',
            bsGM: 'BS GM A',
            ktvGM: 'KTV A',
            tdc: 'TDC A',
            gv: 'GV A',
          } as SurgeryRecord,
          assignment: {
            id: 'a1',
            compositeKey: 'k1',
            patientId: '2600111111',
            patientName: 'TRẦN THỊ B',
            tenKT: 'Nội soi chẩn đoán',
            packageId: 'pkg-ns',
            packageName: 'Gói Nội Soi',
            staffAssignments: [
              { positionKey: 'ptChinh', positionLabel: 'PT Chính', staffName: 'BS Sửa B' },
            ],
            createdAt: 1000,
            updatedAt: 1000,
          },
          compositeKey: 'k1',
        },
      ];

      const mockPackages: ServicePackageDefinition[] = [
        {
          id: 'pkg-ns',
          name: 'Gói Nội Soi Chẩn Đoán',
          shortName: 'Gói Nội Soi',
          totalAmount: 1000000,
          taxPercent: 0,
          deductionType: 'percent',
          deductionValue: 0,
          positions: [],
          active: true,
          sortOrder: 1,
        },
      ];

      const mockPaymentLists: any = {
        membershipIndex: new Map([['2600111111', { listId: 'batch-7', listName: 'tháng 7', status: 'locked' }]]),
        discharge: {
          '2600111111': { patientId: '2600111111', ngayRa: '2026-07-20 10:00:00' },
        },
      };

      const wb = await buildPackageListWorkbook({
        items: mockRecords,
        packages: mockPackages,
        paymentLists: mockPaymentLists,
        listFilter: 'all',
        dateRangeText: 'Tháng 7 - 2026',
        dateFormat: 'dd/mm/yyyy',
      });

      const ws = wb.getWorksheet('Gói DVYC');
      expect(ws).toBeDefined();

      // Row 1: Tiêu đề
      expect(ws?.getCell(1, 1).value).toBe('DANH SÁCH GÓI DỊCH VỤ YÊU CẦU');

      // Row 2: Nguồn dữ liệu
      expect(ws?.getCell(2, 1).value).toBe('Lấy dữ liệu từ Tháng 7 - 2026');

      // Row 4: Header (Tên viết tắt của vị trí trong gói: PT chính, PT phụ, BS GM, KTV GM, TDC, GV)
      expect(ws?.getCell(4, 1).value).toBe('STT');
      expect(ws?.getCell(4, 2).value).toBe('Mã KCB');
      expect(ws?.getCell(4, 3).value).toBe('Họ tên');
      expect(ws?.getCell(4, 4).value).toBe('Ngày PT');
      expect(ws?.getCell(4, 5).value).toBe('Tên phẫu thuật');
      expect(ws?.getCell(4, 6).value).toBe('PT chính');
      expect(ws?.getCell(4, 7).value).toBe('PT phụ');
      expect(ws?.getCell(4, 8).value).toBe('BS GM');
      expect(ws?.getCell(4, 9).value).toBe('KTV GM');
      expect(ws?.getCell(4, 10).value).toBe('TDC');
      expect(ws?.getCell(4, 11).value).toBe('GV');
      expect(ws?.getCell(4, 12).value).toBe('Gói DVYC');

      // Row 5: Data
      expect(ws?.getCell(5, 1).value).toBe(1);
      expect(ws?.getCell(5, 2).value).toBe('2600111111');
      expect(ws?.getCell(5, 3).value).toBe('TRẦN THỊ B');
      expect(ws?.getCell(5, 5).value).toBe('Nội soi chẩn đoán');
      // PT Chính should take the edited/assigned name 'BS Sửa B', not 'BS Gốc A'
      expect(ws?.getCell(5, 6).value).toBe('BS Sửa B');
      // PT Phụ should fallback to 'BS Phụ A'
      expect(ws?.getCell(5, 7).value).toBe('BS Phụ A');
      // Package name
      expect(ws?.getCell(5, 12).value).toBe('Gói Nội Soi');
      // Discharge date
      expect(ws?.getCell(5, 13).value).toBe('20/07/2026');
      // Batch name
      expect(ws?.getCell(5, 14).value).toBe('tháng 7');

      // All data cells must have wrapText: true
      expect(ws?.getCell(5, 5).alignment?.wrapText).toBe(true);
      expect(ws?.getCell(5, 12).alignment?.wrapText).toBe(true);

      // Row 6: Summary Row (Không gộp ô, wrapText = false để chữ hiển thị tự nhiên đè sang ô bên cạnh)
      const summaryCell = ws?.getCell(6, 1);
      expect(summaryCell?.value).toBe('Tổng cộng: 1 ca');
      expect(summaryCell?.alignment?.wrapText).toBe(false);
      // Make sure row 6 is NOT merged
      const merges = (ws?.model as any)?.merges || [];
      const hasRow6Merge = merges.some((m: string) => m.includes('6'));
      expect(hasRow6Merge).toBe(false);
    });
  });

  describe('exportFormattedFullExcel & appendExtraRawSheetsToWorkbook (Đầy đủ các sheet thanh toán gói DV, ngoài giờ, lịch trực)', () => {
    const samplePackages: ServicePackageDefinition[] = [
      {
        id: 'pkg-ngoai',
        name: 'DV chọn BSPT theo yêu cầu Ngoại',
        shortName: 'Gói Ngoại',
        positions: [
          { positionKey: 'ptChinh', positionLabel: 'PTV chính', group: 'surgeons', amount: 600000 },
          { positionKey: 'ptPhu', positionLabel: 'PTV phụ', group: 'surgeons', amount: 250000 },
        ],
        deduction: { type: 'percent', value: 2, note: 'Trừ 2% quỹ' },
        active: true,
        sortOrder: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const sampleAssignments: ServicePackageAssignment[] = [
      {
        id: 'as-1',
        compositeKey: '26001_2026-10-15_mo_ruot_thua',
        patientId: '26001',
        patientName: 'NGUYỄN VĂN A',
        ngayBD: '2026-10-15 18:00',
        tenKT: 'Mổ ruột thừa',
        packageId: 'pkg-ngoai',
        packageName: 'DV chọn BSPT theo yêu cầu Ngoại',
        staffAssignments: [
          { positionKey: 'ptChinh', positionLabel: 'PTV chính', group: 'surgeons', staffName: 'Đào Văn Điệp', amount: 600000 },
          { positionKey: 'ptPhu', positionLabel: 'PTV phụ', group: 'surgeons', staffName: 'Dương Đình Quang', amount: 250000 },
        ],
        totalAmount: 850000,
        assignedBy: 'admin',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const sampleRecords: SurgeryRecord[] = [
      {
        id: 'rec-1',
        stt: 1,
        patientId: '26001',
        patientName: 'NGUYỄN VĂN A',
        gender: 'Nam',
        birthYear: '1990',
        tenKT: 'Mổ ruột thừa',
        loaiPTTT: 'P2',
        soLuong: 1,
        tyLe: 100,
        ngayCD: '2026-10-15 17:30',
        ngayBD: '2026-10-15 18:00',
        ngayKT: '2026-10-15 19:30',
        start: new Date(2026, 9, 15, 18, 0),
        end: new Date(2026, 9, 15, 19, 30),
        timeMinutes: 90,
        ptChinh: 'Đào Văn Điệp',
        ptPhu: 'Dương Đình Quang',
        bsGM: 'Hoàng Thị Thu Huyền',
        ktvGM: '',
        tdc: '',
        gv: '',
        maMay: 'M01',
      } as SurgeryRecord,
    ];

    const sampleConfig: any = {
      hospitalName: 'Trung tâm Y tế Thủy Nguyên',
      departments: ['Ngoại TH', 'GMHS'],
      staffList: [
        { id: '1', name: 'Đào Văn Điệp', department: 'Ngoại TH', position: 'BS PT', taxId: '1030177429' },
        { id: '2', name: 'Dương Đình Quang', department: 'Ngoại TH', position: 'BS PT', taxId: '1030176409' },
        { id: '3', name: 'Hoàng Thị Thu Huyền', department: 'GMHS', position: 'BS GMHS', taxId: '1030177434' },
      ],
      priceConfig: { P2: { Chính: 65000, Phụ: 50000, 'Giúp việc': 30000 } },
    };

    const sampleDutySchedules: any = {
      '2026-10-15': {
        date: '2026-10-15',
        isHoliday: false,
        onCallStaff: ['Hoàng Thị Thu Huyền'],
      },
    };

    const samplePositionCatalog: PositionCatalogItem[] = [
      { id: 'c1', key: 'ptChinh', label: 'PTV chính', group: 'surgeons', isSurgeryParticipant: true, sortOrder: 1, active: true, createdAt: 0, updatedAt: 0 },
      { id: 'c2', key: 'ptPhu', label: 'PTV phụ', group: 'surgeons', isSurgeryParticipant: true, sortOrder: 2, active: true, createdAt: 0, updatedAt: 0 },
    ];

    it('should generate all required formatted sheets: DS Phẫu thuật, Bảng Thanh toán, TT Gói DV (Số lượng), TT Gói DV (Số tiền), Thống kê Ngoài giờ, Lịch trực', async () => {
      const wb = await exportFormattedFullExcel(
        {
          validRecords: sampleRecords,
          dateRangeText: 'Từ ngày 15/10/2026 00:00 đến ngày 16/10/2026 23:59',
          stats: {} as any,
        },
        sampleConfig,
        [
          { key: 'stt', label: 'STT' },
          { key: 'patientName', label: 'Họ tên BN' },
          { key: 'tenKT', label: 'Tên PTTT' },
        ],
        {
          enrichedRows: [
            {
              stt: 1,
              department: 'Ngoại TH',
              taxId: '1030177429',
              name: 'Đào Văn Điệp',
              values: { 'P2-Chính': 1 },
              total_qty: 1,
              total_amount_val: 65000,
            } as any,
          ],
          groups: [{ name: 'P2', label: 'Phẫu thuật loại 2', subCols: ['Chính'] }],
          cols: ['P2-Chính'],
          footerTotals: { total_qty: 1, total_amount_val: 65000 },
          columnTotals: { 'P2-Chính': 1 },
        },
        new Date(2026, 9, 17),
        {
          dutySchedules: sampleDutySchedules,
          packageAssignments: sampleAssignments,
          packageDefinitions: samplePackages,
          positionCatalog: samplePositionCatalog,
          includeGV: false,
          saveFile: false,
        },
      );

      const sheetNames = wb.worksheets.map((w) => w.name);
      expect(sheetNames).toContain('DS Phẫu thuật');
      expect(sheetNames).toContain('Bảng Thanh toán');
      expect(sheetNames).toContain('TT Gói DV (Số lượng)');
      expect(sheetNames).toContain('TT Gói DV (Số tiền)');
      expect(sheetNames).toContain('TT Gói DV (Rút gọn)');
      expect(sheetNames).toContain('Thống kê Ngoài giờ');
      expect(sheetNames).toContain('Lịch trực');

      // Kiểm tra dữ liệu sheet TT Gói DV (Rút gọn)
      const wsSummary = wb.getWorksheet('TT Gói DV (Rút gọn)')!;
      expect(wsSummary.getCell(4, 1).value).toBe('BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU (RÚT GỌN)');
      // Row 7: Header nhóm gói DV (cột 5-6) và Tổng cộng (cột 7-8)
      expect(wsSummary.getCell(7, 5).value).toBe('DV chọn BSPT theo yêu cầu Ngoại');
      expect(wsSummary.getCell(8, 5).value).toBe('Số lượng');
      expect(wsSummary.getCell(8, 6).value).toBe('Thành tiền');
      expect(wsSummary.getCell(7, 7).value).toBe('Tổng cộng');
      expect(wsSummary.getCell(8, 7).value).toBe('Số lượng');
      expect(wsSummary.getCell(8, 8).value).toBe('Tổng tiền');
      // Row 9 là dòng nhân viên đầu tiên (Đào Văn Điệp) trong bảng Rút gọn
      expect(wsSummary.getCell(9, 4).value).toBe('Đào Văn Điệp');
      expect(wsSummary.getCell(9, 5).value).toBe(1);      // Số lượng của gói
      expect(wsSummary.getCell(9, 6).value).toBe(588000); // Thành tiền của gói
      expect(wsSummary.getCell(9, 7).value).toBe(1);      // Tổng SL
      expect(wsSummary.getCell(9, 8).value).toBe(588000); // Tổng tiền

      // Kiểm tra dữ liệu sheet TT Gói DV (Số lượng)
      const wsCount = wb.getWorksheet('TT Gói DV (Số lượng)')!;
      expect(wsCount.getCell(4, 1).value).toBe('BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU (THEO SỐ LƯỢNG)');
      // Row 10 là dòng nhân viên đầu tiên (Đào Văn Điệp)
      expect(wsCount.getCell(10, 4).value).toBe('Đào Văn Điệp');
      expect(wsCount.getCell(10, 5).value).toBe(1); // PTV chính = 1 ca
      expect(wsCount.getCell(10, 7).value).toBe(1); // Tổng SL = 1
      expect(wsCount.getCell(10, 8).value).toBe(588000); // Thành tiền sau trừ 2% của 600,000 = 588,000

      // Kiểm tra dữ liệu sheet TT Gói DV (Số tiền)
      const wsAmount = wb.getWorksheet('TT Gói DV (Số tiền)')!;
      expect(wsAmount.getCell(4, 1).value).toBe('BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU (THEO SỐ TIỀN)');
      expect(wsAmount.getCell(10, 4).value).toBe('Đào Văn Điệp');
      expect(wsAmount.getCell(10, 5).value).toBe(588000); // Số tiền ở cột PTV chính

      // Kiểm tra sheet Thống kê Ngoài giờ (Đào Văn Điệp & Dương Đình Quang không trực ngày 15/10 nên ca mổ 18:00-19:30 được tính ngoài giờ)
      const wsOt = wb.getWorksheet('Thống kê Ngoài giờ')!;
      expect(wsOt.getCell(4, 1).value).toBe('BẢNG THỐNG KÊ PHẪU THUẬT NGOÀI GIỜ HÀNH CHÍNH');
      expect(wsOt.getCell(8, 3).value).toBe('NGUYỄN VĂN A');

      // Kiểm tra sheet Lịch trực
      const wsDuty = wb.getWorksheet('Lịch trực')!;
      expect(wsDuty.getCell(4, 1).value).toBe('BẢNG PHÂN CÔNG LỊCH TRỰC 24H');
      // Hoàng Thị Thu Huyền ở dòng thứ 3 (sau 2 BS Ngoại TH) có dấu 'X' vào ngày 15/10
      expect(wsDuty.getCell(11, 3).value).toBe('Hoàng Thị Thu Huyền');
      expect(wsDuty.getCell(11, 5).value).toBe(1); // Tổng buổi trực = 1
      expect(wsDuty.getCell(11, 6).value).toBe('X'); // Cột ngày 15/10
    });

    it('should append TT_GOI_DV_SL, TT_GOI_DV_TIEN, THONG_KE_NGOAI_GIO, and LICH_TRUC to raw SheetJS workbook', () => {
      const rawWb = XLSX.utils.book_new();
      appendExtraRawSheetsToWorkbook(
        rawWb,
        sampleRecords,
        sampleConfig,
        'Từ ngày 15/10/2026 00:00 đến ngày 16/10/2026 23:59',
        {
          dutySchedules: sampleDutySchedules,
          packageAssignments: sampleAssignments,
          packageDefinitions: samplePackages,
          positionCatalog: [],
          includeGV: false,
        },
      );

      expect(rawWb.SheetNames).toContain('TT_GOI_DV_SL');
      expect(rawWb.SheetNames).toContain('TT_GOI_DV_TIEN');
      expect(rawWb.SheetNames).toContain('TT_GOI_DV_RUT_GON');
      expect(rawWb.SheetNames).toContain('THONG_KE_NGOAI_GIO');
      expect(rawWb.SheetNames).toContain('LICH_TRUC');
    });

    it('should build package payment print config with all columns and col-numeric classes for both portrait and landscape', () => {
      const printCfgCount = buildPackagePaymentPrintConfig({
        assignments: sampleAssignments,
        packages: samplePackages,
        staffList: sampleConfig.staffList,
        positionCatalog: samplePositionCatalog,
        dateRangeText: 'Từ ngày 01/10/2026 00:00 đến ngày 31/10/2026 23:59',
        orientation: 'portrait',
        config: sampleConfig,
        packagePaymentMode: 'count',
        viewMode: 'detail',
        hiddenCols: [],
      });

      expect(printCfgCount).toBeTruthy();
      expect(printCfgCount.orientation).toBe('portrait');
      // 4 cột đầu (#, Khoa, MST, Họ tên) + 2 vị trí (PTV chính, PTV phụ) + 2 cột cuối (Tổng SL, Thành tiền) = 8 cột
      expect(printCfgCount.columns).toHaveLength(8);
      expect(printCfgCount.columns[4].className).toContain('col-numeric');
      expect(printCfgCount.data[0].staffName).toBe('Đào Văn Điệp');
      expect(printCfgCount.data[0]['pkg-ngoai_ptChinh']).toBe(1);

      const printCfgAmount = buildPackagePaymentPrintConfig({
        assignments: sampleAssignments,
        packages: samplePackages,
        staffList: sampleConfig.staffList,
        positionCatalog: samplePositionCatalog,
        dateRangeText: 'Từ ngày 01/10/2026 00:00 đến ngày 31/10/2026 23:59',
        orientation: 'landscape',
        config: sampleConfig,
        packagePaymentMode: 'amount',
        viewMode: 'detail',
        hiddenCols: [],
      });

      expect(printCfgAmount).toBeTruthy();
      expect(printCfgAmount.orientation).toBe('landscape');
      expect(printCfgAmount.data[0]['pkg-ngoai_ptChinh']).toBe((588000).toLocaleString('vi-VN'));

      // Kiểm tra lọc theo từ khóa tìm kiếm (searchTerm) khi in & xuất Excel
      const printCfgFiltered = buildPackagePaymentPrintConfig({
        assignments: sampleAssignments,
        packages: samplePackages,
        staffList: sampleConfig.staffList,
        positionCatalog: samplePositionCatalog,
        dateRangeText: 'Từ ngày 01/10/2026 00:00 đến ngày 31/10/2026 23:59 (Chưa gán đợt: 1 ca)',
        orientation: 'landscape',
        config: sampleConfig,
        packagePaymentMode: 'count',
        viewMode: 'detail',
        hiddenCols: [],
        searchTerm: 'Dương Đình Quang',
      });
      expect(printCfgFiltered.data).toHaveLength(1);
      expect(printCfgFiltered.data[0].staffName).toBe('Dương Đình Quang');
      expect(printCfgFiltered.dateRange).toContain('Chưa gán đợt: 1 ca');
    });

    it('should include winter lunch-break overtime between 12:00 and 12:30 (e.g. NGUYỄN VĂN BÉ 11:10 -> 12:10)', () => {
      const records: SurgeryRecord[] = [
        {
          id: 'rec-be',
          stt: 1,
          patientId: '2600172563',
          patientName: 'NGUYỄN VĂN BÉ',
          gender: 'Nam',
          yob: '1959',
          tenKT: 'Cắt 1 thuỳ tuyến giáp trong bướu giáp nhân',
          loaiPTTT: 'P2',
          soLuong: 1,
          ngayCD: '2026-10-29 10:00',
          ngayBD: '2026-10-29 11:10',
          ngayKT: '2026-10-29 12:10',
          start: new Date(2026, 9, 29, 11, 10),
          end: new Date(2026, 9, 29, 12, 10),
          timeMinutes: 60,
          ptChinh: 'Đào Văn Điệp',
          ptPhu: 'Nguyễn Văn Huy',
          bsGM: 'Đồng Thị Thu Huyền',
          ktvGM: 'Vũ Văn Giáp',
          tdc: 'Lại Thị Mùi',
          gv: 'Nguyễn Thị Thơ',
        } as SurgeryRecord,
      ];

      const dutySchedules = {
        '2026-10-29': {
          date: '2026-10-29',
          isHoliday: false,
          onCallStaff: ['Đồng Thị Thu Huyền', 'Lê Quốc Hưng', 'Phùng Thị Vi Xen'],
        },
      };

      const rows = calculateOvertimeRows(records, dutySchedules);
      expect(rows).toHaveLength(1);
      expect(rows[0].patientName).toBe('NGUYỄN VĂN BÉ');
      expect(rows[0].timeFrom).toBe('12:00');
      expect(rows[0].timeTo).toBe('12:10');
      expect(rows[0].durationMinutes).toBe(10);
      expect(rows[0].ghiChu).toBe('Kíp mổ phiên');
      expect(rows[0].ptChinh).toBe('Đào Văn Điệp');
      expect(rows[0].ptPhu).toBe('Nguyễn Văn Huy');
      expect(rows[0].bsGM).toBe(''); // Đồng Thị Thu Huyền đang trực nên không tính ngoài giờ
      expect(rows[0].ktvGM).toBe('Vũ Văn Giáp');
      expect(rows[0].tdc).toBe('Lại Thị Mùi');
    });

    it('should deduplicate assignments by compositeKey keeping the newest updatedAt record', () => {
      const raw: ServicePackageAssignment[] = [
        {
          id: 'doc-old',
          patientId: '2600147800',
          patientName: 'PHẠM VĂN ĂN',
          ngayBD: '2026-10-01 13:40',
          tenKT: 'Cắt u lành phần mềm đường kính dưới 10cm',
          compositeKey: '2600147800_2026-10-01_cat_u_lanh',
          packageId: 'pkg-ngoai',
          packageName: 'DV chọn BSPT theo yêu cầu Ngoại',
          staffAssignments: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'doc-new',
          patientId: '2600147800',
          patientName: 'PHẠM VĂN ĂN',
          ngayBD: '2026-10-01 13:40',
          tenKT: 'Cắt u lành phần mềm đường kính dưới 10cm',
          compositeKey: '2600147800_2026-10-01_cat_u_lanh',
          packageId: 'pkg-ngoai',
          packageName: 'DV chọn BSPT theo yêu cầu Ngoại',
          staffAssignments: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ];
      const deduped = deduplicateAssignments(raw);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe('doc-new');
    });

    it('should normalize DD/MM/YYYY and YYYY-MM-DD into identical compositeKey and detect existing assignment', () => {
      const k1 = buildCompositeKey('2600162142', '14/10/2026 12:00', 'Cắt u lành phần mềm đường kính dưới 10cm');
      const k2 = buildCompositeKey('2600162142', '2026-10-14T05:00:00.000Z', 'Cắt u lành phần mềm đường kính dưới 10cm');
      expect(k1).toBe(k2);
      expect(toDeterministicAssignmentDocId(k1)).toBe(toDeterministicAssignmentDocId(k2));

      const existing: ServicePackageAssignment = {
        id: 'assign-1',
        patientId: '2600162142',
        patientName: 'BÙI VĂN HIỂN',
        ngayBD: '2026-10-14T05:00:00.000Z',
        tenKT: 'Cắt u lành phần mềm đường kính dưới 10cm',
        compositeKey: k2,
        packageId: 'pkg-ngoai',
        packageName: 'DV chọn BSPT theo yêu cầu Ngoại',
        staffAssignments: [],
        linkedSurgeryKeys: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      const matched = findMatchingAssignmentForRecord(
        {
          patientId: '2600162142',
          ngayBD: '14/10/2026 12:00',
          tenKT: 'Cắt u lành phần mềm đường kính dưới 10cm',
        },
        [existing]
      );
      expect(matched?.id).toBe('assign-1');
    });
  });
});
