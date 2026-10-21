import React, { useState, useEffect } from 'react';
import {
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Settings,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  Wifi,
  Trash2,
  Star,
  X,
  Sliders,
} from 'lucide-react';
import {
  AIDeclaredModelProfile,
  AIProviderId,
  AIReasoningEffort,
  AISlotId,
  AISystemConfig,
} from '../../types/ai';
import {
  DEFAULT_AI_SYSTEM_CONFIG,
  DEFAULT_PROVIDER_CONFIGS,
  loadCachedAISystemConfig,
  loadPersonalAIOverride,
  maskApiKeyPreview,
  saveAISystemConfig,
  savePersonalAIOverride,
  subscribeToAISystemConfig,
} from '../../services/ai/aiConfigService';
import {
  AIFetchedModelItem,
  fetchModelsFromProviderAPI,
  testProviderConnection,
} from '../../services/ai/aiProviderClient';

interface AIConfigPanelProps {
  currentUserEmail?: string;
  isAdmin?: boolean;
}

const PROVIDER_ORDER: AIProviderId[] = ['gemini', 'openai', 'anthropic', 'deepseek'];

const PROVIDER_META: Record<
  AIProviderId,
  {
    label: string;
    quickBtnClass: string;
    quickBtnActiveClass: string;
    badgeClass: string;
    keyPlaceholder: string;
  }
> = {
  gemini: {
    label: 'Google Gemini',
    quickBtnClass:
      'bg-emerald-100/80 text-emerald-800 border-emerald-300 hover:bg-emerald-200/70',
    quickBtnActiveClass:
      'bg-emerald-100 text-emerald-900 border-emerald-700 ring-2 ring-emerald-500/30',
    badgeClass: 'bg-emerald-100/90 text-emerald-800 border-emerald-300',
    keyPlaceholder: 'Nhập API Key (AIzaSy...)...',
  },
  openai: {
    label: 'OpenAI',
    quickBtnClass: 'bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100',
    quickBtnActiveClass: 'bg-teal-50 text-teal-900 border-sky-700 ring-2 ring-sky-500/30',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-300',
    keyPlaceholder: 'Nhập API Key (sk-proj-...)...',
  },
  anthropic: {
    label: 'Anthropic Claude',
    quickBtnClass: 'bg-amber-100/80 text-amber-900 border-amber-300 hover:bg-amber-200/70',
    quickBtnActiveClass:
      'bg-amber-100 text-amber-950 border-amber-700 ring-2 ring-amber-500/30',
    badgeClass: 'bg-amber-100/90 text-amber-900 border-amber-300',
    keyPlaceholder: 'Nhập API Key (sk-ant-...)...',
  },
  deepseek: {
    label: 'DeepSeek',
    quickBtnClass: 'bg-sky-100/80 text-sky-800 border-sky-300 hover:bg-sky-200/70',
    quickBtnActiveClass: 'bg-sky-100 text-sky-950 border-sky-700 ring-2 ring-sky-500/30',
    badgeClass: 'bg-sky-100/90 text-sky-800 border-sky-300',
    keyPlaceholder: 'Nhập API Key (sk-...)...',
  },
};

const SLOT_ORDER: AISlotId[] = [
  'daily_storage',
  'monthly_storage',
  'statistics_studio',
  'conflict_insight',
];

