<p align="center">
  <img src="frontend/public/icon.svg" width="128" height="128" alt="Spectra Terminal Logo" />
</p>

<h1 align="center">Spectra Terminal</h1>

<p align="center">
  <strong>A free, professional-grade market data terminal.</strong><br />
  Real-time equities, options, fixed income, FX, crypto, commodities, macro — all from free data sources.
</p>

<p align="center">
  <a href="https://github.com/ztbaker/spectra-terminal/releases/latest">
    <img src="https://img.shields.io/github/v/release/ztbaker/spectra-terminal?style=flat-square" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square" alt="License" />
</p>

---

## What's New in v1.1.11

- **Live intraday candles (GPO)** — GPO defaults to 1D/1-minute candles with 500ms live polling, so candles update in near real-time during market hours
- **Chat cashtags** — type `$AAPL` in a chat message and it renders as an amber clickable link that opens the ticker's function menu
- **Bloomberg-style function menu** — typing a bare ticker (e.g. `AAPL`) shows a "select function" screen with clickable options (GP, OPT, FA, NEWS, FILINGS, HS, QUANT, ETF, DES)
- **Cursor fix** — command bar cursor only blinks when focused

## What is Spectra Terminal?

Spectra Terminal is a Bloomberg-inspired desktop application that aggregates market data from entirely free sources — no paid API subscriptions required. It runs locally as an Electron app with a React frontend and Python FastAPI backend.

### Features

- **Equity Analysis** — real-time quotes, fundamentals, financial statements, earnings
- **Options** — full chain with Black-Scholes Greeks (delta, gamma, theta, vega, rho, charm, vanna)
- **Charts** — TradingView Lightweight Charts with 14+ technical indicators
- **Fixed Income** — Treasury yield curve, EFFR, mortgage rates, curve spreads
- **ETFs** — holdings, sector exposure, performance
- **FX & Crypto** — live rates, cross matrix, dashboards
- **Commodities** — spot prices across energy, metals, agriculture
- **Macro** — FRED series, economic statistics, BLS data
- **News** — aggregated headlines with full-text reader mode
- **Screener** — filter stocks by fundamentals and technicals
- **Portfolio & Watchlist** — track your positions privately
- **Congress** — US congressional bill tracking
- **Quantitative** — CAPM, Fama-French, cointegration, OLS, multi-period returns
- **Chat** — public rooms and private DMs with reply threads, presence indicators, and news sharing
- **Meme Coins** — dedicated meme coin tracker (DOGE, SHIB, PEPE, BONK, FLOKI, WIF, and more)
- **User Profiles** — Bloomberg IB-style profile cards with activity stats

### Data Sources

All free, no API keys required for core functionality:

| Source | Coverage |
|--------|----------|
| yfinance | Equities, options, ETFs, crypto, FX |
| FRED | Macro/economic series |
| Finnhub | News, earnings calendar |
| SEC EDGAR | Company filings |
| ECB SDMX | European rates |
| BLS | Employment, CPI, PPI |
| EIA | Energy data |
| USDA PSD | Agricultural commodities |
| CBOE | VIX, options data |
| FINRA | Short interest |
| Treasury.gov | Yield curve, TIPS |
| Congress.gov | Legislative data |
| Stooq | Historical fallback |

## Installation

Download for your platform from the [latest release](https://github.com/ztbaker/spectra-terminal/releases/latest):

- **macOS (Apple Silicon)** — `.dmg (arm64)`
- **macOS (Intel)** — `.dmg`
- **Windows** — `.exe`

The app auto-updates — once installed, future versions download and install automatically.

## Development

### Prerequisites

- Node.js 18+
- Python 3.10+
- pip

### Setup

```bash
# Clone
git clone https://github.com/ztbaker/spectra-terminal.git
cd spectra-terminal

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Add your optional API keys
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev

# Run Electron in dev mode
BAKER_DEV=1 npx electron .
```

### Optional API Keys

Add to `backend/.env` for enhanced data:

```
FRED_API_KEY=your_key        # FRED economic data
FINNHUB_API_KEY=your_key     # News, earnings
BLS_API_KEY=your_key         # Bureau of Labor Statistics
EIA_API_KEY=your_key         # Energy data
CONGRESS_API_KEY=your_key    # Congress.gov
```

### Commands

Bloomberg-style command bar:

| Command | Screen |
|---------|--------|
| `AAPL` | Equity overview |
| `AAPL GP` | Chart |
| `AAPL OPT` | Options chain |
| `AAPL FA` | Financial analysis |
| `SPY ETF` | ETF analysis |
| `BOND` | Treasury yield curve |
| `COMD` | Commodities |
| `FX` | Foreign exchange |
| `CRYPTO` | Crypto dashboard |
| `MACRO` | FRED dashboard |
| `N` | News |
| `PORT` | Portfolio |
| `WLT` | Watchlist |
| `EARN` | Earnings calendar |
| `SCR` | Stock screener |
| `CONG` | Congress bills |
| `CHAT` | Chat rooms and DMs |
| `MEME` | Meme coin tracker |
| `PROF` | User profile |


## Architecture

```
SpectraTerminal/
├── electron/          # Electron main process + auto-updater
├── frontend/          # React + TypeScript + Vite
│   └── src/
│       ├── components/  # Screens, Terminal shell, shared UI
│       ├── lib/         # API client, command parser, theme
│       └── types/       # TypeScript definitions
└── backend/           # Python FastAPI
    ├── routers/       # One router per screen
    ├── providers/     # Data source abstraction layer
    ├── analytics/     # Quant: Greeks, econometrics, TA
    └── cache.py       # SQLite TTL cache
```

## License

AGPL-3.0. See [LICENSE](LICENSE) for details.
