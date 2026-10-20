# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 20/10/2026 08:38 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-19-10-2026-14h20` (HEAD: `eb45f89`, đã push lên `origin/temp-19-10-2026-14h20`)  
> **Remote:** `origin/temp-19-10-2026-14h20` & `origin/main` (`7745c5f`) đã đồng bộ lên GitHub  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Deployment URL mới nhất:** https://initial-surgical-data-1c2d3n2oc-khois-projects-73d0737a.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build)`  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Đồng Bộ Màu Nền Xanh Than (`primary-700`) Cho Toàn Bộ Nút Hành Động Trên Ứng Dụng (20/10/2026 - Commit `eb45f89`)
- **Yêu cầu:**
  - Đổi màu nền toàn bộ các nút hành động đang có màu xanh lá cây (`emerald`, `green`, `teal`, `accent`) hoặc xanh dương tươi/đậm (`blue-600`, `sky-600`, `cyan-600`, `indigo-600`, `primary-600`) — như nút **Gói DV**, **Tải Excel**, **Xuất Word**, **Lưu**, **Thêm mới**... — thành **màu xanh than** (`bg-primary-700 hover:bg-primary-800 text-white`) đồng nhất với nút **Lấy dữ liệu**, **In** trên toàn bộ ứng dụng.
- **Giải pháp triển khai (42 tệp `.tsx`):**
  1. **Design Tokens Chuẩn (`index.css`):**
     - Sử dụng hệ màu Navy/Xanh than chuẩn của ứng dụng: `--color-primary-700: #1e5a8f` và `--color-primary-800: #0f4c81`.
     - Toàn bộ nút hành động chính, nút công cụ (toolbar buttons) và nút hành động phụ từng dùng nền xanh lá nhạt (`bg-emerald-50`, `bg-green-50`, `bg-teal-50`) được chuẩn hóa về `bg-primary-700 hover:bg-primary-800 text-white` (kèm `border-primary-800` nếu có viền).
  2. **Phạm vi 42 Component đã cập nhật:**
     - **Phẫu thuật & Gói DV (`components/surgery/` & `ServicePriceTab.tsx`):** `ActionToolbar.tsx`, `ServicePackageModal.tsx`, `PackageListView.tsx`, `PackagePaymentListModal.tsx`, `CreatePackagePaymentListModal.tsx`, `StaffReconciliationModal.tsx`, `PaymentHistoryModal.tsx`, `StatsPanel.tsx`, `MissingRecordModal.tsx`, `PrintPreviewModal.tsx`, `ServicePriceTab.tsx`.
     - **Lịch mổ (`components/scheduling/`):** `SchedulingTab.tsx`, `DayTimelineView.tsx`, `ScheduleSurgeryModal.tsx`, `OrRoomManager.tsx`, `SurgicalStaffManagerModal.tsx`.
     - **Lịch trực (`components/duty/`):** `DutyScheduleTab.tsx`, `DutyCalendarView.tsx`, `DutySwapLogModal.tsx`, `DutySubstitutionModal.tsx`, `StaffManagerModal.tsx`.
     - **Làm thêm giờ (`components/overtime/`):** `OvertimeTab.tsx`, `OvertimeListTab.tsx`, `OvertimeTable.tsx`, `AttendanceSheetTab.tsx`, `LeaveDecisionModal.tsx`, `OvertimeRulesModal.tsx`, `HolidayConfigModal.tsx`, `StaffSelectModal.tsx`.
     - **Thống kê, Cấu hình, Excel & Hệ thống:** `StatisticsTab.tsx`, `ConfigTab.tsx`, `StaffDetailModal.tsx`, `AccountManagement.tsx`, `ExcelReconciliationTab.tsx`, `ChangePasswordModal.tsx`, `LoginPage.tsx`, `ConfirmModal.tsx`, `UpdateNotification.tsx`, `ColumnFormatModal.tsx`, `TaxDeclarationModal.tsx`, `UserGuideModal.tsx`, `App.tsx`.
  3. **Bảo toàn ngữ nghĩa (Semantic UI):**
     - Giữ nguyên màu ngữ nghĩa cho các badge trạng thái (`Đã thanh toán`, `Chờ duyệt`, `Cảnh báo`), chấm tròn trạng thái (`status dots`) và thông báo Toast (`emerald`, `amber`, `rose`).

---

### 1.2. Tối Ưu Kích Thước Card Lịch Mổ, Viết Tắt Kíp Mổ & Cuộn 2 Chiều Trên Mobile (19–20/10/2026 - Commits `7964694`, `95dfc8c`)
- **Nút Toggle Viết Tắt Tên & Vị Trí Kíp Mổ (`7964694`):**
  - Bổ sung hàm viết tắt tên nhân sự (ví dụ: `Nguyễn Văn Hải` → `NV.Hải`) và nhãn vị trí viết tắt (`PTC`, `PTP`, `BSGM`, `KTV`, `TDC`, `GV`) trên card lịch mổ để tiết kiệm diện tích hiển thị.
  - Cho phép bật/tắt chế độ viết tắt linh hoạt trên thanh công cụ lịch mổ.
