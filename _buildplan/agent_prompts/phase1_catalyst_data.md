# Agent A4 — Catalyst Calendar Data Layer

## Objective

Implement the catalyst calendar data module that populates the `macro_catalysts` table with forward-looking economic events (FOMC, CPI, PPI, NFP, retail sales, EIA inventories, OPEC meetings) and earnings dates for top SPY constituents. Each catalyst is tagged with which of the 7 macro assets it impacts and carries consensus/prior values where available.

## Pre-flight Reads

1. `backend/macro/models.py` — `CatalystEvent` model
2. `backend/macro/types.py` — `AssetSymbol` enum
3. `backend/providers/fred_provider.py` — understand FRED API access pattern
4. `backend/database.py` — `get_conn()` for SQLite writes
5. `backend/cache.py` — caching pattern

## Scope — Files This Agent Owns

- `backend/macro/data/catalyst.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

Everything outside the file above.

## Interface Contract

```python
# backend/macro/data/catalyst.py

from backend.macro.models import CatalystEvent

async def build_catalyst_calendar(days_forward: int = 21) -> list[CatalystEvent]:
    """
    Build the catalyst calendar for the next N trading days.
    Fetches from FRED release schedule, EIA schedule, earnings calendar.
    Stores in macro_catalysts table. Returns sorted by date.
    """
    ...

async def get_upcoming_catalysts(days: int = 21) -> list[CatalystEvent]:
    """
    Retrieve catalysts from DB for the next N days.
    Used by the frontend to render the timeline.
    """
    ...

async def get_catalyst_density(asset: str, days: int = 14) -> int:
    """Count of catalysts impacting a specific asset in next N days."""
    ...
```

### CatalystEvent model (defined in models.py, do not modify):
```python
class CatalystEvent(BaseModel):
    event_date: str
    event_time: str | None
    event_type: str          # "FOMC", "CPI", "PPI", "NFP", "RETAIL", "EIA", "OPEC", "EARNINGS"
    event_label: str         # Human-readable: "FOMC Rate Decision", "CPI MoM (Apr)"
    assets_impacted: list[AssetSymbol]
    consensus_value: float | None
    prior_value: float | None
    surprise_weight: float   # 1.0 = normal, 1.5 = high-impact, 0.5 = low-impact
    straddle_implied_move: float | None  # Filled later by scoring engine
```

## Implementation Requirements

### Event Sources

**1. FRED Release Calendar API**
```
https://api.stlouisfed.org/fred/releases/dates?api_key={KEY}&file_type=json&include_release_dates_with_no_data=true&offset=0&limit=100
```

Map FRED releases to event types:
| FRED Release | event_type | assets_impacted | surprise_weight |
|---|---|---|---|
| "Consumer Price Index" | CPI | [SPY, VIX, GLD, DXY] | 1.5 |
| "Producer Price Index" | PPI | [SPY, WTI, BRENT] | 1.0 |
| "Employment Situation" | NFP | [SPY, VIX, DXY, GLD] | 1.5 |
| "Advance Retail Sales" | RETAIL | [SPY] | 1.0 |
| "Federal Open Market Committee" | FOMC | [SPY, VIX, GLD, SLV, DXY] | 1.5 |

**2. EIA Weekly Petroleum Status Report**
- Always Wednesday at 10:30 AM ET
- `event_type = "EIA"`, `assets_impacted = [WTI, BRENT]`, `surprise_weight = 1.0`
- Generate Wednesday dates for next 21 days

**3. OPEC Meetings**
- Hardcoded dates for known upcoming meetings (manual maintenance)
- Store as a constant `OPEC_MEETINGS_2025_2026` in the file
- `event_type = "OPEC"`, `assets_impacted = [WTI, BRENT]`, `surprise_weight = 1.5`

**4. Earnings for top SPY constituents**
- Use yfinance to get earnings dates for: AAPL, MSFT, AMZN, NVDA, GOOGL, META, TSLA, BRK-B, JPM, V
- `event_type = "EARNINGS"`, `assets_impacted = [SPY]`, `surprise_weight = 0.5` (individual earnings)
- Only include if within the forward window

### Consensus/Prior Values

For FRED-sourced events (CPI, PPI, NFP, retail sales):
- `prior_value`: fetch from the FRED series (last observation)
- `consensus_value`: not freely available (would need Bloomberg/Refinitiv). Set to `None`.

### Storage

Upsert into `macro_catalysts` table:
- Key: (event_date, event_type, event_label) — prevents duplicates
- On each `build_catalyst_calendar()` call:
  1. Delete events with `event_date < today` (past events)
  2. Upsert new/updated future events

### Caching

- Cache the full calendar build for 6 hours (key: `"macro_catalyst_calendar"`)
- The calendar only needs rebuilding once daily (or on manual refresh)

### Time Handling

- All dates in ISO format (YYYY-MM-DD)
- Event times in ET (Eastern Time) where known
- FOMC: 2:00 PM ET
- CPI/PPI/NFP/Retail: 8:30 AM ET
- EIA: 10:30 AM ET

### Error Handling

- If FRED release API fails, return cached/stored events from DB
- If yfinance earnings dates fail, omit earnings events (don't crash)
- If no FRED_API_KEY, skip FRED-sourced events and log warning

## Test Requirements

Create `backend/macro/data/tests/test_catalyst.py`:
1. Mock FRED releases API response, verify correct mapping to CatalystEvents.
2. Test EIA Wednesday date generation.
3. Test that OPEC hardcoded dates are in the future (or update them).
4. Mock yfinance earnings dates, verify extraction.
5. Test DB upsert (no duplicates on repeated calls).
6. Test `get_catalyst_density()` count.
7. Test past-event cleanup.

Run: `cd backend && python -m pytest macro/data/tests/test_catalyst.py -v`

## Hard Constraints

- No new pip dependencies.
- Do not modify any existing file.
- FRED_API_KEY from env (same one used by existing FRED provider).
- yfinance for earnings dates only — do not reimplement what agent A3 does.

## Done Criteria

- [ ] `build_catalyst_calendar()` populates macro_catalysts with FOMC, CPI, PPI, NFP, RETAIL, EIA events
- [ ] OPEC meetings included from hardcoded schedule
- [ ] Earnings dates for top 10 SPY names included
- [ ] `get_upcoming_catalysts()` retrieves sorted list from DB
- [ ] `get_catalyst_density()` counts correctly per asset
- [ ] Past events cleaned up on rebuild
- [ ] Caching works
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A4_catalyst_data.md`
