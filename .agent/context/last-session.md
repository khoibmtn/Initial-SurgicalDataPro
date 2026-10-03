# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 03/10/2026 23:35 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `main` (commit `bb495f3`), nhánh làm việc tạm: `temp-03-10-2026-23h25`  
> **Remote:** `origin/main` đã push đầy đủ lên GitHub  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build, 6.51s)`  
> **Trạng thái Test:** `331 / 331 tests PASS` (23 test suites, 100% pass)  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Tối Ưu Tốc Độ Tải Lịch Mổ (Stale-While-Revalidate & Prefetching)
- **Cơ chế Cache 2 tầng**:
  - Lưu trữ tạm thời lịch mổ của từng ngày trong bộ nhớ RAM (`memoryCache`) và `localStorage` (`schedule_cache_v1:{date}`, tối đa 21 ngày gần nhất).
  - Khi mở tab Lịch mổ hoặc chuyển ngày, dữ liệu cache được hiển thị **tức thì (0ms)**, đồng thời Firebase RTDB listener kích hoạt ngầm để cập nhật dữ liệu mới nhất.
  - Cạnh tiêu đề ngày có biểu tượng xoay kèm trạng thái rõ ràng: "Đang tải" (chưa có cache) hoặc "Đang đồng bộ" (đang hiển thị cache và chờ dữ liệu thời gian thực).
- **Prefetching ngày trước & ngày sau**:
  - Khi ngày hiện tại đã đồng bộ xong (`live`), hệ thống tự động tải trước dữ liệu của ngày hôm trước (d-1) và ngày hôm sau (d+1), giúp thao tác bấm ◀ / ▶ chuyển ngày diễn ra ngay lập tức.
- **Trì hoãn tải danh mục giá (`surgery_name_prices`)**:
  - Danh mục giá phẫu thuật (~2.5 MB, hơn 3.000 mục) chia sẻ chung kết nối WebSocket Firebase. Trong tab Lịch mổ, danh mục này được trì hoãn và chỉ nạp khi người dùng mở modal thêm/sửa ca mổ, loại bỏ hoàn toàn hiện tượng nghẽn đường truyền lúc mới tải lịch.
- **Bộ nhớ đệm tuần (`WeekOverview.tsx`)**:
  - Tổng quan tuần khởi tạo trực tiếp từ cache và memo hóa việc phát hiện xung đột, không tính toán lại dư thừa khi re-render.

---

### 1.2. Nhập Giờ Tự Do 24h & Khắc Phục Lỗi AM/PM (`TimeInput24`)
- **Vấn đề trước đây**: Thẻ `<input type="time">` phụ thuộc vào locale của trình duyệt và hệ điều hành, thường hiển thị dạng 12h (AM/PM, ví dụ `01:05 PM`).
- **Giải pháp**: Xây dựng component chuyên dụng [TimeInput24.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/common/TimeInput24.tsx):
  - Luôn hiển thị định dạng chuẩn 24h (ví dụ `13:05`, không có AM/PM).
  - Hỗ trợ gõ tắt linh hoạt tự động chuẩn hóa: `1305` ➔ `13:05`, `801` ➔ `08:01`, `13h` ➔ `13:00`, `8` ➔ `08:00`.
  - Phím tắt bàn phím: Bấm phím mũi tên `↑` / `↓` để tăng/giảm từng 1 phút; giữ `Shift + ↑ / ↓` để tăng/giảm 15 phút.
  - Tự động điều chỉnh giờ kết thúc khi đổi giờ bắt đầu nếu giờ kết thúc cũ không còn hợp lệ.

---

### 1.3. Chuẩn Hóa Khung Giờ Ca Trực 24h & Loại Bỏ Ký Hiệu "+1" Trên Timeline
- **Khung ca trực 24h**: Bắt đầu từ giờ hành chính sáng (07:30 mùa đông, 07:00 mùa hè) kéo dài đến trước giờ hành chính sáng hôm sau (07:29 hoặc 06:59).
- **Loại bỏ ký hiệu "+1"**:
  - Theo yêu cầu người dùng, các mốc giờ sau nửa đêm thuộc ca trực (00:00 – 07:29) được hiển thị dạng `HH:mm` thuần túy, không kèm ký hiệu `+1` ở mốc đo thời gian (ticks), trên thẻ ca mổ (timeline cards) và trong danh sách.
  - Header tua trực hiển thị mốc kết thúc chính xác là `dutyStartHour - 1 phút` (ví dụ: `07:30 đến 07:29`).
- **Khắc phục lỗi hàm parse thời gian (`scheduleConflictService.ts`)**:
  - Sửa lỗi regex cũ `t.replace(/[^\d:]/g, '')` vô tình biến chuỗi `"07:30 (+1)"` thành `"07:301"` khiến giờ bị tính sai thành ~12h trưa. Sử dụng regex bóc tách nhóm `(\d{1,2})(?:\s*[:hH]\s*(\d{1,2}))?` chuẩn xác.

---

### 1.4. Khắc Phục Triệt Để Lỗi Không Thêm Được Ca Mổ Mới
- **Hiện tượng**: Bấm "Thêm ca mổ", điền thông tin và bấm "Đăng ký ca mổ" nhưng modal không phản hồi và ca mổ không được lưu.
- **Nguyên nhân gốc rễ**:
  - Firebase Realtime Database (RTDB) cấm hoàn toàn giá trị `undefined` trong object gửi lên.
  - Khi người dùng để trống ô **Ghi chú**, trường `note` nhận giá trị `undefined` (`note: undefined`).
  - Firebase SDK ném ngoại lệ client-side: `set failed: value argument contains undefined in property 'surgery_schedules.YYYY-MM-DD.<id>.note'`.
  - Ngoại lệ bị khối `try...catch` cũ bắt mà không hiển thị thông báo lỗi lên UI, khiến nút bấm dường như bị vô hiệu hóa.
- **Xử lý**:
  - Viết hàm [stripUndefined](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/services/scheduleService.ts#L18-L20) trong `scheduleService.ts` tự động loại bỏ toàn bộ key `undefined` trước khi thực hiện `set` / `update`.
  - Trong `ScheduleSurgeryModal.tsx`, chỉ truyền `note` khi có nội dung thực tế (`...(note.trim() ? { note: note.trim() } : {})`).
  - Thêm hiển thị thông báo lỗi `saveError` (màu đỏ, trợ năng `role="alert"`) ngay cạnh nút lưu để cảnh báo ngay nếu gặp lỗi phân quyền hoặc lỗi mạng.
  - Khi cập nhật ca mổ mà xóa trắng ghi chú, trường `note` được đặt thành `null` để Firebase RTDB xóa sạch key cũ.
  - Đã kiểm thử trực tiếp thao tác ghi / đọc / xóa với Firebase RTDB qua script Node.js và unit test (`__tests__/verifyAddSurgery.test.ts`).

---

### 1.5. Rà Soát Kíp Mổ & Kiểm Tra Trùng Giờ Theo Định Mức Bàn Mổ
- **Sửa lỗi kíp mổ chỉ hiện BS GMHS**:
  - Nguyên nhân: Trước đó code lấy nhầm bộ lọc từ `reportRoleFilters` (vốn là bộ lọc nhập file báo cáo ngoài giờ với cấu hình mặc định chỉ chọn BS GMHS).
  - Khắc phục: Phân hệ xếp lịch mổ lấy danh sách vị trí từ `STAFF_POSITIONS` kết hợp với `tableItems` ("Định mức bàn mổ") có `limit > 0`.
  - Vị trí Giúp việc (`gv` có `limit = 0`) được ẩn theo đúng quy chế khoa phòng; các vị trí Phẫu thuật chính, Phẫu thuật phụ, Bác sĩ GMHS, Kỹ thuật viên GM, Tít dụng cụ hiển thị đầy đủ.
- **Kiểm tra trùng giờ thông minh theo Định mức bàn mổ (`roleLimits`)**:
  - Bác sĩ GMHS có định mức bàn mổ = 2 (có thể phụ trách tối đa 2 bàn mổ cùng lúc). Khi BS GMHS tham gia 2 ca mổ trùng giờ nhau, hệ thống **KHÔNG báo trùng**. Chỉ khi tham gia từ ca thứ 3 trở lên trong cùng khoảng thời gian mới kích hoạt cảnh báo xung đột nhân sự.

---

### 1.6. Chế Độ Màn Hình Chiếu (Projector Mode)
- **Mục đích**: Tối ưu cho màn hình TV lớn / máy chiếu trong phòng theo dõi sắp xếp ca mổ.
- **Giao diện [ProjectorView.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/scheduling/ProjectorView.tsx)**:
  - Nút biểu tượng `MonitorPlay` trên thanh công cụ của desktop.
  - Đồng hồ điện tử kích thước lớn hiển thị thời gian thực theo từng giây (`HH:mm:ss`).
  - Thống kê trực quan: Tổng ca, Đang mổ, Sắp tới, Đã xong, Số ca xung đột.
  - Bố cục chia 2 vùng: Bên trái là Timeline 24h tự động co giãn vừa khung hình (zoom 40/60/80); bên phải là danh sách ca mổ phân theo trạng thái.
  - Hỗ trợ nút "Toàn màn hình" (Fullscreen API), phím `Esc` để thoát; nhấp vào bất kỳ ca mổ nào vẫn mở modal chỉnh sửa bình thường.

---

### 1.7. Tối Ưu Trải Nghiệm Trên Điện Thoại (Mobile Experience)
- **Giao diện [MobileScheduleList.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/scheduling/MobileScheduleList.tsx)**:
  - Tự động gom nhóm ca mổ theo 3 trạng thái: **Đang mổ**, **Sắp tới**, **Đã xong** dựa trên thời gian thực của ca trực.
  - Ca đang mổ có thanh tiến độ (progress bar) trực quan ở chân thẻ.
  - Thẻ ca mổ được thiết kế lại: Tên bệnh nhân luôn hiển thị trọn vẹn ở dòng trên cùng, dòng tiếp theo là thời gian và phẫu thuật viên chính, dòng dưới là tên kỹ thuật mổ.
  - Nút bấm tròn nổi (+) (Floating Action Button) cố định ở góc dưới bên phải màn hình giúp thao tác thêm ca mổ bằng một tay thuận tiện.
  - Hỗ trợ cử chỉ vuốt ngón tay (Swipe ◀ / ▶) để chuyển ngày mượt mà.

---

## 📐 2. Cấu Trúc Dữ Liệu & Schema Trọng Điểm

### 2.1. Scheduled Surgery Schema (`types/schedule.ts`)
```typescript
export interface ScheduledSurgery {
  id: string;
  date: string;             // yyyy-mm-dd
  patientId: string;        // Mã KCB
  patientName: string;      // Họ tên BN
  tenKT: string;            // Tên phẫu thuật / thủ thuật

