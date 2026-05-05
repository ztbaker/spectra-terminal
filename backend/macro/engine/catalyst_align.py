"""Catalyst alignment evaluator — assesses per-asset catalyst support/opposition."""

from __future__ import annotations

import asyncio
from datetime import date

from macro.models import AssetCatalystState, CatalystAlignment, CatalystEvent, ScoreState
from macro.data.catalyst import get_upcoming_catalysts, get_catalyst_density
from macro.data.market_data import fetch_atm_straddle_price
from macro.types import AssetSymbol

STRADDLE_AVAILABLE_ASSETS = {"SPY", "GLD", "SLV", "WTI"}


class CatalystAligner:
    async def evaluate(self, score_state: ScoreState, days_forward: int = 14) -> CatalystAlignment:
        per_asset: dict[str, AssetCatalystState] = {}

        try:
            catalysts = await get_upcoming_catalysts(days=days_forward)
        except Exception:
            catalysts = []

        for asset_symbol in AssetSymbol:
            asset = asset_symbol.value

            try:
                density = await get_catalyst_density(asset, days=days_forward)
            except Exception:
                density = 0

            next_catalyst = self._find_next_catalyst(asset, catalysts)

            asset_score = self._get_asset_score(score_state, asset)

            aligned = self._assess_alignment(asset, asset_score, next_catalyst)

            atm_move = None
            if asset in STRADDLE_AVAILABLE_ASSETS:
                try:
                    pricing = await fetch_atm_straddle_price(asset, dte_target=days_forward)
                    if pricing is not None:
                        atm_move = pricing.implied_move_pct
                except Exception:
                    atm_move = None

            per_asset[asset] = AssetCatalystState(
                catalyst_density_14d=density,
                next_catalyst=next_catalyst,
                aligned_with_score=aligned,
                atm_straddle_move_14d=atm_move,
            )

        return CatalystAlignment(date=score_state.date, per_asset=per_asset)

    def _find_next_catalyst(self, asset: str, catalysts: list[CatalystEvent]) -> CatalystEvent | None:
        matching = []
        for c in catalysts:
            if asset in [a.value if isinstance(a, AssetSymbol) else a for a in c.assets_impacted]:
                matching.append(c)
        if not matching:
            return None
        matching.sort(key=lambda c: c.event_date)
        return matching[0]

    def _get_asset_score(self, score_state: ScoreState, asset: str) -> float:
        asset_scores = score_state.asset_scores.get(asset, {})
        score_10d = asset_scores.get("horizon_10d", 0.0)
        return score_10d

    def _assess_alignment(
        self, asset: str, asset_score: float, next_catalyst: CatalystEvent | None
    ) -> bool | None:
        if next_catalyst is None:
            return None

        if next_catalyst.consensus_value is None and next_catalyst.surprise_weight >= 1.5:
            return None

        event = next_catalyst.event_type

        if event == "FOMC":
            return None

        if event == "EIA" and asset in ("WTI", "BRENT"):
            return bool(asset_score > 0)

        if next_catalyst.surprise_weight >= 1.5:
            return None

        return None