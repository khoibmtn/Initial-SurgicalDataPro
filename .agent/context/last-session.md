# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian tạo/cập nhật:** 07/09/2026 21:15 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `temp-06-09-2026-22h42`  
> **Commit mới nhất trên main:** `274605e` (`fix: khoi phuc danh muc 14 ky thuat chuyen nhom, bo sung seed baseline chong mat du lieu va sao luu JSON`)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi TypeScript)`

---

## 📌 1. Tổng Hợp Tiến Độ & Các Tính Năng Đã Triển Khai

### 1.1. Phân Tích Chi Phí & Lợi Nhuận PTTT (`SpecialtyComparisonTab.tsx` & `specialtyComparisonService.ts`)
- **Cụm Toggle Điều Khiển trên Thanh Phụ Đề Bảng (Subtitle Frame)**:
  - Di chuyển các toggle xuống cùng dòng với nhãn *"So sánh tháng ... với tháng ... và cùng kỳ ..."* (sát bên phải).
  - Gồm 3 nút tương tác trực quan:
    1. **Nút `Mã TĐ`**: Bật/tắt hiển thị cột *Mã tương đương*.
    2. **Nút `$ chênh`**: Bật/tắt hiển thị cột số chênh tuyệt đối (± tiền / ± ca) để giảm tải thị giác khi cần xem nhanh.
    3. **Nút `$ rút gọn`**: Chuyển đổi linh hoạt giữa số tiền rút gọn (`triệu/tỷ`) và số tiền đầy đủ (`₫` có phân cách hàng nghìn).
- **Slide Toggle 2 Cấp Phân Tích Tài Chính**:
  - **Cấp 1 (Chế độ chính)**: `[ Viện phí | Chi phí | Lợi nhuận ]`
    - *Viện phí*: Nền xanh lá đậm (`bg-emerald-600 text-white font-bold`).
    - *Chi phí*: Nền cam đậm (`bg-amber-600 text-white font-bold`).
    - *Lợi nhuận*: Nền xanh dương đậm (`bg-blue-600 text-white font-bold`).
  - **Cấp 2 (Tiểu mục Chi phí - khi chọn Chi phí)**: `[ CP Thuốc | CP VTTH | CP Nhân công | Tổng CP ]`
    - Nút đang chọn được làm nổi bật sắc nét với nền cam đậm (`bg-amber-600 text-white font-bold ring-1 ring-amber-700/40 shadow-sm`), phân biệt tuyệt đối với các nút chưa chọn (nền trong suốt).
- **Lọc Nhanh Tương Tác Qua Click Badge Định Mức CP**:
  - **Badge `XX có định mức CP`**: Click để kích hoạt lọc `WITH_COST` (badge chuyển sang màu xanh lục đậm với icon `✕`), chỉ hiển thị các kỹ thuật đã có định mức chi phí. Click lần 2 để hủy lọc.
  - **Badge `XX chưa có định mức CP`**: Click để kích hoạt lọc `WITHOUT_COST` (badge chuyển sang màu cam đậm với icon `✕`), chỉ hiển thị các kỹ thuật chưa có định mức chi phí. Click lần 2 để hủy lọc.
  - Tương tác đồng bộ 100% với các badge *Chỉ tiêu cảnh báo* và *Chỉ tiêu tích cực*.
- **Logic Ánh Xạ & Thuật Toán Tính Toán**:
  - *Ánh xạ định mức*: So khớp theo `maTuongDuong` (xét cả hậu tố `_GT` cho gây tê/mê), `donGia`, và khoảng thời gian hiệu lực `costEffectiveFrom` đến `costEffectiveTo` (fallback sang `dvktEffectiveFrom` đến `dvktEffectiveTo`).
  - *Chi phí nhân công*: Hàm `calculateLaborCost` tính theo từng ca mổ dựa vào kíp mổ thực tế và `loaiPTTT`, tích hợp dòng thời gian độc lập (`allowanceItems` hoặc `laborConfigs`), đảm bảo khớp 100% Bảng thanh toán phẫu thuật.
  - *Lợi nhuận*: `Viện phí - (Thuốc + VTTH + Nhân công)`.
  - *Kỹ thuật chưa có định mức CP*: Hiển thị `—`, gắn badge `Chưa có CP`, loại trừ khỏi tổng chi phí và tổng lợi nhuận toàn viện để không làm sai lệch báo cáo.

### 1.2. Nâng Cấp Quản Lý Danh Mục Giá & Danh Mục Chi Phí (`SurgeryNamePriceConfig.tsx` & `SurgeryCostConfig.tsx`)
- **Rút gọn bộ lọc DM Giá**:
  - Gom các tùy chọn hiệu lực thành 1 Combobox thông minh: `Tất cả / Còn hiệu lực / Hết hiệu lực / Khoảng hiệu lực` (chỉ hiển thị 2 ô ngày từ...đến khi chọn Khoảng hiệu lực; tự động bắt định dạng hợp lệ).
  - Rút gọn lọc giá thành 1 Toggle chuyển đổi 4 trạng thái: `Tất cả / Có giá / Chưa có giá / Khoảng giá` (hiển thị ô nhập khoảng giá khi chọn Khoảng giá).
- **Sửa logic "Quét DM thiếu"**:
  - Thay vì tự ý chèn DM mới vào cơ sở dữ liệu, tính năng chuyển sang hiển thị Modal danh sách kỹ thuật thiếu đề xuất để người dùng xem xét và chủ động tick chọn/xác nhận thêm.
- **Tab Quản lý Chi phí PTTT (`SurgeryCostConfig.tsx`)**:
  - Phân cách hàng nghìn bằng dấu chấm `.` cho số tiền CP thuốc và VTTH.
  - Quản lý cột hiệu lực riêng biệt của định mức chi phí (`costEffectiveFrom`, `costEffectiveTo`), độc lập với hiệu lực của DVKT.
  - Tùy chọn phân trang: `[10, 20, 30, 50, 100]` dòng/trang (mặc định 20 dòng).
  - Tự động đồng bộ tên cột `DM Chi phí` và liên kết 2 chiều với DM giá.

### 1.3. Tab Biểu Đồ Trực Quan Hóa & Tối Ưu Biểu Đồ Thác Nước (`ComparisonChartsView.tsx`)
- **Hệ thống Sub-tabs Kép**: Chuyển đổi mượt mà giữa `Thống kê (Bảng số liệu)` và `Biểu đồ (Trực quan hóa)`.
- **Biểu đồ Thác Nước (Waterfall Chart)**:
  - Hiển thị đầy đủ tất cả kỹ thuật PTTT, tự động tính toán dynamic box width chống vỡ khung hoặc thanh cuộn ngang không mong muốn.
  - Bổ sung nút **"Ẩn box 0 ca"** (mặc định BẬT): Tự động lọc bỏ các phẫu thuật có mức chênh lệch bằng 0 (`diff === 0`) giúp biểu đồ tập trung vào biến động.
- **Tối ưu Layout Modal**:
  - Tách header modal thành bố cục 2 tầng (2-tier responsive header) chống đè chữ khi tiêu đề dài.
  - Ghim nút phóng to (Maximize / Expand) nằm bên trong card biểu đồ, không bị tràn ra ngoài viền.

### 1.4. Quản Lý Nhóm Chuyên Khoa Mới & Baseline Seed Chống Mất Dữ Liệu (`StatsConfig.tsx`, `specialtyComparisonService.ts`)
- **Inline Edit nhóm chuyên khoa tùy chỉnh**: Bổ sung nút cây bút sửa trực tiếp Tên nhóm và Tên viết tắt ngay trên dòng, hỗ trợ phím tắt `Enter` (lưu) và `Escape` (hủy).
- **Cơ chế Baseline Seed (`DEFAULT_BASE_OVERRIDES`)**: Tích hợp sẵn 14 kỹ thuật chuẩn trong mã nguồn, tự động nạp khi `localStorage` trống (chống mất dữ liệu khi đổi port hoặc mở tab ẩn danh).
- **Bộ công cụ Sao lưu & Phục hồi**:
  - 🔄 *Khôi phục 14 mục chuẩn*.
  - 📥 *Sao lưu JSON*.
  - 📤 *Nhập JSON*.
- **Realtime Event**: Phát sự kiện `sdp-specialties-changed` khi có bất kỳ thao tác thêm/sửa/xóa nhóm hoặc gán chuyên khoa.

### 1.5. Xuất File Báo Cáo Excel & CSV (`excelExportComparisonService.ts`)
- Bổ sung cột *Mã tương đương* căn giữa vào Sheet Toàn viện, Sheet Chuyên khoa và file CSV UTF-8.
- Xuất dữ liệu chính xác theo chế độ tài chính đang chọn (Viện phí / CP Thuốc / CP VTTH / CP Nhân công / Tổng CP / Lợi nhuận).

---

## 📂 2. Cấu Trúc Dữ Liệu & Schema Quan Trọng

### 2.1. Định Nghĩa Chi Phí PTTT (`types.ts`)
```ts
export interface SurgeryCostItem {
  id: string;
  refPriceId: string;            // → SurgeryNamePrice.id
  maTuongDuong: string;          // Copy từ DM giá
  tenKT: string;                 // Copy từ DM giá
  donGia: number;                // Copy từ DM giá (đơn giá DVKT VNĐ)
  medicCost: number;             // Chi phí thuốc (VNĐ, >= 0)
  vtthCost: number;              // Chi phí VTTH (VNĐ, >= 0)
  
