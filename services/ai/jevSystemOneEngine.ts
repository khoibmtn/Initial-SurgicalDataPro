/**
 * Jev — System One Decision & RLCD (Reinforcement Learning for Calibrated Decisions) Engine
 * Lấy cảm hứng từ mô hình System One (Jev) của TypeSafe AI:
 * - Đánh giá câu hỏi + ngữ cảnh dữ liệu song song trong 1 bước (< 15ms)
 * - Trả về các nguyên thủy định kiểu nghiêm ngặt: Choice<AIQueryIntent>, Noul (Boolean Probability), Score (0..100)
 * - Tự động định tuyến trọng tâm (Focused Tool Routing) và quyết định Fast-Path (System 1) vs Deep-Path (System 2)
 * - Tự học tăng cường (RLCD) từ phản hồi người dùng (👍 / 👎 + chọn lại Intent đúng), đồng bộ toàn viện qua Firebase RTDB + LocalStorage.
 */

import { ref, get, set, onValue } from 'firebase/database';
import { db } from '../../lib/firebase';
import {
  AIExecutionMode,
  AIQueryIntent,
  AIRLCDExemplar,
  AIRLCDIntentCalibrationStat,
  AIRLCDMemoryState,
  JevSystemOneEvaluation,
} from '../../types/ai';

const LS_RLCD_MEMORY_KEY = 'sdp_ai_rlcd_memory_v1';
const LS_EXECUTION_MODE_KEY = 'sdp_ai_execution_mode_v1';
const RTDB_RLCD_PATH = 'ai_rlcd_memory';

export const ALL_AI_INTENTS: AIQueryIntent[] = [
  'overtime_audit',
  'conflict_quality',
  'duty_schedule',
  'service_package',
  'staff_workload',
  'patient_lookup',
  'specialty_yoy',
  'or_utilization',
  'general_summary',
];

export const AI_INTENT_METADATA: Record<
  AIQueryIntent,
  {
    label: string;
    shortBadge: string;
    description: string;
    focusDirective: string;
    defaultFastPathEligible: boolean;
  }
