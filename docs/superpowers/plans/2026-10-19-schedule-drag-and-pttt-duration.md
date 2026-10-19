# Kế Hoạch Triển Khai: Kéo Thả Lịch Mổ (Drag & Drop) & Tự Động Tính Giờ Kết Thúc Theo Loại PTTT

> **Ngày lập:** 19/10/2026  
> **Agent phụ trách:** `@[frontend-specialist]`  
> **Mục tiêu:**  
> 1. Bổ sung thao tác kéo thả (Drag & Drop) khối ca mổ dọc theo trục thời gian trên cả máy tính (click giữ chuột & di chuyển) và điện thoại (touch giữ & di chuyển), với bước nhảy **1 phút**, tự động xếp sát timeline khi vào khoảng trống và đẩy xuống dưới cùng khi đi qua vùng đã có ca mổ khác.  
> 2. Tích hợp cột `loaiPTTT` từ file `/Users/buiminhkhoi/Documents/TEMP/Danh_muc_gia_phau_thuat.xlsx` vào Danh mục giá PTTT (`SurgeryNamePrice`), hiển thị phân loại PTTT trong modal **Thêm ca mổ**, và tự động tính **Giờ kết thúc = Giờ bắt đầu + Thời gian tối thiểu của loại PTTT** (theo cấu hình Định mức thời gian) khi chọn kỹ thuật hoặc đổi giờ bắt đầu (trừ khi user đã chủ động sửa tay giờ kết thúc).

---

## 1. Hạng Mục 1: Đồng Bộ `loaiPTTT` Từ Danh Mục & Tự Động Điền Giờ Kết Thúc

### 1.1. Mở rộng Model & Dữ liệu Danh mục (`types.ts`, `services/surgeryNamePriceService.ts`)
- Bổ sung trường `loaiPTTT?: string` vào interface `SurgeryNamePrice` trong `types.ts`.
- Tạo bộ tra cứu mặc định `services/defaultSurgeryLoaiMap.ts` trích xuất trực tiếp từ `/Users/buiminhkhoi/Documents/TEMP/Danh_muc_gia_phau_thuat.xlsx` (chuẩn hóa `PDB` → `PĐB`, `TDB` → `TĐB`, ánh xạ theo cả `maTuongDuong` và `tenKT` chuẩn hóa).
- Cập nhật `services/surgeryNamePriceService.ts`:
  - Hàm `normalizeLoaiPTTT(raw)` và `resolveCatalogLoaiPTTT(tenKT, maTuongDuong, explicitLoai)`.
  - Trong `parsePrices`: tự động gắn `loaiPTTT` từ RTDB hoặc fallback từ bảng ánh xạ chuẩn của file Excel.
  - Trong `parseImportedNamePriceExcel`, `exportSurgeryNamePrices`, `exportNamePriceTemplate`, `bulkUpsertSurgeryNamePrices`: đọc/ghi cột thứ 6 (`loaiPTTT`) và lan truyền `loaiPTTT` cho các dòng cùng tên kỹ thuật/mã tương đương.
  - Tự động đồng bộ ngầm (one-time migration `migrateLoaiPTTTInRTDB`) để cập nhật trường `loaiPTTT` lên Firebase RTDB `surgery_name_prices`.
- Cập nhật `components/statistics/SurgeryNamePriceConfig.tsx`:
  - Hiển thị cột/badge `Loại PTTT` và hỗ trợ chọn `loaiPTTT` khi thêm/sửa danh mục.

### 1.2. Tự động tính Giờ kết thúc trong `ScheduleSurgeryModal.tsx`
- Truyền `timeItemsList` và `timeRules` từ `SchedulingTab.tsx` vào `ScheduleSurgeryModal.tsx`.
- Khi người dùng chọn một ca mổ từ dropdown (hoặc gõ khớp tên kỹ thuật trong danh mục):
  - Xác định `loaiPTTT` của kỹ thuật đó và tra cứu `minMinutes = getTimeRuleForRecord(loaiPTTT, date, timeItemsList, timeRules).min`.
  - Hiển thị badge `Loại PTTT` và định mức thời gian tối thiểu ngay trong danh sách gợi ý và bên dưới ô chọn kỹ thuật / thời gian.
  - Đặt cờ `isEndTimeManuallyEdited = false` khi chọn kỹ thuật mới và tự động điền `endTime = addMinutes(startTime, minMinutes)`.
