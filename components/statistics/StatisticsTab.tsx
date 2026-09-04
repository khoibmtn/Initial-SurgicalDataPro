/**
 * StatisticsTab — Container component
 * Manages sub-tabs (Thống kê / Cấu hình), data loading, year selection
 */
import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition, useDeferredValue } from 'react';
import { Settings2, Table2, Loader2, AlertTriangle, Info, BarChart3, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useConfig } from '../../contexts/ConfigContext';
import { fetchAndAggregateYearly, computeDailyForMonth, clearRawYearCache, type YearlyCacheData } from '../../services/statisticsService';
import { subscribeToPriceVersions } from '../../services/pricingService';
import { subscribeToSurgeryNamePrices } from '../../services/surgeryNamePriceService';
import { subscribeToChapterCatalog } from '../../services/chapterCatalogService';
import { subscribeToProfiles } from '../../services/profileService';
import { StatisticsData, SurgeryPriceVersion, SurgeryNamePrice, ChapterCatalog, SurgeryProfile, PersistedSurgeryRecord } from '../../types';
import { StatsSummary } from './StatsSummary';
import { StatsConfig } from './StatsConfig';
import { SpecialtyComparisonTab } from './SpecialtyComparisonTab';
import { ContextToolbar, TabLine } from '../ui';

type SubTab = 'summary' | 'comparison' | 'config';

