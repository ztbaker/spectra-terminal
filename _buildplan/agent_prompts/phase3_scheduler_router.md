# Agent A13 — Scheduler + API Router + Integration Wiring

## Objective

Implement the scheduler (APScheduler-based cron that runs the full MACRO pipeline at 5am ET daily) and the FastAPI router that exposes all MACRO endpoints. This agent also applies the database migration (new tables) and wires the router into `main.py`. This is the backend integration agent — it connects all Phase 1 and Phase 2 modules into a working pipeline.

## Pre-flight Reads

1. `backend/macro/models.py` — all response models (MacroDashboardResponse, etc.)
2. `backend/macro/types.py` — enums
3. `backend/macro/data/` — all data modules (understand their async functions)
4. `backend/macro/engine/` — all engine modules (ScoringEngine, RegimeClassifier, CatalystAligner, TradeFilter)
5. `backend/macro/narrative/synthesizer.py` — NarrativeSynthesizer
6. `backend/main.py` — how routers are registered
7. `backend/database.py` — how init_db() works and table creation pattern
8. `backend/cache.py` — need to add macro cache table entry

## Scope — Files This Agent Owns

- `backend/macro/scheduler.py` — **create/fill**
- `backend/macro/router.py` — **create/fill**

## Scope — Files This Agent May Modify (carefully)

- `backend/main.py` — add macro router import + include_router (replace old macro import)
- `backend/database.py` — add `_init_macro_tables(conn)` function call in `init_db()`
- `backend/cache.py` — add `"macro"` entry to `_TABLE_MAP`

## Scope — Files This Agent Must NOT Touch

- Frontend files
- Existing routers (except removing old macro.py import from main.py)
- Provider files
- Model/type files in macro/

## Interface Contract

```python
# backend/macro/scheduler.py

from fastapi import FastAPI

def setup_scheduler(app: FastAPI) -> None:
    """
    Configure APScheduler to run the MACRO pipeline:
    - Daily at 5:00 AM ET
    - Twice on FOMC/CPI days (5:00 AM and 6:00 AM ET)
    Attaches scheduler lifecycle to FastAPI app startup/shutdown.
    """
    ...

async def run_macro_pipeline() -> dict:
    """
    Execute the full MACRO pipeline:
    1. Fetch all data (FRED, CFTC, market data, catalysts)
    2. Log IV30
    3. Run scoring engine
    4. Classify regime
    5. Evaluate catalyst alignment
    6. Run trade filter
    7. Generate narrative
    Returns summary dict for logging.
    """
    ...
```

```python
# backend/macro/router.py

from fastapi import APIRouter

router = APIRouter()

# GET /macro/dashboard — full dashboard state
# GET /macro/regime — regime reading only
# GET /macro/catalysts — catalyst calendar
# GET /macro/ideas — trade ideas only
# GET /macro/narrative — narrative only
# POST /macro/refresh — trigger manual pipeline run
```

## Implementation Requirements

### Scheduler (scheduler.py)

**APScheduler setup:**
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

ET = pytz.timezone("US/Eastern")

def setup_scheduler(app: FastAPI):
    scheduler = AsyncIOScheduler()
    
    # Daily 5am ET
    scheduler.add_job(
        run_macro_pipeline,
        CronTrigger(hour=5, minute=0, timezone=ET),
        id="macro_daily",
        replace_existing=True,
    )
    
    # Note: FOMC/CPI double-run is handled by checking if today is a catalyst day
    # and scheduling an additional run at 6am (see below)
    
    @app.on_event("startup")
    async def start_scheduler():
        scheduler.start()
    
    @app.on_event("shutdown")
    async def stop_scheduler():
        scheduler.shutdown(wait=False)
```

**FOMC/CPI double-run:**
After the 5am run completes, check if today has a FOMC or CPI catalyst. If yes, schedule a one-shot job at 6am ET for that day.

**Pipeline execution:**
```python
async def run_macro_pipeline():
    import logging
    logger = logging.getLogger("macro.pipeline")
    
    try:
        # 1. Fetch data
        from backend.macro.data.fred_macro import fetch_scoring_inputs
        from backend.macro.data.cftc_scraper import fetch_cot_positions
        from backend.macro.data.market_data import fetch_asset_prices
        from backend.macro.data.iv_logger import log_daily_iv30, get_all_iv_ranks
        from backend.macro.data.catalyst import build_catalyst_calendar
        
        # Run data fetches concurrently
        import asyncio
        scoring_inputs, _, _, _, _ = await asyncio.gather(
            fetch_scoring_inputs(use_cache=False),
            fetch_cot_positions(),
            fetch_asset_prices(),
            log_daily_iv30(),
            build_catalyst_calendar(),
        )
        
        # 2. Run engine
        from backend.macro.engine.scoring import ScoringEngine
        from backend.macro.engine.regime import RegimeClassifier
        from backend.macro.engine.catalyst_align import CatalystAligner
        from backend.macro.engine.filter import TradeFilter
        
        engine = ScoringEngine()
        score_state = await engine.compute(inputs=scoring_inputs)
        
        classifier = RegimeClassifier()
        regime = classifier.classify(score_state)
        
        aligner = CatalystAligner()
        catalyst_alignment = await aligner.evaluate(score_state)
        
        iv_ranks = await get_all_iv_ranks()
        
        trade_filter = TradeFilter()
        ideas = trade_filter.filter(score_state, regime, catalyst_alignment, iv_ranks)
        
        # 3. Generate narrative
        from backend.macro.narrative.synthesizer import NarrativeSynthesizer
        synth = NarrativeSynthesizer()
        narrative = await synth.generate(score_state, regime, ideas, catalyst_alignment)
        
        logger.info("MACRO pipeline complete: regime=%s, ideas=%d", regime.regime.value, len(ideas))
        return {"status": "ok", "regime": regime.regime.value, "ideas": len(ideas)}
        
    except Exception as e:
        logger.error("MACRO pipeline failed: %s", e, exc_info=True)
        return {"status": "error", "error": str(e)}
