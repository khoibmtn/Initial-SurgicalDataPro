/**
 * Surgery Name Price Service
 * CRUD + lookup for per-surgery-name pricing in Firebase RTDB
 * Flat structure: 1 record = 1 tenKT + 1 price + effectiveFrom/To
 */
import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { SurgeryNamePrice } from '../types';
import { reportService } from './reportService';

const NAME_PRICES_PATH = 'surgery_name_prices';

// --- Normalize ---

/** Normalize tenKT for matching: trim + collapse whitespace (preserve case for display, lowercase for compare) */
function normalizeForMatch(name: string): string {
  if (!name) return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// --- Lookup ---

/** Find price for a specific tenKT at a specific surgery date */
export function getNamePrice(
  tenKT: string,
  dateStr: string,
  namePrices: SurgeryNamePrice[]
): { price: number; found: boolean } {
  if (!tenKT || !dateStr) return { price: 0, found: false };

  const normalizedName = normalizeForMatch(tenKT);
  // Extract date part: "2024-05-20T08:30:00" → "2024-05-20"
  const localDate = dateStr.substring(0, 10);

  const applicable = namePrices
    .filter(p => {
      if (normalizeForMatch(p.tenKT) !== normalizedName) return false;
      if (p.effectiveFrom > localDate) return false;
      if (p.effectiveTo && p.effectiveTo < localDate) return false;
      return true;
    })
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  if (applicable.length === 0) {
    return { price: 0, found: false };
  }

  return {
    price: applicable[0].price ?? 0,
    found: true,
  };
}

// --- Realtime Subscription ---

export function subscribeToSurgeryNamePrices(
  callback: (prices: SurgeryNamePrice[]) => void
): () => void {
  const pricesRef = ref(db, NAME_PRICES_PATH);
  const unsubscribe = onValue(pricesRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const prices: SurgeryNamePrice[] = Object.entries(data).map(([key, val]: [string, any]) => ({
      id: key,
      tenKT: val.tenKT || '',
      price: val.price || 0,
      effectiveFrom: val.effectiveFrom || '',
      effectiveTo: val.effectiveTo || null,
      createdAt: val.createdAt || 0,
      maTuongDuong: val.maTuongDuong || val.note || '',
    }));

    // Sort by tenKT then effectiveFrom desc
    prices.sort((a, b) => {
      const cmp = a.tenKT.localeCompare(b.tenKT, 'vi');
      if (cmp !== 0) return cmp;
      return b.effectiveFrom.localeCompare(a.effectiveFrom);
    });

    callback(prices);
  });

  return unsubscribe;
}

// --- CRUD ---

export async function createSurgeryNamePrice(
  data: Omit<SurgeryNamePrice, 'id' | 'createdAt'>
): Promise<string> {
  const pricesRef = ref(db, NAME_PRICES_PATH);
  const newRef = push(pricesRef);
  await set(newRef, { ...data, createdAt: Date.now() });
  return newRef.key!;
}

export async function updateSurgeryNamePrice(
  id: string,
  updates: Partial<Omit<SurgeryNamePrice, 'id' | 'createdAt'>>
): Promise<void> {
  const versionRef = ref(db, `${NAME_PRICES_PATH}/${id}`);
  await update(versionRef, updates);
}

export async function deleteSurgeryNamePrice(id: string): Promise<void> {
  const versionRef = ref(db, `${NAME_PRICES_PATH}/${id}`);
  await remove(versionRef);
}

/** Bulk create multiple price records (for initial seeding) */
export async function bulkCreateSurgeryNamePrices(
  items: Omit<SurgeryNamePrice, 'id' | 'createdAt'>[]
): Promise<number> {
  let created = 0;
  const batchSize = 50;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const updates: Record<string, any> = {};

    for (const item of batch) {
      const newRef = push(ref(db, NAME_PRICES_PATH));
      updates[`${NAME_PRICES_PATH}/${newRef.key}`] = {
        ...item,
        createdAt: Date.now(),
      };
    }

    await update(ref(db), updates);
    created += batch.length;
  }

  return created;
}

