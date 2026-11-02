/**
 * Service Package Service — Firestore CRUD for:
 * 1. Position Catalog (DM Vị trí)
 * 2. Service Package Definitions (Cấu hình gói)
 * 3. Service Package Assignments (Gán gói cho BN)
 * 4. Module Config (Thiết lập module)
 */
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  getCountFromServer,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import {
  PositionCatalogItem,
  ServicePackageDefinition,
  ServicePackageAssignment,
  ServicePackageModuleConfig,
  DEFAULT_POSITIONS,
  DEFAULT_MODULE_CONFIG,
  buildCompositeKey,
} from '../types/servicePackage';

// ─── Collection Paths ────────────────────────────────────────────────────────

const POSITION_CATALOG_COL = 'position_catalog';
const SERVICE_PACKAGES_COL = 'service_packages';
const ASSIGNMENTS_COL = 'service_package_assignments';
const MODULE_CONFIG_DOC = 'service_package_module_config/settings';

// ─── Position Catalog ────────────────────────────────────────────────────────

/** Subscribe to position catalog (realtime) */
export function subscribeToPositionCatalog(
  callback: (items: PositionCatalogItem[]) => void
): Unsubscribe {
  const colRef = collection(firestore, POSITION_CATALOG_COL);
  return onSnapshot(colRef, (snapshot) => {
    const items: PositionCatalogItem[] = snapshot.docs.map((d) => ({
      ...(d.data() as Omit<PositionCatalogItem, 'id'>),
      id: d.id,
    }));
    items.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
    callback(items);
  }, (error) => {
    console.error('[PositionCatalog] subscribe error:', error);
    callback([]);
  });
}

/** Save (create or update) a position catalog item */
export async function savePositionItem(item: PositionCatalogItem): Promise<void> {
  try {
    const now = Date.now();
    const ref = doc(firestore, POSITION_CATALOG_COL, item.id);
    const data: Record<string, any> = {
      key: item.key,
      label: item.label,
      shortLabel: item.shortLabel,
      group: item.group,
      isSurgeryParticipant: Boolean(item.isSurgeryParticipant),
      sortOrder: item.sortOrder ?? 99,
      active: item.active !== false,
      onlyNonSurgicalStaff: Boolean(item.onlyNonSurgicalStaff),
      createdAt: item.createdAt || now,
      updatedAt: now,
    };
    if (item.staffFilterKey) {
      data.staffFilterKey = item.staffFilterKey;
    } else {
      data.staffFilterKey = '';
    }
    await setDoc(ref, data);
  } catch (error) {
    console.error('[PositionCatalog] save error:', error);
    throw error;
  }
}

/** Delete a position catalog item (check dependency first) */
export async function deletePositionItem(id: string): Promise<{ ok: boolean; reason?: string }> {
  // Check if any package uses this position
  const pkgsSnap = await getDocs(collection(firestore, SERVICE_PACKAGES_COL));
  for (const pkgDoc of pkgsSnap.docs) {
    const pkg = pkgDoc.data() as ServicePackageDefinition;
    if (pkg.positions?.some((p) => p.positionId === id)) {
      return { ok: false, reason: `Vị trí đang được sử dụng trong gói "${pkg.name}". Hãy gỡ khỏi gói trước.` };
    }
  }
  await deleteDoc(doc(firestore, POSITION_CATALOG_COL, id));
  return { ok: true };
}

