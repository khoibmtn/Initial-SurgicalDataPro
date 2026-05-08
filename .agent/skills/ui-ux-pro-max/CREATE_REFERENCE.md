# Hướng Dẫn Thiết Lập Agent Environment Cho Dự Án

> **Dành cho AI Agent:** Khi được yêu cầu đọc file này:
> - **Dự án MỚI** (chưa có `.agent/`): Thực hiện Phần A → B → C → D theo thứ tự.
> - **Dự án ĐÃ CÓ** (đã có `.agent/`): Chuyển thẳng đến **Phần E — Quét & Nâng Cấp** để phân tích dự án hiện tại và đề xuất bổ sung skill.

---

## PHẦN A: THU THẬP THÔNG TIN

### A1. Thông tin bắt buộc

Hỏi người dùng TẤT CẢ các thông tin sau trước khi bắt tay vào thiết lập:

| # | Thông tin | Placeholder | Ví dụ |
|---|-----------|-------------|-------|
| 1 | Đường dẫn dự án | `{{PROJECT_DIR}}` | `/Users/buiminhkhoi/Documents/Antigravity/my-app` |
| 2 | Tên dự án | `{{PROJECT_NAME}}` | `My App` |
| 3 | Mô tả ngắn dự án | `{{PROJECT_DESC}}` | `Ứng dụng quản lý bệnh nhân cho phòng khám` |
| 4 | Loại dự án | `{{PROJECT_TYPE}}` | `web` / `mobile` / `fullstack` / `backend-only` |
| 5 | Tech stack | `{{TECH_STACK}}` | `Vite + React + TypeScript` |
| 6 | Cơ sở dữ liệu | `{{DATABASE}}` | `Firestore` / `PostgreSQL` / `MongoDB` / `Không có` |

### A2. Thông tin tùy chọn (hỏi nếu liên quan)

| # | Thông tin | Placeholder | Khi nào hỏi |
|---|-----------|-------------|-------------|
| 7 | URL deploy | `{{DEPLOY_URL}}` | Nếu có hosting |
| 8 | GitHub repo | `{{REPO_URL}}` | Nếu dùng Git |
| 9 | Firebase project | `{{FIREBASE_PROJECT}}` | Nếu dùng Firebase |
| 10 | Design reference | `{{DESIGN_REF}}` | Nếu có link Figma, screenshot, hoặc mô tả UI |
| 11 | Target users | `{{TARGET_USERS}}` | Nếu cần thiết kế UX (VD: "bác sĩ 40-60 tuổi") |

### A3. Phân loại dự án (AI tự xác định)

Dựa trên thông tin thu được, xác định các flag:

| Flag | Điều kiện | Ảnh hưởng |
|------|-----------|-----------|
| `HAS_UI` | `PROJECT_TYPE` ≠ `backend-only` | Bước B3, B4, Phase 2 |
| `HAS_DATABASE` | `DATABASE` ≠ `Không có` | Phase 1 |
| `HAS_FIREBASE` | `FIREBASE_PROJECT` có giá trị | Workflow customization |
| `IS_MOBILE` | `PROJECT_TYPE` = `mobile` hoặc stack có RN/Flutter | Agent routing |

---

## PHẦN B: THIẾT LẬP MÔI TRƯỜNG

### B1. Copy nền tảng Ultra-Tool

```bash
mkdir -p {{PROJECT_DIR}}/.agent
cp -r /Users/buiminhkhoi/Documents/Antigravity/tool/antigravity-kit-main/.agent/* {{PROJECT_DIR}}/.agent/
```

Sau khi copy sẽ có:

```
.agent/
├── ARCHITECTURE.md          ← Kiến trúc agent system
├── mcp_config.json          ← Cấu hình MCP servers
├── agents/                  ← 20 agent chuyên môn
├── rules/GEMINI.md          ← Quy tắc chung cho AI
├── scripts/                 ← 4 scripts kiểm tra
├── skills/                  ← 43 bộ kỹ năng
└── workflows/               ← 11 workflow có sẵn
```

