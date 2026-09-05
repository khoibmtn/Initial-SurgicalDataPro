/**
 * Required Machine Service
 * Quản lý Danh mục kỹ thuật (DMKT) phải sử dụng mã máy:
 * - Mã tương đương (maTuongDuong)
 * - Tên dịch vụ kỹ thuật (tenDVKT)
 * - Ngày hiệu lực từ/đến (effectiveFrom, effectiveTo)
 * - Bắt buộc / Không bắt buộc (isRequired)
 *
 * Tra cứu theo thứ tự:
 * 1. Mã tương đương (nếu ca mổ có mã tương đương)
 * 2. Tên dịch vụ kỹ thuật (nếu ca mổ không có mã tương đương)
 * 3. Ngày phẫu thuật (nằm trong khoảng [effectiveFrom, effectiveTo])
 */

import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { RequiredMachineItem } from '../types';
import { normalizeDate } from './laborConfigService';
import { normalizeMaTuongDuong, normalizeForMatch } from './servicePriceProcessor';

export const REQUIRED_MACHINE_PATH = 'required_machine_catalog';

export interface IndexedRequiredMachineCatalog {
  byCode: Map<string, RequiredMachineItem[]>;
  byName: Map<string, RequiredMachineItem[]>;
  items: RequiredMachineItem[];
}

/** Pre-index catalog for O(1) matching */
export function buildRequiredMachineIndex(items: RequiredMachineItem[]): IndexedRequiredMachineCatalog {
  const byCode = new Map<string, RequiredMachineItem[]>();
  const byName = new Map<string, RequiredMachineItem[]>();

  for (const item of items) {
    if (item.maTuongDuong) {
      const codeKey = normalizeMaTuongDuong(item.maTuongDuong);
      if (!byCode.has(codeKey)) byCode.set(codeKey, []);
      byCode.get(codeKey)!.push(item);
    }

    if (item.tenDVKT) {
      const nameKey = normalizeForMatch(item.tenDVKT);
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey)!.push(item);
    }
  }

  return { byCode, byName, items };
}

/** Check if a surgery procedure requires machine code at its surgery date */
export function isMachineCodeRequired(
  r: { maTuongDuong?: string; tenKT?: string; ngayBD?: any; start?: any },
  catalog: RequiredMachineItem[] | IndexedRequiredMachineCatalog | undefined
): boolean {
  if (!catalog) return false;

  const items = Array.isArray(catalog) ? catalog : catalog.items;
  if (items.length === 0) return false;

  const dateStr = normalizeDate(r.ngayBD || r.start);

  const filterByDate = (candidates: RequiredMachineItem[]): RequiredMachineItem[] => {
    if (!dateStr) {
      return candidates.filter(i => i.effectiveTo === null);
    }
    return candidates
      .filter(i => (!i.effectiveFrom || i.effectiveFrom <= dateStr))
      .filter(i => (!i.effectiveTo || i.effectiveTo >= dateStr))
      .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
  };

  // 1. Check by maTuongDuong first if available
  const rawCode = (r.maTuongDuong || '').trim();
  if (rawCode) {
    const cleanCode = normalizeMaTuongDuong(rawCode);
    let codeCandidates: RequiredMachineItem[] = [];

    if (!Array.isArray(catalog)) {
      codeCandidates = catalog.byCode.get(cleanCode) || [];
    } else {
      codeCandidates = items.filter(i => normalizeMaTuongDuong(i.maTuongDuong) === cleanCode);
    }

    const matchedByDate = filterByDate(codeCandidates);
    if (matchedByDate.length > 0) {
      return matchedByDate[0].isRequired === true;
    }
  }

  // 2. Fallback: Check by tenKT (normalized)
  const rawName = (r.tenKT || '').trim();
  if (rawName) {
    const cleanName = normalizeForMatch(rawName);
    let nameCandidates: RequiredMachineItem[] = [];

    if (!Array.isArray(catalog)) {
      nameCandidates = catalog.byName.get(cleanName) || [];
    } else {
      nameCandidates = items.filter(i => normalizeForMatch(i.tenDVKT) === cleanName);
    }

    const matchedByDate = filterByDate(nameCandidates);
    if (matchedByDate.length > 0) {
      return matchedByDate[0].isRequired === true;
    }
  }

  // If not found in catalog, it does not require a machine
  return false;
}

// ─── Realtime Subscriptions ──────────────────────────────────────────────────

