# Agent A16 — Frontend Integration & Debug

## Objective

Wire the MACRO frontend components to the live backend API, replace fixture data with React Query hooks, verify the full UI renders correctly in the browser, and fix all visual/functional bugs. When done, typing `MACRO` in the command bar shows a fully populated, correctly styled dashboard with live data.

## Pre-flight Reads

1. `frontend/src/components/screens/macro/types.ts` — TypeScript interfaces
2. `frontend/src/components/screens/macro/fixtures.ts` — the mock data being replaced
3. `frontend/src/components/screens/macro/MacroIntelScreen.tsx` — container component
4. `frontend/src/components/screens/macro/RegimeBar.tsx` — regime header
5. `frontend/src/components/screens/macro/AssetGrid.tsx` — score cards grid
6. `frontend/src/components/screens/macro/CatalystCalendar.tsx` — timeline
7. `frontend/src/components/screens/macro/TradeReadyTable.tsx` — trade ideas table
8. `frontend/src/components/screens/macro/TodaysRead.tsx` — narrative panel
9. `frontend/src/lib/api.ts` — Axios instance and existing API patterns
10. `frontend/src/App.tsx` — screen router (verify MACRO case exists)
11. `backend/macro/router.py` — API endpoints to call (response shapes)

## Scope — Files This Agent Owns

- `frontend/src/components/screens/macro/MacroIntelScreen.tsx` — **rewrite** (replace fixture rendering with live data)
- `frontend/src/components/screens/macro/hooks.ts` — **create** (React Query hooks for all MACRO endpoints)

## Scope — Files This Agent May Modify

- `frontend/src/components/screens/macro/RegimeBar.tsx`
- `frontend/src/components/screens/macro/AssetGrid.tsx`
- `frontend/src/components/screens/macro/CatalystCalendar.tsx`
- `frontend/src/components/screens/macro/TradeReadyTable.tsx`
- `frontend/src/components/screens/macro/TodaysRead.tsx`
- `frontend/src/components/screens/macro/types.ts` — only if backend response differs from current types
- `frontend/src/lib/api.ts` — only to add macro API functions
- `frontend/src/App.tsx` — only if MACRO routing is broken

## Files This Agent Must NOT Touch

- Backend files (anything in `backend/`)
- Other screen components (`screens/equity/`, `screens/options/`, etc.)
- Shared components (`components/shared/`) — use them, don't modify them
- `electron/` files
- `package.json` (no new dependencies)

## Implementation Requirements

### 1. React Query Hooks (`hooks.ts`)

```typescript
// frontend/src/components/screens/macro/hooks.ts
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../../lib/api'
import type { MacroDashboardResponse } from './types'

export function useMacroDashboard() {
  return useQuery<MacroDashboardResponse>({
    queryKey: ['macro', 'dashboard'],
    queryFn: () => api.get('/api/macro/dashboard').then(r => r.data),
    refetchInterval: 5 * 60 * 1000, // 5 min
    staleTime: 60 * 1000,
  })
}

export function useMacroRefresh() {
  return useMutation({
    mutationFn: () => api.post('/api/macro/refresh'),
  })
}
```

### 2. Container Rewrite (`MacroIntelScreen.tsx`)

- Call `useMacroDashboard()` for data
- Show loading state (use existing LoadingBar pattern from other screens)
- Show error state if API unreachable
- Pass live data to child components instead of fixtures
- Add a "Refresh" button that triggers `useMacroRefresh()` then invalidates the query
- Keep fixture data as fallback ONLY if API returns 404 (first run before pipeline has executed)

### 3. Component Data Flow

Each child component receives typed props from the parent:
- `RegimeBar` ← `data.regime`
- `AssetGrid` ← `data.assets`
- `CatalystCalendar` ← `data.catalysts`
- `TradeReadyTable` ← `data.trade_ideas`
- `TodaysRead` ← `data.narrative`

### 4. Visual Verification Checklist

Start the dev server and verify in browser:

```bash
cd frontend && npm run dev
# Also ensure backend is running on :8000
```

Check each of these:
- [ ] MACRO command routes to MacroIntelScreen
- [ ] Regime bar shows regime name, conviction badge, age
- [ ] Asset grid renders 7 cards with score blocks (colored by direction)
- [ ] Border state on asset cards reflects trade-ready status
- [ ] Catalyst calendar shows events on timeline
- [ ] Trade-ready table lists qualifying setups (or "Stand down" message)
- [ ] Narrative panel shows today's read text
- [ ] Loading state appears while data fetches
- [ ] No console errors in browser DevTools
- [ ] Amber-on-black color scheme matches rest of app (no white backgrounds, no off-brand colors)

### 5. Styling Constraints

All styling must follow SpectraTerminal conventions:
- **Inline styles only** (no CSS modules, no styled-components)
- Colors from the design system: `#ff9900` (amber), `#000000` (bg), `#00ff41` (gain), `#ff3333` (loss), `#888888` (muted)
- Font: `'JetBrains Mono', monospace` everywhere
- DataTable/DataGrid components from `components/shared/` for tabular data
- No border-radius > 2px (Bloomberg aesthetic is sharp edges)

## Common Frontend Integration Bugs

1. **API response key casing**: Backend may use `snake_case`, frontend types expect `camelCase` → check if Axios interceptor transforms, otherwise map manually
2. **Null initial state**: Dashboard returns 404 or empty before first pipeline run → show "Pipeline not yet run — click Refresh" state
3. **Type narrowing**: `data` from useQuery may be `undefined` during loading → guard all destructuring
4. **Array vs object**: Backend returns `{"assets": [...]}` but component expects just the array → destructure correctly
5. **Date formatting**: Backend sends ISO strings, UI needs "May 5" or "2d away" → format in component
6. **Missing enum values**: If backend adds a regime name the frontend doesn't handle → use fallback/default case in switch statements
7. **Stale fixture imports**: Ensure no component still imports from `fixtures.ts` in production path (fixtures should only be used as fallback)

## Hard Constraints

- Do NOT add any npm dependencies — use only what's already in package.json
- Do NOT use any chart library other than TradingView Lightweight Charts (if charts are needed)
- Do NOT add CSS files or CSS-in-JS — inline styles only
- Do NOT modify the backend
- Do NOT break other screens — verify `EQUI`, `GP`, `OPT` still work after changes
- Preserve the command bar behavior — `MACRO` routes to this screen, other commands still work

## Done Criteria

1. `npm run dev` starts without errors
2. Typing `MACRO` in command bar shows the dashboard
3. All 5 zones render with live data (or graceful empty states)
4. No TypeScript errors (`npx tsc --noEmit` passes)
5. No console errors in browser
6. Other screens (`AAPL`, `AAPL GP`, `PORT`) still function correctly
7. Refresh button triggers pipeline and updates display

## Reporting

When complete, create `frontend/src/components/screens/macro/INTEGRATION_LOG.md` with:
- List of bugs found and fixes applied
- Any backend response shape mismatches discovered
- Screenshots or description of final rendered state
- Any remaining visual polish items
