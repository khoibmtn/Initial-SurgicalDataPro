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

const LOCAL_STORAGE_KEY_PREFIX = 'sdp_duty_schedule_';

function getLocalDutySchedule(dateKey: string): DutyScheduleDateConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${dateKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        date: dateKey,
        isHoliday: Boolean(parsed.isHoliday),
        onCallStaff: Array.isArray(parsed.onCallStaff) ? parsed.onCallStaff : [],
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch (err) {
    console.warn(`[dutyScheduleService] Failed to read localStorage for ${dateKey}:`, err);
  }
  return null;
}

function setLocalDutySchedule(dateKey: string, data: DutyScheduleDateConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${dateKey}`, JSON.stringify(data));
  } catch (err) {
    console.warn(`[dutyScheduleService] Failed to write localStorage for ${dateKey}:`, err);
  }
}

export const dutyScheduleService = {
  /**
   * Tải lịch trực cho một danh sách các ngày (YYYY-MM-DD).
   * Cơ chế đa tầng (Dual-layer):
   * 1. Ưu tiên đọc từ LocalStorage để render tức thì (0ms latency).
   * 2. Đồng thời tải từ Firestore để đồng bộ hóa và cập nhật lại cache.
   * 3. Nếu Firestore lỗi hoặc chưa có cấu hình, giữ nguyên dữ liệu LocalStorage đã lưu.
   */
  async getDutySchedulesForDates(dateKeys: string[]): Promise<Record<string, DutyScheduleDateConfig>> {
    const result: Record<string, DutyScheduleDateConfig> = {};
    if (!dateKeys || dateKeys.length === 0) return result;

    const uniqueDates = Array.from(new Set(dateKeys)).filter(Boolean);

    // Bước 1: Khởi tạo kết quả ngay lập tức từ LocalStorage nếu có
    uniqueDates.forEach((dateKey) => {
      const local = getLocalDutySchedule(dateKey);
      if (local) {
        result[dateKey] = local;
      }
    });

    try {
      const fetchPromises = uniqueDates.map(async (dateKey) => {
        const local = getLocalDutySchedule(dateKey);
        try {
          const docRef = doc(db, 'duty_schedules', dateKey);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            const config: DutyScheduleDateConfig = {
              date: dateKey,
              isHoliday: data.isHoliday !== undefined ? Boolean(data.isHoliday) : isWeekend(dateKey),
              onCallStaff: Array.isArray(data.onCallStaff) ? data.onCallStaff : [],
              updatedAt: data.updatedAt || Date.now(),
            };
            // Cập nhật lại local cache từ Firestore
            setLocalDutySchedule(dateKey, config);
            return config;
          } else if (local) {
            // Nếu Firestore chưa có nhưng LocalStorage đã lưu, tự động đồng bộ lên Firestore
            try {
              await setDoc(docRef, local, { merge: true });
            } catch (syncErr) {
              console.warn(`[dutyScheduleService] Could not sync local schedule to Firestore for ${dateKey}:`, syncErr);
            }
            return local;
          }
        } catch (err) {
          console.warn(`[dutyScheduleService] Could not fetch duty schedule for ${dateKey}:`, err);
          if (local) return local;
        }

        // Fallback mặc định nếu cả Firestore và LocalStorage đều chưa có
        const fallback: DutyScheduleDateConfig = local || {
          date: dateKey,
          isHoliday: isWeekend(dateKey),
          onCallStaff: [],
          updatedAt: Date.now(),
        };
        return fallback;
      });

      const fetchedList = await Promise.all(fetchPromises);
      fetchedList.forEach((item) => {
        result[item.date] = item;
      });
    } catch (error) {
      console.error('[dutyScheduleService] Error in getDutySchedulesForDates:', error);
      uniqueDates.forEach((dateKey) => {
        if (!result[dateKey]) {
          const local = getLocalDutySchedule(dateKey);
          result[dateKey] = local || {
            date: dateKey,
            isHoliday: isWeekend(dateKey),
            onCallStaff: [],
            updatedAt: Date.now(),
          };
        }
      });
    }

    return result;
  },

  /**
   * Lưu hoặc cập nhật cấu hình trực của một ngày (Auto-save).
   * 1. Ghi tức thì vào LocalStorage.
   * 2. Phát sự kiện realtime trong ứng dụng.
   * 3. Đồng bộ lên Firestore.
   */
  async saveDutyScheduleDate(
    dateKey: string,
    isHoliday: boolean,
    onCallStaff: string[]
  ): Promise<void> {
    if (!dateKey) return;
    const dataToSave: DutyScheduleDateConfig = {
      date: dateKey,
      isHoliday,
      onCallStaff,
      updatedAt: Date.now(),
    };

    // 1. Lưu ngay lập tức vào LocalStorage (Đảm bảo dữ liệu không bị mất)
    setLocalDutySchedule(dateKey, dataToSave);

    // 2. Phát sự kiện realtime cho các tab khác tự cập nhật
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(DUTY_SCHEDULE_CHANGE_EVENT, {
          detail: dataToSave,
        })
      );
    }

    // 3. Đồng bộ lên Firestore
    try {
      const docRef = doc(db, 'duty_schedules', dateKey);
      await setDoc(docRef, dataToSave, { merge: true });
    } catch (error) {
      console.error(`[dutyScheduleService] Failed to save duty schedule to Firestore for ${dateKey}:`, error);
      // Không throw error nếu local đã lưu thành công để UI không bị gián đoạn
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

    // 1. Lưu ngay lập tức vào LocalStorage
    dates.forEach((dateKey) => {
      setLocalDutySchedule(dateKey, schedules[dateKey]);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DUTY_SCHEDULE_CHANGE_EVENT, { detail: schedules }));
    }

    // 2. Lưu Firestore Batch
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
    } catch (error) {
      console.error('[dutyScheduleService] Batch save to Firestore failed:', error);
    }
  },
};
