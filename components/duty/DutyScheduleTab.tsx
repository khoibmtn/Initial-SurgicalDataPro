import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CalendarDays,
  Search,
  Users,
  Building2,
  HelpCircle,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  CalendarRange,
  ArrowLeftToLine,
  ArrowRightToLine,
  Sparkles,
  Check,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  dateRangeText?: string;
  onMonthSelect?: (monthKey: string) => void;
}

interface StaffRowItem {
  name: string;
  department: string;
  derivedPos: string;
  deptWeight: number;
}

// Hàm trích xuất ngày bắt đầu và kết thúc từ chuỗi khoảng thời gian báo cáo (nếu có)
function parseDateRange(text?: string): { startKey?: string; endKey?: string } {
  if (!text) return {};
  // 1. Khớp định dạng ngày kiểu Việt Nam: DD/MM/YYYY hoặc D/M/YYYY
  const dmyMatches = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g);
  if (dmyMatches && dmyMatches.length >= 2) {
    const [d1, m1, y1] = dmyMatches[0].split('/').map(Number);
    const [d2, m2, y2] = dmyMatches[1].split('/').map(Number);
    const startKey = `${y1}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
    const endKey = `${y2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
    return { startKey, endKey };
  }
  // 2. Khớp định dạng ngày kiểu ISO: YYYY-MM-DD
  const ymdMatches = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/g);
  if (ymdMatches && ymdMatches.length >= 2) {
    return { startKey: ymdMatches[0], endKey: ymdMatches[1] };
  }
  return {};
}

