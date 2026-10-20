import React, { useState, useRef, useEffect } from 'react';
import { Bot, ChevronDown, Sliders, Check, KeyRound } from 'lucide-react';
import {
  AIProviderId,
  AIReasoningEffort,
  AISlotConfig,
  AISlotId,
  AISystemConfig,
  AIPersonalOverride,
} from '../../types/ai';
import {
  getAvailableModelsCatalog,
  updatePersonalSlotOverride,
} from '../../services/ai/aiConfigService';

interface AIModelQuickSelectorProps {
  slotId: AISlotId;
  activeSlotConfig: AISlotConfig;
  systemConfig: AISystemConfig;
  personalOverride: AIPersonalOverride;
  onSlotConfigChange: (nextSlot: AISlotConfig) => void;
  onOpenAIConfigTab?: () => void;
}

export const AIModelQuickSelector: React.FC<AIModelQuickSelectorProps> = ({
  slotId,
  activeSlotConfig,
  systemConfig,
  personalOverride,
  onSlotConfigChange,
  onOpenAIConfigTab,
}) => {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const modelsCatalog = getAvailableModelsCatalog(systemConfig, personalOverride);
  const currentModelMeta = modelsCatalog.find(
    (m) => m.provider === activeSlotConfig.provider && m.id === activeSlotConfig.modelId
  );

  const handleSelectModel = (provider: AIProviderId, modelId: string) => {
    const next: AISlotConfig = {
      ...activeSlotConfig,
      provider,
      modelId,
    };
    updatePersonalSlotOverride(slotId, { provider, modelId });
    onSlotConfigChange(next);
  };

  const handleChangeTemperature = (temperature: number) => {
    const next: AISlotConfig = {
      ...activeSlotConfig,
      temperature,
    };
    updatePersonalSlotOverride(slotId, { temperature });
    onSlotConfigChange(next);
  };

  const handleChangeEffort = (reasoningEffort: AIReasoningEffort) => {
    const next: AISlotConfig = {
      ...activeSlotConfig,
      reasoningEffort,
    };
    updatePersonalSlotOverride(slotId, { reasoningEffort });
    onSlotConfigChange(next);
  };

  const effortBadgeLabel =
    activeSlotConfig.reasoningEffort === 'high'
      ? 'Effort: Cao'
      : activeSlotConfig.reasoningEffort === 'low'
      ? 'Effort: Nhanh'
      : 'Effort: Chuẩn';

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
        title="Đổi mô hình AI, mức độ suy luận (Effort) và Temperature"
      >
        <Bot className="h-3.5 w-3.5 text-sky-600 shrink-0" />
        <span className="truncate max-w-[155px]">
          {currentModelMeta ? currentModelMeta.name : activeSlotConfig.modelId}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium hidden sm:inline">
          {effortBadgeLabel}
        </span>
        <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-80 rounded-xl bg-white border border-slate-200 shadow-xl z-50 p-3 space-y-3 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Sliders className="h-3.5 w-3.5 text-sky-600" />
              <span>Chọn Mô hình & Độ thông minh AI</span>
            </div>
            {onOpenAIConfigTab && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenAIConfigTab();
                }}
                className="text-[11px] font-semibold text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="h-3 w-3" />
                <span>Cấu hình Key</span>
              </button>
            )}
          </div>

          {/* Models List Grouped by Provider */}
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {modelsCatalog.map((m) => {
              const isSelected =
                m.provider === activeSlotConfig.provider && m.id === activeSlotConfig.modelId;
              return (
                <button
                  key={`${m.provider}_${m.id}`}
                  type="button"
                  onClick={() => handleSelectModel(m.provider, m.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50/90 border-sky-300 text-sky-900 font-semibold'
                      : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{m.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
                        {m.providerName}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{m.id}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        m.hasApiKey ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}
                      title={
                        m.hasApiKey
                          ? 'Đã có API Key sẵn sàng'
                          : 'Chưa cấu hình API Key cho hãng này'
                      }
                    />
                    {isSelected && <Check className="h-3.5 w-3.5 text-sky-600" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Reasoning Effort & Temperature */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                <span>Mức suy luận (Reasoning Effort)</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['low', 'medium', 'high'] as AIReasoningEffort[]).map((eff) => (
                  <button
                    key={eff}
                    type="button"
                    onClick={() => handleChangeEffort(eff)}
                    className={`py-1 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      activeSlotConfig.reasoningEffort === eff
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {eff === 'low' ? 'Low (Nhanh)' : eff === 'medium' ? 'Medium' : 'High (Sâu)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                <span>Temperature (Độ sáng tạo)</span>
                <span className="font-mono text-sky-700 font-bold">
                  {activeSlotConfig.temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={activeSlotConfig.temperature}
                onChange={(e) => handleChangeTemperature(parseFloat(e.target.value))}
                className="w-full accent-sky-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0.0 (Số liệu chuẩn)</span>
                <span>1.5 (Diễn giải rộng)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
