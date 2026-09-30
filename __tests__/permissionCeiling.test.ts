import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveDepartmentStaffPermissions,
  resolveEffectivePermissions,
  hasPermission,
} from '../services/permissionService';

describe('RBAC Permission Ceiling & Resolution', () => {
  it('should have 17 total defined system permissions including lock_report, view_audit_log, and manage_admin_settings', () => {
    expect(ALL_PERMISSIONS.length).toBe(17);
    expect(ALL_PERMISSIONS.some((p) => p.key === 'lock_report')).toBe(true);
    expect(ALL_PERMISSIONS.some((p) => p.key === 'view_audit_log')).toBe(true);
    expect(ALL_PERMISSIONS.some((p) => p.key === 'manage_admin_settings')).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('lock_report');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('view_audit_log');
    expect(DEFAULT_ROLE_PERMISSIONS.head).toContain('manage_admin_settings');
    expect(DEFAULT_ROLE_PERMISSIONS.deputy_head).toContain('manage_admin_settings');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).toContain('manage_admin_settings');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).toContain('view_daily_report');
    expect(DEFAULT_ROLE_PERMISSIONS.guest).not.toContain('approve_users');
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
      expect(hasPermission(perms, 'system_config')).toBe(false);
    });

    it('should grant deputy_head permissions to deputy department head', () => {
      const perms = resolveEffectivePermissions('deputy_head', 'Ngoại Tổng Hợp', globalPerms);
      expect(hasPermission(perms, 'approve_users')).toBe(true);
      expect(hasPermission(perms, 'lock_report')).toBe(true);
      expect(hasPermission(perms, 'view_audit_log')).toBe(true);
      expect(hasPermission(perms, 'manage_admin_settings')).toBe(true);
      expect(hasPermission(perms, 'system_config')).toBe(false);
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
