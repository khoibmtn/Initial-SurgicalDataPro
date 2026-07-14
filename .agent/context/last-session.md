# Last Session Context — 2026-05-08 23:00 (UTC+7)

## 🔀 Git State
- **Branch**: `temp-08-05-2026-23h00` (from `main`)
- **Last commit**: `c8a8875` — `feat: profile modal - dedup by maTuongDuong+tenKT, wider modal, fuzzy search`
- **Remote**: `origin/main` synced ✅

---

## 🎯 Session Objective
Modernize the Profile "Add Technique" modal in `ProfileConfig.tsx` — changing deduplication from single-field (`tenKT`) to composite key (`maTuongDuong + tenKT`), adding 2-column display, wider modal with text wrapping, and fuzzy search with diacritics support.

---

## ✅ Completed Tasks

### 1. Composite Key Deduplication
- **Before**: `getUniqueNamesFromPrices()` → dedup by `tenKT` only → ~3,497 unique entries
- **After**: `getUniqueNameCodePairsFromPrices()` → dedup by `maTuongDuong|tenKT` combo → ~4,490 unique entries
- Same `tenKT` with different `maTuongDuong` → appears as separate rows
- **File**: `services/profileService.ts` lines 117-154

### 2. New Interface: `SurgeryNameCodePair`
```typescript
export interface SurgeryNameCodePair {
  tenKT: string;
  maTuongDuong: string;
}
```

### 3. Profile Modal UI — 2-Column Layout
- **Code badge**: `<span>` with `font-mono`, `bg-gray-100`, `min-w-[80px]` → shows `maTuongDuong`
- **Surgery name**: `break-words` (auto-wraps instead of truncating)
- **Modal width**: `max-w-md` → `max-w-2xl`
- When clicking `+`, only `tenKT` is stored in profile (not `maTuongDuong`)
- **File**: `components/statistics/ProfileConfig.tsx`

### 4. Fuzzy Search (Non-Diacritic Vietnamese)
- `removeDiacritics()` — strips diacritical marks: `NFD + regex` + đ→d, Đ→D
- Multi-token matching: `"cat ruot"` → matches `"Cắt ruột"` in any combo
- Searches across both `maTuongDuong` and `tenKT` combined
- **File**: `components/statistics/ProfileConfig.tsx` lines 46-65

### 5. Filtering Logic
- `availablePairs`: Excludes items whose `tenKT` (lowercase) already exists in the selected profile's `surgeryNames`
- When adding: double-checks tenKT existence → shows toast if duplicate
- After adding: ALL rows with that `tenKT` disappear from available list (even if different codes)

---

## 📁 Files Modified This Session

| File | Changes |
|------|---------|
| `services/profileService.ts` | Added `SurgeryNameCodePair` interface + `getUniqueNameCodePairsFromPrices()` helper |
| `components/statistics/ProfileConfig.tsx` | Rewired modal to use pair-based dedup, 2-column layout, wider modal, fuzzy search |

---

## 🏗️ Key Architecture Notes

### Data Flow: Profile "Add Technique" Modal
```
Firebase RTDB surgery_name_prices
  → subscribeToSurgeryNamePrices() [surgeryNamePriceService.ts]
  → surgeryNamePrices state [StatisticsTab.tsx]
  → passed as props to ProfileConfig
  → getUniqueNameCodePairsFromPrices() → dedup by code|name combo
  → availablePairs: filter out tenKT already in profile
  → filteredAvailable: fuzzy search with diacritics stripping
  → UI: 2-column (code badge + name)
  → handleAddSurgery(): stores only tenKT in Firestore
```

### SurgeryNamePrice Record Structure
```typescript
interface SurgeryNamePrice {
  id: string;
  tenKT: string;           // Surgery name
  price: number;            // Service price (VND)
  effectiveFrom: string;    // ISO date
  effectiveTo: string | null;
  createdAt: number;
  maTuongDuong?: string;    // Equivalent code (MA_TUONG_DUONG)
}
```

### Profile Storage
- **Collection**: `surgery_profiles` (Firestore)
- **surgeryNames**: `string[]` — stores lowercase `tenKT` only (no codes)
- Profile filtering in stats uses lowercase match against record `tenKT`

### Two Dedup Helpers Coexist
1. `getUniqueNamesFromPrices()` — returns `string[]` (tenKT only) — used by `ConfigurationTab.tsx` autocomplete
2. `getUniqueNameCodePairsFromPrices()` — returns `SurgeryNameCodePair[]` — used by `ProfileConfig.tsx` modal

### Fuzzy Search Pattern (Reusable)
```typescript
const removeDiacritics = (str: string) =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// Multi-token fuzzy:
const qNorm = removeDiacritics(query.toLowerCase());
const tokens = qNorm.split(/\s+/);
items.filter(item => {
  const norm = removeDiacritics(item.toLowerCase());
  return tokens.every(t => norm.includes(t));
});
```

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

---

## 🔮 Potential Next Steps
- Consider extracting `removeDiacritics` to a shared `utils/` file (currently duplicated in ConfigurationTab and ProfileConfig)
- Virtualized list for the modal if catalog grows beyond 5,000+ entries
- Keyboard navigation (Up/Down/Enter) in the profile modal like ConfigurationTab autocomplete
