"""Quantitative + Econometrics analytics.

CAPM regression, OLS, cointegration, Fama-French factor exposures,
summary statistics, unit root tests. Pure numpy/pandas/statsmodels implementations.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def summary_stats(returns: pd.Series) -> dict[str, float | None]:
    """Compute summary statistics for a return series."""
    if returns.empty or returns.std() == 0:
        return {
            "mean": None, "std": None, "skew": None, "kurtosis": None,
            "sharpe": None, "max_drawdown": None, "var_95": None,
        }

    mean = float(returns.mean())
    std = float(returns.std())
    n = len(returns)

    skew = float(((returns - mean) ** 3).mean() / (std ** 3)) if std > 0 else None
    kurt = float(((returns - mean) ** 4).mean() / (std ** 4) - 3) if std > 0 else None

    cumulative = (1 + returns).cumprod()
    running_max = cumulative.cummax()
    drawdown = cumulative / running_max - 1
    max_dd = float(drawdown.min())

    var_95 = float(returns.quantile(0.05)) if n >= 20 else None

    return {
        "mean": round(mean, 6),
        "std": round(std, 6),
        "skew": round(skew, 4) if skew is not None else None,
        "kurtosis": round(kurt, 4) if kurt is not None else None,
        "sharpe": round(mean / std * np.sqrt(252), 4) if std > 0 else None,
        "max_drawdown": round(max_dd, 4),
        "var_95": round(var_95, 6) if var_95 is not None else None,
    }


def capm_regression(
    asset_returns: pd.Series,
    market_returns: pd.Series,
    risk_free: float = 0.0,
) -> dict[str, float | None]:
    """Run CAPM regression: R_i - R_f = alpha + beta * (R_m - R_f) + epsilon."""
    excess_asset = asset_returns - risk_free / 252
    excess_market = market_returns - risk_free / 252

    aligned = pd.concat([excess_asset, excess_market], axis=1).dropna()
    if len(aligned) < 10:
        return {"alpha": None, "beta": None, "r_squared": None, "residual_std": None}

    y = aligned.iloc[:, 0].values
    x = aligned.iloc[:, 1].values

    X = np.column_stack([np.ones(len(x)), x])
    try:
        beta_vec = np.linalg.lstsq(X, y, rcond=None)[0]
    except np.linalg.LinAlgError:
        return {"alpha": None, "beta": None, "r_squared": None, "residual_std": None}

    alpha = float(beta_vec[0])
    beta = float(beta_vec[1])

    y_hat = X @ beta_vec
    residuals = y - y_hat
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else None
    residual_std = float(np.std(residuals))

    return {
        "alpha": round(alpha, 6),
        "beta": round(beta, 4),
        "r_squared": round(r_squared, 4) if r_squared is not None else None,
        "residual_std": round(residual_std, 6),
    }


def ols_regression(y: pd.Series, x: pd.DataFrame) -> dict[str, Any]:
    """Run OLS regression: y = X @ beta + epsilon."""
    aligned = pd.concat([y, x], axis=1).dropna()
    if len(aligned) < x.shape[1] + 2:
        return {"coefficients": [], "r_squared": None, "residual_std": None, "n": len(aligned)}

    y_vals = aligned.iloc[:, 0].values
    x_vals = aligned.iloc[:, 1:].values

    X = np.column_stack([np.ones(len(x_vals)), x_vals])
    try:
        beta_vec = np.linalg.lstsq(X, y_vals, rcond=None)[0]
    except np.linalg.LinAlgError:
        return {"coefficients": [], "r_squared": None, "residual_std": None, "n": len(aligned)}

    y_hat = X @ beta_vec
    residuals = y_vals - y_hat
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((y_vals - np.mean(y_vals)) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else None

    return {
        "coefficients": [round(float(b), 6) for b in beta_vec],
        "r_squared": round(r_squared, 4) if r_squared is not None else None,
        "residual_std": round(float(np.std(residuals)), 6),
        "n": len(aligned),
    }


def cointegration_test(y: pd.Series, x: pd.Series) -> dict[str, float | None]:
    """Engle-Granger cointegration test.

    Regresses y on x, then tests the residuals for a unit root (ADF).
    """
    try:
        from statsmodels.tsa.stattools import adfuller
    except ImportError:
        logger.warning("statsmodels not available — cointegration test unavailable")
        return {"cointegrated": None, "adf_stat": None, "p_value": None, "hedge_ratio": None}

    aligned = pd.concat([y, x], axis=1).dropna()
    if len(aligned) < 30:
        return {"cointegrated": None, "adf_stat": None, "p_value": None, "hedge_ratio": None}

    y_vals = aligned.iloc[:, 0].values
    x_vals = aligned.iloc[:, 1].values

    X = np.column_stack([np.ones(len(x_vals)), x_vals])
    try:
        beta = np.linalg.lstsq(X, y_vals, rcond=None)[0]
    except np.linalg.LinAlgError:
        return {"cointegrated": None, "adf_stat": None, "p_value": None, "hedge_ratio": None}

    residuals = y_vals - X @ beta
    adf_result = adfuller(residuals, maxlag=1)

    adf_stat = float(adf_result[0])
    p_value = float(adf_result[1])
    hedge_ratio = float(beta[1])

    return {
        "cointegrated": p_value < 0.05,
        "adf_stat": round(adf_stat, 4),
        "p_value": round(p_value, 4),
        "hedge_ratio": round(hedge_ratio, 4),
    }


def granger_causality(y: pd.Series, x: pd.Series, maxlag: int = 5) -> dict[str, Any]:
    """Granger causality test: does x Granger-cause y?"""
    try:
        from statsmodels.tsa.stattools import grangercausalitytests
    except ImportError:
        return {"granger_causes": None, "p_values": {}, "error": "statsmodels not available"}

    aligned = pd.concat([y, x], axis=1).dropna()
    if len(aligned) < maxlag + 5:
        return {"granger_causes": None, "p_values": {}, "error": "insufficient data"}

    try:
        result = grangercausalitytests(aligned, maxlag=maxlag, verbose=False)
        p_values = {}
        for lag in range(1, maxlag + 1):
            if lag in result:
                ssr_ftest = result[lag][0].get("ssr_ftest", (None, None))
                p_val = ssr_ftest[1] if len(ssr_ftest) > 1 else None
                p_values[str(lag)] = round(float(p_val), 4) if p_val is not None else None

        min_p = min(v for v in p_values.values() if v is not None) if p_values else None
        return {
            "granger_causes": min_p < 0.05 if min_p is not None else None,
            "p_values": p_values,
        }
    except Exception as exc:
        return {"granger_causes": None, "p_values": {}, "error": str(exc)}


def fama_french_exposures(
    portfolio_returns: pd.Series,
    factor_data: pd.DataFrame,
) -> dict[str, float | None]:
    """Compute Fama-French factor exposures via OLS regression.

    factor_data should have columns: 'Mkt-RF', 'SMB', 'HML', 'RF' (at minimum).
    """
    required = {"Mkt-RF", "SMB", "HML"}
    if not required.issubset(factor_data.columns):
        return {"alpha": None, "mkt_beta": None, "smb_beta": None, "hml_beta": None}

    try:
        rf = factor_data["RF"] if "RF" in factor_data.columns else 0
        excess_portfolio = portfolio_returns - rf
        aligned = pd.concat([excess_portfolio, factor_data[["Mkt-RF", "SMB", "HML"]]], axis=1).dropna()

        if len(aligned) < 20:
            return {"alpha": None, "mkt_beta": None, "smb_beta": None, "hml_beta": None}

        y = aligned.iloc[:, 0].values
        X = np.column_stack([
            np.ones(len(aligned)),
            aligned["Mkt-RF"].values,
            aligned["SMB"].values,
            aligned["HML"].values,
        ])

        beta = np.linalg.lstsq(X, y, rcond=None)[0]

        return {
            "alpha": round(float(beta[0]), 6),
            "mkt_beta": round(float(beta[1]), 4),
            "smb_beta": round(float(beta[2]), 4),
            "hml_beta": round(float(beta[3]), 4),
        }
    except Exception:
        return {"alpha": None, "mkt_beta": None, "smb_beta": None, "hml_beta": None}


def rolling_volatility(returns: pd.Series, window: int = 21) -> pd.Series:
    """Annualized rolling volatility."""
    return returns.rolling(window).std() * np.sqrt(252)


def max_drawdown(returns: pd.Series) -> float:
    """Calculate maximum drawdown from a return series."""
    cumulative = (1 + returns).cumprod()
    running_max = cumulative.cummax()
    drawdown = cumulative / running_max - 1
    return float(drawdown.min())