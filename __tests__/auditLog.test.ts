import { describe, it, expect, vi } from 'vitest';
import {
  computeSurgeryRecordDiff,
  filterAuditLogs,
  getLogLocalDate,
  logAuditEvent,
} from '../services/auditLogService';
import type { AuditLogEntry, CreateAuditLogParams } from '../types/auditLog';
import type { SurgeryRecord } from '../types';

// Mock Firebase Realtime Database
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  set: vi.fn().mockResolvedValue(undefined),
  onValue: vi.fn(),
  query: vi.fn(),
  limitToLast: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

describe('Audit Log Service & Diff Calculation', () => {
  describe('computeSurgeryRecordDiff', () => {
    const baseRecord: Partial<SurgeryRecord> = {
      patientName: 'Nguyễn Văn A',
      patientId: 'BN001',
      ptv: 'BS. Lê Văn M',
      gv: 'Nguyễn Thị N',
      tenDV: 'Phẫu thuật nội soi ruột thừa',
      timeMinutes: 45,
      donGia: 1500000,
    };

    it('returns empty array when records are identical', () => {
      const diffs = computeSurgeryRecordDiff(baseRecord, { ...baseRecord });
      expect(diffs).toEqual([]);
    });

    it('detects changes in single field (e.g. Người giúp việc)', () => {
      const updated: Partial<SurgeryRecord> = {
        ...baseRecord,
        gv: 'Trần Thị P (Phụ)',
      };
      const diffs = computeSurgeryRecordDiff(baseRecord, updated);
      expect(diffs.length).toBe(1);
      expect(diffs[0].fieldKey).toBe('gv');
      expect(diffs[0].fieldLabel).toBe('Người giúp việc (GV)');
      expect(diffs[0].before).toBe('Nguyễn Thị N');
      expect(diffs[0].after).toBe('Trần Thị P (Phụ)');
    });

    it('detects multiple field changes simultaneously', () => {
      const updated: Partial<SurgeryRecord> = {
        ...baseRecord,
        ptv: 'BS. Phạm Văn K',
        timeMinutes: 60,
        donGia: 1800000,
      };
      const diffs = computeSurgeryRecordDiff(baseRecord, updated);
      expect(diffs.length).toBe(3);

      const keys = diffs.map((d) => d.fieldKey);
      expect(keys).toContain('ptv');
      expect(keys).toContain('timeMinutes');
      expect(keys).toContain('donGia');
    });

    it('treats null and empty string as equivalent', () => {
      const recA = { ...baseRecord, machineName: null as any };
      const recB = { ...baseRecord, machineName: '' };
      const diffs = computeSurgeryRecordDiff(recA, recB);
      expect(diffs).toEqual([]);
    });
  });

  describe('filterAuditLogs', () => {
    const mockLogs: AuditLogEntry[] = [
      {
        id: '1',
        timestamp: '2026-09-13T08:00:00.000Z',
        userId: 'u1',
        userName: 'BS. Nguyễn Văn A',
        userRole: 'head',
        action: 'REPORT_LOCK',
        targetType: 'report',
        targetLabel: 'Báo cáo Tháng 09/2026',
        periodKey: '2026-09',
        department: 'ALL',
        description: 'Khóa sổ báo cáo Tháng 09/2026',
      },
      {
        id: '2',
        timestamp: '2026-09-13T08:30:00.000Z',
        userId: 'u2',
        userName: 'ĐD. Trần Thị B',
        userRole: 'staff',
        action: 'ASSISTANT_FILL',
        targetType: 'surgery_record',
        targetLabel: '15 ca mổ',
        periodKey: '2026-09',
        department: 'Ngoại TH',
        description: 'Điền Người giúp việc cho 15 ca mổ',
      },
      {
        id: '3',
        timestamp: '2026-09-13T09:00:00.000Z',
        userId: 'u1',
        userName: 'BS. Nguyễn Văn A',
        userRole: 'head',
        action: 'RECORD_EDIT',
        targetType: 'surgery_record',
        targetLabel: 'BN Lê Thị C (123456)',
        periodKey: '2026-09',
        department: 'Ngoại TH',
        description: 'Cập nhật ca mổ BN Lê Thị C',
      },
      {
        id: '4',
        timestamp: '2026-09-13T09:30:00.000Z',
        userId: 'u3',
        userName: 'ĐD. Lê Thị D',
        userRole: 'staff',
        userDepartment: 'Sản',
        action: 'PACKAGE_ASSIGNMENT_EDIT',
        targetType: 'service_package',
        targetLabel: 'Gói đẻ',
        periodKey: '2026-09',
        department: 'Sản',
        description: 'Gán gói đẻ',
      },
    ];

    it('filters logs by action', () => {
      const result = filterAuditLogs(mockLogs, { action: 'REPORT_LOCK' });
      expect(result.length).toBe(1);
      expect(result[0].action).toBe('REPORT_LOCK');
    });

    it('filters logs by department strictly excluding other departments', () => {
      // Ngoại TH should get logs 1 (global lock), 2, 3 but NOT log 4 (Sản)
      const resultNgoai = filterAuditLogs(mockLogs, { department: 'Ngoại TH' });
      expect(resultNgoai.length).toBe(3);
      expect(resultNgoai.map((l) => l.id)).toEqual(['1', '2', '3']);

      // Should also match when user provides "Khoa Ngoại TH" with prefix
      const resultWithPrefix = filterAuditLogs(mockLogs, { department: 'Khoa Ngoại TH' });
      expect(resultWithPrefix.length).toBe(3);

      // Filtering by "Sản" should only get log 1 (global lock) and log 4 (Sản)
      const resultSan = filterAuditLogs(mockLogs, { department: 'Sản' });
      expect(resultSan.length).toBe(2);
      expect(resultSan.map((l) => l.id)).toEqual(['1', '4']);
    });

    it('matches logs where department is set in userDepartment', () => {
      const logsWithUserDept: AuditLogEntry[] = [
        {
          id: 'u-1',
          timestamp: '2026-09-13T10:00:00.000Z',
          userId: 'u4',
          userName: 'BS. Khoa Ngoại',
          userRole: 'staff',
          userDepartment: 'Ngoại TH',
          action: 'RECORD_EDIT',
          targetType: 'surgery_record',
          description: 'Sửa ca mổ',
        },
        {
          id: 'u-2',
          timestamp: '2026-09-13T10:05:00.000Z',
          userId: 'u5',
          userName: 'BS. Khoa Sản',
          userRole: 'staff',
          userDepartment: 'Sản',
          action: 'RECORD_EDIT',
          targetType: 'surgery_record',
          description: 'Sửa ca mổ khác',
        },
      ];

      const result = filterAuditLogs(logsWithUserDept, { department: 'Ngoại TH' });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('u-1');
    });

    it('filters logs by searchTerm matching description or patient', () => {
      const result = filterAuditLogs(mockLogs, { searchTerm: 'Lê Thị C' });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('3');
    });

    it('filters logs by searchTerm matching executor userName', () => {
      const result = filterAuditLogs(mockLogs, { searchTerm: 'Trần Thị B' });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    it('filters logs by specific date (YYYY-MM-DD)', () => {
      // Create date matching the local date of log 1:
      const targetDate = getLogLocalDate(mockLogs[0].timestamp);
      expect(targetDate).toBeTruthy();

      const result = filterAuditLogs(mockLogs, { date: targetDate });
      expect(result.length).toBe(mockLogs.length);

      // Filtering with a date where no logs exist returns empty array
      const emptyResult = filterAuditLogs(mockLogs, { date: '1999-01-01' });
      expect(emptyResult.length).toBe(0);
    });

    it('returns all logs when filter is empty or set to ALL', () => {
      const result = filterAuditLogs(mockLogs, { action: 'ALL', department: 'ALL' });
      expect(result.length).toBe(4);
    });
  });

  describe('getLogLocalDate', () => {
    it('returns YYYY-MM-DD from Date or ISO string in local time', () => {
      const d = new Date(2026, 9, 6, 15, 30, 0); // 2026-10-06
      expect(getLogLocalDate(d)).toBe('2026-10-06');
      expect(getLogLocalDate(d.toISOString())).toBe('2026-10-06');
    });

    it('handles invalid or empty dates gracefully', () => {
      expect(getLogLocalDate('')).toBe('');
      expect(getLogLocalDate('invalid-date')).toBe('');
      expect(getLogLocalDate(undefined)).toBe('');
    });
  });

  describe('formatDateTimeExact', () => {
    it('formats timestamps into strict dd/mm/yyyy hh:mm:ss structure', async () => {
      const { formatDateTimeExact } = await import('../components/audit/AuditLogModal');
      // Create a known date: 2026-10-06 14:05:09 local
      const d = new Date(2026, 9, 6, 14, 5, 9); // month is 0-indexed (9 = Oct)
      const formatted = formatDateTimeExact(d);
      expect(formatted).toBe('06/10/2026 14:05:09');
    });
  });

  describe('logAuditEvent', () => {
    it('creates and sets valid audit log entry in Firebase RTDB', async () => {
      const { set } = await import('firebase/database');

      const params: CreateAuditLogParams = {
        userId: 'test-user-1',
        userName: 'BS. Test',
        userRole: 'head',
        userDepartment: 'Ngoại TH',
        action: 'RECORD_EDIT',
        targetType: 'surgery_record',
        targetLabel: 'BN Test',
        periodKey: '2026-09',
        department: 'Ngoại TH',
        description: 'Cập nhật thời gian mổ',
      };

      const logId = await logAuditEvent(params);
      expect(logId).toBeTruthy();
      expect(set).toHaveBeenCalledTimes(1);

      const callArgs = (set as any).mock.calls[0];
      const savedEntry: AuditLogEntry = callArgs[1];

      expect(savedEntry.userId).toBe('test-user-1');
      expect(savedEntry.userName).toBe('BS. Test');
      expect(savedEntry.action).toBe('RECORD_EDIT');
      expect(savedEntry.timestamp).toBeDefined();
    });
  });
});
