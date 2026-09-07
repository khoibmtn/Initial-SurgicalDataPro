/**
 * Overtime Calculation Service
 * Xử lý logic và tính toán thời gian làm ngoài giờ hành chính cho từng ca mổ và từng thành viên kíp mổ.
 */

import { SurgeryRecord, DutyScheduleDateConfig, OvertimeRecordRow } from '../types';
import { WorkingHours, SeasonSchedule } from '../contexts/ConfigContext';
import { formatDateKey, isWeekend } from './dutyScheduleService';

// Giá trị mặc định nếu cấu hình chưa có
const DEFAULT_SUMMER_HOURS: SeasonSchedule = {
  dateFrom: '01/05',
  dateTo: '30/09',
  morningFrom: '07:00',
  morningTo: '11:30',
  afternoonFrom: '13:30',
  afternoonTo: '17:00',
};

const DEFAULT_WINTER_HOURS: SeasonSchedule = {
  dateFrom: '01/10',
  dateTo: '30/04',
  morningFrom: '07:30',
  morningTo: '12:00',
  afternoonFrom: '13:30',
  afternoonTo: '17:00',
};

/**
 * Xác định mùa (summer / winter) dựa theo ngày
 */
export function getSeasonForDate(date: Date, configHours?: WorkingHours): 'summer' | 'winter' {
  const summer = configHours?.summer || DEFAULT_SUMMER_HOURS;
  const d = date.getDate();
  const m = date.getMonth() + 1; // 1-12

  const parseDM = (str: string) => {
    const parts = (str || '').replace(/-/g, '/').split('/').map(Number);
    return { day: parts[0] || 1, month: parts[1] || 1 };
  };

  const sFrom = parseDM(summer.dateFrom || '01/05');
  const sTo = parseDM(summer.dateTo || '30/09');

  // Kiểm tra nếu ngày nằm trong khoảng hè (thường không vắt năm)
  const isAfterStart = m > sFrom.month || (m === sFrom.month && d >= sFrom.day);
  const isBeforeEnd = m < sTo.month || (m === sTo.month && d <= sTo.day);

  if (sFrom.month <= sTo.month) {
    if (isAfterStart && isBeforeEnd) return 'summer';
  } else {
    // Vắt năm
    if (isAfterStart || isBeforeEnd) return 'summer';
  }

  return 'winter';
}

/**
 * Lấy khung giờ làm việc theo mùa cho một ngày cụ thể
 */
export function getScheduleForDate(date: Date, configHours?: WorkingHours): SeasonSchedule {
  const season = getSeasonForDate(date, configHours);
  if (season === 'summer') {
    return configHours?.summer || DEFAULT_SUMMER_HOURS;
  }
  return configHours?.winter || DEFAULT_WINTER_HOURS;
}

/**
 * Định dạng thời lượng (phút) thành chuỗi như '30ph', '55ph', '1h', '1h20'
 */
export function formatDurationText(minutes: number): string {
  if (!minutes || minutes <= 0) return '0ph';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h === 0) return `${m}ph`;
  if (m === 0) return `${h}h`;
  const mFormatted = m < 10 ? `0${m}` : `${m}`;
  return `${h}h${mFormatted}`;
}

/**
 * Định dạng Date thành HH:mm
 */
function formatHHmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Định dạng Date thành dd/MM/yyyy HH:mm
 */
