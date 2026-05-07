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
    });
  }

  return records;
}


// ────────────── 4. Hàm chính: đọc file, xử lý, tạo workbook ──────────────

import { AppConfig } from "../contexts/ConfigContext";

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
  const records = processListData(listData, config.machineRegistry || []);
  console.log("DEBUG records mẫu:", records.slice(0, 5));

  // 3. Phát hiện trùng & tạo báo cáo
  const result = reprocessSurgicalRecords(records, config, dateRangeText);
  return result;
}
