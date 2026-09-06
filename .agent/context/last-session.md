# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 06/09/2026 23:48 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-06-09-2026-22h42`  
> **Commit mới nhất trên main:** `274605e` (`fix: khoi phuc danh muc 14 ky thuat chuyen nhom, bo sung seed baseline chong mat du lieu va sao luu JSON`)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build & Deploy:** `Thành công 100% (Vite v6.4.1 - 0 lỗi)`

---

## 📌 1. Các Yêu Cầu & Tính Năng Đã Hoàn Thành Trong Phiên

### 1.1. Sửa Lỗi Giao Diện & Mở Tab Biểu Đồ So Sánh (`ComparisonChartsView.tsx`)
- **Khắc phục lỗi runtime khi mở tab biểu đồ**:
  - Bổ sung import `useRef` thiếu từ `'react'`.
  - Tối ưu hóa việc gán tham chiếu và hủy đăng ký listener biểu đồ an toàn.
- **Sửa lỗi layout tiêu đề modal khi bật chế độ sáng**:
  - Tách header modal thành bố cục 2 tầng (2-tier responsive header) chống hiện tượng tiêu đề dài đè lên các nút điều khiển hoặc bị ngắt chữ xấu.
- **Ghim nút phóng to (Maximize / Expand) của card biểu đồ**:
  - Ghim nút expand bên trong khung card ở chế độ bình thường, ngăn tình trạng nút bị rơi hoặc tràn ra ngoài mép card.

### 1.2. Hoàn Thiện Biểu Đồ Thác Nước (Waterfall Chart)
- **Hiển thị đầy đủ tất cả các phẫu thuật thủ thuật (PTTT)**:
  - Khắc phục lỗi khi chọn "Hiển thị đầy đủ" mà vẫn bị thiếu box (ví dụ có 15 PTTT nhưng chỉ hiển thị 12 box).
  - Tự động tính toán chiều rộng từng cột (box width) linh hoạt theo tổng số kỹ thuật, tránh co hẹp hoặc mất cột.
- **Bổ sung nút bật/tắt "Ẩn box 0 ca"**:
  - Nút bấm thiết kế đồng bộ với nút *"Ẩn / hiện cột mã tương đương"* (border, badge số lượng, hover state).
  - **Mặc định BẬT**: Tự động lọc bỏ các box có mức chênh lệch bằng 0 (`diff === 0`) giúp biểu đồ tập trung trực quan vào các kỹ thuật có biến động số lượng hoặc doanh thu.
  - Khi TẮT: Hiển thị đầy đủ toàn bộ kỹ thuật kể cả các ca có độ biến động bằng 0.

### 1.3. Nâng Cấp Quản Lý Nhóm Chuyên Khoa Mới (Custom Specialties)
- **Hỗ trợ chỉnh sửa (Inline Edit) nhóm chuyên khoa tùy chỉnh**:
  - Bổ sung nút cây bút (`Edit3`) tại cột *Thao tác* trong bảng nhóm chuyên khoa tự tạo (`StatsConfig.tsx`).
  - Cho phép sửa trực tiếp cả **Tên nhóm chuyên khoa** và **Tên viết tắt (hiển thị nút/tab)** ngay trên dòng.
  - Hỗ trợ phím tắt: nhấn `Enter` để lưu thay đổi, nhấn `Escape` (hoặc nút `X`) để hủy bỏ; nút tích xanh (`Check`) để xác nhận lưu.
  - Thêm hàm `updateCustomSpecialty(code, name, shortName)` trong `specialtyComparisonService.ts`.

### 1.4. Khôi Phục & Bảo Vệ Toàn Diện Danh Mục Chuyển Nhóm Thủ Công
- **Nguyên nhân sự cố mất dữ liệu về 1 mục**:
  1. *Cách ly LocalStorage theo Port/Origin*: Trình duyệt cách ly dữ liệu giữa `localhost:3000` (cổng cũ) và `localhost:3001` (cổng mới khi Vite fallback do port 3000 bị chiếm dụng bởi app khác).
  2. *Dropdown chọn nhóm bị stale state*: `allSpecialtiesList` trong `SpecialtyComparisonTab.tsx` chỉ khởi tạo 1 lần lúc mount, khiến nhóm mới tạo chưa kịp xuất hiện trong menu chuyển nhóm.
- **Khôi phục đầy đủ 100% dữ liệu (14 mục kỹ thuật)**:
  - 13 mục ban đầu của người dùng từ ảnh chụp + ca thứ 14 (`phẫu thuật khx gãy xương đòn` ➔ `Chấn thương chỉnh hình`).
- **Cơ chế Baseline Seed chống mất dữ liệu vĩnh viễn**:
  - Khởi tạo hằng số `DEFAULT_BASE_OVERRIDES` chứa sẵn 14 kỹ thuật chuẩn trong `specialtyComparisonService.ts`.
  - Tự động nạp 14 mục này nếu `localStorage` chưa từng được khởi tạo, đảm bảo mở ở cổng mới hay tab ẩn danh dữ liệu vẫn luôn sẵn sàng.
