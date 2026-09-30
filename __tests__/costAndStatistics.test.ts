/**
 * Test Nhóm G: Cost Calculation & Statistics Page
 * Kiểm thử tính năng:
 * - Thuật toán tổng hợp thống kê tháng (aggregateMonth):
 *   + Thứ tự ưu tiên tính Viện phí PT/TT: thanhTien > donGia * qty > getNamePriceFast
 *   + Ghi nhận các ca thiếu giá vào missingSurgeryNameTracker
 *   + Tính chi phí phụ cấp PTTT (laborCost) theo từng loại và tổng hợp
 *   + Tính số ca thực tế (actualCases) vs số ca quy đổi (equivalentCases)
 * - Thuật toán thống kê theo ngày và lũy kế (aggregateDaily)
 * - Kiểm tra tính toàn vẹn dữ liệu / trùng ca mổ (validateRecords)
 * - Quản lý chi phí phẫu thuật (surgeryCostService: duplicateCostItem, deleteCostItem smart-gap, dayBefore, validation)
 * - Chỉ số mùa vụ và dự báo (buildSeasonalIndex, adjustSeasonalForTet)
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  db: {},
  firestore: {},
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path: path || 'mock_path' })),
  onValue: vi.fn(),
  push: vi.fn(() => ({ key: 'cost_new_key' })),
  set: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn(),
}));

import { beforeEach } from 'vitest';

import {
  aggregateMonth,
  aggregateDaily,
  validateRecords,
  getLaborCost,
  buildSeasonalIndex,
  adjustSeasonalForTet,
} from '../services/statisticsService';
import {
  dayBefore,
  duplicateCostItem,
  deleteCostItem,
  updateCostItem,
} from '../services/surgeryCostService';
import {
  PersistedSurgeryRecord,
  SurgeryNamePrice,
  SurgeryCostItem,
  MissingSurgeryNameRecord,
} from '../types';
import { update, remove, set } from 'firebase/database';

describe('Cost Calculation & Statistics Page', () => {
  const mockLaborPrices: Record<string, { [role: string]: number }> = {
    'PĐB': { 'Chính': 500_000, 'Phụ': 300_000, 'Giúp việc': 100_000 }, // Tổng: 900k
    'P1': { 'Chính': 300_000, 'Phụ': 200_000, 'Giúp việc': 80_000 },  // Tổng: 580k
    'P2': { 'Chính': 200_000, 'Phụ': 150_000, 'Giúp việc': 50_000 },  // Tổng: 400k
    'T1': { 'Chính': 100_000, 'Phụ': 60_000, 'Giúp việc': 30_000 },   // Tổng: 190k
    'TKPL': { 'Chính': 0, 'Phụ': 0, 'Giúp việc': 0 },
  };

  describe('1. Monthly Statistics Aggregation (aggregateMonth)', () => {
    it('ưu tiên thanhTien trực tiếp từ bản ghi nếu có', () => {
      const records: PersistedSurgeryRecord[] = [
        {
          id: 'rec_1',
          ngayBD: '2026-05-10T08:00:00.000Z',
          loaiPTTT: 'P1',
          tenKT: 'Phẫu thuật nạo VA',
          thanhTien: 1_200_000, // Đã có thành tiền
          donGia: 800_000,      // Khác thành tiền
          soLuong: 1,
        },
      ];

      const nameMap = new Map<string, string>();
      const result = aggregateMonth(
        5, 2026,
        records,
        'MONTHLY',
        [],
        mockLaborPrices,
        [],
        nameMap
      );

      expect(result.actualCases).toBe(1);
      expect(result.equivalentCases).toBe(1);
      expect(result.serviceCost).toBe(1_200_000); // Lấy thanhTien
      expect(result.laborCost).toBe(580_000);     // 580k cho P1
    });

    it('fallback lấy donGia * qty khi thanhTien bị trống', () => {
      const records: PersistedSurgeryRecord[] = [
        {
          id: 'rec_2',
          ngayBD: '2026-05-10T08:00:00.000Z',
          loaiPTTT: 'P2',
          tenKT: 'Cắt trĩ',
          thanhTien: 0,
          donGia: 1_500_000,
          soLuong: 2,
        },
      ];

      const nameMap = new Map<string, string>();
      const result = aggregateMonth(
        5, 2026,
        records,
        'MONTHLY',
        [],
        mockLaborPrices,
        [],
        nameMap
      );

      expect(result.serviceCost).toBe(3_000_000); // 1.5tr * 2
      expect(result.equivalentCases).toBe(2);
      expect(result.laborCost).toBe(800_000);     // 400k * 2
    });

    it('fallback tra cứu DM giá (getNamePriceFast) khi cả thanhTien và donGia đều trống', () => {
      const records: PersistedSurgeryRecord[] = [
        {
          id: 'rec_3',
          ngayBD: '2026-05-15T08:00:00.000Z',
          loaiPTTT: 'P1',
          tenKT: 'Tán sỏi thận laser',
          thanhTien: 0,
          donGia: 0,
          soLuong: 1,
        },
      ];

      const catalog: SurgeryNamePrice[] = [
        {
          id: 'cat_laser',
          tenKT: 'Tán sỏi thận laser',
          price: 2_200_000,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
        },
      ];

      const nameMap = new Map<string, string>();
      const result = aggregateMonth(
        5, 2026,
        records,
        'MONTHLY',
        [],
        mockLaborPrices,
        [],
        nameMap,
        catalog
      );

      expect(result.serviceCost).toBe(2_200_000); // Lấy từ catalog
    });

    it('ghi nhận vào missingSurgeryNameTracker nếu ca mổ hoàn toàn không có giá', () => {
      const records: PersistedSurgeryRecord[] = [
        {
          id: 'rec_no_price',
          ngayBD: '2026-05-15T08:00:00.000Z',
          loaiPTTT: 'P1',
          tenKT: 'Kỹ thuật mới chưa định giá',
          thanhTien: 0,
          donGia: 0,
          soLuong: 1,
          patientId: 'BN9999',
          patientName: 'NGUYỄN VĂN A',
        },
      ];

      const missingTracker = {
        names: new Set<string>(),
        records: [] as MissingSurgeryNameRecord[],
      };

      const nameMap = new Map<string, string>();
      aggregateMonth(
        5, 2026,
        records,
        'MONTHLY',
        [],
        mockLaborPrices,
        [],
        nameMap,
        [], // catalog rỗng
        missingTracker
      );

      expect(missingTracker.names.has('Kỹ thuật mới chưa định giá')).toBe(true);
      expect(missingTracker.records.length).toBe(1);
      expect(missingTracker.records[0].maBN).toBe('BN9999');
    });

    it('tổng hợp chính xác phân bổ theo loại PTTT và theo tên kỹ thuật', () => {
      const records: PersistedSurgeryRecord[] = [
        { id: '1', ngayBD: '2026-05-01', loaiPTTT: 'PĐB', tenKT: 'Mổ tim', thanhTien: 10_000_000, soLuong: 1 },
        { id: '2', ngayBD: '2026-05-02', loaiPTTT: 'P1', tenKT: 'Nạo VA', thanhTien: 2_000_000, soLuong: 1 },
        { id: '3', ngayBD: '2026-05-03', loaiPTTT: 'P1', tenKT: 'Nạo VA', thanhTien: 2_000_000, soLuong: 2 }, // quy đổi 2
      ];

      const nameMap = new Map<string, string>();
      const result = aggregateMonth(
        5, 2026,
        records,
        'MONTHLY',
        [],
        mockLaborPrices,
        [],
        nameMap
      );

      expect(result.actualCases).toBe(3);
      expect(result.equivalentCases).toBe(4);
      expect(result.byType['PĐB']).toBe(1);
      expect(result.byType['P1']).toBe(2);
      expect(result.byTypeEquivalent['P1']).toBe(3);
      expect(result.serviceCostByType['PĐB']).toBe(10_000_000);
      expect(result.serviceCostByType['P1']).toBe(4_000_000);
      expect(result.serviceCost).toBe(14_000_000);
    });
  });

  describe('2. Daily Statistics Aggregation (aggregateDaily)', () => {
    it('tính đúng số ca, viện phí, phụ cấp theo từng ngày và lũy kế tăng dần', () => {
      const records: PersistedSurgeryRecord[] = [
        { id: '1', ngayBD: '2026-05-01T08:00:00.000Z', loaiPTTT: 'P1', thanhTien: 2_000_000, soLuong: 1 },
        { id: '2', ngayBD: '2026-05-01T10:00:00.000Z', loaiPTTT: 'P1', thanhTien: 2_000_000, soLuong: 1 },
        { id: '3', ngayBD: '2026-05-02T08:00:00.000Z', loaiPTTT: 'P2', thanhTien: 1_500_000, soLuong: 1 },
      ];

      const daily = aggregateDaily(records, [], mockLaborPrices);
      expect(daily.length).toBe(2); // 2 ngày: 01 và 02

      // Ngày 01
      expect(daily[0].date).toBe('2026-05-01');
      expect(daily[0].cases).toBe(2);
      expect(daily[0].cumulative).toBe(2);
      expect(daily[0].serviceCost).toBe(4_000_000);
      expect(daily[0].cumulativeServiceCost).toBe(4_000_000);
      expect(daily[0].laborCost).toBe(1_160_000); // 580k * 2

      // Ngày 02 (lũy kế)
      expect(daily[1].date).toBe('2026-05-02');
      expect(daily[1].cases).toBe(1);
      expect(daily[1].cumulative).toBe(3); // 2 + 1
      expect(daily[1].serviceCost).toBe(1_500_000);
      expect(daily[1].cumulativeServiceCost).toBe(5_500_000); // 4tr + 1.5tr
      expect(daily[1].laborCost).toBe(400_000);
      expect(daily[1].cumulativeLaborCost).toBe(1_560_000); // 1.16tr + 400k
    });
  });

  describe('3. Duplicate Records Validation (validateRecords)', () => {
    it('phát hiện ca mổ trùng lặp cùng ngày, BN, loại PTTT và tên kỹ thuật', () => {
      const records: PersistedSurgeryRecord[] = [
        {
          id: '1',
          ngayBD: '2026-05-01T08:00:00.000Z',
          patientId: 'BN101',
          loaiPTTT: 'P1',
          tenKT: 'Nạo VA',
        },
        {
          id: '2',
          ngayBD: '2026-05-01T10:00:00.000Z', // Cùng ngày 2026-05-01
          patientId: 'BN101',
          loaiPTTT: 'P1',
          tenKT: 'Nạo VA',
        },
        {
          id: '3',
          ngayBD: '2026-05-01T08:00:00.000Z',
          patientId: 'BN102', // Khác BN
          loaiPTTT: 'P1',
          tenKT: 'Nạo VA',
        },
      ];

      const validation = validateRecords(records);
      expect(validation.duplicateCount).toBe(1); // 1 ca thừa
      expect(validation.duplicateRecords.length).toBe(2); // 2 ca thuộc nhóm trùng
      expect(validation.duplicateRecords[0].duplicateGroup).toBe(1);
      expect(validation.duplicateRecords[0].duplicateGroupCount).toBe(2);
    });

    it('không báo trùng nếu khác ngày hoặc khác tên kỹ thuật', () => {
      const records: PersistedSurgeryRecord[] = [
        {
          id: '1',
          ngayBD: '2026-05-01T08:00:00.000Z',
          patientId: 'BN101',
          loaiPTTT: 'P1',
          tenKT: 'Nạo VA',
        },
        {
          id: '2',
          ngayBD: '2026-05-02T08:00:00.000Z', // Khác ngày
          patientId: 'BN101',
          loaiPTTT: 'P1',
          tenKT: 'Nạo VA',
        },
        {
          id: '3',
          ngayBD: '2026-05-01T08:00:00.000Z',
          patientId: 'BN101',
          loaiPTTT: 'P1',
          tenKT: 'Cắt amidan', // Khác tên kỹ thuật
        },
      ];

      const validation = validateRecords(records);
      expect(validation.duplicateCount).toBe(0);
      expect(validation.duplicateRecords.length).toBe(0);
    });
  });

  describe('4. Surgery Cost Service & Smart Validity Management', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('dayBefore tính chính xác ngày liền trước', () => {
      expect(dayBefore('2026-05-01')).toBe('2026-04-30');
      expect(dayBefore('2026-01-01')).toBe('2025-12-31');
      expect(dayBefore('2024-03-01')).toBe('2024-02-29'); // Năm nhuận 2024
    });

    it('duplicateCostItem tự động đóng hiệu lực item cũ vào ngày hôm trước', async () => {
      const allCostItems: SurgeryCostItem[] = [
        {
          id: 'cost_orig',
          refPriceId: 'p1',
          maTuongDuong: '24.0018.1611',
          tenKT: 'KHX xương đùi',
          donGia: 1_500_000,
          medicCost: 300_000,
          vtthCost: 200_000,
          costEffectiveFrom: '2025-01-01',
          costEffectiveTo: null,
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          createdAt: 100,
          updatedAt: 100,
        },
      ];

      const newKey = await duplicateCostItem(
        'cost_orig',
        '2026-04-01',
        allCostItems,
        350_000, // medicCost mới
        250_000  // vtthCost mới
      );

      expect(newKey).toBe('cost_new_key');
      // Item cũ phải được cập nhật costEffectiveTo = 2026-03-31
      expect(update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          costEffectiveTo: '2026-03-31',
          effectiveTo: '2026-03-31',
        })
      );
      // Item mới được tạo với costEffectiveFrom = 2026-04-01, effectiveTo = null
      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          medicCost: 350_000,
          vtthCost: 250_000,
          costEffectiveFrom: '2026-04-01',
          costEffectiveTo: null,
        })
      );
    });

    it('deleteCostItem tự động nối liền khoảng trống hiệu lực (smart-gap prevention)', async () => {
      // Chuỗi 3 item chi phí liên tiếp:
      // Item 1: 2024-01-01 -> 2024-12-31
      // Item 2: 2025-01-01 -> 2025-12-31 (bị xóa)
      // Item 3: 2026-01-01 -> null
      const allCostItems: SurgeryCostItem[] = [
        {
          id: 'item_1',
          refPriceId: 'p1',
          costEffectiveFrom: '2024-01-01',
          costEffectiveTo: '2024-12-31',
          effectiveFrom: '2024-01-01',
          effectiveTo: '2024-12-31',
          maTuongDuong: '', tenKT: 'A', donGia: 0, medicCost: 100, vtthCost: 100, createdAt: 1, updatedAt: 1,
        },
        {
          id: 'item_2',
          refPriceId: 'p1',
          costEffectiveFrom: '2025-01-01',
          costEffectiveTo: '2025-12-31',
          effectiveFrom: '2025-01-01',
          effectiveTo: '2025-12-31',
          maTuongDuong: '', tenKT: 'A', donGia: 0, medicCost: 100, vtthCost: 100, createdAt: 1, updatedAt: 1,
        },
        {
          id: 'item_3',
          refPriceId: 'p1',
          costEffectiveFrom: '2026-01-01',
          costEffectiveTo: null,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          maTuongDuong: '', tenKT: 'A', donGia: 0, medicCost: 100, vtthCost: 100, createdAt: 1, updatedAt: 1,
        },
      ];

      await deleteCostItem('item_2', allCostItems);

      // Xóa item 2
      expect(remove).toHaveBeenCalled();
      // Mở rộng item 1 tới ngày trước item 3 (2025-12-31) để không bị thủng dữ liệu
      expect(update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          costEffectiveTo: '2025-12-31',
          effectiveTo: '2025-12-31',
        })
      );
    });

    it('updateCostItem chặn cập nhật chi phí âm hoặc bằng 0', async () => {
      await expect(updateCostItem('item_1', { medicCost: 0 })).rejects.toThrow('lớn hơn 0');
      await expect(updateCostItem('item_1', { vtthCost: -10_000 })).rejects.toThrow('lớn hơn 0');
    });
  });

  describe('5. Seasonality & Forecasting Logic', () => {
    it('buildSeasonalIndex kết hợp trọng số 0.65 (năm gần nhất) + 0.35 (năm trước)', () => {
      const year2025 = Array.from({ length: 12 }, (_, i) => ({
        actualCases: 100, // 100 ca mỗi tháng -> tổng 1200 -> 1/12 mỗi tháng
      })) as any[];

      const year2024 = Array.from({ length: 12 }, (_, i) => ({
        actualCases: 50,  // 50 ca mỗi tháng -> tổng 600 -> 1/12 mỗi tháng
      })) as any[];

      const index = buildSeasonalIndex(year2025, year2024);
      expect(index.length).toBe(12);

      // Tổng index phải xấp xỉ 1.0
      const total = index.reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1.0, 5);

      // Mỗi tháng ~ 1/12 (~0.0833)
      expect(index[0]).toBeCloseTo(1 / 12, 5);
    });

    it('adjustSeasonalForTet giảm trọng số của tháng Tết và bù sang các tháng khác', () => {
      const uniformSeasonal = new Array(12).fill(1 / 12);
      // 2026: Tết rơi vào Tháng 2 (index 1)
      const adjusted = adjustSeasonalForTet(uniformSeasonal, 2026, [2025]); // 2025 Tết tháng 1 -> lệch tháng

      // Tháng 2 phải giảm trọng số
      expect(adjusted[1]).toBeLessThan(1 / 12);
      // Tháng 3 trở đi phải được bù tăng nhẹ
      expect(adjusted[2]).toBeGreaterThan(1 / 12);
      // Tổng chỉ số mùa vụ vẫn được bảo toàn = 1.0
      const total = adjusted.reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });
  });
});
