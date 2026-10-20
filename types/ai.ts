/**
 * AI Module Types & Interfaces
 * Quản lý cấu hình đa mô hình (Gemini, OpenAI, Anthropic, DeepSeek),
 * phân bổ vị trí AI (Slots), công cụ truy vấn liên kết đa bảng và Artifact hiển thị (Biểu đồ tương tác, Bảng, KPI).
 */

export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'deepseek';

export type AIReasoningEffort = 'low' | 'medium' | 'high';

export type AISlotId =
  | 'daily_storage'
  | 'monthly_storage'
  | 'statistics_studio'
  | 'conflict_insight';

export interface AIModelOption {
  id: string;
  name: string;
  provider: AIProviderId;
  description?: string;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
  enabled: boolean;
  isCustom?: boolean;
}

export interface AIProviderConfig {
  provider: AIProviderId;
  name: string;
  badgeText?: string;
  apiKey: string;
  baseUrl: string;
  defaultBaseUrl: string;
  enabled: boolean;
  models: AIModelOption[];
  lastTestedAt?: number;
  lastTestStatus?: 'success' | 'error' | 'untested';
  lastTestMessage?: string;
  lastTestLatencyMs?: number;
}

export interface AISlotConfig {
  slotId: AISlotId;
  label: string;
  locationHint: string;
  description: string;
  provider: AIProviderId;
  modelId: string;
  temperature: number; // 0.0 -> 2.0
  reasoningEffort: AIReasoningEffort; // low | medium | high
  maxTokens: number;
  topP?: number;
}

export interface AISystemConfig {
  providers: Record<AIProviderId, AIProviderConfig>;
  slots: Record<AISlotId, AISlotConfig>;
  updatedAt: number;
  updatedBy?: string;
}

/** Cấu hình cá nhân lưu tại LocalStorage của từng máy (Override lên trên cấu hình hệ thống) */
export interface AIPersonalOverride {
  usePersonalKeys: boolean;
  providerKeys: Partial<Record<AIProviderId, string>>;
  providerBaseUrls?: Partial<Record<AIProviderId, string>>;
  slotOverrides?: Partial<
    Record<
      AISlotId,
      {
        provider?: AIProviderId;
        modelId?: string;
        temperature?: number;
        reasoningEffort?: AIReasoningEffort;
        maxTokens?: number;
      }
    >
  >;
}

// ─── ARTIFACT & VISUALIZATION TYPES ──────────────────────────────────────────

export type AIChartType = 'bar' | 'line' | 'composed' | 'area' | 'pie';

export interface AIChartSeries {
  key: string;
  name: string;
  color: string;
  type?: 'bar' | 'line' | 'area';
  yAxisId?: 'left' | 'right';
  unit?: string;
}

export interface AIChartConfig {
  chartType: AIChartType;
  xAxisKey: string;
  xAxisLabel?: string;
  series: AIChartSeries[];
  data: Array<Record<string, any>>;
  enableBrush?: boolean;
  stacked?: boolean;
}

export interface AITableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: 'number' | 'currency' | 'percent' | 'text' | 'date';
}

export interface AITableConfig {
  columns: AITableColumn[];
  rows: Array<Record<string, any>>;
}

export interface AIKpiCard {
  label: string;
  value: string | number;
  subValue?: string;
  tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
}

export interface AIArtifact {
  id: string;
  type: 'chart' | 'table' | 'kpi_summary' | 'composite';
  title: string;
  subtitle?: string;
  querySummary?: string;
  kpiCards?: AIKpiCard[];
  chartConfig?: AIChartConfig;
  tableConfig?: AITableConfig;
  rawRecords?: Array<Record<string, any>>;
  createdAt: number;
}

export interface AIChatToolExecutionLog {
  toolName: string;
  summary: string;
  recordCount?: number;
  expandedFirestoreFetch?: boolean;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  provider?: AIProviderId;
  modelId?: string;
  reasoningEffort?: AIReasoningEffort;
  temperature?: number;
  latencyMs?: number;
  artifacts?: AIArtifact[];
  toolLogs?: AIChatToolExecutionLog[];
  isError?: boolean;
}
