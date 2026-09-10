/**
 * Test Nhóm F: Refill Functions & Catalog Management
 * Kiểm thử tính năng:
 * - Thuật toán trích xuất ứng viên Refill vào Danh mục giá từ dữ liệu Excel (generateRefillCandidates)
 *   + Phân biệt phẫu thuật gây tê vs gây mê (_GT)
 *   + Chuẩn hóa theo BHYT vs Viện phí
 *   + Gom nhóm theo catalogId (tối đa 1 dòng/mục)
 *   + Phát hiện xung đột nhiều mức giá BHYT (conflictWarning)
 *   + Phân loại action (update / create) và tự động chọn (selected)
 * - Khớp và nạp đơn giá từ file Thống kê DVKT (matchAndApplyServicePrices, normalizeMaTuongDuong)
 * - Ánh xạ danh mục chương kỹ thuật (maTuongDuong -> ma_chuong, DEFAULT_CHAPTERS)
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
  push: vi.fn(() => ({ key: 'mock_ref' })),
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
  generateRefillCandidates,
  findCatalogItemByMaTuongDuong,
  isCatalogItemGayTe,
  isRecordGayTe,
} from '../services/surgeryNamePriceService';
import {
  normalizeMaTuongDuong,
  matchAndApplyServicePrices,
} from '../services/servicePriceProcessor';
import { DEFAULT_CHAPTERS } from '../services/chapterCatalogService';
import { SurgeryNamePrice, SurgeryRecord, PatientServicePriceGroup } from '../types';

describe('Refill Functions & Catalog Management', () => {
  describe('1. Anesthesia Identification (Gây tê vs Gây mê)', () => {
    it('isRecordGayTe nhận diện đúng ca gây tê dựa vào hậu tố _GT', () => {
      expect(isRecordGayTe('24.0018.1611_GT')).toBe(true);
      expect(isRecordGayTe('24.0018.1611_gt')).toBe(true);
      expect(isRecordGayTe(' 24.0018.1611_GT ')).toBe(true);
      expect(isRecordGayTe('24.0018.1611')).toBe(false);
      expect(isRecordGayTe('')).toBe(false);
    });

    it('isCatalogItemGayTe nhận diện đúng item gây tê qua tên hoặc maTuongDuong', () => {
      const itemByName: SurgeryNamePrice = {
        id: '1',
        tenKT: 'Phẫu thuật mộng thịt [gây tê]',
        price: 300_000,
        effectiveFrom: '2025-01-01',
      };
      const itemByCode: SurgeryNamePrice = {
        id: '2',
        tenKT: 'Phẫu thuật quặm mi',
        maTuongDuong: '24.0018.1611_GT',
        price: 400_000,
        effectiveFrom: '2025-01-01',
      };
      const itemGeneral: SurgeryNamePrice = {
        id: '3',
        tenKT: 'Phẫu thuật nội soi khớp gối',
        maTuongDuong: '13.0010.0500',
        price: 2_000_000,
        effectiveFrom: '2025-01-01',
      };

      expect(isCatalogItemGayTe(itemByName)).toBe(true);
      expect(isCatalogItemGayTe(itemByCode)).toBe(true);
      expect(isCatalogItemGayTe(itemGeneral)).toBe(false);
    });

    it('findCatalogItemByMaTuongDuong ưu tiên đúng mục gây tê khi record là _GT và mục gây mê khi record thường', () => {
      const catalog: SurgeryNamePrice[] = [
        {
          id: 'item_me',
          tenKT: 'Phẫu thuật đục thủy tinh thể',
          maTuongDuong: '24.0010.0001',
          price: 2_500_000,
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
        },
        {
          id: 'item_te',
          tenKT: 'Phẫu thuật đục thủy tinh thể [gây tê]',
          maTuongDuong: '24.0010.0001_GT',
          price: 1_200_000,
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
        },
      ];

      // Ca mổ có _GT -> phải tìm ra item gây tê
      const matchGT = findCatalogItemByMaTuongDuong('24.0010.0001_GT', '2025-06-01', catalog);
      expect(matchGT?.id).toBe('item_te');
      expect(matchGT?.price).toBe(1_200_000);

      // Ca mổ thường không có _GT -> phải tìm ra item gây mê
      const matchMe = findCatalogItemByMaTuongDuong('24.0010.0001', '2025-06-01', catalog);
      expect(matchMe?.id).toBe('item_me');
      expect(matchMe?.price).toBe(2_500_000);
    });
  });

  describe('2. Refill Candidate Generation (generateRefillCandidates)', () => {
    const baseCatalog: SurgeryNamePrice[] = [
      {
        id: 'cat_1',
        tenKT: 'Cắt amidan',
        maTuongDuong: '25.0001.0100',
        price: 1_000_000,
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
      },
      {
        id: 'cat_2',
        tenKT: 'Nạo VA',
        maTuongDuong: '25.0002.0200',
        price: 800_000,
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
      },
      {
        id: 'cat_3_te',
        tenKT: 'Phẫu thuật mộng thịt [gây tê]',
        maTuongDuong: '24.0018.1611_GT',
        price: 450_000,
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
      },
    ];

    it('gom nhóm nhiều ca cùng catalogId thành 1 candidate duy nhất và tính tổng số ca BHYT', () => {
      const records = [
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-01', bhyt: 'DN4010123456789' },
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-02', bhyt: 'DN4010123456789' },
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-03', bhyt: 'DN4010123456789' },
      ];

      const candidates = generateRefillCandidates(records, baseCatalog);
      expect(candidates.length).toBe(1);
      expect(candidates[0].catalogId).toBe('cat_1');
      expect(candidates[0].action).toBe('update');
      expect(candidates[0].oldPrice).toBe(1_000_000);
      expect(candidates[0].newPrice).toBe(1_200_000);
      expect(candidates[0].matchedCount).toBe(3);
      expect(candidates[0].selected).toBe(true); // vì giá thay đổi 1tr -> 1.2tr
    });

    it('bỏ qua đơn giá từ ca Viện Phí (VP) khi xác định đơn giá chuẩn cho mục đã có', () => {
      const records = [
        // 1 ca BHYT giá 1,200,000
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-01', bhyt: 'DN4010123456789' },
        // 5 ca Viện phí giá 2,000,000 (không có mã thẻ BHYT hợp lệ)
        { maTuongDuong: '25.0001.0100', donGia: 2_000_000, ngayBD: '2025-05-02', bhyt: '' },
        { maTuongDuong: '25.0001.0100', donGia: 2_000_000, ngayBD: '2025-05-03', bhyt: 'VP' },
      ];

      const candidates = generateRefillCandidates(records, baseCatalog);
      expect(candidates.length).toBe(1);
      // Đơn giá đề xuất phải là giá BHYT (1,200,000), không bị chi phối bởi các ca Viện phí
      expect(candidates[0].newPrice).toBe(1_200_000);
      expect(candidates[0].matchedCount).toBe(1);
    });

    it('phát hiện xung đột giá khi có nhiều mức giá BHYT khác nhau và cảnh báo conflictWarning', () => {
      const records = [
        // 3 ca giá 1,200,000
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-01', bhyt: 'DN4010123456789' },
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-02', bhyt: 'DN4010123456789' },
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-03', bhyt: 'DN4010123456789' },
        // 1 ca giá 1_100_000
        { maTuongDuong: '25.0001.0100', donGia: 1_100_000, ngayBD: '2025-05-04', bhyt: 'DN4010123456789' },
      ];

      const candidates = generateRefillCandidates(records, baseCatalog);
      expect(candidates.length).toBe(1);
      // Lấy giá nhiều ca nhất
      expect(candidates[0].newPrice).toBe(1_200_000);
      expect(candidates[0].conflictWarning).toBeDefined();
      expect(candidates[0].conflictWarning).toContain('1.200.000');
      expect(candidates[0].conflictWarning).toContain('1.100.000');
    });

    it('đề xuất action create khi kỹ thuật chưa tồn tại trong danh mục giá', () => {
      const records = [
        {
          maTuongDuong: '28.9999.0001',
          donGia: 3_500_000,
          ngayBD: '2025-06-15',
          tenKT: 'Phẫu thuật lồng ngực mới',
          bhyt: 'DN4010123456789',
        },
      ];

      const candidates = generateRefillCandidates(records, baseCatalog);
      expect(candidates.length).toBe(1);
      expect(candidates[0].action).toBe('create');
      expect(candidates[0].newPrice).toBe(3_500_000);
      expect(candidates[0].tenKT).toBe('Phẫu thuật lồng ngực mới');
      expect(candidates[0].selected).toBe(true);
      expect(candidates[0].effectiveFrom).toBe('2025-06-01'); // đầu tháng của ca mổ
    });

    it('không tạo candidate mới nếu ca chưa có trong danh mục lại là ca Viện phí (VP)', () => {
      const records = [
        {
          maTuongDuong: '28.9999.0001',
          donGia: 3_500_000,
          ngayBD: '2025-06-15',
          tenKT: 'Dịch vụ thẩm mỹ tự nguyện',
          bhyt: '', // Viện phí
        },
      ];

      const candidates = generateRefillCandidates(records, baseCatalog);
      expect(candidates.length).toBe(0);
    });

    it('nếu giá không đổi so với catalog thì selected = false và xếp sau các mục có thay đổi', () => {
      const records = [
        // Mục 1: Cắt amidan giá 1tr -> 1.2tr (thay đổi)
        { maTuongDuong: '25.0001.0100', donGia: 1_200_000, ngayBD: '2025-05-01', bhyt: 'DN4010123456789' },
        // Mục 2: Nạo VA giá 800k -> 800k (không đổi)
        { maTuongDuong: '25.0002.0200', donGia: 800_000, ngayBD: '2025-05-01', bhyt: 'DN4010123456789' },
      ];

      const candidates = generateRefillCandidates(records, baseCatalog);
      expect(candidates.length).toBe(2);

      const changedItem = candidates.find(c => c.catalogId === 'cat_1');
      const unchangedItem = candidates.find(c => c.catalogId === 'cat_2');

      expect(changedItem?.selected).toBe(true);
      expect(unchangedItem?.selected).toBe(false);

      // Mục thay đổi xếp trước mục không thay đổi
      expect(candidates[0].catalogId).toBe('cat_1');
      expect(candidates[1].catalogId).toBe('cat_2');
    });
  });

  describe('3. Service Price Processor (matchAndApplyServicePrices & normalizeMaTuongDuong)', () => {
    it('normalizeMaTuongDuong chuẩn hóa đúng mã 9 số thành 10 số và format XX.XXXX.XXXX', () => {
      expect(normalizeMaTuongDuong('305270230')).toBe('03.0527.0230');
      expect(normalizeMaTuongDuong('1602321016')).toBe('16.0232.1016');
      expect(normalizeMaTuongDuong('2701910451')).toBe('27.0191.0451');
      expect(normalizeMaTuongDuong(' 1602321016 ')).toBe('16.0232.1016');
      expect(normalizeMaTuongDuong('')).toBe('');
      expect(normalizeMaTuongDuong(null)).toBe('');
    });

    it('matchAndApplyServicePrices khớp chuẩn xác theo Mã KCB + Tên kỹ thuật + Số lượng', () => {
      const records: SurgeryRecord[] = [
        {
          id: 'rec_1',
          patientId: '2600097066',
          patientName: 'LẠI HOÀNG ANH TÚ',
          tenKT: 'Phẫu thuật nạo VA',
          soLuong: 1,
          date: '2025-05-10',
        },
      ];

      const groups: PatientServicePriceGroup[] = [
        {
          patientId: '2600097066',
          patientName: 'LẠI HOÀNG ANH TÚ',
          services: [
            {
              stt: 1,
              maBHXH: '2500020200',
              maTuongDuong: '25.0002.0200',
              maDV: 'DV01',
              mahh: '',
              tenDichVu: 'Phẫu thuật nạo VA',
              soLuong: 1,
              dvt: 'Lần',
              donGia: 850_000,
              thanhTien: 850_000,
            },
          ],
        },
      ];

      const result = matchAndApplyServicePrices(records, groups);
      expect(result.matchedCount).toBe(1);
      expect(result.unmatchedCount).toBe(0);
      expect(result.totalMatchedAmount).toBe(850_000);

      const updated = result.updatedRecords[0];
      expect(updated.maTuongDuong).toBe('25.0002.0200');
      expect(updated.donGia).toBe(850_000);
      expect(updated.thanhTien).toBe(850_000);
      expect(updated.priceSource).toBe('excel_dvkt');
    });

    it('matchAndApplyServicePrices tự động tính lại thanhTien khi khớp fallback không cùng số lượng', () => {
      const records: SurgeryRecord[] = [
        {
          id: 'rec_2',
          patientId: '2600097066',
          patientName: 'LẠI HOÀNG ANH TÚ',
          tenKT: 'Cắt bao quy đầu',
          soLuong: 2, // ca mổ thực hiện 2 lần
          date: '2025-05-10',
        },
      ];

      const groups: PatientServicePriceGroup[] = [
        {
          patientId: '2600097066',
          patientName: 'LẠI HOÀNG ANH TÚ',
          services: [
            {
              stt: 2,
              maBHXH: '1400010100',
              maTuongDuong: '14.0001.0100',
              maDV: 'DV02',
              mahh: '',
              tenDichVu: 'Cắt bao quy đầu',
              soLuong: 1, // trong file chỉ thống kê 1
              dvt: 'Lần',
              donGia: 500_000,
              thanhTien: 500_000,
            },
          ],
        },
      ];

      const result = matchAndApplyServicePrices(records, groups);
      expect(result.matchedCount).toBe(1);
      // thanhTien phải tính theo số lượng của ca mổ: 500k * 2 = 1,000,000
      expect(result.updatedRecords[0].thanhTien).toBe(1_000_000);
      expect(result.totalMatchedAmount).toBe(1_000_000);
    });
  });

  describe('4. Chapter Catalog Mapping (ma_chuong -> DEFAULT_CHAPTERS)', () => {
    it('DEFAULT_CHAPTERS bao gồm đủ 28 chương chuẩn phẫu thuật y tế', () => {
      expect(DEFAULT_CHAPTERS.length).toBe(28);
      const codes = DEFAULT_CHAPTERS.map(c => c.ma_chuong);
      // Kiểm tra có đầy đủ từ '01' đến '28'
      for (let i = 1; i <= 28; i++) {
        const expectedCode = String(i).padStart(2, '0');
        expect(codes).toContain(expectedCode);
      }
    });

    it('ánh xạ đúng mã chương từ 2 ký tự đầu của maTuongDuong', () => {
      const getChapterName = (maTuongDuong: string): string => {
        const maChuong = maTuongDuong.slice(0, 2);
        const chapter = DEFAULT_CHAPTERS.find(c => c.ma_chuong === maChuong);
        return chapter ? chapter.ten_chuong : 'Chưa phân loại';
      };

      expect(getChapterName('24.0018.1611')).toBe('Phẫu thuật Mắt');
      expect(getChapterName('25.0001.0100')).toBe('Phẫu thuật Tai Mũi Họng');
      expect(getChapterName('22.0001.0050')).toBe('Phẫu thuật Thần kinh');
      expect(getChapterName('13.0010.0500')).toBe('Bệnh hệ cơ xương khớp và mô liên kết');
      expect(getChapterName('99.0000.0000')).toBe('Chưa phân loại');
    });
  });
});
