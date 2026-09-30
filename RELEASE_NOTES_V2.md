# 📋 Ghi Chú Phát Hành: Version 2.0 (Phase 1 Refactor & Unit Test Suite)

> **Trạng thái:** ✅ Sẵn sàng gộp vào `main` khi có yêu cầu  
> **Nhánh lưu trữ:** `temp-10-09-2026-15h20-task-1.3` (và alias `release-v2.0`)  
> **Tags:** `version-2`, `v2.0-phase1-refactor`  
> **Kiểm thử tự động:** 164/164 Unit Tests Pass (100%) | Build Vite 0 lỗi  

---

## 1. Tóm Tắt Nội Dung Version 2.0

Version 2.0 đánh dấu cột mốc hoàn thành toàn diện **Giai đoạn 1 (Phase 1)** của dự án SurgicalDataPro, bao gồm hai hạng mục nền tảng quan trọng:
1. **Bước 1.2 & 1.2b:** Thiết lập hệ thống kiểm thử tự động Vitest toàn diện bao phủ 100% nghiệp vụ tính toán, phân loại, áp giá, chống xung đột và thống kê.
2. **Bước 1.3:** Tái cấu trúc an toàn file nguyên khối `App.tsx` từ 4,462 dòng xuống 597 dòng (-86.6%), phân rã thành 10 custom hooks và 12 components/utilities độc lập.

---

## 2. Chi Tiết Bước 1.2 & 1.2b: Hệ Thống Unit Tests Nghiệp Vụ

Đã xây dựng 8 file kiểm thử độc lập với **164 kịch bản kiểm thử (test cases)** tự động, thời gian chạy ~1.5 giây:

| Nhóm Test | File Test | Số Tests | Nội dung kiểm thử chi tiết |
|---|---|:---:|---|
| **A** | `__tests__/overtimeCalculation.test.ts` | 24 | Phân loại ca mổ trong giờ / ngoài giờ / ngày nghỉ / lễ tết; phân biệt mùa hè (15/04-15/10) vs mùa đông (16/10-14/04); phân loại Kíp tăng cường vs Kíp mổ phiên; khấu trừ thời gian cho nhân viên đang trong ca trực. |
| **B** | `__tests__/conflictDetection.test.ts` | 20 | Phát hiện trùng lịch phẫu thuật viên, kíp mổ; ngoại lệ cho Bác sĩ gây mê hồi sức (cho phép tối đa 2 ca đồng thời); phát hiện trùng máy phẫu thuật. |
| **C** | `__tests__/excelProcessor.test.ts` | 28 | Chuẩn hóa ngày giờ Việt Nam; nhận diện và phân loại chính xác 9 loại PTTT (PĐB, P1, P2, P3, TĐB, T1, T2, T3, TKPL); kiểm tra trùng ca mổ trong file Excel; lọc theo phân quyền khoa/phòng. |
| **D** | `__tests__/laborConfig.test.ts` | 29 | Bảng định mức tiền thù lao phẫu thuật theo QĐ 73/2011/QĐ-TTg; giới hạn số lượng nhân sự tối đa cho 3 vị trí (Chính, Phụ, Giúp việc); snapshot bảng giá lao động qua các thời kỳ. |
| **E** | `__tests__/catalogEffectiveDate.test.ts` | 20 | Chuẩn hóa định dạng ngày lưu trữ; chuẩn hóa mở rộng viết tắt y khoa; tra cứu giá theo khoảng thời gian hiệu lực (lịch sử 3 phiên bản giá); cơ chế tra cứu siêu tốc O(1); danh mục kỹ thuật bắt buộc sử dụng mã máy. |
| **F** | `__tests__/refillFunctions.test.ts` | 14 | Phân biệt kỹ thuật gây tê (`_GT`) vs gây mê; phân tách giá BHYT vs Viện phí; gom nhóm ca mổ và cảnh báo xung đột đa mức giá; nạp giá tự động từ file thống kê DVKT BHXH; ánh xạ 28 chương phẫu thuật y tế. |
| **G** | `__tests__/costAndStatistics.test.ts` | 14 | Thứ tự ưu tiên tính Viện phí (`thanhTien` > `donGia * soLuong` > DM giá); phụ cấp phẫu thuật 3 vị trí; số ca thực tế vs số ca quy đổi; lũy kế ngày & tháng; phát hiện ca trùng lặp; ngăn chặn khoảng trống hiệu lực giá (smart-gap prevention). |
| **H** | `__tests__/refactoredModules.test.ts` | 15 | Kiểm thử các module mới tách ở 1.3: `dateUtils`, `tableSearchUtils` (tìm kiếm tiếng Việt không dấu, đa từ, lọc theo cột), `printConfigBuilder` (cấu hình in 4 bảng biểu kèm ngày ký), logic kíp trực 24h và thuật toán xác định mùa. |

