# Plan 6: Remaining Bug Fixes & Test Hardening

## Goal
Mop up all remaining issues from the code review that weren't fixed directly.

## Backend Fixes

### 1. ECST Router — Dict vs Attribute Access
**File:** `backend/routers/ecst.py` ~line 147

If `obs[-1]` is a Pydantic model, `obs[-1]["value"]` will fail. Make it safe:
```python
last = obs[-1]
val = last.value if hasattr(last, "value") else last["value"]
```
Apply the same pattern to all observation access in this file.

### 2. FX Rates Cache TTL
**File:** `backend/routers/fx.py`

The live rates endpoint uses a 1-second TTL (`cache_get("price", "fx_rates_live", 1)`). This makes the cache test fragile. Change to `TTL["price"]` (15 seconds) which is appropriate for FX rates and won't cause test flakes.

### 3. Calendar/Market-Cap Cache Table
**File:** `backend/routers/equity.py`

The calendar endpoint at line ~604 uses `cache_get("econ", cache_key, TTL["daily"])`. While `TTL["daily"]` exists now, the logical table `"econ"` may not be semantically correct for equity calendar data. Consider using `"price"` table instead, since that's what other equity endpoints use.

## Frontend Fixes

### 4. Command Parser — Ticker Regex
**File:** `frontend/src/lib/commandParser.ts` line 131

Tighten `isValidTicker` to require a letter as the first character:
```ts
return /^[A-Z][A-Z0-9.\-]{0,4}$/.test(s)
```
This prevents bare `-`, `--`, `.-` from being treated as tickers.

### 5. GScreen Graph Slot — Pass Full ID
**File:** `frontend/src/lib/commandParser.ts` line 170

Currently `parts[0][1]` passes just the digit character. Verify what GScreen's `graphId` prop expects. If it expects the full slot string, change to:
```ts
return { screen: 'graph', ticker: parts[0], raw }
```

### 6. HomeScreenV3 — Stable Keys for Recent Items
**File:** `frontend/src/components/screens/HomeScreenV3.tsx`

Replace `key={\`${cmd}-${i}\`}` with `key={cmd}` if commands are unique, or use a hash of `cmd + timestamp` if duplicates are possible.

### 7. GScreen — mark() in useCallback Deps
**File:** `frontend/src/components/screens/GScreen.tsx`

Add `mark` to the dependency arrays of `setPeriod`, `setChartType`, `toggleIndicator` useCallbacks (~lines 285-293). Since `mark` is stable (created via useCallback with empty deps), this won't cause extra renders but will satisfy exhaustive-deps lint.

### 8. MacroScreen — Dead Responsive CSS
**File:** `frontend/src/components/screens/MacroScreen.tsx`

The inline `<style>` tag defining `.macro-grid` responsive rules is never applied because the grid div uses inline styles. Remove the `<style>` block and apply the responsive grid via inline style with `repeat(auto-fit, minmax(340px, 1fr))`.

### 9. EquityScreen — Skeleton Render Jank
**File:** `frontend/src/components/screens/EquityScreen.tsx`

Line ~139: `'██████'.repeat(Math.floor(Math.random() * 3) + 2)` causes re-render jank. Use a `useMemo` with a stable seed or just hardcode varying widths:
```tsx
const SKELETON_WIDTHS = [8, 12, 6, 10, 8, 14, 6, 12]
// Then use: '█'.repeat(SKELETON_WIDTHS[i % SKELETON_WIDTHS.length])
```

### 10. DESScreen — Panel Actions in Error State
**File:** `frontend/src/components/screens/DESScreen.tsx`

Move `panelActions` (DES 1 / DES 2 tabs) inside the data-present conditional render block so they don't show during error states when there's no data to tab through.
