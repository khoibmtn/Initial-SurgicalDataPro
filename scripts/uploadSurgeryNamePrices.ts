/**
 * Upload / Upsert Danh_muc_gia_phau_thuat.xlsx (with loaiPTTT) into Firebase RTDB `surgery_name_prices`
 *
 * Usage:
 *   1. npx firebase-tools database:get /surgery_name_prices > /tmp/current_surgery_name_prices.json
 *   2. npx tsx scripts/uploadSurgeryNamePrices.ts
 *   3. npx firebase-tools database:update /surgery_name_prices /tmp/updated_surgery_name_prices.json -y
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  parseImportedNamePriceExcel,
  normalizeForMatch,
  normalizeStoredDate,
} from '../services/surgeryNamePriceService';
import { resolveDefaultLoaiPTTT } from '../services/defaultSurgeryLoaiMap';

const EXCEL_PATH = process.argv[2] || '/Users/buiminhkhoi/Documents/TEMP/Danh_muc_gia_phau_thuat.xlsx';
const CURRENT_JSON_PATH = '/tmp/current_surgery_name_prices.json';
const OUTPUT_JSON_PATH = '/tmp/updated_surgery_name_prices.json';

function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_PATH}`);
  }
  if (!fs.existsSync(CURRENT_JSON_PATH)) {
    throw new Error(`Current RTDB JSON not found: ${CURRENT_JSON_PATH}`);
  }

  const fileBuffer = fs.readFileSync(EXCEL_PATH);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const parsed = parseImportedNamePriceExcel(workbook);

  console.log(`[UploadDMKT] Parsed ${parsed.items.length} items from Excel (errors: ${parsed.errors.length}, warnings: ${parsed.warnings.length})`);
  if (parsed.errors.length > 0) {
    console.warn('[UploadDMKT] Sample errors:', parsed.errors.slice(0, 5));
  }

  const rawCurrent = fs.readFileSync(CURRENT_JSON_PATH, 'utf-8').trim();
  const currentData: Record<string, any> = rawCurrent && rawCurrent !== 'null' ? JSON.parse(rawCurrent) : {};
  const existingEntries = Object.entries(currentData);
  console.log(`[UploadDMKT] Existing records in RTDB: ${existingEntries.length}`);

  // Build two-tier lookup maps to preserve 1-to-1 identity when multiple records share normalized name:
  // Tier 1: exact (tenKT.trim() | normalizedEffectiveFrom | maTuongDuong.trim()) -> array of unused keys
  // Tier 2: normalized (normalizeForMatch(tenKT) | normalizedEffectiveFrom) -> array of unused keys
  const exactMap = new Map<string, string[]>();
  const normMap = new Map<string, string[]>();
  const usedKeys = new Set<string>();

  for (const [key, val] of existingEntries) {
    if (!val || typeof val !== 'object') continue;
    const tenKT = String(val.tenKT || '').trim();
    const effFrom = normalizeStoredDate(val.effectiveFrom);
    const mtd = String(val.maTuongDuong || val.note || '').trim();

    const exactKey = `${tenKT}|${effFrom}|${mtd}`;
    const exactList = exactMap.get(exactKey) || [];
    exactList.push(key);
    exactMap.set(exactKey, exactList);

    const normKey = `${normalizeForMatch(tenKT)}|${effFrom}`;
    const normList = normMap.get(normKey) || [];
    normList.push(key);
    normMap.set(normKey, normList);
  }

  const outputPayload: Record<string, any> = { ...currentData };
  let updatedCount = 0;
  let createdCount = 0;
  let withLoaiCount = 0;
  const now = Date.now();

  // Pass 1: Match by exact key first so exact matches don't get consumed by normalized matches
  const unmatchedItems: typeof parsed.items = [];

  for (const item of parsed.items) {
    const exactKey = `${item.tenKT.trim()}|${item.effectiveFrom}|${(item.maTuongDuong || '').trim()}`;
    const candidates = exactMap.get(exactKey);
    const availableKey = candidates?.find((k) => !usedKeys.has(k));

    if (availableKey) {
      usedKeys.add(availableKey);
      const existingRecord = currentData[availableKey] || {};
      const resolvedLoai = resolveDefaultLoaiPTTT(
        item.tenKT,
        item.maTuongDuong,
        item.loaiPTTT || existingRecord.loaiPTTT
      );
      if (resolvedLoai) withLoaiCount++;

      outputPayload[availableKey] = {
        ...existingRecord,
        tenKT: item.tenKT,
        price: item.price,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo ?? null,
        maTuongDuong: item.maTuongDuong ?? '',
        createdAt: existingRecord.createdAt || now,
        ...(resolvedLoai ? { loaiPTTT: resolvedLoai } : {}),
      };
      updatedCount++;
    } else {
      unmatchedItems.push(item);
    }
  }

  // Pass 2: Match remaining items by normalized (tenKT | effectiveFrom), or create new record
  let newIndex = 0;
  for (const item of unmatchedItems) {
    const normKey = `${normalizeForMatch(item.tenKT)}|${item.effectiveFrom}`;
    const candidates = normMap.get(normKey);
    const availableKey = candidates?.find((k) => !usedKeys.has(k));

    const resolvedLoai = resolveDefaultLoaiPTTT(item.tenKT, item.maTuongDuong, item.loaiPTTT);
    if (resolvedLoai) withLoaiCount++;

    if (availableKey) {
      usedKeys.add(availableKey);
      const existingRecord = currentData[availableKey] || {};
      const finalLoai = resolvedLoai || existingRecord.loaiPTTT || '';
      outputPayload[availableKey] = {
        ...existingRecord,
        tenKT: item.tenKT,
        price: item.price,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo ?? null,
        maTuongDuong: item.maTuongDuong ?? '',
        createdAt: existingRecord.createdAt || now,
        ...(finalLoai ? { loaiPTTT: finalLoai } : {}),
      };
      updatedCount++;
    } else {
      newIndex++;
      const newKey = `-Upsert_${now}_${String(newIndex).padStart(5, '0')}`;
      outputPayload[newKey] = {
        tenKT: item.tenKT,
        price: item.price,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo ?? null,
        maTuongDuong: item.maTuongDuong ?? '',
        createdAt: now,
        ...(resolvedLoai ? { loaiPTTT: resolvedLoai } : {}),
      };
      createdCount++;
    }
  }

  // Also backfill loaiPTTT for any existing records in RTDB that weren't in the Excel file
  let backfilledExisting = 0;
  for (const [key, val] of Object.entries(outputPayload)) {
    if (!val || typeof val !== 'object') continue;
    if (!val.loaiPTTT) {
      const fallbackLoai = resolveDefaultLoaiPTTT(val.tenKT, val.maTuongDuong || val.note, val.loaiPTTT);
      if (fallbackLoai) {
        outputPayload[key] = { ...val, loaiPTTT: fallbackLoai };
        backfilledExisting++;
      }
    }
  }

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(outputPayload));
  const totalOut = Object.keys(outputPayload).length;
  const totalWithLoai = Object.values(outputPayload).filter((v: any) => v && v.loaiPTTT).length;

  console.log(`[UploadDMKT] Summary:`);
  console.log(`  - Updated existing records: ${updatedCount}`);
  console.log(`  - Created new records:      ${createdCount}`);
  console.log(`  - Backfilled other records: ${backfilledExisting}`);
  console.log(`  - Total records in output:  ${totalOut} (with loaiPTTT: ${totalWithLoai})`);
  console.log(`[UploadDMKT] Saved payload to ${OUTPUT_JSON_PATH}`);
  process.exit(0);
}

main();
