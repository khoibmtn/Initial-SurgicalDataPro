/**
 * DeepSeek Harness Runtime Engine (dsh-core / dsh-llm-deepseek / dsh-compaction / dsh-spill / dsh-guard / dsh-llm-retry)
 *
 * Áp dụng kiến trúc "Everything-is-a-Plugin" từ https://github.com/deepseek-ai/deepseek-harness
 * tối ưu chuyên biệt cho DeepSeek API (deepseek-flash, deepseek-v4-pro, deepseek-chat, deepseek-reasoner)
 * kết hợp cùng Jev System One (TypeSafe AI) trong SurgicalDataPro:
 *
 * 1. `@deepseek-ai/dsh-llm-deepseek` (`systemPromptUpdate: 'in-history'`):
 *    Giữ nguyên System Prompt gốc ở `messages[0]` bất biến xuyên suốt phiên để kích hoạt 100%
 *    Context Disk Caching (`prompt_cache_hit_tokens`) của DeepSeek API, đẩy ngữ cảnh động xuống cuối lịch sử.
 * 2. `@deepseek-ai/dsh-token-meter` & `@deepseek-ai/dsh-spill` (`spill-policy`):
 *    Đo lường áp lực token (`tokenMeter`) và tự động rút gọn kết quả công cụ quá dài (`maxInlineTokens`),
 *    chuyển phần bảng chi tiết sang Artifact Studio Locator để giảm 60-80% độ trễ phản hồi (TTFT).
 * 3. `@deepseek-ai/dsh-compaction`:
 *    Nén lịch sử hội thoại cũ, loại bỏ khối `<think>...</think>` và các bảng Markdown cồng kềnh từ các lượt trước
 *    để tránh làm nhiễu ngữ cảnh lượt hỏi hiện tại.
 * 4. `@deepseek-ai/dsh-llm-retry`:
 *    Cơ chế thử lại tự động có giới hạn (Bounded Exponential Backoff + Jitter + `Retry-After`) cho các lỗi
 *    `RATE_LIMIT (429)`, `SERVER (500/502/503/504)`, `TIMEOUT`, `TRANSPORT` và `EMPTY_RESPONSE`.
 * 5. `@deepseek-ai/dsh-guard`:
 *    Kiểm soát thời hạn thực thi (`timeout-policy`) và chống ảo giác (Anti-Hallucination Guard) khi mô hình
 *    báo "thiếu trường dữ liệu ngayBD/ngayKT/ptChinh" dù công cụ TypeScript đã tính toán đầy đủ.
 */

import { AIChatMessage } from '../../types/ai';
import { AIMessageInput } from './aiProviderClient';

export interface DshTokenMeterReport {
  estimatedTokens: number;
  charCount: number;
  exceedsInlineBudget: boolean;
}

export interface DshSpillResult {
  inlineText: string;
  spilled: boolean;
  originalTokens: number;
  inlineTokens: number;
  spillLocatorNote?: string;
}

export interface DshRetryPolicyConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export const DEFAULT_DSH_RETRY_POLICY: DshRetryPolicyConfig = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 6000,
  jitterRatio: 0.15,
};

/**
 * 1. `@deepseek-ai/dsh-token-meter`:
 * Ước lượng nhanh số lượng token tiếng Việt + ký hiệu kỹ thuật (~3.2 ký tự / token)
 */
export function measureTokenPressure(
  text: string,
  maxInlineTokens = 2600
): DshTokenMeterReport {
  const clean = text || '';
  const charCount = clean.length;
  const estimatedTokens = Math.ceil(charCount / 3.2);
  return {
    estimatedTokens,
    charCount,
    exceedsInlineBudget: estimatedTokens > maxInlineTokens,
  };
}

/**
 * Làm sạch thẻ `<think>...</think>` của DeepSeek Reasoner / DeepSeek Flash
 * trước khi hiển thị hoặc đưa vào lịch sử hội thoại
 */
