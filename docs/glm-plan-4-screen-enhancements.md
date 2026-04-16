# Plan 4: Screen-Level Feature Enhancements

## Goal
Fill in placeholder data, fix remaining screen bugs, and add meaningful functionality to each screen.

## Tasks

### 1. EquityScreenV3 — Fill Dead Metric Cards
**File:** `frontend/src/components/screens/EquityScreenV3.tsx`

Lines ~289-291 show "Next Earnings", "Target Price", "Recommendation" as hardcoded `'—'`.

Fix: These fields are available from yfinance:
- `earningsDate` or `earningsTimestamp` → Next Earnings
- `targetMeanPrice` → Target Price
- `recommendationKey` → Recommendation (e.g., "buy", "hold", "sell")

Backend already returns these in `_build_equity_response`. If not, add them:
- In `backend/routers/equity.py`, add to `EquityResponse` model: `target_price: float | None = None`, `recommendation: str | None = None`, `next_earnings: str | None = None`
- In `_build_equity_response`, add: `"target_price": info.get("targetMeanPrice")`, `"recommendation": info.get("recommendationKey")`, `"next_earnings": str(info.get("earningsTimestamp") or info.get("earningsDate") or "")`
- In EquityScreenV3, populate those 3 metrics from `equity` data

### 2. ChartScreen — Loading Skeleton
**File:** `frontend/src/components/screens/ChartScreen.tsx`

Lines ~781-783 use CSS classnames `bb-loading-bg` and `bb-loading-bar` that aren't defined in any global stylesheet. Fix:
- Replace with inline styles matching the app's loading bar pattern
- Use `background: C.surface1`, a pulsing amber bar, etc.
- Or import the shared `LoadingBar` component

### 3. GIPScreen — Prevent Chart Flicker
**File:** `frontend/src/components/screens/GIPScreen.tsx`

Line ~367: chart `useEffect` depends on `prevClose` which causes a full chart redraw when only equity data refreshes.
- Remove `prevClose` from the dependency array
- Apply prevClose line updates separately via `priceLine.update()` instead of redrawing

### 4. HSScreen — Fix Crosshair Race & Custom Preset
**File:** `frontend/src/components/screens/HSScreen.tsx`

Two bugs:
1. `areaRef.current` is null during first crosshair callback. Fix: assign refs before subscribing crosshair.
2. `applyCustom` doesn't reset `presetId` to `'custom'`. Add `setPresetId('custom')` at the start of `applyCustom`.

### 5. QuantScreen — Cache Key Consistency & ResizeObserver
**File:** `frontend/src/components/screens/QuantScreen.tsx`

1. Line ~135: `queryKey: ['chart', sym, '2y']` missing interval. Change to `['chart', sym, '2y', '1d']`.
2. `InlineChart` uses `window.addEventListener('resize')`. Replace with `ResizeObserver`:
```tsx
useEffect(() => {
  if (!containerRef.current || !chartRef.current) return
  const ro = new ResizeObserver(() => {
    const { width } = containerRef.current!.getBoundingClientRect()
    chartRef.current!.resize(width, 200)
  })
  ro.observe(containerRef.current)
  return () => ro.disconnect()
}, [])
```

### 6. HomeScreenV3 — Real Sparkline Data
**File:** `frontend/src/components/screens/HomeScreenV3.tsx`

`IndexPulseTile` sparklines use `Math.random()` which produces meaningless lines. Fix:
- Fetch actual intraday data from `/api/chart/{ticker}?period=1d&interval=5m`
- Store close prices as the sparkline array
- Fall back to a flat line if API fails, not random noise

### 7. FXCScreen — Deduplicate buildCcyUsdMap
**File:** `frontend/src/components/screens/FXCScreen.tsx`

`buildCcyUsdMap` is called twice per render (once in useEffect, once in render body). Fix:
- Compute it once via `useMemo`:
```tsx
const ccyUsd = useMemo(() => data ? buildCcyUsdMap(data) : {}, [data])
```
- Use `ccyUsd` everywhere instead of calling `buildCcyUsdMap` again

### 8. EquityScreen — Verify usePriceFlash Import
**File:** `frontend/src/components/screens/EquityScreen.tsx`

Verify `import { usePriceFlash } from '../../lib/usePriceFlash'` resolves. If the file is at `../../hooks/usePriceFlash`, fix the import path. If it doesn't exist, either create it or inline the flash logic (same pattern as EquityScreenV3's `useNeonFlash`).

### 9. Backend — ANTHROPIC_API_KEY in .env.example
**File:** `backend/.env.example`

Add:
```
# Optional: AI analysis endpoint
ANTHROPIC_API_KEY=
```

### 10. Backend — Fix AI Router Model ID
**File:** `backend/routers/ai.py`

Line ~83: `"claude-sonnet-4-20250514"` — replace with `"claude-sonnet-4-5-20241022"` or make configurable:
```python
AI_MODEL = os.getenv("AI_MODEL", "claude-sonnet-4-5-20241022")
```
