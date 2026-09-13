# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 13/09/2026 13:05 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `version2` (remote: `origin/version2`)  
> **Commit mới nhất:** `0ffef58` (`feat(analytics): refactor OR analytics to hospital-wide capacity and peak concurrency model`)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server đang chạy nền)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi TypeScript)`  
> **Trạng thái Test:** `250 / 250 tests PASS` (17 test suites)  
> **Tài liệu Kế hoạch:** [implementation_plan.md](file:///Users/buiminhkhoi/.gemini/antigravity-ide/brain/f443151a-e45d-4851-a746-575eac49efce/implementation_plan.md) & [walkthrough.md](file:///Users/buiminhkhoi/.gemini/antigravity-ide/brain/f443151a-e45d-4851-a746-575eac49efce/walkthrough.md)

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành Trong Phiên

### 1.1. Loại Bỏ Mật Khẩu Thủ Công `123456` / `isLocked` Thừa Thãi
- **Đánh giá an ninh**: Kiểm tra toàn diện hệ thống phân quyền RBAC đa cấp (Admin viện, Trưởng khoa, Bác sĩ/KTV).
- **Kết luận**: Tính năng khóa bằng mật khẩu cứng `123456` đã hoàn toàn lỗi thời và gây phiền hà cho người dùng vì đã được bao phủ chặt chẽ bởi:
  - RBAC đa cấp + Phân quyền chức năng theo vai trò.
  - Trần quyền Trưởng khoa (Permission Ceiling).
  - Khóa báo cáo tháng / ngày có xác thực tài khoản (`report_locks`).
  - Khóa danh mục giá và hiệu lực danh mục (`catalog_locks`).
- **Thực hiện**: Đã tháo bỏ modal mở khóa thủ công và các cờ `isLocked` dư thừa, trả lại trải nghiệm người dùng hiện đại, an toàn và liền mạch.

---

### 1.2. Khóa Chỉnh Sửa Ca Mổ Theo Thời Gian Thực (Collaborative Record Lock - Mục 3.3.2)
- **Mục tiêu**: Ngăn chặn tình trạng 2 bác sĩ/điều dưỡng mở sửa đồng thời một ca mổ dẫn đến ghi đè dữ liệu.
- **Kiến trúc & Cơ chế hoạt động (`services/recordLockService.ts`)**:
  - Dùng Firebase Realtime Database tại nhánh `record_editing_locks/{recordKey}`.
  - Khóa sinh tự động theo định danh lâm sàng: `patientId + '_' + ngayBD + '_' + tenKT`.
  - **Heartbeat 20 giây** + **Timeout 2 phút**: Tự động thu hồi khóa nếu trình duyệt bị tắt đột ngột hoặc mất mạng, kết hợp `onDisconnect().remove()` của Firebase.
- **Trải nghiệm bảng dữ liệu (`components/common/DynamicTable.tsx`)**:
  - Hàng ca mổ đang có người sửa được đánh dấu viền sáng màu hổ phách (`ring-amber-300`).
  - Cột STT có chấm màu cam nhấp nháy (`animate-pulse`) kèm tooltip hiển thị tên và khoa của bác sĩ đang giữ khóa.
- **Trải nghiệm Modal chỉnh sửa (`components/surgery/SurgeryEditModal.tsx`)**:
  - Nếu ca mổ đang bị khóa bởi tài khoản khác: Modal tự động bật banner cảnh báo, gắn badge *"Đang sửa: [Tên Bác sĩ]"*, chuyển modal sang chế độ **Chỉ xem (Read-only)** và vô hiệu hóa nút Lưu để bảo vệ toàn vẹn dữ liệu.
- **Kiểm thử**: `__tests__/recordEditingLock.test.ts` (10/10 tests PASS).

---

### 1.3. Bảng Điều Khiển KPI Quản Trị Khối Phòng Mổ Cấp Bệnh Viện (OR Analytics Dashboard - Mục 3.2)
- **Vị trí tích hợp**: Trang `StatisticsTab.tsx` bổ sung subtab **"Quản trị phòng mổ"** (Icon `Gauge`).
- **Bộ chọn Nguồn số liệu Độc lập (Isolated Data Source Selector)**:
  - Cho phép người dùng chuyển đổi linh hoạt giữa: **Tự động** (Ưu tiên BC tháng, fallback BC ngày), **BC Tháng**, **BC Ngày**.
  - Bộ chọn và bộ lọc kỳ này được **cách ly cục bộ hoàn toàn**, không làm ảnh hưởng đến các subtab khác trong trang Thống kê.

#### 🏥 Điều chỉnh Chuẩn Thực Tế Lâm Sàng (Macro Capacity & Peak Concurrency)
- **Phát hiện nghiệp vụ từ người dùng**:
  - File Excel trích xuất từ phần mềm HIS của bệnh viện **hoàn toàn không có trường Bàn mổ / Phòng mổ vật lý**.
  - Cột mã máy `machineCode` thực chất chỉ là mã thiết bị y tế (như C-Arm, dàn máy nội soi Karl Storz...) dùng chung cho nhiều bàn mổ khác nhau.
  - Do đó, việc gom nhóm theo mã máy và tính Turnaround Time (TAT) theo máy là **sai lệch chuyên môn**.
- **Giải pháp chuyển đổi mô hình Quản trị Năng lực & Phụ tải khối phòng mổ toàn viện**:
  1. **Cấu hình Quy mô Bàn mổ**: Bổ sung cấu hình **"Tổng số bàn mổ hoạt động của viện"** ($N$ bàn, mặc định 6) trong tab *Cấu hình thống kê > Chỉ số KPI phòng mổ* (`KpiSettingsConfig.tsx`).
  2. **Công suất Khối phòng mổ toàn viện (OR Capacity Utilization)**:
     - Tính tổng thời gian khả dụng theo công thức: $N \text{ bàn} \times \text{Số ngày làm việc} \times \text{Số giờ chuẩn/ngày} \times 60 \text{ phút}$.
     - Tính tỷ lệ sử dụng công suất thực tế so với định mức khả dụng.
  3. **Thuật toán Sweep Line quét Đỉnh điểm Đồng thời (Peak Concurrency & Over-capacity Detection)**:
     - Tự động quét giao thoa thời gian (`ngayBD` $\rightarrow$ `ngayKT`) của từng ca mổ.
     - Sắp xếp sự kiện mốc thời gian: tại cùng thời điểm, ca mổ kết thúc (`-1`) ưu tiên xử lý trước ca bắt đầu (`+1`) để không cộng dồn thời điểm chuyển tiếp.
     - Xác định chính xác **Số bàn mổ chạy đồng thời đỉnh điểm** toàn kỳ và theo từng ngày; phát hiện ngày bị vượt định mức ($> N$ bàn).
  4. **Phân bố Phụ tải Phẫu thuật theo 24 Khung giờ (Hourly Load Distribution)**:
     - Chia nhỏ và tích lũy phút mổ của các ca vào từng khung giờ (0h..23h).
     - Biểu đồ cột 24 khung giờ giúp ban giám đốc nhận diện ngay khung giờ cao điểm (Peak Hours: 8h–11h, 14h–16h) và ca trực đêm ngoài giờ.
  5. **Năng suất Phẫu thuật viên & Top kỹ thuật**:
     - Thống kê chi tiết từng PTV: số ca, tổng phút mổ, thời gian TB/ca, ca ngoài giờ, ca cấp cứu, doanh thu, top kỹ thuật.
     - Top kỹ thuật phẫu thuật thực hiện nhiều nhất.
  6. **Cảnh báo Bất thường Lâm sàng**:
     - Phát hiện ca mổ siêu ngắn (<15 phút), siêu dài (>8 giờ), thời gian âm, và ca mổ vượt trần chi phí vật tư dự kiến.
  7. **Xuất Báo cáo Excel 6 Sheets (`exportOrAnalyticsToExcel`)**:
     - Gồm: *Tổng quan Năng lực OR, Phụ tải 24h, Phụ tải theo ngày, Phẫu thuật viên, Top kỹ thuật, Cảnh báo bất thường*.
- **Kiểm thử**: `__tests__/orAnalytics.test.ts` (7/7 tests PASS).

---

## 📐 2. Cấu Trúc Dữ Liệu & Schema Trọng Điểm

### 2.1. KPI Types (`types/kpi.ts`)
```typescript
export interface KpiConfig {
  totalOperatingRooms: number;        // Tổng số bàn mổ hoạt động của viện (mặc định 6)
  standardHoursPerDay: number;        // Giờ mổ chuẩn/ngày (mặc định 8h)
  operatingDaysPerMonth: number;      // Ngày làm việc chuẩn/tháng (mặc định 22)
  minOutlierMinutes: number;          // Ngưỡng ca siêu ngắn (15p)
  maxOutlierMinutes: number;          // Ngưỡng ca kéo dài bất thường (480p = 8h)
  costOverrunThresholdAmount: number; // Ngưỡng chi phí báo động (50,000,000 đ)
}

