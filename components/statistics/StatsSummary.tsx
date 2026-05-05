/**
 * StatsSummary — KPI cards + Monthly summary table + Daily chart + Surgery type table
 */
import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, Calculator, DollarSign, Target, Minus, Info, Download, Loader2, AlertTriangle, ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { StatisticsData, DailyAggregate, LOAI_PTTT_ORDER, LOAI_PTTT_LABELS, ChapterCatalog, SurgeryProfile, SurgeryNamePrice, PTTTFilterMode } from '../../types';
import { exportStatisticsToExcel } from '../../services/statisticsService';

interface Props {
  data: StatisticsData;
  onMonthChange?: (month: number) => void;
  chapters: ChapterCatalog[];
  profiles: SurgeryProfile[];
  surgeryNamePrices: SurgeryNamePrice[];
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
  <div className="flex items-center bg-gray-200 rounded-lg p-0.5 text-xs">
    <button
      onClick={() => onChange(false)}
      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${!value ? 'bg-primary-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
    >{left}</button>
    <button
      onClick={() => onChange(true)}
      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${value ? 'bg-primary-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
    >{right}</button>
  </div>
);

// --- Collapsible Frame Wrapper ---
const CollapsibleFrame: React.FC<{
  title: string;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  storageKey?: string;
}> = ({ title, defaultOpen = true, headerRight, children, storageKey }) => {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try { const v = localStorage.getItem(storageKey); if (v !== null) return v === '1'; } catch {}
    }
    return defaultOpen;
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between cursor-pointer select-none hover:bg-gray-100 transition-colors"
        onClick={toggle}
      >
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          {title}
        </h3>
        {open && headerRight && <div onClick={e => e.stopPropagation()}>{headerRight}</div>}
      </div>
      {open && children}
    </div>
  );
};

// --- localStorage helpers for chart settings ---
const CHART_SETTINGS_KEY = 'sdp_chart_settings';

interface ChartSettings {
  isMonthPeriod: boolean;
  isCumulative: boolean;
  colors: { current: string; previous: string; compare: string };
  selectedMonth: number;
}

