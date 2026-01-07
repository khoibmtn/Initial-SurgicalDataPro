---
description: Lưu trữ toàn bộ ngữ cảnh phiên làm việc hiện tại vào file để chuyển giao
---

Quy trình này hướng dẫn Antigravity tổng hợp và lưu lại toàn bộ kiến thức, logic và tiến độ hiện tại vào một file cứu cánh.

1. **Tổng hợp thông tin**
   Antigravity sẽ tự động đọc và kết hợp các tệp sau:
   - `task.md`: Trạng thái các đầu việc.
   - `implementation_plan.md`: Kế hoạch chi tiết.
   - `walkthrough.md`: Những gì đã hoàn thành.

2. **Ghi lại Logic và Schema quan trọng**
   Quét mã nguồn để trích xuất:
   - Cấu trúc dữ liệu chính (Interfaces, Types).
   - Các logic xử lý quan trọng (ví dụ: logic sắp xếp, logic bảo mật Rules).
   - Trạng thái Git (nhánh hiện tại).

3. **Tạo Snapshot**
   // turbo
   ```bash
   # Ghi thông tin tóm tắt vào file last-session.md
   # (Bước này Antigravity tự thực hiện ghi nội dung tóm tắt)
   ```

4. **Kết quả**
   File ngữ cảnh được lưu tại: `.agent/context/last-session.md`.
   Mọi thảo luận và quyết định thiết kế quan trọng đều được bảo toàn cho lần làm việc tới.
