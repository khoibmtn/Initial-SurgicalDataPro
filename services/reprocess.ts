import * as XLSX from "xlsx";
import { ProcessingResult, SurgeryRecord, StaffConflict, MachineConflict, StaffRole, AppStatus, MachineEntry } from "../types";
import { AppConfig } from "../contexts/ConfigContext";

// ───────────────── Helper Functions ─────────────────

function isOverlap(
    aStart: Date,
    aEnd: Date,
    bStart: Date,
    bEnd: Date
): boolean {
    return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Check if two records belong to the same surgical session.
 * Same patient + same start/end time = same session (multiple procedures in one operation).
 */
function isSameSession(a: SurgeryRecord, b: SurgeryRecord): boolean {
    if (a.patientId !== b.patientId) return false;
    if (!a.start || !b.start || !a.end || !b.end) return false;
    return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
}

export function detectStaffConflicts(records: SurgeryRecord[], config: AppConfig): StaffConflict[] {
    type StaffInstance = {
        name: string;
        role: StaffRole;
        rec: SurgeryRecord;
    };

    const staffMap = new Map<string, StaffInstance[]>();

    function getStaffGroup(role: StaffRole): number {
        if (role === "PT_CHINH" || role === "PT_PHU") return 1;
        if (role === "BS_GM") return 2;
        if (role === "KTV_GM" || role === "TDC") return 3;
        if (role === "GV") return 4;  // Separate group for assistants
        return 0; // Unknown
    }

    function addStaff(rec: SurgeryRecord, role: StaffRole, name: string) {
        if (!name || !rec.start || !rec.end) return;
        const groupId = getStaffGroup(role);
        const key = name + "|G" + groupId;
        if (!staffMap.has(key)) staffMap.set(key, []);
        staffMap.get(key)!.push({ name, role, rec });
    }

    for (const rec of records) {
        addStaff(rec, "PT_CHINH", rec.ptChinh);
        addStaff(rec, "PT_PHU", rec.ptPhu);
        addStaff(rec, "BS_GM", rec.bsGM);
        addStaff(rec, "KTV_GM", rec.ktvGM);
        addStaff(rec, "TDC", rec.tdc);
        addStaff(rec, "GV", rec.gv);
    }

    const conflicts: StaffConflict[] = [];

    for (const [key, list] of staffMap.entries()) {
        const groupId = parseInt(key.split('|G')[1]);
        let limitOption: 0 | 1 | 2 = 1;

        if (config.staffLimits) {
            if (groupId === 1) limitOption = config.staffLimits.surgeons;
            else if (groupId === 2) limitOption = config.staffLimits.anesthesiologists;
            else if (groupId === 3) limitOption = config.staffLimits.support;
            else if (groupId === 4) limitOption = config.staffLimits.assistants;
        }

        if (limitOption === 0) continue;

        list.sort((a, b) => (a.rec.start!.getTime() - b.rec.start!.getTime()));
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i].rec;
                const b = list[j].rec;
                if (a.key === b.key) continue;
                if (isSameSession(a, b)) continue; // Same patient, same time = same surgical session

                if (a.start && a.end && b.start && b.end && isOverlap(a.start, a.end, b.start, b.end)) {
                    let isConflict = false;
                    let vType: 'max1' | 'max2' = 'max1';

                    if (limitOption === 1) {
                        isConflict = true;
                        vType = 'max1';
                    } else if (limitOption === 2) {
                        const startInter = new Date(Math.max(a.start.getTime(), b.start.getTime()));
                        const endInter = new Date(Math.min(a.end.getTime(), b.end.getTime()));
                        for (let k = 0; k < list.length; k++) {
                            if (k === i || k === j) continue;
                            const c = list[k].rec;
                            if (c.key === a.key || c.key === b.key) continue;
                            if (c.start && c.end && isOverlap(c.start, c.end, startInter, endInter)) {
                                isConflict = true;
                                vType = 'max2';
                                break;
                            }
                        }
                    }

                    if (isConflict) {
                        conflicts.push({
                            staffName: list[i].name,
                            role: list[i].role,
                            violationType: vType,
                            patientId1: a.patientId,
                            patientName1: a.patientName,
                            tenKT1: a.tenKT,
                            start1: a.start,
                            end1: a.end,
                            patientId2: b.patientId,
                            patientName2: b.patientName,
                            tenKT2: b.tenKT,
                            start2: b.start,
                            end2: b.end,
                            rec1: a,
                            rec2: b,
                        });
                    }
                }
            }
        }
    }

    return conflicts;
}

