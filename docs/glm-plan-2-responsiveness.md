# Plan 2: Responsive Layout System

## Goal
Make every V3 component responsive using the existing `useBreakpoint()` hook. The app currently breaks on windows smaller than ~1440px.

## Current State
- `useBreakpoint.ts` defines: compact (<1440px), standard (1440-1919px), expanded (>=1920px)
- NO V3 components use it — all dimensions are hardcoded
- Electron has no minimum window size enforced

## Tasks

### 1. Enforce Minimum Window Size
**File:** `electron/main.cjs`

In the `BrowserWindow` constructor, add:
```js
minWidth: 1024,
minHeight: 700,
```

### 2. CommandBarV3 Responsive Overhaul
**File:** `frontend/src/components/Terminal/CommandBarV3.tsx`

Import and use `useBreakpoint()`:
- **Wordmark**: compact: hide wordmark entirely or show "B>" only, standard: "BAKER", expanded: "BAKER" with subtitle
- **Input font size**: compact: 12px, standard: 13px, expanded: 14px
- **Breadcrumb**: compact: truncate with ellipsis after 120px, standard: 200px, expanded: full
- **Autocomplete dropdown**: compact: `width: 100vw` minus 20px padding, standard/expanded: `minWidth: 320px`
- Add `overflow: hidden`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'` to breadcrumb span

### 3. StatusBarV3 Responsive Overhaul
**File:** `frontend/src/components/Terminal/StatusBarV3.tsx`

- **Clocks**: compact: show only NY time, hide LDN/TYO labels, standard: all 3 with abbreviated labels, expanded: full labels
- **Market status pill**: compact: dot only (no text), standard/expanded: full pill
- **Marquee speed**: scale animation duration based on viewport width — `Math.max(20, (scrollWidth / viewportWidth) * 30)` seconds
- **Height**: keep 30px across all breakpoints (it's compact enough)

### 4. HomeScreenV3 Responsive
**File:** `frontend/src/components/screens/HomeScreenV3.tsx`

- **Hero title**: compact: 28px, standard: 36px, expanded: 48px
- **Subtitle**: compact: hide, standard/expanded: show
- **Market Pulse tiles**: use `gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'` instead of fixed columns
- **Quick Launch grid**: compact: 1 column, standard: 2 columns, expanded: 3 columns
- **Footer hints**: compact: hide, standard/expanded: show with `flexWrap: 'wrap'`

### 5. EquityScreenV3 Responsive
**File:** `frontend/src/components/screens/EquityScreenV3.tsx`

- **Metric grid**: change from `repeat(3, 1fr)` to `repeat(auto-fit, minmax(120px, 1fr))`
- **Quick actions row**: add `flexWrap: 'wrap'` with `gap: 6px`
- **Company info section**: compact: full width, standard/expanded: existing layout
- **Price display**: compact: 24px, standard: 32px, expanded: 42px

### 6. WorkspaceLayout Responsive Gaps
**File:** `frontend/src/components/Terminal/WorkspaceLayout.tsx`

Use `useBreakpoint()`:
- compact: `gap: '4px'`, `padding: '4px'`
- standard: `gap: '8px'`, `padding: '8px'`
- expanded: `gap: '12px'`, `padding: '12px'`

### 7. PanelV3 Responsive
**File:** `frontend/src/components/Terminal/PanelV3.tsx`

- **Title overflow**: add `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`, `maxWidth: 'calc(100% - 80px)'`
- **Button size**: compact: 20x20px, standard/expanded: 24x24px (up from 22x22)
- **Header padding**: compact: `8px 10px`, standard/expanded: `8px 14px`

## Pattern
In every file, the approach is the same:
```tsx
import { useBreakpoint } from '../../lib/useBreakpoint'
// ...
const bp = useBreakpoint()
const isCompact = bp === 'compact'
const isExpanded = bp === 'expanded'
```
Then use these booleans in inline style values.
