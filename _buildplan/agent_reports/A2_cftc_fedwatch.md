# Agent A2 — CFTC COT + CME FedWatch Completion Report

## Status: COMPLETE

## Files Modified

- `backend/macro/data/cftc_scraper.py` — implemented
- `backend/macro/data/fedwatch.py` — implemented
- `backend/macro/data/tests/test_cftc_fedwatch.py` — new test file

## Implementation Summary

### CFTC COT Scraper (`cftc_scraper.py`)

- `fetch_cot_positions()`: Fetches pipe-delimited CSVs from CFTC (`deacom.txt` for commodities, `FinFutWk.txt` for financials), parses them, and extracts net speculative positions for GC, SI, CL, DX. Net long = NonComm_Long - NonComm_Short. Pct OI = net / Open_Interest * 100. Upserts into `macro_cftc_positions` table (keyed on report_date + asset). Falls back to DB data on fetch failure. Caches raw results for 6 hours via `macro_input_cache`.
- `get_historical_positions(asset, lookback_weeks)`: Queries `macro_cftc_positions` for a specific asset, returning up to `lookback_weeks` records ordered by date descending.
- Internal helpers: `_fetch_raw_csv()`, `_parse_pipe_csv()`, `_extract_positions()`, `_store_positions()`, `_load_from_db()`.

### FedWatch Scraper (`fedwatch.py`)

- `fetch_fedwatch_probs()`: Derives Fed rate probabilities from 30-day Fed Funds futures via yfinance. Computes next 3 FOMC meeting dates, fetches implied rates from futures prices (tickers like `ZQH5.CBT`), and calculates hike/hold/cut probabilities using `P(hike) = (futures_rate - current_rate) / 0.25`. Falls back to `ZQ=F` if specific contract tickers fail. Returns `FedWatchState` with `implied_direction` of "hawkish", "dovish", or "neutral". Caches for 1 hour. Graceful degradation returns `implied_direction="unknown"` with empty meetings on failure.
- Internal helpers: `_next_fomc_dates()`, `_fed_funds_ticker()`, `_compute_probabilities()`, `_determine_direction()`, `_fetch_current_rate()`, `_fetch_futures_rates()`.

## Test Results

```
18 passed in 0.87s
```

### Test Coverage

| Test | Description |
|------|-------------|
| `test_parse_pipe_csv` | Pipe-delimited CSV parsing |
| `test_extract_positions_gold` | Gold net position extraction |
| `test_extract_positions_all_assets` | All 4 assets (GC, SI, CL, DX) extracted |
| `test_extract_pct_oi` | Percentage of open interest calculation |
| `test_extract_empty_data` | Empty DataFrame handling |
| `test_store_and_load` | DB round-trip |
| `test_upsert_no_duplicates` | Duplicate report_date+asset upsert |
| `test_historical_positions` | Historical query by asset |
| `test_fetch_cot_fallback_on_error` | DB fallback on HTTP failure |
| `test_uses_cache` | Cache hit returns cached data |
| `test_next_fomc_dates` | FOMC date generation |
| `test_compute_probabilities_hawkish` | Hawkish probability calculation |
| `test_compute_probabilities_dovish` | Dovish probability calculation |
| `test_compute_probabilities_neutral` | Neutral probability calculation |
| `test_determine_direction` | Direction classification |
| `test_determine_direction_empty` | Empty meetings → unknown |
| `test_graceful_degradation` | FedWatch failure → unknown state |
| `test_cache_hit` | FedWatch cache hit |

## Done Criteria

- [x] `fetch_cot_positions()` returns valid `list[CftcPosition]` with data for GC, SI, CL, DX
- [x] COT data persisted to `macro_cftc_positions` table
- [x] `get_historical_positions()` retrieves from DB correctly
- [x] `fetch_fedwatch_probs()` returns valid `FedWatchState`
- [x] Caching works for both functions
- [x] Graceful degradation tested
- [x] All tests pass
- [x] Summary written to reporting location