### B2. Thêm Superpowers (quy trình phát triển)

```bash
# Symlink skills
mkdir -p {{PROJECT_DIR}}/.agents/skills
ln -s /Users/buiminhkhoi/Documents/Antigravity/tool/superpowers/skills {{PROJECT_DIR}}/.agents/skills/superpowers

# Copy workflows
mkdir -p {{PROJECT_DIR}}/.agents/workflows
cp /Users/buiminhkhoi/Documents/Antigravity/tool/superpowers/.agents/workflows/superpowers-*.md {{PROJECT_DIR}}/.agents/workflows/
```

Thêm 3 slash commands: `/superpowers-brainstorm`, `/superpowers-plan`, `/superpowers-execute`

### B3. Thêm UI/UX Pro Max (nếu `HAS_UI = true`)

```bash
# Symlink skill
ln -s /Users/buiminhkhoi/Documents/Antigravity/tool/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max {{PROJECT_DIR}}/.agents/skills/ui-ux-pro-max

# Copy workflow
cp /Users/buiminhkhoi/Documents/Antigravity/tool/ui-ux-pro-max-skill/.agents/workflows/ui-ux-pro-max.md {{PROJECT_DIR}}/.agents/workflows/
```

Thêm slash command: `/ui-ux-pro-max`

### B4. Thêm Stitch Skills (nếu `HAS_UI = true`)

```bash
cp -r /Users/buiminhkhoi/Documents/Antigravity/tool/stitch-skills-main/stitch-skills-main/skills/* {{PROJECT_DIR}}/.agent/skills/
```

Thêm 6 skills: `design-md`, `enhance-prompt`, `react-components`, `remotion`, `shadcn-ui`, `stitch-loop`

### B5. Copy và tùy chỉnh Standard Workflows

```bash
cp /Users/buiminhkhoi/Documents/Antigravity/tool/standard-workflows/sync.md \
   /Users/buiminhkhoi/Documents/Antigravity/tool/standard-workflows/save-context.md \
   /Users/buiminhkhoi/Documents/Antigravity/tool/standard-workflows/load-context.md \
   {{PROJECT_DIR}}/.agent/workflows/
```

Thay thế TẤT CẢ placeholders bằng sed:

```bash
cd {{PROJECT_DIR}}/.agent/workflows/
sed -i '' 's|{{PROJECT_DIR}}|<giá_trị>|g' sync.md save-context.md load-context.md
sed -i '' 's|{{DEPLOY_URL}}|<giá_trị>|g' sync.md save-context.md load-context.md
sed -i '' 's|{{FIREBASE_PROJECT}}|<giá_trị>|g' sync.md save-context.md load-context.md
sed -i '' 's|{{PROJECT_NAME}}|<giá_trị>|g' sync.md save-context.md load-context.md
sed -i '' 's|{{TECH_STACK}}|<giá_trị>|g' sync.md save-context.md load-context.md
sed -i '' 's|{{REPO_URL}}|<giá_trị>|g' sync.md save-context.md load-context.md
```

**Tùy chỉnh workflow theo dự án:**

| Workflow | Điều kiện | Cần sửa |
|----------|-----------|---------|
| `/sync` | Không dùng Firebase | Xóa Phase 4 |
| `/sync` | Không dùng Vercel | Sửa Phase 3 — đổi URL health check |
| `/sync` | Ngôn ngữ khác TS | Bỏ step tsc, sửa extensions |
| `/save-context` | Thư mục source khác `src/` | Sửa path scan |
| `/load-context` | Port dev server khác | Sửa port check |

### B6. Copy GEMINI.md vào root

```bash
cp /Users/buiminhkhoi/Documents/Antigravity/tool/antigravity-kit-main/.agent/rules/GEMINI.md {{PROJECT_DIR}}/GEMINI.md
```

---

