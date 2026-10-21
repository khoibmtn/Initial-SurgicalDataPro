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

/**
 * Hồ sơ khai báo từng mô hình AI (theo giao diện chuẩn ứng dụng MCQ)
 */
export interface AIDeclaredModelProfile {
  id: string;
  provider: AIProviderId;
  modelId: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: AIReasoningEffort;
  supportsVision: boolean;
  active: boolean;
  isDefault: boolean;
  lastTestedAt?: number;
  lastTestStatus?: 'success' | 'error' | 'untested';
  lastTestMessage?: string;
  lastTestReply?: string;
  lastTestLatencyMs?: number;
}

export interface AISystemConfig {
  providers: Record<AIProviderId, AIProviderConfig>;
  slots: Record<AISlotId, AISlotConfig>;
  declaredModels?: AIDeclaredModelProfile[];
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

export interface AIClarificationOption {
  label: string;
  followUpPrompt: string;
  description?: string;
}

// ─── JEV SYSTEM ONE (TYPESAFE AI) & RLCD REINFORCEMENT LEARNING TYPES ────────

/**
 * Tập ý định truy vấn định kiểu nghiêm ngặt (Type-Safe Choice Enum của Jev System One)
 */
export type AIQueryIntent =
  | 'overtime_audit'        // Chấm công ngoài giờ, kíp mổ phiên lố giờ, kíp tăng cường, loại trừ trực 24h
  | 'conflict_quality'      // Đối soát Trùng NV, Trùng máy, Thiếu mã máy, Chưa gán GV, Lỗi TG, TT <100%, Phụ cấp PTTT
  | 'duty_schedule'         // Lịch trực 24h, buổi trực ngày thường / ngày nghỉ lễ
  | 'service_package'       // Gói dịch vụ yêu cầu (DVYC), doanh thu gói, thực lĩnh sau thuế
  | 'staff_workload'        // Khối lượng công việc nhân sự / khoa theo 6 vị trí kíp mổ
  | 'patient_lookup'        // Tra cứu bệnh nhân / ca mổ cụ thể theo Mã BN, Họ tên, BHYT, Kỹ thuật, Máy
  | 'specialty_yoy'         // Phân tích chuyên khoa, so sánh cùng kỳ YoY, xu hướng tháng / mùa
  | 'or_utilization'        // Công suất phòng mổ, khung giờ cao điểm, thời lượng phẫu thuật
  | 'general_summary';      // Tổng quan chung toàn bộ báo cáo

/**
 * Chế độ vận hành kết hợp System 1 (Jev Fast Decision) & System 2 (LLM Deep Prose)
 */
export type AIExecutionMode = 'auto' | 'fast_system1' | 'deep_system2';

/**
 * Nguyên thủy Choice<T> của Jev (TypeSafe AI):
 * Chọn 1 phương án tối ưu từ tập hữu hạn kèm phân phối xác suất đã hiệu chỉnh (Calibrated Probabilities).
 */
export interface JevChoicePrimitive<T extends string> {
  selected: T;
  label: string;
  calibratedProbability: number; // 0.0 -> 1.0
  distribution: Record<T, number>;
}

/**
 * Nguyên thủy Noul của Jev (TypeSafe AI):
 * Đánh giá xác suất Đúng/Sai (Yes/No condition probability) đã hiệu chỉnh.
 */
export interface JevNoulPrimitive {
  value: boolean;
  probability: number; // 0.0 -> 1.0
  rationale: string;
}

/**
 * Nguyên thủy Score của Jev (TypeSafe AI):
 * Điểm số định lượng trên thang đo liên tục [0..100].
 */
export interface JevScorePrimitive {
  score: number; // 0 -> 100
  level: 'low' | 'medium' | 'high' | 'critical';
  label: string;
}

/**
 * Kết quả đánh giá song song trong 1 bước của Jev System One (< 15ms)
 */
export interface JevSystemOneEvaluation {
  intentChoice: JevChoicePrimitive<AIQueryIntent>;
  secondaryIntents: AIQueryIntent[];
  nouls: {
    isDirectTableLookup: JevNoulPrimitive;
    requiresDeepReasoning: JevNoulPrimitive;
    hasSufficientDataContext: JevNoulPrimitive;
    matchesLearnedPattern: JevNoulPrimitive;
  };
  scores: {
    calibrationConfidence: JevScorePrimitive;
    focusStrictness: JevScorePrimitive;
    complexityScore: JevScorePrimitive;
  };
  recommendedMode: 'fast_system1' | 'deep_system2';
  matchedExemplarId?: string;
  focusInstruction: string;
  evaluationLatencyMs: number;
}

/**
 * Mẫu câu hỏi đã được học tăng cường (Verified RLCD Exemplar)
 */
export interface AIRLCDExemplar {
  id: string;
  normalizedPrompt: string;
  samplePrompt: string;
  keywords: string[];
  verifiedIntent: AIQueryIntent;
  preferredMode: 'fast_system1' | 'deep_system2';
  focusNote?: string;
  positiveCount: number;
  negativeCount: number;
  rewardScore: number;
  updatedAt: number;
  updatedBy?: string;
}

/**
 * Thống kê hiệu chỉnh xác suất (Calibration Statistics) cho từng Intent
 */
export interface AIRLCDIntentCalibrationStat {
  intent: AIQueryIntent;
  totalPredictions: number;
  positiveConfirmations: number;
  negativeCorrections: number;
  priorBoost: number; // Hệ số điều chỉnh xác suất [-0.35 .. +0.35]
}

/**
 * Trạng thái bộ nhớ Tự học tăng cường RLCD đồng bộ toàn viện (Firebase RTDB + LocalStorage)
 */
export interface AIRLCDMemoryState {
  version: number;
  totalFeedbackCount: number;
  tokenIntentWeights: Record<string, Partial<Record<AIQueryIntent, number>>>;
  intentStats: Record<AIQueryIntent, AIRLCDIntentCalibrationStat>;
  exemplars: AIRLCDExemplar[];
  updatedAt: number;
}

export interface AIMessageUserFeedback {
  rating: 'positive' | 'negative';
  correctedIntent?: AIQueryIntent;
  preferredMode?: 'fast_system1' | 'deep_system2';
  note?: string;
  timestamp: number;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sourcePrompt?: string;
  provider?: AIProviderId;
  modelId?: string;
  reasoningEffort?: AIReasoningEffort;
  temperature?: number;
  latencyMs?: number;
  dataSourceCitation?: string;
  clarificationOptions?: AIClarificationOption[];
  artifacts?: AIArtifact[];
  toolLogs?: AIChatToolExecutionLog[];
  systemOneEval?: JevSystemOneEvaluation;
  executionModeUsed?: 'fast_system1' | 'deep_system2';
  focusedFastSummary?: string;
  userFeedback?: AIMessageUserFeedback;
  isError?: boolean;
}
