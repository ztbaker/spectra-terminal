# MACRO Frontend Integration Log

## Date: 2026-05-05

## Summary

Wired MACRO frontend components to the live backend API via React Query hooks, replacing direct API calls in the container component with a dedicated hooks module. Fixed a critical `border_state` enum mapping mismatch between backend and frontend.

## Changes Made

### New Files

1. **`hooks.ts`** — React Query hooks module
   - `useMacroDashboard()`: Fetches `/api/macro/dashboard`, normalizes `border_state` values, uses `placeholderData` from fixtures for instant display, 5-min refetch interval
   - `useMacroRefresh()`: POST to `/api/macro/refresh`, invalidates dashboard query on success

### Modified Files

2. **`MacroIntelScreen.tsx`** — Refactored to use `useMacroDashboard()` and `useMacroRefresh()` from `hooks.ts` instead of inline `useQuery`/`useMutation` calls. Removed direct imports of `useQuery`, `useMutation`, `fetchMacroDashboard`, and `refreshMacro`. All other rendering logic unchanged.

## Bugs Found and Fixed

1. **`border_state` enum mismatch**: Backend returns `"bullish"`, `"bearish"`, `"neutral"` but frontend types expect `"green"`, `"yellow"`, `"muted"`. Added `BORDER_STATE_MAP` normalization in `hooks.ts` that maps `bullish→green`, `bearish→yellow`, `neutral→muted`. Without this fix, `AssetGrid` cards would render with no border color (`undefined` → fallback).

## Backend Response Shape Verification

- `/api/macro/dashboard` returns `MacroDashboardResponse` with snake_case keys matching frontend types exactly
- `asset_scores` is a `dict[str, AssetScoreCard]` (object keyed by asset symbol) — matches frontend `Record<string, AssetScoreCard>`
- `dte_range` on trade ideas is a tuple `[min, max]` — serializes as JSON array, matches frontend type
- All other fields align 1:1 between backend Pydantic models and frontend TypeScript interfaces

## No New Dependencies Added

All changes use existing dependencies: `@tanstack/react-query`, `axios` (via `lib/api`).

## TypeScript & Build Verification

- `npx tsc --noEmit` — passes with zero errors
- `npx vite build` — succeeds (891KB bundle, pre-existing chunk warning unrelated to changes)
- All other screens (EQUITY, GP, OPT, etc.) have zero import dependencies on macro module files