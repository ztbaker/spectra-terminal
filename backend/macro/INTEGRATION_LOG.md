# MACRO Pipeline Integration Log

**Date**: 2026-05-05
**Agent**: A15 — Backend Integration & Debug

## Bugs Found and Fixed

### Bug 1: Dashboard `asset_scores` returned empty dict (CRITICAL)
**File**: `macro/router.py` — `_assemble_asset_cards()`
**Root cause**: The `with get_conn() as conn:` context manager closed the connection after the first query, but lines 97-103 referenced `conn` outside the block to fetch the latest scores date and re-query.
**Fix**: Moved all database queries inside a single `with get_conn() as conn:` block.

### Bug 2: `_assemble_asset_cards` was sync but called from async FastAPI handler (CRITICAL)
**File**: `macro/router.py`
**Root cause**: `_assemble_asset_cards()` tried to run async operations (`get_all_iv_ranks`, `fetch_asset_prices`) via `asyncio.get_event_loop().run_until_complete()` which fails when already inside an async event loop (FastAPI). The original code silently caught the exception and returned empty `iv_ranks={}` and `prices={}`.
**Fix**: Created async version `_assemble_asset_cards_async()` that properly awaits coroutines, plus a sync fallback `_assemble_asset_cards_sync()` that reads from cache. The dashboard endpoint now calls the async version. Also extracted `_build_asset_cards()` as a shared helper to avoid duplication.

### Bug 3: Trade ideas never persisted to database (CRITICAL)
**File**: `macro/scheduler.py`
**Root cause**: The pipeline called `TradeFilter.filter()` to generate ideas but never wrote them to the `macro_trade_ideas` table. The router reads from this table, so trade ideas were always empty.
**Fix**: Added `_persist_trade_ideas()` function that writes trade ideas to DB after generation. Called after `TradeFilter.filter()` in `run_macro_pipeline()`.

### Bug 4: `CatalystAligner._get_asset_score` used wrong dict key
**File**: `macro/engine/catalyst_align.py` — line 69
**Root cause**: Used `asset_scores.get("10d", 0.0)` but `ScoringEngine._map_to_assets()` produces keys like `"horizon_10d"`, not `"10d"`.
**Fix**: Changed to `asset_scores.get("horizon_10d", 0.0)`.

### Bug 5: FRED release name mismatch for FOMC catalysts
**File**: `macro/data/catalyst.py`
**Root cause**: `FRED_RELEASE_MAP` keyed `"Federal Open Market Committee"` but the actual FRED API returns `"FOMC Press Release"`. This meant FOMC rate decisions were never matched as catalyst events.
**Fix**: Changed the map key to `"FOMC Press Release"` and added `_RELEASE_NAME_ALIASES` dict for backward-compatible matching of alternative names like `"Federal Open Market Committee"`.

### Bug 6: Duplicate `get_all_iv_ranks()` call in pipeline
**File**: `macro/scheduler.py`
**Root cause**: `get_all_iv_ranks()` was called twice — once in the `asyncio.gather()` and again after scoring. Wasted API calls and time.
**Fix**: Removed the second call, using `iv_ranks_result` from the gather instead. Added `_cache_iv_ranks()` to persist IV rank data for the sync dashboard fallback.

### Bug 7: Test failures from enum key change
**Files**: `macro/data/tests/test_catalyst.py`, `macro/engine/tests/test_catalyst_align.py`
**Root cause**: (a) Test checked for `"Federal Open Market Committee"` key which was renamed. (b) Test used `"10d"` dict key format but code now expects `"horizon_10d"`.
**Fix**: Updated both test files to match the actual key formats.

## External API Issues Encountered

- **BAMLH0A0HYM2** (ICE BofA HY OAS): FRED returns 500 Internal Server Error. The pipeline gracefully degrades — fills positioning bucket with 50th percentile (neutral).
- **FRED Release Calendar**: The `/releases/dates` endpoint returns release dates with `release_name` = `"FOMC Press Release"`, not `"Federal Open Market Committee"`. Fixed in Bug 5.
- **Catalyst Coverage**: With `FRED_API_KEY` configured, CPI/NFP/PPI/RETAIL events are not appearing in the 21-day window. This may be due to the FRED API pagination (1000 items, descending order) and date filtering. The calendar still produces EIA and OPEC events.
- **IV Rank**: All assets return `None` for `iv_rank` because there's only 1 day of IV30 history in the database. The `_MIN_HISTORY_DAYS = 126` threshold prevents rank calculation. This resolves naturally after several months of daily data collection.
- **Narrative**: Falls back to text message since neither Ollama nor ANTHROPIC_API_KEY is configured. Expected behavior — the pipeline doesn't crash.

## Current Pipeline Execution Time

- Full `POST /api/macro/refresh`: ~15-25 seconds (dominated by FRED/yfinance API calls)
- `GET /api/macro/dashboard` (reads from DB): ~1-2 seconds when async path works, ~5-8 seconds if fetching live prices

## Remaining Known Issues / Edge Cases

1. **IV Rank is `None` for all assets**: Requires 126+ days of historical data. Pipeline logs IV30 daily; rank calculation will activate after ~6 months of runs.
2. **FRED API partial failures**: Some series may be temporarily unavailable. The pipeline degrades gracefully to neutral percentiles.
3. **Catalyst calendar limited to EIA/OPEC**: FRED-sourced catalysts (CPI, NFP, PPI, RETAIL, FOMC) require the release dates API to return entries within the 21-day window.
4. **Trade ideas only generated when regime is non-mixed**: `MIXED_NO_EDGE` regime correctly returns zero trade ideas per the 3-confirmation framework.
5. **`_load_prices_from_cache` fallback**: When the dashboard is called from an already-running async context, prices come from cache which may be stale (up to 60s). The async path (`_assemble_asset_cards_async`) fetches fresh data.

## Done Criteria Verification

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `POST /api/macro/refresh` returns 200 with valid JSON | PASS |
| 2 | `GET /api/macro/dashboard` returns MacroDashboardResponse | PASS |
| 3 | All 7 assets have non-null score data | PASS |
| 4 | Regime classification is non-null | PASS (mixed_no_edge — correct for current data) |
| 5 | No Python tracebacks in server logs during refresh | PASS |
| 6 | `pytest macro/` passes | PASS (187/187) |