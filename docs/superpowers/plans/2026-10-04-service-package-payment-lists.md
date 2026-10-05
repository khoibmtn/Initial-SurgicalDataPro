# Danh sách thanh toán Gói dịch vụ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép import danh sách TCKT (mã KCB-họ tên), đối soát với gói đã gán / dữ liệu phẫu thuật, quản lý theo đợt thanh toán (chốt/mở khóa, chuyển ca), và theo dõi ca đã gán gói mà chưa thanh toán — chỉ ở BC tháng.

**Spec:** `docs/superpowers/specs/2026-10-04-service-package-payment-lists-design.md`

**Architecture:** Logic thuần (parser, đối soát, tính "chưa thanh toán") tách khỏi UI và test bằng vitest. Lưu Firestore collection `payment_lists`, mỗi danh sách là **1 document chứa mảng `items`** (số ca nhỏ, không cần subcollection/index; mọi thay đổi dùng `runTransaction` để an toàn khi nhiều người sửa và để chuyển ca giữa 2 danh sách nguyên tử). UI tái sử dụng tab **Thanh toán › Gói dịch vụ** và tab **Gói DV**, chỉ thêm 1 modal quản lý; gated bằng `currentType === 'monthly'`.

**Tech Stack:** React + TypeScript, Firestore (`firebase/firestore`), `xlsx` (đã có), vitest, lucide-react, Tailwind.

> Quy ước repo: test ở `__tests__/*.test.ts`, chạy `npx vitest run`; kiểm tra kiểu `npx tsc --noEmit` (repo đang có sẵn nhiều lỗi kiểu trong `__tests__` và `App.tsx` — chỉ cần không **thêm** lỗi mới ở file đã sửa: `npx tsc --noEmit 2>&1 | grep -E "<tên file>"`).

---

## Phát hiện quan trọng từ khảo sát code (ảnh hưởng thiết kế)

