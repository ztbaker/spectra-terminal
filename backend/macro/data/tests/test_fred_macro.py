"""Tests for FRED macro scoring data client."""

from unittest.mock import AsyncMock, patch

import pytest

from macro.data.fred_macro import (
    CACHE_KEY,
    CACHE_TTL,
    _build_scoring_inputs,
    fetch_scoring_inputs,
)
from macro.models import FactorInputSet, ScoringInputs
from macro.types import FactorName


@pytest.fixture
def mock_cache_empty():
    with patch("macro.data.fred_macro.cache_get", return_value=None), \
         patch("macro.data.fred_macro.cache_set"):
        yield


@pytest.fixture
def mock_cache_hit():
    cached_data = {
        "date": "2025-01-15",
        "real_rate": {"slow": {"DFII10": [1.5]}, "fast": {"T5YIFR": [2.3]}, "positioning": {}},
        "risk_appetite": {"slow": {"BAMLH0A0HYM2": [3.1]}, "fast": {}, "positioning": {}},
        "dollar_liquidity": {
            "slow": {"WALCL": [8.0], "WTREGEN": [0.5], "RRPONTSYD": [0.3]},
            "fast": {"DGS2": [4.5]},
            "positioning": {},
        },
        "growth_inflation": {"slow": {"MANEMP": [50.0]}, "fast": {"T10Y2Y": [0.3]}, "positioning": {}},
    }
    with patch("macro.data.fred_macro.cache_get", return_value=cached_data), \
         patch("macro.data.fred_macro.cache_set"):
        yield


def _make_fetch_side_effect(series_map: dict[str, list[float] | Exception]):
    async def _fetch(series_id, start, api_key):
        if series_id in series_map:
            val = series_map[series_id]
            if isinstance(val, Exception):
                raise val
            return val
        return []

    return _fetch


@pytest.mark.asyncio
async def test_fetch_scoring_inputs_returns_valid_structure(mock_cache_empty):
    series_data = {
        "DFII10": [1.0, 2.0, 3.0, 4.0, 5.0],
        "T5YIFR": [1.1, 2.1, 3.1, 4.1, 5.1],
        "BAMLH0A0HYM2": [1.2, 2.2, 3.2, 4.2, 5.2],
        "WALCL": [1.3, 2.3, 3.3, 4.3, 5.3],
        "WTREGEN": [1.4, 2.4, 3.4, 4.4, 5.4],
        "RRPONTSYD": [1.5, 2.5, 3.5, 4.5, 5.5],
        "DGS2": [1.6, 2.6, 3.6, 4.6, 5.6],
        "MANEMP": [1.7, 2.7, 3.7, 4.7, 5.7],
        "T10Y2Y": [1.8, 2.8, 3.8, 4.8, 5.8],
    }

    with patch("macro.data.fred_macro._fetch_series", side_effect=_make_fetch_side_effect(series_data)), \
         patch.dict("os.environ", {"FRED_API_KEY": "test-key"}):
        result = await fetch_scoring_inputs(use_cache=False)

    assert isinstance(result, ScoringInputs)
    assert result.date
    assert isinstance(result.real_rate, FactorInputSet)
    assert isinstance(result.risk_appetite, FactorInputSet)
    assert isinstance(result.dollar_liquidity, FactorInputSet)
    assert isinstance(result.growth_inflation, FactorInputSet)

    assert "DFII10" in result.real_rate.slow
    assert "T5YIFR" in result.real_rate.fast
    assert len(result.real_rate.slow["DFII10"]) == 5

    assert "WALCL" in result.dollar_liquidity.slow
    assert "DGS2" in result.dollar_liquidity.fast
    assert "MANEMP" in result.growth_inflation.slow
    assert "T10Y2Y" in result.growth_inflation.fast


@pytest.mark.asyncio
async def test_missing_values_filtered(mock_cache_empty):
    series_data = {
        "DFII10": [1.0, 2.0],
        "T5YIFR": [3.0],
        "BAMLH0A0HYM2": [4.0],
        "WALCL": [5.0],
        "WTREGEN": [6.0],
        "RRPONTSYD": [7.0],
        "DGS2": [8.0],
        "MANEMP": [9.0],
        "T10Y2Y": [10.0],
    }

    with patch("macro.data.fred_macro._fetch_series", side_effect=_make_fetch_side_effect(series_data)), \
         patch.dict("os.environ", {"FRED_API_KEY": "test-key"}):
        result = await fetch_scoring_inputs(use_cache=False)

    assert len(result.real_rate.slow["DFII10"]) == 2
    assert 1.0 in result.real_rate.slow["DFII10"]
    assert 2.0 in result.real_rate.slow["DFII10"]


