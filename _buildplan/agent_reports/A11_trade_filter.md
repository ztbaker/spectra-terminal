# Agent A11 — Trade-Ready Filter: Completion Summary

## Status: COMPLETE

## Files Modified

- **Created:** `backend/macro/engine/filter.py` — Full `TradeFilter` class implementation
- **Created:** `backend/macro/engine/tests/test_filter.py` — 37 tests across 11 test classes

## Implementation Details

### Three-Confirmation Framework
- **Confirmation 1 (Score Direction):** `|score_10d| >= 0.75` threshold, returns `(passes, direction)` tuple
- **Confirmation 2 (Catalyst):** Passes unless `aligned_with_score is False`; `None` (neutral) and `True` both pass
- **Confirmation 3 (Vol/Positioning):** Long favors IV rank < 50, short favors IV rank > 50; insufficient history relaxes the check (treats as pass)

### Trade Idea Generation
- 2+ confirmations required; 2 confirmations → `half_size=True`, `LOW` conviction
- 3 confirmations → `HIGH` conviction if regime conviction is HIGH, else `MEDIUM`
- Maximum 5 ideas, sorted by conviction then absolute score magnitude

### VIX Special Rules
- No "long VIX" ideas in `DISINFLATION_RISK_ON` regime
- No "short VIX" ideas in `FLIGHT_TO_QUALITY` regime
- VIX structures use "VIX call" / "VIX put" labels

### Regime Override
- `MIXED_NO_EDGE` regime → empty list (all ideas disqualified)

### Structure Generation
- IV rank < 25: outright (ATM call/put)
- IV rank 25–50: ATM spread for longs, OTM spread for shorts at < 50
- IV rank > 50: OTM spread for longs, ATM spread for shorts
- IV rank > 75: outright (ATM put for shorts)
- Default IV rank (no data): 35 (moderate, triggers spread structures)

### DTE Range Selection
- Dominant 5d (and >= 1.5): DTE 5–10
- Dominant 10d: DTE 7–14
- Dominant 21d: DTE 14–21
- Default: DTE 7–14

### Entry/Invalidation Conditions
- Template-based per asset/direction, referencing macro inputs (not price levels)
- Kept under 80 characters

### IV Rank Context
- Formatted as `"IV Rank {pct}% ({label})"` with cheap/moderate/elevated labels
- Insufficient history → `"IV Rank: insufficient history (< 6mo)"`

## Test Results

```
37 passed in 0.09s
```

All 11 required test categories covered:
1. 3/3 confirmations → HIGH conviction ✓
2. 2/3 confirmations → half_size, LOW conviction ✓
3. 1/3 confirmations → no idea ✓
4. Score threshold (|score| < 0.75) ✓
5. Catalyst opposing fails confirmation ✓
6. IV rank favorable/unfavorable ✓
7. MIXED_NO_EDGE → empty result ✓
8. VIX special rules ✓
9. Max 5 ideas with sorting ✓
10. Structure generation by IV rank ✓
11. DTE range by dominant horizon ✓