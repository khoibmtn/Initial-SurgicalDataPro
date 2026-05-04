/**
 * Pricing Service
 * CRUD for surgery service price versions in Firebase RTDB
 * Includes: overlap validation, Excel import/export
 */
import { ref, onValue, push, set, remove, update } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { SurgeryPriceVersion, LOAI_PTTT_ORDER, LOAI_PTTT_LABELS } from '../types';

const PRICES_PATH = 'surgery_service_prices';

// --- Validation ---

/** Validate that a new price version doesn't overlap with existing ones */
export function validatePriceVersionOverlap(
  newVersion: Omit<SurgeryPriceVersion, 'id' | 'createdAt'>,
  existingVersions: SurgeryPriceVersion[],
  editingId?: string
): string | null {
  const newEnd = newVersion.effectiveTo || '9999-12-31';

  for (const v of existingVersions) {
    if (editingId && v.id === editingId) continue;
    const existEnd = v.effectiveTo || '9999-12-31';

    if (newVersion.effectiveFrom <= existEnd && v.effectiveFrom <= newEnd) {
      return `Trùng thời gian với "${v.name}" (${v.effectiveFrom} → ${v.effectiveTo || 'hiện tại'})`;
    }
  }
  return null;
}

/** Validate that all 9 surgery types have prices */
export function validatePrices(prices: Record<string, number>): string[] {
  const errors: string[] = [];
  for (const code of LOAI_PTTT_ORDER) {
    if (prices[code] === undefined || prices[code] === null) {
      errors.push(`Thiếu đơn giá cho ${code} (${LOAI_PTTT_LABELS[code]})`);
    } else if (prices[code] < 0) {
      errors.push(`Đơn giá ${code} không được âm`);
    }
  }
  return errors;
}

// --- CRUD ---

/** Subscribe to price versions (realtime listener) */
export function subscribeToPriceVersions(
  callback: (versions: SurgeryPriceVersion[]) => void
): () => void {
  const pricesRef = ref(db, PRICES_PATH);
  const unsubscribe = onValue(pricesRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const versions: SurgeryPriceVersion[] = Object.entries(data).map(([key, val]: [string, any]) => ({
      id: key,
      name: val.name || '',
      effectiveFrom: val.effectiveFrom || '',
      effectiveTo: val.effectiveTo || null,
      createdAt: val.createdAt || 0,
      note: val.note || '',
      prices: val.prices || {},
    }));

    // Sort by effectiveFrom desc (newest first)
    versions.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    callback(versions);
  });

  return unsubscribe;
}

/** Create a new price version */
export async function createPriceVersion(
  version: Omit<SurgeryPriceVersion, 'id' | 'createdAt'>
): Promise<string> {
  const pricesRef = ref(db, PRICES_PATH);
  const newRef = push(pricesRef);
  const data = {
    ...version,
    createdAt: Date.now(),
  };
  await set(newRef, data);
  return newRef.key!;
}

/** Update an existing price version */
export async function updatePriceVersion(
  id: string,
  updates: Partial<Omit<SurgeryPriceVersion, 'id' | 'createdAt'>>
): Promise<void> {
  const versionRef = ref(db, `${PRICES_PATH}/${id}`);
  await update(versionRef, updates);
}

/** Delete a price version */
export async function deletePriceVersion(id: string): Promise<void> {
  const versionRef = ref(db, `${PRICES_PATH}/${id}`);
  await remove(versionRef);
}

// --- Excel Export ---