function loadChartSettings(): Partial<ChartSettings> {
  try {
    const raw = localStorage.getItem(CHART_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveChartSettings(patch: Partial<ChartSettings>) {
  try {
    const current = loadChartSettings();
    localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* ignore */ }
}

// --- Trend Chart (extracted for local state) ---
interface ChartNavState {
  isMonthPeriod: boolean;
  isCumulative: boolean;
  selectedMonth: number;
  colors: { current: string; previous: string; compare: string };
}

const TrendChart: React.FC<{
  data: StatisticsData;
  forecast: StatisticsData['forecast'];
  fmtNum: (n: number) => string;
  fmtPct: (n: number | null) => string;
  onMonthChange?: (month: number) => void;
  onNavChange?: (nav: ChartNavState) => void;
}> = ({ data, forecast, fmtNum, fmtPct, onMonthChange, onNavChange }) => {
  const saved = loadChartSettings();
  const [isMonthPeriod, setIsMonthPeriod] = useState(saved.isMonthPeriod ?? false);
  const [isCumulative, setIsCumulative] = useState(saved.isCumulative ?? true);
  const [colors, setColors] = useState(saved.colors ?? { current: '#0066CC', previous: '#E63946', compare: '#2A9D8F' });

  // Restore saved month on first mount
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current && saved.selectedMonth && onMonthChange) {
      onMonthChange(saved.selectedMonth);
      mountedRef.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of nav changes
  const emitNav = (patch: Partial<ChartNavState>) => {
    const nav: ChartNavState = { isMonthPeriod, isCumulative, selectedMonth: data.selectedMonth, colors, ...patch };
    onNavChange?.(nav);
  };

  const handleMonthPeriodChange = (v: boolean) => {
    setIsMonthPeriod(v);
    saveChartSettings({ isMonthPeriod: v });
    emitNav({ isMonthPeriod: v });
  };
  const handleCumulativeChange = (v: boolean) => {
    setIsCumulative(v);
    saveChartSettings({ isCumulative: v });
    emitNav({ isCumulative: v });
  };
  const updateColor = (key: keyof typeof colors, value: string) => {
    setColors(prev => {
      const next = { ...prev, [key]: value };
      saveChartSettings({ colors: next });
      emitNav({ colors: next });
      return next;
    });
  };
  const handleMonthSelect = (m: number) => {
    saveChartSettings({ selectedMonth: m });
    onMonthChange?.(m);
    emitNav({ selectedMonth: m });
  };

  // Emit initial state on mount
  React.useEffect(() => {
    emitNav({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { primary, compare, currentMonthDaily, previousMonthDaily, compareMonthDaily } = data;
  const currentMonth = data.selectedMonth;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? data.primaryYear - 1 : data.primaryYear;
  const currentYear = new Date().getFullYear();
  const isCurrentYear = data.primaryYear === currentYear;

  // Build chart data
  let chartData: any[] = [];
  let lines: { key: string; name: string; colorKey: keyof typeof colors; dash?: string; width: number }[] = [];
  let xLabel = '';
  let titleSuffix = '';
  let yearEndForecastTotal: number | null = null;

  // Helper: lighten a hex color
  const lighten = (hex: string, amount = 0.4) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `#${[r, g, b].map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('')}`;
  };

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

    // Forecast line for daily cumulative mode
    let forecastMap: Record<number, number> = {};
    if (isCumulative && isCurrentYear && forecast) {
      const actualDays = Object.keys(currentMap).map(Number).sort((a, b) => a - b);
      const lastDay = actualDays.length > 0 ? actualDays[actualDays.length - 1] : 0;
      const lastCum = lastDay > 0 ? (currentMap[lastDay] ?? 0) : 0;
      if (lastDay > 0 && lastDay < totalDays) {
        const dailyRate = lastCum / lastDay;
        forecastMap[lastDay] = lastCum; // overlap point
        for (let d = lastDay + 1; d <= totalDays; d++) {
          forecastMap[d] = Math.round(dailyRate * d);
        }
      }
    }

    chartData = Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      return {
        name: String(day),
        current: currentMap[day] ?? null,
        previous: prevMap[day] ?? null,
        compare: compareMap[day] ?? null,
        forecast: forecastMap[day] ?? null,
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
    // Monthly mode: find last month with actual data
    const lastDataMonth = (() => {
      for (let i = 11; i >= 0; i--) {
        if (primary[i]?.actualCases > 0) return i + 1;
      }
      return 0;
    })();

    // Calculate monthly forecast data — use V5+ model output
    let monthlyForecastCumMap: Record<number, number> = {};
    let monthlyForecastPerMap: Record<number, number> = {};
    const realMonth = new Date().getMonth() + 1;
    if (isCurrentYear && forecast?.forecastMonthly && lastDataMonth > 0 && lastDataMonth < 12) {
      // Overlap at last COMPLETE month (before current month, not partial)
      const overlapMonth = Math.min(lastDataMonth, realMonth - 1);

      if (overlapMonth >= 1) {
        // Cumulative overlap
        const cumToOverlap = primary.slice(0, overlapMonth).reduce((s, m) => s + m.actualCases, 0);
        monthlyForecastCumMap[overlapMonth] = cumToOverlap;
        // Per-month overlap
        monthlyForecastPerMap[overlapMonth] = primary[overlapMonth - 1]?.actualCases ?? 0;

        // Current month + future months: use model forecast data
        let prevCum = cumToOverlap;
        for (let m = overlapMonth + 1; m <= 12; m++) {
          if (forecast.forecastMonthly[m] !== undefined) {
            const cumVal = forecast.forecastMonthly[m];
            monthlyForecastCumMap[m] = cumVal;
            // Individual month = difference in cumulative
            monthlyForecastPerMap[m] = cumVal - prevCum;
            prevCum = cumVal;
          }
        }
      } else {
        // January: no overlap, start from T1 forecast
        for (let m = 1; m <= 12; m++) {
          if (forecast.forecastMonthly[m] !== undefined) {
            monthlyForecastCumMap[m] = forecast.forecastMonthly[m];
            const prev = m > 1 ? (forecast.forecastMonthly[m - 1] ?? 0) : 0;
            monthlyForecastPerMap[m] = forecast.forecastMonthly[m] - prev;
          }
        }
      }
      yearEndForecastTotal = monthlyForecastCumMap[12] ?? forecast.yearEstimate ?? null;
    }

    chartData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const pCases = primary[i]?.actualCases ?? 0;
      const cCases = compare[i]?.actualCases ?? 0;

      if (isCumulative) {
        const pCum = primary.slice(0, m).reduce((s, mm) => s + mm.actualCases, 0);
        const cCum = compare.slice(0, m).reduce((s, mm) => s + mm.actualCases, 0);
        return {
          name: `T${m}`,
          current: pCum > 0 ? pCum : null,
          compare: cCum > 0 ? cCum : null,
          forecast: monthlyForecastCumMap[m] ?? null,
        };
      }
      return {
        name: `T${m}`,
        current: pCases > 0 ? pCases : null,
        compare: cCases > 0 ? cCases : null,
        forecast: monthlyForecastPerMap[m] ?? null,
      };
    });

    lines = [
      { key: 'current', name: `${data.primaryYear}`, colorKey: 'current', width: 2.5 },
      { key: 'compare', name: `${data.compareYear}`, colorKey: 'compare', dash: '4 4', width: 2 },
    ];
    xLabel = 'Tháng';
    titleSuffix = `${data.primaryYear} vs ${data.compareYear}`;
  }

  const chartTitle = isCumulative ? 'Lũy kế số ca' : 'Số ca';
  const showForecastLine = isCurrentYear && isMonthPeriod
    ? !!(forecast || yearEndForecastTotal)               // Monthly: both modes
    : isCumulative && isCurrentYear && !!(forecast || yearEndForecastTotal); // Daily: cumulative only
  const forecastColor = lighten(colors.current, 0.35);

  // Forecast label text
  const forecastLabelText = (() => {
    if (!isCurrentYear || !forecast) return null;
    if (isMonthPeriod && yearEndForecastTotal) {
      return `Dự báo hết năm: ~${fmtNum(yearEndForecastTotal)} ca | T${new Date().getMonth() + 1}: ~${fmtNum(forecast.forecastTotal)} ca`;
    }
    if (isMonthPeriod && !isCumulative) {
      return `Dự báo T${new Date().getMonth() + 1}: ~${fmtNum(forecast.forecastTotal)} ca`;
    }
    return `Dự báo T${new Date().getMonth() + 1}: ~${fmtNum(forecast.forecastTotal)} ca`;
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-800">
          {chartTitle} — {titleSuffix}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          {!isMonthPeriod && onMonthChange && (
            <select
              value={data.selectedMonth}
              onChange={e => handleMonthSelect(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-semibold bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[90px]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          )}
          <Toggle left="Ngày" right="Tháng" value={isMonthPeriod} onChange={handleMonthPeriodChange} />
          <Toggle left="Lũy kế" right="Từng kỳ" value={!isCumulative} onChange={(v) => handleCumulativeChange(!v)} />
        </div>
      </div>
      {/* Color pickers row + help text + data mode label */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-4">
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
            {showForecastLine && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="inline-block w-5 h-0.5 rounded" style={{ background: forecastColor, borderTop: `2px dashed ${forecastColor}` }} />
                <span className="font-medium italic">Dự báo</span>
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-bold text-gray-700">
              {isCumulative ? 'Số liệu lũy kế' : `Số liệu từng ${isMonthPeriod ? 'tháng' : 'ngày'}`}
            </span>
            {forecastLabelText && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                forecast?.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                forecast?.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                📈 {forecastLabelText}
              </span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-gray-400 italic mt-1">Click chuột vào ô màu để chọn màu cho các đường biểu diễn, chọn màu trắng hoặc xám để ẩn.</p>
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
            {showForecastLine && (
              <Line
                type="monotone" dataKey="forecast" name={isMonthPeriod ? `Dự báo ${data.primaryYear}` : `Dự báo T${data.selectedMonth}/${data.primaryYear}`}
                stroke={forecastColor} strokeWidth={2}
                strokeDasharray="6 4" dot={false} connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// --- Revenue Trend Chart (Collapsible) ---
const REVENUE_CHART_KEY = 'sdp_revenue_chart';

const RevenueTrendChart: React.FC<{
  data: StatisticsData;
  fmtMoney: (n: number) => string;
  nav: ChartNavState;
}> = ({ data, fmtMoney, nav }) => {
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  // Use navigation from TrendChart above
  const { isMonthPeriod, isCumulative, colors: savedColors } = nav;
  const selectedMonth = nav.selectedMonth || data.selectedMonth;

  const { primary, compare, currentMonthDaily, previousMonthDaily, compareMonthDaily } = data;
  const currentYear = new Date().getFullYear();
  const isCurrentYear = data.primaryYear === currentYear;
  const missingCount = data.validation?.missingSurgeryNames?.length || 0;

  // Helper: lighten a hex color
  const lighten = (hex: string, amount = 0.4) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `#${[r, g, b].map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('')}`;
  };
  const forecastColor = lighten(savedColors.current, 0.35);

  // When expanded, simulate short loading then show chart
  React.useEffect(() => {
    if (expanded && !ready) {
      const t = setTimeout(() => setReady(true), 400);
      return () => clearTimeout(t);
    }
  }, [expanded, ready]);

  // Reset ready when data changes
  React.useEffect(() => {
    if (expanded) {
      setReady(false);
      const t = setTimeout(() => setReady(true), 300);
      return () => clearTimeout(t);
    }
  }, [data.primaryYear, data.compareYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentMonth = selectedMonth;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? data.primaryYear - 1 : data.primaryYear;

  // Total revenue for header display
  const totalRevPrimary = primary.reduce((s, m) => s + (m.namePriceCost || 0), 0);

  // Build chart data (memoized via useMemo equivalent)
  const { chartData, lines, xLabel, titleSuffix } = React.useMemo(() => {
    if (!ready) return { chartData: [], lines: [], xLabel: '', titleSuffix: '' };

    const colors = savedColors;

    if (!isMonthPeriod) {
      // Daily mode
      const buildByDay = (daily: DailyAggregate[], metric: 'cumulative' | 'daily') => {
        const map: Record<number, number> = {};
        for (const d of daily) {
          const day = parseInt(d.date.split('-')[2]);
          map[day] = metric === 'cumulative' ? d.cumulativeNamePriceCost : d.namePriceCost;
        }
        return map;
      };

      const metric = isCumulative ? 'cumulative' : 'daily';
      const currentMap = buildByDay(currentMonthDaily, metric);
      const prevMap = buildByDay(previousMonthDaily, metric);
      const compareMap = buildByDay(compareMonthDaily, metric);

      const totalDays = new Date(data.primaryYear, currentMonth, 0).getDate();

      // Forecast for daily cumulative
      let forecastMap: Record<number, number> = {};
      if (isCumulative && isCurrentYear) {
        const actualDays = Object.keys(currentMap).map(Number).sort((a, b) => a - b);
        const lastDay = actualDays.length > 0 ? actualDays[actualDays.length - 1] : 0;
        const lastCum = lastDay > 0 ? (currentMap[lastDay] ?? 0) : 0;
        if (lastDay > 0 && lastDay < totalDays && lastCum > 0) {
          const dailyRate = lastCum / lastDay;
          forecastMap[lastDay] = lastCum;
          for (let d = lastDay + 1; d <= totalDays; d++) {
            forecastMap[d] = Math.round(dailyRate * d);
          }
        }
      }

      const cd = Array.from({ length: totalDays }, (_, i) => {
        const day = i + 1;
        return {
          name: String(day),
          current: currentMap[day] ?? null,
          previous: prevMap[day] ?? null,
          compare: compareMap[day] ?? null,
          forecast: forecastMap[day] ?? null,
        };
      });

      return {
        chartData: cd,
        lines: [
          { key: 'current', name: `T${currentMonth}/${data.primaryYear}`, color: colors.current, width: 2.5 },
          { key: 'previous', name: `T${prevMonth}/${prevMonthYear}`, color: colors.previous, dash: '6 3', width: 2 },
          { key: 'compare', name: `T${currentMonth}/${data.compareYear}`, color: colors.compare, dash: '4 4', width: 2 },
        ],
        xLabel: 'Ngày',
        titleSuffix: `Tháng ${currentMonth}/${data.primaryYear}`,
      };
    } else {
      // Monthly mode
      const lastDataMonth = (() => {
        for (let i = 11; i >= 0; i--) {
          if ((primary[i]?.namePriceCost || 0) > 0) return i + 1;
        }
        return 0;
      })();

      // Monthly forecast
      let monthlyForecastCumMap: Record<number, number> = {};
      let monthlyForecastPerMap: Record<number, number> = {};
      const realMonth = new Date().getMonth() + 1;
      if (isCurrentYear && lastDataMonth > 0 && lastDataMonth < 12) {
        const overlapMonth = Math.min(lastDataMonth, realMonth - 1);
        if (overlapMonth >= 1) {
          const cumToOverlap = primary.slice(0, overlapMonth).reduce((s, m) => s + (m.namePriceCost || 0), 0);
          monthlyForecastCumMap[overlapMonth] = cumToOverlap;
          monthlyForecastPerMap[overlapMonth] = primary[overlapMonth - 1]?.namePriceCost || 0;
          const avgMonthly = cumToOverlap / overlapMonth;
          let prevCum = cumToOverlap;
          for (let m = overlapMonth + 1; m <= 12; m++) {
            const val = prevCum + avgMonthly;
            monthlyForecastCumMap[m] = Math.round(val);
            monthlyForecastPerMap[m] = Math.round(avgMonthly);
            prevCum = val;
          }
        }
      }

      const cd = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const pRev = primary[i]?.namePriceCost || 0;
        const cRev = compare[i]?.namePriceCost || 0;

        if (isCumulative) {
          const pCum = primary.slice(0, m).reduce((s, mm) => s + (mm.namePriceCost || 0), 0);
          const cCum = compare.slice(0, m).reduce((s, mm) => s + (mm.namePriceCost || 0), 0);
          return {
            name: `T${m}`,
            current: pCum > 0 ? pCum : null,
            compare: cCum > 0 ? cCum : null,
            forecast: monthlyForecastCumMap[m] ?? null,
          };
        }
        return {
          name: `T${m}`,
          current: pRev > 0 ? pRev : null,
          compare: cRev > 0 ? cRev : null,
          forecast: monthlyForecastPerMap[m] ?? null,
        };
      });

      return {
        chartData: cd,
        lines: [
          { key: 'current', name: `${data.primaryYear}`, color: colors.current, width: 2.5 },
          { key: 'compare', name: `${data.compareYear}`, color: colors.compare, dash: '4 4', width: 2 },
        ],
        xLabel: 'Tháng',
        titleSuffix: `${data.primaryYear} vs ${data.compareYear}`,
      };
    }
  }, [ready, isMonthPeriod, isCumulative, currentMonth, data, primary, compare, currentMonthDaily, previousMonthDaily, compareMonthDaily, isCurrentYear, prevMonth, prevMonthYear, savedColors]);

  const chartTitle = isCumulative ? 'Lũy kế viện phí PT/TT' : 'Viện phí PT/TT';
  const showForecastLine = isCurrentYear && (isCumulative || isMonthPeriod);

  // Forecast label for right side
  const forecastLabelText = (() => {
    if (!isCurrentYear || !showForecastLine) return null;
    // Find last forecast value
    const lastForecast = chartData.length > 0 ? chartData[chartData.length - 1]?.forecast : null;
    if (lastForecast && lastForecast > 0) {
      if (isMonthPeriod) {
        return `Dự báo hết năm: ~${fmtMoney(lastForecast)}`;
      }
      const totalDays = new Date(data.primaryYear, selectedMonth, 0).getDate();
      return `Dự báo T${selectedMonth}: ~${fmtMoney(lastForecast)}`;
    }
    return null;
  })();

  // Collapsed banner
  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="bg-teal-100 rounded-lg p-2">
            <DollarSign className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-teal-800">Biểu đồ Viện phí phẫu thuật, thủ thuật</h3>
            <p className="text-[10px] text-teal-600">
              {totalRevPrimary > 0 ? `Tổng năm ${data.primaryYear}: ${fmtMoney(totalRevPrimary)}` : 'Nhấn để xem chi tiết'}
              {missingCount > 0 && <span className="text-amber-600 ml-2">⚠ {missingCount} PT chưa có giá</span>}
            </p>
          </div>
        </div>
        <span className="text-teal-400 group-hover:text-teal-600 transition-colors text-sm font-bold">
          ▼ Mở rộng
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-teal-200 shadow-sm overflow-hidden">
      {/* Header — no controls, synced from TrendChart above */}
      <div
        className="px-4 py-3 border-b border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 flex items-center justify-between flex-wrap gap-2 cursor-pointer"
        onClick={() => setExpanded(false)}
      >
        <h3 className="text-sm font-bold text-teal-800 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          {chartTitle} — {titleSuffix}
          <span className="text-teal-400 text-xs font-normal ml-1">▲ Thu gọn</span>
        </h3>
      </div>

      {/* Loading or Chart */}
      {!ready ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <p className="mt-3 text-sm text-teal-600 font-medium">Đang tính toán viện phí...</p>
          <p className="text-[10px] text-gray-400 mt-1">Áp giá cho từng ca phẫu thuật</p>
        </div>
      ) : (
        <>
          {/* Legend + Forecast label */}
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <div className="flex items-center gap-4">
                {lines.map((l: any) => (
                  <span key={l.key} className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 rounded" style={{
                      background: l.color,
                      borderTop: l.dash ? `2px dashed ${l.color}` : `2px solid ${l.color}`
                    }} />
                    <span className="font-medium">{l.name}</span>
                  </span>
                ))}
                {showForecastLine && (
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-4 h-0.5 rounded" style={{ borderTop: `2px dashed ${forecastColor}` }} />
                    <span className="font-medium italic">Dự báo</span>
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs font-bold text-gray-700">
                  {isCumulative ? 'Viện phí lũy kế' : `Viện phí từng ${isMonthPeriod ? 'tháng' : 'ngày'}`}
                </span>
                {showForecastLine && forecastLabelText && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] bg-teal-100 text-teal-700">
                    📈 {forecastLabelText}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} label={{ value: xLabel, position: 'insideBottomRight', offset: -5, style: { fontSize: 10, fill: '#9ca3af' } }} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(v: number) => fmtMoney(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: any, name: string) => [value !== null ? fmtMoney(value) : '—', name]}
                  labelFormatter={(label) => `${xLabel} ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {lines.map((l: any) => (
                  <Line
                    key={l.key} type="monotone" dataKey={l.key} name={l.name}
                    stroke={l.color} strokeWidth={l.width}
                    strokeDasharray={l.dash} dot={{ r: 2 }} connectNulls={false}
                  />
                ))}
                {showForecastLine && (
                  <Line
                    type="monotone" dataKey="forecast" name="Dự báo"
                    stroke={forecastColor} strokeWidth={2}
                    strokeDasharray="6 4" dot={false} connectNulls={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Missing price warning */}
          {missingCount > 0 && (
            <div className="px-4 pb-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>
                  <strong>{missingCount}</strong> phẫu thuật chưa có giá nên chưa tính vào biểu đồ. Bổ sung tại tab Cấu hình.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// --- Surgery Name Breakdown Table ---
interface SurgeryNameBreakdownProps {
  data: StatisticsData;
  nav: ChartNavState;
  fmtNum: (n: number) => string;
  fmtMoney: (n: number) => string;
  chapters: ChapterCatalog[];
  profiles: SurgeryProfile[];
}

const ROWS_PER_PAGE = 25;

const SurgeryNameBreakdown: React.FC<SurgeryNameBreakdownProps> = ({ data, nav, fmtNum, fmtMoney, chapters, profiles }) => {
  const { primary, compare } = data;
  const isMonthPeriod = nav.isMonthPeriod;
  const selectedMonth = nav.selectedMonth;
  const [showRevenue, setShowRevenue] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);

  // --- Filter state (persistent) ---
  const [filterMode, setFilterMode] = useState<PTTTFilterMode>(() => {
    return (localStorage.getItem('sdp_pttt_filter_mode') as PTTTFilterMode) || 'all';
  });
  const [selectedChapters, setSelectedChapters] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sdp_pttt_chapters') || '[]'); } catch { return []; }
  });
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    return localStorage.getItem('sdp_pttt_profile_id') || '';
  });
  const [showChapterDropdown, setShowChapterDropdown] = useState(false);

  // Persist filter state
  const updateFilterMode = (mode: PTTTFilterMode) => {
    setFilterMode(mode);
    localStorage.setItem('sdp_pttt_filter_mode', mode);
    setPage(0);
  };
  const updateSelectedChapters = (chaps: string[]) => {
    setSelectedChapters(chaps);
    localStorage.setItem('sdp_pttt_chapters', JSON.stringify(chaps));
    setPage(0);
  };
  const updateSelectedProfileId = (id: string) => {
    setSelectedProfileId(id);
    localStorage.setItem('sdp_pttt_profile_id', id);
    setPage(0);
  };

  // Build maTuongDuongByName across all months
  const globalMaTuongDuongByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of primary) {
      if (m.maTuongDuongByName) {
        Object.assign(map, m.maTuongDuongByName);
      }
    }
    return map;
  }, [primary]);

  const sourceData = showCompare ? compare : primary;
  const activeYear = showCompare ? data.compareYear : data.primaryYear;

  // Compute rows: aggregate by surgery name
  const rows = useMemo(() => {
    const nameMap = new Map<string, { name: string; monthly: number[]; total: number }>();
    const months = isMonthPeriod ? sourceData : sourceData.filter(m => m.month === selectedMonth);

    for (const m of months) {
      const source: Record<string, number> = showRevenue ? (m.namePriceCostByName || {}) : m.byName;
      for (const [name, value] of Object.entries(source)) {
        if (!nameMap.has(name)) {
          nameMap.set(name, { name, monthly: new Array(12).fill(0), total: 0 });
        }
        const entry = nameMap.get(name)!;
        const v = Number(value) || 0;
        entry.monthly[m.month - 1] += v;
        entry.total += v;
      }
    }

    const arr = Array.from(nameMap.values());
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [sourceData, isMonthPeriod, selectedMonth, showRevenue]);

  // Apply profile/chapter filter BEFORE search
  const modeFiltered = useMemo(() => {
    if (filterMode === 'all') return rows;

    if (filterMode === 'chapter' && selectedChapters.length > 0) {
      return rows.filter(r => {
        const maTD = globalMaTuongDuongByName[r.name];
        if (!maTD) return false;
        const chapterCode = maTD.substring(0, 2);
        return selectedChapters.includes(chapterCode);
      });
    }

    if (filterMode === 'profile' && selectedProfileId) {
      const profile = profiles.find(p => p.id === selectedProfileId);
      if (!profile) return rows;
      const profileSet = new Set(profile.surgeryNames);
      return rows.filter(r => profileSet.has(r.name.toLowerCase()));
    }

    return rows;
  }, [rows, filterMode, selectedChapters, selectedProfileId, profiles, globalMaTuongDuongByName]);

  // Search filter
  const filtered = useMemo(() => {
    if (!searchText.trim()) return modeFiltered;
    const q = searchText.trim().toLowerCase();
    return modeFiltered.filter(r => r.name.toLowerCase().includes(q));
  }, [modeFiltered, searchText]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePageIdx = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePageIdx * ROWS_PER_PAGE, (safePageIdx + 1) * ROWS_PER_PAGE);

  // Column headers
  const colHeaders = isMonthPeriod
    ? Array.from({ length: 12 }, (_, i) => `T${i + 1}`)
    : (() => {
        // Daily: we show by day of that month
        const daysInMonth = new Date(activeYear, selectedMonth, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
      })();

  // For daily mode, we need to reaggregate per day from raw data. But since byName is only available monthly,
  // in monthly mode we show T1-T12. For daily mode, we show the single month's total only.
  const isDailyMode = !isMonthPeriod;

  // Grand total
  const grandTotal = filtered.reduce((s, r) => s + r.total, 0);

  // Format value
  const fmt = (v: number) => {
    if (v === 0) return '—';
    if (showRevenue) return fmtMoney(v);
    return fmtNum(v);
  };

  return (
    <CollapsibleFrame
      title={`Thống kê theo PTTT — ${activeYear}${isDailyMode ? ` (T${selectedMonth})` : ''}`}
      defaultOpen={false}
      storageKey="sdp_name_table"
      headerRight={
        <div className="flex items-center gap-3">
          <Toggle left={`${data.primaryYear}`} right={`${data.compareYear}`} value={showCompare} onChange={v => { setShowCompare(v); setPage(0); }} />
          <Toggle left="Số lượng" right="Viện phí" value={showRevenue} onChange={v => { setShowRevenue(v); setPage(0); }} />
        </div>
      }
    >
      {/* Filter bar */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white space-y-2">
        {/* Radio group + inline dropdown */}
        <div className="flex flex-wrap items-center gap-4">
          {[
            { value: 'all' as PTTTFilterMode, label: 'Tất cả' },
            { value: 'chapter' as PTTTFilterMode, label: 'Theo chuyên khoa' },
            { value: 'profile' as PTTTFilterMode, label: 'Theo Profile' },
          ].map(opt => (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="radio"
                name="pttt-filter-mode"
                checked={filterMode === opt.value}
                onChange={() => updateFilterMode(opt.value)}
                className="w-3.5 h-3.5 text-primary-600 focus:ring-primary-500"
              />
              <span className={filterMode === opt.value ? 'font-semibold text-primary-700' : 'text-gray-600'}>
                {opt.label}
              </span>
            </label>
          ))}

          {/* Chapter multi-select (inline) */}
          {filterMode === 'chapter' && (
            <div className="relative">
              <button
                onClick={() => setShowChapterDropdown(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-w-[180px]"
              >
                <span className="text-gray-600 truncate">
                  {selectedChapters.length === 0
                    ? 'Chọn chuyên khoa...'
                    : `${selectedChapters.length} chuyên khoa đã chọn`
                  }
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400 ml-auto shrink-0" />
              </button>
              {showChapterDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-60 overflow-y-auto min-w-[300px]">
                  <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (selectedChapters.length === chapters.length) {
                          updateSelectedChapters([]);
                        } else {
                          updateSelectedChapters(chapters.map(c => c.ma_chuong));
                        }
                      }}
                      className="text-[10px] text-primary-600 hover:text-primary-800 font-medium"
                    >
                      {selectedChapters.length === chapters.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                    <button onClick={() => setShowChapterDropdown(false)} className="text-[10px] text-gray-400 hover:text-gray-600">
                      Đóng
                    </button>
                  </div>
                  {chapters.map(ch => (
                    <label key={ch.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selectedChapters.includes(ch.ma_chuong)}
                        onChange={e => {
                          if (e.target.checked) {
                            updateSelectedChapters([...selectedChapters, ch.ma_chuong]);
                          } else {
                            updateSelectedChapters(selectedChapters.filter(c => c !== ch.ma_chuong));
                          }
                        }}
                        className="w-3 h-3 rounded text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-gray-700 truncate">
                        <span className="font-mono text-gray-400 mr-1">{ch.ma_chuong}</span>
                        {ch.ten_chuong}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Profile select (inline) */}
          {filterMode === 'profile' && (
            <select
              value={selectedProfileId}
              onChange={e => updateSelectedProfileId(e.target.value)}
              className="px-3 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 min-w-[180px]"
            >
              <option value="">Chọn profile...</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.surgeryNames.length} KT)</option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setPage(0); }}
            placeholder="Tìm tên PTTT..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 focus:border-primary-300"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[200px] z-10">
                Tên PTTT
                <span className="text-[9px] text-gray-400 font-normal ml-1">({filtered.length})</span>
              </th>
              {isMonthPeriod ? (
                colHeaders.map((h, i) => (
                  <th key={i} className="text-center px-2 py-2 font-semibold text-gray-600 min-w-[55px]">{h}</th>
                ))
              ) : (
                <th className="text-center px-3 py-2 font-semibold text-gray-600 min-w-[80px]">T{selectedMonth}</th>
              )}
              <th className="text-center px-3 py-2 font-bold text-gray-800 bg-primary-50 min-w-[70px]">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={row.name} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-700 sticky left-0 bg-white z-10 truncate max-w-[250px]" title={row.name}>
                  <span className="text-[9px] text-gray-400 mr-1">{safePageIdx * ROWS_PER_PAGE + ri + 1}.</span>
                  {row.name}
                </td>
                {isMonthPeriod ? (
                  row.monthly.map((v, ci) => (
                    <td key={ci} className="text-center px-2 py-1.5 text-gray-600 tabular-nums">
                      {v > 0 ? fmt(v) : <span className="text-gray-200">·</span>}
                    </td>
                  ))
                ) : (
                  <td className="text-center px-3 py-1.5 text-gray-600 tabular-nums font-semibold">
                    {row.total > 0 ? fmt(row.total) : '—'}
                  </td>
                )}
                <td className="text-center px-3 py-1.5 font-bold text-primary-800 bg-primary-50 tabular-nums">
                  {row.total > 0 ? fmt(row.total) : '—'}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={isMonthPeriod ? 14 : 3} className="text-center py-8 text-gray-400 text-sm">
                  {searchText.trim() ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu'}
                </td>
              </tr>
            )}
            {/* Grand total row */}
            {filtered.length > 0 && (
              <tr className="bg-gray-50 font-bold border-t border-gray-300">
                <td className="px-3 py-2 text-gray-800 sticky left-0 bg-gray-50 z-10">Tổng cộng</td>
                {isMonthPeriod ? (
                  Array.from({ length: 12 }, (_, ci) => {
                    const colTotal = filtered.reduce((s, r) => s + r.monthly[ci], 0);
                    return (
                      <td key={ci} className="text-center px-2 py-2 text-gray-700 tabular-nums">
                        {colTotal > 0 ? fmt(colTotal) : '—'}
                      </td>
                    );
                  })
                ) : (
                  <td className="text-center px-3 py-2 text-gray-700 tabular-nums">
                    {grandTotal > 0 ? fmt(grandTotal) : '—'}
                  </td>
                )}
                <td className="text-center px-3 py-2 text-primary-800 bg-primary-50 tabular-nums">
                  {grandTotal > 0 ? fmt(grandTotal) : '—'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-[10px] text-gray-500">
            {safePageIdx * ROWS_PER_PAGE + 1}–{Math.min((safePageIdx + 1) * ROWS_PER_PAGE, filtered.length)} / {filtered.length} mục
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={safePageIdx === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >‹</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pIdx: number;
              if (totalPages <= 7) {
                pIdx = i;
              } else if (safePageIdx < 4) {
                pIdx = i;
              } else if (safePageIdx > totalPages - 5) {
                pIdx = totalPages - 7 + i;
              } else {
                pIdx = safePageIdx - 3 + i;
              }
              return (
                <button
                  key={pIdx}
                  onClick={() => setPage(pIdx)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    pIdx === safePageIdx
                      ? 'bg-primary-700 text-white border-primary-700'
                      : 'border-gray-200 hover:bg-gray-100'
                  }`}
                >{pIdx + 1}</button>
              );
            })}
            <button
              disabled={safePageIdx >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >›</button>
          </div>
        </div>
      )}
    </CollapsibleFrame>
  );
};


export const StatsSummary: React.FC<Props> = ({ data, onMonthChange, chapters, profiles, surgeryNamePrices }) => {
  const { primary, compare, currentMonthDaily, previousMonthDaily, compareMonthDaily, forecast } = data;

  // Shared chart navigation state (synced from TrendChart to RevenueTrendChart)
  const [chartNav, setChartNav] = useState<ChartNavState>(() => {
    const saved = loadChartSettings();
    return {
      isMonthPeriod: saved.isMonthPeriod ?? false,
      isCumulative: saved.isCumulative ?? true,
      selectedMonth: saved.selectedMonth ?? data.selectedMonth,
      colors: saved.colors ?? { current: '#0066CC', previous: '#E63946', compare: '#2A9D8F' },
    };
  });

  // Total aggregations
  const totalCasesPrimary = primary.reduce((s, m) => s + m.actualCases, 0);
  const totalCasesCompare = compare.reduce((s, m) => s + m.actualCases, 0);
  const totalEquivPrimary = primary.reduce((s, m) => s + m.equivalentCases, 0);
  const totalSvcCostPrimary = primary.reduce((s, m) => s + m.serviceCost, 0);
  const totalSvcCostCompare = compare.reduce((s, m) => s + m.serviceCost, 0);
  const totalLabCostPrimary = primary.reduce((s, m) => s + m.laborCost, 0);
  const totalLabCostCompare = compare.reduce((s, m) => s + m.laborCost, 0);
  const totalNamePricePrimary = primary.reduce((s, m) => s + (m.namePriceCost || 0), 0);
  const totalNamePriceCompare = compare.reduce((s, m) => s + (m.namePriceCost || 0), 0);

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
      label: `🔮 Dự báo T${new Date().getMonth() + 1}/${data.primaryYear}`,
      value: forecast ? fmtNum(forecast.forecastTotal) : '—',
      change: forecast?.completionVsLastYear ? forecast.completionVsLastYear - 100 : null,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-purple-600 bg-purple-50',
      tooltip: forecast
        ? `V5+ Model: ${forecast.modelNote}. ${forecast.daysElapsed}/${forecast.totalDaysInMonth} ngày T${new Date().getMonth() + 1}. ${forecast.yearEstimate ? `Ước lượng năm: ~${fmtNum(forecast.yearEstimate)} ca.` : ''} Độ tin cậy: ${forecast.confidence === 'high' ? 'Cao' : forecast.confidence === 'medium' ? 'TB' : 'Thấp'}.`
        : data.primaryYear !== new Date().getFullYear()
          ? 'Chỉ dự báo khi chọn năm hiện tại'
          : 'Cần ≥3 ngày dữ liệu để dự báo',
    },
    {
      label: 'Viện phí PT/TT',
      value: totalNamePricePrimary > 0 ? fmtMoney(totalNamePricePrimary) : '—',
      change: totalNamePricePrimary > 0 ? calcChange(totalNamePricePrimary, totalNamePriceCompare) : null,
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-teal-600 bg-teal-50',
      tooltip: totalNamePricePrimary === 0
        ? 'Chưa có giá theo tên PT. Vui lòng cấu hình danh mục giá.'
        : 'Tổng viện phí PT/TT theo danh mục giá tên phẫu thuật',
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
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
      <CollapsibleFrame title={`Tổng hợp theo tháng — ${data.primaryYear}`} storageKey="sdp_monthly_table">
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

              {/* Row: Viện phí PT/TT (name-based) */}
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-teal-700 sticky left-0 bg-white">Viện phí PT/TT (tr)</td>
                {primary.map((m, i) => (
                  <td key={i} className="text-center px-2 py-2 text-gray-600">
                    {(m.namePriceCost || 0) > 0 ? fmtMoney(m.namePriceCost || 0) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="text-center px-3 py-2 font-bold text-teal-800 bg-teal-50">{fmtMoney(totalNamePricePrimary)}</td>
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
      </CollapsibleFrame>

      {/* Trend Chart — Day/Month + Cumulative/Daily toggles */}
      <TrendChart data={data} forecast={forecast} fmtNum={fmtNum} fmtPct={fmtPct} onMonthChange={onMonthChange} onNavChange={setChartNav} />

      {/* Revenue Trend Chart — Collapsible */}
      <RevenueTrendChart data={data} fmtMoney={fmtMoney} nav={chartNav} />

      {/* Surgery Type Breakdown Table */}
      <CollapsibleFrame title={`Chi tiết theo loại PT/TT — ${data.primaryYear} (số ca)`} storageKey="sdp_type_table">
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
      </CollapsibleFrame>

      {/* Surgery Name Breakdown Table — NEW */}
      <SurgeryNameBreakdown data={data} nav={chartNav} fmtNum={fmtNum} fmtMoney={fmtMoney} chapters={chapters} profiles={profiles} />
    </div>
  );
};
