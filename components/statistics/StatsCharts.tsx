/**
 * StatsCharts — 9 charts organized in 3 collapsible sections
 * Section 1: Volume (4 charts) — default OPEN
 * Section 2: Cost (3 charts) — default COLLAPSED
 * Section 3: Detail (2 charts) — default COLLAPSED
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from 'recharts';
import { StatisticsData, LOAI_PTTT_ORDER, LOAI_PTTT_LABELS } from '../../types';

interface Props {
  data: StatisticsData;
}

// --- Color palette ---
const COLORS = {
  primary: '#2563eb',
  compare: '#94a3b8',
  forecast: '#8b5cf6',
  green: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
};

const TYPE_COLORS = [
  '#2563eb', '#7c3aed', '#0891b2', '#059669',
  '#d97706', '#dc2626', '#db2777', '#4f46e5', '#64748b',
];

const fmtNum = (n: number) => n.toLocaleString('vi-VN');
const fmtMoney = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return fmtNum(n);
};

// --- Collapsible Section ---
const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          {title}
        </h3>
      </button>
      {open && <div className="px-4 pb-4 space-y-6">{children}</div>}
    </div>
  );
};

// --- Custom Tooltip ---
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <strong>{typeof p.value === 'number' && p.value >= 1000 ? fmtNum(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

const MoneyTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <strong>{fmtMoney(p.value)}</strong>
        </p>
      ))}
    </div>
  );
};

export const StatsCharts: React.FC<Props> = ({ data }) => {
  const { primary, compare, currentMonthDaily, forecast } = data;

  // --- Prepare chart data ---

  // Monthly line/bar data
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    name: `T${i + 1}`,
    primary: primary[i]?.actualCases ?? 0,
    compare: compare[i]?.actualCases ?? 0,
    primaryEquiv: primary[i]?.equivalentCases ?? 0,
    compareEquiv: compare[i]?.equivalentCases ?? 0,
    primarySvcCost: primary[i]?.serviceCost ?? 0,
    compareSvcCost: compare[i]?.serviceCost ?? 0,
    primaryLabCost: primary[i]?.laborCost ?? 0,
    compareLabCost: compare[i]?.laborCost ?? 0,
  }));

  // Donut: surgery type distribution (primary year totals)
  const typeDistribution = LOAI_PTTT_ORDER.map((code, idx) => {
    const total = primary.reduce((s, m) => s + (m.byType[code] || 0), 0);
    return { name: code, fullName: LOAI_PTTT_LABELS[code], value: total, color: TYPE_COLORS[idx] };
  }).filter(d => d.value > 0);

  // Service cost by type (donut)
  const costByType = LOAI_PTTT_ORDER.map((code, idx) => {
    const total = primary.reduce((s, m) => s + (m.serviceCostByType?.[code] || 0), 0);
    return { name: code, fullName: LOAI_PTTT_LABELS[code], value: total, color: TYPE_COLORS[idx] };
  }).filter(d => d.value > 0);

  // Stacked bar: type by month
  const stackedData = Array.from({ length: 12 }, (_, i) => {
    const entry: Record<string, any> = { name: `T${i + 1}` };
    for (const code of LOAI_PTTT_ORDER) {
      entry[code] = primary[i]?.byType[code] || 0;
    }
    return entry;
  });

  // Daily cumulative for current month
  const dailyCumulativeData = currentMonthDaily.map(d => {
    const parts = d.date.split('-');
    return {
      name: `${parts[2]}/${parts[1]}`,
      cumulative: d.cumulative,
      cases: d.cases,
      cumulativeSvcCost: d.cumulativeServiceCost,
      cumulativeLabCost: d.cumulativeLaborCost,
    };
  });

  // Last year same month total (for reference line)
  const currentMonth = new Date().getMonth() + 1;
  const lastYearTotal = compare.find(m => m.month === currentMonth)?.actualCases ?? 0;

  const totalCasesPrimary = primary.reduce((s, m) => s + m.actualCases, 0);

  // Shared chart styling
  const chartHeight = 280;
  const labelStyle = { fontSize: 11, fill: '#6b7280' };

  return (
    <div className="space-y-4">
      {/* ====== SECTION 1: VOLUME ====== */}
      <Section title="📊 Số lượng phẫu thuật, thủ thuật" defaultOpen>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Monthly trend (Line) */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Diễn biến số ca theo tháng</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={labelStyle} />
                <YAxis tick={labelStyle} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="primary" name={String(data.primaryYear)}
                  stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone" dataKey="compare" name={String(data.compareYear)}
                  stroke={COLORS.compare} strokeWidth={2} strokeDasharray="5 5"
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Grouped bar comparison */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">So sánh cùng kỳ (số ca)</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={monthlyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={labelStyle} />
                <YAxis tick={labelStyle} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="primary" name={String(data.primaryYear)} fill={COLORS.primary} radius={[3, 3, 0, 0]} barSize={16} />
                <Bar dataKey="compare" name={String(data.compareYear)} fill={COLORS.compare} radius={[3, 3, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 3: Daily cumulative (Area) — current month */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Tích lũy tháng {currentMonth} — {data.primaryYear}
              {forecast && (
                <span className="ml-2 text-gray-400 font-normal">
                  Dự báo: {fmtNum(forecast.forecastTotal)} ca
                </span>
              )}
            </p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <AreaChart data={dailyCumulativeData}>
                <defs>
                  <linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={labelStyle} />
                <YAxis tick={labelStyle} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="cumulative" name="Lũy kế"
                  stroke={COLORS.primary} strokeWidth={2.5} fill="url(#colorCum)"
                />
                {lastYearTotal > 0 && (
                  <ReferenceLine
                    y={lastYearTotal} stroke={COLORS.compare} strokeDasharray="8 4"
                    label={{ value: `Cùng kỳ: ${lastYearTotal}`, position: 'right', style: { fontSize: 10, fill: COLORS.compare } }}
                  />
                )}
                {forecast && (
                  <ReferenceLine
                    y={forecast.forecastTotal} stroke={COLORS.forecast} strokeDasharray="4 4"
                    label={{ value: `Dự báo: ${forecast.forecastTotal}`, position: 'right', style: { fontSize: 10, fill: COLORS.forecast } }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 4: Surgery type distribution (Donut) */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Tỷ trọng loại PT/TT — {data.primaryYear}
            </p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={typeDistribution}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ strokeWidth: 1 }}
                >
                  {typeDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const pct = totalCasesPrimary > 0 ? ((value / totalCasesPrimary) * 100).toFixed(1) : 0;
                    return [`${fmtNum(value)} ca (${pct}%)`, name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* ====== SECTION 2: COST ====== */}
      <Section title="💰 Chi phí">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 5: Service cost by month (Line) */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Chi phí dịch vụ theo tháng</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={labelStyle} />
                <YAxis tick={labelStyle} tickFormatter={fmtMoney} />
                <Tooltip content={<MoneyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="primarySvcCost" name={`DV ${data.primaryYear}`}
                  stroke={COLORS.amber} strokeWidth={2.5} dot={{ r: 3 }}
                />
                <Line
                  type="monotone" dataKey="compareSvcCost" name={`DV ${data.compareYear}`}
                  stroke={COLORS.compare} strokeWidth={2} strokeDasharray="5 5"
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 6: Labor cost by month (Line) */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Chi phí nhân công theo tháng</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={labelStyle} />
                <YAxis tick={labelStyle} tickFormatter={fmtMoney} />
                <Tooltip content={<MoneyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="primaryLabCost" name={`NC ${data.primaryYear}`}
                  stroke={COLORS.rose} strokeWidth={2.5} dot={{ r: 3 }}
                />
                <Line
                  type="monotone" dataKey="compareLabCost" name={`NC ${data.compareYear}`}
                  stroke={COLORS.compare} strokeWidth={2} strokeDasharray="5 5"
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 7: Service cost by type (Donut) */}
          <div className="lg:col-span-2 max-w-md mx-auto">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Tỷ trọng chi phí DV theo loại — {data.primaryYear}
            </p>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={costByType}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ strokeWidth: 1 }}
                >
                  {costByType.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [fmtMoney(value), 'Chi phí']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* ====== SECTION 3: DETAIL ====== */}
      <Section title="📋 Chi tiết">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 8: Stacked bar — type by month */}
          <div className="lg:col-span-2">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Diễn biến loại PT/TT theo tháng — {data.primaryYear}
            </p>
            <ResponsiveContainer width="100%" height={chartHeight + 40}>
              <BarChart data={stackedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={labelStyle} />
                <YAxis tick={labelStyle} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {LOAI_PTTT_ORDER.map((code, idx) => (
                  <Bar
                    key={code} dataKey={code} stackId="a"
                    fill={TYPE_COLORS[idx]} name={code}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 9: Daily cost cumulative (Area) — current month */}
          {dailyCumulativeData.length > 0 && (
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Chi phí tích lũy tháng {currentMonth} — {data.primaryYear}
              </p>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <AreaChart data={dailyCumulativeData}>
                  <defs>
                    <linearGradient id="colorSvc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorLab" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.rose} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={COLORS.rose} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={labelStyle} />
                  <YAxis tick={labelStyle} tickFormatter={fmtMoney} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone" dataKey="cumulativeSvcCost" name="CP Dịch vụ"
                    stroke={COLORS.amber} strokeWidth={2} fill="url(#colorSvc)"
                  />
                  <Area
                    type="monotone" dataKey="cumulativeLabCost" name="CP Nhân công"
                    stroke={COLORS.rose} strokeWidth={2} fill="url(#colorLab)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
};
