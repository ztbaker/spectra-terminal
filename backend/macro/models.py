"""MACRO subsystem — Pydantic models for all state and responses."""

from __future__ import annotations
from pydantic import BaseModel
from .types import RegimeName, FactorName, AssetSymbol, Conviction


# ─── Data Layer Models ────────────────────────────────────────────────────────

class FactorInputSet(BaseModel):
    slow: dict[str, list[float]]
    fast: dict[str, list[float]]
    positioning: dict[str, list[float]]


class ScoringInputs(BaseModel):
    date: str
    real_rate: FactorInputSet
    risk_appetite: FactorInputSet
    dollar_liquidity: FactorInputSet
    growth_inflation: FactorInputSet


class CftcPosition(BaseModel):
    report_date: str
    asset: str
    net_long: int
    pct_oi: float
    change_1w: int


class FedWatchMeeting(BaseModel):
    date: str
    prob_hike: float
    prob_hold: float
    prob_cut: float
    implied_rate: float


class FedWatchState(BaseModel):
    as_of: str
    meetings: list[FedWatchMeeting]
    implied_direction: str


class IVRankData(BaseModel):
    asset: str
    current_iv30: float | None
    rank_pct: float | None
    sufficient_history: bool
    history_days: int


class AssetSnapshot(BaseModel):
    asset: str
    price: float | None
    change_1d_pct: float | None
    change_5d_pct: float | None
    change_21d_pct: float | None
    volume: float | None


class VIXTermStructure(BaseModel):
    vix_spot: float | None
    vix3m: float | None
    ratio: float | None
    in_backwardation: bool


class StraddlePricing(BaseModel):
    asset: str
    expiry: str
    dte: int
    atm_strike: float
    call_price: float
    put_price: float
    straddle_price: float
    implied_move_pct: float


# ─── Engine Models ────────────────────────────────────────────────────────────

class FactorScore(BaseModel):
    factor: FactorName
    slow_pctile: float
    fast_pctile: float
    positioning_pctile: float
    blended: float


class ScoreState(BaseModel):
    date: str
    factors: list[FactorScore]
    asset_scores: dict[str, dict[str, float]]


class RegimeReading(BaseModel):
    regime: RegimeName
    age_days: int
    conviction: Conviction
    recently_shifted: bool
    coherence_score: float


class CatalystEvent(BaseModel):
    event_date: str
    event_time: str | None
    event_type: str
    event_label: str
    assets_impacted: list[AssetSymbol]
    consensus_value: float | None
    prior_value: float | None
    surprise_weight: float
    straddle_implied_move: float | None


class AssetCatalystState(BaseModel):
    catalyst_density_14d: int
    next_catalyst: CatalystEvent | None
    aligned_with_score: bool | None
    atm_straddle_move_14d: float | None


class CatalystAlignment(BaseModel):
    date: str
    per_asset: dict[str, AssetCatalystState]


class TradeIdea(BaseModel):
    asset: AssetSymbol
    direction: str
    dte_range: tuple[int, int]
    structure: str
    entry_condition: str
    invalidation: str
    conviction: Conviction
    iv_rank_context: str
    confirmations: int
    half_size: bool


class NarrativeOutput(BaseModel):
    date: str
    regime_narrative: str
    trade_narrative: str
    model_used: str


# ─── API Response Models ──────────────────────────────────────────────────────

class AssetScoreCard(BaseModel):
    asset: AssetSymbol
    price: float | None
    change_1d_pct: float | None
    change_5d_pct: float | None
    change_21d_pct: float | None
    score_5d: float
    score_10d: float
    score_21d: float
    iv_rank: float | None
    dominant_factor: FactorName
    state_line: str
    border_state: str


class MacroDashboardResponse(BaseModel):
    regime: RegimeReading
    asset_scores: dict[str, AssetScoreCard]
    catalysts: list[CatalystEvent]
    trade_ideas: list[TradeIdea]
    narrative: NarrativeOutput | None
    last_refresh: str | None
    stale: bool
