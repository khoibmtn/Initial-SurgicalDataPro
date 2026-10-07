# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 07/10/2026 18:10 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-07-10-2026-18h04` (dựa trên `main` commit `6b419a9`)  
> **Remote:** `origin/main` đã push đầy đủ lên GitHub  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build, 6.87s)`  
> **Trạng thái Test:** `418 / 418 tests PASS` (33 test suites, 100% pass)  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Tối Ưu Tốc Độ Tải Dữ Liệu Đồng Thời (Tab Gói DVYC & Thanh Toán)
- **Vấn đề trước đây:**
  - Khi lấy danh sách phẫu thuật (BC ngày hoặc BC tháng), tab Gói DVYC hiện badge (ví dụ: `2 NEW` hoặc `89 ca`), nhưng khi người dùng mở tab thì bảng lại trống trơn ("Chưa có ca phù hợp với bộ lọc hiện tại"), phải mất 3-10 giây sau mới hiện danh sách.
  - Nguyên nhân: Bảng `PackageListView` chỉ lặp duyệt qua `records` (danh sách phẫu thuật đã xử lý). Trong khi danh sách phẫu thuật còn đang chạy tuần tự các tác vụ đồng bộ giá và tính toán ngoài giờ, `records` tạm thời rỗng `[]` khiến bảng bị rỗng.
- **Giải pháp triển khai:**
  1. **Instant Fallback Rendering (`PackageListView.tsx`):**
     - Trong `enrichedRecords`, ngoài việc khớp qua `records`, hệ thống đồng thời đưa ngay các ca đã có trong `assignments` vào danh sách hiển thị với thông tin fallback đầy đủ (Mã KCB, Họ tên, Kỹ thuật mổ, Ngày mổ, Kíp mổ: PTV chính, PTV phụ, BS GM, KTV GM, TĐC, GV...).
     - Khi `records` phẫu thuật nạp xong, hệ thống tự động làm giàu thêm các dữ liệu phụ trợ (khoa, thời gian mổ, cảnh báo) mà không gây giật lag hay trắng bảng.
  2. **Tải song song (Parallel Pre-loading trong `hooks/useStorageQuery.ts`):**
     - Ngay khi người dùng nhấn "Lấy dữ liệu" hoặc "Dữ liệu trực", hệ thống lập tức phát tín hiệu `isProcessing: true` và cập nhật khoảng ngày truy vấn.
     - Tác vụ nạp phẫu thuật (`getReports`), nạp gói dịch vụ (`subscribeToAssignments`), nạp đợt thanh toán (`subscribeToPaymentLists`) chạy đồng thời thay vì tuần tự.
  3. **Eager Prefetch (`hooks/usePaymentLists.ts`):**
     - Bổ sung cờ `isLoading` (`isListsLoading` || `isRecordsLoading`).
     - Tự động nạp trước hồ sơ bệnh nhân của đợt thanh toán đang chọn trong nền ngay khi danh mục đợt thanh toán được tải về.
  4. **Hiển thị Skeleton Loading Animation:**
     - Khi dữ liệu đang truy vấn ban đầu (`isProcessing` hoặc `isLoading`), bảng hiển thị 5 hàng Skeleton pulse animation mô phỏng đúng cấu trúc các cột thay vì thông báo "Chưa có ca phù hợp".
     - Bảng `PackagePaymentTable` hiển thị spinner và thông báo trạng thái xoay tròn khi đang đồng bộ.

---

### 1.2. Chức Năng Đổi Mật Khẩu Cá Nhân (User Change Password)
- **Vị trí thao tác:**
  - Nhấp vào **Avatar / Tên tài khoản** ở góc dưới cùng bên trái thanh Sidebar ➔ Chọn menu **"Đổi mật khẩu"** (biểu tượng chìa khóa 🔑).
- **Cơ chế an toàn & xác thực:**
  - Thành phần [ChangePasswordModal.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/auth/ChangePasswordModal.tsx) kết nối trực tiếp với [authService.ts](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/services/authService.ts#changeUserPassword).
  - Yêu cầu xác thực lại bằng Mật khẩu hiện tại qua `reauthenticateWithCredential` của Firebase Auth.
  - Kiểm tra mật khẩu mới: độ dài tối thiểu 6 ký tự, đối chiếu khớp mật khẩu xác nhận.
  - Nút bật/tắt con mắt 👁️ để ẩn/hiện mật khẩu.
  - Tự động xóa cờ mật khẩu mặc định (`passwordResetDefault: false`) trong Firestore.
  - Ghi nhận lịch sử thao tác vào hệ thống **Nhật ký (Audit Log)** với hành động `UPDATE_PASSWORD`.

---

### 1.3. Nâng Cao Độ Tương Phản Nút Bấm Cho Màn Hình Độ Phân Giải Thấp / Tấm Nền TN
- **Vấn đề:** Các màn hình văn phòng/bệnh viện tấm nền TN hoặc độ tương phản thấp dễ làm lóa hoặc chìm các nút màu pastel nhạt (`bg-teal-50`, `border-teal-200`).
- **Chuẩn hóa màu sắc độ tương phản cao:**
  - **Nút "+ Gán gói DV":** Đổi sang nền xanh ngọc đậm đặc (`bg-emerald-700 hover:bg-emerald-800`), chữ trắng in đậm (`text-white font-bold`), viền đậm `border-emerald-800` với shadow rõ ràng.
  - **Nút "Tạo đợt mới":** Đổi sang nền `bg-emerald-700 hover:bg-emerald-800 border-emerald-800 text-white font-bold`.
  - **Nút "Gói DV ({count})" trên Toolbar DS Phẫu thuật:** Nền `bg-emerald-700 text-white font-bold`.
  - **Nút "Chuyển ca / chuyển đợt" (`ArrowRightLeft`):** Đóng khung viền nổi bật (`border border-slate-300 bg-white hover:bg-primary-50 text-slate-700 hover:text-primary-700 shadow-2xs`).
  - **Nút "Xác nhận chuyển" trong Modal chuyển đợt:** Đổi sang xanh dương đậm chuẩn như nút *Lấy dữ liệu* (`bg-primary-700 hover:bg-primary-800 border border-primary-800 text-white font-bold`).
  - **Badge hiển thị gói DV đã gán:** Nâng độ tương phản viền và chữ (`bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold`).

---

### 1.4. Quản Lý Đợt Thanh Toán Gói Dịch Vụ & Tra Cứu Chéo Kỳ
- **Phân hệ Đợt thanh toán (`usePaymentLists.ts`, `PackageListView.tsx`):**
  - Hỗ trợ tạo đợt mới, khóa đợt thanh toán (ngăn chỉnh sửa khi đã chốt), di chuyển ca giữa các đợt, xóa ca khỏi đợt (vẫn giữ gói yêu cầu).
  - Tra cứu chéo kỳ: Cho phép ca phẫu thuật ở tháng trước được nạp vào đợt thanh toán của tháng sau mà không bị mất dữ liệu.
  - 3 bộ lọc độc lập: Lọc theo Gói DVYC (Tất cả / Đã gán / Chưa gán), Lọc theo Đợt TT (Tất cả / Đã có đợt / Chưa có đợt), Lọc theo Ra viện (Tất cả / Đã RV / Chưa có thông tin).
- **Xuất Excel Gói DVYC chuẩn (`servicePackageExportService.ts`):**
  - Header tiêu đề bảng tự động cập nhật theo nguồn dữ liệu: "Lấy dữ liệu từ Tháng X - YYYY" hoặc "Lấy dữ liệu từ đợt thanh toán yêu cầu ở danh sách 'tên danh sách' - năm".
  - Tiêu đề các cột nhân lực hiển thị tên viết tắt cấu hình theo vị trí trong gói.
  - Tự động bật Wrap text trên tất cả các cột.
  - Dòng tổng kết cuối bảng hiển thị tự nhiên, không gộp ô.

---

### 1.5. Khắc Phục Lỗi Báo Cáo Tháng & Giới Hạn Năm 2026
- **Xử lý dữ liệu năm & tháng (`hooks/useReportStateManager.ts`):**
  - Tự động nạp danh mục năm/tháng có dữ liệu thực tế từ Firestore qua `reportService.getAvailableMonthlyYearsAndMonths()`.
  - Giới hạn năm tối đa là 2026, loại bỏ hoàn toàn các lựa chọn năm tương lai (2027).
  - Khi chuyển đổi giữa chế độ **"Tháng"** và chế độ **"Khoảng thời gian"**, tự động đồng bộ ngày bắt đầu/kết thúc tương ứng với tháng đang chọn.

---

### 1.6. Phân Quyền & Cải Tiến Nhật Ký Hệ Thống (Audit Log)
- **Phân quyền Trưởng khoa & Phó khoa:**
  - Bổ sung phân quyền chuyên biệt cho Phó khoa, chỉ cấp quyền thao tác nội bộ khoa.
  - Ở tab "Bảng phân quyền hệ thống toàn viện", Trưởng khoa chỉ có quyền xem (chỉ Quản trị viên tối cao / Admin mới được chỉnh sửa phân quyền).
- **Bộ lọc & Định dạng Nhật ký (`AuditLogModal.tsx`):**
  - Bổ sung bộ lọc theo Khoa phòng và bộ lọc theo Ngày.
  - Hiển thị thời điểm thao tác chuẩn xác theo định dạng `dd/mm/yyyy hh:mm:ss`.

---

## 📐 2. Cấu Trúc Dữ Liệu & Interfaces Trọng Điểm

### 2.1. Service Package Assignment (`types/servicePackage.ts`)
```typescript
export interface ServicePackageAssignment {
  id?: string;
  compositeKey: string; // patientId__YYYY-MM-DD__tenKT
  patientId: string;
  patientName: string;
  ngayBD: string;
  tenKT: string;
  packageId: string;
  packageName: string;
  packageShortName?: string;
  cost?: number;
  staffAssignments: Array<{
    positionKey: string;
    positionLabel: string;
    staffId?: string;
    staffName: string;
    amount?: number;
  }>;
  ptChinh?: string;
  ptPhu?: string;
  bsGM?: string;
  ktvGM?: string;
  tdc?: string;
  gv?: string;
  createdAt?: number;
  updatedAt?: number;
}
```

### 2.2. Payment List & Membership (`types/paymentList.ts`)
```typescript
export interface PaymentListItem {
  patientId: string;
  addedAt: number;
  addedBy?: string;
}

