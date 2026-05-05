# Agent A5 — Frontend Container + Regime Bar + Fixtures + Types

## Objective

Implement the MACRO dashboard's main container component (`MacroIntelScreen.tsx`), the Regime State Bar widget (`RegimeBar.tsx`), the shared TypeScript types (`types.ts`), and the mock fixtures file (`fixtures.ts`). The container stacks all four zones vertically. The Regime Bar is Zone 1 — an 80px strip showing the current meta-regime name, age, conviction, with a red flash when regime shifted recently.

## Pre-flight Reads

1. `frontend/src/lib/theme.ts` — design tokens (color, font, space, type)
2. `frontend/src/components/Terminal/Panel.tsx` — existing Panel wrapper pattern
3. `frontend/src/components/screens/MacroScreen.tsx` — the screen we're replacing (understand the pattern)
4. `frontend/src/components/screens/WatchlistScreen.tsx` — reference for screen structure
5. `frontend/src/components/shared/LoadingBar.tsx` — loading state component
6. `frontend/src/App.tsx` — see how MacroScreen is rendered (receives `onNavigate` prop)

## Scope — Files This Agent Owns

- `frontend/src/components/screens/macro/types.ts` — **create**
- `frontend/src/components/screens/macro/fixtures.ts` — **create**
- `frontend/src/components/screens/macro/MacroIntelScreen.tsx` — **create**
- `frontend/src/components/screens/macro/RegimeBar.tsx` — **create**

## Scope — Files This Agent Must NOT Touch

All other files. Specifically:
- Do NOT modify `App.tsx` (Phase 3 agent handles the import swap)
- Do NOT modify `commandParser.ts`
- Do NOT touch other screen files
- Do NOT create any backend files

## Interface Contract

### MacroIntelScreen.tsx
```tsx
interface Props {
  onNavigate: (cmd: string) => void
}
// Renders: RegimeBar, AssetGrid (placeholder), CatalystCalendar (placeholder), TradeReadyTable + TodaysRead (placeholder)
// Uses React Query to fetch from /api/macro/dashboard
// For Phase 1: renders against fixtures when API unavailable
```

### RegimeBar.tsx
```tsx
interface RegimeBarProps {
  regime: RegimeReading
  loading?: boolean
}
// Renders an 80px tall strip with:
// - Regime name (large, left-aligned)
// - Age badge ("14 days")
// - Conviction indicator (high/medium/low with appropriate styling)
// - Red flash animation when recently_shifted = true
```

## Implementation Requirements

### types.ts

Define all TypeScript interfaces for the MACRO system:
```typescript
export type RegimeName = 'disinflation_risk_on' | 'stagflation_defensive' | 'flight_to_quality' | 'reflation' | 'mixed_no_edge'
export type Conviction = 'high' | 'medium' | 'low'
export type AssetSymbol = 'SPY' | 'VIX' | 'GLD' | 'SLV' | 'DXY' | 'WTI' | 'BRENT'
export type BorderState = 'yellow' | 'green' | 'muted'

export interface RegimeReading {
  regime: RegimeName
  age_days: number
  conviction: Conviction
  recently_shifted: boolean
  coherence_score: number
}

export interface AssetScoreCard {
  asset: AssetSymbol
  price: number | null
  change_1d_pct: number | null
  change_5d_pct: number | null
  change_21d_pct: number | null
  score_5d: number
  score_10d: number
  score_21d: number
  iv_rank: number | null
  dominant_factor: string
  state_line: string
  border_state: BorderState
}

export interface CatalystEvent {
  event_date: string
  event_time: string | null
  event_type: string
  event_label: string
  assets_impacted: AssetSymbol[]
  consensus_value: number | null
  prior_value: number | null
  surprise_weight: number
  straddle_implied_move: number | null
}

export interface TradeIdea {
  asset: AssetSymbol
  direction: string
  dte_range: [number, number]
  structure: string
  entry_condition: string
  invalidation: string
  conviction: Conviction
  iv_rank_context: string
  confirmations: number
  half_size: boolean
}

export interface NarrativeOutput {
  date: string
  regime_narrative: string
  trade_narrative: string
  model_used: string
}

export interface MacroDashboardResponse {
  regime: RegimeReading
  asset_scores: Record<string, AssetScoreCard>
  catalysts: CatalystEvent[]
  trade_ideas: TradeIdea[]
  narrative: NarrativeOutput | null
  last_refresh: string | null
  stale: boolean
}
```

