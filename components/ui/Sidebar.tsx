import React, { useEffect, useState } from 'react';
import {
  Activity,
  LayoutDashboard,
  Calendar,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
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
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'error';
  onLoginClick?: () => void;
  onAccountClick?: () => void;
}

const syncColors = {
  synced: 'bg-emerald-500',
  syncing: 'bg-amber-500 animate-pulse',
  offline: 'bg-gray-400',
  error: 'bg-red-500',
};

const syncLabels = {
  synced: 'Đã đồng bộ',
  syncing: 'Đang đồng bộ...',
  offline: 'Ngoại tuyến',
  error: 'Lỗi đồng bộ',
};

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
  const { user, currentRole, pendingApprovalCount = 0 } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

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

    </>
  );
};
