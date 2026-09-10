import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { reprocessSurgicalRecords, recalculateResultFromRecords } from "./services/reprocess";
import { ConfigurationTab } from './components/ConfigurationTab';
import { PrintPreview } from './components/PrintPreview';
import { ConfigProvider, useConfig, DEFAULT_CONFIG } from './contexts/ConfigContext';
import { StatisticsTab } from './components/statistics/StatisticsTab';
import { ServicePriceTab } from './components/ServicePriceTab';
import { subscribeToSurgeryNamePrices } from './services/surgeryNamePriceService';
// AI analysis removed — geminiService import no longer needed
import { ProcessingResult, ProcessedStats, SurgeryRecord, StaffConflict, MachineConflict, PersistedSurgeryRecord, StaffMember, PatientServicePriceGroup, SurgeryNamePrice, DutyScheduleDateConfig, OvertimeRecordRow } from './types';
import { FileUpload } from './components/FileUpload';
import { SurgeryEditModal } from './components/surgery/SurgeryEditModal';
import { Sidebar, type TabKey, ContextToolbar, SegmentedControl, TabLine, KPIBar, CollapsiblePanel, EmptyState, WorkspaceSkeleton, CommandPalette, type CommandItem, ErrorBoundary } from './components/ui';
import { PageCombobox } from './components/common/PageCombobox';
import { dutyScheduleService } from './services/dutyScheduleService';
import { useDutyScheduleState } from './hooks/useDutyScheduleState';
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

import { ColumnDef } from './components/common/DynamicTable';
import { ToastContainer, ToastItem, ToastType } from './components/common/ToastContainer';
import { formatDate, parseDateString } from './utils/dateUtils';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { buildPrintConfig } from './components/surgery/printConfigBuilder';
import { ReportActionBar } from './components/surgery/ReportActionBar';
import { HospitalStatCards } from './components/surgery/HospitalStatCards';
import { StorageQueryBar } from './components/surgery/StorageQueryBar';
import { UploadFileBar } from './components/surgery/UploadFileBar';
import { SurgeryTableViewRouter } from './components/surgery/SurgeryTableViewRouter';
import { ReportState, DataTabType } from './types/reportState';
import { useReportStateManager } from './hooks/useReportStateManager';
import { useReportTableSettings } from './hooks/useReportTableSettings';
import { useSurgeryTableData } from './hooks/useSurgeryTableData';
import { useReportPersistence } from './hooks/useReportPersistence';
import { usePrintController } from './hooks/usePrintController';
import { useExcelProcessing } from './hooks/useExcelProcessing';

