import React, { useCallback } from 'react';
import { SurgeryConfig, SurgeryRecord, ProcessingResult } from '../types';
import { ReportState } from '../types/reportState';
import { ToastType } from '../components/common/ToastContainer';
import { reportService } from '../services/reportService';
import { reprocessSurgicalRecords, recalculateResultFromRecords } from '../services/reprocess';

export interface UseStorageQueryOptions {
  config: SurgeryConfig;
  currentType: 'daily' | 'monthly';
  activeTab: string;
  getState: (type: 'daily' | 'monthly', source: 'storage' | 'upload') => ReportState;
  updateReportState: (type: 'daily' | 'monthly', patch: Partial<ReportState>, source?: 'storage' | 'upload') => void;
  monthlyTimeMode: 'month' | 'range';
  selectedMonthlyYear: number;
  selectedMonthlyMonth: number;
  addToast: (message: React.ReactNode, type?: ToastType, duration?: number) => void;
}

export function useStorageQuery({
  config,
  currentType,
  activeTab,
  getState,
  updateReportState,
  monthlyTimeMode,
  selectedMonthlyYear,
  selectedMonthlyMonth,
  addToast,
}: UseStorageQueryOptions) {
  const formatDateForDisplay = useCallback((dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y} ${timeStr}`;
  }, []);

  // Helper function to determine season based on working hours config
  const determineSeason = useCallback((checkDate: Date, workingHours: any): 'summer' | 'winter' => {
    const checkMonth = checkDate.getMonth() + 1; // 1-12
    const checkDay = checkDate.getDate(); // 1-31

    // Parse summer config (DD/MM format)
    const [summerFromDay, summerFromMonth] = workingHours.summer.dateFrom.split('/').map(Number);
    const [summerToDay, summerToMonth] = workingHours.summer.dateTo.split('/').map(Number);

    // Parse winter config (DD/MM format)
    const [winterFromDay, winterFromMonth] = workingHours.winter.dateFrom.split('/').map(Number);
    const [winterToDay, winterToMonth] = workingHours.winter.dateTo.split('/').map(Number);

    // Check if range is cross-year
    const summerCrossYear =
      summerFromMonth > summerToMonth ||
      (summerFromMonth === summerToMonth && summerFromDay > summerToDay);
    const winterCrossYear =
      winterFromMonth > winterToMonth ||
      (winterFromMonth === winterToMonth && winterFromDay > winterToDay);

    // Helper to check if date is in range
    const isInRange = (
      checkM: number,
      checkD: number,
      fromM: number,
      fromD: number,
      toM: number,
      toD: number,
      crossYear: boolean
    ): boolean => {
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
    if (
      isInRange(
        checkMonth,
        checkDay,
        summerFromMonth,
        summerFromDay,
        summerToMonth,
        summerToDay,
        summerCrossYear
      )
    ) {
      return 'summer';
    }

    // Otherwise winter
    return 'winter';
  }, []);

  // Handler for "Lấy dữ liệu trực" button
  const handleAutoFill24hShift = useCallback(() => {
    const storageState = getState(currentType, 'storage');
    // Step 1: Get dateFrom from current report (YYYY-MM-DD format)
    const dateFromStr = storageState.dateFrom;
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
    const morningFrom =
      season === 'summer'
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
    updateReportState(
      currentType,
      {
        dateFrom: dateFromStr,
        timeFrom: morningFrom,
        dateTo: dateToStr,
        timeTo: timeTo,
      },
      'storage'
    );

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
          updateReportState(
            currentType,
            {
              result: undefined,
              stats: undefined,
              dataSource: undefined,
              queryDateRangeText: '',
            },
            'storage'
          );
          addToast(
            `Không có trường hợp phẫu thuật nào trong khoảng thời gian từ ${dateFromStr} ${morningFrom} đến ${dateToStr} ${timeTo}`,
            'error'
          );
          return;
        }

        // Convert PersistedSurgeryRecord to SurgeryRecord
        const convertedRecords: SurgeryRecord[] = persistedRecords.map((r) => ({
          ...r,
          stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
          start: r.ngayBD ? new Date(r.ngayBD) : null,
          end: r.ngayKT ? new Date(r.ngayKT) : null,
        }));

        const result = recalculateResultFromRecords(convertedRecords, config) as ProcessingResult;

        updateReportState(
          currentType,
          {
            dateFrom: dateFromStr,
            timeFrom: morningFrom,
            dateTo: dateToStr,
            timeTo: timeTo,
            result: result,
            stats: result.stats,
            activeTable: 'list',
            queryDateRangeText: `Từ ngày ${formatDateForDisplay(dateFromStr, morningFrom)} đến ngày ${formatDateForDisplay(dateToStr, timeTo)}`,
            dataSource: 'STORAGE',
          },
          'storage'
        );

        addToast(`Đã tải ${persistedRecords.length} ca phẫu thuật từ dữ liệu lưu trữ`, 'success');
      } catch (error: any) {
        console.error('Error fetching report:', error);
        addToast(`Lỗi khi tải dữ liệu: ${error.message}`, 'error');
      }
    })();
  }, [
    currentType,
    getState,
    config,
    updateReportState,
    activeTab,
    determineSeason,
    formatDateForDisplay,
    addToast,
  ]);

  const handleGetReport = useCallback(async () => {
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
    const dateFromStr = `${effDateFrom}T${effTimeFrom}:00.000+07:00`;
    const dateToStr = `${effDateTo}T${effTimeTo}:59.999+07:00`;

    // Validate
    const paramsValid = new Date(dateFromStr) <= new Date(dateToStr);
    if (!paramsValid) {
      addToast("Thời gian 'Đến' phải lớn hơn hoặc bằng Thời gian 'Từ'", 'error');
      return;
    }

    try {
      addToast('Đang tải dữ liệu lưu trữ...', 'success');

      const isoFrom = new Date(dateFromStr).toISOString();
      const isoTo = new Date(dateToStr).toISOString();

      const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
      const persistedRecords = await reportService.getReports(isoFrom, isoTo, type);

      if (!persistedRecords || persistedRecords.length === 0) {
        // Reset UI and show detailed message
        updateReportState(
          currentType,
          {
            result: undefined,
            stats: undefined,
            dataSource: undefined,
            queryDateRangeText: '',
          },
          'storage'
        );
        addToast(
          `Không có trường hợp phẫu thuật nào trong khoảng thời gian từ ${effDateFrom} ${effTimeFrom} đến ${effDateTo} ${effTimeTo}`,
          'error'
        );
        return;
      }

      // Convert Persisted Record -> App Record (Dates & Pricing)
      const convertedRecords: SurgeryRecord[] = persistedRecords.map((r) => ({
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
              reportService.getMachineDataFromDaily(res.validRecords),
            ]);

            let updateGvCount = 0;
            let updateMachineCount = 0;
            const updatesToSave: Array<{ firestorePath: string; gv?: string; machine?: string }> = [];

            res.validRecords.forEach((r) => {
              const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
              const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;
              let needsUpdate = false;
              const updateData: { firestorePath: string; gv?: string; machine?: string } = {
                firestorePath: r.firestorePath || '',
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
                  console.log(
                    `Auto-saved ${updatesToSave.length} records with GV/machine data to monthly storage.`
                  );
                } catch (saveError) {
                  console.error('Error auto-saving to storage:', saveError);
                }
              }

              // Recalculate with updated data
              const freshResult = reprocessSurgicalRecords(
                res.validRecords,
                config,
                queryRangeText
              );

              const currentStorage = getState(currentType, 'storage');
              // Update state with fresh calculations
              updateReportState(
                currentType,
                {
                  result: freshResult,
                  stats: freshResult.stats,
                  activeTable: 'list',
                  isProcessing: false,
                  dataSource: 'STORAGE',
                  queryDateRangeText: `Từ ngày ${formatDateForDisplay(currentStorage.dateFrom, currentStorage.timeFrom)} đến ngày ${formatDateForDisplay(currentStorage.dateTo, currentStorage.timeTo)}`,
                  selectedRecordIds: [],
                  hasAutoFilledData: false,
                },
                'storage'
              );

              const autoFillMsg = [];
              if (updateGvCount > 0) autoFillMsg.push(`${updateGvCount} giúp việc`);
              if (updateMachineCount > 0) autoFillMsg.push(`${updateMachineCount} mã máy`);

              addToast(
                `Đã tải ${persistedRecords.length} bản ghi. Tự động điền và lưu ${autoFillMsg.join(' và ')} từ BC hàng ngày.`,
                'success'
              );
              return;
            }
          } catch (error) {
            console.error('Error auto-filling from daily data:', error);
          }
        }

        const currentStorage = getState(currentType, 'storage');
        updateReportState(
          currentType,
          {
            result: res,
            stats: res.stats,
            activeTable: 'list',
            isProcessing: false,
            dataSource: 'STORAGE',
            queryDateRangeText: `Từ ngày ${formatDateForDisplay(currentStorage.dateFrom, currentStorage.timeFrom)} đến ngày ${formatDateForDisplay(currentStorage.dateTo, currentStorage.timeTo)}`,
            selectedRecordIds: [],
          },
          'storage'
        );

        let loadSuccessMsg = `Đã tải ${persistedRecords.length} bản ghi thành công.`;
        if (syncedPriceCount > 0) {
          loadSuccessMsg += ` Tự động lấy giá (Mã tương đương, Đơn giá, Thành tiền) cho ${syncedPriceCount} ca từ Báo cáo tháng.`;
        }
        addToast(loadSuccessMsg, 'success');
      } else {
        addToast(res.message, 'error');
      }
    } catch (error) {
      console.error('Error getting report:', error);
      addToast('Có lỗi xảy ra khi lấy dữ liệu.', 'error');
    }
  }, [
    currentType,
    getState,
    monthlyTimeMode,
    selectedMonthlyMonth,
    selectedMonthlyYear,
    activeTab,
    config,
    updateReportState,
    formatDateForDisplay,
    addToast,
  ]);

  const handleTimeChange = useCallback((val: string, setter: (v: string) => void) => {
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
  }, []);

  return {
    formatDateForDisplay,
    determineSeason,
    handleAutoFill24hShift,
    handleGetReport,
    handleTimeChange,
  };
}
