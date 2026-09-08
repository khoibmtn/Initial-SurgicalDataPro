import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Search,
  Download,
  Filter,
  Users,
  CalendarDays,
  FileSpreadsheet,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  AlertCircle,
  Briefcase,
  Layers,
} from 'lucide-react';
import { SurgeryRecord, DutyScheduleDateConfig, OvertimeRecordRow } from '../../types';
import { AppConfig } from '../../contexts/ConfigContext';
import { calculateOvertimeRows, formatDurationText } from '../../services/overtimeCalculationService';
import { exportOvertimeToExcel } from '../../services/excelExportService';
import { PageCombobox } from '../common/PageCombobox';

interface OvertimeTabProps {
  records: SurgeryRecord[];
  dutySchedules: Record<string, DutyScheduleDateConfig>;
  config: AppConfig;
  onNavigateToDutyTab?: () => void;
  reportDateRangeText?: string;
}

export const OvertimeTab: React.FC<OvertimeTabProps> = ({
  records,
  dutySchedules,
  config,
  onNavigateToDutyTab,
  reportDateRangeText,
}) => {
  // 1. Tùy chọn Bật/Tắt Giúp việc (lưu vào localStorage)
  const [includeGV, setIncludeGV] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sdp_overtime_include_gv') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleIncludeGV = () => {
    setIncludeGV((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sdp_overtime_include_gv', String(next));
      } catch (e) {
        console.error('Failed to save includeGV setting:', e);
      }
      return next;
    });
  };

  // 2. Bộ lọc & Phân trang
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGhiChu, setFilterGhiChu] = useState<'ALL' | 'Kíp mổ phiên' | 'Kíp trực'>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedStaff, setSelectedStaff] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [isExporting, setIsExporting] = useState(false);

  // 3. Tính toán danh sách ngoài giờ
  const overtimeRows = useMemo(() => {
    return calculateOvertimeRows(records, dutySchedules, config?.workingHours, includeGV);
  }, [records, dutySchedules, config?.workingHours, includeGV]);

  // 4. Ánh xạ Nhân viên -> Khoa
  const staffDeptMap = useMemo(() => {
    const map = new Map<string, string>();
    (config?.staffList || []).forEach((s) => {
      if (s.name) {
        const trimmed = s.name.trim();
        const dept = (s.department || '').trim();
        if (dept) {
          map.set(trimmed, dept);
          map.set(trimmed.toLowerCase(), dept);
        }
      }
    });
    return map;
  }, [config?.staffList]);

  const getStaffDept = (name: string | undefined): string => {
    if (!name) return '';
    const trimmed = name.trim();
    return staffDeptMap.get(trimmed) || staffDeptMap.get(trimmed.toLowerCase()) || '';
  };

  // 5. Danh sách tất cả nhân viên có xuất hiện trong danh sách ngoài giờ
  const uniqueStaffInOvertime = useMemo(() => {
    const set = new Set<string>();
    overtimeRows.forEach((r) => {
      if (r.ptChinh) set.add(r.ptChinh);
      if (r.ptPhu) set.add(r.ptPhu);
      if (r.bsGM) set.add(r.bsGM);
      if (r.ktvGM) set.add(r.ktvGM);
      if (r.tdc) set.add(r.tdc);
      if (includeGV && r.gv) set.add(r.gv);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [overtimeRows, includeGV]);

  // 6. Danh sách các khoa xuất hiện trong dữ liệu ngoài giờ
  const availableDepartments = useMemo(() => {
    const configuredDepts = (config?.departments || []).filter(Boolean);
    const deptsWithOvertime = new Set<string>();

    overtimeRows.forEach((row) => {
      const staffMembers = [row.ptChinh, row.ptPhu, row.bsGM, row.ktvGM, row.tdc];
      if (includeGV && row.gv) staffMembers.push(row.gv);
      staffMembers.forEach((name) => {
        if (name && name.trim()) {
          const dept = getStaffDept(name);
          if (dept) deptsWithOvertime.add(dept);
        }
      });
    });

    const ordered: string[] = [];
    configuredDepts.forEach((d) => {
      if (deptsWithOvertime.has(d)) {
        ordered.push(d);
        deptsWithOvertime.delete(d);
      }
    });

    Array.from(deptsWithOvertime)
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .forEach((d) => ordered.push(d));

    return ordered;
  }, [config?.departments, overtimeRows, includeGV, staffDeptMap]);

  // 7. Danh sách nhân viên trong dropdown (lọc theo khoa nếu đã chọn khoa)
  const availableStaff = useMemo(() => {
    if (selectedDepartment === 'ALL') {
      return uniqueStaffInOvertime;
    }
    return uniqueStaffInOvertime.filter((name) => getStaffDept(name) === selectedDepartment);
  }, [uniqueStaffInOvertime, selectedDepartment, staffDeptMap]);

  // Xử lý thay đổi Khoa
  const handleDepartmentChange = (dept: string) => {
    setSelectedDepartment(dept);
    if (dept !== 'ALL' && selectedStaff !== 'ALL') {
      if (getStaffDept(selectedStaff) !== dept) {
        setSelectedStaff('ALL');
      }
    }
  };

  // 8. Lọc dữ liệu theo tìm kiếm, khoa, ghi chú và nhân viên
  const filteredRows = useMemo(() => {
    return overtimeRows.filter((row) => {
      if (filterGhiChu !== 'ALL' && row.ghiChu !== filterGhiChu) {
        return false;
      }

      if (selectedDepartment !== 'ALL') {
        const rowStaff = [row.ptChinh, row.ptPhu, row.bsGM, row.ktvGM, row.tdc];
        if (includeGV && row.gv) rowStaff.push(row.gv);

        const hasStaffInDept = rowStaff.some((name) => {
          if (!name || !name.trim()) return false;
          return getStaffDept(name) === selectedDepartment;
        });

        if (!hasStaffInDept) return false;
      }

      if (selectedStaff !== 'ALL') {
        const hasStaff =
          row.ptChinh === selectedStaff ||
          row.ptPhu === selectedStaff ||
          row.bsGM === selectedStaff ||
          row.ktvGM === selectedStaff ||
          row.tdc === selectedStaff ||
          (includeGV && row.gv === selectedStaff);
        if (!hasStaff) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matches =
          row.patientId.toLowerCase().includes(term) ||
          row.patientName.toLowerCase().includes(term) ||
          row.tenKT.toLowerCase().includes(term) ||
          (row.ptChinh && row.ptChinh.toLowerCase().includes(term)) ||
          (row.ptPhu && row.ptPhu.toLowerCase().includes(term)) ||
          (row.bsGM && row.bsGM.toLowerCase().includes(term)) ||
          (row.ktvGM && row.ktvGM.toLowerCase().includes(term)) ||
          (row.tdc && row.tdc.toLowerCase().includes(term)) ||
          (includeGV && row.gv && row.gv.toLowerCase().includes(term)) ||
          row.ghiChu.toLowerCase().includes(term) ||
          row.timeFrom.includes(term) ||
          row.timeTo.includes(term);

        if (!matches) return false;
      }

      return true;
    });
  }, [overtimeRows, filterGhiChu, selectedDepartment, selectedStaff, searchTerm, includeGV, staffDeptMap]);

  const isFiltered =
    selectedDepartment !== 'ALL' ||
    selectedStaff !== 'ALL' ||
    filterGhiChu !== 'ALL' ||
    Boolean(searchTerm.trim());

  // 9. Thống kê tổng quan (phản ánh theo bộ lọc hiện tại)
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let countPhien = 0;
    let countTruc = 0;

    filteredRows.forEach((r) => {
      totalMinutes += r.durationMinutes || 0;
      if (r.ghiChu === 'Kíp trực') {
        countTruc++;
      } else {
        countPhien++;
      }
    });

    return {
      totalRows: filteredRows.length,
      totalDurationText: formatDurationText(totalMinutes),
      totalMinutes,
      countPhien,
      countTruc,
    };
  }, [filteredRows]);

  // 10. Phân trang
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterGhiChu, selectedDepartment, selectedStaff, rowsPerPage, includeGV]);

  // 11. Xử lý xuất Excel
  const handleExportExcel = async () => {
    if (filteredRows.length === 0) return;
    try {
      setIsExporting(true);
      let reportTitle = reportDateRangeText || 'Danh sách phẫu thuật ngoài giờ';
      if (selectedDepartment !== 'ALL') {
        reportTitle += ` - KHOA ${selectedDepartment.toUpperCase()}`;
      }
      if (selectedStaff !== 'ALL') {
        reportTitle += ` - ${selectedStaff.toUpperCase()}`;
      }

      await exportOvertimeToExcel(
        filteredRows,
        reportTitle,
        config?.hospitalName || 'BỆNH VIỆN',
        includeGV
      );
    } catch (err) {
      console.error('Lỗi khi xuất file Excel Ngoài giờ:', err);
      alert('Không thể xuất file Excel: ' + (err as any)?.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center">
        <Clock className="w-10 h-10 text-gray-300 mb-2" />
        <p className="text-sm font-semibold text-gray-600">Chưa có dữ liệu ca phẫu thuật</p>
        <p className="text-xs text-gray-400 mt-1">Vui lòng import danh sách phẫu thuật hoặc tải từ kho lưu trữ để phân tích ngoài giờ.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Metric Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50/70 border-b border-gray-200">
        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-gray-500 flex items-center gap-1">
              <span>Tổng số lượt ngoài giờ</span>
              {isFiltered && <span className="text-blue-600 font-semibold">(Đã lọc)</span>}
            </div>
            <div className="text-lg font-extrabold text-[#003366] mt-0.5">
              {stats.totalRows} lượt
              {isFiltered && (
                <span className="text-xs font-normal text-gray-400 ml-1.5">
                  / {overtimeRows.length} gốc
                </span>
              )}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-gray-500">Tổng thời gian ngoài giờ</div>
            <div className="text-lg font-extrabold text-amber-700 font-mono mt-0.5">{stats.totalDurationText}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-gray-500">Kíp mổ phiên</div>
            <div className="text-lg font-extrabold text-blue-700 mt-0.5">{stats.countPhien} lượt</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-gray-500">Kíp trực (kéo dài sau 07h)</div>
            <div className="text-lg font-extrabold text-orange-700 mt-0.5">{stats.countTruc} lượt</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2">
          {/* Ô tìm kiếm */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo BN, kỹ thuật, bác sĩ..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-[210px]"
            />
          </div>

          {/* Lọc theo loại ghi chú */}
          <select
            value={filterGhiChu}
            onChange={(e) => setFilterGhiChu(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">Tất cả kíp mổ</option>
            <option value="Kíp mổ phiên">Chỉ Kíp mổ phiên</option>
            <option value="Kíp trực">Chỉ Kíp trực</option>
          </select>

          {/* Lọc theo Khoa / Phòng */}
          <select
            value={selectedDepartment}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className={`px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium ${
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

          {/* Lọc theo nhân viên */}
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className={`px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[210px] ${
              selectedStaff !== 'ALL'
                ? 'border-blue-400 text-blue-800 bg-blue-50/60 font-semibold'
                : 'border-gray-200 text-gray-700'
            }`}
          >
            <option value="ALL">
              {selectedDepartment === 'ALL'
                ? `Tất cả nhân viên (${uniqueStaffInOvertime.length})`
                : `Tất cả NV khoa ${selectedDepartment} (${availableStaff.length})`}
            </option>
            {availableStaff.map((name) => {
              const dept = getStaffDept(name);
              return (
                <option key={name} value={name}>
                  {name} {selectedDepartment === 'ALL' && dept ? `(${dept})` : ''}
                </option>
              );
            })}
          </select>

          {/* Toggle Bật / Tắt Giúp việc (GV) */}
          <button
            type="button"
            onClick={handleToggleIncludeGV}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all select-none ${
              includeGV
                ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
            title="Bật/Tắt tính toán và hiển thị vị trí Giúp việc (GV) trong danh sách ngoài giờ"
          >
            {includeGV ? (
              <ToggleRight className="w-4 h-4 text-blue-600" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-gray-400" />
            )}
            <span>Giúp việc (GV): {includeGV ? 'BẬT' : 'TẮT'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Nút chuyển sang tab Lịch trực */}
          {onNavigateToDutyTab && (
            <button
              type="button"
              onClick={onNavigateToDutyTab}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
              <span>Xem / Sửa Lịch trực</span>
            </button>
          )}

          {/* Nút Xuất Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting || filteredRows.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Đang xuất...' : 'Xuất Excel Ngoài giờ'}</span>
          </button>
        </div>
      </div>

      {/* ── Table Container ── */}
      <div className="flex-1 overflow-auto max-h-[calc(100vh-320px)] border-b border-gray-100">
        <table className="w-max min-w-full text-xs border-separate border-spacing-0">
          <colgroup>
            <col style={{ width: 45, minWidth: 45, maxWidth: 45 }} />
            <col style={{ width: 85, minWidth: 85, maxWidth: 85 }} />
            <col style={{ width: 160, minWidth: 160, maxWidth: 160 }} />
            <col style={{ width: 220, minWidth: 220, maxWidth: 220 }} />
            <col style={{ width: 125, minWidth: 125, maxWidth: 125 }} />
            <col style={{ width: 125, minWidth: 125, maxWidth: 125 }} />
            <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />
            <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />
            <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />
            <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />
            <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />
            {includeGV && <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />}
            <col style={{ width: 80, minWidth: 80, maxWidth: 80 }} />
            <col style={{ width: 80, minWidth: 80, maxWidth: 80 }} />
            <col style={{ width: 75, minWidth: 75, maxWidth: 75 }} />
            <col style={{ width: 120, minWidth: 120, maxWidth: 120 }} />
          </colgroup>

          <thead>
            <tr className="bg-[#003366] text-white select-none sticky top-0 z-20">
              <th className="sticky left-0 z-30 bg-[#003366] px-2.5 py-2.5 text-center font-semibold w-[45px] min-w-[45px] max-w-[45px] border-r border-b border-blue-900 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                STT
              </th>
              <th className="sticky left-[45px] z-30 bg-[#003366] px-2.5 py-2.5 text-left font-semibold w-[85px] min-w-[85px] max-w-[85px] border-r border-b border-blue-900 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                Mã BN
              </th>
              <th className="sticky left-[130px] z-30 bg-[#003366] px-3 py-2.5 text-left font-semibold w-[160px] min-w-[160px] max-w-[160px] border-r border-b border-blue-900 shadow-[4px_0_6px_rgba(0,0,0,0.15)]">
                Họ tên
              </th>
              <th className="px-3 py-2.5 text-left font-semibold w-[220px] min-w-[220px] max-w-[220px] border-r border-b border-blue-900/60">
                Tên kỹ thuật
              </th>
              <th className="px-2.5 py-2.5 text-center font-semibold w-[125px] min-w-[125px] max-w-[125px] border-r border-b border-blue-900/60">
                Ngày BĐ
              </th>
              <th className="px-2.5 py-2.5 text-center font-semibold w-[125px] min-w-[125px] max-w-[125px] border-r border-b border-blue-900/60">
                Ngày KT
              </th>
              <th className="px-2.5 py-2.5 text-left font-semibold w-[120px] min-w-[120px] max-w-[120px] border-r border-b border-blue-900/60">
                PT chính
              </th>
              <th className="px-2.5 py-2.5 text-left font-semibold w-[120px] min-w-[120px] max-w-[120px] border-r border-b border-blue-900/60">
                PT phụ
              </th>
              <th className="px-2.5 py-2.5 text-left font-semibold w-[120px] min-w-[120px] max-w-[120px] border-r border-b border-blue-900/60">
                BS GM
              </th>
              <th className="px-2.5 py-2.5 text-left font-semibold w-[120px] min-w-[120px] max-w-[120px] border-r border-b border-blue-900/60">
                KTV GM
              </th>
              <th className="px-2.5 py-2.5 text-left font-semibold w-[120px] min-w-[120px] max-w-[120px] border-r border-b border-blue-900/60">
                TDC
              </th>
              {includeGV && (
                <th className="px-2.5 py-2.5 text-left font-semibold w-[120px] min-w-[120px] max-w-[120px] border-r border-b border-blue-900/60 bg-blue-900/80 text-blue-100">
                  GV
                </th>
              )}
              <th className="px-2 py-2.5 text-center font-semibold w-[80px] min-w-[80px] max-w-[80px] border-r border-b border-blue-900/60 bg-blue-950/70">
                Ngoài giờ (từ)
              </th>
              <th className="px-2 py-2.5 text-center font-semibold w-[80px] min-w-[80px] max-w-[80px] border-r border-b border-blue-900/60 bg-blue-950/70">
                Ngoài giờ (đến)
              </th>
              <th className="px-2 py-2.5 text-center font-semibold w-[75px] min-w-[75px] max-w-[75px] border-r border-b border-blue-900/60 bg-amber-700 text-amber-50">
                TS giờ
              </th>
              <th className="px-2.5 py-2.5 text-center font-semibold w-[120px] min-w-[120px] max-w-[120px] border-b border-blue-900/60">
                Ghi chú
              </th>
            </tr>
          </thead>

          <tbody className="bg-white">
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={includeGV ? 16 : 15}
                  className="px-4 py-8 text-center text-gray-400 italic bg-gray-50/50"
                >
                  <AlertCircle className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                  Không có ca phẫu thuật nào thỏa mãn điều kiện ngoài giờ hoặc bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const globalIndex = (currentPage - 1) * rowsPerPage + idx + 1;
                const isTruc = row.ghiChu === 'Kíp trực';

                const rowBg = isTruc ? 'bg-amber-50/40' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white';
                const stickyBg = isTruc ? 'bg-[#FFF8F0]' : idx % 2 === 1 ? 'bg-[#F9FAFB]' : 'bg-white';

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-blue-50/50 transition-colors ${rowBg}`}
                  >
                    {/* Cột 1: STT (Sticky) */}
                    <td
                      className={`sticky left-0 z-10 ${stickyBg} px-2.5 py-2 text-center text-gray-500 font-mono border-r border-b border-gray-100 w-[45px] min-w-[45px] max-w-[45px] shadow-[2px_0_4px_rgba(0,0,0,0.04)]`}
                    >
                      {globalIndex}
                    </td>

                    {/* Cột 2: Mã BN (Sticky) */}
                    <td
                      className={`sticky left-[45px] z-10 ${stickyBg} px-2.5 py-2 font-mono font-medium text-gray-700 border-r border-b border-gray-100 whitespace-nowrap w-[85px] min-w-[85px] max-w-[85px] shadow-[2px_0_4px_rgba(0,0,0,0.04)] truncate`}
                      title={row.patientId}
                    >
                      {row.patientId}
                    </td>

                    {/* Cột 3: Họ tên (Sticky) */}
                    <td
                      className={`sticky left-[130px] z-10 ${stickyBg} px-3 py-2 font-semibold text-gray-900 border-r border-b border-gray-100 whitespace-nowrap w-[160px] min-w-[160px] max-w-[160px] shadow-[4px_0_6px_rgba(0,0,0,0.08)] truncate`}
                      title={row.patientName}
                    >
                      {row.patientName}
                    </td>

                    {/* Cột 4: Tên kỹ thuật */}
                    <td className="px-3 py-2 text-gray-700 border-r border-b border-gray-100 w-[220px] min-w-[220px] max-w-[220px]">
                      <div className="line-clamp-2 text-xs" title={row.tenKT}>
                        {row.tenKT}
                      </div>
                    </td>

                    {/* Cột 5: Ngày BĐ */}
                    <td className="px-2.5 py-2 text-center text-gray-600 font-mono text-[11px] border-r border-b border-gray-100 whitespace-nowrap w-[125px] min-w-[125px] max-w-[125px]">
                      {row.ngayBD}
                    </td>

                    {/* Cột 6: Ngày KT */}
                    <td className="px-2.5 py-2 text-center text-gray-600 font-mono text-[11px] border-r border-b border-gray-100 whitespace-nowrap w-[125px] min-w-[125px] max-w-[125px]">
                      {row.ngayKT}
                    </td>

                    {/* Cột 7: PT chính */}
                    <td className="px-2.5 py-2 text-gray-800 border-r border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px] truncate" title={row.ptChinh}>
                      {row.ptChinh ? (
                        <span className="font-medium text-blue-900">{row.ptChinh}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Cột 8: PT phụ */}
                    <td className="px-2.5 py-2 text-gray-800 border-r border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px] truncate" title={row.ptPhu}>
                      {row.ptPhu ? (
                        <span className="font-medium text-blue-900">{row.ptPhu}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Cột 9: BS GM */}
                    <td className="px-2.5 py-2 text-gray-800 border-r border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px] truncate" title={row.bsGM}>
                      {row.bsGM ? (
                        <span className="font-medium text-indigo-900">{row.bsGM}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Cột 10: KTV GM */}
                    <td className="px-2.5 py-2 text-gray-800 border-r border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px] truncate" title={row.ktvGM}>
                      {row.ktvGM ? (
                        <span className="font-medium text-indigo-900">{row.ktvGM}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Cột 11: TDC */}
                    <td className="px-2.5 py-2 text-gray-800 border-r border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px] truncate" title={row.tdc}>
                      {row.tdc ? (
                        <span className="font-medium text-teal-900">{row.tdc}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    {/* Cột 12: GV (nếu BẬT) */}
                    {includeGV && (
                      <td className="px-2.5 py-2 text-gray-800 border-r border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px] truncate" title={row.gv}>
                        {row.gv ? (
                          <span className="font-medium text-teal-900">{row.gv}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    )}

                    {/* Cột 13: Ngoài giờ Từ */}
                    <td className="px-2 py-2 text-center font-mono font-bold text-gray-800 border-r border-b border-gray-100 bg-blue-50/20 whitespace-nowrap w-[80px] min-w-[80px] max-w-[80px]">
                      {row.timeFrom}
                    </td>

                    {/* Cột 14: Ngoài giờ Đến */}
                    <td className="px-2 py-2 text-center font-mono font-bold text-gray-800 border-r border-b border-gray-100 bg-blue-50/20 whitespace-nowrap w-[80px] min-w-[80px] max-w-[80px]">
                      {row.timeTo}
                    </td>

                    {/* Cột 15: TS Giờ */}
                    <td className="px-2 py-2 text-center font-mono font-extrabold text-amber-700 bg-amber-50/50 border-r border-b border-gray-100 whitespace-nowrap w-[75px] min-w-[75px] max-w-[75px]">
                      {row.durationText}
                    </td>

                    {/* Cột 16: Ghi chú */}
                    <td className="px-2.5 py-2 text-center border-b border-gray-100 whitespace-nowrap w-[120px] min-w-[120px] max-w-[120px]">
                      {isTruc ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                          Kíp trực
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          Kíp mổ phiên
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer Pagination ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span>
            Hiển thị <strong>{filteredRows.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}</strong> -{' '}
            <strong>{Math.min(currentPage * rowsPerPage, filteredRows.length)}</strong> trên tổng số{' '}
            <strong>{filteredRows.length}</strong> lượt
          </span>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5">
            <span>Dòng/trang:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            Trang trước
          </button>
          <PageCombobox
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            size="md"
          />
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            Trang sau
          </button>
        </div>
      </div>
    </div>
  );
};
