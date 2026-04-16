"""Analytics router — quantitative, econometrics, and technical analysis endpoints."""

import asyncio
import logging
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL
from analytics.econometrics import (
    summary_stats,
    capm_regression,
    ols_regression,
    cointegration_test,
    granger_causality,
    rolling_volatility,
    max_drawdown,
    fama_french_exposures,
)
from analytics.ta import ALL_INDICATORS

router = APIRouter()
logger = logging.getLogger(__name__)


class StatsRequest(BaseModel):
    ticker: str
    period: str = "1y"


class StatsResponse(BaseModel):
    ticker: str
    mean: float | None = None
    std: float | None = None
    skew: float | None = None
    kurtosis: float | None = None
    sharpe: float | None = None
    max_drawdown: float | None = None
    var_95: float | None = None


class RegressionRequest(BaseModel):
    y_ticker: str
    x_ticker: str | None = None
    market_ticker: str = "^GSPC"
    regression_type: str = "capm"


class CointRequest(BaseModel):
    ticker1: str
    ticker2: str


class TARequest(BaseModel):
    ticker: str
    indicators: list[str]
    period: str = "1y"
    interval: str = "1d"


@router.get("/analytics/summary", response_model=StatsResponse)
async def get_summary(ticker: str = Query(...), period: str = Query(default="1y")):
    ticker = ticker.upper()
    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    df = await provider.get_historical(ticker, period=period)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    returns = df["Close"].pct_change().dropna()
    stats = summary_stats(returns)

    return StatsResponse(
        ticker=ticker,
        mean=stats.get("mean"),
        std=stats.get("std"),
        skew=stats.get("skew"),
        kurtosis=stats.get("kurtosis"),
        sharpe=stats.get("sharpe"),
        max_drawdown=stats.get("max_drawdown"),
        var_95=stats.get("var_95"),
    )


@router.get("/analytics/regression")
async def get_regression(
    y_ticker: str = Query(...),
    x_ticker: str | None = Query(default=None),
    market_ticker: str = Query(default="^GSPC"),
    regression_type: str = Query(default="capm"),
):
    import pandas as pd
    import asyncio

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    y_df_task = provider.get_historical(y_ticker.upper(), period="2y")
    benchmark = x_ticker.upper() if x_ticker else market_ticker.upper()
    x_df_task = provider.get_historical(benchmark, period="2y")

    y_df, x_df = await asyncio.gather(y_df_task, x_df_task)

    if y_df is None or y_df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {y_ticker}")
    if x_df is None or x_df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {benchmark}")

    y_returns = y_df["Close"].pct_change().dropna()
    x_returns = x_df["Close"].pct_change().dropna()

    if regression_type == "capm":
        result = capm_regression(y_returns, x_returns)
        return {"type": "capm", "y_ticker": y_ticker.upper(), "x_ticker": benchmark, **result}
    else:
        result = ols_regression(y_returns, x_returns.to_frame())
        return {"type": "ols", "y_ticker": y_ticker.upper(), "x_ticker": benchmark, **result}


@router.get("/analytics/cointegration")
async def get_cointegration(
    ticker1: str = Query(...),
    ticker2: str = Query(...),
):
    import asyncio

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    df1_task = provider.get_historical(ticker1.upper(), period="2y")
    df2_task = provider.get_historical(ticker2.upper(), period="2y")
    df1, df2 = await asyncio.gather(df1_task, df2_task)

    if df1 is None or df1.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker1}")
    if df2 is None or df2.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker2}")

    s1 = df1["Close"]
    s2 = df2["Close"]

    aligned = pd.concat([s1, s2], axis=1).dropna()
    result = cointegration_test(aligned.iloc[:, 0], aligned.iloc[:, 1])

    return {"ticker1": ticker1.upper(), "ticker2": ticker2.upper(), **result}


