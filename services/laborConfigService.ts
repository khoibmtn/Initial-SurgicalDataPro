/**
 * Labor Config Service — Flat Timeline Management for:
 * 1. Phụ cấp PTTT (labor_allowance_items)
 * 2. Định mức thời gian (labor_time_items)
 * 3. Định mức bàn mổ (labor_table_items)
 *
 * Each row is an independent item with its own ID and date validity range.
 */
import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import {
  LaborAllowanceItem,
  LaborTimeItem,
  LaborTableItem,
  LaborConfigVersion,
  RolePrice,
  TimeRule,
  LOAI_PTTT_ORDER,
} from '../types';

export const ALLOWANCE_PATH = 'labor_allowance_items';
export const TIME_PATH = 'labor_time_items';
export const TABLE_PATH = 'labor_table_items';
export const LEGACY_PATH = 'labor_config_versions';

export const ALL_PTTT_TYPES = [
  'PĐB', 'P1', 'P2', 'P3',
  'TĐB', 'T1', 'T2', 'T3', 'TKPL'
];

export const STAFF_POSITIONS = [
  { key: 'ptChinh', label: 'BS PT chính', group: 'surgeons', defaultLimit: 1 },
  { key: 'ptPhu', label: 'BS PT phụ', group: 'surgeons', defaultLimit: 1 },
  { key: 'bsGM', label: 'BS gây mê hồi sức', group: 'anesthesiologists', defaultLimit: 2 },
  { key: 'ktvGM', label: 'KTV gây mê', group: 'support', defaultLimit: 1 },
  { key: 'tdc', label: 'Tít dụng cụ', group: 'support', defaultLimit: 1 },
  { key: 'gv', label: 'Giúp việc', group: 'assistants', defaultLimit: 0 },
] as const;

export const DEFAULT_PRICE_CONFIG: Record<string, RolePrice> = {
  "PĐB": { "Chính": 280000, "Phụ": 200000, "Giúp việc": 120000 },
  "P1": { "Chính": 125000, "Phụ": 90000, "Giúp việc": 70000 },
  "P2": { "Chính": 65000, "Phụ": 50000, "Giúp việc": 30000 },
  "P3": { "Chính": 50000, "Phụ": 30000, "Giúp việc": 15000 },
  "TĐB": { "Chính": 84000, "Phụ": 60000, "Giúp việc": 36000 },
  "T1": { "Chính": 37500, "Phụ": 27000, "Giúp việc": 21000 },
  "T2": { "Chính": 19500, "Phụ": 15000, "Giúp việc": 9000 },
  "T3": { "Chính": 15000, "Phụ": 9000, "Giúp việc": 4500 },
  "TKPL": { "Chính": 0, "Phụ": 0, "Giúp việc": 0 },
};

