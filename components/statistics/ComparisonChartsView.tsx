/**
 * ComparisonChartsView — Trực quan hóa chuyên sâu Phân tích So sánh Chuyên khoa
 * Đúc kết từ triết lý Lieflat Charts (Glance + Lupi Editorial + Interactive)
 * Tích hợp toàn diện góc độ Số lượng ca, Viện phí thành tiền, và Cơ cấu kỹ thuật y tế.
 */
import React, { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, Activity, DollarSign,
  Layers, Calendar, ArrowRight, Info, Check, Filter, Sparkles,
  BarChart3, RefreshCw, Eye
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LabelList
} from 'recharts';
import {
  SpecialtyReportGroup,
  ComparisonRow,
  PeriodMetadata,
  SpecialtyMeta,
  SpecialtyLoaiItem,
  MonthlyTrendItem,
} from '../../services/specialtyComparisonService';

interface Props {
  groups: SpecialtyReportGroup[];
  allRows: ComparisonRow[];
  metricMode: 'count' | 'revenue';
  setMetricMode: (m: 'count' | 'revenue') => void;
  periodMeta: PeriodMetadata | null;
  periodMode: 'month' | 'range';
  filterStatus: 'all' | 'ALERT' | 'POSITIVE';
  setFilterStatus: (s: 'all' | 'ALERT' | 'POSITIVE') => void;
  selectedSpecialty: string;
  setSelectedSpecialty: (code: string) => void;
  allSpecialtiesList: SpecialtyMeta[];
  hasSamePeriodData: boolean;
  loaiBreakdown: SpecialtyLoaiItem[];
  monthlyTimeline: MonthlyTrendItem[];
}

// Định dạng tiền tệ
const fmtMoney = (n: number) => {
  if (n === 0) return '0 đ';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  return `${sign}${abs.toLocaleString('vi-VN')} đ`;
};

const fmtFullMoney = (n: number) => `${n.toLocaleString('vi-VN')} VNĐ`;
const fmtNum = (n: number) => n.toLocaleString('vi-VN');

// Màu sắc chuẩn y tế
const PALETTE = {
  emerald: '#10b981', // Tích cực
  emeraldLight: '#d1fae5',
  rose: '#f43f5e',    // Cảnh báo / Giảm
  roseLight: '#ffe4e6',
  primary: '#2563eb', // Kỳ hiện tại
  prev: '#94a3b8',    // Kỳ trước
  samePeriod: '#cbd5e1', // Cùng kỳ
  amber: '#f59e0b',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  teal: '#0d9488',
};

