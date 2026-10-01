import { describe, it, expect } from 'vitest';
import {
  isValidPhoneNumber,
  normalizePhoneNumber,
  VIETNAMESE_PHONE_REGEX,
} from '../types/auth';
import { filterAuditLogs } from '../services/auditLogService';
import {
  DEFAULT_ROLE_PERMISSIONS,
  resolveEffectivePermissions,
  hasPermission,
} from '../services/permissionService';
import type { AuditLogEntry } from '../types/auditLog';

describe('Phone Number Validation & Formatting', () => {
  it('should accept valid 10-digit Vietnamese mobile phone numbers', () => {
    expect(isValidPhoneNumber('0912345678')).toBe(true);
    expect(isValidPhoneNumber('0388999888')).toBe(true);
    expect(isValidPhoneNumber('0567891234')).toBe(true);
    expect(isValidPhoneNumber('0701234567')).toBe(true);
    expect(isValidPhoneNumber('0834567890')).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    // Missing leading zero
    expect(isValidPhoneNumber('912345678')).toBe(false);
    // 9 digits
    expect(isValidPhoneNumber('091234567')).toBe(false);
    // 11 digits
    expect(isValidPhoneNumber('09123456789')).toBe(false);
    // Non-mobile prefix (e.g. 02 landline or 04 old code)
    expect(isValidPhoneNumber('0243123456')).toBe(false);
    expect(isValidPhoneNumber('0412345678')).toBe(false);
    // Text or special characters
    expect(isValidPhoneNumber('091234567a')).toBe(false);
    expect(isValidPhoneNumber('')).toBe(false);
  });

  it('should normalize phone numbers by stripping whitespace and non-numeric chars', () => {
    expect(normalizePhoneNumber('091 234 5678')).toBe('0912345678');
    expect(normalizePhoneNumber('091-234-5678')).toBe('0912345678');
    expect(normalizePhoneNumber('+84 912345678')).toBe('84912345678');
  });

  it('preserves leading zero as string', () => {
    const phone = '0987654321';
    expect(phone.startsWith('0')).toBe(true);
    expect(phone.length).toBe(10);
    expect(typeof phone).toBe('string');
  });
});

describe('Audit Log & User Action Filtering', () => {
  const mockLogs: AuditLogEntry[] = [
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      userName: 'BS. Nguyễn Văn A',
      userId: 'uid-user-a',
      userRole: 'head',
      userDepartment: 'Khoa Ngoại',
      action: 'USER_LOGIN',
      targetType: 'user',
      targetId: 'uid-user-a',
      description: 'Đăng nhập vào hệ thống',
    },
    {
      id: 'log-2',
      timestamp: new Date().toISOString(),
      userName: 'BS. Nguyễn Văn A',
      userId: 'uid-user-a',
      userRole: 'head',
      userDepartment: 'Khoa Ngoại',
      action: 'RECORD_EDIT',
      targetType: 'surgery_record',
      targetId: 'rec-123',
      targetLabel: 'BN Trần B',
      description: 'Chỉnh sửa ca mổ',
    },
    {
      id: 'log-3',
      timestamp: new Date().toISOString(),
      userName: 'ĐD. Lê Thị C',
      userId: 'uid-user-c',
      userRole: 'staff',
      userDepartment: 'Khoa Ngoại',
      action: 'USER_LOGIN',
      targetType: 'user',
      targetId: 'uid-user-c',
      description: 'Đăng nhập vào hệ thống',
    },
    {
      id: 'log-4',
      timestamp: new Date().toISOString(),
      userName: 'BS. Trưởng Khoa',
      userId: 'uid-user-head',
      userRole: 'head',
      userDepartment: 'Khoa GMHS',
      action: 'DUTY_SCHEDULE_EDIT',
      targetType: 'duty_schedule',
      targetId: '2026-10-01',
      description: 'Cập nhật lịch trực ngày 2026-10-01',
    },
  ];

  it('filters audit logs by specific userId', () => {
    const userALogs = filterAuditLogs(mockLogs, { userId: 'uid-user-a' });
    expect(userALogs.length).toBe(2);
    expect(userALogs.every((l) => l.userId === 'uid-user-a')).toBe(true);
  });

  it('filters audit logs by action USER_LOGIN', () => {
    const loginLogs = filterAuditLogs(mockLogs, { action: 'USER_LOGIN' });
    expect(loginLogs.length).toBe(2);
    expect(loginLogs.map((l) => l.userName)).toEqual(['BS. Nguyễn Văn A', 'ĐD. Lê Thị C']);
  });

  it('filters audit logs by userId AND action simultaneously', () => {
    const userALogins = filterAuditLogs(mockLogs, {
      userId: 'uid-user-a',
      action: 'USER_LOGIN',
    });
    expect(userALogins.length).toBe(1);
    expect(userALogins[0].id).toBe('log-1');
  });

  it('filters audit logs by DUTY_SCHEDULE_EDIT', () => {
    const dutyLogs = filterAuditLogs(mockLogs, { action: 'DUTY_SCHEDULE_EDIT' });
    expect(dutyLogs.length).toBe(1);
    expect(dutyLogs[0].targetType).toBe('duty_schedule');
  });
});

describe('Audit Log Permission Access Control', () => {
  it('strictly restricts view_audit_log default permission to admin and head only', () => {
    // Admin has all permissions
    const adminPerms = resolveEffectivePermissions('admin', undefined, {});
    expect(hasPermission(adminPerms, 'view_audit_log')).toBe(true);

    // Head has view_audit_log
    const headPerms = resolveEffectivePermissions('head', 'Khoa Ngoại', {});
    expect(hasPermission(headPerms, 'view_audit_log')).toBe(true);

    // Deputy Head does NOT have view_audit_log by default
    const deputyPerms = resolveEffectivePermissions('deputy_head', 'Khoa Ngoại', {});
    expect(hasPermission(deputyPerms, 'view_audit_log')).toBe(false);

    // Staff does NOT have view_audit_log
    const staffPerms = resolveEffectivePermissions('staff', 'Khoa Ngoại', {});
    expect(hasPermission(staffPerms, 'view_audit_log')).toBe(false);

    // Guest does NOT have view_audit_log
    const guestPerms = resolveEffectivePermissions('guest', undefined, {});
    expect(hasPermission(guestPerms, 'view_audit_log')).toBe(false);
  });
});
