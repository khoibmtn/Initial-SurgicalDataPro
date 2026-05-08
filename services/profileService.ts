/**
 * Profile Service
 * CRUD for surgery profiles stored in Firestore (global, real-time)
 * Each profile contains a name and a list of surgery names (tenKT)
 */
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp, arrayUnion, arrayRemove,
  Timestamp,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import { SurgeryProfile, SurgeryNamePrice } from '../types';

const PROFILES_COLLECTION = 'surgery_profiles';

// --- Realtime Subscription ---

export function subscribeToProfiles(
  callback: (profiles: SurgeryProfile[]) => void
): () => void {
  const q = query(
    collection(firestore, PROFILES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const profiles: SurgeryProfile[] = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || '',
        surgeryNames: data.surgeryNames || [],
        createdAt: data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : (data.createdAt || 0),
        updatedAt: data.updatedAt instanceof Timestamp
          ? data.updatedAt.toMillis()
          : (data.updatedAt || 0),
      };
    });
    callback(profiles);
  }, (error) => {
    console.error('[ProfileService] Subscribe error:', error);
    callback([]);
  });

  return unsubscribe;
}

// --- CRUD ---

export async function createProfile(name: string): Promise<string> {
  if (!name.trim()) throw new Error('Tên profile không được để trống');

  const docRef = await addDoc(collection(firestore, PROFILES_COLLECTION), {
    name: name.trim(),
    surgeryNames: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function deleteProfile(id: string): Promise<void> {
  await deleteDoc(doc(firestore, PROFILES_COLLECTION, id));
}

export async function addSurgeryToProfile(
  profileId: string,
  tenKT: string
): Promise<void> {
  const normalized = tenKT.trim().toLowerCase();
  if (!normalized) return;

  await updateDoc(doc(firestore, PROFILES_COLLECTION, profileId), {
    surgeryNames: arrayUnion(normalized),
    updatedAt: serverTimestamp(),
  });
}

export async function removeSurgeryFromProfile(
  profileId: string,
  tenKT: string
): Promise<void> {
  const normalized = tenKT.trim().toLowerCase();
  if (!normalized) return;

  await updateDoc(doc(firestore, PROFILES_COLLECTION, profileId), {
    surgeryNames: arrayRemove(normalized),
    updatedAt: serverTimestamp(),
  });
}

// --- Helpers ---

/** Extract unique surgery names from the price catalog */
export function getUniqueNamesFromPrices(
  namePrices: SurgeryNamePrice[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const p of namePrices) {
    const name = p.tenKT?.trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(name);
  }

  result.sort((a, b) => a.localeCompare(b, 'vi'));
  return result;
}

/** A surgery name paired with its maTuongDuong code */
export interface SurgeryNameCodePair {
  tenKT: string;
  maTuongDuong: string;
}

/**
 * Extract unique (maTuongDuong + tenKT) pairs from the price catalog.
 * Same tenKT with different maTuongDuong → separate entries.
 * Dedup key = lowercase(maTuongDuong|tenKT).
 */
export function getUniqueNameCodePairsFromPrices(
  namePrices: SurgeryNamePrice[]
): SurgeryNameCodePair[] {
  const seen = new Set<string>();
  const result: SurgeryNameCodePair[] = [];

  for (const p of namePrices) {
    const name = p.tenKT?.trim();
    if (!name) continue;
    const code = (p.maTuongDuong || '').trim();
    const key = `${code.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ tenKT: name, maTuongDuong: code });
  }

  // Sort by maTuongDuong first, then tenKT
  result.sort((a, b) => {
    const codeA = a.maTuongDuong || '';
    const codeB = b.maTuongDuong || '';
    const codeCmp = codeA.localeCompare(codeB, 'vi');
    if (codeCmp !== 0) return codeCmp;
    return a.tenKT.localeCompare(b.tenKT, 'vi');
  });

  return result;
}