/** Export a blank template Excel for price input */
export function exportPriceTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Info
  const infoData = [
    ['TÊN BẢNG GIÁ', ''],
    ['NGÀY HIỆU LỰC TỪ (yyyy-mm-dd)', ''],
    ['NGÀY KẾT THÚC (yyyy-mm-dd, để trống = đang áp dụng)', ''],
    ['GHI CHÚ', ''],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 45 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Thông tin');

  // Sheet 2: Prices
  const priceRows = LOAI_PTTT_ORDER.map(code => [code, LOAI_PTTT_LABELS[code], '']);
  const priceData = [['Mã loại', 'Tên đầy đủ', 'Đơn giá (VNĐ)'], ...priceRows];
  const wsPrices = XLSX.utils.aoa_to_sheet(priceData);
  wsPrices['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsPrices, 'Bảng giá');

  XLSX.writeFile(wb, 'Mẫu_Bảng_giá_PTTT.xlsx');
}

/** Export a specific price version to Excel */
export function exportPriceVersion(version: SurgeryPriceVersion): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Info
  const infoData = [
    ['TÊN BẢNG GIÁ', version.name],
    ['NGÀY HIỆU LỰC TỪ', version.effectiveFrom],
    ['NGÀY KẾT THÚC', version.effectiveTo || '(đang áp dụng)'],
    ['GHI CHÚ', version.note],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Thông tin');

  // Sheet 2: Prices
  const priceRows = LOAI_PTTT_ORDER.map(code => [
    code,
    LOAI_PTTT_LABELS[code],
    version.prices[code] ?? 0,
  ]);
  const priceData = [['Mã loại', 'Tên đầy đủ', 'Đơn giá (VNĐ)'], ...priceRows];
  const wsPrices = XLSX.utils.aoa_to_sheet(priceData);
  wsPrices['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsPrices, 'Bảng giá');

  const safeName = version.name.replace(/[^a-zA-Z0-9À-ỹ\s_-]/g, '').substring(0, 50);
  XLSX.writeFile(wb, `Bảng_giá_${safeName}.xlsx`);
}

// --- Excel Import ---

export interface ImportedPriceData {
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string;
  prices: Record<string, number>;
  errors: string[];
}

/** Parse an uploaded Excel file into price version data */
export function parseImportedPriceExcel(workbook: XLSX.WorkBook): ImportedPriceData {
  const result: ImportedPriceData = {
    name: '',
    effectiveFrom: '',
    effectiveTo: null,
    note: '',
    prices: {},
    errors: [],
  };

  // Parse Sheet 1: Info
  const infoSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (infoSheet) {
    const infoData = XLSX.utils.sheet_to_json<any[]>(infoSheet, { header: 1 });
    result.name = String(infoData[0]?.[1] ?? '').trim();
    result.effectiveFrom = String(infoData[1]?.[1] ?? '').trim();
    const endDate = String(infoData[2]?.[1] ?? '').trim();
    result.effectiveTo = endDate && !endDate.includes('đang áp dụng') ? endDate : null;
    result.note = String(infoData[3]?.[1] ?? '').trim();
  }

  // Parse Sheet 2: Prices
  const priceSheetName = workbook.SheetNames.find(n => n.includes('giá')) || workbook.SheetNames[1];
  if (priceSheetName) {
    const priceSheet = workbook.Sheets[priceSheetName];
    const priceData = XLSX.utils.sheet_to_json<any[]>(priceSheet, { header: 1 });

    // Skip header row
    for (let i = 1; i < priceData.length; i++) {
      const row = priceData[i] as any[];
      if (!row || !row[0]) continue;

      const code = String(row[0]).trim();
      const price = Number(row[2]);

      if (LOAI_PTTT_ORDER.includes(code as any)) {
        if (isNaN(price) || price < 0) {
          result.errors.push(`Đơn giá không hợp lệ cho ${code}: "${row[2]}"`);
        } else {
          result.prices[code] = price;
        }
      }
    }
  }

  // Validate
  if (!result.name) result.errors.push('Thiếu tên bảng giá');
  if (!result.effectiveFrom) result.errors.push('Thiếu ngày hiệu lực');
  if (result.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(result.effectiveFrom)) {
    result.errors.push('Ngày hiệu lực không đúng định dạng (yyyy-mm-dd)');
  }

  const priceErrors = validatePrices(result.prices);
  result.errors.push(...priceErrors);

  return result;
}
