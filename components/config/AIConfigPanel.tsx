import React, { useState, useEffect } from 'react';
import {
  Bot,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Zap,
  ShieldCheck,
  UserCheck,
  Cpu,
} from 'lucide-react';
import {
  AIProviderId,
  AIProviderConfig,
  AISlotId,
  AISlotConfig,
  AISystemConfig,
  AIPersonalOverride,
  AIReasoningEffort,
} from '../../types/ai';
import {
  subscribeToAISystemConfig,
  saveAISystemConfig,
  loadPersonalAIOverride,
  savePersonalAIOverride,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_SLOT_CONFIGS,
  getEffectiveProviderConfig,
} from '../../services/ai/aiConfigService';
import { testProviderConnection } from '../../services/ai/aiProviderClient';
import { useAuth } from '../../contexts/AuthContext';

const PROVIDER_ORDER: AIProviderId[] = ['gemini', 'openai', 'anthropic', 'deepseek'];
const SLOT_ORDER: AISlotId[] = [
  'daily_storage',
  'monthly_storage',
  'statistics_studio',
  'conflict_insight',
];

const PROVIDER_THEME: Record<
  AIProviderId,
  { border: string; headerBg: string; badgeBg: string; accentText: string }
> = {
  gemini: {
    border: 'border-sky-200',
    headerBg: 'bg-sky-50/80',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
    accentText: 'text-sky-700',
  },
  openai: {
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-50/80',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    accentText: 'text-emerald-700',
  },
  anthropic: {
    border: 'border-amber-200',
    headerBg: 'bg-amber-50/80',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-200',
    accentText: 'text-amber-800',
  },
  deepseek: {
    border: 'border-teal-200',
    headerBg: 'bg-teal-50/80',
    badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
    accentText: 'text-teal-700',
  },
};

