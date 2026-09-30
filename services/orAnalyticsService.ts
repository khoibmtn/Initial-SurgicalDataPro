// ─── Operating Room Analytics Service ──────────────────────────────────────────
// Thuật toán phân tích phụ tải & công suất khối phòng mổ toàn viện (Macro OR Capacity & Concurrency)
// Hỗ trợ: Đỉnh điểm số bàn chạy đồng thời, Phụ tải theo 24 khung giờ, Năng suất PTV, và Cảnh báo lâm sàng

import * as XLSX from 'xlsx';
import {
  PersistedSurgeryRecord,
  SurgeryCostItem,
} from '../types';
import {
  KpiConfig,
  OrAnalyticsResult,
  HospitalCapacityMetric,
  HourlyLoadMetric,
  DailyPeakMetric,
  SurgeonPerformanceMetric,
  TechniqueKpiMetric,
  KpiAlertRecord,
} from '../types/kpi';

/**
 * Trích xuất ngày chuẩn hóa YYYY-MM-DD từ chuỗi ngày bất kỳ
 */
function toDateKey(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Lấy thứ trong tuần tiếng Việt
 */
function getDayOfWeekVN(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return days[d.getDay()] || '';
}

/**
 * Tính thời lượng ca mổ theo phút từ bản ghi
 */
function getDurationMinutes(r: PersistedSurgeryRecord): number {
  if (r.timeMinutes != null && !isNaN(Number(r.timeMinutes)) && Number(r.timeMinutes) > 0) {
    return Number(r.timeMinutes);
  }
  if (r.ngayBD && r.ngayKT) {
    const s = new Date(r.ngayBD).getTime();
    const e = new Date(r.ngayKT).getTime();
    if (!isNaN(s) && !isNaN(e)) {
      return Math.round((e - s) / (1000 * 60));
    }
  }
  return 0;
}

/**
 * Parse Date an toàn
 */
function parseSafeDate(dateVal?: string | Date | null): Date | null {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Phân tích dữ liệu ca mổ và tính toán toàn bộ chỉ số KPI Quản trị phòng mổ cấp bệnh viện
 */
export function calculateOrAnalytics(params: {
  records: PersistedSurgeryRecord[];
  kpiConfig: KpiConfig;
  costItems?: SurgeryCostItem[];
  periodLabel: string;
  dataSource: 'AUTO' | 'MONTHLY' | 'DAILY';
  operatingDays?: number;
}): OrAnalyticsResult {
  const {
    records,
    kpiConfig,
    costItems = [],
    periodLabel,
    dataSource,
    operatingDays = kpiConfig.operatingDaysPerMonth || 22,
  } = params;

  const totalCases = records.length;
  let totalOperatingMinutes = 0;
  let scheduledCases = 0;
  let emergencyCases = 0;
  let inHoursCases = 0;
  let outHoursCases = 0;

  // 1. Phân nhóm theo ngày để quét số ca mổ song song (Concurrency Sweep Line)
  const dayRecordsMap = new Map<string, { start: number; end: number; rec: PersistedSurgeryRecord }[]>();

  // 2. Phân nhóm theo Phẫu thuật viên chính
  const surgeonMap = new Map<string, { records: PersistedSurgeryRecord[]; totalRev: number; overtimeCount: number; emergencyCount: number }>();

  // 3. Phân nhóm theo Kỹ thuật
  const techniqueMap = new Map<string, { records: PersistedSurgeryRecord[]; totalRev: number }>();

  // 4. Danh sách cảnh báo
  const alerts: KpiAlertRecord[] = [];

  // Tạo map chi phí theo tenKT hoặc maTuongDuong
  const costMap = new Map<string, number>();
  for (const c of costItems) {
    const totalC = (c.chiPhiThuoc || 0) + (c.chiPhiVtth || 0);
    if (c.maTuongDuong) costMap.set(c.maTuongDuong.trim(), totalC);
    if (c.tenDichVu) costMap.set(c.tenDichVu.trim().toLowerCase(), totalC);
  }

  // Khởi tạo 24 khung giờ
  const hourMinutes = Array(24).fill(0);
  const hourActiveCases = Array(24).fill(0);
  const hourMaxConcurrent = Array(24).fill(0);

  for (const r of records) {
    const dur = getDurationMinutes(r);
    totalOperatingMinutes += Math.max(0, dur);

    // Phân loại mổ cấp cứu vs mổ phiên
    const tenKTLower = (r.tenKT || '').toLowerCase();
    const isEmergency = tenKTLower.includes('cấp cứu') || tenKTLower.includes('cap cuu');
    if (isEmergency) {
      emergencyCases++;
    } else {
      scheduledCases++;
    }

    // Phân loại trong giờ vs ngoài giờ
    let isOutHours = false;
    const startDate = parseSafeDate(r.ngayBD);
    const endDate = parseSafeDate(r.ngayKT);

    if (startDate) {
      const dayOfWeek = startDate.getDay(); // 0 = Chủ Nhật, 6 = Thứ 7
      const hour = startDate.getHours();
      const minute = startDate.getMinutes();
      const timeVal = hour * 60 + minute;
      // Chuẩn hành chính: 7h30 (450p) -> 17h00 (1020p), trừ thứ 7/CN
      if (dayOfWeek === 0 || dayOfWeek === 6 || timeVal < 450 || timeVal >= 1020) {
        isOutHours = true;
      }

      // Thêm vào dayRecordsMap để phân tích phụ tải đồng thời
      const dateKey = toDateKey(startDate);
      if (dateKey && endDate && endDate.getTime() >= startDate.getTime()) {
        if (!dayRecordsMap.has(dateKey)) {
          dayRecordsMap.set(dateKey, []);
        }
        dayRecordsMap.get(dateKey)!.push({
          start: startDate.getTime(),
          end: endDate.getTime(),
          rec: r,
        });

        // Phân bổ phút mổ vào 24 khung giờ trong ngày
        let cur = new Date(startDate.getTime());
        const endT = endDate.getTime();
        while (cur.getTime() < endT) {
          const h = cur.getHours();
          hourActiveCases[h]++;

          // Tính số phút nằm trong khung giờ h
          const nextHour = new Date(cur);
          nextHour.setHours(h + 1, 0, 0, 0);
          const segmentEnd = Math.min(endT, nextHour.getTime());
          const segmentMinutes = Math.max(0, Math.round((segmentEnd - cur.getTime()) / 60000));
          hourMinutes[h] += segmentMinutes;

          cur = new Date(segmentEnd);
        }
      }
    }

    if (isOutHours) {
      outHoursCases++;
    } else {
      inHoursCases++;
    }

    // Phân nhóm PTV
    const ptChinh = (r.ptChinh || 'Chưa gán PTV').trim();
    if (!surgeonMap.has(ptChinh)) {
      surgeonMap.set(ptChinh, { records: [], totalRev: 0, overtimeCount: 0, emergencyCount: 0 });
    }
    const sEntry = surgeonMap.get(ptChinh)!;
    sEntry.records.push(r);
    const rev = Number(r.thanhTien) || (Number(r.donGia || 0) * Number(r.soLuong || 1));
    sEntry.totalRev += rev;
    if (isOutHours) sEntry.overtimeCount++;
    if (isEmergency) sEntry.emergencyCount++;

    // Phân nhóm Kỹ thuật
    const tenKT = (r.tenKT || 'Chưa rõ tên').trim();
    if (!techniqueMap.has(tenKT)) {
      techniqueMap.set(tenKT, { records: [], totalRev: 0 });
    }
    const tEntry = techniqueMap.get(tenKT)!;
    tEntry.records.push(r);
    tEntry.totalRev += rev;

    // Kiểm tra cảnh báo bất thường
    if (dur < 0) {
      alerts.push({
        id: r.id || `${r.patientId}_${r.stt}_negative`,
        stt: r.stt || '#',
        patientId: r.patientId || '',
        patientName: r.patientName || '',
        ngayPT: toDateKey(startDate),
        tenKT: r.tenKT || '',
        ptChinh: ptChinh,
        durationMinutes: dur,
        alertType: 'negative_time',
        severity: 'error',
        message: `Thời gian mổ âm (${dur} phút). Giờ bắt đầu sau giờ kết thúc. Cần kiểm tra lại dữ liệu.`,
      });
    } else if (dur > 0 && dur < kpiConfig.minOutlierMinutes) {
      alerts.push({
        id: r.id || `${r.patientId}_${r.stt}_short`,
        stt: r.stt || '#',
        patientId: r.patientId || '',
        patientName: r.patientName || '',
        ngayPT: toDateKey(startDate),
        tenKT: r.tenKT || '',
        ptChinh: ptChinh,
        durationMinutes: dur,
        alertType: 'outlier_short',
        severity: 'warning',
        message: `Thời gian mổ chỉ ${dur} phút (ngưỡng tối thiểu chuẩn: ${kpiConfig.minOutlierMinutes} phút). Cần đối soát hồ sơ.`,
      });
    } else if (dur > kpiConfig.maxOutlierMinutes) {
      alerts.push({
        id: r.id || `${r.patientId}_${r.stt}_long`,
        stt: r.stt || '#',
        patientId: r.patientId || '',
        patientName: r.patientName || '',
        ngayPT: toDateKey(startDate),
        tenKT: r.tenKT || '',
        ptChinh: ptChinh,
        durationMinutes: dur,
        alertType: 'outlier_long',
        severity: 'warning',
        message: `Thời gian mổ kéo dài ${dur} phút (${(dur / 60).toFixed(1)} giờ, vượt ngưỡng cảnh báo: ${kpiConfig.maxOutlierMinutes} phút).`,
      });
    }

    // Kiểm tra chi phí vật tư vượt định mức
    const expectedCost = costMap.get(r.maTuongDuong?.trim() || '') || costMap.get(r.tenKT?.trim().toLowerCase() || '') || 0;
    if (expectedCost > (kpiConfig.costOverrunThresholdAmount || 50000000)) {
      alerts.push({
        id: r.id || `${r.patientId}_${r.stt}_cost`,
        stt: r.stt || '#',
        patientId: r.patientId || '',
        patientName: r.patientName || '',
        ngayPT: toDateKey(startDate),
        tenKT: r.tenKT || '',
        ptChinh: ptChinh,
        durationMinutes: dur,
        alertType: 'cost_overrun',
        severity: 'warning',
        message: `Chi phí thuốc & VTTH định mức ước tính ${expectedCost.toLocaleString('vi-VN')} đ, vượt ngưỡng kiểm soát ${kpiConfig.costOverrunThresholdAmount.toLocaleString('vi-VN')} đ.`,
      });
    }
  }

  // --- Tính toán phụ tải đồng thời (Sweep Line Algorithm) ---
  let peakConcurrentSurgeries = 0;
  let overallPeakDate = '';
  let overallPeakTime = '';
  const dailyPeaks: DailyPeakMetric[] = [];

  const totalRooms = kpiConfig.totalOperatingRooms || 6;

  // Duyệt qua từng ngày để tìm đỉnh điểm đồng thời
  const sortedDates = Array.from(dayRecordsMap.keys()).sort();
  for (const dateKey of sortedDates) {
    const intervals = dayRecordsMap.get(dateKey)!;
    const events: { time: number; delta: number }[] = [];

    for (const item of intervals) {
      events.push({ time: item.start, delta: +1 });
      events.push({ time: item.end, delta: -1 });
    }

    // Sắp xếp sự kiện theo thời gian tăng dần, nếu bằng nhau thì -1 (kết thúc) đứng trước +1 (bắt đầu)
    events.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      return a.delta - b.delta;
    });

    let currentConcurrent = 0;
    let dayPeak = 0;
    let dayPeakTime = '';
    let dayTotalMinutes = 0;

    for (const item of intervals) {
      dayTotalMinutes += Math.round((item.end - item.start) / 60000);
    }

    for (const ev of events) {
      currentConcurrent += ev.delta;
      if (currentConcurrent > dayPeak) {
        dayPeak = currentConcurrent;
        const evDate = new Date(ev.time);
        dayPeakTime = `${String(evDate.getHours()).padStart(2, '0')}:${String(evDate.getMinutes()).padStart(2, '0')}`;
      }

      // Cập nhật max concurrent cho từng khung giờ
      const h = new Date(ev.time).getHours();
      if (currentConcurrent > hourMaxConcurrent[h]) {
        hourMaxConcurrent[h] = currentConcurrent;
      }
    }

    if (dayPeak > peakConcurrentSurgeries) {
      peakConcurrentSurgeries = dayPeak;
      overallPeakDate = dateKey;
      overallPeakTime = dayPeakTime;
    }

    dailyPeaks.push({
      date: dateKey,
      dayOfWeek: getDayOfWeekVN(dateKey),
      totalCases: intervals.length,
      totalMinutes: dayTotalMinutes,
      peakConcurrentTables: dayPeak,
      peakTime: dayPeakTime,
      isOverCapacity: dayPeak > totalRooms,
    });
  }

  // --- Tính toán Công suất sử dụng khối phòng mổ toàn viện ---
  const standardHours = kpiConfig.standardHoursPerDay || 8;
  const totalAvailableMinutes = totalRooms * operatingDays * standardHours * 60;
  const utilizationRate = totalAvailableMinutes > 0
    ? Math.round((totalOperatingMinutes / totalAvailableMinutes) * 1000) / 10
    : 0;

  let capacityStatus: 'low' | 'optimal' | 'high' | 'overloaded' = 'optimal';
  if (utilizationRate < 50) capacityStatus = 'low';
  else if (utilizationRate <= 85) capacityStatus = 'optimal';
  else if (utilizationRate <= 100) capacityStatus = 'high';
  else capacityStatus = 'overloaded';

  const capacityMetric: HospitalCapacityMetric = {
    totalOperatingRooms: totalRooms,
    standardHoursPerDay: standardHours,
    operatingDays: operatingDays,
    totalAvailableMinutes,
    actualOperatingMinutes: totalOperatingMinutes,
    utilizationRate,
    status: capacityStatus,
    peakConcurrentSurgeries,
    peakDate: overallPeakDate,
    peakTime: overallPeakTime,
  };

  // --- Xây dựng mảng 24 khung giờ ---
  const maxHourMinutes = Math.max(...hourMinutes, 1);
  const hourlyLoads: HourlyLoadMetric[] = [];
  for (let h = 0; h < 24; h++) {
    const nextH = (h + 1) % 24;
    const label = `${String(h).padStart(2, '0')}:00 - ${String(nextH).padStart(2, '0')}:00`;
    const isPeak = hourMinutes[h] >= maxHourMinutes * 0.75 && hourMinutes[h] > 0;
    const inHours = h >= 7 && h < 17;

    hourlyLoads.push({
      hour: h,
      hourLabel: label,
      activeSurgeries: hourActiveCases[h],
      operatingMinutes: hourMinutes[h],
      maxConcurrentTables: hourMaxConcurrent[h],
      isPeak,
      inHours,
    });
  }

  // --- Năng suất Phẫu thuật viên ---
  const surgeonPerformances: SurgeonPerformanceMetric[] = [];
  for (const [surgeonName, data] of surgeonMap.entries()) {
    const sCases = data.records.length;
    let sMinutes = 0;
    const techCountMap = new Map<string, number>();

    for (const r of data.records) {
      sMinutes += getDurationMinutes(r);
      const tName = r.tenKT?.trim();
      if (tName) techCountMap.set(tName, (techCountMap.get(tName) || 0) + 1);
    }

    const topTechniques = Array.from(techCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);

    surgeonPerformances.push({
      surgeonName,
      totalCases: sCases,
      totalMinutes: sMinutes,
      avgDurationMinutes: sCases > 0 ? Math.round(sMinutes / sCases) : 0,
      overtimeCases: data.overtimeCount,
      emergencyCases: data.emergencyCount,
      totalRevenue: data.totalRev,
      topTechniques,
    });
  }
  surgeonPerformances.sort((a, b) => b.totalCases - a.totalCases);

  // --- Top Kỹ thuật ---
  const topTechniques: TechniqueKpiMetric[] = [];
  for (const [tenKT, data] of techniqueMap.entries()) {
    const count = data.records.length;
    let techMinutes = 0;
    const loaiPTTT = data.records[0]?.loaiPTTT || '';
    const maTuongDuong = data.records[0]?.maTuongDuong;

    for (const r of data.records) {
      techMinutes += getDurationMinutes(r);
    }

    topTechniques.push({
      tenKT,
      loaiPTTT,
      maTuongDuong,
      count,
      totalRevenue: data.totalRev,
      avgDurationMinutes: count > 0 ? Math.round(techMinutes / count) : 0,
    });
  }
  topTechniques.sort((a, b) => b.count - a.count);

  return {
    periodLabel,
    dataSource,
    totalCases,
    totalOperatingMinutes,
    capacity: capacityMetric,
    hourlyLoads,
    dailyPeaks,
    scheduledCases,
    emergencyCases,
    inHoursCases,
    outHoursCases,
    surgeonPerformances,
    topTechniques: topTechniques.slice(0, 20),
    alerts,
  };
}

