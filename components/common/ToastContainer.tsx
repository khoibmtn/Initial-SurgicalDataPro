import React, { useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: React.ReactNode;
  type: ToastType;
}

const ToastIcon: React.FC<{ type: ToastType }> = ({ type }) => {
  const iconMap = {
    success: { Icon: CheckCircle, color: 'text-emerald-500' },
    error: { Icon: AlertCircle, color: 'text-red-500' },
    warning: { Icon: AlertTriangle, color: 'text-amber-500' },
    info: { Icon: AlertCircle, color: 'text-blue-500' },
  };
  const { Icon, color } = iconMap[type];
  return <Icon className={`h-5 w-5 ${color} shrink-0 mt-0.5`} />;
};

const TOAST_STYLES: Record<ToastType, { border: string; title: string; titleText: string }> = {
  success: { border: 'border-emerald-500', title: 'text-emerald-900', titleText: 'Thành công' },
  error: { border: 'border-red-500', title: 'text-red-900', titleText: 'Lỗi' },
  warning: { border: 'border-amber-500', title: 'text-amber-900', titleText: 'Lưu ý giá DVKT' },
  info: { border: 'border-blue-500', title: 'text-blue-900', titleText: 'Thông tin' },
};

const SingleToast: React.FC<{
  toast: ToastItem;
  onRemove: (id: string) => void;
}> = ({ toast, onRemove }) => {
  const style = TOAST_STYLES[toast.type];

  return (
    <div
      className={`
        pointer-events-auto min-w-[280px] max-w-[400px] p-3 rounded-xl shadow-xl border-l-4 animate-slide-in flex items-start gap-3 bg-white
        ${style.border}
      `}
    >
      <ToastIcon type={toast.type} />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${style.title}`}>
          {style.titleText}
        </p>
        <div className="text-xs text-gray-700 mt-0.5 whitespace-pre-line break-words line-clamp-3">
          {toast.message}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(toast.id);
        }}
        className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5 p-1 -mr-1 cursor-pointer rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Đóng thông báo"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}> = ({ toasts, removeToast }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss all on Escape key
  useEffect(() => {
    if (toasts.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toasts.forEach((t) => removeToast(t.id));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      role="alert"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <SingleToast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};
