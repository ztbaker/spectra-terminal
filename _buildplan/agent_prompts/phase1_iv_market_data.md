# Agent A3 — IV30 Logger + Market Data (yfinance)

## Objective

Implement two modules: (1) a daily IV30 logger that records implied volatility for each of the 7 macro assets and computes IV rank percentiles, and (2) a market data module that fetches real-time prices, VIX term structure, put/call ratio, copper/gold ratio, and ATM straddle pricing. Both use yfinance as the primary data source.

## Pre-flight Reads

1. `backend/macro/models.py` — `AssetSnapshot`, `IVRankData`, `VIXTermStructure` models
2. `backend/macro/types.py` — `AssetSymbol` enum, `ASSETS` list
3. `backend/providers/yfinance_provider.py` — existing yfinance usage pattern
4. `backend/database.py` — `get_conn()` for SQLite access
5. `backend/cache.py` — caching pattern

## Scope — Files This Agent Owns

- `backend/macro/data/iv_logger.py` — **create/fill**
- `backend/macro/data/market_data.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

Everything outside the two files above.

## Interface Contract

```python
# backend/macro/data/iv_logger.py

from backend.macro.models import IVRankData

async def log_daily_iv30() -> None:
    """
    Fetch current IV30 for each macro asset and store in macro_iv30_history.
    Called once daily by the scheduler. Idempotent for the same date.
    """
    ...

async def get_iv_rank(asset: str) -> IVRankData:
    """
    Compute IV rank for an asset: current IV30 as percentile of last 252 trading days.
    Returns IVRankData with current_iv30, rank_pct, and sufficient_history flag.
    """
    ...

async def get_all_iv_ranks() -> dict[str, IVRankData]:
    """Get IV rank for all 7 macro assets."""
    ...
```

```python
# backend/macro/data/market_data.py

from backend.macro.models import AssetSnapshot, VIXTermStructure, StraddlePricing

async def fetch_asset_prices() -> dict[str, AssetSnapshot]:
    """
    Fetch current price, 1d/5d/21d changes for all 7 macro assets.
    Uses yfinance. Caches for 60 seconds.
    """
    ...

async def fetch_vix_term_structure() -> VIXTermStructure:
    """
    Fetch VIX spot vs VIX3M (3-month VIX futures).
    Ratio < 1 = contango (complacency). Ratio > 1 = backwardation (fear).
    """
    ...

async def fetch_put_call_ratio() -> float:
    """
    Fetch CBOE equity put/call ratio. Uses ^PCALL or derives from options volume.
    """
    ...

async def fetch_copper_gold_ratio() -> float:
    """
    Fetch HG (copper) / GC (gold) price ratio — growth/inflation indicator.
    """
    ...

async def fetch_atm_straddle_price(asset: str, dte_target: int = 14) -> StraddlePricing | None:
    """
    Fetch ATM straddle price for an asset using yfinance options chain.
    Selects the expiry closest to dte_target days. Returns implied move as % of spot.
    """
    ...
```

### Models (defined in models.py, do not modify):
```python
class IVRankData(BaseModel):
    asset: str
    current_iv30: float | None
    rank_pct: float | None         # 0-100, None if insufficient history
    sufficient_history: bool        # True if >= 126 days of data (6 months)
    history_days: int               # How many days of IV30 we have

class AssetSnapshot(BaseModel):
    asset: str
    price: float | None
    change_1d_pct: float | None
    change_5d_pct: float | None
    change_21d_pct: float | None
    volume: float | None

class VIXTermStructure(BaseModel):
    vix_spot: float | None
    vix3m: float | None
    ratio: float | None            # spot / 3m — >1 = backwardation
    in_backwardation: bool

class StraddlePricing(BaseModel):
    asset: str
    expiry: str
    dte: int
    atm_strike: float
    call_price: float
    put_price: float
    straddle_price: float
    implied_move_pct: float        # straddle_price / spot_price * 100
