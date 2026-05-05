# A14 — Frontend Live Integration + AGENTS.md Update

## Status: COMPLETE

## Changes Made

### 1. `frontend/src/lib/api.ts`
- Updated import: removed `MacroDashboard` from `../types`, added `MacroDashboardResponse`, `RegimeReading`, `CatalystEvent`, `TradeIdea`, `NarrativeOutput` from `../components/screens/macro/types`
- Changed `fetchMacroDashboard` return type from `MacroDashboard` → `MacroDashboardResponse`
- Added 5 new API functions:
  - `fetchMacroRegime()` → `GET /macro/regime`
  - `fetchMacroCatalysts()` → `GET /macro/catalysts`
  - `fetchMacroIdeas()` → `GET /macro/ideas`
  - `fetchMacroNarrative()` → `GET /macro/narrative`
  - `refreshMacro()` → `POST /macro/refresh`

### 2. `frontend/src/components/screens/macro/MacroIntelScreen.tsx`
- Replaced local `fetchMacroIntel` with imports from `api.ts` (`fetchMacroDashboard`, `refreshMacro`)
- Replaced `useState(useFixtures)` with computed `useFixtures = isError || !data`
- Added `useMutation` for refresh button (`refreshMacro` → `refetch`)
- Replaced `ZonePlaceholder` components with live sub-components:
  - `AssetGrid` with `assets` + `loading` props
  - `CatalystCalendar` with `catalysts` + `loading` props
  - `TradeReadyTable` with `ideas` + `loading` props
  - `TodaysRead` with `narrative` + `loading` props
- Added staleness banner when `dashboard?.stale === true`
- Added error banner when `isError` is true
- Fixture fallback via `data ?? fixtureDashboard` pattern
- Refresh button uses `useMutation` with `onSuccess: refetch`

### 3. `frontend/src/App.tsx`
- Changed import: `MacroScreen` → `MacroIntelScreen` (from `./components/screens/macro/MacroIntelScreen`)
- Changed render: `<MacroScreen>` → `<MacroIntelScreen>` in `case 'macro':`
- Old `MacroScreen.tsx` left in place (not deleted)

### 4. `AGENTS.md`
- Appended MACRO Intelligence Subsystem section with:
  - Overview, tech stack, database tables, modules, API endpoints, cron schedule, LLM usage

## TypeScript
- `npx tsc --noEmit` passes cleanly with zero errors

## Done Criteria Checklist
- [x] `api.ts` has all 6 macro fetch functions
- [x] `MacroIntelScreen.tsx` uses React Query to fetch live data
- [x] Fixture fallback works when API unavailable
- [x] Refresh button works (triggers mutation → refetches)
- [x] Staleness banner shows when data is stale
- [x] `App.tsx` imports and renders `MacroIntelScreen` for 'macro' case
- [x] TypeScript compiles cleanly
- [x] `AGENTS.md` updated with MACRO subsystem documentation
- [x] Old `MacroScreen.tsx` still exists (not deleted)