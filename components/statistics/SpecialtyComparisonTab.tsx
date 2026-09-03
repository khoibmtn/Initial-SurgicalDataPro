/**
 * SpecialtyComparisonTab — Phân tích so sánh phẫu thuật theo 5 chuyên khoa
 * Tab thứ 2 trong trang Thống kê phẫu thuật
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, Download, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Search, Filter, CheckCircle2, ChevronDown, ChevronRight, Layers, FileSpreadsheet,
  Calendar, Activity, Sparkles, SlidersHorizontal
} from 'lucide-react';
import { StaffMember } from '../../types';
import {
  getSpecialtyComparisonData,
  SpecialtyReportGroup,
  SPECIALTIES,
  SpecialtyCode,
  ComparisonConfig,
  getComparisonThresholdConfig,
} from '../../services/specialtyComparisonService';
import { exportSpecialtyComparisonExcel } from '../../services/excelExportComparisonService';

interface Props {
  staffList: StaffMember[];
  initialYear?: number;
  initialMonth?: number;
}

export const SpecialtyComparisonTab: React.FC<Props> = ({
  staffList,
  initialYear,
  initialMonth,
}) => {
  const currentRealYear = new Date().getFullYear();
  const currentRealMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState<number>(() => initialYear || currentRealYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => initialMonth || currentRealMonth);
  const [selectedSpecialty, setSelectedSpecialty] = useState<SpecialtyCode | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ALERT' | 'POSITIVE'>('all');

  const [loading, setLoading] = useState<boolean>(false);
  const [groups, setGroups] = useState<SpecialtyReportGroup[]>([]);
  const [thresholdConfig, setThresholdConfig] = useState<ComparisonConfig>(getComparisonThresholdConfig);
  const [exporting, setExporting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Xác định tháng trước & cùng kỳ
  let prevMonth = selectedMonth - 1;
  let prevYear = selectedYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = selectedYear - 1;
  }
  const samePeriodMonth = selectedMonth;
  const samePeriodYear = selectedYear - 1;

  // Load comparison data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = getComparisonThresholdConfig();
      setThresholdConfig(cfg);
      const data = await getSpecialtyComparisonData(selectedYear, selectedMonth, staffList, cfg);
      setGroups(data);
    } catch (err: any) {
      console.error('Error loading specialty comparison data:', err);
      showToast('Có lỗi xảy ra khi tải dữ liệu phân tích', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, staffList]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Year options
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentRealYear + 1; y >= currentRealYear - 4; y--) {
      years.push(y);
    }
    return years;
  }, [currentRealYear]);

  // Handle Export Excel
  const handleExportExcel = async () => {
    if (groups.length === 0 || groups.every(g => g.rows.length === 0)) {
      showToast('Không có dữ liệu để xuất Excel', 'error');
      return;
    }
    setExporting(true);
    try {
      await exportSpecialtyComparisonExcel(groups, selectedYear, selectedMonth, thresholdConfig);
      showToast('Đã xuất file Excel phân tích thành công!');
    } catch (err: any) {
      console.error('Export error:', err);
      showToast('Lỗi khi xuất file Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Overall KPIs
  const overallKPIs = useMemo(() => {
    let totalCurrent = 0;
    let totalPrev = 0;
    let totalSamePeriod = 0;
    let totalAlerts = 0;
    let totalPositives = 0;
    let totalDistinctSurgeries = 0;

    groups.forEach(g => {
      totalCurrent += g.totalCurrent;
      totalPrev += g.totalPrev;
      totalSamePeriod += g.totalSamePeriod;
      totalAlerts += g.alertCount;
      totalPositives += g.positiveCount;
      totalDistinctSurgeries += g.rows.length;
    });

    const prevChangePct = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : null;
    const samePeriodChangePct = totalSamePeriod > 0 ? ((totalCurrent - totalSamePeriod) / totalSamePeriod) * 100 : null;

    return {
      totalCurrent,
      totalPrev,
      totalSamePeriod,
      prevChangePct,
      samePeriodChangePct,
      totalAlerts,
      totalPositives,
      totalDistinctSurgeries,
    };
  }, [groups]);

  // Filter groups according to current user search & filters
  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return groups
      .filter(g => selectedSpecialty === 'all' || g.specialty.code === selectedSpecialty)
      .map(g => {
        let filteredRows = g.rows;

        if (term) {
          filteredRows = filteredRows.filter(r => r.tenKT.toLowerCase().includes(term) || r.note.toLowerCase().includes(term));
        }

        if (filterStatus !== 'all') {
          filteredRows = filteredRows.filter(r => r.status === filterStatus);
        }

        return {
          ...g,
          rows: filteredRows,
        };
      })
      .filter(g => g.rows.length > 0 || (selectedSpecialty !== 'all' && selectedSpecialty === g.specialty.code));
  }, [groups, selectedSpecialty, searchTerm, filterStatus]);

  const fmtPctStr = (val: number | null) => {
    if (val === null) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  };

  return (
    <div className="flex flex-col gap-5 p-4 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* ── Toast Notification ── */}
      {toast && (
        <div className={`fixed top-16 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg border text-sm font-medium flex items-center gap-2 animate-slide-in ${
          toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Top Toolbar: Selectors & Actions ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Time Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-primary-50/60 border border-primary-100 rounded-lg px-3 py-1.5">
            <Calendar className="h-4 w-4 text-primary-700 shrink-0" />
            <span className="text-xs font-bold text-primary-900">Kỳ phân tích:</span>

            {/* Month Select */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-white border border-primary-200 rounded-md px-2 py-1 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-xs cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>

            {/* Year Select */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-white border border-primary-200 rounded-md px-2 py-1 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-xs cursor-pointer"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-gray-500 italic hidden md:block">
            So với: <strong className="text-gray-700">T{prevMonth}/{prevYear}</strong> và <strong className="text-gray-700">T{samePeriodMonth}/{samePeriodYear}</strong>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-xs font-semibold hover:bg-gray-100 transition-colors shadow-xs"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary-600' : 'text-gray-500'}`} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* Right: Search & Excel Export */}
        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm tên phẫu thuật..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg w-48 sm:w-56 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all placeholder:text-gray-400"
            />
          </div>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
            <span>{exporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Cases */}
        <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tổng số ca T{selectedMonth}/{selectedYear}</p>
            <h3 className="text-2xl font-extrabold text-primary-950 mt-0.5">{overallKPIs.totalCurrent.toLocaleString('vi-VN')}</h3>
            <div className="flex items-center gap-2 mt-1 text-[11px]">
              <span className={`font-semibold flex items-center gap-0.5 ${
                overallKPIs.prevChangePct !== null && overallKPIs.prevChangePct >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {overallKPIs.prevChangePct !== null && overallKPIs.prevChangePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {fmtPctStr(overallKPIs.prevChangePct)} (so T{prevMonth})
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-700 shrink-0">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: Cảnh báo */}
        <div
          onClick={() => setFilterStatus(prev => prev === 'ALERT' ? 'all' : 'ALERT')}
          className={`bg-white rounded-xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all ${
            filterStatus === 'ALERT' ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-gray-200 hover:border-red-300'
          }`}
        >
          <div>
            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-600" />
              Chỉ tiêu CẢNH BÁO (giảm ≥{thresholdConfig.alertThreshold}%)
            </p>
            <h3 className="text-2xl font-extrabold text-red-600 mt-0.5">{overallKPIs.totalAlerts} <span className="text-xs font-normal text-gray-500">kỹ thuật</span></h3>
            <p className="text-[11px] text-gray-500 mt-1">Bao gồm ca giảm mạnh & không phát sinh</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0 font-extrabold text-sm">
            🚨
          </div>
        </div>

        {/* Card 3: Tích cực */}
        <div
          onClick={() => setFilterStatus(prev => prev === 'POSITIVE' ? 'all' : 'POSITIVE')}
          className={`bg-white rounded-xl border p-3.5 shadow-xs flex items-center justify-between cursor-pointer transition-all ${
            filterStatus === 'POSITIVE' ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-gray-200 hover:border-emerald-300'
          }`}
        >
          <div>
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              Chỉ tiêu TÍCH CỰC (tăng ≥{thresholdConfig.positiveThreshold}%)
            </p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-0.5">{overallKPIs.totalPositives} <span className="text-xs font-normal text-gray-500">kỹ thuật</span></h3>
            <p className="text-[11px] text-gray-500 mt-1">Bao gồm ca tăng trưởng & mới phát sinh</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 font-extrabold text-sm">
            🌿
          </div>
        </div>

        {/* Card 4: Tổng số kỹ thuật */}
        <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Danh mục phẫu thuật phát sinh</p>
            <h3 className="text-2xl font-extrabold text-gray-800 mt-0.5">{overallKPIs.totalDistinctSurgeries} <span className="text-xs font-normal text-gray-500">kỹ thuật</span></h3>
            <p className="text-[11px] text-gray-500 mt-1">Chia theo 5 chuyên khoa</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* ── Specialty Filter Pills ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedSpecialty('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
            selectedSpecialty === 'all'
              ? 'bg-primary-800 text-white'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span>Tất cả chuyên khoa</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedSpecialty === 'all' ? 'bg-primary-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {groups.length}
          </span>
        </button>

        {SPECIALTIES.map(spec => {
          const grp = groups.find(g => g.specialty.code === spec.code);
          const hasAlerts = (grp?.alertCount || 0) > 0;

          return (
            <button
              key={spec.code}
              onClick={() => setSelectedSpecialty(spec.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                selectedSpecialty === spec.code
                  ? 'bg-primary-800 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{spec.name}</span>
              {hasAlerts && (
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" title="Có cảnh báo" />
              )}
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedSpecialty === spec.code ? 'bg-primary-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {grp?.totalCurrent || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main Data Tables (Per Specialty) ── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin" />
          <p className="text-sm font-semibold text-gray-700">Đang tổng hợp và phân tích dữ liệu 3 kỳ...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 flex flex-col items-center justify-center text-center">
          <Layers className="h-10 w-10 text-gray-300 mb-2" />
          <h4 className="font-bold text-gray-700 text-sm">Không tìm thấy dữ liệu phẫu thuật phù hợp</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-sm">
            Không có ca phẫu thuật nào trong kỳ T{selectedMonth}/{selectedYear} hoặc theo bộ lọc hiện tại.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {filteredGroups.map(group => {
            const prevTotalChange = group.totalPrev > 0 ? ((group.totalCurrent - group.totalPrev) / group.totalPrev) * 100 : null;
            const samePeriodTotalChange = group.totalSamePeriod > 0 ? ((group.totalCurrent - group.totalSamePeriod) / group.totalSamePeriod) * 100 : null;

            return (
              <div
                key={group.specialty.code}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* ── Table Header Banner (Navy Blue Theme) ── */}
                <div className="bg-[#003366] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <h3 className="font-bold text-base tracking-wide uppercase">
                      PHÂN TÍCH PHẪU THUẬT - {group.specialty.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="bg-[#002244] px-2.5 py-1 rounded-md text-gray-200 font-medium">
                      Tổng ca: <strong className="text-white font-bold">{group.totalCurrent}</strong>
                    </span>
                    {group.alertCount > 0 && (
                      <span className="bg-red-500/90 text-white px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1">
                        🚨 {group.alertCount} cảnh báo
                      </span>
                    )}
                    {group.positiveCount > 0 && (
                      <span className="bg-emerald-500/90 text-white px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1">
                        🌿 {group.positiveCount} tích cực
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Subtitle bar (Soft blue) ── */}
                <div className="bg-[#d9edf7] text-[#003366] px-4 py-1.5 text-[11.5px] italic text-center border-b border-[#bce8f1]">
                  So sánh tháng {selectedMonth}/{selectedYear} với tháng {prevMonth}/{prevYear} và tháng {samePeriodMonth}/{samePeriodYear}.
                  Ngưỡng tích cực từ {thresholdConfig.positiveThreshold}%; cảnh báo khi giảm từ {thresholdConfig.alertThreshold}% hoặc không phát sinh trong kỳ hiện tại.
                </div>

                {/* ── Table Body ── */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-[#104E8B] text-white text-center font-bold text-[11px] tracking-wide border-b border-gray-300">
                        <th className="px-3 py-2.5 text-left min-w-[280px] border-r border-blue-800">Tên phẫu thuật</th>
                        <th className="px-2 py-2.5 w-24 border-r border-blue-800 bg-[#0d4277]">T{selectedMonth}/{selectedYear}</th>
                        <th className="px-2 py-2.5 w-24 border-r border-blue-800">T{prevMonth}/{prevYear}</th>
                        <th className="px-2 py-2.5 w-28 border-r border-blue-800">So tháng trước</th>
                        <th className="px-2 py-2.5 w-24 border-r border-blue-800">T{samePeriodMonth}/{samePeriodYear}</th>
                        <th className="px-2 py-2.5 w-28 border-r border-blue-800">So cùng kỳ</th>
                        <th className="px-3 py-2.5 w-32 border-r border-blue-800">Nhận định</th>
                        <th className="px-3 py-2.5 text-left min-w-[200px]">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {group.rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-400 italic">
                            Không có ca phẫu thuật nào trong chuyên khoa này
                          </td>
                        </tr>
                      ) : (
                        group.rows.map((r, idx) => {
                          const isAlert = r.status === 'ALERT';
                          const isPositive = r.status === 'POSITIVE';

                          return (
                            <tr
                              key={`${r.tenKT}-${idx}`}
                              className={`transition-colors hover:bg-blue-50/40 ${
                                isAlert
                                  ? 'bg-orange-50/40'
                                  : isPositive
                                  ? 'bg-emerald-50/30'
                                  : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                              }`}
                            >
                              {/* Tên phẫu thuật */}
                              <td className="px-3 py-2 font-medium text-gray-800 border-r border-gray-200">
                                {r.tenKT}
                              </td>

                              {/* T{m}/{y} */}
                              <td className="px-2 py-2 text-center font-bold text-gray-900 bg-blue-50/50 border-r border-gray-200">
                                {r.currentCount}
                              </td>

                              {/* T{prevM}/{prevY} */}
                              <td className="px-2 py-2 text-center text-gray-700 border-r border-gray-200">
                                {r.prevCount}
                              </td>

                              {/* So tháng trước */}
                              <td className={`px-2 py-2 text-center font-bold border-r border-gray-200 ${
                                r.prevChangePct !== null && r.prevChangePct < 0
                                  ? 'text-red-600'
                                  : r.prevChangePct !== null && r.prevChangePct > 0
                                  ? 'text-emerald-700'
                                  : 'text-gray-600'
                              }`}>
                                {fmtPctStr(r.prevChangePct)}
                              </td>

                              {/* T{sameM}/{sameY} */}
                              <td className="px-2 py-2 text-center text-gray-700 border-r border-gray-200">
                                {r.samePeriodCount}
                              </td>

                              {/* So cùng kỳ */}
                              <td className={`px-2 py-2 text-center font-bold border-r border-gray-200 ${
                                r.samePeriodChangePct !== null && r.samePeriodChangePct < 0
                                  ? 'text-red-600'
                                  : r.samePeriodChangePct !== null && r.samePeriodChangePct > 0
                                  ? 'text-emerald-700'
                                  : 'text-gray-600'
                              }`}>
                                {fmtPctStr(r.samePeriodChangePct)}
                              </td>

                              {/* Nhận định */}
                              <td className="px-3 py-1.5 text-center border-r border-gray-200">
                                {isAlert && (
                                  <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#FCE4D6] text-[#C00000] border border-orange-200 shadow-2xs">
                                    CẢNH BÁO
                                  </span>
                                )}
                                {isPositive && (
                                  <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#E2EFDA] text-[#2E7D32] border border-emerald-200 shadow-2xs">
                                    TÍCH CỰC
                                  </span>
                                )}
                                {!isAlert && !isPositive && (
                                  <span className="text-gray-400 font-medium">—</span>
                                )}
                              </td>

                              {/* Ghi chú */}
                              <td className="px-3 py-2 text-gray-600 italic text-[11.5px]">
                                {r.note}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {/* ── Table Footer Totals ── */}
                    <tfoot>
                      <tr className="bg-[#F2F4F7] font-bold text-gray-900 border-t-2 border-[#003366] text-xs">
                        <td className="px-3 py-2.5 uppercase tracking-wide text-primary-950 border-r border-gray-300">
                          TỔNG CỘNG
                        </td>
                        <td className="px-2 py-2.5 text-center bg-blue-100/70 border-r border-gray-300 text-primary-950 font-extrabold">
                          {group.totalCurrent}
                        </td>
                        <td className="px-2 py-2.5 text-center border-r border-gray-300">
                          {group.totalPrev}
                        </td>
                        <td className={`px-2 py-2.5 text-center font-extrabold border-r border-gray-300 ${
                          prevTotalChange !== null && prevTotalChange < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}>
                          {fmtPctStr(prevTotalChange)}
                        </td>
                        <td className="px-2 py-2.5 text-center border-r border-gray-300">
                          {group.totalSamePeriod}
                        </td>
                        <td className={`px-2 py-2.5 text-center font-extrabold border-r border-gray-300 ${
                          samePeriodTotalChange !== null && samePeriodTotalChange < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}>
                          {fmtPctStr(samePeriodTotalChange)}
                        </td>
                        <td className="px-2 py-2.5 text-center border-r border-gray-300 text-gray-400 font-medium">—</td>
                        <td className="px-3 py-2.5 text-gray-600 text-[11px] font-semibold">
                          Cảnh báo: {group.alertCount} | Tích cực: {group.positiveCount}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