@router.get("/analytics/ta")
async def get_technical_analysis(
    ticker: str = Query(...),
    indicators: str = Query(default="sma,rsi,macd"),
    period: str = Query(default="1y"),
    interval: str = Query(default="1d"),
):
    import pandas as pd

    ticker = ticker.upper()
    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    df = await provider.get_historical(ticker, period=period, interval=interval)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    requested = [i.strip().lower() for i in indicators.split(",")]
    result: dict[str, Any] = {"ticker": ticker, "indicators": {}}

    closes = df["Close"]
    ohlcv = df

    for ind_name in requested:
        if ind_name not in ALL_INDICATORS:
            continue

        fn = ALL_INDICATORS[ind_name]

        if ind_name in ("sma", "ema", "rsi"):
            for param in [20, 50, 200]:
                series = fn(closes, param)
                key = f"{ind_name}_{param}"
                result["indicators"][key] = _series_to_list(series, df)
        elif ind_name == "macd":
            macd_line, signal, hist = fn(closes)
            result["indicators"]["macd_line"] = _series_to_list(macd_line, df)
            result["indicators"]["macd_signal"] = _series_to_list(signal, df)
            result["indicators"]["macd_hist"] = _series_to_list(hist, df)
        elif ind_name == "bollinger":
            upper, mid, lower = fn(closes)
            result["indicators"]["bb_upper"] = _series_to_list(upper, df)
            result["indicators"]["bb_mid"] = _series_to_list(mid, df)
            result["indicators"]["bb_lower"] = _series_to_list(lower, df)
        elif ind_name == "ichimoku":
            cloud = fn(ohlcv)
            for k, v in cloud.items():
                result["indicators"][k] = _series_to_list(v, df)
        elif ind_name == "stochastic":
            k, d = fn(ohlcv)
            result["indicators"]["stoch_k"] = _series_to_list(k, df)
            result["indicators"]["stoch_d"] = _series_to_list(d, df)
        elif ind_name == "aroon":
            up, down = fn(ohlcv)
            result["indicators"]["aroon_up"] = _series_to_list(up, df)
            result["indicators"]["aroon_down"] = _series_to_list(down, df)
        else:
            series = fn(ohlcv)
            if isinstance(series, pd.Series):
                result["indicators"][ind_name] = _series_to_list(series, df)

    return result


def _series_to_list(series: pd.Series, df: pd.DataFrame) -> list[dict]:
    result = []
    for idx, val in series.items():
        if pd.isna(val):
            continue
        time_val = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
        result.append({"time": time_val, "value": round(float(val), 4)})
    return result


# ─── Fama-French ─────────────────────────────────────────────────────────────

class FamaFrenchResponse(BaseModel):
    ticker: str
    alpha: float | None = None
    mkt_beta: float | None = None
    smb_beta: float | None = None
    hml_beta: float | None = None
    source: str = "yfinance+fred"
    cached: bool = False


