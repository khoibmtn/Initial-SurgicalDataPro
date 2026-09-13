import { describe, it, expect } from 'vitest';
import { calculateOrAnalytics } from '../services/orAnalyticsService';
import { DEFAULT_KPI_CONFIG } from '../types/kpi';
import { PersistedSurgeryRecord } from '../types';

describe('OR Analytics & KPI Service (Lựa chọn 2)', () => {
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
      machine: 'Bàn mổ 01',
      machineCode: 'BM01',
      machineId: 'm1',
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
      ngayCD: '2026-09-10T08:30:00Z',
      ngayBD: '2026-09-10T10:00:00Z', // 30 phút sau ca 1 kết thúc (TAT = 30 phút)
      ngayKT: '2026-09-10T10:10:00Z', // 10 phút -> Outlier short (< 15p)
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
      machine: 'Bàn mổ 01',
      machineCode: 'BM01',
      machineId: 'm1',
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
      ngayKT: '2026-09-11T02:00:00Z', // 7 tiếng (420p) -> Outlier long (> 360p)
      timeMinutes: 420,
      tenKT: 'Phẫu thuật thay khớp háng nhân tạo',
      loaiPTTT: 'PĐB',
      soLuong: 1,
      ptChinh: 'Bs. Lê Hoàng Long',
      ptPhu: 'Bs. Dũng',
      bsGM: 'Bs. Hương',
      ktvGM: 'KTV Hùng',
      tdc: 'ĐD Thảo',
      gv: 'ĐD Cúc',
      machine: 'Bàn mổ 02',
      machineCode: 'BM02',
      machineId: 'm2',
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
    expect(result.totalOperatingMinutes).toBe(90 + 10 + 420);
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

  it('computes room utilization and turnaround times for consecutive cases on same table', () => {
    const result = calculateOrAnalytics({
      records: mockRecords,
      kpiConfig: DEFAULT_KPI_CONFIG,
      periodLabel: 'Tháng 09/2026',
      dataSource: 'MONTHLY',
      operatingDays: 20,
    });

    expect(result.roomUtilizations.length).toBe(2); // BM01 và BM02
    const bm01 = result.roomUtilizations.find(r => r.roomKey === 'BM01');
    expect(bm01).toBeDefined();
    expect(bm01?.totalCases).toBe(2);
    expect(bm01?.totalMinutes).toBe(100);

    // TAT giữa ca 1 (KT: 9:30) và ca 2 (BD: 10:00) trên BM01 = 30 phút
    const tatBm01 = result.turnarounds.find(t => t.roomKey === 'BM01');
    expect(tatBm01).toBeDefined();
    expect(tatBm01?.totalTurnarounds).toBe(1);
    expect(tatBm01?.avgTurnaroundMinutes).toBe(30);
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
    expect(longAlert?.durationMinutes).toBe(420);
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
