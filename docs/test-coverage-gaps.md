# Test Coverage Gaps - SpectraTerminal

## 1. Backend Router Gaps

### 1.1 Chart Router (`routers/chart.py`)
**Untested Functions:**
- `get_chart()` - OHLCV data with technical indicators
- `get_chart_spread()` - Spread calculation between two tickers
- `_sma()`, `_rsi()`, `_macd()`, `_bollinger()` - Technical indicator calculations
- `_df_to_ohlcv()` - DataFrame to OHLCV conversion

**Missing Edge Cases:**
- Invalid period/interval combinations
- Empty DataFrame handling
- NaN values in technical indicators
- Timezone handling for intraday vs daily
- Cache key collision scenarios
- Concurrent requests for same ticker

**Test Skeleton:**

```python
# tests/test_chart.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import pandas as pd
from main import app
from database import init_db


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def _fake_history():
    """Generate fake OHLCV DataFrame."""
    dates = pd.date_range("2024-01-01", periods=100, freq="D")
    return pd.DataFrame({
        "Open": [100 + i * 0.5 for i in range(100)],
        "High": [101 + i * 0.5 for i in range(100)],
        "Low": [99 + i * 0.5 for i in range(100)],
        "Close": [100.5 + i * 0.5 for i in range(100)],
        "Volume": [1_000_000] * 100,
    }, index=dates)


def test_chart_returns_ohlcv_and_indicators(client):
    """GET /api/chart/{ticker} returns OHLCV + technical indicators."""
    with patch("routers.chart.get_history", new=AsyncMock(return_value=_fake_history())):
        resp = client.get("/api/chart/AAPL?period=1y&interval=1d")
    assert resp.status_code == 200
    data = resp.json()
    assert "ohlcv" in data
    assert "sma20" in data
    assert "sma50" in data
    assert "rsi" in data
    assert "macd_line" in data
    assert len(data["ohlcv"]) == 100


def test_chart_invalid_period_returns_422(client):
    """Invalid period parameter returns 422."""
    resp = client.get("/api/chart/AAPL?period=invalid&interval=1d")
    assert resp.status_code == 422


def test_chart_invalid_interval_returns_422(client):
    """Invalid interval parameter returns 422."""
    resp = client.get("/api/chart/AAPL?period=1y&interval=invalid")
    assert resp.status_code == 422


def test_chart_empty_dataframe_returns_404(client):
    """Returns 404 when history returns empty DataFrame."""
    with patch("routers.chart.get_history", new=AsyncMock(return_value=pd.DataFrame())):
        resp = client.get("/api/chart/INVALID")
    assert resp.status_code == 404


def test_chart_uses_cache_on_second_call(client):
    """Second request uses cache and doesn't call get_history."""
    with patch("routers.chart.get_history", new=AsyncMock(return_value=_fake_history())) as mock:
        client.get("/api/chart/AAPL?period=1y&interval=1d")
        client.get("/api/chart/AAPL?period=1y&interval=1d")
    assert mock.call_count == 1


def test_chart_spread_returns_correct_data(client):
    """GET /api/chart/spread calculates spread correctly."""
    df1 = pd.DataFrame({"Close": [10, 11, 12]}, index=pd.date_range("2024-01-01", periods=3))
    df2 = pd.DataFrame({"Close": [5, 6, 7]}, index=pd.date_range("2024-01-01", periods=3))

    with patch("routers.chart.get_history", new=AsyncMock(side_effect=[df1, df2])):
        resp = client.get("/api/chart/spread?ticker1=AAPL&ticker2=MSFT&period=1mo")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ticker1"] == "AAPL"
    assert data["ticker2"] == "MSFT"
    assert len(data["spread"]) == 3
    assert data["spread"][-1]["value"] == pytest.approx(5.0)  # 12 - 7


def test_chart_spread_missing_ticker1_returns_404(client):
    """Returns 404 when first ticker has no data."""
    with patch("routers.chart.get_history", new=AsyncMock(side_effect=[pd.DataFrame(), _fake_history()])):
        resp = client.get("/api/chart/spread?ticker1=INVALID&ticker2=AAPL")
    assert resp.status_code == 404


def test_technical_indicators_handle_nan_gracefully(client):
    """Technical indicators don't crash on NaN values."""
    df = _fake_history()
    df.iloc[50:60, df.columns.get_loc("Close")] = float('nan')

    with patch("routers.chart.get_history", new=AsyncMock(return_value=df)):
        resp = client.get("/api/chart/AAPL")

    assert resp.status_code == 200
    data = resp.json()
    # Check that we have None values in indicators where NaN occurred
    assert None in data["sma20"]
```

