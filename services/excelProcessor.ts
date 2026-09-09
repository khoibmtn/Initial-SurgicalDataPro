import * as XLSX from "xlsx";
import { ProcessingResult, SurgeryRecord, MachineEntry } from "../types";
import { reprocessSurgicalRecords } from "./reprocess";



// ───────────────── Helper: parse dd/mm/yyyy hh:mm → Date ─────────────────

function normalizeCell(v: any): string {
  return (v ?? "").toString().trim().toUpperCase();
}

// ================= NHẬN DIỆN FILE DANH SÁCH PTTT (FILE 1) =================
function validateListFileFormat(listData: any[][]): string | null {

  const title = normalizeCell(listData?.[2]?.[0]);
  if (!title.includes("DANH SÁCH PHẪU THUẬT")) {
    return "File DANH SÁCH PHẪU THUẬT chưa đúng mẫu. Hãy xuất từ đúng báo cáo trên Minh Lộ.";
  }

  const stt = listData?.[8]?.[0];
  const name = listData?.[8]?.[1];

  if (!stt || String(stt).trim() !== "1" || !name) {
    return "File DANH SÁCH PHẪU THUẬT chưa đúng mẫu: dòng dữ liệu đầu tiên không hợp lệ. Hãy xuất từ đúng báo cáo trên Minh Lộ (lưu ý bỏ chọn nhóm theo khoa)";
  }

  return null;
}



// ───────────────── Helper: parse dd/mm/yyyy hh:mm → Date ─────────────────

function parseVNDateTime(value: any): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  // dạng dd/mm/yyyy hh:mm
  const [datePart, timePart] = s.split(" ");
  if (!datePart) return null;
  const [d, m, y] = datePart.split("/").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;

  let hh = 0;
  let mm = 0;
  if (timePart) {
    const [hStr, mStr] = timePart.split(":");
    hh = parseInt(hStr || "0", 10);
    mm = parseInt(mStr || "0", 10);
  }

  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Kiểm tra ca mổ trùng lặp trong toàn bộ file Excel: cùng mã BN, cùng 1 PT, cùng khoảng thời gian BĐ/KT
export function checkDuplicateSurgeriesInExcel(listData: any[][]): string | null {
  const seenMap = new Map<string, { rowNumber: number; patientName: string; patientId: string; tenKT: string; timeRange: string }>();
  const duplicateErrors: Array<{ firstRow: number; secondRow: number; patientName: string; patientId: string; tenKT: string; timeRange: string }> = [];

  for (let i = 8; i < listData.length; i++) {
    const row = listData[i] || [];
    const rawStt = row[0];

    // Detect end of data
    if (rawStt === null || rawStt === undefined || String(rawStt).trim() === "") break;
    const excelRow = i + 1; // 1-based line number in Excel file

    const name = (row[1] ?? "").toString().trim();
    const ngayBD = (row[6] ?? "").toString().trim();
    const ngayKT = (row[7] ?? "").toString().trim();
    const tenKT = (row[8] ?? "").toString().trim();
    const maBN = (row[20] ?? "").toString().trim();

    const cleanMaBN = maBN.trim().replace(/\s+/g, ' ').toLowerCase();
    const cleanName = name.trim().replace(/\s+/g, ' ').toLowerCase();
    const cleanTenKT = tenKT.trim().replace(/\s+/g, ' ').toLowerCase();

    const startDate = parseVNDateTime(ngayBD);
    const endDate = parseVNDateTime(ngayKT);
    const cleanStart = startDate ? startDate.toISOString() : ngayBD.trim().replace(/\s+/g, ' ').toLowerCase();
    const cleanEnd = endDate ? endDate.toISOString() : ngayKT.trim().replace(/\s+/g, ' ').toLowerCase();

    // Bắt trùng khi: cùng mã BN (hoặc tên BN nếu thiếu mã), cùng tên PT, cùng khoảng thời gian BĐ/KT
    const patientIdentifier = cleanMaBN || cleanName;
    if (patientIdentifier && cleanTenKT && (cleanStart || cleanEnd)) {
      const dupKey = `${patientIdentifier}___${cleanTenKT}___${cleanStart}___${cleanEnd}`;
      if (seenMap.has(dupKey)) {
        const prev = seenMap.get(dupKey)!;
        duplicateErrors.push({
          firstRow: prev.rowNumber,
          secondRow: excelRow,
          patientName: name || prev.patientName,
          patientId: maBN || prev.patientId,
          tenKT,
          timeRange: `${ngayBD} - ${ngayKT}`
        });
      } else {
        seenMap.set(dupKey, {
          rowNumber: excelRow,
          patientName: name,
          patientId: maBN,
          tenKT,
          timeRange: `${ngayBD} - ${ngayKT}`
        });
      }
    }
  }

  if (duplicateErrors.length > 0) {
    const details = duplicateErrors.slice(0, 5).map(e => 
      `• BN: ${e.patientName} (Mã BN: ${e.patientId}) - PT: "${e.tenKT}" (${e.timeRange}): Trùng giữa dòng ${e.firstRow} và dòng ${e.secondRow}`
    ).join('\n');
    const extraMsg = duplicateErrors.length > 5 ? `\n...và còn ${duplicateErrors.length - 5} trường hợp trùng khác.` : '';
    return `Phát hiện ${duplicateErrors.length} ca mổ trùng lặp trong file Excel:\n${details}${extraMsg}\nVui lòng kiểm tra lại file Excel (hệ thống từ chối import khi phát hiện ca trùng).`;
  }

  return null;
}

