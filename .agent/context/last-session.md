# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 09/09/2026 21:50 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-09-09-2026-21h47`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi TypeScript)`

---

## 📌 1. Các Tính Năng & Sửa Lỗi Đã Triển Khai Trong Phiên

### 1.1. Vô Hiệu Hóa Toàn Diện Nút/Control Khi Khóa Trang Cấu Hình (`isLocked`)
- **Vấn đề trước đây:**
  - Dù đang ở trạng thái Khóa (`isLocked = true`), một số nút Sửa (Pencil) khi bấm vẫn mở popup/modal rồi tắt chớp nhoáng (flash popup).
  - Nút Xóa (Trash2) hoặc nút Thêm (+) ở một số tab vẫn hiển thị hộp thoại xác nhận xóa (`confirm`) hoặc thông báo `alert(...)`.
  - Ô "Tên Bệnh viện" và 12 ô khung giờ làm việc (Mùa hè, Mùa đông) tại subtab `Hành chính / Hành chính` vẫn có thể focus và chỉnh sửa giá trị.
- **Giải pháp xử lý:**
  - **`components/config/LaborConfigManager.tsx`:**
    - Loại bỏ toàn bộ lệnh `alert(...)` chớp tắt khi `isLocked`.
    - Thêm guard `if (isLocked) return;` vào đầu các hàm `handleOpenEdit`, `saveAddMilestone`, `executeDelete`.
    - Vô hiệu hóa triệt để tất cả các nút Thêm (+), Sửa (Pencil), Xóa (Trash2), Thêm mốc fallback ở cả 3 tab (Phụ cấp PTTT, Định mức thời gian, Định mức bàn mổ) cho cả hàng dữ liệu hiện hành và hàng lịch sử đã hết hạn: `disabled={isLocked}`, class `pointer-events-none cursor-not-allowed opacity-40 text-gray-300`.
  - **`components/ConfigurationTab.tsx`:**
    - **Ô "Tên Bệnh viện":** Thiết lập `disabled={isLocked}`, `readOnly={isLocked}`, `tabIndex={isLocked ? -1 : undefined}`, class `pointer-events-none select-none cursor-not-allowed bg-gray-100 text-gray-400`, và guard `onChange`.
    - **12 ô khung giờ làm việc Mùa hè & Mùa đông:** Container bọc ngoài được thêm `pointer-events-none select-none opacity-80`. Toàn bộ 12 thẻ `<input>` đều có `disabled={isLocked}`, `readOnly={isLocked}`, `tabIndex={isLocked ? -1 : undefined}`, class `pointer-events-none select-none cursor-not-allowed bg-gray-100 text-gray-400`, và guard chặn sự kiện `onChange`/`onBlur` bằng `if (isLocked) return;`.
    - **Subtab Mã máy (`registry`):** Form thêm/sửa, nút Thêm, nút Toggle sử dụng và nút Xóa trong bảng đều được vô hiệu hóa hoàn toàn (`disabled={isLocked}`, `pointer-events-none select-none opacity-40`).
    - **Subtab Khoa, phòng (`departments`):**
      - Form Thêm: inputs `disabled/readOnly`, nút Thêm bỏ lệnh `alert(...)`, thêm `disabled={isLocked}`, `disabled:pointer-events-none`.
      - Bảng danh sách: Nút Toggle lấy vào báo cáo, nút Di chuyển lên (ArrowUp), Di chuyển xuống (ArrowDown), Sửa (Pencil), Xóa (Trash2) đều loại bỏ `alert(...)`, thêm `disabled={isLocked}`, `pointer-events-none opacity-40 cursor-not-allowed`.
      - 5 thẻ "Cấu hình vị trí kíp mổ lấy vào báo cáo": Thêm guard `if (isLocked) return;`, loại bỏ lệnh `alert(...)`, thêm class `pointer-events-none cursor-not-allowed opacity-60`.
    - **Subtab Nhân viên y tế (`staff-list`):**
      - Form thêm/sửa nhân sự: Bọc container với `pointer-events-none select-none opacity-80` khi `isLocked`. Các nút Thêm, Lưu, Kế tiếp, Hủy bỏ đều có `disabled={isLocked}`, `disabled:pointer-events-none`.
      - Bảng nhân sự: Click vào dòng bị vô hiệu hóa (`cursor-default pointer-events-none`), nút Xóa (Trash2) có `disabled={isLocked}`, `pointer-events-none opacity-40 cursor-not-allowed`.
  - **`components/statistics/SurgeryNamePriceConfig.tsx` & `SurgeryCostConfig.tsx`:**
    - Nút "Quét DM thiếu", "Thêm mới", "Refill từ Excel", "Xóa đã chọn" trên toolbar đều có `disabled={isLocked}`, `disabled:pointer-events-none`.
    - Nút Toggle DM Chi phí, Sửa, Xóa trong từng hàng dữ liệu đều có `disabled:pointer-events-none` và guard chặn trực tiếp không bật confirm/toast lỗi.

### 1.2. Bỏ Banner Thông Báo Chế Độ Chỉ Xem
- **Yêu cầu:** Người dùng thấy banner màu hổ phách "Chế độ Chỉ xem (Đang khóa)... [Mở khóa chỉnh sửa]" là không cần thiết và chiếm diện tích.
- **Giải pháp:** Xóa bỏ hoàn toàn khối render banner hổ phách trong `components/ConfigurationTab.tsx`. Trạng thái khóa vẫn được hiển thị rõ ràng và tinh tế qua nút Toggle Khóa/Mở khóa ở góc trên.

