/**
 * Overtime Report Data Service
 * Xử lý chuẩn hóa, gom nhóm và định dạng dữ liệu cho Bản in và Xuất DOCX "Giấy báo làm việc ngoài giờ".
 */

import { OvertimeRecordRow, SurgeryRecord } from '../types';
import { AppConfig } from '../contexts/ConfigContext';

export type OvertimeDurationFormat = '01h45' | '01h45p' | '01h45ph' | '01:45';

export interface OvertimeSurgeryItem {
  id: string;
  surgeryName: string;
  dateText: string;        // e.g. "4/8"
  timeFromText: string;    // e.g. "12h35"
  timeToText: string;      // e.g. "13h30"
  durationMinutes: number;
  durationText: string;    // e.g. "00h55"
  rawTimestamp: number;    // timestamp để sắp xếp theo thời gian
}

export interface OvertimeStaffBlock {
  stt: number;             // STT nhân viên trong khoa (1, 2, 3...)
  staffName: string;
  department: string;
  surgeries: OvertimeSurgeryItem[];
  totalMinutes: number;
  totalDurationText: string; // e.g. "04h15"
}

export interface OvertimeDepartmentBlock {
  deptCode: string;          // e.g. "GMHS", "Ngoại TH"
  deptFullName: string;      // e.g. "Phẫu thuật - Gây mê hồi sức"
  staffBlocks: OvertimeStaffBlock[];
  totalMinutes: number;
  totalDurationText: string;
}

export interface OvertimeReportGroupedData {
  departmentBlocks: OvertimeDepartmentBlock[];
  isAllDepartments: boolean;
  selectedDepartment: string;
  selectedStaff: string;
  reportTitle: string;
  departmentHeaderName: string; // Tên khoa đầy đủ ở phần tiêu đề trang
  hospitalName: string;
  dateRangeText: string;
  durationFormat: OvertimeDurationFormat;
  showTotalRow: boolean;
}

/**
 * Định dạng thời lượng (phút) theo mẫu cài đặt của người dùng
 * - '01h45': 01h45
 * - '01h45p': 01h45p
 * - '01h45ph': 01h45ph
 * - '01:45': 01:45
 */
export function formatOvertimeDuration(minutes: number, format: OvertimeDurationFormat = '01h45'): string {
  const safeMin = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');

  switch (format) {
    case '01h45p':
      return `${hh}h${mm}p`;
    case '01h45ph':
      return `${hh}h${mm}ph`;
    case '01:45':
      return `${hh}:${mm}`;
    case '01h45':
    default:
      return `${hh}h${mm}`;
  }
}

/**
 * Định dạng giờ vào/ra (VD: "12:35" -> "12h35", "07:00" -> "7h")
 */
