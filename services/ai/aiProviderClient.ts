/**
 * Unified Multi-LLM Provider Client
 * Hỗ trợ: Google Gemini, OpenAI, Anthropic (Claude), DeepSeek
 * Đảm bảo tương thích gọi trực tiếp từ trình duyệt, tùy chỉnh Base URL,
 * điều chỉnh Temperature, Reasoning Effort (Low/Medium/High) và Max Tokens.
 */

import {
  AIProviderConfig,
  AIProviderId,
  AIReasoningEffort,
} from '../../types/ai';
import {
  executeWithDshRetry,
  stripDeepSeekThinkingBlocks,
} from './deepseekHarnessEngine';

export interface AIMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  providerConfig: AIProviderConfig;
  modelId: string;
  messages: AIMessageInput[];
  temperature?: number;
  reasoningEffort?: AIReasoningEffort;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AICompletionResponse {
  text: string;
  provider: AIProviderId;
  modelId: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    promptCacheHitTokens?: number;
  };
}

export interface AITestConnectionResult {
  success: boolean;
  provider: AIProviderId;
  modelId: string;
  latencyMs: number;
  message: string;
  replyPreview?: string;
}

function cleanBaseUrl(url: string, fallback: string): string {
  const trimmed = (url || '').trim() || fallback;
  return trimmed.replace(/\/+$/, '');
}

function isOpenAIReasoningModel(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4');
}

function getThinkingBudget(effort: AIReasoningEffort = 'medium'): number {
  switch (effort) {
    case 'low':
      return 1024;
    case 'high':
      return 8192;
    case 'medium':
    default:
      return 2048;
  }
}

/**
 * Call Google Gemini REST API (supports custom Base URL + thinkingConfig)
 */
async function callGeminiAPI(req: AICompletionRequest): Promise<AICompletionResponse> {
  const startTime = performance.now();
  const { providerConfig, modelId, messages, temperature = 0.2, reasoningEffort = 'medium', maxTokens = 4096, signal } = req;
  const apiKey = (providerConfig.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('Chưa cấu hình API Key cho Google Gemini.');
  }

  const baseUrl = cleanBaseUrl(providerConfig.baseUrl, providerConfig.defaultBaseUrl);
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const conversationMsgs = messages.filter((m) => m.role !== 'system');

  const contents = conversationMsgs.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Xin chào' }] });
  }

  const supportsThinking = modelId.includes('2.5');
  const buildBody = (includeThinking: boolean) => {
    const generationConfig: Record<string, any> = {
      temperature,
      maxOutputTokens: maxTokens,
    };
    if (includeThinking && supportsThinking) {
      generationConfig.thinkingConfig = {
        thinkingBudget: getThinkingBudget(reasoningEffort),
      };
    }
    return {
      ...(systemMsgs
        ? {
            systemInstruction: {
              parts: [{ text: systemMsgs }],
            },
          }
        : {}),
      contents,
      generationConfig,
    };
  };

  const endpoint = `${baseUrl}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildBody(true)),
    signal,
  });

  // Fallback without thinkingConfig if model rejects thinkingBudget
  if (!res.ok && supportsThinking) {
    const errClone = await res.clone().text();
    if (errClone.includes('thinking') || res.status === 400) {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildBody(false)),
        signal,
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed?.error?.message || errText;
    } catch {
      // ignore
    }
    throw new Error(`Gemini API lỗi (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: Array<{ text?: string; thought?: boolean }> = candidate?.content?.parts || [];
  const visibleText = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  const fallbackText = parts.map((p) => p.text || '').join('').trim();

  return {
    text: visibleText || fallbackText || 'Không có phản hồi từ mô hình.',
    provider: 'gemini',
    modelId,
    latencyMs: Math.round(performance.now() - startTime),
    usage: {
      promptTokens: data?.usageMetadata?.promptTokenCount,
      completionTokens: data?.usageMetadata?.candidatesTokenCount,
      totalTokens: data?.usageMetadata?.totalTokenCount,
    },
  };
}

/**
 * Call OpenAI or DeepSeek (OpenAI-Compatible Chat Completions API)
 */
