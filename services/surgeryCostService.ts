/**
 * Surgery Cost Service
 * CRUD + toggle + duplicate + smart-delete for per-surgery cost items
 * Data stored in Firebase RTDB under 'surgery_cost_items'
 * Each item references a SurgeryNamePrice by refPriceId
 */
import { ref, onValue, push, set, remove, update, get } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { SurgeryCostItem, SurgeryNamePrice } from '../types';

const COST_ITEMS_PATH = 'surgery_cost_items';

// ─── Date helpers ────────────────────────────────────────────────────────────

function normalizeDate(raw: any): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

/** Trả về ngày trước 1 ngày so với dateStr (yyyy-mm-dd) */
function dayBefore(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Realtime Listener ──────────────────────────────────────────────────────

export function subscribeToCostItems(
  callback: (items: SurgeryCostItem[]) => void
): () => void {
  const costRef = ref(db, COST_ITEMS_PATH);
  const unsubscribe = onValue(costRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const items: SurgeryCostItem[] = Object.entries(data).map(([key, val]: [string, any]) => ({
      id: key,
      refPriceId: val.refPriceId || '',
      maTuongDuong: val.maTuongDuong || '',
      tenKT: val.tenKT || '',
      donGia: val.donGia || 0,
      medicCost: val.medicCost || 0,
      vtthCost: val.vtthCost || 0,
      effectiveFrom: normalizeDate(val.effectiveFrom),
      effectiveTo: val.effectiveTo ? normalizeDate(val.effectiveTo) : null,
      createdAt: val.createdAt || 0,
      updatedAt: val.updatedAt || 0,
    }));

    // Sort by tenKT then effectiveFrom desc
    items.sort((a, b) => {
      const cmp = a.tenKT.localeCompare(b.tenKT, 'vi');
      if (cmp !== 0) return cmp;
      return b.effectiveFrom.localeCompare(a.effectiveFrom);
    });

    callback(items);
  });

  return unsubscribe;
}

// ─── Read helpers ────────────────────────────────────────────────────────────