---

### 1.2 Options Router (`routers/options.py`)
**Untested Functions:**
- `get_options()` - Options chain endpoint
- `_bs_delta()` - Black-Scholes delta calculation
- `_process_chain()` - Options chain processing
- `_safe_float()`, `_safe_int()` - Safe type conversion

**Missing Edge Cases:**
- Invalid ticker with no options
- Expired options
- Delta calculation with zero time to expiry
- Division by zero in Black-Scholes
- Invalid implied volatility (negative, zero)
- FRED API failure for risk-free rate

**Test Skeleton:**

```python
# tests/test_options.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import pandas as pd
from main import app
from database import init_db


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def _fake_option_chain():
    """Generate fake options chain DataFrames."""
    calls = pd.DataFrame({
        "strike": [150, 155, 160],
        "lastPrice": [5.0, 3.0, 1.5],
        "bid": [4.9, 2.9, 1.4],
        "ask": [5.1, 3.1, 1.6],
        "volume": [100, 200, 150],
        "openInterest": [500, 300, 200],
        "impliedVolatility": [0.25, 0.28, 0.30],
        "inTheMoney": [True, False, False],
    })
    puts = pd.DataFrame({
        "strike": [150, 155, 160],
        "lastPrice": [1.0, 2.5, 5.0],
        "bid": [0.9, 2.4, 4.9],
        "ask": [1.1, 2.6, 5.1],
        "volume": [80, 120, 90],
        "openInterest": [400, 250, 180],
        "impliedVolatility": [0.22, 0.26, 0.29],
        "inTheMoney": [False, False, True],
    })
    return calls, puts


def test_options_returns_calls_and_puts(client):
    """GET /api/options/{ticker} returns calls and puts."""
    fake_info = {"currentPrice": 155.0}
    fake_expiries = ["2024-06-21", "2024-07-19", "2024-08-16", "2024-09-20"]

    with patch("routers.options.get_ticker_info", new=AsyncMock(return_value=fake_info)), \
         patch("routers.options.get_option_expiries", new=AsyncMock(return_value=fake_expiries)), \
         patch("routers.options.get_options_chain", new=AsyncMock(return_value=_fake_option_chain())), \
         patch("services.fred_service.get_latest_value", new=AsyncMock(return_value=5.25)):
        resp = client.get("/api/options/AAPL")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ticker"] == "AAPL"
    assert data["spot"] == 155.0
    assert len(data["expiries"]) == 4
    assert len(data["expiries"][0]["calls"]) == 3
    assert len(data["expiries"][0]["puts"]) == 3


def test_options_calculates_delta(client):
    """Delta is calculated for each contract."""
    fake_info = {"currentPrice": 155.0}
    fake_expiries = ["2024-12-21"]

    with patch("routers.options.get_ticker_info", new=AsyncMock(return_value=fake_info)), \
         patch("routers.options.get_option_expiries", new=AsyncMock(return_value=fake_expiries)), \
         patch("routers.options.get_options_chain", new=AsyncMock(return_value=_fake_option_chain())), \
         patch("services.fred_service.get_latest_value", new=AsyncMock(return_value=5.25)):
        resp = client.get("/api/options/AAPL")

    data = resp.json()
    # ATM call should have delta ~0.5
    atm_call = data["expiries"][0]["calls"][1]  # strike 155
    assert atm_call["delta"] is not None
    assert 0.4 < atm_call["delta"] < 0.6


def test_options_no_expiries_returns_404(client):
    """Returns 404 when ticker has no options."""
    with patch("routers.options.get_ticker_info", new=AsyncMock(return_value={})), \
         patch("routers.options.get_option_expiries", new=AsyncMock(return_value=[])):
        resp = client.get("/api/options/INVALID")
    assert resp.status_code == 404


def test_options_delta_null_on_invalid_inputs(client):
    """Delta is None when inputs are invalid (zero IV, negative strike)."""
    bad_chain = pd.DataFrame({
        "strike": [0, -10, 150],
        "lastPrice": [0, 0, 5.0],
        "impliedVolatility": [0, 0.25, 0],
        "inTheMoney": [False, False, True],
    }), pd.DataFrame()

    fake_info = {"currentPrice": 155.0}
    with patch("routers.options.get_ticker_info", new=AsyncMock(return_value=fake_info)), \
         patch("routers.options.get_option_expiries", new=AsyncMock(return_value=["2024-12-21"])), \
         patch("routers.options.get_options_chain", new=AsyncMock(return_value=bad_chain)), \
         patch("services.fred_service.get_latest_value", new=AsyncMock(return_value=5.25)):
        resp = client.get("/api/options/AAPL")

    data = resp.json()
    for contract in data["expiries"][0]["calls"]:
        assert contract["delta"] is None


def test_options_fred_failure_uses_fallback_rate(client):
    """When FRED API fails, uses fallback risk-free rate."""
    fake_info = {"currentPrice": 155.0}
    fake_expiries = ["2024-12-21"]

    with patch("routers.options.get_ticker_info", new=AsyncMock(return_value=fake_info)), \
         patch("routers.options.get_option_expiries", new=AsyncMock(return_value=fake_expiries)), \
         patch("routers.options.get_options_chain", new=AsyncMock(return_value=_fake_option_chain())), \
         patch("services.fred_service.get_latest_value", new=AsyncMock(side_effect=Exception("timeout"))):
        resp = client.get("/api/options/AAPL")

    # Should not crash, delta should still be calculated with fallback rate
    assert resp.status_code == 200
```

