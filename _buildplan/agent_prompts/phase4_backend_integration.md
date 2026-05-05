# Agent A15 — Backend Integration & Debug

## Objective

Run the complete MACRO pipeline end-to-end, identify all integration failures between the data layer (Phase 1), engine layer (Phase 2), and infrastructure layer (Phase 3), and fix them. This agent's job is to make `POST /api/macro/refresh` return a valid `MacroDashboardResponse` with real data flowing through every stage.

## Pre-flight Reads

1. `backend/macro/models.py` — canonical response shapes
2. `backend/macro/types.py` — enums and constants
3. `backend/macro/data/` — all 6 data modules (understand return types)
4. `backend/macro/engine/` — all 5 engine modules (understand input/output contracts)
5. `backend/macro/narrative/synthesizer.py` — narrative pipeline
6. `backend/macro/scheduler.py` — the pipeline orchestrator that calls everything
7. `backend/macro/router.py` — FastAPI endpoints
8. `backend/main.py` — router registration
9. `backend/database.py` — table schemas (especially macro tables)
10. `backend/cache.py` — cache layer

## Scope — What This Agent Does

This is a **debugging and integration agent**, not a feature agent. You:

1. Start the backend server (`uvicorn main:app --reload`)
2. Hit `POST /api/macro/refresh` and `GET /api/macro/dashboard`
3. Trace every failure from HTTP response back to root cause
4. Fix cross-module issues: mismatched types, wrong import paths, missing awaits, incorrect dict keys, serialization errors, database write failures
5. Verify the full pipeline produces a valid `MacroDashboardResponse`

## Files This Agent May Modify

**Any file in `backend/macro/`** — this agent has full write access to the macro package because integration bugs can live anywhere.

Additionally:
- `backend/main.py` — only if router registration is broken
- `backend/database.py` — only if table schema doesn't match what code writes
- `backend/cache.py` — only if cache operations fail

## Files This Agent Must NOT Touch

- Frontend files (any `.tsx`, `.ts`, `.css` in `frontend/`)
- Existing routers outside macro (`routers/*.py`)
- Provider files (`providers/*.py`)
- Config files (`config.py`, `.env`)
- Test infrastructure outside `macro/`

## Debugging Methodology

### Step 1: Smoke Test
```bash
cd backend
source .venv/bin/activate
python -c "from macro.scheduler import run_macro_pipeline; import asyncio; asyncio.run(run_macro_pipeline())"
```

If this crashes, you have your first bug. Fix it, re-run, repeat until it returns a dict.

### Step 2: API Test
```bash
uvicorn main:app --port 8000 &
sleep 2
curl -X POST http://localhost:8000/api/macro/refresh
curl http://localhost:8000/api/macro/dashboard | python -m json.tool
```

### Step 3: Validate Response Shape
The response from `/api/macro/dashboard` must match `MacroDashboardResponse`:
```python
{
    "regime": { "name": str, "conviction": str, "age_days": int, "coherence": float },
    "assets": [ { "symbol": str, "scores": {...}, "iv_rank": {...}, ... } ],
    "catalysts": [ { "event_date": str, "event_type": str, ... } ],
    "trade_ideas": [ { "asset": str, "direction": str, ... } ],
    "narrative": { "stage1_raw": str, "stage2_final": str, "model_used": str, "generated_at": str }
}
```

### Step 4: Data Quality
- Verify `regime.name` is one of: Disinflation/Risk-On, Stagflation/Defensive, Flight-to-Quality, Reflation, Mixed/No-Edge
- Verify at least 5 assets appear in the `assets` array
- Verify scores have all three horizons (5d, 10d, 21d)
- Verify narrative is non-empty (even if LLM fallback to "Narrative generation failed")
- Verify catalysts include at least FOMC and CPI if within 21 days

## Common Integration Bugs to Watch For

1. **Type mismatches**: Engine expects `ScoringInputs` but data layer returns raw dict → fix by wrapping in model constructor
2. **Missing awaits**: Calling `async def` without `await` → returns coroutine instead of data
3. **Import cycles**: Engine imports data, data imports types from engine → fix by keeping shared types in `macro/types.py`
4. **Database column mismatches**: Code writes `iv_rank_pct` but table column is `iv_rank` → fix to match schema in `database.py`
5. **JSON serialization**: Pydantic models need `.model_dump()` before `json.dumps()` → use model's `.model_dump_json()` or manual conversion
6. **Enum string mismatches**: Code uses `RegimeName.REFLATION` but comparison uses raw string `"Reflation"` → use `.value` consistently
7. **None propagation**: If FRED is down, `fetch_scoring_inputs()` may return partial data → engine must handle None gracefully
8. **Cache key format**: `cache_get("macro", key, ttl)` requires `key` to be a string matching `macro_input_cache.input_key`

## Hard Constraints

- Do NOT stub out or mock any data fetcher — the pipeline must hit real APIs (FRED, yfinance, etc.)
- Do NOT weaken type validation — if a model field is required, ensure the pipeline provides it
- Do NOT add new dependencies (no new pip packages)
- Do NOT change the public API response shape defined in `MacroDashboardResponse`
- If an external API is unreachable (rate limit, network), the pipeline should degrade gracefully (return cached or partial data), not crash

## Done Criteria

1. `POST /api/macro/refresh` returns 200 with a valid JSON body
2. `GET /api/macro/dashboard` returns a response that validates against `MacroDashboardResponse`
3. All 7 assets have non-null score data
4. Regime classification is non-null
5. No Python tracebacks in server logs during a normal refresh cycle
6. Running `pytest backend/macro/` passes (if tests exist from prior agents)

## Reporting

When complete, create `backend/macro/INTEGRATION_LOG.md` with:
- List of bugs found and fixes applied
- Any external API issues encountered (rate limits, schema changes)
- Current pipeline execution time
- Any remaining known issues or edge cases