- Khi người dùng thay đổi `startTime`:
  - Nếu `!isEndTimeManuallyEdited` và `minMinutes > 0`: tự động cập nhật `endTime = addMinutes(newStart, minMinutes)`.
- Khi người dùng chủ động chỉnh sửa ô `Giờ kết thúc`:
  - Đặt `isEndTimeManuallyEdited = true` để giữ nguyên giờ kết thúc theo ý người dùng.

---

## 2. Hạng Mục 2: Kéo Thả (Drag & Drop) Khối Ca Mổ Trên Timeline (`DayTimelineView.tsx`, `SchedulingTab.tsx`)

### 2.1. Tương tác Chuột (Desktop) & Chạm Giữ (Mobile Touch)
- **Desktop:** Nhấn giữ chuột trái (`onMouseDown`) trên khối ca mổ và di chuyển dọc theo trục timeline (vượt ngưỡng 3px để phân biệt với click xem chi tiết).
- **Mobile:** Chạm và giữ (`onTouchStart` ~220ms không cuộn trang) để kích hoạt chế độ kéo khối (kèm phản hồi rung nhẹ `navigator.vibrate?.(25)` nếu thiết bị hỗ trợ), khóa cuộn trang (`preventDefault`) trong lúc di chuyển ngón tay.
- **Bước nhảy 1 phút:** Tính toán độ lệch pixel theo `hourWidth` (chế độ Ngang) hoặc `verticalHourHeight` (chế độ Dọc) ra số phút nguyên (`Math.round(deltaPx / pxPerHour * 60)`), cập nhật mượt mà `startTime` và `endTime` theo từng phút (giữ nguyên thời lượng ca mổ).
- **Tự động cuộn (Auto-scroll):** Khi kéo khối gần mép khung nhìn timeline, tự động cuộn mượt container theo hướng kéo.

### 2.2. Tự động Xếp Vị Trí Khối & Phát Hiện Xung Đột Trực Tiếp
- **Chế độ Ngang (`assignLanes`):**
  - Các khối không kéo giữ nguyên vị trí ổn định.
  - Khối đang kéo (hoặc vừa thả):
    - Khi di chuyển đến vùng trống (không giao thoa giờ với ca nào khác): tự động xếp lên **Lane 0 (sát trục timeline trên cùng)**.
    - Khi di chuyển qua vùng đã có ca mổ khác: tự động **đẩy xuống dưới cùng** (`maxOverlappingLane + 1`), nằm dưới tất cả các ca đang chiếm khung giờ đó và giữ nguyên vị trí đó sau khi thả chuột.
- **Chế độ Dọc (`computeVerticalLayout`):**
  - Tự động tách cột khi đi vào vùng trùng giờ và mở rộng toàn chiều ngang (cột 0) khi đi vào vùng trống.
- **Kiểm tra xung đột thời gian thực (Live Conflict Detection):**
  - Tính toán lại xung đột Máy / Nhân sự ngay trong lúc kéo để đổi màu cảnh báo trực tiếp trên khối đang kéo.
- **Lưu dữ liệu (`onEntryTimeChange`):**
  - Cập nhật optimistic state ngay khi thả chuột/ngón tay và lưu `startTime`, `endTime` mới lên Firebase.

---

## 3. Kiểm Thử & Xác Thực
- Viết unit test kiểm thử:
  - Chuẩn hóa `loaiPTTT`, tra cứu `loaiPTTT` từ danh mục & tự động tính giờ kết thúc theo thời gian tối thiểu.
  - Logic xếp làn (`assignLanes`) khi kéo thả vào khoảng trống (về lane 0 sát timeline) và khi trùng giờ (đẩy xuống dưới cùng).
  - Tương tác kéo thả trên `DayTimelineView`.
- Chạy `npm test` và `npx tsc --noEmit` đảm bảo 100% pass.
