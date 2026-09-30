// ─── Report Lock Banner ──────────────────────────────────────────────────────
// Hiển thị thanh thông báo nổi bật khi báo cáo kỳ hiện tại đã bị khóa sổ

import React from 'react';
import { Lock, Unlock, ShieldAlert, Building2, Info } from 'lucide-react';
import type { ReportLock } from '../../types/reportLock';

interface ReportLockBannerProps {
  lock: ReportLock | null;
  periodLabel: string;
  canUnlock: boolean;
  onUnlockClick: () => void;
}

function formatDate(isoStr?: string): string {
  if (!isoStr) return '';
  try {
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

export const ReportLockBanner: React.FC<ReportLockBannerProps> = ({
  lock,
  periodLabel,
  canUnlock,
  onUnlockClick,
}) => {
  if (!lock || !lock.isLocked) return null;

  const roleText = lock.lockedByRole === 'admin' ? 'Quản trị viên' : 'Trưởng khoa';

  return (
    <div className="mx-4 mt-2 p-3 bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-50/40 border border-amber-300 rounded-xl flex items-center justify-between gap-3 shadow-xs animate-fade-in">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="p-1.5 bg-amber-200/90 text-amber-900 rounded-lg shrink-0 mt-0.5">
          <Lock className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-bold text-amber-950">
              Báo cáo {periodLabel} đã khóa sổ
            </h4>
            <span className="px-2 py-0.2 text-[10px] font-bold rounded-full bg-amber-200/80 text-amber-900 border border-amber-300">
              Chế độ chỉ xem
            </span>
            {lock.department && lock.department !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.2 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                <Building2 className="w-3 h-3" />
                Khoa {lock.department}
              </span>
            )}
          </div>
          <p className="text-[11px] text-amber-800/90 mt-0.5">
            Được khóa bởi <strong>{lock.lockedBy}</strong> ({roleText}) vào lúc {formatDate(lock.lockedAt)}.
            {lock.note && (
              <span className="italic ml-1">
                — "{lock.note}"
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {canUnlock ? (
          <button
            onClick={onUnlockClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-300 hover:border-emerald-400 transition-colors shadow-xs cursor-pointer"
            title="Mở khóa để cho phép chỉnh sửa số liệu"
          >
            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Mở khóa báo cáo</span>
          </button>
        ) : (
          <span className="text-[10px] text-amber-700 bg-amber-100/60 px-2 py-1 rounded-md border border-amber-200/80 font-medium">
            Số liệu đã chốt
          </span>
        )}
      </div>
    </div>
  );
};
