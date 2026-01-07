# Surgical Data Pro - Session Context Snapshot
Generated: 07/01/2026 20:40 (Local Time)

## 1. Current Progress Summary
- **Phase 1-15**: Completed. Core medical staff list management (Section 2), Excel import/export (single/multi-sheet), pricing role mapping, and payment table visualization (UI/Print) are fully functional.
- **Phase 16**: Workflow Automation. Added `/sync` command with custom commit messages and timestamp-based branching (`temp-dd-mm-yyyy-HHhMM`).
- **Phase 17**: Context Management. Added `/save-context` and `/load-context`.

## 2. Key Data Structures (Schemas)
### StaffMember (contexts/ConfigContext.tsx)
```typescript
interface StaffMember {
  id: string;
  name: string;
  taxId: string;
  department: string;
  position: string; // BS PT, BS GMHS, Phụ, etc.
  stt?: number;
}
```

### AppConfig
```typescript
interface AppConfig {
  departments: string[];
  staffList: StaffMember[];
  hospitalName: string;
  priceConfig: Record<string, Record<string, number>>;
}
```

## 3. Critical Business Logic
### Payment Table Sorting
Sorted by:
1. **Tier**: `BS PT` (1) > `BS GMHS` (2) > `Phụ` (3).
2. **Department (Special)**: In `Phụ` tier, `GMHS` department is prioritized (weight -1). Others follow `config.departments` index.
3. **Role Tier**: `Chính` > `Phụ` > `Giúp việc`.
4. **Quantities**: Descending `totalQty` (Staff with more cases appear higher).
5. **Sub-role (Phụ group)**: `bestSubRoleWeight`: `KTV GMHS` (0) > `Tít DC` (1) > `GV` (2).
6. **Name**: Alphabetical.

### Print Layout
- **Margins**: Strictly **1cm**.
- **Sizing**: `table-layout: auto` + `width: 1%` on small columns (STT, Khoa, MS Thuế, Thành Tiền) + `white-space: nowrap` on 'Họ tên' to ensure a tight, balanced fit.
- **Separators**: Indigo-600 (`border-t-2`) rows for new departments.

## 4. Pending Tasks & Security
- **Firebase Security**: Realtime Database "Test Mode" is expiring in 1 day. Need to update Rules to `auth != null` or similar to prevent access denial.
- **Search Feature**: Planned next: Add search box in Surgical List.

## 5. Environment
- **Current Branch**: `temp-07-01-2026-20h33`
- **Slash Commands**: `/sync mess="..."`, `/save-context`, `/load-context`.
