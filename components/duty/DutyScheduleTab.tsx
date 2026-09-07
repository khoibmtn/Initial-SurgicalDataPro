import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Search,
  Users,
  Building2,
  HelpCircle,
  SunMedium,
  RotateCcw,
} from 'lucide-react';
import { SurgeryRecord, DutyScheduleDateConfig } from '../../types';
import { AppConfig } from '../../contexts/ConfigContext';
import {
  formatDateKey,
  formatDisplayDate,
  getDayOfWeekLabel,
  getDutyDateKey,
  isWeekend,
} from '../../services/dutyScheduleService';
import { getScheduleForDate } from '../../services/overtimeCalculationService';

interface DutyScheduleTabProps {
  records: SurgeryRecord[];
  dutySchedules: Record<string, DutyScheduleDateConfig>;
  onUpdateDutySchedule: (dateKey: string, isHoliday: boolean, onCallStaff: string[]) => void;
  config: AppConfig;
  isSaving?: boolean;
}

interface StaffRowItem {
  name: string;
  department: string;
  derivedPos: string;
  deptWeight: number;
}

export const DutyScheduleTab: React.FC<DutyScheduleTabProps> = ({
  records,
  dutySchedules,
  onUpdateDutySchedule,
  config,
  isSaving = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Xác định danh sách các ngày cột (từ ngày trực sớm nhất đến ngày ca mổ kết thúc muộn nhất)
  const dutyDates = useMemo(() => {
    if (!records || records.length === 0) return [];

    let earliestDutyDateStr: string | null = null;
    let latestEndDate: Date | null = null;

    records.forEach((r) => {
      const start = r.start || (r.ngayBD ? new Date(r.ngayBD) : null);
      const end = r.end || (r.ngayKT ? new Date(r.ngayKT) : null);

      if (start && !isNaN(start.getTime())) {
        const schedule = getScheduleForDate(start, config?.workingHours);
        const dutyDateKey = getDutyDateKey(start, schedule.morningFrom || '07:00');
        if (!earliestDutyDateStr || dutyDateKey < earliestDutyDateStr) {
          earliestDutyDateStr = dutyDateKey;
        }
      }

      if (end && !isNaN(end.getTime())) {
        if (!latestEndDate || end.getTime() > latestEndDate.getTime()) {
          latestEndDate = end;
        }
      }
    });

    if (!earliestDutyDateStr) return [];

    const latestEndDateKey = latestEndDate ? formatDateKey(latestEndDate) : earliestDutyDateStr;
    const finalEndKey = latestEndDateKey >= earliestDutyDateStr ? latestEndDateKey : earliestDutyDateStr;

    // Tạo mảng ngày liên tục từ earliestDutyDateStr đến finalEndKey
    const dates: string[] = [];
    const [startYear, startMonth, startDay] = earliestDutyDateStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = finalEndKey.split('-').map(Number);

    const cursor = new Date(startYear, startMonth - 1, startDay);
    const stopDate = new Date(endYear, endMonth - 1, endDay);

    while (cursor.getTime() <= stopDate.getTime()) {
      dates.push(formatDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }, [records, config?.workingHours]);

  // 2. Trích xuất và sắp xếp danh sách nhân viên thực tế có mặt trong đợt báo cáo này
  const staffList = useMemo(() => {
    if (!records || records.length === 0) return [];

    const staffMap = new Map<string, StaffRowItem>();
    const configuredStaff = config?.staffList || [];
    const deptOrderMap = new Map<string, number>();
    (config?.departments || []).forEach((dept, idx) => deptOrderMap.set(dept, idx));

    const roleFields: Array<keyof SurgeryRecord> = ['ptChinh', 'ptPhu', 'bsGM', 'ktvGM', 'tdc', 'gv'];

    records.forEach((r) => {
      roleFields.forEach((rf) => {
        const rawName = (r[rf] || '').toString().trim();
        if (!rawName) return;

        if (!staffMap.has(rawName)) {
          // Tìm trong cấu hình danh mục nhân viên
          const cleanName = rawName.toLowerCase();
          const matched =
            configuredStaff.find((s) => s.name === rawName) ||
            configuredStaff.find((s) => s.name.trim().toLowerCase() === cleanName);

          const dept = matched?.department || 'Khác';
          const pos = matched?.position || (rf === 'ptChinh' || rf === 'ptPhu' ? 'BS PT' : rf === 'bsGM' ? 'BS GMHS' : 'Phụ');
          const deptWeight = deptOrderMap.get(dept) ?? 999;

          staffMap.set(rawName, {
            name: rawName,
            department: dept,
            derivedPos: pos,
            deptWeight,
          });
        }
      });
    });

    const list = Array.from(staffMap.values());

    // Sắp xếp: Khoa -> Chức danh -> Tên nhân viên (chuẩn Bảng thanh toán)
    list.sort((a, b) => {
      if (a.deptWeight !== b.deptWeight) {
        return a.deptWeight - b.deptWeight;
      }
      if (a.department !== b.department) {
        return (a.department || '').localeCompare(b.department || '', 'vi');
      }
      const posWeight: Record<string, number> = { 'BS PT': 1, 'BS GMHS': 2, 'Phụ': 3 };
      const wA = posWeight[a.derivedPos] || 99;
      const wB = posWeight[b.derivedPos] || 99;
      if (wA !== wB) return wA - wB;

      return a.name.localeCompare(b.name, 'vi');
    });

    return list;
  }, [records, config?.staffList, config?.departments]);

  // Lọc theo ô tìm kiếm
  const filteredStaff = useMemo(() => {
    if (!searchTerm.trim()) return staffList;
    const term = searchTerm.trim().toLowerCase();
    return staffList.filter(
      (s) => s.name.toLowerCase().includes(term) || s.department.toLowerCase().includes(term)
    );
  }, [staffList, searchTerm]);

  // Toggle ngày nghỉ
  const handleToggleHoliday = (dateKey: string) => {
    const current = dutySchedules[dateKey] || {
      date: dateKey,
      isHoliday: isWeekend(dateKey),
      onCallStaff: [],
    };
    const newIsHoliday = !current.isHoliday;
    onUpdateDutySchedule(dateKey, newIsHoliday, current.onCallStaff || []);
  };

  // Toggle trực của nhân viên
  const handleToggleStaffOnCall = (dateKey: string, staffName: string) => {
    const current = dutySchedules[dateKey] || {
      date: dateKey,
      isHoliday: isWeekend(dateKey),
      onCallStaff: [],
    };
    const staffSet = new Set(current.onCallStaff || []);
    if (staffSet.has(staffName)) {
      staffSet.delete(staffName);
    } else {
      staffSet.add(staffName);
    }
    onUpdateDutySchedule(dateKey, current.isHoliday, Array.from(staffSet));
  };

  // Reset tất cả ngày nghỉ về mặc định (T7, CN)
  const handleResetHolidays = () => {
    dutyDates.forEach((d) => {
      const current = dutySchedules[d] || {
        date: d,
        isHoliday: isWeekend(d),
        onCallStaff: [],
      };
      const defaultHol = isWeekend(d);
      if (current.isHoliday !== defaultHol) {
        onUpdateDutySchedule(d, defaultHol, current.onCallStaff || []);
      }
    });
  };

  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center">
        <CalendarDays className="w-10 h-10 text-gray-300 mb-2" />
        <p className="text-sm font-semibold text-gray-600">Chưa có dữ liệu ca phẫu thuật</p>
        <p className="text-xs text-gray-400 mt-1">Vui lòng import danh sách phẫu thuật hoặc tải dữ liệu từ kho lưu trữ để phân công lịch trực.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Top Bar / Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50/70">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-800">BẢNG PHÂN CÔNG LỊCH TRỰC (TUA TRỰC 24H)</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                  {dutyDates.length} ngày
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                  {staffList.length} nhân viên kíp mổ
                </span>
              </div>
              <p className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                <SunMedium className="w-3 h-3 text-amber-500" />
                Tua trực 24h tính từ giờ hành chính sáng ngày T đến trước giờ hành chính sáng ngày T+1.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Ô tìm kiếm nhân viên */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm nhân viên, khoa..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-[180px]"
            />
          </div>

          {/* Nút đặt lại ngày nghỉ */}
          <button
            type="button"
            onClick={handleResetHolidays}
            title="Đặt lại ngày nghỉ về mặc định (Chỉ T7, CN)"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
            <span>Mặc định ngày nghỉ</span>
          </button>

          {/* Trạng thái lưu */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium select-none">
            <CheckCircle2 className={`w-3.5 h-3.5 text-emerald-600 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Đang lưu Firestore...' : 'Đã đồng bộ Firestore'}</span>
          </div>
        </div>
      </div>

      {/* ── Matrix Table Container ── */}
      <div className="flex-1 overflow-auto max-h-[calc(100vh-280px)] border-b border-gray-100">
        <table className="w-full text-xs border-collapse">
          <thead>
            {/* Hàng 1: Tiêu đề các ngày */}
            <tr className="bg-[#003366] text-white select-none sticky top-0 z-20">
              <th className="sticky left-0 z-30 bg-[#003366] px-3 py-2.5 text-left font-semibold w-[180px] border-r border-blue-900 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-200" />
                  <span>Khoa / Phòng</span>
                </div>
              </th>
              <th className="sticky left-[180px] z-30 bg-[#003366] px-3 py-2.5 text-left font-semibold w-[220px] border-r border-blue-900 shadow-[4px_0_6px_rgba(0,0,0,0.15)]">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-200" />
                  <span>Họ và tên nhân viên</span>
                </div>
              </th>
              {dutyDates.map((dateKey) => {
                const dayOfWeek = getDayOfWeekLabel(dateKey);
                const isSunOrSat = dayOfWeek === 'T7' || dayOfWeek === 'CN';
                const curConfig = dutySchedules[dateKey];
                const isHoliday = curConfig ? curConfig.isHoliday : isWeekend(dateKey);

                return (
                  <th
                    key={dateKey}
                    className={`px-2.5 py-2 text-center font-semibold min-w-[76px] border-r border-blue-900/60 ${
                      isHoliday ? 'bg-amber-700/80 text-amber-100' : ''
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-xs font-bold">{formatDisplayDate(dateKey)}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded mt-0.5 font-semibold ${
                          isSunOrSat
                            ? 'bg-amber-400 text-gray-900'
                            : isHoliday
                            ? 'bg-red-400 text-white'
                            : 'bg-blue-800 text-blue-100'
                        }`}
                      >
                        {dayOfWeek}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* Hàng 2: Hàng cấu hình Ngày nghỉ / Lễ / Tết */}
            <tr className="bg-amber-50/90 border-b-2 border-amber-300 sticky top-[41px] z-10 select-none">
              <td
                colSpan={2}
                className="sticky left-0 z-25 bg-amber-100 px-3 py-2 text-left font-bold text-amber-900 border-r border-amber-300 shadow-[4px_0_6px_rgba(0,0,0,0.08)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                    <span className="text-xs uppercase font-extrabold text-amber-900 tracking-wide">
                      Ngày nghỉ / Lễ / Tết
                    </span>
                  </div>
                  <span className="text-[10px] font-normal text-amber-700 hidden lg:inline">
                    (Check: Nghỉ 100% ngoài giờ; Bỏ check: Làm bù hành chính)
                  </span>
                </div>
              </td>
              {dutyDates.map((dateKey) => {
                const curConfig = dutySchedules[dateKey];
                const isHoliday = curConfig ? curConfig.isHoliday : isWeekend(dateKey);

                return (
                  <td
                    key={dateKey}
                    className="px-2 py-2 text-center border-r border-amber-200 bg-amber-50"
                  >
                    <label className="inline-flex items-center justify-center cursor-pointer p-1 rounded hover:bg-amber-200/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={isHoliday}
                        onChange={() => handleToggleHoliday(dateKey)}
                        className="w-4 h-4 rounded text-amber-600 border-amber-300 focus:ring-amber-500 cursor-pointer"
                      />
                    </label>
                  </td>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredStaff.map((staff, sIdx) => {
              // Kiểm tra xem có bắt đầu nhóm khoa mới không
              const isFirstOfDept = sIdx === 0 || staff.department !== filteredStaff[sIdx - 1].department;

              return (
                <tr
                  key={staff.name}
                  className={`hover:bg-blue-50/40 transition-colors ${
                    isFirstOfDept && sIdx > 0 ? 'border-t-2 border-gray-300' : ''
                  }`}
                >
                  {/* Cột 1: Tên Khoa */}
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-gray-600 border-r border-gray-200 text-xs shadow-[2px_0_4px_rgba(0,0,0,0.04)] whitespace-nowrap">
                    {isFirstOfDept ? (
                      <span className="font-bold text-gray-800 text-xs flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        {staff.department}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px] pl-3">↳</span>
                    )}
                  </td>

                  {/* Cột 2: Họ tên nhân viên */}
                  <td className="sticky left-[180px] z-10 bg-white px-3 py-1.5 font-medium text-gray-900 border-r border-gray-200 shadow-[4px_0_6px_rgba(0,0,0,0.06)] whitespace-nowrap">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-800 hover:text-blue-700 cursor-default">
                        {staff.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-gray-500 bg-gray-100 border border-gray-200">
                        {staff.derivedPos}
                      </span>
                    </div>
                  </td>

                  {/* Cột 3..N: Checkbox trực cho từng ngày */}
                  {dutyDates.map((dateKey) => {
                    const curConfig = dutySchedules[dateKey];
                    const onCallList = curConfig ? curConfig.onCallStaff || [] : [];
                    const isOnCall = onCallList.includes(staff.name);
                    const isHol = curConfig ? curConfig.isHoliday : isWeekend(dateKey);

                    return (
                      <td
                        key={dateKey}
                        className={`px-2 py-1.5 text-center border-r border-gray-100 transition-colors ${
                          isOnCall
                            ? 'bg-blue-50/80 font-bold'
                            : isHol
                            ? 'bg-amber-50/30'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <label className="inline-flex items-center justify-center p-1 rounded cursor-pointer hover:bg-blue-100/70 transition-colors">
                          <input
                            type="checkbox"
                            checked={isOnCall}
                            onChange={() => handleToggleStaffOnCall(dateKey, staff.name)}
                            className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer Info ── */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-600 inline-block"></span>
            <span>Check trực: Phân công trực 24h (từ 07:00 ngày T đến 06:59 ngày T+1)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block"></span>
            <span>Check ngày nghỉ: Toàn bộ ca mổ trong ngày tính ngoài giờ</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-gray-400 italic">
          <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
          <span>Mọi thay đổi trên bảng này tự động lưu và cập nhật ngay lập tức sang tab Ngoài giờ.</span>
        </div>
      </div>
    </div>
  );
};
