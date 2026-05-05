/**
 * Migration: note → maTuongDuong
 * One-time script to rename 'note' field to 'maTuongDuong' in all surgery_name_prices records.
 * 
 * Usage: Paste this function into browser console while app is running,
 * or import and call migrateNoteToMaTuongDuong() from any component.
 * 
 * The service layer already handles backward-compatible reads (checks both fields),
 * so this migration is safe to run at any time.
 */
import { ref, get, update } from 'firebase/database';
import { db } from '../lib/firebase';

const NAME_PRICES_PATH = 'surgery_name_prices';

export async function migrateNoteToMaTuongDuong(): Promise<{
  total: number;
  migrated: number;
  skipped: number;
}> {
  console.log('[Migration] Starting note → maTuongDuong migration...');

  const snapshot = await get(ref(db, NAME_PRICES_PATH));
  const data = snapshot.val();

  if (!data) {
    console.log('[Migration] No data found. Nothing to migrate.');
    return { total: 0, migrated: 0, skipped: 0 };
  }

  const entries = Object.entries(data) as [string, any][];
  const total = entries.length;
  let migrated = 0;
  let skipped = 0;

  const batchSize = 50;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const updates: Record<string, any> = {};

    for (const [key, val] of batch) {
      if (val.note !== undefined && val.maTuongDuong === undefined) {
        // Copy note to maTuongDuong, remove note
        updates[`${NAME_PRICES_PATH}/${key}/maTuongDuong`] = val.note || '';
        updates[`${NAME_PRICES_PATH}/${key}/note`] = null; // delete old field
        migrated++;
      } else {
        skipped++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }

    console.log(`[Migration] Progress: ${Math.min(i + batchSize, entries.length)}/${total}`);
  }

  console.log(`[Migration] Complete: ${migrated} migrated, ${skipped} skipped out of ${total}`);
  return { total, migrated, skipped };
}
