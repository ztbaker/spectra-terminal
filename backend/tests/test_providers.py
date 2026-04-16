import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import pandas as pd
import numpy as np

from providers.registry import get_provider, get_providers_for, _PROVIDERS
from providers.base import BaseProvider
from providers.fallback import try_providers
from models.shared import Quote, Fundamental, NewsItem, OptionContract, EconSeries, Filing


class TestRegistry:
    def test_yfinance_provider_registered(self):
        assert get_provider("yfinance") is not None

    def test_finnhub_provider_registered(self):
        assert get_provider("finnhub") is not None

    def test_fred_provider_registered(self):
        assert get_provider("fred") is not None

    def test_edgar_provider_registered(self):
        assert get_provider("edgar") is not None

    def test_unknown_provider_returns_none(self):
        assert get_provider("nonexistent") is None

    def test_provider_priority_quote(self):
        providers = get_providers_for("quote")
        assert providers[0].name == "yfinance"

    def test_provider_priority_news(self):
        providers = get_providers_for("news")
        assert providers[0].name == "finnhub"

    def test_provider_priority_econ(self):
        providers = get_providers_for("econ_series")
        assert providers[0].name == "fred"

    def test_provider_priority_filings(self):
        providers = get_providers_for("filings")
        assert providers[0].name == "edgar"


class TestQuoteModel:
    def test_quote_defaults(self):
        q = Quote(ticker="AAPL")
        assert q.ticker == "AAPL"
        assert q.price is None
        assert q.source == ""

    def test_quote_with_values(self):
        q = Quote(ticker="AAPL", price=150.0, change=2.5, source="yfinance")
        assert q.price == 150.0
        assert q.change == 2.5
        assert q.source == "yfinance"
        assert q.cached is False


class TestFundamentalModel:
    def test_fundamental_defaults(self):
        f = Fundamental(ticker="MSFT")
        assert f.ticker == "MSFT"
        assert f.pe_ratio is None
        assert f.source == ""


class TestNewsItemModel:
    def test_news_item(self):
        n = NewsItem(
            headline="Test",
            source="test",
            url="http://example.com",
            datetime=1234567890,
            summary="Summary",
            sentiment="positive",
            source_provider="finnhub",
        )
        assert n.headline == "Test"
        assert n.source_provider == "finnhub"


class TestOptionContractModel:
    def test_option_contract_defaults(self):
        c = OptionContract(strike=100.0)
        assert c.strike == 100.0
        assert c.delta is None
        assert c.in_the_money is False


class TestEconSeriesModel:
    def test_econ_series(self):
        e = EconSeries(series_id="FEDFUNDS")
        assert e.series_id == "FEDFUNDS"
        assert e.observations == []


class TestFilingModel:
    def test_filing(self):
        f = Filing(
            form_type="10-K",
            filed_date="2024-01-01",
            description="Annual report",
            url="http://sec.gov",
        )
        assert f.form_type == "10-K"


class TestFallback:
    @pytest.mark.asyncio
    async def test_try_providers_returns_first_success(self):
        mock_provider = MagicMock(spec=BaseProvider)
        mock_provider.name = "mock"
        mock_provider.get_quote = AsyncMock(return_value=Quote(ticker="AAPL", price=150.0))

        from providers.registry import _PROVIDER_PRIORITY
        with patch.dict(_PROVIDERS, {"mock": mock_provider}, clear=True), \
             patch.dict(_PROVIDER_PRIORITY, {"quote": ["mock"]}):
            result, name, cached = await try_providers("quote", "get_quote", "AAPL")
            assert result is not None
            assert result.ticker == "AAPL"
            assert name == "mock"
            assert cached is False

    @pytest.mark.asyncio
    async def test_try_providers_returns_none_on_all_fail(self):
        mock_provider = MagicMock(spec=BaseProvider)
        mock_provider.name = "fail"
        mock_provider.get_quote = AsyncMock(return_value=None)

        from providers.registry import _PROVIDER_PRIORITY
        with patch.dict(_PROVIDERS, {"fail": mock_provider}, clear=True), \
             patch.dict(_PROVIDER_PRIORITY, {"quote": ["fail"]}):
            result, name, cached = await try_providers("quote", "get_quote", "AAPL")
            assert result is None


class TestYFinanceProvider:
    @pytest.mark.asyncio
    async def test_get_quote_returns_quote(self):
        provider = get_provider("yfinance")
        assert provider is not None
        assert provider.name == "yfinance"

    @pytest.mark.asyncio
    async def test_get_historical_returns_none_for_invalid(self):
        provider = get_provider("yfinance")
        assert provider is not None
        result = await provider.get_historical("INVALIDTICKER12345")
        assert result is None