async function callOpenAICompatibleAPI(req: AICompletionRequest): Promise<AICompletionResponse> {
  const startTime = performance.now();
  const { providerConfig, modelId, messages, temperature = 0.2, reasoningEffort = 'medium', maxTokens = 4096, signal } = req;
  const apiKey = (providerConfig.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(`Chưa cấu hình API Key cho ${providerConfig.name}.`);
  }

  const baseUrl = cleanBaseUrl(providerConfig.baseUrl, providerConfig.defaultBaseUrl);

  // Hỗ trợ cả cổng Messages protocol của DeepSeek Harness (https://api.deepseek.com/anthropic)
  if (providerConfig.provider === 'deepseek' && baseUrl.endsWith('/anthropic')) {
    return callAnthropicAPI(req);
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const isOSeries = providerConfig.provider === 'openai' && isOpenAIReasoningModel(modelId);
  const isDeepSeekReasoner = providerConfig.provider === 'deepseek' && modelId.includes('reasoner');

  const payload: Record<string, any> = {
    model: modelId,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  if (isOSeries) {
    payload.reasoning_effort = reasoningEffort;
    payload.max_completion_tokens = maxTokens;
  } else if (isDeepSeekReasoner) {
    payload.max_tokens = maxTokens;
  } else {
    payload.temperature = temperature;
    payload.max_tokens = maxTokens;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed?.error?.message || errText;
    } catch {
      // ignore
    }
    throw new Error(`${providerConfig.name} API lỗi (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  const rawContent = (choice?.content || '').trim();
  const contentText = stripDeepSeekThinkingBlocks(rawContent);

  if (!contentText) {
    throw new Error('EMPTY_RESPONSE: Mô hình trả về phản hồi rỗng');
  }

  return {
    text: contentText,
    provider: providerConfig.provider,
    modelId,
    latencyMs: Math.round(performance.now() - startTime),
    usage: {
      promptTokens: data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.completion_tokens,
      totalTokens: data?.usage?.total_tokens,
      promptCacheHitTokens: data?.usage?.prompt_cache_hit_tokens,
    },
  };
}

/**
 * Call Anthropic Claude Messages API (and DeepSeek /anthropic Messages endpoint)
 */
async function callAnthropicAPI(req: AICompletionRequest): Promise<AICompletionResponse> {
  const startTime = performance.now();
  const { providerConfig, modelId, messages, temperature = 0.2, reasoningEffort = 'medium', maxTokens = 4096, signal } = req;
  const apiKey = (providerConfig.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(`Chưa cấu hình API Key cho ${providerConfig.name}.`);
  }

  const baseUrl = cleanBaseUrl(providerConfig.baseUrl, providerConfig.defaultBaseUrl);
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;

  const systemPrompt = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  if (chatMessages.length === 0) {
    chatMessages.push({ role: 'user', content: 'Xin chào' });
  }

  const payload: Record<string, any> = {
    model: modelId,
    max_tokens: maxTokens,
    temperature,
    messages: chatMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  void reasoningEffort;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      Authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed?.error?.message || errText;
    } catch {
      // ignore
    }
    throw new Error(`${providerConfig.name} API lỗi (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const blocks: Array<{ type: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
  const text = stripDeepSeekThinkingBlocks(
    blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim()
  );

  if (!text) {
    throw new Error('EMPTY_RESPONSE: Mô hình trả về phản hồi rỗng');
  }

  return {
    text,
    provider: providerConfig.provider,
    modelId,
    latencyMs: Math.round(performance.now() - startTime),
    usage: {
      promptTokens: data?.usage?.input_tokens,
      completionTokens: data?.usage?.output_tokens,
      totalTokens: (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0),
    },
  };
}

/**
 * Unified entry point to generate completion from any configured provider
 * Tích hợp `@deepseek-ai/dsh-llm-retry` (Bounded Exponential Backoff + Jitter)
 */
export async function generateAICompletion(req: AICompletionRequest): Promise<AICompletionResponse> {
  return executeWithDshRetry(
    async () => {
      switch (req.providerConfig.provider) {
        case 'gemini':
          return callGeminiAPI(req);
        case 'anthropic':
          return callAnthropicAPI(req);
        case 'openai':
        case 'deepseek':
        default:
          return callOpenAICompatibleAPI(req);
      }
    },
    undefined,
    req.signal
  );
}

/**
 * Test connection for a provider + selected model
 */
export async function testProviderConnection(
  providerConfig: AIProviderConfig,
  modelId?: string
): Promise<AITestConnectionResult> {
  const targetModel =
    modelId ||
    providerConfig.models.find((m) => m.enabled)?.id ||
    providerConfig.models[0]?.id ||
    '';

  if (!targetModel) {
    return {
      success: false,
      provider: providerConfig.provider,
      modelId: '',
      latencyMs: 0,
      message: 'Không có mô hình nào được kích hoạt để kiểm tra.',
    };
  }

  if (!providerConfig.apiKey || !providerConfig.apiKey.trim()) {
    return {
      success: false,
      provider: providerConfig.provider,
      modelId: targetModel,
      latencyMs: 0,
      message: 'Vui lòng nhập API Key trước khi kiểm tra kết nối.',
    };
  }

  const start = performance.now();
  try {
    const response = await generateAICompletion({
      providerConfig,
      modelId: targetModel,
      temperature: 0,
      reasoningEffort: 'low',
      maxTokens: 32,
      messages: [
        {
          role: 'user',
          content: 'Trả lời ngắn gọn đúng 1 từ: "OK"',
        },
      ],
    });

    const cleanReply = (response.text || 'OK').replace(/^["']|["']$/g, '').trim().slice(0, 60) || 'OK';

    return {
      success: true,
      provider: providerConfig.provider,
      modelId: targetModel,
      latencyMs: response.latencyMs,
      message: `Kết nối thành công! AI phản hồi: "${cleanReply}"`,
      replyPreview: cleanReply,
    };
  } catch (error: any) {
    return {
      success: false,
      provider: providerConfig.provider,
      modelId: targetModel,
      latencyMs: Math.round(performance.now() - start),
      message: error?.message || 'Lỗi kết nối không xác định.',
    };
  }
}

export interface AIFetchedModelItem {
  id: string;
  name: string;
  description?: string;
  supportsVision?: boolean;
}

/**
 * Tải danh sách model khả dụng trực tiếp từ API của nhà cung cấp (nút "☁️ Tải danh sách model từ API")
 */
export async function fetchModelsFromProviderAPI(
  provider: AIProviderId,
  apiKey: string,
  baseUrl: string,
  defaultBaseUrl: string
): Promise<AIFetchedModelItem[]> {
  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) {
    throw new Error('Vui lòng nhập API Key trước khi tải danh sách model từ API.');
  }

  const endpointBase = cleanBaseUrl(baseUrl, defaultBaseUrl);

  if (provider === 'gemini') {
    const res = await fetch(`${endpointBase}/models?key=${encodeURIComponent(trimmedKey)}`);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Không thể tải danh sách model Gemini (${res.status}): ${txt.slice(0, 150)}`);
    }
    const data = await res.json();
    const rawModels: Array<any> = Array.isArray(data?.models) ? data.models : [];
    return rawModels
      .filter((m) => {
        const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        return methods.includes('generateContent');
      })
      .map((m) => {
        const id = String(m.name || '').replace(/^models\//, '');
        return {
          id,
          name: m.displayName || id,
          description: m.description || 'Đa phương thức mạnh mẽ (Vision + Text)',
          supportsVision: true,
        };
      })
      .filter((m) => Boolean(m.id));
  }

  if (provider === 'anthropic') {
    const res = await fetch(`${endpointBase}/models`, {
      method: 'GET',
      headers: {
        'x-api-key': trimmedKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Không thể tải danh sách model Anthropic (${res.status}): ${txt.slice(0, 150)}`);
    }
    const data = await res.json();
    const rawModels: Array<any> = Array.isArray(data?.data) ? data.data : [];
    return rawModels
      .map((m) => ({
        id: String(m.id || ''),
        name: m.display_name || String(m.id || ''),
        description: 'Đa phương thức mạnh mẽ (Vision + Text)',
        supportsVision: true,
      }))
      .filter((m) => Boolean(m.id));
  }

  // OpenAI & DeepSeek (OpenAI-compatible /models)
  const res = await fetch(`${endpointBase}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${trimmedKey}`,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Không thể tải danh sách model (${res.status}): ${txt.slice(0, 150)}`);
  }
  const data = await res.json();
  const rawModels: Array<any> = Array.isArray(data?.data) ? data.data : [];
  return rawModels
    .map((m) => {
      const id = String(m.id || '');
      return {
        id,
        name: id,
        description: 'Mô hình tải từ API',
        supportsVision: !id.includes('reasoner'),
      };
    })
    .filter((m) => Boolean(m.id));
}
