import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveDepartmentStaffPermissions,
  resolveEffectivePermissions,
  normalizeStoredRolePermissions,
  hasPermission,
} from '../services/permissionService';

describe('RBAC Permission Ceiling & Resolution', () => {
  it('should have 26 total defined system permissions including Lịch mổ, Trợ lý AI, lock_report, view_audit_log, manage_admin_settings, and Gói DVKT permissions', () => {
    expect(ALL_PERMISSIONS.length).toBe(26);
    expect(ALL_PERMISSIONS.some((p) => p.key === 'lock_report')).toBe(true);
    expect(ALL_PERMISSIONS.some((p) => p.key === 'view_audit_log')).toBe(true);
    expect(ALL_PERMISSIONS.some((p) => p.key === 'manage_admin_settings')).toBe(true);

    // Trợ lý AI permissions (mặc định chỉ bật cho Admin và Trưởng khoa)
    const aiPermKeys = ['use_ai_assistant', 'config_ai_settings'];
    for (const key of aiPermKeys) {
      const perm = ALL_PERMISSIONS.find((p) => p.key === key);
      expect(perm).toBeDefined();
      expect(perm?.category).toBe('Trợ lý AI');
      expect(DEFAULT_ROLE_PERMISSIONS.head).toContain(key);
      expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).not.toContain(key);
      expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain(key);
      expect(DEFAULT_ROLE_PERMISSIONS.guest).not.toContain(key);
    }

    // Lịch mổ permissions
    const schedulePermKeys = ['manage_schedule', 'lock_schedule', 'unlock_schedule'];
    for (const key of schedulePermKeys) {
      const perm = ALL_PERMISSIONS.find((p) => p.key === key);
      expect(perm).toBeDefined();
      expect(perm?.category).toBe('Lịch mổ');
    }

    // manage_schedule: bật mặc định cho tất cả mọi người (trừ khách)
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('manage_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('manage_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).toContain('manage_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).not.toContain('manage_schedule');

    // lock_schedule & unlock_schedule: bật mặc định cho Trưởng khoa & Phó khoa
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('lock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('unlock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('lock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('unlock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('lock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('unlock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).not.toContain('lock_schedule');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).not.toContain('unlock_schedule');

    // Gói DVKT permissions
    const packagePermKeys = ['view_service_package', 'assign_service_package', 'manage_package_payment', 'config_service_package'];
    for (const key of packagePermKeys) {
      const perm = ALL_PERMISSIONS.find((p) => p.key === key);
      expect(perm).toBeDefined();
      expect(perm?.category).toBe('Gói DVKT');
    }

    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('view_service_package');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('assign_service_package');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('manage_package_payment');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('config_service_package');

    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('manage_package_payment');
    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('config_service_package');

    expect(DEFAULT_ROLE_PERMISSIONS.staff).toContain('view_service_package');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).toContain('assign_service_package');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('manage_package_payment');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('config_service_package');

    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('lock_report');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('view_audit_log');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('manage_admin_settings');
    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('manage_admin_settings');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).toContain('manage_admin_settings');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).toContain('view_daily_report');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).toContain('view_service_package');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).not.toContain('approve_users');
  });

  it('should auto-backfill Lịch mổ and Trợ lý AI permissions on legacy RTDB role_permissions and respect explicit toggles when initialized', () => {
    const legacyRtdb = {
      head: ['view_daily_report'],
      deputy_head: ['view_daily_report'],
      staff: ['view_daily_report'],
      guest: ['view_daily_report'],
    };
    const normalized = normalizeStoredRolePermissions(legacyRtdb);
    expect(normalized.head).toEqual([
      'view_daily_report',
      'manage_schedule',
      'lock_schedule',
      'unlock_schedule',
      'use_ai_assistant',
      'config_ai_settings',
    ]);
    expect(normalized.deputy_head).toEqual(['view_daily_report', 'manage_schedule', 'lock_schedule', 'unlock_schedule']);
    expect(normalized.staff).toEqual(['view_daily_report', 'manage_schedule']);
    expect(normalized.guest).toEqual(['view_daily_report']);

    const initializedRtdb = {
      head: ['view_daily_report'],
      deputy_head: ['view_daily_report'],
      staff: ['view_daily_report'],
      guest: ['view_daily_report'],
      _schedulePermsInitialized: true,
      _aiPermsInitialized: true,
    };
    const respected = normalizeStoredRolePermissions(initializedRtdb);
    expect(respected.head).toEqual(['view_daily_report']);
    expect(respected.staff).toEqual(['view_daily_report']);
  });

  describe('resolveDepartmentStaffPermissions (Ceiling Enforcement)', () => {
    const adminStaffCeiling = [
      'view_daily_report',
      'view_monthly_report',
      'edit_report',
      'import_excel',
      'export_excel',
      'view_statistics',
    ];

    it('should return all ceiling permissions if department has not set custom perms', () => {
      const result = resolveDepartmentStaffPermissions(adminStaffCeiling, null);
      expect(result).toEqual(adminStaffCeiling);
    });

    it('should allow department head to narrow permissions', () => {
      // Head removes edit_report and export_excel
      const headCustomPerms = ['view_daily_report', 'view_monthly_report', 'view_statistics'];
      const result = resolveDepartmentStaffPermissions(adminStaffCeiling, headCustomPerms);
      expect(result).toEqual(['view_daily_report', 'view_monthly_report', 'view_statistics']);
    });

    it('CRITICAL: must reject permissions exceeding Admin ceiling', () => {
      // Head attempts to grant 'manage_norms' or 'system_config' to staff
      const headIllegallyExpandedPerms = [
        'view_daily_report',
        'manage_norms',
        'system_config',
        'approve_users',
      ];
      const result = resolveDepartmentStaffPermissions(adminStaffCeiling, headIllegallyExpandedPerms);
      // Only view_daily_report is allowed since others are not in adminStaffCeiling
      expect(result).toEqual(['view_daily_report']);
      expect(result).not.toContain('manage_norms');
      expect(result).not.toContain('system_config');
      expect(result).not.toContain('approve_users');
    });
  });

  describe('resolveEffectivePermissions', () => {
    const globalPerms = {
      head: DEFAULT_ROLE_PERMISSIONS.head,
      deputy_head: DEFAULT_ROLE_PERMISSIONS.deputy_head,
      staff: DEFAULT_ROLE_PERMISSIONS.staff,
      guest: DEFAULT_ROLE_PERMISSIONS.guest,
    };

    it('should grant all permissions to admin', () => {
      const perms = resolveEffectivePermissions('admin', undefined, globalPerms);
      expect(perms.length).toBe(ALL_PERMISSIONS.length);
      expect(hasPermission(perms, 'system_config')).toBe(true);
      expect(hasPermission(perms, 'manage_user_roles')).toBe(true);
    });

    it('should grant head permissions to department head', () => {
      const perms = resolveEffectivePermissions('head', 'Ngoại Tổng Hợp', globalPerms);
      expect(hasPermission(perms, 'approve_users')).toBe(true);
      expect(hasPermission(perms, 'manage_admin_settings')).toBe(true);
      expect(hasPermission(perms, 'view_audit_log')).toBe(true);
      expect(hasPermission(perms, 'system_config')).toBe(false);
    });

    it('should grant deputy_head permissions to deputy department head (excluding audit log)', () => {
      const perms = resolveEffectivePermissions('deputy_head', 'Ngoại Tổng Hợp', globalPerms);
      expect(hasPermission(perms, 'approve_users')).toBe(true);
      expect(hasPermission(perms, 'lock_report')).toBe(true);
      expect(hasPermission(perms, 'view_audit_log')).toBe(false);
      expect(hasPermission(perms, 'manage_admin_settings')).toBe(true);
      expect(hasPermission(perms, 'system_config')).toBe(false);
    });

    it('should grant department-constrained permissions to deputy_head', () => {
      const deputyDeptPerms = ['view_daily_report', 'lock_report'];
      const perms = resolveEffectivePermissions(
        'deputy_head',
        'Ngoại Tổng Hợp',
        globalPerms,
        undefined,
        deputyDeptPerms
      );
      expect(perms).toEqual(['view_daily_report', 'lock_report']);
      expect(hasPermission(perms, 'view_daily_report')).toBe(true);
      expect(hasPermission(perms, 'lock_report')).toBe(true);
      expect(hasPermission(perms, 'approve_users')).toBe(false);
    });

    it('should grant department-constrained permissions to staff', () => {
      const deptPerms = ['view_daily_report', 'view_statistics'];
      const perms = resolveEffectivePermissions('staff', 'Ngoại Tổng Hợp', globalPerms, deptPerms);
      expect(perms).toEqual(['view_daily_report', 'view_statistics']);
      expect(hasPermission(perms, 'view_daily_report')).toBe(true);
      expect(hasPermission(perms, 'edit_report')).toBe(false);
    });

    it('should grant operational permissions to guest based on global guest permissions', () => {
      const perms = resolveEffectivePermissions('guest', undefined, globalPerms);
      expect(perms).toEqual(DEFAULT_ROLE_PERMISSIONS.guest);
      expect(hasPermission(perms, 'view_daily_report')).toBe(true);
      expect(hasPermission(perms, 'manage_admin_settings')).toBe(true);
      expect(hasPermission(perms, 'manage_norms')).toBe(true);
      expect(hasPermission(perms, 'approve_users')).toBe(false);
      expect(hasPermission(perms, 'system_config')).toBe(false);
    });
  });
});
