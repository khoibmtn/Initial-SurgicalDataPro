import React, { useEffect } from 'react';
import {
  Activity,
  LayoutDashboard,
  Calendar,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

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
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggle,
  userName,
  userRole,
  syncStatus = 'synced',
}) => {
  // Auto-collapse on compact viewport
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1280px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && !collapsed) onToggle();
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [collapsed, onToggle]);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  const syncColors = {
    synced: 'bg-green-500',
    unsaved: 'bg-amber-500',
    processing: 'bg-blue-500 animate-pulse',
  };

  const syncLabels = {
    synced: 'Đã đồng bộ',
    unsaved: 'Chưa lưu',
    processing: 'Đang xử lý...',
  };

  return (
    <aside
      className={`sidebar fixed top-0 left-0 z-40 h-screen flex flex-col bg-white border-r border-gray-200 ${
        collapsed ? 'w-[72px]' : 'w-[224px]'
      }`}
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-100 shrink-0">
        <div className="bg-primary-700 p-2 rounded-lg shrink-0">
          <Activity className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate font-heading">
              SurgicalDataPro
            </h1>
            <p className="text-[10px] text-gray-400 truncate">Quản lý PTTT</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-primary-50 text-primary-700 border-l-[3px] border-primary-600 pl-[9px]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  isActive ? 'text-primary-600' : 'text-gray-400'
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer: toggle + user */}
      <div className="border-t border-gray-100 p-2 space-y-2 shrink-0">
        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>Thu gọn</span>
            </>
          )}
        </button>

        {/* User info + sync status */}
        {(userName || syncStatus) && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 ${collapsed ? 'justify-center px-1' : ''}`}>
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
  );
};
