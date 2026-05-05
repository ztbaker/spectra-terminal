# Master Build Plan — MACRO Options Intelligence Dashboard

## Overview

14 agents across 3 phases. Phase 1 has 7 parallel agents (4 backend data, 3 frontend). Phase 2 has 4 parallel agents (analytical engine). Phase 3 has 3 agents (synthesis, wiring, frontend integration).

## Directory Structure (New)

```
backend/macro/
├── __init__.py
├── models.py              # Pydantic response/state models
├── types.py               # Enums, constants, factor weights
├── data/
│   ├── __init__.py
│   ├── fred_macro.py      # FRED: TIPS, 5Y5Y, HY-IG, balance sheet, ISM
│   ├── cftc_scraper.py    # CFTC Commitments of Traders
│   ├── fedwatch.py        # CME FedWatch probabilities
│   ├── iv_logger.py       # IV30 daily snapshot logger
│   ├── market_data.py     # yfinance: prices, VIX term, ratios, straddle pricing
│   └── catalyst.py        # Catalyst calendar builder
├── engine/
│   ├── __init__.py
│   ├── normalizer.py      # Percentile rank (2yr rolling)
│   ├── scoring.py         # Factor scoring engine
│   ├── regime.py          # Meta-regime classifier
│   ├── catalyst_align.py  # Catalyst impact evaluator
│   └── filter.py          # Trade-ready filter (3-confirmation)
├── narrative/
│   ├── __init__.py
│   ├── synthesizer.py     # Two-stage LLM narrative
│   └── prompts.py         # LLM prompt templates
├── scheduler.py           # APScheduler cron (5am ET)
└── router.py              # FastAPI router (replaces backend/routers/macro.py)

frontend/src/components/screens/macro/
├── MacroIntelScreen.tsx   # Main container — stacks 4 zones
├── RegimeBar.tsx          # Zone 1: regime state strip
├── AssetGrid.tsx          # Zone 2: 7 instrument cards
├── CatalystCalendar.tsx   # Zone 3: 21-day forward timeline
├── TradeReadyTable.tsx    # Zone 4a: trade ideas table
├── TodaysRead.tsx         # Zone 4b: narrative panel
├── fixtures.ts            # Mock state for Phase 1 development
└── types.ts               # Frontend macro types (mirrors backend models)
```

## New SQLite Tables (all `macro_` prefixed)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `macro_iv30_history` | Daily IV30 per instrument | asset, date, iv30, iv_rank_pct |
| `macro_scores` | Computed factor scores | date, factor_name, score_5d, score_10d, score_21d |
| `macro_regime_history` | Regime transitions | date, regime_name, conviction, age_days |
| `macro_catalysts` | Forward calendar events | event_date, event_type, assets_impacted, consensus, prior |
| `macro_trade_ideas` | Generated ideas (audit trail) | date, asset, direction, structure, conviction, invalidation |
| `macro_narratives` | Daily narrative text | date, stage, content, model_used |
| `macro_cftc_positions` | COT report data | report_date, asset, net_long, pct_oi |
| `macro_input_cache` | Raw scoring inputs (TTL-cached) | input_key, data_json, cached_at |

## Dependency Graph

```
Phase 0 (Scaffolding — synchronous, pre-agent)
    │
    ├── Phase 1a (Backend Data — 4 agents, parallel)
    │   ├── [A1] FRED macro data client
    │   ├── [A2] CFTC + FedWatch scrapers
    │   ├── [A3] IV logger + market data (yfinance)
    │   └── [A4] Catalyst calendar data
    │
    ├── Phase 1b (Frontend Widgets — 3 agents, parallel)
    │   ├── [A5] Container + Regime Bar
    │   ├── [A6] Asset Grid
    │   └── [A7] Catalyst Calendar + Bottom Panel
    │
    ╰── SYNC POINT: All Phase 1 agents complete, data clients importable ───╮
                                                                             │
    Phase 2 (Analytical Engine — 4 agents, parallel)                         │
    │   ├── [A8] Scoring engine + normalizer                                 │
    │   ├── [A9] Regime classifier                                           │
    │   ├── [A10] Catalyst aligner                                           │
    │   └── [A11] Trade-ready filter                                         │
    │                                                                        │
    ╰── SYNC POINT: All Phase 2 agents complete, engine callable ────────────╮
                                                                              │
    Phase 3 (Synthesis + Integration — 3 agents, sequential-ish)              │
        ├── [A12] Narrative synthesizer (parallel with A13)
        ├── [A13] Scheduler + API router wiring
        └── [A14] Frontend live integration + AGENTS.md (after A13)
```