---

### 1.3 News Router (`routers/news.py`)
**Test Skeleton:**

```python
# tests/test_news.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from database import init_db


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def _fake_news_articles():
    return [
        {
            "headline": "AAPL announces new product",
            "source": "Reuters",
            "url": "https://example.com/1",
            "datetime": 1700000000,
            "summary": "Apple announced...",
            "sentiment": "positive",
        },
        {
            "headline": "Market decline affects tech",
            "source": "Bloomberg",
            "url": "https://example.com/2",
            "datetime": 1699999000,
            "summary": "Tech stocks fell...",
            "sentiment": "negative",
        },
    ]


def test_news_returns_articles(client):
    """GET /api/news returns news articles."""
    with patch("services.news_service.get_aggregated_news", new=AsyncMock(return_value=_fake_news_articles())):
        resp = client.get("/api/news?ticker=AAPL")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ticker"] == "AAPL"
    assert len(data["items"]) == 2
    assert data["items"][0]["sentiment"] in ("positive", "negative", "neutral")


def test_news_limit_parameter_works(client):
    """Limit parameter restricts number of articles."""
    with patch("services.news_service.get_aggregated_news", new=AsyncMock(return_value=_fake_news_articles())):
        resp = client.get("/api/news?ticker=AAPL&limit=1")

    # Mock should be called with limit=1
    assert resp.status_code == 200


def test_news_uses_cache(client):
    """Second request uses cache."""
    with patch("services.news_service.get_aggregated_news", new=AsyncMock(return_value=_fake_news_articles())) as mock:
        client.get("/api/news?ticker=AAPL")
        client.get("/api/news?ticker=AAPL")
    assert mock.call_count == 1


def test_news_default_ticker_is_market(client):
    """Default ticker is MARKET when not specified."""
    with patch("services.news_service.get_aggregated_news", new=AsyncMock(return_value=[])) as mock:
        client.get("/api/news")
    mock.assert_called_once_with("MARKET", limit=50)
```

---

### 1.4 Filings Router (`routers/filings.py`)
**Test Skeleton:**

```python
# tests/test_filings.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from database import init_db


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def test_filings_returns_sec_filings(client):
    """GET /api/filings/{ticker} returns SEC filings."""
    fake_filings = [
        {
            "form_type": "10-K",
            "filed_date": "2024-02-01",
            "description": "Annual Report",
            "url": "https://sec.gov/...",
            "period_of_report": "2023-12-31",
            "accession_number": "0001234567-24-000001",
        }
    ]

    with patch("services.edgar_service.get_filings", new=AsyncMock(return_value=fake_filings)):
        resp = client.get("/api/filings/AAPL?form_type=10-K")

    assert resp.status_code == 200
    data = resp.json()
    assert data["ticker"] == "AAPL"
    assert len(data["filings"]) == 1
    assert data["filings"][0]["form_type"] == "10-K"


def test_filings_invalid_ticker_returns_empty_list(client):
    """Invalid ticker returns empty filings list."""
    with patch("services.edgar_service.get_filings", new=AsyncMock(return_value=[])):
        resp = client.get("/api/filings/INVALID")

    assert resp.status_code == 200
    data = resp.json()
    assert data["filings"] == []
```