// ================= EXPORTED VALIDATION FUNCTIONS =================
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  dateRangeText?: string;
}

export async function validateListFile(file: File): Promise<FileValidationResult> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    const error = validateListFileFormat(data);
    if (error) {
      return { valid: false, error };
    }

    // Kiểm tra ca mổ trùng ngay khi chọn file
    const duplicateError = checkDuplicateSurgeriesInExcel(data);
    if (duplicateError) {
      return { valid: false, error: duplicateError };
    }

    // Extract date range from A5
    const dateRangeText = String(data?.[4]?.[0] ?? "").trim();

    return { valid: true, dateRangeText };
  } catch (e: any) {
    return { valid: false, error: `Không thể đọc file: ${e.message}` };
  }
}

// yyyy-mm-dd từ Date
function toDateKey(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// kiểm tra giao thoa khoảng thời gian
function isOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}



// ────────────── 2. Xử lý file Danh sách PT thành dòng chuẩn ──────────────

// (Đã chuyển SurgeryRecord và StaffRole sang types.ts)

function determineLoaiPT(row: any[]): string {
  const j = row[9];
  const k = row[10];
  const l = row[11];
  const m = row[12];
  if (j) return "ĐB";
  if (k) return "1";
  if (l) return "2";
  if (m) return "3";
  return "";
}

function determineLoaiTT(row: any[]): string {
  const n = row[13];
  const o = row[14];
  const p = row[15];
  const q = row[16];
  const r = row[17];
  if (n) return "ĐB";
  if (o) return "1";
  if (p) return "2";
  if (q) return "3";
  if (r) return "KPL";
  return "";
}

function determineLoaiPTTT(row: any[]): string {
  // Cột phẫu thuật (J→M)
  const loaiPT_raw = determineLoaiPT(row);
  if (loaiPT_raw) {
    return "P" + loaiPT_raw;   // PĐB, P1, P2, P3
  }

  // Cột thủ thuật (N→R)
  const loaiTT_raw = determineLoaiTT(row);
  if (loaiTT_raw) {
    return "T" + loaiTT_raw;   // TĐB, T1, T2, T3, TKPL
  }

  return ""; // fallback nhưng trường hợp này gần như không xảy ra
}


