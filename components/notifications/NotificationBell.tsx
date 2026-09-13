// ─── Notification Bell & Dropdown ──────────────────────────────────────────────
// Chuông thông báo thời gian thực trên Header / Sidebar
// Hỗ trợ hiển thị badge chưa đọc, popup danh sách thông báo và dẫn hướng trực tiếp

import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Lock,
  Unlock,
  UserCheck,
  Save,
  Edit3,
  AlertCircle,
  Clock,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { AppNotification, NotificationType } from '../../types/notification';

interface NotificationBellProps {
  notifications: AppNotification[];
  onMarkAllAsRead: () => void;
  onNotificationClick: (notif: AppNotification) => void;
  align?: 'left' | 'right';
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
    });
  } catch {
    return isoStr;
  }
}

function getNotifMeta(type: NotificationType): {
  icon: React.ReactNode;
  bgClass: string;
} {
  switch (type) {
    case 'PENDING_USER':
      return {
        icon: <UserCheck className="w-4 h-4 text-emerald-700" />,
        bgClass: 'bg-emerald-100',
      };
    case 'REPORT_LOCKED':
      return {
        icon: <Lock className="w-4 h-4 text-amber-700" />,
        bgClass: 'bg-amber-100',
      };
    case 'REPORT_UNLOCKED':
      return {
        icon: <Unlock className="w-4 h-4 text-emerald-700" />,
        bgClass: 'bg-emerald-100',
      };
    case 'DATA_SAVED':
      return {
        icon: <Save className="w-4 h-4 text-blue-700" />,
        bgClass: 'bg-blue-100',
      };
    case 'RECORD_EDITED':
      return {
        icon: <Edit3 className="w-4 h-4 text-cyan-700" />,
        bgClass: 'bg-cyan-100',
      };
    default:
      return {
        icon: <AlertCircle className="w-4 h-4 text-slate-700" />,
        bgClass: 'bg-slate-100',
      };
  }
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onMarkAllAsRead,
  onNotificationClick,
  align = 'right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
        title="Thông báo hệ thống"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs animate-scale-up">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          className={`absolute top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-24px)] rounded-2xl bg-white shadow-2xl border border-gray-200 z-50 overflow-hidden animate-scale-up ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-gray-900">Thông báo</h4>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                  {unreadCount} mới
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Đọc tất cả</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-medium">Bạn chưa có thông báo nào</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const meta = getNotifMeta(notif.type);
                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      onNotificationClick(notif);
                      setIsOpen(false);
                    }}
                    className={`p-3.5 flex items-start gap-3 hover:bg-gray-50 transition-colors cursor-pointer group ${
                      !notif.read ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {/* Type Icon */}
                    <div className={`p-2 rounded-xl shrink-0 mt-0.5 shadow-2xs ${meta.bgClass}`}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h5
                          className={`text-xs truncate ${
                            !notif.read ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'
                          }`}
                        >
                          {notif.title}
                        </h5>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>

                      <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 font-medium">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="w-3 h-3 text-gray-300" />
                          {formatRelativeTime(notif.timestamp)}
                        </span>
                        {notif.department && notif.department !== 'ALL' && (
                          <span className="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                            Khoa {notif.department}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow / Navigation indicator */}
                    {notif.actionTab && (
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600 transition-colors shrink-0 mt-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