```

### Router (router.py)

**GET /macro/dashboard:**
```python
@router.get("/macro/dashboard")
async def get_macro_dashboard():
    """
    Return the full dashboard state. Reads from DB/cache — does NOT run the pipeline.
    If no data exists yet, returns a response with stale=True and empty data.
    """
    # Read latest from DB tables: macro_scores, macro_regime_history, macro_catalysts, etc.
    # Assemble MacroDashboardResponse
    ...
```

**GET /macro/regime:**
Return just the RegimeReading from the latest macro_regime_history row.

**GET /macro/catalysts:**
Return upcoming catalysts from macro_catalysts table.

**GET /macro/ideas:**
Return latest trade ideas from macro_trade_ideas table.

**GET /macro/narrative:**
Return latest narrative from macro_narratives table.

**POST /macro/refresh:**
Trigger `run_macro_pipeline()` and return result. This is the manual refresh button's endpoint.

### Database Migration (database.py modification)

Add a new function and call it from `init_db()`:

```python
def _init_macro_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS macro_iv30_history (...);
        CREATE TABLE IF NOT EXISTS macro_scores (...);
        CREATE TABLE IF NOT EXISTS macro_regime_history (...);
        CREATE TABLE IF NOT EXISTS macro_catalysts (...);
        CREATE TABLE IF NOT EXISTS macro_trade_ideas (...);
        CREATE TABLE IF NOT EXISTS macro_narratives (...);
        CREATE TABLE IF NOT EXISTS macro_cftc_positions (...);
        CREATE TABLE IF NOT EXISTS macro_input_cache (...);
    """)
```

(Full schema from scaffolding_changes.md)

### Cache.py Modification

Add to `_TABLE_MAP`:
```python
"macro": ("macro_input_cache", "input_key"),
```

### main.py Modification

Replace:
```python
from routers import macro
```
With:
```python
from macro.router import router as macro_router
```

And replace:
```python
app.include_router(macro.router, prefix="/api")
```
With:
```python
app.include_router(macro_router, prefix="/api")
```

Also add scheduler setup:
```python
from macro.scheduler import setup_scheduler

# After app creation:
setup_scheduler(app)
```

### Dashboard Assembly Logic

The `/macro/dashboard` endpoint assembles from DB:
```python
async def get_macro_dashboard():
    from datetime import date
    today = date.today().isoformat()
    
    # Get regime
    regime = _get_latest_regime()  # query macro_regime_history
    
    # Get asset scores + live prices
    asset_scores = _assemble_asset_cards()  # combine macro_scores + live prices + IV rank
    
    # Get catalysts
    catalysts = _get_upcoming_catalysts()
    
    # Get trade ideas (latest batch)
    ideas = _get_latest_ideas()
    
    # Get narrative
    narrative = _get_today_narrative()
    
    # Staleness check: if regime.date != today, data is stale
    stale = (regime is None or regime.date != today) if regime else True
    
    return MacroDashboardResponse(
        regime=regime or _default_regime(),
        asset_scores=asset_scores,
        catalysts=catalysts,
        trade_ideas=ideas,
        narrative=narrative,
        last_refresh=_get_last_refresh_time(),
        stale=stale,
    )
```

### Error Handling

- `/macro/refresh` should return 200 even if pipeline partially fails (include error details in response).
- All GET endpoints should return valid (possibly empty/stale) data rather than 500.
- If DB tables don't exist yet (first run before scheduler fires), return empty/default state.

## Test Requirements

Create `backend/macro/tests/test_router.py`:
1. Test GET /macro/dashboard returns valid response (empty state).
2. Test POST /macro/refresh triggers pipeline (mock the engine modules).
3. Test GET /macro/regime returns latest regime.
4. Test staleness flag logic.
5. Test that scheduler registers jobs correctly.

Run: `cd backend && python -m pytest macro/tests/test_router.py -v`

## Hard Constraints

- New dependency required: `apscheduler>=3.10` (pre-approved in master plan).
- Modifications to main.py, database.py, cache.py must be minimal and surgical.
- Do not delete the old `backend/routers/macro.py` file — leave it in place but remove its import from main.py (the file can be cleaned up later).
- The scheduler must be timezone-aware (US/Eastern).
- POST /macro/refresh must be idempotent (running twice in a row doesn't corrupt state).

## Done Criteria

- [ ] `scheduler.py` sets up APScheduler with 5am ET cron job
- [ ] `run_macro_pipeline()` executes the full data→engine→narrative pipeline
- [ ] `router.py` exposes all 6 endpoints with correct response models
- [ ] GET /macro/dashboard assembles full state from DB
- [ ] POST /macro/refresh triggers pipeline successfully
- [ ] database.py creates all macro_ tables on init
- [ ] cache.py has macro entry in _TABLE_MAP
- [ ] main.py imports and registers the new macro router
- [ ] All endpoints return valid data even when DB is empty (first run)
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A13_scheduler_router.md`
