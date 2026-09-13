// ─── Operating Room KPI & Analytics Types ─────────────────────────────────────
// Định nghĩa cấu hình và các chỉ số quản trị phòng mổ (OR KPI & Analytics)

export interface KpiConfig {
  /** Số giờ hoạt động tiêu chuẩn mỗi bàn mổ / ngày (mặc định 8h = 480 phút) */
  standardHoursPerDay: number;
  /** Số ngày làm việc tiêu chuẩn trong tháng (mặc định 22 ngày) */
  operatingDaysPerMonth: number;
  /** Thời gian chuyển giao ca mổ mục tiêu (Target Turnaround Time - phút, mặc định 25) */
  targetTurnaroundMinutes: number;
  /** Ngưỡng cảnh báo thời gian chuyển ca chậm (Warning TAT - phút, mặc định 40) */
  warningTurnaroundMinutes: number;
  /** Ngưỡng ca mổ quá ngắn (phút, mặc định 15) */
  minOutlierMinutes: number;
  /** Ngưỡng ca mổ kéo dài bất thường (phút, mặc định 360 = 6 giờ) */
  maxOutlierMinutes: number;
  /** Ngưỡng cảnh báo chi phí vượt trần (%, mặc định 100%) */
  costOverrunThresholdPct: number;
}

export const DEFAULT_KPI_CONFIG: KpiConfig = {
  standardHoursPerDay: 8,
  operatingDaysPerMonth: 22,
  targetTurnaroundMinutes: 25,
  warningTurnaroundMinutes: 40,
  minOutlierMinutes: 15,
  maxOutlierMinutes: 360,
  costOverrunThresholdPct: 100,
};

/** Công suất sử dụng theo từng bàn mổ / phòng mổ (OR Utilization) */
export interface RoomUtilizationMetric {
  roomKey: string;
  roomName: string;
  totalCases: number;
  totalMinutes: number;
  availableMinutes: number;
  utilizationRate: number; // % (0 - 100+)
  status: 'low' | 'optimal' | 'high' | 'overloaded';
}

/** Chỉ số thời gian chuyển giao ca mổ (Turnaround Time) */
export interface TurnaroundMetric {
  roomKey: string;
  roomName: string;
  avgTurnaroundMinutes: number;
  minTurnaroundMinutes: number;
  maxTurnaroundMinutes: number;
  totalTurnarounds: number;
  delayedCount: number; // Số lần vượt warningTurnaroundMinutes
}

/** Hiệu suất theo Phẫu thuật viên chính */
export interface SurgeonPerformanceMetric {
  surgeonName: string;
  totalCases: number;
  totalMinutes: number;
  avgDurationMinutes: number;
  overtimeCases: number;
  totalRevenue: number;
  topTechniques: string[];
}

/** Hiệu suất theo Kỹ thuật phẫu thuật */
export interface TechniqueKpiMetric {
  tenKT: string;
  loaiPTTT: string;
  maTuongDuong?: string;
  count: number;
  totalRevenue: number;
  avgDurationMinutes: number;
}

/** Ca mổ cảnh báo bất thường hoặc vượt chi phí */
export interface KpiAlertRecord {
  id: string;
  stt: number | string;
  patientId: string;
  patientName: string;
  ngayPT: string;
  tenKT: string;
  ptChinh: string;
  roomName: string;
  durationMinutes: number;
  alertType: 'outlier_short' | 'outlier_long' | 'cost_overrun' | 'turnaround_delay';
  severity: 'warning' | 'error';
  message: string;
}

/** Kết quả phân tích KPI phòng mổ hoàn chỉnh */
export interface OrAnalyticsResult {
  periodLabel: string;
  dataSource: 'AUTO' | 'MONTHLY' | 'DAILY';
  totalCases: number;
  totalOperatingMinutes: number;
  overallUtilizationRate: number;
  avgTurnaroundMinutes: number;
  
  // Cơ cấu ca mổ
  scheduledCases: number; // Mổ phiên
  emergencyCases: number; // Cấp cứu
  inHoursCases: number;   // Trong giờ
  outHoursCases: number;  // Ngoài giờ

  // Các danh sách phân tích
  roomUtilizations: RoomUtilizationMetric[];
  turnarounds: TurnaroundMetric[];
  surgeonPerformances: SurgeonPerformanceMetric[];
  topTechniques: TechniqueKpiMetric[];
  alerts: KpiAlertRecord[];
}
