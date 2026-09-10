import React from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: React.ReactNode;
  type: ToastType;
}

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        let borderColor = 'border-emerald-500';
        let titleColor = 'text-emerald-900';
        let titleText = 'Thành công';
        let Icon = CheckCircle;
        let iconColor = 'text-emerald-500';

        if (toast.type === 'error') {
          borderColor = 'border-red-500';
          titleColor = 'text-red-900';
          titleText = 'Lỗi';
          Icon = AlertCircle;
          iconColor = 'text-red-500';
        } else if (toast.type === 'warning') {
          borderColor = 'border-amber-500';
          titleColor = 'text-amber-900';
          titleText = 'Lưu ý giá DVKT';
          Icon = AlertTriangle;
          iconColor = 'text-amber-500';
        } else if (toast.type === 'info') {
          borderColor = 'border-blue-500';
          titleColor = 'text-blue-900';
          titleText = 'Thông tin';
          Icon = AlertCircle;
          iconColor = 'text-blue-500';
        }

        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto min-w-[320px] max-w-[480px] p-4 rounded-xl shadow-xl border-l-4 animate-slide-in flex items-start gap-3 bg-white
              ${borderColor}
            `}
          >
            <Icon className={`h-5 w-5 ${iconColor} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <p className={`font-semibold text-sm ${titleColor}`}>
                {titleText}
              </p>
              <div className="text-sm text-gray-700 mt-0.5 whitespace-pre-line break-words">{toast.message}</div>
            </div>
            <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
