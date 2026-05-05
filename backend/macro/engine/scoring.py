"""Factor scoring engine — computes per-asset directional scores at 5d/10d/21d horizons."""

import json
import logging

from macro.engine.normalizer import Normalizer
from macro.models import ScoringInputs, ScoreState, FactorScore, FactorInputSet
from macro.types import FactorName, FACTOR_WEIGHTS, FACTOR_ASSET_MAP, HORIZON_WEIGHTS, INVERTED_ASSETS, AssetSymbol
from database import get_conn

logger = logging.getLogger(__name__)

_FACTOR_DIRECTION: dict[FactorName, float] = {
    FactorName.REAL_RATE: -1.0,
    FactorName.RISK_APPETITE: -1.0,
    FactorName.DOLLAR_LIQUIDITY: 1.0,
    FactorName.GROWTH_INFLATION: 1.0,
}


class ScoringEngine:
    def __init__(self) -> None:
        self._normalizer = Normalizer()

    async def compute(self, inputs: ScoringInputs | None = None) -> ScoreState:
        """
        Compute the full score state for today.
        If inputs is None, fetches them from the data layer.
        Returns ScoreState with per-factor scores and per-asset horizon scores.
        """
        if inputs is None:
            from macro.data.fred_macro import fetch_scoring_inputs
            inputs = await fetch_scoring_inputs()

        date_str = inputs.date

        factor_input_map: dict[FactorName, FactorInputSet] = {
            FactorName.REAL_RATE: inputs.real_rate,
            FactorName.RISK_APPETITE: inputs.risk_appetite,
            FactorName.DOLLAR_LIQUIDITY: inputs.dollar_liquidity,
            FactorName.GROWTH_INFLATION: inputs.growth_inflation,
        }

        factor_scores: list[FactorScore] = []

        # horizon -> factor_name -> blended score
        factor_horizon_scores: dict[str, dict[FactorName, float]] = {
            horizon: {} for horizon in HORIZON_WEIGHTS
        }

        for factor_name in FactorName:
            input_set = factor_input_map[factor_name]

            slow_pctile, fast_pctile, pos_pctile = self._compute_percentiles(factor_name, input_set)

            base_weights = FACTOR_WEIGHTS[factor_name]
            base_score = self._blend_score(slow_pctile, fast_pctile, pos_pctile, base_weights, factor_name)
            base_score = max(-2.0, min(2.0, base_score))

            factor_scores.append(FactorScore(
                factor=factor_name,
                slow_pctile=round(slow_pctile, 2),
                fast_pctile=round(fast_pctile, 2),
                positioning_pctile=round(pos_pctile, 2),
                blended=round(base_score, 4),
            ))

            for horizon, horizon_weights in HORIZON_WEIGHTS.items():
                h_score = self._blend_score(slow_pctile, fast_pctile, pos_pctile, horizon_weights, factor_name)
                h_score = max(-2.0, min(2.0, h_score))
                factor_horizon_scores[horizon][factor_name] = h_score

        asset_scores = self._map_to_assets(factor_horizon_scores)

        # Build per-factor horizon scores for persistence
        factor_horizon_for_db: dict[str, dict[str, float]] = {}
        for horizon in HORIZON_WEIGHTS:
            factor_horizon_for_db[horizon] = {
                fn.value: round(factor_horizon_scores[horizon][fn], 4)
                for fn in FactorName
            }

        score_state = ScoreState(
            date=date_str,
            factors=factor_scores,
            asset_scores=asset_scores,
        )

        self._persist(score_state, factor_horizon_for_db)
        return score_state

    def _compute_percentiles(
        self, factor_name: FactorName, input_set: FactorInputSet
    ) -> tuple[float, float, float]:
        """Compute percentile ranks for slow, fast, and positioning inputs."""
        slow_pctile = self._aggregate_percentile(input_set.slow)
        fast_pctile = self._aggregate_percentile(input_set.fast)
        pos_pctile = self._aggregate_percentile(input_set.positioning)
        return slow_pctile, fast_pctile, pos_pctile

    def _aggregate_percentile(self, series_dict: dict[str, list[float]]) -> float:
        """Average percentile across all series in a bucket. Returns 50.0 if empty."""
        if not series_dict:
            return 50.0

        percentiles = []
        for series_id, values in series_dict.items():
            if not values:
                continue
            current = values[-1]
            pctile = self._normalizer.percentile_rank(current, values)
            percentiles.append(pctile)

        if not percentiles:
            return 50.0
        return sum(percentiles) / len(percentiles)

    def _directional_score(self, percentile: float, factor_name: FactorName) -> float:
        """Convert percentile to directional score using factor direction."""
        direction = _FACTOR_DIRECTION[factor_name]
        raw = direction * (percentile - 50.0) / 25.0
        return max(-2.0, min(2.0, raw))

    def _blend_score(
        self,
        slow_pctile: float,
        fast_pctile: float,
        pos_pctile: float,
        weights: tuple[float, float, float],
        factor_name: FactorName,
    ) -> float:
        """Blend slow/fast/positioning percentile scores with given weights."""
        w_slow, w_fast, w_pos = weights
        return (
            w_slow * self._directional_score(slow_pctile, factor_name)
            + w_fast * self._directional_score(fast_pctile, factor_name)
            + w_pos * self._directional_score(pos_pctile, factor_name)
        )

    def _score_factor(self, factor_name: FactorName, input_set: FactorInputSet) -> FactorScore:
        """Score a single factor from its raw inputs using base FACTOR_WEIGHTS."""
        slow_pctile, fast_pctile, pos_pctile = self._compute_percentiles(factor_name, input_set)

        base_weights = FACTOR_WEIGHTS[factor_name]
        blended = self._blend_score(slow_pctile, fast_pctile, pos_pctile, base_weights, factor_name)
        blended = max(-2.0, min(2.0, blended))

        return FactorScore(
            factor=factor_name,
            slow_pctile=round(slow_pctile, 2),
            fast_pctile=round(fast_pctile, 2),
            positioning_pctile=round(pos_pctile, 2),
            blended=round(blended, 4),
        )

    def _map_to_assets(
        self,
        factor_horizon_scores: dict[str, dict[FactorName, float]],
    ) -> dict[str, dict[str, float]]:
        """
        Map factor-level horizon scores to per-asset scores at each horizon.
        Returns: { "SPY": { "horizon_5d": 1.2, "horizon_10d": 0.8, "horizon_21d": 1.5 }, ... }
        """
        asset_scores: dict[str, dict[str, float]] = {}

        for asset in AssetSymbol:
            asset_key = asset.value
            asset_scores[asset_key] = {}

            contributing_factors = [
                fn for fn in FactorName if asset in FACTOR_ASSET_MAP[fn]
            ]

            for horizon, factor_scores_map in factor_horizon_scores.items():
                if not contributing_factors:
                    asset_scores[asset_key][f"horizon_{horizon}"] = 0.0
                    continue

                raw_score = sum(
                    factor_scores_map.get(fn, 0.0) for fn in contributing_factors
                ) / len(contributing_factors)

                if asset_key in INVERTED_ASSETS:
                    raw_score = -raw_score

                asset_scores[asset_key][f"horizon_{horizon}"] = round(
                    max(-2.0, min(2.0, raw_score)), 4
                )

        return asset_scores

    def _persist(self, score_state: ScoreState, factor_horizon_scores: dict[str, dict[str, float]]) -> None:
        """Persist ScoreState to macro_scores table."""
        try:
            with get_conn() as conn:
                for factor in score_state.factors:
                    fn = factor.factor.value
                    score_5d = round(factor_horizon_scores["5d"][fn], 4)
                    score_10d = round(factor_horizon_scores["10d"][fn], 4)
                    score_21d = round(factor_horizon_scores["21d"][fn], 4)

                    raw_inputs_json = json.dumps({
                        "slow_pctile": factor.slow_pctile,
                        "fast_pctile": factor.fast_pctile,
                        "positioning_pctile": factor.positioning_pctile,
                        "blended": factor.blended,
                    })

                    conn.execute(
                        """INSERT OR REPLACE INTO macro_scores (date, factor_name, score_5d, score_10d, score_21d, raw_inputs_json)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (score_state.date, fn, score_5d, score_10d, score_21d, raw_inputs_json),
                    )
        except Exception:
            logger.exception("Failed to persist score state to database")