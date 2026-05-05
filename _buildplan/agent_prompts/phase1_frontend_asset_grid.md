# Agent A6 — Frontend Asset Grid Widget

## Objective

Implement the Asset Grid component (`AssetGrid.tsx`) — Zone 2 of the MACRO dashboard. This is a horizontal grid of 7 cards, one per instrument (SPY, VIX, GLD, SLV, DXY, WTI, BRENT). Each card shows price, changes, three horizon scores, IV rank, dominant factor tag, one-line state description, and a colored border indicating trade-readiness.

## Pre-flight Reads

1. `frontend/src/lib/theme.ts` — all design tokens
2. `frontend/src/components/screens/macro/types.ts` — `AssetScoreCard`, `BorderState` interfaces
3. `frontend/src/components/screens/macro/fixtures.ts` — mock data to render against
4. `frontend/src/components/shared/TickerBadge.tsx` — existing change badge component (reuse)
5. `frontend/src/components/shared/Sparkline.tsx` — reference for inline data viz
6. `frontend/src/components/screens/WatchlistScreen.tsx` — reference for grid/card patterns

## Scope — Files This Agent Owns

- `frontend/src/components/screens/macro/AssetGrid.tsx` — **create**

## Scope — Files This Agent Must NOT Touch

All other files. Do not modify types.ts, fixtures.ts, MacroIntelScreen.tsx, or any existing component.

## Interface Contract

```tsx
interface AssetGridProps {
  assets: Record<string, AssetScoreCard>  // keyed by asset symbol
  loading?: boolean
}

// Renders a horizontal grid (CSS Grid, auto-fill with min 180px)
// Each card is an AssetCard sub-component
```

## Implementation Requirements

### Grid Layout

- Container: CSS Grid, `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`, gap 12px
- Responsive: on narrow viewports, cards stack (the auto-fill handles this)
- Cards maintain consistent height (~200px)

### Card Design

Each card contains (top to bottom):
1. **Header row:** Asset ticker (JetBrains Mono, bold, 14px) + price (right-aligned, tabular-nums)
2. **Changes row:** 1d / 5d / 21d percent changes, each using `TickerBadge` or colored text
3. **Scores row:** Three horizon scores (5d / 10d / 21d), displayed as colored squares or small bars
   - Score range: -2 to +2
   - Color mapping: -2 = deep red, -1 = light red, 0 = neutral/gray, +1 = light green, +2 = deep green
   - Display as small rectangles with the score value inside
4. **IV Rank row:** "IV Rank: 72%" or "IV Rank: N/A" in caption style
5. **Factor tag:** Small pill badge showing dominant factor (e.g., "REAL RATE", "RISK APP.")
6. **State line:** One-line description in `type.bodySm`, color textSecondary
7. **Border:** Entire card has a left border (4px wide) colored by `border_state`:
   - `"green"`: `color.accentPositive` (trade-ready: aligned scores + favorable IV)
   - `"yellow"`: `color.accentWarning` (high-information: disagreeing horizons)
   - `"muted"`: `color.borderSubtle` (no signal)

### Score Display (Horizon Scores)

The three horizon scores (-2 to +2) should be displayed as a compact row of three small blocks:
```
┌─────┐ ┌─────┐ ┌─────┐
│ +1  │ │ +2  │ │ +1  │   ← colored bg based on value
│ 5d  │ │ 10d │ │ 21d │
└─────┘ └─────┘ └─────┘
```
- Each block: ~50px wide, 36px tall
- Background: gradient from red (-2) through neutral gray (0) to green (+2)
- Score value in bold, horizon label below in 9px tertiary text

### Yellow Border Logic (High-Information State)

A card gets yellow border when horizon scores **disagree** — specifically when:
- `sign(score_5d) !== sign(score_21d)` (short-term and long-term point different directions)
- OR `Math.abs(score_5d - score_21d) >= 2` (large divergence)

### Green Border Logic (Trade-Ready)

A card gets green border when:
- All three scores have the same sign (all positive or all negative)
- AND `iv_rank !== null` AND IV rank is favorable:
  - For long positions (positive scores): IV rank < 50 (buying cheap vol)
  - For short positions (negative scores): IV rank > 50 (selling expensive vol)
  - VIX is special: inverted (high VIX rank = favorable for SPY puts)

Note: The `border_state` field from the backend already has this computed. Just map the string to the color.

### Styling

- Card background: `color.bgElevated`
- Card border-radius: `radius.md` (8px)
- Left border: 4px solid, color varies by state
- Padding: 12px
- All fonts per theme system
- Numbers use JetBrains Mono with tabular-nums
- No hover effects on the card itself (it's information-dense enough)

### Factor Tag Mapping (abbreviations)

```typescript
const FACTOR_LABELS: Record<string, string> = {
  real_rate: 'REAL RATE',
  risk_appetite: 'RISK',
  dollar_liquidity: 'DOLLAR',
  growth_inflation: 'GROWTH',
}
```

Display as a small pill: `background: color.bgSurface`, `border: 1px solid color.borderSubtle`, `fontSize: 9px`, `padding: 2px 6px`, `borderRadius: radius.full`.

## Test Requirements

1. TypeScript compiles: `cd frontend && npx tsc --noEmit`
2. Verify the component renders 7 cards when given the fixtures data.
3. Verify border color mapping works for all three states.
4. Verify score color interpolation produces valid colors.

Run: `cd frontend && npx tsc --noEmit`

## Hard Constraints

- No new npm dependencies.
- Inline styles only (no CSS modules, no styled-components).
- Reuse `TickerBadge` from `../shared/TickerBadge` for change values.
- Use theme tokens — do not hardcode colors.
- Do not modify any file outside your scope.
- The component must handle the case where `assets` is empty (show "No asset data" message).

## Done Criteria

- [ ] `AssetGrid.tsx` renders 7 cards in a responsive grid
- [ ] Each card shows all required data fields
- [ ] Border state colors work correctly (green/yellow/muted)
- [ ] Horizon scores render with correct color interpolation
- [ ] Factor tags display as pills
- [ ] TypeScript compiles cleanly
- [ ] Component handles empty data gracefully
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A6_frontend_asset_grid.md`
