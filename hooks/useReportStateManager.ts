import { useState, useEffect, useMemo, useCallback } from 'react';
import { TabKey } from '../components/ui';
import { reportService } from '../services/reportService';
import {
  ReportState,
  DataTabType,
  createInitialReportState,
} from '../types/reportState';

export interface UseReportStateManagerOptions {
  activeTab: TabKey;
}

export function useReportStateManager({ activeTab }: UseReportStateManagerOptions) {
  // Per-page data source tab (independent for daily vs monthly)
  const [activeDataTabs, setActiveDataTabs] = useState<Record<string, DataTabType>>({
    daily: 'storage',
    monthly: 'storage',
  });

  // 4 Independent states: report type × data source
  const [dailyStorageState, setDailyStorageState] = useState<ReportState>(createInitialReportState);
  const [dailyUploadState, setDailyUploadState] = useState<ReportState>(createInitialReportState);

  // Chế độ chọn thời gian trong Báo cáo tháng: 'month' (Tháng) hoặc 'range' (Khoảng thời gian)
  const [monthlyTimeMode, setMonthlyTimeMode] = useState<'month' | 'range'>('month');

  // Tính năm và tháng mặc định: Năm hiện tại, Tháng = tháng hiện tại - 1 (nếu tháng 1 thì lùi về tháng 12 năm trước)
  const [selectedMonthlyYear, setSelectedMonthlyYear] = useState<number>(() => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    return curMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
  });
  const [selectedMonthlyMonth, setSelectedMonthlyMonth] = useState<number>(() => {
    const curMonth = new Date().getMonth() + 1;
    return curMonth === 1 ? 12 : curMonth - 1;
  });

  // Danh mục năm và tháng có dữ liệu thực tế từ Firestore
  const [availableMonthlyYears, setAvailableMonthlyYears] = useState<number[]>([2023, 2024, 2025, 2026]);
  const [availableMonthlyMonthsMap, setAvailableMonthlyMonthsMap] = useState<Record<number, number[]>>({
    2023: [5, 6, 7, 8, 9, 10, 11, 12],
    2024: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    2025: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    2026: [1, 2, 3, 4, 5, 6, 7, 8],
  });

  const [monthlyStorageState, setMonthlyStorageState] = useState<ReportState>(() => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const defYear = curMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
    const defMonth = curMonth === 1 ? 12 : curMonth - 1;
    const mStr = String(defMonth).padStart(2, '0');
    const lastDay = new Date(defYear, defMonth, 0).getDate();
    return {
      ...createInitialReportState(),
      dateFrom: `${defYear}-${mStr}-01`,
      timeFrom: '00:00',
      dateTo: `${defYear}-${mStr}-${String(lastDay).padStart(2, '0')}`,
      timeTo: '23:59',
    };
  });
  const [monthlyUploadState, setMonthlyUploadState] = useState<ReportState>(createInitialReportState);

  // Tải danh mục năm & tháng có dữ liệu từ Firestore
  useEffect(() => {
    reportService
      .getAvailableMonthlyYearsAndMonths()
      .then(({ years, monthsMap }) => {
        if (years && years.length > 0) {
          setAvailableMonthlyYears(years);
          setAvailableMonthlyMonthsMap(monthsMap);
        }
      })
      .catch((err) => {
        console.warn('Lỗi tải danh mục năm/tháng cho báo cáo tháng:', err);
      });
  }, []);

  const applyMonthlyDateRange = useCallback((year: number, month: number) => {
    const mStr = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const dateFrom = `${year}-${mStr}-01`;
    const dateTo = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    setMonthlyStorageState((prev) => ({
      ...prev,
      dateFrom,
      timeFrom: '00:00',
      dateTo,
      timeTo: '23:59',
    }));
  }, []);

  const handleMonthlyYearChange = useCallback(
    (newYear: number) => {
      setSelectedMonthlyYear(newYear);
      const monthsForYear = availableMonthlyMonthsMap[newYear] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      let newMonth = selectedMonthlyMonth;
      if (!monthsForYear.includes(newMonth)) {
        newMonth = monthsForYear[monthsForYear.length - 1];
        setSelectedMonthlyMonth(newMonth);
      }
      applyMonthlyDateRange(newYear, newMonth);
    },
    [availableMonthlyMonthsMap, selectedMonthlyMonth, applyMonthlyDateRange]
  );

  const handleMonthlyMonthChange = useCallback(
    (newMonth: number) => {
      setSelectedMonthlyMonth(newMonth);
      applyMonthlyDateRange(selectedMonthlyYear, newMonth);
    },
    [selectedMonthlyYear, applyMonthlyDateRange]
  );

  const handleMonthlyTimeModeChange = useCallback(
    (mode: 'month' | 'range') => {
      setMonthlyTimeMode(mode);
      if (mode === 'month') {
        applyMonthlyDateRange(selectedMonthlyYear, selectedMonthlyMonth);
      }
    },
    [selectedMonthlyYear, selectedMonthlyMonth, applyMonthlyDateRange]
  );

  const [showMonthlyFullPriceNotice, setShowMonthlyFullPriceNotice] = useState<boolean>(true);

  const currentType: 'daily' | 'monthly' = activeTab === 'monthly' ? 'monthly' : 'daily';
  const activeDataTab = activeDataTabs[currentType] || 'storage';
  const setActiveDataTab = useCallback(
    (v: DataTabType) => {
      setActiveDataTabs((prev) => ({ ...prev, [currentType]: v }));
    },
    [currentType]
  );

  // Resolve state setter by type + source
  const getStateSetter = useCallback(
    (type: 'daily' | 'monthly', source: 'storage' | 'upload') => {
      if (type === 'daily') return source === 'storage' ? setDailyStorageState : setDailyUploadState;
      return source === 'storage' ? setMonthlyStorageState : setMonthlyUploadState;
    },
    []
  );

  const getState = useCallback(
    (type: 'daily' | 'monthly', source: 'storage' | 'upload') => {
      if (type === 'daily') return source === 'storage' ? dailyStorageState : dailyUploadState;
      return source === 'storage' ? monthlyStorageState : monthlyUploadState;
    },
    [dailyStorageState, dailyUploadState, monthlyStorageState, monthlyUploadState]
  );

  const currentReport = useMemo(() => {
    const tab = activeDataTab === 'price_service' ? 'storage' : activeDataTab;
    return getState(currentType, tab as 'storage' | 'upload');
  }, [currentType, activeDataTab, getState]);

  // Tự động ẩn thông báo áp giá đầy đủ ở báo cáo tháng sau 5 giây để tiết kiệm không gian
  useEffect(() => {
    const surgeryCount = (currentReport.result as any)?.surgeries?.length || currentReport.result?.validRecords?.length;
    if (currentType === 'monthly' && surgeryCount) {
      setShowMonthlyFullPriceNotice(true);
      const timer = setTimeout(() => {
        setShowMonthlyFullPriceNotice(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [currentReport.result, currentReport.queryDateRangeText, currentType]);

  const updateReportState = useCallback(
    (type: 'daily' | 'monthly', patch: Partial<ReportState>, source?: 'storage' | 'upload') => {
      const resolvedSource = source ?? (activeDataTabs[type] || 'storage');
      const setter = getStateSetter(type, resolvedSource);
      setter((prev) => ({ ...prev, ...patch }));
    },
    [activeDataTabs, getStateSetter]
  );

  const updateCurrentReport = useCallback(
    (updates: Partial<ReportState>) => {
      updateReportState(currentType, updates, activeDataTab as 'storage' | 'upload');
    },
    [currentType, activeDataTab, updateReportState]
  );

  return {
    dailyStorageState,
    setDailyStorageState,
    dailyUploadState,
    setDailyUploadState,
    monthlyStorageState,
    setMonthlyStorageState,
    monthlyUploadState,
    setMonthlyUploadState,
    monthlyTimeMode,
    setMonthlyTimeMode,
    selectedMonthlyYear,
    setSelectedMonthlyYear,
    selectedMonthlyMonth,
    setSelectedMonthlyMonth,
    availableMonthlyYears,
    availableMonthlyMonthsMap,
    handleMonthlyYearChange,
    handleMonthlyMonthChange,
    handleMonthlyTimeModeChange,
    applyMonthlyDateRange,
    activeDataTabs,
    setActiveDataTabs,
    activeDataTab,
    setActiveDataTab,
    currentType,
    currentReport,
    getState,
    getStateSetter,
    updateReportState,
    updateCurrentReport,
    showMonthlyFullPriceNotice,
    setShowMonthlyFullPriceNotice,
  };
}