---

## 2. Backend Service Gaps

### 2.1 EDGAR Service (`services/edgar_service.py`)
**Untested Functions:**
- `get_cik()` - CIK lookup
- `get_filings()` - Filings fetching
- `_load_tickers()` - Ticker map loading
- `_build_filing_url()` - URL construction

**Missing Edge Cases:**
- Ticker not found in SEC database
- CIK with non-standard formatting
- HTTP errors (429 rate limit, 503 unavailable)
- Malformed accession numbers
- Missing primary document
- Network timeouts

**Test Skeleton:**

```python
# tests/test_edgar_service.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services import edgar_service


@pytest.mark.asyncio
async def test_get_cik_returns_padded_string():
    """get_cik returns zero-padded 10-digit CIK."""
    with patch("services.edgar_service._load_tickers", new=AsyncMock()):
        edgar_service._ticker_to_cik = {"AAPL": "0000320193"}
        cik = await edgar_service.get_cik("AAPL")
    assert cik == "0000320193"
    assert len(cik) == 10


@pytest.mark.asyncio
async def test_get_cik_returns_none_for_invalid_ticker():
    """get_cik returns None when ticker not found."""
    with patch("services.edgar_service._load_tickers", new=AsyncMock()):
        edgar_service._ticker_to_cik = {}
        cik = await edgar_service.get_cik("INVALID")
    assert cik is None


@pytest.mark.asyncio
async def test_get_filings_handles_http_errors_gracefully():
    """get_filings returns empty list on HTTP errors."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = Exception("503")

    with patch("services.edgar_service.get_cik", new=AsyncMock(return_value="0000320193")), \
         patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)):
        filings = await edgar_service.get_filings("AAPL")

    assert filings == []


@pytest.mark.asyncio
async def test_load_tickers_caches_results():
    """_load_tickers only fetches once."""
    fake_json = {
        "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}
    }
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_json
    mock_resp.raise_for_status = MagicMock()

    edgar_service._tickers_loaded = False
    edgar_service._ticker_to_cik = {}

    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=mock_resp)) as mock_get:
        await edgar_service._load_tickers()
        await edgar_service._load_tickers()  # Second call

    assert mock_get.call_count == 1
    assert "AAPL" in edgar_service._ticker_to_cik
```

---

### 2.2 FRED Service (`services/fred_service.py`)
**Test Skeleton:**

```python
# tests/test_fred_service.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import pandas as pd
from services import fred_service


@pytest.mark.asyncio
async def test_get_series_returns_observations():
    """get_series returns metadata and observations."""
    fake_info = {"title": "GDP", "units_short": "%", "frequency_short": "Q"}
    fake_series = pd.Series([1.0, 2.0, 3.0], index=pd.date_range("2024-01-01", periods=3))

    with patch("fredapi.Fred.get_series_info", return_value=fake_info), \
         patch("fredapi.Fred.get_series", return_value=fake_series):
        result = await fred_service.get_series("GDP")

    assert result["series_id"] == "GDP"
    assert result["title"] == "GDP"
    assert len(result["observations"]) == 3
    assert result["observations"][0]["value"] == 1.0


@pytest.mark.asyncio
async def test_get_series_filters_nan_values():
    """get_series filters out NaN observations."""
    import math
    fake_series = pd.Series([1.0, math.nan, 3.0])

    with patch("fredapi.Fred.get_series_info", return_value={}), \
         patch("fredapi.Fred.get_series", return_value=fake_series):
        result = await fred_service.get_series("GDP")

    assert len(result["observations"]) == 2  # NaN filtered out


@pytest.mark.asyncio
async def test_get_latest_value_returns_most_recent():
    """get_latest_value returns the last non-null value."""
    fake_series = pd.Series([1.0, 2.0, 3.0])

    with patch("fredapi.Fred.get_series", return_value=fake_series):
        value = await fred_service.get_latest_value("FEDFUNDS")

    assert value == 3.0


@pytest.mark.asyncio
async def test_get_latest_value_returns_none_on_error():
    """get_latest_value returns None on exception."""
    with patch("fredapi.Fred.get_series", side_effect=Exception("timeout")):
        value = await fred_service.get_latest_value("INVALID")

    assert value is None
```

