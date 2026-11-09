# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 09/11/2026 18:04 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `main` (đã đồng bộ & push lên `origin/main`)  
> **Commit mới nhất:** `e2509d6` (`fix(charts): force full data labels on short bars and sync fullscreen theme with system UI`)  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Deployment URL mới nhất:** https://initial-surgical-data-67kmk5k1t-khois-projects-73d0737a.vercel.app  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build)`  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.1. Trực Quan Hóa Biểu Đồ So Sánh Chuyên Khoa (`components/statistics/ComparisonChartsView.tsx`) — Phiên 09/11/2026 (`e2509d6`)
1. **Ép các thanh biểu diễn số liệu hiển thị đầy đủ 100% (không bị cắt `...`):**
   - **Biểu đồ Biến động Tăng trưởng (Diverging Bar)** — cả ở giao diện thẻ ngoài lẫn giao diện mở rộng toàn màn hình:
     - Loại bỏ `truncate` và `overflow-hidden` trên thanh màu; áp dụng `min-w-fit max-w-full whitespace-nowrap` (`style={{ width: `${barWidthPct}%`, minWidth: 'fit-content' }}`) để các thanh có giá trị nhỏ (như `-3 ca`, `-18 ca`, `-1,3%`) luôn tự động mở rộng đủ độ dài chứa trọn vẹn con số bên trong thay vì bị cắt thành `-...` hay `-1...`.
     - Mở rộng khung hiển thị toàn màn hình của biểu đồ từ `max-w-4xl` lên `max-w-6xl` để tăng không gian biểu diễn tỷ lệ thanh.
   - **Biểu đồ Cầu nối (Waterfall):** Bổ sung `whitespace-nowrap` cho nhãn số liệu trong từng box (`renderWaterfallTick`) để không bị ngắt dòng khi nhiều cột.
2. **Đồng bộ giao diện Toàn màn hình theo giao diện hệ thống (Sáng):**
   - Thay đổi giá trị khởi tạo `modalTheme` từ mặc định `'dark'` sang tự động lấy theo giao diện hệ thống ứng dụng (`getSystemTheme()` $\rightarrow$ mặc định `'light'`), đồng thời đồng bộ lại qua `useEffect` mỗi khi mở cửa sổ phóng to (vẫn giữ nút chuyển đổi Sáng/Tối thủ công trên thanh công cụ modal).
   - Đồng bộ màu sắc nhãn tổng (`renderStackTotalLabel`) và đường biểu đồ Xu hướng (`Timeline Expanded`) trong chế độ toàn màn hình Sáng để hiển thị sắc nét, độ tương phản cao.

---

### 1.2. Phân Tích So Sánh Phẫu Thuật Theo Chuyên Khoa (`services/specialtyComparisonService.ts`, `components/statistics/SpecialtyComparisonTab.tsx`) — Phiên 02/11/2026
1. **Gộp các phẫu thuật trùng tên (`tenKT` chuẩn hóa) giữa các kỳ bất kể chênh lệch đơn giá hoặc Mã tương đương (`347b2c1`):**
   - Chuẩn hóa khóa gộp theo `tenKT` (normalize Unicode NFC, dấu câu, khoảng trắng) trong `specialtyComparisonService.ts`, `StatsSummary.tsx`, `statisticsService.ts` và `aiQueryEngine.ts` để các ca cùng tên kỹ thuật giữa `T10/2026`, `T9/2026` và `T10/2025` luôn gộp chung trên 1 dòng duy nhất, không bị tách dòng làm lệch số tiền kỳ trước / cùng kỳ về `0 ₫`.
2. **Chế độ `Tách chi tiết giá` (`priceBreakdown` & `ComparisonPriceSubRow`) (`b3984fb`, `1dafec3`):**
   - Bổ sung mảng `priceBreakdown?: ComparisonPriceSubRow[]` trong `ComparisonRow`, nhóm theo từng mức `unitPrice` (sắp xếp đơn giá tăng dần, `0` ở cuối).
   - Bổ sung nút badge **`Tách chi tiết giá`** trên thanh công cụ bảng Phân tích so sánh. Khi bật, mặc định bung toàn bộ các dòng con dưới mỗi dịch vụ kỹ thuật (`└ 1,857,900`, `└ 1,932,200`...), cho phép đóng/mở từng dòng qua nút chevron.
