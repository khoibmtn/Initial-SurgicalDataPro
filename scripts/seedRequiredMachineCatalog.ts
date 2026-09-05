/**
 * Seed script: Parse excel/DVKT co ma may.xlsx and seed to Firebase RTDB 'required_machine_catalog'
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seedRequiredMachineCatalog.ts
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { ref, update, get, push, set } from 'firebase/database';
import { db } from '../lib/firebase';
import { REQUIRED_MACHINE_PATH } from '../services/requiredMachineService';

async function seed() {
  const excelPath = path.resolve(process.cwd(), 'excel/DVKT co ma may.xlsx');
  console.log(`[Seed] Checking file at: ${excelPath}`);

  if (!fs.existsSync(excelPath)) {
    throw new Error(`File not found: ${excelPath}`);
  }

  const fileBuffer = fs.readFileSync(excelPath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`[Seed] Read ${rawRows.length} rows from sheet "${sheetName}". Sample row:`, rawRows[0]);

  const items: Array<{
    maTuongDuong: string;
    tenDVKT: string;
    effectiveFrom: string;
    effectiveTo: null;
    isRequired: boolean;
    createdAt: number;
    updatedAt: number;
  }> = [];

  const now = Date.now();

  for (const row of rawRows) {
    const maTuongDuong = String(row['MA_DVKT'] || row['Mã tương đương'] || row['maTuongDuong'] || '').trim();
    const tenDVKT = String(row['TEN_DVKT'] || row['Tên dịch vụ kỹ thuật'] || row['tenDVKT'] || '').trim();

    if (!maTuongDuong && !tenDVKT) continue;

    items.push({
      maTuongDuong,
      tenDVKT,
      effectiveFrom: '2000-01-01',
      effectiveTo: null,
      isRequired: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(`[Seed] Total valid items to insert: ${items.length}`);

  // Check current count in RTDB
  const snapshot = await get(ref(db, REQUIRED_MACHINE_PATH));
  const currentVal = snapshot.val();
  const currentCount = currentVal ? Object.keys(currentVal).length : 0;
  console.log(`[Seed] Current count in RTDB: ${currentCount}`);

  // Clear previous data to cleanly replace with all 4,773 records
  await set(ref(db, REQUIRED_MACHINE_PATH), null);
  console.log(`[Seed] Cleared previous ${REQUIRED_MACHINE_PATH} data.`);

  // Write in chunks of 500
  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const updates: Record<string, any> = {};

    for (const item of chunk) {
      const key = push(ref(db, REQUIRED_MACHINE_PATH)).key!;
      updates[`${REQUIRED_MACHINE_PATH}/${key}`] = item;
    }

    await update(ref(db), updates);
    inserted += chunk.length;
    console.log(`[Seed] Uploaded ${inserted}/${items.length} items...`);
  }

  console.log(`[Seed] Successfully seeded ${inserted} items to ${REQUIRED_MACHINE_PATH}!`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Error seeding required machine catalog:', err);
  process.exit(1);
});
