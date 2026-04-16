# 🖥️ ZacTerminal — Personal Bloomberg Emulator
## Build Plan + Claude Code Prompt

---

## OVERVIEW

A full-stack personal Bloomberg Terminal emulator using **entirely free data sources**.
No Bloomberg subscription. No paid APIs. Just raw market data wired into a professional-grade UI.

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│               React Frontend (Bloomberg UI)          │
│  Dark theme · Amber text · Multi-panel layout        │
│  TradingView Lightweight Charts · Real-time updates  │
└────────────────────┬────────────────────────────────┘
                     │ HTTP / WebSocket
┌────────────────────▼────────────────────────────────┐
│              FastAPI Python Backend                  │
│  Data orchestration · Caching · Rate limiting        │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
yfinance   FRED API  Finnhub    SEC EDGAR
(stocks,   (macro    (news,     (filings,
 options,   data)    company    8-K, 10-K)
 FX, ETFs)           profiles)
```

**Stack:**
- **Backend**: Python 3.11+, FastAPI, yfinance, fredapi, SQLite (cache + watchlists)
- **Frontend**: React 18 + TypeScript, Lightweight Charts (TradingView OSS), Tailwind CSS
- **Persistence**: SQLite — watchlists, portfolio, price cache, news cache
- **Deployment**: Local only (localhost:3000 / :8000)

---

## SCREENS (Bloomberg Function Equivalents)

| Bloomberg CMD | ZacTerminal Screen   | Data Source          |
|---------------|----------------------|----------------------|
| `EQUI`        | Equity Overview       | yfinance             |
| `GP`          | Price Chart           | yfinance + LW Charts |
| `OPT`         | Options Chain         | yfinance             |
| `NEWS`        | News Feed             | Finnhub + Yahoo RSS  |
| `ECON`        | Economic Data         | FRED API             |
| `PORT`        | Portfolio Tracker     | yfinance + SQLite    |
| `WLT`         | Watchlist             | yfinance + SQLite    |
| `EARN`        | Earnings Calendar     | yfinance             |
| `SCR`         | Stock Screener        | yfinance + Finviz    |
| `FX`          | FX Rates              | yfinance             |
| `CRYPTO`      | Crypto Dashboard      | yfinance             |
| `MACRO`       | Macro Dashboard       | FRED API             |
| `FILINGS`     | SEC Filings           | SEC EDGAR API        |

---

## FREE DATA SOURCES

| Source        | What it provides                        | Rate limit         | API Key needed |
|---------------|-----------------------------------------|--------------------|----------------|
| yfinance      | Stocks, ETFs, FX, crypto, options       | Generous           | No             |
| FRED API      | 800k+ macro series (CPI, GDP, rates...) | 120 req/min        | Yes (free)     |
| Finnhub       | News, company profiles, sentiment       | 60 req/min         | Yes (free)     |
| SEC EDGAR     | All filings (10-K, 8-K, etc.)           | 10 req/sec         | No             |
| Yahoo RSS     | Financial news headlines                | Unlimited          | No             |
| Finviz        | Screener data (scrape)                  | Polite scraping    | No             |

---

## FILE STRUCTURE

```
bloomberg-terminal/
├── backend/
│   ├── main.py                  # FastAPI app + router registration
│   ├── config.py                # API keys, settings from .env
│   ├── database.py              # SQLite setup, table creation
│   ├── cache.py                 # Cache layer (TTL-based)
│   ├── routers/
│   │   ├── equity.py            # /api/equity/{ticker}
│   │   ├── chart.py             # /api/chart/{ticker}?period=1y&interval=1d
│   │   ├── options.py           # /api/options/{ticker}
│   │   ├── news.py              # /api/news?ticker=AAPL
│   │   ├── econ.py              # /api/econ/{series_id}
│   │   ├── portfolio.py         # CRUD for portfolio
│   │   ├── watchlist.py         # CRUD for watchlists
│   │   ├── earnings.py          # /api/earnings/calendar
│   │   ├── screener.py          # /api/screener
│   │   ├── fx.py                # /api/fx
│   │   ├── crypto.py            # /api/crypto
│   │   └── filings.py           # /api/filings/{ticker}
│   ├── services/
│   │   ├── yfinance_service.py  # yfinance wrapper with retry + cache
│   │   ├── fred_service.py      # FRED API wrapper
│   │   ├── finnhub_service.py   # Finnhub wrapper
│   │   ├── edgar_service.py     # SEC EDGAR REST API wrapper
│   │   └── news_service.py      # Yahoo RSS + Finnhub aggregator
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root — command bar, panel routing
│   │   ├── components/
│   │   │   ├── Terminal/
│   │   │   │   ├── CommandBar.tsx       # Bloomberg-style CMD: input
│   │   │   │   ├── StatusBar.tsx        # Bottom bar (time, indices)
│   │   │   │   ├── PanelLayout.tsx      # Multi-panel grid
│   │   │   │   └── Panel.tsx            # Individual draggable panel
│   │   │   ├── screens/
│   │   │   │   ├── EquityScreen.tsx     # EQUI
│   │   │   │   ├── ChartScreen.tsx      # GP — candlestick + indicators
│   │   │   │   ├── OptionsScreen.tsx    # OPT — calls/puts chain
│   │   │   │   ├── NewsScreen.tsx       # NEWS feed
│   │   │   │   ├── EconScreen.tsx       # ECON — FRED series
│   │   │   │   ├── PortfolioScreen.tsx  # PORT
│   │   │   │   ├── WatchlistScreen.tsx  # WLT
│   │   │   │   ├── EarningsScreen.tsx   # EARN calendar
│   │   │   │   ├── ScreenerScreen.tsx   # SCR
│   │   │   │   ├── FXScreen.tsx         # FX rates grid
│   │   │   │   ├── CryptoScreen.tsx     # CRYPTO
│   │   │   │   ├── MacroScreen.tsx      # MACRO dashboard
│   │   │   │   └── FilingsScreen.tsx    # SEC FILINGS
│   │   │   └── shared/
│   │   │       ├── DataTable.tsx        # Bloomberg-style amber table
│   │   │       ├── Sparkline.tsx        # Mini inline charts
│   │   │       ├── TickerBadge.tsx      # Green/red change badge
│   │   │       └── LoadingBar.tsx       # Terminal loading indicator
│   │   ├── hooks/
│   │   │   ├── useEquity.ts
│   │   │   ├── useChart.ts
│   │   │   └── usePolling.ts            # Auto-refresh hook
│   │   ├── styles/
│   │   │   └── bloomberg.css            # Terminal color system
│   │   └── types/
│   │       └── index.ts                 # Shared TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example
├── README.md
└── start.sh                             # One-command startup script
```

---

## DESIGN SPEC — Bloomberg Aesthetic

```css
/* Bloomberg Terminal Color System */
--bg-primary:     #000000;   /* Pure black base */
--bg-secondary:   #0a0a0a;   /* Panel backgrounds */
--bg-panel:       #0d0d0d;   /* Card surfaces */
--bg-header:      #1a1a00;   /* Header rows */
--border:         #2a2a2a;   /* Panel borders */
--text-primary:   #ff9900;   /* Bloomberg amber */
--text-secondary: #cc7700;   /* Dimmed amber */
--text-muted:     #554400;   /* Very dim */
--text-white:     #e0e0e0;   /* Data values */
--gain:           #00ff41;   /* Matrix green */
--loss:           #ff3333;   /* Red */
--highlight:      #ffcc00;   /* Yellow emphasis */
--blue:           #0088ff;   /* Links / interactive */