export function detectMachineConflicts(records: SurgeryRecord[]): MachineConflict[] {
    type MachineInstance = { machine: string; machineCode: string; rec: SurgeryRecord };
    const machineMap = new Map<string, MachineInstance[]>();

    for (const rec of records) {
        // Use machineCode as the unique key for conflict detection
        const code = rec.machineCode || "";
        if (!code || !rec.start || !rec.end) continue;
        if (!machineMap.has(code)) machineMap.set(code, []);
        machineMap.get(code)!.push({ machine: rec.machine, machineCode: code, rec });
    }

    const conflicts: MachineConflict[] = [];
    const seenPairs = new Set<string>();

    for (const [, list] of machineMap.entries()) {
        list.sort((a, b) => (a.rec.start!.getTime() - b.rec.start!.getTime()));

        // Sweep-line: for each record, only pair with the closest preceding overlap
        // to avoid N*(N-1)/2 combinatorial explosion
        for (let i = 1; i < list.length; i++) {
            const b = list[i].rec;
            if (!b.start || !b.end) continue;

            for (let j = i - 1; j >= 0; j--) {
                const a = list[j].rec;
                if (!a.start || !a.end) continue;
                if (a.key && b.key && a.key === b.key) continue; // Same record guard
                if (isSameSession(a, b)) continue; // Same patient, same time = same surgical session

                if (isOverlap(a.start, a.end, b.start, b.end)) {
                    // Deduplicate pair
                    const pairKey = a.key && b.key
                        ? [a.key, b.key].sort().join('||')
                        : `${a.patientId}_${a.tenKT}_${a.start.getTime()}||${b.patientId}_${b.tenKT}_${b.start.getTime()}`;
                    if (!seenPairs.has(pairKey)) {
                        seenPairs.add(pairKey);
                        conflicts.push({
                            machine: list[i].machine,
                            machineCode: list[i].machineCode,
                            patientId1: a.patientId,
                            patientName1: a.patientName,
                            tenKT1: a.tenKT,
                            start1: a.start,
                            end1: a.end,
                            patientId2: b.patientId,
                            patientName2: b.patientName,
                            tenKT2: b.tenKT,
                            start2: b.start,
                            end2: b.end,
                            rec1: a,
                            rec2: b,
                        });
                    }
                    break; // Only pair with closest preceding overlap
                }

                if (a.end <= b.start) break;
            }
        }
    }
    return conflicts;
}

/** Enrichment for legacy data: lookup machine (name) in registry to fill machineCode/machineId */
export function enrichRecordsWithMachineRegistry(
    records: SurgeryRecord[],
    registry: MachineEntry[]
): void {
    if (!registry || registry.length === 0) return;

    for (const rec of records) {
        // Only enrich if machineCode is missing but machine (name) exists
        if (rec.machineCode || !rec.machine) continue;

        const machineLower = rec.machine.trim().toLowerCase();

        // Try exact match on machineName
        let entry = registry.find(m => m.machineName.trim().toLowerCase() === machineLower);

        // Fallback: try partial match (registry name contains record machine or vice versa)
        if (!entry) {
            entry = registry.find(m => {
                const regLower = m.machineName.trim().toLowerCase();
                return regLower.includes(machineLower) || machineLower.includes(regLower);
            });
        }

        if (entry) {
            rec.machineCode = entry.machineCode;
            rec.machineId = entry.machineId;
        }
    }
}

// ───────────────── Main Reprocess Function ─────────────────

