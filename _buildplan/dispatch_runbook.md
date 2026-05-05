# Dispatch Runbook

## Pre-Dispatch: Apply Scaffolding

Before any agent runs, the scaffolding must be in place. This is done synchronously after Gate 2 approval:

1. Create directory structure (`backend/macro/`, `frontend/src/components/screens/macro/`)
2. Write `backend/macro/__init__.py`, `types.py`, `models.py` (full content)
3. Write all `__init__.py` files in subdirectories
4. Write stub files for every module (empty functions with correct signatures)
5. Apply database migration (add `_init_macro_tables` to `database.py`)
6. Add cache table entry to `cache.py`
7. Run `cd backend && python -c "from macro.models import *; from macro.types import *; print('OK')"` to verify imports
8. Run `cd frontend && npx tsc --noEmit` to verify TypeScript compiles

**Verification:** All imports resolve. No runtime errors. Types are accessible from all submodules.

---

## Phase 1 Dispatch (7 agents, fully parallel)

### Launch Order (all at once)

| Agent | Prompt File | Est. Time |
|-------|-------------|-----------|
| A1 | `phase1_fred_macro_data.md` | 10-15 min |
| A2 | `phase1_cftc_fedwatch.md` | 15-20 min |
| A3 | `phase1_iv_market_data.md` | 15-20 min |
| A4 | `phase1_catalyst_data.md` | 10-15 min |
| A5 | `phase1_frontend_container_regime.md` | 10-15 min |
| A6 | `phase1_frontend_asset_grid.md` | 15-20 min |
| A7 | `phase1_frontend_bottom_panel.md` | 20-25 min |

**Expected total time:** ~25 min (limited by A7, the largest frontend unit).

### Phase 1 Sync Point — Verification Checklist

Before proceeding to Phase 2, verify:

- [ ] `_buildplan/agent_reports/A1_*.md` exists — FRED data client works
- [ ] `_buildplan/agent_reports/A2_*.md` exists — CFTC/FedWatch scrapers work
- [ ] `_buildplan/agent_reports/A3_*.md` exists — IV logger + market data work
- [ ] `_buildplan/agent_reports/A4_*.md` exists — Catalyst calendar works
- [ ] `_buildplan/agent_reports/A5_*.md` exists — Container + Regime Bar render
- [ ] `_buildplan/agent_reports/A6_*.md` exists — Asset Grid renders
- [ ] `_buildplan/agent_reports/A7_*.md` exists — Calendar + Table + Read render
- [ ] Run: `cd backend && python -m pytest macro/ -v --tb=short` — all Phase 1 tests pass
- [ ] Run: `cd frontend && npx tsc --noEmit` — TypeScript clean
- [ ] Spot-check: `python -c "from backend.macro.data.fred_macro import fetch_scoring_inputs; print('import OK')"`

**If an agent fails:** 
- Read its report (or lack thereof)
- Check the files it created for partial work
- Fix or re-dispatch with additional context about what went wrong

---

## Phase 2 Dispatch (4 agents, fully parallel)

### Launch Order (all at once)

| Agent | Prompt File | Depends On |
|-------|-------------|------------|
| A8 | `phase2_scoring_engine.md` | A1 (data shape), scaffolding types |
| A9 | `phase2_regime_classifier.md` | scaffolding types only |
| A10 | `phase2_catalyst_aligner.md` | A4 (catalyst data), A3 (straddle pricing) |
| A11 | `phase2_trade_filter.md` | All Phase 1 + A8/A9/A10 interfaces |

**Note on A11:** The trade filter codes against the interfaces of A8, A9, A10 (defined in scaffolding). It doesn't need their actual implementations — just their type signatures. It CAN run in parallel.

**Expected total time:** ~20 min (limited by A8/A11, the most complex).

### Phase 2 Sync Point — Verification Checklist

