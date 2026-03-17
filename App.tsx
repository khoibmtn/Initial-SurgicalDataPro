import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from './lib/firebase';
import { processSurgicalFiles } from "./services/excelProcessor";
import { reprocessSurgicalRecords, recalculateResultFromRecords } from "./services/reprocess";
import { ConfigurationTab } from './components/ConfigurationTab';
import { PrintPreview } from './components/PrintPreview';
import { ConfigProvider, useConfig, DEFAULT_CONFIG } from './contexts/ConfigContext';
import { analyzeReport } from './services/geminiService';
import { ProcessingResult, ProcessedStats, SurgeryRecord, StaffConflict, MachineConflict, PersistedSurgeryRecord, StaffMember } from './types';
import { FileUpload } from './components/FileUpload';
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Database,
  Download,
  Users,
  Zap,
  Loader2,
  Settings,

  LayoutDashboard,
  CheckCircle,
  AlertCircle,
  X,
  Sparkles,
  ListChecks,
  DollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Percent,
  FileSpreadsheet,
  Printer,
  FileText,
  CreditCard,
  RefreshCw,
  CheckCircle2,
  Search,
  Calendar,
  UserMinus,
  Trash2,
  Save,
  RotateCcw
} from 'lucide-react';
import { reportService } from './services/reportService';
import { format, parse, isValid } from 'date-fns';
import { auth } from './lib/firebase';

// --- Helper: Sequential Search Logic ---
const matchSearchQuery = (row: any, query: string, searchableCols: Record<string, boolean> | undefined, columns: ColumnDef<any>[], timeRules?: any) => {
  if (!query) return true;
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const regexStr = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  let regex: RegExp;
  try {
    regex = new RegExp(regexStr, 'i');
  } catch (e) {
    return true;
  }

  return columns.some(col => {
    if (searchableCols && searchableCols[col.key] === false) return false;

    let value = '';

    if (col.key === 'reason' && timeRules) {
      const minRule = timeRules[row.loaiPTTT]?.min;
      value = (minRule && row.timeMinutes < minRule) ? `< ${minRule}p` : '';
    } else if (col.render) {
      const rendered = col.render(row);
      if (typeof rendered === 'string') {
        value = rendered;
      } else if (typeof rendered === 'number') {
        value = String(rendered);
      } else {
        value = String(row[col.key] || '');
      }
    } else {
      value = String(row[col.key] || '');
    }

    return regex.test(value);
  });
};

interface ColumnDef<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string; // For cell styling (bg color, etc)
  headerClassName?: string; // For header styling
}

// --- Helper Functions ---

const parseDateString = (val: any): Date | null => {
  if (val instanceof Date) return val;
  if (typeof val !== 'string') return null;
  const formats = [
    'dd/MM/yyyy',
    'dd/MM/yyyy HH:mm',
    'MM/dd/yyyy',
    'yyyy-MM-dd',
    "yyyy-MM-dd'T'HH:mm:ss.SSSX",
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss"
  ];
  for (const f of formats) {
    const d = parse(val, f, new Date());
    if (isValid(d)) return d;
  }
  return null;
};

const formatDate = (val: any, fmt: string) => {
  try {
    const date = parseDateString(val);
    if (!date) return typeof val === 'string' ? val : '-';
    const tokenMap: Record<string, string> = {
      'dd/mm/yyyy': 'dd/MM/yyyy',
      'dd/mm/yyyy hh:mm': 'dd/MM/yyyy HH:mm',
      'dd/mm hh:mm': 'dd/MM HH:mm',
      'hh:mm': 'HH:mm'
    };
    const f = tokenMap[fmt] || 'dd/MM/yyyy HH:mm';
    return format(date, f);
  } catch {
    return '-';
  }
};


// --- Components ---