  // Hiệu lực DVKT (đồng bộ từ DM giá)
  dvktEffectiveFrom: string;     // "2026-01-01" ISO date
  dvktEffectiveTo: string | null;// null = hiện tại

  // Hiệu lực Chi phí (do người dùng quản lý riêng)
  costEffectiveFrom: string;     // "2026-01-01" ISO date
  costEffectiveTo: string | null;// null = hiện tại

  createdAt: number;
  updatedAt: number;
}
```

### 2.2. Interface Dòng So Sánh & Chế Độ Tài Chính (`specialtyComparisonService.ts`)
```ts
export type FinancialCategory = 'revenue' | 'cost' | 'profit';
export type CostSubtype = 'all' | 'medic' | 'vtth' | 'labor';

export interface ComparisonRow {
  tenKT: string;
  maTuongDuong?: string;
  specialty: SpecialtyCode;
  specialtyName: string;
  // Số lượng (Count)
  currentCount: number;
  prevCount: number;
  prevDiff: number;
  prevChangePct: number | null;
  samePeriodCount: number;
  samePeriodDiff: number | null;
  samePeriodChangePct: number | null;
  // Viện phí (Revenue)
  currentRevenue: number;
  prevRevenue: number;
  prevRevenueDiff: number;
  prevRevenueChangePct: number | null;
  samePeriodRevenue: number;
  samePeriodRevenueDiff: number | null;
  samePeriodRevenueChangePct: number | null;

