from __future__ import annotations
from dataclasses import dataclass
import pandas as pd
import numpy as np


@dataclass
class LadderLevel:
    price: float
    volume: int
    side: str


def _tick_size(price: float) -> float:
    target = max(price * 0.001, 0.01)
    snaps = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 5.00, 10.00]
    for s in snaps:
        if s >= target:
            return s
    return snaps[-1]


def compute_ladder(
    bars: pd.DataFrame, current_price: float, levels: int = 20,
) -> tuple[list[LadderLevel], float]:
    if bars is None or bars.empty or 'Close' not in bars.columns or 'Volume' not in bars.columns:
        return [], _tick_size(current_price)

    tick = _tick_size(current_price)
    centre = round(current_price / tick) * tick

    bucket_prices = np.array([centre + (i - levels) * tick for i in range(2 * levels + 1)])
    vol_by_bucket = {round(p, 4): 0 for p in bucket_prices}

    for _, row in bars.iterrows():
        close = float(row['Close'])
        vol = int(row['Volume']) if not pd.isna(row['Volume']) else 0
        if vol <= 0:
            continue
        bucket = round(round(close / tick) * tick, 4)
        if bucket in vol_by_bucket:
            vol_by_bucket[bucket] += vol

    out: list[LadderLevel] = []
    for p in bucket_prices:
        rp = round(p, 4)
        if rp > centre:
            side = 'ask'
        elif rp < centre:
            side = 'bid'
        else:
            side = 'last'
        out.append(LadderLevel(price=rp, volume=vol_by_bucket[rp], side=side))

    out.sort(key=lambda x: -x.price)
    return out, tick