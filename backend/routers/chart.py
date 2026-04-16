import asyncio
import hashlib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Any

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()

VALID_PERIODS = {"1d","5d","1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"}
VALID_INTERVALS = {"1m","5m","15m","30m","1h","1d","1wk","1mo"}
INTRADAY_INTERVALS = {"1m","5m","15m","30m","1h"}


def _cache_ttl(interval: str) -> int:
    return TTL["intraday"] if interval in INTRADAY_INTERVALS else TTL["daily"]


def _sma(series: pd.Series, window: int) -> list:
    result = series.rolling(window).mean()
    return [None if pd.isna(v) else round(float(v), 4) for v in result]


def _rsi(series: pd.Series, period: int = 14) -> list:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return [None if pd.isna(v) else round(float(v), 2) for v in rsi]


def _macd(series: pd.Series) -> tuple[list, list, list]:
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal = macd_line.ewm(span=9, adjust=False).mean()
    hist = macd_line - signal

    def _fmt(s):
        return [None if pd.isna(v) else round(float(v), 4) for v in s]

    return _fmt(macd_line), _fmt(signal), _fmt(hist)


def _bollinger(series: pd.Series, window: int = 20, num_std: float = 2.0) -> tuple[list, list, list]:
    mid = series.rolling(window).mean()
    std = series.rolling(window).std()
    upper = mid + num_std * std
    lower = mid - num_std * std

    def _fmt(s):
        return [None if pd.isna(v) else round(float(v), 4) for v in s]

    return _fmt(upper), _fmt(mid), _fmt(lower)


def _df_to_ohlcv(df: pd.DataFrame) -> list[dict]:
    rows = []
    for ts, row in df.iterrows():
        if hasattr(ts, "date"):
            time_val = ts.strftime("%Y-%m-%d") if ts.tzinfo is None or ts.hour == 0 else int(ts.timestamp())
        else:
            time_val = str(ts)
        rows.append({
            "time":   time_val,
            "open":   round(float(row["Open"]), 4),
            "high":   round(float(row["High"]), 4),
            "low":    round(float(row["Low"]), 4),
            "close":  round(float(row["Close"]), 4),
            "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
        })
    return rows


class ChartResponse(BaseModel):
    ticker: str
    period: str
    interval: str
    ohlcv: list[dict]
    sma20: list[Any]
    sma50: list[Any]
    sma200: list[Any]
    rsi: list[Any]
    macd_line: list[Any]
    macd_signal: list[Any]
    macd_hist: list[Any]
    bb_upper: list[Any]
    bb_mid: list[Any]
    bb_lower: list[Any]
    cached: bool = False
    has_more: bool = True
    truncated: bool = False


SPREAD_LABELS: dict[str, str] = {
    "^TNX":  "10Y Treasury",
    "^IRX":  "3M T-Bill",
    "^FVX":  "5Y Treasury",
    "^TYX":  "30Y Treasury",
    "^VIX":  "VIX",
    "GC=F":  "Gold",
    "CL=F":  "Crude Oil",
}


class SpreadPoint(BaseModel):
    time:  str
    value: float


class SpreadData(BaseModel):
    ticker1: str
    ticker2: str
    label1:  str
    label2:  str
    period:  str
    spread:  list[SpreadPoint]
    current: float | None
    high:    float | None
    low:     float | None
    avg:     float | None


