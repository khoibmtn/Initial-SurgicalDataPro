import * as XLSX from 'xlsx';
import {
  SurgeryRecord,
  ServicePriceItem,
  PatientServicePriceGroup,
  ServicePriceParseResult,
} from '../types';

// ───────────────── Normalization Helpers ─────────────────

/**
 * Normalize Mã BHXH (Mã tương đương):
 * Lọc lấy chữ số.
 * Nếu 9 số: thêm '0' ở đầu -> 10 số.
 * Nếu 10 số: định dạng XX.XXXX.XXXX (2 số đầu . 4 số giữa . 4 số cuối).
 * Ví dụ: 1602321016 => 16.0232.1016; 305270230 => 03.0527.0230; 2701910451 => 27.0191.0451
 */
export function normalizeMaTuongDuong(raw: any): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');

  if (!digits) return s;

  let padded = digits;
  if (digits.length === 9) {
    padded = '0' + digits;
  }

  if (padded.length === 10) {
    return `${padded.slice(0, 2)}.${padded.slice(2, 6)}.${padded.slice(6)}`;
  }

  return s;
}

/**
 * Chuẩn hóa tên kỹ thuật / dịch vụ để đối soát:
 * Unicode NFKC, xóa ký tự zero-width, chuyển non-breaking space, trim, collapse whitespace, lowercase.
 */