export const StatisticsTab: React.FC = () => {
  const { config } = useConfig();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentRealMonth = now.getMonth() + 1;

  const [subTab, setSubTab] = useState<SubTab>('summary');
  const [primaryYear, setPrimaryYear] = useState(currentYear);
  const [compareYear, setCompareYear] = useState(currentYear - 1);
  const [selectedMonth, setSelectedMonth] = useState(currentRealMonth);
  const [priceVersions, setPriceVersions] = useState<SurgeryPriceVersion[]>([]);
  const [surgeryNamePrices, setSurgeryNamePrices] = useState<SurgeryNamePrice[]>([]);
  const [chapters, setChapters] = useState<ChapterCatalog[]>([]);
  const [statsData, setStatsData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [profiles, setProfiles] = useState<SurgeryProfile[]>([]);
  const [isPending, startTransition] = useTransition();

  // Defer statsData so React renders old data while new data is computing
  const deferredStatsData = useDeferredValue(statsData);
  const isStale = deferredStatsData !== statsData;

  // Track whether price subscriptions have delivered first data
  const priceVersionsReady = useRef(false);
  const namePricesReady = useRef(false);

  // --- Yearly cache (core optimization) ---
  // Cache key includes year pair + price config hash to auto-invalidate when prices change
  const yearCacheRef = useRef<{
    key: string;
    data: YearlyCacheData;
  } | null>(null);

  const buildCacheKey = useCallback((pYear: number, cYear: number, pv: SurgeryPriceVersion[], np: SurgeryNamePrice[]) => {
    // Simple hash: year pair + count + last-modified timestamps
    const pvHash = pv.length > 0 ? `${pv.length}_${pv[0]?.id}_${pv[pv.length - 1]?.id}` : '0';
    const npHash = np.length > 0 ? `${np.length}_${np[0]?.id}_${np[np.length - 1]?.id}` : '0';
    const priceConfigHash = JSON.stringify(config.priceConfig).length; // cheap size-based hash
    return `${pYear}_${cYear}_${pvHash}_${npHash}_${priceConfigHash}`;
  }, [config.priceConfig]);

  // Subscribe to price versions
  useEffect(() => {
    const unsub = subscribeToPriceVersions((data) => {
      setPriceVersions(data);
      priceVersionsReady.current = true;
    });
    return unsub;
  }, []);

  // Subscribe to surgery name prices
  useEffect(() => {
    const unsub = subscribeToSurgeryNamePrices((data) => {
      setSurgeryNamePrices(data);
      namePricesReady.current = true;
    });
    return unsub;
  }, []);

  // Subscribe to chapter catalog
  useEffect(() => {
    const unsub = subscribeToChapterCatalog((data) => {
      setChapters(data);
    });
    return unsub;
  }, []);

  // Subscribe to surgery profiles (Firestore)
  useEffect(() => {
    const unsub = subscribeToProfiles((data) => {
      setProfiles(data);
    });
    return unsub;
  }, []);

  // --- Full yearly fetch (Firestore queries + 24× aggregation) ---
  const loadYearlyData = useCallback(async (
    pYear: number,
    cYear: number,
    month: number,
    pv: SurgeryPriceVersion[],
    np: SurgeryNamePrice[],
    isInitial = false,
    clearRawCache = false
  ) => {
    setLoading(true);
    setError(null);
    setLoadingMsg(isInitial
      ? `Đang tải dữ liệu năm ${pYear} & ${cYear}...`
      : `Đang tải lại dữ liệu năm ${pYear} & ${cYear}...`
    );
    try {
      if (clearRawCache) {
        clearRawYearCache();
      }
      const yearlyCache = await fetchAndAggregateYearly(
        pYear, cYear, pv, config.priceConfig, np, clearRawCache
      );

      // Store in cache
      const key = buildCacheKey(pYear, cYear, pv, np);
      yearCacheRef.current = { key, data: yearlyCache };

      // Compute daily for selected month (fast, from pre-indexed data)
      const daily = computeDailyForMonth(month, yearlyCache, pv, config.priceConfig, np);

      startTransition(() => {
        setStatsData({
          primaryYear: pYear, compareYear: cYear, selectedMonth: month,
          primary: yearlyCache.primary,
          compare: yearlyCache.compare,
          ...daily,
          forecast: yearlyCache.forecast,
          topSurgeries: yearlyCache.topSurgeries,
          targetCases: yearlyCache.targetCases,
          validation: yearlyCache.validation,
        });
      });
      setInitialLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
      console.error('Statistics fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [config.priceConfig, buildCacheKey]);

  // --- Fast daily recompute (no Firestore, typically <50ms) ---
  const recomputeDaily = useCallback((month: number, pv: SurgeryPriceVersion[], np: SurgeryNamePrice[]) => {
    const cache = yearCacheRef.current;
    if (!cache) return; // no cache yet, skip

    console.time('[stats] recomputeDaily');
    const daily = computeDailyForMonth(month, cache.data, pv, config.priceConfig, np);
    console.timeEnd('[stats] recomputeDaily');

    startTransition(() => {
      setStatsData(prev => prev ? {
        ...prev,
        selectedMonth: month,
        ...daily,
      } : prev);
    });
  }, [config.priceConfig]);

  // Reload when year changes → full fetch; month change → daily-only from cache
  const prevParams = useRef({ primaryYear, compareYear, selectedMonth });
  useEffect(() => {
    if (!initialLoaded) return;
    const prev = prevParams.current;
    const yearChanged = prev.primaryYear !== primaryYear || prev.compareYear !== compareYear;
    const monthChanged = prev.selectedMonth !== selectedMonth;

    if (yearChanged) {
      // Year changed → invalidate cache, full re-fetch
      yearCacheRef.current = null;
      prevParams.current = { primaryYear, compareYear, selectedMonth };
      loadYearlyData(primaryYear, compareYear, selectedMonth, priceVersions, surgeryNamePrices);
    } else if (monthChanged) {
      // Month changed only → fast daily recompute from cache (NO Firestore)
      prevParams.current = { primaryYear, compareYear, selectedMonth };
      recomputeDaily(selectedMonth, priceVersions, surgeryNamePrices);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryYear, compareYear, selectedMonth, initialLoaded]);

  // Invalidate cache when price config changes (from RTDB subscriptions)
  const prevCacheKey = useRef('');
  useEffect(() => {
    if (!initialLoaded) return;
    const newKey = buildCacheKey(primaryYear, compareYear, priceVersions, surgeryNamePrices);
    if (prevCacheKey.current && prevCacheKey.current !== newKey) {
      // Price data changed → clear cache, full re-fetch
      console.log('[stats] Price config changed, invalidating cache');
      yearCacheRef.current = null;
      loadYearlyData(primaryYear, compareYear, selectedMonth, priceVersions, surgeryNamePrices);
    }
    prevCacheKey.current = newKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceVersions, surgeryNamePrices, config.priceConfig, initialLoaded]);

  // Manual load or reload
  const handleLoadData = (forceRefresh = false) => {
    if (forceRefresh) {
      yearCacheRef.current = null;
      clearRawYearCache();
    }
    loadYearlyData(primaryYear, compareYear, selectedMonth, priceVersions, surgeryNamePrices, !initialLoaded, forceRefresh);
  };

  // --- Export helpers for validation warnings ---
  const handleExportDuplicates = useCallback(() => {
    if (!statsData?.validation?.duplicateRecords || statsData.validation.duplicateRecords.length === 0) return;

    const rows = statsData.validation.duplicateRecords.map((r, idx) => {
      let ngayMoFormatted = '';
      if (r.ngayBD) {
        try {
          const d = new Date(r.ngayBD);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            ngayMoFormatted = (hours !== '00' || mins !== '00')
              ? `${day}/${month}/${year} ${hours}:${mins}`
              : `${day}/${month}/${year}`;
          } else {
            ngayMoFormatted = r.ngayBD;
          }
        } catch {
          ngayMoFormatted = r.ngayBD;
        }
      }

      return {
        'STT': idx + 1,
        'Nhóm trùng key': `Nhóm #${r.duplicateGroup}`,
        'Số ca trong nhóm': r.duplicateGroupCount,
        'Mã BN': r.patientId || '',
        'Họ và tên': r.patientName || '',
        'Năm sinh': r.yob || '',
        'Giới tính': r.gender || '',
        'Thẻ BHYT': r.bhyt || '',
        'Ngày phẫu thuật': ngayMoFormatted,
        'Tên phẫu thuật / kỹ thuật': r.tenKT || '',
        'Loại PT/TT': r.loaiPTTT || '',
        'Số lượng': r.soLuong || 1,
        'Phẫu thuật chính': r.ptChinh || '',
        'Phẫu thuật phụ': r.ptPhu || '',
        'Bác sĩ gây mê': r.bsGM || '',
        'KTV gây mê': r.ktvGM || '',
        'Giúp việc': r.gv || '',
        'Máy thực hiện': r.machine || '',
        'Đơn giá (VNĐ)': r.donGia != null ? Number(r.donGia) : '',
        'Thành tiền (VNĐ)': r.thanhTien != null ? Number(r.thanhTien) : '',
        'Mã tương đương BHXH': r.maTuongDuong || '',
        'Nguồn dữ liệu': r.type === 'MONTHLY' ? 'Báo cáo tháng' : 'Báo cáo ngày',
        'ID bản ghi': r.id || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 16 }, // Nhóm trùng key
      { wch: 16 }, // Số ca trong nhóm
      { wch: 14 }, // Mã BN
      { wch: 24 }, // Họ tên
      { wch: 10 }, // Năm sinh
      { wch: 10 }, // Giới tính
      { wch: 18 }, // Thẻ BHYT
      { wch: 20 }, // Ngày phẫu thuật
      { wch: 45 }, // Tên PT
      { wch: 12 }, // Loại PT/TT
      { wch: 10 }, // Số lượng
      { wch: 22 }, // PTV chính
      { wch: 20 }, // PTV phụ
      { wch: 20 }, // BS GM
      { wch: 20 }, // KTV GM
      { wch: 18 }, // Giúp việc
      { wch: 16 }, // Máy thực hiện
      { wch: 14 }, // Đơn giá
      { wch: 16 }, // Thành tiền
      { wch: 20 }, // Mã tương đương
      { wch: 15 }, // Nguồn dữ liệu
      { wch: 24 }, // ID bản ghi
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DS Trùng Key');
    XLSX.writeFile(wb, `DS_trung_key_${statsData.primaryYear}_${statsData.compareYear}.xlsx`);
  }, [statsData]);

  const handleExportMissingPriceSurgeries = useCallback(() => {
    if (!statsData?.validation?.missingSurgeryNameRecords || statsData.validation.missingSurgeryNameRecords.length === 0) return;

    const rows = statsData.validation.missingSurgeryNameRecords.map((r, idx) => {
      let ngayMoFormatted = '';
      if (r.ngayPT) {
        ngayMoFormatted = r.ngayPT.includes('-') ? r.ngayPT.split('-').reverse().join('/') : r.ngayPT;
      }

      return {
        'STT': idx + 1,
        'Mã BN': r.maBN || '',
        'Họ và tên': r.patientName || '',
        'Năm sinh': r.yob || '',
        'Giới tính': r.gender || '',
        'Thẻ BHYT': r.bhyt || '',
        'Ngày phẫu thuật': ngayMoFormatted,
        'Tên phẫu thuật / kỹ thuật': r.tenKT || '',
        'Loại PT/TT': r.loaiPTTT || '',
        'Phẫu thuật chính': r.ptChinh || '',
        'Phẫu thuật phụ': r.ptPhu || '',
        'Bác sĩ gây mê': r.bsGM || '',
        'Máy thực hiện': r.machine || '',
        'Đơn giá (VNĐ)': r.donGia != null ? Number(r.donGia) : 0,
        'Thành tiền (VNĐ)': r.thanhTien != null ? Number(r.thanhTien) : 0,
        'Mã tương đương BHXH': r.maTuongDuong || '',
        'Nguồn dữ liệu': r.type === 'MONTHLY' ? 'Báo cáo tháng' : 'Báo cáo ngày',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // Mã BN
      { wch: 24 }, // Họ tên
      { wch: 10 }, // Năm sinh
      { wch: 10 }, // Giới tính
      { wch: 18 }, // Thẻ BHYT
      { wch: 16 }, // Ngày phẫu thuật
      { wch: 45 }, // Tên PT
      { wch: 12 }, // Loại PT/TT
      { wch: 22 }, // PTV chính
      { wch: 20 }, // PTV phụ
      { wch: 20 }, // BS GM
      { wch: 16 }, // Máy thực hiện
      { wch: 14 }, // Đơn giá
      { wch: 16 }, // Thành tiền
      { wch: 20 }, // Mã tương đương
      { wch: 15 }, // Nguồn dữ liệu
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chưa có giá');
    XLSX.writeFile(wb, `PT_chua_co_gia_${statsData.primaryYear}_${statsData.compareYear}.xlsx`);
  }, [statsData]);

  const handleExportMissingPriceMonths = useCallback(() => {
    if (!statsData?.validation?.missingPriceMonths || statsData.validation.missingPriceMonths.length === 0) return;
    const cache = yearCacheRef.current?.data;
    if (!cache) return;

    const recordsToExport: PersistedSurgeryRecord[] = [];
    statsData.validation.missingPriceMonths.forEach(str => {
      const parts = str.split('/');
      const m = parseInt(parts[0], 10);
      const y = parts[1] ? parseInt(parts[1], 10) : statsData.primaryYear;
      const indexed = y === statsData.compareYear ? cache.compareIndexed : cache.primaryIndexed;
      const monthData = indexed?.byMonth.get(m);
      if (monthData && monthData.records) {
        recordsToExport.push(...monthData.records);
      }
    });

    if (recordsToExport.length === 0) return;

    const rows = recordsToExport.map((r, idx) => {
      let ngayMoFormatted = '';
      if (r.ngayBD) {
        try {
          const d = new Date(r.ngayBD);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            ngayMoFormatted = `${day}/${month}/${year}`;
          } else {
            ngayMoFormatted = r.ngayBD;
          }
        } catch {
          ngayMoFormatted = r.ngayBD;
        }
      }

      return {
        'STT': idx + 1,
        'Mã BN': r.patientId || '',
        'Họ và tên': r.patientName || '',
        'Năm sinh': r.yob || '',
        'Giới tính': r.gender || '',
        'Thẻ BHYT': r.bhyt || '',
        'Ngày phẫu thuật': ngayMoFormatted,
        'Tên phẫu thuật / kỹ thuật': r.tenKT || '',
        'Loại PT/TT': r.loaiPTTT || '',
        'Số lượng': r.soLuong || 1,
        'Phẫu thuật chính': r.ptChinh || '',
        'Phẫu thuật phụ': r.ptPhu || '',
        'Bác sĩ gây mê': r.bsGM || '',
        'KTV gây mê': r.ktvGM || '',
        'Giúp việc': r.gv || '',
        'Máy thực hiện': r.machine || '',
        'Đơn giá (VNĐ)': r.donGia || 0,
        'Thành tiền (VNĐ)': r.thanhTien || 0,
        'Mã tương đương BHXH': r.maTuongDuong || '',
        'Nguồn dữ liệu': r.type === 'MONTHLY' ? 'Báo cáo tháng' : 'Báo cáo ngày',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },  { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 10 },
      { wch: 18 }, { wch: 16 }, { wch: 45 }, { wch: 12 }, { wch: 10 },
      { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 18 },
      { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 15 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tháng thiếu giá');
    XLSX.writeFile(wb, `DS_ca_thang_thieu_gia_${statsData.primaryYear}_${statsData.compareYear}.xlsx`);
  }, [statsData]);

  // Year options
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const subTabOptions = [
    { value: 'summary' as const, label: 'Thống kê', icon: Table2 },
    { value: 'comparison' as const, label: 'Phân tích so sánh', icon: BarChart3 },
    { value: 'config' as const, label: 'Cấu hình thống kê', icon: Settings2 },
  ];

  return (
    <div className="flex flex-col animate-fade-in relative w-full h-full">
      {/* ── Firebase-style Page Header: title + sub-tabs ── */}
      <ContextToolbar title="Thống kê phẫu thuật">
        <TabLine
          value={subTab}
          onChange={(v) => setSubTab(v as SubTab)}
          options={subTabOptions}
        />
      </ContextToolbar>

      {/* ── Tab Body ── */}

      {/* SUMMARY tab body — year selectors inside */}
      <div style={{ display: subTab === 'summary' ? 'block' : 'none' }}>
        {/* Year selectors bar */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-medium">Năm:</span>
              <select
                value={primaryYear}
                onChange={e => setPrimaryYear(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[80px]"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <span className="text-gray-400">so với</span>
            <div className="flex items-center gap-1.5">
              <select
                value={compareYear}
                onChange={e => setCompareYear(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[80px]"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button
              onClick={() => handleLoadData(initialLoaded)}
              disabled={loading}
              className="ml-2 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-bold hover:bg-primary-800 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
              title={initialLoaded ? "Tải lại dữ liệu mới nhất từ hệ thống" : "Bắt đầu tải dữ liệu thống kê"}
            >
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải...</>
              ) : initialLoaded ? (
                <><RefreshCw className="h-3.5 w-3.5" /> Tải lại</>
              ) : (
                <><Download className="h-3.5 w-3.5" /> Tải dữ liệu</>
              )}
            </button>
          </div>
        </div>

      {/* Inline loading overlay when reloading with existing data */}
      {loading && statsData && (
        <div className="px-4 mb-2">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs text-blue-800">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
            <span className="font-medium">{loadingMsg || 'Đang cập nhật...'}</span>
          </div>
        </div>
      )}

      {/* Validation warnings */}
      {statsData?.validation && (
        <div className="px-4 space-y-2">
          {/* Missing price — actual warning */}
          {statsData.validation.missingPriceMonths.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p>
                    Thiếu bảng giá dịch vụ cho tháng: <strong>{statsData.validation.missingPriceMonths.join(', ')}</strong>. Chi phí DV = 0 cho các tháng này.
                    <button onClick={() => setSubTab('config')} className="ml-1.5 underline text-amber-700 hover:text-amber-900 font-semibold">Cấu hình giá →</button>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExportMissingPriceMonths}
                className="shrink-0 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Tải danh sách các ca phẫu thuật của các tháng thiếu bảng giá"
              >
                <Download className="h-3.5 w-3.5" />
                Tải danh sách ca tháng thiếu giá
              </button>
            </div>
          )}

          {/* Missing surgery name prices */}
          {statsData.validation.missingSurgeryNames.length > 0 && (
            <details className="group">
              <summary className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer list-none text-xs text-orange-800 hover:bg-orange-100/80 transition-colors shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                  <span>
                    ⚠ <strong>{statsData.validation.missingSurgeryNames.length}</strong> tên phẫu thuật chưa có giá dịch vụ
                    {statsData.validation.missingSurgeryNameRecords.length > 0 && (
                      <span className="text-orange-700 font-medium ml-1">
                        (tổng <strong>{statsData.validation.missingSurgeryNameRecords.length}</strong> ca mổ)
                      </span>
                    )}
                    {' — '}<span className="text-orange-600 underline font-medium">xem chi tiết</span>
                  </span>
                </div>
                {statsData.validation.missingSurgeryNameRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleExportMissingPriceSurgeries();
                    }}
                    className="shrink-0 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Tải file Excel danh sách chi tiết các ca mổ chưa có giá"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải Excel ({statsData.validation.missingSurgeryNameRecords.length} dòng)
                  </button>
                )}
              </summary>
              <div className="mt-1.5 bg-orange-50/70 border border-orange-100 rounded-xl p-3.5 text-xs text-orange-900 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p><strong>Doanh thu dịch vụ = 0</strong> cho các kỹ thuật này. Vui lòng kiểm tra và bổ sung giá tại tab Cấu hình.</p>
                  <div className="flex items-center gap-2">
                    {statsData.validation.missingSurgeryNameRecords.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportMissingPriceSurgeries}
                        className="px-3.5 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Tải Excel chi tiết ({statsData.validation.missingSurgeryNameRecords.length} dòng)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSubTab('config')}
                      className="px-3 py-1.5 bg-white border border-orange-300 text-orange-800 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors shadow-sm"
                    >
                      Cấu hình giá →
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5 bg-white/70 p-2.5 rounded-lg border border-orange-200/60">
                  {statsData.validation.missingSurgeryNames.slice(0, 50).map((name, i) => (
                    <p key={i} className="text-orange-800">• {name}</p>
                  ))}
                  {statsData.validation.missingSurgeryNames.length > 50 && (
                    <p className="text-orange-600 font-semibold mt-1">... và {statsData.validation.missingSurgeryNames.length - 50} tên kỹ thuật khác</p>
                  )}
                </div>
              </div>
            </details>
          )}

          {/* Duplicate info — with full Excel export */}
          {statsData.validation.duplicateCount > 0 && (
            <details className="group" open>
              <summary className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer list-none text-xs text-blue-800 hover:bg-blue-100/80 transition-colors shadow-sm">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    ℹ Dữ liệu có <strong>{statsData.validation.duplicateCount}</strong> bản ghi trùng key
                    {statsData.validation.duplicateRecords && statsData.validation.duplicateRecords.length > 0 && (
                      <span className="text-blue-700 font-medium ml-1">
                        (tổng <strong>{statsData.validation.duplicateRecords.length}</strong> ca trong các nhóm trùng)
                      </span>
                    )}
                    {' — '}<span className="text-blue-600 underline font-medium">xem chi tiết</span>
                  </span>
                </div>
                {statsData.validation.duplicateRecords && statsData.validation.duplicateRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleExportDuplicates();
                    }}
                    className="shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Tải file Excel danh sách toàn bộ các ca mổ trùng key để đối chiếu"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải Excel trùng key ({statsData.validation.duplicateRecords.length} dòng)
                  </button>
                )}
              </summary>
              <div className="mt-1.5 bg-blue-50/70 border border-blue-100 rounded-xl p-3.5 text-xs text-blue-900 space-y-2.5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 max-w-2xl leading-relaxed">
                    <p><strong>Cách kiểm tra:</strong> Hệ thống so sánh 4 trường: <em>ngày phẫu thuật, loại PT/TT, mã BN, tên kỹ thuật</em>.</p>
                    <p>Nếu 2 bản ghi có cùng 4 trường trên → xếp vào cùng một <strong>nhóm trùng key</strong>. Điều này <strong>không có nghĩa dữ liệu sai</strong> — có thể cùng BN làm cùng kỹ thuật 2 lần/ngày.</p>
                    <p className="text-blue-700">Số liệu thống kê <strong>không bị ảnh hưởng</strong> — tất cả bản ghi đều được tính vào tổng số ca.</p>
                  </div>
                  {statsData.validation.duplicateRecords && statsData.validation.duplicateRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExportDuplicates}
                      className="px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                    >
                      <Download className="h-4 w-4" />
                      Tải Excel danh sách đầy đủ ({statsData.validation.duplicateRecords.length} bản ghi)
                    </button>
                  )}
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Lỗi:</strong> {error}
        </div>
      )}

      {/* Summary Content */}
      <div className="px-4 pb-8">
        {deferredStatsData ? (
          <StatsSummary
            data={deferredStatsData}
            onMonthChange={setSelectedMonth}
            chapters={chapters}
            profiles={profiles}
            surgeryNamePrices={surgeryNamePrices}
            isDataLoading={loading || isPending || isStale}
          />
        ) : loading ? (
          /* Loading isolated inside Summary Tab */
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm flex flex-col items-center justify-center text-center my-6 min-h-[360px]">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
                <Table2 className="h-8 w-8 text-blue-700" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full shadow-sm">
                <Loader2 className="h-5 w-5 text-primary-700 animate-spin" />
              </div>
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1.5">
              Đang tải và tổng hợp dữ liệu phẫu thuật
            </h3>
            <p className="text-xs text-gray-500 font-medium max-w-md mb-4">
              {loadingMsg || `Đang nạp dữ liệu năm ${primaryYear} & ${compareYear}...`}
            </p>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[11px] text-blue-700">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>Tiến trình chạy ngầm. Bạn có thể mở tab "Phân tích so sánh" hoặc "Cấu hình" mà không bị gián đoạn.</span>
            </div>
          </div>
        ) : (
          /* Empty state before loading */
          <div className="bg-white rounded-2xl border border-gray-100 p-10 shadow-sm flex flex-col items-center justify-center text-center my-6 min-h-[360px]">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 mb-4 shadow-sm">
              <BarChart3 className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Thống kê phẫu thuật năm {primaryYear} & {compareYear}
            </h3>
            <p className="text-xs text-gray-500 max-w-md mb-6 leading-relaxed">
              Dữ liệu chưa được nạp nhằm tăng tốc mở trang và tiết kiệm tài nguyên mạng.
              Nhấn nút bên dưới để bắt đầu tải và tổng hợp số liệu 2 năm phẫu thuật.
            </p>
            <button
              onClick={() => handleLoadData(false)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-xs font-bold shadow-md shadow-primary-700/20 transition-all transform active:scale-95"
            >
              <Download className="h-4 w-4" />
              Tải dữ liệu năm {primaryYear} & {compareYear}
            </button>
            <p className="text-[11px] text-gray-400 mt-4">
              💡 Các tab "Phân tích so sánh" và "Cấu hình thống kê" luôn sẵn sàng hoạt động độc lập.
            </p>
          </div>
        )}
      </div>
      </div>{/* end summary tab */}

      {/* COMPARISON tab body */}
      <div style={{ display: subTab === 'comparison' ? 'block' : 'none' }}>
        <SpecialtyComparisonTab
          staffList={config.staffList || []}
          initialYear={primaryYear}
          initialMonth={selectedMonth}
        />
      </div>

      {/* CONFIG tab body */}
      <div style={{ display: subTab === 'config' ? 'block' : 'none' }}>
        <div className="px-4 pt-3">
          <StatsConfig
            priceVersions={priceVersions}
            surgeryNamePrices={surgeryNamePrices}
            chapters={chapters}
            profiles={profiles}
          />
        </div>
      </div>
    </div>
  );
};
