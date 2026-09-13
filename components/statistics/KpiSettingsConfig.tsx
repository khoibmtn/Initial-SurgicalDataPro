// ─── KPI Settings Config Component ─────────────────────────────────────────
// Subtab Cấu hình KPI phòng mổ bên trong Cấu hình Thống kê (StatsConfig)
// Thiết lập các tham số tiêu chuẩn phục vụ bảng điều khiển OR KPI Analytics

import React, { useState, useEffect } from 'react';
import {
  Gauge,
  Clock,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sliders,
  DollarSign,
  Activity,
} from 'lucide-react';
import { KpiConfig, DEFAULT_KPI_CONFIG } from '../../types/kpi';
import { saveKpiConfig, subscribeToKpiConfig } from '../../services/kpiConfigService';

interface Props {
  isLocked?: boolean;
}

export const KpiSettingsConfig: React.FC<Props> = ({ isLocked = false }) => {
  const [form, setForm] = useState<KpiConfig>(DEFAULT_KPI_CONFIG);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = subscribeToKpiConfig((cfg) => {
      setForm(cfg);
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setSaving(true);
    const res = await saveKpiConfig(form);
    setSaving(false);

    if (res.success) {
      showToast('Đã lưu cấu hình chỉ số phòng mổ thành công!');
    } else {
      showToast(res.error || 'Lỗi khi lưu cấu hình', 'error');
    }
  };

  const handleResetDefaults = () => {
    if (isLocked) return;
    if (confirm('Bạn có chắc chắn muốn đặt lại các chỉ số KPI về mặc định tiêu chuẩn?')) {
      setForm({ ...DEFAULT_KPI_CONFIG });
      showToast('Đã đặt lại thông số về mặc định. Nhớ bấm "Lưu cấu hình" để áp dụng.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-teal-50/50 to-white border border-blue-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 leading-tight">
              Cấu hình chỉ số quản trị phòng mổ (OR KPI Standards)
            </h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              Các tham số này được dùng làm tiêu chuẩn đánh giá trên <strong>Bảng điều khiển Quản trị phòng mổ (OR Analytics Dashboard)</strong>, bao gồm tỷ lệ công suất bàn mổ, thời gian dọn phòng/chuyển ca, và ngưỡng phát hiện ca mổ bất thường.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Khối 1: Tiêu chuẩn công suất phòng mổ */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <Sliders className="h-4 w-4 text-blue-600" />
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              1. Tiêu chuẩn công suất & Thời gian mở phòng (OR Utilization)
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Số giờ hoạt động chuẩn / bàn mổ / ngày
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  disabled={isLocked}
                  value={form.standardHoursPerDay}
                  onChange={(e) => setForm({ ...form, standardHoursPerDay: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">giờ / ngày</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Mặc định: 8.0 giờ/ngày (ca làm việc hành chính). Dùng để tính % công suất lấp đầy bàn mổ.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Số ngày làm việc tiêu chuẩn trong tháng
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={31}
                  disabled={isLocked}
                  value={form.operatingDaysPerMonth}
                  onChange={(e) => setForm({ ...form, operatingDaysPerMonth: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">ngày / tháng</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Mặc định: 22 ngày (trừ Thứ 7, Chủ Nhật).
              </p>
            </div>
          </div>
        </div>

        {/* Khối 2: Thời gian chuyển giao ca mổ (Turnaround Time - TAT) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <Clock className="h-4 w-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              2. Tiêu chuẩn thời gian chuyển ca (Turnaround Time - TAT)
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Thời gian chuyển ca mục tiêu (Target TAT)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={5}
                  max={120}
                  disabled={isLocked}
                  value={form.targetTurnaroundMinutes}
                  onChange={(e) => setForm({ ...form, targetTurnaroundMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">phút</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Khoảng cách lý tưởng từ khi ca trước ra khỏi phòng đến khi ca sau vào bàn (mặc định 25 phút).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ngưỡng cảnh báo chuyển ca chậm (Warning TAT)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={10}
                  max={180}
                  disabled={isLocked}
                  value={form.warningTurnaroundMinutes}
                  onChange={(e) => setForm({ ...form, warningTurnaroundMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">phút</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Nếu khoảng cách giữa 2 ca vượt quá mốc này, hệ thống sẽ gắn nhãn cảnh báo chậm trễ (mặc định 40 phút).
              </p>
            </div>
          </div>
        </div>

        {/* Khối 3: Cảnh báo bất thường thời lượng & Chi phí */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <Activity className="h-4 w-4 text-amber-600" />
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              3. Ngưỡng phát hiện ca mổ bất thường & Vượt định mức chi phí
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ngưỡng ca mổ quá ngắn
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={60}
                  disabled={isLocked}
                  value={form.minOutlierMinutes}
                  onChange={(e) => setForm({ ...form, minOutlierMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">phút</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Ca mổ ngắn hơn mốc này sẽ được gắn cờ xem xét lại hồ sơ (mặc định &lt; 15 phút).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Ngưỡng ca mổ kéo dài bất thường
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={60}
                  max={1440}
                  step={30}
                  disabled={isLocked}
                  value={form.maxOutlierMinutes}
                  onChange={(e) => setForm({ ...form, maxOutlierMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">phút</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Ca mổ dài hơn mốc này sẽ được cảnh báo (mặc định 360 phút = 6 giờ).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Cảnh báo chi phí vượt trần
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={10}
                  max={300}
                  step={5}
                  disabled={isLocked}
                  value={form.costOverrunThresholdPct}
                  onChange={(e) => setForm({ ...form, costOverrunThresholdPct: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">% giá thu</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Khi chi phí thuốc + VTTH vượt tỷ lệ này so với giá viện phí thu về.
              </p>
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isLocked}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-gray-500" />
            Khôi phục mặc định
          </button>

          <button
            type="submit"
            disabled={isLocked || saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Đang lưu...' : 'Lưu cấu hình KPI'}
          </button>
        </div>
      </form>
    </div>
  );
};
