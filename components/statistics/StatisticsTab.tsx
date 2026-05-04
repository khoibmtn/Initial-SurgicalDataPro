/**
 * StatisticsTab — Container component
 * Manages sub-tabs (Thống kê / Biểu đồ / Cấu hình), data loading, year selection
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, Settings2, Table2, Loader2, AlertTriangle, Info, ChevronDown } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { fetchAndAggregateStatistics } from '../../services/statisticsService';
import { subscribeToPriceVersions } from '../../services/pricingService';
import { StatisticsData, SurgeryPriceVersion } from '../../types';
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
  const [statsData, setStatsData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to price versions
  useEffect(() => {
    const unsub = subscribeToPriceVersions(setPriceVersions);
    return unsub;
  }, []);

  // Fetch and aggregate stats when year or prices change
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAndAggregateStatistics(
        primaryYear,
        compareYear,
        priceVersions,
        config.priceConfig,
        selectedMonth
      );
      setStatsData(data);
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
      console.error('Statistics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [primaryYear, compareYear, priceVersions, config.priceConfig, selectedMonth]);

  useEffect(() => {
    if (subTab !== 'config') {
      loadData();
    }
  }, [loadData, subTab]);

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
              onClick={loadData}
              disabled={loading}
              className="ml-2 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-bold hover:bg-primary-800 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tải lại'}
            </button>
          </div>
        )}
      </div>

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

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {subTab === 'summary' && (
          loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              <span className="ml-3 text-sm text-gray-500">Đang tải số liệu...</span>
            </div>
          ) : statsData ? (
            <StatsSummary data={statsData} onMonthChange={setSelectedMonth} />
          ) : (
            <div className="text-center py-20 text-gray-400 text-sm">
              Chưa có dữ liệu. Nhấn "Tải lại" để bắt đầu.
            </div>
          )
        )}

        {subTab === 'charts' && (
          loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              <span className="ml-3 text-sm text-gray-500">Đang tải số liệu...</span>
            </div>
          ) : statsData ? (
            <StatsCharts data={statsData} />
          ) : (
            <div className="text-center py-20 text-gray-400 text-sm">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Chưa có dữ liệu</p>
              <p className="text-xs mt-1">Nhấn "Tải lại" để bắt đầu.</p>
            </div>
          )
        )}

        {subTab === 'config' && (
          <StatsConfig
            priceVersions={priceVersions}
          />
        )}
      </div>
    </div>
  );
};
