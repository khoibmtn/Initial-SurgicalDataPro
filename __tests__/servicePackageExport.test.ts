import { describe, it, expect } from 'vitest';
import {
  buildDataSourceSubtitle,
  getAssignedOrSurgeryStaff,
  getExtraPositionStaff,
  buildPackageListWorkbook,
  ServicePackageExportItem,
} from '../services/servicePackageExportService';
import { getPositionShortLabel } from '../types/servicePackage';
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
});
