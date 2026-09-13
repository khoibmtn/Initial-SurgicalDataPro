import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveDepartmentStaffPermissions,
  resolveEffectivePermissions,
  hasPermission,
} from '../services/permissionService';

describe('RBAC Permission Ceiling & Resolution', () => {
  it('should have 14 total defined system permissions', () => {
    expect(ALL_PERMISSIONS.length).toBe(14);
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
      staff: DEFAULT_ROLE_PERMISSIONS.staff,
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
      expect(hasPermission(perms, 'system_config')).toBe(false);
    });

    it('should grant department-constrained permissions to staff', () => {
      const deptPerms = ['view_daily_report', 'view_statistics'];
      const perms = resolveEffectivePermissions('staff', 'Ngoại Tổng Hợp', globalPerms, deptPerms);
      expect(perms).toEqual(['view_daily_report', 'view_statistics']);
      expect(hasPermission(perms, 'view_daily_report')).toBe(true);
      expect(hasPermission(perms, 'edit_report')).toBe(false);
    });

    it('should grant all permissions to guest during Guest-First phase', () => {
      const perms = resolveEffectivePermissions('guest', undefined, globalPerms);
      expect(perms.length).toBe(ALL_PERMISSIONS.length);
    });
  });
});
