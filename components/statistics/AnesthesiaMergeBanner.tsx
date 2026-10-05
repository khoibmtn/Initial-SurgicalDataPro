import React, { useState } from 'react';
import { Syringe, AlertTriangle, ChevronDown, ChevronUp, X, CheckCircle2, Cpu, User } from 'lucide-react';
import type { AnesthesiaMergeSummary } from '../../types';

interface AnesthesiaMergeBannerProps {
  summary: AnesthesiaMergeSummary;
  onDismiss?: () => void;
}

export const AnesthesiaMergeBanner: React.FC<AnesthesiaMergeBannerProps> = ({
  summary,
  onDismiss,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!summary || (summary.mergedCount === 0 && summary.orphanCount === 0)) return null;

  return (
    <div className="mb-4 bg-emerald-50/90 border border-emerald-200/80 rounded-xl p-3.5 sm:p-4 text-emerald-950 shadow-2xs transition-all duration-200 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 bg-emerald-100/90 text-emerald-700 rounded-lg shrink-0 mt-0.5 border border-emerald-300/50">
            <Syringe size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-emerald-900">
                Tự động gộp kíp gây mê & máy từ &ldquo;Gây mê khác&rdquo;
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300/60">
                <CheckCircle2 size={12} className="text-emerald-600" />
                {summary.mergedCount} lượt gộp ({summary.targetProceduresCount} thủ thuật)
              </span>
              {summary.orphanCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300/60">
                  <AlertTriangle size={12} className="text-amber-600" />
                  {summary.orphanCount} ca mồ côi (bỏ qua)
                </span>
              )}
            </div>

            <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
              Hệ thống đã nhận diện các dòng dịch vụ &ldquo;Gây mê khác&rdquo;, tự động chuyển thông tin kíp gây mê và máy vào các thủ thuật tương ứng của cùng bệnh nhân trong khung giờ gây mê, đồng thời loại bỏ dòng gây mê thừa để báo cáo chính xác.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-white/80 hover:bg-white border border-emerald-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                onDismiss();
              }}
              className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
              title="Đóng thông báo"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3.5 pt-3 border-t border-emerald-200/70 space-y-3 animate-fade-in text-xs">
          {/* Merged Items Table */}
          {summary.mergedItems.length > 0 && (
            <div>
              <div className="font-semibold text-emerald-900 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span>Danh sách ca đã gộp kíp gây mê thành công:</span>
              </div>
              <div className="bg-white/95 border border-emerald-200/80 rounded-lg overflow-x-auto shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-100/50 text-emerald-900 font-bold border-b border-emerald-200/60 text-[11px]">
                      <th className="py-1.5 px-3">Bệnh nhân</th>
                      <th className="py-1.5 px-3">Thời gian gây mê</th>
                      <th className="py-1.5 px-3">Kíp gây mê</th>
                      <th className="py-1.5 px-3">Máy thực hiện</th>
                      <th className="py-1.5 px-3">Thủ thuật được nhận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 text-gray-800">
                    {summary.mergedItems.map((item, idx) => (
                      <tr key={`merged-${idx}`} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="py-2 px-3 font-semibold text-gray-900">
                          <div>{item.patientName}</div>
                          <div className="text-[10px] text-gray-700 font-mono">Mã BN: {item.patientId || '—'}</div>
                        </td>
                        <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{item.gmTimeRange}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1 text-gray-900 font-medium">
                            <User size={11} className="text-emerald-700 shrink-0" />
                            <span>BS GM: {item.bsGM || '—'}</span>
                          </div>
                          {item.ktvGM && (
                            <div className="text-[10.5px] text-gray-700 ml-3.5">KTV GM: {item.ktvGM}</div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1 font-mono text-[11px] text-gray-800">
                            <Cpu size={11} className="text-cyan-700 shrink-0" />
                            <span>{item.machineCode || item.machine || '—'}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="space-y-1">
                            {item.mergedProcedures.map((proc, pIdx) => (
                              <div key={pIdx} className="bg-emerald-50/70 px-2 py-0.5 rounded border border-emerald-200/60 text-[11px]">
                                <span className="font-semibold text-emerald-950">{proc.tenKT}</span>
                                <span className="text-gray-700 ml-1.5">({proc.timeRange})</span>
                                {proc.ptChinh && (
                                  <span className="text-gray-700 ml-1.5">• PT chính: {proc.ptChinh}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Orphan Items Alert */}
          {summary.orphanItems.length > 0 && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-3 text-amber-950">
              <div className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-600" />
                <span>Các dòng &ldquo;Gây mê khác&rdquo; không tìm thấy thủ thuật tương ứng (đã tự động bỏ qua không import):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800 ml-1">
                {summary.orphanItems.map((item, idx) => (
                  <li key={`orphan-${idx}`}>
                    <strong className="text-amber-950">{item.patientName}</strong> (Mã BN: {item.patientId || '—'}) — Thời gian: {item.gmTimeRange} — BS GM: {item.bsGM || '—'}, Máy: {item.machine || '—'}
                    <span className="text-amber-700 italic ml-1">({item.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