/** Seed default positions if catalog is empty */
export async function seedDefaultPositions(): Promise<boolean> {
  try {
    const snap = await getDocs(collection(firestore, POSITION_CATALOG_COL));
    if (snap.size > 0) return false; // Already seeded

    const batch = writeBatch(firestore);
    const now = Date.now();
    for (const pos of DEFAULT_POSITIONS) {
      const ref = doc(collection(firestore, POSITION_CATALOG_COL));
      batch.set(ref, {
        ...pos,
        id: ref.id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
    console.log('[PositionCatalog] seeded', DEFAULT_POSITIONS.length, 'default positions');
    return true;
  } catch (error) {
    console.error('[PositionCatalog] seed error:', error);
    return false;
  }
}

// ─── Service Package Definitions ─────────────────────────────────────────────

/** Subscribe to service package definitions (realtime) */
export function subscribeToServicePackages(
  callback: (items: ServicePackageDefinition[]) => void
): Unsubscribe {
  const colRef = collection(firestore, SERVICE_PACKAGES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const items: ServicePackageDefinition[] = snapshot.docs.map((d) => ({
      ...(d.data() as Omit<ServicePackageDefinition, 'id'>),
      id: d.id,
    }));
    items.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
    callback(items);
  }, (error) => {
    console.error('[ServicePackages] subscribe error:', error);
    callback([]);
  });
}

/** Save (create or update) a service package definition */
export async function saveServicePackage(pkg: ServicePackageDefinition): Promise<string> {
  try {
    const now = Date.now();
    const isNew = !pkg.id;
    const ref = isNew
      ? doc(collection(firestore, SERVICE_PACKAGES_COL))
      : doc(firestore, SERVICE_PACKAGES_COL, pkg.id);
    const id = ref.id;
    await setDoc(ref, {
      ...pkg,
      id,
      updatedAt: now,
      createdAt: pkg.createdAt || now,
    });
    return id;
  } catch (error) {
    console.error('[ServicePackages] save error:', error);
    throw error;
  }
}

/** Toggle active/inactive for a service package */
export async function toggleServicePackageActive(id: string, active: boolean): Promise<void> {
  const ref = doc(firestore, SERVICE_PACKAGES_COL, id);
  await setDoc(ref, { active, updatedAt: Date.now() }, { merge: true });
}

/** Delete a service package (must have 0 assignments) */
export async function deleteServicePackage(id: string): Promise<{ ok: boolean; reason?: string }> {
  const count = await countAssignmentsByPackageId(id);
  if (count > 0) {
    return { ok: false, reason: `Gói đang được gán cho ${count} ca. Hãy gỡ hết trước khi xóa.` };
  }
  await deleteDoc(doc(firestore, SERVICE_PACKAGES_COL, id));
  return { ok: true };
}

// ─── Service Package Assignments ─────────────────────────────────────────────

const cleanedDuplicateDocIds = new Set<string>();

/**
 * Khử trùng lặp các bản ghi gán gói dịch vụ theo compositeKey (giữ lại bản ghi được cập nhật mới nhất).
 * Tránh trường hợp 1 ca phẫu thuật bị lưu đúp nhiều document trên Firestore dẫn đến lệch số lượng
 * giữa tab Gói DVYC (có seenKeys) và tab Thanh toán Gói dịch vụ / badge tổng số ca.
 */
export function deduplicateAssignments(items: ServicePackageAssignment[]): ServicePackageAssignment[] {
  const byKey = new Map<string, ServicePackageAssignment>();
  for (const item of items) {
    const key =
      buildCompositeKey(item.patientId || '', item.ngayBD || '', item.tenKT || '') ||
      item.compositeKey;
    const existing = byKey.get(key);
    if (!existing || (item.updatedAt ?? item.createdAt ?? 0) >= (existing.updatedAt ?? existing.createdAt ?? 0)) {
      byKey.set(key, { ...item, compositeKey: key });
    }
  }
  return Array.from(byKey.values());
}

/**
 * Tự động dọn dẹp các bản ghi gán gói dịch vụ bị lưu trùng lặp trên Firestore (giữ lại bản mới nhất).
 */
function cleanupDuplicateAssignmentsInBackground(items: ServicePackageAssignment[]): void {
  const byKey = new Map<string, ServicePackageAssignment[]>();
  for (const item of items) {
    if (!item.id) continue;
    const key =
      buildCompositeKey(item.patientId || '', item.ngayBD || '', item.tenKT || '') ||
      item.compositeKey;
    if (!key) continue;
    const arr = byKey.get(key) || [];
    arr.push(item);
    byKey.set(key, arr);
  }

  for (const [, group] of byKey.entries()) {
    if (group.length <= 1) continue;
    // Sắp xếp giảm dần theo thời gian cập nhật để giữ lại bản ghi mới nhất
    const sorted = [...group].sort(
      (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
    );
    const duplicatesToRemove = sorted.slice(1);
    for (const dup of duplicatesToRemove) {
      if (dup.id && !cleanedDuplicateDocIds.has(dup.id)) {
        cleanedDuplicateDocIds.add(dup.id);
        deleteDoc(doc(firestore, ASSIGNMENTS_COL, dup.id)).catch((err) => {
          cleanedDuplicateDocIds.delete(dup.id);
          console.warn('[Assignments] Auto-cleanup duplicate assignment warning:', err);
        });
      }
    }
  }
}

/** Tạo ID document xác định (deterministic) từ compositeKey để chặn tuyệt đối việc tạo trùng document trên Firestore */
export function toDeterministicAssignmentDocId(compositeKey: string): string {
  return (compositeKey || '')
    .normalize('NFC')
    .trim()
    .replace(/[\/\\.#$\[\]\s]+/g, '_')
    .slice(0, 220);
}

/** Subscribe to assignments for a date range (realtime) */
export function subscribeToAssignments(
  dateFrom: string,
  dateTo: string,
  callback: (items: ServicePackageAssignment[]) => void
): Unsubscribe {
  // Simple collection listener + client-side filter (avoids composite index requirement)
  const colRef = collection(firestore, ASSIGNMENTS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const all: ServicePackageAssignment[] = snapshot.docs.map((d) => ({
      ...(d.data() as Omit<ServicePackageAssignment, 'id'>),
      id: d.id,
    }));
    const inRange = all.filter(a => {
      const d = (a.ngayBD || '').substring(0, 10);
      return d >= dateFrom && d <= dateTo;
    });
    cleanupDuplicateAssignmentsInBackground(inRange);
    const filtered = deduplicateAssignments(inRange);
    filtered.sort((a, b) => (a.ngayBD || '').localeCompare(b.ngayBD || ''));
    callback(filtered);
  }, (error) => {
    console.error('[Assignments] subscribe error:', error);
    callback([]);
  });
}

/** Subscribe to ALL assignments (no date filter) — for payment table aggregation */
export function subscribeToAllAssignments(
  callback: (items: ServicePackageAssignment[]) => void
): Unsubscribe {
  const colRef = collection(firestore, ASSIGNMENTS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const rawItems: ServicePackageAssignment[] = snapshot.docs.map((d) => ({
      ...(d.data() as Omit<ServicePackageAssignment, 'id'>),
      id: d.id,
    }));
    cleanupDuplicateAssignmentsInBackground(rawItems);
    const items = deduplicateAssignments(rawItems);
    items.sort((a, b) => (a.ngayBD || '').localeCompare(b.ngayBD || ''));
    callback(items);
  }, (error) => {
    console.error('[Assignments] subscribeAll error:', error);
    callback([]);
  });
}

/** Save (create or update) a package assignment */
export async function saveAssignment(assignment: ServicePackageAssignment): Promise<string> {
  const now = Date.now();
  // Ensure compositeKey is set and normalized
  const compositeKey =
    buildCompositeKey(assignment.patientId, assignment.ngayBD, assignment.tenKT) ||
    assignment.compositeKey;

  // Kiểm tra các document đã tồn tại có cùng compositeKey hoặc cùng bệnh nhân + ca mổ để tránh tạo bản ghi trùng lặp
  let targetId = assignment.id;
  const duplicateIdsToDelete: string[] = [];
  try {
    const cleanPid = (assignment.patientId || '').trim();
    const queries = [
      getDocs(query(collection(firestore, ASSIGNMENTS_COL), where('compositeKey', '==', compositeKey))),
      ...(cleanPid
        ? [getDocs(query(collection(firestore, ASSIGNMENTS_COL), where('patientId', '==', cleanPid)))]
        : []),
    ];
    const snaps = await Promise.all(queries);
    const matchedDocs = new Map<string, any>();
    for (const snap of snaps) {
      for (const d of snap.docs) {
        const data = d.data() as ServicePackageAssignment;
        const docKey =
          buildCompositeKey(data.patientId || '', data.ngayBD || '', data.tenKT || '') ||
          data.compositeKey;
        if (docKey === compositeKey || data.compositeKey === compositeKey) {
          matchedDocs.set(d.id, d);
        }
      }
    }

    if (matchedDocs.size > 0) {
      const matchedIds = Array.from(matchedDocs.keys());
      if (!targetId || !matchedDocs.has(targetId)) {
        targetId = matchedIds[0];
      }
      for (const docId of matchedIds) {
        if (docId !== targetId) {
          duplicateIdsToDelete.push(docId);
        }
      }
    }
  } catch (err) {
    console.warn('[Assignments] check existing compositeKey warning:', err);
  }

  const deterministicId = toDeterministicAssignmentDocId(compositeKey);
  const ref = targetId
    ? doc(firestore, ASSIGNMENTS_COL, targetId)
    : deterministicId
    ? doc(firestore, ASSIGNMENTS_COL, deterministicId)
    : doc(collection(firestore, ASSIGNMENTS_COL));
  const id = ref.id;

  await setDoc(ref, {
    ...assignment,
    id,
    compositeKey,
    updatedAt: now,
    createdAt: assignment.createdAt || now,
  });

  if (duplicateIdsToDelete.length > 0) {
    await Promise.all(
      duplicateIdsToDelete.map((dupId) => deleteDoc(doc(firestore, ASSIGNMENTS_COL, dupId)).catch(() => {}))
    );
  }

  return id;
}

/** Delete an assignment (gỡ gói khỏi BN, đồng thời xóa các bản ghi trùng compositeKey nếu có) */
export async function deleteAssignment(id: string, compositeKey?: string): Promise<void> {
  await deleteDoc(doc(firestore, ASSIGNMENTS_COL, id));
  if (compositeKey) {
    try {
      const q = query(collection(firestore, ASSIGNMENTS_COL), where('compositeKey', '==', compositeKey));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(firestore, ASSIGNMENTS_COL, d.id)).catch(() => {})));
    } catch (err) {
      console.warn('[Assignments] cleanup duplicate compositeKey on delete warning:', err);
    }
  }
}

