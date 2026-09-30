// ─── Operating Room KPI & Analytics Types ─────────────────────────────────────
// Định nghĩa cấu hình và các chỉ số quản trị phòng mổ cấp Bệnh viện (Macro OR Capacity & Concurrency)

export interface KpiConfig {
  /** Tổng số bàn mổ / phòng mổ hoạt động thực tế của bệnh viện (mặc định 6 bàn) */
  totalOperatingRooms: number;
  /** Số giờ mổ tiêu chuẩn mỗi bàn mổ / ngày trong giờ hành chính (mặc định 8h = 480 phút) */
  standardHoursPerDay: number;
  /** Số ngày làm việc tiêu chuẩn trong tháng (mặc định 22 ngày) */
  operatingDaysPerMonth: number;
  /** Ngưỡng ca mổ quá ngắn (phút, mặc định 15) */
  minOutlierMinutes: number;
  /** Ngưỡng ca mổ kéo dài bất thường (phút, mặc định 480 = 8 giờ) */
  maxOutlierMinutes: number;
  /** Ngưỡng chi phí vật tư / thuốc vượt định mức báo động (VNĐ, mặc định 50,000,000 đ) */
  costOverrunThresholdAmount: number;
}

export const DEFAULT_KPI_CONFIG: KpiConfig = {
  totalOperatingRooms: 6,
  standardHoursPerDay: 8,
  operatingDaysPerMonth: 22,
  minOutlierMinutes: 15,
  maxOutlierMinutes: 480,
  costOverrunThresholdAmount: 50000000,
};

/** Công suất sử dụng khối phòng mổ toàn viện */
export interface HospitalCapacityMetric {
  totalOperatingRooms: number;   // Số bàn mổ danh định của viện
  standardHoursPerDay: number;   // Giờ chuẩn/ngày
  operatingDays: number;         // Số ngày làm việc
  totalAvailableMinutes: number; // totalOperatingRooms * operatingDays * standardHoursPerDay * 60
  actualOperatingMinutes: number;
  utilizationRate: number;       // %
  status: 'low' | 'optimal' | 'high' | 'overloaded';
  peakConcurrentSurgeries: number; // Đỉnh điểm số ca mổ diễn ra đồng thời
  peakDate?: string;             // Ngày đạt đỉnh phụ tải
  peakTime?: string;             // Khung giờ đạt đỉnh phụ tải
}

/** Phân bố phụ tải phẫu thuật theo 24 khung giờ trong ngày */
export interface HourlyLoadMetric {
  hour: number;                 // 0..23
  hourLabel: string;            // "08:00 - 09:00"
  activeSurgeries: number;      // Số ca mổ diễn ra trong khung giờ này
  operatingMinutes: number;     // Tổng số phút mổ tích lũy trong khung giờ
  maxConcurrentTables: number;  // Số bàn mổ hoạt động đồng thời tối đa trong khung giờ
  isPeak: boolean;              // Có phải khung giờ cao điểm hay không
  inHours: boolean;             // Khung giờ hành chính hay ngoài giờ
}

/** Thống kê đỉnh điểm tải theo từng ngày phẫu thuật */
export interface DailyPeakMetric {
  date: string;                 // YYYY-MM-DD
  dayOfWeek: string;            // Thứ Hai, Thứ Ba...
  totalCases: number;
  totalMinutes: number;
  peakConcurrentTables: number; // Đỉnh điểm số ca mổ song song trong ngày
  peakTime: string;             // Thời điểm đạt đỉnh (VD: "10:15")
  isOverCapacity: boolean;      // True nếu peakConcurrentTables > totalOperatingRooms
}

/** Hiệu suất theo Phẫu thuật viên chính */
export interface SurgeonPerformanceMetric {
  surgeonName: string;
  totalCases: number;
  totalMinutes: number;
  avgDurationMinutes: number;
  overtimeCases: number;
  emergencyCases: number;
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
  durationMinutes: number;
  alertType: 'outlier_short' | 'outlier_long' | 'cost_overrun' | 'negative_time';
  severity: 'warning' | 'error';
  message: string;
}

/** Kết quả phân tích KPI phòng mổ hoàn chỉnh */
export interface OrAnalyticsResult {
  periodLabel: string;
  dataSource: 'AUTO' | 'MONTHLY' | 'DAILY';
  totalCases: number;
  totalOperatingMinutes: number;

  // 1. Năng lực & Công suất khối phòng mổ toàn viện
  capacity: HospitalCapacityMetric;

  // 2. Phân tích phụ tải & đồng thời
  hourlyLoads: HourlyLoadMetric[];
  dailyPeaks: DailyPeakMetric[];

  // 3. Cơ cấu ca mổ
  scheduledCases: number; // Mổ phiên
  emergencyCases: number; // Cấp cứu
  inHoursCases: number;   // Trong giờ
  outHoursCases: number;  // Ngoài giờ

  // 4. Phân tích nhân sự & chuyên môn
  surgeonPerformances: SurgeonPerformanceMetric[];
  topTechniques: TechniqueKpiMetric[];
  alerts: KpiAlertRecord[];
}
