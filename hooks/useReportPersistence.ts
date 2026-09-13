import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { TabKey } from '../components/ui';
import {
  SurgeryRecord,
  SurgeryConfig,
  DutyScheduleDateConfig,
  ProcessingResult,
} from '../types';
import { ReportState } from '../types/reportState';
import { ColumnDef } from '../components/common/DynamicTable';
import { ToastType } from '../components/common/ToastContainer';
import { reportService } from '../services/reportService';
import { dutyScheduleService } from '../services/dutyScheduleService';
import { reprocessSurgicalRecords, recalculateResultFromRecords } from '../services/reprocess';
import { exportFormattedFullExcel } from '../services/excelExportService';
import type { AppUser, UserRole } from '../types/auth';
import { logAuditEvent } from '../services/auditLogService';

export interface UseReportPersistenceOptions {
  currentReport: ReportState;
  updateCurrentReport: (updates: Partial<ReportState>) => void;
  activeTab: TabKey;
  currentType: 'daily' | 'monthly';
  config: SurgeryConfig;
  dutySchedules: Record<string, DutyScheduleDateConfig>;
  columnsList: ColumnDef<any>[];
  visibleCols: Record<string, any>;
  paymentDataPrepared: any;
  addToast: (message: React.ReactNode, type?: ToastType, duration?: number) => void;
  isReportLocked?: boolean;
  currentUser?: AppUser | null;
  currentRole?: UserRole | 'guest';
  currentPeriodKey?: string;
}

