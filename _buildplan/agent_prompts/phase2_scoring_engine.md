# Agent A8 — Scoring Engine + Normalizer

## Objective

Implement the core scoring engine that takes raw factor inputs (from FRED, yfinance, CFTC) and produces per-asset directional scores at 5d/10d/21d horizons. The normalizer converts raw values to percentile ranks over a 2-year rolling window. The scoring engine blends slow/fast/positioning signals using documented weights and maps factor scores to asset-level scores.

## Pre-flight Reads

1. `backend/macro/models.py` — `ScoringInputs`, `FactorInputSet`, `FactorScore`, `ScoreState`
2. `backend/macro/types.py` — `FactorName`, `AssetSymbol`, `FACTOR_WEIGHTS`, `FACTOR_ASSET_MAP`
3. `backend/macro/data/fred_macro.py` — understand the data shape returned by `fetch_scoring_inputs()`
4. `backend/macro/data/iv_logger.py` — understand `IVRankData` shape
5. `backend/macro/data/market_data.py` — understand `VIXTermStructure`, `fetch_put_call_ratio()`

## Scope — Files This Agent Owns

- `backend/macro/engine/normalizer.py` — **create/fill**
- `backend/macro/engine/scoring.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

All other files. Do not modify models.py, types.py, or any data/ files.

## Interface Contract

```python
# backend/macro/engine/normalizer.py

class Normalizer:
    @staticmethod
    def percentile_rank(current_value: float, history: list[float], window_days: int = 504) -> float:
        """
        Compute the percentile rank of current_value within the last window_days of history.
        Returns 0-100. If history has fewer than 30 values, returns 50.0 (neutral).
        """
        ...

    @staticmethod
    def zscore(current_value: float, history: list[float], window_days: int = 504) -> float:
        """
        Compute z-score of current_value vs trailing history.
        Used as secondary normalization for series with non-uniform distributions.
        """
        ...
```

```python
# backend/macro/engine/scoring.py

from backend.macro.models import ScoringInputs, ScoreState, FactorScore

class ScoringEngine:
    async def compute(self, inputs: ScoringInputs = None) -> ScoreState:
        """
        Compute the full score state for today.
        If inputs is None, fetches them from the data layer.
        Returns ScoreState with per-factor scores and per-asset horizon scores.
        """
        ...

    def _score_factor(self, factor_name: FactorName, input_set: FactorInputSet) -> FactorScore:
        """Score a single factor from its raw inputs."""
        ...

    def _map_to_assets(self, factor_scores: list[FactorScore]) -> dict[str, dict[str, float]]:
        """
        Map factor-level scores to per-asset scores at each horizon.
        Returns: { "SPY": { "horizon_5d": 1.2, "horizon_10d": 0.8, "horizon_21d": 1.5 }, ... }
        """
        ...
```

### ScoreState model (in models.py, do not modify):
```python
class ScoreState(BaseModel):
    date: str
    factors: list[FactorScore]
    asset_scores: dict[str, dict[str, float]]  # asset -> {horizon_5d, horizon_10d, horizon_21d}
```

## Implementation Requirements

### Normalizer

**Percentile rank:**
```python
def percentile_rank(current_value, history, window_days=504):
    # Use only the last window_days values
    window = history[-window_days:] if len(history) > window_days else history
    if len(window) < 30:
        return 50.0  # insufficient data, neutral
    count_below = sum(1 for v in window if v < current_value)
    return (count_below / len(window)) * 100.0
```

**Z-score:**
```python
def zscore(current_value, history, window_days=504):
    window = history[-window_days:] if len(history) > window_days else history
    if len(window) < 30:
        return 0.0
    mean = sum(window) / len(window)
    std = (sum((x - mean) ** 2 for x in window) / len(window)) ** 0.5
    if std < 1e-10:
        return 0.0
    return (current_value - mean) / std
