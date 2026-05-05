"""Tests for CatalystAligner — catalyst alignment evaluator."""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from macro.models import AssetCatalystState, CatalystAlignment, CatalystEvent, ScoreState, FactorScore
from macro.types import AssetSymbol
from macro.engine.catalyst_align import CatalystAligner


def _make_score_state(asset_scores: dict | None = None) -> ScoreState:
    if asset_scores is None:
        asset_scores = {a.value: {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0} for a in AssetSymbol}
    return ScoreState(date=date.today().isoformat(), factors=[], asset_scores=asset_scores)


def _make_catalyst(
    event_type: str = "EIA",
    event_date: str | None = None,
    assets_impacted: list[str] | None = None,
    consensus_value: float | None = None,
    surprise_weight: float = 1.0,
) -> CatalystEvent:
    if event_date is None:
        event_date = (date.today() + timedelta(days=3)).isoformat()
    if assets_impacted is None:
        assets_impacted = ["WTI", "BRENT"]
    return CatalystEvent(
        event_date=event_date,
        event_time=None,
        event_type=event_type,
        event_label=f"Test {event_type}",
        assets_impacted=[AssetSymbol(a) for a in assets_impacted],
        consensus_value=consensus_value,
        prior_value=None,
        surprise_weight=surprise_weight,
        straddle_implied_move=None,
    )


def run_async(coro):
    return asyncio.run(coro)


# ─── Test 1: Density count per asset ──────────────────────────────────────────

def test_density_count_per_asset():
    catalysts = [
        _make_catalyst(event_type="CPI", assets_impacted=["SPY", "GLD"]),
        _make_catalyst(event_type="NFP", assets_impacted=["SPY", "DXY"]),
        _make_catalyst(event_type="EIA", assets_impacted=["WTI", "BRENT"]),
    ]

    aligner = CatalystAligner()

    with patch("macro.engine.catalyst_align.get_upcoming_catalysts", new_callable=AsyncMock, return_value=catalysts):
        with patch("macro.engine.catalyst_align.get_catalyst_density", new_callable=AsyncMock) as mock_density:
            mock_density.side_effect = lambda asset, days=14: sum(
                1 for c in catalysts if asset in [a.value for a in c.assets_impacted]
            )
            with patch("macro.engine.catalyst_align.fetch_atm_straddle_price", new_callable=AsyncMock, return_value=None):
                result = run_async(aligner.evaluate(_make_score_state()))

    assert result.per_asset["SPY"].catalyst_density_14d == 2
    assert result.per_asset["GLD"].catalyst_density_14d == 1
    assert result.per_asset["WTI"].catalyst_density_14d == 1
    assert result.per_asset["VIX"].catalyst_density_14d == 0


# ─── Test 2: Next catalyst is chronologically nearest ──────────────────────────

def test_next_catalyst_is_nearest():
    catalysts = [
        _make_catalyst(event_type="CPI", event_date=(date.today() + timedelta(days=7)).isoformat(), assets_impacted=["SPY"]),
        _make_catalyst(event_type="NFP", event_date=(date.today() + timedelta(days=2)).isoformat(), assets_impacted=["SPY"]),
        _make_catalyst(event_type="FOMC", event_date=(date.today() + timedelta(days=10)).isoformat(), assets_impacted=["SPY"]),
    ]

    aligner = CatalystAligner()
    next_cat = aligner._find_next_catalyst("SPY", catalysts)

    assert next_cat is not None
    assert next_cat.event_type == "NFP"


# ─── Test 3: EIA + long WTI returns True ──────────────────────────────────────

def test_eia_long_wti_aligned():
    catalyst = _make_catalyst(event_type="EIA", assets_impacted=["WTI"])
    aligner = CatalystAligner()
    result = aligner._assess_alignment("WTI", 0.65, catalyst)
    assert result is True


# ─── Test 4: EIA + short WTI returns False ────────────────────────────────────

def test_eia_short_wti_opposing():
    catalyst = _make_catalyst(event_type="EIA", assets_impacted=["WTI"])
    aligner = CatalystAligner()
    result = aligner._assess_alignment("WTI", -0.5, catalyst)
    assert result is False


# ─── Test 5: FOMC returns None (uncertain) ───────────────────────────────────