/** Trả về Set<refPriceId> — dùng để check toggle status trong DM giá */
export function getCostRefPriceIds(costItems: SurgeryCostItem[]): Set<string> {
  return new Set(costItems.map(c => c.refPriceId));
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function addCostItem(
  priceItem: SurgeryNamePrice,
  medicCost: number,
  vtthCost: number,
  effectiveFrom: string,
  effectiveTo: string | null = null,
): Promise<string> {
  const costRef = ref(db, COST_ITEMS_PATH);
  const newRef = push(costRef);
  const now = Date.now();
  const item = {
    refPriceId: priceItem.id,
    maTuongDuong: priceItem.maTuongDuong || '',
    tenKT: priceItem.tenKT,
    donGia: priceItem.price,
    medicCost,
    vtthCost,
    effectiveFrom: normalizeDate(effectiveFrom),
    effectiveTo: effectiveTo ? normalizeDate(effectiveTo) : null,
    createdAt: now,
    updatedAt: now,
  };
  await set(newRef, item);
  return newRef.key!;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateCostItem(
  id: string,
  updates: Partial<Pick<SurgeryCostItem, 'medicCost' | 'vtthCost' | 'effectiveFrom' | 'effectiveTo'>>
): Promise<void> {
  if (updates.medicCost !== undefined && (isNaN(updates.medicCost) || updates.medicCost <= 0)) {
    throw new Error('Chi phí thuốc phải là số lớn hơn 0 (> 0)');
  }
  if (updates.vtthCost !== undefined && (isNaN(updates.vtthCost) || updates.vtthCost <= 0)) {
    throw new Error('Chi phí VTTH phải là số lớn hơn 0 (> 0)');
  }
  const itemRef = ref(db, `${COST_ITEMS_PATH}/${id}`);
  const normalized: any = { ...updates, updatedAt: Date.now() };
  if (normalized.effectiveFrom) normalized.effectiveFrom = normalizeDate(normalized.effectiveFrom);
  if (normalized.effectiveTo !== undefined) {
    normalized.effectiveTo = normalized.effectiveTo ? normalizeDate(normalized.effectiveTo) : null;
  }
  await update(itemRef, normalized);
}

// ─── Delete with smart validity gap prevention ──────────────────────────────

export async function deleteCostItem(
  id: string,
  allCostItems: SurgeryCostItem[]
): Promise<void> {
  const item = allCostItems.find(c => c.id === id);
  if (!item) {
    await remove(ref(db, `${COST_ITEMS_PATH}/${id}`));
    return;
  }

  // Tìm chuỗi cùng refPriceId, sắp xếp theo effectiveFrom
  const siblings = allCostItems
    .filter(c => c.refPriceId === item.refPriceId && c.id !== id)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  // Tìm item trước (predecessor) trong chuỗi hiệu lực
  const predecessor = siblings
    .filter(c => c.effectiveFrom < item.effectiveFrom)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  // Tìm item sau (successor)
  const successor = siblings
    .filter(c => c.effectiveFrom > item.effectiveFrom)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];

  // Xóa item
  await remove(ref(db, `${COST_ITEMS_PATH}/${id}`));

  // Nếu có predecessor → mở rộng effectiveTo để không có khoảng trống
  if (predecessor) {
    const newEnd = successor ? dayBefore(successor.effectiveFrom) : null;
    await update(ref(db, `${COST_ITEMS_PATH}/${predecessor.id}`), {
      effectiveTo: newEnd,
      updatedAt: Date.now(),
    });
  }
}

// ─── Duplicate with auto-close old ──────────────────────────────────────────

export async function duplicateCostItem(
  id: string,
  newEffectiveFrom: string,
  allCostItems: SurgeryCostItem[]
): Promise<string> {
  const original = allCostItems.find(c => c.id === id);
  if (!original) throw new Error('Item không tồn tại');

  const normalizedFrom = normalizeDate(newEffectiveFrom);

  // Tự đóng hiệu lực cũ: effectiveTo = newEffectiveFrom - 1 ngày
  await update(ref(db, `${COST_ITEMS_PATH}/${id}`), {
    effectiveTo: dayBefore(normalizedFrom),
    updatedAt: Date.now(),
  });

  // Tạo bản sao mới
  const costRef = ref(db, COST_ITEMS_PATH);
  const newRef = push(costRef);
  const now = Date.now();
  await set(newRef, {
    refPriceId: original.refPriceId,
    maTuongDuong: original.maTuongDuong,
    tenKT: original.tenKT,
    donGia: original.donGia,
    medicCost: original.medicCost,
    vtthCost: original.vtthCost,
    effectiveFrom: normalizedFrom,
    effectiveTo: null, // Đang hiệu lực
    createdAt: now,
    updatedAt: now,
  });

  return newRef.key!;
}

// ─── Toggle from DM giá ─────────────────────────────────────────────────────

export async function toggleCostItem(
  priceItem: SurgeryNamePrice,
  enable: boolean,
  allCostItems: SurgeryCostItem[]
): Promise<void> {
  if (enable) {
    // Thêm mới với default costs = 0
    await addCostItem(
      priceItem,
      0, // medicCost — user sẽ nhập sau
      0, // vtthCost — user sẽ nhập sau
      priceItem.effectiveFrom,
      priceItem.effectiveTo,
    );
  } else {
    // Xóa tất cả cost items tham chiếu đến priceItem.id
    const toDelete = allCostItems.filter(c => c.refPriceId === priceItem.id);
    for (const item of toDelete) {
      await remove(ref(db, `${COST_ITEMS_PATH}/${item.id}`));
    }
  }
}

// ─── Export Excel ────────────────────────────────────────────────────────────

export function exportCostItemsExcel(items: SurgeryCostItem[]): void {
  const rows = items.map((item, i) => ({
    'STT': i + 1,
    'Mã tương đương': item.maTuongDuong,
    'Tên DVKT': item.tenKT,
    'Đơn giá (VNĐ)': item.donGia,
    'Chi phí thuốc (VNĐ)': item.medicCost,
    'Chi phí VTTH (VNĐ)': item.vtthCost,
    'Tổng chi phí': item.donGia + item.medicCost + item.vtthCost,
    'Hiệu lực từ': item.effectiveFrom,
    'Hiệu lực đến': item.effectiveTo || 'Hiện tại',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Chi phí PTTT');

  // Auto-width
  const colWidths = Object.keys(rows[0] || {}).map(k => ({
    wch: Math.max(k.length + 2, 14)
  }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `DM_Chi_Phi_PTTT_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
