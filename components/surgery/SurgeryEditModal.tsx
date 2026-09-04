/**
 * SurgeryEditModal — Modal chỉnh sửa toàn diện thông tin 1 record phẫu thuật
 * Hỗ trợ type-to-filter cho các trường danh mục (Kỹ thuật/Giá, Nhân sự kíp mổ, Máy móc)
 * Tự động lọc danh mục kỹ thuật theo khoảng hiệu lực chứa ngày phẫu thuật.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, Save, User, Calendar, Clock, Stethoscope, Users,
  Cpu, DollarSign, ChevronDown, Check, AlertCircle, Sparkles
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

/** Format Date object to HH:mm string */
function formatTimeToHHMM(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (typeof d === 'string') {
    const m = d.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component Combobox chọn từ danh mục kèm Type-to-filter
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
  onChange: (val: string, option?: ComboboxOption) => void;
  options: ComboboxOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const ComboboxField: React.FC<ComboboxFieldProps> = ({
  label,
  value,
  onChange,
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

  // Lọc options theo từ khóa
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = removeVietnameseTones(searchTerm);
    return options.filter(opt =>
      removeVietnameseTones(opt.label).includes(term) ||
      (opt.subLabel && removeVietnameseTones(opt.subLabel).includes(term)) ||
      removeVietnameseTones(opt.value).includes(term)
    );
  }, [options, searchTerm]);

  // Đóng khi click ngoài
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
    } else if (e.key === 'Escape') {
      setIsOpen(false);
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
          className="w-full px-3 py-2 pr-8 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm transition-all disabled:bg-gray-100 disabled:text-gray-400"
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

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1">
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
                    className={`px-3 py-2 cursor-pointer text-xs flex items-center justify-between transition-colors border-b border-gray-50 last:border-0 ${
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
                <li className="px-3 py-1.5 text-center text-[10px] text-gray-400 bg-gray-50 italic">
                  Hiển thị 100 / {filtered.length} kết quả... tiếp tục gõ để lọc thêm
                </li>
              )}
            </ul>
          ) : (
            <div className="p-3 text-center text-xs text-gray-400 italic">
              Không có mục nào khớp với "{searchTerm}". Bạn vẫn có thể giữ nguyên giá trị đã gõ.
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
  // Form State
  const [formData, setFormData] = useState<Partial<SurgeryRecord>>({});
  const [startTimeStr, setStartTimeStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');

  // Khởi tạo state khi mở modal hoặc thay đổi record
  useEffect(() => {
    if (record) {
      setFormData({
        ...record,
        soLuong: record.soLuong ?? 1,
        donGia: record.donGia ?? 0,
        thanhTien: record.thanhTien ?? ((record.soLuong ?? 1) * (record.donGia ?? 0)),
      });
      setStartTimeStr(formatTimeToHHMM(record.start));
      setEndTimeStr(formatTimeToHHMM(record.end));
    }
  }, [record]);

  if (!isOpen || !record) return null;

  // Ngày phẫu thuật chuẩn hóa của ca mổ (dùng để lọc danh mục kỹ thuật theo khoảng hiệu lực)
  const surgeryDateKey = parseToDateKey(formData.ngayBD || formData.start || record.ngayBD || record.start);

  // Danh mục kỹ thuật có hiệu lực tại ngày phẫu thuật
  const availableTechniques = useMemo(() => {
    if (!surgeryNamePrices || surgeryNamePrices.length === 0) return [];
    if (!surgeryDateKey) {
      // Nếu chưa có ngày, hiển thị tất cả
      return surgeryNamePrices;
    }

    return surgeryNamePrices.filter(p => {
      const from = parseToDateKey(p.effectiveFrom);
      const to = parseToDateKey(p.effectiveTo);
      if (from && from > surgeryDateKey) return false;
      if (to && to < surgeryDateKey) return false;
      return true;
    });
  }, [surgeryNamePrices, surgeryDateKey]);

  // Options combobox cho Tên kỹ thuật
  const techniqueOptions: ComboboxOption[] = useMemo(() => {
    return availableTechniques.map(p => {
      const priceText = p.price ? `${formatNumber(p.price)} đ` : 'Chưa có giá';
      const codeText = p.maTuongDuong ? `Mã: ${p.maTuongDuong}` : '';
      const sub = [codeText, priceText].filter(Boolean).join(' • ');
      return {
        value: p.tenKT,
        label: p.tenKT,
        subLabel: sub,
        extra: p,
      };
    });
  }, [availableTechniques]);

  // Options combobox cho Nhân sự
  const staffOptions: ComboboxOption[] = useMemo(() => {
    return staffList.map(s => ({
      value: s.name,
      label: s.name,
      subLabel: [s.position, s.department].filter(Boolean).join(' - '),
    }));
  }, [staffList]);

  // Options combobox cho Máy móc
  const machineOptions: ComboboxOption[] = useMemo(() => {
    return machineRegistry.map(m => ({
      value: m.machineName,
      label: m.machineName,
      subLabel: m.machineCode ? `Mã máy: ${m.machineCode}` : undefined,
      extra: m,
    }));
  }, [machineRegistry]);

  // Options loại PT/TT
  const loaiOptions: ComboboxOption[] = [
    { value: 'PĐB', label: 'PĐB - Phẫu thuật đặc biệt' },
    { value: 'P1', label: 'P1 - Phẫu thuật loại 1' },
    { value: 'P2', label: 'P2 - Phẫu thuật loại 2' },
    { value: 'P3', label: 'P3 - Phẫu thuật loại 3' },
    { value: 'TĐB', label: 'TĐB - Thủ thuật đặc biệt' },
    { value: 'T1', label: 'T1 - Thủ thuật loại 1' },
    { value: 'T2', label: 'T2 - Thủ thuật loại 2' },
    { value: 'T3', label: 'T3 - Thủ thuật loại 3' },
  ];

  // Handler khi chọn kỹ thuật từ combobox -> Tự động điền mã tương đương & giá
  const handleSelectTechnique = (name: string, opt?: ComboboxOption) => {
    const extra: SurgeryNamePrice | undefined = opt?.extra;
    setFormData(prev => {
      const newPrice = extra?.price !== undefined ? extra.price : prev.donGia ?? 0;
      const qty = prev.soLuong ?? 1;
      return {
        ...prev,
        tenKT: name,
        maTuongDuong: extra?.maTuongDuong || prev.maTuongDuong,
        donGia: newPrice,
        thanhTien: qty * newPrice,
      };
    });
  };

  // Handler khi chọn máy móc -> Tự động điền mã máy
  const handleSelectMachine = (machineName: string, opt?: ComboboxOption) => {
    const extra: MachineEntry | undefined = opt?.extra;
    setFormData(prev => ({
      ...prev,
      machine: machineName,
      machineCode: extra?.machineCode || prev.machineCode,
    }));
  };

  // Handler khi đổi số lượng -> Tự động tính thành tiền
  const handleQuantityChange = (qty: number) => {
    setFormData(prev => ({
      ...prev,
      soLuong: qty,
      thanhTien: qty * (prev.donGia ?? 0),
    }));
  };

  // Handler khi đổi đơn giá -> Tự động tính thành tiền
  const handlePriceChange = (price: number) => {
    setFormData(prev => ({
      ...prev,
      donGia: price,
      thanhTien: (prev.soLuong ?? 1) * price,
    }));
  };

  // Handler khi đổi giờ bắt đầu / kết thúc -> Tự động tính số phút
  const calculateDurationMinutes = (st: string, et: string): number | null => {
    if (!st || !et) return null;
    const [h1, m1] = st.split(':').map(Number);
    const [h2, m2] = et.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return null;

    let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diffMinutes < 0) {
      // Qua đêm
      diffMinutes += 24 * 60;
    }
    return diffMinutes;
  };

  const handleStartTimeChange = (val: string) => {
    setStartTimeStr(val);
    const mins = calculateDurationMinutes(val, endTimeStr);
    if (mins !== null) {
      setFormData(prev => ({ ...prev, timeMinutes: mins }));
    }
  };

  const handleEndTimeChange = (val: string) => {
    setEndTimeStr(val);
    const mins = calculateDurationMinutes(startTimeStr, val);
    if (mins !== null) {
      setFormData(prev => ({ ...prev, timeMinutes: mins }));
    }
  };

  // Submit Lưu
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Tạo Date object cho start và end nếu có
    let startDateObj = record.start;
    let endDateObj = record.end;

    const baseDateStr = formData.ngayBD || formData.ngayKT || surgeryDateKey;
    if (startTimeStr && baseDateStr) {
      const [h, m] = startTimeStr.split(':').map(Number);
      const dKey = parseToDateKey(baseDateStr);
      if (dKey) {
        const [y, mon, day] = dKey.split('-').map(Number);
        startDateObj = new Date(y, mon - 1, day, h, m, 0);
      }
    }
    if (endTimeStr && baseDateStr) {
      const [h, m] = endTimeStr.split(':').map(Number);
      const dKey = parseToDateKey(formData.ngayKT || baseDateStr);
      if (dKey) {
        const [y, mon, day] = dKey.split('-').map(Number);
        endDateObj = new Date(y, mon - 1, day, h, m, 0);
      }
    }

    const updated: SurgeryRecord = {
      ...record,
      ...formData,
      start: startDateObj,
      end: endDateObj,
      timeMinutes: Number(formData.timeMinutes ?? record.timeMinutes ?? 0),
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
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={formData.patientName || ''}
                  onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giới tính</label>
                <select
                  value={formData.gender || ''}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
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
                  placeholder="VD: 1985"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã thẻ BHYT</label>
                <input
                  type="text"
                  value={formData.bhyt || ''}
                  onChange={e => setFormData({ ...formData, bhyt: e.target.value })}
                  placeholder="VD: DN4313120935606"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* NHÓM 2: THỜI GIAN & PHÂN LOẠI */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-700" />
              2. Thời gian thực hiện & Phân loại
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ngày BĐ (DD/MM/YYYY)</label>
                <input
                  type="text"
                  value={formData.ngayBD || ''}
                  onChange={e => setFormData({ ...formData, ngayBD: e.target.value })}
                  placeholder="01/08/2026"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ngày KT (DD/MM/YYYY)</label>
                <input
                  type="text"
                  value={formData.ngayKT || ''}
                  onChange={e => setFormData({ ...formData, ngayKT: e.target.value })}
                  placeholder="01/08/2026"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giờ bắt đầu (HH:mm)</label>
                <input
                  type="time"
                  value={startTimeStr}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giờ kết thúc (HH:mm)</label>
                <input
                  type="time"
                  value={endTimeStr}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Thời gian (Phút)</label>
                <input
                  type="number"
                  value={formData.timeMinutes ?? ''}
                  onChange={e => setFormData({ ...formData, timeMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-semibold text-primary-700"
                />
              </div>
              <div>
                <ComboboxField
                  label="Loại PT/TT"
                  value={formData.loaiPTTT || ''}
                  onChange={val => setFormData({ ...formData, loaiPTTT: val })}
                  options={loaiOptions}
                  placeholder="Chọn loại PT/TT..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ngày chỉ định</label>
                <input
                  type="text"
                  value={formData.ngayCD || ''}
                  onChange={e => setFormData({ ...formData, ngayCD: e.target.value })}
                  placeholder="01/08/2026"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* NHÓM 3: KỸ THUẬT & GIÁ DỊCH VỤ */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary-700" />
              3. Kỹ thuật & Giá dịch vụ (Type để tìm trong DM)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8">
                <ComboboxField
                  label="Tên kỹ thuật phẫu thuật / thủ thuật *"
                  value={formData.tenKT || ''}
                  onChange={handleSelectTechnique}
                  options={techniqueOptions}
                  placeholder="Gõ tên kỹ thuật để tìm nhanh..."
                  required
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã tương đương</label>
                <input
                  type="text"
                  value={formData.maTuongDuong || ''}
                  onChange={e => setFormData({ ...formData, maTuongDuong: e.target.value })}
                  placeholder="XX.XXXX.XXXX"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-mono text-primary-700 font-semibold"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số lượng</label>
                <input
                  type="number"
                  step="any"
                  value={formData.soLuong ?? 1}
                  onChange={e => handleQuantityChange(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-semibold"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Đơn giá (VNĐ)</label>
                <input
                  type="number"
                  value={formData.donGia ?? 0}
                  onChange={e => handlePriceChange(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-semibold text-gray-800"
                />
                <span className="text-[10px] text-gray-400 mt-0.5 block">
                  = {formatNumber(formData.donGia)} đ
                </span>
              </div>
              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Thành tiền (VNĐ)</label>
                <input
                  type="number"
                  value={formData.thanhTien ?? 0}
                  onChange={e => setFormData({ ...formData, thanhTien: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-bold text-primary-800"
                />
                <span className="text-[10px] text-primary-700 font-semibold mt-0.5 block">
                  = {formatNumber(formData.thanhTien)} đ
                </span>
              </div>
            </div>
          </div>

          {/* NHÓM 4: KÍP MỔ & MÁY MÓC */}
          <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-700" />
              4. Kíp mổ (Nhân sự) & Thiết bị máy móc (Type để tìm)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <ComboboxField
                label="Phẫu thuật chính"
                value={formData.ptChinh || ''}
                onChange={val => setFormData({ ...formData, ptChinh: val })}
                options={staffOptions}
                placeholder="Gõ tên BS mổ chính..."
              />
              <ComboboxField
                label="Phẫu thuật phụ"
                value={formData.ptPhu || ''}
                onChange={val => setFormData({ ...formData, ptPhu: val })}
                options={staffOptions}
                placeholder="Gõ tên BS/KTV phụ..."
              />
              <ComboboxField
                label="Bác sĩ gây mê"
                value={formData.bsGM || ''}
                onChange={val => setFormData({ ...formData, bsGM: val })}
                options={staffOptions}
                placeholder="Gõ tên BS gây mê..."
              />
              <ComboboxField
                label="Kỹ thuật viên gây mê"
                value={formData.ktvGM || ''}
                onChange={val => setFormData({ ...formData, ktvGM: val })}
                options={staffOptions}
                placeholder="Gõ tên KTV gây mê..."
              />
              <ComboboxField
                label="Thay dụng cụ"
                value={formData.tdc || ''}
                onChange={val => setFormData({ ...formData, tdc: val })}
                options={staffOptions}
                placeholder="Gõ tên người thay DC..."
              />
              <ComboboxField
                label="Giúp việc"
                value={formData.gv || ''}
                onChange={val => setFormData({ ...formData, gv: val })}
                options={staffOptions}
                placeholder="Gõ tên người giúp việc..."
              />
              <div className="sm:col-span-2">
                <ComboboxField
                  label="Tên máy thực hiện"
                  value={formData.machine || ''}
                  onChange={handleSelectMachine}
                  options={machineOptions}
                  placeholder="Gõ tên thiết bị máy..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã máy</label>
                <input
                  type="text"
                  value={formData.machineCode || ''}
                  onChange={e => setFormData({ ...formData, machineCode: e.target.value })}
                  placeholder="Mã máy..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm font-mono"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50/80">
          <div className="text-xs text-gray-400">
            💡 Bấm Lưu sẽ cập nhật trực tiếp bản ghi vào danh sách đang mở.
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
              className="px-5 py-2 text-xs font-bold text-white bg-primary-700 hover:bg-primary-800 rounded-xl shadow-md shadow-primary-700/20 transition-all flex items-center gap-2 active:scale-95"
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
