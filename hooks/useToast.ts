import { useState, useCallback, useRef } from 'react';
import { ToastItem, ToastType } from '../components/common/ToastContainer';

const MAX_VISIBLE_TOASTS = 3;
const DEDUPE_WINDOW_MS = 2000;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentMessagesRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: React.ReactNode, type: ToastType = 'success', duration = 6000) => {
      // Deduplicate: skip if same message was shown recently
      const messageKey = typeof message === 'string' ? message : String(message);
      const now = Date.now();
      const lastShown = recentMessagesRef.current.get(messageKey);
      if (lastShown && now - lastShown < DEDUPE_WINDOW_MS) {
        return;
      }
      recentMessagesRef.current.set(messageKey, now);

      // Clean up old entries from dedup map
      if (recentMessagesRef.current.size > 50) {
        const cutoff = now - DEDUPE_WINDOW_MS * 2;
        for (const [key, ts] of recentMessagesRef.current) {
          if (ts < cutoff) recentMessagesRef.current.delete(key);
        }
      }

      const id = crypto.randomUUID();

      setToasts((prev) => {
        // Evict oldest toasts if exceeding max
        const next = [...prev, { id, message, type }];
        if (next.length > MAX_VISIBLE_TOASTS) {
          const evicted = next.slice(0, next.length - MAX_VISIBLE_TOASTS);
          evicted.forEach((t) => {
            const timer = timersRef.current.get(t.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(t.id);
            }
          });
          return next.slice(-MAX_VISIBLE_TOASTS);
        }
        return next;
      });

      // Auto-dismiss with stable ref
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
      timersRef.current.set(id, timer);
    },
    []
  );

  return { toasts, addToast, removeToast };
}
