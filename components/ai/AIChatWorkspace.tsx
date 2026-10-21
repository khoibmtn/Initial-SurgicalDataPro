import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
  Database,
  BarChart3,
  Table2,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Brain,
} from 'lucide-react';
import {
  AIArtifact,
  AIChatMessage,
  AIExecutionMode,
  AIPersonalOverride,
  AIQueryIntent,
  AIRLCDMemoryState,
  AISlotConfig,
  AISlotId,
  AISystemConfig,
} from '../../types/ai';
import {
  subscribeToAISystemConfig,
  loadPersonalAIOverride,
  getEffectiveSlotConfig,
  getEffectiveProviderConfig,
  AI_CONFIG_CHANGED_EVENT,
} from '../../services/ai/aiConfigService';
import { generateAICompletion } from '../../services/ai/aiProviderClient';
import { buildAISystemPrompt } from '../../services/ai/aiSemanticSchema';
import {
  AIDataContextInput,
  runRelationalQueryPipeline,
  getRecordIsoDate,
  getAllRecordsFromContext,
} from '../../services/ai/aiQueryEngine';
import {
  ALL_AI_INTENTS,
  AI_INTENT_METADATA,
  createDefaultRLCDMemory,
  loadPreferredExecutionMode,
  savePreferredExecutionMode,
  subscribeToRLCDMemory,
  recordRLCDUserFeedback,
} from '../../services/ai/jevSystemOneEngine';
import {
  exportArtifactToExcel,
  parseCustomArtifactsFromLLMText,
} from '../../services/ai/aiArtifactExportService';
import { AIModelQuickSelector } from './AIModelQuickSelector';
import { AIInteractiveChartArtifact } from './AIInteractiveChartArtifact';
import { AIDataTableArtifact } from './AIDataTableArtifact';

export interface AIChatSessionStatus {
  messageCount: number;
  artifactCount: number;
  isGenerating: boolean;
  lastMessagePreview: string;
}

interface AIChatWorkspaceProps {
  slotId: AISlotId;
  dataContext: AIDataContextInput;
  defaultExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
  onOpenAIConfigTab?: () => void;
  compactMode?: boolean;
  onStatusChange?: (status: AIChatSessionStatus) => void;
  onRequestLoadData?: () => void;
  isLoadingExternalData?: boolean;
}

const getChatHistoryStorageKey = (slotId: AISlotId) => `sdp_ai_chat_history_v1_${slotId}`;

interface PersistedChatSession {
  messages: AIChatMessage[];
  selectedArtifactId: string | null;
}

const loadPersistedChatSession = (slotId: AISlotId): PersistedChatSession => {
  try {
    const raw = localStorage.getItem(getChatHistoryStorageKey(slotId));
    if (!raw) return { messages: [], selectedArtifactId: null };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.messages)) {
      return {
        messages: parsed.messages,
        selectedArtifactId:
          typeof parsed.selectedArtifactId === 'string' ? parsed.selectedArtifactId : null,
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return { messages: [], selectedArtifactId: null };
};

const savePersistedChatSession = (
  slotId: AISlotId,
  messages: AIChatMessage[],
  selectedArtifactId: string | null
) => {
  try {
    const trimmedMessages = messages.slice(-25).map((m) => ({
      ...m,
      artifacts: m.artifacts?.map((a) => ({
        ...a,
        tableConfig: a.tableConfig
          ? {
              ...a.tableConfig,
              rows: a.tableConfig.rows.slice(0, 250),
            }
          : undefined,
      })),
    }));
    localStorage.setItem(
      getChatHistoryStorageKey(slotId),
      JSON.stringify({ messages: trimmedMessages, selectedArtifactId })
    );
  } catch {
    // Ignore storage quota errors
  }
};

const SUGGESTED_PROMPTS: Record<AISlotId, string[]> = {
  daily_storage: [
    'Trong danh sách đang mở, những ai phải chấm ngoài giờ, từ giờ nào đến giờ nào?',
    'Kiểm tra trùng lịch nhân viên, thiếu mã máy và chưa có giúp việc trong kỳ',
    'Nhân viên nào tham gia nhiều ca mổ nhất trong kỳ này?',
    'Bao nhiêu ca sử dụng gói DV yêu cầu sản khoa?',
  ],
  monthly_storage: [
    'Trong danh sách tháng này, những ai phải chấm ngoài giờ, tổng số giờ của từng người?',
    'Thống kê khối lượng ca mổ của từng bác sĩ theo 6 vị trí (PT chính, PT phụ, BS GM...)',
    'Bao nhiêu ca sử dụng gói DV yêu cầu sản khoa và thanh toán thù lao gói theo nhân viên?',
    'Tháng này mỗi nhân viên trực 24h bao nhiêu buổi?',
  ],
  statistics_studio: [
    'Phân tích so sánh phẫu thuật chấn thương chỉnh hình 9 tháng đầu năm 2026 so với 2025',
    'Phân tích tổng hợp tình hình phẫu thuật Ngoại tổng hợp và Sản khoa năm 2026 so với cùng kỳ',
    'Phân tích phẫu thuật nội soi tiêu hóa ở các tháng khác nhau, mùa Hè vs mùa Đông, theo từng bác sĩ',
    'Thống kê tình hình sử dụng các gói dịch vụ yêu cầu và lịch trực 24h',
  ],
  conflict_insight: [
    'Đánh giá tình trạng trùng giờ nhân viên và thiếu mã máy trong kỳ',
  ],
};

/** Render inline **bold** and `code` tokens cleanly */
const renderInlineTokens = (str: string): React.ReactNode => {
  if (!str) return null;
  const parts = str.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return (
        <strong key={i} className="font-bold text-slate-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-sky-800 font-mono text-[11px]"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{p}</span>;
  });
};

const isMarkdownTableRow = (line: string): boolean => {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
};

const isMarkdownTableSeparator = (line: string): boolean => {
  const t = line.trim();
  if (!t.includes('-')) return false;
  const cells = t
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
};

const splitMarkdownRowCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Rich Markdown renderer with full GFM Table, Code Block, Heading, and List support */
const FormattedMessageContent: React.FC<{ content: string }> = ({ content }) => {
  const rawLines = (content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 1. Blank line
    if (!trimmed) {
      elements.push(<div key={`sp_${i}`} className="h-1" />);
      i++;
      continue;
    }

    // 2. Fenced Code Block ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
        codeLines.push(rawLines[i]);
        i++;
      }
      if (i < rawLines.length) i++; // skip closing ```
      elements.push(
        <pre
          key={`code_${i}`}
          className="p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto my-1.5"
        >
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // 3. Markdown Table block (| ... |)
    if (
      isMarkdownTableRow(trimmed) &&
      i + 1 < rawLines.length &&
      (isMarkdownTableSeparator(rawLines[i + 1]) || isMarkdownTableRow(rawLines[i + 1]))
    ) {
      const tableLines: string[] = [];
      while (i < rawLines.length && isMarkdownTableRow(rawLines[i])) {
        tableLines.push(rawLines[i]);
        i++;
      }

      const hasSeparator = tableLines.length >= 2 && isMarkdownTableSeparator(tableLines[1]);
      const headerCells = splitMarkdownRowCells(tableLines[0]);
      const alignments: ('left' | 'center' | 'right')[] = hasSeparator
        ? splitMarkdownRowCells(tableLines[1]).map((sep) => {
            if (sep.startsWith(':') && sep.endsWith(':')) return 'center';
            if (sep.endsWith(':')) return 'right';
            return 'left';
          })
        : headerCells.map(() => 'left');
      const bodyLines = hasSeparator ? tableLines.slice(2) : tableLines.slice(1);

      elements.push(
        <div
          key={`tbl_${i}`}
          className="my-2 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-800">
                {headerCells.map((cell, cIdx) => (
                  <th
                    key={cIdx}
                    style={{ textAlign: alignments[cIdx] || 'left' }}
                    className="px-3 py-2 font-bold border-r border-slate-200/70 last:border-r-0 whitespace-nowrap"
                  >
                    {renderInlineTokens(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {bodyLines
                .filter((r) => !isMarkdownTableSeparator(r))
                .map((rowLine, rIdx) => {
                  const rowCells = splitMarkdownRowCells(rowLine);
                  return (
                    <tr
                      key={rIdx}
                      className={
                        rIdx % 2 === 1
                          ? 'bg-slate-50/60 hover:bg-sky-50/40'
                          : 'bg-white hover:bg-sky-50/40'
                      }
                    >
                      {headerCells.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          style={{ textAlign: alignments[cIdx] || 'left' }}
                          className="px-3 py-1.5 text-slate-700 border-r border-slate-100 last:border-r-0 align-top"
                        >
                          {renderInlineTokens(rowCells[cIdx] ?? '')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 4. Horizontal Rule (---, ***, ___)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(<hr key={`hr_${i}`} className="my-2.5 border-slate-200" />);
      i++;
      continue;
    }

    // 5. Headings (#, ##, ###, ####)
    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h5 key={`h4_${i}`} className="font-bold text-slate-900 text-xs pt-1">
          {renderInlineTokens(trimmed.replace(/^####\s+/, ''))}
        </h5>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3_${i}`} className="font-bold text-slate-900 text-sm pt-1">
          {renderInlineTokens(trimmed.replace(/^###\s+/, ''))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      elements.push(
        <h3
          key={`h2_${i}`}
          className="font-bold text-slate-900 text-sm pt-1.5 border-b border-slate-100 pb-1"
        >
          {renderInlineTokens(trimmed.replace(/^#{1,2}\s+/, ''))}
        </h3>
      );
      i++;
      continue;
    }

    // 6. Blockquote (> ...)
    if (trimmed.startsWith('> ')) {
      elements.push(
        <div
          key={`bq_${i}`}
          className="pl-3 py-1 pr-2 border-l-2 border-sky-500 bg-sky-50/50 rounded-r text-slate-700"
        >
          {renderInlineTokens(trimmed.slice(2))}
        </div>
      );
      i++;
      continue;
    }

    // 7. Bullet list (- , + , * )
    if (trimmed.startsWith('- ') || trimmed.startsWith('+ ') || trimmed.startsWith('* ')) {
      const isSubBullet = line.startsWith('  ') || line.startsWith('\t');
      elements.push(
        <div
          key={`ul_${i}`}
          className={`flex items-start gap-1.5 ${isSubBullet ? 'pl-4 text-slate-700' : ''}`}
        >
          <span className="text-sky-600 font-bold mt-0.5">•</span>
          <div className="flex-1">{renderInlineTokens(trimmed.slice(2))}</div>
        </div>
      );
      i++;
      continue;
    }

    // 8. Numbered list (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      elements.push(
        <div key={`ol_${i}`} className="flex items-start gap-1.5">
          <span className="text-sky-700 font-bold shrink-0">{numMatch[1]}.</span>
          <div className="flex-1">{renderInlineTokens(numMatch[2])}</div>
        </div>
      );
      i++;
      continue;
    }

    // 9. Standard paragraph
    elements.push(<p key={`p_${i}`}>{renderInlineTokens(line)}</p>);
    i++;
  }

  return <div className="space-y-1.5 text-xs leading-relaxed text-slate-800">{elements}</div>;
};

export const AIChatWorkspace: React.FC<AIChatWorkspaceProps> = ({
  slotId,
  dataContext,
  defaultExpanded = false,
  onToggleExpand,
  onOpenAIConfigTab,
  compactMode = false,
  onStatusChange,
  onRequestLoadData,
  isLoadingExternalData = false,
}) => {
  const [systemConfig, setSystemConfig] = useState<AISystemConfig | null>(null);
  const [personalOverride, setPersonalOverride] = useState<AIPersonalOverride>(() =>
    loadPersonalAIOverride()
  );
  const [activeSlotConfig, setActiveSlotConfig] = useState<AISlotConfig>(() =>
    getEffectiveSlotConfig(slotId)
  );

  const [messages, setMessages] = useState<AIChatMessage[]>(
    () => loadPersistedChatSession(slotId).messages
  );
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpandedStudio, setIsExpandedStudio] = useState(defaultExpanded);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    () => loadPersistedChatSession(slotId).selectedArtifactId
  );
  const [artifactViewMode, setArtifactViewMode] = useState<'both' | 'chart' | 'table'>('both');
  const [executionMode, setExecutionMode] = useState<AIExecutionMode>(() =>
    loadPreferredExecutionMode()
  );
  const [rlcdMemory, setRlcdMemory] = useState<AIRLCDMemoryState>(() =>
    createDefaultRLCDMemory()
  );
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [feedbackEditingMsgId, setFeedbackEditingMsgId] = useState<string | null>(null);
  const [feedbackCorrectedIntent, setFeedbackCorrectedIntent] =
    useState<AIQueryIntent>('overtime_audit');
  const [feedbackPreferredMode, setFeedbackPreferredMode] = useState<
    'fast_system1' | 'deep_system2'
  >('fast_system1');
  const [feedbackNote, setFeedbackNote] = useState('');
  const activeLoadedSlotRef = useRef<AISlotId>(slotId);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeToRLCDMemory((mem) => {
      setRlcdMemory(mem);
    });
    return () => unsub();
  }, []);

  const handleExecutionModeChange = (mode: AIExecutionMode) => {
    setExecutionMode(mode);
    savePreferredExecutionMode(mode);
  };

  const formatChatTimestamp = (ts?: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hh}:${mm} • ${day}/${month}/${year}`;
  };

  const handleCopyQuestion = async (msg: AIChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = msg.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedMsgId(msg.id);
    setTimeout(() => {
      setCopiedMsgId((prev) => (prev === msg.id ? null : prev));
    }, 2000);
  };

  const handleDeleteSingleExchange = (msgId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      const next = [...prev];
      // If deleting a user question, also delete the immediately following assistant reply
      if (next[idx].role === 'user' && idx + 1 < next.length && next[idx + 1].role === 'assistant') {
        next.splice(idx, 2);
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  const handleClearAllHistory = () => {
    setMessages([]);
    setSelectedArtifactId(null);
    setFeedbackEditingMsgId(null);
    try {
      localStorage.removeItem(getChatHistoryStorageKey(slotId));
    } catch {}
  };

  // Reload saved history when switching slotId (e.g., Daily Storage <-> Monthly Storage)
  useEffect(() => {
    if (activeLoadedSlotRef.current !== slotId) {
      const saved = loadPersistedChatSession(slotId);
      setMessages(saved.messages);
      setSelectedArtifactId(saved.selectedArtifactId);
      activeLoadedSlotRef.current = slotId;
    }
  }, [slotId]);

  // Persist history whenever messages or selectedArtifactId change for the active slotId
  useEffect(() => {
    if (activeLoadedSlotRef.current === slotId) {
      savePersistedChatSession(slotId, messages, selectedArtifactId);
    }
  }, [slotId, messages, selectedArtifactId]);

  useEffect(() => {
    const unsub = subscribeToAISystemConfig((cfg) => {
      setSystemConfig(cfg);
      const pOverride = loadPersonalAIOverride();
      setPersonalOverride(pOverride);
      setActiveSlotConfig(getEffectiveSlotConfig(slotId, cfg, pOverride));
    });

    const handleConfigEvent = () => {
      const pOverride = loadPersonalAIOverride();
      setPersonalOverride(pOverride);
      setSystemConfig((prev) => {
        if (prev) {
          setActiveSlotConfig(getEffectiveSlotConfig(slotId, prev, pOverride));
        }
        return prev;
      });
    };
    window.addEventListener(AI_CONFIG_CHANGED_EVENT, handleConfigEvent);
    return () => {
      unsub();
      window.removeEventListener(AI_CONFIG_CHANGED_EVENT, handleConfigEvent);
    };
  }, [slotId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Collect all artifacts generated in the session
  const allArtifacts = React.useMemo(() => {
    const list: AIArtifact[] = [];
    messages.forEach((m) => {
      if (m.artifacts && m.artifacts.length > 0) {
        list.push(...m.artifacts);
      }
    });
    return list;
  }, [messages]);

  useEffect(() => {
    if (!onStatusChange) return;
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const rawPreview = lastMsg
      ? lastMsg.content.replace(/[#*`|>-]/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    onStatusChange({
      messageCount: messages.length,
      artifactCount: allArtifacts.length,
      isGenerating,
      lastMessagePreview: rawPreview.slice(0, 90),
    });
  }, [messages, allArtifacts.length, isGenerating, onStatusChange]);

  const activeStudioArtifact = React.useMemo(() => {
    if (allArtifacts.length === 0) return null;
    if (selectedArtifactId) {
      const found = allArtifacts.find((a) => a.id === selectedArtifactId);
      if (found) return found;
    }
    return allArtifacts[allArtifacts.length - 1];
  }, [allArtifacts, selectedArtifactId]);

  useEffect(() => {
    setIsExpandedStudio(defaultExpanded);
  }, [defaultExpanded]);

  const handleToggleStudio = () => {
    const next = !isExpandedStudio;
    setIsExpandedStudio(next);
    onToggleExpand?.(next);
  };

  const allRecordsCount = getAllRecordsFromContext(dataContext).length;

  const handleSendQuestion = async (
    questionText?: string,
    options?: {
      overrideIntent?: AIQueryIntent;
      forceMode?: 'fast_system1' | 'deep_system2';
      skipUserBubble?: boolean;
    }
  ) => {
    const prompt = (questionText ?? inputPrompt).trim();
    if (!prompt || isGenerating) return;

    if (!questionText) {
      setInputPrompt('');
    }

    if (!options?.skipUserBubble) {
      const userMsg: AIChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
    }
    setIsGenerating(true);

    const startTick = performance.now();

    try {
      // 1. Run Relational Query Pipeline with Jev System One (TypeSafe AI) Classifier
      const queryOutput = await runRelationalQueryPipeline(prompt, dataContext, {
        overrideIntent: options?.overrideIntent,
      });

      // If data source is ambiguous & no local data is opened on the active tab, ask user to clarify immediately (0ms)
      if (queryOutput.needsClarification) {
        const clarifyMsg: AIChatMessage = {
          id: `clarify_${Date.now()}`,
          role: 'assistant',
          content:
            queryOutput.clarificationMessage ||
            'Vui lòng chọn rõ nguồn dữ liệu hoặc khoảng thời gian cần truy vấn:',
          timestamp: Date.now(),
          sourcePrompt: prompt,
          modelId: 'Jev System One — Định tuyến Nguồn Dữ liệu',
          latencyMs: Math.round(performance.now() - startTick),
          clarificationOptions: queryOutput.clarificationOptions,
          systemOneEval: queryOutput.systemOneEval,
          executionModeUsed: 'fast_system1',
        };
        setMessages((prev) => [...prev, clarifyMsg]);
        return;
      }

      const generatedArtifacts = [...queryOutput.artifacts];

      // Auto-focus newest artifact in Studio
      if (generatedArtifacts.length > 0) {
        setSelectedArtifactId(generatedArtifacts[generatedArtifacts.length - 1].id);
      }

      // 2. Decide Fast-Path (System 1) vs Deep-Path (System 2 LLM)
      const effectiveMode: 'fast_system1' | 'deep_system2' =
        options?.forceMode ||
        (executionMode === 'fast_system1'
          ? 'fast_system1'
          : executionMode === 'deep_system2'
          ? 'deep_system2'
          : queryOutput.systemOneEval?.recommendedMode || 'deep_system2');

      const effProvider = getEffectiveProviderConfig(
        activeSlotConfig.provider,
        systemConfig || undefined,
        personalOverride,
        activeSlotConfig.modelId
      );

      let assistantText = '';
      let latencyMs = Math.round(performance.now() - startTick);
      let modeUsed: 'fast_system1' | 'deep_system2' = effectiveMode;

      const focusedSummaryText =
        queryOutput.focusedFastSummary || queryOutput.contextDataForLLM;

      if (effectiveMode === 'fast_system1') {
        // Jev System One Instant Fast-Path (< 80ms): Deliver 100% accurate focused structured answer immediately!
        assistantText = focusedSummaryText;
        latencyMs = Math.max(8, Math.round(performance.now() - startTick));
        modeUsed = 'fast_system1';
      } else if (effProvider.apiKey && effProvider.apiKey.trim()) {
        const allRecords = getAllRecordsFromContext(dataContext);
        const dates = allRecords
          .map((r) => getRecordIsoDate(r))
          .filter(Boolean)
          .sort();
        const loadedDateRange =
          dates.length > 0 ? `${dates[0]} → ${dates[dates.length - 1]}` : 'Chưa nạp';

        const sysPrompt = buildAISystemPrompt(
          {
            contextPage: dataContext.contextPage,
            periodLabel: dataContext.periodLabel,
            dataSourceCitation: queryOutput.dataSourceCitation,
            loadedRecordCount: Math.max(allRecords.length, queryOutput.scopedRecordCount || 0),
            loadedDateRange:
              queryOutput.scopedDateRange && queryOutput.scopedDateRange !== 'Chưa có bản ghi'
                ? queryOutput.scopedDateRange
                : loadedDateRange,
            loadedPackageAssignmentsCount: dataContext.packageAssignments.length,
            loadedDutyScheduleDaysCount: Object.keys(dataContext.dutySchedules || {}).length,
            staffCount: (dataContext.config.staffList || []).length,
            departments: dataContext.config.departments || [],
            packageNames: dataContext.packageDefinitions.map((p) => p.name),
            chapterSummary: dataContext.chapters.map((c) => `${c.ma_chuong}: ${c.ten_chuong}`),
            workingHoursText: 'Mùa Hè 01/05-30/09 | Mùa Đông 01/10-30/04',
          },
          dataContext.config,
          dataContext.packageDefinitions,
          dataContext.chapters
        );

        const recentHistory = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        try {
          const llmResponse = await generateAICompletion({
            providerConfig: effProvider,
            modelId: activeSlotConfig.modelId,
            temperature: activeSlotConfig.temperature,
            reasoningEffort: activeSlotConfig.reasoningEffort,
            maxTokens: activeSlotConfig.maxTokens,
            messages: [
              { role: 'system', content: sysPrompt },
              ...recentHistory,
              {
                role: 'user',
                content: `CÂU HỎI CỦA NGƯỜI DÙNG:\n"${prompt}"\n\n=== KẾT QUẢ TRUY VẤN DỮ LIỆU ĐÃ THỰC THI CHÍNH XÁC 100% TỪ CƠ SỞ DỮ LIỆU ===\n${queryOutput.contextDataForLLM}\n\nHãy trả lời trực tiếp, chính xác và đúng trọng tâm câu hỏi trên dựa hoàn toàn vào số liệu truy vấn ở trên. BẮT BUỘC nêu rõ nguồn dữ liệu ("${queryOutput.dataSourceCitation || dataContext.periodLabel}") ở đầu câu trả lời. LƯU Ý QUAN TRỌNG: Không tự ý đưa phân tích theo Mùa (Mùa Hè/Mùa Đông) hay theo Phẫu thuật viên chính / Bác sĩ vào câu trả lời nếu người dùng không yêu cầu trong câu hỏi.`,
              },
            ],
          });

          const parsed = parseCustomArtifactsFromLLMText(llmResponse.text);
          assistantText = parsed.cleanText;
          if (parsed.customArtifacts.length > 0) {
            generatedArtifacts.push(...parsed.customArtifacts);
            setSelectedArtifactId(
              parsed.customArtifacts[parsed.customArtifacts.length - 1].id
            );
          }
          latencyMs = llmResponse.latencyMs;
          modeUsed = 'deep_system2';
        } catch (llmErr: any) {
          assistantText = `${focusedSummaryText}\n\n---\n⚠️ *Lưu ý kết nối LLM (${effProvider.name} - ${activeSlotConfig.modelId}): ${llmErr?.message || 'Không thể gọi API'}. Hệ thống đã hiển thị trực tiếp kết quả chuẩn xác từ Jev System One ở trên kèm Biểu đồ & Bảng tương tác.*`;
          modeUsed = 'fast_system1';
        }
      } else {
        assistantText = `${focusedSummaryText}\n\n---\n💡 *Hệ thống đã thực thi truy vấn trọng tâm bằng **Jev System One** và dựng sẵn **Biểu đồ & Bảng dữ liệu tương tác**. Để nhận thêm bình luận chuyên sâu từ mô hình **${effProvider.name} (${activeSlotConfig.modelId})**, vui lòng nhập API Key tại mục **Cấu hình → Cấu hình AI**.*`;
        modeUsed = 'fast_system1';
      }

      const aiMsg: AIChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
        sourcePrompt: prompt,
        provider: activeSlotConfig.provider,
        modelId:
          modeUsed === 'fast_system1'
            ? `⚡ Jev System One (${activeSlotConfig.modelId})`
            : activeSlotConfig.modelId,
        reasoningEffort: activeSlotConfig.reasoningEffort,
        temperature: activeSlotConfig.temperature,
        latencyMs,
        dataSourceCitation: queryOutput.dataSourceCitation,
        artifacts: generatedArtifacts,
        toolLogs: queryOutput.executedTools,
        systemOneEval: queryOutput.systemOneEval,
        executionModeUsed: modeUsed,
        focusedFastSummary: focusedSummaryText,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `Đã xảy ra lỗi khi xử lý truy vấn: ${err?.message || 'Lỗi không xác định'}`,
          timestamp: Date.now(),
          isError: true,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePositiveRLCDFeedback = async (msg: AIChatMessage) => {
    const predictedIntent = msg.systemOneEval?.intentChoice.selected || 'general_summary';
    const promptText = msg.sourcePrompt || '';
    if (promptText) {
      const updatedMem = await recordRLCDUserFeedback({
        prompt: promptText,
        predictedIntent,
        rating: 'positive',
        preferredMode: msg.executionModeUsed || 'fast_system1',
      });
      setRlcdMemory(updatedMem);
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              userFeedback: {
                rating: 'positive',
                timestamp: Date.now(),
              },
            }
          : m
      )
    );
    setFeedbackEditingMsgId(null);
  };

  const handleOpenNegativeRLCDDrawer = (msg: AIChatMessage) => {
    const curIntent = msg.systemOneEval?.intentChoice.selected || 'overtime_audit';
    setFeedbackEditingMsgId(msg.id);
    setFeedbackCorrectedIntent(curIntent);
    setFeedbackPreferredMode(msg.executionModeUsed || 'fast_system1');
    setFeedbackNote('');
  };

  const handleSubmitNegativeRLCDCorrection = async (
    msg: AIChatMessage,
    rerunImmediately: boolean
  ) => {
    const predictedIntent = msg.systemOneEval?.intentChoice.selected || 'general_summary';
    const promptText = msg.sourcePrompt || '';
    if (promptText) {
      const updatedMem = await recordRLCDUserFeedback({
        prompt: promptText,
        predictedIntent,
        rating: 'negative',
        correctedIntent: feedbackCorrectedIntent,
        preferredMode: feedbackPreferredMode,
        focusNote: feedbackNote,
      });
      setRlcdMemory(updatedMem);
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              userFeedback: {
                rating: 'negative',
                correctedIntent: feedbackCorrectedIntent,
                preferredMode: feedbackPreferredMode,
                note: feedbackNote.trim() || undefined,
                timestamp: Date.now(),
              },
            }
          : m
      )
    );
    setFeedbackEditingMsgId(null);

    if (rerunImmediately && promptText) {
      await handleSendQuestion(promptText, {
        overrideIntent: feedbackCorrectedIntent,
        forceMode: feedbackPreferredMode,
        skipUserBubble: true,
      });
    }
  };

  return (
    <div
      className={`flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-xs ${
        isExpandedStudio ? 'h-[calc(100vh-125px)]' : compactMode ? 'h-full' : 'h-[680px]'
      }`}
    >
      {/* Top Workspace Header */}
      <div className="px-3.5 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-sky-600 text-white shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-slate-900 truncate">
                Trợ lý AI Phân tích Số liệu Phẫu thuật
              </h3>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  allRecordsCount > 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-sky-50 text-sky-700 border-sky-200'
                }`}
              >
                <Database className="h-2.5 w-2.5" />
                {allRecordsCount > 0
                  ? `Đang mở: ${allRecordsCount.toLocaleString('vi-VN')} ca PTTT`
                  : 'Truy vấn tự động theo câu hỏi'}
              </span>
              {rlcdMemory.totalFeedbackCount > 0 && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1"
                  title="Số lượt phản hồi RLCD đã được AI học tăng cường toàn viện"
                >
                  <Zap className="h-2.5 w-2.5 text-amber-600" />
                  RLCD: {rlcdMemory.totalFeedbackCount} mẫu học
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Ngữ cảnh màn hình: <b>{dataContext.activeSourceCitation || dataContext.periodLabel}</b> • Gói DV (
              {dataContext.packageAssignments.length}) • Lịch trực (
              {Object.keys(dataContext.dutySchedules || {}).length} ngày)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {/* Jev System One / System 2 Execution Mode Switcher */}
          <div
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            title="Chế độ vận hành Jev System One (TypeSafe AI): Auto (tự động chọn Nhanh hoặc Sâu theo độ tin cậy) | Nhanh (trả kết quả tức thì ~50ms) | Sâu (luôn gọi LLM phân tích)"
          >
            {(
              [
                {
                  id: 'auto' as AIExecutionMode,
                  label: 'Auto',
                  title: 'Tự động: Jev System One đánh giá độ tin cậy, trả lời tức thì nếu câu hỏi tra cứu rõ ràng hoặc gọi System 2 (LLM) nếu cần phân tích sâu',
                },
                {
                  id: 'fast_system1' as AIExecutionMode,
                  label: '⚡ Nhanh',
                  title: 'System 1 Fast-Path: Trả kết quả bảng & số liệu trọng tâm tức thì (~50ms) không cần chờ LLM',
                },
                {
                  id: 'deep_system2' as AIExecutionMode,
                  label: '🧠 Sâu',
                  title: 'System 1 + System 2 (LLM): Định tuyến trọng tâm bằng System 1 sau đó gọi LLM viết bình luận chi tiết',
                },
              ]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleExecutionModeChange(m.id)}
                title={m.title}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  executionMode === m.id
                    ? 'bg-white text-sky-700 shadow-2xs border border-sky-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {systemConfig && (
            <AIModelQuickSelector
              slotId={slotId}
              activeSlotConfig={activeSlotConfig}
              systemConfig={systemConfig}
              personalOverride={personalOverride}
              onSlotConfigChange={setActiveSlotConfig}
              onOpenAIConfigTab={onOpenAIConfigTab}
            />
          )}

          <button
            type="button"
            disabled={messages.length === 0}
            onClick={handleClearAllHistory}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              messages.length > 0
                ? 'border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 cursor-pointer'
                : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
            title="Xóa toàn bộ lịch sử trò chuyện"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa lịch sử{messages.length > 0 ? ` (${messages.length})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleStudio}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              isExpandedStudio
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
            }`}
            title={
              isExpandedStudio
                ? 'Thu gọn chế độ Studio 2 cột'
                : 'Mở rộng (Expand) sang chế độ AI Analytics Studio (Hỏi đáp + Khung Biểu đồ & Bảng tương tác)'
            }
          >
            {isExpandedStudio ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Thu gọn</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Expand Studio</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Body: Left = Chat Stream | Right = Interactive Artifact Studio (when expanded & has artifacts) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT COLUMN: Chat Conversation */}
        <div
          className={`flex flex-col min-h-0 ${
            isExpandedStudio && activeStudioArtifact
              ? 'lg:w-[44%] lg:border-r lg:border-slate-200'
              : 'w-full'
          } h-full`}
        >
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {messages.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sky-700 font-bold text-xs">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>
                      Trợ lý AI Phân tích Số liệu Phẫu thuật — Tích hợp Jev System One (TypeSafe AI)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                    ⚡ Tự đánh giá câu hỏi & Học tăng cường RLCD
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Mỗi câu hỏi đều được mô hình <b>Jev System One</b> đánh giá định kiểu song song (<i>Choice • Noul • Score</i>) trong vài mili-giây để nhận diện chính xác trọng tâm nghiệp vụ (Ngoài giờ, Lịch trực 24h, Trùng NV/Máy, Gói DVYC, So sánh Chuyên khoa YoY...) và tự học tăng cường từ phản hồi 👍/👎 của bạn.
                </p>

                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Gợi ý câu hỏi phân tích nhanh (bấm để chạy):
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {(SUGGESTED_PROMPTS[slotId] || SUGGESTED_PROMPTS.statistics_studio).map(
                      (q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => handleSendQuestion(q)}
                          className="text-left px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-sky-50 hover:border-sky-300 text-xs text-slate-700 hover:text-sky-900 font-medium transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span>{q}</span>
                          <Send className="h-3 w-3 text-sky-600 shrink-0" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[95%] rounded-xl px-3.5 py-2.5 shadow-2xs ${
                      msg.role === 'user'
                        ? 'bg-sky-700 text-white text-xs font-medium'
                        : msg.isError
                        ? 'bg-rose-50 border border-rose-200 text-rose-800'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    {/* USER MESSAGE BUBBLE: Question Text + Timestamp + Copy + Refill + Delete */}
                    {msg.role === 'user' && (
                      <div className="space-y-2">
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-sky-600/70 text-[10px] text-sky-100/90 flex-wrap">
                          <span className="flex items-center gap-1 font-normal" title="Thời gian đặt câu hỏi">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{formatChatTimestamp(msg.timestamp)}</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyQuestion(msg)}
                              className="px-2 py-0.5 rounded bg-sky-800/80 hover:bg-sky-900 text-white flex items-center gap-1 transition-colors cursor-pointer"
                              title="Sao chép nội dung câu hỏi này"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="h-2.5 w-2.5 text-emerald-300" />
                                  <span className="text-emerald-200 font-semibold">Đã copy</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-2.5 w-2.5" />
                                  <span>Copy câu hỏi</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInputPrompt(msg.content);
                                inputRef.current?.focus();
                              }}
                              className="px-2 py-0.5 rounded bg-sky-800/80 hover:bg-sky-900 text-white flex items-center gap-1 transition-colors cursor-pointer"
                              title="Điền lại câu hỏi này xuống ô nhập liệu"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                              <span>Hỏi lại</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleExchange(msg.id)}
                              className="px-1.5 py-0.5 rounded bg-sky-800/80 hover:bg-rose-600 text-sky-100 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                              title="Xóa câu hỏi và câu trả lời tương ứng"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                              <span>Xóa</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ASSISTANT MESSAGE HEADER */}
                    {msg.role === 'assistant' && (
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-slate-100 text-[10px] text-slate-400 flex-wrap">
                        <div className="flex items-center gap-1.5 font-semibold text-sky-700 flex-wrap">
                          <Bot className="h-3 w-3" />
                          <span>{msg.modelId || activeSlotConfig.modelId}</span>
                          {msg.executionModeUsed === 'fast_system1' ? (
                            <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold">
                              ⚡ System 1 Fast-Path
                            </span>
                          ) : (
                            msg.reasoningEffort && (
                              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                Effort: {msg.reasoningEffort}
                              </span>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center gap-1 text-slate-400" title="Thời gian trả lời">
                            <Clock className="h-2.5 w-2.5" />
                            <span>{formatChatTimestamp(msg.timestamp)}</span>
                          </span>
                          {msg.latencyMs !== undefined && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                              {msg.latencyMs}ms
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Jev System One (TypeSafe AI) Evaluation Strip */}
                    {msg.role === 'assistant' && msg.systemOneEval && (
                      <div className="mb-2.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/90 text-[11px] space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span>Jev System One:</span>
                            <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold">
                              {msg.systemOneEval.intentChoice.label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-semibold">
                              (P={(msg.systemOneEval.intentChoice.calibratedProbability * 100).toFixed(0)}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                msg.systemOneEval.scores.calibrationConfidence.score >= 85
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {msg.systemOneEval.scores.calibrationConfidence.label}
                            </span>
                            {msg.systemOneEval.nouls.matchesLearnedPattern.value && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                                ★ Đã học RLCD
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Explicit Data Source Citation Badge */}
                    {msg.role === 'assistant' && msg.dataSourceCitation && (
                      <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200/90 text-[11px] text-sky-900 flex items-start gap-1.5">
                        <Database className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-0.5" />
                        <div className="leading-snug">
                          <span className="font-bold text-sky-950">Nguồn số liệu: </span>
                          <span className="font-medium">{msg.dataSourceCitation}</span>
                        </div>
                      </div>
                    )}

                    {/* Tool Execution Badges */}
                    {msg.toolLogs && msg.toolLogs.length > 0 && (
                      <div className="mb-2.5 space-y-1">
                        {msg.toolLogs.map((log, lIdx) => (
                          <div
                            key={lIdx}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-[11px] text-emerald-800 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span className="truncate">{log.summary}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Assistant Message Text */}
                    {msg.role !== 'user' && <FormattedMessageContent content={msg.content} />}

                    {/* Interactive Clarification Quick-Choice Options */}
                    {msg.clarificationOptions && msg.clarificationOptions.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-600 block">
                          Chọn nhanh nguồn dữ liệu để AI truy vấn ngay:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {msg.clarificationOptions.map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={isGenerating}
                              onClick={() => handleSendQuestion(opt.followUpPrompt)}
                              className="text-left px-3 py-2 rounded-lg border border-sky-200 bg-sky-50/70 hover:bg-sky-100 hover:border-sky-300 text-xs text-sky-900 font-semibold transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50"
                            >
                              <div className="min-w-0">
                                <div className="truncate">{opt.label}</div>
                                {opt.description && (
                                  <div className="text-[10px] text-slate-500 font-normal truncate">
                                    {opt.description}
                                  </div>
                                )}
                              </div>
                              <Send className="h-3 w-3 text-sky-600 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inline Artifacts (when NOT in Expanded Studio mode, or quick selector pills when in Studio mode) */}
                    {msg.artifacts && msg.artifacts.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-3">
                        {isExpandedStudio ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-500">
                              Kết quả trực quan (bấm để xem bên phải):
                            </span>
                            {msg.artifacts.map((art) => (
                              <button
                                key={art.id}
                                type="button"
                                onClick={() => setSelectedArtifactId(art.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  activeStudioArtifact?.id === art.id
                                    ? 'bg-sky-600 text-white border-sky-600'
                                    : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                                }`}
                              >
                                <BarChart3 className="h-3.5 w-3.5" />
                                <span className="truncate max-w-[200px]">{art.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          msg.artifacts.map((art) => (
                            <div key={art.id} className="space-y-2.5">
                              {/* KPI Cards */}
                              {art.kpiCards && art.kpiCards.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {art.kpiCards.map((k, kIdx) => (
                                    <div
                                      key={kIdx}
                                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                                    >
                                      <div className="text-[10px] text-slate-500 font-medium">
                                        {k.label}
                                      </div>
                                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                                        {k.value}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {art.chartConfig && (
                                <AIInteractiveChartArtifact artifact={art} height={260} />
                              )}
                              {art.tableConfig && (
                                <AIDataTableArtifact artifact={art} compact />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* RLCD Reinforcement Learning Feedback & System 2 Deep Upgrade Footer */}
                    {msg.role === 'assistant' && !msg.isError && !msg.clarificationOptions && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-slate-400">
                              Đánh giá & Tự học tăng cường (RLCD):
                            </span>
                            <button
                              type="button"
                              onClick={() => handlePositiveRLCDFeedback(msg)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer ${
                                msg.userFeedback?.rating === 'positive'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-slate-200 hover:border-emerald-300'
                              }`}
                              title="Xác nhận câu trả lời đúng trọng tâm để Jev System One củng cố trọng số (+1.0 RLCD)"
                            >
                              <ThumbsUp className="h-3 w-3" />
                              <span>
                                {msg.userFeedback?.rating === 'positive'
                                  ? 'Đã học (+1 RLCD)'
                                  : 'Đúng trọng tâm'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenNegativeRLCDDrawer(msg)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 transition-colors cursor-pointer ${
                                msg.userFeedback?.rating === 'negative'
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border-slate-200 hover:border-amber-300'
                              }`}
                              title="Hiệu chỉnh lại trọng tâm câu hỏi và dạy AI trả lời đúng ý định"
                            >
                              <ThumbsDown className="h-3 w-3" />
                              <span>
                                {msg.userFeedback?.rating === 'negative'
                                  ? `Đã hiệu chỉnh (${
                                      msg.userFeedback.correctedIntent
                                        ? AI_INTENT_METADATA[msg.userFeedback.correctedIntent]
                                            .shortBadge
                                        : 'RLCD'
                                    })`
                                  : 'Chưa chuẩn / Dạy lại AI'}
                              </span>
                            </button>
                          </div>

                          {/* Upgrade to System 2 (LLM) button when answered via Fast-Path */}
                          {msg.executionModeUsed === 'fast_system1' && msg.sourcePrompt && (
                            <button
                              type="button"
                              disabled={isGenerating}
                              onClick={() =>
                                handleSendQuestion(msg.sourcePrompt, {
                                  overrideIntent: msg.systemOneEval?.intentChoice.selected,
                                  forceMode: 'deep_system2',
                                  skipUserBubble: true,
                                })
                              }
                              className="px-2.5 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="Gọi thêm mô hình ngôn ngữ lớn (System 2 LLM) để viết nhận xét chuyên sâu cho kết quả này"
                            >
                              <Brain className="h-3 w-3" />
                              <span>Phân tích sâu bằng LLM (System 2)</span>
                            </button>
                          )}
                        </div>

                        {/* Inline RLCD Correction Drawer when user clicks "Chưa chuẩn / Dạy lại AI" */}
                        {feedbackEditingMsgId === msg.id && (
                          <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-950">
                                🧠 Hiệu chỉnh Trọng tâm cho Jev System One (RLCD Training)
                              </span>
                              <button
                                type="button"
                                onClick={() => setFeedbackEditingMsgId(null)}
                                className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Đóng
                              </button>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[11px] font-semibold text-amber-900 block">
                                1. Chọn đúng loại nghiệp vụ mà câu hỏi của bạn hướng tới:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {ALL_AI_INTENTS.map((intentKey) => (
                                  <button
                                    key={intentKey}
                                    type="button"
                                    onClick={() => setFeedbackCorrectedIntent(intentKey)}
                                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                                      feedbackCorrectedIntent === intentKey
                                        ? 'bg-sky-700 text-white border-sky-700'
                                        : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300'
                                    }`}
                                  >
                                    {AI_INTENT_METADATA[intentKey].shortBadge}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[11px] font-semibold text-amber-900 block">
                                2. Chế độ phản hồi ưu tiên cho dạng câu hỏi này:
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setFeedbackPreferredMode('fast_system1')}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                    feedbackPreferredMode === 'fast_system1'
                                      ? 'bg-emerald-700 text-white border-emerald-700'
                                      : 'bg-white text-slate-700 border-slate-200'
                                  }`}
                                >
                                  ⚡ Trả lời nhanh (System 1 Fast-Path)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFeedbackPreferredMode('deep_system2')}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                    feedbackPreferredMode === 'deep_system2'
                                      ? 'bg-sky-700 text-white border-sky-700'
                                      : 'bg-white text-slate-700 border-slate-200'
                                  }`}
                                >
                                  🧠 Phân tích sâu (System 2 LLM)
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={feedbackNote}
                                onChange={(e) => setFeedbackNote(e.target.value)}
                                placeholder="Ghi chú trọng tâm mong muốn (tùy chọn, VD: Chỉ liệt kê tên nhân viên và khung giờ chấm)..."
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-md outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleSubmitNegativeRLCDCorrection(msg, false)}
                                className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] cursor-pointer"
                              >
                                Chỉ lưu học RLCD
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitNegativeRLCDCorrection(msg, true)}
                                className="px-3 py-1 rounded-md bg-sky-700 hover:bg-sky-800 text-white font-semibold text-[11px] cursor-pointer"
                              >
                                Học & Trả lời lại ngay
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {isGenerating && (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-2xs flex items-center gap-2.5 text-xs text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600 shrink-0" />
                <span>
                  Jev System One đang định tuyến & phân tích trọng tâm (
                  <b>{activeSlotConfig.modelId}</b>)...
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuestion();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              disabled={isGenerating}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Nhập câu hỏi phân tích (VD: Phân tích phẫu thuật CTCH 9 tháng đầu năm 2026 so với 2025...)"
              className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none bg-slate-50/60 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!inputPrompt.trim() || isGenerating}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Gửi</span>
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Expanded Interactive Artifact Canvas (Studio Mode) */}
        {isExpandedStudio && activeStudioArtifact && (
          <div className="flex-1 min-w-0 h-full overflow-y-auto bg-slate-100/70 p-4 space-y-4">
            {/* Artifact Studio Selector & Header */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold text-[10px] uppercase tracking-wider">
                      AI Artifact Studio
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">
                      {activeStudioArtifact.title}
                    </h4>
                  </div>
                  {activeStudioArtifact.subtitle && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {activeStudioArtifact.subtitle}
                    </p>
                  )}
                </div>

                {/* View Mode Switcher & Excel Export */}
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {(
                      [
                        { id: 'both', label: 'Biểu đồ + Bảng' },
                        { id: 'chart', label: 'Chỉ Biểu đồ' },
                        { id: 'table', label: 'Chỉ Bảng' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setArtifactViewMode(m.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          artifactViewMode === m.id
                            ? 'bg-white text-sky-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => exportArtifactToExcel(activeStudioArtifact)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>Xuất Toàn bộ Excel (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Multiple Artifacts Switcher Tabs */}
              {allArtifacts.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100">
                  {allArtifacts.map((art, idx) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => setSelectedArtifactId(art.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors cursor-pointer ${
                        activeStudioArtifact.id === art.id
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      #{idx + 1}: {art.title}
                    </button>
                  ))}
                </div>
              )}

              {/* KPI Summary Strip */}
              {activeStudioArtifact.kpiCards && activeStudioArtifact.kpiCards.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {activeStudioArtifact.kpiCards.map((k, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/90"
                    >
                      <div className="text-[11px] text-slate-500 font-medium">{k.label}</div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">{k.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Chart */}
            {(artifactViewMode === 'both' || artifactViewMode === 'chart') &&
              activeStudioArtifact.chartConfig && (
                <AIInteractiveChartArtifact
                  key={activeStudioArtifact.id}
                  artifact={activeStudioArtifact}
                  height={380}
                />
              )}

            {/* Interactive Table */}
            {(artifactViewMode === 'both' || artifactViewMode === 'table') &&
              activeStudioArtifact.tableConfig && (
                <AIDataTableArtifact
                  key={`table_${activeStudioArtifact.id}`}
                  artifact={activeStudioArtifact}
                />
              )}
          </div>
        )}
      </div>
    </div>
  );
};
