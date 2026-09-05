# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo:** 04/09/2026 23:48 (Giờ địa phương)  
> **Nhánh Git hiện tại:** `temp-04-09-2026-23h38`  
> **Commit mới nhất trên main:** `d1c54c5`  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build & Deploy:** `Thành công 100% (READY)`

---

## 📌 1. Các Yêu Cầu & Tính Năng Mới Đã Triển Khai Trong Phiên

### 1.1. Phân Tích Chi Phí & Lợi Nhuận Tại Tab "Phân Tích So Sánh" (`SpecialtyComparisonTab.tsx`)
- **Tối ưu vị trí cụm Toggle trên thanh phụ đề bảng**:
  - Gỡ bỏ nút *"Hiện số chênh"* khỏi thanh công cụ trên cùng.
  - Đặt toggle **"Hiện số chênh (± tiền / ± ca)"** nằm ngay cạnh toggle **"Số tiền rút gọn / Đầy đủ"** ở sát mép phải thanh phụ đề (ngay trên đầu bảng).
- **Slide Toggle Phân Cấp 2 Tầng**:
  - **Cấp 1 (Chỉ số tài chính)**:
    - `Viện phí`: Xanh lá đậm (`bg-emerald-600 text-white font-bold`).
    - `Chi phí`: Nổi bật màu cam đậm (`bg-amber-600 text-white font-bold`).
    - `Lợi nhuận`: Xanh dương đậm (`bg-blue-600 text-white font-bold`).
  - **Cấp 2 (Tiểu mục Chi phí)**:
    - `CP Thuốc`, `CP VTTH`, `CP Nhân công`, `Tổng CP (Thuốc + VTTH + NC)`.
    - Trạng thái được chọn hiển thị cực kỳ nổi bật với nền cam đậm (`bg-amber-600 text-white font-bold ring-1 ring-amber-700/40 shadow-sm`), phân biệt hoàn toàn so với các nút chưa chọn (nền trong suốt, chữ nâu).
- **Click Badge Định Mức CP Để Lọc Danh Sách**:
  - **Badge "XX có định mức CP"**: Click lần 1 kích hoạt lọc `WITH_COST` (chuyển sang màu xanh lục đậm kèm icon `✕`), bảng chỉ hiện các kỹ thuật đã có định mức CP. Click lần 2 hủy lọc.
  - **Badge "XX chưa có định mức CP"**: Click lần 1 kích hoạt lọc `WITHOUT_COST` (chuyển sang màu cam đậm kèm icon `✕`), bảng chỉ hiện các kỹ thuật chưa có định mức CP (có nhãn cảnh báo `Chưa có CP`). Click lần 2 hủy lọc.
- **Thuật toán ánh xạ chi phí & tính toán**:
  - **Ánh xạ chi phí**: Khớp đồng thời `maTuongDuong` (chuẩn hóa hậu tố `_GT`), `donGia`, và ngày phẫu thuật thủ thuật nằm trong khoảng thời gian hiệu lực (ưu tiên `costEffectiveFrom` – `costEffectiveTo`, fallback `dvktEffectiveFrom` – `dvktEffectiveTo`).
  - **Chi phí nhân công**: Tính theo từng ca mổ dựa trên kíp mổ thực tế (`ptChinh`, `ptPhu`, `bsGM`, `ktvGM`, `tdc`, `gv`) và `priceConfig[loaiPTTT]`, đảm bảo khớp 100% Bảng thanh toán phẫu thuật.
  - **Lợi nhuận**: `Viện phí - (CP Thuốc + CP VTTH + CP Nhân công)`.
  - Kỹ thuật chưa có định mức chi phí: hiển thị `—`, nhãn cảnh báo `Chưa có CP`, không tính vào tổng chi phí & tổng lợi nhuận toàn viện/chuyên khoa.
- **Đồng bộ Xuất Báo Cáo Excel & CSV**:
  - File Excel (Sheet Tổng hợp + Sheet Chuyên khoa) và CSV UTF-8 (BOM `\uFEFF`) tự động xuất đúng cột số liệu theo chỉ số đang chọn: Viện phí, CP Thuốc, CP VTTH, CP Nhân công, Tổng CP, hoặc Lợi nhuận.

### 1.2. Nâng Cấp Danh Mục Chi Phí PTTT (`SurgeryCostConfig.tsx`, `surgeryCostService.ts`)
- Tự động định dạng phân cách hàng nghìn bằng dấu chấm `.` cho số tiền CP Thuốc và CP VTTH.
- Tách độc lập trường thời gian hiệu lực chi phí (`costEffectiveFrom`, `costEffectiveTo`) và thời gian hiệu lực DVKT (`dvktEffectiveFrom`, `dvktEffectiveTo`).
- Loại bỏ cột tổng CP theo đúng yêu cầu người dùng.

### 1.3. Nâng Cấp Danh Mục Giá & Quét DM Thiếu (`SurgeryNamePriceConfig.tsx`)
- Quét DM thiếu: Chuyển sang hiển thị modal đề xuất duyệt trước khi thêm, không tự ý chèn dữ liệu khi chưa có sự đồng ý của người dùng.
- Rút gọn bộ lọc:
  - Combobox Hiệu lực 4 trạng thái: *Tất cả / Còn hiệu lực / Hết hiệu lực / Khoảng hiệu lực*.
  - Toggle Giá 4 trạng thái: *Tất cả / Có giá / Chưa có giá / Khoảng giá*.

---

## 📂 2. Cấu Trúc Dữ Liệu & Types Chính

### 2.1. `types.ts`
```ts
export interface SurgeryCostItem {
  id: string;
  refPriceId: string;
  maTuongDuong: string;
  tenKT: string;
  donGia: number;
  medicCost: number;
  vtthCost: number;
  dvktEffectiveFrom?: string;
  dvktEffectiveTo?: string | null;
  costEffectiveFrom: string;
  costEffectiveTo: string | null;
}

export interface RolePrice {
  'Chính': number;
  'Phụ': number;
  'Giúp việc': number;
}
```

### 2.2. `services/specialtyComparisonService.ts`
```ts
export type FinancialCategory = 'revenue' | 'cost' | 'profit';
export type CostSubtype = 'all' | 'medic' | 'vtth' | 'labor';

export interface ComparisonRow {
  // ... fields cơ bản ...
  hasCostConfig: boolean;
  currentRevenue: number;
  currentMedicCost: number;
  currentVtthCost: number;
  currentLaborCost: number;
  currentTotalCost: number;
  currentProfit: number;
  // ... tương tự cho prev và samePeriod ...
}
```

---

## 🚀 3. Trạng Thái Triển Khai & Kiểm Thử
- **TypeScript**: `npx tsc --noEmit` đạt chuẩn 100% không có lỗi type.
- **Production Build**: Vite build hoàn tất thành công trong 5.54s.
- **Browser Verification**: Đã kiểm thử trực tiếp trên trình duyệt bằng subagent, xác nhận giao diện chuyển đổi mượt mà, định dạng tiền tệ và bộ lọc hoạt động chính xác.
- **Git & Vercel**:
  - Nhánh hiện tại: `temp-04-09-2026-23h38`.
  - Đã merge vào `main` và push lên GitHub `origin/main`.
  - Vercel Production deployment: `READY` tại https://initial-surgical-data-pro.vercel.app.
