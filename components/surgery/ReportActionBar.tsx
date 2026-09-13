import React, { useState, useRef, useEffect } from 'react';
import { Printer, Download, FileText, FileSpreadsheet, CreditCard, Save, Loader2, Lock, Unlock, History } from 'lucide-react';

export interface ReportActionBarProps {
  dateRangeText?: string;
  activeTable?: string;
  onPrint: (type: 'list' | 'payment', orientation: 'portrait' | 'landscape') => void;
  onOvertimePrint?: () => void;
  onDownloadExcel: () => void;
  onDownloadFormattedExcel: () => void;
  onSaveData: () => void;
  isSaving: boolean;
  canSave: boolean;
  saveTooltip?: string;
  // Report Lock Props
  isReportLocked?: boolean;
  canManageLock?: boolean;
  onLockClick?: () => void;
  onUnlockClick?: () => void;
  // Audit Log Props
  onOpenAuditLog?: () => void;
  auditLogCount?: number;
  // Staging Grid Props
  onOpenStaging?: () => void;
  stagingIssueCount?: number;
}

export const ReportActionBar: React.FC<ReportActionBarProps> = ({
  dateRangeText,
  activeTable,
  onPrint,
  onOvertimePrint,
  onDownloadExcel,
  onDownloadFormattedExcel,
  onSaveData,
  isSaving,
  canSave,
  saveTooltip,
  isReportLocked = false,
  canManageLock = false,
  onLockClick,
  onUnlockClick,
  onOpenAuditLog,
  auditLogCount,
  onOpenStaging,
  stagingIssueCount,
}) => {
  const [isPrintDropdownOpen, setIsPrintDropdownOpen] = useState(false);
  const [isExcelDropdownOpen, setIsExcelDropdownOpen] = useState(false);

  const printDropdownRef = useRef<HTMLDivElement>(null);
  const excelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (printDropdownRef.current && !printDropdownRef.current.contains(target)) {
        setIsPrintDropdownOpen(false);
      }
      if (excelDropdownRef.current && !excelDropdownRef.current.contains(target)) {
        setIsExcelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center justify-between gap-2 px-4 mt-1.5">
      {/* Date range text (left) */}
      <p className="text-xs text-gray-500 font-medium">
        {dateRangeText || ''}
      </p>

      {/* Action buttons (right) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Print Dropdown */}
        <div className="relative" ref={printDropdownRef}>
          <button
            onClick={() => setIsPrintDropdownOpen(!isPrintDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-700 text-white font-semibold rounded-lg text-[11px] hover:bg-primary-800 transition-colors shadow-sm cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" /> In
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isPrintDropdownOpen && (
            <div className="fb-dropdown top-full right-0 mt-1 w-52 z-30">
              {activeTable === 'overtime' && onOvertimePrint && (
                <>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onOvertimePrint();
                    }}
                    className="fb-dropdown-item font-semibold text-primary-700 cursor-pointer"
                  >
                    <FileText className="text-primary-600" />
                    <span>Giấy báo ngoài giờ</span>
                  </button>
                  <div className="fb-dropdown-divider" />
                </>
              )}
              <button
                onClick={() => {
                  setIsPrintDropdownOpen(false);
                  onPrint('list', 'landscape');
                }}
                className="fb-dropdown-item cursor-pointer"
              >
                <FileText />
                <span>Danh sách PT — A4 ngang</span>
              </button>
              <div className="fb-dropdown-divider" />
              <button
                onClick={() => {
                  setIsPrintDropdownOpen(false);
                  onPrint('payment', 'portrait');
                }}
                className="fb-dropdown-item cursor-pointer"
              >
                <CreditCard />
                <span>Thanh toán — A4 dọc</span>
              </button>
              <button
                onClick={() => {
                  setIsPrintDropdownOpen(false);
                  onPrint('payment', 'landscape');
                }}
                className="fb-dropdown-item cursor-pointer"
              >
                <CreditCard />
                <span>Thanh toán — A4 ngang</span>
              </button>
            </div>
          )}
        </div>

        {/* Excel Download Dropdown */}
        <div className="relative" ref={excelDropdownRef}>
          <button
            onClick={() => setIsExcelDropdownOpen(!isExcelDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-600 text-white font-semibold rounded-lg text-[11px] hover:bg-accent-700 transition-colors shadow-sm cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" /> Excel
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isExcelDropdownOpen && (
            <div className="fb-dropdown top-full right-0 mt-1 w-48 z-30">
              <button
                onClick={() => {
                  setIsExcelDropdownOpen(false);
                  onDownloadExcel();
                }}
                className="fb-dropdown-item cursor-pointer"
              >
                <FileSpreadsheet />
                <span>Không định dạng</span>
              </button>
              <div className="fb-dropdown-divider" />
              <button
                onClick={() => {
                  setIsExcelDropdownOpen(false);
                  onDownloadFormattedExcel();
                }}
                className="fb-dropdown-item cursor-pointer"
              >
                <FileText />
                <span>Có định dạng</span>
              </button>
            </div>
          )}
        </div>

        {/* Audit Log History Button */}
        {onOpenAuditLog && (
          <button
            type="button"
            onClick={onOpenAuditLog}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-semibold rounded-lg text-[11px] border border-gray-300 transition-colors shadow-2xs cursor-pointer"
            title="Xem nhật ký truy vết & kiểm toán số liệu kỳ này"
          >
            <History className="h-3.5 w-3.5 text-gray-600" />
            <span>Nhật ký</span>
            {auditLogCount !== undefined && auditLogCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold border border-blue-200">
                {auditLogCount}
              </span>
            )}
          </button>
        )}

        {/* Smart Staging & Validation Button */}
        {onOpenStaging && (
          <button
            type="button"
            onClick={onOpenStaging}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-semibold rounded-lg text-[11px] border border-gray-300 transition-colors shadow-2xs cursor-pointer"
            title="Mở bảng đối soát & chuẩn hóa dữ liệu lâm sàng"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
            <span>Đối soát</span>
            {stagingIssueCount !== undefined && stagingIssueCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold border border-rose-200">
                {stagingIssueCount}
              </span>
            )}
          </button>
        )}

        {/* Report Lock Status & Actions */}
        {isReportLocked ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-300 shadow-2xs"
              title="Báo cáo đã được khóa sổ, dữ liệu chỉ xem"
            >
              <Lock className="h-3 w-3 text-amber-600" />
              <span>Đã khóa</span>
            </span>
            {canManageLock && onUnlockClick && (
              <button
                type="button"
                onClick={onUnlockClick}
                className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] transition-colors shadow-xs cursor-pointer"
                title="Mở khóa báo cáo để chỉnh sửa số liệu"
              >
                <Unlock className="h-3 w-3" />
                <span>Mở khóa</span>
              </button>
            )}
          </div>
        ) : (
          canManageLock && onLockClick && (
            <button
              type="button"
              onClick={onLockClick}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors shadow-xs cursor-pointer"
              title="Chốt số liệu và khóa báo cáo kỳ này"
            >
              <Lock className="h-3 w-3" />
              <span>Khóa sổ</span>
            </button>
          )
        )}

        {/* Save Data */}
        <button
          onClick={onSaveData}
          disabled={!canSave || isReportLocked}
          className={`flex items-center gap-1.5 px-2.5 py-1 bg-primary-700 text-white font-semibold rounded-lg text-[11px] hover:bg-primary-800 transition-colors shadow-sm ${
            !canSave || isReportLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
          }`}
          title={
            isReportLocked
              ? 'Báo cáo đã khóa sổ — Toàn bộ số liệu đang ở chế độ Chỉ xem (Read-only)'
              : saveTooltip || 'Lưu dữ liệu vào hệ thống'
          }
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isReportLocked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {isSaving ? 'Lưu...' : isReportLocked ? 'Đã khóa' : 'Lưu'}
        </button>
      </div>
    </div>
  );
};
