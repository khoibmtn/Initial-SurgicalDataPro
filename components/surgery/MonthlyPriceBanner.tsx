import React from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';
import { ReportState } from '../../types/reportState';

export interface MonthlyPriceBannerProps {
  currentReport: ReportState;
  showFullPriceNotice: boolean;
  onCloseFullPriceNotice: () => void;
  onOpenPriceServiceTab: () => void;
}

export const MonthlyPriceBanner: React.FC<MonthlyPriceBannerProps> = ({
  currentReport,
  showFullPriceNotice,
  onCloseFullPriceNotice,
  onOpenPriceServiceTab,
}) => {
  const records = currentReport.result?.validRecords || [];
  const total = records.length;
  if (total === 0) return null;

  const priced = records.filter(
    (r) => (r.donGia && r.donGia > 0) || (r.thanhTien && r.thanhTien > 0)
  ).length;

  let rangeText = currentReport.result?.dateRangeText || '';
  if (!rangeText) {
    const dates = records
      .map((r) =>
        r.start instanceof Date && !isNaN(r.start.getTime())
          ? r.start.getTime()
          : r.ngayBD
          ? new Date(r.ngayBD).getTime()
          : 0
      )
      .filter((t) => t > 0)
      .sort((a, b) => a - b);
    if (dates.length > 0) {
      const minD = new Date(dates[0]);
      const maxD = new Date(dates[dates.length - 1]);
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      rangeText = `Từ ngày ${fmt(minD)} đến ngày ${fmt(maxD)}`;
    }
  }

  if (priced < total) {
    return (
      <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-3 text-amber-900 shadow-sm animate-fade-in">
        <div className="flex items-start gap-2.5 min-w-0">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Có {priced}/{total} trường hợp có giá áp dụng.
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Hãy bổ sung import thêm báo cáo Thống kê giá DVKT trong khoảng thời gian{' '}
              {rangeText ? `(${rangeText}) ` : ''}để áp đầy đủ giá.
            </p>
          </div>
        </div>
        <button
          onClick={onOpenPriceServiceTab}
          className="shrink-0 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          Nhập giá DVKT
        </button>
      </div>
    );
  }

  if (!showFullPriceNotice) return null;

  return (
    <div className="mx-4 mt-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2 text-emerald-900 shadow-xs animate-fade-in transition-all">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="text-xs font-medium">
          Đã có {priced}/{total} trường hợp có giá áp dụng (Đầy đủ 100%).
        </span>
      </div>
      <button
        onClick={onCloseFullPriceNotice}
        className="text-emerald-700 hover:text-emerald-900 p-0.5 rounded cursor-pointer transition-colors"
        title="Đóng thông báo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
