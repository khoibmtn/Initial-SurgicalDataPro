
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
    ReportMetadata
} from "../types";

const BATCH_SIZE = 450; // Firestore batch limit is 500, keep safe margin

// Helper: Convert App Record -> Persistence Record
function toPersistedRecord(rec: SurgeryRecord): PersistedSurgeryRecord {
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

        machine: rec.machine
    };
}

export const reportService = {
    /**
     * Save a processed report to Firestore
     * @param records List of validated surgery records
     * @param type Report Type (DAILY | MONTHLY)
     * @param userId ID of the user creating the report
     */
    async saveReport(
        records: SurgeryRecord[],
        type: 'DAILY' | 'MONTHLY',
        userId: string,
        dataSource: 'EXCEL' | 'STORAGE' = 'EXCEL'
    ): Promise<{ reportId: string, savedCount: number, skippedCount: number }> {
        try {
            // 0. Deduplication (Only for EXCEL source)
            let recordsToSave = records;
            let skippedCount = 0;

            if (dataSource === 'EXCEL' && records.length > 0) {
                // Find min and max dates in the new batch
                const sortedDates = records
                    .map(r => r.start ? r.start.toISOString() : '')
                    .filter(d => d !== '')
                    .sort();

                if (sortedDates.length > 0) {
                    const minDate = sortedDates[0];
                    const maxDate = sortedDates[sortedDates.length - 1];

                    // Query existing records in this range
                    // Note: This requires a composite index on processed_records if filtering by multiple fields,
                    // but here we primarily filter by ngayBD.
                    const q = query(
                        collectionGroup(db, 'processed_records'),
                        where('ngayBD', '>=', minDate),
                        where('ngayBD', '<=', maxDate)
                    );

                    const snapshot = await getDocs(q);
                    const existingKeys = new Set<string>();

                    snapshot.forEach(doc => {
                        const data = doc.data() as PersistedSurgeryRecord;
                        // Composite Key: patientId + ngayBD + tenKT
                        const key = `${data.patientId}_${data.ngayBD}_${data.tenKT}`;
                        existingKeys.add(key);
                    });

                    // Filter duplicates
                    recordsToSave = records.filter(rec => {
                        const recDate = rec.start ? rec.start.toISOString() : '';
                        const key = `${rec.patientId}_${recDate}_${rec.tenKT}`;
                        if (existingKeys.has(key)) {
                            skippedCount++;
                            return false;
                        }
                        return true;
                    });

                    console.log(`Deduplication: Found ${existingKeys.size} existing records. Skipped ${skippedCount} duplicates.`);
                }
            }

            if (recordsToSave.length === 0 && records.length > 0) {
                console.log("All records were duplicates. Nothing to save.");
                return { reportId: '', savedCount: 0, skippedCount };
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
            const persistedRecords = recordsToSave.map(toPersistedRecord);

            // We will perform multiple batches if needed
            const chunks = chunkArray(persistedRecords, BATCH_SIZE);

            // 3. Save Metadata first
            await setDoc(reportsRef, metadata);

            // 4. Save Records in batches
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

            console.log(`Report ${reportId} saved successfully with ${savedCount} records.`);
            return { reportId, savedCount, skippedCount };

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
    async getReports(dateFrom: string, dateTo: string): Promise<PersistedSurgeryRecord[]> {
        try {
            console.log(`Fetching records from ${dateFrom} to ${dateTo}...`);
            const q = query(
                collectionGroup(db, 'processed_records'),
                where('ngayBD', '>=', dateFrom),
                where('ngayBD', '<=', dateTo)
            );

            const snapshot = await getDocs(q);
            const records: PersistedSurgeryRecord[] = [];

            snapshot.forEach(doc => {
                records.push(doc.data() as PersistedSurgeryRecord);
            });

            console.log(`Fetched ${records.length} records.`);
            return records;
        } catch (error) {
            console.error("Error fetching reports:", error);
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
