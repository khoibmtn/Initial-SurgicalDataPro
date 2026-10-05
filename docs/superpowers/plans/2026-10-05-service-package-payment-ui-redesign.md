# Implementation Plan - Redesign Giao diện Quản lý Đợt Thanh toán Gói Dịch Vụ & Tra cứu Ra Viện BQ

## Mục tiêu
Thiết kế lại giao diện tab **Gói DV** thành một trung tâm điều hành duy nhất (Single Unified Table View), đáp ứng toàn bộ nghiệp vụ thực tế của người dùng:
1. Quan sát và lọc trực quan các ca: Đã ra viện (BQ) vs Chưa ra viện (BQ).
2. Lọc các ca Chưa chốt / Đã chốt / Chưa thanh toán gói DV (thay nhãn `Chưa thanh toán` thành `Chưa thanh toán gói DV`).
3. Toàn bộ thao tác quản lý đợt thanh toán (Tạo đợt mới, Đổi tên, Xóa đợt, Chốt / Mở khóa, Nhập danh sách từ TCKT) được đưa lên thanh công cụ phía trên bảng, không cần phụ thuộc vào modal chật chội.
4. Tự động nhận diện tiêu đề Khoa (như "Ngoại tổng hợp", "Sản"...) khi import danh sách TCKT theo ảnh thực tế.
5. Cột bảng hiển thị rõ ràng: Cột **Ra viện (BQ)** và Cột **Thanh toán gói DV**.

---

## Chi tiết các bước thực hiện

### Bước 1: Nâng cấp Parser nhận diện tiêu đề Khoa & Type dữ liệu
- **File**: `types/paymentList.ts`, `services/paymentListParser.ts`, `__tests__/paymentListParser.test.ts`
- **Nghiệp vụ**:
  - Thêm `department?: string` vào `ParsedEntry`, `PaymentListItem`, `ReconciledItem`.
  - Trong `paymentListParser.ts`, khi duyệt các dòng: nếu dòng là tiêu đề (không bắt đầu bằng số, độ dài 3-60 ký tự, không chứa từ khóa lọc) -> gán làm `currentDepartment` cho các dòng bệnh nhân tiếp theo.
  - Viết unit test kiểm tra parser nhận diện chính xác cấu trúc mẫu từ TCKT như trong ảnh.

### Bước 2: Nâng cấp `PaymentListManagerModal` thành Modal Import/Thao tác Tinh gọn
- **File**: `components/surgery/PaymentListImportModal.tsx`
- **Nghiệp vụ**:
  - Modal chuyên dụng cho việc [➕ Tạo đợt mới] hoặc [📥 Nhập danh sách từ TCKT].
  - Cho phép dán văn bản hoặc tải file Excel, hiển thị preview phân nhóm theo Khoa (nếu có), đối soát số ca hợp lệ / không tìm thấy / lệch họ tên / xung đột với đợt khác.
  - Hỗ trợ đổi tên đợt trực tiếp trên thanh công cụ.

### Bước 3: Tái cấu trúc Thanh công cụ & Bảng dữ liệu trong `PackageListView.tsx`
- **File**: `components/surgery/PackageListView.tsx`
- **Nghiệp vụ**:
  1. **Thanh quản lý đợt (Hàng 1)**:
     - Dropdown chọn Đợt: `Tất cả ca gán gói (Toàn viện)` | `<Từng đợt 🔒 / 📝>`.
     - Nhóm nút thao tác theo ngữ cảnh:
       - `[➕ Tạo đợt mới]` -> mở modal nhập đợt mới.
       - Khi đang chọn đợt nháp: `[📥 Nhập thêm TCKT]`, `[✏️ Đổi tên]`, `[🔒 Chốt đợt]`, `[🗑️ Xóa đợt]`.
       - Khi đang chọn đợt đã chốt: `[🔓 Mở khóa]` (Admin/Trưởng khoa).
  2. **Thanh lọc nhanh 1-chạm (Hàng 2)**:
     - Nút pills:
       - `[ Tất cả ]`
       - `[ Chưa thanh toán gói DV ]` (ca đã gán gói nhưng chưa chốt trong đợt nào)
       - `[ Đã ra viện (BQ) ]` (có ngày ra viện trong BHYT)
       - `[ Chưa ra viện (BQ) ]` (chưa có ngày ra viện)
       - `[ Chưa chốt ]` (chưa vào đợt nào hoặc đang ở đợt nháp)
     - Bộ lọc cơ bản: `[ Đã gán ]` / `[ Chưa gán ]`.
     - Box tìm kiếm theo từ khóa (Mã KCB, tên BN, kíp mổ, tên PT, tên khoa).
  3. **Cột bảng dữ liệu**:
     - Cột **Ra viện (BQ)**: Badge xanh lá `✅ DD/MM/YYYY` kèm tháng quyết toán, hoặc `⏳ Chưa có ngày ra`.
     - Cột **Thanh toán gói DV**: Badge `🔒 [Tên đợt]` (đã chốt), `📝 Nháp: [Tên đợt]`, hoặc `Chưa thanh toán gói DV`.
  4. **Thao tác dòng**:
     - Thêm ca vào đợt đang chọn / Chuyển ca sang đợt khác / Loại khỏi đợt.

### Bước 4: Kiểm thử tự động & Xác minh Build
- Chạy toàn bộ `vitest run` và kiểm tra `tsc --noEmit`.
- Xác minh không phát sinh lỗi và giao diện đáp ứng đầy đủ.
