import React, { useMemo, useEffect, useCallback } from 'react';
import {
  SurgeryConfig,
  StaffMember,
  PatientServicePriceGroup,
  SurgeryNamePrice,
} from '../types';
import { ReportState } from '../types/reportState';
import { ToastType } from '../components/common/ToastContainer';
import { processSurgicalFiles } from '../services/excelProcessor';
import { reprocessSurgicalRecords } from '../services/reprocess';
import { reportService } from '../services/reportService';
import { getNamePrice } from '../services/surgeryNamePriceService';
import { matchAndApplyServicePrices } from '../services/servicePriceProcessor';

export interface UseExcelProcessingOptions {
  config: SurgeryConfig;
  updateConfig: (updates: Partial<SurgeryConfig>) => void;
  currentType: 'daily' | 'monthly';
  getState: (type: 'daily' | 'monthly', source: 'storage' | 'upload') => ReportState;
  updateReportState: (type: 'daily' | 'monthly', patch: Partial<ReportState>, source?: 'storage' | 'upload') => void;
  cachedServiceGroups: PatientServicePriceGroup[];
  namePrices: SurgeryNamePrice[];
  dailyUploadState: ReportState;
  monthlyUploadState: ReportState;
  addToast: (message: React.ReactNode, type?: ToastType, duration?: number) => void;
}