const InnerApp: React.FC = () => {
  const { config, updateConfig } = useConfig();

  const [activeTab, setActiveTab] = useState<TabKey>('daily');
  const [hasVisitedStats, setHasVisitedStats] = useState(false);

  useEffect(() => {
    if (activeTab === 'statistics') {
      setHasVisitedStats(true);
    }
  }, [activeTab]);


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

  const {
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
  } = useReportStateManager({ activeTab });


  // ── Lịch trực & Ngoài giờ (Shared State across Daily & Monthly) ──
  const {
    dutySchedules,
    isSavingDutySchedule,
    handleUpdateDutySchedule,
    currentReportDutyDateCount,
    currentReportOvertimeCount,
  } = useDutyScheduleState({
    validRecords: currentReport.result?.validRecords,
    config,
  });




  const {
    rowsPerPage,
    dateFormat,
    visibleCols,
    searchableCols,
    updateRowsPerPage,
    updateDateFormat,
    updateVisibleCols,
    updateSearchableCols,
  } = useReportTableSettings({ config, updateConfig, currentType });

  const { toasts, addToast, removeToast } = useToast();

  const {
    editingRecord,
    setEditingRecord,
    ptCount,
    ttCount,
    derivedStats,
    paymentDataPrepared,
    columnsList,
    columnsMissing,
    columnsStaff,
    columnsMachine,
    listSearchableCols,
    emptyFilterCol,
    setEmptyFilterCol,
    showEmptyFilterMenu,
    setShowEmptyFilterMenu,
    filteredList,
    filteredStaff,
    filteredMachine,
    filteredMissing,
    listPage,
    setListPage,
    handleRowSelect,
    handleSelectAll,
    handleOpenEditModal,
    handleRowDoubleClick,
    handleSaveEditedRecord,
    handleSaveAssistant,
    updateSearchTerm,
    setActiveTable,
    getPaymentColumns,
  } = useSurgeryTableData({
    config,
    dateFormat,
    rowsPerPage,
    visibleCols,
    searchableCols,
    currentReport,
    updateCurrentReport,
    currentType,
    addToast,
  });

  const {
    isSaving,
    deleteConfirm,
    setDeleteConfirm,
    saveConfirm,
    setSaveConfirm,
    handleDeleteSelected,
    ensureDataSaved,
    handleSaveData,
    handleDownload,
    handleDownloadFormatted,
  } = useReportPersistence({
    currentReport,
    updateCurrentReport,
    activeTab,
    currentType,
    config,
    dutySchedules,
    columnsList,
    visibleCols,
    paymentDataPrepared,
    addToast,
  });

  const {
    isPrintOpen,
    setIsPrintOpen,
    printConfig,
    overtimePrintHandlerRef,
    printOrientation,
    handlePrintClick,
  } = usePrintController({
    activeTab,
    currentReport,
    columnsList,
    visibleCols,
    derivedStats,
    ptCount,
    ttCount,
    paymentDataPrepared,
    getPaymentColumns,
    config,
    ensureDataSaved,
    addToast,
  });

  // Excel Processing Controller
  const {
    checkFile,
    handleListFileSelect,
    handleResetUpload,
    handleProcess,
  } = useExcelProcessing({
    config,
    updateConfig,
    currentType,
    getState,
    updateReportState,
    cachedServiceGroups,
    namePrices,
    dailyUploadState,
    monthlyUploadState,
    addToast,
  });


  const formatDateForDisplay = (dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y} ${timeStr}`;
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
                      {(currentReport.listFile || currentReport.dataSource === 'STORAGE') && (
                        <SurgeryTableViewRouter
                          currentReport={currentReport}
                          config={config}
                          dateFormat={dateFormat}
                          onDateFormatChange={updateDateFormat}
                          rowsPerPage={rowsPerPage}
                          onRowsPerPageChange={updateRowsPerPage}
                          visibleCols={visibleCols}
                          onVisibleColsChange={updateVisibleCols}
                          onSearchChange={updateSearchTerm}
                          listSearchableCols={listSearchableCols}
                          onSearchableColsChange={updateSearchableCols}
                          columnsList={columnsList}
                          columnsStaff={columnsStaff}
                          columnsMachine={columnsMachine}
                          columnsMissing={columnsMissing}
                          filteredList={filteredList}
                          filteredStaff={filteredStaff}
                          filteredMachine={filteredMachine}
                          filteredMissing={filteredMissing}
                          paymentDataPrepared={paymentDataPrepared}
                          listPage={listPage}
                          onListPageChange={setListPage}
                          emptyFilterCol={emptyFilterCol}
                          onEmptyFilterColChange={setEmptyFilterCol}
                          showEmptyFilterMenu={showEmptyFilterMenu}
                          onShowEmptyFilterMenuChange={setShowEmptyFilterMenu}
                          onRowSelect={handleRowSelect}
                          onSelectAll={handleSelectAll}
                          onDeleteSelected={handleDeleteSelected}
                          onOpenEditModal={handleOpenEditModal}
                          onRowDoubleClick={handleRowDoubleClick}
                          onSaveAssistant={handleSaveAssistant}
                          dutySchedules={dutySchedules}
                          onUpdateDutySchedule={handleUpdateDutySchedule}
                          isSavingDutySchedule={isSavingDutySchedule}
                          onNavigateToDutyTab={() => setActiveTable('duty')}
                          onRegisterPrintHandler={(handler) => {
                            overtimePrintHandlerRef.current = handler;
                          }}
                          onTriggerPrint={(pConfig) => {
                            setPrintOrientation(pConfig.orientation || 'portrait');
                            setPrintConfig(pConfig);
                            setIsPrintOpen(true);
                          }}
                        />
                      )}
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