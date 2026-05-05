# Agent A7 — Frontend Catalyst Calendar + Trade-Ready Table + Today's Read

## Objective

Implement three components: (1) `CatalystCalendar.tsx` — a horizontal 21-day timeline with event markers, (2) `TradeReadyTable.tsx` — a 0-5 row table of qualifying trade ideas, and (3) `TodaysRead.tsx` — a narrative text panel. These form Zones 3 and 4 of the MACRO dashboard.

## Pre-flight Reads

1. `frontend/src/lib/theme.ts` — design tokens
2. `frontend/src/components/screens/macro/types.ts` — `CatalystEvent`, `TradeIdea`, `NarrativeOutput`
3. `frontend/src/components/screens/macro/fixtures.ts` — mock data
4. `frontend/src/components/shared/DataGrid.tsx` — reuse for the trade table
5. `frontend/src/components/shared/TabBar.tsx` — reference for horizontal UI patterns
6. `frontend/src/components/screens/EarningsScreen.tsx` — reference for calendar-style display

## Scope — Files This Agent Owns

- `frontend/src/components/screens/macro/CatalystCalendar.tsx` — **create**
- `frontend/src/components/screens/macro/TradeReadyTable.tsx` — **create**
- `frontend/src/components/screens/macro/TodaysRead.tsx` — **create**

## Scope — Files This Agent Must NOT Touch

All other files. Do not modify types.ts, fixtures.ts, MacroIntelScreen.tsx, AssetGrid.tsx, or any existing component.

## Interface Contracts

```tsx
// CatalystCalendar.tsx
interface CatalystCalendarProps {
  catalysts: CatalystEvent[]
  loading?: boolean
}

// TradeReadyTable.tsx
interface TradeReadyTableProps {
  ideas: TradeIdea[]
  loading?: boolean
}

// TodaysRead.tsx
interface TodaysReadProps {
  narrative: NarrativeOutput | null
  loading?: boolean
}
```

## Implementation Requirements

### CatalystCalendar.tsx — Zone 3

A horizontal scrollable timeline showing 21 days with event markers.

**Layout:**
- Height: ~160px (fixed)
- Horizontal scrollable container
- 21 day columns, each ~60px wide minimum (total width: ~1260px, scrolls on narrow viewports)
- Today's column highlighted with a subtle background tint

**Day columns:**
- Header: day-of-week abbreviation + date (e.g., "Mon\n5/12") in `type.monoXs`
- Weekend columns: slightly dimmed background, narrower
- Below header: vertically stacked event markers

**Event markers:**
- Small colored rectangles (pill-shaped): 48px wide, 18px tall
- Text: event_type abbreviation (FOMC, CPI, NFP, etc.) in 9px mono
- Color-coded by primary asset impact:
  - SPY/VIX: `color.accentInfo` (blue)
  - GLD/SLV: `color.accentWarning` (gold/amber)
  - DXY: `color.textSecondary` (neutral)
  - WTI/BRENT: `color.accentNegative` at 60% opacity (muted red)
- High surprise_weight (>= 1.5): add a subtle glow/border to marker

**Per-asset readout (below timeline):**
- For each of the 7 assets, show a small summary line:
  - `"SPY: 3 catalysts · ATM straddle 1.8%"` (or "—" if no straddle data)
- Display as a row of compact badges below the timeline
- Use `type.monoXs` styling

**Interaction:**
- Hover a marker → show tooltip with full `event_label`, time, consensus/prior values
- Tooltip: positioned above the marker, `color.bgSurface` background, `borderMedium` border

### TradeReadyTable.tsx — Zone 4a

A compact table showing 0-5 trade ideas.

**When no ideas qualify:** Display a prominent message: "Stand down — no qualifying setups" in `type.body`, `color.textTertiary`, centered, with 24px vertical padding.

**When ideas exist:** Use the existing `DataGrid` component with these columns:

