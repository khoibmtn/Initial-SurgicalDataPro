import React, { useState, useMemo, useRef } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Search,
  Users,
  Building2,
  HelpCircle,
  SunMedium,
  RotateCcw,
  Filter,
  X,
  ChevronDown,
  Columns3,
  CalendarRange,
  ArrowLeftToLine,
  ArrowRightToLine,
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
  // Bộ lọc
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Chế độ dành cho khoảng thời gian dài (> 31 ngày)
  const [viewMode, setViewMode] = useState<'standard' | 'compact'>('standard');
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [activeMonthKey, setActiveMonthKey] = useState<string>('');
  const tableContainerRef = useRef<HTMLDivElement>(null);

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

  // Điều kiện kích hoạt chế độ dài hạn
  const isLongPeriod = dutyDates.length > 31;
  const colWidth = isLongPeriod && viewMode === 'compact' ? 40 : 70;

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

  // 3. Danh sách các khoa xuất hiện trong danh sách nhân viên
  const availableDepartments = useMemo(() => {
    const configuredDepts = (config?.departments || []).filter(Boolean);
    const deptsInStaff = new Set<string>();
    staffList.forEach((s) => {
      if (s.department) deptsInStaff.add(s.department);
    });

    const ordered: string[] = [];
    configuredDepts.forEach((d) => {
      if (deptsInStaff.has(d)) {
        ordered.push(d);
        deptsInStaff.delete(d);
      }
    });

    Array.from(deptsInStaff)
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .forEach((d) => ordered.push(d));

    return ordered;
  }, [config?.departments, staffList]);

  // 4. Danh sách nhân viên trong dropdown (lọc theo khoa nếu đã chọn khoa)
  const availableStaff = useMemo(() => {
    let list = staffList;
    if (selectedDepartment !== 'ALL') {
      list = list.filter((s) => s.department === selectedDepartment);
    }
    return list.map((s) => s.name);
  }, [staffList, selectedDepartment]);

  // 5. Gom nhóm các ngày theo Tháng (Chỉ dùng khi khoảng thời gian > 31 ngày)
  const monthGroups = useMemo(() => {
    if (!isLongPeriod) return [];
    const map = new Map<string, string[]>();
    dutyDates.forEach((d) => {
      const mKey = d.substring(0, 7); // 'YYYY-MM'
      if (!map.has(mKey)) map.set(mKey, []);
      map.get(mKey)!.push(d);
    });

    let runningIndex = 0;
    const groups: Array<{
      monthKey: string;
      label: string;
      shortLabel: string;
      dates: string[];
      startIndex: number;
    }> = [];

    map.forEach((dates, monthKey) => {
      const [y, m] = monthKey.split('-');
      groups.push({
        monthKey,
        label: `Tháng ${m}/${y}`,
        shortLabel: `T${m}/${y.slice(2)}`,
        dates,
        startIndex: runningIndex,
      });
      runningIndex += dates.length;
    });

    return groups;
  }, [dutyDates, isLongPeriod]);

  // Các hàm điều hướng cuộn nhanh
  const scrollToMonth = (startIndex: number, monthKey: string) => {
    setActiveMonthKey(monthKey);
    if (!tableContainerRef.current) return;
    const scrollTarget = startIndex * colWidth;
    tableContainerRef.current.scrollTo({
      left: scrollTarget,
      behavior: 'smooth',
    });
  };

  const scrollToFirstDay = () => {
    tableContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    if (monthGroups.length > 0) setActiveMonthKey(monthGroups[0].monthKey);
  };

  const scrollToLastDay = () => {
    if (!tableContainerRef.current) return;
    tableContainerRef.current.scrollTo({
      left: tableContainerRef.current.scrollWidth,
      behavior: 'smooth',
    });
    if (monthGroups.length > 0) setActiveMonthKey(monthGroups[monthGroups.length - 1].monthKey);
  };

  const toggleDeptCollapse = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const handleDepartmentChange = (dept: string) => {
    setSelectedDepartment(dept);
    setSelectedStaff('ALL');
  };

  const isFiltered = selectedDepartment !== 'ALL' || selectedStaff !== 'ALL' || searchTerm.trim() !== '';

  const handleResetFilters = () => {
    setSelectedDepartment('ALL');
    setSelectedStaff('ALL');
    setSearchTerm('');
  };

  // 6. Lọc danh sách nhân viên theo các điều kiện bộ lọc
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      if (selectedDepartment !== 'ALL' && s.department !== selectedDepartment) {
        return false;
      }
      if (selectedStaff !== 'ALL' && s.name !== selectedStaff) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName = s.name.toLowerCase().includes(term);
        const matchesDept = s.department.toLowerCase().includes(term);
        if (!matchesName && !matchesDept) return false;
      }
      return true;
    });
  }, [staffList, selectedDepartment, selectedStaff, searchTerm]);

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
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 border-b border-gray-200 bg-gray-50/75">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <CalendarDays className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-gray-800 tracking-tight">BẢNG PHÂN CÔNG LỊCH TRỰC (TUA TRỰC 24H)</h3>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-100 text-blue-800 font-semibold">
                  {dutyDates.length} ngày
                </span>
                {isLongPeriod && monthGroups.length > 0 && (
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-200">
                    {monthGroups.length} tháng
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-100 text-slate-800 font-semibold">
                  {filteredStaff.length}/{staffList.length} nhân sự
                </span>
              </div>
              <p className="text-[10.5px] text-gray-500 flex items-center gap-1 mt-0.5">
                <SunMedium className="w-3 h-3 text-amber-500" />
                Tua trực 24h tính từ giờ hành chính sáng ngày T đến trước giờ hành chính sáng ngày T+1.
              </p>
            </div>
          </div>
        </div>

        {/* ── Bộ lọc & Thao tác ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút chuyển chế độ xem Siêu gọn / Chuẩn (Chỉ kích hoạt khi > 31 ngày) */}
          {isLongPeriod && (
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === 'standard' ? 'compact' : 'standard'))}
              title={viewMode === 'compact' ? 'Chuyển sang chế độ xem chuẩn (70px/cột)' : 'Chuyển sang chế độ xem siêu gọn (40px/cột)'}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Columns3 className="w-3 h-3" />
              <span>{viewMode === 'compact' ? 'Chuẩn (70px)' : 'Siêu gọn (40px)'}</span>
            </button>
          )}

          {/* Lọc theo Khoa */}
          <select
            value={selectedDepartment}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className={`px-2.5 py-1 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium ${
              selectedDepartment !== 'ALL'
                ? 'border-blue-400 text-blue-800 bg-blue-50/60 font-semibold'
                : 'border-gray-200 text-gray-700'
            }`}
          >
            <option value="ALL">Tất cả khoa ({availableDepartments.length})</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                Khoa {dept}
              </option>
            ))}
          </select>

          {/* Lọc theo Nhân viên */}
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className={`px-2.5 py-1 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[170px] font-medium ${
              selectedStaff !== 'ALL'
                ? 'border-blue-400 text-blue-800 bg-blue-50/60 font-semibold'
                : 'border-gray-200 text-gray-700'
            }`}
          >
            <option value="ALL">Tất cả nhân viên ({availableStaff.length})</option>
            {availableStaff.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Ô tìm kiếm nhanh */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm..."
              className="pl-7 pr-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-[120px]"
            />
          </div>

          {/* Nút Xóa bộ lọc khi đang lọc */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="Xóa tất cả bộ lọc"
              className="flex items-center gap-1 px-2 py-1 text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors font-medium cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Xóa lọc</span>
            </button>
          )}

          {/* Nút đặt lại ngày nghỉ */}
          <button
            type="button"
            onClick={handleResetHolidays}
            title="Đặt lại ngày nghỉ về mặc định (Chỉ T7, CN)"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-gray-500" />
            <span>Mặc định ngày nghỉ</span>
          </button>

          {/* Trạng thái lưu */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium select-none">
            <CheckCircle2 className={`w-3 h-3 text-emerald-600 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Đang lưu...' : 'Đã đồng bộ Firestore'}</span>
          </div>
        </div>
      </div>

      {/* ── Sub-bar: Thanh điều hướng Tháng nhanh (Chỉ xuất hiện khi > 31 ngày) ── */}
      {isLongPeriod && monthGroups.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-blue-50/70 border-b border-blue-200/80 text-xs select-none">
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 font-bold text-blue-900 text-[11px]">
              <CalendarRange className="w-3.5 h-3.5 text-blue-700" />
              <span>Nhảy nhanh tháng:</span>
            </span>
            <button
              type="button"
              onClick={scrollToFirstDay}
              title="Cuộn về ngày đầu kỳ"
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 transition-colors cursor-pointer"
            >
              <ArrowLeftToLine className="w-3 h-3" />
              <span>Đầu kỳ</span>
            </button>
          </div>

          {/* Month Pills list */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
            {monthGroups.map((g) => {
              const isActive = activeMonthKey === g.monthKey;
              return (
                <button
                  key={g.monthKey}
                  type="button"
                  onClick={() => scrollToMonth(g.startIndex, g.monthKey)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-xs scale-105 ring-2 ring-blue-300'
                      : 'bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 shadow-2xs'
                  }`}
                >
                  {g.label} <span className="text-[9.5px] opacity-80">({g.dates.length}n)</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={scrollToLastDay}
              title="Cuộn đến ngày cuối kỳ"
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 transition-colors cursor-pointer"
            >
              <span>Cuối kỳ</span>
              <ArrowRightToLine className="w-3 h-3" />
            </button>

            {availableDepartments.length > 1 && (
              <div className="flex items-center gap-1 pl-2 border-l border-blue-200">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedDepts((prev) =>
                      prev.size > 0 ? new Set() : new Set(availableDepartments)
                    )
                  }
                  className="text-[10.5px] font-medium text-blue-700 hover:text-blue-900 underline cursor-pointer"
                >
                  {collapsedDepts.size > 0 ? 'Mở rộng tất cả khoa' : 'Thu gọn tất cả khoa'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Matrix Table Container ── */}
      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto max-h-[calc(100vh-270px)] border-b border-gray-100"
      >
        <table className="w-full text-xs border-collapse">
          <colgroup>
            <col style={{ width: 150, minWidth: 150, maxWidth: 150 }} />
            <col style={{ width: 230, minWidth: 230, maxWidth: 230 }} />
            {dutyDates.map((dateKey) => (
              <col
                key={dateKey}
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              />
            ))}
          </colgroup>
          <thead>
            {/* Hàng 0: Header nhóm Tháng (Chỉ hiển thị khi khoảng thời gian > 31 ngày) */}
            {isLongPeriod && (
              <tr className="bg-[#002855] text-white select-none sticky top-0 z-30">
                <th
                  colSpan={2}
                  className="sticky left-0 z-35 bg-[#002244] px-2.5 py-1 text-left font-bold text-blue-200 text-[11px] border-r border-blue-900 shadow-[4px_0_6px_rgba(0,0,0,0.15)] uppercase tracking-wide"
                >
                  <div className="flex items-center justify-between">
                    <span>TOÀN KỲ: {dutyDates.length} NGÀY</span>
                    <span className="text-[10px] text-blue-300 font-normal">
                      {monthGroups.length} tháng
                    </span>
                  </div>
                </th>
                {monthGroups.map((g) => (
                  <th
                    key={g.monthKey}
                    colSpan={g.dates.length}
                    className="bg-[#002855] text-center font-bold text-white text-[11px] py-1 border-r border-blue-800 uppercase tracking-wide"
                  >
                    {g.label} ({g.dates.length} ngày)
                  </th>
                ))}
              </tr>
            )}

            {/* Hàng 1: Tiêu đề các ngày */}
            <tr
              className={`bg-[#003366] text-white select-none sticky z-20 ${
                isLongPeriod ? 'top-[26px]' : 'top-0'
              }`}
            >
              <th className="sticky left-0 z-30 bg-[#003366] px-2.5 py-1.5 text-left font-semibold w-[150px] min-w-[150px] max-w-[150px] border-r border-blue-900 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-blue-200" />
                  <span className="text-[11.5px]">Khoa / Phòng</span>
                </div>
              </th>
              <th className="sticky left-[150px] z-30 bg-[#003366] px-2.5 py-1.5 text-left font-semibold w-[230px] min-w-[230px] max-w-[230px] border-r border-blue-900 shadow-[4px_0_6px_rgba(0,0,0,0.15)]">
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-blue-200" />
                  <span className="text-[11.5px]">Họ và tên nhân viên</span>
                </div>
              </th>
              {dutyDates.map((dateKey) => {
                const dayOfWeek = getDayOfWeekLabel(dateKey);
                const isSunOrSat = dayOfWeek === 'T7' || dayOfWeek === 'CN';
                const curConfig = dutySchedules[dateKey];
                const isHoliday = curConfig ? curConfig.isHoliday : isWeekend(dateKey);
                const dayOnly = dateKey.split('-')[2];

                return (
                  <th
                    key={dateKey}
                    className={`px-1 py-1 text-center font-semibold border-r border-blue-900/60 ${
                      isHoliday ? 'bg-amber-700/80 text-amber-100' : ''
                    }`}
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[11px] font-bold leading-tight">
                        {isLongPeriod && viewMode === 'compact' ? dayOnly : formatDisplayDate(dateKey)}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0 rounded mt-0.5 font-semibold ${
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
            <tr
              className={`group bg-amber-50/90 border-b-2 border-amber-300 sticky z-10 select-none ${
                isLongPeriod ? 'top-[58px]' : 'top-[34px]'
              }`}
            >
              <td className="sticky left-0 z-25 bg-amber-100 group-hover:bg-amber-200 transition-colors px-2.5 py-1 text-left font-bold text-amber-900 border-r border-amber-300 w-[150px] min-w-[150px] max-w-[150px] shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                  <span className="text-[10.5px] uppercase font-extrabold text-amber-900 tracking-wide">
                    Cấu hình
                  </span>
                </div>
              </td>
              <td className="sticky left-[150px] z-25 bg-amber-100 group-hover:bg-amber-200 transition-colors px-2.5 py-1 text-left font-bold text-amber-900 border-r border-amber-300 w-[230px] min-w-[230px] max-w-[230px] shadow-[4px_0_6px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900 tracking-tight leading-tight">
                    Check dòng này những ngày nghỉ cuối tuần, Lễ, Tết
                  </span>
                </div>
              </td>
              {dutyDates.map((dateKey) => {
                const curConfig = dutySchedules[dateKey];
                const isHoliday = curConfig ? curConfig.isHoliday : isWeekend(dateKey);

                return (
                  <td
                    key={dateKey}
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    className={`px-1 py-0.5 text-center border-r transition-colors ${
                      isHoliday
                        ? 'bg-amber-200 text-amber-950 font-bold border-amber-300 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)] group-hover:bg-amber-300/90'
                        : 'bg-amber-50/50 border-amber-200 group-hover:bg-amber-100/90'
                    }`}
                  >
                    <label className="inline-flex items-center justify-center cursor-pointer p-0.5 rounded hover:bg-amber-300/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={isHoliday}
                        onChange={() => handleToggleHoliday(dateKey)}
                        className="w-3.5 h-3.5 rounded text-amber-600 border-amber-400 focus:ring-amber-500 cursor-pointer"
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
              const isDeptCollapsed = isLongPeriod && collapsedDepts.has(staff.department);

              // Tính tổng số buổi trực của nhân viên này trong danh sách ngày
              const dutyCount = dutyDates.reduce((cnt, d) => {
                const staffOnCall = dutySchedules[d]?.onCallStaff || [];
                return cnt + (staffOnCall.includes(staff.name) ? 1 : 0);
              }, 0);
              const hasAnyDuty = dutyCount > 0;

              // Màu nền đồng bộ cho toàn bộ dòng check
              const rowBgClass = hasAnyDuty ? 'bg-blue-50/45' : 'bg-white';
              const stickyBgClass = hasAnyDuty ? 'bg-[#f0f7ff]' : 'bg-white';

              return (
                <React.Fragment key={staff.name}>
                  {/* Dòng phân cách Khoa dạng Accordion (Chỉ kích hoạt khi > 31 ngày) */}
                  {isLongPeriod && isFirstOfDept && (
                    <tr className="bg-slate-100/95 border-y border-slate-300 select-none">
                      <td
                        colSpan={2 + dutyDates.length}
                        className="px-3 py-1 text-slate-800 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => toggleDeptCollapse(staff.department)}
                            className="flex items-center gap-1.5 text-slate-800 hover:text-blue-700 font-bold cursor-pointer"
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                                isDeptCollapsed ? '-rotate-90' : ''
                              }`}
                            />
                            <span>KHOA: {staff.department}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              ({staffList.filter((s) => s.department === staff.department).length} nhân sự)
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleDeptCollapse(staff.department)}
                            className="text-[10px] text-blue-700 hover:underline cursor-pointer"
                          >
                            {isDeptCollapsed ? 'Nhấn để mở rộng' : 'Thu gọn khoa này'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Ẩn hàng nhân viên nếu khoa đang bị thu gọn */}
                  {!isDeptCollapsed && (
                    <tr
                      className={`group transition-colors ${rowBgClass} ${
                        !isLongPeriod && isFirstOfDept && sIdx > 0 ? 'border-t-2 border-gray-300' : ''
                      }`}
                    >
                      {/* Cột 1: Tên Khoa */}
                      <td
                        className={`sticky left-0 z-10 ${stickyBgClass} group-hover:bg-blue-100/90 transition-colors px-2.5 py-1 text-gray-600 border-r border-gray-200 text-[11px] shadow-[2px_0_4px_rgba(0,0,0,0.04)] whitespace-nowrap w-[150px] min-w-[150px] max-w-[150px] truncate`}
                      >
                        {isFirstOfDept ? (
                          <span
                            className="font-bold text-gray-800 text-[11.5px] flex items-center gap-1 truncate"
                            title={staff.department}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                            <span className="truncate">{staff.department}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300 text-[10px] pl-3">↳</span>
                        )}
                      </td>

                      {/* Cột 2: Họ tên nhân viên */}
                      <td
                        className={`sticky left-[150px] z-10 ${stickyBgClass} group-hover:bg-blue-100/90 transition-colors px-2.5 py-1 font-medium text-gray-900 border-r border-gray-200 shadow-[4px_0_6px_rgba(0,0,0,0.06)] whitespace-nowrap w-[230px] min-w-[230px] max-w-[230px]`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className="font-semibold text-gray-800 hover:text-blue-700 cursor-default truncate text-[11.5px]"
                              title={staff.name}
                            >
                              {staff.name}
                            </span>
                            {hasAnyDuty && (
                              <span className="text-[9px] px-1 py-0.2 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                                trực {dutyCount}b
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] px-1 py-0.2 rounded font-mono text-gray-500 bg-gray-100 border border-gray-200 shrink-0">
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
                            style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                            className={`px-1 py-0.5 text-center border-r transition-colors ${
                              isOnCall
                                ? 'bg-blue-200 text-blue-950 font-bold border-blue-300 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)] group-hover:bg-blue-300/90 group-hover:border-blue-400'
                                : hasAnyDuty
                                ? 'bg-blue-50/25 border-gray-100 group-hover:bg-blue-100/70 group-hover:border-blue-200'
                                : isHol
                                ? 'bg-amber-50/25 border-gray-100 group-hover:bg-blue-100/70 group-hover:border-blue-200'
                                : 'border-gray-100 group-hover:bg-blue-100/70 group-hover:border-blue-200'
                            }`}
                          >
                            <label className="inline-flex items-center justify-center p-0.5 rounded cursor-pointer hover:bg-blue-300/50 transition-colors">
                              <input
                                type="checkbox"
                                checked={isOnCall}
                                onChange={() => handleToggleStaffOnCall(dateKey, staff.name)}
                                className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer Info ── */}
      <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-600 inline-block shrink-0"></span>
            <span>Check trực: Phân công trực 24h (từ 07:00 ngày T đến 06:59 ngày T+1)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block shrink-0"></span>
            <span>Check ngày nghỉ cuối tuần, Lễ, Tết: tính là ngoài giờ. Uncheck: Ngày làm việc hành chính</span>
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
