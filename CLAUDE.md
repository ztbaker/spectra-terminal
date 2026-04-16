# SpectraTerminal — Project Context

## Status
Active

## What This Is
SpectraTerminal is a personal Bloomberg Terminal emulator — an Electron desktop app wrapping a React/TypeScript frontend and a Python FastAPI backend. It uses entirely free data sources (yfinance, FRED, Finnhub, SEC EDGAR, ECB, BLS, EIA, USDA, CBOE, FINRA, Treasury.gov, Congress.gov, Stooq) and has a Bloomberg-authentic amber-on-black aesthetic. The goal is a professional-grade, locally-run market data terminal with no paid API subscriptions.

**Code location:** `/Users/zacbaker/Documents/Trade Strat/SpectraTerminal/`

## Current Phase
Build is implemented. Frontend (React) and backend (FastAPI) are complete. Provider abstraction layer in place. Phase 0-8 of the OpenBB port plan is mostly complete.

## Key Files
```
SpectraTerminal/
├── electron/main.cjs        # Electron main process
├── electron/preload.cjs     # Electron preload
├── frontend/src/
│   ├── App.tsx              # Root — command bar routing, screen switching
│   ├── components/Terminal/ # CommandBar, StatusBar, PanelLayout, Panel
│   ├── components/screens/  # One file per Bloomberg screen
│   ├── components/shared/   # DataTable, Sparkline, TickerBadge, LoadingBar
│   ├── lib/                 # commandParser, colors, api
│   └── types/index.ts        # TypeScript types
├── backend/
│   ├── main.py              # FastAPI app — CORS, router registration
│   ├── routers/             # One router per screen + new modules
│   │   ├── equity.py        # /api/equity/{ticker}
│   │   ├── chart.py         # /api/chart/{ticker}
│   │   ├── options.py       # /api/options/{ticker} + /surface + /term-structure + /unusual
│   │   ├── news.py          # /api/news
│   │   ├── econ.py          # /api/econ/{series_id}
│   │   ├── portfolio.py     # /api/portfolio
│   │   ├── watchlist.py     # /api/watchlist
│   │   ├── earnings.py      # /api/earnings/calendar
│   │   ├── screener.py      # /api/screener
│   │   ├── fx.py             # /api/fx, /api/fx/rates
│   │   ├── crypto.py         # /api/crypto
│   │   ├── filings.py        # /api/filings/{ticker}
│   │   ├── macro.py          # /api/macro/dashboard
│   │   ├── indices.py        # /api/indices, /api/indices/world
│   │   ├── ecst.py           # /api/ecst
│   │   ├── etf.py            # /api/etf/* (NEW)
│   │   ├── fixedincome.py    # /api/fi/* (NEW)
│   │   ├── commodity.py      # /api/commodity/* (NEW)
│   │   ├── congress.py       # /api/congress/* (NEW)
│   │   └── analytics.py      # /api/analytics/* (NEW)
│   ├── providers/            # Provider abstraction layer
│   │   ├── base.py           # BaseProvider ABC
│   │   ├── registry.py       # Provider registry + priority
│   │   ├── fallback.py       # try_providers() fallback chain
│   │   ├── yfinance_provider.py
│   │   ├── finnhub_provider.py
│   │   ├── fred_provider.py
│   │   ├── edgar_provider.py
│   │   ├── ecb_provider.py   # ECB SDMX (NEW)
│   │   ├── bls_provider.py   # BLS (NEW)
│   │   ├── eia_provider.py   # EIA (NEW)
│   │   ├── usda_provider.py  # USDA PSD (NEW)
│   │   ├── cboe_provider.py # CBOE (NEW)
│   │   ├── finra_provider.py # FINRA (NEW)
│   │   ├── treasury_provider.py # Treasury.gov (NEW)
│   │   ├── congress_provider.py # Congress.gov (NEW)
│   │   └── stooq_provider.py # Stooq fallback (NEW)
│   ├── analytics/            # Quantitative + TA analytics
│   │   ├── options_math.py   # Full Black-Scholes Greeks
│   │   ├── econometrics.py   # CAPM, OLS, cointegration, Fama-French
│   │   └── ta.py             # TA indicators (ADX, Aroon, Ichimoku, etc.)
│   ├── models/               # Shared Pydantic response models
│   │   └── shared.py
│   ├── cache.py              # SQLite TTL cache
│   ├── database.py           # SQLite setup
│   └── config.py             # Settings + env vars
├── package.json              # Electron scripts
├── start.sh                  # One-command startup
└── docs/
    ├── openbb_port_plan.md   # Master port plan
    └── LICENSING.md          # AGPL compliance notes
```

## Architecture / Design Decisions
- Electron wraps the React frontend (served from `frontend/dist/` in prod, `localhost:5173` in dev)
- Backend runs on `:8000`; frontend on `:5173` (dev) — CORS enabled for localhost
- Provider abstraction layer: all data access goes through `backend/providers/` with `BaseProvider` ABC
- Priority chains: `try_providers("operation", "method", ...)` iterates providers in order
- SQLite cache: price=60s · intraday chart=5min · daily chart=1hr · news=5min · econ=1hr
- TA indicators (SMA, EMA, RSI, MACD, Bollinger, ADX, Aroon, Ichimoku, ATR, VWAP, OBV, Stochastic, Demark, A/D) computed server-side with pandas/numpy — no TA-Lib
- Black-Scholes with full Greeks (delta, gamma, theta, vega, rho, charm, vanna) computed server-side
- If any external API fails: return cached data + `cached: bool = True` — never 500

## Backend Commands
```
EQUI              Equity screen (ticker required)
GP                Chart with indicators
OPT               Options chain with full Greeks
BOND / YLD        Treasury yield curve, TIPS, EFFR, mortgage
ETF               ETF analysis (SPY ETF, QQQ ETF)
COMD              Commodity spot prices
CONG              US Congress bills
QUANT             Quantitative analysis (COINT, FF)
N                 News
MACRO             FRED dashboard
ECON              Economic series
ECST              Economic statistics dashboard
SCR               Stock screener
FX                FX rates
FXC               Currency cross matrix
CRYPTO            Crypto dashboard
PORT              Portfolio tracker
WLT               Watchlist
EARN              Earnings calendar
FILINGS           SEC filings
```

## Conventions
- Bloomberg command system: `AAPL`, `AAPL GP`, `AAPL OPT`, `PORT`, `MACRO`, `ECON`, `FX`, `CRYPTO`, `SPY ETF`, `BOND`, `COMD`, `CONG`, `AAPL QUANT`
- Color system: amber `#ff9900` primary, `#000000` background, `#00ff41` gains, `#ff3333` losses
- Font: JetBrains Mono throughout
- All chart rendering via TradingView Lightweight Charts — never Recharts or Plotly
- Inline styles only (no CSS-in-JS library, no CSS modules)
- React Query for all server state — no prop drilling
- Free API keys required: `FRED_API_KEY`, `FINNHUB_API_KEY`, `BLS_API_KEY` (optional), `EIA_API_KEY` (optional for COMD), `CONGRESS_API_KEY` (optional) in `backend/.env`

## What NOT To Do
- Do not add paid data sources — the free-only constraint is intentional
- Do not use Recharts, Plotly, or any chart library other than TradingView Lightweight Charts
- Do not add a CSS-in-JS library — inline styles only
- Do not add Redux or Zustand — React Query + local useState is sufficient
- Do not commit `backend/.env`
