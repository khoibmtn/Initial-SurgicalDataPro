import * as XLSX from "xlsx";
import { ProcessingResult, SurgeryRecord, StaffConflict, MachineConflict, StaffRole, ProcessedStats } from "../types";
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

// ================= NHẬN DIỆN FILE CHI TIẾT PT THEO KHOA (FILE 2) =================
function validateDetailFileFormat(detailData: any[][]): string | null {

  const title = normalizeCell(detailData?.[1]?.[0]);
  if (!title.includes("CHI TIẾT PHẪU THUẬT THEO KHOA")) {
    return "File CHI TIẾT PHẪU THUẬT THEO KHOA chưa đúng mẫu. Hãy xuất từ đúng báo cáo trên Minh Lộ.";
  }

  const A7 = String(detailData?.[6]?.[0] ?? "").trim();
  const A8 = String(detailData?.[7]?.[0] ?? "").trim();
  const A10 = String(detailData?.[9]?.[0] ?? "").trim();

  const isPatient = /^\d{10}\s*-\s*.+$/.test(A7);
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(A8);
  const isOne = A10 === "1";

  if (!isPatient || !isDate || !isOne) {
    return "File CHI TIẾT PHẪU THUẬT THEO KHOA chưa đúng cấu trúc chuẩn: hiển thị nhóm theo: Họ tên → Ngày làm → Máy làm.";
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

    // Extract date range from A5
    const dateRangeText = String(data?.[4]?.[0] ?? "").trim();

    return { valid: true, dateRangeText };
  } catch (e: any) {
    return { valid: false, error: `Không thể đọc file: ${e.message}` };
  }
}

export async function validateDetailFile(file: File): Promise<FileValidationResult> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    const error = validateDetailFileFormat(data);
    if (error) {
      return { valid: false, error };
    }

    // Extract date range from A3
    const dateRangeText = String(data?.[2]?.[0] ?? "").trim();

    return { valid: true, dateRangeText };
  } catch (e: any) {
    return { valid: false, error: `Không thể đọc file: ${e.message}` };
  }
}


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

// ────────────── 1. Tạo map KEY → Máy từ file Chi tiết PT ──────────────

function buildMachineMap(detailData: any[][]): Map<string, string> {
  const map = new Map<string, string>();

  let currentPatientId = "";
  let currentPatientName = "";
  let currentDate = "";
  let currentMachine = "";

  // dữ liệu bắt đầu từ dòng 7 (index 6)
  for (let i = 6; i < detailData.length; i++) {
    const row = detailData[i] || [];
    const colA = (row[0] ?? "").toString().trim();
    const colB = (row[1] ?? "").toString().trim();

    // 1) KIỂM TRA ĐIỀU KIỆN DỪNG (2 dòng liên tiếp rỗng)
    // ======================================================
    if (!colA && !colB) {
      const nextRow = detailData[i + 1] || [];
      const nextA = (nextRow[0] ?? "").toString().trim();
      const nextB = (nextRow[1] ?? "").toString().trim();

      // Nếu cả dòng i và dòng i+1 đều rỗng → kết thúc dữ liệu
      if (!nextA && !nextB) {
        break;
      }

      // Nếu chỉ dòng i rỗng → bỏ qua và tiếp tục
      continue;
    }




    // 1) Dòng BN: MãBN-TênBN
    if (
      colA.includes("-") &&
      !/^\d{4}-\d{2}-\d{2}$/.test(colA) && // không phải ngày
      !/^\d+(\.\d+)?$/.test(colA) // không phải số thứ tự
    ) {
      const idx = colA.indexOf("-");
      currentPatientId = colA.slice(0, idx).trim();
      currentPatientName = colA.slice(idx + 1).trim();
      currentDate = "";
      currentMachine = "";
      continue;
    }

    // 2) Dòng ngày: yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(colA)) {
      currentDate = colA;
      currentMachine = "";
      continue;
    }

    // 3) Dòng máy: colA có, colB trống
    if (colA && !colB) {
      currentMachine = colA;
      continue;
    }

    // 4) Dòng phẫu thuật: colB có tên kỹ thuật
    if (colB && currentPatientId && currentDate) {
      const surgeryName = colB;
      const key =
        currentPatientId +
        "-" +
        currentPatientName +
        "-" +
        currentDate +
        "-" +
        surgeryName;
      map.set(key, currentMachine || "");
      continue;
    }
  }

  return map;
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
  machineMap: Map<string, string>
): SurgeryRecord[] {
  const records: SurgeryRecord[] = [];

  let sttCounter = 1;
  for (let i = 8; i < listData.length; i++) {
    const row = listData[i] || [];
    const rawStt = row[0];

    // Detect end of data - still use first column but ignore value
    if (rawStt === null || rawStt === undefined || String(rawStt).trim() === "") break;
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

    // 🔥 KEY MỚI KHỚP 100% VỚI DS_MA_MAY
    const key = `${maBN}-${name}-${dateKey}-${tenKT}`;

    const machine = machineMap.get(key) || "";

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
      machine,
      start: startDate,
      end: endDate,
      key,
    });
  }

  return records;
}


// ────────────── 4. Hàm chính: đọc file, xử lý, tạo workbook ──────────────

import { AppConfig } from "../contexts/ConfigContext";

