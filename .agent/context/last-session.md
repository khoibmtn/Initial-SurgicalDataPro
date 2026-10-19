# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 19/10/2026 15:58 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-19-10-2026-14h20` (đồng bộ với `main`, commit tính năng `7a5a3a8`)  
> **Remote:** `origin/main` đã push đầy đủ lên GitHub  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build)`  
> **Trạng thái Test:** `428 / 428 tests PASS` (34 test suites, 100% pass)  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Toggle Hiển Thị Kíp Mổ & Tự Động Co Giãn Chiều Cao Card Trên Lịch Mổ (19/10/2026)
- **Yêu cầu:**
  - Bổ sung nút bật/tắt (toggle) hiển thị tên kíp mổ kèm vị trí ngay trong card của mỗi cuộc mổ trên lịch mổ.
  - Giữ nguyên chiều ngang (`width`) của card theo đúng độ dài khung giờ mổ trên trục timeline, nhưng tự động co giãn chiều cao dọc của card phù hợp với các chuỗi ký tự tên bên trong và tự động đẩy các card ở làn dưới (`lane > 0`) xuống để không bao giờ đè lên nhau.
- **Giải pháp triển khai:**
  1. **Chuẩn hóa danh sách vị trí & nhân sự (`types/schedule.ts`):**
     - Bổ sung `gv: 'Giúp việc'` vào `STAFF_ROLE_LABELS`.
     - Thêm hàm `getOrderedStaffEntries(staff)` trả về mảng `StaffDisplayItem[]` (`roleKey`, `roleLabel`, `name`) theo thứ tự chuẩn: `PT Chính` → `PT Phụ` → `BS Gây mê` → `KTV Gây mê` → `TDC` → `Giúp việc`.
  2. **Nút Toggle `Kíp mổ` & Lưu trạng thái (`SchedulingTab.tsx`, `DayTimelineView.tsx`):**
     - Thêm nút toggle `Kíp mổ` (icon `Users`) trên thanh công cụ Timeline và Header, lưu trạng thái vào `localStorage` (`surgical_timeline_show_staff`).
     - Hỗ trợ đồng bộ trên cả 3 chế độ xem: **Timeline Ngang (`horizontal`)**, **Timeline Dọc (`vertical`)**, và **Danh sách (`MobileScheduleList.tsx`)**.
  3. **Co giãn chiều cao dọc thông minh & Chống đè khối (`DayTimelineView.tsx`):**
     - Hiển thị từng vị trí trên 1 dòng riêng (`Vị trí: Họ tên`) bên dưới tên kỹ thuật mổ, cho phép tự xuống dòng (`whitespace-normal break-words`) và tô nổi bật màu cảnh báo nếu nhân sự đó đang bị trùng lịch.
     - Kết hợp hàm ước lượng `estimateHorizontalCardHeight(entry, cardWidth, showStaff, conflictBadgeCount)` và `ResizeObserver` (`measuredCardHeights`) đo chiều cao thực tế của DOM để tính toán `horizontalCardLayout`: các card ở `lane > 0` có giao thoa thời gian tự động dịch xuống dưới card đã giãn cao ở làn trên.

---

### 1.2. Kéo Thả (Drag-and-Drop) Ca Mổ Trên Timeline & Tự Động Tính Giờ Kết Thúc Theo Loại PTTT (19/10/2026)
- **Kéo thả trực tiếp trên Timeline (`DayTimelineView.tsx`):**
  - Hỗ trợ **Chuột (Desktop)**: Nhấn giữ chuột (`mousedown`) khoảng `150ms` hoặc di chuyển `> 5px` trên khối ca mổ và kéo dọc theo trục thời gian (cả chế độ **Ngang** và **Dọc**).
  - Hỗ trợ **Cảm ứng (Mobile/Tablet)**: Chạm và giữ (`touchstart` long-press `250ms`) để kích hoạt chế độ kéo mà không xung đột với thao tác cuộn trang bình thường.
  - **Tự động xếp làn thông minh (Real-time Lane Re-stacking)**: Trong lúc kéo, giờ bắt đầu và kết thúc dịch chuyển theo bước nhảy 1 phút (giữ nguyên thời lượng ca mổ), đồng thời thuật toán `assignLanes` tính toán lại tức thời — nếu kéo đến vùng trống khối tự nhảy lên sát trục timeline (`lane 0`), nếu kéo đến vùng đã có ca khác thì tự động xếp xuống làn dưới cùng.
- **Tự động điền giờ kết thúc theo Loại PTTT (`ScheduleSurgeryModal.tsx`, `surgeryNamePriceService.ts`):**
  - Định mức thời gian tối thiểu theo Loại PTTT (`LOAI_PTTT_MIN_DURATION_MINUTES`):
    - **Loại Đặc biệt (`ĐB`):** `120 phút`
    - **Loại 1 (`1`, `I`):** `60 phút`
    - **Loại 2 (`2`, `II`):** `45 phút`
    - **Loại 3 (`3`, `III`):** `30 phút`
  - Khi người dùng chọn kỹ thuật mổ từ danh mục hoặc nhập giờ bắt đầu (`startTime`), hệ thống tự động tra cứu `loaiPTTT` và cộng số phút tối thiểu để điền `endTime` (kèm badge thông báo `Loại X · tối thiểu Y phút`). Người dùng vẫn có thể sửa tay giờ kết thúc bất kỳ lúc nào (`endTimeManuallyEdited`).
- **Đồng bộ Danh mục Kỹ thuật (DMKT) kèm Loại PTTT lên Firestore:**
  - Cập nhật giao diện import Excel trong `SurgeryNamePriceConfig.tsx`, hàm `importSurgeryNamePricesFromExcel` trong `surgeryNamePriceService.ts`, và bảng tra cứu mặc định `defaultSurgeryLoaiMap.ts` (373 kỹ thuật từ file DMKT chuẩn).
  - Đã upload toàn bộ **373 kỹ thuật kèm Loại PTTT** lên Firestore production qua `scripts/uploadSurgeryNamePrices.ts`.

---

### 1.3. Tối Ưu Tốc Độ Tải Dữ Liệu Đồng Thời (Tab Gói DVYC & Thanh Toán)
- **Instant Fallback Rendering (`PackageListView.tsx`):** Hiển thị tức thời các ca từ `assignments` trong khi chờ `records` phẫu thuật tải xong.
- **Parallel Pre-loading (`hooks/useStorageQuery.ts`, `hooks/usePaymentLists.ts`):** Chạy song song các tác vụ truy vấn báo cáo phẫu thuật, gói dịch vụ và đợt thanh toán; hiển thị Skeleton loading mượt mà.

---

### 1.4. Chức Năng Đổi Mật Khẩu Cá Nhân & Nâng Cao Độ Tương Phản UI
- **Đổi mật khẩu (`ChangePasswordModal.tsx`, `authService.ts`):** Xác thực lại qua `reauthenticateWithCredential`, xóa cờ `passwordResetDefault`, ghi Audit Log `UPDATE_PASSWORD`.
- **Độ tương phản cao cho màn hình tấm nền TN:** Chuẩn hóa màu nút bấm (`bg-emerald-700`, `bg-primary-700`, chữ trắng in đậm) trên các thanh công cụ và bảng Gói DVYC.

---

## 📐 2. Cấu Trúc Dữ Liệu & Hàm Xử Lý Trọng Điểm

### 2.1. ScheduledSurgery & Kíp Mổ (`types/schedule.ts`)
```typescript
export interface StaffDisplayItem {
  roleKey: string;
  roleLabel: string;
  name: string;
}

