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
} from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';

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
  const { isLocked, unlockConfig, lockConfig, changePassword } = useConfig();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [unlockPwd, setUnlockPwd] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [authMsg, setAuthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleUnlock = () => {
    setAuthMsg(null);
    if (!unlockPwd) {
      setAuthMsg({ type: 'error', text: 'Vui lòng nhập mật khẩu!' });
      return;
    }
    const res = unlockConfig(unlockPwd);
    if (res.success) {
      setAuthMsg({ type: 'success', text: 'Mở khóa cấu hình thành công!' });
      setUnlockPwd('');
    } else {
      setAuthMsg({ type: 'error', text: res.error || 'Mật khẩu không chính xác!' });
    }
  };

  const handleChangePassword = () => {
    setAuthMsg(null);
    if (!oldPwd || !newPwd || !confirmPwd) {
      setAuthMsg({ type: 'error', text: 'Vui lòng điền đầy đủ các trường mật khẩu!' });
      return;
    }
    if (newPwd !== confirmPwd) {
      setAuthMsg({ type: 'error', text: 'Mật khẩu mới và xác nhận mật khẩu không khớp!' });
      return;
    }
    const res = changePassword(oldPwd, newPwd);
    if (res.success) {
      setAuthMsg({ type: 'success', text: 'Đổi mật khẩu thành công! Mật khẩu mới đã được lưu.' });
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } else {
      setAuthMsg({ type: 'error', text: res.error || 'Đổi mật khẩu thất bại!' });
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
        <div className="h-12 border-b border-gray-200 flex items-center px-3.5 gap-2.5 shrink-0 overflow-hidden">
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

        {/* Navigation list */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
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

        {/* Footer: account + toggle + user */}
        <div className="border-t border-gray-100 p-2 space-y-1.5 shrink-0">
          {/* Nút Tài khoản & Bảo mật (Khóa/Mở khóa, Đổi mật khẩu) ngay trên nút Thu gọn */}
          <button
            onClick={() => {
              setAuthMsg(null);
              setIsAccountModalOpen(true);
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isLocked
                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
            } ${collapsed ? 'justify-center px-0' : ''}`}
            title={collapsed ? `Tài khoản & Bảo mật (${isLocked ? 'Cấu hình: Khóa' : 'Cấu hình: Mở'})` : undefined}
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <User className="h-4 w-4" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                  isLocked ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </div>
            {!collapsed && (
              <div className="flex-1 flex items-center justify-between min-w-0">
                <span className="truncate text-[11px] font-semibold">Tài khoản</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider flex items-center gap-0.5 ${
                    isLocked
                      ? 'bg-amber-200/70 text-amber-800'
                      : 'bg-emerald-200/70 text-emerald-800'
                  }`}
                >
                  {isLocked ? <Lock className="w-2.5 h-2.5 inline" /> : <Unlock className="w-2.5 h-2.5 inline" />}
                  {isLocked ? 'Khóa' : 'Mở'}
                </span>
              </div>
            )}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
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

      {/* Account & Security Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-100 text-primary-700 rounded-xl">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Tài khoản & Bảo mật</h3>
                  <p className="text-xs text-gray-500">Quản lý quyền cấu hình và đổi mật khẩu</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAccountModalOpen(false);
                  setUnlockPwd('');
                  setOldPwd('');
                  setNewPwd('');
                  setConfirmPwd('');
                  setAuthMsg(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Section 1: Quyền cấu hình */}
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Trạng thái cấu hình</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      isLocked
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {isLocked ? 'Đang khóa (Chỉ xem)' : 'Đã mở khóa'}
                  </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  {isLocked
                    ? 'Cấu hình đang được khóa để ngăn chỉnh sửa. Nhập mật khẩu để mở khóa trong phiên làm việc hiện tại.'
                    : 'Cấu hình đang mở. Bạn có thể thêm, sửa, xóa các thiết lập. Khóa lại bất kỳ lúc nào để bảo vệ dữ liệu.'}
                </p>

                {isLocked ? (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="password"
                      placeholder="Nhập mật khẩu"
                      value={unlockPwd}
                      onChange={(e) => setUnlockPwd(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500 bg-white"
                    />
                    <button
                      onClick={handleUnlock}
                      className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                    >
                      Mở khóa
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      lockConfig();
                      setAuthMsg({ type: 'success', text: 'Đã khóa cấu hình thành công!' });
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Khóa cấu hình ngay
                  </button>
                )}
              </div>

              {/* Section 2: Đổi mật khẩu */}
              <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-3 shadow-xs">
                <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                  <KeyRound className="w-4 h-4 text-primary-600" />
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Đổi mật khẩu cấu hình</h4>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      placeholder="Nhập mật khẩu hiện tại"
                      value={oldPwd}
                      onChange={(e) => setOldPwd(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Mật khẩu mới (tối thiểu 4 ký tự)</label>
                    <input
                      type="password"
                      placeholder="Nhập mật khẩu mới"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      placeholder="Nhập lại mật khẩu mới"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <button
                    onClick={handleChangePassword}
                    className="w-full mt-2 py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                  >
                    Lưu mật khẩu mới
                  </button>
                </div>
              </div>

              {/* Alert message */}
              {authMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
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
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setIsAccountModalOpen(false);
                  setUnlockPwd('');
                  setOldPwd('');
                  setNewPwd('');
                  setConfirmPwd('');
                  setAuthMsg(null);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors shadow-xs"
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
