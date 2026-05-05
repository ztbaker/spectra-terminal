# Agent A1 — FRED Macro Scoring Data Client

## Objective

Implement the FRED-sourced data fetching module for the MACRO options intelligence system. This module fetches all FRED economic series required by the four scoring factors: real-rate, risk-appetite, dollar-liquidity, and growth-inflation. It returns structured data normalized into the `ScoringInputs` shape consumed by the scoring engine.

## Pre-flight Reads

Before writing any code, read these files in order:
1. `backend/macro/models.py` — the Pydantic models you must return
2. `backend/macro/types.py` — enums and constants (FactorName, FACTOR_WEIGHTS)
3. `backend/providers/fred_provider.py` — the existing FRED provider (reuse its API pattern)
4. `backend/cache.py` — caching mechanism (use `cache_get`/`cache_set` with table="macro")
5. `backend/config.py` — where `FRED_API_KEY` is loaded from env

## Scope — Files This Agent Owns

- `backend/macro/data/fred_macro.py` — **create/fill** (currently a stub)

## Scope — Files This Agent Must NOT Touch

Everything else. Specifically:
- Any file outside `backend/macro/data/fred_macro.py`
- `backend/providers/fred_provider.py` (read-only reference)
- `backend/routers/macro.py` (being replaced; don't touch)
- Any frontend file
- `backend/database.py`
- `backend/main.py`

## Interface Contract

```python
# backend/macro/data/fred_macro.py

from backend.macro.models import ScoringInputs, FactorInputSet

async def fetch_scoring_inputs(use_cache: bool = True) -> ScoringInputs:
    """
    Fetch all FRED-sourced inputs for the four scoring factors.
    Returns a ScoringInputs object with per-factor raw data.
    Caches results for 1 hour (3600s).
    """
    ...
```

The `ScoringInputs` model (defined in models.py, do not modify):
```python
class FactorInputSet(BaseModel):
    slow: dict[str, list[float]]      # series_id -> recent values (last 504 trading days = ~2yr)
    fast: dict[str, list[float]]      # series_id -> recent values
    positioning: dict[str, list[float]]  # series_id -> recent values (may be empty if non-FRED)

class ScoringInputs(BaseModel):
    date: str
    real_rate: FactorInputSet
    risk_appetite: FactorInputSet
    dollar_liquidity: FactorInputSet
    growth_inflation: FactorInputSet
```

## Implementation Requirements

### FRED Series to Fetch

**Real-rate factor:**
- Slow: `DFII10` (10Y TIPS real yield)
- Fast: `T5YIFR` (5Y5Y forward inflation expectation)
- Positioning: none from FRED (handled by CFTC agent)

**Risk-appetite factor:**
- Slow: `BAMLH0A0HYM2` (ICE BofA HY OAS), `BAMLC0A4CBBB` (BBB OAS) — compute spread
- Fast: none from FRED (VIX term structure via yfinance, handled by market_data agent)
- Positioning: none from FRED (put/call ratio via CBOE/yfinance)

**Dollar-liquidity factor:**
- Slow: `WALCL` (Fed total assets), `WTREGEN` (TGA balance), `RRPONTSYD` (RRP) — compute net: WALCL - WTREGEN - RRPONTSYD
- Fast: `DGS2` (2Y Treasury), plus note that DE/JP differentials come from ECB/yfinance (out of scope)
- Positioning: none from FRED

**Growth-inflation factor:**
- Slow: `MANEMP` (ISM Manufacturing Employment as PMI proxy), or use `ISM/PMI` if available
- Fast: `T10Y2Y` (5s30s not available; use 10Y-2Y as proxy)
- Positioning: none from FRED

### Data Fetching Pattern

Use `httpx.AsyncClient` (already available in the project). Pattern:
```python
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

async def _fetch_series(series_id: str, start: str, api_key: str) -> list[float]:
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
        "sort_order": "asc",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(FRED_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()
        observations = data.get("observations", [])
        return [float(o["value"]) for o in observations if o["value"] != "."]
```

### Caching

- Cache the full `ScoringInputs` as JSON under key `"macro_scoring_inputs"` in the macro cache table.
- TTL: 3600 seconds (1 hour).
- If `use_cache=True` and cache is fresh, return cached data.
- On cache miss, fetch all series concurrently with `asyncio.gather`.

### Error Handling

- If a series fetch fails, log the error and return an empty list for that series (don't crash the whole function).
- If ALL series fail, raise an appropriate exception.
- The 2-year lookback window: set `observation_start` to `(today - 730 days)`.

### Edge Cases

- FRED returns `"."` for missing values — filter these out.
- Some series (like WALCL) are weekly, not daily. Return whatever frequency FRED provides; the normalizer will handle interpolation.
- API key comes from `os.getenv("FRED_API_KEY", "")`. If empty, raise immediately with a clear error.

## Test Requirements

Create `backend/macro/data/tests/test_fred_macro.py`:
1. Unit test: mock httpx responses for each series, verify `ScoringInputs` is correctly assembled.
2. Test that missing values (`"."`) are filtered.
3. Test that cache is used when available.
4. Test graceful degradation when one series fails.

Run: `cd backend && python -m pytest macro/data/tests/test_fred_macro.py -v`

## Hard Constraints

- No new pip dependencies (httpx and asyncio already available).
- Do not modify any file outside your owned file.
- Do not modify the `ScoringInputs` or `FactorInputSet` model definitions.
- Do not call yfinance — that's handled by agent A3.
- Use only free FRED API (no paid addons).

## Done Criteria

- [ ] `fetch_scoring_inputs()` returns valid `ScoringInputs` with data from all specified FRED series
- [ ] Caching works (second call within TTL returns cached data)
- [ ] Graceful degradation tested (one series failure doesn't crash)
- [ ] All tests pass
- [ ] No imports from files outside `backend/macro/` except standard lib, httpx, pydantic, and `backend/cache.py`
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A1_fred_macro_data.md`
