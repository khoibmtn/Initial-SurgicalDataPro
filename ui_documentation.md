# Tài liệu Đặc tả Giao diện và Chức năng Ứng dụng Quản lý Dữ liệu Phẫu Thuật (SurgicalDataPro)

Tài liệu này mô tả chi tiết toàn bộ giao diện (UI) và các chức năng của hệ thống, bao gồm cấu trúc điều hướng, các màn hình, tab và các tính năng tương tác của người dùng.

---

## 1. Tổng quan cấu trúc (App Shell)

Giao diện chính của ứng dụng sử dụng cấu trúc **Tab Navigation** ở phía trên cùng, cho phép người dùng chuyển đổi giữa 4 phân hệ chính:
1. **BÁO CÁO HÀNG NGÀY** (Daily Report)
2. **BÁO CÁO THÁNG** (Monthly Report)
3. **THỐNG KÊ** (Statistics)
4. **CẤU HÌNH** (Configuration)

Ngoài ra, ứng dụng cung cấp hệ thống thông báo (Toast notifications) dạng pop-up ở góc phải màn hình để hiển thị trạng thái Thành công/Lỗi cho các thao tác của người dùng.

---

## 2. Tab BÁO CÁO HÀNG NGÀY & BÁO CÁO THÁNG

Hai tab này chia sẻ chung một cấu trúc giao diện và luồng xử lý dữ liệu (chỉ khác biệt về phạm vi dữ liệu và một số logic lưu trữ).

### 2.1. Khu vực Upload và Hành động (Header Actions)
- **Khu vực kéo thả / Chọn file Excel**: Hỗ trợ upload file báo cáo phẫu thuật từ phần mềm bệnh viện. (Ở báo cáo tháng hỗ trợ cấu trúc file tháng).
- **Các nút chức năng**:
  - **In Báo Cáo**: Mở chế độ xem trước bản in (Print Preview) với các mẫu báo cáo (VD: Mẫu sổ phẫu thuật, báo cáo chuyên đề).
  - **Lưu dữ liệu / Đồng bộ**: Lưu kết quả xử lý vào cơ sở dữ liệu (Firestore).
  - **Export Excel**: Xuất danh sách hiện tại ra file Excel đã được format chuẩn.

### 2.2. Bảng chỉ số tổng quan (Dashboard Metric Cards)
Hiển thị hàng ngang các thẻ (cards) tóm tắt nhanh tình trạng dữ liệu vừa upload hoặc đang xem:
- **Tổng số ca**: Tổng số dòng dữ liệu.
- **Hợp lệ**: Số ca đủ thông tin, không vi phạm các quy tắc ràng buộc.
- **Lỗi / Cảnh báo**: (VD: Trùng lặp, sai quy tắc thời gian, thiếu người phụ...).
- **Ước tính doanh thu / Viện phí**: Tính toán nhanh dựa trên danh mục giá.

### 2.3. Menu Điều hướng dữ liệu (Sub-table Tabs)
Dữ liệu chi tiết được chia thành 5 nhóm tab nhỏ (sub-tables) để dễ kiểm soát:
1. **Danh sách ca (List)**: Toàn bộ danh sách phẫu thuật/thủ thuật.
2. **Trùng nhân lực (Staff)**: Cảnh báo các ca có nhân viên tham gia nhiều ca cùng một thời điểm.
3. **Trùng máy (Machine)**: Cảnh báo nhiều ca sử dụng chung một mã máy tại cùng một thời điểm.
4. **Thiếu thông tin (Missing)**: Lọc các ca thiếu bác sĩ chính, thiếu người phụ (đối với PT lớn), hoặc các trường bắt buộc khác.
5. **Viện phí (Payment)**: Chi tiết các loại chi phí, doanh thu tính toán trên từng ca.

### 2.4. Bảng Dữ liệu Động (Dynamic Table)
Bảng trung tâm hiển thị chi tiết dữ liệu với các tính năng nâng cao:
- **Cấu hình hiển thị (Settings Dropdown)**:
  - Chọn cột tìm kiếm.
  - Ẩn/Hiện cột linh hoạt.
  - Định dạng thời gian (dd/mm/yyyy hh:mm, hh:mm, v.v.).
- **Thanh tìm kiếm**: Lọc dữ liệu tức thời (Realtime text-search) trên các cột được chọn.
- **Thao tác hàng loạt (Bulk Actions)**:
  - Có cột checkbox ở đầu để chọn nhiều dòng.
  - **Gán Người phụ (Assistant Input)**: Thanh nhập liệu thông minh có tính năng gợi ý (Autocomplete/Dropdown) danh sách nhân viên có chức danh "Phụ", cho phép gán nhanh người phụ cho hàng loạt ca được chọn.
  - **Xóa dòng**: Xóa các ca bị sai hoặc trùng lặp trực tiếp trên UI.

---

## 3. Tab THỐNG KÊ (Statistics)

Tab Thống kê là bảng điều khiển (Dashboard) phân tích dữ liệu lịch sử và tổng hợp báo cáo quản trị.

### 3.1. Thanh Công cụ và Bộ lọc (Filter Bar)
- **Chọn Tháng / Năm**: Lọc dữ liệu theo tháng cụ thể hoặc xem cả năm.
- **Chọn Năm So sánh**: So sánh dữ liệu năm hiện tại với dữ liệu năm trước.
- **Bộ lọc Nhóm / Chuyên khoa (Profile)**: Lọc dữ liệu theo cấu hình Profile (Nhóm thủ thuật/phẫu thuật theo chuyên khoa cụ thể).
- **Sub-tabs Điều hướng**:
  - **Tổng quan (Summary)**
  - **Biểu đồ (Charts)**
  - **Cấu hình giá (Config)**

