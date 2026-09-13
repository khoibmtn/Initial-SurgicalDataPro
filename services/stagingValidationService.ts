// ─── Staging Validation Service ────────────────────────────────────────────────
// Phân tích, phát hiện lỗi lâm sàng và hỗ trợ chuẩn hóa dữ liệu Excel trước khi nạp

import type { SurgeryRecord, SurgeryConfig } from '../types';
import type {
  StagingIssue,
  StagingRecord,
  StagingStatus,
  StagingSummary,
} from '../types/staging';
import { parseVNDateTime } from './excelProcessor';

/**
 * Danh sách các loại PTTT hợp lệ chuẩn y tế Việt Nam
 */
export const VALID_SURGERY_TYPES = [
  'Đặc biệt',
  'Loại 1',
  'Loại 2',
  'Loại 3',
] as const;

/**
 * Chuẩn hóa tên loại PTTT
 */
export function normalizeSurgeryType(rawType: string): string | null {
  if (!rawType) return null;
  const s = rawType.trim().toLowerCase();

  if (s === 'đb' || s === 'db' || s.includes('đặc biệt') || s.includes('dac biet')) {
    return 'Đặc biệt';
  }
  // Check Loại 3 (III) first to avoid 'Loại I' substring match
  if (
    s === '3' ||
    s === 'iii' ||
    s === 'loại 3' ||
    s === 'loai 3' ||
    s === 'loại iii' ||
    s === 'loai iii' ||
    s.includes('loại 3') ||
    s.includes('loai 3') ||
    s.includes('loại iii') ||
    s.includes('loai iii')
  ) {
    return 'Loại 3';
  }
  // Check Loại 2 (II) second
  if (
    s === '2' ||
    s === 'ii' ||
    s === 'loại 2' ||
    s === 'loai 2' ||
    s === 'loại ii' ||
    s === 'loai ii' ||
    s.includes('loại 2') ||
    s.includes('loai 2') ||
    s.includes('loại ii') ||
    s.includes('loai ii')
  ) {
    return 'Loại 2';
  }
  // Check Loại 1 (I) last
  if (
    s === '1' ||
    s === 'i' ||
    s === 'loại 1' ||
    s === 'loai 1' ||
    s === 'loại i' ||
    s === 'loai i' ||
    s.includes('loại 1') ||
    s.includes('loai 1') ||
    s.includes('loại i') ||
    s.includes('loai i')
  ) {
    return 'Loại 1';
  }

  return null;
}

/**
 * Kiểm tra tính hợp lệ của 1 ca mổ
 */