### 1.3. Khắc Phục Lỗi Tooltip Chui Dưới Frame Tiêu Đề Subtab Tại DM Giá DVKT & DM Chi Phí
- **Nguyên nhân:**
  - Header toolbar của subtab nằm ngay sát dưới thanh tiêu đề các subtab cố định (`z-10`, có tràn overflow).
  - `<InstantTooltip>` mặc định có hướng hiển thị `position="top"` (`bottom-full mb-2`), khiến tooltip mọc ngược lên trên, chui vào phía dưới hoặc bị che khuất bởi thanh header các subtab.
- **Giải pháp:**
  - Cập nhật prop `position="bottom"` cho tất cả các `<InstantTooltip>` trên toolbar:
    - Nút "Quét DM thiếu", "Excel", "Refill từ Excel", "Thêm mới", "Xóa [n] mục", "Bộ lọc", "Xuất Excel".
  - Với `position="bottom"` (`top-full mt-2`), tooltip chúc xuống phía dưới nút một cách thoáng đãng, hiển thị trọn vẹn 100% nội dung và không còn bất kỳ va chạm hay che khuất nào.

### 1.4. Tách Riêng & Mở Rộng Box Nhập Giờ:Phút Tại Modal Chỉnh Sửa Ca Phẫu Thuật (Edit Case)
- **Vấn đề trước đây:**
  - Trong modal "Chỉnh sửa thông tin phẫu thuật" (mục *2. THỜI GIAN THỰC HIỆN & PHÂN LOẠI*), box nhập ngày và giờ:phút bị gộp chung vào một container có viền ngoài.
  - Box giờ phút bị ép kích thước `w-12` (chỉ 48px), cộng với 2 icon Lucide (`Calendar`, `Clock`) bên trong khiến chuỗi `HH:mm` (như `08:00`, `07:30`) bị tràn và trình duyệt cắt cụt chỉ còn thấy phần giờ và dấu hai chấm (`08:`), không quan sát được số phút.
- **Giải pháp xử lý:**
  - **`components/surgery/SurgeryEditModal.tsx` (`DateTimeField`):**
    - Tách container gộp thành 2 box nhập liệu độc lập đặt cạnh nhau với `gap-2` (giống như giao diện các ô lọc khoảng thời gian ở thanh công cụ chính):
      - **Box Ngày (`input[type="date"]`):** `flex-1 min-w-0 px-2.5 py-1.5 h-[34px] bg-white border rounded-lg text-xs font-medium text-gray-800 shadow-sm focus:ring-2 outline-none cursor-pointer`. Bỏ icon `Calendar` thừa bên trái vì trình duyệt đã tích hợp sẵn biểu tượng calendar picker.
      - **Box Giờ:Phút (`input[type="text"]`):** Tăng kích thước chiều rộng từ `w-12` (48px) lên `w-20` (80px, `shrink-0`), `h-[34px]`, căn giữa `text-center font-mono`, viền độc lập `rounded-lg shadow-sm`. Bỏ icon `Clock` thừa.
    - Áp dụng đồng bộ cho cả 3 trường thời gian: "Thời gian bắt đầu", "Thời gian kết thúc", "Thời gian chỉ định".
    - Giữ nguyên cơ chế cảnh báo lỗi logic thời gian (`hasError ? 'border-red-400 text-red-600' : ...`), tự động format ký tự số và phím ESC hoàn tác.

---

## 🚀 2. Trạng Thái Triển Khai & Kiểm Thử
- **Build Production:** `npm run build` chạy thành công 100% không lỗi (Vite v6.4.1 - 0 lỗi TypeScript).
- **Kiểm thử trực quan E2E qua Browser Subagent:**
  - Banner vàng chỉ xem đã biến mất hoàn toàn.
  - Ô "Tên Bệnh viện" và 12 ô nhập khung giờ làm việc tại tab Hành chính bị làm mờ, không thể click hay edit.
  - Các nút Sửa, Thêm, Xóa tại tab "Định mức bàn mổ" / "Phụ cấp PTTT" / "Thời gian" đều bị vô hiệu hóa mờ đi, click vào không có phản hồi và không xuất hiện popup/modal chớp tắt nào.
  - Hover chuột lên "Quét DM thiếu", "Thêm mới" tại subtab DM Giá DVKT hiển thị tooltip trôi xuống phía dưới rõ ràng, không bị cấn hay chui dưới frame tiêu đề subtab.
  - Subtab Khoa phòng & Nhân viên y tế: form nhập và các nút hành động bảng đều vô hiệu hóa hoàn toàn khi trang đang khóa.
  - **Modal Chỉnh sửa ca phẫu thuật:** Cả 3 trường thời gian (Bắt đầu, Kết thúc, Chỉ định) hiển thị thành 2 box riêng biệt với chiều rộng `w-20` (80px) căn giữa, hiển thị đầy đủ cả giờ và phút (VD: `07:30`, `08:30`, `07:26`), độ cao `h-[34px]` đồng bộ tuyệt đối.
- **Trạng thái Git & Production:**
  - Nhánh `main`: Đã đồng bộ mã nguồn mới nhất và push lên GitHub origin.
  - Vercel: Đã deploy thành công lên Production (`https://initial-surgical-data-pro.vercel.app`).
  - Nhánh làm việc hiện tại: `temp-09-09-2026-21h47`.
