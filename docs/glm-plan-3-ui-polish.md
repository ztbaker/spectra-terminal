# Plan 3: UI Visual Polish & Consistency

## Goal
Elevate the visual quality to Bloomberg-grade perfection. Fix color inconsistencies, add missing animations, remove dead code, and refine micro-interactions.

## Current State
- V3 components are 100% color-compliant with colors.ts
- Legacy screens have ~20 hardcoded color values
- Unused animations exist in index.html
- Stagger animations missing on lists
- Panel accent map defined but not wired to screen types

## Tasks

### 1. Remove Dead Code & Unused Animations
**File:** `frontend/index.html`

Remove unused `@keyframes`:
- `scanline` (lines ~87-90) — never applied anywhere
- `heroShimmer` (lines ~99-102) — never applied anywhere

**File:** `frontend/src/lib/colors.ts`

Remove the V2 compatibility aliases section (the block containing `bg0`, `bg1`, `bg2`, `bg3`, `amberHot`, `amberGhost`, etc). First search for any remaining usage of these aliases across the codebase. If CommodityScreen or CongressScreen still use `C.bg1`, `C.bg2`, `C.fontSans`, `C.yellow`, `C.bgGlow`, `C.amberGhost` — update those screens to use the canonical names first:
- `C.bg0` -> `C.surface0`
- `C.bg1` -> `C.surface1`
- `C.bg2` -> `C.surface2`
- `C.bg3` -> `C.surface3`
- `C.bgGlow` -> `C.surfaceGlow`
- `C.amberHot` -> `C.amber`
- `C.amberGhost` -> `C.amberDim`
- `C.fontSans` -> `C.fontBody`
- `C.yellow` -> `C.amber`

### 2. Screen-Specific Panel Accents
**File:** `frontend/src/App.tsx`

Replace the hardcoded `accent = panel.screen === 'home' ? 'cyan' : 'amber'` with a proper mapping:
```tsx
const SCREEN_ACCENT: Record<ScreenType, string> = {
  home: 'cyan',
  equity: 'amber',
  chart: 'amber',
  options: 'violet',
  bond: 'green',
  fx: 'cyan',
  fxc: 'cyan',
  crypto: 'violet',
  macro: 'green',
  econ: 'green',
  ecst: 'green',
  news: 'amber',
  portfolio: 'amber',
  watchlist: 'amber',
  earnings: 'amber',
  screener: 'amber',
  filings: 'amber',
  comd: 'green',
  cong: 'cyan',
  quant: 'violet',
  // defaults
  des: 'amber',
  gpo: 'amber',
  gip: 'amber',
  graph: 'amber',
  etf: 'green',
  ask: 'cyan',
  quit: 'amber',
}
```

### 3. Staggered List Animations
**Files:** HomeScreenV3.tsx, EquityScreenV3.tsx, all DataGrid/table screens

Add staggered entrance animations to list items:
- Each row/card gets `animation: fadeSlideUp 300ms ease both`
- Add `animationDelay` computed as `${index * 30}ms` (cap at 500ms total)
- Apply via inline style: `animationDelay: \`${Math.min(i * 30, 500)}ms\``
- Use the existing `fadeSlideUp` keyframe from index.html

For HomeScreenV3 Quick Launch buttons and Market Pulse tiles especially.

### 4. MacroScreen Responsive Grid Fix
**File:** `frontend/src/components/screens/MacroScreen.tsx`

The `<style>` tag with `macro-grid` class is inside a div and never applied. Fix:
- Remove the `<style>` tag entirely
- Apply the responsive grid via inline style: `gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'`

### 5. FilingsScreen Raw Fetch Cleanup
**File:** `frontend/src/components/screens/FilingsScreen.tsx`

Replace bare `fetch()` calls in `Tab13F` with the api.ts abstraction:
- Import the appropriate `fetch*` function from `lib/api.ts`
- If no function exists, add `fetch13F(cik: string)` and `fetchLitigation(ticker: string)` to `lib/api.ts`
- Add `staleTime: 60_000` to the litigation query to avoid hammering the endpoint
- Add `r.ok` check before calling `.json()` — throw on non-2xx

### 6. FilingsScreen formatDate Fix
**File:** `frontend/src/components/screens/FilingsScreen.tsx`

The `formatDate` function is a no-op identity. Either:
- Remove it and use dates as-is, OR
- Make it actually format dates nicely: `new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` → "Apr 13, 2026"

### 7. Hardcoded Color Cleanup
**File:** `frontend/src/App.tsx` line ~55

Replace `rgba(0, 0, 0, 0.85)` with `${C.surface0}E6` (hex with alpha).

**File:** `frontend/src/components/screens/ChartScreen.tsx`

Replace any `'#000000'` with `C.surface0`.

### 8. Font Weight Scale
**File:** `frontend/src/lib/colors.ts`

Add standardized font weight constants:
```ts
fontWeightLight: 300,
fontWeightNormal: 400,
fontWeightMedium: 500,
fontWeightSemibold: 600,
fontWeightBold: 700,
```

### 9. Improve expandDown Animation
**File:** `frontend/index.html`

Replace the `max-height: 600px` approach in `expandDown` with a cleaner solution:
```css
@keyframes expandDown {
  from { opacity: 0; transform: scaleY(0); transform-origin: top; }
  to   { opacity: 1; transform: scaleY(1); transform-origin: top; }
}
```
This avoids the hard 600px ceiling and produces smoother results.

### 10. Panel Visual Separators
**File:** `frontend/src/components/Terminal/WorkspaceLayout.tsx`

Add subtle 1px separator lines between panels:
- Only in 2P and 3P horizontal layouts
- Color: `C.border0` (very subtle)
- Implement as `borderRight` on all panels except the last in each row