  startTime: string;        // HH:mm (24h)
  endTime: string;          // HH:mm (24h)

  machineCode: string;
  machineName: string;

  staff: Record<string, string>; // { ptChinh, ptPhu, bsGM, ktvGM, tdc }
  note?: string;

  createdBy: string;        // uid
  createdByName: string;    // display name
  createdAt: number;        // timestamp ms
  updatedAt: number;        // timestamp ms
}

export type ScheduledSurgeryInput = Omit<ScheduledSurgery, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>;
```

### 2.2. Conflict Detection với Định Mức Bàn Mổ
```typescript
export function detectConflicts(
  entries: ScheduledSurgery[],
  roleFilters?: RoleFilterConfig,
  dutyStartHour: number = 7.5,
  roleLimits?: Partial<Record<string, number>>, // { ptChinh: 1, ptPhu: 1, bsGM: 2, ktvGM: 1, tdc: 1 }
): ScheduleConflict[];
```

---

## 🚀 3. Trạng Thái Git, Build & Deploy

- **Nhánh `main`**: Đã merge commit `bb495f3` và push lên GitHub (`origin/main`).
- **Nhánh làm việc tạm**: `temp-03-10-2026-23h25`.
- **Deploy Vercel Production**: Thành công 100% tại `https://initial-surgical-data-pro.vercel.app`.
- **Bộ kiểm thử tự động**: 23 test suites, 331 tests passed.
- **Tuân thủ quy tắc dự án**:
  - Không vi phạm Purple Ban (không sử dụng màu tím/violet).
  - Không phụ thuộc vào `reportRoleFilters` trong phân hệ xếp lịch.
  - Giữ nguyên các vị trí định mức bàn mổ và quy chế trực 24h.
