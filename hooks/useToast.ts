import { useState, useCallback } from 'react';
import { ToastItem, ToastType } from '../components/common/ToastContainer';

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: React.ReactNode, type: ToastType = 'success', duration = 6000) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return { toasts, addToast, removeToast };
}