export function reprocessSurgicalRecords(
    records: SurgeryRecord[],
    config: AppConfig,
    dateRangeText: string = ""
): ProcessingResult {
    console.log(">>> RE-PROCESSING RECORDS <<<", records.length);

    // 0. Regenerate Keys & Dates (Critical for consistency)
    records.forEach((r, idx) => {
        // Ensure Dates are Date objects
        if (typeof r.ngayBD === 'string' && (!r.start || isNaN(r.start.getTime()))) {
            r.start = new Date(r.ngayBD);
        }
        if (typeof r.ngayKT === 'string' && (!r.end || isNaN(r.end.getTime()))) {
            r.end = new Date(r.ngayKT);
        }

        // Generate Key if missing
        if (!r.key) {
            const d = r.end || new Date();
            const dateKey = `${d.getFullYear()}${d.getMonth()}${d.getDate()}`;
            r.key = `${r.patientId}-${r.patientName}-${dateKey}-${r.tenKT}`;
        }
    });

    // 0b. Calculate Date Range if missing
    if (!dateRangeText) {
        const dates = records.map(r => r.start ? r.start.getTime() : 0).filter(t => t > 0).sort();
        if (dates.length > 0) {
            const minDate = new Date(dates[0]);
            const maxDate = new Date(dates[dates.length - 1]);
            const formatDateStr = (d: Date) => {
                const dd = d.getDate().toString().padStart(2, '0');
                const mm = (d.getMonth() + 1).toString().padStart(2, '0');
                const yyyy = d.getFullYear();
                return `${dd}/${mm}/${yyyy}`;
            };
            dateRangeText = `Từ ngày ${formatDateStr(minDate)} đến ngày ${formatDateStr(maxDate)}`;
        }
    }

    // 1. Detect Conflicts
    const staffConflicts = detectStaffConflicts(records, config);
    const machineConflicts = detectMachineConflicts(records);
    const missingMachine = records.filter((r) => {
        // Use machineCode as primary check (new logic)
        if (r.machineCode) return false;
        // Fallback: also skip if legacy machine (name) exists
        if (r.machine) return false;
        // Check if surgery name matches any pattern in ignoredMachineNames (substring match)
        if (config.ignoredMachineNames && config.ignoredMachineNames.some(ignoredName => {
            const normalizedSurgeryName = r.tenKT.replace(/[\[\]()]/g, '').trim().toLowerCase();
            const normalizedIgnoredName = ignoredName.replace(/[\[\]()]/g, '').trim().toLowerCase();
            return normalizedSurgeryName.includes(normalizedIgnoredName) || normalizedIgnoredName.includes(normalizedSurgeryName);
        })) return false;
        return true;
    });

    // 2. Create Workbook
    const wb = XLSX.utils.book_new();
    const timeRules = config.timeRules;

    const mainSheetData: any[][] = [
        [
            "STT", "Mã BN", "Họ tên", "Giới", "Năm sinh", "Thẻ BHYT",
            "Ngày CĐ", "Ngày BĐ", "Ngày KT", "Tên kỹ thuật",
            "Loại PTTT", "Số lượng", "Thời gian (phút)",
            "PT Chính", "PT Phụ", "BS GM", "KTV GM", "TDC", "GV",
            "Mã máy", "Thời gian tối thiểu",
        ],
        ...records.map((r) => {
            const minTime = timeRules[r.loaiPTTT]?.min ?? 0;
            const actual = r.timeMinutes;
            let reason = "";
            if (actual < minTime) reason = `Thời gian PT < tối thiểu (${minTime} phút)`;
            return [
                r.stt, r.patientId, r.patientName, r.gender, r.yob, r.bhyt,
                r.ngayCD, r.ngayBD, r.ngayKT, r.tenKT,
                r.loaiPTTT, r.soLuong, r.timeMinutes,
                r.ptChinh, r.ptPhu, r.bsGM, r.ktvGM, r.tdc, r.gv,
                r.machine, reason
            ];
        }),
    ];

    const wsMain = XLSX.utils.aoa_to_sheet([]);
    // ... Header styling logic ...
    XLSX.utils.sheet_add_aoa(wsMain, [["SỞ Y TẾ HẢI PHÒNG"]], { origin: "C1" });
    wsMain["C1"].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: false } };
    XLSX.utils.sheet_add_aoa(wsMain, [[(config.hospitalName || "BỆNH VIỆN ĐA KHOA THỦY NGUYÊN").toUpperCase()]], { origin: "C2" });
    wsMain["C2"].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: false } };
    XLSX.utils.sheet_add_aoa(wsMain, [["DANH SÁCH PHẪU THUẬT"]], { origin: "J3" });
    wsMain["J3"].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: false } };
    XLSX.utils.sheet_add_aoa(wsMain, [[dateRangeText]], { origin: "J5" });
    wsMain["J5"].s = { alignment: { horizontal: "center", vertical: "center", wrapText: false } };

    XLSX.utils.sheet_add_aoa(wsMain, mainSheetData, { origin: "A7" });

    const startRow = 7;
    const totalRows = mainSheetData.length;
    const endRow = startRow + totalRows - 1;

    for (let R = startRow - 1; R < endRow; R++) {
        for (let C = 0; C < 21; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!wsMain[cellAddress]) wsMain[cellAddress] = { t: "s", v: "" };
            wsMain[cellAddress].s = {
                alignment: {
                    vertical: "center",
                    horizontal: R === startRow - 1 ? "center" : C === 0 ? "left" : "center",
                    wrapText: true
                },
                font: R === startRow - 1 ? { bold: true } : undefined,
                border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
            };
        }
    }

    const signRow = endRow + 2;
    XLSX.utils.sheet_add_aoa(wsMain, [["GIÁM ĐỐC"]], { origin: `C${signRow}` });
    XLSX.utils.sheet_add_aoa(wsMain, [["TCKT"]], { origin: `G${signRow}` });
    XLSX.utils.sheet_add_aoa(wsMain, [["KHTH"]], { origin: `J${signRow}` });
    XLSX.utils.sheet_add_aoa(wsMain, [["TRƯỞNG KHOA"]], { origin: `P${signRow}` });
    XLSX.utils.sheet_add_aoa(wsMain, [["NGƯỜI LẬP"]], { origin: `S${signRow}` });

    ["C", "G", "J", "P", "S"].forEach(col => {
        const cell = `${col}${signRow}`;
        wsMain[cell].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: false } };
    });

    wsMain["!cols"] = [
        { wch: 7.3 }, { wch: 12 }, { wch: 25 }, { wch: 9 }, { wch: 9 }, { wch: 20 },
        { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 30 }, { wch: 10 }, { wch: 10 },
        { wch: 7 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
        { wch: 20 }, { wch: 15 }, { wch: 25 }
    ];

    XLSX.utils.book_append_sheet(wb, wsMain, "BANG_KET_QUA");

    // 3. Sheet TRUNG_GIO_NHAN_VIEN
    const staffSheetData: any[][] = [
        ["Nhân viên", "Vai trò", "Mã BN 1", "Tên BN 1", "Tên KT 1", "BĐ 1", "KT 1", "PT Chính 1", "PT Phụ 1", "TDC 1", "KTV GM 1", "BS GM 1", "Mã BN 2", "Tên BN 2", "Tên KT 2", "BĐ 2", "KT 2", "PT Chính 2", "PT Phụ 2", "TDC 2", "KTV GM 2", "BS GM 2"],
        ...staffConflicts.map((c) => [
            c.staffName, c.role, c.patientId1, c.patientName1, c.tenKT1, c.start1, c.end1,
            c.rec1.ptChinh, c.rec1.ptPhu, c.rec1.tdc, c.rec1.ktvGM, c.rec1.bsGM,
            c.patientId2, c.patientName2, c.tenKT2, c.start2, c.end2,
            c.rec2.ptChinh, c.rec2.ptPhu, c.rec2.tdc, c.rec2.ktvGM, c.rec2.bsGM,
        ]),
    ];
    const wsStaff = XLSX.utils.aoa_to_sheet(staffSheetData);

    function findHeaderIndexes(headerRow: any[], names: string[]) {
        const row = headerRow.map((h: any) => (h ?? "").toString().trim().toLowerCase());
        const res: number[] = [];
        for (const name of names) {
            res.push(row.indexOf(name.toLowerCase()));
        }
        return res;
    }

    function applyDateFormatToColsByIndex(ws: XLSX.WorkSheet, colIndexes: number[], startRow = 1, maxRows = 5000) {
        for (let r = startRow; r < startRow + maxRows; r++) {
            for (const c of colIndexes) {
                if (c < 0) continue;
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = ws[addr];
                if (!cell) continue;
                if (cell.t === 'n' || cell.t === 'd') {
                    cell.z = 'dd/mm/yyyy hh:mm';
                } else if (cell.t === 's') {
                    const s = (cell.v ?? '').toString().trim();
                    const parsed = new Date(s);
                    if (!isNaN(parsed.getTime())) {
                        const excelDate = (parsed.getTime() - new Date(Date.UTC(1899, 11, 30)).getTime()) / (24 * 3600 * 1000);
                        cell.t = 'n';
                        cell.v = excelDate;
                        cell.z = 'dd/mm/yyyy hh:mm';
                    }
                }
            }
        }
    }

    const staffheader = staffSheetData[0] || [];
    const [bd1Idx, kt1Idx, bd2Idx, kt2Idx] = findHeaderIndexes(staffheader, ['BĐ 1', 'KT 1', 'BĐ 2', 'KT 2']);
    applyDateFormatToColsByIndex(wsStaff, [bd1Idx, kt1Idx, bd2Idx, kt2Idx], 1, staffSheetData.length + 5);
    XLSX.utils.book_append_sheet(wb, wsStaff, "TRUNG_GIO_NHAN_VIEN");

    // 4. Sheet TRUNG_GIO_MAY
    const machineSheetData: any[][] = [
        ["Mã máy", "Mã BN 1", "Tên BN 1", "Tên KT 1", "BĐ 1", "KT 1", "PT Phụ 1", "TDC 1", "BS GM 1", "Mã BN 2", "Tên BN 2", "Tên KT 2", "BĐ 2", "KT 2", "PT Phụ 2", "TDC 2", "BS GM 2"],
        ...machineConflicts.map((c) => [
            c.machine, c.patientId1, c.patientName1, c.tenKT1, c.start1, c.end1,
            c.rec1.ptPhu, c.rec1.tdc, c.rec1.bsGM,
            c.patientId2, c.patientName2, c.tenKT2, c.start2, c.end2,
            c.rec2.ptPhu, c.rec2.tdc, c.rec2.bsGM,
        ]),
    ];
    const wsMachine = XLSX.utils.aoa_to_sheet(machineSheetData);
    const headerM = machineSheetData[0] || [];
    const [m_bd1, m_kt1, m_bd2, m_kt2] = findHeaderIndexes(headerM, ['BĐ 1', 'KT 1', 'BĐ 2', 'KT 2']);
    applyDateFormatToColsByIndex(wsMachine, [m_bd1, m_kt1, m_bd2, m_kt2], 1, machineSheetData.length + 5);
    XLSX.utils.book_append_sheet(wb, wsMachine, "TRUNG_GIO_MAY");

    // 5. Sheet THIEU_MA_MAY
    const missingSheetData: any[][] = [
        ["STT", "Mã BN", "Họ tên", "Ngày BĐ", "Tên kỹ thuật"],
        ...missingMachine.map((r) => [
            r.stt, r.patientId, r.patientName, r.ngayBD, r.tenKT,
        ]),
    ];
    const wsMissing = XLSX.utils.aoa_to_sheet(missingSheetData);
    XLSX.utils.book_append_sheet(wb, wsMissing, "THIEU_MA_MAY");

    // 6. BANG_THANH_TOAN
    const LOAI = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];
    const VAITRO = ["Chính", "Phụ", "Giúp việc"];

    // Moved to top-level function
    const ttData = collectThanhToanData_New(records, config);


    // Generate Payment Sheet
    const COLS: string[] = [];
    for (const loai of LOAI) for (const v of VAITRO) COLS.push(`${loai}-${v}`);

    let ws = XLSX.utils.aoa_to_sheet([]);
    const rowStart = 7;
    const headerFull = ["STT", "HỌ TÊN", ...COLS];
    XLSX.utils.sheet_add_aoa(ws, [headerFull], { origin: `A${rowStart}` });

    let dongGiaRow = rowStart + 2;
    let dataRow = dongGiaRow + 1;
    let stt = 1;

    for (const it of ttData) {
        const rowVals: any[] = [stt++, it.department, it.taxId, it.name];
        for (const colKey of COLS) rowVals.push(it.values[colKey] ?? 0);
        XLSX.utils.sheet_add_aoa(ws, [rowVals], { origin: `A${dataRow}` });
        dataRow++;
    }

    // Cleanup Empty Columns
    function deleteCol(ws: XLSX.WorkSheet, colIndex: number) {
        const range = XLSX.utils.decode_range(ws["!ref"]!);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = colIndex; C < range.e.c; ++C) {
                const from = XLSX.utils.encode_cell({ r: R, c: C + 1 });
                const to = XLSX.utils.encode_cell({ r: R, c: C });
                ws[to] = ws[from];
            }
            const lastAddr = XLSX.utils.encode_cell({ r: R, c: range.e.c });
            delete ws[lastAddr];
        }
        range.e.c = range.e.c - 1;
        ws["!ref"] = XLSX.utils.encode_range(range);
    }

    const totalsByCol: number[] = COLS.map((colKey) => ttData.reduce((s, it) => s + (it.values[colKey] ?? 0), 0));
    for (let i = COLS.length - 1; i >= 0; i--) {
        if (totalsByCol[i] === 0) deleteCol(ws, 4 + i);
    }

    const COLS_RUTGON = COLS.filter((_, i) => totalsByCol[i] > 0);

    // Re-Header Logic
    const GROUP_MAP: Record<string, string> = {
        "PĐB": "Phẫu thuật ĐB", "P1": "Phẫu thuật loại 1", "P2": "Phẫu thuật loại 2", "P3": "Phẫu thuật loại 3",
        "TĐB": "Thủ thuật ĐB", "T1": "Thủ thuật loại 1", "T2": "Thủ thuật loại 2", "T3": "Thủ thuật loại 3", "TKPL": "Thủ thuật KPL"
    };

    const roleHeaders: string[] = ["STT", "KHOA", "Mã số thuế", "HỌ TÊN"];
    const topHeaders: { title: string, startCol: number, endCol: number }[] = [];
    let currentGroup = "";
    let currentGroupStart = -1;
    const colOffset = 4;

    for (let i = 0; i < COLS_RUTGON.length; i++) {
        const colKey = COLS_RUTGON[i];
        const [loai, role] = colKey.split("-");
        roleHeaders.push(role);

        if (loai !== currentGroup) {
            if (currentGroup && currentGroupStart !== -1) {
                topHeaders.push({
                    title: GROUP_MAP[currentGroup] || currentGroup,
                    startCol: colOffset + currentGroupStart,
                    endCol: colOffset + i - 1
                });
            }
            currentGroup = loai;
            currentGroupStart = i;
        }
    }
    if (currentGroup && currentGroupStart !== -1) {
        topHeaders.push({
            title: GROUP_MAP[currentGroup] || currentGroup,
            startCol: colOffset + currentGroupStart,
            endCol: colOffset + COLS_RUTGON.length - 1
        });
    }

    // Write Headers
    ws[`A${rowStart}`] = { t: "s", v: "STT", s: { font: { bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
    ws[`B${rowStart}`] = { t: "s", v: "KHOA", s: { font: { bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
    ws[`C${rowStart}`] = { t: "s", v: "Mã số thuế", s: { font: { bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
    ws[`D${rowStart}`] = { t: "s", v: "HỌ TÊN", s: { font: { bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };

    topHeaders.forEach(grp => {
        const startC = XLSX.utils.encode_col(grp.startCol);
        ws[`${startC}${rowStart}`] = {
            t: "s", v: grp.title,
            s: { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } }
        };
        if (!ws["!merges"]) ws["!merges"] = [];
        ws["!merges"].push({ s: { r: rowStart - 1, c: grp.startCol }, e: { r: rowStart - 1, c: grp.endCol } });
    });

    const contentRow = rowStart + 1;
    XLSX.utils.sheet_add_aoa(ws, [roleHeaders], { origin: `A${contentRow}` });

    for (let c = 0; c < roleHeaders.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: rowStart, c: c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = { font: { bold: true, italic: true }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } };
    }

    ws["!merges"].push({ s: { r: rowStart - 1, c: 0 }, e: { r: rowStart, c: 0 } });
    ws["!merges"].push({ s: { r: rowStart - 1, c: 1 }, e: { r: rowStart, c: 1 } });
    ws["!merges"].push({ s: { r: rowStart - 1, c: 2 }, e: { r: rowStart, c: 2 } });
    ws["!merges"].push({ s: { r: rowStart - 1, c: 3 }, e: { r: rowStart, c: 3 } });

    const PRICE_CFG = config.priceConfig;
    ws[`D${dongGiaRow}`] = { t: "s", v: "Đơn giá", s: { font: { italic: true }, alignment: { horizontal: "right" } } };

    for (let i = 0; i < COLS_RUTGON.length; i++) {
        const colIndex = 4 + i;
        const colLetter = XLSX.utils.encode_col(colIndex);
        const [loai, role] = (COLS_RUTGON[i] || "").split("-");
        let price = 0;
        if (loai && role && PRICE_CFG[loai]) price = PRICE_CFG[loai][role] || 0;
        ws[`${colLetter}${dongGiaRow}`] = { t: "n", v: price, z: "#,##0" };
    }

    // Totals
    const updatedRange = XLSX.utils.decode_range(ws["!ref"]!);
    const lastDataColIndex = updatedRange.e.c;
    const totalColIndex = lastDataColIndex + 1;
    const totalColLetter = XLSX.utils.encode_col(totalColIndex);

    ws[`${totalColLetter}${rowStart}`] = { t: "s", v: "TỔNG" };
    let writeRow = dongGiaRow + 1;
    while (writeRow < dataRow) {
        const firstDataColLetter = XLSX.utils.encode_col(4);
        const lastDataColLetterStr = XLSX.utils.encode_col(lastDataColIndex);
        ws[`${totalColLetter}${writeRow}`] = { t: "n", f: `SUMPRODUCT(${firstDataColLetter}${writeRow}:${lastDataColLetterStr}${writeRow},${firstDataColLetter}${dongGiaRow}:${lastDataColLetterStr}${dongGiaRow})` };
        writeRow++;
    }

    const totalRow = dataRow;
    ws[`A${totalRow}`] = { t: "s", v: "" };
    ws[`B${totalRow}`] = { t: "s", v: "" };
    ws[`C${totalRow}`] = { t: "s", v: "" };
    ws[`D${totalRow}`] = { t: "s", v: "TỔNG" };

    for (let c = 4; c <= lastDataColIndex; c++) {
        const colL = XLSX.utils.encode_col(c);
        ws[`${colL}${totalRow}`] = { t: "n", f: `SUM(${colL}${dongGiaRow + 1}:${colL}${dataRow - 1})` };
    }
    const firstDataColLetterFinal = XLSX.utils.encode_col(4);
    const lastDataColLetterFinal = XLSX.utils.encode_col(lastDataColIndex);
    ws[`${totalColLetter}${totalRow}`] = { t: "n", f: `SUMPRODUCT(${firstDataColLetterFinal}${totalRow}:${lastDataColLetterFinal}${totalRow},${firstDataColLetterFinal}${dongGiaRow}:${lastDataColLetterFinal}${dongGiaRow})` };

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow - 1, c: totalColIndex } });
    ws["!cols"] = [{ wch: 4 }, { wch: 10 }, { wch: 11 }, { wch: 20 }, ...COLS_RUTGON.map(() => ({ wch: 8 })), { wch: 12 }];

    XLSX.utils.sheet_add_aoa(ws, [["SỞ Y TẾ HẢI PHÒNG"]], { origin: "B1" });
    XLSX.utils.sheet_add_aoa(ws, [[(config.hospitalName || "BỆNH VIỆN ĐA KHOA THỦY NGUYÊN").toUpperCase()]], { origin: "B2" });
    const midCol = XLSX.utils.encode_col(Math.floor((totalColIndex + 1) / 2));
    XLSX.utils.sheet_add_aoa(ws, [["BẢNG THANH TOÁN PHẪU THUẬT, THỦ THUẬT"]], { origin: `${midCol}3` });
    XLSX.utils.sheet_add_aoa(ws, [[dateRangeText]], { origin: `${midCol}5` });

    XLSX.utils.book_append_sheet(wb, ws, "BANG_THANH_TOAN");

    // 7. DS_MA_MAY (Re-generate from records)
    // Logic: Rebuild from records, implicitly filtering out deleted ones.
    const machineListData: any[][] = [["Mã BN", "Tên bệnh nhân", "Ngày phẫu thuật", "Mã máy", "Tên phẫu thuật"]];
    // Note: We lost exact file structure if we rely only on records, but for cleaning up data, this is better.
    // HOWEVER: records DO NOT contain all entries if they were invalid? 
    // records contain everything processed from listData. 
    // machineMap was built from detailData. 
    // Ideally, DS_MA_MAY should reflect valid records + machine.

    // Reconstruct DS_MA_MAY from records
    for (const r of records) {
        if (!r.machine) continue;
        machineListData.push([
            r.patientId,
            r.patientName,
            r.ngayKT, // Using end date as surgery date approximation
            r.machine,
            r.tenKT
        ]);
    }
    const wsMachineList = XLSX.utils.aoa_to_sheet(machineListData);
    XLSX.utils.book_append_sheet(wb, wsMachineList, "DS_MA_MAY");

    // 8. Stats & Return
    const totalDurationMinutes = records.reduce((sum, r) => sum + r.timeMinutes, 0);

    let totalPayment = 0;
    for (const it of ttData) {
        for (const colKey of Object.keys(it.values)) {
            const qty = it.values[colKey] || 0;
            if (qty > 0) {
                const [loai, role] = colKey.split("-");
                let configRole: any = "Giúp việc";
                if (role === "Chính") configRole = "Chính";
                else if (role === "Phụ") configRole = "Phụ";
                else if (role === "Giúp việc") configRole = "Giúp việc";
                const typeConfig = PRICE_CFG[loai];
                const price = (typeConfig && typeConfig[configRole]) ? typeConfig[configRole] : 20000;
                totalPayment += qty * price;
            }
        }
    }

    const paymentData: any = {
        columns: COLS_RUTGON,
        rows: ttData.map(it => ({
            name: it.name,
            taxId: it.taxId,
            department: it.department,
            values: it.values,
            total: Object.values(it.values).reduce((a, b) => a + b, 0) // rough check
        }))
    };

    return {
        success: true,
        message: "Xử lý thành công!",
        wb: wb,
        stats: {
            totalSurgeries: records.length,
            totalDurationMinutes,
            staffConflicts: staffConflicts.length,
            machineConflicts: machineConflicts.length,
            missingMachines: missingMachine.length,
            lowPaymentCount: records.filter(r => r.soLuong < 1).length, // count records with < 100% payment (soLuong < 1)
            violateMinTimeCount: records.filter(r => {
                const min = timeRules[r.loaiPTTT]?.min ?? 0;
                return r.timeMinutes < min;
            }).length,
            missingAssistantCount: records.filter(r => !r.gv).length // assuming empty string check
        },
        paymentStats: {
            totalAmount: totalPayment
        },
        conflicts: [], // Deprecated
        validRecords: records,
        staffConflicts,
        machineConflicts,
        missingRecords: missingMachine,
        paymentData,
        dateRangeText,
    };
}

// Payment Collection Logic
function collectThanhToanData_New(records: SurgeryRecord[], config: AppConfig) {
    const map = new Map<string, { values: Record<string, number>, taxId: string, department: string, bestRoleWeight: number, bestSubRoleWeight: number }>();
    const ROLE_WEIGHTS: Record<string, number> = { "Chính": 1, "Phụ": 2, "Giúp việc": 3 };
    const SUB_ROLE_WEIGHTS: Record<string, number> = { "KTV GM": 1, "TDC": 2, "GV": 3 };
    const POS_WEIGHTS: Record<string, number> = { "BS PT": 1, "BS GMHS": 2, "Phụ": 3 };

    const departmentOrder = new Map<string, number>();
    (config.departments || []).forEach((dept, idx) => departmentOrder.set(dept, idx));

    const staffList = config.staffList || [];
    const staffOrder = new Map<string, number>();
    const ROLE_ORDER: Record<string, number> = {
        "PT Chính": 1, "PT Phụ": 2, "BS GM": 3, "KTV GM": 4, "TDC": 5, "GV": 6
    };
    let globalOrderCounter = 1;

    function registerStaffAppearance(name: string | undefined, roleLabel: string) {
        if (!name) return;
        if (!staffOrder.has(name)) {
            const base = (ROLE_ORDER[roleLabel] || 99) * 100000;
            staffOrder.set(name, base + globalOrderCounter);
            globalOrderCounter++;
        }
    }

    function getDerivedPosition(roleLabel: string): string {
        if (roleLabel === "PT Chính" || roleLabel === "PT Phụ") return "BS PT";
        if (roleLabel === "BS GM") return "BS GMHS";
        if (roleLabel === "KTV GM" || roleLabel === "TDC" || roleLabel === "GV") return "Phụ";
        return "";
    }

    function add(name: string | undefined, role: string, loai: string, sl: number, roleLabel: string) {
        if (!name || !loai) return;

        const derivedPos = getDerivedPosition(roleLabel);
        const currentRoleWeight = ROLE_WEIGHTS[role] || 99;
        const currentSubRoleWeight = SUB_ROLE_WEIGHTS[roleLabel] || 99;

        // Improved Matching Logic:
        // 1. Try Exact Match (Name + Position)
        // 2. Try Name Match only (if unique or just take first)
        // 3. Normalized Name Match

        const cleanName = name.trim().toLowerCase();
        let matchedStaff = staffList.find(s => s.name === name && s.position === derivedPos);

        if (!matchedStaff) {
            // Fallback 1: Match by Name only (exact casing)
            matchedStaff = staffList.find(s => s.name === name);
        }

        if (!matchedStaff) {
            // Fallback 2: Match by Name (case insensitive)
            matchedStaff = staffList.find(s => s.name.trim().toLowerCase() === cleanName);
        }

        const staffKey = `${name}|${derivedPos}`;
        registerStaffAppearance(name, roleLabel);

        if (!map.has(staffKey)) {
            map.set(staffKey, {
                values: {},
                taxId: matchedStaff?.taxId || "",
                department: matchedStaff?.department || "",
                bestRoleWeight: currentRoleWeight,
                bestSubRoleWeight: currentSubRoleWeight
            });
        }

        const item = map.get(staffKey)!;
        const key = `${loai}-${role}`;
        item.values[key] = (item.values[key] || 0) + (Number(sl) || 0);

        if (currentRoleWeight < item.bestRoleWeight) item.bestRoleWeight = currentRoleWeight;
        if (currentSubRoleWeight < item.bestSubRoleWeight) item.bestSubRoleWeight = currentSubRoleWeight;
    }

    for (const r of records) {
        const loai = r.loaiPTTT;
        if (!loai) continue;
        add(r.ptChinh, "Chính", loai, r.soLuong, "PT Chính");
        add(r.ptPhu, "Phụ", loai, r.soLuong, "PT Phụ");
        add(r.bsGM, "Chính", loai, r.soLuong, "BS GM");
        add(r.ktvGM, "Phụ", loai, r.soLuong, "KTV GM");
        add(r.tdc, "Phụ", loai, r.soLuong, "TDC");
        add(r.gv, "Giúp việc", loai, r.soLuong, "GV");
    }

    return Array.from(map.entries())
        .map(([staffKey, item]) => {
            const [name, derivedPos] = staffKey.split('|');
            const totalQty = Object.values(item.values).reduce((sum, val) => sum + val, 0);
            return {
                name, derivedPos, taxId: item.taxId, department: item.department,
                values: item.values, bestRoleWeight: item.bestRoleWeight, bestSubRoleWeight: item.bestSubRoleWeight, totalQty
            };
        })
        .sort((a, b) => {
            // Priority 1: Department (based on departmentOrder config)
            let weightA = departmentOrder.get(a.department) ?? 999;
            let weightB = departmentOrder.get(b.department) ?? 999;

            // Special handling for GMHS support/sub-roles if needed, but primary sort should be Dept.
            // If weightA !== weightB return weightA - weightB;

            // NOTE: The user wants separator lines between departments.
            // So Department MUST be the primary sort key.
            if (a.department !== b.department) {
                // Start by checking configured order
                if (weightA !== weightB) return weightA - weightB;
                // Fallback to alphabetical if not in config
                return (a.department || "").localeCompare(b.department || "", 'vi');
            }

            // Priority 2: Position/Role
            const posA = POS_WEIGHTS[a.derivedPos] || 99;
            const posB = POS_WEIGHTS[b.derivedPos] || 99;
            if (posA !== posB) return posA - posB;

            // Priority 3: Internal Role Weights
            if (a.bestRoleWeight !== b.bestRoleWeight) return a.bestRoleWeight - b.bestRoleWeight;
            if (a.derivedPos === "Phụ" && a.bestSubRoleWeight !== b.bestSubRoleWeight) return a.bestSubRoleWeight - b.bestSubRoleWeight;

            // Priority 4: Total Quantity (Descending)
            if (a.totalQty !== b.totalQty) return b.totalQty - a.totalQty;

            // Priority 5: Name (Alphabetical)
            return a.name.localeCompare(b.name, 'vi');
        })
        .map((row, idx, arr) => ({ ...row, isNewDept: idx === 0 || row.department !== arr[idx - 1].department }));
}

export function recalculateResultFromRecords(records: SurgeryRecord[], config: AppConfig): Partial<ProcessingResult> {
    // Generate unique keys for records (critical for conflict dedup)
    records.forEach((r) => {
        if (!r.key) {
            const d = r.end || r.start || new Date();
            const dateKey = `${d.getFullYear()}${d.getMonth()}${d.getDate()}`;
            r.key = `${r.patientId}-${r.patientName}-${dateKey}-${r.tenKT}`;
        }
    });

    const staffConflicts = detectStaffConflicts(records, config);
    const machineConflicts = detectMachineConflicts(records);

    // Recalculate stats
    let totalDurationMinutes = 0;
    records.forEach((r) => {
        totalDurationMinutes += r.timeMinutes;
    });


    const missingMachine = records.filter((r) => {
        // Use machineCode as primary check
        if (r.machineCode) return false;
        if (r.machine && r.machine.trim() !== "") return false;
        // Check if surgery name matches any pattern in ignoredMachineNames (substring match)
        if (config.ignoredMachineNames && config.ignoredMachineNames.some(ignoredName => {
            const normalizedSurgeryName = r.tenKT.replace(/[\[\]()]/g, '').trim().toLowerCase();
            const normalizedIgnoredName = ignoredName.replace(/[\[\]()]/g, '').trim().toLowerCase();
            return normalizedSurgeryName.includes(normalizedIgnoredName) || normalizedIgnoredName.includes(normalizedSurgeryName);
        })) return false;
        return true;
    });


    // Generate Payment/Sheet Data Logic (simplified for recalculation)
    const LOAI = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];
    const VAITRO = ["Chính", "Phụ", "Giúp việc"];
    const COLS: string[] = [];
    for (const loai of LOAI) for (const v of VAITRO) COLS.push(`${loai}-${v}`);

    const ttData = collectThanhToanData_New(records, config);

    // Calculate columns that have data
    const totalsByCol: number[] = COLS.map((colKey) => ttData.reduce((s, it) => s + (it.values[colKey] ?? 0), 0));
    const COLS_RUTGON = COLS.filter((_, i) => totalsByCol[i] > 0);

    const paymentData = {
        columns: COLS_RUTGON,
        rows: ttData.map(it => ({
            name: it.name,
            taxId: it.taxId,
            department: it.department,
            values: it.values,
            total: Object.values(it.values).reduce((a, b) => a + b, 0)
        }))
    };

    // Calculate total amount from paymentData
    let totalPayment = 0;
    const PRICE_CFG = config.priceConfig || {};
    if (paymentData && paymentData.rows) {
        paymentData.rows.forEach((row: any) => {
            Object.keys(row.values).forEach(colKey => {
                const qty = row.values[colKey] || 0;
                if (qty > 0) {
                    const [loai, role] = colKey.split("-");
                    let configRole: any = "Giúp việc";
                    if (role === "Chính") configRole = "Chính";
                    else if (role === "Phụ") configRole = "Phụ";
                    else if (role === "Giúp việc") configRole = "Giúp việc";
                    const typeConfig = PRICE_CFG[loai];
                    const price = (typeConfig && typeConfig[configRole]) ? typeConfig[configRole] : 20000;
                    totalPayment += qty * price;
                }
            });
        });
    }

    return {
        validRecords: [...records],
        staffConflicts,
        machineConflicts,
        missingRecords: missingMachine,
        paymentData,
        stats: {
            totalSurgeries: records.length,
            totalDurationMinutes,
            staffConflicts: staffConflicts.length,
            machineConflicts: machineConflicts.length,
            missingMachines: missingMachine.length,
            lowPaymentCount: records.filter(r => r.soLuong < 1).length,
            violateMinTimeCount: records.filter(r => {
                const min = config.timeRules[r.loaiPTTT]?.min ?? 0;
                return r.timeMinutes < min;
            }).length,
            missingAssistantCount: records.filter(r => !r.gv).length
        },
        paymentStats: {
            totalAmount: totalPayment
        }
    };
}
