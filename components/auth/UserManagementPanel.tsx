// ─── User Management Panel ────────────────────────────────────────────────────
// Admin/Head panel tích hợp trong Tab Cấu hình
// Hiển thị danh sách users, approve/reject/disable, đổi role, phân quyền, gán khoa

import React, { useState, useEffect, useMemo } from 'react';
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
  RefreshCw,
  Building2,
  Bell,
  Pencil,
  X,
  Search,
  CheckCheck,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  KeyRound,
  Trash2,
  Edit2,
  Lock,
  Unlock,
  Globe,
} from 'lucide-react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useConfig } from '../../contexts/ConfigContext';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { AppUser, UserRole } from '../../types/auth';
import {
  subscribeToAllUsers,
  subscribeToDepartmentUsers,
  approveUser,
  disableUser,
  enableUser,
  changeUserRole,
  updateAuthConfig,
  saveDepartmentStaffPermissions,
  subscribeToDepartmentPermissions,
  updateUserProfile,
  deleteUser,
  resetUserPassword,
  rejectUser,
  batchApproveUsers,
} from '../../services/userManagementService';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveDepartmentStaffPermissions,
} from '../../services/permissionService';

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'head', label: 'Trưởng khoa', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'deputy_head', label: 'Phó khoa', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'staff', label: 'Nhân viên', color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Hoạt động', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pending: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  disabled: { label: 'Đã khóa', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

// ─── Helpers: Initials & Relative Time ────────────────────────────────────────

function getUserInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-slate-100 text-slate-700 border-slate-200',
  'bg-amber-100 text-amber-700 border-amber-200',
];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function formatRelativeTime(dateInput: Date | string | number | undefined): string {
  if (!dateInput) return '—';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 45) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay === 1) return `Hôm qua ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Pending Approval Card (Batch Approve, Inline Reject, Avatars) ───────────

interface PendingCardProps {
  pendingUsers: AppUser[];
  departments: string[];
  onApprove: (uid: string, dept?: string) => Promise<void> | void;
  onBatchApprove: (uids: string[], depts?: Record<string, string>) => Promise<void> | void;
  onReject: (uid: string) => Promise<void> | void;
  isAdmin: boolean;
}

const PendingApprovalSection: React.FC<PendingCardProps> = ({
  pendingUsers,
  departments,
  onApprove,
  onBatchApprove,
  onReject,
  isAdmin,
}) => {
  const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({});
  const [approvingUids, setApprovingUids] = useState<Set<string>>(new Set());
  const [isBatchApproving, setIsBatchApproving] = useState(false);
  const [rejectConfirmUid, setRejectConfirmUid] = useState<string | null>(null);

  if (pendingUsers.length === 0) return null;

  const handleSingleApprove = async (u: AppUser) => {
    setApprovingUids((prev) => new Set(prev).add(u.uid));
    try {
      await onApprove(u.uid, selectedDepts[u.uid] || u.department || undefined);
    } finally {
      setApprovingUids((prev) => {
        const next = new Set(prev);
        next.delete(u.uid);
        return next;
      });
    }
  };

  const handleBatch = async () => {
    setIsBatchApproving(true);
    try {
      await onBatchApprove(
        pendingUsers.map((u) => u.uid),
        selectedDepts
      );
    } finally {
      setIsBatchApproving(false);
    }
  };

  return (
    <div className="border border-amber-300 bg-amber-50/70 rounded-2xl overflow-hidden shadow-xs animate-fade-in">
      <div className="px-4 py-3 bg-gradient-to-r from-amber-100/90 to-amber-50/80 border-b border-amber-200 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="relative p-1.5 bg-amber-200/80 rounded-lg text-amber-800">
            <Bell className="w-4 h-4 text-amber-800" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
              {pendingUsers.length}
            </span>
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span>{pendingUsers.length} tài khoản đang chờ phê duyệt</span>
              <span className="text-[10px] font-normal text-amber-700">
                ({isAdmin ? 'Toàn bệnh viện' : 'Thuộc khoa của bạn'})
              </span>
            </h4>
            <p className="text-[11px] text-amber-800/80">
              Kiểm tra thông tin và phê duyệt để cấp quyền sử dụng hệ thống
            </p>
          </div>
        </div>

        {/* Batch approve button */}
        {pendingUsers.length > 1 && (
          <button
            onClick={handleBatch}
            disabled={isBatchApproving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-60"
            title="Duyệt tất cả các tài khoản đang chờ"
          >
            {isBatchApproving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            <span>Duyệt tất cả ({pendingUsers.length})</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-amber-200/70">
        {pendingUsers.map((u) => {
          const isApproving = approvingUids.has(u.uid);
          const initials = getUserInitials(u.displayName || u.nickname);
          const avatarColor = getAvatarColor(u.nickname);

          return (
            <div
              key={u.uid}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-amber-100/40 transition-colors"
            >
              {/* User Identity & Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${avatarColor}`}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-gray-900 text-xs">
                      {u.nickname}
                    </span>
                    <span className="text-[10px] text-gray-400">·</span>
                    <span className="text-xs font-semibold text-gray-800 truncate">
                      {u.displayName}
                    </span>
                    {u.department && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200 font-semibold">
                        <Building2 className="w-2.5 h-2.5" />
                        {u.department}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                    <span>Đăng ký: {formatRelativeTime(u.createdAt)}</span>
                    {u.email && <span>· {u.email}</span>}
                  </div>
                </div>
              </div>

              {/* Department selector (Admin can assign/change department before approving) & Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {isAdmin && (
                  <select
                    value={selectedDepts[u.uid] || u.department || ''}
                    onChange={(e) =>
                      setSelectedDepts((prev) => ({ ...prev, [u.uid]: e.target.value }))
                    }
                    className="text-xs px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white text-gray-800 focus:ring-1 focus:ring-blue-500 outline-none w-40"
                  >
                    <option value="">-- Gán khoa --</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}

                {/* Inline Reject Confirmation */}
                {rejectConfirmUid === u.uid ? (
                  <div className="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-lg border border-red-200 animate-fade-in">
                    <span className="text-[10px] text-red-700 font-bold">Từ chối?</span>
                    <button
                      onClick={() => {
                        onReject(u.uid);
                        setRejectConfirmUid(null);
                      }}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded cursor-pointer"
                    >
                      Xác nhận
                    </button>
                    <button
                      onClick={() => setRejectConfirmUid(null)}
                      className="px-1.5 py-1 bg-white hover:bg-gray-100 text-gray-600 text-[10px] rounded border border-gray-300 cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleSingleApprove(u)}
                      disabled={isApproving || isBatchApproving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50"
                      title="Duyệt tài khoản"
                    >
                      {isApproving ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                      <span>Duyệt</span>
                    </button>
                    <button
                      onClick={() => setRejectConfirmUid(u.uid)}
                      disabled={isApproving || isBatchApproving}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-200 hover:border-red-300 transition-all cursor-pointer disabled:opacity-50"
                      title="Từ chối tài khoản"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Từ chối</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Inline Edit Cell ─────────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => void;
  type?: 'text' | 'select';
  options?: string[];
  placeholder?: string;
  disabled?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onSave,
  type = 'text',
  options = [],
  placeholder,
  disabled,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (disabled || !editing) {
    return (
      <div
        className={`group flex items-center gap-1 ${
          disabled ? '' : 'cursor-pointer hover:bg-blue-50/50 rounded px-1 -mx-1'
        }`}
        onClick={() => !disabled && setEditing(true)}
        title={disabled ? undefined : 'Bấm để sửa'}
      >
        <span>{value || <span className="italic text-gray-400">—</span>}</span>
        {!disabled && (
          <Pencil className="w-2.5 h-2.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    );
  }

  const handleSave = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      {type === 'select' ? (
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onBlur={handleSave}
          className="text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none"
        >
          <option value="">-- Chọn --</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={placeholder}
          className="text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none w-full"
        />
      )}
    </div>
  );
};

// ─── Main Panel ──────────────────────────────────────────────────────────────

export interface UserManagementPanelProps {
  activeSubTab?: 'accounts' | 'permissions';
  onSubTabChange?: (tab: 'accounts' | 'permissions') => void;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  activeSubTab: propSubTab,
  onSubTabChange,
}) => {
  const { user: currentUser, authConfig, isAdmin, isHead, isDeputyHead } = useAuth();
  const { config } = useConfig();
  const departments = config.departments || [];
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [internalSubTab, setInternalSubTab] = useState<'accounts' | 'permissions'>('accounts');
  const currentSubTab = propSubTab ?? internalSubTab;
  const setSubTab = (tab: 'accounts' | 'permissions') => {
    setInternalSubTab(tab);
    onSubTabChange?.(tab);
  };

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'disabled'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // User Management Modals State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editFormData, setEditFormData] = useState<{ displayName: string; department: string; role: UserRole }>({
    displayName: '',
    department: '',
    role: 'staff',
  });
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AppUser | null>(null);
  const [resetPasswordConfirmUser, setResetPasswordConfirmUser] = useState<AppUser | null>(null);

  // Subscribe to users list (Admin: all users; Head & Deputy Head: users in own department)
  useEffect(() => {
    if (!isAdmin && !isHead && !isDeputyHead) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    if (isAdmin) {
      const unsub = subscribeToAllUsers((data) => {
        setUsers(data);
        setIsLoading(false);
      });
      return () => unsub();
    } else if ((isHead || isDeputyHead) && currentUser?.department) {
      const unsub = subscribeToDepartmentUsers(currentUser.department, (data) => {
        setUsers(data);
        setIsLoading(false);
      });
      return () => unsub();
    } else {
      setUsers([]);
      setIsLoading(false);
    }
  }, [isAdmin, isHead, isDeputyHead, currentUser?.department]);

  // Auto-clear action messages
  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  // Derived counts
  const pendingUsers = useMemo(() => users.filter((u) => u.status === 'pending'), [users]);
  const activeUsers = useMemo(() => users.filter((u) => u.status === 'active'), [users]);
  const disabledUsers = useMemo(() => users.filter((u) => u.status === 'disabled'), [users]);

  // Filtered users for the table
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Status filter
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      // Department filter (Admin only)
      if (isAdmin && deptFilter !== 'all' && u.department !== deptFilter) return false;
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesNick = u.nickname.toLowerCase().includes(term);
        const matchesName = u.displayName.toLowerCase().includes(term);
        const matchesDept = u.department?.toLowerCase().includes(term);
        if (!matchesNick && !matchesName && !matchesDept) return false;
      }
      return true;
    });
  }, [users, statusFilter, deptFilter, searchTerm, isAdmin]);

  if (!isAdmin && !isHead) return null;

  const showMsg = (type: 'success' | 'error', text: string) => setActionMsg({ type, text });

  const handleApprove = async (uid: string, dept?: string) => {
    if (dept) {
      await updateUserProfile(uid, { department: dept });
    }
    const res = await approveUser(uid);
    showMsg(
      res.success ? 'success' : 'error',
      res.success ? 'Đã duyệt tài khoản thành công.' : res.error || 'Lỗi khi duyệt tài khoản.'
    );
  };

  const handleBatchApprove = async (uids: string[], depts?: Record<string, string>) => {
    const res = await batchApproveUsers(uids, depts);
    showMsg(
      res.success ? 'success' : 'error',
      res.success ? `Đã duyệt thành công ${res.count} tài khoản.` : res.error || 'Lỗi khi duyệt hàng loạt.'
    );
  };

  const handleReject = async (uid: string) => {
    const res = await rejectUser(uid);
    showMsg(res.success ? 'success' : 'error', res.success ? 'Đã từ chối tài khoản.' : res.error || 'Lỗi.');
  };

  const handleDisable = async (uid: string) => {
    if (uid === currentUser?.uid) {
      showMsg('error', 'Không thể khóa tài khoản của chính mình!');
      return;
    }
    const res = await disableUser(uid);
    showMsg(
      res.success ? 'success' : 'error',
      res.success ? 'Đã khóa tài khoản.' : res.error || 'Lỗi khi khóa tài khoản.'
    );
  };

  const handleEnable = async (uid: string) => {
    const res = await enableUser(uid);
    showMsg(
      res.success ? 'success' : 'error',
      res.success ? 'Đã mở khóa tài khoản.' : res.error || 'Lỗi khi mở khóa.'
    );
  };

  const handleRoleChange = async (uid: string, role: UserRole) => {
    if (uid === currentUser?.uid) {
      showMsg('error', 'Không thể thay đổi vai trò của chính mình!');
      return;
    }
    const targetUser = users.find((u) => u.uid === uid);
    if (!isAdmin) {
      if (!isHead) {
        showMsg('error', 'Bạn không có quyền thay đổi vai trò người dùng!');
        return;
      }
      // Trưởng khoa chỉ có thể phân vai trò Phó khoa hoặc Nhân viên cho người trong khoa
      if (
        !targetUser ||
        targetUser.department !== currentUser?.department ||
        targetUser.role === 'admin' ||
        targetUser.role === 'head' ||
        (role !== 'deputy_head' && role !== 'staff')
      ) {
        showMsg('error', 'Trưởng khoa chỉ có thể gán vai trò Phó khoa hoặc Nhân viên trong khoa của mình!');
        return;
      }
    }
    const res = await changeUserRole(uid, role);
    showMsg(
      res.success ? 'success' : 'error',
      res.success
        ? `Đã thay đổi vai trò thành "${ROLE_OPTIONS.find((r) => r.value === role)?.label}".`
        : res.error || 'Lỗi khi thay đổi vai trò.'
    );
  };

  const handleUpdateDepartment = async (uid: string, dept: string) => {
    const res = await updateUserProfile(uid, { department: dept });
    showMsg(res.success ? 'success' : 'error', res.success ? 'Đã cập nhật khoa.' : res.error || 'Lỗi.');
  };

  const handleUpdateDisplayName = async (uid: string, name: string) => {
    if (!name.trim()) return;
    const res = await updateUserProfile(uid, { displayName: name.trim() });
    showMsg(res.success ? 'success' : 'error', res.success ? 'Đã cập nhật tên hiển thị.' : res.error || 'Lỗi.');
  };

  const openEditModal = (u: AppUser) => {
    setEditingUser(u);
    setEditFormData({
      displayName: u.displayName || u.nickname,
      department: u.department || '',
      role: u.role,
    });
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    if (!editFormData.displayName.trim()) {
      showMsg('error', 'Họ và tên không được để trống!');
      return;
    }
    const updates: { displayName: string; department?: string; role?: UserRole } = {
      displayName: editFormData.displayName.trim(),
      department: editFormData.department,
    };
    const canChangeRoleInEdit =
      (isAdmin && editingUser.uid !== currentUser?.uid) ||
      (isHead &&
        editingUser.uid !== currentUser?.uid &&
        editingUser.department === currentUser?.department &&
        editingUser.role !== 'admin' &&
        editingUser.role !== 'head' &&
        (editFormData.role === 'deputy_head' || editFormData.role === 'staff'));

    if (canChangeRoleInEdit) {
      updates.role = editFormData.role;
    }
    const res = await updateUserProfile(editingUser.uid, updates);
    if (res.success) {
      showMsg('success', `Đã cập nhật thông tin tài khoản "${editingUser.nickname}" thành công!`);
      setEditingUser(null);
    } else {
      showMsg('error', res.error || 'Lỗi khi cập nhật thông tin người dùng.');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    if (deleteConfirmUser.uid === currentUser?.uid) {
      showMsg('error', 'Không thể xóa tài khoản của chính mình!');
      setDeleteConfirmUser(null);
      return;
    }
    const res = await deleteUser(deleteConfirmUser.uid);
    if (res.success) {
      showMsg('success', `Đã xóa tài khoản "${deleteConfirmUser.displayName || deleteConfirmUser.nickname}" thành công!`);
    } else {
      showMsg('error', res.error || 'Lỗi khi xóa người dùng.');
    }
    setDeleteConfirmUser(null);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordConfirmUser) return;
    const res = await resetUserPassword(resetPasswordConfirmUser.uid);
    if (res.success) {
      showMsg('success', `Đã đặt lại mật khẩu của "${resetPasswordConfirmUser.displayName || resetPasswordConfirmUser.nickname}" về "123456" thành công!`);
    } else {
      showMsg('error', res.error || 'Lỗi khi đặt lại mật khẩu.');
    }
    setResetPasswordConfirmUser(null);
  };

  const handleToggleApproval = async () => {
    const newVal = !authConfig.requireApproval;
    const res = await updateAuthConfig({ requireApproval: newVal });
    showMsg(
      res.success ? 'success' : 'error',
      res.success
        ? newVal
          ? 'Đã BẬT phê duyệt thành viên mới.'
          : 'Đã TẮT phê duyệt — thành viên mới sẽ được kích hoạt ngay.'
        : res.error || 'Lỗi.'
    );
  };

  const handleToggleRequireLogin = async () => {
    const newVal = !authConfig.requireLogin;
    const res = await updateAuthConfig({ requireLogin: newVal });
    showMsg(
      res.success ? 'success' : 'error',
      res.success
        ? newVal
          ? 'Đã BẬT bắt buộc đăng nhập — Guest sẽ bị chặn.'
          : 'Đã TẮT bắt buộc đăng nhập — Guest có thể dùng app.'
        : res.error || 'Lỗi.'
    );
  };

  // ─── If Head has NO department assigned (Task 8.4) ─────────────────────────
  if (isHead && !isAdmin && !currentUser?.department) {
    return (
      <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl space-y-3 shadow-xs">
        <div className="flex items-center gap-2.5 text-amber-800">
          <div className="p-2 bg-amber-200/80 rounded-xl">
            <Building2 className="w-5 h-5 text-amber-800" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-amber-950">Tài khoản Trưởng khoa chưa được phân bổ Khoa</h3>
            <p className="text-xs text-amber-800">Vui lòng liên hệ Quản trị viên (Admin) để thiết lập</p>
          </div>
        </div>
        <p className="text-xs text-amber-900/80 leading-relaxed pl-10">
          Tài khoản của bạn đã được cấp quyền <strong>Trưởng khoa</strong>, tuy nhiên hệ thống chưa ghi nhận Khoa trực thuộc của bạn.
          Sau khi Quản trị viên chỉ định Khoa trong danh sách người dùng, bạn sẽ có thể phê duyệt thành viên và điều chỉnh phân quyền nhân viên cho khoa mình.
        </p>
      </div>
    );
  }

  // ─── Render user table rows ─────────────────────────────────────────────────
  const renderUserRow = (u: AppUser) => {
    const statusInfo = STATUS_CONFIG[u.status] || STATUS_CONFIG.pending;
    const StatusIcon = statusInfo.icon;
    const isCurrentUser = u.uid === currentUser?.uid;
    const initials = getUserInitials(u.displayName || u.nickname);
    const avatarColor = getAvatarColor(u.nickname);

    return (
      <tr
        key={u.uid}
        className={`hover:bg-gray-50/70 transition-colors ${
          isCurrentUser ? 'bg-blue-50/30' : ''
        }`}
      >
        {/* User Monogram + Nickname */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 border ${avatarColor}`}
            >
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-gray-900 text-xs">
                  {u.nickname}
                </span>
                {isCurrentUser && (
                  <span className="text-[9px] bg-primary-100 text-primary-700 px-1.5 py-0.2 rounded-full font-bold">
                    BẠN
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 block">{formatRelativeTime(u.createdAt)}</span>
            </div>
          </div>
        </td>

        {/* Display Name (Editable) */}
        <td className="px-3 py-2.5 text-gray-700 font-medium">
          <EditableCell
            value={u.displayName}
            onSave={(v) => handleUpdateDisplayName(u.uid, v)}
            disabled={isCurrentUser || (!isAdmin && !isHead)}
            placeholder="Tên hiển thị"
          />
        </td>

        {/* Department */}
        <td className="px-3 py-2.5 text-gray-600">
          {isAdmin ? (
            <EditableCell
              value={u.department}
              onSave={(v) => handleUpdateDepartment(u.uid, v)}
              type="select"
              options={departments}
              disabled={isCurrentUser}
            />
          ) : (
            <span className="inline-flex items-center gap-1 text-xs">
              <Building2 className="w-3 h-3 text-gray-400" />
              {u.department || '—'}
            </span>
          )}
        </td>

        {/* Role */}
        <td className="px-3 py-2.5 text-center">
          {isCurrentUser ? (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                ROLE_OPTIONS.find((r) => r.value === u.role)?.color || ''
              }`}
            >
              {ROLE_OPTIONS.find((r) => r.value === u.role)?.label}
            </span>
          ) : isAdmin ? (
            <select
              value={u.role}
              onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
              className="text-xs font-medium px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-50 hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-colors cursor-pointer text-gray-800 shadow-2xs"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : isHead && u.department === currentUser?.department && u.role !== 'admin' && u.role !== 'head' ? (
            <select
              value={u.role}
              onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
              className="text-xs font-medium px-2.5 py-1.5 border border-sky-200 rounded-lg bg-sky-50/50 hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-colors cursor-pointer text-gray-800 shadow-2xs"
              title="Trưởng khoa có thể phân vai trò Phó khoa hoặc Nhân viên"
            >
              <option value="deputy_head">Phó khoa</option>
              <option value="staff">Nhân viên</option>
            </select>
          ) : (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                ROLE_OPTIONS.find((r) => r.value === u.role)?.color || 'bg-gray-100 text-gray-700 border-gray-200'
              }`}
            >
              {ROLE_OPTIONS.find((r) => r.value === u.role)?.label}
            </span>
          )}
        </td>

        {/* Status */}
        <td className="px-3 py-2.5 text-center">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.color}`}
          >
            <StatusIcon className="w-3 h-3" />
            {statusInfo.label}
          </span>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {/* Sửa thông tin tài khoản */}
            <button
              onClick={() => openEditModal(u)}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors cursor-pointer"
              title="Sửa thông tin tài khoản (Họ tên, Khoa, Vai trò)"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            {/* Đặt lại mật khẩu về 123456 */}
            <button
              onClick={() => setResetPasswordConfirmUser(u)}
              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors cursor-pointer"
              title="Đặt lại mật khẩu về 123456"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>

            {/* Khóa / Mở khóa tài khoản */}
            {u.status === 'active' && !isCurrentUser && (
              <button
                onClick={() => handleDisable(u.uid)}
                className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors cursor-pointer"
                title="Khóa tài khoản"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            )}
            {u.status === 'disabled' && (
              <button
                onClick={() => handleEnable(u.uid)}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors cursor-pointer"
                title="Mở khóa tài khoản"
              >
                <Unlock className="w-3.5 h-3.5" />
              </button>
            )}
            {u.status === 'pending' && (
              <button
                onClick={() => handleApprove(u.uid)}
                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors cursor-pointer"
                title="Duyệt tài khoản này"
              >
                <UserCheck className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Xóa tài khoản vĩnh viễn (Admin only) */}
            {!isCurrentUser && isAdmin && (
              <button
                onClick={() => setDeleteConfirmUser(u)}
                className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors cursor-pointer"
                title="Xóa tài khoản vĩnh viễn"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Standalone fallback tabs (when rendered without parent TabLine) */}
      {!propSubTab && (
        <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
          <button
            type="button"
            onClick={() => setSubTab('accounts')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentSubTab === 'accounts'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200/80'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Quản lý tài khoản {pendingUsers.length > 0 && `(${pendingUsers.length})`}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('permissions')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentSubTab === 'permissions'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200/80'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Cấu hình phân quyền
          </button>
        </div>
      )}

      {/* ─── Action Alert Toast ──────────────────────────────────────────────── */}
      {actionMsg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2.5 animate-fade-in ${
            actionMsg.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {actionMsg.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          <span className="font-medium">{actionMsg.text}</span>
        </div>
      )}

      {/* ─── SUBTAB: QUẢN LÝ TÀI KHOẢN ───────────────────────────────────────── */}
      {currentSubTab === 'accounts' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* ─── Hero Header & Metric Cards (Tasks 8.1 & 8.4) ─────────────────────── */}
          {(isHead || isDeputyHead) && !isAdmin && currentUser?.department ? (
        <div className="bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-white border border-blue-200 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-900">
                    Khoa {currentUser.department}
                  </h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                    {isHead ? 'Trưởng khoa phụ trách' : 'Phó khoa phụ trách'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Quản lý nhân sự, phê duyệt thành viên mới và thiết lập trần quyền nhân viên khoa
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-gray-500">{isHead ? 'Trưởng khoa:' : 'Phó khoa:'}</span>{' '}
              <span className="text-xs font-bold text-gray-800">
                {currentUser.displayName || currentUser.nickname}
              </span>
            </div>
          </div>

          {/* 4 Metric Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5">
            <div className="bg-white/80 border border-blue-100 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Tổng nhân sự</span>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">{users.length}</p>
            </div>

            <div className="bg-white/80 border border-emerald-100 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-emerald-600">Đang hoạt động</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-lg font-bold text-emerald-700 mt-1">{activeUsers.length}</p>
            </div>

            <div
              className={`bg-white/80 border rounded-xl p-3 shadow-xs ${
                pendingUsers.length > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-amber-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-medium ${
                    pendingUsers.length > 0 ? 'text-amber-700 font-bold' : 'text-amber-600'
                  }`}
                >
                  Chờ duyệt
                </span>
                <Clock
                  className={`w-4 h-4 ${
                    pendingUsers.length > 0 ? 'text-amber-600 animate-pulse' : 'text-amber-400'
                  }`}
                />
              </div>
              <p
                className={`text-lg font-bold mt-1 ${
                  pendingUsers.length > 0 ? 'text-amber-700' : 'text-gray-800'
                }`}
              >
                {pendingUsers.length}
              </p>
            </div>

            <div className="bg-white/80 border border-gray-100 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Đã khóa / Tạm dừng</span>
                <UserX className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">{disabledUsers.length}</p>
            </div>
          </div>
        </div>
      ) : (
        /* Admin Header & Metric Cards */
        <div className="bg-gradient-to-r from-slate-50 via-gray-50 to-white border border-gray-200 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-xs">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900">Quản trị Người dùng & Phân quyền</h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 border border-red-200">
                    Toàn hệ thống
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Quản lý tài khoản toàn viện, phân bổ khoa, vai trò và trần quyền hệ thống
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5">
            <div className="bg-white/80 border border-gray-200 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Tổng tài khoản</span>
                <Users className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">{users.length}</p>
            </div>

            <div className="bg-white/80 border border-emerald-100 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-emerald-600">Đang hoạt động</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-lg font-bold text-emerald-700 mt-1">{activeUsers.length}</p>
            </div>

            <div
              className={`bg-white/80 border rounded-xl p-3 shadow-xs ${
                pendingUsers.length > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-amber-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-medium ${
                    pendingUsers.length > 0 ? 'text-amber-700 font-bold' : 'text-amber-600'
                  }`}
                >
                  Chờ phê duyệt
                </span>
                <Clock
                  className={`w-4 h-4 ${
                    pendingUsers.length > 0 ? 'text-amber-600 animate-pulse' : 'text-amber-400'
                  }`}
                />
              </div>
              <p
                className={`text-lg font-bold mt-1 ${
                  pendingUsers.length > 0 ? 'text-amber-700' : 'text-gray-800'
                }`}
              >
                {pendingUsers.length}
              </p>
            </div>

            <div className="bg-white/80 border border-gray-200 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-500">Đã khóa</span>
                <UserX className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-lg font-bold text-gray-800 mt-1">{disabledUsers.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Config Toggles (Admin Only) ─────────────────────────────────────── */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleToggleApproval}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              authConfig.requireApproval
                ? 'bg-primary-50/80 border-primary-200 text-primary-800'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            {authConfig.requireApproval ? (
              <ToggleRight className="w-5 h-5 text-primary-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-gray-400" />
            )}
            <div className="text-left">
              <p className="font-semibold text-gray-900">Phê duyệt thành viên mới</p>
              <p className="text-[10px] text-gray-500">
                {authConfig.requireApproval
                  ? 'Đang BẬT — Đăng ký mới cần phê duyệt'
                  : 'Đang TẮT — Đăng ký mới tự kích hoạt'}
              </p>
            </div>
          </button>

          <button
            onClick={handleToggleRequireLogin}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              authConfig.requireLogin
                ? 'bg-red-50/80 border-red-200 text-red-800'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            {authConfig.requireLogin ? (
              <ToggleRight className="w-5 h-5 text-red-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-gray-400" />
            )}
            <div className="text-left">
              <p className="font-semibold text-gray-900">Bắt buộc đăng nhập</p>
              <p className="text-[10px] text-gray-500">
                {authConfig.requireLogin
                  ? 'Đang BẬT — Chặn khách không đăng nhập'
                  : 'Đang TẮT — Khách có thể xem tự do'}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ─── Pending Approval Section (Task 9.2) ─────────────────────────────── */}
      <PendingApprovalSection
        pendingUsers={pendingUsers}
        departments={departments}
        onApprove={handleApprove}
        onBatchApprove={handleBatchApprove}
        onReject={handleReject}
        isAdmin={isAdmin}
      />

      {/* ─── Search & Status Filters Bar (Task 8.2) ──────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo nickname, tên hiển thị hoặc khoa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department filter (Admin only) */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="all">Tất cả khoa, phòng</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-gray-100">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'all'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-500 hover:bg-gray-50 border border-transparent'
            }`}
          >
            Tất cả ({users.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'active'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'text-gray-500 hover:bg-gray-50 border border-transparent'
            }`}
          >
            Đang hoạt động ({activeUsers.length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'pending'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'text-gray-500 hover:bg-gray-50 border border-transparent'
            }`}
          >
            Chờ duyệt ({pendingUsers.length})
          </button>
          <button
            onClick={() => setStatusFilter('disabled')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'disabled'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'text-gray-500 hover:bg-gray-50 border border-transparent'
            }`}
          >
            Đã khóa ({disabledUsers.length})
          </button>
        </div>
      </div>

      {/* ─── Users Table ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Đang tải danh sách nhân sự...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-10 bg-white border border-gray-200 rounded-xl text-gray-400 text-xs space-y-2">
          <Users className="w-8 h-8 text-gray-300 mx-auto" />
          <p>
            {searchTerm || statusFilter !== 'all' || deptFilter !== 'all'
              ? 'Không tìm thấy tài khoản nào khớp với bộ lọc.'
              : isAdmin
              ? 'Chưa có người dùng nào đăng ký.'
              : `Chưa có nhân viên nào thuộc khoa ${currentUser?.department || ''}.`}
          </p>
          {(searchTerm || statusFilter !== 'all' || deptFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setDeptFilter('all');
              }}
              className="text-blue-600 hover:underline text-xs font-semibold cursor-pointer"
            >
              Xóa bộ lọc tìm kiếm
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 bg-white rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Thành viên</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Tên hiển thị</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Khoa trực thuộc</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Vai trò</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Trạng thái</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(renderUserRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      )}

      {/* ─── SUBTAB: CẤU HÌNH PHÂN QUYỀN ────────────────────────────────────── */}
      {currentSubTab === 'permissions' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <RolePermissionsSection
            isAdmin={isAdmin}
            isHead={isHead}
            isDeputyHead={isDeputyHead}
            department={currentUser?.department || ''}
          />
        </div>
      )}

      {/* ─── Modal Chỉnh sửa thông tin tài khoản ───────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Sửa thông tin nhân sự</h3>
                  <p className="text-xs text-gray-500">Tài khoản: <span className="font-semibold text-gray-700">@{editingUser.nickname}</span></p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Họ và tên đầy đủ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.displayName}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 focus:bg-white transition-all outline-none"
                  placeholder="Ví dụ: BSCKII. Nguyễn Văn A"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Khoa / Phòng trực thuộc
                </label>
                <select
                  value={editFormData.department}
                  onChange={(e) => setEditFormData((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 focus:bg-white transition-all outline-none"
                >
                  <option value="">-- Chưa gán khoa phòng --</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role selection in modal: Admin can select any role; Head can select deputy_head or staff for own dept members */}
              {((isAdmin && editingUser.uid !== currentUser?.uid) ||
                (isHead &&
                  editingUser.uid !== currentUser?.uid &&
                  editingUser.department === currentUser?.department &&
                  editingUser.role !== 'admin' &&
                  editingUser.role !== 'head')) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Vai trò hệ thống
                  </label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData((prev) => ({ ...prev, role: e.target.value as UserRole }))}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/50 focus:bg-white transition-all outline-none"
                  >
                    {isAdmin
                      ? ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))
                      : [
                          { value: 'deputy_head', label: 'Phó khoa' },
                          { value: 'staff', label: 'Nhân viên' },
                        ].map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                  </select>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200/60 rounded-lg transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveEditUser}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs hover:shadow-sm transition-all cursor-pointer"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm Dialog: Xóa tài khoản ──────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteConfirmUser}
        title="Xác nhận xóa tài khoản"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${deleteConfirmUser?.displayName || deleteConfirmUser?.nickname}" (@${deleteConfirmUser?.nickname})? Thao tác này không thể hoàn tác.`}
        confirmLabel="Xóa tài khoản"
        cancelLabel="Hủy bỏ"
        variant="danger"
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteConfirmUser(null)}
      />

      {/* ─── Confirm Dialog: Đặt lại mật khẩu ───────────────────────────── */}
      <ConfirmDialog
        isOpen={!!resetPasswordConfirmUser}
        title="Đặt lại mật khẩu về 123456"
        message={`Mật khẩu của tài khoản "${resetPasswordConfirmUser?.displayName || resetPasswordConfirmUser?.nickname}" (@${resetPasswordConfirmUser?.nickname}) sẽ được đặt lại về mặc định là "123456". Bạn có chắc chắn muốn thực hiện?`}
        confirmLabel="Đặt lại mật khẩu"
        cancelLabel="Hủy bỏ"
        variant="info"
        onConfirm={handleResetPassword}
        onCancel={() => setResetPasswordConfirmUser(null)}
      />
    </div>
  );
};

// ─── Role Permissions Matrix (Task 8.3) ───────────────────────────────────────

interface RolePermissionsSectionProps {
  isAdmin: boolean;
  isHead: boolean;
  isDeputyHead?: boolean;
  department?: string;
}

const RolePermissionsSection: React.FC<RolePermissionsSectionProps> = ({
  isAdmin,
  isHead,
  isDeputyHead = false,
  department = '',
}) => {
  const [headPerms, setHeadPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.head);
  const [deputyHeadPerms, setDeputyHeadPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.deputy_head);
  const [staffPerms, setStaffPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.staff);
  const [guestPerms, setGuestPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.guest);
  const [deptStaffPerms, setDeptStaffPerms] = useState<string[]>(DEFAULT_ROLE_PERMISSIONS.staff);
  const [isSaving, setIsSaving] = useState(false);

  // Load global role permissions from Firebase
  useEffect(() => {
    const permRef = ref(db, 'role_permissions');
    const unsub = onValue(permRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.head) setHeadPerms(data.head);
        if (data.deputy_head) setDeputyHeadPerms(data.deputy_head);
        if (data.staff) setStaffPerms(data.staff);
        if (data.guest) setGuestPerms(data.guest);
      }
    });
    return () => unsub();
  }, []);

  // Load department-specific staff permissions (for Head)
  useEffect(() => {
    if (!department) return;
    const unsub = subscribeToDepartmentPermissions(department, (customPerms) => {
      if (customPerms !== null) {
        setDeptStaffPerms(resolveDepartmentStaffPermissions(staffPerms, customPerms));
      } else {
        setDeptStaffPerms([...staffPerms]);
      }
    });
    return () => unsub();
  }, [department, staffPerms]);

  // Admin toggling global role permissions
  const toggleGlobalPermission = async (role: 'head' | 'deputy_head' | 'staff' | 'guest', permKey: string) => {
    setIsSaving(true);
    let currentPerms: string[];
    if (role === 'head') currentPerms = [...headPerms];
    else if (role === 'deputy_head') currentPerms = [...deputyHeadPerms];
    else if (role === 'staff') currentPerms = [...staffPerms];
    else currentPerms = [...guestPerms];

    const idx = currentPerms.indexOf(permKey);
    if (idx >= 0) {
      currentPerms.splice(idx, 1);
    } else {
      currentPerms.push(permKey);
    }

    const nextHead = role === 'head' ? currentPerms : headPerms;
    const nextDeputyHead = role === 'deputy_head' ? currentPerms : deputyHeadPerms;
    let nextStaff = role === 'staff' ? currentPerms : [...staffPerms];
    const nextGuest = role === 'guest' ? currentPerms : guestPerms;

    if (role === 'head' && idx >= 0) {
      nextStaff = staffPerms.filter((p) => p !== permKey);
    }

    try {
      await set(ref(db, 'role_permissions'), {
        head: nextHead,
        deputy_head: nextDeputyHead,
        staff: nextStaff,
        guest: nextGuest,
      });
    } catch (err) {
      console.error('Failed to save permissions:', err);
    }
    setIsSaving(false);
  };

  // Head toggling staff permission for own department
  const toggleDepartmentPermission = async (permKey: string) => {
    if (!department || !staffPerms.includes(permKey)) return;
    setIsSaving(true);

    const exists = deptStaffPerms.includes(permKey);
    const nextPerms = exists
      ? deptStaffPerms.filter((p) => p !== permKey)
      : [...deptStaffPerms, permKey];

    const safePerms = resolveDepartmentStaffPermissions(staffPerms, nextPerms);
    setDeptStaffPerms(safePerms);

    try {
      await saveDepartmentStaffPermissions(department, safePerms);
    } catch (err) {
      console.error('Failed to save department permissions:', err);
    }
    setIsSaving(false);
  };

  // Head Quick Action: Grant all ceiling permissions
  const handleGrantAllCeiling = async () => {
    if (!department) return;
    setIsSaving(true);
    const safePerms = resolveDepartmentStaffPermissions(staffPerms, staffPerms);
    setDeptStaffPerms(safePerms);
    try {
      await saveDepartmentStaffPermissions(department, safePerms);
    } catch (err) {
      console.error('Failed to grant all ceiling permissions:', err);
    }
    setIsSaving(false);
  };

  // Head Quick Action: Reset to default staff permissions
  const handleResetToDefault = async () => {
    if (!department) return;
    setIsSaving(true);
    const safePerms = resolveDepartmentStaffPermissions(staffPerms, DEFAULT_ROLE_PERMISSIONS.staff);
    setDeptStaffPerms(safePerms);
    try {
      await saveDepartmentStaffPermissions(department, safePerms);
    } catch (err) {
      console.error('Failed to reset department permissions:', err);
    }
    setIsSaving(false);
  };

  const categories = [...new Set(ALL_PERMISSIONS.map((p) => p.category))];

  // ─── Head / Deputy Head Mode View (Scoped to department) ───────────────────
  if ((isHead || isDeputyHead) && !isAdmin) {
    return (
      <div className="border border-blue-200 bg-white rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50/90 to-sky-50/60 border-b border-blue-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-gray-900">
                Phân quyền Nhân viên — Khoa {department || 'Chưa gán khoa'}
              </h4>
              <p className="text-[10px] text-gray-500">
                Điều chỉnh quyền nhân viên trong khoa dựa trên trần quyền do Admin quy định
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSaving ? (
              <span className="text-[10px] text-blue-600 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Đang lưu...
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleGrantAllCeiling}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors cursor-pointer"
                  title="Cấp toàn bộ quyền mà Admin đã cho phép cho nhân viên khoa"
                >
                  <Sparkles className="w-3 h-3" />
                  Cấp tối đa theo trần
                </button>
                <button
                  onClick={handleResetToDefault}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors cursor-pointer"
                  title="Đặt lại các quyền về mặc định"
                >
                  <RotateCcw className="w-3 h-3" />
                  Mặc định
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="text-left px-3.5 py-2 font-semibold text-gray-600 w-[50%]">Chức năng & Quyền hạn</th>
                <th className="text-center px-2 py-2 font-semibold w-[25%]">
                  <div className="flex items-center justify-center gap-1">
                    <Shield className="w-3 h-3 text-red-600" />
                    <span className="text-gray-700">Trần quyền Admin</span>
                  </div>
                </th>
                <th className="text-center px-2 py-2 font-semibold w-[25%]">
                  <div className="flex items-center justify-center gap-1">
                    <UserCheck className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Áp dụng cho Khoa</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const categoryPerms = ALL_PERMISSIONS.filter((p) => p.category === cat);
                const activeInCatCount = categoryPerms.filter(
                  (p) => deptStaffPerms.includes(p.key) && staffPerms.includes(p.key)
                ).length;

                return (
                  <React.Fragment key={cat}>
                    <tr className="bg-gray-50/80 border-y border-gray-100">
                      <td colSpan={3} className="px-3.5 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                            {cat}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700">
                            {activeInCatCount}/{categoryPerms.length} quyền hoạt động
                          </span>
                        </div>
                      </td>
                    </tr>
                    {categoryPerms.map((perm) => {
                      const isAllowedByAdmin = staffPerms.includes(perm.key);
                      const isDeptActive = deptStaffPerms.includes(perm.key) && isAllowedByAdmin;

                      return (
                        <tr key={perm.key} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                          <td className="px-3.5 py-2">
                            <p className="font-semibold text-gray-800">{perm.label}</p>
                            <p className="text-[10px] text-gray-400">{perm.description}</p>
                          </td>
                          <td className="text-center px-2 py-2">
                            {isAllowedByAdmin ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Được phép
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400 border border-gray-200">
                                <XCircle className="w-3 h-3 text-gray-400" /> Chưa mở
                              </span>
                            )}
                          </td>
                          <td className="text-center px-2 py-2">
                            {isAllowedByAdmin ? (
                              <button
                                onClick={() => toggleDepartmentPermission(perm.key)}
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-all cursor-pointer ${
                                  isDeptActive
                                    ? 'bg-emerald-100 hover:bg-emerald-200 ring-1 ring-emerald-300'
                                    : 'bg-gray-100 hover:bg-gray-200'
                                }`}
                                title={
                                  isDeptActive
                                    ? `Thu hồi '${perm.label}' của nhân viên khoa`
                                    : `Cấp '${perm.label}' cho nhân viên khoa`
                                }
                              >
                                {isDeptActive ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-gray-300" />
                                )}
                              </button>
                            ) : (
                              <div
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-50 cursor-not-allowed"
                                title="Không thể cấp: Vượt quá trần quyền Admin cho phép"
                              >
                                <XCircle className="w-4 h-4 text-gray-200" />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-3.5 py-2.5 bg-blue-50/50 border-t border-blue-200 text-[10px] text-blue-900 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" />
          <span>
            <strong>Nguyên tắc trần quyền (Permission Ceiling):</strong> Trưởng khoa chỉ có thể bật hoặc tắt các quyền trong phạm vi Admin đã phê duyệt cho Nhân viên. 
            Thay đổi tự động lưu vào hệ thống và áp dụng tức thì cho toàn bộ nhân viên khoa {department || ''}.
          </span>
        </div>
      </div>
    );
  }

  // ─── Admin Mode View (Full 3-role matrix) ──────────────────────────────────
  return (
    <div className="border border-gray-200 bg-white rounded-2xl overflow-hidden shadow-xs">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary-600" />
          <h4 className="text-xs font-bold text-gray-800">Bảng phân quyền hệ thống</h4>
        </div>
        {isSaving && (
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" /> Đang lưu...
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="text-left px-3.5 py-2 font-semibold text-gray-600 w-[30%]">Quyền</th>
              <th className="text-center px-2 py-2 font-semibold w-[14%]">
                <div className="flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3 text-red-600" />
                  <span className="text-red-700">Admin</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 font-semibold w-[14%]">
                <div className="flex items-center justify-center gap-1">
                  <Building2 className="w-3 h-3 text-blue-600" />
                  <span className="text-blue-700">Trưởng khoa</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 font-semibold w-[14%]">
                <div className="flex items-center justify-center gap-1">
                  <UserCheck className="w-3 h-3 text-sky-600" />
                  <span className="text-sky-700">Phó khoa</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 font-semibold w-[14%]">
                <div className="flex items-center justify-center gap-1">
                  <Users className="w-3 h-3 text-gray-600" />
                  <span className="text-gray-700">Nhân viên</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 font-semibold w-[14%]">
                <div className="flex items-center justify-center gap-1">
                  <Globe className="w-3 h-3 text-slate-600" />
                  <span className="text-slate-700">Khách</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <React.Fragment key={cat}>
                <tr className="bg-gray-50/80 border-y border-gray-100">
                  <td colSpan={6} className="px-3.5 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    {cat}
                  </td>
                </tr>
                {ALL_PERMISSIONS.filter((p) => p.category === cat).map((perm) => {
                  const headHas = headPerms.includes(perm.key);
                  const deputyHeadHas = deputyHeadPerms.includes(perm.key);
                  const staffHas = staffPerms.includes(perm.key);
                  const guestHas = guestPerms.includes(perm.key);

                  return (
                    <tr key={perm.key} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3.5 py-2">
                        <p className="font-semibold text-gray-800">{perm.label}</p>
                        <p className="text-[10px] text-gray-400">{perm.description}</p>
                      </td>
                      <td className="text-center px-2 py-2">
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100">
                          <CheckCircle2 className="w-4 h-4 text-red-600" />
                        </div>
                      </td>
                      <td className="text-center px-2 py-2">
                        <button
                          onClick={() => toggleGlobalPermission('head', perm.key)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
                            headHas ? 'bg-blue-100 hover:bg-blue-200' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          title={headHas ? `Tắt '${perm.label}' cho Trưởng khoa` : `Bật '${perm.label}' cho Trưởng khoa`}
                        >
                          {headHas ? <CheckCircle2 className="w-4 h-4 text-blue-600" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                        </button>
                      </td>
                      <td className="text-center px-2 py-2">
                        <button
                          onClick={() => toggleGlobalPermission('deputy_head', perm.key)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
                            deputyHeadHas ? 'bg-sky-100 hover:bg-sky-200' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          title={deputyHeadHas ? `Tắt '${perm.label}' cho Phó khoa` : `Bật '${perm.label}' cho Phó khoa`}
                        >
                          {deputyHeadHas ? <CheckCircle2 className="w-4 h-4 text-sky-600" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                        </button>
                      </td>
                      <td className="text-center px-2 py-2">
                        {headHas ? (
                          <button
                            onClick={() => toggleGlobalPermission('staff', perm.key)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
                              staffHas ? 'bg-emerald-100 hover:bg-emerald-200' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                            title={staffHas ? `Tắt '${perm.label}' cho Nhân viên` : `Bật '${perm.label}' cho Nhân viên`}
                          >
                            {staffHas ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-gray-300" />}
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
                      <td className="text-center px-2 py-2">
                        <button
                          onClick={() => toggleGlobalPermission('guest', perm.key)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer ${
                            guestHas ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          title={guestHas ? `Tắt '${perm.label}' cho Khách` : `Bật '${perm.label}' cho Khách`}
                        >
                          {guestHas ? <CheckCircle2 className="w-4 h-4 text-slate-700" /> : <XCircle className="w-4 h-4 text-gray-300" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3.5 py-2.5 bg-amber-50 border-t border-amber-200 text-[10px] text-amber-800 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
        <span>
          <strong>Lưu ý quản trị:</strong> Admin luôn có toàn quyền. Trưởng khoa chỉ có thể thu hẹp (không thể mở rộng) quyền của nhân viên trong phạm vi Admin cho phép. Thay đổi tự động lưu vào Realtime Database.
        </span>
      </div>
    </div>
  );
};
