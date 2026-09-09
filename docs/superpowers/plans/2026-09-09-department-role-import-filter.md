# Bộ Lọc Khoa Phòng & Vị Trí Kíp Mổ Khi Import Báo Cáo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm thuộc tính bật/tắt "Lấy vào báo cáo" cho từng khoa/phòng, frame cấu hình bật/tắt 5 vị trí kíp mổ (`PT Chính`, `PT Phụ`, `BS GM`, `KTV GM`, `TDC`), và tích hợp cơ chế lọc tự động khi import file Excel từ Minh Lộ ở cả Báo cáo hàng ngày và Báo cáo tháng kèm báo cáo bóc tách chi tiết các ca không hợp lệ.

**Architecture:** Mở rộng schema `AppConfig` trong `ConfigContext.tsx` để lưu trạng thái `includeInReport` của từng khoa và cấu hình 5 vị trí kíp mổ `reportRoleFilters` đồng bộ Realtime Database. Cập nhật giao diện `ConfigurationTab.tsx` với cột switch toggle trực quan và frame điều khiển bên dưới. Viết module lọc trung tâm trong `excelProcessor.ts` đối soát từng ca mổ với danh mục nhân sự và khoa phòng theo logic OR, thống kê bóc tách (nhân viên không có trong danh mục vs nhân viên chưa phân khoa) và phản hồi thông báo rõ ràng trên `App.tsx`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Firebase Realtime Database.

---

## Danh sách tệp can thiệp

1. [`types.ts`](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/types.ts): Mở rộng interface `ProcessingResult` thêm trường `filterSummary` để lưu thống kê bóc tách các ca bị loại bỏ.
2. [`contexts/ConfigContext.tsx`](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/contexts/ConfigContext.tsx): Bổ sung `includeInReport?: boolean` vào `DepartmentDetail`, định nghĩa type `RoleFilterConfig`, mở rộng `AppConfig` với `reportRoleFilters`.
3. [`components/ConfigurationTab.tsx`](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/ConfigurationTab.tsx):
   - Thêm cột "Lấy vào báo cáo" với toggle switch (Xanh lá khi Bật, Xám khi Tắt) ngay sau cột "Tên đầy đủ".
   - Thêm Frame tùy chọn bên dưới bảng: Cấu hình bật/tắt cho 5 vị trí (`PT Chính`, `PT Phụ`, `BS GM`, `KTV GM`, `TDC`).
4. [`services/excelProcessor.ts`](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/services/excelProcessor.ts): Cập nhật hàm `processSurgicalFiles` thực hiện lọc các bản ghi ca mổ theo cấu hình khoa phòng và vai trò kíp mổ, bóc tách các trường hợp lỗi.
5. [`App.tsx`](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/App.tsx): Hiển thị thông báo toast chi tiết kết quả lọc khi import file Excel ở cả Báo cáo hàng ngày và Báo cáo tháng.

---

## Kế hoạch nhiệm vụ chi tiết (Bite-Sized Tasks)

### Task 1: Cập nhật Schema và Types cấu hình
**Files:**
- Modify: `types.ts`
- Modify: `contexts/ConfigContext.tsx`

- [ ] **Step 1.1:** Mở rộng `DepartmentDetail` trong `contexts/ConfigContext.tsx` với `includeInReport?: boolean`.
- [ ] **Step 1.2:** Định nghĩa interface `RoleFilterConfig` gồm 5 vị trí:
  ```typescript
  export interface RoleFilterConfig {
    ptChinh: boolean; // PT Chính
    ptPhu: boolean;   // PT Phụ
    bsGM: boolean;    // BS GM
    ktvGM: boolean;   // KTV GM
    tdc: boolean;     // TDC
  }
  ```
- [ ] **Step 1.3:** Bổ sung `reportRoleFilters?: RoleFilterConfig` vào `AppConfig` với giá trị mặc định ban đầu là tất cả đều `true`.
- [ ] **Step 1.4:** Mở rộng `ProcessingResult` trong `types.ts` thêm `filterSummary`:
  ```typescript
  export interface ImportFilterSummary {
    totalInFile: number;
    importedCount: number;
    excludedCount: number;
    missingStaffCount: number;      // Số ca có NV đối soát không có trong DM
    unassignedStaffCount: number;   // Số ca có NV đối soát có tên nhưng chưa xếp khoa
    unmatchedDeptCount: number;     // Số ca có NV thuộc khoa không được chọn
  }
  ```
