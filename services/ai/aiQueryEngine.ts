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
} from '../../types/ai';
import { CLINICAL_DOMAIN_TAXONOMY } from './aiSemanticSchema';
import { reportService } from '../reportService';
import { dutyScheduleService, isWeekend } from '../dutyScheduleService';
import { calculateOvertimeRows } from '../overtimeCalculationService';
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

export interface AIQueryExecutionOutput {
  executedTools: AIChatToolExecutionLog[];
  contextDataForLLM: string;
  artifacts: AIArtifact[];
  scopedRecordCount?: number;
  scopedDateRange?: string;
  dataSourceCitation?: string;
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
  const startObj = (rec as SurgeryRecord).start;
  if (startObj instanceof Date && !isNaN(startObj.getTime())) {
    const y = startObj.getFullYear();
    const m = String(startObj.getMonth() + 1).padStart(2, '0');
    const d = String(startObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = rec.ngayBD || rec.ngayCD || '';
  if (!raw) return '';
  // Check ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return raw.substring(0, 10);
  }
  // Check DD/MM/YYYY
  const dmyMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
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
 * Tự động bóc tách ngày cụ thể / tháng / khoảng tháng / quý / năm và nguồn báo cáo trong câu truy vấn tiếng Việt
 */
export function extractTimeConstraintsFromPrompt(
  prompt: string,
  defaultYear = new Date().getFullYear()
): {
  months: number[];
  years: number[];
  specificDates: string[];
  explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db';
  hasExplicitTimeOrSource: boolean;
  seasonFilter?: 'Mùa Hè' | 'Mùa Đông' | 'both';
} {
  const noTone = removeVietnameseTones(prompt);

  const months = new Set<number>();
  const years = new Set<number>();
  const specificDates = new Set<string>();

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

  // 0b. Match specific dates DD/MM/YYYY or DD-MM-YYYY
  const dmyFullRegex = /\b(\d{1,2})[/-](\d{1,2})[/-](202\d)\b/g;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = dmyFullRegex.exec(noTone)) !== null) {
    const d = parseInt(mMatch[1], 10);
    const m = parseInt(mMatch[2], 10);
    const y = parseInt(mMatch[3], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2035) {
      specificDates.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  // Relative dates: "hôm nay", "hôm qua"
  if (/\bhom nay\b/.test(noTone)) {
    const now = new Date();
    specificDates.add(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    );
  }
  if (/\bhom qua\b/.test(noTone)) {
    const yest = new Date(Date.now() - 86400000);
    specificDates.add(
      `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
    );
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
    Boolean(explicitSource) ||
    Boolean(seasonFilter);

  return {
    months: Array.from(months).sort((a, b) => a - b),
    years: Array.from(years).sort((a, b) => a - b),
    specificDates: Array.from(specificDates).sort(),
    explicitSource,
    hasExplicitTimeOrSource,
    seasonFilter,
  };
}

/**
 * Tải và khử trùng lặp dữ liệu cả năm từ Firestore (ưu tiên MONTHLY cho từng tháng, fallback DAILY giống StatisticsTab)
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
    if (mRecs.length > 0) {
      combined.push(...mRecs);
    } else if (dRecs.length > 0) {
      combined.push(...dRecs);
    }
  }

  aiFetchedYearsCache.set(year, combined);
  return combined;
}

/**
 * Hybrid Fetcher: Đảm bảo có đủ bản ghi ca mổ cho ngày/tháng/năm/nguồn mà người dùng hỏi
 */
async function ensureSurgeryRecordsForQuery(
  ctx: AIDataContextInput,
  months: number[],
  years: number[],
  logs: AIChatToolExecutionLog[],
  specificDates: string[] = [],
  explicitSource?: 'daily_opened' | 'monthly_opened' | 'current_opened' | 'daily_db' | 'monthly_db'
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
      (ctx.dailyOpenedRecords?.length ?? 0) > 0)
  ) {
    const recs = ctx.dailyOpenedRecords || [];
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
      (ctx.monthlyOpenedRecords?.length ?? 0) > 0)
  ) {
    const recs = ctx.monthlyOpenedRecords || [];
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

  // 3. Specific Dates (e.g., "20/10/2026", "hôm nay", "hôm qua")
  if (specificDates.length > 0) {
    const firstDate = specificDates[0];
    const lastDate = specificDates[specificDates.length - 1];
    const combinedPool = [
      ...(ctx.dailyOpenedRecords || []),
      ...baseRecords,
      ...(ctx.monthlyOpenedRecords || []),
    ];
    let matchedDates = combinedPool.filter((r) => specificDates.includes(getRecordIsoDate(r)));

    if (matchedDates.length === 0 && ctx.allowRemoteFirestoreFetch !== false) {
      try {
        const fetched = await reportService.getReports(
          `${firstDate}T00:00:00.000Z`,
          `${lastDate}T23:59:59.999Z`,
          'DAILY'
        );
        matchedDates = fetched.filter((r) => specificDates.includes(getRecordIsoDate(r)));
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

  // 4. When no specific month/year is requested, use the currently opened screen records
  if (months.length === 0 && years.length === 0) {
    const dates = baseRecords.map((r) => getRecordIsoDate(r)).filter(Boolean).sort();
    const fallbackRange =
      dates.length > 0
        ? `từ ${formatIsoToDMY(dates[0])} đến ${formatIsoToDMY(dates[dates.length - 1])}`
        : ctx.periodLabel;
    return {
      records: baseRecords,
      dataSourceCitation:
        ctx.activeSourceCitation ||
        `Số liệu đang mở trên màn hình (${ctx.periodLabel}) ${fallbackRange} — ${baseRecords.length.toLocaleString('vi-VN')} ca PTTT`,
    };
  }

  const currentYear = new Date().getFullYear();
  const targetYears = years.length > 0 ? years : [currentYear];
  const targetMonths = months.length > 0 ? months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Collect records per year-month without duplicates
  const yearMonthMap = new Map<string, Array<SurgeryRecord | PersistedSurgeryRecord>>();

  // 1. From baseRecords (already loaded in context)
  baseRecords.forEach((r) => {
    const iso = getRecordIsoDate(r);
    if (iso.length >= 7) {
      const ym = iso.substring(0, 7);
      const list = yearMonthMap.get(ym) || [];
      list.push(r);
      yearMonthMap.set(ym, list);
    }
  });

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

  // 3. Remote Firestore fetch for any requested year that is not yet in yearMonthMap
  if (ctx.allowRemoteFirestoreFetch !== false) {
    for (const y of targetYears) {
      const hasAnyMonthInYear = targetMonths.some((m) =>
        yearMonthMap.has(`${y}-${String(m).padStart(2, '0')}`)
      );
      const isCachedInYearly =
        ctx.yearlyCacheData &&
        (ctx.yearlyCacheData.primaryYear === y || ctx.yearlyCacheData.compareYear === y);

      if (!hasAnyMonthInYear && !isCachedInYearly) {
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

  // Flatten and filter strictly to requested targetYears & targetMonths
  const result: Array<SurgeryRecord | PersistedSurgeryRecord> = [];
  for (const [ym, recs] of yearMonthMap.entries()) {
    const rYear = parseInt(ym.substring(0, 4), 10);
    const rMonth = parseInt(ym.substring(5, 7), 10);
    if (years.length > 0 && !years.includes(rYear)) continue;
    if (months.length > 0 && !months.includes(rMonth)) continue;
    result.push(...recs);
  }

  // Format explicit dataSourceCitation for the queried period
  const minM = targetMonths[0];
  const maxM = targetMonths[targetMonths.length - 1];
  const padM = (m: number) => String(m).padStart(2, '0');
  let dataSourceCitation = '';

  if (targetYears.length >= 2) {
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

  const matched = records.filter((r) => {
    const pid = (r.patientId || '').toLowerCase();
    const pname = removeVietnameseTones(r.patientName || '');
    const bhyt = (r.bhyt || '').toLowerCase();
    if (targetCode && (pid.includes(targetCode) || bhyt.includes(targetCode))) {
      return true;
    }
    if (targetName && targetName.length >= 3 && pname.includes(targetName)) {
      return true;
    }
    return false;
  });

  if (matched.length === 0 && !targetCode && !targetName) {
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

// ─── 2. DUTY SCHEDULE & ON-CALL ANALYSIS TOOL ────────────────────────────────

export async function executeDutyScheduleAnalysisTool(
  ctx: AIDataContextInput,
  queryText: string,
  months: number[],
  years: number[],
  targetStaffNames: string[],
  logs: AIChatToolExecutionLog[]
): Promise<{
  summaryText: string;
  artifact?: AIArtifact;
}> {
  const targetYear = years[0] || new Date().getFullYear();
  const targetMonths = months.length > 0 ? months : [];

  // Build list of dateKeys to inspect
  const dateKeysToInspect = new Set<string>(Object.keys(ctx.dutySchedules || {}));

  if (targetMonths.length > 0) {
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

  // Filter schedules by targetMonths / targetYear if specified
  const filteredDates = Object.keys(mergedSchedules)
    .filter((dateKey) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
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
    targetMonths.length > 0
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

  const artifact: AIArtifact = {
    id: `duty_schedule_${Date.now()}`,
    type: 'composite',
    title: `Thống kê Lịch trực 24h — ${periodTitle}`,
    subtitle: `Tổng hợp trên ${filteredDates.length} ngày lịch trực (${rows.length} nhân viên tham gia trực)`,
    kpiCards: [
      { label: 'Kỳ thống kê trực', value: periodTitle, tone: 'blue' },
      { label: 'Số nhân sự có lịch trực', value: rows.filter((r) => r.totalShifts > 0).length, tone: 'emerald' },
      {
        label: 'Tổng lượt trực nhân viên',
        value: rows.reduce((s, r) => s + r.totalShifts, 0),
        tone: 'amber',
      },
    ],
    chartConfig: {
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
    },
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

  const summaryText = `### Kết quả truy vấn Lịch trực 24h (${periodTitle}):
- Số ngày kiểm tra trong kỳ: **${filteredDates.length}** ngày.
${
  tableRows.length === 0
    ? '- Chưa có dữ liệu phân công lịch trực 24h nào được lưu trong kỳ này.'
    : tableRows
        .slice(0, 20)
        .map(
          (r) =>
            `- Nhân viên **${r.staffName}**: Tổng cộng **${r.totalShifts} buổi trực** (gồm **${r.weekdayShifts}** buổi ngày thường và **${r.holidayShifts}** buổi Thứ 7/CN/Lễ). Ngày trực: ${r.datesList || 'Không có'}.`
        )
        .join('\n')
}`;

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
}`;

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
    const overtimeRows = calculateOvertimeRows(
      records as SurgeryRecord[],
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
  matchedRecords.forEach((r) => {
    const l = (r.loaiPTTT || 'TKPL').trim();
    byLoai[l] = Math.round(((byLoai[l] || 0) + getRecQty(r)) * 100) / 100;
  });

  const artifacts: AIArtifact[] = [];

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
  } else {
    // Standard Monthly Trend Artifact (NO Season clutter)
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
      type: 'composite',
      title: `Thống kê theo Phẫu thuật viên chính — ${customLabel}`,
      subtitle: `${surgeonRows.length} bác sĩ tham gia thực hiện`,
      chartConfig: {
        chartType: 'bar',
        xAxisKey: 'surgeon',
        xAxisLabel: 'Phẫu thuật viên chính',
        enableBrush: surgeonRows.length > 8,
        stacked: false,
        series: asksSeason
          ? [
              { key: 'summerCases', name: 'Mùa Hè (ca)', color: '#f59e0b', type: 'bar' },
              { key: 'winterCases', name: 'Mùa Đông (ca)', color: '#0284c7', type: 'bar' },
              { key: 'totalCases', name: 'Tổng số ca', color: '#0d9488', type: 'line' },
            ]
          : [
              { key: 'totalCases', name: 'Tổng số ca', color: '#0284c7', type: 'bar' },
              { key: 'equivalentCases', name: 'SL Quy đổi', color: '#10b981', type: 'bar' },
            ],
        data: surgeonRows.slice(0, 25),
      },
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
      type: 'composite',
      title: `Cơ cấu Chi tiết Kỹ thuật PTTT — ${customLabel}`,
      subtitle: `${procedureRows.length} kỹ thuật phát sinh trong kỳ`,
      chartConfig: {
        chartType: 'bar',
        xAxisKey: 'tenKT',
        xAxisLabel: 'Tên kỹ thuật PTTT',
        enableBrush: procedureRows.length > 8,
        stacked: false,
        series: [
          { key: 'equivalentCases', name: 'Số lượng quy đổi', color: '#0284c7', type: 'bar' },
        ],
        data: procedureRows.slice(0, 20),
      },
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

  const surgeonSummarySection = asksSurgeon
    ? `\n- **Thống kê theo Bác sĩ (PTV chính)**:\n${surgeonRows
        .slice(0, 15)
        .map(
          (s) =>
            `  + BS **${s.surgeon}** (${s.department}): Tổng **${s.totalCases} ca** (SL quy đổi: ${s.equivalentCases}, Doanh thu: ${s.revenue.toLocaleString('vi-VN')}đ) — KT tiêu biểu: ${s.topProcedures}`
        )
        .join('\n')}`
    : '';

  const summaryText = `### Kết quả Phân tích Thống kê (${customLabel}):
- **Tổng số lượng PTTT**: **${totalEquivalentCases.toLocaleString('vi-VN')} ca quy đổi** (${matchedRecords.length.toLocaleString('vi-VN')} lượt hồ sơ ca mổ) — Tổng doanh thu viện phí: **${totalRevenue.toLocaleString('vi-VN')} VNĐ**.${seasonSummarySection}
- **Cơ cấu Phân loại PTTT**: ${
    Object.entries(byLoai)
      .filter(([, count]) => count > 0)
      .map(([k, v]) => `${k}: **${v}** ca`)
      .join(', ') || 'Không có'
  }.
- **Diễn biến theo Tháng**:
${monthRows
  .slice(0, 15)
  .map(
    (m) =>
      `  + Tháng **${m.monthKey}**: **${m.equivalentCases} ca quy đổi** (${m.totalCases} lượt hồ sơ, Doanh thu: ${m.revenue.toLocaleString('vi-VN')}đ)`
  )
  .join('\n')}
- **Top Kỹ thuật PTTT chiếm tỷ trọng cao nhất**:
${procedureRows
  .slice(0, 15)
  .map(
    (p) =>
      `  + **${p.tenKT}** (${p.maTuongDuong} - Loại ${p.loaiPTTT}): **${p.equivalentCases} ca quy đổi** (${p.totalCases} lượt hồ sơ, Doanh thu: ${p.revenue.toLocaleString('vi-VN')}đ)`
  )
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
  ctx: AIDataContextInput
): Promise<AIQueryExecutionOutput> {
  const executedTools: AIChatToolExecutionLog[] = [];
  const artifacts: AIArtifact[] = [];
  const sections: string[] = [];

  const noTone = removeVietnameseTones(prompt);
  const {
    months,
    years,
    specificDates,
    explicitSource,
    hasExplicitTimeOrSource,
  } = extractTimeConstraintsFromPrompt(prompt);
  const targetStaffNames = extractTargetStaffNames(prompt, ctx.config);

  const baseRecords = getAllRecordsFromContext(ctx);

  // Clarification Gate: If current active screen has NO opened data AND prompt does NOT specify any time period or data source
  if (baseRecords.length === 0 && !hasExplicitTimeOrSource) {
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
      executedTools: [],
      contextDataForLLM: clarificationMessage,
      artifacts: [],
      scopedRecordCount: 0,
      scopedDateRange: 'Chưa xác định kỳ dữ liệu',
      needsClarification: true,
      clarificationMessage,
      clarificationOptions,
    };
  }

  // 1. Ensure surgery records for requested period & resolve exact citation
  const { records: scopedRecords, dataSourceCitation } = await ensureSurgeryRecordsForQuery(
    ctx,
    months,
    years,
    executedTools,
    specificDates,
    explicitSource
  );

  const scopedDates = scopedRecords
    .map((r) => getRecordIsoDate(r))
    .filter(Boolean)
    .sort();
  const scopedDateRange =
    scopedDates.length > 0
      ? `${formatIsoToDMY(scopedDates[0])} → ${formatIsoToDMY(scopedDates[scopedDates.length - 1])}`
      : 'Chưa có bản ghi';

  // Prepend explicit data source citation section
  sections.push(`📌 **Nguồn số liệu sử dụng:** ${dataSourceCitation}`);

  // 2. Detect intents (multiple tools can run in parallel for compound questions!)
  const isPatientQuery =
    /\b(ma bn|ma benh nhan|tim bn|tim kiem bn|tim benh nhan|ho so bn|the bhyt)\b/.test(noTone) ||
    /\b(\d{6,12})\b/.test(noTone);

  const isDutyQuery = /\b(truc|lich truc|buoi truc|tua truc|ngay nghi|ngay le)\b/.test(noTone);

  const isPackageQuery = /\b(goi dv|goi dich vu|yeu cau|chon bac si|chon bs|goi san)\b/.test(noTone);

  const isStaffQuery =
    targetStaffNames.length > 0 ||
    /\b(nhan vien|bac si|ptv|kip mo|lam bao nhieu ca|mo bao nhieu ca|phu cap)\b/.test(noTone);

  const isPivotOrTrendQuery =
    /\b(bieu do|thong ke|so sanh|cac thang|mua he|mua dong|mua khac nhau|noi soi|tieu hoa|xu huong|theo thang|theo mua|phan tich)\b/.test(
      noTone
    ) || ctx.contextPage === 'statistics_studio';

  // Execute Patient Search if triggered
  if (isPatientQuery) {
    const res = executePatientSearchTool(scopedRecords, ctx.packageAssignments, prompt);
    if (res.summaryText) {
      sections.push(res.summaryText);
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
      executedTools
    );
    sections.push(dutyRes.summaryText);
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
    if (staffRes.artifact) artifacts.push(staffRes.artifact);
    executedTools.push({
      toolName: 'analyze_staff_workload',
      summary: `Tổng hợp khối lượng ca PTTT (6 vị trí) + Gói DV + Trực 24h${targetStaffNames.length > 0 ? ` cho ${targetStaffNames.join(', ')}` : ''}`,
      recordCount: scopedRecords.length,
    });
  }

  // Execute Statistical / Comparison / Pivot Analysis if triggered or as default comprehensive analysis
  if (isPivotOrTrendQuery || sections.length <= 1) {
    const pivotRes = executeMultiDimensionalPivotTool(ctx, scopedRecords, prompt);
    sections.push(pivotRes.summaryText);
    artifacts.push(...pivotRes.artifacts);
    executedTools.push({
      toolName: 'multi_dimensional_pivot',
      summary: `Phân tích & so sánh số liệu PTTT trên ${scopedRecords.length.toLocaleString('vi-VN')} bản ghi kỳ truy vấn`,
      recordCount: scopedRecords.length,
    });
  }

  return {
    executedTools,
    contextDataForLLM: sections.join('\n\n---\n\n'),
    artifacts,
    scopedRecordCount: scopedRecords.length,
    scopedDateRange,
    dataSourceCitation,
  };
}
