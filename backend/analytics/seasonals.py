from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class SeasonalPoint:
    day_of_year: int
    month: int
    day: int
    mean_return: float
    median_return: float
    p25_return: float
    p75_return: float
    cumulative_mean: float
    cumulative_median: float
    sample_size: int


def compute_seasonals(prices: pd.DataFrame, years: int = 20) -> list[SeasonalPoint]:
    """Per-calendar-day seasonal stats from historical OHLC.

    `prices` must be a DataFrame indexed by datetime with a 'Close' column.
    Returns one SeasonalPoint per (month, day) that occurs at least twice.
    """
    if prices is None or prices.empty or "Close" not in prices.columns:
        return []

    df = prices[["Close"]].copy()
    df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)

    cutoff = df.index.max() - pd.DateOffset(years=years)
    df = df.loc[df.index >= cutoff]
    if len(df) < 30:
        return []

    df["ret"] = df["Close"].pct_change()
    df = df.dropna(subset=["ret"])
    df["month"] = df.index.month
    df["day"] = df.index.day

    grouped = (
        df.groupby(["month", "day"])["ret"]
        .agg(
            mean="mean",
            median="median",
            p25=lambda s: float(s.quantile(0.25)),
            p75=lambda s: float(s.quantile(0.75)),
            n="count",
        )
        .reset_index()
    )
    grouped = (
        grouped[grouped["n"] >= 2]
        .sort_values(["month", "day"])
        .reset_index(drop=True)
    )
    if grouped.empty:
        return []

    cum_mean = (1.0 + grouped["mean"]).cumprod() - 1.0
    cum_median = (1.0 + grouped["median"]).cumprod() - 1.0

    points: list[SeasonalPoint] = []
    for i, row in grouped.iterrows():
        try:
            doy = pd.Timestamp(
                year=2025, month=int(row["month"]), day=int(row["day"])
            ).dayofyear
        except ValueError:
            continue
        points.append(
            SeasonalPoint(
                day_of_year=int(doy),
                month=int(row["month"]),
                day=int(row["day"]),
                mean_return=float(row["mean"]),
                median_return=float(row["median"]),
                p25_return=float(row["p25"]),
                p75_return=float(row["p75"]),
                cumulative_mean=float(cum_mean.iloc[i]),
                cumulative_median=float(cum_median.iloc[i]),
                sample_size=int(row["n"]),
            )
        )
    return points


def best_worst_months(points: list[SeasonalPoint]) -> dict:
    if not points:
        return {"best": [], "worst": [], "monthly": []}
    by_month: dict[int, list[float]] = {}
    for p in points:
        by_month.setdefault(p.month, []).append(p.mean_return)
    monthly = [
        {"month": m, "avg_daily_return": sum(rs) / len(rs), "days": len(rs)}
        for m, rs in sorted(by_month.items())
    ]
    sorted_months = sorted(monthly, key=lambda x: x["avg_daily_return"], reverse=True)
    return {
        "best": sorted_months[:3],
        "worst": sorted_months[-3:][::-1],
        "monthly": monthly,
    }


@dataclass
class YearPathPoint:
    day_of_year: int
    cum_return: float


@dataclass
class YearPath:
    year: int
    points: list[YearPathPoint]


@dataclass
class SeasonalEnvelopePoint:
    day_of_year: int
    mean_cum_return: float
    median_cum_return: float
    p25: float
    p75: float


def compute_yearly_paths(prices: pd.DataFrame, years: int = 20) -> list[YearPath]:
    if prices is None or prices.empty or "Close" not in prices.columns:
        return []
    df = prices[["Close"]].copy()
    df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    cutoff = df.index.max() - pd.DateOffset(years=years)
    df = df.loc[df.index >= cutoff]
    if df.empty:
        return []
    df["year"] = df.index.year
    df["doy"] = df.index.dayofyear
    out: list[YearPath] = []
    for yr, grp in df.groupby("year", sort=True):
        grp = grp.sort_index()
        first = float(grp["Close"].iloc[0])
        if first == 0.0 or not np.isfinite(first):
            continue
        cum = grp["Close"].astype(float) / first - 1.0
        pts = [
            YearPathPoint(day_of_year=int(d), cum_return=float(c))
            for d, c in zip(grp["doy"].values, cum.values)
            if np.isfinite(c)
        ]
        if pts:
            out.append(YearPath(year=int(yr), points=pts))
    return out


def compute_seasonal_envelope(
    yearly_paths: list[YearPath], exclude_year: int | None = None
) -> list[SeasonalEnvelopePoint]:
    if not yearly_paths:
        return []
    by_doy: dict[int, list[float]] = {}
    for yp in yearly_paths:
        if exclude_year is not None and yp.year == exclude_year:
            continue
        for p in yp.points:
            by_doy.setdefault(p.day_of_year, []).append(p.cum_return)
    out: list[SeasonalEnvelopePoint] = []
    for doy in sorted(by_doy):
        vals = by_doy[doy]
        if len(vals) < 2:
            continue
        arr = np.array(vals, dtype=float)
        out.append(
            SeasonalEnvelopePoint(
                day_of_year=doy,
                mean_cum_return=float(np.mean(arr)),
                median_cum_return=float(np.median(arr)),
                p25=float(np.quantile(arr, 0.25)),
                p75=float(np.quantile(arr, 0.75)),
            )
        )
    return out