export function normalizeForMatch(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFKC')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// ───────────────── Parsing Excel File ─────────────────

/**
 * Đọc file Excel Thống kê Dịch vụ Kỹ thuật
 * - Dòng 3 (merged A3:I3 hoặc cell E3): Khoảng thời gian lấy số liệu (Từ ngày ... đến ngày ...)
 * - Dòng header 5 và 6: STT, Mã BHXH, Mã DV, Mahh, Tên dịch vụ, Số lượng, ĐVT, Đơn giá, Thành tiền
 * - Bắt đầu từ dòng 7: Dòng BN (10 số mã KCB - Họ tên), tiếp theo là danh sách DVKT của BN đó
 */
export async function parseServicePriceExcel(file: File): Promise<ServicePriceParseResult> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { dense: true });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        valid: false,
        error: 'File Excel không có sheet dữ liệu nào.',
        patientGroups: [],
        serviceCount: 0,
        totalAmount: 0,
      };
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (!data || data.length < 7) {
      return {
        valid: false,
        error: 'File Excel không đủ dữ liệu (ít hơn 7 dòng).',
        patientGroups: [],
        serviceCount: 0,
        totalAmount: 0,
      };
    }

    // 1. Trích xuất khoảng thời gian tại dòng 3 (index 2)
    let dateRangeText = '';
    const row3 = data[2] || [];
    for (const cell of row3) {
      const s = String(cell ?? '').trim();
      if (s.toLowerCase().includes('từ ngày')) {
        dateRangeText = s;
        break;
      }
    }

    let dateFrom = '';
    let dateTo = '';
    let timeFrom = '00:00';
    let timeToStr = '23:59';

    if (dateRangeText) {
      const match = dateRangeText.match(
        /từ ngày:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?\s*đến ngày:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/i
      );
      if (match) {
        const [, d1, m1, y1, t1, d2, m2, y2, t2] = match;
        dateFrom = `${y1}-${m1}-${d1}`;
        dateTo = `${y2}-${m2}-${d2}`;
        if (t1) timeFrom = t1;
        if (t2) timeToStr = t2;
      }
    }

    // 2. Kiểm tra Header dòng 5 (index 4) hoặc dòng 6 (index 5)
    const headerRow = data[4] || [];
    const headerStr = headerRow.map((c) => String(c ?? '').toLowerCase()).join(' ');
    const hasRequiredHeader =
      headerStr.includes('bhxh') ||
      headerStr.includes('tên dịch vụ') ||
      headerStr.includes('đơn giá') ||
      headerStr.includes('thành tiền');

    if (!hasRequiredHeader) {
      // Thử check dòng 6
      const headerRow2 = data[5] || [];
      const headerStr2 = headerRow2.map((c) => String(c ?? '').toLowerCase()).join(' ');
      if (
        !headerStr2.includes('bhxh') &&
        !headerStr2.includes('tên dịch vụ') &&
        !headerStr2.includes('đơn giá')
      ) {
        return {
          valid: false,
          error:
            'File Excel chưa đúng mẫu Thống kê dịch vụ kỹ thuật: Thiếu các cột tiêu đề chuẩn (Mã BHXH, Tên dịch vụ, Đơn giá, Thành tiền).',
          patientGroups: [],
          serviceCount: 0,
          totalAmount: 0,
        };
      }
    }

    // 3. Quét dữ liệu từ dòng 7 (index 6) trở đi
    const patientGroups: PatientServicePriceGroup[] = [];
    let currentGroup: PatientServicePriceGroup | null = null;
    let serviceCount = 0;
    let totalAmount = 0;

    for (let r = 6; r < data.length; r++) {
      const row = data[r] || [];
      const colA = String(row[0] ?? '').trim();

      // Kiểm tra dòng kết thúc biểu
      if (
        colA.toLowerCase().includes('tổng cộng') ||
        colA.toLowerCase().includes('người lập biểu') ||
        colA.toLowerCase().includes('trưởng khoa')
      ) {
        break;
      }

      // Kiểm tra xem có phải dòng tiêu đề bệnh nhân: "2600097066-LẠI HOÀNG ANH TÚ"
      // Định dạng: 10 chữ số (mã KCB) + dấu gạch nối + họ tên
      const patientMatch = colA.match(/^(\d{10})\s*[-–—]\s*(.+)$/);
      if (patientMatch) {
        const patientId = patientMatch[1];
        const patientName = patientMatch[2].trim();
        currentGroup = {
          patientId,
          patientName,
          services: [],
        };
        patientGroups.push(currentGroup);
        continue;
      }

      // Kiểm tra xem có phải dòng DVKT: cột A có STT số, cột E có tên dịch vụ
      const colE = String(row[4] ?? '').trim();
      if (currentGroup && colE && (typeof row[0] === 'number' || /^\d+$/.test(colA))) {
        const stt = typeof row[0] === 'number' ? row[0] : parseInt(colA, 10) || 0;
        const rawBHXH = row[1];
        const maTuongDuong = normalizeMaTuongDuong(rawBHXH);
        const maDV = String(row[2] ?? '').trim();
        const mahh = String(row[3] ?? '').trim();
        const tenDichVu = colE;

        const rawQty = row[5];
        const soLuong = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty ?? '0').replace(/,/g, '')) || 0;

        const dvt = String(row[6] ?? '').trim();

        const rawDonGia = row[7];
        const donGia = typeof rawDonGia === 'number' ? rawDonGia : parseFloat(String(rawDonGia ?? '0').replace(/,/g, '')) || 0;

        const rawThanhTien = row[8];
        let thanhTien =
          typeof rawThanhTien === 'number'
            ? rawThanhTien
            : parseFloat(String(rawThanhTien ?? '0').replace(/,/g, '')) || 0;

        // Fallback: nếu thành tiền trong Excel bị trống, tự động tính = soLuong * donGia
        if (!thanhTien && soLuong && donGia) {
          thanhTien = Math.round(soLuong * donGia);
        }

        const item: ServicePriceItem = {
          stt,
          maBHXH: String(rawBHXH ?? '').trim(),
          maTuongDuong,
          maDV,
          mahh,
          tenDichVu,
          soLuong,
          dvt,
          donGia,
          thanhTien,
        };

        currentGroup.services.push(item);
        serviceCount++;
        totalAmount += thanhTien;
      }
    }

    return {
      valid: true,
      dateRangeText,
      dateFrom,
      dateTo,
      timeFrom,
      timeToStr,
      patientGroups,
      serviceCount,
      totalAmount,
    };
  } catch (error: any) {
    return {
      valid: false,
      error: `Lỗi đọc file Excel: ${error.message}`,
      patientGroups: [],
      serviceCount: 0,
      totalAmount: 0,
    };
  }
}

