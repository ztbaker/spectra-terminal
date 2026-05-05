# Agent A11 — Trade-Ready Filter

## Objective

Implement the trade-ready filter that evaluates whether a trade idea qualifies for surfacing. A trade is only shown when 3 independent confirmations are present: (1) macro/regime score supports direction, (2) next catalyst is aligned or neutral, (3) vol/positioning is favorable. When only 2 confirmations pass, the idea is flagged as half-size. The filter also generates the specific option structure, entry condition, and invalidation condition for each qualifying idea.

## Pre-flight Reads

1. `backend/macro/models.py` — `TradeIdea`, `ScoreState`, `RegimeReading`, `CatalystAlignment`, `AssetCatalystState`, `IVRankData`
2. `backend/macro/types.py` — `AssetSymbol`, `Conviction`, `FACTOR_ASSET_MAP`
3. `backend/macro/engine/scoring.py` — understand `ScoreState` structure
4. `backend/macro/engine/regime.py` — understand `RegimeReading` structure
5. `backend/macro/engine/catalyst_align.py` — understand `CatalystAlignment` structure
6. `backend/macro/data/iv_logger.py` — understand `IVRankData` shape

## Scope — Files This Agent Owns

- `backend/macro/engine/filter.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

All other files.

## Interface Contract

```python
# backend/macro/engine/filter.py

from backend.macro.models import (
    TradeIdea, ScoreState, RegimeReading, CatalystAlignment, IVRankData
)

class TradeFilter:
    def filter(
        self,
        score_state: ScoreState,
        regime: RegimeReading,
        catalyst_alignment: CatalystAlignment,
        iv_ranks: dict[str, IVRankData],
    ) -> list[TradeIdea]:
        """
        Evaluate all 7 assets and return 0-5 qualifying trade ideas.
        Each idea requires at least 2 of 3 confirmations.
        Returns sorted by conviction (high first), max 5 ideas.
        """
        ...

    def _check_score_confirmation(self, asset: str, score_state: ScoreState) -> tuple[bool, str]:
        """Check if macro score supports a directional trade. Returns (passes, direction)."""
        ...

    def _check_catalyst_confirmation(self, asset: str, alignment: CatalystAlignment) -> bool:
        """Check if catalyst state is aligned or neutral (not opposing)."""
        ...

    def _check_vol_confirmation(self, asset: str, direction: str, iv_rank: IVRankData | None) -> bool:
        """Check if IV rank is favorable for the implied option structure."""
        ...

    def _generate_structure(self, asset: str, direction: str, iv_rank: IVRankData | None) -> str:
        """Select appropriate option structure based on IV environment."""
        ...

    def _generate_entry_condition(self, asset: str, direction: str, score_state: ScoreState) -> str:
        """Generate a human-readable entry condition."""
        ...

    def _generate_invalidation(self, asset: str, direction: str, score_state: ScoreState) -> str:
        """Generate invalidation conditions (the real stops, not price-based)."""
        ...
```

## Implementation Requirements

### Three-Confirmation Framework

For each asset, evaluate three independent tests:

**Confirmation 1 — Score Direction:**
```python
def _check_score_confirmation(self, asset, score_state):
    scores = score_state.asset_scores.get(asset, {})
    # Use the 10d horizon as the primary signal
    score_10d = scores.get("horizon_10d", 0)
    
    # Threshold: |score| >= 0.75 to be tradeable
    if abs(score_10d) < 0.75:
        return (False, "neutral")
    
    direction = "long" if score_10d > 0 else "short"
    return (True, direction)
```

**Confirmation 2 — Catalyst:**
```python
def _check_catalyst_confirmation(self, asset, alignment):
    state = alignment.per_asset.get(asset)
    if state is None:
        return True  # No data = no opposing catalyst = pass
    
    # Fail only if alignment is explicitly False (catalyst opposes)
    if state.aligned_with_score is False:
        return False
    
    return True  # None (neutral) or True (aligned) both pass
```

**Confirmation 3 — Vol/Positioning:**
```python
def _check_vol_confirmation(self, asset, direction, iv_rank):
    if iv_rank is None or not iv_rank.sufficient_history:
        return True  # Insufficient data = don't penalize (relaxed requirement)
    
    rank = iv_rank.rank_pct
    if rank is None:
        return True
    
    # For long options (buying): IV rank < 50 is favorable (cheap vol)
    # For short options/spreads (selling): IV rank > 50 is favorable
    if direction == "long":
        return rank < 50
    else:  # "short"
        return rank > 50
```

### Confirmation Count → Trade Idea Generation

```python
confirmations = sum([
    score_passes,
    catalyst_passes,
    vol_passes,
])

if confirmations >= 2:
    idea = TradeIdea(
        asset=asset,
        direction=...,
        dte_range=...,
        structure=...,
        entry_condition=...,
        invalidation=...,
        conviction=...,
        iv_rank_context=...,
        confirmations=confirmations,
        half_size=(confirmations == 2),
    )
