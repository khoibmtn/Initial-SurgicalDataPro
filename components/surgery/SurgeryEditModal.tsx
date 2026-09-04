/**
 * SurgeryEditModal — Modal chỉnh sửa toàn diện thông tin 1 record phẫu thuật
 * 
 * Tính năng chính:
 * 1. Nhấn ESC trong bất kỳ ô nào -> Revert về giá trị ban đầu của ô đó, không đóng modal.
 * 2. Mã máy tự động ăn theo Tên máy (dựa trên machineRegistry), khóa readOnly.
 * 3. Thành tiền = Số lượng × Đơn giá, khóa readOnly không cho sửa tay.
 * 4. Đơn giá tự động ăn theo kỹ thuật được chọn theo khoảng hiệu lực, khóa readOnly.
 * 5. Chọn kỹ thuật 2 chiều (Tên kỹ thuật hoặc Mã tương đương) với dropdown gợi ý [Mã TĐ] Tên kỹ thuật [Đơn giá].
 * 6. Cụm thời gian thống nhất, thân thiện (Ngày date picker + Giờ time picker).
 *    Thời gian (phút) tự động tính, khóa readOnly. Loại PT/TT có danh sách chọn chuẩn.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, Save, User, Calendar, Clock, Stethoscope, Users,
  Cpu, DollarSign, ChevronDown, Check, Sparkles, Hash
} from 'lucide-react';
import { SurgeryRecord, StaffMember, MachineEntry, SurgeryNamePrice } from '../../types';

interface Props {
  isOpen: boolean;
  record: SurgeryRecord | null;
  onClose: () => void;
  onSave: (updatedRecord: SurgeryRecord) => void;
  staffList?: StaffMember[];
  machineRegistry?: MachineEntry[];
  surgeryNamePrices?: SurgeryNamePrice[];
}

/** Chuẩn hóa chuỗi tìm kiếm tiếng Việt không dấu */
function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Chuyển đổi ngày bất kỳ sang dạng YYYY-MM-DD để so sánh hiệu lực */
function parseToDateKey(dateVal: any): string {
  if (!dateVal) return '';
  const s = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const d = slashMatch[1].padStart(2, '0');
    const m = slashMatch[2].padStart(2, '0');
    const y = slashMatch[3];
    return `${y}-${m}-${d}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return s.substring(0, 10);
}

/** Định dạng số có dấu phân cách hàng nghìn */
function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return Number(num).toLocaleString('vi-VN');
}

/** Tách giá trị ngày giờ (Date, ISO string, dd/MM/yyyy HH:mm) thành DateStr (YYYY-MM-DD) và TimeStr (HH:mm) */
function parseDateTimeToLocalParts(val: any, fallbackDateObj?: Date | null): { date: string; time: string } {
  let d: Date | null = null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    d = val;
  } else if (fallbackDateObj instanceof Date && !isNaN(fallbackDateObj.getTime())) {
    d = fallbackDateObj;
  } else if (typeof val === 'string' && val.trim()) {
    const trimmed = val.trim();
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (slashMatch) {
      const day = Number(slashMatch[1]);
      const mon = Number(slashMatch[2]) - 1;
      const yr = Number(slashMatch[3]);
      const hh = slashMatch[4] ? Number(slashMatch[4]) : 0;
      const mm = slashMatch[5] ? Number(slashMatch[5]) : 0;
      d = new Date(yr, mon, day, hh, mm);
    } else {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      }
    }
  }

  if (!d || isNaN(d.getTime())) {
    return { date: '', time: '' };
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');

  return {
    date: `${y}-${m}-${day}`,
    time: `${hh}:${mm}`,
  };
}

/** Ghép chuỗi YYYY-MM-DD và HH:mm thành Date object */
function combineDateAndTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  let hh = 0;
  let mm = 0;
  if (timeStr) {
    const [h, min] = timeStr.split(':').map(Number);
    if (!isNaN(h)) hh = h;
    if (!isNaN(min)) mm = min;
  }
  return new Date(y, m - 1, d, hh, mm, 0);
}

/** Tính thời gian phút chính xác giữa 2 thời điểm */
function computeDurationMinutes(
  startDateStr: string,
  startTimeStr: string,
  endDateStr: string,
  endTimeStr: string
): number | null {
  if (!startDateStr || !endDateStr || !startTimeStr || !endTimeStr) return null;
  const d1 = combineDateAndTime(startDateStr, startTimeStr);
  const d2 = combineDateAndTime(endDateStr, endTimeStr);
  if (!d1 || !d2) return null;

  let diffMs = d2.getTime() - d1.getTime();
  let diffMins = Math.round(diffMs / 60000);

  // Nếu cùng ngày mà giờ kết thúc < giờ bắt đầu (ca mổ qua nửa đêm)
  if (diffMins < 0 && startDateStr === endDateStr) {
    diffMins += 24 * 60;
  }
  return diffMins >= 0 ? diffMins : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: DateTimeField — Nhóm Ngày (type="date") + Giờ (text HH:mm 24h)
// Logic giờ giống hệt box thời gian ở báo cáo tháng/hàng ngày:
// Auto-format khi gõ, clamp 00:00-23:59, tự chèn dấu ':'
// ─────────────────────────────────────────────────────────────────────────────
interface DateTimeFieldProps {
  label: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onEscRevert?: () => void;
  required?: boolean;
  hasError?: boolean;
  errorMsg?: string;
}

/** Auto-format chuỗi thời gian khi gõ (giống handleTimeChange ở App.tsx) */
function formatTimeInput(val: string): string {
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

  return formatted;
}

const DateTimeField: React.FC<DateTimeFieldProps> = ({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  onEscRevert,
  required = false,
  hasError = false,
  errorMsg,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscRevert?.();
    }
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatTimeInput(e.target.value);
    onTimeChange(formatted);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
        <span>{label} {required && <span className="text-red-500">*</span>}</span>
        {hasError && errorMsg && (
          <span className="text-[10px] text-red-500 font-normal">{errorMsg}</span>
        )}
      </label>
      <div className={`flex items-center gap-1.5 bg-white border rounded-lg px-2.5 py-1.5 shadow-sm focus-within:ring-2 transition-all ${
        hasError
          ? 'border-red-400 focus-within:ring-red-300 focus-within:border-red-500'
          : 'border-gray-300 focus-within:ring-primary-500 focus-within:border-primary-500'
      }`}>
        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          type="date"
          value={dateValue}
          onChange={e => onDateChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-xs bg-transparent border-0 outline-none text-gray-800 font-medium flex-1 cursor-pointer min-w-0"
        />
        <span className="text-gray-300 font-light select-none">|</span>
        <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          type="text"
          inputMode="numeric"
          value={timeValue}
          onChange={handleTimeInputChange}
          onKeyDown={handleKeyDown}
          placeholder="HH:mm"
          maxLength={5}
          className={`text-xs bg-transparent border-0 outline-none font-medium w-12 font-mono text-center ${
            hasError ? 'text-red-600' : 'text-gray-800'
          }`}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: ComboboxField cho Nhân sự và Máy móc
// ─────────────────────────────────────────────────────────────────────────────
interface ComboboxOption {
  value: string;
  label: string;
  subLabel?: string;
  extra?: any;
}

interface ComboboxFieldProps {
  label: string;
  value: string;
  initialValue?: string;
  onChange: (val: string, option?: ComboboxOption) => void;
  onEscRevert?: () => void;
  options: ComboboxOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const ComboboxField: React.FC<ComboboxFieldProps> = ({
  label,
  value,
  initialValue = '',
  onChange,
  onEscRevert,
  options,
  placeholder = 'Nhập để tìm kiếm...',
  required = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  const filtered = useMemo(() => {
    if (!options || !Array.isArray(options)) return [];
    if (!searchTerm.trim()) return options;
    const term = removeVietnameseTones(searchTerm);
    return options.filter(opt => {
      if (!opt) return false;
      const l = opt.label ? removeVietnameseTones(String(opt.label)) : '';
      const s = opt.subLabel ? removeVietnameseTones(String(opt.subLabel)) : '';
      const v = opt.value ? removeVietnameseTones(String(opt.value)) : '';
      return l.includes(term) || s.includes(term) || v.includes(term);
    });
  }, [options, searchTerm]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelect = (opt: ComboboxOption) => {
    setSearchTerm(opt.value);
    onChange(opt.value, opt);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    onChange(val);
    setIsOpen(true);
    setHighlightIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      const reverted = initialValue;
      setSearchTerm(reverted);
      onChange(reverted);
      onEscRevert?.();
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        handleSelect(filtered[highlightIndex]);
      } else if (filtered.length === 1) {
        handleSelect(filtered[0]);
      } else {
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="relative flex flex-col gap-1" ref={containerRef}>
      <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
        <span>{label} {required && <span className="text-red-500">*</span>}</span>
        {options.length > 0 && (
          <span className="text-[10px] text-gray-400 font-normal">
            ({options.length} mục)
          </span>
        )}
      </label>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm transition-all disabled:bg-gray-100 disabled:text-gray-400"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1">
          {filtered.length > 0 ? (
            <ul ref={listRef} className="py-1">
              {filtered.slice(0, 100).map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightIndex;
                return (
                  <li
                    key={`${opt.value}-${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(opt);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-3 py-1.5 cursor-pointer text-xs flex items-center justify-between transition-colors border-b border-gray-50 last:border-0 ${
                      isHighlighted ? 'bg-primary-50 text-primary-900' : isSelected ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-medium truncate">{opt.label}</span>
                      {opt.subLabel && (
                        <span className="text-[10px] text-gray-500 truncate">{opt.subLabel}</span>
                      )}
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary-700 shrink-0 ml-2" />}
                  </li>
                );
              })}
              {filtered.length > 100 && (
                <li className="px-3 py-1 text-center text-[10px] text-gray-400 bg-gray-50 italic">
                  Hiển thị 100 / {filtered.length} kết quả... gõ để lọc thêm
                </li>
              )}
            </ul>
          ) : (
            <div className="p-3 text-center text-xs text-gray-400 italic">
              Không có mục nào khớp với "{searchTerm}".
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponent: TechniqueComboboxField — Gợi ý Kỹ thuật [Mã TĐ] [Tên KT] [Đơn giá]
// ─────────────────────────────────────────────────────────────────────────────
interface TechniqueComboboxProps {
  label: string;
  fieldMode: 'name' | 'code';
  value: string;
  initialValue?: string;
  availableTechniques: SurgeryNamePrice[];
  onSelectTechnique: (tech: SurgeryNamePrice) => void;
  onManualChange: (val: string) => void;
  onEscRevert?: () => void;
  placeholder?: string;
  required?: boolean;
}

const TechniqueComboboxField: React.FC<TechniqueComboboxProps> = ({
  label,
  fieldMode,
  value,
  initialValue = '',
  availableTechniques,
  onSelectTechnique,
  onManualChange,
  onEscRevert,
  placeholder,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  const filtered = useMemo(() => {
    if (!availableTechniques || availableTechniques.length === 0) return [];
    if (!searchTerm.trim()) return availableTechniques;
    const term = removeVietnameseTones(searchTerm);
    return availableTechniques.filter(tech => {
      if (!tech) return false;
      const nameMatch = tech.tenKT ? removeVietnameseTones(tech.tenKT).includes(term) : false;
      const codeMatch = tech.maTuongDuong ? removeVietnameseTones(tech.maTuongDuong).includes(term) : false;
      return nameMatch || codeMatch;
    });
  }, [availableTechniques, searchTerm]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelect = (tech: SurgeryNamePrice) => {
    setSearchTerm(fieldMode === 'name' ? tech.tenKT : (tech.maTuongDuong || ''));
    onSelectTechnique(tech);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    onManualChange(val);
    setIsOpen(true);
    setHighlightIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setSearchTerm(initialValue);
      onManualChange(initialValue);
      onEscRevert?.();
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        handleSelect(filtered[highlightIndex]);
      } else if (filtered.length === 1) {
        handleSelect(filtered[0]);
      } else {
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="relative flex flex-col gap-1" ref={containerRef}>
      <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
        <span>{label} {required && <span className="text-red-500">*</span>}</span>
        {availableTechniques.length > 0 && (
          <span className="text-[10px] text-gray-400 font-normal">
            ({availableTechniques.length} mục)
          </span>
        )}
      </label>
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm transition-all ${
            fieldMode === 'code' ? 'font-mono text-primary-700 font-semibold' : ''
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-1 w-full min-w-[320px] md:min-w-[480px]">
          {filtered.length > 0 ? (
            <ul ref={listRef} className="divide-y divide-gray-100">
              {filtered.slice(0, 100).map((tech, idx) => {
                const isSelected = fieldMode === 'name'
                  ? tech.tenKT === value
                  : tech.maTuongDuong === value;
                const isHighlighted = idx === highlightIndex;
                return (
                  <li
                    key={`${tech.maTuongDuong || ''}_${tech.tenKT}_${idx}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(tech);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-3 py-2 cursor-pointer text-xs flex items-center justify-between gap-2 transition-colors group ${
                      isHighlighted ? 'bg-primary-50 text-primary-900' : isSelected ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {tech.maTuongDuong && (
                        <span className="shrink-0 font-mono text-[10px] text-gray-600 bg-gray-100 group-hover:bg-primary-100 group-hover:text-primary-700 px-1.5 py-0.5 rounded font-semibold border border-gray-200 min-w-[80px] text-center">
                          {tech.maTuongDuong}
                        </span>
                      )}
                      <span className="font-medium text-gray-800 group-hover:text-primary-900 truncate">
                        {tech.tenKT}
                      </span>
                    </div>
                    {tech.price !== undefined && tech.price !== null && (
                      <span className="shrink-0 text-[11px] font-semibold text-emerald-700 ml-2 whitespace-nowrap">
                        {formatNumber(tech.price)} đ
                      </span>
                    )}
                  </li>
                );
              })}
              {filtered.length > 100 && (
                <li className="px-3 py-1.5 text-center text-[10px] text-gray-400 bg-gray-50 italic">
                  Hiển thị 100 / {filtered.length} kết quả... tiếp tục gõ để lọc thêm
                </li>
              )}
            </ul>
          ) : (
            <div className="p-3 text-center text-xs text-gray-400 italic">
              Không có kỹ thuật nào khớp với "{searchTerm}".
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Edit Modal
// ─────────────────────────────────────────────────────────────────────────────
export const SurgeryEditModal: React.FC<Props> = ({
  isOpen,
  record,
  onClose,
  onSave,
  staffList = [],
  machineRegistry = [],
  surgeryNamePrices = [],
}) => {
  // Snapshot giá trị ban đầu để Revert khi bấm ESC
  const initialSnapshotRef = useRef<Record<string, any>>({});

  // Form State
  const [formData, setFormData] = useState<Partial<SurgeryRecord>>({});

  // Cụm Thời gian bắt đầu
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');

  // Cụm Thời gian kết thúc
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // Cụm Thời gian chỉ định
  const [cdDate, setCdDate] = useState('');
  const [cdTime, setCdTime] = useState('');

  // Khởi tạo state khi mở modal hoặc thay đổi record
  useEffect(() => {
    if (record) {
      const initStart = parseDateTimeToLocalParts(record.ngayBD, record.start);
      const initEnd = parseDateTimeToLocalParts(record.ngayKT, record.end);
      const initCD = parseDateTimeToLocalParts(record.ngayCD);

      const initQty = record.soLuong ?? 1;
      const initPrice = record.donGia ?? 0;
      const initTotal = record.thanhTien ?? (initQty * initPrice);

      const initialValues: Record<string, any> = {
        patientId: record.patientId || '',
        patientName: record.patientName || '',
        gender: record.gender || '',
        yob: record.yob || '',
        bhyt: record.bhyt || '',
        startDate: initStart.date,
        startTime: initStart.time,
        endDate: initEnd.date,
        endTime: initEnd.time,
        cdDate: initCD.date,
        cdTime: initCD.time,
        loaiPTTT: record.loaiPTTT || '',
        tenKT: record.tenKT || '',
        maTuongDuong: record.maTuongDuong || '',
        soLuong: initQty,
        donGia: initPrice,
        thanhTien: initTotal,
        ptChinh: record.ptChinh || '',
        ptPhu: record.ptPhu || '',
        bsGM: record.bsGM || '',
        ktvGM: record.ktvGM || '',
        tdc: record.tdc || '',
        gv: record.gv || '',
        machine: record.machine || '',
        machineCode: record.machineCode || '',
      };

      initialSnapshotRef.current = initialValues;

      setFormData({
        ...record,
        soLuong: initQty,
        donGia: initPrice,
        thanhTien: initTotal,
      });

      setStartDate(initStart.date);
      setStartTime(initStart.time);
      setEndDate(initEnd.date);
      setEndTime(initEnd.time);
      setCdDate(initCD.date);
      setCdTime(initCD.time);
    }
  }, [record]);

  // Revert 1 trường cụ thể về snapshot ban đầu
  const revertField = (fieldName: string) => {
    const init = initialSnapshotRef.current;
    if (!init) return;

    if (fieldName === 'startDate' || fieldName === 'startTime') {
      setStartDate(init.startDate || '');
      setStartTime(init.startTime || '');
    } else if (fieldName === 'endDate' || fieldName === 'endTime') {
      setEndDate(init.endDate || '');
      setEndTime(init.endTime || '');
    } else if (fieldName === 'cdDate' || fieldName === 'cdTime') {
      setCdDate(init.cdDate || '');
      setCdTime(init.cdTime || '');
    } else if (fieldName === 'technique') {
      setFormData(prev => ({
        ...prev,
        tenKT: init.tenKT || '',
        maTuongDuong: init.maTuongDuong || '',
        donGia: init.donGia ?? 0,
        thanhTien: init.thanhTien ?? 0,
      }));
    } else if (fieldName === 'machine') {
      setFormData(prev => ({
        ...prev,
        machine: init.machine || '',
        machineCode: init.machineCode || '',
      }));
    } else if (fieldName === 'soLuong') {
      const qty = init.soLuong ?? 1;
      setFormData(prev => ({
        ...prev,
        soLuong: qty,
        thanhTien: qty * (prev.donGia ?? 0),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [fieldName]: init[fieldName],
      }));
    }
  };

  // Handler bắt ESC cho các ô input thông thường
  const handleInputKeyDownEsc = (fieldName: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      revertField(fieldName);
    }
  };

  // Tính số phút phẫu thuật tự động từ thời gian bắt đầu và kết thúc
  const calculatedMinutes = useMemo(() => {
    return computeDurationMinutes(startDate, startTime, endDate, endTime);
  }, [startDate, startTime, endDate, endTime]);

  // Ngày phẫu thuật chuẩn hóa (dùng lọc danh mục kỹ thuật theo khoảng hiệu lực)
  const surgeryDateKey = startDate || parseToDateKey(formData.ngayBD || formData.start || record?.ngayBD || record?.start);

  // Danh mục kỹ thuật có hiệu lực tại ngày phẫu thuật
  const availableTechniques = useMemo(() => {
    if (!surgeryNamePrices || surgeryNamePrices.length === 0) return [];
    if (!surgeryDateKey) return surgeryNamePrices;

    return surgeryNamePrices.filter(p => {
      if (!p) return false;
      const from = parseToDateKey(p.effectiveFrom);
      const to = parseToDateKey(p.effectiveTo);
      if (from && from > surgeryDateKey) return false;
      if (to && to < surgeryDateKey) return false;
      return true;
    });
  }, [surgeryNamePrices, surgeryDateKey]);

  // Options combobox cho Nhân sự
  const staffOptions: ComboboxOption[] = useMemo(() => {
    return (staffList || []).map(s => ({
      value: s.name || '',
      label: s.name || '',
      subLabel: [s.position, s.department].filter(Boolean).join(' - '),
    }));
  }, [staffList]);

  // Options combobox cho Máy móc
  const machineOptions: ComboboxOption[] = useMemo(() => {
    return (machineRegistry || []).map(m => ({
      value: m.machineName || '',
      label: m.machineName || '',
      subLabel: m.machineCode ? `Mã máy: ${m.machineCode}` : undefined,
      extra: m,
    }));
  }, [machineRegistry]);

  // Options danh sách chuẩn cho Loại PT/TT
  const loaiPTTTOptions = [
    { value: 'PĐB', label: 'PĐB - Phẫu thuật đặc biệt' },
    { value: 'P1', label: 'P1 - Phẫu thuật loại 1' },
    { value: 'P2', label: 'P2 - Phẫu thuật loại 2' },
    { value: 'P3', label: 'P3 - Phẫu thuật loại 3' },
    { value: 'TĐB', label: 'TĐB - Thủ thuật đặc biệt' },
    { value: 'T1', label: 'T1 - Thủ thuật loại 1' },
    { value: 'T2', label: 'T2 - Thủ thuật loại 2' },
    { value: 'T3', label: 'T3 - Thủ thuật loại 3' },
    { value: 'TKPL', label: 'TKPL - Không phân loại' },
  ];

  if (!isOpen || !record) return null;

  // Handler khi chọn kỹ thuật từ danh mục gợi ý (qua ô Tên hoặc ô Mã TĐ)
  const handleSelectTechnique = (tech: SurgeryNamePrice) => {
    const newPrice = tech.price !== undefined ? tech.price : (formData.donGia ?? 0);
    const qty = formData.soLuong ?? 1;
    setFormData(prev => ({
      ...prev,
      tenKT: tech.tenKT,
      maTuongDuong: tech.maTuongDuong || prev.maTuongDuong,
      donGia: newPrice,
      thanhTien: qty * newPrice,
    }));
  };

  // Handler khi chọn Tên máy -> Tự động điền Mã máy theo danh mục
  const handleSelectMachine = (machineName: string, opt?: ComboboxOption) => {
    let code = opt?.extra?.machineCode;
    if (!code && machineName) {
      const found = (machineRegistry || []).find(m =>
        m.machineName?.trim().toLowerCase() === machineName.trim().toLowerCase() ||
        removeVietnameseTones(m.machineName || '') === removeVietnameseTones(machineName)
      );
      if (found) {
        code = found.machineCode;
      }
    }
    setFormData(prev => ({
      ...prev,
      machine: machineName,
      machineCode: code !== undefined ? code : prev.machineCode,
    }));
  };

  // Handler khi đổi số lượng -> Tự động tính Thành tiền
  const handleQuantityChange = (qty: number) => {
    setFormData(prev => ({
      ...prev,
      soLuong: qty,
      thanhTien: qty * (prev.donGia ?? 0),
    }));
  };

  // Validation: Thời gian chỉ định ≤ Thời gian bắt đầu < Thời gian kết thúc
  const timeValidation = useMemo(() => {
    const errors: { start?: string; end?: string; cd?: string } = {};
    const sObj = combineDateAndTime(startDate, startTime);
    const eObj = combineDateAndTime(endDate, endTime);
    const cObj = combineDateAndTime(cdDate, cdTime);

    if (sObj && eObj && eObj.getTime() <= sObj.getTime()) {
      errors.end = 'Phải sau TG bắt đầu';
    }
    if (cObj && sObj && sObj.getTime() < cObj.getTime()) {
      errors.cd = 'Phải ≤ TG bắt đầu';
    }
    return errors;
  }, [startDate, startTime, endDate, endTime, cdDate, cdTime]);

  const hasTimeErrors = Object.keys(timeValidation).length > 0;

  // Submit Lưu
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Chặn lưu nếu có lỗi thời gian
    if (hasTimeErrors) return;

    // Tạo Date object cho start và end
    const startDateObj = combineDateAndTime(startDate, startTime) || record.start;
    const endDateObj = combineDateAndTime(endDate, endTime) || record.end;
    const cdDateObj = combineDateAndTime(cdDate, cdTime);

    const finalMins = calculatedMinutes !== null ? calculatedMinutes : Number(formData.timeMinutes ?? record.timeMinutes ?? 0);

    const updated: SurgeryRecord = {
      ...record,
      ...formData,
      start: startDateObj,
      end: endDateObj,
      ngayBD: startDateObj ? startDateObj.toISOString() : (record.ngayBD || ''),
      ngayKT: endDateObj ? endDateObj.toISOString() : (record.ngayKT || ''),
      ngayCD: cdDateObj ? cdDateObj.toISOString() : (record.ngayCD || ''),
      timeMinutes: finalMins,
      soLuong: Number(formData.soLuong ?? 1),
      donGia: Number(formData.donGia ?? 0),
      thanhTien: Number(formData.thanhTien ?? 0),
    };

    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shadow-sm">
              <Stethoscope className="h-5 w-5 text-primary-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  Chỉnh sửa thông tin phẫu thuật
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-50 text-primary-700 border border-primary-200">
                  STT: {record.stt || '#'}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                BN: <strong className="text-gray-800">{formData.patientName || record.patientName}</strong> • Mã: <strong className="text-gray-800">{formData.patientId || record.patientId}</strong>
                {surgeryDateKey && ` • Ngày mổ: ${surgeryDateKey.split('-').reverse().join('/')}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable Form */}
        <form id="surgery-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Thông báo lọc danh mục theo ngày */}
          {surgeryDateKey && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-blue-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
                <span>
                  Đang tự động áp dụng danh mục kỹ thuật có hiệu lực tại ngày <strong>{surgeryDateKey.split('-').reverse().join('/')}</strong> ({availableTechniques.length} kỹ thuật có giá phù hợp).
                </span>
              </div>
              <span className="text-[11px] text-blue-600 italic">
                💡 Nhấn ESC trong bất kỳ ô nào để khôi phục lại giá trị ban đầu.
              </span>
            </div>
          )}

          {/* NHÓM 1: THÔNG TIN BỆNH NHÂN */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-primary-700" />
              1. Thông tin bệnh nhân & Thẻ BHYT
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã BN *</label>
                <input
                  type="text"
                  required
                  value={formData.patientId || ''}
                  onChange={e => setFormData({ ...formData, patientId: e.target.value })}
                  onKeyDown={handleInputKeyDownEsc('patientId')}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={formData.patientName || ''}
                  onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                  onKeyDown={handleInputKeyDownEsc('patientName')}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giới tính</label>
                <select
                  value={formData.gender || ''}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  onKeyDown={handleInputKeyDownEsc('gender')}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                >
                  <option value="">-- Chọn --</option>
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Năm sinh</label>
                <input
                  type="text"
                  value={formData.yob || ''}
                  onChange={e => setFormData({ ...formData, yob: e.target.value })}
                  onKeyDown={handleInputKeyDownEsc('yob')}
                  placeholder="VD: 1985"
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã thẻ BHYT</label>
                <input
                  type="text"
                  value={formData.bhyt || ''}
                  onChange={e => setFormData({ ...formData, bhyt: e.target.value })}
                  onKeyDown={handleInputKeyDownEsc('bhyt')}
                  placeholder="VD: DN4313120935606"
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* NHÓM 2: THỜI GIAN & PHÂN LOẠI (Chuẩn hóa đồng nhất & thân thiện) */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-700" />
              2. Thời gian thực hiện & Phân loại
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Thời gian bắt đầu */}
              <DateTimeField
                label="Thời gian bắt đầu"
                dateValue={startDate}
                timeValue={startTime}
                onDateChange={setStartDate}
                onTimeChange={setStartTime}
                onEscRevert={() => revertField('startDate')}
                required
                hasError={!!timeValidation.start}
                errorMsg={timeValidation.start}
              />

              {/* Thời gian kết thúc */}
              <DateTimeField
                label="Thời gian kết thúc"
                dateValue={endDate}
                timeValue={endTime}
                onDateChange={setEndDate}
                onTimeChange={setEndTime}
                onEscRevert={() => revertField('endDate')}
                required
                hasError={!!timeValidation.end}
                errorMsg={timeValidation.end}
              />

              {/* Thời gian phút (Tự động tính & khóa readOnly) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                  <span>Thời gian (Phút)</span>
                  <span className="text-[10px] text-gray-400 font-normal">(Tự động tính)</span>
                </label>
                <div className="flex items-center px-3 py-1.5 h-[34px] text-xs border border-gray-200 rounded-lg bg-gray-100 text-primary-800 font-bold shadow-sm cursor-not-allowed">
                  <span>
                    {calculatedMinutes !== null ? `${calculatedMinutes} phút` : '—'}
                  </span>
                </div>
              </div>

              {/* Thời gian chỉ định */}
              <DateTimeField
                label="Thời gian chỉ định"
                dateValue={cdDate}
                timeValue={cdTime}
                onDateChange={setCdDate}
                onTimeChange={setCdTime}
                onEscRevert={() => revertField('cdDate')}
                hasError={!!timeValidation.cd}
                errorMsg={timeValidation.cd}
              />

              {/* Loại PT/TT (Danh sách chọn chuẩn) */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-semibold text-gray-700">Loại PT/TT</label>
                <select
                  value={formData.loaiPTTT || ''}
                  onChange={e => setFormData({ ...formData, loaiPTTT: e.target.value })}
                  onKeyDown={handleInputKeyDownEsc('loaiPTTT')}
                  className="w-full px-3 py-1.5 h-[34px] text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-medium"
                >
                  <option value="">-- Chọn loại PT/TT --</option>
                  {loaiPTTTOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {/* Trường hợp giá trị hiện tại là một mã tùy biến khác */}
                  {formData.loaiPTTT && !loaiPTTTOptions.some(o => o.value === formData.loaiPTTT) && (
                    <option value={formData.loaiPTTT}>{formData.loaiPTTT}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* NHÓM 3: KỸ THUẬT & GIÁ DỊCH VỤ (Tìm kiếm 2 chiều: Tên KT hoặc Mã TĐ) */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary-700" />
              3. Kỹ thuật & Giá dịch vụ (Chọn theo Tên hoặc Mã tương đương)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Chọn theo Tên kỹ thuật */}
              <div className="md:col-span-8">
                <TechniqueComboboxField
                  label="Tên kỹ thuật phẫu thuật / thủ thuật *"
                  fieldMode="name"
                  value={formData.tenKT || ''}
                  initialValue={initialSnapshotRef.current.tenKT || ''}
                  availableTechniques={availableTechniques}
                  onSelectTechnique={handleSelectTechnique}
                  onManualChange={val => setFormData({ ...formData, tenKT: val })}
                  onEscRevert={() => revertField('technique')}
                  placeholder="Gõ tên kỹ thuật hoặc mã tương đương để tìm..."
                  required
                />
              </div>

              {/* Chọn theo Mã tương đương */}
              <div className="md:col-span-4">
                <TechniqueComboboxField
                  label="Mã tương đương"
                  fieldMode="code"
                  value={formData.maTuongDuong || ''}
                  initialValue={initialSnapshotRef.current.maTuongDuong || ''}
                  availableTechniques={availableTechniques}
                  onSelectTechnique={handleSelectTechnique}
                  onManualChange={val => setFormData({ ...formData, maTuongDuong: val })}
                  onEscRevert={() => revertField('technique')}
                  placeholder="Gõ mã tương đương (XX.XXXX.XXXX)..."
                />
              </div>

              {/* Số lượng */}
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số lượng</label>
                <input
                  type="number"
                  step="any"
                  value={formData.soLuong ?? 1}
                  onChange={e => handleQuantityChange(Number(e.target.value))}
                  onKeyDown={handleInputKeyDownEsc('soLuong')}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-semibold"
                />
              </div>

              {/* Đơn giá (Ăn theo kỹ thuật, KHÓA readOnly) */}
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                  <span>Đơn giá (VNĐ)</span>
                  <span className="text-[10px] text-gray-400 font-normal">(Ăn theo danh mục giá)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={formatNumber(formData.donGia)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-100/90 text-gray-700 outline-none shadow-sm font-semibold cursor-not-allowed"
                />
                <span className="text-[10px] text-gray-500 mt-0.5 block">
                  💡 Muốn sửa đơn giá xin vào tab Cấu hình giá
                </span>
              </div>

              {/* Thành tiền = Số lượng x Đơn giá (KHÓA readOnly) */}
              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                  <span>Thành tiền (VNĐ)</span>
                  <span className="text-[10px] text-emerald-700 font-medium">(= SL × Đơn giá)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={formatNumber(formData.thanhTien)}
                  className="w-full px-3 py-1.5 text-xs border border-emerald-300 rounded-lg bg-emerald-50/70 text-emerald-800 font-bold outline-none shadow-sm cursor-not-allowed text-base"
                />
                <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
                  = {formatNumber(formData.thanhTien)} đ
                </span>
              </div>
            </div>
          </div>

          {/* NHÓM 4: KÍP MỔ & MÁY MÓC */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-700" />
              4. Kíp mổ (Nhân sự) & Thiết bị máy móc
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <ComboboxField
                label="Phẫu thuật chính"
                value={formData.ptChinh || ''}
                initialValue={initialSnapshotRef.current.ptChinh || ''}
                onChange={val => setFormData({ ...formData, ptChinh: val })}
                onEscRevert={() => revertField('ptChinh')}
                options={staffOptions}
                placeholder="Gõ tên BS mổ chính..."
              />
              <ComboboxField
                label="Phẫu thuật phụ"
                value={formData.ptPhu || ''}
                initialValue={initialSnapshotRef.current.ptPhu || ''}
                onChange={val => setFormData({ ...formData, ptPhu: val })}
                onEscRevert={() => revertField('ptPhu')}
                options={staffOptions}
                placeholder="Gõ tên BS/KTV phụ..."
              />
              <ComboboxField
                label="Bác sĩ gây mê"
                value={formData.bsGM || ''}
                initialValue={initialSnapshotRef.current.bsGM || ''}
                onChange={val => setFormData({ ...formData, bsGM: val })}
                onEscRevert={() => revertField('bsGM')}
                options={staffOptions}
                placeholder="Gõ tên BS gây mê..."
              />
              <ComboboxField
                label="Kỹ thuật viên gây mê"
                value={formData.ktvGM || ''}
                initialValue={initialSnapshotRef.current.ktvGM || ''}
                onChange={val => setFormData({ ...formData, ktvGM: val })}
                onEscRevert={() => revertField('ktvGM')}
                options={staffOptions}
                placeholder="Gõ tên KTV gây mê..."
              />
              <ComboboxField
                label="Thay dụng cụ"
                value={formData.tdc || ''}
                initialValue={initialSnapshotRef.current.tdc || ''}
                onChange={val => setFormData({ ...formData, tdc: val })}
                onEscRevert={() => revertField('tdc')}
                options={staffOptions}
                placeholder="Gõ tên người thay DC..."
              />
              <ComboboxField
                label="Giúp việc"
                value={formData.gv || ''}
                initialValue={initialSnapshotRef.current.gv || ''}
                onChange={val => setFormData({ ...formData, gv: val })}
                onEscRevert={() => revertField('gv')}
                options={staffOptions}
                placeholder="Gõ tên người giúp việc..."
              />

              {/* Tên máy */}
              <div className="sm:col-span-2">
                <ComboboxField
                  label="Tên máy thực hiện"
                  value={formData.machine || ''}
                  initialValue={initialSnapshotRef.current.machine || ''}
                  onChange={handleSelectMachine}
                  onEscRevert={() => revertField('machine')}
                  options={machineOptions}
                  placeholder="Gõ tên thiết bị máy..."
                />
              </div>

              {/* Mã máy (Tự động ăn theo tên máy, KHÓA readOnly) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                  <span>Mã máy</span>
                  <span className="text-[10px] text-gray-400 font-normal">(Ăn theo tên máy)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.machineCode || ''}
                  placeholder="(Tự động theo tên máy)"
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-100 text-gray-700 font-mono shadow-sm cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50/80">
          <div className="text-xs text-gray-500">
            💡 Bấm <strong>Lưu thay đổi</strong> sẽ cập nhật trực tiếp bản ghi vào danh sách đang mở.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              form="surgery-edit-form"
              disabled={hasTimeErrors}
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95 ${
                hasTimeErrors
                  ? 'bg-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-primary-700 hover:bg-primary-800 shadow-primary-700/20'
              }`}
              title={hasTimeErrors ? 'Vui lòng sửa lỗi thời gian trước khi lưu' : ''}
            >
              <Save className="h-4 w-4" />
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
