# Agent A14 — Frontend Live Integration + AGENTS.md Update

## Objective

Wire the frontend MACRO components to the live API (replacing fixture data), update `App.tsx` to import the new `MacroIntelScreen`, add the API fetch functions to `api.ts`, and update `AGENTS.md` with the MACRO subsystem documentation. This is the final integration agent that makes the dashboard functional end-to-end.

## Pre-flight Reads

1. `frontend/src/components/screens/macro/MacroIntelScreen.tsx` — the container to update
2. `frontend/src/components/screens/macro/types.ts` — TypeScript types
3. `frontend/src/components/screens/macro/fixtures.ts` — the mock data being replaced
4. `frontend/src/lib/api.ts` — existing API client pattern
5. `frontend/src/App.tsx` — see current MacroScreen import (line to change)
6. `frontend/src/types/index.ts` — may need to add macro response types here
7. `AGENTS.md` — current content (to be extended)

## Scope — Files This Agent Owns/Modifies

- `frontend/src/components/screens/macro/MacroIntelScreen.tsx` — **modify** (add React Query hooks)
- `frontend/src/lib/api.ts` — **modify** (add macro fetch functions)
- `frontend/src/App.tsx` — **modify** (change import path)
- `AGENTS.md` — **modify** (add MACRO subsystem section)

## Scope — Files This Agent Must NOT Touch

- Backend files (all backend work is done)
- Other screen components
- `commandParser.ts` (MACRO routing already works)
- The macro widget components (RegimeBar, AssetGrid, etc.) — they already accept props correctly
- `theme.ts`, `types/index.ts` (no changes needed)

## Interface Contract

### api.ts additions:
```typescript
export const fetchMacroDashboard = (): Promise<MacroDashboardResponse> =>
  api.get('/macro/dashboard').then(r => r.data)

export const fetchMacroRegime = (): Promise<RegimeReading> =>
  api.get('/macro/regime').then(r => r.data)

export const fetchMacroCatalysts = (): Promise<CatalystEvent[]> =>
  api.get('/macro/catalysts').then(r => r.data)

export const fetchMacroIdeas = (): Promise<TradeIdea[]> =>
  api.get('/macro/ideas').then(r => r.data)

export const fetchMacroNarrative = (): Promise<NarrativeOutput | null> =>
  api.get('/macro/narrative').then(r => r.data)

export const refreshMacro = (): Promise<{ status: string }> =>
  api.post('/macro/refresh').then(r => r.data)
```

### MacroIntelScreen.tsx updates:
```tsx
// Replace fixture imports with React Query hooks:
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: ['macro-dashboard'],
  queryFn: fetchMacroDashboard,
  staleTime: 5 * 60_000, // 5 min
  // Fall back to fixtures if API not yet available
})

// Pass live data to child components:
<RegimeBar regime={data?.regime ?? FIXTURE_REGIME} loading={isLoading} />
<AssetGrid assets={data?.asset_scores ?? {}} loading={isLoading} />
<CatalystCalendar catalysts={data?.catalysts ?? []} loading={isLoading} />
<TradeReadyTable ideas={data?.trade_ideas ?? []} loading={isLoading} />
<TodaysRead narrative={data?.narrative ?? null} loading={isLoading} />
```

### App.tsx change:
```tsx
// Old:
import MacroScreen from './components/screens/MacroScreen'
// New:
import MacroIntelScreen from './components/screens/macro/MacroIntelScreen'

// In the switch:
// Old:
case 'macro':
  return <MacroScreen onNavigate={handleNavigate} />
// New:
case 'macro':
  return <MacroIntelScreen onNavigate={handleNavigate} />
```

## Implementation Requirements

### MacroIntelScreen.tsx — Full Integration

Replace the fixture-based rendering with live data:

```tsx
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchMacroDashboard, refreshMacro } from '../../../lib/api'
import { MOCK_DASHBOARD } from './fixtures'

const MacroIntelScreen: React.FC<Props> = ({ onNavigate }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['macro-intel-dashboard'],
    queryFn: fetchMacroDashboard,
    staleTime: 5 * 60_000,
    retry: 2,
  })

  const refreshMutation = useMutation({
    mutationFn: refreshMacro,
    onSuccess: () => refetch(),
  })

  // Use live data with fixture fallback
  const dashboard = data ?? null
  const regime = dashboard?.regime ?? MOCK_DASHBOARD.regime
  const assets = dashboard?.asset_scores ?? MOCK_DASHBOARD.asset_scores
  const catalysts = dashboard?.catalysts ?? MOCK_DASHBOARD.catalysts
  const ideas = dashboard?.trade_ideas ?? MOCK_DASHBOARD.trade_ideas
  const narrative = dashboard?.narrative ?? MOCK_DASHBOARD.narrative

  // Header with refresh button and staleness indicator
  // ...
}
```

### Refresh Button

