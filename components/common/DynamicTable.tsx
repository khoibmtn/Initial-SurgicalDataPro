import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  ListChecks,
  Eye,
  EyeOff,
  Clock,
  Rows3,
  Minimize2,
  Maximize2,
  RotateCcw,
  X,
  Save,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { PageCombobox } from './PageCombobox';

// --- Column Definition Interface ---
export interface ColumnDef<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  defaultWidth?: number; // Default width in px for table-layout:fixed
  className?: string; // For cell styling (bg color, etc)
  headerClassName?: string; // For header styling
  defaultHidden?: boolean; // If true, column is hidden by default until user toggles it
}

// --- Table Density Types & Config ---
export type TableDensity = 'compact' | 'default' | 'relaxed';

export const DENSITY_CONFIG: Record<TableDensity, { cellPy: string; fontSize: string; rowHeight: number }> = {
  compact: { cellPy: 'py-0.5', fontSize: 'text-[10px]', rowHeight: 28 },
  default: { cellPy: 'py-1', fontSize: 'text-xs', rowHeight: 36 },
  relaxed: { cellPy: 'py-2', fontSize: 'text-sm', rowHeight: 44 },
};

// --- TableBody: Renders tbody with paginated rows ---
export interface TableBodyProps {
  data: any[];
  currentData: any[];
  extraHeaderRow?: React.ReactNode;
  extraFooterRow?: React.ReactNode;
  customTfoot?: React.ReactNode;
  startIndex: number;
  visibleColumnsList: ColumnDef<any>[];
  enableSelection?: boolean;
  selectedIds: string[];
  onSelect?: (id: string, selected: boolean) => void;
  onRowDoubleClick?: (row: any) => void;
  rowStyle?: (item: any) => string;
  customRowRender?: (row: any, index: number, allRows: any[]) => React.ReactNode;
  density: { cellPy: string; fontSize: string; rowHeight: number };
}

