/**
 * AI Configuration Service (Hybrid: Firebase RTDB + LocalStorage Override)
 * Quản lý danh mục nhà cung cấp (Gemini, OpenAI, Anthropic, DeepSeek),
 * Base URL mặc định, danh sách mô hình khả dụng và cấu hình từng vị trí AI (Slots).
 */

import { ref, onValue, set, get } from 'firebase/database';
import { db } from '../../lib/firebase';
import {
  AIProviderId,
  AIProviderConfig,
  AISlotId,
  AISlotConfig,
  AISystemConfig,
  AIPersonalOverride,
  AIModelOption,
  AIDeclaredModelProfile,
} from '../../types/ai';

export const AI_CONFIG_RTDB_PATH = 'app_config/ai_settings';
export const LS_AI_SYSTEM_CACHE_KEY = 'sdp_ai_system_config_v1';
export const LS_AI_PERSONAL_OVERRIDE_KEY = 'sdp_ai_personal_override_v1';
export const AI_CONFIG_CHANGED_EVENT = 'sdp-ai-config-changed';

export const DEFAULT_PROVIDER_CONFIGS: Record<AIProviderId, AIProviderConfig> = {
  gemini: {
    provider: 'gemini',
    name: 'Google Gemini',
    badgeText: 'Google AI Studio / Vertex',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: true,
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        description: 'Cân bằng tối ưu giữa tốc độ phản hồi, gọi công cụ truy vấn và suy luận số liệu',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'gemini',
        description: 'Mô hình phân tích chuyên sâu, xử lý truy vấn đa chiều phức tạp nhất',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        provider: 'gemini',
        description: 'Phản hồi siêu tốc, chi phí thấp cho tra cứu nhanh hàng ngày',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'gemini',
        description: 'Phiên bản ổn định, tốc độ cao',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
    ],
    lastTestStatus: 'untested',
  },
  openai: {
    provider: 'openai',
    name: 'OpenAI',
    badgeText: 'GPT-4.1 / GPT-4o / o-Series',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    defaultBaseUrl: 'https://api.openai.com/v1',
    enabled: true,
    models: [
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        provider: 'openai',
        description: 'Flagship mới nhất chuyên phân tích dữ liệu cấu trúc và gọi hàm chính xác',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        provider: 'openai',
        description: 'Nhanh, thông minh và tối ưu chi phí cho truy vấn báo cáo',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        description: 'Mô hình đa năng tốc độ cao chuẩn OpenAI',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        description: 'Mô hình gọn nhẹ, phản hồi tức thì',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'o4-mini',
        name: 'OpenAI o4-mini (Reasoning)',
        provider: 'openai',
        description: 'Mô hình suy luận toán học và phân tích thống kê chuyên sâu',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'o3',
        name: 'OpenAI o3 (Deep Reasoning)',
        provider: 'openai',
        description: 'Suy luận cấp cao nhất cho bài toán quản trị bệnh viện phức tạp',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
      },
    ],
    lastTestStatus: 'untested',
  },
  anthropic: {
    provider: 'anthropic',
    name: 'Anthropic Claude',
    badgeText: 'Claude 4 / 3.7 / 3.5',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    enabled: true,
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        description: 'Thế hệ Claude 4 mới nhất, xuất sắc trong phân tích số liệu và trình bày báo cáo',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'claude-3-7-sonnet-latest',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        description: 'Hỗ trợ Extended Thinking phân tích sâu mối quan hệ dữ liệu',
        supportsReasoning: true,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        description: 'Mô hình phân tích ổn định, văn phong hành chính y khoa chuẩn mực',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku',
        provider: 'anthropic',
        description: 'Tốc độ phản hồi cực nhanh cho tra cứu hồ sơ bệnh nhân',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
    ],
    lastTestStatus: 'untested',
  },
  deepseek: {
    provider: 'deepseek',
    name: 'DeepSeek',
    badgeText: 'DeepSeek-V3 / R1',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    enabled: true,
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek-V3 (deepseek-chat)',
        provider: 'deepseek',
        description: 'Mô hình DeepSeek-V3 tốc độ cao, hỗ trợ Tool Calling phân tích bảng biểu',
        supportsReasoning: false,
        supportsTools: true,
        enabled: true,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek-R1 (deepseek-reasoner)',
        provider: 'deepseek',
        description: 'Mô hình suy luận chuỗi tư duy (Chain-of-Thought) chuyên sâu',
        supportsReasoning: true,
        supportsTools: false,
        enabled: true,
      },
    ],
    lastTestStatus: 'untested',
  },
};

