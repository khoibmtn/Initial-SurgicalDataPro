/**
 * Search box + config menu for the "Gói dịch vụ" payment table.
 * Visually matches the DynamicTable toolbar controls so both payment sub-tabs feel the same.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers, ListChecks, Rows3, Search, Settings, X } from 'lucide-react';
import {
  PACKAGE_FIXED_COLUMNS,
  PackageViewMode,
  packageColumnKey,
} from '../../services/packagePaymentRows';

interface SearchProps {
  value: string;
  onChange: (val: string) => void;
}

export const PackagePaymentSearch: React.FC<SearchProps> = ({ value, onChange }) => (
  <div className="flex items-center gap-2 w-[300px] max-w-full">
    <span className="text-sm font-bold text-gray-700 whitespace-nowrap shrink-0">Tìm kiếm:</span>
    <div className="relative flex-1 min-w-[150px]">
      <input
        id="package-payment-search"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Nhập nội dung cần tìm..."
        className="w-full pl-9 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm transition-all"
      />
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Xóa tìm kiếm"
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  </div>
);

interface ConfigProps {
  viewMode: PackageViewMode;
  onViewModeChange: (mode: PackageViewMode) => void;
  hiddenCols: string[];
  onHiddenColsChange: (cols: string[]) => void;
  packageColumns: { id: string; name: string }[];
}

const VIEW_OPTIONS: { key: PackageViewMode; label: string; icon: typeof Rows3 }[] = [
  { key: 'summary', label: 'Tổng hợp', icon: Layers },
  { key: 'detail', label: 'Chi tiết', icon: Rows3 },
];

export const PackagePaymentConfigMenu: React.FC<ConfigProps> = ({
  viewMode,
  onViewModeChange,
  hiddenCols,
  onHiddenColsChange,
  packageColumns,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const columns = [
    ...PACKAGE_FIXED_COLUMNS.filter(c => ['department', 'taxId', 'staffName'].includes(c.key)).map(c => ({ key: c.key as string, label: c.label as string })),
    ...packageColumns.map(p => ({ key: packageColumnKey(p.id), label: p.name })),
    ...PACKAGE_FIXED_COLUMNS.filter(c => ['totalCount', 'total'].includes(c.key)).map(c => ({ key: c.key as string, label: c.label as string })),
  ];

  const toggle = (key: string) =>
    onHiddenColsChange(hiddenCols.includes(key) ? hiddenCols.filter(k => k !== key) : [...hiddenCols, key]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Cấu hình"
        aria-label="Cấu hình bảng thanh toán gói"
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm border ${open ? 'bg-primary-700 text-white border-primary-800' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-700'}`}
      >
        <Settings className="h-4 w-4" />
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fb-dropdown right-0 top-full mt-2 w-64 p-3 space-y-3">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Chế độ hiển thị</span>
            <div className="grid grid-cols-2 gap-1 bg-gray-100 p-0.5 rounded-lg">
              {VIEW_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = viewMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => onViewModeChange(opt.key)}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-all ${active ? 'bg-white text-emerald-700 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-800 font-medium'}`}
                  >
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <ListChecks className="h-2.5 w-2.5" /> Ẩn / Hiện cột
              </span>
              {hiddenCols.length > 0 && (
                <button onClick={() => onHiddenColsChange([])} className="text-[10px] text-primary-700 hover:underline font-medium">
                  Hiện tất cả
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {columns.map(col => {
                const visible = !hiddenCols.includes(col.key);
                return (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary-50/50 rounded-lg cursor-pointer group/item transition-colors">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggle(col.key)}
                      className="rounded border-gray-300 text-primary-700 focus:ring-primary-500 h-3 w-3"
                    />
                    <span className={`text-xs transition-colors ${visible ? 'text-gray-700' : 'text-gray-400'}`}>{col.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
