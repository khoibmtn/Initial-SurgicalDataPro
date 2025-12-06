import * as XLSX from "xlsx";
import { ProcessingResult } from "../types";



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
  return aStart < bEnd && bStart < aEnd;
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

type StaffRole = "PT_CHINH" | "PT_PHU" | "BS_GM" | "KTV_GM" | "TDC" | "GV";

interface SurgeryRecord {
  stt: any;
  patientId: string;
  patientName: string;
  gender: string;
  yob: string;
  bhyt: string;
  ngayCD: string;
  ngayBD: string;
  ngayKT: string;
  tenKT: string;
  loaiPT: string;
  loaiTT: string;
  soLuong: number;
  timeMinutes: number;
  ptChinh: string;
  ptPhu: string;
  bsGM: string;
  ktvGM: string;
  tdc: string;
  gv: string;
  machine: string;
  start: Date | null;
  end: Date | null;
}

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

    const loaiPT = determineLoaiPT(row);
    const loaiTT = determineLoaiTT(row);

    const soLuongRaw = (tyLe / 100) * sl;
    const soLuong = Math.round(soLuongRaw * 100) / 100;

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
      loaiPT,
      loaiTT,
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

interface StaffConflict {
  staffName: string;
  role: StaffRole;
  patientId1: string;
  patientName1: string;
  tenKT1: string;
  start1: Date;
  end1: Date;
  patientId2: string;
  patientName2: string;
  tenKT2: string;
  start2: Date;
  end2: Date;
}

interface MachineConflict {
  machine: string;
  patientId1: string;
  patientName1: string;
  tenKT1: string;
  start1: Date;
  end1: Date;
  patientId2: string;
  patientName2: string;
  tenKT2: string;
  start2: Date;
  end2: Date;
}

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

  function collectThanhToanData_PTV_CHINH(records: SurgeryRecord[]) {
  const map = new Map<string, Record<string, number>>();

  for (const r of records) {
    const name = r.ptChinh?.trim();
    if (!name) continue;

    if (!map.has(name)) {
      map.set(name, {
        PT_ĐB: 0,
        PT_1: 0,
        PT_2: 0,
        PT_3: 0
      });
    }

    const bucket = map.get(name)!;

    if (r.loaiPT === "ĐB") bucket.PT_ĐB += r.soLuong;
    if (r.loaiPT === "1") bucket.PT_1 += r.soLuong;
    if (r.loaiPT === "2") bucket.PT_2 += r.soLuong;
    if (r.loaiPT === "3") bucket.PT_3 += r.soLuong;
  }

  return Array.from(map.entries()).map(([name, values], idx) => ({
    stt: idx + 1,
    name,
    values
  }));
}




// ────────────── 4. Hàm chính: đọc file, xử lý, tạo workbook ──────────────

