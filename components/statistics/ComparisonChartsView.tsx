/**
 * ComparisonChartsView — Trực quan hóa chuyên sâu Phân tích So sánh Chuyên khoa
 * Đúc kết từ triết lý Lieflat Charts (Glance + Lupi Editorial + Interactive)
 * Tích hợp toàn diện góc độ Số lượng ca, Viện phí thành tiền, và Cơ cấu kỹ thuật y tế.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, Activity, DollarSign,
  Layers, Calendar, ArrowRight, Info, Check, Filter, Sparkles,
  BarChart3, RefreshCw, Eye, Maximize2, Minimize2, X, ChevronDown, Search,
  Sun, Moon
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

// Dropdown bộ lọc ẩn / hiện thành phần biểu đồ (Item Filter Popover)
interface ItemFilterDropdownProps {
  items: Array<{ id: string; name: string; maTuongDuong?: string }>;
  hiddenIds: string[];
  onChangeHidden: (hidden: string[]) => void;
  isDark?: boolean;
  label?: string;
}

const ItemFilterDropdown: React.FC<ItemFilterDropdownProps> = ({
  items,
  hiddenIds,
  onChangeHidden,
  isDark = false,
  label = 'Lọc mục',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      i =>
        i.name.toLowerCase().includes(term) ||
        (i.maTuongDuong && i.maTuongDuong.toLowerCase().includes(term))
    );
  }, [items, searchTerm]);

  const visibleCount = items.length - hiddenIds.length;

  const toggleItem = (id: string) => {
    if (hiddenIds.includes(id)) {
      onChangeHidden(hiddenIds.filter(x => x !== id));
    } else {
      onChangeHidden([...hiddenIds, id]);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
          isDark
            ? 'bg-[#2b2d30] border-gray-600 text-gray-200 hover:bg-[#35373b]'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-2xs'
        }`}
        title="Lọc ẩn/hiện các thành phần trên biểu đồ"
      >
        <Filter className="h-3.5 w-3.5 text-primary-500" />
        <span>{label}</span>
        <span
          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            hiddenIds.length > 0
              ? 'bg-amber-100 text-amber-800'
              : isDark
              ? 'bg-gray-700 text-gray-300'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {visibleCount}/{items.length}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 top-full mt-1.5 w-72 rounded-xl shadow-2xl border z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 ${
            isDark ? 'bg-[#222426] border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-800'
          }`}
        >
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border outline-none ${
                isDark
                  ? 'bg-[#18191a] border-gray-700 text-gray-100 placeholder-gray-500 focus:border-primary-500'
                  : 'bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-primary-500'
              }`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-200/50">
            <button
              type="button"
              onClick={() => onChangeHidden([])}
              className="text-primary-600 hover:underline font-bold cursor-pointer"
            >
              Hiện tất cả
            </button>
            <button
              type="button"
              onClick={() => onChangeHidden(items.map(i => i.id))}
              className="text-rose-500 hover:underline font-bold cursor-pointer"
            >
              Ẩn tất cả
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {filtered.map(item => {
              const isChecked = !hiddenIds.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-2 p-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                    isDark ? 'hover:bg-[#2c2e31]' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleItem(item.id)}
                    className="mt-0.5 rounded text-primary-600 focus:ring-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block font-medium" title={item.name}>
                      {item.name}
                    </span>
                    {item.maTuongDuong && (
                      <span className="text-[10px] text-gray-400 font-mono block truncate">
                        {item.maTuongDuong}
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-4 text-xs text-gray-400">Không có mục phù hợp</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Dropdown chọn Phạm vi (Toàn viện hoặc Từng chuyên khoa)
const ScopeSelect: React.FC<{
  scope: string;
  onChangeScope: (scope: string) => void;
  allSpecialties: SpecialtyMeta[];
  isDark?: boolean;
}> = ({ scope, onChangeScope, allSpecialties, isDark = false }) => {
  return (
    <select
      value={scope}
      onChange={e => onChangeScope(e.target.value)}
      className={`text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer outline-none transition-all ${
        isDark
          ? 'bg-[#2b2d30] border-gray-600 text-gray-200 hover:border-gray-500 focus:border-primary-500'
          : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300 focus:border-primary-500 shadow-2xs'
      }`}
    >
      <option value="hospital">🏥 Toàn viện (Nhóm khoa)</option>
      <optgroup label="Từng chuyên khoa (Chi tiết DVKT)">
        {allSpecialties.map(spec => (
          <option key={spec.code} value={spec.code}>
            🔹 {spec.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
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
  // Chế độ biểu thị Biểu đồ Tăng trưởng (Diverging Bar): 'percent' (%) | 'diff' (Con số thực tế)
  const [divergingMetric, setDivergingMetric] = useState<'percent' | 'diff'>('percent');

  // Phạm vi và bộ lọc của Biểu đồ Quy mô (Grouped Bar): 'hospital' | mã chuyên khoa
  const [groupedScope, setGroupedScope] = useState<'hospital' | string>('hospital');
  const [groupedHiddenItems, setGroupedHiddenItems] = useState<string[]>([]);

  // Phạm vi và bộ lọc của Biểu đồ Cầu nối (Waterfall): 'hospital' | mã chuyên khoa
  const [waterfallScope, setWaterfallScope] = useState<'hospital' | string>('hospital');
  const [waterfallMode, setWaterfallMode] = useState<'top' | 'all'>('top');
  const [waterfallHiddenItems, setWaterfallHiddenItems] = useState<string[]>([]);

  // Phạm vi của Biểu đồ Xu hướng thời gian (Timeline): 'hospital' | mã chuyên khoa
  const [timelineScope, setTimelineScope] = useState<'hospital' | string>('hospital');

  // Phạm vi của Bảng Xếp hạng Tác động (Top Impact): 'hospital' | mã chuyên khoa
  const [topImpactScope, setTopImpactScope] = useState<'hospital' | string>('hospital');

  // Trạng thái biểu đồ đang mở rộng toàn màn hình (Fullscreen Modal - NotebookLM style)
  type ExpandedChartType = 'diverging' | 'grouped' | 'waterfall' | 'revPerCase' | 'loai' | 'timeline' | 'topImpact' | null;
  const [expandedChart, setExpandedChart] = useState<ExpandedChartType>(null);
  // Giao diện sáng/tối trong popup mở rộng (Light / Dark theme toggle)
  const [modalTheme, setModalTheme] = useState<'dark' | 'light'>('dark');

  // Xử lý phím ESC để đóng popup phóng to
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedChart(null);
      }
    };
    if (expandedChart) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [expandedChart]);

  const getExpandedChartMeta = (type: ExpandedChartType) => {
    switch (type) {
      case 'diverging':
        return {
          title: 'Biến động Tăng trưởng Chuyên khoa',
          subtitle: divergingMetric === 'percent'
            ? `So sánh ${periodMeta?.currentLabel || 'Kỳ này'} với ${compareLabel} (Biểu thị theo Tỷ lệ %)`
            : `So sánh ${periodMeta?.currentLabel || 'Kỳ này'} với ${compareLabel} (Biểu thị theo Số chênh lệch thực tế Δ)`,
          badge: 'Diverging Bar',
          color: 'bg-emerald-500',
        };
      case 'grouped': {
        const spec = allSpecialtiesList.find(s => s.code === groupedScope);
        return {
          title: groupedScope === 'hospital'
            ? 'Quy mô Tuyệt đối theo Chuyên khoa'
            : `Quy mô Kỹ thuật - ${spec?.name || ''}`,
          subtitle: groupedScope === 'hospital'
            ? `So sánh tổng ${metricMode === 'revenue' ? 'viện phí' : 'số ca'} qua 3 kỳ đối chiếu toàn viện`
            : `Chi tiết các DVKT thuộc chuyên khoa ${spec?.name || ''} qua 3 kỳ đối chiếu`,
          badge: groupedScope === 'hospital' ? 'Grouped Bar (Toàn viện)' : 'Grouped Bar (DVKT)',
          color: 'bg-primary-600',
        };
      }
      case 'waterfall': {
        const spec = allSpecialtiesList.find(s => s.code === waterfallScope);
        return {
          title: waterfallScope === 'hospital'
            ? 'Cầu nối Đóng góp Biến động (Waterfall Bridge)'
            : `Cầu nối Biến động Kỹ thuật - ${spec?.name || ''}`,
          subtitle: waterfallScope === 'hospital'
            ? `Bóc tách mức tăng/giảm từ ${compareLabel} đến ${periodMeta?.currentLabel || 'Kỳ này'} do từng chuyên khoa`
            : `Bóc tách mức tăng/giảm của các DVKT thuộc chuyên khoa ${spec?.name || ''}`,
          badge: waterfallScope === 'hospital' ? 'Waterfall (Toàn viện)' : 'Waterfall (DVKT)',
          color: 'bg-purple-600',
        };
      }
      case 'revPerCase':
        return {
          title: 'Viện phí Bình quân trên 1 Ca phẫu thuật (Doanh thu / Ca)',
          subtitle: 'Đánh giá độ phức tạp kỹ thuật và giá trị bình quân ca mổ theo chuyên khoa so với toàn viện',
          badge: 'Avg Revenue per Case',
          color: 'bg-amber-500',
        };
      case 'loai':
        return {
          title: 'Cơ cấu Loại Phẫu thuật & Thủ thuật',
          subtitle: 'Phân bổ theo độ phức tạp chuyên môn: Loại Đặc biệt (PĐB), Loại 1, Loại 2, Loại 3 và Thủ thuật',
          badge: 'Stacked Bar',
          color: 'bg-cyan-600',
        };
      case 'timeline': {
        const spec = allSpecialtiesList.find(s => s.code === timelineScope);
        return {
          title: timelineScope === 'hospital'
            ? 'Xu hướng Diễn biến theo Thời gian (Timeline)'
            : `Xu hướng Diễn biến - ${spec?.name || ''}`,
          subtitle: timelineScope === 'hospital'
            ? (periodMode === 'range' ? 'Đường xu hướng qua các tháng trong khoảng thời gian đã chọn' : 'Đường xu hướng diễn biến của chu kỳ phân tích')
            : `Đường diễn biến xu hướng của chuyên khoa ${spec?.name || ''} qua các tháng`,
          badge: timelineScope === 'hospital' ? 'Timeline (Toàn viện)' : 'Timeline (Chuyên khoa)',
          color: 'bg-blue-600',
        };
      }
      case 'topImpact': {
        const spec = allSpecialtiesList.find(s => s.code === topImpactScope);
        return {
          title: topImpactScope === 'hospital'
            ? 'Xếp hạng Tác động Kỹ thuật (Toàn viện)'
            : `Xếp hạng Tác động Kỹ thuật — ${spec?.name || ''}`,
          subtitle: `Top 10 phẫu thuật/thủ thuật tăng trưởng mạnh nhất và giảm sâu nhất trong kỳ (${periodMeta?.currentLabel || ''} vs ${compareLabel})`,
          badge: topImpactScope === 'hospital' ? 'Impact Ranking (Toàn viện)' : `Impact (${spec?.shortName || spec?.name || ''})`,
          color: 'bg-rose-500',
        };
      }
      default:
        return null;
    }
  };

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
      .sort((a, b) => {
        if (divergingMetric === 'diff') {
          return b.diff - a.diff;
        }
        return b.pct - a.pct;
      });
  }, [groups, metricMode, compareTarget, divergingMetric]);

  // 2. DỮ LIỆU GROUPED BAR (Toàn viện hoặc Từng Chuyên khoa)
  const groupedFilterList = useMemo(() => {
    if (groupedScope === 'hospital') {
      return groups.map(g => ({
        id: g.specialty.code,
        name: g.specialty.name,
      }));
    }
    const selectedGroup = groups.find(g => g.specialty.code === groupedScope);
    if (!selectedGroup) return [];
    return selectedGroup.rows.map(r => ({
      id: r.tenKT,
      name: r.tenKT,
      maTuongDuong: r.maTuongDuong,
    }));
  }, [groups, groupedScope]);

  const rawGroupedItems = useMemo(() => {
    const isRev = metricMode === 'revenue';
    if (groupedScope === 'hospital') {
      return groups
        .map(g => {
          const cur = isRev ? g.totalCurrentRevenue : g.totalCurrent;
          const prev = isRev ? g.totalPrevRevenue : g.totalPrev;
          const samePeriod = isRev ? g.totalSamePeriodRevenue : g.totalSamePeriod;

          return {
            id: g.specialty.code,
            name: g.specialty.shortName || g.specialty.name,
            fullName: g.specialty.name,
            cur,
            prev,
            samePeriod,
            [periodMeta?.currentLabel || 'Kỳ này']: cur,
            [periodMeta?.prevLabel || 'Kỳ trước']: prev,
            ...(hasSamePeriodData ? { [periodMeta?.samePeriodLabel || 'Cùng kỳ']: samePeriod } : {}),
          };
        })
        .filter(item => item.cur > 0 || item.prev > 0);
    }

    const selectedGroup = groups.find(g => g.specialty.code === groupedScope);
    if (!selectedGroup) return [];

    return selectedGroup.rows
      .map(r => {
        const cur = isRev ? r.currentRevenue : r.currentCount;
        const prev = isRev ? r.prevRevenue : r.prevCount;
        const samePeriod = isRev ? r.samePeriodRevenue : r.samePeriodCount;

        return {
          id: r.tenKT,
          name: r.tenKT,
          fullName: r.tenKT,
          maTuongDuong: r.maTuongDuong,
          cur,
          prev,
          samePeriod,
          [periodMeta?.currentLabel || 'Kỳ này']: cur,
          [periodMeta?.prevLabel || 'Kỳ trước']: prev,
          ...(hasSamePeriodData ? { [periodMeta?.samePeriodLabel || 'Cùng kỳ']: samePeriod } : {}),
        };
      })
      .filter(item => item.cur > 0 || item.prev > 0)
      .sort((a, b) => b.cur - a.cur);
  }, [groups, groupedScope, metricMode, periodMeta, hasSamePeriodData]);

  const groupedBarData = useMemo(() => {
    return rawGroupedItems.filter(item => !groupedHiddenItems.includes(item.id));
  }, [rawGroupedItems, groupedHiddenItems]);

  const groupedYAxisWidth = useMemo(() => {
    if (groupedBarData.length === 0) return 130;
    const maxLen = Math.max(...groupedBarData.map(d => d.name.length));
    return Math.min(240, Math.max(120, maxLen * 6.5));
  }, [groupedBarData]);

  // 3. DỮ LIỆU WATERFALL (Cầu nối biến động đóng góp của từng khoa / từng kỹ thuật)
  const waterfallFilterList = useMemo(() => {
    if (waterfallScope === 'hospital') {
      return groups.map(g => ({
        id: g.specialty.code,
        name: g.specialty.name,
      }));
    }
    const selectedGroup = groups.find(g => g.specialty.code === waterfallScope);
    if (!selectedGroup) return [];
    return selectedGroup.rows.map(r => ({
      id: r.tenKT,
      name: r.tenKT,
      maTuongDuong: r.maTuongDuong,
    }));
  }, [groups, waterfallScope]);

  const waterfallData = useMemo(() => {
    const isRev = metricMode === 'revenue';

    let startTotal = 0;
    let endTotal = 0;
    let rawSteps: Array<{ id: string; name: string; fullName: string; diff: number }> = [];

    if (waterfallScope === 'hospital') {
      startTotal = groups.reduce((acc, g) => {
        const val = compareTarget === 'prev'
          ? (isRev ? g.totalPrevRevenue : g.totalPrev)
          : (isRev ? g.totalSamePeriodRevenue : g.totalSamePeriod);
        return acc + val;
      }, 0);

      endTotal = groups.reduce((acc, g) => {
        return acc + (isRev ? g.totalCurrentRevenue : g.totalCurrent);
      }, 0);

      groups.forEach(g => {
        const cur = isRev ? g.totalCurrentRevenue : g.totalCurrent;
        const comp = compareTarget === 'prev'
          ? (isRev ? g.totalPrevRevenue : g.totalPrev)
          : (isRev ? g.totalSamePeriodRevenue : g.totalSamePeriod);
        const diff = cur - comp;
        if ((cur > 0 || comp > 0) && !waterfallHiddenItems.includes(g.specialty.code)) {
          rawSteps.push({
            id: g.specialty.code,
            name: g.specialty.shortName || g.specialty.name,
            fullName: g.specialty.name,
            diff,
            cur,
          });
        }
      });
    } else {
      const selectedGroup = groups.find(g => g.specialty.code === waterfallScope);
      if (selectedGroup) {
        startTotal = compareTarget === 'prev'
          ? (isRev ? selectedGroup.totalPrevRevenue : selectedGroup.totalPrev)
          : (isRev ? selectedGroup.totalSamePeriodRevenue : selectedGroup.totalSamePeriod);

        endTotal = isRev ? selectedGroup.totalCurrentRevenue : selectedGroup.totalCurrent;

        selectedGroup.rows.forEach(r => {
          const cur = isRev ? r.currentRevenue : r.currentCount;
          const comp = compareTarget === 'prev'
            ? (isRev ? r.prevRevenue : r.prevCount)
            : (isRev ? r.samePeriodRevenue : r.samePeriodCount);
          const diff = cur - comp;
          if ((cur > 0 || comp > 0) && !waterfallHiddenItems.includes(r.tenKT)) {
            // Tên kỹ thuật rút gọn hợp lý trên trục X để không bị che, fullName hiển thị đầy đủ trong tooltip
            const shortName = r.tenKT.length > 25 ? r.tenKT.slice(0, 24) + '…' : r.tenKT;
            rawSteps.push({
              id: r.tenKT,
              name: shortName,
              fullName: r.tenKT,
              diff,
              cur,
            });
          }
        });
      }
    }

    // Nếu chọn mode 'top' và có hơn 12 kỹ thuật: giữ top 12 theo magnitude biến động (kết hợp quy mô), còn lại gom vào "Khác"
    let finalSteps = rawSteps;
    if (waterfallMode === 'top' && rawSteps.length > 12) {
      const sortedByAbs = [...rawSteps].sort((a, b) => {
        const absDiff = Math.abs(b.diff) - Math.abs(a.diff);
        if (absDiff !== 0) return absDiff;
        return (b.cur || 0) - (a.cur || 0);
      });
      const top12 = sortedByAbs.slice(0, 12);
      const others = sortedByAbs.slice(12);
      const otherDiff = others.reduce((sum, item) => sum + item.diff, 0);

      finalSteps = [...top12];
      if (others.length > 0) {
        finalSteps.push({
          id: '__others__',
          name: `Khác (${others.length} KT)`,
          fullName: `Nhóm các kỹ thuật khác (${others.length} kỹ thuật)`,
          diff: otherDiff,
          cur: others.reduce((sum, item) => sum + (item.cur || 0), 0),
        });
      }
    }

    // SẮP XẾP THEO CHIỀU HÌNH SIN VỚI ĐÁY LÕM:
    // Càng về bên trái là số âm càng nhiều (giảm mạnh nhất -> đáy lõm), càng về bên phải là số dương càng nhiều (tăng mạnh nhất)
    finalSteps.sort((a, b) => a.diff - b.diff);

    let runningTotal = startTotal;
    const items: Array<{
      name: string;
      fullName: string;
      base: number;
      value: number;
      diff: number;
      type: 'start' | 'step' | 'end';
      isPositive: boolean;
      displayVal: number;
    }> = [
      {
        name: `Đầu kỳ (${compareLabel})`,
        fullName: `Quy mô Đầu kỳ (${compareLabel})`,
        base: 0,
        value: startTotal,
        diff: startTotal,
        type: 'start',
        isPositive: true,
        displayVal: startTotal,
      },
    ];

    finalSteps.forEach(step => {
      const isPos = step.diff > 0;
      const stepBase = isPos ? runningTotal : runningTotal + step.diff;
      runningTotal += step.diff;

      items.push({
        name: step.name,
        fullName: step.fullName || step.name,
        base: Math.max(0, stepBase),
        value: Math.abs(step.diff),
        diff: step.diff,
        type: 'step',
        isPositive: isPos,
        displayVal: step.diff,
      });
    });

    items.push({
      name: `Cuối kỳ (${periodMeta?.currentLabel || 'Kỳ này'})`,
      fullName: `Quy mô Cuối kỳ (${periodMeta?.currentLabel || 'Kỳ này'})`,
      base: 0,
      value: endTotal,
      diff: endTotal,
      type: 'end',
      isPositive: true,
      displayVal: endTotal,
    });

    return items;
  }, [groups, waterfallScope, waterfallMode, waterfallHiddenItems, metricMode, compareTarget, compareLabel, periodMeta]);

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
    } else if (item.diff === 0) {
      text = metricMode === 'revenue' ? '0 đ' : '0 ca';
      fill = '#64748b';
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

  // Render nhãn trực tiếp trên Waterfall bar trong Modal mở rộng (Tương thích giao diện Sáng / Tối)
  const renderWaterfallModalLabel = (props: any) => {
    const { x, y, width, index } = props;
    const item = waterfallData[index];
    if (!item) return null;
    const isStartOrEnd = item.type === 'start' || item.type === 'end';
    let text = '';
    let fill = modalTheme === 'dark' ? '#93c5fd' : '#1d4ed8';
    if (isStartOrEnd) {
      text = metricMode === 'revenue' ? fmtMoney(item.value) : `${fmtNum(item.value)} ca`;
      fill = modalTheme === 'dark' ? '#93c5fd' : '#1e40af';
    } else if (item.diff === 0) {
      text = metricMode === 'revenue' ? '0 đ' : '0 ca';
      fill = modalTheme === 'dark' ? '#94a3b8' : '#64748b';
    } else {
      const sign = item.diff > 0 ? '+' : '';
      text = metricMode === 'revenue' ? `${sign}${fmtMoney(item.diff)}` : `${sign}${item.diff} ca`;
      fill = item.isPositive
        ? (modalTheme === 'dark' ? '#34d399' : '#059669')
        : (modalTheme === 'dark' ? '#f87171' : '#e11d48');
    }
    return (
      <text
        x={x + width / 2}
        y={Math.max(16, y - 8)}
        fill={fill}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
      >
        {text}
      </text>
    );
  };

  // Render box tên đầy đủ PTTT ngay dưới mỗi box số liệu Waterfall
  const renderWaterfallTick = (props: any, isDark: boolean = false) => {
    const { x, y, index } = props;
    const item = waterfallData[index];
    if (!item) return null;

    const boxWidth = 104;
    const boxHeight = 84;

    const isStartOrEnd = item.type === 'start' || item.type === 'end';
    const isZero = item.diff === 0;

    let bgClass = '';
    let borderClass = '';
    let textClass = '';
    let badgeClass = '';

    if (isStartOrEnd) {
      bgClass = isDark ? 'bg-blue-950/70' : 'bg-blue-50/95';
      borderClass = isDark ? 'border-blue-600/70' : 'border-blue-200';
      textClass = isDark ? 'text-blue-100' : 'text-blue-950';
      badgeClass = isDark ? 'bg-blue-900/90 text-blue-200 border-blue-700/60' : 'bg-blue-100 text-blue-800 border-blue-200';
    } else if (isZero) {
      bgClass = isDark ? 'bg-[#232528]' : 'bg-gray-50';
      borderClass = isDark ? 'border-gray-700' : 'border-gray-200';
      textClass = isDark ? 'text-gray-300' : 'text-gray-700';
      badgeClass = isDark ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-gray-200 text-gray-700 border-gray-300';
    } else if (item.isPositive) {
      bgClass = isDark ? 'bg-emerald-950/70' : 'bg-emerald-50/95';
      borderClass = isDark ? 'border-emerald-600/70' : 'border-emerald-200';
      textClass = isDark ? 'text-emerald-100' : 'text-emerald-950';
      badgeClass = isDark ? 'bg-emerald-900/90 text-emerald-200 border-emerald-700/60' : 'bg-emerald-100 text-emerald-800 border-emerald-200';
    } else {
      bgClass = isDark ? 'bg-rose-950/70' : 'bg-rose-50/95';
      borderClass = isDark ? 'border-rose-600/70' : 'border-rose-200';
      textClass = isDark ? 'text-rose-100' : 'text-rose-950';
      badgeClass = isDark ? 'bg-rose-900/90 text-rose-200 border-rose-700/60' : 'bg-rose-100 text-rose-800 border-rose-200';
    }

    const badgeText = isStartOrEnd
      ? (metricMode === 'revenue' ? fmtMoney(item.value) : `${fmtNum(item.value)} ca`)
      : isZero
      ? (metricMode === 'revenue' ? '0 đ' : '0 ca')
      : `${item.diff > 0 ? '+' : ''}${metricMode === 'revenue' ? fmtMoney(item.diff) : `${item.diff} ca`}`;

    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject
          x={-boxWidth / 2}
          y={10}
          width={boxWidth}
          height={boxHeight}
          style={{ overflow: 'visible' }}
        >
          <div
            className={`h-full p-2 rounded-xl border flex flex-col justify-between shadow-2xs transition-all text-center select-none ${bgClass} ${borderClass}`}
            title={item.fullName}
          >
            <div
              className={`text-[11px] leading-snug font-semibold line-clamp-3 overflow-hidden text-ellipsis ${textClass}`}
            >
              {item.fullName || item.name}
            </div>
            <div className="pt-1 flex justify-center">
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}`}>
                {badgeText}
              </span>
            </div>
          </div>
        </foreignObject>
      </g>
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

    const targetRows = (topImpactScope === 'hospital' || topImpactScope === 'all')
      ? allRows
      : allRows.filter(r => r.specialty === topImpactScope);

    const processed = targetRows.map(r => {
      const cur = isRev ? r.currentRevenue : r.currentCount;
      const comp = compareTarget === 'prev'
        ? (isRev ? r.prevRevenue : r.prevCount)
        : (isRev ? r.samePeriodRevenue : r.samePeriodCount);
      const diff = cur - comp;
      let pct = 0;
      if (comp > 0) {
        pct = (diff / comp) * 100;
      } else if (cur > 0) {
        pct = 100;
      }

      return {
        tenKT: r.tenKT,
        maTuongDuong: r.maTuongDuong,
        specialtyName: r.specialtyName,
        cur,
        prev: comp,
        comp,
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
  }, [allRows, topImpactScope, metricMode, compareTarget]);

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
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  Biến động Tăng trưởng Chuyên khoa
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {divergingMetric === 'percent'
                  ? `So sánh ${periodMeta?.currentLabel || 'Kỳ này'} với ${compareLabel} (Biểu thị theo Tỷ lệ %)`
                  : `So sánh ${periodMeta?.currentLabel || 'Kỳ này'} với ${compareLabel} (Biểu thị theo Số chênh lệch thực tế Δ)`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Segmented Toggle: % vs Con số thực tế */}
              <div className="inline-flex p-0.5 bg-gray-100 rounded-lg border border-gray-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setDivergingMetric('percent')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    divergingMetric === 'percent'
                      ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Tỷ lệ %
                </button>
                <button
                  type="button"
                  onClick={() => setDivergingMetric('diff')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    divergingMetric === 'diff'
                      ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Số chênh lệch ({metricMode === 'revenue' ? 'VNĐ' : 'Số ca'})
                </button>
              </div>

              <span className="hidden sm:inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Diverging Bar
              </span>
              <button
                type="button"
                onClick={() => setExpandedChart('diverging')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Mở rộng toàn màn hình (Expand the viewer)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body: Danh sách thanh đối xứng */}
          <div className="flex-1 space-y-3.5 my-auto py-2">
            {divergingData.map((item) => {
              const maxAbsVal = divergingMetric === 'diff'
                ? Math.max(...divergingData.map(d => Math.abs(d.diff)), 1)
                : Math.max(...divergingData.map(d => Math.abs(d.pct)), 10);
              const curValDiff = divergingMetric === 'diff' ? Math.abs(item.diff) : Math.abs(item.pct);
              const barWidthPct = Math.min(Math.round((curValDiff / maxAbsVal) * 100), 100);

              const formattedDiff = `${item.diff > 0 ? '+' : ''}${metricMode === 'revenue' ? fmtMoney(item.diff) : `${item.diff} ca`}`;
              const formattedPct = `${item.isPositive ? '+' : ''}${item.pct}%`;
              const displayBadge = divergingMetric === 'diff'
                ? `${formattedDiff} (${formattedPct})`
                : `${formattedPct} (${formattedDiff})`;

              const barInnerLabel = divergingMetric === 'diff' ? formattedDiff : formattedPct;

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
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-extrabold ${
                        item.diff === 0
                          ? 'bg-gray-100 text-gray-700 border border-gray-200'
                          : item.isPositive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {displayBadge}
                      </span>
                    </div>
                  </div>

                  {/* Diverging bar track (Trục giữa 0%) - Chiều cao h-7, thanh cột chuẩn Lieflat bo góc nhẹ */}
                  <div className="grid grid-cols-2 gap-1.5 h-7 bg-gray-100 rounded-lg overflow-hidden p-0.5">
                    {/* Cột Trái: Âm / Sụt giảm */}
                    <div className="flex justify-end items-center h-full">
                      {item.diff < 0 && (
                        <div
                          className="h-full bg-rose-500 rounded-md transition-all duration-500 group-hover:bg-rose-600 flex items-center justify-start px-2 text-[11px] font-extrabold text-white shadow-xs"
                          style={{ width: `${Math.max(barWidthPct, 14)}%` }}
                        >
                          <span className="truncate">{barInnerLabel}</span>
                        </div>
                      )}
                    </div>

                    {/* Cột Phải: Dương / Tăng trưởng */}
                    <div className="flex justify-start items-center h-full">
                      {item.diff > 0 && (
                        <div
                          className="h-full bg-emerald-500 rounded-md transition-all duration-500 group-hover:bg-emerald-600 flex items-center justify-end px-2 text-[11px] font-extrabold text-white shadow-xs"
                          style={{ width: `${Math.max(barWidthPct, 14)}%` }}
                        >
                          <span className="truncate">{barInnerLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1 text-rose-600 font-semibold">
              <TrendingDown className="h-3.5 w-3.5" /> Phía trái: Sụt giảm ({divergingMetric === 'percent' ? '% âm' : 'Δ giảm'})
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <TrendingUp className="h-3.5 w-3.5" /> Phía phải: Tăng trưởng ({divergingMetric === 'percent' ? '% dương' : 'Δ tăng'})
            </span>
          </div>
        </div>

        {/* Biểu đồ 2: Grouped Comparison Bar (Quy mô 3 Kỳ) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  {groupedScope === 'hospital'
                    ? 'Quy mô Tuyệt đối theo Chuyên khoa'
                    : `Quy mô Kỹ thuật — ${allSpecialtiesList.find(s => s.code === groupedScope)?.name || ''}`}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {groupedScope === 'hospital'
                  ? `So sánh tổng ${metricMode === 'revenue' ? 'viện phí' : 'số ca'} qua 3 kỳ đối chiếu toàn viện`
                  : `Chi tiết các DVKT thuộc chuyên khoa qua 3 kỳ (${groupedBarData.length} kỹ thuật)`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <ScopeSelect scope={groupedScope} onChangeScope={setGroupedScope} allSpecialties={allSpecialtiesList} />
              <ItemFilterDropdown items={groupedFilterList} hiddenIds={groupedHiddenItems} onChangeHidden={setGroupedHiddenItems} label="Lọc thành phần" />
              <button
                type="button"
                onClick={() => setExpandedChart('grouped')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Mở rộng toàn màn hình (Expand the viewer)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full max-h-[540px] overflow-y-auto pr-1">
            {groupedBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(340, groupedBarData.length * 52)}>
                <BarChart
                  data={groupedBarData}
                  layout="vertical"
                  margin={{ top: 10, right: 80, left: 10, bottom: 5 }}
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
                    width={groupedYAxisWidth}
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
                    name={periodMeta?.currentLabel || 'Kỳ này'}
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
                    name={periodMeta?.prevLabel || 'Kỳ trước'}
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
                      name={periodMeta?.samePeriodLabel || 'Cùng kỳ'}
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
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 text-xs text-center">
                <Layers className="h-8 w-8 text-gray-300 mb-2" />
                <p>Không có dữ liệu hiển thị hoặc các mục đã bị ẩn qua bộ lọc</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TẦNG 2: CẦU NỐI BIẾN ĐỘNG & TÀI CHÍNH Y TẾ ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biểu đồ 3: Waterfall Chart (Cầu nối Đóng góp Biến động) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  {waterfallScope === 'hospital'
                    ? 'Cầu nối Đóng góp Biến động (Waterfall)'
                    : `Cầu nối Biến động Kỹ thuật — ${allSpecialtiesList.find(s => s.code === waterfallScope)?.name || ''}`}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {waterfallScope === 'hospital'
                  ? `Giải thích mức tăng/giảm từ ${compareLabel} đến ${periodMeta?.currentLabel || 'Kỳ này'} do từng chuyên khoa`
                  : `Bóc tách mức tăng/giảm của từng DVKT trong chuyên khoa (${waterfallData.length - 2} bước đóng góp)`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <ScopeSelect scope={waterfallScope} onChangeScope={setWaterfallScope} allSpecialties={allSpecialtiesList} />
              {waterfallScope !== 'hospital' && (
                <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setWaterfallMode('top')}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      waterfallMode === 'top' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500'
                    }`}
                  >
                    Top 12
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaterfallMode('all')}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      waterfallMode === 'all' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500'
                    }`}
                  >
                    Tất cả
                  </button>
                </div>
              )}
              <ItemFilterDropdown items={waterfallFilterList} hiddenIds={waterfallHiddenItems} onChangeHidden={setWaterfallHiddenItems} label="Lọc mục" />
              <button
                type="button"
                onClick={() => setExpandedChart('waterfall')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Mở rộng toàn màn hình (Expand the viewer)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full overflow-x-auto pb-2">
            <div style={{ minWidth: Math.max(760, waterfallData.length * 115) }} className="h-[440px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 25, right: 20, left: 20, bottom: 105 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    height={105}
                    interval={0}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={(props: any) => renderWaterfallTick(props, false)}
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
                        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs max-w-sm">
                          <div className="font-bold text-gray-900 border-b pb-1 mb-1">{item.fullName || item.name}</div>
                          {item.type === 'step' ? (
                            <div>
                              <span className="text-gray-500">Mức đóng góp: </span>
                              <strong className={item.diff === 0 ? 'text-gray-600 font-bold' : item.isPositive ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
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
                  <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} minPointSize={3}>
                    <LabelList content={renderWaterfallLabel} />
                    {waterfallData.map((entry, index) => {
                      let color = '#3b82f6';
                      if (entry.type === 'start' || entry.type === 'end') {
                        color = '#1e3a8a';
                      } else if (entry.diff === 0) {
                        color = '#94a3b8';
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
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Avg per Case
              </span>
              <button
                type="button"
                onClick={() => setExpandedChart('revPerCase')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Mở rộng toàn màn hình (Expand the viewer)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
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

            {/* Toggle Đơn vị hiển thị: Số lượng vs Viện phí & Nút Expand */}
            <div className="flex items-center gap-2 shrink-0">
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
              <button
                type="button"
                onClick={() => setExpandedChart('loai')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Mở rộng toàn màn hình (Expand the viewer)"
              >
                <Maximize2 className="h-4 w-4" />
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
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                  {timelineScope === 'hospital'
                    ? 'Xu hướng Diễn biến theo Thời gian'
                    : `Xu hướng Thời gian — ${allSpecialtiesList.find(s => s.code === timelineScope)?.name || ''}`}
                </h3>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {timelineScope === 'hospital'
                  ? (periodMode === 'range'
                    ? 'Đường xu hướng qua các tháng trong khoảng thời gian đã chọn'
                    : 'Đường xu hướng diễn biến của chu kỳ phân tích')
                  : `Đường diễn biến xu hướng của riêng chuyên khoa ${allSpecialtiesList.find(s => s.code === timelineScope)?.name || ''}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <ScopeSelect scope={timelineScope} onChangeScope={setTimelineScope} allSpecialties={allSpecialtiesList} />
              <button
                type="button"
                onClick={() => setExpandedChart('timeline')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Mở rộng toàn màn hình (Expand the viewer)"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
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
                  {timelineScope === 'hospital' ? (
                    <>
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
                    </>
                  ) : (
                    (() => {
                      const selSpec = allSpecialtiesList.find(s => s.code === timelineScope);
                      const specName = selSpec?.name || '';
                      return (
                        <Line
                          type="monotone"
                          dataKey={specName}
                          name={specName}
                          stroke="#2563eb"
                          strokeWidth={3}
                          dot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#ffffff' }}
                          activeDot={{ r: 7 }}
                        >
                          <LabelList
                            dataKey={specName}
                            position="top"
                            formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : `${fmtNum(val)} ca`) : ''}
                            style={{ fontSize: 11, fontWeight: 700, fill: '#1d4ed8' }}
                            offset={8}
                          />
                        </Line>
                      );
                    })()
                  )}
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
                {topImpactScope === 'hospital'
                  ? 'Xếp hạng Tác động Kỹ thuật (Top Impact: Tích cực & Cảnh báo)'
                  : `Xếp hạng Tác động Kỹ thuật — ${allSpecialtiesList.find(s => s.code === topImpactScope)?.name || ''}`}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {topImpactScope === 'hospital'
                ? `Top 10 phẫu thuật/thủ thuật toàn viện có đóng góp tăng trưởng mạnh nhất và giảm sâu nhất trong kỳ (${periodMeta?.currentLabel || ''} vs ${compareLabel})`
                : `Top phẫu thuật/thủ thuật của ${allSpecialtiesList.find(s => s.code === topImpactScope)?.name || ''} đóng góp tăng/giảm mạnh nhất trong kỳ (${periodMeta?.currentLabel || ''} vs ${compareLabel})`}
            </p>
          </div>

          {/* ScopeSelect, Switch tab Top Impact & Nút Expand */}
          <div className="flex flex-wrap items-center gap-2">
            <ScopeSelect scope={topImpactScope} onChangeScope={setTopImpactScope} allSpecialties={allSpecialtiesList} />
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

            <button
              type="button"
              onClick={() => setExpandedChart('topImpact')}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="Mở rộng toàn màn hình (Expand the viewer)"
            >
              <Maximize2 className="h-4 w-4" />
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

      {/* ── MODAL PHÓNG TO TOÀN MÀN HÌNH (EXPANDED VIEWER - NOTEBOOKLM STYLE) ── */}
      {expandedChart && (() => {
        const meta = getExpandedChartMeta(expandedChart);
        if (!meta) return null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 bg-black/70 backdrop-blur-sm transition-all duration-300 animate-in fade-in"
            onClick={() => setExpandedChart(null)}
          >
            <div
              className={`rounded-2xl sm:rounded-3xl shadow-2xl border w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 transition-colors ${
                modalTheme === 'dark' ? 'bg-[#1e1f20] text-gray-100 border-gray-700/60' : 'bg-white text-gray-900 border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header phong cách NotebookLM với toggle Sáng/Tối */}
              <div
                className={`flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 border-b shrink-0 transition-colors ${
                  modalTheme === 'dark' ? 'border-gray-700/60 bg-[#252729]/80 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color} shrink-0`} />
                    <h2 className={`text-base sm:text-xl font-bold truncate tracking-tight ${modalTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {meta.title}
                    </h2>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                        modalTheme === 'dark' ? 'bg-gray-800 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-700 border-gray-300'
                      }`}
                    >
                      {meta.badge}
                    </span>
                  </div>
                  <div className={`flex flex-wrap items-center gap-2 mt-1.5 text-xs ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span
                      className={`px-2.5 py-0.5 rounded-full border font-medium ${
                        modalTheme === 'dark' ? 'bg-[#303336] text-gray-300 border-gray-600/70' : 'bg-gray-200/80 text-gray-700 border-gray-300'
                      }`}
                    >
                      Toàn viện: {groups.length} chuyên khoa
                    </span>
                    <span>•</span>
                    <span className="truncate">{meta.subtitle}</span>
                  </div>
                </div>

                {/* Các nút tương tác: Toggle metric, so sánh, Đổi theme Sáng/Tối, Thu nhỏ, Đóng */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Scope & Filter Controls specific to each chart in modal */}
                  {expandedChart === 'grouped' && (
                    <div className="flex items-center gap-2">
                      <ScopeSelect scope={groupedScope} onChangeScope={setGroupedScope} allSpecialties={allSpecialtiesList} isDark={modalTheme === 'dark'} />
                      <ItemFilterDropdown items={groupedFilterList} hiddenIds={groupedHiddenItems} onChangeHidden={setGroupedHiddenItems} label="Lọc mục" isDark={modalTheme === 'dark'} />
                    </div>
                  )}

                  {expandedChart === 'waterfall' && (
                    <div className="flex items-center gap-2">
                      <ScopeSelect scope={waterfallScope} onChangeScope={setWaterfallScope} allSpecialties={allSpecialtiesList} isDark={modalTheme === 'dark'} />
                      {waterfallScope !== 'hospital' && (
                        <div className={`flex items-center p-0.5 rounded-lg text-xs font-bold border ${modalTheme === 'dark' ? 'bg-[#303336] border-gray-600/50' : 'bg-gray-200 border-gray-300/80'}`}>
                          <button
                            type="button"
                            onClick={() => setWaterfallMode('top')}
                            className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                              waterfallMode === 'top'
                                ? (modalTheme === 'dark' ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-2xs')
                                : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                            }`}
                          >
                            Top 12
                          </button>
                          <button
                            type="button"
                            onClick={() => setWaterfallMode('all')}
                            className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                              waterfallMode === 'all'
                                ? (modalTheme === 'dark' ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-2xs')
                                : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                            }`}
                          >
                            Tất cả
                          </button>
                        </div>
                      )}
                      <ItemFilterDropdown items={waterfallFilterList} hiddenIds={waterfallHiddenItems} onChangeHidden={setWaterfallHiddenItems} label="Lọc mục" isDark={modalTheme === 'dark'} />
                    </div>
                  )}

                  {expandedChart === 'timeline' && (
                    <ScopeSelect scope={timelineScope} onChangeScope={setTimelineScope} allSpecialties={allSpecialtiesList} isDark={modalTheme === 'dark'} />
                  )}

                  {expandedChart === 'topImpact' && (
                    <ScopeSelect scope={topImpactScope} onChangeScope={setTopImpactScope} allSpecialties={allSpecialtiesList} isDark={modalTheme === 'dark'} />
                  )}

                  {/* Metric Toggle inside Modal */}
                  <div className={`flex items-center p-0.5 rounded-lg text-xs font-medium border ${modalTheme === 'dark' ? 'bg-[#303336] border-gray-600/50' : 'bg-gray-200 border-gray-300/80'}`}>
                    <button
                      type="button"
                      onClick={() => setMetricMode('count')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        metricMode === 'count'
                          ? 'bg-primary-600 text-white shadow-xs'
                          : (modalTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900')
                      }`}
                    >
                      Số ca
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetricMode('revenue')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                        metricMode === 'revenue'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : (modalTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900')
                      }`}
                    >
                      Viện phí
                    </button>
                  </div>

                  {/* Target Compare Toggle inside Modal */}
                  {hasSamePeriodData && (
                    <div className={`hidden sm:flex items-center p-0.5 rounded-lg text-xs font-medium border ${modalTheme === 'dark' ? 'bg-[#303336] border-gray-600/50' : 'bg-gray-200 border-gray-300/80'}`}>
                      <button
                        type="button"
                        onClick={() => setCompareTarget('prev')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                          compareTarget === 'prev'
                            ? (modalTheme === 'dark' ? 'bg-gray-700 text-white shadow-xs' : 'bg-white text-gray-900 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900')
                        }`}
                      >
                        Kỳ trước
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareTarget('samePeriod')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                          compareTarget === 'samePeriod'
                            ? (modalTheme === 'dark' ? 'bg-gray-700 text-white shadow-xs' : 'bg-white text-gray-900 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900')
                        }`}
                      >
                        Cùng kỳ
                      </button>
                    </div>
                  )}

                  {/* Top Impact sub-toggle inside modal */}
                  {expandedChart === 'topImpact' && (
                    <div className={`flex items-center p-0.5 rounded-lg text-xs font-bold border ${modalTheme === 'dark' ? 'bg-[#303336] border-gray-600/50' : 'bg-gray-200 border-gray-300/80'}`}>
                      <button
                        type="button"
                        onClick={() => setTopImpactTab('both')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          topImpactTab === 'both'
                            ? (modalTheme === 'dark' ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Cả hai
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopImpactTab('gainers')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          topImpactTab === 'gainers'
                            ? (modalTheme === 'dark' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Top Tăng
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopImpactTab('losers')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          topImpactTab === 'losers'
                            ? (modalTheme === 'dark' ? 'bg-rose-800 text-rose-100' : 'bg-rose-100 text-rose-800 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Top Giảm
                      </button>
                    </div>
                  )}

                  {/* Stacked Bar Loai Toggle inside modal */}
                  {expandedChart === 'loai' && (
                    <div className={`flex items-center p-0.5 rounded-lg text-xs font-bold border ${modalTheme === 'dark' ? 'bg-[#303336] border-gray-600/50' : 'bg-gray-200 border-gray-300/80'}`}>
                      <button
                        type="button"
                        onClick={() => setLoaiViewMode('count')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          loaiViewMode === 'count'
                            ? (modalTheme === 'dark' ? 'bg-cyan-800 text-cyan-100' : 'bg-cyan-100 text-cyan-800 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Số ca
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoaiViewMode('revenue')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          loaiViewMode === 'revenue'
                            ? (modalTheme === 'dark' ? 'bg-cyan-800 text-cyan-100' : 'bg-cyan-100 text-cyan-800 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Viện phí
                      </button>
                    </div>
                  )}

                  {/* Diverging Metric Toggle inside modal */}
                  {expandedChart === 'diverging' && (
                    <div className={`flex items-center p-0.5 rounded-lg text-xs font-bold border ${modalTheme === 'dark' ? 'bg-[#303336] border-gray-600/50' : 'bg-gray-200 border-gray-300/80'}`}>
                      <button
                        type="button"
                        onClick={() => setDivergingMetric('percent')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          divergingMetric === 'percent'
                            ? (modalTheme === 'dark' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Tỷ lệ %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDivergingMetric('diff')}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          divergingMetric === 'diff'
                            ? (modalTheme === 'dark' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800 shadow-2xs')
                            : (modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600')
                        }`}
                      >
                        Số chênh lệch ({metricMode === 'revenue' ? 'VNĐ' : 'Số ca'})
                      </button>
                    </div>
                  )}

                  {/* Toggle Giao diện Sáng / Tối trong Popup (Theme Switch) */}
                  <button
                    type="button"
                    onClick={() => setModalTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                    className={`p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                      modalTheme === 'dark'
                        ? 'bg-[#303336] text-amber-400 hover:text-amber-300 hover:bg-[#3c4043] border border-gray-600/50'
                        : 'bg-white text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 shadow-2xs'
                    }`}
                    title={modalTheme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
                  >
                    {modalTheme === 'dark' ? (
                      <>
                        <Sun className="h-4 w-4 text-amber-400" />
                        <span className="hidden sm:inline">Sáng</span>
                      </>
                    ) : (
                      <>
                        <Moon className="h-4 w-4 text-gray-600" />
                        <span className="hidden sm:inline">Tối</span>
                      </>
                    )}
                  </button>

                  {/* Thu nhỏ button (Minimize2 - NotebookLM style) */}
                  <button
                    type="button"
                    onClick={() => setExpandedChart(null)}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ml-1 ${
                      modalTheme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700/70' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
                    }`}
                    title="Thu nhỏ (Collapse viewer)"
                  >
                    <Minimize2 className="h-5 w-5" />
                  </button>

                  {/* Đóng button (X - NotebookLM style) */}
                  <button
                    type="button"
                    onClick={() => setExpandedChart(null)}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      modalTheme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700/70' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
                    }`}
                    title="Đóng (ESC)"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Body: Chart Canvas to rộng, mượt mà */}
              <div className={`flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col transition-colors ${modalTheme === 'dark' ? 'bg-[#18191a]' : 'bg-gray-50/70'}`}>
                {/* 1. Diverging Expanded */}
                {expandedChart === 'diverging' && (
                  <div className="max-w-4xl mx-auto w-full py-4 space-y-4">
                    <div className={`rounded-2xl p-6 border shadow-lg space-y-4 transition-colors ${modalTheme === 'dark' ? 'bg-[#202224] border-gray-700/80' : 'bg-white border-gray-200 shadow-sm'}`}>
                      {divergingData.map((item) => {
                        const maxAbsVal = divergingMetric === 'diff'
                          ? Math.max(...divergingData.map(d => Math.abs(d.diff)), 1)
                          : Math.max(...divergingData.map(d => Math.abs(d.pct)), 10);
                        const curValDiff = divergingMetric === 'diff' ? Math.abs(item.diff) : Math.abs(item.pct);
                        const barWidthPct = Math.min(Math.round((curValDiff / maxAbsVal) * 100), 100);

                        const formattedDiff = `${item.diff > 0 ? '+' : ''}${metricMode === 'revenue' ? fmtMoney(item.diff) : `${item.diff} ca`}`;
                        const formattedPct = `${item.isPositive ? '+' : ''}${item.pct}%`;
                        const displayBadge = divergingMetric === 'diff'
                          ? `${formattedDiff} (${formattedPct})`
                          : `${formattedPct} (${formattedDiff})`;

                        const barInnerLabel = divergingMetric === 'diff' ? formattedDiff : formattedPct;

                        return (
                          <div key={item.code} className={`p-3 rounded-xl transition-colors ${modalTheme === 'dark' ? 'hover:bg-[#282a2d]' : 'hover:bg-gray-50'}`}>
                            <div className="flex flex-wrap items-center justify-between text-sm mb-2 gap-2">
                              <span className={`font-bold flex items-center gap-2 text-base ${modalTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                                <span>{item.name}</span>
                              </span>
                              <div className="flex flex-wrap items-center gap-3 font-semibold text-xs sm:text-sm">
                                <span className={modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                                  Kỳ này: <strong className={modalTheme === 'dark' ? 'text-white' : 'text-gray-900'}>{metricMode === 'revenue' ? fmtMoney(item.curVal) : `${fmtNum(item.curVal)} ca`}</strong>
                                </span>
                                <span className={modalTheme === 'dark' ? 'text-gray-600' : 'text-gray-300'}>|</span>
                                <span className={modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                                  {compareLabel}: <strong className={modalTheme === 'dark' ? 'text-gray-300' : 'text-gray-800'}>{metricMode === 'revenue' ? fmtMoney(item.compVal) : `${fmtNum(item.compVal)} ca`}</strong>
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold ${
                                  item.diff === 0
                                    ? (modalTheme === 'dark' ? 'bg-gray-800 text-gray-400 border border-gray-700' : 'bg-gray-100 text-gray-700 border border-gray-300')
                                    : item.isPositive
                                    ? (modalTheme === 'dark' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700' : 'bg-emerald-100 text-emerald-800 border border-emerald-300')
                                    : (modalTheme === 'dark' ? 'bg-rose-950/80 text-rose-300 border border-rose-700' : 'bg-rose-100 text-rose-800 border border-rose-300')
                                }`}>
                                  {displayBadge}
                                </span>
                              </div>
                            </div>

                            {/* Diverging bar track - Chuẩn thanh biểu đồ cao h-8, bo góc nhẹ rounded-lg */}
                            <div className={`grid grid-cols-2 gap-2 h-8 rounded-lg overflow-hidden p-1 border ${modalTheme === 'dark' ? 'bg-[#151617] border-gray-700/60' : 'bg-gray-100 border-gray-200'}`}>
                              <div className="flex justify-end items-center">
                                {item.diff < 0 && (
                                  <div
                                    className="h-full bg-rose-500 rounded-md transition-all duration-500 group-hover:bg-rose-400 flex items-center justify-end px-2 shadow-2xs"
                                    style={{ width: `${Math.max(barWidthPct, 10)}%` }}
                                  >
                                    <span className="text-[11px] font-bold text-white whitespace-nowrap">
                                      {barInnerLabel}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-start items-center">
                                {item.diff > 0 && (
                                  <div
                                    className="h-full bg-emerald-500 rounded-md transition-all duration-500 group-hover:bg-emerald-400 flex items-center justify-start px-2 shadow-2xs"
                                    style={{ width: `${Math.max(barWidthPct, 10)}%` }}
                                  >
                                    <span className="text-[11px] font-bold text-white whitespace-nowrap">
                                      {barInnerLabel}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Grouped Expanded */}
                {expandedChart === 'grouped' && (
                  <div className="w-full flex-1 min-h-[500px] overflow-y-auto pr-2">
                    <ResponsiveContainer width="100%" height={Math.max(520, groupedBarData.length * 52)}>
                      <BarChart
                        data={groupedBarData}
                        layout="vertical"
                        margin={{ top: 20, right: 90, left: 30, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={modalTheme === 'dark' ? '#334155' : '#e2e8f0'} />
                        <XAxis
                          type="number"
                          tickFormatter={val => metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                          tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#94a3b8' : '#64748b' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#e2e8f0' : '#1e293b', fontWeight: 600 }}
                          width={Math.min(260, groupedYAxisWidth + 30)}
                        />
                        <Tooltip
                          content={<LupiTooltip />}
                          formatter={(val: number) => metricMode === 'revenue' ? fmtFullMoney(val) : `${fmtNum(val)} ca`}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10, fill: modalTheme === 'dark' ? '#cbd5e1' : '#334155' }} />
                        {/* 1. Kỳ hiện tại (trên cùng theo yêu cầu) */}
                        <Bar
                          dataKey="cur"
                          name={periodMeta?.currentLabel || 'Kỳ hiện tại'}
                          fill="#3b82f6"
                          radius={[0, 4, 4, 0]}
                          barSize={14}
                        >
                          <LabelList
                            dataKey="cur"
                            position="right"
                            formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)) : ''}
                            style={{ fontSize: 11, fill: modalTheme === 'dark' ? '#93c5fd' : '#1d4ed8', fontWeight: 700 }}
                          />
                        </Bar>
                        {/* 2. Kỳ trước (ở giữa) */}
                        <Bar
                          dataKey="prev"
                          name={periodMeta?.prevLabel || 'Kỳ trước'}
                          fill={modalTheme === 'dark' ? '#94a3b8' : '#64748b'}
                          radius={[0, 4, 4, 0]}
                          barSize={14}
                        >
                          <LabelList
                            dataKey="prev"
                            position="right"
                            formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)) : ''}
                            style={{ fontSize: 11, fill: modalTheme === 'dark' ? '#cbd5e1' : '#475569', fontWeight: 600 }}
                          />
                        </Bar>
                        {/* 3. Cùng kỳ năm trước (dưới cùng) */}
                        {hasSamePeriodData && (
                          <Bar
                            dataKey="samePeriod"
                            name={periodMeta?.samePeriodLabel || 'Cùng kỳ'}
                            fill={modalTheme === 'dark' ? '#64748b' : '#94a3b8'}
                            radius={[0, 4, 4, 0]}
                            barSize={14}
                          >
                            <LabelList
                              dataKey="samePeriod"
                              position="right"
                              formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)) : ''}
                              style={{ fontSize: 11, fill: modalTheme === 'dark' ? '#94a3b8' : '#64748b', fontWeight: 600 }}
                            />
                          </Bar>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 3. Waterfall Expanded */}
                {expandedChart === 'waterfall' && (
                  <div className="w-full flex-1 min-h-[500px] overflow-x-auto pb-4">
                    <div style={{ minWidth: Math.max(960, waterfallData.length * 120) }} className="h-[580px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={waterfallData} margin={{ top: 35, right: 30, left: 30, bottom: 105 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={modalTheme === 'dark' ? '#334155' : '#e2e8f0'} />
                          <XAxis
                            dataKey="name"
                            height={105}
                            interval={0}
                            tickLine={false}
                            axisLine={{ stroke: modalTheme === 'dark' ? '#475569' : '#cbd5e1' }}
                            tick={(props: any) => renderWaterfallTick(props, modalTheme === 'dark')}
                          />
                          <YAxis
                            tickFormatter={val => metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                            tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#94a3b8' : '#64748b' }}
                          />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (!active || !payload || !payload.length) return null;
                              const item = payload[0].payload;
                              const isDark = modalTheme === 'dark';
                              return (
                                <div className={`border rounded-xl shadow-xl p-3 text-xs max-w-sm ${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                                  <div className={`font-bold border-b pb-1 mb-1 ${isDark ? 'border-gray-700 text-white' : 'border-gray-200 text-gray-900'}`}>
                                    {item.fullName || item.name}
                                  </div>
                                  {item.type === 'step' ? (
                                    <div>
                                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Mức đóng góp: </span>
                                      <strong className={item.diff === 0 ? (isDark ? 'text-gray-400 font-bold' : 'text-gray-600 font-bold') : item.isPositive ? (isDark ? 'text-emerald-400 font-bold' : 'text-emerald-600 font-bold') : (isDark ? 'text-rose-400 font-bold' : 'text-rose-600 font-bold')}>
                                        {item.diff > 0 ? '+' : ''}{metricMode === 'revenue' ? fmtFullMoney(item.diff) : `${item.diff} ca`}
                                      </strong>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Tổng quy mô: </span>
                                      <strong className={isDark ? 'text-white font-bold' : 'text-gray-900 font-bold'}>
                                        {metricMode === 'revenue' ? fmtFullMoney(item.value) : `${fmtNum(item.value)} ca`}
                                      </strong>
                                    </div>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                          <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} minPointSize={3}>
                            <LabelList content={renderWaterfallModalLabel} />
                            {waterfallData.map((entry, index) => {
                              let color = '#3b82f6';
                              if (entry.type === 'start' || entry.type === 'end') {
                                color = modalTheme === 'dark' ? '#60a5fa' : '#1e40af';
                              } else if (entry.diff === 0) {
                                color = modalTheme === 'dark' ? '#64748b' : '#94a3b8';
                              } else if (entry.isPositive) {
                                color = PALETTE.emerald;
                              } else {
                                color = PALETTE.rose;
                              }
                              return <Cell key={`cell-exp-${index}`} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* 4. RevPerCase Expanded */}
                {expandedChart === 'revPerCase' && (
                  <div className="w-full flex-1 min-h-[500px]">
                    <ResponsiveContainer width="100%" height={520}>
                      <BarChart data={revPerCaseData.list} margin={{ top: 30, right: 40, left: 40, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={modalTheme === 'dark' ? '#334155' : '#e2e8f0'} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#cbd5e1' : '#334155', fontWeight: 600 }}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis
                          tickFormatter={val => fmtMoney(val)}
                          tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#94a3b8' : '#64748b' }}
                        />
                        <Tooltip
                          content={({ active, payload }: any) => {
                            if (!active || !payload || !payload.length) return null;
                            const item = payload[0].payload;
                            const isDark = modalTheme === 'dark';
                            return (
                              <div className={`border rounded-xl shadow-xl p-3 text-xs space-y-1 ${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                                <div className={`font-bold border-b pb-1 mb-1 ${isDark ? 'border-gray-700 text-white' : 'border-gray-200 text-gray-900'}`}>{item.fullName}</div>
                                <div className={`flex justify-between gap-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                  <span>Bình quân ca ({periodMeta?.currentLabel}):</span>
                                  <strong className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>{fmtFullMoney(item.avgCur)}</strong>
                                </div>
                                <div className={`flex justify-between gap-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                  <span>Tổng số ca:</span>
                                  <strong>{fmtNum(item.curCount)} ca</strong>
                                </div>
                                <div className={`flex justify-between gap-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                  <span>Tổng viện phí:</span>
                                  <strong>{fmtMoney(item.curRev)}</strong>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine
                          y={revPerCaseData.hospitalAvg}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: `Bình quân Toàn viện: ${fmtMoney(revPerCaseData.hospitalAvg)}`,
                            position: 'top',
                            fill: '#f59e0b',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        />
                        <Bar dataKey="avgCur" name="Bình quân ca mổ" radius={[6, 6, 0, 0]}>
                          <LabelList
                            dataKey="avgCur"
                            position="top"
                            formatter={(val: number) => val > 0 ? fmtMoney(val) : ''}
                            style={{ fontSize: 11, fontWeight: 700, fill: modalTheme === 'dark' ? '#5eead4' : '#0f3a60' }}
                            offset={8}
                          />
                          {revPerCaseData.list.map((entry, index) => (
                            <Cell
                              key={`cell-exp-rev-${index}`}
                              fill={entry.avgCur >= revPerCaseData.hospitalAvg ? '#0d9488' : '#f59e0b'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 5. Loai Expanded */}
                {expandedChart === 'loai' && (
                  <div className="w-full flex-1 flex flex-col justify-between min-h-[500px]">
                    <div className="flex-1 w-full min-h-[440px]">
                      <ResponsiveContainer width="100%" height={480}>
                        <BarChart data={loaiChartData} margin={{ top: 30, right: 40, left: 40, bottom: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={modalTheme === 'dark' ? '#334155' : '#e2e8f0'} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#cbd5e1' : '#334155', fontWeight: 600 }}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis
                            tickFormatter={val => loaiViewMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                            tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#94a3b8' : '#64748b' }}
                          />
                          <Tooltip
                            content={<LupiTooltip />}
                            formatter={(val: number) => loaiViewMode === 'revenue' ? fmtMoney(val) : `${fmtNum(val)} ca`}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10, fill: modalTheme === 'dark' ? '#cbd5e1' : '#334155' }} />
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
                          <Bar dataKey="emptyTop" stackId="loai" fill="transparent">
                            <LabelList content={renderStackTotalLabel} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Hàng tóm tắt số liệu tổng toàn viện */}
                    <div className={`mt-4 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${modalTheme === 'dark' ? 'bg-[#202224] border-gray-700/80' : 'bg-white border-gray-200 shadow-xs'}`}>
                      <span className={`font-bold ${modalTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Tổng toàn viện theo cơ cấu:</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg border ${modalTheme === 'dark' ? 'text-purple-300 bg-purple-950/80 border-purple-700' : 'text-purple-700 bg-purple-50 border-purple-200'}`}>
                          PĐB: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.db) : `${fmtNum(loaiSummary.db)} ca`}
                        </span>
                        <span className={`flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg border ${modalTheme === 'dark' ? 'text-blue-300 bg-blue-950/80 border-blue-700' : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
                          P1: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.p1) : `${fmtNum(loaiSummary.p1)} ca`}
                        </span>
                        <span className={`flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg border ${modalTheme === 'dark' ? 'text-cyan-300 bg-cyan-950/80 border-cyan-700' : 'text-cyan-700 bg-cyan-50 border-cyan-200'}`}>
                          P2: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.p2) : `${fmtNum(loaiSummary.p2)} ca`}
                        </span>
                        <span className={`flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg border ${modalTheme === 'dark' ? 'text-emerald-300 bg-emerald-950/80 border-emerald-700' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
                          P3: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.p3) : `${fmtNum(loaiSummary.p3)} ca`}
                        </span>
                        <span className={`flex items-center gap-1 font-bold px-2.5 py-1 rounded-lg border ${modalTheme === 'dark' ? 'text-amber-300 bg-amber-950/80 border-amber-700' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                          TT: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.tt) : `${fmtNum(loaiSummary.tt)} ca`}
                        </span>
                        <span className={`flex items-center gap-1 font-extrabold px-2.5 py-1 rounded-lg border ${modalTheme === 'dark' ? 'text-white bg-gray-700 border-gray-600' : 'text-gray-900 bg-gray-100 border-gray-300'}`}>
                          Tổng: {loaiViewMode === 'revenue' ? fmtMoney(loaiSummary.total) : `${fmtNum(loaiSummary.total)} ca`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. Timeline Expanded */}
                {expandedChart === 'timeline' && (
                  <div className="w-full flex-1 min-h-[500px]">
                    {timelineChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={520}>
                        <LineChart data={timelineChartData} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={modalTheme === 'dark' ? '#334155' : '#e2e8f0'} />
                          <XAxis dataKey="name" tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#cbd5e1' : '#334155' }} />
                          <YAxis
                            tickFormatter={val => metricMode === 'revenue' ? fmtMoney(val) : fmtNum(val)}
                            tick={{ fontSize: 12, fill: modalTheme === 'dark' ? '#94a3b8' : '#64748b' }}
                          />
                          <Tooltip
                            content={<LupiTooltip />}
                            formatter={(val: number) => metricMode === 'revenue' ? fmtFullMoney(val) : `${fmtNum(val)} ca`}
                          />
                          {timelineScope === 'hospital' ? (
                            <>
                              <Line
                                type="monotone"
                                dataKey="total"
                                name="Tổng Toàn viện"
                                stroke={modalTheme === 'dark' ? '#f8fafc' : '#0f172a'}
                                strokeWidth={3}
                                dot={{ r: 5 }}
                                activeDot={{ r: 7 }}
                              >
                                <LabelList
                                  dataKey="total"
                                  position="top"
                                  formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : `${fmtNum(val)} ca`) : ''}
                                  style={{ fontSize: 11, fontWeight: 700, fill: modalTheme === 'dark' ? '#f8fafc' : '#0f172a' }}
                                  offset={10}
                                />
                              </Line>
                              {allSpecialtiesList.slice(0, 8).map((spec, idx) => {
                                const colors = ['#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#22d3ee', '#f472b6', '#4ade80', '#fb923c'];
                                return (
                                  <Line
                                    key={spec.code}
                                    type="monotone"
                                    dataKey={spec.name}
                                    stroke={colors[idx % colors.length]}
                                    strokeWidth={2}
                                    dot={{ r: 3.5 }}
                                  />
                                );
                              })}
                            </>
                          ) : (
                            (() => {
                              const selSpec = allSpecialtiesList.find(s => s.code === timelineScope);
                              const specName = selSpec?.name || '';
                              return (
                                <Line
                                  type="monotone"
                                  dataKey={specName}
                                  name={specName}
                                  stroke="#38bdf8"
                                  strokeWidth={3.5}
                                  dot={{ r: 6, fill: '#38bdf8', strokeWidth: 2, stroke: '#0f172a' }}
                                  activeDot={{ r: 8 }}
                                >
                                  <LabelList
                                    dataKey={specName}
                                    position="top"
                                    formatter={(val: number) => val > 0 ? (metricMode === 'revenue' ? fmtMoney(val) : `${fmtNum(val)} ca`) : ''}
                                    style={{ fontSize: 12, fontWeight: 700, fill: '#38bdf8' }}
                                    offset={10}
                                  />
                                </Line>
                              );
                            })()
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className={`h-full flex flex-col items-center justify-center py-16 text-center ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Calendar className="h-12 w-12 text-gray-400 mb-3" />
                        <p className={`font-semibold text-base ${modalTheme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>Chế độ xem đơn tháng</p>
                        <p className={`text-xs max-w-sm mt-1 ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          Hãy chọn chế độ <strong>"Khoảng"</strong> (ví dụ: Quý 1-4, 6 tháng, hoặc Cả năm) trên bộ lọc để kích hoạt biểu đồ xu hướng đa chu kỳ.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. Top Impact Expanded */}
                {expandedChart === 'topImpact' && (
                  <div className="w-full flex-1 max-w-6xl mx-auto py-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Cột 1: TOP 10 TĂNG TRƯỞNG MẠNH NHẤT */}
                      {(topImpactTab === 'both' || topImpactTab === 'gainers') && (
                        <div className={`border rounded-2xl p-5 transition-colors ${modalTheme === 'dark' ? 'border-emerald-800/60 bg-[#1b2721]' : 'border-emerald-200 bg-emerald-50/50 shadow-xs'}`}>
                          <div className={`flex items-center justify-between mb-4 font-bold text-sm uppercase tracking-wider ${modalTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-800'}`}>
                            <span className="flex items-center gap-2">
                              <TrendingUp className={`h-4 w-4 ${modalTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`} />
                              Top 10 Kỹ thuật Tăng trưởng Đột phá
                            </span>
                            <span className={`text-xs font-normal lowercase ${modalTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              đóng góp lớn nhất
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {topImpactData.gainers.length > 0 ? (
                              topImpactData.gainers.map((r, idx) => (
                                <div
                                  key={idx}
                                  className={`rounded-xl p-3 border shadow-xs flex items-center justify-between gap-3 text-xs transition-colors ${modalTheme === 'dark' ? 'bg-[#22332a] border-emerald-700/50 hover:border-emerald-500' : 'bg-white border-emerald-100 hover:border-emerald-300 shadow-2xs'}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center shrink-0 border ${modalTheme === 'dark' ? 'bg-emerald-900 text-emerald-200 border-emerald-600' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className={`font-semibold text-sm truncate ${modalTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} title={r.tenKT}>
                                        {r.tenKT}
                                      </div>
                                      <div className={`text-[11px] flex items-center gap-2 mt-0.5 ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <span className={modalTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'}>{r.specialtyName}</span>
                                        {r.maTuongDuong && <span className="font-mono text-gray-400">({r.maTuongDuong})</span>}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className={`font-bold text-sm ${modalTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                      +{metricMode === 'revenue' ? fmtMoney(r.diff) : `${fmtNum(r.diff)} ca`}
                                    </div>
                                    <div className={`text-[11px] ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                      +{r.pct.toFixed(1)}% <span className={modalTheme === 'dark' ? 'text-gray-600' : 'text-gray-300'}>|</span> Hiện tại: {metricMode === 'revenue' ? fmtMoney(r.cur) : fmtNum(r.cur)}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-8 text-xs text-gray-400">Không có kỹ thuật nào tăng trưởng trong kỳ</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Cột 2: TOP 10 SỤT GIẢM SÂU NHẤT */}
                      {(topImpactTab === 'both' || topImpactTab === 'losers') && (
                        <div className={`border rounded-2xl p-5 transition-colors ${modalTheme === 'dark' ? 'border-rose-800/60 bg-[#291c20]' : 'border-rose-200 bg-rose-50/50 shadow-xs'}`}>
                          <div className={`flex items-center justify-between mb-4 font-bold text-sm uppercase tracking-wider ${modalTheme === 'dark' ? 'text-rose-300' : 'text-rose-800'}`}>
                            <span className="flex items-center gap-2">
                              <AlertTriangle className={`h-4 w-4 ${modalTheme === 'dark' ? 'text-rose-400' : 'text-rose-600'}`} />
                              Top 10 Kỹ thuật Sụt giảm Báo động
                            </span>
                            <span className={`text-xs font-normal lowercase ${modalTheme === 'dark' ? 'text-rose-400' : 'text-rose-600'}`}>
                              cần rà soát nguyên nhân
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {topImpactData.losers.length > 0 ? (
                              topImpactData.losers.map((r, idx) => (
                                <div
                                  key={idx}
                                  className={`rounded-xl p-3 border shadow-xs flex items-center justify-between gap-3 text-xs transition-colors ${modalTheme === 'dark' ? 'bg-[#352026] border-rose-700/50 hover:border-rose-500' : 'bg-white border-rose-100 hover:border-rose-300 shadow-2xs'}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center shrink-0 border ${modalTheme === 'dark' ? 'bg-rose-900 text-rose-200 border-rose-600' : 'bg-rose-100 text-rose-800 border-rose-300'}`}>
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className={`font-semibold text-sm truncate ${modalTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`} title={r.tenKT}>
                                        {r.tenKT}
                                      </div>
                                      <div className={`text-[11px] flex items-center gap-2 mt-0.5 ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <span className={modalTheme === 'dark' ? 'text-rose-300' : 'text-rose-700'}>{r.specialtyName}</span>
                                        {r.maTuongDuong && <span className="font-mono text-gray-400">({r.maTuongDuong})</span>}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className={`font-bold text-sm ${modalTheme === 'dark' ? 'text-rose-400' : 'text-rose-700'}`}>
                                      {metricMode === 'revenue' ? fmtMoney(r.diff) : `${fmtNum(r.diff)} ca`}
                                    </div>
                                    <div className={`text-[11px] ${modalTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                      {r.pct.toFixed(1)}% <span className={modalTheme === 'dark' ? 'text-gray-600' : 'text-gray-300'}>|</span> Hiện tại: {metricMode === 'revenue' ? fmtMoney(r.cur) : fmtNum(r.cur)}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-8 text-xs text-gray-400">Không có kỹ thuật nào sụt giảm trong kỳ</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer thanh công cụ kiểu NotebookLM */}
              <div className={`px-6 py-3 border-t flex flex-wrap items-center justify-between text-xs shrink-0 transition-colors ${modalTheme === 'dark' ? 'border-gray-700/60 bg-[#252729]/90 text-gray-400' : 'border-gray-200 bg-white text-gray-600'}`}>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Chế độ xem mở rộng • Nhấn <strong>ESC</strong> hoặc click ra ngoài để thu nhỏ</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={modalTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>Initial-SurgicalDataPro Charts • Lieflat Standard</span>
                  <button
                    type="button"
                    onClick={() => setExpandedChart(null)}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer border ${modalTheme === 'dark' ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300'}`}
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
