
import {
    collection,
    doc,
    writeBatch,
    serverTimestamp,
    setDoc,
    Timestamp,
    query,
    where,
    getDocs,
    collectionGroup
} from "firebase/firestore";
import { firestore as db } from "../lib/firebase";
import {
    SurgeryRecord,
    PersistedSurgeryRecord,
    ReportMetadata,
    MachineEntry,
    SurgeryNamePrice
} from "../types";
import { normalizeMaTuongDuong } from "./servicePriceProcessor";

const BATCH_SIZE = 450; // Firestore batch limit is 500, keep safe margin

// Helper: Convert App Record -> Persistence Record
function toPersistedRecord(rec: SurgeryRecord, type: 'DAILY' | 'MONTHLY'): PersistedSurgeryRecord {
    return {
        stt: rec.stt,
        patientId: rec.patientId,
        patientName: rec.patientName,
        gender: rec.gender,
        yob: rec.yob,
        bhyt: rec.bhyt,

        // Dates -> ISO Strings
        ngayCD: rec.ngayCD,
        ngayBD: rec.start ? rec.start.toISOString() : "",
        ngayKT: rec.end ? rec.end.toISOString() : "",
        timeMinutes: rec.timeMinutes,

        tenKT: rec.tenKT,
        loaiPTTT: rec.loaiPTTT,
        soLuong: rec.soLuong,

        ptChinh: rec.ptChinh,
        ptPhu: rec.ptPhu,
        bsGM: rec.bsGM,
        ktvGM: rec.ktvGM,
        tdc: rec.tdc,
        gv: rec.gv,

        machine: rec.machine,
        machineCode: rec.machineCode || '',
        machineId: rec.machineId || '',
        type: type,
        ...(rec.maTuongDuong ? { maTuongDuong: rec.maTuongDuong } : {}),
        ...(rec.donGia !== undefined ? { donGia: rec.donGia } : {}),
        ...(rec.thanhTien !== undefined ? { thanhTien: rec.thanhTien } : {}),
        ...(rec.priceSource ? { priceSource: rec.priceSource } : {})
    };
}

