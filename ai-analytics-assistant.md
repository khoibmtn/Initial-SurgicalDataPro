# AI Analytics & Multi-Model Assistant (`ai-analytics-assistant`)

## 1. Overview (Tổng quan & Mục tiêu)

Bổ sung hệ thống **Trợ lý Phân tích Dữ liệu Y khoa AI Đa Mô Hình (Multi-Provider AI Analytics & Copilot)** cho **SurgicalDataPro**, đóng vai trò như một chuyên gia phân tích dữ liệu bệnh viện chuyên nghiệp:
1. **Quản trị đa mô hình linh hoạt (Multi-Provider Configuration)**: Hỗ trợ **Google Gemini, OpenAI, Anthropic (Claude), DeepSeek** với Base URL mặc định (cho phép tùy chỉnh), danh sách các model khả dụng mới nhất (cho phép thêm model tùy chỉnh), nút **Test kết nối** thời gian thực, cơ chế lưu trữ **Hybrid** (Admin cấu hình trên Firebase Realtime DB/Firestore cho toàn viện + User có thể lưu API Key riêng ở `localStorage`), và gán mô hình kèm tham số suy luận (`temperature`, `reasoningEffort`, `maxTokens`) cho từng vị trí (AI Slot) trong ứng dụng.
2. **Semantic Data Layer & In-Browser Relational Query Engine (Giao diện Logic)**: Xây dựng lớp ngữ nghĩa dữ liệu y khoa và bộ công cụ truy vấn liên kết đa bảng (`Tool Calling` + `In-Memory Analytical Engine`) giúp AI hiểu sâu cấu trúc và mối quan hệ giữa:
   - Ca phẫu thuật/thủ thuật (`PersistedSurgeryRecord` / `SurgeryRecord`)
   - Gói dịch vụ yêu cầu & nhân sự tham gia gói (`ServicePackageAssignment`, `ServicePackageDefinition`, `PositionCatalogItem`)
   - Lịch trực 24h & Ca mổ ngoài giờ (`DutyScheduleDateConfig`, `OvertimeRecordRow`, quy tắc giờ làm việc Mùa Hè `01/05–30/09` / Mùa Đông `01/10–30/04`)
   - Nhân viên y tế & Khoa phòng (`StaffMember`, `departments`)
   - Danh mục kỹ thuật, Chương ICD/DMKT, Giá DVKT, Chi phí thuốc/VTTH, Định mức phụ cấp (`SurgeryNamePrice`, `ChapterCatalog`, `SurgeryCostItem`, `LaborAllowanceItem`)
3. **Giao diện tương tác thông minh & AI Analytics Studio**:
   - **Tại `BC hàng ngày → Lưu trữ` và `BC tháng → Lưu trữ`**: Ngăn trượt thông minh bên phải (**Contextual AI Side Drawer**) bám sát dữ liệu kỳ đang mở và tự động truy vấn mở rộng sang Firestore khi câu hỏi vượt ngoài kỳ hiện tại.
   - **Tại `Thống kê phẫu thuật` (`StatisticsTab`)**: Tích hợp **AI Copilot** và chế độ mở rộng **AI Analytics Studio (Split-Screen / Fullscreen Workspace)** cho phép hỏi đáp đa chiều, tự động sinh **Biểu đồ tương tác** (Recharts với thanh kéo zoom `Brush`, chuyển đổi loại biểu đồ Bar/Line/Area/Pie/Composed, hover xem đa chỉ số, lọc chéo), **Bảng dữ liệu tổng hợp & chi tiết**, và xuất kết quả ra **File Excel (`.xlsx` định dạng chuẩn)** hoặc **File Ảnh (`.png` độ phân giải cao)**.

---

## 2. Project Type
- **Project Type**: **WEB** (React 19 + TypeScript + Tailwind CSS v4 + Firebase Firestore/RTDB + Recharts + ExcelJS)
- **Primary Agents**: `project-planner`, `frontend-specialist`, `backend-specialist`, `database-architect`, `test-engineer`

---

## 3. Success Criteria (Tiêu chí nghiệm thu)

