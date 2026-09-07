# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 08/09/2026 01:32 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-08-09-2026-01h31`  
> **Commit mới nhất:** `5108709 fix: can chinh do rong sticky column tren bang Lich truc tranh de cot ngay dau tien`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi TypeScript)`

---

## 📌 1. Các Tính Năng Đã Triển Khai Trong Phiên

### 1.1. Tab Lịch Trực (`DutyScheduleTab.tsx`)
- **Quản lý Tua trực 24h:**
  - Tua trực bắt đầu từ giờ hành chính sáng ngày T (`07:00` mùa hè, `07:30` mùa đông) đến trước giờ hành chính sáng ngày T+1 (`06:59` hoặc `07:29`).
- **Ma trận Ngày × Nhân viên kíp mổ:**
  - Liệt kê các ngày diễn ra phẫu thuật (`dd/MM`), ngày cuối cùng là ngày kết thúc muộn nhất.
  - Cột Khoa và Họ tên cố định bên trái, sắp xếp theo thứ tự Khoa trong Cấu hình và Bảng thanh toán.
  - Hàng cấu hình **Ngày nghỉ / Lễ / Tết**: Checkbox từng ngày (mặc định Thứ 7 & Chủ Nhật được check). Check = nghỉ 100% ngoài giờ; Bỏ check = làm bù hành chính.
  - Checkbox phân công trực 24h cho từng nhân viên.
- **Lưu trữ tập trung Firestore (`dutyScheduleService.ts`):**
  - Lưu vào root collection `duty_schedules` với document ID là `YYYY-MM-DD`.
  - Tự động nạp lại lịch trực khi mở ca mổ cũ hoặc chuyển đổi giữa BC ngày $\longleftrightarrow$ BC tháng $\longleftrightarrow$ Kho lưu trữ.
  - Tự động lưu tức thì (Auto-save) khi click checkbox kèm phát sự kiện realtime `sdp-duty-schedule-changed`.

### 1.2. Khắc Phục Lỗi Cột Ngày Đầu Tiên Bị Đè (Sticky Column Alignment)
- **Vấn đề trước đây:** Cột Họ và tên nhân viên có `sticky left-[180px]`, nhưng ô `<td>` của cột Khoa / Phòng không đặt chiều rộng cố định khiến trình duyệt co cột Khoa xuống ~90px. Do đó cột Họ tên bị dạt sang phải và che khuất hoàn toàn cột ngày đầu tiên (`01/08`), đồng thời che một phần cột `02/08`.
- **Giải pháp triệt để:**
  - Bổ sung `<colgroup>` khai báo cố định: Cột 1 (`160px`), Cột 2 (`240px`), các cột ngày (`76px`).
  - Đặt `w-[160px] min-w-[160px] max-w-[160px] sticky left-0` cho Cột 1 và `w-[240px] min-w-[240px] max-w-[240px] sticky left-[160px]` cho Cột 2 trên cả `<th>` và `<td>`.
  - Tách hàng cấu hình ngày nghỉ thành 2 ô riêng biệt (Cột 1: `CẤU HÌNH`, Cột 2: `NGÀY NGHỈ / LỄ / TẾT`), loại bỏ `colSpan={2}` trên hàng sticky.
  - Kiểm thử trực tiếp trên trình duyệt: Cột ngày `01/08` và `02/08` hiển thị rõ nét 100%, cuộn ngang mượt mà.

### 1.3. Tab Ngoài Giờ (`OvertimeTab.tsx` & `overtimeCalculationService.ts`)
- **Engine tính toán ngoài giờ đa phân đoạn:**
  - Tự động nhận diện mùa Hè (`01/05 - 30/09`) và mùa Đông (`01/10 - 30/04`) theo `config.workingHours`.
  - Phân loại cho từng cá nhân:
    - **Nhân viên trực:** Không tính ngoài giờ trong ca trực. Nếu ca mổ kéo dài quá `07:00` sáng hôm sau thì tính ngoài giờ từ `07:00` đến khi mổ xong (Ghi chú: **`Kíp trực`**).
    - **Nhân viên không trực:** Mọi thời điểm ngoài giờ hành chính (trưa, tối, đêm hoặc ngày nghỉ) tính là ngoài giờ (Ghi chú: **`Kíp mổ phiên`**).
  - **Tách dòng thông minh:** Nếu các bác sĩ có khoảng ngoài giờ khác nhau (ví dụ ca `06:30 - 08:00` có BS thường trú ngoài giờ `06:30 - 07:00` và BS trực ngoài giờ `07:00 - 08:00`), hệ thống tự động tách thành 2 dòng riêng biệt.
  - **Chỉ hiển thị người thực tế làm ngoài giờ:** Trên mỗi dòng, cột chức danh chỉ điền tên người làm ngoài giờ trong khoảng đó, các vị trí còn lại để trống.
  - Định dạng thời gian chuẩn: `30ph`, `55ph`, `1h`, `1h20`, `2h`.
- **Giao diện bảng 16 cột:**
  - 4 thẻ KPI tóm tắt: Tổng số lượt ngoài giờ, Tổng thời gian (font-mono màu hổ phách), Kíp mổ phiên, Kíp trực.
  - Công tắc Toggle: **Bật / Tắt Giúp việc (GV)** (lưu vào localStorage).
  - Bộ lọc tìm kiếm, lọc theo loại ghi chú, lọc theo nhân viên cụ thể.
  - Nút **Xuất Excel Ngoài giờ** khổ A4 ngang (`exportOvertimeToExcel`).

### 1.4. Bộ Lọc Theo Khoa / Phòng Trong Tab Ngoài Giờ
- Thêm dropdown chọn Khoa / Phòng linh hoạt trong toolbar.
- Tự động lọc danh sách ngoài giờ theo nhân sự thuộc khoa được chọn.
- Tự động liên kết với dropdown Nhân viên (chỉ hiển thị nhân viên thuộc khoa đó kèm số lượng ca ngoài giờ).
- Cập nhật số liệu tức thì trên 4 thẻ KPI tóm tắt và tự động gán tên khoa vào tiêu đề file Excel khi xuất báo cáo.

### 1.5. Khắc Phục Lỗi UI Bị Lộn Xộn Khi Bật / Tắt Giúp Việc (GV)
- **Gộp phiên mổ (Consolidated Session):** Trong file dữ liệu bệnh viện, một ca phẫu thuật thường gồm nhiều dòng DVKT cho cùng 1 bệnh nhân. Trước đây tính toán trên từng dòng DVKT làm phát sinh nhiều dòng trùng lặp và phân mảnh trạng thái của GV. Ta đã hợp nhất các dòng có cùng `patientId` và thời gian bắt đầu/kết thúc thành 1 phiên mổ duy nhất, gộp đầy đủ kíp mổ (kể cả GV) và nối tên kỹ thuật.
- **Cố định 3 cột nhận diện bệnh nhân (UI/UX Pro Max):**
  - Cột `STT`: `45px`, `sticky left-0`
  - Cột `Mã BN`: `85px`, `sticky left-[45px]`
  - Cột `Họ tên`: `160px`, `sticky left-[130px]` kèm hiệu ứng bóng đổ phân cách.
  - Bổ sung `<colgroup>` với kích thước cố định từng cột và đổi sang `border-separate border-spacing-0`.
  - Kết quả: Khi cuộn ngang sang phải để xem kíp mổ và GV, thông tin bệnh nhân luôn được ghim cố định ở cạnh trái, các cột không còn bị xô lệch hay biến dạng khi Bật/Tắt GV.

### 1.6. Cấu Hình Cổng Dev Server
- Chuyển cổng mặc định của Vite sang **`3002`** trong `vite.config.ts` để tránh xung đột với `kios-xm` (cổng 3000) và `claude-proxy` (cổng 3001).

---

## 📂 2. Cấu Trúc Dữ Liệu & Schema Mới

### 2.1. Cấu hình Lịch trực (`DutyScheduleDateConfig`)
```ts
export interface DutyScheduleDateConfig {
  date: string; // YYYY-MM-DD
  isHoliday: boolean; // true = ngày nghỉ, lễ, tết, thứ 7, CN; false = ngày hành chính
  onCallStaff: string[]; // Danh sách họ tên nhân viên được phân công trực 24h
  updatedAt?: number;
}
```

### 2.2. Dòng Bảng Ngoài Giờ (`OvertimeRecordRow`)
```ts
export interface OvertimeRecordRow {
  id: string;
  stt?: number;
  patientId: string;
  patientName: string;
  tenKT: string;
  ngayBD: string;
  ngayKT: string;
  ptChinh?: string;
  ptPhu?: string;
  bsGM?: string;
  ktvGM?: string;
  tdc?: string;
  gv?: string;
  timeFrom: string; // HH:mm
  timeTo: string;   // HH:mm
  durationText: string; // e.g. "30ph", "1h20", "2h"
  durationMinutes: number;
  ghiChu: 'Kíp mổ phiên' | 'Kíp trực';
  originalRecord: SurgeryRecord;
}
```

---

## 🚀 3. Trạng Thái Build & Triển Khai
- `npm run build`: Thành công 100% không lỗi (6.12s).
- Đã đồng bộ mã nguồn lên nhánh `main` trên GitHub.
- Nhánh làm việc hiện tại: `temp-08-09-2026-01h31`.
- Đã kiểm thử trực quan trên trình duyệt `http://localhost:3002/`.
