"""Tests for ScoringEngine and Normalizer."""

from __future__ import annotations

import asyncio
import json
import math
from datetime import date
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from macro.engine.normalizer import Normalizer
from macro.engine.scoring import ScoringEngine, _FACTOR_DIRECTION
from macro.models import ScoringInputs, FactorInputSet, FactorScore, ScoreState
from macro.types import FactorName, AssetSymbol, FACTOR_ASSET_MAP, HORIZON_WEIGHTS, INVERTED_ASSETS


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_history(value: float, length: int = 500, spread: float = 1.0) -> list[float]:
    """Generate a synthetic history with a known latest value."""
    import random
    random.seed(42)
    base = [value + random.gauss(0, spread) for _ in range(length - 1)]
    return base + [value]


def _make_input_set(
    slow_val: float = 50.0,
    fast_val: float = 50.0,
    pos_val: float = 50.0,
    history_len: int = 500,
    spread: float = 10.0,
    slow_empty: bool = False,
    fast_empty: bool = False,
    pos_empty: bool = False,
) -> FactorInputSet:
    """Create a FactorInputSet with synthetic data."""
    slow = {} if slow_empty else {"S1": _make_history(slow_val, history_len, spread)}
    fast = {} if fast_empty else {"F1": _make_history(fast_val, history_len, spread)}
    positioning = {} if pos_empty else {"P1": _make_history(pos_val, history_len, spread)}
    return FactorInputSet(slow=slow, fast=fast, positioning=positioning)


def _make_scoring_inputs(
    slow_val: float = 50.0,
    fast_val: float = 50.0,
    pos_val: float = 50.0,
    history_len: int = 500,
    spread: float = 10.0,
) -> ScoringInputs:
    """Create ScoringInputs with the same values for all factors."""
    fis = _make_input_set(slow_val, fast_val, pos_val, history_len, spread)
    return ScoringInputs(
        date=date.today().isoformat(),
        real_rate=fis,
        risk_appetite=fis,
        dollar_liquidity=fis,
        growth_inflation=fis,
    )


def run_async(coro):
    return asyncio.run(coro)


# ─── Normalizer Tests ─────────────────────────────────────────────────────────

def test_percentile_rank_median():
    history = list(range(1, 101))
    result = Normalizer.percentile_rank(50.5, history)
    assert 49.0 <= result <= 51.0


def test_percentile_rank_maximum():
    history = list(range(1, 101))
    result = Normalizer.percentile_rank(100, history)
    assert result == 99.0


def test_percentile_rank_minimum():
    history = list(range(1, 101))
    result = Normalizer.percentile_rank(1, history)
    assert result == 0.0


def test_percentile_rank_insufficient_history():
    result = Normalizer.percentile_rank(50.0, list(range(20)))
    assert result == 50.0


def test_percentile_rank_window_truncation():
    long_history = list(range(1, 1001))
    result = Normalizer.percentile_rank(999, long_history, window_days=100)
    assert result > 90.0


def test_zscore_positive():
    history = list(range(1, 101))
    result = Normalizer.zscore(100, history)
    assert result > 0


def test_zscore_negative():
    history = list(range(1, 101))
    result = Normalizer.zscore(1, history)
    assert result < 0


def test_zscore_insufficient_history():
    result = Normalizer.zscore(50.0, list(range(20)))
    assert result == 0.0


def test_zscore_constant_series():
    history = [5.0] * 100
    result = Normalizer.zscore(5.0, history)
    assert result == 0.0


# ─── Scoring Engine Tests ────────────────────────────────────────────────────

def test_factor_score_in_range():
    engine = ScoringEngine()
    input_set = _make_input_set(slow_val=80, fast_val=80, pos_val=80)
    result = engine._score_factor(FactorName.DOLLAR_LIQUIDITY, input_set)
    assert -2.0 <= result.blended <= 2.0
    assert -2.0 <= result.blended <= 2.0


def test_factor_score_all_neutral_at_median():
    engine = ScoringEngine()
    history = list(range(1, 501))
    input_set = FactorInputSet(
        slow={"S1": history + [250.5]},
        fast={"F1": history + [250.5]},
        positioning={"P1": history + [250.5]},
    )
    result = engine._score_factor(FactorName.DOLLAR_LIQUIDITY, input_set)
    assert abs(result.blended) < 0.3


def test_score_factor_empty_inputs():
    engine = ScoringEngine()
    input_set = FactorInputSet(slow={}, fast={}, positioning={})
    result = engine._score_factor(FactorName.REAL_RATE, input_set)
    assert result.blended == 0.0


def test_vix_sign_inversion():
    engine = ScoringEngine()
    inputs = _make_scoring_inputs(slow_val=80, fast_val=80, pos_val=80)

    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    spy_score_5d = score_state.asset_scores["SPY"]["horizon_5d"]
    vix_score_5d = score_state.asset_scores["VIX"]["horizon_5d"]

    assert spy_score_5d * vix_score_5d < 0 or (spy_score_5d == 0 and vix_score_5d == 0), \
        f"VIX ({vix_score_5d}) should be inverted from SPY ({spy_score_5d}) direction"


