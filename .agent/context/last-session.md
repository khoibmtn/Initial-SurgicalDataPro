# Báo Cáo Lưu Trữ Ngữ Cảnh Phiên Làm Việc (Last Session Context)

> **Thời gian cập nhật:** 21/10/2026 08:52 (Giờ địa phương GMT+7)  
> **Nhánh Git hiện tại:** `main` & `temp-19-10-2026-14h20` (đã đồng bộ & push lên `origin`)  
> **Remote:** `origin/main` & `origin/temp-19-10-2026-14h20` đã đồng bộ lên GitHub  
> **Production URL (Vercel):** https://initial-surgical-data-pro.vercel.app  
> **Deployment URL mới nhất:** https://initial-surgical-data-6s419rkb2-khois-projects-73d0737a.vercel.app  
> **Local Dev Port:** `http://localhost:3002` (Vite dev server)  
> **Trạng thái Build:** `Thành công 100% (Vite v6.4.1 - 0 lỗi build)`  
> **Trạng thái Test:** `444 / 444 tests PASS` (35 test suites, 100% pass)  

---

## 📌 1. Các Tính Năng & Nâng Cấp Trọng Điểm Đã Hoàn Thành

### 1.0. Bổ Sung Schema Nghiệp Vụ Chấm Công Ngoài Giờ / Xung Đột Cho AI & Giao Diện Quản Lý Mô Hình AI Chuẩn Ứng Dụng MCQ (21/10/2026)
- **A1 — Bổ sung Công cụ Tính & Tra cứu Chấm công Ngoài giờ (`executeOvertimeAnalysisTool`) và Đối soát Xung đột (`executeConflictAndQualityTool`) (`services/ai/aiQueryEngine.ts`, `services/ai/aiSemanticSchema.ts`):**
  1. Gọi trực tiếp hàm nghiệp vụ lõi `calculateOvertimeRows` và `groupOvertimeDataForReport` của tab **Ngoài giờ**, tự động đối chiếu **Lịch trực 24h** của ngày mở ca `T` và ngày `T-1`, loại trừ nhân sự thuộc tua trực 24h và phân loại rõ **Kíp mổ phiên (lố giờ)** vs **Kíp tăng cường**.
  2. Khắc phục triệt để lỗi nhân đôi bản ghi (ví dụ 5 ca thành 10 ca) bằng `deduplicateSurgeryRecords` + `ensureHydratedSurgeryRecord` và bảo toàn trọn vẹn ca trực 24h đang mở trên Báo cáo hàng ngày khi người dùng hỏi *"trong danh sách các ca mổ hôm qua / đang mở..."*.
  3. Gọi trực tiếp `reprocessSurgicalRecords` trong `executeConflictAndQualityTool` để trả lời chính xác về **Trùng NV**, **Trùng máy**, **Thiếu mã máy**, **Chưa gán GV**, **Lỗi định mức thời gian**, **TT <100%** và **Tổng phụ cấp PTTT theo từng nhân viên**.
  4. Tự động đính kèm `buildDirectTableSnapshotForLLM` khi số ca $\le 60$ để AI đọc trực tiếp từng dòng dữ liệu đang hiển thị trên bảng.
- **A2 — Thiết kế lại Giao diện Quản lý & Khai báo Mô hình AI theo mẫu Ứng dụng MCQ (`components/config/AIConfigPanel.tsx`, `services/ai/aiConfigService.ts`, `services/ai/aiProviderClient.ts`, `types/ai.ts`):**
  1. Header `🤖 Quản lý & Khai báo các mô hình AI` kèm nút `+ Thêm mô hình mới` và thanh thêm nhanh theo hãng (`+ Google Gemini`, `+ OpenAI`, `+ Anthropic Claude`, `+ DeepSeek`).
  2. Form `+ Khai báo mô hình AI mới` hỗ trợ chọn Provider, chọn Model có sẵn hoặc nhấn **`☁️ Tải danh sách model từ API`** (`fetchModelsFromProviderAPI`), nhập API Key ẩn/hiện, Base URL kèm nút `Mặc định`, `Temperature`, `Max Tokens`, checkbox `Hỗ trợ ảnh (OCR)` và nút `Test mô hình` / `Lưu & Kích hoạt`.
  3. Danh sách Thẻ Mô hình (`declaredModels`) hiển thị badge hãng, tên model, `modelId`, nhãn `📷 Vision/OCR & Text`, `★ Mặc định chính`, API Key ẩn (`maskApiKeyPreview`), trạng thái `Đã kết nối`, banner kết quả kiểm thử và cụm nút `● Đang Active`, `Đặt mặc định`, `✓ Test`, `⚙️ Cấu hình ⌄`.

