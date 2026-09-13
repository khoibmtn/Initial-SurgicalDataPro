// ─── Operating Room Analytics Service ──────────────────────────────────────────
// Thuật toán phân tích chỉ số KPI phòng mổ (OR Utilization, Turnaround Time,
// Phân bố nhân sự, Cảnh báo bất thường, và Xuất báo cáo Excel)

import * as XLSX from 'xlsx';
import {
  PersistedSurgeryRecord,
  SurgeryCostItem,
} from '../types';
import {
  KpiConfig,
  OrAnalyticsResult,
  RoomUtilizationMetric,
  TurnaroundMetric,
  SurgeonPerformanceMetric,
  TechniqueKpiMetric,
  KpiAlertRecord,
} from '../types/kpi';

/**
 * Trích xuất ngày chuẩn hóa YYYY-MM-DD từ chuỗi ngày bất kỳ
 */
function toDateKey(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    if (!isNaN(s) && !isNaN(e) && e > s) {
      return Math.round((e - s) / (1000 * 60));
    }
  }
  return 0;
}

/**
 * Phân tích dữ liệu ca mổ và tính toán toàn bộ chỉ số KPI Quản trị phòng mổ
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
    operatingDays = kpiConfig.operatingDaysPerMonth,
  } = params;

  const totalCases = records.length;
  let totalOperatingMinutes = 0;
  let scheduledCases = 0;
  let emergencyCases = 0;
  let inHoursCases = 0;
  let outHoursCases = 0;

  // 1. Phân nhóm theo phòng mổ / bàn mổ (Machine)
  const roomCasesMap = new Map<string, PersistedSurgeryRecord[]>();
  // 2. Phân nhóm theo Phẫu thuật viên chính
  const surgeonMap = new Map<string, PersistedSurgeryRecord[]>();
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

  for (const r of records) {
    const dur = getDurationMinutes(r);
    totalOperatingMinutes += dur;

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
    if (r.ngayBD) {
      const d = new Date(r.ngayBD);
      if (!isNaN(d.getTime())) {
        const dayOfWeek = d.getDay(); // 0 = Chủ Nhật, 6 = Thứ 7
        const hour = d.getHours();
        const minute = d.getMinutes();
        const timeVal = hour * 60 + minute;
        // Chuẩn hành chính: 7h30 (450p) -> 17h00 (1020p), trừ thứ 7/CN
        if (dayOfWeek === 0 || dayOfWeek === 6 || timeVal < 450 || timeVal >= 1020) {
          isOutHours = true;
        }
      }
    }
    if (isOutHours) {
      outHoursCases++;
    } else {
      inHoursCases++;
    }

    // Phân nhóm phòng mổ
    const roomKey = (r.machineCode || r.machineId || r.machine || 'Bàn chưa định danh').trim();
    if (!roomCasesMap.has(roomKey)) roomCasesMap.set(roomKey, []);
    roomCasesMap.get(roomKey)!.push(r);

    // Phân nhóm PTV
    const ptChinh = (r.ptChinh || 'Chưa gán PTV').trim();
    if (!surgeonMap.has(ptChinh)) surgeonMap.set(ptChinh, []);
    surgeonMap.get(ptChinh)!.push(r);

    // Phân nhóm Kỹ thuật
    const tenKT = (r.tenKT || 'Chưa rõ tên').trim();
    const rev = Number(r.thanhTien) || (Number(r.donGia || 0) * Number(r.soLuong || 1));
    if (!techniqueMap.has(tenKT)) {
      techniqueMap.set(tenKT, { records: [], totalRev: 0 });
    }
    const tEntry = techniqueMap.get(tenKT)!;
    tEntry.records.push(r);
    tEntry.totalRev += rev;

    // Kiểm tra Outliers
    if (dur > 0 && dur < kpiConfig.minOutlierMinutes) {
      alerts.push({
        id: r.id || `${r.patientId}_${r.stt}_short`,
        stt: r.stt || '#',
        patientId: r.patientId || '',
        patientName: r.patientName || '',
        ngayPT: toDateKey(r.ngayBD),
        tenKT: r.tenKT || '',
        ptChinh: r.ptChinh || '',
        roomName: roomKey,
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
        ngayPT: toDateKey(r.ngayBD),
        tenKT: r.tenKT || '',
        ptChinh: r.ptChinh || '',
        roomName: roomKey,
        durationMinutes: dur,
        alertType: 'outlier_long',
        severity: 'error',
        message: `Thời gian mổ kéo dài ${Math.round(dur / 60)} giờ (${dur} phút), vượt trần cảnh báo ${kpiConfig.maxOutlierMinutes} phút.`,
      });
    }

    // Kiểm tra bội chi
    const costExpected = costMap.get(r.maTuongDuong?.trim() || '') || costMap.get(tenKTLower);
    if (costExpected && rev > 0) {
      const overrunThreshold = rev * (kpiConfig.costOverrunThresholdPct / 100);
      if (costExpected > overrunThreshold) {
        alerts.push({
          id: r.id || `${r.patientId}_${r.stt}_cost`,
          stt: r.stt || '#',
          patientId: r.patientId || '',
          patientName: r.patientName || '',
          ngayPT: toDateKey(r.ngayBD),
          tenKT: r.tenKT || '',
          ptChinh: r.ptChinh || '',
          roomName: roomKey,
          durationMinutes: dur,
          alertType: 'cost_overrun',
          severity: 'warning',
          message: `Chi phí thuốc & VTTH (${costExpected.toLocaleString('vi-VN')} ₫) vượt mức trần ${kpiConfig.costOverrunThresholdPct}% của giá thu (${rev.toLocaleString('vi-VN')} ₫).`,
        });
      }
    }
  }

  // --- 2. Tính công suất bàn mổ (OR Utilization) & Turnaround Time (TAT) ---
  const roomUtilizations: RoomUtilizationMetric[] = [];
  const turnarounds: TurnaroundMetric[] = [];
  let totalTatSum = 0;
  let totalTatCount = 0;

  const standardMinutesPerRoom = operatingDays * kpiConfig.standardHoursPerDay * 60;

  for (const [roomKey, cList] of roomCasesMap.entries()) {
    let roomMins = 0;
    for (const c of cList) {
      roomMins += getDurationMinutes(c);
    }

    const utilRate = standardMinutesPerRoom > 0
      ? Math.round((roomMins / standardMinutesPerRoom) * 1000) / 10
      : 0;

    let status: RoomUtilizationMetric['status'] = 'optimal';
    if (utilRate < 50) status = 'low';
    else if (utilRate > 100) status = 'overloaded';
    else if (utilRate >= 85) status = 'high';

    roomUtilizations.push({
      roomKey,
      roomName: roomKey,
      totalCases: cList.length,
      totalMinutes: roomMins,
      availableMinutes: standardMinutesPerRoom,
      utilizationRate: utilRate,
      status,
    });

    // Tính Turnaround Time giữa các ca cùng ngày trên bàn này
    const casesByDate = new Map<string, PersistedSurgeryRecord[]>();
    for (const c of cList) {
      const dKey = toDateKey(c.ngayBD);
      if (dKey) {
        if (!casesByDate.has(dKey)) casesByDate.set(dKey, []);
        casesByDate.get(dKey)!.push(c);
      }
    }

    let roomTatSum = 0;
    let roomTatCount = 0;
    let minTat = 9999;
    let maxTat = 0;
    let delayedTatCount = 0;

    for (const [, dayCases] of casesByDate.entries()) {
      if (dayCases.length < 2) continue;

      // Sắp xếp theo giờ bắt đầu
      dayCases.sort((a, b) => {
        const sa = new Date(a.ngayBD).getTime();
        const sb = new Date(b.ngayBD).getTime();
        return sa - sb;
      });

      for (let i = 0; i < dayCases.length - 1; i++) {
        const endPrev = new Date(dayCases[i].ngayKT).getTime();
        const startNext = new Date(dayCases[i + 1].ngayBD).getTime();

        if (!isNaN(endPrev) && !isNaN(startNext) && startNext >= endPrev) {
          const gapMins = Math.round((startNext - endPrev) / (1000 * 60));
          // Bỏ qua khoảng trống quá dài (> 180 phút được tính là trống ca/nghỉ trưa chứ không phải dọn phòng)
          if (gapMins >= 0 && gapMins <= 180) {
            roomTatSum += gapMins;
            roomTatCount++;
            if (gapMins < minTat) minTat = gapMins;
            if (gapMins > maxTat) maxTat = gapMins;
            if (gapMins > kpiConfig.warningTurnaroundMinutes) {
              delayedTatCount++;
            }
          }
        }
      }
    }

    const avgTat = roomTatCount > 0 ? Math.round(roomTatSum / roomTatCount) : 0;
    turnarounds.push({
      roomKey,
      roomName: roomKey,
      avgTurnaroundMinutes: avgTat,
      minTurnaroundMinutes: minTat === 9999 ? 0 : minTat,
      maxTurnaroundMinutes: maxTat,
      totalTurnarounds: roomTatCount,
      delayedCount: delayedTatCount,
    });

    totalTatSum += roomTatSum;
    totalTatCount += roomTatCount;
  }

  // Sắp xếp bàn mổ theo số ca giảm dần
  roomUtilizations.sort((a, b) => b.totalCases - a.totalCases);
  turnarounds.sort((a, b) => b.totalTurnarounds - a.totalTurnarounds);

  const totalAvailableRoomsMinutes = roomUtilizations.length * standardMinutesPerRoom;
  const overallUtilizationRate = totalAvailableRoomsMinutes > 0
    ? Math.round((totalOperatingMinutes / totalAvailableRoomsMinutes) * 1000) / 10
    : 0;

  const avgTurnaroundMinutes = totalTatCount > 0 ? Math.round(totalTatSum / totalTatCount) : 0;

  // --- 3. Tính hiệu suất Phẫu thuật viên ---
  const surgeonPerformances: SurgeonPerformanceMetric[] = [];
  for (const [sName, sList] of surgeonMap.entries()) {
    let sMins = 0;
    let sRev = 0;
    let sOvertime = 0;
    const techCounts = new Map<string, number>();

    for (const r of sList) {
      sMins += getDurationMinutes(r);
      sRev += Number(r.thanhTien) || (Number(r.donGia || 0) * Number(r.soLuong || 1));

      // Kiểm tra ngoài giờ
      if (r.ngayBD) {
        const d = new Date(r.ngayBD);
        if (!isNaN(d.getTime())) {
          const dow = d.getDay();
          const tVal = d.getHours() * 60 + d.getMinutes();
          if (dow === 0 || dow === 6 || tVal < 450 || tVal >= 1020) {
            sOvertime++;
          }
        }
      }

      const tName = (r.tenKT || '').trim();
      if (tName) {
        techCounts.set(tName, (techCounts.get(tName) || 0) + 1);
      }
    }

    // Top 3 kỹ thuật của PTV này
    const sortedTechs = Array.from(techCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);

    surgeonPerformances.push({
      surgeonName: sName,
      totalCases: sList.length,
      totalMinutes: sMins,
      avgDurationMinutes: sList.length > 0 ? Math.round(sMins / sList.length) : 0,
      overtimeCases: sOvertime,
      totalRevenue: sRev,
      topTechniques: sortedTechs,
    });
  }
  surgeonPerformances.sort((a, b) => b.totalCases - a.totalCases);

  // --- 4. Top Kỹ thuật ---
  const topTechniques: TechniqueKpiMetric[] = [];
  for (const [tName, entry] of techniqueMap.entries()) {
    let tMins = 0;
    const loai = entry.records[0]?.loaiPTTT || 'TKPL';
    const maTđ = entry.records[0]?.maTuongDuong;

    for (const r of entry.records) {
      tMins += getDurationMinutes(r);
    }

    topTechniques.push({
      tenKT: tName,
      loaiPTTT: loai,
      maTuongDuong: maTđ,
      count: entry.records.length,
      totalRevenue: entry.totalRev,
      avgDurationMinutes: entry.records.length > 0 ? Math.round(tMins / entry.records.length) : 0,
    });
  }
  topTechniques.sort((a, b) => b.count - a.count);

  return {
    periodLabel,
    dataSource,
    totalCases,
    totalOperatingMinutes,
    overallUtilizationRate,
    avgTurnaroundMinutes,
    scheduledCases,
    emergencyCases,
    inHoursCases,
    outHoursCases,
    roomUtilizations,
    turnarounds,
    surgeonPerformances,
    topTechniques,
    alerts,
  };
}

/**
 * Xuất toàn bộ dữ liệu KPI Quản trị phòng mổ ra file Excel nhiều sheet chuẩn
 */