```

## Implementation Requirements

### yfinance Ticker Mapping

```python
YFINANCE_TICKERS = {
    "SPY": "SPY",
    "VIX": "^VIX",
    "GLD": "GLD",
    "SLV": "SLV",
    "DXY": "DX-Y.NYB",
    "WTI": "CL=F",
    "BRENT": "BZ=F",
}

# Additional tickers for scoring inputs
EXTRA_TICKERS = {
    "VIX3M": "^VIX3M",       # 3-month VIX
    "COPPER": "HG=F",         # Copper futures
    "GOLD_FUTURES": "GC=F",   # Gold futures (for copper/gold ratio)
}
```

### IV30 Calculation

IV30 for each asset is the average implied volatility of ATM options with ~30 DTE:
1. Get options chain for the expiry closest to 30 days out
2. Find the two strikes closest to current price (ATM)
3. Average their implied_volatility values
4. If options data unavailable (e.g., VIX, DXY), use `yfinance.Ticker.info.get("impliedVolatility")` or mark as None

### IV Rank Calculation

```python
iv_rank = (current_iv30 - min(last_252_values)) / (max(last_252_values) - min(last_252_values)) * 100
```

If `max == min`, return 50 (neutral). If fewer than 126 days of history, set `sufficient_history = False` and `rank_pct = None`.

### Price Changes

Use `yfinance.Ticker.history(period="1mo")` to compute:
- 1d change: `(today_close / yesterday_close - 1) * 100`
- 5d change: `(today_close / close_5_days_ago - 1) * 100`
- 21d change: `(today_close / close_21_days_ago - 1) * 100`

### ATM Straddle Pricing

1. Get options chain for expiry closest to `dte_target`
2. Find strike closest to current price
3. Get call price (mid of bid/ask) and put price (mid of bid/ask) at that strike
4. `implied_move_pct = (call_mid + put_mid) / spot_price * 100`

### Caching

- `fetch_asset_prices()`: 60-second cache (key: `"macro_asset_prices"`)
- `fetch_vix_term_structure()`: 300-second cache
- `fetch_put_call_ratio()`: 300-second cache
- `fetch_copper_gold_ratio()`: 300-second cache
- `fetch_atm_straddle_price()`: 300-second cache per asset
- IV logger: no cache (writes directly to DB, called once daily)

### Error Handling

- yfinance sometimes returns empty DataFrames — check `.empty` before processing.
- Options chains may not exist for DXY or BRENT — return None for those assets' IV data.
- VIX3M ticker may fail — if so, set `VIXTermStructure.vix3m = None`, `ratio = None`.
- Never let one asset's failure crash the entire batch. Use `asyncio.gather(return_exceptions=True)`.

## Test Requirements

Create `backend/macro/data/tests/test_iv_market.py`:
1. Mock yfinance Ticker and verify `fetch_asset_prices()` returns correct snapshots.
2. Test IV30 calculation with mocked options chain data.
3. Test IV rank calculation with known historical values.
4. Test `sufficient_history = False` when < 126 days.
5. Test straddle pricing calculation.
6. Test VIX term structure ratio.
7. Test graceful degradation when yfinance returns empty data.

Run: `cd backend && python -m pytest macro/data/tests/test_iv_market.py -v`

## Hard Constraints

- No new pip dependencies (yfinance, pandas, numpy already available).
- Do not modify any existing file.
- Do not call FRED API — that's agent A1's domain.
- yfinance calls should use `Threads=True` parameter where available for non-blocking IO.

## Done Criteria

- [ ] `log_daily_iv30()` stores IV30 data in `macro_iv30_history` for all assets with options
- [ ] `get_iv_rank()` correctly computes percentile rank
- [ ] `get_all_iv_ranks()` returns data for all 7 assets (some may be None)
- [ ] `fetch_asset_prices()` returns `AssetSnapshot` for all 7 assets
- [ ] `fetch_vix_term_structure()` returns valid ratio
- [ ] `fetch_atm_straddle_price()` returns pricing for SPY, GLD, SLV (at minimum)
- [ ] Caching works correctly
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A3_iv_market_data.md`