- [ ] **Cấu hình AI (`ConfigurationTab` → Tab `Cấu hình AI`)**:
  - Cấu hình đủ 4 nhà cung cấp: `gemini`, `openai`, `anthropic`, `deepseek` với Base URL mặc định chuẩn xác.
  - Có danh sách các model khả dụng hiện hành của từng hãng + hỗ trợ thêm mã model mới.
  - Nút **"Test kết nối"** trả về trạng thái kết nối, độ trễ (ms) và phản hồi thực tế từ model.
  - Lưu trữ Hybrid: Admin lưu cấu hình chung lên Firebase (`app_config/ai_settings` hoặc Firestore `system_settings/ai_config`); người dùng cá nhân có thể nhập key override tại `localStorage`.
  - Cấu hình **Vị trí AI (AI Slots)**: Gán riêng Provider, Model, `temperature` (0.0 - 2.0), `reasoningEffort` (`low` | `medium` | `high`), `maxTokens` cho từng vị trí (`daily_storage`, `monthly_storage`, `statistics_studio`, `conflict_insight`).
- [ ] **Bộ máy Truy vấn Liên kết Đa bảng (Semantic Data & Tool-Calling Engine)**:
  - Trả lời chính xác các truy vấn đơn và liên kết phức tạp:
    - Tra cứu bệnh nhân theo `patientId`, họ tên, thẻ BHYT, kỹ thuật thực hiện.
    - Thống kê khối lượng công việc của nhân viên X (tổng số ca, phân tách theo vai trò `ptChinh`, `ptPhu`, `bsGM`, `ktvGM`, `tdc`, `gv`, số ca ngoài giờ).
    - Thống kê số ca sử dụng **Gói dịch vụ yêu cầu** (ví dụ: gói sản khoa, gói chọn bác sĩ) và doanh thu/thù lao gói.
    - Tra cứu **Lịch trực 24h** (ví dụ: *"Tháng X nhân viên Y trực bao nhiêu buổi, vào những ngày nào, bao nhiêu ngày nghỉ/lễ?"*).
    - Phân tích chéo đa chiều (ví dụ: *"Phẫu thuật nội soi tiêu hóa ở các tháng khác nhau, mùa Hè vs mùa Đông, theo từng bác sĩ phẫu thuật chính"*).
- [ ] **Giao diện Tương tác & Artifact Studio**:
  - Chuyển đổi nhanh Model, `temperature`, `reasoningEffort` ngay trên thanh header của khung chat AI.
  - Render **Interactive Chart Artifact**: Hỗ trợ kéo chuột (`Brush` zoom khoảng dữ liệu), bật/tắt chuỗi dữ liệu (legend toggle), đổi kiểu biểu đồ (`Bar`, `Line`, `Composed`, `Area`, `Pie`), xem bảng số liệu gốc bên dưới biểu đồ.
  - Xuất kết quả Artifact ra **Excel (`.xlsx`)** và **Ảnh (`.png`)** trực tiếp từ câu trả lời của AI.

---

## 4. Tech Stack & Architectural Decisions

| Thành phần | Lựa chọn Kỹ thuật | Lý do (Rationale) |
|---|---|---|
| **Multi-LLM Adapter** | Unified Client Adapter (`@google/genai` cho Gemini + chuẩn `fetch` OpenAI-compatible cho DeepSeek/OpenAI + Anthropic Messages API với header browser access) | Không cần thêm dependency nặng, kiểm soát hoàn toàn Base URL, headers, tool-calling và tham số `temperature` / `reasoning_effort` / `thinkingConfig`. |
| **Data Query Strategy** | **Hybrid Semantic Tool-Calling Engine** (`aiQueryEngine.ts`) | Thay vì gửi hàng chục nghìn bản ghi thô vào prompt gây tràn token và tính nhẩm sai, AI gọi các hàm truy vấn định kiểu (`querySurgeries`, `queryStaffWorkload`, `queryDutySchedules`, `queryServicePackages`, `runCrossTabAnalysis`) thực thi trực tiếp bằng TypeScript tốc độ cao trên trình duyệt (kết hợp nạp thêm từ Firestore khi vượt ngoài kỳ đang mở), trả về số liệu chính xác 100% + cấu trúc biểu đồ/bảng cho AI phân tích nhận định. |
| **Interactive Charts** | `recharts` (có sẵn v3.8.1) kết hợp `Brush`, `ComposedChart`, `ResponsiveContainer`, custom interactive tooltip & drill-down | Tận dụng thư viện có sẵn trong dự án, hỗ trợ kéo chuột chọn vùng (`Brush`), zoom, lọc series và chuyển đổi loại biểu đồ mượt mà. |
| **Export Engine** | `exceljs` / `xlsx` (cho bảng & dữ liệu biểu đồ) + SVG/Canvas-to-PNG serializer (cho ảnh biểu đồ độ phân giải cao) | Không cần cài thêm thư viện chụp ảnh bên ngoài có nguy cơ lỗi CSS Tailwind v4; serialize trực tiếp SVG biểu đồ + tiêu đề/chú thích sang Canvas 2x DPI để xuất file `.png` sắc nét. |