- **Tự Động Ôm Khít Chiều Rộng/Cao Card & Cuộn 2D Mượt Trên Mobile (`95dfc8c`):**
  - Tự động co giãn kích thước card ôm sát nội dung thực tế, loại bỏ khoảng trắng thừa bên dưới card.
  - Bật cuộn 2 chiều (`overflow-auto`, `touch-action: pan-x pan-y`) mượt mà cho bảng Timeline trên thiết bị di động.

---

### 1.3. Phân Quyền RBAC Danh Mục "Lịch Mổ" & Khóa/Mở Khóa Từng Ca Mổ (`7745c5f`)
- **Phân quyền RBAC chi tiết cho Lịch mổ:**
  - Bổ sung nhóm quyền `Lịch mổ` riêng biệt trong hệ thống phân quyền (`RolePermissions`), bao gồm quyền xem, thêm/sửa/xóa lịch mổ và quyền khóa/mở khóa ca mổ.
- **Khóa/Mở khóa từng ca mổ (`isLocked`):**
  - Cho phép người có thẩm quyền khóa từng ca mổ trên lịch để ngăn chỉnh sửa/kéo thả ngoài ý muốn; hiển thị biểu tượng ổ khóa trực quan trên card timeline và danh sách.

---

### 1.4. Kéo Thả (Drag-and-Drop) Ca Mổ Trên Timeline & Tự Động Tính Giờ Kết Thúc Theo Loại PTTT (`7a5a3a8`)
- **Kéo thả trực tiếp trên Timeline (`DayTimelineView.tsx`):**
  - Hỗ trợ kéo thả bằng chuột (Desktop) và chạm giữ (Mobile/Tablet) trên cả chế độ Timeline Ngang và Dọc, tự động xếp làn (`assignLanes`) theo thời gian thực.
- **Tự động điền giờ kết thúc theo Loại PTTT (`ScheduleSurgeryModal.tsx`, `surgeryNamePriceService.ts`):**
  - Định mức thời gian tối thiểu theo Loại PTTT (`ĐB`: 120p, `Loại 1`: 60p, `Loại 2`: 45p, `Loại 3`: 30p) và đồng bộ 373 kỹ thuật DMKT lên Firestore.

---

## 📐 2. Cấu Trúc Dữ Liệu, Design Tokens & Hàm Xử Lý Trọng Điểm

### 2.1. Quy Chuẩn Design Token Cho Nút Hành Động (`index.css`)
```css
@theme {
  /* Primary: Deep Medical Navy / Xanh than */
  --color-primary-600: #2b6cb0;
  --color-primary-700: #1e5a8f;
  --color-primary-800: #0f4c81;
  --color-primary-900: #0a355c;
}
```
- **Class chuẩn cho mọi Action Button:** `bg-primary-700 hover:bg-primary-800 text-white` (kèm `border-primary-800` khi có border).

### 2.2. ScheduledSurgery & Hiển Thị Kíp Mổ (`types/schedule.ts`)
```typescript
export interface StaffDisplayItem {
  roleKey: string;
  roleLabel: string;
  shortRoleLabel?: string;
  name: string;
  abbreviatedName?: string;
}

export const STAFF_ROLE_LABELS: Record<string, string> = {
  ptChinh: 'PT Chính',
  ptPhu: 'PT Phụ',
  bsGM: 'BS Gây mê',
  ktvGM: 'KTV Gây mê',
  tdc: 'TDC',
  gv: 'Giúp việc',
};
```

### 2.3. SurgeryNamePrice & Thời Lượng Tối Thiểu Theo Loại PTTT (`types.ts`, `services/surgeryNamePriceService.ts`)
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
```

---

## 📂 3. Lịch Sử Commit Gần Nhất (`temp-19-10-2026-14h20`)
1. `eb45f89` — `style(ui): unify action button backgrounds to navy blue (primary-700) across app` (42 files changed)
2. `95dfc8c` — `fix(schedule): auto-fit card width/height tightly and enable smooth 2D mobile scrolling`
3. `7964694` — `feat(schedule): add toggle for abbreviated staff role and name display on timeline cards`
4. `7745c5f` — `feat(rbac-schedule): add Lịch mổ permission category and per-surgery lock/unlock controls`
5. `7a5a3a8` — `feat(scheduling): add toggle to display surgical team roles and names with auto-expanding card height`

---

## 🚀 4. Trạng Thái Triển Khai & Kiểm Thử
- **Git Branch:** `temp-19-10-2026-14h20` (đã push đầy đủ lên `origin/temp-19-10-2026-14h20`).
- **Vercel Production:** Đã deploy thành công lên `https://initial-surgical-data-pro.vercel.app`.
- **Build Verification:** `npm run build` (`vite v6.4.1`) hoàn tất 100% không có lỗi.