1. [App.tsx:240-249](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/App.tsx#L240-L249): `packageAssignments` **bị lọc theo khoảng ngày báo cáo** (`subscribeToAssignments(dateFrom, dateTo)`). Ca mổ 30/8 thanh toán 2/9 sẽ **không** có trong BC tháng 9 ⇒ khi dùng danh sách thanh toán phải dùng **toàn bộ gói đã gán** (`subscribeToAllAssignments` đã có sẵn trong [servicePackageService.ts](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/services/servicePackageService.ts#L214), listener này cũng đã quét cả collection nên không tốn thêm đọc đáng kể).
2. Dữ liệu phẫu thuật đã lưu của tháng khác tra được bằng `reportService.getReports(dateFrom, dateTo, 'MONTHLY'|'DAILY')` (collection-group, **đã có index** `type + ngayBD`). Không tra theo `patientId` (cần index mới) — thay vào đó tải cửa sổ ngày `[đầu tháng trước, cuối kỳ]` rồi lọc client.
3. Khóa BC tháng hiện có: `canManageLock` ([App.tsx:308](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/App.tsx#L308)) = admin hoặc `can('lock_report')` (trưởng khoa). Dùng lại làm quyền **chốt/mở khóa danh sách thanh toán** (không dùng `report_locks` — đó là khóa kỳ báo cáo, khác khái niệm).
4. Rules Firestore của gói dịch vụ đang `allow read, write: if true` ([firestore.rules:81-93](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/firestore.rules#L81-L93)) → thêm `payment_lists` cùng kiểu; ràng buộc "danh sách đã chốt không sửa" được **bắt trong transaction của service**, không dựa vào rules.
5. Ràng buộc "mỗi ca chỉ 1 danh sách": số danh sách nhỏ (~12/năm) ⇒ subscribe toàn bộ `payment_lists` và tính chỉ mục `patientId → listId` ở client, không cần index.

**Định nghĩa "chưa thanh toán" (user đã chốt):** mọi ca **có gán gói** mà **chưa nằm trong danh sách đã chốt nào** (không giới hạn khoảng ngày). Ca đang nằm trong danh sách *nháp* vẫn tính là chưa thanh toán nhưng được gắn nhãn "đang trong DS nháp X". Số này thực tế không nhiều nên tra cứu được; sau đó dùng **mã KCB của chính tập này** tra BigQuery (cpbq) để biết đã ra viện/thanh toán chưa (Task 10).

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `types/paymentList.ts` (tạo) | Kiểu `PaymentList`, `PaymentListItem`, `MatchStatus`, `ParsedEntry` |
| `services/paymentListParser.ts` (tạo) | Parse text/Excel `mã KCB-HỌ TÊN` → `ParsedEntry[]` |
| `services/paymentListReconcile.ts` (tạo) | Đối soát entry ↔ gói đã gán/bản ghi PT; chỉ mục 1-danh-sách; tính "chưa thanh toán"; chuẩn hóa tên |
| `services/paymentListService.ts` (tạo) | Firestore CRUD + transaction: tạo/đổi tên/xóa, thêm/bớt/chuyển ca, chốt/mở khóa |
| `hooks/usePaymentLists.ts` (tạo) | Subscribe `payment_lists` + tất cả gói đã gán + tra bản ghi tháng khác |
| `components/surgery/PaymentListSelector.tsx` (tạo) | Bộ chọn danh sách + nút "Quản lý danh sách" (thanh công cụ Thanh toán › Gói DV) |
| `components/surgery/PaymentListManagerModal.tsx` (tạo) | Modal import / xem trước đối soát / bảng ca / chuyển, xóa / chốt |
| `components/surgery/PackageListView.tsx` (sửa) | Cột "Thanh toán", bộ lọc, thao tác từng dòng |
| `components/surgery/SurgeryTableViewRouter.tsx` (sửa) | Chọn danh sách → lọc assignments cho `PackagePaymentTable`; truyền props |
| `App.tsx` (sửa) | Nối hook, truyền props, gate `monthly`, quyền |
| `firestore.rules` (sửa) | Thêm `payment_lists` |
| `__tests__/paymentListParser.test.ts`, `paymentListReconcile.test.ts`, `paymentListService.test.ts` (tạo) | Test logic thuần + guard khóa |

---

### Task 1: Kiểu dữ liệu

**Files:**
- Create: `types/paymentList.ts`

- [ ] **Step 1: Tạo file kiểu**

```ts
export type MatchStatus = 'assigned' | 'pending' | 'notFound' | 'nameMismatch';

/** Một dòng đọc được từ danh sách TCKT */
export interface ParsedEntry {
  patientId: string;
  patientName: string;
}

export interface PaymentListItem {
  patientId: string;
  patientName: string;          // tên theo danh sách TCKT
  note?: string;
  addedManually?: boolean;
  /** user đã xác nhận giữ ca dù lệch họ tên */
  nameConfirmed?: boolean;
  addedAt: number;
}

export interface PaymentList {
  id: string;
  name: string;                 // vd "Thanh toán DV chọn BS tháng 7/2026"
  periodKey: string;            // YYYY-MM, chỉ để lọc/hiển thị
  status: 'draft' | 'locked';
  items: PaymentListItem[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  lockedBy?: string;
  lockedAt?: number;
}

/** Item kèm trạng thái đối soát (tính ở client, không lưu) */
export interface ReconciledItem extends PaymentListItem {
  status: MatchStatus;
  assignmentIds: string[];      // gói đã gán của bệnh nhân (thường 1)
  recordName?: string;          // tên trong dữ liệu PT/gói, để so sánh khi lệch
}
```

- [ ] **Step 2: Commit**

```bash
git add types/paymentList.ts && git commit -m "feat(payment-list): add types"
```

---

### Task 2: Parser danh sách TCKT (TDD)

**Files:**
- Create: `services/paymentListParser.ts`
- Test: `__tests__/paymentListParser.test.ts`

Quy tắc: mỗi dòng/ô khớp `^\s*(?:\d+\s+)?(\d{6,})\s*[-–—]\s*(.+?)\s*$`; bỏ dòng tiêu đề khoa ("Khoa Sản"), dòng số liệu, dòng không khớp; khử trùng theo `patientId` (giữ lần đầu); trả thêm `skipped` để báo user.

- [ ] **Step 1: Viết test (fail)**

```ts
import { describe, it, expect } from 'vitest';
import { parsePaymentListText } from '../services/paymentListParser';

describe('parsePaymentListText', () => {
  it('parses "mã-HỌ TÊN" lines and ignores headers/numbers', () => {
    const text = [
      'Khoa Sản\t46,000,000',
      '1\t2600089966-MÙA THỊ TÁO\t2,000,000',
      '2600089969-LÔ THỊ HỒNG ANH',
      'Khoa Ngoại tổng hợp',
      '  2600084085 – VŨ THỊ NGUYÊN  ',
    ].join('\n');
    const { entries, skipped } = parsePaymentListText(text);
    expect(entries).toEqual([
      { patientId: '2600089966', patientName: 'MÙA THỊ TÁO' },
      { patientId: '2600089969', patientName: 'LÔ THỊ HỒNG ANH' },
      { patientId: '2600084085', patientName: 'VŨ THỊ NGUYÊN' },
    ]);
    expect(skipped).toBe(2);
  });

  it('deduplicates by patientId keeping the first', () => {
    const { entries } = parsePaymentListText('2600089966-A\n2600089966-B');
    expect(entries).toHaveLength(1);
    expect(entries[0].patientName).toBe('A');
  });
});
```

- [ ] **Step 2:** `npx vitest run __tests__/paymentListParser.test.ts` → FAIL (module not found)
- [ ] **Step 3: Cài đặt**

```ts
import * as XLSX from 'xlsx';
import { ParsedEntry } from '../types/paymentList';

const LINE_RE = /(?:^|[\s\t])(\d{6,})\s*[-–—]\s*([^\t\n]+?)\s*(?=\t|$)/u;

export interface ParseResult {
  entries: ParsedEntry[];
  /** số dòng không rỗng nhưng không đọc được (tiêu đề khoa, tổng, ...) */
  skipped: number;
}

function collect(lines: string[]): ParseResult {
  const seen = new Set<string>();
  const entries: ParsedEntry[] = [];
  let skipped = 0;
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) { skipped++; continue; }
    const patientId = m[1];
    if (seen.has(patientId)) continue;
    seen.add(patientId);
    entries.push({ patientId, patientName: m[2].trim() });
  }
  return { entries, skipped };
}

export function parsePaymentListText(text: string): ParseResult {
  return collect(text.split(/\r?\n/));
}

/** Đọc mọi sheet; mỗi hàng nối các ô bằng tab rồi dùng cùng parser. */
export async function parsePaymentListFile(file: File): Promise<ParseResult> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const lines: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    for (const row of rows) lines.push(row.map(c => String(c ?? '')).join('\t'));
  }
  return collect(lines);
}
```

- [ ] **Step 4:** chạy lại test → PASS (kiểm tra dòng `1\t2600089966-...` khớp nhờ `(?:^|[\s\t])`)
- [ ] **Step 5: Commit** `feat(payment-list): TCKT list parser`

---

### Task 3: Đối soát & chỉ mục (TDD)

**Files:**
- Create: `services/paymentListReconcile.ts`
- Test: `__tests__/paymentListReconcile.test.ts`

Hàm (đều thuần):
- `normalizeName(s)`: NFC, bỏ dấu, hạ chữ thường, gộp khoảng trắng — dùng so tên.
- `buildMembershipIndex(lists)` → `Map<patientId, {listId, listName, status}>`.
- `reconcileItems(items, ctx)` với `ctx = { assignments, records }` (`records`: `{patientId, patientName}[]` từ báo cáo đang mở + tháng khác) → `ReconciledItem[]`:
  - có gói đã gán cho `patientId` → `assigned` (nếu tên lệch & chưa `nameConfirmed` → `nameMismatch`)
  - không có gói nhưng có bản ghi PT → `pending` (lệch tên tương tự → `nameMismatch`)
  - không có cả hai → `notFound`
- `canLock(items)` → `false` nếu còn `nameMismatch` chưa xác nhận.
- `findConflicts(entries, index, currentListId?)` → các entry đang nằm ở danh sách khác.
- `findUnpaid(assignments, lists)` → gói đã gán mà `patientId` **không nằm trong danh sách `locked` nào** (không lọc ngày); mỗi phần tử kèm `inDraftList?: {id, name}`.

- [ ] **Step 1: Test (fail)** — bao phủ: assigned / pending / notFound / nameMismatch (+`nameConfirmed` → quay về assigned/pending), tên khác dấu vẫn khớp, `canLock`, `findConflicts` (khác danh sách, trừ chính nó), `findUnpaid` (loại ca đã ở danh sách, loại ngoài khoảng ngày). Ví dụ mẫu:

```ts
const assignment = (patientId: string, patientName: string, ngayBD = '2026-08-30T08:00:00') =>
  ({ id: `a-${patientId}`, patientId, patientName, ngayBD } as any);

it('marks nameMismatch until confirmed', () => {
  const ctx = { assignments: [assignment('1', 'NGUYEN THI A')], records: [] };
  const item = { patientId: '1', patientName: 'TRAN THI B', addedAt: 0 };
  expect(reconcileItems([item], ctx)[0].status).toBe('nameMismatch');
  expect(reconcileItems([{ ...item, nameConfirmed: true }], ctx)[0].status).toBe('assigned');
});
```

- [ ] **Step 2:** chạy → FAIL
- [ ] **Step 3: Cài đặt** đầy đủ các hàm trên (dùng `normalizeName` cho mọi so sánh tên; `patientId` so sánh sau `trim`).
- [ ] **Step 4:** chạy → PASS
- [ ] **Step 5: Commit** `feat(payment-list): reconciliation logic`

---

### Task 4: Service Firestore + guard khóa (TDD phần guard)

**Files:**
- Create: `services/paymentListService.ts`
- Test: `__tests__/paymentListService.test.ts` (chỉ test các hàm **thuần** `applyAddItems / applyRemoveItem / assertEditable` — không gọi Firestore)
- Modify: `firestore.rules` (thêm sau khối `service_package_module_config`)

```
match /payment_lists/{listId} {
  allow read, write: if true;
}
```

Thiết kế service:
- `subscribeToPaymentLists(cb)` — `onSnapshot` toàn collection, sắp xếp `createdAt` giảm dần.
- `createPaymentList({name, periodKey, items, createdBy})` — **kiểm tra trước** (trong `runTransaction`, đọc toàn bộ `payment_lists`) không có `patientId` nào đã ở danh sách khác; nếu có → throw `PaymentListConflictError(conflicts)` để UI hiện "đã nằm ở danh sách X, chuyển?".
- `addItems(listId, items)`, `updateItem(listId, patientId, patch)`, `removeItem(listId, patientId)`, `renameList`, `deletePaymentList` (chỉ khi `draft`).
- `moveItem(fromId, toId, patientId)` — 1 transaction đọc 2 doc, cả 2 phải `draft`.
- `lockList(listId, by)` / `unlockList(listId, by)` — quyền kiểm ở UI (`canManageLock`); service chỉ đổi trạng thái. `lockList` từ chối khi còn `nameMismatch` chưa xác nhận (UI truyền cờ `canLock` đã tính từ Task 3; service nhận `force=false`).
- Mọi hàm ghi gọi `assertEditable(list)` (throw `PaymentListLockedError` nếu `status==='locked'`).

- [ ] **Step 1:** Test thuần: `assertEditable` throw khi locked; `applyAddItems` bỏ trùng `patientId`; `applyRemoveItem` bỏ đúng ca; `applyMoveItem` chuyển đúng + từ chối khi một bên locked.
- [ ] **Step 2:** chạy → FAIL
- [ ] **Step 3:** Cài đặt hàm thuần trước, rồi các hàm Firestore bọc chúng trong `runTransaction`.
- [ ] **Step 4:** chạy test → PASS; `npx tsc --noEmit 2>&1 | grep paymentList` → không lỗi
- [ ] **Step 5: Commit** `feat(payment-list): firestore service with lock guard + rules`

---

### Task 5: Hook dữ liệu `usePaymentLists`

**Files:**
- Create: `hooks/usePaymentLists.ts`

Trách nhiệm (chỉ chạy khi `enabled`, tức BC tháng):
1. `subscribeToPaymentLists` → `lists`.
2. `subscribeToAllAssignments` → `allAssignments` (**không lọc ngày**).
3. `lookupRecords(from, to)`: gọi `reportService.getReports(from, to, 'MONTHLY')` và `'DAILY'` (hợp nhất, khử trùng theo `patientId`) cho cửa sổ `[đầu tháng trước, cuối kỳ]`, **cache** theo khóa cửa sổ, nạp lười khi mở modal/chọn danh sách.
4. Trả: `{ lists, allAssignments, membershipIndex, recordsForLookup, ensureRecordsLoaded }`.

- [ ] **Step 1:** Cài đặt hook (không test UI; logic nặng đã nằm ở Task 3).
- [ ] **Step 2:** `npx tsc --noEmit 2>&1 | grep usePaymentLists` → không lỗi
- [ ] **Step 3: Commit** `feat(payment-list): data hook`

---

### Task 6: Nối vào App + Router (chỉ BC tháng)

**Files:**
- Modify: [App.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/App.tsx) — gọi `usePaymentLists({ enabled: currentType === 'monthly' })`, truyền xuống `SurgeryTableViewRouter` các prop: `paymentLists`, `allPackageAssignments`, `paymentListIndex`, `canManagePaymentLists={canManageLock}`, `reportRecords={currentReport.result?.validRecords}`, `currentPeriodKey`, `enablePaymentLists={currentType === 'monthly'}`, `currentUser`.
- Modify: [SurgeryTableViewRouter.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/surgery/SurgeryTableViewRouter.tsx)

Router (tab Thanh toán › Gói dịch vụ):
- State `selectedListId: 'all' | 'unpaid' | <listId>` (lưu `localStorage`).
- Tính `assignmentsForTable`:
  - `all` → `packageAssignments` (như hiện tại)
  - `<listId>` → `allPackageAssignments` lọc `patientId ∈ items(list)`
  - `unpaid` → `findUnpaid(...)`
- `PackagePaymentTable` nhận `assignmentsForTable`; **các nhánh khác giữ nguyên** khi `!enablePaymentLists`.

- [ ] **Step 1:** Thêm props (tùy chọn, mặc định tắt) để BC ngày không đổi hành vi.
- [ ] **Step 2:** Cài `assignmentsForTable` bằng `useMemo`.
- [ ] **Step 3:** Kiểm tra tay: BC ngày không thấy gì mới; BC tháng chọn "Tất cả ca đã gán" cho kết quả y hệt trước đây (so sánh tổng cộng trước/sau).
- [ ] **Step 4: Commit** `feat(payment-list): wire monthly-only data and table filtering`

---

### Task 7: Bộ chọn danh sách + Modal quản lý

**Files:**
- Create: `components/surgery/PaymentListSelector.tsx`, `components/surgery/PaymentListManagerModal.tsx`
- Modify: `SurgeryTableViewRouter.tsx` (đặt selector cạnh toggle Số lượng/Số tiền, trước ô tìm kiếm — chỉ khi `paymentMode==='package' && enablePaymentLists`)

`PaymentListSelector`: `<select>` danh sách (hiển thị 🔒 khi `locked`, số ca), mục `Tất cả ca đã gán`, `Chưa thanh toán (n)`, nút **Quản lý danh sách**.

`PaymentListManagerModal` (một modal, 3 màn trong cùng khung):
1. **Danh sách** — liệt kê các danh sách, nút "Import danh sách mới" (tên mặc định `Thanh toán DV chọn BS tháng M/YYYY`), đổi tên, xóa (draft).
2. **Import** — textarea + nút chọn file `.xlsx`; gọi parser → `reconcileItems` → bảng xem trước: đếm 4 trạng thái + `skipped` + cột "đang ở danh sách X" (conflict, tô đỏ, nút **Chuyển về đây** hoặc bỏ qua). Nút "Tạo danh sách".
3. **Chi tiết danh sách** — bảng ca: Mã KCB, Họ tên (TCKT), Họ tên (hệ thống), Trạng thái, Gói, Ghi chú, thao tác:
   - `pending`: **Gán gói** (mở `PackageAssignmentModal` với bản ghi PT), **Loại khỏi danh sách**; nếu ca có gói nhầm: **Xóa gán** (`deleteAssignment`, có xác nhận)
   - `nameMismatch`: **Xác nhận giữ**, **Sửa tên**, **Loại**
   - mọi dòng: **Chuyển sang danh sách…**, **Xóa khỏi danh sách**, sửa ghi chú
   - thanh trên: **Thêm ca** (tìm trong gói đã gán/bản ghi PT theo mã KCB hoặc tên), **Chốt** / **Mở khóa** (hiện khi `canManagePaymentLists`)
   - Khi `locked`: mọi nút sửa bị ẩn/disable, hiện banner "Đã chốt bởi … lúc …".
   - Nút Chốt disable + tooltip khi `!canLock(...)`.

- [ ] **Step 1:** Selector. **Step 2:** Modal màn Import (dùng parser + reconcile + `findConflicts`). **Step 3:** Modal màn Chi tiết + thao tác. **Step 4:** Kiểm tra tay đủ luồng: import → ca chờ → gán gói → chốt → thử sửa (bị chặn) → mở khóa.
- [ ] **Step 5: Commit** `feat(payment-list): selector and manager modal`

---

### Task 8: Tab "Gói DV" (`PackageListView`)

**Files:**
- Modify: [PackageListView.tsx](file:///Users/buiminhkhoi/Documents/Initial-SurgicalDataPro/components/surgery/PackageListView.tsx) và nơi render nó trong Router

Thêm prop `paymentLists`, `paymentListIndex`, `enablePaymentLists`, `canManagePaymentLists`, `onAddToList / onMoveToList / onRemoveFromList`:
- Cột **"Thanh toán"** (thêm vào `allColumns`, có thể ẩn): tên danh sách (🔒 nếu chốt) hoặc "Chưa TT".
- Bộ lọc mới cạnh `Tất cả/Đã gán/Chưa gán`: `Chưa thanh toán` + dropdown theo danh sách.
- Menu thao tác hiện có: thêm **Thêm vào danh sách…**, **Chuyển sang danh sách…**, **Xóa khỏi danh sách** (disable khi danh sách chốt).
- Ca chờ của một danh sách nhưng chưa có gói: hiện như "Chưa gán" kèm nhãn danh sách (nguồn: `reconcileItems` status `pending`) để gán bằng icon `+` sẵn có.
- Tất cả chỉ render khi `enablePaymentLists`.

- [ ] **Step 1–3:** cột, bộ lọc, thao tác. **Step 4:** kiểm tra tay BC ngày không đổi. **Step 5: Commit** `feat(payment-list): payment info in package list tab`

---

### Task 9: Kiểm thử tích hợp & hoàn thiện

- [ ] `npx vitest run` → toàn bộ pass (gồm 3 file test mới)
- [ ] `npx tsc --noEmit 2>&1 | grep -E "paymentList|PaymentList|PackageListView|SurgeryTableViewRouter|usePaymentLists"` → không lỗi mới
- [ ] Kịch bản tay trên dữ liệu thật (dùng ảnh mẫu TCKT):
  1. BC tháng 9 import danh sách chứa ca mổ 30/8 → ca vẫn khớp `assigned` (nhờ `allAssignments`) hoặc `pending`/`notFound` đúng
  2. Import lần 2 chứa ca đã ở danh sách 1 → bị đánh dấu xung đột, Chuyển được
  3. Danh sách có ca lệch tên → không Chốt được tới khi xác nhận
  4. Chốt → sửa/xóa/chuyển bị chặn (cả khi gọi từ 2 trình duyệt); người không có quyền không thấy nút Chốt/Mở khóa
  5. BC hàng ngày: không có selector/cột/nút mới
  6. Chế độ "Chưa thanh toán" liệt kê đúng ca đã gán chưa ở danh sách nào
- [ ] Cập nhật `RELEASE_NOTES_V2.md` (mục tính năng mới)
- [ ] **Commit** `feat(payment-list): finalize`

---

### Task 10 (giai đoạn 2): Tra cứu ra viện cho ca "chưa thanh toán" — mặc định coi là đã ra viện

**Quy tắc (user đã chốt):** tập tra cứu = các ca của `findUnpaid` (số ít). Dùng mã KCB tra BigQuery cpbq. **Nếu không tra được (API lỗi, offline, không thấy bản ghi, chưa cấu hình) ⇒ coi như đã ra viện** — không bao giờ ẩn hay chặn ca vì lỗi tra cứu. Tra cứu chỉ **bổ sung thông tin** (ngày ra viện, tháng quyết toán), không làm biến mất ca khỏi danh sách "Chưa thanh toán".

**Khảo sát cpbq-react:** bảng `cpbq-487004.cpbq_data.thanh_toan_bhyt` có cột `ma_bn`, `ngay_vao`, `ngay_ra`, `thang_qt`, `nam_qt`; các API đã dùng mẫu `WHERE ma_bn IN (...)` (vd `src/app/api/bq/overview/import/route.ts`). 

**Việc cần xác minh trước khi code (Step 0):**
- `ma_bn` trong BigQuery có cùng định dạng với "mã KCB" (`2600089966`) của SurgicalDataPro/TCKT không? (chạy 1 truy vấn thử với vài mã thật)
- Bảng chỉ chứa ca đã **quyết toán BHYT**; ca không thấy ≠ chưa ra viện ⇒ đúng với quy tắc mặc định ở trên.

**Files:**
- Create (cpbq-react): `src/app/api/bq/discharge/route.ts` — `POST { ids: string[] }` → `{ rows: [{ma_bn, ngay_ra, thang_qt, nam_qt}] }`, chỉ đọc, giới hạn ≤ 200 mã/lần, bật CORS cho domain SurgicalDataPro + khóa API đơn giản (header) lưu ở biến môi trường.
- Create: `services/dischargeLookupService.ts` — `lookupDischarge(ids)`: gọi API với timeout ngắn; **mọi lỗi → trả `{}`** (không throw).
- Modify: `hooks/usePaymentLists.ts` — sau khi có `findUnpaid`, gọi lookup (cache theo `patientId`), chỉ khi có cấu hình `VITE_CPBQ_API_URL`.
- Modify: `PackageListView.tsx` + màn "Chưa thanh toán" — cột "Ra viện" (`ngay_ra` nếu có, ngược lại "—"); không lọc theo kết quả.
- Test: `__tests__/dischargeLookupService.test.ts` — mock `fetch`: thành công → map đúng; lỗi mạng / HTTP 500 / JSON hỏng / quá thời gian → trả `{}`; mã không có trong kết quả → không có khóa (UI hiểu là mặc định đã ra viện).

- [ ] **Step 0:** xác minh khớp `ma_bn` ↔ mã KCB bằng truy vấn thử.
- [ ] **Step 1:** viết test `dischargeLookupService` (fail) → **Step 2:** cài đặt → pass.
- [ ] **Step 3:** thêm API route ở cpbq-react và kiểm tra thủ công bằng `curl`.
- [ ] **Step 4:** nối hook + cột "Ra viện"; kiểm tra khi tắt API vẫn hiển thị đủ ca.
- [ ] **Step 5: Commit** `feat(payment-list): optional discharge lookup (defaults to discharged)`

---

## Ngoài phạm vi (làm sau)

- Mẫu in / xuất Excel theo TCKT (bảng "Chi tiền DV chọn bác sĩ" + bảng Số thu/Nộp thuế/Trích 16%/Chi cho khoa).
- Nhật ký chỉnh sửa danh sách (có thể dùng `auditLogService`).

