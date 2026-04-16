"""Technical analysis indicators — pure pandas/numpy implementations.

No TA-Lib dependency. Each indicator is a function that takes a DataFrame
with OHLCV columns and returns a Series or DataFrame.
"""

import numpy as np
import pandas as pd
from typing import Any


def sma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window).mean()


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def bollinger_bands(series: pd.Series, window: int = 20, num_std: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    mid = series.rolling(window).mean()
    std = series.rolling(window).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    return upper, mid, lower


def adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average Directional Index."""
    high = df["High"]
    low = df["Low"]
    close = df["Close"]

    plus_dm = high.diff()
    minus_dm = low.diff().abs()

    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)

    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)

    atr_val = atr(df, period)
    plus_di = 100 * plus_dm.rolling(period).mean() / atr_val
    minus_di = 100 * minus_dm.rolling(period).mean() / atr_val

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx_val = dx.rolling(period).mean()
    return adx_val


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average True Range."""
    high = df["High"]
    low = df["Low"]
    close = df["Close"]

    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)

    return tr.rolling(period).mean()


def aroon(df: pd.DataFrame, period: int = 25) -> tuple[pd.Series, pd.Series]:
    """Aroon Up/Down indicators."""
    high = df["High"]
    low = df["Low"]

    aroon_up = high.rolling(period + 1).apply(lambda x: (period - x.argmax()) / period * 100, raw=True)
    aroon_down = low.rolling(period + 1).apply(lambda x: (period - x.argmin()) / period * 100, raw=True)

    return aroon_up, aroon_down


def stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> tuple[pd.Series, pd.Series]:
    """Stochastic oscillator %K and %D."""
    low_min = df["Low"].rolling(k_period).min()
    high_max = df["High"].rolling(k_period).max()

    k = 100 * (df["Close"] - low_min) / (high_max - low_min).replace(0, np.nan)
    d = k.rolling(d_period).mean()

    return k, d


def vwap(df: pd.DataFrame) -> pd.Series:
    """Volume-Weighted Average Price."""
    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    return (typical * df["Volume"]).cumsum() / df["Volume"].cumsum().replace(0, np.nan)


def obv(df: pd.DataFrame) -> pd.Series:
    """On-Balance Volume."""
    direction = np.sign(df["Close"].diff())
    direction.iloc[0] = 0
    return (direction * df["Volume"]).cumsum()


def accumulation_distribution(df: pd.DataFrame) -> pd.Series:
    """Accumulation/Distribution Oscillator."""
    mfm = ((df["Close"] - df["Low"]) - (df["High"] - df["Close"])) / (df["High"] - df["Low"]).replace(0, np.nan)
    mfv = mfm * df["Volume"]
    return mfv.cumsum()


def ichimoku(df: pd.DataFrame, tenkan: int = 9, kijun: int = 26, senkou_b: int = 52) -> dict[str, pd.Series]:
    """Ichimoku Cloud components."""
    high = df["High"]
    low = df["Low"]

    tenkan_sen = (high.rolling(tenkan).max() + low.rolling(tenkan).min()) / 2
    kijun_sen = (high.rolling(kijun).max() + low.rolling(kijun).min()) / 2

    senkou_a = ((tenkan_sen + kijun_sen) / 2).shift(kijun)
    senkou_b = ((high.rolling(senkou_b).max() + low.rolling(senkou_b).min()) / 2).shift(kijun)

    chikou = df["Close"].shift(-kijun)

    return {
        "tenkan_sen": tenkan_sen,
        "kijun_sen": kijun_sen,
        "senkou_a": senkou_a,
        "senkou_b": senkou_b,
        "chikou": chikou,
    }


def demark(df: pd.DataFrame, period: int = 9) -> pd.Series:
    """DeMark sequential setup count (simplified)."""
    close = df["Close"]
    setup = pd.Series(0, index=df.index)

    for i in range(4, len(close)):
        count = 0
        for j in range(max(0, i - period), i):
            if close.iloc[j] > close.iloc[j - 4]:
                count += 1
            elif close.iloc[j] < close.iloc[j - 4]:
                count -= 1
        setup.iloc[i] = count

    return setup


ALL_INDICATORS: dict[str, Any] = {
    "sma": sma,
    "ema": ema,
    "rsi": rsi,
    "macd": macd,
    "bollinger": bollinger_bands,
    "adx": adx,
    "atr": atr,
    "aroon": aroon,
    "stochastic": stochastic,
    "vwap": vwap,
    "obv": obv,
    "accumulation_distribution": accumulation_distribution,
    "ichimoku": ichimoku,
    "demark": demark,
}