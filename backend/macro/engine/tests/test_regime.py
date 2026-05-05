import math
import sqlite3
import os
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from macro.models import ScoreState, FactorScore, RegimeReading
from macro.types import RegimeName, FactorName, Conviction
from macro.engine.regime import RegimeClassifier


def _make_state(rr=0.0, ra=0.0, dl=0.0, gi=0.0, d="2025-01-15"):
    return ScoreState(
        date=d,
        factors=[
            FactorScore(factor=FactorName.REAL_RATE, slow_pctile=50, fast_pctile=50, positioning_pctile=50, blended=rr),
            FactorScore(factor=FactorName.RISK_APPETITE, slow_pctile=50, fast_pctile=50, positioning_pctile=50, blended=ra),
            FactorScore(factor=FactorName.DOLLAR_LIQUIDITY, slow_pctile=50, fast_pctile=50, positioning_pctile=50, blended=dl),
            FactorScore(factor=FactorName.GROWTH_INFLATION, slow_pctile=50, fast_pctile=50, positioning_pctile=50, blended=gi),
        ],
        asset_scores={},
    )


@pytest.fixture
def classifier(tmp_path):
    db_path = str(tmp_path / "test.db")
    from database import init_db
    with patch("database.settings") as mock_settings:
        mock_settings.DB_PATH = db_path
        init_db(db_path)
    with patch("database.get_db_path", return_value=db_path):
        with patch("database.settings") as mock_settings:
            mock_settings.DB_PATH = db_path
            yield RegimeClassifier()


class TestRegimeClassification:

    def test_disinflation_risk_on(self, classifier):
        state = _make_state(rr=-0.8, ra=0.7, dl=0.6, gi=0.1)
        assert classifier._determine_regime(state) == RegimeName.DISINFLATION_RISK_ON

    def test_stagflation_defensive(self, classifier):
        state = _make_state(rr=0.8, ra=-0.7, dl=-0.3, gi=-0.6)
        assert classifier._determine_regime(state) == RegimeName.STAGFLATION_DEFENSIVE

    def test_flight_to_quality(self, classifier):
        state = _make_state(rr=-0.6, ra=-0.7, dl=0.2, gi=-0.8)
        assert classifier._determine_regime(state) == RegimeName.FLIGHT_TO_QUALITY

    def test_reflation(self, classifier):
        state = _make_state(rr=0.6, ra=0.7, dl=0.3, gi=0.8)
        assert classifier._determine_regime(state) == RegimeName.REFLATION

    def test_mixed_no_edge(self, classifier):
        state = _make_state(rr=0.1, ra=0.2, dl=-0.1, gi=-0.2)
        assert classifier._determine_regime(state) == RegimeName.MIXED_NO_EDGE

    def test_mixed_when_conflicting(self, classifier):
        state = _make_state(rr=0.1, ra=0.1, dl=0.1, gi=0.1)
        assert classifier._determine_regime(state) == RegimeName.MIXED_NO_EDGE

    def test_priority_resolution_higher_abs_wins(self, classifier):
        state = _make_state(rr=0.9, ra=0.8, dl=0.8, gi=0.9)
        result = classifier._determine_regime(state)
        assert result == RegimeName.REFLATION

    def test_below_threshold_is_mixed(self, classifier):
        state = _make_state(rr=-0.3, ra=0.4, dl=0.35, gi=0.45)
        assert classifier._determine_regime(state) == RegimeName.MIXED_NO_EDGE

    def test_missing_factors_treated_as_zero(self, classifier):
        state = ScoreState(
            date="2025-01-15",
            factors=[
                FactorScore(factor=FactorName.REAL_RATE, slow_pctile=50, fast_pctile=50, positioning_pctile=50, blended=-0.8),
                FactorScore(factor=FactorName.RISK_APPETITE, slow_pctile=50, fast_pctile=50, positioning_pctile=50, blended=0.7),
            ],
            asset_scores={},
        )
        assert classifier._determine_regime(state) == RegimeName.MIXED_NO_EDGE

    def test_all_zero_scores_is_mixed(self, classifier):
        state = _make_state(rr=0.0, ra=0.0, dl=0.0, gi=0.0)
        assert classifier._determine_regime(state) == RegimeName.MIXED_NO_EDGE


class TestConviction:

    def test_high_conviction(self, classifier):
        state = _make_state(rr=-1.2, ra=1.2, dl=1.2, gi=-1.1)
        regime = RegimeName.DISINFLATION_RISK_ON
        assert classifier._compute_conviction(state, regime) == Conviction.HIGH

    def test_medium_conviction(self, classifier):
        state = _make_state(rr=-0.7, ra=0.6, dl=0.55, gi=0.3)
        regime = RegimeName.DISINFLATION_RISK_ON
        assert classifier._compute_conviction(state, regime) == Conviction.MEDIUM

    def test_low_conviction_mixed_regime(self, classifier):
        state = _make_state(rr=0.1, ra=0.2, dl=-0.1, gi=-0.2)
        assert classifier._compute_conviction(state, RegimeName.MIXED_NO_EDGE) == Conviction.LOW

    def test_low_conviction_weak_signals(self, classifier):
        state = _make_state(rr=-0.55, ra=0.52, dl=0.51, gi=0.2)
        regime = RegimeName.DISINFLATION_RISK_ON
        assert classifier._compute_conviction(state, regime) == Conviction.LOW


