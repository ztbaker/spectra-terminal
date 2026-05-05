"""Tests for TradeFilter — 3-confirmation trade-ready filter."""

from __future__ import annotations

from datetime import date

import pytest

from macro.models import (
    FactorScore,
    ScoreState,
    RegimeReading,
    CatalystAlignment,
    AssetCatalystState,
    CatalystEvent,
    IVRankData,
    TradeIdea,
)
from macro.types import AssetSymbol, Conviction, RegimeName, FactorName
from macro.engine.filter import TradeFilter


def _make_score_state(asset_scores: dict | None = None) -> ScoreState:
    if asset_scores is None:
        asset_scores = {
            a.value: {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
            for a in AssetSymbol
        }
    return ScoreState(date=date.today().isoformat(), factors=[], asset_scores=asset_scores)


def _make_regime(
    regime: RegimeName = RegimeName.DISINFLATION_RISK_ON,
    conviction: Conviction = Conviction.HIGH,
) -> RegimeReading:
    return RegimeReading(
        regime=regime,
        age_days=30,
        conviction=conviction,
        recently_shifted=False,
        coherence_score=0.8,
    )


def _make_catalyst_alignment(
    per_asset: dict[str, AssetCatalystState] | None = None,
) -> CatalystAlignment:
    if per_asset is None:
        per_asset = {}
    return CatalystAlignment(date=date.today().isoformat(), per_asset=per_asset)


def _make_asset_catalyst_state(
    aligned_with_score: bool | None = None,
) -> AssetCatalystState:
    return AssetCatalystState(
        catalyst_density_14d=0,
        next_catalyst=None,
        aligned_with_score=aligned_with_score,
        atm_straddle_move_14d=None,
    )


def _make_iv_ranks(
    overrides: dict[str, dict] | None = None,
) -> dict[str, IVRankData]:
    defaults = {}
    for asset in AssetSymbol:
        name = asset.value
        defaults[name] = IVRankData(
            asset=name,
            current_iv30=30.0,
            rank_pct=30.0,
            sufficient_history=True,
            history_days=200,
        )
    if overrides:
        for name, vals in overrides.items():
            defaults[name] = IVRankData(
                asset=name,
                current_iv30=vals.get("current_iv30", 30.0),
                rank_pct=vals.get("rank_pct"),
                sufficient_history=vals.get("sufficient_history", True),
                history_days=vals.get("history_days", 200),
            )
    return defaults


def _full_catalyst_neutral() -> CatalystAlignment:
    per_asset = {}
    for asset in AssetSymbol:
        per_asset[asset.value] = _make_asset_catalyst_state(aligned_with_score=None)
    return _make_catalyst_alignment(per_asset)


def _full_catalyst_aligned() -> CatalystAlignment:
    per_asset = {}
    for asset in AssetSymbol:
        per_asset[asset.value] = _make_asset_catalyst_state(aligned_with_score=True)
    return _make_catalyst_alignment(per_asset)


def _full_catalyst_opposing() -> CatalystAlignment:
    per_asset = {}
    for asset in AssetSymbol:
        per_asset[asset.value] = _make_asset_catalyst_state(aligned_with_score=False)
    return _make_catalyst_alignment(per_asset)


# ─── Test 1: 3/3 confirmations → HIGH conviction ──────────────────────────────

class TestThreeConfirmationsHighConviction:
    def test_three_confirmations_high_conviction(self):
        tf = TradeFilter()
        asset_scores = {a.value: {"horizon_5d": 0.5, "horizon_10d": 1.0, "horizon_21d": 0.5} for a in AssetSymbol}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        assert len(ideas) > 0
        for idea in ideas:
            if idea.confirmations == 3:
                assert idea.conviction == Conviction.HIGH
                assert idea.half_size is False

    def test_three_confirmations_medium_conviction_regime(self):
        tf = TradeFilter()
        asset_scores = {a.value: {"horizon_5d": 0.5, "horizon_10d": 1.0, "horizon_21d": 0.5} for a in AssetSymbol}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(conviction=Conviction.MEDIUM),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        for idea in ideas:
            if idea.confirmations == 3:
                assert idea.conviction == Conviction.MEDIUM


# ─── Test 2: 2/3 confirmations → half_size, LOW conviction ────────────────────

class TestTwoConfirmationsHalfSize:
    def test_two_confirmations_half_size_low_conviction(self):
        tf = TradeFilter()
        asset_scores = {}
        for a in AssetSymbol:
            if a == AssetSymbol.SPY:
                asset_scores[a.value] = {"horizon_5d": 0.5, "horizon_10d": 1.0, "horizon_21d": 0.5}
            else:
                asset_scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
        per_asset = {}
        for a in AssetSymbol:
            if a == AssetSymbol.SPY:
                per_asset[a.value] = _make_asset_catalyst_state(aligned_with_score=True)
            else:
                per_asset[a.value] = _make_asset_catalyst_state(aligned_with_score=None)
        iv_ranks = _make_iv_ranks(overrides={"SPY": {"rank_pct": 70.0}})
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_make_catalyst_alignment(per_asset),
            iv_ranks=iv_ranks,
        )
        spy_ideas = [i for i in ideas if i.asset == AssetSymbol.SPY]
        assert len(spy_ideas) == 1
        assert spy_ideas[0].confirmations == 2
        assert spy_ideas[0].half_size is True
        assert spy_ideas[0].conviction == Conviction.LOW


