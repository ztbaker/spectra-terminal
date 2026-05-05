# AGENTS.md — SpectraTerminal

**Vault Context:** `/Users/zacbaker/Documents/Obsidian Vault/Projects/SpectraTerminal/CLAUDE.md`

**Project Memory:** `/Users/zacbaker/Documents/Obsidian Vault/memory/project_spectra_terminal.md`

**Session Notes:** `/Users/zacbaker/Documents/Obsidian Vault/Projects/SpectraTerminal/sessions/`

**Main Vault MEMORY:** `/Users/zacbaker/Documents/Obsidian Vault/MEMORY.md`

Always read these files first when starting work on SpectraTerminal. Log decisions and session notes to the vault.

---

## MACRO Intelligence Subsystem

### Overview
Macro options intelligence dashboard (`MACRO` command). Factor-based scoring engine that evaluates 7 instruments across 4 macro factors at 3 time horizons.

### Tech Stack Additions
- APScheduler (cron job, 5am ET daily)
- Two-stage LLM narrative (Ollama / Claude fallback)

### New Database Tables
All prefixed `macro_`: iv30_history, scores, regime_history, catalysts, trade_ideas, narratives, cftc_positions, input_cache

### New Modules
- `backend/macro/data/` — Data clients (FRED, CFTC, yfinance, catalysts)
- `backend/macro/engine/` — Scoring, regime classification, catalyst alignment, trade filter
- `backend/macro/narrative/` — Two-stage LLM synthesis
- `backend/macro/scheduler.py` — APScheduler cron
- `backend/macro/router.py` — FastAPI endpoints
- `frontend/src/components/screens/macro/` — Dashboard widgets

### API Endpoints
- GET /api/macro/dashboard — full state
- GET /api/macro/regime — regime only
- GET /api/macro/catalysts — forward calendar
- GET /api/macro/ideas — trade ideas
- GET /api/macro/narrative — morning read
- POST /api/macro/refresh — manual pipeline trigger

### Cron Schedule
- Daily: 5:00 AM ET
- FOMC/CPI days: 5:00 AM + 6:00 AM ET

### LLM Usage
- Stage 1: Regime characterization (no trade suggestions)
- Stage 2: Directional bias + trade commentary
- Provider: Ollama (MACRO_LLM_MODEL env var) → Claude API fallback