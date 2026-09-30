import { useState, useEffect, useMemo } from 'react';
import { DutyScheduleDateConfig, SurgeryConfig, SurgeryRecord } from '../types';
import {
  dutyScheduleService,
  getDutyDateKey,
  formatDateKey,
  DUTY_SCHEDULE_CHANGE_EVENT,
} from '../services/dutyScheduleService';
import { getScheduleForDate, calculateOvertimeRows } from '../services/overtimeCalculationService';

export interface UseDutyScheduleStateOptions {
  validRecords?: SurgeryRecord[];
  config?: SurgeryConfig;
}

export function useDutyScheduleState({ validRecords, config }: UseDutyScheduleStateOptions) {
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
    if (!validRecords || validRecords.length === 0) return;

    const dateKeys = new Set<string>();
    validRecords.forEach((r) => {
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
  }, [validRecords, config?.workingHours]);

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
    if (!validRecords || validRecords.length === 0) return 0;
    const keys = new Set<string>();
    validRecords.forEach((r) => {
      const start = r.start || (r.ngayBD ? new Date(r.ngayBD) : null);
      if (start && !isNaN(start.getTime())) {
        const sch = getScheduleForDate(start, config?.workingHours);
        keys.add(getDutyDateKey(start, sch.morningFrom || '07:00'));
      }
    });
    return keys.size;
  }, [validRecords, config?.workingHours]);

  const currentReportOvertimeCount = useMemo(() => {
    if (!validRecords || validRecords.length === 0) return 0;
    try {
      const includeGV =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('sdp_overtime_include_gv') === 'true'
          : false;
      const rows = calculateOvertimeRows(validRecords, dutySchedules, config?.workingHours, includeGV);
      return rows.length;
    } catch {
      return 0;
    }
  }, [validRecords, dutySchedules, config?.workingHours]);

  return {
    dutySchedules,
    isSavingDutySchedule,
    handleUpdateDutySchedule,
    currentReportDutyDateCount,
    currentReportOvertimeCount,
  };
}
