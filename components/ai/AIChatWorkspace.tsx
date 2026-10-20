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
} from 'lucide-react';
import {
  AIArtifact,
  AIChatMessage,
  AIPersonalOverride,
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
    'Tìm kiếm BN có mã hoặc họ tên trong kỳ đang mở',
    'Nhân viên nào tham gia nhiều ca mổ nhất trong kỳ này?',
    'Bao nhiêu ca sử dụng gói DV yêu cầu sản khoa?',
    'Tháng này nhân viên trực bao nhiêu buổi (tính cả ngày thường & ngày nghỉ)?',
  ],
  monthly_storage: [
    'Thống kê khối lượng ca mổ của từng bác sĩ theo 6 vị trí (PT chính, PT phụ, BS GM...)',
    'Bao nhiêu ca sử dụng gói DV yêu cầu sản khoa và tổng doanh thu gói?',
    'Tháng này mỗi nhân viên trực 24h bao nhiêu buổi?',
    'Tìm kiếm các ca phẫu thuật nội soi tiêu hóa trong tháng',
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
  const activeLoadedSlotRef = useRef<AISlotId>(slotId);

  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const handleToggleStudio = () => {
    const next = !isExpandedStudio;
    setIsExpandedStudio(next);
    onToggleExpand?.(next);
  };

  const allRecordsCount = getAllRecordsFromContext(dataContext).length;
  // Trong trang Thống kê (statistics_studio), AI tự động truy vấn trực tiếp Firestore độc lập hoàn toàn với các tab khác
  const isStandaloneDatabaseQueryMode = slotId === 'statistics_studio';
  const hasDataToQuery = isStandaloneDatabaseQueryMode || allRecordsCount > 0;

  const handleSendQuestion = async (questionText?: string) => {
    const prompt = (questionText ?? inputPrompt).trim();
    if (!prompt || isGenerating || !hasDataToQuery) return;

    if (!questionText) {
      setInputPrompt('');
    }

    const userMsg: AIChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);

    const startTick = performance.now();

    try {
      // 1. Run Relational Query Pipeline (TypeScript in-browser + Firestore hybrid expand)
      const queryOutput = await runRelationalQueryPipeline(prompt, dataContext);
      const generatedArtifacts = [...queryOutput.artifacts];

      // Auto-focus newest artifact in Studio
      if (generatedArtifacts.length > 0) {
        setSelectedArtifactId(generatedArtifacts[generatedArtifacts.length - 1].id);
      }

      // 2. Check if active provider has API key configured
      const effProvider = getEffectiveProviderConfig(
        activeSlotConfig.provider,
        systemConfig || undefined,
        personalOverride
      );

      let assistantText = '';
      let latencyMs = Math.round(performance.now() - startTick);

      if (effProvider.apiKey && effProvider.apiKey.trim()) {
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
                content: `CÂU HỎI CỦA NGƯỜI DÙNG:\n"${prompt}"\n\n=== KẾT QUẢ TRUY VẤN DỮ LIỆU ĐÃ THỰC THI CHÍNH XÁC 100% TỪ CƠ SỞ DỮ LIỆU ===\n${queryOutput.contextDataForLLM}\n\nHãy trả lời trực tiếp, chính xác và đúng trọng tâm câu hỏi trên dựa hoàn toàn vào số liệu truy vấn ở trên. LƯU Ý QUAN TRỌNG: Không tự ý đưa phân tích theo Mùa (Mùa Hè/Mùa Đông) hay theo Phẫu thuật viên chính / Bác sĩ vào câu trả lời nếu người dùng không yêu cầu trong câu hỏi.`,
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
        } catch (llmErr: any) {
          assistantText = `${queryOutput.contextDataForLLM}\n\n---\n⚠️ *Lưu ý kết nối LLM (${effProvider.name} - ${activeSlotConfig.modelId}): ${llmErr?.message || 'Không thể gọi API'}. Hệ thống đã hiển thị trực tiếp kết quả truy vấn chính xác từ Cơ sở dữ liệu ở trên kèm Biểu đồ & Bảng tương tác.*`;
        }
      } else {
        // Deterministic local analytical report when API key is not configured yet
        assistantText = `${queryOutput.contextDataForLLM}\n\n---\n💡 *Hệ thống đã thực thi truy vấn liên kết đa bảng và dựng sẵn **Biểu đồ & Bảng dữ liệu tương tác** cho bạn. Để nhận thêm bình luận chuyên sâu từ mô hình **${effProvider.name} (${activeSlotConfig.modelId})**, vui lòng nhập API Key tại mục **Cấu hình → Cấu hình AI**.*`;
      }

      const aiMsg: AIChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
        provider: activeSlotConfig.provider,
        modelId: activeSlotConfig.modelId,
        reasoningEffort: activeSlotConfig.reasoningEffort,
        temperature: activeSlotConfig.temperature,
        latencyMs,
        artifacts: generatedArtifacts,
        toolLogs: queryOutput.executedTools,
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
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 truncate">
                {activeSlotConfig.label}
              </h3>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  hasDataToQuery
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-300'
                }`}
              >
                {hasDataToQuery ? (
                  <Database className="h-2.5 w-2.5" />
                ) : (
                  <AlertTriangle className="h-2.5 w-2.5" />
                )}
                {allRecordsCount > 0
                  ? `${allRecordsCount.toLocaleString('vi-VN')} ca PTTT`
                  : isStandaloneDatabaseQueryMode
                  ? 'Truy vấn trực tiếp CSDL Lưu trữ'
                  : '0 ca PTTT (Chưa mở dữ liệu)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Kỳ đang mở: <b>{dataContext.periodLabel}</b> • Liên kết: Ca mổ + Gói DV (
              {dataContext.packageAssignments.length}) + Lịch trực (
              {Object.keys(dataContext.dutySchedules || {}).length} ngày)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setSelectedArtifactId(null);
                try {
                  localStorage.removeItem(getChatHistoryStorageKey(slotId));
                } catch {}
              }}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
              title="Xóa lịch sử trò chuyện"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

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
            {!hasDataToQuery && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-amber-900 shadow-2xs flex-wrap">
                <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 leading-relaxed">
                    <div className="font-bold text-amber-950">
                      Chưa có dữ liệu kỳ báo cáo để truy vấn AI (0 ca PTTT)
                    </div>
                    <p className="text-amber-800">
                      Vui lòng chọn khoảng thời gian và bấm nút <b>&ldquo;Lấy dữ liệu&rdquo;</b> trước khi đặt câu hỏi. Hệ thống tự động khóa truy vấn khi chưa mở dữ liệu để tránh mất thời gian chờ AI xử lý dữ liệu rỗng.
                    </p>
                  </div>
                </div>
                {onRequestLoadData && (
                  <button
                    type="button"
                    disabled={isLoadingExternalData}
                    onClick={onRequestLoadData}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isLoadingExternalData ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Đang tải dữ liệu...</span>
                      </>
                    ) : (
                      <>
                        <Database className="h-3.5 w-3.5" />
                        <span>Lấy dữ liệu ngay</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {messages.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-sky-700 font-bold text-xs">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>
                    Chuyên gia Phân tích Số liệu Phẫu thuật AI đã sẵn sàng
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bạn có thể đặt câu hỏi bằng ngôn ngữ tự nhiên. AI hiểu toàn bộ mối quan hệ giữa{' '}
                  <b>Danh sách ca mổ, Kíp phẫu thuật 6 vị trí, Gói dịch vụ yêu cầu, Lịch trực 24h, Mùa Hè/Đông và Danh mục Chương/Giá DVKT</b>, tự động vẽ biểu đồ tương tác và xuất Excel/Ảnh.
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
                          disabled={!hasDataToQuery || isGenerating}
                          onClick={() => handleSendQuestion(q)}
                          className="text-left px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-sky-50 hover:border-sky-300 text-xs text-slate-700 hover:text-sky-900 font-medium transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-50/70 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
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
                    {msg.role === 'assistant' && (
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-slate-100 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5 font-semibold text-sky-700">
                          <Bot className="h-3 w-3" />
                          <span>{msg.modelId || activeSlotConfig.modelId}</span>
                          {msg.reasoningEffort && (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                              Effort: {msg.reasoningEffort}
                            </span>
                          )}
                        </div>
                        {msg.latencyMs !== undefined && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {msg.latencyMs}ms
                          </span>
                        )}
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

                    {/* Message Text */}
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <FormattedMessageContent content={msg.content} />
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
                  </div>
                </div>
              ))
            )}

            {isGenerating && (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-2xs flex items-center gap-2.5 text-xs text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-sky-600 shrink-0" />
                <span>
                  Đang truy vấn liên kết dữ liệu & phân tích bằng mô hình{' '}
                  <b>{activeSlotConfig.modelId}</b>...
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
              type="text"
              disabled={!hasDataToQuery || isGenerating}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder={
                hasDataToQuery
                  ? 'Nhập câu hỏi phân tích (VD: Phẫu thuật nội soi tiêu hóa ở các tháng, mùa Hè/Đông, bác sĩ...)'
                  : 'Vui lòng bấm "Lấy dữ liệu" để mở dữ liệu trước khi đặt câu hỏi cho AI...'
              }
              className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none bg-slate-50/60 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!hasDataToQuery || !inputPrompt.trim() || isGenerating}
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