@router.get("/analytics/fama-french", response_model=FamaFrenchResponse)
async def get_fama_french(
    ticker: str = Query(..., description="Ticker symbol"),
    portfolio: str | None = Query(default=None, description="Alternative portfolio ticker (uses ticker if omitted)"),
):
    ticker = ticker.upper()
    portfolio_ticker = (portfolio or ticker).upper()
    cache_key = f"ff_{ticker}_{portfolio_ticker}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return FamaFrenchResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    fred_provider = get_provider("fred")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    try:
        port_df = await provider.get_historical(portfolio_ticker, period="3y")
        if port_df is None or port_df.empty:
            raise HTTPException(status_code=404, detail=f"No data for {portfolio_ticker}")

        portfolio_returns = port_df["Close"].pct_change().dropna()

        # Fetch Fama-French factors from FRED (approximation using market proxies)
        factor_data = pd.DataFrame()
        ff_source = "yfinance"

        if fred_provider:
            try:
                mkt_series = await fred_provider.get_econ_series("MKT_RF", start="2021-01-01")
                smb_series = await fred_provider.get_econ_series("SMB", start="2021-01-01")
                hml_series = await fred_provider.get_econ_series("HML", start="2021-01-01")
                rf_series = await fred_provider.get_econ_series("RF", start="2021-01-01")

                if mkt_series and smb_series and hml_series:
                    ff_source = "fred"
                    factor_data = pd.DataFrame({
                        "Mkt-RF": {obs["date"]: obs["value"] for obs in mkt_series.observations},
                        "SMB": {obs["date"]: obs["value"] for obs in smb_series.observations},
                        "HML": {obs["date"]: obs["value"] for obs in hml_series.observations},
                        "RF": {obs["date"]: obs["value"] for obs in rf_series.observations} if rf_series else {},
                    })
            except Exception:
                pass

        if factor_data.empty:
            # Fallback: approximate FF factors using SPY (Mkt), small-cap (IWM for SMB), value (VTV for HML)
            ff_source = "yfinance"
            spy_df = await provider.get_historical("^GSPC", period="3y")
            iwm_df = await provider.get_historical("IWM", period="3y")
            vtv_df = await provider.get_historical("VTV", period="3y")

            if spy_df is None or spy_df.empty:
                raise HTTPException(status_code=404, detail="No market data available for FF factors")

            mkt_rf = spy_df["Close"].pct_change().dropna()
            smb_proxy = (iwm_df["Close"].pct_change().dropna() - mkt_rf) if iwm_df is not None and not iwm_df.empty else pd.Series(dtype=float)
            hml_proxy = (vtv_df["Close"].pct_change().dropna() - mkt_rf) if vtv_df is not None and not vtv_df.empty else pd.Series(dtype=float)

            factor_data = pd.DataFrame({
                "Mkt-RF": mkt_rf,
                "SMB": smb_proxy.reindex(mkt_rf.index) if not smb_proxy.empty else 0,
                "HML": hml_proxy.reindex(mkt_rf.index) if not hml_proxy.empty else 0,
                "RF": 0,
            })

        result = fama_french_exposures(portfolio_returns, factor_data)
        data = {"ticker": ticker, **result, "source": ff_source}
        cache_set("econ", cache_key, data)
        return FamaFrenchResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        # Try returning cached data on failure
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return FamaFrenchResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Fama-French computation failed: {exc}")


# ─── Jarque-Bera ──────────────────────────────────────────────────────────────

class JarqueBeraResponse(BaseModel):
    ticker: str
    jb_statistic: float | None = None
    p_value: float | None = None
    is_normal: bool | None = None
    skewness: float | None = None
    kurtosis: float | None = None
    source: str = "yfinance"
    cached: bool = False


@router.get("/analytics/jarque-bera", response_model=JarqueBeraResponse)
async def get_jarque_bera(
    ticker: str = Query(...),
    period: str = Query(default="2y"),
):
    ticker = ticker.upper()
    cache_key = f"jb_{ticker}_{period}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return JarqueBeraResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    try:
        df = await provider.get_historical(ticker, period=period)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No data for {ticker}")

        returns = df["Close"].pct_change().dropna()
        n = len(returns)
        if n < 20:
            raise HTTPException(status_code=422, detail="Insufficient data for Jarque-Bera test (need 20+ observations)")

        from scipy import stats as sp_stats
        skew = float(returns.skew())
        kurt = float(returns.kurtosis())  # excess kurtosis
        jb_stat = (n / 6.0) * (skew ** 2 + (kurt + 3 - 3) ** 2 / 4.0)
        # scipy jarque_bera returns (statistic, pvalue)
        jb_stat_scipy, p_value = sp_stats.jarque_bera(returns)
        jb_stat = float(jb_stat_scipy)
        p_value = float(p_value)

        data = {
            "ticker": ticker,
            "jb_statistic": round(jb_stat, 4),
            "p_value": round(p_value, 6),
            "is_normal": p_value > 0.05,
            "skewness": round(skew, 4),
            "kurtosis": round(kurt, 4),
            "source": "yfinance",
        }
        cache_set("econ", cache_key, data)
        return JarqueBeraResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return JarqueBeraResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Jarque-Bera test failed: {exc}")


