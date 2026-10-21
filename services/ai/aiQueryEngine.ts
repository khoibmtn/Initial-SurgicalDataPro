/**
 * AI Relational Query & Multi-Dimensional Analytics Engine
 * Thực thi truy vấn liên kết đa bảng (Surgeries + ServicePackages + DutySchedules + Staff + Chapters/Prices)
 * chính xác 100% bằng TypeScript trên trình duyệt, kết hợp Hybrid Fetch từ Firestore khi cần.
 */

import {
  SurgeryRecord,
  PersistedSurgeryRecord,
  DutyScheduleDateConfig,
  ChapterCatalog,
  SurgeryNamePrice,
  LOAI_PTTT_ORDER,
} from '../../types';
import { AppConfig } from '../../contexts/ConfigContext';
import {
  ServicePackageAssignment,
  ServicePackageDefinition,
  buildCompositeKey,
  getRecordDateString,
} from '../../types/servicePackage';
import {
  AIArtifact,
  AIChatToolExecutionLog,
  AIClarificationOption,
  AIQueryIntent,
  JevSystemOneEvaluation,
} from '../../types/ai';
import { CLINICAL_DOMAIN_TAXONOMY } from './aiSemanticSchema';
import {
  evaluateWithJevSystemOne,
  buildJevSystemOneDirectiveForLLM,
  AI_INTENT_METADATA,
} from './jevSystemOneEngine';
import type { DshSessionWorkingMemory } from './deepseekHarnessEngine';
import { reportService } from '../reportService';
import { dutyScheduleService, isWeekend } from '../dutyScheduleService';
import { calculateOvertimeRows } from '../overtimeCalculationService';
import { groupOvertimeDataForReport } from '../overtimeReportDataService';
import { reprocessSurgicalRecords } from '../reprocess';
import { buildPackagePaymentRows } from '../packagePaymentRows';
import { getAllowanceForRecord } from '../laborConfigService';
import {
  classifySpecialty,
  getAllSpecialties,
  getSpecialtyOverrides,
  isRecordGayTe,
} from '../specialtyComparisonService';
import type { YearlyCacheData } from '../statisticsService';

export interface AIDataContextInput {
  contextPage: 'daily_storage' | 'monthly_storage' | 'statistics_studio';
  activeAppTab?: 'daily' | 'monthly' | 'statistics' | 'scheduling' | 'config';
  periodLabel: string;
  activeSourceCitation?: string;
  currentRecords: Array<SurgeryRecord | PersistedSurgeryRecord>;
  dailyOpenedRecords?: Array<SurgeryRecord | PersistedSurgeryRecord>;
  dailyOpenedCitation?: string;
  monthlyOpenedRecords?: Array<SurgeryRecord | PersistedSurgeryRecord>;
  monthlyOpenedCitation?: string;
  yearlyCacheData?: YearlyCacheData | null;
  dutySchedules: Record<string, DutyScheduleDateConfig>;
  packageAssignments: ServicePackageAssignment[];
  packageDefinitions: ServicePackageDefinition[];
  chapters: ChapterCatalog[];
  surgeryNamePrices: SurgeryNamePrice[];
  config: AppConfig;
  allowRemoteFirestoreFetch?: boolean;
}

export interface AIConversationTurnScope {
  prompt: string;
  scopedRecords?: Array<SurgeryRecord | PersistedSurgeryRecord>;
  unfilteredScopedRecords?: Array<SurgeryRecord | PersistedSurgeryRecord>;
  dataSourceCitation?: string;
  baseDataSourceCitation?: string;
  scopedDateRange?: string;
  months?: number[];
  years?: number[];
  specificDates?: string[];
  dateRange?: { from: string; to: string; label?: string };
  isDutyShift24h?: boolean;
  explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db' | null;
  targetStaffNames?: string[];
  patientDigest?: string[];
  primaryIntent?: AIQueryIntent;
  isSurgeryListQuery?: boolean;
}

export interface AIQueryExecutionOutput {
  executedTools: AIChatToolExecutionLog[];
  contextDataForLLM: string;
  focusedFastSummary?: string;
  systemOneEval?: JevSystemOneEvaluation;
  artifacts: AIArtifact[];
  scopedRecordCount?: number;
  scopedDateRange?: string;
  dataSourceCitation?: string;
  turnScope?: AIConversationTurnScope;
  needsClarification?: boolean;
  clarificationMessage?: string;
  clarificationOptions?: AIClarificationOption[];
}