---

## 5. File Structure (Cấu trúc File dự kiến)

```plaintext
types/
└── ai.ts                                      # Định nghĩa types cho Provider, Model, AISlotConfig, AIQueryTool, AIArtifact (Chart/Table/Metric), ChatMessage

services/ai/
├── aiConfigService.ts                         # Đọc/ghi cấu hình AI Hybrid (Firebase + LocalStorage), danh mục model mặc định, test kết nối
├── aiProviderClient.ts                        # Unified LLM Client (Gemini, OpenAI, Anthropic, DeepSeek) hỗ trợ Tool Calling + Reasoning Effort + Temperature
├── aiSemanticSchema.ts                        # Từ điển ngữ nghĩa dữ liệu y khoa (Schema, mối quan hệ bảng, quy tắc mùa Hè/Đông, gói DV, lịch trực) + System Prompt
├── aiQueryEngine.ts                           # Bộ máy thực thi truy vấn liên kết đa bảng (Surgeries + Packages + DutySchedules + Staff + Chapters/Prices)
└── aiArtifactExportService.ts                 # Xuất kết quả AI (Bảng + Dữ liệu biểu đồ ra Excel .xlsx; Biểu đồ tương tác ra ảnh .png)

components/config/
└── AIConfigPanel.tsx                          # Giao diện cấu hình AI trong ConfigurationTab (Providers, API Keys, BaseURL, Models, Test Connection, AI Slots)

components/ai/
├── AIModelQuickSelector.tsx                   # Popover chọn nhanh Model + chỉnh Temperature / Effort ngay tại khung chat
├── AIInteractiveChartArtifact.tsx             # Component biểu đồ tương tác (Brush kéo chuột, đổi loại chart, lọc series, xuất PNG/Excel)
├── AIDataTableArtifact.tsx                    # Component bảng dữ liệu kết quả AI (tìm kiếm nhanh, sắp xếp, phân trang, xuất Excel)
├── AIChatWorkspace.tsx                        # Khung hội thoại AI dùng chung (hỗ trợ cả chế độ Drawer nhỏ gọn và Studio mở rộng Split-Screen)
└── AIStorageDrawer.tsx                        # Ngăn trượt AI tích hợp vào BC Hàng ngày: Lưu trữ & BC Tháng: Lưu trữ
```

---

## 6. Task Breakdown (Chi tiết các bước triển khai)

### Task 1: Định nghĩa Kiểu dữ liệu & Dịch vụ Cấu hình AI Đa Mô Hình (`types/ai.ts`, `services/ai/aiConfigService.ts`)
- **Agent**: `backend-specialist` | **Skill**: `clean-code`, `api-patterns`
- **INPUT**: Yêu cầu cấu hình 4 hãng (`deepseek`, `openai`, `anthropic`, `gemini`), Base URL mặc định, danh sách model hiện hành, cấu hình vị trí AI (`daily_storage`, `monthly_storage`, `statistics_studio`, `conflict_insight`), thông số `temperature`, `reasoningEffort`, `maxTokens`.
- **OUTPUT**: `types/ai.ts` và `services/ai/aiConfigService.ts` hỗ trợ đồng bộ Hybrid (Firebase + LocalStorage override).
- **VERIFY**: Kiểm tra đọc/ghi cấu hình mặc định, fallback an toàn khi chưa có key, merge đúng giữa cấu hình toàn viện và cấu hình cá nhân.