/* Font: JetBrains Mono or IBM Plex Mono — monospace terminal feel */
```

---
---

# ═══════════════════════════════════════════════
# CLAUDE CODE PROMPT — COPY THIS IN FULL
# ═══════════════════════════════════════════════

```
You are building "ZacTerminal" — a personal Bloomberg Terminal emulator. 
This is a full-stack application using entirely free data sources. 
Build it completely, step by step, starting from scratch.

════════════════════════════════════════════════════
TECH STACK
════════════════════════════════════════════════════

Backend:
- Python 3.11+ with FastAPI
- yfinance for all equity/options/FX/crypto data
- fredapi for macroeconomic data (FRED)
- finnhub-python for news + company profiles
- SQLite via sqlite3 (built-in) for persistence and caching
- httpx for async HTTP (SEC EDGAR)
- python-dotenv for config

Frontend:
- React 18 + TypeScript, bootstrapped with Vite
- lightweight-charts (TradingView open-source) for charts
- Tailwind CSS for utility classes
- React Query (TanStack Query) for data fetching + caching
- NO component libraries — build all UI from scratch to match Bloomberg aesthetic

════════════════════════════════════════════════════
BLOOMBERG AESTHETIC REQUIREMENTS
════════════════════════════════════════════════════

CRITICAL: This must look and feel like a Bloomberg Terminal:
- Pure black background (#000000)
- Amber/orange primary text (#ff9900) — like a CRT monitor
- Monospace font throughout (import JetBrains Mono from Google Fonts)
- Green (#00ff41) for gains, red (#ff3333) for losses
- Dense information layout — no wasted whitespace
- Panel-based layout with thin amber borders
- Command bar at the top for entering function codes (AAPL EQUITY, GP, NEWS, etc.)
- Status bar at the bottom showing time, market status, major indices
- Table rows alternate between #000 and #0a0800
- All numbers right-aligned in tables
- Headers in yellow (#ffcc00), data in white (#e0e0e0)
- Loading states shown as █████ fill bars, not spinners

════════════════════════════════════════════════════
NAVIGATION SYSTEM
════════════════════════════════════════════════════

The app uses a Bloomberg-style command system:
- User types in the command bar at the top
- Commands:
  - "AAPL" → shows equity overview for AAPL
  - "AAPL EQUITY" → equity overview
  - "AAPL GP" → price chart for AAPL
  - "AAPL OPT" → options chain for AAPL
  - "AAPL NEWS" → news for AAPL
  - "AAPL FILINGS" → SEC filings for AAPL
  - "PORT" → portfolio tracker
  - "WLT" → watchlist
  - "ECON" → macro dashboard (FRED)
  - "EARN" → earnings calendar
  - "SCR" → stock screener
  - "FX" → FX rates
  - "CRYPTO" → crypto dashboard
  - "MACRO" → FRED macro series browser
- Pressing Enter executes the command
- Pressing ESC clears the command bar
- Up/down arrows cycle through command history

════════════════════════════════════════════════════
BACKEND SPECIFICATION
════════════════════════════════════════════════════

1. PROJECT SETUP
   - Create backend/ directory
   - requirements.txt with all dependencies
   - .env.example with FRED_API_KEY and FINNHUB_API_KEY placeholders
   - FastAPI app with CORS enabled for localhost:5173

2. DATABASE (database.py)
   Create these SQLite tables:
   
   watchlist (id, ticker, added_at, notes)
   portfolio (id, ticker, shares, avg_cost, added_at)
   price_cache (ticker, data_json, cached_at)  -- TTL: 60 seconds
   news_cache (ticker, data_json, cached_at)   -- TTL: 5 minutes
   chart_cache (cache_key, data_json, cached_at) -- TTL: 1 hour for daily, 5min for intraday
   econ_cache (series_id, data_json, cached_at) -- TTL: 1 hour
   command_history (id, command, executed_at)

3. ROUTERS — implement all of these:

   GET /api/equity/{ticker}
   Returns: price, change, change_pct, volume, market_cap, pe_ratio, eps, 52w_high,
            52w_low, avg_volume, beta, dividend_yield, sector, industry, description,
            exchange, currency, shares_outstanding, float_shares

   GET /api/chart/{ticker}?period=1y&interval=1d
   period options: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
   interval options: 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo
   Returns: OHLCV array formatted for lightweight-charts: [{time, open, high, low, close, volume}]
   Also compute and return: SMA20, SMA50, SMA200, RSI(14), MACD, Bollinger Bands
   (compute these server-side with pandas/numpy — do not rely on TA libraries)

   GET /api/options/{ticker}
   Returns expiration dates, calls chain, puts chain for nearest 4 expiries
   Each contract: strike, lastPrice, bid, ask, volume, openInterest, impliedVolatility,
                  delta (compute via Black-Scholes), inTheMoney, expiration

   GET /api/news?ticker={ticker}&limit=50
   Aggregates from: Finnhub company news + Yahoo Finance RSS
   Returns: [{headline, source, url, datetime, summary, sentiment}]

   GET /api/econ/{series_id}?start=2010-01-01
   Fetches from FRED. Default series on load: GDP, UNRATE, CPIAUCSL, FEDFUNDS, T10Y2Y
   Returns: series metadata + [{date, value}] array

   GET /api/portfolio
   POST /api/portfolio (body: {ticker, shares, avg_cost})
   DELETE /api/portfolio/{id}
   GET /api/portfolio/performance — compute total value, P&L, % gain using live prices

   GET /api/watchlist
   POST /api/watchlist (body: {ticker, notes})
   DELETE /api/watchlist/{ticker}
   GET /api/watchlist/quotes — fetch live quotes for all watchlist tickers in parallel

   GET /api/earnings/calendar?lookahead_days=14
   Returns earnings calendar using yfinance for S&P 500 components + watchlist tickers

   GET /api/screener?min_market_cap=1e9&max_pe=30&min_volume=1e6&sector=Technology
   Implements basic screener using a pre-cached universe of tickers (S&P 500 list)
   Screen on: market_cap, pe_ratio, volume, sector, 52w_change, beta

   GET /api/fx
   Returns major pairs: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD,
                        EURGBP, EURJPY — from yfinance

   GET /api/crypto
   Returns: BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, DOGE-USD with price,
            change, market_cap, volume

   GET /api/filings/{ticker}?type=10-K&limit=10
   Fetches from SEC EDGAR full-text search API (https://efts.sec.gov/LATEST/search-index)
   Returns: [{form_type, filed_date, description, url, period_of_report}]

   GET /api/macro/dashboard
   Returns latest values for: Fed Funds Rate, 10Y Treasury, 2Y Treasury, 10Y-2Y Spread,
                               CPI YoY, Core CPI YoY, Unemployment Rate, GDP Growth,
                               PCE, ISM Manufacturing, Consumer Sentiment — from FRED

   GET /api/indices
   Returns live quotes for: ^GSPC (S&P 500), ^DJI (Dow), ^IXIC (Nasdaq), ^VIX,
                             ^TNX (10Y yield), GC=F (Gold), CL=F (Oil), BTC-USD

4. CACHING STRATEGY
   - All endpoints check SQLite cache before hitting external APIs
   - TTLs: price=60s, intraday chart=5min, daily chart=1hr, news=5min, econ=1hr
   - Cache key = f"{ticker}_{endpoint}_{params_hash}"
   - On cache hit: return cached data immediately
   - On cache miss: fetch, store, return
   - Background task refreshes stale cache entries

════════════════════════════════════════════════════
FRONTEND SPECIFICATION
════════════════════════════════════════════════════

1. COMMAND BAR (CommandBar.tsx)
   - Fixed at top, full width
   - Monospace font, amber on black
   - Format: "[ZAC TERMINAL]  CMD: █" with blinking cursor
   - Parses input on Enter, routes to correct screen
   - Maintains last 50 commands in history (localStorage + SQLite)
   - Shows autocomplete suggestions as user types ticker symbols

2. STATUS BAR (StatusBar.tsx)  
   - Fixed at bottom, full width
   - Shows: NY time | London time | Tokyo time | Market status (OPEN/CLOSED/PRE/AFTER)
   - Live scrolling ticker of major indices from /api/indices
   - Updates every 30 seconds

3. EQUITY SCREEN (EquityScreen.tsx)
   Two-column layout, dense information:
   
   Left panel (60%):
   - Large ticker + company name header in amber
   - Price (large, white), change (+/- green/red), % change
   - Bid/Ask with sizes
   - Day range bar (visual slider showing where current price sits in day range)
   - 52-week range bar
   - Volume vs avg volume bar
   - Key stats grid (4 columns): P/E, EPS, Market Cap, Beta, Dividend, Yield,
                                  Sector, Exchange, Shares Out, Float
   - Company description (truncated, expandable)
   
   Right panel (40%):
   - Mini sparkline chart (5-day intraday) using lightweight-charts
   - Quick links: [GP] [OPT] [NEWS] [FILINGS] — clicking executes the command
   - Related tickers / sector peers

4. CHART SCREEN (ChartScreen.tsx)
   Full-width layout:
   - Period buttons: 1D | 5D | 1M | 3M | 6M | 1Y | 2Y | 5Y | MAX
   - Chart type: Candlestick | Line | Area
   - Indicator toggles: SMA20 | SMA50 | SMA200 | RSI | MACD | BB
   - Volume bars below price chart
   - RSI panel below volume (if enabled)
   - MACD panel below RSI (if enabled)
   - Crosshair with OHLCV values in top-left overlay
   - Zoom: mouse scroll + drag to pan
   - Use lightweight-charts library ONLY (not Recharts, not Plotly)

5. OPTIONS CHAIN (OptionsScreen.tsx)
   - Expiry date tabs at top (nearest 4 expirations)
   - Two-sided table: CALLS on left, PUTS on right, STRIKE in middle
   - Columns: Strike | Last | Bid | Ask | Vol | OI | IV | Delta
   - ITM rows: slightly lighter background (#0a0800)
   - OTM rows: normal black background
   - Current price shown as a highlighted row divider
   - IV skew sparkline at top

6. NEWS SCREEN (NewsScreen.tsx)
   - Headline list, most recent first
   - Each item: [SOURCE] HEADLINE — datetime
   - Color: positive sentiment = slight green tint, negative = slight red tint
   - Clicking headline opens URL in new tab
   - Auto-refreshes every 5 minutes

7. MACRO DASHBOARD (MacroScreen.tsx)
   - 3x4 grid of metric cards
   - Each card: series name, current value, change from last reading, sparkline (last 2y)
   - Series: Fed Funds, 10Y, 2Y, Spread, CPI, Core CPI, PCE, Unemployment,
             GDP Growth, ISM Mfg, Consumer Sentiment, S&P 500 (as reference)
   - Clicking any card expands to full chart with FRED data

8. PORTFOLIO TRACKER (PortfolioScreen.tsx)
   - Add position form: ticker + shares + avg cost
   - Holdings table: Ticker | Shares | Avg Cost | Current | Market Value | P&L | P&L%
   - Total portfolio value + total P&L summary row at bottom
   - Allocation pie-like bar chart (CSS-only, no chart library needed)
   - Sort by any column

9. WATCHLIST SCREEN (WatchlistScreen.tsx)
   - Dense table: Ticker | Company | Price | Change | Change% | Volume | Market Cap
   - Add ticker input at top
   - Auto-refreshes every 60 seconds
   - Color code: gains green, losses red
   - Right-click (or button) to jump to equity screen, chart, options

10. EARNINGS CALENDAR (EarningsScreen.tsx)
    - Week view by default (Mon-Fri)
    - Each day column lists companies reporting
    - Shows: BMO (before market open) or AMC (after market close)
    - Previous EPS vs estimate for past earnings
    - Click company to go to equity screen

11. SCREENER (ScreenerScreen.tsx)
    - Filters: Sector | Min Market Cap | Max P/E | Min Volume | 52W Change Range | Beta Range
    - Results table: Ticker | Name | Sector | Price | Change% | Market Cap | P/E | Volume
    - Max 100 results
    - Click result → equity screen

12. FX SCREEN (FXScreen.tsx)
    - Grid of major pairs in large cards
    - Rate | Change | Change% | Day range
    - Simple 1D chart for each pair

13. CRYPTO SCREEN (CryptoScreen.tsx)
    - Same layout as FX but for crypto
    - BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX
    - 24h price change, market cap, volume

════════════════════════════════════════════════════
IMPLEMENTATION ORDER
════════════════════════════════════════════════════

Build in this exact order:

PHASE 1 — BACKEND FOUNDATION
1. Create backend/ directory structure
2. Write requirements.txt
3. Implement database.py (tables + connection)
4. Implement cache.py (get/set/invalidate with TTL)
5. Implement config.py (.env loading)
6. Implement main.py (FastAPI app, CORS, router registration)
7. Implement yfinance_service.py with retry logic
8. Implement equity router + test with curl
9. Implement chart router with TA indicators (compute SMA, RSI, MACD, BB with pandas)
10. Implement options router (with Black-Scholes delta computation)
11. Implement indices router (status bar data)
12. Implement news router (Finnhub + Yahoo RSS fallback)
13. Implement FRED/econ router
14. Implement portfolio router (CRUD)
15. Implement watchlist router (CRUD + bulk quotes)
16. Implement earnings router
17. Implement screener router (S&P 500 universe, cached)
18. Implement FX + crypto routers
19. Implement SEC EDGAR filings router
20. Implement macro dashboard router

PHASE 2 — FRONTEND FOUNDATION
21. Scaffold React/Vite/TypeScript app in frontend/
22. Install dependencies: lightweight-charts, @tanstack/react-query, tailwindcss
23. Set up Bloomberg color system in bloomberg.css + tailwind config
24. Implement CommandBar.tsx with command parsing and history
25. Implement StatusBar.tsx with live index scroll ticker
26. Implement PanelLayout.tsx and Panel.tsx
27. Implement shared components: DataTable, TickerBadge, LoadingBar, Sparkline

PHASE 3 — SCREENS
28. EquityScreen (most used — do first)
29. ChartScreen (with lightweight-charts, all periods + indicators)
30. WatchlistScreen (with auto-refresh)
31. PortfolioScreen (with CRUD)
32. MacroScreen (FRED series grid)
33. NewsScreen
34. OptionsScreen (calls/puts table)
35. EarningsScreen
36. ScreenerScreen
37. FXScreen
38. CryptoScreen
39. FilingsScreen

PHASE 4 — POLISH
40. Connect all command-bar routing
41. Add keyboard shortcuts (F1-F12 for common screens)
42. Add localStorage persistence for last command + panel layout
43. Implement auto-refresh polling across all screens
44. Write start.sh (installs deps, starts backend on :8000, frontend on :5173)
45. Write README.md with setup instructions

════════════════════════════════════════════════════
TECHNICAL REQUIREMENTS
════════════════════════════════════════════════════

- Python: async/await throughout (use asyncio, httpx, run_in_executor for yfinance)
- yfinance is sync — wrap all calls with asyncio.get_event_loop().run_in_executor(None, ...)
- All API responses use Pydantic models for validation
- Frontend: zero prop drilling — use React Query for all server state
- Chart component must support both candlestick and line series on same chart
- Technical indicators drawn as LineSeries overlays on the price chart
- Options delta computed server-side using Black-Scholes:
  d1 = (ln(S/K) + (r + σ²/2)t) / (σ√t)
  delta_call = N(d1), delta_put = N(d1) - 1
  Use risk-free rate from FRED (FEDFUNDS latest value)
- Error handling: if any external API fails, return cached data + error flag in response
- Never crash on missing data — return partial data with null fields

════════════════════════════════════════════════════
API KEYS NEEDED (ALL FREE)
════════════════════════════════════════════════════

User must obtain these free API keys before running:
1. FRED: https://fred.stlouisfed.org/docs/api/api_key.html (instant, free)
2. Finnhub: https://finnhub.io/register (instant, free tier = 60 req/min)

Create .env.example:
FRED_API_KEY=your_fred_key_here
FINNHUB_API_KEY=your_finnhub_key_here

════════════════════════════════════════════════════
START SCRIPT (start.sh)
════════════════════════════════════════════════════

Create start.sh that:
1. cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000 &
2. cd frontend && npm install && npm run dev
3. Open http://localhost:5173 in default browser

════════════════════════════════════════════════════
BEGIN BUILD
════════════════════════════════════════════════════

Start with Phase 1. Build every file completely — no stubs, no TODOs, 
no placeholder functions. Every endpoint must work end-to-end before 
moving to Phase 2. After completing each phase, confirm it works before proceeding.

The final product should feel like a real Bloomberg Terminal. Dense, fast, 
professional, amber-on-black, monospace, and packed with market data.
```

---

## ESTIMATED BUILD SCOPE

| Phase | Steps | Estimated Lines | Time in Claude Code |
|-------|-------|-----------------|---------------------|
| 1 — Backend | 1–20 | ~3,000 lines Python | 3–5 sessions |
| 2 — Frontend Foundation | 21–27 | ~800 lines TSX/CSS | 1–2 sessions |
| 3 — Screens | 28–39 | ~4,000 lines TSX | 4–6 sessions |
| 4 — Polish | 40–45 | ~500 lines | 1 session |
| **Total** | **45 steps** | **~8,300 lines** | **~10 sessions** |

## TIPS FOR CLAUDE CODE SESSIONS

- Start a fresh session per phase to avoid context overflow
- If a screen breaks, paste the relevant router + screen component together
- Use `--continue` to resume mid-phase
- After Phase 1, test every API route with `curl localhost:8000/api/equity/AAPL` before moving on
- The chart screen is the most complex — allocate a full session for it

---
*Built for Zac — no Bloomberg subscription required.*
