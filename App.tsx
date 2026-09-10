import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';

import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from './lib/firebase';
import { processSurgicalFiles } from "./services/excelProcessor";
import { reprocessSurgicalRecords, recalculateResultFromRecords } from "./services/reprocess";
import { exportFormattedFullExcel } from "./services/excelExportService";
import { ConfigurationTab } from './components/ConfigurationTab';
import { PrintPreview } from './components/PrintPreview';
import { ConfigProvider, useConfig, DEFAULT_CONFIG } from './contexts/ConfigContext';
import { StatisticsTab } from './components/statistics/StatisticsTab';
import { ServicePriceTab } from './components/ServicePriceTab';
import { subscribeToSurgeryNamePrices, getNamePrice } from './services/surgeryNamePriceService';
import { matchAndApplyServicePrices } from './services/servicePriceProcessor';
// AI analysis removed — geminiService import no longer needed
import { ProcessingResult, ProcessedStats, SurgeryRecord, StaffConflict, MachineConflict, PersistedSurgeryRecord, StaffMember, PatientServicePriceGroup, SurgeryNamePrice, DutyScheduleDateConfig, OvertimeRecordRow } from './types';
import { FileUpload } from './components/FileUpload';
import { SurgeryEditModal } from './components/surgery/SurgeryEditModal';
import { Sidebar, type TabKey, ContextToolbar, SegmentedControl, TabLine, KPIBar, CollapsiblePanel, EmptyState, WorkspaceSkeleton, CommandPalette, type CommandItem, ErrorBoundary } from './components/ui';
import { DutyScheduleTab } from './components/duty/DutyScheduleTab';
import { OvertimeTab } from './components/overtime/OvertimeTab';
import { PageCombobox } from './components/common/PageCombobox';
import { dutyScheduleService, getDutyDateKey, formatDateKey, DUTY_SCHEDULE_CHANGE_EVENT } from './services/dutyScheduleService';
import { getScheduleForDate, calculateOvertimeRows } from './services/overtimeCalculationService';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock,
  Cpu,
  Database,
  Download,
  BarChart3,
  Users,
  Zap,
  Loader2,
  Settings,

  LayoutDashboard,
  CheckCircle,
  AlertCircle,
  X,
  Sparkles,
  ListChecks,
  DollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Percent,
  FileSpreadsheet,
  Printer,
  FileText,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  Search,
  Calendar,
  UserMinus,
  Trash2,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Rows3,
  Rows4,
  Command,
  Maximize2,
  Minimize2,
  Pencil
} from 'lucide-react';
import { reportService } from './services/reportService';
import { format, parse, isValid } from 'date-fns';
import { auth } from './lib/firebase';
import { getTimeRuleForRecord, getAllowanceForRecord } from './services/laborConfigService';

import { ColumnDef, DynamicTable, TableDensity } from './components/common/DynamicTable';
import { ToastContainer, ToastItem, ToastType } from './components/common/ToastContainer';
import { formatDate, parseDateString } from './utils/dateUtils';
import { matchSearchQuery, removeVietnameseTones } from './utils/tableSearchUtils';
import { PaymentTableView, getPaymentColumns as buildPaymentColumns } from './components/surgery/PaymentTableView';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { buildPrintConfig } from './components/surgery/printConfigBuilder';
import { ReportActionBar } from './components/surgery/ReportActionBar';
import { HospitalStatCards } from './components/surgery/HospitalStatCards';
import { StorageQueryBar } from './components/surgery/StorageQueryBar';
import { UploadFileBar } from './components/surgery/UploadFileBar';
import { buildColumnsList, buildColumnsMissing, buildColumnsStaff, buildColumnsMachine } from './components/surgery/surgeryColumns';
interface ReportState {
  result: ProcessingResult | null;
  stats: ProcessedStats | null;
  isProcessing: boolean;
  listFile: File | null;
  activeTable: 'list' | 'staff' | 'machine' | 'missing' | 'payment' | 'duty' | 'overtime' | null;
  selectedRecordIds: string[]; // IDs of selected records (for 'list' table)
  searchTerms: {
    list: string;
    staff: string;
    machine: string;
    missing: string;
    payment: string;
    duty?: string;
    overtime?: string;
  };
  // UI State for Date Range Pickers (Independent per tab)
  dateFrom: string;
  timeFrom: string;
  dateTo: string;
  timeTo: string;
  // File Meta (Legacy Strings from Validator)
  listDateRange: string;
  dataSource: 'EXCEL' | 'STORAGE' | null;
  queryDateRangeText?: string;
  hasAutoFilledData?: boolean; // Track if auto-fill succeeded for enabling save button
}

const initialReportState: ReportState = {
  result: null,
  stats: null,
  isProcessing: false,
  listFile: null,
  activeTable: null,
  selectedRecordIds: [],
  searchTerms: {
    list: '',
    staff: '',
    machine: '',
    missing: '',
    payment: '',
    duty: '',
    overtime: ''
  },
  dateFrom: format(new Date(), 'yyyy-MM-dd'),
  timeFrom: '00:00',
  dateTo: format(new Date(), 'yyyy-MM-dd'),
  timeTo: '23:59',
  listDateRange: "",
  dataSource: null,
  hasAutoFilledData: false
};

