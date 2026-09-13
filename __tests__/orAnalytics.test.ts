import { describe, it, expect } from 'vitest';
import { calculateOrAnalytics } from '../services/orAnalyticsService';
import { DEFAULT_KPI_CONFIG, KpiConfig } from '../types/kpi';
import { PersistedSurgeryRecord, SurgeryCostItem } from '../types';

describe('OR Analytics & KPI Service (Macro OR Capacity & Concurrency)', () => {
  const mockRecords: PersistedSurgeryRecord[] = [
    {
      stt: 1,
      patientId: 'BN001',
      patientName: 'Nguyễn Văn A',
      gender: 'Nam',
      yob: '1980',
      bhyt: 'DN4010123456789',
      ngayCD: '2026-09-10T07:00:00Z',
      ngayBD: '2026-09-10T08:00:00Z',
      ngayKT: '2026-09-10T09:30:00Z',
      timeMinutes: 90,
      tenKT: 'Phẫu thuật cắt ruột thừa nội soi',
      loaiPTTT: 'P1',
      soLuong: 1,
      ptChinh: 'Bs. Nguyễn Văn Minh',
      ptPhu: 'Bs. Lan',
      bsGM: 'Bs. Tuấn',
      ktvGM: 'KTV Nam',
      tdc: 'ĐD Hoa',
      gv: 'ĐD Bình',
      type: 'MONTHLY',
      donGia: 3_000_000,
      thanhTien: 3_000_000,
    },
    {
      stt: 2,
      patientId: 'BN002',
      patientName: 'Trần Thị B',
      gender: 'Nữ',
      yob: '1992',
      bhyt: 'DN4010123456788',
      ngayCD: '2026-09-10T08:15:00Z',
      ngayBD: '2026-09-10T08:30:00Z', // Bắt đầu lúc 8:30 (trùng với ca 1: 08:00 - 09:30) => Chạy đồng thời
      ngayKT: '2026-09-10T08:40:00Z', // 10 phút -> Outlier short (< 15p)
      timeMinutes: 10,
      tenKT: 'Chích áp xe cấp cứu',
      loaiPTTT: 'T2',
      soLuong: 1,
      ptChinh: 'Bs. Nguyễn Văn Minh',
      ptPhu: '',
      bsGM: 'Bs. Tuấn',
      ktvGM: '',
      tdc: 'ĐD Hoa',
      gv: '',
      type: 'MONTHLY',
      donGia: 500_000,
      thanhTien: 500_000,
    },
    {
      stt: 3,
      patientId: 'BN003',
      patientName: 'Lê Văn C',
      gender: 'Nam',
      yob: '1965',
      bhyt: 'DN4010123456787',
      ngayCD: '2026-09-10T11:00:00Z',
      ngayBD: '2026-09-10T19:00:00Z', // Ngoài giờ (19h)
      ngayKT: '2026-09-11T03:30:00Z', // 8.5 tiếng (510p) -> Outlier long (> 480p)
      timeMinutes: 510,
      tenKT: 'Phẫu thuật thay khớp háng nhân tạo',
      loaiPTTT: 'PĐB',
      soLuong: 1,
      ptChinh: 'Bs. Lê Hoàng Long',
      ptPhu: 'Bs. Dũng',
      bsGM: 'Bs. Hương',
      ktvGM: 'KTV Hùng',
      tdc: 'ĐD Thảo',
      gv: 'ĐD Cúc',
      type: 'MONTHLY',
      donGia: 15_000_000,
      thanhTien: 15_000_000,
    },
  ];

  it('calculates total cases and operating duration correctly', () => {
    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
      operatingDays: 20,
    });

    expect(result.totalCases).toBe(3);
    expect(result.totalOperatingMinutes).toBe(90 + 10 + 510);
    expect(result.periodLabel).toBe('Tháng 09/2026');
    expect(result.dataSource).toBe('MONTHLY');
  });

  it('categorizes scheduled vs emergency, in-hours vs out-of-hours correctly', () => {
    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
    });

    // Ca 2 có tên 'Chích áp xe cấp cứu'
    expect(result.emergencyCases).toBe(1);
    expect(result.scheduledCases).toBe(2);

    // Ca 3 diễn ra lúc 19:00 (ngoài giờ)
    expect(result.outHoursCases).toBeGreaterThanOrEqual(1);
  });

  it('computes hospital-wide capacity and peak concurrency using sweep line algorithm', () => {
    const testConfig: KpiConfig = {
      ...DEFAULT_KPI_CONFIG,
      totalOperatingRooms: 4,
      standardHoursPerDay: 8,
    };

    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: testConfig,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
      operatingDays: 10,
    });

    // 4 bàn * 10 ngày * 8 giờ * 60 phút = 19,200 phút
    expect(result.capacity.totalAvailableMinutes).toBe(19200);
    expect(result.capacity.totalOperatingRooms).toBe(4);
    expect(result.capacity.actualOperatingMinutes).toBe(610);
    expect(result.capacity.utilizationRate).toBeCloseTo((610 / 19200) * 100, 1);

    // Ca 1 (8:00 - 9:30) và Ca 2 (8:30 - 8:40) giao nhau lúc 8:30 -> Đỉnh điểm là 2 ca song song
    expect(result.capacity.peakConcurrentSurgeries).toBe(2);
    expect(result.dailyPeaks.length).toBeGreaterThanOrEqual(1);

    const peakDay = result.dailyPeaks[0];
    expect(peakDay.peakConcurrentTables).toBe(2);
    expect(peakDay.isOverCapacity).toBe(false); // 2 <= 4 bàn
  });

  it('populates 24 hourly load metrics correctly', () => {
    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
    });

    expect(result.hourlyLoads.length).toBe(24);
    // Khung 8h (8:00 - 9:00) có cả ca 1 và ca 2
    const hour8 = result.hourlyLoads[8];
    expect(hour8).toBeDefined();
    expect(hour8.activeSurgeries).toBeGreaterThanOrEqual(1);
    expect(hour8.operatingMinutes).toBeGreaterThan(0);
    expect(hour8.inHours).toBe(true);
  });

  it('detects short and long outliers accurately based on kpiConfig thresholds', () => {
    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
    });

    expect(result.alerts.length).toBe(2);
    const shortAlert = result.alerts.find(a => a.alertType === 'outlier_short');
    expect(shortAlert).toBeDefined();
    expect(shortAlert?.patientId).toBe('BN002');
    expect(shortAlert?.durationMinutes).toBe(10);

    const longAlert = result.alerts.find(a => a.alertType === 'outlier_long');
    expect(longAlert).toBeDefined();
    expect(longAlert?.patientId).toBe('BN003');
    expect(longAlert?.durationMinutes).toBe(510);
  });

  it('detects cost overrun alert when material cost exceeds threshold', () => {
    const costItems: SurgeryCostItem[] = [
      {
        maDichVu: 'KT001',
        tenDichVu: 'Phẫu thuật thay khớp háng nhân tạo',
        chiPhiThuoc: 20_000_000,
        chiPhiVtth: 40_000_000, // Tổng 60tr > ngưỡng 50tr
      },
    ];

    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      costItems,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
    });

    const costAlert = result.alerts.find(a => a.alertType === 'cost_overrun');
    expect(costAlert).toBeDefined();
    expect(costAlert?.patientId).toBe('BN003');
  });

  it('aggregates surgeon performance metric', () => {
    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
    });

    const surgeonMinh = result.surgeonPerformances.find(s => s.surgeonName === 'Bs. Nguyễn Văn Minh');
    expect(surgeonMinh).toBeDefined();
    expect(surgeonMinh?.totalCases).toBe(2);
    expect(surgeonMinh?.totalRevenue).toBe(3_500_000);
    expect(surgeonMinh?.totalMinutes).toBe(100);
  });
});
