import React, { useState, useEffect, useMemo } from 'react';
import { reprocessSurgicalRecords } from './services/reprocess';
import { ConfigurationTab } from './components/ConfigurationTab';
import { PrintPreview } from './components/PrintPreview';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { StatisticsTab } from './components/statistics/StatisticsTab';
import { ServicePriceTab } from './components/ServicePriceTab';
import { subscribeToSurgeryNamePrices } from './services/surgeryNamePriceService';
import { PatientServicePriceGroup, SurgeryNamePrice } from './types';
import { SurgeryEditModal } from './components/surgery/SurgeryEditModal';
import {
  Sidebar,
  type TabKey,
  ContextToolbar,
  TabLine,
  EmptyState,
  WorkspaceSkeleton,
  CommandPalette,
  ErrorBoundary,
} from './components/ui';
import {
  Database,
  AlertTriangle,
  ListChecks,
  Users,
  Cpu,
  DollarSign,
  CalendarDays,
  Clock,
} from 'lucide-react';
import { auth } from './lib/firebase';
import { ToastContainer } from './components/common/ToastContainer';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { ReportActionBar } from './components/surgery/ReportActionBar';
import { HospitalStatCards } from './components/surgery/HospitalStatCards';
import { StorageQueryBar } from './components/surgery/StorageQueryBar';
import { UploadFileBar } from './components/surgery/UploadFileBar';
import { SurgeryTableViewRouter } from './components/surgery/SurgeryTableViewRouter';
import { MonthlyPriceBanner } from './components/surgery/MonthlyPriceBanner';
import { DataTabType } from './types/reportState';
import { useReportStateManager } from './hooks/useReportStateManager';
import { useDutyScheduleState } from './hooks/useDutyScheduleState';
import { useReportTableSettings } from './hooks/useReportTableSettings';
import { useToast } from './hooks/useToast';
import { useSurgeryTableData } from './hooks/useSurgeryTableData';
import { useReportPersistence } from './hooks/useReportPersistence';
import { usePrintController } from './hooks/usePrintController';
import { useExcelProcessing } from './hooks/useExcelProcessing';
import { useStorageQuery } from './hooks/useStorageQuery';
import { useAppCommandPalette } from './hooks/useAppCommandPalette';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { AccountPanel } from './components/auth/AccountPanel';
import { ReportLockModal } from './components/surgery/ReportLockModal';
import { ReportLockBanner } from './components/surgery/ReportLockBanner';
import { AuditLogModal } from './components/audit/AuditLogModal';
import { ExcelStagingModal } from './components/excel/ExcelStagingModal';
import { buildStagingRecords } from './services/stagingValidationService';
import type { StagingRecord } from './types/staging';
import type { ReportLock } from './types/reportLock';
import type { UserRole } from './types/auth';
import type { AuditLogEntry } from './types/auditLog';
import {
  subscribeAllReportLocks,
  lockReport,
  unlockReport,
  generateLockKey,
  isPeriodLocked,
} from './services/reportLockService';
import { subscribeAuditLogs, logAuditEvent } from './services/auditLogService';
import { sendNotification } from './services/notificationService';