export const DutyScheduleTab: React.FC<DutyScheduleTabProps> = ({
  records,
  dutySchedules,
  onUpdateDutySchedule,
  config,
  isSaving = false,
  dateRangeText,
  onMonthSelect,
}) => {
  // Bộ lọc
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Chế độ dành cho khoảng thời gian dài (> 31 ngày)
  const [viewMode, setViewMode] = useState<'standard' | 'compact'>('standard');
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [activeMonthKey, setActiveMonthKey] = useState<string>('');
  const [focusedMonthKey, setFocusedMonthKey] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Popover state cho dropdown Năm và Tháng (Custom UI/UX Pro Max, loại bỏ hoàn toàn lỗi double arrow)
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setIsYearOpen(false);
      }
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setIsMonthOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Xác định danh sách các ngày cột (từ ngày bắt đầu đến ngày kết thúc của kỳ báo cáo)
  const dutyDates = useMemo(() => {
    const { startKey: queryStartKey, endKey: queryEndKey } = parseDateRange(dateRangeText);

    let earliestDutyDateStr: string | null = queryStartKey || null;
    let latestEndDate: Date | null = queryEndKey
      ? new Date(
          Number(queryEndKey.split('-')[0]),
          Number(queryEndKey.split('-')[1]) - 1,
          Number(queryEndKey.split('-')[2])
        )
      : null;

    (records || []).forEach((r) => {
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
  }, [records, config?.workingHours, dateRangeText]);

  // Điều kiện kích hoạt chế độ dài hạn
  const isLongPeriod = dutyDates.length > 31;
  const colWidth = isLongPeriod && viewMode === 'compact' ? 38 : 70;

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

  // Mặc định khi ở chế độ dài hạn (> 31 ngày) là thu gọn tất cả các khoa khi load
  const prevDutyDatesLengthRef = useRef<number>(0);

  useEffect(() => {
    if (isLongPeriod && availableDepartments.length > 0) {
      if (prevDutyDatesLengthRef.current !== dutyDates.length) {
        setCollapsedDepts(new Set(availableDepartments));
        prevDutyDatesLengthRef.current = dutyDates.length;
      }
    } else if (!isLongPeriod) {
      if (prevDutyDatesLengthRef.current !== dutyDates.length) {
        setCollapsedDepts(new Set());
        prevDutyDatesLengthRef.current = dutyDates.length;
      }
    }
  }, [isLongPeriod, availableDepartments, dutyDates.length]);

  // Mặc định chọn tháng đầu tiên khi load ở chế độ dài hạn
  useEffect(() => {
    if (isLongPeriod && monthGroups.length > 0) {
      if (!activeMonthKey || !monthGroups.some((g) => g.monthKey === activeMonthKey)) {
        setActiveMonthKey(monthGroups[0].monthKey);
      }
    }
  }, [isLongPeriod, monthGroups, activeMonthKey]);

  // Danh sách các Năm có trong đợt báo cáo
  const yearList = useMemo(() => {
    const years = new Set<string>();
    monthGroups.forEach((g) => {
      const y = g.monthKey.split('-')[0];
      years.add(y);
    });
    return Array.from(years).sort();
  }, [monthGroups]);

  // Năm hiện tại đang được chọn (tính từ activeMonthKey)
  const selectedYear = useMemo(() => {
    if (activeMonthKey) return activeMonthKey.split('-')[0];
    return yearList.length > 0 ? yearList[0] : '';
  }, [activeMonthKey, yearList]);

  // Danh sách các tháng thuộc Năm đang chọn
  const monthsInSelectedYear = useMemo(() => {
    if (!selectedYear) return monthGroups;
    return monthGroups.filter((g) => g.monthKey.startsWith(selectedYear));
  }, [monthGroups, selectedYear]);

  // Vị trí chỉ số tháng hiện tại trong danh sách toàn bộ các tháng
  const currentMonthIdx = useMemo(() => {
    if (!activeMonthKey || monthGroups.length === 0) return 0;
    const idx = monthGroups.findIndex((g) => g.monthKey === activeMonthKey);
    return idx >= 0 ? idx : 0;
  }, [activeMonthKey, monthGroups]);

  const canPrevMonth = currentMonthIdx > 0;
  const canNextMonth = currentMonthIdx < monthGroups.length - 1;

  // Khi ở chế độ khoảng thời gian dài (> 31 ngày), chỉ render các cột ngày của tháng đang chọn
  // Giúp DOM giảm từ 1000+ cột xuống 28-31 cột, thao tác 60 FPS siêu mượt
  const displayedDates = useMemo(() => {
    if (!isLongPeriod || !activeMonthKey) return dutyDates;
    const filtered = dutyDates.filter((d) => d.startsWith(activeMonthKey));
    return filtered.length > 0 ? filtered : dutyDates;
  }, [dutyDates, isLongPeriod, activeMonthKey]);

  const activeMonthGroup = useMemo(() => {
    if (!activeMonthKey) return null;
    return monthGroups.find((g) => g.monthKey === activeMonthKey) || null;
  }, [monthGroups, activeMonthKey]);

  // Tính toán động mốc thời gian tua trực 24h theo cấu hình mùa (Hè/Thu vs Đông/Xuân)
  // Nếu trong tháng hoặc khoảng thời gian hiển thị có 2 cấu hình (ví dụ chuyển mùa giữa tháng)
  // thì liệt kê chi tiết từng mốc theo khoảng thời gian tương ứng.
  const dutyShiftNote = useMemo(() => {
    if (!displayedDates || displayedDates.length === 0) {
      return '(từ 07:00 ngày T đến 06:59 ngày T+1)';
    }

    interface DutyShiftSegment {
      startDate: string;
      endDate: string;
      morningFrom: string;
      startShift: string;
      endShift: string;
    }

    const segments: DutyShiftSegment[] = [];

    displayedDates.forEach((d) => {
      const parts = d.split('-').map(Number);
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
      const sched = getScheduleForDate(dateObj, config?.workingHours);
      const morningFrom = sched?.morningFrom || '07:00';

      const [h, m] = morningFrom.split(':').map(Number);
      let endH = isNaN(h) ? 6 : h;
      let endM = (isNaN(m) ? 0 : m) - 1;
      if (endM < 0) {
        endM = 59;
        endH = (endH - 1 + 24) % 24;
      }
      const endShift = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      const lastSeg = segments[segments.length - 1];
      if (lastSeg && lastSeg.morningFrom === morningFrom) {
        lastSeg.endDate = d;
      } else {
        segments.push({
          startDate: d,
          endDate: d,
          morningFrom,
          startShift: morningFrom,
          endShift,
        });
      }
    });

    if (segments.length === 1) {
      const seg = segments[0];
      return `(từ ${seg.startShift} ngày T đến ${seg.endShift} ngày T+1)`;
    }

    // Nếu có từ 2 cấu hình trở lên trong khoảng thời gian hiển thị (ví dụ chuyển mùa giữa tháng)
    const formattedSegments = segments.map((seg) => {
      const fromText = formatDisplayDate(seg.startDate);
      const toText = formatDisplayDate(seg.endDate);
      const rangeText = seg.startDate === seg.endDate
        ? `ngày ${fromText}`
        : `từ ${fromText} đến ${toText}`;
      return `${rangeText}: từ ${seg.startShift} ngày T đến ${seg.endShift} ngày T+1`;
    });

    return `(${formattedSegments.join('; ')})`;
  }, [displayedDates, config?.workingHours]);

  // Ngày hôm nay (nếu nằm trong khoảng ngày báo cáo)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const isTodayInRange = useMemo(() => dutyDates.includes(todayStr), [dutyDates, todayStr]);

  // Hàm chuyển tháng mượt mà, đồng thời reset cuộn ngang về đầu tháng và báo callback lên parent
  const switchMonth = (monthKey: string) => {
    setActiveMonthKey(monthKey);
    setFocusedMonthKey(monthKey);
    setTimeout(() => setFocusedMonthKey(null), 1800);

    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = 0;
    }
    onMonthSelect?.(monthKey);
  };

  const handleYearChange = (newYear: string) => {
    const target = monthGroups.find((g) => g.monthKey.startsWith(newYear));
    if (target) {
      switchMonth(target.monthKey);
    }
  };

  const handleMonthChange = (newMonthKey: string) => {
    switchMonth(newMonthKey);
  };

  const handlePrevMonth = () => {
    if (canPrevMonth) {
      const prevG = monthGroups[currentMonthIdx - 1];
      switchMonth(prevG.monthKey);
    }
  };

  const handleNextMonth = () => {
    if (canNextMonth) {
      const nextG = monthGroups[currentMonthIdx + 1];
      switchMonth(nextG.monthKey);
    }
  };

  const scrollToFirstDay = () => {
    if (monthGroups.length > 0) {
      switchMonth(monthGroups[0].monthKey);
    }
  };

  const scrollToLastDay = () => {
    if (monthGroups.length > 0) {
      switchMonth(monthGroups[monthGroups.length - 1].monthKey);
    }
  };

  const scrollToToday = () => {
    const todayMonth = todayStr.substring(0, 7);
    if (monthGroups.some((g) => g.monthKey === todayMonth)) {
      switchMonth(todayMonth);
      setTimeout(() => {
        const idx = displayedDates.indexOf(todayStr);
        if (idx !== -1 && tableContainerRef.current) {
          tableContainerRef.current.scrollTo({ left: idx * colWidth, behavior: 'smooth' });
        }
      }, 60);
    }
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

  // Tự động đánh dấu T7, CN và các ngày Lễ Việt Nam là ngày nghỉ (Batch Schedule Utility)
  const handleAutoFillWeekendsAndHolidays = () => {
    dutyDates.forEach((d) => {
      const current = dutySchedules[d] || {
        date: d,
        isHoliday: isWeekend(d),
        onCallStaff: [],
      };
      const parts = d.split('-');
      const md = `${parts[1]}-${parts[2]}`;
      const isFixedHoliday = ['01-01', '04-30', '05-01', '09-02'].includes(md);
      const shouldBeHoliday = isWeekend(d) || isFixedHoliday;
      if (!current.isHoliday && shouldBeHoliday) {
        onUpdateDutySchedule(d, true, current.onCallStaff || []);
      }
    });
  };

  // Cấu trúc phẳng phục vụ ảo hóa DOM (Giai đoạn 3: @tanstack/react-virtual)
  type DisplayItem =
    | {
        type: 'dept';
        id: string;
        department: string;
        staffCount: number;
        isCollapsed: boolean;
      }
    | {
        type: 'staff';
        id: string;
        staff: StaffRowItem;
        isFirstOfDept: boolean;
        dutyCount: number;
        hasAnyDuty: boolean;
      };

  const displayItems = useMemo<DisplayItem[]>(() => {
    if (!isLongPeriod) return [];
    const items: DisplayItem[] = [];
    let currentDept = '';

    filteredStaff.forEach((staff, sIdx) => {
      const isFirstOfDept = sIdx === 0 || staff.department !== filteredStaff[sIdx - 1].department;
      if (isFirstOfDept) {
        currentDept = staff.department;
        const deptStaffCount = staffList.filter((s) => s.department === currentDept).length;
        const isCollapsed = collapsedDepts.has(currentDept);
        items.push({
          type: 'dept',
          id: `dept-${currentDept}`,
          department: currentDept,
          staffCount: deptStaffCount,
          isCollapsed,
        });
      }
      if (!collapsedDepts.has(currentDept)) {
        const dutyCount = displayedDates.reduce((cnt, d) => {
          const staffOnCall = dutySchedules[d]?.onCallStaff || [];
          return cnt + (staffOnCall.includes(staff.name) ? 1 : 0);
        }, 0);
        items.push({
          type: 'staff',
          id: `staff-${staff.name}`,
          staff,
          isFirstOfDept,
          dutyCount,
          hasAnyDuty: dutyCount > 0,
        });
      }
    });

    return items;
  }, [filteredStaff, staffList, collapsedDepts, displayedDates, dutySchedules, isLongPeriod]);

  // Hook ảo hóa hàng của @tanstack/react-virtual
  const rowVirtualizer = useVirtualizer({
    count: isLongPeriod ? displayItems.length : 0,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => (displayItems[index]?.type === 'dept' ? 28 : 31),
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalVirtualSize - virtualRows[virtualRows.length - 1].end : 0;

  // Fixed heights and sticky top offsets for header rows
  const headerRow0Height = 26;
  const headerRow1Height = 36;
  const headerRow1Top = isLongPeriod ? headerRow0Height : 0;
  const headerRow2Top = isLongPeriod ? headerRow0Height + headerRow1Height : headerRow1Height;

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
              title={viewMode === 'compact' ? 'Chuyển sang chế độ xem chuẩn (70px/cột)' : 'Chuyển sang chế độ xem siêu gọn (38px/cột)'}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Columns3 className="w-3 h-3" />
              <span>{viewMode === 'compact' ? 'Chuẩn (70px)' : 'Siêu gọn (38px)'}</span>
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
        </div>
      </div>

      {/* ── Sub-bar: Thanh điều hướng Tháng gọn UI/UX Pro Max (Chỉ xuất hiện khi > 31 ngày) ── */}
      {isLongPeriod && monthGroups.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-slate-50 border-b border-slate-200/80 text-xs select-none">
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <span className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
              <CalendarRange className="w-3.5 h-3.5 text-blue-600" />
              <span>Điều hướng tháng:</span>
            </span>

            {/* Cụm điều khiển phân đoạn: [Đầu kỳ] [Lùi] | [Năm] | [Tháng] | [Tiến] [Cuối kỳ] */}
            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
              {/* Button Đầu kỳ */}
              <button
                type="button"
                onClick={scrollToFirstDay}
                disabled={!canPrevMonth}
                title="Về tháng đầu kỳ"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-white rounded-md disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ArrowLeftToLine className="w-3 h-3" />
                <span className="hidden sm:inline text-[11px]">Đầu kỳ</span>
              </button>

              {/* Button Chuyển lùi 1 tháng */}
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={!canPrevMonth}
                title="Lùi 1 tháng"
                className="p-1 px-1.5 text-slate-700 hover:text-blue-700 hover:bg-white rounded-md disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-px bg-slate-200 mx-0.5" />

              {/* Popover Chọn Năm */}
              <div className="relative" ref={yearDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsYearOpen((prev) => !prev);
                    setIsMonthOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    isYearOpen
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-800 hover:bg-white hover:text-blue-700'
                  }`}
                  title="Chọn Năm để điều hướng"
                >
                  <span
                    className={`text-[10px] uppercase font-semibold tracking-wider ${
                      isYearOpen ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    Năm
                  </span>
                  <span className="font-mono text-xs">{selectedYear}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${
                      isYearOpen ? 'rotate-180 text-white' : 'text-slate-500'
                    }`}
                  />
                </button>

                {isYearOpen && (
                  <div className="absolute left-0 top-full mt-1.5 min-w-[110px] bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-56 overflow-y-auto">
                    {yearList.map((y) => {
                      const isSelected = y === selectedYear;
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            handleYearChange(y);
                            setIsYearOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{y}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-4 w-px bg-slate-200 mx-0.5" />

              {/* Popover Chọn Tháng */}
              <div className="relative" ref={monthDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsMonthOpen((prev) => !prev);
                    setIsYearOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    isMonthOpen
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-800 hover:bg-white hover:text-blue-700'
                  }`}
                  title="Chọn Tháng để điều hướng"
                >
                  <span
                    className={`text-[10px] uppercase font-semibold tracking-wider ${
                      isMonthOpen ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    Tháng
                  </span>
                  <span className="font-mono text-xs">
                    {activeMonthKey ? activeMonthKey.split('-')[1] : '01'}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${
                      isMonthOpen ? 'rotate-180 text-white' : 'text-slate-500'
                    }`}
                  />
                </button>

                {isMonthOpen && (
                  <div className="absolute left-0 top-full mt-1.5 min-w-[175px] bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-0.5">
                      Năm {selectedYear}
                    </div>
                    {monthsInSelectedYear.map((g) => {
                      const isSelected = g.monthKey === activeMonthKey;
                      const monthNum = g.monthKey.split('-')[1];
                      return (
                        <button
                          key={g.monthKey}
                          type="button"
                          onClick={() => {
                            handleMonthChange(g.monthKey);
                            setIsMonthOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>Tháng {monthNum} ({g.dates.length} ngày)</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-4 w-px bg-slate-200 mx-0.5" />

              {/* Button Tiến 1 tháng */}
              <button
                type="button"
                onClick={handleNextMonth}
                disabled={!canNextMonth}
                title="Tiến 1 tháng"
                className="p-1 px-1.5 text-slate-700 hover:text-blue-700 hover:bg-white rounded-md disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {/* Button Cuối kỳ */}
              <button
                type="button"
                onClick={scrollToLastDay}
                disabled={!canNextMonth}
                title="Đến tháng cuối kỳ"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 hover:text-blue-700 hover:bg-white rounded-md disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <span className="hidden sm:inline text-[11px]">Cuối kỳ</span>
                <ArrowRightToLine className="w-3 h-3" />
              </button>
            </div>

            {/* Phím tắt nhảy đến hôm nay (nếu có trong kỳ) */}
            {isTodayInRange && (
              <button
                type="button"
                onClick={scrollToToday}
                title={`Chuyển nhanh đến hôm nay (${formatDisplayDate(todayStr)})`}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 transition-colors cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Hôm nay ({formatDisplayDate(todayStr)})</span>
              </button>
            )}
          </div>

          {/* Phía bên phải: Nút Mở rộng / Thu gọn tất cả khoa */}
          <div className="flex items-center gap-2 shrink-0">
            {availableDepartments.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setCollapsedDepts((prev) =>
                    prev.size > 0 ? new Set() : new Set(availableDepartments)
                  )
                }
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors cursor-pointer shadow-2xs"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                    collapsedDepts.size > 0 ? '' : 'rotate-180'
                  }`}
                />
                <span>{collapsedDepts.size > 0 ? 'Mở rộng tất cả khoa' : 'Thu gọn tất cả khoa'}</span>
              </button>
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
                {/* Cột 1: Khoa/Phòng thu hẹp xuống 110px */}
                <col style={{ width: 110, minWidth: 110, maxWidth: 110 }} />
                {/* Cột 2: Nhân viên mở rộng lên 270px */}
                <col style={{ width: 270, minWidth: 270, maxWidth: 270 }} />
                {displayedDates.map((dateKey) => (
                  <col
                    key={dateKey}
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                  />
                ))}
              </colgroup>
              <thead>
                {/* Hàng 0: Header nhóm Tháng (Chỉ hiển thị khi khoảng thời gian > 31 ngày) */}
                {isLongPeriod && (
                  <tr
                    style={{ top: 0 }}
                    className="bg-[#002855] text-white select-none sticky z-40 h-[26px]"
                  >
                    <th
                      colSpan={2}
                      style={{ top: 0 }}
                      className="sticky left-0 z-50 bg-[#002244] px-2.5 py-1 text-left font-bold text-blue-200 text-[11px] border-r border-blue-900 shadow-[4px_0_6px_rgba(0,0,0,0.15)] uppercase tracking-wide w-[380px] min-w-[380px] max-w-[380px]"
                    >
                      <div className="flex items-center justify-between">
                        <span>TOÀN KỲ: {dutyDates.length} NGÀY</span>
                        <span className="text-[10px] text-blue-300 font-normal">
                          {monthGroups.length} tháng
                        </span>
                      </div>
                    </th>
                    <th
                      colSpan={displayedDates.length}
                      style={{ top: 0 }}
                      className="sticky z-40 text-center font-bold text-white text-[11px] py-1 border-r border-blue-800 uppercase tracking-wide bg-[#002855]"
                    >
                      {activeMonthGroup ? `${activeMonthGroup.label} (${displayedDates.length} ngày)` : `Tháng ${activeMonthKey}`}
                    </th>
                  </tr>
                )}

                {/* Hàng 1: Tiêu đề các ngày */}
                <tr
                  style={{ top: headerRow1Top }}
                  className="bg-[#003366] text-white select-none sticky z-35 h-[36px]"
                >
                  <th
                    style={{ top: headerRow1Top }}
                    className="sticky left-0 z-45 bg-[#003366] px-2 py-1 text-left font-semibold w-[110px] min-w-[110px] max-w-[110px] border-r border-blue-900 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
                  >
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-blue-200 shrink-0" />
                      <span className="text-[11px] truncate" title="Khoa / Phòng">Khoa/Phòng</span>
                    </div>
                  </th>
                  <th
                    style={{ top: headerRow1Top }}
                    className="sticky left-[110px] z-45 bg-[#003366] px-2.5 py-1 text-left font-semibold w-[270px] min-w-[270px] max-w-[270px] border-r border-blue-900 shadow-[4px_0_6px_rgba(0,0,0,0.15)]"
                  >
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-blue-200 shrink-0" />
                      <span className="text-[11.5px]">Họ và tên nhân viên</span>
                    </div>
                  </th>
                  {displayedDates.map((dateKey) => {
                    const dayOfWeek = getDayOfWeekLabel(dateKey);
                    const isSunOrSat = dayOfWeek === 'T7' || dayOfWeek === 'CN';
                    const curConfig = dutySchedules[dateKey];
                    const isHoliday = curConfig ? curConfig.isHoliday : isWeekend(dateKey);
                    const dayOnly = dateKey.split('-')[2];
                    const isMonthFocused = focusedMonthKey && dateKey.startsWith(focusedMonthKey);

                    return (
                      <th
                        key={dateKey}
                        style={{
                          width: colWidth,
                          minWidth: colWidth,
                          maxWidth: colWidth,
                          top: headerRow1Top,
                        }}
                        className={`sticky z-35 px-0.5 py-1 text-center font-semibold border-r border-blue-900/60 transition-colors ${
                          isMonthFocused
                            ? 'bg-blue-700 ring-1 ring-amber-300 text-amber-100'
                            : isHoliday
                            ? 'bg-amber-700 text-amber-100 border-r-amber-800/80'
                            : 'bg-[#003366]'
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-mono text-[11px] font-bold leading-tight">
                            {isLongPeriod && viewMode === 'compact' ? dayOnly : formatDisplayDate(dateKey)}
                          </span>
                          <span
                            className={`text-[8.5px] px-0.5 py-0 rounded mt-0.5 font-semibold leading-tight ${
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

                {/* Hàng 2: Hàng cấu hình Ngày nghỉ / Lễ / Tết - Đổ màu đặc (solid) chống xuyên thấu khi cuộn */}
                <tr
                  style={{ top: headerRow2Top, backgroundColor: '#fef3c7' }}
                  className="group sticky z-30 select-none shadow-[0_4px_8px_-2px_rgba(180,83,9,0.35)]"
                >
                  <td
                    style={{ top: headerRow2Top, borderBottom: '3.5px solid #b45309', backgroundColor: '#fde68a' }}
                    className="sticky left-0 z-40 bg-[#fde68a] hover:bg-[#fcd34d] transition-colors px-2 py-1 text-left font-bold text-amber-900 border-r border-amber-300 w-[110px] min-w-[110px] max-w-[110px] shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse shrink-0"></span>
                      <span className="text-[10px] uppercase font-extrabold text-amber-900 tracking-wide truncate">
                        Cấu hình
                      </span>
                    </div>
                  </td>
                  <td
                    style={{ top: headerRow2Top, borderBottom: '3.5px solid #b45309', backgroundColor: '#fde68a' }}
                    className="sticky left-[110px] z-40 bg-[#fde68a] hover:bg-[#fcd34d] transition-colors px-2.5 py-1 text-left font-bold text-amber-900 border-r border-amber-300 w-[270px] min-w-[270px] max-w-[270px] shadow-[4px_0_6px_rgba(0,0,0,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[10.5px] font-bold text-amber-900 tracking-tight leading-tight truncate"
                        title="Check dòng này những ngày nghỉ cuối tuần, Lễ, Tết"
                      >
                        Check dòng này những ngày nghỉ cuối tuần, Lễ, Tết
                      </span>
                      {/* Nút tiện ích điền nhanh T7, CN, Lễ toàn kỳ (Giai đoạn 2) */}
                      <button
                        type="button"
                        onClick={handleAutoFillWeekendsAndHolidays}
                        title="Tự động tích tất cả Thứ 7, Chủ Nhật và ngày Lễ trong đợt này là ngày nghỉ"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-300 hover:bg-amber-400 border border-amber-500 text-amber-950 transition-colors cursor-pointer shadow-2xs flex items-center gap-0.5"
                      >
                        <span>+ T7, CN, Lễ</span>
                      </button>
                    </div>
                  </td>
                  {displayedDates.map((dateKey) => {
                    const curConfig = dutySchedules[dateKey];
                    const isHoliday = curConfig ? curConfig.isHoliday : isWeekend(dateKey);

                    return (
                      <td
                        key={dateKey}
                        style={{
                          width: colWidth,
                          minWidth: colWidth,
                          maxWidth: colWidth,
                          top: headerRow2Top,
                          borderBottom: '3.5px solid #b45309',
                          backgroundColor: isHoliday ? '#fcd34d' : '#fef3c7',
                        }}
                        className={`sticky z-30 px-0.5 py-0.5 text-center border-r transition-colors ${
                          isHoliday
                            ? 'bg-[#fcd34d] text-amber-950 font-bold border-r-amber-400 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)] hover:bg-[#fbbf24]'
                            : 'bg-[#fef3c7] border-r-amber-300 hover:bg-[#fde68a]'
                        }`}
                      >
                        <label className="inline-flex items-center justify-center cursor-pointer p-0.5 rounded hover:bg-amber-300 transition-colors">
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
            {/* Giai đoạn 3: Ảo hóa dòng với @tanstack/react-virtual khi > 31 ngày */}
            {isLongPeriod ? (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td
                      style={{ height: `${paddingTop}px` }}
                      colSpan={2 + displayedDates.length}
                      className="p-0 border-0 pointer-events-none"
                    />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const item = displayItems[virtualRow.index];
                  if (!item) return null;

                  if (item.type === 'dept') {
                    return (
                      <tr
                        key={item.id}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className="bg-slate-100/95 border-y border-slate-300 select-none"
                      >
                        {/* Cột cố định sticky left-0 bao trọn 2 cột Khoa/Nhân viên (380px) khi cuộn ngang */}
                        <td
                          colSpan={2}
                          className="sticky left-0 z-10 bg-slate-100 border-r border-slate-300 px-3 py-1 text-slate-800 text-[11px] shadow-[4px_0_6px_rgba(0,0,0,0.06)] w-[380px] min-w-[380px] max-w-[380px]"
                        >
                          <button
                            type="button"
                            onClick={() => toggleDeptCollapse(item.department)}
                            className="flex items-center gap-1.5 text-slate-800 hover:text-blue-700 font-bold cursor-pointer truncate w-full text-left"
                            title={`Khoa ${item.department} (${item.staffCount} nhân sự) - Nhấp để ${
                              item.isCollapsed ? 'mở rộng' : 'thu gọn'
                            }`}
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-slate-600 transition-transform shrink-0 ${
                                item.isCollapsed ? '-rotate-90' : ''
                              }`}
                            />
                            <span className="truncate">KHOA: {item.department}</span>
                            <span className="text-[10px] text-slate-500 font-normal shrink-0">
                              ({item.staffCount} nhân sự)
                            </span>
                          </button>
                        </td>

                        {/* Phần còn lại của hàng trải dài qua các cột ngày, nút Mở rộng / Thu gọn ở cuối hàng như cũ */}
                        <td
                          colSpan={displayedDates.length}
                          className="bg-slate-50/70 border-b border-slate-200 px-4 py-1"
                        >
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => toggleDeptCollapse(item.department)}
                              className="text-[10.5px] text-blue-700 hover:text-blue-900 hover:underline cursor-pointer font-semibold px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
                            >
                              {item.isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const { staff, dutyCount, hasAnyDuty } = item;
                  const rowBgClass = hasAnyDuty ? 'bg-blue-50/45' : 'bg-white';
                  const stickyBgClass = hasAnyDuty ? 'bg-[#f0f7ff]' : 'bg-white';

                  return (
                    <tr
                      key={item.id}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className={`group transition-colors ${rowBgClass}`}
                    >
                      {/* Cột 1: Tên Khoa (110px) */}
                      <td
                        className={`sticky left-0 z-10 ${stickyBgClass} group-hover:bg-blue-100/90 transition-colors px-2 py-1 text-gray-600 border-r border-gray-200 text-[11px] shadow-[2px_0_4px_rgba(0,0,0,0.04)] whitespace-nowrap w-[110px] min-w-[110px] max-w-[110px] truncate`}
                      >
                        <span
                          className="font-bold text-gray-800 text-[11px] flex items-center gap-1 truncate"
                          title={staff.department}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                          <span className="truncate">{staff.department}</span>
                        </span>
                      </td>

                      {/* Cột 2: Họ tên nhân viên (270px) */}
                      <td
                        className={`sticky left-[110px] z-10 ${stickyBgClass} group-hover:bg-blue-100/90 transition-colors px-2.5 py-1 font-medium text-gray-900 border-r border-gray-200 shadow-[4px_0_6px_rgba(0,0,0,0.06)] whitespace-nowrap w-[270px] min-w-[270px] max-w-[270px]`}
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
                      {displayedDates.map((dateKey) => {
                        const curConfig = dutySchedules[dateKey];
                        const onCallList = curConfig ? curConfig.onCallStaff || [] : [];
                        const isOnCall = onCallList.includes(staff.name);
                        const isHol = curConfig ? curConfig.isHoliday : isWeekend(dateKey);
                        const isMonthFocused = focusedMonthKey && dateKey.startsWith(focusedMonthKey);
                        const dayOfWeek = getDayOfWeekLabel(dateKey);

                        return (
                          <td
                            key={dateKey}
                            style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                            title={`${staff.name} | Ngày ${formatDisplayDate(dateKey)} (${dayOfWeek}) | ${
                              isOnCall ? 'ĐÃ PHÂN CÔNG TRỰC' : 'Chưa xếp trực'
                            }`}
                            className={`px-0.5 py-0.5 text-center border-r transition-colors ${
                              isMonthFocused ? 'bg-blue-100/40 ring-1 ring-blue-300' : ''
                            } ${
                              isOnCall
                                ? 'bg-blue-200 text-blue-950 font-bold border-blue-300 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)] group-hover:bg-blue-300/90 group-hover:border-blue-400'
                                : isHol
                                ? 'bg-amber-100/85 border-amber-200/90 group-hover:bg-amber-200/85 group-hover:border-amber-300'
                                : hasAnyDuty
                                ? 'bg-blue-50/25 border-gray-100 group-hover:bg-blue-100/70 group-hover:border-blue-200'
                                : 'border-gray-100 group-hover:bg-blue-100/70 group-hover:border-blue-200'
                            }`}
                          >
                            <label className="inline-flex items-center justify-center p-0.5 rounded cursor-pointer hover:bg-blue-300/50 transition-colors">
                              <input
                                type="checkbox"
                                checked={isOnCall}
                                onChange={() => handleToggleStaffOnCall(dateKey, staff.name)}
                                className={`${
                                  viewMode === 'compact' ? 'w-3 h-3' : 'w-3.5 h-3.5'
                                } rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer`}
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td
                      style={{ height: `${paddingBottom}px` }}
                      colSpan={2 + displayedDates.length}
                      className="p-0 border-0 pointer-events-none"
                    />
                  </tr>
                )}
              </>
            ) : (
              /* Giao diện chuẩn khi <= 31 ngày (không qua ảo hóa, giữ nguyên 100% bản gốc) */
              filteredStaff.map((staff, sIdx) => {
                const isFirstOfDept = sIdx === 0 || staff.department !== filteredStaff[sIdx - 1].department;
                const dutyCount = displayedDates.reduce((cnt, d) => {
                  const staffOnCall = dutySchedules[d]?.onCallStaff || [];
                  return cnt + (staffOnCall.includes(staff.name) ? 1 : 0);
                }, 0);
                const hasAnyDuty = dutyCount > 0;
                const rowBgClass = hasAnyDuty ? 'bg-blue-50/45' : 'bg-white';
                const stickyBgClass = hasAnyDuty ? 'bg-[#f0f7ff]' : 'bg-white';

                return (
                  <tr
                    key={staff.name}
                    className={`group transition-colors ${rowBgClass} ${
                      isFirstOfDept && sIdx > 0 ? 'border-t-2 border-gray-300' : ''
                    }`}
                  >
                    {/* Cột 1: Tên Khoa (110px) */}
                    <td
                      className={`sticky left-0 z-10 ${stickyBgClass} group-hover:bg-blue-100/90 transition-colors px-2 py-1 text-gray-600 border-r border-gray-200 text-[11px] shadow-[2px_0_4px_rgba(0,0,0,0.04)] whitespace-nowrap w-[110px] min-w-[110px] max-w-[110px] truncate`}
                    >
                      {isFirstOfDept ? (
                        <span
                          className="font-bold text-gray-800 text-[11px] flex items-center gap-1 truncate"
                          title={staff.department}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>
                          <span className="truncate">{staff.department}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[10px] pl-2">↳</span>
                      )}
                    </td>

                    {/* Cột 2: Họ tên nhân viên (270px) */}
                    <td
                      className={`sticky left-[110px] z-10 ${stickyBgClass} group-hover:bg-blue-100/90 transition-colors px-2.5 py-1 font-medium text-gray-900 border-r border-gray-200 shadow-[4px_0_6px_rgba(0,0,0,0.06)] whitespace-nowrap w-[270px] min-w-[270px] max-w-[270px]`}
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
                    {displayedDates.map((dateKey) => {
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
                              : isHol
                              ? 'bg-amber-100/85 border-amber-200/90 group-hover:bg-amber-200/85 group-hover:border-amber-300'
                              : hasAnyDuty
                              ? 'bg-blue-50/25 border-gray-100 group-hover:bg-blue-100/70 group-hover:border-blue-200'
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer Info ── */}
      <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-600 inline-block shrink-0"></span>
            <span>Check trực: Phân công trực 24h {dutyShiftNote}</span>
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
