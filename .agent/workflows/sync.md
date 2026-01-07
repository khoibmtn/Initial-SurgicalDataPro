---
description: đồng bộ thay đổi lên main, push GitHub và tạo nhánh temp mới theo thời gian
---

Quy trình này tự động thực hiện việc sao lưu mã nguồn, gộp vào nhánh chính và khởi tạo không gian làm việc mới.

**Lưu ý:** Vì Git không cho phép ký tự `:` trong tên nhánh, quy trình sẽ sử dụng dấu `-` để thay thế cho định dạng giờ:phút.

1. **Xác định nhánh hiện tại**
   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   ```

2. **Lưu thay đổi (Checkpoint)**
   // turbo
   ```bash
   git add . && git commit -m "{{mess}}"
   ```

3. **Gộp vào nhánh main**
   // turbo
   ```bash
   git checkout main && git merge $CURRENT_BRANCH
   ```

4. **Đẩy mã nguồn lên GitHub**
   // turbo
   ```bash
   git push origin main
   ```

5. **Tạo nhánh mới với định dạng thời gian**
   // turbo
   ```bash
   # Định dạng: temp-dd-mm-yyyy-HHhMM
   NEW_BRANCH="temp-$(date +'%d-%m-%Y-%Hh%M')"
   git checkout -b $NEW_BRANCH
   ```

6. **Dọn dẹp nhánh cũ**
   // turbo
   ```bash
   git branch -d $CURRENT_BRANCH
   ```

7. **Thông báo kết quả**
   Hoàn tất quy trình:
   - Đã gộp `$CURRENT_BRANCH` vào `main`.
   - Đã push lên GitHub.
   - Nhánh mới hiện tại: `$NEW_BRANCH`.