export const DEFAULT_SLOT_CONFIGS: Record<AISlotId, AISlotConfig> = {
  daily_storage: {
    slotId: 'daily_storage',
    label: 'BC Hàng ngày — Lưu trữ',
    locationHint: 'Báo cáo hàng ngày → Tab Lưu trữ (Ngăn trượt AI bên phải)',
    description: 'Tra cứu nhanh bệnh nhân, kíp mổ, máy thực hiện, lịch trực 24h và ca mổ ngoài giờ trong ngày.',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    temperature: 0.1,
    reasoningEffort: 'medium',
    maxTokens: 4096,
  },
  monthly_storage: {
    slotId: 'monthly_storage',
    label: 'BC Tháng — Lưu trữ',
    locationHint: 'Báo cáo tháng → Tab Lưu trữ (Ngăn trượt AI bên phải)',
    description: 'Tra cứu tổng hợp tháng, đối soát nhân viên làm bao nhiêu ca, gói dịch vụ yêu cầu, buổi trực tháng.',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    temperature: 0.1,
    reasoningEffort: 'medium',
    maxTokens: 4096,
  },
  statistics_studio: {
    slotId: 'statistics_studio',
    label: 'Thống kê & AI Analytics Studio',
    locationHint: 'Phân hệ Thống kê phẫu thuật (Giao diện Hỏi đáp & Expand Studio Biểu đồ/Bảng)',
    description: 'Chuyên gia phân tích số liệu đa chiều (tháng, mùa Hè/Đông, bác sĩ, chuyên khoa), tự động vẽ biểu đồ tương tác và bảng kết quả.',
    provider: 'gemini',
    modelId: 'gemini-2.5-pro',
    temperature: 0.2,
    reasoningEffort: 'high',
    maxTokens: 8192,
  },
  conflict_insight: {
    slotId: 'conflict_insight',
    label: 'Phân tích Xung đột & Vận hành PTTT',
    locationHint: 'Nhận định tự động trùng giờ nhân viên, trùng máy và thiếu mã máy',
    description: 'Đánh giá an toàn người bệnh và khuyến nghị điều phối nhân sự/thiết bị phòng mổ.',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    temperature: 0.3,
    reasoningEffort: 'medium',
    maxTokens: 2048,
  },
};

export const DEFAULT_DECLARED_MODELS: AIDeclaredModelProfile[] = [
  {
    id: 'gemini__gemini-2.5-flash',
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    modelName: 'Gemini 2.5 Flash',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    temperature: 0.3,
    maxTokens: 2048,
    reasoningEffort: 'medium',
    supportsVision: true,
    active: true,
    isDefault: true,
    lastTestStatus: 'untested',
  },
];

export const DEFAULT_AI_SYSTEM_CONFIG: AISystemConfig = {
  providers: DEFAULT_PROVIDER_CONFIGS,
  slots: DEFAULT_SLOT_CONFIGS,
  declaredModels: DEFAULT_DECLARED_MODELS,
  updatedAt: 0,
};

export const DEFAULT_PERSONAL_OVERRIDE: AIPersonalOverride = {
  usePersonalKeys: false,
  providerKeys: {},
  providerBaseUrls: {},
  slotOverrides: {},
};

