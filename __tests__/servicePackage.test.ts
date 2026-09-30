/**
 * Service Package Module — Unit Tests
 * Tests for types, composite key generation, and business logic.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeForKey,
  buildCompositeKey,
  getRecordDateString,
  clearPackageDrafts,
  LS_DRAFT_KEY,
  DEFAULT_POSITIONS,
  type PositionCatalogItem,
  type ServicePackageDefinition,
  type ServicePackageAssignment,
  type PackageStaffAssignment,
} from '../types/servicePackage';

describe('Service Package Module', () => {
  // ─── Composite Key & Date Helpers ─────────────────────────────────────

  describe('clearPackageDrafts()', () => {
    it('clears drafts from storage without throwing', () => {
      localStorage.setItem(LS_DRAFT_KEY, JSON.stringify([{ id: 'test' }]));
      expect(localStorage.getItem(LS_DRAFT_KEY)).not.toBeNull();
      clearPackageDrafts();
      expect(localStorage.getItem(LS_DRAFT_KEY)).toBeNull();
    });
  });

  describe('getRecordDateString()', () => {
    it('extracts date from Date start property', () => {
      const d = new Date('2026-09-30T08:00:00.000Z');
      expect(getRecordDateString({ start: d })).toBe('2026-09-30T08:00:00.000Z');
    });

    it('extracts date from string start property (JSON deserialization)', () => {
      expect(getRecordDateString({ start: '2026-09-30T08:00:00.000Z' })).toBe('2026-09-30T08:00:00.000Z');
    });

    it('falls back to ngayBD if start is not present', () => {
      expect(getRecordDateString({ ngayBD: '2026-09-30' })).toBe('2026-09-30');
    });

    it('handles null/undefined record safely', () => {
      expect(getRecordDateString(null)).toBe('');
      expect(getRecordDateString(undefined)).toBe('');
      expect(getRecordDateString({})).toBe('');
    });
  });

  describe('normalizeForKey()', () => {
    it('converts to lowercase and replaces spaces with underscores', () => {
      expect(normalizeForKey('Phẫu thuật quặm')).toBe('phẫu_thuật_quặm');
    });

    it('trims whitespace', () => {
      expect(normalizeForKey('  test  ')).toBe('test');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeForKey('a  b   c')).toBe('a_b_c');
    });

    it('handles empty string', () => {
      expect(normalizeForKey('')).toBe('');
    });
  });

  describe('buildCompositeKey()', () => {
    it('creates key from patientId, ngayBD, tenKT', () => {
      const key = buildCompositeKey('BN001', '2026-09-30T08:00:00', 'Phẫu thuật ruột thừa');
      expect(key).toBe('BN001_2026-09-30_phẫu_thuật_ruột_thừa');
    });

    it('normalizes date to YYYY-MM-DD', () => {
      const key = buildCompositeKey('BN002', '2026-10-15T14:30:00.000Z', 'Test');
      expect(key).toBe('BN002_2026-10-15_test');
    });

    it('same patient + same day + same surgery = same key', () => {
      const key1 = buildCompositeKey('BN001', '2026-09-30T08:00:00', 'Test PT');
      const key2 = buildCompositeKey('BN001', '2026-09-30T16:00:00', 'Test PT');
      expect(key1).toBe(key2);
    });

    it('different surgery name = different key', () => {
      const key1 = buildCompositeKey('BN001', '2026-09-30', 'PT A');
      const key2 = buildCompositeKey('BN001', '2026-09-30', 'PT B');
      expect(key1).not.toBe(key2);
    });
  });

  // ─── Default Positions ─────────────────────────────────────────────────

  describe('DEFAULT_POSITIONS', () => {
    it('has 9 positions', () => {
      expect(DEFAULT_POSITIONS).toHaveLength(9);
    });

    it('has 6 surgery-participant positions', () => {
      const surgical = DEFAULT_POSITIONS.filter((p) => p.isSurgeryParticipant);
      expect(surgical).toHaveLength(6);
    });

    it('has 3 non-surgical positions', () => {
      const nonSurgical = DEFAULT_POSITIONS.filter((p) => !p.isSurgeryParticipant);
      expect(nonSurgical).toHaveLength(3);
      const keys = nonSurgical.map((p) => p.key);
      expect(keys).toContain('chuanBiPT');
      expect(keys).toContain('hoSinhDonBe');
      expect(keys).toContain('nguoiTuVan');
    });

    it('all have unique keys', () => {
      const keys = DEFAULT_POSITIONS.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('surgical positions have staffFilterKey', () => {
      const surgical = DEFAULT_POSITIONS.filter((p) => p.isSurgeryParticipant);
      for (const pos of surgical) {
        expect(pos.staffFilterKey).toBeDefined();
        expect(pos.staffFilterKey).toBe(pos.key);
      }
    });

    it('non-surgical positions do NOT have staffFilterKey', () => {
      const nonSurgical = DEFAULT_POSITIONS.filter((p) => !p.isSurgeryParticipant);
      for (const pos of nonSurgical) {
        expect(pos.staffFilterKey).toBeUndefined();
      }
    });

    it('sortOrders are sequential 1-9', () => {
      const orders = DEFAULT_POSITIONS.map((p) => p.sortOrder);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  // ─── Type Shape Validation ─────────────────────────────────────────────

  describe('ServicePackageDefinition shape', () => {
    it('validates a well-formed package definition', () => {
      const pkg: ServicePackageDefinition = {
        id: 'pkg-1',
        name: 'Phẫu thuật chọn bác sĩ',
        totalAmount: 2_000_000,
        positions: [
          { positionId: 'pos-1', positionKey: 'ptChinh', positionLabel: 'PT chính', amount: 700_000 },
          { positionId: 'pos-2', positionKey: 'ptPhu', positionLabel: 'PT phụ', amount: 270_000 },
          { positionId: 'pos-3', positionKey: 'bsGM', positionLabel: 'BS GM', amount: 280_000 },
          { positionId: 'pos-4', positionKey: 'ktvGM', positionLabel: 'KTV GM', amount: 190_000 },
          { positionId: 'pos-5', positionKey: 'tdc', positionLabel: 'TDC', amount: 160_000 },
          { positionId: 'pos-6', positionKey: 'gv', positionLabel: 'GV', amount: 50_000 },
          { positionId: 'pos-7', positionKey: 'chuanBiPT', positionLabel: 'Chuẩn bị PT', amount: 110_000 },
          { positionId: 'pos-8', positionKey: 'nguoiTuVan', positionLabel: 'Tư vấn', amount: 200_000 },
        ],
        active: true,
        sortOrder: 1,
        note: 'Gói cơ bản',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(pkg.totalAmount).toBe(2_000_000);
      const sumPositions = pkg.positions.reduce((s, p) => s + p.amount, 0);
      expect(sumPositions).toBe(1_960_000); // 2M - 40k = positions sum
      expect(pkg.positions).toHaveLength(8);
    });
  });

  describe('ServicePackageAssignment shape', () => {
    it('validates a well-formed assignment', () => {
      const assignment: ServicePackageAssignment = {
        id: 'asgn-1',
        patientId: 'BN001',
        ngayBD: '2026-09-30T08:00:00',
        tenKT: 'Phẫu thuật ruột thừa',
        compositeKey: buildCompositeKey('BN001', '2026-09-30T08:00:00', 'Phẫu thuật ruột thừa'),
        patientName: 'Nguyễn Văn A',
        gender: 'Nam',
        yob: '1990',
        packageId: 'pkg-1',
        packageName: 'Phẫu thuật chọn bác sĩ',
        staffAssignments: [
          { positionId: 'pos-1', positionKey: 'ptChinh', positionLabel: 'PT chính', staffName: 'BS Trần A', amount: 700_000, autoFilled: true },
          { positionId: 'pos-8', positionKey: 'nguoiTuVan', positionLabel: 'Tư vấn', staffName: 'Lê Thị B', amount: 200_000, autoFilled: false },
        ],
        linkedSurgeryKeys: ['BN001_2026-09-30_key1'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'user-123',
      };

      expect(assignment.compositeKey).toBe('BN001_2026-09-30_phẫu_thuật_ruột_thừa');
      expect(assignment.staffAssignments).toHaveLength(2);
      expect(assignment.staffAssignments[0].autoFilled).toBe(true);
      expect(assignment.staffAssignments[1].autoFilled).toBe(false);
    });

    it('two surgeries same patient same day produce different keys', () => {
      const key1 = buildCompositeKey('BN001', '2026-09-30', 'Phẫu thuật A');
      const key2 = buildCompositeKey('BN001', '2026-09-30', 'Phẫu thuật B');
      expect(key1).not.toBe(key2);
    });
  });

  // ─── Business Rules ────────────────────────────────────────────────────

  describe('Business Rules', () => {
    it('disabled package should not be selectable (active=false)', () => {
      const pkg: ServicePackageDefinition = {
        id: 'pkg-disabled',
        name: 'Gói cũ',
        totalAmount: 1_000_000,
        positions: [],
        active: false,
        sortOrder: 99,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // In UI, filter packages with active: true
      const availablePackages = [pkg].filter((p) => p.active);
      expect(availablePackages).toHaveLength(0);
    });

    it('staff filter: non-surgical positions should show only nonSurgical staff', () => {
      const staffList = [
        { id: '1', name: 'BS A', position: 'BS PT' as const, taxId: '', department: '', nonSurgical: false },
        { id: '2', name: 'NV B', position: '' as const, taxId: '', department: '', nonSurgical: true },
        { id: '3', name: 'NV C', position: '' as const, taxId: '', department: '', nonSurgical: true },
      ];

      // For non-surgical position (e.g. chuanBiPT), filter nonSurgical=true
      const nonSurgicalStaff = staffList.filter((s) => s.nonSurgical === true);
      expect(nonSurgicalStaff).toHaveLength(2);
      expect(nonSurgicalStaff.map((s) => s.name)).toEqual(['NV B', 'NV C']);
    });
  });

  // ─── Print Config Generation (Count vs Amount) ─────────────────────────

  describe('buildPackagePaymentPrintConfig', () => {
    const mockStorage: Record<string, string> = {};
    const fakeLocalStorage = {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
    };
    // @ts-ignore
    globalThis.localStorage = fakeLocalStorage;

    const mockPackages: ServicePackageDefinition[] = [
      {
        id: 'pkg-1',
        name: 'DV chọn bác sĩ phẫu thuật theo yêu cầu',
        shortName: 'Chọn BS',
        totalAmount: 1_000_000,
        positions: [
          { positionId: 'pos-1', positionKey: 'ptChinh', positionLabel: 'PTV chính', amount: 700_000 },
          { positionId: 'pos-2', positionKey: 'ptPhu', positionLabel: 'PTV phụ', amount: 300_000 },
        ],
        active: true,
        sortOrder: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const mockAssignments: ServicePackageAssignment[] = [
      {
        id: 'asg-1',
        compositeKey: 'BN01_2026-10-01_pt',
        patientId: 'BN01',
        patientName: 'Đào Văn Điệp',
        surgeryDate: '2026-10-01',
        surgeryName: 'PT nội soi',
        packageId: 'pkg-1',
        packageName: 'DV chọn bác sĩ phẫu thuật theo yêu cầu',
        staffAssignments: [
          { positionId: 'pos-1', positionKey: 'ptChinh', positionLabel: 'PTV chính', staffName: 'Đào Văn Điệp', amount: 700_000, autoFilled: true },
        ],
        linkedSurgeryKeys: ['BN01_2026-10-01_pt'],
        createdAt: 0,
        updatedAt: 0,
        createdBy: 'test',
      },
      {
        id: 'asg-2',
        compositeKey: 'BN02_2026-10-01_pt',
        patientId: 'BN02',
        patientName: 'Trương Thanh Quý',
        surgeryDate: '2026-10-01',
        surgeryName: 'PT xương',
        packageId: 'pkg-1',
        packageName: 'DV chọn bác sĩ phẫu thuật theo yêu cầu',
        staffAssignments: [
          { positionId: 'pos-2', positionKey: 'ptPhu', positionLabel: 'PTV phụ', staffName: 'Trương Thanh Quý', amount: 300_000, autoFilled: true },
        ],
        linkedSurgeryKeys: ['BN02_2026-10-01_pt'],
        createdAt: 0,
        updatedAt: 0,
        createdBy: 'test',
      },
    ];

    const mockStaff = [
      { id: '1', name: 'Đào Văn Điệp', department: 'Ngoại TH', taxId: '1030177429', position: 'BS' as const },
      { id: '2', name: 'Trương Thanh Quý', department: 'CTCH', taxId: '1030176836', position: 'BS' as const },
    ];

    it('generates count mode with numbers in cells and center alignment', async () => {
      const { buildPackagePaymentPrintConfig } = await import('../hooks/usePrintController');
      localStorage.setItem('package_payment_mode', 'count');

      const config = buildPackagePaymentPrintConfig({
        assignments: mockAssignments,
        packages: mockPackages,
        staffList: mockStaff,
        dateRangeText: 'Từ ngày 28/09/2026 đến ngày 01/10/2026',
        orientation: 'portrait',
        config: {},
        packagePaymentMode: 'count',
      });

      expect(config).not.toBeNull();
      expect(config.title).toBe('BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU');

      // Columns alignment for positions in count mode should be 'center'
      const posCol = config.columns.find((c: any) => c.key === 'pkg-1_ptChinh');
      expect(posCol.align).toBe('center');

      // Cell value in count mode should be number 1
      const diepRow = config.data.find((r: any) => r.staffName === 'Đào Văn Điệp');
      expect(diepRow['pkg-1_ptChinh']).toBe(1);
    });

    it('generates amount mode with formatted currency strings and right alignment', async () => {
      const { buildPackagePaymentPrintConfig } = await import('../hooks/usePrintController');
      localStorage.setItem('package_payment_mode', 'amount');

      const config = buildPackagePaymentPrintConfig({
        assignments: mockAssignments,
        packages: mockPackages,
        staffList: mockStaff,
        dateRangeText: 'Từ ngày 28/09/2026 đến ngày 01/10/2026',
        orientation: 'portrait',
        config: {},
        packagePaymentMode: 'amount',
      });

      expect(config).not.toBeNull();

      // Columns alignment for positions in amount mode should be 'right'
      const posCol = config.columns.find((c: any) => c.key === 'pkg-1_ptChinh');
      expect(posCol.align).toBe('right');

      // Cell value in amount mode should be formatted string '700.000', NOT count 1
      const diepRow = config.data.find((r: any) => r.staffName === 'Đào Văn Điệp');
      expect(diepRow['pkg-1_ptChinh']).toBe('700.000');

      const quyRow = config.data.find((r: any) => r.staffName === 'Trương Thanh Quý');
      expect(quyRow['pkg-1_ptPhu']).toBe('300.000');
    });

    it('prioritizes localStorage when user toggles mode to amount', async () => {
      const { buildPackagePaymentPrintConfig } = await import('../hooks/usePrintController');
      localStorage.setItem('package_payment_mode', 'amount');

      // Even if parameter was stale 'count', localStorage 'amount' must take precedence
      const config = buildPackagePaymentPrintConfig({
        assignments: mockAssignments,
        packages: mockPackages,
        staffList: mockStaff,
        dateRangeText: 'Từ ngày 28/09/2026 đến ngày 01/10/2026',
        orientation: 'portrait',
        config: {},
        packagePaymentMode: 'count', // stale param
      });

      const diepRow = config.data.find((r: any) => r.staffName === 'Đào Văn Điệp');
      expect(diepRow['pkg-1_ptChinh']).toBe('700.000');
    });
  });
});