export function validateSingleRecord(
  record: SurgeryRecord,
  allRecords?: SurgeryRecord[],
  config?: SurgeryConfig
): StagingIssue[] {
  const issues: StagingIssue[] = [];

  // 1. Kiểm tra Mã bệnh nhân
  if (!record.patientId || String(record.patientId).trim() === '') {
    issues.push({
      field: 'patientId',
      fieldLabel: 'Mã BN',
      message: 'Thiếu mã bệnh nhân',
      severity: 'error',
      code: 'MISSING_PATIENT_ID',
    });
  }

  // 2. Kiểm tra Tên bệnh nhân
  if (!record.patientName || String(record.patientName).trim() === '') {
    issues.push({
      field: 'patientName',
      fieldLabel: 'Tên BN',
      message: 'Thiếu họ và tên bệnh nhân',
      severity: 'error',
      code: 'MISSING_PATIENT_NAME',
    });
  }

  // 3. Kiểm tra Thời gian mổ (Bắt đầu & Kết thúc)
  let startDate = record.start;
  let endDate = record.end;

  if (!startDate && record.ngayBD) {
    startDate = parseVNDateTime(record.ngayBD);
  }
  if (!endDate && record.ngayKT) {
    endDate = parseVNDateTime(record.ngayKT);
  }

  if (!startDate || isNaN(startDate.getTime()) || !endDate || isNaN(endDate.getTime())) {
    issues.push({
      field: 'ngayBD',
      fieldLabel: 'Thời gian mổ',
      message: 'Định dạng ngày giờ bắt đầu hoặc kết thúc không hợp lệ',
      severity: 'error',
      code: 'INVALID_TIME',
    });
  } else {
    const diffMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    if (diffMinutes <= 0) {
      issues.push({
        field: 'ngayKT',
        fieldLabel: 'Giờ kết thúc',
        message: `Thời gian mổ không hợp lệ (${diffMinutes} phút). Giờ kết thúc phải sau giờ bắt đầu.`,
        severity: 'error',
        code: 'NEGATIVE_TIME',
      });
    } else if (diffMinutes < 10) {
      issues.push({
        field: 'timeMinutes',
        fieldLabel: 'Thời lượng',
        message: `Ca mổ ngắn bất thường (${diffMinutes} phút). Vui lòng kiểm tra lại giờ mổ.`,
        severity: 'warning',
        code: 'OUTLIER_TOO_SHORT',
      });
    } else if (diffMinutes > 480) {
      issues.push({
        field: 'timeMinutes',
        fieldLabel: 'Thời lượng',
        message: `Ca mổ kéo dài bất thường (${Math.floor(diffMinutes / 60)} giờ ${diffMinutes % 60} phút). Vui lòng xác nhận.`,
        severity: 'warning',
        code: 'OUTLIER_TOO_LONG',
      });
    }
  }

  // 4. Kiểm tra Phẫu thuật viên chính
  if (!record.ptChinh || String(record.ptChinh).trim() === '') {
    issues.push({
      field: 'ptChinh',
      fieldLabel: 'Phẫu thuật viên (PTV)',
      message: 'Thiếu bác sĩ phẫu thuật chính',
      severity: 'error',
      code: 'MISSING_SURGEON',
    });
  }

  // 5. Kiểm tra Loại PTTT
  const normType = normalizeSurgeryType(record.loaiPTTT);
  if (!record.loaiPTTT || !normType) {
    issues.push({
      field: 'loaiPTTT',
      fieldLabel: 'Loại PTTT',
      message: record.loaiPTTT
        ? `Loại PTTT "${record.loaiPTTT}" không thuộc danh mục chuẩn (ĐB, Loại 1, 2, 3)`
        : 'Chưa có phân loại phẫu thuật / thủ thuật',
      severity: 'warning',
      code: 'INVALID_SURGERY_TYPE',
    });
  }

  // 6. Kiểm tra Kíp Gây Mê đối với ca mổ lớn (Đặc biệt hoặc Loại 1)
  if (normType === 'Đặc biệt' || normType === 'Loại 1') {
    const hasAnesthesia =
      (record.bsGM && record.bsGM.trim() !== '') ||
      (record.ktvGM && record.ktvGM.trim() !== '');
    if (!hasAnesthesia) {
      issues.push({
        field: 'bsGM',
        fieldLabel: 'Kíp gây mê',
        message: `Ca mổ ${normType} nhưng chưa ghi nhận Bác sĩ hoặc KTV Gây mê`,
        severity: 'warning',
        code: 'MISSING_ANESTHESIA',
      });
    }
  }

  // 7. Kiểm tra trùng ca tiềm ẩn trong cùng file (cùng BN, cùng kỹ thuật, trùng thời gian)
  if (allRecords && allRecords.length > 0 && startDate && endDate) {
    const thisStagingId = (record as any)._stagingId;
    const isDup = allRecords.some((other) => {
      if (other === record) return false;
      const otherStagingId = (other as any)._stagingId;
      if (thisStagingId && otherStagingId && thisStagingId === otherStagingId) {
        return false;
      }
      if (
        other.patientId === record.patientId &&
        other.tenKT === record.tenKT
      ) {
        const otherStart = other.start instanceof Date ? other.start : parseVNDateTime(other.ngayBD);
        const otherEnd = other.end instanceof Date ? other.end : parseVNDateTime(other.ngayKT);
        if (otherStart && otherEnd) {
          return startDate! < otherEnd && endDate! > otherStart;
        }
      }
      return false;
    });

    if (isDup) {
      issues.push({
        field: '_general',
        fieldLabel: 'Trùng ca',
        message: 'Nghi ngờ trùng lặp với một ca mổ khác cùng bệnh nhân và kỹ thuật trong file',
        severity: 'warning',
        code: 'POTENTIAL_DUPLICATE',
      });
    }
  }

  return issues;
}

/**
 * Quyết định trạng thái tổng thể từ danh sách issues
 */
export function determineStagingStatus(issues: StagingIssue[]): StagingStatus {
  if (issues.some((i) => i.severity === 'error')) return 'error';
  if (issues.some((i) => i.severity === 'warning')) return 'warning';
  return 'valid';
}

/**
 * Xây dựng danh sách StagingRecord từ mảng SurgeryRecord thô
 */
