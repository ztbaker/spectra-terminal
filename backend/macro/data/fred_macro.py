"""FRED-sourced scoring inputs for all four macro factors."""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from cache import cache_get, cache_set
from macro.models import FactorInputSet, ScoringInputs
from macro.types import FactorName

logger = logging.getLogger(__name__)

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
_FRED_SERIES: dict[FactorName, dict[str, list[str]]] = {
    FactorName.REAL_RATE: {
        "slow": ["DFII10"],
        "fast": ["T5YIFR"],
    },
    FactorName.RISK_APPETITE: {
        "slow": ["BAMLH0A0HYM2"],
    },
    FactorName.DOLLAR_LIQUIDITY: {
        "slow": ["WALCL", "WTREGEN", "RRPONTSYD"],
        "fast": ["DGS2"],
    },
    FactorName.GROWTH_INFLATION: {
        "slow": ["MANEMP"],
        "fast": ["T10Y2Y"],
    },
}

CACHE_KEY = "macro_scoring_inputs"
CACHE_TTL = 3600


async def _fetch_series(series_id: str, start: str, api_key: str) -> list[float]:
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
        "sort_order": "asc",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(FRED_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()
        observations = data.get("observations", [])
        return [float(o["value"]) for o in observations if o["value"] != "."]


async def _fetch_all_series(
    api_key: str,
) -> dict[FactorName, dict[str, dict[str, list[float]]]]:
    start = (datetime.now(timezone.utc) - timedelta(days=730)).strftime("%Y-%m-%d")

    tasks: dict[str, tuple[FactorName, str, str]] = {}
    for factor, buckets in _FRED_SERIES.items():
        for bucket_name, series_ids in buckets.items():
            for sid in series_ids:
                tasks[sid] = (factor, bucket_name, sid)

    async def _safe_fetch(sid: str) -> tuple[str, list[float]]:
        try:
            values = await _fetch_series(sid, start, api_key)
            return sid, values
        except Exception:
            logger.exception("Failed to fetch FRED series %s", sid)
            return sid, []

    results = await asyncio.gather(*[_safe_fetch(sid) for sid in tasks])

    fetched: dict[str, list[float]] = dict(results)

    factor_data: dict[FactorName, dict[str, dict[str, list[float]]]] = {}
    for sid, (factor, bucket_name, _series_id) in tasks.items():
        factor_data.setdefault(factor, {"slow": {}, "fast": {}, "positioning": {}})
        factor_data[factor][bucket_name][sid] = fetched.get(sid, [])

    return factor_data


def _build_scoring_inputs(
    factor_data: dict[FactorName, dict[str, dict[str, list[float]]]],
) -> ScoringInputs:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _make_factor(factor: FactorName) -> FactorInputSet:
        fd = factor_data.get(factor, {"slow": {}, "fast": {}, "positioning": {}})
        return FactorInputSet(
            slow=fd.get("slow", {}),
            fast=fd.get("fast", {}),
            positioning=fd.get("positioning", {}),
        )

    return ScoringInputs(
        date=today,
        real_rate=_make_factor(FactorName.REAL_RATE),
        risk_appetite=_make_factor(FactorName.RISK_APPETITE),
        dollar_liquidity=_make_factor(FactorName.DOLLAR_LIQUIDITY),
        growth_inflation=_make_factor(FactorName.GROWTH_INFLATION),
    )


async def fetch_scoring_inputs(use_cache: bool = True) -> ScoringInputs:
    if use_cache:
        cached = cache_get("macro", CACHE_KEY, CACHE_TTL)
        if cached is not None:
            return ScoringInputs.model_validate(cached)

    api_key = os.getenv("FRED_API_KEY", "")
    if not api_key:
        raise RuntimeError("FRED_API_KEY environment variable is not set")

    factor_data = await _fetch_all_series(api_key)

    all_empty = True
    for factor_buckets in factor_data.values():
        for bucket in factor_buckets.values():
            for values in bucket.values():
                if values:
                    all_empty = False
                    break
    if all_empty:
        raise RuntimeError("All FRED series fetches failed — no data available")

    result = _build_scoring_inputs(factor_data)

    cache_set("macro", CACHE_KEY, result.model_dump())

    return result