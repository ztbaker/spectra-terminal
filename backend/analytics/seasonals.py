from __future__ import annotations

from dataclasses import dataclass

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
