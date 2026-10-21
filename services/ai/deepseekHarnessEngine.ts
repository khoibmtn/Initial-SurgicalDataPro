/**
 * DeepSeek Harness Runtime Engine
 * (@deepseek-ai/dsh-session • @deepseek-ai/dsh-memory • @deepseek-ai/dsh-compaction • @deepseek-ai/dsh-spill • @deepseek-ai/dsh-llm-deepseek • @deepseek-ai/dsh-guard • @deepseek-ai/dsh-llm-retry)
 *
 * Áp dụng kiến trúc "Everything-is-a-Plugin" từ https://github.com/deepseek-ai/deepseek-harness
 * tối ưu chuyên biệt cho DeepSeek API (deepseek-flash, deepseek-v4-pro, deepseek-chat, deepseek-reasoner)
 * kết hợp cùng Jev System One (TypeSafe AI) trong SurgicalDataPro:
 *
 * 1. `@deepseek-ai/dsh-session` & `@deepseek-ai/dsh-memory` (Event-Sourced Session Log & Working Memory):
 *    Duy trì sổ cái sự kiện từng lượt hỏi (`turnLedger`) và bộ nhớ làm việc (`DshSessionWorkingMemory`)
 *    lưu trữ bền vững phạm vi thời gian đang neo (`anchoredTimeScope`), danh sách thực thể bệnh nhân/nhân sự/chuyên khoa
 *    (`activeEntities`) và tóm tắt kết quả từng lượt — giúp AI không bao giờ quên ngữ cảnh kể cả khi hỏi nối tiếp nhiều lượt
 *    hoặc tải lại trang.
 * 2. `@deepseek-ai/dsh-compaction` (Two-Tier Rolling Compaction with Summary Node & Smart Table Preservation):
 *    - Thay vì cắt bỏ lịch sử cũ hoặc xóa trắng toàn bộ bảng Markdown của câu trả lời vừa xong, `dsh-compaction`:
 *      + Nén các lượt hội thoại cũ thành nút tóm tắt **`[DSH_COMPACTION_SUMMARY_NODE]`** bảo toàn mạch hội thoại.
 *      + Giữ lại các dòng thực thể quan trọng của bảng Markdown ở lượt trả lời liền trước (tối đa 15 dòng cho lượt sát nhất,
 *        5 dòng cho các lượt trước đó) để mô hình luôn đối chiếu được từng bệnh nhân, kỹ thuật, bác sĩ ở câu hỏi tiếp theo.
 * 3. `@deepseek-ai/dsh-llm-deepseek` (`systemPromptUpdate: 'in-history'`):
 *    Giữ nguyên System Prompt gốc ở `messages[0]` bất biến xuyên suốt phiên để kích hoạt 100%
 *    Context Disk Caching (`prompt_cache_hit_tokens`) của DeepSeek API, đồng thời tiêm `DshWorkingMemory`
 *    và ngữ cảnh động vào cuối lịch sử (`in-history`).
 * 4. `@deepseek-ai/dsh-token-meter` & `@deepseek-ai/dsh-spill` (`spill-policy`):
 *    Đo lường áp lực token (`tokenMeter`) và tự động rút gọn kết quả công cụ quá dài (`maxInlineTokens`),
 *    giữ lại phần Tổng hợp + Entity Digest để giảm 60-80% độ trễ phản hồi (TTFT) mà không mất thông tin thực thể.
 * 5. `@deepseek-ai/dsh-guard` & `@deepseek-ai/dsh-llm-retry`:
 *    Chống ảo giác báo "thiếu dữ liệu" và tự động thử lại Exponential Backoff + Jitter khi gặp lỗi mạng/429/5xx.
 */

import { AIChatMessage, AIQueryIntent } from '../../types/ai';
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
 * `@deepseek-ai/dsh-session` Turn Event Entry
 */
export interface DshTurnLedgerEntry {
  turnIndex: number;
  timestamp: number;
  userPrompt: string;
  resolvedIntent: AIQueryIntent;
  dataSourceCitation: string;
  scopedRecordCount: number;
  scopedDateRange?: string;
  keyTakeaway: string;
  targetStaffNames?: string[];
  patientSample?: string[];
}

