// ─── Audit Log Modal ──────────────────────────────────────────────────────────
// Modal hiển thị dòng thời gian (Timeline) truy vết chỉnh sửa số liệu & thao tác hệ thống
// Hỗ trợ kiểm toán y tế, đối soát và giám sát hoạt động cho Trưởng khoa & Admin

import React, { useState, useMemo } from 'react';
import {
  History,
  X,
  Search,
  Lock,
  Unlock,
  Edit3,
  Users,
  Trash2,
  Save,
  UserCheck,
  UserX,
  ShieldAlert,
  ArrowRight,
  Clock,
  Filter,
  Building2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AuditLogEntry, AuditAction } from '../../types/auditLog';
import { filterAuditLogs } from '../../services/auditLogService';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditLogEntry[];
  currentPeriodLabel?: string;
  department?: string;
  departments?: string[];
  isAdmin: boolean;
}

function formatRelativeTime(isoStr: string): string {
  try {
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Vừa xong';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ trước`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} ngày trước`;

    const d = new Date(isoStr);
    return d.toLocaleDateString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

function formatExactTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

function getActionMeta(action: AuditAction): {
  label: string;
  colorClass: string;
  icon: React.ReactNode;
} {
  switch (action) {
    case 'REPORT_LOCK':
      return {
        label: 'Khóa sổ',
        colorClass: 'bg-amber-100 text-amber-900 border-amber-300',
        icon: <Lock className="w-3.5 h-3.5 text-amber-700" />,
      };
    case 'REPORT_UNLOCK':
      return {
        label: 'Mở khóa',
        colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        icon: <Unlock className="w-3.5 h-3.5 text-emerald-700" />,
      };
    case 'RECORD_EDIT':
      return {
        label: 'Sửa ca mổ',
        colorClass: 'bg-blue-100 text-blue-900 border-blue-300',
        icon: <Edit3 className="w-3.5 h-3.5 text-blue-700" />,
      };
    case 'ASSISTANT_FILL':
      return {
        label: 'Giúp việc',
        colorClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
        icon: <Users className="w-3.5 h-3.5 text-cyan-700" />,
      };
    case 'RECORD_DELETE':
      return {
        label: 'Xóa dòng',
        colorClass: 'bg-rose-100 text-rose-900 border-rose-300',
        icon: <Trash2 className="w-3.5 h-3.5 text-rose-700" />,
      };
    case 'DATA_SAVE':
      return {
        label: 'Lưu CSDL',
        colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        icon: <Save className="w-3.5 h-3.5 text-emerald-700" />,
      };
    case 'USER_APPROVE':
      return {
        label: 'Duyệt TV',
        colorClass: 'bg-teal-100 text-teal-900 border-teal-300',
        icon: <UserCheck className="w-3.5 h-3.5 text-teal-700" />,
      };
    case 'USER_REJECT':
      return {
        label: 'Từ chối TV',
        colorClass: 'bg-red-100 text-red-900 border-red-300',
        icon: <UserX className="w-3.5 h-3.5 text-red-700" />,
      };
    default:
      return {
        label: 'Hệ thống',
        colorClass: 'bg-slate-100 text-slate-900 border-slate-300',
        icon: <ShieldAlert className="w-3.5 h-3.5 text-slate-700" />,
      };
  }
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  logs,
  currentPeriodLabel,
  department = '',
  departments = [],
  isAdmin,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<AuditAction | 'ALL'>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>(isAdmin ? 'ALL' : department || 'ALL');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return filterAuditLogs(logs, {
      action: selectedAction,
      department: selectedDept,
      searchTerm,
    });
  }, [logs, selectedAction, selectedDept, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-slate-50/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  Nhật ký truy vết & Kiểm toán số liệu
                </h3>
                {currentPeriodLabel && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                    {currentPeriodLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Ghi nhận minh bạch mọi thao tác chỉnh sửa, điền người giúp việc, xóa dòng hoặc khóa sổ báo cáo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên BN, bác sĩ, mô tả..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 transition-all"
            />
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as any)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium"
            >
              <option value="ALL">Tất cả hành động</option>
              <option value="RECORD_EDIT">Chỉnh sửa ca mổ</option>
              <option value="ASSISTANT_FILL">Người giúp việc</option>
              <option value="REPORT_LOCK">Khóa sổ báo cáo</option>
              <option value="REPORT_UNLOCK">Mở khóa báo cáo</option>
              <option value="RECORD_DELETE">Xóa dòng</option>
              <option value="DATA_SAVE">Lưu CSDL</option>
              <option value="USER_APPROVE">Phê duyệt thành viên</option>
            </select>
          </div>

          {/* Department Filter (Admin view) */}
          {isAdmin && departments.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-500" />
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium"
              >
                <option value="ALL">Toàn viện (Tất cả khoa)</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    Khoa {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-[11px] text-gray-500 font-medium">
            Hiển thị <strong>{filtered.length}</strong> / {logs.length} nhật ký
          </div>
        </div>

        {/* Timeline Log List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100">
                <History className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-gray-800">Chưa có nhật ký truy vết phù hợp</h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                Các thao tác như chỉnh sửa thông tin ca mổ, lưu người giúp việc, khóa sổ hoặc phê duyệt sẽ được tự động ghi lại tại đây.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
              {filtered.map((log) => {
                const meta = getActionMeta(log.action);
                const hasDiffs = log.diffs && log.diffs.length > 0;
                const isExpanded = expandedLogIds.has(log.id);

                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline Node Icon */}
                    <div className="absolute -left-6 top-2 w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center group-hover:border-blue-500 group-hover:scale-110 transition-all shadow-2xs">
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                    </div>

                    {/* Card Content */}
                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-2xs hover:shadow-sm transition-shadow">
                      {/* Row 1: Action badge + Target + User + Time */}
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.colorClass}`}
                          >
                            {meta.icon}
                            {meta.label}
                          </span>

                          {log.targetLabel && (
                            <span className="text-xs font-bold text-gray-900">
                              {log.targetLabel}
                            </span>
                          )}

                          {log.department && log.department !== 'ALL' && (
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              Khoa {log.department}
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div
                          className="flex items-center gap-1 text-[11px] text-gray-500 font-medium shrink-0"
                          title={formatExactTime(log.timestamp)}
                        >
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{formatRelativeTime(log.timestamp)}</span>
                        </div>
                      </div>

                      {/* Row 2: Description */}
                      <p className="text-xs text-gray-700 mt-2 leading-relaxed">
                        {log.description}
                      </p>

                      {/* Row 3: Executor Info */}
                      <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500 flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          <span>Người thực hiện:</span>
                          <strong className="text-gray-800">{log.userName}</strong>
                          <span className="px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold uppercase">
                            {log.userRole === 'admin'
                              ? 'Admin'
                              : log.userRole === 'head'
                              ? 'Trưởng khoa'
                              : 'Nhân viên'}
                          </span>
                        </div>

                        {/* Diffs Toggle button */}
                        {hasDiffs && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(log.id)}
                            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold cursor-pointer hover:underline"
                          >
                            <span>
                              {isExpanded ? 'Ẩn chi tiết thay đổi' : `Xem chi tiết (${log.diffs!.length} trường)`}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Diffs Table / Breakdown (when expanded) */}
                      {hasDiffs && isExpanded && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs space-y-2 animate-fade-in">
                          <p className="font-bold text-gray-700 text-[11px]">
                            Chi tiết các trường dữ liệu được cập nhật:
                          </p>
                          <div className="divide-y divide-gray-200">
                            {log.diffs!.map((diff, idx) => (
                              <div
                                key={idx}
                                className="py-1.5 flex items-center justify-between gap-3 flex-wrap"
                              >
                                <span className="font-medium text-gray-700 w-36 shrink-0">
                                  {diff.fieldLabel}:
                                </span>
                                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                  <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 line-through text-[11px]">
                                    {diff.before ? String(diff.before) : '(trống)'}
                                  </span>
                                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-300 font-semibold text-[11px]">
                                    {diff.after ? String(diff.after) : '(trống)'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-white flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Hệ thống tự động đồng bộ thời gian thực theo tiêu chuẩn bảo mật y tế
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