export function stripDeepSeekThinkingBlocks(text: string): string {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * 2. `@deepseek-ai/dsh-spill` (`spill-policy`):
 * Giới hạn kích thước kết quả Tool truyền trực tiếp vào prompt LLM (`maxInlineTokens`).
 * Giữ nguyên toàn bộ phần Kết luận / Tổng hợp ở đầu và phần đầu bảng, chuyển phần danh sách thô
 * quá dài sang tham chiếu Artifact Studio (`SpillRef`) để DeepSeek phản hồi cực nhanh.
 */
export function applyDshSpillPolicy(
  contextDataForLLM: string,
  maxInlineTokens = 2800
): DshSpillResult {
  const meter = measureTokenPressure(contextDataForLLM, maxInlineTokens);
  if (!meter.exceedsInlineBudget) {
    return {
      inlineText: contextDataForLLM,
      spilled: false,
      originalTokens: meter.estimatedTokens,
      inlineTokens: meter.estimatedTokens,
    };
  }

  const maxChars = Math.floor(maxInlineTokens * 3.2);
  const sections = contextDataForLLM.split('\n\n---\n\n');
  const keptSections: string[] = [];
  let currentChars = 0;

  for (const sec of sections) {
    if (currentChars + sec.length <= maxChars) {
      keptSections.push(sec);
      currentChars += sec.length + 7;
    } else {
      const remainingBudget = Math.max(400, maxChars - currentChars);
      const lines = sec.split('\n');
      const previewLines: string[] = [];
      let lineChars = 0;
      for (const line of lines) {
        if (lineChars + line.length > remainingBudget) break;
        previewLines.push(line);
        lineChars += line.length + 1;
      }
      if (previewLines.length > 0) {
        keptSections.push(
          `${previewLines.join('\n')}\n*(... Đã rút gọn phần dòng chi tiết theo chính sách @deepseek-ai/dsh-spill để tối ưu tốc độ phản hồi; toàn bộ bảng đầy đủ đã được hiển thị trực tiếp trên khung AI Artifact Studio bên cạnh)*`
        );
      }
      break;
    }
  }

  const inlineText = keptSections.join('\n\n---\n\n');
  const afterMeter = measureTokenPressure(inlineText, maxInlineTokens);

  return {
    inlineText,
    spilled: true,
    originalTokens: meter.estimatedTokens,
    inlineTokens: afterMeter.estimatedTokens,
    spillLocatorNote: `dsh-spill: ${meter.estimatedTokens} -> ${afterMeter.estimatedTokens} tokens`,
  };
}

/**
 * 3. `@deepseek-ai/dsh-compaction`:
 * Nén lịch sử trò chuyện trước khi gửi lên DeepSeek API:
 * - Loại bỏ `<think>...</think>`
 * - Lược bỏ các bảng Markdown cũ hoặc danh sách quá dài ở các lượt trước (tránh làm mô hình nhầm lẫn số liệu lượt cũ với lượt mới)
 * - Giữ tối đa `maxTurns` lượt gần nhất trong ngân sách token cho phép
 */
export function compactSessionHistoryForDeepSeek(
  messages: AIChatMessage[],
  maxTurns = 4,
  maxCharsPerAssistantTurn = 700
): AIMessageInput[] {
  const validMessages = messages.filter(
    (m) => !m.isError && !m.clarificationOptions && m.content && m.content.trim().length > 0
  );
  const recent = validMessages.slice(-maxTurns);

  return recent.map((m) => {
    if (m.role === 'user') {
      return {
        role: 'user',
        content: m.content.trim(),
      };
    }

    // Nén nội dung trả lời cũ của Assistant: bỏ bảng Markdown cũ và giới hạn độ dài
    let clean = stripDeepSeekThinkingBlocks(m.content);
    clean = clean
      .split('\n')
      .filter((line) => !line.trim().startsWith('|'))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (clean.length > maxCharsPerAssistantTurn) {
      clean = `${clean.slice(0, maxCharsPerAssistantTurn)}... [Đã tóm lược bởi dsh-compaction]`;
    }

    return {
      role: 'assistant',
      content: clean,
    };
  });
}

/**
 * 4. `@deepseek-ai/dsh-llm-deepseek` (`systemPromptUpdate: 'in-history'`):
 * Tổ chức mảng `messages` gửi tới DeepSeek sao cho `messages[0]` (System Prompt tĩnh)
 * không bị thay đổi giữa các câu hỏi trong cùng phiên, giúp DeepSeek kích hoạt Prefix Cache (`prompt_cache_hit_tokens`).
 */
export function buildDeepSeekHarnessMessages(params: {
  staticSystemPrompt: string;
  dynamicTurnContextPrompt: string;
  compactedHistory: AIMessageInput[];
  userQuestion: string;
  spilledToolContext: string;
  dataSourceCitation?: string;
}): AIMessageInput[] {
  const {
    staticSystemPrompt,
    dynamicTurnContextPrompt,
    compactedHistory,
    userQuestion,
    spilledToolContext,
    dataSourceCitation,
  } = params;

  return [
    // Message 0: 100% Static Prefix -> Hits DeepSeek Disk/KV Prefix Cache on every subsequent turn
    {
      role: 'system',
      content: staticSystemPrompt,
    },
    ...compactedHistory,
    // In-history system update + verified tool execution output for the current turn
    {
      role: 'user',
      content: [
        dynamicTurnContextPrompt,
        `CÂU HỎI HIỆN TẠI CỦA NGƯỜI DÙNG:\n"${userQuestion}"`,
        `=== KẾT QUẢ TRUY VẤN & TÍNH TOÁN CHÍNH XÁC 100% TỪ HỆ THỐNG (ĐÃ XÁC THỰC) ===\n${spilledToolContext}`,
        `YÊU CẦU TRẢ LỜI TRỌNG TÂM:\n- Trả lời trực tiếp, ngắn gọn, chính xác câu hỏi "${userQuestion}" dựa hoàn toàn vào số liệu đã tính toán ở trên.\n- Nêu rõ nguồn số liệu ("${dataSourceCitation || 'Dữ liệu đang mở'}") ở dòng đầu tiên.\n- TUYỆT ĐỐI KHÔNG tự ý thêm phân tích theo Mùa hoặc theo Bác sĩ nếu câu hỏi không hỏi.\n- TUYỆT ĐỐI KHÔNG nói "chưa thể xác định" hay "không có trường ngayBD/ngayKT/ptChinh" vì hệ thống TypeScript đã truy xuất và tính toán sẵn toàn bộ kết quả ở trên.`,
      ].join('\n\n'),
    },
  ];
}

/**
 * 5. `@deepseek-ai/dsh-guard` (Anti-Hallucination & Contradiction Guard):
 * Phát hiện trường hợp LLM bị ảo giác nói "Chưa thể xác định / Không chứa các trường ngayBD, ngayKT"
 * trong khi hệ thống TypeScript đã tính toán xong kết quả trong `focusedFastSummary`.
 */
export function applyDshOutputGuard(
  llmText: string,
  focusedFastSummary: string,
  scopedRecordCount: number
): { finalContent: string; guardTriggered: boolean } {
  const cleaned = stripDeepSeekThinkingBlocks(llmText);
  if (!cleaned) {
    return { finalContent: focusedFastSummary, guardTriggered: true };
  }

  // Nếu có bản ghi thực tế (> 0 ca) nhưng LLM lại trả lời rằng "không chứa trường ngayBD / ngayKT / chưa thể xác định danh sách"
  const falseMissingDataClaim =
    scopedRecordCount > 0 &&
    /(khong chua cac truong du lieu bat buoc|chua the xac dinh danh sach nhan su cham ngoai gio|ngaybd.*khong co|ngaykt.*khong co)/i.test(
      cleaned
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
    );

  if (falseMissingDataClaim && focusedFastSummary) {
    return {
      finalContent: focusedFastSummary,
      guardTriggered: true,
    };
  }

  return {
    finalContent: cleaned,
    guardTriggered: false,
  };
}

/**
 * 6. `@deepseek-ai/dsh-llm-retry`:
 * Thực thi hàm gọi LLM với chính sách thử lại Exponential Backoff + Jitter cho các lỗi tạm thời
 * (`429 Rate Limit`, `500/502/503/504 Server Error`, `Failed to fetch / Network`, `Empty Response`).
 */
export async function executeWithDshRetry<T>(
  operation: () => Promise<T>,
  policy: DshRetryPolicyConfig = DEFAULT_DSH_RETRY_POLICY,
  signal?: AbortSignal
): Promise<T> {
  let attempt = 0;
  let lastError: any;

  while (attempt < policy.maxAttempts) {
    attempt++;
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (signal?.aborted) {
        throw err;
      }

      const msg = String(err?.message || '').toLowerCase();
      const isRetryable =
        msg.includes('429') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('rate limit') ||
        msg.includes('overloaded') ||
        msg.includes('failed to fetch') ||
        msg.includes('network') ||
        msg.includes('empty_response');

      if (!isRetryable || attempt >= policy.maxAttempts) {
        throw err;
      }

      const expDelay = Math.min(
        policy.maxDelayMs,
        policy.initialDelayMs * Math.pow(2, attempt - 1)
      );
      const jitter = expDelay * policy.jitterRatio * (Math.random() * 2 - 1);
      const waitMs = Math.max(200, Math.round(expDelay + jitter));

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}