> = {
  overtime_audit: {
    label: 'Chấm công Ngoài giờ & Đối chiếu Trực 24h',
    shortBadge: 'Ngoài giờ',
    description: 'Xác định nhân viên phải chấm ngoài giờ, khung giờ chấm (Chấm từ... đến...), phân loại Kíp mổ phiên lố giờ vs Kíp tăng cường và loại trừ tua trực 24h.',
    focusDirective:
      'CHỈ trả lời trực tiếp danh sách nhân viên phải chấm ngoài giờ, vai trò, ca mổ và khung giờ chấm ngoài giờ cụ thể (Chấm từ ... đến ..., bao nhiêu phút/giờ) từ kết quả công cụ execute_overtime_analysis. Tuyệt đối KHÔNG yêu cầu người dùng cung cấp lại dữ liệu và KHÔNG đưa thống kê tháng/mùa/doanh thu vào câu trả lời.',
    defaultFastPathEligible: true,
  },
  conflict_quality: {
    label: 'Đối soát Xung đột, Mã máy & Phụ cấp PTTT',
    shortBadge: 'Đối soát & Phụ cấp',
    description: 'Kiểm tra Trùng nhân viên, Trùng máy, Thiếu mã máy, Chưa gán Giúp việc, Lỗi định mức thời gian, TT <100% và bảng Phụ cấp PTTT.',
    focusDirective:
      'CHỈ trả lời trực tiếp các ca vi phạm/xung đột (Trùng NV, Trùng máy, Thiếu mã máy, Chưa GV, Lỗi TG) hoặc bảng Phụ cấp PTTT từ công cụ execute_conflict_and_quality_check.',
    defaultFastPathEligible: true,
  },
  duty_schedule: {
    label: 'Lịch trực 24h & Ngày trực / Nghỉ lễ',
    shortBadge: 'Lịch trực 24h',
    description: 'Tra cứu danh sách nhân viên trực 24h theo ngày/tháng, phân tách trực ngày thường và ngày nghỉ/lễ.',
    focusDirective:
      'CHỈ trả lời trực tiếp thông tin Lịch trực 24h (ai trực, vào những ngày nào, bao nhiêu buổi ngày thường / ngày nghỉ lễ) từ công cụ analyze_duty_schedules.',
    defaultFastPathEligible: true,
  },
  service_package: {
    label: 'Gói Dịch vụ Yêu cầu (DVYC) & Thù lao Gói',
    shortBadge: 'Gói DVYC',
    description: 'Thống kê số ca đăng ký Gói dịch vụ yêu cầu, doanh thu gói và thù lao thực lĩnh sau thuế theo nhân sự.',
    focusDirective:
      'CHỈ trả lời trực tiếp số liệu Gói dịch vụ yêu cầu (số ca theo gói, tổng doanh thu, chi phí và thù lao thực lĩnh của từng nhân sự) từ công cụ analyze_service_packages.',
    defaultFastPathEligible: true,
  },
  staff_workload: {
    label: 'Khối lượng Công việc Nhân sự & Kíp mổ',
    shortBadge: 'Nhân sự Kíp mổ',
    description: 'Thống kê số ca tham gia theo 6 vị trí (PT Chính, PT Phụ, BS GM, KTV GM, TDC, GV) của bác sĩ / điều dưỡng / khoa.',
    focusDirective:
      'CHỈ trả lời trực tiếp khối lượng công việc của nhân sự/khoa theo từng vai trò trong kíp mổ từ công cụ analyze_staff_workload.',
    defaultFastPathEligible: true,
  },
  patient_lookup: {
    label: 'Tra cứu Bệnh nhân & Chi tiết Ca mổ',
    shortBadge: 'Tra cứu Ca mổ',
    description: 'Tìm kiếm bệnh nhân theo Mã BN, Họ tên, thẻ BHYT, tên phẫu thuật/thủ thuật hoặc mã máy.',
    focusDirective:
      'CHỈ liệt kê chi tiết các ca mổ / bệnh nhân khớp điều kiện tìm kiếm kèm thời gian BĐ-KT, kỹ thuật, loại PTTT và kíp thực hiện.',
    defaultFastPathEligible: true,
  },
  specialty_yoy: {
    label: 'Phân tích Chuyên khoa & So sánh Cùng kỳ (YoY)',
    shortBadge: 'Chuyên khoa / YoY',
    description: 'Thống kê cơ cấu chuyên khoa, loại PTTT (ĐB, I, II, III), xu hướng theo tháng/quý/mùa và so sánh cùng kỳ năm trước.',
    focusDirective:
      'Tập trung phân tích bảng đối chiếu Chuyên khoa / Cùng kỳ YoY hoặc xu hướng tháng chính xác theo yêu cầu câu hỏi.',
    defaultFastPathEligible: false,
  },
  or_utilization: {
    label: 'Công suất Phòng mổ & Khung giờ Cao điểm',
    shortBadge: 'Công suất Phòng mổ',
    description: 'Phân tích mật độ ca mổ theo khung giờ trong ngày, thời lượng trung bình và hiệu suất hoạt động.',
    focusDirective:
      'Tập trung phân tích thời lượng phẫu thuật, phân bố khung giờ và hiệu suất vận hành.',
    defaultFastPathEligible: false,
  },
  general_summary: {
    label: 'Tổng quan Báo cáo Phẫu thuật Thủ thuật',
    shortBadge: 'Tổng quan PTTT',
    description: 'Tổng hợp nhanh số lượng ca PT/TT, phân loại ĐB/I/II/III và các chỉ số chính của kỳ báo cáo.',
    focusDirective:
      'Trình bày ngắn gọn, rõ ràng các chỉ số tổng hợp chính của kỳ dữ liệu đang xét.',
    defaultFastPathEligible: true,
  },
};

const STOP_WORDS = new Set([
  'trong', 'danh', 'sach', 'các', 'cac', 'nhung', 'những', 'phai', 'phải', 'nhu', 'như',
  'nao', 'nào', 'cua', 'của', 'cho', 'voi', 'với', '적', 'khi', 'hay', 'hãy', 'toi', 'tôi',
  'biet', 'biết', 'bao', 'nhieu', 'nhiêu', 'thong', 'thống', 'ke', 'kê', 'kiem', 'kiểm',
  'tra', 'xem', 'tren', 'trên', 'du', 'dữ', 'lieu', 'liệu', 'ang', 'đang', 'mo', 'mở',
]);

/**
 * Chuẩn hóa văn bản tiếng Việt để trích xuất đặc trưng (Tokenization & Normalization)
 */