## PHẦN C: HƯỚNG DẪN PHÁT TRIỂN DỰ ÁN

> Sau khi thiết lập xong môi trường, hướng dẫn người dùng qua từng Phase phát triển. Mỗi Phase sử dụng các skill và workflow đã cài đặt.

### Phase 1: Thiết kế Data Schema (nếu `HAS_DATABASE = true`)

**Mục tiêu:** Xác định cấu trúc dữ liệu trước khi code.

| Bước | Hành động | Skill/Tool sử dụng |
|------|-----------|---------------------|
| 1.1 | Brainstorm các entity chính và quan hệ | `/superpowers-brainstorm` |
| 1.2 | Thiết kế schema chi tiết | Agent: `database-architect` • Skill: `database-design` |
| 1.3 | Validate schema | Script: `schema_validator.py` |

**Câu hỏi gợi ý cho người dùng:**
- Dữ liệu chính cần lưu là gì? (users, products, orders…)
- Quan hệ giữa các entity? (1-N, N-N)
- Cần real-time hay batch read?
- Dữ liệu nào cần index/search?

### Phase 2: Thiết kế UI/UX (nếu `HAS_UI = true`)

**Mục tiêu:** Tạo design system và wireframe trước khi build.

| Bước | Hành động | Skill/Tool sử dụng |
|------|-----------|---------------------|
| 2.1 | Tạo design system (bảng màu, font, style) | `/ui-ux-pro-max "{{PROJECT_DESC}}"` |
| 2.2 | Tạo DESIGN.md cho sản phẩm | Skill: `design-md` (Stitch) |
| 2.3 | Xác định layout, navigation, responsive | Agent: `frontend-specialist` / `mobile-developer` • Skill: `frontend-design` / `mobile-design` |
| 2.4 | Review accessibility & UX | Script: `ux_audit.py`, `accessibility_checker.py` |

**Ví dụ lệnh UI/UX Pro Max:**
```
/ui-ux-pro-max "SaaS healthcare dashboard modern minimal" --design-system -p "{{PROJECT_NAME}}"
```

### Phase 3: Lập kế hoạch triển khai

**Mục tiêu:** Chia nhỏ dự án thành task có thể thực thi.

| Bước | Hành động | Skill/Tool sử dụng |
|------|-----------|---------------------|
| 3.1 | Viết plan chi tiết | `/superpowers-plan` |
| 3.2 | Review kế hoạch | Agent: `project-planner` • Skill: `plan-writing` |
| 3.3 | Xác nhận với người dùng | Cần user approval trước khi code |

### Phase 4: Triển khai code

**Mục tiêu:** Code theo từng batch trong plan.

| Bước | Hành động | Skill/Tool sử dụng |
|------|-----------|---------------------|
| 4.1 | Thực thi plan | `/superpowers-execute` |
| 4.2 | Code theo clean-code rules | Skill: `clean-code` (auto-applied) |
| 4.3 | Test-Driven Development | Skill: `testing-patterns`, `tdd-workflow` |
| 4.4 | Code review | Skill: `code-review-checklist` |

**Agent tự động kích hoạt theo ngữ cảnh:**

| Loại công việc | Agent | Skill chính |
|----------------|-------|-------------|
| Frontend/UI | `frontend-specialist` | `frontend-design`, `tailwind-patterns`, `nextjs-react-expert` |
| Mobile | `mobile-developer` | `mobile-design` |
| Backend/API | `backend-specialist` | `api-patterns`, `nodejs-best-practices` |
| Database | `database-architect` | `database-design` |
| Security | `security-auditor` | `vulnerability-scanner`, `red-team-tactics` |

### Phase 5: Kiểm tra & Deploy

| Bước | Hành động | Skill/Tool sử dụng |
|------|-----------|---------------------|
| 5.1 | Chạy test suite | `/test` |
| 5.2 | Security scan | Script: `security_scan.py` |
| 5.3 | Performance audit | Script: `lighthouse_audit.py`, `bundle_analyzer.py` |
| 5.4 | SEO check (nếu web) | Script: `seo_checker.py` |
| 5.5 | Deploy | `/deploy` hoặc `/sync` |