export const TableBody = ({
  data,
  currentData,
  extraHeaderRow,
  extraFooterRow,
  customTfoot,
  startIndex,
  visibleColumnsList,
  enableSelection,
  selectedIds,
  onSelect,
  onRowDoubleClick,
  rowStyle,
  customRowRender,
  density,
}: TableBodyProps) => {
  const renderRow = (row: any, idx: number, globalIndex: number, allRows: any[]) => {
    if (customRowRender) return customRowRender(row, globalIndex, allRows);

    const customClass = rowStyle ? rowStyle(row) : '';
    const isFirstRowOverall = globalIndex === 0;
    const deptBorderClass = row.isNewDept && !isFirstRowOverall ? 'border-t-2 border-t-primary-700' : '';

    return (
      <tr
        key={`${row.key || row.id || 'row'}_${globalIndex}_${row.patientId || ''}`}
        className={`border-b border-gray-200 group hover:bg-primary-100 transition-colors ${onRowDoubleClick ? 'cursor-pointer' : ''} ${customClass ? customClass : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')} ${enableSelection && (selectedIds.includes(row.key) || (row.id && selectedIds.includes(row.id))) ? '!bg-primary-200' : ''}`}
        onClick={() => {
          if (enableSelection && onSelect) {
            const rId = row.key || row.id;
            if (rId) onSelect(rId, !selectedIds.includes(rId));
          }
        }}
        onDoubleClick={(e) => {
          if (onRowDoubleClick) {
            e.stopPropagation();
            onRowDoubleClick(row);
          }
        }}
      >
        {enableSelection && (
          <td className={`px-2 ${density.cellPy} border-r text-center align-top sticky left-0 bg-inherit z-10 w-[40px]`}>
            <input
              type="checkbox"
              checked={selectedIds.includes(row.key) || (!!row.id && selectedIds.includes(row.id))}
              onChange={() => { }}
              className="rounded border-gray-300 text-primary-700 focus:ring-primary-500 h-4 w-4 cursor-pointer mt-1"
            />
          </td>
        )}
        {visibleColumnsList.map(col => (
          <td key={col.key} className={`px-2 ${density.cellPy} border-r whitespace-normal break-words align-top ${deptBorderClass} ${col.width || 'max-w-[200px]'} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}>
            {col.key === 'stt' ? (globalIndex + 1) : (col.render ? col.render(row) : (row[col.key] || '-'))}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <tbody>
      {extraHeaderRow}
      {currentData.map((row: any, idx) => renderRow(row, idx, startIndex + idx, currentData))}
      {extraFooterRow}
      {customTfoot}
      {data.length === 0 && (
        <tr>
          <td colSpan={visibleColumnsList.length} className="px-4 py-8 text-center text-gray-500 italic">Không có dữ liệu.</td>
        </tr>
      )}
    </tbody>
  );
};

export interface DynamicTableProps<T> {
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
  rowCountLabel?: string;
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
  onEditRecord?: () => void;
  onRowDoubleClick?: (row: T) => void;
}

export const DynamicTable = <T extends Record<string, any>>({
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
  customRowRender,
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
  onEditRecord,
  onRowDoubleClick,
  currentPage: externalPage,
  onPageChange: externalOnPageChange,
}: DynamicTableProps<T>) => {
  const { config } = useConfig();
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({});
  const [isConfigDropdownOpen, setIsConfigDropdownOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const configDropdownRef = useRef<HTMLDivElement>(null);

  // Table density — persisted globally
  const [tableDensity, setTableDensity] = useState<TableDensity>(() => {
    return (localStorage.getItem('table_density') as TableDensity) || 'default';
  });
  const density = DENSITY_CONFIG[tableDensity];

  const handleDensityChange = (d: TableDensity) => {
    setTableDensity(d);
    localStorage.setItem('table_density', d);
  };

  // Column resize state — load from localStorage
  const storageKey = `col_widths_${tableName.replace(/\s+/g, '_')}`;
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const resizingCol = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [internalPage, setInternalPage] = useState(1);
  const currentPage = externalPage !== undefined ? externalPage : internalPage;

  const setCurrentPage = (page: number) => {
    if (externalOnPageChange) externalOnPageChange(page);
    else setInternalPage(page);
  };

  // --- Autocomplete State ---
  const [assistantInput, setAssistantInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filter Staff List for "Phụ" position
  const assistantOptions = useMemo(() => {
    const validRoles = ["Phụ", "GV", "TDC", "KTV GM", "KTV", "Tit DC", "Tít DC"];
    return (config.staffList || []).filter(s =>
      validRoles.includes(s.position) ||
      s.position === "Phụ" ||
      s.name.includes("(Phụ)")
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
    setTimeout(() => {
      if (selectedIds.length === 0) return;

      const exactMatch = assistantOptions.find(s => s.name === assistantInput);
      if (!exactMatch && assistantInput !== "") {
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
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [selectedIds]);

  // Handle Input Changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAssistantInput(e.target.value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown') setShowSuggestions(true);
      if (e.key === 'Enter') {
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
        setAssistantInput(filteredSuggestions[selectedIndex].name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else if (filteredSuggestions.length === 1) {
        setAssistantInput(filteredSuggestions[0].name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else if (filteredSuggestions.length > 1) {
        setAssistantInput(filteredSuggestions[0].name);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      } else {
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
      columns.forEach(c => initial[c.key] = !c.defaultHidden);
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

  const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const currentData = data.slice(startIndex, startIndex + rowsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

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

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Column resize handlers — with localStorage persistence
  const handleResizeStart = (e: React.MouseEvent, colKey: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = { key: colKey, startX: e.clientX, startW: currentWidth || 120 };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = ev.clientX - resizingCol.current.startX;
      const newWidth = Math.max(50, resizingCol.current.startW + delta);
      setColumnWidths(prev => ({ ...prev, [resizingCol.current!.key]: newWidth }));
    };

    const handleMouseUp = () => {
      setColumnWidths(prev => {
        try { localStorage.setItem(storageKey, JSON.stringify(prev)); } catch {}
        return prev;
      });
      resizingCol.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const resetColumnWidths = () => {
    setColumnWidths({});
    try { localStorage.removeItem(storageKey); } catch {}
  };

  const DATE_FORMATS = ['dd/mm/yyyy', 'dd/mm/yyyy hh:mm', 'dd/mm hh:mm', 'hh:mm'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col font-inter w-full">
      <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
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
              className="fb-dropdown left-0 top-full mt-2 w-48 overflow-visible"
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              {/* 1. Searchable columns */}
              {showSearchSettings && onSearchableColsChange && (
                <div
                  className="relative"
                  onMouseEnter={() => setActiveSubmenu('search')}
                >
                  <div className="fb-dropdown-item" style={{ justifyContent: 'space-between' }}>
                    <div className="flex items-center gap-2">
                      <Search className="h-3.5 w-3.5" />
                      <span>Cột tìm kiếm</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-gray-300" />
                  </div>
                  {activeSubmenu === 'search' && (
                    <div className="fb-dropdown left-[95%] top-0 -ml-1 w-64 p-2 max-h-[400px] overflow-y-auto">
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
                <div className="fb-dropdown-item" style={{ justifyContent: 'space-between' }}>
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-3.5 w-3.5" />
                    <span>Ẩn/hiện cột</span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </div>
                {activeSubmenu === 'col' && (
                  <div className="fb-dropdown left-[95%] top-0 -ml-1 w-56 p-2 max-h-[400px] overflow-y-auto">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2 border-b pb-1.5 flex justify-between items-center">
                      <span>Cấu hình hiển thị</span>
                      <ListChecks className="h-2.5 w-2.5" />
                    </div>
                    <div className="flex gap-1 px-2 mb-2">
                      <button
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          columns.forEach(c => all[c.key] = true);
                          setVisibleCols(all);
                          if (onVisibleColsChange) onVisibleColsChange(all);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                      >
                        <Eye className="h-3 w-3" /> Tất cả
                      </button>
                      <button
                        onClick={() => {
                          const none: Record<string, boolean> = {};
                          columns.forEach(c => none[c.key] = c.key === 'stt');
                          setVisibleCols(none);
                          if (onVisibleColsChange) onVisibleColsChange(none);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        <EyeOff className="h-3 w-3" /> Ẩn hết
                      </button>
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
                <div className="fb-dropdown-item" style={{ justifyContent: 'space-between' }}>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Định dạng thời gian</span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </div>
                {activeSubmenu === 'date' && (
                  <div className="fb-dropdown left-[95%] top-0 -ml-1 w-48 p-1">
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

              {/* 4. Table Density */}
              <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu('density')}
              >
                <div className="fb-dropdown-item" style={{ justifyContent: 'space-between' }}>
                  <div className="flex items-center gap-2">
                    <Rows3 className="h-3.5 w-3.5" />
                    <span>Mật độ bảng</span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                </div>
                {activeSubmenu === 'density' && (
                  <div className="fb-dropdown left-[95%] top-0 -ml-1 w-44 p-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-2 py-1.5 border-b flex justify-between items-center">
                      <span>Mật độ hiển thị</span>
                      <Rows3 className="h-2.5 w-2.5" />
                    </div>
                    <div className="p-1 space-y-0.5">
                      {([['compact', 'Chặt', Minimize2], ['default', 'Mặc định', Rows3], ['relaxed', 'Rộng', Maximize2]] as const).map(([key, label, Icon]) => (
                        <button
                          key={key}
                          onClick={() => { handleDensityChange(key); setIsConfigDropdownOpen(false); setActiveSubmenu(null); }}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-primary-50 transition-all font-medium flex items-center gap-2 ${tableDensity === key ? 'bg-primary-50 text-primary-700' : 'text-gray-600'}`}
                        >
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Reset Column Widths */}
              {Object.keys(columnWidths).length > 0 && (
                <button
                  onClick={() => { resetColumnWidths(); setIsConfigDropdownOpen(false); }}
                  className="fb-dropdown-item"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Đặt lại kích thước cột</span>
                </button>
              )}
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

                {showSuggestions && selectedIds.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    {filteredSuggestions.length > 0 ? (
                      <ul className="py-1">
                        {filteredSuggestions.map((staff, idx) => (
                          <li
                            key={staff.id || staff.name}
                            className={`px-3 py-2 cursor-pointer text-xs flex flex-col border-b border-gray-50 last:border-0 transition-colors ${idx === selectedIndex ? 'bg-primary-100 text-primary-900' : 'hover:bg-primary-50 text-gray-700'}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
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
              {onEditRecord && (
                <button
                  onClick={onEditRecord}
                  disabled={!selectedIds || selectedIds.length === 0}
                  className={`p-1.5 border rounded-lg shadow-sm transition-colors active:scale-95 ${selectedIds && selectedIds.length > 0
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                  }`}
                  title={selectedIds && selectedIds.length > 0 ? "Sửa toàn bộ thông tin bản ghi (dòng đang chọn)" : "Chọn dòng để sửa"}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
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

      <div
        className="overflow-x-auto flex-1 p-0"
        ref={(el) => { (tableRef as any).current = el; (scrollContainerRef as any).current = el; }}
      >
        <table className={`w-full ${density.fontSize} text-left text-gray-600`} style={{ tableLayout: customThead ? undefined : 'fixed' }}>
          {!customThead && (
            <colgroup>
              {enableSelection && <col style={{ width: 40 }} />}
              {visibleColumnsList.map(col => (
                <col key={col.key} style={{ width: columnWidths[col.key] || col.defaultWidth || undefined }} />
              ))}
            </colgroup>
          )}
          {customThead ? customThead : (
            <thead className="text-xs text-white bg-primary-700 border-b sticky top-0 z-20">
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
                          const allVisibleSelected = data.length > 0 && data.every(r => selectedIds.includes(r.key || '') || selectedIds.includes(r.id || ''));
                          onSelectAll(!allVisibleSelected);
                        }}
                        className="rounded border-primary-500 text-primary-700 focus:ring-primary-500 h-4 w-4 cursor-pointer align-middle bg-white"
                        title="Chọn tất cả"
                      />
                    )}
                  </th>
                )}
                {visibleColumnsList.map(col => {
                  const w = columnWidths[col.key];
                  return (
                    <th
                      key={col.key}
                      className={`px-2 py-3 border-r border-primary-600 font-bold whitespace-normal break-words align-middle relative group/th ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.headerClassName || ''}`}
                      style={w ? { width: w, minWidth: w, maxWidth: w } : undefined}
                    >
                      {col.label}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:!opacity-100 bg-white/30 transition-opacity z-10"
                        onMouseDown={(e) => {
                          const th = e.currentTarget.parentElement;
                          handleResizeStart(e, col.key, th?.getBoundingClientRect().width || 120);
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}
          <TableBody
            data={data}
            currentData={currentData}
            extraHeaderRow={extraHeaderRow}
            extraFooterRow={extraFooterRow}
            customTfoot={customTfoot}
            startIndex={startIndex}
            visibleColumnsList={visibleColumnsList}
            enableSelection={enableSelection}
            selectedIds={selectedIds}
            onSelect={onSelect}
            onRowDoubleClick={onRowDoubleClick}
            rowStyle={rowStyle}
            customRowRender={customRowRender}
            density={density}
          />
        </table>
      </div>

      {/* Footer: Pagination */}
      {data.length > 0 && (
        <div className="p-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 rounded-b-xl text-xs">
          <div className="flex items-center gap-2 text-gray-600">
            <span>Hiển thị</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                if (onRowsPerPageChange) onRowsPerPageChange(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-gray-300 rounded-md px-3 pr-8 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[70px] relative z-50"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="hidden sm:inline-block ml-2 text-gray-400">| {startIndex + 1}-{Math.min(startIndex + rowsPerPage, data.length)} / {data.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 cursor-pointer"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <PageCombobox currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} size="sm" />
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 cursor-pointer"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicTable;
