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
} from '../../types/ai';
import { CLINICAL_DOMAIN_TAXONOMY } from './aiSemanticSchema';
import { reportService } from '../reportService';
import { dutyScheduleService, isWeekend } from '../dutyScheduleService';
import { calculateOvertimeRows } from '../overtimeCalculationService';
import { getAllowanceForRecord } from '../laborConfigService';
import type { YearlyCacheData } from '../statisticsService';

export interface AIDataContextInput {
  contextPage: 'daily_storage' | 'monthly_storage' | 'statistics_studio';
  periodLabel: string;
  currentRecords: Array<SurgeryRecord | PersistedSurgeryRecord>;
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

/**
 * Tự động bóc tách tháng / năm được hỏi trong câu truy vấn tiếng Việt
 */
export function extractTimeConstraintsFromPrompt(
  prompt: string,
  defaultYear = new Date().getFullYear()
): {
  months: number[];
  years: number[];
  seasonFilter?: 'Mùa Hè' | 'Mùa Đông' | 'both';
} {
  const norm = normalizeText(prompt);
  const noTone = removeVietnameseTones(prompt);

  const months = new Set<number>();
  const years = new Set<number>();

  // Match "tháng 1/2026", "tháng 05 năm 2025", "t5/2026"
  const monthYearRegex = /(?:thang|thg|t)\s*(\d{1,2})\s*(?:\/|-|\s+nam\s+)(\d{4})/gi;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = monthYearRegex.exec(noTone)) !== null) {
    const m = parseInt(mMatch[1], 10);
    const y = parseInt(mMatch[2], 10);
    if (m >= 1 && m <= 12) months.add(m);
    if (y >= 2020 && y <= 2035) years.add(y);
  }

  // Match standalone "tháng X" (e.g. "tháng 3", "tháng 10")
  const monthOnlyRegex = /(?:thang|thg)\s*(\d{1,2})(?!\d)/gi;
  while ((mMatch = monthOnlyRegex.exec(noTone)) !== null) {
    const m = parseInt(mMatch[1], 10);
    if (m >= 1 && m <= 12) months.add(m);
  }

  // Match "năm 2025", "2026"
  const yearRegex = /(?:nam\s*)?(202\d)/g;
  while ((mMatch = yearRegex.exec(noTone)) !== null) {
    const y = parseInt(mMatch[1], 10);
    if (y >= 2020 && y <= 2035) years.add(y);
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

  return {
    months: Array.from(months).sort((a, b) => a - b),
    years: Array.from(years).sort((a, b) => a - b),
    seasonFilter,
  };
}

/**
 * Hybrid Fetcher: Đảm bảo có đủ bản ghi ca mổ cho tháng/năm mà người dùng hỏi
 */
