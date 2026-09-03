# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 03/09/2026 18:38 (Giờ địa phương)  
> **Nhánh Git hiện tại:** `temp-14-07-2026-22h39`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build & Deploy:** `READY (Hoàn tất 100%)`

---

## 📌 1. Tổng Quan Các Yêu Cầu & Tính Năng Đã Thực Hiện Trong Phiên

### 1.1. Sửa lỗi Xung đột Trùng Ca / Trùng Máy (Same-Session Surgeries):
- **Nguyên nhân trước đó:** Một bệnh nhân thực hiện nhiều phẫu thuật trong cùng 1 ca mổ (cùng `patientId`, cùng thời gian bắt đầu/kết thúc) nhưng có `tenKT` khác nhau nên bị coi là 2 ca độc lập đè nhau, gây ra 43 cảnh báo trùng máy/trùng nhân viên ảo.
- **Giải pháp:** Bổ sung hàm kiểm tra `isSameSession(a, b)` trong `detectStaffConflicts` và `detectMachineConflicts` (`services/reprocess.ts`). Bỏ qua xung đột nếu cùng bệnh nhân và cùng mốc thời gian mổ. Trùng máy tháng 8 giảm từ 43 về 0.

### 1.2. Thông Báo Tải File Minh Lộ:
- Cập nhật `ToastContainer` và `addToast` trong `App.tsx` hỗ trợ render `React.ReactNode`.
- Khi người dùng tải file Excel Minh Lộ hợp lệ vào Báo cáo hàng ngày/tháng, hiển thị toast:  
  *"Bạn vừa tải dữ liệu Minh Lộ vào **Báo cáo hàng ngày (hoặc Báo cáo tháng)**. Lưu ý: sau khi kiểm tra, nếu dữ liệu chuẩn, hãy bấm Lưu để lưu dữ liệu vào bộ nhớ"* với chữ in đậm màu đỏ nổi bật.

### 1.3. Tab Phân Tích So Sánh Phẫu Thuật Theo Chuyên Khoa (Tab 2 Trong Thống Kê):
- **Vị trí:** Đặt ở giữa tab **Thống kê** và **Cấu hình thống kê** trong `components/statistics/StatisticsTab.tsx`.
- **Chuyên khoa hỗ trợ:** 5 chuyên khoa mặc định (`Ngoại tổng hợp`, `Chấn thương chỉnh hình`, `Mắt`, `Tai Mũi Họng`, `Phụ sản`) + các nhóm chuyên khoa tùy chỉnh do người dùng tạo.

### 1.4. Cơ Chế Phân Loại Chuyên Khoa 3 Cấp Độ (Quy Tắc Ưu Tiên Chuẩn):
1. **Ưu tiên 1 (Cao nhất - User Overrides):** Nếu người dùng đã gán thủ công một tên kỹ thuật sang nhóm nào, hệ thống **luôn luôn xếp vào nhóm đó** (bất kể BS thuộc khoa nào hay từ khóa gì).
2. **Ưu tiên 2 (Theo Khoa của BS Phẫu Thuật Chính):**
   - BS thuộc **Khoa Phụ sản / Sản** $\rightarrow$ Xếp vào **Phụ sản**.
   - BS thuộc **Khoa Tai Mũi Họng / TMH** $\rightarrow$ Xếp vào **Tai Mũi Họng**.
   - BS thuộc **Khoa Mắt** $\rightarrow$ Xếp vào **Mắt**.
   *(Khắc phục hoàn toàn lỗi phẫu thuật "Gãy 2 mắt cá cổ chân" hay "Cắt túi mật" bị nhận nhầm thành Mắt).*
3. **Ưu tiên 3 (Phân định Hệ Ngoại: CTCH vs Ngoại TH):**
   - Toàn bộ phẫu thuật về xương, gãy xương, kết hợp xương (KHX), tháo nẹp vít/đinh, khớp, dây chằng, gân, bao hoạt dịch, **ngón tay, đốt ngón, đốt bàn, mỏm cụt ngón, mắt cá cổ chân** $\rightarrow$ Xếp vào **Chấn thương chỉnh hình**.
   - Các phẫu thuật ngoại khoa còn lại (tiêu hóa, gan mật, tiết niệu, u bướu ngoại chung...) $\rightarrow$ Xếp vào **Ngoại tổng hợp**.

### 1.5. Kỳ Phân Tích Linh Hoạt (Tháng & Khoảng):
- **Chế độ Tháng (Mặc định):** Chọn 1 tháng cụ thể và năm $\rightarrow$ So sánh với tháng liền kề trước đó và cùng kỳ năm trước ($Y-1$).
- **Chế độ Khoảng (Linh hoạt):** Cho phép chọn *Từ tháng X/năm Z đến tháng Y/năm Z* kèm các nút **Chọn nhanh**: `Quý 1`, `Quý 2`, `Quý 3`, `Quý 4`, `6 tháng đầu`, `6 tháng cuối`, `Cả năm`.
  - **Thuật toán Kỳ trước:** Kết thúc tại $X-1$ và lùi đúng $K = (Y - X + 1)$ tháng.
  - **Thuật toán Cùng kỳ:** Cùng khoảng $X \rightarrow Y$ của năm $Z-1$.
  - **Xử lý thiếu dữ liệu:** Nếu cùng kỳ chưa có dữ liệu $\rightarrow$ Hiển thị `—` và không tính tỷ lệ giảm/cảnh báo giả.