## Per-Agent Summary

| ID | File | Scope | Est. LOC |
|----|------|-------|----------|
| A1 | `phase1_fred_macro_data.md` | `backend/macro/data/fred_macro.py` | ~200 |
| A2 | `phase1_cftc_fedwatch.md` | `backend/macro/data/cftc_scraper.py`, `fedwatch.py` | ~300 |
| A3 | `phase1_iv_market_data.md` | `backend/macro/data/iv_logger.py`, `market_data.py` | ~250 |
| A4 | `phase1_catalyst_data.md` | `backend/macro/data/catalyst.py` | ~200 |
| A5 | `phase1_frontend_container_regime.md` | `MacroIntelScreen.tsx`, `RegimeBar.tsx`, `fixtures.ts`, `types.ts` | ~300 |
| A6 | `phase1_frontend_asset_grid.md` | `AssetGrid.tsx` | ~250 |
| A7 | `phase1_frontend_bottom_panel.md` | `CatalystCalendar.tsx`, `TradeReadyTable.tsx`, `TodaysRead.tsx` | ~400 |
| A8 | `phase2_scoring_engine.md` | `backend/macro/engine/scoring.py`, `normalizer.py` | ~300 |
| A9 | `phase2_regime_classifier.md` | `backend/macro/engine/regime.py` | ~200 |
| A10 | `phase2_catalyst_aligner.md` | `backend/macro/engine/catalyst_align.py` | ~150 |
| A11 | `phase2_trade_filter.md` | `backend/macro/engine/filter.py` | ~200 |
| A12 | `phase3_narrative.md` | `backend/macro/narrative/synthesizer.py`, `prompts.py` | ~250 |
| A13 | `phase3_scheduler_router.md` | `backend/macro/scheduler.py`, `router.py`, DB migration | ~350 |
| A14 | `phase3_frontend_integration.md` | All frontend macro files (live API), `AGENTS.md` | ~300 |

## New Dependencies (Require Approval)

| Package | Purpose | Phase |
|---------|---------|-------|
| `apscheduler>=3.10` | Cron job scheduling (5am ET daily) | Phase 3 |
| `beautifulsoup4` | CFTC COT report HTML parsing | Phase 1 |
| `lxml` | Fast HTML/XML parser (for bs4) | Phase 1 |

All three are standard, well-maintained, pure-Python packages. No native compilation required.

**Already available in project:** httpx, pandas, numpy, yfinance — confirmed in existing providers.

## Risks

1. **CFTC data lag.** COT reports publish weekly (Friday after close, for Tuesday positions). Scoring uses stale positioning data by design — document this clearly.
2. **IV30 cold start.** Percentile rank requires 6+ months of history. Until then, IV rank will display "insufficient data" and the trade filter will relax the IV confirmation requirement.
3. **LLM availability.** Ollama may not be running. The narrative panel must gracefully degrade to "Narrative unavailable — start Ollama or configure ANTHROPIC_API_KEY."
4. **Existing MACRO replacement.** Current users of `MACRO` command will get the new dashboard. The old FRED table view is accessible via `ECST`. Documented in release notes.
5. **Rate limits.** FRED API (120 req/min), yfinance (informal), CFTC (public HTML). Caching + daily-refresh-only keeps us well within limits.
