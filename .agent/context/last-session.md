# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 09/09/2026 19:20 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-09-09-2026-19h19`  
> **Commit mới nhất:** `78bc8a6 feat: phát hiện ca mổ trùng trong excel import & khóa/mở khóa bảo mật trang cấu hình`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi TypeScript)`

---

## 📌 1. Các Tính Năng Đã Triển Khai Trong Phiên

### 1.1. Phát Hiện Ca Mổ Trùng Trong File Excel Import (Báo Cáo Tháng & Báo Cáo Hàng Ngày)
- **Hàm cốt lõi (`services/excelProcessor.ts`):**
  - `checkDuplicateSurgeriesInExcel(listData: any[][]): string | null`: Duyệt trực tiếp bảng dữ liệu từ dòng 9 trở đi (dòng dữ liệu thực tế, số dòng hiển thị 1-based: `i + 1`).
  - **Tiêu chí ca trùng:**
    - Cùng bệnh nhân: Cùng Mã BN (`maBN`) hoặc cùng Tên BN nếu thiếu mã.
    - Cùng phẫu thuật: Tên dịch vụ kỹ thuật (`tenKT`) chuẩn hóa giống nhau (bỏ dấu, xóa khoảng trắng thừa).
    - Cùng khoảng thời gian: Cùng Ngày bắt đầu (`ngayBD`) và Ngày kết thúc (`ngayKT`).
  - **Thông báo lỗi chi tiết:** Chỉ rõ chính xác từng cặp dòng trùng nhau, ví dụ:  
    `• Dòng 15 trùng với Dòng 42 (BN: 2301923 - NGUYEN VAN A | Phẫu thuật: PT nội soi cắt túi mật | Thời gian: 08:30 10/08/2026 -> 10:15 10/08/2026)`
- **Cơ chế Chặn kép (Double-layer Safety Guard):**
  - **Lớp 1 (`validateListFile`):** Kiểm tra ngay khi người dùng chọn hoặc kéo thả file Excel vào khu vực upload. Nếu phát hiện trùng, chặn import ngay lập tức.
  - **Lớp 2 (`processListData` trong `processSurgicalFiles`):** Kiểm tra lại trước khi bóc tách mảng `records`. Nếu có ca trùng, ném ngoại lệ chặn hoàn toàn tiến trình.
- **Xử lý UI tại `App.tsx`:**
  - `ToastContainer` được cập nhật style `whitespace-pre-line break-words max-h-[80vh] overflow-y-auto` để hiển thị danh sách dòng trùng xuống dòng rõ ràng, trực quan.
  - Khi phát hiện trùng: hiển thị toast lỗi (duration kéo dài 14s để người dùng dễ đọc), tự động reset `listFile: null, listDateRange: ""` để hủy file và chặn không cho dữ liệu trùng vào bảng hoặc lưu vào Firestore/bộ nhớ.

### 1.2. Khắc Phục Lỗi Tìm Kiếm & Lọc Ô Trống
- **Tìm kiếm tiếng Việt thông minh:** Kết hợp tìm kiếm có dấu và không dấu (`removeVietnameseTones`) trên tất cả các trường: Tên BN, Mã BN, Tên kỹ thuật, Khoa/phòng, Bác sĩ/Kíp mổ.
- **Lọc ô trống Giúp việc (`gv`):** Sửa lỗi lọc trạng thái ô trống của Giúp việc trong bảng danh sách phẫu thuật, phản hồi tức thì khi chọn điều kiện lọc.
- **Chống nhân bản ca mổ:** Ngăn chặn việc nhân đôi dữ liệu khi đồng bộ từ bộ nhớ Firestore.
- **Tự động đồng bộ giá:** Đồng bộ đơn giá phê duyệt từ Báo cáo tháng sang Báo cáo hàng ngày.

### 1.3. Khóa / Mở Khóa Trang Cấu Hình & Đổi Mật Khẩu
- **Cơ chế Bảo mật (`contexts/ConfigContext.tsx`):**
  - `isLocked`: Quản lý trạng thái khóa toàn cục. Mặc định luôn là `true` khi mở ứng dụng hoặc mở tab mới.
  - Mở khóa theo phiên (`sessionStorage.getItem('config_unlocked')`): Khi người dùng đóng tab/trình duyệt, trạng thái mở khóa tự động bị hủy, đảm bảo an toàn tuyệt đối.
  - Mật khẩu lưu tại máy cục bộ người dùng (`localStorage.getItem('admin_config_password')`), mặc định ban đầu là `123456`, không ảnh hưởng tới người dùng khác.
  - Cung cấp các phương thức: `unlockConfig(password)`, `lockConfig()`, `changePassword(oldPass, newPass)`.
  - Hàm `updateConfig` và `resetConfig` tự động chặn và bắn toast thông báo nếu đang bị khóa.
- **Nút Khóa / Mở Khóa trên Trang Cấu hình (`components/ConfigurationTab.tsx`):**
  - Tích hợp vào `ContextToolbar` qua thuộc tính `beforeTitle`, nằm ngay trước nhãn tiêu đề "Cấu hình".
  - Trạng thái `🔒 Đang khóa`: Nút màu xám/amber; click vào sẽ mở `UnlockModal` yêu cầu nhập mật khẩu.
  - Trạng thái `🔓 Đã mở khóa`: Nút màu xanh emerald; click vào sẽ khóa lại ngay lập tức.
  - Banner cảnh báo màu hổ phách: *"Chế độ Chỉ xem (Đang khóa cấu hình) — Bạn đang ở chế độ xem an toàn. Toàn bộ tính năng thêm, sửa, xóa, import đã được vô hiệu hóa..."* hiển thị rõ ràng khi đang khóa.
- **Chức năng Đổi Mật Khẩu ở Sidebar (`components/ui/Sidebar.tsx`):**
  - Nút **"Tài khoản & Bảo mật"** được đặt ở chân Sidebar, ngay phía trên nút "Thu gọn".
  - Hiển thị badge trạng thái `🔒 Khóa` hoặc `🟢 Mở` ở cả 2 chế độ Sidebar mở rộng và thu gọn.
  - Mở modal bảo mật gồm 2 tab/khu vực:
    1. Trạng thái cấu hình & Mở/Khóa nhanh trong phiên hiện tại.
    2. Đổi mật khẩu cấu hình (nhập mật khẩu hiện tại, mật khẩu mới, xác nhận mật khẩu mới).
- **Vô hiệu hóa toàn diện các Tab Cấu hình khi Khóa (Chế độ Chỉ xem):**
  - **Tab Khoa / Phòng (`departments`):** Vô hiệu hóa form thêm mới, nút di chuyển thứ tự lên/xuống, nút Sửa, Xóa, toggle báo cáo và toggle 5 vị trí kíp mổ.
  - **Tab Hành chính (`admin`):** Vô hiệu hóa ô nhập Tên bệnh viện và toàn bộ 12 ô cài đặt giờ làm việc (mùa hè/mùa đông).
  - **Tab Nhân sự (`staff-list`):** Vô hiệu hóa nút Import Excel, form Thêm/Sửa nhân sự, nút Lưu, Kế tiếp, Xóa, click chọn dòng.
  - **Tab Danh mục Mã máy (`registry`):** Vô hiệu hóa nút Backfill, Import Excel, form Thêm/Sửa, toggle kích hoạt, xóa mã máy, click chọn dòng.
  - **Tab Định mức lao động (`LaborConfigManager.tsx`):** Vô hiệu hóa ô nhập định mức và các nút điều chỉnh.
  - **Tab DM Chương KT (`ChapterCatalogConfig.tsx`):** Vô hiệu hóa Nạp mặc định, Import Excel, Thêm mới, Xóa đã chọn, các checkbox và nút Sửa/Xóa từng dòng.
  - **Tab DM Giá DVKT (`SurgeryNamePriceConfig.tsx`):** Vô hiệu hóa Quét DM thiếu, Refill từ Excel, Thêm mới, Xóa đã chọn, menu Import Excel, toggle DM Chi phí và nút Sửa/Xóa.
  - **Tab DM Chi phí PTTT (`SurgeryCostConfig.tsx`):** Vô hiệu hóa chỉnh sửa inline, Duplicate phiên bản mới, Xóa chi phí và các nút submit modal.
  - **Tab DM Kỹ thuật dùng mã máy (`RequiredMachineCatalogConfig.tsx`):** Vô hiệu hóa Nhập Excel, Thêm DVKT, toggle Bắt buộc dùng máy, nút Sửa/Xóa và các modal submit.

---

## 📂 2. Cấu Trúc Dữ Liệu & Schema Mới

### 2.1. Config Context Interface (`contexts/ConfigContext.tsx`)
```ts
interface ConfigContextType {
  config: AppConfig;
  updateConfig: (newConfig: Partial<AppConfig>) => void;
  resetConfig: () => void;
  // Khóa / Mở khóa & Bảo mật
  isLocked: boolean;
  unlockConfig: (password: string) => { success: boolean; error?: string };
  lockConfig: () => void;
  changePassword: (oldPass: string, newPass: string) => { success: boolean; error?: string };
}
```

### 2.2. ContextToolbar Props (`components/ui/ContextToolbar.tsx`)
```ts
export interface ContextToolbarProps {
  title?: string;
  beforeTitle?: React.ReactNode; // Vị trí đặt nút Khóa/Mở khóa ngay trước tiêu đề
  icon?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}
```

---

## 🚀 3. Trạng Thái Build & Triển Khai
- `npm run build`: Thành công 100%, không lỗi TypeScript hay cảnh báo cú pháp (6.86s).
- Đã gộp vào nhánh chính `main` và đẩy lên GitHub `origin main`: Commit `78bc8a6`.
- Đã deploy thành công lên Production Vercel: https://initial-surgical-data-pro.vercel.app (Aliased & Ready).
- Nhánh làm việc hiện tại: `temp-09-09-2026-19h19`.
- Đã kiểm thử tự động toàn diện qua Browser Subagent: Kiểm tra luồng khóa mặc định, mở khóa bằng `123456`, khóa lại, đổi mật khẩu, và kiểm tra tính năng chỉ xem trên trang Cấu hình.