---

## PHẦN D: XÁC NHẬN

Trình bày tóm tắt sau khi hoàn thành:

```markdown
## ✅ Agent Environment đã thiết lập cho {{PROJECT_NAME}}

### Đã cài đặt:
- 📋 **20 agents** chuyên môn
- 🧠 **43+ skills** nền tảng (Ultra-Tool)
- 🎨 **6 Stitch skills** cho UI (nếu có)
- 🎯 **UI/UX Pro Max** — 50+ style, 161 bảng màu, 57 font
- 🚀 **Superpowers** — quy trình brainstorm → plan → execute
- ⚡ **17 workflows** sẵn sàng

### Slash Commands chính:
| Lệnh | Mục đích |
|-------|----------|
| `/load-context` | Bắt đầu phiên làm việc |
| `/save-context` | Lưu và kết thúc phiên |
| `/superpowers-brainstorm` | Brainstorm ý tưởng |
| `/superpowers-plan` | Lập kế hoạch |
| `/superpowers-execute` | Thực thi kế hoạch |
| `/ui-ux-pro-max` | Thiết kế UI/UX |
| `/sync` | Check + commit + deploy |
| `/deploy` | Triển khai production |
| `/debug` | Gỡ lỗi có hệ thống |
| `/test` | Chạy test |

### Quy trình đề xuất:
1. **Phase 1:** Thiết kế Data Schema → `/superpowers-brainstorm`
2. **Phase 2:** Thiết kế UI/UX → `/ui-ux-pro-max`
3. **Phase 3:** Lập kế hoạch → `/superpowers-plan`
4. **Phase 4:** Code → `/superpowers-execute`
5. **Phase 5:** Test & Deploy → `/test` → `/sync`

### 🎯 Sẵn sàng! Chạy `/load-context` để bắt đầu, hoặc nhảy thẳng vào Phase 1.
```

---

## PHẦN E: QUÉT & NÂNG CẤP (cho dự án đã có)

> **Khi nào dùng:** Khi dự án đã được thiết lập (đã có `.agent/`) và người dùng muốn bổ sung chức năng mới, yêu cầu chạy lại file này.

### E1. Quét dự án hiện tại

AI tự động thực hiện:

```
1. Đọc cấu trúc thư mục dự án (list_dir, find)
2. Đọc package.json / requirements.txt / pubspec.yaml (nếu có)
3. Đọc CODEBASE.md / ARCHITECTURE.md (nếu có)
4. Quét các file source chính để xác định domain
5. Liệt kê skills đã cài (ls .agent/skills/ và .agents/skills/)
```

### E2. Phân tích domain & đề xuất skill

Dựa trên kết quả quét, AI đối chiếu với bảng sau và đề xuất skill CHƯA được cài:

| Phát hiện trong code | Skill đề xuất | Nguồn |
|---------------------|---------------|-------|
| React/Next.js/Vue | `nextjs-react-expert`, `react-components` | Ultra-Tool, Stitch |
| Tailwind CSS | `tailwind-patterns` | Ultra-Tool |
| shadcn/ui | `shadcn-ui` | Stitch |
| Mobile (RN/Flutter/SwiftUI) | `mobile-design` | Ultra-Tool |
| REST API / GraphQL | `api-patterns` | Ultra-Tool |
| Node.js backend | `nodejs-best-practices` | Ultra-Tool |
| Python backend | `python-patterns` | Ultra-Tool |
| Rust | `rust-pro` | Ultra-Tool |
| Database (SQL/NoSQL) | `database-design` | Ultra-Tool |
| Auth / Security logic | `vulnerability-scanner`, `red-team-tactics` | Ultra-Tool |
| i18n / đa ngôn ngữ | `i18n-localization` | Ultra-Tool |
| Map / Geolocation | `geo-fundamentals` | Ultra-Tool |
| SEO meta tags | `seo-fundamentals` | Ultra-Tool |
| Animation / Video | `remotion` | Stitch |
| Game logic | `game-development` | Ultra-Tool |
| CI/CD / Docker | `deployment-procedures` | Ultra-Tool |
| Server management | `server-management` | Ultra-Tool |
| UI nhưng chưa có design system | `ui-ux-pro-max`, `design-md`, `enhance-prompt` | UI/UX Pro Max, Stitch |
| Chưa có quy trình dev | `superpowers` (brainstorm/plan/execute) | Superpowers |
| Test files nhưng thiếu pattern | `testing-patterns`, `tdd-workflow`, `webapp-testing` | Ultra-Tool |
| MCP server code | `mcp-builder` | Ultra-Tool |
| Parallel processing | `parallel-agents` | Ultra-Tool |

