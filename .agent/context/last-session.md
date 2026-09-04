# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 04/09/2026 15:48 (Giờ địa phương)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build:** `Thành công 100% (0 errors)`

---

## 📌 1. Các Yêu Cầu & Tính Năng Mới Đã Triển Khai Trong Phiên

### 1.1. Tính Viện Phí PT/TT Trực Tiếp Từ Cột Thành Tiền & Bỏ Cảnh Báo Thiếu Giá Thừa Thãi:
- **Nguyên nhân trước đó:** Module Thống kê phẫu thuật kiểm tra theo cơ chế cũ `priceVersions` (bảng giá P1, P2...) và ép tra ngược lại Danh mục giá theo tên `surgeryNamePrices`. Khi không thấy bảng giá cũ theo loại, hệ thống báo thiếu giá cho toàn bộ 24 tháng (`1/2026..12/2025`), hiển thị `Chi phí DV = 0` và cảnh báo thiếu giá cho cả những ca đã có tiền (như `Phẫu thuật KHX gãy xương đòn`).
- **Giải pháp:**
  - Viện phí PT/TT trong `statisticsService.ts` (`aggregateMonth` & `aggregateDaily`) được lấy **trực tiếp từ cột `thanhTien`** (hoặc `donGia * soLuong`) của bản ghi ca mổ.
  - Xóa bỏ hoàn toàn việc gắn cờ `missingPriceMonths` và `missingSurgeryNameTracker` gây cảnh báo vàng/cam che mất giao diện.
  - **Giao diện tab Thống kê (`StatsSummary.tsx`)**:
    - Thẻ KPI: Bỏ thẻ "Chi phí dịch vụ" trùng lặp, chỉ giữ lại một thẻ chuẩn xác duy nhất: **"Viện phí PT/TT"** (ví dụ 2.5 tỷ). Bộ 6 thẻ KPI cân đối hoàn hảo.
    - Bảng tổng hợp theo tháng: Bỏ dòng "Chi phí DV (tr)" bị gạch ngang/trùng lặp, chỉ giữ duy nhất dòng chuẩn **"Viện phí PT/TT (tr)"**.
    - Xuất Excel: Đổi label `'Chi phí DV (VNĐ)'` thành `'Viện phí PT/TT (VNĐ)'`.

### 1.2. Mở Rộng Chuẩn Hóa Viết Tắt Y Khoa & Tra Cứu Giá 2 Tầng:
- Mở rộng từ điển chuẩn hóa trong `normalizeForMatch` ([surgeryNamePriceService.ts](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/services/surgeryNamePriceService.ts)):
  - `khx` ➔ `kết hợp xương`
  - `pt` ➔ `phẫu thuật`
  - `tt` ➔ `thủ thuật`
  - `ns` ➔ `nội soi`
- Tra cứu 2 tầng: Tầng 1 theo tên chuẩn hóa, tầng 2 (fallback) theo `maTuongDuong` khi ca mổ đã có mã tương đương. Khắc phục dứt điểm trường hợp viết tắt như *"Phẫu thuật KHX gãy xương đòn"*.

### 1.3. Nút "Sửa" & Chỉnh Sửa Toàn Bộ Thông Tin Ca Phẫu Thuật (Báo Cáo Tháng):
- **Giao diện kích hoạt:**
  - Nút **Sửa** (icon bút chì) trên thanh Bulk Action Toolbar (khi chọn nhiều ca sẽ sửa ca vừa được click chọn cuối cùng `lastActiveRecordId`).
  - Cho phép **Double-click** trực tiếp vào bất kỳ dòng nào trong bảng DS Phẫu thuật (Báo cáo tháng) để mở form sửa tức thì.
- **Modal Chỉnh sửa Toàn diện ([SurgeryEditModal.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/surgery/SurgeryEditModal.tsx))**:
  - Thông tin hành chính & bệnh nhân: STT, Mã BN, Họ tên, Giới tính, Năm sinh, Thẻ BHYT, Mã khoa, Mã giường.
  - Thời gian: Ngày BĐ, Ngày KT (tự động tính thời lượng `timeMinutes`).
  - Kỹ thuật & Giá: Combobox gõ chữ lọc tức thì (`ComboboxField`), tự động lọc danh mục theo khoảng hiệu lực của ngày mổ, tự động điền Mã tương đương, Đơn giá và tính lại Thành tiền.
  - Kíp phẫu thuật (6 vai trò): Phẫu thuật chính, Phụ 1, Phụ 2, BS gây mê, KTV phụ mê, Giúp việc — tích hợp tìm kiếm autocomplete theo `staffList`.
  - Thiết bị & Vật tư: Chọn máy móc theo danh mục `machineRegistry`.
- **Lưu trữ & Tính toán lại:** Tự động đồng bộ lên Firestore (nếu có `firestorePath`) và gọi `recalculateResultFromRecords` cập nhật in-memory tức thì.

---

## 📂 2. Cấu Trúc File & Thay Đổi Chính
- `components/surgery/SurgeryEditModal.tsx`: Modal sửa toàn bộ thông tin ca phẫu thuật với combobox autocomplete.
- `services/statisticsService.ts`: Lấy viện phí trực tiếp từ cột `thanhTien`, bỏ cảnh báo thiếu giá danh mục, cập nhật export Excel.
- `components/statistics/StatsSummary.tsx`: Tối ưu KPI cards và bảng tháng (chỉ giữ 1 chỉ số Viện phí PT/TT chuẩn).
- `services/surgeryNamePriceService.ts`: Chuẩn hóa viết tắt y khoa, tra cứu 2 tầng theo tên và mã tương đương.
- `App.tsx`: Nút Sửa trên Toolbar, sự kiện double-click trên dòng bảng danh sách, tích hợp modal `SurgeryEditModal`.