- [ ] **Step 1.5:** Kiểm tra `npm run build` đảm bảo types tương thích hoàn toàn.

---

### Task 2: Cập nhật giao diện Quản lý Khoa phòng trong `ConfigurationTab.tsx`
**Files:**
- Modify: `components/ConfigurationTab.tsx`

- [ ] **Step 2.1:** Thêm cột **"Lấy vào báo cáo"** vào `thead` của bảng Danh mục Khoa, phòng (nằm sau cột *Tên đầy đủ*, trước cột *Thứ tự*).
- [ ] **Step 2.2:** Trong mỗi dòng của bảng (`tbody`), render một toggle switch:
  - Trạng thái: `deptDetail?.includeInReport ?? true` (Mặc định là Bật/True nếu chưa thiết lập).
  - Giao diện: Khi BẬT hiển thị màu xanh lá (`bg-emerald-500` hoặc `bg-emerald-600`), nút gạt tròn trượt sang phải. Khi TẮT hiển thị màu xám (`bg-gray-300`), nút gạt tròn trượt sang trái.
  - Sự kiện click: Cập nhật `config.departmentDetails` qua `updateConfig`.
- [ ] **Step 2.3:** Thêm Frame tùy chọn bên dưới bảng Danh mục Khoa, phòng:
  - Header: Icon `Sliders` / `Users`, Tiêu đề *"Cấu hình vị trí kíp mổ lấy vào báo cáo"*.
  - Chú thích giải thích logic lọc: *"Khi nạp báo cáo từ Minh Lộ, hệ thống sẽ kiểm tra các vị trí được bật dưới đây. Ca mổ sẽ được import nếu có ít nhất 1 nhân sự thuộc khoa phòng được chọn 'Lấy vào báo cáo'."*
  - Danh sách 5 card/toggle cho 5 vị trí:
    1. **PT Chính**
    2. **PT Phụ**
    3. **BS GM**
    4. **KTV GM**
    5. **TDC**
  - Mỗi vị trí có toggle switch on/off (Xanh lá khi On, Xám khi Off), click tự động lưu vào `config.reportRoleFilters`.
- [ ] **Step 2.4:** Kiểm tra trực quan giao diện bảng và frame mới.

---

### Task 3: Xây dựng Logic Lọc Ca Mổ theo Khoa & Vai Trò trong `excelProcessor.ts`
**Files:**
- Modify: `services/excelProcessor.ts`

- [ ] **Step 3.1:** Viết hàm helper `filterSurgicalRecordsByDepartment(records, config)`:
  - Xác định danh sách khoa được phép lấy vào báo cáo:
    ```typescript
    const allowedDepts = new Set(
      (config.departments || []).filter(dept => (config.departmentDetails?.[dept]?.includeInReport ?? true))
    );
    ```
  - Xác định 5 vị trí được bật:
    ```typescript
    const roleFilters: RoleFilterConfig = config.reportRoleFilters || {
      ptChinh: true, ptPhu: true, bsGM: true, ktvGM: true, tdc: true
    };
    ```
  - Xử lý trường hợp "Tắt hết":
    - Nếu `allowedDepts.size === 0` hoặc không có vị trí nào được bật:
      -> Toàn bộ ca mổ bị loại bỏ (0 imported). Trả về cảnh báo: *"Không có khoa phòng hoặc vị trí nào được bật 'Lấy vào báo cáo'. Toàn bộ ca mổ đã bị bỏ qua."*