### 1.1. Hợp Nhất Duy Nhất 1 Popup Trợ Lý AI Phân Tích Toàn Hệ Thống, Hỏi Lại Nguồn Dữ Liệu & Trích Dẫn Nguồn `DD/MM/YYYY` (20/10/2026 - Commit `66a87ed`)
- **A1 — Hợp nhất duy nhất 1 Popup AI + Messenger Floating Bubble toàn hệ thống (`App.tsx`, `AIStorageDrawer.tsx`, `StatisticsTab.tsx`, `StorageQueryBar.tsx`):**
  1. Gỡ bỏ hoàn toàn các instance `<AIStorageDrawer />` rời rạc theo từng tab và sub-tab `'ai_studio'` trùng lặp trong `StatisticsTab.tsx`.
  2. Sử dụng **duy nhất 1 instance `<AIStorageDrawer slotId="statistics_studio" />`** ở cấp `App.tsx`, giữ nguyên lịch sử trò chuyện và trạng thái thu nhỏ dạng bong bóng Messenger (`bottom-5 right-5`) khi chuyển qua lại giữa mọi tab (`BC hàng ngày`, `BC tháng`, `Lịch mổ`, `Thống kê`).
  3. Tại trang **Thống kê** (`StatisticsTab.tsx`) và thanh **Truy vấn lưu trữ** (`StorageQueryBar.tsx`), nút **`"Trợ lý AI Phân tích"`** mở trực tiếp Popup AI hợp nhất (mặc định mở rộng chế độ Studio 2 cột `defaultExpanded = true` khi mở từ trang Thống kê).
  4. Tự động đồng bộ dữ liệu đang mở ở `BC ngày` (`dailyOpenedRecords`), `BC tháng` (`monthlyOpenedRecords`) và `Thống kê` (`statsContextState`) vào Popup AI hợp nhất.
- **A2 — Nhận diện nguồn dữ liệu thông minh, Cơ chế Hỏi lại (Clarification Gate) & Trích dẫn nguồn bắt buộc (`aiQueryEngine.ts`, `aiSemanticSchema.ts`, `AIChatWorkspace.tsx`, `types/ai.ts`):**
  1. **Trích xuất thời gian & nguồn dữ liệu (`extractTimeConstraintsFromPrompt`):** Tự động nhận diện ngày cụ thể (`DD/MM/YYYY`, *"hôm nay"*, *"hôm qua"*), tháng (`tháng X/YYYY`), quý (`quý X`), năm (`2025`, `2026`), khoảng đầu/cuối năm (*"9 tháng đầu năm 2026 so với 2025"*) và nguồn chỉ định (*"báo cáo ngày"*, *"báo cáo tháng"*, *"đang mở"*).
  2. **Tự động nạp dữ liệu phù hợp (`ensureSurgeryRecordsForQuery`):** Lấy từ dữ liệu đang mở trên màn hình hoặc tự động truy vấn Firestore (`processed_records`, `duty_schedules`, `service_package_assignments`) theo đúng khoảng thời gian yêu cầu.
  3. **Clarification Gate (0ms, không tốn lượt gọi LLM):** Khi tab hiện tại chưa mở dữ liệu (`0 ca`) và câu hỏi của người dùng chưa nêu rõ thời gian/nguồn số liệu, AI lập tức trả về `needsClarification: true` kèm các **nút chọn nhanh 1-click (`clarificationOptions`)** để người dùng chọn nguồn dữ liệu mong muốn.
  4. **Trích dẫn nguồn bắt buộc (`dataSourceCitation`):** Hiển thị badge **`📌 Nguồn số liệu:`** nổi bật ở đầu mỗi câu trả lời của AI và yêu cầu AI mở đầu câu trả lời bằng nguồn dữ liệu + khoảng ngày `DD/MM/YYYY` chính xác (kèm số lượng ca của từng kỳ khi so sánh cùng kỳ YoY).
- **A3 — Tinh gọn Cấu hình AI Mặc định (`AIConfigPanel.tsx`):**
  - Rút gọn Phần 2 trong `Cấu hình -> Cấu hình AI` thành **1 khung cấu hình mặc định duy nhất** (*"2. Cấu hình Mặc định cho Trợ lý AI Phân tích Toàn hệ thống"*), đồng bộ cho toàn ứng dụng và vẫn cho phép đổi nhanh Mô hình + Mức độ suy luận (`Effort`) ngay trên thanh tiêu đề Popup AI.

---

### 1.2. Hệ Thống Trợ Lý AI Đa Mô Hình, Phân Quyền RBAC, Bong Bóng Messenger & Chuẩn Hóa So Sánh Cùng Kỳ YoY (20/10/2026 - Commits `37229a7`, `ccc46d3`)
- **Đa nhà cung cấp LLM (`aiConfigService.ts`, `aiProviderClient.ts`):**
  - Hỗ trợ **Google Gemini** (`gemini-2.5-pro`, `gemini-2.5-flash`...), **OpenAI** (`gpt-4.1`, `o3-mini`...), **Anthropic Claude** (`claude-sonnet-4-20250514`...) và **DeepSeek** (`deepseek-chat`, `deepseek-reasoner`) kèm Base URL tùy chỉnh, kiểm tra kết nối trực tiếp, điều chỉnh `Temperature`, `Reasoning Effort` (`low`/`medium`/`high`) và `Max Output Tokens`.