// ─── TEXT & VIETNAMESE NORMALIZATION HELPERS ─────────────────────────────────

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function normalizeText(str: string | undefined | null): string {
  if (!str) return '';
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function splitStaffNames(rawField: string | undefined | null): string[] {
  if (!rawField) return [];
  return rawField
    .split(/[,;/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getRecordIsoDate(rec: SurgeryRecord | PersistedSurgeryRecord): string {
  const raw = rec.ngayBD || rec.ngayCD || '';
  if (raw) {
    // Check ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.substring(0, 10);
    }
    // Check DD/MM/YYYY
    const dmyMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  const startObj = (rec as SurgeryRecord).start;
  if (startObj instanceof Date && !isNaN(startObj.getTime())) {
    const y = startObj.getFullYear();
    const m = String(startObj.getMonth() + 1).padStart(2, '0');
    const d = String(startObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

export function parseFlexibleDateTime(raw: Date | string | undefined | null): Date | undefined {
  if (!raw) return undefined;
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? undefined : raw;
  }
  const str = String(raw).trim();
  if (!str) return undefined;

  // DD/MM/YYYY HH:mm or DD/MM/YYYY
  const dmyMatch = str.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD HH:mm or ISO
  const isoCandidate = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const parsed = new Date(isoCandidate);
  if (!isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? undefined : fallback;
}

export function ensureHydratedSurgeryRecord(
  rec: SurgeryRecord | PersistedSurgeryRecord
): SurgeryRecord {
  const start =
    parseFlexibleDateTime(rec.ngayBD) ||
    (rec.start instanceof Date && !isNaN(rec.start.getTime()) ? rec.start : undefined) ||
    parseFlexibleDateTime(rec.ngayCD);
  const end =
    parseFlexibleDateTime(rec.ngayKT) ||
    (rec.end instanceof Date && !isNaN(rec.end.getTime()) ? rec.end : undefined) ||
    (start && typeof rec.timeMinutes === 'number' && rec.timeMinutes > 0
      ? new Date(start.getTime() + rec.timeMinutes * 60000)
      : start);

  let timeMinutes = rec.timeMinutes;
  if ((!timeMinutes || timeMinutes <= 0) && start && end) {
    timeMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  return {
    ...rec,
    start,
    end,
    timeMinutes,
  };
}

export function deduplicateSurgeryRecords<T extends SurgeryRecord | PersistedSurgeryRecord>(
  records: T[]
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const r of records) {
    if (!r) continue;
    const persisted = r as PersistedSurgeryRecord;
    const key =
      persisted.firestorePath ||
      persisted.id ||
      `${(r.patientId || '').trim()}|${(r.ngayBD || '').trim()}|${(r.ngayKT || '').trim()}|${normalizeText(r.tenKT)}|${normalizeText(r.ptChinh)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(r);
  }
  return result;
}

export function getPreviousDayIso(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const py = dt.getFullYear();
  const pm = String(dt.getMonth() + 1).padStart(2, '0');
  const pd = String(dt.getDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

export function determineSeason(
  isoDate: string,
  workingHours?: AppConfig['workingHours']
): 'Mùa Hè' | 'Mùa Đông' {
  if (!isoDate || isoDate.length < 10) return 'Mùa Hè';
  const month = parseInt(isoDate.substring(5, 7), 10);
  const day = parseInt(isoDate.substring(8, 10), 10);

  let summerStartM = 5;
  let summerStartD = 1;
  let summerEndM = 9;
  let summerEndD = 30;

  if (workingHours?.summer?.dateFrom && workingHours?.summer?.dateTo) {
    const fromParts = workingHours.summer.dateFrom.split(/[/-]/).map(Number);
    const toParts = workingHours.summer.dateTo.split(/[/-]/).map(Number);
    if (fromParts.length >= 2 && toParts.length >= 2) {
      summerStartD = fromParts[0] || 1;
      summerStartM = fromParts[1] || 5;
      summerEndD = toParts[0] || 30;
      summerEndM = toParts[1] || 9;
    }
  }

  const md = month * 100 + day;
  const startMd = summerStartM * 100 + summerStartD;
  const endMd = summerEndM * 100 + summerEndD;

  if (md >= startMd && md <= endMd) {
    return 'Mùa Hè';
  }
  return 'Mùa Đông';
}

export function getAllRecordsFromContext(
  ctx: AIDataContextInput
): Array<SurgeryRecord | PersistedSurgeryRecord> {
  if (ctx.currentRecords && ctx.currentRecords.length > 0) {
    return ctx.currentRecords;
  }
  if (ctx.yearlyCacheData) {
    const combined: PersistedSurgeryRecord[] = [];
    ctx.yearlyCacheData.primaryIndexed.byMonth.forEach((entry) => {
      if (entry.records && entry.records.length > 0) {
        combined.push(...entry.records);
      }
    });
    ctx.yearlyCacheData.compareIndexed.byMonth.forEach((entry) => {
      if (entry.records && entry.records.length > 0) {
        combined.push(...entry.records);
      }
    });
    return combined;
  }
  return [];
}

// In-memory cache of full-year deduplicated Firestore records for instant AI Studio queries
const aiFetchedYearsCache = new Map<number, PersistedSurgeryRecord[]>();

export function formatIsoToDMY(iso: string): string {
  if (!iso || iso.length < 10) return iso || '';
  const y = iso.substring(0, 4);
  const m = iso.substring(5, 7);
  const d = iso.substring(8, 10);
  return `${d}/${m}/${y}`;
}

export function getLastDayOfMonthDMY(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${String(lastDay).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Xác định mùa làm việc (Mùa Hè / Mùa Đông) theo đúng logic `determineSeason` trong `hooks/useStorageQuery.ts`
 */
export function determineWorkingSeason(
  checkDate: Date,
  workingHours?: AppConfig['workingHours']
): 'summer' | 'winter' {
  const checkMonth = checkDate.getMonth() + 1;
  const checkDay = checkDate.getDate();

  const summerDateFrom = workingHours?.summer?.dateFrom || '16/04';
  const summerDateTo = workingHours?.summer?.dateTo || '15/10';
  const [summerFromDay, summerFromMonth] = summerDateFrom.split('/').map(Number);
  const [summerToDay, summerToMonth] = summerDateTo.split('/').map(Number);

  const summerCrossYear =
    summerFromMonth > summerToMonth ||
    (summerFromMonth === summerToMonth && summerFromDay > summerToDay);

  if (!summerCrossYear) {
    if (checkMonth < summerFromMonth || checkMonth > summerToMonth) return 'winter';
    if (checkMonth === summerFromMonth && checkDay < summerFromDay) return 'winter';
    if (checkMonth === summerToMonth && checkDay > summerToDay) return 'winter';
    return 'summer';
  } else {
    if (checkMonth < summerToMonth || (checkMonth === summerToMonth && checkDay <= summerToDay)) {
      return 'summer';
    }
    if (checkMonth > summerFromMonth || (checkMonth === summerFromMonth && checkDay >= summerFromDay)) {
      return 'summer';
    }
    return 'winter';
  }
}

/**
 * Tính chính xác khung thời gian 24h của một "Tua trực" (Báo cáo hàng ngày -> Nút "Lấy dữ liệu trực"):
 * - Bắt đầu: `morningFrom` (07:00 Mùa Hè hoặc 07:30 Mùa Đông) của ngày bắt đầu `firstDateStr`
 * - Kết thúc: `nextMorningFrom - 1 phút` (06:59 Mùa Hè hoặc 07:29 Mùa Đông) sáng ngày kế tiếp sau `lastDateStr`
 */
export function compute24hDutyShiftWindow(
  firstDateStr: string,
  lastDateStr: string,
  workingHours?: AppConfig['workingHours']
): {
  dateFromStr: string;
  timeFrom: string;
  dateToStr: string;
  timeTo: string;
  isoFrom: string;
  isoTo: string;
  shiftStartMs: number;
  shiftEndMs: number;
  displayRange: string;
} {
  const [y1, m1, d1] = firstDateStr.split('-').map(Number);
  const [y2, m2, d2] = lastDateStr.split('-').map(Number);
  const dateFrom = new Date(y1, m1 - 1, d1, 12, 0, 0);
  const dateTo = new Date(y2, m2 - 1, d2 + 1, 12, 0, 0);
  const dateToStr = `${dateTo.getFullYear()}-${String(dateTo.getMonth() + 1).padStart(2, '0')}-${String(dateTo.getDate()).padStart(2, '0')}`;

  const seasonFrom = determineWorkingSeason(dateFrom, workingHours);
  const seasonTo = determineWorkingSeason(dateTo, workingHours);

  const summerMorningFrom = workingHours?.summer?.morningFrom || '07:00';
  const winterMorningFrom = workingHours?.winter?.morningFrom || '07:30';

  const morningFrom = seasonFrom === 'summer' ? summerMorningFrom : winterMorningFrom;
  const nextMorningFrom = seasonTo === 'summer' ? summerMorningFrom : winterMorningFrom;

  const [hours, minutes] = nextMorningFrom.split(':').map(Number);
  let toMinutes = minutes - 1;
  let toHours = hours;
  if (toMinutes < 0) {
    toMinutes = 59;
    toHours = hours - 1;
    if (toHours < 0) toHours = 23;
  }
  const timeTo = `${String(toHours).padStart(2, '0')}:${String(toMinutes).padStart(2, '0')}`;

  const startObj = new Date(`${firstDateStr}T${morningFrom}:00.000+07:00`);
  const endObj = new Date(`${dateToStr}T${timeTo}:59.999+07:00`);

  return {
    dateFromStr: firstDateStr,
    timeFrom: morningFrom,
    dateToStr,
    timeTo,
    isoFrom: startObj.toISOString(),
    isoTo: endObj.toISOString(),
    shiftStartMs: startObj.getTime(),
    shiftEndMs: endObj.getTime(),
    displayRange: `Từ ngày ${formatIsoToDMY(firstDateStr)} ${morningFrom} đến ngày ${formatIsoToDMY(dateToStr)} ${timeTo}`,
  };
}

/**
 * Tự động bóc tách ngày cụ thể / tháng / khoảng tháng / quý / năm và nguồn báo cáo trong câu truy vấn tiếng Việt
 */
export function extractTimeConstraintsFromPrompt(
  prompt: string,
  defaultYear = new Date().getFullYear()
): {
  months: number[];
  years: number[];
  specificDates: string[];
  dateRange?: { from: string; to: string };
  explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db';
  hasExplicitTimeOrSource: boolean;
  seasonFilter?: 'Mùa Hè' | 'Mùa Đông' | 'both';
  isDutyShift24h?: boolean;
} {
  const noTone = removeVietnameseTones(prompt);
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curDay = now.getDate();
  const todayIso = `${defaultYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}`;

  const months = new Set<number>();
  const years = new Set<number>();
  const specificDates = new Set<string>();
  let dateRange: { from: string; to: string } | undefined;
  const isDutyShift24h = /\b(tua truc|ca truc|trong truc|kip truc)\b/.test(noTone);

  // 0. Match explicit opened data references
  let explicitSource:
    | 'daily_opened'
    | 'monthly_opened'
    | 'current_opened'
    | 'daily_db'
    | 'monthly_db'
    | undefined;

  if (/\b(bao cao ngay dang mo|bc ngay dang mo|bao cao hang ngay dang mo)\b/.test(noTone)) {
    explicitSource = 'daily_opened';
  } else if (/\b(bao cao thang dang mo|bc thang dang mo)\b/.test(noTone)) {
    explicitSource = 'monthly_opened';
  } else if (/\b(ky dang mo|du lieu dang mo|tren man hinh|ky nay)\b/.test(noTone)) {
    explicitSource = 'current_opened';
  } else if (/\b(bao cao ngay|bc ngay|bao cao hang ngay|bc hang ngay)\b/.test(noTone)) {
    explicitSource = 'daily_db';
  } else if (/\b(bao cao thang|bc thang)\b/.test(noTone)) {
    explicitSource = 'monthly_db';
  }

  // 0a. Match explicit date range: "từ (ngày) DD/MM(/YYYY) đến (ngày) DD/MM(/YYYY)"
  const explicitRangeMatch = noTone.match(
    /\btu\s*(?:ngay\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](202\d))?\s*(?:den|toi|-|–)\s*(?:ngay\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](202\d))?\b/i
  );
  if (explicitRangeMatch) {
    const d1 = parseInt(explicitRangeMatch[1], 10);
    const m1 = parseInt(explicitRangeMatch[2], 10);
    const y1 = explicitRangeMatch[3] ? parseInt(explicitRangeMatch[3], 10) : defaultYear;
    const d2 = parseInt(explicitRangeMatch[4], 10);
    const m2 = parseInt(explicitRangeMatch[5], 10);
    const y2 = explicitRangeMatch[6] ? parseInt(explicitRangeMatch[6], 10) : y1;
    if (d1 >= 1 && d1 <= 31 && m1 >= 1 && m1 <= 12 && d2 >= 1 && d2 <= 31 && m2 >= 1 && m2 <= 12) {
      const fromIso = `${y1}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
      const toIso = `${y2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
      dateRange = fromIso <= toIso ? { from: fromIso, to: toIso } : { from: toIso, to: fromIso };
      years.add(y1);
      years.add(y2);
      if (y1 === y2 && m1 <= m2) {
        for (let m = m1; m <= m2; m++) months.add(m);
      } else {
        months.add(m1);
        months.add(m2);
      }
    }
  }

  // 0b. Match specific dates DD/MM/YYYY or DD-MM-YYYY, or "ngày DD/MM" / "tua trực DD/MM" (defaulting year to defaultYear)
  let mMatch: RegExpExecArray | null;
  if (!dateRange) {
    const dmyFullRegex = /\b(\d{1,2})[/-](\d{1,2})[/-](202\d)\b/g;
    while ((mMatch = dmyFullRegex.exec(noTone)) !== null) {
      const d = parseInt(mMatch[1], 10);
      const m = parseInt(mMatch[2], 10);
      const y = parseInt(mMatch[3], 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2035) {
        specificDates.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }

    if (specificDates.size === 0) {
      const dmShortRegex = /\b(?:ngay|tua truc|ca truc|hom)\s*(\d{1,2})[/-](\d{1,2})(?![/-]\d)/g;
      while ((mMatch = dmShortRegex.exec(noTone)) !== null) {
        const d = parseInt(mMatch[1], 10);
        const m = parseInt(mMatch[2], 10);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
          specificDates.add(
            `${defaultYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          );
        }
      }
    }
  }

  // Relative dates: "hôm nay", "hôm qua", "hôm kia"
  if (/\bhom nay\b/.test(noTone) && !/\b(tu dau|den hom nay|toi hom nay)\b/.test(noTone)) {
    specificDates.add(todayIso);
  }
  if (/\bhom qua\b/.test(noTone)) {
    const yest = new Date(Date.now() - 86400000);
    specificDates.add(
      `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
    );
  }
  if (/\bhom kia\b/.test(noTone)) {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    specificDates.add(
      `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`
    );
  }

  // Relative month-to-date & relative month phrases:
  // "từ đầu tháng tới giờ", "từ đầu tháng đến nay", "đầu tháng tới giờ", "đầu tháng đến nay", "từ đầu tháng"
  if (/\b(tu dau thang|dau thang toi gio|dau thang den nay|dau thang den gio|dau thang toi nay)\b/.test(noTone)) {
    months.add(curMonth);
    years.add(defaultYear);
    dateRange = {
      from: `${defaultYear}-${String(curMonth).padStart(2, '0')}-01`,
      to: todayIso,
    };
  } else if (/\b(thang nay|trong thang nay)\b/.test(noTone)) {
    months.add(curMonth);
    years.add(defaultYear);
  } else if (/\b(thang truoc|thang vua roi|thang qua)\b/.test(noTone)) {
    const prevM = curMonth === 1 ? 12 : curMonth - 1;
    const prevY = curMonth === 1 ? defaultYear - 1 : defaultYear;
    months.add(prevM);
    years.add(prevY);
  }

  // Relative year-to-date phrases: "từ đầu năm tới giờ", "từ đầu năm đến nay", "đầu năm tới giờ"
  if (/\b(tu dau nam|dau nam toi gio|dau nam den nay|dau nam den gio|dau nam toi nay)\b/.test(noTone)) {
    for (let m = 1; m <= curMonth; m++) months.add(m);
    years.add(defaultYear);
    dateRange = {
      from: `${defaultYear}-01-01`,
      to: todayIso,
    };
  }

  // Relative week / last 7 days phrases: "tuần này", "từ đầu tuần", "7 ngày qua"
  if (/\b(tuan nay|tu dau tuan|7 ngay qua|7 ngay gan day)\b/.test(noTone)) {
    const startDt = new Date(now);
    if (/\b(7 ngay qua|7 ngay gan day)\b/.test(noTone)) {
      startDt.setDate(startDt.getDate() - 6);
    } else {
      const dow = startDt.getDay();
      const diffToMonday = dow === 0 ? 6 : dow - 1;
      startDt.setDate(startDt.getDate() - diffToMonday);
    }
    const sy = startDt.getFullYear();
    const sm = startDt.getMonth() + 1;
    const sd = startDt.getDate();
    dateRange = {
      from: `${sy}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`,
      to: todayIso,
    };
    months.add(sm);
    months.add(curMonth);
    years.add(sy);
    years.add(defaultYear);
  }

  // 1. Match "N tháng đầu (năm)" e.g. "9 tháng đầu năm 2026", "6 tháng đầu"
  const firstNMonthsRegex = /(\d{1,2})\s*thang\s*dau/gi;
  while ((mMatch = firstNMonthsRegex.exec(noTone)) !== null) {
    const n = parseInt(mMatch[1], 10);
    if (n >= 1 && n <= 12) {
      for (let m = 1; m <= n; m++) months.add(m);
    }
  }

  // 2. Match "N tháng cuối (năm)" e.g. "3 tháng cuối năm", "6 tháng cuối"
  const lastNMonthsRegex = /(\d{1,2})\s*thang\s*cuoi/gi;
  while ((mMatch = lastNMonthsRegex.exec(noTone)) !== null) {
    const n = parseInt(mMatch[1], 10);
    if (n >= 1 && n <= 12) {
      for (let m = 12 - n + 1; m <= 12; m++) {
        if (m >= 1 && m <= 12) months.add(m);
      }
    }
  }

  // 3. Match "từ tháng A đến tháng B" or "tháng A - tháng B" or "tA - tB"
  const rangeMonthRegex = /(?:tu\s*)?(?:thang|thg|t)\s*(\d{1,2})\s*(?:den|toi|-|–)\s*(?:thang|thg|t)?\s*(\d{1,2})(?!\d)/gi;
  while ((mMatch = rangeMonthRegex.exec(noTone)) !== null) {
    const m1 = parseInt(mMatch[1], 10);
    const m2 = parseInt(mMatch[2], 10);
    if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12 && m1 <= m2) {
      for (let m = m1; m <= m2; m++) months.add(m);
    }
  }

  // 4. Match "quý 1..4" / "quý I..IV"
  const quarterRegex = /\bquy\s*(1|2|3|4|i|ii|iii|iv)\b/gi;
  while ((mMatch = quarterRegex.exec(noTone)) !== null) {
    const qRaw = mMatch[1].toLowerCase();
    const q =
      qRaw === '1' || qRaw === 'i'
        ? 1
        : qRaw === '2' || qRaw === 'ii'
        ? 2
        : qRaw === '3' || qRaw === 'iii'
        ? 3
        : 4;
    const startM = (q - 1) * 3 + 1;
    months.add(startM);
    months.add(startM + 1);
    months.add(startM + 2);
  }

  // 5. Match "tháng 1/2026", "tháng 05 năm 2025", "t5/2026"
  const monthYearRegex = /(?:thang|thg|t)\s*(\d{1,2})\s*(?:\/|-|\s+nam\s+)(\d{4})/gi;
  while ((mMatch = monthYearRegex.exec(noTone)) !== null) {
    const m = parseInt(mMatch[1], 10);
    const y = parseInt(mMatch[2], 10);
    if (m >= 1 && m <= 12) months.add(m);
    if (y >= 2020 && y <= 2035) years.add(y);
  }

  // 6. Match standalone "tháng X" (only if not part of "X tháng đầu/cuối")
  const monthOnlyRegex = /(?:thang|thg)\s*(\d{1,2})(?!\d)/gi;
  while ((mMatch = monthOnlyRegex.exec(noTone)) !== null) {
    const m = parseInt(mMatch[1], 10);
    if (m >= 1 && m <= 12) months.add(m);
  }

  // 7. Match "năm 2025", "2026" (skip if only matched inside specificDates)
  const textWithoutFullDates = noTone.replace(/\b\d{1,2}[/-]\d{1,2}[/-]202\d\b/g, '');
  const yearRegex = /(?:nam\s*)?(202\d)/g;
  while ((mMatch = yearRegex.exec(textWithoutFullDates)) !== null) {
    const y = parseInt(mMatch[1], 10);
    if (y >= 2020 && y <= 2035) years.add(y);
  }

  // Match relative years: "năm nay", "năm ngoái", "năm trước", "cùng kỳ"
  if (/\bnam nay\b/.test(noTone)) {
    years.add(defaultYear);
  }
  if (/\b(nam ngoai|nam truoc)\b/.test(noTone)) {
    years.add(defaultYear - 1);
  }
  if (/\b(cung ky|so voi nam truoc|so voi nam ngoai)\b/.test(noTone)) {
    if (years.size === 1) {
      const onlyY = Array.from(years)[0];
      years.add(onlyY - 1);
    } else if (years.size === 0) {
      years.add(defaultYear);
      years.add(defaultYear - 1);
    }
  }

  let seasonFilter: 'Mùa Hè' | 'Mùa Đông' | 'both' | undefined;
  const mentionsSummer = /\b(mua he|mua ha)\b/.test(noTone);
  const mentionsWinter = /\b(mua dong)\b/.test(noTone);
  const mentionsDifferentSeasons = /\b(cac mua|mua khac nhau|theo mua|giua cac mua)\b/.test(noTone);

  if ((mentionsSummer && mentionsWinter) || mentionsDifferentSeasons) {
    seasonFilter = 'both';
  } else if (mentionsSummer) {
    seasonFilter = 'Mùa Hè';
  } else if (mentionsWinter) {
    seasonFilter = 'Mùa Đông';
  }

  if (months.size > 0 && years.size === 0) {
    years.add(defaultYear);
  }

  const hasExplicitTimeOrSource =
    months.size > 0 ||
    years.size > 0 ||
    specificDates.size > 0 ||
    Boolean(dateRange) ||
    Boolean(explicitSource) ||
    Boolean(seasonFilter);

  return {
    months: Array.from(months).sort((a, b) => a - b),
    years: Array.from(years).sort((a, b) => a - b),
    specificDates: Array.from(specificDates).sort(),
    dateRange,
    explicitSource,
    hasExplicitTimeOrSource,
    seasonFilter,
    isDutyShift24h,
  };
}

/**
 * Tải và khử trùng lặp dữ liệu cả năm từ Firestore (ưu tiên MONTHLY kết hợp bổ sung DAILY cho các ngày mới trong tháng)
 */
async function fetchDeduplicatedYearRecordsFromFirestore(
  year: number
): Promise<PersistedSurgeryRecord[]> {
  const cached = aiFetchedYearsCache.get(year);
  if (cached) return cached;

  const dateFrom = `${year}-01-01T00:00:00.000Z`;
  const dateTo = `${year}-12-31T23:59:59.999Z`;
  const [monthly, daily] = await Promise.all([
    reportService.getReports(dateFrom, dateTo, 'MONTHLY'),
    reportService.getReports(dateFrom, dateTo, 'DAILY'),
  ]);

  const monthlyByMonth = new Map<number, PersistedSurgeryRecord[]>();
  const dailyByMonth = new Map<number, PersistedSurgeryRecord[]>();
  for (let m = 1; m <= 12; m++) {
    monthlyByMonth.set(m, []);
    dailyByMonth.set(m, []);
  }

  monthly.forEach((r) => {
    const iso = getRecordIsoDate(r);
    if (iso.length >= 7 && parseInt(iso.substring(0, 4), 10) === year) {
      const m = parseInt(iso.substring(5, 7), 10);
      monthlyByMonth.get(m)?.push(r);
    }
  });

  daily.forEach((r) => {
    const iso = getRecordIsoDate(r);
    if (iso.length >= 7 && parseInt(iso.substring(0, 4), 10) === year) {
      const m = parseInt(iso.substring(5, 7), 10);
      dailyByMonth.get(m)?.push(r);
    }
  });

  const combined: PersistedSurgeryRecord[] = [];
  for (let m = 1; m <= 12; m++) {
    const mRecs = monthlyByMonth.get(m) || [];
    const dRecs = dailyByMonth.get(m) || [];
    if (mRecs.length > 0 && dRecs.length > 0) {
      combined.push(...deduplicateSurgeryRecords([...mRecs, ...dRecs]));
    } else if (mRecs.length > 0) {
      combined.push(...deduplicateSurgeryRecords(mRecs));
    } else if (dRecs.length > 0) {
      combined.push(...deduplicateSurgeryRecords(dRecs));
    }
  }

  aiFetchedYearsCache.set(year, combined);
  return combined;
}

/**
 * Kiểm tra một bản ghi có nằm trong khung giờ Tua trực 24h `[shiftStartMs, shiftEndMs]` hay không
 */
function isRecordWithin24hShiftWindow(
  rec: SurgeryRecord | PersistedSurgeryRecord,
  shiftStartMs: number,
  shiftEndMs: number,
  shiftDateIso: string
): boolean {
  const hydrated = ensureHydratedSurgeryRecord(rec);
  const raw = String(rec.ngayBD || rec.ngayCD || '').trim();
  const hasExplicitClockTime = /\d{1,2}:\d{2}/.test(raw) || Boolean(rec.start instanceof Date);
  if (hasExplicitClockTime && hydrated.start && !isNaN(hydrated.start.getTime())) {
    const ms = hydrated.start.getTime();
    return ms >= shiftStartMs && ms <= shiftEndMs;
  }
  return getRecordIsoDate(rec) === shiftDateIso;
}

/**
 * Hybrid Fetcher: Đảm bảo có đủ bản ghi ca mổ cho ngày/tháng/năm/khoảng ngày/nguồn mà người dùng hỏi
 */
async function ensureSurgeryRecordsForQuery(
  ctx: AIDataContextInput,
  months: number[],
  years: number[],
  logs: AIChatToolExecutionLog[],
  specificDates: string[] = [],
  explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db',
  dateRange?: { from: string; to: string },
  isDutyShift24h = false
): Promise<{
  records: Array<SurgeryRecord | PersistedSurgeryRecord>;
  dataSourceCitation: string;
}> {
  const baseRecords = getAllRecordsFromContext(ctx);

  // 1. Explicit opened Daily report
  if (
    explicitSource === 'daily_opened' ||
    (explicitSource === 'daily_db' &&
      months.length === 0 &&
      years.length === 0 &&
      specificDates.length === 0 &&
      !dateRange &&
      (ctx.dailyOpenedRecords?.length ?? 0) > 0)
  ) {
    const recs = deduplicateSurgeryRecords(ctx.dailyOpenedRecords || []);
    const dates = recs.map((r) => getRecordIsoDate(r)).filter(Boolean).sort();
    const rangeStr =
      dates.length > 0
        ? `từ ${formatIsoToDMY(dates[0])} 00:00 đến ${formatIsoToDMY(dates[dates.length - 1])} 23:59`
        : '';
    return {
      records: recs,
      dataSourceCitation:
        ctx.dailyOpenedCitation ||
        `Số liệu Báo cáo hàng ngày đang mở ${rangeStr} (${recs.length.toLocaleString('vi-VN')} ca PTTT)`.trim(),
    };
  }

  // 2. Explicit opened Monthly report
  if (
    explicitSource === 'monthly_opened' ||
    (explicitSource === 'monthly_db' &&
      months.length === 0 &&
      years.length === 0 &&
      specificDates.length === 0 &&
      !dateRange &&
      (ctx.monthlyOpenedRecords?.length ?? 0) > 0)
  ) {
    const recs = deduplicateSurgeryRecords(ctx.monthlyOpenedRecords || []);
    const dates = recs.map((r) => getRecordIsoDate(r)).filter(Boolean).sort();
    const rangeStr =
      dates.length > 0
        ? `từ ${formatIsoToDMY(dates[0])} đến ${formatIsoToDMY(dates[dates.length - 1])}`
        : '';
    return {
      records: recs,
      dataSourceCitation:
        ctx.monthlyOpenedCitation ||
        `Số liệu Báo cáo tháng đang mở ${rangeStr} (${recs.length.toLocaleString('vi-VN')} ca PTTT)`.trim(),
    };
  }

  // 3. Specific Dates (e.g., "20/10/2026", "hôm nay", "hôm qua", "tua trực ngày hôm qua")
  if (specificDates.length > 0 && !dateRange) {
    const firstDate = specificDates[0];
    const lastDate = specificDates[specificDates.length - 1];

    // 3A. Nếu người dùng hỏi theo "Tua trực / Ca trực" (hoặc đang ở Báo cáo hàng ngày truy vấn tua trực):
    // Áp dụng đúng chuẩn nghiệp vụ phần mềm (`handleAutoFill24hShift` trong `useStorageQuery.ts`):
    // Từ `morningFrom` (07:00 Mùa Hè / 07:30 Mùa Đông) của `firstDate` đến `nextMorningFrom - 1 phút` (06:59 / 07:29) sáng hôm sau!
    if (isDutyShift24h) {
      const shiftWindow = compute24hDutyShiftWindow(firstDate, lastDate, ctx.config?.workingHours);

      const openedDaily = deduplicateSurgeryRecords(ctx.dailyOpenedRecords || []);
      if (
        openedDaily.length > 0 &&
        ctx.dailyOpenedCitation &&
        ctx.dailyOpenedCitation.includes(formatIsoToDMY(firstDate)) &&
        ctx.dailyOpenedCitation.includes(shiftWindow.timeFrom)
      ) {
        return {
          records: openedDaily,
          dataSourceCitation: `Số liệu Tua trực 24h ngày ${formatIsoToDMY(firstDate)} (${shiftWindow.displayRange} — ${openedDaily.length.toLocaleString('vi-VN')} ca PTTT)`,
        };
      }

      const combinedPool = deduplicateSurgeryRecords([
        ...(ctx.dailyOpenedRecords || []),
        ...baseRecords,
        ...(ctx.monthlyOpenedRecords || []),
      ]);
      let matchedShift = combinedPool.filter((r) =>
        isRecordWithin24hShiftWindow(r, shiftWindow.shiftStartMs, shiftWindow.shiftEndMs, firstDate)
      );

      if (ctx.allowRemoteFirestoreFetch !== false) {
        try {
          const fetched = await reportService.getReports(
            shiftWindow.isoFrom,
            shiftWindow.isoTo,
            'DAILY'
          );
          const fetchedFiltered = fetched.filter((r) =>
            isRecordWithin24hShiftWindow(r, shiftWindow.shiftStartMs, shiftWindow.shiftEndMs, firstDate)
          );
          if (fetchedFiltered.length > 0 || matchedShift.length === 0) {
            matchedShift = deduplicateSurgeryRecords([...fetchedFiltered, ...matchedShift]);
          }
          logs.push({
            toolName: 'firestore_expand_duty_shift_24h',
            summary: `Đã truy vấn Tua trực 24h (${shiftWindow.displayRange}): ${matchedShift.length.toLocaleString('vi-VN')} ca PTTT`,
            recordCount: matchedShift.length,
            expandedFirestoreFetch: true,
          });
        } catch (e) {
          console.warn('[aiQueryEngine] 24h Duty Shift fetch warning:', e);
        }
      }

      return {
        records: matchedShift,
        dataSourceCitation: `Số liệu Tua trực 24h ngày ${formatIsoToDMY(firstDate)} (${shiftWindow.displayRange} — ${matchedShift.length.toLocaleString('vi-VN')} ca PTTT)`,
      };
    }

    // 3B. Truy vấn theo Ngày lịch thông thường (00:00 -> 23:59)
    const openedDaily = deduplicateSurgeryRecords(ctx.dailyOpenedRecords || []);
    if (openedDaily.length > 0) {
      const openedDates = Array.from(new Set(openedDaily.map((r) => getRecordIsoDate(r)).filter(Boolean))).sort();
      if (openedDates.length > 0 && specificDates.includes(openedDates[0])) {
        return {
          records: openedDaily,
          dataSourceCitation:
            ctx.dailyOpenedCitation ||
            `Số liệu Báo cáo hàng ngày đang mở từ ${formatIsoToDMY(openedDates[0])} (${openedDaily.length.toLocaleString('vi-VN')} ca PTTT)`,
        };
      }
    }

    const combinedPool = deduplicateSurgeryRecords([
      ...(ctx.dailyOpenedRecords || []),
      ...baseRecords,
      ...(ctx.monthlyOpenedRecords || []),
    ]);
    let matchedDates = combinedPool.filter((r) => specificDates.includes(getRecordIsoDate(r)));

    if (matchedDates.length === 0 && ctx.allowRemoteFirestoreFetch !== false) {
      try {
        const fetched = await reportService.getReports(
          `${firstDate}T00:00:00.000Z`,
          `${lastDate}T23:59:59.999Z`,
          'DAILY'
        );
        matchedDates = deduplicateSurgeryRecords(
          fetched.filter((r) => specificDates.includes(getRecordIsoDate(r)))
        );
        logs.push({
          toolName: 'firestore_expand_daily',
          summary: `Đã truy vấn trực tiếp Báo cáo hàng ngày từ ${formatIsoToDMY(firstDate)} đến ${formatIsoToDMY(lastDate)} (${matchedDates.length.toLocaleString('vi-VN')} ca PTTT)`,
          recordCount: matchedDates.length,
          expandedFirestoreFetch: true,
        });
      } catch (e) {
        console.warn('[aiQueryEngine] Daily date fetch warning:', e);
      }
    }

    return {
      records: matchedDates,
      dataSourceCitation: `Số liệu Báo cáo hàng ngày (CSDL Lưu trữ) từ ${formatIsoToDMY(firstDate)} 00:00 đến ${formatIsoToDMY(lastDate)} 23:59 (${matchedDates.length.toLocaleString('vi-VN')} ca PTTT)`,
    };
  }

  // 4. When no specific month/year/dateRange is requested, use the currently opened screen records
  if (months.length === 0 && years.length === 0 && !dateRange) {
    const dedupedBase = deduplicateSurgeryRecords(baseRecords);
    const dates = dedupedBase.map((r) => getRecordIsoDate(r)).filter(Boolean).sort();
    const fallbackRange =
      dates.length > 0
        ? `từ ${formatIsoToDMY(dates[0])} đến ${formatIsoToDMY(dates[dates.length - 1])}`
        : ctx.periodLabel;
    return {
      records: dedupedBase,
      dataSourceCitation:
        ctx.activeSourceCitation ||
        `Số liệu đang mở trên màn hình (${ctx.periodLabel}) ${fallbackRange} — ${dedupedBase.length.toLocaleString('vi-VN')} ca PTTT`,
    };
  }

  const currentYear = new Date().getFullYear();
  const targetYears = years.length > 0 ? years : [currentYear];
  const targetMonths = months.length > 0 ? months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Collect records per year-month without duplicates
  const yearMonthMap = new Map<string, Array<SurgeryRecord | PersistedSurgeryRecord>>();

  // 1. From baseRecords (ONLY treat baseRecords as full-month cache when NOT on single-day daily_storage!)
  const isSingleDayContext = ctx.contextPage === 'daily_storage';
  if (!isSingleDayContext) {
    baseRecords.forEach((r) => {
      const iso = getRecordIsoDate(r);
      if (iso.length >= 7) {
        const ym = iso.substring(0, 7);
        const list = yearMonthMap.get(ym) || [];
        list.push(r);
        yearMonthMap.set(ym, list);
      }
    });
  }

  // Also include monthlyOpenedRecords if available
  if (ctx.monthlyOpenedRecords && ctx.monthlyOpenedRecords.length > 0) {
    ctx.monthlyOpenedRecords.forEach((r) => {
      const iso = getRecordIsoDate(r);
      if (iso.length >= 7) {
        const ym = iso.substring(0, 7);
        const list = yearMonthMap.get(ym) || [];
        list.push(r);
        yearMonthMap.set(ym, list);
      }
    });
  }

  // 2. From yearlyCacheData if available
  if (ctx.yearlyCacheData) {
    for (const y of targetYears) {
      const idx =
        y === ctx.yearlyCacheData.primaryYear
          ? ctx.yearlyCacheData.primaryIndexed
          : y === ctx.yearlyCacheData.compareYear
          ? ctx.yearlyCacheData.compareIndexed
          : null;
      if (idx) {
        for (const m of targetMonths) {
          const ym = `${y}-${String(m).padStart(2, '0')}`;
          const mEntry = idx.byMonth.get(m);
          if (mEntry && mEntry.records.length > 0 && !yearMonthMap.has(ym)) {
            yearMonthMap.set(ym, [...mEntry.records]);
          }
        }
      }
    }
  }

  // 3. Remote Firestore fetch for any requested year that is not yet fully in yearMonthMap
  if (ctx.allowRemoteFirestoreFetch !== false) {
    for (const y of targetYears) {
      const hasAllRequestedMonthsInYear = targetMonths.every((m) =>
        yearMonthMap.has(`${y}-${String(m).padStart(2, '0')}`)
      );
      const isCachedInYearly =
        ctx.yearlyCacheData &&
        (ctx.yearlyCacheData.primaryYear === y || ctx.yearlyCacheData.compareYear === y);

      if (!hasAllRequestedMonthsInYear && !isCachedInYearly) {
        try {
          const yearRecords = await fetchDeduplicatedYearRecordsFromFirestore(y);
          let addedForYear = 0;
          yearRecords.forEach((r) => {
            const iso = getRecordIsoDate(r);
            if (iso.length >= 7) {
              const ym = iso.substring(0, 7);
              const list = yearMonthMap.get(ym) || [];
              list.push(r);
              yearMonthMap.set(ym, list);
              addedForYear++;
            }
          });
          logs.push({
            toolName: 'firestore_expand_surgeries',
            summary: `Đã tự động truy vấn trực tiếp CSDL Lưu trữ năm ${y} (${addedForYear.toLocaleString('vi-VN')} ca PTTT)`,
            recordCount: addedForYear,
            expandedFirestoreFetch: true,
          });
        } catch (e) {
          console.warn('[aiQueryEngine] Remote year fetch fallback warning:', e);
        }
      }
    }
  }

  // Merge in baseRecords & dailyOpenedRecords (e.g. if user is on daily_storage and also has unsaved/current day records) and deduplicate
  if (isSingleDayContext || (ctx.dailyOpenedRecords && ctx.dailyOpenedRecords.length > 0)) {
    const extraDaily = [...baseRecords, ...(ctx.dailyOpenedRecords || [])];
    extraDaily.forEach((r) => {
      const iso = getRecordIsoDate(r);
      if (iso.length >= 7) {
        const ym = iso.substring(0, 7);
        const list = yearMonthMap.get(ym) || [];
        list.push(r);
        yearMonthMap.set(ym, list);
      }
    });
  }

  // Flatten, deduplicate, and filter strictly to requested targetYears, targetMonths & optional dateRange
  const rawResult: Array<SurgeryRecord | PersistedSurgeryRecord> = [];
  for (const [ym, recs] of yearMonthMap.entries()) {
    const rYear = parseInt(ym.substring(0, 4), 10);
    const rMonth = parseInt(ym.substring(5, 7), 10);
    if (years.length > 0 && !years.includes(rYear)) continue;
    if (months.length > 0 && !months.includes(rMonth)) continue;
    rawResult.push(...recs);
  }

  let result = deduplicateSurgeryRecords(rawResult);
  if (dateRange) {
    result = result.filter((r) => {
      const iso = getRecordIsoDate(r);
      return iso >= dateRange.from && iso <= dateRange.to;
    });
  }

  // Format explicit dataSourceCitation for the queried period
  const minM = targetMonths[0];
  const maxM = targetMonths[targetMonths.length - 1];
  const padM = (m: number) => String(m).padStart(2, '0');
  let dataSourceCitation = '';

  if (dateRange) {
    dataSourceCitation = `Số liệu CSDL Lưu trữ (Báo cáo tháng & hàng ngày) từ ngày ${formatIsoToDMY(dateRange.from)} đến ngày ${formatIsoToDMY(dateRange.to)} (${result.length.toLocaleString('vi-VN')} ca PTTT)`;
  } else if (targetYears.length >= 2) {
    const sortedDesc = [...targetYears].sort((a, b) => b - a);
    const yCurr = sortedDesc[0];
    const yPrev = sortedDesc[1];
    const countCurr = result.filter((r) => getRecordIsoDate(r).startsWith(String(yCurr))).length;
    const countPrev = result.filter((r) => getRecordIsoDate(r).startsWith(String(yPrev))).length;
    dataSourceCitation = `Số liệu Báo cáo tháng (CSDL Lưu trữ) từ 01/${padM(minM)}/${yCurr} đến ${getLastDayOfMonthDMY(yCurr, maxM)} (${countCurr.toLocaleString('vi-VN')} ca) so sánh với từ 01/${padM(minM)}/${yPrev} đến ${getLastDayOfMonthDMY(yPrev, maxM)} (${countPrev.toLocaleString('vi-VN')} ca)`;
  } else {
    const yOnly = targetYears[0];
    dataSourceCitation = `Số liệu Báo cáo tháng (CSDL Lưu trữ) từ 01/${padM(minM)}/${yOnly} đến ${getLastDayOfMonthDMY(yOnly, maxM)} (${result.length.toLocaleString('vi-VN')} ca PTTT)`;
  }

  return {
    records: result,
    dataSourceCitation,
  };
}

// ─── 1. PATIENT & SURGERY SEARCH TOOL ────────────────────────────────────────

export function executePatientSearchTool(
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  packageAssignments: ServicePackageAssignment[],
  queryText: string
): {
  matchedRecords: Array<SurgeryRecord | PersistedSurgeryRecord>;
  summaryText: string;
  artifact?: AIArtifact;
} {
  const noTone = removeVietnameseTones(queryText);

  // Extract explicit patient code if mentioned: "mã 2500123", "mã bn: 12345", or alphanumeric ID
  const codeMatch =
    queryText.match(/(?:mã\s*bn|mã\s*bệnh\s*nhân|mã\s*số|mã|id|bn)\s*[:#-]?\s*([A-Za-z0-9._-]{3,20})/i) ||
    queryText.match(/\b(\d{5,15})\b/);

  const targetCode = codeMatch ? codeMatch[1].trim().toLowerCase() : '';

  // Also check if searching by patient name: "bệnh nhân Nguyễn Văn A"
  const nameMatch = queryText.match(/(?:bệnh\s*nhân|bn|họ\s*tên)\s+([A-ZÀ-Ỹa-zà-ỹ\s]{3,35})/i);
  const targetName = nameMatch ? removeVietnameseTones(nameMatch[1]) : '';

  // Check ordinal reference in follow-up conversation: "ca thứ 2", "ca số 3", "bệnh nhân thứ 1", "ca đầu tiên", "ca cuối cùng"
  const ordMatch = noTone.match(/\b(?:ca|benh nhan|bn|stt|dong)\s+(?:thu|so)\s+(\d{1,3})\b/);
  let ordinalIndex = ordMatch ? parseInt(ordMatch[1], 10) - 1 : -1;
  if (ordinalIndex < 0 && /\b(?:ca|benh nhan)\s+dau\s+tien\b/.test(noTone)) {
    ordinalIndex = 0;
  } else if (ordinalIndex < 0 && /\b(?:ca|benh nhan)\s+cuoi\s+cung\b/.test(noTone) && records.length > 0) {
    ordinalIndex = records.length - 1;
  }

  const matched = records.filter((r, idx) => {
    if (ordinalIndex >= 0 && idx === ordinalIndex) {
      return true;
    }
    const pid = (r.patientId || '').toLowerCase();
    const pname = removeVietnameseTones(r.patientName || '');
    const bhyt = (r.bhyt || '').toLowerCase();
    if (targetCode && (pid.includes(targetCode) || bhyt.includes(targetCode))) {
      return true;
    }
    if (targetName && targetName.length >= 3 && pname.includes(targetName)) {
      return true;
    }
    if (pname.length >= 5 && noTone.includes(pname)) {
      return true;
    }
    return false;
  });

  if (matched.length === 0 && !targetCode && !targetName && ordinalIndex < 0) {
    return { matchedRecords: [], summaryText: '' };
  }

  // Build package lookup map
  const pkgByComposite = new Map<string, ServicePackageAssignment>();
  const pkgByPatientId = new Map<string, ServicePackageAssignment[]>();
  packageAssignments.forEach((pa) => {
    if (pa.compositeKey) pkgByComposite.set(pa.compositeKey, pa);
    const pidKey = (pa.patientId || '').trim().toLowerCase();
    if (pidKey) {
      const arr = pkgByPatientId.get(pidKey) || [];
      arr.push(pa);
      pkgByPatientId.set(pidKey, arr);
    }
  });

  const rows = matched.slice(0, 100).map((r, idx) => {
    const isoDate = getRecordIsoDate(r);
    const compKey = buildCompositeKey(r.patientId || '', isoDate, r.tenKT || '');
    const pkg =
      pkgByComposite.get(compKey) ||
      pkgByPatientId.get((r.patientId || '').trim().toLowerCase())?.[0];

    return {
      stt: idx + 1,
      patientId: r.patientId || '',
      patientName: r.patientName || '',
      yob: r.yob || '',
      gender: r.gender || '',
      ngayBD: isoDate,
      tenKT: r.tenKT || '',
      loaiPTTT: r.loaiPTTT || '',
      ptChinh: r.ptChinh || '',
      bsGM: r.bsGM || '',
      machine: r.machineCode || r.machine || '',
      packageName: pkg ? pkg.packageShortName || pkg.packageName : 'Không',
      thanhTien: r.thanhTien || r.donGia || 0,
    };
  });

  const artifact: AIArtifact = {
    id: `patient_search_${Date.now()}`,
    type: 'table',
    title: `Kết quả tra cứu bệnh nhân ${targetCode ? `(Mã: ${targetCode.toUpperCase()})` : ''}`,
    subtitle: `Tìm thấy ${matched.length} lượt phẫu thuật / thủ thuật khớp điều kiện`,
    kpiCards: [
      { label: 'Số lượt PTTT tìm thấy', value: matched.length, tone: 'blue' },
      {
        label: 'Số bệnh nhân (Unique Mã BN)',
        value: new Set(matched.map((m) => m.patientId)).size,
        tone: 'emerald',
      },
      {
        label: 'Tổng viện phí DVKT',
        value: `${rows.reduce((s, r) => s + (Number(r.thanhTien) || 0), 0).toLocaleString('vi-VN')} đ`,
        tone: 'amber',
      },
    ],
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'patientId', label: 'Mã BN', align: 'left' },
        { key: 'patientName', label: 'Họ tên BN', align: 'left' },
        { key: 'yob', label: 'Năm sinh', align: 'center' },
        { key: 'ngayBD', label: 'Ngày mổ', align: 'center' },
        { key: 'tenKT', label: 'Tên kỹ thuật PTTT', align: 'left' },
        { key: 'loaiPTTT', label: 'Loại', align: 'center' },
        { key: 'ptChinh', label: 'PTV Chính', align: 'left' },
        { key: 'bsGM', label: 'BS Gây mê', align: 'left' },
        { key: 'packageName', label: 'Gói DV yêu cầu', align: 'left' },
        { key: 'thanhTien', label: 'Thành tiền (VNĐ)', align: 'right', format: 'currency' },
      ],
      rows,
    },
    rawRecords: rows,
    createdAt: Date.now(),
  };

  const summaryText = `### Kết quả truy vấn Bệnh nhân (${targetCode || targetName}):
- Tổng số ca tìm thấy: **${matched.length}** ca.
- Chi tiết các ca tiêu biểu:
${rows
  .slice(0, 15)
  .map(
    (r) =>
      `  + Mã BN **${r.patientId}** | **${r.patientName}** (${r.yob}) | Ngày: ${r.ngayBD} | KT: "${r.tenKT}" (${r.loaiPTTT}) | PTV chính: ${r.ptChinh || '—'} | BS GM: ${r.bsGM || '—'} | Gói DV: ${r.packageName} | Viện phí: ${Number(r.thanhTien).toLocaleString('vi-VN')}đ`
  )
  .join('\n')}`;

  return {
    matchedRecords: matched,
    summaryText,
    artifact,
  };
}

// ─── 1B. SURGERY LIST REPORT TOOL (BÁO CÁO DANH SÁCH PHẪU THUẬT / CA MỔ TRONG TUA TRỰC / NGÀY) ──

function formatShortShiftDateTime(
  raw: string | undefined,
  dateObj: Date | undefined
): string {
  if (dateObj && !isNaN(dateObj.getTime())) {
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${d}/${m} ${hh}:${mm}`;
  }
  const str = (raw || '').trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}:\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]} ${isoMatch[4]}`;
  }
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2})/);
  if (dmyMatch) {
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')} ${dmyMatch[3]}`;
  }
  return str || '—';
}

export function executeSurgeryListReportTool(
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  dataSourceCitation?: string
): {
  summaryText: string;
  artifact?: AIArtifact;
} {
  const hydrated = records
    .map((r) => ensureHydratedSurgeryRecord(r))
    .sort((a, b) => {
      const ta = a.start && !isNaN(a.start.getTime()) ? a.start.getTime() : 0;
      const tb = b.start && !isNaN(b.start.getTime()) ? b.start.getTime() : 0;
      return ta - tb;
    });

  if (hydrated.length === 0) {
    return {
      summaryText: `Không có ca phẫu thuật / thủ thuật nào trong khoảng thời gian truy vấn này.`,
    };
  }

  let ptCount = 0;
  let ttCount = 0;
  const loaiMap = new Map<string, number>();

  const rows = hydrated.map((r, idx) => {
    const loai = (r.loaiPTTT || 'Khác').toUpperCase().trim();
    if (loai.startsWith('P')) ptCount++;
    else if (loai.startsWith('T')) ttCount++;
    loaiMap.set(loai, (loaiMap.get(loai) || 0) + 1);

    const startShort = formatShortShiftDateTime(r.ngayBD, r.start);
    const endShort = formatShortShiftDateTime(r.ngayKT, r.end);
    const endTimeOnly =
      endShort.length >= 5 && startShort.substring(0, 5) === endShort.substring(0, 5)
        ? endShort.substring(6)
        : endShort;
    const gmStaff = [r.bsGM, r.ktvGM].map((s) => (s || '').trim()).filter(Boolean).join(', ');

    return {
      stt: idx + 1,
      patientId: r.patientId || '—',
      patientName: r.patientName || '—',
      timeWindow: `${startShort} → ${endTimeOnly}`,
      ngayBD: startShort,
      ngayKT: endShort,
      tenKT: r.tenKT || '—',
      loaiPTTT: loai,
      ptChinh: r.ptChinh || '—',
      ptPhu: r.ptPhu || '—',
      gayMe: gmStaff || '—',
      tdc: r.tdc || '—',
      gv: r.gv || '—',
    };
  });

  const loaiSummary = Array.from(loaiMap.entries())
    .map(([k, v]) => `${k}: **${v}** ca`)
    .join(', ');

  const mdTableHeader = [
    '| STT | Mã BN | Họ tên BN | Thời gian (BĐ → KT) | Tên kỹ thuật PTTT | Loại | PT chính | Gây mê |',
    '| :---: | :--- | :--- | :---: | :--- | :---: | :--- | :--- |',
  ];
  const mdTableBody = rows.slice(0, 60).map(
    (r) =>
      `| ${r.stt} | \`${r.patientId}\` | **${r.patientName}** | ${r.timeWindow} | ${r.tenKT} | **${r.loaiPTTT}** | ${r.ptChinh} | ${r.gayMe} |`
  );
  const moreNote =
    rows.length > 60
      ? `\n*(Hiển thị 60/${rows.length} ca đầu tiên; bấm **Xuất Excel** bên dưới để tải đầy đủ ${rows.length} ca)*`
      : '';

  const summaryText = `- **Tổng hợp danh sách**: **${hydrated.length} ca PTTT** (gồm **${ptCount} ca Phẫu thuật**, **${ttCount} ca Thủ thuật** — Phân loại: ${loaiSummary}).\n\n${[
    ...mdTableHeader,
    ...mdTableBody,
  ].join('\n')}${moreNote}`;

  const artifact: AIArtifact = {
    id: `surgery_list_report_${Date.now()}`,
    type: 'table',
    title: `Danh sách Phẫu thuật / Thủ thuật (${hydrated.length} ca)`,
    subtitle: dataSourceCitation || `Tổng số: ${ptCount} ca Phẫu thuật, ${ttCount} ca Thủ thuật`,
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'patientId', label: 'Mã BN', align: 'left' },
        { key: 'patientName', label: 'Họ tên BN', align: 'left' },
        { key: 'timeWindow', label: 'Thời gian (BĐ → KT)', align: 'center' },
        { key: 'tenKT', label: 'Tên kỹ thuật PTTT', align: 'left' },
        { key: 'loaiPTTT', label: 'Loại', align: 'center' },
        { key: 'ptChinh', label: 'PT chính', align: 'left' },
        { key: 'ptPhu', label: 'PT phụ', align: 'left' },
        { key: 'gayMe', label: 'BS/KTV Gây mê', align: 'left' },
        { key: 'tdc', label: 'TDC', align: 'left' },
        { key: 'gv', label: 'Giúp việc', align: 'left' },
      ],
      rows,
    },
    rawRecords: rows,
    createdAt: Date.now(),
  };

  return { summaryText, artifact };
}