/** Upsert: match on normalize(tenKT) + effectiveFrom → update if exists, create if not */
export async function bulkUpsertSurgeryNamePrices(
  items: Omit<SurgeryNamePrice, 'id' | 'createdAt'>[],
  existingPrices: SurgeryNamePrice[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  // Build lookup: key = normalizedName|effectiveFrom → existing id
  const existingMap = new Map<string, string>();
  for (const p of existingPrices) {
    const key = `${normalizeForMatch(p.tenKT)}|${p.effectiveFrom}`;
    existingMap.set(key, p.id);
  }

  const batchSize = 50;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const updates: Record<string, any> = {};

    for (const item of batch) {
      const key = `${normalizeForMatch(item.tenKT)}|${item.effectiveFrom}`;
      const existingId = existingMap.get(key);

      if (existingId) {
        // Update existing record
        updates[`${NAME_PRICES_PATH}/${existingId}/price`] = item.price;
        updates[`${NAME_PRICES_PATH}/${existingId}/effectiveTo`] = item.effectiveTo ?? null;
        updates[`${NAME_PRICES_PATH}/${existingId}/maTuongDuong`] = item.maTuongDuong ?? '';
        updated++;
      } else {
        // Create new record
        const newRef = push(ref(db, NAME_PRICES_PATH));
        updates[`${NAME_PRICES_PATH}/${newRef.key}`] = {
          ...item,
          createdAt: Date.now(),
        };
        created++;
      }
    }

    await update(ref(db), updates);
  }

  return { created, updated };
}

/** Bulk delete multiple price records by ID */
export async function bulkDeleteSurgeryNamePrices(ids: string[]): Promise<number> {
  const batchSize = 50;
  let deleted = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const updates: Record<string, any> = {};

    for (const id of batch) {
      updates[`${NAME_PRICES_PATH}/${id}`] = null;
    }

    await update(ref(db), updates);
    deleted += batch.length;
  }

  return deleted;
}

// --- Extract + Seed Missing Prices ---

interface SurgeryNameDatePair {
  tenKT: string;
  surgeryDate: string; // yyyy-mm-dd
}

/** Scan RTDB records for years 2024-2026, extract all (tenKT, date) pairs */
async function extractSurgeryNameDatePairs(
  years: number[] = [2024, 2025, 2026]
): Promise<SurgeryNameDatePair[]> {
  const pairSet = new Map<string, SurgeryNameDatePair>();

  for (const year of years) {
    const dateFrom = `${year}-01-01T00:00:00.000Z`;
    const dateTo = `${year}-12-31T23:59:59.999Z`;

    const [monthly, daily] = await Promise.all([
      reportService.getReports(dateFrom, dateTo, 'MONTHLY'),
      reportService.getReports(dateFrom, dateTo, 'DAILY'),
    ]);

    for (const rec of [...monthly, ...daily]) {
      const name = rec.tenKT?.trim();
      const dateStr = rec.ngayBD || '';
      if (!name || !dateStr) continue;
      const localDate = dateStr.substring(0, 10); // yyyy-mm-dd
      const key = `${normalizeForMatch(name)}|${localDate}`;
      if (!pairSet.has(key)) {
        pairSet.set(key, { tenKT: name, surgeryDate: localDate });
      }
    }
  }

  return Array.from(pairSet.values());
}

/** Seed DB: only add (tenKT, date) pairs where no matching price is found */
export async function seedSurgeryNamePrices(
  existingPrices: SurgeryNamePrice[],
  onProgress?: (msg: string) => void
): Promise<{ added: number; skipped: number }> {
  onProgress?.('Đang quét dữ liệu 2024-2026...');
  const pairs = await extractSurgeryNameDatePairs();

  onProgress?.(`Tìm thấy ${pairs.length} cặp (tên PT, ngày). Đang kiểm tra giá...`);

  // Filter: only pairs where getNamePrice returns found=false
  const missingPairs: SurgeryNameDatePair[] = [];
  // Also deduplicate by normalized tenKT + effectiveFrom
  const addedKeys = new Set<string>();

  for (const pair of pairs) {
    const { found } = getNamePrice(pair.tenKT, pair.surgeryDate, existingPrices);
    if (!found) {
      const key = `${normalizeForMatch(pair.tenKT)}|${pair.surgeryDate}`;
      if (!addedKeys.has(key)) {
        addedKeys.add(key);
        missingPairs.push(pair);
      }
    }
  }

  if (missingPairs.length === 0) {
    return { added: 0, skipped: pairs.length };
  }

  onProgress?.(`Thêm ${missingPairs.length} danh mục thiếu giá...`);

  const items: Omit<SurgeryNamePrice, 'id' | 'createdAt'>[] = missingPairs.map(p => ({
    tenKT: p.tenKT,
    price: 0,
    effectiveFrom: p.surgeryDate,
    effectiveTo: null,
    maTuongDuong: '',
  }));

  const added = await bulkCreateSurgeryNamePrices(items);

  return { added, skipped: pairs.length - missingPairs.length };
}

