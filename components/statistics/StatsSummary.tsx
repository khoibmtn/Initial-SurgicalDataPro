/**
 * StatsSummary — KPI cards + Monthly summary table + Daily chart + Surgery type table
 */
import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Calculator, DollarSign, Target, Minus, Info, Download } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { StatisticsData, DailyAggregate, LOAI_PTTT_ORDER, LOAI_PTTT_LABELS } from '../../types';
import { exportStatisticsToExcel } from '../../services/statisticsService';

interface Props {
  data: StatisticsData;
  onMonthChange?: (month: number) => void;
}

// --- Formatters ---
const fmtNum = (n: number) => n.toLocaleString('vi-VN');
const fmtMoney = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return fmtNum(n);
};
const fmtPct = (n: number | null) => {
  if (n === null || isNaN(n) || !isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

function calcChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// --- Toggle Switch ---
const Toggle: React.FC<{ left: string; right: string; value: boolean; onChange: (v: boolean) => void }> = ({ left, right, value, onChange }) => (
  <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs">
    <button
      onClick={() => onChange(false)}
      className={`px-2.5 py-1 rounded-md font-medium transition-all ${!value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
    >{left}</button>
    <button
      onClick={() => onChange(true)}
      className={`px-2.5 py-1 rounded-md font-medium transition-all ${value ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
    >{right}</button>
  </div>
);

// --- Trend Chart (extracted for local state) ---
const TrendChart: React.FC<{
  data: StatisticsData;
  forecast: StatisticsData['forecast'];
  fmtNum: (n: number) => string;
  fmtPct: (n: number | null) => string;
  onMonthChange?: (month: number) => void;
}> = ({ data, forecast, fmtNum, fmtPct, onMonthChange }) => {
  const [isMonthPeriod, setIsMonthPeriod] = useState(false);
  const [isCumulative, setIsCumulative] = useState(true);
  const [colors, setColors] = useState({ current: '#0066CC', previous: '#E63946', compare: '#2A9D8F' });

  const updateColor = (key: keyof typeof colors, value: string) =>
    setColors(prev => ({ ...prev, [key]: value }));

  const { primary, compare, currentMonthDaily, previousMonthDaily, compareMonthDaily } = data;
  const currentMonth = data.selectedMonth;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? data.primaryYear - 1 : data.primaryYear;

  // Build chart data
  let chartData: any[] = [];
  let lines: { key: string; name: string; colorKey: keyof typeof colors; dash?: string; width: number }[] = [];
  let xLabel = '';
  let titleSuffix = '';

  if (!isMonthPeriod) {
    const buildByDay = (daily: DailyAggregate[], metric: 'cumulative' | 'cases') => {
      const map: Record<number, number> = {};
      for (const d of daily) {
        const day = parseInt(d.date.split('-')[2]);
        map[day] = metric === 'cumulative' ? d.cumulative : d.cases;
      }
      return map;
    };

    const metric = isCumulative ? 'cumulative' : 'cases';
    const currentMap = buildByDay(currentMonthDaily, metric);
    const prevMap = buildByDay(previousMonthDaily, metric);
    const compareMap = buildByDay(compareMonthDaily, metric);

    const totalDays = new Date(data.primaryYear, currentMonth, 0).getDate();
    chartData = Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      return {
        name: String(day),
        current: currentMap[day] ?? null,
        previous: prevMap[day] ?? null,
        compare: compareMap[day] ?? null,
      };
    });

    lines = [
      { key: 'current', name: `T${currentMonth}/${data.primaryYear}`, colorKey: 'current', width: 2.5 },
      { key: 'previous', name: `T${prevMonth}/${prevMonthYear}`, colorKey: 'previous', dash: '6 3', width: 2 },
      { key: 'compare', name: `T${currentMonth}/${data.compareYear}`, colorKey: 'compare', dash: '4 4', width: 2 },
    ];
    xLabel = 'Ngày';
    titleSuffix = `Tháng ${currentMonth}/${data.primaryYear}`;
  } else {
    chartData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const pCases = primary[i]?.actualCases ?? 0;
      const cCases = compare[i]?.actualCases ?? 0;

      if (isCumulative) {
        const pCum = primary.slice(0, m).reduce((s, mm) => s + mm.actualCases, 0);
        const cCum = compare.slice(0, m).reduce((s, mm) => s + mm.actualCases, 0);
        return { name: `T${m}`, current: pCum > 0 ? pCum : null, compare: cCum > 0 ? cCum : null };
      }
      return { name: `T${m}`, current: pCases > 0 ? pCases : null, compare: cCases > 0 ? cCases : null };
    });

    lines = [
      { key: 'current', name: `${data.primaryYear}`, colorKey: 'current', width: 2.5 },
      { key: 'compare', name: `${data.compareYear}`, colorKey: 'compare', dash: '4 4', width: 2 },
    ];
    xLabel = 'Tháng';
    titleSuffix = `${data.primaryYear} vs ${data.compareYear}`;
  }

  const chartTitle = isCumulative ? 'Lũy kế số ca' : 'Số ca';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-800">
          {chartTitle} — {titleSuffix}
        </h3>
        <div className="flex items-center gap-3">
          {!isMonthPeriod && onMonthChange && (
            <select
              value={data.selectedMonth}
              onChange={e => onMonthChange(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-semibold bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[60px]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>T{m}</option>
              ))}
            </select>
          )}
          <Toggle left="Ngày" right="Tháng" value={isMonthPeriod} onChange={setIsMonthPeriod} />
          <Toggle left="Lũy kế" right="Từng kỳ" value={!isCumulative} onChange={(v) => setIsCumulative(!v)} />
          {!isMonthPeriod && forecast && (
            <span className={`px-2 py-0.5 rounded-full font-semibold text-xs ${
              forecast.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
              forecast.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              Dự báo: {fmtNum(forecast.forecastTotal)} ca
            </span>
          )}
        </div>
      </div>
      {/* Color pickers row */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-4 text-xs text-gray-600">
        {lines.map(l => (
          <label key={l.key} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="color"
              value={colors[l.colorKey]}
              onChange={e => updateColor(l.colorKey, e.target.value)}
              className="w-5 h-5 rounded border border-gray-300 cursor-pointer p-0"
              style={{ WebkitAppearance: 'none', appearance: 'none', background: 'none' }}
            />
            <span className="font-medium">{l.name}</span>
          </label>
        ))}
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} label={{ value: xLabel, position: 'insideBottomRight', offset: -5, style: { fontSize: 10, fill: '#9ca3af' } }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value: any, name: string) => [value !== null ? `${value} ca` : '—', name]}
              labelFormatter={(label) => `${xLabel} ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {lines.map(l => (
              <Line
                key={l.key} type="monotone" dataKey={l.key} name={l.name}
                stroke={colors[l.colorKey]} strokeWidth={l.width}
                strokeDasharray={l.dash} dot={{ r: 2 }} connectNulls={false}
              />
            ))}
            {!isMonthPeriod && isCumulative && forecast && (
              <ReferenceLine
                y={forecast.forecastTotal} stroke="#8b5cf6" strokeDasharray="4 4"
                label={{ value: `Dự báo: ${forecast.forecastTotal}`, position: 'right', style: { fontSize: 10, fill: '#8b5cf6' } }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const StatsSummary: React.FC<Props> = ({ data, onMonthChange }) => {
  const { primary, compare, currentMonthDaily, previousMonthDaily, compareMonthDaily, forecast } = data;

  // Total aggregations
  const totalCasesPrimary = primary.reduce((s, m) => s + m.actualCases, 0);
  const totalCasesCompare = compare.reduce((s, m) => s + m.actualCases, 0);
  const totalEquivPrimary = primary.reduce((s, m) => s + m.equivalentCases, 0);
  const totalSvcCostPrimary = primary.reduce((s, m) => s + m.serviceCost, 0);
  const totalSvcCostCompare = compare.reduce((s, m) => s + m.serviceCost, 0);
  const totalLabCostPrimary = primary.reduce((s, m) => s + m.laborCost, 0);
  const totalLabCostCompare = compare.reduce((s, m) => s + m.laborCost, 0);

  // Average cases per day (calendar days with data)
  const now = new Date();
  const isCurrentYear = data.primaryYear === now.getFullYear();
  const daysElapsed = isCurrentYear
    ? Math.floor((now.getTime() - new Date(data.primaryYear, 0, 1).getTime()) / 86400000)
    : 365;
  const avgCasesPerDay = daysElapsed > 0 ? totalCasesPrimary / daysElapsed : 0;
  const prevDays = 365;
  const avgCasesPerDayCompare = prevDays > 0 ? totalCasesCompare / prevDays : 0;

  // KPI Cards data
  const kpis = [
    {
      label: 'Tổng số ca PT/TT',
      value: fmtNum(totalCasesPrimary),
      change: calcChange(totalCasesPrimary, totalCasesCompare),
      icon: <Activity className="h-5 w-5" />,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Số lượng quy đổi',
      value: fmtNum(totalEquivPrimary),
      change: calcChange(totalEquivPrimary, compare.reduce((s, m) => s + m.equivalentCases, 0)),
      icon: <Calculator className="h-5 w-5" />,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: 'TB ca/ngày',
      value: avgCasesPerDay.toFixed(1),
      change: calcChange(avgCasesPerDay, avgCasesPerDayCompare),
      icon: <Target className="h-5 w-5" />,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: '🔮 Dự báo tháng này',
      value: forecast ? fmtNum(forecast.forecastTotal) : '—',
      change: forecast?.completionVsLastYear ? forecast.completionVsLastYear - 100 : null,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-50',
      tooltip: forecast
        ? `Dự báo dựa trên ${forecast.daysElapsed} ngày dữ liệu (${forecast.confidence === 'high' ? 'Độ tin cậy cao' : forecast.confidence === 'medium' ? 'Độ tin cậy TB' : 'Độ tin cậy thấp'}). Có thể thay đổi khi số liệu tăng.`
        : 'Cần ≥5 ngày dữ liệu để dự báo',
    },
    {
      label: 'Chi phí dịch vụ',
      value: fmtMoney(totalSvcCostPrimary),
      change: calcChange(totalSvcCostPrimary, totalSvcCostCompare),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Chi phí nhân công',
      value: fmtMoney(totalLabCostPrimary),
      change: calcChange(totalLabCostPrimary, totalLabCostCompare),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-rose-600 bg-rose-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={() => exportStatisticsToExcel(data)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg border border-primary-200 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Xuất Excel
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow group relative"
          >
            <div className={`inline-flex items-center justify-center rounded-lg p-2 mb-2 ${kpi.color}`}>
              {kpi.icon}
            </div>
            <p className="text-xs text-gray-500 font-medium mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
            {kpi.change !== null && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${
                kpi.change > 0 ? 'text-emerald-600' : kpi.change < 0 ? 'text-red-500' : 'text-gray-400'
              }`}>
                {kpi.change > 0 ? <TrendingUp className="h-3 w-3" /> :
                  kpi.change < 0 ? <TrendingDown className="h-3 w-3" /> :
                  <Minus className="h-3 w-3" />}
                {fmtPct(kpi.change)}
                <span className="text-gray-400 font-normal ml-0.5">vs {data.compareYear}</span>
              </div>
            )}
            {kpi.tooltip && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative group/tip">
                  <Info className="h-3.5 w-3.5 text-gray-300 cursor-help" />
                  <div className="hidden group-hover/tip:block absolute z-50 right-0 top-5 bg-gray-800 text-white text-[10px] rounded-lg p-2 w-52 shadow-lg">
                    {kpi.tooltip}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Monthly Summary Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800">Tổng hợp theo tháng — {data.primaryYear}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[140px]">Chỉ tiêu</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="text-center px-2 py-2 font-semibold text-gray-600 min-w-[65px]">
                    T{i + 1}
                    {primary[i]?.dataSource === 'DAILY' && (
                      <span className="block text-[9px] text-amber-500 font-normal">(daily)</span>
                    )}
                  </th>
                ))}
                <th className="text-center px-3 py-2 font-bold text-gray-800 bg-primary-50 min-w-[80px]">Cả năm</th>
              </tr>
            </thead>
            <tbody>
              {/* Row: Số ca thực tế */}
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white">Số ca thực tế</td>
                {primary.map((m, i) => (
                  <td key={i} className="text-center px-2 py-2 text-gray-800 font-semibold">
                    {m.actualCases > 0 ? fmtNum(m.actualCases) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="text-center px-3 py-2 font-bold text-primary-800 bg-primary-50">{fmtNum(totalCasesPrimary)}</td>
              </tr>

              {/* Row: Quy đổi */}
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white">SL quy đổi</td>
                {primary.map((m, i) => (
                  <td key={i} className="text-center px-2 py-2 text-gray-600">
                    {m.equivalentCases > 0 ? fmtNum(m.equivalentCases) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="text-center px-3 py-2 font-bold text-primary-800 bg-primary-50">{fmtNum(totalEquivPrimary)}</td>
              </tr>

              {/* Row: So sánh cùng kỳ */}
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white">So sánh cùng kỳ</td>
                {primary.map((m, i) => {
                  const change = calcChange(m.actualCases, compare[i]?.actualCases ?? 0);
                  return (
                    <td key={i} className={`text-center px-2 py-2 font-semibold ${
                      change === null ? 'text-gray-300' : change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {change !== null ? fmtPct(change) : '—'}
                    </td>
                  );
                })}
                <td className={`text-center px-3 py-2 font-bold bg-primary-50 ${
                  calcChange(totalCasesPrimary, totalCasesCompare) !== null
                    ? (calcChange(totalCasesPrimary, totalCasesCompare)! > 0 ? 'text-emerald-600' : 'text-red-500')
                    : 'text-gray-400'
                }`}>
                  {fmtPct(calcChange(totalCasesPrimary, totalCasesCompare))}
                </td>
              </tr>

              {/* Row: Chi phí DV */}
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white">Chi phí DV (tr)</td>
                {primary.map((m, i) => (
                  <td key={i} className="text-center px-2 py-2 text-gray-600">
                    {m.serviceCost > 0 ? fmtMoney(m.serviceCost) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="text-center px-3 py-2 font-bold text-primary-800 bg-primary-50">{fmtMoney(totalSvcCostPrimary)}</td>
              </tr>

              {/* Row: Chi phí NC */}
              <tr className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white">Chi phí NC (tr)</td>
                {primary.map((m, i) => (
                  <td key={i} className="text-center px-2 py-2 text-gray-600">
                    {m.laborCost > 0 ? fmtMoney(m.laborCost) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="text-center px-3 py-2 font-bold text-primary-800 bg-primary-50">{fmtMoney(totalLabCostPrimary)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart — Day/Month + Cumulative/Daily toggles */}
      <TrendChart data={data} forecast={forecast} fmtNum={fmtNum} fmtPct={fmtPct} onMonthChange={onMonthChange} />

      {/* Surgery Type Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800">Chi tiết theo loại PT/TT — {data.primaryYear} (số ca)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[80px]">Loại</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="text-center px-2 py-2 font-semibold text-gray-600 min-w-[50px]">T{i + 1}</th>
                ))}
                <th className="text-center px-3 py-2 font-bold text-gray-800 bg-primary-50 min-w-[60px]">Tổng</th>
                <th className="text-center px-3 py-2 font-bold text-gray-800 bg-primary-50 min-w-[60px]">%</th>
              </tr>
            </thead>
            <tbody>
              {LOAI_PTTT_ORDER.map(code => {
                const total = primary.reduce((s, m) => s + (m.byType[code] || 0), 0);
                const pct = totalCasesPrimary > 0 ? (total / totalCasesPrimary * 100) : 0;
                return (
                  <tr key={code} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-white">{code}</td>
                    {primary.map((m, i) => (
                      <td key={i} className="text-center px-2 py-2 text-gray-600">
                        {(m.byType[code] || 0) > 0 ? m.byType[code] : <span className="text-gray-200">·</span>}
                      </td>
                    ))}
                    <td className="text-center px-3 py-2 font-bold text-primary-800 bg-primary-50">{total > 0 ? fmtNum(total) : '—'}</td>
                    <td className="text-center px-3 py-2 font-semibold text-gray-600 bg-primary-50">{pct > 0 ? pct.toFixed(1) + '%' : '—'}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold">
                <td className="px-3 py-2 text-gray-800 sticky left-0 bg-gray-50">Tổng</td>
                {primary.map((m, i) => (
                  <td key={i} className="text-center px-2 py-2 text-gray-800">{m.actualCases > 0 ? fmtNum(m.actualCases) : '—'}</td>
                ))}
                <td className="text-center px-3 py-2 text-primary-800 bg-primary-50">{fmtNum(totalCasesPrimary)}</td>
                <td className="text-center px-3 py-2 text-primary-800 bg-primary-50">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