### 3.2. Sub-tab Tổng quan (Summary)
- **Lưới chỉ số KPI**: Thể hiện các chỉ số quan trọng như: Tổng số ca, Tổng viện phí, Trung bình ca/ngày, Tỉ lệ PT/TT... kèm nhãn so sánh tăng/giảm so với kỳ trước.
- **Bảng Phân bổ**:
  - Thống kê theo Khoa/Phòng (Sắp xếp theo số lượng hoặc doanh thu).
  - Thống kê theo Phân loại PT/TT (Đặc biệt, Loại I, II, III).

### 3.3. Sub-tab Biểu đồ (Charts)
- **Biểu đồ đường / Cột (Line/Bar Charts)**: Cho phép chuyển đổi qua lại giữa dạng biểu đồ đường và cột. Có chức năng lưu trạng thái cấu hình (localStorage).
- Thể hiện xu hướng số ca và doanh thu theo thời gian (các tháng trong năm).
- Tích hợp **Đường dự báo (Forecast)**: Hiển thị ước tính dữ liệu cho các tháng tương lai (sau thời điểm hiện tại).
- Hiển thị Data Labels trên đầu các cột để dễ theo dõi.

### 3.4. Sub-tab Cấu hình giá (Pricing Config)
Khu vực quản lý danh mục quy định tài chính và chuyên khoa để phục vụ tính toán bảng Thống kê:
- **Danh mục Giá PTTT**: Bảng quản lý tên dịch vụ, "Mã tương đương" và Đơn giá (được quản lý theo các phiên bản - Price Versions). Hỗ trợ import/export.
- **Danh mục Chương**: Bảng quy chuẩn 28 chương chuyên khoa y tế (01 - 28). Mã chương được lấy từ 2 ký tự đầu của "Mã tương đương".
- **Profile Chuyên khoa**: Quản lý các bộ lọc tùy chỉnh ghép nhiều dịch vụ vào một nhóm (VD: Profile Nội soi, Mắt, Răng hàm mặt...).

---

## 4. Tab CẤU HÌNH (Configuration)

Nơi thiết lập các quy tắc cốt lõi (Business Rules) để hệ thống tự động kiểm tra và đánh giá dữ liệu lúc Upload file.

### 4.1. Điều hướng (Sidebar / Top Tabs)
Gồm 4 mục cấu hình chính:
1. Định mức & Phụ cấp
2. Danh sách PT không dùng máy
3. Quản lý Mã máy (Machine Registry)
4. Thông tin Nhân lực

### 4.2. Định mức & Phụ cấp (Norms & Allowances)
- Quản lý số lượng tối thiểu các vị trí (PTV chính, Phụ 1, Phụ 2, Bác sĩ Gây mê, v.v.) yêu cầu cho từng loại PT/TT (Đặc biệt, Loại I, Loại II, Loại III).
- Quy định mức thù lao cơ bản cho từng vị trí.
- Giao diện dạng Form và Bảng cấu hình lưu trực tiếp vào hệ thống.

### 4.3. Danh sách PT không dùng máy (Machine Exceptions)
- Quản lý danh sách các phẫu thuật/thủ thuật đặc thù không cần phải nhập thông tin Máy (Bỏ qua cảnh báo lỗi thiếu máy).
- Giao diện CRUD (Thêm, Sửa, Xóa) đơn giản. Hỗ trợ import/export Excel.

### 4.4. Quản lý Mã máy (Machine Registry) & Backfill Data
*Tính năng quan trọng nhất để chuẩn hóa dữ liệu vật tư máy móc.*
- **Danh mục Máy (Registry Table)**: Bảng lưu trữ: ID hệ thống, Mã máy (Mã duy nhất), Tên máy, và Trạng thái (Sử dụng/Ngừng sử dụng).
- **Import/Export Excel**:
  - Import danh mục máy từ Excel với khả năng phát hiện trùng lặp Mã máy/ID.
  - Cảnh báo và yêu cầu xác nhận ghi đè dữ liệu.
- **Công cụ Backfill Dữ liệu (Đồng bộ quá khứ)**:
  - Bảng điều khiển (Dashboard) 6 cột: Thống kê số lượng ca lịch sử đã được quét, đã chuẩn hóa, thiếu thông tin (No Machine), hoặc không khớp tên (Unmatched).
  - Thanh tiến trình (Progress bar) chạy Realtime khi tiến hành đồng bộ hàng ngàn bản ghi trên database.
  - Bảng danh sách "Tên máy không khớp" (Unmatched Names): Hiển thị các tên máy cũ bị nhập sai trong quá khứ kèm theo số lượng xuất hiện, giúp Admin biết để bổ sung vào danh mục chuẩn.

### 4.5. Thông tin Nhân lực (Staff)
- Danh mục hồ sơ nhân sự của bệnh viện/trung tâm.
- Quản lý các trường: Mã NV, Tên NV, Khoa phòng, Chức danh (VD: Phụ, Bác sĩ, Gây mê).
- Giao diện Form thêm mới/sửa đổi bên trái và Bảng danh sách (hỗ trợ tìm kiếm, phân trang) bên phải.
- Thông tin từ bảng này được sử dụng trực tiếp để cung cấp gợi ý (Autocomplete) ở tính năng "Gán Người phụ" trong Bảng Dữ liệu Động ở Tab Báo cáo.

---
*Tài liệu được kết xuất tự động dựa trên cấu trúc mã nguồn của SurgicalDataPro hiện tại.*
