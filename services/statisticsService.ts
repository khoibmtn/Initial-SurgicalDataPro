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
  SurgeryNameStats,
  DailyAnomaly,
  LOAI_PTTT_ORDER,
} from '../types';
import { RolePrice } from '../contexts/ConfigContext';

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
  nameMap: Map<string, string>
): MonthlyAggregate {
  const byType: Record<string, number> = {};
  const byTypeEquivalent: Record<string, number> = {};
  const byName: Record<string, number> = {};
  const byNameEquivalent: Record<string, number> = {};
  const serviceCostByType: Record<string, number> = {};
  const laborCostByType: Record<string, number> = {};
  let totalServiceCost = 0;
  let totalLaborCost = 0;
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
  }

  if (hasMissingPrice) {
    missingPriceMonths.push(`${month}/${year}`);
  }

  return {
    month, year, actualCases: records.length,
    equivalentCases: Object.values(byTypeEquivalent).reduce((s, v) => s + v, 0),
    byType, byTypeEquivalent, byName, byNameEquivalent,
    serviceCost: totalServiceCost, laborCost: totalLaborCost,
    serviceCostByType, laborCostByType, dataSource,
  };
}

function aggregateDaily(
  records: PersistedSurgeryRecord[],
  priceVersions: SurgeryPriceVersion[],
  laborPrices: Record<string, RolePrice>
): DailyAggregate[] {
  const byDate = new Map<string, PersistedSurgeryRecord[]>();

  for (const r of records) {
    const dateKey = toLocalDateKey(r.ngayBD);
    if (!dateKey) continue;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(r);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  let cumCases = 0, cumEquiv = 0, cumSvcCost = 0, cumLabCost = 0;

  return sortedDates.map(date => {
    const recs = byDate.get(date)!;
    const byType: Record<string, number> = {};
    let daySvcCost = 0, dayLabCost = 0, dayEquiv = 0;

    for (const r of recs) {
      const loai = r.loaiPTTT || 'TKPL';
      const qty = r.soLuong || 1;
      byType[loai] = (byType[loai] || 0) + 1;
      dayEquiv += qty;
      const { price } = getServicePrice(loai, r.ngayBD, priceVersions);
      daySvcCost += price * qty;
      dayLabCost += getLaborCost(loai, qty, laborPrices);
    }

    cumCases += recs.length;
    cumEquiv += dayEquiv;
    cumSvcCost += daySvcCost;
    cumLabCost += dayLabCost;

    return {
      date, cases: recs.length, cumulative: cumCases,
      equivalentCases: dayEquiv, cumulativeEquivalent: cumEquiv,
      serviceCost: daySvcCost, cumulativeServiceCost: cumSvcCost,
      laborCost: dayLabCost, cumulativeLaborCost: cumLabCost, byType,
    };
  });
}

// --- Forecast ---

function calculateForecast(
  dailyData: DailyAggregate[],
  totalDaysInMonth: number,
  lastYearSameMonth: number
): ForecastData | null {
  const daysElapsed = dailyData.length;
  if (daysElapsed < 5) return null;

  const cumulative = dailyData.length > 0 ? dailyData[dailyData.length - 1].cumulative : 0;
  const dailyAvg = cumulative / daysElapsed;
  const forecast = Math.round(dailyAvg * totalDaysInMonth);

  return {
    daysElapsed, totalDaysInMonth, currentCumulative: cumulative,
    forecastTotal: forecast, lastYearSameMonth,
    completionVsLastYear: lastYearSameMonth > 0 ? Math.round(forecast / lastYearSameMonth * 100) : null,
    confidence: daysElapsed >= 20 ? 'high' : daysElapsed >= 10 ? 'medium' : 'low',
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
  selectedMonth?: number
): Promise<StatisticsData> {
  if (Math.abs(primaryYear - compareYear) > MAX_YEAR_RANGE) {
    throw new Error(`Chỉ hỗ trợ so sánh tối đa ${MAX_YEAR_RANGE} năm`);
  }

  const [primaryData, compareData] = await Promise.all([
    fetchRecordsForYear(primaryYear),
    fetchRecordsForYear(compareYear),
  ]);

  const allRecords = [
    ...primaryData.monthly, ...primaryData.daily,
    ...compareData.monthly, ...compareData.daily,
  ];

  if (allRecords.length > WARN_RECORD_THRESHOLD) {
    console.warn(`⚠ Large dataset: ${allRecords.length} records. Consider filtering.`);
  }

  const validation = validateRecords(allRecords);
  const missingPriceMonths: string[] = [];
  const nameMap = new Map<string, string>(); // normalized → original display name

  // Aggregate monthly for primary year
  const primary: MonthlyAggregate[] = [];
  for (let m = 1; m <= 12; m++) {
    const { records, source } = getRecordsForMonth(m, primaryYear, primaryData.monthly, primaryData.daily);
    primary.push(aggregateMonth(m, primaryYear, records, source, priceVersions, laborPrices, missingPriceMonths, nameMap));
  }

  // Aggregate monthly for compare year
  const compare: MonthlyAggregate[] = [];
  for (let m = 1; m <= 12; m++) {
    const { records, source } = getRecordsForMonth(m, compareYear, compareData.monthly, compareData.daily);
    compare.push(aggregateMonth(m, compareYear, records, source, priceVersions, laborPrices, missingPriceMonths, nameMap));
  }

  // Daily aggregation for the selected month (default = current calendar month)
  const now = new Date();
  const currentMonth = selectedMonth ?? (now.getMonth() + 1);
  const currentYear = now.getFullYear();
  let currentMonthDaily: DailyAggregate[] = [];
  let previousMonthDaily: DailyAggregate[] = [];
  let compareMonthDaily: DailyAggregate[] = [];

  // Always aggregate daily for the selected month from primary year
  const { records } = getRecordsForMonth(currentMonth, primaryYear, primaryData.monthly, primaryData.daily);
  currentMonthDaily = aggregateDaily(records, priceVersions, laborPrices);

  // Previous month daily
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? primaryYear - 1 : primaryYear;
  const prevData = prevMonthYear === primaryYear ? primaryData : (prevMonthYear === compareYear ? compareData : null);
  if (prevData) {
    const { records: prevRecords } = getRecordsForMonth(prevMonth, prevMonthYear, prevData.monthly, prevData.daily);
    previousMonthDaily = aggregateDaily(prevRecords, priceVersions, laborPrices);
  }

  // Compare year same month daily data
  const { records: compareRecords } = getRecordsForMonth(currentMonth, compareYear, compareData.monthly, compareData.daily);
  compareMonthDaily = aggregateDaily(compareRecords, priceVersions, laborPrices);

  // Forecast (only for current real month of current year)
  const isCurrentRealMonth = primaryYear === currentYear && currentMonth === (now.getMonth() + 1);
  const lastYearSameMonth = compare.find(m => m.month === currentMonth)?.actualCases ?? 0;
  const forecast = isCurrentRealMonth
    ? calculateForecast(currentMonthDaily, daysInMonth(currentMonth, currentYear), lastYearSameMonth)
    : null;

  // TOP surgeries
  const topSurgeries = buildTopSurgeries(primary, compare, nameMap);

  // Anomalies
  const anomalies = detectAnomalies(currentMonthDaily);

  // Pace vs last year
  const paceVsLastYear = calculatePace(currentMonthDaily, compareMonthDaily);

  // Target
  const targetCases = isCurrentRealMonth
    ? calculateTarget(primary, lastYearSameMonth)
    : null;

  validation.missingPriceMonths = missingPriceMonths;

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