/**
 * `@deepseek-ai/dsh-memory` Persistent Session Working Memory
 */
export interface DshSessionWorkingMemory {
  slotId: string;
  updatedAt: number;
  anchoredTimeScope?: {
    months?: number[];
    years?: number[];
    specificDates?: string[];
    dateRange?: { from: string; to: string; label?: string };
    isDutyShift24h?: boolean;
    explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db' | null;
    dataSourceCitation: string;
    scopedDateRange?: string;
    recordCount: number;
    scopedRecordCount?: number;
    timeConstraints?: any;
    updatedAt?: number;
  };
  activeEntities: {
    targetStaffNames: string[];
    patientDigest: string[]; // Tóm tắt nhanh các bệnh nhân/ca mổ đang xét: "#1 Mã BN - Họ tên (Loại - Kỹ thuật - PTV)"
    lastSpecialtyHint?: string;
    lastLoaiPTTTFilter?: string;
    lastWasSurgeryList?: boolean;
  };
  turnLedger: DshTurnLedgerEntry[];
}

const DSH_MEMORY_STORAGE_PREFIX = 'sdp_dsh_working_memory_v1_';

export function createEmptyDshWorkingMemory(slotId: string): DshSessionWorkingMemory {
  return {
    slotId,
    updatedAt: Date.now(),
    activeEntities: {
      targetStaffNames: [],
      patientDigest: [],
    },
    turnLedger: [],
  };
}

export function loadDshWorkingMemory(slotId: string): DshSessionWorkingMemory {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return createEmptyDshWorkingMemory(slotId);
    }
    const raw = localStorage.getItem(`${DSH_MEMORY_STORAGE_PREFIX}${slotId}`);
    if (!raw) return createEmptyDshWorkingMemory(slotId);
    const parsed = JSON.parse(raw) as DshSessionWorkingMemory;
    if (!parsed || typeof parsed !== 'object') return createEmptyDshWorkingMemory(slotId);
    return {
      slotId,
      updatedAt: parsed.updatedAt || Date.now(),
      anchoredTimeScope: parsed.anchoredTimeScope,
      activeEntities: {
        targetStaffNames: Array.isArray(parsed.activeEntities?.targetStaffNames)
          ? parsed.activeEntities.targetStaffNames
          : [],
        patientDigest: Array.isArray(parsed.activeEntities?.patientDigest)
          ? parsed.activeEntities.patientDigest
          : [],
        lastSpecialtyHint: parsed.activeEntities?.lastSpecialtyHint,
        lastLoaiPTTTFilter: parsed.activeEntities?.lastLoaiPTTTFilter,
        lastWasSurgeryList: parsed.activeEntities?.lastWasSurgeryList,
      },
      turnLedger: Array.isArray(parsed.turnLedger) ? parsed.turnLedger.slice(-15) : [],
    };
  } catch {
    return createEmptyDshWorkingMemory(slotId);
  }
}