export interface PaymentList {
  id: string;
  name: string;
  periodKey?: string;
  department?: string;
  status: 'draft' | 'locked';
  items: PaymentListItem[];
  createdAt: number;
  updatedAt: number;
}
```

### 2.3. PaymentListsContext (`hooks/usePaymentLists.ts`)
```typescript
export interface PaymentListsContext {
  lists: PaymentList[];
  allAssignments: ServicePackageAssignment[];
  membershipIndex: Map<string, MembershipEntry>;
  discharge: DischargeMap;
  records: LookupRecord[];
  ensureRecordsLoaded: () => Promise<void>;
  loadRecordsForPatients: (patientIds: string[]) => Promise<LookupRecord[]>;
  canManage: boolean;
  userName: string;
  periodKey: string;
  dateFrom?: string;
  dateTo?: string;
  isLoading?: boolean;
}
```

---

## 📂 3. Danh Sách Tệp Mã Nguồn Đã Thay Đổi Gần Nhất
1. `services/authService.ts`: Bổ sung hàm `changeUserPassword(oldPassword, newPassword)`.
2. `components/auth/ChangePasswordModal.tsx`: Component popup đổi mật khẩu hoàn chỉnh.
3. `components/auth/UserMenuButton.tsx`: Menu item "Đổi mật khẩu" tại avatar sidebar góc trái dưới.
4. `components/surgery/PackageListView.tsx`: Instant fallback rendering, Skeleton loading, nâng tương phản nút thao tác.
5. `components/surgery/PackagePaymentTable.tsx`: Hỗ trợ `isProcessing` hiển thị spinner loading khi tải.
6. `components/surgery/SurgeryTableViewRouter.tsx`: Truyền `isProcessing` an toàn xuống các tab.
7. `hooks/usePaymentLists.ts`: Thêm `isLoading`, tự động eager prefetch hồ sơ đợt thanh toán.
8. `hooks/useStorageQuery.ts`: Bật `isProcessing: true` và cập nhật ngày ngay lúc bấm "Lấy dữ liệu" để chạy tải song song.

---

## 🚀 4. Trạng Thái Triển Khai & Kiểm Thử
- **Git Branch:** `temp-07-10-2026-18h04` (Clean working tree, đã merge vào `main` và push lên GitHub).
- **Vercel Production:** Đã deploy thành công lên `https://initial-surgical-data-pro.vercel.app`.
- **Test Suite:** 418/418 tests pass trong 33 file test (`npm test`).
