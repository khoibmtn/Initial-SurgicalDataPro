import * as XLSX from "xlsx";
import { ProcessingResult, SurgeryRecord, StaffConflict, MachineConflict, StaffRole } from "../types";



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

  for (let i = 8; i < listData.length; i++) {
    const row = listData[i] || [];
    const stt = row[0];

    if (stt === null || stt === undefined || String(stt).trim() === "") break;

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


// ────────────── 3. Phát hiện trùng giờ nhân viên & máy ──────────────

// (Đã chuyển StaffConflict và MachineConflict sang types.ts)

function detectStaffConflicts(records: SurgeryRecord[]): StaffConflict[] {
  type StaffInstance = {
    name: string;
    role: StaffRole;
    rec: SurgeryRecord;
  };

  const staffMap = new Map<string, StaffInstance[]>();

  function addStaff(rec: SurgeryRecord, role: StaffRole, name: string) {
    if (!name || !rec.start || !rec.end) return;
    const key = role + "|" + name;
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

  for (const [, list] of staffMap.entries()) {
    // sắp xếp theo thời gian
    list.sort((a, b) => (a.rec.start!.getTime() - b.rec.start!.getTime()));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].rec;
        const b = list[j].rec;
        if (a.start && a.end && b.start && b.end &&
          isOverlap(a.start, a.end, b.start, b.end)) {
          conflicts.push({
            staffName: list[i].name,
            role: list[i].role,
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

  return conflicts;
}

function detectMachineConflicts(records: SurgeryRecord[]): MachineConflict[] {
  type MachineInstance = { machine: string; rec: SurgeryRecord };
  const machineMap = new Map<string, MachineInstance[]>();

  for (const rec of records) {
    if (!rec.machine || !rec.start || !rec.end) continue;
    const key = rec.machine;
    if (!machineMap.has(key)) machineMap.set(key, []);
    machineMap.get(key)!.push({ machine: rec.machine, rec });
  }

  const conflicts: MachineConflict[] = [];

  for (const [, list] of machineMap.entries()) {
    list.sort((a, b) => (a.rec.start!.getTime() - b.rec.start!.getTime()));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].rec;
        const b = list[j].rec;
        if (a.start && a.end && b.start && b.end &&
          isOverlap(a.start, a.end, b.start, b.end)) {
          conflicts.push({
            machine: list[i].machine,
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

  return conflicts;
}
// ===== CẤU HÌNH THANH TOÁN =====
const LOAI_PT = ["ĐB", "1", "2", "3"] as const;
const LOAI_TT = ["ĐB", "1", "2", "3", "KPL"] as const;

const PT_KEYS = LOAI_PT.map(l => `PT_${l}`);
const TT_KEYS = LOAI_TT.map(l => `TT_${l}`);
const ALL_COL_KEYS = [...PT_KEYS, ...TT_KEYS];

interface ThanhToanRow {
  role: string;                    // PTV CHÍNH, PTV PHỤ, BS GMHS...
  name: string;                    // tên nhân viên
  values: Record<string, number>;  // PT_ĐB, PT_1..., TT_ĐB...
}

// Chuẩn hoá chuỗi loại PT/TT về "ĐB", "1", "2", "3", "KPL"
function normalizeLoaiPT(raw: any): "" | "ĐB" | "1" | "2" | "3" {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return "";

  if (s === "đb" || s.includes("đặc")) return "ĐB";
  if (s === "1" || s.includes("1")) return "1";
  if (s === "2" || s.includes("2")) return "2";
  if (s === "3" || s.includes("3")) return "3";

  return ""; // không map được
}

function normalizeLoaiTT(raw: any): "" | "ĐB" | "1" | "2" | "3" | "KPL" {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return "";

  if (s === "đb" || s.includes("đặc")) return "ĐB";
  if (s === "1" || s.includes("1")) return "1";
  if (s === "2" || s.includes("2")) return "2";
  if (s === "3" || s.includes("3")) return "3";
  if (s === "kpl" || s.includes("kpl")) return "KPL";

  return "";
}


// ────────────── 4. Hàm chính: đọc file, xử lý, tạo workbook ──────────────

import { AppConfig } from "../contexts/ConfigContext";

export async function processSurgicalFiles(
  surgicalListFile: File,
  surgicalDetailFile: File,
  config: AppConfig
): Promise<ProcessingResult> {

  console.log(">>> BẮT ĐẦU XỬ LÝ EXCEL <<<");

  // 1. Đọc file Danh sách PT
  const listBuffer = await surgicalListFile.arrayBuffer();
  const listWorkbook = XLSX.read(listBuffer);
  const listSheet = listWorkbook.Sheets[listWorkbook.SheetNames[0]];
  const listData: any[][] = XLSX.utils.sheet_to_json(listSheet, {
    header: 1,
  }) as any[][];

  // 2. Đọc file Chi tiết PT
  const detailBuffer = await surgicalDetailFile.arrayBuffer();
  const detailWorkbook = XLSX.read(detailBuffer);
  const detailSheet = detailWorkbook.Sheets[detailWorkbook.SheetNames[0]];
  const detailData: any[][] = XLSX.utils.sheet_to_json(detailSheet, {
    header: 1,
  }) as any[][];


  const listError = validateListFileFormat(listData);
  if (listError) throw new Error(listError);

  const detailError = validateDetailFileFormat(detailData);
  if (detailError) throw new Error(detailError);

  // Validate date range matching: A5 of list file (index 4) should match A3 of detail file (index 2)
  const listDateRange = String(listData?.[4]?.[0] ?? "").trim();
  const detailDateRange = String(detailData?.[2]?.[0] ?? "").trim();

  if (!listDateRange || !detailDateRange) {
    throw new Error("Không tìm thấy thông tin thời gian trong file. Vui lòng kiểm tra lại định dạng file.");
  }

  if (listDateRange !== detailDateRange) {
    throw new Error(`Thời gian của 2 file không khớp nhau:\n- Danh sách PT: "${listDateRange}"\n- Chi tiết PT: "${detailDateRange}"\n\nVui lòng xuất lại 2 file với cùng khoảng thời gian.`);
  }

  // Extract dateRangeText for display
  const dateRangeText = listDateRange;

  // 3. Tạo map KEY → Máy
  const machineMap = buildMachineMap(detailData);

  // 4. Xử lý danh sách PT thành records chuẩn
  const records = processListData(listData, machineMap);
  console.log("DEBUG records mẫu:", records.slice(0, 5));

  // 5. Phát hiện trùng
  const staffConflicts = detectStaffConflicts(records);
  const machineConflicts = detectMachineConflicts(records);
  const missingMachine = records.filter((r) => {
    // Nếu có mã máy thì OK
    if (r.machine) return false;

    // Nếu không có mã máy, kiểm tra xem có được cấu hình "Không cần máy" không (theo config mới)
    // config.ignoredMachineNames chứa danh sách Tên được đánh dấu
    if (config.ignoredMachineNames && config.ignoredMachineNames.includes(r.tenKT)) {
      return false; // Bỏ qua, không coi là lỗi thiếu máy
    }

    return true; // Vẫn tính là lỗi thiếu máy
  });

  // 6. Tạo workbook kết quả
  const wb = XLSX.utils.book_new();

  // 6.1. Sheet BANG_KET_QUA
  // Quy định thời gian tối thiểu của từng loại PTTT -> Lấy từ CONFIG
  const timeRules = config.timeRules;

  const mainSheetData: any[][] = [
    [
      "STT",
      "Mã BN",
      "Họ tên",
      "Giới",
      "Năm sinh",
      "Thẻ BHYT",
      "Ngày CĐ",
      "Ngày BĐ",
      "Ngày KT",
      "Tên kỹ thuật",
      "Loại PTTT",
      "Số lượng",
      "Thời gian (phút)",
      "PT Chính",
      "PT Phụ",
      "BS GM",
      "KTV GM",
      "TDC",
      "GV",
      "Mã máy",
      "Thời gian tối thiểu",
    ],
    ...records.map((r) => {
      const minTime = timeRules[r.loaiPTTT]?.min ?? 0;
      const actual = r.timeMinutes;

      // nếu vi phạm thời gian tối thiểu → ghi lý do
      let reason = "";
      if (actual < minTime) {
        reason = `Thời gian PT < tối thiểu (${minTime} phút)`;
      }
      return [
        r.stt,
        r.patientId,
        r.patientName,
        r.gender,
        r.yob,
        r.bhyt,
        r.ngayCD,
        r.ngayBD,
        r.ngayKT,
        r.tenKT,
        r.loaiPTTT,
        r.soLuong,
        r.timeMinutes,
        r.ptChinh,
        r.ptPhu,
        r.bsGM,
        r.ktvGM,
        r.tdc,
        r.gv,
        r.machine,
        reason
      ]
    }),
  ];

  const wsMain = XLSX.utils.aoa_to_sheet([]);

  // ================= TIÊU ĐỀ ĐẦU TRANG =================

  // C1
  XLSX.utils.sheet_add_aoa(wsMain, [["SỞ Y TẾ HẢI PHÒNG"]], { origin: "C1" });
  wsMain["C1"].s = {
    font: { bold: true },
    alignment: { horizontal: "center", vertical: "center", wrapText: false }
  };

  // C2
  XLSX.utils.sheet_add_aoa(wsMain, [["BỆNH VIỆN ĐA KHOA THUỶ NGUYÊN"]], { origin: "C2" });
  wsMain["C2"].s = {
    font: { bold: true },
    alignment: { horizontal: "center", vertical: "center", wrapText: false }
  };

  // J3
  XLSX.utils.sheet_add_aoa(wsMain, [["DANH SÁCH PHẪU THUẬT"]], { origin: "J3" });
  wsMain["J3"].s = {
    font: { bold: true },
    alignment: { horizontal: "center", vertical: "center", wrapText: false }
  };

  // J5 lấy từ A5 file danh sách PT
  const timeExtract = listData?.[4]?.[0] ?? "";
  XLSX.utils.sheet_add_aoa(wsMain, [[timeExtract]], { origin: "J5" });
  wsMain["J5"].s = {
    alignment: { horizontal: "center", vertical: "center", wrapText: false }
  };


  // ================= BẢNG DỮ LIỆU =================

  // Header tại dòng 7
  XLSX.utils.sheet_add_aoa(wsMain, mainSheetData, { origin: "A7" });

  // Xác định dòng cuối
  const startRow = 7;
  const totalRows = mainSheetData.length;
  const endRow = startRow + totalRows - 1;

  // Áp style cho toàn bảng
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
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" }
        }
      };
    }
  }

  // ================= HÀNG CHỮ KÝ =================

  const signRow = endRow + 2;

  XLSX.utils.sheet_add_aoa(wsMain, [["GIÁM ĐỐC"]], { origin: `C${signRow}` });
  XLSX.utils.sheet_add_aoa(wsMain, [["TCKT"]], { origin: `G${signRow}` });
  XLSX.utils.sheet_add_aoa(wsMain, [["KHTH"]], { origin: `J${signRow}` });
  XLSX.utils.sheet_add_aoa(wsMain, [["TRƯỞNG KHOA"]], { origin: `P${signRow}` });
  XLSX.utils.sheet_add_aoa(wsMain, [["NGƯỜI LẬP"]], { origin: `S${signRow}` });

  ["C", "G", "J", "P", "S"].forEach(col => {
    const cell = `${col}${signRow}`;
    wsMain[cell].s = {
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: false }
    };
  });

  // ================= ĐỘ RỘNG CỘT =================

  wsMain["!cols"] = [
    { wch: 7.3 },  // A
    { wch: 12 },   // B
    { wch: 25 },   // C
    { wch: 9 },    // D
    { wch: 9 },    // E
    { wch: 20 },   // F
    { wch: 17 },   // G
    { wch: 17 },   // H
    { wch: 17 },   // I
    { wch: 30 },   // J
    { wch: 10 },   // K
    { wch: 10 },   // L
    { wch: 7 },    // M
    { wch: 10 },   // N
    { wch: 20 },   // O
    { wch: 20 },   // P
    { wch: 20 },   // Q
    { wch: 20 },   // R
    { wch: 20 },   // S
    { wch: 15 },   // T
    { wch: 25 },   // U
  ];


  XLSX.utils.book_append_sheet(wb, wsMain, "BANG_KET_QUA");


  // 6.2. Sheet TRUNG_GIO_NHAN_VIEN
  const staffSheetData: any[][] = [
    [
      "Nhân viên",
      "Vai trò",
      "Mã BN 1",
      "Tên BN 1",
      "Tên KT 1",
      "BĐ 1",
      "KT 1",
      "PT Phụ 1",
      "TDC 1",
      "BS GM 1",
      "Mã BN 2",
      "Tên BN 2",
      "Tên KT 2",
      "BĐ 2",
      "KT 2",
      "PT Phụ 2",
      "TDC 2",
      "BS GM 2",
    ],
    ...staffConflicts.map((c) => [
      c.staffName,
      c.role,

      c.patientId1,
      c.patientName1,
      c.tenKT1,
      c.start1,
      c.end1,
      c.rec1.ptPhu,
      c.rec1.tdc,
      c.rec1.bsGM,

      c.patientId2,
      c.patientName2,
      c.tenKT2,
      c.start2,
      c.end2,
      c.rec2.ptPhu,
      c.rec2.tdc,
      c.rec2.bsGM,
    ]),
  ];
  const wsStaff = XLSX.utils.aoa_to_sheet(staffSheetData);
  // helper: tìm index của header (so sánh không phân biệt hoa thường, bỏ khoảng trắng thừa)
  function findHeaderIndexes(headerRow: any[], names: string[]) {
    const row = headerRow.map((h: any) => (h ?? "").toString().trim().toLowerCase());
    const res: number[] = [];
    for (const name of names) {
      const idx = row.indexOf(name.toLowerCase());
      res.push(idx); // -1 nếu không tìm thấy
    }
    return res;
  }

  // helper: áp định dạng ngày-giờ cho một mảng cột (indexes), bắt đầu từ dataRow (0-based)
  function applyDateFormatToColsByIndex(ws: XLSX.WorkSheet, colIndexes: number[], startRow = 1, maxRows = 5000) {
    for (let r = startRow; r < startRow + maxRows; r++) {
      for (const c of colIndexes) {
        if (c < 0) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) continue;
        // nếu là numeric (Excel stores dates as numbers) hoặc kiểu date
        if (cell.t === 'n' || cell.t === 'd') {
          cell.z = 'dd/mm/yyyy hh:mm';
        } else if (cell.t === 's') {
          // nếu là string nhưng có thể parse sang Date, chuyển thành số ngày của Excel
          const s = (cell.v ?? '').toString().trim();
          const parsed = new Date(s);
          if (!isNaN(parsed.getTime())) {
            // chuyển Date -> Excel serial (XLSX stores as number of days since 1899-12-31)
            const excelDate = (parsed.getTime() - new Date(Date.UTC(1899, 11, 30)).getTime()) / (24 * 3600 * 1000);
            cell.t = 'n';
            cell.v = excelDate;
            cell.z = 'dd/mm/yyyy hh:mm';
          }
        }
      }
    }
  }
  // tìm header (hàng 0 của staffSheetData)
  const staffheader = staffSheetData[0] || [];

  // tên cột bạn cần tìm (trùng chính xác tên header trong sheet)
  const names = ['BĐ 1', 'KT 1', 'BĐ 2', 'KT 2'];
  const [bd1Idx, kt1Idx, bd2Idx, kt2Idx] = findHeaderIndexes(staffheader, names);

  // áp định dạng cho các cột tìm được
  applyDateFormatToColsByIndex(wsStaff, [bd1Idx, kt1Idx, bd2Idx, kt2Idx], 1, staffSheetData.length + 5);


  XLSX.utils.book_append_sheet(wb, wsStaff, "TRUNG_GIO_NHAN_VIEN");

  // 6.3. Sheet TRUNG_GIO_MAY
  const machineSheetData: any[][] = [
    [
      "Mã máy",
      "Mã BN 1",
      "Tên BN 1",
      "Tên KT 1",
      "BĐ 1",
      "KT 1",
      "PT Phụ 1",
      "TDC 1",
      "BS GM 1",
      "Mã BN 2",
      "Tên BN 2",
      "Tên KT 2",
      "BĐ 2",
      "KT 2",
      "PT Phụ 2",
      "TDC 2",
      "BS GM 2",
    ],
    ...machineConflicts.map((c) => [
      c.machine,
      c.patientId1,
      c.patientName1,
      c.tenKT1,
      c.start1,
      c.end1,
      c.rec1.ptPhu,
      c.rec1.tdc,
      c.rec1.bsGM,
      c.patientId2,
      c.patientName2,
      c.tenKT2,
      c.start2,
      c.end2,
      c.rec2.ptPhu,
      c.rec2.tdc,
      c.rec2.bsGM,
    ]),
  ];
  const wsMachine = XLSX.utils.aoa_to_sheet(machineSheetData);
  const headerM = machineSheetData[0] || [];
  const [m_bd1, m_kt1, m_bd2, m_kt2] = findHeaderIndexes(headerM, ['BĐ 1', 'KT 1', 'BĐ 2', 'KT 2']);
  applyDateFormatToColsByIndex(wsMachine, [m_bd1, m_kt1, m_bd2, m_kt2], 1, machineSheetData.length + 5);

  XLSX.utils.book_append_sheet(wb, wsMachine, "TRUNG_GIO_MAY");

  // 6.4. Sheet THIEU_MA_MAY
  const missingSheetData: any[][] = [
    ["STT", "Mã BN", "Họ tên", "Ngày BĐ", "Tên kỹ thuật"],
    ...missingMachine.map((r) => [
      r.stt,
      r.patientId,
      r.patientName,
      r.ngayBD,
      r.tenKT,
    ]),
  ];
  const wsMissing = XLSX.utils.aoa_to_sheet(missingSheetData);
  XLSX.utils.book_append_sheet(wb, wsMissing, "THIEU_MA_MAY");



  // ================== BANG_THANH_TOAN (PHIÊN BẢN XÓA CỘT RỖNG) ==================

  const LOAI = ["PĐB", "P1", "P2", "P3", "TĐB", "T1", "T2", "T3", "TKPL"];
  const VAITRO = ["Chính", "Phụ", "Giúp việc"];

  // --- Thứ tự ưu tiên vai trò ---
  const ROLE_ORDER: Record<string, number> = {
    "PT Chính": 1,
    "PT Phụ": 2,
    "BS GM": 3,
    "KTV GM": 4,
    "TDC": 5,
    "GV": 6
  };

  const staffOrder = new Map<string, number>();
  let globalOrderCounter = 1;
  function registerStaffAppearance(name: string | undefined, roleLabel: string) {
    if (!name) return;
    if (!staffOrder.has(name)) {
      const base = (ROLE_ORDER[roleLabel] || 99) * 100000;
      staffOrder.set(name, base + globalOrderCounter);
      globalOrderCounter++;
    }
  }

  // --- GOM DỮ LIỆU NHÂN VIÊN ---
  function collectThanhToanData_New(records: SurgeryRecord[]) {
    const map = new Map<string, Record<string, number>>();

    function add(name: string | undefined, role: string, loai: string, sl: number, roleLabel: string) {
      if (!name || !loai) return;
      registerStaffAppearance(name, roleLabel);
      if (!map.has(name)) map.set(name, {});
      const bucket = map.get(name)!;
      const key = `${loai}-${role}`;
      bucket[key] = (bucket[key] || 0) + (Number(sl) || 0);
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
      .map(([name, values]) => ({ name, values, order: staffOrder.get(name) ?? 999999 }))
      .sort((a, b) => a.order - b.order);
  }

  // --- Tạo danh sách cột ---
  const COLS: string[] = [];
  for (const loai of LOAI) for (const v of VAITRO) COLS.push(`${loai}-${v}`);

  // ----------------------------------------------------------
  // BẮT ĐẦU TẠO SHEET
  // ----------------------------------------------------------
  let ws = XLSX.utils.aoa_to_sheet([]);
  const rowStart = 7; // Header row 1 (merged groups)
  // Header row 2 (roles) will be at rowStart + 1 = 8
  // Đơn giá row will be at rowStart + 2 = 9
  // Data starts at rowStart + 3 = 10

  // ban đầu tạo header với toàn bộ COLS (sẽ rút gọn sau khi xóa)
  const headerFull = ["STT", "HỌ TÊN", ...COLS];
  XLSX.utils.sheet_add_aoa(ws, [headerFull], { origin: `A${rowStart}` });

  // ===== Ghi dữ liệu nhân viên (KHÔNG ghi đơn giá lúc này) =====
  let dongGiaRow = rowStart + 2;          // vị trí dành cho đơn giá (row 9)
  const ttData = collectThanhToanData_New(records);

  let dataRow = dongGiaRow + 1;           // dữ liệu nhân viên bắt đầu từ row 10
  let stt = 1;

  // ghi các hàng nhân viên: giá trị quantities tương ứng với COLS cố định (chưa rút gọn)
  for (const it of ttData) {
    const rowVals: any[] = [stt++, it.name];
    for (const colKey of COLS) rowVals.push(it.values[colKey] ?? 0);
    // không ghi cột TỔNG bây giờ (sẽ thêm sau)
    XLSX.utils.sheet_add_aoa(ws, [rowVals], { origin: `A${dataRow}` });
    dataRow++;
  }

  // ----------------------------------------------------------
  // === XÓA CỘT RỖNG ===
  // ----------------------------------------------------------
  // helper: xóa 1 cột (colIndex là số cột 0-based)
  function deleteCol(ws: XLSX.WorkSheet, colIndex: number) {
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = colIndex; C < range.e.c; ++C) {
        const from = XLSX.utils.encode_cell({ r: R, c: C + 1 });
        const to = XLSX.utils.encode_cell({ r: R, c: C });
        ws[to] = ws[from];
      }
      // clear last cell in this row
      const lastAddr = XLSX.utils.encode_cell({ r: R, c: range.e.c });
      delete ws[lastAddr];
    }
    range.e.c = range.e.c - 1;
    ws["!ref"] = XLSX.utils.encode_range(range);
  }

  // Tính tổng theo COLS trước khi xóa để quyết định cột nào giữ
  const totalsByCol: number[] = COLS.map((colKey, idx) => {
    return ttData.reduce((s, it) => s + (it.values[colKey] ?? 0), 0);
  });

  // Xóa từ phải sang trái (bắt đầu từ cột cuối của COLS)
  // Lưu ý: trong sheet chúng ta có cột A,B trước; COLS bắt đầu ở index 2 (0-based)
  for (let i = COLS.length - 1; i >= 0; i--) {
    const total = totalsByCol[i];
    if (total === 0) {
      // colIndex sheet (0-based) = 2 + i
      deleteCol(ws, 2 + i);
    }
  }

  // Sau khi xóa xong, tạo mảng COLS_RUTGON chỉ chứa các cột có tổng > 0
  // Thay vì đọc lại từ worksheet (không đáng tin cậy), ta tạo trực tiếp từ totalsByCol
  const COLS_RUTGON: string[] = [];
  for (let i = 0; i < COLS.length; i++) {
    if (totalsByCol[i] > 0) {
      COLS_RUTGON.push(COLS[i]);
    }
  }

  // ----------------------------------------------------------
  // === SAU KHI XÓA: GHI LẠI HÀNG TIÊU ĐỀ 2 CẤP ===
  // ----------------------------------------------------------

  // 1. Chuẩn bị định nghĩa nhóm
  const GROUP_MAP: Record<string, string> = {
    "PĐB": "Phẫu thuật ĐB", "P1": "Phẫu thuật loại 1", "P2": "Phẫu thuật loại 2", "P3": "Phẫu thuật loại 3",
    "TĐB": "Thủ thuật ĐB", "T1": "Thủ thuật loại 1", "T2": "Thủ thuật loại 2", "T3": "Thủ thuật loại 3", "TKPL": "Thủ thuật KPL"
  };

  // 2. Phân tích COLS_RUTGON để xây dựng cấu trúc Header
  // colsStructure: mảng các nhóm, mỗi nhóm chứa { title, colspan, startColIndex }
  // Đồng thời chuẩn bị mảng roleHeaders cho hàng 2

  const roleHeaders: string[] = ["STT", "HỌ TÊN"];
  const topHeaders: { title: string, startCol: number, endCol: number }[] = [];

  // STT và HỌ TÊN là 2 cột đầu
  // Ta sẽ merge hàng 1 và hàng 2 cho 2 cột này sau.

  let currentGroup = "";
  let currentGroupStart = -1;
  const colOffset = 2; // Cột bắt đầu dữ liệu (sau STT, HỌ TÊN)

  for (let i = 0; i < COLS_RUTGON.length; i++) {
    const colKey = COLS_RUTGON[i];
    const [loai, role] = colKey.split("-"); // vd: PĐB-Chính

    // Header hàng 2 chỉ là Role
    roleHeaders.push(role);

    // Xử lý nhóm cho hàng 1
    if (loai !== currentGroup) {
      // Kết thúc nhóm cũ nếu có
      if (currentGroup && currentGroupStart !== -1) {
        topHeaders.push({
          title: GROUP_MAP[currentGroup] || currentGroup,
          startCol: colOffset + currentGroupStart,
          endCol: colOffset + i - 1
        });
      }
      // Bắt đầu nhóm mới
      currentGroup = loai;
      currentGroupStart = i;
    }
  }
  // Push nhóm cuối cùng
  if (currentGroup && currentGroupStart !== -1) {
    topHeaders.push({
      title: GROUP_MAP[currentGroup] || currentGroup,
      startCol: colOffset + currentGroupStart,
      endCol: colOffset + COLS_RUTGON.length - 1
    });
  }

  // 3. Ghi dữ liệu vào Sheet

  // -- Hàng 1 (Top Header) --
  // Ghi STT, HỌ TÊN vào A7, B7 (rowStart) nhưng sẽ merge với A8, B8
  ws[`A${rowStart}`] = { t: "s", v: "STT", s: { font: { bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
  ws[`B${rowStart}`] = { t: "s", v: "HỌ TÊN", s: { font: { bold: true }, alignment: { vertical: "center", horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };

  // Ghi các nhóm
  topHeaders.forEach(grp => {
    const cellAddr = XLSX.utils.encode_cell({ r: rowStart - 1, c: grp.startCol }); // rowStart is 1-based in var, but encode_cell r is 0-based. Wait. 
    // rowStart=7. API encode_cell wants 0-based row index? 
    // Yes, utils.encode_cell({r:0, c:0}) is A1.
    // My variable `rowStart` is 7 (A7). So r should be 6.

    // Tuy nhiên code cũ dùng xlsx utils aoa_to_sheet hoặc gán trực tiếp.
    // Ở dưới tôi gán trực tiếp ws[...].
    // XLSX range is 0-indexed. 
    // rowStart là biến số (7). Ghi vào excel là row 7. Index là 6.

    const rIndex = rowStart - 1; // 6
    const startC = XLSX.utils.encode_col(grp.startCol);

    // Ghi title vào ô đầu tiên của nhóm
    ws[`${startC}${rowStart}`] = {
      t: "s",
      v: grp.title,
      s: {
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center" },
        border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
      }
    };

    // Merge cells cho nhóm
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push({ s: { r: rIndex, c: grp.startCol }, e: { r: rIndex, c: grp.endCol } });
  });

  // -- Hàng 2 (Role Header) --
  // Row index = rowStart (7) -> Excel Row 8
  const contentRow = rowStart + 1;
  XLSX.utils.sheet_add_aoa(ws, [roleHeaders], { origin: `A${contentRow}` });

  // Style cho hàng roleHeaders
  for (let c = 0; c < roleHeaders.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowStart, c: c }); // r=7 -> Row 8
    if (!ws[addr]) ws[addr] = { t: 's', v: '' }; // fallback
    ws[addr].s = {
      font: { bold: true, italic: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
    };
  }

  // Merge STT và HỌ TÊN (Row 7 & 8)
  ws["!merges"].push({ s: { r: rowStart - 1, c: 0 }, e: { r: rowStart, c: 0 } }); // A7-A8
  ws["!merges"].push({ s: { r: rowStart - 1, c: 1 }, e: { r: rowStart, c: 1 } }); // B7-B8


  // 4. Ghi hàng đơn giá (dongGiaRow đã được đặt đúng = rowStart + 2 = row 9)
  // Ghi hàng đơn giá lấy trực tiếp từ config
  const PRICE_CFG = config.priceConfig;

  // Ghi header "Đơn giá" vào cột B
  ws[`B${dongGiaRow}`] = { t: "s", v: "Đơn giá", s: { font: { italic: true }, alignment: { horizontal: "right" } } };

  for (let i = 0; i < COLS_RUTGON.length; i++) {
    const colIndex = 2 + i; // zero-based index of column in sheet
    const colLetter = XLSX.utils.encode_col(colIndex);
    const [loai, role] = (COLS_RUTGON[i] || "").split("-");

    let price = 0;
    if (loai && role && PRICE_CFG[loai]) {
      price = PRICE_CFG[loai][role] || 0;
    }

    ws[`${colLetter}${dongGiaRow}`] = { t: "n", v: price, z: "#,##0" };
  }

  // ----------------------------------------------------------
  // === TẠO CỘT TỔNG (sau cột dữ liệu hiện có) và GÁN SUMPRODUCT cho từng hàng
  // ----------------------------------------------------------
  const updatedRange = XLSX.utils.decode_range(ws["!ref"]!);
  const lastDataColIndex = updatedRange.e.c;               // index (0-based) của cột cuối hiện có
  const totalColIndex = lastDataColIndex + 1;              // index cho cột TỔNG mới
  const totalColLetter = XLSX.utils.encode_col(totalColIndex);

  // Ghi header TỔNG trên cùng (rowStart)
  ws[`${totalColLetter}${rowStart}`] = { t: "s", v: "TỔNG" };

  // Ghi công thức TỔNG hàng cho từng nhân viên
  let writeRow = dongGiaRow + 1;
  const lastDataColLetter = (idx: number) => XLSX.utils.encode_col(idx);

  while (writeRow < dataRow) {
    const firstDataColLetter = XLSX.utils.encode_col(2); // C
    const lastDataColLetterStr = XLSX.utils.encode_col(lastDataColIndex);
    // SUMPRODUCT( Crow:LastDataColrow , CdongGiaRow:LastDataColdongGiaRow )
    ws[`${totalColLetter}${writeRow}`] = {
      t: "n",
      f: `SUMPRODUCT(${firstDataColLetter}${writeRow}:${lastDataColLetterStr}${writeRow},${firstDataColLetter}${dongGiaRow}:${lastDataColLetterStr}${dongGiaRow})`
    };
    writeRow++;
  }

  // ----------------------------------------------------------
  // === DÒNG TỔNG CUỐI
  // ----------------------------------------------------------
  const totalRow = dataRow;
  ws[`A${totalRow}`] = { t: "s", v: "" };
  ws[`B${totalRow}`] = { t: "s", v: "TỔNG" };

  // SUM từng cột số lượng từ dongGiaRow+1 -> dataRow -1
  for (let c = 2; c <= lastDataColIndex; c++) {
    const colL = XLSX.utils.encode_col(c);
    ws[`${colL}${totalRow}`] = {
      t: "n",
      f: `SUM(${colL}${dongGiaRow + 1}:${colL}${dataRow - 1})`
    };
  }

  // SUMPRODUCT dòng tổng
  const firstDataColLetterFinal = XLSX.utils.encode_col(2);
  const lastDataColLetterFinal = XLSX.utils.encode_col(lastDataColIndex);
  ws[`${totalColLetter}${totalRow}`] = {
    t: "n",
    f: `SUMPRODUCT(${firstDataColLetterFinal}${totalRow}:${lastDataColLetterFinal}${totalRow},${firstDataColLetterFinal}${dongGiaRow}:${lastDataColLetterFinal}${dongGiaRow})`
  };

  // Update ws['!ref'] để cover đến cột TỔNG
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRow - 1, c: totalColIndex }
  });

  // TIÊU ĐỀ PHÍA TRÊN
  XLSX.utils.sheet_add_aoa(ws, [["SỞ Y TẾ HẢI PHÒNG"]], { origin: "B1" });
  XLSX.utils.sheet_add_aoa(ws, [["BỆNH VIỆN ĐA KHOA THUỶ NGUYÊN"]], { origin: "B2" });

  const midCol = XLSX.utils.encode_col(Math.floor((totalColIndex + 1) / 2));
  XLSX.utils.sheet_add_aoa(ws, [["BẢNG THANH TOÁN PHẪU THUẬT, THỦ THUẬT"]], { origin: `${midCol}3` });
  XLSX.utils.sheet_add_aoa(ws, [[timeExtract]], { origin: `${midCol}5` });

  // Append sheet vào workbook
  XLSX.utils.book_append_sheet(wb, ws, "BANG_THANH_TOAN");







  // 6.5. Sheet DS_MA_MAY (xuất từ CHI TIẾT PHẪU THUẬT THEO KHOA)

  const machineListData: any[][] = [
    ["Mã BN", "Tên bệnh nhân", "Ngày phẫu thuật", "Mã máy", "Tên phẫu thuật"]
  ];

  for (const [key, machine] of machineMap.entries()) {
    const parts = key.split("-");
    const patientId = parts[0] || "";
    const patientName = parts[1] || "";

    // Nếu parts[2..4] là yyyy, mm, dd thì ghép lại
    let date = "";
    let surgery = "";
    if (parts.length >= 5 && /^\d{4}$/.test(parts[2]) && /^\d{1,2}$/.test(parts[3]) && /^\d{1,2}$/.test(parts[4])) {
      const yyyy = parts[2];
      const mm = parts[3].padStart(2, "0");
      const dd = parts[4].padStart(2, "0");
      date = `${yyyy}-${mm}-${dd}`;
      surgery = parts.slice(5).join("-"); // phần còn lại là tên PT
    } else {
      // fallback: cũ
      date = parts[2] || "";
      surgery = parts.slice(3).join("-") || "";
    }

    machineListData.push([patientId, patientName, date, machine, surgery]);
  }
  const wsMachineList = XLSX.utils.aoa_to_sheet(machineListData);
  XLSX.utils.book_append_sheet(wb, wsMachineList, "DS_MA_MAY");


  // (Đã xóa logic tạo sheet CAU_HINH theo yêu cầu)




  // 7. (ĐÃ CẬP NHẬT) Trả về workbook để App.tsx xử lý download (tránh lỗi filename và memory leak)
  // const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  // const blob = ...
  // const downloadUrl = ...

  const totalDurationMinutes = records.reduce(
    (sum, r) => sum + r.timeMinutes,
    0
  );

  function toConflictFormat(
    staffConflicts: StaffConflict[],
    machineConflicts: MachineConflict[]
  ) {
    const result: any[] = [];

    for (const c of staffConflicts) {
      const overlapMinutes =
        Math.min(c.end1.getTime(), c.end2.getTime()) -
        Math.max(c.start1.getTime(), c.start2.getTime());

      result.push({
        id: crypto.randomUUID(),
        resourceName: c.staffName,
        type: "STAFF",
        surgeryA: c.tenKT1,
        surgeryB: c.tenKT2,
        startTimeA: c.start1,
        endTimeA: c.end1,
        startTimeB: c.start2,
        endTimeB: c.end2,
        durationOverlap: Math.round(overlapMinutes / 60000),
      });
    }

    for (const c of machineConflicts) {
      const overlapMinutes =
        Math.min(c.end1.getTime(), c.end2.getTime()) -
        Math.max(c.start1.getTime(), c.start2.getTime());

      result.push({
        id: crypto.randomUUID(),
        resourceName: c.machine,
        type: "MACHINE",
        surgeryA: c.tenKT1,
        surgeryB: c.tenKT2,
        startTimeA: c.start1,
        endTimeA: c.end1,
        startTimeB: c.start2,
        endTimeB: c.end2,
        durationOverlap: Math.round(overlapMinutes / 60000),
      });
    }

    return result;
  }

  // ... (logic tính tiền ...)
  // ===== TÍNH TỔNG TIỀN CHO UI =====
  let totalPayment = 0;

  // Config giá lấy từ tham số config
  const PRICE_CONFIG = config.priceConfig;

  // Duyệt qua ttData (đã gom theo staff/role/loai)
  for (const item of ttData) {
    for (const colKey of Object.keys(item.values)) {
      const qty = item.values[colKey] || 0;
      if (qty > 0) {
        const [loai, role] = colKey.split("-");

        let configRole: any = "Giúp việc";
        if (role === "Chính") configRole = "Chính";
        else if (role === "Phụ") configRole = "Phụ";
        else if (role === "Giúp việc") configRole = "Giúp việc";

        const typeConfig = PRICE_CONFIG[loai];
        const price = (typeConfig && typeConfig[configRole]) ? typeConfig[configRole] : 20000;

        totalPayment += qty * price;
      }
    }
  }


  const lowPaymentCount = records.filter(r => r.soLuong < 1).length;

  return {
    success: true,
    message: "Đã xử lý xong dữ liệu phẫu thuật.",
    wb: wb,
    stats: {
      totalSurgeries: records.length,
      totalDurationMinutes: records.reduce((acc, r) => acc + r.timeMinutes, 0),
      staffConflicts: staffConflicts.length,
      machineConflicts: machineConflicts.length,
      missingMachines: missingMachine.length,
      lowPaymentCount: lowPaymentCount
    },
    paymentStats: {
      totalAmount: totalPayment
    },
    conflicts: toConflictFormat(staffConflicts, machineConflicts),

    // New Raw Data for UI Tables
    validRecords: records,
    staffConflicts: staffConflicts,
    machineConflicts: machineConflicts,
    missingRecords: missingMachine,
    paymentData: {
      columns: COLS_RUTGON,
      rows: ttData.map(item => ({
        name: item.name,
        values: item.values,
        total: COLS_RUTGON.reduce((sum, col) => sum + (item.values[col] || 0), 0)
      }))
    },
    dateRangeText: dateRangeText
  };


}