export function useReportPersistence({
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
  isReportLocked = false,
  currentUser,
  currentRole,
  currentPeriodKey,
}: UseReportPersistenceOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    message: string;
    onConfirm: (() => void) | null;
  }>({ show: false, message: '', onConfirm: null });
  const [saveConfirm, setSaveConfirm] = useState<{
    show: boolean;
    message: string;
    onConfirm: (() => void) | null;
  }>({ show: false, message: '', onConfirm: null });

  // ── DELETE HANDLING ──
  const executeDelete = useCallback(async () => {
    const selectedIds = currentReport.selectedRecordIds || [];
    if (selectedIds.length === 0) return;

    try {
      if (!currentReport.result) return;

      const recordsToDelete = currentReport.result.validRecords.filter((r) =>
        selectedIds.includes(r.key || r.id || '')
      );

      if (recordsToDelete.length === 0) {
        addToast('Không tìm thấy dòng tương ứng để xóa', 'error');
        return;
      }

      // 1. Chỉ xóa trong CSDL khi nguồn dữ liệu là LƯU TRỮ (STORAGE)
      if (currentReport.dataSource === 'STORAGE') {
        try {
          const recordsInDb = recordsToDelete.filter((r) => !!(r as any).firestorePath);
          const toDelete = recordsInDb.length > 0 ? recordsInDb : recordsToDelete;
          const deletedCount = await reportService.deleteRecords(toDelete);
          if (deletedCount > 0) {
            addToast(`Đã xóa vĩnh viễn ${deletedCount} dòng từ cơ sở dữ liệu`, 'success');
          }
        } catch (e) {
          console.error('Delete failed', e);
          addToast('Lỗi khi xóa từ Firestore. Vui lòng thử lại.', 'error');
          return;
        }
      }

      // 2. Local Update & Reprocess
      const remainingRecords = currentReport.result.validRecords.filter(
        (r) => !selectedIds.includes(r.key || r.id || '')
      );

      const newResult = reprocessSurgicalRecords(
        remainingRecords,
        config,
        currentReport.result.dateRangeText || ''
      );

      updateCurrentReport({
        result: newResult,
        selectedRecordIds: [],
      });

      if (currentReport.dataSource !== 'STORAGE') {
        addToast(
          `Đã xóa ${selectedIds.length} dòng khỏi bảng hiện tại (dữ liệu lưu trữ không bị ảnh hưởng)`,
          'success'
        );
      }

      // Ghi nhận Audit Log
      logAuditEvent({
        userId: currentUser?.uid || 'unknown',
        userName: currentUser?.name || currentUser?.email || 'Người dùng',
        userRole: (currentRole as UserRole) || 'staff',
        userDepartment: currentUser?.department,
        action: 'RECORD_DELETE',
        targetType: 'surgery_record',
        targetLabel: `${recordsToDelete.length} ca mổ`,
        periodKey: currentPeriodKey,
        department: currentUser?.department,
        description: `Xóa ${recordsToDelete.length} dòng dữ liệu (${currentReport.dataSource === 'STORAGE' ? 'CSDL Firestore' : 'Bảng tạm'})`,
      }).catch((e) => console.warn('[auditLog] Failed to log delete event:', e));
    } catch (err: any) {
      console.error('Delete error:', err);
      addToast(`Xóa thất bại: ${err?.message || 'Lỗi không xác định'}`, 'error');
    }
  }, [currentReport, config, updateCurrentReport, addToast, currentUser, currentRole, currentPeriodKey]);

  const handleDeleteSelected = useCallback(() => {
    if (isReportLocked) {
      addToast('Báo cáo đã khóa sổ (Chỉ xem). Không thể xóa dữ liệu!', 'error');
      return;
    }

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
      },
    });
  }, [currentReport, currentType, executeDelete, isReportLocked, addToast]);

  // ── SAVE HANDLING ──
  const executeSave = useCallback(async (): Promise<boolean> => {
    if (isReportLocked) {
      addToast('Báo cáo đã khóa sổ (Chỉ xem). Không thể lưu dữ liệu!', 'error');
      return false;
    }

    if (!currentReport.result || !currentReport.result.validRecords) {
      addToast('Không có dữ liệu hợp lệ để lưu.', 'error');
      return false;
    }

    setIsSaving(true);
    try {
      const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
      const userId = 'anonymous_user';

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

        // Ghi nhận Audit Log
        logAuditEvent({
          userId: currentUser?.uid || 'unknown',
          userName: currentUser?.name || currentUser?.email || 'Người dùng',
          userRole: (currentRole as UserRole) || 'staff',
          userDepartment: currentUser?.department,
          action: 'DATA_SAVE',
          targetType: 'report',
          targetLabel: `Báo cáo ${type === 'MONTHLY' ? 'Tháng' : 'Ngày'}`,
          periodKey: currentPeriodKey,
          department: currentUser?.department,
          description: `Lưu dữ liệu báo cáo: ${msg}`,
        }).catch((e) => console.warn('[auditLog] Failed to log save event:', e));

        // NẾU TỪ EXCEL LƯU THÀNH CÔNG, reload lại từ STORAGE để đảm bảo mọi record đều có ID và firestorePath chuẩn
        if (currentReport.dataSource === 'EXCEL') {
          const dateFrom = (currentReport as any).filters?.dateFrom;
          const dateTo = (currentReport as any).filters?.dateTo;
          if (dateFrom && dateTo) {
            addToast('Đang đồng bộ dữ liệu vào hệ thống lưu trữ...', 'success');
            reportService
              .getReports(dateFrom, dateTo, type)
              .then((records) => {
                if (records.length > 0) {
                  const convertedRecs: SurgeryRecord[] = records.map((r) => ({
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
              })
              .catch((err) => {
                console.error('Auto reload from storage failed:', err);
              });
          }
        }
      }
      return true;
    } catch (error) {
      console.error(error);
      addToast('Lỗi khi lưu dữ liệu. Vui lòng thử lại.', 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentReport, activeTab, dutySchedules, config, updateCurrentReport, addToast, isReportLocked, currentUser, currentRole, currentPeriodKey]);

  const ensureDataSaved = useCallback(
    async (afterSave?: () => void): Promise<void> => {
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
    },
    [currentReport.dataSource, currentReport.result?.validRecords, executeSave]
  );

  const handleSaveData = useCallback(async () => {
    if (isReportLocked) {
      addToast('Báo cáo đã khóa sổ (Chỉ xem). Không thể lưu dữ liệu!', 'error');
      return;
    }

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
        await executeSave();
      } else {
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
          },
        });
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
      await executeSave();
    }
  }, [currentReport.dataSource, currentReport.result?.validRecords, activeTab, executeSave]);

  // ── DOWNLOAD HANDLING ──
  const executeDownload = useCallback(() => {
    if (!currentReport.result?.validRecords) {
      addToast('Chưa có dữ liệu để tải xuống.', 'error');
      return;
    }

    try {
      addToast('Đang tạo file Excel...', 'success');

      const freshResult = reprocessSurgicalRecords(
        currentReport.result.validRecords,
        config,
        currentReport.result.dateRangeText || ''
      );

      if (!freshResult.wb) {
        addToast('Lỗi khi tạo file Excel.', 'error');
        return;
      }

      const filename = `Ket_qua_${currentType}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(freshResult.wb, filename);
      addToast('Đã tải xuống file Excel.', 'success');
    } catch (e: any) {
      console.error('Download failed:', e);
      addToast('Lỗi khi tải file: ' + e.message, 'error');
    }
  }, [currentReport.result, config, currentType, addToast]);

  const handleDownload = useCallback(async () => {
    if (currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
      await ensureDataSaved(executeDownload);
      return;
    }
    executeDownload();
  }, [currentReport.dataSource, currentReport.result?.validRecords, ensureDataSaved, executeDownload]);

  const executeDownloadFormatted = useCallback(async () => {
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
        .filter((c) => visibleCols['list']?.[c.key] !== false)
        .map((c) => ({ key: c.key, label: c.label }));

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
        signatureDate
      );

      addToast('Đã tải xuống file Excel định dạng.', 'success');
    } catch (e: any) {
      console.error('Formatted download failed:', e);
      addToast('Lỗi khi tải file: ' + e.message, 'error');
    }
  }, [
    currentReport.result,
    currentReport.queryDateRangeText,
    config,
    columnsList,
    visibleCols,
    activeTab,
    paymentDataPrepared,
    addToast,
  ]);

  const handleDownloadFormatted = useCallback(async () => {
    if (currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
      await ensureDataSaved(() => executeDownloadFormatted());
      return;
    }
    await executeDownloadFormatted();
  }, [currentReport.dataSource, currentReport.result?.validRecords, ensureDataSaved, executeDownloadFormatted]);

  return {
    isSaving,
    deleteConfirm,
    setDeleteConfirm,
    saveConfirm,
    setSaveConfirm,
    executeDelete,
    handleDeleteSelected,
    executeSave,
    ensureDataSaved,
    handleSaveData,
    executeDownload,
    handleDownload,
    executeDownloadFormatted,
    handleDownloadFormatted,
  };
}
