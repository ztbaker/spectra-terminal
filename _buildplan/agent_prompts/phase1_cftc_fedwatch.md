# Agent A2 — CFTC Commitments of Traders + CME FedWatch Scrapers

## Objective

Implement two scrapers: (1) CFTC Commitments of Traders weekly report parser that extracts net positioning for DXY, gold, silver, and oil futures, and (2) CME FedWatch probability extractor for Fed rate decision expectations. Both store results in SQLite and expose async functions consumed by the scoring engine.

## Pre-flight Reads

1. `backend/macro/models.py` — `CftcPosition`, `FedWatchState` models
2. `backend/macro/types.py` — `AssetSymbol` enum
3. `backend/database.py` — understand `get_conn()` pattern for SQLite access
4. `backend/cache.py` — caching pattern
5. `backend/providers/cboe_provider.py` — reference for scraping pattern in this project

## Scope — Files This Agent Owns

- `backend/macro/data/cftc_scraper.py` — **create/fill**
- `backend/macro/data/fedwatch.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

Everything outside the two files above. Do not modify database.py, models.py, types.py, or any existing provider.

## Interface Contract

```python
# backend/macro/data/cftc_scraper.py

from backend.macro.models import CftcPosition

async def fetch_cot_positions() -> list[CftcPosition]:
    """
    Fetch latest CFTC COT data for macro-relevant assets.
    Returns positioning data for: Gold (GC), Silver (SI), Crude Oil (CL), US Dollar Index (DX).
    Stores in macro_cftc_positions table. Returns most recent report data.
    """
    ...

async def get_historical_positions(asset: str, lookback_weeks: int = 104) -> list[CftcPosition]:
    """Get historical COT data from DB for percentile ranking."""
    ...
```

```python
# backend/macro/data/fedwatch.py

from backend.macro.models import FedWatchState

async def fetch_fedwatch_probs() -> FedWatchState:
    """
    Fetch CME FedWatch implied probabilities for next 3 FOMC meetings.
    Returns current rate expectations and implied move direction.
    """
    ...
```

### Models (defined in models.py, do not modify):
```python
class CftcPosition(BaseModel):
    report_date: str
    asset: str              # "GC", "SI", "CL", "DX"
    net_long: int           # Net speculative long contracts
    pct_oi: float           # Net as % of open interest
    change_1w: int          # Week-over-week change

class FedWatchState(BaseModel):
    as_of: str
    meetings: list[FedWatchMeeting]
    implied_direction: str  # "hawkish", "dovish", "neutral"

class FedWatchMeeting(BaseModel):
    date: str
    prob_hike: float        # 0-100
    prob_hold: float        # 0-100
    prob_cut: float         # 0-100
    implied_rate: float
```

## Implementation Requirements

### CFTC COT Scraper

**Data source:** CFTC publishes weekly reports at `https://www.cftc.gov/dea/futures/deacmelf.htm` (CME futures) and `https://www.cftc.gov/dea/futures/financial_lf.htm` (financials including DX).

**Alternative (preferred):** Use the CFTC bulk CSV download:
- URL: `https://www.cftc.gov/dea/newcot/deacom.txt` (commodities short format)
- URL: `https://www.cftc.gov/dea/newcot/FinFutWk.txt` (financials short format)

These are pipe-delimited CSVs updated weekly.

**Relevant contract codes:**
- Gold: Market_and_Exchange_Names contains "GOLD"
- Silver: "SILVER"
- Crude Oil: "CRUDE OIL, LIGHT SWEET"
- US Dollar Index: "U.S. DOLLAR INDEX" (in financials file)

**Extract:** Net speculative position = NonComm_Long - NonComm_Short. Pct OI = net / Open_Interest * 100.

**Storage:** Upsert into `macro_cftc_positions` table (keyed on report_date + asset).

**Caching:** Cache raw CSV for 6 hours (reports only change weekly). Use macro_input_cache with key `"cftc_cot_raw"`.

### FedWatch Scraper

**Data source:** CME FedWatch tool data is available via their API endpoint that the web tool uses. The public endpoint pattern:
```
https://www.cmegroup.com/services/fed-funds-futures/fed-fund-futures-probability.html
```

**Alternative approach (more reliable):** Derive FedWatch-equivalent probabilities from Fed Funds futures prices available via yfinance:
- Tickers: `ZQ=F` (30-day Fed Funds futures, current month), next months follow pattern
- Current effective rate: from FRED series `EFFR`
- Probability calculation: `P(hike) = (futures_rate - current_rate) / 0.25` (simplified)

**Implement the yfinance-derived approach** since CME's web API may change without notice. Fall back to a simple "implied_direction" based on whether the futures curve is pricing cuts or hikes.

**Caching:** Cache for 1 hour. Use macro_input_cache with key `"fedwatch_state"`.

### Error Handling

- CFTC site may be down or slow (government server). Set timeout to 60s. On failure, return data from DB (last stored report).
- If no historical COT data exists in DB, return empty list (don't crash).
- FedWatch: if yfinance fails for Fed Funds futures, return a FedWatchState with `implied_direction="unknown"` and empty meetings list.

### Dependencies

- `beautifulsoup4` + `lxml` for HTML parsing (if needed for CFTC fallback)
- `httpx` for async HTTP
- `pandas` for CSV parsing
- All already available or approved in master plan

## Test Requirements

Create `backend/macro/data/tests/test_cftc_fedwatch.py`:
1. CFTC: Mock the CSV download response, verify parsing extracts correct net positions.
2. CFTC: Verify DB upsert logic (duplicate report_date + asset doesn't create duplicates).
3. CFTC: Test fallback to DB data when fetch fails.
4. FedWatch: Mock yfinance futures data, verify probability calculation.
5. FedWatch: Test graceful degradation.

Run: `cd backend && python -m pytest macro/data/tests/test_cftc_fedwatch.py -v`

## Hard Constraints

- New dependencies allowed: `beautifulsoup4`, `lxml` (pre-approved in master plan).
- Do not modify any existing file.
- Do not import from `backend/providers/` — this module is self-contained.
- No API keys required (CFTC is public, FedWatch is derived from yfinance).

## Done Criteria

- [ ] `fetch_cot_positions()` returns valid `list[CftcPosition]` with data for GC, SI, CL, DX
- [ ] COT data persisted to `macro_cftc_positions` table
- [ ] `get_historical_positions()` retrieves from DB correctly
- [ ] `fetch_fedwatch_probs()` returns valid `FedWatchState`
- [ ] Caching works for both functions
- [ ] Graceful degradation tested
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A2_cftc_fedwatch.md`
