import React from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import type { ToastType } from '../components/common/ToastContainer';

/**
 * Mở modal đăng nhập / đăng ký từ bất kỳ đâu trong app
 */
export function openAuthModal(view: 'login' | 'register' = 'login'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app:open-auth-modal', {
        detail: { view },
      })
    );
  }
}

/**
 * Nhận diện lỗi do chưa đăng nhập hoặc không đủ quyền từ Firebase (Firestore & RTDB)
 */
export function isAuthOrPermissionError(error: unknown): boolean {
  if (!error) return false;

  const errObj = error as Record<string, any>;
  const code = String(errObj?.code || '').toLowerCase();
  const message = String(errObj?.message || error || '').toLowerCase();

  return (
    code === 'permission-denied' ||
    code === 'permission_denied' ||
    code.includes('permission') ||
    code.includes('unauthenticated') ||
    code.includes('unauthorized') ||
    message.includes('permission-denied') ||
    message.includes('permission_denied') ||
    message.includes('missing or insufficient permissions') ||
    message.includes('insufficient permissions') ||
    message.includes('permission denied') ||
    message.includes('không có quyền') ||
    message.includes('yêu cầu đăng nhập') ||
    message.includes('chưa đăng nhập')
  );
}

/**
 * Toast giao diện hướng dẫn người dùng đăng nhập hoặc tạo tài khoản mới
 */
export const AuthGuidanceToast: React.FC<{
  actionName?: string;
  isPendingApproval?: boolean;
}> = ({ actionName, isPendingApproval }) => {
  if (isPendingApproval) {
    return (
      <div className="space-y-1.5 py-0.5">
        <p className="text-xs text-amber-900 leading-relaxed">
          Tài khoản của bạn đang ở trạng thái <strong>chờ duyệt</strong>. Vui lòng liên hệ Quản trị viên hoặc Lãnh đạo khoa để kích hoạt tài khoản trước khi {actionName || 'thực hiện thao tác này'}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-0.5">
      <p className="text-xs text-amber-900 leading-relaxed font-medium">
        Bạn cần đăng nhập để {actionName || 'sử dụng tính năng này'}. Nếu chưa có tài khoản, vui lòng tạo tài khoản mới rồi đăng nhập.
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openAuthModal('login');
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-primary-700 hover:bg-primary-800 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Đăng nhập</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openAuthModal('register');
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Tạo tài khoản</span>
        </button>
      </div>
    </div>
  );
};

export type AddToastFn = (
  message: React.ReactNode,
  type?: ToastType,
  duration?: number,
  title?: string
) => void;

/**
 * Hiển thị toast thông báo hướng dẫn đăng nhập / tạo tài khoản
 */
export function notifyAuthRequired(
  addToast: AddToastFn,
  actionName?: string,
  isPendingApproval?: boolean
): void {
  addToast(
    <AuthGuidanceToast actionName={actionName} isPendingApproval={isPendingApproval} />,
    'warning',
    12000,
    isPendingApproval ? 'Tài khoản chờ duyệt' : 'Yêu cầu đăng nhập'
  );
}

/**
 * Tự động phân loại lỗi: nếu là lỗi auth/permission thì hướng dẫn đăng nhập, ngược lại hiển thị thông báo lỗi thông thường
 */
export function handleActionError(
  error: unknown,
  fallbackMessage: string,
  addToast: AddToastFn,
  actionName?: string,
  isPendingApproval?: boolean
): void {
  if (isAuthOrPermissionError(error)) {
    notifyAuthRequired(addToast, actionName, isPendingApproval);
    return;
  }
  const detail = error instanceof Error ? error.message : '';
  const finalMsg = detail && detail !== fallbackMessage ? `${fallbackMessage} (${detail})` : fallbackMessage;
  addToast(finalMsg, 'error');
}