# ─── Augmented Dickey-Fuller ─────────────────────────────────────────────────

class ADFResponse(BaseModel):
    ticker: str
    adf_statistic: float | None = None
    p_value: float | None = None
    used_lag: int | None = None
    n_obs: int | None = None
    is_stationary: bool | None = None
    critical_values: dict | None = None
    source: str = "yfinance"
    cached: bool = False


@router.get("/analytics/adf", response_model=ADFResponse)
async def get_adf(
    ticker: str = Query(...),
    period: str = Query(default="2y"),
):
    ticker = ticker.upper()
    cache_key = f"adf_{ticker}_{period}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return ADFResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    try:
        df = await provider.get_historical(ticker, period=period)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No data for {ticker}")

        prices = df["Close"].dropna()
        if len(prices) < 30:
            raise HTTPException(status_code=422, detail="Insufficient data for ADF test (need 30+ observations)")

        from statsmodels.tsa.stattools import adfuller
        result = adfuller(prices, autolag="AIC")
        adf_stat = float(result[0])
        p_value = float(result[1])
        used_lag = int(result[2])
        n_obs = int(result[3])
        critical_values = {k: round(float(v), 4) for k, v in result[4].items()}

        data = {
            "ticker": ticker,
            "adf_statistic": round(adf_stat, 4),
            "p_value": round(p_value, 6),
            "used_lag": used_lag,
            "n_obs": n_obs,
            "is_stationary": p_value < 0.05,
            "critical_values": critical_values,
            "source": "yfinance",
        }
        cache_set("econ", cache_key, data)
        return ADFResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return ADFResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"ADF test failed: {exc}")


# ─── Variance Inflation Factor ────────────────────────────────────────────────

class VIFResponse(BaseModel):
    ticker: str
    factors: list[dict]  # [{"factor": str, "vif": float | None}]
    source: str = "yfinance"
    cached: bool = False


@router.get("/analytics/vif", response_model=VIFResponse)
async def get_vif(
    ticker: str = Query(...),
    factors: str = Query(default="SPY,QQQ,IWM,TLT,GLD", description="Comma-separated factor tickers"),
    period: str = Query(default="2y"),
):
    ticker = ticker.upper()
    factor_list = [f.strip().upper() for f in factors.split(",") if f.strip()]
    cache_key = f"vif_{ticker}_{'_'.join(factor_list)}_{period}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return VIFResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No provider available")

    try:
        # Fetch returns for all factors
        tasks = {f: provider.get_historical(f, period=period) for f in factor_list}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        returns_dict = {}
        for (sym, _), result in zip(tasks.items(), results):
            if isinstance(result, Exception) or result is None or result.empty:
                continue
            returns_dict[sym] = result["Close"].pct_change().dropna()

        if len(returns_dict) < 2:
            raise HTTPException(status_code=422, detail="Need at least 2 factors for VIF calculation")

        returns_df = pd.DataFrame(returns_dict).dropna()
        if len(returns_df) < 20:
            raise HTTPException(status_code=422, detail="Insufficient overlapping data for VIF")

        from statsmodels.stats.outliers_influence import variance_inflation_factor
        X = returns_df.values
        vif_results = []
        for i, col in enumerate(returns_df.columns):
            try:
                vif_val = variance_inflation_factor(X, i)
                vif_results.append({"factor": col, "vif": round(float(vif_val), 4)})
            except Exception:
                vif_results.append({"factor": col, "vif": None})

        data = {"ticker": ticker, "factors": vif_results, "source": "yfinance"}
        cache_set("econ", cache_key, data)
        return VIFResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("econ", cache_key, TTL["econ"] * 10)
        if fallback:
            return VIFResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"VIF calculation failed: {exc}")