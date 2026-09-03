/**
 * SpecialtyComparisonTab — Phân tích so sánh phẫu thuật theo chuyên khoa
 * Tab thứ 2 trong trang Thống kê phẫu thuật
 *
 * Tính năng hoàn thiện:
 * 1. Hiển thị chuyên khoa bằng text badge rõ ràng kèm nút chuyển nhóm (popover menu)
 * 2. Tùy chọn Bật/Tắt hiển thị số chênh tuyệt đối (± ca) - Mặc định BẬT
 * 3. Bảng "Tất cả chuyên khoa" dạng dọc hợp nhất toàn bộ danh sách, có phân trang ghi nhớ tùy chọn
 * 4. Sắp xếp đa trạng thái 3 chu kỳ (Giảm dần ↓ -> Tăng dần ↑ -> Hủy bỏ ↺) trên mọi cột
 * 5. Xuất file Excel (gồm Sheet Tổng hợp toàn viện + Các sheet chuyên khoa)
 * 6. Xuất file CSV (chuẩn UTF-8 có BOM \uFEFF tương thích 100% với NotebookLM)
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart3, Download, RefreshCw, AlertTriangle, TrendingUp, TrendingDown,
  Search, Filter, CheckCircle2, ChevronDown, ChevronRight, Layers, FileSpreadsheet,
  Calendar, Activity, Sparkles, SlidersHorizontal, ArrowRight, Info,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronsLeft, ChevronsRight,
  ArrowLeftRight, FileText, Check, ToggleLeft, ToggleRight
} from 'lucide-react';
import { StaffMember } from '../../types';
import {
  getSpecialtyComparisonData,
  SpecialtyReportGroup,
  SpecialtyMeta,
  getAllSpecialties,
  SpecialtyCode,
  ComparisonConfig,
  getComparisonThresholdConfig,
  PeriodSpec,
  PeriodMetadata,
  saveSpecialtyOverride,
  getSpecialtyOverrides,
  ComparisonRow,
} from '../../services/specialtyComparisonService';
import { exportSpecialtyComparisonExcel, exportSpecialtyComparisonCSV } from '../../services/excelExportComparisonService';

interface Props {
  staffList: StaffMember[];
  initialYear?: number;
  initialMonth?: number;
}

type SortColumnKey = 'tenKT' | 'specialty' | 'currentCount' | 'prevCount' | 'prevDiff' | 'prevChangePct' | 'samePeriodCount' | 'samePeriodDiff' | 'samePeriodChangePct' | 'status';
type SortDirection = 'asc' | 'desc' | null;

const STORAGE_PAGE_SIZE_KEY = 'sdp_comparison_page_size';
const STORAGE_SORT_COL_KEY = 'sdp_comparison_sort_col';
const STORAGE_SORT_DIR_KEY = 'sdp_comparison_sort_dir';
const STORAGE_SHOW_DIFF_KEY = 'sdp_comparison_show_diff';

export const SpecialtyComparisonTab: React.FC<Props> = ({
  staffList,
  initialYear,
  initialMonth,
}) => {
  const currentRealYear = new Date().getFullYear();
  const currentRealMonth = new Date().getMonth() + 1;

  // Period mode: 'single' (Tháng) | 'range' (Khoảng)
  const [periodMode, setPeriodMode] = useState<'single' | 'range'>('single');

  // Single mode state
  const [selectedYear, setSelectedYear] = useState<number>(() => initialYear || currentRealYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => initialMonth || currentRealMonth);

  // Range mode state
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [fromYear, setFromYear] = useState<number>(() => initialYear || currentRealYear);
  const [toMonth, setToMonth] = useState<number>(() => initialMonth || currentRealMonth);
  const [toYear, setToYear] = useState<number>(() => initialYear || currentRealYear);

  // Filter & Search state
  const [selectedSpecialty, setSelectedSpecialty] = useState<SpecialtyCode | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ALERT' | 'POSITIVE'>('all');

  // Option: Show Absolute Diff (± ca) - Default TRUE
  const [showDiff, setShowDiff] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_SHOW_DIFF_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  // Sorting state (3-state: desc -> asc -> null)
  const [sortCol, setSortCol] = useState<SortColumnKey | null>(() => {
    return (localStorage.getItem(STORAGE_SORT_COL_KEY) as SortColumnKey) || null;
  });
  const [sortDir, setSortDir] = useState<SortDirection>(() => {
    return (localStorage.getItem(STORAGE_SORT_DIR_KEY) as SortDirection) || null;
  });

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_PAGE_SIZE_KEY);
    return saved ? Number(saved) : 20;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reassignment Popover State
  const [openReassignKey, setOpenReassignKey] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Data & loading state
  const [loading, setLoading] = useState<boolean>(false);
  const [groups, setGroups] = useState<SpecialtyReportGroup[]>([]);
  const [allSpecialtiesList, setAllSpecialtiesList] = useState<SpecialtyMeta[]>(getAllSpecialties);
  const [periodMeta, setPeriodMeta] = useState<PeriodMetadata | null>(null);
  const [thresholdConfig, setThresholdConfig] = useState<ComparisonConfig>(getComparisonThresholdConfig);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenReassignKey(null);
      }
    };
    if (openReassignKey) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openReassignKey]);

  // Year options for selectors
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentRealYear + 1; y >= currentRealYear - 4; y--) {
      years.push(y);
    }
    return years;
  }, [currentRealYear]);

  // Toggle Show Diff
  const handleToggleShowDiff = () => {
    const next = !showDiff;
    setShowDiff(next);
    localStorage.setItem(STORAGE_SHOW_DIFF_KEY, String(next));
  };

  // Load comparison data
  const loadData = useCallback(async () => {
    if (periodMode === 'range') {
      const fromTotal = fromYear * 12 + fromMonth;
      const toTotal = toYear * 12 + toMonth;
      if (toTotal < fromTotal) {
        showToast('Thời gian "Đến" phải lớn hơn hoặc bằng thời gian "Từ"', 'error');
        return;
      }
    }

    setLoading(true);
    try {
      const cfg = getComparisonThresholdConfig();
      setThresholdConfig(cfg);
      setAllSpecialtiesList(getAllSpecialties());

      const periodSpec: PeriodSpec = periodMode === 'single'
        ? { mode: 'single', targetMonth: selectedMonth, targetYear: selectedYear }
        : { mode: 'range', targetMonth: toMonth, targetYear: toYear, fromMonth, fromYear, toMonth, toYear };

      const result = await getSpecialtyComparisonData(periodSpec, staffList, cfg);
      setGroups(result.groups);
      setPeriodMeta(result.periodMeta);
    } catch (err: any) {
      console.error('Error loading specialty comparison data:', err);
      showToast('Có lỗi xảy ra khi tải dữ liệu phân tích', 'error');
    } finally {
      setLoading(false);
    }
  }, [periodMode, selectedMonth, selectedYear, fromMonth, fromYear, toMonth, toYear, staffList]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSpecialty, searchTerm, filterStatus, pageSize]);

  // Handle reassigning a surgery to another specialty
  const handleReassignSpecialty = (tenKT: string, newSpecialty: SpecialtyCode) => {
    saveSpecialtyOverride(tenKT, newSpecialty);
    const targetSpec = allSpecialtiesList.find(s => s.code === newSpecialty);
    setOpenReassignKey(null);
    showToast(`Đã chuyển "${tenKT}" sang nhóm ${targetSpec?.name || newSpecialty}`);
    loadData();
  };

  // Handle Column Header Sort Click (Cycle: desc -> asc -> null)
  const handleSortClick = (colKey: SortColumnKey) => {
    let nextDir: SortDirection = 'desc';

    if (sortCol === colKey) {
      if (sortDir === 'desc') {
        nextDir = 'asc';
      } else if (sortDir === 'asc') {
        nextDir = null; // Hủy bỏ
      } else {
        nextDir = 'desc';
      }
    } else {
      nextDir = colKey === 'tenKT' || colKey === 'specialty' ? 'asc' : 'desc';
    }

    const nextCol = nextDir === null ? null : colKey;
    setSortCol(nextCol);
    setSortDir(nextDir);

    if (nextCol) {
      localStorage.setItem(STORAGE_SORT_COL_KEY, nextCol);
      localStorage.setItem(STORAGE_SORT_DIR_KEY, nextDir as string);
    } else {
      localStorage.removeItem(STORAGE_SORT_COL_KEY);
      localStorage.removeItem(STORAGE_SORT_DIR_KEY);
    }
  };

  // Change page size and persist
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    localStorage.setItem(STORAGE_PAGE_SIZE_KEY, String(newSize));
  };

  // Quick Range Presets
  const applyQuickPreset = (fM: number, tM: number, yr: number) => {
    setFromMonth(fM);
    setToMonth(tM);
    setFromYear(yr);
    setToYear(yr);
  };

  // Handle Export Excel
  const handleExportExcel = async () => {
    if (groups.length === 0 || groups.every(g => g.rows.length === 0) || !periodMeta) {
      showToast('Không có dữ liệu để xuất Excel', 'error');
      return;
    }
    setExporting(true);
    try {
      await exportSpecialtyComparisonExcel(groups, periodMeta, thresholdConfig, showDiff);
      showToast('Đã xuất file Excel phân tích thành công!');
    } catch (err: any) {
      console.error('Export error:', err);
      showToast('Lỗi khi xuất file Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Handle Export CSV (NotebookLM)
  const handleExportCsv = () => {
    if (groups.length === 0 || groups.every(g => g.rows.length === 0) || !periodMeta) {
      showToast('Không có dữ liệu để xuất CSV', 'error');
      return;
    }
    setExportingCsv(true);
    try {
      exportSpecialtyComparisonCSV(groups, periodMeta, showDiff);
      showToast('Đã xuất file CSV (chuẩn NotebookLM) thành công!');
    } catch (err: any) {
      console.error('Export CSV error:', err);
      showToast('Lỗi khi xuất file CSV', 'error');
    } finally {
      setExportingCsv(false);
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

    const prevDiff = totalCurrent - totalPrev;
    const prevChangePct = totalPrev > 0 ? ((totalCurrent - totalPrev) / totalPrev) * 100 : null;
    const samePeriodDiff = periodMeta?.hasSamePeriodData ? (totalCurrent - totalSamePeriod) : null;
    const samePeriodChangePct = (periodMeta?.hasSamePeriodData && totalSamePeriod > 0)
      ? ((totalCurrent - totalSamePeriod) / totalSamePeriod) * 100
      : null;

    return {
      totalCurrent,
      totalPrev,
      totalPrevDiff: prevDiff,
      totalSamePeriod,
      totalSamePeriodDiff: samePeriodDiff,
      prevChangePct,
      samePeriodChangePct,
      totalAlerts,
      totalPositives,
      totalDistinctSurgeries,
    };
  }, [groups, periodMeta]);

  // Sorter Function
  const sortRows = useCallback((rows: ComparisonRow[]): ComparisonRow[] => {
    if (!sortCol || !sortDir) {
      return [...rows].sort((a, b) => {
        const order = { ALERT: 1, POSITIVE: 2, NORMAL: 3 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        if (b.currentCount !== a.currentCount) {
          return b.currentCount - a.currentCount;
        }
        return a.tenKT.localeCompare(b.tenKT, 'vi');
      });
    }

    return [...rows].sort((a, b) => {
      let valA: any = a[sortCol];
      let valB: any = b[sortCol];

      if (sortCol === 'status') {
        const order = { ALERT: 1, POSITIVE: 2, NORMAL: 3 };
        valA = order[a.status];
        valB = order[b.status];
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB, 'vi');
        return sortDir === 'asc' ? cmp : -cmp;
      }

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortCol, sortDir]);

  // Combined Rows for "Tất cả chuyên khoa"
  const allCombinedRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let rows: ComparisonRow[] = [];

    groups.forEach(g => {
      rows.push(...g.rows);
    });

    if (term) {
      rows = rows.filter(r => r.tenKT.toLowerCase().includes(term) || r.note.toLowerCase().includes(term) || r.specialtyName.toLowerCase().includes(term));
    }

    if (filterStatus !== 'all') {
      rows = rows.filter(r => r.status === filterStatus);
    }

    return sortRows(rows);
  }, [groups, searchTerm, filterStatus, sortRows]);

  // Single specialty group rows
  const filteredSingleGroup = useMemo(() => {
    if (selectedSpecialty === 'all') return null;

    const grp = groups.find(g => g.specialty.code === selectedSpecialty);
    if (!grp) return null;

    const term = searchTerm.trim().toLowerCase();
    let rows = grp.rows;

    if (term) {
      rows = rows.filter(r => r.tenKT.toLowerCase().includes(term) || r.note.toLowerCase().includes(term));
    }

    if (filterStatus !== 'all') {
      rows = rows.filter(r => r.status === filterStatus);
    }

    return {
      ...grp,
      rows: sortRows(rows),
    };
  }, [groups, selectedSpecialty, searchTerm, filterStatus, sortRows]);

  // Paginated rows
  const paginatedAllRows = useMemo(() => {
    if (pageSize === -1) return allCombinedRows;
    const start = (currentPage - 1) * pageSize;
    return allCombinedRows.slice(start, start + pageSize);
  }, [allCombinedRows, currentPage, pageSize]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(allCombinedRows.length / pageSize));

  const fmtPctStr = (val: number | null) => {
    if (val === null) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  };

  const fmtDiffCell = (diff: number | null) => {
    if (diff === null) return '—';
    const sign = diff > 0 ? '+' : '';
    const color = diff < 0 ? 'text-red-600 font-bold' : (diff > 0 ? 'text-emerald-700 font-bold' : 'text-gray-500');
    return <span className={color}>{sign}{diff}</span>;
  };

  // Helper render sort header icon
  const renderSortIcon = (colKey: SortColumnKey) => {
    if (sortCol !== colKey) {
      return <ArrowUpDown className="h-3 w-3 text-white/40 group-hover/th:text-white/80 transition-colors inline-block ml-1" />;
    }
    if (sortDir === 'asc') {
      return <ArrowUp className="h-3.5 w-3.5 text-amber-300 font-bold inline-block ml-1 animate-pulse" />;
    }
    if (sortDir === 'desc') {
      return <ArrowDown className="h-3.5 w-3.5 text-amber-300 font-bold inline-block ml-1 animate-pulse" />;
    }
    return null;
  };

  // Specialty Badge Helper
  const getSpecialtyBadgeColor = (code: SpecialtyCode) => {
    switch (code) {
      case 'ngoai_th': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'ctch': return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'mat': return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'tmh': return 'bg-cyan-50 text-cyan-800 border-cyan-200';
      case 'phu_san': return 'bg-rose-50 text-rose-800 border-rose-200';
      default: return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* ── Toast Notification ── */}
      {toast && (
        <div className={`fixed top-16 right-5 z-50 px-4 py-2 rounded-lg shadow-lg border text-xs font-semibold flex items-center gap-2 animate-slide-in ${
          toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ── Top Toolbar: Mode Switcher & Time Selectors ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-3.5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Mode Toggle & Selectors */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Mode Switcher */}
            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setPeriodMode('single')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  periodMode === 'single'
                    ? 'bg-white text-primary-800 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Tháng
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('range')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  periodMode === 'range'
                    ? 'bg-white text-primary-800 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Khoảng
              </button>
            </div>

            {/* Single Month Selectors */}
            {periodMode === 'single' ? (
              <div className="flex items-center gap-2 bg-primary-50/50 border border-primary-100/80 rounded-lg px-2.5 py-1">
                <Calendar className="h-3.5 w-3.5 text-primary-700 shrink-0" />
                <span className="text-xs font-bold text-primary-900">Kỳ phân tích:</span>

                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-white border border-primary-200 rounded px-2 py-0.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-2xs cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-white border border-primary-200 rounded px-2 py-0.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-2xs cursor-pointer"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>
            ) : (
              /* Range Selectors: From ... To ... */
              <div className="flex flex-wrap items-center gap-2 bg-primary-50/50 border border-primary-100/80 rounded-lg px-2.5 py-1">
                <Calendar className="h-3.5 w-3.5 text-primary-700 shrink-0" />
                <span className="text-xs font-bold text-primary-900">Từ:</span>

                <select
                  value={fromMonth}
                  onChange={(e) => setFromMonth(Number(e.target.value))}
                  className="bg-white border border-primary-200 rounded px-2 py-0.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-2xs cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>

                <select
                  value={fromYear}
                  onChange={(e) => {
                    const yr = Number(e.target.value);
                    setFromYear(yr);
                    setToYear(yr);
                  }}
                  className="bg-white border border-primary-200 rounded px-2 py-0.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-2xs cursor-pointer"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>

                <ArrowRight className="h-3 w-3 text-primary-400 mx-0.5 shrink-0" />

                <span className="text-xs font-bold text-primary-900">Đến:</span>
                <select
                  value={toMonth}
                  onChange={(e) => setToMonth(Number(e.target.value))}
                  className="bg-white border border-primary-200 rounded px-2 py-0.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-2xs cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m} disabled={toYear === fromYear && m < fromMonth}>
                      Tháng {m} {toYear === fromYear && m < fromMonth ? '(không hợp lệ)' : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={toYear}
                  onChange={(e) => setToYear(Number(e.target.value))}
                  className="bg-white border border-primary-200 rounded px-2 py-0.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-2xs cursor-pointer"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y} disabled={y < fromYear}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Reload Button */}
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-xs font-semibold hover:bg-gray-100 transition-colors shadow-2xs cursor-pointer"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary-600' : 'text-gray-500'}`} />
              <span>Làm mới</span>
            </button>
          </div>

          {/* Right: Options & Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Show Absolute Diff */}
            <button
              type="button"
              onClick={handleToggleShowDiff}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                showDiff
                  ? 'bg-blue-50 text-primary-900 border-primary-300'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
              title="Bật/Tắt hiển thị cột số chênh tuyệt đối (± ca)"
            >
              {showDiff ? <ToggleRight className="h-4 w-4 text-primary-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
              <span>Hiện số chênh (± ca)</span>
            </button>

            {/* Search Box */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên phẫu thuật..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg w-40 sm:w-48 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all placeholder:text-gray-400"
              />
            </div>

            {/* Export CSV Button (NotebookLM) */}
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || loading}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Xuất CSV chuẩn UTF-8 tương thích NotebookLM"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span>{exportingCsv ? 'Đang xuất CSV...' : 'Xuất CSV (NotebookLM)'}</span>
            </button>

            {/* Export Excel Button */}
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              <span>{exporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
          </div>
        </div>

        {/* Range Mode: Quick Presets */}
        {periodMode === 'range' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100 text-[11px]">
            <span className="text-gray-400 font-semibold mr-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> Chọn nhanh ({fromYear}):
            </span>
            <button
              type="button"
              onClick={() => applyQuickPreset(1, 3, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              Quý 1 (T1-T3)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset(4, 6, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              Quý 2 (T4-T6)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset(7, 9, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              Quý 3 (T7-T9)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset(10, 12, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              Quý 4 (T10-T12)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset(1, 6, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              6 tháng đầu (T1-T6)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset(7, 12, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              6 tháng cuối (T7-T12)
            </button>
            <button
              type="button"
              onClick={() => applyQuickPreset(1, 12, fromYear)}
              className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-primary-100 text-gray-700 hover:text-primary-800 font-medium transition-colors cursor-pointer"
            >
              Cả năm (T1-T12)
            </button>
          </div>
        )}

        {/* Dynamic Comparison Explanation */}
        {periodMeta && (
          <div className="text-[11.5px] text-gray-600 bg-gray-50/80 rounded-lg px-3 py-1.5 border border-gray-200/70 flex flex-wrap items-center justify-between gap-2">
            <div>
              Kỳ phân tích: <strong className="text-primary-900 font-bold">{periodMeta.currentLabel}</strong>
              <span className="text-gray-400 mx-1.5">|</span>
              Kỳ trước: <strong className="text-gray-800 font-bold">{periodMeta.prevLabel}</strong>
              <span className="text-gray-400 mx-1.5">|</span>
              Cùng kỳ: <strong className="text-gray-800 font-bold">{periodMeta.samePeriodLabel}</strong>
            </div>

            {!periodMeta.hasSamePeriodData && (
              <span className="text-amber-700 font-semibold text-[11px] flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                <Info className="h-3 w-3" />
                Cùng kỳ ({periodMeta.samePeriodLabel}) chưa có dữ liệu lưu trữ nên không tính
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Cases */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">
              Tổng số ca {periodMeta?.currentLabel || ''}
            </p>
            <h3 className="text-xl font-extrabold text-primary-950 mt-0.5">{overallKPIs.totalCurrent.toLocaleString('vi-VN')}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
              <span className={`font-semibold flex items-center gap-0.5 ${
                overallKPIs.prevChangePct !== null && overallKPIs.prevChangePct >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {overallKPIs.prevChangePct !== null && overallKPIs.prevChangePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {fmtPctStr(overallKPIs.prevChangePct)} {showDiff ? `(${overallKPIs.totalPrevDiff > 0 ? '+' : ''}${overallKPIs.totalPrevDiff} ca)` : ''}
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-700 shrink-0">
            <Activity className="h-4 w-4" />
          </div>
        </div>

        {/* Card 2: Cảnh báo */}
        <div
          onClick={() => setFilterStatus(prev => prev === 'ALERT' ? 'all' : 'ALERT')}
          className={`bg-white rounded-xl border p-3 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            filterStatus === 'ALERT' ? 'border-red-500 ring-2 ring-red-100 bg-red-50/20' : 'border-gray-200 hover:border-red-300'
          }`}
        >
          <div>
            <p className="text-[10.5px] font-bold text-red-700 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-600" />
              Chỉ tiêu CẢNH BÁO (giảm ≥{thresholdConfig.alertThreshold}%)
            </p>
            <h3 className="text-xl font-extrabold text-red-600 mt-0.5">{overallKPIs.totalAlerts} <span className="text-xs font-normal text-gray-500">kỹ thuật</span></h3>
            <p className="text-[10.5px] text-gray-500 mt-0.5">Bao gồm ca giảm mạnh & không phát sinh</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0 font-extrabold text-xs">
            🚨
          </div>
        </div>

        {/* Card 3: Tích cực */}
        <div
          onClick={() => setFilterStatus(prev => prev === 'POSITIVE' ? 'all' : 'POSITIVE')}
          className={`bg-white rounded-xl border p-3 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            filterStatus === 'POSITIVE' ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-gray-200 hover:border-emerald-300'
          }`}
        >
          <div>
            <p className="text-[10.5px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              Chỉ tiêu TÍCH CỰC (tăng ≥{thresholdConfig.positiveThreshold}%)
            </p>
            <h3 className="text-xl font-extrabold text-emerald-600 mt-0.5">{overallKPIs.totalPositives} <span className="text-xs font-normal text-gray-500">kỹ thuật</span></h3>
            <p className="text-[10.5px] text-gray-500 mt-0.5">Bao gồm ca tăng trưởng & mới phát sinh</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 font-extrabold text-xs">
            🌿
          </div>
        </div>

        {/* Card 4: Tổng số kỹ thuật */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">Danh mục kỹ thuật</p>
            <h3 className="text-xl font-extrabold text-gray-800 mt-0.5">{overallKPIs.totalDistinctSurgeries} <span className="text-xs font-normal text-gray-500">kỹ thuật</span></h3>
            <p className="text-[10.5px] text-gray-500 mt-0.5">Phát sinh theo các chuyên khoa</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0">
            <Layers className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* ── Specialty Filter Pills ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSelectedSpecialty('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 ${
            selectedSpecialty === 'all'
              ? 'bg-primary-800 text-white'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span>Tất cả chuyên khoa (Toàn viện)</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedSpecialty === 'all' ? 'bg-primary-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {overallKPIs.totalDistinctSurgeries}
          </span>
        </button>

        {allSpecialtiesList.map(spec => {
          const grp = groups.find(g => g.specialty.code === spec.code);
          const hasAlerts = (grp?.alertCount || 0) > 0;
          const totalCur = grp?.totalCurrent || 0;

          if (spec.isCustom && totalCur === 0 && selectedSpecialty !== spec.code) {
            return null;
          }

          return (
            <button
              key={spec.code}
              onClick={() => setSelectedSpecialty(spec.code)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 ${
                selectedSpecialty === spec.code
                  ? 'bg-primary-800 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{spec.name}</span>
              {spec.isCustom && (
                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                  Tùy chỉnh
                </span>
              )}
              {hasAlerts && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" title="Có cảnh báo" />
              )}
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedSpecialty === spec.code ? 'bg-primary-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {totalCur}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main Data View ── */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center gap-2.5">
          <div className="w-8 h-8 rounded-full border-3 border-primary-100 border-t-primary-600 animate-spin" />
          <p className="text-xs font-semibold text-gray-700">Đang tổng hợp và phân tích dữ liệu 3 kỳ...</p>
        </div>
      ) : selectedSpecialty === 'all' ? (
        /* ═══════════════════════════════════════════════════════════════════════
           CHẾ ĐỘ "TẤT CẢ CHUYÊN KHOA": BẢNG DỌC HỢP NHẤT + PHÂN TRANG + SẮP XẾP
           ═══════════════════════════════════════════════════════════════════════ */
        <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden flex flex-col">
          {/* Header Banner */}
          <div className="bg-[#003366] text-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h3 className="font-bold text-sm tracking-wide uppercase">
                BẢNG PHÂN TÍCH TỔNG HỢP TOÀN VIỆN - TẤT CẢ CHUYÊN KHOA
              </h3>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="bg-[#002244] px-2.5 py-1 rounded text-gray-200 font-medium text-[11px]">
                Tổng số ca: <strong className="text-white font-bold">{overallKPIs.totalCurrent}</strong>
              </span>
              {overallKPIs.totalAlerts > 0 && (
                <span className="bg-red-500/90 text-white px-2 py-0.5 rounded font-bold text-[10.5px] flex items-center gap-1">
                  🚨 {overallKPIs.totalAlerts} cảnh báo
                </span>
              )}
              {overallKPIs.totalPositives > 0 && (
                <span className="bg-emerald-500/90 text-white px-2 py-0.5 rounded font-bold text-[10.5px] flex items-center gap-1">
                  🌿 {overallKPIs.totalPositives} tích cực
                </span>
              )}
            </div>
          </div>

          {/* Subtitle bar */}
          <div className="bg-[#d9edf7] text-[#003366] px-3 py-1 text-[11px] italic text-center border-b border-[#bce8f1]">
            {periodMeta?.subtitle || ''}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#104E8B] text-white text-center font-bold text-[11px] tracking-wide border-b border-gray-300 select-none">
                  {/* Tên phẫu thuật */}
                  <th
                    onClick={() => handleSortClick('tenKT')}
                    className="px-3 py-2 text-left min-w-[300px] border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp (Giảm -> Tăng -> Hủy)"
                  >
                    <div className="flex items-center justify-between">
                      <span>Tên phẫu thuật</span>
                      {renderSortIcon('tenKT')}
                    </div>
                  </th>

                  {/* Chuyên khoa */}
                  <th
                    onClick={() => handleSortClick('specialty')}
                    className="px-2.5 py-2 w-32 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp theo chuyên khoa"
                  >
                    <div className="flex items-center justify-center">
                      <span>Chuyên khoa</span>
                      {renderSortIcon('specialty')}
                    </div>
                  </th>

                  {/* Kỳ hiện tại */}
                  <th
                    onClick={() => handleSortClick('currentCount')}
                    className="px-2 py-2 w-18 border-r border-blue-800 bg-[#0d4277] cursor-pointer hover:bg-blue-900 transition-colors group/th"
                    title="Nhấn để sắp xếp theo số ca kỳ này"
                  >
                    <div className="flex items-center justify-center">
                      <span>{periodMeta?.currentLabel || 'Kỳ này'}</span>
                      {renderSortIcon('currentCount')}
                    </div>
                  </th>

                  {/* Kỳ trước */}
                  <th
                    onClick={() => handleSortClick('prevCount')}
                    className="px-2 py-2 w-18 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp theo số ca kỳ trước"
                  >
                    <div className="flex items-center justify-center">
                      <span>{periodMeta?.prevLabel || 'Kỳ trước'}</span>
                      {renderSortIcon('prevCount')}
                    </div>
                  </th>

                  {/* Cột Số chênh kỳ trước (Hiệu số) */}
                  {showDiff && (
                    <th
                      onClick={() => handleSortClick('prevDiff')}
                      className="px-2 py-2 w-20 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Số chênh lệch tuyệt đối: Kỳ này - Kỳ trước (ca)"
                    >
                      <div className="flex items-center justify-center">
                        <span>± Kỳ trước</span>
                        {renderSortIcon('prevDiff')}
                      </div>
                    </th>
                  )}

                  {/* So kỳ trước (%) */}
                  <th
                    onClick={() => handleSortClick('prevChangePct')}
                    className="px-2 py-2 w-22 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp theo % so kỳ trước"
                  >
                    <div className="flex items-center justify-center">
                      <span>{periodMeta?.prevColTitle || 'So kỳ trước'}</span>
                      {renderSortIcon('prevChangePct')}
                    </div>
                  </th>

                  {/* Cùng kỳ */}
                  <th
                    onClick={() => handleSortClick('samePeriodCount')}
                    className="px-2 py-2 w-18 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp theo số ca cùng kỳ"
                  >
                    <div className="flex items-center justify-center">
                      <span>{periodMeta?.samePeriodLabel || 'Cùng kỳ'}</span>
                      {renderSortIcon('samePeriodCount')}
                    </div>
                  </th>

                  {/* Cột Số chênh cùng kỳ (Hiệu số) */}
                  {showDiff && (
                    <th
                      onClick={() => handleSortClick('samePeriodDiff')}
                      className="px-2 py-2 w-20 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Số chênh lệch tuyệt đối: Kỳ này - Cùng kỳ (ca)"
                    >
                      <div className="flex items-center justify-center">
                        <span>± Cùng kỳ</span>
                        {renderSortIcon('samePeriodDiff')}
                      </div>
                    </th>
                  )}

                  {/* So cùng kỳ (%) */}
                  <th
                    onClick={() => handleSortClick('samePeriodChangePct')}
                    className="px-2 py-2 w-22 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp theo % so cùng kỳ"
                  >
                    <div className="flex items-center justify-center">
                      <span>So cùng kỳ</span>
                      {renderSortIcon('samePeriodChangePct')}
                    </div>
                  </th>

                  {/* Nhận định */}
                  <th
                    onClick={() => handleSortClick('status')}
                    className="px-2 py-2 w-28 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                    title="Nhấn để sắp xếp theo nhận định cảnh báo / tích cực"
                  >
                    <div className="flex items-center justify-center">
                      <span>Nhận định</span>
                      {renderSortIcon('status')}
                    </div>
                  </th>

                  {/* Ghi chú */}
                  <th className="px-3 py-2 text-left min-w-[150px]">Ghi chú</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {paginatedAllRows.length === 0 ? (
                  <tr>
                    <td colSpan={showDiff ? 11 : 9} className="px-3 py-8 text-center text-gray-400 italic text-xs">
                      Không tìm thấy ca phẫu thuật nào phù hợp
                    </td>
                  </tr>
                ) : (
                  paginatedAllRows.map((r, idx) => {
                    const isAlert = r.status === 'ALERT';
                    const isPositive = r.status === 'POSITIVE';
                    const badgeClass = getSpecialtyBadgeColor(r.specialty);
                    const isPopoverOpen = openReassignKey === `${r.specialty}:::${r.tenKT}`;

                    return (
                      <tr
                        key={`${r.specialty}-${r.tenKT}-${idx}`}
                        className={`transition-colors hover:bg-blue-50/40 group ${
                          isAlert
                            ? 'bg-orange-50/40'
                            : isPositive
                            ? 'bg-emerald-50/30'
                            : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                        }`}
                      >
                        {/* Tên phẫu thuật */}
                        <td className="px-3 py-1.5 font-medium text-gray-800 border-r border-gray-200">
                          <span className="leading-snug text-xs">{r.tenKT}</span>
                        </td>

                        {/* Chuyên khoa: Text Badge + Nút chuyển popover menu */}
                        <td className="px-2 py-1.5 border-r border-gray-200 relative">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border tracking-wide shadow-2xs whitespace-nowrap ${badgeClass}`}>
                              {r.specialtyName}
                            </span>
                            <button
                              type="button"
                              onClick={() => setOpenReassignKey(isPopoverOpen ? null : `${r.specialty}:::${r.tenKT}`)}
                              className="p-1 rounded bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-800 transition-colors shadow-2xs cursor-pointer"
                              title="Đổi chuyên khoa cho kỹ thuật này"
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Popover Selection Menu */}
                          {isPopoverOpen && (
                            <div
                              ref={popoverRef}
                              className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 text-xs animate-in fade-in zoom-in-95"
                            >
                              <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                Chuyển sang nhóm:
                              </div>
                              <div className="max-h-56 overflow-y-auto py-1">
                                {allSpecialtiesList.map(s => (
                                  <button
                                    key={s.code}
                                    type="button"
                                    onClick={() => handleReassignSpecialty(r.tenKT, s.code)}
                                    className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-primary-50 transition-colors cursor-pointer ${
                                      s.code === r.specialty ? 'font-bold text-primary-800 bg-primary-50/50' : 'text-gray-700'
                                    }`}
                                  >
                                    <span>{s.name}</span>
                                    {s.code === r.specialty && <Check className="h-3.5 w-3.5 text-primary-600" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Kỳ hiện tại */}
                        <td className="px-2 py-1.5 text-center font-bold text-gray-900 bg-blue-50/50 border-r border-gray-200">
                          {r.currentCount}
                        </td>

                        {/* Kỳ trước */}
                        <td className="px-2 py-1.5 text-center text-gray-700 border-r border-gray-200">
                          {r.prevCount}
                        </td>

                        {/* Số chênh kỳ trước */}
                        {showDiff && (
                          <td className="px-2 py-1.5 text-center border-r border-gray-200 font-bold text-[11.5px]">
                            {fmtDiffCell(r.prevDiff)}
                          </td>
                        )}

                        {/* So kỳ trước (%) */}
                        <td className={`px-2 py-1.5 text-center font-bold border-r border-gray-200 ${
                          r.prevChangePct !== null && r.prevChangePct < 0
                            ? 'text-red-600'
                            : r.prevChangePct !== null && r.prevChangePct > 0
                            ? 'text-emerald-700'
                            : 'text-gray-600'
                        }`}>
                          {fmtPctStr(r.prevChangePct)}
                        </td>

                        {/* Cùng kỳ */}
                        <td className="px-2 py-1.5 text-center text-gray-700 border-r border-gray-200">
                          {periodMeta?.hasSamePeriodData ? r.samePeriodCount : '—'}
                        </td>

                        {/* Số chênh cùng kỳ */}
                        {showDiff && (
                          <td className="px-2 py-1.5 text-center border-r border-gray-200 font-bold text-[11.5px]">
                            {periodMeta?.hasSamePeriodData ? fmtDiffCell(r.samePeriodDiff) : '—'}
                          </td>
                        )}

                        {/* So cùng kỳ (%) */}
                        <td className={`px-2 py-1.5 text-center font-bold border-r border-gray-200 ${
                          r.samePeriodChangePct !== null && r.samePeriodChangePct < 0
                            ? 'text-red-600'
                            : r.samePeriodChangePct !== null && r.samePeriodChangePct > 0
                            ? 'text-emerald-700'
                            : 'text-gray-600'
                        }`}>
                          {periodMeta?.hasSamePeriodData ? fmtPctStr(r.samePeriodChangePct) : '—'}
                        </td>

                        {/* Nhận định */}
                        <td className="px-2 py-1 text-center border-r border-gray-200">
                          {isAlert && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-[#FCE4D6] text-[#C00000] border border-orange-200 shadow-2xs">
                              CẢNH BÁO
                            </span>
                          )}
                          {isPositive && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-[#E2EFDA] text-[#2E7D32] border border-emerald-200 shadow-2xs">
                              TÍCH CỰC
                            </span>
                          )}
                          {!isAlert && !isPositive && (
                            <span className="text-gray-400 font-medium">—</span>
                          )}
                        </td>

                        {/* Ghi chú */}
                        <td className="px-3 py-1.5 text-gray-600 italic text-[11px]">
                          {r.note}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Totals Footer */}
              <tfoot>
                <tr className="bg-[#F2F4F7] font-bold text-gray-900 border-t-2 border-[#003366] text-xs">
                  <td colSpan={2} className="px-3 py-2 uppercase tracking-wide text-primary-950 border-r border-gray-300">
                    TỔNG CỘNG TOÀN VIỆN ({overallKPIs.totalDistinctSurgeries} kỹ thuật)
                  </td>
                  <td className="px-2 py-2 text-center bg-blue-100/70 border-r border-gray-300 text-primary-950 font-extrabold">
                    {overallKPIs.totalCurrent}
                  </td>
                  <td className="px-2 py-2 text-center border-r border-gray-300">
                    {overallKPIs.totalPrev}
                  </td>
                  {showDiff && (
                    <td className="px-2 py-2 text-center border-r border-gray-300 font-extrabold text-[11.5px]">
                      {fmtDiffCell(overallKPIs.totalPrevDiff)}
                    </td>
                  )}
                  <td className={`px-2 py-2 text-center font-extrabold border-r border-gray-300 ${
                    overallKPIs.prevChangePct !== null && overallKPIs.prevChangePct < 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}>
                    {fmtPctStr(overallKPIs.prevChangePct)}
                  </td>
                  <td className="px-2 py-2 text-center border-r border-gray-300">
                    {periodMeta?.hasSamePeriodData ? overallKPIs.totalSamePeriod : '—'}
                  </td>
                  {showDiff && (
                    <td className="px-2 py-2 text-center border-r border-gray-300 font-extrabold text-[11.5px]">
                      {periodMeta?.hasSamePeriodData ? fmtDiffCell(overallKPIs.totalSamePeriodDiff) : '—'}
                    </td>
                  )}
                  <td className={`px-2 py-2 text-center font-extrabold border-r border-gray-300 ${
                    overallKPIs.samePeriodChangePct !== null && overallKPIs.samePeriodChangePct < 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}>
                    {periodMeta?.hasSamePeriodData ? fmtPctStr(overallKPIs.samePeriodChangePct) : '—'}
                  </td>
                  <td className="px-2 py-2 text-center border-r border-gray-300 text-gray-400 font-medium">—</td>
                  <td className="px-3 py-2 text-gray-600 text-[10.5px] font-semibold">
                    Cảnh báo: {overallKPIs.totalAlerts} | Tích cực: {overallKPIs.totalPositives}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Pagination Bar ── */}
          <div className="bg-gray-50 px-3.5 py-2.5 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
              >
                <option value={10}>10 dòng</option>
                <option value={20}>20 dòng</option>
                <option value={50}>50 dòng</option>
                <option value={100}>100 dòng</option>
                <option value={-1}>Tất cả ({allCombinedRows.length})</option>
              </select>
              <span>/ trang (Tổng số: <strong>{allCombinedRows.length}</strong> phẫu thuật)</span>
              {sortCol && (
                <span className="text-primary-700 text-[11px] bg-primary-50 px-2 py-0.5 rounded border border-primary-200 ml-2">
                  Đang sắp xếp: <strong>{sortCol}</strong> ({sortDir === 'asc' ? 'Tăng dần ↑' : 'Giảm dần ↓'})
                  <button
                    type="button"
                    onClick={() => { setSortCol(null); setSortDir(null); localStorage.removeItem(STORAGE_SORT_COL_KEY); localStorage.removeItem(STORAGE_SORT_DIR_KEY); }}
                    className="ml-1 text-red-500 hover:text-red-700 font-bold cursor-pointer"
                    title="Hủy sắp xếp"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                  title="Trang đầu"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                  title="Trang trước"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <span className="px-2 py-1 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded shadow-2xs">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                  title="Trang sau"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                  title="Trang cuối"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════
           CHẾ ĐỘ XEM TỪNG CHUYÊN KHOA CỤ THỂ
           ═══════════════════════════════════════════════════════════════════════ */
        filteredSingleGroup && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
            {/* Table Header Banner */}
            <div className="bg-[#003366] text-white px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-1.5">
                  <span>PHÂN TÍCH PHẪU THUẬT - {filteredSingleGroup.specialty.name}</span>
                  {filteredSingleGroup.specialty.isCustom && (
                    <span className="text-[10px] lowercase font-normal px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-200 border border-amber-400/30">
                      nhóm tùy chỉnh
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="bg-[#002244] px-2.5 py-1 rounded text-gray-200 font-medium text-[11px]">
                  Tổng ca: <strong className="text-white font-bold">{filteredSingleGroup.totalCurrent}</strong>
                </span>
                {filteredSingleGroup.alertCount > 0 && (
                  <span className="bg-red-500/90 text-white px-2 py-0.5 rounded font-bold text-[10.5px] flex items-center gap-1">
                    🚨 {filteredSingleGroup.alertCount} cảnh báo
                  </span>
                )}
                {filteredSingleGroup.positiveCount > 0 && (
                  <span className="bg-emerald-500/90 text-white px-2 py-0.5 rounded font-bold text-[10.5px] flex items-center gap-1">
                    🌿 {filteredSingleGroup.positiveCount} tích cực
                  </span>
                )}
              </div>
            </div>

            {/* Subtitle bar */}
            <div className="bg-[#d9edf7] text-[#003366] px-3 py-1 text-[11px] italic text-center border-b border-[#bce8f1]">
              {periodMeta?.subtitle || ''}
            </div>

            {/* Table Body */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#104E8B] text-white text-center font-bold text-[11px] tracking-wide border-b border-gray-300 select-none">
                    <th
                      onClick={() => handleSortClick('tenKT')}
                      className="px-3 py-2 text-left min-w-[320px] border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Nhấn để sắp xếp tên phẫu thuật"
                    >
                      <div className="flex items-center justify-between">
                        <span>Tên phẫu thuật</span>
                        {renderSortIcon('tenKT')}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSortClick('currentCount')}
                      className="px-2 py-2 w-18 border-r border-blue-800 bg-[#0d4277] cursor-pointer hover:bg-blue-900 transition-colors group/th"
                      title="Nhấn để sắp xếp số ca kỳ này"
                    >
                      <div className="flex items-center justify-center">
                        <span>{periodMeta?.currentLabel || 'Kỳ này'}</span>
                        {renderSortIcon('currentCount')}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSortClick('prevCount')}
                      className="px-2 py-2 w-18 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Nhấn để sắp xếp số ca kỳ trước"
                    >
                      <div className="flex items-center justify-center">
                        <span>{periodMeta?.prevLabel || 'Kỳ trước'}</span>
                        {renderSortIcon('prevCount')}
                      </div>
                    </th>

                    {/* Số chênh kỳ trước */}
                    {showDiff && (
                      <th
                        onClick={() => handleSortClick('prevDiff')}
                        className="px-2 py-2 w-20 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                        title="Số chênh lệch tuyệt đối: Kỳ này - Kỳ trước (ca)"
                      >
                        <div className="flex items-center justify-center">
                          <span>± Kỳ trước</span>
                          {renderSortIcon('prevDiff')}
                        </div>
                      </th>
                    )}

                    <th
                      onClick={() => handleSortClick('prevChangePct')}
                      className="px-2 py-2 w-22 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Nhấn để sắp xếp % so kỳ trước"
                    >
                      <div className="flex items-center justify-center">
                        <span>{periodMeta?.prevColTitle || 'So kỳ trước'}</span>
                        {renderSortIcon('prevChangePct')}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSortClick('samePeriodCount')}
                      className="px-2 py-2 w-18 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Nhấn để sắp xếp số ca cùng kỳ"
                    >
                      <div className="flex items-center justify-center">
                        <span>{periodMeta?.samePeriodLabel || 'Cùng kỳ'}</span>
                        {renderSortIcon('samePeriodCount')}
                      </div>
                    </th>

                    {/* Số chênh cùng kỳ */}
                    {showDiff && (
                      <th
                        onClick={() => handleSortClick('samePeriodDiff')}
                        className="px-2 py-2 w-20 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                        title="Số chênh lệch tuyệt đối: Kỳ này - Cùng kỳ (ca)"
                      >
                        <div className="flex items-center justify-center">
                          <span>± Cùng kỳ</span>
                          {renderSortIcon('samePeriodDiff')}
                        </div>
                      </th>
                    )}

                    <th
                      onClick={() => handleSortClick('samePeriodChangePct')}
                      className="px-2 py-2 w-22 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Nhấn để sắp xếp % so cùng kỳ"
                    >
                      <div className="flex items-center justify-center">
                        <span>So cùng kỳ</span>
                        {renderSortIcon('samePeriodChangePct')}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSortClick('status')}
                      className="px-2 py-2 w-28 border-r border-blue-800 cursor-pointer hover:bg-blue-900/80 transition-colors group/th"
                      title="Nhấn để sắp xếp theo nhận định"
                    >
                      <div className="flex items-center justify-center">
                        <span>Nhận định</span>
                        {renderSortIcon('status')}
                      </div>
                    </th>

                    <th className="px-3 py-2 text-left min-w-[160px]">Ghi chú</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200">
                  {filteredSingleGroup.rows.length === 0 ? (
                    <tr>
                      <td colSpan={showDiff ? 10 : 8} className="px-3 py-8 text-center text-gray-400 italic text-xs">
                        {filteredSingleGroup.specialty.isCustom
                          ? 'Chưa có kỹ thuật nào được chuyển vào nhóm tùy chỉnh này'
                          : 'Không có ca phẫu thuật nào trong chuyên khoa này'}
                      </td>
                    </tr>
                  ) : (
                    filteredSingleGroup.rows.map((r, idx) => {
                      const isAlert = r.status === 'ALERT';
                      const isPositive = r.status === 'POSITIVE';
                      const isPopoverOpen = openReassignKey === `${r.specialty}:::${r.tenKT}`;

                      return (
                        <tr
                          key={`${r.tenKT}-${idx}`}
                          className={`transition-colors hover:bg-blue-50/40 group ${
                            isAlert
                              ? 'bg-orange-50/40'
                              : isPositive
                              ? 'bg-emerald-50/30'
                              : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                          }`}
                        >
                          {/* Tên phẫu thuật + Nút chuyển chuyên khoa */}
                          <td className="px-3 py-1.5 font-medium text-gray-800 border-r border-gray-200 relative">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex-1 leading-snug text-xs">{r.tenKT}</span>
                              <button
                                type="button"
                                onClick={() => setOpenReassignKey(isPopoverOpen ? null : `${r.specialty}:::${r.tenKT}`)}
                                className="p-1 rounded bg-gray-100 hover:bg-primary-100 text-gray-500 hover:text-primary-800 transition-colors shadow-2xs shrink-0 cursor-pointer"
                                title="Đổi chuyên khoa cho kỹ thuật này"
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Popover Selection Menu */}
                            {isPopoverOpen && (
                              <div
                                ref={popoverRef}
                                className="absolute z-50 top-full right-4 mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 text-xs animate-in fade-in zoom-in-95"
                              >
                                <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                  Chuyển sang nhóm:
                                </div>
                                <div className="max-h-56 overflow-y-auto py-1">
                                  {allSpecialtiesList.map(s => (
                                    <button
                                      key={s.code}
                                      type="button"
                                      onClick={() => handleReassignSpecialty(r.tenKT, s.code)}
                                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-primary-50 transition-colors cursor-pointer ${
                                        s.code === r.specialty ? 'font-bold text-primary-800 bg-primary-50/50' : 'text-gray-700'
                                      }`}
                                    >
                                      <span>{s.name}</span>
                                      {s.code === r.specialty && <Check className="h-3.5 w-3.5 text-primary-600" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Kỳ hiện tại */}
                          <td className="px-2 py-1.5 text-center font-bold text-gray-900 bg-blue-50/50 border-r border-gray-200">
                            {r.currentCount}
                          </td>

                          {/* Kỳ trước */}
                          <td className="px-2 py-1.5 text-center text-gray-700 border-r border-gray-200">
                            {r.prevCount}
                          </td>

                          {/* Số chênh kỳ trước */}
                          {showDiff && (
                            <td className="px-2 py-1.5 text-center border-r border-gray-200 font-bold text-[11.5px]">
                              {fmtDiffCell(r.prevDiff)}
                            </td>
                          )}

                          {/* So kỳ trước */}
                          <td className={`px-2 py-1.5 text-center font-bold border-r border-gray-200 ${
                            r.prevChangePct !== null && r.prevChangePct < 0
                              ? 'text-red-600'
                              : r.prevChangePct !== null && r.prevChangePct > 0
                              ? 'text-emerald-700'
                              : 'text-gray-600'
                          }`}>
                            {fmtPctStr(r.prevChangePct)}
                          </td>

                          {/* Cùng kỳ */}
                          <td className="px-2 py-1.5 text-center text-gray-700 border-r border-gray-200">
                            {periodMeta?.hasSamePeriodData ? r.samePeriodCount : '—'}
                          </td>

                          {/* Số chênh cùng kỳ */}
                          {showDiff && (
                            <td className="px-2 py-1.5 text-center border-r border-gray-200 font-bold text-[11.5px]">
                              {periodMeta?.hasSamePeriodData ? fmtDiffCell(r.samePeriodDiff) : '—'}
                            </td>
                          )}

                          {/* So cùng kỳ */}
                          <td className={`px-2 py-2 text-center font-bold border-r border-gray-200 ${
                            r.samePeriodChangePct !== null && r.samePeriodChangePct < 0
                              ? 'text-red-600'
                              : r.samePeriodChangePct !== null && r.samePeriodChangePct > 0
                              ? 'text-emerald-700'
                              : 'text-gray-600'
                          }`}>
                            {periodMeta?.hasSamePeriodData ? fmtPctStr(r.samePeriodChangePct) : '—'}
                          </td>

                          {/* Nhận định */}
                          <td className="px-2 py-1 text-center border-r border-gray-200">
                            {isAlert && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-[#FCE4D6] text-[#C00000] border border-orange-200 shadow-2xs">
                                CẢNH BÁO
                              </span>
                            )}
                            {isPositive && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-[#E2EFDA] text-[#2E7D32] border border-emerald-200 shadow-2xs">
                                TÍCH CỰC
                              </span>
                            )}
                            {!isAlert && !isPositive && (
                              <span className="text-gray-400 font-medium">—</span>
                            )}
                          </td>

                          {/* Ghi chú */}
                          <td className="px-3 py-1.5 text-gray-600 italic text-[11px]">
                            {r.note}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Footer */}
                <tfoot>
                  <tr className="bg-[#F2F4F7] font-bold text-gray-900 border-t-2 border-[#003366] text-xs">
                    <td className="px-3 py-2 uppercase tracking-wide text-primary-950 border-r border-gray-300">
                      TỔNG CỘNG
                    </td>
                    <td className="px-2 py-2 text-center bg-blue-100/70 border-r border-gray-300 text-primary-950 font-extrabold">
                      {filteredSingleGroup.totalCurrent}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-gray-300">
                      {filteredSingleGroup.totalPrev}
                    </td>
                    {showDiff && (
                      <td className="px-2 py-2 text-center border-r border-gray-300 font-extrabold text-[11.5px]">
                        {fmtDiffCell(filteredSingleGroup.totalCurrent - filteredSingleGroup.totalPrev)}
                      </td>
                    )}
                    <td className={`px-2 py-2 text-center font-extrabold border-r border-gray-300 ${
                      filteredSingleGroup.totalPrev > 0 && ((filteredSingleGroup.totalCurrent - filteredSingleGroup.totalPrev) / filteredSingleGroup.totalPrev) < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}>
                      {fmtPctStr(filteredSingleGroup.totalPrev > 0 ? ((filteredSingleGroup.totalCurrent - filteredSingleGroup.totalPrev) / filteredSingleGroup.totalPrev) * 100 : null)}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-gray-300">
                      {periodMeta?.hasSamePeriodData ? filteredSingleGroup.totalSamePeriod : '—'}
                    </td>
                    {showDiff && (
                      <td className="px-2 py-2 text-center border-r border-gray-300 font-extrabold text-[11.5px]">
                        {periodMeta?.hasSamePeriodData ? fmtDiffCell(filteredSingleGroup.totalCurrent - filteredSingleGroup.totalSamePeriod) : '—'}
                      </td>
                    )}
                    <td className={`px-2 py-2 text-center font-extrabold border-r border-gray-300 ${
                      periodMeta?.hasSamePeriodData && filteredSingleGroup.totalSamePeriod > 0 && ((filteredSingleGroup.totalCurrent - filteredSingleGroup.totalSamePeriod) / filteredSingleGroup.totalSamePeriod) < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}>
                      {periodMeta?.hasSamePeriodData && filteredSingleGroup.totalSamePeriod > 0 ? fmtPctStr(((filteredSingleGroup.totalCurrent - filteredSingleGroup.totalSamePeriod) / filteredSingleGroup.totalSamePeriod) * 100) : '—'}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-gray-300 text-gray-400 font-medium">—</td>
                    <td className="px-3 py-2 text-gray-600 text-[10.5px] font-semibold">
                      Cảnh báo: {filteredSingleGroup.alertCount} | Tích cực: {filteredSingleGroup.positiveCount}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
};
