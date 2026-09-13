import { describe, it, expect } from 'vitest';
import {
  validateSingleRecord,
  normalizeSurgeryType,
  buildStagingRecords,
  revalidateStagingRecord,
  computeStagingSummary,
  applyAutoFixes,
  determineStagingStatus,
} from '../services/stagingValidationService';
import type { SurgeryRecord } from '../types';
import type { StagingRecord } from '../types/staging';

describe('Staging Validation Service', () => {
  const createValidRecord = (): SurgeryRecord => ({
    stt: 1,
    patientId: 'BN12345',
    patientName: 'Trần Thị Mai',
    gender: 'Nữ',
    yob: '1985',
    bhyt: 'DN4010123456789',
    ngayCD: '12/09/2026',
    ngayBD: '12/09/2026 08:30',
    ngayKT: '12/09/2026 10:00',
    start: new Date(2026, 8, 12, 8, 30),
    end: new Date(2026, 8, 12, 10, 0),
    tenKT: 'Phẫu thuật nội soi cắt ruột thừa viêm',
    loaiPTTT: 'Loại 1',
    soLuong: 1,
    timeMinutes: 90,
    ptChinh: 'BS. Lê Minh Quang',
    ptPhu: 'BS. Trần Văn Hùng',
    bsGM: 'BS. Nguyễn Văn An',
    ktvGM: 'KTV. Hoàng Thị Lan',
    tdc: 'Điều dưỡng Mai',
    gv: 'Phạm Thị Thảo',
    machine: 'Giàn mổ nội soi 01',
    machineCode: 'M01',
    machineId: 'id_m01',
  });

  describe('normalizeSurgeryType', () => {
    it('normalizes various formats to standard types', () => {
      expect(normalizeSurgeryType('1')).toBe('Loại 1');
      expect(normalizeSurgeryType('loại 1')).toBe('Loại 1');
      expect(normalizeSurgeryType('Loại I')).toBe('Loại 1');
      expect(normalizeSurgeryType('2')).toBe('Loại 2');
      expect(normalizeSurgeryType('loai 2')).toBe('Loại 2');
      expect(normalizeSurgeryType('Loại II')).toBe('Loại 2');
      expect(normalizeSurgeryType('3')).toBe('Loại 3');
      expect(normalizeSurgeryType('loại 3')).toBe('Loại 3');
      expect(normalizeSurgeryType('Loại III')).toBe('Loại 3');
      expect(normalizeSurgeryType('đb')).toBe('Đặc biệt');
      expect(normalizeSurgeryType('DB')).toBe('Đặc biệt');
      expect(normalizeSurgeryType('đặc biệt')).toBe('Đặc biệt');
      expect(normalizeSurgeryType('dac biet')).toBe('Đặc biệt');
      expect(normalizeSurgeryType('Khác')).toBeNull();
      expect(normalizeSurgeryType('')).toBeNull();
    });
  });

  describe('validateSingleRecord', () => {
    it('passes completely for a clean valid record', () => {
      const record = createValidRecord();
      const issues = validateSingleRecord(record);
      expect(issues.length).toBe(0);
      expect(determineStagingStatus(issues)).toBe('valid');
    });

    it('detects missing patientId as an error', () => {
      const record = { ...createValidRecord(), patientId: '' };
      const issues = validateSingleRecord(record);
      const idIssue = issues.find((i) => i.code === 'MISSING_PATIENT_ID');
      expect(idIssue).toBeDefined();
      expect(idIssue?.severity).toBe('error');
      expect(determineStagingStatus(issues)).toBe('error');
    });

    it('detects missing patientName as an error', () => {
      const record = { ...createValidRecord(), patientName: '   ' };
      const issues = validateSingleRecord(record);
      const nameIssue = issues.find((i) => i.code === 'MISSING_PATIENT_NAME');
      expect(nameIssue).toBeDefined();
      expect(nameIssue?.severity).toBe('error');
      expect(determineStagingStatus(issues)).toBe('error');
    });

    it('detects missing surgeon (ptChinh) as an error', () => {
      const record = { ...createValidRecord(), ptChinh: '' };
      const issues = validateSingleRecord(record);
      const surgeonIssue = issues.find((i) => i.code === 'MISSING_SURGEON');
      expect(surgeonIssue).toBeDefined();
      expect(surgeonIssue?.severity).toBe('error');
      expect(determineStagingStatus(issues)).toBe('error');
    });

    it('detects negative surgery time as an error', () => {
      const record = {
        ...createValidRecord(),
        ngayBD: '12/09/2026 10:00',
        ngayKT: '12/09/2026 09:00',
        start: new Date(2026, 8, 12, 10, 0),
        end: new Date(2026, 8, 12, 9, 0),
      };
      const issues = validateSingleRecord(record);
      const timeIssue = issues.find((i) => i.code === 'NEGATIVE_TIME');
      expect(timeIssue).toBeDefined();
      expect(timeIssue?.severity).toBe('error');
      expect(determineStagingStatus(issues)).toBe('error');
    });

    it('flags outlier short surgery (< 10 minutes) as warning', () => {
      const record = {
        ...createValidRecord(),
        ngayBD: '12/09/2026 08:30',
        ngayKT: '12/09/2026 08:35',
        start: new Date(2026, 8, 12, 8, 30),
        end: new Date(2026, 8, 12, 8, 35),
      };
      const issues = validateSingleRecord(record);
      const shortIssue = issues.find((i) => i.code === 'OUTLIER_TOO_SHORT');
      expect(shortIssue).toBeDefined();
      expect(shortIssue?.severity).toBe('warning');
    });

    it('flags outlier long surgery (> 8 hours / 480 minutes) as warning', () => {
      const record = {
        ...createValidRecord(),
        ngayBD: '12/09/2026 08:00',
        ngayKT: '12/09/2026 17:00',
        start: new Date(2026, 8, 12, 8, 0),
        end: new Date(2026, 8, 12, 17, 0),
      };
      const issues = validateSingleRecord(record);
      const longIssue = issues.find((i) => i.code === 'OUTLIER_TOO_LONG');
      expect(longIssue).toBeDefined();
      expect(longIssue?.severity).toBe('warning');
    });

    it('flags missing anesthesia for major surgery (Loại 1/Đặc biệt) as warning', () => {
      const record = {
        ...createValidRecord(),
        loaiPTTT: 'Loại 1',
        bsGM: '',
        ktvGM: '',
      };
      const issues = validateSingleRecord(record);
      const anesIssue = issues.find((i) => i.code === 'MISSING_ANESTHESIA');
      expect(anesIssue).toBeDefined();
      expect(anesIssue?.severity).toBe('warning');
    });

    it('detects potential duplicate surgery in file', () => {
      const r1 = createValidRecord();
      const r2 = { ...createValidRecord(), stt: 2 };
      const issues = validateSingleRecord(r2, [r1, r2]);
      const dupIssue = issues.find((i) => i.code === 'POTENTIAL_DUPLICATE');
      expect(dupIssue).toBeDefined();
      expect(dupIssue?.severity).toBe('warning');
    });
  });

  describe('buildStagingRecords & revalidateStagingRecord', () => {
    it('builds staging records with metadata and status', () => {
      const rawRecords = [createValidRecord(), { ...createValidRecord(), patientId: 'BN99999', ptChinh: '' }];
      const staging = buildStagingRecords(rawRecords);

      expect(staging.length).toBe(2);
      expect(staging[0]._status).toBe('valid');
      expect(staging[1]._status).toBe('error');
      expect(staging[0]._stagingId).toBeDefined();
    });

    it('revalidates record and updates status after inline editing', () => {
      const rawRecords = [createValidRecord(), { ...createValidRecord(), patientId: 'BN99999', ptChinh: '' }];
      const staging = buildStagingRecords(rawRecords);

      expect(staging[1]._status).toBe('error');

      // User fixes ptChinh
      const edited: StagingRecord = {
        ...staging[1],
        ptChinh: 'BS. Lê Văn M',
      };
      const revalidated = revalidateStagingRecord(edited, staging);

      expect(revalidated._status).toBe('valid');
      expect(revalidated._issues.length).toBe(0);
      expect(revalidated._isModified).toBe(true);
    });
  });

  describe('computeStagingSummary', () => {
    it('computes accurate counts for valid, warning, error and excluded', () => {
      const r1 = { ...createValidRecord(), _status: 'valid' } as StagingRecord;
      const r2 = { ...createValidRecord(), _status: 'warning' } as StagingRecord;
      const r3 = { ...createValidRecord(), _status: 'error' } as StagingRecord;
      const r4 = { ...createValidRecord(), _status: 'error', _isExcluded: true } as StagingRecord;

      const summary = computeStagingSummary([r1, r2, r3, r4]);
      expect(summary.total).toBe(4);
      expect(summary.validCount).toBe(1);
      expect(summary.warningCount).toBe(1);
      expect(summary.errorCount).toBe(1);
      expect(summary.excludedCount).toBe(1);
    });
  });

  describe('applyAutoFixes', () => {
    it('auto-normalizes loaiPTTT and trims whitespace', () => {
      const raw: StagingRecord[] = [
        {
          ...createValidRecord(),
          _stagingId: 's1',
          _issues: [],
          _status: 'warning',
          loaiPTTT: '1',
          patientName: '  Nguyễn Văn A  ',
        },
      ];

      const { updated, fixedCount } = applyAutoFixes(raw);
      expect(fixedCount).toBe(1);
      expect(updated[0].loaiPTTT).toBe('Loại 1');
      expect(updated[0].patientName).toBe('Nguyễn Văn A');
      expect(updated[0]._status).toBe('valid');
    });
  });
});
