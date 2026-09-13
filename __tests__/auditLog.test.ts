import { describe, it, expect, vi } from 'vitest';
import {
  computeSurgeryRecordDiff,
  filterAuditLogs,
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
    ];

    it('filters logs by action', () => {
      const result = filterAuditLogs(mockLogs, { action: 'REPORT_LOCK' });
      expect(result.length).toBe(1);
      expect(result[0].action).toBe('REPORT_LOCK');
    });

    it('filters logs by department', () => {
      const result = filterAuditLogs(mockLogs, { department: 'Ngoại TH' });
      // Logs with department Ngoại TH or ALL should match
      expect(result.length).toBe(3);
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

    it('returns all logs when filter is empty or set to ALL', () => {
      const result = filterAuditLogs(mockLogs, { action: 'ALL', department: 'ALL' });
      expect(result.length).toBe(3);
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
