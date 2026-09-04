# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 04/09/2026 16:30 (Giờ địa phương)  
> **Nhánh Git hiện tại:** `temp-04-09-2026-16h28`  
> **Commit mới nhất:** `f3f427d`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build & Deploy:** `Thành công 100% (READY)`

---

## 📌 1. Các Yêu Cầu & Tính Năng Mới Đã Triển Khai Trong Phiên

### 1.1. Toggle "Số lượng / Viện phí" trong Tab Phân Tích So Sánh:
- **Vị trí**: Đặt cạnh nút toggle "Hiện số chênh" trên thanh công cụ trên cùng.
- **Chế độ Số lượng** (mặc định):
  - Hiển thị theo số ca phẫu thuật, chênh lệch số ca (± ca) và % tăng giảm số ca như trước.
- **Chế độ Viện phí**:
  - Dữ liệu viện phí được tính toán trực tiếp từ cột **Thành tiền** (`thanhTien` hoặc `donGia * soLuong`) của từng ca phẫu thuật.
  - Hỗ trợ format số tiền trực quan (`tỷ`, `tr`, `₫`) và tooltip hover xem chính xác toàn bộ số tiền chi tiết đến từng đồng.
  - Cập nhật **KPI Card 1**: Tự động chuyển tiêu đề và số liệu thành **Tổng viện phí** (kèm số chênh lệch tiền và % thay đổi doanh thu).
  - Cập nhật **Badge chuyên khoa**: Thể hiện tổng viện phí phát sinh của từng khoa.
  - Cả 2 bảng (**Toàn viện** & **Từng chuyên khoa**): Header, các cột số liệu (Kỳ này, Kỳ trước, Cùng kỳ), cột số chênh (± tiền) và các cột % thay đổi doanh thu đều đồng bộ hóa theo viện phí.
  - Dòng **TỔNG CỘNG footer**: Tính toán và hiển thị tổng viện phí toàn viện/khoa.
  - **Sắp xếp (Sorting)**: Tự động sắp xếp theo viện phí tương ứng của cột khi đang ở chế độ Viện phí.
  - **Nhãn toggle số chênh**: Tự động hiển thị `Hiện số chênh (± ca)` hoặc `Hiện số chênh (± tiền)` tùy theo chế độ đang chọn.

### 1.2. Gộp Nút Xuất CSV và Excel thành 1 Nút "Tải xuống" Hợp Nhất:
- Thay thế 2 nút riêng biệt bằng 1 nút **Tải xuống** duy nhất với icon `Download` và mũi tên dropdown `ChevronDown`.
- Khi bấm nút, hiển thị dropdown menu popover:
  - **Xuất Excel (.xlsx)**: Sheet tổng hợp toàn viện & các sheet chuyên khoa theo chế độ Số lượng hoặc Viện phí đang chọn.
  - **Xuất CSV (NotebookLM)**: Chuẩn UTF-8 BOM tối ưu AI NotebookLM.
- Hỗ trợ tự động đóng dropdown khi click ra ngoài.

### 1.3. Di Chuyển Ô Gõ Tìm Kiếm:
- Đã loại bỏ ô tìm kiếm ở thanh công cụ trên cùng.
- Chuyển xuống đặt ngay trên bảng số liệu, **ngang hàng với các badge chuyên khoa và nằm ở mé phải** (`flex justify-between`), kèm nút xóa nhanh `×` khi có từ khóa.

---

## 📂 2. Cấu Trúc File & Thay Đổi Chính
- `components/statistics/SpecialtyComparisonTab.tsx`:
  - Thêm state `metricMode ('count' | 'revenue')`, `openDownloadMenu`, `downloadMenuRef`.
  - Thêm helpers `fmtMoney`, `fmtFullMoney`, `fmtMoneyDiffCell`.
  - Cập nhật `overallKPIs`, `sortRows`, các cột số liệu, header, footer và Toolbar.
  - Chuyển ô Search xuống dòng chuyên khoa mé phải.
- `services/specialtyComparisonService.ts`:
  - Mở rộng `ComparisonRow` thêm các trường `currentRevenue`, `prevRevenue`, `prevRevenueDiff`, `prevRevenueChangePct`, `samePeriodRevenue`, `samePeriodRevenueDiff`, `samePeriodRevenueChangePct`.
  - Mở rộng `SpecialtyReportGroup` thêm `totalCurrentRevenue`, `totalPrevRevenue`, `totalSamePeriodRevenue`.
  - Cập nhật `ItemCounter` và hàm `registerRecord` để cộng dồn tiền từ `r.thanhTien`.
- `services/excelExportComparisonService.ts`:
  - Thêm tham số `metricMode: 'count' | 'revenue' = 'count'` cho cả `exportSpecialtyComparisonExcel` và `exportSpecialtyComparisonCSV`.
  - Xuất bảng biểu và số liệu tương ứng theo Số lượng (ca) hoặc Viện phí (VNĐ).
