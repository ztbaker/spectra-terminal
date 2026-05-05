# Agent A8 — Scoring Engine + Normalizer: Completion Report

## Status: COMPLETE

## Files Created/Modified

- `backend/macro/engine/normalizer.py` — Implemented `Normalizer.percentile_rank()` and `Normalizer.zscore()` with rolling window support and minimum-history guard
- `backend/macro/engine/scoring.py` — Implemented `ScoringEngine` with `compute()`, `_score_factor()`, `_map_to_assets()`, `_blend_score()`, `_compute_percentiles()`, `_aggregate_percentile()`, `_directional_score()`, and `_persist()`
- `backend/macro/engine/tests/test_scoring.py` — 21 tests covering normalizer, factor scoring, horizon differentiation, VIX/DXY inversions, missing data, clipping, SLV dual-factor, and full pipeline

## Implementation Details

### Normalizer
- `percentile_rank(current_value, history, window_days=504)` — Returns 0-100 percentile. Returns 50.0 (neutral) if < 30 data points.
- `zscore(current_value, history, window_days=504)` — Returns z-score. Returns 0.0 if < 30 data points or zero std dev.

### ScoringEngine
- Computes per-factor percentile ranks across slow/fast/positioning input series
- Applies factor-specific direction: `real_rate` and `risk_appetite` are inverted (HIGH = bearish for gold/bullish for spreads); `dollar_liquidity` and `growth_inflation` are direct
- Converts percentile to directional score: `direction * (percentile - 50) / 25`, clipped to [-2, +2]
- Blends scores at three horizons using `HORIZON_WEIGHTS` from types.py:
  - 5d: (0.30, 0.60, 0.10) — fast-heavy
  - 10d: (0.40, 0.40, 0.20) — balanced
  - 21d: (0.50, 0.20, 0.30) — slow-heavy
- Maps factor scores to per-asset scores using `FACTOR_ASSET_MAP`
- Inverts scores for VIX and DXY per `INVERTED_ASSETS`
- Persists results to `macro_scores` table with per-horizon factor scores
- Graceful degradation: empty input sets → neutral (50th percentile) → blend → 0.0

### Key Design Decisions
- All weights come from `types.py` constants (no magic numbers)
- `_aggregate_percentile` averages percentile ranks across multiple series in a bucket (e.g., dollar_liquidity has 3 slow series)
- Lazy import of `fetch_scoring_inputs` in `compute()` avoids circular imports
- DB persistence failures are logged but do not crash — `ScoreState` is still returned

## Tests (21 passing)

| Test | What it verifies |
|------|-----------------|
| test_percentile_rank_median | Median value ~50th percentile |
| test_percentile_rank_maximum | Max value = 99th percentile |
| test_percentile_rank_minimum | Min value = 0th percentile |
| test_percentile_rank_insufficient_history | Returns 50.0 when < 30 values |
| test_percentile_rank_window_truncation | Respects window_days parameter |
| test_zscore_positive | Positive z-score for above-mean |
| test_zscore_negative | Negative z-score for below-mean |
| test_zscore_insufficient_history | Returns 0.0 when < 30 values |
| test_zscore_constant_series | Returns 0.0 for zero-variance |
| test_factor_score_in_range | Blended score within [-2, +2] |
| test_factor_score_all_neutral_at_median | Median inputs → near-zero blended |
| test_score_factor_empty_inputs | Empty data → blended = 0.0 |
| test_vix_sign_inversion | VIX score sign inverted from SPY |
| test_dxy_sign_inversion | DXY score sign inverted |
| test_horizon_weight_differentiation | 5d ≠ 21d due to different weights |
| test_full_compute_with_mocked_data_layer | Full pipeline produces valid ScoreState |
| test_missing_data_graceful_degradation | Empty factor → neutral, no crash |
| test_scores_always_clipped | Extreme inputs still within [-2, +2] |
| test_slv_dual_factor | SLV has all three horizons, within range |
| test_compute_fetches_data_when_none | Lazy data fetch works |
| test_all_assets_present | All 7 assets in output |