# ─── Test 3: 1/3 confirmations → no idea generated ───────────────────────────

class TestOneConfirmation:
    def test_single_confirmation_no_idea(self):
        tf = TradeFilter()
        asset_scores = {}
        for a in AssetSymbol:
            if a == AssetSymbol.SPY:
                asset_scores[a.value] = {"horizon_5d": 0.5, "horizon_10d": 1.0, "horizon_21d": 0.5}
            else:
                asset_scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
        per_asset = {}
        for a in AssetSymbol:
            if a == AssetSymbol.SPY:
                per_asset[a.value] = _make_asset_catalyst_state(aligned_with_score=False)
            else:
                per_asset[a.value] = _make_asset_catalyst_state(aligned_with_score=None)
        iv_ranks = _make_iv_ranks(overrides={"SPY": {"rank_pct": 70.0}})
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_make_catalyst_alignment(per_asset),
            iv_ranks=iv_ranks,
        )
        assert len(ideas) == 0


# ─── Test 4: Score threshold |score| < 0.75 fails Confirmation 1 ──────────────

class TestScoreThreshold:
    def test_score_below_threshold(self):
        tf = TradeFilter()
        passed, direction = tf._check_score_confirmation("SPY", _make_score_state(
            {"SPY": {"horizon_5d": 0.3, "horizon_10d": 0.5, "horizon_21d": 0.1}}
        ))
        assert passed is False
        assert direction == "neutral"

    def test_score_exactly_at_threshold(self):
        tf = TradeFilter()
        passed, direction = tf._check_score_confirmation("SPY", _make_score_state(
            {"SPY": {"horizon_5d": 0.0, "horizon_10d": 0.75, "horizon_21d": 0.0}}
        ))
        assert passed is True
        assert direction == "long"

    def test_score_negative_direction(self):
        tf = TradeFilter()
        passed, direction = tf._check_score_confirmation("SPY", _make_score_state(
            {"SPY": {"horizon_5d": 0.0, "horizon_10d": -1.2, "horizon_21d": 0.0}}
        ))
        assert passed is True
        assert direction == "short"


# ─── Test 5: Catalyst opposing fails Confirmation 2 ───────────────────────────

class TestCatalystConfirmation:
    def test_opposing_catalyst_fails(self):
        tf = TradeFilter()
        alignment = _make_catalyst_alignment(
            {"SPY": _make_asset_catalyst_state(aligned_with_score=False)}
        )
        assert tf._check_catalyst_confirmation("SPY", alignment) is False

    def test_aligned_catalyst_passes(self):
        tf = TradeFilter()
        alignment = _make_catalyst_alignment(
            {"SPY": _make_asset_catalyst_state(aligned_with_score=True)}
        )
        assert tf._check_catalyst_confirmation("SPY", alignment) is True

    def test_neutral_catalyst_passes(self):
        tf = TradeFilter()
        alignment = _make_catalyst_alignment(
            {"SPY": _make_asset_catalyst_state(aligned_with_score=None)}
        )
        assert tf._check_catalyst_confirmation("SPY", alignment) is True

    def test_missing_asset_passes(self):
        tf = TradeFilter()
        alignment = _make_catalyst_alignment({})
        assert tf._check_catalyst_confirmation("SPY", alignment) is True


# ─── Test 6: IV rank favorable / unfavorable ───────────────────────────────────