- **Bổ sung bộ công cụ Sao lưu & Phục hồi trên giao diện (`StatsConfig.tsx`)**:
  - 🔄 **Khôi phục 14 mục chuẩn**: 1-click đưa danh mục về lại 14 kỹ thuật chuẩn ban đầu.
  - 📥 **Sao lưu JSON**: Xuất file `.json` chứa toàn bộ nhóm tự tạo và danh mục kỹ thuật đã chuyển.
  - 📤 **Nhập JSON**: Khôi phục cấu hình từ file tải lên cực nhanh.
- **Đồng bộ thời gian thực (Realtime Event)**:
  - Phát sự kiện `sdp-specialties-changed` khi có bất kỳ thao tác thêm/sửa/xóa nhóm hoặc gán chuyên khoa.
  - Menu chuyển nhóm popover luôn gọi trực tiếp `getAllSpecialties()` để nhận diện ngay lập tức các nhóm tùy chỉnh vừa tạo mà không cần reload trang.

---

## 📂 2. Cấu Trúc Dữ Liệu & Danh Mục Baseline Chuẩn

### 2.1. Danh Mục 14 Kỹ Thuật Đã Gán Chuyên Khoa Chuẩn (`DEFAULT_BASE_OVERRIDES`)
```ts
export const DEFAULT_BASE_OVERRIDES: Record<string, SpecialtyCode> = {
  "cắt bè củng giác mạc (trabeculectomy)": "mat",
  "khâu da mi đơn giản": "mat",
  "phẫu thuật lấy thể thủy tinh ngoài bao có hoặc không đặt iol": "mat",
  "phẫu thuật mộng có ghép (kết mạc rời tự thân, màng ối...) có hoặc không áp thuốc chống chuyển hóa": "mat",
  "phẫu thuật nội soi cắt ruột thừa": "ngoai_th",
  "cắt u mi cả bề dày không vá": "mat",
  "mở bao sau bằng phẫu thuật": "mat",
  "cắt u kết mạc không vá": "mat",
  "khâu kết mạc": "mat",
  "khâu giác mạc": "mat",
  "phẫu thuật quặm": "mat",
  "phẫu thuật lấy thai lần đầu [gây tê]": "phu_san",
  "phẫu thuật điều trị thoát vị thành bụng khác": "ngoai_th",
  "phẫu thuật khx gãy xương đòn": "ctch",
};
```

### 2.2. Nhóm Chuyên Khoa Tùy Chỉnh Hiện Tại (`sdp_custom_specialties_list`)
```json
[
  {
    "code": "custom_1788705128687",
    "name": "Phau thuat Tao hinh - Tham my",
    "shortName": "Tham my",
    "color": "emerald",
    "isCustom": true
  }
]
```

---

## 🚀 3. Trạng Thái Triển Khai & Kiểm Thử

- **Build Production**:
  - Lệnh `npm run build` thành công 100% không có lỗi TypeScript hay cú pháp.
- **Kiểm thử trực tiếp trên trình duyệt (`http://localhost:3001/`)**:
  - Đã nạp thành công 14 mục vào `localStorage`.
  - Đã chụp ảnh màn hình xác nhận trực quan: Bảng "Danh mục kỹ thuật đã chuyển nhóm thủ công" hiển thị đúng badge `14`, đủ 3 nút `Khôi phục 14 mục chuẩn`, `Sao lưu JSON`, `Nhập JSON`, và hiển thị nhóm tự tạo có nút `Sửa` / `Xóa`.
- **Git Flow & Remote Sync**:
  - Đã thực hiện quy trình `/sync`: commit toàn bộ thay đổi, merge vào `main`, push lên GitHub `origin/main`.
  - Tạo nhánh làm việc mới: `temp-06-09-2026-22h42`.

---

## 💡 4. Ghi Chú & Định Hướng Cho Phiên Tiếp Theo

1. **Mã màu & Quy tắc thiết kế (Design Guidelines)**:
   - Nghiêm cấm sử dụng dải màu tím/violet (Purple Ban). Luôn tuân thủ màu `primary` (`#003366`), `blue`, `emerald`, `amber`, `rose`.
2. **Đồng bộ dữ liệu đa thiết bị (Khuyến nghị tương lai)**:
   - Hiện tại cấu hình nhóm tùy chỉnh và chuyển nhóm đã có file sao lưu JSON và Baseline Seed an toàn trong mã nguồn. Nếu muốn đồng bộ xuyên thiết bị giữa các máy tính khác nhau trong viện, có thể cân nhắc đưa danh mục override vào Firestore collection (như `surgery_profiles` hoặc `surgery_cost_items`).