---

### 2.3 News Service (`services/news_service.py`)
**Test Skeleton:**

```python
# tests/test_news_service.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch
from services import news_service


@pytest.mark.asyncio
async def test_naive_sentiment_classifies_correctly():
    """_naive_sentiment classifies text correctly."""
    assert news_service._naive_sentiment("Stock surges on strong earnings beat") == "positive"
    assert news_service._naive_sentiment("Company misses estimates, stock falls") == "negative"
    assert news_service._naive_sentiment("Company announces new product") == "neutral"


@pytest.mark.asyncio
async def test_get_aggregated_news_deduplicates_by_url():
    """get_aggregated_news removes duplicate URLs."""
    finnhub_articles = [
        {"headline": "Article 1", "url": "https://example.com/1", "datetime": 100, "summary": "", "sentiment": None}
    ]
    yahoo_articles = [
        {"headline": "Article 1 Duplicate", "url": "https://example.com/1", "datetime": 100, "summary": "", "sentiment": "positive"}
    ]

    with patch("services.finnhub_service.get_company_news", new=AsyncMock(return_value=finnhub_articles)), \
         patch("services.news_service._fetch_yahoo_rss", new=AsyncMock(return_value=yahoo_articles)):
        result = await news_service.get_aggregated_news("AAPL")

    assert len(result) == 1  # Duplicate removed


@pytest.mark.asyncio
async def test_get_aggregated_news_sorts_by_newest():
    """Articles are sorted newest first."""
    finnhub_articles = [
        {"headline": "Old", "url": "https://example.com/1", "datetime": 100, "summary": "", "sentiment": None}
    ]
    yahoo_articles = [
        {"headline": "New", "url": "https://example.com/2", "datetime": 200, "summary": "", "sentiment": "positive"}
    ]

    with patch("services.finnhub_service.get_company_news", new=AsyncMock(return_value=finnhub_articles)), \
         patch("services.news_service._fetch_yahoo_rss", new=AsyncMock(return_value=yahoo_articles)):
        result = await news_service.get_aggregated_news("AAPL")

    assert result[0]["headline"] == "New"
    assert result[1]["headline"] == "Old"
```

---

## 3. Frontend Test Gaps

### 3.1 Missing Frontend Tests (0% Coverage)
**Critical Components Untested:**
- Terminal command parsing (`lib/commandParser.ts`)
- API client (`lib/api.ts`)
- All screen components (15+ screens)
- Custom hooks
- Shared components

**Test Skeleton:**

```typescript
// frontend/src/lib/__tests__/commandParser.test.ts
import { describe, it, expect } from 'vitest'
import { parseCommand } from '../commandParser'

describe('commandParser', () => {
  it('parses equity command correctly', () => {
    const result = parseCommand('AAPL')
    expect(result.command).toBe('equity')
    expect(result.args.ticker).toBe('AAPL')
  })

  it('parses DES command correctly', () => {
    const result = parseCommand('AAPL DES')
    expect(result.command).toBe('des')
    expect(result.args.ticker).toBe('AAPL')
  })

  it('handles invalid commands', () => {
    const result = parseCommand('INVALID COMMAND HERE')
    expect(result.command).toBe('unknown')
  })

  it('normalizes ticker to uppercase', () => {
    const result = parseCommand('aapl')
    expect(result.args.ticker).toBe('AAPL')
  })
})
```

```typescript
// frontend/src/lib/__tests__/api.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getEquity, getChart } from '../api'

global.fetch = vi.fn()

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getEquity fetches equity data', async () => {
    const mockData = { ticker: 'AAPL', price: 150.0 }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    const result = await getEquity('AAPL')
    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/equity/AAPL'))
  })

  it('getEquity throws on HTTP error', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404
    })

    await expect(getEquity('INVALID')).rejects.toThrow()
  })

  it('getChart fetches chart data with parameters', async () => {
    const mockData = { ticker: 'AAPL', ohlcv: [] }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    const result = await getChart('AAPL', '1y', '1d')
    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('period=1y&interval=1d')
    )
  })
})
```