class TestVolConfirmation:
    def test_long_favorable_low_iv(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=20.0, rank_pct=25.0, sufficient_history=True, history_days=200)
        assert tf._check_vol_confirmation("SPY", "long", iv) is True

    def test_long_unfavorable_high_iv(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=50.0, rank_pct=65.0, sufficient_history=True, history_days=200)
        assert tf._check_vol_confirmation("SPY", "long", iv) is False

    def test_short_favorable_high_iv(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=50.0, rank_pct=65.0, sufficient_history=True, history_days=200)
        assert tf._check_vol_confirmation("SPY", "short", iv) is True

    def test_short_unfavorable_low_iv(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=20.0, rank_pct=25.0, sufficient_history=True, history_days=200)
        assert tf._check_vol_confirmation("SPY", "short", iv) is False

    def test_insufficient_history_passes(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=None, rank_pct=None, sufficient_history=False, history_days=30)
        assert tf._check_vol_confirmation("SPY", "long", iv) is True

    def test_none_iv_data_passes(self):
        tf = TradeFilter()
        assert tf._check_vol_confirmation("SPY", "long", None) is True

    def test_none_rank_pct_passes(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=30.0, rank_pct=None, sufficient_history=True, history_days=200)
        assert tf._check_vol_confirmation("SPY", "long", iv) is True


# ─── Test 7: MIXED_NO_EDGE regime → empty result ─────────────────────────────

class TestMixedNoEdge:
    def test_mixed_no_edge_returns_empty(self):
        tf = TradeFilter()
        asset_scores = {a.value: {"horizon_5d": 1.0, "horizon_10d": 1.0, "horizon_21d": 1.0} for a in AssetSymbol}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(regime=RegimeName.MIXED_NO_EDGE),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        assert ideas == []


# ─── Test 8: VIX special rules ────────────────────────────────────────────────

class TestVIXSpecialRules:
    def test_long_vix_blocked_in_disinflation_risk_on(self):
        tf = TradeFilter()
        asset_scores = {}
        for a in AssetSymbol:
            if a == AssetSymbol.VIX:
                asset_scores[a.value] = {"horizon_5d": 1.0, "horizon_10d": 1.5, "horizon_21d": 0.5}
            else:
                asset_scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(regime=RegimeName.DISINFLATION_RISK_ON),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        vix_ideas = [i for i in ideas if i.asset == AssetSymbol.VIX]
        assert len(vix_ideas) == 0

    def test_short_vix_blocked_in_flight_to_quality(self):
        tf = TradeFilter()
        asset_scores = {}
        for a in AssetSymbol:
            if a == AssetSymbol.VIX:
                asset_scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": -1.5, "horizon_21d": 0.0}
            else:
                asset_scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(regime=RegimeName.FLIGHT_TO_QUALITY),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        vix_ideas = [i for i in ideas if i.asset == AssetSymbol.VIX]
        assert len(vix_ideas) == 0

    def test_vix_allowed_in_other_regimes(self):
        tf = TradeFilter()
        asset_scores = {}
        for a in AssetSymbol:
            if a == AssetSymbol.VIX:
                asset_scores[a.value] = {"horizon_5d": 1.0, "horizon_10d": 1.5, "horizon_21d": 0.5}
            else:
                asset_scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(regime=RegimeName.STAGFLATION_DEFENSIVE),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        vix_ideas = [i for i in ideas if i.asset == AssetSymbol.VIX]
        assert len(vix_ideas) == 1
        assert vix_ideas[0].direction == "long"


# ─── Test 9: Max 5 ideas with sorting ─────────────────────────────────────────