@pytest.mark.asyncio
async def test_cache_returns_cached_data(mock_cache_hit):
    with patch.dict("os.environ", {"FRED_API_KEY": "test-key"}):
        result = await fetch_scoring_inputs(use_cache=True)

    assert isinstance(result, ScoringInputs)
    assert result.date == "2025-01-15"
    assert result.real_rate.slow["DFII10"] == [1.5]


@pytest.mark.asyncio
async def test_cache_miss_triggers_fetch(mock_cache_empty):
    series_data = {
        "DFII10": [1.0],
        "T5YIFR": [2.0],
        "BAMLH0A0HYM2": [3.0],
        "WALCL": [4.0],
        "WTREGEN": [5.0],
        "RRPONTSYD": [6.0],
        "DGS2": [7.0],
        "MANEMP": [8.0],
        "T10Y2Y": [9.0],
    }

    with patch("macro.data.fred_macro._fetch_series", side_effect=_make_fetch_side_effect(series_data)), \
         patch.dict("os.environ", {"FRED_API_KEY": "test-key"}):
        result = await fetch_scoring_inputs(use_cache=True)

    assert isinstance(result, ScoringInputs)
    assert len(result.real_rate.slow["DFII10"]) == 1


@pytest.mark.asyncio
async def test_graceful_degradation_on_series_failure(mock_cache_empty):
    series_data = {
        "DFII10": [1.0],
        "T5YIFR": RuntimeError("series failed"),
        "BAMLH0A0HYM2": [3.0],
        "WALCL": [4.0],
        "WTREGEN": [5.0],
        "RRPONTSYD": [6.0],
        "DGS2": [7.0],
        "MANEMP": [8.0],
        "T10Y2Y": [9.0],
    }

    with patch("macro.data.fred_macro._fetch_series", side_effect=_make_fetch_side_effect(series_data)), \
         patch.dict("os.environ", {"FRED_API_KEY": "test-key"}):
        result = await fetch_scoring_inputs(use_cache=False)

    assert isinstance(result, ScoringInputs)
    assert result.real_rate.fast["T5YIFR"] == []
    assert len(result.real_rate.slow["DFII10"]) == 1


@pytest.mark.asyncio
async def test_all_series_failure_raises_error(mock_cache_empty):
    async def _always_fail(series_id, start, api_key):
        raise RuntimeError("all fail")

    with patch("macro.data.fred_macro._fetch_series", side_effect=_always_fail), \
         patch.dict("os.environ", {"FRED_API_KEY": "test-key"}):
        with pytest.raises(RuntimeError, match="All FRED series fetches failed"):
            await fetch_scoring_inputs(use_cache=False)


@pytest.mark.asyncio
async def test_missing_api_key_raises_error():
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="FRED_API_KEY"):
            await fetch_scoring_inputs(use_cache=False)


@pytest.mark.asyncio
async def test_build_scoring_inputs_structure():
    factor_data: dict[FactorName, dict[str, dict[str, list[float]]]] = {
        FactorName.REAL_RATE: {
            "slow": {"DFII10": [1.5, 1.6]},
            "fast": {"T5YIFR": [2.3]},
            "positioning": {},
        },
        FactorName.RISK_APPETITE: {
            "slow": {"BAMLH0A0HYM2": [3.1]},
            "fast": {},
            "positioning": {},
        },
        FactorName.DOLLAR_LIQUIDITY: {
            "slow": {"WALCL": [8.0], "WTREGEN": [0.5], "RRPONTSYD": [0.3]},
            "fast": {"DGS2": [4.5]},
            "positioning": {},
        },
        FactorName.GROWTH_INFLATION: {
            "slow": {"MANEMP": [50.0]},
            "fast": {"T10Y2Y": [0.3]},
            "positioning": {},
        },
    }

    result = _build_scoring_inputs(factor_data)

    assert result.real_rate.slow["DFII10"] == [1.5, 1.6]
    assert result.dollar_liquidity.slow["WALCL"] == [8.0]
    assert result.dollar_liquidity.fast["DGS2"] == [4.5]
    assert result.growth_inflation.fast["T10Y2Y"] == [0.3]