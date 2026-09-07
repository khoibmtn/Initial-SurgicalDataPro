/**
 * Duty Schedule Service
 * Quản lý thông tin Lịch trực (Tua trực 24h & Ngày nghỉ/lễ/tết/làm bù)
 * Lưu trữ tập trung tại Root Collection: 'duty_schedules' trong Firestore
 * Mỗi document có ID là định dạng YYYY-MM-DD
 */

import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { firestore as db } from '../lib/firebase';
import { DutyScheduleDateConfig } from '../types';

export const DUTY_SCHEDULE_CHANGE_EVENT = 'sdp-duty-schedule-changed';

/**
 * Kiểm tra xem ngày có phải là Thứ 7 hoặc Chủ Nhật không
 * @param dateStr Chuỗi ngày YYYY-MM-DD
 */
export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return false;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Định dạng Date thành chuỗi YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Định dạng Date hoặc YYYY-MM-DD thành hiển thị dd/MM
 */
export function formatDisplayDate(dateInput: Date | string): string {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Lấy thứ trong tuần dạng viết tắt (T2, T3, ..., T7, CN)
 */
export function getDayOfWeekLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return '';
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  if (day === 0) return 'CN';
  return `T${day + 1}`;
}

/**
 * Xác định ngày của tua trực (Tua trực 24h) từ mốc thời gian thực tế:
 * Tua trực ngày T bắt đầu từ morningStart (ví dụ 07:00) đến trước morningStart ngày T+1 (06:59).
 * Nếu thời gian < morningStart: thuộc tua trực của ngày hôm trước (T - 1 ngày).
 * Nếu thời gian >= morningStart: thuộc tua trực của ngày hiện tại (T).
 */
export function getDutyDateKey(date: Date, morningStart: string = '07:00'): string {
  const [startH, startM] = morningStart.split(':').map(Number);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = (startH || 7) * 60 + (startM || 0);

  if (currentMinutes < startMinutes) {
    const prevDate = new Date(date.getTime());
    prevDate.setDate(prevDate.getDate() - 1);
    return formatDateKey(prevDate);
  }
  return formatDateKey(date);
}

export const dutyScheduleService = {
  /**
   * Tải lịch trực cho một danh sách các ngày (YYYY-MM-DD).
   * Nếu ngày nào chưa có trong Firestore, tự động tạo cấu hình mặc định:
   * - T7, CN: isHoliday = true
   * - Ngày thường: isHoliday = false
   * - onCallStaff = []
   */
  async getDutySchedulesForDates(dateKeys: string[]): Promise<Record<string, DutyScheduleDateConfig>> {
    const result: Record<string, DutyScheduleDateConfig> = {};
    if (!dateKeys || dateKeys.length === 0) return result;

    const uniqueDates = Array.from(new Set(dateKeys)).filter(Boolean);

    try {
      const fetchPromises = uniqueDates.map(async (dateKey) => {
        try {
          const docRef = doc(db, 'duty_schedules', dateKey);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            return {
              date: dateKey,
              isHoliday: data.isHoliday !== undefined ? Boolean(data.isHoliday) : isWeekend(dateKey),
              onCallStaff: Array.isArray(data.onCallStaff) ? data.onCallStaff : [],
              updatedAt: data.updatedAt || Date.now(),
            };
          }
        } catch (err) {
          console.warn(`[dutyScheduleService] Could not fetch duty schedule for ${dateKey}:`, err);
        }
        // Default fallback if not found in Firestore
        return {
          date: dateKey,
          isHoliday: isWeekend(dateKey),
          onCallStaff: [],
          updatedAt: Date.now(),
        };
      });

      const fetchedList = await Promise.all(fetchPromises);
      fetchedList.forEach((item) => {
        result[item.date] = item;
      });
    } catch (error) {
      console.error('[dutyScheduleService] Error in getDutySchedulesForDates:', error);
      uniqueDates.forEach((dateKey) => {
        result[dateKey] = {
          date: dateKey,
          isHoliday: isWeekend(dateKey),
          onCallStaff: [],
          updatedAt: Date.now(),
        };
      });
    }

    return result;
  },

  /**
   * Lưu hoặc cập nhật cấu hình trực của một ngày (Auto-save).
   */
  async saveDutyScheduleDate(
    dateKey: string,
    isHoliday: boolean,
    onCallStaff: string[]
  ): Promise<void> {
    if (!dateKey) return;
    try {
      const docRef = doc(db, 'duty_schedules', dateKey);
      const dataToSave: DutyScheduleDateConfig = {
        date: dateKey,
        isHoliday,
        onCallStaff,
        updatedAt: Date.now(),
      };
      await setDoc(docRef, dataToSave, { merge: true });

      // Phát sự kiện realtime cho các tab khác tự cập nhật
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(DUTY_SCHEDULE_CHANGE_EVENT, {
            detail: dataToSave,
          })
        );
      }
    } catch (error) {
      console.error(`[dutyScheduleService] Failed to save duty schedule for ${dateKey}:`, error);
      throw error;
    }
  },

  /**
   * Lưu hàng loạt nhiều ngày (Batch Save)
   */
  async batchSaveDutySchedules(
    schedules: Record<string, DutyScheduleDateConfig>
  ): Promise<void> {
    const dates = Object.keys(schedules);
    if (dates.length === 0) return;

    try {
      const batch = writeBatch(db);
      for (const dateKey of dates) {
        const item = schedules[dateKey];
        const docRef = doc(db, 'duty_schedules', dateKey);
        batch.set(
          docRef,
          {
            date: dateKey,
            isHoliday: item.isHoliday,
            onCallStaff: item.onCallStaff,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
      await batch.commit();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DUTY_SCHEDULE_CHANGE_EVENT, { detail: schedules }));
      }
    } catch (error) {
      console.error('[dutyScheduleService] Batch save failed:', error);
      throw error;
    }
  },
};