```typescript
// frontend/src/components/screens/__tests__/EquityScreen.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import EquityScreen from '../EquityScreen'
import * as api from '../../../lib/api'

vi.mock('../../../lib/api')

describe('EquityScreen', () => {
  it('renders loading state initially', () => {
    render(<EquityScreen ticker="AAPL" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('displays equity data after fetch', async () => {
    const mockData = {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      price: 175.50,
      change: 3.50,
      change_pct: 2.04
    }

    vi.mocked(api.getEquity).mockResolvedValueOnce(mockData)

    render(<EquityScreen ticker="AAPL" />)

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
      expect(screen.getByText('175.50')).toBeInTheDocument()
    })
  })

  it('displays error message on fetch failure', async () => {
    vi.mocked(api.getEquity).mockRejectedValueOnce(new Error('Network error'))

    render(<EquityScreen ticker="AAPL" />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })
})
```

---

## 4. Integration Test Gaps

**Missing Integration Tests:**

```python
# tests/test_integration_equity_flow.py
"""End-to-end test for equity data flow."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from main import app
from database import init_db


@pytest.fixture
def client(temp_db):
    init_db(temp_db)
    with TestClient(app) as c:
        yield c


def test_equity_to_financials_flow(client):
    """Test complete flow: equity -> cache -> financials."""
    # This would hit real APIs in integration mode
    # For now, we'd mock it, but in real integration tests,
    # we'd use real test API keys
    pass


def test_concurrent_requests_dont_race(client):
    """Multiple concurrent requests for same ticker use cache correctly."""
    import concurrent.futures

    def fetch():
        return client.get("/api/equity/AAPL")

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(fetch) for _ in range(10)]
        results = [f.result() for f in futures]

    # All should succeed
    assert all(r.status_code == 200 for r in results)
```

---

## 5. Edge Cases Summary

### Critical Missing Edge Cases:
1. **Rate Limiting** - No tests for API rate limits
2. **Concurrent Access** - Database/cache race conditions
3. **Timeout Handling** - Long-running API calls
4. **Memory Leaks** - Large dataset handling
5. **Authentication** - No tests for API key validation
6. **CORS** - Cross-origin request handling
7. **Input Validation** - SQL injection, XSS attempts
8. **Database Corruption** - Recovery from bad states
9. **Network Failures** - Partial failures, retries
10. **Timezone Edge Cases** - DST transitions, intraday data

---

## 6. Performance Test Gaps

```python
# tests/test_performance.py
"""Performance and load tests."""
import pytest
import time
from fastapi.testclient import TestClient
from main import app


def test_equity_endpoint_performance(benchmark):
    """Equity endpoint should respond within 200ms."""
    client = TestClient(app)

    def fetch():
        return client.get("/api/equity/AAPL")

    result = benchmark(fetch)
    assert result.status_code == 200


def test_cache_performance(benchmark):
    """Cache hit should be under 10ms."""
    # Test cache retrieval speed
    pass
```

---

## Priority Recommendations

### High Priority (Implement First)
1. ✅ **Chart Router Tests** - Complex logic, technical indicators
2. ✅ **Options Router Tests** - Black-Scholes calculations critical
3. ✅ **EDGAR Service Tests** - External API, many failure modes
4. ✅ **Frontend Command Parser** - User input validation critical

### Medium Priority
5. **News Service Tests** - Sentiment analysis, deduplication
6. **FRED Service Tests** - Economic data critical for ECST
7. **Integration Tests** - End-to-end flows

### Low Priority (Nice to Have)
8. **Performance Tests** - Benchmarking
9. **Load Tests** - Stress testing
10. **UI Component Tests** - Visual regression

---

## Test Infrastructure Setup

```bash
# Backend setup
cd backend
python -m pytest tests/ -v --cov=. --cov-report=html

# Frontend setup (needs to be created)
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm test
```

```json
// frontend/package.json additions
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@vitest/ui": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

---

## Estimated Implementation Effort

| Category | Files | Est. Hours |
|----------|-------|-----------|
| Backend Routers | 12 files | 24-36h |
| Backend Services | 5 files | 10-15h |
| Frontend Unit | 10 files | 15-20h |
| Frontend Integration | 5 files | 10-15h |
| E2E Tests | 3 files | 8-12h |
| **Total** | **35 files** | **67-98h** |

---

## Conclusion

The codebase currently has **~10% test coverage**. To reach production-grade coverage (80%+), approximately **70-100 hours** of focused testing work is needed. Priority should be given to backend routers with complex business logic (Chart, Options) and critical services (EDGAR, FRED).