export const DEFAULT_TIME_RULES: Record<string, TimeRule> = {
  "PĐB": { min: 180, max: 240 },
  "P1": { min: 120, max: 180 },
  "P2": { min: 60, max: 180 },
  "P3": { min: 60, max: 120 },
  "TĐB": { min: 180, max: 240 },
  "T1": { min: 120, max: 180 },
  "T2": { min: 60, max: 180 },
  "T3": { min: 60, max: 120 },
  "TKPL": { min: 0, max: 0 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeDate(raw: any): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

export function dayBefore(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Realtime Subscriptions ──────────────────────────────────────────────────

/** Subscribe to flat allowance items */
export function subscribeToAllowanceItems(
  callback: (items: LaborAllowanceItem[]) => void
): () => void {
  const itemRef = ref(db, ALLOWANCE_PATH);
  return onValue(itemRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const items: LaborAllowanceItem[] = Object.entries(data).map(([id, val]: [string, any]) => ({
      id,
      loai: val.loai || '',
      chinh: Number(val.chinh) || 0,
      phu: Number(val.phu) || 0,
      giupViec: Number(val.giupViec) || 0,
      effectiveFrom: normalizeDate(val.effectiveFrom),
      effectiveTo: val.effectiveTo ? normalizeDate(val.effectiveTo) : null,
      createdAt: val.createdAt || 0,
      updatedAt: val.updatedAt || 0,
    }));
    // Sort by effectiveFrom desc
    items.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    callback(items);
  });
}

/** Subscribe to flat time norm items */
export function subscribeToTimeItems(
  callback: (items: LaborTimeItem[]) => void
): () => void {
  const itemRef = ref(db, TIME_PATH);
  return onValue(itemRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const items: LaborTimeItem[] = Object.entries(data).map(([id, val]: [string, any]) => ({
      id,
      loai: val.loai || '',
      min: Number(val.min) || 0,
      max: Number(val.max) || 0,
      effectiveFrom: normalizeDate(val.effectiveFrom),
      effectiveTo: val.effectiveTo ? normalizeDate(val.effectiveTo) : null,
      createdAt: val.createdAt || 0,
      updatedAt: val.updatedAt || 0,
    }));
    items.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    callback(items);
  });
}

/** Subscribe to flat table norm items */
export function subscribeToTableItems(
  callback: (items: LaborTableItem[]) => void
): () => void {
  const itemRef = ref(db, TABLE_PATH);
  return onValue(itemRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const items: LaborTableItem[] = Object.entries(data).map(([id, val]: [string, any]) => ({
      id,
      posKey: val.posKey || '',
      label: val.label || '',
      limit: Number(val.limit) ?? 1,
      effectiveFrom: normalizeDate(val.effectiveFrom),
      effectiveTo: val.effectiveTo ? normalizeDate(val.effectiveTo) : null,
      createdAt: val.createdAt || 0,
      updatedAt: val.updatedAt || 0,
    }));
    items.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    callback(items);
  });
}

// ─── Allowance CRUD ──────────────────────────────────────────────────────────

export async function addAllowanceItem(
  loai: string,
  chinh: number,
  phu: number,
  giupViec: number,
  effectiveFrom: string,
  allItems: LaborAllowanceItem[] = []
): Promise<string> {
  const normalizedFrom = normalizeDate(effectiveFrom);
  const now = Date.now();

  // Auto-close previous active item for this loai
  const prevActive = allItems.find(i => i.loai === loai && i.effectiveTo === null);
  if (prevActive && prevActive.effectiveFrom < normalizedFrom) {
    const closedEnd = dayBefore(normalizedFrom);
    await update(ref(db, `${ALLOWANCE_PATH}/${prevActive.id}`), {
      effectiveTo: closedEnd,
      updatedAt: now,
    });
  }

  const newRef = push(ref(db, ALLOWANCE_PATH));
  await set(newRef, {
    loai,
    chinh: Number(chinh) || 0,
    phu: Number(phu) || 0,
    giupViec: Number(giupViec) || 0,
    effectiveFrom: normalizedFrom,
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  });
  return newRef.key!;
}

export async function updateAllowanceItem(
  id: string,
  updates: Partial<Pick<LaborAllowanceItem, 'chinh' | 'phu' | 'giupViec' | 'effectiveFrom' | 'effectiveTo'>>
): Promise<void> {
  const payload: any = { ...updates, updatedAt: Date.now() };
  if (payload.effectiveFrom) payload.effectiveFrom = normalizeDate(payload.effectiveFrom);
  if (payload.effectiveTo !== undefined) {
    payload.effectiveTo = payload.effectiveTo ? normalizeDate(payload.effectiveTo) : null;
  }
  await update(ref(db, `${ALLOWANCE_PATH}/${id}`), payload);
}

export async function deleteAllowanceItem(
  id: string,
  allItems: LaborAllowanceItem[] = []
): Promise<void> {
  const item = allItems.find(i => i.id === id);
  // Delete from RTDB
  await remove(ref(db, `${ALLOWANCE_PATH}/${id}`));

  // If the deleted item was currently active (effectiveTo === null),
  // re-open the most recent remaining item for this loai
  if (item && item.effectiveTo === null) {
    const siblings = allItems
      .filter(i => i.id !== id && i.loai === item.loai)
      .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    if (siblings.length > 0) {
      await update(ref(db, `${ALLOWANCE_PATH}/${siblings[0].id}`), {
        effectiveTo: null,
        updatedAt: Date.now(),
      });
    }
  }
}

// ─── Time Norms CRUD ─────────────────────────────────────────────────────────