export async function processSurgicalFiles(
  surgicalListFile: File,
  surgicalDetailFile: File
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


  // 3. Tạo map KEY → Máy
  const machineMap = buildMachineMap(detailData);

  // 4. Xử lý danh sách PT thành records chuẩn
  const records = processListData(listData, machineMap);
  console.log("DEBUG records mẫu:", records.slice(0, 5));

  // 5. Phát hiện trùng
  const staffConflicts = detectStaffConflicts(records);
  const machineConflicts = detectMachineConflicts(records);
  const missingMachine = records.filter((r) => !r.machine);

  // 6. Tạo workbook kết quả
  const wb = XLSX.utils.book_new();

  // 6.1. Sheet BANG_KET_QUA
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
      "Loại Phẫu thuật",
      "Loại Thủ thuật",
      "Số lượng",
      "Thời gian (phút)",
      "PT Chính",
      "PT Phụ",
      "BS GM",
      "KTV GM",
      "TDC",
      "GV",
      "Mã máy",
      "key",
    ],
    ...records.map((r) => [
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
      r.loaiPT,
      r.loaiTT,
      r.soLuong,
      r.timeMinutes,
      r.ptChinh,
      r.ptPhu,
      r.bsGM,
      r.ktvGM,
      r.tdc,
      r.gv,
      r.machine,
      r.key
    ]),
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
      "Mã BN 2",
      "Tên BN 2",
      "Tên KT 2",
      "BĐ 2",
      "KT 2",
    ],
    ...staffConflicts.map((c) => [
      c.staffName,
      c.role,
      c.patientId1,
      c.patientName1,
      c.tenKT1,
      c.start1,
      c.end1,
      c.patientId2,
      c.patientName2,
      c.tenKT2,
      c.start2,
      c.end2,
    ]),
  ];
  const wsStaff = XLSX.utils.aoa_to_sheet(staffSheetData);
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
      "Mã BN 2",
      "Tên BN 2",
      "Tên KT 2",
      "BĐ 2",
      "KT 2",
    ],
    ...machineConflicts.map((c) => [
      c.machine,
      c.patientId1,
      c.patientName1,
      c.tenKT1,
      c.start1,
      c.end1,
      c.patientId2,
      c.patientName2,
      c.tenKT2,
      c.start2,
      c.end2,
    ]),
  ];
  const wsMachine = XLSX.utils.aoa_to_sheet(machineSheetData);
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

 





  

  // ================== BANG_THANH_TOAN - PHIÊN BẢN HOÀN CHỈNH 6 NHÓM ==================
  // QUY TẮC: XOÁ CỘT RỖNG -> SAU ĐÓ MỚI ĐẶT CÔNG THỨC CỘT TỔNG

  // 1. CẤU HÌNH CHUNG
  const DON_GIA_MAC_DINH = 20000;

  const ROLE_GROUPS = [
    { key: 'ptChinh', label: 'PTV CHÍNH' },
    { key: 'ptPhu',   label: 'PTV PHỤ' },
    { key: 'bsGM',    label: 'BS GMHS' },
    { key: 'ktvGM',   label: 'KTV GMHS' },
    { key: 'tdc',     label: 'TÍT DC' },
    { key: 'gv',      label: 'GIÚP VIỆC' },
  ] as const;

  const LOAI_PT = ['ĐB','1','2','3'];
  const LOAI_TT = ['ĐB','1','2','3','KPL'];

  interface ThanhToanRow {
    role: string;
    name: string;
    values: Record<string, number>;
  }

  // 2. GOM DỮ LIỆU THANH TOÁN
  function collectThanhToanData(records: SurgeryRecord[]): ThanhToanRow[] {
    const result: ThanhToanRow[] = [];

    for (const role of ROLE_GROUPS) {
      const map = new Map<string, Record<string, number>>();

      for (const r of records) {
        const staffName = (r as any)[role.key];
        if (!staffName) continue;

        if (!map.has(staffName)) {
          map.set(staffName, {});
        }

        const bucket = map.get(staffName)!;

        // PHẪU THUẬT
        if (r.loaiPT) {
          const keyPT = `PT_${r.loaiPT}`;
          bucket[keyPT] = (bucket[keyPT] || 0) + Number(r.soLuong);
        }

        // THỦ THUẬT
        if (r.loaiTT) {
          const keyTT = `TT_${r.loaiTT}`;
          bucket[keyTT] = (bucket[keyTT] || 0) + Number(r.soLuong);
        }
      }

      for (const [name, values] of map.entries()) {
        result.push({ role: role.label, name, values });
      }
    }
    return result;
  }(records: SurgeryRecord[]): ThanhToanRow[] {
    const result: ThanhToanRow[] = [];

    for (const role of ROLE_GROUPS) {
      const map = new Map<string, Record<string, number>>();

      for (const r of records) {
        const staffName = (r as any)[role.key];
        if (!staffName) continue;

        if (!map.has(staffName)) {
          map.set(staffName, {});
        }

        const bucket = map.get(staffName)!;
        if (!bucket[r.loaiPT]) bucket[r.loaiPT] = 0;
        bucket[r.loaiPT] += Number(r.soLuong);
      }

      for (const [name, values] of map.entries()) {
        result.push({ role: role.label, name, values });
      }
    }
    return result;
  }

  // 3. TẠO SHEET
  const ttData = collectThanhToanData(records);
  
  let header = [
    'STT',
    'HỌ TÊN',
    ...LOAI_PT.map(l => `PT ${l}`),
    ...LOAI_TT.map(l => `TT ${l}`)
  ]; ['STT','HỌ TÊN', ...LOAI_PT.map(l => `PT ${l}`)];




  let wsTT = XLSX.utils.aoa_to_sheet([]);
  let currentRow = 7;

  XLSX.utils.sheet_add_aoa(wsTT, [header], { origin: `A${currentRow}` });

  // 4. ĐƠN GIÁ (DÒNG 10)
  const dongGiaRow = currentRow + 3;
  for (let c = 2; c < header.length; c++) {
    const cell = XLSX.utils.encode_cell({ r: dongGiaRow - 1, c });
    wsTT[cell] = { t: 'n', v: DON_GIA_MAC_DINH };
  }

  // 5. GHI DỮ LIỆU
  const totalColIndex = header.length;
  let dataRow = currentRow + 4;
  let firstDataRow = dataRow;
  let lastRole = '';
  let stt = 1;

  for (const row of ttData) {
  if (row.role !== lastRole) {
  XLSX.utils.sheet_add_aoa(wsTT, [[row.role]], { origin: `A${dataRow}` });
  dataRow++;
  stt = 1;
  lastRole = row.role;
  }


  const rowData: any[] = [stt++, row.name];


  for (const l of LOAI_PT) rowData.push(row.values[`PT_${l}`] ?? 0);
  for (const l of LOAI_TT) rowData.push(row.values[`TT_${l}`] ?? 0);

  
  const startCol = XLSX.utils.encode_col(2);
  const endCol = XLSX.utils.encode_col(totalColIndex - 1);


  rowData.push({
  f: `SUMPRODUCT(${startCol}${dataRow}:${endCol}${dataRow},${startCol}${dongGiaRow}:${endCol}${dongGiaRow})`
  });


  XLSX.utils.sheet_add_aoa(wsTT, [rowData], { origin: `A${dataRow}` });
  dataRow++;
  }


  // 6. HÀNG TỔNG CUỐI BẢNG
  const totalRow = dataRow;
  wsTT[`A${totalRow}`] = { t: 's', v: 'TỔNG' };


  for (let c = 2; c <= totalColIndex; c++) {
  const colLetter = XLSX.utils.encode_col(c);
  wsTT[`${colLetter}${totalRow}`] = {
  f: `SUM(${colLetter}${firstDataRow}:${colLetter}${dataRow - 1})`
  };
  }


  // 7. TIÊU ĐỀ PHÍA TRÊN
  XLSX.utils.sheet_add_aoa(wsTT, [["SỞ Y TẾ HẢI PHÒNG"]], { origin: 'C1' });
  XLSX.utils.sheet_add_aoa(wsTT, [["BỆNH VIỆN ĐA KHOA THUỶ NGUYÊN"]], { origin: 'C2' });


  const midCol = XLSX.utils.encode_col(Math.floor(totalColIndex / 2));
  XLSX.utils.sheet_add_aoa(wsTT, [["BẢNG THANH TOÁN PHẪU THUẬT, THỦ THUẬT"]], { origin: `${midCol}3` });
  XLSX.utils.sheet_add_aoa(wsTT, [[timeExtract]], { origin: `${midCol}5` });


  XLSX.utils.book_append_sheet(wb, wsTT, 'BANG_THANH_TOAN');




// 6.5. Sheet DS_MA_MAY (xuất từ CHI TIẾT PHẪU THUẬT THEO KHOA)

const machineListData: any[][] = [
  ["Mã BN", "Tên bệnh nhân", "Ngày phẫu thuật", "Mã máy", "Tên phẫu thuật","key"]
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

  machineListData.push([patientId, patientName, date, machine, surgery, key]);
}


const wsMachineList = XLSX.utils.aoa_to_sheet(machineListData);
XLSX.utils.book_append_sheet(wb, wsMachineList, "DS_MA_MAY");






  // 7. Xuất workbook thành Blob + URL để tải về
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob(
    [wbout],
    {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
  );
  const downloadUrl = URL.createObjectURL(blob);

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



    return {
    success: true,
    message: "Đã xử lý xong dữ liệu phẫu thuật.",
    downloadUrl,
    stats: {
      totalSurgeries: records.length,
      totalDurationMinutes: totalDurationMinutes,
      staffConflicts: staffConflicts.length,
      machineConflicts: machineConflicts.length,
      missingMachines: missingMachine.length
    },
    conflicts: toConflictFormat(staffConflicts, machineConflicts)
  };


}
