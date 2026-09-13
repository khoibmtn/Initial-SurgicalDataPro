// ─── Account Panel ────────────────────────────────────────────────────────────
// Modal hiển thị thông tin tài khoản của user hiện tại
// Admin: thấy đầy đủ + link đến quản lý users
// Head: thấy profile + team overview
// Staff: thấy profile cơ bản

import React, { useState } from 'react';
import {
  X,
  User,
  Shield,
  Building2,
  Mail,
  Clock,
  Edit3,
  Check,
  AlertCircle,
  CheckCircle2,
  Users,
  Crown,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { updateUserProfile } from '../../services/authService';
import type { AppUser } from '../../types/auth';

interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Callback để chuyển đến tab quản lý users (admin only) */
  onNavigateToUserManagement?: () => void;
}

const ROLE_DISPLAY: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  admin: { label: 'Quản trị viên', icon: Shield, color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
  head: { label: 'Trưởng khoa', icon: Crown, color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
  staff: { label: 'Nhân viên', icon: UserCircle, color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200' },
};

export const AccountPanel: React.FC<AccountPanelProps> = ({ isOpen, onClose, onNavigateToUserManagement }) => {
  const { user, currentRole, isAdmin, isHead } = useAuth();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen || !user) return null;

  const roleInfo = ROLE_DISPLAY[currentRole] || ROLE_DISPLAY.staff;
  const RoleIcon = roleInfo.icon;

  const handleEditName = () => {
    setEditName(user.displayName || '');
    setIsEditingName(true);
    setMessage(null);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      setMessage({ type: 'error', text: 'Tên hiển thị không được để trống.' });
      return;
    }
    setIsSaving(true);
    const result = await updateUserProfile(user.uid, { displayName: editName.trim() });
    if (result.success) {
      setMessage({ type: 'success', text: 'Đã cập nhật tên hiển thị.' });
      setIsEditingName(false);
    } else {
      setMessage({ type: 'error', text: result.error || 'Cập nhật thất bại.' });
    }
    setIsSaving(false);
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('vi-VN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${roleInfo.bgColor} border`}>
              <RoleIcon className={`w-4.5 h-4.5 ${roleInfo.color}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Tài khoản của tôi</h3>
              <p className="text-[11px] text-gray-500">{roleInfo.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Avatar + Role badge */}
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl ${roleInfo.bgColor} border flex items-center justify-center`}>
              <RoleIcon className={`w-7 h-7 ${roleInfo.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false); }}
                    className="flex-1 px-2 py-1 text-sm font-bold rounded-md border border-primary-300 focus:outline-hidden focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSaving}
                    className="p-1 rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-gray-900 truncate">{user.displayName || user.nickname}</h4>
                  <button
                    onClick={handleEditName}
                    className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    title="Sửa tên hiển thị"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleInfo.bgColor} ${roleInfo.color} mt-0.5`}>
                <RoleIcon className="w-3 h-3" />
                {roleInfo.label}
              </span>
            </div>
          </div>

          {/* Info fields */}
          <div className="space-y-2.5">
            <InfoRow icon={User} label="Nickname" value={user.nickname} mono />
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Building2} label="Khoa" value={user.department || '—'} />
            <InfoRow icon={Clock} label="Tham gia" value={formatDate(user.createdAt)} />
          </div>

          {/* Admin / Head: link to user management */}
          {(isAdmin || isHead) && onNavigateToUserManagement && (
            <button
              onClick={() => { onClose(); onNavigateToUserManagement(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              {isAdmin ? <Users className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
              <div className="text-left">
                <p className="font-bold">{isAdmin ? 'Quản lý người dùng' : 'Quản lý nhân sự khoa'}</p>
                <p className="text-[10px] opacity-75">
                  {isAdmin
                    ? 'Duyệt, khóa, phân quyền toàn hệ thống'
                    : `Duyệt, khóa, phân quyền nhân viên khoa ${user.department || ''}`}
                </p>
              </div>
            </button>
          )}

          {/* Message */}
          {message && (
            <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 animate-fade-in ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {message.type === 'error'
                ? <AlertCircle className="w-4 h-4 shrink-0" />
                : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{message.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-component: Info Row ────────────────────────────────────────────────

const InfoRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}> = ({ icon: Icon, label, value, mono }) => (
  <div className="flex items-center gap-3 py-1.5">
    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">{label}</p>
      <p className={`text-xs text-gray-800 truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  </div>
);