### E3. Trình bày đề xuất cho người dùng

Hiển thị theo format:

```markdown
## 🔍 Kết quả quét dự án {{PROJECT_NAME}}

### Skills đã cài:
✅ clean-code, brainstorming, frontend-design, ...

### Đề xuất bổ sung:

| # | Skill | Lý do | Nguồn |
|---|-------|-------|-------|
| 1 | `i18n-localization` | Phát hiện multi-language strings trong code | Ultra-Tool |
| 2 | `api-patterns` | Có thư mục `api/` với REST endpoints | Ultra-Tool |
| 3 | `ui-ux-pro-max` | Có UI nhưng chưa có design system | UI/UX Pro Max |

### Chọn số thứ tự để cài (VD: "1, 3") hoặc "all" để cài tất cả:
```

### E4. Cài đặt skill được chọn

Sau khi người dùng chọn, AI thực hiện copy/symlink tương ứng:

```bash
# Ví dụ: cài i18n-localization từ Ultra-Tool
cp -r /Users/buiminhkhoi/Documents/Antigravity/tool/antigravity-kit-main/.agent/skills/i18n-localization {{PROJECT_DIR}}/.agent/skills/

# Ví dụ: cài ui-ux-pro-max
ln -s /Users/buiminhkhoi/Documents/Antigravity/tool/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max {{PROJECT_DIR}}/.agents/skills/ui-ux-pro-max
cp /Users/buiminhkhoi/Documents/Antigravity/tool/ui-ux-pro-max-skill/.agents/workflows/ui-ux-pro-max.md {{PROJECT_DIR}}/.agents/workflows/

# Ví dụ: cài superpowers
ln -s /Users/buiminhkhoi/Documents/Antigravity/tool/superpowers/skills {{PROJECT_DIR}}/.agents/skills/superpowers
cp /Users/buiminhkhoi/Documents/Antigravity/tool/superpowers/.agents/workflows/superpowers-*.md {{PROJECT_DIR}}/.agents/workflows/
```

### E5. Xác nhận kết quả

```markdown
## ✅ Nâng cấp hoàn tất

### Đã bổ sung:
- 🧠 **X skills** mới
- ⚡ **Y workflows** mới (nếu có)

### Tổng hiện tại:
- Skills: N
- Workflows: M
- Agents: 20

### Tiếp tục phát triển với các skill mới!
```

---

## Nguồn dữ liệu

| Thư mục | Nội dung |
|---------|----------|
| `.../tool/antigravity-kit-main/.agent/` | Agents, skills, workflows, scripts, rules (nền tảng) |
| `.../tool/superpowers/` | Quy trình brainstorm → plan → execute |
| `.../tool/ui-ux-pro-max-skill/` | Design intelligence (50+ style, 161 palettes) |
| `.../tool/stitch-skills-main/.../skills/` | Stitch UI skills (design-md, shadcn-ui...) |
| `.../tool/standard-workflows/` | /sync, /save-context, /load-context templates |
