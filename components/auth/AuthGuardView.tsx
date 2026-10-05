import React from 'react';
import {
  ShieldAlert,
  Clock,
  LogIn,
  UserPlus,
  RefreshCw,
  LogOut,
  Lock,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { openAuthModal } from '../../utils/authGuidance';

export interface AuthGuardViewProps {
  /** Tên tính năng hoặc phân hệ (ví dụ: 'Thống kê phẫu thuật', 'Cấu hình hệ thống') */
  featureName?: string;
  /** Mô tả chi tiết bổ sung */
  description?: string;
  /** Biểu tượng tùy biến */
  icon?: React.ElementType;
  /** Cho phép quay lại tab Minh Lộ nếu đang ở phân hệ báo cáo */
  onSwitchToLocalExcel?: () => void;
}

export const AuthGuardView: React.FC<AuthGuardViewProps> = ({
  featureName,
  description,
  icon: CustomIcon,
  onSwitchToLocalExcel,
}) => {
  const { isAuthenticated, isPendingApproval, user, logout } = useAuth();

  // Nếu người dùng đã đăng nhập và hoạt động bình thường thì không chặn
  if (isAuthenticated) {
    return null;
  }

  // Trường hợp tài khoản đã đăng nhập nhưng đang chờ duyệt
  if (isPendingApproval) {
    return (
      <div className="w-full flex-1 flex items-center justify-center p-6 min-h-[420px] animate-fade-in">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-amber-200/80 p-6 text-center">
          <div className="mx-auto w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mb-4 shadow-xs">
            <Clock className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Tài khoản đang chờ duyệt
          </div>

          <h3 className="text-base font-bold text-gray-900 mb-2">
            {featureName ? `${featureName} — ` : ''}Chờ phê duyệt tài khoản
          </h3>

          <p className="text-xs text-gray-600 leading-relaxed mb-5">
            Tài khoản <strong className="text-gray-900">{user?.displayName || user?.nickname || 'nhân viên'}</strong> đã được đăng ký thành công nhưng chưa được kích hoạt quyền truy cập Firestore. Vui lòng liên hệ <strong className="text-amber-800">Quản trị viên</strong> hoặc <strong className="text-amber-800">Lãnh đạo khoa</strong> để được duyệt.
          </p>

          <div className="flex items-center justify-center gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Kiểm tra lại</span>
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đổi tài khoản</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Trường hợp chưa đăng nhập (Chế độ Khách)
  const IconComponent = CustomIcon || ShieldAlert;

  return (
    <div className="w-full flex-1 flex items-center justify-center p-6 min-h-[440px] animate-fade-in">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-gray-200/90 p-6 sm:p-8 text-center relative overflow-hidden">
        {/* Subtle accent bar on top */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-600 via-primary-500 to-sky-500" />

        {/* Icon container */}
        <div className="mx-auto w-16 h-16 bg-primary-50 text-primary-700 border border-primary-100 rounded-2xl flex items-center justify-center mb-4 shadow-xs">
          <IconComponent className="w-8 h-8" />
        </div>

        {/* Status tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 mb-3">
          <Lock className="w-3.5 h-3.5 text-gray-500" />
          <span>Bảo mật dữ liệu bệnh viện · Yêu cầu xác thực</span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {featureName ? `${featureName} — ` : ''}Yêu cầu đăng nhập
        </h3>

        {/* Description */}
        <p className="text-xs text-gray-600 leading-relaxed mb-5 max-w-md mx-auto">
          {description ||
            'Để bảo vệ an toàn thông tin người bệnh và dữ liệu phẫu thuật thủ thuật, hệ thống chỉ hiển thị dữ liệu đối với người dùng đã đăng nhập tài khoản nhân viên được cấp quyền.'}
        </p>

        {/* Guidance instructions box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-left mb-6 space-y-2">
          <div className="flex items-start gap-2 text-xs text-slate-700">
            <span className="font-bold text-primary-700 shrink-0">1.</span>
            <span>
              <strong>Đã có tài khoản:</strong> Nhấn nút <strong>Đăng nhập</strong> bên dưới bằng Nickname (hoặc SĐT) và mật khẩu của bạn.
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-slate-700">
            <span className="font-bold text-primary-700 shrink-0">2.</span>
            <span>
              <strong>Chưa có tài khoản:</strong> Nhấn nút <strong>Tạo tài khoản mới</strong> để đăng ký. Tài khoản sẽ được chuyển đến Lãnh đạo khoa hoặc Quản trị viên phê duyệt.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold bg-primary-700 hover:bg-primary-800 text-white rounded-xl shadow-sm transition-all hover:shadow-md cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Đăng nhập ngay</span>
          </button>

          <button
            type="button"
            onClick={() => openAuthModal('register')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-primary-700" />
            <span>Tạo tài khoản mới</span>
          </button>
        </div>

        {/* Optional fallback button: quay lại xử lý file Excel tạm thời */}
        {onSwitchToLocalExcel && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onSwitchToLocalExcel}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Chuyển sang tab Minh Lộ để xử lý file Excel tạm thời</span>
            </button>
          </div>
        )}

        {/* Mode indicator footer */}
        <div className="mt-5 pt-3 border-t border-gray-100/80">
          <p className="text-[11px] text-gray-400">
            Chế độ hiện tại: <span className="font-medium text-gray-500">Khách</span> (Không truy cập cơ sở dữ liệu trực tuyến)
          </p>
        </div>
      </div>
    </div>
  );
};
