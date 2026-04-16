"""Black-Scholes options pricing with full Greeks.

Standard Black-Scholes formulas reimplemented from public mathematical references.
No code copied from OpenBB or any other GPL/AGPL source.
"""

import math
from typing import Any


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def _d1(S: float, K: float, T: float, r: float, sigma: float) -> float:
    return (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))


def _d2(S: float, K: float, T: float, r: float, sigma: float) -> float:
    return _d1(S, K, T, r, sigma) - sigma * math.sqrt(T)


def bs_price(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1 = _d1(S, K, T, r, sigma)
        d2 = _d2(S, K, T, r, sigma)
        if option_type == "call":
            return S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
        else:
            return K * math.exp(-r * T) * _norm_cdf(-d2) - S * _norm_cdf(-d1)
    except (ValueError, ZeroDivisionError):
        return None


def delta(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1_val = _d1(S, K, T, r, sigma)
        if option_type == "call":
            return _norm_cdf(d1_val)
        else:
            return _norm_cdf(d1_val) - 1.0
    except (ValueError, ZeroDivisionError):
        return None


def gamma(S: float, K: float, T: float, r: float, sigma: float) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1_val = _d1(S, K, T, r, sigma)
        return _norm_pdf(d1_val) / (S * sigma * math.sqrt(T))
    except (ValueError, ZeroDivisionError):
        return None


def theta(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1_val = _d1(S, K, T, r, sigma)
        d2_val = _d2(S, K, T, r, sigma)
        term1 = -S * _norm_pdf(d1_val) * sigma / (2 * math.sqrt(T))
        if option_type == "call":
            term2 = -r * K * math.exp(-r * T) * _norm_cdf(d2_val)
        else:
            term2 = r * K * math.exp(-r * T) * _norm_cdf(-d2_val)
        return (term1 + term2) / 365.0
    except (ValueError, ZeroDivisionError):
        return None


def vega(S: float, K: float, T: float, r: float, sigma: float) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1_val = _d1(S, K, T, r, sigma)
        return S * _norm_pdf(d1_val) * math.sqrt(T) / 100.0
    except (ValueError, ZeroDivisionError):
        return None


def rho(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d2_val = _d2(S, K, T, r, sigma)
        if option_type == "call":
            return K * T * math.exp(-r * T) * _norm_cdf(d2_val) / 100.0
        else:
            return -K * T * math.exp(-r * T) * _norm_cdf(-d2_val) / 100.0
    except (ValueError, ZeroDivisionError):
        return None


def charm(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float | None:
    """Delta decay (charm) — rate of change of delta over time."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1_val = _d1(S, K, T, r, sigma)
        d2_val = _d2(S, K, T, r, sigma)
        term = -_norm_pdf(d1_val) * (2 * r * T - d2_val * sigma * math.sqrt(T)) / (2 * T * sigma * math.sqrt(T))
        if option_type == "call":
            return (term - r * K * math.exp(-r * T) * _norm_cdf(d2_val)) / 365.0
        else:
            return (term + r * K * math.exp(-r * T) * _norm_cdf(-d2_val)) / 365.0
    except (ValueError, ZeroDivisionError):
        return None


def vanna(S: float, K: float, T: float, r: float, sigma: float) -> float | None:
    """Vanna — sensitivity of delta to volatility, or dVega/dSpot."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    try:
        d1_val = _d1(S, K, T, r, sigma)
        d2_val = _d2(S, K, T, r, sigma)
        return -_norm_pdf(d1_val) * d2_val / sigma
    except (ValueError, ZeroDivisionError):
        return None


def all_greeks(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> dict[str, float | None]:
    return {
        "delta": delta(S, K, T, r, sigma, option_type),
        "gamma": gamma(S, K, T, r, sigma),
        "theta": theta(S, K, T, r, sigma, option_type),
        "vega": vega(S, K, T, r, sigma),
        "rho": rho(S, K, T, r, sigma, option_type),
        "charm": charm(S, K, T, r, sigma, option_type),
        "vanna": vanna(S, K, T, r, sigma),
    }


def compute_iv_surface(
    chains: list[dict],
    spot: float,
    risk_free: float,
) -> dict[str, Any]:
    """Build IV surface data from options chains for 3D plotting.

    Returns {expiries: [str], strikes: [float], iv: [[float|None]]}.
    """
    if not chains:
        return {"expiries": [], "strikes": [], "iv": []}

    by_expiry: dict[str, dict[float, float | None]] = {}
    all_strikes: set[float] = set()

    for contract in chains:
        expiry = contract.get("expiration", "")
        strike = contract.get("strike")
        iv = contract.get("implied_volatility")
        if not expiry or strike is None:
            continue
        by_expiry.setdefault(expiry, {})
        if iv is not None:
            by_expiry[expiry][float(strike)] = float(iv)
        all_strikes.add(float(strike))

    strikes = sorted(all_strikes)
    expiries = sorted(by_expiry.keys())

    iv_grid = []
    for exp in expiries:
        row = []
        for strike in strikes:
            row.append(by_expiry.get(exp, {}).get(strike, None))
        iv_grid.append(row)

    return {"expiries": expiries, "strikes": strikes, "iv": iv_grid}


def compute_term_structure(chains: list[dict], spot: float) -> list[dict]:
    """Compute ATM IV per expiry for term structure chart.

    Returns [{expiry: str, atm_iv: float|None}].
    """
    by_expiry: dict[str, list[dict]] = {}
    for contract in chains:
        expiry = contract.get("expiration", "")
        if expiry:
            by_expiry.setdefault(expiry, []).append(contract)

    result = []
    for expiry in sorted(by_expiry.keys()):
        contracts = by_expiry[expiry]
        atm_candidates = sorted(
            [c for c in contracts if c.get("implied_volatility") is not None],
            key=lambda c: abs((c.get("strike") or 0) - spot),
        )
        atm_iv = atm_candidates[0]["implied_volatility"] if atm_candidates else None
        result.append({"expiry": expiry, "atm_iv": atm_iv})

    return result