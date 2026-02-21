---
description: Kích hoạt chế độ brainstorm — hỏi câu hỏi Socratic trước khi bắt tay vào tính năng mới
---

Quy trình này kích hoạt Socratic Gate Protocol từ skill `brainstorming` để đảm bảo hiểu rõ yêu cầu trước khi code.

1. **Đọc skill brainstorming**
   Đọc `.agent/skills/brainstorming/SKILL.md` để nạp protocol.

2. **Phân tích yêu cầu của user**
   - Xác định context: greenfield / feature mới / refactor / debug.
   - Trích xuất domain, features, scale indicators từ yêu cầu.
   - Xác định decision points: blocking vs. deferable.

3. **🛑 Dừng lại — KHÔNG code ngay**
   Antigravity PHẢI đặt **tối thiểu 3 câu hỏi** trước khi bắt tay vào bất kỳ code nào:
   - 🎯 **Purpose:** Bạn đang giải quyết vấn đề gì?
   - 👥 **Users:** Ai sẽ sử dụng tính năng này?
   - 📦 **Scope:** Đâu là must-have, đâu là nice-to-have?
   - Thêm các câu hỏi đặc thù dựa trên domain/context.

4. **Format câu hỏi theo chuẩn**
   Mỗi câu hỏi phải có:
   - **Question:** Câu hỏi rõ ràng
   - **Why This Matters:** Tại sao câu hỏi này quan trọng (hệ quả kiến trúc)
   - **Options:** Bảng so sánh các lựa chọn (Pros / Cons / Best For)
   - **If Not Specified:** Default hợp lý + lý do

5. **Chờ user trả lời**
   KHÔNG tiến hành code cho đến khi user cung cấp đủ thông tin.
   Sau khi có câu trả lời, tạo plan tóm tắt và xác nhận với user trước khi implement.