def test_dxy_sign_inversion():
    engine = ScoringEngine()
    history = [float(i) for i in range(1, 501)]

    inputs = ScoringInputs(
        date=date.today().isoformat(),
        real_rate=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
        risk_appetite=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
        dollar_liquidity=FactorInputSet(
            slow={"S1": history + [450.0]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
        growth_inflation=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
    )

    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    dxy_5d = score_state.asset_scores["DXY"]["horizon_5d"]
    gld_5d = score_state.asset_scores["GLD"]["horizon_5d"]

    if gld_5d != 0.0:
        assert dxy_5d * gld_5d < 0, \
            f"DXY ({dxy_5d}) should be sign-inverted from GLD dollar_liquidity contribution ({gld_5d})"

    assert "DXY" in INVERTED_ASSETS


def test_horizon_weight_differentiation():
    engine = ScoringEngine()
    history = list(range(1, 501))

    fast_series = history + [350]

    inputs = ScoringInputs(
        date=date.today().isoformat(),
        real_rate=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
        risk_appetite=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": fast_series},
            positioning={"P1": history + [250.5]},
        ),
        dollar_liquidity=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
        growth_inflation=FactorInputSet(
            slow={"S1": history + [250.5]},
            fast={"F1": history + [250.5]},
            positioning={"P1": history + [250.5]},
        ),
    )

    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    spy_5d = score_state.asset_scores["SPY"]["horizon_5d"]
    spy_21d = score_state.asset_scores["SPY"]["horizon_21d"]

    assert spy_5d != spy_21d, f"5d ({spy_5d}) and 21d ({spy_21d}) horizons should differ due to different weight profiles"


def test_full_compute_with_mocked_data_layer():
    engine = ScoringEngine()
    inputs = _make_scoring_inputs(slow_val=60, fast_val=40, pos_val=50, history_len=300)

    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    assert isinstance(score_state, ScoreState)
    assert len(score_state.factors) == 4
    assert len(score_state.asset_scores) == 7

    for factor in score_state.factors:
        assert -2.0 <= factor.blended <= 2.0

    for asset_key, horizons in score_state.asset_scores.items():
        for h_key, val in horizons.items():
            assert -2.0 <= val <= 2.0, f"{asset_key}/{h_key} score {val} out of range"


def test_missing_data_graceful_degradation():
    engine = ScoringEngine()

    empty_input = FactorInputSet(slow={}, fast={}, positioning={})
    full_input = _make_input_set(slow_val=60, fast_val=60, pos_val=60)

    inputs = ScoringInputs(
        date=date.today().isoformat(),
        real_rate=empty_input,
        risk_appetite=full_input,
        dollar_liquidity=full_input,
        growth_inflation=full_input,
    )

    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    real_rate_factor = [f for f in score_state.factors if f.factor == FactorName.REAL_RATE][0]
    assert real_rate_factor.blended == 0.0, "Empty data should yield neutral (0.0) blended score"


def test_scores_always_clipped():
    engine = ScoringEngine()
    extreme_history = [0.1] * 499 + [100.0]

    input_set = FactorInputSet(
        slow={"S1": extreme_history},
        fast={"F1": extreme_history},
        positioning={"P1": extreme_history},
    )

    for factor_name in FactorName:
        result = engine._score_factor(factor_name, input_set)
        assert -2.0 <= result.blended <= 2.0, \
            f"{factor_name.value} blended score {result.blended} exceeds bounds"


def test_slv_dual_factor():
    engine = ScoringEngine()
    inputs = _make_scoring_inputs(slow_val=75, fast_val=75, pos_val=75)

    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    assert "SLV" in score_state.asset_scores
    slv_horizons = score_state.asset_scores["SLV"]
    assert "horizon_5d" in slv_horizons
    assert "horizon_10d" in slv_horizons
    assert "horizon_21d" in slv_horizons

    for val in slv_horizons.values():
        assert -2.0 <= val <= 2.0


def test_compute_fetches_data_when_none():
    engine = ScoringEngine()
    mock_inputs = _make_scoring_inputs(slow_val=50, fast_val=50, pos_val=50)

    with patch("macro.data.fred_macro.fetch_scoring_inputs", new_callable=AsyncMock, return_value=mock_inputs) as mock_fetch:
        with patch("macro.engine.scoring.get_conn"):
            score_state = run_async(engine.compute(None))

    mock_fetch.assert_awaited_once()
    assert isinstance(score_state, ScoreState)


def test_all_assets_present():
    engine = ScoringEngine()
    inputs = _make_scoring_inputs()
    with patch("macro.engine.scoring.get_conn"):
        score_state = run_async(engine.compute(inputs))

    for asset in AssetSymbol:
        assert asset.value in score_state.asset_scores