// ─── 2. DUTY SCHEDULE & ON-CALL ANALYSIS TOOL ────────────────────────────────

export async function executeDutyScheduleAnalysisTool(
  ctx: AIDataContextInput,
  queryText: string,
  months: number[],
  years: number[],
  targetStaffNames: string[],
  logs: AIChatToolExecutionLog[],
  specificDates: string[] = []
): Promise<{
  summaryText: string;
  artifact?: AIArtifact;
}> {
  const targetYear = years[0] || new Date().getFullYear();
  const targetMonths = months.length > 0 ? months : [];

  // Build list of dateKeys to inspect
  const dateKeysToInspect = new Set<string>(Object.keys(ctx.dutySchedules || {}));

  if (specificDates.length > 0) {
    specificDates.forEach((d) => dateKeysToInspect.add(d));
  } else if (targetMonths.length > 0) {
    for (const m of targetMonths) {
      const daysInM = new Date(targetYear, m, 0).getDate();
      for (let d = 1; d <= daysInM; d++) {
        dateKeysToInspect.add(
          `${targetYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        );
      }
    }
  } else {
    // Also add dates from current loaded surgery records
    ctx.currentRecords.forEach((r) => {
      const iso = getRecordIsoDate(r);
      if (iso) dateKeysToInspect.add(iso);
    });
  }

  const allKeys = Array.from(dateKeysToInspect).sort();
  let mergedSchedules: Record<string, DutyScheduleDateConfig> = { ...(ctx.dutySchedules || {}) };

  // Fetch missing duty schedules via dutyScheduleService (uses LocalStorage + Firestore)
  const missingKeys = allKeys.filter((k) => !mergedSchedules[k]);
  if (missingKeys.length > 0) {
    const fetched = await dutyScheduleService.getDutySchedulesForDates(missingKeys);
    mergedSchedules = { ...mergedSchedules, ...fetched };
    logs.push({
      toolName: 'query_duty_schedules',
      summary: `Đã nạp dữ liệu lịch trực 24h cho ${missingKeys.length} ngày (${targetMonths.length > 0 ? `Tháng ${targetMonths.join(', ')}/${targetYear}` : 'Kỳ hiện tại'})`,
      recordCount: Object.keys(fetched).length,
      expandedFirestoreFetch: true,
    });
  }

  // Filter schedules by specificDates / targetMonths / targetYear if specified
  const filteredDates = Object.keys(mergedSchedules)
    .filter((dateKey) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
      if (specificDates.length > 0) {
        return specificDates.includes(dateKey);
      }
      const y = parseInt(dateKey.substring(0, 4), 10);
      const m = parseInt(dateKey.substring(5, 7), 10);
      if (years.length > 0 && !years.includes(y)) return false;
      if (targetMonths.length > 0 && !targetMonths.includes(m)) return false;
      return true;
    })
    .sort();

  // Aggregate per staff member
  const staffDutyMap = new Map<
    string,
    {
      staffName: string;
      totalShifts: number;
      weekdayShifts: number;
      holidayShifts: number;
      dates: string[];
      holidayDates: string[];
    }
  >();

  filteredDates.forEach((dateKey) => {
    const cfg = mergedSchedules[dateKey];
    if (!cfg || !Array.isArray(cfg.onCallStaff) || cfg.onCallStaff.length === 0) return;
    const isHol = cfg.isHoliday !== undefined ? cfg.isHoliday : isWeekend(dateKey);

    cfg.onCallStaff.forEach((rawName) => {
      const clean = (rawName || '').trim();
      if (!clean) return;
      const entry = staffDutyMap.get(clean) || {
        staffName: clean,
        totalShifts: 0,
        weekdayShifts: 0,
        holidayShifts: 0,
        dates: [],
        holidayDates: [],
      };
      entry.totalShifts += 1;
      if (isHol) {
        entry.holidayShifts += 1;
        entry.holidayDates.push(dateKey);
      } else {
        entry.weekdayShifts += 1;
      }
      entry.dates.push(dateKey);
      staffDutyMap.set(clean, entry);
    });
  });

  let rows = Array.from(staffDutyMap.values()).sort((a, b) => b.totalShifts - a.totalShifts);

  // If specific staff names were asked, filter or highlight them
  if (targetStaffNames.length > 0) {
    const normTargets = targetStaffNames.map((n) => removeVietnameseTones(n));
    const matchedStaffRows = rows.filter((r) => {
      const rNorm = removeVietnameseTones(r.staffName);
      return normTargets.some((t) => rNorm.includes(t) || t.includes(rNorm));
    });
    if (matchedStaffRows.length > 0) {
      rows = matchedStaffRows;
    } else {
      // Even if 0 shifts found, explicitly include the queried staff with 0 shifts so AI reports 0 accurately
      targetStaffNames.forEach((tName) => {
        rows.unshift({
          staffName: tName,
          totalShifts: 0,
          weekdayShifts: 0,
          holidayShifts: 0,
          dates: [],
          holidayDates: [],
        });
      });
    }
  }

  const periodTitle =
    specificDates.length === 1
      ? `Ngày ${formatIsoToDMY(specificDates[0])}`
      : specificDates.length > 1
      ? `Từ ${formatIsoToDMY(specificDates[0])} đến ${formatIsoToDMY(specificDates[specificDates.length - 1])}`
      : targetMonths.length > 0
      ? `Tháng ${targetMonths.join(', ')}/${targetYear}`
      : ctx.periodLabel || `Năm ${targetYear}`;

  const tableRows = rows.map((r, idx) => ({
    stt: idx + 1,
    staffName: r.staffName,
    totalShifts: r.totalShifts,
    weekdayShifts: r.weekdayShifts,
    holidayShifts: r.holidayShifts,
    datesList: r.dates
      .map((d) => `${d.substring(8, 10)}/${d.substring(5, 7)}`)
      .join(', '),
  }));

  const isMultiDaySchedule = filteredDates.length > 2;

  const artifact: AIArtifact = {
    id: `duty_schedule_${Date.now()}`,
    type: isMultiDaySchedule ? 'composite' : 'table',
    title: `Thống kê Lịch trực 24h — ${periodTitle}`,
    subtitle: `Tổng hợp trên ${filteredDates.length} ngày lịch trực (${rows.length} nhân viên tham gia trực)`,
    kpiCards: isMultiDaySchedule
      ? [
          { label: 'Kỳ thống kê trực', value: periodTitle, tone: 'blue' },
          { label: 'Số nhân sự có lịch trực', value: rows.filter((r) => r.totalShifts > 0).length, tone: 'emerald' },
          {
            label: 'Tổng lượt trực nhân viên',
            value: rows.reduce((s, r) => s + r.totalShifts, 0),
            tone: 'amber',
          },
        ]
      : undefined,
    chartConfig: isMultiDaySchedule
      ? {
          chartType: 'bar',
          xAxisKey: 'staffName',
          xAxisLabel: 'Nhân viên y tế',
          enableBrush: rows.length > 8,
          stacked: true,
          series: [
            { key: 'weekdayShifts', name: 'Trực ngày thường (buổi)', color: '#0284c7', type: 'bar' },
            { key: 'holidayShifts', name: 'Trực T7/CN/Lễ (buổi)', color: '#f59e0b', type: 'bar' },
          ],
          data: tableRows.slice(0, 30),
        }
      : undefined,
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'staffName', label: 'Họ và tên nhân viên', align: 'left' },
        { key: 'totalShifts', label: 'Tổng số buổi trực', align: 'right', format: 'number' },
        { key: 'weekdayShifts', label: 'Buổi trực ngày thường', align: 'right', format: 'number' },
        { key: 'holidayShifts', label: 'Buổi trực T7/CN/Lễ', align: 'right', format: 'number' },
        { key: 'datesList', label: 'Các ngày trực cụ thể', align: 'left' },
      ],
      rows: tableRows,
    },
    rawRecords: tableRows,
    createdAt: Date.now(),
  };

  const dailyBreakdownLines =
    filteredDates.length > 0 && filteredDates.length <= 15
      ? filteredDates
          .map((d) => {
            const cfg = mergedSchedules[d];
            const staffListStr =
              cfg && Array.isArray(cfg.onCallStaff) && cfg.onCallStaff.length > 0
                ? cfg.onCallStaff.join(', ')
                : 'Chưa nhập danh sách trực';
            const isHol = cfg?.isHoliday !== undefined ? cfg.isHoliday : isWeekend(d);
            return `  + Ngày **${formatIsoToDMY(d)}** (${isHol ? 'Ngày nghỉ/T7/CN' : 'Ngày thường'}): **${staffListStr}**`;
          })
          .join('\n')
      : '';

  const summaryText = `### Kết quả truy vấn Lịch trực 24h (${periodTitle}):
${dailyBreakdownLines ? `- Danh sách nhân viên trực:\n${dailyBreakdownLines}\n` : ''}${
    tableRows.length === 0
      ? '- Chưa có dữ liệu phân công lịch trực 24h nào được lưu trong kỳ này.'
      : filteredDates.length <= 1 && targetStaffNames.length === 0
      ? ''
      : tableRows
          .slice(0, 20)
          .map(
            (r) =>
              `- Nhân viên **${r.staffName}**: Tổng cộng **${r.totalShifts} buổi trực** (gồm **${r.weekdayShifts}** buổi ngày thường và **${r.holidayShifts}** buổi Thứ 7/CN/Lễ). Ngày trực: ${r.datesList || 'Không có'}.`
          )
          .join('\n')
  }`.trim();

  void queryText;
  return { summaryText, artifact };
}

// ─── 3. SERVICE PACKAGE ANALYSIS TOOL ────────────────────────────────────────

export function executeServicePackageAnalysisTool(
  ctx: AIDataContextInput,
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  queryText: string,
  months: number[],
  years: number[]
): {
  summaryText: string;
  artifact?: AIArtifact;
} {
  const noTone = removeVietnameseTones(queryText);

  // Detect if user asks for a specific package keyword e.g. "sản khoa", "chọn bác sĩ"
  const asksObstetrics = /\b(san khoa|phu san|mo de|lay thai|san)\b/.test(noTone);
  const pkgDefMap = new Map<string, ServicePackageDefinition>();
  ctx.packageDefinitions.forEach((d) => pkgDefMap.set(d.id, d));

  // Filter package assignments by date/month/year if specified
  const filteredAssignments = ctx.packageAssignments.filter((a) => {
    const rawDate = (a.ngayBD || '').substring(0, 10);
    if (rawDate && /^\d{4}-\d{2}/.test(rawDate)) {
      const y = parseInt(rawDate.substring(0, 4), 10);
      const m = parseInt(rawDate.substring(5, 7), 10);
      if (years.length > 0 && !years.includes(y)) return false;
      if (months.length > 0 && !months.includes(m)) return false;
    }
    if (asksObstetrics) {
      const pkgNorm = removeVietnameseTones(`${a.packageName} ${a.packageShortName || ''} ${a.tenKT || ''}`);
      return (
        pkgNorm.includes('san') ||
        pkgNorm.includes('lay thai') ||
        pkgNorm.includes('mo de') ||
        pkgNorm.includes('tu cung')
      );
    }
    return true;
  });

  // Group by packageName
  const byPackageMap = new Map<
    string,
    {
      packageName: string;
      caseCount: number;
      unitAmount: number;
      totalRevenue: number;
      staffPayoutTotal: number;
      patients: string[];
    }
  >();

  filteredAssignments.forEach((a) => {
    const def = pkgDefMap.get(a.packageId);
    const pkgLabel = a.packageName || def?.name || 'Gói dịch vụ yêu cầu';
    const unitAmt = def?.totalAmount || (a.staffAssignments || []).reduce((s, st) => s + (st.amount || 0), 0);
    const staffSum = (a.staffAssignments || []).reduce((s, st) => s + (st.amount || 0), 0);

    const existing = byPackageMap.get(pkgLabel) || {
      packageName: pkgLabel,
      caseCount: 0,
      unitAmount: unitAmt,
      totalRevenue: 0,
      staffPayoutTotal: 0,
      patients: [],
    };
    existing.caseCount += 1;
    existing.totalRevenue += unitAmt;
    existing.staffPayoutTotal += staffSum;
    existing.patients.push(`${a.patientName} (${a.patientId})`);
    byPackageMap.set(pkgLabel, existing);
  });

  const pkgRows = Array.from(byPackageMap.values())
    .sort((a, b) => b.caseCount - a.caseCount)
    .map((item, idx) => ({
      stt: idx + 1,
      packageName: item.packageName,
      caseCount: item.caseCount,
      unitAmount: item.unitAmount,
      totalRevenue: item.totalRevenue,
      staffPayoutTotal: item.staffPayoutTotal,
      samplePatients: item.patients.slice(0, 5).join(', '),
    }));

  const detailRows = filteredAssignments.map((a, idx) => {
    const def = pkgDefMap.get(a.packageId);
    const ptChinhStaff = (a.staffAssignments || []).find((s) => s.positionKey === 'ptChinh')?.staffName || '';
    const bsGMStaff = (a.staffAssignments || []).find((s) => s.positionKey === 'bsGM')?.staffName || '';
    const hoSinhStaff = (a.staffAssignments || []).find((s) => s.positionKey === 'hoSinhDonBe')?.staffName || '';
    return {
      stt: idx + 1,
      patientId: a.patientId,
      patientName: a.patientName,
      ngayBD: (a.ngayBD || '').substring(0, 10),
      tenKT: a.tenKT,
      packageName: a.packageName,
      ptChinh: ptChinhStaff,
      bsGM: bsGMStaff,
      hoSinhDonBe: hoSinhStaff,
      totalAmount: def?.totalAmount || (a.staffAssignments || []).reduce((s, st) => s + (st.amount || 0), 0),
    };
  });

  const totalPkgCases = filteredAssignments.length;
  const totalPkgRevenue = pkgRows.reduce((s, r) => s + r.totalRevenue, 0);

  const artifact: AIArtifact = {
    id: `service_packages_${Date.now()}`,
    type: 'composite',
    title: asksObstetrics
      ? 'Thống kê Gói Dịch vụ Yêu cầu Sản khoa'
      : 'Thống kê Sử dụng Gói Dịch vụ Theo Yêu cầu',
    subtitle: `Tổng số: ${totalPkgCases} ca sử dụng gói dịch vụ — Tổng thu gói: ${totalPkgRevenue.toLocaleString('vi-VN')} VNĐ`,
    kpiCards: [
      { label: 'Tổng số ca dùng Gói DV', value: totalPkgCases, tone: 'blue' },
      { label: 'Số loại Gói DV phát sinh', value: pkgRows.length, tone: 'emerald' },
      {
        label: 'Tổng doanh thu Gói DV',
        value: `${totalPkgRevenue.toLocaleString('vi-VN')} đ`,
        tone: 'amber',
      },
    ],
    chartConfig:
      pkgRows.length > 0
        ? {
            chartType: 'composed',
            xAxisKey: 'packageName',
            xAxisLabel: 'Tên Gói Dịch vụ',
            series: [
              { key: 'caseCount', name: 'Số ca sử dụng', color: '#0284c7', type: 'bar', yAxisId: 'left' },
              {
                key: 'totalRevenue',
                name: 'Doanh thu gói (VNĐ)',
                color: '#10b981',
                type: 'line',
                yAxisId: 'right',
              },
            ],
            data: pkgRows,
          }
        : undefined,
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'packageName', label: 'Tên Gói dịch vụ yêu cầu', align: 'left' },
        { key: 'caseCount', label: 'Số ca', align: 'right', format: 'number' },
        { key: 'unitAmount', label: 'Đơn giá gói (VNĐ)', align: 'right', format: 'currency' },
        { key: 'totalRevenue', label: 'Tổng tiền gói (VNĐ)', align: 'right', format: 'currency' },
        { key: 'samplePatients', label: 'Bệnh nhân tiêu biểu', align: 'left' },
      ],
      rows: pkgRows,
    },
    rawRecords: detailRows,
    createdAt: Date.now(),
  };

  const staffPaymentRows = buildPackagePaymentRows(
    filteredAssignments,
    ctx.packageDefinitions || [],
    ctx.config.staffList || []
  ).filter((r) => !r.isUnassigned && r.totalCount > 0);

  const staffPaymentText =
    staffPaymentRows.length > 0
      ? `\n- Thanh toán thù lao Gói dịch vụ theo nhân viên (Thực lĩnh sau khấu trừ):\n${staffPaymentRows
          .slice(0, 20)
          .map(
            (sr) =>
              `  + **${sr.staffName}** (${sr.department || 'Chưa phân khoa'}): **${sr.totalCount} lượt** | Thực lĩnh gói DV: **${Math.round(sr.total).toLocaleString('vi-VN')} VNĐ**`
          )
          .join('\n')}`
      : '';

  const summaryText = `### Kết quả truy vấn Gói Dịch vụ Yêu cầu ${asksObstetrics ? '(Nhóm Sản khoa)' : ''}:
- Tổng số ca sử dụng gói dịch vụ khớp điều kiện: **${totalPkgCases} ca** ( trên tổng số ${records.length} ca PTTT trong kỳ).
- Tổng doanh thu gói dịch vụ: **${totalPkgRevenue.toLocaleString('vi-VN')} VNĐ**.
- Chi tiết theo từng gói:
${
  pkgRows.length === 0
    ? '  + Không có ca nào sử dụng gói dịch vụ khớp điều kiện trong tập dữ liệu.'
    : pkgRows
        .map(
          (r) =>
            `  + **${r.packageName}**: **${r.caseCount} ca** | Đơn giá: ${r.unitAmount.toLocaleString('vi-VN')}đ | Tổng tiền: **${r.totalRevenue.toLocaleString('vi-VN')}đ**`
        )
        .join('\n')
}${staffPaymentText}`;

  return { summaryText, artifact };
}

// ─── 4. STAFF WORKLOAD & ROLE ANALYSIS TOOL ──────────────────────────────────

export function extractTargetStaffNames(prompt: string, config: AppConfig): string[] {
  const noTonePrompt = removeVietnameseTones(prompt);
  const found = new Set<string>();

  // 1. Match against configured staffList
  (config.staffList || []).forEach((st) => {
    const clean = (st.name || '').trim();
    if (clean.length < 2) return;
    const normName = removeVietnameseTones(clean);
    if (noTonePrompt.includes(normName)) {
      found.add(clean);
    }
  });

  // 2. Regex heuristic for "nhân viên X", "bác sĩ Y", "bs Z", "điều dưỡng T"
  const regex =
    /(?:nhân\s*viên|bác\s*sĩ|bs\.?|ptv|kỹ\s*thuật\s*viên|ktv|điều\s*dưỡng|hộ\s*sinh)\s+([A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹa-zà-ỹ]+){0,3}?)(?=\s+(?:làm|mổ|trực|tham\s*gia|tháng|năm|có|bao\s*nhiêu|ở|trong|\?|,|\.|$))/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    const candidate = (match[1] || '').trim();
    const stopWords = ['bao nhiêu', 'nào', 'khác nhau', 'các', 'trong', 'theo'];
    if (
      candidate.length >= 2 &&
      !stopWords.some((sw) => removeVietnameseTones(candidate) === removeVietnameseTones(sw))
    ) {
      found.add(candidate);
    }
  }

  return Array.from(found);
}

export function executeStaffWorkloadTool(
  ctx: AIDataContextInput,
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  targetStaffNames: string[]
): {
  summaryText: string;
  artifact?: AIArtifact;
} {
  interface StaffAgg {
    staffName: string;
    department: string;
    totalCases: number;
    totalEquivalent: number;
    ptChinhCount: number;
    ptPhuCount: number;
    bsGMCount: number;
    ktvGMCount: number;
    tdcCount: number;
    gvCount: number;
    packageCount: number;
    overtimeCount: number;
    dutyShiftCount: number;
    estimatedAllowance: number;
    byType: Record<string, number>;
  }

  const deptMap = new Map<string, string>();
  (ctx.config.staffList || []).forEach((s) => {
    deptMap.set(removeVietnameseTones(s.name), s.department || '');
  });

  const staffMap = new Map<string, StaffAgg>();
  const getOrCreate = (rawName: string): StaffAgg => {
    const key = removeVietnameseTones(rawName);
    let item = staffMap.get(key);
    if (!item) {
      item = {
        staffName: rawName.trim(),
        department: deptMap.get(key) || 'Chưa phân khoa',
        totalCases: 0,
        totalEquivalent: 0,
        ptChinhCount: 0,
        ptPhuCount: 0,
        bsGMCount: 0,
        ktvGMCount: 0,
        tdcCount: 0,
        gvCount: 0,
        packageCount: 0,
        overtimeCount: 0,
        dutyShiftCount: 0,
        estimatedAllowance: 0,
        byType: {},
      };
      staffMap.set(key, item);
    }
    return item;
  };

  // 1. Scan all surgery records
  records.forEach((r) => {
    const eq = typeof r.soLuong === 'number' ? r.soLuong : 1;
    const loai = (r.loaiPTTT || 'TKPL').trim();
    const allowanceRate = getAllowanceForRecord(
      loai,
      r.ngayBD,
      ctx.config.allowanceItems,
      ctx.config.priceConfig
    );

    const roleFields: Array<{
      field: string | undefined;
      roleKey: 'ptChinhCount' | 'ptPhuCount' | 'bsGMCount' | 'ktvGMCount' | 'tdcCount' | 'gvCount';
      allowanceUnit: number;
    }> = [
      { field: r.ptChinh, roleKey: 'ptChinhCount', allowanceUnit: allowanceRate['Chính'] || 0 },
      { field: r.ptPhu, roleKey: 'ptPhuCount', allowanceUnit: allowanceRate['Phụ'] || 0 },
      { field: r.bsGM, roleKey: 'bsGMCount', allowanceUnit: allowanceRate['Chính'] || 0 },
      { field: r.ktvGM, roleKey: 'ktvGMCount', allowanceUnit: allowanceRate['Phụ'] || 0 },
      { field: r.tdc, roleKey: 'tdcCount', allowanceUnit: allowanceRate['Phụ'] || 0 },
      { field: r.gv, roleKey: 'gvCount', allowanceUnit: allowanceRate['Giúp việc'] || 0 },
    ];

    const countedInThisSurgery = new Set<string>();

    roleFields.forEach(({ field, roleKey, allowanceUnit }) => {
      const names = splitStaffNames(field);
      names.forEach((n) => {
        const agg = getOrCreate(n);
        agg[roleKey] += 1;
        agg.estimatedAllowance += Math.round(allowanceUnit * eq);
        const normKey = removeVietnameseTones(n);
        if (!countedInThisSurgery.has(normKey)) {
          countedInThisSurgery.add(normKey);
          agg.totalCases += 1;
          agg.totalEquivalent = Math.round((agg.totalEquivalent + eq) * 100) / 100;
          agg.byType[loai] = (agg.byType[loai] || 0) + 1;
        }
      });
    });
  });

  // 2. Scan Service Package Assignments
  ctx.packageAssignments.forEach((pa) => {
    (pa.staffAssignments || []).forEach((sa) => {
      if (sa.staffName) {
        const agg = getOrCreate(sa.staffName);
        agg.packageCount += 1;
      }
    });
  });

  // 3. Scan Duty Schedules
  Object.values(ctx.dutySchedules || {}).forEach((ds) => {
    (ds.onCallStaff || []).forEach((name) => {
      if (name) {
        const agg = getOrCreate(name);
        agg.dutyShiftCount += 1;
      }
    });
  });

  // 4. Scan Overtime rows if applicable
  try {
    const hydratedForOt = records.map((r) => ensureHydratedSurgeryRecord(r));
    const overtimeRows = calculateOvertimeRows(
      hydratedForOt,
      ctx.dutySchedules || {},
      ctx.config.workingHours,
      true
    );
    overtimeRows.forEach((ot) => {
      const allOtNames = [
        ...splitStaffNames(ot.ptChinh),
        ...splitStaffNames(ot.ptPhu),
        ...splitStaffNames(ot.bsGM),
        ...splitStaffNames(ot.ktvGM),
        ...splitStaffNames(ot.tdc),
        ...splitStaffNames(ot.gv),
      ];
      new Set(allOtNames).forEach((n) => {
        const agg = getOrCreate(n);
        agg.overtimeCount += 1;
      });
    });
  } catch {
    // ignore overtime calc error on partial records
  }

  let rows = Array.from(staffMap.values()).sort((a, b) => b.totalCases - a.totalCases);

  if (targetStaffNames.length > 0) {
    const normTargets = targetStaffNames.map((t) => removeVietnameseTones(t));
    const filtered = rows.filter((r) => {
      const rNorm = removeVietnameseTones(r.staffName);
      return normTargets.some((t) => rNorm.includes(t) || t.includes(rNorm));
    });
    if (filtered.length > 0) {
      rows = filtered;
    } else {
      targetStaffNames.forEach((tName) => {
        rows.unshift({
          staffName: tName,
          department: 'Chưa phát sinh ca',
          totalCases: 0,
          totalEquivalent: 0,
          ptChinhCount: 0,
          ptPhuCount: 0,
          bsGMCount: 0,
          ktvGMCount: 0,
          tdcCount: 0,
          gvCount: 0,
          packageCount: 0,
          overtimeCount: 0,
          dutyShiftCount: 0,
          estimatedAllowance: 0,
          byType: {},
        });
      });
    }
  }

  const tableRows = rows.slice(0, 60).map((r, idx) => ({
    stt: idx + 1,
    staffName: r.staffName,
    department: r.department,
    totalCases: r.totalCases,
    totalEquivalent: r.totalEquivalent,
    ptChinhCount: r.ptChinhCount,
    ptPhuCount: r.ptPhuCount,
    bsGMCount: r.bsGMCount,
    ktvGMCount: r.ktvGMCount,
    tdcCount: r.tdcCount,
    gvCount: r.gvCount,
    packageCount: r.packageCount,
    dutyShiftCount: r.dutyShiftCount,
    overtimeCount: r.overtimeCount,
    estimatedAllowance: r.estimatedAllowance,
  }));

  const artifact: AIArtifact = {
    id: `staff_workload_${Date.now()}`,
    type: 'composite',
    title:
      targetStaffNames.length > 0
        ? `Thống kê Khối lượng Công việc Nhân sự: ${targetStaffNames.join(', ')}`
        : 'Thống kê Khối lượng Phẫu thuật & Trực theo Nhân viên Y tế',
    subtitle: `Phân tích liên kết: Ca PTTT (6 vị trí) + Gói dịch vụ yêu cầu + Lịch trực 24h + Ngoài giờ`,
    kpiCards: [
      { label: 'Số nhân sự phân tích', value: rows.length, tone: 'blue' },
      {
        label: 'Tổng lượt tham gia PTTT',
        value: rows.reduce((s, r) => s + r.totalCases, 0),
        tone: 'emerald',
      },
      {
        label: 'Tổng phụ cấp PTTT ước tính',
        value: `${rows.reduce((s, r) => s + r.estimatedAllowance, 0).toLocaleString('vi-VN')} đ`,
        tone: 'amber',
      },
    ],
    chartConfig: {
      chartType: 'bar',
      xAxisKey: 'staffName',
      xAxisLabel: 'Nhân viên y tế',
      enableBrush: tableRows.length > 10,
      stacked: true,
      series: [
        { key: 'ptChinhCount', name: 'PT Chính', color: '#0284c7', type: 'bar' },
        { key: 'ptPhuCount', name: 'PT Phụ', color: '#0d9488', type: 'bar' },
        { key: 'bsGMCount', name: 'BS Gây mê', color: '#f59e0b', type: 'bar' },
        { key: 'ktvGMCount', name: 'KTV GM', color: '#10b981', type: 'bar' },
        { key: 'tdcCount', name: 'Tít dụng cụ', color: '#ea580c', type: 'bar' },
        { key: 'gvCount', name: 'Giúp việc', color: '#64748b', type: 'bar' },
      ],
      data: tableRows.slice(0, 25),
    },
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'staffName', label: 'Họ và tên NV', align: 'left' },
        { key: 'department', label: 'Khoa', align: 'left' },
        { key: 'totalCases', label: 'Tổng số ca', align: 'right', format: 'number' },
        { key: 'totalEquivalent', label: 'SL Quy đổi', align: 'right', format: 'number' },
        { key: 'ptChinhCount', label: 'PT Chính', align: 'right', format: 'number' },
        { key: 'ptPhuCount', label: 'PT Phụ', align: 'right', format: 'number' },
        { key: 'bsGMCount', label: 'BS GM', align: 'right', format: 'number' },
        { key: 'ktvGMCount', label: 'KTV GM', align: 'right', format: 'number' },
        { key: 'tdcCount', label: 'TDC', align: 'right', format: 'number' },
        { key: 'gvCount', label: 'GV', align: 'right', format: 'number' },
        { key: 'packageCount', label: 'Ca Gói DV', align: 'right', format: 'number' },
        { key: 'dutyShiftCount', label: 'Buổi trực 24h', align: 'right', format: 'number' },
        { key: 'overtimeCount', label: 'Ca ngoài giờ', align: 'right', format: 'number' },
        { key: 'estimatedAllowance', label: 'Phụ cấp PTTT (đ)', align: 'right', format: 'currency' },
      ],
      rows: tableRows,
    },
    rawRecords: tableRows,
    createdAt: Date.now(),
  };

  const summaryText = `### Kết quả truy vấn Hoạt động Nhân sự:
${tableRows
  .slice(0, 15)
  .map(
    (r) =>
      `- **${r.staffName}** (${r.department}): Tổng **${r.totalCases} ca** (SL quy đổi: ${r.totalEquivalent}) — Gồm: PT Chính: **${r.ptChinhCount}**, PT Phụ: **${r.ptPhuCount}**, BS GM: **${r.bsGMCount}**, KTV GM: **${r.ktvGMCount}**, TDC: **${r.tdcCount}**, GV: **${r.gvCount}** | Gói DV yêu cầu: **${r.packageCount} ca** | Trực 24h: **${r.dutyShiftCount} buổi** | Ngoài giờ: **${r.overtimeCount} ca** | Phụ cấp ước tính: **${r.estimatedAllowance.toLocaleString('vi-VN')}đ**.`
  )
  .join('\n')}`;

  return { summaryText, artifact };
}

// ─── 4B. OVERTIME ANALYSIS TOOL (TAB NGOÀI GIỜ — BC HÀNG NGÀY & BC THÁNG) ────

export async function executeOvertimeAnalysisTool(
  ctx: AIDataContextInput,
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  queryText: string,
  logs: AIChatToolExecutionLog[]
): Promise<{
  summaryText: string;
  artifact?: AIArtifact;
  mergedSchedules: Record<string, DutyScheduleDateConfig>;
}> {
  const noTone = removeVietnameseTones(queryText);
  const hydratedRecords = records.map((r) => ensureHydratedSurgeryRecord(r));

  // Collect all surgery dateKeys AND their previous day (T-1) for 24h duty schedule shift resolution
  const neededDateKeys = new Set<string>();
  hydratedRecords.forEach((r) => {
    const iso = getRecordIsoDate(r);
    if (iso) {
      neededDateKeys.add(iso);
      const prev = getPreviousDayIso(iso);
      if (prev) neededDateKeys.add(prev);
    }
  });

  let mergedSchedules: Record<string, DutyScheduleDateConfig> = { ...(ctx.dutySchedules || {}) };
  const missingDateKeys = Array.from(neededDateKeys).filter((k) => !mergedSchedules[k]);
  if (missingDateKeys.length > 0) {
    try {
      const fetched = await dutyScheduleService.getDutySchedulesForDates(missingDateKeys);
      mergedSchedules = { ...mergedSchedules, ...fetched };
      if (Object.keys(fetched).length > 0) {
        logs.push({
          toolName: 'fetch_overtime_duty_schedules',
          summary: `Đã nạp lịch trực 24h cho ${Object.keys(fetched).length} ngày để đối chiếu tính Ngoài giờ`,
          recordCount: Object.keys(fetched).length,
          expandedFirestoreFetch: true,
        });
      }
    } catch {
      // ignore offline error
    }
  }

  let includeGV = false;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      includeGV = localStorage.getItem('sdp_overtime_include_gv') === 'true';
    }
  } catch {
    // ignore
  }
  if (/\b(giup viec|gv)\b/.test(noTone)) {
    includeGV = true;
  }

  const overtimeRows = calculateOvertimeRows(
    hydratedRecords,
    mergedSchedules,
    ctx.config.workingHours,
    includeGV
  );
  const groupedReport = groupOvertimeDataForReport(
    overtimeRows,
    ctx.config,
    'ALL',
    'ALL',
    includeGV
  );
  const deptBlocks = groupedReport.departmentBlocks || [];

  const totalOvertimeMinutes = overtimeRows.reduce(
    (sum, r) => sum + (r.durationMinutes || 0),
    0
  );
  const totalStaffCount = deptBlocks.reduce((sum, g) => sum + g.staffBlocks.length, 0);

  // Summarize active duty schedules on the surgery dates
  const surgeryDates = Array.from(
    new Set(hydratedRecords.map((r) => getRecordIsoDate(r)).filter(Boolean))
  ).sort();
  const dutySummaryLines = surgeryDates.slice(0, 10).map((d) => {
    const ds = mergedSchedules[d];
    const staffOnDuty =
      ds && Array.isArray(ds.onCallStaff) && ds.onCallStaff.length > 0
        ? ds.onCallStaff.join(', ')
        : 'Chưa khai báo danh sách trực';
    const isHol = ds?.isHoliday !== undefined ? ds.isHoliday : isWeekend(d);
    return `  + Ngày **${formatIsoToDMY(d)}** (${isHol ? 'Ngày nghỉ/Cuối tuần/Lễ' : 'Ngày làm việc hành chính'}): Tua trực 24h gồm: **${staffOnDuty}** *(Những nhân sự này đã trực 24h nên được loại trừ không chấm ngoài giờ)*.`;
  });

  // Staff-level breakdown (Who must clock overtime & from what time to what time)
  const staffBreakdownLines: string[] = [];
  deptBlocks.forEach((dept) => {
    dept.staffBlocks.forEach((st) => {
      const caseDetails = st.surgeries
        .map(
          (s) =>
            `KT: *"${s.surgeryName}"* (Ngày ${s.dateText}): **Chấm ngoài giờ từ \`${s.timeFromText}\` đến \`${s.timeToText}\`** (${s.durationMinutes} phút — ${s.durationText})`
        )
        .join('; ');
      staffBreakdownLines.push(
        `- **${st.staffName}** (Khoa: ${dept.deptFullName || dept.deptCode}): Tổng **${st.surgeries.length} ca ngoài giờ** — Tổng thời gian: **${st.totalMinutes} phút (${st.totalDurationText})**.\n  + Chi tiết: ${caseDetails}`
      );
    });
  });

  // Case-level breakdown
  const caseBreakdownLines = overtimeRows.map((row, idx) => {
    const rolesList = [
      row.ptChinh ? `PT Chính: **${row.ptChinh}**` : '',
      row.ptPhu ? `PT Phụ: **${row.ptPhu}**` : '',
      row.bsGM ? `BS Gây mê: **${row.bsGM}**` : '',
      row.ktvGM ? `KTV Gây mê: **${row.ktvGM}**` : '',
      row.tdc ? `Tít dụng cụ (TDC): **${row.tdc}**` : '',
      includeGV && row.gv ? `Giúp việc (GV): **${row.gv}**` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    return `  ${idx + 1}. BN **${row.patientName}** (Mã BN: \`${row.patientId || '—'}\`, Năm sinh: ${row.yob || '—'}) — KT: **"${row.tenKT}"** (${row.loaiPTTT || '—'})\n     - Giờ mổ thực tế: \`${row.ngayBD}\` → \`${row.ngayKT}\`\n     - **Khung giờ chấm ngoài giờ: Từ \`${row.timeFrom}\` đến \`${row.timeTo}\` (Tổng: ${row.durationText} = ${row.durationMinutes} phút)** — Phân loại: **${row.ghiChu}**\n     - **Nhân viên phải chấm ngoài giờ trong ca này:** ${rolesList || 'Không có'}`;
  });

  const tableRows = overtimeRows.map((row, idx) => ({
    stt: idx + 1,
    patientId: row.patientId,
    patientName: row.patientName,
    tenKT: row.tenKT,
    ngayBD: row.ngayBD,
    ngayKT: row.ngayKT,
    ptChinh: row.ptChinh || '—',
    ptPhu: row.ptPhu || '—',
    bsGM: row.bsGM || '—',
    ktvGM: row.ktvGM || '—',
    tdc: row.tdc || '—',
    timeFrom: row.timeFrom,
    timeTo: row.timeTo,
    durationText: row.durationText,
    durationMinutes: row.durationMinutes,
    ghiChu: row.ghiChu,
  }));

  const artifact: AIArtifact = {
    id: `overtime_analysis_${Date.now()}`,
    type: 'composite',
    title: 'Bảng Kê Chấm Ngoài Giờ Phẫu Thuật Thủ Thuật (Tab Ngoài Giờ)',
    subtitle: `Phát sinh ${overtimeRows.length} ca ngoài giờ / ${hydratedRecords.length} ca PTTT — ${totalStaffCount} nhân viên phải chấm ngoài giờ`,
    kpiCards: [
      { label: 'Tổng số ca PTTT kiểm tra', value: hydratedRecords.length, tone: 'slate' },
      { label: 'Số ca phát sinh ngoài giờ', value: overtimeRows.length, tone: 'blue' },
      { label: 'Số nhân viên chấm ngoài giờ', value: totalStaffCount, tone: 'emerald' },
      {
        label: 'Tổng thời lượng ca ngoài giờ',
        value: `${totalOvertimeMinutes} phút (${(totalOvertimeMinutes / 60).toFixed(2)}h)`,
        tone: 'amber',
      },
    ],
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'patientId', label: 'Mã BN', align: 'left' },
        { key: 'patientName', label: 'Họ tên BN', align: 'left' },
        { key: 'tenKT', label: 'Tên kỹ thuật PTTT', align: 'left' },
        { key: 'ngayBD', label: 'Bắt đầu mổ', align: 'center' },
        { key: 'ngayKT', label: 'Kết thúc mổ', align: 'center' },
        { key: 'ptChinh', label: 'PT Chính', align: 'left' },
        { key: 'ptPhu', label: 'PT Phụ', align: 'left' },
        { key: 'bsGM', label: 'BS GM', align: 'left' },
        { key: 'ktvGM', label: 'KTV GM', align: 'left' },
        { key: 'tdc', label: 'TDC', align: 'left' },
        { key: 'timeFrom', label: 'Chấm từ', align: 'center' },
        { key: 'timeTo', label: 'Chấm đến', align: 'center' },
        { key: 'durationText', label: 'Tổng TG', align: 'center' },
        { key: 'ghiChu', label: 'Ghi chú kíp', align: 'center' },
      ],
      rows: tableRows,
    },
    rawRecords: tableRows,
    createdAt: Date.now(),
  };

  const summaryText = `### Kết quả Tính toán Chấm Ngoài Giờ (Chuẩn logic Tab "Ngoài giờ" trên phần mềm):
- Tổng số ca PTTT trong danh sách kiểm tra: **${hydratedRecords.length} ca**.
- Số ca phát sinh làm thêm ngoài giờ: **${overtimeRows.length} ca** (Tổng thời lượng ca ngoài giờ: **${totalOvertimeMinutes} phút ≈ ${(totalOvertimeMinutes / 60).toFixed(2)} giờ**).
- Số nhân viên phải chấm ngoài giờ: **${totalStaffCount} nhân viên** (thuộc **${deptBlocks.length}** khoa/phòng; chế độ tính Giúp việc: **${includeGV ? 'Đang BẬT' : 'Đang TẮT - chỉ tính 5 vị trí chuyên môn'}**).
${dutySummaryLines.length > 0 ? `- Đối chiếu Lịch trực 24h:\n${dutySummaryLines.join('\n')}` : ''}

#### 1. Danh sách nhân viên phải chấm ngoài giờ (Ai chấm, từ giờ nào đến giờ nào):
${
  staffBreakdownLines.length === 0
    ? '- **Không có nhân viên nào phải chấm ngoài giờ** trong danh sách này (tất cả các ca mổ đều nằm trong giờ hành chính hoặc toàn bộ nhân sự tham gia đều thuộc tua trực 24h).'
    : staffBreakdownLines.join('\n')
}

#### 2. Chi tiết từng ca mổ phát sinh ngoài giờ:
${
  caseBreakdownLines.length === 0
    ? '  + Không có ca mổ nào phát sinh ngoài giờ.'
    : caseBreakdownLines.join('\n')
}`;

  return {
    summaryText,
    artifact,
    mergedSchedules,
  };
}