export async function addTimeItem(
  loai: string,
  min: number,
  max: number,
  effectiveFrom: string,
  allItems: LaborTimeItem[] = []
): Promise<string> {
  const normalizedFrom = normalizeDate(effectiveFrom);
  const now = Date.now();

  const prevActive = allItems.find(i => i.loai === loai && i.effectiveTo === null);
  if (prevActive && prevActive.effectiveFrom < normalizedFrom) {
    const closedEnd = dayBefore(normalizedFrom);
    await update(ref(db, `${TIME_PATH}/${prevActive.id}`), {
      effectiveTo: closedEnd,
      updatedAt: now,
    });
  }

  const newRef = push(ref(db, TIME_PATH));
  await set(newRef, {
    loai,
    min: Number(min) || 0,
    max: Number(max) || 0,
    effectiveFrom: normalizedFrom,
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  });
  return newRef.key!;
}

export async function updateTimeItem(
  id: string,
  updates: Partial<Pick<LaborTimeItem, 'min' | 'max' | 'effectiveFrom' | 'effectiveTo'>>
): Promise<void> {
  const payload: any = { ...updates, updatedAt: Date.now() };
  if (payload.effectiveFrom) payload.effectiveFrom = normalizeDate(payload.effectiveFrom);
  if (payload.effectiveTo !== undefined) {
    payload.effectiveTo = payload.effectiveTo ? normalizeDate(payload.effectiveTo) : null;
  }
  await update(ref(db, `${TIME_PATH}/${id}`), payload);
}

export async function deleteTimeItem(
  id: string,
  allItems: LaborTimeItem[] = []
): Promise<void> {
  const item = allItems.find(i => i.id === id);
  await remove(ref(db, `${TIME_PATH}/${id}`));

  if (item && item.effectiveTo === null) {
    const siblings = allItems
      .filter(i => i.id !== id && i.loai === item.loai)
      .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    if (siblings.length > 0) {
      await update(ref(db, `${TIME_PATH}/${siblings[0].id}`), {
        effectiveTo: null,
        updatedAt: Date.now(),
      });
    }
  }
}

// ─── Table Norms CRUD ────────────────────────────────────────────────────────

export async function addTableItem(
  posKey: string,
  label: string,
  limit: number,
  effectiveFrom: string,
  allItems: LaborTableItem[] = []
): Promise<string> {
  const normalizedFrom = normalizeDate(effectiveFrom);
  const now = Date.now();

  const prevActive = allItems.find(i => i.posKey === posKey && i.effectiveTo === null);
  if (prevActive && prevActive.effectiveFrom < normalizedFrom) {
    const closedEnd = dayBefore(normalizedFrom);
    await update(ref(db, `${TABLE_PATH}/${prevActive.id}`), {
      effectiveTo: closedEnd,
      updatedAt: now,
    });
  }

  const newRef = push(ref(db, TABLE_PATH));
  await set(newRef, {
    posKey,
    label,
    limit: Number(limit) ?? 1,
    effectiveFrom: normalizedFrom,
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  });
  return newRef.key!;
}

export async function updateTableItem(
  id: string,
  updates: Partial<Pick<LaborTableItem, 'limit' | 'effectiveFrom' | 'effectiveTo'>>
): Promise<void> {
  const payload: any = { ...updates, updatedAt: Date.now() };
  if (payload.effectiveFrom) payload.effectiveFrom = normalizeDate(payload.effectiveFrom);
  if (payload.effectiveTo !== undefined) {
    payload.effectiveTo = payload.effectiveTo ? normalizeDate(payload.effectiveTo) : null;
  }
  await update(ref(db, `${TABLE_PATH}/${id}`), payload);
}

export async function deleteTableItem(
  id: string,
  allItems: LaborTableItem[] = []
): Promise<void> {
  const item = allItems.find(i => i.id === id);
  await remove(ref(db, `${TABLE_PATH}/${id}`));

  if (item && item.effectiveTo === null) {
    const siblings = allItems
      .filter(i => i.id !== id && i.posKey === item.posKey)
      .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
    if (siblings.length > 0) {
      await update(ref(db, `${TABLE_PATH}/${siblings[0].id}`), {
        effectiveTo: null,
        updatedAt: Date.now(),
      });
    }
  }
}

// ─── Date Lookups ────────────────────────────────────────────────────────────

