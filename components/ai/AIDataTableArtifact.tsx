import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Table2,
} from 'lucide-react';
import { AIArtifact, AITableColumn } from '../../types/ai';
import { exportArtifactToExcel } from '../../services/ai/aiArtifactExportService';

interface AIDataTableArtifactProps {
  artifact: AIArtifact;
  compact?: boolean;
}

function formatCellValue(val: any, format?: AITableColumn['format']): string {
  if (val === null || val === undefined || val === '') return '—';
  if (format === 'currency' && typeof val === 'number') {
    return `${val.toLocaleString('vi-VN')} đ`;
  }
  if (format === 'number' && typeof val === 'number') {
    return val.toLocaleString('vi-VN');
  }
  if (format === 'percent' && typeof val === 'number') {
    return `${val.toFixed(1)}%`;
  }
  return String(val);
}

export const AIDataTableArtifact: React.FC<AIDataTableArtifactProps> = ({
  artifact,
  compact = false,
}) => {
  const tableConfig = artifact.tableConfig;
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = compact ? 8 : 12;

  const columns = tableConfig?.columns || [];
  const rawRows = tableConfig?.rows || [];

  const filteredAndSortedRows = useMemo(() => {
    let list = rawRows;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((row) =>
        columns.some((col) =>
          String(row[col.key] ?? '')
            .toLowerCase()
            .includes(q)
        )
      );
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortDir === 'asc' ? va - vb : vb - va;
        }
        return sortDir === 'asc'
          ? String(va ?? '').localeCompare(String(vb ?? ''), 'vi')
          : String(vb ?? '').localeCompare(String(va ?? ''), 'vi');
      });
    }
    return list;
  }, [rawRows, columns, searchTerm, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredAndSortedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  if (!tableConfig || columns.length === 0) return null;

  const handleSortClick = (colKey: string) => {
    if (sortCol === colKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colKey);
      setSortDir('desc');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      {/* Toolbar */}
      <div className="px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-sky-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800">
            Bảng dữ liệu ({filteredAndSortedRows.length} dòng)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Lọc nhanh trong bảng..."
              className="pl-8 pr-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-sky-500 outline-none w-44"
            />
          </div>

          <button
            type="button"
            onClick={() => exportArtifactToExcel(artifact)}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            title="Xuất bảng kết quả và dữ liệu chi tiết ra file Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSortClick(col.key)}
                  className={`px-3 py-2 font-bold whitespace-nowrap select-none cursor-pointer hover:bg-slate-200/60 transition-colors ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-flex items-center gap-1 ${
                      col.align === 'right' ? 'justify-end' : ''
                    }`}
                  >
                    <span>{col.label}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-slate-400 italic"
                >
                  Không có dòng dữ liệu nào khớp bộ lọc.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-sky-50/40 transition-colors text-slate-700"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2 ${
                        col.align === 'right'
                          ? 'text-right font-mono font-medium'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {formatCellValue(row[col.key], col.format)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            Trang <b>{currentPage}</b> / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
