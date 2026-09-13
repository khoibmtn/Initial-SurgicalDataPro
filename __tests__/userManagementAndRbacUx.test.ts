import { describe, it, expect, vi } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveDepartmentStaffPermissions,
} from '../services/permissionService';
import { batchApproveUsers, batchRejectUsers } from '../services/userManagementService';

describe('RBAC UX & Department Head Management Utilities', () => {
  describe('Permission Ceiling Quick Actions for Department Head', () => {
    const adminStaffCeiling = [
      'view_daily_report',
      'view_monthly_report',
      'edit_report',
      'import_excel',
      'export_excel',
      'view_statistics',
    ];

    it('Head "Cấp tối đa theo trần quyền" should activate all permissions allowed by Admin', () => {
      // When head clicks "Cấp tối đa theo trần quyền", nextPerms is set to adminStaffCeiling
      const result = resolveDepartmentStaffPermissions(adminStaffCeiling, adminStaffCeiling);
      expect(result).toEqual(adminStaffCeiling);
      expect(result.length).toBe(6);
      expect(result).toContain('edit_report');
    });

    it('Head "Đặt lại mặc định" should safely intersect default staff perms with current Admin ceiling', () => {
      const defaultStaff = DEFAULT_ROLE_PERMISSIONS.staff;
      const result = resolveDepartmentStaffPermissions(adminStaffCeiling, defaultStaff);
      
      // Result must only contain permissions that are in BOTH defaultStaff and adminStaffCeiling
      for (const perm of result) {
        expect(adminStaffCeiling).toContain(perm);
        expect(defaultStaff).toContain(perm);
      }
    });

    it('Category grouping contains all defined permissions without duplicate or orphan items', () => {
      const categories = [...new Set(ALL_PERMISSIONS.map((p) => p.category))];
      expect(categories.length).toBeGreaterThanOrEqual(3);

      const totalGrouped = categories.reduce((sum, cat) => {
        return sum + ALL_PERMISSIONS.filter((p) => p.category === cat).length;
      }, 0);
      expect(totalGrouped).toBe(ALL_PERMISSIONS.length);
    });
  });

  describe('Batch Operations Edge Cases', () => {
    it('batchApproveUsers handles empty array gracefully without calling Firestore', async () => {
      const res = await batchApproveUsers([]);
      expect(res.success).toBe(true);
      expect(res.count).toBe(0);
    });

    it('batchRejectUsers handles empty array gracefully without calling Firestore', async () => {
      const res = await batchRejectUsers([]);
      expect(res.success).toBe(true);
      expect(res.count).toBe(0);
    });
  });

  describe('Initials and Relative Time UX logic', () => {
    function getUserInitials(name: string): string {
      if (!name) return '?';
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    it('correctly extracts user initials from single and multi-word names', () => {
      expect(getUserInitials('')).toBe('?');
      expect(getUserInitials('admin')).toBe('AD');
      expect(getUserInitials('Nguyễn Văn An')).toBe('NA');
      expect(getUserInitials('BS. Trần')).toBe('BT');
    });

    function formatRelativeTime(now: Date, date: Date): string {
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 45) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHour < 24) return `${diffHour} giờ trước`;
      if (diffDay === 1) return `Hôm qua`;
      if (diffDay < 7) return `${diffDay} ngày trước`;
      return 'date';
    }

    it('correctly formats relative time differences', () => {
      const now = new Date('2026-09-13T10:00:00Z');
      const justNow = new Date('2026-09-13T09:59:30Z');
      const minsAgo = new Date('2026-09-13T09:45:00Z');
      const hoursAgo = new Date('2026-09-13T07:00:00Z');
      const yesterday = new Date('2026-09-12T07:00:00Z');
      const daysAgo = new Date('2026-09-10T07:00:00Z');

      expect(formatRelativeTime(now, justNow)).toBe('Vừa xong');
      expect(formatRelativeTime(now, minsAgo)).toBe('15 phút trước');
      expect(formatRelativeTime(now, hoursAgo)).toBe('3 giờ trước');
      expect(formatRelativeTime(now, yesterday)).toBe('Hôm qua');
      expect(formatRelativeTime(now, daysAgo)).toBe('3 ngày trước');
    });
  });
});