export function getAllowanceForDate(
  loai: string,
  date: string,
  allItems: LaborAllowanceItem[]
): RolePrice {
  const normalizedDate = normalizeDate(date);
  const candidates = allItems
    .filter(i => i.loai === loai && (i.effectiveFrom <= normalizedDate))
    .filter(i => i.effectiveTo === null || i.effectiveTo >= normalizedDate)
    .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));

  if (candidates.length > 0) {
    return {
      "Chính": candidates[0].chinh,
      "Phụ": candidates[0].phu,
      "Giúp việc": candidates[0].giupViec,
    };
  }
  return DEFAULT_PRICE_CONFIG[loai] || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 };
}

export function getTimeForDate(
  loai: string,
  date: string,
  allItems: LaborTimeItem[]
): TimeRule {
  const normalizedDate = normalizeDate(date);
  const candidates = allItems
    .filter(i => i.loai === loai && (i.effectiveFrom <= normalizedDate))
    .filter(i => i.effectiveTo === null || i.effectiveTo >= normalizedDate)
    .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));

  if (candidates.length > 0) {
    return { min: candidates[0].min, max: candidates[0].max };
  }
  return DEFAULT_TIME_RULES[loai] || { min: 0, max: 0 };
}

export function getTableLimitForDate(
  posKey: string,
  date: string,
  allItems: LaborTableItem[]
): number {
  const normalizedDate = normalizeDate(date);
  const candidates = allItems
    .filter(i => i.posKey === posKey && (i.effectiveFrom <= normalizedDate))
    .filter(i => i.effectiveTo === null || i.effectiveTo >= normalizedDate)
    .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));

  if (candidates.length > 0) {
    return candidates[0].limit;
  }
  const pos = STAFF_POSITIONS.find(p => p.key === posKey);
  return pos?.defaultLimit ?? 1;
}

// ─── Legacy/Compatibility Bridge ────────────────────────────────────────────

export function subscribeToLaborConfigs(
  callback: (versions: LaborConfigVersion[]) => void
): () => void {
  let latestAllowances: LaborAllowanceItem[] = [];
  let latestTimes: LaborTimeItem[] = [];
  let hasReceivedAllow = false;
  let hasReceivedTime = false;

  const emitVersions = () => {
    if (!hasReceivedAllow && !hasReceivedTime) return;

    if (latestAllowances.length === 0 && latestTimes.length === 0) {
      // Fallback to legacy path if no flat items exist yet
      const configRef = ref(db, LEGACY_PATH);
      get(configRef).then((snapshot) => {
        const data = snapshot.val();
        if (!data) {
          callback([]);
          return;
        }
        const versions: LaborConfigVersion[] = Object.entries(data).map(([key, val]: [string, any]) => ({
          id: key,
          name: val.name || '',
          effectiveFrom: normalizeDate(val.effectiveFrom),
          effectiveTo: val.effectiveTo ? normalizeDate(val.effectiveTo) : null,
          priceConfig: val.priceConfig || { ...DEFAULT_PRICE_CONFIG },
          timeRules: val.timeRules || { ...DEFAULT_TIME_RULES },
          note: val.note || '',
          createdAt: val.createdAt || 0,
          updatedAt: val.updatedAt || 0,
        }));
        versions.sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
        callback(versions);
      }).catch(console.error);
      return;
    }

    // Collect all unique effectiveFrom dates
    const dateSet = new Set<string>();
    latestAllowances.forEach(a => { if (a.effectiveFrom) dateSet.add(a.effectiveFrom); });
    latestTimes.forEach(t => { if (t.effectiveFrom) dateSet.add(t.effectiveFrom); });
    if (dateSet.size === 0) dateSet.add('2020-01-01');

    const sortedDates = Array.from(dateSet).sort();
    const versions: LaborConfigVersion[] = sortedDates.map((date, idx) => {
      const nextDate = sortedDates[idx + 1];
      const effectiveTo = nextDate ? dayBefore(nextDate) : null;

      const priceConfig: Record<string, RolePrice> = {};
      const timeRules: Record<string, TimeRule> = {};

      for (const loai of ALL_PTTT_TYPES) {
        priceConfig[loai] = getAllowanceForDate(loai, date, latestAllowances);
        timeRules[loai] = getTimeForDate(loai, date, latestTimes);
      }

      return {
        id: `virtual_${date}`,
        name: idx === 0 ? 'Quy định ban đầu' : `Cấu hình ${date}`,
        effectiveFrom: date,
        effectiveTo,
        priceConfig,
        timeRules,
        note: '',
        createdAt: 0,
        updatedAt: 0,
      };
    }).reverse();

    callback(versions);
  };

  const unsubAllow = subscribeToAllowanceItems(items => {
    latestAllowances = items;
    hasReceivedAllow = true;
    emitVersions();
  });
  const unsubTime = subscribeToTimeItems(items => {
    latestTimes = items;
    hasReceivedTime = true;
    emitVersions();
  });

  return () => {
    unsubAllow();
    unsubTime();
  };
}