- [ ] **Step 3.2:** Đối soát từng ca mổ:
  - Khởi tạo `staffMap` từ `config.staffList` (tra cứu theo tên đã chuẩn hóa).
  - Với mỗi bản ghi, duyệt qua các vị trí đang được BẬT (`ptChinh`, `ptPhu`, `bsGM`, `ktvGM`, `tdc`):
    - Lấy tên nhân sự trong ô tương ứng.
    - Tìm kiếm trong `staffMap`:
      - Nếu tìm thấy và `staff.department` nằm trong `allowedDepts` -> **HỢP LỆ (Match = true)**.
    - Ghi nhận trạng thái đối soát:
      - Nhân viên không có trong danh mục (`missingStaff`).
      - Nhân viên có trong danh mục nhưng `!staff.department` (`unassignedStaff`).
  - Nếu bản ghi có ít nhất 1 vị trí thỏa mãn `allowedDepts` -> **Được đưa vào danh sách import**.
  - Nếu không có vị trí nào thỏa mãn -> **Loại bỏ khỏi import**, cộng dồn vào thống kê bóc tách tương ứng.
- [ ] **Step 3.3:** Tích hợp hàm lọc vào `processSurgicalFiles` trước khi đưa vào `reprocessSurgicalRecords`.
- [ ] **Step 3.4:** Gán `filterSummary` vào kết quả `ProcessingResult`.

---

### Task 4: Tích hợp Thông báo và Cảnh báo Chi tiết trong `App.tsx`
**Files:**
- Modify: `App.tsx`

- [ ] **Step 4.1:** Cập nhật hàm `handleProcess` trong `App.tsx`:
  - Sau khi `processSurgicalFiles` xử lý xong:
    - Nếu `res.filterSummary && res.filterSummary.excludedCount > 0`:
      - Tạo thông báo chi tiết:
        > `Đã import ${res.filterSummary.importedCount} ca mổ. Đã loại bỏ ${res.filterSummary.excludedCount} ca không thuộc khoa/vị trí cấu hình (${res.filterSummary.missingStaffCount} ca nhân sự không có trong DM, ${res.filterSummary.unassignedStaffCount} ca nhân sự chưa xếp khoa).`
      - Hiển thị toast dạng cảnh báo `warning` (hoặc `info`) trong 8-10 giây để người dùng dễ theo dõi.
    - Nếu `res.validRecords.length === 0`:
      - Hiển thị toast lỗi `error`:
        > `Không có ca mổ nào được nạp! (${res.filterSummary?.excludedCount || 0} ca bị loại bỏ do không thỏa mãn cấu hình khoa phòng/vị trí lấy vào báo cáo).`
    - Nếu tất cả các ca mổ đều thỏa mãn (`excludedCount === 0`):
      - Thông báo thành công bình thường.

---

### Task 5: Kiểm thử và Xác minh Thực tế (Verification)
**Files:**
- Verification only

- [ ] **Step 5.1:** Chạy `npm run build` kiểm tra toàn bộ TypeScript và đóng gói Vite.
- [ ] **Step 5.2:** Kiểm thử giao diện trong `ConfigurationTab`:
  - Vào tab *Cấu hình* -> *Hành chính* -> *DM Khoa, phòng*.
  - Kiểm tra hiển thị cột "Lấy vào báo cáo" và các switch toggle.
  - Bật/tắt thử một khoa (ví dụ tắt Ngoại TH) -> kiểm tra trạng thái lưu trữ.
  - Kiểm tra frame "Cấu hình vị trí kíp mổ lấy vào báo cáo" bên dưới bảng. Bật/tắt thử các vị trí.
- [ ] **Step 5.3:** Kiểm thử Import File Excel:
  - Test trường hợp 1: Mặc định tất cả bật -> Import nạp đầy đủ các ca mổ.
  - Test trường hợp 2: Chỉ bật 1 khoa (VD: Ngoại TH) và chỉ bật `PT Chính` -> Import chỉ nạp các ca có BS Ngoại TH làm PT chính; các ca khác bị loại bỏ kèm toast bóc tách số ca không có trong danh mục hoặc chưa xếp khoa.
  - Test trường hợp 3: Tắt toàn bộ khoa -> Import chặn toàn bộ và thông báo rõ ràng.
- [ ] **Step 5.4:** Tạo walkthrough tài liệu hóa kết quả hoàn thành.