### Task 2: Xây dựng Unified Multi-LLM Client & Test Kết nối (`services/ai/aiProviderClient.ts`)
- **Agent**: `backend-specialist` | **Skill**: `api-patterns`, `clean-code`
- **INPUT**: Cấu hình Provider (`apiKey`, `baseUrl`, `modelId`, `temperature`, `reasoningEffort`, `maxTokens`).
- **OUTPUT**: `services/ai/aiProviderClient.ts` hỗ trợ gọi API tới cả 4 nhà cung cấp, chuẩn hóa cơ chế **Tool Calling (Function Calling)** và hàm `testProviderConnection()`.
- **VERIFY**: Test gọi thử / mock response với cả 4 định dạng payload (Gemini, OpenAI, Anthropic, DeepSeek).

### Task 3: Xây dựng Semantic Data Layer & In-Browser Relational Query Engine (`services/ai/aiSemanticSchema.ts`, `services/ai/aiQueryEngine.ts`)
- **Agent**: `database-architect` + `backend-specialist` | **Skill**: `database-design`, `clean-code`
- **INPUT**: Các kiểu dữ liệu `SurgeryRecord`, `PersistedSurgeryRecord`, `ServicePackageAssignment`, `DutyScheduleDateConfig`, `StaffMember`, `ChapterCatalog`, `SurgeryNamePrice`, `WorkingHours`.
- **OUTPUT**:
  - Các tool truy vấn cho AI:
    1. `search_patients_and_surgeries`: Tìm BN theo mã/tên/BHYT/tên KT/máy/khoảng ngày.
    2. `analyze_staff_activity`: Thống kê ca mổ theo vai trò, phụ cấp, ngoài giờ và **số buổi trực 24h** theo tháng/năm của nhân viên.
    3. `analyze_service_packages`: Thống kê số ca và doanh thu theo từng gói dịch vụ yêu cầu (VD: Gói DV yêu cầu sản khoa), lọc theo bác sĩ/tháng.
    4. `multi_dimensional_pivot`: Phân tích chéo đa chiều (VD: nhóm kỹ thuật "phẫu thuật nội soi tiêu hóa" × Tháng × Mùa Hè/Đông × Bác sĩ × Loại PTTT) và tự động sinh dữ liệu `AIArtifact` (biểu đồ + bảng).
  - Cơ chế **Hybrid Data Fetcher**: Ưu tiên đọc dữ liệu đang nạp trên màn hình, tự động gọi `reportService` / `dutyScheduleService` / `servicePackageService` tải bổ sung từ Firestore khi câu hỏi nằm ngoài kỳ báo cáo đang mở.
- **VERIFY**: Unit test với Vitest kiểm thử các truy vấn mẫu (tìm mã BN, đếm số ca của nhân viên X, đếm gói DV sản khoa, đếm buổi trực tháng X của nhân viên Y, phân tích nội soi tiêu hóa theo mùa/tháng/bác sĩ).

### Task 4: Xây dựng Giao diện Cấu hình AI trong `ConfigurationTab` (`components/config/AIConfigPanel.tsx`)
- **Agent**: `frontend-specialist` | **Skill**: `frontend-design`, `react-best-practices`
- **INPUT**: `aiConfigService.ts`, `aiProviderClient.ts`, `ConfigurationTab.tsx`.
- **OUTPUT**: Tab **"Cấu hình AI"** trong `ConfigurationTab.tsx` gồm:
  - Danh sách 4 thẻ nhà cung cấp (Gemini, OpenAI, Anthropic, DeepSeek) với ô nhập API Key (ẩn/hiện), Base URL (điền sẵn mặc định + nút khôi phục), danh sách tích chọn/thêm phiên bản Model, nút **Test kết nối** và **Lưu cấu hình**.
  - Bảng **Phân bổ Mô hình theo Vị trí (AI Slots)**: Cho phép chọn Provider + Model mặc định và tinh chỉnh `Temperature`, `Mức độ suy luận (Reasoning Effort)`, `Max Tokens` cho từng vị trí trong ứng dụng.