export const STAFF_ROLE_LABELS: Record<string, string> = {
  ptChinh: 'PT Chính',
  ptPhu: 'PT Phụ',
  bsGM: 'BS Gây mê',
  ktvGM: 'KTV Gây mê',
  tdc: 'TDC',
  gv: 'Giúp việc',
};

export function getOrderedStaffEntries(
  staff?: ScheduledSurgery['staff'] | Record<string, string | undefined>
): StaffDisplayItem[];
```

### 2.2. SurgeryNamePrice & Thời Lượng Tối Thiểu Theo Loại PTTT (`types.ts`, `services/surgeryNamePriceService.ts`)
```typescript
export interface SurgeryNamePrice {
  id: string;
  tenKT: string;
  giaDVYC: number;
  loaiPTTT?: string; // 'ĐB' | '1' | '2' | '3'
  createdAt: string;
  updatedAt: string;
}

export const LOAI_PTTT_MIN_DURATION_MINUTES: Record<string, number> = {
  'ĐB': 120,
  '1': 60,
  '2': 45,
  '3': 30,
};

export function getMinDurationMinutesByLoai(loaiPTTT?: string | null): number | null;
export function calculateEndTimeFromStartAndDuration(startTime: string, durationMinutes: number): string | null;
```

### 2.3. Kéo Thả & Co Giãn Chiều Cao Card Timeline (`components/scheduling/DayTimelineView.tsx`)
```typescript
export function estimateHorizontalCardHeight(
  entry: Pick<ScheduledSurgery, 'staff' | 'patientName' | 'tenKT'>,
  cardWidth: number,
  showStaff: boolean,
  conflictBadgeCount?: number
): number;

