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

// ─── Role Permissions Matrix ─────────────────────────────────────────────────

/** Danh sách tất cả quyền trong hệ thống */
const ALL_PERMISSIONS: { key: string; label: string; description: string; category: string }[] = [
  // ── Dữ liệu & Báo cáo ──
  { key: 'view_daily_report', label: 'Xem BC hàng ngày', description: 'Xem báo cáo phẫu thuật hàng ngày', category: 'Dữ liệu' },
  { key: 'view_monthly_report', label: 'Xem BC tháng', description: 'Xem báo cáo tổng hợp theo tháng', category: 'Dữ liệu' },
  { key: 'edit_report', label: 'Chỉnh sửa BC', description: 'Thêm, sửa, xóa bản ghi phẫu thuật', category: 'Dữ liệu' },
  { key: 'import_excel', label: 'Nhập Excel', description: 'Import dữ liệu từ file Excel', category: 'Dữ liệu' },
  { key: 'export_excel', label: 'Xuất Excel', description: 'Export dữ liệu ra file Excel', category: 'Dữ liệu' },
  // ── Thống kê ──
  { key: 'view_statistics', label: 'Xem thống kê', description: 'Xem trang thống kê tổng hợp', category: 'Thống kê' },
  { key: 'view_cost_report', label: 'Xem chi phí', description: 'Xem báo cáo chi phí phẫu thuật', category: 'Thống kê' },
  // ── Cấu hình ──
  { key: 'manage_norms', label: 'Quản lý định mức', description: 'Thay đổi định mức phụ cấp, thời gian', category: 'Cấu hình' },
  { key: 'manage_dmkt', label: 'Quản lý DMKT', description: 'Quản lý danh mục kỹ thuật, giá', category: 'Cấu hình' },
  { key: 'manage_staff', label: 'Quản lý nhân viên', description: 'Danh sách nhân viên, khoa phòng', category: 'Cấu hình' },
  // ── Quản trị ──
  { key: 'approve_users', label: 'Duyệt thành viên', description: 'Phê duyệt/từ chối tài khoản mới', category: 'Quản trị' },
  { key: 'manage_user_roles', label: 'Phân quyền', description: 'Thay đổi vai trò người dùng', category: 'Quản trị' },
  { key: 'disable_users', label: 'Khóa tài khoản', description: 'Vô hiệu hóa tài khoản người dùng', category: 'Quản trị' },
  { key: 'system_config', label: 'Cấu hình hệ thống', description: 'Bật/tắt phê duyệt, đăng nhập bắt buộc', category: 'Quản trị' },
];

/** Quyền mặc định cho mỗi role */
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  head: [
    'view_daily_report', 'view_monthly_report', 'edit_report',
    'import_excel', 'export_excel',
    'view_statistics', 'view_cost_report',
    'manage_staff',
    'approve_users',
  ],
  staff: [
    'view_daily_report', 'view_monthly_report', 'edit_report',
    'import_excel', 'export_excel',
    'view_statistics',
  ],
};

import { ref, onValue, set } from 'firebase/database';
import { db } from '../../lib/firebase';