function formatFullDateTime(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

interface StaffRoleAssignment {
  name: string;
  roleKey: 'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv';
}

interface SubIntervalStaffOvertime {
  staffMap: Partial<Record<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv', string>>;
  ghiChu: 'Kíp mổ phiên' | 'Kíp trực';
  start: Date;
  end: Date;
}

/**
 * Hàm chính: Tính toán toàn bộ danh sách ngoài giờ từ danh sách ca phẫu thuật
 */
export function calculateOvertimeRows(
  records: SurgeryRecord[],
  dutySchedules: Record<string, DutyScheduleDateConfig>,
  workingHours?: WorkingHours,
  includeGV: boolean = false
): OvertimeRecordRow[] {
  const resultRows: OvertimeRecordRow[] = [];

  if (!records || records.length === 0) return resultRows;

  // Lấy danh sách vai trò cần xét
  const roleKeys: Array<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv'> = [
    'ptChinh',
    'ptPhu',
    'bsGM',
    'ktvGM',
    'tdc',
  ];
  if (includeGV) {
    roleKeys.push('gv');
  }

  // 1. Nhóm các bản ghi theo phiên phẫu thuật (Cùng bệnh nhân + Cùng giờ bắt đầu & kết thúc)
  // Trong danh sách phẫu thuật (Minh Lộ/Excel), 1 ca phẫu thuật thực tế thường gồm nhiều DVKT
  // (ví dụ: Cắt ruột thừa + Dẫn lưu ổ bụng) dẫn đến nhiều dòng trùng giờ cho cùng 1 bệnh nhân.
  // Ta cần hợp nhất theo phiên phẫu thuật để tính đúng thời gian ngoài giờ thực tế và tập hợp đủ kíp mổ.
  interface ConsolidatedSession {
    patientId: string;
    patientName: string;
    tenKT: string;
    rawStart: Date;
    rawEnd: Date;
    ptChinh?: string;
    ptPhu?: string;
    bsGM?: string;
    ktvGM?: string;
    tdc?: string;
    gv?: string;
    originalRecord: SurgeryRecord;
  }

  const sessionMap = new Map<string, ConsolidatedSession>();

  records.forEach((record) => {
    const rawStart = record.start || (record.ngayBD ? new Date(record.ngayBD) : null);
    const rawEnd = record.end || (record.ngayKT ? new Date(record.ngayKT) : null);

    if (!rawStart || !rawEnd || isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime()) || rawEnd <= rawStart) {
      return;
    }

    const pId = (record.patientId || '').trim();
    const sessionKey = `${pId}_${rawStart.getTime()}_${rawEnd.getTime()}`;

    const existing = sessionMap.get(sessionKey);
    if (!existing) {
      sessionMap.set(sessionKey, {
        patientId: pId,
        patientName: record.patientName || '',
        tenKT: (record.tenKT || '').trim(),
        rawStart,
        rawEnd,
        ptChinh: record.ptChinh?.trim() || undefined,
        ptPhu: record.ptPhu?.trim() || undefined,
        bsGM: record.bsGM?.trim() || undefined,
        ktvGM: record.ktvGM?.trim() || undefined,
        tdc: record.tdc?.trim() || undefined,
        gv: record.gv?.trim() || undefined,
        originalRecord: record,
      });
    } else {
      // Hợp nhất tên kỹ thuật nếu khác
      if (record.tenKT && record.tenKT.trim()) {
        const cleanKT = record.tenKT.trim();
        if (!existing.tenKT.includes(cleanKT)) {
          existing.tenKT = `${existing.tenKT}; ${cleanKT}`;
        }
      }
      // Bổ sung nhân sự nếu dòng này có mà dòng trước thiếu (đặc biệt là GV)
      if (!existing.ptChinh && record.ptChinh) existing.ptChinh = record.ptChinh.trim();
      if (!existing.ptPhu && record.ptPhu) existing.ptPhu = record.ptPhu.trim();
      if (!existing.bsGM && record.bsGM) existing.bsGM = record.bsGM.trim();
      if (!existing.ktvGM && record.ktvGM) existing.ktvGM = record.ktvGM.trim();
      if (!existing.tdc && record.tdc) existing.tdc = record.tdc.trim();
      if (!existing.gv && record.gv) existing.gv = record.gv.trim();
    }
  });

  const consolidatedSessions = Array.from(sessionMap.values());

  consolidatedSessions.forEach((session) => {
    const { rawStart, rawEnd, originalRecord } = session;

    // Thu thập danh sách nhân viên tham gia ca mổ
    const staffList: StaffRoleAssignment[] = [];
    roleKeys.forEach((key) => {
      const name = (session[key] || '').toString().trim();
      if (name) {
        staffList.push({ name, roleKey: key });
      }
    });

    if (staffList.length === 0) return;

    // 1. Thu thập tất cả các mốc chuyển đổi khung giờ trong khoảng [rawStart, rawEnd]
    const boundaryTimestamps = new Set<number>([rawStart.getTime(), rawEnd.getTime()]);

    // Duyệt qua các ngày lịch mà ca mổ chạm tới
    const startDateCursor = new Date(rawStart.getFullYear(), rawStart.getMonth(), rawStart.getDate());
    const endDateCursor = new Date(rawEnd.getFullYear(), rawEnd.getMonth(), rawEnd.getDate());

    for (
      let cur = new Date(startDateCursor.getTime());
      cur.getTime() <= endDateCursor.getTime() + 86400000;
      cur.setDate(cur.getDate() + 1)
    ) {
      const schedule = getScheduleForDate(cur, workingHours);
      const parseTimeOnDay = (timeStr: string) => {
        const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
        return new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), hh || 0, mm || 0, 0, 0).getTime();
      };

      const mStart = parseTimeOnDay(schedule.morningFrom);
      const mEnd = parseTimeOnDay(schedule.morningTo);
      const aStart = parseTimeOnDay(schedule.afternoonFrom);
      const aEnd = parseTimeOnDay(schedule.afternoonTo);

      if (mStart > rawStart.getTime() && mStart < rawEnd.getTime()) boundaryTimestamps.add(mStart);
      if (mEnd > rawStart.getTime() && mEnd < rawEnd.getTime()) boundaryTimestamps.add(mEnd);
      if (aStart > rawStart.getTime() && aStart < rawEnd.getTime()) boundaryTimestamps.add(aStart);
      if (aEnd > rawStart.getTime() && aEnd < rawEnd.getTime()) boundaryTimestamps.add(aEnd);
    }

    const sortedBoundaries = Array.from(boundaryTimestamps).sort((a, b) => a - b);

    // 2. Xét từng khoảng nhỏ giữa 2 mốc chuyển đổi
    const subIntervals: SubIntervalStaffOvertime[] = [];

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const subStart = new Date(sortedBoundaries[i]);
      const subEnd = new Date(sortedBoundaries[i + 1]);
      const subDuration = Math.round((subEnd.getTime() - subStart.getTime()) / 60000);
      if (subDuration <= 0) continue;

      // Điểm giữa của khoảng để kiểm tra trạng thái
      const midPoint = new Date((subStart.getTime() + subEnd.getTime()) / 2);
      const calendarDateKey = formatDateKey(midPoint);
      const schedule = getScheduleForDate(midPoint, workingHours);

      // Xác định ngày của tua trực tương ứng
      const [startH, startM] = (schedule.morningFrom || '07:00').split(':').map(Number);
      const morningStartMinutes = (startH || 7) * 60 + (startM || 0);
      const midMinutes = midPoint.getHours() * 60 + midPoint.getMinutes();

      let dutyDateKey = calendarDateKey;
      let isPreviousDayShift = false;
      if (midMinutes < morningStartMinutes) {
        const prevDate = new Date(midPoint.getTime());
        prevDate.setDate(prevDate.getDate() - 1);
        dutyDateKey = formatDateKey(prevDate);
        isPreviousDayShift = true;
      }

      const dutyConfig = dutySchedules[dutyDateKey] || {
        date: dutyDateKey,
        isHoliday: isWeekend(dutyDateKey),
        onCallStaff: [],
      };

      const calendarConfig = dutySchedules[calendarDateKey] || {
        date: calendarDateKey,
        isHoliday: isWeekend(calendarDateKey),
        onCallStaff: [],
      };

      // Kiểm tra xem midPoint có nằm trong giờ hành chính của ngày dương lịch midPoint không
      const isCalendarHoliday = calendarConfig.isHoliday;
      let isInsideAdministrative = false;

      if (!isCalendarHoliday) {
        const [mFromH, mFromM] = (schedule.morningFrom || '07:00').split(':').map(Number);
        const [mToH, mToM] = (schedule.morningTo || '11:30').split(':').map(Number);
        const [aFromH, aFromM] = (schedule.afternoonFrom || '13:30').split(':').map(Number);
        const [aToH, aToM] = (schedule.afternoonTo || '17:00').split(':').map(Number);

        const morningFromMin = (mFromH || 7) * 60 + (mFromM || 0);
        const morningToMin = (mToH || 11) * 60 + (mToM || 30);
        const afternoonFromMin = (aFromH || 13) * 60 + (aFromM || 30);
        const afternoonToMin = (aToH || 17) * 60 + (aToM || 0);

        const inMorning = midMinutes >= morningFromMin && midMinutes < morningToMin;
        const inAfternoon = midMinutes >= afternoonFromMin && midMinutes < afternoonToMin;
        isInsideAdministrative = inMorning || inAfternoon;
      }

      // 3. Phân loại cho từng nhân viên trong khoảng thời gian này
      // Tách 2 nhóm: nhóm Kíp trực và nhóm Kíp mổ phiên
      const onCallOvertimeStaff: Partial<Record<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv', string>> = {};
      const regularOvertimeStaff: Partial<Record<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv', string>> = {};

      staffList.forEach(({ name, roleKey }) => {
        // Kiểm tra xem nhân viên này có trực trong tua trực dutyDateKey không
        const isOnCallDuty = (dutyConfig.onCallStaff || []).includes(name);

        // Trường hợp đặc biệt: Nếu midPoint >= morningStart (tức ca trực hôm trước đã hết),
        // kiểm tra xem nhân viên đó có được xếp trực tua trực hôm trước (ngày T) hay không
        const prevDate = new Date(midPoint.getTime());
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDutyDateKey = formatDateKey(prevDate);
        const prevDutyConfig = dutySchedules[prevDutyDateKey];
        const wasOnCallYesterday = prevDutyConfig && (prevDutyConfig.onCallStaff || []).includes(name);

        if (isOnCallDuty) {
          // Nhân viên đang trong ca trực của mình
          // Trong ca trực (từ 07:00 ngày T đến trước 07:00 ngày T+1): KHÔNG tính ngoài giờ
          return;
        }

        // Nếu ca mổ bắt đầu từ trong ca trực của nhân viên (ngày hôm trước) và kéo dài qua 07:00 sáng hôm sau
        if (wasOnCallYesterday && !isPreviousDayShift && midMinutes >= morningStartMinutes) {
          const surgeryStartedDuringDuty = rawStart.getTime() < new Date(midPoint.getFullYear(), midPoint.getMonth(), midPoint.getDate(), startH, startM).getTime();
          if (surgeryStartedDuringDuty) {
            // Đây là nhân viên trực kéo dài quá giờ giao ban -> Ngoài giờ: Kíp trực
            onCallOvertimeStaff[roleKey] = name;
            return;
          }
        }

        // Nhân viên KHÔNG trực:
        // Nếu rơi vào ngày nghỉ hoặc ngoài giờ hành chính -> Ngoài giờ: Kíp mổ phiên
        if (!isInsideAdministrative) {
          regularOvertimeStaff[roleKey] = name;
        }
      });

      // Thêm nhóm Kíp mổ phiên nếu có người làm ngoài giờ
      if (Object.keys(regularOvertimeStaff).length > 0) {
        subIntervals.push({
          staffMap: regularOvertimeStaff,
          ghiChu: 'Kíp mổ phiên',
          start: subStart,
          end: subEnd,
        });
      }

      // Thêm nhóm Kíp trực nếu có người trực làm kéo dài
      if (Object.keys(onCallOvertimeStaff).length > 0) {
        subIntervals.push({
          staffMap: onCallOvertimeStaff,
          ghiChu: 'Kíp trực',
          start: subStart,
          end: subEnd,
        });
      }
    }

    // 4. Nối các khoảng liền kề (Contiguous Merge) nếu có cùng nhân viên và cùng ghi chú
    if (subIntervals.length === 0) return;

    // Gom nhóm theo ghiChu và tập hợp nhân viên
    const areStaffMapsEqual = (
      a: Partial<Record<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv', string>>,
      b: Partial<Record<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc' | 'gv', string>>
    ) => {
      const keysA = Object.keys(a) as Array<keyof typeof a>;
      const keysB = Object.keys(b) as Array<keyof typeof b>;
      if (keysA.length !== keysB.length) return false;
      return keysA.every((k) => a[k] === b[k]);
    };

    const mergedIntervals: SubIntervalStaffOvertime[] = [];

    subIntervals.forEach((interval) => {
      const last = mergedIntervals[mergedIntervals.length - 1];
      if (
        last &&
        last.ghiChu === interval.ghiChu &&
        last.end.getTime() === interval.start.getTime() &&
        areStaffMapsEqual(last.staffMap, interval.staffMap)
      ) {
        // Nối liền khoảng
        last.end = interval.end;
      } else {
        mergedIntervals.push({ ...interval });
      }
    });

    // 5. Tạo dòng bảng OvertimeRecordRow cho từng khoảng thời gian ngoài giờ
    mergedIntervals.forEach((interval, idx) => {
      const durationMin = Math.round((interval.end.getTime() - interval.start.getTime()) / 60000);
      if (durationMin <= 0) return;

      const rowId = `${session.patientId || 'BN'}_${rawStart.getTime()}_${idx}_${interval.ghiChu}`;

      resultRows.push({
        id: rowId,
        patientId: session.patientId || '',
        patientName: session.patientName || '',
        tenKT: session.tenKT || '',
        ngayBD: formatFullDateTime(rawStart),
        ngayKT: formatFullDateTime(rawEnd),
        ptChinh: interval.staffMap.ptChinh || '',
        ptPhu: interval.staffMap.ptPhu || '',
        bsGM: interval.staffMap.bsGM || '',
        ktvGM: interval.staffMap.ktvGM || '',
        tdc: interval.staffMap.tdc || '',
        gv: interval.staffMap.gv || '',
        timeFrom: formatHHmm(interval.start),
        timeTo: formatHHmm(interval.end),
        durationText: formatDurationText(durationMin),
        durationMinutes: durationMin,
        ghiChu: interval.ghiChu,
        originalRecord: originalRecord,
      });
    });
  });

  // Sắp xếp theo ngày bắt đầu ca mổ, sau đó đến giờ ngoài giờ từ
  resultRows.sort((a, b) => {
    const timeA = a.originalRecord.start?.getTime() || 0;
    const timeB = b.originalRecord.start?.getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.timeFrom.localeCompare(b.timeFrom);
  });

  // Gán STT
  resultRows.forEach((row, idx) => {
    row.stt = idx + 1;
  });

  return resultRows;
}
