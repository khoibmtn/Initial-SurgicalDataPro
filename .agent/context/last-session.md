# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 04/09/2026 17:10 (Giờ địa phương)  
> **Nhánh Git hiện tại:** `temp-04-09-2026-17h08`  
> **Commit mới nhất:** `c4b627b`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build & Deploy:** `Thành công 100% (READY)`

---

## 📌 1. Các Yêu Cầu & Tính Năng Mới Đã Triển Khai Trong Phiên

### 1.1. Tải Excel Full Danh Sách Cho Tất Cả Các Cảnh Báo (Validation Warnings):
- **Bản ghi trùng key (`duplicateCount`)**:
  - Tự động gom nhóm tất cả các bản ghi có cùng 4 trường: `ngày phẫu thuật`, `loại PT/TT`, `mã BN`, `tên kỹ thuật`.
  - Đánh số nhóm trùng: `Nhóm #1`, `Nhóm #2`... kèm số ca trong nhóm (2, 3...) để các dòng trùng nhau được xếp cạnh nhau giúp đối chiếu cực kỳ thuận tiện.
  - Thêm nút tải 1-click **"Tải Excel trùng key (X dòng)"** ngay trên thanh tiêu đề và cả nút tải lớn bên trong chi tiết.
  - File Excel xuất ra có **23 cột dữ liệu chi tiết đầy đủ**:
    `STT`, `Nhóm trùng key`, `Số ca trong nhóm`, `Mã BN`, `Họ và tên`, `Năm sinh`, `Giới tính`, `Thẻ BHYT`, `Ngày phẫu thuật` (kèm giờ phút nếu có), `Tên phẫu thuật / kỹ thuật`, `Loại PT/TT`, `Số lượng`, `Phẫu thuật chính`, `Phẫu thuật phụ`, `Bác sĩ gây mê`, `KTV gây mê`, `Giúp việc`, `Máy thực hiện`, `Đơn giá (VNĐ)`, `Thành tiền (VNĐ)`, `Mã tương đương BHXH`, `Nguồn dữ liệu`, `ID bản ghi`.
- **Kỹ thuật chưa có giá (`missingSurgeryNames`)**:
  - Nâng cấp nút tải Excel từ 3 cột cơ bản thành **danh sách chi tiết 16 cột đầy đủ thông tin ca mổ** (Mã BN, Họ tên, Năm sinh, Giới tính, Thẻ BHYT, Ngày mổ, Tên KT, Loại PT/TT, PTV chính, PTV phụ, BS GM, Máy, Đơn giá, Thành tiền, Mã tương đương BHXH, Nguồn dữ liệu).
- **Thiếu bảng giá theo tháng (`missingPriceMonths`)**:
  - Thêm nút **"Tải danh sách ca tháng thiếu giá"** xuất toàn bộ các ca phẫu thuật của các tháng thiếu bảng giá ra Excel để kiểm tra và đối soát.

---

## 📂 2. Cấu Trúc File & Thay Đổi Chính
- `types.ts`:
  - Thêm interface `DuplicateSurgeryRecord` (kế thừa `PersistedSurgeryRecord` với `duplicateGroup`, `duplicateGroupCount`, `duplicateKey`).
  - Thêm interface `MissingSurgeryNameRecord` đầy đủ thông tin ca mổ.
  - Mở rộng `DataValidationResult` với `duplicateRecords?: DuplicateSurgeryRecord[]` và `missingSurgeryNameRecords: MissingSurgeryNameRecord[]`.
- `services/statisticsService.ts`:
  - Cập nhật hàm `validateRecords` để gom nhóm các bản ghi trùng key, tính số lượng nhóm và trả về mảng `duplicateRecords`.
  - Cập nhật `aggregateMonth` lưu đầy đủ thông tin ca mổ vào `missingSurgeryNameTracker.records`.
  - Cập nhật `fetchAndAggregateYearly` gắn `duplicateRecords` và `missingSurgeryNameRecords` vào validation result.
- `components/statistics/StatisticsTab.tsx`:
  - Bổ sung các hàm xuất Excel chuyên nghiệp: `handleExportDuplicates`, `handleExportMissingPriceSurgeries`, `handleExportMissingPriceMonths`.
  - Cập nhật các card cảnh báo trong JSX: thêm nút tải nhanh trên thanh tiêu đề `summary` và bên trong nội dung `details`.