- [ ] All 4 agent reports exist
- [ ] `cd backend && python -m pytest macro/engine/ -v --tb=short` — all engine tests pass
- [ ] Integration smoke test:
  ```python
  from backend.macro.engine.scoring import ScoringEngine
  from backend.macro.engine.regime import RegimeClassifier
  from backend.macro.engine.catalyst_align import CatalystAligner
  from backend.macro.engine.filter import TradeFilter
  print("All engine imports OK")
  ```
- [ ] Quick functional test (mock pipeline):
  ```python
  # Verify types flow correctly between modules
  from backend.macro.models import ScoreState, FactorScore
  from backend.macro.types import FactorName
  state = ScoreState(date="2026-05-05", factors=[], asset_scores={})
  # Should not crash
  ```

---

## Phase 3 Dispatch (3 agents, with ordering)

### Launch Order

**Step 1 — Launch A12 and A13 in parallel:**

| Agent | Prompt File | Depends On |
|-------|-------------|------------|
| A12 | `phase3_narrative.md` | LLM pattern (ai.py reference), models |
| A13 | `phase3_scheduler_router.md` | ALL Phase 1 + Phase 2 modules |

**Step 2 — After A13 completes, launch A14:**

| Agent | Prompt File | Depends On |
|-------|-------------|------------|
| A14 | `phase3_frontend_integration.md` | A13 (router must exist), A5-A7 (widgets) |

A14 depends on A13 because it needs to know the exact API response shapes that the router returns. Wait for A13's report before dispatching A14.

**Expected total time:** ~30 min (A12+A13 parallel: ~20min, then A14: ~10min).

### Phase 3 Sync Point — Final Verification

- [ ] All agent reports exist (A12, A13, A14)
- [ ] `cd backend && python -m pytest macro/ -v --tb=short` — ALL tests pass
- [ ] `cd frontend && npx tsc --noEmit` — TypeScript clean
- [ ] Backend starts: `cd backend && python -c "from main import app; print('App OK')"`
- [ ] Manual smoke test:
  ```bash
  cd backend && uvicorn main:app --port 8000 &
  sleep 3
  curl -s http://localhost:8000/api/macro/dashboard | python -m json.tool
  curl -s -X POST http://localhost:8000/api/macro/refresh | python -m json.tool
  kill %1
  ```
- [ ] Frontend renders: start dev server, navigate to MACRO command, verify dashboard loads (with fixture fallback if backend hasn't run pipeline)

---

## Rollback Strategy

### If a single agent produces broken output:
1. `git diff` the files in that agent's scope
2. Identify the issue (wrong interface, bad logic, missing import)
3. Either:
   - Fix manually (if small)
   - Re-dispatch the agent with additional context about what was wrong

### If a phase fails systemically:
1. `git stash` all Phase N changes
2. Review the scaffolding types — were the interface contracts clear enough?
3. Fix contracts if needed, then re-scaffold and re-dispatch

### If integration breaks existing functionality:
1. `git diff main.py database.py cache.py` — check the surgical modifications
2. Revert modifications to existing files: `git checkout -- backend/main.py backend/database.py backend/cache.py`
3. The MACRO code in `backend/macro/` is isolated — it can't break existing functions unless main.py/database.py modifications are wrong
4. Re-dispatch A13 with stricter modification instructions

### Nuclear option (abandon and restart):
```bash
rm -rf backend/macro/
rm -rf frontend/src/components/screens/macro/
git checkout -- backend/main.py backend/database.py backend/cache.py frontend/src/App.tsx
```
This cleanly removes all MACRO work without affecting any existing functionality.

---

## Dependency Installation

Before Phase 1 dispatch, install approved dependencies:
```bash
cd backend
pip install apscheduler>=3.10 beautifulsoup4 lxml
pip freeze > requirements.txt  # update lockfile
```

---

## Post-Completion

After all phases pass:
1. Run full backend test suite: `cd backend && python -m pytest -v`
2. Run frontend build: `cd frontend && npm run build`
3. Start full app and test MACRO command end-to-end
4. Commit with message: `feat: MACRO options intelligence dashboard — factor scoring, regime classification, trade filter, LLM narrative`
5. Tag release candidate
