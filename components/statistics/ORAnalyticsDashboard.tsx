// ─── Operating Room Analytics Dashboard ────────────────────────────────────────
// Bảng điều khiển KPI Quản trị phòng mổ (Lựa chọn 2)
// Tích hợp ngay trong Page Thống kê phẫu thuật (StatisticsTab)
// Hỗ trợ chọn nguồn số liệu độc lập: Báo cáo tháng vs Báo cáo hàng ngày vs Tự động

import React, { useState, useEffect, useMemo } from 'react';
import {
  Gauge,
  Clock,
  Activity,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
  Users,
  ChevronRight,
  TrendingUp,
  Stethoscope,
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BarChart3,
} from 'lucide-react';
import {
  PersistedSurgeryRecord,
  SurgeryCostItem,
} from '../../types';
import { YearlyCacheData } from '../../services/statisticsService';
import { KpiConfig, OrAnalyticsResult } from '../../types/kpi';
import { subscribeToKpiConfig } from '../../services/kpiConfigService';
import {
  calculateOrAnalytics,
  exportOrAnalyticsToExcel,
} from '../../services/orAnalyticsService';

interface Props {
  yearlyCache: YearlyCacheData | null;
  selectedMonth: number;
  primaryYear: number;
  costItems?: SurgeryCostItem[];
  loading?: boolean;
  onLoadData?: () => void;
}

type DataSourceChoice = 'AUTO' | 'MONTHLY' | 'DAILY';
type ScopeChoice = 'month' | 'year';

