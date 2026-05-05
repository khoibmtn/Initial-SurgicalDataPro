/**
 * Statistics Service
 * Fetch records from Firestore + aggregate into monthly/daily stats
 * Includes: guardrails, timezone handling, data validation, forecast,
 * surgery-name aggregation, anomaly detection, pace tracking
 */
import { reportService } from './reportService';
import {
  PersistedSurgeryRecord,
  MonthlyAggregate,
  DailyAggregate,
  ForecastData,
  StatisticsData,
  DataValidationResult,
  SurgeryPriceVersion,
  SurgeryNamePrice,
  SurgeryNameStats,
  DailyAnomaly,
  LOAI_PTTT_ORDER,
} from '../types';
import { RolePrice } from '../contexts/ConfigContext';
import { getNamePrice } from './surgeryNamePriceService';

// --- Constants ---
const MAX_YEAR_RANGE = 3;
const WARN_RECORD_THRESHOLD = 10_000;

// --- Timezone-safe date helpers ---

function toLocalDateKey(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthYear(isoString: string): { month: number; year: number } | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

// --- Name normalization ---

/** Normalize tenKT: trim + lowercase + collapse whitespace. Preserves meaningful terms. */
function normalizeTenKT(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// --- Data Fetching ---

async function fetchRecordsForYear(year: number): Promise<{
  monthly: PersistedSurgeryRecord[];
  daily: PersistedSurgeryRecord[];
}> {
  const dateFrom = `${year}-01-01T00:00:00.000Z`;
  const dateTo = `${year}-12-31T23:59:59.999Z`;

  const [monthly, daily] = await Promise.all([
    reportService.getReports(dateFrom, dateTo, 'MONTHLY'),
    reportService.getReports(dateFrom, dateTo, 'DAILY'),
  ]);

  return { monthly, daily };
}

// --- Price Lookup ---

export function getServicePrice(
  loaiPTTT: string,
  dateStr: string,
  priceVersions: SurgeryPriceVersion[]
): { price: number; found: boolean } {
  const localDate = toLocalDateKey(dateStr);
  if (!localDate) return { price: 0, found: false };

  const applicable = priceVersions
    .filter(v => v.effectiveFrom <= localDate && (!v.effectiveTo || v.effectiveTo >= localDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  if (applicable.length === 0) {
    return { price: 0, found: false };
  }

  return {
    price: applicable[0].prices?.[loaiPTTT] ?? 0,
    found: true,
  };
}

function getLaborCost(
  loaiPTTT: string,
  soLuong: number,
  laborPrices: Record<string, RolePrice>
): number {
  const rolePrice = laborPrices[loaiPTTT];
  if (!rolePrice) return 0;
  const perCa = (rolePrice['Chính'] || 0) + (rolePrice['Phụ'] || 0) + (rolePrice['Giúp việc'] || 0);
  return perCa * soLuong;
}

// --- Data Validation ---

function validateRecords(records: PersistedSurgeryRecord[]): DataValidationResult {
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const r of records) {
    const key = `${r.ngayBD}-${r.loaiPTTT}-${r.patientId}-${r.tenKT}`;
    if (seen.has(key)) {
      duplicateCount++;
    }
    seen.add(key);
  }

  return {
    duplicateCount,
    missingPriceMonths: [],
    missingSurgeryNames: [],
    missingSurgeryNameRecords: [],
    totalRecords: records.length,
  };
}

// --- Aggregation ---

function getRecordsForMonth(
  month: number, year: number,
  monthlyRecords: PersistedSurgeryRecord[],
  dailyRecords: PersistedSurgeryRecord[]
): { records: PersistedSurgeryRecord[]; source: 'MONTHLY' | 'DAILY' } {
  const monthlyForMonth = monthlyRecords.filter(r => {
    const my = getMonthYear(r.ngayBD);
    return my && my.month === month && my.year === year;
  });

  if (monthlyForMonth.length > 0) {
    return { records: monthlyForMonth, source: 'MONTHLY' };
  }

  const dailyForMonth = dailyRecords.filter(r => {
    const my = getMonthYear(r.ngayBD);
    return my && my.month === month && my.year === year;
  });

  return { records: dailyForMonth, source: 'DAILY' };
}

function aggregateMonth(
  month: number, year: number,
  records: PersistedSurgeryRecord[],
  dataSource: 'MONTHLY' | 'DAILY',
  priceVersions: SurgeryPriceVersion[],
  laborPrices: Record<string, RolePrice>,
  missingPriceMonths: string[],
  nameMap: Map<string, string>,
  namePrices: SurgeryNamePrice[] = [],
  missingSurgeryNameTracker?: { names: Set<string>; records: { maBN: string; tenKT: string; ngayPT: string }[] }
): MonthlyAggregate {
  const byType: Record<string, number> = {};
  const byTypeEquivalent: Record<string, number> = {};
  const byName: Record<string, number> = {};
  const byNameEquivalent: Record<string, number> = {};
  const serviceCostByType: Record<string, number> = {};
  const laborCostByType: Record<string, number> = {};
  const namePriceCostByType: Record<string, number> = {};
  const namePriceCostByName: Record<string, number> = {};
  const maTuongDuongByName: Record<string, string> = {};
  let totalServiceCost = 0;
  let totalLaborCost = 0;
  let totalNamePriceCost = 0;
  let hasMissingPrice = false;

  for (const r of records) {
    const loai = r.loaiPTTT || 'TKPL';
    const qty = r.soLuong || 1;

    byType[loai] = (byType[loai] || 0) + 1;
    byTypeEquivalent[loai] = (byTypeEquivalent[loai] || 0) + qty;

    // Aggregate by surgery name
    const normalized = normalizeTenKT(r.tenKT);
    if (normalized) {
      byName[normalized] = (byName[normalized] || 0) + 1;
      byNameEquivalent[normalized] = (byNameEquivalent[normalized] || 0) + qty;
      if (!nameMap.has(normalized)) {
        nameMap.set(normalized, r.tenKT.trim());
      }
    }

    const { price, found } = getServicePrice(loai, r.ngayBD, priceVersions);
    if (!found) hasMissingPrice = true;
    const svcCost = price * qty;
    totalServiceCost += svcCost;
    serviceCostByType[loai] = (serviceCostByType[loai] || 0) + svcCost;

    const labCost = getLaborCost(loai, qty, laborPrices);
    totalLaborCost += labCost;
    laborCostByType[loai] = (laborCostByType[loai] || 0) + labCost;

    // Name-based price lookup
    const nameResult = getNamePrice(r.tenKT, r.ngayBD, namePrices);
    if (!nameResult.found && r.tenKT?.trim() && missingSurgeryNameTracker) {
      const name = r.tenKT.trim();
      const dateStr = r.ngayBD ? toLocalDateKey(r.ngayBD) : '';
      missingSurgeryNameTracker.names.add(name);
      missingSurgeryNameTracker.records.push({
        maBN: r.patientId || '',
        tenKT: name,
        ngayPT: dateStr,
      });
    }
    const npCost = nameResult.price * qty;
    totalNamePriceCost += npCost;
    namePriceCostByType[loai] = (namePriceCostByType[loai] || 0) + npCost;
    if (normalized) {
      namePriceCostByName[normalized] = (namePriceCostByName[normalized] || 0) + npCost;
      // Track maTuongDuong for chapter-based filtering
      if (nameResult.found && !maTuongDuongByName[normalized]) {
        const localDate = toLocalDateKey(r.ngayBD);
        const matched = namePrices.find(p =>
          normalizeTenKT(p.tenKT) === normalized &&
          p.effectiveFrom <= localDate &&
          (!p.effectiveTo || p.effectiveTo >= localDate) &&
          p.maTuongDuong
        );
        if (matched?.maTuongDuong) {
          maTuongDuongByName[normalized] = matched.maTuongDuong;
        }
      }
    }
  }

  if (hasMissingPrice) {
    missingPriceMonths.push(`${month}/${year}`);
  }

  return {
    month, year, actualCases: records.length,
    equivalentCases: Object.values(byTypeEquivalent).reduce((s, v) => s + v, 0),
    byType, byTypeEquivalent, byName, byNameEquivalent,
    serviceCost: totalServiceCost, laborCost: totalLaborCost,
    serviceCostByType, laborCostByType,
    namePriceCost: totalNamePriceCost, namePriceCostByType, namePriceCostByName,
    maTuongDuongByName,
    dataSource,
  };
}

function aggregateDaily(
  records: PersistedSurgeryRecord[],
  priceVersions: SurgeryPriceVersion[],
  laborPrices: Record<string, RolePrice>,
  namePrices: SurgeryNamePrice[] = []
): DailyAggregate[] {
  const byDate = new Map<string, PersistedSurgeryRecord[]>();

  for (const r of records) {
    const dateKey = toLocalDateKey(r.ngayBD);
    if (!dateKey) continue;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(r);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  let cumCases = 0, cumEquiv = 0, cumSvcCost = 0, cumLabCost = 0, cumNameCost = 0;

  return sortedDates.map(date => {
    const recs = byDate.get(date)!;
    const byType: Record<string, number> = {};
    let daySvcCost = 0, dayLabCost = 0, dayEquiv = 0, dayNameCost = 0;

    for (const r of recs) {
      const loai = r.loaiPTTT || 'TKPL';
      const qty = r.soLuong || 1;
      byType[loai] = (byType[loai] || 0) + 1;
      dayEquiv += qty;
      const { price } = getServicePrice(loai, r.ngayBD, priceVersions);
      daySvcCost += price * qty;
      dayLabCost += getLaborCost(loai, qty, laborPrices);
      const nameResult = getNamePrice(r.tenKT, r.ngayBD, namePrices);
      dayNameCost += nameResult.price * qty;
    }

    cumCases += recs.length;
    cumEquiv += dayEquiv;
    cumSvcCost += daySvcCost;
    cumLabCost += dayLabCost;
    cumNameCost += dayNameCost;

    return {
      date, cases: recs.length, cumulative: cumCases,
      equivalentCases: dayEquiv, cumulativeEquivalent: cumEquiv,
      serviceCost: daySvcCost, cumulativeServiceCost: cumSvcCost,
      laborCost: dayLabCost, cumulativeLaborCost: cumLabCost,
      namePriceCost: dayNameCost, cumulativeNamePriceCost: cumNameCost,
      byType,
    };
  });
}

// --- Forecast V5+ — Cumulative Seasonal Model ---

/**
 * Tết Nguyên Đán windows — tháng chính bị ảnh hưởng và số ngày nghỉ.
 * Cập nhật thủ công hàng năm hoặc khi biết lịch Tết.
 */
const TET_CALENDAR: Record<number, { month: number; days: number }> = {
  2024: { month: 2, days: 8 },   // Tết 10/02/2024
  2025: { month: 1, days: 8 },   // Tết 29/01/2025
  2026: { month: 2, days: 8 },   // Tết 17/02/2026
  2027: { month: 2, days: 7 },   // Tết 06/02/2027
  2028: { month: 1, days: 8 },   // Tết 26/01/2028
};

/** Known fixed holidays (MM-DD) — same every year ±1 day */
const FIXED_HOLIDAYS = ['01-01', '04-30', '05-01', '09-02'];

/** Build multi-year weighted seasonal index */
function buildSeasonalIndex(
  recentYear: MonthlyAggregate[],
  prevYear?: MonthlyAggregate[]
): number[] {
  const totalRecent = recentYear.reduce((s, m) => s + m.actualCases, 0);
  if (totalRecent === 0) return new Array(12).fill(1 / 12);

  const indexRecent = recentYear.map(m => m.actualCases / totalRecent);

  if (!prevYear) return indexRecent;

  const totalPrev = prevYear.reduce((s, m) => s + m.actualCases, 0);
  if (totalPrev === 0) return indexRecent;

  const indexPrev = prevYear.map(m => m.actualCases / totalPrev);
  return indexRecent.map((v, i) => 0.65 * v + 0.35 * indexPrev[i]);
}

/** Adjust seasonal index for Tết influence */
function adjustSeasonalForTet(
  seasonality: number[],
  forecastYear: number,
  referenceYears: number[]
): number[] {
  const tetThis = TET_CALENDAR[forecastYear];
  if (!tetThis) return seasonality; // no Tết data → no adjustment

  // Check if reference years had Tết in a different month
  const refTetMonths = referenceYears
    .map(y => TET_CALENDAR[y]?.month)
    .filter(Boolean);

  const allSameMonth = refTetMonths.every(m => m === tetThis.month);
  if (allSameMonth) return seasonality; // Tết in same month → seasonal already captures it

  // Tết shifted between months → reduce seasonal confidence for affected months
  const adjusted = [...seasonality];
  const WORKING_DAYS = 22;
  const reduction = (WORKING_DAYS - tetThis.days) / WORKING_DAYS;

  // Lighten the Tết month's seasonal (it will be lower than reference)
  adjusted[tetThis.month - 1] *= reduction;

  // Redistribute to other months proportionally
  const deficit = seasonality[tetThis.month - 1] - adjusted[tetThis.month - 1];
  const otherTotal = adjusted.reduce((s, v, i) => i === tetThis.month - 1 ? s : s + v, 0);
  for (let i = 0; i < 12; i++) {
    if (i !== tetThis.month - 1 && otherTotal > 0) {
      adjusted[i] += deficit * (adjusted[i] / otherTotal);
    }
  }

  return adjusted;
}

/** Continuous seasonal weight function: progress [0,1] → weight [0.85, 0.15] */
function calcSeasonalWeight(progress: number, isTetMonth: boolean): number {
  const base = Math.max(0.15, 0.85 - 0.70 * Math.min(progress / 0.8, 1.0));
  return isTetMonth ? base * 0.75 : base;
}

/** Compute median of an array */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Count known holidays in remaining days of the month */
function countHolidaysInRange(year: number, month: number, fromDay: number, toDay: number): number {
  let count = 0;
  for (const mmdd of FIXED_HOLIDAYS) {
    const [mm, dd] = mmdd.split('-').map(Number);
    if (mm === month && dd >= fromDay && dd <= toDay) count++;
  }
  // Tết days
  const tet = TET_CALENDAR[year];
  if (tet && tet.month === month) {
    // Rough: Tết ~centered in the month, spanning tet.days
    // For simplicity, just flag that this month has Tết
    // Actual day-level exclusion would need exact start date
  }
  return count;
}

/**
 * V5+ Forecast Engine
 *
 * Steps:
 * 1. Build seasonal index (multi-year weighted)
 * 2. Calculate cumulative seasonal → year estimate
 * 3. Seasonal month forecast = yearEstimate × seasonality[m]
 * 4. Run-rate (median when ≥7 days, else mean)
 * 5. Continuous blend with soft signals
 * 6. Top-down future months
 */
function calculateForecast(
  dailyData: DailyAggregate[],
  totalDaysInMonth: number,
  lastYearSameMonth: number,
  primaryMonthly: MonthlyAggregate[],
  compareMonthly: MonthlyAggregate[],
  currentMonth: number,
  primaryYear: number,
  compareYear: number,
  prevYearMonthly?: MonthlyAggregate[]
): ForecastData | null {
  const daysElapsed = dailyData.length;
  if (daysElapsed < 3) return null;

  const cumulative = dailyData.length > 0 ? dailyData[dailyData.length - 1].cumulative : 0;

  // --- STEP 1: Seasonal Index ---
  // Use compare year as primary reference, prevYear (if available) as secondary
  const seasonality = (() => {
    const rawIndex = buildSeasonalIndex(compareMonthly, prevYearMonthly);
    const refYears = prevYearMonthly ? [compareYear, compareYear - 1] : [compareYear];
    return adjustSeasonalForTet(rawIndex, primaryYear, refYears);
  })();

  // --- STEP 2: Year Estimate (cumulative seasonal) ---
  const completedMonths = primaryMonthly.filter(m => m.month < currentMonth && m.actualCases > 0);
  const completedCum = completedMonths.reduce((s, m) => s + m.actualCases, 0);
  const totalCum = completedCum + cumulative;

  // Seasonal cumulative: full months + partial current month
  const completedSeasonalCum = seasonality
    .slice(0, currentMonth - 1)
    .reduce((s, v) => s + v, 0);
  const partialSeasonalCum = seasonality[currentMonth - 1] * (daysElapsed / totalDaysInMonth);
  const seasonalCum = completedSeasonalCum + partialSeasonalCum;

  // Year estimate with safety threshold
  let yearEstimate: number | null = null;
  let modelNote = '';

  if (seasonalCum >= 0.15) {
    yearEstimate = Math.round(totalCum / seasonalCum);
    modelNote = 'seasonal';
  } else {
    modelNote = 'fallback (seasonalCum < 15%)';
  }

  // --- STEP 3: Seasonal month forecast ---
  const seasonalForecast = yearEstimate !== null
    ? yearEstimate * seasonality[currentMonth - 1]
    : null;

  // --- STEP 4: Run-rate (improved) ---
  const dailyCases = dailyData.map(d => d.cases);

  // Exclude known holidays from run-rate calculation
  const nonHolidayCases = dailyData.filter(d => {
    const mmdd = d.date.slice(5); // "MM-DD"
    return !FIXED_HOLIDAYS.includes(mmdd) && d.cases > 0;
  }).map(d => d.cases);

  const effectiveDailyCases = nonHolidayCases.length >= 3 ? nonHolidayCases : dailyCases;
  const dailyAvg = effectiveDailyCases.length >= 7
    ? median(effectiveDailyCases.slice(-7))
    : effectiveDailyCases.reduce((s, v) => s + v, 0) / effectiveDailyCases.length;

  const remainingDays = totalDaysInMonth - daysElapsed;
  const holidaysRemaining = countHolidaysInRange(primaryYear, currentMonth, daysElapsed + 1, totalDaysInMonth);
  const effectiveRemainingDays = Math.max(0, remainingDays - holidaysRemaining);
  const runRateForecast = cumulative + dailyAvg * effectiveRemainingDays;

  // --- STEP 5: Blend with continuous weight + soft signals ---
  const progress = daysElapsed / totalDaysInMonth;
  const isTetMonth = TET_CALENDAR[primaryYear]?.month === currentMonth;
  let wSeasonal = calcSeasonalWeight(progress, isTetMonth);

  // Soft signals (only when ≥10 days of data for stability)
  if (seasonalForecast !== null && daysElapsed >= 10) {
    const expectedAvg = seasonalForecast / totalDaysInMonth;
    const actualAvg = cumulative / daysElapsed;
    const k = 0.4;

    // Baseline signal: level detection
    if (expectedAvg > 0) {
      const baselineSignal = actualAvg / expectedAvg;
      const baselineAdj = Math.max(0.9, Math.min(1.1, 1 + k * (baselineSignal - 1)));
      wSeasonal *= baselineAdj;
    }

    // Trend signal: direction detection (compare recent half vs first half)
    if (daysElapsed >= 14) {
      const halfPoint = Math.floor(daysElapsed / 2);
      const firstHalf = dailyCases.slice(0, halfPoint);
      const secondHalf = dailyCases.slice(halfPoint);
      const medFirst = median(firstHalf);
      const medSecond = median(secondHalf);
      if (medFirst > 0) {
        const trendRatio = medSecond / medFirst;
        const trendAdj = Math.max(0.9, Math.min(1.1, 1 + k * (trendRatio - 1)));
        wSeasonal *= trendAdj;
      }
    }
  }

  // Clamp final weight
  wSeasonal = Math.max(0.10, Math.min(0.90, wSeasonal));

  // Final blend
  let forecastTotal: number;
  if (seasonalForecast !== null) {
    forecastTotal = Math.round(wSeasonal * seasonalForecast + (1 - wSeasonal) * runRateForecast);
    if (modelNote === 'seasonal') modelNote = `blend (w_s=${wSeasonal.toFixed(2)})`;
  } else {
    forecastTotal = Math.round(runRateForecast);
  }

  // --- STEP 6: Future months (top-down) ---
  const forecastMonthly: Record<number, number> = {};
  if (yearEstimate !== null) {
    let runCum = completedCum;

    for (let m = 1; m <= 12; m++) {
      if (m < currentMonth) {
        // Completed months: use actual
        runCum = primaryMonthly
          .filter(pm => pm.month <= m)
          .reduce((s, pm) => s + pm.actualCases, 0);
      } else if (m === currentMonth) {
        // Current month: use blended forecast
        runCum = completedCum + forecastTotal;
      } else {
        // Future months: top-down
        runCum += Math.round(yearEstimate * seasonality[m - 1]);
      }
      forecastMonthly[m] = runCum;
    }
  }

  // Confidence
  const confidence: 'low' | 'medium' | 'high' =
    daysElapsed >= 20 ? 'high' : daysElapsed >= 10 ? 'medium' : 'low';

  return {
    daysElapsed,
    totalDaysInMonth,
    currentCumulative: cumulative,
    forecastTotal,
    lastYearSameMonth,
    completionVsLastYear: lastYearSameMonth > 0 ? Math.round(forecastTotal / lastYearSameMonth * 100) : null,
    confidence,
    yearEstimate,
    forecastMonthly,
    seasonalWeight: wSeasonal,
    modelNote,
  };
}

// --- TOP Surgeries ---

function buildTopSurgeries(
  primary: MonthlyAggregate[],
  compare: MonthlyAggregate[],
  nameMap: Map<string, string>
): SurgeryNameStats[] {
  const totalByName: Record<string, number> = {};
  const equivByName: Record<string, number> = {};
  const monthlyByName: Record<string, number[]> = {};

  for (const m of primary) {
    for (const [normalized, count] of Object.entries(m.byName)) {
      totalByName[normalized] = (totalByName[normalized] || 0) + count;
      equivByName[normalized] = (equivByName[normalized] || 0) + (m.byNameEquivalent[normalized] || 0);
      if (!monthlyByName[normalized]) monthlyByName[normalized] = new Array(12).fill(0);
      monthlyByName[normalized][m.month - 1] += count;
    }
  }

  // Compare year totals
  const compareTotalByName: Record<string, number> = {};
  for (const m of compare) {
    for (const [normalized, count] of Object.entries(m.byName)) {
      compareTotalByName[normalized] = (compareTotalByName[normalized] || 0) + count;
    }
  }

  const totalAllCases = Object.values(totalByName).reduce((s, v) => s + v, 0);

  const sorted = Object.entries(totalByName)
    .sort((a, b) => b[1] - a[1]);

  return sorted.map(([normalized, total]) => {
    const compareTotal = compareTotalByName[normalized] ?? 0;
    let changeVsCompare: number | null = null;
    if (compareTotal > 0) {
      changeVsCompare = ((total - compareTotal) / compareTotal) * 100;
    } else if (total > 0) {
      changeVsCompare = null; // "MỚI"
    }

    return {
      name: nameMap.get(normalized) || normalized,
      normalizedName: normalized,
      totalCases: total,
      totalEquivalent: equivByName[normalized] || 0,
      percentage: totalAllCases > 0 ? (total / totalAllCases) * 100 : 0,
      changeVsCompare,
      monthlyBreakdown: monthlyByName[normalized] || new Array(12).fill(0),
    };
  });
}

// --- Anomaly Detection ---

function detectAnomalies(dailyData: DailyAggregate[]): DailyAnomaly[] {
  if (dailyData.length < 7) return []; // Guard: not enough data

  const totalCases = dailyData.reduce((s, d) => s + d.cases, 0);
  const avg = totalCases / dailyData.length;
  const anomalies: DailyAnomaly[] = [];

  for (const d of dailyData) {
    const parts = d.date.split('-');
    const display = `${parts[2]}/${parts[1]}`;

    if (d.cases === 0) {
      anomalies.push({ date: d.date, type: 'zero_cases', message: `Ngày ${display}: 0 ca` });
    } else if (d.cases < avg * 0.5) {
      anomalies.push({ date: d.date, type: 'drop_50pct', message: `Ngày ${display}: ${d.cases} ca (giảm mạnh, TB: ${avg.toFixed(1)})` });
    } else if (d.cases > avg * 2) {
      anomalies.push({ date: d.date, type: 'spike_200pct', message: `Ngày ${display}: ${d.cases} ca (tăng đột biến, TB: ${avg.toFixed(1)})` });
    }
  }

  return anomalies;
}

// --- Pace ---

function calculatePace(
  currentDaily: DailyAggregate[],
  compareDaily: DailyAggregate[]
): number | null {
  if (currentDaily.length === 0 || compareDaily.length === 0) return null;

  const today = new Date().getDate();
  const cumCurrent = currentDaily
    .filter(d => parseInt(d.date.split('-')[2]) <= today)
    .reduce((s, d) => s + d.cases, 0);
  const cumCompare = compareDaily
    .filter(d => parseInt(d.date.split('-')[2]) <= today)
    .reduce((s, d) => s + d.cases, 0);

  if (cumCompare === 0) return cumCurrent > 0 ? 100 : null;
  return ((cumCurrent / cumCompare) - 1) * 100;
}

// --- Target ---

function calculateTarget(primary: MonthlyAggregate[], compareMonthCases: number): number | null {
  const monthsWithData = primary.filter(m => m.actualCases > 0);
  if (monthsWithData.length === 0) return null;

  const last3 = monthsWithData.slice(-3);
  const avg3 = Math.round(last3.reduce((s, m) => s + m.actualCases, 0) / last3.length);

  return Math.max(avg3, compareMonthCases);
}

// --- Main Entry Point ---

export async function fetchAndAggregateStatistics(
  primaryYear: number,
  compareYear: number,
  priceVersions: SurgeryPriceVersion[],
  laborPrices: Record<string, RolePrice>,
  selectedMonth?: number,
  namePrices: SurgeryNamePrice[] = []
): Promise<StatisticsData> {
  if (Math.abs(primaryYear - compareYear) > MAX_YEAR_RANGE) {
    throw new Error(`Chỉ hỗ trợ so sánh tối đa ${MAX_YEAR_RANGE} năm`);
  }

  const [primaryData, compareData] = await Promise.all([
    fetchRecordsForYear(primaryYear),
    fetchRecordsForYear(compareYear),
  ]);

  // Yield to browser — allow UI to process pending events
  await new Promise(resolve => setTimeout(resolve, 0));

  const allRecords = [
    ...primaryData.monthly, ...primaryData.daily,
    ...compareData.monthly, ...compareData.daily,
  ];

  if (allRecords.length > WARN_RECORD_THRESHOLD) {
    console.warn(`⚠ Large dataset: ${allRecords.length} records. Consider filtering.`);
  }

  const validation = validateRecords(allRecords);
  const missingPriceMonths: string[] = [];
  const missingSurgeryNameTracker = {
    names: new Set<string>(),
    records: [] as { maBN: string; tenKT: string; ngayPT: string }[],
  };
  const nameMap = new Map<string, string>(); // normalized → original display name

  // Aggregate monthly for primary year
  const primary: MonthlyAggregate[] = [];
  for (let m = 1; m <= 12; m++) {
    const { records, source } = getRecordsForMonth(m, primaryYear, primaryData.monthly, primaryData.daily);
    primary.push(aggregateMonth(m, primaryYear, records, source, priceVersions, laborPrices, missingPriceMonths, nameMap, namePrices, missingSurgeryNameTracker));
  }

  // Yield after primary aggregation (heaviest stage)
  await new Promise(resolve => setTimeout(resolve, 0));

  // Aggregate monthly for compare year
  const compare: MonthlyAggregate[] = [];
  for (let m = 1; m <= 12; m++) {
    const { records, source } = getRecordsForMonth(m, compareYear, compareData.monthly, compareData.daily);
    compare.push(aggregateMonth(m, compareYear, records, source, priceVersions, laborPrices, missingPriceMonths, nameMap, namePrices, missingSurgeryNameTracker));
  }

  // Yield after compare aggregation
  await new Promise(resolve => setTimeout(resolve, 0));

  // Daily aggregation for the selected month (default = current calendar month)
  const now = new Date();
  const currentMonth = selectedMonth ?? (now.getMonth() + 1);
  const currentYear = now.getFullYear();
  let currentMonthDaily: DailyAggregate[] = [];
  let previousMonthDaily: DailyAggregate[] = [];
  let compareMonthDaily: DailyAggregate[] = [];

  // Always aggregate daily for the selected month from primary year
  const { records } = getRecordsForMonth(currentMonth, primaryYear, primaryData.monthly, primaryData.daily);
  currentMonthDaily = aggregateDaily(records, priceVersions, laborPrices, namePrices);

  // Previous month daily
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? primaryYear - 1 : primaryYear;
  const prevData = prevMonthYear === primaryYear ? primaryData : (prevMonthYear === compareYear ? compareData : null);
  if (prevData) {
    const { records: prevRecords } = getRecordsForMonth(prevMonth, prevMonthYear, prevData.monthly, prevData.daily);
    previousMonthDaily = aggregateDaily(prevRecords, priceVersions, laborPrices, namePrices);
  }

  // Compare year same month daily data
  const { records: compareRecords } = getRecordsForMonth(currentMonth, compareYear, compareData.monthly, compareData.daily);
  compareMonthDaily = aggregateDaily(compareRecords, priceVersions, laborPrices, namePrices);

  // Yield after daily aggregation
  await new Promise(resolve => setTimeout(resolve, 0));

  // Forecast (only when viewing current year)
  const isCurrentYear = primaryYear === currentYear;
  const realMonth = now.getMonth() + 1;
  const lastYearSameMonth = compare.find(m => m.month === realMonth)?.actualCases ?? 0;
  let forecast: ForecastData | null = null;
  if (isCurrentYear) {
    // Fetch previous year (compareYear - 1) for multi-year seasonal smoothing
    let prevYearMonthly: MonthlyAggregate[] | undefined;
    try {
      const prevYearNum = compareYear - 1;
      if (prevYearNum >= primaryYear - MAX_YEAR_RANGE) {
        const prevYearData = await fetchRecordsForYear(prevYearNum);
        const prevNameMap = new Map<string, string>();
        prevYearMonthly = [];
        for (let m = 1; m <= 12; m++) {
          const { records: pRecords, source: pSource } = getRecordsForMonth(m, prevYearNum, prevYearData.monthly, prevYearData.daily);
          prevYearMonthly.push(aggregateMonth(m, prevYearNum, pRecords, pSource, priceVersions, laborPrices, [], prevNameMap, namePrices));
        }
      }
    } catch { /* gracefully degrade to single-year index */ }

    // Get daily data for the real current month (not selectedMonth which is for chart)
    const { records: forecastRecords } = getRecordsForMonth(realMonth, primaryYear, primaryData.monthly, primaryData.daily);
    const forecastDailyData = aggregateDaily(forecastRecords, priceVersions, laborPrices, namePrices);
    forecast = calculateForecast(
      forecastDailyData, daysInMonth(realMonth, currentYear), lastYearSameMonth,
      primary, compare, realMonth, primaryYear, compareYear, prevYearMonthly
    );
  }

  // Yield before final assembly
  await new Promise(resolve => setTimeout(resolve, 0));

  // TOP surgeries
  const topSurgeries = buildTopSurgeries(primary, compare, nameMap);

  // Anomalies
  const anomalies = detectAnomalies(currentMonthDaily);

  // Pace vs last year
  const paceVsLastYear = calculatePace(currentMonthDaily, compareMonthDaily);

  // Target
  const targetCases = isCurrentYear
    ? calculateTarget(primary, lastYearSameMonth)
    : null;

  validation.missingPriceMonths = missingPriceMonths;
  validation.missingSurgeryNames = Array.from(missingSurgeryNameTracker.names).sort((a, b) => a.localeCompare(b, 'vi'));
  validation.missingSurgeryNameRecords = missingSurgeryNameTracker.records
    .sort((a, b) => a.tenKT.localeCompare(b.tenKT, 'vi') || a.ngayPT.localeCompare(b.ngayPT));

  return {
    primaryYear, compareYear, selectedMonth: currentMonth,
    primary, compare,
    currentMonthDaily, previousMonthDaily, compareMonthDaily,
    forecast, topSurgeries, anomalies,
    paceVsLastYear, targetCases, validation,
  };
}

// --- Export Excel ---

export async function exportStatisticsToExcel(data: StatisticsData): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const { primary, compare, currentMonthDaily, forecast, topSurgeries } = data;

  // --- Sheet 1: Tổng hợp tháng ---
  const monthHeaders = ['Chỉ tiêu', ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`), 'Cả năm'];
  const totalCasesPrimary = primary.reduce((s: number, m: MonthlyAggregate) => s + m.actualCases, 0);
  const totalEquivPrimary = primary.reduce((s: number, m: MonthlyAggregate) => s + m.equivalentCases, 0);
  const totalSvcCost = primary.reduce((s: number, m: MonthlyAggregate) => s + m.serviceCost, 0);
  const totalLabCost = primary.reduce((s: number, m: MonthlyAggregate) => s + m.laborCost, 0);

  const sheetData1 = [
    monthHeaders,
    ['Số ca thực tế', ...primary.map(m => m.actualCases || ''), totalCasesPrimary],
    ['SL quy đổi', ...primary.map(m => m.equivalentCases || ''), totalEquivPrimary],
    ['Nguồn dữ liệu', ...primary.map(m => m.dataSource), ''],
    ['So sánh cùng kỳ (%)', ...primary.map((m, i) => {
      const prev = compare[i]?.actualCases ?? 0;
      if (prev === 0) return m.actualCases > 0 ? '+100%' : '';
      return `${(((m.actualCases - prev) / prev) * 100).toFixed(1)}%`;
    }), ''],
    ['Chi phí DV (VNĐ)', ...primary.map(m => m.serviceCost || ''), totalSvcCost],
    ['Chi phí NC (VNĐ)', ...primary.map(m => m.laborCost || ''), totalLabCost],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheetData1);
  ws1['!cols'] = [{ wch: 22 }, ...Array(13).fill({ wch: 12 })];
  XLSX.utils.book_append_sheet(wb, ws1, `Tổng hợp ${data.primaryYear}`);

  // --- Sheet 2: Chi tiết loại PT/TT ---
  const typeHeaders = ['Loại', ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`), 'Tổng', 'Tỷ trọng'];
  const sheetData2: any[][] = [typeHeaders];
  for (const code of LOAI_PTTT_ORDER) {
    const total = primary.reduce((s: number, m: MonthlyAggregate) => s + (m.byType[code] || 0), 0);
    const pct = totalCasesPrimary > 0 ? `${(total / totalCasesPrimary * 100).toFixed(1)}%` : '';
    sheetData2.push([code, ...primary.map(m => (m.byType[code] || 0) > 0 ? m.byType[code] : ''), total || '', pct] as any[]);
  }
  sheetData2.push(['Tổng', ...primary.map(m => m.actualCases || ''), totalCasesPrimary, '100%'] as any[]);

  const ws2 = XLSX.utils.aoa_to_sheet(sheetData2);
  ws2['!cols'] = [{ wch: 10 }, ...Array(14).fill({ wch: 10 })];
  XLSX.utils.book_append_sheet(wb, ws2, `Loại PT-TT ${data.primaryYear}`);

  // --- Sheet 3: TOP phẫu thuật ---
  if (topSurgeries.length > 0) {
    const topHeaders = ['#', 'Tên kỹ thuật', 'Số ca', 'Quy đổi', '%', 'vs cùng kỳ', ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`)];
    const sheetData3: any[][] = [topHeaders];
    topSurgeries.forEach((s, i) => {
      const change = s.changeVsCompare !== null ? `${s.changeVsCompare > 0 ? '+' : ''}${s.changeVsCompare.toFixed(1)}%` : 'MỚI';
      sheetData3.push([i + 1, s.name, s.totalCases, s.totalEquivalent, `${s.percentage.toFixed(1)}%`, change, ...s.monthlyBreakdown] as any[]);
    });

    const ws3 = XLSX.utils.aoa_to_sheet(sheetData3);
    ws3['!cols'] = [{ wch: 4 }, { wch: 35 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, ...Array(12).fill({ wch: 6 })];
    XLSX.utils.book_append_sheet(wb, ws3, `TOP PT ${data.primaryYear}`);
  }

  // --- Sheet 4: Theo ngày (tháng hiện tại) ---
  if (currentMonthDaily.length > 0) {
    const currentMonth = new Date().getMonth() + 1;
    const dailyHeaders = ['Ngày', 'Số ca', 'Lũy kế', 'CP DV', 'CP DV lũy kế', 'CP NC', 'CP NC lũy kế'];
    const sheetData4 = [dailyHeaders];
    for (const d of currentMonthDaily) {
      const parts = d.date.split('-');
      sheetData4.push([`${parts[2]}/${parts[1]}`, d.cases, d.cumulative, d.serviceCost, d.cumulativeServiceCost, d.laborCost, d.cumulativeLaborCost] as any);
    }
    if (forecast) {
      sheetData4.push([]);
      sheetData4.push([`Dự báo: ${forecast.forecastTotal} ca`, `Tin cậy: ${forecast.confidence}`, `${forecast.daysElapsed}/${forecast.totalDaysInMonth} ngày`] as any);
    }

    const ws4 = XLSX.utils.aoa_to_sheet(sheetData4);
    ws4['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws4, `Ngày T${currentMonth}`);
  }

  // --- Sheet 5: So sánh năm ---
  const compareHeaders = ['Tháng', `Ca ${data.primaryYear}`, `Ca ${data.compareYear}`, 'Thay đổi', `QĐ ${data.primaryYear}`, `QĐ ${data.compareYear}`];
  const sheetData5 = [compareHeaders];
  for (let i = 0; i < 12; i++) {
    const pCases = primary[i]?.actualCases || 0;
    const cCases = compare[i]?.actualCases || 0;
    const change = cCases > 0 ? `${(((pCases - cCases) / cCases) * 100).toFixed(1)}%` : '';
    sheetData5.push([`T${i + 1}`, pCases, cCases, change, primary[i]?.equivalentCases || 0, compare[i]?.equivalentCases || 0] as any);
  }

  const ws5 = XLSX.utils.aoa_to_sheet(sheetData5);
  ws5['!cols'] = [{ wch: 8 }, ...Array(5).fill({ wch: 14 })];
  XLSX.utils.book_append_sheet(wb, ws5, 'So sánh');

  const fileName = `ThongKe_PTTT_${data.primaryYear}_vs_${data.compareYear}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