/**
 * Xuất dữ liệu KPI Quản trị phòng mổ ra file Excel đa sheets chuyên nghiệp
 */
export function exportOrAnalyticsToExcel(result: OrAnalyticsResult): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng quan Năng lực khối Phòng mổ
  const summaryRows = [
    ['BÁO CÁO QUẢN TRỊ NĂNG LỰC & PHỤ TẢI KHỐI PHÒNG MỔ'],
    ['Thời kỳ:', result.periodLabel],
    ['Nguồn số liệu:', result.dataSource === 'AUTO' ? 'Tự động' : (result.dataSource === 'MONTHLY' ? 'Báo cáo tháng' : 'Báo cáo hàng ngày')],
    ['Ngày xuất báo cáo:', new Date().toLocaleString('vi-VN')],
    [],
    ['CHỈ SỐ', 'GIÁ TRỊ', 'ĐƠN VỊ', 'GHI CHÚ / TIÊU CHUẨN'],
    ['Quy mô bàn mổ của viện', result.capacity.totalOperatingRooms, 'Bàn', 'Số bàn mổ hoạt động thực tế'],
    ['Số ngày làm việc trong kỳ', result.capacity.operatingDays, 'Ngày', 'Tiêu chuẩn tháng'],
    ['Số giờ hoạt động chuẩn / ngày', result.capacity.standardHoursPerDay, 'Giờ', 'Giờ hành chính tiêu chuẩn'],
    ['Tổng thời gian mổ khả dụng', Math.round(result.capacity.totalAvailableMinutes / 60), 'Giờ', `${result.capacity.totalAvailableMinutes.toLocaleString('vi-VN')} phút`],
    ['Tổng thời gian mổ thực tế', Math.round(result.totalOperatingMinutes / 60), 'Giờ', `${result.totalOperatingMinutes.toLocaleString('vi-VN')} phút`],
    ['Tỷ lệ công suất sử dụng (OR Utilization)', `${result.capacity.utilizationRate}%`, '%', result.capacity.utilizationRate >= 85 ? 'Công suất cao' : result.capacity.utilizationRate >= 60 ? 'Tối ưu' : 'Thấp'],
    ['Số bàn hoạt động đỉnh điểm (Peak Concurrency)', result.capacity.peakConcurrentSurgeries, 'Bàn cùng lúc', `Thời điểm: ${result.capacity.peakTime || '-'} ngày ${result.capacity.peakDate || '-'}`],
    ['Tổng số ca phẫu thuật', result.totalCases, 'Ca', ''],
    ['Ca mổ phiên', result.scheduledCases, 'Ca', `${result.totalCases > 0 ? Math.round((result.scheduledCases / result.totalCases) * 100) : 0}%`],
    ['Ca mổ cấp cứu', result.emergencyCases, 'Ca', `${result.totalCases > 0 ? Math.round((result.emergencyCases / result.totalCases) * 100) : 0}%`],
    ['Ca trong giờ hành chính', result.inHoursCases, 'Ca', `${result.totalCases > 0 ? Math.round((result.inHoursCases / result.totalCases) * 100) : 0}%`],
    ['Ca ngoài giờ hành chính', result.outHoursCases, 'Ca', `${result.totalCases > 0 ? Math.round((result.outHoursCases / result.totalCases) * 100) : 0}%`],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng quan Năng lực OR');

  // Sheet 2: Phụ tải theo 24 khung giờ
  const hourlyHeader = ['Khung giờ', 'Số ca diễn ra', 'Tổng phút mổ', 'Bàn chạy đồng thời tối đa', 'Loại khung giờ', 'Đánh giá phụ tải'];
  const hourlyRows = result.hourlyLoads.map(h => [
    h.hourLabel,
    h.activeSurgeries,
    h.operatingMinutes,
    h.maxConcurrentTables,
    h.inHours ? 'Trong giờ hành chính' : 'Ngoài giờ / Trực',
    h.isPeak ? 'CAO ĐIỂM' : 'Bình thường',
  ]);
  const wsHourly = XLSX.utils.aoa_to_sheet([hourlyHeader, ...hourlyRows]);
  XLSX.utils.book_append_sheet(wb, wsHourly, 'Phụ tải 24h');

  // Sheet 3: Đỉnh điểm theo từng ngày
  const dailyHeader = ['Ngày mổ', 'Thứ', 'Số ca mổ', 'Tổng phút mổ', 'Số bàn mổ chạy đỉnh điểm', 'Thời điểm đạt đỉnh', 'Tình trạng tải'];
  const dailyRows = result.dailyPeaks.map(d => [
    d.date,
    d.dayOfWeek,
    d.totalCases,
    d.totalMinutes,
    d.peakConcurrentTables,
    d.peakTime,
    d.isOverCapacity ? `VƯỢT ĐỊNH MỨC (${d.peakConcurrentTables} > ${result.capacity.totalOperatingRooms} bàn)` : 'Trong định mức',
  ]);
  const wsDaily = XLSX.utils.aoa_to_sheet([dailyHeader, ...dailyRows]);
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Phụ tải theo ngày');

  // Sheet 4: Phẫu thuật viên
  const surgeonHeader = ['STT', 'Phẫu thuật viên chính', 'Tổng số ca', 'Tổng phút mổ', 'Thời gian TB/ca (phút)', 'Ca ngoài giờ', 'Ca cấp cứu', 'Doanh thu (VNĐ)', 'Top kỹ thuật'];
  const surgeonRows = result.surgeonPerformances.map((s, idx) => [
    idx + 1,
    s.surgeonName,
    s.totalCases,
    s.totalMinutes,
    s.avgDurationMinutes,
    s.overtimeCases,
    s.emergencyCases,
    s.totalRevenue,
    s.topTechniques.join('; '),
  ]);
  const wsSurgeons = XLSX.utils.aoa_to_sheet([surgeonHeader, ...surgeonRows]);
  XLSX.utils.book_append_sheet(wb, wsSurgeons, 'Phẫu thuật viên');

  // Sheet 5: Top kỹ thuật
  const techHeader = ['STT', 'Tên kỹ thuật phẫu thuật', 'Loại PTTT', 'Mã tương đương', 'Số ca', 'Thời gian TB (phút)', 'Tổng doanh thu (VNĐ)'];
  const techRows = result.topTechniques.map((t, idx) => [
    idx + 1,
    t.tenKT,
    t.loaiPTTT,
    t.maTuongDuong || '',
    t.count,
    t.avgDurationMinutes,
    t.totalRevenue,
  ]);
  const wsTechniques = XLSX.utils.aoa_to_sheet([techHeader, ...techRows]);
  XLSX.utils.book_append_sheet(wb, wsTechniques, 'Top kỹ thuật');

  // Sheet 6: Cảnh báo bất thường
  const alertHeader = ['STT', 'Mã BN', 'Họ và tên', 'Ngày mổ', 'Tên kỹ thuật', 'PTV chính', 'Thời lượng (phút)', 'Loại cảnh báo', 'Mức độ', 'Nội dung chi tiết'];
  const alertRows = result.alerts.map((a, idx) => [
    idx + 1,
    a.patientId,
    a.patientName,
    a.ngayPT,
    a.tenKT,
    a.ptChinh,
    a.durationMinutes,
    a.alertType === 'negative_time' ? 'Thời gian âm' : (a.alertType === 'outlier_short' ? 'Ca quá ngắn' : (a.alertType === 'outlier_long' ? 'Ca quá dài' : 'Bội chi chi phí')),
    a.severity === 'error' ? 'Nghiêm trọng' : 'Cảnh báo',
    a.message,
  ]);
  const wsAlerts = XLSX.utils.aoa_to_sheet([alertHeader, ...alertRows]);
  XLSX.utils.book_append_sheet(wb, wsAlerts, 'Cảnh báo bất thường');

  const safeLabel = result.periodLabel.replace(/[/\\?%*:|"<>]/g, '_');
  XLSX.writeFile(wb, `Bao_cao_KPI_Quan_tri_phong_mo_${safeLabel}.xlsx`);
}
