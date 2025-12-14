import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { processSurgicalFiles } from "./services/excelProcessor";
import { ConfigurationTab } from './components/ConfigurationTab';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { analyzeReport } from './services/geminiService';
import { ProcessingResult, ProcessedStats, SurgeryRecord, StaffConflict, MachineConflict } from './types';
import { FileUpload } from './components/FileUpload';
import {
  Activity,
  AlertTriangle,
  Clock,
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
  FileSpreadsheet
} from 'lucide-react';
import { format, parse, isValid } from 'date-fns';

// --- Types & Interfaces ---

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
  const formats = ['dd/MM/yyyy', 'dd/MM/yyyy HH:mm', 'MM/dd/yyyy', 'yyyy-MM-dd'];
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
  rowCountLabel
}: DynamicTableProps<T>) => {
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({});
  const [isColDropdownOpen, setIsColDropdownOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const colDropdownRef = useRef<HTMLDivElement>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  useEffect(() => { setCurrentPage(1); }, [data]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const DATE_FORMATS = ['dd/mm/yyyy', 'dd/mm/yyyy hh:mm', 'dd/mm hh:mm', 'hh:mm'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col font-inter w-full">
      <div className="p-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4 text-indigo-600" />
          {tableName}
          <span className="text-[10px] font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{rowCountLabel || `${data.length} dòng`}</span>
        </h3>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden md:inline-block mr-2">Lựa chọn định dạng thời gian và chọn cột cần hiển thị</span>
          <div className="relative" ref={dateDropdownRef}>
            <button onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors shadow-sm min-w-[120px] justify-between">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {dateFormat}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {isDateDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded shadow-xl border border-gray-100 z-50 p-1">
                {DATE_FORMATS.map(fmt => (
                  <button key={fmt} onClick={() => { onDateFormatChange(fmt); setIsDateDropdownOpen(false); }} className={`w-full text-left px-3 py-2 text-xs rounded hover:bg-gray-50 ${fmt === dateFormat ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-700'}`}>{fmt}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={colDropdownRef}>
            <button onClick={() => setIsColDropdownOpen(!isColDropdownOpen)} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
              <Settings className="h-3 w-3" /> Cột <ChevronDown className="h-3 w-3" />
            </button>
            {isColDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded shadow-xl border border-gray-100 z-50 p-2 max-h-[300px] overflow-y-auto">
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2 px-2">Hiển thị cột</div>
                {columns.map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                    <input type="checkbox" checked={visibleCols[col.key] || false} onChange={() => toggleColumn(col.key)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3 w-3" />
                    <span className="text-xs text-gray-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto flex-1 p-0">
        <table className="w-full text-xs text-left text-gray-600">
          {customThead ? customThead : (
            <thead className="text-xs text-white uppercase bg-indigo-600 border-b sticky top-0 z-20">
              <tr>
                <th className="px-2 py-3 sticky left-0 bg-indigo-600 backdrop-blur z-10 w-[40px] border-r border-indigo-500 shadow-[1px_0_0_0_rgba(0,0,0,0.1)] text-center font-bold">#</th>
                {visibleColumnsList.map(col => (
                  <th key={col.key} className={`px-2 py-3 border-r border-indigo-500 min-w-[80px] font-bold whitespace-normal break-words align-middle ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.headerClassName || ''} ${col.width || 'max-w-[200px]'}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {extraHeaderRow}
            {currentData.map((row, idx) => {
              const customClass = rowStyle ? rowStyle(row) : '';
              return (
                <tr key={idx} className={`border-b hover:bg-indigo-100 transition-colors ${customClass ? customClass : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-100')}`}>
                  <td className={`px-2 py-1 text-center font-medium sticky left-0 z-10 border-r text-gray-900 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] ${customClass ? customClass : 'bg-inherit'}`}>
                    {startIndex + idx + 1}
                  </td>
                  {visibleColumnsList.map(col => (
                    <td key={col.key} className={`px-2 py-1 border-r whitespace-normal break-words align-top ${col.width || 'max-w-[200px]'} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.className || ''}`}>
                      {col.render ? col.render(row) : (row[col.key] || '-')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {extraFooterRow}
            {data.length === 0 && (
              <tr>
                <td colSpan={visibleColumnsList.length + 1} className="px-4 py-8 text-center text-gray-500 italic">Không có dữ liệu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.length > 0 && (
        <div className="p-2 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 rounded-b-xl text-xs">
          <div className="flex items-center gap-2 text-gray-600">
            <span>Hiển thị</span>
            <select value={rowsPerPage} onChange={(e) => { onRowsPerPageChange(Number(e.target.value)); setCurrentPage(1); }} className="bg-white border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
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
      )}
    </div>
  );
};

const InnerApp: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'config'>('dashboard');

  // Config Extraction
  const rowsPerPage = config.uiSettings?.rowsPerPage || 20;
  const dateFormat = config.uiSettings?.dateFormat || 'dd/mm/yyyy hh:mm';
  const visibleCols = config.uiSettings?.visibleColumns || {};

  const updateRowsPerPage = (n: number) => updateConfig({ uiSettings: { ...config.uiSettings, rowsPerPage: n } });
  const updateDateFormat = (f: string) => updateConfig({ uiSettings: { ...config.uiSettings, dateFormat: f } });
  const updateVisibleCols = (table: string, cols: Record<string, boolean>) => {
    updateConfig({ uiSettings: { ...config.uiSettings, visibleColumns: { ...config.uiSettings.visibleColumns, [table]: cols } } });
  };

  // State
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [stats, setStats] = useState<ProcessedStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [listFile, setListFile] = useState<File | null>(null);
  const [detailFile, setDetailFile] = useState<File | null>(null);
  const [activeTable, setActiveTable] = useState<'list' | 'staff' | 'machine' | 'missing' | 'payment' | null>(null);
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

  // State for date range from files
  const [listDateRange, setListDateRange] = useState<string>("");
  const [detailDateRange, setDetailDateRange] = useState<string>("");

  const handleListFileSelect = async (f: File | null) => {
    if (!f) { setListFile(null); setListDateRange(""); return; }
    if (!checkFile(f)) return;

    // Validate file format immediately
    const { validateListFile } = await import('./services/excelProcessor');
    const result = await validateListFile(f);

    if (!result.valid) {
      addToast(result.error || "File không hợp lệ", 'error');
      return;
    }

    setListFile(f);
    setListDateRange(result.dateRangeText || "");
    addToast(`✓ File "${f.name}" hợp lệ`, 'success');

    // Check if both files have matching date ranges
    if (detailDateRange && result.dateRangeText && detailDateRange !== result.dateRangeText) {
      addToast(`⚠ Thời gian của 2 file không khớp:\n- Danh sách PT: "${result.dateRangeText}"\n- Chi tiết PT: "${detailDateRange}"`, 'error');
    }
  };

  const handleDetailFileSelect = async (f: File | null) => {
    if (!f) { setDetailFile(null); setDetailDateRange(""); return; }
    if (!checkFile(f)) return;

    // Validate file format immediately
    const { validateDetailFile } = await import('./services/excelProcessor');
    const result = await validateDetailFile(f);

    if (!result.valid) {
      addToast(result.error || "File không hợp lệ", 'error');
      return;
    }

    setDetailFile(f);
    setDetailDateRange(result.dateRangeText || "");
    addToast(`✓ File "${f.name}" hợp lệ`, 'success');

    // Check if both files have matching date ranges
    if (listDateRange && result.dateRangeText && listDateRange !== result.dateRangeText) {
      addToast(`⚠ Thời gian của 2 file không khớp:\n- Danh sách PT: "${listDateRange}"\n- Chi tiết PT: "${result.dateRangeText}"`, 'error');
    }
  };

  const handleProcess = async () => {
    if (!listFile || !detailFile) { addToast("Vui lòng tải đủ 2 file Excel yêu cầu.", 'error'); return; }
    setIsProcessing(true); setActiveTable(null); setResult(null); setStats(null);
    try {
      const res = await processSurgicalFiles(listFile, detailFile, config);
      setStats(res.stats); setResult(res); addToast(res.message, 'success'); setActiveTable('list');
      setTimeout(() => { document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
    } catch (error: any) {
      console.error(error); addToast(error.message || "Có lỗi xử lý", 'error'); setStats(null); setResult(null);
    } finally { setIsProcessing(false); }
  };

  const handleDownload = () => {
    if (!result?.wb) { addToast("Chưa có file kết quả.", 'error'); return; }
    try {
      const filename = `Ket_qua_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(result.wb, filename); addToast("Đã tải xuống file Excel.", 'success');
    } catch (e: any) { console.error("Download failed:", e); addToast("Lỗi khi tải file: " + e.message, 'error'); }
  };

  // Columns
  // Calculate violateMinTimeCount dynamically based on current config
  const dynamicViolateMinTimeCount = useMemo(() => {
    if (!result?.validRecords) return 0;
    return result.validRecords.filter(r => {
      const minTime = config.timeRules[r.loaiPTTT]?.min;
      return minTime && r.timeMinutes < minTime;
    }).length;
  }, [result?.validRecords, config.timeRules]);

  // Combined stats from result and dynamic calculation
  const derivedStats = useMemo(() => {
    if (!result?.stats) return {
      totalSurgeries: 0,
      totalDurationMinutes: 0,
      staffConflicts: 0,
      machineConflicts: 0,
      missingMachines: 0,
      lowPaymentCount: 0,
      violateMinTimeCount: 0
    };

    return {
      ...result.stats,
      violateMinTimeCount: dynamicViolateMinTimeCount
    };
  }, [result?.stats, dynamicViolateMinTimeCount]);

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
    { key: 'machine', label: 'Mã máy', align: 'center', width: 'min-w-[200px]' },
    {
      key: 'reason', label: 'Lỗi thời gian',
      render: (r) => {
        const min = config.timeRules[r.loaiPTTT]?.min;
        if (min && r.timeMinutes < min) return <span className="font-bold">{`< ${min}p`}</span>;
        return null;
      },
      width: 'w-[100px]'
    }
  ], [config.timeRules, dateFormat]);

  // Separate columns definition for Missing Machines (stripping machine & reason)
  const columnsMissing = useMemo<ColumnDef<SurgeryRecord>[]>(() => columnsList.filter(c => c.key !== 'machine' && c.key !== 'reason'), [columnsList]);

  const columnsStaff = useMemo<ColumnDef<StaffConflict>[]>(() => [
    { key: 'staffName', label: 'Nhân viên', width: 'min-w-[150px]' },
    { key: 'role', label: 'Vai trò', width: 'w-[90px]' },

    // PATIENT 1 BLOCK (White/Default)
    { key: 'patientId1', label: 'Mã BN 1', width: 'w-[80px]' },
    { key: 'patientName1', label: 'Tên BN 1', width: 'min-w-[150px]' },
    { key: 'tenKT1', label: 'Tên KT 1', width: 'min-w-[200px]' },
    { key: 'ptPhu1', label: 'PT Phụ 1', render: (c) => c.rec1.ptPhu || '-', width: 'min-w-[100px]' },
    { key: 'tdc1', label: 'TDC 1', render: (c) => c.rec1.tdc || '-', width: 'min-w-[100px]' },
    { key: 'bsgm1', label: 'BS GM 1', render: (c) => c.rec1.bsGM || '-', width: 'min-w-[100px]' },
    { key: 'start1', label: 'BĐ 1', render: (c) => formatDate(c.start1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800' },
    { key: 'end1', label: 'KT 1', render: (c) => formatDate(c.end1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800' },

    // PATIENT 2 BLOCK (Highlighted - Blue, darker header)
    { key: 'start2', label: 'BĐ 2', render: (c) => formatDate(c.start2, dateFormat), width: 'w-[110px]', className: 'bg-blue-50 text-blue-800 font-semibold group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'end2', label: 'KT 2', render: (c) => formatDate(c.end2, dateFormat), width: 'w-[110px]', className: 'bg-blue-50 text-blue-800 font-semibold group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'patientId2', label: 'Mã BN 2', width: 'w-[80px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'patientName2', label: 'Tên BN 2', width: 'min-w-[180px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'tenKT2', label: 'Tên KT 2', width: 'min-w-[250px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'ptPhu2', label: 'PT Phụ 2', render: (c) => c.rec2.ptPhu || '-', width: 'min-w-[140px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'tdc2', label: 'TDC 2', render: (c) => c.rec2.tdc || '-', width: 'min-w-[140px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'bsgm2', label: 'BS GM 2', render: (c) => c.rec2.bsGM || '-', width: 'min-w-[140px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
  ], [dateFormat]);

  const columnsMachine = useMemo<ColumnDef<MachineConflict>[]>(() => [
    { key: 'machine', label: 'Mã máy', width: 'min-w-[200px]' },

    // PATIENT 1 BLOCK - Red text for time columns
    { key: 'patientId1', label: 'Mã BN 1', width: 'w-[80px]' },
    { key: 'patientName1', label: 'Tên BN 1', width: 'min-w-[150px]' },
    { key: 'tenKT1', label: 'Tên KT 1', width: 'min-w-[200px]' },
    { key: 'ptPhu1', label: 'PT Phụ 1', render: (c) => c.rec1.ptPhu || '-', width: 'min-w-[100px]' },
    { key: 'tdc1', label: 'TDC 1', render: (c) => c.rec1.tdc || '-', width: 'min-w-[100px]' },
    { key: 'bsgm1', label: 'BS GM 1', render: (c) => c.rec1.bsGM || '-', width: 'min-w-[100px]' },
    { key: 'start1', label: 'BĐ 1', render: (c) => formatDate(c.start1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800' },
    { key: 'end1', label: 'KT 1', render: (c) => formatDate(c.end1, dateFormat), width: 'w-[110px]', className: 'text-red-700 font-semibold', headerClassName: 'bg-red-100 text-red-800' },

    // PATIENT 2 BLOCK (Highlighted - Blue, darker header)
    { key: 'start2', label: 'BĐ 2', render: (c) => formatDate(c.start2, dateFormat), width: 'w-[110px]', className: 'bg-blue-50 text-blue-800 font-semibold group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'end2', label: 'KT 2', render: (c) => formatDate(c.end2, dateFormat), width: 'w-[110px]', className: 'bg-blue-50 text-blue-800 font-semibold group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'patientId2', label: 'Mã BN 2', width: 'w-[80px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'patientName2', label: 'Tên BN 2', width: 'min-w-[150px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'tenKT2', label: 'Tên KT 2', width: 'min-w-[200px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'ptPhu2', label: 'PT Phụ 2', render: (c) => c.rec2.ptPhu || '-', width: 'min-w-[100px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'tdc2', label: 'TDC 2', render: (c) => c.rec2.tdc || '-', width: 'min-w-[100px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
    { key: 'bsgm2', label: 'BS GM 2', render: (c) => c.rec2.bsGM || '-', width: 'min-w-[100px]', className: 'bg-blue-50 text-blue-900 group-hover:bg-blue-100', headerClassName: 'bg-blue-200 text-blue-900 font-bold' },
  ], [dateFormat]);

  const getPaymentColumns = (): ColumnDef<any>[] => {
    if (!result?.paymentData?.columns) return [];
    return [
      { key: 'name', label: 'Họ tên', width: 'min-w-[150px]' },
      ...result.paymentData.columns.map(col => ({
        key: `val_${col}`,
        label: col.replace("PT_", "").replace("TT_", "").replace("-", " "),
        render: (row: any) => (row.values[col] || 0) > 0 ? (row.values[col] || 0) : '-',
        align: 'right' as const,
        width: 'min-w-[80px]'
      })),
      { key: 'total_qty', label: 'Tổng số', align: 'center', width: 'min-w-[80px]' },
      { key: 'total_amount', label: 'Thành tiền', align: 'right', width: 'min-w-[120px]' }
    ];
  };

  const renderTableContent = () => {
    if (!result || !stats || !activeTable) return null;

    if (activeTable === 'list') {
      const rowStyle = (r: SurgeryRecord) => (config.timeRules[r.loaiPTTT]?.min && r.timeMinutes < config.timeRules[r.loaiPTTT].min) ? 'bg-yellow-50 text-red-600 font-medium' : '';
      const ptCount = result.validRecords.filter(r => r.loaiPTTT?.startsWith('P')).length;
      const ttCount = result.validRecords.filter(r => r.loaiPTTT?.startsWith('T')).length;
      const countLabel = `${ptCount} ca PT, ${ttCount} ca TT`;
      return <DynamicTable data={result.validRecords} columns={columnsList} tableName="Danh sách phẫu thuật" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['list']} onVisibleColsChange={(cols) => updateVisibleCols('list', cols)} rowStyle={rowStyle} rowCountLabel={countLabel} />;
    }
    if (activeTable === 'staff') {
      return <DynamicTable data={result.staffConflicts} columns={columnsStaff} tableName="Danh sách trùng giờ nhân viên" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['staff']} onVisibleColsChange={(cols) => updateVisibleCols('staff', cols)} />;
    }
    if (activeTable === 'machine') {
      return <DynamicTable data={result.machineConflicts} columns={columnsMachine} tableName="Danh sách trùng máy thực hiện" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['machine']} onVisibleColsChange={(cols) => updateVisibleCols('machine', cols)} />;
    }
    if (activeTable === 'missing') {
      return <DynamicTable data={result.missingRecords || []} columns={columnsMissing} tableName="Danh sách thiếu mã máy" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['missing']} onVisibleColsChange={(cols) => updateVisibleCols('missing', cols)} />;
    }
    if (activeTable === 'payment') {
      const rawRows = result.paymentData.rows;
      const cols = result.paymentData.columns; // Already filtered (non-zero totals only)

      // Build grouped header structure
      const GROUP_MAP: Record<string, string> = {
        "PĐB": "Phẫu thuật ĐB", "P1": "Phẫu thuật loại 1", "P2": "Phẫu thuật loại 2", "P3": "Phẫu thuật loại 3",
        "TĐB": "Thủ thuật ĐB", "T1": "Thủ thuật loại 1", "T2": "Thủ thuật loại 2", "T3": "Thủ thuật loại 3", "TKPL": "Thủ thuật KPL"
      };

      // Parse columns into groups
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

      const enrichedRows = rawRows.map(row => {
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
        return { ...row, total_qty: rowTotalQty, total_amount: rowTotalAmount.toLocaleString('en-US') };
      });

      const footerTotals: Record<string, number> = { total_qty: 0, total_amount_val: 0 };
      const columnTotals: Record<string, number> = {};
      enrichedRows.forEach(row => {
        footerTotals.total_qty += row.total_qty;
        footerTotals.total_amount_val += Number(row.total_amount.replace(/,/g, ''));
        Object.keys(row.values).forEach(colKey => {
          columnTotals[colKey] = (columnTotals[colKey] || 0) + (row.values[colKey] || 0);
        });
      });

      const paymentCols = getPaymentColumns();

      // Custom 2-level thead
      const CustomThead = (
        <thead className="text-xs text-gray-700 bg-gray-50 border-b">
          {/* Row 1: Group Headers */}
          <tr className="border-b">
            <th rowSpan={2} className="px-2 py-2 sticky left-0 bg-gray-50/95 backdrop-blur z-10 w-[40px] border-r shadow-[1px_0_0_0_rgba(0,0,0,0.05)] text-center align-middle">#</th>
            <th rowSpan={2} className="px-2 py-2 border-r min-w-[150px] font-semibold text-gray-600 bg-gray-50 align-middle text-center">Họ tên</th>
            {groups.map(grp => {
              // Color-code based on group type
              let bgColor = 'bg-gray-100';
              if (grp.name.startsWith('P')) {
                if (grp.name === 'PĐB') bgColor = 'bg-red-100';
                else if (grp.name === 'P1') bgColor = 'bg-orange-100';
                else if (grp.name === 'P2') bgColor = 'bg-yellow-100';
                else if (grp.name === 'P3') bgColor = 'bg-lime-100';
              } else if (grp.name.startsWith('T')) {
                if (grp.name === 'TĐB') bgColor = 'bg-cyan-100';
                else if (grp.name === 'T1') bgColor = 'bg-sky-100';
                else if (grp.name === 'T2') bgColor = 'bg-blue-100';
                else if (grp.name === 'T3') bgColor = 'bg-indigo-100';
                else if (grp.name === 'TKPL') bgColor = 'bg-purple-100';
              }
              return (
                <th key={grp.name} colSpan={grp.subCols.length} className={`px-2 py-2 border-r font-bold text-gray-800 ${bgColor} text-center`}>
                  {grp.label}
                </th>
              );
            })}
            <th rowSpan={2} className="px-2 py-2 border-r min-w-[80px] font-semibold text-gray-600 bg-gray-50 align-middle text-center">Tổng số</th>
            <th rowSpan={2} className="px-2 py-2 border-r min-w-[120px] font-semibold text-gray-600 bg-gray-50 align-middle text-right">Thành tiền</th>
          </tr>
          {/* Row 2: Sub-column Headers (Roles) */}
          <tr>
            {groups.flatMap(grp => grp.subCols.map(role => (
              <th key={`${grp.name}-${role}`} className="px-2 py-1 border-r font-medium text-gray-600 bg-gray-50 text-center text-[11px]">
                {role}
              </th>
            )))}
          </tr>
        </thead>
      );

      // Unit Price Row (moved to extraHeaderRow in tbody)
      const ExtraHeader = (
        <tr className="bg-indigo-50/30 font-medium text-xs text-indigo-800 border-b">
          <td className="px-2 py-1 border-r text-center bg-indigo-50 sticky left-0 z-10 font-bold"></td>
          <td className="px-2 py-1 border-r text-right font-bold">Đơn giá</td>
          {cols.map(col => {
            const [loai, role] = col.split('-');
            let configRole: any = "Giúp việc";
            if (role === "Chính") configRole = "Chính";
            else if (role === "Phụ") configRole = "Phụ";
            else if (role === "Giúp việc") configRole = "Giúp việc";
            const price = config.priceConfig[loai] ? (config.priceConfig[loai][configRole] || 0) : 0;
            return <td key={col} className="px-2 py-1 border-r text-right">{price.toLocaleString('en-US')}</td>
          })}
          <td className="px-2 py-1 border-r bg-gray-50"></td>
          <td className="px-2 py-1 border-r bg-gray-50"></td>
        </tr>
      );

      const ExtraFooter = (
        <tr className="bg-indigo-600/10 font-bold text-xs text-indigo-900 border-t-2 border-indigo-200">
          <td className="px-2 py-2 text-center sticky left-0 z-10 bg-indigo-50"></td>
          <td className="px-2 py-2 text-right">TỔNG CỘNG</td>
          {cols.map(col => (<td key={col} className="px-2 py-2 border-r text-right">{columnTotals[col] > 0 ? columnTotals[col] : '-'}</td>))}
          <td className="px-2 py-2 border-r text-center">{footerTotals.total_qty}</td>
          <td className="px-2 py-2 border-r text-right">{footerTotals.total_amount_val.toLocaleString('en-US')}</td>
        </tr>
      );

      return <DynamicTable data={enrichedRows} columns={paymentCols} tableName="Bảng Thanh toán phẫu thuật, thủ thuật" dateFormat={dateFormat} onDateFormatChange={updateDateFormat} rowsPerPage={rowsPerPage} onRowsPerPageChange={updateRowsPerPage} defaultVisibleCols={visibleCols['payment']} onVisibleColsChange={(cols) => updateVisibleCols('payment', cols)} extraHeaderRow={ExtraHeader} extraFooterRow={ExtraFooter} customThead={CustomThead} />;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-inter">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <header className="bg-white shadow-sm sticky top-0 z-30 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">Quản lý danh sách phẫu thuật, thủ thuật</h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-2">
              <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white border-2 border-indigo-700 shadow-indigo-200' : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'}`}>Tổng quan</button>
              <button onClick={() => setActiveTab('config')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${activeTab === 'config' ? 'bg-emerald-600 text-white border-2 border-emerald-700 shadow-emerald-200' : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50'}`}>Cấu hình</button>
            </nav>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in relative max-w-screen-2xl mx-auto">

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 relative overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-row items-center gap-4 p-4 bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg border-2 border-indigo-200 hover:border-indigo-300 transition-colors shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow">1</span>
                      <span className="font-bold text-indigo-900 text-sm truncate">Danh sách PT</span>
                    </div>
                    <p className="text-indigo-700 text-[10px] ml-8">Báo cáo &rarr; BC Cận lâm sàng &rarr; 10. Danh sách PT</p>
                  </div>
                  <div className="w-[100px] h-[70px] bg-white rounded-lg shadow-sm border-2 border-dashed border-indigo-300">
                    <FileUpload label="" file={listFile} onFileSelect={handleListFileSelect} accept=".xlsx, .xls" compact={true} />
                  </div>
                </div>

                <div className="flex flex-row items-center gap-4 p-4 bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-lg border-2 border-emerald-200 hover:border-emerald-300 transition-colors shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-emerald-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow">2</span>
                      <span className="font-bold text-emerald-900 text-sm truncate">Chi tiết theo khoa</span>
                    </div>
                    <p className="text-emerald-700 text-[10px] ml-8">Báo cáo &rarr; BC CLS &rarr; Chi tiết PT theo khoa</p>
                  </div>
                  <div className="w-[100px] h-[70px] bg-white rounded-lg shadow-sm border-2 border-dashed border-emerald-300">
                    <FileUpload label="" file={detailFile} onFileSelect={handleDetailFileSelect} accept=".xlsx, .xls" compact={true} />
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-4">
                <button onClick={handleProcess} disabled={isProcessing || !listFile || !detailFile} className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm shadow transition-all active:scale-95 ${isProcessing || !listFile || !detailFile ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200'}`}>
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current" />} {isProcessing ? 'Đang xử lý...' : 'Tiến hành xử lý'}
                </button>
              </div>
            </div>

            {stats && result && (
              <div id="results-section" className="space-y-6 animate-fade-in bg-gradient-to-b from-indigo-50/50 to-white rounded-xl p-6 border border-indigo-100 shadow-sm mt-6">

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-gray-900">Kết quả xử lý</h2>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 font-medium rounded text-sm hover:bg-indigo-100 transition-colors border border-indigo-200"><Sparkles className="h-4 w-4" /> AI Phân tích</button>
                    <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white font-medium rounded text-sm hover:bg-green-700 transition-colors shadow-sm"><Download className="h-4 w-4" /> Tải Excel</button>
                  </div>
                </div>

                {result.dateRangeText && (
                  <p className="text-lg font-bold text-blue-800 text-center">
                    {result.dateRangeText}
                  </p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  {/* Card 1: Tổng số PTTT */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 rounded-xl shadow-lg border-2 border-indigo-400 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Database className="h-6 w-6" /></div>
                      <div>
                        <p className="text-xs font-semibold text-indigo-100 uppercase tracking-wide">Tổng số PTTT</p>
                        <p className="text-3xl font-bold text-white">{derivedStats.totalSurgeries}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Tỷ lệ TT <100% */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-purple-600 p-4 rounded-xl shadow-lg border-2 border-purple-400 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Percent className="h-6 w-6" /></div>
                      <div>
                        <p className="text-xs font-semibold text-purple-100 uppercase tracking-wide">Tỷ lệ TT &lt;100%</p>
                        <p className="text-3xl font-bold text-white">{derivedStats.lowPaymentCount || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Trùng nhân viên - Always alert style */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-red-500 to-red-600 p-4 rounded-xl shadow-lg border-2 border-red-400 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    {derivedStats.staffConflicts > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Users className="h-6 w-6" /></div>
                      <div>
                        <p className="text-xs font-semibold text-red-100 uppercase tracking-wide">Trùng nhân viên</p>
                        <p className="text-3xl font-bold text-white">{derivedStats.staffConflicts}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Trùng máy */}
                  <div className={`relative overflow-hidden p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.machineConflicts > 0
                    ? 'bg-gradient-to-br from-orange-500 to-orange-600 border-orange-400'
                    : 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400'
                    }`}>
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    {derivedStats.machineConflicts > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Zap className="h-6 w-6" /></div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${derivedStats.machineConflicts > 0 ? 'text-orange-100' : 'text-emerald-100'}`}>Trùng máy</p>
                        <p className="text-3xl font-bold text-white">{derivedStats.machineConflicts}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Thiếu mã máy */}
                  <div className={`relative overflow-hidden p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.missingMachines > 0
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 border-amber-400'
                    : 'bg-gradient-to-br from-teal-500 to-teal-600 border-teal-400'
                    }`}>
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    {derivedStats.missingMachines > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><AlertTriangle className="h-6 w-6" /></div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${derivedStats.missingMachines > 0 ? 'text-amber-100' : 'text-teal-100'}`}>PTTT thiếu mã máy</p>
                        <p className="text-3xl font-bold text-white">{derivedStats.missingMachines}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card 6: Vi phạm thời gian tối thiểu */}
                  <div className={`relative overflow-hidden p-4 rounded-xl shadow-lg border-2 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-default group ${derivedStats.violateMinTimeCount > 0
                    ? 'bg-gradient-to-br from-pink-500 to-pink-600 border-pink-400'
                    : 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-400'
                    }`}>
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    {derivedStats.violateMinTimeCount > 0 && <div className="absolute top-2 right-2 w-3 h-3 bg-white rounded-full animate-ping"></div>}
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 text-white rounded-xl backdrop-blur-sm"><Clock className="h-6 w-6" /></div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${derivedStats.violateMinTimeCount > 0 ? 'text-pink-100' : 'text-cyan-100'}`}>Lỗi thời gian</p>
                        <p className="text-3xl font-bold text-white">{derivedStats.violateMinTimeCount}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modern Tab Switcher - Segment Control Style */}
                <div className="relative bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 p-2 rounded-2xl shadow-inner border border-gray-200">
                  <div className="flex flex-wrap justify-center gap-1">
                    {/* Tab 1: DS Phẫu thuật */}
                    <button
                      onClick={() => setActiveTable('list')}
                      className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTable === 'list'
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-300 scale-105 z-10'
                        : 'bg-white/80 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md border border-transparent hover:border-indigo-200'
                        }`}
                    >
                      <div className={`p-1.5 rounded-lg ${activeTable === 'list' ? 'bg-white/20' : 'bg-indigo-100'}`}>
                        <ListChecks className="h-4 w-4" />
                      </div>
                      <span>DS Phẫu thuật</span>
                      {activeTable === 'list' && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                    </button>

                    {/* Tab 2: Trùng giờ NV */}
                    <button
                      onClick={() => setActiveTable('staff')}
                      className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTable === 'staff'
                        ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-300 scale-105 z-10'
                        : 'bg-white/80 text-gray-600 hover:bg-red-50 hover:text-red-700 hover:shadow-md border border-transparent hover:border-red-200'
                        }`}
                    >
                      <div className={`p-1.5 rounded-lg ${activeTable === 'staff' ? 'bg-white/20' : 'bg-red-100'}`}>
                        <Users className="h-4 w-4" />
                      </div>
                      <span>Trùng giờ NV</span>
                      {stats.staffConflicts > 0 && (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${activeTable === 'staff' ? 'bg-white/30 text-white' : 'bg-red-600 text-white animate-pulse'
                          }`}>{stats.staffConflicts}</span>
                      )}
                      {activeTable === 'staff' && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                    </button>

                    {/* Tab 3: Trùng máy */}
                    <button
                      onClick={() => setActiveTable('machine')}
                      className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTable === 'machine'
                        ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg shadow-orange-300 scale-105 z-10'
                        : 'bg-white/80 text-gray-600 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md border border-transparent hover:border-orange-200'
                        }`}
                    >
                      <div className={`p-1.5 rounded-lg ${activeTable === 'machine' ? 'bg-white/20' : 'bg-orange-100'}`}>
                        <Zap className="h-4 w-4" />
                      </div>
                      <span>Trùng máy</span>
                      {stats.machineConflicts > 0 && (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${activeTable === 'machine' ? 'bg-white/30 text-white' : 'bg-orange-600 text-white animate-pulse'
                          }`}>{stats.machineConflicts}</span>
                      )}
                      {activeTable === 'machine' && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                    </button>

                    {/* Tab 4: Thiếu mã máy */}
                    <button
                      onClick={() => setActiveTable('missing')}
                      className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTable === 'missing'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-300 scale-105 z-10'
                        : 'bg-white/80 text-gray-600 hover:bg-amber-50 hover:text-amber-700 hover:shadow-md border border-transparent hover:border-amber-200'
                        }`}
                    >
                      <div className={`p-1.5 rounded-lg ${activeTable === 'missing' ? 'bg-white/20' : 'bg-amber-100'}`}>
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <span>Thiếu mã máy</span>
                      {stats.missingMachines > 0 && (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${activeTable === 'missing' ? 'bg-white/30 text-white' : 'bg-amber-600 text-white animate-pulse'
                          }`}>{stats.missingMachines}</span>
                      )}
                      {activeTable === 'missing' && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                    </button>

                    {/* Tab 5: Bảng thanh toán */}
                    <button
                      onClick={() => setActiveTable('payment')}
                      className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${activeTable === 'payment'
                        ? 'bg-gradient-to-r from-emerald-600 to-green-500 text-white shadow-lg shadow-emerald-300 scale-105 z-10'
                        : 'bg-white/80 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-md border border-transparent hover:border-emerald-200'
                        }`}
                    >
                      <div className={`p-1.5 rounded-lg ${activeTable === 'payment' ? 'bg-white/20' : 'bg-emerald-100'}`}>
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <span>Bảng thanh toán</span>
                      {activeTable === 'payment' && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/10 to-transparent pointer-events-none"></div>}
                    </button>
                  </div>
                </div>

                <div className="animate-fade-in pb-12">
                  {renderTableContent()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'config' && <ConfigurationTab />}
      </main>
    </div>
  );
}

const App: React.FC = () => (
  <ConfigProvider><InnerApp /></ConfigProvider>
);

export default App;