export interface HospitalCapacityMetric {
  totalOperatingRooms: number;
  standardHoursPerDay: number;
  operatingDays: number;
  totalAvailableMinutes: number;
  actualOperatingMinutes: number;
  utilizationRate: number;            // %
  status: 'low' | 'optimal' | 'high' | 'overloaded';
  peakConcurrentSurgeries: number;    // Đỉnh điểm số ca chạy đồng thời
  peakDate?: string;
  peakTime?: string;
}

export interface HourlyLoadMetric {
  hour: number;                       // 0..23
  hourLabel: string;                  // "08:00 - 09:00"
  activeSurgeries: number;
  operatingMinutes: number;
  maxConcurrentTables: number;
  isPeak: boolean;
  inHours: boolean;
}

export interface DailyPeakMetric {
  date: string;                       // YYYY-MM-DD
  dayOfWeek: string;                  // Thứ Hai, Thứ Ba...
  totalCases: number;
  totalMinutes: number;
  peakConcurrentTables: number;       // Đỉnh điểm số ca mổ song song trong ngày
  peakTime: string;                   // Thời điểm đạt đỉnh (VD: "10:15")
  isOverCapacity: boolean;            // True nếu peak > totalOperatingRooms
}
```

### 2.2. Collaborative Lock Schema (`types/index.ts` / `services/recordLockService.ts`)
- RTDB Path: `record_editing_locks/{recordKey}`
```typescript
export interface RecordEditingLock {
  recordKey: string;
  lockedByUid: string;
  lockedByName: string;
  lockedByDepartment?: string;
  lockedAt: number;      // Epoch ms
  lastHeartbeat: number; // Heartbeat mỗi 20s
}
```

---

## 🚀 3. Trạng Thái Git & Kiểm Thử

- **Nhánh hiện tại**: `version2`
- **Tình trạng git**: Sạch sẽ, đã đồng bộ hoàn toàn với remote `origin/version2`.
- **Lịch sử commit gần nhất**:
  - `0ffef58`: `feat(analytics): refactor OR analytics to hospital-wide capacity and peak concurrency model`
  - `544faf5`: `fix(ui): destructure pendingApprovalCount in Sidebar and export AppConfig/SurgeryConfig`
  - `f1b9cb1`: `feat(analytics): add OR Analytics KPI dashboard and real-time collaborative record lock`
- **Kết quả Kiểm thử**:
  - `npx vitest run`: **17 test suites, 250 / 250 tests PASS (100%)**
  - `npm run build`: Thành công trong 6.39 giây, không có cảnh báo TypeScript nào.
  - **Quy tắc thiết kế**: Tuân thủ tuyệt đối **Purple Ban** (sử dụng tông blue, indigo, emerald, amber, slate, rose).

---

## 🎯 4. Các Bước Kế Tiếp Được Đề Xuất

1. **Sẵn sàng Merge vào `main`**:
   - Khi bạn yêu cầu, toàn bộ các tính năng hoàn chỉnh của `version2` (Khóa bản ghi realtime, KPI Năng lực khối phòng mổ toàn viện, Phụ tải 24 khung giờ, Sweep Line Concurrency) có thể được merge vào nhánh `main` để deploy tự động lên Vercel.
2. **Mục 3.1 trong Roadmap**:
   - Triển khai **Mẫu in quyết toán phụ cấp C73/C74 chuẩn Bộ Y Tế & BHXH** (tự động kết xuất bảng kê chi trả phẫu thuật - thủ thuật phục vụ phòng Kế toán - Tài chính).