// ───────────────── Matching & Applying Prices ─────────────────

export interface PriceMatchDetail {
  record: SurgeryRecord;
  matched: boolean;
  matchedItem?: ServicePriceItem;
}

export interface PriceMatchResult {
  updatedRecords: SurgeryRecord[];
  matchedCount: number;
  unmatchedCount: number;
  totalMatchedAmount: number;
  matchDetails: PriceMatchDetail[];
}

/**
 * Khớp dữ liệu phẫu thuật với danh sách dịch vụ kỹ thuật đã import:
 * - Trên dữ liệu phẫu thuật: lấy Mã KCB (patientId) + Tên kỹ thuật (chuẩn hóa Unicode) + Số lượng
 * - Trên file thống kê DVKT: lấy Mã KCB + Tên DVKT + Số lượng
 * Khi khớp: gán maTuongDuong, donGia, thanhTien
 */
export function matchAndApplyServicePrices(
  records: SurgeryRecord[],
  patientGroups: PatientServicePriceGroup[]
): PriceMatchResult {
  // 1. Tạo Map tra cứu từ patientGroups: Key = `${patientId}_${normalizeForMatch(tenDVKT)}_${soLuong}`
  const serviceMap = new Map<string, ServicePriceItem>();
  // Map phụ không kèm SL để fallback nếu SL bị lệch nhẹ (ví dụ 1 vs 1.0)
  const serviceMapNoQty = new Map<string, ServicePriceItem>();

  patientGroups.forEach((group) => {
    const pid = group.patientId.trim();
    group.services.forEach((svc) => {
      const normName = normalizeForMatch(svc.tenDichVu);
      const keyExact = `${pid}_${normName}_${Number(svc.soLuong)}`;
      serviceMap.set(keyExact, svc);

      const keyNoQty = `${pid}_${normName}`;
      if (!serviceMapNoQty.has(keyNoQty)) {
        serviceMapNoQty.set(keyNoQty, svc);
      }
    });
  });

  let matchedCount = 0;
  let unmatchedCount = 0;
  let totalMatchedAmount = 0;
  const matchDetails: PriceMatchDetail[] = [];

  const updatedRecords = records.map((rec) => {
    const updated = { ...rec };
    const pid = String(rec.patientId ?? '').trim();
    const normName = normalizeForMatch(rec.tenKT);
    const qty = Number(rec.soLuong ?? 1);

    const exactKey = `${pid}_${normName}_${qty}`;
    let matchedItem = serviceMap.get(exactKey);

    // Fallback: nếu không khớp chính xác qty, thử tìm theo Mã KCB + Tên dịch vụ
    if (!matchedItem) {
      matchedItem = serviceMapNoQty.get(`${pid}_${normName}`);
    }

    if (matchedItem) {
      updated.maTuongDuong = matchedItem.maTuongDuong;
      updated.donGia = matchedItem.donGia;
      updated.priceSource = 'excel_dvkt';
      // Nếu khớp không theo exact qty, tính lại thanhTien theo qty thực tế của ca
      updated.thanhTien =
        matchedItem.soLuong === qty ? matchedItem.thanhTien : Math.round(matchedItem.donGia * qty);

      matchedCount++;
      totalMatchedAmount += updated.thanhTien || 0;
      matchDetails.push({
        record: updated,
        matched: true,
        matchedItem,
      });
    } else {
      unmatchedCount++;
      matchDetails.push({
        record: updated,
        matched: false,
      });
    }

    return updated;
  });

  return {
    updatedRecords,
    matchedCount,
    unmatchedCount,
    totalMatchedAmount,
    matchDetails,
  };
}