export function normalizePromptForJev(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[?!.,;:"'()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAccentsForJev(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[?!.,;:"'()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Trích xuất các từ đơn và cụm 2 từ (unigrams + bigrams) làm đặc trưng học tăng cường RLCD
 */
export function extractDomainTokens(prompt: string): string[] {
  const clean = stripAccentsForJev(prompt);
  const words = clean.split(' ').filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const tokens = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    tokens.add(words[i]);
    if (i + 1 < words.length) {
      tokens.add(`${words[i]}_${words[i + 1]}`);
    }
  }
  return Array.from(tokens).slice(0, 24);
}

/**
 * Khởi tạo trạng thái bộ nhớ RLCD mặc định
 */
export function createDefaultRLCDMemory(): AIRLCDMemoryState {
  const intentStats = {} as Record<AIQueryIntent, AIRLCDIntentCalibrationStat>;
  for (const intent of ALL_AI_INTENTS) {
    intentStats[intent] = {
      intent,
      totalPredictions: 0,
      positiveConfirmations: 0,
      negativeCorrections: 0,
      priorBoost: 0,
    };
  }
  return {
    version: 1,
    totalFeedbackCount: 0,
    tokenIntentWeights: {},
    intentStats,
    exemplars: [],
    updatedAt: Date.now(),
  };
}

export function normalizeRLCDMemory(raw: any): AIRLCDMemoryState {
  const def = createDefaultRLCDMemory();
  if (!raw || typeof raw !== 'object') return def;

  const intentStats = { ...def.intentStats };
  if (raw.intentStats && typeof raw.intentStats === 'object') {
    for (const intent of ALL_AI_INTENTS) {
      const item = raw.intentStats[intent];
      if (item && typeof item === 'object') {
        intentStats[intent] = {
          intent,
          totalPredictions: Number(item.totalPredictions) || 0,
          positiveConfirmations: Number(item.positiveConfirmations) || 0,
          negativeCorrections: Number(item.negativeCorrections) || 0,
          priorBoost: Math.max(-0.35, Math.min(0.35, Number(item.priorBoost) || 0)),
        };
      }
    }
  }

  return {
    version: 1,
    totalFeedbackCount: Number(raw.totalFeedbackCount) || 0,
    tokenIntentWeights:
      raw.tokenIntentWeights && typeof raw.tokenIntentWeights === 'object'
        ? raw.tokenIntentWeights
        : {},
    intentStats,
    exemplars: Array.isArray(raw.exemplars) ? raw.exemplars.slice(0, 80) : [],
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

const rlcdMemoryFallback = new Map<string, string>();

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore
  }
  return rlcdMemoryFallback.get(key) ?? null;
}

function safeStorageSet(key: string, value: string): void {
  rlcdMemoryFallback.set(key, value);
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}

function safeStorageRemove(key: string): void {
  rlcdMemoryFallback.delete(key);
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/**
 * Đọc bộ nhớ RLCD từ LocalStorage (tức thì, 0ms)
 */
export function loadLocalRLCDMemory(): AIRLCDMemoryState {
  try {
    const raw = safeStorageGet(LS_RLCD_MEMORY_KEY);
    if (!raw) return createDefaultRLCDMemory();
    return normalizeRLCDMemory(JSON.parse(raw));
  } catch {
    return createDefaultRLCDMemory();
  }
}

export function saveLocalRLCDMemory(memory: AIRLCDMemoryState): void {
  safeStorageSet(LS_RLCD_MEMORY_KEY, JSON.stringify(memory));
}

export function clearLocalRLCDMemory(): void {
  safeStorageRemove(LS_RLCD_MEMORY_KEY);
}

/**
 * Lắng nghe đồng bộ bộ nhớ RLCD toàn viện từ Firebase RTDB
 */
export function subscribeToRLCDMemory(
  onUpdate: (memory: AIRLCDMemoryState) => void
): () => void {
  const local = loadLocalRLCDMemory();
  onUpdate(local);

  try {
    const rlcdRef = ref(db, RTDB_RLCD_PATH);
    const unsub = onValue(
      rlcdRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const normalized = normalizeRLCDMemory(snapshot.val());
          saveLocalRLCDMemory(normalized);
          onUpdate(normalized);
        }
      },
      () => {
        // Fallback to local cache when offline or restricted
      }
    );
    return () => unsub();
  } catch {
    return () => {};
  }
}

/**
 * Lưu chế độ vận hành System 1 / System 2 của người dùng
 */
export function loadPreferredExecutionMode(): AIExecutionMode {
  try {
    if (typeof localStorage === 'undefined') return 'auto';
    const saved = localStorage.getItem(LS_EXECUTION_MODE_KEY);
    if (saved === 'auto' || saved === 'fast_system1' || saved === 'deep_system2') {
      return saved;
    }
  } catch {}
  return 'auto';
}

export function savePreferredExecutionMode(mode: AIExecutionMode): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_EXECUTION_MODE_KEY, mode);
    }
  } catch {}
}