def test_fomc_returns_none():
    catalyst = _make_catalyst(event_type="FOMC", assets_impacted=["SPY", "GLD"])
    aligner = CatalystAligner()
    result = aligner._assess_alignment("SPY", 0.8, catalyst)
    assert result is None


# ─── Test 6: No catalysts — all assets get neutral state ──────────────────────

def test_no_catalysts_all_neutral():
    aligner = CatalystAligner()

    with patch("macro.engine.catalyst_align.get_upcoming_catalysts", new_callable=AsyncMock, return_value=[]):
        with patch("macro.engine.catalyst_align.get_catalyst_density", new_callable=AsyncMock, return_value=0):
            with patch("macro.engine.catalyst_align.fetch_atm_straddle_price", new_callable=AsyncMock, return_value=None):
                result = run_async(aligner.evaluate(_make_score_state()))

    for asset in AssetSymbol:
        state = result.per_asset[asset.value]
        assert state.catalyst_density_14d == 0
        assert state.next_catalyst is None
        assert state.aligned_with_score is None


# ─── Test 7: Straddle data available for some assets, not others ──────────────

def test_straddle_partial_availability():
    from macro.models import StraddlePricing

    spy_pricing = StraddlePricing(
        asset="SPY",
        expiry=(date.today() + timedelta(days=14)).isoformat(),
        dte=14,
        atm_strike=500.0,
        call_price=10.0,
        put_price=10.0,
        straddle_price=20.0,
        implied_move_pct=4.0,
    )

    def mock_straddle(asset, dte_target=14):
        if asset == "SPY":
            return spy_pricing
        if asset == "GLD":
            return StraddlePricing(
                asset="GLD",
                expiry=(date.today() + timedelta(days=14)).isoformat(),
                dte=14,
                atm_strike=200.0,
                call_price=5.0,
                put_price=5.0,
                straddle_price=10.0,
                implied_move_pct=5.0,
            )
        return None

    aligner = CatalystAligner()

    with patch("macro.engine.catalyst_align.get_upcoming_catalysts", new_callable=AsyncMock, return_value=[]):
        with patch("macro.engine.catalyst_align.get_catalyst_density", new_callable=AsyncMock, return_value=0):
            with patch("macro.engine.catalyst_align.fetch_atm_straddle_price", new_callable=AsyncMock, side_effect=mock_straddle):
                result = run_async(aligner.evaluate(_make_score_state()))

    assert result.per_asset["SPY"].atm_straddle_move_14d == 4.0
    assert result.per_asset["GLD"].atm_straddle_move_14d == 5.0
    assert result.per_asset["VIX"].atm_straddle_move_14d is None
    assert result.per_asset["DXY"].atm_straddle_move_14d is None


# ─── Test 8: Full evaluate() pipeline with mocked dependencies ────────────────

def test_full_evaluate_pipeline():
    catalysts = [
        _make_catalyst(event_type="EIA", assets_impacted=["WTI", "BRENT"]),
        _make_catalyst(event_type="CPI", assets_impacted=["SPY", "GLD"]),
    ]

    asset_scores = {a.value: {"horizon_5d": 0.0, "horizon_10d": 0.5, "horizon_21d": 0.0} for a in AssetSymbol}
    asset_scores["WTI"] = {"horizon_5d": 0.0, "horizon_10d": 0.7, "horizon_21d": 0.0}
    asset_scores["GLD"] = {"horizon_5d": 0.0, "horizon_10d": -0.3, "horizon_21d": 0.0}
    score_state = _make_score_state(asset_scores)

    aligner = CatalystAligner()

    with patch("macro.engine.catalyst_align.get_upcoming_catalysts", new_callable=AsyncMock, return_value=catalysts):
        with patch("macro.engine.catalyst_align.get_catalyst_density", new_callable=AsyncMock) as mock_density:
            mock_density.side_effect = lambda asset, days=14: sum(
                1 for c in catalysts if asset in [a.value for a in c.assets_impacted]
            )
            with patch("macro.engine.catalyst_align.fetch_atm_straddle_price", new_callable=AsyncMock, return_value=None):
                result = run_async(aligner.evaluate(score_state))

    assert isinstance(result, CatalystAlignment)
    assert len(result.per_asset) == 7

    wti_state = result.per_asset["WTI"]
    assert wti_state.catalyst_density_14d == 1
    assert wti_state.aligned_with_score is True

    gld_state = result.per_asset["GLD"]
    assert gld_state.catalyst_density_14d == 1