```

### DTE Range Selection

Based on the design spec (1-3 week DTE):
- Score 5d is dominant AND high conviction: DTE 5-10
- Score 10d is dominant: DTE 7-14
- Score 21d is dominant: DTE 14-21
- Default: DTE 7-14

"Dominant" = the horizon with the highest absolute score.

### Structure Generation

Select option structure based on IV environment:
```python
def _generate_structure(self, asset, direction, iv_rank):
    rank = iv_rank.rank_pct if iv_rank and iv_rank.rank_pct else 50
    
    if direction == "long":
        if rank < 25:
            return "ATM call"  # Very cheap vol — buy outright
        elif rank < 50:
            return "ATM call spread"  # Moderately cheap — spread to reduce cost
        else:
            return "OTM call spread"  # Expensive vol — define risk tightly
    else:  # short
        if rank > 75:
            return "ATM put"  # Very expensive vol — buy puts (vol is on your side for speed)
        elif rank > 50:
            return "ATM put spread"
        else:
            return "OTM put spread"
```

For VIX specifically: VIX options are calls for "long VIX" (fear trade) and puts for "short VIX" (complacency trade). Adjust labels.

### Entry Condition Generation

Generate human-readable entry conditions based on the scoring inputs:
```python
def _generate_entry_condition(self, asset, direction, score_state):
    # Examples of generated conditions:
    # "Enter on SPY close above 5d SMA with HY-IG spread stable/narrowing"
    # "Enter on GLD holding above $2300 with real rates declining"
    # "Enter on WTI close above $72 with EIA draw confirmed"
    
    # Template-based generation using factor states
    asset_factors = _get_dominant_factors(asset)
    ...
```

Keep these concise (under 80 characters). Use templates per asset/factor combination.

### Invalidation Condition Generation

These are the **real stops** — not price-based option stops:
```python
def _generate_invalidation(self, asset, direction, score_state):
    # Examples:
    # "DXY closes above 104.5 (dollar strength negates gold thesis)"
    # "HY-IG widens >10bp from entry (risk-off invalidates long SPY)"
    # "10Y TIPS yield breaks above 2.5% (real rates too high for gold)"
    
    # Template-based: identify the key input that would invalidate the thesis
    ...
```

### Conviction Mapping

```python
if confirmations == 3 and regime.conviction == Conviction.HIGH:
    conviction = Conviction.HIGH
elif confirmations == 3:
    conviction = Conviction.MEDIUM
else:  # confirmations == 2
    conviction = Conviction.LOW
```

### IV Rank Context String

```python
iv_context = f"IV Rank {iv_rank.rank_pct:.0f}% ({'cheap' if iv_rank.rank_pct < 30 else 'moderate' if iv_rank.rank_pct < 70 else 'elevated'})"
```

### Output Constraints

- Maximum 5 trade ideas returned
- Sorted by conviction (HIGH first), then by absolute score magnitude
- If more than 5 qualify, take the top 5
- If 0 qualify: return empty list (frontend shows "Stand down" message)

### Special Cases

- **VIX:** Never generate "long VIX" ideas when regime is DISINFLATION_RISK_ON. Never generate "short VIX" when regime is FLIGHT_TO_QUALITY.
- **Regime = MIXED_NO_EDGE:** Automatically disqualify all ideas (regime confirmation fails). Return empty list with a note.
- **IV rank insufficient history:** Relax the vol confirmation (treat as True) but set `iv_rank_context = "IV Rank: insufficient history (< 6mo)"`

## Test Requirements

Create `backend/macro/engine/tests/test_filter.py`:
1. Test 3/3 confirmations → HIGH conviction idea generated.
2. Test 2/3 confirmations → half_size = True, LOW conviction.
3. Test 1/3 confirmations → no idea generated.
4. Test score threshold: |score| < 0.75 fails Confirmation 1.
5. Test catalyst opposing → fails Confirmation 2.
6. Test IV rank favorable/unfavorable.
7. Test MIXED_NO_EDGE regime → empty result.
8. Test VIX special rules.
9. Test max 5 ideas limit with sorting.
10. Test structure generation varies by IV rank.
11. Test DTE range selection by dominant horizon.

Run: `cd backend && python -m pytest macro/engine/tests/test_filter.py -v`

## Hard Constraints

- No new pip dependencies.
- Do not modify models.py, types.py, or other engine files.
- Never suggest specific strike prices (we don't have real-time option chains at this layer).
- Entry/invalidation conditions must reference macro inputs, not price levels.
- Do not hardcode ticker prices — use relative references ("above 5d SMA", "spread widens >10bp").

## Done Criteria

- [ ] `filter()` returns valid `list[TradeIdea]` with 0-5 entries
- [ ] Three-confirmation logic correctly implemented
- [ ] Half-size flagging works (2 confirmations)
- [ ] DTE ranges appropriate for 1-3 week options
- [ ] Structure varies by IV environment
- [ ] Entry conditions are specific and concise
- [ ] Invalidation conditions reference macro inputs (not price stops)
- [ ] VIX special cases handled
- [ ] MIXED_NO_EDGE produces empty result
- [ ] Max 5 ideas, sorted by conviction
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A11_trade_filter.md`
