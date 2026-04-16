# OpenBB Port Audit — Verified Gaps

**Audit date:** 2026-04-12
**Method:** Every backend router, provider, analytics module, and frontend screen read line-by-line.

---

## Legend
- **DONE** = real working implementation
- **PARTIAL** = file exists but incomplete
- **MISSING** = claimed in plan or present in OpenBB but does not exist

---

## Backend Routers

### ETF (`routers/etf.py` — 350 lines) — PARTIAL
| Endpoint | Status |
|----------|--------|
| search | DONE |
| info | DONE |
| holdings | DONE |
| sectors | DONE |
| countries | DONE |
| performance | DONE |
| equity-exposure | DONE |
| **historical** | **MISSING** — mentioned in plan, no route defined |

### Fixed Income (`routers/fixedincome.py` — 265 lines) — PARTIAL
| Endpoint | Status |
|----------|--------|
| treasury/rates (live curve) | DONE |
| treasury/historical | DONE |
| tips/yields | DONE |
| effr | DONE |
| bond-indices | DONE |
| mortgage | DONE |
| curve-spread (2s10s, 3m10y) | DONE (bonus) |
| **tcm** | **MISSING** — plan Phase 3 |

### Commodity (`routers/commodity.py` — 151 lines) — DONE
All endpoints implemented: energy/stocks, energy/outlook, spot, ag/psd.

### Congress (`routers/congress.py` — 116 lines) — DONE
bills + bill/{id} both implemented.

### Filings (`routers/filings.py` — 157 lines) — DONE
institutions/search, 13f/{cik}, litigation RSS all present.

### Options (`routers/options.py` — 303 lines) — PARTIAL
| Endpoint | Status |
|----------|--------|
| chain + Greeks | DONE |
| surface | DONE |
| term-structure | DONE |
| unusual | DONE |
| **historical-iv** | **MISSING** — plan Phase 4 |

### Screener (`routers/screener.py` + `analytics/screener_parser.py`) — DONE
Recursive-descent DSL parser, /screener/dsl endpoint, field mapping, unit suffixes.

### News (`routers/news.py` — 204 lines) — DONE
/news/company, /news/world, VADER sentiment, provider chain.

### Economy (`routers/econ.py` — 100 lines) — PARTIAL
| Endpoint | Status |
|----------|--------|
| /econ/search (fred_search) | DONE |
| /econ/{series_id} | DONE |
| **indicators** | **MISSING** |
| **central-bank-holdings** | **MISSING** |
| **direction-of-trade (IMF DOTS)** | **MISSING** |
| **house-price-index** | **MISSING** |
| **retail-prices** | **MISSING** |

### Equity (`routers/equity.py` — 225 lines) — PARTIAL
| Endpoint | Status |
|----------|--------|
| /{ticker} (quote + profile) | DONE |
| /{ticker}/financials | DONE |
| /{ticker}/live | DONE |
| **market_snapshots** | **MISSING** |
| **management_compensation** | **MISSING** |
| **historical_market_cap** | **MISSING** |
| **estimates (analyst)** | **MISSING** |
| **compare (peer)** | **MISSING** |
| **calendar (IPO/div/splits)** | **MISSING** |
| **discovery (gainers/losers/active)** | **MISSING** |
| **shorts (short interest)** | **MISSING** — FINRA provider exists but no equity endpoint |

### AI (`routers/ai.py` — 109 lines) — DONE
POST /ai/ask with Ollama + Claude fallback.

### Analytics (`routers/analytics.py` — 226 lines) — PARTIAL
| Endpoint | Status |
|----------|--------|
| /analytics/summary | DONE |
| /analytics/regression (CAPM + OLS) | DONE |
| /analytics/cointegration | DONE |
| /analytics/ta | DONE |
| **/analytics/fama-french** | **MISSING** — function exists in econometrics.py, no route |

---

## Analytics Modules

### options_math.py (203 lines) — DONE
All Greeks: delta, gamma, theta, vega, rho, charm, vanna. Plus compute_iv_surface, compute_term_structure.

### ta.py (183 lines) — DONE
All 14 indicators: SMA, EMA, RSI, MACD, Bollinger, ADX, ATR, Aroon, Stochastic, VWAP, OBV, A/D, Ichimoku, Demark.

### econometrics.py (236 lines) — PARTIAL
| Feature | Status |
|---------|--------|
| summary_stats (mean, std, skew, kurtosis, Sharpe, max drawdown, VaR) | DONE |
| CAPM | DONE |
| OLS | DONE |
| Cointegration (Engle-Granger + ADF) | DONE |
| Granger causality | DONE |
| Fama-French (Mkt-RF, SMB, HML) | DONE (function) |
| rolling_volatility | DONE |
| max_drawdown | DONE |
| **Jarque-Bera normality test (standalone)** | **MISSING** |
| **ADF unit root test (standalone)** | **MISSING** — used internally only |
| **VIF** | **MISSING** |
| **Panel models (pooled/fixed/random via linearmodels)** | **MISSING** |

---

## Providers (all 13 real implementations — DONE)

Every provider has actual API calls, error handling, caching. No stubs.

---

## Frontend Screens — Backend Not Consumed

These are the biggest gaps: backend endpoints exist but the frontend doesn't use them.

| Backend endpoint | Frontend status |
|-----------------|----------------|
| `/options/{sym}/surface` | **No SURFACE tab** in OptionsScreen |
| `/options/{sym}/term-structure` | **No TERM tab** in OptionsScreen |
| `/options/{sym}/unusual` | **No UNUSUAL tab** in OptionsScreen |
| `/screener/dsl` | **No DSL query bar** in ScreenerScreen — has filter dropdowns only |
| Commodity energy/metals/ag | **No tabs** in CommodityScreen — flat spot table only (65 lines) |
| Congress bill/{id} | **No drill-down** in CongressScreen — list only (47 lines) |
| Quant summary + cointegration | **No charts** in QuantScreen — tiles only (58 lines), no rolling vol, drawdown, FF |
| News /company, /world | **No COMPANY/WORLD/SENTIMENT tabs** — single view with filter |
| Econ /econ/search | **No search bar** in ECONScreen that charts on selection |
| Screener saved queries | **Not in localStorage** |

---

## Summary: total gap count

| Category | Count |
|----------|-------|
| Missing backend endpoints | 15 |
| Missing analytics functions | 4 |
| Missing frontend feature consumption | 10 |
| **Total gaps** | **29** |

The backend is ~85% complete. The frontend is the main bottleneck — multiple screens are minimal shells that don't use the APIs already available.
