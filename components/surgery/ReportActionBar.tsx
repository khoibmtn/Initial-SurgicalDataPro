import React, { useState, useRef, useEffect } from 'react';
import { Printer, Download, FileText, FileSpreadsheet, CreditCard, Save, Loader2, Lock, Unlock, History } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

export interface ReportActionBarProps {
  dateRangeText?: string;
  activeTable?: string;
  onPrint: (type: 'list' | 'payment' | 'packagePayment', orientation: 'portrait' | 'landscape') => void;
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
  paymentSubTab?: 'pttt' | 'package';
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
  paymentSubTab,
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
          <Tooltip content="In báo cáo danh sách PT, bảng thanh toán hoặc giấy báo ngoài giờ (chọn định dạng A4 dọc/ngang)" position="bottom">
            <button
              onClick={() => setIsPrintDropdownOpen(!isPrintDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-700 text-white font-semibold rounded-lg text-[11px] hover:bg-primary-800 transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" /> In
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </Tooltip>

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
              {activeTable === 'payment' && paymentSubTab === 'package' ? (
                <>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('packagePayment', 'portrait');
                    }}
                    className="fb-dropdown-item font-semibold text-emerald-700 cursor-pointer"
                  >
                    <CreditCard className="text-emerald-600" />
                    <span>TT Gói DV — A4 dọc</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('packagePayment', 'landscape');
                    }}
                    className="fb-dropdown-item font-semibold text-emerald-700 cursor-pointer"
                  >
                    <CreditCard className="text-emerald-600" />
                    <span>TT Gói DV — A4 ngang</span>
                  </button>
                  <div className="fb-dropdown-divider" />
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('payment', 'portrait');
                    }}
                    className="fb-dropdown-item cursor-pointer text-gray-500"
                  >
                    <CreditCard />
                    <span>Phụ cấp PTTT — A4 dọc</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('payment', 'landscape');
                    }}
                    className="fb-dropdown-item cursor-pointer text-gray-500"
                  >
                    <CreditCard />
                    <span>Phụ cấp PTTT — A4 ngang</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('payment', 'portrait');
                    }}
                    className="fb-dropdown-item cursor-pointer"
                  >
                    <CreditCard />
                    <span>Thanh toán PTTT — A4 dọc</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('payment', 'landscape');
                    }}
                    className="fb-dropdown-item cursor-pointer"
                  >
                    <CreditCard />
                    <span>Thanh toán PTTT — A4 ngang</span>
                  </button>
                  <div className="fb-dropdown-divider" />
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('packagePayment', 'portrait');
                    }}
                    className="fb-dropdown-item cursor-pointer"
                  >
                    <CreditCard />
                    <span>TT Gói DV — A4 dọc</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsPrintDropdownOpen(false);
                      onPrint('packagePayment', 'landscape');
                    }}
                    className="fb-dropdown-item cursor-pointer"
                  >
                    <CreditCard />
                    <span>TT Gói DV — A4 ngang</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Excel Download Dropdown */}
        <div className="relative" ref={excelDropdownRef}>
          <Tooltip content="Tải xuống file Excel (có thể chọn định dạng hoặc không định dạng)" position="bottom">
            <button
              onClick={() => setIsExcelDropdownOpen(!isExcelDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-600 text-white font-semibold rounded-lg text-[11px] hover:bg-accent-700 transition-colors shadow-sm cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Excel
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </Tooltip>
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
          <Tooltip content="Xem nhật ký truy vết và kiểm toán toàn bộ thao tác trên báo cáo kỳ này" position="bottom">
            <button
              type="button"
              onClick={onOpenAuditLog}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 font-semibold rounded-lg text-[11px] border border-gray-300 transition-colors shadow-2xs cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-gray-600" />
              <span>Nhật ký</span>
              {auditLogCount !== undefined && auditLogCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold border border-blue-200">
                  {auditLogCount}
                </span>
              )}
            </button>
          </Tooltip>
        )}

        {/* Smart Staging & Validation Button (Tạm thời ẩn theo yêu cầu) */}
        {/* {onOpenStaging && (
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
        )} */}

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
              <Tooltip content="Mở khóa báo cáo để cho phép chỉnh sửa số liệu" position="bottom">
                <button
                  type="button"
                  onClick={onUnlockClick}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] transition-colors shadow-xs cursor-pointer"
                >
                  <Unlock className="h-3 w-3" />
                  <span>Mở khóa</span>
                </button>
              </Tooltip>
            )}
          </div>
        ) : (
          canManageLock && onLockClick && (
            <Tooltip content="Chốt số liệu và khóa báo cáo kỳ này — sau khi khóa chỉ Admin/Trưởng khoa mới được mở khóa" position="bottom">
              <button
                type="button"
                onClick={onLockClick}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors shadow-xs cursor-pointer"
              >
                <Lock className="h-3 w-3" />
                <span>Khóa sổ</span>
              </button>
            </Tooltip>
          )
        )}

        {/* Save Data */}
        <Tooltip content={
          isReportLocked
            ? 'Báo cáo đã khóa sổ — toàn bộ số liệu ở chế độ Chỉ xem (Read-only)'
            : 'Lưu toàn bộ dữ liệu báo cáo (danh sách PT, thanh toán, ngoài giờ) vào CSDL Lưu trữ'
        } position="bottom">
          <button
            onClick={onSaveData}
            disabled={!canSave || isReportLocked}
            className={`flex items-center gap-1.5 px-2.5 py-1 bg-primary-700 text-white font-semibold rounded-lg text-[11px] hover:bg-primary-800 transition-colors shadow-sm ${
              !canSave || isReportLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            }`}
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
        </Tooltip>
      </div>
    </div>
  );
};