export const ORAnalyticsDashboard: React.FC<Props> = ({
  yearlyCache,
  selectedMonth,
  primaryYear,
  costItems = [],
  loading = false,
  onLoadData,
}) => {
  // Nguồn số liệu cục bộ độc lập cho tab này (không ảnh hưởng tab khác)
  const [dataSource, setDataSource] = useState<DataSourceChoice>('AUTO');
  const [scope, setScope] = useState<ScopeChoice>('month');
  const [activeMonth, setActiveMonth] = useState(selectedMonth);
  const [kpiConfig, setKpiConfig] = useState<KpiConfig | null>(null);
  const [activeView, setActiveView] = useState<'rooms' | 'surgeons' | 'alerts'>('rooms');

  useEffect(() => {
    setActiveMonth(selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    const unsub = subscribeToKpiConfig(setKpiConfig);
    return () => unsub();
  }, []);

  // Trích xuất danh sách ca mổ từ raw cache dựa trên nguồn dữ liệu và phạm vi thời gian
  const targetRecords = useMemo((): { records: PersistedSurgeryRecord[]; label: string } => {
    if (!yearlyCache || !yearlyCache.primaryIndexed) {
      return { records: [], label: `Tháng ${String(activeMonth).padStart(2, '0')}/${primaryYear}` };
    }

    const { raw, byMonth } = yearlyCache.primaryIndexed;
    const periodLabel = scope === 'month'
      ? `Tháng ${String(activeMonth).padStart(2, '0')}/${primaryYear}`
      : `Cả năm ${primaryYear}`;

    if (scope === 'month') {
      if (dataSource === 'MONTHLY') {
        const filtered = (raw.monthly || []).filter(r => {
          if (!r.ngayBD) return false;
          const d = new Date(r.ngayBD);
          return !isNaN(d.getTime()) && (d.getMonth() + 1) === activeMonth && d.getFullYear() === primaryYear;
        });
        return { records: filtered, label: periodLabel };
      }

      if (dataSource === 'DAILY') {
        const filtered = (raw.daily || []).filter(r => {
          if (!r.ngayBD) return false;
          const d = new Date(r.ngayBD);
          return !isNaN(d.getTime()) && (d.getMonth() + 1) === activeMonth && d.getFullYear() === primaryYear;
        });
        return { records: filtered, label: periodLabel };
      }

      // AUTO: Sử dụng dữ liệu đã phân giải theo tháng
      const monthData = byMonth.get(activeMonth);
      return { records: monthData?.records || [], label: periodLabel };
    }

    // Scope === 'year'
    if (dataSource === 'MONTHLY') {
      return { records: raw.monthly || [], label: periodLabel };
    }
    if (dataSource === 'DAILY') {
      return { records: raw.daily || [], label: periodLabel };
    }

    // AUTO Cả năm
    const allYearRecords: PersistedSurgeryRecord[] = [];
    for (let m = 1; m <= 12; m++) {
      const mRecs = byMonth.get(m)?.records || [];
      allYearRecords.push(...mRecs);
    }
    return { records: allYearRecords, label: periodLabel };
  }, [yearlyCache, activeMonth, primaryYear, dataSource, scope]);

  // Tính toán chỉ số KPI
  const analyticsResult = useMemo<OrAnalyticsResult | null>(() => {
    if (!kpiConfig) return null;
    const daysInPeriod = scope === 'month'
      ? kpiConfig.operatingDaysPerMonth
      : kpiConfig.operatingDaysPerMonth * 12;

    return calculateOrAnalytics({
      records: targetRecords.records,
      kpiConfig,
      costItems,
      periodLabel: targetRecords.label,
      dataSource,
      operatingDays: daysInPeriod,
    });
  }, [targetRecords, kpiConfig, costItems, dataSource, scope]);

  if (!yearlyCache) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[320px]">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 mb-4 shadow-xs">
          <Gauge className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-1">
          Dữ liệu Quản trị phòng mổ năm {primaryYear}
        </h3>
        <p className="text-xs text-gray-500 max-w-md mb-6 leading-relaxed">
          Số liệu phẫu thuật năm {primaryYear} chưa được nạp. Nhấn nút bên dưới để tải và tính toán toàn bộ chỉ số KPI phòng mổ.
        </p>
        {onLoadData && (
          <button
            type="button"
            onClick={onLoadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all transform active:scale-95 disabled:opacity-50"
          >
            {loading ? <Activity className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? 'Đang tải dữ liệu...' : `Tải dữ liệu năm ${primaryYear}`}
          </button>
        )}
      </div>
    );
  }

  if (!analyticsResult || !kpiConfig) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-xs">
        <Activity className="h-8 w-8 text-blue-600 mx-auto animate-spin mb-3" />
        <p className="text-sm font-semibold text-gray-700">Đang khởi tạo cấu hình và tính toán chỉ số KPI...</p>
        <p className="text-xs text-gray-400 mt-1">Vui lòng chờ trong giây lát</p>
      </div>
    );
  }

  const {
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
  } = analyticsResult;

  const handleExport = () => {
    exportOrAnalyticsToExcel(analyticsResult);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── 1. Top Control & Filtering Toolbar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 leading-tight">
                Quản trị Phòng mổ (OR Analytics)
              </h3>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                {analyticsResult.periodLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Đo lường công suất sử dụng bàn mổ, thời gian dọn ca, phân tích nhân sự và phát hiện bất thường
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ chọn Phạm vi: Tháng vs Cả năm */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setScope('month')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                scope === 'month'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Tháng
            </button>
            {scope === 'month' && (
              <select
                value={activeMonth}
                onChange={(e) => setActiveMonth(Number(e.target.value))}
                className="bg-white text-gray-900 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold mr-1 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setScope('year')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scope === 'year'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Cả năm {primaryYear}
            </button>
          </div>

          {/* 🌟 Bộ chọn Nguồn số liệu (Theo đúng yêu cầu người dùng) */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold">
            <span className="text-[11px] text-gray-400 px-2 font-medium">Nguồn:</span>
            <button
              type="button"
              onClick={() => setDataSource('AUTO')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                dataSource === 'AUTO'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Tự động ưu tiên Báo cáo tháng nếu có, ngược lại lấy Báo cáo ngày"
            >
              Tự động
            </button>
            <button
              type="button"
              onClick={() => setDataSource('MONTHLY')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                dataSource === 'MONTHLY'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Chỉ tính trên dữ liệu Báo cáo tháng"
            >
              BC Tháng
            </button>
            <button
              type="button"
              onClick={() => setDataSource('DAILY')}
              className={`px-2.5 py-1.5 rounded-lg transition-all ${
                dataSource === 'DAILY'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Chỉ tính trên dữ liệu Báo cáo hàng ngày"
            >
              BC Ngày
            </button>
          </div>

          {/* Nút Xuất Excel */}
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all shadow-xs cursor-pointer active:scale-95"
            title="Xuất toàn bộ bảng KPI Quản trị phòng mổ ra file Excel"
          >
            <Download className="h-3.5 w-3.5 text-gray-600" />
            <span>Xuất Excel KPI</span>
          </button>
        </div>
      </div>

      {/* ── 2. 4 Summary KPI Metric Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Công suất phòng mổ */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-blue-600" />
                Công suất phòng mổ (OR Utilization)
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  overallUtilizationRate >= 70 && overallUtilizationRate <= 90
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : overallUtilizationRate > 90
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {overallUtilizationRate >= 70 && overallUtilizationRate <= 90
                  ? 'Tối ưu'
                  : overallUtilizationRate > 90
                  ? 'Quá tải'
                  : 'Còn trống'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-gray-900 font-mono tracking-tight">
                {overallUtilizationRate}%
              </span>
              <span className="text-xs text-gray-400">
                ({Math.round(totalOperatingMinutes / 60)} giờ mổ)
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Chuẩn khuyến nghị: <strong>75% - 85%</strong></span>
            <span>{roomUtilizations.length} bàn mổ</span>
          </div>
        </div>

        {/* Card 2: Thời gian chuyển ca (Turnaround Time) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-emerald-600" />
                Thời gian chuyển ca TB (TAT)
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  avgTurnaroundMinutes <= kpiConfig.targetTurnaroundMinutes
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : avgTurnaroundMinutes > kpiConfig.warningTurnaroundMinutes
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {avgTurnaroundMinutes <= kpiConfig.targetTurnaroundMinutes
                  ? 'Đạt mục tiêu'
                  : avgTurnaroundMinutes > kpiConfig.warningTurnaroundMinutes
                  ? 'Chậm trễ'
                  : 'Cần chú ý'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-gray-900 font-mono tracking-tight">
                {avgTurnaroundMinutes}
              </span>
              <span className="text-xs text-gray-500">phút / ca</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Mục tiêu: <strong>≤ {kpiConfig.targetTurnaroundMinutes}p</strong></span>
            <span>Cảnh báo: &gt; {kpiConfig.warningTurnaroundMinutes}p</span>
          </div>
        </div>

        {/* Card 3: Cơ cấu ca mổ */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-teal-600" />
                Tổng số ca & Cơ cấu
              </span>
              <span className="text-[11px] font-bold text-gray-700">
                {totalCases} ca
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                <p className="text-[10px] text-gray-400 font-semibold">Mổ phiên</p>
                <p className="text-sm font-bold text-gray-800">{scheduledCases} <span className="text-[10px] font-normal text-gray-400">({totalCases > 0 ? Math.round((scheduledCases / totalCases) * 100) : 0}%)</span></p>
              </div>
              <div className="bg-rose-50/60 p-2 rounded-xl border border-rose-100">
                <p className="text-[10px] text-rose-600 font-semibold">Cấp cứu</p>
                <p className="text-sm font-bold text-rose-800">{emergencyCases} <span className="text-[10px] font-normal text-rose-400">({totalCases > 0 ? Math.round((emergencyCases / totalCases) * 100) : 0}%)</span></p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Trong giờ: <strong>{inHoursCases}</strong></span>
            <span>Ngoài giờ: <strong>{outHoursCases}</strong></span>
          </div>
        </div>

        {/* Card 4: Cảnh báo bất thường */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Cảnh báo chất lượng & Outliers
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  alerts.length === 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                {alerts.length === 0 ? 'Tốt' : `${alerts.length} ca`}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700 font-mono tracking-tight">
                {alerts.length}
              </span>
              <span className="text-xs text-gray-500">ca cần kiểm tra</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Quá ngắn (&lt;{kpiConfig.minOutlierMinutes}p) / Kéo dài (&gt;{Math.round(kpiConfig.maxOutlierMinutes / 60)}h)</span>
          </div>
        </div>
      </div>

      {/* ── 3. Detail Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveView('rooms')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeView === 'rooms'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Công suất & Chuyển ca từng Bàn mổ ({roomUtilizations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('surgeons')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeView === 'surgeons'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Hiệu suất Phẫu thuật viên ({surgeonPerformances.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('alerts')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeView === 'alerts'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Danh sách Cảnh báo & Bất thường ({alerts.length})</span>
        </button>
      </div>

      {/* ── 4. View Details ── */}

      {/* View 1: Công suất từng bàn mổ */}
      {activeView === 'rooms' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Bảng theo dõi công suất và thời gian chuyển ca theo từng phòng / bàn mổ
              </h4>
              <span className="text-[11px] text-gray-400">
                Tiêu chuẩn: {kpiConfig.standardHoursPerDay}h/ngày × {scope === 'month' ? kpiConfig.operatingDaysPerMonth : kpiConfig.operatingDaysPerMonth * 12} ngày
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100/75 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12">STT</th>
                    <th className="py-2.5 px-3">Bàn mổ / Phòng</th>
                    <th className="py-2.5 px-3 text-center">Số ca mổ</th>
                    <th className="py-2.5 px-3 text-right">Tổng giờ mổ</th>
                    <th className="py-2.5 px-3 text-right">Giờ chuẩn</th>
                    <th className="py-2.5 px-3 w-48">Tỷ lệ công suất (% Utilization)</th>
                    <th className="py-2.5 px-3 text-center">TAT Trung bình</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roomUtilizations.map((room, idx) => {
                    const tatInfo = turnarounds.find(t => t.roomKey === room.roomKey);
                    return (
                      <tr key={room.roomKey} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-gray-500">{idx + 1}</td>
                        <td className="py-3 px-3 font-semibold text-gray-900">
                          {room.roomName}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-gray-800">
                          {room.totalCases}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-gray-700">
                          {Math.round(room.totalMinutes / 60)}h ({room.totalMinutes}p)
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-gray-400">
                          {Math.round(room.availableMinutes / 60)}h
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  room.utilizationRate >= 70 && room.utilizationRate <= 85
                                    ? 'bg-emerald-500'
                                    : room.utilizationRate > 85 && room.utilizationRate <= 100
                                    ? 'bg-blue-500'
                                    : room.utilizationRate > 100
                                    ? 'bg-rose-500'
                                    : 'bg-amber-400'
                                }`}
                                style={{ width: `${Math.min(room.utilizationRate, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[11px] text-gray-700 w-12 text-right">
                              {room.utilizationRate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {tatInfo && tatInfo.totalTurnarounds > 0 ? (
                            <span
                              className={`font-semibold ${
                                tatInfo.avgTurnaroundMinutes <= kpiConfig.targetTurnaroundMinutes
                                  ? 'text-emerald-600'
                                  : tatInfo.avgTurnaroundMinutes > kpiConfig.warningTurnaroundMinutes
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {tatInfo.avgTurnaroundMinutes} phút
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              room.status === 'optimal'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : room.status === 'high'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : room.status === 'overloaded'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {room.status === 'optimal'
                              ? 'Tối ưu'
                              : room.status === 'high'
                              ? 'Khá cao'
                              : room.status === 'overloaded'
                              ? 'Quá tải'
                              : 'Thấp'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View 2: Hiệu suất PTV & Top Kỹ thuật */}
      {activeView === 'surgeons' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Phẫu thuật viên */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Xếp hạng phẫu thuật viên chính ({surgeonPerformances.length})
              </h4>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100/75 text-gray-600 font-semibold border-b border-gray-200 sticky top-0 bg-white">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3">Phẫu thuật viên</th>
                    <th className="py-2.5 px-3 text-center">Số ca</th>
                    <th className="py-2.5 px-3 text-right">Tổng giờ mổ</th>
                    <th className="py-2.5 px-3 text-center">Ngoài giờ</th>
                    <th className="py-2.5 px-3 text-right">Doanh thu (₫)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {surgeonPerformances.slice(0, 20).map((s, idx) => (
                    <tr key={s.surgeonName} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-gray-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        {s.surgeonName}
                        {s.topTechniques.length > 0 && (
                          <p className="text-[10px] text-gray-400 font-normal truncate max-w-xs">
                            {s.topTechniques[0]}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-700">
                        {s.totalCases}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                        {Math.round(s.totalMinutes / 60)}h
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-amber-700 font-medium">
                        {s.overtimeCases > 0 ? s.overtimeCases : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {s.totalRevenue > 0 ? s.totalRevenue.toLocaleString('vi-VN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Dịch vụ Kỹ thuật */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Top kỹ thuật thực hiện nhiều nhất
              </h4>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100/75 text-gray-600 font-semibold border-b border-gray-200 sticky top-0 bg-white">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3">Tên dịch vụ kỹ thuật</th>
                    <th className="py-2.5 px-2 text-center">Loại</th>
                    <th className="py-2.5 px-3 text-center">Số ca</th>
                    <th className="py-2.5 px-3 text-right">TG TB (phút)</th>
                    <th className="py-2.5 px-3 text-right">Tổng thành tiền (₫)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topTechniques.slice(0, 20).map((t, idx) => (
                    <tr key={t.tenKT} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-gray-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        {t.tenKT}
                        {t.maTuongDuong && (
                          <span className="block text-[10px] text-gray-400 font-mono">
                            {t.maTuongDuong}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {t.loaiPTTT}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-800">
                        {t.count}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-600">
                        {t.avgDurationMinutes}p
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {t.totalRevenue > 0 ? t.totalRevenue.toLocaleString('vi-VN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View 3: Danh sách Cảnh báo & Outliers */}
      {activeView === 'alerts' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Danh sách ca mổ bất thường & Cảnh báo chi phí ({alerts.length})
            </h4>
            <span className="text-[11px] text-gray-400">
              Phát hiện theo ngưỡng cấu hình KPI
            </span>
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-gray-800">Không có ca mổ bất thường</p>
              <p className="text-gray-400 mt-0.5">Tất cả các ca mổ đều nằm trong ngưỡng thời lượng và chi phí an toàn.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100/75 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12">STT</th>
                    <th className="py-2.5 px-3">Bệnh nhân</th>
                    <th className="py-2.5 px-3">Ngày mổ</th>
                    <th className="py-2.5 px-3">Tên kỹ thuật</th>
                    <th className="py-2.5 px-3">PTV / Phòng</th>
                    <th className="py-2.5 px-3 text-center">Thời lượng</th>
                    <th className="py-2.5 px-3">Nội dung cảnh báo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {alerts.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-3 px-3 text-center font-mono text-gray-400">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <strong className="text-gray-900">{a.patientName}</strong>
                        <span className="block font-mono text-[10px] text-gray-400">
                          {a.patientId}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-gray-600">
                        {a.ngayPT ? a.ngayPT.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className="py-3 px-3 font-medium text-gray-800 max-w-xs truncate">
                        {a.tenKT}
                      </td>
                      <td className="py-3 px-3 text-gray-600">
                        <span>{a.ptChinh || '—'}</span>
                        <span className="block text-[10px] text-gray-400">{a.roomName}</span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-gray-800">
                        {a.durationMinutes}p
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                            a.severity === 'error'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {a.message}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