export const reportService = {
    /**
     * Check for duplicate records without saving
     * Returns counts of new, duplicate, and updatable records
     */
    async checkDuplicates(
        records: SurgeryRecord[],
        type: 'DAILY' | 'MONTHLY'
    ): Promise<{ newCount: number, duplicateCount: number, updatableCount: number }> {
        try {
            if (records.length === 0) return { newCount: 0, duplicateCount: 0, updatableCount: 0 };

            const sortedDates = records
                .map(r => r.start ? r.start.toISOString() : '')
                .filter(d => d !== '')
                .sort();

            if (sortedDates.length === 0) return { newCount: records.length, duplicateCount: 0, updatableCount: 0 };

            const minDate = sortedDates[0];
            const maxDate = sortedDates[sortedDates.length - 1];

            const q = query(
                collectionGroup(db, 'processed_records'),
                where('type', '==', type),
                where('ngayBD', '>=', minDate),
                where('ngayBD', '<=', maxDate)
            );

            const snapshot = await getDocs(q);
            const existingRecords = new Map<string, { gv: string }>();

            snapshot.forEach(docSnap => {
                const data = docSnap.data() as PersistedSurgeryRecord;
                const key = `${data.patientId}_${data.ngayBD}_${data.tenKT}`;
                existingRecords.set(key, { gv: data.gv || '' });
            });

            let newCount = 0;
            let duplicateCount = 0;
            let updatableCount = 0;

            records.forEach(rec => {
                const recDate = rec.start ? rec.start.toISOString() : '';
                const key = `${rec.patientId}_${recDate}_${rec.tenKT}`;
                const existing = existingRecords.get(key);

                if (!existing) {
                    newCount++;
                } else {
                    const newHasGv = rec.gv && rec.gv.trim() !== '';
                    const oldHasGv = existing.gv && existing.gv.trim() !== '';
                    if (newHasGv && !oldHasGv) {
                        updatableCount++;
                    } else {
                        duplicateCount++;
                    }
                }
            });

            return { newCount, duplicateCount, updatableCount };
        } catch (error) {
            console.error("Error checking duplicates:", error);
            return { newCount: records.length, duplicateCount: 0, updatableCount: 0 };
        }
    },

    /**
     * Save a processed report to Firestore (force mode skips duplicate check)
     * @param records List of validated surgery records
     * @param type Report Type (DAILY | MONTHLY)
     * @param userId ID of the user creating the report
     */
    async saveReport(
        records: SurgeryRecord[],
        type: 'DAILY' | 'MONTHLY',
        userId: string,
        dataSource: 'EXCEL' | 'STORAGE' = 'EXCEL'
    ): Promise<{ reportId: string, savedCount: number, skippedCount: number, updatedCount: number }> {
        try {
            // 0. Deduplication and Update Logic
            let recordsToSave: SurgeryRecord[] = [];
            let skippedCount = 0;
            let updatedCount = 0;
            const recordsToUpdate: Array<{ path: string, gv: string }> = [];

            if (records.length > 0) {
                // Find min and max dates in the new batch
                const sortedDates = records
                    .map(r => r.start ? r.start.toISOString() : '')
                    .filter(d => d !== '')
                    .sort();

                if (sortedDates.length > 0) {
                    const minDate = sortedDates[0];
                    const maxDate = sortedDates[sortedDates.length - 1];

                    // Query existing records in this range
                    const q = query(
                        collectionGroup(db, 'processed_records'),
                        where('type', '==', type),
                        where('ngayBD', '>=', minDate),
                        where('ngayBD', '<=', maxDate)
                    );

                    const snapshot = await getDocs(q);
                    const existingRecords = new Map<string, { id: string, path: string, gv: string }>();

                    snapshot.forEach(docSnap => {
                        const data = docSnap.data() as PersistedSurgeryRecord;
                        const key = `${data.patientId}_${data.ngayBD}_${data.tenKT}`;
                        existingRecords.set(key, {
                            id: docSnap.id,
                            path: docSnap.ref.path,
                            gv: data.gv || ''
                        });
                    });

                    console.log(`Found ${existingRecords.size} existing records in date range.`);

                    // Process each record
                    records.forEach(rec => {
                        const recDate = rec.start ? rec.start.toISOString() : '';
                        const key = `${rec.patientId}_${recDate}_${rec.tenKT}`;
                        const existing = existingRecords.get(key);
                        const newHasGv = rec.gv && rec.gv.trim() !== '';

                        if (existing) {
                            // Duplicate found
                            const oldHasGv = existing.gv && existing.gv.trim() !== '';

                            if (newHasGv && !oldHasGv) {
                                // Update case - new has gv, old doesn't (works for both DAILY and MONTHLY)
                                recordsToUpdate.push({ path: existing.path, gv: rec.gv });
                                updatedCount++;
                                console.log(`Will update record ${key} with gv: ${rec.gv}`);
                            } else {
                                // Skip case (new has no gv, or both have gv, or old already has gv)
                                skippedCount++;
                            }
                        } else {
                            // New record - save for both DAILY and MONTHLY
                            recordsToSave.push(rec);
                        }
                    });

                    console.log(`Deduplication complete: ${recordsToSave.length} to insert, ${updatedCount} to update, ${skippedCount} to skip.`);
                } else {
                    // No valid start dates found in the entire batch.
                    // We cannot deduplicate by date range, so we simply insert all of them.
                    console.log(`No valid start dates found in batch. Saving all ${records.length} records without deduplication.`);
                    records.forEach(rec => recordsToSave.push(rec));
                }
            }

            if (recordsToSave.length === 0 && recordsToUpdate.length === 0 && records.length > 0) {
                console.log("All records were duplicates or have no gv. Nothing to save or update.");
                return { reportId: '', savedCount: 0, skippedCount, updatedCount: 0 };
            }

            // 1. Create Report Metadata
            const reportId = doc(collection(db, "reports")).id;
            const reportsRef = doc(db, "reports", reportId);

            const metadata: ReportMetadata = {
                id: reportId,
                type,
                date: new Date().toISOString(),
                createdBy: userId,
                createdAt: Date.now() // Client-side timestamp for simple sorting
            };

            // 2. Prepare Batches for Records
            const recordsRef = collection(reportsRef, "processed_records");
            const persistedRecords = recordsToSave.map(r => toPersistedRecord(r, type));

            // We will perform multiple batches if needed
            const chunks = chunkArray(persistedRecords, BATCH_SIZE);

            // 3. Save Metadata first
            await setDoc(reportsRef, metadata);

            // 4. Save new records in batches
            let savedCount = 0;
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach((rec) => {
                    const newDocRef = doc(recordsRef); // Auto ID
                    batch.set(newDocRef, rec);
                });
                await batch.commit();
                savedCount += chunk.length;
                console.log(`Saved batch of ${chunk.length} records. Total: ${savedCount}`);
            }

            // 5. Update existing records with gv (for MONTHLY reports)
            if (recordsToUpdate.length > 0) {
                const updateChunks = chunkArray(recordsToUpdate, BATCH_SIZE);
                for (const chunk of updateChunks) {
                    const batch = writeBatch(db);
                    chunk.forEach(({ path, gv }) => {
                        const docRef = doc(db, path);
                        batch.update(docRef, { gv });
                    });
                    await batch.commit();
                    console.log(`Updated batch of ${chunk.length} records with gv.`);
                }
            }

            console.log(`Report ${reportId} saved successfully. Saved: ${savedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);
            return { reportId, savedCount, skippedCount, updatedCount };

        } catch (error) {
            console.error("Error saving report:", error);
            throw error;
        }
    },

    /**
     * Retrieve reports within a date range using Collection Group Query
     * @param dateFrom ISO Start Date (YYYY-MM-DD...)
     * @param dateTo ISO End Date (YYYY-MM-DD...)
     */
    async getReports(dateFrom: string, dateTo: string, type: 'DAILY' | 'MONTHLY'): Promise<PersistedSurgeryRecord[]> {
        try {
            console.log(`Fetching ${type} records from ${dateFrom} to ${dateTo}...`);
            const q = query(
                collectionGroup(db, 'processed_records'),
                where('type', '==', type),
                where('ngayBD', '>=', dateFrom),
                where('ngayBD', '<=', dateTo)
            );

            const snapshot = await getDocs(q);
            const records: PersistedSurgeryRecord[] = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data() as PersistedSurgeryRecord;
                data.id = docSnap.id;
                data.firestorePath = docSnap.ref.path;
                records.push(data);
            });

            console.log(`Fetched ${records.length} records.`);
            return records;
        } catch (error) {
            console.error("Error fetching reports:", error);
            throw error;
        }
    },

    async migrateExistingRecords(): Promise<{ totalProcessed: number, totalUpdated: number }> {
        try {
            console.log("Starting migration of existing records...");
            const q = query(collectionGroup(db, 'processed_records'));
            const snapshot = await getDocs(q);

            let totalProcessed = 0;
            let totalUpdated = 0;
            let batch = writeBatch(db);
            let countInBatch = 0;

            for (const docSnap of snapshot.docs) {
                totalProcessed++;
                const data = docSnap.data();
                if (!data.type) {
                    batch.update(docSnap.ref, { type: 'DAILY' });
                    totalUpdated++;
                    countInBatch++;
                }

                if (countInBatch >= BATCH_SIZE) {
                    await batch.commit();
                    batch = writeBatch(db);
                    countInBatch = 0;
                    console.log(`Migration: Committed batch. Total updated: ${totalUpdated}`);
                }
            }

            if (countInBatch > 0) {
                await batch.commit();
            }

            console.log(`Migration complete. Processed: ${totalProcessed}, Updated: ${totalUpdated}`);
            return { totalProcessed, totalUpdated };
        } catch (error) {
            console.error("Error during migration:", error);
            throw error;
        }
    },

    /**
     * Get assistant (gv) data from DAILY reports for auto-filling monthly reports
     * @param records List of monthly records that need assistant data
     * @returns Map with key = patientId_tenKT_ngayBD, value = gv
     */
    async getAssistantDataFromDaily(records: SurgeryRecord[]): Promise<Map<string, string>> {
        try {
            // Filter records with empty gv and create matching keys
            const emptyGvRecords = records.filter(r => !r.gv || r.gv.trim() === '');

            if (emptyGvRecords.length === 0) {
                console.log('No records with empty gv. Skipping assistant auto-fill.');
                return new Map();
            }

            console.log(`Querying assistant data for ${emptyGvRecords.length} records...`);

            // Build unique set of matching keys to query
            const matchingKeys = new Set<string>();
            emptyGvRecords.forEach(r => {
                const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
                if (ngayBD) {
                    const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;
                    matchingKeys.add(key);
                }
            });

            console.log(`Built ${matchingKeys.size} unique matching keys.`);

            // Query Firestore for DAILY reports
            // Note: We need to query by date range to make it efficient
            const dates = emptyGvRecords
                .map(r => r.start ? r.start.toISOString() : r.ngayBD)
                .filter(d => d)
                .sort();

            if (dates.length === 0) {
                console.log('No valid dates found. Skipping query.');
                return new Map();
            }

            const minDate = dates[0];
            const maxDate = dates[dates.length - 1];

            console.log(`Querying DAILY reports from ${minDate} to ${maxDate}...`);

            const q = query(
                collectionGroup(db, 'processed_records'),
                where('type', '==', 'DAILY'),
                where('ngayBD', '>=', minDate),
                where('ngayBD', '<=', maxDate)
            );

            const snapshot = await getDocs(q);
            const assistantMap = new Map<string, string>();
            let matchCount = 0;

            snapshot.forEach(docSnap => {
                const data = docSnap.data() as PersistedSurgeryRecord;

                // Only process if it has gv
                if (data.gv && data.gv.trim() !== '') {
                    const key = `${data.patientId}_${data.tenKT}_${data.ngayBD}`;

                    // Check if this key is in our matching set
                    if (matchingKeys.has(key)) {
                        // If multiple matches, keep the first one (or could use latest based on createdAt)
                        if (!assistantMap.has(key)) {
                            assistantMap.set(key, data.gv);
                            matchCount++;
                        }
                    }
                }
            });

            console.log(`Found ${matchCount} matching assistant records from ${snapshot.size} DAILY records.`);
            return assistantMap;

        } catch (error) {
            console.error('Error fetching assistant data from daily reports:', error);
            // Return empty map on error to allow process to continue
            return new Map();
        }
    },

    /**
     * Delete multiple records from Firestore by their full path
     * @param records List of SurgeryRecords to delete
     */
    async deleteRecords(records: SurgeryRecord[]): Promise<number> {
        try {
            // Filter only records that have a firestore path
            const targets = records.filter(r => r.firestorePath);
            if (targets.length === 0) return 0;

            console.log(`Deleting ${targets.length} records from Firestore...`);

            // Chunk into batches
            const chunks = chunkArray(targets, BATCH_SIZE);
            let deletedCount = 0;

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(rec => {
                    if (rec.firestorePath) {
                        // Create doc ref from path
                        const ref = doc(db, rec.firestorePath);
                        batch.delete(ref);
                    }
                });
                await batch.commit();
                deletedCount += chunk.length;
                console.log(`Deleted batch of ${chunk.length} records.`);
            }

            return deletedCount;
        } catch (error) {
            console.error("Error deleting records:", error);
            throw error;
        }
    },

    /**
     * Batch update machine codes for records in Firestore
     * @param updates Array of { firestorePath, machine } objects
     * @returns Number of successfully updated records
     */
    async batchUpdateMachineCodes(updates: Array<{ firestorePath: string, machine: string }>): Promise<number> {
        try {
            if (updates.length === 0) return 0;

            console.log(`Updating machine codes for ${updates.length} records...`);

            const chunks = chunkArray(updates, BATCH_SIZE);
            let updatedCount = 0;

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(({ firestorePath, machine }) => {
                    const ref = doc(db, firestorePath);
                    batch.update(ref, { machine });
                });
                await batch.commit();
                updatedCount += chunk.length;
                console.log(`Updated batch of ${chunk.length} machine codes. Total: ${updatedCount}`);
            }

            return updatedCount;
        } catch (error) {
            console.error("Error updating machine codes:", error);
            throw error;
        }
    },

    /**
     * Batch update GV and/or machine codes for records in Firestore
     * Used for auto-saving monthly report data filled from daily reports
     * @param updates Array of { firestorePath, gv?, machine? } objects
     * @returns Number of successfully updated records
     */
    async batchUpdateGvAndMachine(updates: Array<{ firestorePath: string, gv?: string, machine?: string }>): Promise<number> {
        try {
            if (updates.length === 0) return 0;

            console.log(`Auto-saving ${updates.length} records with GV/machine updates...`);

            const chunks = chunkArray(updates, BATCH_SIZE);
            let updatedCount = 0;

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(({ firestorePath, gv, machine }) => {
                    const ref = doc(db, firestorePath);
                    const updateData: { gv?: string, machine?: string } = {};
                    if (gv !== undefined) updateData.gv = gv;
                    if (machine !== undefined) updateData.machine = machine;
                    if (Object.keys(updateData).length > 0) {
                        batch.update(ref, updateData);
                    }
                });
                await batch.commit();
                updatedCount += chunk.length;
            }

            console.log(`Auto-saved ${updatedCount} records with GV/machine data.`);
            return updatedCount;
        } catch (error) {
            console.error("Error auto-saving GV/machine data:", error);
            throw error;
        }
    },

    /**

     * Get machine data from DAILY reports for auto-filling monthly reports
     * Similar to getAssistantDataFromDaily but for machine codes
     * @param records List of monthly records that need machine data
     * @returns Map with key = patientId_tenKT_ngayBD, value = machine
     */
    async getMachineDataFromDaily(records: SurgeryRecord[]): Promise<Map<string, string>> {
        try {
            // Filter records with empty machine
            const emptyMachineRecords = records.filter(r => !r.machine || r.machine.trim() === '');

            if (emptyMachineRecords.length === 0) {
                console.log('No records with empty machine. Skipping machine auto-fill.');
                return new Map();
            }

            console.log(`Querying machine data for ${emptyMachineRecords.length} records...`);

            // Build unique set of matching keys
            const matchingKeys = new Set<string>();
            emptyMachineRecords.forEach(r => {
                const ngayBD = r.start ? r.start.toISOString() : r.ngayBD;
                if (ngayBD) {
                    const key = `${r.patientId}_${r.tenKT}_${ngayBD}`;
                    matchingKeys.add(key);
                }
            });

            console.log(`Built ${matchingKeys.size} unique matching keys for machine lookup.`);

            // Get date range for query
            const dates = emptyMachineRecords
                .map(r => r.start ? r.start.toISOString() : r.ngayBD)
                .filter(d => d)
                .sort();

            if (dates.length === 0) {
                console.log('No valid dates found. Skipping machine query.');
                return new Map();
            }

            const minDate = dates[0];
            const maxDate = dates[dates.length - 1];

            console.log(`Querying DAILY reports for machine data from ${minDate} to ${maxDate}...`);

            const q = query(
                collectionGroup(db, 'processed_records'),
                where('type', '==', 'DAILY'),
                where('ngayBD', '>=', minDate),
                where('ngayBD', '<=', maxDate)
            );

            const snapshot = await getDocs(q);
            const machineMap = new Map<string, string>();
            let matchCount = 0;

            snapshot.forEach(docSnap => {
                const data = docSnap.data() as PersistedSurgeryRecord;

                // Only process if it has machine
                if (data.machine && data.machine.trim() !== '') {
                    const key = `${data.patientId}_${data.tenKT}_${data.ngayBD}`;

                    if (matchingKeys.has(key) && !machineMap.has(key)) {
                        machineMap.set(key, data.machine);
                        matchCount++;
                    }
                }
            });

            console.log(`Found ${matchCount} matching machine records from ${snapshot.size} DAILY records.`);
            return machineMap;

        } catch (error) {
            console.error('Error fetching machine data from daily reports:', error);
            return new Map();
        }
    },

    /**
     * Backfill machineCode and machineId for all existing Firestore records
     * by matching the 'machine' field (name) against the provided registry.
     * Uses exact match first, then partial match as fallback.
     * @param registry The machine registry to look up against
     * @param onProgress Callback for progress updates
     * @returns Statistics about the backfill operation
     */
    async backfillMachineRegistry(
        registry: MachineEntry[],
        onProgress?: (msg: string) => void
    ): Promise<{ totalScanned: number; matched: number; alreadyFilled: number; noMachine: number; unmatched: number; updated: number; unmatchedNames: { name: string; count: number }[] }> {
        try {
            if (!registry || registry.length === 0) {
                return { totalScanned: 0, matched: 0, alreadyFilled: 0, noMachine: 0, unmatched: 0, updated: 0, unmatchedNames: [] };
            }

            onProgress?.('Đang quét toàn bộ dữ liệu Firestore...');

            // Query ALL records
            const q = query(collectionGroup(db, 'processed_records'));
            const snapshot = await getDocs(q);

            onProgress?.(`Tìm thấy ${snapshot.size} bản ghi. Đang phân tích...`);

            let totalScanned = 0;
            let matched = 0;
            let alreadyFilled = 0;
            let noMachine = 0;
            let unmatched = 0;

            const updates: Array<{ path: string; machineCode: string; machineId: string }> = [];
            const unmatchedNamesMap = new Map<string, number>();

            snapshot.forEach(docSnap => {
                totalScanned++;
                const data = docSnap.data() as PersistedSurgeryRecord;

                // Skip if machineCode already filled
                if (data.machineCode && data.machineCode.trim() !== '') {
                    alreadyFilled++;
                    return;
                }

                // Track records with no machine name
                if (!data.machine || data.machine.trim() === '') {
                    noMachine++;
                    return;
                }

                const machineLower = data.machine.trim().toLowerCase();

                // Exact match on machineName
                let entry = registry.find(m => m.machineName.trim().toLowerCase() === machineLower);

                // Fallback: exact match on machineCode
                if (!entry) {
                    entry = registry.find(m => m.machineCode.trim().toLowerCase() === machineLower);
                }

                // Fallback: partial match (registry name contains record machine or vice versa)
                if (!entry) {
                    entry = registry.find(m => {
                        const regLower = m.machineName.trim().toLowerCase();
                        return regLower.includes(machineLower) || machineLower.includes(regLower);
                    });
                }

                if (entry) {
                    matched++;
                    updates.push({
                        path: docSnap.ref.path,
                        machineCode: entry.machineCode,
                        machineId: entry.machineId,
                    });
                } else {
                    unmatched++;
                    const name = data.machine.trim();
                    unmatchedNamesMap.set(name, (unmatchedNamesMap.get(name) || 0) + 1);
                }
            });

            onProgress?.(`Phân tích xong: ${matched} khớp, ${alreadyFilled} đã có, ${noMachine} không có tên máy, ${unmatched} không khớp. Đang cập nhật...`);

            // Batch update Firestore
            let updated = 0;
            if (updates.length > 0) {
                const chunks = chunkArray(updates, BATCH_SIZE);
                for (const chunk of chunks) {
                    const batch = writeBatch(db);
                    chunk.forEach(({ path, machineCode, machineId }) => {
                        const ref = doc(db, path);
                        batch.update(ref, { machineCode, machineId });
                    });
                    await batch.commit();
                    updated += chunk.length;
                    onProgress?.(`Đã cập nhật ${updated}/${updates.length} bản ghi...`);
                }
            }

            const unmatchedNames = Array.from(unmatchedNamesMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            console.log(`Backfill complete: scanned=${totalScanned}, matched=${matched}, alreadyFilled=${alreadyFilled}, noMachine=${noMachine}, unmatched=${unmatched}, updated=${updated}, uniqueUnmatched=${unmatchedNames.length}`);
            return { totalScanned, matched, alreadyFilled, noMachine, unmatched, updated, unmatchedNames };
        } catch (error) {
            console.error('Error during backfill:', error);
            throw error;
        }
    },

    /**
     * Cập nhật hàng loạt mã tương đương, đơn giá, thành tiền vào các bản ghi đã lưu trên Firestore
     */
    async batchUpdatePrices(
        updates: Array<{
            firestorePath: string;
            maTuongDuong?: string;
            donGia?: number;
            thanhTien?: number;
            priceSource?: 'excel_dvkt' | 'catalog';
        }>
    ): Promise<number> {
        try {
            if (updates.length === 0) return 0;
            let updatedCount = 0;
            let batch = writeBatch(db);
            let inBatch = 0;

            for (const item of updates) {
                if (!item.firestorePath) continue;
                const docRef = doc(db, item.firestorePath);
                const patch: any = {};
                if (item.maTuongDuong !== undefined) patch.maTuongDuong = item.maTuongDuong;
                if (item.donGia !== undefined) patch.donGia = item.donGia;
                if (item.thanhTien !== undefined) patch.thanhTien = item.thanhTien;
                if (item.priceSource !== undefined) patch.priceSource = item.priceSource;

                if (Object.keys(patch).length > 0) {
                    batch.update(docRef, patch);
                    inBatch++;
                    updatedCount++;

                    if (inBatch >= BATCH_SIZE) {
                        await batch.commit();
                        batch = writeBatch(db);
                        inBatch = 0;
                    }
                }
            }

            if (inBatch > 0) {
                await batch.commit();
            }

            return updatedCount;
        } catch (error) {
            console.error('Error batch updating prices:', error);
            throw error;
        }
    },

    /**
     * Quét tất cả bản ghi đã được import giá từ file Excel (priceSource === 'excel_dvkt' hoặc đã có maTuongDuong và donGia)
     */
    async fetchExcelSourcedRecords(onProgress?: (msg: string) => void): Promise<PersistedSurgeryRecord[]> {
        try {
            onProgress?.('Đang quét dữ liệu từ Firestore...');
            const q = query(collectionGroup(db, 'processed_records'));
            const snapshot = await getDocs(q);

            onProgress?.(`Tìm thấy ${snapshot.size} bản ghi. Đang phân tích nguồn giá Excel...`);
            const excelRecords: PersistedSurgeryRecord[] = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data() as PersistedSurgeryRecord;
                data.firestorePath = docSnap.ref.path;
                data.id = docSnap.id;

                // Điều kiện là bản ghi có nguồn giá từ Excel DVKT
                const isExcelSource = data.priceSource === 'excel_dvkt' || 
                    (!data.priceSource && Boolean(data.maTuongDuong && data.donGia && data.donGia > 0));

                if (isExcelSource && data.maTuongDuong && data.donGia && data.donGia > 0) {
                    excelRecords.push(data);
                }
            });

            return excelRecords;
        } catch (error) {
            console.error('Error fetching excel sourced records:', error);
            return [];
        }
    },

    /**
     * Dùng Danh mục giá để fill lại giá cho các ca phẫu thuật trong CSDL:
     * - Chỉ áp dụng cho các ca CHƯA CÓ GIÁ hoặc GIÁ TỪ LOGIC KHÁC (priceSource !== 'excel_dvkt')
     * - Chỉ áp dụng cho ca ĐÃ CÓ MÃ TƯƠNG ĐƯƠNG
     * - Khớp theo cặp (maTuongDuong, ngayThucHien) nằm trong khoảng hiệu lực của DM giá
     */
    async backfillCatalogPrices(
        catalog: SurgeryNamePrice[],
        onProgress?: (msg: string) => void
    ): Promise<{ totalScanned: number; eligible: number; updated: number }> {
        try {
            onProgress?.('Đang quét toàn bộ dữ liệu từ Firestore...');
            const q = query(collectionGroup(db, 'processed_records'));
            const snapshot = await getDocs(q);

            onProgress?.(`Tìm thấy ${snapshot.size} bản ghi. Đang đối chiếu giá với DM giá...`);

            let totalScanned = 0;
            let eligible = 0;
            const updates: Array<{
                firestorePath: string;
                donGia: number;
                thanhTien: number;
                priceSource: 'catalog';
            }> = [];

            snapshot.forEach(docSnap => {
                totalScanned++;
                const data = docSnap.data() as PersistedSurgeryRecord;

                // Tuyệt đối không ghi đè lên các bản ghi có nguồn giá từ Excel
                if (data.priceSource === 'excel_dvkt') {
                    return;
                }

                // Phải có mã tương đương
                if (!data.maTuongDuong || !data.maTuongDuong.trim()) {
                    return;
                }

                const surgeryDate = data.ngayBD ? data.ngayBD.substring(0, 10) : '';
                if (!surgeryDate) return;

                // Tìm trong DM giá theo mã tương đương và khoảng hiệu lực
                const normMTD = normalizeMaTuongDuong(data.maTuongDuong);
                const matchedPriceItem = catalog.find(item => {
                    if (normalizeMaTuongDuong(item.maTuongDuong) !== normMTD) return false;
                    if (item.effectiveFrom && item.effectiveFrom > surgeryDate) return false;
                    if (item.effectiveTo && item.effectiveTo < surgeryDate) return false;
                    return true;
                });

                if (matchedPriceItem && matchedPriceItem.price > 0) {
                    eligible++;
                    const qty = Number(data.soLuong ?? 1);
                    const newDonGia = matchedPriceItem.price;
                    const newThanhTien = Math.round(newDonGia * qty);

                    // Chỉ cập nhật nếu giá thay đổi hoặc chưa có đơn giá
                    if (data.donGia !== newDonGia || data.thanhTien !== newThanhTien || data.priceSource !== 'catalog') {
                        updates.push({
                            firestorePath: docSnap.ref.path,
                            donGia: newDonGia,
                            thanhTien: newThanhTien,
                            priceSource: 'catalog',
                        });
                    }
                }
            });

            onProgress?.(`Đang lưu cập nhật giá cho ${updates.length} bản ghi vào Firestore...`);
            let updated = 0;
            if (updates.length > 0) {
                updated = await this.batchUpdatePrices(updates);
            }

            return { totalScanned, eligible, updated };
        } catch (error) {
            console.error('Error backfilling catalog prices:', error);
            throw error;
        }
    }

};

function chunkArray<T>(array: T[], size: number): T[][] {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
