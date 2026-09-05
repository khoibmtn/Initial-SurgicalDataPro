/**
 * Labor Config Service — Timeline-based management for Định mức & Phụ cấp
 * 
 * Each version holds priceConfig + timeRules for a specific date range.
 * When looking up config for a surgery date, the system finds the version
 * whose effectiveFrom <= date and (effectiveTo >= date OR effectiveTo is null).
 */
import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { LaborConfigVersion, RolePrice, TimeRule, LOAI_PTTT_ORDER } from '../types';

const LABOR_CONFIG_PATH = 'labor_config_versions';

// ─── Date helpers ────────────────────────────────────────────────────────────

function normalizeDate(raw: any): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Default Config (same as ConfigContext defaults) ─────────────────────────

const DEFAULT_PRICE_CONFIG: Record<string, RolePrice> = {
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

const DEFAULT_TIME_RULES: Record<string, TimeRule> = {
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

// ─── Realtime Listener ──────────────────────────────────────────────────────

export function subscribeToLaborConfigs(
  callback: (versions: LaborConfigVersion[]) => void
): () => void {
  const configRef = ref(db, LABOR_CONFIG_PATH);
  const unsubscribe = onValue(configRef, (snapshot) => {
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

    // Sort by effectiveFrom desc (newest first)
    versions.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    callback(versions);
  });

  return unsubscribe;
}

// ─── Core: Get Config for a Specific Date ───────────────────────────────────

/**
 * Returns the labor config version that is effective on the given date.
 * If no version matches, returns null (caller should fallback to static config).
 * 
 * Logic: Find the version where effectiveFrom <= date AND (effectiveTo >= date OR effectiveTo is null)
 */
export function getLaborConfigForDate(
  date: string,
  allConfigs: LaborConfigVersion[]
): LaborConfigVersion | null {
  if (!date || allConfigs.length === 0) return null;

  const normalized = normalizeDate(date);
  if (!normalized) return null;

  // Sort by effectiveFrom desc to find the most recent applicable version
  const sorted = [...allConfigs].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  for (const version of sorted) {
    if (version.effectiveFrom <= normalized) {
      if (version.effectiveTo === null || version.effectiveTo >= normalized) {
        return version;
      }
    }
  }

  return null;
}

/**
 * Returns priceConfig + timeRules for a given date.
 * Falls back to static defaults if no timeline version is found.
 */
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

// ─── Create ─────────────────────────────────────────────────────────────────

export async function addLaborConfig(
  name: string,
  effectiveFrom: string,
  priceConfig: Record<string, RolePrice>,
  timeRules: Record<string, TimeRule>,
  note: string = '',
  allConfigs: LaborConfigVersion[] = [],
): Promise<string> {
  const normalizedFrom = normalizeDate(effectiveFrom);
  const now = Date.now();

  // Auto-close the currently active version
  const active = allConfigs.find(c => c.effectiveTo === null && c.effectiveFrom < normalizedFrom);
  if (active) {
    const closedEnd = dayBefore(normalizedFrom);
    await update(ref(db, `${LABOR_CONFIG_PATH}/${active.id}`), {
      effectiveTo: closedEnd,
      updatedAt: now,
    });
  }

  const configRef = ref(db, LABOR_CONFIG_PATH);
  const newRef = push(configRef);
  await set(newRef, {
    name,
    effectiveFrom: normalizedFrom,
    effectiveTo: null,
    priceConfig,
    timeRules,
    note,
    createdAt: now,
    updatedAt: now,
  });
  return newRef.key!;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateLaborConfig(
  id: string,
  updates: Partial<Pick<LaborConfigVersion,
    'name' | 'effectiveFrom' | 'effectiveTo' | 'priceConfig' | 'timeRules' | 'note'
  >>
): Promise<void> {
  const itemRef = ref(db, `${LABOR_CONFIG_PATH}/${id}`);
  const normalized: any = { ...updates, updatedAt: Date.now() };
  if (normalized.effectiveFrom) {
    normalized.effectiveFrom = normalizeDate(normalized.effectiveFrom);
  }
  if (normalized.effectiveTo !== undefined) {
    normalized.effectiveTo = normalized.effectiveTo ? normalizeDate(normalized.effectiveTo) : null;
  }
  await update(itemRef, normalized);
}

// ─── Delete with smart gap prevention ───────────────────────────────────────

export async function deleteLaborConfig(
  id: string,
  allConfigs: LaborConfigVersion[]
): Promise<void> {
  const item = allConfigs.find(c => c.id === id);
  if (!item) {
    await remove(ref(db, `${LABOR_CONFIG_PATH}/${id}`));
    return;
  }

  const siblings = allConfigs
    .filter(c => c.id !== id)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const predecessor = siblings
    .filter(c => c.effectiveFrom < item.effectiveFrom)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  const successor = siblings
    .filter(c => c.effectiveFrom > item.effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];

  await remove(ref(db, `${LABOR_CONFIG_PATH}/${id}`));

  // Extend predecessor to fill the gap
  if (predecessor) {
    const newEnd = successor ? dayBefore(successor.effectiveFrom) : null;
    await update(ref(db, `${LABOR_CONFIG_PATH}/${predecessor.id}`), {
      effectiveTo: newEnd,
      updatedAt: Date.now(),
    });
  }
}

// ─── Duplicate ──────────────────────────────────────────────────────────────

export async function duplicateLaborConfig(
  id: string,
  newEffectiveFrom: string,
  allConfigs: LaborConfigVersion[],
  newName?: string,
): Promise<string> {
  const original = allConfigs.find(c => c.id === id);
  if (!original) throw new Error('Phiên bản không tồn tại');

  const normalizedFrom = normalizeDate(newEffectiveFrom);
  const closedEnd = dayBefore(normalizedFrom);
  const now = Date.now();

  // Close old version
  await update(ref(db, `${LABOR_CONFIG_PATH}/${id}`), {
    effectiveTo: closedEnd,
    updatedAt: now,
  });

  // Create new version
  const configRef = ref(db, LABOR_CONFIG_PATH);
  const newRef = push(configRef);
  await set(newRef, {
    name: newName || `${original.name} (mới)`,
    effectiveFrom: normalizedFrom,
    effectiveTo: null,
    priceConfig: { ...original.priceConfig },
    timeRules: { ...original.timeRules },
    note: `Nhân đôi từ "${original.name}"`,
    createdAt: now,
    updatedAt: now,
  });

  return newRef.key!;
}

// ─── Auto-migration: Create default version from static config ──────────────

export async function ensureDefaultLaborConfig(
  staticPriceConfig?: Record<string, RolePrice>,
  staticTimeRules?: Record<string, TimeRule>,
): Promise<boolean> {
  const configRef = ref(db, LABOR_CONFIG_PATH);
  const snapshot = await get(configRef);

  if (snapshot.exists()) return false; // Already has versions

  const now = Date.now();
  const newRef = push(configRef);
  await set(newRef, {
    name: 'Quy định ban đầu',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    priceConfig: staticPriceConfig || DEFAULT_PRICE_CONFIG,
    timeRules: staticTimeRules || DEFAULT_TIME_RULES,
    note: 'Tự động tạo từ cấu hình tĩnh hiện có',
    createdAt: now,
    updatedAt: now,
  });

  console.log('[laborConfig] Auto-migrated static config → timeline version');
  return true;
}

// ─── Export Excel ────────────────────────────────────────────────────────────

export function exportLaborConfigsExcel(configs: LaborConfigVersion[]): void {
  const sorted = [...configs].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const rows: Record<string, any>[] = [];

  for (const config of sorted) {
    for (const loai of LOAI_PTTT_ORDER) {
      const price = config.priceConfig[loai];
      const time = config.timeRules[loai];
      rows.push({
        'Phiên bản': config.name,
        'Hiệu lực từ': config.effectiveFrom,
        'Hiệu lực đến': config.effectiveTo || 'Hiện tại',
        'Loại PTTT': loai,
        'Phụ cấp Chính (₫)': price?.['Chính'] || 0,
        'Phụ cấp Phụ (₫)': price?.['Phụ'] || 0,
        'Phụ cấp Giúp việc (₫)': price?.['Giúp việc'] || 0,
        'Thời gian tối thiểu (phút)': time?.min || 0,
        'Thời gian tối đa (phút)': time?.max || 0,
        'Ghi chú': config.note,
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Định mức & Phụ cấp');

  const colWidths = Object.keys(rows[0] || {}).map(k => ({
    wch: Math.max(k.length + 2, 16),
  }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `Dinh_Muc_Phu_Cap_Timeline_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