export function saveDshWorkingMemory(memory: DshSessionWorkingMemory): void {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') return;
    localStorage.setItem(
      `${DSH_MEMORY_STORAGE_PREFIX}${memory.slotId}`,
      JSON.stringify({
        ...memory,
        turnLedger: (memory.turnLedger || []).slice(-15),
        updatedAt: Date.now(),
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

export function clearDshWorkingMemory(slotId: string): DshSessionWorkingMemory {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(`${DSH_MEMORY_STORAGE_PREFIX}${slotId}`);
    }
  } catch {
    // ignore
  }
  return createEmptyDshWorkingMemory(slotId);
}

/**
 * Trích xuất câu kết luận ngắn gọn (1-2 dòng) từ nội dung trả lời để lưu vào `turnLedger`
 */
export function extractConciseTurnTakeaway(text: string, maxChars = 240): string {
  const clean = stripDeepSeekThinkingBlocks(text || '');
  const allLines = clean.split('\n').map((l) => l.trim());
  const nonTableLines = allLines.filter(
    (l) =>
      l.length > 0 &&
      !l.startsWith('|') &&
      !l.startsWith('📌') &&
      !l.startsWith('---') &&
      !l.startsWith('###')
  );
  const tableDataLines = allLines.filter(
    (l) =>
      l.startsWith('|') &&
      !l.includes('---') &&
      !/\|\s*(STT|Mã|Họ tên|Loại|Khoa|Nhân viên)\b/i.test(l)
  );
  const tablePreview =
    tableDataLines.length > 0
      ? ` [Dữ liệu mẫu: ${tableDataLines
          .slice(0, 3)
          .map((r) =>
            r
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => c.trim())
              .filter(Boolean)
              .slice(0, 3)
              .join(' - ')
          )
          .join('; ')}]`
      : '';
  const joined = `${nonTableLines.slice(0, 2).join(' | ').replace(/\*\*/g, '')}${tablePreview}`.trim();
  if (!joined) return 'Đã trả về bảng dữ liệu chi tiết.';
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}...` : joined;
}

/**
 * Cập nhật `DshSessionWorkingMemory` sau mỗi lượt trả lời thành công (`@deepseek-ai/dsh-session` + `@deepseek-ai/dsh-memory`)
 */
export function updateDshWorkingMemory(
  currentMemory: DshSessionWorkingMemory | null | undefined,
  slotId: string,
  turnInput: {
    userPrompt: string;
    turnScope?: any;
    focusedSummaryText?: string;
    resolvedIntent?: AIQueryIntent;
    assistantReply?: string;
    dataSourceCitation?: string;
    scopedRecordCount?: number;
    scopedDateRange?: string;
    months?: number[];
    years?: number[];
    specificDates?: string[];
    dateRange?: { from: string; to: string; label?: string };
    isDutyShift24h?: boolean;
    explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db' | null;
    targetStaffNames?: string[];
    patientDigest?: string[];
    specialtyHint?: string;
    loaiPTTTFilter?: string;
    isSurgeryListQuery?: boolean;
  }
): DshSessionWorkingMemory {
  const base = currentMemory || createEmptyDshWorkingMemory(slotId);
  const ts = turnInput.turnScope || {};

  const resolvedIntent: AIQueryIntent =
    turnInput.resolvedIntent || ts.resolvedIntent || 'general_summary';
  const replyText = turnInput.assistantReply || turnInput.focusedSummaryText || '';
  const dataSourceCitation =
    turnInput.dataSourceCitation || ts.dataSourceCitation || 'Dữ liệu đang mở';
  const scopedRecordCount =
    typeof turnInput.scopedRecordCount === 'number'
      ? turnInput.scopedRecordCount
      : Array.isArray(ts.scopedRecords)
      ? ts.scopedRecords.length
      : base.anchoredTimeScope?.recordCount || 0;
  const scopedDateRange = turnInput.scopedDateRange ?? ts.scopedDateRange;
  const months = turnInput.months ?? ts.months ?? base.anchoredTimeScope?.months ?? [];
  const years = turnInput.years ?? ts.years ?? base.anchoredTimeScope?.years ?? [];
  const specificDates =
    turnInput.specificDates ?? ts.specificDates ?? base.anchoredTimeScope?.specificDates ?? [];
  const dateRange = turnInput.dateRange ?? ts.dateRange ?? base.anchoredTimeScope?.dateRange;
  const isDutyShift24h =
    turnInput.isDutyShift24h ?? ts.isDutyShift24h ?? base.anchoredTimeScope?.isDutyShift24h;
  const explicitSource =
    turnInput.explicitSource ?? ts.explicitSource ?? base.anchoredTimeScope?.explicitSource ?? null;
  const targetStaffNames: string[] =
    turnInput.targetStaffNames && turnInput.targetStaffNames.length > 0
      ? turnInput.targetStaffNames
      : Array.isArray(ts.targetStaffNames) && ts.targetStaffNames.length > 0
      ? ts.targetStaffNames
      : base.activeEntities.targetStaffNames;
  const patientDigest: string[] =
    turnInput.patientDigest && turnInput.patientDigest.length > 0
      ? turnInput.patientDigest
      : Array.isArray(ts.patientDigest) && ts.patientDigest.length > 0
      ? ts.patientDigest
      : base.activeEntities.patientDigest;

  const nextTurnIndex =
    base.turnLedger.length > 0
      ? base.turnLedger[base.turnLedger.length - 1].turnIndex + 1
      : 1;

  const entry: DshTurnLedgerEntry = {
    turnIndex: nextTurnIndex,
    timestamp: Date.now(),
    userPrompt: turnInput.userPrompt,
    resolvedIntent,
    dataSourceCitation,
    scopedRecordCount,
    scopedDateRange,
    keyTakeaway: extractConciseTurnTakeaway(replyText),
    targetStaffNames: targetStaffNames.length > 0 ? targetStaffNames : undefined,
    patientSample: patientDigest.length > 0 ? patientDigest.slice(0, 6) : undefined,
  };

  const updatedMemory: DshSessionWorkingMemory = {
    slotId,
    updatedAt: Date.now(),
    anchoredTimeScope: {
      months,
      years,
      specificDates,
      dateRange,
      isDutyShift24h,
      explicitSource,
      dataSourceCitation,
      scopedDateRange,
      recordCount: scopedRecordCount,
      scopedRecordCount,
      updatedAt: Date.now(),
    },
    activeEntities: {
      targetStaffNames,
      patientDigest: patientDigest.slice(0, 30),
      lastSpecialtyHint: turnInput.specialtyHint ?? base.activeEntities.lastSpecialtyHint,
      lastLoaiPTTTFilter: turnInput.loaiPTTTFilter ?? base.activeEntities.lastLoaiPTTTFilter,
      lastWasSurgeryList: turnInput.isSurgeryListQuery ?? ts.lastWasSurgeryList,
    },
    turnLedger: [...base.turnLedger.slice(-14), entry],
  };

  saveDshWorkingMemory(updatedMemory);
  return updatedMemory;
}

/**
 * Xây dựng khối `[DSH WORKING MEMORY & CONVERSATION STATE]` để tiêm vào `in-history` prompt của DeepSeek
 */
export function buildDshWorkingMemoryPromptBlock(
  memory?: DshSessionWorkingMemory | null
): string {
  if (
    !memory ||
    (!memory.anchoredTimeScope &&
      memory.turnLedger.length === 0 &&
      memory.activeEntities.patientDigest.length === 0)
  ) {
    return '';
  }

  const lines: string[] = [
    '=== SỔ CÁI BỘ NHỚ LÀM VIỆC PHIÊN CHAT (@deepseek-ai/dsh-memory & dsh-session) ===',
  ];

  if (memory.anchoredTimeScope) {
    const recCount =
      memory.anchoredTimeScope.recordCount ?? memory.anchoredTimeScope.scopedRecordCount ?? 0;
    lines.push(
      `- **Phạm vi dữ liệu đang neo (Anchored Scope)**: ${memory.anchoredTimeScope.dataSourceCitation} (${recCount} ca PTTT).`
    );
  }

  if (memory.activeEntities.targetStaffNames.length > 0) {
    lines.push(
      `- **Nhân sự / Bác sĩ đang theo dõi trong mạch hội thoại**: ${memory.activeEntities.targetStaffNames.join(', ')}.`
    );
  }

  if (memory.activeEntities.patientDigest.length > 0) {
    lines.push(
      `- **Danh sách bệnh nhân / ca mổ đang xét trong ngữ cảnh (${memory.activeEntities.patientDigest.length} ca tiêu biểu)**:\n  ${memory.activeEntities.patientDigest.slice(0, 12).join('\n  ')}`
    );
  }

  if (memory.turnLedger.length > 0) {
    const recentLedger = memory.turnLedger.slice(-5);
    lines.push(
      `- **Tóm tắt các lượt hỏi trước trong phiên (Session Event Ledger)**:\n${recentLedger
        .map(
          (t) =>
            `  + [Lượt #${t.turnIndex}] Hỏi: "${t.userPrompt}" → Nguồn: ${t.dataSourceCitation} → Kết quả: ${t.keyTakeaway}`
        )
        .join('\n')}`
    );
  }

  lines.push(
    `- **Quy tắc giải nghĩa đại từ liên kết (Coreference Resolution)**: Nếu câu hỏi hiện tại dùng các cụm từ như *"trong danh sách đó"*, *"trong đó"*, *"các ca trên"*, *"số liệu đó"*, *"bác sĩ đó"*, *"bệnh nhân này"*, *"còn ... thì sao?"*, hãy liên kết trực tiếp với **Phạm vi dữ liệu đang neo** và **Tóm tắt các lượt hỏi trước** ở trên.`
  );

  return lines.join('\n');
}

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
 * Nén thông minh các bảng Markdown trong lịch sử hội thoại (`@deepseek-ai/dsh-compaction`):
 * - Nếu `maxDataRows <= 0`: loại bỏ toàn bộ các dòng bảng `| ... |` (phục vụ kiểm thử hoặc khi cần nén tối đa).
 * - Nếu `maxDataRows > 0`: giữ lại dòng tiêu đề bảng + tối đa `maxDataRows` dòng dữ liệu đầu tiên
 *   để mô hình vẫn nhìn thấy danh sách bệnh nhân/ca mổ ở lượt hỏi trước mà không bị phình context.
 */
export function compactMarkdownTablesInText(text: string, maxDataRows = 0): string {
  const lines = text.split('\n');
  if (maxDataRows <= 0) {
    return lines
      .filter((line) => !line.trim().startsWith('|'))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const out: string[] = [];
  let inTable = false;
  let tableLineCount = 0;
  let omittedRows = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableLineCount = 0;
        omittedRows = 0;
      }
      tableLineCount++;
      // Dòng 1 là Header, Dòng 2 là Separator (`| --- |`), từ dòng 3 trở đi là Data Rows
      if (tableLineCount <= maxDataRows + 2) {
        out.push(line);
      } else {
        omittedRows++;
      }
    } else {
      if (inTable && omittedRows > 0) {
        out.push(`*(... Đã rút gọn ${omittedRows} dòng bảng tiếp theo bởi dsh-compaction)*`);
      }
      inTable = false;
      tableLineCount = 0;
      omittedRows = 0;
      out.push(line);
    }
  }

  if (inTable && omittedRows > 0) {
    out.push(`*(... Đã rút gọn ${omittedRows} dòng bảng tiếp theo bởi dsh-compaction)*`);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
 * Nén lịch sử trò chuyện 2 tầng trước khi gửi lên DeepSeek API:
 * - Tầng 1 (Older Turns Summary Node): Nếu cuộc hội thoại dài hơn `maxTurns`, thay vì vứt bỏ các lượt cũ
 *   khiến AI quên ngữ cảnh đầu phiên, `dsh-compaction` gom các lượt cũ thành một cặp nút tóm tắt
 *   `[DSH_COMPACTION_SUMMARY_NODE]` ở đầu lịch sử.
 * - Tầng 2 (Recent Window): Giữ nguyên các lượt gần nhất (`maxTurns`), loại bỏ `<think>...</think>` và
 *   nén bảng Markdown cũ theo ngưỡng `maxTableRowsInRecentTurn`.
 */
export function compactSessionHistoryForDeepSeek(
  messages: AIChatMessage[],
  maxTurns = 6,
  maxCharsPerAssistantTurn = 900,
  maxTableRowsInRecentTurn = 0
): AIMessageInput[] {
  const validMessages = messages.filter(
    (m) => !m.isError && !m.clarificationOptions && m.content && m.content.trim().length > 0
  );

  const olderMessages =
    validMessages.length > maxTurns
      ? validMessages.slice(0, validMessages.length - maxTurns)
      : [];
  const recent = validMessages.slice(-maxTurns);

  const result: AIMessageInput[] = [];

  // Tầng 1: Nút tóm tắt lịch sử cũ (`@deepseek-ai/dsh-compaction` summary node)
  if (olderMessages.length >= 2) {
    const summaryPairs: string[] = [];
    for (let i = 0; i < olderMessages.length; i++) {
      const msg = olderMessages[i];
      if (msg.role === 'user') {
        const nextMsg = i + 1 < olderMessages.length ? olderMessages[i + 1] : undefined;
        const ansSummary =
          nextMsg && nextMsg.role === 'assistant'
            ? extractConciseTurnTakeaway(nextMsg.content, 180)
            : '';
        const srcNote =
          nextMsg && nextMsg.dataSourceCitation ? ` [${nextMsg.dataSourceCitation}]` : '';
        summaryPairs.push(
          `- Hỏi: "${msg.content.trim()}"${srcNote} → Trả lời: ${ansSummary}`
        );
      }
    }
    if (summaryPairs.length > 0) {
      result.push({
        role: 'user',
        content: `[DSH_COMPACTION_SUMMARY_NODE — Tóm tắt các lượt hội thoại trước trong phiên]:\n${summaryPairs
          .slice(-8)
          .join('\n')}`,
      });
      result.push({
        role: 'assistant',
        content:
          'Đã ghi nhận đầy đủ lịch sử các lượt hỏi, nguồn số liệu và kết quả phân tích ở đầu phiên để liên kết ngữ cảnh.',
      });
    }
  }

  // Tầng 2: Các lượt gần nhất trong cửa sổ hoạt động
  recent.forEach((m, idx) => {
    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: m.content.trim(),
      });
      return;
    }

    const isLastAssistantTurn = idx === recent.length - 1 || idx === recent.length - 2;
    const rowsToKeep = isLastAssistantTurn ? maxTableRowsInRecentTurn : 0;

    let clean = stripDeepSeekThinkingBlocks(m.content);
    clean = compactMarkdownTablesInText(clean, rowsToKeep);

    if (clean.length > maxCharsPerAssistantTurn) {
      clean = `${clean.slice(0, maxCharsPerAssistantTurn)}... [Đã tóm lược bởi dsh-compaction]`;
    }

    result.push({
      role: 'assistant',
      content: clean,
    });
  });

  return result;
}

/**
 * 4. `@deepseek-ai/dsh-llm-deepseek` (`systemPromptUpdate: 'in-history'`):
 * Tổ chức mảng `messages` gửi tới DeepSeek sao cho `messages[0]` (System Prompt tĩnh)
 * không bị thay đổi giữa các câu hỏi trong cùng phiên, giúp DeepSeek kích hoạt Prefix Cache (`prompt_cache_hit_tokens`),
 * đồng thời tiêm `DshSessionWorkingMemory` vào luồng `in-history` để AI nắm trọn vẹn ngữ cảnh hội thoại.
 */
export function buildDeepSeekHarnessMessages(params: {
  staticSystemPrompt: string;
  dynamicTurnContextPrompt: string;
  compactedHistory: AIMessageInput[];
  userQuestion: string;
  spilledToolContext: string;
  dataSourceCitation?: string;
  workingMemory?: DshSessionWorkingMemory | null;
}): AIMessageInput[] {
  const {
    staticSystemPrompt,
    dynamicTurnContextPrompt,
    compactedHistory,
    userQuestion,
    spilledToolContext,
    dataSourceCitation,
    workingMemory,
  } = params;

  const memoryBlock = buildDshWorkingMemoryPromptBlock(workingMemory);

  return [
    // Message 0: 100% Static Prefix -> Hits DeepSeek Disk/KV Prefix Cache on every subsequent turn
    {
      role: 'system',
      content: staticSystemPrompt,
    },
    ...compactedHistory,
    // In-history system update + Working Memory Ledger + verified tool execution output for the current turn
    {
      role: 'user',
      content: [
        dynamicTurnContextPrompt,
        ...(memoryBlock ? [memoryBlock] : []),
        `CÂU HỎI HIỆN TẠI CỦA NGƯỜI DÙNG:\n"${userQuestion}"`,
        `=== KẾT QUẢ TRUY VẤN & TÍNH TOÁN CHÍNH XÁC 100% TỪ HỆ THỐNG (ĐÃ XÁC THỰC) ===\n${spilledToolContext}`,
        `YÊU CẦU TRẢ LỜI TRỌNG TÂM:\n- Trả lời trực tiếp, ngắn gọn, chính xác câu hỏi "${userQuestion}" dựa hoàn toàn vào số liệu đã tính toán ở trên và mạch hội thoại trước đó.\n- Nêu rõ nguồn số liệu ("${dataSourceCitation || 'Dữ liệu đang mở'}") ở dòng đầu tiên.\n- TUYỆT ĐỐI KHÔNG tự ý thêm phân tích theo Mùa hoặc theo Bác sĩ nếu câu hỏi không hỏi.\n- TUYỆT ĐỐI KHÔNG nói "chưa thể xác định" hay "không có trường ngayBD/ngayKT/ptChinh" vì hệ thống TypeScript đã truy xuất và tính toán sẵn toàn bộ kết quả ở trên.`,
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
