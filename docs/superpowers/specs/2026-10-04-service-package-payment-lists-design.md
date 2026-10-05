# Danh sách thanh toán Gói dịch vụ (đối soát với phòng TCKT) — Thiết kế

Ngày: 2026-10-04 · Trạng thái: chờ duyệt spec

## 1. Mục tiêu

Hàng tháng phòng TCKT gửi danh sách ca phẫu thuật có gói dịch vụ đã thanh toán ra viện
(mẫu: `mã KCB-HỌ TÊN`, nhóm theo khoa). Khoa dùng danh sách này để tổng hợp tiền từng nhân viên.
Tính năng giúp: import danh sách, đối soát với DS phẫu thuật và gói đã gán, quản lý danh sách theo
đợt thanh toán, chốt khi TCKT đã chi, và theo dõi ca đã gán gói mà chưa được thanh toán.

## 2. Phạm vi

- **Chỉ có ở BC tháng** (`currentType === 'monthly'`). Không hiển thị ở BC hàng ngày.
- **MVP**: import + đối soát + quản lý danh sách + chốt/mở khóa + theo dõi "đã gán gói, chưa thanh toán".
- **Ngoài MVP**: mẫu in / file Excel theo cấu trúc TCKT (bảng "Chi tiền dịch vụ chọn bác sĩ" và bảng
  Số thu/Nộp thuế/Trích 16%/Chi cho khoa); tích hợp BigQuery (cpbq-react) để biết ca đã ra viện.

## 3. Quy tắc nghiệp vụ

1. Khóa khớp: **mã KCB** (`patientId`). Họ tên chỉ dùng để cảnh báo lệch.
2. Mỗi bệnh nhân tối đa 1 gói, gắn cho ca chính (kể cả nhiều ca/ngày).
3. **Một ca đã gán gói chỉ được thanh toán 1 lần** ⇒ chỉ xuất hiện ở **đúng 1** danh sách.
   - Import/thêm ca đã nằm ở danh sách khác ⇒ chặn, báo "đã nằm ở danh sách X", đề nghị **Chuyển**.
   - Có chức năng **Chuyển ca** sang danh sách khác (cả danh sách đích phải đang mở) và **Xóa khỏi danh sách**.
4. Ca có trong dữ liệu phẫu thuật nhưng chưa gán gói ⇒ nằm trong **hàng chờ gắn gói của chính danh sách đó**.
   Với ca trong hàng chờ, user chọn một trong ba: **Gán gói** (chuyển thành `assigned`), **Loại khỏi danh sách**
   (ca thực tế không đăng ký gói / chưa ra viện), hoặc **Xóa gán** nếu ca đã có gói nhưng gán nhầm.
5. Ca không có trong dữ liệu phẫu thuật ⇒ `notFound`, vẫn lưu trong danh sách (user quyết định giữ/xóa).
   **Phạm vi tra cứu không giới hạn ở tháng đang xem**: ca mổ 30/8 có thể thanh toán 2/9 và nằm trong danh sách tháng 9.
   Vì vậy đối soát tra theo mã KCB trên (a) các gói đã gán (Firestore, mọi tháng) và (b) dữ liệu phẫu thuật đã lưu của
   các tháng khác, không chỉ trên báo cáo đang mở.
   **Lệch họ tên** (`nameMismatch`): hiển thị cảnh báo, ca ở trạng thái "cần làm rõ" cho tới khi user xác nhận
   (giữ / sửa tên / loại); danh sách chưa chốt được khi còn ca cần làm rõ.
6. **Chốt = khóa danh sách** (đã thanh toán): không thêm/bớt/sửa/chuyển/xóa. Chỉ **admin / trưởng khoa**
   được chốt và **mở khóa** để sửa. Tái sử dụng cơ chế quyền hiện có của khóa BC tháng (`canManageLock`).
7. Danh sách TCKT không hoàn toàn đáng tin (có thể thiếu/thừa) ⇒ app chỉ **đề xuất**; user luôn sửa tay được.

## 4. Mô hình dữ liệu (Firestore)

Collection `payment_lists`, **mỗi danh sách là 1 document** (số ca nhỏ; mọi thay đổi dùng transaction):
- `name` (vd "Thanh toán DV chọn BS tháng 7/2026"), `periodKey` (YYYY-MM, chỉ để lọc/hiển thị), `status: 'draft' | 'locked'`
- `createdBy`, `createdAt`, `updatedAt`, `lockedBy?`, `lockedAt?`
- `items: PaymentListItem[]` — `patientId` (không trùng trong 1 danh sách), `patientName` (theo TCKT), `note?`,
  `addedManually?`, `nameConfirmed?`, `addedAt`.
- Trạng thái đối soát (`assigned | pending | notFound | nameMismatch`) **không lưu**, tính lại ở client mỗi lần xem.

Ràng buộc "chỉ 1 danh sách": số danh sách nhỏ nên client subscribe toàn bộ `payment_lists` và dựng chỉ mục
`patientId → danh sách`; service kiểm tra lại trong transaction khi tạo/thêm/chuyển. Việc chặn sửa danh sách đã
`locked` được thực thi trong transaction của service (rules Firestore của module này đang mở như các collection gói dịch vụ khác).


## 5. Luồng người dùng