async function ensureSurgeryRecordsForQuery(
  ctx: AIDataContextInput,
  months: number[],
  years: number[],
  logs: AIChatToolExecutionLog[]
): Promise<Array<SurgeryRecord | PersistedSurgeryRecord>> {
  const baseRecords = getAllRecordsFromContext(ctx);
  if (months.length === 0 && years.length === 0) {
    return baseRecords;
  }

  const targetYears = years.length > 0 ? years : [new Date().getFullYear()];
  const targetMonths = months.length > 0 ? months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // Check if baseRecords already contain records in the requested year/month
  const existingYearMonths = new Set<string>();
  baseRecords.forEach((r) => {
    const iso = getRecordIsoDate(r);
    if (iso.length >= 7) {
      existingYearMonths.add(iso.substring(0, 7));
    }
  });

  // Also check yearlyCacheData if available
  const cacheRecords: PersistedSurgeryRecord[] = [];
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
          if (mEntry && mEntry.records.length > 0 && !existingYearMonths.has(ym)) {
            cacheRecords.push(...mEntry.records);
            existingYearMonths.add(ym);
          }
        }
      }
    }
  }

  const combined = [...baseRecords, ...cacheRecords];

  // Determine missing year-months that need remote Firestore fetch
  if (ctx.allowRemoteFirestoreFetch !== false) {
    for (const y of targetYears) {
      for (const m of targetMonths) {
        const ym = `${y}-${String(m).padStart(2, '0')}`;
        if (!existingYearMonths.has(ym) && months.length > 0) {
          try {
            const lastDay = new Date(y, m, 0).getDate();
            const dateFrom = `${ym}-01T00:00:00.000Z`;
            const dateTo = `${ym}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
            let fetched = await reportService.getReports(dateFrom, dateTo, 'MONTHLY');
            if (fetched.length === 0) {
              fetched = await reportService.getReports(dateFrom, dateTo, 'DAILY');
            }
            if (fetched.length > 0) {
              combined.push(...fetched);
              existingYearMonths.add(ym);
              logs.push({
                toolName: 'firestore_expand_surgeries',
                summary: `Đã tự động truy vấn mở rộng Firestore kỳ ${String(m).padStart(2, '0')}/${y} (${fetched.length} ca PTTT)`,
                recordCount: fetched.length,
                expandedFirestoreFetch: true,
              });
            }
          } catch (e) {
            console.warn('[aiQueryEngine] Remote fetch fallback warning:', e);
          }
        }
      }
    }
  }

  // Filter to requested months/years if specified
  return combined.filter((r) => {
    const iso = getRecordIsoDate(r);
    if (!iso) return months.length === 0 && years.length === 0;
    const rYear = parseInt(iso.substring(0, 4), 10);
    const rMonth = parseInt(iso.substring(5, 7), 10);
    if (years.length > 0 && !years.includes(rYear)) return false;
    if (months.length > 0 && !months.includes(rMonth)) return false;
    return true;
  });
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

// ─── 5. MULTI-DIMENSIONAL CROSS-TABLE PIVOT ENGINE ───────────────────────────

/**
 * Phân tích đa chiều liên kết: Kỹ thuật / Chuyên khoa (VD: Phẫu thuật nội soi tiêu hóa)
 * × Tháng × Mùa (Mùa Hè vs Mùa Đông) × Bác sĩ (PTV chính) × Loại PTTT × Gói DV
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

  // 1. Identify clinical domain or procedure filter
  let domainKey: string | null = null;
  let customLabel = 'Tất cả Phẫu thuật / Thủ thuật';

  if (noTone.includes('noi soi') && noTone.includes('tieu hoa')) {
    domainKey = 'noi_soi_tieu_hoa';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.noi_soi_tieu_hoa.label;
  } else if (noTone.includes('tieu hoa')) {
    domainKey = 'tieu_hoa';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.tieu_hoa.label;
  } else if (noTone.includes('san khoa') || noTone.includes('lay thai') || noTone.includes('phu san')) {
    domainKey = 'san_phu_khoa';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.san_phu_khoa.label;
  } else if (noTone.includes('chan thuong') || noTone.includes('chinh hinh') || noTone.includes('ket hop xuong')) {
    domainKey = 'chan_thuong_chinh_hinh';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.chan_thuong_chinh_hinh.label;
  } else if (noTone.includes('tai mui hong') || noTone.includes('amidan')) {
    domainKey = 'tai_mui_hong';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.tai_mui_hong.label;
  } else if (noTone.includes('phaco') || noTone.includes('thuy tinh the') || noTone.includes('nhan khoa')) {
    domainKey = 'mat';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.mat.label;
  } else if (noTone.includes('tiet nieu') || noTone.includes('tan soi')) {
    domainKey = 'tiet_nieu';
    customLabel = CLINICAL_DOMAIN_TAXONOMY.tiet_nieu.label;
  }

  const asksEndoscopicOnly = noTone.includes('noi soi') && !domainKey;
  if (asksEndoscopicOnly) {
    customLabel = 'Phẫu thuật / Thủ thuật Nội soi';
  }

  // Staff -> Department lookup
  const staffDeptMap = new Map<string, string>();
  (ctx.config.staffList || []).forEach((s) => {
    staffDeptMap.set(removeVietnameseTones(s.name), s.department || '');
  });

  // Filter records matching clinical domain or keywords
  const matchedRecords = records.filter((r) => {
    const tenNorm = removeVietnameseTones(r.tenKT || '');
    const maTD = (r.maTuongDuong || '').trim();
    const prefix2 = maTD.substring(0, 2);
    const surgeonDepts = splitStaffNames(r.ptChinh).map((n) => staffDeptMap.get(removeVietnameseTones(n)) || '');

    if (domainKey) {
      const rule = CLINICAL_DOMAIN_TAXONOMY[domainKey];
      if (rule.mustContainAny && !rule.mustContainAny.some((kw) => tenNorm.includes(removeVietnameseTones(kw)))) {
        return false;
      }
      const matchesOrgan = rule.organKeywords.some((kw) => tenNorm.includes(removeVietnameseTones(kw)));
      const matchesChapter = rule.chapterCodeHints.some((ch) => prefix2 === ch);
      const matchesDept = rule.departmentHints.some((d) => surgeonDepts.includes(d));
      return matchesOrgan || matchesChapter || matchesDept;
    }

    if (asksEndoscopicOnly) {
      return tenNorm.includes('noi soi');
    }

    return true;
  });

  // Build package lookup
  const pkgSet = new Set<string>();
  ctx.packageAssignments.forEach((pa) => {
    if (pa.compositeKey) pkgSet.add(pa.compositeKey);
  });

  // 2. Multi-dimensional aggregation:
  // (A) By Month (with Season & Revenue & Cases)
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

  // (B) By Surgeon × Season × Month
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

  // (C) By Season Summary
  let totalSummerCases = 0;
  let totalWinterCases = 0;
  let totalRevenue = 0;

  matchedRecords.forEach((r) => {
    const isoDate = getRecordIsoDate(r);
    const ym = isoDate ? isoDate.substring(0, 7) : 'Chưa rõ ngày';
    const season = determineSeason(isoDate, ctx.config.workingHours);
    const eq = typeof r.soLuong === 'number' ? r.soLuong : 1;
    const rev = Number(r.thanhTien || r.donGia || 0);
    const compKey = buildCompositeKey(r.patientId || '', isoDate, r.tenKT || '');
    const hasPkg = pkgSet.has(compKey) ? 1 : 0;

    if (season === 'Mùa Hè') totalSummerCases += 1;
    else totalWinterCases += 1;
    totalRevenue += rev;

    // Update Month bucket
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
      const ktName = (r.tenKT || '').trim();
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

  const artifacts: AIArtifact[] = [];

  // Artifact 1: Monthly & Seasonal Trend + Pivot Table
  artifacts.push({
    id: `pivot_month_season_${Date.now()}`,
    type: 'composite',
    title: `Phân tích Đa chiều: ${customLabel} — Theo Tháng & Mùa (Hè / Đông)`,
    subtitle: `Tổng số: ${matchedRecords.length} ca (Mùa Hè: ${totalSummerCases} ca | Mùa Đông: ${totalWinterCases} ca) — Kéo thanh trượt dưới biểu đồ để lọc khoảng tháng`,
    querySummary: `Liên kết bảng: Surgeries (${matchedRecords.length} ca) ⋈ WorkingHours (Mùa Hè/Đông) ⋈ ServicePackages ⋈ StaffList`,
    kpiCards: [
      { label: 'Tổng số ca khớp điều kiện', value: matchedRecords.length, tone: 'blue' },
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
        { key: 'surgeonCount', name: 'Số BS thực hiện', color: '#10b981', type: 'line', yAxisId: 'right' },
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
        { key: 'surgeonCount', label: 'Số PTV chính', align: 'right', format: 'number' },
        { key: 'packageCases', label: 'Số ca Gói DV', align: 'right', format: 'number' },
        { key: 'revenue', label: 'Doanh thu DVKT (VNĐ)', align: 'right', format: 'currency' },
      ],
      rows: monthRows,
    },
    rawRecords: matchedRecords.slice(0, 500).map((r, i) => ({
      STT: i + 1,
      MaBN: r.patientId,
      HoTenBN: r.patientName,
      NgayMo: getRecordIsoDate(r),
      Mua: determineSeason(getRecordIsoDate(r), ctx.config.workingHours),
      TenKyThuat: r.tenKT,
      LoaiPTTT: r.loaiPTTT,
      PTVChinh: r.ptChinh,
      PTPhu: r.ptPhu,
      BSGayMe: r.bsGM,
      ThanhTien: r.thanhTien || r.donGia || 0,
    })),
    createdAt: Date.now(),
  });

  // Artifact 2: By Surgeon × Season Comparison
  if (surgeonRows.length > 0) {
    artifacts.push({
      id: `pivot_surgeon_season_${Date.now() + 1}`,
      type: 'composite',
      title: `So sánh theo Phẫu thuật viên chính × Mùa (Hè vs Đông) — ${customLabel}`,
      subtitle: `${surgeonRows.length} bác sĩ tham gia thực hiện (Phân tách số ca Mùa Hè, Mùa Đông và Kỹ thuật chủ lực)`,
      chartConfig: {
        chartType: 'bar',
        xAxisKey: 'surgeon',
        xAxisLabel: 'Phẫu thuật viên chính',
        enableBrush: surgeonRows.length > 8,
        stacked: false,
        series: [
          { key: 'summerCases', name: 'Mùa Hè (ca)', color: '#f59e0b', type: 'bar' },
          { key: 'winterCases', name: 'Mùa Đông (ca)', color: '#0284c7', type: 'bar' },
          { key: 'totalCases', name: 'Tổng số ca', color: '#0d9488', type: 'line' },
        ],
        data: surgeonRows.slice(0, 25),
      },
      tableConfig: {
        columns: [
          { key: 'stt', label: 'STT', align: 'center', format: 'number' },
          { key: 'surgeon', label: 'Bác sĩ (PTV Chính)', align: 'left' },
          { key: 'department', label: 'Khoa', align: 'left' },
          { key: 'totalCases', label: 'Tổng số ca', align: 'right', format: 'number' },
          { key: 'summerCases', label: 'Mùa Hè', align: 'right', format: 'number' },
          { key: 'winterCases', label: 'Mùa Đông', align: 'right', format: 'number' },
          { key: 'monthsCount', label: 'Số tháng có mổ', align: 'right', format: 'number' },
          { key: 'packageCases', label: 'Ca Gói DV', align: 'right', format: 'number' },
          { key: 'revenue', label: 'Doanh thu (VNĐ)', align: 'right', format: 'currency' },
          { key: 'topProcedures', label: 'Kỹ thuật thực hiện nhiều nhất', align: 'left' },
        ],
        rows: surgeonRows,
      },
      rawRecords: surgeonRows,
      createdAt: Date.now() + 1,
    });
  }

  // Also calculate breakdown by LOAI_PTTT
  const byLoai: Record<string, number> = {};
  LOAI_PTTT_ORDER.forEach((l) => (byLoai[l] = 0));
  matchedRecords.forEach((r) => {
    const l = (r.loaiPTTT || 'TKPL').trim();
    byLoai[l] = (byLoai[l] || 0) + 1;
  });

  const summaryText = `### Kết quả Phân tích Đa chiều Liên kết (${customLabel}):
- **Tổng số ca khớp điều kiện**: **${matchedRecords.length} ca** (Tổng doanh thu viện phí: **${totalRevenue.toLocaleString('vi-VN')} VNĐ**).
- **Phân tích theo Mùa làm việc**:
  + **Mùa Hè (01/05 – 30/09)**: **${totalSummerCases} ca** (${matchedRecords.length > 0 ? ((totalSummerCases / matchedRecords.length) * 100).toFixed(1) : 0}%)
  + **Mùa Đông (01/10 – 30/04)**: **${totalWinterCases} ca** (${matchedRecords.length > 0 ? ((totalWinterCases / matchedRecords.length) * 100).toFixed(1) : 0}%)
- **Phân loại PTTT**: ${Object.entries(byLoai)
    .filter(([, count]) => count > 0)
    .map(([k, v]) => `${k}: **${v}** ca`)
    .join(', ') || 'Không có'}.
- **Xu hướng theo Tháng**:
${monthRows
  .slice(0, 15)
  .map(
    (m) =>
      `  + Tháng **${m.monthKey}** (${m.season}): **${m.totalCases} ca** (SL quy đổi: ${m.equivalentCases}, ${m.surgeonCount} bác sĩ, ${m.packageCases} ca gói DV, Doanh thu: ${m.revenue.toLocaleString('vi-VN')}đ)`
  )
  .join('\n')}
- **Phân tích theo Bác sĩ (PTV chính) × Mùa**:
${surgeonRows
  .slice(0, 15)
  .map(
    (s) =>
      `  + BS **${s.surgeon}** (${s.department}): Tổng **${s.totalCases} ca** (Mùa Hè: **${s.summerCases}**, Mùa Đông: **${s.winterCases}**, Gói DV: ${s.packageCases}) — KT tiêu biểu: ${s.topProcedures}`
  )
  .join('\n')}`;

  return { summaryText, artifacts };
}

// ─── MASTER ORCHESTRATOR FOR USER QUERIES ────────────────────────────────────

/**
 * Tự động phân tích câu hỏi của người dùng, kích hoạt đồng thời các Tool truy vấn
 * liên kết cần thiết (Bệnh nhân, Nhân sự, Lịch trực, Gói DV, Pivot Đa chiều)
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
  const { months, years } = extractTimeConstraintsFromPrompt(prompt);
  const targetStaffNames = extractTargetStaffNames(prompt, ctx.config);

  // 1. Ensure surgery records for requested period
  const scopedRecords = await ensureSurgeryRecordsForQuery(ctx, months, years, executedTools);

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

  // Execute Multi-Dimensional Pivot if triggered or as default comprehensive analysis
  if (isPivotOrTrendQuery || sections.length === 0) {
    const pivotRes = executeMultiDimensionalPivotTool(ctx, scopedRecords, prompt);
    sections.push(pivotRes.summaryText);
    artifacts.push(...pivotRes.artifacts);
    executedTools.push({
      toolName: 'multi_dimensional_pivot',
      summary: `Phân tích đa chiều (Tháng × Mùa Hè/Đông × Bác sĩ × Loại PTTT × Doanh thu) trên ${scopedRecords.length} ca`,
      recordCount: scopedRecords.length,
    });
  }

  return {
    executedTools,
    contextDataForLLM: sections.join('\n\n---\n\n'),
    artifacts,
  };
}
