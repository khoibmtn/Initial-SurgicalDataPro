import React, { useEffect, useState } from 'react';
import {
  Activity,
  LayoutDashboard,
  Calendar,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
  User,
  KeyRound,
  Lock,
  Unlock,
  Shield,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenuButton } from '../auth/UserMenuButton';
import { NotificationBell } from '../notifications/NotificationBell';
import {
  subscribeNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/notificationService';
import type { AppNotification } from '../../types/notification';

export type TabKey = 'daily' | 'monthly' | 'statistics' | 'config';

interface NavItem {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'daily', label: 'BC hàng ngày', icon: LayoutDashboard },
  { key: 'monthly', label: 'BC tháng', icon: Calendar },
  { key: 'statistics', label: 'Thống kê', icon: BarChart3 },
  { key: 'config', label: 'Cấu hình', icon: Settings },
];

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  collapsed: boolean;
  onToggle: () => void;
  userName?: string;
  userRole?: string;
  syncStatus?: 'synced' | 'unsaved' | 'processing';
  onLoginClick?: () => void;
  onAccountClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggle,
  userName,
  userRole,
  syncStatus = 'synced',
  onLoginClick,
  onAccountClick,
}) => {
  const { isLocked, unlockConfig, lockConfig, changePassword } = useConfig();
  const { user, currentRole, pendingApprovalCount } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscribe to realtime notifications
  useEffect(() => {
    const unsubscribe = subscribeNotifications(
      currentRole,
      user?.department,
      user?.uid,
      (items) => {
        setNotifications(items);
      }
    );
    return () => unsubscribe();
  }, [currentRole, user?.department, user?.uid]);

  const handleMarkAsRead = (id: string) => {
    if (user?.uid) {
      markNotificationAsRead(id, user.uid);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    }
  };

  const handleMarkAllAsRead = () => {
    if (user?.uid) {
      markAllNotificationsAsRead(
        notifications.map((n) => n.id),
        user.uid
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    if (user?.uid && !notif.read) {
      handleMarkAsRead(notif.id);
    }
    if (notif.actionTab) {
      onTabChange(notif.actionTab as TabKey);
    }
  };

  const resetModalFields = () => {
    setCurrentPwd('');
    setIsChangingPassword(false);
    setNewPwd('');
    setConfirmPwd('');
    setShowCurrentPwd(false);
    setShowNewPwd(false);
    setAuthMsg(null);
  };

  const handleUnlock = () => {
    setAuthMsg(null);
    if (!currentPwd) {
      setAuthMsg({ type: 'error', text: 'Vui lòng nhập mật khẩu hiện tại!' });
      return;
    }
    const res = unlockConfig(currentPwd);
    if (res.success) {
      setAuthMsg({ type: 'success', text: 'Mở khóa cấu hình thành công!' });
      setCurrentPwd('');
    } else {
      setAuthMsg({ type: 'error', text: res.error || 'Mật khẩu không chính xác!' });
    }
  };

  const handleSaveNewPassword = () => {
    setAuthMsg(null);
    if (!currentPwd) {
      setAuthMsg({ type: 'error', text: 'Vui lòng nhập mật khẩu hiện tại!' });
      return;
    }
    if (!newPwd || !confirmPwd) {
      setAuthMsg({ type: 'error', text: 'Vui lòng điền mật khẩu mới và xác nhận!' });
      return;
    }
    if (newPwd.length < 4) {
      setAuthMsg({ type: 'error', text: 'Mật khẩu mới phải có tối thiểu 4 ký tự!' });
      return;
    }
    if (newPwd !== confirmPwd) {
      setAuthMsg({ type: 'error', text: 'Mật khẩu mới và xác nhận mật khẩu không khớp!' });
      return;
    }
    const res = changePassword(currentPwd, newPwd);
    if (res.success) {
      setAuthMsg({ type: 'success', text: 'Đổi mật khẩu thành công! Mật khẩu mới đã được lưu.' });
      resetModalFields();
    } else {
      setAuthMsg({ type: 'error', text: res.error || 'Đổi mật khẩu thất bại! Vui lòng kiểm tra lại mật khẩu hiện tại.' });
    }
  };

  // Auto-collapse on compact viewport
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1280px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && !collapsed) onToggle();
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [collapsed, onToggle]);

  const syncColors = {
    synced: 'bg-emerald-500',
    unsaved: 'bg-amber-400',
    processing: 'bg-blue-500 animate-pulse',
  };

  const syncLabels = {
    synced: 'Đã lưu',
    unsaved: 'Chưa lưu',
    processing: 'Đang xử lý',
  };

  return (
    <>
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200 select-none ${
          collapsed ? 'w-[56px]' : 'w-[200px]'
        }`}
      >
        {/* Brand header */}
        <div
          className={`h-12 border-b border-gray-200 flex items-center shrink-0 ${
            collapsed ? 'justify-center px-2' : 'justify-between px-3'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Activity className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-gray-900 truncate leading-tight tracking-tight">
                  SurgicalDataPro
                </h1>
                <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">
                  Enterprise v2.0
                </span>
              </div>
            )}
          </div>
          {!collapsed && (
            <NotificationBell
              notifications={notifications}
              onMarkAllAsRead={handleMarkAllAsRead}
              onNotificationClick={handleNotificationClick}
              align="left"
            />
          )}
        </div>

        {/* Collapsed notification icon */}
        {collapsed && (
          <div className="py-1.5 flex justify-center border-b border-gray-100">
            <NotificationBell
              notifications={notifications}
              onMarkAllAsRead={handleMarkAllAsRead}
              onNotificationClick={handleNotificationClick}
              align="left"
            />
          </div>
        )}

        {/* Navigation items */}
        <nav className="flex-1 py-2.5 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            const showPendingBadge = item.key === 'config' && pendingApprovalCount > 0;
            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all relative ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-bold shadow-xs'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                } ${collapsed ? 'justify-center px-2' : ''}`}
                title={collapsed ? (showPendingBadge ? `${item.label} (${pendingApprovalCount} chờ duyệt)` : item.label) : undefined}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {showPendingBadge && (
                  collapsed ? (
                    <span
                      className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white animate-pulse"
                      title={`${pendingApprovalCount} tài khoản chờ duyệt`}
                    />
                  ) : (
                    <span
                      className="ml-auto px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse shrink-0"
                      title={`${pendingApprovalCount} tài khoản chờ duyệt`}
                    >
                      {pendingApprovalCount}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer controls */}
        <div className="p-2 border-t border-gray-100 space-y-1">
          {/* User Auth Button (Login / User Badge) */}
          <UserMenuButton collapsed={collapsed} onLoginClick={onLoginClick || (() => {})} onAccountClick={onAccountClick} />

          {/* Nút Tài khoản & Bảo mật (Khóa/Mở khóa, Đổi mật khẩu) ngay trên nút Thu gọn */}
          <button
            onClick={() => {
              setIsAccountModalOpen(true);
              resetModalFields();
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isLocked
                ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            } ${collapsed ? 'justify-center px-1' : ''}`}
            title={collapsed ? `Tài khoản & Bảo mật (${isLocked ? 'Cấu hình: Khóa' : 'Cấu hình: Mở'})` : undefined}
          >
            <Shield className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && (
              <div className="flex-1 min-w-0 flex items-center justify-between text-left">
                <span className="truncate">Tài khoản</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full uppercase shrink-0">
                  {isLocked ? 'Khóa' : 'Mở'}
                </span>
              </div>
            )}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="h-3.5 w-3.5 mx-auto" />
            ) : (
              <>
                <PanelLeftClose className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Thu gọn</span>
              </>
            )}
          </button>

          {/* User badge */}
          {(userName || syncStatus) && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50 ${collapsed ? 'justify-center px-1' : ''}`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${syncColors[syncStatus]}`} title={syncLabels[syncStatus]} />
              {!collapsed && (
                <div className="min-w-0">
                  {userName && <p className="text-xs font-medium text-gray-700 truncate">{userName}</p>}
                  {userRole && <p className="text-[10px] text-gray-400 truncate">{userRole}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Account & Security Modal - Giao diện tinh gọn */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary-100 text-primary-700 rounded-lg">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">Tài khoản & Bảo mật</h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isLocked
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      {isLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                      {isLocked ? 'Đang khóa' : 'Đã mở'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">Quản lý quyền cấu hình và đổi mật khẩu</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAccountModalOpen(false);
                  resetModalFields();
                }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">
              {/* 1 box nhập mật khẩu hiện tại */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPwd ? 'text' : 'password'}
                    placeholder="Nhập mật khẩu hiện tại..."
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isChangingPassword && isLocked) {
                        handleUnlock();
                      }
                    }}
                    className="w-full pl-3 pr-9 py-2 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    tabIndex={-1}
                    title={showCurrentPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Bên dưới có 2 nút: Mở khóa và Đổi mật khẩu */}
              <div className="flex gap-2 pt-0.5">
                {isLocked ? (
                  <button
                    type="button"
                    onClick={handleUnlock}
                    className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Mở khóa
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      lockConfig();
                      setAuthMsg({ type: 'success', text: 'Đã khóa cấu hình thành công!' });
                    }}
                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Khóa cấu hình
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPassword(!isChangingPassword);
                    setAuthMsg(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer border ${
                    isChangingPassword
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                  {isChangingPassword ? 'Hủy đổi MK' : 'Đổi mật khẩu'}
                </button>
              </div>

              {/* Khi bấm Đổi mật khẩu mới hiện 2 box nhập mật khẩu mới và nút Lưu mật khẩu mới */}
              {isChangingPassword && (
                <div className="space-y-2.5 pt-3 border-t border-gray-200 animate-fade-in bg-blue-50/40 p-3 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mb-0.5">
                    <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                    Thiết lập mật khẩu mới
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Mật khẩu mới (tối thiểu 4 ký tự)
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPwd ? 'text' : 'password'}
                        placeholder="Nhập mật khẩu mới..."
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        className="w-full pl-3 pr-9 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPwd(!showNewPwd)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                        tabIndex={-1}
                        title={showNewPwd ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showNewPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Xác nhận mật khẩu mới
                    </label>
                    <input
                      type={showNewPwd ? 'text' : 'password'}
                      placeholder="Nhập lại mật khẩu mới..."
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveNewPassword();
                        }
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveNewPassword}
                    className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Lưu mật khẩu mới
                  </button>
                </div>
              )}

              {/* Alert message */}
              {authMsg && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 animate-fade-in ${
                    authMsg.type === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {authMsg.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span className="font-medium">{authMsg.text}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsAccountModalOpen(false);
                  resetModalFields();
                }}
                className="px-4 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