// ─── 4C. CONFLICT, VALIDATION & ALLOWANCE QUALITY TOOL ───────────────────────

export function executeConflictAndQualityTool(
  ctx: AIDataContextInput,
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  queryText: string
): {
  summaryText: string;
  artifact?: AIArtifact;
} {
  void queryText;
  const hydratedRecords = records.map((r) => ensureHydratedSurgeryRecord(r));
  const result = reprocessSurgicalRecords(hydratedRecords, ctx.config);
  const procRecords = result.records || [];

  const missingGvRecords = procRecords.filter((r) => !(r.gv || '').trim());
  const violateMinTimeRecords = procRecords.filter((r) => r.violateMinTime);
  const lowPaymentRecords = procRecords.filter(
    (r) => typeof r.paymentPercentage === 'number' && r.paymentPercentage < 100
  );

  const conflictRows: Array<Record<string, any>> = [];
  result.staffConflicts.forEach((sc, idx) => {
    conflictRows.push({
      stt: idx + 1,
      conflictType: `Trùng lịch NV (${sc.severity === 'high' ? 'Nghiêm trọng' : sc.severity === 'medium' ? 'Trung bình' : 'Thấp'})`,
      subject: sc.staffName,
      detail1: `BN ${sc.surgery1.patientName} (${sc.role1}) [${sc.surgery1.ngayBD} → ${sc.surgery1.ngayKT}]`,
      detail2: `BN ${sc.surgery2.patientName} (${sc.role2}) [${sc.surgery2.ngayBD} → ${sc.surgery2.ngayKT}]`,
      note: `Chồng lấn ${sc.overlapMinutes} phút`,
    });
  });

  result.machineConflicts.forEach((mc) => {
    conflictRows.push({
      stt: conflictRows.length + 1,
      conflictType: 'Trùng mã máy',
      subject: mc.machine,
      detail1: `BN ${mc.surgery1.patientName} [${mc.surgery1.ngayBD} → ${mc.surgery1.ngayKT}]`,
      detail2: `BN ${mc.surgery2.patientName} [${mc.surgery2.ngayBD} → ${mc.surgery2.ngayKT}]`,
      note: 'Sử dụng cùng máy cùng thời điểm',
    });
  });

  result.missingRecords.forEach((mr) => {
    conflictRows.push({
      stt: conflictRows.length + 1,
      conflictType: 'Thiếu mã máy',
      subject: `BN ${mr.patientName} (${mr.patientId})`,
      detail1: `${mr.tenKT} (${mr.loaiPTTT})`,
      detail2: `PT Chính: ${mr.ptChinh || '—'}`,
      note: `Ngày mổ: ${mr.ngayBD}`,
    });
  });

  const artifact: AIArtifact = {
    id: `conflict_quality_${Date.now()}`,
    type: 'composite',
    title: 'Kiểm định Xung đột Lịch mổ, Chất lượng Dữ liệu & Phụ cấp PTTT',
    subtitle: `Tổng hợp trên ${procRecords.length} ca PTTT — Tổng phụ cấp: ${Math.round(result.totalCost).toLocaleString('vi-VN')} VNĐ`,
    kpiCards: [
      { label: 'Trùng lịch nhân viên', value: result.staffConflicts.length, tone: 'rose' },
      { label: 'Trùng máy / Thiếu máy', value: `${result.machineConflicts.length} / ${result.missingRecords.length}`, tone: 'amber' },
      { label: 'Chưa GV / Lỗi TG tối thiểu', value: `${result.missingAssistantCount} / ${result.violateMinTimeCount}`, tone: 'blue' },
      { label: 'Tổng phụ cấp PTTT', value: `${Math.round(result.totalCost).toLocaleString('vi-VN')} đ`, tone: 'emerald' },
    ],
    tableConfig: {
      columns: [
        { key: 'stt', label: 'STT', align: 'center', format: 'number' },
        { key: 'conflictType', label: 'Loại cảnh báo', align: 'left' },
        { key: 'subject', label: 'Nhân viên / Máy / Bệnh nhân', align: 'left' },
        { key: 'detail1', label: 'Ca PTTT thứ 1 / Kỹ thuật', align: 'left' },
        { key: 'detail2', label: 'Ca PTTT thứ 2 / PTV', align: 'left' },
        { key: 'note', label: 'Chi tiết', align: 'left' },
      ],
      rows: conflictRows,
    },
    rawRecords: conflictRows,
    createdAt: Date.now(),
  };

  const summaryText = `### Kết quả Kiểm định Xung đột, Chất lượng Dữ liệu & Phụ cấp PTTT (${procRecords.length} ca):
- **Tổng kinh phí phụ cấp PTTT:** **${Math.round(result.totalCost).toLocaleString('vi-VN')} VNĐ**.
- **Trùng lịch nhân viên (\`Trùng NV\`):** **${result.staffConflicts.length} trường hợp**.
${result.staffConflicts
  .slice(0, 15)
  .map(
    (sc) =>
      `  + Nhân viên **${sc.staffName}** trùng **${sc.overlapMinutes} phút** (Mức độ: ${sc.severity}): Ca 1 BN **${sc.surgery1.patientName}** (${sc.role1}, ${sc.surgery1.ngayBD} → ${sc.surgery1.ngayKT}) ⋈ Ca 2 BN **${sc.surgery2.patientName}** (${sc.role2}, ${sc.surgery2.ngayBD} → ${sc.surgery2.ngayKT}).`
  )
  .join('\n')}
- **Trùng máy (\`Trùng máy\`):** **${result.machineConflicts.length} trường hợp**.
${result.machineConflicts
  .slice(0, 10)
  .map(
    (mc) =>
      `  + Máy **${mc.machine}**: Ca 1 BN **${mc.surgery1.patientName}** (${mc.surgery1.ngayBD} → ${mc.surgery1.ngayKT}) ⋈ Ca 2 BN **${mc.surgery2.patientName}** (${mc.surgery2.ngayBD} → ${mc.surgery2.ngayKT}).`
  )
  .join('\n')}
- **Ca mổ thiếu mã máy (\`Thiếu máy\`):** **${result.missingRecords.length} ca**${
    result.missingRecords.length > 0
      ? ` (${result.missingRecords
          .slice(0, 10)
          .map((r) => `BN ${r.patientName} - "${r.tenKT}"`)
          .join('; ')})`
      : ''
  }.
- **Ca mổ chưa có Giúp việc (\`Chưa GV\`):** **${result.missingAssistantCount} ca**${
    missingGvRecords.length > 0
      ? ` (${missingGvRecords
          .slice(0, 10)
          .map((r) => `BN ${r.patientName} - "${r.tenKT}"`)
          .join('; ')})`
      : ''
  }.
- **Ca mổ vi phạm thời gian tối thiểu (\`Lỗi TG\`):** **${result.violateMinTimeCount} ca**${
    violateMinTimeRecords.length > 0
      ? ` (${violateMinTimeRecords
          .slice(0, 10)
          .map((r) => `BN ${r.patientName} - ${r.timeMinutes} phút`)
          .join('; ')})`
      : ''
  }.
- **Ca mổ thanh toán phụ cấp dưới 100% (\`TT <100%\` — 50% hoặc 80%):** **${result.lowPaymentCount} ca**${
    lowPaymentRecords.length > 0
      ? ` (${lowPaymentRecords
          .slice(0, 10)
          .map((r) => `BN ${r.patientName} - "${r.tenKT}": ${r.paymentPercentage}%`)
          .join('; ')})`
      : ''
  }.`;

  return { summaryText, artifact };
}

