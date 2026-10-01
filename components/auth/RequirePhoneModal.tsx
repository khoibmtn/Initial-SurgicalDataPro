// ─── Require Phone Modal ──────────────────────────────────────────────────
// Modal bắt buộc cập nhật số điện thoại cho các tài khoản đang hoạt động nhưng chưa có SĐT

import React, { useState } from 'react';
import { Phone, ShieldAlert, Loader2, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserPhone } from '../../services/authService';
import { isValidPhoneNumber } from '../../types/auth';

interface RequirePhoneModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
}

export const RequirePhoneModal: React.FC<RequirePhoneModalProps> = ({ isOpen, onSuccess }) => {
  const { user, logout } = useAuth();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();

    if (!cleanPhone) {
      setError('Vui lòng nhập số điện thoại.');
      return;
    }

    if (!isValidPhoneNumber(cleanPhone)) {
      setError('Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số di động (vd: 0912345678).');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await updateUserPhone(user.uid, cleanPhone);
      if (res.success) {
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || 'Cập nhật số điện thoại thất bại.');
      }
    } catch {
      setError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-amber-50/70">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Bổ sung số điện thoại</h3>
            <p className="text-xs text-gray-600">Yêu cầu hoàn tất thông tin tài khoản</p>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs text-gray-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
            Xin chào <strong className="text-gray-900">{user.displayName || user.nickname}</strong>! Để nâng cấp bảo mật và hỗ trợ bạn có thể đăng nhập bằng số điện thoại ngoài nickname, hệ thống yêu cầu bạn cập nhật số điện thoại di động chính xác.
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Số điện thoại di động <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                placeholder="vd: 0912345678"
                value={phone}
                onChange={(e) => {
                  setError(null);
                  setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10));
                }}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Gồm 10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.</p>
          </div>

          {error && (
            <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? 'Đang lưu...' : 'Lưu và tiếp tục'}
            </button>

            <button
              type="button"
              onClick={() => logout()}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 font-medium hover:underline flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Đăng xuất
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
