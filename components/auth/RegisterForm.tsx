// ─── Register Form ────────────────────────────────────────────────────────────
// Form đăng ký tài khoản nhân viên: nickname + password + khoa

import React, { useState } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Building2,
  UserPlus,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';

interface RegisterFormProps {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onBackToLogin }) => {
  const { register, authConfig } = useAuth();
  const { config } = useConfig();

  const [nickname, setNickname] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Lấy danh sách khoa từ config
  const departments = config.departments || [];

  const validate = (): string | null => {
    const trimmedNickname = nickname.trim().toLowerCase();
    if (!trimmedNickname) return 'Vui lòng nhập nickname.';
    if (trimmedNickname.length < 6) return 'Nickname phải có ít nhất 6 ký tự.';
    if (!/^[a-z0-9._-]+$/.test(trimmedNickname)) return 'Nickname chỉ được chứa chữ thường, số, dấu chấm, gạch ngang và gạch dưới.';
    if (!password) return 'Vui lòng nhập mật khẩu.';
    if (password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (password !== confirmPassword) return 'Mật khẩu xác nhận không khớp.';
    if (!department) return 'Vui lòng chọn Khoa trực thuộc.';
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const result = await register({
        nickname: nickname.trim().toLowerCase(),
        password,
        displayName: displayName.trim() || nickname.trim(),
        department,
      });

      if (result.success) {
        if (authConfig.requireApproval) {
          setMessage({
            type: 'info',
            text: 'Đăng ký thành công! Tài khoản đang chờ phê duyệt từ quản trị viên hoặc trưởng khoa.',
          });
          setTimeout(onSuccess, 2500);
        } else {
          setMessage({ type: 'success', text: 'Đăng ký thành công!' });
          setTimeout(onSuccess, 1200);
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Đăng ký thất bại.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Lỗi hệ thống. Vui lòng thử lại.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) handleSubmit();
  };

  return (
    <div className="space-y-3.5">
      {/* Nickname */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Nickname <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal ml-1">(≥ 6 ký tự, chữ thường + số)</span>
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <User className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="vd: nguyenvana"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.toLowerCase())}
            onKeyDown={handleKeyDown}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
            autoFocus
          />
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Tên hiển thị
          <span className="text-gray-400 font-normal ml-1">(tùy chọn)</span>
        </label>
        <input
          type="text"
          placeholder="vd: Nguyễn Văn A"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
        />
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Mật khẩu <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal ml-1">(≥ 6 ký tự)</span>
        </label>
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
            className="w-full pl-10 pr-10 py-2 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
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

      {/* Confirm Password */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Xác nhận mật khẩu <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Lock className="w-4 h-4" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Nhập lại mật khẩu..."
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
          />
        </div>
      </div>

      {/* Department */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Khoa trực thuộc <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Building2 className="w-4 h-4" />
          </div>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white appearance-none cursor-pointer"
          >
            <option value="">— Chọn khoa —</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
            {departments.length === 0 && (
              <option value="Chưa phân khoa" disabled>Chưa có danh mục khoa</option>
            )}
          </select>
        </div>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-sm font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <UserPlus className="w-4 h-4" />
        )}
        {isLoading ? 'Đang đăng ký...' : 'Đăng ký'}
      </button>

      {/* Back to login */}
      <div className="text-center">
        <button
          onClick={onBackToLogin}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium hover:underline cursor-pointer inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          Quay lại đăng nhập
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 animate-fade-in ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : message.type === 'info'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {message.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : message.type === 'info' ? (
            <Info className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}
    </div>
  );
};