const InnerApp: React.FC = () => {
  const { config, updateConfig } = useConfig();

  const [activeTab, setActiveTab] = useState<TabKey>('daily');
  const [hasVisitedStats, setHasVisitedStats] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SurgeryRecord | null>(null);
  const [lastActiveRecordId, setLastActiveRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'statistics') {
      setHasVisitedStats(true);
    }
  }, [activeTab]);

  type DataTabType = 'storage' | 'upload' | 'price_service';
  // Per-page data source tab (independent for daily vs monthly)
  const [activeDataTabs, setActiveDataTabs] = useState<Record<string, DataTabType>>({
    daily: 'storage',
    monthly: 'storage'
  });
  const [cachedServiceGroups, setCachedServiceGroups] = useState<PatientServicePriceGroup[]>([]);
  const [namePrices, setNamePrices] = useState<SurgeryNamePrice[]>([]);

  useEffect(() => {
    const unsub = subscribeToSurgeryNamePrices((data) => {
      setNamePrices(data);
    });
    return () => unsub();
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved !== null) return saved === 'true';
    return window.innerWidth <= 1280;
  });

  // 4 Independent states: report type × data source
  const [dailyStorageState, setDailyStorageState] = useState<ReportState>(initialReportState);
  const [dailyUploadState, setDailyUploadState] = useState<ReportState>(initialReportState);

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
      ...initialReportState,
      dateFrom: `${defYear}-${mStr}-01`,
      timeFrom: '00:00',
      dateTo: `${defYear}-${mStr}-${String(lastDay).padStart(2, '0')}`,
      timeTo: '23:59',
    };
  });
  const [monthlyUploadState, setMonthlyUploadState] = useState<ReportState>(initialReportState);

  // Tải danh mục năm & tháng có dữ liệu từ Firestore
  useEffect(() => {
    reportService.getAvailableMonthlyYearsAndMonths().then(({ years, monthsMap }) => {
      if (years && years.length > 0) {
        setAvailableMonthlyYears(years);
        setAvailableMonthlyMonthsMap(monthsMap);
      }
    }).catch(err => {
      console.warn("Lỗi tải danh mục năm/tháng cho báo cáo tháng:", err);
    });
  }, []);

  const applyMonthlyDateRange = (year: number, month: number) => {
    const mStr = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const dateFrom = `${year}-${mStr}-01`;
    const dateTo = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    setMonthlyStorageState(prev => ({
      ...prev,
      dateFrom,
      timeFrom: '00:00',
      dateTo,
      timeTo: '23:59'
    }));
  };

  const handleMonthlyYearChange = (newYear: number) => {
    setSelectedMonthlyYear(newYear);
    const monthsForYear = availableMonthlyMonthsMap[newYear] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    let newMonth = selectedMonthlyMonth;
    if (!monthsForYear.includes(newMonth)) {
      newMonth = monthsForYear[monthsForYear.length - 1];
      setSelectedMonthlyMonth(newMonth);
    }
    applyMonthlyDateRange(newYear, newMonth);
  };

  const handleMonthlyMonthChange = (newMonth: number) => {
    setSelectedMonthlyMonth(newMonth);
    applyMonthlyDateRange(selectedMonthlyYear, newMonth);
  };

  const handleMonthlyTimeModeChange = (mode: 'month' | 'range') => {
    setMonthlyTimeMode(mode);
    if (mode === 'month') {
      applyMonthlyDateRange(selectedMonthlyYear, selectedMonthlyMonth);
    }
  };
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; message: string; onConfirm: (() => void) | null }>({ show: false, message: '', onConfirm: null });
  const [saveConfirm, setSaveConfirm] = useState<{ show: boolean; message: string; onConfirm: (() => void) | null }>({ show: false, message: '', onConfirm: null });
  const [showMonthlyFullPriceNotice, setShowMonthlyFullPriceNotice] = useState<boolean>(true);

  const currentType = (activeTab === 'monthly') ? 'monthly' : 'daily';
  const activeDataTab = activeDataTabs[currentType] || 'storage';
  const setActiveDataTab = (v: DataTabType) => {
    setActiveDataTabs(prev => ({ ...prev, [currentType]: v }));
  };

  // Resolve state setter by type + source
  const getStateSetter = (type: 'daily' | 'monthly', source: 'storage' | 'upload') => {
    if (type === 'daily') return source === 'storage' ? setDailyStorageState : setDailyUploadState;
    return source === 'storage' ? setMonthlyStorageState : setMonthlyUploadState;
  };
  const getState = (type: 'daily' | 'monthly', source: 'storage' | 'upload') => {
    if (type === 'daily') return source === 'storage' ? dailyStorageState : dailyUploadState;
    return source === 'storage' ? monthlyStorageState : monthlyUploadState;
  };

  const currentReport = useMemo(() => {
    const tab = activeDataTab === 'price_service' ? 'storage' : activeDataTab;
    return getState(currentType, tab as 'storage' | 'upload');
  }, [currentType, activeDataTab, dailyStorageState, dailyUploadState, monthlyStorageState, monthlyUploadState]);

  // Tự động ẩn thông báo áp giá đầy đủ ở báo cáo tháng sau 5 giây để tiết kiệm không gian
  useEffect(() => {
    if (currentType === 'monthly' && currentReport.result?.surgeries?.length) {
      setShowMonthlyFullPriceNotice(true);
      const timer = setTimeout(() => {
        setShowMonthlyFullPriceNotice(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [currentReport.result?.surgeries?.length, currentReport.queryDateRangeText, currentType]);

  const updateReportState = (type: 'daily' | 'monthly', patch: Partial<ReportState>, source?: 'storage' | 'upload') => {
    const resolvedSource = source ?? (activeDataTabs[type] || 'storage');
    const setter = getStateSetter(type, resolvedSource);
    setter(prev => ({ ...prev, ...patch }));
  };

  const updateCurrentReport = (updates: Partial<ReportState>) => {
    updateReportState(currentType, updates, activeDataTab);
  };

  // ── Lịch trực & Ngoài giờ (Shared State across Daily & Monthly) ──
  const [dutySchedules, setDutySchedules] = useState<Record<string, DutyScheduleDateConfig>>({});
  const [isSavingDutySchedule, setIsSavingDutySchedule] = useState<boolean>(false);

  // Lắng nghe sự kiện đồng bộ Lịch trực thời gian thực
  useEffect(() => {
    const handleDutyChange = (e: any) => {
      if (e.detail?.date) {
        setDutySchedules((prev) => ({
          ...prev,
          [e.detail.date]: e.detail,
        }));
      } else if (e.detail && typeof e.detail === 'object') {
        setDutySchedules((prev) => ({
          ...prev,
          ...e.detail,
        }));
      }
    };
    window.addEventListener(DUTY_SCHEDULE_CHANGE_EVENT, handleDutyChange);
    return () => window.removeEventListener(DUTY_SCHEDULE_CHANGE_EVENT, handleDutyChange);
  }, []);

  // Tự động nạp dữ liệu lịch trực cho các ngày có trong danh sách ca mổ
  useEffect(() => {
    const records = currentReport.result?.validRecords;
    if (!records || records.length === 0) return;

    const dateKeys = new Set<string>();
    records.forEach((r) => {
      const start = r.start || (r.ngayBD ? new Date(r.ngayBD) : null);
      const end = r.end || (r.ngayKT ? new Date(r.ngayKT) : null);
      if (start && !isNaN(start.getTime())) {
        const sch = getScheduleForDate(start, config?.workingHours);
        dateKeys.add(getDutyDateKey(start, sch.morningFrom || '07:00'));
        dateKeys.add(formatDateKey(start));
      }
      if (end && !isNaN(end.getTime())) {
        dateKeys.add(formatDateKey(end));
      }
    });

    const keysArray = Array.from(dateKeys);
    if (keysArray.length > 0) {
      dutyScheduleService.getDutySchedulesForDates(keysArray).then((fetched) => {
        setDutySchedules((prev) => ({
          ...prev,
          ...fetched,
        }));
      });
    }
  }, [currentReport.result?.validRecords, config?.workingHours]);

  // Cập nhật cấu hình lịch trực cho một ngày và lưu tức thì vào Firestore
  const handleUpdateDutySchedule = async (dateKey: string, isHoliday: boolean, onCallStaff: string[]) => {
    const updatedItem: DutyScheduleDateConfig = {
      date: dateKey,
      isHoliday,
      onCallStaff,
      updatedAt: Date.now(),
    };
    setDutySchedules((prev) => ({
      ...prev,
      [dateKey]: updatedItem,
    }));
    setIsSavingDutySchedule(true);
    try {
      await dutyScheduleService.saveDutyScheduleDate(dateKey, isHoliday, onCallStaff);
    } catch (err) {
      console.error('Lỗi khi lưu lịch trực:', err);
    } finally {
      setIsSavingDutySchedule(false);
    }
  };

  // Tính số lượng ngày trực và số lượng lượt ca ngoài giờ cho badge của TabLine
  const currentReportDutyDateCount = useMemo(() => {
    if (!currentReport.result?.validRecords || currentReport.result.validRecords.length === 0) return 0;
    const keys = new Set<string>();
    currentReport.result.validRecords.forEach((r) => {
      const start = r.start || (r.ngayBD ? new Date(r.ngayBD) : null);
      if (start && !isNaN(start.getTime())) {
        const sch = getScheduleForDate(start, config?.workingHours);
        keys.add(getDutyDateKey(start, sch.morningFrom || '07:00'));
      }
    });
    return keys.size;
  }, [currentReport.result?.validRecords, config?.workingHours]);

  const currentReportOvertimeCount = useMemo(() => {
    if (!currentReport.result?.validRecords || currentReport.result.validRecords.length === 0) return 0;
    try {
      const includeGV = typeof localStorage !== 'undefined' ? localStorage.getItem('sdp_overtime_include_gv') === 'true' : false;
      const rows = calculateOvertimeRows(currentReport.result.validRecords, dutySchedules, config?.workingHours, includeGV);
      return rows.length;
    } catch {
      return 0;
    }
  }, [currentReport.result?.validRecords, dutySchedules, config?.workingHours]);

  const executeDelete = async () => {
    const selectedIds = currentReport.selectedRecordIds || [];
    if (selectedIds.length === 0) return;

    try {
      if (!currentReport.result) return;

      // Match using key or id
      const recordsToDelete = currentReport.result.validRecords.filter(r =>
        selectedIds.includes(r.key || r.id || "")
      );

      if (recordsToDelete.length === 0) {
        addToast("Không tìm thấy dòng tương ứng để xóa", "error");
        return;
      }

      // 1. Chỉ xóa trong CSDL khi nguồn dữ liệu là LƯU TRỮ (STORAGE)
      if (currentReport.dataSource === 'STORAGE') {
        try {
          const recordsInDb = recordsToDelete.filter(r => !!(r as any).firestorePath);
          const toDelete = recordsInDb.length > 0 ? recordsInDb : recordsToDelete;
          const deletedCount = await reportService.deleteRecords(toDelete);
          if (deletedCount > 0) {
            addToast(`Đã xóa vĩnh viễn ${deletedCount} dòng từ cơ sở dữ liệu`, "success");
          }
        } catch (e) {
          console.error("Delete failed", e);
          addToast("Lỗi khi xóa từ Firestore. Vui lòng thử lại.", "error");
          return;
        }
      }

      // 2. Local Update & Reprocess
      const remainingRecords = currentReport.result.validRecords.filter(r =>
        !selectedIds.includes(r.key || r.id || "")
      );

      const newResult = reprocessSurgicalRecords(
        remainingRecords,
        config,
        currentReport.result.dateRangeText || ""
      );

      updateCurrentReport({
        result: newResult,
        selectedRecordIds: []
      });

      if (currentReport.dataSource !== 'STORAGE') {
        addToast(`Đã xóa ${selectedIds.length} dòng khỏi bảng hiện tại (dữ liệu lưu trữ không bị ảnh hưởng)`, "success");
      }
    } catch (err: any) {
      console.error("Delete error:", err);
      addToast(`Xóa thất bại: ${err?.message || 'Lỗi không xác định'}`, "error");
    }
  };

  const handleDeleteSelected = () => {
    const selectedIds = currentReport.selectedRecordIds || [];
    if (selectedIds.length === 0) return;

    const reportTypeName = currentType === 'monthly' ? 'Báo cáo tháng' : 'Báo cáo hàng ngày';
    const isStorage = currentReport.dataSource === 'STORAGE';
    const dataSourceName = isStorage ? 'Dữ liệu lưu trữ' : 'Dữ liệu import từ Excel';
    
    const warning = isStorage
      ? 'Hành động này sẽ xóa vĩnh viễn dữ liệu khỏi cơ sở dữ liệu!'
      : 'Chỉ xóa khỏi bảng hiện tại, dữ liệu đã lưu trữ không bị ảnh hưởng.';

    const message = `Bạn có chắc chắn muốn xóa ${selectedIds.length} dòng đã chọn?\n\n- Nguồn dữ liệu: ${dataSourceName}\n- Thuộc: ${reportTypeName}\n\n${warning}`;

    setDeleteConfirm({
      show: true,
      message,
      onConfirm: () => {
        setDeleteConfirm({ show: false, message: '', onConfirm: null });
        executeDelete();
      }
    });
  };

  const handleRowSelect = (id: string, selected: boolean) => {
    const currentIds = currentReport.selectedRecordIds || [];
    console.log(`[handleRowSelect] Toggling ID: "${id}" to ${selected}. Current IDs:`, currentIds);
    let newIds;
    if (selected) {
      newIds = [...currentIds, id];
      setLastActiveRecordId(id);
    } else {
      newIds = currentIds.filter(selectedId => selectedId !== id);
      if (lastActiveRecordId === id) {
        setLastActiveRecordId(newIds.length > 0 ? newIds[newIds.length - 1] : null);
      }
    }
    console.log(`[handleRowSelect] New IDs:`, newIds);
    updateCurrentReport({ selectedRecordIds: newIds });
  };

  const handleSelectAll = (selected: boolean) => {
    const records = currentReport.result?.validRecords || [];
    if (selected) {
      // Filter out records without keys/ids if any (shouldn't happen based on processor)
      // Support both key (Excel) and id (Storage)
      const allIds = records.map(r => r.key || r.id).filter(k => k) as string[];
      console.log(`[handleSelectAll] Selecting ${allIds.length} records`);
      updateCurrentReport({ selectedRecordIds: allIds });
    } else {
      console.log(`[handleSelectAll] Deselecting all`);
      updateCurrentReport({ selectedRecordIds: [] });
    }
  };

  // Per-Report UI settings from Config (with fallbacks to global or defaults)
  const reportConfig = config.uiSettings?.perReport?.[currentType];
  const rowsPerPage = reportConfig?.rowsPerPage || config.uiSettings?.rowsPerPage || 20;
  const dateFormat = reportConfig?.dateFormat || config.uiSettings?.dateFormat || 'dd/mm/yyyy hh:mm';
  const visibleCols = reportConfig?.visibleColumns || config.uiSettings?.visibleColumns || {};
  const searchableCols = reportConfig?.searchableColumns || config.uiSettings?.searchableColumns || {};

  const updateRowsPerPage = (n: number) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...(currentUISettings.perReport?.[currentType] as any),
            rowsPerPage: n
          }
        }
      }
    });
  };

  const updateDateFormat = (f: string) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...(currentUISettings.perReport?.[currentType] as any),
            dateFormat: f
          }
        }
      }
    });
  };

  const updateVisibleCols = (table: string, cols: Record<string, boolean>) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    const currentReportUI = currentUISettings.perReport?.[currentType] || { rowsPerPage, dateFormat, visibleColumns: {}, searchableColumns: {} };
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...currentReportUI,
            visibleColumns: { ...(currentReportUI.visibleColumns || {}), [table]: cols }
          }
        }
      }
    });
  };

  const updateSearchableCols = (table: string, cols: Record<string, boolean>) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    const currentReportUI = currentUISettings.perReport?.[currentType] || { rowsPerPage, dateFormat, visibleColumns: {}, searchableColumns: {} };
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...currentReportUI,
            searchableColumns: { ...(currentReportUI.searchableColumns || {}), [table]: cols }
          }
        }
      }
    });
  };

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: React.ReactNode, type: ToastType = 'success', duration = 6000) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), duration);
  };
  const removeToast = (id: string) => { setToasts(prev => prev.filter(t => t.id !== id)); };

  // Validate File
  const checkFile = (f: File) => {
    const validExts = ['.xlsx', '.xls'];
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
      addToast(`Lỗi: File "${f.name}" không hợp lệ. Vui lòng chọn file Excel!`, 'error');
      return false;
    }
    return true;
  };

  const handleListFileSelect = async (f: File | null) => {
    if (!f) { updateReportState(currentType, { listFile: null, listDateRange: "" }, 'upload'); return; }
    if (!checkFile(f)) return;

    const { validateListFile } = await import('./services/excelProcessor');
    const res = await validateListFile(f);

    if (!res.valid) {
      addToast(res.error || "File không hợp lệ", 'error', 14000);
      updateReportState(currentType, { listFile: null, listDateRange: "" }, 'upload');
      return;
    }

    updateReportState(currentType, {
      listFile: f,
      listDateRange: res.dateRangeText || ""
    }, 'upload');
    const reportName = currentType === 'monthly' ? 'Báo cáo tháng' : 'Báo cáo hàng ngày';
    addToast(
      <span>
        Bạn vừa tải dữ liệu Minh Lộ vào <strong className="text-red-600 font-bold">{reportName}</strong>. Lưu ý: sau khi kiểm tra, nếu dữ liệu chuẩn, hãy bấm Lưu để lưu dữ liệu vào bộ nhớ
      </span>,
      'success',
      7000
    );
  };

  // Reset file uploads và dữ liệu liên quan cho từng loại báo cáo
  const handleResetUpload = (type: 'daily' | 'monthly') => {
    updateReportState(type, {
      listFile: null,
      listDateRange: '',
      result: undefined,
      stats: undefined,
      hasAutoFilledData: false,
      dataSource: undefined,
      isProcessing: false
    }, 'upload');
    addToast('Đã hủy tải lên, dữ liệu đã được xóa.', 'success');
  };

  const handleProcess = async (type: 'daily' | 'monthly') => {
    const report = getState(type, 'upload');
    if (!report.listFile) return;

    updateReportState(type, { isProcessing: true }, 'upload');
    try {
      const res = await processSurgicalFiles(report.listFile, config);

      // Update config with learned staff info (Merge logic)
      if (res.extractedStaff && res.extractedStaff.length > 0) {
        const currentStaff: StaffMember[] = config.staffList || [];
        const newStaff: StaffMember[] = res.extractedStaff;

        const merged: StaffMember[] = [...currentStaff];
        const existingMap = new Map<string, StaffMember>(currentStaff.map(s => [`${s.name}-${s.position}`, s]));
        let hasUpdates = false;

        newStaff.forEach(s => {
          const key = `${s.name}-${s.position}`;
          if (!existingMap.has(key)) {
            merged.push(s);
            existingMap.set(key, s);
            hasUpdates = true;
          } else {
            const exist = existingMap.get(key)!;
            // Use mutable update on clone? No, 'merged' contains objects. 
            // 'exist' is a reference to an object in 'merged'.
            // Need to be careful with React state immutability, but updateConfig creates new object.
            // Let's create new object if updating.
            if ((!exist.taxId && s.taxId) || (!exist.department && s.department)) {
              // Find index and replace
              const idx = merged.findIndex(m => m.name === s.name && m.position === s.position);
              if (idx > -1) {
                merged[idx] = {
                  ...exist,
                  taxId: exist.taxId || s.taxId,
                  department: exist.department || s.department
                };
                hasUpdates = true;
              }
            }
          }
        });

        if (hasUpdates) {
          updateConfig({ staffList: merged });
          addToast(`Đã cập nhật thông tin ${newStaff.length} nhân viên từ file.`, 'success');
        }
      }

      // Auto-apply pricing for monthly reports
      if (type === 'monthly' && res.validRecords) {
        // 1. If user previously imported DVKT file in session, match & apply
        if (cachedServiceGroups.length > 0) {
          matchAndApplyServicePrices(res.validRecords, cachedServiceGroups);
        }

        // 2. For any records still missing price, match with DM giá DVKT (namePrices)
        // Check tenKT + surgery date falling within effective date range
        res.validRecords.forEach(r => {
          const hasPrice = (r.donGia && r.donGia > 0) || (r.thanhTien && r.thanhTien > 0);
          if (!hasPrice) {
            const rawDate = (r.start instanceof Date && !isNaN(r.start.getTime()))
              ? r.start.toISOString()
              : (r.ngayBD || '');
            const npResult = getNamePrice(r.tenKT, rawDate, namePrices);
            if (npResult.found && npResult.price > 0) {
              r.donGia = npResult.price;
              r.thanhTien = Math.round(npResult.price * (r.soLuong || 1));
              r.priceSource = 'catalog';
              if (npResult.matchedItem?.maTuongDuong) {
                r.maTuongDuong = npResult.matchedItem.maTuongDuong;
              }
            }
          }
        });
      }

      // Auto-fill assistant AND machine data for monthly reports from daily reports
      let updateGvCount = 0;
      let updateMachineCount = 0;

      if (type === 'monthly' && res.validRecords) {
        try {
          // Get both assistant and machine data from Daily
          const [assistantMap, machineMap] = await Promise.all([
            reportService.getAssistantDataFromDaily(res.validRecords),
            reportService.getMachineDataFromDaily(res.validRecords)
          ]);

          res.validRecords.forEach(r => {
            const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
            const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;

            // Fill assistant if empty
            if (!r.gv || r.gv.trim() === '') {
              const dailyGv = assistantMap.get(key);
              if (dailyGv) {
                r.gv = dailyGv;
                updateGvCount++;
              }
            }

            // Fill machine if empty (get from Daily reports)
            if (!r.machine || r.machine.trim() === '') {
              const dailyMachine = machineMap.get(key);
              if (dailyMachine) {
                r.machine = dailyMachine;
                updateMachineCount++;
              }
            }
          });
        } catch (error) {
          console.error('Error auto-filling from daily data:', error);
          // Continue with normal flow if auto-fill fails
        }
      }

      // Recalculate monthly report to guarantee workbook and stats reflect updated prices and staff/machine
      let finalResult = res;
      if (type === 'monthly' && res.validRecords) {
        finalResult = reprocessSurgicalRecords(
          res.validRecords,
          config,
          res.dateRangeText || ''
        );
      }

      updateReportState(type, {
        stats: finalResult.stats,
        result: finalResult,
        activeTable: 'list',
        isProcessing: false,
        dataSource: 'EXCEL',
        hasAutoFilledData: (updateGvCount > 0 || updateMachineCount > 0)
      }, 'upload');

      if (updateGvCount > 0 || updateMachineCount > 0) {
        const autoFillMsg = [];
        if (updateGvCount > 0) autoFillMsg.push(`${updateGvCount} giúp việc`);
        if (updateMachineCount > 0) autoFillMsg.push(`${updateMachineCount} mã máy`);
        addToast(`Đã tự động điền ${autoFillMsg.join(' và ')} từ BC hàng ngày.`, 'success');
      }

      // Thông báo chi tiết kết quả lọc theo Khoa/phòng & Vị trí kíp mổ lấy vào báo cáo
      if (res.filterSummary) {
        const { totalInFile, importedCount, excludedCount, missingStaffCount, unassignedStaffCount } = res.filterSummary;
        if (importedCount === 0) {
          addToast(
            `Không có ca mổ nào được import! (Toàn bộ ${totalInFile} ca bị loại bỏ do không thỏa mãn cấu hình khoa/phòng hoặc vị trí lấy vào báo cáo).`,
            'error',
            12000
          );
        } else if (excludedCount > 0) {
          const detailParts: string[] = [];
          if (missingStaffCount > 0) detailParts.push(`${missingStaffCount} ca nhân viên đối soát không có trong danh mục`);
          if (unassignedStaffCount > 0) detailParts.push(`${unassignedStaffCount} ca nhân viên có tên nhưng chưa xếp khoa`);
          const detailStr = detailParts.length > 0 ? ` (trong đó có ${detailParts.join(', ')})` : '';

          addToast(
            `Đã import ${importedCount}/${totalInFile} ca mổ. Đã loại bỏ ${excludedCount} ca không thuộc khoa/vị trí cấu hình${detailStr}.`,
            'info',
            10000
          );
        } else {
          addToast(`Đã import toàn bộ ${importedCount} ca mổ từ file Excel.`, 'success', 5000);
        }
      }

      // Thống kê và hiển thị thông báo áp giá cho Báo cáo tháng / Minh Lộ
      if (type === 'monthly' && res.validRecords) {
        const totalCount = res.validRecords.length;
        const pricedCount = res.validRecords.filter(r => (r.donGia && r.donGia > 0) || (r.thanhTien && r.thanhTien > 0)).length;

        let rangeText = res.dateRangeText || report.listDateRange || '';
        if (!rangeText) {
          const dates = res.validRecords
            .map(r => (r.start instanceof Date && !isNaN(r.start.getTime())) ? r.start.getTime() : (r.ngayBD ? new Date(r.ngayBD).getTime() : 0))
            .filter(t => t > 0)
            .sort((a, b) => a - b);
          if (dates.length > 0) {
            const minDate = new Date(dates[0]);
            const maxDate = new Date(dates[dates.length - 1]);
            const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            rangeText = `Từ ngày ${fmt(minDate)} đến ngày ${fmt(maxDate)}`;
          }
        }

        if (pricedCount < totalCount) {
          addToast(
            <div className="space-y-1 text-left">
              <p className="font-semibold text-amber-900 text-sm">
                Có {pricedCount}/{totalCount} trường hợp có giá áp dụng.
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                Hãy bổ sung import thêm báo cáo Thống kê giá DVKT trong khoảng thời gian {rangeText ? `(${rangeText}) ` : ''}để áp đầy đủ giá.
              </p>
            </div>,
            'warning',
            14000
          );
        } else {
          addToast(
            `Đã có ${pricedCount}/{totalCount} trường hợp có giá áp dụng.`,
            'success',
            6000
          );
        }
      }

    } catch (error: any) {
      console.error(error);
      addToast(error.message || "Có lỗi xử lý", 'error', 14000);
      updateReportState(type, {
        listFile: null,
        listDateRange: '',
        stats: null,
        result: null,
        isProcessing: false
      }, 'upload');
    }
  };

  const [isSaving, setIsSaving] = useState(false);


  const executeDownload = () => {
    if (!currentReport.result?.validRecords) {
      addToast("Chưa có dữ liệu để tải xuống.", 'error');
      return;
    }

    try {
      addToast("Đang tạo file Excel...", 'success');

      const freshResult = reprocessSurgicalRecords(
        currentReport.result.validRecords,
        config,
        currentReport.result.dateRangeText || ''
      );

      if (!freshResult.wb) {
        addToast("Lỗi khi tạo file Excel.", 'error');
        return;
      }

      const filename = `Ket_qua_${currentType}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(freshResult.wb, filename);
      addToast("Đã tải xuống file Excel.", 'success');
    } catch (e: any) {
      console.error("Download failed:", e);
      addToast("Lỗi khi tải file: " + e.message, 'error');
    }
  };

  const handleDownload = async () => {
    // Auto-save trước khi tải Excel nếu dữ liệu từ EXCEL
    if (currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
      await ensureDataSaved(executeDownload);
      return;
    }
    executeDownload();
  };

  const executeDownloadFormatted = async () => {
    if (!currentReport.result?.validRecords) {
      addToast('Chưa có dữ liệu để tải xuống.', 'error');
      return;
    }

    try {
      addToast('Đang tạo file Excel định dạng...', 'success');

      const freshResult = reprocessSurgicalRecords(
        currentReport.result.validRecords,
        config,
        currentReport.result.dateRangeText || ''
      );

      const exportCols = columnsList
        .filter(c => visibleCols['list']?.[c.key] !== false)
        .map(c => ({ key: c.key, label: c.label }));

      // Compute signatureDate for monthly: endDate + 1 day (parsed from dateRangeText)
      let signatureDate: Date | undefined;
      if (activeTab === 'monthly') {
        const dateRangeText = freshResult.dateRangeText || currentReport.queryDateRangeText || '';
        const endMatch = dateRangeText.match(/đến ngày (\d{2})\/(\d{2})\/(\d{4})/);
        if (endMatch) {
          const d = new Date(parseInt(endMatch[3]), parseInt(endMatch[2]) - 1, parseInt(endMatch[1]));
          d.setDate(d.getDate() + 1);
          signatureDate = d;
        }
      }

      await exportFormattedFullExcel(
        freshResult,
        config,
        exportCols,
        paymentDataPrepared || null,
        signatureDate,
      );

      addToast('Đã tải xuống file Excel định dạng.', 'success');
    } catch (e: any) {
      console.error('Formatted download failed:', e);
      addToast('Lỗi khi tải file: ' + e.message, 'error');
    }
  };

  const handleDownloadFormatted = async () => {
    // Auto-save trước khi tải Excel định dạng nếu dữ liệu từ EXCEL
    if (currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
      await ensureDataSaved(() => executeDownloadFormatted());
      return;
    }
    await executeDownloadFormatted();
  };

  // Create a hash of the config that strictly affects processing results (excluding UI settings)
  const processingConfigHash = useMemo(() => JSON.stringify({
    priceConfig: config.priceConfig,
    timeRules: config.timeRules,
    staffLimits: config.staffLimits,
    ignoredMachineCodes: config.ignoredMachineCodes,
    ignoredMachineNames: config.ignoredMachineNames,
    allowanceItems: config.allowanceItems,
    timeItemsList: config.timeItemsList,
    tableItems: config.tableItems,
    requiredMachineCatalog: config.requiredMachineCatalog
  }), [config]);

  useEffect(() => {
    const processReports = () => {
      if (dailyUploadState.listFile) handleProcess('daily');
      if (monthlyUploadState.listFile) handleProcess('monthly');
    };

    const timer = setTimeout(processReports, 300);
    return () => clearTimeout(timer);
  }, [processingConfigHash, dailyUploadState.listFile, monthlyUploadState.listFile]);

  const formatDateForDisplay = (dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y} ${timeStr}`;
  };

  const dynamicViolateMinTimeCount = useMemo(() => {
    if (!currentReport.result?.validRecords) return 0;
    return currentReport.result.validRecords.filter(r => {
      const minTime = getTimeRuleForRecord(r.loaiPTTT, r.ngayBD || r.start, config.timeItemsList, config.timeRules)?.min;
      return minTime && r.timeMinutes < minTime;
    }).length;
  }, [currentReport.result?.validRecords, config.timeRules, config.timeItemsList]);

  // Split PT/TT counts for Tab UI
  const { ptCount, ttCount } = useMemo(() => {
    if (!currentReport.result?.validRecords) return { ptCount: 0, ttCount: 0 };
    return {
      ptCount: currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('P')).length,
      ttCount: currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('T')).length
    };
  }, [currentReport.result?.validRecords]);

  // Calculate Missing Assistant Count
  const missingAssistantCount = useMemo(() => {
    if (!currentReport.result?.validRecords) return 0;
    return currentReport.result.validRecords.filter(r => !r.gv || r.gv.trim() === '').length;
  }, [currentReport.result?.validRecords]);

  // Combined stats from result and dynamic calculation
  const derivedStats = useMemo(() => {
    if (!currentReport.result?.stats) return {
      totalSurgeries: 0,
      totalDurationMinutes: 0,
      staffConflicts: 0,
      machineConflicts: 0,
      missingMachines: 0,
      lowPaymentCount: 0,
      violateMinTimeCount: 0,
      missingAssistantCount: 0
    };

    return {
      ...currentReport.result.stats,
      violateMinTimeCount: dynamicViolateMinTimeCount,
      missingAssistantCount: missingAssistantCount
    };
  }, [currentReport.result?.stats, dynamicViolateMinTimeCount, missingAssistantCount]);

  // -- Memoized Payment Data for Reuse in Print --
  const paymentDataPrepared = useMemo(() => {
    if (!currentReport.result?.paymentData?.rows || !config) return null;

    const rawRows = currentReport.result.paymentData.rows;
    const cols = currentReport.result.paymentData.columns;

    const GROUP_MAP: Record<string, string> = {
      "PĐB": "Phẫu thuật ĐB", "P1": "Phẫu thuật loại 1", "P2": "Phẫu thuật loại 2", "P3": "Phẫu thuật loại 3",
      "TĐB": "Thủ thuật ĐB", "T1": "Thủ thuật loại 1", "T2": "Thủ thuật loại 2", "T3": "Thủ thuật loại 3", "TKPL": "Thủ thuật KPL"
    };

    // Calculate Groups
    const groups: { name: string, label: string, subCols: string[] }[] = [];
    let currentGroup = "";
    cols.forEach(col => {
      const [loai, role] = col.split('-');
      if (loai !== currentGroup) {
        groups.push({ name: loai, label: GROUP_MAP[loai] || loai, subCols: [role] });
        currentGroup = loai;
      } else {
        groups[groups.length - 1].subCols.push(role);
      }
    });

    const enrichedRows = rawRows.map((row, idx) => {
      let rowTotalQty = 0;
      let rowTotalAmount = 0;
      Object.keys(row.values).forEach(colKey => {
        const qty = row.values[colKey] || 0;
        if (qty > 0) {
          rowTotalQty += qty;
          const [loai, role] = colKey.split('-');
          let configRole: any = "Giúp việc";
          if (role === "Chính") configRole = "Chính";
          else if (role === "Phụ") configRole = "Phụ";
          else if (role === "Giúp việc") configRole = "Giúp việc";
          const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
          rowTotalAmount += qty * price;
        }
      });
      return { ...row, stt: idx + 1, total_qty: rowTotalQty, total_amount: rowTotalAmount.toLocaleString('en-US') };
    });

    // Calculate Totals
    const footerTotals: Record<string, number> = { total_qty: 0, total_amount_val: 0 };
    const columnTotals: Record<string, number> = {};
    enrichedRows.forEach(row => {
      footerTotals.total_qty += row.total_qty;
      footerTotals.total_amount_val += Number(row.total_amount.replace(/,/g, ''));
      Object.keys(row.values).forEach(colKey => {
        columnTotals[colKey] = (columnTotals[colKey] || 0) + (row.values[colKey] || 0);
      });
    });

    return { enrichedRows, groups, cols, footerTotals, columnTotals };
  }, [currentReport.result?.paymentData, config]);

  const columnsList = useMemo<ColumnDef<SurgeryRecord>[]>(() => buildColumnsList(dateFormat, config), [config.timeRules, dateFormat]);
  const columnsMissing = useMemo<ColumnDef<SurgeryRecord>[]>(() => buildColumnsMissing(columnsList), [columnsList]);
  const columnsStaff = useMemo<ColumnDef<StaffConflict>[]>(() => buildColumnsStaff(dateFormat), [dateFormat]);
  const columnsMachine = useMemo<ColumnDef<MachineConflict>[]>(() => buildColumnsMachine(dateFormat), [dateFormat]);

  const getPaymentColumns = (): ColumnDef<any>[] => {
    return buildPaymentColumns(currentReport.result?.paymentData?.columns);
  };

  // Add missing helpers
  const updateSearchTerm = (key: keyof typeof initialReportState.searchTerms, val: string) => {
    updateCurrentReport({ searchTerms: { ...currentReport.searchTerms, [key]: val } });
    if (key === 'list') setListPage(1);
  };
  const setActiveTable = (table: ReportState['activeTable']) => updateCurrentReport({ activeTable: table });

  // --- Data FIltering Memos (Moved to Top Level Scope for handleSaveAssistant) ---
  const listSearchableCols = useMemo(() => searchableCols['list'] || {
    patientId: true, patientName: true, ngayBD: true, tenKT: true,
    loaiPTTT: true, ptChinh: true, ptPhu: true, bsGM: true,
    ktvGM: true, tdc: true, gv: true, reason: true
  }, [searchableCols]);

  const [emptyFilterCol, setEmptyFilterCol] = useState<string | null>(null);
  const [showEmptyFilterMenu, setShowEmptyFilterMenu] = useState(false);

  const filteredList = useMemo(() => {
    let list = (currentReport.result?.validRecords || []).filter(r => matchSearchQuery(r, currentReport.searchTerms.list, listSearchableCols, columnsList, config.timeRules, config.timeItemsList));
    if (emptyFilterCol) {
      list = list.filter(r => {
        const val = (r as any)[emptyFilterCol];
        if (val === undefined || val === null) return true;
        if (typeof val === 'string') {
          const cleaned = val.trim().replace(/[\u00A0\u200B]/g, '');
          return cleaned === '' || cleaned === '-';
        }
        if (typeof val === 'number') return val === 0;
        return !val;
      });
    }
    return list;
  }, [currentReport.result?.validRecords, currentReport.searchTerms.list, config.timeRules, listSearchableCols, emptyFilterCol]);

  const filteredStaff = useMemo(() => {
    return (currentReport.result?.staffConflicts || []).filter(r => matchSearchQuery(r, currentReport.searchTerms.staff, undefined, columnsStaff));
  }, [currentReport.result?.staffConflicts, currentReport.searchTerms.staff]);

  const filteredMachine = useMemo(() => {
    return (currentReport.result?.machineConflicts || []).filter(r => matchSearchQuery(r, currentReport.searchTerms.machine, undefined, columnsMachine));
  }, [currentReport.result?.machineConflicts, currentReport.searchTerms.machine]);

  const filteredMissing = useMemo(() => {
    const rawData = currentReport.result?.missingRecords || [];
    return rawData.filter(r => matchSearchQuery(r, currentReport.searchTerms.missing, undefined, columnsMissing));
  }, [currentReport.result?.missingRecords, currentReport.searchTerms.missing]);

  const [listPage, setListPage] = useState(1);

  useEffect(() => {
    setListPage(1);
  }, [currentReport.searchTerms.list, emptyFilterCol]);

  const handleSaveAssistant = async (val: string) => {
    const cleanVal = val ? val.trim() : '';
    console.log(`[SaveAssistant] Called with Value: "${val}" (Clean: "${cleanVal}")`);
    console.log(`[SaveAssistant] Config Staff List Size: ${(config.staffList || []).length}`);

    // 0. Strict Validation (Server-side like check)
    // If value is not empty, it MUST match a valid staff member with an assistant role
    if (cleanVal !== '') {
      const validRoles = ["Phụ", "GV", "TDC", "KTV GM", "KTV", "Tit DC", "Tít DC"];

      const exactMatch = (config.staffList || []).find(s => s.name === cleanVal);
      if (exactMatch) {
        console.log(`[SaveAssistant] Found staff "${cleanVal}" with position: "${exactMatch.position}"`);
      } else {
        console.log(`[SaveAssistant] Staff "${cleanVal}" NOT found in list.`);
      }

      const isValidStaff = exactMatch && (
        validRoles.includes(exactMatch.position) ||
        exactMatch.position === "Phụ" ||
        exactMatch.name.includes("(Phụ)")
      );

      console.log(`[SaveAssistant] Validation check result: ${isValidStaff ? 'PASS' : 'FAIL'}`);

      if (!isValidStaff) {
        let msg = `Tên "${cleanVal}" không có trong danh sách nhân viên.`;
        if (exactMatch) {
          msg = `Nhân viên "${cleanVal}" (chức vụ: ${exactMatch.position}) không được phép làm Giúp việc.`;
        }
        addToast(msg, 'error');
        return; // BLOCK SAVE
      }
    } else {
      console.log(`[SaveAssistant] Value is empty, clearing field.`);
    }

    if (!currentReport.result?.validRecords) return;
    const { selectedRecordIds } = currentReport;
    if (!selectedRecordIds || selectedRecordIds.length === 0) return;

    // Use current visible list for navigation context
    const workingList = (currentReport.activeTable === 'list') ? filteredList : currentReport.result.validRecords;
    console.log(`[SaveAssistant] Working List Length: ${workingList.length}`);

    const updatedIds: string[] = [];

    // Phase 1: Update Data (Source of Truth)
    const isStorage = currentReport.dataSource === 'STORAGE';
    const batchUpdates: Promise<any>[] = [];

    // We iterate the MAIN records to ensure we update everything selected
    console.log(`[SaveAssistant] Selected IDs:`, selectedRecordIds);
    if (!selectedRecordIds || selectedRecordIds.length === 0) return; // Verify explicitly again

    currentReport.result.validRecords.forEach(r => {
      // Robust check: dynamic table might use ID or Key depending on data source
      const isSelected = (r.id && selectedRecordIds.includes(r.id)) || (r.key && selectedRecordIds.includes(r.key));

      if (isSelected) {
        const rId = r.id || r.key || '';
        r.gv = cleanVal;
        updatedIds.push(rId);

        // Lưu trực tiếp vào DB nếu bản ghi đã từng được lưu (có firestorePath)
        const path = (r as any).firestorePath;
        if (path) {
          console.log(`[SaveAssistant] Updating ${r.id || r.key} at path: ${path} with Value: ${cleanVal}`);
          const docRef = doc(firestore, path);
          batchUpdates.push(
            updateDoc(docRef, { gv: cleanVal })
              .then(() => console.log(`[SaveAssistant] Success: ${path}`))
              .catch(err => console.error(`[SaveAssistant] Failed: ${path}`, err))
          );
        } else if (isStorage && r.id) {
          // Fallback legacy
          const legacyPath = `uploaded_surgeries/${r.id}`;
          const docRef = doc(firestore, legacyPath);
          batchUpdates.push(
            updateDoc(docRef, { gv: cleanVal })
              .then(() => console.log(`[SaveAssistant] Success: ${legacyPath}`))
              .catch(err => console.error(`[SaveAssistant] Failed: ${legacyPath}`, err))
          );
        }
      }
    });

    // Prepare state updates
    const stateUpdates: Partial<ReportState> = {};

    if (updatedIds.length > 0) {
      if (batchUpdates.length > 0) {
        try {
          await Promise.all(batchUpdates);
          // Toast managed by caller or we can show it here
          addToast(`Đã lưu ${updatedIds.length} bản ghi vào hệ thống.`, 'success');
        } catch (e) {
          console.error("Save failed", e);
          addToast("Lỗi khi lưu dữ liệu vào hệ thống.", 'error');
        }
      } else if (currentReport.dataSource === 'EXCEL') {
        addToast(`Đã cập nhật ${updatedIds.length} bản ghi (Chưa lưu vào CSDL)`, 'success');
      }

      // Phase 2: Recalculate Result (In-Memory)
      const newResultPartial = recalculateResultFromRecords(currentReport.result.validRecords, config);
      stateUpdates.result = { ...currentReport.result, ...newResultPartial };
    }

    // Phase 3: Smart Navigation (Find next empty GV in VISIBLE list)
    let lastSelectedIndex = -1;
    for (let i = workingList.length - 1; i >= 0; i--) {
      const r = workingList[i];
      const isSelected = (r.id && selectedRecordIds.includes(r.id)) || (r.key && selectedRecordIds.includes(r.key));
      if (isSelected) {
        lastSelectedIndex = i;
        break;
      }
    }

    console.log(`[AutoJump] Last Selected Index: ${lastSelectedIndex}`);

    if (lastSelectedIndex !== -1) {
      let nextIndex = -1;
      // Search forward
      for (let i = lastSelectedIndex + 1; i < workingList.length; i++) {
        const r = workingList[i];
        if (!r.gv || r.gv.trim() === '') {
          nextIndex = i;
          break;
        }
      }

      console.log(`[AutoJump] Forward search found: ${nextIndex}`);

      // Loop back
      if (nextIndex === -1) {
        for (let i = 0; i <= lastSelectedIndex; i++) {
          const r = workingList[i];
          if (!r.gv || r.gv.trim() === '') {
            nextIndex = i;
            break;
          }
        }
        console.log(`[AutoJump] Loop-back search found: ${nextIndex}`);
      }

      if (nextIndex !== -1) {
        const nextRecord = workingList[nextIndex];
        // FIX: Must match DynamicTable precedence (key > id) to ensure consistent selection/deselection
        const newId = nextRecord.key || nextRecord.id || '';
        console.log(`[AutoJump] Moving selection to index ${nextIndex} (ID: ${newId})`);

        stateUpdates.selectedRecordIds = [newId];

        // Switch page
        const targetPage = Math.ceil((nextIndex + 1) / rowsPerPage);
        console.log(`[AutoJump] Target page: ${targetPage}, Current page: ${listPage}`);
        if (targetPage !== listPage) {
          console.log(`[AutoJump] Switching page to ${targetPage}`);
          setListPage(targetPage);
        }
      } else {
        console.log(`[AutoJump] No empty records found.`);
        stateUpdates.selectedRecordIds = [];
      }
    }

    // Apply all updates atomically
    if (Object.keys(stateUpdates).length > 0) {
      updateCurrentReport(stateUpdates);
    }
  };

  const handleOpenEditModal = () => {
    const recs = currentReport.result?.validRecords || [];
    const targetId = (lastActiveRecordId && currentReport.selectedRecordIds.includes(lastActiveRecordId))
      ? lastActiveRecordId
      : currentReport.selectedRecordIds[0];
    const rec = recs.find(r => (r.key || r.id) === targetId);
    if (rec) {
      setEditingRecord(rec);
    }
  };

  const handleRowDoubleClick = (row: any) => {
    if (!row) return;
    if (row.rec1) {
      setEditingRecord(row.rec1);
    } else {
      setEditingRecord(row);
    }
  };

  const handleSaveEditedRecord = async (updatedRecord: SurgeryRecord) => {
    if (!currentReport.result?.validRecords) return;
    const targetId = updatedRecord.id || updatedRecord.key;
    const index = currentReport.result.validRecords.findIndex(r => (r.id || r.key) === targetId);
    if (index === -1) return;

    const newRecords = [...currentReport.result.validRecords];
    newRecords[index] = updatedRecord;

    // Lưu Firestore tức thì nếu bản ghi đã có path
    const path = (updatedRecord as any).firestorePath;
    if (path) {
      try {
        const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
        await reportService.updateSingleRecord(path, updatedRecord, type);
      } catch (err) {
        console.error('[SurgeryEdit] Update firestore failed:', err);
      }
    }

    // Tự động tính toán lại toàn diện: cảnh báo trùng NV, trùng máy, thiếu máy, thiếu GV, thanh toán PTTT
    const newResultPartial = recalculateResultFromRecords(newRecords, config);
    updateCurrentReport({
      result: {
        ...currentReport.result,
        validRecords: newRecords,
        ...newResultPartial,
      },
      hasAutoFilledData: true,
    });

    addToast(`Đã lưu thay đổi thông tin của bệnh nhân ${updatedRecord.patientName}.`, 'success');
    setEditingRecord(null);
  };

  const renderTableContent = () => {
    if (!currentReport.result || !currentReport.stats || !currentReport.activeTable) return null;

    if (currentReport.activeTable === 'list') {
      const rowStyle = (r: SurgeryRecord) => {
        const min = getTimeRuleForRecord(r.loaiPTTT, r.ngayBD || r.start, config.timeItemsList, config.timeRules)?.min;
        return (min && r.timeMinutes < min) ? 'bg-yellow-50 text-red-600 font-medium' : '';
      };
      const ptCount = currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('P')).length;
      const ttCount = currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('T')).length;
      const countLabel = `${ptCount} ca PT, ${ttCount} ca TT`;
      return <DynamicTable
        data={filteredList}
        columns={columnsList}
        tableName="Danh sách phẫu thuật"
        dateFormat={dateFormat}
        onDateFormatChange={updateDateFormat}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={updateRowsPerPage}
        defaultVisibleCols={visibleCols['list']}
        onVisibleColsChange={(cols) => updateVisibleCols('list', cols)}
        rowStyle={rowStyle}
        rowCountLabel={countLabel}
        searchTerm={currentReport.searchTerms.list}
        onSearchChange={(val) => updateSearchTerm('list', val)}
        searchableCols={listSearchableCols}
        onSearchableColsChange={(cols) => updateSearchableCols('list', cols)}
        showSearchSettings
        enableSelection={true}
        selectedIds={currentReport.selectedRecordIds}
        onSelect={handleRowSelect}
        onSelectAll={handleSelectAll}
        onDelete={handleDeleteSelected}
        onEditRecord={handleOpenEditModal}
        onRowDoubleClick={handleRowDoubleClick}
        currentPage={listPage}
        onPageChange={setListPage}
        onSaveAssistant={handleSaveAssistant}
        extraSearchContent={
          <div className="relative ml-2 flex items-center">
            <div className="inline-flex rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setEmptyFilterCol(prev => prev === 'gv' ? null : 'gv')}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 transition-all select-none whitespace-nowrap ${
                  emptyFilterCol
                    ? 'bg-red-50 text-red-700 hover:bg-red-100 font-semibold'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title={emptyFilterCol ? "Nhấp để bỏ lọc ô trống" : "Nhấp để lọc nhanh các ca chưa có Giúp việc"}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                {emptyFilterCol ? (
                  <>
                    <span>Lọc trống: <strong className="text-red-800">{columnsList.find(c => c.key === emptyFilterCol)?.label || emptyFilterCol}</strong></span>
                    <span
                      onClick={(e) => { e.stopPropagation(); setEmptyFilterCol(null); }}
                      className="ml-1 text-red-400 hover:text-red-700 cursor-pointer"
                      title="Bỏ lọc"
                    >✕</span>
                  </>
                ) : (
                  'Lọc GV trống'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowEmptyFilterMenu(prev => !prev)}
                className={`px-1.5 py-1.5 border-l border-gray-200 transition-colors ${
                  emptyFilterCol ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
                title="Chọn cột khác để lọc ô trống"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            {showEmptyFilterMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEmptyFilterMenu(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[210px] max-h-[320px] overflow-y-auto">
                  <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    Chọn cột cần lọc trống
                  </div>
                  {columnsList.filter(c => c.key !== 'stt').map(col => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => {
                        setEmptyFilterCol(prev => prev === col.key ? null : col.key);
                        setShowEmptyFilterMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                        emptyFilterCol === col.key
                          ? 'bg-red-50 text-red-800 font-bold'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                        emptyFilterCol === col.key ? 'bg-red-600 border-red-600' : 'border-gray-300'
                      }`}>
                        {emptyFilterCol === col.key && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      {col.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        }
      />;
    }
    if (currentReport.activeTable === 'staff') {
      const staffRowStyle = (r: StaffConflict) => r.violationType === 'max2' ? 'text-red-600 font-bold bg-red-50' : '';
      return <DynamicTable data={filteredStaff} columns={columnsStaff} tableName="Danh sách trùng giờ nhân viên" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['staff']} onVisibleColsChange={(cols) => updateVisibleCols('staff', cols)} rowStyle={staffRowStyle} searchTerm={currentReport.searchTerms.staff} onSearchChange={(val) => updateSearchTerm('staff', val)} onRowDoubleClick={handleRowDoubleClick} />;
    }
    if (currentReport.activeTable === 'machine') {
      return <DynamicTable data={filteredMachine} columns={columnsMachine} tableName="Danh sách trùng máy thực hiện" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['machine']} onVisibleColsChange={(cols) => updateVisibleCols('machine', cols)} searchTerm={currentReport.searchTerms.machine} onSearchChange={(val) => updateSearchTerm('machine', val)} onRowDoubleClick={handleRowDoubleClick} />;
    }
    if (currentReport.activeTable === 'missing') {
      return <DynamicTable data={filteredMissing} columns={columnsMissing} tableName="Danh sách thiếu mã máy" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['missing']} onVisibleColsChange={(cols) => updateVisibleCols('missing', cols)} searchTerm={currentReport.searchTerms.missing} onSearchChange={(val) => updateSearchTerm('missing', val)} onRowDoubleClick={handleRowDoubleClick} />;
    }
    if (currentReport.activeTable === 'payment') {
      return (
        <PaymentTableView
          paymentDataPrepared={paymentDataPrepared}
          searchTerm={currentReport.searchTerms.payment}
          onSearchChange={(val) => updateSearchTerm('payment', val)}
          visibleCols={visibleCols['payment']}
          onVisibleColsChange={(cols) => updateVisibleCols('payment', cols)}
          dateFormat={dateFormat}
          onDateFormatChange={updateDateFormat}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={updateRowsPerPage}
          config={config}
        />
      );
    }

    if (currentReport.activeTable === 'duty') {
      return (
        <DutyScheduleTab
          records={currentReport.result.validRecords}
          dutySchedules={dutySchedules}
          onUpdateDutySchedule={handleUpdateDutySchedule}
          config={config}
          isSaving={isSavingDutySchedule}
          dateRangeText={
            (currentReport.dataSource === 'STORAGE' && currentReport.queryDateRangeText)
              ? currentReport.queryDateRangeText
              : currentReport.result?.dateRangeText || currentReport.queryDateRangeText || currentReport.listDateRange || ''
          }
        />
      );
    }

    if (currentReport.activeTable === 'overtime') {
      return (
        <OvertimeTab
          records={currentReport.result.validRecords}
          dutySchedules={dutySchedules}
          config={config}
          dateFormat={dateFormat}
          onNavigateToDutyTab={() => setActiveTable('duty')}
          reportDateRangeText={
            (currentReport.dataSource === 'STORAGE' && currentReport.queryDateRangeText)
              ? currentReport.queryDateRangeText
              : currentReport.result?.dateRangeText || currentReport.listDateRange || ''
          }
          onRegisterPrintHandler={(handler) => {
            overtimePrintHandlerRef.current = handler;
          }}
          onTriggerPrint={(pConfig) => {
            setPrintOrientation(pConfig.orientation || 'portrait');
            setPrintConfig(pConfig);
            setIsPrintOpen(true);
          }}
        />
      );
    }
    return null;
  };

  // --- Print Handling ---
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState<any>(null);
  const overtimePrintHandlerRef = useRef<(() => void) | null>(null);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('landscape');


  const handlePrintClick = async (type: 'list' | 'payment', orientation: 'portrait' | 'landscape') => {
    setPrintOrientation(orientation);
    
    // Tự động lưu dữ liệu trước khi in nếu dữ liệu lấy từ EXCEL
    if (currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
      await ensureDataSaved(() => {
        // After save, proceed with print (called as callback)
        executePrintLogic(type, orientation);
      });
      return;
    }

    // Non-EXCEL source or no data: proceed directly
    executePrintLogic(type, orientation);
  };

  const executePrintLogic = (type: 'list' | 'payment', orientation: 'portrait' | 'landscape') => {
    const configObj = buildPrintConfig({
      type,
      reportTab: activeTab as 'daily' | 'monthly',
      dateRangeText: currentReport.result?.dateRangeText || currentReport.queryDateRangeText || '',
      validRecords: currentReport.result?.validRecords || [],
      columnsList,
      listVisibleCols: visibleCols['list'],
      paymentVisibleCols: visibleCols['payment'],
      derivedStats,
      ptCount,
      ttCount,
      paymentDataPrepared,
      paymentCols: getPaymentColumns(),
      config,
    });

    if (configObj) {
      setPrintConfig(configObj);
      setIsPrintOpen(true);
    } else {
      addToast("Vui lòng chọn 'Danh sách PT' hoặc 'Bảng kê thanh toán' để in.", 'error');
    }
  };

  // Helper function to determine season based on working hours config
  const determineSeason = (checkDate: Date, workingHours: any): 'summer' | 'winter' => {
    const checkMonth = checkDate.getMonth() + 1; // 1-12
    const checkDay = checkDate.getDate(); // 1-31

    // Parse summer config (DD/MM format)
    const [summerFromDay, summerFromMonth] = workingHours.summer.dateFrom.split('/').map(Number);
    const [summerToDay, summerToMonth] = workingHours.summer.dateTo.split('/').map(Number);

    // Parse winter config (DD/MM format)
    const [winterFromDay, winterFromMonth] = workingHours.winter.dateFrom.split('/').map(Number);
    const [winterToDay, winterToMonth] = workingHours.winter.dateTo.split('/').map(Number);

    // Check if range is cross-year
    const summerCrossYear = summerFromMonth > summerToMonth ||
      (summerFromMonth === summerToMonth && summerFromDay > summerToDay);
    const winterCrossYear = winterFromMonth > winterToMonth ||
      (winterFromMonth === winterToMonth && winterFromDay > winterToDay);

    // Helper to check if date is in range
    const isInRange = (checkM: number, checkD: number, fromM: number, fromD: number, toM: number, toD: number, crossYear: boolean): boolean => {
      if (!crossYear) {
        // Same year range
        if (checkM < fromM || checkM > toM) return false;
        if (checkM === fromM && checkD < fromD) return false;
        if (checkM === toM && checkD > toD) return false;
        return true;
      } else {
        // Cross-year range: early year (01/01 to toM/toD) OR late year (fromM/fromD to 31/12)
        if (checkM <= toM) {
          // Early year part
          if (checkM < toM) return true;
          if (checkM === toM && checkD <= toD) return true;
          return false;
        } else if (checkM >= fromM) {
          // Late year part
          if (checkM > fromM) return true;
          if (checkM === fromM && checkD >= fromD) return true;
          return false;
        }
        return false;
      }
    };

    // Check summer first
    if (isInRange(checkMonth, checkDay, summerFromMonth, summerFromDay, summerToMonth, summerToDay, summerCrossYear)) {
      return 'summer';
    }

    // Otherwise winter
    return 'winter';
  };

  // Handler for "Lấy dữ liệu trực" button
  const handleAutoFill24hShift = () => {
    // Step 1: Get dateFrom from current report (YYYY-MM-DD format)
    const dateFromStr = currentReport.dateFrom;
    if (!dateFromStr) {
      addToast('Vui lòng chọn ngày bắt đầu trước', 'error');
      return;
    }

    const dateFrom = new Date(dateFromStr);

    // Step 2: Calculate dateTo = dateFrom + 1 day
    const dateTo = new Date(dateFrom);
    dateTo.setDate(dateTo.getDate() + 1);
    const dateToStr = dateTo.toISOString().split('T')[0]; // YYYY-MM-DD

    // Step 3: Determine season
    const season = determineSeason(dateFrom, config.workingHours);

    // Step 4: Get morningFrom time from matching season
    const morningFrom = season === 'summer'
      ? config.workingHours.summer.morningFrom
      : config.workingHours.winter.morningFrom;

    // Step 5: Calculate timeTo = morningFrom - 1 minute
    const [hours, minutes] = morningFrom.split(':').map(Number);
    let toMinutes = minutes - 1;
    let toHours = hours;

    if (toMinutes < 0) {
      toMinutes = 59;
      toHours = hours - 1;
      if (toHours < 0) {
        toHours = 23;
      }
    }

    const timeTo = `${String(toHours).padStart(2, '0')}:${String(toMinutes).padStart(2, '0')}`;

    // Step 6: Update currentReport with all 4 values
    updateReportState(currentType, {
      dateFrom: dateFromStr,
      timeFrom: morningFrom,
      dateTo: dateToStr,
      timeTo: timeTo
    }, 'storage');

    // Step 7: Trigger data fetch immediately with computed values (no need to wait for state)
    // Build ISO strings from computed values (with Vietnam timezone +07:00)
    const dateFromIso = `${dateFromStr}T${morningFrom}:00.000+07:00`;
    const dateToIso = `${dateToStr}T${timeTo}:59.999+07:00`;

    // Call handleGetReport logic inline
    (async () => {
      try {
        addToast('Đang tải dữ liệu lưu trữ...', 'success');

        const isoFrom = new Date(dateFromIso).toISOString();
        const isoTo = new Date(dateToIso).toISOString();

        const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
        const persistedRecords = await reportService.getReports(isoFrom, isoTo, type);

        if (persistedRecords.length === 0) {
          // Reset UI and show detailed message
          updateReportState(currentType, {
            result: undefined,
            stats: undefined,
            dataSource: undefined,
            queryDateRangeText: ''
          }, 'storage');
          addToast(`Không có trường hợp phẫu thuật nào trong khoảng thời gian từ ${dateFromStr} ${morningFrom} đến ${dateToStr} ${timeTo}`, 'error');
          return;
        }

        // Convert PersistedSurgeryRecord to SurgeryRecord
        const convertedRecords: SurgeryRecord[] = persistedRecords.map(r => ({
          ...r,
          stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
          start: r.ngayBD ? new Date(r.ngayBD) : null,
          end: r.ngayKT ? new Date(r.ngayKT) : null,
        }));

        const result = recalculateResultFromRecords(convertedRecords, config) as ProcessingResult;

        updateReportState(currentType, {
          dateFrom: dateFromStr,
          timeFrom: morningFrom,
          dateTo: dateToStr,
          timeTo: timeTo,
          result: result,
          stats: result.stats,
          activeTable: 'list',
          queryDateRangeText: `Từ ngày ${formatDateForDisplay(dateFromStr, morningFrom)} đến ngày ${formatDateForDisplay(dateToStr, timeTo)}`,
          dataSource: 'STORAGE'
        }, 'storage');

        addToast(`Đã tải ${persistedRecords.length} ca phẫu thuật từ dữ liệu lưu trữ`, 'success');
      } catch (error: any) {
        console.error('Error fetching report:', error);
        addToast(`Lỗi khi tải dữ liệu: ${error.message}`, 'error');
      }
    })();
  };

  const handleGetReport = async () => {
    const storageState = getState(currentType, 'storage');

    let effDateFrom = storageState.dateFrom;
    let effTimeFrom = storageState.timeFrom;
    let effDateTo = storageState.dateTo;
    let effTimeTo = storageState.timeTo;

    if (currentType === 'monthly' && monthlyTimeMode === 'month') {
      const mStr = String(selectedMonthlyMonth).padStart(2, '0');
      const lastDay = new Date(selectedMonthlyYear, selectedMonthlyMonth, 0).getDate();
      effDateFrom = `${selectedMonthlyYear}-${mStr}-01`;
      effTimeFrom = '00:00';
      effDateTo = `${selectedMonthlyYear}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      effTimeTo = '23:59';
    }

    // Construct Date Range from State with explicit timezone (Vietnam = +07:00)
    // This ensures the date-time is correctly parsed as local time before conversion to UTC
    const dateFromStr = `${effDateFrom}T${effTimeFrom}:00.000+07:00`;
    const dateToStr = `${effDateTo}T${effTimeTo}:59.999+07:00`;

    // Validate
    const paramsValid = new Date(dateFromStr) <= new Date(dateToStr);
    if (!paramsValid) {
      addToast("Thời gian 'Đến' phải lớn hơn hoặc bằng Thời gian 'Từ'", 'error');
      return;
    }

    try {
      addToast('Đang tải dữ liệu lưu trữ...', 'success'); // Treating as success/info

      const isoFrom = new Date(dateFromStr).toISOString();
      const isoTo = new Date(dateToStr).toISOString();


      const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
      const persistedRecords = await reportService.getReports(isoFrom, isoTo, type);

      if (!persistedRecords || persistedRecords.length === 0) {
        // Reset UI and show detailed message
        updateReportState(currentType, {
          result: undefined,
          stats: undefined,
          dataSource: undefined,
          queryDateRangeText: ''
        }, 'storage');
        addToast(`Không có trường hợp phẫu thuật nào trong khoảng thời gian từ ${effDateFrom} ${effTimeFrom} đến ${effDateTo} ${effTimeTo}`, 'error');
        return;
      }

      // Convert Persisted Record -> App Record (Dates & Pricing)
      const convertedRecords: SurgeryRecord[] = persistedRecords.map(r => ({
        ...r,
        stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
        start: r.ngayBD ? new Date(r.ngayBD) : null,
        end: r.ngayKT ? new Date(r.ngayKT) : null,
        maTuongDuong: r.maTuongDuong,
        donGia: r.donGia,
        thanhTien: r.thanhTien,
      }));

      // Với BC hàng ngày: tự động kiểm tra mã BN, tên PTTT, khoảng thời gian ở BC tháng để lấy Mã tương đương, Đơn giá, Thành tiền
      let syncedPriceCount = 0;
      if (type === 'DAILY' && convertedRecords.length > 0) {
        try {
          const syncRes = await reportService.syncPricingFromMonthly(convertedRecords, isoFrom, isoTo);
          syncedPriceCount = syncRes.updatedCount;
        } catch (syncErr) {
          console.warn('Lỗi khi đồng bộ giá từ BC tháng sang BC hàng ngày:', syncErr);
        }
      }

      const queryRangeText = `Từ ngày ${formatDateForDisplay(effDateFrom, effTimeFrom)} đến ngày ${formatDateForDisplay(effDateTo, effTimeTo)}`;
      const res = await reprocessSurgicalRecords(convertedRecords, config, queryRangeText);

      if (res.success) {
        // Auto-fill assistant AND machine data for monthly reports from daily reports
        if (type === 'MONTHLY' && res.validRecords) {
          try {
            // Get both assistant and machine data from Daily
            const [assistantMap, machineMap] = await Promise.all([
              reportService.getAssistantDataFromDaily(res.validRecords),
              reportService.getMachineDataFromDaily(res.validRecords)
            ]);

            let updateGvCount = 0;
            let updateMachineCount = 0;
            const updatesToSave: Array<{ firestorePath: string, gv?: string, machine?: string }> = [];

            res.validRecords.forEach(r => {
              const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
              const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;
              let needsUpdate = false;
              const updateData: { firestorePath: string, gv?: string, machine?: string } = {
                firestorePath: r.firestorePath || ''
              };

              // Fill assistant if empty (only fill missing data)
              if (!r.gv || r.gv.trim() === '') {
                const dailyGv = assistantMap.get(key);
                if (dailyGv) {
                  r.gv = dailyGv;
                  updateData.gv = dailyGv;
                  updateGvCount++;
                  needsUpdate = true;
                }
              }

              // Fill machine if empty (only fill missing data)
              if (!r.machine || r.machine.trim() === '') {
                const dailyMachine = machineMap.get(key);
                if (dailyMachine) {
                  r.machine = dailyMachine;
                  updateData.machine = dailyMachine;
                  updateMachineCount++;
                  needsUpdate = true;
                }
              }

              // Add to updates list if has valid path and needs update
              if (needsUpdate && updateData.firestorePath) {
                updatesToSave.push(updateData);
              }
            });

            if (updateGvCount > 0 || updateMachineCount > 0) {
              // AUTO-SAVE: Persist the auto-filled data to Storage
              if (updatesToSave.length > 0) {
                try {
                  await reportService.batchUpdateGvAndMachine(updatesToSave);
                  console.log(`Auto-saved ${updatesToSave.length} records with GV/machine data to monthly storage.`);
                } catch (saveError) {
                  console.error('Error auto-saving to storage:', saveError);
                  // Continue anyway - data is still in memory for display
                }
              }

              // Recalculate with updated data
              const freshResult = reprocessSurgicalRecords(
                res.validRecords,
                config,
                queryRangeText
              );

              // Update state with fresh calculations
              updateReportState(currentType, {
                result: freshResult,
                stats: freshResult.stats,
                activeTable: 'list',
                isProcessing: false,
                dataSource: 'STORAGE',
                queryDateRangeText: `Từ ngày ${formatDateForDisplay(getState(currentType, 'storage').dateFrom, getState(currentType, 'storage').timeFrom)} đến ngày ${formatDateForDisplay(getState(currentType, 'storage').dateTo, getState(currentType, 'storage').timeTo)}`,
                selectedRecordIds: [],
                hasAutoFilledData: false // No need to show save button since already saved
              }, 'storage');

              const autoFillMsg = [];
              if (updateGvCount > 0) autoFillMsg.push(`${updateGvCount} giúp việc`);
              if (updateMachineCount > 0) autoFillMsg.push(`${updateMachineCount} mã máy`);

              addToast(`Đã tải ${persistedRecords.length} bản ghi. Tự động điền và lưu ${autoFillMsg.join(' và ')} từ BC hàng ngày.`, 'success');
              return; // Exit early since we already updated state
            }

          } catch (error) {
            console.error('Error auto-filling from daily data:', error);
            // Continue with normal flow if auto-fill fails
          }
        }


        updateReportState(currentType, {
          result: res,
          stats: res.stats,
          activeTable: 'list',
          isProcessing: false,
          dataSource: 'STORAGE',
          queryDateRangeText: `Từ ngày ${formatDateForDisplay(getState(currentType, 'storage').dateFrom, getState(currentType, 'storage').timeFrom)} đến ngày ${formatDateForDisplay(getState(currentType, 'storage').dateTo, getState(currentType, 'storage').timeTo)}`,
          selectedRecordIds: []
        }, 'storage');

        let loadSuccessMsg = `Đã tải ${persistedRecords.length} bản ghi thành công.`;
        if (syncedPriceCount > 0) {
          loadSuccessMsg += ` Tự động lấy giá (Mã tương đương, Đơn giá, Thành tiền) cho ${syncedPriceCount} ca từ Báo cáo tháng.`;
        }
        addToast(loadSuccessMsg, 'success');
      } else {
        addToast(res.message, 'error');
      }

    } catch (error) {
      console.error("Error getting report:", error);
      addToast('Có lỗi xảy ra khi lấy dữ liệu.', 'error');
    }
  };

  // --- Core Save Logic (used by all save triggers: Print, Download, Lưu) ---
  const executeSave = async (): Promise<boolean> => {
    if (!currentReport.result || !currentReport.result.validRecords) {
      addToast("Không có dữ liệu hợp lệ để lưu.", "error");
      return false;
    }

    setIsSaving(true);
    try {
      const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
      const userId = "anonymous_user";

      const { savedCount, skippedCount, updatedCount } = await reportService.saveReport(
        currentReport.result.validRecords,
        type,
        userId,
        currentReport.dataSource || 'EXCEL'
      );

      // Tự động lưu luôn thông tin Lịch trực vào Firestore khi lưu báo cáo
      if (dutySchedules && Object.keys(dutySchedules).length > 0) {
        try {
          await dutyScheduleService.batchSaveDutySchedules(dutySchedules);
        } catch (err) {
          console.warn('[handleSaveReport] Could not batch save duty schedules:', err);
        }
      }

      // Build appropriate message based on results
      let msg = '';
      if (savedCount > 0 && updatedCount > 0) {
        msg = `Lưu dữ liệu thành công! Đã lưu ${savedCount} bản ghi, cập nhật ${updatedCount} bản ghi.`;
      } else if (savedCount > 0) {
        msg = `Lưu dữ liệu thành công! Đã lưu ${savedCount} bản ghi.`;
      } else if (updatedCount > 0) {
        msg = `Cập nhật thành công! Đã cập nhật ${updatedCount} bản ghi giúp việc.`;
      } else {
        msg = `Tất cả bản ghi đã tồn tại hoặc không có giúp việc. Không có gì để lưu.`;
      }

      if (skippedCount > 0 && (savedCount > 0 || updatedCount > 0)) {
        msg += ` Bỏ qua ${skippedCount} bản ghi trùng lặp.`;
      }

      if (savedCount === 0 && updatedCount === 0) {
        addToast(msg, 'error');
      } else {
        addToast(msg, 'success');
        // NẾU TỪ EXCEL LƯU THÀNH CÔNG, reload lại từ STORAGE để đảm bảo mọi record đều có ID và firestorePath chuẩn
        if (currentReport.dataSource === 'EXCEL') {
          const dateFrom = currentReport.filters?.dateFrom;
          const dateTo = currentReport.filters?.dateTo;
          if (dateFrom && dateTo) {
             addToast("Đang đồng bộ dữ liệu vào hệ thống lưu trữ...", "success");
             reportService.getReports(dateFrom, dateTo, type).then(records => {
                if (records.length > 0) {
                  const convertedRecs: SurgeryRecord[] = records.map(r => ({
                    ...r,
                    stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
                    start: r.ngayBD ? new Date(r.ngayBD) : null,
                    end: r.ngayKT ? new Date(r.ngayKT) : null,
                  }));
                  const processed = recalculateResultFromRecords(convertedRecs, config) as ProcessingResult;
                  updateCurrentReport({
                    dataSource: 'STORAGE',
                    result: processed,
                    selectedRecordIds: [],
                  });
                }
             }).catch(err => {
                console.error("Auto reload from storage failed:", err);
             });
          }
        }
      }
      return true;

    } catch (error) {
      console.error(error);
      addToast("Lỗi khi lưu dữ liệu. Vui lòng thử lại.", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Silent auto-save for Print/Download actions.
   * Saves only NEW records, skips duplicates silently (no confirmation dialog).
   * reportService.saveReport() already handles dedup internally.
   * @param afterSave Optional callback to run after save completes (e.g., print, download)
   */
  const ensureDataSaved = async (afterSave?: () => void): Promise<void> => {
    // Only auto-save data from EXCEL source
    if (currentReport.dataSource !== 'EXCEL' || !currentReport.result?.validRecords) {
      afterSave?.();
      return;
    }

    try {
      await executeSave();
      afterSave?.();
    } catch (error) {
      console.error('Error in ensureDataSaved:', error);
      afterSave?.();
    }
  };

  /**
   * Explicit save handler for the Lưu button.
   * Checks for duplicates first — if found, shows confirmation dialog.
   */
  const handleSaveData = async () => {
    if (currentReport.dataSource !== 'EXCEL' || !currentReport.result?.validRecords) {
      // STORAGE data or no data — save directly (for auto-filled GV updates etc.)
      await executeSave();
      return;
    }

    const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
    const records = currentReport.result.validRecords;

    try {
      const { newCount, duplicateCount, updatableCount } = await reportService.checkDuplicates(records, type);

      if (duplicateCount === 0) {
        // No duplicates — save directly
        await executeSave();
      } else {
        // Duplicates found — show confirm dialog
        const totalRecords = records.length;
        let message = `Trong ${totalRecords} bản ghi từ file Excel:\n`;
        if (newCount > 0) message += `• ${newCount} bản ghi mới sẽ được lưu\n`;
        if (updatableCount > 0) message += `• ${updatableCount} bản ghi sẽ được cập nhật giúp việc\n`;
        message += `• ${duplicateCount} bản ghi đã tồn tại trong hệ thống\n\n`;
        message += `Bạn có muốn tiếp tục lưu dữ liệu không? (Các bản ghi trùng lặp sẽ được bỏ qua)`;

        setSaveConfirm({
          show: true,
          message,
          onConfirm: async () => {
            setSaveConfirm({ show: false, message: '', onConfirm: null });
            await executeSave();
          }
        });
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
      await executeSave();
    }
  };

  const handleTimeChange = (val: string, setter: (v: string) => void) => {
    // 1. Remove non-digits and limit length
    let clean = val.replace(/[^0-9]/g, '');
    if (clean.length > 4) clean = clean.substring(0, 4);

    // 2. Extract parts
    let hh = clean.substring(0, 2);
    let mm = clean.substring(2, 4);

    // 3. Validate Hours (00-23)
    if (hh.length === 2 && parseInt(hh, 10) > 23) {
      hh = '23';
    }

    // 4. Validate Minutes (00-59)
    if (mm.length === 2 && parseInt(mm, 10) > 59) {
      mm = '59';
    }

    // 5. Format Output
    let formatted = hh;
    if (clean.length >= 3) {
      formatted = `${hh}:${mm}`;
    }

    setter(formatted);
  };


  // --- Command Palette ---
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const commandItems: CommandItem[] = useMemo(() => [
    { id: 'nav-daily', label: 'Báo cáo hàng ngày', description: 'Chuyển sang tab báo cáo ngày', icon: <Calendar className="h-4 w-4" />, category: 'navigation', keywords: ['daily', 'ngày'], action: () => setActiveTab('daily') },
    { id: 'nav-monthly', label: 'Báo cáo tháng', description: 'Chuyển sang tab báo cáo tháng', icon: <Calendar className="h-4 w-4" />, category: 'navigation', keywords: ['monthly', 'tháng'], action: () => setActiveTab('monthly') },
    { id: 'nav-config', label: 'Cấu hình', description: 'Đi đến trang cài đặt', icon: <Settings className="h-4 w-4" />, category: 'navigation', keywords: ['settings', 'config'], action: () => setActiveTab('config') },
    { id: 'nav-stats', label: 'Thống kê', description: 'Xem thống kê phẩu thuật', icon: <BarChart3 className="h-4 w-4" />, category: 'navigation', keywords: ['statistics', 'chart'], action: () => setActiveTab('statistics') },
    { id: 'act-search', label: 'Tìm kiếm', description: 'Focus vào ô tìm kiếm', icon: <Search className="h-4 w-4" />, category: 'actions', keywords: ['search', 'find'], action: () => { const el = document.querySelector('input[placeholder*="tìm"]') as HTMLInputElement; el?.focus(); } },
    { id: 'act-export', label: 'Xuất Excel', description: 'Tải xuống file Excel', icon: <Download className="h-4 w-4" />, category: 'actions', keywords: ['export', 'download', 'excel'], action: () => { /* trigger export from toolbar */ } },
    { id: 'set-density-compact', label: 'Mật độ: Chặt', description: 'Hiển thị bảng nhỏ gọn', icon: <Minimize2 className="h-4 w-4" />, category: 'settings', keywords: ['compact', 'density'], action: () => localStorage.setItem('table_density', 'compact') },
    { id: 'set-density-default', label: 'Mật độ: Mặc định', description: 'Hiển thị bảng mặc định', icon: <Rows3 className="h-4 w-4" />, category: 'settings', keywords: ['default', 'density'], action: () => localStorage.setItem('table_density', 'default') },
    { id: 'set-density-relaxed', label: 'Mật độ: Rộng', description: 'Hiển thị bảng thoải mái', icon: <Maximize2 className="h-4 w-4" />, category: 'settings', keywords: ['relaxed', 'density'], action: () => localStorage.setItem('table_density', 'relaxed') },
  ], []);

  return (
    <div className="h-screen bg-gray-50 text-gray-900 font-inter flex overflow-hidden">
      <PrintPreview
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        orientation={printOrientation}
        hospitalName={config.hospitalName}
        {...printConfig}
      />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <CommandPalette commands={commandItems} isOpen={cmdPaletteOpen} onClose={() => setCmdPaletteOpen(false)} />

      {/* Delete Confirm Modal */}
      <ConfirmDialog
        isOpen={deleteConfirm.show}
        title="Xác nhận xóa dữ liệu"
        message={deleteConfirm.message}
        confirmLabel="Xác nhận xóa"
        cancelLabel="Hủy bỏ"
        variant="danger"
        onConfirm={() => deleteConfirm.onConfirm?.()}
        onCancel={() => setDeleteConfirm({ show: false, message: '', onConfirm: null })}
      />

      {/* Save Confirm Modal (for duplicate detection) */}
      <ConfirmDialog
        isOpen={saveConfirm.show}
        title="Xác nhận lưu dữ liệu"
        message={saveConfirm.message}
        confirmLabel="Tiếp tục lưu"
        cancelLabel="Hủy bỏ"
        variant="info"
        onConfirm={() => saveConfirm.onConfirm?.()}
        onCancel={() => setSaveConfirm({ show: false, message: '', onConfirm: null })}
      />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
        userName={auth.currentUser?.email?.split('@')[0]}
        syncStatus={isSaving ? 'processing' : currentReport.isProcessing ? 'processing' : currentReport.result && currentReport.hasAutoFilledData ? 'unsaved' : 'synced'}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto animate-fade-in">
        {(activeTab === 'daily' || activeTab === 'monthly') && (
          <div className="flex flex-col animate-fade-in relative w-full h-full">

            {/* ── Firebase-style Page Header: title + data source tabs ── */}
            <ContextToolbar
              title={activeTab === 'daily' ? 'Báo cáo hàng ngày' : 'Báo cáo tháng'}
            >
              <TabLine
                value={activeDataTab}
                onChange={(v) => setActiveDataTab(v as DataTabType)}
                options={
                  activeTab === 'monthly'
                    ? [
                        { value: 'storage', label: 'Lưu trữ' },
                        { value: 'upload', label: 'Minh Lộ' },
                        { value: 'price_service', label: 'Thống kê giá DVKT' },
                      ]
                    : [
                        { value: 'storage', label: 'Lưu trữ' },
                        { value: 'upload', label: 'Minh Lộ' },
                      ]
                }
              />
            </ContextToolbar>

            {/* ── Data Source Containers (all mounted, CSS display toggle) ── */}
            {/* STORAGE container */}
            <div style={{ display: activeDataTab === 'storage' ? 'block' : 'none' }}>
              <StorageQueryBar
                currentType={currentType}
                monthlyTimeMode={monthlyTimeMode}
                onMonthlyTimeModeChange={handleMonthlyTimeModeChange}
                selectedMonthlyYear={selectedMonthlyYear}
                onMonthlyYearChange={handleMonthlyYearChange}
                availableMonthlyYears={availableMonthlyYears}
                selectedMonthlyMonth={selectedMonthlyMonth}
                onMonthlyMonthChange={handleMonthlyMonthChange}
                availableMonthlyMonthsMap={availableMonthlyMonthsMap}
                dateFrom={getState(currentType, 'storage').dateFrom}
                onDateFromChange={(val) => updateReportState(currentType, { dateFrom: val }, 'storage')}
                dateTo={getState(currentType, 'storage').dateTo}
                onDateToChange={(val) => updateReportState(currentType, { dateTo: val }, 'storage')}
                timeFrom={getState(currentType, 'storage').timeFrom}
                onTimeFromChange={(val) => updateReportState(currentType, { timeFrom: val }, 'storage')}
                timeTo={getState(currentType, 'storage').timeTo}
                onTimeToChange={(val) => updateReportState(currentType, { timeTo: val }, 'storage')}
                onGetReport={handleGetReport}
                onAutoFill24hShift={handleAutoFill24hShift}
                handleTimeChange={handleTimeChange}
              />
            </div>

            {/* UPLOAD (Minh Lộ) container */}
            <div style={{ display: activeDataTab === 'upload' ? 'block' : 'none' }}>
              <UploadFileBar
                listFile={getState(currentType, 'upload').listFile}
                isProcessing={getState(currentType, 'upload').isProcessing}
                onFileSelect={handleListFileSelect}
                onProcess={() => handleProcess(currentType)}
                onReset={() => handleResetUpload(currentType)}
              />
            </div>

            {/* PRICE SERVICE (Thống kê giá DVKT) container */}
            {activeTab === 'monthly' && (
              <div style={{ display: activeDataTab === 'price_service' ? 'block' : 'none' }}>
                <ServicePriceTab
                  surgeryNamePrices={namePrices}
                  currentLoadedRecords={monthlyStorageState.result?.validRecords || monthlyUploadState.result?.validRecords || []}
                  onPricesApplied={(updatedRecords) => {
                    if (monthlyStorageState.result) {
                      const freshResult = reprocessSurgicalRecords(
                        updatedRecords,
                        config,
                        monthlyStorageState.result.dateRangeText || ''
                      );
                      setMonthlyStorageState(prev => ({
                        ...prev,
                        result: freshResult,
                        stats: freshResult.stats,
                        hasAutoFilledData: true
                      }));
                    }
                    if (monthlyUploadState.result) {
                      const freshResult = reprocessSurgicalRecords(
                        updatedRecords,
                        config,
                        monthlyUploadState.result.dateRangeText || ''
                      );
                      setMonthlyUploadState(prev => ({
                        ...prev,
                        result: freshResult,
                        stats: freshResult.stats,
                        hasAutoFilledData: true
                      }));
                    }
                  }}
                  addToast={addToast}
                  cachedServiceGroups={cachedServiceGroups}
                  onCacheServiceGroups={setCachedServiceGroups}
                />
              </div>
            )}

            {/* Empty State — shown before any data is loaded */}
            {activeDataTab !== 'price_service' && !currentReport.result && !currentReport.isProcessing && (
              <EmptyState
                icon={Database}
                title="Chưa có dữ liệu"
                description={activeDataTab === 'storage'
                  ? 'Chọn khoảng thời gian và nhấn "Lấy dữ liệu" để truy vấn từ hệ thống lưu trữ.'
                  : 'Tải lên file Excel từ Minh Lộ để bắt đầu xử lý dữ liệu.'
                }
              />
            )}

            {/* Skeleton Loading — shown while data is being fetched */}
            {activeDataTab !== 'price_service' && currentReport.isProcessing && !currentReport.result && (
              <WorkspaceSkeleton />
            )}

            {activeDataTab !== 'price_service' && currentReport.stats && currentReport.result && (
              <>
                {/* ── Monthly Price Coverage Banner ── */}
                {currentType === 'monthly' && (() => {
                  const records = currentReport.result?.validRecords || [];
                  const total = records.length;
                  if (total === 0) return null;
                  const priced = records.filter(r => (r.donGia && r.donGia > 0) || (r.thanhTien && r.thanhTien > 0)).length;
                  let rangeText = currentReport.result?.dateRangeText || '';
                  if (!rangeText) {
                    const dates = records
                      .map(r => (r.start instanceof Date && !isNaN(r.start.getTime())) ? r.start.getTime() : (r.ngayBD ? new Date(r.ngayBD).getTime() : 0))
                      .filter(t => t > 0)
                      .sort((a, b) => a - b);
                    if (dates.length > 0) {
                      const minD = new Date(dates[0]);
                      const maxD = new Date(dates[dates.length - 1]);
                      const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                      rangeText = `Từ ngày ${fmt(minD)} đến ngày ${fmt(maxD)}`;
                    }
                  }

                  if (priced < total) {
                    return (
                      <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-3 text-amber-900 shadow-sm animate-fade-in">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              Có {priced}/{total} trường hợp có giá áp dụng.
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                              Hãy bổ sung import thêm báo cáo Thống kê giá DVKT trong khoảng thời gian {rangeText ? `(${rangeText}) ` : ''}để áp đầy đủ giá.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveDataTab('price_service')}
                          className="shrink-0 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          Nhập giá DVKT
                        </button>
                      </div>
                    );
                  }

                  if (!showMonthlyFullPriceNotice) return null;

                  return (
                    <div className="mx-4 mt-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2 text-emerald-900 shadow-xs animate-fade-in transition-all">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="text-xs font-medium">
                          Đã có {priced}/{total} trường hợp có giá áp dụng (Đầy đủ 100%).
                        </span>
                      </div>
                      <button
                        onClick={() => setShowMonthlyFullPriceNotice(false)}
                        className="text-emerald-700 hover:text-emerald-900 p-0.5 rounded cursor-pointer transition-colors"
                        title="Đóng thông báo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}

                {/* ── Date range + Action Buttons Row ── */}
                <ReportActionBar
                  dateRangeText={
                    (currentReport.dataSource === 'STORAGE' && currentReport.queryDateRangeText)
                      ? currentReport.queryDateRangeText
                      : currentReport.result?.dateRangeText || ''
                  }
                  activeTable={currentReport.activeTable}
                  onPrint={(type, orientation) => handlePrintClick(type, orientation)}
                  onOvertimePrint={() => overtimePrintHandlerRef.current?.()}
                  onDownloadExcel={handleDownload}
                  onDownloadFormattedExcel={handleDownloadFormatted}
                  onSaveData={handleSaveData}
                  isSaving={isSaving}
                  canSave={!isSaving && !(currentReport.dataSource === 'STORAGE' && !currentReport.hasAutoFilledData)}
                  saveTooltip={
                    currentReport.dataSource === 'STORAGE' && !currentReport.hasAutoFilledData
                      ? 'Chức năng này chỉ khả dụng khi có dữ liệu mới hoặc cập nhật'
                      : 'Lưu dữ liệu vào hệ thống'
                  }
                />

                {/* ── Stat Cards (HospitalStat-VT style) ── */}
                <HospitalStatCards stats={derivedStats} />

                  {/* ── Internal Sub-Tabs (TabLine + persistent containers) ── */}
                  <div className="flex flex-col mt-1.5">
                    <div className="border-t border-blue-200/80 border-b-2 border-blue-300 bg-blue-50/75 px-4 min-h-[44px] flex items-center overflow-x-auto overflow-y-hidden">
                      <TabLine
                        value={currentReport.activeTable || 'list'}
                        onChange={(v) => setActiveTable(v as any)}
                        size="sm"
                        options={[
                          { value: 'list', label: 'DS Phẫu thuật', icon: ListChecks, badge: ptCount > 0 || ttCount > 0 ? `${ptCount} PT${ttCount > 0 ? ` ${ttCount} TT` : ''}` : '0' },
                          { value: 'staff', label: 'Trùng NV', icon: Users, badge: currentReport.stats?.staffConflicts ?? 0, badgeColor: (currentReport.stats?.staffConflicts ?? 0) > 0 ? 'bg-red-100 text-red-700' : undefined },
                          { value: 'machine', label: 'Trùng máy', icon: Cpu, badge: currentReport.stats?.machineConflicts ?? 0, badgeColor: (currentReport.stats?.machineConflicts ?? 0) > 0 ? 'bg-amber-100 text-amber-700' : undefined },
                          { value: 'missing', label: 'Thiếu máy', icon: AlertTriangle, badge: currentReport.stats?.missingMachines ?? 0, badgeColor: (currentReport.stats?.missingMachines ?? 0) > 0 ? 'bg-orange-100 text-orange-700' : undefined },
                          { value: 'payment', label: 'Thanh toán', icon: DollarSign, badge: currentReport.result?.paymentData?.rows?.length || 0, badgeColor: 'bg-emerald-100 text-emerald-700' },
                          { value: 'duty', label: 'Lịch trực', icon: CalendarDays, badge: currentReportDutyDateCount || 0 },
                          { value: 'overtime', label: 'Ngoài giờ', icon: Clock, badge: currentReportOvertimeCount || 0, badgeColor: currentReportOvertimeCount > 0 ? 'bg-amber-100 text-amber-800' : undefined },
                        ]}
                      />
                    </div>

                    {/* All table containers always mounted, toggled via CSS */}
                    <div className="w-full bg-white px-4 py-1.5 flex-1 min-h-0" key={currentReport.activeTable}>
                      {(currentReport.listFile || currentReport.dataSource === 'STORAGE') && renderTableContent()}
                    </div>
                  </div>
              </>
            )}
          </div>
        )}

        {hasVisitedStats && (
          <div style={{ display: activeTab === 'statistics' ? 'block' : 'none' }} className="w-full h-full flex-1">
            <ErrorBoundary fallbackTitle="Không thể tải tab Thống kê">
              <StatisticsTab />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'config' && (
          <ErrorBoundary fallbackTitle="Không thể tải trang Cấu hình">
            <ConfigurationTab onConfigUpdate={() => {
              if (dailyUploadState.listFile) handleProcess('daily');
              if (monthlyUploadState.listFile) handleProcess('monthly');
            }} />
          </ErrorBoundary>
        )}


        {editingRecord && (
          <SurgeryEditModal
            isOpen={true}
            record={editingRecord}
            onClose={() => setEditingRecord(null)}
            onSave={handleSaveEditedRecord}
            staffList={config.staffList || []}
            machineRegistry={config.machineRegistry || []}
            surgeryNamePrices={namePrices || []}
          />
        )}
      </main>
    </div>
  );
}

const App: React.FC = () => (
  <ConfigProvider>
    <InnerApp />
  </ConfigProvider>
);

export default App;