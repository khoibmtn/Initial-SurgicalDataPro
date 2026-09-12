// ─── Auth Types & Interfaces ─────────────────────────────────────────────────
// Hệ thống phân quyền 3 cấp: Admin → Trưởng khoa → Nhân viên + Guest tạm thời

/** Vai trò người dùng trong hệ thống */
export type UserRole = 'admin' | 'head' | 'staff';

/** Trạng thái tài khoản */
export type UserStatus = 'active' | 'pending' | 'disabled';

/** Thông tin người dùng đầy đủ (đồng bộ với Firestore doc users/{uid}) */
export interface AppUser {
  uid: string;
  nickname: string;
  displayName: string;
  email: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Danh sách quyền cụ thể — Phase 2+ */
  permissions: string[];
}

/** Trạng thái auth của app */
export interface AuthState {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** true nếu user đang đăng nhập nhưng chưa được duyệt */
  isPendingApproval: boolean;
}

/** Cấu hình auth mức hệ thống (lưu trong app_config trên Realtime DB) */
export interface AuthConfig {
  /** Bắt buộc đăng nhập mới dùng app (false = Guest vào thẳng) */
  requireLogin: boolean;
  /** Bật phê duyệt thành viên mới (true = pending, false = active ngay) */
  requireApproval: boolean;
  /** Đã khóa Guest chưa */
  guestDisabled: boolean;
}

/** Dữ liệu đăng ký tài khoản nhân viên */
export interface RegisterData {
  nickname: string;
  password: string;
  displayName: string;
  department: string;
}

/** Kết quả thao tác auth */
export interface AuthResult {
  success: boolean;
  error?: string;
  user?: AppUser;
}

/** Hằng số email domain cho nickname-based auth */
export const NICKNAME_EMAIL_DOMAIN = 'sdp.local';

/** Tạo email ảo từ nickname */
export function nicknameToEmail(nickname: string): string {
  return `${nickname.toLowerCase().trim()}@${NICKNAME_EMAIL_DOMAIN}`;
}

/** Kiểm tra email có phải email ảo (từ nickname) không */
export function isNicknameEmail(email: string): boolean {
  return email.endsWith(`@${NICKNAME_EMAIL_DOMAIN}`);
}

/** Trích xuất nickname từ email ảo */
export function emailToNickname(email: string): string {
  if (isNicknameEmail(email)) {
    return email.replace(`@${NICKNAME_EMAIL_DOMAIN}`, '');
  }
  return email;
}
