// ─── User Management Panel ────────────────────────────────────────────────────
// Admin-only panel tích hợp trong Tab Cấu hình
// Hiển thị danh sách users, approve/disable, đổi role, toggle phê duyệt

import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { AppUser, UserRole } from '../../types/auth';
import {
  subscribeToAllUsers,
  approveUser,
  disableUser,
  enableUser,
  changeUserRole,
  updateAuthConfig,
} from '../../services/userManagementService';

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'head', label: 'Trưởng khoa', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'staff', label: 'Nhân viên', color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Hoạt động', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pending: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  disabled: { label: 'Đã khóa', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export const UserManagementPanel: React.FC = () => {
  const { user: currentUser, authConfig, isAdmin } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscribe to users list
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToAllUsers((data) => {
      setUsers(data);
      setIsLoading(false);
    });
    return () => unsub();
  }, [isAdmin]);

  // Auto-clear messages
  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  if (!isAdmin) return null;

  const pendingCount = users.filter((u) => u.status === 'pending').length;

  const handleApprove = async (uid: string) => {
    const res = await approveUser(uid);
    setActionMsg(res.success
      ? { type: 'success', text: 'Đã duyệt tài khoản thành công.' }
      : { type: 'error', text: res.error || 'Lỗi khi duyệt tài khoản.' });
  };

  const handleDisable = async (uid: string) => {
    if (uid === currentUser?.uid) {
      setActionMsg({ type: 'error', text: 'Không thể khóa tài khoản của chính mình!' });
      return;
    }
    const res = await disableUser(uid);
    setActionMsg(res.success
      ? { type: 'success', text: 'Đã khóa tài khoản.' }
      : { type: 'error', text: res.error || 'Lỗi khi khóa tài khoản.' });
  };

  const handleEnable = async (uid: string) => {
    const res = await enableUser(uid);
    setActionMsg(res.success
      ? { type: 'success', text: 'Đã mở khóa tài khoản.' }
      : { type: 'error', text: res.error || 'Lỗi khi mở khóa.' });
  };

  const handleRoleChange = async (uid: string, role: UserRole) => {
    if (uid === currentUser?.uid) {
      setActionMsg({ type: 'error', text: 'Không thể thay đổi vai trò của chính mình!' });
      return;
    }
    const res = await changeUserRole(uid, role);
    setActionMsg(res.success
      ? { type: 'success', text: `Đã thay đổi vai trò thành "${ROLE_OPTIONS.find(r => r.value === role)?.label}".` }
      : { type: 'error', text: res.error || 'Lỗi khi thay đổi vai trò.' });
  };

  const handleToggleApproval = async () => {
    const newVal = !authConfig.requireApproval;
    const res = await updateAuthConfig({ requireApproval: newVal });
    setActionMsg(res.success
      ? { type: 'success', text: newVal ? 'Đã BẬT phê duyệt thành viên mới.' : 'Đã TẮT phê duyệt — thành viên mới sẽ được kích hoạt ngay.' }
      : { type: 'error', text: res.error || 'Lỗi.' });
  };

  const handleToggleRequireLogin = async () => {
    const newVal = !authConfig.requireLogin;
    const res = await updateAuthConfig({ requireLogin: newVal });
    setActionMsg(res.success
      ? { type: 'success', text: newVal ? 'Đã BẬT bắt buộc đăng nhập — Guest sẽ bị chặn.' : 'Đã TẮT bắt buộc đăng nhập — Guest có thể dùng app.' }
      : { type: 'error', text: res.error || 'Lỗi.' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary-100 text-primary-700 rounded-lg">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Quản lý Người dùng</h3>
            <p className="text-[11px] text-gray-500">
              {users.length} người dùng{pendingCount > 0 && ` · ${pendingCount} chờ duyệt`}
            </p>
          </div>
        </div>
      </div>

      {/* Config toggles */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleToggleApproval}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            authConfig.requireApproval
              ? 'bg-primary-50 border-primary-200 text-primary-700'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          {authConfig.requireApproval ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          <div className="text-left">
            <p className="font-semibold">Phê duyệt thành viên</p>
            <p className="text-[10px] opacity-75">{authConfig.requireApproval ? 'BẬT — Chờ duyệt' : 'TẮT — Tự kích hoạt'}</p>
          </div>
        </button>

        <button
          onClick={handleToggleRequireLogin}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            authConfig.requireLogin
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          {authConfig.requireLogin ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          <div className="text-left">
            <p className="font-semibold">Bắt buộc đăng nhập</p>
            <p className="text-[10px] opacity-75">{authConfig.requireLogin ? 'BẬT — Chặn Guest' : 'TẮT — Guest dùng tự do'}</p>
          </div>
        </button>
      </div>

      {/* Role Permissions Reference */}
      <RolePermissionsSection />

      {/* Action message */}
      {actionMsg && (
        <div
          className={`p-2.5 rounded-lg text-xs flex items-center gap-2 animate-fade-in ${
            actionMsg.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {actionMsg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span className="font-medium">{actionMsg.text}</span>
        </div>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-gray-400 gap-2 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Đang tải danh sách người dùng...
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-xs">
          Chưa có người dùng nào đăng ký.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Nickname</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Tên hiển thị</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Khoa</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Vai trò</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Trạng thái</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => {
                const statusInfo = STATUS_CONFIG[u.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusInfo.icon;
                const isCurrentUser = u.uid === currentUser?.uid;

                return (
                  <tr key={u.uid} className={`hover:bg-gray-50/50 ${isCurrentUser ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-3 py-2 font-mono font-medium text-gray-800">
                      {u.nickname}
                      {isCurrentUser && (
                        <span className="ml-1.5 text-[9px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-bold">BẠN</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{u.displayName}</td>
                    <td className="px-3 py-2 text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-gray-400" />
                        {u.department || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isCurrentUser ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          ROLE_OPTIONS.find(r => r.value === u.role)?.color || ''
                        }`}>
                          {ROLE_OPTIONS.find(r => r.value === u.role)?.label}
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                          className="text-[10px] font-bold rounded-full px-2 py-0.5 border cursor-pointer bg-white focus:outline-hidden focus:ring-1 focus:ring-primary-300"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {u.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(u.uid)}
                            className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors cursor-pointer"
                            title="Duyệt tài khoản"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {u.status === 'active' && !isCurrentUser && (
                          <button
                            onClick={() => handleDisable(u.uid)}
                            className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors cursor-pointer"
                            title="Khóa tài khoản"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {u.status === 'disabled' && (
                          <button
                            onClick={() => handleEnable(u.uid)}
                            className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition-colors cursor-pointer"
                            title="Mở khóa tài khoản"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Role Permissions Section ────────────────────────────────────────────────

const ROLE_PERMISSIONS: {
  role: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  permissions: string[];
}[] = [
  {
    role: 'admin',
    label: 'Quản trị viên (Admin)',
    icon: Shield,
    color: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
    permissions: [
      'Toàn quyền hệ thống',
      'Cấu hình quyền trưởng khoa & nhân viên',
      'Bật/tắt phê duyệt thành viên mới',
      'Bật/tắt bắt buộc đăng nhập',
      'Duyệt, khóa, mở khóa tài khoản',
      'Thay đổi vai trò người dùng',
      'Quản lý danh mục, định mức, cấu hình',
      'Xuất/nhập dữ liệu Excel',
      'Xem thống kê & báo cáo',
    ],
  },
  {
    role: 'head',
    label: 'Trưởng khoa',
    icon: Building2,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    permissions: [
      'Duyệt thành viên trong khoa',
      'Khóa/mở khóa báo cáo (Phase 2)',
      'Truy vết lịch sử thay đổi (Phase 2)',
      'Điều chỉnh quyền nhân viên (trong phạm vi admin cho phép)',
      'Xem thống kê & báo cáo của khoa',
      'Xuất/nhập dữ liệu Excel',
    ],
  },
  {
    role: 'staff',
    label: 'Nhân viên',
    icon: UserCheck,
    color: 'text-gray-700',
    bgColor: 'bg-gray-50 border-gray-200',
    permissions: [
      'Thực hiện quyền được trưởng khoa giao',
      'Nhập liệu báo cáo phẫu thuật',
      'Xem thông tin cá nhân',
      'Xuất dữ liệu (nếu được phép)',
      'Xem thống kê (nếu được phép)',
    ],
  },
];

const RolePermissionsSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-gray-500" />
          Chi tiết quyền theo vai trò
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-gray-100 grid gap-3 animate-fade-in md:grid-cols-3">
          {ROLE_PERMISSIONS.map(({ role, label, icon: Icon, color, bgColor, permissions }) => (
            <div key={role} className={`rounded-lg border p-3 ${bgColor}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <h4 className={`text-xs font-bold ${color}`}>{label}</h4>
              </div>
              <ul className="space-y-1">
                {permissions.map((perm, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                    <CheckCircle2 className={`w-3 h-3 mt-0.5 shrink-0 ${color} opacity-60`} />
                    <span>{perm}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