export const AIConfigPanel: React.FC<AIConfigPanelProps> = ({
  currentUserEmail,
  isAdmin = true,
}) => {
  void isAdmin;
  const [systemConfig, setSystemConfig] = useState<AISystemConfig>(() =>
    loadCachedAISystemConfig()
  );

  // Add New Model Form State (MCQ style)
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [formProvider, setFormProvider] = useState<AIProviderId>('openai');
  const [formModelId, setFormModelId] = useState<string>('gpt-4o');
  const [formCustomModelId, setFormCustomModelId] = useState<string>('');
  const [formCustomModelName, setFormCustomModelName] = useState<string>('');
  const [formApiKey, setFormApiKey] = useState<string>('');
  const [formShowKey, setFormShowKey] = useState<boolean>(false);
  const [formBaseUrl, setFormBaseUrl] = useState<string>(
    DEFAULT_PROVIDER_CONFIGS.openai.defaultBaseUrl
  );
  const [formTemp, setFormTemp] = useState<number>(0.3);
  const [formMaxTokens, setFormMaxTokens] = useState<number>(2048);
  const [formSupportsVision, setFormSupportsVision] = useState<boolean>(true);
  const [formActive, setFormActive] = useState<boolean>(true);
  const [formTesting, setFormTesting] = useState<boolean>(false);
  const [formTestResult, setFormTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [fetchingApiModels, setFetchingApiModels] = useState<boolean>(false);
  const [fetchedModelsByProvider, setFetchedModelsByProvider] = useState<
    Partial<Record<AIProviderId, AIFetchedModelItem[]>>
  >({});
  const [fetchApiNotice, setFetchApiNotice] = useState<string | null>(null);

  // Per-card states
  const [testingCardId, setTestingCardId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [visibleCardKeyMap, setVisibleCardKeyMap] = useState<Record<string, boolean>>({});
  const [showSlotRouting, setShowSlotRouting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToAISystemConfig((cfg) => {
      setSystemConfig(cfg);
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const declaredModels: AIDeclaredModelProfile[] =
    systemConfig.declaredModels && systemConfig.declaredModels.length > 0
      ? systemConfig.declaredModels
      : DEFAULT_AI_SYSTEM_CONFIG.declaredModels || [];

  // Helper to get combined preset + API-fetched models for a provider
  const getModelsForProviderSelect = (providerId: AIProviderId): AIFetchedModelItem[] => {
    const pCfg = systemConfig.providers[providerId] || DEFAULT_PROVIDER_CONFIGS[providerId];
    const map = new Map<string, AIFetchedModelItem>();
    pCfg.models.forEach((m) => {
      map.set(m.id, {
        id: m.id,
        name: m.name,
        description: m.description || 'Đa phương thức mạnh mẽ (Vision + Text)',
        supportsVision: !m.id.includes('reasoner'),
      });
    });
    (fetchedModelsByProvider[providerId] || []).forEach((fm) => {
      if (!map.has(fm.id)) {
        map.set(fm.id, fm);
      }
    });
    return Array.from(map.values());
  };

  // Open the "+ Khai báo mô hình AI mới" form pre-filled for a provider
  const handleOpenAddForm = (providerId: AIProviderId = 'gemini') => {
    const pCfg = systemConfig.providers[providerId] || DEFAULT_PROVIDER_CONFIGS[providerId];
    const existingCardWithKey = declaredModels.find(
      (dm) => dm.provider === providerId && dm.apiKey && dm.apiKey.trim()
    );
    const defaultModel =
      providerId === 'openai'
        ? pCfg.models.find((m) => m.id === 'gpt-4o') || pCfg.models[0]
        : pCfg.models[0];

    setFormProvider(providerId);
    setFormModelId(defaultModel?.id || '');
    setFormCustomModelId('');
    setFormCustomModelName('');
    setFormApiKey(existingCardWithKey?.apiKey || pCfg.apiKey || '');
    setFormBaseUrl(pCfg.baseUrl || pCfg.defaultBaseUrl);
    setFormTemp(0.3);
    setFormMaxTokens(2048);
    setFormSupportsVision(true);
    setFormActive(true);
    setFormTestResult(null);
    setFetchApiNotice(null);
    setShowAddForm(true);
  };

  const handleProviderChangeInForm = (nextProvider: AIProviderId) => {
    const pCfg = systemConfig.providers[nextProvider] || DEFAULT_PROVIDER_CONFIGS[nextProvider];
    const existingCardWithKey = declaredModels.find(
      (dm) => dm.provider === nextProvider && dm.apiKey && dm.apiKey.trim()
    );
    const defaultModel =
      nextProvider === 'openai'
        ? pCfg.models.find((m) => m.id === 'gpt-4o') || pCfg.models[0]
        : pCfg.models[0];

    setFormProvider(nextProvider);
    setFormModelId(defaultModel?.id || '');
    setFormCustomModelId('');
    setFormCustomModelName('');
    setFormApiKey(existingCardWithKey?.apiKey || pCfg.apiKey || '');
    setFormBaseUrl(pCfg.baseUrl || pCfg.defaultBaseUrl);
    setFormTemp(0.3);
    setFormMaxTokens(2048);
    setFormSupportsVision(true);
    setFormTestResult(null);
    setFetchApiNotice(null);
  };

  // Persist changes to systemConfig + clear conflicting personal overrides so changes apply immediately
  const persistDeclaredModels = async (
    nextDeclared: AIDeclaredModelProfile[],
    nextSlots = systemConfig.slots,
    toastText?: string
  ) => {
    // Ensure at least one default if non-empty
    const cloned = nextDeclared.map((m) => ({ ...m }));
    if (cloned.length > 0 && !cloned.some((m) => m.isDefault)) {
      const firstActive = cloned.find((m) => m.active) || cloned[0];
      firstActive.isDefault = true;
    }

    // Sync providers keys & models from declaredModels
    const nextProviders = structuredClone(systemConfig.providers);
    cloned.forEach((dm) => {
      const pCfg = nextProviders[dm.provider];
      if (!pCfg) return;
      if (dm.apiKey && dm.apiKey.trim()) {
        pCfg.apiKey = dm.apiKey.trim();
      }
      if (dm.baseUrl && dm.baseUrl.trim()) {
        pCfg.baseUrl = dm.baseUrl.trim();
      }
      if (dm.active) {
        pCfg.enabled = true;
      }
    });

    const nextConfig: AISystemConfig = {
      ...systemConfig,
      providers: nextProviders,
      slots: nextSlots,
      declaredModels: cloned,
      updatedAt: Date.now(),
      updatedBy: currentUserEmail,
    };

    setSystemConfig(nextConfig);
    await saveAISystemConfig(nextConfig, currentUserEmail);
    if (toastText) showToast(toastText);
  };

  // Fetch models from live API in form
  const handleFetchModelsFromAPI = async () => {
    setFetchingApiModels(true);
    setFetchApiNotice(null);
    try {
      const defaultUrl = DEFAULT_PROVIDER_CONFIGS[formProvider].defaultBaseUrl;
      const list = await fetchModelsFromProviderAPI(
        formProvider,
        formApiKey,
        formBaseUrl,
        defaultUrl
      );
      if (list.length === 0) {
        setFetchApiNotice('API không trả về danh sách model nào.');
      } else {
        setFetchedModelsByProvider((prev) => ({
          ...prev,
          [formProvider]: list,
        }));
        setFormModelId(list[0].id);
        setFetchApiNotice(`Đã tải thành công ${list.length} model từ API!`);
      }
    } catch (err: any) {
      setFetchApiNotice(`Lỗi tải model: ${err?.message || 'Không xác định'}`);
    } finally {
      setFetchingApiModels(false);
    }
  };

  // Test connection inside the Add Form
  const handleTestInForm = async () => {
    const resolvedModelId =
      formModelId === '__custom__' ? formCustomModelId.trim() : formModelId.trim();
    if (!resolvedModelId) {
      setFormTestResult({
        success: false,
        message: 'Vui lòng chọn hoặc nhập mã Model trước khi Test.',
      });
      return;
    }
    setFormTesting(true);
    setFormTestResult(null);
    try {
      const baseProvider =
        systemConfig.providers[formProvider] || DEFAULT_PROVIDER_CONFIGS[formProvider];
      const result = await testProviderConnection(
        {
          ...baseProvider,
          apiKey: formApiKey.trim(),
          baseUrl: formBaseUrl.trim() || baseProvider.defaultBaseUrl,
        },
        resolvedModelId
      );
      setFormTestResult({
        success: result.success,
        message: result.message,
      });
    } finally {
      setFormTesting(false);
    }
  };

  // Save & Activate New Model from Form
  const handleSaveNewModel = async () => {
    const resolvedModelId =
      formModelId === '__custom__' ? formCustomModelId.trim() : formModelId.trim();
    if (!resolvedModelId) {
      setFormTestResult({
        success: false,
        message: 'Vui lòng chọn hoặc nhập mã Model.',
      });
      return;
    }

    const providerModels = getModelsForProviderSelect(formProvider);
    const matchedMeta = providerModels.find((m) => m.id === resolvedModelId);
    const resolvedName =
      formModelId === '__custom__'
        ? (formCustomModelName || resolvedModelId).trim()
        : matchedMeta?.name || resolvedModelId;

    const newProfileId = `${formProvider}__${resolvedModelId}`;
    const existingIdx = declaredModels.findIndex(
      (m) => m.id === newProfileId || (m.provider === formProvider && m.modelId === resolvedModelId)
    );

    const newProfile: AIDeclaredModelProfile = {
      id: newProfileId,
      provider: formProvider,
      modelId: resolvedModelId,
      modelName: resolvedName,
      apiKey: formApiKey.trim(),
      baseUrl: formBaseUrl.trim() || DEFAULT_PROVIDER_CONFIGS[formProvider].defaultBaseUrl,
      temperature: Number.isFinite(formTemp) ? formTemp : 0.3,
      maxTokens: Number.isFinite(formMaxTokens) && formMaxTokens > 0 ? formMaxTokens : 2048,
      reasoningEffort: 'medium',
      supportsVision: formSupportsVision,
      active: formActive,
      isDefault: declaredModels.length === 0,
      lastTestedAt: formTestResult ? Date.now() : undefined,
      lastTestStatus: formTestResult ? (formTestResult.success ? 'success' : 'error') : 'untested',
      lastTestMessage: formTestResult?.message,
    };

    const nextDeclared = [...declaredModels];
    if (existingIdx >= 0) {
      newProfile.isDefault = nextDeclared[existingIdx].isDefault;
      nextDeclared[existingIdx] = newProfile;
    } else {
      nextDeclared.push(newProfile);
    }

    // Also propagate API key to other cards of the same provider if they didn't have a key yet
    if (newProfile.apiKey) {
      nextDeclared.forEach((item) => {
        if (item.provider === formProvider && !item.apiKey) {
          item.apiKey = newProfile.apiKey;
        }
      });
    }

    await persistDeclaredModels(
      nextDeclared,
      systemConfig.slots,
      `Đã lưu & kích hoạt mô hình ${resolvedName} (${resolvedModelId}).`
    );
    setShowAddForm(false);
  };

  // Card Actions: Toggle Active, Set Default, Test Connection, Update Card Config, Delete Card
  const handleToggleCardActive = async (cardId: string) => {
    const nextDeclared = declaredModels.map((m) =>
      m.id === cardId ? { ...m, active: !m.active } : m
    );
    await persistDeclaredModels(nextDeclared, systemConfig.slots, 'Đã cập nhật trạng thái mô hình.');
  };

  const handleSetDefaultModel = async (card: AIDeclaredModelProfile) => {
    const nextDeclared = declaredModels.map((m) => ({
      ...m,
      isDefault: m.id === card.id,
      active: m.id === card.id ? true : m.active,
    }));

    // Update all 4 AI slots to use this default model so the entire app switches immediately
    const nextSlots = structuredClone(systemConfig.slots);
    SLOT_ORDER.forEach((slotId) => {
      nextSlots[slotId] = {
        ...nextSlots[slotId],
        provider: card.provider,
        modelId: card.modelId,
        temperature: card.temperature,
        maxTokens: card.maxTokens,
      };
    });

    // Clear personal slot overrides so default model takes effect across all drawers/studios
    const personal = loadPersonalAIOverride();
    if (personal.slotOverrides && Object.keys(personal.slotOverrides).length > 0) {
      savePersonalAIOverride({
        ...personal,
        slotOverrides: {},
      });
    }

    await persistDeclaredModels(
      nextDeclared,
      nextSlots,
      `Đã đặt ${card.modelName} (${card.modelId}) làm Mặc định chính cho toàn hệ thống.`
    );
  };

  const handleTestCard = async (card: AIDeclaredModelProfile) => {
    setTestingCardId(card.id);
    try {
      const baseProvider =
        systemConfig.providers[card.provider] || DEFAULT_PROVIDER_CONFIGS[card.provider];
      const effectiveKey = (card.apiKey || baseProvider.apiKey || '').trim();
      const result = await testProviderConnection(
        {
          ...baseProvider,
          apiKey: effectiveKey,
          baseUrl: card.baseUrl || baseProvider.baseUrl || baseProvider.defaultBaseUrl,
        },
        card.modelId
      );

      const nextDeclared = declaredModels.map((m) =>
        m.id === card.id
          ? {
              ...m,
              lastTestedAt: Date.now(),
              lastTestStatus: (result.success ? 'success' : 'error') as 'success' | 'error',
              lastTestMessage: result.message,
              lastTestReply: result.replyPreview,
              lastTestLatencyMs: result.latencyMs,
            }
          : m
      );
      await persistDeclaredModels(nextDeclared, systemConfig.slots);
    } finally {
      setTestingCardId(null);
    }
  };

  const handleUpdateCardField = (
    cardId: string,
    patch: Partial<AIDeclaredModelProfile>
  ) => {
    setSystemConfig((prev) => ({
      ...prev,
      declaredModels: (prev.declaredModels || []).map((m) =>
        m.id === cardId ? { ...m, ...patch } : m
      ),
    }));
  };

  const handleSaveCardConfig = async (card: AIDeclaredModelProfile) => {
    const nextDeclared = declaredModels.map((m) => {
      if (m.id === card.id) return { ...card };
      // If user updated API key for this provider and another card of same provider has empty key, fill it
      if (m.provider === card.provider && card.apiKey && !m.apiKey) {
        return { ...m, apiKey: card.apiKey };
      }
      return m;
    });

    // If this card isDefault, also sync temperature/maxTokens/modelId to slots
    const nextSlots = structuredClone(systemConfig.slots);
    if (card.isDefault) {
      SLOT_ORDER.forEach((slotId) => {
        if (nextSlots[slotId].provider === card.provider) {
          nextSlots[slotId].modelId = card.modelId;
          nextSlots[slotId].temperature = card.temperature;
          nextSlots[slotId].maxTokens = card.maxTokens;
        }
      });
    }

    await persistDeclaredModels(
      nextDeclared,
      nextSlots,
      `Đã lưu cấu hình mô hình ${card.modelName}.`
    );
    setExpandedCardId(null);
  };

  const handleDeleteCard = async (cardId: string) => {
    if (declaredModels.length <= 1) {
      showToast('Hệ thống cần giữ lại ít nhất 1 mô hình AI.');
      return;
    }
    const nextDeclared = declaredModels.filter((m) => m.id !== cardId);
    await persistDeclaredModels(nextDeclared, systemConfig.slots, 'Đã xóa mô hình khỏi danh sách.');
    if (expandedCardId === cardId) setExpandedCardId(null);
  };

  const handleSlotChange = async (
    slotId: AISlotId,
    patch: Partial<{
      provider: AIProviderId;
      modelId: string;
      temperature: number;
      reasoningEffort: AIReasoningEffort;
      maxTokens: number;
    }>
  ) => {
    const nextSlots = {
      ...systemConfig.slots,
      [slotId]: {
        ...systemConfig.slots[slotId],
        ...patch,
      },
    };
    await persistDeclaredModels(
      declaredModels,
      nextSlots,
      `Đã cập nhật vị trí ${systemConfig.slots[slotId].label}.`
    );
  };

  const providerSelectModels = getModelsForProviderSelect(formProvider);

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-300 px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-emerald-800 shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. MCQ-Style Top Header Card */}
      <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/50 via-teal-50/25 to-white p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span role="img" aria-label="robot">
                🤖
              </span>
              <span>Quản lý & Khai báo các mô hình AI</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Khai báo nhiều mô hình từ{' '}
              <strong className="font-bold text-slate-800">
                Google Gemini, OpenAI, Anthropic Claude, DeepSeek
              </strong>
              . Các mô hình được bật <strong className="font-bold text-slate-800">Active</strong> sẽ
              được lưu cố định và sẵn sàng để gán cho từng Prompt.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenAddForm('gemini')}
            className="self-start px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm mô hình mới</span>
          </button>
        </div>

        {/* Quick Add By Provider Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-medium mr-1">Thêm nhanh theo hãng:</span>
          {PROVIDER_ORDER.map((pid) => {
            const meta = PROVIDER_META[pid];
            const isSelectedInForm = showAddForm && formProvider === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => handleOpenAddForm(pid)}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                  isSelectedInForm ? meta.quickBtnActiveClass : meta.quickBtnClass
                }`}
              >
                <span>+</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Add New Model Form Panel (Matches Screenshot 2) */}
      {showAddForm && (
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-md space-y-4 animate-fade-in">
          <div className="flex items-start justify-between border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span className="text-emerald-600 font-normal text-base leading-none">+</span>
                <span>Khai báo mô hình AI mới</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Các thông số Base URL, Temperature, Max Tokens đã được điền sẵn mặc định theo nhà
                cung cấp
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Đóng khung khai báo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Row 1: Provider & Model Select */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nhà cung cấp (Provider)
              </label>
              <select
                value={formProvider}
                onChange={(e) => handleProviderChangeInForm(e.target.value as AIProviderId)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              >
                {PROVIDER_ORDER.map((pid) => (
                  <option key={pid} value={pid}>
                    {PROVIDER_META[pid].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-8">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Chọn Model (tải sẵn hoặc từ API)
                </label>
                <button
                  type="button"
                  onClick={handleFetchModelsFromAPI}
                  disabled={fetchingApiModels}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {fetchingApiModels ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CloudDownload className="h-3.5 w-3.5" />
                  )}
                  <span>Tải danh sách model từ API</span>
                </button>
              </div>
              <select
                value={formModelId}
                onChange={(e) => setFormModelId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              >
                {providerSelectModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id}) — {m.supportsVision !== false ? '📷 Vision/OCR • ' : ''}
                    {m.description || 'Đa phương thức mạnh mẽ (Vision + Text)'}
                  </option>
                ))}
                <option value="__custom__">
                  ➕ Nhập mã Model tùy chỉnh khác (Custom Model ID)...
                </option>
              </select>

              {fetchApiNotice && (
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    fetchApiNotice.startsWith('Lỗi') ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {fetchApiNotice}
                </p>
              )}

              {formModelId === '__custom__' && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={formCustomModelId}
                    onChange={(e) => setFormCustomModelId(e.target.value)}
                    placeholder="Mã Model ID (VD: deepseek-flash, gpt-4.1-nano)"
                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                  />
                  <input
                    type="text"
                    value={formCustomModelName}
                    onChange={(e) => setFormCustomModelName(e.target.value)}
                    placeholder="Tên hiển thị (tùy chọn)"
                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Row 2: API Key */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              API Key ({PROVIDER_META[formProvider].label})
            </label>
            <div className="relative">
              <input
                type={formShowKey ? 'text' : 'password'}
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder={PROVIDER_META[formProvider].keyPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-10 py-2.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setFormShowKey((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={formShowKey ? 'Ẩn API Key' : 'Hiện API Key'}
              >
                {formShowKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Row 3: Base URL, Temperature, Max Tokens, OCR Checkbox */}
          <div className="rounded-xl bg-slate-50/90 border border-slate-200/80 p-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600">Base URL (Endpoint)</label>
                <button
                  type="button"
                  onClick={() =>
                    setFormBaseUrl(DEFAULT_PROVIDER_CONFIGS[formProvider].defaultBaseUrl)
                  }
                  className="text-[11px] text-slate-400 hover:text-teal-700 cursor-pointer"
                >
                  Mặc định
                </button>
              </div>
              <input
                type="text"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Temperature
              </label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={formTemp}
                onChange={(e) => setFormTemp(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-center text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Max Tokens</label>
              <input
                type="number"
                step={256}
                min={256}
                max={32768}
                value={formMaxTokens}
                onChange={(e) => setFormMaxTokens(parseInt(e.target.value, 10) || 2048)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-center text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div className="md:col-span-3 pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formSupportsVision}
                  onChange={(e) => setFormSupportsVision(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                />
                <span>Hỗ trợ ảnh (OCR)</span>
              </label>
            </div>
          </div>

          {/* Test Result inside Add Form */}
          {formTestResult && (
            <div
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-2 border ${
                formTestResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {formTestResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{formTestResult.message}</span>
            </div>
          )}

          {/* Row 4: Active Checkbox + Test & Save Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
              />
              <span>Kích hoạt (Active) ngay trong ứng dụng</span>
            </label>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleTestInForm}
                disabled={formTesting || !formApiKey.trim()}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {formTesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span>Test mô hình</span>
              </button>

              <button
                type="button"
                onClick={handleSaveNewModel}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Lưu & Kích hoạt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Declared Model Cards List (Matches Screenshot 1 & 2) */}
      <div className="space-y-3">
        {declaredModels.map((card) => {
          const meta = PROVIDER_META[card.provider] || PROVIDER_META.gemini;
          const baseProvider =
            systemConfig.providers[card.provider] || DEFAULT_PROVIDER_CONFIGS[card.provider];
          const effectiveKey = (card.apiKey || baseProvider.apiKey || '').trim();
          const hasKey = effectiveKey.length > 0;
          const isTesting = testingCardId === card.id;
          const isExpanded = expandedCardId === card.id;
          const showCardKey = Boolean(visibleCardKeyMap[card.id]);

          return (
            <div
              key={card.id}
              className={`rounded-2xl bg-white px-5 py-4 transition-all ${
                card.isDefault
                  ? 'border-2 border-emerald-500 shadow-xs'
                  : card.active
                  ? 'border border-emerald-300 shadow-2xs'
                  : 'border border-slate-200 bg-slate-50/60 opacity-85'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left Info */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <span
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{card.modelName}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-xs border border-slate-200/80">
                        {card.modelId}
                      </span>
                      {card.supportsVision && (
                        <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-semibold flex items-center gap-1">
                          <span>📷</span>
                          <span>Vision/OCR & Text</span>
                        </span>
                      )}
                      {card.isDefault && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                          <Star className="h-3 w-3 fill-current" />
                          <span>Mặc định chính</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate-500">
                      <span>
                        Temp: <strong className="font-bold text-slate-700">{card.temperature}</strong>
                      </span>
                      <span>
                        MaxTokens:{' '}
                        <strong className="font-bold text-slate-700">{card.maxTokens}</strong>
                      </span>
                      <span>
                        API Key:{' '}
                        <strong className="font-bold text-slate-700 font-mono">
                          {maskApiKeyPreview(effectiveKey)}
                        </strong>
                      </span>
                      {hasKey ? (
                        <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Đã kết nối</span>
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold inline-flex items-center gap-1">
                          <span>Chưa nhập API Key</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleCardActive(card.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      card.active
                        ? 'border-emerald-300 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100'
                        : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        card.active ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <span>{card.active ? 'Đang Active' : 'Đang tắt'}</span>
                  </button>

                  {!card.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultModel(card)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Đặt mặc định
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleTestCard(card)}
                    disabled={isTesting}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>Test</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCardId((prev) => (prev === card.id ? null : card.id))
                    }
                    className="px-3 py-1.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Settings className="h-3.5 w-3.5 text-slate-500" />
                    <span>Cấu hình</span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Test Status Banner */}
              {card.lastTestStatus && card.lastTestStatus !== 'untested' && card.lastTestMessage && (
                <div
                  className={`mt-2.5 pt-2 border-t text-xs font-semibold flex items-center gap-1.5 ${
                    card.lastTestStatus === 'success'
                      ? 'border-emerald-100/80 text-emerald-700'
                      : 'border-rose-100 text-rose-600'
                  }`}
                >
                  <span>{card.lastTestStatus === 'success' ? '✅' : '❌'}</span>
                  <span>{card.lastTestMessage}</span>
                </div>
              )}

              {/* Inline Configuration Drawer when "⚙️ Cấu hình ⌄" is clicked */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 bg-slate-50/70 -mx-5 -mb-4 px-5 py-4 rounded-b-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        API Key ({meta.label})
                      </label>
                      <div className="relative">
                        <input
                          type={showCardKey ? 'text' : 'password'}
                          value={card.apiKey || effectiveKey}
                          onChange={(e) =>
                            handleUpdateCardField(card.id, { apiKey: e.target.value })
                          }
                          placeholder={meta.keyPlaceholder}
                          className="w-full rounded-lg border border-slate-300 bg-white pl-3 pr-9 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCardKeyMap((prev) => ({
                              ...prev,
                              [card.id]: !prev[card.id],
                            }))
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showCardKey ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          Base URL (Endpoint)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateCardField(card.id, {
                              baseUrl: DEFAULT_PROVIDER_CONFIGS[card.provider].defaultBaseUrl,
                            })
                          }
                          className="text-[10px] text-slate-400 hover:text-teal-700 flex items-center gap-0.5 cursor-pointer"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          <span>Mặc định</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={card.baseUrl}
                        onChange={(e) =>
                          handleUpdateCardField(card.id, { baseUrl: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Mã Model (Model ID)
                      </label>
                      <input
                        type="text"
                        value={card.modelId}
                        onChange={(e) =>
                          handleUpdateCardField(card.id, {
                            modelId: e.target.value,
                            modelName: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-600">Temperature:</label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={2}
                          value={card.temperature}
                          onChange={(e) =>
                            handleUpdateCardField(card.id, {
                              temperature: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-center text-slate-800"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-600">Max Tokens:</label>
                        <input
                          type="number"
                          step={256}
                          min={256}
                          max={32768}
                          value={card.maxTokens}
                          onChange={(e) =>
                            handleUpdateCardField(card.id, {
                              maxTokens: parseInt(e.target.value, 10) || 2048,
                            })
                          }
                          className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-center text-slate-800"
                        />
                      </div>

                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={card.supportsVision}
                          onChange={(e) =>
                            handleUpdateCardField(card.id, {
                              supportsVision: e.target.checked,
                            })
                          }
                          className="rounded border-slate-300 text-sky-600 h-3.5 w-3.5"
                        />
                        <span>Vision/OCR</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      {declaredModels.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Xóa</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveCardConfig(card)}
                        className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Lưu cấu hình</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Optional Advanced Per-Slot Routing (Collapsible) */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowSlotRouting((prev) => !prev)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="h-4 w-4 text-teal-700" />
            <div>
              <span className="text-xs font-bold text-slate-800">
                Phân bổ mô hình chuyên biệt cho từng vị trí trợ lý AI (Tùy chọn nâng cao)
              </span>
              <span className="block text-[11px] text-slate-500">
                Mặc định tất cả vị trí sẽ dùng mô hình gắn nhãn ★ Mặc định chính. Mở mục này nếu muốn
                gán riêng từng vị trí.
              </span>
            </div>
          </div>
          {showSlotRouting ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showSlotRouting && (
          <div className="p-5 pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/40">
            {SLOT_ORDER.map((slotId) => {
              const slot = systemConfig.slots[slotId];
              const activeCards = declaredModels.filter((m) => m.active);
              return (
                <div
                  key={slotId}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">{slot.label}</div>
                    <div className="text-[11px] text-slate-500">{slot.locationHint}</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Mô hình sử dụng
                      </label>
                      <select
                        value={`${slot.provider}__${slot.modelId}`}
                        onChange={(e) => {
                          const [pid, mid] = e.target.value.split('__') as [
                            AIProviderId,
                            string,
                          ];
                          if (pid && mid) {
                            handleSlotChange(slotId, { provider: pid, modelId: mid });
                          }
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                      >
                        {activeCards.map((c) => (
                          <option key={c.id} value={`${c.provider}__${c.modelId}`}>
                            {PROVIDER_META[c.provider].label} — {c.modelName} ({c.modelId})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Mức độ suy luận (Effort)
                      </label>
                      <select
                        value={slot.reasoningEffort}
                        onChange={(e) =>
                          handleSlotChange(slotId, {
                            reasoningEffort: e.target.value as AIReasoningEffort,
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                      >
                        <option value="low">Low (Phản hồi nhanh)</option>
                        <option value="medium">Medium (Cân bằng chuẩn)</option>
                        <option value="high">High (Phân tích chuyên sâu)</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