### fixtures.ts

Provide realistic mock data for all zones. The regime should be `"reflation"`, 14 days old, high conviction. Include 7 asset cards with varied scores (some green-border, some yellow, some muted). Include 6-8 catalyst events across the next 21 days. Include 2 trade ideas and a narrative.

### MacroIntelScreen.tsx

Structure:
```tsx
const MacroIntelScreen: React.FC<Props> = ({ onNavigate }) => {
  // React Query: fetchMacroDashboard (will use fixtures as fallback in Phase 1)
  // Layout: vertical flex stack, full height
  //   Zone 1: <RegimeBar />
  //   Zone 2: <AssetGrid /> (placeholder div with "Asset Grid — coming soon" for now)
  //   Zone 3: <CatalystCalendar /> (placeholder)
  //   Zone 4: flex row of <TradeReadyTable /> + <TodaysRead /> (placeholders)
  // Header: "MACRO INTEL" title bar (use bb-header class pattern from existing screens)
  // Include a manual refresh button in the header
}
```

The placeholder divs for zones 2-4 should render the fixtures data in a minimal way (JSON dump or simple text) so other frontend agents can see the data shape when they implement their widgets.

### RegimeBar.tsx

Design specs:
- Height: exactly 80px, flex-shrink: 0
- Background: `color.bgElevated` normally; animated red flash (`color.accentNegative` at 12% opacity, pulsing) when `recently_shifted = true`
- Left section: Regime name in `type.h2` style, uppercase, letter-spacing 0.1em
- Regime name display mapping:
  - `disinflation_risk_on` → "DISINFLATION / RISK-ON"
  - `stagflation_defensive` → "STAGFLATION / DEFENSIVE"
  - `flight_to_quality` → "FLIGHT TO QUALITY"
  - `reflation` → "REFLATION"
  - `mixed_no_edge` → "MIXED / NO EDGE"
- Middle section: Age badge — `"Day 14"` in `type.monoSm`, with a subtle border
- Right section: Conviction badge — colored dot + text:
  - High: green dot + "HIGH"
  - Medium: warning color dot + "MEDIUM"
  - Low: tertiary text dot + "LOW"
- Red flash animation: CSS keyframes, 2-second pulse cycle, subtle (opacity 0 → 0.12 → 0)

### Styling Rules

- All styles inline (no CSS files, no CSS-in-JS)
- Import theme tokens: `import theme from '../../../lib/theme'`
- Use `theme.color`, `theme.font`, `theme.type` etc.
- Font: Inter for body, JetBrains Mono for data/numbers
- No emojis, no gradients, no glassmorphism
- Follow the existing screen patterns exactly (see WatchlistScreen, MacroScreen)

## Test Requirements

Verify manually:
1. Import `MacroIntelScreen` in a test file and render it (React Testing Library optional).
2. TypeScript compiles with no errors: `cd frontend && npx tsc --noEmit`
3. Fixtures file exports valid data matching all type interfaces.
4. RegimeBar renders correctly for all 5 regime names and both shifted states.

Run: `cd frontend && npx tsc --noEmit`

## Hard Constraints

- No new npm dependencies.
- Inline styles only.
- Use existing theme tokens — do not define new color values.
- The RegimeBar red flash must use CSS `@keyframes` injected via a `<style>` tag or inline `animation` property with keyframes string.
- Do NOT modify App.tsx or any file outside your scope.

## Done Criteria

- [ ] `types.ts` defines all interfaces matching the backend models
- [ ] `fixtures.ts` exports realistic mock data for all zones
- [ ] `MacroIntelScreen.tsx` renders a full-height vertical stack with RegimeBar + 3 placeholder zones
- [ ] `RegimeBar.tsx` renders correctly for all regime states
- [ ] Red flash animation works when `recently_shifted = true`
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit` passes)
- [ ] No modifications to files outside scope
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A5_frontend_container_regime.md`
