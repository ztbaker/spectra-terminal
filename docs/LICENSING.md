# Licensing — SpectraTerminal

## OpenBB Port — Source Code Licensing

SpectraTerminal is **not** derived from OpenBB source code. The OpenBB project (https://github.com/OpenBB-finance/OpenBB) is licensed under AGPLv3.

### Our Approach

All data-access code in SpectraTerminal is **reimplemented from scratch** using public API documentation and standard mathematical formulas. No code has been copy-pasted from the OpenBB repository or any other AGPL-licensed project.

### What We Use

| Data Source | Access Method | License |
|------------|---------------|---------|
| yfinance | yfinance Python package (MIT) | MIT |
| FRED API | fredapi Python package (MIT) | Public API |
| Finnhub | finnhub-python package (Apache 2.0) | Free tier API |
| SEC EDGAR | Direct HTTP REST calls | Public API |
| ECB SDMX | Direct HTTP REST calls | Public API |
| BLS | Direct HTTP API calls | Public API (key optional) |
| EIA | Direct HTTP API calls | Public API (key required) |
| USDA PSD | Direct HTTP API calls | Public API |
| CBOE | Public CSV endpoints | Public data |
| FINRA | Direct HTTP API calls | Public API |
| Treasury.gov | Direct CSV downloads | Public data |
| Congress.gov | Direct HTTP API calls | Public API (key optional) |
| Stooq | Public CSV downloads | Public data |

### Black-Scholes and Greeks

The options math implementations in `backend/analytics/options_math.py` are based on standard, well-known mathematical formulas from publicly available textbooks and papers. No code was copied from OpenBB or any GPL/AGPL source.

### Statistical Methods

The econometrics implementations in `backend/analytics/econometrics.py` use standard formulas from:
- OLS regression: standard linear algebra (`numpy.linalg.lstsq`)
- Cointegration: Engle-Granger two-step method via `statsmodels.tsa.stattools.adfuller`
- CAPM: standard linear regression on excess returns
- Fama-French: standard factor model regression

### Technical Indicators

All TA indicators in `backend/analytics/ta.py` are pure pandas/numpy implementations based on standard definitions. No TA-Lib or other GPL library is used.

### Dependency Licenses

| Package | License |
|---------|---------|
| fastapi | MIT |
| uvicorn | BSD |
| pydantic | MIT |
| yfinance | MIT |
| pandas | BSD |
| numpy | BSD |
| httpx | BSD |
| finnhub-python | Apache 2.0 |
| fredapi | MIT |
| feedparser | BSD |
| statsmodels | BSD |
| linearmodels | BSD |
| arch | BSD |
| scipy | BSD |
| vaderSentiment | MIT |

### Compliance Checklist

- [ ] No code copy-pasted from OpenBB repo
- [ ] No imports from OpenBB packages
- [ ] All provider implementations use public APIs directly
- [ ] Mathematical formulas are standard/public-domain
- [ ] All dependencies have permissive licenses (MIT/BSD/Apache)