/**
 * Tính độ tương đồng Jaccard giữa 2 tập từ khóa để so khớp với Exemplar trong bộ nhớ RLCD
 */
function computeTokenSimilarity(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * HÀM LÕI SYSTEM ONE (JEV):
 * Đánh giá song song câu hỏi trong 1 lượt (Single-Pass Non-Autoregressive Classifier)
 * và trả về Choice<AIQueryIntent>, Noul, Score kèm xác suất đã hiệu chỉnh (Calibrated Probabilities).
 */
export function evaluateWithJevSystemOne(
  prompt: string,
  options?: {
    hasLoadedRecords?: boolean;
    hasExplicitTimeOrSource?: boolean;
    rlcdMemory?: AIRLCDMemoryState;
    recentUserPrompts?: string[];
  }
): JevSystemOneEvaluation {
  const startPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const memory = options?.rlcdMemory || loadLocalRLCDMemory();
  const norm = normalizePromptForJev(prompt);
  const noAccent = stripAccentsForJev(prompt);
  const tokens = extractDomainTokens(prompt);

  // 1. Khởi tạo Logits cơ sở cho 9 Intent
  const logits: Record<AIQueryIntent, number> = {
    overtime_audit: -1.2,
    conflict_quality: -1.2,
    duty_schedule: -1.2,
    service_package: -1.2,
    staff_workload: -1.2,
    patient_lookup: -1.2,
    specialty_yoy: -1.0,
    or_utilization: -1.3,
    general_summary: -0.8,
  };

  // 2. Luật đặc trưng ngữ nghĩa Y khoa (Domain Structural Features)
  // --- Overtime Audit (Ngoài giờ) ---
  if (/(ngoai gio|cham ngoai gio|lam them gio|tang ca|tang cuong|lo gio|kip mo phien|qua gio|sau gio|gio nghi trua|cham cong ngoai gio)/i.test(noAccent)) {
    logits.overtime_audit += 3.8;
  }
  if (/(tu gio nao|den gio nao|khung gio nao|nhung ai phai cham|ai cham ngoai gio)/i.test(noAccent)) {
    logits.overtime_audit += 2.2;
  }

  // --- Conflict & Quality Check (Trùng NV, Trùng máy, Thiếu máy, Phụ cấp) ---
  if (/(trung nv|trung nhan vien|trung kip|trung may|thieu may|thieu ma may|chua gan gv|chua gv|giup viec|loi thoi gian|loi tg|dinh muc thoi gian|duoi 100|tt <100|phu cap pttt|thanh toan pttt|trung lich|xung dot)/i.test(noAccent)) {
    logits.conflict_quality += 3.7;
  }

  // --- Duty Schedule (Lịch trực 24h) ---
  if (/(lich truc|tua truc|ca truc|truc 24h|buoi truc|ngay truc|ai truc|truc ngay|truc bao nhieu)/i.test(noAccent)) {
    // Nếu câu hỏi hỏi về chấm ngoài giờ thì ưu tiên overtime_audit hơn duty_schedule
    if (logits.overtime_audit > 1.0) {
      logits.duty_schedule += 1.2;
    } else {
      logits.duty_schedule += 3.6;
    }
  }

  // --- Service Package (Gói DVYC) ---
  if (/(goi dv|goi dich vu|dvyc|goi san|goi mo|chon bac si|thuc linh goi|thu lao goi)/i.test(noAccent)) {
    logits.service_package += 3.8;
  }

  // --- Staff Workload (Khối lượng công việc nhân sự) ---
  if (/(bac si|bs |ptv|kip mo|phau thuat vien|gay me|dung cu|nhan vien|ai mo nhieu|dung mo|pt chinh|pt phu)/i.test(noAccent)) {
    logits.staff_workload += 2.6;
  }

  // --- Patient / Surgery Lookup (Tra cứu bệnh nhân / ca mổ) ---
  if (/(benh nhan|ma bn|ho ten|the bhyt|tim ca|liet ke cac ca|danh sach ca)/i.test(noAccent) || /\b\d{8,10}\b/.test(noAccent)) {
    logits.patient_lookup += 2.6;
  }

  // --- Specialty & YoY Comparison (Chuyên khoa, cùng kỳ, mùa, tháng) ---
  if (/(chuyen khoa|so voi|cung ky|nam truoc|yoy|tang giam|xu huong|theo thang|theo mua|mua he|mua dong|noi soi|ctch|tieu hoa|san khoa|tiet nieu|tai mui hong|mat|rhm)/i.test(noAccent)) {
    logits.specialty_yoy += 3.2;
  }

  // --- OR Utilization (Công suất phòng mổ / giờ cao điểm) ---
  if (/(cong suat|phong mo|gio cao diem|mat do|thoi luong trung binh|hieu suat)/i.test(noAccent)) {
    logits.or_utilization += 3.4;
  }

  // --- General Summary (Tổng số ca, cơ cấu loại phẫu thuật, doanh thu, báo cáo chung) ---
  if (/(tong quan|tom tat|bao cao chung|tong so ca|co bao nhieu ca|mo bao nhieu ca|bao nhieu ca|so luong ca|co cau|loai phau thuat|loai pttt|phan loai pttt|doanh thu|vien phi|thanh tien|tinh hinh phau thuat)/i.test(noAccent)) {
    logits.general_summary += 3.5;
  }

  // Kế thừa ý định từ câu hỏi liền trước trong hội thoại nếu câu hiện tại chỉ bổ sung thời gian/nguồn (VD: "ngày 20/10/2026")
  const maxRuleLogit = Math.max(...Object.values(logits));
  if (maxRuleLogit < 0 && options?.recentUserPrompts && options.recentUserPrompts.length > 0) {
    const prevPrompt = options.recentUserPrompts[options.recentUserPrompts.length - 1];
    if (prevPrompt && prevPrompt.trim() !== prompt.trim()) {
      const prevEval = evaluateWithJevSystemOne(prevPrompt, {
        hasLoadedRecords: options.hasLoadedRecords,
        hasExplicitTimeOrSource: true,
        rlcdMemory: memory,
      });
      if (prevEval.scores.calibrationConfidence.score >= 70) {
        logits[prevEval.intentChoice.selected] += 3.4;
      }
    }
  }

  // 3. Áp dụng Trọng số Từ khóa Học tăng cường RLCD (Token Intent Weights)
  for (const token of tokens) {
    const weights = memory.tokenIntentWeights[token];
    if (weights) {
      for (const intent of ALL_AI_INTENTS) {
        const w = weights[intent];
        if (typeof w === 'number' && !isNaN(w)) {
          logits[intent] += w;
        }
      }
    }
  }

  // 4. So khớp Mẫu Câu hỏi Đã Xác thực (RLCD Verified Exemplars)
  let bestExemplar: AIRLCDExemplar | undefined;
  let bestSimilarity = 0;

  for (const ex of memory.exemplars) {
    if (ex.normalizedPrompt === norm) {
      bestExemplar = ex;
      bestSimilarity = 1.0;
      break;
    }
    const sim = computeTokenSimilarity(tokens, ex.keywords || []);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestExemplar = ex;
    }
  }

  if (bestExemplar && bestSimilarity >= 0.55) {
    const boost = bestSimilarity * 2.8 * Math.sign(bestExemplar.rewardScore || 1);
    logits[bestExemplar.verifiedIntent] += boost;
  }

  // 5. Áp dụng Prior Calibration Boost theo lịch sử chính xác của từng Intent
  for (const intent of ALL_AI_INTENTS) {
    const stat = memory.intentStats?.[intent];
    if (stat && stat.priorBoost) {
      logits[intent] += stat.priorBoost;
    }
  }

  // 6. Tính phân phối xác suất hiệu chỉnh bằng Temperature-Scaled Softmax (T = 0.85)
  const temperature = 0.85;
  const maxLogit = Math.max(...Object.values(logits));
  const expMap = {} as Record<AIQueryIntent, number>;
  let sumExp = 0;
  for (const intent of ALL_AI_INTENTS) {
    const e = Math.exp((logits[intent] - maxLogit) / temperature);
    expMap[intent] = e;
    sumExp += e;
  }

  const distribution = {} as Record<AIQueryIntent, number>;
  const rankedIntents: Array<{ intent: AIQueryIntent; prob: number }> = [];
  for (const intent of ALL_AI_INTENTS) {
    const prob = sumExp > 0 ? Number((expMap[intent] / sumExp).toFixed(4)) : 0;
    distribution[intent] = prob;
    rankedIntents.push({ intent, prob });
  }
  rankedIntents.sort((a, b) => b.prob - a.prob);

  const primary = rankedIntents[0];
  const secondary = rankedIntents
    .slice(1, 3)
    .filter((item) => item.prob >= 0.12)
    .map((item) => item.intent);

  // 7. Tính 4 nguyên thủy Noul (Yes/No Calibrated Probabilities)
  const deepReasoningKeywords = /(tai sao|nguyen nhan|phan tich sau|nhan xet|danh gia|de xuat|giai phap|so sanh chi tiet|xu huong)/i.test(
    noAccent
  );
  const directLookupKeywords = /(nhung ai|ai phai|tu gio nao|den gio nao|liet ke|ca nao|bao nhieu ca|danh sach|kiem tra|co trung)/i.test(
    noAccent
  );

  const isDirectLookupProb = Math.min(
    0.98,
    Math.max(
      0.1,
      (AI_INTENT_METADATA[primary.intent].defaultFastPathEligible ? 0.65 : 0.25) +
        (directLookupKeywords ? 0.25 : 0) -
        (deepReasoningKeywords ? 0.45 : 0)
    )
  );

  const requiresDeepProb = Math.min(
    0.98,
    Math.max(
      0.05,
      (deepReasoningKeywords ? 0.82 : 0.18) +
        (primary.intent === 'specialty_yoy' || primary.intent === 'or_utilization' ? 0.25 : 0)
    )
  );

  const hasSufficientContext =
    Boolean(options?.hasLoadedRecords) || Boolean(options?.hasExplicitTimeOrSource);

  const matchesLearnedProb = bestExemplar ? Number(bestSimilarity.toFixed(2)) : 0;

  // 8. Tính 3 nguyên thủy Score (0..100)
  // Độ tin cậy hiệu chỉnh dựa trên khoảng cách xác suất đỉnh (Margin) + độ khớp Exemplar
  const margin = primary.prob - (rankedIntents[1]?.prob || 0);
  const rawConfidence = Math.round(
    Math.min(
      99,
      Math.max(
        45,
        primary.prob * 78 + margin * 22 + (bestSimilarity >= 0.65 ? 12 : 0)
      )
    )
  );

  const complexityVal = Math.round(
    Math.min(
      95,
      Math.max(
        15,
        tokens.length * 4 + (secondary.length * 18) + (deepReasoningKeywords ? 30 : 0)
      )
    )
  );

  const focusStrictnessVal = directLookupKeywords && secondary.length === 0 ? 96 : 85;

  const recommendedMode: 'fast_system1' | 'deep_system2' =
    bestExemplar && bestSimilarity >= 0.75
      ? bestExemplar.preferredMode
      : rawConfidence >= 82 && isDirectLookupProb >= 0.65 && requiresDeepProb < 0.55
      ? 'fast_system1'
      : 'deep_system2';

  const endPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const evaluationLatencyMs = Math.max(1, Math.round(endPerf - startPerf));

  const focusMeta = AI_INTENT_METADATA[primary.intent];
  const learnedNote =
    bestExemplar && bestSimilarity >= 0.6 && bestExemplar.focusNote
      ? `\n- Ghi chú học tăng cường từ người dùng: "${bestExemplar.focusNote}"`
      : '';

  return {
    intentChoice: {
      selected: primary.intent,
      label: focusMeta.label,
      calibratedProbability: primary.prob,
      distribution,
    },
    secondaryIntents: secondary,
    nouls: {
      isDirectTableLookup: {
        value: isDirectLookupProb >= 0.6,
        probability: Number(isDirectLookupProb.toFixed(2)),
        rationale:
          isDirectLookupProb >= 0.6
            ? 'Câu hỏi tra cứu định lượng/danh sách trực tiếp từ bảng nghiệp vụ'
            : 'Câu hỏi mang tính tổng hợp/bình luận đa chiều',
      },
      requiresDeepReasoning: {
        value: requiresDeepProb >= 0.55,
        probability: Number(requiresDeepProb.toFixed(2)),
        rationale:
          requiresDeepProb >= 0.55
            ? 'Cần lập luận System 2 (LLM) để phân tích xu hướng/nguyên nhân'
            : 'Có thể trả lời chính xác tức thì bằng System 1 (Fast-Path)',
      },
      hasSufficientDataContext: {
        value: hasSufficientContext,
        probability: hasSufficientContext ? 0.98 : 0.15,
        rationale: hasSufficientContext
          ? 'Đã xác định rõ phạm vi dữ liệu hoặc thời gian truy vấn'
          : 'Chưa mở dữ liệu và câu hỏi chưa chỉ rõ kỳ thời gian',
      },
      matchesLearnedPattern: {
        value: matchesLearnedProb >= 0.6,
        probability: matchesLearnedProb,
        rationale:
          matchesLearnedProb >= 0.6
            ? `Khớp ${Math.round(matchesLearnedProb * 100)}% với mẫu câu hỏi đã được người dùng xác thực`
            : 'Mẫu câu hỏi mới, định tuyến bằng bộ phân loại gốc Jev System One',
      },
    },
    scores: {
      calibrationConfidence: {
        score: rawConfidence,
        level:
          rawConfidence >= 88
            ? 'high'
            : rawConfidence >= 70
            ? 'medium'
            : 'low',
        label: `Độ tin cậy hiệu chỉnh: ${rawConfidence}%`,
      },
      focusStrictness: {
        score: focusStrictnessVal,
        level: focusStrictnessVal >= 90 ? 'critical' : 'high',
        label: `Độ tập trung trọng tâm: ${focusStrictnessVal}%`,
      },
      complexityScore: {
        score: complexityVal,
        level:
          complexityVal >= 70
            ? 'high'
            : complexityVal >= 40
            ? 'medium'
            : 'low',
        label: `Độ phức tạp: ${complexityVal}/100`,
      },
    },
    recommendedMode,
    matchedExemplarId: bestSimilarity >= 0.6 ? bestExemplar?.id : undefined,
    focusInstruction: `${focusMeta.focusDirective}${learnedNote}`,
    evaluationLatencyMs,
  };
}