export function useExcelProcessing({
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
}: UseExcelProcessingOptions) {
  // Validate File
  const checkFile = useCallback(
    (f: File) => {
      const validExts = ['.xlsx', '.xls'];
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      if (!validExts.includes(ext)) {
        addToast(`Lỗi: File "${f.name}" không hợp lệ. Vui lòng chọn file Excel!`, 'error');
        return false;
      }
      return true;
    },
    [addToast]
  );

  const handleListFileSelect = useCallback(
    async (f: File | null) => {
      if (!f) {
        updateReportState(currentType, { listFile: null, listDateRange: '' }, 'upload');
        return;
      }
      if (!checkFile(f)) return;

      const { validateListFile } = await import('../services/excelProcessor');
      const res = await validateListFile(f);

      if (!res.valid) {
        addToast(res.error || 'File không hợp lệ', 'error', 14000);
        updateReportState(currentType, { listFile: null, listDateRange: '' }, 'upload');
        return;
      }

      updateReportState(
        currentType,
        {
          listFile: f,
          listDateRange: res.dateRangeText || '',
        },
        'upload'
      );
      const reportName = currentType === 'monthly' ? 'Báo cáo tháng' : 'Báo cáo hàng ngày';
      addToast(
        <span>
          Bạn vừa tải dữ liệu Minh Lộ vào <strong className="text-red-600 font-bold">{reportName}</strong>. Lưu ý: sau khi kiểm tra, nếu dữ liệu chuẩn, hãy bấm Lưu để lưu dữ liệu vào bộ nhớ
        </span>,
        'success',
        7000
      );
    },
    [currentType, checkFile, updateReportState, addToast]
  );

  // Reset file uploads và dữ liệu liên quan cho từng loại báo cáo
  const handleResetUpload = useCallback(
    (type: 'daily' | 'monthly') => {
      updateReportState(
        type,
        {
          listFile: null,
          listDateRange: '',
          result: undefined,
          stats: undefined,
          hasAutoFilledData: false,
          dataSource: undefined,
          isProcessing: false,
        },
        'upload'
      );
      addToast('Đã hủy tải lên, dữ liệu đã được xóa.', 'success');
    },
    [updateReportState, addToast]
  );

  const handleProcess = useCallback(
    async (type: 'daily' | 'monthly') => {
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
          const existingMap = new Map<string, StaffMember>(
            currentStaff.map((s) => [`${s.name}-${s.position}`, s])
          );
          let hasUpdates = false;

          newStaff.forEach((s) => {
            const key = `${s.name}-${s.position}`;
            if (!existingMap.has(key)) {
              merged.push(s);
              existingMap.set(key, s);
              hasUpdates = true;
            } else {
              const exist = existingMap.get(key)!;
              if ((!exist.taxId && s.taxId) || (!exist.department && s.department)) {
                const idx = merged.findIndex((m) => m.name === s.name && m.position === s.position);
                if (idx > -1) {
                  merged[idx] = {
                    ...exist,
                    taxId: exist.taxId || s.taxId,
                    department: exist.department || s.department,
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
          if (cachedServiceGroups.length > 0) {
            matchAndApplyServicePrices(res.validRecords, cachedServiceGroups);
          }

          res.validRecords.forEach((r) => {
            const hasPrice = (r.donGia && r.donGia > 0) || (r.thanhTien && r.thanhTien > 0);
            if (!hasPrice) {
              const rawDate =
                r.start instanceof Date && !isNaN(r.start.getTime())
                  ? r.start.toISOString()
                  : r.ngayBD || '';
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
            const [assistantMap, machineMap] = await Promise.all([
              reportService.getAssistantDataFromDaily(res.validRecords),
              reportService.getMachineDataFromDaily(res.validRecords),
            ]);

            res.validRecords.forEach((r) => {
              const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
              const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;

              if (!r.gv || r.gv.trim() === '') {
                const dailyGv = assistantMap.get(key);
                if (dailyGv) {
                  r.gv = dailyGv;
                  updateGvCount++;
                }
              }

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

        updateReportState(
          type,
          {
            stats: finalResult.stats,
            result: finalResult,
            activeTable: 'list',
            isProcessing: false,
            dataSource: 'EXCEL',
            hasAutoFilledData: updateGvCount > 0 || updateMachineCount > 0,
          },
          'upload'
        );

        if (updateGvCount > 0 || updateMachineCount > 0) {
          const autoFillMsg = [];
          if (updateGvCount > 0) autoFillMsg.push(`${updateGvCount} giúp việc`);
          if (updateMachineCount > 0) autoFillMsg.push(`${updateMachineCount} mã máy`);
          addToast(`Đã tự động điền ${autoFillMsg.join(' và ')} từ BC hàng ngày.`, 'success');
        }

        if (res.filterSummary) {
          const { totalInFile, importedCount, excludedCount, missingStaffCount, unassignedStaffCount } =
            res.filterSummary;
          if (importedCount === 0) {
            addToast(
              `Không có ca mổ nào được import! (Toàn bộ ${totalInFile} ca bị loại bỏ do không thỏa mãn cấu hình khoa/phòng hoặc vị trí lấy vào báo cáo).`,
              'error',
              12000
            );
          } else if (excludedCount > 0) {
            const detailParts: string[] = [];
            if (missingStaffCount > 0)
              detailParts.push(`${missingStaffCount} ca nhân viên đối soát không có trong danh mục`);
            if (unassignedStaffCount > 0)
              detailParts.push(`${unassignedStaffCount} ca nhân viên có tên nhưng chưa xếp khoa`);
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

        if (type === 'monthly' && res.validRecords) {
          const totalCount = res.validRecords.length;
          const pricedCount = res.validRecords.filter(
            (r) => (r.donGia && r.donGia > 0) || (r.thanhTien && r.thanhTien > 0)
          ).length;

          let rangeText = res.dateRangeText || report.listDateRange || '';
          if (!rangeText) {
            const dates = res.validRecords
              .map((r) =>
                r.start instanceof Date && !isNaN(r.start.getTime())
                  ? r.start.getTime()
                  : r.ngayBD
                  ? new Date(r.ngayBD).getTime()
                  : 0
              )
              .filter((t) => t > 0)
              .sort((a, b) => a - b);
            if (dates.length > 0) {
              const minDate = new Date(dates[0]);
              const maxDate = new Date(dates[dates.length - 1]);
              const fmt = (d: Date) =>
                `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
                  Hãy bổ sung import thêm báo cáo Thống kê giá DVKT trong khoảng thời gian{' '}
                  {rangeText ? `(${rangeText}) ` : ''}để áp đầy đủ giá.
                </p>
              </div>,
              'warning',
              14000
            );
          } else {
            addToast(`Đã có ${pricedCount}/{totalCount} trường hợp có giá áp dụng.`, 'success', 6000);
          }
        }
      } catch (error: any) {
        console.error(error);
        addToast(error.message || 'Có lỗi xử lý', 'error', 14000);
        updateReportState(
          type,
          {
            listFile: null,
            listDateRange: '',
            stats: null,
            result: null,
            isProcessing: false,
          },
          'upload'
        );
      }
    },
    [
      getState,
      updateReportState,
      config,
      updateConfig,
      cachedServiceGroups,
      namePrices,
      addToast,
    ]
  );

  // Auto-reprocess when critical config changes
  const processingConfigHash = useMemo(
    () =>
      JSON.stringify({
        priceConfig: config.priceConfig,
        timeRules: config.timeRules,
        staffLimits: config.staffLimits,
        ignoredMachineCodes: config.ignoredMachineCodes,
        ignoredMachineNames: config.ignoredMachineNames,
        allowanceItems: config.allowanceItems,
        timeItemsList: config.timeItemsList,
        tableItems: config.tableItems,
        requiredMachineCatalog: config.requiredMachineCatalog,
      }),
    [config]
  );

  useEffect(() => {
    const processReports = () => {
      if (dailyUploadState.listFile) handleProcess('daily');
      if (monthlyUploadState.listFile) handleProcess('monthly');
    };

    const timer = setTimeout(processReports, 300);
    return () => clearTimeout(timer);
  }, [processingConfigHash, dailyUploadState.listFile, monthlyUploadState.listFile, handleProcess]);

  return {
    checkFile,
    handleListFileSelect,
    handleResetUpload,
    handleProcess,
  };
}