class TestMaxFiveIdeasSorting:
    def test_max_five_ideas(self):
        tf = TradeFilter()
        asset_scores = {}
        for a in AssetSymbol:
            asset_scores[a.value] = {"horizon_5d": 1.0, "horizon_10d": 1.5, "horizon_21d": 0.5}
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        assert len(ideas) <= 5

    def test_sorted_by_conviction(self):
        tf = TradeFilter()
        scores = {
            "SPY": {"horizon_5d": 1.0, "horizon_10d": 1.5, "horizon_21d": 0.5},
            "GLD": {"horizon_5d": 0.5, "horizon_10d": 0.8, "horizon_21d": 0.3},
        }
        for a in AssetSymbol:
            if a.value not in scores:
                scores[a.value] = {"horizon_5d": 0.0, "horizon_10d": 0.0, "horizon_21d": 0.0}
        asset_scores = scores
        ideas = tf.filter(
            score_state=_make_score_state(asset_scores),
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        if len(ideas) >= 2:
            conviction_order = {Conviction.HIGH: 0, Conviction.MEDIUM: 1, Conviction.LOW: 2}
            for i in range(len(ideas) - 1):
                assert conviction_order[ideas[i].conviction] <= conviction_order[ideas[i + 1].conviction]


# ─── Test 10: Structure generation varies by IV rank ───────────────────────────

class TestStructureGeneration:
    def test_long_low_iv_atm_call(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=15.0, rank_pct=20.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("SPY", "long", iv) == "ATM call"

    def test_long_medium_iv_call_spread(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=25.0, rank_pct=35.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("SPY", "long", iv) == "ATM call spread"

    def test_long_high_iv_otm_call_spread(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=50.0, rank_pct=70.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("SPY", "long", iv) == "OTM call spread"

    def test_short_high_iv_atm_put(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=50.0, rank_pct=80.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("SPY", "short", iv) == "ATM put"

    def test_short_medium_iv_put_spread(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=35.0, rank_pct=60.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("SPY", "short", iv) == "ATM put spread"

    def test_short_low_iv_otm_put_spread(self):
        tf = TradeFilter()
        iv = IVRankData(asset="SPY", current_iv30=15.0, rank_pct=30.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("SPY", "short", iv) == "OTM put spread"

    def test_vix_long_uses_call_labels(self):
        tf = TradeFilter()
        iv = IVRankData(asset="VIX", current_iv30=20.0, rank_pct=20.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("VIX", "long", iv) == "VIX call"

    def test_vix_short_uses_put_labels(self):
        tf = TradeFilter()
        iv = IVRankData(asset="VIX", current_iv30=50.0, rank_pct=80.0, sufficient_history=True, history_days=200)
        assert tf._generate_structure("VIX", "short", iv) == "VIX put"

    def test_none_iv_defaults_to_50(self):
        tf = TradeFilter()
        assert tf._generate_structure("SPY", "long", None) == "ATM call spread"


# ─── Test 11: DTE range selection by dominant horizon ─────────────────────────

class TestDTERangeSelection:
    def test_dominant_5d_high_score(self):
        tf = TradeFilter()
        asset_scores = _make_score_state(
            {"SPY": {"horizon_5d": 2.0, "horizon_10d": 0.8, "horizon_21d": 0.3}}
        )
        ideas = tf.filter(
            score_state=asset_scores,
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        spy_ideas = [i for i in ideas if i.asset == AssetSymbol.SPY]
        assert len(spy_ideas) == 1
        assert spy_ideas[0].dte_range == (5, 10)

    def test_dominant_10d(self):
        tf = TradeFilter()
        asset_scores = _make_score_state(
            {"SPY": {"horizon_5d": 0.5, "horizon_10d": 1.5, "horizon_21d": 0.3}}
        )
        ideas = tf.filter(
            score_state=asset_scores,
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        spy_ideas = [i for i in ideas if i.asset == AssetSymbol.SPY]
        assert len(spy_ideas) == 1
        assert spy_ideas[0].dte_range == (7, 14)

    def test_dominant_21d(self):
        tf = TradeFilter()
        asset_scores = _make_score_state(
            {"SPY": {"horizon_5d": 0.3, "horizon_10d": 0.8, "horizon_21d": 1.5}}
        )
        ideas = tf.filter(
            score_state=asset_scores,
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        spy_ideas = [i for i in ideas if i.asset == AssetSymbol.SPY]
        assert len(spy_ideas) == 1
        assert spy_ideas[0].dte_range == (14, 21)

    def test_default_dte(self):
        tf = TradeFilter()
        asset_scores = _make_score_state(
            {"SPY": {"horizon_5d": 0.8, "horizon_10d": 0.8, "horizon_21d": 0.8}}
        )
        ideas = tf.filter(
            score_state=asset_scores,
            regime=_make_regime(conviction=Conviction.HIGH),
            catalyst_alignment=_full_catalyst_aligned(),
            iv_ranks=_make_iv_ranks(),
        )
        spy_ideas = [i for i in ideas if i.asset == AssetSymbol.SPY]
        assert len(spy_ideas) == 1
        assert spy_ideas[0].dte_range in [(5, 10), (7, 14), (14, 21)]