- **VERIFY**: Mở tab `Cấu hình → Cấu hình AI`, kiểm tra điền sẵn Base URL, bấm Test kết nối, đổi model cho từng vị trí và lưu thành công.

### Task 5: Xây dựng Hệ thống Hiển thị Artifact Tương tác & Xuất Excel/Ảnh (`AIInteractiveChartArtifact.tsx`, `AIDataTableArtifact.tsx`, `aiArtifactExportService.ts`)
- **Agent**: `frontend-specialist` | **Skill**: `frontend-design`, `react-best-practices`
- **INPUT**: Dữ liệu `AIArtifact` từ `aiQueryEngine.ts`.
- **OUTPUT**:
  - `AIInteractiveChartArtifact.tsx`: Biểu đồ Recharts tương tác có thanh kéo chuột (`Brush`) để lọc khoảng dữ liệu, nút chuyển đổi trực tiếp loại biểu đồ (`Cột`, `Đường`, `Kết hợp Cột-Đường`, `Vùng`, `Tròn`), bật/tắt từng chỉ số, tooltip chi tiết, nút **Xuất Ảnh (.png)** và **Xuất Excel (.xlsx)**.
  - `AIDataTableArtifact.tsx`: Bảng dữ liệu kết quả có tìm kiếm nhanh, sắp xếp cột, phân trang và nút **Xuất Excel (.xlsx)**.
- **VERIFY**: Render biểu đồ đa chiều, kéo thanh `Brush` trên biểu đồ để thay đổi vùng hiển thị, bấm xuất Excel và xuất ảnh PNG kiểm tra file tải về.

### Task 6: Tích hợp Giao diện Tương tác AI vào `BC hàng ngày: Lưu trữ`, `BC tháng: Lưu trữ` và `Thống kê` (`AIChatWorkspace.tsx`, `AIStorageDrawer.tsx`, `StatisticsTab.tsx`, `App.tsx`)
- **Agent**: `frontend-specialist` | **Skill**: `frontend-design`, `react-best-practices`
- **INPUT**: `AIChatWorkspace.tsx`, `AIStorageDrawer.tsx`, `App.tsx`, `StatisticsTab.tsx`.
- **OUTPUT**:
  - Tại **BC Hàng ngày → Lưu trữ** và **BC Tháng → Lưu trữ**: Nút **"Trợ lý AI"** trên thanh công cụ mở **Side Drawer** trượt mượt mà bên phải, có sẵn các gợi ý câu hỏi nhanh theo ngữ cảnh (*"Tìm BN có mã..."*, *"Nhân viên X làm bao nhiêu ca?"*, *"Bao nhiêu ca dùng gói DV yêu cầu sản khoa?"*, *"Tháng X nhân viên Y trực bao nhiêu buổi?"*) và bộ chọn nhanh Model / Effort / Temperature.
  - Tại **Thống kê phẫu thuật (`StatisticsTab`)**: Bổ sung tab / nút mở nhanh **"AI Phân tích & Hỏi đáp"** kèm chế độ **Expand (Studio 2 cột: Hỏi đáp bên trái — Canvas Biểu đồ & Bảng tương tác bên phải)**.
- **VERIFY**: Kiểm tra mở/đóng Drawer ở BC Ngày & Tháng, kiểm tra chế độ Expand ở trang Thống kê, chạy `npm run build` và `npm test` đảm bảo 0 lỗi.

---

## 7. Phase X: Verification Checklist
- [x] `npx tsc --noEmit` & `npm run build` pass với 0 lỗi.
- [x] Unit tests (`npm test`) cho `aiQueryEngine` và `aiConfigService` pass 100%.
- [x] Tuân thủ quy tắc thiết kế (không dùng màu tím/violet, bố cục rõ ràng, chuẩn y khoa chuyên nghiệp).