/**
 * Khi danh sách ca mổ đang xét nhỏ gọn (<= 60 ca, ví dụ BC Hàng ngày),
 * cung cấp trực tiếp bảng chi tiết từng ca mổ để AI nắm 100% dữ liệu trên bảng.
 */
export function buildDirectTableSnapshotForLLM(
  records: Array<SurgeryRecord | PersistedSurgeryRecord>
): string {
  if (records.length === 0 || records.length > 60) return '';
  const hydrated = records.map((r) => ensureHydratedSurgeryRecord(r));
  const lines = hydrated.map((r, idx) => {
    const team = [
      r.ptChinh ? `PT Chính: ${r.ptChinh}` : '',
      r.ptPhu ? `PT Phụ: ${r.ptPhu}` : '',
      r.bsGM ? `BS GM: ${r.bsGM}` : '',
      r.ktvGM ? `KTV GM: ${r.ktvGM}` : '',
      r.tdc ? `TDC: ${r.tdc}` : '',
      r.gv ? `GV: ${r.gv}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    return `${idx + 1}. Mã BN: \`${r.patientId || '—'}\` | Họ tên: **${r.patientName || '—'}** (${r.gender || '—'}, ${r.yob || '—'}) | Bắt đầu: \`${r.ngayBD || '—'}\` → Kết thúc: \`${r.ngayKT || '—'}\` (${r.timeMinutes || 0} phút) | Kỹ thuật: **"${r.tenKT || '—'}"** (Loại: ${r.loaiPTTT || '—'}, SL: ${r.soLuong ?? 1}) | Kíp mổ: [${team}] | Máy: ${r.machineCode || r.machine || '—'} | Viện phí: ${(Number(r.thanhTien) || 0).toLocaleString('vi-VN')}đ`;
  });

  return `### Danh sách Chi tiết ${hydrated.length} Ca PTTT Trực tiếp trên Bảng:\n${lines.join('\n')}`;
}

// ─── 5. MULTI-DIMENSIONAL & PERIOD COMPARISON ANALYTICS ENGINE ──────────────

/**
 * Phân tích thống kê & so sánh chuyên khoa chuẩn xác:
 * - Mặc định tập trung vào: Tổng số lượng (SL quy đổi & Số ca thực tế), Chênh lệch tăng/giảm so với cùng kỳ,
 *   Doanh thu viện phí, Cơ cấu Loại PTTT (PĐB, P1, P2, P3, Thủ thuật), Xu hướng theo Tháng và Chi tiết từng Kỹ thuật PTTT.
 * - CHỈ phân tích theo Mùa (Mùa Hè / Mùa Đông) hoặc Phẫu thuật viên chính khi câu hỏi của người dùng có yêu cầu.
 */
export function executeMultiDimensionalPivotTool(
  ctx: AIDataContextInput,
  records: Array<SurgeryRecord | PersistedSurgeryRecord>,
  queryText: string
): {
  summaryText: string;
  artifacts: AIArtifact[];
} {
  const noTone = removeVietnameseTones(queryText);
  const { months, years } = extractTimeConstraintsFromPrompt(queryText);

  const asksSeason = /\b(mua he|mua ha|mua dong|theo mua|cac mua|mua khac nhau|giua cac mua)\b/.test(
    noTone
  );
  const asksSurgeon =
    /\b(bac si|bs|ptv|phau thuat vien|theo bac si|tung bac si|kip mo)\b/.test(noTone);

  const overrides = getSpecialtyOverrides();
  const allSpecs = getAllSpecialties();
  const staffList = ctx.config.staffList || [];

  // 1. Identify target specialty or clinical sub-domain using the app's official classifySpecialty
  let targetSpecialtyCode: string | null = null;
  let subDomainKey: string | null = null;
  let customLabel = 'Tất cả Chuyên khoa Phẫu thuật / Thủ thuật';

  // Check custom specialties first
  for (const sp of allSpecs) {
    if (sp.isCustom) {
      const spNorm = removeVietnameseTones(sp.name);
      const spShort = removeVietnameseTones(sp.shortName || '');
      if ((spNorm && noTone.includes(spNorm)) || (spShort && noTone.includes(spShort))) {
        targetSpecialtyCode = sp.code;
        customLabel = `Chuyên khoa ${sp.name}`;
        break;
      }
    }
  }

  if (!targetSpecialtyCode) {
    if (noTone.includes('noi soi') && noTone.includes('tieu hoa')) {
      targetSpecialtyCode = 'ngoai_th';
      subDomainKey = 'noi_soi_tieu_hoa';
      customLabel = CLINICAL_DOMAIN_TAXONOMY.noi_soi_tieu_hoa.label;
    } else if (
      noTone.includes('chan thuong') ||
      noTone.includes('chinh hinh') ||
      /\bctch\b/.test(noTone) ||
      noTone.includes('ket hop xuong')
    ) {
      targetSpecialtyCode = 'ctch';
      customLabel = 'Chuyên khoa Chấn thương chỉnh hình (CTCH)';
    } else if (
      noTone.includes('san khoa') ||
      noTone.includes('phu san') ||
      noTone.includes('lay thai') ||
      /\bsan\b/.test(noTone)
    ) {
      targetSpecialtyCode = 'phu_san';
      customLabel = 'Chuyên khoa Phụ sản';
    } else if (noTone.includes('tai mui hong') || /\btmh\b/.test(noTone) || noTone.includes('amidan')) {
      targetSpecialtyCode = 'tmh';
      customLabel = 'Chuyên khoa Tai Mũi Họng (TMH)';
    } else if (
      noTone.includes('nhan khoa') ||
      noTone.includes('phaco') ||
      noTone.includes('thuy tinh the') ||
      /\bkhoa mat\b/.test(noTone) ||
      /\bchuyen khoa mat\b/.test(noTone) ||
      /\bphau thuat mat\b/.test(noTone)
    ) {
      targetSpecialtyCode = 'mat';
      customLabel = 'Chuyên khoa Mắt';
    } else if (noTone.includes('ngoai tong hop') || noTone.includes('ngoai th')) {
      targetSpecialtyCode = 'ngoai_th';
      customLabel = 'Chuyên khoa Ngoại tổng hợp';
    } else if (noTone.includes('tieu hoa')) {
      targetSpecialtyCode = 'ngoai_th';
      subDomainKey = 'tieu_hoa';
      customLabel = CLINICAL_DOMAIN_TAXONOMY.tieu_hoa.label;
    } else if (noTone.includes('tiet nieu') || noTone.includes('tan soi')) {
      targetSpecialtyCode = 'ngoai_th';
      subDomainKey = 'tiet_nieu';
      customLabel = CLINICAL_DOMAIN_TAXONOMY.tiet_nieu.label;
    }
  }

  const asksEndoscopicOnly = noTone.includes('noi soi') && !targetSpecialtyCode && !subDomainKey;
  if (asksEndoscopicOnly) {
    customLabel = 'Phẫu thuật / Thủ thuật Nội soi';
  }

  // Filter records using official classifySpecialty from specialtyComparisonService.ts
  const matchedRecords = records.filter((r) => {
    if (!r.tenKT) return false;
    const tenNorm = removeVietnameseTones(r.tenKT || '');
    const recordSpec = classifySpecialty(r.tenKT, r.ptChinh, staffList, overrides);

    if (targetSpecialtyCode && recordSpec !== targetSpecialtyCode) {
      return false;
    }

    if (subDomainKey) {
      const rule = CLINICAL_DOMAIN_TAXONOMY[subDomainKey];
      if (
        rule.mustContainAny &&
        !rule.mustContainAny.some((kw) => tenNorm.includes(removeVietnameseTones(kw)))
      ) {
        return false;
      }
      const matchesOrgan = rule.organKeywords.some((kw) =>
        tenNorm.includes(removeVietnameseTones(kw))
      );
      return matchesOrgan;
    }

    if (asksEndoscopicOnly) {
      return tenNorm.includes('noi soi');
    }

    return true;
  });

  // Helper to get record quantity & revenue consistently with SpecialtyComparisonTab & StatisticsTab
  const getRecQty = (r: SurgeryRecord | PersistedSurgeryRecord) =>
    typeof r.soLuong === 'number' && r.soLuong > 0 ? r.soLuong : 1;

  const getRecRev = (r: SurgeryRecord | PersistedSurgeryRecord) => {
    const qty = getRecQty(r);
    if (r.thanhTien != null && !isNaN(Number(r.thanhTien))) {
      return Number(r.thanhTien);
    }
    if (r.donGia != null && !isNaN(Number(r.donGia))) {
      return Number(r.donGia) * qty;
    }
    return 0;
  };

  // ── MODE A: SO SÁNH GIỮA 2 NĂM / CÙNG KỲ (khi có >= 2 năm và không yêu cầu phân tích theo Mùa/Bác sĩ) ──
  const distinctYearsInRecords = Array.from(
    new Set(
      matchedRecords
        .map((r) => {
          const iso = getRecordIsoDate(r);
          return iso.length >= 4 ? parseInt(iso.substring(0, 4), 10) : NaN;
        })
        .filter((y) => !isNaN(y))
    )
  ).sort((a, b) => a - b);

  const effectiveYears = years.length >= 2 ? years : distinctYearsInRecords;
  const isComparisonIntent =
    /\b(so sanh|so voi|cung ky|tang giam|bien dong|chenh lech)\b/.test(noTone) ||
    years.length >= 2;

  if (effectiveYears.length >= 2 && isComparisonIntent && !asksSeason && !asksSurgeon) {
    const primaryYear = effectiveYears[effectiveYears.length - 1];
    const compareYear = effectiveYears[effectiveYears.length - 2];
    const activeMonths =
      months.length > 0 ? months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const periodRangeText =
      activeMonths.length === 12
        ? 'Cả năm (T1–T12)'
        : activeMonths.length === 1
        ? `Tháng ${activeMonths[0]}`
        : `T${activeMonths[0]}–T${activeMonths[activeMonths.length - 1]} (${activeMonths.length} tháng)`;

    const primaryLabel = `${periodRangeText}/${primaryYear}`;
    const compareLabel = `${periodRangeText}/${compareYear}`;

    let curCases = 0;
    let cmpCases = 0;
    let curQty = 0;
    let cmpQty = 0;
    let curRev = 0;
    let cmpRev = 0;

    // Month-by-month comparison table (T1..T9 or T1..T12)
    const monthCompMap = new Map<
      number,
      {
        month: number;
        monthLabel: string;
        curQty: number;
        cmpQty: number;
        curCases: number;
        cmpCases: number;
        curRev: number;
        cmpRev: number;
      }
    >();
    activeMonths.forEach((m) => {
      monthCompMap.set(m, {
        month: m,
        monthLabel: `Tháng ${m}`,
        curQty: 0,
        cmpQty: 0,
        curCases: 0,
        cmpCases: 0,
        curRev: 0,
        cmpRev: 0,
      });
    });

    // Loai PTTT comparison
    const loaiOrder = ['PĐB', 'P1', 'P2', 'P3', 'Thủ thuật'];
    const loaiCompMap = new Map<string, { curQty: number; cmpQty: number; curRev: number; cmpRev: number }>();
    loaiOrder.forEach((l) => loaiCompMap.set(l, { curQty: 0, cmpQty: 0, curRev: 0, cmpRev: 0 }));

    // Procedure-level comparison (matching SpecialtyComparisonTab grouping logic)
    interface ProcCompItem {
      tenKT: string;
      maTuongDuong: string;
      loaiPTTT: string;
      curQty: number;
      cmpQty: number;
      curRev: number;
      cmpRev: number;
    }
    const procMap = new Map<string, ProcCompItem>();

    matchedRecords.forEach((r) => {
      const iso = getRecordIsoDate(r);
      if (!iso || iso.length < 7) return;
      const y = parseInt(iso.substring(0, 4), 10);
      const m = parseInt(iso.substring(5, 7), 10);
      if (!activeMonths.includes(m)) return;
      if (y !== primaryYear && y !== compareYear) return;

      const qty = getRecQty(r);
      const rev = getRecRev(r);
      const isPrimary = y === primaryYear;

      if (isPrimary) {
        curCases += 1;
        curQty = Math.round((curQty + qty) * 100) / 100;
        curRev += rev;
      } else {
        cmpCases += 1;
        cmpQty = Math.round((cmpQty + qty) * 100) / 100;
        cmpRev += rev;
      }

      const mItem = monthCompMap.get(m);
      if (mItem) {
        if (isPrimary) {
          mItem.curCases += 1;
          mItem.curQty = Math.round((mItem.curQty + qty) * 100) / 100;
          mItem.curRev += rev;
        } else {
          mItem.cmpCases += 1;
          mItem.cmpQty = Math.round((mItem.cmpQty + qty) * 100) / 100;
          mItem.cmpRev += rev;
        }
      }

      const rawLoai = (r.loaiPTTT || '').toUpperCase().trim();
      const loaiGroup =
        rawLoai === 'PĐB' || rawLoai === 'PDB'
          ? 'PĐB'
          : rawLoai === 'P1'
          ? 'P1'
          : rawLoai === 'P2'
          ? 'P2'
          : rawLoai === 'P3'
          ? 'P3'
          : 'Thủ thuật';
      const lItem = loaiCompMap.get(loaiGroup)!;
      if (isPrimary) {
        lItem.curQty = Math.round((lItem.curQty + qty) * 100) / 100;
        lItem.curRev += rev;
      } else {
        lItem.cmpQty = Math.round((lItem.cmpQty + qty) * 100) / 100;
        lItem.cmpRev += rev;
      }

      // Procedure grouping key (same as SpecialtyComparisonTab)
      const rawMTD = (r.maTuongDuong || '').trim();
      const isGT = isRecordGayTe(r.maTuongDuong, r.tenKT);
      const baseMTD = rawMTD.toUpperCase().replace(/\s+/g, '').replace(/_GT$/i, '');
      const method = isGT ? 'GT' : 'GM';
      const normName = (r.tenKT || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const procKey = baseMTD ? `MTD_${baseMTD}:::${method}` : `NAME_${normName}:::${method}`;
      const displayMTD = baseMTD ? (isGT ? `${baseMTD}_GT` : baseMTD) : '';

      const pItem = procMap.get(procKey) || {
        tenKT: (r.tenKT || '').trim(),
        maTuongDuong: displayMTD,
        loaiPTTT: rawLoai || 'PTTT',
        curQty: 0,
        cmpQty: 0,
        curRev: 0,
        cmpRev: 0,
      };
      if (isPrimary) {
        pItem.curQty = Math.round((pItem.curQty + qty) * 100) / 100;
        pItem.curRev += rev;
      } else {
        pItem.cmpQty = Math.round((pItem.cmpQty + qty) * 100) / 100;
        pItem.cmpRev += rev;
      }
      procMap.set(procKey, pItem);
    });

    const diffQty = Math.round((curQty - cmpQty) * 100) / 100;
    const pctQty = cmpQty > 0 ? ((curQty - cmpQty) / cmpQty) * 100 : null;
    const diffCases = curCases - cmpCases;
    const pctCases = cmpCases > 0 ? ((curCases - cmpCases) / cmpCases) * 100 : null;
    const diffRev = curRev - cmpRev;
    const pctRev = cmpRev > 0 ? ((curRev - cmpRev) / cmpRev) * 100 : null;

    const monthCompRows = Array.from(monthCompMap.values()).map((m, idx) => {
      const mDiff = Math.round((m.curQty - m.cmpQty) * 100) / 100;
      const mPct =
        m.cmpQty > 0 ? `${(((m.curQty - m.cmpQty) / m.cmpQty) * 100).toFixed(1)}%` : m.curQty > 0 ? 'Mới' : '0%';
      return {
        stt: idx + 1,
        monthLabel: m.monthLabel,
        curQty: m.curQty,
        cmpQty: m.cmpQty,
        diffQty: mDiff,
        changePct: mPct,
        curRev: m.curRev,
        cmpRev: m.cmpRev,
        diffRev: m.curRev - m.cmpRev,
      };
    });

    const procCompRows = Array.from(procMap.values())
      .sort((a, b) => b.curQty + b.cmpQty - (a.curQty + a.cmpQty))
      .map((p, idx) => {
        const dQty = Math.round((p.curQty - p.cmpQty) * 100) / 100;
        const pPctNum = p.cmpQty > 0 ? ((p.curQty - p.cmpQty) / p.cmpQty) * 100 : null;
        let status = 'ỔN ĐỊNH';
        if (p.curQty === 0 && p.cmpQty > 0) status = 'CẢNH BÁO (Ngừng phát sinh)';
        else if (p.curQty > 0 && p.cmpQty === 0) status = 'TÍCH CỰC (Mới phát sinh)';
        else if (pPctNum !== null && pPctNum <= -10) status = 'CẢNH BÁO (Giảm)';
        else if (pPctNum !== null && pPctNum >= 5) status = 'TÍCH CỰC (Tăng)';

        return {
          stt: idx + 1,
          maTuongDuong: p.maTuongDuong || '—',
          tenKT: p.tenKT,
          loaiPTTT: p.loaiPTTT,
          curQty: p.curQty,
          cmpQty: p.cmpQty,
          diffQty: dQty,
          changePct: pPctNum !== null ? `${pPctNum >= 0 ? '+' : ''}${pPctNum.toFixed(1)}%` : p.curQty > 0 ? 'Mới' : '0%',
          curRev: p.curRev,
          cmpRev: p.cmpRev,
          status,
        };
      });

    const artifacts: AIArtifact[] = [];

    // Artifact 1: Monthly Year-over-Year Comparison Chart & Table
    artifacts.push({
      id: `comp_monthly_${Date.now()}`,
      type: 'composite',
      title: `So sánh theo Tháng: ${customLabel} (${primaryLabel} so với ${compareLabel})`,
      subtitle: `Năm ${primaryYear}: ${curQty.toLocaleString('vi-VN')} ca (${curRev.toLocaleString('vi-VN')}đ) | Năm ${compareYear}: ${cmpQty.toLocaleString('vi-VN')} ca (${cmpRev.toLocaleString('vi-VN')}đ)`,
      querySummary: `So sánh chuẩn chuyên khoa: ${primaryLabel} vs ${compareLabel}`,
      kpiCards: [
        {
          label: `Số lượng ${primaryLabel}`,
          value: `${curQty.toLocaleString('vi-VN')} ca`,
          tone: 'blue',
        },
        {
          label: `Cùng kỳ ${compareLabel}`,
          value: `${cmpQty.toLocaleString('vi-VN')} ca`,
          tone: 'slate',
        },
        {
          label: `Chênh lệch số lượng`,
          value: `${diffQty >= 0 ? '+' : ''}${diffQty.toLocaleString('vi-VN')} ca (${
            pctQty !== null ? `${pctQty >= 0 ? '+' : ''}${pctQty.toFixed(1)}%` : '—'
          })`,
          tone: diffQty >= 0 ? 'emerald' : 'amber',
        },
        {
          label: `Doanh thu ${primaryLabel}`,
          value: `${curRev.toLocaleString('vi-VN')} đ (${
            pctRev !== null ? `${pctRev >= 0 ? '+' : ''}${pctRev.toFixed(1)}%` : '—'
          })`,
          tone: diffRev >= 0 ? 'emerald' : 'amber',
        },
      ],
      chartConfig: {
        chartType: 'composed',
        xAxisKey: 'monthLabel',
        xAxisLabel: `Tháng (${periodRangeText})`,
        enableBrush: monthCompRows.length > 6,
        stacked: false,
        series: [
          { key: 'curQty', name: `Số lượng năm ${primaryYear}`, color: '#0284c7', type: 'bar' },
          { key: 'cmpQty', name: `Số lượng năm ${compareYear}`, color: '#94a3b8', type: 'bar' },
          { key: 'diffQty', name: 'Chênh lệch (± ca)', color: '#10b981', type: 'line' },
        ],
        data: monthCompRows,
      },
      tableConfig: {
        columns: [
          { key: 'stt', label: 'STT', align: 'center', format: 'number' },
          { key: 'monthLabel', label: 'Tháng', align: 'center' },
          { key: 'curQty', label: `SL Năm ${primaryYear}`, align: 'right', format: 'number' },
          { key: 'cmpQty', label: `SL Năm ${compareYear}`, align: 'right', format: 'number' },
          { key: 'diffQty', label: 'Chênh lệch (±)', align: 'right', format: 'number' },
          { key: 'changePct', label: 'Tỷ lệ (%)', align: 'right' },
          { key: 'curRev', label: `Doanh thu ${primaryYear} (đ)`, align: 'right', format: 'currency' },
          { key: 'cmpRev', label: `Doanh thu ${compareYear} (đ)`, align: 'right', format: 'currency' },
        ],
        rows: monthCompRows,
      },
      rawRecords: monthCompRows,
      createdAt: Date.now(),
    });

    // Artifact 2: Procedure-by-Procedure Comparison Table & Chart
    if (procCompRows.length > 0) {
      artifacts.push({
        id: `comp_procedures_${Date.now() + 1}`,
        type: 'composite',
        title: `Chi tiết Kỹ thuật PTTT: ${customLabel} (${primaryLabel} vs ${compareLabel})`,
        subtitle: `Tổng số ${procCompRows.length} nhóm kỹ thuật phát sinh — Đối chiếu số lượng, chênh lệch và doanh thu`,
        chartConfig: {
          chartType: 'bar',
          xAxisKey: 'tenKT',
          xAxisLabel: 'Tên kỹ thuật PTTT',
          enableBrush: procCompRows.length > 8,
          stacked: false,
          series: [
            { key: 'curQty', name: `Kỳ ${primaryYear}`, color: '#0284c7', type: 'bar' },
            { key: 'cmpQty', name: `Cùng kỳ ${compareYear}`, color: '#94a3b8', type: 'bar' },
          ],
          data: procCompRows.slice(0, 20),
        },
        tableConfig: {
          columns: [
            { key: 'stt', label: 'STT', align: 'center', format: 'number' },
            { key: 'maTuongDuong', label: 'Mã TĐ', align: 'center' },
            { key: 'tenKT', label: 'Tên kỹ thuật PTTT', align: 'left' },
            { key: 'loaiPTTT', label: 'Loại', align: 'center' },
            { key: 'curQty', label: `Kỳ ${primaryYear}`, align: 'right', format: 'number' },
            { key: 'cmpQty', label: `Cùng kỳ ${compareYear}`, align: 'right', format: 'number' },
            { key: 'diffQty', label: 'Chênh lệch (±)', align: 'right', format: 'number' },
            { key: 'changePct', label: 'Tăng/Giảm (%)', align: 'right' },
            { key: 'curRev', label: `Doanh thu ${primaryYear} (đ)`, align: 'right', format: 'currency' },
            { key: 'cmpRev', label: `Doanh thu ${compareYear} (đ)`, align: 'right', format: 'currency' },
            { key: 'status', label: 'Đánh giá', align: 'center' },
          ],
          rows: procCompRows,
        },
        rawRecords: procCompRows,
        createdAt: Date.now() + 1,
      });
    }

    const loaiLines = Array.from(loaiCompMap.entries())
      .filter(([, v]) => v.curQty > 0 || v.cmpQty > 0)
      .map(([loai, v]) => {
        const d = Math.round((v.curQty - v.cmpQty) * 100) / 100;
        const pct = v.cmpQty > 0 ? `${(((v.curQty - v.cmpQty) / v.cmpQty) * 100).toFixed(1)}%` : v.curQty > 0 ? 'Mới' : '0%';
        return `  + **${loai}**: Kỳ ${primaryYear} đạt **${v.curQty} ca** (${v.curRev.toLocaleString('vi-VN')}đ) vs Cùng kỳ ${compareYear} đạt **${v.cmpQty} ca** (${v.cmpRev.toLocaleString('vi-VN')}đ) → Chênh lệch: **${d >= 0 ? '+' : ''}${d} ca (${pct})**`;
      })
      .join('\n');

    const topPositive = procCompRows
      .filter((p) => p.diffQty > 0)
      .sort((a, b) => b.diffQty - a.diffQty)
      .slice(0, 8);
    const topAlert = procCompRows
      .filter((p) => p.diffQty < 0)
      .sort((a, b) => a.diffQty - b.diffQty)
      .slice(0, 8);

    const summaryText = `### Kết quả Phân tích So sánh ${customLabel} (${primaryLabel} so với ${compareLabel}):
- **Tổng quan Số lượng PTTT**:
  + **Kỳ ${primaryLabel}**: **${curQty.toLocaleString('vi-VN')} ca quy đổi** (${curCases.toLocaleString('vi-VN')} lượt hồ sơ ca mổ) — Doanh thu viện phí: **${curRev.toLocaleString('vi-VN')} VNĐ**.
  + **Cùng kỳ ${compareLabel}**: **${cmpQty.toLocaleString('vi-VN')} ca quy đổi** (${cmpCases.toLocaleString('vi-VN')} lượt hồ sơ ca mổ) — Doanh thu viện phí: **${cmpRev.toLocaleString('vi-VN')} VNĐ**.
  + **Chênh lệch Số lượng**: **${diffQty >= 0 ? '+' : ''}${diffQty.toLocaleString('vi-VN')} ca quy đổi** (${pctQty !== null ? `${pctQty >= 0 ? '+' : ''}${pctQty.toFixed(2)}%` : 'N/A'}) | Chênh lệch lượt hồ sơ: **${diffCases >= 0 ? '+' : ''}${diffCases} ca** (${pctCases !== null ? `${pctCases >= 0 ? '+' : ''}${pctCases.toFixed(2)}%` : 'N/A'}).
  + **Chênh lệch Doanh thu viện phí**: **${diffRev >= 0 ? '+' : ''}${diffRev.toLocaleString('vi-VN')} VNĐ** (${pctRev !== null ? `${pctRev >= 0 ? '+' : ''}${pctRev.toFixed(2)}%` : 'N/A'}).

- **So sánh theo Phân loại PTTT (${primaryLabel} vs ${compareLabel})**:
${loaiLines || '  + Chưa có dữ liệu phân loại'}

- **So sánh biến động theo từng Tháng (${periodRangeText})**:
${monthCompRows
  .map(
    (m) =>
      `  + **${m.monthLabel}**: Năm ${primaryYear} đạt **${m.curQty} ca** (${m.curRev.toLocaleString('vi-VN')}đ) | Năm ${compareYear} đạt **${m.cmpQty} ca** (${m.cmpRev.toLocaleString('vi-VN')}đ) → Chênh lệch: **${m.diffQty >= 0 ? '+' : ''}${m.diffQty} ca (${m.changePct})**`
  )
  .join('\n')}

- **Top Kỹ thuật PTTT tăng trưởng mạnh nhất (TÍCH CỰC)**:
${
  topPositive.length > 0
    ? topPositive
        .map(
          (p) =>
            `  + **${p.tenKT}** (${p.maTuongDuong}): Kỳ ${primaryYear} **${p.curQty} ca** vs Cùng kỳ ${compareYear} **${p.cmpQty} ca** → Tăng **+${p.diffQty} ca (${p.changePct})**`
        )
        .join('\n')
    : '  + Không có kỹ thuật tăng trưởng dương'
}

- **Top Kỹ thuật PTTT sụt giảm cần lưu ý (CẢNH BÁO)**:
${
  topAlert.length > 0
    ? topAlert
        .map(
          (p) =>
            `  + **${p.tenKT}** (${p.maTuongDuong}): Kỳ ${primaryYear} **${p.curQty} ca** vs Cùng kỳ ${compareYear} **${p.cmpQty} ca** → Giảm **${p.diffQty} ca (${p.changePct})**`
        )
        .join('\n')
    : '  + Không có kỹ thuật sụt giảm'
}`;

    return { summaryText, artifacts };
  }

  // ── MODE B: PHÂN TÍCH TỔNG HỢP CHUNG (1 KỲ) HOẶC PHÂN TÍCH THEO MÙA / BÁC SĨ KHI ĐƯỢC HỎI ──
  const staffDeptMap = new Map<string, string>();
  staffList.forEach((s) => {
    staffDeptMap.set(removeVietnameseTones(s.name), s.department || '');
  });

  const pkgSet = new Set<string>();
  ctx.packageAssignments.forEach((pa) => {
    if (pa.compositeKey) pkgSet.add(pa.compositeKey);
  });

  const byMonthMap = new Map<
    string,
    {
      monthKey: string;
      season: 'Mùa Hè' | 'Mùa Đông';
      totalCases: number;
      summerCases: number;
      winterCases: number;
      equivalentCases: number;
      revenue: number;
      packageCases: number;
      uniqueSurgeons: Set<string>;
    }
  >();

  const bySurgeonMap = new Map<
    string,
    {
      surgeon: string;
      department: string;
      totalCases: number;
      summerCases: number;
      winterCases: number;
      equivalentCases: number;
      revenue: number;
      packageCases: number;
      monthsActive: Set<string>;
      topProcedures: Map<string, number>;
    }
  >();

  const byProcedureMap = new Map<
    string,
    {
      tenKT: string;
      maTuongDuong: string;
      loaiPTTT: string;
      totalCases: number;
      equivalentCases: number;
      revenue: number;
    }
  >();

  let totalSummerCases = 0;
  let totalWinterCases = 0;
  let totalEquivalentCases = 0;
  let totalRevenue = 0;

  matchedRecords.forEach((r) => {
    const isoDate = getRecordIsoDate(r);
    const ym = isoDate ? isoDate.substring(0, 7) : 'Chưa rõ ngày';
    const season = determineSeason(isoDate, ctx.config.workingHours);
    const eq = getRecQty(r);
    const rev = getRecRev(r);
    const compKey = buildCompositeKey(r.patientId || '', isoDate, r.tenKT || '');
    const hasPkg = pkgSet.has(compKey) ? 1 : 0;

    if (season === 'Mùa Hè') totalSummerCases += 1;
    else totalWinterCases += 1;
    totalEquivalentCases = Math.round((totalEquivalentCases + eq) * 100) / 100;
    totalRevenue += rev;

    const mEntry = byMonthMap.get(ym) || {
      monthKey: ym,
      season,
      totalCases: 0,
      summerCases: 0,
      winterCases: 0,
      equivalentCases: 0,
      revenue: 0,
      packageCases: 0,
      uniqueSurgeons: new Set<string>(),
    };
    mEntry.totalCases += 1;
    if (season === 'Mùa Hè') mEntry.summerCases += 1;
    else mEntry.winterCases += 1;
    mEntry.equivalentCases = Math.round((mEntry.equivalentCases + eq) * 100) / 100;
    mEntry.revenue += rev;
    mEntry.packageCases += hasPkg;

    const ktName = (r.tenKT || '').trim();
    if (ktName) {
      const pKey = ktName.toLowerCase();
      const pEntry = byProcedureMap.get(pKey) || {
        tenKT: ktName,
        maTuongDuong: (r.maTuongDuong || '').trim() || '—',
        loaiPTTT: (r.loaiPTTT || '').trim() || 'PTTT',
        totalCases: 0,
        equivalentCases: 0,
        revenue: 0,
      };
      pEntry.totalCases += 1;
      pEntry.equivalentCases = Math.round((pEntry.equivalentCases + eq) * 100) / 100;
      pEntry.revenue += rev;
      byProcedureMap.set(pKey, pEntry);
    }

    const surgeons = splitStaffNames(r.ptChinh);
    const effectiveSurgeons = surgeons.length > 0 ? surgeons : ['Chưa ghi PTV chính'];
    effectiveSurgeons.forEach((sName) => {
      mEntry.uniqueSurgeons.add(sName);
      const sKey = removeVietnameseTones(sName);
      const sEntry = bySurgeonMap.get(sKey) || {
        surgeon: sName,
        department: staffDeptMap.get(sKey) || 'Khoa Ngoại / Chuyên khoa',
        totalCases: 0,
        summerCases: 0,
        winterCases: 0,
        equivalentCases: 0,
        revenue: 0,
        packageCases: 0,
        monthsActive: new Set<string>(),
        topProcedures: new Map<string, number>(),
      };
      sEntry.totalCases += 1;
      if (season === 'Mùa Hè') sEntry.summerCases += 1;
      else sEntry.winterCases += 1;
      sEntry.equivalentCases = Math.round((sEntry.equivalentCases + eq) * 100) / 100;
      sEntry.revenue += rev;
      sEntry.packageCases += hasPkg;
      sEntry.monthsActive.add(ym);
      if (ktName) {
        sEntry.topProcedures.set(ktName, (sEntry.topProcedures.get(ktName) || 0) + 1);
      }
      bySurgeonMap.set(sKey, sEntry);
    });

    byMonthMap.set(ym, mEntry);
  });

  const monthRows = Array.from(byMonthMap.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((m, idx) => ({
      stt: idx + 1,
      monthKey: m.monthKey,
      season: m.season,
      totalCases: m.totalCases,
      summerCases: m.summerCases,
      winterCases: m.winterCases,
      equivalentCases: m.equivalentCases,
      surgeonCount: m.uniqueSurgeons.size,
      packageCases: m.packageCases,
      revenue: m.revenue,
    }));

  const procedureRows = Array.from(byProcedureMap.values())
    .sort((a, b) => b.equivalentCases - a.equivalentCases)
    .map((p, idx) => ({
      stt: idx + 1,
      maTuongDuong: p.maTuongDuong,
      tenKT: p.tenKT,
      loaiPTTT: p.loaiPTTT,
      totalCases: p.totalCases,
      equivalentCases: p.equivalentCases,
      revenue: p.revenue,
    }));

  const surgeonRows = Array.from(bySurgeonMap.values())
    .sort((a, b) => b.totalCases - a.totalCases)
    .map((s, idx) => {
      const topKt = Array.from(s.topProcedures.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k, v]) => `${k} (${v})`)
        .join('; ');
      return {
        stt: idx + 1,
        surgeon: s.surgeon,
        department: s.department,
        totalCases: s.totalCases,
        summerCases: s.summerCases,
        winterCases: s.winterCases,
        equivalentCases: s.equivalentCases,
        monthsCount: s.monthsActive.size,
        packageCases: s.packageCases,
        revenue: s.revenue,
        topProcedures: topKt,
      };
    });

  const byLoai: Record<string, number> = {};
  LOAI_PTTT_ORDER.forEach((l) => (byLoai[l] = 0));
  const specNameMap = new Map<string, string>();
  allSpecs.forEach((sp) => specNameMap.set(sp.code, sp.name));
  const bySpecialtyMap = new Map<string, { name: string; count: number }>();

  matchedRecords.forEach((r) => {
    const l = (r.loaiPTTT || 'TKPL').trim();
    const qty = getRecQty(r);
    byLoai[l] = Math.round(((byLoai[l] || 0) + qty) * 100) / 100;
    const specCode = classifySpecialty(r.tenKT || '', r.ptChinh, staffList, overrides);
    const specName = specNameMap.get(specCode) || specCode || 'Khác';
    const curSpec = bySpecialtyMap.get(specCode) || { name: specName, count: 0 };
    curSpec.count = Math.round((curSpec.count + qty) * 100) / 100;
    bySpecialtyMap.set(specCode, curSpec);
  });

  const specialtyBreakdownText =
    !targetSpecialtyCode && bySpecialtyMap.size > 0
      ? `\n- **Cơ cấu theo Chuyên khoa**: ${Array.from(bySpecialtyMap.values())
          .filter((s) => s.count > 0)
          .sort((a, b) => b.count - a.count)
          .map((s) => `${s.name}: **${s.count}** ca`)
          .join(', ')}.`
      : '';

  const artifacts: AIArtifact[] = [];
  const asksExplicitChart =
    /\b(bieu do|do thi|chart|ve bieu do|truc quan|xu huong|diễn biến|dien bien|theo thang)\b/.test(
      noTone
    );
  const isMultiMonth = monthRows.length > 1;

  if (asksSeason) {
    // Explicit Season Analysis Artifact
    artifacts.push({
      id: `pivot_month_season_${Date.now()}`,
      type: 'composite',
      title: `Phân tích theo Tháng & Mùa (Hè / Đông): ${customLabel}`,
      subtitle: `Tổng số: ${matchedRecords.length} ca (Mùa Hè: ${totalSummerCases} ca | Mùa Đông: ${totalWinterCases} ca)`,
      kpiCards: [
        { label: 'Tổng số ca', value: matchedRecords.length, tone: 'blue' },
        { label: 'Số ca Mùa Hè (01/05–30/09)', value: totalSummerCases, tone: 'amber' },
        { label: 'Số ca Mùa Đông (01/10–30/04)', value: totalWinterCases, tone: 'emerald' },
        {
          label: 'Tổng doanh thu DVKT',
          value: `${totalRevenue.toLocaleString('vi-VN')} đ`,
          tone: 'slate',
        },
      ],
      chartConfig: {
        chartType: 'composed',
        xAxisKey: 'monthKey',
        xAxisLabel: 'Tháng thực hiện (YYYY-MM)',
        enableBrush: true,
        stacked: true,
        series: [
          { key: 'summerCases', name: 'Số ca Mùa Hè', color: '#f59e0b', type: 'bar', yAxisId: 'left' },
          { key: 'winterCases', name: 'Số ca Mùa Đông', color: '#0284c7', type: 'bar', yAxisId: 'left' },
        ],
        data: monthRows,
      },
      tableConfig: {
        columns: [
          { key: 'stt', label: 'STT', align: 'center', format: 'number' },
          { key: 'monthKey', label: 'Tháng (YYYY-MM)', align: 'center' },
          { key: 'season', label: 'Mùa làm việc', align: 'center' },
          { key: 'totalCases', label: 'Tổng số ca', align: 'right', format: 'number' },
          { key: 'equivalentCases', label: 'SL Quy đổi', align: 'right', format: 'number' },
          { key: 'revenue', label: 'Doanh thu DVKT (VNĐ)', align: 'right', format: 'currency' },
        ],
        rows: monthRows,
      },
      rawRecords: monthRows,
      createdAt: Date.now(),
    });
  } else if (isMultiMonth || asksExplicitChart) {
    // Multi-month Trend Artifact (only when spanning >1 month or user explicitly asked for chart/monthly trend)
    artifacts.push({
      id: `trend_monthly_${Date.now()}`,
      type: 'composite',
      title: `Thống kê theo Tháng & Doanh thu: ${customLabel}`,
      subtitle: `Tổng số: ${totalEquivalentCases.toLocaleString('vi-VN')} ca quy đổi (${matchedRecords.length.toLocaleString('vi-VN')} hồ sơ) — Doanh thu: ${totalRevenue.toLocaleString('vi-VN')} đ`,
      kpiCards: [
        {
          label: 'Tổng SL quy đổi',
          value: `${totalEquivalentCases.toLocaleString('vi-VN')} ca`,
          tone: 'blue',
        },
        {
          label: 'Số lượt hồ sơ ca mổ',
          value: `${matchedRecords.length.toLocaleString('vi-VN')} ca`,
          tone: 'emerald',
        },
        {
          label: 'Số nhóm kỹ thuật PTTT',
          value: procedureRows.length,
          tone: 'amber',
        },
        {
          label: 'Tổng doanh thu DVKT',
          value: `${totalRevenue.toLocaleString('vi-VN')} đ`,
          tone: 'slate',
        },
      ],
      chartConfig: {
        chartType: 'composed',
        xAxisKey: 'monthKey',
        xAxisLabel: 'Tháng thực hiện (YYYY-MM)',
        enableBrush: monthRows.length > 6,
        stacked: false,
        series: [
          { key: 'equivalentCases', name: 'Số lượng quy đổi', color: '#0284c7', type: 'bar', yAxisId: 'left' },
          { key: 'totalCases', name: 'Số lượt hồ sơ', color: '#10b981', type: 'line', yAxisId: 'left' },
        ],
        data: monthRows,
      },
      tableConfig: {
        columns: [
          { key: 'stt', label: 'STT', align: 'center', format: 'number' },
          { key: 'monthKey', label: 'Tháng (YYYY-MM)', align: 'center' },
          { key: 'equivalentCases', label: 'SL Quy đổi', align: 'right', format: 'number' },
          { key: 'totalCases', label: 'Số lượt hồ sơ', align: 'right', format: 'number' },
          { key: 'packageCases', label: 'Số ca Gói DV', align: 'right', format: 'number' },
          { key: 'revenue', label: 'Doanh thu DVKT (VNĐ)', align: 'right', format: 'currency' },
        ],
        rows: monthRows,
      },
      rawRecords: monthRows,
      createdAt: Date.now(),
    });
  }

  // Artifact 2: Top Procedures (default) OR Surgeon Breakdown (only when asksSurgeon is true)
  if (asksSurgeon && surgeonRows.length > 0) {
    artifacts.push({
      id: `pivot_surgeon_${Date.now() + 1}`,
      type: asksExplicitChart ? 'composite' : 'table',
      title: `Thống kê theo Phẫu thuật viên chính — ${customLabel}`,
      subtitle: `${surgeonRows.length} bác sĩ tham gia thực hiện`,
      ...(asksExplicitChart
        ? {
            chartConfig: {
              chartType: 'bar' as const,
              xAxisKey: 'surgeon',
              xAxisLabel: 'Phẫu thuật viên chính',
              enableBrush: surgeonRows.length > 8,
              stacked: false,
              series: asksSeason
                ? [
                    { key: 'summerCases', name: 'Mùa Hè (ca)', color: '#f59e0b', type: 'bar' as const },
                    { key: 'winterCases', name: 'Mùa Đông (ca)', color: '#0284c7', type: 'bar' as const },
                    { key: 'totalCases', name: 'Tổng số ca', color: '#0d9488', type: 'line' as const },
                  ]
                : [
                    { key: 'totalCases', name: 'Tổng số ca', color: '#0284c7', type: 'bar' as const },
                    { key: 'equivalentCases', name: 'SL Quy đổi', color: '#10b981', type: 'bar' as const },
                  ],
              data: surgeonRows.slice(0, 25),
            },
          }
        : {}),
      tableConfig: {
        columns: [
          { key: 'stt', label: 'STT', align: 'center', format: 'number' },
          { key: 'surgeon', label: 'Bác sĩ (PTV Chính)', align: 'left' },
          { key: 'department', label: 'Khoa', align: 'left' },
          { key: 'totalCases', label: 'Tổng số ca', align: 'right', format: 'number' },
          { key: 'equivalentCases', label: 'SL Quy đổi', align: 'right', format: 'number' },
          ...(asksSeason
            ? [
                { key: 'summerCases', label: 'Mùa Hè', align: 'right' as const, format: 'number' as const },
                { key: 'winterCases', label: 'Mùa Đông', align: 'right' as const, format: 'number' as const },
              ]
            : []),
          { key: 'revenue', label: 'Doanh thu (VNĐ)', align: 'right', format: 'currency' },
          { key: 'topProcedures', label: 'Kỹ thuật thực hiện nhiều nhất', align: 'left' },
        ],
        rows: surgeonRows,
      },
      rawRecords: surgeonRows,
      createdAt: Date.now() + 1,
    });
  } else if (procedureRows.length > 0) {
    artifacts.push({
      id: `top_procedures_${Date.now() + 1}`,
      type: asksExplicitChart ? 'composite' : 'table',
      title: `Cơ cấu Chi tiết Kỹ thuật PTTT — ${customLabel}`,
      subtitle: `${procedureRows.length} kỹ thuật phát sinh trong kỳ`,
      ...(asksExplicitChart
        ? {
            chartConfig: {
              chartType: 'bar' as const,
              xAxisKey: 'tenKT',
              xAxisLabel: 'Tên kỹ thuật PTTT',
              enableBrush: procedureRows.length > 8,
              stacked: false,
              series: [
                { key: 'equivalentCases', name: 'Số lượng quy đổi', color: '#0284c7', type: 'bar' as const },
              ],
              data: procedureRows.slice(0, 20),
            },
          }
        : {}),
      tableConfig: {
        columns: [
          { key: 'stt', label: 'STT', align: 'center', format: 'number' },
          { key: 'maTuongDuong', label: 'Mã TĐ', align: 'center' },
          { key: 'tenKT', label: 'Tên kỹ thuật PTTT', align: 'left' },
          { key: 'loaiPTTT', label: 'Loại PTTT', align: 'center' },
          { key: 'equivalentCases', label: 'SL Quy đổi', align: 'right', format: 'number' },
          { key: 'totalCases', label: 'Số lượt hồ sơ', align: 'right', format: 'number' },
          { key: 'revenue', label: 'Doanh thu (VNĐ)', align: 'right', format: 'currency' },
        ],
        rows: procedureRows,
      },
      rawRecords: procedureRows,
      createdAt: Date.now() + 1,
    });
  }

  const seasonSummarySection = asksSeason
    ? `\n- **Phân tích theo Mùa làm việc**:\n  + **Mùa Hè (01/05 – 30/09)**: **${totalSummerCases} ca** (${matchedRecords.length > 0 ? ((totalSummerCases / matchedRecords.length) * 100).toFixed(1) : 0}%)\n  + **Mùa Đông (01/10 – 30/04)**: **${totalWinterCases} ca** (${matchedRecords.length > 0 ? ((totalWinterCases / matchedRecords.length) * 100).toFixed(1) : 0}%)`
    : '';

  const monthlyTrendSection = isMultiMonth
    ? `\n- **Diễn biến theo Tháng**:\n${monthRows
        .slice(0, 15)
        .map(
          (m) =>
            `  + Tháng **${m.monthKey}**: **${m.equivalentCases} ca quy đổi** (${m.totalCases} lượt hồ sơ, Doanh thu: ${m.revenue.toLocaleString('vi-VN')}đ)`
        )
        .join('\n')}`
    : '';

  const surgeonSummarySection = asksSurgeon
    ? `\n- **Thống kê theo Bác sĩ (PTV chính)**:\n${surgeonRows
        .slice(0, 15)
        .map(
          (s) =>
            `  + BS **${s.surgeon}** (${s.department}): Tổng **${s.totalCases} ca** (SL quy đổi: ${s.equivalentCases}, Doanh thu: ${s.revenue.toLocaleString('vi-VN')}đ) — KT tiêu biểu: ${s.topProcedures}`
        )
        .join('\n')}`
    : '';

  const revSummarySuffix =
    totalRevenue > 0
      ? ` — Tổng doanh thu viện phí: **${totalRevenue.toLocaleString('vi-VN')} VNĐ**`
      : '';

  const summaryText = `### Kết quả Phân tích Thống kê (${customLabel}):
- **Tổng số lượng PTTT**: **${totalEquivalentCases.toLocaleString('vi-VN')} ca quy đổi** (${matchedRecords.length.toLocaleString('vi-VN')} lượt hồ sơ ca mổ)${revSummarySuffix}.${seasonSummarySection}
- **Cơ cấu Phân loại PTTT**: ${
    Object.entries(byLoai)
      .filter(([, count]) => count > 0)
      .map(([k, v]) => `${k}: **${v}** ca`)
      .join(', ') || 'Không có'
  }.${specialtyBreakdownText}${monthlyTrendSection}
- **Cơ cấu Kỹ thuật PTTT**:
${procedureRows
  .slice(0, 10)
  .map((p) => {
    const codeTag =
      p.maTuongDuong && p.maTuongDuong !== '—'
        ? `${p.maTuongDuong} - Loại ${p.loaiPTTT}`
        : `Loại ${p.loaiPTTT}`;
    const revTag = p.revenue > 0 ? `, Doanh thu: ${p.revenue.toLocaleString('vi-VN')}đ` : '';
    return `  + **${p.tenKT}** (${codeTag}): **${p.equivalentCases} ca quy đổi** (${p.totalCases} lượt hồ sơ${revTag})`;
  })
  .join('\n')}${surgeonSummarySection}`;

  return { summaryText, artifacts };
}

// ─── MASTER ORCHESTRATOR FOR USER QUERIES ────────────────────────────────────

/**
 * Tự động phân tích câu hỏi của người dùng, kích hoạt đồng thời các Tool truy vấn
 * liên kết cần thiết (Bệnh nhân, Nhân sự, Lịch trực, Gói DV, Thống kê & So sánh)
 * và trả về cả dữ liệu ngữ cảnh chính xác 100% cho LLM lẫn danh sách Interactive Artifacts.
 */
export async function runRelationalQueryPipeline(
  prompt: string,
  ctx: AIDataContextInput,
  options?: {
    overrideIntent?: AIQueryIntent;
    recentUserPrompts?: string[];
    previousTurnScope?: AIConversationTurnScope | null;
    workingMemory?: DshSessionWorkingMemory | null;
  }
): Promise<AIQueryExecutionOutput> {
  const executedTools: AIChatToolExecutionLog[] = [];
  const artifacts: AIArtifact[] = [];
  const sections: string[] = [];
  const focusedSections: string[] = [];

  const noTone = removeVietnameseTones(prompt);
  const rawTC = extractTimeConstraintsFromPrompt(prompt);
  let months = rawTC.months;
  let years = rawTC.years;
  let specificDates = rawTC.specificDates;
  let dateRange = rawTC.dateRange;
  let isDutyShift24h = rawTC.isDutyShift24h;
  let explicitSource = rawTC.explicitSource;
  let hasExplicitTimeOrSource = rawTC.hasExplicitTimeOrSource;

  let targetStaffNames = extractTargetStaffNames(prompt, ctx.config);

  const prevScope = options?.previousTurnScope;
  const memAnchor = options?.workingMemory?.anchoredTimeScope;
  const recentPrompts = (options?.recentUserPrompts || []).filter(
    (p) => p && p.trim() !== prompt.trim()
  );
  const hasConversationHistory =
    Boolean(prevScope) || Boolean(memAnchor) || recentPrompts.length > 0;
  const isEllipticalFollowUp =
    /\b(con|the con|vay con|thi sao|nhu the nao|sao)\b/.test(noTone) &&
    prompt.trim().split(/\s+/).length <= 12;

  let inheritedTimeFromPrevTurn = false;
  let reusePrevScopedRecords = false;

  // ── MULTI-TURN CONVERSATIONAL CONTEXT & COREFERENCE RESOLUTION (@deepseek-ai/dsh-memory) ──
  if (!rawTC.hasExplicitTimeOrSource && hasConversationHistory) {
    // Câu hỏi tiếp theo không nêu thời gian mới (VD: "phân tích cơ cấu phẫu thuật trong danh sách đó", "chi tiết các ca P1 trong đó", "ai phải chấm ngoài giờ?")
    if (prevScope) {
      months = prevScope.months || [];
      years = prevScope.years || [];
      specificDates = prevScope.specificDates || [];
      dateRange = prevScope.dateRange;
      isDutyShift24h = Boolean(prevScope.isDutyShift24h);
      explicitSource = prevScope.explicitSource ?? null;
      hasExplicitTimeOrSource = true;
      inheritedTimeFromPrevTurn = true;
      if (
        (prevScope.unfilteredScopedRecords && prevScope.unfilteredScopedRecords.length > 0) ||
        (prevScope.scopedRecords && prevScope.scopedRecords.length > 0)
      ) {
        reusePrevScopedRecords = true;
      }
    } else if (memAnchor) {
      months = memAnchor.months || [];
      years = memAnchor.years || [];
      specificDates = memAnchor.specificDates || [];
      dateRange = memAnchor.dateRange;
      isDutyShift24h = Boolean(memAnchor.isDutyShift24h);
      explicitSource = memAnchor.explicitSource ?? undefined;
      hasExplicitTimeOrSource = true;
      inheritedTimeFromPrevTurn = true;
    } else {
      for (let i = recentPrompts.length - 1; i >= 0; i--) {
        const prevTC = extractTimeConstraintsFromPrompt(recentPrompts[i]);
        if (prevTC.hasExplicitTimeOrSource) {
          months = prevTC.months;
          years = prevTC.years;
          specificDates = prevTC.specificDates;
          dateRange = prevTC.dateRange;
          isDutyShift24h = prevTC.isDutyShift24h;
          explicitSource = prevTC.explicitSource;
          hasExplicitTimeOrSource = true;
          inheritedTimeFromPrevTurn = true;
          break;
        }
      }
      if (!hasExplicitTimeOrSource && recentPrompts.length > 0) {
        hasExplicitTimeOrSource = true;
        inheritedTimeFromPrevTurn = true;
      }
    }
  } else if (rawTC.hasExplicitTimeOrSource && hasConversationHistory && isEllipticalFollowUp) {
    // Câu hỏi đổi ngày/tháng ngắn gọn (VD: "còn ngày 19/10 thì sao?") sau khi hỏi về tua trực ở câu trước
    if (!isDutyShift24h && specificDates.length > 0) {
      if (prevScope?.isDutyShift24h || memAnchor?.isDutyShift24h) {
        isDutyShift24h = true;
      } else if (recentPrompts.length > 0) {
        const lastTC = extractTimeConstraintsFromPrompt(recentPrompts[recentPrompts.length - 1]);
        if (lastTC.isDutyShift24h) isDutyShift24h = true;
      }
    }
  }

  // Kế thừa nhân sự đang hỏi nếu câu hiện tại dùng đại từ ("bác sĩ đó", "nhân viên đó") hoặc hỏi nối tiếp
  if (targetStaffNames.length === 0 && hasConversationHistory) {
    const referencesPrevStaff =
      /\b(bac si do|bs do|nhan vien do|nguoi do|ptv do|kip do|anh ay|chi ay|bac si nay|nhan vien nay)\b/.test(
        noTone
      ) || isEllipticalFollowUp;
    if (referencesPrevStaff) {
      if (prevScope?.targetStaffNames && prevScope.targetStaffNames.length > 0) {
        targetStaffNames = prevScope.targetStaffNames;
      } else if (
        options?.workingMemory?.activeEntities?.targetStaffNames &&
        options.workingMemory.activeEntities.targetStaffNames.length > 0
      ) {
        targetStaffNames = options.workingMemory.activeEntities.targetStaffNames;
      } else {
        for (let i = recentPrompts.length - 1; i >= 0; i--) {
          const prevStaff = extractTargetStaffNames(recentPrompts[i], ctx.config);
          if (prevStaff.length > 0) {
            targetStaffNames = prevStaff;
            break;
          }
        }
      }
    }
  }

  const baseRecords = getAllRecordsFromContext(ctx);

  // 0. Jev System One (TypeSafe AI) Single-Pass Typed Decision & Calibration
  const rawSystemOneEval = evaluateWithJevSystemOne(prompt, {
    hasLoadedRecords: baseRecords.length > 0 || reusePrevScopedRecords,
    hasExplicitTimeOrSource,
    recentUserPrompts: options?.recentUserPrompts,
  });

  const systemOneEval: JevSystemOneEvaluation = options?.overrideIntent
    ? {
        ...rawSystemOneEval,
        intentChoice: {
          ...rawSystemOneEval.intentChoice,
          selected: options.overrideIntent,
          label: AI_INTENT_METADATA[options.overrideIntent].label,
          calibratedProbability: 0.99,
        },
        focusInstruction: AI_INTENT_METADATA[options.overrideIntent].focusDirective,
      }
    : rawSystemOneEval;

  executedTools.push({
    toolName: 'jev_system_one_classifier',
    summary: `⚡ Jev System One: ${systemOneEval.intentChoice.label} (${Math.round(
      systemOneEval.intentChoice.calibratedProbability * 100
    )}% • Tin cậy ${systemOneEval.scores.calibrationConfidence.score}% • ${
      systemOneEval.evaluationLatencyMs
    }ms)`,
  });

  // Clarification Gate: ONLY when screen has NO opened data AND prompt has NO time/source AND conversation has NO prior context
  if (baseRecords.length === 0 && !hasExplicitTimeOrSource && !reusePrevScopedRecords) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const padCurMonth = String(curMonth).padStart(2, '0');

    const clarificationOptions: AIClarificationOption[] = [];

    if (ctx.dailyOpenedRecords && ctx.dailyOpenedRecords.length > 0) {
      clarificationOptions.push({
        label: `Báo cáo hàng ngày đang mở (${ctx.dailyOpenedRecords.length} ca)`,
        followUpPrompt: `${prompt} (trên dữ liệu báo cáo ngày đang mở)`,
        description: ctx.dailyOpenedCitation,
      });
    }
    if (ctx.monthlyOpenedRecords && ctx.monthlyOpenedRecords.length > 0) {
      clarificationOptions.push({
        label: `Báo cáo tháng đang mở (${ctx.monthlyOpenedRecords.length} ca)`,
        followUpPrompt: `${prompt} (trên dữ liệu báo cáo tháng đang mở)`,
        description: ctx.monthlyOpenedCitation,
      });
    }

    clarificationOptions.push(
      {
        label: `Tháng ${padCurMonth}/${curYear} (CSDL Báo cáo tháng)`,
        followUpPrompt: `${prompt} trong tháng ${curMonth}/${curYear}`,
      },
      {
        label: `${curMonth} tháng đầu năm ${curYear} so với ${curYear - 1}`,
        followUpPrompt: `${prompt} ${curMonth} tháng đầu năm ${curYear} so với năm ${curYear - 1}`,
      },
      {
        label: `Cả năm ${curYear} (CSDL Lưu trữ)`,
        followUpPrompt: `${prompt} trong năm ${curYear}`,
      },
      {
        label: `So sánh năm ${curYear} và năm ${curYear - 1}`,
        followUpPrompt: `${prompt} năm ${curYear} so với năm ${curYear - 1}`,
      }
    );

    const clarificationMessage = `Bạn chưa nêu rõ **nguồn số liệu hoặc khoảng thời gian** cần truy vấn cho câu hỏi *"${prompt}"* (và màn hình hiện tại chưa mở dữ liệu nào).\n\n👉 Vui lòng **bấm chọn nhanh nguồn dữ liệu bên dưới** hoặc nhập rõ ngày/tháng/năm cần tra cứu:`;

    return {
      executedTools,
      contextDataForLLM: clarificationMessage,
      focusedFastSummary: clarificationMessage,
      systemOneEval,
      artifacts: [],
      scopedRecordCount: 0,
      scopedDateRange: 'Chưa xác định kỳ dữ liệu',
      needsClarification: true,
      clarificationMessage,
      clarificationOptions,
    };
  }

  // 1. Ensure surgery records for requested period (or reuse previous turn's unfilteredScopedRecords on anaphoric follow-ups!)
  let unfilteredScopedRecords: Array<SurgeryRecord | PersistedSurgeryRecord> = [];
  let baseDataSourceCitation = '';

  if (reusePrevScopedRecords && prevScope) {
    unfilteredScopedRecords =
      prevScope.unfilteredScopedRecords && prevScope.unfilteredScopedRecords.length > 0
        ? prevScope.unfilteredScopedRecords
        : prevScope.scopedRecords || [];
    baseDataSourceCitation = (
      prevScope.baseDataSourceCitation ||
      prevScope.dataSourceCitation ||
      ctx.periodLabel
    ).replace(/\s*\(tiếp nối ngữ cảnh câu trước\)$/i, '');
    executedTools.push({
      toolName: 'dsh_memory_context_resolver',
      summary: `Kế thừa ngữ cảnh bộ nhớ phiên (@deepseek-ai/dsh-memory): ${baseDataSourceCitation}`,
      recordCount: unfilteredScopedRecords.length,
    });
  } else {
    const ensured = await ensureSurgeryRecordsForQuery(
      ctx,
      months,
      years,
      executedTools,
      specificDates,
      explicitSource,
      dateRange,
      isDutyShift24h
    );
    unfilteredScopedRecords = ensured.records;
    baseDataSourceCitation = ensured.dataSourceCitation.replace(
      /\s*\(tiếp nối ngữ cảnh câu trước\)$/i,
      ''
    );
  }

  let scopedRecords = unfilteredScopedRecords;
  let dataSourceCitation = inheritedTimeFromPrevTurn
    ? `${baseDataSourceCitation} (tiếp nối ngữ cảnh câu trước)`
    : baseDataSourceCitation;

  // 1B. Sub-scope filtering when user narrows down the conversation's dataset by Loại PTTT (VD: "chi tiết 2 ca P1 đó", "còn các ca P2 thì sao?")
  const loaiSubMatch = noTone.match(
    /\b(?:loai|nhom|cac ca|nhung ca|\d+\s+ca)\s+(pdb|pđb|p1|p2|p3|tdb|tđb|t1|t2|t3|thu thuat)\b/
  );
  const matchedSubLoaiRaw = loaiSubMatch ? loaiSubMatch[1].toUpperCase() : '';
  let hasSubFilter = false;
  if (matchedSubLoaiRaw && unfilteredScopedRecords.length > 0) {
    const normTargetLoai =
      matchedSubLoaiRaw === 'PDB'
        ? 'PĐB'
        : matchedSubLoaiRaw === 'TDB'
        ? 'TĐB'
        : matchedSubLoaiRaw === 'THU THUAT'
        ? 'THU_THUAT'
        : matchedSubLoaiRaw;
    const subFiltered = unfilteredScopedRecords.filter((r) => {
      const rl = (r.loaiPTTT || '').toUpperCase().trim();
      if (normTargetLoai === 'THU_THUAT') return rl.startsWith('T');
      if (normTargetLoai === 'PĐB') return rl === 'PĐB' || rl === 'PDB';
      if (normTargetLoai === 'TĐB') return rl === 'TĐB' || rl === 'TDB';
      return rl === normTargetLoai;
    });
    scopedRecords = subFiltered;
    hasSubFilter = true;
    dataSourceCitation = `${baseDataSourceCitation} — Lọc riêng ${
      normTargetLoai === 'THU_THUAT' ? 'Thủ thuật' : `Loại ${normTargetLoai}`
    } (${scopedRecords.length} ca PTTT, tiếp nối ngữ cảnh câu trước)`;
  }

  const scopedDates = scopedRecords
    .map((r) => getRecordIsoDate(r))
    .filter(Boolean)
    .sort();
  const scopedDateRange =
    scopedDates.length > 0
      ? `${formatIsoToDMY(scopedDates[0])} → ${formatIsoToDMY(scopedDates[scopedDates.length - 1])}`
      : 'Chưa có bản ghi';

  // Prepend explicit data source citation section
  const citationHeader = `📌 **Nguồn số liệu sử dụng:** ${dataSourceCitation}`;
  sections.push(buildJevSystemOneDirectiveForLLM(systemOneEval));
  sections.push(citationHeader);
  focusedSections.push(citationHeader);

  const primaryIntent = systemOneEval.intentChoice.selected;
  const secondarySet = new Set(systemOneEval.secondaryIntents);

  // Loại bỏ các cụm đại từ chỉ định ("trong danh sách đó", "ở danh sách trên"...) khi xét từ khóa "danh sách"
  const noToneWithoutAnaphora = noTone.replace(
    /\b(trong|o|cua|tu)?\s*(danh sach|bang|so lieu|ket qua|cac ca|nhung ca)\s*(do|tren|nay|vua roi)\b/g,
    ' '
  );

  // 2. Detect intents guided by Jev System One Choice<AIQueryIntent>
  const isOvertimeQuery =
    primaryIntent === 'overtime_audit' ||
    secondarySet.has('overtime_audit') ||
    /\b(ngoai gio|cham ngoai gio|lam ngoai gio|lam them|kip tang cuong|kip mo phien)\b/.test(noTone);

  const isConflictOrQualityQuery =
    primaryIntent === 'conflict_quality' ||
    secondarySet.has('conflict_quality') ||
    /\b(trung lich|trung gio|xung dot|trung nhan vien|trung nv|trung may|thieu may|thieu ma may|chua gv|chua co giup viec|thieu giup viec|loi tg|loi thoi gian|thoi gian toi thieu|duoi 100|50%|80%|kiem tra loi|ra soat loi|bat thuong|kinh phi|thanh toan pttt)\b/.test(
      noTone
    );

  // Phân biệt câu hỏi yêu cầu "Phân tích cơ cấu / Thống kê / Tỷ lệ / So sánh" với câu hỏi yêu cầu "Báo cáo danh sách ca mổ"
  const asksStructureOrStatsAnalysis =
    /\b(phan tich|co cau|ty le|thong ke|so sanh|bieu do|doanh thu|tong tien|xu huong|theo chuyen khoa|theo loai)\b/.test(
      noToneWithoutAnaphora
    );

  // Kiểm tra câu hỏi có nhắc tới số thứ tự ca ("ca thứ 2", "ca đầu tiên") hoặc họ tên bệnh nhân có thực trong tập dữ liệu đang xét
  const mentionsOrdinalOrPatientInScope =
    /\b(?:ca|benh nhan|bn|stt|dong)\s+(?:thu|so)\s+\d{1,3}\b/.test(noTone) ||
    /\b(?:ca|benh nhan)\s+(?:dau tien|cuoi cung)\b/.test(noTone) ||
    scopedRecords.some((r) => {
      const pname = removeVietnameseTones(r.patientName || '');
      return pname.length >= 5 && noTone.includes(pname);
    });

  const prevWasSurgeryList =
    Boolean(prevScope?.isSurgeryListQuery) ||
    Boolean(options?.workingMemory?.activeEntities?.lastWasSurgeryList) ||
    (recentPrompts.length > 0 &&
      /\b(danh sach phau thuat|danh sach ca mo|danh sach pttt|danh sach benh nhan phau thuat|danh sach benh nhan mo|bao cao danh sach|bao cao phau thuat|bao cao ca mo|liet ke.*phau thuat|liet ke.*ca mo)\b/.test(
        removeVietnameseTones(recentPrompts[recentPrompts.length - 1])
      ));

  const isSurgeryListQuery =
    !isOvertimeQuery &&
    !isConflictOrQualityQuery &&
    !asksStructureOrStatsAnalysis &&
    !mentionsOrdinalOrPatientInScope &&
    (/\b(danh sach phau thuat|danh sach ca mo|danh sach pttt|danh sach benh nhan phau thuat|danh sach benh nhan mo|danh sach bn phau thuat|danh sach bn mo|bao cao danh sach|bao cao phau thuat|bao cao ca mo|liet ke.*phau thuat|liet ke.*ca mo|cac ca mo|cac ca phau thuat|mo nhung ca nao|nhung ca mo nao)\b/.test(
      noToneWithoutAnaphora
    ) ||
      (rawTC.isDutyShift24h &&
        /\b(phau thuat|ca mo|pttt|mo)\b/.test(noToneWithoutAnaphora) &&
        !/\b(lich truc|ai truc|nhan vien truc|phan cong truc|so buoi truc)\b/.test(
          noToneWithoutAnaphora
        )) ||
      (hasSubFilter && !isOvertimeQuery && !isConflictOrQualityQuery) ||
      (isEllipticalFollowUp && prevWasSurgeryList));

  const asksExplicitDutyRoster =
    /\b(lich truc|ai truc|nhan vien truc|phan cong truc|truc bao nhieu|so buoi truc|buoi truc|danh sach truc|ngay nghi|ngay le)\b/.test(
      noToneWithoutAnaphora
    ) ||
    (!isSurgeryListQuery &&
      !asksStructureOrStatsAnalysis &&
      /\b(truc|tua truc)\b/.test(noToneWithoutAnaphora) &&
      !/\b(phau thuat|ca mo|pttt|danh sach|bao cao)\b/.test(noToneWithoutAnaphora));

  const isDutyQuery =
    !isOvertimeQuery &&
    !isSurgeryListQuery &&
    !asksStructureOrStatsAnalysis &&
    (primaryIntent === 'duty_schedule' ||
      secondarySet.has('duty_schedule') ||
      asksExplicitDutyRoster);

  const isPackageQuery =
    primaryIntent === 'service_package' ||
    secondarySet.has('service_package') ||
    /\b(goi dv|goi dich vu|yeu cau|chon bac si|chon bs|goi san)\b/.test(noTone);

  const isPatientQuery =
    !isSurgeryListQuery &&
    !asksStructureOrStatsAnalysis &&
    (mentionsOrdinalOrPatientInScope ||
      primaryIntent === 'patient_lookup' ||
      /\b(ma bn|ma benh nhan|tim bn|tim kiem bn|tim benh nhan|ho so bn|the bhyt)\b/.test(noTone) ||
      /\b(\d{6,12})\b/.test(noTone));

  const isStaffQuery =
    primaryIntent === 'staff_workload' ||
    (targetStaffNames.length > 0 && !isOvertimeQuery && !isDutyQuery && !isSurgeryListQuery) ||
    (!isOvertimeQuery &&
      !isConflictOrQualityQuery &&
      !isSurgeryListQuery &&
      !asksStructureOrStatsAnalysis &&
      !mentionsOrdinalOrPatientInScope &&
      /\b(nhan vien|bac si|ptv|kip mo|phu cap|ai mo|ai tham gia)\b/.test(
        noTone
      ));

  const hasSpecificOperationalTool =
    isOvertimeQuery ||
    isConflictOrQualityQuery ||
    isSurgeryListQuery ||
    isDutyQuery ||
    isPackageQuery ||
    isPatientQuery ||
    isStaffQuery;

  const isPivotOrTrendQuery =
    !isSurgeryListQuery &&
    (asksStructureOrStatsAnalysis ||
      primaryIntent === 'specialty_yoy' ||
      primaryIntent === 'or_utilization' ||
      /\b(bieu do|so sanh|cung ky|cac thang|mua he|mua dong|mua khac nhau|noi soi|tieu hoa|xu huong|theo thang|theo mua)\b/.test(
        noTone
      ) ||
      !hasSpecificOperationalTool);

  // Execute Surgery List Report if triggered ("báo cáo danh sách phẫu thuật...", "danh sách bệnh nhân phẫu thuật...")
  if (isSurgeryListQuery) {
    const listRes = executeSurgeryListReportTool(scopedRecords, dataSourceCitation);
    sections.push(listRes.summaryText);
    focusedSections.push(listRes.summaryText);
    if (listRes.artifact) artifacts.push(listRes.artifact);
    executedTools.push({
      toolName: 'report_surgery_list',
      summary: `Báo cáo danh sách chi tiết ${scopedRecords.length} ca PTTT (${dataSourceCitation})`,
      recordCount: scopedRecords.length,
    });
  }

  // Execute Overtime Analysis if triggered (Tab "Ngoài giờ")
  if (isOvertimeQuery) {
    const otRes = await executeOvertimeAnalysisTool(ctx, scopedRecords, prompt, executedTools);
    sections.push(otRes.summaryText);
    focusedSections.push(otRes.summaryText);
    if (otRes.artifact) artifacts.push(otRes.artifact);
    executedTools.push({
      toolName: 'analyze_overtime_records',
      summary: `Tính toán chi tiết Chấm ngoài giờ (calculateOvertimeRows ⋈ duty_schedules) trên ${scopedRecords.length} ca PTTT`,
      recordCount: scopedRecords.length,
    });
  }

  // Execute Conflict, Validation & Allowance Quality Check if triggered
  if (isConflictOrQualityQuery) {
    const cqRes = executeConflictAndQualityTool(ctx, scopedRecords, prompt);
    sections.push(cqRes.summaryText);
    focusedSections.push(cqRes.summaryText);
    if (cqRes.artifact) artifacts.push(cqRes.artifact);
    executedTools.push({
      toolName: 'analyze_conflicts_and_quality',
      summary: `Kiểm định Trùng lịch NV, Trùng máy, Thiếu máy, Chưa GV, Lỗi TG & Phụ cấp PTTT (${scopedRecords.length} ca)`,
      recordCount: scopedRecords.length,
    });
  }

  // Execute Patient Search if triggered
  if (isPatientQuery) {
    const res = executePatientSearchTool(scopedRecords, ctx.packageAssignments, prompt);
    if (res.summaryText) {
      sections.push(res.summaryText);
      focusedSections.push(res.summaryText);
      if (res.artifact) artifacts.push(res.artifact);
      executedTools.push({
        toolName: 'search_patients_and_surgeries',
        summary: `Tra cứu hồ sơ bệnh nhân & ca mổ (${res.matchedRecords.length} bản ghi khớp)`,
        recordCount: res.matchedRecords.length,
      });
    }
  }

  // Execute Duty Schedule Analysis if triggered
  if (isDutyQuery) {
    const dutyRes = await executeDutyScheduleAnalysisTool(
      ctx,
      prompt,
      months,
      years,
      targetStaffNames,
      executedTools,
      specificDates
    );
    sections.push(dutyRes.summaryText);
    focusedSections.push(dutyRes.summaryText);
    if (dutyRes.artifact) artifacts.push(dutyRes.artifact);
    executedTools.push({
      toolName: 'analyze_duty_schedule',
      summary: `Truy vấn bảng Lịch trực 24h (duty_schedules)${targetStaffNames.length > 0 ? ` cho ${targetStaffNames.join(', ')}` : ''}`,
    });
  }

  // Execute Service Package Analysis if triggered
  if (isPackageQuery) {
    const pkgRes = executeServicePackageAnalysisTool(ctx, scopedRecords, prompt, months, years);
    sections.push(pkgRes.summaryText);
    focusedSections.push(pkgRes.summaryText);
    if (pkgRes.artifact) artifacts.push(pkgRes.artifact);
    executedTools.push({
      toolName: 'analyze_service_packages',
      summary: `Truy vấn liên kết bảng Gói dịch vụ yêu cầu (service_package_assignments ⋈ service_packages)`,
      recordCount: ctx.packageAssignments.length,
    });
  }

  // Execute Staff Workload Analysis if triggered
  if (isStaffQuery) {
    const staffRes = executeStaffWorkloadTool(ctx, scopedRecords, targetStaffNames);
    sections.push(staffRes.summaryText);
    focusedSections.push(staffRes.summaryText);
    if (staffRes.artifact) artifacts.push(staffRes.artifact);
    executedTools.push({
      toolName: 'analyze_staff_workload',
      summary: `Tổng hợp khối lượng ca PTTT (6 vị trí) + Gói DV + Trực 24h${targetStaffNames.length > 0 ? ` cho ${targetStaffNames.join(', ')}` : ''}`,
      recordCount: scopedRecords.length,
    });
  }

  // Execute Statistical / Comparison / Pivot Analysis ONLY when relevant or when no specific operational tool matched
  if (isPivotOrTrendQuery || focusedSections.length <= 1) {
    const pivotRes = executeMultiDimensionalPivotTool(ctx, scopedRecords, prompt);
    sections.push(pivotRes.summaryText);
    focusedSections.push(pivotRes.summaryText);
    artifacts.push(...pivotRes.artifacts);
    executedTools.push({
      toolName: 'multi_dimensional_pivot',
      summary: `Phân tích & so sánh số liệu PTTT trên ${scopedRecords.length.toLocaleString('vi-VN')} bản ghi kỳ truy vấn`,
      recordCount: scopedRecords.length,
    });
  }

  // Include direct row-by-row table snapshot in contextDataForLLM when dataset is small (<= 60 records)
  if (scopedRecords.length > 0 && scopedRecords.length <= 60) {
    const directSnapshot = buildDirectTableSnapshotForLLM(scopedRecords);
    if (directSnapshot) {
      sections.push(directSnapshot);
    }
  }

  const patientDigest = unfilteredScopedRecords.slice(0, 30).map((r, idx) => {
    const loai = (r.loaiPTTT || 'PTTT').trim();
    const kt = (r.tenKT || '').trim();
    const ptv = (r.ptChinh || '—').trim();
    return `#${idx + 1} [${r.patientId || '—'}] ${r.patientName || '—'} (${loai} - ${kt} - PTV: ${ptv})`;
  });

  const turnScope: AIConversationTurnScope = {
    prompt,
    scopedRecords,
    unfilteredScopedRecords,
    dataSourceCitation,
    baseDataSourceCitation,
    scopedDateRange,
    months,
    years,
    specificDates,
    dateRange,
    isDutyShift24h,
    explicitSource,
    targetStaffNames,
    patientDigest,
    primaryIntent,
    isSurgeryListQuery,
  };

  return {
    executedTools,
    contextDataForLLM: sections.join('\n\n---\n\n'),
    focusedFastSummary: focusedSections.join('\n\n---\n\n'),
    systemOneEval,
    artifacts,
    scopedRecordCount: scopedRecords.length,
    scopedDateRange,
    dataSourceCitation,
    turnScope,
  };
}