export async function processSurgicalFiles(
  surgicalListFile: File | null,
  surgicalDetailFile: File | null,
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

  let detailData: any[][] | null = null;
  if (surgicalDetailFile) {
    // 2. Đọc file Chi tiết PT
    const detailBuffer = await surgicalDetailFile.arrayBuffer();
    const detailWorkbook = XLSX.read(detailBuffer);
    const detailSheet = detailWorkbook.Sheets[detailWorkbook.SheetNames[0]];
    detailData = XLSX.utils.sheet_to_json(detailSheet, {
      header: 1,
    }) as any[][];

    const detailError = validateDetailFileFormat(detailData);
    if (detailError) throw new Error(detailError);
  }

  // Extract date range from A5 of list file (index 4)
  const listDateRange = String(listData?.[4]?.[0] ?? "").trim();
  if (!listDateRange) {
    throw new Error("Không tìm thấy thông tin thời gian trong file Danh sách PT.");
  }

  // Extract dateRangeText for display
  const dateRangeText = listDateRange;

  if (surgicalDetailFile && detailData) {
    const detailDateRange = String(detailData?.[2]?.[0] ?? "").trim();
    if (!detailDateRange) {
      throw new Error("Không tìm thấy thông tin thời gian trong file Chi tiết PT.");
    }

    if (listDateRange !== detailDateRange) {
      throw new Error(`Thời gian của 2 file không khớp nhau:\n- Danh sách PT: "${listDateRange}"\n- Chi tiết PT: "${detailDateRange}"\n\nVui lòng xuất lại 2 file với cùng khoảng thời gian.`);
    }
  }

  // 3. Tạo map KEY → Máy
  const machineMap = detailData ? buildMachineMap(detailData) : new Map<string, string>();

  // 3b. Extract Staff Info from Detail File (to populate TaxID/Dept)
  let extractedStaff: any[] = [];
  if (detailData) {
    extractedStaff = extractStaffFromDetail(detailData);
    console.log("Extracted Staff:", extractedStaff.length);
  }

  // Merge extracted staff into config for this session
  const sessionConfig = { ...config };
  if (extractedStaff.length > 0) {
    // Create a map of existing staff for quick lookup
    const existingMap = new Map(config.staffList.map(s => [`${s.name}-${s.position}`, s]));

    extractedStaff.forEach(s => {
      const key = `${s.name}-${s.position}`;
      if (!existingMap.has(key)) {
        // Add new
        sessionConfig.staffList = [...sessionConfig.staffList, s];
        existingMap.set(key, s);
      } else {
        // Update missing info (taxId/dept) if existing entry lacks it
        const existing = existingMap.get(key)!;
        if (!existing.taxId && s.taxId) existing.taxId = s.taxId;
        if (!existing.department && s.department) existing.department = s.department;
      }
    });
  }

  // 4. Xử lý danh sách PT thành records chuẩn
  const records = processListData(listData, machineMap);
  console.log("DEBUG records mẫu:", records.slice(0, 5));

  // 5. Phát hiện trùng & 6. Tạo báo cáo
  const result = reprocessSurgicalRecords(records, sessionConfig, dateRangeText);
  result.extractedStaff = extractedStaff;
  return result;
}

// Helper to extract staff
function extractStaffFromDetail(detailData: any[][]): any[] {
  const staffMap = new Map<string, any>();
  // Heuristic: Look for headers in first 10 rows
  let nameIdx = -1, taxIdx = -1, deptIdx = -1, roleIdx = -1;

  for (let i = 0; i < Math.min(20, detailData.length); i++) {
    const row = detailData[i] || [];
    row.forEach((cell: any, idx: number) => {
      const txt = String(cell).toLowerCase().trim();
      if (txt.includes("họ tên") || txt.includes("họ và tên")) nameIdx = idx;
      if (txt.includes("mã số thuế") || txt.includes("mst")) taxIdx = idx;
      if (txt.includes("khoa") || txt.includes("đơn vị")) deptIdx = idx;
      if (txt.includes("vai trò") || txt.includes("vị trí")) roleIdx = idx;
    });
    if (nameIdx > -1 && taxIdx > -1) break;
  }

  if (nameIdx === -1 || taxIdx === -1) {
    // Fallback: Assume fixed columns if headers not found? 
    // Or try scanning data rows for TaxID pattern?
    // Let's assume standard format if headers fail: Name often col 1 or 3, Tax col 2 or 4?
    // No, dangerous. Let's scan for TaxID pattern.
    return [];
  }

  for (const row of detailData) {
    const taxId = String(row[taxIdx] || "").trim();
    const name = String(row[nameIdx] || "").trim();
    const dept = deptIdx > -1 ? String(row[deptIdx] || "").trim() : "";
    // Basic validation: TaxID usually has digits
    if (taxId.length > 5 && /\d/.test(taxId) && name.length > 2) {
      const key = `${name}`;
      // Position is tricky. Detail file might just list them. We default to derived later or generic.
      // But reprocess uses (name + derivedPos). 
      // We'll add entry for "BS PT", "BS GMHS", "Phụ" just in case, or generic.
      // Actually, reprocess matches by Name + DerivedPos.
      // If we don't know position, we can't map exactly 1-to-1 if same name has diff roles.
      // Checks:
      ["BS PT", "BS GMHS", "Phụ"].forEach(pos => {
        const id = `${name}-${pos}`;
        if (!staffMap.has(id)) {
          staffMap.set(id, {
            id: id,
            name: name,
            taxId: taxId,
            department: dept,
            position: pos
          });
        }
      });
    }
  }
  return Array.from(staffMap.values());
}