function processListData(
  listData: any[][],
  machineRegistry: MachineEntry[] = []
): SurgeryRecord[] {
  // Kiểm tra ca mổ trùng lặp ngay trong file Excel (cùng mã BN, cùng PT, cùng khoảng thời gian BĐ/KT)
  const duplicateError = checkDuplicateSurgeriesInExcel(listData);
  if (duplicateError) {
    throw new Error(duplicateError);
  }

  const records: SurgeryRecord[] = [];
  let sttCounter = 1;
  for (let i = 8; i < listData.length; i++) {
    const row = listData[i] || [];
    const rawStt = row[0];

    // Detect end of data - still use first column but ignore value
    if (rawStt === null || rawStt === undefined || String(rawStt).trim() === "") break;
    const excelRow = i + 1; // 1-based line number in Excel file
    const stt = sttCounter++;

    const name = (row[1] ?? "").toString().trim();
    const yearNam = (row[2] ?? "").toString().trim();
    const yearNu = (row[3] ?? "").toString().trim();
    const bhyt = (row[4] ?? "").toString().trim();
    const ngayCD = (row[5] ?? "").toString().trim();
    const ngayBD = (row[6] ?? "").toString().trim();
    const ngayKT = (row[7] ?? "").toString().trim();
    const tenKT = (row[8] ?? "").toString().trim();
    const tyLe = Number(row[18] ?? 0);
    const sl = Number(row[19] ?? 0);
    const maBN = (row[20] ?? "").toString().trim();
    const ptChinh = (row[21] ?? "").toString().trim();
    const ptPhu = (row[22] ?? "").toString().trim();
    const bsGM = (row[23] ?? "").toString().trim();
    const ktvGM = (row[24] ?? "").toString().trim();
    const tdc = (row[25] ?? "").toString().trim();
    const gv = (row[26] ?? "").toString().trim();
    const rawMachineCode = (row[27] ?? "").toString().trim();

    // Lookup machine registry by machineCode
    const registryEntry = machineRegistry.find(
      m => m.machineCode === rawMachineCode && m.active
    ) || machineRegistry.find(m => m.machineCode === rawMachineCode);

    const machineCode = rawMachineCode;
    const machineId = registryEntry?.machineId || "";
    const machineName = registryEntry?.machineName || rawMachineCode;

    // Giới tính + năm sinh
    let gender = "";
    let yob = "";
    if (yearNam) {
      gender = "Nam";
      yob = yearNam;
    } else if (yearNu) {
      gender = "Nữ";
      yob = yearNu;
    }

    const startDate = parseVNDateTime(ngayBD);
    const endDate = parseVNDateTime(ngayKT);

    let timeMinutes = 0;
    if (startDate && endDate && endDate > startDate) {
      timeMinutes = Math.round(
        (endDate.getTime() - startDate.getTime()) / 60000
      );
    }

    // 🔥 SỬA TẠI ĐÂY — LẤY NGÀY KẾT THÚC ĐÚNG 100%
    // ngayKT: "dd/mm/yyyy hh:mm"
    const ngayKT_raw = ngayKT.split(" ")[0] ?? "";  // "dd/mm/yyyy"
    let dateKey = "";

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(ngayKT_raw)) {
      const [dd, mm, yyyy] = ngayKT_raw.split("/");
      dateKey = `${yyyy}-${mm}-${dd}`;              // yyyy-mm-dd
    } else {
      // fallback: dùng endDate nếu định dạng đầu vào lỗi
      dateKey = toDateKey(endDate);
    }

    const key = `${maBN}-${name}-${dateKey}-${tenKT}`;

    const soLuongRaw = (tyLe / 100) * sl;
    const soLuong = Math.round(soLuongRaw * 100) / 100;
    const loaiPTTT = determineLoaiPTTT(row);
    records.push({
      stt,
      patientId: maBN,
      patientName: name,
      gender,
      yob,
      bhyt,
      ngayCD,
      ngayBD,
      ngayKT,
      tenKT,
      loaiPTTT,
      soLuong,
      timeMinutes,
      ptChinh,
      ptPhu,
      bsGM,
      ktvGM,
      tdc,
      gv,
      machine: machineName,
      machineCode,
      machineId,
      start: startDate,
      end: endDate,
      key,
      excelRowIndex: excelRow,
    });
  }

  return records;
}


// ────────────── 4. Hàm chính: đọc file, xử lý, tạo workbook ──────────────

import { AppConfig, RoleFilterConfig } from "../contexts/ConfigContext";
import { ImportFilterSummary, StaffMember } from "../types";

