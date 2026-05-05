"""Meta-regime classifier — maps factor signal coherence to named states."""

import math
from datetime import date, timedelta

from macro.models import ScoreState, FactorScore, RegimeReading
from macro.types import RegimeName, FactorName, Conviction
from database import get_conn


class RegimeClassifier:

    THRESHOLD = 0.5

    def classify(self, score_state: ScoreState) -> RegimeReading:
        regime = self._determine_regime(score_state)
        conviction = self._compute_conviction(score_state, regime)
        age_days = self._get_regime_age(regime)
        coherence = self._compute_coherence(score_state)
        recently_shifted = self._check_recent_shift()
        self._persist(score_state.date, regime, conviction, age_days, coherence)
        return RegimeReading(
            regime=regime,
            age_days=age_days,
            conviction=conviction,
            recently_shifted=recently_shifted,
            coherence_score=coherence,
        )

    def _determine_regime(self, score_state: ScoreState) -> RegimeName:
        scores = {f.factor: f.blended for f in score_state.factors}
        rr = scores.get(FactorName.REAL_RATE, 0)
        ra = scores.get(FactorName.RISK_APPETITE, 0)
        dl = scores.get(FactorName.DOLLAR_LIQUIDITY, 0)
        gi = scores.get(FactorName.GROWTH_INFLATION, 0)
        T = self.THRESHOLD

        candidates = []
        if rr < -T and ra > T and dl > T:
            candidates.append(RegimeName.DISINFLATION_RISK_ON)
        if rr > T and ra < -T and gi < -T:
            candidates.append(RegimeName.STAGFLATION_DEFENSIVE)
        if ra < -T and gi < -T and rr < -T:
            candidates.append(RegimeName.FLIGHT_TO_QUALITY)
        if rr > T and ra > T and gi > T:
            candidates.append(RegimeName.REFLATION)

        if len(candidates) == 0:
            return RegimeName.MIXED_NO_EDGE
        if len(candidates) == 1:
            return candidates[0]

        def avg_abs(regime: RegimeName) -> float:
            if regime == RegimeName.DISINFLATION_RISK_ON:
                vals = [abs(rr), abs(ra), abs(dl)]
            elif regime == RegimeName.STAGFLATION_DEFENSIVE:
                vals = [abs(rr), abs(ra), abs(gi)]
            elif regime == RegimeName.FLIGHT_TO_QUALITY:
                vals = [abs(ra), abs(gi), abs(rr)]
            elif regime == RegimeName.REFLATION:
                vals = [abs(rr), abs(ra), abs(gi)]
            else:
                vals = [0]
            return sum(vals) / len(vals)

        return max(candidates, key=avg_abs)

    def _compute_conviction(self, score_state: ScoreState, regime: RegimeName) -> Conviction:
        factor_scores = [abs(f.blended) for f in score_state.factors]
        avg_strength = sum(factor_scores) / len(factor_scores) if factor_scores else 0

        signs = [1 if f.blended > 0 else -1 if f.blended < 0 else 0 for f in score_state.factors]
        unique_signs = set(s for s in signs if s != 0)

        if regime == RegimeName.MIXED_NO_EDGE:
            return Conviction.LOW
        elif avg_strength >= 1.0 and len(unique_signs) <= 2:
            return Conviction.HIGH
        elif avg_strength >= 0.5:
            return Conviction.MEDIUM
        else:
            return Conviction.LOW

    def _compute_coherence(self, score_state: ScoreState) -> float:
        blended = [f.blended for f in score_state.factors]
        if not blended:
            return 1.0
        n = len(blended)
        mean = sum(blended) / n
        variance = sum((x - mean) ** 2 for x in blended) / n
        std_dev = math.sqrt(variance)
        raw = 1.0 - (std_dev / 2.0)
        return max(0.0, min(1.0, raw))

    def _get_regime_age(self, current_regime: RegimeName) -> int:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT regime_name, date FROM macro_regime_history ORDER BY date DESC LIMIT 1"
            ).fetchone()
            if row is None:
                return 0
            if row["regime_name"] == current_regime.value:
                last_date = date.fromisoformat(row["date"])
                return (date.today() - last_date).days
            return 0

    def _check_recent_shift(self) -> bool:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT date, regime_name FROM macro_regime_history ORDER BY date DESC"
            ).fetchall()
            if len(rows) < 2:
                return False
            today = date.today()
            for i in range(1, len(rows)):
                prev = rows[i]
                curr = rows[i - 1]
                if prev["regime_name"] != curr["regime_name"]:
                    transition_date = date.fromisoformat(curr["date"])
                    biz_days = self._business_days_between(transition_date, today)
                    if biz_days <= 5:
                        return True
            return False

    @staticmethod
    def _business_days_between(start: date, end: date) -> int:
        count = 0
        current = start
        while current <= end:
            if current.weekday() < 5:
                count += 1
            current += timedelta(days=1)
        return count

    def _persist(self, today_str: str, regime: RegimeName, conviction: Conviction, age_days: int, coherence: float) -> None:
        with get_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO macro_regime_history (date, regime_name, conviction, age_days, score_coherence) VALUES (?, ?, ?, ?, ?)",
                (today_str, regime.value, conviction.value, age_days, coherence),
            )