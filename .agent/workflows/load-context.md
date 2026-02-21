---
description: Đọc và phục hồi ngữ cảnh từ file lưu trữ của phiên trước
---

Quy trình này giúp Antigravity "nhớ lại" toàn bộ những gì đã làm ở phiên trước thông qua file snapshot.

// turbo-all

1. **Đọc file ngữ cảnh**
   Antigravity sẽ đọc tệp `.agent/context/last-session.md` để nắm bắt:
   - Mục tiêu đang thực hiện dở dang.
   - Các logic nghiệp vụ đã thống nhất.
   - Cấu trúc dữ liệu và sơ đồ hệ thống.

2. **🔴 Đọc và nạp Rules (BẮT BUỘC)**
   Antigravity PHẢI đọc các file sau và tuân thủ nghiêm ngặt trong TOÀN BỘ phiên:
   - Đọc `.agent/rules/GEMINI.md` — Bộ quy tắc cốt lõi (Request Classifier, Agent Routing, Clean Code, Socratic Gate).
   - Đọc `.agent/ARCHITECTURE.md` — Bản đồ hệ thống (Agents, Skills, Scripts).
   - **Cam kết tuân thủ:** Mọi thao tác code/design trong phiên PHẢI tuân theo GEMINI.md rules, bao gồm:
     - Agent Routing Checklist trước khi viết code.
     - Request Classifier để phân loại yêu cầu.
     - Socratic Gate cho các yêu cầu phức tạp.
     - Clean Code standards cho mọi code output.
   - **Xác nhận:** Thông báo cho user rằng rules đã được nạp và sẽ được tuân thủ.

3. **Đồng bộ hóa trạng thái**
   - Kiểm tra nhánh Git hiện tại.
   - Đọc lại `.agent/workflows/` để biết các câu lệnh tùy chỉnh có sẵn.

4. **Khởi tạo phiên làm việc**
   Antigravity sẽ tóm tắt lại những gì nó vừa "nhớ" được cho người dùng để xác nhận và tiếp tục công việc mà không cần giải thích lại từ đầu.
   Bao gồm xác nhận: "✅ Rules & Skills đã được nạp và sẽ tuân thủ trong phiên này."

5. **Kết quả**
   Hệ thống sẵn sàng tiếp tục công việc từ điểm dừng của phiên trước, với rules được enforce.
