# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 01/10/2026 02:40 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `main` (remote: `origin/main`), đã đồng bộ với `version2` (`origin/version2`)  
> **Commit mới nhất (main & version2):** `6dc92f9` (`fix(packages): prioritize package shortName from live config on package list`)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build)`  
> **Trạng thái Test:** `278 / 278 tests PASS` (18 test suites)  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Mô Đun Gói Dịch Vụ Phẫu Thuật Theo Yêu Cầu (Service Package System)
- **Cấu hình Danh mục Vị trí & Ánh xạ tự động**:
  - Hỗ trợ thiết lập linh hoạt các vị trí tham gia gói (Tên đầy đủ, tên viết tắt, nguồn ánh xạ từ kíp mổ thực tế).
  - Với các vị trí ngoài kíp mổ (Chuẩn bị PT, Người tư vấn...), hỗ trợ tùy chọn lọc danh sách nhân viên không tham gia cuộc mổ hoặc lấy từ toàn bộ nhân viên.
- **Cấu hình Gói Dịch Vụ**:
  - Thiết lập tên gói đầy đủ, **tên rút gọn (hiển thị trên bảng)**, tổng số tiền gói, phân bổ định mức tiền cho từng vị trí trong gói.
  - Cảnh báo tổng tiền các vị trí so với tổng tiền gói nếu chưa khớp.
- **Hiển thị Tên Rút Gọn trên Tab Gói DV**:
  - Cột "Gói DV" trên tab `PackageListView` tự động ưu tiên lấy **tên rút gọn (`shortName`)** từ cấu hình gói trực tiếp (`matchedPkg?.shortName?.trim()`).
  - Hỗ trợ tooltip hiển thị đầy đủ tên gói và tên rút gọn khi rê chuột.
  - Tìm kiếm (Search) trên danh sách gói tự động lọc theo cả tên gói đầy đủ, tên rút gọn và thông tin ca bệnh.
- **Cơ chế Lưu trữ & Draft Tạm (Offline-first / Hybrid Sync)**:
  - Khi người dùng chọn ca từ tab "DS Phẫu thuật" chuyển sang tab "Gói DV", danh sách này được lưu tạm (local draft) trên trình duyệt.
  - Khi nhấn "Lấy dữ liệu", "Dữ liệu trực", import Excel hoặc nạp lại dữ liệu, hàm `clearPackageDrafts()` tự động dọn sạch các ca chưa gán gói, tránh tình trạng hiển thị tồn đọng các ca rác chưa hoàn tất.
  - Chỉ khi người dùng thực hiện gán gói thành công (dù chưa chọn đủ nhân viên cho các vị trí), ca bệnh mới được lưu đồng bộ trực tiếp lên Firebase Firestore để truy cập trên các thiết bị khác không bị mất.
- **Trải nghiệm Thao tác & Modal Phân Bổ Nhân Viên**:
  - Hộp tìm kiếm chọn nhân viên được chuẩn hóa theo chuẩn Combobox: gõ phím để lọc, dùng phím mũi tên lên/xuống và Enter để chọn, không cho phép nhập text tự do ngoài danh mục.
  - Thao tác xóa ca mổ khỏi danh sách gói sử dụng React Confirmation Modal tùy biến, loại bỏ hoàn toàn hiện tượng chớp tắt popup của `window.confirm`.
- **Bảng Thanh Toán Gói Dịch Vụ & Bản In**:
  - Bổ sung toggle chuyển đổi giữa chế độ hiển thị **Số lượng (SL)** và **Số tiền (VNĐ)**.
  - Di chuyển toggle này lên cùng hàng với toggle "Bảng thanh toán phụ cấp / Gói dịch vụ", nằm sát mé phải màn hình để tối ưu hóa không gian hiển thị.
  - Đồng bộ trạng thái hiển thị giữa giao diện web và bản in (`usePrintController`): khi chọn chế độ hiển thị tiền, bản in preview hiển thị chính xác số tiền thay vì luôn hiển thị số lượng như trước.
  - Tiêu đề bản in được chuẩn hóa thành **"BẢNG THANH TOÁN DỊCH VỤ THEO YÊU CẦU"** và cho phép tùy chỉnh trong phần Thiết lập.

---

### 1.2. Tạm Thời Ẩn Nút "Đối Soát" (Smart Staging Action)
- Tạm thời comment out nút bấm "Đối soát" trong component `ReportActionBar.tsx` trên cả Báo cáo hàng ngày và Báo cáo tháng theo yêu cầu người dùng, giữ giao diện tập trung và gọn gàng.

---

### 1.3. Khóa Chỉnh Sửa Ca Mổ Theo Thời Gian Thực (Collaborative Record Lock)
- Tích hợp Firebase Realtime Database `record_editing_locks/{recordKey}` với cơ chế Heartbeat 20 giây và Timeout 2 phút.
- Hiển thị viền vàng hổ phách và chấm nhấp nháy trên hàng đang có người chỉnh sửa. Chuyển modal sang chế độ Read-only nếu ca mổ đang bị khóa bởi tài khoản khác.

---

### 1.4. Quản Trị Khối Phòng Mổ Toàn Viện (OR Analytics Dashboard)
- Tích hợp mô hình đo lường năng lực vĩ mô toàn viện ($N$ bàn mổ hoạt động, tỷ lệ sử dụng công suất, thuật toán Sweep Line quét ca mổ đồng thời đỉnh điểm theo ngày/khung giờ, phân bố phụ tải 24h, cảnh báo bất thường).

---

## 📐 2. Cấu Trúc Dữ Liệu & Schema Trọng Điểm

### 2.1. Service Package Schema (`types/servicePackage.ts`)
```typescript
export interface ServicePackageDefinition {
  id: string;
  name: string;             // Tên đầy đủ: "DV chọn bác sĩ phẫu thuật theo yêu cầu"
  shortName?: string;       // Tên rút gọn: "Chọn BS YC"
  totalAmount: number;      // 2,000,000 đ
  positions: ServicePackagePosition[];
  note?: string;
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ServicePackageAssignment {
  id: string;
  patientId: string;
  ngayBD: string;
  tenKT: string;
  compositeKey: string;     // {patientId}_{ngayBD}_{tenKT}
  patientName: string;
  gender?: string;
  yob?: string;
  packageId: string;
  packageName: string;
  packageShortName?: string;
  staffAssignments: StaffPackageAssignment[];
  linkedSurgeryKeys: string[];
  createdAt: number;
  updatedAt: number;
}
```

### 2.2. Logic Hiển Thị Tên Gói Ưu Tiên Tên Rút Gọn (`components/surgery/PackageListView.tsx`)
```typescript
const matchedPkg = a
  ? (packages.find(p => p.id && a.packageId && p.id === a.packageId) ||
     packages.find(p => p.name && a.packageName && p.name.trim().toLowerCase() === a.packageName.trim().toLowerCase()))
  : undefined;

const packageDisplay = a
  ? (matchedPkg?.shortName?.trim() ||
     (a.packageShortName && a.packageShortName.trim() !== a.packageName.trim() ? a.packageShortName.trim() : '') ||
     a.packageName)
  : '';
```

---

## 🚀 3. Trạng Thái Git, Build & Deploy

- **Nhánh `main` & `version2`**: Đã merge và push đầy đủ lên GitHub remote (`origin/main`, `origin/version2`).
- **Commit mới nhất**: `6dc92f9` (`fix(packages): prioritize package shortName from live config on package list`).
- **Kiểm thử (Vitest)**: **18 test suites, 278 / 278 tests PASS (100%)**.
- **Build (Vite v6.4.1)**: Build production bundle thành công trong ~10s.
- **Deploy**:
  - Vercel Production: `https://initial-surgical-data-pro.vercel.app` (Aliased thành công).
  - Firebase Firestore Rules: Đã kiểm tra và deploy lên `initial-surgicaldatapro`.
- **Tuân thủ thiết kế**: Đáp ứng triệt để quy tắc Purple Ban, Clean Code, và các quy định của hệ thống.