/** Get assignments by date range (one-shot, for BC tháng import) */
export async function getAssignmentsByDateRange(
  dateFrom: string,
  dateTo: string
): Promise<ServicePackageAssignment[]> {
  try {
    const snapshot = await getDocs(collection(firestore, ASSIGNMENTS_COL));
    const all = snapshot.docs.map((d) => ({
      ...(d.data() as Omit<ServicePackageAssignment, 'id'>),
      id: d.id,
    }));
    return deduplicateAssignments(
      all.filter(a => {
        const d = (a.ngayBD || '').substring(0, 10);
        return d >= dateFrom && d <= dateTo;
      })
    ).sort((a, b) => (a.ngayBD || '').localeCompare(b.ngayBD || ''));
  } catch (error) {
    console.error('[Assignments] getByDateRange error:', error);
    return [];
  }
}

/** Get a single assignment by composite key */
export async function getAssignmentByCompositeKey(
  compositeKey: string
): Promise<ServicePackageAssignment | null> {
  const q = query(
    collection(firestore, ASSIGNMENTS_COL),
    where('compositeKey', '==', compositeKey)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { ...(d.data() as Omit<ServicePackageAssignment, 'id'>), id: d.id };
}

/** Count assignments using a specific package ID */
export async function countAssignmentsByPackageId(packageId: string): Promise<number> {
  const q = query(
    collection(firestore, ASSIGNMENTS_COL),
    where('packageId', '==', packageId)
  );
  const snapshot = await getCountFromServer(q);
  return snapshot.data().count;
}

// ─── Module Config ───────────────────────────────────────────────────────────

/** Subscribe to module config (realtime) */
export function subscribeToModuleConfig(
  callback: (config: ServicePackageModuleConfig) => void
): Unsubscribe {
  const ref = doc(firestore, MODULE_CONFIG_DOC);
  return onSnapshot(ref, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as ServicePackageModuleConfig);
    } else {
      callback({ ...DEFAULT_MODULE_CONFIG });
    }
  });
}

/** Save module config */
export async function saveModuleConfig(config: ServicePackageModuleConfig): Promise<void> {
  const ref = doc(firestore, MODULE_CONFIG_DOC);
  await setDoc(ref, config);
}
