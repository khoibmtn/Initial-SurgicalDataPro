import React from 'react';
import { RefreshCw, ArrowUpCircle } from 'lucide-react';

interface VersionUpdateBannerProps {
  onReload: () => void;
}

/**
 * Banner cố định phía trên cùng khi phát hiện phiên bản mới.
 * Thiết kế tối giản, phù hợp giao diện y tế cao cấp.
 */
export const VersionUpdateBanner: React.FC<VersionUpdateBannerProps> = ({
  onReload,
}) => {
  return (
    <div
      className="relative sm:fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between sm:justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5
                 bg-gradient-to-r from-primary-700 via-primary-600 to-primary-500
                 text-white shadow-md animate-slide-down"
    >
      <ArrowUpCircle size={18} className="shrink-0 animate-pulse" />
      <span className="text-sm font-medium">
        Phiên bản mới đã sẵn sàng! Vui lòng tải lại trang để sử dụng các tính năng mới nhất.
      </span>
      <button
        onClick={onReload}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold
                   bg-white/20 hover:bg-white/30 backdrop-blur-sm
                   border border-white/30 transition-all duration-200
                   hover:scale-105 active:scale-95 cursor-pointer"
        title="Tải lại trang ngay"
      >
        <RefreshCw size={12} />
        Cập nhật ngay
      </button>
    </div>
  );
};