const InnerApp: React.FC = () => {
  const { config, updateConfig } = useConfig();

  const [activeTab, setActiveTab] = useState<TabKey>('daily');
  const [hasVisitedStats, setHasVisitedStats] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [configInitialSubTab, setConfigInitialSubTab] = useState<'norms' | 'dmkt' | 'staff' | 'users' | undefined>(undefined);

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

  // ── Khóa / Mở khóa báo cáo (Report Lock / Unlock) ──
  const { user, isAdmin, isHead, currentRole, can } = useAuth();
  const [allLocks, setAllLocks] = useState<Record<string, ReportLock>>({});
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockModalMode, setLockModalMode] = useState<'lock' | 'unlock'>('lock');

  useEffect(() => {
    const unsub = subscribeAllReportLocks((locks) => {
      setAllLocks(locks || {});
    });
    return () => unsub();
  }, []);

  const currentPeriodKey = useMemo(() => {
    if (currentType === 'monthly') {
      if (monthlyTimeMode === 'month') {
        return `${selectedMonthlyYear}-${String(selectedMonthlyMonth).padStart(2, '0')}`;
      }
      return `${currentReport.dateFrom || ''}_${currentReport.dateTo || ''}`;
    }
    return currentReport.dateFrom || new Date().toISOString().slice(0, 10);
  }, [currentType, monthlyTimeMode, selectedMonthlyYear, selectedMonthlyMonth, currentReport.dateFrom, currentReport.dateTo]);

  const currentPeriodLabel = useMemo(() => {
    if (currentType === 'monthly') {
      if (monthlyTimeMode === 'month') {
        return `Tháng ${String(selectedMonthlyMonth).padStart(2, '0')}/${selectedMonthlyYear}`;
      }
      return `${currentReport.dateFrom} - ${currentReport.dateTo}`;
    }
    if (currentReport.dateFrom) {
      const parts = currentReport.dateFrom.split('-');
      if (parts.length === 3) {
        return `Ngày ${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return `Ngày ${currentReport.dateFrom}`;
    }
    return 'Hôm nay';
  }, [currentType, monthlyTimeMode, selectedMonthlyYear, selectedMonthlyMonth, currentReport.dateFrom, currentReport.dateTo]);

  const activeLock = useMemo<ReportLock | null>(() => {
    // Chỉ áp dụng khóa sổ cho Báo cáo tháng (Báo cáo ngày không áp dụng khóa sổ)
    if (currentType !== 'monthly') return null;

    const globalKey = generateLockKey(currentType, currentPeriodKey, 'ALL');
    if (allLocks[globalKey]?.isLocked) {
      return allLocks[globalKey];
    }
    if (user?.department) {
      const deptKey = generateLockKey(currentType, currentPeriodKey, user.department);
      if (allLocks[deptKey]?.isLocked) {
        return allLocks[deptKey];
      }
    }
    if (isAdmin) {
      const cleanPeriod = currentPeriodKey.replace(/[^0-9-]/g, '').replace(/-/g, '_');
      const matchingKey = Object.keys(allLocks).find(
        (k) => k.startsWith(`${currentType}_${cleanPeriod}`) && allLocks[k]?.isLocked
      );
      if (matchingKey) return allLocks[matchingKey];
    }
    return null;
  }, [allLocks, currentType, currentPeriodKey, user?.department, isAdmin]);

  const isReportLocked = useMemo(() => {
    // Chỉ áp dụng khóa sổ cho Báo cáo tháng
    if (currentType !== 'monthly') return false;
    return isPeriodLocked(activeLock, currentRole, user?.department);
  }, [activeLock, currentRole, user?.department, currentType]);

  const canManageLock = useMemo(() => {
    // Chỉ áp dụng khóa sổ cho Báo cáo tháng
    if (currentType !== 'monthly') return false;
    if (isAdmin) return true;
    return can('lock_report') && !!user?.department;
  }, [isAdmin, can, user?.department, currentType]);

  const canUnlockCurrentReport = useMemo(() => {
    // Chỉ áp dụng khóa sổ cho Báo cáo tháng
    if (currentType !== 'monthly') return false;
    if (!activeLock || !activeLock.isLocked) return false;
    if (isAdmin) return true;
    return can('lock_report') && !!user?.department && activeLock.department === user.department;
  }, [activeLock, isAdmin, can, user?.department, currentType]);

  const canViewAuditLog = useMemo(() => {
    if (isAdmin) return true;
    return can('view_audit_log');
  }, [isAdmin, can]);

  // ── Truy vết chỉnh sửa (Audit Log) ──
  const [allAuditLogs, setAllAuditLogs] = useState<AuditLogEntry[]>([]);
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);

  // ── Đối soát & Chuẩn hóa dữ liệu Excel (Smart Staging Grid) ──
  const [showStagingModal, setShowStagingModal] = useState(false);
  const [stagingRecords, setStagingRecords] = useState<StagingRecord[]>([]);

  const currentStagingIssuesCount = useMemo(() => {
    const validRecords = currentReport.result?.validRecords;
    if (!validRecords || validRecords.length === 0) return 0;
    const staging = buildStagingRecords(validRecords, config);
    return staging.filter((r) => r._status === 'error' || r._status === 'warning').length;
  }, [currentReport.result?.validRecords, config]);

  const handleOpenStaging = () => {
    const validRecords = currentReport.result?.validRecords;
    if (!validRecords || validRecords.length === 0) {
      addToast('Chưa có dữ liệu ca mổ để đối soát!', 'info');
      return;
    }
    const staging = buildStagingRecords(validRecords, config);
    setStagingRecords(staging);
    setShowStagingModal(true);
  };

  const handleConfirmStaging = (cleanRecords: SurgeryRecord[]) => {
    const freshResult = reprocessSurgicalRecords(
      cleanRecords,
      config,
      currentReport.result?.dateRangeText || ''
    );
    updateCurrentReport({
      result: freshResult,
      stats: freshResult.stats,
      hasAutoFilledData: true,
    });
    addToast(`Đã đối soát và cập nhật ${cleanRecords.length} ca mổ thành công!`, 'success');
  };

  useEffect(() => {
    const unsub = subscribeAuditLogs((logs) => {
      setAllAuditLogs(logs || []);
    });
    return () => unsub();
  }, []);

  const handleConfirmLock = async (note: string, selectedDept?: string) => {
    const res = await lockReport({
      periodType: currentType,
      periodKey: currentPeriodKey,
      lockedBy: user?.name || user?.email || 'Quản trị viên',
      lockedByUid: user?.uid || 'unknown',
      lockedByRole: (currentRole as UserRole) || 'head',
      department: selectedDept || (isHead && !isAdmin ? user?.department : 'ALL'),
      note,
    });
    if (res.success) {
      addToast(`Đã khóa sổ báo cáo ${currentPeriodLabel} thành công!`, 'success');
      logAuditEvent({
        userId: user?.uid || 'unknown',
        userName: user?.name || user?.email || 'Quản trị viên',
        userRole: (currentRole as UserRole) || 'head',
        userDepartment: user?.department,
        action: 'REPORT_LOCK',
        targetType: 'report',
        targetId: res.lockKey,
        targetLabel: `Báo cáo ${currentPeriodLabel}`,
        periodKey: currentPeriodKey,
        department: selectedDept || (isHead && !isAdmin ? user?.department : 'ALL'),
        description: `Khóa sổ báo cáo ${currentPeriodLabel}${note ? ` với ghi chú: "${note}"` : ''}`,
      }).catch((e) => console.warn('[auditLog] Failed to log lock:', e));

      sendNotification({
        type: 'REPORT_LOCKED',
        title: `Báo cáo ${currentPeriodLabel} đã khóa sổ`,
        message: `${user?.name || user?.email || 'Trưởng khoa'} đã chốt số liệu và đưa báo cáo về chế độ Chỉ xem.${note ? ` Ghi chú: "${note}"` : ''}`,
        targetRole: 'all',
        department: selectedDept || (isHead && !isAdmin ? user?.department : 'ALL'),
        actionTab: currentType === 'monthly' ? 'monthly' : 'daily',
        createdBy: user?.name || user?.email,
      }).catch((e) => console.warn('[notification] Failed to send lock notif:', e));
    } else {
      addToast(`Không thể khóa sổ: ${res.error || 'Lỗi không xác định'}`, 'error');
    }
  };

  const handleConfirmUnlock = async () => {
    if (!activeLock) return;
    const res = await unlockReport({
      lockKey: activeLock.id,
      unlockedBy: user?.name || user?.email || 'Quản trị viên',
      unlockedByUid: user?.uid || 'unknown',
    });
    if (res.success) {
      addToast(`Đã mở khóa báo cáo ${currentPeriodLabel} thành công!`, 'success');
      logAuditEvent({
        userId: user?.uid || 'unknown',
        userName: user?.name || user?.email || 'Quản trị viên',
        userRole: (currentRole as UserRole) || 'head',
        userDepartment: user?.department,
        action: 'REPORT_UNLOCK',
        targetType: 'report',
        targetId: activeLock.id,
        targetLabel: `Báo cáo ${currentPeriodLabel}`,
        periodKey: currentPeriodKey,
        department: activeLock.department || 'ALL',
        description: `Mở khóa sổ báo cáo ${currentPeriodLabel}`,
      }).catch((e) => console.warn('[auditLog] Failed to log unlock:', e));

      sendNotification({
        type: 'REPORT_UNLOCKED',
        title: `Báo cáo ${currentPeriodLabel} đã mở khóa`,
        message: `${user?.name || user?.email || 'Trưởng khoa'} đã mở khóa báo cáo. Nhân viên hiện có thể chỉnh sửa số liệu.`,
        targetRole: 'all',
        department: activeLock.department || 'ALL',
        actionTab: currentType === 'monthly' ? 'monthly' : 'daily',
        createdBy: user?.name || user?.email,
      }).catch((e) => console.warn('[notification] Failed to send unlock notif:', e));
    } else {
      addToast(`Không thể mở khóa: ${res.error || 'Lỗi không xác định'}`, 'error');
    }
  };

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
    isReportLocked,
    currentUser: user,
    currentRole,
    currentPeriodKey,
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
    isReportLocked,
    currentUser: user,
    currentRole,
    currentPeriodKey,
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

  // Storage Query Controller
  const {
    handleAutoFill24hShift,
    handleGetReport,
    handleTimeChange,
  } = useStorageQuery({
    config,
    currentType,
    activeTab,
    getState,
    updateReportState,
    monthlyTimeMode,
    selectedMonthlyYear,
    selectedMonthlyMonth,
    addToast,
  });


  // Command Palette
  const { cmdPaletteOpen, setCmdPaletteOpen, commandItems } = useAppCommandPalette({
    setActiveTab,
  });

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
        onLoginClick={() => setShowLoginModal(true)}
        onAccountClick={() => setShowAccountPanel(true)}
      />

      {/* Login/Register Modal */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

      {/* Account Panel Modal */}
      <AccountPanel
        isOpen={showAccountPanel}
        onClose={() => setShowAccountPanel(false)}
        onNavigateToUserManagement={() => {
          setShowAccountPanel(false);
          setConfigInitialSubTab('users');
          setActiveTab('config');
        }}
      />

      {/* Report Lock / Unlock Modal */}
      <ReportLockModal
        isOpen={showLockModal}
        mode={lockModalMode}
        periodLabel={currentPeriodLabel}
        department={user?.department}
        departments={config.departments || []}
        isAdmin={isAdmin}
        isHead={isHead}
        currentUserRole={(currentRole as UserRole) || 'staff'}
        currentUserName={user?.name || user?.email || 'Người dùng'}
        onClose={() => setShowLockModal(false)}
        onConfirmLock={handleConfirmLock}
        onConfirmUnlock={handleConfirmUnlock}
      />

      {/* Audit Log (Nhật ký truy vết) Modal */}
      <AuditLogModal
        isOpen={showAuditLogModal}
        onClose={() => setShowAuditLogModal(false)}
        logs={allAuditLogs}
        currentPeriodLabel={currentPeriodLabel}
        department={user?.department}
        departments={config.departments || []}
        isAdmin={isAdmin}
      />

      {/* Smart Staging & Validation Modal */}
      <ExcelStagingModal
        isOpen={showStagingModal}
        onClose={() => setShowStagingModal(false)}
        fileName={currentReport.result?.dateRangeText || (currentType === 'monthly' ? 'Báo cáo tháng' : 'Báo cáo ngày')}
        initialRecords={stagingRecords}
        config={config}
        onConfirmImport={handleConfirmStaging}
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
                {currentType === 'monthly' && (
                  <MonthlyPriceBanner
                    currentReport={currentReport}
                    showFullPriceNotice={showMonthlyFullPriceNotice}
                    onCloseFullPriceNotice={() => setShowMonthlyFullPriceNotice(false)}
                    onOpenPriceServiceTab={() => setActiveDataTab('price_service')}
                  />
                )}

                {/* ── Report Lock Banner (chỉ hiển thị cho Báo cáo tháng khi kỳ báo cáo đã khóa sổ) ── */}
                {currentType === 'monthly' && activeLock?.isLocked && (
                  <ReportLockBanner
                    lock={activeLock}
                    periodLabel={currentPeriodLabel}
                    canUnlock={canUnlockCurrentReport}
                    onUnlockClick={() => {
                      setLockModalMode('unlock');
                      setShowLockModal(true);
                    }}
                  />
                )}

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
                  isReportLocked={isReportLocked}
                  canManageLock={canManageLock}
                  onLockClick={() => {
                    setLockModalMode('lock');
                    setShowLockModal(true);
                  }}
                  onUnlockClick={() => {
                    setLockModalMode('unlock');
                    setShowLockModal(true);
                  }}
                  onOpenAuditLog={canViewAuditLog ? () => setShowAuditLogModal(true) : undefined}
                  auditLogCount={allAuditLogs.length}
                  onOpenStaging={currentReport.result?.validRecords?.length ? handleOpenStaging : undefined}
                  stagingIssueCount={currentStagingIssuesCount}
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
            <ConfigurationTab
              initialSubTab={configInitialSubTab}
              onConfigUpdate={() => {
                if (dailyUploadState.listFile) handleProcess('daily');
                if (monthlyUploadState.listFile) handleProcess('monthly');
              }}
            />
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
            isReadOnly={isReportLocked}
          />
        )}
      </main>
    </div>
  );
}

const App: React.FC = () => (
  <AuthProvider>
    <ConfigProvider>
      <InnerApp />
    </ConfigProvider>
  </AuthProvider>
);

export default App;