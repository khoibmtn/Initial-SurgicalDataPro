// ─── Excel Staging Preview & Smart Validation Modal ───────────────────────────
// Màn hình đối soát, phát hiện lỗi lâm sàng và chỉnh sửa trực tiếp trước khi nạp vào CSDL

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wand2,
  Search,
  Check,
  X,
  Edit2,
  Trash2,
  RotateCcw,
  Clock,
  User,
  Activity,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  Info,
} from 'lucide-react';
import type { SurgeryRecord, SurgeryConfig } from '../../types';
import type { StagingRecord, StagingStatus, StagingSummary } from '../../types/staging';
import {
  VALID_SURGERY_TYPES,
  revalidateStagingRecord,
  computeStagingSummary,
  applyAutoFixes,
} from '../../services/stagingValidationService';

interface ExcelStagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  initialRecords: StagingRecord[];
  config?: SurgeryConfig;
  onConfirmImport: (cleanRecords: SurgeryRecord[]) => void;
}

type FilterTab = 'all' | 'error' | 'warning' | 'valid';

export const ExcelStagingModal: React.FC<ExcelStagingModalProps> = ({
  isOpen,
  onClose,
  fileName,
  initialRecords,
  config,
  onConfirmImport,
}) => {
  const [records, setRecords] = useState<StagingRecord[]>(initialRecords);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SurgeryRecord>>({});

  // Reset when initialRecords change
  React.useEffect(() => {
    setRecords(initialRecords);
    setEditingRowId(null);
  }, [initialRecords]);

  const summary = useMemo(() => computeStagingSummary(records), [records]);

  // Filter & Search records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Excluded filter: if activeFilter is not all, excluded rows can be shown or hidden
      if (activeFilter === 'error' && (r._isExcluded || r._status !== 'error')) return false;
      if (activeFilter === 'warning' && (r._isExcluded || r._status !== 'warning')) return false;
      if (activeFilter === 'valid' && (r._isExcluded || r._status !== 'valid')) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const patientId = String(r.patientId || '').toLowerCase();
      const patientName = String(r.patientName || '').toLowerCase();
      const tenKT = String(r.tenKT || '').toLowerCase();
      const ptChinh = String(r.ptChinh || '').toLowerCase();

      return (
        patientId.includes(q) ||
        patientName.includes(q) ||
        tenKT.includes(q) ||
        ptChinh.includes(q)
      );
    });
  }, [records, activeFilter, searchQuery]);

  // Start inline editing
  const startEditing = (record: StagingRecord) => {
    setEditingRowId(record._stagingId);
    setEditForm({
      patientId: record.patientId,
      patientName: record.patientName,
      ngayBD: record.ngayBD,
      ngayKT: record.ngayKT,
      tenKT: record.tenKT,
      loaiPTTT: record.loaiPTTT,
      ptChinh: record.ptChinh,
      bsGM: record.bsGM,
      ktvGM: record.ktvGM,
      gv: record.gv,
    });
  };

  // Save inline editing
  const saveInlineEdit = (stagingId: string) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r._stagingId !== stagingId) return r;
        const updated: StagingRecord = {
          ...r,
          ...editForm,
        };
        return revalidateStagingRecord(updated, prev, config);
      })
    );
    setEditingRowId(null);
  };

  // Cancel inline editing
  const cancelInlineEdit = () => {
    setEditingRowId(null);
    setEditForm({});
  };

  // Toggle exclude row
  const toggleExcludeRow = (stagingId: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r._stagingId === stagingId ? { ...r, _isExcluded: !r._isExcluded } : r
      )
    );
  };

  // Exclude all rows with errors
  const handleExcludeAllErrors = () => {
    setRecords((prev) =>
      prev.map((r) =>
        r._status === 'error' ? { ...r, _isExcluded: true } : r
      )
    );
  };

  // Auto-fix basic issues
  const handleAutoFix = () => {
    const { updated, fixedCount } = applyAutoFixes(records, config);
    setRecords(updated);
  };

  // Confirm import clean records
  const handleConfirm = () => {
    // Only import records that are not excluded
    const cleanRecords: SurgeryRecord[] = records
      .filter((r) => !r._isExcluded)
      .map((r) => {
        const { _stagingId, _issues, _status, _isExcluded, _isModified, ...base } = r;
        return base;
      });

    onConfirmImport(cleanRecords);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[96vw] xl:max-w-[1440px] h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        {/* 1. Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-2xs shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 truncate">
                  Đối soát & Chuẩn hóa dữ liệu Excel (Staging Grid)
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                  {fileName}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                Kiểm tra tính toàn vẹn lâm sàng, định dạng giờ và phân loại trước khi nạp vào hệ thống
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Metric Cards Banner */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-slate-500">Tổng số ca</span>
              <p className="text-lg font-bold text-slate-900">{summary.total}</p>
            </div>
            <Activity className="w-5 h-5 text-slate-400" />
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-emerald-700">Hợp lệ</span>
              <p className="text-lg font-bold text-emerald-800">{summary.validCount}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-amber-700">Cần lưu ý</span>
              <p className="text-lg font-bold text-amber-800">{summary.warningCount}</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>

          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-rose-700">Lỗi nghiêm trọng</span>
              <p className="text-lg font-bold text-rose-800">{summary.errorCount}</p>
            </div>
            <XCircle className="w-5 h-5 text-rose-500" />
          </div>

          <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-gray-500">Đã loại trừ</span>
              <p className="text-lg font-bold text-gray-700">{summary.excludedCount}</p>
            </div>
            <Trash2 className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* 3. Toolbar: Search, Filters & Actions */}
        <div className="px-6 py-2.5 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Tabs filter */}
          <div className="flex items-center gap-1 bg-gray-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tất cả ({summary.total})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('error')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'error'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-700 hover:bg-rose-100'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              Lỗi ({summary.errorCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('warning')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'warning'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Cảnh báo ({summary.warningCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('valid')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'valid'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Hợp lệ ({summary.validCount})
            </button>
          </div>

          {/* Quick Actions & Search */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="relative w-48 sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm Mã BN, Tên, PTV..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handleAutoFix}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
              title="Chuẩn hóa loại PTTT và làm sạch chuỗi văn bản"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Tự động chuẩn hóa</span>
            </button>

            {summary.errorCount > 0 && (
              <button
                type="button"
                onClick={handleExcludeAllErrors}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer"
                title="Tạm bỏ qua tất cả ca có lỗi nghiêm trọng để import các ca hợp lệ"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bỏ qua các dòng lỗi</span>
              </button>
            )}
          </div>
        </div>

        {/* 4. Main Staging Table */}
        <div className="flex-1 overflow-auto bg-gray-50">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10 text-gray-700 font-semibold shadow-xs">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center border-b border-gray-200">STT</th>
                <th className="py-2.5 px-3 w-28 text-center border-b border-gray-200">Trạng thái</th>
                <th className="py-2.5 px-3 w-24 border-b border-gray-200">Mã BN</th>
                <th className="py-2.5 px-3 w-40 border-b border-gray-200">Họ và tên</th>
                <th className="py-2.5 px-3 min-w-[200px] border-b border-gray-200">Tên kỹ thuật PTTT</th>
                <th className="py-2.5 px-3 w-24 border-b border-gray-200">Loại PTTT</th>
                <th className="py-2.5 px-3 w-36 border-b border-gray-200">Bắt đầu</th>
                <th className="py-2.5 px-3 w-36 border-b border-gray-200">Kết thúc</th>
                <th className="py-2.5 px-3 w-20 text-center border-b border-gray-200">Thời lượng</th>
                <th className="py-2.5 px-3 w-36 border-b border-gray-200">PTV Chính</th>
                <th className="py-2.5 px-3 w-32 border-b border-gray-200">Kíp gây mê</th>
                <th className="py-2.5 px-3 w-24 text-center border-b border-gray-200">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-gray-400">
                    <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Không tìm thấy ca mổ nào phù hợp bộ lọc</p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record, index) => {
                  const isEditing = editingRowId === record._stagingId;
                  const isExcluded = record._isExcluded;

                  // Row background style based on status
                  let rowBg = 'hover:bg-gray-50/80';
                  if (isExcluded) {
                    rowBg = 'bg-gray-100/60 opacity-60 line-through';
                  } else if (record._status === 'error') {
                    rowBg = 'bg-rose-50/40 hover:bg-rose-50/70';
                  } else if (record._status === 'warning') {
                    rowBg = 'bg-amber-50/30 hover:bg-amber-50/60';
                  }

                  return (
                    <tr key={record._stagingId} className={`transition-colors ${rowBg}`}>
                      {/* STT */}
                      <td className="py-2.5 px-3 text-center text-gray-500 font-mono">
                        {record.stt || index + 1}
                      </td>

                      {/* Trạng thái & Issues Badge */}
                      <td className="py-2.5 px-3 text-center">
                        {isExcluded ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                            Loại bỏ
                          </span>
                        ) : record._status === 'error' ? (
                          <div className="group relative inline-block">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 cursor-help">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Lỗi ({record._issues.filter((i) => i.severity === 'error').length})
                            </span>
                            {/* Tooltip */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block z-20 w-64 p-2 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl text-left leading-tight pointer-events-none">
                              <p className="font-bold text-rose-300 mb-1">Chi tiết lỗi:</p>
                              <ul className="list-disc pl-3 space-y-0.5">
                                {record._issues.map((issue, idx) => (
                                  <li
                                    key={idx}
                                    className={issue.severity === 'error' ? 'text-rose-200' : 'text-amber-200'}
                                  >
                                    <strong>{issue.fieldLabel}:</strong> {issue.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : record._status === 'warning' ? (
                          <div className="group relative inline-block">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 cursor-help">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Lưu ý ({record._issues.length})
                            </span>
                            {/* Tooltip */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block z-20 w-64 p-2 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl text-left leading-tight pointer-events-none">
                              <p className="font-bold text-amber-300 mb-1">Cảnh báo:</p>
                              <ul className="list-disc pl-3 space-y-0.5">
                                {record._issues.map((issue, idx) => (
                                  <li key={idx} className="text-amber-200">
                                    <strong>{issue.fieldLabel}:</strong> {issue.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Hợp lệ
                          </span>
                        )}
                      </td>

                      {/* Mã BN */}
                      <td className="py-2.5 px-3 font-mono font-medium text-gray-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.patientId || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, patientId: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          record.patientId || <span className="text-rose-500 italic">Thiếu</span>
                        )}
                      </td>

                      {/* Họ và tên */}
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.patientName || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, patientName: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          record.patientName || <span className="text-rose-500 italic">Thiếu tên</span>
                        )}
                      </td>

                      {/* Tên kỹ thuật */}
                      <td className="py-2.5 px-3 text-gray-800 max-w-[240px] truncate" title={record.tenKT}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.tenKT || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, tenKT: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          record.tenKT
                        )}
                      </td>

                      {/* Loại PTTT */}
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <select
                            value={editForm.loaiPTTT || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, loaiPTTT: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">Chọn loại</option>
                            {VALID_SURGERY_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                              record.loaiPTTT
                                ? 'bg-slate-100 text-slate-800 border border-slate-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {record.loaiPTTT || 'Chưa phân loại'}
                          </span>
                        )}
                      </td>

                      {/* Bắt đầu */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700">
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="dd/mm/yyyy hh:mm"
                            value={editForm.ngayBD || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, ngayBD: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          record.ngayBD || '-'
                        )}
                      </td>

                      {/* Kết thúc */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-700">
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="dd/mm/yyyy hh:mm"
                            value={editForm.ngayKT || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, ngayKT: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          record.ngayKT || '-'
                        )}
                      </td>

                      {/* Thời lượng */}
                      <td className="py-2.5 px-3 text-center font-bold">
                        <span
                          className={
                            record.timeMinutes <= 0
                              ? 'text-rose-600'
                              : record.timeMinutes < 10 || record.timeMinutes > 480
                              ? 'text-amber-600'
                              : 'text-gray-800'
                          }
                        >
                          {record.timeMinutes > 0 ? `${record.timeMinutes}p` : `${record.timeMinutes}p (Lỗi)`}
                        </span>
                      </td>

                      {/* PTV Chính */}
                      <td className="py-2.5 px-3 font-medium text-gray-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.ptChinh || ''}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, ptChinh: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          record.ptChinh || <span className="text-rose-500 italic">Thiếu PTV</span>
                        )}
                      </td>

                      {/* Kíp gây mê */}
                      <td className="py-2.5 px-3 text-[11px] text-gray-600 truncate" title={`${record.bsGM || ''} / ${record.ktvGM || ''}`}>
                        {record.bsGM || record.ktvGM ? (
                          <span>
                            {record.bsGM} {record.ktvGM ? `(${record.ktvGM})` : ''}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Không</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => saveInlineEdit(record._stagingId)}
                                className="p-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors cursor-pointer"
                                title="Lưu thay đổi"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelInlineEdit}
                                className="p-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
                                title="Hủy sửa"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditing(record)}
                                disabled={isExcluded}
                                className="p-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                                title="Chỉnh sửa dòng"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleExcludeRow(record._stagingId)}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                  isExcluded
                                    ? 'text-blue-600 hover:bg-blue-50'
                                    : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                                }`}
                                title={isExcluded ? 'Phục hồi dòng này' : 'Loại bỏ khỏi danh sách import'}
                              >
                                {isExcluded ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {summary.errorCount > 0 ? (
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  Còn <strong>{summary.errorCount}</strong> ca mổ bị lỗi nghiêm trọng. Bạn cần bấm sửa hoặc bấm "Bỏ qua các dòng lỗi" để tiếp tục.
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Dữ liệu đã sẵn sàng! Có <strong>{summary.validCount + summary.warningCount}</strong> ca mổ sẽ được nạp vào hệ thống.
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Hủy bỏ
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={summary.errorCount > 0 || summary.validCount + summary.warningCount === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Xác nhận Nhập Dữ Liệu ({summary.validCount + summary.warningCount} ca)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