---

## 3. Chi Tiết Bước 1.3: Tái Cấu Trúc Toàn Diện `App.tsx`

`App.tsx` đã được phân rã triệt để theo kiến trúc module sạch:
- **Số dòng ban đầu:** 4,462 dòng (~215 KB)
- **Số dòng hiện tại:** 597 dòng (~23 KB)
- **Tỷ lệ giảm:** **-86.6%**
- **Đảm bảo:** Giữ nguyên 100% giao diện, phong cách styling, phản hồi tương tác, cơ chế lưu trữ Firestore và các luồng xuất dữ liệu Excel/Print.

### Các Module & Custom Hooks Đã Tách:
1. **10 Custom Hooks:**
   - `hooks/useDutyScheduleState.ts`: Quản lý đồng bộ lịch trực, làm ngoài giờ, pre-fetch dữ liệu và badge đếm ca.
   - `hooks/useReportStateManager.ts`: Quản lý 4 trạng thái độc lập (`daily/monthly` × `storage/upload`) và bộ chọn thời gian.
   - `hooks/useReportTableSettings.ts`: Cấu hình bảng hiển thị (mật độ, phân trang, định dạng ngày, cột hiển thị/tìm kiếm).
   - `hooks/useToast.ts`: Hệ thống hiển thị thông báo Toast.
   - `hooks/useSurgeryTableData.tsx`: Lọc, tìm kiếm đa cột, phân trang, chọn dòng, double-click chỉnh sửa ca mổ.
   - `hooks/useReportPersistence.ts`: Quản lý lưu Firestore, xóa dữ liệu chọn lọc, xuất Excel form chuẩn.
   - `hooks/usePrintController.ts`: Điều khiển modal in ấn, định hướng trang in và tự động lưu trước khi in.
   - `hooks/useExcelProcessing.tsx`: Validate file, xử lý file Minh Lộ, học nhân sự mới, áp giá DVKT, điền GV/máy tự động.
   - `hooks/useStorageQuery.ts`: Xác định mùa hè/đông, tự động điền kíp trực 24h, đồng bộ giá từ tháng sang ngày.
   - `hooks/useAppCommandPalette.tsx`: Quản lý phím tắt `Ctrl+K / Cmd+K` và danh mục điều hướng nhanh.

2. **12 Components & Utilities:**
   - `components/common/DynamicTable.tsx`
   - `components/common/ToastContainer.tsx`
   - `components/common/ConfirmDialog.tsx`
   - `components/surgery/PaymentTableView.tsx`
   - `components/surgery/printConfigBuilder.tsx`
   - `components/surgery/ReportActionBar.tsx`
   - `components/surgery/HospitalStatCards.tsx`
   - `components/surgery/MonthlyPriceBanner.tsx`
   - `components/surgery/StorageQueryBar.tsx`
   - `components/surgery/UploadFileBar.tsx`
   - `components/surgery/surgeryColumns.tsx`
   - `components/surgery/SurgeryTableViewRouter.tsx`
   - `utils/dateUtils.ts` & `utils/tableSearchUtils.ts`

---

## 4. Hướng Dẫn Gộp Vào `main` Khi Có Yêu Cầu

Khi bạn sẵn sàng gộp vào nhánh chính `main`, chỉ cần kích hoạt lệnh sau:
```bash
git checkout main
git merge temp-10-09-2026-15h20-task-1.3 --no-ff -m "merge: release Version 2.0 (Phase 1 Refactor & Unit Test Suite)"
git push origin main
```
Toàn bộ mã nguồn trên nhánh này đã được biên dịch thành công (`npm run build`) và vượt qua 100% các bài kiểm tra (`npm test`).