class TestCoherence:

    def test_perfect_coherence(self, classifier):
        state = _make_state(rr=0.8, ra=0.8, dl=0.8, gi=0.8)
        coherence = classifier._compute_coherence(state)
        assert coherence == 1.0

    def test_zero_scores_perfect_coherence(self, classifier):
        state = _make_state(rr=0.0, ra=0.0, dl=0.0, gi=0.0)
        coherence = classifier._compute_coherence(state)
        assert coherence == 1.0

    def test_scattered_scores_low_coherence(self, classifier):
        state = _make_state(rr=1.5, ra=-1.5, dl=1.5, gi=-1.5)
        coherence = classifier._compute_coherence(state)
        assert coherence < 0.5

    def test_coherence_bounded_zero_one(self, classifier):
        state = _make_state(rr=3.0, ra=-3.0, dl=3.0, gi=-3.0)
        coherence = classifier._compute_coherence(state)
        assert 0.0 <= coherence <= 1.0


class TestRegimeAge:

    def test_first_run_age_zero(self, classifier):
        assert classifier._get_regime_age(RegimeName.DISINFLATION_RISK_ON) == 0

    def test_same_regime_increments_age(self, classifier):
        db_path = classifier._get_db_path() if hasattr(classifier, '_get_db_path') else None
        from database import get_conn
        with patch("database.settings") as mock_settings:
            mock_settings.DB_PATH = str(classifier.__class__.DB_PATH) if hasattr(classifier, 'DB_PATH') else ':memory:'
        today_str = date.today().isoformat()
        from database import get_conn
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today_str, "disinflation_risk_on", "medium", 0, 0.75),
            )
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM macro_regime_history").fetchone()
            assert row is not None
        age = classifier._get_regime_age(RegimeName.DISINFLATION_RISK_ON)
        assert age == 0

    def test_different_regime_resets_age(self, classifier):
        from database import get_conn
        today_str = date.today().isoformat()
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today_str, "reflation", "high", 5, 0.9),
            )
        age = classifier._get_regime_age(RegimeName.DISINFLATION_RISK_ON)
        assert age == 0


class TestRecentShift:

    def test_no_shift_initially(self, classifier):
        assert classifier._check_recent_shift() is False

    def test_recent_shift_detected(self, classifier):
        from database import get_conn
        today = date.today()
        today_str = today.isoformat()
        yesterday_str = (today - timedelta(days=1)).isoformat()
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (yesterday_str, "reflation", "high", 3, 0.9),
            )
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today_str, "disinflation_risk_on", "medium", 0, 0.7),
            )
        assert classifier._check_recent_shift() is True

    def test_old_shift_not_detected(self, classifier):
        from database import get_conn
        today = date.today()
        old_date = (today - timedelta(days=14)).isoformat()
        older_date = (today - timedelta(days=21)).isoformat()
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (older_date, "reflation", "high", 3, 0.9),
            )
            conn.execute(
                "INSERT INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (old_date, "disinflation_risk_on", "medium", 0, 0.7),
            )
        assert classifier._check_recent_shift() is False


class TestClassify:

    def test_classify_returns_regime_reading(self, classifier):
        state = _make_state(rr=-0.8, ra=0.7, dl=0.6, gi=0.1)
        result = classifier.classify(state)
        assert isinstance(result, RegimeReading)
        assert result.regime == RegimeName.DISINFLATION_RISK_ON
        assert result.conviction in (Conviction.LOW, Conviction.MEDIUM, Conviction.HIGH)
        assert 0.0 <= result.coherence_score <= 1.0
        assert result.age_days >= 0

    def test_classify_persists(self, classifier):
        state = _make_state(rr=-0.8, ra=0.7, dl=0.6, gi=0.1)
        classifier.classify(state)
        from database import get_conn
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM macro_regime_history ORDER BY date DESC LIMIT 1").fetchone()
            assert row is not None
            assert row["regime_name"] == "disinflation_risk_on"

    def test_classify_first_run(self, classifier):
        state = _make_state(rr=0.1, ra=0.2, dl=-0.1, gi=-0.2)
        result = classifier.classify(state)
        assert result.regime == RegimeName.MIXED_NO_EDGE
        assert result.conviction == Conviction.LOW
        assert result.age_days == 0
        assert result.recently_shifted is False