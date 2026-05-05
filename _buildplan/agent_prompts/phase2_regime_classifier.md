# Agent A9 — Regime Classifier

## Objective

Implement the meta-regime classifier that maps cross-asset signal coherence to one of 5 named states: Disinflation/Risk-On, Stagflation/Defensive, Flight-to-Quality, Reflation, or Mixed/No-Edge. It tracks regime age (days since last transition), conviction level, and flags recent shifts.

## Pre-flight Reads

1. `backend/macro/models.py` — `ScoreState`, `FactorScore`, `RegimeReading`
2. `backend/macro/types.py` — `RegimeName`, `FactorName`, `Conviction`
3. `backend/macro/engine/scoring.py` — understand the `ScoreState` shape
4. `backend/database.py` — `get_conn()` for regime history persistence

## Scope — Files This Agent Owns

- `backend/macro/engine/regime.py` — **create/fill**

## Scope — Files This Agent Must NOT Touch

All other files.

## Interface Contract

```python
# backend/macro/engine/regime.py

from backend.macro.models import ScoreState, RegimeReading
from backend.macro.types import RegimeName, Conviction

class RegimeClassifier:
    def classify(self, score_state: ScoreState) -> RegimeReading:
        """
        Classify the current macro regime from factor scores.
        Persists to macro_regime_history. Tracks transitions.
        """
        ...

    def _determine_regime(self, score_state: ScoreState) -> RegimeName:
        """Map factor score pattern to a named regime."""
        ...

    def _compute_conviction(self, score_state: ScoreState, regime: RegimeName) -> Conviction:
        """Determine conviction based on factor coherence."""
        ...

    def _get_regime_age(self, current_regime: RegimeName) -> int:
        """Count days since last regime transition."""
        ...

    def _check_recent_shift(self) -> bool:
        """True if regime changed within last 5 trading days."""
        ...
```

## Implementation Requirements

### Regime Classification Rules

The regime is determined by the dominant signal pattern across all 4 factors:

| Regime | real_rate | risk_appetite | dollar_liquidity | growth_inflation |
|--------|-----------|---------------|------------------|------------------|
| DISINFLATION_RISK_ON | negative (falling rates) | positive | positive | neutral/positive |
| STAGFLATION_DEFENSIVE | positive (rising rates) | negative | negative | negative |
| FLIGHT_TO_QUALITY | negative | negative | mixed | negative |
| REFLATION | positive (rising rates) | positive | positive | positive |
| MIXED_NO_EDGE | — | — | — | — |

**Classification algorithm:**
```python
def _determine_regime(self, score_state):
    # Extract factor blended scores
    scores = {f.factor: f.blended for f in score_state.factors}

    rr = scores.get(FactorName.REAL_RATE, 0)
    ra = scores.get(FactorName.RISK_APPETITE, 0)
    dl = scores.get(FactorName.DOLLAR_LIQUIDITY, 0)
    gi = scores.get(FactorName.GROWTH_INFLATION, 0)

    # Threshold for "significant" signal: |score| >= 0.5
    T = 0.5

    if rr < -T and ra > T and dl > T:
        return RegimeName.DISINFLATION_RISK_ON
    elif rr > T and ra < -T and gi < -T:
        return RegimeName.STAGFLATION_DEFENSIVE
    elif ra < -T and gi < -T and rr < -T:
        return RegimeName.FLIGHT_TO_QUALITY
    elif rr > T and ra > T and gi > T:
        return RegimeName.REFLATION
    else:
        return RegimeName.MIXED_NO_EDGE
```

Note: These rules intentionally overlap slightly. The classifier should check in priority order (most specific first). If multiple match, take the one with highest average absolute score across matching factors.

### Conviction Computation

Conviction measures how coherent the factor signals are:

```python
def _compute_conviction(self, score_state, regime):
    factor_scores = [abs(f.blended) for f in score_state.factors]
    avg_strength = sum(factor_scores) / len(factor_scores)
    
    # Coherence: do all factors agree in direction?
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
```

### Regime Age Tracking

- Query `macro_regime_history` for the most recent entry
- If the regime matches today's classification: `age = (today - last_transition_date).days`
- If the regime is DIFFERENT: this is a new transition, age = 0, store new entry

### Recently Shifted Flag

- `recently_shifted = True` if there exists a regime change in `macro_regime_history` within the last 5 business days
- Business days: exclude weekends (simplified — don't account for market holidays)

### Coherence Score

A 0-1 float measuring how aligned the factor signals are:
```python
coherence = 1.0 - (std_dev_of_factor_scores / 2.0)  # clipped to [0, 1]
```
Where `std_dev_of_factor_scores` is the standard deviation of the 4 blended factor scores. When all scores are identical (perfect alignment), coherence = 1.0. When they're scattered, coherence approaches 0.

### Persistence

On each `classify()` call:
1. Determine today's regime
2. Check if it differs from yesterday's regime in DB
3. If different: insert new row with age_days=0
4. If same: update existing row's age_days
5. Always return the RegimeReading with current state

```python
with get_conn() as conn:
    conn.execute("""
        INSERT OR REPLACE INTO macro_regime_history
        (date, regime_name, conviction, age_days, score_coherence)
        VALUES (?, ?, ?, ?, ?)
    """, (today, regime.value, conviction.value, age, coherence))
```

### Edge Cases

- First run (no history): regime = MIXED_NO_EDGE, age = 0, conviction = LOW, recently_shifted = False
- All factor scores = 0: regime = MIXED_NO_EDGE, coherence = 1.0 (all neutral = "aligned in neutrality")
- ScoreState with missing factors: treat missing as 0.0

## Test Requirements

Create `backend/macro/engine/tests/test_regime.py`:
1. Test each regime classification with synthetic factor scores that clearly match.
2. Test MIXED_NO_EDGE when scores are conflicting.
3. Test priority resolution when multiple regimes could match.
4. Test conviction: HIGH when strong coherent signals.
5. Test conviction: LOW for MIXED_NO_EDGE.
6. Test age tracking: same regime → incrementing age.
7. Test transition detection: different regime → age resets to 0.
8. Test recently_shifted: true when transition within 5 business days.
9. Test coherence_score calculation.
10. Test first-run behavior (empty DB).

Run: `cd backend && python -m pytest macro/engine/tests/test_regime.py -v`

## Hard Constraints

- No new pip dependencies.
- Do not modify models.py, types.py, or other engine files.
- Regime names must exactly match the `RegimeName` enum values.
- Classification must be deterministic (same inputs always produce same regime).

## Done Criteria

- [ ] `classify()` returns valid `RegimeReading` for all input patterns
- [ ] All 5 regimes reachable through appropriate factor score combinations
- [ ] Conviction HIGH/MEDIUM/LOW assigned correctly
- [ ] Regime age tracks correctly across days
- [ ] Recently-shifted flag activates on transitions
- [ ] Coherence score in [0, 1] range
- [ ] Results persisted to macro_regime_history
- [ ] First-run (empty DB) handled gracefully
- [ ] All tests pass
- [ ] Summary written to reporting location

## Reporting Location

Write completion summary to: `_buildplan/agent_reports/A9_regime_classifier.md`
