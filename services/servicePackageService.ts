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
    const filtered = all.filter(a => {
      const d = (a.ngayBD || '').substring(0, 10);
      return d >= dateFrom && d <= dateTo;
    });
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
    const items: ServicePackageAssignment[] = snapshot.docs.map((d) => ({
      ...(d.data() as Omit<ServicePackageAssignment, 'id'>),
      id: d.id,
    }));
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
  const isNew = !assignment.id;
  const ref = isNew
    ? doc(collection(firestore, ASSIGNMENTS_COL))
    : doc(firestore, ASSIGNMENTS_COL, assignment.id);
  const id = ref.id;

  // Ensure compositeKey is set
  const compositeKey = assignment.compositeKey ||
    buildCompositeKey(assignment.patientId, assignment.ngayBD, assignment.tenKT);

  await setDoc(ref, {
    ...assignment,
    id,
    compositeKey,
    updatedAt: now,
    createdAt: assignment.createdAt || now,
  });
  return id;
}

/** Delete an assignment (gỡ gói khỏi BN) */
export async function deleteAssignment(id: string): Promise<void> {
  await deleteDoc(doc(firestore, ASSIGNMENTS_COL, id));
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
    return all.filter(a => {
      const d = (a.ngayBD || '').substring(0, 10);
      return d >= dateFrom && d <= dateTo;
    }).sort((a, b) => (a.ngayBD || '').localeCompare(b.ngayBD || ''));
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
