# Kế hoạch tối ưu hóa tăng tốc tải tab Gói DVYC & Thanh toán

## Mục tiêu
1. **Loại bỏ tình trạng bảng trống trơn (Flash of Empty Data)**: Khi bấm "Lấy dữ liệu", tab Gói DVYC hiện badge (ví dụ: 2 ca) thì danh sách trong bảng phải hiển thị ngay từ dữ liệu gói đã gán (`assignments`), không bị trống trơn chờ `records` phẫu thuật xong mới hiện.
2. **Tải song song (Parallel Data Fetching)**: Khi người dùng bấm "Lấy dữ liệu", hệ thống đồng thời kích hoạt nạp danh sách phẫu thuật, dữ liệu gói dịch vụ, đợt thanh toán và nạp trước thông tin bệnh nhân trong đợt.
3. **Hiển thị trạng thái Loading Skeleton**: Khi dữ liệu đang trong quá trình tải/đồng bộ, hiển thị Skeleton/Spinner thay vì thông báo "Chưa có ca phù hợp" gây hiểu lầm là mất dữ liệu.

## Các bước thực hiện
1. **`hooks/usePaymentLists.ts`**:
   - Thêm cờ `isLoading` / `isRecordsLoading` vào context.
   - Thêm cơ chế tự động nạp trước hồ sơ bệnh nhân khi có `lists` hoặc khi `ensureRecordsLoaded` được kích hoạt.
2. **`components/surgery/PackageListView.tsx`**:
   - Tối ưu hóa `enrichedRecords`:
     - Ở chế độ `listFilter === 'all'`: Không chỉ duyệt qua `records` mà đồng thời đưa ngay các ca từ `assignments` vào danh sách hiển thị với thông tin fallback (họ tên, kỹ thuật, ngày mổ, PTV, BS GM...) có sẵn trong assignment.
     - Khi `records` nạp xong, tự động bổ sung/làm giàu thông tin (khoa, thời gian, trạng thái...).
     - Ở chế độ có đợt (`currentList`): nếu đợt chưa nạp xong hoặc đang query, hiển thị Skeleton thay vì bảng trống.
   - Bổ sung UI Loading Skeleton khi `isProcessing` hoặc `isLoading`.
3. **`components/surgery/SurgeryTableViewRouter.tsx` & `App.tsx`**:
   - Truyền trạng thái `isProcessing` vào `PackageListView` và `PackagePaymentTable`.
   - Kích hoạt tải song song ngay khi nhấn nút "Lấy dữ liệu" ở `useStorageQuery.ts`.
4. **Kiểm thử**:
   - Chạy test suites (`npm test`).
   - Kiểm tra trực quan trên trình duyệt với Báo cáo hàng ngày và Báo cáo tháng.
   - Build và đồng bộ lên remote.