export const AIConfigPanel: React.FC = () => {
  const { user, isAdmin, can } = useAuth();
  const canEditSystem = isAdmin || can('config_ai_settings');

  const [systemConfig, setSystemConfig] = useState<AISystemConfig | null>(null);
  const [personalOverride, setPersonalOverride] = useState<AIPersonalOverride>(() =>
    loadPersonalAIOverride()
  );

  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [testingMap, setTestingMap] = useState<Record<AIProviderId, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    deepseek: false,
  });
  const [selectedTestModelMap, setSelectedTestModelMap] = useState<Record<AIProviderId, string>>({
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4.1-mini',
    anthropic: 'claude-sonnet-4-20250514',
    deepseek: 'deepseek-chat',
  });
  const [newModelInput, setNewModelInput] = useState<
    Record<AIProviderId, { id: string; name: string }>
  >({
    gemini: { id: '', name: '' },
    openai: { id: '', name: '' },
    anthropic: { id: '', name: '' },
    deepseek: { id: '', name: '' },
  });
  const [savingProvider, setSavingProvider] = useState<AIProviderId | 'ALL' | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(
    null
  );

  useEffect(() => {
    const unsub = subscribeToAISystemConfig((cfg) => {
      setSystemConfig(cfg);
    });
    return () => unsub();
  }, []);

  if (!systemConfig) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500 gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Đang tải cấu hình AI...</span>
      </div>
    );
  }

  const updateProviderField = (
    providerId: AIProviderId,
    patch: Partial<AIProviderConfig>
  ) => {
    setSystemConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...prev.providers[providerId],
            ...patch,
          },
        },
      };
    });
  };

  const updateSlotField = (slotId: AISlotId, patch: Partial<AISlotConfig>) => {
    setSystemConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: {
            ...prev.slots[slotId],
            ...patch,
          },
        },
      };
    });

    // Đồng bộ luôn vào personal override nếu user không phải Admin để họ dùng ngay
    if (!canEditSystem) {
      const nextPersonal: AIPersonalOverride = {
        ...personalOverride,
        slotOverrides: {
          ...(personalOverride.slotOverrides || {}),
          [slotId]: {
            ...(personalOverride.slotOverrides?.[slotId] || {}),
            ...patch,
          },
        },
      };
      setPersonalOverride(nextPersonal);
      savePersonalAIOverride(nextPersonal);
    }
  };

  const handleToggleModelEnabled = (providerId: AIProviderId, modelId: string) => {
    const provider = systemConfig.providers[providerId];
    const updatedModels = provider.models.map((m) =>
      m.id === modelId ? { ...m, enabled: !m.enabled } : m
    );
    updateProviderField(providerId, { models: updatedModels });
  };

  const handleAddCustomModel = (providerId: AIProviderId) => {
    const input = newModelInput[providerId];
    const cleanId = (input?.id || '').trim();
    const cleanName = (input?.name || '').trim() || cleanId;
    if (!cleanId) return;

    const provider = systemConfig.providers[providerId];
    if (provider.models.some((m) => m.id === cleanId)) return;

    const updatedModels = [
      ...provider.models,
      {
        id: cleanId,
        name: cleanName,
        provider: providerId,
        description: 'Mô hình tùy chỉnh do người dùng thêm',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
        isCustom: true,
      },
    ];
    updateProviderField(providerId, { models: updatedModels });
    setNewModelInput((prev) => ({
      ...prev,
      [providerId]: { id: '', name: '' },
    }));
  };

  const handleDeleteCustomModel = (providerId: AIProviderId, modelId: string) => {
    const provider = systemConfig.providers[providerId];
    const updatedModels = provider.models.filter((m) => m.id !== modelId);
    updateProviderField(providerId, { models: updatedModels });
  };

  const handleTestProvider = async (providerId: AIProviderId) => {
    setTestingMap((prev) => ({ ...prev, [providerId]: true }));
    try {
      const effectiveProvider = getEffectiveProviderConfig(
        providerId,
        systemConfig,
        personalOverride
      );
      const targetModel =
        selectedTestModelMap[providerId] ||
        effectiveProvider.models.find((m) => m.enabled)?.id ||
        effectiveProvider.models[0]?.id;

      const res = await testProviderConnection(effectiveProvider, targetModel);

      updateProviderField(providerId, {
        lastTestedAt: Date.now(),
        lastTestStatus: res.success ? 'success' : 'error',
        lastTestMessage: res.message,
        lastTestLatencyMs: res.latencyMs,
      });
    } finally {
      setTestingMap((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSaveConfig = async (scope: AIProviderId | 'ALL' = 'ALL') => {
    setSavingProvider(scope);
    try {
      savePersonalAIOverride(personalOverride);
      if (canEditSystem) {
        await saveAISystemConfig(
          systemConfig,
          user?.displayName || user?.nickname || user?.email || 'Admin'
        );
        setSaveMessage({
          text:
            scope === 'ALL'
              ? 'Đã lưu toàn bộ cấu hình AI lên hệ thống Firebase & bộ nhớ đệm!'
              : `Đã lưu cấu hình mô hình ${systemConfig.providers[scope].name} thành công!`,
          type: 'success',
        });
      } else {
        setSaveMessage({
          text: 'Đã lưu cấu hình AI cá nhân trên trình duyệt của bạn!',
          type: 'info',
        });
      }
      setTimeout(() => setSaveMessage(null), 4000);
    } finally {
      setSavingProvider(null);
    }
  };

  return (
    <div className="space-y-6 pb-8 max-w-7xl mx-auto">
      {/* Banner Header & Hybrid Mode Switch */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300">
              <Bot className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold tracking-tight">
              Trung tâm Cấu hình Đa Mô Hình AI & Phân tích Số liệu Y khoa
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            Thiết lập kết nối tới <span className="font-semibold text-white">Google Gemini, OpenAI, Anthropic Claude, DeepSeek</span>. Hỗ trợ tùy chỉnh Base URL, chọn phiên bản mô hình cho từng vị trí trong ứng dụng và tinh chỉnh độ thông minh (<span className="font-mono text-sky-300">Temperature</span>, <span className="font-mono text-emerald-300">Reasoning Effort</span>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={personalOverride.usePersonalKeys}
              onChange={(e) => {
                const next = { ...personalOverride, usePersonalKeys: e.target.checked };
                setPersonalOverride(next);
                savePersonalAIOverride(next);
              }}
              className="rounded border-slate-600 text-sky-600 focus:ring-sky-500"
            />
            <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Dùng API Key cá nhân riêng trên máy này</span>
          </label>

          <button
            type="button"
            onClick={() => handleSaveConfig('ALL')}
            disabled={savingProvider !== null}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
          >
            {savingProvider === 'ALL' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Lưu toàn bộ cấu hình AI</span>
          </button>
        </div>
      </div>

      {saveMessage && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium animate-fade-in ${
            saveMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* SECTION 1: 4 AI PROVIDERS CARDS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Key className="h-4 w-4 text-sky-600" />
              <span>1. Kết nối Nhà cung cấp & Phiên bản Mô hình (Providers & Models)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Điền API Key, kiểm tra Base URL (đã điền sẵn mặc định), tích chọn các phiên bản mô hình khả dụng và bấm <b>Test kết nối</b>.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-600" />
            <span>
              {canEditSystem
                ? 'Quyền Admin: Lưu đồng bộ toàn viện (Firebase)'
                : 'Chế độ Nhân viên: Lưu Override cá nhân trên trình duyệt'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PROVIDER_ORDER.map((pid) => {
            const pConfig = systemConfig.providers[pid];
            const theme = PROVIDER_THEME[pid];
            const isKeyVisible = Boolean(showKeyMap[pid]);
            const isTesting = testingMap[pid];

            const activeKeyValue = personalOverride.usePersonalKeys
              ? personalOverride.providerKeys?.[pid] ?? ''
              : pConfig.apiKey || '';

            const hasSystemKey = Boolean(pConfig.apiKey && pConfig.apiKey.trim());
            const hasPersonalKey = Boolean(
              personalOverride.providerKeys?.[pid] && personalOverride.providerKeys?.[pid]?.trim()
            );

            return (
              <div
                key={pid}
                className={`rounded-xl border ${theme.border} bg-white shadow-xs flex flex-col overflow-hidden`}
              >
                {/* Provider Card Header */}
                <div
                  className={`px-4 py-3 ${theme.headerBg} border-b ${theme.border} flex items-center justify-between gap-2`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={pConfig.enabled}
                      onChange={(e) => updateProviderField(pid, { enabled: e.target.checked })}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4 cursor-pointer"
                      title="Bật/tắt nhà cung cấp này"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{pConfig.name}</span>
                        {pConfig.badgeText && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${theme.badgeBg}`}
                          >
                            {pConfig.badgeText}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasSystemKey && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Key Hệ thống: Đã nạp
                      </span>
                    )}
                    {personalOverride.usePersonalKeys && hasPersonalKey && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                        Key Cá nhân: Đang bật
                      </span>
                    )}
                  </div>
                </div>

                {/* Provider Card Body */}
                <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    {/* API Key Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Key className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {personalOverride.usePersonalKeys
                              ? `API Key Cá nhân (${pConfig.name})`
                              : `API Key Hệ thống (${pConfig.name})`}
                          </span>
                        </label>
                        {!personalOverride.usePersonalKeys && !canEditSystem && (
                          <span className="text-[11px] text-amber-700 font-medium">
                            Bật "Dùng API Key cá nhân" ở trên để nhập key riêng
                          </span>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type={isKeyVisible ? 'text' : 'password'}
                          value={activeKeyValue}
                          disabled={!personalOverride.usePersonalKeys && !canEditSystem}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (personalOverride.usePersonalKeys) {
                              const next: AIPersonalOverride = {
                                ...personalOverride,
                                providerKeys: {
                                  ...(personalOverride.providerKeys || {}),
                                  [pid]: val,
                                },
                              };
                              setPersonalOverride(next);
                            } else {
                              updateProviderField(pid, { apiKey: val });
                            }
                          }}
                          placeholder={`Nhập API Key cho ${pConfig.name} (VD: sk-..., AIza...)`}
                          className="w-full pl-3 pr-9 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none disabled:bg-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowKeyMap((prev) => ({ ...prev, [pid]: !prev[pid] }))
                          }
                          className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          title={isKeyVisible ? 'Ẩn API Key' : 'Hiện API Key'}
                        >
                          {isKeyVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Base URL Input with Default Reset */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-slate-400" />
                          <span>Base URL (Endpoint mặc định điền sẵn)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            updateProviderField(pid, {
                              baseUrl: DEFAULT_PROVIDER_CONFIGS[pid].defaultBaseUrl,
                            })
                          }
                          className="text-[11px] text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
                          title="Khôi phục Base URL mặc định của hãng"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Mặc định</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={pConfig.baseUrl}
                        onChange={(e) => updateProviderField(pid, { baseUrl: e.target.value })}
                        placeholder={pConfig.defaultBaseUrl}
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>

                    {/* Available Models List */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-slate-400" />
                          <span>Các mô hình & phiên bản khả dụng ({pConfig.models.filter((m) => m.enabled).length}/{pConfig.models.length})</span>
                        </label>
                        <span className="text-[11px] text-slate-400">
                          Tích chọn để hiển thị trong ứng dụng
                        </span>
                      </div>

                      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto bg-slate-50/40">
                        {pConfig.models.map((m) => (
                          <div
                            key={m.id}
                            className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-white transition-colors"
                          >
                            <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={m.enabled}
                                onChange={() => handleToggleModelEnabled(pid, m.id)}
                                className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-800">
                                    {m.name}
                                  </span>
                                  <code className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                    {m.id}
                                  </code>
                                  {m.supportsReasoning && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
                                      Reasoning
                                    </span>
                                  )}
                                </div>
                                {m.description && (
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {m.description}
                                  </p>
                                )}
                              </div>
                            </label>

                            {m.isCustom && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomModel(pid, m.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                                title="Xóa mô hình tùy chỉnh"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add custom model version row */}
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newModelInput[pid]?.id || ''}
                          onChange={(e) =>
                            setNewModelInput((prev) => ({
                              ...prev,
                              [pid]: { ...(prev[pid] || { name: '' }), id: e.target.value },
                            }))
                          }
                          placeholder="Thêm mã model mới (VD: gpt-4.1-nano)..."
                          className="flex-1 px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-500 outline-none"
                        />
                        <input
                          type="text"
                          value={newModelInput[pid]?.name || ''}
                          onChange={(e) =>
                            setNewModelInput((prev) => ({
                              ...prev,
                              [pid]: { ...(prev[pid] || { id: '' }), name: e.target.value },
                            }))
                          }
                          placeholder="Tên hiển thị..."
                          className="w-36 px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddCustomModel(pid)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-300 cursor-pointer shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Thêm</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Status & Footer Actions */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    {pConfig.lastTestStatus && pConfig.lastTestStatus !== 'untested' && (
                      <div
                        className={`px-3 py-2 rounded-lg border text-xs flex items-start gap-2 ${
                          pConfig.lastTestStatus === 'success'
                            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50/90 border-rose-200 text-rose-800'
                        }`}
                      >
                        {pConfig.lastTestStatus === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold break-words">{pConfig.lastTestMessage}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-medium">Model test:</span>
                        <select
                          value={
                            selectedTestModelMap[pid] ||
                            pConfig.models.find((m) => m.enabled)?.id ||
                            ''
                          }
                          onChange={(e) =>
                            setSelectedTestModelMap((prev) => ({
                              ...prev,
                              [pid]: e.target.value,
                            }))
                          }
                          className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
                        >
                          {pConfig.models
                            .filter((m) => m.enabled)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTestProvider(pid)}
                          disabled={isTesting}
                          className="px-3 py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isTesting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Zap className="h-3.5 w-3.5 text-sky-600" />
                          )}
                          <span>Test kết nối</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveConfig(pid)}
                          disabled={savingProvider !== null}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {savingProvider === pid ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          <span>Lưu mô hình</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: AI SLOTS & INTELLIGENCE PARAMETERS */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-600" />
              <span>
                2. Phân bổ Mô hình theo Vị trí trong Ứng dụng & Điều chỉnh Độ thông minh (AI Slots)
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Mỗi vị trí tương tác AI trong ứng dụng được gán 1 mô hình mặc định cùng thông số <b>Temperature</b> (độ chính xác vs sáng tạo) và <b>Reasoning Effort</b> (chiều sâu suy luận). Người dùng vẫn có thể đổi nhanh mô hình ngay trong cửa sổ chat.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSystemConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      slots: structuredClone(DEFAULT_SLOT_CONFIGS),
                    }
                  : prev
              );
            }}
            className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Đặt lại vị trí mặc định</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SLOT_ORDER.map((slotId) => {
            const slot = systemConfig.slots[slotId];
            const selectedProvider =
              systemConfig.providers[slot.provider] || systemConfig.providers.gemini;
            const enabledModels = selectedProvider.models.filter((m) => m.enabled);

            return (
              <div
                key={slotId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3.5"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-sky-600 shrink-0" />
                      <h4 className="font-bold text-slate-900 text-sm">{slot.label}</h4>
                    </div>
                    <p className="text-[11px] font-medium text-sky-700 mt-0.5">
                      Vị trí: {slot.locationHint}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{slot.description}</p>
                  </div>
                </div>

                {/* Provider & Model Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nhà cung cấp (Provider)
                    </label>
                    <select
                      value={slot.provider}
                      onChange={(e) => {
                        const nextProvider = e.target.value as AIProviderId;
                        const firstModel =
                          systemConfig.providers[nextProvider]?.models.find((m) => m.enabled)?.id ||
                          systemConfig.providers[nextProvider]?.models[0]?.id ||
                          '';
                        updateSlotField(slotId, {
                          provider: nextProvider,
                          modelId: firstModel,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-sky-500 outline-none"
                    >
                      {PROVIDER_ORDER.map((pid) => (
                        <option key={pid} value={pid}>
                          {systemConfig.providers[pid].name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mô hình mặc định (Model)
                    </label>
                    <select
                      value={slot.modelId}
                      onChange={(e) => updateSlotField(slotId, { modelId: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-sky-500 outline-none"
                    >
                      {enabledModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Intelligence Parameters: Temperature, Reasoning Effort, Max Tokens */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 bg-slate-50/70 p-3 rounded-lg border border-slate-200/80">
                  {/* Temperature */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Temperature
                      </label>
                      <span className="text-[11px] font-mono font-bold text-sky-700">
                        {slot.temperature.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.1}
                      value={slot.temperature}
                      onChange={(e) =>
                        updateSlotField(slotId, { temperature: parseFloat(e.target.value) })
                      }
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>0.0 (Chính xác)</span>
                      <span>1.5 (Sáng tạo)</span>
                    </div>
                  </div>

                  {/* Reasoning Effort */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Mức suy luận (Effort)
                    </label>
                    <select
                      value={slot.reasoningEffort}
                      onChange={(e) =>
                        updateSlotField(slotId, {
                          reasoningEffort: e.target.value as AIReasoningEffort,
                        })
                      }
                      className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
                    >
                      <option value="low">Low (Phản hồi nhanh)</option>
                      <option value="medium">Medium (Cân bằng)</option>
                      <option value="high">High (Phân tích sâu)</option>
                    </select>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Max Output Tokens
                    </label>
                    <select
                      value={slot.maxTokens}
                      onChange={(e) =>
                        updateSlotField(slotId, { maxTokens: Number(e.target.value) })
                      }
                      className="w-full px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
                    >
                      <option value={2048}>2,048 tokens (Ngắn gọn)</option>
                      <option value={4096}>4,096 tokens (Chuẩn)</option>
                      <option value={8192}>8,192 tokens (Báo cáo dài)</option>
                      <option value={16384}>16,384 tokens (Toàn diện)</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