export function computeDraggedTimes(
  entry: Pick<ScheduledSurgery, 'startTime' | 'endTime'>,
  deltaPx: number,
  pxPerHour: number,
  shiftStartHour: number
): { startTime: string; endTime: string } | null;
```

---

## 📂 3. Danh Sách Tệp Mã Nguồn Đã Thay Đổi Gần Nhất
1. `types/schedule.ts`: Bổ sung `gv: 'Giúp việc'` và hàm `getOrderedStaffEntries`.
2. `components/scheduling/DayTimelineView.tsx`: Kéo thả khối ca mổ (chuột & cảm ứng), nút toggle `Kíp mổ`, hiển thị `Vị trí: Họ tên` từng dòng, tự động co giãn chiều cao dọc (`estimateHorizontalCardHeight` + `ResizeObserver`) và xếp chồng làn chống đè khối (`horizontalCardLayout`).
3. `components/scheduling/MobileScheduleList.tsx`: Hỗ trợ hiển thị danh sách `Vị trí: Họ tên` khi bật toggle `Kíp mổ`.
4. `components/scheduling/SchedulingTab.tsx`: Đồng bộ state `showStaff`, xử lý callback kéo thả `handleEntryTimeChange`, truyền danh mục giá & loại PTTT xuống modal.
5. `components/scheduling/ScheduleSurgeryModal.tsx`: Tự động tính giờ kết thúc theo `loaiPTTT` khi chọn kỹ thuật hoặc nhập giờ bắt đầu.
6. `services/surgeryNamePriceService.ts` & `services/defaultSurgeryLoaiMap.ts`: Chuẩn hóa `loaiPTTT`, tính thời gian tối thiểu theo loại PTTT, hỗ trợ import/export Excel có cột Loại PTTT.
7. `__tests__/scheduleDragAndLoaiDuration.test.ts`: Bộ 10 unit tests kiểm thử toàn diện logic thời lượng PTTT, kéo thả timeline, thứ tự kíp mổ và tính chiều cao card co giãn.

---

## 🚀 4. Trạng Thái Triển Khai & Kiểm Thử
- **Git Branch:** `temp-19-10-2026-14h20` (đã merge vào `main` và push lên `origin/main`).
- **Vercel Production:** Đã deploy lên `https://initial-surgical-data-pro.vercel.app`.
- **Test Suite:** `428 / 428 tests PASS` trong 34 file test (`npm test`).