function cleanStaffName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^(bs\.?|th\.?s\.?|cki\.?|ckii\.?|pgs\.?|gs\.?)\s+/i, "")
    .trim();
}

/**
 * Lọc danh sách ca mổ dựa trên cấu hình Khoa/phòng được lấy vào báo cáo và 5 vị trí kíp mổ.
 * Logic: Ca mổ được chấp nhận nếu có ít nhất 1 nhân sự ở vị trí được bật thuộc một trong các khoa được chọn (OR logic).
 */
export function filterSurgicalRecordsByDepartment(
  records: SurgeryRecord[],
  config: AppConfig
): { filteredRecords: SurgeryRecord[]; filterSummary: ImportFilterSummary } {
  const totalInFile = records.length;

  // 1. Lấy danh sách các khoa được chọn lấy vào báo cáo (mặc định true nếu chưa có cấu hình)
  const allowedDepts = new Set<string>();
  (config.departments || []).forEach(dept => {
    const detail = config.departmentDetails?.[dept];
    const isIncluded = detail?.includeInReport ?? true;
    if (isIncluded) {
      const dClean = dept.trim();
      allowedDepts.add(dClean.toLowerCase());
      if (detail?.fullName) {
        allowedDepts.add(detail.fullName.trim().toLowerCase());
      }
    }
  });

  // 2. Lấy cấu hình 5 vị trí kíp mổ được bật (mặc định bật cả 5 nếu chưa có cấu hình)
  const roleFilters: RoleFilterConfig = config.reportRoleFilters || {
    ptChinh: true,
    ptPhu: true,
    bsGM: true,
    ktvGM: true,
    tdc: true,
  };

  const activeRoles: Array<'ptChinh' | 'ptPhu' | 'bsGM' | 'ktvGM' | 'tdc'> = [];
  if (roleFilters.ptChinh) activeRoles.push('ptChinh');
  if (roleFilters.ptPhu) activeRoles.push('ptPhu');
  if (roleFilters.bsGM) activeRoles.push('bsGM');
  if (roleFilters.ktvGM) activeRoles.push('ktvGM');
  if (roleFilters.tdc) activeRoles.push('tdc');

  // Trường hợp tắt hết: Nếu không có khoa nào hoặc không có vị trí nào được bật -> Không import ca nào
  if (allowedDepts.size === 0 || activeRoles.length === 0) {
    return {
      filteredRecords: [],
      filterSummary: {
        totalInFile,
        importedCount: 0,
        excludedCount: totalInFile,
        missingStaffCount: 0,
        unassignedStaffCount: 0,
        unmatchedDeptCount: totalInFile,
      }
    };
  }

  // 3. Xây dựng bảng tra cứu nhân viên (theo tên đã chuẩn hóa)
  const staffList = config.staffList || [];
  const staffMap = new Map<string, StaffMember[]>();
  staffList.forEach(s => {
    if (!s.name) return;
    const rawKey = s.name.trim().toLowerCase();
    const cleanKey = cleanStaffName(s.name);
    if (!staffMap.has(rawKey)) {
      staffMap.set(rawKey, []);
    }
    staffMap.get(rawKey)!.push(s);

    if (cleanKey !== rawKey) {
      if (!staffMap.has(cleanKey)) {
        staffMap.set(cleanKey, []);
      }
      staffMap.get(cleanKey)!.push(s);
    }
  });

  const filteredRecords: SurgeryRecord[] = [];
  let missingStaffCount = 0;
  let unassignedStaffCount = 0;
  let unmatchedDeptCount = 0;

  records.forEach(rec => {
    let hasMatchedRole = false;
    let recordHasMissingStaff = false;
    let recordHasUnassignedStaff = false;

    for (const roleKey of activeRoles) {
      const rawName = rec[roleKey];
      if (!rawName || typeof rawName !== 'string' || !rawName.trim()) continue;
      const nameLower = rawName.trim().toLowerCase();
      const nameClean = cleanStaffName(rawName);

      let matchingStaff = staffMap.get(nameLower);
      if (!matchingStaff || matchingStaff.length === 0) {
        matchingStaff = staffMap.get(nameClean) || [];
      }

      if (matchingStaff.length === 0) {
        recordHasMissingStaff = true;
      } else {
        const depts = matchingStaff.map(s => s.department?.trim().toLowerCase()).filter(Boolean) as string[];
        if (depts.length === 0) {
          recordHasUnassignedStaff = true;
        } else if (depts.some(d => allowedDepts.has(d))) {
          hasMatchedRole = true;
          break; // Đã thỏa mãn điều kiện khoa phòng (OR logic)
        }
      }
    }

    if (hasMatchedRole) {
      filteredRecords.push(rec);
    } else {
      if (recordHasMissingStaff) {
        missingStaffCount++;
      } else if (recordHasUnassignedStaff) {
        unassignedStaffCount++;
      } else {
        unmatchedDeptCount++;
      }
    }
  });

  // Đánh lại STT liên tục cho các bản ghi được nhận
  filteredRecords.forEach((r, idx) => {
    r.stt = idx + 1;
  });

  const importedCount = filteredRecords.length;
  const excludedCount = totalInFile - importedCount;

  return {
    filteredRecords,
    filterSummary: {
      totalInFile,
      importedCount,
      excludedCount,
      missingStaffCount,
      unassignedStaffCount,
      unmatchedDeptCount,
    }
  };
}