const RolePermissionsSection: React.FC = () => {
  const [headPerms, setHeadPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.head);
  const [staffPerms, setStaffPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.staff);
  const [isSaving, setIsSaving] = useState(false);

  // Load permissions from Firebase
  useEffect(() => {
    const permRef = ref(db, 'role_permissions');
    const unsub = onValue(permRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.head) setHeadPerms(data.head);
        if (data.staff) setStaffPerms(data.staff);
      }
    });
    return () => unsub();
  }, []);

  const togglePermission = async (role: 'head' | 'staff', permKey: string) => {
    setIsSaving(true);
    const currentPerms = role === 'head' ? [...headPerms] : [...staffPerms];
    const idx = currentPerms.indexOf(permKey);

    if (idx >= 0) {
      currentPerms.splice(idx, 1);
    } else {
      currentPerms.push(permKey);
    }

    // If removing from head, also remove from staff
    let updatedStaffPerms = role === 'staff' ? currentPerms : [...staffPerms];
    if (role === 'head' && idx >= 0) {
      updatedStaffPerms = staffPerms.filter(p => p !== permKey);
    }

    try {
      await set(ref(db, 'role_permissions'), {
        head: role === 'head' ? currentPerms : headPerms,
        staff: updatedStaffPerms,
      });
    } catch (err) {
      console.error('Failed to save permissions:', err);
    }
    setIsSaving(false);
  };

  // Group permissions by category
  const categories = [...new Set(ALL_PERMISSIONS.map(p => p.category))];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary-600" />
          <h4 className="text-xs font-bold text-gray-800">Bảng phân quyền</h4>
        </div>
        {isSaving && (
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" /> Đang lưu...
          </span>
        )}
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="text-left px-3 py-2 font-semibold text-gray-600 w-[45%]">Quyền</th>
              <th className="text-center px-2 py-2 font-semibold w-[18%]">
                <div className="flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3 text-red-600" />
                  <span className="text-red-700">Admin</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 font-semibold w-[18%]">
                <div className="flex items-center justify-center gap-1">
                  <Building2 className="w-3 h-3 text-blue-600" />
                  <span className="text-blue-700">Trưởng khoa</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 font-semibold w-[18%]">
                <div className="flex items-center justify-center gap-1">
                  <UserCheck className="w-3 h-3 text-gray-600" />
                  <span className="text-gray-700">Nhân viên</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <React.Fragment key={cat}>
                {/* Category header */}
                <tr className="bg-gray-50/80">
                  <td colSpan={4} className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    {cat}
                  </td>
                </tr>
                {/* Permission rows */}
                {ALL_PERMISSIONS.filter(p => p.category === cat).map((perm) => {
                  const headHas = headPerms.includes(perm.key);
                  const staffHas = staffPerms.includes(perm.key);

                  return (
                    <tr key={perm.key} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-800">{perm.label}</p>
                        <p className="text-[10px] text-gray-400">{perm.description}</p>
                      </td>
                      {/* Admin: always ON */}
                      <td className="text-center px-2 py-2">
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100">
                          <CheckCircle2 className="w-4 h-4 text-red-600" />
                        </div>
                      </td>
                      {/* Head: toggleable */}
                      <td className="text-center px-2 py-2">
                        <button
                          onClick={() => togglePermission('head', perm.key)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
                            headHas
                              ? 'bg-blue-100 hover:bg-blue-200'
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          title={headHas ? `Tắt '${perm.label}' cho Trưởng khoa` : `Bật '${perm.label}' cho Trưởng khoa`}
                        >
                          {headHas
                            ? <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            : <XCircle className="w-4 h-4 text-gray-300" />}
                        </button>
                      </td>
                      {/* Staff: toggleable (but can't exceed head) */}
                      <td className="text-center px-2 py-2">
                        {headHas ? (
                          <button
                            onClick={() => togglePermission('staff', perm.key)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
                              staffHas
                                ? 'bg-emerald-100 hover:bg-emerald-200'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                            title={staffHas ? `Tắt '${perm.label}' cho Nhân viên` : `Bật '${perm.label}' cho Nhân viên`}
                          >
                            {staffHas
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              : <XCircle className="w-4 h-4 text-gray-300" />}
                          </button>
                        ) : (
                          <div
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-50"
                            title="Trưởng khoa không có quyền này → Nhân viên cũng không"
                          >
                            <XCircle className="w-4 h-4 text-gray-200" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-[10px] text-amber-700 flex items-start gap-1.5">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          <strong>Lưu ý:</strong> Admin luôn có toàn quyền. Trưởng khoa có thể thu hẹp (nhưng không mở rộng) quyền của nhân viên trong phạm vi admin cho phép. 
          Thay đổi tự động lưu.
        </span>
      </div>
    </div>
  );
};