| Column | Key | Type | Width |
|--------|-----|------|-------|
| Asset | asset | text | 60px |
| Direction | direction | text | 100px |
| DTE | dte_range | text | 60px |
| Structure | structure | text | 140px |
| Entry | entry_condition | text | 180px |
| Invalidation | invalidation | text | 180px |
| Conv. | conviction | text | 60px |
| IV | iv_rank_context | text | 80px |

**Row styling:**
- `half_size = true` (2 confirmations): row text at 80% opacity, prepend "½" to conviction cell
- `conviction = "high"`: conviction cell in `color.accentPositive`
- `conviction = "medium"`: conviction cell in `color.accentWarning`
- `conviction = "low"`: conviction cell in `color.textTertiary`

**DataGrid usage:**
```tsx
import DataGrid from '../../shared/DataGrid'
import type { DataGridColumn } from '../../shared/DataGrid'
```

### TodaysRead.tsx — Zone 4b

A narrative text panel displaying the LLM-generated morning read.

**Layout:**
- Sits beside the trade table (flex row with table on left, narrative on right)
- Or below on narrow viewports (when viewport < 1200px, stack vertically)
- Min-width: 320px, flex: 1
- Max-height: 300px, overflow-y: auto

**Typography:**
- The narrative panel uses slightly different typographic treatment (per design spec):
- Font: `font.sans` (Inter) — same as body but with more line-height (1.7)
- Font size: 13px
- Color: `color.textSecondary` (slightly muted — the data panels are primary)
- Paragraph spacing: 12px between paragraphs

**Content structure:**
- If `narrative === null`: show "Narrative unavailable" placeholder
- Otherwise: split on `\n\n` for paragraphs, render each as a `<p>` element
- Show `model_used` and date as a caption at the bottom: "Generated by {model} · {date}"

**Refresh button:**
- Small button in top-right corner: "↻ Regenerate" (calls manual refresh endpoint)
- Styled as `bb-btn` pattern from existing components

### Responsive Behavior

Zone 4 layout:
- Width >= 1200px: TradeReadyTable (flex: 2) + TodaysRead (flex: 1) side by side
- Width < 1200px: Stack vertically (table on top, narrative below)

Detect with the existing `useBreakpoint()` hook (import from `../../lib/useBreakpoint`).

### Styling Rules

- All inline styles, theme tokens only
- No CSS files, no styled-components
- No emojis or decorative elements
- No gradients or glassmorphism
- Clean, information-dense, Bloomberg-terminal feel

## Test Requirements

1. TypeScript compiles: `cd frontend && npx tsc --noEmit`
2. CatalystCalendar renders 21 day columns from fixtures.
3. TradeReadyTable renders "Stand down" message when ideas array is empty.
4. TradeReadyTable renders DataGrid when ideas exist.
5. TodaysRead renders narrative text split into paragraphs.
6. TodaysRead shows placeholder when narrative is null.

Run: `cd frontend && npx tsc --noEmit`

## Hard Constraints

- No new npm dependencies.
- Inline styles only.
- Reuse `DataGrid` from `../../shared/DataGrid` for the trade table.
- Use `useBreakpoint()` for responsive behavior.
- Do not modify any file outside your scope.
- Do not implement API calls — render from props only (Phase 3 handles data fetching).

## Done Criteria

- [ ] `CatalystCalendar.tsx` renders 21-day horizontal timeline with event markers
- [ ] Event markers are color-coded by asset impact
- [ ] Per-asset catalyst density + straddle readout displayed
- [ ] `TradeReadyTable.tsx` renders DataGrid with correct columns
- [ ] "Stand down" message when no ideas
- [ ] Half-size and conviction styling applied
- [ ] `TodaysRead.tsx` renders narrative with correct typography
- [ ] Responsive layout works (side-by-side vs stacked)
- [ ] TypeScript compiles cleanly
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A7_frontend_bottom_panel.md`