export function getLaborConfigForDate(
  date: string,
  allConfigs: LaborConfigVersion[]
): LaborConfigVersion | null {
  if (!date || allConfigs.length === 0) return null;
  const normalized = normalizeDate(date);
  if (!normalized) return null;
  const sorted = [...allConfigs].sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''));
  for (const version of sorted) {
    if (version.effectiveFrom <= normalized) {
      if (version.effectiveTo === null || version.effectiveTo >= normalized) {
        return version;
      }
    }
  }
  return null;
}

export function getConfigForDate(
  date: string,
  allConfigs: LaborConfigVersion[],
  fallbackPriceConfig?: Record<string, RolePrice>,
  fallbackTimeRules?: Record<string, TimeRule>,
): { priceConfig: Record<string, RolePrice>; timeRules: Record<string, TimeRule> } {
  const version = getLaborConfigForDate(date, allConfigs);
  if (version) {
    return { priceConfig: version.priceConfig, timeRules: version.timeRules };
  }
  return {
    priceConfig: fallbackPriceConfig || DEFAULT_PRICE_CONFIG,
    timeRules: fallbackTimeRules || DEFAULT_TIME_RULES,
  };
}

export async function ensureDefaultLaborConfig(
  staticPriceConfig?: Record<string, RolePrice>,
  staticTimeRules?: Record<string, TimeRule>,
): Promise<boolean> {
  const configRef = ref(db, LEGACY_PATH);
  const snapshot = await get(configRef);
  if (snapshot.exists()) return false;

  const now = Date.now();
  const newRef = push(configRef);
  await set(newRef, {
    name: 'Quy định ban đầu',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    priceConfig: staticPriceConfig || DEFAULT_PRICE_CONFIG,
    timeRules: staticTimeRules || DEFAULT_TIME_RULES,
    note: 'Tự động tạo từ cấu hình tĩnh',
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

// ─── Auto Initialization / Migration ─────────────────────────────────────────

export async function ensureFlatLaborItems(): Promise<void> {
  const allowSnap = await get(ref(db, ALLOWANCE_PATH));
  const timeSnap = await get(ref(db, TIME_PATH));
  const tableSnap = await get(ref(db, TABLE_PATH));

  const now = Date.now();

  // 1. Allowance items
  if (!allowSnap.exists() || Object.keys(allowSnap.val()).length === 0) {
    // Check if legacy versions exist to migrate
    const legacySnap = await get(ref(db, LEGACY_PATH));
    if (legacySnap.exists()) {
      const versions = Object.values(legacySnap.val() as Record<string, any>)
        .sort((a, b) => (a.effectiveFrom || '').localeCompare(b.effectiveFrom || ''));

      for (const loai of ALL_PTTT_TYPES) {
        // Collect timeline changes for this specific loai
        let lastVal: RolePrice | null = null;
        for (let i = 0; i < versions.length; i++) {
          const v = versions[i];
          const price: RolePrice = v.priceConfig?.[loai] || DEFAULT_PRICE_CONFIG[loai] || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 };
          const from = normalizeDate(v.effectiveFrom) || '2020-01-01';
          const to = v.effectiveTo ? normalizeDate(v.effectiveTo) : null;

          // If price is different from last, or this is the first entry
          if (!lastVal || lastVal["Chính"] !== price["Chính"] || lastVal["Phụ"] !== price["Phụ"] || lastVal["Giúp việc"] !== price["Giúp việc"] || i === versions.length - 1) {
            const newRef = push(ref(db, ALLOWANCE_PATH));
            await set(newRef, {
              loai,
              chinh: price["Chính"],
              phu: price["Phụ"],
              giupViec: price["Giúp việc"],
              effectiveFrom: from,
              effectiveTo: to,
              createdAt: now,
              updatedAt: now,
            });
            lastVal = price;
          }
        }
      }
    } else {
      // Seed clean default
      for (const loai of ALL_PTTT_TYPES) {
        const price = DEFAULT_PRICE_CONFIG[loai] || { "Chính": 0, "Phụ": 0, "Giúp việc": 0 };
        const newRef = push(ref(db, ALLOWANCE_PATH));
        await set(newRef, {
          loai,
          chinh: price["Chính"],
          phu: price["Phụ"],
          giupViec: price["Giúp việc"],
          effectiveFrom: '2020-01-01',
          effectiveTo: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // 2. Time items
  if (!timeSnap.exists() || Object.keys(timeSnap.val()).length === 0) {
    for (const loai of ALL_PTTT_TYPES) {
      const rule = DEFAULT_TIME_RULES[loai] || { min: 0, max: 0 };
      const newRef = push(ref(db, TIME_PATH));
      await set(newRef, {
        loai,
        min: rule.min,
        max: rule.max,
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // 3. Table items
  if (!tableSnap.exists() || Object.keys(tableSnap.val()).length === 0) {
    for (const pos of STAFF_POSITIONS) {
      const newRef = push(ref(db, TABLE_PATH));
      await set(newRef, {
        posKey: pos.key,
        label: pos.label,
        limit: pos.defaultLimit,
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

// ─── Export Excel ────────────────────────────────────────────────────────────

export function exportLaborConfigsExcel(
  allowanceItems: LaborAllowanceItem[],
  timeItems: LaborTimeItem[],
  tableItems: LaborTableItem[]
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Phụ cấp PTTT
  const allowRows = [...allowanceItems]
    .sort((a, b) => a.loai.localeCompare(b.loai) || (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))
    .map(i => ({
      'Loại PTTT': i.loai,
      'Chính (₫)': i.chinh,
      'Phụ (₫)': i.phu,
      'Giúp việc (₫)': i.giupViec,
      'Hiệu lực từ': i.effectiveFrom,
      'Hiệu lực đến': i.effectiveTo || 'Hiện tại',
      'Trạng thái': i.effectiveTo === null ? 'Đang hiệu lực' : 'Hết hiệu lực',
    }));
  const ws1 = XLSX.utils.json_to_sheet(allowRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Phụ cấp PTTT');

  // Sheet 2: Định mức thời gian
  const timeRows = [...timeItems]
    .sort((a, b) => a.loai.localeCompare(b.loai) || (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))
    .map(i => ({
      'Loại PTTT': i.loai,
      'Tối thiểu (phút)': i.min,
      'Tối đa (phút)': i.max,
      'Hiệu lực từ': i.effectiveFrom,
      'Hiệu lực đến': i.effectiveTo || 'Hiện tại',
      'Trạng thái': i.effectiveTo === null ? 'Đang hiệu lực' : 'Hết hiệu lực',
    }));
  const ws2 = XLSX.utils.json_to_sheet(timeRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Định mức thời gian');

  // Sheet 3: Định mức bàn mổ
  const tableRows = [...tableItems]
    .sort((a, b) => a.posKey.localeCompare(b.posKey) || (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))
    .map(i => ({
      'Vị trí': i.label,
      'Mã vị trí': i.posKey,
      'Định mức bàn mổ': i.limit === 0 ? 'Không kiểm tra' : `Tối đa ${i.limit} bàn mổ (${i.limit} ca)`,
      'Hiệu lực từ': i.effectiveFrom,
      'Hiệu lực đến': i.effectiveTo || 'Hiện tại',
      'Trạng thái': i.effectiveTo === null ? 'Đang hiệu lực' : 'Hết hiệu lực',
    }));
  const ws3 = XLSX.utils.json_to_sheet(tableRows);
  XLSX.utils.book_append_sheet(wb, ws3, 'Định mức bàn mổ');

  XLSX.writeFile(wb, `Dinh_Muc_Phu_Cap_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
