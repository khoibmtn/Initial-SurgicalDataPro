/**
 * ServicePackageSettingsConfig — Thiết lập module gói dịch vụ
 * Toggle cho phép điều chỉnh PTV chính/phụ... sau auto-fill
 */
import React, { useState, useEffect } from 'react';
import { Settings, ToggleLeft, ToggleRight, Printer, Save, Check } from 'lucide-react';
import { ServicePackageModuleConfig, DEFAULT_MODULE_CONFIG } from '../../types/servicePackage';
import { subscribeToModuleConfig, saveModuleConfig } from '../../services/servicePackageService';

export const ServicePackageSettingsConfig: React.FC = () => {
  const [config, setConfig] = useState<ServicePackageModuleConfig>(DEFAULT_MODULE_CONFIG);
  const [printTitle, setPrintTitle] = useState<string>(DEFAULT_MODULE_CONFIG.printTitle || 'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToModuleConfig((c) => {
      setConfig(c);
      if (c.printTitle) {
        setPrintTitle(c.printTitle);
      }
    });
    return () => unsub();
  }, []);

  const handleToggle = async (key: keyof ServicePackageModuleConfig) => {
    const updated = { ...config, [key]: !config[key] };
    setConfig(updated);
    await saveModuleConfig(updated);
  };

  const handleSavePrintTitle = async () => {
    const updated = { ...config, printTitle: printTitle.trim() || 'BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU' };
    setConfig(updated);
    await saveModuleConfig(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 bg-gray-100 text-gray-600 rounded-lg"><Settings className="h-4 w-4" /></div>
        <div>
          <h4 className="font-semibold text-gray-800 text-sm">Thiết lập module</h4>
          <p className="text-[11px] text-gray-400">Tùy chỉnh hành vi và bản in của module gói dịch vụ</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Print title customization */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-800">
            <Printer className="h-4 w-4 text-teal-600" />
            <span>Tiêu đề bản in bảng thanh toán gói dịch vụ</span>
          </div>
          <p className="text-[11px] text-gray-400">
            Tiêu đề xuất hiện ở đầu trang khi in bảng thanh toán gói dịch vụ phẫu thuật.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={printTitle}
              onChange={(e) => setPrintTitle(e.target.value)}
              placeholder="BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU"
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none uppercase"
            />
            <button
              onClick={handleSavePrintTitle}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
            >
              {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              <span>{isSaved ? 'Đã lưu' : 'Lưu tiêu đề'}</span>
            </button>
          </div>
        </div>

        {/* Toggle: Allow override auto-filled staff */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-700">Cho phép điều chỉnh nhân sự tự động</div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Khi bật: User có thể thay đổi PTV chính, PTV phụ, BS gây mê... sau khi hệ thống tự động lấy từ DS phẫu thuật.
              <br />Khi tắt: Các vị trí tự động lấy sẽ bị khóa, user chỉ có thể chọn nhân sự cho các vị trí ngoài cuộc mổ (Chuẩn bị PT, Tư vấn...).
            </p>
          </div>
          <button onClick={() => handleToggle('allowOverrideAutoFilledStaff')} className="ml-4 p-0.5 transition-colors shrink-0">
            {config.allowOverrideAutoFilledStaff
              ? <ToggleRight className="h-7 w-7 text-emerald-500" />
              : <ToggleLeft className="h-7 w-7 text-gray-300" />
            }
          </button>
        </div>
      </div>
    </div>
  );
};
