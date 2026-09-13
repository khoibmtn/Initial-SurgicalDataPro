// ─── Clinical Outlier Detection Service ────────────────────────────────────────
// Phát hiện các ca mổ có thời lượng bất thường (siêu ngắn, siêu dài, âm thời gian)

import type { SurgeryRecord } from '../types';
import { parseVNDateTime } from './excelProcessor';
import { normalizeSurgeryType } from './stagingValidationService';

export type ClinicalOutlierType = 'negative' | 'short' | 'long';

export interface ClinicalOutlierIssue {
  recordKey: string;
  stt: any;
  patientId: string;
  patientName: string;
  tenKT: string;
  loaiPTTT: string;
  ptChinh: string;
  durationMinutes: number;
  outlierType: ClinicalOutlierType;
  severity: 'error' | 'warning';
  message: string;
}

export interface OutlierStats {
  total: number;
  negativeCount: number;
  shortCount: number;
  longCount: number;
  errorCount: number;
  warningCount: number;
}

/**
 * Kiểm tra 1 ca mổ có phải bất thường lâm sàng không
 */
export function detectRecordOutlier(record: SurgeryRecord): ClinicalOutlierIssue | null {
  let startDate = record.start;
  let endDate = record.end;

  if (!startDate && record.ngayBD) {
    startDate = parseVNDateTime(record.ngayBD);
  }
  if (!endDate && record.ngayKT) {
    endDate = parseVNDateTime(record.ngayKT);
  }

  if (!startDate || isNaN(startDate.getTime()) || !endDate || isNaN(endDate.getTime())) {
    return null;
  }

  const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  const normType = normalizeSurgeryType(record.loaiPTTT);

  // 1. Âm thời gian hoặc kết thúc trước khi bắt đầu
  if (duration <= 0) {
    return {
      recordKey: record.key || `${record.patientId}_${record.tenKT}_${record.ngayBD}`,
      stt: record.stt,
      patientId: record.patientId,
      patientName: record.patientName,
      tenKT: record.tenKT,
      loaiPTTT: record.loaiPTTT,
      ptChinh: record.ptChinh,
      durationMinutes: duration,
      outlierType: 'negative',
      severity: 'error',
      message: `Thời gian mổ không hợp lệ (${duration} phút). Giờ kết thúc phải sau giờ bắt đầu.`,
    };
  }

  // 2. Ca mổ siêu ngắn (< 5 phút đối với mọi ca)
  if (duration < 5) {
    return {
      recordKey: record.key || `${record.patientId}_${record.tenKT}_${record.ngayBD}`,
      stt: record.stt,
      patientId: record.patientId,
      patientName: record.patientName,
      tenKT: record.tenKT,
      loaiPTTT: record.loaiPTTT,
      ptChinh: record.ptChinh,
      durationMinutes: duration,
      outlierType: 'short',
      severity: 'error',
      message: `Thời gian mổ siêu ngắn (${duration} phút), nghi ngờ ghi sai giờ bắt đầu hoặc kết thúc.`,
    };
  }

  // 3. Ca phẫu thuật lớn (Đặc biệt hoặc Loại 1) diễn ra quá nhanh (< 15 phút)
  if (duration < 15 && (normType === 'Đặc biệt' || normType === 'Loại 1')) {
    return {
      recordKey: record.key || `${record.patientId}_${record.tenKT}_${record.ngayBD}`,
      stt: record.stt,
      patientId: record.patientId,
      patientName: record.patientName,
      tenKT: record.tenKT,
      loaiPTTT: record.loaiPTTT,
      ptChinh: record.ptChinh,
      durationMinutes: duration,
      outlierType: 'short',
      severity: 'warning',
      message: `Ca phẫu thuật ${normType} diễn ra chỉ trong ${duration} phút (định mức thông thường ≥ 60 phút). Cần đối soát lại biên bản phẫu thuật.`,
    };
  }

  // 4. Ca mổ kéo dài bất thường (> 8 tiếng / 480 phút)
  if (duration > 480) {
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    return {
      recordKey: record.key || `${record.patientId}_${record.tenKT}_${record.ngayBD}`,
      stt: record.stt,
      patientId: record.patientId,
      patientName: record.patientName,
      tenKT: record.tenKT,
      loaiPTTT: record.loaiPTTT,
      ptChinh: record.ptChinh,
      durationMinutes: duration,
      outlierType: 'long',
      severity: 'warning',
      message: `Ca mổ kéo dài bất thường (${hours}h ${mins}p). Cần xác nhận nguyên nhân kéo dài hoặc chuyển giao kíp mổ.`,
    };
  }

  return null;
}

/**
 * Quét toàn bộ danh sách và gắn cờ outlier vào từng SurgeryRecord
 */
export function annotateRecordsWithOutliers(records: SurgeryRecord[]): {
  annotated: SurgeryRecord[];
  outliers: ClinicalOutlierIssue[];
} {
  const outliers: ClinicalOutlierIssue[] = [];

  const annotated = records.map((record) => {
    const issue = detectRecordOutlier(record);
    if (issue) {
      outliers.push(issue);
      return {
        ...record,
        outlierType: issue.outlierType,
        outlierMessage: issue.message,
      };
    }
    // Clear outlier flags if clean
    if (record.outlierType || record.outlierMessage) {
      const copy = { ...record };
      delete copy.outlierType;
      delete copy.outlierMessage;
      return copy;
    }
    return record;
  });

  return { annotated, outliers };
}

/**
 * Thống kê tổng hợp các ca bất thường
 */
export function getOutlierStats(outliers: ClinicalOutlierIssue[]): OutlierStats {
  let negativeCount = 0;
  let shortCount = 0;
  let longCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  outliers.forEach((o) => {
    if (o.outlierType === 'negative') negativeCount++;
    if (o.outlierType === 'short') shortCount++;
    if (o.outlierType === 'long') longCount++;
    if (o.severity === 'error') errorCount++;
    if (o.severity === 'warning') warningCount++;
  });

  return {
    total: outliers.length,
    negativeCount,
    shortCount,
    longCount,
    errorCount,
    warningCount,
  };
}
