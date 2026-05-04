/**
 * StatisticsTab — Container component
 * Manages sub-tabs (Thống kê / Biểu đồ / Cấu hình), data loading, year selection
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BarChart3, Settings2, Table2, Loader2, AlertTriangle, Info, ChevronDown } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { fetchAndAggregateStatistics } from '../../services/statisticsService';
import { subscribeToPriceVersions } from '../../services/pricingService';
import { subscribeToSurgeryNamePrices } from '../../services/surgeryNamePriceService';
import { StatisticsData, SurgeryPriceVersion, SurgeryNamePrice } from '../../types';
import { StatsSummary } from './StatsSummary';
import { StatsCharts } from './StatsCharts';
import { StatsConfig } from './StatsConfig';

type SubTab = 'summary' | 'charts' | 'config';

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
  const [statsData, setStatsData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Track whether price subscriptions have delivered first data
  const priceVersionsReady = useRef(false);
  const namePricesReady = useRef(false);
  const initialLoadTriggered = useRef(false);

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

  // Fetch and aggregate stats
  const loadData = useCallback(async (
    pYear: number,
    cYear: number,
    month: number,
    pv: SurgeryPriceVersion[],
    np: SurgeryNamePrice[],
    isInitial = false
  ) => {
    setLoading(true);
    setError(null);
    setLoadingMsg(isInitial
      ? `Đang tải dữ liệu năm ${pYear} & ${cYear}...`
      : 'Đang cập nhật số liệu...'
    );
    try {
      const data = await fetchAndAggregateStatistics(
        pYear, cYear, pv, config.priceConfig, month, np
      );
      setStatsData(data);
      if (isInitial) setInitialLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
      console.error('Statistics fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [config.priceConfig]);

  // Initial auto-load: wait for both price subscriptions, then load once
  useEffect(() => {
    if (
      priceVersionsReady.current &&
      namePricesReady.current &&
      !initialLoadTriggered.current
    ) {
      initialLoadTriggered.current = true;
      loadData(primaryYear, compareYear, selectedMonth, priceVersions, surgeryNamePrices, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceVersions, surgeryNamePrices]);

  // Reload when year/month changes (after initial load)
  const prevParams = useRef({ primaryYear, compareYear, selectedMonth });
  useEffect(() => {
    if (!initialLoaded) return;
    const prev = prevParams.current;
    if (
      prev.primaryYear !== primaryYear ||
      prev.compareYear !== compareYear ||
      prev.selectedMonth !== selectedMonth
    ) {
      prevParams.current = { primaryYear, compareYear, selectedMonth };
      loadData(primaryYear, compareYear, selectedMonth, priceVersions, surgeryNamePrices);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryYear, compareYear, selectedMonth, initialLoaded]);

  // Manual reload
  const handleReload = () => {
    loadData(primaryYear, compareYear, selectedMonth, priceVersions, surgeryNamePrices);
  };

  // Year options
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const subTabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'summary', label: 'Thống kê', icon: <Table2 className="h-4 w-4" /> },
    { key: 'charts', label: 'Biểu đồ', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'config', label: 'Cấu hình', icon: <Settings2 className="h-4 w-4" /> },
  ];

  // --- Initial Loading Screen ---
  if (!initialLoaded && !error) {
    return (
      <div className="space-y-6 animate-fade-in relative w-full mx-auto">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-lg font-bold text-primary-900 tracking-tight text-center">
            THỐNG KÊ PHẪU THUẬT
          </h2>
        </div>
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-24">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <p className="mt-5 text-sm font-semibold text-primary-800">Đang tải dữ liệu thống kê</p>
          <p className="mt-1.5 text-xs text-gray-500 animate-pulse">
            {loadingMsg || 'Đang kết nối & đồng bộ bảng giá...'}
          </p>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${priceVersionsReady.current ? 'bg-green-400' : 'bg-gray-300 animate-pulse'}`} />
              Bảng giá DV
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${namePricesReady.current ? 'bg-green-400' : 'bg-gray-300 animate-pulse'}`} />
              DM giá tên PT ({surgeryNamePrices.length.toLocaleString()})
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative w-full mx-auto">
      {/* Title */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-lg font-bold text-primary-900 tracking-tight text-center">
          THỐNG KÊ PHẪU THUẬT
        </h2>
      </div>

      {/* Sub-tab navigation + Year selectors */}
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {subTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                subTab === tab.key
                  ? 'bg-white text-primary-800 shadow-md'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Year selectors (hidden on config tab) */}
        {subTab !== 'config' && (
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
              onClick={handleReload}
              disabled={loading}
              className="ml-2 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-bold hover:bg-primary-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải...</> : 'Tải lại'}
            </button>
          </div>
        )}
      </div>

      {/* Inline loading overlay for subsequent loads */}
      {loading && initialLoaded && (
        <div className="max-w-7xl mx-auto">
          <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs text-primary-700">
            <Loader2 className="h-4 w-4 animate-spin text-primary-600 shrink-0" />
            <span className="font-medium">{loadingMsg || 'Đang cập nhật...'}</span>
          </div>
        </div>
      )}

      {/* Validation warnings */}
      {statsData?.validation && subTab !== 'config' && (
        <div className="max-w-7xl mx-auto space-y-2">
          {/* Missing price — actual warning */}
          {statsData.validation.missingPriceMonths.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                Thiếu bảng giá dịch vụ cho tháng: <strong>{statsData.validation.missingPriceMonths.join(', ')}</strong>. Chi phí DV = 0 cho các tháng này.
                <button onClick={() => setSubTab('config')} className="ml-1 underline text-amber-700 hover:text-amber-900 font-semibold">Cấu hình giá →</button>
              </p>
            </div>
          )}
          {/* Missing surgery name prices */}
          {statsData.validation.missingSurgeryNames.length > 0 && (
            <details className="group">
              <summary className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 flex items-center gap-2 cursor-pointer list-none text-xs text-orange-700 hover:bg-orange-100 transition-colors">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <span>
                  ⚠ <strong>{statsData.validation.missingSurgeryNames.length}</strong> tên phẫu thuật chưa có giá dịch vụ — <span className="text-orange-500">xem chi tiết</span>
                </span>
              </summary>
              <div className="mt-1 bg-orange-50 border border-orange-100 rounded-lg p-3 text-xs text-orange-800 space-y-2">
                <p><strong>Doanh thu dịch vụ = 0</strong> cho các kỹ thuật này. Vui lòng bổ sung giá tại tab Cấu hình.</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {statsData.validation.missingSurgeryNames.slice(0, 50).map((item, i) => (
                    <p key={i} className="text-orange-700">
                      • {item.name}
                      {item.dates.length > 0 && (
                        <span className="text-orange-500 text-[10px] ml-1.5">
                          ({item.dates.map(d => {
                            const parts = d.split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
                          }).join(', ')})
                        </span>
                      )}
                    </p>
                  ))}
                  {statsData.validation.missingSurgeryNames.length > 50 && (
                    <p className="text-orange-500 font-semibold">... và {statsData.validation.missingSurgeryNames.length - 50} tên khác</p>
                  )}
                </div>
                <button
                  onClick={() => setSubTab('config')}
                  className="mt-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors"
                >
                  Cấu hình giá →
                </button>
              </div>
            </details>
          )}
          {/* Duplicate info — soft notice, not warning */}
          {statsData.validation.duplicateCount > 0 && (
            <details className="group">
              <summary className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 flex items-center gap-2 cursor-pointer list-none text-xs text-blue-700 hover:bg-blue-100 transition-colors">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>ℹ Dữ liệu có <strong>{statsData.validation.duplicateCount}</strong> bản ghi trùng key — <span className="text-blue-500">xem chi tiết</span></span>
              </summary>
              <div className="mt-1 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <p><strong>Cách kiểm tra:</strong> Hệ thống so sánh 4 trường: ngày phẫu thuật, loại PT/TT, mã BN, tên kỹ thuật.</p>
                <p>Nếu 2 bản ghi có cùng 4 trường trên → đánh dấu "trùng key". Điều này <strong>không có nghĩa dữ liệu sai</strong> — có thể cùng BN làm cùng kỹ thuật 2 lần/ngày.</p>
                <p className="text-blue-600">Số liệu thống kê <strong>không bị ảnh hưởng</strong> — tất cả bản ghi đều được tính.</p>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="max-w-7xl mx-auto bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Lỗi:</strong> {error}
        </div>
      )}

      {/* Content — all tabs always mounted, toggled via CSS display */}
      <div className="max-w-7xl mx-auto">
        <div style={{ display: subTab === 'summary' ? 'block' : 'none' }}>
          {statsData ? (
            <StatsSummary data={statsData} onMonthChange={setSelectedMonth} />
          ) : !loading ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              Chưa có dữ liệu. Nhấn "Tải lại" để bắt đầu.
            </div>
          ) : null}
        </div>

        <div style={{ display: subTab === 'charts' ? 'block' : 'none' }}>
          {statsData ? (
            <StatsCharts data={statsData} />
          ) : !loading ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Chưa có dữ liệu</p>
              <p className="text-xs mt-1">Nhấn "Tải lại" để bắt đầu.</p>
            </div>
          ) : null}
        </div>

        <div style={{ display: subTab === 'config' ? 'block' : 'none' }}>
          <StatsConfig
            priceVersions={priceVersions}
            surgeryNamePrices={surgeryNamePrices}
          />
        </div>
      </div>
    </div>
  );
};