In the header:
```tsx
<button
  className="bb-btn"
  onClick={() => refreshMutation.mutate()}
  disabled={refreshMutation.isPending}
  style={{ fontSize: '10px', padding: '4px 10px' }}
>
  {refreshMutation.isPending ? 'Refreshing...' : '↻ Refresh'}
</button>
```

### Staleness Indicator

When `dashboard?.stale === true`, show a warning banner:
```tsx
{dashboard?.stale && (
  <div style={{
    background: color.accentWarningDim,
    padding: '4px 12px',
    fontSize: '11px',
    color: color.accentWarning,
    fontFamily: font.sans,
  }}>
    Data is stale — last refresh: {dashboard.last_refresh ?? 'never'}. Click Refresh to update.
  </div>
)}
```

### Error State

When the API fails entirely:
```tsx
{isError && (
  <div style={{
    padding: '12px',
    color: color.accentNegative,
    fontSize: '12px',
    fontFamily: font.sans,
  }}>
    MACRO dashboard unavailable. Backend may not be running or pipeline has not executed yet.
    Showing mock data.
  </div>
)}
```

### api.ts — Type Imports

Add the necessary type imports at the top of api.ts:
```typescript
import type {
  MacroDashboardResponse,
  RegimeReading,
  CatalystEvent,
  TradeIdea,
  NarrativeOutput,
} from '../components/screens/macro/types'
```

Note: Import from the macro types file, NOT from `../types/index.ts`. This keeps the macro types self-contained.

### App.tsx — Import Swap

This is a one-line change:
```tsx
// Remove:
import MacroScreen from './components/screens/MacroScreen'
// Add:
import MacroIntelScreen from './components/screens/macro/MacroIntelScreen'

// In renderScreen():
case 'macro':
  return <MacroIntelScreen onNavigate={handleNavigate} />
```

Do NOT delete `MacroScreen.tsx` — leave it in place as a reference. Just remove the import.

### AGENTS.md Update

Append a new section to the existing AGENTS.md:

```markdown
---

## MACRO Intelligence Subsystem

### Overview
Macro options intelligence dashboard (`MACRO` command). Factor-based scoring engine that evaluates 7 instruments across 4 macro factors at 3 time horizons.

### Tech Stack Additions
- APScheduler (cron job, 5am ET daily)
- Two-stage LLM narrative (Ollama / Claude fallback)

### New Database Tables
All prefixed `macro_`: iv30_history, scores, regime_history, catalysts, trade_ideas, narratives, cftc_positions, input_cache

### New Modules
- `backend/macro/data/` — Data clients (FRED, CFTC, yfinance, catalysts)
- `backend/macro/engine/` — Scoring, regime classification, catalyst alignment, trade filter
- `backend/macro/narrative/` — Two-stage LLM synthesis
- `backend/macro/scheduler.py` — APScheduler cron
- `backend/macro/router.py` — FastAPI endpoints
- `frontend/src/components/screens/macro/` — Dashboard widgets

### API Endpoints
- GET /api/macro/dashboard — full state
- GET /api/macro/regime — regime only
- GET /api/macro/catalysts — forward calendar
- GET /api/macro/ideas — trade ideas
- GET /api/macro/narrative — morning read
- POST /api/macro/refresh — manual pipeline trigger

### Cron Schedule
- Daily: 5:00 AM ET
- FOMC/CPI days: 5:00 AM + 6:00 AM ET

### LLM Usage
- Stage 1: Regime characterization (no trade suggestions)
- Stage 2: Directional bias + trade commentary
- Provider: Ollama (MACRO_LLM_MODEL env var) → Claude API fallback
```

## Test Requirements

1. TypeScript compiles: `cd frontend && npx tsc --noEmit`
2. Verify MacroIntelScreen renders without errors when API returns data matching MacroDashboardResponse shape.
3. Verify MacroIntelScreen falls back to fixtures when API returns error.
4. Verify refresh button triggers mutation.
5. Verify App.tsx switch case routes to new component.

Run: `cd frontend && npx tsc --noEmit`

## Hard Constraints

- No new npm dependencies.
- Do NOT delete the old MacroScreen.tsx file (it may be referenced elsewhere as a fallback).
- The fixture fallback must remain functional so the dashboard renders even if the backend hasn't run the pipeline yet.
- Import macro types from `./macro/types`, not from the global types file.
- AGENTS.md content must be appended, not replace existing content.

## Done Criteria

- [ ] `api.ts` has all 6 macro fetch functions
- [ ] `MacroIntelScreen.tsx` uses React Query to fetch live data
- [ ] Fixture fallback works when API unavailable
- [ ] Refresh button works (triggers mutation → refetches)
- [ ] Staleness banner shows when data is stale
- [ ] `App.tsx` imports and renders `MacroIntelScreen` for 'macro' case
- [ ] TypeScript compiles cleanly
- [ ] `AGENTS.md` updated with MACRO subsystem documentation
- [ ] Old `MacroScreen.tsx` still exists (not deleted)
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A14_frontend_integration.md`