export function subscribeToRequiredMachineItems(
  callback: (items: RequiredMachineItem[]) => void
): () => void {
  const catalogRef = ref(db, REQUIRED_MACHINE_PATH);
  return onValue(catalogRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const items: RequiredMachineItem[] = Object.entries(data).map(([id, val]: [string, any]) => ({
      id,
      maTuongDuong: val.maTuongDuong || '',
      tenDVKT: val.tenDVKT || '',
      effectiveFrom: normalizeDate(val.effectiveFrom) || '2000-01-01',
      effectiveTo: val.effectiveTo ? normalizeDate(val.effectiveTo) : null,
      isRequired: val.isRequired !== false, // default true
      createdAt: val.createdAt || 0,
      updatedAt: val.updatedAt || 0,
    }));

    // Sort by maTuongDuong asc, then effectiveFrom desc
    items.sort((a, b) => a.maTuongDuong.localeCompare(b.maTuongDuong) || (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    callback(items);
  });
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function addRequiredMachineItem(
  item: Omit<RequiredMachineItem, 'id'>
): Promise<string> {
  const newRef = push(ref(db, REQUIRED_MACHINE_PATH));
  const now = Date.now();
  await set(newRef, {
    maTuongDuong: (item.maTuongDuong || '').trim(),
    tenDVKT: (item.tenDVKT || '').trim(),
    effectiveFrom: normalizeDate(item.effectiveFrom) || '2000-01-01',
    effectiveTo: item.effectiveTo ? normalizeDate(item.effectiveTo) : null,
    isRequired: item.isRequired !== false,
    createdAt: now,
    updatedAt: now,
  });
  return newRef.key!;
}

export async function updateRequiredMachineItem(
  id: string,
  updates: Partial<Omit<RequiredMachineItem, 'id'>>
): Promise<void> {
  const payload: any = { ...updates, updatedAt: Date.now() };
  if (payload.effectiveFrom) payload.effectiveFrom = normalizeDate(payload.effectiveFrom);
  if (payload.effectiveTo !== undefined) {
    payload.effectiveTo = payload.effectiveTo ? normalizeDate(payload.effectiveTo) : null;
  }
  if (payload.maTuongDuong !== undefined) payload.maTuongDuong = payload.maTuongDuong.trim();
  if (payload.tenDVKT !== undefined) payload.tenDVKT = payload.tenDVKT.trim();
  await update(ref(db, `${REQUIRED_MACHINE_PATH}/${id}`), payload);
}

export async function toggleRequiredMachineItem(
  id: string,
  isRequired: boolean
): Promise<void> {
  await update(ref(db, `${REQUIRED_MACHINE_PATH}/${id}`), {
    isRequired,
    updatedAt: Date.now(),
  });
}

export async function deleteRequiredMachineItem(id: string): Promise<void> {
  await remove(ref(db, `${REQUIRED_MACHINE_PATH}/${id}`));
}

/** Batch insert or update multiple items atomically in RTDB */
export async function batchSaveRequiredMachineItems(
  items: Array<Omit<RequiredMachineItem, 'id'> & { id?: string }>
): Promise<number> {
  const updates: Record<string, any> = {};
  const now = Date.now();
  let count = 0;

  for (const item of items) {
    const key = item.id || push(ref(db, REQUIRED_MACHINE_PATH)).key!;
    updates[`${REQUIRED_MACHINE_PATH}/${key}`] = {
      maTuongDuong: (item.maTuongDuong || '').trim(),
      tenDVKT: (item.tenDVKT || '').trim(),
      effectiveFrom: normalizeDate(item.effectiveFrom) || '2000-01-01',
      effectiveTo: item.effectiveTo ? normalizeDate(item.effectiveTo) : null,
      isRequired: item.isRequired !== false,
      createdAt: item.createdAt || now,
      updatedAt: now,
    };
    count++;
  }

  await update(ref(db), updates);
  return count;
}

// ─── Excel Import / Export ───────────────────────────────────────────────────

export function exportRequiredMachineExcel(items: RequiredMachineItem[]): void {
  const wb = XLSX.utils.book_new();
  const rows = items.map((item, idx) => ({
    'STT': idx + 1,
    'Mã tương đương': item.maTuongDuong,
    'Tên dịch vụ kỹ thuật': item.tenDVKT,
    'Bắt buộc dùng máy': item.isRequired ? 'Bắt buộc' : 'Không bắt buộc',
    'Hiệu lực từ': item.effectiveFrom,
    'Hiệu lực đến': item.effectiveTo || 'Hiện tại',
    'Trạng thái': item.effectiveTo === null ? 'Đang hiệu lực' : 'Hết hiệu lực',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'DMKT dung ma may');
  XLSX.writeFile(wb, `DMKT_Dung_Ma_May_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function importRequiredMachineExcel(file: File): Promise<{ success: number; skipped: number }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const toSave: Array<Omit<RequiredMachineItem, 'id'>> = [];
  let skipped = 0;

  for (const row of rawRows) {
    const code = String(
      row['Mã tương đương'] || row['MA_DVKT'] || row['maTuongDuong'] || row['Mã DVKT'] || ''
    ).trim();
    const name = String(
      row['Tên dịch vụ kỹ thuật'] || row['TEN_DVKT'] || row['tenDVKT'] || row['Tên DVKT'] || ''
    ).trim();

    if (!code && !name) {
      skipped++;
      continue;
    }

    const rawReq = String(
      row['Bắt buộc dùng máy'] || row['Bắt buộc'] || row['isRequired'] || 'Có'
    ).trim().toLowerCase();
    const isRequired = rawReq !== 'không' && rawReq !== 'false' && rawReq !== '0';

    const fromRaw = row['Hiệu lực từ'] || row['effectiveFrom'] || '2000-01-01';
    const toRaw = row['Hiệu lực đến'] || row['effectiveTo'] || null;

    toSave.push({
      maTuongDuong: code,
      tenDVKT: name,
      effectiveFrom: normalizeDate(fromRaw) || '2000-01-01',
      effectiveTo: toRaw && toRaw !== 'Hiện tại' ? normalizeDate(toRaw) : null,
      isRequired,
    });
  }

  // Batch insert in chunks of 500 to avoid RTDB payload limits
  const CHUNK_SIZE = 500;
  for (let i = 0; i < toSave.length; i += CHUNK_SIZE) {
    const chunk = toSave.slice(i, i + CHUNK_SIZE);
    await batchSaveRequiredMachineItems(chunk);
  }

  return { success: toSave.length, skipped };
}
