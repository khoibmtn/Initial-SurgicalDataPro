# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 09/09/2026 20:05 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-09-09-2026-20h03`  
> **Commit mới nhất:** `e09378e fix(layout): xóa khoảng trống thừa giữa sidebar và frame chính & ẩn toàn bộ text gợi ý mật khẩu mặc định`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi TypeScript)`

---

## 📌 1. Các Tính Năng & Sửa Lỗi Đã Triển Khai Trong Phiên

### 1.1. Sửa Lỗi Khoảng Trống Layout Lớn Giữa Panel Sidebar và Frame Chính (`App.tsx`)
- **Vấn đề:** Sau khi cập nhật code trước đó, xuất hiện khoảng trống trắng rất lớn (unwanted whitespace gap) giữa mép phải Sidebar và nội dung chính (`<main>`), xảy ra ở cả 2 trạng thái Sidebar thu gọn (56px) và mở rộng (200px).
- **Nguyên nhân cốt lõi:**
  - `<Sidebar>` được đặt làm con trực tiếp trong layout flex (`<div className="... flex overflow-hidden">`) của `App.tsx`.
  - Vì Sidebar nằm trong luồng flex bình thường (không phải `position: fixed` hay `absolute`), nó đã chiếm sẵn bề rộng 56px hoặc 200px.
  - Thẻ `<main>` lại có thêm inline style `marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed-w)' : 'var(--sidebar-w)'` và class `transition-[margin-left]`, khiến nội dung bị đẩy thụt lùi sang phải thêm một lần nữa, tạo ra khoảng trắng khổng lồ.
- **Giải pháp xử lý:**
  - Xóa bỏ hoàn toàn thuộc tính `style={{ marginLeft: ... }}` và class `transition-[margin-left]` trên thẻ `<main>`.
  - Thiết lập thẻ `<main>` thành: `<main className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto animate-fade-in">`.
  - Nhờ cơ chế Flexbox (`flex-1 min-w-0`), thẻ `<main>` tự động co giãn và gắn khít sát liền mạch vào cạnh phải của `<Sidebar>` với chính xác 0px khoảng trống thừa ở cả 2 chế độ bung và thu gọn.

### 1.2. Ẩn Toàn Bộ Text Gợi Ý Mật Khẩu Mặc Định "123456" Trên Giao Diện UI
- **Yêu cầu:** Mật khẩu mặc định ban đầu vẫn giữ giá trị kỹ thuật là `123456` trong logic hệ thống, nhưng trên giao diện người dùng phải xóa bỏ hoàn toàn tất cả các đoạn văn bản gợi ý mật khẩu để đảm bảo tính thẩm mỹ và an toàn thông tin.
- **Các vị trí đã tinh chỉnh:**
  - `components/ConfigurationTab.tsx`:
    - Xóa phần text `(Mật khẩu mặc định: <strong>123456</strong>)` trong câu hướng dẫn của `UnlockModal`.
    - Đổi placeholder từ `Mật khẩu (mặc định: 123456)` thành `Nhập mật khẩu`.
  - `components/ui/Sidebar.tsx`:
    - Xóa text `(Mật khẩu mặc định: 123456)` trong mô tả trạng thái khóa của `AccountModal`.
    - Đổi placeholder ô nhập mở khóa từ `Mật khẩu (mặc định: 123456)` thành `Nhập mật khẩu`.
    - Đổi placeholder ô nhập mật khẩu cũ từ `Mật khẩu cũ (mặc định: 123456)` thành `Nhập mật khẩu hiện tại`.

### 1.3. Phát Hiện Ca Mổ Trùng Trong File Excel Import (Báo Cáo Tháng & Báo Cáo Hàng Ngày)
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
  - Khi phát hiện trùng: hiển thị toast lỗi (duration 14s để người dùng dễ đọc), tự động reset `listFile: null, listDateRange: ""` để hủy file và chặn không cho dữ liệu trùng vào bảng hoặc lưu vào Firestore/bộ nhớ.

### 1.4. Khóa / Mở Khóa Trang Cấu Hình & Đổi Mật Khẩu
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

## 🚀 3. Trạng Thái Triển Khai & Kiểm Thử
- **Build Production:** `npm run build` đạt 100% không lỗi (8.10s).
- **GitHub Origin:** Đã merge và push thành công vào `main`.
- **Vercel Production:** Đã deploy thành công và trỏ alias trực tiếp vào `https://initial-surgical-data-pro.vercel.app`.
- **Kiểm thử trực quan E2E qua Browser Subagent:**
  - Sidebar co giãn mượt mà: Main frame bám sát 0px khoảng trống thừa ở cả 2 trạng thái 56px và 200px.
  - Modal "Mở khóa cấu hình" và modal "Tài khoản & Bảo mật" hoàn toàn không còn bất kỳ chữ gợi ý mật khẩu mặc định "123456" nào.