export function exportOrAnalyticsToExcel(data: OrAnalyticsResult): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng quan & Công suất bàn mổ
  const summaryRows = [
    ['BÁO CÁO CHỈ SỐ KPI QUẢN TRỊ PHÒNG MỔ (OR ANALYTICS)'],
    [`Kỳ thống kê: ${data.periodLabel} | Nguồn dữ liệu: ${data.dataSource}`],
    [''],
    ['1. CÁC CHỈ SỐ CHÍNH'],
    ['Tổng số ca phẫu thuật/thủ thuật', data.totalCases],
    ['Tổng thời gian mổ thực tế (phút)', data.totalOperatingMinutes],
    ['Tổng thời gian mổ thực tế (giờ)', Math.round(data.totalOperatingMinutes / 60)],
    ['Công suất lấp đầy phòng mổ trung bình (%)', `${data.overallUtilizationRate}%`],
    ['Thời gian chuyển ca trung bình (phút)', data.avgTurnaroundMinutes],
    ['Số ca mổ phiên', data.scheduledCases],
    ['Số ca mổ cấp cứu', data.emergencyCases],
    ['Số ca trong giờ hành chính', data.inHoursCases],
    ['Số ca ngoài giờ / trực', data.outHoursCases],
    ['Tổng số ca cảnh báo bất thường', data.alerts.length],
    [''],
    ['2. CÔNG SUẤT THEO TỪNG BÀN MỔ / PHÒNG MỔ'],
    ['STT', 'Bàn mổ / Mã máy', 'Số ca mổ', 'Tổng phút mổ', 'Tổng giờ mổ', 'Thời gian chuẩn (giờ)', 'Tỷ lệ công suất (%)', 'Đánh giá'],
    ...data.roomUtilizations.map((r, idx) => [
      idx + 1,
      r.roomName,
      r.totalCases,
      r.totalMinutes,
      Math.round(r.totalMinutes / 60),
      Math.round(r.availableMinutes / 60),
      `${r.utilizationRate}%`,
      r.status === 'optimal' ? 'Tối ưu (50-85%)' : r.status === 'high' ? 'Cao (85-100%)' : r.status === 'overloaded' ? 'Quá tải (>100%)' : 'Thấp (<50%)',
    ]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng quan & Bàn mổ');

  // Sheet 2: Thời gian chuyển ca (Turnaround Time)
  const tatRows = [
    ['THỜI GIAN CHUYỂN GIAO CA MỔ (TURNAROUND TIME)'],
    ['STT', 'Bàn mổ / Phòng', 'Số lần chuyển ca', 'TAT Trung bình (phút)', 'TAT Nhanh nhất (phút)', 'TAT Lâu nhất (phút)', 'Số lần chậm (> ngưỡng)'],
    ...data.turnarounds.map((t, idx) => [
      idx + 1,
      t.roomName,
      t.totalTurnarounds,
      t.avgTurnaroundMinutes,
      t.minTurnaroundMinutes,
      t.maxTurnaroundMinutes,
      t.delayedCount,
    ]),
  ];
  const wsTat = XLSX.utils.aoa_to_sheet(tatRows);
  XLSX.utils.book_append_sheet(wb, wsTat, 'Thời gian chuyển ca');

  // Sheet 3: Hiệu suất Phẫu thuật viên
  const surgeonRows = [
    ['HIỆU SUẤT PHẪU THUẬT VIÊN CHÍNH'],
    ['STT', 'Phẫu thuật viên', 'Tổng ca mổ', 'Tổng giờ mổ', 'TG trung bình/ca (phút)', 'Ca ngoài giờ', 'Tổng viện phí mang lại (₫)', 'Kỹ thuật phổ biến'],
    ...data.surgeonPerformances.map((s, idx) => [
      idx + 1,
      s.surgeonName,
      s.totalCases,
      Math.round(s.totalMinutes / 60),
      s.avgDurationMinutes,
      s.overtimeCases,
      s.totalRevenue,
      s.topTechniques.join('; '),
    ]),
  ];
  const wsSurgeon = XLSX.utils.aoa_to_sheet(surgeonRows);
  XLSX.utils.book_append_sheet(wb, wsSurgeon, 'Phẫu thuật viên');

  // Sheet 4: Top Kỹ thuật
  const techRows = [
    ['DANH MỤC KỸ THUẬT PHỔ BIẾN & DOANH THU'],
    ['STT', 'Tên dịch vụ kỹ thuật', 'Loại PTTT', 'Mã tương đương', 'Số ca', 'Thời lượng TB (phút)', 'Tổng thành tiền (₫)'],
    ...data.topTechniques.map((t, idx) => [
      idx + 1,
      t.tenKT,
      t.loaiPTTT,
      t.maTuongDuong || '',
      t.count,
      t.avgDurationMinutes,
      t.totalRevenue,
    ]),
  ];
  const wsTech = XLSX.utils.aoa_to_sheet(techRows);
  XLSX.utils.book_append_sheet(wb, wsTech, 'Top Kỹ thuật');

  // Sheet 5: Danh sách cảnh báo
  const alertRows = [
    ['DANH SÁCH CA MỔ BẤT THƯỜNG & CẢNH BÁO CHI PHÍ'],
    ['STT', 'Mã BN', 'Họ tên người bệnh', 'Ngày mổ', 'Tên kỹ thuật', 'PTV chính', 'Phòng/Bàn mổ', 'Thời lượng (phút)', 'Loại cảnh báo', 'Mức độ', 'Nội dung chi tiết'],
    ...data.alerts.map((a, idx) => [
      idx + 1,
      a.patientId,
      a.patientName,
      a.ngayPT,
      a.tenKT,
      a.ptChinh,
      a.roomName,
      a.durationMinutes,
      a.alertType === 'outlier_short' ? 'Ca quá ngắn' : a.alertType === 'outlier_long' ? 'Ca quá dài' : a.alertType === 'cost_overrun' ? 'Bội chi thuốc/VTTH' : 'Chậm chuyển ca',
      a.severity === 'error' ? 'Nghiêm trọng' : 'Cảnh báo',
      a.message,
    ]),
  ];
  const wsAlerts = XLSX.utils.aoa_to_sheet(alertRows);
  XLSX.utils.book_append_sheet(wb, wsAlerts, 'Cảnh báo bất thường');

  const fileName = `Bao_cao_KPI_Quan_tri_Phong_mo_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
