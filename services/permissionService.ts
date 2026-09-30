// ─── Permission Service ───────────────────────────────────────────────────────
// Định nghĩa danh mục quyền và thuật toán giải quyết quyền phân cấp (RBAC)
// Nguyên tắc: Admin cấp trần quyền (ceiling) → Trưởng khoa có thể thu hẹp cho khoa mình

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  category: 'Dữ liệu' | 'Thống kê' | 'Cấu hình' | 'Quản trị';
}

/** Danh sách 16 quyền trong hệ thống */
export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // ── Dữ liệu & Báo cáo ──
  { key: 'view_daily_report', label: 'Xem BC hàng ngày', description: 'Xem báo cáo phẫu thuật hàng ngày', category: 'Dữ liệu' },
  { key: 'view_monthly_report', label: 'Xem BC tháng', description: 'Xem báo cáo tổng hợp theo tháng', category: 'Dữ liệu' },
  { key: 'edit_report', label: 'Chỉnh sửa BC', description: 'Thêm, sửa, xóa bản ghi phẫu thuật', category: 'Dữ liệu' },
  { key: 'import_excel', label: 'Nhập Excel', description: 'Import dữ liệu từ file Excel', category: 'Dữ liệu' },
  { key: 'export_excel', label: 'Xuất Excel', description: 'Export dữ liệu ra file Excel', category: 'Dữ liệu' },
  { key: 'lock_report', label: 'Khóa sổ báo cáo', description: 'Khóa hoặc mở khóa chốt số liệu báo cáo tháng', category: 'Dữ liệu' },
  // ── Thống kê ──
  { key: 'view_statistics', label: 'Xem thống kê', description: 'Xem trang thống kê tổng hợp', category: 'Thống kê' },
  { key: 'view_cost_report', label: 'Xem chi phí', description: 'Xem báo cáo chi phí phẫu thuật', category: 'Thống kê' },
  // ── Cấu hình ──
  { key: 'manage_norms', label: 'Quản lý định mức', description: 'Thay đổi định mức phụ cấp, thời gian', category: 'Cấu hình' },
  { key: 'manage_dmkt', label: 'Quản lý DMKT', description: 'Quản lý danh mục kỹ thuật, giá', category: 'Cấu hình' },
  { key: 'manage_staff', label: 'Quản lý nhân viên', description: 'Danh sách nhân viên, khoa phòng', category: 'Cấu hình' },
  { key: 'manage_admin_settings', label: 'Hành chính', description: 'Được phép truy cập và sửa mục Hành chính', category: 'Cấu hình' },
  // ── Quản trị ──
  { key: 'view_audit_log', label: 'Xem lưu vết', description: 'Xem lịch sử các thao tác chỉnh sửa và lưu vết hệ thống', category: 'Quản trị' },
  { key: 'approve_users', label: 'Duyệt thành viên', description: 'Phê duyệt/từ chối tài khoản mới', category: 'Quản trị' },
  { key: 'manage_user_roles', label: 'Phân quyền', description: 'Thay đổi vai trò người dùng', category: 'Quản trị' },
  { key: 'disable_users', label: 'Khóa tài khoản', description: 'Vô hiệu hóa tài khoản người dùng', category: 'Quản trị' },
  { key: 'system_config', label: 'Cấu hình hệ thống', description: 'Bật/tắt phê duyệt, đăng nhập bắt buộc', category: 'Quản trị' },
];

/** Quyền mặc định theo từng role */
export const DEFAULT_ROLE_PERMISSIONS: Record<'head' | 'deputy_head' | 'staff' | 'guest', string[]> = {
  head: [
    'view_daily_report', 'view_monthly_report', 'edit_report',
    'import_excel', 'export_excel', 'lock_report',
    'view_statistics', 'view_cost_report',
    'manage_staff', 'manage_admin_settings',
    'approve_users', 'view_audit_log',
  ],
  deputy_head: [
    'view_daily_report', 'view_monthly_report', 'edit_report',
    'import_excel', 'export_excel', 'lock_report',
    'view_statistics', 'view_cost_report',
    'manage_staff', 'manage_admin_settings',
    'approve_users', 'view_audit_log',
  ],
  staff: [
    'view_daily_report', 'view_monthly_report', 'edit_report',
    'import_excel', 'export_excel',
    'view_statistics',
  ],
  guest: [
    'view_daily_report', 'view_monthly_report', 'edit_report',
    'import_excel', 'export_excel',
    'view_statistics', 'view_cost_report',
    'manage_norms', 'manage_dmkt', 'manage_staff', 'manage_admin_settings',
    'view_audit_log',
  ],
};

/**
 * Tính toán danh sách quyền thực tế của nhân viên một khoa,
 * tuân thủ nguyên tắc: KHÔNG BAO GIỜ vượt trần do Admin cấp cho role staff.
 *
 * @param staffCeiling Danh sách quyền mà Admin cấp cho role staff toàn viện
 * @param departmentPerms Danh sách quyền mà Trưởng khoa chọn cho nhân viên khoa mình (nếu có)
 */
export function resolveDepartmentStaffPermissions(
  staffCeiling: string[],
  departmentPerms: string[] | null | undefined
): string[] {
  // Nếu khoa chưa từng tùy chỉnh quyền, mặc định áp dụng toàn bộ trần quyền của Admin
  if (!departmentPerms) {
    return [...staffCeiling];
  }
  // Thu hẹp quyền: chỉ giữ lại những quyền nằm trong trần quyền Admin cho phép
  return departmentPerms.filter((p) => staffCeiling.includes(p));
}

/**
 * Tính toán danh sách quyền hiệu lực của người dùng
 */
export function resolveEffectivePermissions(
  userRole: string,
  _department: string | undefined,
  globalRolePerms: { head?: string[]; deputy_head?: string[]; staff?: string[]; guest?: string[] },
  departmentStaffPerms?: string[] | null
): string[] {
  if (userRole === 'admin') {
    return ALL_PERMISSIONS.map((p) => p.key);
  }
  if (userRole === 'head') {
    return globalRolePerms.head || DEFAULT_ROLE_PERMISSIONS.head;
  }
  if (userRole === 'deputy_head') {
    return globalRolePerms.deputy_head || DEFAULT_ROLE_PERMISSIONS.deputy_head;
  }
  if (userRole === 'staff') {
    const staffCeiling = globalRolePerms.staff || DEFAULT_ROLE_PERMISSIONS.staff;
    return resolveDepartmentStaffPermissions(staffCeiling, departmentStaffPerms);
  }
  if (userRole === 'guest') {
    return globalRolePerms.guest || DEFAULT_ROLE_PERMISSIONS.guest;
  }
  return DEFAULT_ROLE_PERMISSIONS.guest;
}

/**
 * Kiểm tra người dùng có một quyền cụ thể không
 */
export function hasPermission(effectivePermissions: string[], permissionKey: string): boolean {
  return effectivePermissions.includes(permissionKey);
}
