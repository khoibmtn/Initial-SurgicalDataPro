/**
 * Test Nhóm E: Catalog Effective Date & Matching
 * Kiểm thử tính năng:
 * - Chuẩn hóa ngày và tên DVKT (NFKC, viết tắt y khoa, zero-width)
 * - Tra cứu DMKT và đơn giá theo đúng ngày phẫu thuật (getNamePrice, getNamePriceFast)
 * - Tra cứu phiên bản bảng giá dịch vụ theo ngày (getServicePrice, validatePriceVersionOverlap)
 * - Kiểm tra danh mục kỹ thuật bắt buộc mã máy theo ngày (isMachineCodeRequired)
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  db: {},
  firestore: {},
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  push: vi.fn(() => ({ key: 'mock_key' })),
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

import {
  getNamePrice,
  getNamePriceFast,
  buildNamePricesIndex,
  normalizeForMatch,
  normalizeStoredDate,
  toLocalDateKey,
} from '../services/surgeryNamePriceService';
import {
  validatePriceVersionOverlap,
  validatePrices,
} from '../services/pricingService';
import { getServicePrice } from '../services/statisticsService';
import {
  isMachineCodeRequired,
  buildRequiredMachineIndex,
} from '../services/requiredMachineService';
import { SurgeryNamePrice, SurgeryPriceVersion, RequiredMachineItem } from '../types';

describe('Catalog Effective Date & Matching', () => {
  describe('1. Date & Name Normalization Helpers', () => {
    it('normalizeStoredDate chuẩn hóa đúng các định dạng yyyymmdd, yyyy-mm-dd và số', () => {
      expect(normalizeStoredDate('20250115')).toBe('2025-01-15');
      expect(normalizeStoredDate(20250115)).toBe('2025-01-15');
      expect(normalizeStoredDate('2025-01-15')).toBe('2025-01-15');
      expect(normalizeStoredDate('')).toBe('');
      expect(normalizeStoredDate(null)).toBe('');
      expect(normalizeStoredDate(undefined)).toBe('');
    });

    it('toLocalDateKey chuyển đổi các định dạng ngày VN và ISO thành yyyy-mm-dd chuẩn', () => {
      expect(toLocalDateKey('2026-05-20')).toBe('2026-05-20');
      expect(toLocalDateKey('20260520')).toBe('2026-05-20');
      expect(toLocalDateKey('20/05/2026')).toBe('2026-05-20');
      expect(toLocalDateKey('20/05/2026 14:30')).toBe('2026-05-20');
      expect(toLocalDateKey('20-05-2026')).toBe('2026-05-20');
      expect(toLocalDateKey('5/5/2026')).toBe('2026-05-05');
      expect(toLocalDateKey('')).toBe('');
    });

    it('normalizeForMatch xử lý NFKC, loại bỏ zero-width, chuyển chữ thường và mở rộng viết tắt y tế', () => {
      // Viết tắt y khoa: khx -> kết hợp xương, pt -> phẫu thuật, tt -> thủ thuật, ns -> nội soi
      expect(normalizeForMatch('KHX xương đùi')).toBe('kết hợp xương xương đùi');
      expect(normalizeForMatch('PT nội soi ruột thừa')).toBe('phẫu thuật nội soi ruột thừa');
      expect(normalizeForMatch('NS cắt polyp')).toBe('nội soi cắt polyp');
      expect(normalizeForMatch('TT tháo bột')).toBe('thủ thuật tháo bột');

      // Zero-width space và non-breaking space
      const textWithZeroWidth = 'Phẫu\u200B thuật\u00A0mắt';
      expect(normalizeForMatch(textWithZeroWidth)).toBe('phẫu thuật mắt');

      // Khoảng trắng thừa
      expect(normalizeForMatch('   Cắt   trĩ   ')).toBe('cắt trĩ');
    });
  });

  describe('2. Surgery Name Price Lookup by Effective Date (getNamePrice & getNamePriceFast)', () => {
    const mockCatalog: SurgeryNamePrice[] = [
      {
        id: 'p1_v1',
        tenKT: 'Phẫu thuật kết hợp xương đùi',
        maTuongDuong: '24.0018.1611',
        price: 1_200_000,
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-12-31',
      },
      {
        id: 'p1_v2',
        tenKT: 'Phẫu thuật kết hợp xương đùi',
        maTuongDuong: '24.0018.1611',
        price: 1_500_000,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2025-12-31',
      },
      {
        id: 'p1_v3',
        tenKT: 'Phẫu thuật kết hợp xương đùi',
        maTuongDuong: '24.0018.1611',
        price: 1_800_000,
        effectiveFrom: '2026-01-01',
        effectiveTo: null, // Đang áp dụng hiện tại
      },
      {
        id: 'p2',
        tenKT: 'Nội soi tán sỏi laser',
        maTuongDuong: '24.0020.1700',
        price: 2_500_000,
        effectiveFrom: '2025-06-01',
        effectiveTo: null,
      },
    ];

    it('lấy đúng đơn giá của phiên bản năm 2024 khi ngày mổ trong năm 2024', () => {
      const res = getNamePrice('Phẫu thuật kết hợp xương đùi', '2024-06-15', mockCatalog);
      expect(res.found).toBe(true);
      expect(res.price).toBe(1_200_000);
      expect(res.matchedItem?.id).toBe('p1_v1');
    });

    it('lấy đúng đơn giá của phiên bản năm 2025 khi ngày mổ trong năm 2025', () => {
      const res = getNamePrice('Phẫu thuật kết hợp xương đùi', '2025-08-20', mockCatalog);
      expect(res.found).toBe(true);
      expect(res.price).toBe(1_500_000);
      expect(res.matchedItem?.id).toBe('p1_v2');
    });

    it('lấy đúng đơn giá mới nhất (2026) khi ngày mổ ở thời điểm hiện tại (effectiveTo null)', () => {
      const res = getNamePrice('Phẫu thuật kết hợp xương đùi', '2026-03-10', mockCatalog);
      expect(res.found).toBe(true);
      expect(res.price).toBe(1_800_000);
      expect(res.matchedItem?.id).toBe('p1_v3');
    });

    it('trả về found = false nếu ngày mổ trước ngày có hiệu lực đầu tiên', () => {
      const res = getNamePrice('Phẫu thuật kết hợp xương đùi', '2023-12-31', mockCatalog);
      expect(res.found).toBe(false);
      expect(res.price).toBe(0);
    });

    it('khớp được cả khi người dùng dùng từ viết tắt (KHX xương đùi)', () => {
      // 'KHX xương đùi' normalize thành 'kết hợp xương xương đùi',
      // catalog 'Phẫu thuật kết hợp xương đùi' normalize thành 'phẫu thuật kết hợp xương đùi'
      // Khi viết 'PT KHX đùi' hoặc viết tắt 'pt'
      const res = getNamePrice('PT kết hợp xương đùi', '2026-02-01', mockCatalog);
      expect(res.found).toBe(true);
      expect(res.price).toBe(1_800_000);
    });

    it('fallback tìm theo maTuongDuong khi tên kỹ thuật không khớp', () => {
      const res = getNamePrice('Tên kỹ thuật gõ sai hoàn toàn', '2025-07-01', mockCatalog, '24.0018.1611');
      expect(res.found).toBe(true);
      expect(res.price).toBe(1_500_000);
      expect(res.matchedItem?.maTuongDuong).toBe('24.0018.1611');
    });

    it('getNamePriceFast cho kết quả hoàn toàn đồng nhất với getNamePrice', () => {
      const index = buildNamePricesIndex(mockCatalog);
      const resDirect = getNamePrice('Phẫu thuật kết hợp xương đùi', '2025-05-10', mockCatalog);
      const resFast = getNamePriceFast('Phẫu thuật kết hợp xương đùi', '2025-05-10', index);

      expect(resFast.found).toBe(resDirect.found);
      expect(resFast.price).toBe(resDirect.price);
      expect(resFast.matchedItem?.id).toBe(resDirect.matchedItem?.id);
    });

    it('hỗ trợ định dạng ngày dạng số yyyymmdd trong DM giá và ngày phẫu thuật dạng dd/mm/yyyy', () => {
      const numericCatalog: SurgeryNamePrice[] = [
        {
          id: 'num_1',
          tenKT: 'Phẫu thuật mắt',
          price: 500_000,
          effectiveFrom: 20250101 as any,
          effectiveTo: 20251231 as any,
        },
      ];
      const res = getNamePrice('Phẫu thuật mắt', '15/06/2025', numericCatalog);
      expect(res.found).toBe(true);
      expect(res.price).toBe(500_000);
    });
  });

  describe('3. Surgery Service Price Versions by Effective Date (getServicePrice & validatePriceVersionOverlap)', () => {
    const mockVersions: SurgeryPriceVersion[] = [
      {
        id: 'v_2024',
        name: 'Bảng giá 2024',
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-12-31',
        createdAt: 1000,
        prices: {
          'PĐB': 3_000_000,
          'P1': 2_000_000,
          'P2': 1_500_000,
          'P3': 1_000_000,
          'TĐB': 800_000,
          'T1': 500_000,
          'T2': 300_000,
          'T3': 150_000,
          'TKPL': 0,
        },
      },
      {
        id: 'v_2025_plus',
        name: 'Bảng giá 2025 trở đi',
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
        createdAt: 2000,
        prices: {
          'PĐB': 3_500_000,
          'P1': 2_400_000,
          'P2': 1_800_000,
          'P3': 1_200_000,
          'TĐB': 900_000,
          'T1': 600_000,
          'T2': 350_000,
          'T3': 200_000,
          'TKPL': 0,
        },
      },
    ];

    it('lấy đúng đơn giá loại PTTT theo ngày phẫu thuật', () => {
      // Trong năm 2024
      const res2024 = getServicePrice('P1', '2024-07-15', mockVersions);
      expect(res2024.found).toBe(true);
      expect(res2024.price).toBe(2_000_000);

      // Trong năm 2025
      const res2025 = getServicePrice('P1', '2025-03-01', mockVersions);
      expect(res2025.found).toBe(true);
      expect(res2025.price).toBe(2_400_000);

      // Ngày trước bảng giá đầu tiên -> found = false
      const resPast = getServicePrice('P1', '2023-11-01', mockVersions);
      expect(resPast.found).toBe(false);
      expect(resPast.price).toBe(0);
    });

    it('validatePriceVersionOverlap phát hiện trùng lặp khoảng thời gian giữa các bảng giá', () => {
      const overlappingVersion = {
        name: 'Bảng giá trùng',
        effectiveFrom: '2024-06-01',
        effectiveTo: '2025-06-01',
        note: '',
        prices: {},
      };

      const error = validatePriceVersionOverlap(overlappingVersion, mockVersions);
      expect(error).toContain('Trùng thời gian');
    });

    it('validatePriceVersionOverlap cho phép lưu khi chỉnh sửa chính phiên bản đó (editingId)', () => {
      const selfVersion = {
        name: 'Bảng giá 2024 cập nhật',
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-12-31',
        note: '',
        prices: {},
      };

      const error = validatePriceVersionOverlap(selfVersion, mockVersions, 'v_2024');
      expect(error).toBeNull();
    });

    it('validatePrices kiểm tra đầy đủ 9 loại phẫu thuật thủ thuật và không âm', () => {
      const invalidPrices = {
        'PĐB': 1000,
        'P1': -500, // âm
        // thiếu P2, P3, TĐB, T1, T2, T3, TKPL
      };

      const errors = validatePrices(invalidPrices);
      expect(errors.some(e => e.includes('không được âm'))).toBe(true);
      expect(errors.some(e => e.includes('Thiếu đơn giá cho P2'))).toBe(true);
    });
  });

  describe('4. Required Machine Catalog by Effective Date (isMachineCodeRequired)', () => {
    const mockMachineCatalog: RequiredMachineItem[] = [
      {
        id: 'm1',
        maTuongDuong: '24.0018.1611',
        tenDVKT: 'Phẫu thuật tán sỏi laser',
        effectiveFrom: '2025-01-01',
        effectiveTo: '2025-12-31',
        isRequired: true,
      },
      {
        id: 'm2',
        maTuongDuong: '24.0018.1611',
        tenDVKT: 'Phẫu thuật tán sỏi laser',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isRequired: false, // Từ 2026 không bắt buộc
      },
      {
        id: 'm3',
        maTuongDuong: '13.0010.0500',
        tenDVKT: 'Phẫu thuật nội soi khớp gối',
        effectiveFrom: '2024-01-01',
        effectiveTo: null,
        isRequired: true,
      },
    ];

    it('yêu cầu mã máy nếu ca mổ trong khoảng hiệu lực isRequired = true', () => {
      const record = {
        maTuongDuong: '24.0018.1611',
        tenKT: 'Phẫu thuật tán sỏi laser',
        ngayBD: '2025-06-15',
      };
      expect(isMachineCodeRequired(record, mockMachineCatalog)).toBe(true);
    });

    it('không yêu cầu mã máy khi sang năm 2026 (isRequired = false)', () => {
      const record = {
        maTuongDuong: '24.0018.1611',
        tenKT: 'Phẫu thuật tán sỏi laser',
        ngayBD: '2026-02-10',
      };
      expect(isMachineCodeRequired(record, mockMachineCatalog)).toBe(false);
    });

    it('fallback tra cứu theo tên kỹ thuật khi ca mổ không có maTuongDuong', () => {
      const record = {
        tenKT: 'Phẫu thuật nội soi khớp gối',
        ngayBD: '2025-03-01',
      };
      expect(isMachineCodeRequired(record, mockMachineCatalog)).toBe(true);
    });

    it('hoạt động chính xác với cả bản catalog mảng lẫn catalog đã pre-index', () => {
      const indexed = buildRequiredMachineIndex(mockMachineCatalog);
      const record = {
        maTuongDuong: '13.0010.0500',
        tenKT: 'Phẫu thuật nội soi khớp gối',
        ngayBD: '2025-04-10',
      };

      const directRes = isMachineCodeRequired(record, mockMachineCatalog);
      const indexedRes = isMachineCodeRequired(record, indexed);

      expect(indexedRes).toBe(true);
      expect(indexedRes).toBe(directRes);
    });

    it('trả về false nếu kỹ thuật không nằm trong danh mục máy bắt buộc', () => {
      const record = {
        maTuongDuong: '99.9999.9999',
        tenKT: 'Khâu vết thương phần mềm',
        ngayBD: '2025-05-01',
      };
      expect(isMachineCodeRequired(record, mockMachineCatalog)).toBe(false);
    });
  });
});