/** Convert internal yyyy-mm-dd to display yyyymmdd */
function toDisplayDate(d: string): string {
  if (!d) return '';
  return d.replace(/-/g, '');
}

/** Convert yyyymmdd or yyyy-mm-dd to internal yyyy-mm-dd */
function toInternalDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  return null;
}

/** Export all current name prices to Excel */
export function exportSurgeryNamePrices(prices: SurgeryNamePrice[]): void {
  const wb = XLSX.utils.book_new();

  const rows = prices.map(p => [
    p.tenKT,
    p.price,
    toDisplayDate(p.effectiveFrom),
    toDisplayDate(p.effectiveTo || ''),
    p.maTuongDuong || '',
  ]);

  const data = [
    ['Tên DVKT phê duyệt giá', 'Đơn giá (VNĐ)', 'Hiệu lực từ (yyyymmdd)', 'Kết thúc (yyyymmdd)', 'Mã tương đương'],
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 50 },  // Tên DVKT
    { wch: 18 },  // Giá
    { wch: 22 },  // Từ
    { wch: 22 },  // Đến
    { wch: 30 },  // Mã tương đương
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Danh mục giá PT');
  XLSX.writeFile(wb, 'Danh_muc_gia_phau_thuat.xlsx');
}

/** Export blank template for import */
export function exportNamePriceTemplate(): void {
  const wb = XLSX.utils.book_new();

  const data = [
    ['Tên DVKT phê duyệt giá', 'Đơn giá (VNĐ)', 'Hiệu lực từ (yyyymmdd)', 'Kết thúc (yyyymmdd)', 'Mã tương đương'],
    ['PT nội soi cắt túi mật', 5000000, '20240101', '', ''],
    ['Cắt Amidan', 3000000, '20240101', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 50 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mẫu nhập giá PT');
  XLSX.writeFile(wb, 'Mau_nhap_gia_phau_thuat.xlsx');
}

// --- Excel Import ---

export interface ImportedNamePriceData {
  items: Omit<SurgeryNamePrice, 'id' | 'createdAt'>[];
  errors: string[];
  warnings: string[];
}

/** Parse uploaded Excel into name price records */
export function parseImportedNamePriceExcel(workbook: XLSX.WorkBook): ImportedNamePriceData {
  const result: ImportedNamePriceData = { items: [], errors: [], warnings: [] };

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    result.errors.push('File Excel không có sheet nào');
    return result;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  if (rows.length < 2) {
    result.errors.push('File cần ít nhất 1 dòng dữ liệu (sau header)');
    return result;
  }

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!row || !row[0]) continue;

    const tenKT = String(row[0]).trim();
    const priceRaw = row[1];
    const fromRaw = String(row[2] || '').trim();
    const toRaw = String(row[3] || '').trim();
    const maTuongDuong = String(row[4] || '').trim();

    if (!tenKT) {
      result.warnings.push(`Dòng ${i + 1}: Bỏ qua (thiếu tên kỹ thuật)`);
      continue;
    }

    const price = Number(priceRaw);
    if (isNaN(price) || price < 0) {
      result.errors.push(`Dòng ${i + 1} "${tenKT}": Đơn giá không hợp lệ "${priceRaw}"`);
      continue;
    }

    if (!fromRaw) {
      result.errors.push(`Dòng ${i + 1} "${tenKT}": Thiếu ngày hiệu lực`);
      continue;
    }
    const fromDate = toInternalDate(fromRaw);
    if (!fromDate) {
      result.errors.push(`Dòng ${i + 1} "${tenKT}": Ngày hiệu lực không đúng định dạng (yyyymmdd hoặc yyyy-mm-dd): "${fromRaw}"`);
      continue;
    }

    let toDate: string | null = null;
    if (toRaw) {
      toDate = toInternalDate(toRaw);
      if (!toDate) {
        result.errors.push(`Dòng ${i + 1} "${tenKT}": Ngày kết thúc không đúng định dạng: "${toRaw}"`);
        continue;
      }
    }

    result.items.push({
      tenKT,
      price,
      effectiveFrom: fromDate,
      effectiveTo: toDate,
      maTuongDuong,
    });
  }

  if (result.items.length === 0 && result.errors.length === 0) {
    result.errors.push('Không tìm thấy dữ liệu hợp lệ trong file');
  }

  return result;
}
