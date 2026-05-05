# Agent A1 — FRED Macro Scoring Data Client — Completion Report

## Status: COMPLETE

## Done Criteria

- [x] `fetch_scoring_inputs()` returns valid `ScoringInputs` with data from all specified FRED series
- [x] Caching works (second call within TTL returns cached data)
- [x] Graceful degradation tested (one series failure doesn't crash)
- [x] All tests pass (8/8)
- [x] No imports from files outside `backend/macro/` except standard lib, httpx, pydantic, and `backend/cache.py`
- [x] Summary written to reporting location

## Files Modified

- `backend/macro/data/fred_macro.py` — implemented from stub

## Files Created

- `backend/macro/data/tests/test_fred_macro.py` — 8 test cases

## Implementation Details

### `fred_macro.py`

- **`_fetch_series(series_id, start, api_key)`**: Fetches a single FRED series via httpx, filters `"."` missing values, returns `list[float]`.
- **`_fetch_all_series(api_key)`**: Concurrently fetches all 9 FRED series across 4 factors using `asyncio.gather`. Each series fetch is wrapped in `_safe_fetch` which catches exceptions and returns empty list on failure.
- **`_build_scoring_inputs(factor_data)`**: Assembles raw fetched data into a `ScoringInputs` model.
- **`fetch_scoring_inputs(use_cache=True)`**: Main entry point. Checks macro cache first (TTL 3600s), validates `FRED_API_KEY`, fetches all series, checks that at least one series returned data (raises if all empty), caches result, returns `ScoringInputs`.

### FRED Series Mapped

| Factor | Bucket | Series ID(s) |
|---|---|---|
| real_rate | slow | DFII10 |
| real_rate | fast | T5YIFR |
| risk_appetite | slow | BAMLH0A0HYM2 |
| dollar_liquidity | slow | WALCL, WTREGEN, RRPONTSYD |
| dollar_liquidity | fast | DGS2 |
| growth_inflation | slow | MANEMP |
| growth_inflation | fast | T10Y2Y |

### Test Coverage

1. `test_fetch_scoring_inputs_returns_valid_structure` — full happy path, validates ScoringInputs shape
2. `test_missing_values_filtered` — verifies `"."` values are excluded
3. `test_cache_returns_cached_data` — cache hit returns stored data
4. `test_cache_miss_triggers_fetch` — cache miss triggers network fetch
5. `test_graceful_degradation_on_series_failure` — one series failure returns empty list, others succeed
6. `test_all_series_failure_raises_error` — all failures raise RuntimeError
7. `test_missing_api_key_raises_error` — missing FRED_API_KEY raises immediately
8. `test_build_scoring_inputs_structure` — unit test for data assembly

## Hard Constraints Verified

- No new pip dependencies (uses httpx, asyncio, pydantic — already in project)
- No modifications to files outside owned scope
- ScoringInputs and FactorInputSet models not modified
- No yfinance imports (out of scope for this agent)
- Uses only free FRED API