"""Trade-ready filter — 3-confirmation framework for surfacing trade ideas."""

from macro.models import (
    TradeIdea, ScoreState, RegimeReading, CatalystAlignment, IVRankData,
)
from macro.types import AssetSymbol, Conviction, FACTOR_ASSET_MAP, RegimeName


class TradeFilter:
    def filter(
        self,
        score_state: ScoreState,
        regime: RegimeReading,
        catalyst_alignment: CatalystAlignment,
        iv_ranks: dict[str, IVRankData],
    ) -> list[TradeIdea]:
        if regime.regime == RegimeName.MIXED_NO_EDGE:
            return []

        ideas: list[TradeIdea] = []

        for asset_symbol in AssetSymbol:
            asset = asset_symbol.value

            if asset == "VIX":
                if regime.regime == RegimeName.DISINFLATION_RISK_ON:
                    continue
                if regime.regime == RegimeName.FLIGHT_TO_QUALITY:
                    continue

            score_passes, direction = self._check_score_confirmation(asset, score_state)
            if not score_passes:
                continue

            if asset == "VIX":
                if direction == "long" and regime.regime == RegimeName.DISINFLATION_RISK_ON:
                    continue
                if direction == "short" and regime.regime == RegimeName.FLIGHT_TO_QUALITY:
                    continue

            catalyst_passes = self._check_catalyst_confirmation(asset, catalyst_alignment)
            vol_passes = self._check_vol_confirmation(asset, direction, iv_ranks.get(asset))

            confirmations = sum([score_passes, catalyst_passes, vol_passes])

            if confirmations < 2:
                continue

            iv_rank = iv_ranks.get(asset)
            structure = self._generate_structure(asset, direction, iv_rank)
            entry_condition = self._generate_entry_condition(asset, direction, score_state)
            invalidation = self._generate_invalidation(asset, direction, score_state)
            dte_range = self._generate_dte_range(asset, score_state)

            if confirmations == 3 and regime.conviction == Conviction.HIGH:
                conviction = Conviction.HIGH
            elif confirmations == 3:
                conviction = Conviction.MEDIUM
            else:
                conviction = Conviction.LOW

            iv_rank_data = iv_ranks.get(asset)
            if iv_rank_data and iv_rank_data.sufficient_history and iv_rank_data.rank_pct is not None:
                rank_val = iv_rank_data.rank_pct
                if rank_val < 30:
                    label = "cheap"
                elif rank_val < 70:
                    label = "moderate"
                else:
                    label = "elevated"
                iv_context = f"IV Rank {rank_val:.0f}% ({label})"
            else:
                iv_context = "IV Rank: insufficient history (< 6mo)"

            ideas.append(TradeIdea(
                asset=asset_symbol,
                direction=direction,
                dte_range=dte_range,
                structure=structure,
                entry_condition=entry_condition,
                invalidation=invalidation,
                conviction=conviction,
                iv_rank_context=iv_context,
                confirmations=confirmations,
                half_size=(confirmations == 2),
            ))

        conviction_order = {Conviction.HIGH: 0, Conviction.MEDIUM: 1, Conviction.LOW: 2}

        def sort_key(idea: TradeIdea) -> tuple:
            score_magnitude = abs(
                score_state.asset_scores.get(idea.asset.value, {}).get("horizon_10d", 0)
            )
            return (conviction_order.get(idea.conviction, 3), -score_magnitude)

        ideas.sort(key=sort_key)

        return ideas[:5]

    def _check_score_confirmation(self, asset: str, score_state: ScoreState) -> tuple[bool, str]:
        scores = score_state.asset_scores.get(asset, {})
        score_10d = scores.get("horizon_10d", 0)

        if abs(score_10d) < 0.75:
            return (False, "neutral")

        direction = "long" if score_10d > 0 else "short"
        return (True, direction)

    def _check_catalyst_confirmation(self, asset: str, alignment: CatalystAlignment) -> bool:
        state = alignment.per_asset.get(asset)
        if state is None:
            return True

        if state.aligned_with_score is False:
            return False

        return True

    def _check_vol_confirmation(self, asset: str, direction: str, iv_rank: IVRankData | None) -> bool:
        if iv_rank is None or not iv_rank.sufficient_history:
            return True

        rank = iv_rank.rank_pct
        if rank is None:
            return True

        if direction == "long":
            return rank < 50
        else:
            return rank > 50

    def _generate_structure(self, asset: str, direction: str, iv_rank: IVRankData | None) -> str:
        rank = iv_rank.rank_pct if iv_rank and iv_rank.rank_pct is not None else 35

        is_vix = asset == "VIX"

        if direction == "long":
            if is_vix:
                if rank < 25:
                    return "VIX call"
                elif rank < 50:
                    return "VIX call spread"
                else:
                    return "OTM VIX call spread"
            else:
                if rank < 25:
                    return "ATM call"
                elif rank < 50:
                    return "ATM call spread"
                else:
                    return "OTM call spread"
        else:
            if is_vix:
                if rank > 75:
                    return "VIX put"
                elif rank > 50:
                    return "VIX put spread"
                else:
                    return "OTM VIX put spread"
            else:
                if rank > 75:
                    return "ATM put"
                elif rank > 50:
                    return "ATM put spread"
                else:
                    return "OTM put spread"

    def _generate_entry_condition(self, asset: str, direction: str, score_state: ScoreState) -> str:
        templates: dict[str, dict[str, str]] = {
            "SPY": {
                "long": "Enter on SPY close above 5d SMA with HY-IG spread narrowing",
                "short": "Enter on SPY close below 5d SMA with HY-IG spread widening",
            },
            "VIX": {
                "long": "Enter on VIX spike with term structure in backwardation",
                "short": "Enter on VIX decline with term structure in contango",
            },
            "GLD": {
                "long": "Enter on GLD holding above 5d SMA with real rates declining",
                "short": "Enter on GLD breaking below 5d SMA with real rates rising",
            },
            "SLV": {
                "long": "Enter on SLD close above 5d SMA with growth-inflation supportive",
                "short": "Enter on SLV close below 5d SMA with growth-inflation fading",
            },
            "DXY": {
                "long": "Enter on DXY breakout above 5d SMA with liquidity contracting",
                "short": "Enter on DXY breakdown below 5d SMA with liquidity expanding",
            },
            "WTI": {
                "long": "Enter on WTI close above 5d SMA with EIA draw expected",
                "short": "Enter on WTI close below 5d SMA with EIA build expected",
            },
            "BRENT": {
                "long": "Enter on BRENT close above 5d SMA with growth-inflation supportive",
                "short": "Enter on BRENT close below 5d SMA with demand outlook weak",
            },
        }

        asset_templates = templates.get(asset, {})
        condition = asset_templates.get(direction, f"Enter on {asset} directional signal confirmed")

        if len(condition) > 80:
            condition = condition[:77] + "..."

        return condition

    def _generate_invalidation(self, asset: str, direction: str, score_state: ScoreState) -> str:
        templates: dict[str, dict[str, str]] = {
            "SPY": {
                "long": "HY-IG widens >10bp from entry (risk-off invalidates long SPY)",
                "short": "HY-IG narrows >10bp from entry (risk-on invalidates short SPY)",
            },
            "VIX": {
                "long": "Term structure shifts to contango (vol demand vanishes)",
                "short": "VIX spikes above recent high (fear persists, squeeze risk)",
            },
            "GLD": {
                "long": "10Y TIPS yield breaks above key resistance (real rates too high)",
                "short": "10Y TIPS yield breaks below support (real rates favor gold rally)",
            },
            "SLV": {
                "long": "Growth-inflation factor reverses (industrial demand thesis breaks)",
                "short": "Growth-inflation factor surges (inflation bid supports silver)",
            },
            "DXY": {
                "long": "Fed pivots dovish unexpectedly (liquidity expands, dollar weakens)",
                "short": "DXY closes above 104.5 (dollar strength persists)",
            },
            "WTI": {
                "long": "EIA reports unexpected build (demand thesis invalidated)",
                "short": "EIA reports unexpected draw (supply tightness persists)",
            },
            "BRENT": {
                "long": "Growth-inflation reverses bearish (demand destruction thesis)",
                "short": "Growth-inflation reverses bullish (supply constraint supports Brent)",
            },
        }

        asset_templates = templates.get(asset, {})
        return asset_templates.get(direction, f"Macro thesis for {asset} {direction} breaks down")

    def _generate_dte_range(self, asset: str, score_state: ScoreState) -> tuple[int, int]:
        scores = score_state.asset_scores.get(asset, {})
        score_5d = abs(scores.get("horizon_5d", 0))
        score_10d = abs(scores.get("horizon_10d", 0))
        score_21d = abs(scores.get("horizon_21d", 0))

        dominant = max(
            [("5d", score_5d), ("10d", score_10d), ("21d", score_21d)],
            key=lambda x: x[1],
        )

        horizon = dominant[0]

        if horizon == "5d" and score_5d >= 1.5:
            return (5, 10)
        elif horizon == "21d":
            return (14, 21)
        elif horizon == "10d":
            return (7, 14)
        else:
            return (7, 14)