export function buildStagingRecords(
  records: SurgeryRecord[],
  config?: SurgeryConfig
): StagingRecord[] {
  return records.map((r, index) => {
    const issues = validateSingleRecord(r, records, config);
    const status = determineStagingStatus(issues);
    return {
      ...r,
      _stagingId: `staging_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
      _issues: issues,
      _status: status,
      _isExcluded: false,
      _isModified: false,
    };
  });
}

/**
 * Tái kiểm thử một dòng sau khi người dùng sửa đổi
 */
export function revalidateStagingRecord(
  record: StagingRecord,
  allRecords: StagingRecord[],
  config?: SurgeryConfig
): StagingRecord {
  // Đồng bộ Date objects nếu ngayBD/ngayKT đã thay đổi
  let updatedStart = record.start;
  let updatedEnd = record.end;
  let updatedMinutes = record.timeMinutes;

  if (record.ngayBD) {
    const pStart = parseVNDateTime(record.ngayBD);
    if (pStart) updatedStart = pStart;
  }
  if (record.ngayKT) {
    const pEnd = parseVNDateTime(record.ngayKT);
    if (pEnd) updatedEnd = pEnd;
  }
  if (updatedStart && updatedEnd && !isNaN(updatedStart.getTime()) && !isNaN(updatedEnd.getTime())) {
    updatedMinutes = Math.max(0, Math.round((updatedEnd.getTime() - updatedStart.getTime()) / 60000));
  }

  const updatedRecord: StagingRecord = {
    ...record,
    start: updatedStart,
    end: updatedEnd,
    timeMinutes: updatedMinutes,
    _isModified: true,
  };

  const issues = validateSingleRecord(updatedRecord, allRecords, config);
  const status = determineStagingStatus(issues);

  return {
    ...updatedRecord,
    _issues: issues,
    _status: status,
  };
}

/**
 * Tính toán thống kê tình trạng staging
 */
export function computeStagingSummary(records: StagingRecord[]): StagingSummary {
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let excludedCount = 0;

  records.forEach((r) => {
    if (r._isExcluded) {
      excludedCount++;
      return;
    }
    if (r._status === 'error') {
      errorCount++;
    } else if (r._status === 'warning') {
      warningCount++;
    } else {
      validCount++;
    }
  });

  return {
    total: records.length,
    validCount,
    warningCount,
    errorCount,
    excludedCount,
  };
}

/**
 * Tự động sửa các lỗi cơ bản (chuẩn hóa loại PTTT, cắt khoảng trắng, đồng bộ thời lượng)
 */
export function applyAutoFixes(
  stagingRecords: StagingRecord[],
  config?: SurgeryConfig
): { updated: StagingRecord[]; fixedCount: number } {
  let fixedCount = 0;

  const updated = stagingRecords.map((r) => {
    let modified = false;
    let newRecord = { ...r };

    // 1. Trim các chuỗi văn bản
    const stringFields: Array<keyof SurgeryRecord> = [
      'patientId',
      'patientName',
      'ptChinh',
      'ptPhu',
      'bsGM',
      'ktvGM',
      'tdc',
      'gv',
      'tenKT',
      'loaiPTTT',
    ];

    stringFields.forEach((field) => {
      const val = newRecord[field];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed !== val) {
          (newRecord as any)[field] = trimmed;
          modified = true;
        }
      }
    });

    // 2. Chuẩn hóa Loại PTTT nếu khớp định dạng tương đương
    const norm = normalizeSurgeryType(newRecord.loaiPTTT);
    if (norm && norm !== newRecord.loaiPTTT) {
      newRecord.loaiPTTT = norm;
      modified = true;
    }

    // 3. Đồng bộ lại timeMinutes nếu start & end hợp lệ
    let start = newRecord.start || (newRecord.ngayBD ? parseVNDateTime(newRecord.ngayBD) : null);
    let end = newRecord.end || (newRecord.ngayKT ? parseVNDateTime(newRecord.ngayKT) : null);
    if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      if (mins !== newRecord.timeMinutes && mins > 0) {
        newRecord.timeMinutes = mins;
        newRecord.start = start;
        newRecord.end = end;
        modified = true;
      }
    }

    if (modified) {
      fixedCount++;
      const issues = validateSingleRecord(newRecord, stagingRecords, config);
      return {
        ...newRecord,
        _issues: issues,
        _status: determineStagingStatus(issues),
        _isModified: true,
      };
    }

    return r;
  });

  return { updated, fixedCount };
}