const ToastContainer = ({ toasts, removeToast }: { toasts: { id: string, message: string, type: 'error' | 'success' }[], removeToast: (id: string) => void }) => {
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto min-w-[300px] p-4 rounded-lg shadow-lg border-l-4 animate-slide-in flex items-start gap-3 bg-white
            ${toast.type === 'error' ? 'border-red-500' : 'border-green-500'}
          `}
        >
          {toast.type === 'error' ? <AlertCircle className="h-5 w-5 text-red-500 shrink-0" /> : <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />}
          <div className="flex-1">
            <p className={`font-medium text-sm ${toast.type === 'error' ? 'text-red-900' : 'text-green-900'}`}>
              {toast.type === 'error' ? 'Lỗi' : 'Thành công'}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">{toast.message}</p>
          </div>
          <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

interface DynamicTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  tableName: string;
  rowStyle?: (item: T) => string;
  defaultVisibleCols?: Record<string, boolean>;
  onVisibleColsChange?: (cols: Record<string, boolean>) => void;
  dateFormat: string;
  onDateFormatChange: (fmt: string) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (n: number) => void;
  extraHeaderRow?: React.ReactNode;
  extraFooterRow?: React.ReactNode;
  customThead?: React.ReactNode;
  rowCountLabel?: string; // Custom label for row count (e.g., "20 ca PT, 15 ca TT")
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
  searchableCols?: Record<string, boolean>;
  onSearchableColsChange?: (cols: Record<string, boolean>) => void;
  showSearchSettings?: boolean;
  enableSelection?: boolean;
  selectedIds?: string[];
  onSelect?: (id: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onDelete?: () => void;
  customTfoot?: React.ReactNode;
  customRowRender?: (row: T, index: number, allRows: T[]) => React.ReactNode;

  // External Page Control (Optional, falls back to internal)
  currentPage?: number;
  onPageChange?: (page: number) => void;

  // Assistant Input Callback
  onSaveAssistant?: (val: string) => void;
  extraSearchContent?: React.ReactNode;
}

const DynamicTable = <T extends Record<string, any>>({
  data,
  columns,
  tableName,
  rowStyle,
  defaultVisibleCols,
  onVisibleColsChange,
  dateFormat,
  onDateFormatChange,
  rowsPerPage,
  onRowsPerPageChange,
  extraHeaderRow,
  extraFooterRow,
  customThead,
  customTfoot,
  customRowRender, // DESTRUCTURED HERE
  rowCountLabel,
  searchTerm,
  onSearchChange,
  searchableCols,
  onSearchableColsChange,
  showSearchSettings,
  enableSelection,
  selectedIds = [],
  onSelect,
  onSelectAll,
  onDelete,
  onSaveAssistant,
  extraSearchContent,
  currentPage: externalPage,
  onPageChange: externalOnPageChange
}: DynamicTableProps<T>) => {
  const { config } = useConfig();
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({});
  const [isConfigDropdownOpen, setIsConfigDropdownOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const configDropdownRef = useRef<HTMLDivElement>(null);

  const [internalPage, setInternalPage] = useState(1);
  const currentPage = externalPage !== undefined ? externalPage : internalPage;

  const setCurrentPage = (page: number) => {
    if (externalOnPageChange) externalOnPageChange(page);
    else setInternalPage(page);
  };
  // ... rest of component

  // --- Autocomplete State ---
  const [assistantInput, setAssistantInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filter Staff List for "Phụ" position
  const assistantOptions = useMemo(() => {
    // Debug Log
    console.log("Config Staff List:", config.staffList);

    // Broaden filter to catch potential un-normalized roles
    const validRoles = ["Phụ", "GV", "TDC", "KTV GM", "KTV", "Tit DC", "Tít DC"];
    return (config.staffList || []).filter(s =>
      validRoles.includes(s.position) ||
      s.position === "Phụ" ||
      s.name.includes("(Phụ)") // Fallback
    );
  }, [config.staffList]);

  // Sync input with selection
  useEffect(() => {
    if (selectedIds.length === 1) {
      const rec = data.find(r => (r.key || r.id) === selectedIds[0]);
      setAssistantInput(rec?.gv || "");
    } else {
      setAssistantInput("");
    }
  }, [selectedIds, data]);

  // Strict Validation on Blur
  const handleAssistantBlur = () => {
    // Delay to allow click on suggestion to register
    setTimeout(() => {
      if (selectedIds.length === 0) return; // No selection, do nothing

      const exactMatch = assistantOptions.find(s => s.name === assistantInput);
      if (!exactMatch && assistantInput !== "") {
        // Check if it matches existing value logic?
        // If typed value is not in list, clear it (Strict Mode)
        setAssistantInput("");
      }
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }, 200);
  };

  const filteredSuggestions = useMemo(() => {
    if (!assistantInput) return assistantOptions;
    const lower = assistantInput.toLowerCase();
    return assistantOptions.filter(s => s.name.toLowerCase().includes(lower));
  }, [assistantInput, assistantOptions]);

  // --- Keyboard Navigation State & Handlers ---
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when selection changes
  useEffect(() => {
    if (selectedIds.length > 0 && inputRef.current) {
      // Small timeout to ensure DOM is ready and prevent fighting with other focus events
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [selectedIds]);

  // Handle Input Changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAssistantInput(e.target.value);
    setShowSuggestions(true);
    setSelectedIndex(-1); // Reset selection on typing
  };

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown') setShowSuggestions(true);
      if (e.key === 'Enter') {
        // If Enter is pressed and suggestions are closed (or we just closed them),
        // TRIGGER SAVE if input is not empty
        e.preventDefault();
        onSaveAssistant && onSaveAssistant(assistantInput);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();

      if (selectedIndex >= 0 && filteredSuggestions[selectedIndex]) {
        // Select highlighted item
        setAssistantInput(filteredSuggestions[selectedIndex].name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else if (filteredSuggestions.length === 1) {
        // Auto-select single match
        setAssistantInput(filteredSuggestions[0].name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else if (filteredSuggestions.length > 1) {
        // If multiple matches and no selection, just save what's there?
        // NO, let's select first item for convenience OR just close
        // For now: Select first item to be helpful
        setAssistantInput(filteredSuggestions[0].name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else {
        // No suggestions (empty list), just close
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  useEffect(() => {
    if (defaultVisibleCols && Object.keys(defaultVisibleCols).length > 0) {
      const merged: Record<string, boolean> = {};
      columns.forEach(c => merged[c.key] = true);
      Object.assign(merged, defaultVisibleCols);
      setVisibleCols(merged);
    } else {
      const initial: Record<string, boolean> = {};
      columns.forEach(c => initial[c.key] = true);
      setVisibleCols(initial);
    }
  }, [columns, defaultVisibleCols]);

  const toggleColumn = (key: string) => {
    const newVal = !visibleCols[key];
    const newCols = { ...visibleCols, [key]: newVal };
    setVisibleCols(newCols);
    if (onVisibleColsChange) onVisibleColsChange(newCols);
  };

  const visibleColumnsList = columns.filter(c => visibleCols[c.key]);

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentData = data.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (configDropdownRef.current && !configDropdownRef.current.contains(event.target as Node)) {
        setIsConfigDropdownOpen(false);
        setActiveSubmenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Removed auto-reset useEffect to allow parent control via onPageChange props (e.g. for auto-navigation)

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const DATE_FORMATS = ['dd/mm/yyyy', 'dd/mm/yyyy hh:mm', 'dd/mm hh:mm', 'hh:mm'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col font-inter w-full">
      <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Config Button moved to the left, with Select All prepended */}

        <div className="relative" ref={configDropdownRef}>
          <button
            onClick={() => setIsConfigDropdownOpen(!isConfigDropdownOpen)}
            title="Cấu hình"
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm border ${isConfigDropdownOpen ? 'bg-primary-700 text-white border-primary-800' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-700'}`}
          >
            <Settings className="h-4 w-4" />
            <ChevronDown className={`h-3 w-3 transition-transform ${isConfigDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isConfigDropdownOpen && (
            <div
              className="absolute left-0 top-full mt-2 w-48 bg-gray-50 rounded-xl shadow-xl border border-gray-100 z-50 py-1 overflow-visible animate-in fade-in slide-in-from-top-2 duration-200"
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              {/* 1. Searchable columns */}
              {showSearchSettings && onSearchableColsChange && (
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu('search')}
                >
                  <div className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-700 hover:bg-gray-200 hover:text-primary-700 transition-colors cursor-pointer group rounded-lg">
                    <div className="flex items-center gap-2">
                      <Search className="h-3.5 w-3.5 text-gray-400 group-hover:text-primary-500" />
                      <span>Cột tìm kiếm</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-gray-300" />
                  </div>
                  {activeSubmenu === 'search' && (
                    <div className="absolute top-0 left-[95%] -ml-1 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-2 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-left-2 duration-150">
                      <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2 flex justify-between items-center border-b pb-1.5">
                        <span>Chọn cột tìm kiếm</span>
                        <Search className="h-2.5 w-2.5" />
                      </div>
                      <div className="grid grid-cols-1 gap-0.5">
                        {columns.map(col => (
                          <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary-50/50 rounded-lg cursor-pointer group/item transition-colors">
                            <input
                              type="checkbox"
                              checked={searchableCols?.[col.key] !== false}
                              onChange={() => {
                                const newCols = { ...searchableCols };
                                newCols[col.key] = !(searchableCols?.[col.key] !== false);
                                onSearchableColsChange(newCols);
                              }}
                              className="rounded border-gray-300 text-primary-700 focus:ring-primary-500 h-3 w-3"
                            />
                            <span className="text-xs text-gray-600 group-hover/item:text-primary-700 transition-colors">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Show/Hide Columns */}
              <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu('col')}
              >
                <div className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-700 hover:bg-gray-200 hover:text-primary-700 transition-colors cursor-pointer group rounded-lg">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-3.5 w-3.5 text-gray-400 group-hover:text-primary-500" />
                    <span>Ẩn/hiện cột</span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </div>
                {activeSubmenu === 'col' && (
                  <div className="absolute top-0 left-[95%] -ml-1 w-56 bg-white rounded-xl shadow-2xl border border-gray-100 p-2 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-left-2 duration-150">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2 border-b pb-1.5 flex justify-between items-center">
                      <span>Cấu hình hiển thị</span>
                      <ListChecks className="h-2.5 w-2.5" />
                    </div>
                    <div className="grid grid-cols-1 gap-0.5">
                      {columns.map(col => (
                        <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary-50/50 rounded-lg cursor-pointer group/item transition-colors">
                          <input
                            type="checkbox"
                            checked={visibleCols[col.key] || false}
                            onChange={() => toggleColumn(col.key)}
                            className="rounded border-gray-300 text-primary-700 focus:ring-primary-500 h-3 w-3"
                          />
                          <span className="text-xs text-gray-600 group-hover/item:text-primary-700 transition-colors">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Date Format */}
              <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu('date')}
              >
                <div className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-700 hover:bg-gray-200 hover:text-primary-700 transition-colors cursor-pointer group rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400 group-hover:text-primary-500" />
                    <span>Định dạng thời gian</span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </div>
                {activeSubmenu === 'date' && (
                  <div className="absolute top-0 left-[95%] -ml-1 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 p-1 animate-in fade-in slide-in-from-left-2 duration-150">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2 py-1.5 border-b flex justify-between items-center">
                      <span>Chọn định dạng</span>
                      <Clock className="h-2.5 w-2.5" />
                    </div>
                    <div className="p-1 space-y-0.5">
                      {DATE_FORMATS.map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => {
                            onDateFormatChange(fmt);
                            setIsConfigDropdownOpen(false);
                            setActiveSubmenu(null);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-primary-50 transition-all font-medium ${fmt === dateFormat ? 'bg-primary-50 text-primary-700' : 'text-gray-600'}`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {onSearchChange !== undefined ? (
          <div className="flex items-center gap-3 flex-1 max-w-md lg:max-w-xl">
            <span className="text-sm font-bold text-gray-700 whitespace-nowrap flex items-center gap-2">
              Tìm kiếm:
            </span>
            <div className="relative flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchTerm || ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Nhập nội dung cần tìm..."
                  className="w-full pl-9 pr-4 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm transition-all"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                {searchTerm && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {searchTerm && (
                <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-2 py-1 rounded-md border border-primary-100 whitespace-nowrap animate-in fade-in slide-in-from-left-2">
                  Có {data.length} kết quả
                </span>
              )}
            </div>
            {extraSearchContent}
          </div>
        ) : (
          <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
            <ListChecks className="h-4 w-4 text-primary-700" />
            {tableName}
            <span className="text-[10px] font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{rowCountLabel || `${data.length} dòng`}</span>
          </h3>
        )}

        {/* BULK EDIT UI */}
        {enableSelection && (
          <div className="flex items-center gap-2 flex-1 justify-center px-4 overflow-visible">
            {/* Info Display Area */}
            <div className="flex-1 text-center min-w-0 flex flex-col items-center justify-center h-full">
              {selectedIds.length === 1 && (() => {
                const rec = data.find(r => (r.key || r.id) === selectedIds[0]);
                if (rec) {
                  return (
                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                      <div className="text-xs font-bold text-gray-800 truncate max-w-[250px] leading-tight">
                        {rec.patientId} - {rec.patientName}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate max-w-[250px] leading-tight">
                        {rec.tenKT}
                      </div>
                    </div>
                  );
                }
              })()}
              {selectedIds.length > 1 && (
                <div className="text-xs text-primary-700 font-medium bg-primary-50 px-2 py-1 rounded animate-in zoom-in duration-200">
                  Bạn đã chọn <b className="text-primary-800">{selectedIds.length}</b> cuộc phẫu thuật, thủ thuật
                </div>
              )}
            </div>

            {/* Assistant Input & Save Button */}
            <div className={`flex items-center gap-2 shrink-0 relative ${selectedIds.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="relative group">
                <input
                  ref={inputRef}
                  type="text"
                  autoComplete="off"
                  disabled={selectedIds.length === 0}
                  placeholder={selectedIds.length > 1 ? "Điền giúp việc cho nhiều PT" : (selectedIds.length === 1 && !assistantInput ? "Chưa điền giúp việc" : "Tên giúp việc")}
                  value={assistantInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={handleAssistantBlur}
                  className="w-48 pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none shadow-sm transition-all placeholder:text-gray-400 placeholder:italic disabled:bg-gray-100 disabled:text-gray-400"
                />

                {/* Clear Button */}
                {assistantInput && selectedIds.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setAssistantInput("");
                      setSelectedIndex(-1);
                      setShowSuggestions(true);
                    }}
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions && selectedIds.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    {filteredSuggestions.length > 0 ? (
                      <ul className="py-1">
                        {filteredSuggestions.map((staff, idx) => (
                          <li
                            key={staff.id || staff.name}
                            className={`px-3 py-2 cursor-pointer text-xs flex flex-col border-b border-gray-50 last:border-0 transition-colors ${idx === selectedIndex ? 'bg-primary-100 text-primary-900' : 'hover:bg-primary-50 text-gray-700'}`}
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevent blur
                              setAssistantInput(staff.name);
                              setShowSuggestions(false);
                              setSelectedIndex(-1);
                            }}
                          >
                            <span className="font-medium">{staff.name}</span>
                            <span className="text-[10px] text-gray-500">{staff.department}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-3 text-center text-xs text-gray-400 italic">
                        Không tìm thấy nhân viên phù hợp
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="p-1.5 bg-primary-700 text-white rounded-lg hover:bg-primary-800 shadow-sm transition-colors active:scale-95"
                title="Lưu"
                onClick={() => onSaveAssistant && onSaveAssistant(assistantInput)}
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                disabled={!onDelete || !selectedIds || selectedIds.length === 0}
                className={`p-1.5 border rounded-lg shadow-sm transition-colors active:scale-95 ${onDelete && selectedIds && selectedIds.length > 0
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                  }`}
                title={selectedIds && selectedIds.length > 0 ? "Xóa dòng đã chọn" : "Chọn dòng để xóa"}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {searchTerm && (
            <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-2 py-1 rounded-md border border-primary-100 whitespace-nowrap hidden lg:inline-block mr-2">
              Có {data.length} kết quả
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto flex-1 p-0">
        <table className="w-full text-xs text-left text-gray-600">
          {customThead ? customThead : (
            <thead className="text-xs text-white uppercase bg-primary-700 border-b sticky top-0 z-20">
              <tr>
                {enableSelection && (
                  <th className="px-2 py-3 border-r border-primary-600 w-[40px] text-center align-middle sticky left-0 z-30 bg-primary-700">
                    {onSelectAll && (
                      <input
                        type="checkbox"
                        checked={data.length > 0 && data.every(r => selectedIds.includes(r.key || '') || selectedIds.includes(r.id || ''))}
                        ref={input => {
                          if (input) {
                            const selectedCount = data.filter(r => selectedIds.includes(r.key || '') || selectedIds.includes(r.id || '')).length;
                            input.indeterminate = selectedCount > 0 && selectedCount < data.length;
                          }
                        }}
                        onChange={() => {
                          // Logic:
                          // 1. If some checked (< total), click => check all (true)
                          // 2. If none checked (0), click => check all (true)
                          // 3. If all checked (total), click => uncheck all (false)
                          // Simplified: If all checked -> uncheck. Else -> check.
                          const allVisibleSelected = data.length > 0 && data.every(r => selectedIds.includes(r.key || '') || selectedIds.includes(r.id || ''));
                          onSelectAll(!allVisibleSelected);
                        }}
                        className="rounded border-primary-500 text-primary-700 focus:ring-primary-500 h-4 w-4 cursor-pointer align-middle bg-white"
                        title="Chọn tất cả"
                      />
                    )}
                  </th>
                )}
                {visibleColumnsList.map(col => (
                  <th key={col.key} className={`px-2 py-3 border-r border-primary-600 min-w-[80px] font-bold whitespace-normal break-words align-middle ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.headerClassName || ''} ${col.width || 'max-w-[200px]'}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {extraHeaderRow}
            {currentData.map((row: any, idx) => {
              const customClass = rowStyle ? rowStyle(row) : '';
              const isFirstRowOverall = startIndex + idx === 0;
              const deptBorderClass = row.isNewDept && !isFirstRowOverall ? 'border-t-2 border-t-primary-700' : '';

              return (
                <tr
                  key={row.key || row.id || idx}
                  className={`border-b border-gray-200 group hover:bg-primary-100 transition-colors ${customClass ? customClass : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')} ${enableSelection && (selectedIds.includes(row.key) || (row.id && selectedIds.includes(row.id))) ? '!bg-primary-200' : ''}`}
                  onClick={() => {
                    if (enableSelection && onSelect) {
                      const rId = row.key || row.id;
                      if (rId) onSelect(rId, !selectedIds.includes(rId));
                    }
                  }}
                >
                  {enableSelection && (
                    <td className="px-2 py-1 border-r text-center align-top sticky left-0 bg-inherit z-10 w-[40px]">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.key) || (!!row.id && selectedIds.includes(row.id))}
                        onChange={() => { }} // Handle click on row
                        className="rounded border-gray-300 text-primary-700 focus:ring-primary-500 h-4 w-4 cursor-pointer mt-1"
                      />
                    </td>
                  )}
                  {visibleColumnsList.map(col => (
                    <td key={col.key} className={`px-2 py-1 border-r whitespace-normal break-words align-top ${deptBorderClass} ${col.width || 'max-w-[200px]'} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}>
                      {col.key === 'stt' ? (startIndex + idx + 1) : (col.render ? col.render(row) : (row[col.key] || '-'))}
                    </td>
                  ))}
                </tr>
              );
            })}
            {extraFooterRow}
            {customTfoot}
            {data.length === 0 && (
              <tr>
                <td colSpan={visibleColumnsList.length} className="px-4 py-8 text-center text-gray-500 italic">Không có dữ liệu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {
        data.length > 0 && (
          <div className="p-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 rounded-b-xl text-xs">
            <div className="flex items-center gap-2 text-gray-600">
              <span>Hiển thị</span>
              <select value={rowsPerPage} onChange={(e) => { onRowsPerPageChange(Number(e.target.value)); setCurrentPage(1); }} className="bg-white border border-gray-300 rounded-md px-3 pr-8 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[70px]">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="hidden sm:inline-block ml-2 text-gray-400">| {startIndex + 1}-{Math.min(startIndex + rowsPerPage, data.length)} / {data.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"><ChevronLeft className="h-3 w-3" /></button>
              <span className="font-medium text-gray-700 px-2">{currentPage}/{totalPages}</span>
              <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600"><ChevronRight className="h-3 w-3" /></button>
            </div>
          </div>
        )
      }
    </div >
  );
};
interface ReportState {
  result: ProcessingResult | null;
  stats: ProcessedStats | null;
  isProcessing: boolean;
  listFile: File | null;
  detailFile: File | null;
  activeTable: 'list' | 'staff' | 'machine' | 'missing' | 'payment' | null;
  selectedRecordIds: string[]; // IDs of selected records (for 'list' table)
  searchTerms: {
    list: string;
    staff: string;
    machine: string;
    missing: string;
    payment: string;
  };
  // UI State for Date Range Pickers (Independent per tab)
  dateFrom: string;
  timeFrom: string;
  dateTo: string;
  timeTo: string;
  // File Meta (Legacy Strings from Validator)
  listDateRange: string;
  detailDateRange: string;
  dataSource: 'EXCEL' | 'STORAGE' | null;
  queryDateRangeText?: string;
  hasAutoFilledData?: boolean; // Track if auto-fill succeeded for enabling save button
}

const initialReportState: ReportState = {
  result: null,
  stats: null,
  isProcessing: false,
  listFile: null,
  detailFile: null,
  activeTable: null,
  selectedRecordIds: [],
  searchTerms: {
    list: '',
    staff: '',
    machine: '',
    missing: '',
    payment: ''
  },
  dateFrom: format(new Date(), 'yyyy-MM-dd'),
  timeFrom: '00:00',
  dateTo: format(new Date(), 'yyyy-MM-dd'),
  timeTo: '23:59',
  listDateRange: "",
  detailDateRange: "",
  dataSource: null,
  hasAutoFilledData: false
};

const InnerApp: React.FC = () => {
  const { config, updateConfig } = useConfig();

  const [activeTab, setActiveTab] = useState<'daily' | 'monthly' | 'config'>('daily');
  const [activeDataTab, setActiveDataTab] = useState<'storage' | 'upload'>('storage');

  // Independent states for Daily and Monthly reports
  const [dailyState, setDailyState] = useState<ReportState>(initialReportState);
  const [monthlyState, setMonthlyState] = useState<ReportState>(initialReportState);

  const currentType = (activeTab === 'monthly') ? 'monthly' : 'daily';
  const currentReport = useMemo(() => {
    return currentType === 'daily' ? dailyState : monthlyState;
  }, [currentType, dailyState, monthlyState]);

  const updateReportState = (type: 'daily' | 'monthly', patch: Partial<ReportState>) => {
    const setter = type === 'daily' ? setDailyState : setMonthlyState;
    setter(prev => ({ ...prev, ...patch }));
  };

  const updateCurrentReport = (updates: Partial<ReportState>) => {
    updateReportState(currentType, updates);
  };

  const handleDeleteSelected = async () => {
    const selectedIds = currentReport.selectedRecordIds || [];
    if (selectedIds.length === 0) return;

    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} dòng đã chọn?`)) {
      try {
        if (!currentReport.result) return;

        // Match using key or id
        const recordsToDelete = currentReport.result.validRecords.filter(r =>
          selectedIds.includes(r.key || r.id || "")
        );

        if (recordsToDelete.length === 0) {
          addToast("Không tìm thấy dòng tương ứng để xóa", "error");
          return;
        }

        // 1. Storage Delete
        if (currentReport.dataSource === 'STORAGE') {
          try {
            const deletedCount = await reportService.deleteRecords(recordsToDelete);
            if (deletedCount > 0) {
              addToast(`Đã xóa vĩnh viễn ${deletedCount} dòng từ cơ sở dữ liệu`, "success");
            }
          } catch (e) {
            console.error("Delete failed", e);
            addToast("Lỗi khi xóa từ Firestore. Vui lòng thử lại.", "error");
            return;
          }
        }

        // 2. Local Update & Reprocess
        const remainingRecords = currentReport.result.validRecords.filter(r =>
          !selectedIds.includes(r.key || r.id || "")
        );

        // Reprocess to update ALL derived data
        const newResult = reprocessSurgicalRecords(
          remainingRecords,
          config,
          currentReport.result.dateRangeText || ""
        );

        updateCurrentReport({
          result: newResult,
          selectedRecordIds: []
        });

        if (currentReport.dataSource !== 'STORAGE') {
          addToast("Đã xóa khỏi danh sách hiện tại", "success");
        }

      } catch (error) {
        console.error("Handle delete error:", error);
        addToast("Có lỗi xảy ra khi xử lý xóa.", "error");
      }
    }
  };

  const handleRowSelect = (id: string, selected: boolean) => {
    const currentIds = currentReport.selectedRecordIds || [];
    console.log(`[handleRowSelect] Toggling ID: "${id}" to ${selected}. Current IDs:`, currentIds);
    let newIds;
    if (selected) {
      newIds = [...currentIds, id];
    } else {
      newIds = currentIds.filter(selectedId => selectedId !== id);
    }
    console.log(`[handleRowSelect] New IDs:`, newIds);
    updateCurrentReport({ selectedRecordIds: newIds });
  };

  const handleSelectAll = (selected: boolean) => {
    const records = currentReport.result?.validRecords || [];
    if (selected) {
      // Filter out records without keys/ids if any (shouldn't happen based on processor)
      // Support both key (Excel) and id (Storage)
      const allIds = records.map(r => r.key || r.id).filter(k => k) as string[];
      console.log(`[handleSelectAll] Selecting ${allIds.length} records`);
      updateCurrentReport({ selectedRecordIds: allIds });
    } else {
      console.log(`[handleSelectAll] Deselecting all`);
      updateCurrentReport({ selectedRecordIds: [] });
    }
  };

  // Per-Report UI settings from Config (with fallbacks to global or defaults)
  const reportConfig = config.uiSettings?.perReport?.[currentType];
  const rowsPerPage = reportConfig?.rowsPerPage || config.uiSettings?.rowsPerPage || 20;
  const dateFormat = reportConfig?.dateFormat || config.uiSettings?.dateFormat || 'dd/mm/yyyy hh:mm';
  const visibleCols = reportConfig?.visibleColumns || config.uiSettings?.visibleColumns || {};
  const searchableCols = reportConfig?.searchableColumns || config.uiSettings?.searchableColumns || {};

  const updateRowsPerPage = (n: number) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...(currentUISettings.perReport?.[currentType] as any),
            rowsPerPage: n
          }
        }
      }
    });
  };

  const updateDateFormat = (f: string) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...(currentUISettings.perReport?.[currentType] as any),
            dateFormat: f
          }
        }
      }
    });
  };

  const updateVisibleCols = (table: string, cols: Record<string, boolean>) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    const currentReportUI = currentUISettings.perReport?.[currentType] || { rowsPerPage, dateFormat, visibleColumns: {}, searchableColumns: {} };
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...currentReportUI,
            visibleColumns: { ...(currentReportUI.visibleColumns || {}), [table]: cols }
          }
        }
      }
    });
  };

  const updateSearchableCols = (table: string, cols: Record<string, boolean>) => {
    const currentUISettings = config.uiSettings || DEFAULT_CONFIG.uiSettings;
    const currentReportUI = currentUISettings.perReport?.[currentType] || { rowsPerPage, dateFormat, visibleColumns: {}, searchableColumns: {} };
    updateConfig({
      uiSettings: {
        ...currentUISettings,
        perReport: {
          ...currentUISettings.perReport,
          [currentType]: {
            ...currentReportUI,
            searchableColumns: { ...(currentReportUI.searchableColumns || {}), [table]: cols }
          }
        }
      }
    });
  };

  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'error' | 'success' }[]>([]);

  const addToast = (message: string, type: 'error' | 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 5000);
  };
  const removeToast = (id: string) => { setToasts(prev => prev.filter(t => t.id !== id)); };

  // Validate File
  const checkFile = (f: File) => {
    const validExts = ['.xlsx', '.xls'];
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
      addToast(`Lỗi: File "${f.name}" không hợp lệ. Vui lòng chọn file Excel!`, 'error');
      return false;
    }
    return true;
  };

  const handleListFileSelect = async (f: File | null) => {
    if (!f) { updateCurrentReport({ listFile: null, listDateRange: "" }); return; }
    if (!checkFile(f)) return;

    const { validateListFile } = await import('./services/excelProcessor');
    const res = await validateListFile(f);

    if (!res.valid) {
      addToast(res.error || "File không hợp lệ", 'error');
      return;
    }

    updateCurrentReport({
      listFile: f,
      listDateRange: res.dateRangeText || ""
    });
    addToast(`✓ File "${f.name}" hợp lệ`, 'success');

    if (currentReport.detailDateRange && res.dateRangeText && currentReport.detailDateRange !== res.dateRangeText) {
      addToast(`⚠ Thời gian của 2 file không khớp:\n- Danh sách PT: "${res.dateRangeText}"\n- Chi tiết PT: "${currentReport.detailDateRange}"`, 'error');
    }
  };

  const handleDetailFileSelect = async (f: File | null) => {
    if (!f) { updateCurrentReport({ detailFile: null, detailDateRange: "" }); return; }
    if (!checkFile(f)) return;

    const { buildMachineMapFromFile } = await import('./services/excelProcessor');
    const result = await buildMachineMapFromFile(f);

    if (result.error) {
      addToast(result.error, 'error');
      return;
    }

    const machineMap = result.machineMap;
    const detailDateRange = result.dateRangeText;

    updateCurrentReport({
      detailFile: f,
      detailDateRange: detailDateRange
    });
    addToast(`✓ File "${f.name}" hợp lệ (${machineMap.size} mã máy)`, 'success');

    // ========== MAIN AUTO-FILL LOGIC ==========
    const hasExistingData = currentReport.result && currentReport.result.validRecords && currentReport.result.validRecords.length > 0;

    if (hasExistingData) {
      // ===== Case 1: Data already loaded =====
      const isStorage = currentReport.dataSource === 'STORAGE';
      const records = [...currentReport.result!.validRecords];

      // Check date range match (Decision #4: Report error if mismatch)
      if (currentReport.listDateRange && detailDateRange && currentReport.listDateRange !== detailDateRange) {
        addToast(`⚠ Thời gian không khớp:\n- Dữ liệu hiện tại: "${currentReport.listDateRange}"\n- File Chi tiết: "${detailDateRange}"`, 'error');
        return;
      }

      // Fill machine codes (Decision #3: Only fill if empty)
      let fillCount = 0;
      const updatesForStorage: Array<{ firestorePath: string, machine: string }> = [];

      records.forEach(rec => {
        // Decision #5 (A): Ưu tiên file mới - ghi đè dữ liệu cũ
        const ngayBD = rec.start ? rec.start.toISOString().split('T')[0] : '';
        const key = `${rec.patientId}-${rec.patientName}-${ngayBD}-${rec.tenKT}`;
        const machineCode = machineMap.get(key);

        if (machineCode && machineCode !== rec.machine) {
          rec.machine = machineCode;
          fillCount++;

          // For storage source, collect updates
          if (isStorage && rec.firestorePath) {
            updatesForStorage.push({ firestorePath: rec.firestorePath, machine: machineCode });
          }
        }
      });

      if (fillCount === 0) {
        addToast('Không có dữ liệu mã máy nào khớp để cập nhật.', 'error');
        return;
      }

      if (isStorage) {
        // ===== Case 1.1: Storage source - Save to Firestore =====
        addToast(`Đang cập nhật ${fillCount} mã máy vào Storage...`, 'success');

        try {
          const updatedCount = await reportService.batchUpdateMachineCodes(updatesForStorage);

          // Recalculate and refresh UI
          const freshResult = reprocessSurgicalRecords(records, config, currentReport.result!.dateRangeText || '');

          updateCurrentReport({
            result: freshResult,
            stats: freshResult.stats,
            hasAutoFilledData: true
          });

          addToast(`✓ Đã cập nhật ${updatedCount} mã máy vào dữ liệu lưu trữ.`, 'success');
        } catch (error: any) {
          console.error('Error saving machine codes:', error);
          addToast(`Lỗi khi lưu: ${error.message}. Một số dữ liệu có thể đã được lưu.`, 'error');

          // Still update UI with whatever we have
          const freshResult = reprocessSurgicalRecords(records, config, currentReport.result!.dateRangeText || '');
          updateCurrentReport({
            result: freshResult,
            stats: freshResult.stats
          });
        }
      } else {
        // ===== Case 1.2: Excel source - Update in memory only =====
        const freshResult = reprocessSurgicalRecords(records, config, currentReport.result!.dateRangeText || '');

        updateCurrentReport({
          result: freshResult,
          stats: freshResult.stats,
          hasAutoFilledData: true
        });

        addToast(`✓ Đã điền ${fillCount} mã máy. Bấm "Lưu dữ liệu" để lưu vào Storage.`, 'success');
      }
    } else {
      // ===== Case 2: No data loaded - Query Storage and auto-update =====
      addToast(`Đang tìm kiếm dữ liệu trong Storage theo thời gian của file Chi tiết...`, 'success');

      try {
        // Parse date range from Detail file (Decision #1: Use Detail file date range)
        // Expected format: "Từ ngày 01/01/2026 đến ngày 15/01/2026"
        const dateMatch = detailDateRange.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/);

        if (!dateMatch) {
          addToast('Không thể phân tích khoảng thời gian từ file Chi tiết.', 'error');
          return;
        }

        const parseDate = (str: string) => {
          const [dd, mm, yyyy] = str.split('/');
          return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000`);
        };

        const dateFrom = parseDate(dateMatch[1]);
        const dateTo = parseDate(dateMatch[2]);
        dateTo.setHours(23, 59, 59, 999);

        const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
        const persistedRecords = await reportService.getReports(dateFrom.toISOString(), dateTo.toISOString(), type);

        if (!persistedRecords || persistedRecords.length === 0) {
          addToast('Không tìm thấy dữ liệu trong Storage tương ứng với file Chi tiết.', 'error');
          return;
        }

        // Fill machine codes (Decision #3: Only fill if empty)
        let fillCount = 0;
        const updatesForStorage: Array<{ firestorePath: string, machine: string }> = [];

        persistedRecords.forEach(rec => {
          // Decision #5 (A): Ưu tiên file mới - ghi đè dữ liệu cũ
          const ngayBD = rec.ngayBD ? rec.ngayBD.split('T')[0] : '';
          const key = `${rec.patientId}-${rec.patientName}-${ngayBD}-${rec.tenKT}`;
          const machineCode = machineMap.get(key);

          if (machineCode && rec.firestorePath && machineCode !== rec.machine) {
            rec.machine = machineCode;
            updatesForStorage.push({ firestorePath: rec.firestorePath, machine: machineCode });
            fillCount++;
          }
        });

        if (fillCount === 0) {
          addToast('Không có dữ liệu mã máy nào khớp để cập nhật.', 'error');
          return;
        }

        // Save to Storage (Decision #6: Toast before save)
        addToast(`Đang cập nhật ${fillCount} mã máy vào Storage...`, 'success');

        await reportService.batchUpdateMachineCodes(updatesForStorage);

        // Decision #2: Display data after save
        const convertedRecords: SurgeryRecord[] = persistedRecords.map(r => ({
          ...r,
          stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
          start: r.ngayBD ? new Date(r.ngayBD) : null,
          end: r.ngayKT ? new Date(r.ngayKT) : null,
        }));

        const res = reprocessSurgicalRecords(convertedRecords, config);

        const formatDateForDisplay = (date: Date) => format(date, 'dd/MM/yyyy HH:mm');

        updateCurrentReport({
          result: res,
          stats: res.stats,
          activeTable: 'list',
          dataSource: 'STORAGE',
          queryDateRangeText: `Từ ngày ${formatDateForDisplay(dateFrom)} đến ngày ${formatDateForDisplay(dateTo)}`,
          listDateRange: detailDateRange
        });

        addToast(`✓ Đã cập nhật ${fillCount} mã máy và hiển thị ${persistedRecords.length} bản ghi.`, 'success');

      } catch (error: any) {
        console.error('Error in Case 2 auto-fill:', error);
        addToast(`Lỗi: ${error.message}`, 'error');
      }
    }
  };

  // Reset file uploads và dữ liệu liên quan cho từng loại báo cáo
  const handleResetUpload = (type: 'daily' | 'monthly') => {
    updateReportState(type, {
      listFile: null,
      detailFile: null,
      listDateRange: '',
      detailDateRange: '',
      result: undefined,
      stats: undefined,
      hasAutoFilledData: false,
      dataSource: undefined,
      isProcessing: false
    });
    addToast('Đã hủy tải lên, dữ liệu đã được xóa.', 'success');
  };

  const handleProcess = async (type: 'daily' | 'monthly') => {
    const report = type === 'daily' ? dailyState : monthlyState;
    if (!report.listFile) return;

    updateReportState(type, { isProcessing: true });
    try {
      const res = await processSurgicalFiles(report.listFile, report.detailFile, config);

      // Update config with learned staff info (Merge logic)
      if (res.extractedStaff && res.extractedStaff.length > 0) {
        const currentStaff: StaffMember[] = config.staffList || [];
        const newStaff: StaffMember[] = res.extractedStaff;

        const merged: StaffMember[] = [...currentStaff];
        const existingMap = new Map<string, StaffMember>(currentStaff.map(s => [`${s.name}-${s.position}`, s]));
        let hasUpdates = false;

        newStaff.forEach(s => {
          const key = `${s.name}-${s.position}`;
          if (!existingMap.has(key)) {
            merged.push(s);
            existingMap.set(key, s);
            hasUpdates = true;
          } else {
            const exist = existingMap.get(key)!;
            // Use mutable update on clone? No, 'merged' contains objects. 
            // 'exist' is a reference to an object in 'merged'.
            // Need to be careful with React state immutability, but updateConfig creates new object.
            // Let's create new object if updating.
            if ((!exist.taxId && s.taxId) || (!exist.department && s.department)) {
              // Find index and replace
              const idx = merged.findIndex(m => m.name === s.name && m.position === s.position);
              if (idx > -1) {
                merged[idx] = {
                  ...exist,
                  taxId: exist.taxId || s.taxId,
                  department: exist.department || s.department
                };
                hasUpdates = true;
              }
            }
          }
        });

        if (hasUpdates) {
          updateConfig({ staffList: merged });
          addToast(`Đã cập nhật thông tin ${newStaff.length} nhân viên từ file.`, 'success');
        }
      }

      // Auto-fill assistant AND machine data for monthly reports from daily reports
      if (type === 'monthly' && res.validRecords) {
        try {
          // Get both assistant and machine data from Daily
          const [assistantMap, machineMap] = await Promise.all([
            reportService.getAssistantDataFromDaily(res.validRecords),
            reportService.getMachineDataFromDaily(res.validRecords)
          ]);

          let updateGvCount = 0;
          let updateMachineCount = 0;

          res.validRecords.forEach(r => {
            const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
            const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;

            // Fill assistant if empty
            if (!r.gv || r.gv.trim() === '') {
              const dailyGv = assistantMap.get(key);
              if (dailyGv) {
                r.gv = dailyGv;
                updateGvCount++;
              }
            }

            // Fill machine if empty (get from Daily reports)
            if (!r.machine || r.machine.trim() === '') {
              const dailyMachine = machineMap.get(key);
              if (dailyMachine) {
                r.machine = dailyMachine;
                updateMachineCount++;
              }
            }
          });

          if (updateGvCount > 0 || updateMachineCount > 0) {
            // Recalculate with updated data
            const freshResult = reprocessSurgicalRecords(
              res.validRecords,
              config,
              res.dateRangeText || ''
            );

            // Update the result with fresh calculations
            updateReportState(type, {
              stats: freshResult.stats,
              result: freshResult,
              activeTable: 'list',
              isProcessing: false,
              dataSource: 'EXCEL',
              hasAutoFilledData: true // Enable save button
            });

            const autoFillMsg = [];
            if (updateGvCount > 0) autoFillMsg.push(`${updateGvCount} giúp việc`);
            if (updateMachineCount > 0) autoFillMsg.push(`${updateMachineCount} mã máy`);

            addToast(`Đã tự động điền ${autoFillMsg.join(' và ')} từ BC hàng ngày.`, 'success');
            return; // Exit early since we already updated state
          }
        } catch (error) {
          console.error('Error auto-filling from daily data:', error);
          // Continue with normal flow if auto-fill fails
        }
      }


      updateReportState(type, {
        stats: res.stats,
        result: res,
        activeTable: 'list',
        isProcessing: false,
        dataSource: 'EXCEL'
      });
      if (report.detailFile) {
        addToast("Xử lý dữ liệu thành công với đầy đủ mã máy/nhân sự.", 'success');
      }
    } catch (error: any) {
      console.error(error);
      addToast(error.message || "Có lỗi xử lý", 'error');
      updateReportState(type, {
        stats: null,
        result: null,
        isProcessing: false
      });
    }
  };

  const [isSaving, setIsSaving] = useState(false);


  const handleDownload = () => {
    if (!currentReport.result?.validRecords) {
      addToast("Chưa có dữ liệu để tải xuống.", 'error');
      return;
    }

    try {
      // Regenerate workbook with current data (including any updates made after initial processing)
      addToast("Đang tạo file Excel...", 'success');

      const freshResult = reprocessSurgicalRecords(
        currentReport.result.validRecords,
        config,
        currentReport.result.dateRangeText || ''
      );

      if (!freshResult.wb) {
        addToast("Lỗi khi tạo file Excel.", 'error');
        return;
      }

      const filename = `Ket_qua_${currentType}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(freshResult.wb, filename);
      addToast("Đã tải xuống file Excel.", 'success');
    } catch (e: any) {
      console.error("Download failed:", e);
      addToast("Lỗi khi tải file: " + e.message, 'error');
    }
  };

  // Create a hash of the config that strictly affects processing results (excluding UI settings)
  const processingConfigHash = useMemo(() => JSON.stringify({
    priceConfig: config.priceConfig,
    timeRules: config.timeRules,
    staffLimits: config.staffLimits,
    ignoredMachineCodes: config.ignoredMachineCodes,
    ignoredMachineNames: config.ignoredMachineNames
  }), [config]);

  useEffect(() => {
    const processReports = () => {
      if (dailyState.listFile) handleProcess('daily');
      if (monthlyState.listFile) handleProcess('monthly');
    };

    const timer = setTimeout(processReports, 300);
    return () => clearTimeout(timer);
  }, [processingConfigHash, dailyState.listFile, dailyState.detailFile, monthlyState.listFile, monthlyState.detailFile]);

  const formatDateForDisplay = (dateStr: string, timeStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y} ${timeStr}`;
  };

  const dynamicViolateMinTimeCount = useMemo(() => {
    if (!currentReport.result?.validRecords) return 0;
    return currentReport.result.validRecords.filter(r => {
      const minTime = config.timeRules[r.loaiPTTT]?.min;
      return minTime && r.timeMinutes < minTime;
    }).length;
  }, [currentReport.result?.validRecords, config.timeRules]);

  // Split PT/TT counts for Tab UI
  const { ptCount, ttCount } = useMemo(() => {
    if (!currentReport.result?.validRecords) return { ptCount: 0, ttCount: 0 };
    return {
      ptCount: currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('P')).length,
      ttCount: currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('T')).length
    };
  }, [currentReport.result?.validRecords]);

  // Calculate Missing Assistant Count
  const missingAssistantCount = useMemo(() => {
    if (!currentReport.result?.validRecords) return 0;
    return currentReport.result.validRecords.filter(r => !r.gv || r.gv.trim() === '').length;
  }, [currentReport.result?.validRecords]);

  // Combined stats from result and dynamic calculation
  const derivedStats = useMemo(() => {
    if (!currentReport.result?.stats) return {
      totalSurgeries: 0,
      totalDurationMinutes: 0,
      staffConflicts: 0,
      machineConflicts: 0,
      missingMachines: 0,
      lowPaymentCount: 0,
      violateMinTimeCount: 0,
      missingAssistantCount: 0
    };

    return {
      ...currentReport.result.stats,
      violateMinTimeCount: dynamicViolateMinTimeCount,
      missingAssistantCount: missingAssistantCount
    };
  }, [currentReport.result?.stats, dynamicViolateMinTimeCount, missingAssistantCount]);

  // -- Memoized Payment Data for Reuse in Print --
  const paymentDataPrepared = useMemo(() => {
    if (!currentReport.result?.paymentData?.rows || !config) return null;

    const rawRows = currentReport.result.paymentData.rows;
    const cols = currentReport.result.paymentData.columns;

    const GROUP_MAP: Record<string, string> = {
      "PĐB": "Phẫu thuật ĐB", "P1": "Phẫu thuật loại 1", "P2": "Phẫu thuật loại 2", "P3": "Phẫu thuật loại 3",
      "TĐB": "Thủ thuật ĐB", "T1": "Thủ thuật loại 1", "T2": "Thủ thuật loại 2", "T3": "Thủ thuật loại 3", "TKPL": "Thủ thuật KPL"
    };

    // Calculate Groups
    const groups: { name: string, label: string, subCols: string[] }[] = [];
    let currentGroup = "";
    cols.forEach(col => {
      const [loai, role] = col.split('-');
      if (loai !== currentGroup) {
        groups.push({ name: loai, label: GROUP_MAP[loai] || loai, subCols: [role] });
        currentGroup = loai;
      } else {
        groups[groups.length - 1].subCols.push(role);
      }
    });

    const enrichedRows = rawRows.map((row, idx) => {
      let rowTotalQty = 0;
      let rowTotalAmount = 0;
      Object.keys(row.values).forEach(colKey => {
        const qty = row.values[colKey] || 0;
        if (qty > 0) {
          rowTotalQty += qty;
          const [loai, role] = colKey.split('-');
          let configRole: any = "Giúp việc";
          if (role === "Chính") configRole = "Chính";
          else if (role === "Phụ") configRole = "Phụ";
          else if (role === "Giúp việc") configRole = "Giúp việc";
          const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
          rowTotalAmount += qty * price;
        }
      });
      return { ...row, stt: idx + 1, total_qty: rowTotalQty, total_amount: rowTotalAmount.toLocaleString('en-US') };
    });

    // Calculate Totals
    const footerTotals: Record<string, number> = { total_qty: 0, total_amount_val: 0 };
    const columnTotals: Record<string, number> = {};
    enrichedRows.forEach(row => {
      footerTotals.total_qty += row.total_qty;
      footerTotals.total_amount_val += Number(row.total_amount.replace(/,/g, ''));
      Object.keys(row.values).forEach(colKey => {
        columnTotals[colKey] = (columnTotals[colKey] || 0) + (row.values[colKey] || 0);
      });
    });

    return { enrichedRows, groups, cols, footerTotals, columnTotals };
  }, [currentReport.result?.paymentData, config]);

  const columnsList = useMemo<ColumnDef<SurgeryRecord>[]>(() => [
    { key: 'stt', label: 'STT', align: 'center', width: 'w-[40px]' },
    { key: 'patientId', label: 'Mã BN', width: 'w-[80px]' },
    { key: 'patientName', label: 'Họ tên', width: 'min-w-[180px]' },
    { key: 'gender', label: 'Giới', align: 'center', width: 'w-[50px]' },
    { key: 'yob', label: 'Năm sinh', align: 'center', width: 'w-[60px]' },
    { key: 'bhyt', label: 'Thẻ BHYT', width: 'w-[120px]' },
    { key: 'ngayCD', label: 'Ngày CĐ', render: (r) => formatDate(r.ngayCD, dateFormat), width: 'w-[110px]' },
    { key: 'ngayBD', label: 'Ngày BĐ', render: (r) => formatDate(r.ngayBD, dateFormat), width: 'w-[110px]' },
    { key: 'ngayKT', label: 'Ngày KT', render: (r) => formatDate(r.ngayKT, dateFormat), width: 'w-[110px]' },
    { key: 'tenKT', label: 'Tên kỹ thuật', width: 'min-w-[300px]' },
    { key: 'loaiPTTT', label: 'Loại', align: 'center', width: 'w-[60px]' },
    { key: 'soLuong', label: 'Số lượng', align: 'center', width: 'w-[60px]' },
    { key: 'timeMinutes', label: 'Phút', align: 'center', width: 'w-[50px]' },
    { key: 'ptChinh', label: 'PT Chính', width: 'min-w-[130px]' },
    { key: 'ptPhu', label: 'PT Phụ', width: 'min-w-[130px]' },
    { key: 'bsGM', label: 'BS GM', width: 'min-w-[130px]' },
    { key: 'ktvGM', label: 'KTV GM', width: 'min-w-[130px]' },
    { key: 'tdc', label: 'TDC', width: 'min-w-[130px]' },
    { key: 'gv', label: 'GV', width: 'min-w-[130px]' },
    { key: 'machine', label: 'Mã máy', width: 'min-w-[200px]' },
    {
      key: 'reason', label: 'Lỗi thời gian',
      render: (r) => {
        const min = config.timeRules[r.loaiPTTT]?.min;
        if (min && r.timeMinutes < min) return <span className="font-bold">{`< ${min}p`}</span>;
        return null;
      },
      width: 'min-w-[150px]'
    }
  ], [config.timeRules, dateFormat]);

  // Separate columns definition for Missing Machines (stripping machine & reason)
  const columnsMissing = useMemo<ColumnDef<SurgeryRecord>[]>(() => columnsList.filter(c => c.key !== 'machine' && c.key !== 'reason'), [columnsList]);

  const columnsStaff = useMemo<ColumnDef<StaffConflict>[]>(() => [
    { key: 'stt', label: '#', align: 'center', width: 'w-[40px]' },
    { key: 'staffName', label: 'NHÂN VIÊN TRÙNG', width: 'min-w-[150px]', headerClassName: 'text-center' },
    { key: 'role', label: 'Vai trò', width: 'w-[90px]', headerClassName: 'text-center' },

    // PATIENT 1 BLOCK (White/Default)
    { key: 'patientId1', label: 'Mã BN 1', width: 'w-[80px]', headerClassName: 'text-center' },
    { key: 'patientName1', label: 'Tên BN 1', width: 'min-w-[150px]', headerClassName: 'text-center' },
    { key: 'tenKT1', label: 'Tên KT 1', width: 'min-w-[200px]', headerClassName: 'text-center' },
    { key: 'ptChinh1', label: 'PT Chính 1', render: (c) => c.rec1.ptChinh || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'ptPhu1', label: 'PT Phụ 1', render: (c) => c.rec1.ptPhu || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'tdc1', label: 'TDC 1', render: (c) => c.rec1.tdc || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'ktvGM1', label: 'KTV GM 1', render: (c) => c.rec1.ktvGM || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'bsGM', label: 'BS GM 1', render: (c) => c.rec1.bsGM || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'gv1', label: 'GV 1', render: (c) => c.rec1.gv || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'start1', label: 'BĐ 1', render: (c) => formatDate(c.start1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },
    { key: 'end1', label: 'KT 1', render: (c) => formatDate(c.end1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },

    // PATIENT 2 BLOCK (Highlighted - Blue, darker header)
    { key: 'start2', label: 'BĐ 2', render: (c) => formatDate(c.start2, dateFormat), width: 'w-[110px]', className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'end2', label: 'KT 2', render: (c) => formatDate(c.end2, dateFormat), width: 'w-[110px]', className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientId2', label: 'Mã BN 2', width: 'w-[80px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientName2', label: 'Tên BN 2', width: 'min-w-[180px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tenKT2', label: 'Tên KT 2', width: 'min-w-[250px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ptChinh2', label: 'PT Chính 2', render: (c) => c.rec2.ptChinh || '-', width: 'min-w-[100px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ptPhu2', label: 'PT Phụ 2', render: (c) => c.rec2.ptPhu || '-', width: 'min-w-[140px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tdc2', label: 'TDC 2', render: (c) => c.rec2.tdc || '-', width: 'min-w-[140px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ktvGM2', label: 'KTV GM 2', render: (c) => c.rec2.ktvGM || '-', width: 'min-w-[140px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'bsgm2', label: 'BS GM 2', render: (c) => c.rec2.bsGM || '-', width: 'min-w-[140px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'gv2', label: 'GV 2', render: (c) => c.rec2.gv || '-', width: 'min-w-[140px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
  ], [dateFormat]);

  const columnsMachine = useMemo<ColumnDef<MachineConflict>[]>(() => [
    { key: 'stt', label: '#', align: 'center', width: 'w-[40px]' },
    { key: 'machine', label: 'MÁY TRÙNG', width: 'min-w-[200px]', headerClassName: 'text-center' },

    // PATIENT 1 BLOCK - Red text for time columns
    { key: 'patientId1', label: 'Mã BN 1', width: 'w-[80px]', headerClassName: 'text-center' },
    { key: 'patientName1', label: 'Tên BN 1', width: 'min-w-[150px]', headerClassName: 'text-center' },
    { key: 'tenKT1', label: 'Tên KT 1', width: 'min-w-[200px]', headerClassName: 'text-center' },
    { key: 'ptPhu1', label: 'PT Phụ 1', render: (c) => c.rec1.ptPhu || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'tdc1', label: 'TDC 1', render: (c) => c.rec1.tdc || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'bsgm1', label: 'BS GM 1', render: (c) => c.rec1.bsGM || '-', width: 'min-w-[100px]', headerClassName: 'text-center' },
    { key: 'start1', label: 'BĐ 1', render: (c) => formatDate(c.start1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },
    { key: 'end1', label: 'KT 1', render: (c) => formatDate(c.end1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800 text-center' },

    // PATIENT 2 BLOCK (Highlighted - Blue, darker header)
    { key: 'start2', label: 'BĐ 2', render: (c) => formatDate(c.start2, dateFormat), width: 'w-[110px]', className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'end2', label: 'KT 2', render: (c) => formatDate(c.end2, dateFormat), width: 'w-[110px]', className: 'bg-primary-500/5 text-primary-800 font-semibold group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientId2', label: 'Mã BN 2', width: 'w-[80px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'patientName2', label: 'Tên BN 2', width: 'min-w-[150px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tenKT2', label: 'Tên KT 2', width: 'min-w-[200px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'ptPhu2', label: 'PT Phụ 2', render: (c) => c.rec2.ptPhu || '-', width: 'min-w-[100px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'tdc2', label: 'TDC 2', render: (c) => c.rec2.tdc || '-', width: 'min-w-[100px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
    { key: 'bsgm2', label: 'BS GM 2', render: (c) => c.rec2.bsGM || '-', width: 'min-w-[100px]', className: 'bg-primary-500/5 text-primary-900 group-hover:bg-primary-500/20', headerClassName: 'bg-primary-300 text-primary-900 font-bold text-center' },
  ], [dateFormat]);

  const getPaymentColumns = (): ColumnDef<any>[] => {
    if (!currentReport.result?.paymentData?.columns) return [];
    return [
      { key: 'stt', label: '#', align: 'center', width: 'w-[30px]' },
      { key: 'department', label: 'Khoa', width: 'min-w-[60px]', className: 'whitespace-nowrap' },
      { key: 'taxId', label: 'Mã số thuế', width: 'min-w-[90px]', className: 'whitespace-nowrap' },
      { key: 'name', label: 'Họ tên', width: 'min-w-[180px]', className: 'whitespace-nowrap' },
      ...currentReport.result.paymentData.columns.map(col => ({
        key: `val_${col}`,
        label: col.replace("PT_", "").replace("TT_", "").replace("-", " "),
        render: (row: any) => (row.values[col] || 0) > 0 ? (row.values[col] || 0) : '-',
        align: 'right' as const,
        width: 'min-w-[60px]'
      })),
      { key: 'total_qty', label: 'Tổng số', align: 'center', width: 'min-w-[50px]', className: 'font-bold' },
      { key: 'total_amount', label: 'Thành tiền', align: 'right', width: 'min-w-[100px]', className: 'font-bold' }
    ];
  };

  // Add missing helpers
  const updateSearchTerm = (key: keyof typeof initialReportState.searchTerms, val: string) => {
    updateCurrentReport({ searchTerms: { ...currentReport.searchTerms, [key]: val } });
    if (key === 'list') setListPage(1);
  };
  const setActiveTable = (table: ReportState['activeTable']) => updateCurrentReport({ activeTable: table });

  // --- Data FIltering Memos (Moved to Top Level Scope for handleSaveAssistant) ---
  const listSearchableCols = useMemo(() => searchableCols['list'] || {
    patientId: true, patientName: true, ngayBD: true, tenKT: true,
    loaiPTTT: true, ptChinh: true, ptPhu: true, bsGM: true,
    ktvGM: true, tdc: true, gv: true, reason: true
  }, [searchableCols]);

  const [filterEmptyGV, setFilterEmptyGV] = useState(false);

  const filteredList = useMemo(() => {
    let list = (currentReport.result?.validRecords || []).filter(r => matchSearchQuery(r, currentReport.searchTerms.list, listSearchableCols, columnsList, config.timeRules));
    if (filterEmptyGV) {
      list = list.filter(r => !r.gv || r.gv.trim() === '');
    }
    return list;
  }, [currentReport.result?.validRecords, currentReport.searchTerms.list, config.timeRules, listSearchableCols, filterEmptyGV]);

  const filteredStaff = useMemo(() => {
    return (currentReport.result?.staffConflicts || []).filter(r => matchSearchQuery(r, currentReport.searchTerms.staff, undefined, columnsStaff));
  }, [currentReport.result?.staffConflicts, currentReport.searchTerms.staff]);

  const filteredMachine = useMemo(() => {
    return (currentReport.result?.machineConflicts || []).filter(r => matchSearchQuery(r, currentReport.searchTerms.machine, undefined, columnsMachine));
  }, [currentReport.result?.machineConflicts, currentReport.searchTerms.machine]);

  const filteredMissing = useMemo(() => {
    const rawData = (currentReport.detailFile || currentReport.dataSource === 'STORAGE')
      ? (currentReport.result?.missingRecords || [])
      : [];
    return rawData.filter(r => matchSearchQuery(r, currentReport.searchTerms.missing, undefined, columnsMissing));
  }, [currentReport.detailFile, currentReport.dataSource, currentReport.result?.missingRecords, currentReport.searchTerms.missing]);

  const [listPage, setListPage] = useState(1);

  const handleSaveAssistant = async (val: string) => {
    const cleanVal = val ? val.trim() : '';
    console.log(`[SaveAssistant] Called with Value: "${val}" (Clean: "${cleanVal}")`);
    console.log(`[SaveAssistant] Config Staff List Size: ${(config.staffList || []).length}`);

    // 0. Strict Validation (Server-side like check)
    // If value is not empty, it MUST match a valid staff member with an assistant role
    if (cleanVal !== '') {
      const validRoles = ["Phụ", "GV", "TDC", "KTV GM", "KTV", "Tit DC", "Tít DC"];

      const exactMatch = (config.staffList || []).find(s => s.name === cleanVal);
      if (exactMatch) {
        console.log(`[SaveAssistant] Found staff "${cleanVal}" with position: "${exactMatch.position}"`);
      } else {
        console.log(`[SaveAssistant] Staff "${cleanVal}" NOT found in list.`);
      }

      const isValidStaff = exactMatch && (
        validRoles.includes(exactMatch.position) ||
        exactMatch.position === "Phụ" ||
        exactMatch.name.includes("(Phụ)")
      );

      console.log(`[SaveAssistant] Validation check result: ${isValidStaff ? 'PASS' : 'FAIL'}`);

      if (!isValidStaff) {
        let msg = `Tên "${cleanVal}" không có trong danh sách nhân viên.`;
        if (exactMatch) {
          msg = `Nhân viên "${cleanVal}" (chức vụ: ${exactMatch.position}) không được phép làm Giúp việc.`;
        }
        addToast(msg, 'error');
        return; // BLOCK SAVE
      }
    } else {
      console.log(`[SaveAssistant] Value is empty, clearing field.`);
    }

    if (!currentReport.result?.validRecords) return;
    const { selectedRecordIds } = currentReport;
    if (!selectedRecordIds || selectedRecordIds.length === 0) return;

    // Use current visible list for navigation context
    const workingList = (currentReport.activeTable === 'list') ? filteredList : currentReport.result.validRecords;
    console.log(`[SaveAssistant] Working List Length: ${workingList.length}`);

    const updatedIds: string[] = [];

    // Phase 1: Update Data (Source of Truth)
    const isStorage = currentReport.dataSource === 'STORAGE';
    const batchUpdates: Promise<any>[] = [];

    // We iterate the MAIN records to ensure we update everything selected
    console.log(`[SaveAssistant] Selected IDs:`, selectedRecordIds);
    if (!selectedRecordIds || selectedRecordIds.length === 0) return; // Verify explicitly again

    currentReport.result.validRecords.forEach(r => {
      // Robust check: dynamic table might use ID or Key depending on data source
      const isSelected = (r.id && selectedRecordIds.includes(r.id)) || (r.key && selectedRecordIds.includes(r.key));

      if (isSelected) {
        const rId = r.id || r.key || '';
        r.gv = cleanVal;
        updatedIds.push(rId);

        if (isStorage && r.id) {
          const path = (r as any).firestorePath || `uploaded_surgeries/${r.id}`;
          console.log(`[SaveAssistant] Updating ${r.id} at path: ${path} with Value: ${cleanVal}`);

          const docRef = doc(firestore, path);
          batchUpdates.push(
            updateDoc(docRef, { gv: cleanVal })
              .then(() => console.log(`[SaveAssistant] Success: ${path}`))
              .catch(err => console.error(`[SaveAssistant] Failed: ${path}`, err))
          );
        }
      }
    });

    // Prepare state updates
    const stateUpdates: Partial<ReportState> = {};

    if (updatedIds.length > 0) {
      if (isStorage) {
        try {
          await Promise.all(batchUpdates);
          // Toast managed by caller or we can show it here
          addToast(`Đã lưu ${updatedIds.length} bản ghi.`, 'success');
        } catch (e) {
          console.error("Save failed", e);
          addToast("Lỗi khi lưu dữ liệu (chi tiết trong console)", 'error');
        }
      }

      // Phase 2: Recalculate Result (In-Memory)
      const newResultPartial = recalculateResultFromRecords(currentReport.result.validRecords, config);
      stateUpdates.result = { ...currentReport.result, ...newResultPartial };
    }

    // Phase 3: Smart Navigation (Find next empty GV in VISIBLE list)
    let lastSelectedIndex = -1;
    for (let i = workingList.length - 1; i >= 0; i--) {
      const r = workingList[i];
      const isSelected = (r.id && selectedRecordIds.includes(r.id)) || (r.key && selectedRecordIds.includes(r.key));
      if (isSelected) {
        lastSelectedIndex = i;
        break;
      }
    }

    console.log(`[AutoJump] Last Selected Index: ${lastSelectedIndex}`);

    if (lastSelectedIndex !== -1) {
      let nextIndex = -1;
      // Search forward
      for (let i = lastSelectedIndex + 1; i < workingList.length; i++) {
        const r = workingList[i];
        if (!r.gv || r.gv.trim() === '') {
          nextIndex = i;
          break;
        }
      }

      console.log(`[AutoJump] Forward search found: ${nextIndex}`);

      // Loop back
      if (nextIndex === -1) {
        for (let i = 0; i <= lastSelectedIndex; i++) {
          const r = workingList[i];
          if (!r.gv || r.gv.trim() === '') {
            nextIndex = i;
            break;
          }
        }
        console.log(`[AutoJump] Loop-back search found: ${nextIndex}`);
      }

      if (nextIndex !== -1) {
        const nextRecord = workingList[nextIndex];
        // FIX: Must match DynamicTable precedence (key > id) to ensure consistent selection/deselection
        const newId = nextRecord.key || nextRecord.id || '';
        console.log(`[AutoJump] Moving selection to index ${nextIndex} (ID: ${newId})`);

        stateUpdates.selectedRecordIds = [newId];

        // Switch page
        const targetPage = Math.ceil((nextIndex + 1) / rowsPerPage);
        console.log(`[AutoJump] Target page: ${targetPage}, Current page: ${listPage}`);
        if (targetPage !== listPage) {
          console.log(`[AutoJump] Switching page to ${targetPage}`);
          setListPage(targetPage);
        }
      } else {
        console.log(`[AutoJump] No empty records found.`);
        stateUpdates.selectedRecordIds = [];
      }
    }

    // Apply all updates atomically
    if (Object.keys(stateUpdates).length > 0) {
      updateCurrentReport(stateUpdates);
    }
  };

  const renderTableContent = () => {
    if (!currentReport.result || !currentReport.stats || !currentReport.activeTable) return null;

    if (currentReport.activeTable === 'list') {
      const rowStyle = (r: SurgeryRecord) => (config.timeRules[r.loaiPTTT]?.min && r.timeMinutes < config.timeRules[r.loaiPTTT].min) ? 'bg-yellow-50 text-red-600 font-medium' : '';
      const ptCount = currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('P')).length;
      const ttCount = currentReport.result.validRecords.filter(r => r.loaiPTTT?.startsWith('T')).length;
      const countLabel = `${ptCount} ca PT, ${ttCount} ca TT`;
      return <DynamicTable
        data={filteredList}
        columns={columnsList}
        tableName="Danh sách phẫu thuật"
        dateFormat={dateFormat}
        onDateFormatChange={updateDateFormat}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={updateRowsPerPage}
        defaultVisibleCols={visibleCols['list']}
        onVisibleColsChange={(cols) => updateVisibleCols('list', cols)}
        rowStyle={rowStyle}
        rowCountLabel={countLabel}
        searchTerm={currentReport.searchTerms.list}
        onSearchChange={(val) => updateSearchTerm('list', val)}
        searchableCols={listSearchableCols}
        onSearchableColsChange={(cols) => updateSearchableCols('list', cols)}
        showSearchSettings
        enableSelection={true}
        selectedIds={currentReport.selectedRecordIds}
        onSelect={handleRowSelect}
        onSelectAll={handleSelectAll}
        onDelete={handleDeleteSelected}
        currentPage={listPage}
        onPageChange={setListPage}
        onSaveAssistant={handleSaveAssistant}
        extraSearchContent={
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap ml-2 hover:text-primary-700 transition-colors">
            <input
              type="checkbox"
              checked={filterEmptyGV}
              onChange={(e) => setFilterEmptyGV(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 cursor-pointer"
            />
            Lọc trống GV
          </label>
        }
      />;
    }
    if (currentReport.activeTable === 'staff') {
      const staffRowStyle = (r: StaffConflict) => r.violationType === 'max2' ? 'text-red-600 font-bold bg-red-50' : '';
      return <DynamicTable data={filteredStaff} columns={columnsStaff} tableName="Danh sách trùng giờ nhân viên" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['staff']} onVisibleColsChange={(cols) => updateVisibleCols('staff', cols)} rowStyle={staffRowStyle} searchTerm={currentReport.searchTerms.staff} onSearchChange={(val) => updateSearchTerm('staff', val)} />;
    }
    if (currentReport.activeTable === 'machine') {
      return <DynamicTable data={filteredMachine} columns={columnsMachine} tableName="Danh sách trùng máy thực hiện" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['machine']} onVisibleColsChange={(cols) => updateVisibleCols('machine', cols)} searchTerm={currentReport.searchTerms.machine} onSearchChange={(val) => updateSearchTerm('machine', val)} />;
    }
    if (currentReport.activeTable === 'missing') {
      return <DynamicTable data={filteredMissing} columns={columnsMissing} tableName="Danh sách thiếu mã máy" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['missing']} onVisibleColsChange={(cols) => updateVisibleCols('missing', cols)} searchTerm={currentReport.searchTerms.missing} onSearchChange={(val) => updateSearchTerm('missing', val)} />;
    }
    if (currentReport.activeTable === 'payment') {
      if (!paymentDataPrepared) return null;
      const { enrichedRows, groups, cols, footerTotals, columnTotals } = paymentDataPrepared;
      const paymentCols = getPaymentColumns();
      const paymentSearchableCols = { department: true, taxId: true, name: true };
      const filtered = enrichedRows.filter((r: any) => matchSearchQuery(r, currentReport.searchTerms.payment, paymentSearchableCols, paymentCols));

      const currentVisible = visibleCols['payment'] || {};
      const isVisible = (key: string) => currentVisible[key] !== false;

      // Custom 2-level thead
      const CustomThead = (
        <thead className="text-xs text-gray-900 border-b">
          {/* Row 1: Group Headers */}
          <tr className="border-b">
            {isVisible('stt') && <th rowSpan={2} className="px-1 py-2 sticky left-0 bg-gray-100/95 backdrop-blur z-10 w-[30px] border-r shadow-[1px_0_0_0_rgba(0,0,0,0.05)] text-center align-middle font-bold text-[10px]">#</th>}
            {isVisible('department') && <th rowSpan={2} className="px-1 py-1 border-r min-w-[80px] font-bold text-gray-900 bg-gray-100 align-middle text-center text-[11px]">Khoa</th>}
            {isVisible('taxId') && <th rowSpan={2} className="px-1 py-1 border-r min-w-[80px] font-bold text-gray-900 bg-gray-100 align-middle text-center text-[11px]">Mã số thuế</th>}
            {isVisible('name') && <th rowSpan={2} className="px-1 py-1 border-r min-w-[150px] font-bold text-gray-900 bg-gray-100 align-middle text-center">Họ tên</th>}
            {groups.map(grp => {
              // Only show group if at least one sub-col is visible
              const visibleSubCols = grp.subCols.filter(role => isVisible(`val_${grp.name}-${role}`));
              if (visibleSubCols.length === 0) return null;

              // Color-code based on group type
              let bgMain = 'bg-gray-200';
              if (grp.name === 'PĐB') bgMain = 'bg-red-300';
              else if (grp.name === 'P1') bgMain = 'bg-orange-300';
              else if (grp.name === 'P2') bgMain = 'bg-yellow-300';
              else if (grp.name === 'P3') bgMain = 'bg-lime-300';
              else if (grp.name === 'TĐB') bgMain = 'bg-cyan-300';
              else if (grp.name === 'T1') bgMain = 'bg-sky-300';
              else if (grp.name === 'T2') bgMain = 'bg-primary-300';
              else if (grp.name === 'T3') bgMain = 'bg-primary-300';
              else if (grp.name === 'TKPL') bgMain = 'bg-purple-300';

              return (
                <th key={grp.name} colSpan={visibleSubCols.length} className={`px-2 py-2 border-r font-bold text-gray-900 ${bgMain} text-center align-middle`}>
                  {grp.label}
                </th>
              );
            })}
            {isVisible('total_qty') && <th rowSpan={2} className="px-2 py-2 border-r min-w-[80px] font-bold text-gray-900 bg-gray-100 align-middle text-center">Tổng số</th>}
            {isVisible('total_amount') && <th rowSpan={2} className="px-2 py-2 border-r min-w-[120px] font-bold text-gray-900 bg-gray-100 align-middle text-right">Thành tiền</th>}
          </tr>
          {/* Row 2: Sub-column Headers (Roles) */}
          <tr>
            {groups.flatMap(grp => {
              let bgSub = 'bg-gray-50';
              if (grp.name === 'PĐB') bgSub = 'bg-red-100';
              else if (grp.name === 'P1') bgSub = 'bg-orange-100';
              else if (grp.name === 'P2') bgSub = 'bg-yellow-100';
              else if (grp.name === 'P3') bgSub = 'bg-lime-100';
              else if (grp.name === 'TĐB') bgSub = 'bg-cyan-100';
              else if (grp.name === 'T1') bgSub = 'bg-sky-100';
              else if (grp.name === 'T2') bgSub = 'bg-primary-100';
              else if (grp.name === 'T3') bgSub = 'bg-primary-100';
              else if (grp.name === 'TKPL') bgSub = 'bg-purple-100';

              return grp.subCols.map(role => {
                const colKey = `val_${grp.name}-${role}`;
                if (!isVisible(colKey)) return null;
                return (
                  <th key={colKey} className={`px-2 py-1 border-r font-bold text-gray-900 ${bgSub} text-center align-middle text-[11px]`}>
                    {role}
                  </th>
                );
              });
            })}
          </tr>
        </thead>
      );

      // Unit Price Row (moved to extraHeaderRow in tbody)
      const ExtraHeader = (
        <tr className="bg-primary-50/30 font-medium text-xs text-primary-800 border-b">
          <td className="px-2 py-1 border-r text-center bg-primary-50 sticky left-0 z-10 font-bold"></td>
          {isVisible('department') && <td className="px-2 py-1 border-r text-right bg-primary-50/50"></td>}
          {isVisible('taxId') && <td className="px-2 py-1 border-r text-right bg-primary-50/50"></td>}
          {isVisible('name') && <td className="px-2 py-1 border-r text-right font-bold text-primary-500 italic">Đơn giá</td>}
          {cols.map(col => {
            if (!isVisible(`val_${col}`)) return null;
            const [loai, role] = col.split('-');
            let configRole: any = "Giúp việc";
            if (role === "Chính") configRole = "Chính";
            else if (role === "Phụ") configRole = "Phụ";
            else if (role === "Giúp việc") configRole = "Giúp việc";
            const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
            return <td key={col} className="px-2 py-1 border-r text-right text-primary-700 font-medium">{price > 0 ? price.toLocaleString('en-US') : '-'}</td>
          })}
          {isVisible('total_qty') && <td className="px-2 py-1 border-r bg-gray-50"></td>}
          {isVisible('total_amount') && <td className="px-2 py-1 border-r bg-gray-50"></td>}
        </tr>
      );

      const ExtraFooter = (
        <tr className="bg-primary-700/10 font-bold text-xs text-primary-900 border-t-2 border-primary-200">
          <td className="px-2 py-2 text-center sticky left-0 z-10 bg-primary-50"></td>
          {isVisible('department') && <td className="px-2 py-2 border-r bg-primary-50/50"></td>}
          {isVisible('taxId') && <td className="px-2 py-2 border-r bg-primary-50/50"></td>}
          {isVisible('name') && <td className="px-2 py-2 text-right">TỔNG CỘNG</td>}
          {cols.map(col => {
            if (!isVisible(`val_${col}`)) return null;
            return <td key={col} className="px-2 py-2 border-r text-right">{columnTotals[col] > 0 ? columnTotals[col] : '-'}</td>
          })}
          {isVisible('total_qty') && <td className="px-2 py-2 border-r text-center">{footerTotals.total_qty}</td>}
          {isVisible('total_amount') && <td className="px-2 py-2 border-r text-right">{footerTotals.total_amount_val.toLocaleString('en-US')}</td>}
        </tr>
      );

      // Custom Row Renderer for Department Separators
      const customRowRender = (row: any, index: number, allRows: any[]) => {
        const isEndOfDept = index < allRows.length - 1 && row.department !== allRows[index + 1].department;
        // Heavy blue border for department separation
        const borderClass = isEndOfDept ? "border-b-2 border-primary-700" : "border-b";

        return (
          <tr key={index} className={`hover:bg-gray-50 text-xs text-gray-800 ${borderClass}`}>
            <td className={`px-2 py-1 border-r text-center sticky left-0 bg-white z-10 font-medium`}>{index + 1}</td>
            {isVisible('department') && <td className="px-2 py-1 border-r font-medium text-gray-600">{row.department}</td>}
            {isVisible('taxId') && <td className="px-2 py-1 border-r">{row.taxId}</td>}
            {isVisible('name') && <td className="px-2 py-1 border-r font-medium text-gray-700">{row.name}</td>}

            {cols.map(col => {
              if (!isVisible(`val_${col}`)) return null;
              const val = row.values[col];
              return <td key={col} className="px-2 py-1 border-r text-right text-gray-600">{val ? val : '-'}</td>
            })}

            {isVisible('total_qty') && <td className="px-2 py-1 border-r text-center font-bold">{row.totalQty}</td>}
            {isVisible('total_amount') && (
              <td className="px-2 py-1 border-r text-right font-bold text-primary-700">
                {(() => {
                  let total = 0;
                  cols.forEach(col => {
                    const val = row.values[col] || 0;
                    const [loai, role] = col.split('-');
                    let configRole: any = "Giúp việc";
                    if (role === "Chính") configRole = "Chính";
                    else if (role === "Phụ") configRole = "Phụ";
                    else if (role === "Giúp việc") configRole = "Giúp việc";
                    const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
                    total += val * price;
                  });
                  return total.toLocaleString('en-US');
                })()}
              </td>
            )}
          </tr>
        )
      };

      return <DynamicTable
        data={filtered}
        columns={paymentCols}
        tableName="Bảng Thanh toán phẫu thuật, thủ thuật"
        dateFormat={dateFormat}
        onDateFormatChange={updateDateFormat}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={updateRowsPerPage}
        defaultVisibleCols={visibleCols['payment']}
        onVisibleColsChange={(cols) => updateVisibleCols('payment', cols)}
        searchableCols={paymentSearchableCols}
        searchTerm={currentReport.searchTerms.payment}
        onSearchChange={(val) => updateSearchTerm('payment', val)}
        customThead={CustomThead}
        customTfoot={ExtraFooter}
        extraHeaderRow={ExtraHeader}
        customRowRender={customRowRender}
      />;
    }
    return null;
  };

  // --- Print Handling ---
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState<any>(null);
  const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState(false);
  const printDropdownRef = useRef<HTMLDivElement>(null);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('landscape');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (printDropdownRef.current && !printDropdownRef.current.contains(event.target as Node)) {
        setIsPrintDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrintClick = async (type: 'list' | 'payment', orientation: 'portrait' | 'landscape') => {
    setPrintOrientation(orientation);
    if (type === 'list') {
      // Auto-save before printing for daily tab with EXCEL data
      if (activeTab === 'daily' && currentReport.dataSource === 'EXCEL' && currentReport.result?.validRecords) {
        await handleSaveData();
      }
      // Prepare List Print
      const listPrintConfig: any = {
        type: 'list',
        title: 'DANH SÁCH PHẪU THUẬT',
        dateRange: currentReport.result?.dateRangeText || currentReport.queryDateRangeText || '',
        data: currentReport.result?.validRecords || [],
        columns: columnsList.filter(c => visibleCols['list']?.[c.key] !== false),
        reportTab: activeTab as 'daily' | 'monthly',
      };
      // Add stats for daily report only
      if (activeTab === 'daily') {
        listPrintConfig.dailyStats = {
          ptCount,
          ttCount,
          lowPaymentCount: derivedStats.lowPaymentCount || 0,
          staffConflicts: derivedStats.staffConflicts,
          machineConflicts: derivedStats.machineConflicts,
          missingMachines: derivedStats.missingMachines,
          missingAssistantCount: derivedStats.missingAssistantCount,
          violateMinTimeCount: derivedStats.violateMinTimeCount,
        };
      }
      setPrintConfig(listPrintConfig);
      setIsPrintOpen(true);
    } else if (type === 'payment' && paymentDataPrepared) {
      // Prepare Payment Print - Need to reconstruct headers
      const { enrichedRows, groups, cols, footerTotals, columnTotals } = paymentDataPrepared;
      const currentVisible = visibleCols['payment'] || {};
      const isVisible = (key: string) => currentVisible[key] !== false;
      const paymentCols = getPaymentColumns().filter(c => isVisible(c.key));

      // Re-create the custom Header components for Print (needs to be passed as node or reconstructed in PrintPreview)
      // Since PrintPreview accepts 'customThead', we will construct it here basically identical to table render
      const PrintThead = (
        <thead className="text-xs text-black border-b border-black">
          {/* Row 1: Group Headers */}
          <tr className="border-b border-black">
            {isVisible('stt') && <th rowSpan={2} className="px-1 py-1 border-r border-black w-[30px] text-center align-middle font-bold text-[10px]">STT</th>}
            {isVisible('department') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px] col-dept">Khoa</th>}
            {isVisible('taxId') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px] col-tax">Mã số thuế</th>}
            {isVisible('name') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[11px] col-name">Họ tên</th>}
            {groups.map(grp => {
              const visibleSubCols = grp.subCols.filter(role => isVisible(`val_${grp.name}-${role}`));
              if (visibleSubCols.length === 0) return null;
              return (
                <th key={grp.name} colSpan={visibleSubCols.length} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px]">{grp.label}</th>
              );
            })}
            {isVisible('total_qty') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-center align-middle text-[10px] col-numeric">Tổng số</th>}
            {isVisible('total_amount') && <th rowSpan={2} className="px-1 py-1 border border-black font-bold text-right align-middle text-[10px] col-total">Thành tiền</th>}
          </tr>
          <tr>
            {groups.flatMap(grp => grp.subCols.map(role => {
              const colKey = `val_${grp.name}-${role}`;
              if (!isVisible(colKey)) return null;
              return (
                <th key={colKey} className="px-1 py-0.5 border border-black font-bold text-center align-middle text-[9px] col-numeric">{role}</th>
              );
            }))}
          </tr>
        </thead>
      );

      const ExtraFooter = (
        <tr className="font-bold text-xs border-t border-black">
          <td className="px-1 py-1 text-center border border-black"></td>
          <td className="px-1 py-1 border border-black bg-gray-50/50"></td>
          <td className="px-1 py-1 border border-black bg-gray-50/50"></td>
          <td className="px-1 py-1 text-right border border-black">TỔNG CỘNG</td>
          <td className="px-2 py-2 text-center border border-black"></td> {/* Empty for STT if we added it manually in column map... wait, STT is separate td in PrintPreview */}
          {/* Actually STT is separate. The columns map starts from name. */}
          {/* Let's adjust footer to match columns map size */}
          {/* Payment Cols: [Name, ...Vals, TotalQty, TotalAmt] */}
          {/* We need an empty cell for Name, then values... */}

          {/* Correction: The PrintPreview renders: STT Column (always), then mapped Columns. */}
          {/* So Footer needs: 1 cell (STT) + 1 cell (Name) + ... */}

          {/* Wait, my manual footer construction below needs to align with mapped columns */}
          {/* PrintPreview loop: STT, then Col 1, Col 2... */}
          {/* Footer: */}
          <td className="border border-black px-2 py-2 text-right pointer-events-none opacity-0"></td>
          {/* Use carefully constructed footer */}
        </tr>
      );

      // Let's rely on passing props to PrintPreview to render special rows if needed, OR just pass data & columns.
      // For Payment, we passed `customThead`. Components inside `PrintPreview` will use it.

      // Re-create Extra Footer for Print
      const PrintFooter = (
        <tr className="font-bold text-xs">
          <td className="px-1 py-1 border border-black text-center col-stt">{/*STT*/}</td>
          {isVisible('department') && <td className="px-1 py-1 border border-black col-dept"></td>}
          {isVisible('taxId') && <td className="px-1 py-1 border border-black col-tax"></td>}
          {isVisible('name') && <td className="px-1 py-1 text-right border border-black col-name text-[11px]">TỔNG CỘNG</td>}
          {cols.map(col => {
            if (!isVisible(`val_${col}`)) return null;
            return <td key={col} className="px-1 py-1 border border-black text-right col-numeric">{columnTotals[col] > 0 ? columnTotals[col] : '-'}</td>
          })}
          {isVisible('total_qty') && <td className="px-1 py-1 border border-black text-center col-numeric">{footerTotals.total_qty}</td>}
          {isVisible('total_amount') && <td className="px-1 py-1 border border-black text-right col-total">{footerTotals.total_amount_val.toLocaleString('en-US')}</td>}
        </tr>
      );

      // Re-create Unit Price Header Row
      const PrintExtraHeader = (
        <tr className="font-bold text-xs text-center italic">
          <td className="px-1 py-0.5 border border-black col-stt"></td>
          {isVisible('department') && <td className="px-1 py-0.5 border border-black col-dept"></td>}
          {isVisible('taxId') && <td className="px-1 py-0.5 border border-black col-tax"></td>}
          {isVisible('name') && <td className="px-1 py-0.5 border border-black text-right opacity-0 text-[10px] col-name">Đơn giá</td>}
          {cols.map(col => {
            if (!isVisible(`val_${col}`)) return null;
            const [loai, role] = col.split('-');
            let configRole: any = "Giúp việc";
            if (role === "Chính") configRole = "Chính";
            else if (role === "Phụ") configRole = "Phụ";
            else if (role === "Giúp việc") configRole = "Giúp việc";
            const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
            return <td key={col} className="px-1 py-0.5 border border-black text-right text-[10px] col-numeric">{price.toLocaleString('en-US')}</td>
          })}
          {isVisible('total_qty') && <td className="px-1 py-0.5 border border-black text-[10px] col-numeric"></td>}
          {isVisible('total_amount') && <td className="px-1 py-0.5 border border-black text-[10px] col-total"></td>}
        </tr>
      );

      // Calculate Payment Stats
      const surgeryCountsByType: Record<string, number> = {};
      currentReport.result?.validRecords?.forEach(record => {
        const loai = record.loaiPTTT;
        if (loai) {
          surgeryCountsByType[loai] = (surgeryCountsByType[loai] || 0) + (record.soLuong || 1);
        }
      });

      const typeLabels: Record<string, string> = {
        PĐB: "Phẫu thuật đặc biệt",
        P1: "Phẫu thuật loại 1",
        P2: "Phẫu thuật loại 2",
        P3: "Phẫu thuật loại 3",
        TĐB: "Thủ thuật đặc biệt",
        T1: "Thủ thuật loại 1",
        T2: "Thủ thuật loại 2",
        T3: "Thủ thuật loại 3",
        TKPL: "Thủ thuật Khác/KPL",
      };

      const PrintPaymentStats = (
        <div className="flex flex-col gap-0.5 mt-2">
          {Object.entries(surgeryCountsByType)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => {
              // sort to match PDB -> P1 -> P2 -> P3 -> TDB -> T1 -> T2 -> T3 etc
              const order = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];
              const indA = order.indexOf(a[0]);
              const indB = order.indexOf(b[0]);
              return (indA === -1 ? 99 : indA) - (indB === -1 ? 99 : indB);
            })
            .map(([loai, count]) => (
              <div key={loai}>
                {typeLabels[loai] || loai}: {Number.isInteger(count) ? count : count.toFixed(2)} ca
              </div>
            ))}
        </div>
      );

      setPrintConfig({
        type: 'payment',
        title: 'BẢNG THANH TOÁN PHẪU THUẬT, THỦ THUẬT',
        dateRange: currentReport.result?.dateRangeText || currentReport.queryDateRangeText || '',
        data: enrichedRows,
        columns: paymentCols,
        customThead: PrintThead,
        extraFooterRow: PrintFooter,
        extraHeaderRow: PrintExtraHeader,
        paymentStatsBlock: PrintPaymentStats
      });
      setIsPrintOpen(true);

    } else {
      addToast("Vui lòng chọn 'Danh sách PT' hoặc 'Bảng kê thanh toán' để in.", 'error');
    }
  };

  // Helper function to determine season based on working hours config
  const determineSeason = (checkDate: Date, workingHours: any): 'summer' | 'winter' => {
    const checkMonth = checkDate.getMonth() + 1; // 1-12
    const checkDay = checkDate.getDate(); // 1-31

    // Parse summer config (DD/MM format)
    const [summerFromDay, summerFromMonth] = workingHours.summer.dateFrom.split('/').map(Number);
    const [summerToDay, summerToMonth] = workingHours.summer.dateTo.split('/').map(Number);

    // Parse winter config (DD/MM format)
    const [winterFromDay, winterFromMonth] = workingHours.winter.dateFrom.split('/').map(Number);
    const [winterToDay, winterToMonth] = workingHours.winter.dateTo.split('/').map(Number);

    // Check if range is cross-year
    const summerCrossYear = summerFromMonth > summerToMonth ||
      (summerFromMonth === summerToMonth && summerFromDay > summerToDay);
    const winterCrossYear = winterFromMonth > winterToMonth ||
      (winterFromMonth === winterToMonth && winterFromDay > winterToDay);

    // Helper to check if date is in range
    const isInRange = (checkM: number, checkD: number, fromM: number, fromD: number, toM: number, toD: number, crossYear: boolean): boolean => {
      if (!crossYear) {
        // Same year range
        if (checkM < fromM || checkM > toM) return false;
        if (checkM === fromM && checkD < fromD) return false;
        if (checkM === toM && checkD > toD) return false;
        return true;
      } else {
        // Cross-year range: early year (01/01 to toM/toD) OR late year (fromM/fromD to 31/12)
        if (checkM <= toM) {
          // Early year part
          if (checkM < toM) return true;
          if (checkM === toM && checkD <= toD) return true;
          return false;
        } else if (checkM >= fromM) {
          // Late year part
          if (checkM > fromM) return true;
          if (checkM === fromM && checkD >= fromD) return true;
          return false;
        }
        return false;
      }
    };

    // Check summer first
    if (isInRange(checkMonth, checkDay, summerFromMonth, summerFromDay, summerToMonth, summerToDay, summerCrossYear)) {
      return 'summer';
    }

    // Otherwise winter
    return 'winter';
  };

  // Handler for "Lấy dữ liệu trực" button
  const handleAutoFill24hShift = () => {
    // Step 1: Get dateFrom from current report (YYYY-MM-DD format)
    const dateFromStr = currentReport.dateFrom;
    if (!dateFromStr) {
      addToast('Vui lòng chọn ngày bắt đầu trước', 'error');
      return;
    }

    const dateFrom = new Date(dateFromStr);

    // Step 2: Calculate dateTo = dateFrom + 1 day
    const dateTo = new Date(dateFrom);
    dateTo.setDate(dateTo.getDate() + 1);
    const dateToStr = dateTo.toISOString().split('T')[0]; // YYYY-MM-DD

    // Step 3: Determine season
    const season = determineSeason(dateFrom, config.workingHours);

    // Step 4: Get morningFrom time from matching season
    const morningFrom = season === 'summer'
      ? config.workingHours.summer.morningFrom
      : config.workingHours.winter.morningFrom;

    // Step 5: Calculate timeTo = morningFrom - 1 minute
    const [hours, minutes] = morningFrom.split(':').map(Number);
    let toMinutes = minutes - 1;
    let toHours = hours;

    if (toMinutes < 0) {
      toMinutes = 59;
      toHours = hours - 1;
      if (toHours < 0) {
        toHours = 23;
      }
    }

    const timeTo = `${String(toHours).padStart(2, '0')}:${String(toMinutes).padStart(2, '0')}`;

    // Step 6: Update currentReport with all 4 values
    updateCurrentReport({
      dateFrom: dateFromStr,
      timeFrom: morningFrom,
      dateTo: dateToStr,
      timeTo: timeTo
    });

    // Step 7: Trigger data fetch immediately with computed values (no need to wait for state)
    // Build ISO strings from computed values (with Vietnam timezone +07:00)
    const dateFromIso = `${dateFromStr}T${morningFrom}:00.000+07:00`;
    const dateToIso = `${dateToStr}T${timeTo}:59.999+07:00`;

    // Call handleGetReport logic inline
    (async () => {
      try {
        addToast('Đang tải dữ liệu lưu trữ...', 'success');

        const isoFrom = new Date(dateFromIso).toISOString();
        const isoTo = new Date(dateToIso).toISOString();

        const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
        const persistedRecords = await reportService.getReports(isoFrom, isoTo, type);

        if (persistedRecords.length === 0) {
          // Reset UI and show detailed message
          updateCurrentReport({
            result: undefined,
            stats: undefined,
            dataSource: undefined,
            queryDateRangeText: ''
          });
          addToast(`Không có trường hợp phẫu thuật nào trong khoảng thời gian từ ${dateFromStr} ${morningFrom} đến ${dateToStr} ${timeTo}`, 'error');
          return;
        }

        // Convert PersistedSurgeryRecord to SurgeryRecord
        const convertedRecords: SurgeryRecord[] = persistedRecords.map(r => ({
          ...r,
          stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
          start: r.ngayBD ? new Date(r.ngayBD) : null,
          end: r.ngayKT ? new Date(r.ngayKT) : null,
        }));

        const result = recalculateResultFromRecords(convertedRecords, config) as ProcessingResult;

        updateCurrentReport({
          dateFrom: dateFromStr,
          timeFrom: morningFrom,
          dateTo: dateToStr,
          timeTo: timeTo,
          result: result,
          stats: result.stats,
          activeTable: 'list',
          queryDateRangeText: `Từ ngày ${formatDateForDisplay(dateFromStr, morningFrom)} đến ngày ${formatDateForDisplay(dateToStr, timeTo)}`,
          dataSource: 'STORAGE'
        });

        addToast(`Đã tải ${persistedRecords.length} ca phẫu thuật từ dữ liệu lưu trữ`, 'success');
      } catch (error: any) {
        console.error('Error fetching report:', error);
        addToast(`Lỗi khi tải dữ liệu: ${error.message}`, 'error');
      }
    })();
  };

  const handleGetReport = async () => {
    // Construct Date Range from State with explicit timezone (Vietnam = +07:00)
    // This ensures the date-time is correctly parsed as local time before conversion to UTC
    const dateFromStr = `${currentReport.dateFrom}T${currentReport.timeFrom}:00.000+07:00`;
    const dateToStr = `${currentReport.dateTo}T${currentReport.timeTo}:59.999+07:00`;

    // Validate
    const paramsValid = new Date(dateFromStr) <= new Date(dateToStr);
    if (!paramsValid) {
      addToast("Thời gian 'Đến' phải lớn hơn hoặc bằng Thời gian 'Từ'", 'error');
      return;
    }

    try {
      addToast('Đang tải dữ liệu lưu trữ...', 'success'); // Treating as success/info

      const isoFrom = new Date(dateFromStr).toISOString();
      const isoTo = new Date(dateToStr).toISOString();


      const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';
      const persistedRecords = await reportService.getReports(isoFrom, isoTo, type);

      if (!persistedRecords || persistedRecords.length === 0) {
        // Reset UI and show detailed message
        updateCurrentReport({
          result: undefined,
          stats: undefined,
          dataSource: undefined,
          queryDateRangeText: ''
        });
        addToast(`Không có trường hợp phẫu thuật nào trong khoảng thời gian từ ${currentReport.dateFrom} ${currentReport.timeFrom} đến ${currentReport.dateTo} ${currentReport.timeTo}`, 'error');
        return;
      }

      // Convert Persisted Record -> App Record (Dates)
      const convertedRecords: SurgeryRecord[] = persistedRecords.map(r => ({
        ...r,
        stt: typeof r.stt === 'number' ? r.stt : parseInt(r.stt as string) || 0,
        start: r.ngayBD ? new Date(r.ngayBD) : null,
        end: r.ngayKT ? new Date(r.ngayKT) : null,
        // Ensure other fields are mapped if needed, mostly they match
      }));

      const res = await reprocessSurgicalRecords(convertedRecords, config);

      if (res.success) {
        // Auto-fill assistant AND machine data for monthly reports from daily reports
        if (type === 'MONTHLY' && res.validRecords) {
          try {
            // Get both assistant and machine data from Daily
            const [assistantMap, machineMap] = await Promise.all([
              reportService.getAssistantDataFromDaily(res.validRecords),
              reportService.getMachineDataFromDaily(res.validRecords)
            ]);

            let updateGvCount = 0;
            let updateMachineCount = 0;
            const updatesToSave: Array<{ firestorePath: string, gv?: string, machine?: string }> = [];

            res.validRecords.forEach(r => {
              const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
              const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;
              let needsUpdate = false;
              const updateData: { firestorePath: string, gv?: string, machine?: string } = {
                firestorePath: r.firestorePath || ''
              };

              // Fill assistant if empty (only fill missing data)
              if (!r.gv || r.gv.trim() === '') {
                const dailyGv = assistantMap.get(key);
                if (dailyGv) {
                  r.gv = dailyGv;
                  updateData.gv = dailyGv;
                  updateGvCount++;
                  needsUpdate = true;
                }
              }

              // Fill machine if empty (only fill missing data)
              if (!r.machine || r.machine.trim() === '') {
                const dailyMachine = machineMap.get(key);
                if (dailyMachine) {
                  r.machine = dailyMachine;
                  updateData.machine = dailyMachine;
                  updateMachineCount++;
                  needsUpdate = true;
                }
              }

              // Add to updates list if has valid path and needs update
              if (needsUpdate && updateData.firestorePath) {
                updatesToSave.push(updateData);
              }
            });

            if (updateGvCount > 0 || updateMachineCount > 0) {
              // AUTO-SAVE: Persist the auto-filled data to Storage
              if (updatesToSave.length > 0) {
                try {
                  await reportService.batchUpdateGvAndMachine(updatesToSave);
                  console.log(`Auto-saved ${updatesToSave.length} records with GV/machine data to monthly storage.`);
                } catch (saveError) {
                  console.error('Error auto-saving to storage:', saveError);
                  // Continue anyway - data is still in memory for display
                }
              }

              // Recalculate with updated data
              const freshResult = reprocessSurgicalRecords(
                res.validRecords,
                config,
                res.dateRangeText || ''
              );

              // Update state with fresh calculations
              updateCurrentReport({
                result: freshResult,
                stats: freshResult.stats,
                activeTable: 'list',
                isProcessing: false,
                dataSource: 'STORAGE',
                queryDateRangeText: `Từ ngày ${formatDateForDisplay(currentReport.dateFrom, currentReport.timeFrom)} đến ngày ${formatDateForDisplay(currentReport.dateTo, currentReport.timeTo)}`,
                selectedRecordIds: [],
                hasAutoFilledData: false // No need to show save button since already saved
              });

              const autoFillMsg = [];
              if (updateGvCount > 0) autoFillMsg.push(`${updateGvCount} giúp việc`);
              if (updateMachineCount > 0) autoFillMsg.push(`${updateMachineCount} mã máy`);

              addToast(`Đã tải ${persistedRecords.length} bản ghi. Tự động điền và lưu ${autoFillMsg.join(' và ')} từ BC hàng ngày.`, 'success');
              return; // Exit early since we already updated state
            }

          } catch (error) {
            console.error('Error auto-filling from daily data:', error);
            // Continue with normal flow if auto-fill fails
          }
        }


        updateCurrentReport({
          result: res,
          stats: res.stats,
          activeTable: 'list',
          isProcessing: false,
          dataSource: 'STORAGE',
          queryDateRangeText: `Từ ngày ${formatDateForDisplay(currentReport.dateFrom, currentReport.timeFrom)} đến ngày ${formatDateForDisplay(currentReport.dateTo, currentReport.timeTo)}`,
          selectedRecordIds: [] // Reset selection
        });
        addToast(`Đã tải ${persistedRecords.length} bản ghi thành công.`, 'success');
      } else {
        addToast(res.message, 'error');
      }

    } catch (error) {
      console.error("Error getting report:", error);
      addToast('Có lỗi xảy ra khi lấy dữ liệu.', 'error');
    }
  };

  const handleSaveData = async () => {
    if (!currentReport.result || !currentReport.result.validRecords) {
      addToast("Không có dữ liệu hợp lệ để lưu.", "error"); // warning -> error
      return;
    }

    setIsSaving(true);
    try {
      const type = activeTab === 'monthly' ? 'MONTHLY' : 'DAILY';

      const userId = "anonymous_user";

      const { savedCount, skippedCount, updatedCount } = await reportService.saveReport(
        currentReport.result.validRecords,
        type,
        userId,
        currentReport.dataSource || 'EXCEL'
      );

      // Build appropriate message based on results
      let msg = '';
      if (savedCount > 0 && updatedCount > 0) {
        msg = `Lưu dữ liệu thành công! Đã lưu ${savedCount} bản ghi, cập nhật ${updatedCount} bản ghi.`;
      } else if (savedCount > 0) {
        msg = `Lưu dữ liệu thành công! Đã lưu ${savedCount} bản ghi.`;
      } else if (updatedCount > 0) {
        msg = `Cập nhật thành công! Đã cập nhật ${updatedCount} bản ghi giúp việc.`;
      } else {
        msg = `Tất cả bản ghi đã tồn tại hoặc không có giúp việc. Không có gì để lưu.`;
      }

      if (skippedCount > 0 && (savedCount > 0 || updatedCount > 0)) {
        msg += ` Bỏ qua ${skippedCount} bản ghi trùng lặp.`;
      }

      if (savedCount === 0 && updatedCount === 0) {
        addToast(msg, 'error');
      } else {
        addToast(msg, 'success');
      }

    } catch (error) {
      console.error(error);
      addToast("Lỗi khi lưu dữ liệu. Vui lòng thử lại.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTimeChange = (val: string, setter: (v: string) => void) => {
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

    setter(formatted);
  };


  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-inter">
      <PrintPreview
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        orientation={printOrientation}
        hospitalName={config.hospitalName}
        {...printConfig}
      />
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <header className="bg-gradient-to-r from-primary-800 to-primary-900 sticky top-0 z-30 shadow-lg">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 backdrop-blur-sm p-2 rounded-xl">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight font-heading">SurgicalDataPro</h1>
              <p className="text-[10px] text-primary-200 font-medium -mt-0.5">Quản lý danh sách phẫu thuật, thủ thuật</p>
            </div>
          </div>
          <div className="flex items-center gap-4">

            <nav className="flex items-center gap-1 bg-white/10 backdrop-blur-sm p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'daily'
                  ? 'bg-white text-primary-800 shadow-md'
                  : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <LayoutDashboard className={`h-3.5 w-3.5 ${activeTab === 'daily' ? 'text-primary-800' : 'text-primary-300'}`} />
                BC hàng ngày
              </button>

              <button
                onClick={() => setActiveTab('monthly')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'monthly'
                  ? 'bg-white text-primary-800 shadow-md'
                  : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <Calendar className={`h-3.5 w-3.5 ${activeTab === 'monthly' ? 'text-primary-800' : 'text-primary-300'}`} />
                BC tháng
              </button>

              <button
                onClick={() => setActiveTab('config')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${activeTab === 'config'
                  ? 'bg-white text-primary-800 shadow-md'
                  : 'text-primary-100 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <Settings className={`h-3.5 w-3.5 ${activeTab === 'config' ? 'text-primary-800' : 'text-primary-300'}`} />
                Cấu hình
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
        {(activeTab === 'daily' || activeTab === 'monthly') && (
          <div className="space-y-6 animate-fade-in relative w-full mx-auto">

            <div className="max-w-7xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col text-sm max-w-6xl mx-auto w-full mb-8 border border-gray-100">
                {/* Tabs */}
                <div className={`flex px-4 pt-4 bg-gray-50 -mb-[2px] relative z-20 border-b-2 ${activeDataTab === 'storage'
                  ? 'border-b-primary-700'
                  : 'border-b-accent-600'
                  }`}>
                  <button
                    onClick={() => setActiveDataTab('storage')}
                    className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg -mb-[2px] relative ${activeDataTab === 'storage'
                      ? 'bg-white text-primary-800 border-primary-700 z-30 shadow-sm'
                      : 'bg-transparent text-gray-400 border-transparent hover:text-primary-700'
                      }`}
                  >
                    <Database className={`h-4 w-4 ${activeDataTab === 'storage' ? 'text-primary-700' : ''}`} />
                    Dữ liệu lưu trữ
                  </button>
                  <button
                    onClick={() => setActiveDataTab('upload')}
                    className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg -mb-[2px] relative ${activeDataTab === 'upload'
                      ? 'bg-white text-accent-700 border-accent-600 z-30 shadow-sm'
                      : 'bg-transparent text-gray-400 border-transparent hover:text-accent-600'
                      }`}
                  >
                    <Sparkles className={`h-4 w-4 ${activeDataTab === 'upload' ? 'text-accent-600' : ''}`} />
                    Xử lý dữ liệu từ Minh Lộ
                  </button>
                </div>

                {/* Content */}
                <div className={`p-6 bg-white border-2 rounded-b-xl z-10 ${activeDataTab === 'storage' ? 'border-primary-700' : 'border-accent-600'
                  }`}>
                  {activeDataTab === 'storage' && (
                    <div className="flex flex-col space-y-4 max-w-2xl mx-auto py-4">


                      <div className="flex flex-col gap-6">
                        {/* Two Columns for Date/Time */}
                        <div className="grid grid-cols-2 gap-8 px-4">
                          {/* Left Column: From */}
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-600 italic">Chọn thời gian từ:</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={currentReport.dateFrom}
                                onChange={(e) => updateCurrentReport({ dateFrom: e.target.value })}
                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                              />
                              <input
                                type="text"
                                placeholder="HH:mm"
                                value={currentReport.timeFrom}
                                onChange={(e) => handleTimeChange(e.target.value, (val) => updateCurrentReport({ timeFrom: val }))}
                                maxLength={5}
                                className="w-20 px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none placeholder:text-gray-400"
                              />
                            </div>
                          </div>

                          {/* Right Column: To */}
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-600">Đến:</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={currentReport.dateTo}
                                onChange={(e) => updateCurrentReport({ dateTo: e.target.value })}
                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                              />
                              <input
                                type="text"
                                placeholder="HH:mm"
                                value={currentReport.timeTo}
                                onChange={(e) => handleTimeChange(e.target.value, (val) => updateCurrentReport({ timeTo: val }))}
                                maxLength={5}
                                className="w-20 px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center text-gray-700 focus:ring-2 focus:ring-primary-500 outline-none placeholder:text-gray-400"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Buttons Area - Centered & Fixed Width */}
                        <div className="flex flex-row items-center justify-center gap-4 mt-6">
                          <button
                            onClick={handleGetReport}
                            className="w-64 px-4 py-2.5 rounded-lg font-bold shadow-md transition-all text-sm flex items-center justify-center gap-2 bg-primary-700 hover:bg-primary-800 text-white"
                          >
                            <Download className="h-4 w-4" />
                            Lấy dữ liệu
                          </button>
                          <button onClick={handleAutoFill24hShift} className="w-64 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-primary-700 border-2 border-primary-100 font-bold text-sm hover:bg-primary-50 hover:border-primary-200 transition-all active:scale-[0.98]">
                            <Zap className="h-4 w-4" />
                            Lấy dữ liệu trực
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeDataTab === 'upload' && (
                    <div className="flex flex-col space-y-4 max-w-6xl mx-auto py-4">


                      <div className="grid grid-cols-2 gap-4 flex-1">
                        {/* Item 1: Danh sách PT */}
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-row items-center gap-4 p-5 bg-primary-50/50 rounded-lg border border-primary-100 hover:border-primary-300 transition-colors h-32">
                            <div className="bg-primary-700 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow">1</div>
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-primary-900 text-base block mb-1">Danh sách PT</span>
                              <p className="text-primary-700/70 text-xs">10. Danh sách PT</p>
                            </div>
                            <div className="w-32 h-20">
                              <FileUpload label="" file={currentReport.listFile} onFileSelect={handleListFileSelect} accept=".xlsx, .xls" compact={true} />
                            </div>
                          </div>
                          {currentReport.listFile && (
                            <p className="text-primary-700 font-medium text-xs italic px-1">
                              File đã tải: {currentReport.listFile.name}
                            </p>
                          )}
                        </div>

                        {/* Item 2: Chi tiết PT */}
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-row items-center gap-4 p-5 bg-emerald-50/50 rounded-lg border border-emerald-100 hover:border-emerald-300 transition-colors h-32">
                            <div className="bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow">2</div>
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-emerald-900 text-base block mb-1">Chi tiết theo khoa</span>
                              <p className="text-emerald-700 text-xs mt-0.5">Báo cáo → BC CLS → Chi tiết PT theo khoa</p>
                              <p className="text-[#b91c1c] font-bold text-xs mt-1">Chọn nhóm theo thứ tự: Họ tên → Ngày làm → Máy làm</p>
                            </div>
                            <div className="w-32 h-20">
                              <FileUpload label="" file={currentReport.detailFile} onFileSelect={handleDetailFileSelect} accept=".xlsx, .xls" compact={true} />
                            </div>
                          </div>
                          {currentReport.detailFile && (
                            <p className="text-emerald-600 font-medium text-xs italic px-1">
                              File đã tải: {currentReport.detailFile.name}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 flex justify-center gap-3">
                        {currentReport.isProcessing ? (
                          <div className="w-[600px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-primary-700 font-bold text-sm animate-pulse">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Đang xử lý...
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleProcess(currentType)}
                              disabled={!currentReport.listFile}
                              className={`flex-1 max-w-[450px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] ${currentReport.listFile
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-200'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                }`}
                            >
                              <Zap className="h-4 w-4 fill-current" />
                              Xử lý dữ liệu
                            </button>
                            {(currentReport.listFile || currentReport.detailFile) && (
                              <button
                                onClick={() => handleResetUpload(currentType)}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:border-red-300"
                              >
                                <RotateCcw className="h-4 w-4" />
                                Hủy tải lên
                              </button>
                            )}
                          </>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </div>

            {currentReport.stats && currentReport.result && (
              <>
                <div className="max-w-7xl mx-auto mt-6">
                  <div id="results-section" className={`space-y-6 animate-fade-in bg-gradient-to-b rounded-xl p-6 border shadow-sm ${currentReport.dataSource === 'EXCEL'
                    ? 'from-emerald-50/50 to-white border-emerald-100'
                    : 'from-primary-50/50 to-white border-primary-100'
                    }`}>

                    <div className="flex items-center gap-4 mb-6">
                      <div className={`p-2 rounded-lg ${currentReport.dataSource === 'EXCEL' ? 'bg-emerald-100' : 'bg-primary-100'}`}>
                        {currentReport.dataSource === 'EXCEL' ? (
                          <Sparkles className={`h-6 w-6 ${currentReport.dataSource === 'EXCEL' ? 'text-emerald-600' : 'text-primary-700'}`} />
                        ) : (
                          <Database className="h-6 w-6 text-primary-700" />
                        )}
                      </div>
                      <h2 className={`text-lg font-bold ${currentReport.dataSource === 'EXCEL' ? 'text-emerald-900' : 'text-primary-900'}`}>
                        {currentReport.dataSource === 'EXCEL' ? 'Dữ liệu từ Minh Lộ' :
                          currentReport.dataSource === 'STORAGE' ? 'Dữ liệu lưu trữ' : 'Kết quả xử lý'}
                      </h2>
                      {currentReport.result.dateRangeText && (
                        <p className={`text-lg font-bold ${currentReport.dataSource === 'EXCEL' ? 'text-emerald-800' : 'text-primary-800'}`}>
                          {currentReport.result.dateRangeText}
                        </p>
                      )}
                    </div>

                    <div className={`h-px w-full my-6 ${currentReport.dataSource === 'EXCEL' ? 'bg-emerald-100/50' : 'bg-primary-100/50'}`}></div>


                    {currentType === 'daily' ? (
                      // Daily Report - Simple Flat Design - 7 Cards
                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                        {/* Card 1: Tổng số PTTT - Blue */}
                        <div className="bg-primary-700 rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{derivedStats.totalSurgeries}</p>
                            <p className="text-[10px] lg:text-xs font-medium text-primary-100 uppercase tracking-wide">Tổng số PTTT</p>
                          </div>
                          <Database className="h-6 w-6 lg:h-8 lg:w-8 text-primary-400/80 group-hover:scale-110 transition-transform" />
                        </div>

                        {/* Card 2: Tỷ lệ TT <100% - Purple */}
                        <div className="bg-purple-600 rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{derivedStats.lowPaymentCount || 0}</p>
                            <p className="text-[10px] lg:text-xs font-medium text-purple-100 uppercase tracking-wide">Tỷ lệ TT &lt;100%</p>
                          </div>
                          <Percent className="h-6 w-6 lg:h-8 lg:w-8 text-purple-400/80 group-hover:scale-110 transition-transform" />
                        </div>

                        {/* Card 3: Trùng nhân viên - Red (if > 0) */}
                        <div className={`${derivedStats.staffConflicts > 0 ? 'bg-red-600' : 'bg-emerald-600'} rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all`}>
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{derivedStats.staffConflicts}</p>
                            <p className={`text-[10px] lg:text-xs font-medium uppercase tracking-wide ${derivedStats.staffConflicts > 0 ? 'text-red-100' : 'text-emerald-100'}`}>Trùng nhân viên</p>
                          </div>
                          <Users className={`h-6 w-6 lg:h-8 lg:w-8 ${derivedStats.staffConflicts > 0 ? 'text-red-800/80' : 'text-emerald-800/60'} group-hover:scale-110 transition-transform`} />
                          {derivedStats.staffConflicts > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-ping"></div>}
                        </div>

                        {/* Card 4: Trùng máy - Orange (if > 0) */}
                        <div className={`${derivedStats.machineConflicts > 0 ? 'bg-orange-600' : 'bg-emerald-600'} rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all`}>
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{derivedStats.machineConflicts}</p>
                            <p className={`text-[10px] lg:text-xs font-medium uppercase tracking-wide ${derivedStats.machineConflicts > 0 ? 'text-orange-100' : 'text-emerald-100'}`}>Trùng máy</p>
                          </div>
                          <Zap className={`h-6 w-6 lg:h-8 lg:w-8 ${derivedStats.machineConflicts > 0 ? 'text-orange-800/60' : 'text-emerald-800/60'} group-hover:scale-110 transition-transform`} />
                          {derivedStats.machineConflicts > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-ping"></div>}
                        </div>

                        {/* Card 5: Thiếu mã máy - Amber (if > 0) */}
                        <div className={`${derivedStats.missingMachines > 0 ? 'bg-amber-600' : 'bg-teal-600'} rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all`}>
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{(currentReport.detailFile || currentReport.dataSource === 'STORAGE') ? derivedStats.missingMachines : '--'}</p>
                            <p className={`text-[10px] lg:text-xs font-medium uppercase tracking-wide ${derivedStats.missingMachines > 0 ? 'text-amber-100' : 'text-teal-100'}`}>Thiếu mã máy</p>
                          </div>
                          <AlertTriangle className={`h-6 w-6 lg:h-8 lg:w-8 ${derivedStats.missingMachines > 0 ? 'text-amber-800/60' : 'text-teal-800/60'} group-hover:scale-110 transition-transform`} />
                          {derivedStats.missingMachines > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-ping"></div>}
                        </div>

                        {/* Card 6: Chưa điền GV - Slate (if > 0) */}
                        <div className={`${derivedStats.missingAssistantCount > 0 ? 'bg-slate-600' : 'bg-emerald-600'} rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all`}>
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{derivedStats.missingAssistantCount}</p>
                            <p className={`text-[10px] lg:text-xs font-medium uppercase tracking-wide ${derivedStats.missingAssistantCount > 0 ? 'text-slate-100' : 'text-emerald-100'}`}>Chưa điền GV</p>
                          </div>
                          <UserMinus className={`h-6 w-6 lg:h-8 lg:w-8 ${derivedStats.missingAssistantCount > 0 ? 'text-slate-800/60' : 'text-emerald-800/60'} group-hover:scale-110 transition-transform`} />
                          {derivedStats.missingAssistantCount > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-ping"></div>}
                        </div>

                        {/* Card 7: Lỗi thời gian - Cyan (if > 0) */}
                        <div className={`${derivedStats.violateMinTimeCount > 0 ? 'bg-pink-600' : 'bg-cyan-600'} rounded-lg p-3 lg:p-4 flex items-center shadow-sm relative overflow-hidden group hover:shadow-md transition-all`}>
                          <div className="flex-1 z-10">
                            <p className="text-2xl lg:text-3xl font-bold text-white mb-1">{derivedStats.violateMinTimeCount}</p>
                            <p className={`text-[10px] lg:text-xs font-medium uppercase tracking-wide ${derivedStats.violateMinTimeCount > 0 ? 'text-pink-100' : 'text-cyan-100'}`}>Lỗi thời gian</p>
                          </div>
                          <Clock className={`h-6 w-6 lg:h-8 lg:w-8 ${derivedStats.violateMinTimeCount > 0 ? 'text-pink-800/60' : 'text-cyan-800/60'} group-hover:scale-110 transition-transform`} />
                          {derivedStats.violateMinTimeCount > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-ping"></div>}
                        </div>
                      </div>
                    ) : (
                      // Monthly Report - Existing Gradient Design - 7 Cards
                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                        {/* Card 1: Tổng số PTTT */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-primary-600 to-primary-700 p-3 lg:p-4 rounded-xl shadow-lg border-2 border-primary-500 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Database className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className="text-[10px] lg:text-xs font-semibold text-primary-100 uppercase tracking-wide">Tổng số PTTT</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{derivedStats.totalSurgeries}</p>
                            </div>
                          </div>
                        </div>

                        {/* Card 2: Tỷ lệ TT <100% */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-600 p-3 lg:p-4 rounded-xl shadow-lg border-2 border-purple-400 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Percent className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className="text-[10px] lg:text-xs font-semibold text-purple-100 uppercase tracking-wide">Tỷ lệ TT &lt;100%</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{derivedStats.lowPaymentCount || 0}</p>
                            </div>
                          </div>
                        </div>

                        {/* Card 3: Trùng nhân viên */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-red-500 to-red-600 p-3 lg:p-4 rounded-xl shadow-lg border-2 border-red-400 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          {derivedStats.staffConflicts > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Users className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className="text-[10px] lg:text-xs font-semibold text-red-100 uppercase tracking-wide">Trùng nhân viên</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{derivedStats.staffConflicts}</p>
                            </div>
                          </div>
                        </div>

                        {/* Card 4: Trùng máy */}
                        <div className={`relative overflow-hidden p-3 lg:p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.machineConflicts > 0
                          ? 'bg-gradient-to-br from-orange-500 to-orange-600 border-orange-400'
                          : 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400'
                          }`}>
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          {derivedStats.machineConflicts > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Zap className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className={`text-[10px] lg:text-xs font-semibold uppercase tracking-wide ${derivedStats.machineConflicts > 0 ? 'text-orange-100' : 'text-emerald-100'}`}>Trùng máy</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{derivedStats.machineConflicts}</p>
                            </div>
                          </div>
                        </div>

                        {/* Card 5: Thiếu mã máy */}
                        <div className={`relative overflow-hidden p-3 lg:p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.missingMachines > 0
                          ? 'bg-gradient-to-br from-amber-500 to-amber-600 border-amber-400'
                          : 'bg-gradient-to-br from-teal-500 to-teal-600 border-teal-400'
                          }`}>
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          {derivedStats.missingMachines > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><AlertTriangle className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className={`text-[10px] lg:text-xs font-semibold uppercase tracking-wide ${derivedStats.missingMachines > 0 ? 'text-amber-100' : 'text-teal-100'}`}>PTTT thiếu mã máy</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{(currentReport.detailFile || currentReport.dataSource === 'STORAGE') ? derivedStats.missingMachines : '--'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Card 6: Chưa điền GV - NEW */}
                        <div className={`relative overflow-hidden p-3 lg:p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.missingAssistantCount > 0
                          ? 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-400'
                          : 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400'
                          }`}>
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          {derivedStats.missingAssistantCount > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><UserMinus className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className={`text-[10px] lg:text-xs font-semibold uppercase tracking-wide ${derivedStats.missingAssistantCount > 0 ? 'text-slate-100' : 'text-emerald-100'}`}>Chưa điền GV</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{derivedStats.missingAssistantCount}</p>
                            </div>
                          </div>
                        </div>

                        {/* Card 7: Vi phạm thời gian tối thiểu */}
                        <div className={`relative overflow-hidden p-3 lg:p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.violateMinTimeCount > 0
                          ? 'bg-gradient-to-br from-pink-500 to-pink-600 border-pink-400'
                          : 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-400'
                          }`}>
                          <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                          {derivedStats.violateMinTimeCount > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                          <div className="flex items-center gap-3">
                            <div className="p-2 lg:p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Clock className="h-5 w-5 lg:h-6 lg:w-6" /></div>
                            <div>
                              <p className={`text-[10px] lg:text-xs font-semibold uppercase tracking-wide ${derivedStats.violateMinTimeCount > 0 ? 'text-pink-100' : 'text-cyan-100'}`}>Lỗi thời gian</p>
                              <p className="text-2xl lg:text-3xl font-bold text-white">{derivedStats.violateMinTimeCount}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>


                  <div className="flex justify-end mt-4 px-1">
                    <div className="flex gap-2 items-center">
                      {/* Print Dropdown */}
                      <div className="relative" ref={printDropdownRef}>
                        <button
                          onClick={() => setIsPrintDropdownOpen(!isPrintDropdownOpen)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary-700 text-white font-medium rounded-lg text-sm hover:bg-primary-800 transition-colors shadow-sm"
                        >
                          <Printer className="h-4 w-4" /> In Báo Cáo
                          <svg className="h-4 w-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isPrintDropdownOpen && (
                          <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 py-3 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                            <div className="px-4 pb-2 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
                              CHỌN BÁO CÁO VÀ HƯỚNG IN
                            </div>

                            <button
                              onClick={async () => {
                                await handlePrintClick('list', 'landscape');
                                setIsPrintDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-primary-50 flex items-center gap-4 transition-all group relative overflow-hidden"
                            >
                              <div className="p-2.5 rounded-xl bg-primary-50 text-primary-700 group-hover:bg-primary-100 group-hover:scale-110 transition-all border border-primary-100/50">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-[14px] text-gray-900 leading-tight mb-0.5">Danh sách PT</div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-primary-100 text-primary-800 text-[9px] font-bold rounded uppercase tracking-tighter">A4 Ngang</span>
                                  <span className="text-[10px] text-gray-400 italic font-medium">Khuyên dùng</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
                            </button>

                            <button
                              onClick={() => {
                                handlePrintClick('payment', 'portrait');
                                setIsPrintDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-emerald-50 flex items-center gap-4 transition-all group relative overflow-hidden mt-1"
                            >
                              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 group-hover:scale-110 transition-all border border-emerald-100/50">
                                <CreditCard className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-[14px] text-gray-900 leading-tight mb-0.5">Bảng thanh toán</div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded uppercase tracking-tighter">A4 Dọc</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                            </button>

                            <button
                              onClick={() => {
                                handlePrintClick('payment', 'landscape');
                                setIsPrintDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-emerald-50 flex items-center gap-4 transition-all group relative overflow-hidden mt-1"
                            >
                              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 group-hover:scale-110 transition-all border border-emerald-100/50">
                                <CreditCard className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-[14px] text-gray-900 leading-tight mb-0.5">Bảng thanh toán</div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded uppercase tracking-tighter">A4 Ngang</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                            </button>
                          </div>
                        )}
                      </div>
                      <button className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-800 font-medium rounded-lg text-sm hover:bg-primary-100 transition-colors border border-primary-200"><Sparkles className="h-4 w-4" /> AI Phân tích</button>
                      <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 bg-accent-600 text-white font-medium rounded-lg text-sm hover:bg-accent-700 transition-colors shadow-sm"><Download className="h-4 w-4" /> Tải Excel</button>
                      <button
                        onClick={handleSaveData}
                        disabled={isSaving || (currentReport.dataSource === 'STORAGE' && !currentReport.hasAutoFilledData)}
                        className={`flex items-center gap-2 px-3 py-1.5 bg-primary-700 text-white font-medium rounded-lg text-sm hover:bg-primary-800 transition-colors shadow-sm ${(isSaving || (currentReport.dataSource === 'STORAGE' && !currentReport.hasAutoFilledData)) ? 'opacity-70 cursor-not-allowed' : ''}`}
                        title={
                          currentReport.dataSource === 'STORAGE' && !currentReport.hasAutoFilledData
                            ? "Chức năng này chỉ khả dụng khi có dữ liệu mới hoặc cập nhật"
                            : "Lưu dữ liệu vào hệ thống"
                        }
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? 'Đang lưu...' : 'Lưu dữ liệu'}
                      </button>
                    </div>
                  </div>

                  {/* Modern Tab Switcher - Attached to content area */}
                  <div className="flex flex-col mt-6">
                    <div className={`flex px-4 pt-4 bg-gray-50 -mb-[2px] relative z-20 border-b-2 gap-2 ${currentReport.activeTable === 'list' ? 'border-b-primary-700' :
                      currentReport.activeTable === 'staff' ? 'border-b-red-600' :
                        currentReport.activeTable === 'machine' ? 'border-b-orange-600' :
                          currentReport.activeTable === 'missing' ? 'border-b-amber-600' :
                            'border-b-emerald-600'
                      }`}>
                      {/* Tab 1: DS Phẫu thuật */}
                      <button
                        onClick={() => setActiveTable('list')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg relative ${currentReport.activeTable === 'list'
                          ? 'bg-white text-primary-800 border-primary-700 z-30 shadow-sm -mb-[2px]'
                          : 'bg-transparent text-gray-400 border-transparent hover:text-primary-700'
                          }`}>
                        <ListChecks className={`h-4 w-4 ${currentReport.activeTable === 'list' ? 'text-primary-700' : ''}`} />
                        <span>DS Phẫu thuật</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${currentReport.activeTable === 'list' ? 'bg-primary-700 text-white' : 'bg-primary-100 text-primary-800'}`}>
                          {ptCount > 0 || ttCount > 0 ? `${ptCount} PT${ttCount > 0 ? ` ${ttCount} TT` : ''}` : '0'}
                        </span>
                      </button>

                      {/* Tab 2: Trùng giờ NV */}
                      <button
                        onClick={() => setActiveTable('staff')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg relative ${currentReport.activeTable === 'staff'
                          ? 'bg-white text-primary-800 border-primary-700 z-30 shadow-sm -mb-[2px]'
                          : 'bg-transparent text-gray-400 border-transparent hover:text-primary-700'
                          }`}>
                        <Users className={`h-4 w-4 ${currentReport.activeTable === 'staff' ? 'text-primary-700' : ''}`} />
                        <span>Trùng giờ NV</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${currentReport.activeTable === 'staff' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}>
                          {currentReport.stats.staffConflicts}
                        </span>
                      </button>

                      {/* Tab 3: Trùng máy */}
                      <button
                        onClick={() => setActiveTable('machine')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg relative ${currentReport.activeTable === 'machine'
                          ? 'bg-white text-primary-800 border-primary-700 z-30 shadow-sm -mb-[2px]'
                          : 'bg-transparent text-gray-400 border-transparent hover:text-primary-700'
                          }`}>
                        <Cpu className={`h-4 w-4 ${currentReport.activeTable === 'machine' ? 'text-primary-700' : ''}`} />
                        <span>Trùng máy</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${currentReport.activeTable === 'machine' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}>
                          {currentReport.stats.machineConflicts}
                        </span>
                      </button>

                      {/* Tab 4: Thiếu mã máy */}
                      <button
                        onClick={() => setActiveTable('missing')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg relative ${currentReport.activeTable === 'missing'
                          ? 'bg-white text-primary-800 border-primary-700 z-30 shadow-sm -mb-[2px]'
                          : 'bg-transparent text-gray-400 border-transparent hover:text-primary-700'
                          }`}>
                        <AlertTriangle className={`h-4 w-4 ${currentReport.activeTable === 'missing' ? 'text-primary-700' : ''}`} />
                        <span>Thiếu mã máy</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${currentReport.activeTable === 'missing' ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'}`}>
                          {(currentReport.detailFile || currentReport.dataSource === 'STORAGE') ? currentReport.stats.missingMachines : '--'}
                        </span>
                      </button>

                      {/* Tab 5: Bảng thanh toán */}
                      <button
                        onClick={() => setActiveTable('payment')}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all border-t-2 border-l-2 border-r-2 rounded-t-lg relative ${currentReport.activeTable === 'payment'
                          ? 'bg-white text-primary-800 border-primary-700 z-30 shadow-sm -mb-[2px]'
                          : 'bg-transparent text-gray-400 border-transparent hover:text-primary-700'
                          }`}>
                        <DollarSign className={`h-4 w-4 ${currentReport.activeTable === 'payment' ? 'text-primary-700' : ''}`} />
                        <span>Bảng thanh toán</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${currentReport.activeTable === 'payment' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                          {currentReport.result.paymentData?.rows?.length || 0}
                        </span>
                      </button>
                    </div>

                    <div className={`w-full animate-fade-in bg-white border-2 p-6 pb-12 rounded-b-xl relative z-10 ${currentReport.activeTable === 'list' ? 'border-primary-700' :
                      currentReport.activeTable === 'staff' ? 'border-red-600' :
                        currentReport.activeTable === 'machine' ? 'border-orange-600' :
                          currentReport.activeTable === 'missing' ? 'border-amber-600' :
                            'border-emerald-600'
                      }`}>
                      {(currentReport.listFile || currentReport.dataSource === 'STORAGE') && renderTableContent()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'config' && <ConfigurationTab onConfigUpdate={() => {
          if (dailyState.listFile) handleProcess('daily');
          if (monthlyState.listFile) handleProcess('monthly');
        }} />}
      </main>
    </div>
  );
}

const App: React.FC = () => (
  <ConfigProvider>
    <InnerApp />
  </ConfigProvider>
);

export default App;