### 1.6. Giao Diện Bảng Dọc Hợp Nhất, Text Badge & Sắp Xếp 3 Chu Kỳ:
- **Bảng "Tất cả chuyên khoa (Toàn viện)":** Thể hiện 1 bảng dọc duy nhất hợp nhất toàn bộ danh mục kỹ thuật phát sinh toàn viện.
- **Text Badge & Popover Menu:** Cột Chuyên khoa hiển thị Text Badge rõ nét kèm nút `⇄` mở menu Popover chuyển chuyên khoa trực tiếp tại chỗ.
- **Tùy chọn Bật/Tắt Cột Số Chênh Tuyệt Đối (`± ca`):**
  - Cột `± Kỳ trước` (Kỳ này trừ Kỳ trước) và `± Cùng kỳ` (Kỳ này trừ Cùng kỳ).
  - Tăng trưởng: màu xanh `+N`, suy giảm: màu đỏ `-N`. Mặc định: BẬT.
- **Sắp xếp 3 chu kỳ (3-State Sorting):** Nhấn tiêu đề bất kỳ cột số liệu nào để chuyển đổi: **Giảm dần ↓** $\rightarrow$ **Tăng dần ↑** $\rightarrow$ **Hủy bỏ ↺** (khôi phục cài đặt mặc định).
- **Phân trang (Pagination):** Cho phép chọn `10 / 20 / 50 / 100 / Tất cả`, tự động lưu nhớ tùy chọn phân trang và sắp xếp vào `localStorage`.

### 1.7. Xuất Báo Cáo Excel & CSV Chuẩn UTF-8 Cho NotebookLM:
- **Xuất Excel:**
  - Sheet 1: **"Tổng hợp toàn viện"** (Bảng tổng hợp tất cả kỹ thuật kèm cột *Chuyên khoa* và các cột *Số chênh tuyệt đối* nếu đang bật).
  - Sheet 2..N: Các sheet riêng biệt cho từng chuyên khoa (`Ngoại TH`, `CTCH`, `Mắt`, `TMH`, `Phụ sản`, + nhóm tùy chỉnh).
- **Xuất CSV (NotebookLM):** Xuất toàn bộ danh sách toàn viện với mã **UTF-8 BOM (`\uFEFF`)**, đảm bảo kéo thả trực tiếp vào NotebookLM, Excel, Google Sheets không bao giờ bị lỗi font tiếng Việt.

### 1.8. Tạo Nhóm Chuyên Khoa Mới (Tùy Chỉnh) trong Cấu Hình:
- Trong **Cấu hình thống kê** $\rightarrow$ Tab con **Ngưỡng phân tích**:
  - Tùy chỉnh ngưỡng Cảnh báo (mặc định 10%) và Tích cực (mặc định 5%).
  - Form **"Tạo nhóm chuyên khoa mới (Tùy chỉnh)"**: Nhập tên nhóm, tên viết tắt $\rightarrow$ Nhóm mới tạo **CHỈ tiếp nhận các kỹ thuật do người dùng tự chuyển đến**.
  - Bảng quản lý danh mục kỹ thuật đã chuyển nhóm thủ công kèm nút Xóa (Thùng rác).

---

## 📂 2. Cấu Trúc File & Module Chính

```
├── services/
│   ├── specialtyComparisonService.ts     # Core logic phân loại 3 cấp, tính toán kỳ so sánh, lưu trữ nhóm tùy chỉnh & overrides
│   ├── excelExportComparisonService.ts   # Xuất Excel đa sheet (kèm sheet Tổng hợp toàn viện) và xuất CSV UTF-8 BOM
│   ├── reportService.ts                  # Lấy báo cáo phẫu thuật từ Firestore theo khoảng ngày
│   ├── reprocess.ts                      # Xử lý dữ liệu & kiểm tra xung đột trùng ca (isSameSession)
├── components/statistics/
│   ├── SpecialtyComparisonTab.tsx        # UI Dashboard phân tích so sánh, bảng dọc toàn viện, popover chuyển nhóm, sorting & paging
│   ├── StatisticsTab.tsx                 # Container chính trang thống kê (quản lý subtabs: summary, comparison, config)
│   ├── StatsConfig.tsx                   # Cấu hình giá, chương, hồ sơ, ngưỡng phân tích và tạo nhóm chuyên khoa mới
```

---

## 💾 3. Các Khóa Lưu Trữ LocalStorage

| Khóa LocalStorage | Ý nghĩa |
|---|---|
| `sdp_comparison_threshold_config` | Lưu cấu hình ngưỡng Cảnh báo (%) và Tích cực (%) |
| `sdp_specialty_custom_overrides` | Lưu từ điển gán chuyên khoa thủ công: `Record<normTenKT, SpecialtyCode>` |
| `sdp_custom_specialties_list` | Danh sách các nhóm chuyên khoa tùy chỉnh do user tạo |
| `sdp_comparison_show_diff` | Trạng thái Bật/Tắt hiển thị cột số chênh tuyệt đối (`± ca`) |
| `sdp_comparison_page_size` | Số dòng hiển thị mỗi trang trong bảng Tất cả chuyên khoa |
| `sdp_comparison_sort_col` | Cột đang được sắp xếp |
| `sdp_comparison_sort_dir` | Hướng sắp xếp (`asc` / `desc`) |

---

## 🚀 4. Trạng Thái Triển Khai
- **Mã nguồn:** Đã commit và push toàn bộ lên nhánh `temp-14-07-2026-22h39`.
- **Production Build:** Vite production build thành công 0 lỗi.
- **Vercel Deploy:** Đã deploy thành công lên https://initial-surgical-data-pro.vercel.app (`READY`).