export function maskApiKeyPreview(apiKey?: string): string {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return 'Chưa nhập';
  if (trimmed.length <= 9) {
    return `${trimmed.slice(0, 3)}••••${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-3)}`;
}

// ─── MERGE & NORMALIZATION HELPERS ───────────────────────────────────────────

export function normalizeAISystemConfig(raw?: Partial<AISystemConfig> | null): AISystemConfig {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_AI_SYSTEM_CONFIG);
  }

  const providers = structuredClone(DEFAULT_PROVIDER_CONFIGS);
  const rawProviders = raw.providers || ({} as Record<AIProviderId, AIProviderConfig>);

  (Object.keys(providers) as AIProviderId[]).forEach((pid) => {
    const incoming = rawProviders[pid];
    if (!incoming) return;

    const defaultModels = providers[pid].models;
    const incomingModels = Array.isArray(incoming.models) ? incoming.models : [];

    // Merge default models with saved models (preserving enabled flags + custom models)
    const mergedModelsMap = new Map<string, AIModelOption>();
    defaultModels.forEach((m) => mergedModelsMap.set(m.id, { ...m }));
    incomingModels.forEach((m) => {
      if (m && m.id) {
        const existing = mergedModelsMap.get(m.id);
        mergedModelsMap.set(m.id, {
          ...(existing || {}),
          ...m,
          provider: pid,
        });
      }
    });

    providers[pid] = {
      ...providers[pid],
      ...incoming,
      provider: pid,
      defaultBaseUrl: DEFAULT_PROVIDER_CONFIGS[pid].defaultBaseUrl,
      baseUrl: (incoming.baseUrl || '').trim() || DEFAULT_PROVIDER_CONFIGS[pid].defaultBaseUrl,
      models: Array.from(mergedModelsMap.values()),
    };
  });

  const slots = structuredClone(DEFAULT_SLOT_CONFIGS);
  const rawSlots = raw.slots || ({} as Record<AISlotId, AISlotConfig>);
  (Object.keys(slots) as AISlotId[]).forEach((sid) => {
    const incomingSlot = rawSlots[sid];
    if (!incomingSlot) return;
    slots[sid] = {
      ...slots[sid],
      ...incomingSlot,
      slotId: sid,
      label: DEFAULT_SLOT_CONFIGS[sid].label,
      locationHint: DEFAULT_SLOT_CONFIGS[sid].locationHint,
      description: DEFAULT_SLOT_CONFIGS[sid].description,
      temperature:
        typeof incomingSlot.temperature === 'number'
          ? Math.max(0, Math.min(2, incomingSlot.temperature))
          : DEFAULT_SLOT_CONFIGS[sid].temperature,
      reasoningEffort: incomingSlot.reasoningEffort || DEFAULT_SLOT_CONFIGS[sid].reasoningEffort,
      maxTokens: incomingSlot.maxTokens || DEFAULT_SLOT_CONFIGS[sid].maxTokens,
    };
  });

  // Normalize or synthesize declaredModels (MCQ-style model profiles)
  let declaredModels: AIDeclaredModelProfile[] = [];
  if (Array.isArray(raw.declaredModels) && raw.declaredModels.length > 0) {
    declaredModels = raw.declaredModels
      .filter((item): item is AIDeclaredModelProfile => Boolean(item && item.provider && item.modelId))
      .map((item) => {
        const pid = item.provider;
        const pCfg = providers[pid] || DEFAULT_PROVIDER_CONFIGS[pid];
        const presetModel = pCfg.models.find((m) => m.id === item.modelId);
        return {
          id: item.id || `${pid}__${item.modelId}`,
          provider: pid,
          modelId: item.modelId.trim(),
          modelName: (item.modelName || presetModel?.name || item.modelId).trim(),
          apiKey: (item.apiKey ?? pCfg.apiKey ?? '').trim(),
          baseUrl: (item.baseUrl || pCfg.baseUrl || pCfg.defaultBaseUrl).trim(),
          temperature: typeof item.temperature === 'number' ? item.temperature : 0.3,
          maxTokens: typeof item.maxTokens === 'number' && item.maxTokens > 0 ? item.maxTokens : 2048,
          reasoningEffort: item.reasoningEffort || 'medium',
          supportsVision: item.supportsVision !== undefined ? Boolean(item.supportsVision) : true,
          active: item.active !== undefined ? Boolean(item.active) : true,
          isDefault: Boolean(item.isDefault),
          lastTestedAt: item.lastTestedAt,
          lastTestStatus: item.lastTestStatus || 'untested',
          lastTestMessage: item.lastTestMessage,
          lastTestReply: item.lastTestReply,
          lastTestLatencyMs: item.lastTestLatencyMs,
        };
      });
  } else {
    // Synthesize from existing providers & slots so existing configs appear immediately as cards
    const primarySlot = slots.daily_storage || DEFAULT_SLOT_CONFIGS.daily_storage;
    const seenKeys = new Set<string>();

    const addSynthesized = (pid: AIProviderId, modelId: string, isPrimary: boolean) => {
      const key = `${pid}__${modelId}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      const pCfg = providers[pid];
      const modelMeta = pCfg.models.find((m) => m.id === modelId) || pCfg.models[0];
      const resolvedId = modelMeta?.id || modelId;
      declaredModels.push({
        id: `${pid}__${resolvedId}`,
        provider: pid,
        modelId: resolvedId,
        modelName: modelMeta?.name || resolvedId,
        apiKey: (pCfg.apiKey || '').trim(),
        baseUrl: pCfg.baseUrl || pCfg.defaultBaseUrl,
        temperature: 0.3,
        maxTokens: 2048,
        reasoningEffort: 'medium',
        supportsVision: !resolvedId.includes('reasoner'),
        active: pCfg.enabled !== false,
        isDefault: isPrimary,
        lastTestedAt: pCfg.lastTestedAt,
        lastTestStatus: pCfg.lastTestStatus || 'untested',
        lastTestMessage: pCfg.lastTestMessage,
        lastTestLatencyMs: pCfg.lastTestLatencyMs,
      });
    };

    // Primary slot model first
    addSynthesized(primarySlot.provider, primarySlot.modelId, true);

    // Any other provider that already has an API key configured
    (Object.keys(providers) as AIProviderId[]).forEach((pid) => {
      const pCfg = providers[pid];
      if (pCfg.apiKey && pCfg.apiKey.trim()) {
        const firstEnabled = pCfg.models.find((m) => m.enabled) || pCfg.models[0];
        if (firstEnabled) {
          addSynthesized(pid, firstEnabled.id, false);
        }
      }
    });
  }

  // Ensure exactly one default among declared models
  if (declaredModels.length > 0 && !declaredModels.some((m) => m.isDefault)) {
    const firstActive = declaredModels.find((m) => m.active) || declaredModels[0];
    firstActive.isDefault = true;
  }

  // Sync declaredModels back into providers so getEffectiveProviderConfig & getAvailableModelsCatalog stay in sync
  declaredModels.forEach((dm) => {
    const pCfg = providers[dm.provider];
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
    const existingModel = pCfg.models.find((m) => m.id === dm.modelId);
    if (existingModel) {
      existingModel.enabled = dm.active;
      if (dm.modelName) existingModel.name = dm.modelName;
    } else {
      pCfg.models.push({
        id: dm.modelId,
        name: dm.modelName || dm.modelId,
        provider: dm.provider,
        description: dm.supportsVision ? 'Vision/OCR & Text' : 'Mô hình khai báo',
        supportsReasoning: dm.modelId.includes('2.5') || dm.modelId.includes('reasoner') || dm.modelId.startsWith('o'),
        supportsTools: !dm.modelId.includes('reasoner'),
        enabled: dm.active,
        isCustom: true,
      });
    }
  });

  return {
    providers,
    slots,
    declaredModels,
    updatedAt: raw.updatedAt || Date.now(),
    updatedBy: raw.updatedBy,
  };
}

const memoryStorageFallback = new Map<string, string>();

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore
  }
  return memoryStorageFallback.get(key) ?? null;
}

function safeStorageSet(key: string, value: string): void {
  memoryStorageFallback.set(key, value);
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}

export function clearAIStorageCache(): void {
  memoryStorageFallback.clear();
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(LS_AI_SYSTEM_CACHE_KEY);
      localStorage.removeItem(LS_AI_PERSONAL_OVERRIDE_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadCachedAISystemConfig(): AISystemConfig {
  try {
    const raw = safeStorageGet(LS_AI_SYSTEM_CACHE_KEY);
    if (!raw) return structuredClone(DEFAULT_AI_SYSTEM_CONFIG);
    return normalizeAISystemConfig(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_AI_SYSTEM_CONFIG);
  }
}

export function saveCachedAISystemConfig(config: AISystemConfig): void {
  try {
    safeStorageSet(LS_AI_SYSTEM_CACHE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[aiConfigService] Failed to cache system config:', e);
  }
}

export function loadPersonalAIOverride(): AIPersonalOverride {
  try {
    const raw = safeStorageGet(LS_AI_PERSONAL_OVERRIDE_KEY);
    if (!raw) return structuredClone(DEFAULT_PERSONAL_OVERRIDE);
    const parsed = JSON.parse(raw);
    return {
      usePersonalKeys: Boolean(parsed.usePersonalKeys),
      providerKeys: parsed.providerKeys || {},
      providerBaseUrls: parsed.providerBaseUrls || {},
      slotOverrides: parsed.slotOverrides || {},
    };
  } catch {
    return structuredClone(DEFAULT_PERSONAL_OVERRIDE);
  }
}

export function savePersonalAIOverride(override: AIPersonalOverride): void {
  try {
    safeStorageSet(LS_AI_PERSONAL_OVERRIDE_KEY, JSON.stringify(override));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(AI_CONFIG_CHANGED_EVENT));
    }
  } catch (e) {
    console.warn('[aiConfigService] Failed to save personal override:', e);
  }
}

/**
 * Subscribe to system AI config on Firebase RTDB with LocalStorage fallback
 */
export function subscribeToAISystemConfig(
  callback: (config: AISystemConfig) => void
): () => void {
  // Emit cached immediately for 0ms latency
  callback(loadCachedAISystemConfig());

  try {
    const configRef = ref(db, AI_CONFIG_RTDB_PATH);
    const unsub = onValue(
      configRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const normalized = normalizeAISystemConfig(snapshot.val());
          saveCachedAISystemConfig(normalized);
          callback(normalized);
        } else {
          callback(loadCachedAISystemConfig());
        }
      },
      (err) => {
        console.warn('[aiConfigService] RTDB subscribe fallback to local cache:', err);
        callback(loadCachedAISystemConfig());
      }
    );
    return () => unsub();
  } catch {
    return () => {};
  }
}

/**
 * Save system AI config to Firebase RTDB + LocalStorage
 */
export async function saveAISystemConfig(
  config: AISystemConfig,
  updatedBy?: string
): Promise<void> {
  const payload: AISystemConfig = {
    ...normalizeAISystemConfig(config),
    updatedAt: Date.now(),
    ...(updatedBy ? { updatedBy } : {}),
  };

  saveCachedAISystemConfig(payload);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AI_CONFIG_CHANGED_EVENT));
  }

  try {
    const configRef = ref(db, AI_CONFIG_RTDB_PATH);
    await set(configRef, payload);
  } catch (error) {
    console.warn('[aiConfigService] Saved locally; Firebase RTDB sync warning:', error);
  }
}

/**
 * Fetch once (for non-React service calls)
 */
export async function getAISystemConfigOnce(): Promise<AISystemConfig> {
  const cached = loadCachedAISystemConfig();
  try {
    const snap = await get(ref(db, AI_CONFIG_RTDB_PATH));
    if (snap.exists()) {
      const normalized = normalizeAISystemConfig(snap.val());
      saveCachedAISystemConfig(normalized);
      return normalized;
    }
  } catch {
    // ignore offline error
  }
  return cached;
}

/**
 * Resolve effective provider config (merging system config + personal override + env fallback for Gemini)
 */
export function getEffectiveProviderConfig(
  providerId: AIProviderId,
  systemConfig: AISystemConfig = loadCachedAISystemConfig(),
  personalOverride: AIPersonalOverride = loadPersonalAIOverride(),
  modelId?: string
): AIProviderConfig {
  const base = systemConfig.providers[providerId] || DEFAULT_PROVIDER_CONFIGS[providerId];
  const personalKey = personalOverride.usePersonalKeys
    ? (personalOverride.providerKeys?.[providerId] || '').trim()
    : '';
  const personalUrl = personalOverride.usePersonalKeys
    ? (personalOverride.providerBaseUrls?.[providerId] || '').trim()
    : '';

  const declaredForProvider = (systemConfig.declaredModels || []).filter(
    (dm) => dm.provider === providerId && dm.active
  );
  const matchingDeclared =
    (modelId ? declaredForProvider.find((dm) => dm.modelId === modelId) : undefined) ||
    declaredForProvider.find((dm) => dm.apiKey && dm.apiKey.trim()) ||
    declaredForProvider[0];

  const declaredKey = (matchingDeclared?.apiKey || '').trim();
  const declaredUrl = (matchingDeclared?.baseUrl || '').trim();

  let effectiveKey = personalKey || declaredKey || (base.apiKey || '').trim();

  // Fallback env key for Gemini if neither personal nor system key is set
  if (!effectiveKey && providerId === 'gemini') {
    const envKey =
      (typeof process !== 'undefined' && process.env && (process.env.GEMINI_API_KEY || process.env.API_KEY)) ||
      '';
    if (envKey) effectiveKey = envKey;
  }

  return {
    ...base,
    apiKey: effectiveKey,
    baseUrl: personalUrl || declaredUrl || base.baseUrl || base.defaultBaseUrl,
  };
}

/**
 * Resolve effective slot config (merging system slot + personal slot override)
 */
export function getEffectiveSlotConfig(
  slotId: AISlotId,
  systemConfig: AISystemConfig = loadCachedAISystemConfig(),
  personalOverride: AIPersonalOverride = loadPersonalAIOverride()
): AISlotConfig {
  const baseSlot = systemConfig.slots[slotId] || DEFAULT_SLOT_CONFIGS[slotId];
  const slotOverride = personalOverride.slotOverrides?.[slotId];
  if (!slotOverride) return baseSlot;

  return {
    ...baseSlot,
    provider: slotOverride.provider || baseSlot.provider,
    modelId: slotOverride.modelId || baseSlot.modelId,
    temperature:
      typeof slotOverride.temperature === 'number' ? slotOverride.temperature : baseSlot.temperature,
    reasoningEffort: slotOverride.reasoningEffort || baseSlot.reasoningEffort,
    maxTokens: slotOverride.maxTokens || baseSlot.maxTokens,
  };
}

/**
 * Update a slot override quickly from any chat interface
 */
export function updatePersonalSlotOverride(
  slotId: AISlotId,
  patch: Partial<{
    provider: AIProviderId;
    modelId: string;
    temperature: number;
    reasoningEffort: 'low' | 'medium' | 'high';
    maxTokens: number;
  }>
): void {
  const current = loadPersonalAIOverride();
  const existingSlot = current.slotOverrides?.[slotId] || {};
  const next: AIPersonalOverride = {
    ...current,
    slotOverrides: {
      ...(current.slotOverrides || {}),
      [slotId]: {
        ...existingSlot,
        ...patch,
      },
    },
  };
  savePersonalAIOverride(next);
}

/**
 * Return all enabled models across enabled providers, indicating whether each provider has a configured API key
 */
export function getAvailableModelsCatalog(
  systemConfig: AISystemConfig = loadCachedAISystemConfig(),
  personalOverride: AIPersonalOverride = loadPersonalAIOverride()
): Array<AIModelOption & { providerName: string; hasApiKey: boolean }> {
  const list: Array<AIModelOption & { providerName: string; hasApiKey: boolean }> = [];
  (Object.keys(systemConfig.providers) as AIProviderId[]).forEach((pid) => {
    const effProvider = getEffectiveProviderConfig(pid, systemConfig, personalOverride);
    if (!effProvider.enabled) return;
    const hasKey = Boolean(effProvider.apiKey && effProvider.apiKey.trim().length > 0);
    effProvider.models
      .filter((m) => m.enabled)
      .forEach((m) => {
        list.push({
          ...m,
          providerName: effProvider.name,
          hasApiKey: hasKey,
        });
      });
  });
  return list;
}
