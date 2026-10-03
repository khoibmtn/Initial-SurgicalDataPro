import { useState, useEffect, useCallback, useRef } from 'react';

declare const __APP_VERSION__: string;

interface VersionCheckState {
  /** True khi đã phát hiện phiên bản mới trên server */
  hasNewVersion: boolean;
  /** Phiên bản đang chạy (build hash) */
  currentVersion: string;
  /** Phiên bản mới trên server (nếu phát hiện) */
  latestVersion: string;
  /** Tải lại trang ngay lập tức */
  reloadPage: () => void;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 phút
const VERSION_URL = '/version.json';

/**
 * Hook tự động kiểm tra phiên bản ứng dụng đang chạy so với bản mới nhất trên server.
 * - Poll `version.json` mỗi 5 phút.
 * - Khi phát hiện version khác → `hasNewVersion = true`.
 * - Bỏ qua ở chế độ development.
 */
export function useVersionCheck(): VersionCheckState {
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const [latestVersion, setLatestVersion] = useState(currentVersion);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkVersion = useCallback(async () => {
    // Skip in development
    if (currentVersion === 'dev') return;

    try {
      // Busting browser cache with timestamp query param
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) return;

      const data = await res.json();
      const serverVersion = data?.version;

      if (serverVersion && serverVersion !== currentVersion) {
        setLatestVersion(serverVersion);
        setHasNewVersion(true);
      }
    } catch {
      // Network error — silently ignore, will retry next interval
    }
  }, [currentVersion]);

  useEffect(() => {
    // Initial check sau 30 giây (cho app kịp load xong)
    const initialTimeout = setTimeout(checkVersion, 30_000);

    // Recurring poll mỗi 5 phút
    intervalRef.current = setInterval(checkVersion, POLL_INTERVAL_MS);

    // Cũng check khi tab lấy lại focus (user quay lại sau thời gian dài)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkVersion]);

  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    hasNewVersion,
    currentVersion,
    latestVersion,
    reloadPage,
  };
}
