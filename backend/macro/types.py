"""MACRO subsystem — enums, constants, factor weights, asset mappings."""

from enum import Enum


class RegimeName(str, Enum):
    DISINFLATION_RISK_ON = "disinflation_risk_on"
    STAGFLATION_DEFENSIVE = "stagflation_defensive"
    FLIGHT_TO_QUALITY = "flight_to_quality"
    REFLATION = "reflation"
    MIXED_NO_EDGE = "mixed_no_edge"


class FactorName(str, Enum):
    REAL_RATE = "real_rate"
    RISK_APPETITE = "risk_appetite"
    DOLLAR_LIQUIDITY = "dollar_liquidity"
    GROWTH_INFLATION = "growth_inflation"


class AssetSymbol(str, Enum):
    SPY = "SPY"
    VIX = "VIX"
    GLD = "GLD"
    SLV = "SLV"
    DXY = "DXY"
    WTI = "WTI"
    BRENT = "BRENT"


class Conviction(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


ASSETS = list(AssetSymbol)

FACTOR_ASSET_MAP: dict[FactorName, list[AssetSymbol]] = {
    FactorName.REAL_RATE: [AssetSymbol.GLD, AssetSymbol.SLV],
    FactorName.RISK_APPETITE: [AssetSymbol.SPY, AssetSymbol.VIX],
    FactorName.DOLLAR_LIQUIDITY: [AssetSymbol.DXY, AssetSymbol.GLD],
    FactorName.GROWTH_INFLATION: [AssetSymbol.WTI, AssetSymbol.BRENT, AssetSymbol.SLV],
}

# Scoring weights: (slow, fast, positioning) — must sum to 1.0
FACTOR_WEIGHTS: dict[FactorName, tuple[float, float, float]] = {
    FactorName.REAL_RATE: (0.40, 0.35, 0.25),
    FactorName.RISK_APPETITE: (0.30, 0.40, 0.30),
    FactorName.DOLLAR_LIQUIDITY: (0.45, 0.30, 0.25),
    FactorName.GROWTH_INFLATION: (0.35, 0.35, 0.30),
}

# Horizon-specific weight overrides: (slow, fast, positioning)
HORIZON_WEIGHTS: dict[str, tuple[float, float, float]] = {
    "5d": (0.30, 0.60, 0.10),
    "10d": (0.40, 0.40, 0.20),
    "21d": (0.50, 0.20, 0.30),
}

# yfinance ticker mapping for the 7 macro assets
YFINANCE_TICKERS: dict[str, str] = {
    "SPY": "SPY",
    "VIX": "^VIX",
    "GLD": "GLD",
    "SLV": "SLV",
    "DXY": "DX-Y.NYB",
    "WTI": "CL=F",
    "BRENT": "BZ=F",
}

# FRED series IDs for each factor's inputs
FRED_SERIES: dict[FactorName, dict[str, list[str]]] = {
    FactorName.REAL_RATE: {
        "slow": ["DFII10"],           # 10Y TIPS real yield
        "fast": ["T5YIFR"],           # 5Y5Y forward inflation
    },
    FactorName.RISK_APPETITE: {
        "slow": ["BAMLH0A0HYM2"],     # ICE BofA HY OAS
    },
    FactorName.DOLLAR_LIQUIDITY: {
        "slow": ["WALCL", "WTREGEN", "RRPONTSYD"],  # Fed assets, TGA, RRP
        "fast": ["DGS2"],             # 2Y Treasury
    },
    FactorName.GROWTH_INFLATION: {
        "slow": ["MANEMP"],           # ISM Manufacturing Employment
        "fast": ["T10Y2Y"],           # 10Y-2Y spread (proxy for 5s30s)
    },
}

# Assets where score direction is INVERTED from factor direction
INVERTED_ASSETS: set[str] = {"VIX", "DXY"}