/**
 * Ghi nhận phản hồi của người dùng (RLCD Feedback Loop) và cập nhật trọng số lên Firebase RTDB + LocalStorage
 */
export async function recordRLCDUserFeedback(params: {
  prompt: string;
  predictedIntent: AIQueryIntent;
  rating: 'positive' | 'negative';
  correctedIntent?: AIQueryIntent;
  preferredMode?: 'fast_system1' | 'deep_system2';
  focusNote?: string;
  userName?: string;
}): Promise<AIRLCDMemoryState> {
  const current = loadLocalRLCDMemory();
  const next = normalizeRLCDMemory(JSON.parse(JSON.stringify(current)));
  const tokens = extractDomainTokens(params.prompt);
  const normPrompt = normalizePromptForJev(params.prompt);

  next.totalFeedbackCount = (next.totalFeedbackCount || 0) + 1;
  next.updatedAt = Date.now();

  const targetIntent: AIQueryIntent =
    params.rating === 'positive'
      ? params.predictedIntent
      : params.correctedIntent || params.predictedIntent;

  // 1. Cập nhật thống kê Calibration cho Intent dự đoán
  const predStat = next.intentStats[params.predictedIntent] || {
    intent: params.predictedIntent,
    totalPredictions: 0,
    positiveConfirmations: 0,
    negativeCorrections: 0,
    priorBoost: 0,
  };
  predStat.totalPredictions += 1;

  if (params.rating === 'positive') {
    predStat.positiveConfirmations += 1;
    predStat.priorBoost = Number(
      Math.min(0.35, predStat.priorBoost + 0.04).toFixed(3)
    );
  } else {
    predStat.negativeCorrections += 1;
    predStat.priorBoost = Number(
      Math.max(-0.35, predStat.priorBoost - 0.06).toFixed(3)
    );
    if (params.correctedIntent && params.correctedIntent !== params.predictedIntent) {
      const corrStat = next.intentStats[params.correctedIntent];
      if (corrStat) {
        corrStat.totalPredictions += 1;
        corrStat.positiveConfirmations += 1;
        corrStat.priorBoost = Number(
          Math.min(0.35, corrStat.priorBoost + 0.06).toFixed(3)
        );
      }
    }
  }
  next.intentStats[params.predictedIntent] = predStat;

  // 2. Cập nhật Trọng số Token -> Intent (Reinforcement Policy Gradient step)
  for (const token of tokens) {
    if (!next.tokenIntentWeights[token]) {
      next.tokenIntentWeights[token] = {};
    }
    const tokenMap = next.tokenIntentWeights[token];
    if (params.rating === 'positive') {
      const curW = tokenMap[targetIntent] || 0;
      tokenMap[targetIntent] = Number(Math.min(2.5, curW + 0.45).toFixed(3));
    } else {
      // Phạt nhánh dự đoán sai
      const wrongW = tokenMap[params.predictedIntent] || 0;
      tokenMap[params.predictedIntent] = Number(
        Math.max(-2.5, wrongW - 0.55).toFixed(3)
      );
      // Thưởng nhánh đúng nếu người dùng chỉ định
      if (params.correctedIntent) {
        const rightW = tokenMap[params.correctedIntent] || 0;
        tokenMap[params.correctedIntent] = Number(
          Math.min(2.5, rightW + 0.85).toFixed(3)
        );
      }
    }
  }

  // 3. Lưu hoặc cập nhật Exemplar đã xác thực
  const existingIdx = next.exemplars.findIndex(
    (e) => e.normalizedPrompt === normPrompt
  );
  const modeToSave: 'fast_system1' | 'deep_system2' =
    params.preferredMode ||
    (AI_INTENT_METADATA[targetIntent].defaultFastPathEligible
      ? 'fast_system1'
      : 'deep_system2');

  if (existingIdx >= 0) {
    const ex = next.exemplars[existingIdx];
    ex.verifiedIntent = targetIntent;
    ex.preferredMode = modeToSave;
    if (params.focusNote) ex.focusNote = params.focusNote.trim();
    if (params.rating === 'positive') {
      ex.positiveCount += 1;
      ex.rewardScore = Number((ex.rewardScore + 1.0).toFixed(2));
    } else {
      ex.negativeCount += 1;
      ex.rewardScore = params.correctedIntent
        ? Number(Math.max(1.0, ex.rewardScore + 0.8).toFixed(2))
        : Number((ex.rewardScore - 1.0).toFixed(2));
    }
    ex.updatedAt = Date.now();
    ex.updatedBy = params.userName;
  } else if (params.rating === 'positive' || params.correctedIntent) {
    const newExemplar: AIRLCDExemplar = {
      id: `rlcd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      normalizedPrompt: normPrompt,
      samplePrompt: params.prompt.trim(),
      keywords: tokens,
      verifiedIntent: targetIntent,
      preferredMode: modeToSave,
      focusNote: params.focusNote?.trim(),
      positiveCount: params.rating === 'positive' ? 1 : 0,
      negativeCount: params.rating === 'negative' ? 1 : 0,
      rewardScore: params.rating === 'positive' ? 1.0 : 1.2,
      updatedAt: Date.now(),
      updatedBy: params.userName,
    };
    next.exemplars.unshift(newExemplar);
    next.exemplars = next.exemplars.slice(0, 80);
  }

  // 4. Lưu vào LocalStorage tức thì và đồng bộ lên Firebase RTDB
  saveLocalRLCDMemory(next);
  try {
    const rlcdRef = ref(db, RTDB_RLCD_PATH);
    await set(rlcdRef, next);
  } catch {
    // Ignore RTDB write errors when offline
  }

  return next;
}

/**
 * Sinh chỉ dẫn hợp đồng trọng tâm (Jev System One Focus Contract) cho System 2 (LLM)
 */
export function buildJevSystemOneDirectiveForLLM(
  evalResult: JevSystemOneEvaluation,
  memory?: AIRLCDMemoryState
): string {
  const rlcd = memory || loadLocalRLCDMemory();
  const relevantExemplars = rlcd.exemplars
    .filter(
      (e) =>
        e.verifiedIntent === evalResult.intentChoice.selected &&
        e.rewardScore > 0
    )
    .slice(0, 3);

  const exemplarText =
    relevantExemplars.length > 0
      ? `\n- Các mẫu câu hỏi tương tự đã được người dùng xác nhận ĐÚNG TRỌNG TÂM (${relevantExemplars.length} mẫu):\n` +
        relevantExemplars
          .map(
            (e, i) =>
              `  ${i + 1}. "${e.samplePrompt}" → Trọng tâm: ${AI_INTENT_METADATA[e.verifiedIntent].label}${
                e.focusNote ? ` (Lưu ý: ${e.focusNote})` : ''
              }`
          )
          .join('\n')
      : '';

  return [
    `=== HỢP ĐỒNG ĐỊNH TUYẾN JEV SYSTEM ONE (TYPESAFE AI) ===`,
    `- Ý định chính (Choice<AIQueryIntent>): ${evalResult.intentChoice.label} (${evalResult.intentChoice.selected}) — Xác suất hiệu chỉnh: ${(evalResult.intentChoice.calibratedProbability * 100).toFixed(1)}%`,
    `- Độ tin cậy hiệu chỉnh (Calibration Score): ${evalResult.scores.calibrationConfidence.score}% | Độ tập trung: ${evalResult.scores.focusStrictness.score}%`,
    `- Chỉ dẫn bắt buộc: ${evalResult.focusInstruction}`,
    `- QUY TẮC TỐI THƯỢNG: Dữ liệu kết quả bên dưới ĐÃ ĐƯỢC TÍNH TOÁN CHÍNH XÁC 100% BẰNG TYPESCRIPT. Bạn TUYỆT ĐỐI KHÔNG ĐƯỢC nói "thiếu dữ liệu", KHÔNG ĐƯỢC đề nghị người dùng xuất thêm cột, và KHÔNG ĐƯỢC đưa các bảng không liên quan vào câu trả lời.${exemplarText}`,
  ].join('\n');
}