export const ComparisonChartsView: React.FC<Props> = ({
  groups,
  allRows,
  metricMode,
  setMetricMode,
  periodMeta,
  periodMode,
  filterStatus,
  setFilterStatus,
  selectedSpecialty,
  setSelectedSpecialty,
  allSpecialtiesList,
  hasSamePeriodData,
  loaiBreakdown,
  monthlyTimeline,
}) => {
  // Bộ so sánh nội bộ của biểu đồ: 'prev' (So kỳ trước) | 'samePeriod' (So cùng kỳ)
  const [compareTarget, setCompareTarget] = useState<'prev' | 'samePeriod'>('prev');
  // Chế độ xem cơ cấu loại PT/TT: 'count' | 'revenue'
  const [loaiViewMode, setLoaiViewMode] = useState<'count' | 'revenue'>('count');
  // Chế độ xem Top impact: 'gainers' | 'losers' | 'both'
  const [topImpactTab, setTopImpactTab] = useState<'both' | 'gainers' | 'losers'>('both');

  // Nhãn kỳ so sánh được chọn
  const compareLabel = compareTarget === 'prev'
    ? (periodMeta?.prevLabel || 'Kỳ trước')
    : (periodMeta?.samePeriodLabel || 'Cùng kỳ');

  // 1. DỮ LIỆU DIVERGING BAR (Thanh đối xứng Tăng/Giảm theo Chuyên khoa)
  const divergingData = useMemo(() => {
    return groups
      .map(g => {
        const curVal = metricMode === 'revenue' ? g.totalCurrentRevenue : g.totalCurrent;
        const compVal = compareTarget === 'prev'
          ? (metricMode === 'revenue' ? g.totalPrevRevenue : g.totalPrev)
          : (metricMode === 'revenue' ? g.totalSamePeriodRevenue : g.totalSamePeriod);

        const diff = curVal - compVal;
        let pct = 0;
        if (compVal > 0) {
          pct = ((curVal - compVal) / compVal) * 100;
        } else if (curVal > 0) {
          pct = 100; // Mới phát sinh
        }

        return {
          code: g.specialty.code,
          name: g.specialty.name,
          shortName: g.specialty.shortName,
          curVal,
          compVal,
          diff,
          pct: Number(pct.toFixed(1)),
          isPositive: diff >= 0,
        };
      })
      .filter(item => item.curVal > 0 || item.compVal > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [groups, metricMode, compareTarget]);

  // 2. DỮ LIỆU GROUPED 3-BAR (Quy mô 3 kỳ theo từng khoa)
  const groupedBarData = useMemo(() => {
    return groups
      .map(g => {
        const current = metricMode === 'revenue' ? g.totalCurrentRevenue : g.totalCurrent;
        const prev = metricMode === 'revenue' ? g.totalPrevRevenue : g.totalPrev;
        const samePeriod = metricMode === 'revenue' ? g.totalSamePeriodRevenue : g.totalSamePeriod;

        return {
          name: g.specialty.shortName || g.specialty.name,
          fullName: g.specialty.name,
          [periodMeta?.currentLabel || 'Kỳ này']: current,
          [periodMeta?.prevLabel || 'Kỳ trước']: prev,
          ...(hasSamePeriodData ? { [periodMeta?.samePeriodLabel || 'Cùng kỳ']: samePeriod } : {}),
        };
      })
      .filter(g => {
        const cur = g[periodMeta?.currentLabel || 'Kỳ này'] as number;
        const prv = g[periodMeta?.prevLabel || 'Kỳ trước'] as number;
        return cur > 0 || prv > 0;
      });
  }, [groups, metricMode, periodMeta, hasSamePeriodData]);

  // 3. DỮ LIỆU WATERFALL (Cầu nối biến động đóng góp của từng khoa)
  const waterfallData = useMemo(() => {
    const isRev = metricMode === 'revenue';
    // Base total
    const startTotal = groups.reduce((acc, g) => {
      const val = compareTarget === 'prev'
        ? (isRev ? g.totalPrevRevenue : g.totalPrev)
        : (isRev ? g.totalSamePeriodRevenue : g.totalSamePeriod);
      return acc + val;
    }, 0);

    const endTotal = groups.reduce((acc, g) => {
      return acc + (isRev ? g.totalCurrentRevenue : g.totalCurrent);
    }, 0);

    let runningTotal = startTotal;
    const items: Array<{
      name: string;
      base: number;
      value: number;
      diff: number;
      type: 'start' | 'step' | 'end';
      isPositive: boolean;
      displayVal: number;
    }> = [
      {
        name: `Đầu kỳ (${compareLabel})`,
        base: 0,
        value: startTotal,
        diff: startTotal,
        type: 'start',
        isPositive: true,
        displayVal: startTotal,
      }
    ];

    groups.forEach(g => {
      const cur = isRev ? g.totalCurrentRevenue : g.totalCurrent;
      const comp = compareTarget === 'prev'
        ? (isRev ? g.totalPrevRevenue : g.totalPrev)
        : (isRev ? g.totalSamePeriodRevenue : g.totalSamePeriod);
      const diff = cur - comp;
      if (diff === 0) return;

      const isPos = diff > 0;
      const stepBase = isPos ? runningTotal : runningTotal + diff;
      runningTotal += diff;

      items.push({
        name: g.specialty.shortName || g.specialty.name,
        base: Math.max(0, stepBase),
        value: Math.abs(diff),
        diff,
        type: 'step',
        isPositive: isPos,
        displayVal: diff,
      });
    });

    items.push({
      name: `Cuối kỳ (${periodMeta?.currentLabel || 'Kỳ này'})`,
      base: 0,
      value: endTotal,
      diff: endTotal,
      type: 'end',
      isPositive: true,
      displayVal: endTotal,
    });

    return items;
  }, [groups, metricMode, compareTarget, compareLabel, periodMeta]);

  // 4. DỮ LIỆU VIỆN PHÍ BÌNH QUÂN / CA (Revenue per Case)
  const revPerCaseData = useMemo(() => {
    let grandCurTotalRev = 0;
    let grandCurTotalCount = 0;

    const list = groups
      .map(g => {
        const curCount = g.totalCurrent;
        const curRev = g.totalCurrentRevenue;
        grandCurTotalRev += curRev;
        grandCurTotalCount += curCount;

        const avgCur = curCount > 0 ? Math.round(curRev / curCount) : 0;
        const prevAvg = g.totalPrev > 0 ? Math.round(g.totalPrevRevenue / g.totalPrev) : 0;

        return {
          code: g.specialty.code,
          name: g.specialty.shortName || g.specialty.name,
          fullName: g.specialty.name,
          avgCur,
          prevAvg,
          curCount,
          curRev,
        };
      })
      .filter(item => item.curCount > 0)
      .sort((a, b) => b.avgCur - a.avgCur);

    const hospitalAvg = grandCurTotalCount > 0
      ? Math.round(grandCurTotalRev / grandCurTotalCount)
      : 0;

    return { list, hospitalAvg };
  }, [groups]);

  // 5. DỮ LIỆU CƠ CẤU LOẠI PHẪU THUẬT / THỦ THUẬT THEO KHOA
  const loaiChartData = useMemo(() => {
    const isRev = loaiViewMode === 'revenue';
    return loaiBreakdown
      .map(item => {
        const total = isRev ? item.totalRevenue : item.totalCount;
        return {
          name: item.specialtyName,
          'Phẫu thuật ĐB': isRev ? item.ptDbRevenue : item.ptDbCount,
          'Phẫu thuật Loại 1': isRev ? item.pt1Revenue : item.pt1Count,
          'Phẫu thuật Loại 2': isRev ? item.pt2Revenue : item.pt2Count,
          'Phẫu thuật Loại 3': isRev ? item.pt3Revenue : item.pt3Count,
          'Thủ thuật': isRev ? item.ttRevenue : item.ttCount,
          'Chưa phân loại/Khác': isRev ? item.otherRevenue : item.otherCount,
          total,
          emptyTop: 0,
        };
      })
      .filter(item => item.total > 0);
  }, [loaiBreakdown, loaiViewMode]);

  // Tổng hợp toàn viện theo Loại PT/TT
  const loaiSummary = useMemo(() => {
    const isRev = loaiViewMode === 'revenue';
    let db = 0, p1 = 0, p2 = 0, p3 = 0, tt = 0, other = 0, total = 0;
    loaiBreakdown.forEach(item => {
      db += isRev ? item.ptDbRevenue : item.ptDbCount;
      p1 += isRev ? item.pt1Revenue : item.pt1Count;
      p2 += isRev ? item.pt2Revenue : item.pt2Count;
      p3 += isRev ? item.pt3Revenue : item.pt3Count;
      tt += isRev ? item.ttRevenue : item.ttCount;
      other += isRev ? item.otherRevenue : item.otherCount;
      total += isRev ? item.totalRevenue : item.totalCount;
    });
    return { db, p1, p2, p3, tt, other, total };
  }, [loaiBreakdown, loaiViewMode]);

  // Render nhãn trực tiếp trên Waterfall bar (Số liệu hiển thị tức thì không cần hover)
  const renderWaterfallLabel = (props: any) => {
    const { x, y, width, index } = props;
    const item = waterfallData[index];
    if (!item) return null;
    const isStartOrEnd = item.type === 'start' || item.type === 'end';
    let text = '';
    let fill = '#1e293b';
    if (isStartOrEnd) {
      text = metricMode === 'revenue' ? fmtMoney(item.value) : `${fmtNum(item.value)} ca`;
      fill = '#0f3a60';
    } else {
      const sign = item.diff > 0 ? '+' : '';
      text = metricMode === 'revenue' ? `${sign}${fmtMoney(item.diff)}` : `${sign}${item.diff} ca`;
      fill = item.isPositive ? '#059669' : '#e11d48';
    }
    return (
      <text
        x={x + width / 2}
        y={Math.max(14, y - 6)}
        fill={fill}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
      >
        {text}
      </text>
    );
  };

  // Render nhãn bên trong từng lát cắt Stacked Bar (khi lát cắt đủ cao)
  const renderInsideStackLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (!value || height < 14 || width < 22) return null;
    const text = loaiViewMode === 'revenue' ? fmtMoney(value) : String(value);
    return (
      <text
        x={x + width / 2}
        y={y + height / 2 + 3.5}
        fill="#ffffff"
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
      >
        {text}
      </text>
    );
  };

  // Render nhãn Tổng trên đỉnh cột Stacked Bar
  const renderStackTotalLabel = (props: any) => {
    const { x, y, width, index } = props;
    const item = loaiChartData[index];
    if (!item || !item.total) return null;
    const text = loaiViewMode === 'revenue' ? fmtMoney(item.total) : `${fmtNum(item.total)} ca`;
    return (
      <text
        x={x + width / 2}
        y={Math.max(14, y - 6)}
        fill="#0f3a60"
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={800}
      >
        {text}
      </text>
    );
  };

  // 6. DỮ LIỆU XU HƯỚNG ĐA THÁNG (Timeline Line Chart)
  const timelineChartData = useMemo(() => {
    if (!monthlyTimeline || monthlyTimeline.length === 0) return [];
    const isRev = metricMode === 'revenue';

    return monthlyTimeline.map(m => {
      const row: any = {
        name: m.monthKey,
        fullLabel: m.monthLabel,
        total: isRev ? m.totalRevenue : m.totalCount,
      };

      allSpecialtiesList.forEach(spec => {
        const val = isRev
          ? (m.bySpecialtyRevenue[spec.code] || 0)
          : (m.bySpecialtyCount[spec.code] || 0);
        row[spec.name] = val;
      });

      return row;
    });
  }, [monthlyTimeline, metricMode, allSpecialtiesList]);

  // 7. DỮ LIỆU TOP TÁC ĐỘNG (Top Gainers & Top Losers)
  const topImpactData = useMemo(() => {
    const isRev = metricMode === 'revenue';

    const processed = allRows.map(r => {
      const cur = isRev ? r.currentRevenue : r.currentCount;
      const prev = isRev ? r.prevRevenue : r.prevCount;
      const diff = cur - prev;
      const pct = isRev ? (r.prevRevenueChangePct ?? 0) : (r.prevChangePct ?? 0);

      return {
        tenKT: r.tenKT,
        maTuongDuong: r.maTuongDuong,
        specialtyName: r.specialtyName,
        cur,
        prev,
        diff,
        pct,
        status: r.status,
      };
    });

    // Top tăng (Gainers)
    const gainers = processed
      .filter(r => r.diff > 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);

    // Top giảm (Losers)
    const losers = processed
      .filter(r => r.diff < 0)
      .sort((a, b) => a.diff - b.diff) // số âm nhất lên đầu
      .slice(0, 10);

    return { gainers, losers };
  }, [allRows, metricMode]);

  // Tooltip tùy chỉnh dạng Lupi Editorial
  const LupiTooltip = ({ active, payload, label, formatter }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-xl p-3 text-xs z-50 min-w-[180px]">
        <div className="font-bold text-gray-900 border-b border-gray-100 pb-1.5 mb-1.5 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-gray-400 font-normal">
            {metricMode === 'revenue' ? 'Viện phí' : 'Số ca'}
          </span>
        </div>
        <div className="space-y-1">
          {payload.map((p: any, idx: number) => {
            if (p.dataKey === 'base') return null; // ẩn thanh đệm waterfall
            const val = p.value;
            const displayStr = formatter
              ? formatter(val, p.name)
              : metricMode === 'revenue'
              ? fmtMoney(val)
              : `${fmtNum(val)} ca`;

            return (
              <div key={idx} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-gray-600">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || p.fill }} />
                  <span>{p.name}:</span>
                </span>
                <strong className="text-gray-900 font-bold">{displayStr}</strong>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in font-inter">
      {/* ── BỘ ĐIỀU KHIỂN TƯƠNG TÁC BIỂU ĐỒ (CONTROL BAR) ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Thước đo & Kỳ so sánh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Thước đo */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => setMetricMode('count')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                metricMode === 'count'
                  ? 'bg-white text-primary-700 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Số lượng ca</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricMode('revenue')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                metricMode === 'revenue'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span>Doanh thu Viện phí</span>
            </button>
          </div>

          {/* Toggle Kỳ so sánh */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => setCompareTarget('prev')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                compareTarget === 'prev'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>So Kỳ trước ({periodMeta?.prevLabel || ''})</span>
            </button>

            <button
              type="button"
              onClick={() => setCompareTarget('samePeriod')}
              disabled={!hasSamePeriodData}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                compareTarget === 'samePeriod'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title={hasSamePeriodData ? 'So sánh với cùng kỳ năm trước' : 'Chưa có dữ liệu cùng kỳ năm trước'}
            >
              <span>So Cùng kỳ ({periodMeta?.samePeriodLabel || ''})</span>
            </button>
          </div>
        </div>

        {/* Right: Trạng thái lọc tương tác */}
        <div className="flex items-center gap-2">
          {filterStatus !== 'all' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Đang lọc theo KPI: <strong>{filterStatus === 'ALERT' ? 'Cảnh báo 🚨' : 'Tích cực 🌿'}</strong></span>
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className="ml-1 text-amber-700 hover:text-amber-950 font-bold underline cursor-pointer"
              >
                Bỏ lọc
              </button>
            </div>
          )}

          <div className="text-[11px] text-gray-500 hidden lg:block bg-gray-50 px-3 py-1 rounded-lg border border-gray-200/70">
            📊 Trực quan hóa dữ liệu theo chuẩn Lieflat Glance & Lupi
          </div>
        </div>
      </div>

      {/* ── TẦNG 1: GLANCE — BỨC TRANH TĂNG TRƯỞNG & QUY MÔ 3 KỲ ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biểu đồ 1: Diverging Bar Chart (Tăng/Giảm theo Chuyên khoa) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Biến động Tăng trưởng Chuyên khoa
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                So sánh {periodMeta?.currentLabel || 'Kỳ này'} với {compareLabel} (kết hợp % và số chênh $\Delta$)
              </p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Diverging Bar
            </span>
          </div>

          {/* Body: Danh sách thanh đối xứng */}
          <div className="flex-1 space-y-3.5 my-auto py-2">
            {divergingData.map((item) => {
              const maxAbsPct = Math.max(...divergingData.map(d => Math.abs(d.pct)), 10);
              const barWidthPct = Math.min(Math.round((Math.abs(item.pct) / maxAbsPct) * 100), 100);

              return (
                <div key={item.code} className="group">
                  <div className="flex flex-wrap items-center justify-between text-xs mb-1 gap-1">
                    <span className="font-bold text-gray-800 flex items-center gap-1.5">
                      <span>{item.name}</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2 font-bold text-xs">
                      <span className="text-gray-500 font-medium">
                        Kỳ này: <strong className="text-gray-900">{metricMode === 'revenue' ? fmtMoney(item.curVal) : `${fmtNum(item.curVal)} ca`}</strong>
                      </span>
                      <span className="text-gray-300 font-normal">|</span>
                      <span className="text-gray-500 font-medium">
                        {compareLabel}: <strong className="text-gray-700">{metricMode === 'revenue' ? fmtMoney(item.compVal) : `${fmtNum(item.compVal)} ca`}</strong>
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-extrabold ${item.isPositive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                        {item.isPositive ? `+${item.pct}%` : `${item.pct}%`} ({item.diff > 0 ? '+' : ''}{metricMode === 'revenue' ? fmtMoney(item.diff) : `${item.diff} ca`})
                      </span>
                    </div>
                  </div>

                  {/* Diverging bar track (Trục giữa 0%) */}
                  <div className="grid grid-cols-2 gap-1 h-3 bg-gray-100 rounded-full overflow-hidden p-0.5">
                    {/* Cột Trái: Âm / Sụt giảm */}
                    <div className="flex justify-end items-center">
                      {!item.isPositive && (
                        <div
                          className="h-full bg-rose-500 rounded-full transition-all duration-500 group-hover:bg-rose-600"
                          style={{ width: `${barWidthPct}%` }}
                        />
                      )}
                    </div>

                    {/* Cột Phải: Dương / Tăng trưởng */}
                    <div className="flex justify-start items-center">
                      {item.isPositive && (
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500 group-hover:bg-emerald-600"
                          style={{ width: `${barWidthPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1 text-rose-600 font-semibold">
              <TrendingDown className="h-3.5 w-3.5" /> Phía trái: Sụt giảm (Cảnh báo)
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <TrendingUp className="h-3.5 w-3.5" /> Phía phải: Tăng trưởng (Tích cực)
            </span>
          </div>
        </div>

        {/* Biểu đồ 2: Grouped Comparison Bar (Quy mô 3 Kỳ) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Quy mô Tuyệt đối theo Chuyên khoa
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                So sánh tổng {metricMode === 'revenue' ? 'viện phí' : 'số ca'} qua 3 kỳ đối chiếu
              </p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200">
              Grouped Bar
            </span>
          </div>

          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height={Math.max(340, groupedBarData.length * 52)}>
              <BarChart
                data={groupedBarData}
                layout="vertical"
                margin={{ top: 10, right: 75, left: 15, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  tickFormatter={val => metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 600 }}
                  width={90}
                />
                <Tooltip
                  content={<LupiTooltip />}
                  formatter={(val: number) => metricMode === 'revenue' ? fmtFullMoney(val) : `${fmtNum(val)} ca`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                />
                <Bar
                  dataKey={periodMeta?.currentLabel || 'Kỳ này'}
                  fill={PALETTE.primary}
                  radius={[0, 4, 4, 0]}
                  barSize={12}
                >
                  <LabelList
                    dataKey={periodMeta?.currentLabel || 'Kỳ này'}
                    position="right"
                    formatter={(v: number) => v > 0 ? (metricMode === 'revenue' ? fmtMoney(v) : fmtNum(v)) : ''}
                    style={{ fontSize: 9.5, fontWeight: 700, fill: PALETTE.primary }}
                  />
                </Bar>
                <Bar
                  dataKey={periodMeta?.prevLabel || 'Kỳ trước'}
                  fill={PALETTE.prev}
                  radius={[0, 4, 4, 0]}
                  barSize={12}
                >
                  <LabelList
                    dataKey={periodMeta?.prevLabel || 'Kỳ trước'}
                    position="right"
                    formatter={(v: number) => v > 0 ? (metricMode === 'revenue' ? fmtMoney(v) : fmtNum(v)) : ''}
                    style={{ fontSize: 9, fontWeight: 600, fill: '#475569' }}
                  />
                </Bar>
                {hasSamePeriodData && (
                  <Bar
                    dataKey={periodMeta?.samePeriodLabel || 'Cùng kỳ'}
                    fill={PALETTE.samePeriod}
                    radius={[0, 4, 4, 0]}
                    barSize={12}
                  >
                    <LabelList
                      dataKey={periodMeta?.samePeriodLabel || 'Cùng kỳ'}
                      position="right"
                      formatter={(v: number) => v > 0 ? (metricMode === 'revenue' ? fmtMoney(v) : fmtNum(v)) : ''}
                      style={{ fontSize: 9, fontWeight: 500, fill: '#64748b' }}
                    />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── TẦNG 2: CẦU NỐI BIẾN ĐỘNG & TÀI CHÍNH Y TẾ ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biểu đồ 3: Waterfall Chart (Cầu nối Đóng góp Tăng/Giảm Toàn viện) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Cầu nối Đóng góp Biến động (Waterfall)
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Giải thích mức tăng/giảm từ {compareLabel} đến {periodMeta?.currentLabel || 'Kỳ này'} do từng chuyên khoa
              </p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Waterfall Bridge
            </span>
          </div>

          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={waterfallData} margin={{ top: 25, right: 20, left: 20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10.5, fill: '#334155' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis
                  tickFormatter={val => metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs">
                        <div className="font-bold text-gray-900 border-b pb-1 mb-1">{item.name}</div>
                        {item.type === 'step' ? (
                          <div>
                            <span className="text-gray-500">Mức đóng góp: </span>
                            <strong className={item.isPositive ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                              {item.diff > 0 ? '+' : ''}{metricMode === 'revenue' ? fmtFullMoney(item.diff) : `${item.diff} ca`}
                            </strong>
                          </div>
                        ) : (
                          <div>
                            <span className="text-gray-500">Tổng quy mô: </span>
                            <strong className="text-gray-900 font-bold">
                              {metricMode === 'revenue' ? fmtFullMoney(item.value) : `${fmtNum(item.value)} ca`}
                            </strong>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {/* Cột trong suốt đệm đáy */}
                <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                {/* Cột giá trị thực tế */}
                <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
                  <LabelList content={renderWaterfallLabel} />
                  {waterfallData.map((entry, index) => {
                    let color = '#3b82f6';
                    if (entry.type === 'start' || entry.type === 'end') {
                      color = '#1e3a8a';
                    } else if (entry.isPositive) {
                      color = PALETTE.emerald;
                    } else {
                      color = PALETTE.rose;
                    }
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ 4: Viện phí bình quân trên 1 ca (Revenue per Case) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Viện phí Bình quân trên 1 Ca (Doanh thu / Ca)
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Đánh giá chất lượng ca mổ và độ phức tạp kỹ thuật theo chuyên khoa
              </p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Avg per Case
            </span>
          </div>

          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revPerCaseData.list} margin={{ top: 25, right: 30, left: 30, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tickFormatter={val => fmtMoney(val)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs space-y-1">
                        <div className="font-bold text-gray-900 border-b pb-1 mb-1">{item.fullName}</div>
                        <div className="flex justify-between gap-3 text-gray-600">
                          <span>Bình quân ca ({periodMeta?.currentLabel}):</span>
                          <strong className="text-emerald-700">{fmtFullMoney(item.avgCur)}</strong>
                        </div>
                        <div className="flex justify-between gap-3 text-gray-600">
                          <span>Tổng số ca:</span>
                          <strong>{fmtNum(item.curCount)} ca</strong>
                        </div>
                        <div className="flex justify-between gap-3 text-gray-600">
                          <span>Tổng viện phí:</span>
                          <strong>{fmtMoney(item.curRev)}</strong>
                        </div>
                        <div className="flex justify-between gap-3 text-gray-500 pt-1 border-t text-[10.5px]">
                          <span>Bình quân toàn viện:</span>
                          <span>{fmtMoney(revPerCaseData.hospitalAvg)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={revPerCaseData.hospitalAvg}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: `BQ Viện: ${fmtMoney(revPerCaseData.hospitalAvg)}`,
                    fill: '#ef4444',
                    fontSize: 10.5,
                    position: 'top',
                  }}
                />
                <Bar dataKey="avgCur" name="BQ Kỳ này" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={28}>
                  <LabelList
                    dataKey="avgCur"
                    position="top"
                    formatter={(val: number) => val > 0 ? fmtMoney(val) : ''}
                    style={{ fontSize: 10, fontWeight: 700, fill: '#0f3a60' }}
                    offset={6}
                  />
                  {revPerCaseData.list.map((entry, idx) => (
                    <Cell
                      key={`cell-avg-${idx}`}
                      fill={entry.avgCur >= revPerCaseData.hospitalAvg ? '#0d9488' : '#64748b'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[11px] text-gray-500 text-right mt-1">
            * Cột xanh đậm: Trên mức bình quân toàn viện | Cột xám: Dưới mức bình quân
          </div>
        </div>
      </div>

      {/* ── TẦNG 3: CƠ CẤU LOẠI PHẪU THUẬT / THỦ THUẬT & XU HƯỚNG THỜI GIAN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biểu đồ 5: Cơ cấu Loại PT/TT theo chuyên khoa (Stacked Bar) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Cơ cấu Loại Phẫu thuật & Thủ thuật
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Phân bổ theo mức độ phức tạp: Loại ĐB, 1, 2, 3 và Thủ thuật
              </p>
            </div>

            {/* Toggle Đơn vị hiển thị: Số lượng vs Viện phí */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setLoaiViewMode('count')}
                className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                  loaiViewMode === 'count' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500'
                }`}
              >
                Số ca
              </button>
              <button
                type="button"
                onClick={() => setLoaiViewMode('revenue')}
                className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                  loaiViewMode === 'revenue' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500'
                }`}
              >
                Viện phí
              </button>
            </div>
          </div>

          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={loaiChartData} margin={{ top: 25, right: 30, left: 30, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tickFormatter={val => loaiViewMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  content={<LupiTooltip />}
                  formatter={(val: number) => loaiViewMode === 'revenue' ? fmtMoney(val) : `${fmtNum(val)} ca`}
                />
                <Legend wrapperStyle={{ fontSize: 10.5, paddingTop: 10 }} />
                <Bar dataKey="Phẫu thuật ĐB" stackId="loai" fill="#7c3aed">
                  <LabelList content={renderInsideStackLabel} />
                </Bar>
                <Bar dataKey="Phẫu thuật Loại 1" stackId="loai" fill="#2563eb">
                  <LabelList content={renderInsideStackLabel} />
                </Bar>
                <Bar dataKey="Phẫu thuật Loại 2" stackId="loai" fill="#0891b2">
                  <LabelList content={renderInsideStackLabel} />
                </Bar>
                <Bar dataKey="Phẫu thuật Loại 3" stackId="loai" fill="#059669">
                  <LabelList content={renderInsideStackLabel} />
                </Bar>
                <Bar dataKey="Thủ thuật" stackId="loai" fill="#f59e0b">
                  <LabelList content={renderInsideStackLabel} />
                </Bar>
                <Bar dataKey="Chưa phân loại/Khác" stackId="loai" fill="#94a3b8">
                  <LabelList content={renderInsideStackLabel} />
                </Bar>
                {/* Cột trong suốt đệm đỉnh để hiển thị nhãn Tổng số */}
                <Bar dataKey="emptyTop" stackId="loai" fill="transparent">
                  <LabelList content={renderStackTotalLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Hàng tóm tắt số liệu tổng toàn viện theo loại PT/TT */}
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
            <span className="font-bold text-gray-700">Tổng toàn viện:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                PĐB: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.db) : `${fmtNum(loaiSummary.db)} ca`}
              </span>
              <span className="flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                P1: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.p1) : `${fmtNum(loaiSummary.p1)} ca`}
              </span>
              <span className="flex items-center gap-1 text-cyan-700 font-bold bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                P2: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.p2) : `${fmtNum(loaiSummary.p2)} ca`}
              </span>
              <span className="flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                P3: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.p3) : `${fmtNum(loaiSummary.p3)} ca`}
              </span>
              <span className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                TT: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.tt) : `${fmtNum(loaiSummary.tt)} ca`}
              </span>
              <span className="flex items-center gap-1 text-gray-900 font-extrabold bg-gray-100 px-2 py-0.5 rounded border border-gray-300">
                Tổng: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.total) : `${fmtNum(loaiSummary.total)} ca`}
              </span>
            </div>
          </div>
        </div>

        {/* Biểu đồ 6: Xu hướng theo Thời gian (Timeline Line Chart) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Xu hướng Diễn biến theo Thời gian
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {periodMode === 'range'
                  ? 'Đường xu hướng qua các tháng trong khoảng thời gian đã chọn'
                  : 'Đường xu hướng diễn biến của chu kỳ phân tích'}
              </p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Timeline Trend
            </span>
          </div>

          <div className="flex-1 w-full min-h-[300px]">
            {timelineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={timelineChartData} margin={{ top: 25, right: 30, left: 30, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#334155' }} />
                  <YAxis
                    tickFormatter={val => metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip
                    content={<LupiTooltip />}
                    formatter={(val: number) => metricMode === 'revenue' ? fmtFullMoney(val) : `${fmtNum(val)} ca`}
                  />
                  <Legend wrapperStyle={{ fontSize: 10.5, paddingTop: 10 }} />
                  {/* Đường tổng toàn viện */}
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Tổng Toàn viện"
                    stroke="#0f172a"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : `${fmtNum(val)} ca`) : ''}
                      style={{ fontSize: 10, fontWeight: 700, fill: '#0f172a' }}
                      offset={8}
                    />
                  </Line>
                  {/* Các đường chuyên khoa */}
                  {allSpecialtiesList.slice(0, 5).map((spec, idx) => {
                    const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
                    return (
                      <Line
                        key={spec.code}
                        type="monotone"
                        dataKey={spec.name}
                        stroke={colors[idx % colors.length]}
                        strokeWidth={1.75}
                        dot={{ r: 3 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12 text-center">
                <Calendar className="h-10 w-10 text-gray-300 mb-2" />
                <p className="font-semibold text-sm">Chế độ xem đơn tháng</p>
                <p className="text-xs text-gray-400 max-w-xs mt-1">
                  Hãy chọn chế độ <strong>"Khoảng"</strong> (ví dụ: Quý 1-4, 6 tháng, hoặc Cả năm) trên bộ lọc để kích hoạt biểu đồ xu hướng đa chu kỳ.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TẦNG 4: TOP TÁC ĐỘNG — TOP 10 TĂNG TRƯỞNG & SỤT GIẢM (INSIGHT RANKING) ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-gray-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                Xếp hạng Tác động Kỹ thuật (Top Impact: Tích cực & Cảnh báo)
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Top 10 phẫu thuật/thủ thuật có đóng góp tăng trưởng mạnh nhất và giảm sâu nhất trong kỳ ({periodMeta?.currentLabel || ''} vs {compareLabel})
            </p>
          </div>

          {/* Switch tab Top Impact */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setTopImpactTab('both')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                topImpactTab === 'both' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500'
              }`}
            >
              Song song cả hai
            </button>
            <button
              type="button"
              onClick={() => setTopImpactTab('gainers')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                topImpactTab === 'gainers' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-500'
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              Top 10 Tăng (Tích cực)
            </button>
            <button
              type="button"
              onClick={() => setTopImpactTab('losers')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                topImpactTab === 'losers' ? 'bg-white text-rose-700 shadow-2xs' : 'text-gray-500'
              }`}
            >
              <TrendingDown className="h-3 w-3" />
              Top 10 Giảm (Cảnh báo)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cột 1: TOP 10 TĂNG TRƯỞNG MẠNH NHẤT */}
          {(topImpactTab === 'both' || topImpactTab === 'gainers') && (
            <div className="border border-emerald-100 rounded-xl p-4 bg-emerald-50/20">
              <div className="flex items-center justify-between mb-3 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Top 10 Kỹ thuật Tăng trưởng Đột phá
                </span>
                <span className="text-[11px] font-normal text-emerald-600 lowercase">
                  xếp theo mức chênh lệch $\Delta$
                </span>
              </div>

              <div className="space-y-2.5">
                {topImpactData.gainers.length > 0 ? (
                  topImpactData.gainers.map((r, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-lg p-2.5 border border-emerald-100/80 shadow-2xs flex items-center justify-between gap-3 text-xs hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 truncate" title={r.tenKT}>
                            {r.tenKT}
                          </div>
                          <div className="text-[10.5px] text-gray-400 flex items-center gap-2">
                            <span>{r.specialtyName}</span>
                            {r.maTuongDuong && <span className="font-mono text-gray-300">({r.maTuongDuong})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-emerald-600">
                          +{metricMode === 'revenue' ? fmtMoney(r.diff) : `${fmtNum(r.diff)} ca`}
                        </div>
                        <div className="text-[10.5px] text-gray-500">
                          +{r.pct.toFixed(1)}% <span className="text-gray-300">|</span> Hiện tại: {metricMode === 'revenue' ? fmtMoney(r.cur) : fmtNum(r.cur)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-gray-400">Không có kỹ thuật nào tăng trưởng trong kỳ</div>
                )}
              </div>
            </div>
          )}

          {/* Cột 2: TOP 10 SỤT GIẢM SÂU NHẤT (CẢNH BÁO) */}
          {(topImpactTab === 'both' || topImpactTab === 'losers') && (
            <div className="border border-rose-100 rounded-xl p-4 bg-rose-50/20">
              <div className="flex items-center justify-between mb-3 text-rose-800 font-bold text-xs uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Top 10 Kỹ thuật Sụt giảm Báo động
                </span>
                <span className="text-[11px] font-normal text-rose-600 lowercase">
                  cần rà soát nguyên nhân
                </span>
              </div>

              <div className="space-y-2.5">
                {topImpactData.losers.length > 0 ? (
                  topImpactData.losers.map((r, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-lg p-2.5 border border-rose-100/80 shadow-2xs flex items-center justify-between gap-3 text-xs hover:border-rose-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 truncate" title={r.tenKT}>
                            {r.tenKT}
                          </div>
                          <div className="text-[10.5px] text-gray-400 flex items-center gap-2">
                            <span>{r.specialtyName}</span>
                            {r.maTuongDuong && <span className="font-mono text-gray-300">({r.maTuongDuong})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-rose-600">
                          {metricMode === 'revenue' ? fmtMoney(r.diff) : `${fmtNum(r.diff)} ca`}
                        </div>
                        <div className="text-[10.5px] text-gray-500">
                          {r.pct.toFixed(1)}% <span className="text-gray-300">|</span> Hiện tại: {metricMode === 'revenue' ? fmtMoney(r.cur) : fmtNum(r.cur)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-gray-400">Không có kỹ thuật nào sụt giảm trong kỳ</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
