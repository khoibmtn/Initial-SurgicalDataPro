/**
 * Surgery Name Price Service
 * CRUD + lookup for per-surgery-name pricing in Firebase RTDB
 * Flat structure: 1 record = 1 tenKT + 1 price + effectiveFrom/To
 */
import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db, firestore } from '../lib/firebase';
import { collectionGroup, query, getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { SurgeryNamePrice, RefillCandidateItem } from '../types';
import { reportService } from './reportService';
import { normalizeMaTuongDuong } from './servicePriceProcessor';

const NAME_PRICES_PATH = 'surgery_name_prices';

// --- Date normalization helpers ---

/**
 * Normalize any stored date format → consistent yyyy-mm-dd.
 * Handles: yyyymmdd (string or number), yyyy-mm-dd, empty/null.
 */
function normalizeStoredDate(raw: any): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  // Already yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // yyyymmdd (8 digits)
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // Try parsing as number (e.g. 20250101)
  if (!isNaN(Number(s)) && s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s; // fallback: return as-is
}

/** Convert ISO UTC string or VN date string → local yyyy-mm-dd (Vietnam timezone) */
function toLocalDateKey(isoString: string): string {
  if (!isoString) return '';
  const s = String(isoString).trim();
  // If already yyyy-mm-dd, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // If yyyymmdd, convert
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // Check for dd/mm/yyyy or dd/mm/yyyy hh:mm or dd-mm-yyyy
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const d = slashMatch[1].padStart(2, '0');
    const m = slashMatch[2].padStart(2, '0');
    const y = slashMatch[3];
    return `${y}-${m}-${d}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.substring(0, 10); // fallback
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Normalize ---

/**
 * Normalize tenKT for matching:
 * 1. Unicode NFKC normalization (full-width → half-width, compatibility chars)
 * 2. Remove zero-width characters (BOM, ZWSP, ZWNJ, ZWJ)
 * 3. Replace non-breaking spaces with regular spaces
 * 4. Trim + collapse whitespace
 * 5. Lowercase
 */
function normalizeForMatch(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFKC')                          // Full-width → half-width, Unicode compat
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // Remove zero-width chars
    .replace(/\u00A0/g, ' ')                     // Non-breaking space → regular space
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// --- Debug tracking (chỉ log 1 lần mỗi tên) ---
const _debuggedNames = new Set<string>();

// --- Lookup ---

/** Find price for a specific tenKT at a specific surgery date */
export function getNamePrice(
  tenKT: string,
  dateStr: string,
  namePrices: SurgeryNamePrice[]
): { price: number; found: boolean; matchedItem?: SurgeryNamePrice } {
  if (!tenKT || !dateStr) return { price: 0, found: false };

  const normalizedName = normalizeForMatch(tenKT);
  // Extract date part: "2024-05-20T08:30:00" → local "2024-05-20" (timezone-safe)
  const localDate = toLocalDateKey(dateStr);
  if (!localDate) return { price: 0, found: false };

  // Step 1: Find all prices with matching name
  const nameMatches = namePrices.filter(p => normalizeForMatch(p.tenKT) === normalizedName);

  // Step 2: Filter by date range
  const applicable = nameMatches
    .filter(p => {
      const from = normalizeStoredDate(p.effectiveFrom);
      const to = normalizeStoredDate(p.effectiveTo);
      if (from && from > localDate) return false;
      if (to && to < localDate) return false;
      return true;
    })
    .sort((a, b) => normalizeStoredDate(b.effectiveFrom).localeCompare(normalizeStoredDate(a.effectiveFrom)));

  if (applicable.length === 0) {
    // Debug: log why no match (only once per unique name)
    const debugKey = `${normalizedName}|${localDate}`;
    if (!_debuggedNames.has(normalizedName) && tenKT.includes('[')) {
      _debuggedNames.add(normalizedName);
      if (nameMatches.length === 0) {
        // Name doesn't exist in catalog at all
        console.warn(`[getNamePrice] TÊN KHÔNG KHỚP: "${tenKT}"`);
        console.warn(`  normalized: "${normalizedName}"`);
        // Find closest match
        const allNormalized = [...new Set(namePrices.map(p => normalizeForMatch(p.tenKT)))];
        const close = allNormalized.filter(n => 
          n.includes(normalizedName.substring(0, 20)) || normalizedName.includes(n.substring(0, 20))
        );
        if (close.length > 0) console.warn(`  Gần giống: ${close.slice(0, 3).join(', ')}`);
      } else {
        // Name matches but date is outside all ranges
        console.warn(`[getNamePrice] NGÀY NGOÀI HIỆU LỰC: "${tenKT}" tại ${localDate}`);
        console.warn(`  Có ${nameMatches.length} bản ghi giá, nhưng không có bản nào hiệu lực tại ${localDate}:`);
        nameMatches.forEach(p => {
          console.warn(`    ${p.effectiveFrom} → ${p.effectiveTo || 'đang áp dụng'} (${p.price.toLocaleString()}đ)`);
        });
      }
    }
    return { price: 0, found: false };
  }

  return {
    price: applicable[0].price ?? 0,
    found: true,
    matchedItem: applicable[0],
  };
}

// --- Pre-indexed Map for high-performance O(1) Lookups ---

export interface IndexedNamePrices {
  byNormalizedName: Map<string, SurgeryNamePrice[]>;
}

/** Pre-indexes name prices by normalized tenKT once to eliminate O(N*M) scans */
export function buildNamePricesIndex(namePrices: SurgeryNamePrice[]): IndexedNamePrices {
  const byNormalizedName = new Map<string, SurgeryNamePrice[]>();
  for (const p of namePrices) {
    if (!p.tenKT) continue;
    const norm = normalizeForMatch(p.tenKT);
    const existing = byNormalizedName.get(norm);
    if (existing) {
      existing.push(p);
    } else {
      byNormalizedName.set(norm, [p]);
    }
  }
  return { byNormalizedName };
}

/** High-speed O(1) price lookup using pre-indexed Map */
export function getNamePriceFast(
  tenKT: string,
  dateStr: string,
  indexed: IndexedNamePrices
): { price: number; found: boolean; matchedItem?: SurgeryNamePrice } {
  if (!tenKT || !dateStr) return { price: 0, found: false };

  const normalizedName = normalizeForMatch(tenKT);
  const nameMatches = indexed.byNormalizedName.get(normalizedName);
  if (!nameMatches || nameMatches.length === 0) {
    return { price: 0, found: false };
  }

  const localDate = toLocalDateKey(dateStr);
  if (!localDate) return { price: 0, found: false };

  let bestItem: SurgeryNamePrice | null = null;
  let bestFrom = '';

  for (const p of nameMatches) {
    const from = normalizeStoredDate(p.effectiveFrom);
    const to = normalizeStoredDate(p.effectiveTo);
    if (from && from > localDate) continue;
    if (to && to < localDate) continue;

    if (!bestItem || from.localeCompare(bestFrom) > 0) {
      bestItem = p;
      bestFrom = from;
    }
  }

  if (!bestItem) {
    return { price: 0, found: false };
  }

  return {
    price: bestItem.price ?? 0,
    found: true,
    matchedItem: bestItem,
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
      effectiveFrom: normalizeStoredDate(val.effectiveFrom),  // yyyymmdd → yyyy-mm-dd
      effectiveTo: val.effectiveTo ? normalizeStoredDate(val.effectiveTo) : null,  // yyyymmdd → yyyy-mm-dd
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
  // Normalize dates to yyyy-mm-dd before saving
  const normalized = {
    ...data,
    effectiveFrom: normalizeStoredDate(data.effectiveFrom),
    effectiveTo: data.effectiveTo ? normalizeStoredDate(data.effectiveTo) : null,
    createdAt: Date.now(),
  };
  await set(newRef, normalized);
  return newRef.key!;
}

export async function updateSurgeryNamePrice(
  id: string,
  updates: Partial<Omit<SurgeryNamePrice, 'id' | 'createdAt'>>
): Promise<void> {
  const versionRef = ref(db, `${NAME_PRICES_PATH}/${id}`);
  // Normalize dates to yyyy-mm-dd before saving
  const normalized = { ...updates };
  if (normalized.effectiveFrom) {
    normalized.effectiveFrom = normalizeStoredDate(normalized.effectiveFrom);
  }
  if (normalized.effectiveTo !== undefined) {
    normalized.effectiveTo = normalized.effectiveTo
      ? normalizeStoredDate(normalized.effectiveTo)
      : null;
  }
  await update(versionRef, normalized);
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

/** Scan all Firestore processed_records, extract all (tenKT, date) pairs */
async function extractSurgeryNameDatePairs(): Promise<SurgeryNameDatePair[]> {
  const pairSet = new Map<string, SurgeryNameDatePair>();
  const q = query(collectionGroup(firestore, 'processed_records'));
  const snapshot = await getDocs(q);

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const name = data.tenKT?.trim();
    const dateStr = data.ngayBD || '';
    if (!name || !dateStr) return;
    const localDate = toLocalDateKey(dateStr); // timezone-safe yyyy-mm-dd
    const key = `${normalizeForMatch(name)}|${localDate}`;
    if (!pairSet.has(key)) {
      pairSet.set(key, { tenKT: name, surgeryDate: localDate });
    }
  });

  return Array.from(pairSet.values());
}

/** Seed DB: only add (tenKT, date) pairs where no matching price is found */
export async function seedSurgeryNamePrices(
  existingPrices: SurgeryNamePrice[],
  onProgress?: (msg: string) => void
): Promise<{ added: number; skipped: number }> {
  onProgress?.('Đang quét toàn bộ dữ liệu phẫu thuật...');
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

// --- One-time migration: fix yyyymmdd → yyyy-mm-dd in RTDB ---

/** Scan all surgery_name_prices and fix yyyymmdd format to yyyy-mm-dd */
export async function migrateDateFormats(): Promise<{ fixed: number; total: number }> {
  const snapshot = await get(ref(db, NAME_PRICES_PATH));
  const data = snapshot.val();
  if (!data) return { fixed: 0, total: 0 };

  const entries = Object.entries(data) as [string, any][];
  let fixed = 0;
  const batchUpdates: Record<string, any> = {};

  for (const [key, val] of entries) {
    let needsFix = false;
    const updates: Record<string, any> = {};

    // Check effectiveFrom
    const rawFrom = String(val.effectiveFrom || '');
    if (/^\d{8}$/.test(rawFrom)) {
      updates[`${NAME_PRICES_PATH}/${key}/effectiveFrom`] =
        `${rawFrom.slice(0, 4)}-${rawFrom.slice(4, 6)}-${rawFrom.slice(6, 8)}`;
      needsFix = true;
    }

    // Check effectiveTo
    const rawTo = String(val.effectiveTo || '');
    if (/^\d{8}$/.test(rawTo)) {
      updates[`${NAME_PRICES_PATH}/${key}/effectiveTo`] =
        `${rawTo.slice(0, 4)}-${rawTo.slice(4, 6)}-${rawTo.slice(6, 8)}`;
      needsFix = true;
    }

    if (needsFix) {
      Object.assign(batchUpdates, updates);
      fixed++;
    }
  }

  if (Object.keys(batchUpdates).length > 0) {
    await update(ref(db), batchUpdates);
  }

  console.log(`[migrateDateFormats] Fixed ${fixed}/${entries.length} records`);
  return { fixed, total: entries.length };
}

// ───────────────── REFILL HELPERS ─────────────────

/**
 * Tìm item trong DM giá theo Mã tương đương và Ngày phẫu thuật (nằm trong khoảng hiệu lực)
 */
export function findCatalogItemByMaTuongDuong(
  maTuongDuong: string,
  dateStr: string,
  catalog: SurgeryNamePrice[]
): SurgeryNamePrice | undefined {
  if (!maTuongDuong || !dateStr) return undefined;
  const normMTD = normalizeMaTuongDuong(maTuongDuong);
  const localDate = toLocalDateKey(dateStr);

  const matched = catalog.filter(item => {
    if (normalizeMaTuongDuong(item.maTuongDuong) !== normMTD) return false;
    if (item.effectiveFrom && item.effectiveFrom > localDate) return false;
    if (item.effectiveTo && item.effectiveTo < localDate) return false;
    return true;
  });

  if (matched.length === 0) return undefined;
  // Sắp xếp ngày hiệu lực mới nhất trước
  matched.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return matched[0];
}

/**
 * Trích xuất danh sách ứng viên Refill từ danh sách bản ghi phẫu thuật Excel và DM giá:
 * - Đối chiếu theo Mã tương đương + Ngày phẫu thuật
 * - Gom nhóm theo (Mã tương đương, Đơn giá mới)
 */
export function generateRefillCandidates(
  excelRecords: Array<{
    maTuongDuong?: string;
    donGia?: number;
    ngayBD?: string;
    start?: Date | null;
    tenKT?: string;
  }>,
  catalog: SurgeryNamePrice[]
): RefillCandidateItem[] {
  // Map group key: `${normMTD}_${newPrice}` -> RefillCandidateItem
  const candidatesMap = new Map<string, RefillCandidateItem>();

  for (const rec of excelRecords) {
    if (!rec.maTuongDuong || !rec.donGia || rec.donGia <= 0) continue;

    const normMTD = normalizeMaTuongDuong(rec.maTuongDuong);
    const rawDate = rec.ngayBD || (rec.start ? rec.start.toISOString() : '');
    const localDate = toLocalDateKey(rawDate);
    const newPrice = Number(rec.donGia);
    const tenKT = String(rec.tenKT || '').trim();

    const groupKey = `${normMTD}_${newPrice}`;
    const existing = candidatesMap.get(groupKey);

    if (existing) {
      existing.matchedCount++;
      // Cập nhật ngày mẫu
      if (localDate && localDate < existing.sampleDate) {
        existing.sampleDate = localDate;
      }
      continue;
    }

    // Tìm trong DM giá theo mã tương đương và ngày hiệu lực
    const matchedCatalogItem = findCatalogItemByMaTuongDuong(normMTD, localDate, catalog);

    if (matchedCatalogItem) {
      candidatesMap.set(groupKey, {
        catalogId: matchedCatalogItem.id,
        tenKT: matchedCatalogItem.tenKT || tenKT,
        maTuongDuong: normMTD,
        effectiveFrom: matchedCatalogItem.effectiveFrom,
        effectiveTo: matchedCatalogItem.effectiveTo,
        oldPrice: matchedCatalogItem.price,
        newPrice: newPrice,
        action: 'update',
        matchedCount: 1,
        sampleDate: localDate,
        selected: matchedCatalogItem.price !== newPrice, // Mặc định chọn nếu giá thay đổi
      });
    } else {
      // Chưa có trong DM giá -> Đề xuất tạo mới
      const monthStart = localDate ? `${localDate.slice(0, 7)}-01` : '2026-01-01';
      candidatesMap.set(groupKey, {
        tenKT: tenKT || `DVKT ${normMTD}`,
        maTuongDuong: normMTD,
        effectiveFrom: monthStart,
        effectiveTo: null,
        oldPrice: undefined,
        newPrice: newPrice,
        action: 'create',
        matchedCount: 1,
        sampleDate: localDate,
        selected: true, // Mặc định chọn tạo mới
      });
    }
  }

  // Sắp xếp: Mục có thay đổi giá / tạo mới lên đầu, sau đó theo Tên DVKT
  const result = Array.from(candidatesMap.values());
  result.sort((a, b) => {
    const diffA = a.action === 'create' || a.oldPrice !== a.newPrice ? 0 : 1;
    const diffB = b.action === 'create' || b.oldPrice !== b.newPrice ? 0 : 1;
    if (diffA !== diffB) return diffA - diffB;
    return a.tenKT.localeCompare(b.tenKT, 'vi');
  });

  return result;
}

/**
 * Thực hiện áp các ứng viên đã chọn vào Danh mục giá (RTDB)
 */
export async function applyRefillCandidatesToCatalog(
  candidates: RefillCandidateItem[]
): Promise<{ updated: number; created: number }> {
  let updated = 0;
  let created = 0;

  for (const item of candidates) {
    if (!item.selected) continue;

    if (item.action === 'update' && item.catalogId) {
      await updateSurgeryNamePrice(item.catalogId, {
        price: item.newPrice,
        maTuongDuong: item.maTuongDuong,
      });
      updated++;
    } else if (item.action === 'create') {
      await createSurgeryNamePrice({
        tenKT: item.tenKT,
        price: item.newPrice,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        maTuongDuong: item.maTuongDuong,
      });
      created++;
    }
  }

  return { updated, created };
}

