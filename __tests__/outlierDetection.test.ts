import { describe, it, expect } from 'vitest';
import {
  detectRecordOutlier,
  annotateRecordsWithOutliers,
  getOutlierStats,
} from '../services/outlierDetectionService';
import type { SurgeryRecord } from '../types';

describe('Clinical Outlier Detection Service', () => {
  const createBaseRecord = (): SurgeryRecord => ({
    stt: 1,
    patientId: 'BN001',
    patientName: 'Nguyễn Văn A',
    gender: 'Nam',
    yob: '1980',
    bhyt: '',
    ngayCD: '',
    ngayBD: '12/09/2026 08:00',
    ngayKT: '12/09/2026 09:30',
    tenKT: 'Phẫu thuật nội soi viêm ruột thừa',
    loaiPTTT: 'Loại 1',
    soLuong: 1,
    timeMinutes: 90,
    ptChinh: 'BS. Lê Văn M',
    ptPhu: '',
    bsGM: 'BS. Trần Văn N',
    ktvGM: '',
    tdc: '',
    gv: '',
    machine: '',
    machineCode: '',
    machineId: '',
    start: new Date(2026, 8, 12, 8, 0),
    end: new Date(2026, 8, 12, 9, 30),
  });

  describe('detectRecordOutlier', () => {
    it('returns null for normal valid surgery (90 minutes, Loại 1)', () => {
      const rec = createBaseRecord();
      expect(detectRecordOutlier(rec)).toBeNull();
    });

    it('detects negative surgery time (end <= start) as error', () => {
      const rec = {
        ...createBaseRecord(),
        ngayBD: '12/09/2026 09:00',
        ngayKT: '12/09/2026 08:30',
        start: new Date(2026, 8, 12, 9, 0),
        end: new Date(2026, 8, 12, 8, 30),
      };
      const outlier = detectRecordOutlier(rec);
      expect(outlier).not.toBeNull();
      expect(outlier?.outlierType).toBe('negative');
      expect(outlier?.severity).toBe('error');
    });

    it('detects super short surgery (< 5 minutes) as error', () => {
      const rec = {
        ...createBaseRecord(),
        ngayBD: '12/09/2026 08:00',
        ngayKT: '12/09/2026 08:03',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 8, 3),
      };
      const outlier = detectRecordOutlier(rec);
      expect(outlier).not.toBeNull();
      expect(outlier?.outlierType).toBe('short');
      expect(outlier?.severity).toBe('error');
    });

    it('detects short major surgery (Loại 1 / Đặc biệt < 15 minutes) as warning', () => {
      const rec = {
        ...createBaseRecord(),
        loaiPTTT: 'Đặc biệt',
        ngayBD: '12/09/2026 08:00',
        ngayKT: '12/09/2026 08:12',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 8, 12),
      };
      const outlier = detectRecordOutlier(rec);
      expect(outlier).not.toBeNull();
      expect(outlier?.outlierType).toBe('short');
      expect(outlier?.severity).toBe('warning');
    });

    it('does not flag short duration for minor surgery (Loại 3, 12 minutes)', () => {
      const rec = {
        ...createBaseRecord(),
        loaiPTTT: 'Loại 3',
        ngayBD: '12/09/2026 08:00',
        ngayKT: '12/09/2026 08:12',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 8, 12),
      };
      const outlier = detectRecordOutlier(rec);
      expect(outlier).toBeNull();
    });

    it('detects abnormally long surgery (> 8 hours / 480 minutes) as warning', () => {
      const rec = {
        ...createBaseRecord(),
        ngayBD: '12/09/2026 08:00',
        ngayKT: '12/09/2026 17:00',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 17, 0),
      };
      const outlier = detectRecordOutlier(rec);
      expect(outlier).not.toBeNull();
      expect(outlier?.outlierType).toBe('long');
      expect(outlier?.severity).toBe('warning');
    });
  });

  describe('annotateRecordsWithOutliers & getOutlierStats', () => {
    it('annotates records and computes statistical breakdown', () => {
      const recNormal = createBaseRecord();
      const recShort = {
        ...createBaseRecord(),
        stt: 2,
        patientId: 'BN002',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 8, 2),
      };
      const recLong = {
        ...createBaseRecord(),
        stt: 3,
        patientId: 'BN003',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 17, 30),
      };

      const { annotated, outliers } = annotateRecordsWithOutliers([
        recNormal,
        recShort,
        recLong,
      ]);

      expect(annotated.length).toBe(3);
      expect(outliers.length).toBe(2);

      expect(annotated[0].outlierType).toBeUndefined();
      expect(annotated[1].outlierType).toBe('short');
      expect(annotated[2].outlierType).toBe('long');

      const stats = getOutlierStats(outliers);
      expect(stats.total).toBe(2);
      expect(stats.shortCount).toBe(1);
      expect(stats.longCount).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.warningCount).toBe(1);
    });
  });
});