3. **Hiển thị số lượng ca cạnh số tiền ở chế độ Viện phí (`2a986d7`):**
   - Bổ sung hàm `fmtMoneyWithCount` trong `SpecialtyComparisonTab.tsx` để hiển thị số ca trong ngoặc đơn bên cạnh số tiền trên giao diện ứng dụng ở các cột Kỳ phân tích, Kỳ trước và Cùng kỳ (dòng chính, dòng con tách giá và dòng tổng cộng — ví dụ: `21,25 tr (11)`, `6,45 tr (5)`).
4. **Phân tích nhân tố Số lượng & Đơn giá trong cột `Ghi chú` + Badge `Ghi chú` 3 chế độ (`f8f7cd8`, `4516f53`, `5797c1f`, `2b4cb79`):**
   - **Công thức tách nhân tố (`buildRowVarianceNote` & `buildAggregateVarianceNote`):**
     - Phần đóng góp do thay đổi Số lượng: $\Delta R_Q = \text{round}((Q_1 - Q_0) \times P_0)$
     - Phần đóng góp do thay đổi Đơn giá: $\Delta R_P = \text{round}(R_1 - R_0) - \Delta R_Q$
     - Phần trăm đóng góp của Số lượng và Giá được tính trên doanh thu kỳ gốc ($R_0$) sao cho tổng `%` của 2 yếu tố luôn khớp tuyệt đối với cột **So cùng kỳ** hoặc **So tháng trước** (ví dụ: `↑ 4 ca: +7.431.600 ₫ (+57.1%); ↑ giá (4%): +817.300 ₫ (+6.3%)` $\rightarrow$ tổng `+63.4%`).
     - Nếu số ca không thay đổi (`0 ca`), tự động ẩn phần số ca; nếu giá không thay đổi, tự động ẩn phần giá.
     - Áp dụng cho cả từng dòng dịch vụ kỹ thuật và hàng **TỔNG CỘNG TOÀN VIỆN** / **TỔNG CỘNG** chuyên khoa.
   - **Màu sắc & Định dạng (`renderNoteContent`):**
     - Tăng (`↑`) tô màu xanh lá (`text-emerald-700`), giảm (`↓`) tô màu đỏ (`text-red-600`), các con số và phần trăm được **in đậm (`font-bold`)**.
   - **Thứ tự các badge bật/tắt & 3 chế độ `Ghi chú`:**
     - Thứ tự badge: `Mã TĐ` $\rightarrow$ `$ chênh` $\rightarrow$ `$ rút gọn` $\rightarrow$ `Tách chi tiết giá` $\rightarrow$ `Ghi chú`.
     - Click vào badge `Ghi chú` chuyển tuần hoàn qua 3 chế độ:
       1. **`Ghi chú (ss cùng kỳ)`** (chấm xanh - mặc định): So sánh với cùng kỳ, tiêu đề cột hiển thị `Ghi chú (ss cùng kỳ)`.
       2. **`Ghi chú (ss tháng trước)`** (chấm xanh): So sánh với tháng trước, tiêu đề cột hiển thị `Ghi chú (ss tháng trước)`.
       3. **`Ghi chú`** (chấm đỏ): Ẩn cột Ghi chú.

---

### 1.3. Quản Lý Gói Dịch Vụ Theo Yêu Cầu (DVYC), In Ấn, Xuất Excel & Bảo Mật Đăng Nhập (`65c7a1e`, `23edd38`, `1925c79`, `b2ca931`)
1. **Chống thêm gói DVYC trùng nhau & Tự động dọn bản ghi trùng (`23edd38`):**
   - Chuẩn hóa khóa định danh ca phẫu thuật (`normalizeRecordIdentityKey`) trong `servicePackageAssignmentService.ts` và chặn gán trùng gói dịch vụ cho cùng 1 ca mổ ở cả tầng UI (`ServicePackageTab.tsx`, `ServicePaymentSubTab.tsx`) lẫn tầng service, đồng thời tự động hợp nhất/dọn các bản ghi gán trùng trước đó (khắc phục sai lệch số liệu 21 triệu vs 18 triệu).
2. **Cải tiến bộ lọc Đợt thanh toán & Nhãn lọc gói DVYC (`65c7a1e`):**
   - Đổi nhãn `"Tất cả (theo DS phẫu thuật)"` và `"Tất cả DVYC trong DS PT"` thành `"Tất cả DVYC trong tháng mm/yyyy"` (hoặc theo kỳ đang mở).
   - Bổ sung đường kẻ ngang phân cách và tiêu đề nhóm `Các đợt thanh toán:` (chữ xám đậm) phía trên danh sách các đợt trong dropdown lọc ở tab Thanh toán dịch vụ.