@router.get("/chart/spread", response_model=SpreadData)
async def get_chart_spread(
    ticker1: str = Query(...),
    ticker2: str = Query(...),
    period:  str = Query("2y"),
):
    t1 = ticker1.upper()
    t2 = ticker2.upper()

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No chart provider available")

    try:
        df1, df2 = await asyncio.gather(
            provider.get_historical(t1, period=period, interval="1d"),
            provider.get_historical(t2, period=period, interval="1d"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if df1 is None or df1.empty:
        raise HTTPException(status_code=404, detail=f"No data for {t1}")
    if df2 is None or df2.empty:
        raise HTTPException(status_code=404, detail=f"No data for {t2}")

    combined = pd.concat(
        [df1["Close"].rename("s1"), df2["Close"].rename("s2")],
        axis=1,
    ).dropna()
    combined["spread"] = combined["s1"] - combined["s2"]

    spread_pts = [
        SpreadPoint(time=idx.strftime("%Y-%m-%d"), value=round(float(row["spread"]), 4))
        for idx, row in combined.iterrows()
    ]

    vals = combined["spread"].dropna()
    current = round(float(vals.iloc[-1]), 4) if len(vals) > 0 else None
    high    = round(float(vals.max()),    4) if len(vals) > 0 else None
    low     = round(float(vals.min()),    4) if len(vals) > 0 else None
    avg     = round(float(vals.mean()),   4) if len(vals) > 0 else None

    return SpreadData(
        ticker1=t1, ticker2=t2,
        label1=SPREAD_LABELS.get(t1, t1),
        label2=SPREAD_LABELS.get(t2, t2),
        period=period,
        spread=spread_pts,
        current=current, high=high, low=low, avg=avg,
    )


@router.get("/chart/{ticker}", response_model=ChartResponse)
async def get_chart(
    ticker: str,
    period: str = Query("1y", enum=list(VALID_PERIODS)),
    interval: str = Query("1d", enum=list(VALID_INTERVALS)),
    start: str | None = Query(None, description="ISO YYYY-MM-DD start date; overrides period if present"),
    end: str | None = Query(None, description="ISO YYYY-MM-DD end date; overrides period if present"),
):
    ticker = ticker.upper()

    if start or end:
        if start:
            try:
                pd.to_datetime(start)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid start date: {start}")
        if end:
            try:
                pd.to_datetime(end)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid end date: {end}")

        cache_key = f"{ticker}_{start or ''}_{end or ''}_{interval}"
        ttl = _cache_ttl(interval)

        cached = cache_get("chart", cache_key, ttl)
        if cached:
            return ChartResponse(**cached, cached=True)

        provider = get_provider("yfinance")
        if not provider:
            raise HTTPException(status_code=502, detail="No chart provider available")

        range_start = start or "1900-01-01"
        range_end = end or pd.Timestamp.utcnow().strftime("%Y-%m-%d")

        try:
            df, truncated, has_more = await provider.get_historical_range(
                ticker, range_start, range_end, interval
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        if df is None or df.empty:
            return ChartResponse(
                ticker=ticker, period=period, interval=interval,
                ohlcv=[], sma20=[], sma50=[], sma200=[], rsi=[],
                macd_line=[], macd_signal=[], macd_hist=[],
                bb_upper=[], bb_mid=[], bb_lower=[],
                has_more=False, truncated=truncated,
            )

        closes = df["Close"]
        n = len(df)
        ohlcv = _df_to_ohlcv(df)
        null_pad = [None] * n

        data = {
            "ticker":      ticker,
            "period":      period,
            "interval":    interval,
            "ohlcv":       ohlcv,
            "sma20":       null_pad,
            "sma50":       null_pad,
            "sma200":      null_pad,
            "rsi":         null_pad,
            "macd_line":   null_pad,
            "macd_signal": null_pad,
            "macd_hist":   null_pad,
            "bb_upper":    null_pad,
            "bb_mid":      null_pad,
            "bb_lower":    null_pad,
            "has_more":    has_more,
            "truncated":   truncated,
        }
        cache_set("chart", cache_key, data)
        return ChartResponse(**data)

    cache_key = f"{ticker}_{period}_{interval}"
    ttl = _cache_ttl(interval)

    cached = cache_get("chart", cache_key, ttl)
    if cached:
        return ChartResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No chart provider available")

    try:
        prepost = interval in INTRADAY_INTERVALS
        df = await provider.get_historical(ticker, period=period, interval=interval, prepost=prepost)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No chart data for {ticker}")

    closes = df["Close"]
    ohlcv = _df_to_ohlcv(df)
    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    rsi = _rsi(closes, 14)
    macd_line, macd_signal, macd_hist = _macd(closes)
    bb_upper, bb_mid, bb_lower = _bollinger(closes)

    data = {
        "ticker":      ticker,
        "period":      period,
        "interval":    interval,
        "ohlcv":       ohlcv,
        "sma20":       sma20,
        "sma50":       sma50,
        "sma200":      sma200,
        "rsi":         rsi,
        "macd_line":   macd_line,
        "macd_signal": macd_signal,
        "macd_hist":   macd_hist,
        "bb_upper":    bb_upper,
        "bb_mid":      bb_mid,
        "bb_lower":    bb_lower,
    }
    cache_set("chart", cache_key, data)

    return ChartResponse(**data)