1. **Import**: dán text hoặc chọn Excel → tách `mã-HỌ TÊN` (bỏ dòng tiêu đề khoa, STT, dòng tổng).
2. **Xem trước đối soát**: đếm khớp / chờ gắn gói / không tìm thấy / lệch tên / trùng danh sách khác → xác nhận lưu.
3. **Quản lý danh sách**: thêm ca (từ DS phẫu thuật), bớt, sửa ghi chú, đổi tên, xóa danh sách (khi draft),
   chuyển/xóa từng ca, gắn gói cho ca trong hàng chờ (dùng `PackageAssignmentModal` hiện có).
4. **Chốt / Mở khóa** danh sách (admin/trưởng khoa), có ghi nhật ký (audit).
5. **Theo dõi**: màn hình "Đã gán gói – chưa thanh toán" = ca có `ServicePackageAssignment` mà `patientId` chưa
   nằm trong danh sách nào; lọc theo ngày/khoa; xuất ra để đề nghị thanh toán bổ sung.

## 6. UI (BC tháng) — tái sử dụng tab hiện có, không thêm tab/page mới

Mọi thành phần mới chỉ render khi `currentType === 'monthly'` (prop `enablePaymentLists`); BC hàng ngày giữ nguyên.

**A. Tab "Thanh toán" › sub-tab "Gói dịch vụ"** (bảng tổng hợp tiền theo nhân viên — chính là thứ khoa cần gửi TCKT)
- Thêm bộ chọn **"Danh sách thanh toán"** vào thanh công cụ: `Tất cả ca đã gán` | `TT DV chọn BS tháng 7 🔒` | … | `Chưa thanh toán`.
  Bảng chỉ tính các ca thuộc danh sách đang chọn ⇒ ra đúng số tiền từng nhân viên cho đợt chi đó.
- Cạnh bộ chọn: nút **"Quản lý danh sách"** mở **1 modal** (không phải tab mới) gồm: Import (dán text/Excel) → xem trước đối soát →
  bảng ca của danh sách (trạng thái, ghi chú) với thao tác thêm/bớt/sửa, chuyển ca, xóa khỏi danh sách,
  gắn gói cho ca trong hàng chờ (mở `PackageAssignmentModal`), nút Chốt / Mở khóa, đổi tên/xóa danh sách.
- Chế độ `Chưa thanh toán` = các ca đã gán gói mà chưa nằm trong danh sách nào (để đề nghị thanh toán bổ sung).
- Mẫu in / xuất Excel TCKT (làm sau) cũng đặt cạnh nút In/Excel hiện có, theo danh sách đang chọn.

**B. Tab "Gói DV"** (danh sách ca đã gán / nháp, `PackageListView`)
- Thêm cột **"Thanh toán"**: tên danh sách chứa ca (kèm 🔒 nếu đã chốt) hoặc "Chưa TT".
- Thêm bộ lọc cạnh `Tất cả / Đã gán / Chưa gán`: `Chưa thanh toán`, và lọc theo từng danh sách.
- Thao tác từng dòng (menu hiện có): **Thêm vào danh sách…**, **Chuyển sang danh sách…**, **Xóa khỏi danh sách**
  (bị khóa nếu danh sách đã chốt). Ca trong hàng chờ của một danh sách nhưng chưa gán gói xuất hiện ở đây
  với trạng thái "Chưa gán" và nhãn danh sách, để user gắn gói ngay bằng icon `+` sẵn có.

**C. Chỉ thêm UI mới ngoài hai tab trên khi bất khả kháng** — hiện chỉ có 1 modal quản lý/import ở mục A.


## 7. Phương án BigQuery (giai đoạn 2)

Thêm API chỉ-đọc ở cpbq-react tra cứu theo mã KCB (ngày ra viện/thanh toán), gọi từ SurgicalDataPro, để
(a) gắn cờ "đã ra viện" cho ca chưa có trong danh sách, (b) cảnh báo ca trong danh sách TCKT nhưng chưa ra viện.
Cần xác minh schema `thanh_toan_bhyt` / `v_thanh_toan` (cột mã KCB, ngày ra viện) và cách xác thực/CORS trước khi làm.

## 8. Kiểm thử

- Unit: parser (text/Excel, nhiều định dạng dòng), đối soát (4 trạng thái), ràng buộc 1-danh-sách, chuyển ca,
  khóa/mở khóa & quyền, tính danh sách "chưa thanh toán".
- Firestore rules: chặn ghi khi `locked`, chỉ admin/trưởng khoa đổi `status`.

## 9. Quyết định đã chốt

- Ca `nameMismatch`: cảnh báo, chờ user làm rõ; không chốt được danh sách khi còn ca chưa làm rõ.
- Danh sách **không** gắn cứng một tháng: `periodKey` chỉ để lọc/hiển thị; ca của tháng trước được phép nằm trong
  danh sách tháng sau (mổ 30/8, thanh toán 2/9). Hệ quả: đối soát phải tra dữ liệu ngoài báo cáo đang mở (xem quy tắc 5).

## 10. Rủi ro / việc cần xác minh khi lập kế hoạch

- Cách tra dữ liệu phẫu thuật đã lưu của tháng khác theo mã KCB (chỉ mục Firestore/`STORAGE`) và chi phí truy vấn.
- Đồng bộ với bảng thanh toán gói: số tiền lấy từ gói đã gán (không phụ thuộc tháng báo cáo).