export function formatTimeSlot(timeStr: string): string {
  if (!timeStr) return '';
  const cleaned = timeStr.trim().replace('h', ':');
  const parts = cleaned.split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h)) return timeStr;
  if (isNaN(m) || m === 0) return `${h}h`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${h}h${mStr}`;
}

/**
 * Định dạng ngày dạng d/m (VD: "04/08/2026" -> "4/8")
 */
export function formatDateDayMonth(dateStr: string, originalRecord?: SurgeryRecord): string {
  if (originalRecord?.start instanceof Date && !isNaN(originalRecord.start.getTime())) {
    return `${originalRecord.start.getDate()}/${originalRecord.start.getMonth() + 1}`;
  }
  if (dateStr) {
    const datePart = dateStr.trim().split(' ')[0];
    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      if (parts.length >= 2) {
        return `${parseInt(parts[0], 10)}/${parseInt(parts[1], 10)}`;
      }
    }
    if (datePart.includes('-')) {
      const parts = datePart.split('-');
      if (parts.length >= 3) {
        return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
      }
    }
  }
  return '';
}

/**
 * Chuyển chuỗi ngày và giờ thành timestamp để sắp xếp theo thời gian tăng dần
 */
function getTimestampFromRow(row: OvertimeRecordRow): number {
  if (row.originalRecord?.start instanceof Date && !isNaN(row.originalRecord.start.getTime())) {
    return row.originalRecord.start.getTime();
  }
  if (row.ngayBD) {
    const parts = row.ngayBD.trim().split(' ');
    const datePart = parts[0];
    const timePart = row.timeFrom || parts[1] || '00:00';
    if (datePart.includes('/')) {
      const [d, m, y] = datePart.split('/').map(Number);
      const [hh, mm] = timePart.replace('h', ':').split(':').map(Number);
      return new Date(y || 2026, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime();
    }
  }
  return 0;
}

/**
 * Gom nhóm dữ liệu ngoài giờ theo Khoa -> Nhân viên -> Ca mổ
 */
export function groupOvertimeDataForReport(
  rows: OvertimeRecordRow[],
  config: AppConfig,
  selectedDepartment: string = 'ALL',
  selectedStaff: string = 'ALL',
  includeGV: boolean = false,
  durationFormat: OvertimeDurationFormat = '01h45',
  showTotalRow: boolean = true,
  dateRangeText?: string
): OvertimeReportGroupedData {
  // 1. Bản đồ nhân viên -> Khoa
  const staffDeptMap = new Map<string, string>();
  (config?.staffList || []).forEach((s) => {
    if (s.name) {
      const trimmed = s.name.trim();
      const dept = (s.department || '').trim();
      if (dept) {
        staffDeptMap.set(trimmed, dept);
        staffDeptMap.set(trimmed.toLowerCase(), dept);
      }
    }
  });

  const getStaffDept = (name: string): string => {
    if (!name) return '';
    const trimmed = name.trim();
    return staffDeptMap.get(trimmed) || staffDeptMap.get(trimmed.toLowerCase()) || '';
  };

  // 2. Thu thập các ca mổ theo từng nhân viên
  const staffSurgeriesMap = new Map<string, OvertimeSurgeryItem[]>();

  rows.forEach((row) => {
    const participants: string[] = [];
    if (row.ptChinh) participants.push(row.ptChinh.trim());
    if (row.ptPhu) participants.push(row.ptPhu.trim());
    if (row.bsGM) participants.push(row.bsGM.trim());
    if (row.ktvGM) participants.push(row.ktvGM.trim());
    if (row.tdc) participants.push(row.tdc.trim());
    if (includeGV && row.gv) participants.push(row.gv.trim());

    // Loại bỏ trùng lặp nếu 1 nhân viên vô tình xuất hiện 2 lần trong 1 ca
    const uniqueParticipants = Array.from(new Set(participants));

    const item: OvertimeSurgeryItem = {
      id: row.id,
      surgeryName: row.tenKT || 'Phẫu thuật/Thủ thuật',
      dateText: formatDateDayMonth(row.ngayBD, row.originalRecord),
      timeFromText: formatTimeSlot(row.timeFrom),
      timeToText: formatTimeSlot(row.timeTo),
      durationMinutes: row.durationMinutes || 0,
      durationText: formatOvertimeDuration(row.durationMinutes || 0, durationFormat),
      rawTimestamp: getTimestampFromRow(row),
    };

    uniqueParticipants.forEach((staffName) => {
      if (!staffName) return;
      if (!staffSurgeriesMap.has(staffName)) {
        staffSurgeriesMap.set(staffName, []);
      }
      staffSurgeriesMap.get(staffName)!.push({ ...item });
    });
  });

  // 3. Sắp xếp các ca mổ của từng nhân viên theo trình tự thời gian tăng dần
  staffSurgeriesMap.forEach((surgeries) => {
    surgeries.sort((a, b) => a.rawTimestamp - b.rawTimestamp || a.surgeryName.localeCompare(b.surgeryName, 'vi'));
  });

  // 4. Gom nhân viên vào từng Khoa
  // Danh mục thứ tự khoa chuẩn từ cấu hình
  const configuredDepts = (config?.departments || []).filter(Boolean);
  const deptStaffMap = new Map<string, string[]>();

  staffSurgeriesMap.forEach((_, staffName) => {
    // Lọc theo selectedStaff nếu có
    if (selectedStaff !== 'ALL' && staffName !== selectedStaff) {
      return;
    }

    const dept = getStaffDept(staffName) || 'Khác';

    // Lọc theo selectedDepartment nếu có
    if (selectedDepartment !== 'ALL' && dept !== selectedDepartment) {
      return;
    }

    if (!deptStaffMap.has(dept)) {
      deptStaffMap.set(dept, []);
    }
    deptStaffMap.get(dept)!.push(staffName);
  });

  // 5. Xác định thứ tự các khoa xuất hiện
  const orderedDepts: string[] = [];
  if (selectedDepartment !== 'ALL') {
    if (deptStaffMap.has(selectedDepartment)) {
      orderedDepts.push(selectedDepartment);
    }
  } else {
    // Quét theo thứ tự config.departments
    configuredDepts.forEach((dept) => {
      if (deptStaffMap.has(dept)) {
        orderedDepts.push(dept);
      }
    });
    // Bổ sung các khoa khác nếu có nhân viên mà không nằm trong config.departments
    deptStaffMap.forEach((_, dept) => {
      if (!orderedDepts.includes(dept)) {
        orderedDepts.push(dept);
      }
    });
  }

  // 6. Xếp thứ tự nhân viên trong từng khoa theo config.staffList
  const staffListOrder = new Map<string, number>();
  (config?.staffList || []).forEach((s, idx) => {
    if (s.name) {
      staffListOrder.set(s.name.trim(), idx);
      staffListOrder.set(s.name.trim().toLowerCase(), idx);
    }
  });

  const departmentBlocks: OvertimeDepartmentBlock[] = [];

  orderedDepts.forEach((deptCode) => {
    const staffNames = deptStaffMap.get(deptCode) || [];
    // Sắp xếp nhân viên trong khoa theo thứ tự bảng thanh toán/lịch trực
    staffNames.sort((a, b) => {
      const orderA = staffListOrder.has(a) ? staffListOrder.get(a)! : 999999;
      const orderB = staffListOrder.has(b) ? staffListOrder.get(b)! : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'vi');
    });

    const staffBlocks: OvertimeStaffBlock[] = [];
    let deptTotalMinutes = 0;

    staffNames.forEach((staffName, staffIndex) => {
      const surgeries = staffSurgeriesMap.get(staffName) || [];
      const staffTotalMinutes = surgeries.reduce((sum, s) => sum + s.durationMinutes, 0);
      deptTotalMinutes += staffTotalMinutes;

      staffBlocks.push({
        stt: staffIndex + 1, // STT bắt đầu từ 1 cho từng khoa
        staffName,
        department: deptCode,
        surgeries,
        totalMinutes: staffTotalMinutes,
        totalDurationText: formatOvertimeDuration(staffTotalMinutes, durationFormat),
      });
    });

    const deptFullName = config?.departmentDetails?.[deptCode]?.fullName || deptCode;

    departmentBlocks.push({
      deptCode,
      deptFullName,
      staffBlocks,
      totalMinutes: deptTotalMinutes,
      totalDurationText: formatOvertimeDuration(deptTotalMinutes, durationFormat),
    });
  });

  // 7. Xác định tên khoa trên tiêu đề trang
  let departmentHeaderName = '';
  if (selectedDepartment === 'ALL') {
    const gmhsFullName = config?.departmentDetails?.['GMHS']?.fullName || 'Phẫu thuật - Gây mê hồi sức';
    departmentHeaderName = `KHOA ${gmhsFullName.toUpperCase()}`;
  } else {
    const deptFullName = config?.departmentDetails?.[selectedDepartment]?.fullName || selectedDepartment;
    departmentHeaderName = `KHOA ${deptFullName.toUpperCase()}`;
  }

  const hospitalName = (config?.hospitalName || 'TRUNG TÂM Y TẾ THỦY NGUYÊN').toUpperCase();

  return {
    departmentBlocks,
    isAllDepartments: selectedDepartment === 'ALL',
    selectedDepartment,
    selectedStaff,
    reportTitle: 'GIẤY BÁO LÀM VIỆC NGOÀI GIỜ',
    departmentHeaderName,
    hospitalName,
    dateRangeText: dateRangeText || '',
    durationFormat,
    showTotalRow,
  };
}