3. **Sửa lỗi in Giấy báo ngoài giờ & Tối ưu độ rộng cột khi in Gói dịch vụ khổ ngang (`65c7a1e`):**
   - Khắc phục chức năng in Giấy báo ngoài giờ và thu gọn cột Họ tên / căn chỉnh lại tỷ lệ các cột trong bảng in Thanh toán dịch vụ theo yêu cầu khổ ngang.
4. **Bổ sung Sheet `TT Gói DV (Rút gọn)` khi xuất Excel (`1925c79`, `b2ca931`):**
   - Thêm sheet rút gọn trong `excelExportService.ts` với mỗi gói dịch vụ gồm đúng 2 cột (`Số lượng`, `Thành tiền`) và cột `Tổng cộng` gồm 2 cột (`Số lượng`, `Tổng tiền`), căn chỉnh độ rộng cột gọn gàng vừa khít nội dung.
5. **Bắt buộc màn hình Đăng nhập duy nhất khi chưa xác thực & Giới hạn Cấu hình AI cho Admin (`1925c79`, `65c7a1e`):**
   - Khi chưa đăng nhập (`!isAuthenticated`), chỉ hiển thị duy nhất trang Đăng nhập (`LoginScreen`), không cho phép truy cập các tab tải file Minh Lộ hay DVKT.
   - Chỉ tài khoản `admin` mới được xem và chỉnh sửa tab Cấu hình AI.

---

## 📐 2. Cấu Trúc Dữ Liệu & Hàm Xử Lý Trọng Điểm

```typescript
// components/statistics/ComparisonChartsView.tsx
const getSystemTheme = (): 'dark' | 'light' => {
  if (typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'))) {
    return 'dark';
  }
  return 'light';
};
const [modalTheme, setModalTheme] = useState<'dark' | 'light'>(getSystemTheme);

// services/specialtyComparisonService.ts
export interface ComparisonPriceSubRow {
  unitPrice: number;
  maTuongDuong?: string;
  currentCount: number;
  prevCount: number;
  prevDiff: number;
  prevChangePct: number | null;
  samePeriodCount: number;
  samePeriodDiff: number | null;
  samePeriodChangePct: number | null;
  currentRevenue: number;
  prevRevenue: number;
  prevRevenueDiff: number;
  prevRevenueChangePct: number | null;
  samePeriodRevenue: number;
  samePeriodRevenueDiff: number | null;
  samePeriodRevenueChangePct: number | null;
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
}

export function buildRowVarianceNote(
  r: ComparisonRow,
  mode: 'same_period' | 'prev_period' = 'same_period',
  periodMeta?: PeriodMetadata | null
): string;

export function buildAggregateVarianceNote(
  rows: ComparisonRow[],
  hasSamePeriodData: boolean,
  mode: 'same_period' | 'prev_period' = 'same_period'
): string;
```

---

## 📂 3. Lịch Sử Commit Gần Nhất (`main`)
1. `e2509d6` — `fix(charts): force full data labels on short bars and sync fullscreen theme with system UI`
2. `b258ae3` — `docs(context): save session context snapshot 02/11/2026`
3. `2b4cb79` — `feat(comparison): add aggregate variance note in total row and 3-state Ghi chú toggle`
4. `5797c1f` — `fix(comparison): omit unchanged quantity or price segment in Ghi chú`
5. `2a986d7` — `feat(comparison): display case count next to revenue in UI period columns`
6. `4516f53` — `style(comparison): colorize increase/decrease and bold numbers in Ghi chú column`
7. `f8f7cd8` — `feat(comparison): add price/volume variance breakdown in note and Ghi chú toggle badge`
8. `1dafec3` — `chore(ui): rename detail toggle label to 'Tách chi tiết giá'`
9. `b3984fb` — `feat(statistics): add price breakdown detail toggle and expandable sub-rows in SpecialtyComparisonTab`
10. `347b2c1` — `fix(statistics): merge surgeries with identical tenKT across comparison periods regardless of donGia or maTuongDuong differences`
11. `b2ca931` — `style(export): tighten column widths to fit content in compact service package summary sheet`
12. `1925c79` — `feat(auth,export): enforce login-only screen when unauthenticated and add compact service package summary sheet to Excel export`
