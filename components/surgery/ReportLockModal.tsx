// ─── Report Lock Modal ────────────────────────────────────────────────────────
// Modal xác nhận khóa / mở khóa kỳ báo cáo
// Dành cho Trưởng khoa hoặc Quản trị viên

import React, { useState } from 'react';
import { Lock, Unlock, X, AlertTriangle, Shield, Building2, CheckCircle2 } from 'lucide-react';
import type { UserRole } from '../../types/auth';

interface ReportLockModalProps {
  isOpen: boolean;
  mode: 'lock' | 'unlock';
  periodLabel: string; // e.g. "Tháng 09/2026" hoặc "Ngày 13/09/2026"
  department?: string;
  departments?: string[];
  isAdmin: boolean;
  isHead: boolean;
  currentUserRole: UserRole;
  currentUserName: string;
  onClose: () => void;
  onConfirmLock: (note: string, selectedDept?: string) => Promise<void>;
  onConfirmUnlock: () => Promise<void>;
}

export const ReportLockModal: React.FC<ReportLockModalProps> = ({
  isOpen,
  mode,
  periodLabel,
  department = '',
  departments = [],
  isAdmin,
  isHead,
  currentUserRole,
  currentUserName,
  onClose,
  onConfirmLock,
  onConfirmUnlock,
}) => {
  const [note, setNote] = useState('');
  const [selectedDept, setSelectedDept] = useState(isAdmin ? 'ALL' : department || 'ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === 'lock') {
        await onConfirmLock(note, selectedDept);
      } else {
        await onConfirmUnlock();
      }
      onClose();
    } catch (err) {
      console.error('Error submitting lock/unlock:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-scale-up">
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            mode === 'lock' ? 'bg-amber-50/80 border-amber-200' : 'bg-emerald-50/80 border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                mode === 'lock' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {mode === 'lock' ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900">
                {mode === 'lock' ? `Khóa sổ Báo cáo ${periodLabel}` : `Mở khóa Báo cáo ${periodLabel}`}
              </h3>
              <p className="text-[11px] text-gray-500">
                {mode === 'lock' ? 'Chốt số liệu phụ cấp phẫu thuật/thủ thuật' : 'Cho phép chỉnh sửa dữ liệu'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {mode === 'lock' ? (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Lưu ý khi khóa sổ:</p>
                  <p className="mt-0.5 text-amber-800">
                    Toàn bộ nhân viên và khách sẽ chuyển sang chế độ <strong>Chỉ xem (Read-only)</strong>.
                    Các thao tác sửa đổi ca mổ, người giúp việc, xóa dòng hoặc lưu đè dữ liệu sẽ bị chặn để bảo toàn số liệu đã chốt.
                  </p>
                </div>
              </div>

              {/* Department scope (for Admin) */}
              {isAdmin && departments.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Phạm vi áp dụng:
                  </label>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="ALL">Toàn bộ bệnh viện (Tất cả khoa, phòng)</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        Khoa {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Scope for Head */}
              {isHead && !isAdmin && department && (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Phạm vi khóa: <strong>Khoa {department}</strong>
                  </span>
                </div>
              )}

              {/* Note / reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ghi chú chốt số liệu (tùy chọn):
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Đã chốt danh sách phụ cấp PTTT gửi phòng Tài chính Kế toán..."
                  rows={3}
                  className="w-full text-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-gray-800 resize-none"
                />
              </div>

              <div className="text-[11px] text-gray-400">
                Thực hiện bởi: <span className="font-semibold text-gray-700">{currentUserName}</span> ({currentUserRole === 'admin' ? 'Quản trị viên' : 'Trưởng khoa'})
              </div>
            </>
          ) : (
            /* Unlock mode */
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
                <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Xác nhận mở khóa báo cáo:</p>
                  <p className="mt-0.5 text-blue-800">
                    Sau khi mở khóa, các nhân viên trong phạm vi cho phép sẽ có thể chỉnh sửa lại ca mổ, người giúp việc và cập nhật lại số liệu.
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-600">
                Bạn có chắc chắn muốn mở khóa báo cáo <strong>{periodLabel}</strong> không?
              </p>
            </>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 border-t border-gray-100 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-60 ${
                mode === 'lock'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                <span>Đang xử lý...</span>
              ) : mode === 'lock' ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Xác nhận Khóa sổ</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Xác nhận Mở khóa</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
