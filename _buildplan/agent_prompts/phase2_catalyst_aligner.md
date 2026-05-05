# Agent A10 — Catalyst Aligner

## Objective

Implement the catalyst alignment evaluator that determines, for each of the 7 macro assets, whether upcoming catalysts support or oppose a directional trade. It computes per-asset catalyst density, identifies the next dominant catalyst, and assesses whether that catalyst aligns with the scoring engine's directional bias.

## Pre-flight Reads

1. `backend/macro/models.py` — `CatalystEvent`, `CatalystAlignment`, `AssetCatalystState`
2. `backend/macro/types.py` — `AssetSymbol`, `FACTOR_ASSET_MAP`
3. `backend/macro/data/catalyst.py` — `get_upcoming_catalysts()`, `get_catalyst_density()`
4. `backend/macro/data/market_data.py` — `fetch_atm_straddle_price()` for implied move

## Scope — Files This Agent Owns

- `backend/macro/engine/catalyst_align.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

All other files.

## Interface Contract

```python
# backend/macro/engine/catalyst_align.py

from backend.macro.models import CatalystAlignment, AssetCatalystState, CatalystEvent, ScoreState

class CatalystAligner:
    async def evaluate(self, score_state: ScoreState, days_forward: int = 14) -> CatalystAlignment:
        """
        For each asset, evaluate catalyst alignment with the current directional score.
        Returns per-asset catalyst state including density, next catalyst, alignment flag,
        and ATM straddle implied move.
        """
        ...

    def _assess_alignment(
        self, asset: str, asset_score: float, next_catalyst: CatalystEvent | None
    ) -> bool | None:
        """
        Determine if the next catalyst supports the scored direction.
        Returns True (aligned), False (opposing), or None (neutral/no directional catalyst).
        """
        ...
```

### Models (in models.py, do not modify):
```python
class AssetCatalystState(BaseModel):
    catalyst_density_14d: int
    next_catalyst: CatalystEvent | None
    aligned_with_score: bool | None
    atm_straddle_move_14d: float | None

class CatalystAlignment(BaseModel):
    date: str
    per_asset: dict[str, AssetCatalystState]
```

## Implementation Requirements

### Per-Asset Evaluation

For each of the 7 assets:
1. **Catalyst density:** Count events impacting this asset in the next 14 days (from `macro_catalysts` table).
2. **Next catalyst:** The nearest future event impacting this asset.
3. **Alignment assessment:** Does the next catalyst support the scored direction?
4. **ATM straddle implied move:** The straddle price for the nearest expiry covering the next 14 days (from `fetch_atm_straddle_price`).

### Alignment Assessment Logic

The alignment check answers: "If this catalyst produces a typical outcome, does it help or hurt our directional bias?"

**Catalyst direction heuristics by event type:**

| Event Type | Typical bullish for | Typical bearish for | Neutral/uncertain |
|---|---|---|---|
| FOMC (dovish lean) | SPY, GLD | DXY | VIX (depends) |
| FOMC (hawkish lean) | DXY | SPY, GLD, SLV | — |
| CPI (hot) | GLD, DXY | SPY | WTI mixed |
| CPI (cool) | SPY | DXY, GLD | — |
| NFP (strong) | SPY, DXY | GLD | — |
| NFP (weak) | GLD | SPY, DXY | — |
| EIA (draw) | WTI, BRENT | — | — |
| EIA (build) | — | WTI, BRENT | — |
| OPEC (cut) | WTI, BRENT | — | — |
| EARNINGS | SPY (usually) | — | — |

**Simplified implementation:**
Since we don't have consensus forecasts, use a simpler heuristic:
```python
def _assess_alignment(self, asset, asset_score, next_catalyst):
    if next_catalyst is None:
        return None  # No catalyst = neutral

    # High surprise_weight catalysts with no consensus = uncertain
    if next_catalyst.consensus_value is None and next_catalyst.surprise_weight >= 1.5:
        return None  # Can't assess direction without consensus

    # For most catalysts without directional info: return None (neutral)
    # The trade filter will treat None as "no opposing catalyst" which is still 
    # a partial pass for the catalyst confirmation.
    
    # Known directional catalysts:
    event = next_catalyst.event_type
    
    # FOMC: use FedWatch implied direction (if available, passed via score_state context)
    # For now, default to None (uncertain) for FOMC
    if event == "FOMC":
        return None
    
    # EIA: typically supports long oil if historical draws dominate
    if event == "EIA" and asset in ("WTI", "BRENT"):
        # If our score is long (positive), EIA is neutral-to-supportive
        # If our score is short (negative), EIA is a risk (could draw)
        return asset_score > 0  # aligned if we're long (draws help)
    
    # For other catalysts: high surprise_weight = uncertainty
    if next_catalyst.surprise_weight >= 1.5:
        return None
    
    return None  # Default: can't assess, treated as neutral
```

**The key insight:** The alignment assessment is conservative. `None` means "we can't tell if this helps or hurts." Only return `True` (clearly aligned) or `False` (clearly opposing) when the logic is confident. The trade filter treats `None` as "not opposing" (partial pass) vs `True` (full pass) vs `False` (fail).

### ATM Straddle Integration

Call `fetch_atm_straddle_price(asset, dte_target=14)` to get the implied move percentage for the next 14 days. This tells us "how much does the market already expect this asset to move?"

- If straddle pricing is unavailable for an asset (e.g., DXY has no liquid options in yfinance), set `atm_straddle_move_14d = None`.
- Available for: SPY, GLD, SLV, WTI (CL=F options via yfinance)
- Not available for: VIX (special), DXY, BRENT (limited yfinance options)

### Caching

- The full `CatalystAlignment` result is ephemeral (not cached) — it's recomputed on each dashboard refresh since it depends on score_state which changes.
- The underlying straddle prices are cached by agent A3's market_data module (300s TTL).

### Error Handling

- If `get_upcoming_catalysts()` returns empty: all assets get density=0, next_catalyst=None, aligned=None.
- If `fetch_atm_straddle_price()` fails for an asset: set `atm_straddle_move_14d = None`.
- Never crash. Always return a valid `CatalystAlignment` even if all data is missing.

## Test Requirements

Create `backend/macro/engine/tests/test_catalyst_align.py`:
1. Test with synthetic catalysts: verify density count per asset.
2. Test next-catalyst selection (should be chronologically nearest).
3. Test alignment logic for EIA + long WTI (should return True).
4. Test alignment logic for EIA + short WTI (should return False).
5. Test FOMC returns None (uncertain).
6. Test with no catalysts: all assets get neutral state.
7. Test with straddle data available for some assets but not others.
8. Test the full `evaluate()` pipeline with mocked dependencies.

Run: `cd backend && python -m pytest macro/engine/tests/test_catalyst_align.py -v`

## Hard Constraints

- No new pip dependencies.
- Do not modify models.py, types.py, or data layer files.
- Do not call external APIs directly — use the data layer functions.
- Alignment logic must be conservative (prefer None over guessing).

## Done Criteria

- [ ] `evaluate()` returns valid `CatalystAlignment` with entries for all 7 assets
- [ ] Catalyst density correctly counted per asset
- [ ] Next catalyst correctly identified (nearest by date)
- [ ] Alignment assessment returns True/False/None appropriately
- [ ] ATM straddle data integrated where available
- [ ] Handles empty data gracefully
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A10_catalyst_aligner.md`
