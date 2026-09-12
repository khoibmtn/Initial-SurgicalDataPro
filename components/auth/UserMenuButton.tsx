// ─── User Menu Button ─────────────────────────────────────────────────────────
// Hiển thị ở footer Sidebar:
// - Chưa login: nút "Đăng nhập"
// - Đã login: avatar + nickname + dropdown (Đăng xuất)

import React, { useState, useRef, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  User,
  ChevronUp,
  Shield,
  UserCircle,
  Clock,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface UserMenuButtonProps {
  collapsed: boolean;
  onLoginClick: () => void;
  onAccountClick?: () => void;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-red-100 text-red-700 border-red-200' },
  head: { label: 'Trưởng khoa', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  staff: { label: 'Nhân viên', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  guest: { label: 'Khách', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

export const UserMenuButton: React.FC<UserMenuButtonProps> = ({ collapsed, onLoginClick, onAccountClick }) => {
  const { user, isLoading: authLoading, isAuthenticated, isPendingApproval, currentRole, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isMenuOpen]);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
  };

  const roleInfo = ROLE_LABELS[currentRole] || ROLE_LABELS.guest;

  // ── Đang tải auth state → ẩn nút ──
  if (authLoading) {
    return (
      <div className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-gray-400 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin shrink-0" />
        {!collapsed && <span>Đang tải...</span>}
      </div>
    );
  }

  // ── Chưa đăng nhập → Nút Đăng nhập ──
  if (!isAuthenticated && !isPendingApproval) {
    return (
      <button
        onClick={onLoginClick}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors
          bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 cursor-pointer
          ${collapsed ? 'justify-center px-1.5' : ''}`}
        title={collapsed ? 'Đăng nhập' : undefined}
      >
        <LogIn className="w-3.5 h-3.5 shrink-0" />
        {!collapsed && <span>Đăng nhập</span>}
      </button>
    );
  }

  // ── Đang chờ duyệt ──
  if (isPendingApproval) {
    return (
      <div
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-700
          ${collapsed ? 'justify-center px-1.5' : ''}`}
        title={collapsed ? `${user?.nickname || 'Tài khoản'} — Chờ duyệt` : undefined}
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{user?.displayName || user?.nickname}</p>
            <p className="text-[10px] text-amber-600">Chờ phê duyệt</p>
          </div>
        )}
      </div>
    );
  }

  // ── Đã đăng nhập → User badge + menu ──
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors
          bg-gray-50 hover:bg-gray-100 border border-gray-200 cursor-pointer
          ${collapsed ? 'justify-center px-1.5' : ''}`}
        title={collapsed ? `${user?.displayName || user?.nickname} (${roleInfo.label})` : undefined}
      >
        <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
          {currentRole === 'admin' ? (
            <Shield className="w-3 h-3" />
          ) : (
            <UserCircle className="w-3.5 h-3.5" />
          )}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-semibold text-gray-800 truncate text-[11px]">{user?.displayName || user?.nickname}</p>
              <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[9px] font-bold border ${roleInfo.color}`}>
                {roleInfo.label}
              </span>
            </div>
            <ChevronUp className={`w-3 h-3 text-gray-400 transition-transform ${isMenuOpen ? '' : 'rotate-180'}`} />
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {isMenuOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-fade-in z-50">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
            <p className="text-xs font-semibold text-gray-800 truncate">{user?.displayName || user?.nickname}</p>
            <p className="text-[10px] text-gray-500 truncate">{user?.department}</p>
          </div>
          {onAccountClick && (
            <button
              onClick={() => { setIsMenuOpen(false); onAccountClick(); }}
              className="w-full px-3 py-2 text-xs text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              Quản lý tài khoản
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-xs text-left text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer border-t border-gray-100"
          >
            <LogOut className="w-3.5 h-3.5" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
};