export async function processSurgicalFiles(
  surgicalListFile: File | null,
  config: AppConfig
): Promise<ProcessingResult> {

  console.log(">>> BẮT ĐẦU XỬ LÝ EXCEL <<<");

  if (!surgicalListFile) {
    throw new Error("Vui lòng tải file Danh sách PT.");
  }

  // 1. Đọc file Danh sách PT
  const listBuffer = await surgicalListFile.arrayBuffer();
  const listWorkbook = XLSX.read(listBuffer);
  const listSheet = listWorkbook.Sheets[listWorkbook.SheetNames[0]];
  const listData: any[][] = XLSX.utils.sheet_to_json(listSheet, {
    header: 1,
  }) as any[][];

  const listError = validateListFileFormat(listData);
  if (listError) throw new Error(listError);

  // Extract date range from A5 of list file (index 4)
  const listDateRange = String(listData?.[4]?.[0] ?? "").trim();
  if (!listDateRange) {
    throw new Error("Không tìm thấy thông tin thời gian trong file Danh sách PT.");
  }

  const dateRangeText = listDateRange;

  // 2. Xử lý danh sách PT thành records chuẩn (mã máy lấy từ cột AB)
  const rawRecords = processListData(listData, config.machineRegistry || []);
  console.log("DEBUG rawRecords mẫu:", rawRecords.slice(0, 5));

  // 2.1. Lọc theo danh mục Khoa/Phòng và 5 vị trí kíp mổ cấu hình
  const { filteredRecords, filterSummary } = filterSurgicalRecordsByDepartment(rawRecords, config);
  console.log(`DEBUG Filter Summary: ${filterSummary.importedCount}/${filterSummary.totalInFile} ca hợp lệ (${filterSummary.excludedCount} bị loại).`);

  if (filteredRecords.length === 0) {
    return {
      success: true,
      message: "Không có ca mổ nào thỏa mãn điều kiện lọc khoa phòng / vị trí kíp mổ.",
      wb: XLSX.utils.book_new(),
      validRecords: [],
      stats: {
        totalSurgeries: 0,
        totalDurationMinutes: 0,
        staffConflicts: 0,
        machineConflicts: 0,
        missingMachines: 0,
        lowPaymentCount: 0,
        violateMinTimeCount: 0,
        missingAssistantCount: 0,
      },
      paymentStats: {
        totalAmount: 0,
      },
      staffConflicts: [],
      machineConflicts: [],
      missingMachines: [],
      thanhToanData: { columns: [], rows: [] },
      dateRangeText,
      filterSummary,
    };
  }

  // 3. Phát hiện trùng & tạo báo cáo
  const result = reprocessSurgicalRecords(filteredRecords, config, dateRangeText);
  result.filterSummary = filterSummary;
  return result;
}