  // Chi phí & Lợi nhuận
  hasCostConfig: boolean;
  currentMedicCost: number;
  prevMedicCost: number;
  samePeriodMedicCost: number;

  currentVtthCost: number;
  prevVtthCost: number;
  samePeriodVtthCost: number;

  currentLaborCost: number;
  prevLaborCost: number;
  samePeriodLaborCost: number;

  currentTotalCost: number;
  prevTotalCost: number;
  samePeriodTotalCost: number;

  currentProfit: number;
  prevProfit: number;
  samePeriodProfit: number;

  status: ComparisonStatus;
  statusLabel: 'CẢNH BÁO' | 'TÍCH CỰC' | 'ỔN ĐỊNH';
  note: string;
}
```

### 2.3. Danh Mục Baseline Chuẩn 14 Kỹ Thuật (`DEFAULT_BASE_OVERRIDES`)
```ts
export const DEFAULT_BASE_OVERRIDES: Record<string, SpecialtyCode> = {
  "cắt bè củng giác mạc (trabeculectomy)": "mat",
  "khâu da mi đơn giản": "mat",
  "phẫu thuật lấy thể thủy tinh ngoài bao có hoặc không đặt iol": "mat",
  "phẫu thuật mộng có ghép (kết mạc rời tự thân, màng ối...) có hoặc không áp thuốc chống chuyển hóa": "mat",
  "phẫu thuật nội soi cắt ruột thừa": "ngoai_th",
  "cắt u mi cả bề dày không vá": "mat",
  "mở bao sau bằng phẫu thuật": "mat",
  "cắt u kết mạc không vá": "mat",
  "khâu kết mạc": "mat",
  "khâu giác mạc": "mat",
  "phẫu thuật quặm": "mat",
  "phẫu thuật lấy thai lần đầu [gây tê]": "phu_san",
  "phẫu thuật điều trị thoát vị thành bụng khác": "ngoai_th",
  "phẫu thuật khx gãy xương đòn": "ctch",
};
```

---

## 🚀 3. Trạng Thái Triển Khai & Môi Trường

- **Kiểm thử biên dịch**:
  - `npx tsc --noEmit`: 100% Clean, không có lỗi kiểu dữ liệu.
  - `npm run build`: Vite build thành công sạch sẽ.
- **Git Branch & Commit**:
  - Nhánh hiện tại: `temp-06-09-2026-22h42` (chứa đầy đủ các commit tính năng chi phí, waterfall và baseline seeds).
  - Main commit: `274605e` đã được merge và push lên `origin/main`.
  - Vercel Deployment: Hoạt động ổn định tại `https://initial-surgical-data-pro.vercel.app`.

---

## 💡 4. Nguyên Tắc Cốt Lõi & Hướng Dẫn Cho Phiên Kế Tiếp

1. **Quy tắc Thiết Kế & Màu Sắc (Purple Ban)**:
   - Tuyệt đối KHÔNG dùng màu tím / violet trong toàn bộ giao diện theo `GEMINI.md`.
   - Màu chủ đạo: Viện phí dùng `emerald`, Chi phí dùng `amber`, Lợi nhuận dùng `blue`, Cảnh báo dùng `rose`, Header hệ thống dùng `#003366`.
2. **Không Tự Ý Thêm Danh Mục**:
   - Mọi chức năng rà soát/quét danh mục thiếu phải hiển thị danh sách đề xuất để người dùng tick chọn duyệt, không tự động ghi dữ liệu vào DB nếu chưa có sự đồng ý.
3. **Quy Tắc Socratic Gate**:
   - Với các yêu cầu phức tạp hoặc thay đổi cấu trúc bảng tính, luôn đặt câu hỏi làm rõ các trường hợp biên (edge cases), phạm vi tác động và công thức tính trước khi code.
4. **Bảo Toàn Dữ Liệu**:
   - Luôn duy trì đồng bộ giữa Firestore, LocalStorage và hằng số Baseline Seed `DEFAULT_BASE_OVERRIDES` để đảm bảo hệ thống chạy an toàn trong mọi môi trường (đổi cổng, máy mới, tab ẩn danh).
