/**
 * StatsSummary — KPI cards + Monthly summary table + Daily chart + Surgery type table
 */
import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, Calculator, DollarSign, Target, Minus, Info, Download, Loader2, AlertTriangle, ChevronDown, ChevronRight, Search, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { StatisticsData, DailyAggregate, LOAI_PTTT_ORDER, LOAI_PTTT_LABELS, ChapterCatalog, SurgeryProfile, SurgeryNamePrice, PTTTFilterMode } from '../../types';
import { exportStatisticsToExcel } from '../../services/statisticsService';
import { isRecordGayTe } from '../../services/specialtyComparisonService';

interface Props {
  data: StatisticsData;
  onMonthChange?: (month: number) => void;
  chapters: ChapterCatalog[];
  profiles: SurgeryProfile[];
  surgeryNamePrices: SurgeryNamePrice[];
  isDataLoading?: boolean;
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

type ChartType = 'line' | 'bar';

interface ChartSettings {
  isMonthPeriod: boolean;
  isCumulative: boolean;
  colors: { current: string; previous: string; compare: string };
  selectedMonth: number;
  chartType: ChartType;
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
  chartType: ChartType;
}

const TrendChart: React.FC<{
  data: StatisticsData;
  forecast: StatisticsData['forecast'];
  fmtNum: (n: number) => string;
  fmtPct: (n: number | null) => string;
  onMonthChange?: (month: number) => void;
  onNavChange?: (nav: ChartNavState) => void;
  chapters: ChapterCatalog[];
  profiles: SurgeryProfile[];
  isDataLoading?: boolean;
}> = ({ data, forecast, fmtNum, fmtPct, onMonthChange, onNavChange, chapters, profiles, isDataLoading }) => {
  const saved = loadChartSettings();
  const [isMonthPeriod, setIsMonthPeriod] = useState(saved.isMonthPeriod ?? false);
  const [isCumulative, setIsCumulative] = useState(saved.isCumulative ?? true);
  const [chartType, setChartType] = useState<ChartType>(saved.chartType ?? 'line');

  // Local month state — updates IMMEDIATELY on user selection,
  // while data.selectedMonth only updates after data loads
  const [localSelectedMonth, setLocalSelectedMonth] = useState(data.selectedMonth);

  // Sync local month when data actually arrives with the new month
  React.useEffect(() => {
    setLocalSelectedMonth(data.selectedMonth);
  }, [data.selectedMonth]);

  // Is the chart waiting for data for a different month?
  const isMonthLoading = localSelectedMonth !== data.selectedMonth;

  // --- Chart filter state (persistent) ---
  const [chartFilterMode, setChartFilterMode] = useState<PTTTFilterMode>(() => {
    return (localStorage.getItem('sdp_chart_filter_mode') as PTTTFilterMode) || 'all';
  });
  const [chartSelectedChapters, setChartSelectedChapters] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sdp_chart_chapters') || '[]'); } catch { return []; }
  });
  const [chartSelectedProfileId, setChartSelectedProfileId] = useState<string>(() => {
    return localStorage.getItem('sdp_chart_profile_id') || '';
  });
  const [showChartChapterDropdown, setShowChartChapterDropdown] = useState(false);

  const updateChartFilterMode = (mode: PTTTFilterMode) => {
    setChartFilterMode(mode);
    localStorage.setItem('sdp_chart_filter_mode', mode);
  };
  const updateChartSelectedChapters = (chaps: string[]) => {
    setChartSelectedChapters(chaps);
    localStorage.setItem('sdp_chart_chapters', JSON.stringify(chaps));
  };
  const updateChartSelectedProfileId = (id: string) => {
    setChartSelectedProfileId(id);
    localStorage.setItem('sdp_chart_profile_id', id);
    // Reset surgery name when switching profile
    setChartSelectedSurgeryName('');
    localStorage.removeItem('sdp_chart_surgery_name');
  };

  // Selected surgery name within profile (empty = show profile total)
  const [chartSelectedSurgeryName, setChartSelectedSurgeryName] = useState<string>(() => {
    return localStorage.getItem('sdp_chart_surgery_name') || '';
  });
  const updateChartSelectedSurgeryName = (name: string) => {
    setChartSelectedSurgeryName(name);
    if (name) {
      localStorage.setItem('sdp_chart_surgery_name', name);
    } else {
      localStorage.removeItem('sdp_chart_surgery_name');
    }
  };

  // Build global maTuongDuongByName for chapter filter
  const globalMaTuongDuongByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of data.primary) {
      if (m.maTuongDuongByName) {
        Object.assign(map, m.maTuongDuongByName);
      }
    }
    // Also check compare data
    for (const m of data.compare) {
      if (m.maTuongDuongByName) {
        for (const [k, v] of Object.entries(m.maTuongDuongByName as Record<string, string>)) {
          if (!map[k]) map[k] = v;
        }
      }
    }
    return map;
  }, [data.primary, data.compare]);

  // Filter function: given byName, return filtered total cases
  const isFilterActive = chartFilterMode !== 'all';
  const filterByName = useMemo(() => {
    if (!isFilterActive) return null;

    if (chartFilterMode === 'chapter' && chartSelectedChapters.length > 0) {
      return (byName: Record<string, number>) => {
        let total = 0;
        for (const [name, count] of Object.entries(byName)) {
          const maTD = globalMaTuongDuongByName[name];
          if (maTD && chartSelectedChapters.includes(maTD.substring(0, 2))) {
            total += count;
          }
        }
        return total;
      };
    }

    if (chartFilterMode === 'profile' && chartSelectedProfileId) {
      const profile = profiles.find(p => p.id === chartSelectedProfileId);
      if (!profile) return null;

      // If a specific surgery name is selected, filter to just that one
      if (chartSelectedSurgeryName) {
        const targetName = chartSelectedSurgeryName.toLowerCase();
        return (byName: Record<string, number>) => {
          for (const [name, count] of Object.entries(byName)) {
            if (name.toLowerCase() === targetName) return count;
          }
          return 0;
        };
      }

      // Otherwise filter to the whole profile
      const profileSet = new Set(profile.surgeryNames);
      return (byName: Record<string, number>) => {
        let total = 0;
        for (const [name, count] of Object.entries(byName)) {
          if (profileSet.has(name.toLowerCase())) {
            total += count;
          }
        }
        return total;
      };
    }

    return null;
  }, [isFilterActive, chartFilterMode, chartSelectedChapters, chartSelectedProfileId, chartSelectedSurgeryName, profiles, globalMaTuongDuongByName]);

  // Get filter label for chart title
  const filterLabel = useMemo(() => {
    if (chartFilterMode === 'chapter' && chartSelectedChapters.length > 0) {
      if (chartSelectedChapters.length <= 2) {
        return chartSelectedChapters.map(c => {
          const ch = chapters.find(ch => ch.ma_chuong === c);
          return ch ? ch.ten_chuong : c;
        }).join(', ');
      }
      return `${chartSelectedChapters.length} chuyên khoa`;
    }
    if (chartFilterMode === 'profile' && chartSelectedProfileId) {
      const profile = profiles.find(p => p.id === chartSelectedProfileId);
      if (!profile) return '';
      if (chartSelectedSurgeryName) {
        return chartSelectedSurgeryName;
      }
      return profile.name;
    }
    return '';
  }, [chartFilterMode, chartSelectedChapters, chartSelectedProfileId, chartSelectedSurgeryName, chapters, profiles]);

  const [colors, setColors] = useState(saved.colors ?? { current: '#0066CC', previous: '#E63946', compare: '#2A9D8F' });
  const [openColorPicker, setOpenColorPicker] = useState<string | null>(null);

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
    const nav: ChartNavState = { isMonthPeriod, isCumulative, selectedMonth: data.selectedMonth, colors, chartType, ...patch };
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
    setLocalSelectedMonth(m); // Update local immediately for instant UI feedback
    saveChartSettings({ selectedMonth: m });
    onMonthChange?.(m);
    emitNav({ selectedMonth: m });
  };

  // Emit initial state on mount
  React.useEffect(() => {
    emitNav({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { primary: rawPrimary, compare: rawCompare, currentMonthDaily, previousMonthDaily, compareMonthDaily } = data;

  // Apply filter to monthly data if filter is active
  const primary = useMemo(() => {
    if (!filterByName) return rawPrimary;
    return rawPrimary.map(m => ({
      ...m,
      actualCases: filterByName(m.byName),
    }));
  }, [rawPrimary, filterByName]);

  const compare = useMemo(() => {
    if (!filterByName) return rawCompare;
    return rawCompare.map(m => ({
      ...m,
      actualCases: filterByName(m.byName),
    }));
  }, [rawCompare, filterByName]);

  // Apply filter to daily data if filter is active
  const filteredCurrentMonthDaily = useMemo(() => {
    if (!filterByName || !currentMonthDaily) return currentMonthDaily;
    let cum = 0;
    return currentMonthDaily.map(d => {
      const cases = filterByName(d.byName);
      cum += cases;
      return { ...d, cases, cumulative: cum };
    });
  }, [currentMonthDaily, filterByName]);

  const filteredPreviousMonthDaily = useMemo(() => {
    if (!filterByName || !previousMonthDaily) return previousMonthDaily;
    let cum = 0;
    return previousMonthDaily.map(d => {
      const cases = filterByName(d.byName);
      cum += cases;
      return { ...d, cases, cumulative: cum };
    });
  }, [previousMonthDaily, filterByName]);

  const filteredCompareMonthDaily = useMemo(() => {
    if (!filterByName || !compareMonthDaily) return compareMonthDaily;
    let cum = 0;
    return compareMonthDaily.map(d => {
      const cases = filterByName(d.byName);
      cum += cases;
      return { ...d, cases, cumulative: cum };
    });
  }, [compareMonthDaily, filterByName]);

  const currentMonth = data.selectedMonth;
  // Use local month for display purposes (title, etc.)
  const displayMonth = localSelectedMonth;
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
    const currentMap = buildByDay(filteredCurrentMonthDaily, metric);
    const prevMap = buildByDay(filteredPreviousMonthDaily, metric);
    const compareMap = buildByDay(filteredCompareMonthDaily, metric);

    const totalDays = new Date(data.primaryYear, currentMonth, 0).getDate();

    // Forecast line for daily cumulative mode
    let forecastMap: Record<number, number> = {};
    if (isCumulative && isCurrentYear && forecast) {
      const actualDays = Object.keys(currentMap).map(Number).sort((a, b) => a - b);
      const lastDay = actualDays.length > 0 ? actualDays[actualDays.length - 1] : 0;
      const lastCum = lastDay > 0 ? (currentMap[lastDay] ?? 0) : 0;
      if (lastDay > 0 && lastDay < totalDays) {
        const dailyRate = lastCum / lastDay;
        // Start forecast AFTER last actual day — no overlap
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
        // Start forecast AFTER last complete month — no overlap
        let prevCum = primary.slice(0, overlapMonth).reduce((s, m) => s + m.actualCases, 0);

        // Current month + future months: use model forecast data
        for (let m = overlapMonth + 1; m <= 12; m++) {
          if (forecast.forecastMonthly[m] !== undefined) {
            const cumVal = forecast.forecastMonthly[m];
            monthlyForecastCumMap[m] = cumVal;
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
  // Build titleSuffix using local month for immediate feedback
  const displayTitleSuffix = !isMonthPeriod
    ? `Tháng ${displayMonth}/${data.primaryYear}`
    : titleSuffix;
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
          {chartTitle} — {displayTitleSuffix}
          {isMonthLoading && (
            <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">
              ⏳ Đang tải...
            </span>
          )}
          {filterLabel && !isMonthLoading && (
            <span className="ml-2 text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
              🔍 {filterLabel}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          {!isMonthPeriod && onMonthChange && (
            <select
              value={localSelectedMonth}
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
          {/* Chart type toggle: Line / Bar */}
          <div className="flex items-center bg-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => { setChartType('line'); saveChartSettings({ chartType: 'line' }); emitNav({ chartType: 'line' }); }}
              className={`p-1.5 rounded-md transition-all ${chartType === 'line' ? 'bg-primary-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title="Biểu đồ đường"
            >
              <LineChartIcon size={14} />
            </button>
            <button
              onClick={() => { setChartType('bar'); saveChartSettings({ chartType: 'bar' }); emitNav({ chartType: 'bar' }); }}
              className={`p-1.5 rounded-md transition-all ${chartType === 'bar' ? 'bg-primary-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              title="Biểu đồ cột"
            >
              <BarChart3 size={14} />
            </button>
          </div>
        </div>
      </div>
      {/* Filter bar — chapter/profile */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white">
        <div className="flex flex-wrap items-center gap-4">
          {[
            { value: 'all' as PTTTFilterMode, label: 'Tất cả' },
            { value: 'chapter' as PTTTFilterMode, label: 'Theo chuyên khoa' },
            { value: 'profile' as PTTTFilterMode, label: 'Theo Profile' },
          ].map(opt => (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="radio"
                name="chart-filter-mode"
                checked={chartFilterMode === opt.value}
                onChange={() => updateChartFilterMode(opt.value)}
                className="w-3.5 h-3.5 text-primary-600 focus:ring-primary-500"
              />
              <span className={chartFilterMode === opt.value ? 'font-semibold text-primary-700' : 'text-gray-600'}>
                {opt.label}
              </span>
            </label>
          ))}

          {/* Chapter multi-select */}
          {chartFilterMode === 'chapter' && (
            <div className="relative">
              <button
                onClick={() => setShowChartChapterDropdown(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border-[1.5px] border-gray-400 rounded-lg hover:bg-gray-50 hover:border-gray-500 transition-colors min-w-[180px]"
              >
                <span className="text-gray-600 truncate">
                  {chartSelectedChapters.length === 0
                    ? 'Chọn chuyên khoa...'
                    : `${chartSelectedChapters.length} chuyên khoa đã chọn`
                  }
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400 ml-auto shrink-0" />
              </button>
              {showChartChapterDropdown && (
                <>
                <div className="fixed inset-0 z-20" onClick={() => setShowChartChapterDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-60 overflow-y-auto min-w-[300px]">
                  <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                    <button
                      onClick={() => {
                        if (chartSelectedChapters.length === chapters.length) {
                          updateChartSelectedChapters([]);
                        } else {
                          updateChartSelectedChapters(chapters.map(c => c.ma_chuong));
                        }
                      }}
                      className="text-[10px] text-primary-600 hover:text-primary-800 font-medium"
                    >
                      {chartSelectedChapters.length === chapters.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                    <button onClick={() => setShowChartChapterDropdown(false)} className="text-[10px] text-gray-400 hover:text-gray-600">
                      Đóng
                    </button>
                  </div>
                  {chapters.map(ch => (
                    <label key={ch.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={chartSelectedChapters.includes(ch.ma_chuong)}
                        onChange={e => {
                          if (e.target.checked) {
                            updateChartSelectedChapters([...chartSelectedChapters, ch.ma_chuong]);
                          } else {
                            updateChartSelectedChapters(chartSelectedChapters.filter(c => c !== ch.ma_chuong));
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
                </>
              )}
            </div>
          )}

          {/* Profile select */}
          {chartFilterMode === 'profile' && (
            <select
              value={chartSelectedProfileId}
              onChange={e => updateChartSelectedProfileId(e.target.value)}
              className="px-3 py-1.5 text-xs border-[1.5px] border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 min-w-[180px]"
            >
              <option value="">Chọn profile...</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.surgeryNames.length} KT)</option>
              ))}
            </select>
          )}

          {/* Surgery name within profile */}
          {chartFilterMode === 'profile' && chartSelectedProfileId && (() => {
            const profile = profiles.find(p => p.id === chartSelectedProfileId);
            if (!profile || profile.surgeryNames.length === 0) return null;
            return (
              <select
                value={chartSelectedSurgeryName}
                onChange={e => updateChartSelectedSurgeryName(e.target.value)}
                className="px-3 py-1.5 text-xs border-[1.5px] border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 min-w-[200px] max-w-[320px]"
              >
                <option value="">Tất cả KT ({profile.surgeryNames.length})</option>
                {profile.surgeryNames.slice().sort().map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            );
          })()}


        </div>
      </div>
      {/* Color pickers row + help text + data mode label */}
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-3 flex-wrap">
            {lines.map(l => {
              const activeColor = colors[l.colorKey];
              const isOpen = openColorPicker === l.key;
              const PRESET_COLORS = [
                '#0066CC', '#E63946', '#2A9D8F', '#F59E0B',
                '#8B5CF6', '#06B6D4', '#EC4899', '#10B981',
                '#F97316', '#6366F1', '#14B8A6', '#EF4444',
                '#3B82F6', '#A855F7', '#84CC16', '#D946EF',
              ];
              return (
                <div key={l.key} className="relative flex items-center gap-1.5">
                  {/* Color swatch trigger */}
                  <button
                    onClick={() => setOpenColorPicker(isOpen ? null : l.key)}
                    className="w-5 h-5 rounded border-2 cursor-pointer transition-all hover:scale-110"
                    style={{
                      backgroundColor: activeColor,
                      borderColor: isOpen ? '#1e293b' : '#d1d5db',
                    }}
                    title="Chọn màu"
                  />
                  <span className="font-medium">{l.name}</span>
                  {/* Popover color palette */}
                  {isOpen && (
                    <>
                      {/* Backdrop to close */}
                      <div className="fixed inset-0 z-40" onClick={() => setOpenColorPicker(null)} />
                      <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-2 w-[156px]">
                        <div className="grid grid-cols-4 gap-1.5">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => { updateColor(l.colorKey, c); setOpenColorPicker(null); }}
                              className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                              style={{
                                backgroundColor: c,
                                borderColor: activeColor === c ? '#1e293b' : 'transparent',
                                boxShadow: activeColor === c ? `0 0 0 2px white, 0 0 0 3px ${c}` : 'none',
                              }}
                              title={c}
                            />
                          ))}
                        </div>
                        {/* Custom color picker */}
                        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                          <span className="relative">
                            <input
                              type="color"
                              value={activeColor}
                              onChange={e => updateColor(l.colorKey, e.target.value)}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <span
                              className="block w-8 h-8 rounded-lg border border-dashed border-gray-300 cursor-pointer"
                              style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                            />
                          </span>
                          <span className="text-[10px] text-gray-400">Tùy chỉnh</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {showForecastLine && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="inline-block w-5 h-0.5 rounded" style={{ background: forecastColor, borderTop: `2px dashed ${forecastColor}` }} />
                <span className="font-medium italic">Dự báo</span>
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
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
      </div>
      {/* Chart area with overlay spinner */}
      {/* Chart content area — full loading spinner when month is changing */}
      {isMonthLoading || isDataLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin" />
          </div>
          <p className="mt-4 text-sm text-primary-700 font-semibold">
            {isMonthLoading ? `Đang tải dữ liệu tháng ${localSelectedMonth}...` : 'Đang cập nhật biểu đồ...'}
          </p>
          <p className="mt-1 text-xs text-gray-400">Vui lòng chờ trong giây lát</p>
        </div>
      ) : (
        <div className="p-4">
          <ResponsiveContainer width="100%" height={300}>
            {chartType === 'line' ? (
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
                  animationDuration={400}
                />
              ))}
              {showForecastLine && (
                <Line
                  type="monotone" dataKey="forecast" name={isMonthPeriod ? `Dự báo ${data.primaryYear}` : `Dự báo T${data.selectedMonth}/${data.primaryYear}`}
                  stroke={forecastColor} strokeWidth={2}
                  strokeDasharray="6 4" dot={false} connectNulls={false}
                  animationDuration={400}
                />
              )}
            </LineChart>
            ) : (
            <BarChart data={chartData}>
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
                <Bar
                  key={l.key} dataKey={l.key} name={l.name}
                  fill={colors[l.colorKey]} opacity={l.dash ? 0.6 : 0.85}
                  radius={[2, 2, 0, 0]}
                  animationDuration={400}
                  label={{ position: 'top', fontSize: 9, fill: '#6b7280', formatter: (v: any) => v > 0 ? v : '' }}
                />
              ))}
              {showForecastLine && (
                <Bar
                  dataKey="forecast" name={isMonthPeriod ? `Dự báo ${data.primaryYear}` : `Dự báo T${data.selectedMonth}/${data.primaryYear}`}
                  fill={forecastColor} opacity={0.4}
                  radius={[2, 2, 0, 0]}
                  animationDuration={400}
                  label={{ position: 'top', fontSize: 9, fill: '#9ca3af', formatter: (v: any) => v > 0 ? v : '' }}
                />
              )}
            </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
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
  const { isMonthPeriod, isCumulative, colors: savedColors, chartType: navChartType } = nav;
  const chartType = navChartType || 'line';
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

      let forecastMap: Record<number, number> = {};
      if (isCumulative && isCurrentYear) {
        const actualDays = Object.keys(currentMap).map(Number).sort((a, b) => a - b);
        const lastDay = actualDays.length > 0 ? actualDays[actualDays.length - 1] : 0;
        const lastCum = lastDay > 0 ? (currentMap[lastDay] ?? 0) : 0;
        if (lastDay > 0 && lastDay < totalDays && lastCum > 0) {
          const dailyRate = lastCum / lastDay;
          // Start forecast AFTER last actual day — no overlap
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
          // Start forecast AFTER last complete month — no overlap
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
                  <span className="font-normal text-gray-400 ml-1">(đvt: triệu đồng)</span>
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
              {chartType === 'line' ? (
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
              ) : (
              <BarChart data={chartData}>
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
                  <Bar
                    key={l.key} dataKey={l.key} name={l.name}
                    fill={l.color} opacity={l.dash ? 0.6 : 0.85}
                    radius={[2, 2, 0, 0]}
                    animationDuration={400}
                    label={{ position: 'top', fontSize: 8, fill: '#6b7280', formatter: (v: any) => v > 0 ? fmtMoney(v) : '' }}
                  />
                ))}
                {showForecastLine && (
                  <Bar
                    dataKey="forecast" name="Dự báo"
                    fill={forecastColor} opacity={0.4}
                    radius={[2, 2, 0, 0]}
                    animationDuration={400}
                    label={{ position: 'top', fontSize: 8, fill: '#9ca3af', formatter: (v: any) => v > 0 ? fmtMoney(v) : '' }}
                  />
                )}
              </BarChart>
              )}
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
  const [showRevenue, setShowRevenue] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);

  // --- Toggle show/hide Mã tương đương (persisted) ---
  const [showMaTuongDuong, setShowMaTuongDuong] = useState<boolean>(() => {
    const saved = localStorage.getItem('sdp_show_ma_tuong_duong_stat');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleMaTuongDuong = () => {
    setShowMaTuongDuong(prev => {
      const next = !prev;
      localStorage.setItem('sdp_show_ma_tuong_duong_stat', String(next));
      return next;
    });
  };

  const [filterMtdStatus, setFilterMtdStatus] = useState<'all' | 'WITHOUT_MTD'>('all');

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
    for (const m of [...primary, ...compare]) {
      if (m.maTuongDuongByName) {
        Object.assign(map, m.maTuongDuongByName);
      }
    }
    return map;
  }, [primary, compare]);

  const sourceData = showCompare ? compare : primary;
  const activeYear = showCompare ? data.compareYear : data.primaryYear;

  // Compute rows: aggregate by surgery name / maTuongDuong with anesthesia and price grouping
  const rows = useMemo(() => {
    const months = sourceData;
    const allNames = new Set<string>();
    for (const m of months) {
      if (m.byName) Object.keys(m.byName).forEach(n => allNames.add(n));
      if (m.namePriceCostByName) Object.keys(m.namePriceCostByName).forEach(n => allNames.add(n));
    }

    interface GroupAcc {
      key: string;
      maTuongDuong: string;
      names: Map<string, number>;
      monthly: number[];
      total: number;
    }

    const groupMap = new Map<string, GroupAcc>();

    for (const name of allNames) {
      const rawMTD = globalMaTuongDuongByName[name] || '';
      const isGT = isRecordGayTe(rawMTD, name);

      let nameCases = 0;
      let nameCost = 0;
      for (const m of months) {
        nameCases += (m.byName?.[name] || 0);
        nameCost += (m.namePriceCostByName?.[name] || 0);
      }
      const unitPrice = nameCases > 0 ? Math.round(nameCost / nameCases) : 0;

      let groupKey: string;
      let finalMTD = '';

      if (rawMTD) {
        const baseMTD = rawMTD.trim().toUpperCase().replace(/_GT$/i, '');
        const method = isGT ? 'GAY_TE' : 'GAY_ME';
        finalMTD = isGT ? (rawMTD.toUpperCase().endsWith('_GT') ? rawMTD.toUpperCase() : `${baseMTD}_GT`) : baseMTD;
        groupKey = `MTD_${baseMTD}:::${method}:::${unitPrice}`;
      } else {
        finalMTD = '';
        groupKey = `NOMTD_${name}`;
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          maTuongDuong: finalMTD,
          names: new Map<string, number>(),
          monthly: new Array(12).fill(0),
          total: 0,
        });
      }

      const acc = groupMap.get(groupKey)!;
      const weight = nameCost > 0 ? nameCost : nameCases;
      acc.names.set(name, (acc.names.get(name) || 0) + weight);

      for (const m of months) {
        const val = showRevenue
          ? (m.namePriceCostByName?.[name] || 0)
          : (m.byName?.[name] || 0);
        acc.monthly[m.month - 1] += val;
        acc.total += val;
      }
    }

    const result = Array.from(groupMap.values()).map(acc => {
      let bestName = '';
      let maxWeight = -1;
      for (const [n, w] of acc.names.entries()) {
        if (w > maxWeight) {
          maxWeight = w;
          bestName = n;
        }
      }
      return {
        key: acc.key,
        name: bestName || 'Không xác định',
        maTuongDuong: acc.maTuongDuong,
        monthly: acc.monthly,
        total: acc.total,
      };
    });

    result.sort((a, b) => b.total - a.total);
    return result;
  }, [sourceData, showRevenue, globalMaTuongDuongByName]);

  // Unmapped count
  const unmappedCount = useMemo(() => {
    return rows.filter(r => !r.maTuongDuong).length;
  }, [rows]);

  // Apply profile/chapter and MTD status filter BEFORE search
  const modeFiltered = useMemo(() => {
    let list = rows;
    if (filterMtdStatus === 'WITHOUT_MTD') {
      list = list.filter(r => !r.maTuongDuong);
    }

    if (filterMode === 'all') return list;

    if (filterMode === 'chapter' && selectedChapters.length > 0) {
      return list.filter(r => {
        const maTD = r.maTuongDuong || globalMaTuongDuongByName[r.name];
        if (!maTD) return false;
        const chapterCode = maTD.substring(0, 2);
        return selectedChapters.includes(chapterCode);
      });
    }

    if (filterMode === 'profile' && selectedProfileId) {
      const profile = profiles.find(p => p.id === selectedProfileId);
      if (!profile) return list;
      const profileSet = new Set(profile.surgeryNames.map(s => s.toLowerCase()));
      return list.filter(r => profileSet.has(r.name.toLowerCase()));
    }

    return list;
  }, [rows, filterMtdStatus, filterMode, selectedChapters, selectedProfileId, profiles, globalMaTuongDuongByName]);

  // Search filter (searches name, maTuongDuong, or empty code keywords)
  const filtered = useMemo(() => {
    if (!searchText.trim()) return modeFiltered;
    const q = searchText.trim().toLowerCase();
    const isBlankSearch = q === 'trống' || q === 'trong' || q === 'chưa có mã' || q === 'chua co ma';
    return modeFiltered.filter(r => {
      if (isBlankSearch && !r.maTuongDuong) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      if (r.maTuongDuong && r.maTuongDuong.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [modeFiltered, searchText]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePageIdx = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePageIdx * ROWS_PER_PAGE, (safePageIdx + 1) * ROWS_PER_PAGE);

  // Column headers — always show 12 months
  const colHeaders = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);

  // Grand total
  const grandTotal = filtered.reduce((s, r) => s + r.total, 0);

  // Format value — in revenue mode, show plain number in millions (no suffix)
  const fmtRevenuePlain = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1);
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return fmtNum(n);
  };
  const fmt = (v: number) => {
    if (v === 0) return '—';
    if (showRevenue) return fmtRevenuePlain(v);
    return fmtNum(v);
  };

  return (
    <CollapsibleFrame
      title={`Thống kê theo PTTT — ${activeYear}`}
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border-[1.5px] border-gray-400 rounded-lg hover:bg-gray-50 hover:border-gray-500 transition-colors min-w-[180px]"
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
                <>
                <div className="fixed inset-0 z-20" onClick={() => setShowChapterDropdown(false)} />
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
                </>
              )}
            </div>
          )}

          {/* Profile select (inline) */}
          {filterMode === 'profile' && (
            <select
              value={selectedProfileId}
              onChange={e => updateSelectedProfileId(e.target.value)}
              className="px-3 py-1.5 text-xs border-[1.5px] border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 min-w-[180px]"
            >
              <option value="">Chọn profile...</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.surgeryNames.length} KT)</option>
              ))}
            </select>
          )}
        </div>

        {/* Search & MTD Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {/* Toggle column Ma Tuong Duong (đứng trước box tìm kiếm) */}
          <button
            type="button"
            onClick={toggleMaTuongDuong}
            title={showMaTuongDuong ? 'Đang hiện cột Mã TĐ. Bấm để ẩn.' : 'Đang ẩn cột Mã TĐ. Bấm để hiện.'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              showMaTuongDuong
                ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs hover:bg-blue-100'
                : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${showMaTuongDuong ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 ring-2 ring-rose-200'}`} />
            <span>Mã TĐ</span>
          </button>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setPage(0); }}
              placeholder="Tìm theo tên PTTT, mã tương đương..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border-[1.5px] border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
            />
          </div>

          {/* Unmapped code quick chip */}
          {unmappedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterMtdStatus(prev => prev === 'WITHOUT_MTD' ? 'all' : 'WITHOUT_MTD');
                setPage(0);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                filterMtdStatus === 'WITHOUT_MTD'
                  ? 'bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-400 font-semibold'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
              title="Lọc các kỹ thuật chưa có mã tương đương"
            >
              <span>⚠️ Chưa có mã: {unmappedCount}</span>
              {filterMtdStatus === 'WITHOUT_MTD' && <span className="text-[10px] ml-0.5 font-bold">✕</span>}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {showRevenue && (
          <div className="text-right px-3 py-1.5 text-[10px] text-gray-500 italic">Đơn vị: triệu đồng</div>
        )}
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {showMaTuongDuong && (
                <th className="text-left px-3 py-2 font-semibold text-blue-800 sticky left-0 bg-blue-50/80 min-w-[130px] z-10 border-r border-gray-200">
                  Mã tương đương
                </th>
              )}
              <th className={`text-left px-3 py-2 font-semibold text-gray-600 bg-gray-50 min-w-[200px] z-10 ${
                showMaTuongDuong ? 'sticky left-[130px] shadow-[1px_0_0_0_#e5e7eb]' : 'sticky left-0'
              }`}>
                Tên PTTT
                <span className="text-[9px] text-gray-400 font-normal ml-1">({filtered.length})</span>
              </th>
              {colHeaders.map((h, i) => (
                <th key={i} className="text-center px-2 py-2 font-semibold text-gray-600 min-w-[55px]">{h}</th>
              ))}
              <th className="text-center px-3 py-2 font-bold text-gray-800 bg-primary-50 min-w-[70px]">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50">
                {showMaTuongDuong && (
                  <td className="px-3 py-1.5 font-mono text-[11px] font-semibold text-blue-700 sticky left-0 bg-white z-10 min-w-[130px] border-r border-gray-100">
                    {row.maTuongDuong ? (
                      <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                        {row.maTuongDuong}
                      </span>
                    ) : (
                      ''
                    )}
                  </td>
                )}
                <td className={`px-3 py-1.5 font-medium text-gray-700 bg-white z-10 min-w-[200px] max-w-[280px] break-words whitespace-normal ${
                  showMaTuongDuong ? 'sticky left-[130px] shadow-[1px_0_0_0_#e5e7eb]' : 'sticky left-0'
                }`}>
                  <span className="text-[9px] text-gray-400 mr-1">{safePageIdx * ROWS_PER_PAGE + ri + 1}.</span>
                  {row.name}
                </td>
                {row.monthly.map((v, ci) => (
                  <td key={ci} className="text-center px-2 py-1.5 text-gray-600 tabular-nums">
                    {v > 0 ? fmt(v) : <span className="text-gray-200">·</span>}
                  </td>
                ))}
                <td className="text-center px-3 py-1.5 font-bold text-primary-800 bg-primary-50 tabular-nums">
                  {row.total > 0 ? fmt(row.total) : '—'}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={showMaTuongDuong ? 15 : 14} className="text-center py-8 text-gray-400 text-sm">
                  {searchText.trim() || filterMtdStatus !== 'all' ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu'}
                </td>
              </tr>
            )}
            {/* Grand total row */}
            {filtered.length > 0 && (
              <tr className="bg-gray-50 font-bold border-t border-gray-300">
                {showMaTuongDuong && (
                  <td className="px-3 py-2 text-gray-400 font-mono text-[11px] sticky left-0 bg-gray-50 z-10 border-r border-gray-200">—</td>
                )}
                <td className={`px-3 py-2 text-gray-800 font-bold bg-gray-50 z-10 ${
                  showMaTuongDuong ? 'sticky left-[130px] shadow-[1px_0_0_0_#e5e7eb]' : 'sticky left-0'
                }`}>Tổng cộng</td>
                {Array.from({ length: 12 }, (_, ci) => {
                  const colTotal = filtered.reduce((s, r) => s + r.monthly[ci], 0);
                  return (
                    <td key={ci} className="text-center px-2 py-2 text-gray-700 tabular-nums">
                      {colTotal > 0 ? fmt(colTotal) : '—'}
                    </td>
                  );
                })}
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


export const StatsSummary: React.FC<Props> = ({ data, onMonthChange, chapters, profiles, surgeryNamePrices, isDataLoading }) => {
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
      value: (totalNamePricePrimary > 0 || totalSvcCostPrimary > 0) ? fmtMoney(totalNamePricePrimary || totalSvcCostPrimary) : '—',
      change: calcChange(totalNamePricePrimary || totalSvcCostPrimary, totalNamePriceCompare || totalSvcCostCompare),
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-teal-600 bg-teal-50',
      tooltip: 'Tổng viện phí PT/TT lấy trực tiếp từ cột thành tiền của các ca mổ',
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

              {/* Row: Viện phí PT/TT (trực tiếp từ cột thành tiền) */}
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-teal-700 sticky left-0 bg-white">Viện phí PT/TT (tr)</td>
                {primary.map((m, i) => {
                  const val = m.serviceCost || m.namePriceCost || 0;
                  return (
                    <td key={i} className="text-center px-2 py-2 text-gray-600">
                      {val > 0 ? fmtMoney(val) : <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
                <td className="text-center px-3 py-2 font-bold text-teal-800 bg-teal-50">{fmtMoney(totalSvcCostPrimary || totalNamePricePrimary)}</td>
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
      <TrendChart data={data} forecast={forecast} fmtNum={fmtNum} fmtPct={fmtPct} onMonthChange={onMonthChange} onNavChange={setChartNav} chapters={chapters} profiles={profiles} isDataLoading={isDataLoading} />

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
