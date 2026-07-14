# Last Session Context — 2026-07-14 22:49 (UTC+7)

## 🔀 Git State
- **Branch**: `temp-14-07-2026-22h39` (from `main`)
- **Last commit**: `0599696` — `fix: only prompt duplicate confirm on explicit Save button, Print/Download save silently`
- **Previous commit**: `1f637b3` — `feat: auto-save Excel data on Print/Download actions with duplicate detection dialog`
- **Remote**: `origin/main` synced ✅

---

## 🎯 Session Objective
Fix bug where Excel data from "Minh Lộ" tab was NOT saved to storage when users printed or downloaded Excel without pressing the "Lưu" button. Implement smart auto-save with duplicate detection.

---

## ✅ Completed Tasks

### 1. Bug Analysis: Missing Auto-Save on Download
- **Root cause**: `handleDownload()` and `handleDownloadFormatted()` had NO save logic
- Only `handlePrintClick()` had auto-save (calling `handleSaveData()`)
- Users who only downloaded Excel never had their data persisted to Firestore

### 2. New Architecture: Unified Save Flow
Refactored save logic into 3 layers:

```
executeSave()          — Core save logic (calls reportService.saveReport)
ensureDataSaved()      — Silent auto-save for Print/Download (no duplicate dialog)
handleSaveData()       — Explicit save for Lưu button (checks duplicates, shows dialog)
```

### 3. `reportService.checkDuplicates()` — New Method
- **File**: `services/reportService.ts` lines 58-125
- Queries Firestore for existing records in same date range
- Returns `{ newCount, duplicateCount, updatableCount }` without saving
- Used by `handleSaveData()` to decide whether to show confirmation dialog

### 4. Auto-Save on Print/Download
- `handleDownload()` → calls `ensureDataSaved(executeDownload)` when `dataSource === 'EXCEL'`
- `handleDownloadFormatted()` → calls `ensureDataSaved(executeDownloadFormatted)` when `dataSource === 'EXCEL'`
- `handlePrintClick()` → calls `ensureDataSaved(executePrintLogic)` when `dataSource === 'EXCEL'`
- All 3 save silently — only new records saved, duplicates skipped without prompt

### 5. Duplicate Confirmation Dialog (Lưu Button Only)
- **New state**: `saveConfirm` (similar pattern to `deleteConfirm`)
- **Blue-themed modal** (vs red for delete) with title "Xác nhận lưu dữ liệu"
- Shows breakdown: X new, Y updatable, Z duplicates
- User can choose "Tiếp tục lưu" or "Hủy bỏ"

### 6. Refactored Print Logic
- Split `handlePrintClick()` into:
  - `handlePrintClick()` — handles save-before-print routing
  - `executePrintLogic()` — actual print preparation (list/payment configs)

---

## 📁 Files Modified This Session

| File | Changes |
|------|---------|
| `services/reportService.ts` | Added `checkDuplicates()` method (~65 lines) |
| `App.tsx` | Refactored save logic: `executeSave`, `ensureDataSaved`, `handleSaveData`, `executeDownload`, `executeDownloadFormatted`, `executePrintLogic`. Added `saveConfirm` state + modal UI |

---

## 🏗️ Key Architecture Notes

### Save Flow Decision Tree
```
User Action → Which handler?
├── Print menu item → handlePrintClick()
│   └→ dataSource === 'EXCEL'?
│       ├→ YES: ensureDataSaved(executePrintLogic) — save silently, then print
│       └→ NO:  executePrintLogic() — print directly
├── Excel download → handleDownload() / handleDownloadFormatted()
│   └→ dataSource === 'EXCEL'?
│       ├→ YES: ensureDataSaved(executeDownload) — save silently, then download
│       └→ NO:  executeDownload() — download directly
└── Lưu button → handleSaveData()
    └→ dataSource === 'EXCEL'?
        ├→ YES: checkDuplicates() → duplicates?
        │   ├→ NO:  executeSave() — save directly
        │   └→ YES: show saveConfirm dialog → user confirms → executeSave()
        └→ NO:  executeSave() — save directly (for GV auto-fill updates etc.)
```

### Key Principle
- `reportService.saveReport()` already handles dedup internally (skips existing, updates GV-only)
- `ensureDataSaved()` leverages this — no need for extra check
- `handleSaveData()` adds UX layer — informs user about duplicates before committing

### Two Confirm Dialogs
1. `deleteConfirm` — Red theme — for record deletion
2. `saveConfirm` — Blue/primary theme — for duplicate-aware saving

### Data Source Tracking
- `dataSource: 'EXCEL'` → data came from uploaded file, needs saving
- `dataSource: 'STORAGE'` → data already in Firestore, no save needed
- After successful save from EXCEL, `executeSave()` reloads from storage → changes `dataSource` to `'STORAGE'`

---

## 📊 Current Feature State

| Feature | Status | Location |
|---------|--------|----------|
| Profile CRUD | ✅ Complete | ProfileConfig.tsx |
| Add technique modal (code+name) | ✅ Complete | ProfileConfig.tsx |
| Fuzzy search (no diacritics) | ✅ Complete | ProfileConfig.tsx, ConfigurationTab.tsx |
| PTTT config autocomplete | ✅ Complete | ConfigurationTab.tsx |
| Chapter catalog management | ✅ Complete | StatisticsTab.tsx |
| Surgery price catalog | ✅ Complete | SurgeryNamePriceConfig.tsx |
| Statistics filtering (all/chapter/profile) | ✅ Complete | StatisticsTab.tsx |
| Auto-save on Print/Download | ✅ Complete | App.tsx |
| Duplicate detection dialog (Lưu) | ✅ Complete | App.tsx |
| Silent auto-save (In/Excel) | ✅ Complete | App.tsx |

---

## 🔮 Potential Next Steps
- Extract `removeDiacritics` to shared `utils/` file (currently duplicated in ConfigurationTab and ProfileConfig)
- Virtualized list for the modal if catalog grows beyond 5,000+ entries
- Keyboard navigation (Up/Down/Enter) in the profile modal
- Consider adding a visual indicator when auto-save completes during Print/Download (currently only toast)
