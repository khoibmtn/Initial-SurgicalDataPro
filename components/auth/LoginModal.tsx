// ─── Login Modal ──────────────────────────────────────────────────────────────
// Modal đăng nhập hỗ trợ 2 chế độ: Admin (email) và Nhân viên (nickname)
// Có toggle chuyển sang form đăng ký

import React, { useState } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Mail,
  User,
  Lock,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Shield,
  Loader2,
  Info,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { RegisterForm } from './RegisterForm';

/** Email admin cố định — không cần nhập */
const ADMIN_EMAIL = 'khoibm.tn@gmail.com';

type LoginMode = 'admin' | 'staff';
type ViewMode = 'login' | 'register';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { login, loginNickname } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('login');
  const [loginMode, setLoginMode] = useState<LoginMode>('staff');

  // Login form state
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resetForm = () => {
    setEmail('');
    setNickname('');
    setPassword('');
    setShowPassword(false);
    setIsLoading(false);
    setMessage(null);
  };

  const handleLogin = async () => {
    setMessage(null);
    setIsLoading(true);

    try {
      let result;
      if (loginMode === 'admin') {
        if (!password) {
          setMessage({ type: 'error', text: 'Vui lòng nhập mật khẩu.' });
          setIsLoading(false);
          return;
        }
        result = await login(ADMIN_EMAIL, password);
      } else {
        if (!nickname.trim()) {
          setMessage({ type: 'error', text: 'Vui lòng nhập nickname.' });
          setIsLoading(false);
          return;
        }
        result = await loginNickname(nickname.trim(), password);
      }

      if (result.success) {
        setMessage({ type: 'success', text: 'Đăng nhập thành công!' });
        setTimeout(() => {
          resetForm();
          onClose();
        }, 800);
      } else {
        setMessage({ type: 'error', text: result.error || 'Đăng nhập thất bại.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Lỗi hệ thống. Vui lòng thử lại.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleLogin();
    }
  };

  const handleRegisterSuccess = () => {
    setViewMode('login');
    setLoginMode('staff');
    setMessage({ type: 'success', text: 'Đăng ký thành công! Hãy đăng nhập với tài khoản vừa tạo.' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary-100 text-primary-700 rounded-xl">
              {viewMode === 'login' ? <LogIn className="w-4.5 h-4.5" /> : <UserPlus className="w-4.5 h-4.5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {viewMode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}
              </h3>
              <p className="text-[11px] text-gray-500">
                {viewMode === 'login' ? 'SurgicalDataPro Enterprise' : 'Tạo tài khoản nhân viên mới'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {viewMode === 'login' ? (
            <div className="space-y-4">
              {/* Login mode tabs */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => { setLoginMode('staff'); setMessage(null); }}
                  className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    loginMode === 'staff'
                      ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Nhân viên
                </button>
                <button
                  onClick={() => { setLoginMode('admin'); setMessage(null); }}
                  className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    loginMode === 'admin'
                      ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </button>
              </div>

              {/* Admin: hiện info badge, không cần nhập email */}
              {loginMode === 'admin' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary-50 border border-primary-100">
                  <div className="p-1.5 bg-primary-100 text-primary-700 rounded-lg">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary-800">Quản trị viên</p>
                    <p className="text-[11px] text-primary-600 truncate">{ADMIN_EMAIL}</p>
                  </div>
                </div>
              )}

              {/* Staff: nhập nickname */}
              {loginMode === 'staff' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nickname</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="nickname"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {/* Password input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mật khẩu</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Nhập mật khẩu..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Login button */}
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>

              {/* Register link */}
              <div className="text-center pt-1">
                <button
                  onClick={() => { setViewMode('register'); setMessage(null); }}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium hover:underline cursor-pointer"
                >
                  Chưa có tài khoản? <span className="font-bold">Đăng ký</span>
                </button>
              </div>

              {/* Note: Đăng nhập không cần tài khoản (Khách) */}
              <div className="pt-2 border-t border-gray-100">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-left flex items-start gap-2.5">
                  <div className="p-1 bg-slate-200/80 text-slate-700 rounded-md shrink-0 mt-0.5">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">Đăng nhập không cần tài khoản</span>
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
                        Chế độ Khách
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug mt-1">
                      Bạn có thể trải nghiệm toàn bộ tính năng báo cáo, đối soát và xuất dữ liệu ngay mà không cần đăng nhập.
                    </p>
                    <button
                      type="button"
                      onClick={() => { resetForm(); onClose(); }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                    >
                      <span>Vào ngay (Khách)</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <RegisterForm
                onSuccess={handleRegisterSuccess}
                onBackToLogin={() => { setViewMode('login'); setMessage(null); }}
              />
            </div>
          )}

          {/* Message alert */}
          {message && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 animate-fade-in ${
                message.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