```

### Scoring Engine — Factor Scoring

For each factor, the process is:
1. Get the latest value for each input series (last element of the list)
2. Compute percentile rank against the full series history (2-year window = 504 trading days)
3. Convert percentile to a directional score:
   - Real-rate: HIGH TIPS yield = bearish gold → score = -(percentile - 50) / 25 (capped at -2 to +2)
   - Risk-appetite: NARROW spreads = bullish SPY → score = -(percentile - 50) / 25 (narrow = low percentile)
   - Dollar-liquidity: HIGH net liquidity = bullish assets → score = (percentile - 50) / 25
   - Growth-inflation: HIGH PMI/copper-gold = bullish oil/SPY → score = (percentile - 50) / 25
4. Blend slow/fast/positioning scores using FACTOR_WEIGHTS from types.py:
   ```python
   blended = slow_weight * slow_score + fast_weight * fast_score + pos_weight * positioning_score
   ```
5. Clip blended to [-2, +2]

### Factor-to-Asset Mapping

Each factor maps to specific assets (defined in `FACTOR_ASSET_MAP`). An asset may be driven by multiple factors.

**Per-asset score computation:**
```python
for asset in ASSETS:
    contributing_factors = [f for f in factor_scores if asset in FACTOR_ASSET_MAP[f.factor]]
    if not contributing_factors:
        asset_score = 0.0
    else:
        # Simple average of contributing factor blended scores
        asset_score = sum(f.blended for f in contributing_factors) / len(contributing_factors)
```

### Horizon Differentiation (5d / 10d / 21d)

The horizon scores differentiate by which inputs dominate:
- **5d horizon:** Heavily weights the "fast" input (60% fast, 30% slow, 10% positioning)
- **10d horizon:** Balanced (40% fast, 40% slow, 20% positioning)
- **21d horizon:** Heavily weights the "slow" input (20% fast, 50% slow, 30% positioning)

This means `_score_factor` is called three times per factor with different weight overrides.

### Special Cases

- **VIX scoring:** VIX is inversely correlated with SPY. If risk_appetite factor is bullish (+), VIX score is negative (expect VIX down). The sign is flipped for VIX.
- **DXY from dollar_liquidity:** Higher liquidity → weaker dollar. DXY score is inverted from the factor score.
- **SLV dual-factor:** Silver is driven by both real_rate AND growth_inflation. Average both factor contributions.

### Data Persistence

After computing, store the ScoreState in `macro_scores` table:
```python
with get_conn() as conn:
    for factor in score_state.factors:
        conn.execute("""
            INSERT OR REPLACE INTO macro_scores (date, factor_name, score_5d, score_10d, score_21d, raw_inputs_json)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (score_state.date, factor.factor.value, ...))
```

### Missing Data Handling

- If a factor's input set has empty lists (data fetch failed), score that factor as 0.0 (neutral) and log a warning.
- If positioning data is empty (common for first runs before CFTC data loads), use 50th percentile (neutral positioning).
- Never crash on missing data — always produce a valid ScoreState.

## Test Requirements

Create `backend/macro/engine/tests/test_scoring.py`:
1. Test normalizer percentile_rank with known values.
2. Test normalizer z-score with known values.
3. Test normalizer returns 50.0 when insufficient history (< 30 values).
4. Test factor scoring with synthetic inputs — verify output in [-2, +2].
5. Test VIX sign inversion.
6. Test DXY sign inversion.
7. Test horizon weight differentiation (5d should be more responsive to fast input).
8. Test full `compute()` with mocked data layer.
9. Test missing data graceful degradation.

Run: `cd backend && python -m pytest macro/engine/tests/test_scoring.py -v`

## Hard Constraints

- No new pip dependencies (numpy/pandas already available but prefer pure Python for scoring — no heavy deps).
- Do not modify models.py, types.py, or data layer files.
- Score values MUST be clipped to [-2, +2] range.
- All weights must come from `types.py` constants — no magic numbers in scoring.py.

## Done Criteria

- [ ] `Normalizer.percentile_rank()` produces correct percentile values
- [ ] `Normalizer.zscore()` produces correct z-scores
- [ ] `ScoringEngine.compute()` returns valid ScoreState with all factors scored
- [ ] Horizon differentiation works (5d/10d/21d have different values)
- [ ] VIX and DXY inversions applied correctly
- [ ] Scores always within [-2, +2]
- [ ] Missing data handled gracefully (neutral scores, no crashes)
- [ ] Results persisted to macro_scores table
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A8_scoring_engine.md`
