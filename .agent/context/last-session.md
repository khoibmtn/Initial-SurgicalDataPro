# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 01/10/2026 17:15 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `main` (remote: `origin/main`), đã đồng bộ hoàn toàn với `version2` (`origin/version2`)  
> **Commit mới nhất (main & version2):** `241c121` (`fix(app): resolve TDZ ReferenceError for useAuth in AppContent`)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build, dist/assets/index-CL2lkbLa.js)`  
> **Trạng thái Test:** `290 / 290 tests PASS` (19 test suites, 100% pass)  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Chuẩn Hóa Logic Ca Trực 24h & Ngoài Giờ Tại Các Mốc Giao Mùa
- **Bối cảnh quy định**:
  - Giờ làm việc Mùa Hè (01/05 – 30/09): Sáng từ 07:00 đến 11:30.
  - Giờ làm việc Mùa Đông (01/10 – 30/04 năm sau): Sáng từ 07:30 đến 12:00.
- **Tính toán mốc thời gian chuyển tiếp (Boundary Conditions)**:
  - **Tua trực ngày 30/09**: Bắt đầu lúc 07:00 ngày 30/09 và kết thúc vào giờ làm việc hành chính sáng hôm sau (ngày 01/10 bắt đầu mùa đông lúc 07:30, do đó ca trực kéo dài đến **07:29 ngày 01/10** — dài hơn 30 phút so với các ngày thường).
  - **Tua trực ngày 30/04**: Bắt đầu lúc 07:30 ngày 30/04 và kết thúc vào giờ làm việc hành chính sáng hôm sau (ngày 01/05 bắt đầu mùa hè lúc 07:00, do đó ca trực kết thúc lúc **06:59 ngày 01/05** — ngắn hơn 30 phút so với các ngày thường).
- **Đồng bộ hóa Nút bấm "Lấy dữ liệu trực" & Logic Tính Ngoài Giờ (`overtimeCalculation.ts`)**:
  - Khắc phục triệt để sai lệch lấy thiếu/thừa 30 phút ở cả 2 nút lấy dữ liệu tự động.
  - Hàm xác định ngoài giờ `isOvertimeSurgery` sử dụng thời điểm giữa cuộc mổ (`midPoint`) đối chiếu chính xác theo từng phút với khung giờ chuyển mùa này.
  - Đã bổ sung 26/26 bộ unit test chuyên biệt trong `__tests__/overtimeCalculation.test.ts`.

---

### 1.2. Nâng Cấp Xác Thực: Bắt Buộc Số Điện Thoại & Đăng Nhập Linh Hoạt
- **Bắt buộc số điện thoại khi đăng ký**:
  - Trường `phoneNumber` được lưu trữ dạng chuỗi văn bản (`string`) để bảo tồn số `0` ở đầu.
  - Kiểm tra tính duy nhất (Unique check) trên hệ cơ sở dữ liệu: không cho phép đăng ký trùng số điện thoại.
  - Validate định dạng số điện thoại chuẩn Việt Nam (10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09).
- **Hỗ trợ đăng nhập đa kênh**:
  - Người dùng có thể đăng nhập bằng **Nickname/Username** HOẶC **Số điện thoại** cùng với mật khẩu.
  - Cập nhật giao diện `LoginModal.tsx` và dịch vụ `authService.ts`.

---

### 1.3. Hệ Thống Ghi Dấu Thao Tác (Audit Log) & Lịch Sử Đăng Nhập
- **Ghi nhận toàn diện các hành vi**:
  - Đăng nhập, đăng xuất, đổi mật khẩu.
  - Thêm, sửa, xóa ca phẫu thuật / thủ thuật.
  - Khóa / mở khóa báo cáo ngày và báo cáo tháng.
  - Xuất dữ liệu Excel, cập nhật danh mục, cấu hình hệ thống.
- **Phân quyền bảo mật cao cấp (Admin & Trưởng khoa)**:
  - Chỉ tài khoản có vai trò **Admin (`isAdmin`)** hoặc **Trưởng khoa (`isHead`)** mới có quyền truy cập tab Nhật ký thao tác và Lịch sử đăng nhập.
  - Toàn bộ các tài khoản khác bị chặn cả ở mức giao diện người dùng và API/Service rules.
  - Bổ sung 19 bài kiểm thử chuyên sâu trong `__tests__/auditLog.test.ts` và `__tests__/authPhoneAndAudit.test.ts`.

---

### 1.4. Khắc Phục Lỗi Production Temporal Dead Zone (TDZ)
- **Hiện tượng**: Bản build production tại `https://initial-surgical-data-pro.vercel.app` gặp sự cố tải do ErrorBoundary bắt lỗi `Cannot access 'le' before initialization`.
- **Nguyên nhân**: Trong `App.tsx`, `useDutyScheduleState` được gọi với tham số `currentUser: user` trước khi khai báo `const { user, ... } = useAuth();`.
- **Xử lý**: Đã di chuyển dòng `const { user, isAdmin, isHead, currentRole, can } = useAuth();` lên trước `useDutyScheduleState`.
- **Kiểm thử**: Đã chạy Browser Subagent kiểm tra trực tiếp môi trường Localhost Preview và Vercel Production, xác nhận hệ thống tải mượt mà 100%, không còn bất kỳ lỗi khởi tạo nào.

---

## 📐 2. Cấu Trúc Dữ Liệu & Schema Trọng Điểm

### 2.1. Audit Log Schema (`types/auditLog.ts`)
```typescript
export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'LOCK_REPORT' | 'UNLOCK_REPORT' | 'EXPORT_EXCEL' | 'CONFIG_CHANGE';
  targetType: 'SURGERY' | 'DUTY_SCHEDULE' | 'SERVICE_PACKAGE' | 'REPORT_LOCK' | 'SYSTEM_CONFIG' | 'AUTH';
  targetId?: string;
  details?: string;
  previousData?: any;
  newData?: any;
  ipAddress?: string;
  timestamp: number;
}
```

### 2.2. User Profile Schema với Phone Number
```typescript
export interface UserProfile {
  uid: string;
  username: string;
  fullName: string;
  phoneNumber: string;       // Lưu dạng chuỗi text: '0987654321'
  role: 'admin' | 'head' | 'doctor' | 'nurse' | 'viewer';
  departmentId?: string;
  active: boolean;
  createdAt: number;
  lastLoginAt?: number;
}
```

---

## 🚀 3. Trạng Thái Git, Build & Deploy

- **Nhánh `main` & `version2`**: Đã merge và push đầy đủ lên GitHub remote (`origin/main`, `origin/version2`).
- **Commit mới nhất**: `241c121` (`fix(app): resolve TDZ ReferenceError for useAuth in AppContent`).
- **Kiểm thử (Vitest)**: **19 test suites, 290 / 290 tests PASS (100%)**.
- **Build (Vite v6.4.1)**: Build production bundle thành công không có lỗi.
- **Deploy**:
  - Vercel Production: `https://initial-surgical-data-pro.vercel.app` (Đang hoạt động ổn định).
- **Tuân thủ quy chuẩn**:
  - Clean Code, AAA Testing pattern.
  - Tuân thủ nghiêm ngặt quy tắc Purple Ban và giao diện y tế cao cấp.
