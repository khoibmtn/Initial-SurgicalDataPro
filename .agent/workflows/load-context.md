---
description: Đọc và phục hồi ngữ cảnh từ file lưu trữ của phiên trước
---

Quy trình này giúp Antigravity "nhớ lại" toàn bộ những gì đã làm ở phiên trước thông qua file snapshot.

1. **Đọc file ngữ cảnh**
   Antigravity sẽ đọc tệp `.agent/context/last-session.md` để nắm bắt:
   - Mục tiêu đang thực hiện dở dang.
   - Các logic nghiệp vụ đã thống nhất.
   - Cấu trúc dữ liệu và sơ đồ hệ thống.

2. **Đồng bộ hóa trạng thái**
   - Kiểm tra nhánh Git hiện tại.
   - Đọc lại `.agent/workflows/` để biết các câu lệnh tùy chỉnh có sẵn.

3. **Khởi tạo phiên làm việc**
   Antigravity sẽ tóm tắt lại những gì nó vừa "nhớ" được cho người dùng để xác nhận và tiếp tục công việc mà không cần giải thích lại từ đầu.

4. **Kết quả**
   Hệ thống sẵn sàng tiếp tục công việc từ điểm dừng của phiên trước.