- **Phân quyền RBAC cho tính năng AI (`permissionService.ts`, `PermissionMatrixSubTab.tsx`, `usePermissions.ts`):**
  - Bổ sung quyền `use_ai_assistant` (*"Sử dụng Trợ lý AI Phân tích"*), mặc định chỉ bật cho vai trò **Trưởng khoa (`department_head`)** và Admin.
- **Hiển thị trực quan & Xuất dữ liệu (`AIArtifactRenderer.tsx`, `AIChatWorkspace.tsx`):**
  - Render bảng Markdown GFM chuẩn xác trong câu trả lời và hiển thị các Artifact tương tác (**Bảng dữ liệu có tìm kiếm/sắp xếp**, **Biểu đồ tương tác Recharts** Bar/Line/Area/Pie/Composed kèm Brush kéo chọn khoảng, **Thẻ KPI**), hỗ trợ xuất trực tiếp ra **Excel (`.xlsx`)** và **Ảnh (`.png`)**.
- **Độ chính xác số liệu & Prompt kỷ luật cao (`aiQueryEngine.ts`, `aiSemanticSchema.ts`):**
  - Phân loại chuyên khoa dựa trên danh mục chuẩn `surgeryCategories` (với fallback từ khóa ICD/PPPT) và chỉ trả lời đúng trọng tâm câu hỏi của người dùng, tuyệt đối không tự ý suy diễn thêm phần tích PTV hay mùa vụ khi không được hỏi.

---

### 1.3. Tinh Gọn UX Popup Ca Mổ, Lưu Trữ Trạng Thái Lịch Mổ & Thanh Chọn Ngày Trên Mobile (20/10/2026 - Commit `b5f69f8`)
- Chống đóng popup khi click nhầm ra ngoài backdrop, tối giản nút Khóa/Mở khóa ca mổ, đánh dấu sao đỏ `*` cho 5 trường bắt buộc, hiển thị tooltip cảnh báo trường thiếu và lưu trữ toàn bộ trạng thái hiển thị trang Lịch mổ vào `localStorage` + `sessionStorage`.

---

## 📐 2. Cấu Trúc Dữ Liệu & Hàm Xử Lý Trọng Điểm Của Hệ Thống AI

### 2.1. Cấu Trúc Tin Nhắn & Lựa Chọn Làm Rõ Nguồn Dữ Liệu (`types/ai.ts`)
```typescript
export interface AIClarificationOption {
  label: string;
  prompt: string;
  description?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  providerId?: AIProviderId;
  modelId?: string;
  effort?: AIReasoningEffort;
  artifacts?: AIArtifact[];
  querySummary?: string;
  dataSourceCitation?: string;
  clarificationOptions?: AIClarificationOption[];
  isError?: boolean;
}
```

### 2.2. Pipeline Truy Vấn Liên Kết & Clarification Gate (`services/ai/aiQueryEngine.ts`)
- `extractTimeConstraintsFromPrompt(prompt)`: Bóc tách `years`, `months`, `quarters`, `firstNMonths`, `lastNMonths`, `specificDates`, `explicitSource` và cờ `hasExplicitTimeOrSource`.
- `ensureSurgeryRecordsForQuery(context, prompt)`: Tự động quyết định lấy dữ liệu đang mở hay tải từ Firestore (`loadMonthlyRecordsByYear` / `queryRecordsByDateRange`) và sinh chuỗi `dataSourceCitation` chuẩn `DD/MM/YYYY`.
- `runRelationalQueryPipeline(prompt, context)`:
  - Nếu `baseRecords.length === 0 && !timeConstraints.hasExplicitTimeOrSource`: Trả về ngay `needsClarification: true` kèm `clarificationOptions`.
  - Nếu đủ ngữ cảnh: Tính toán chính xác `specialtyYoYComparison`, `monthlyTrend`, `crossTabStaffMonth`, `staffShiftCrossAnalysis`, `packageUsageSummary` và đóng gói vào `AISemanticContextSummary`.

---

## 📂 3. Lịch Sử Commit Gần Nhất (`temp-19-10-2026-14h20`)
1. `66a87ed` — `feat(ai): unify global AI assistant popup, add data source clarification gate and DD/MM/YYYY citation` (10 files changed)
2. `ccc46d3` — `feat(ai): add RBAC permissions, persist chat history, Messenger minimize bubble, GFM table renderer, and accurate YoY specialty comparison`
3. `37229a7` — `feat(ai): add multi-provider AI analytics studio, relational query engine, and storage assistant drawers`
4. `b5f69f8` — `feat(schedule): refine surgery modal UX, persist view settings and show mobile date controls`
5. `eb45f89` — `style(ui): unify action button backgrounds to navy blue (primary-700) across app`

---

## 🚀 4. Trạng Thái Triển Khai & Kiểm Thử
- **Git Branch:** `temp-19-10-2026-14h20` (đã push đầy đủ lên `origin/temp-19-10-2026-14h20`).
- **Vercel Production:** Đã deploy thành công lên `https://initial-surgical-data-pro.vercel.app`.
- **Build & Test:** `npm run build` (`vite v6.4.1`) & `npm test` (`442 / 442 tests PASS` trên 35 test suites) hoàn tất 100% không có lỗi.
