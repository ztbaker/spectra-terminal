import asyncio
import json as _json
import math
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL
from streaming import MEM, coalesce, CIRCUIT, IO_EXECUTOR


NY_TZ = ZoneInfo("America/New_York")

_US_MARKET_HOLIDAYS_2026 = {
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
    "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
    "2026-11-26", "2026-12-25",
}


def _derive_market_state(info_raw: dict) -> str:
    raw = info_raw.get("marketState")
    if isinstance(raw, str):
        raw = raw.upper()
        if raw in ("PRE", "PREPRE"):
            return "PRE"
        if raw in ("REGULAR", "OPEN"):
            return "OPEN"
        if raw in ("POST", "POSTPOST"):
            return "POST"
        if raw == "CLOSED":
            return "CLOSED"
    now = datetime.now(NY_TZ)
    if now.strftime("%Y-%m-%d") in _US_MARKET_HOLIDAYS_2026:
        return "CLOSED"
    t = now.hour * 60 + now.minute
    weekday = now.weekday()
    if weekday >= 5:
        return "CLOSED"
    if t < 570:
        return "PRE"
    if t < 960:
        return "OPEN"
    if t < 1200:
        return "POST"
    return "CLOSED"

def _format_earnings_date(value) -> str | None:
    """Normalize yfinance earnings date (unix ts, ISO string, or date) to YYYY-MM-DD."""
    if value is None or value == "" or value == 0:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime("%Y-%m-%d")
        s = str(value).strip()
        if not s:
            return None
        if s.isdigit():
            return datetime.fromtimestamp(int(s), tz=timezone.utc).strftime("%Y-%m-%d")
        return s[:10]
    except Exception:
        return None


router = APIRouter()


class FinancialsData(BaseModel):
    revenue_ttm: float | None = None
    net_income_ttm: float | None = None
    eps_ttm: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    return_on_equity: float | None = None
    return_on_assets: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None


class EquityResponse(BaseModel):
    ticker: str
    company_name: str | None
    price: float | None
    change: float | None
    change_pct: float | None
    volume: int | None
    avg_volume: int | None
    market_cap: float | None
    pe_ratio: float | None
    eps: float | None
    high_52w: float | None
    low_52w: float | None
    beta: float | None
    dividend_yield: float | None
    sector: str | None
    industry: str | None
    description: str | None
    exchange: str | None
    currency: str | None
    shares_outstanding: float | None
    float_shares: float | None
    bid: float | None
    ask: float | None
    day_high: float | None
    day_low: float | None
    open: float | None
    prev_close: float | None
    cached: bool = False
    country: str | None = None
    sub_industry: str | None = None
    ceo: str | None = None
    address: str | None = None
    phone: str | None = None
    short_ratio: float | None = None
    forward_pe: float | None = None
    ev_ebitda: float | None = None
    price_to_book: float | None = None
    employees: int | None = None
    website: str | None = None
    target_price: float | None = None
    recommendation: str | None = None
    next_earnings: str | None = None
    source: str = ""


def _extract_ceo(info: dict) -> str | None:
    officers = info.get("companyOfficers")
    if not isinstance(officers, list):
        return None
    for officer in officers:
        title = (officer.get("title") or "").lower()
        if "ceo" in title or "chief executive" in title:
            return officer.get("name")
    return None


def _build_address(info: dict) -> str | None:
    parts = [info.get("address1"), info.get("city"), info.get("state")]
    joined = ", ".join(p for p in parts if p)
    return joined or None


def _build_equity_response(ticker: str, info: dict) -> dict:
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change = None
    change_pct = None
    if price is not None and prev_close:
        change = round(price - prev_close, 4)
        change_pct = round((change / prev_close) * 100, 4)

    return {
        "ticker":             ticker.upper(),
        "company_name":       info.get("longName") or info.get("shortName"),
        "price":              price,
        "change":             change,
        "change_pct":         change_pct,
        "volume":             info.get("volume") or info.get("regularMarketVolume"),
        "avg_volume":         info.get("averageVolume"),
        "market_cap":         info.get("marketCap"),
        "pe_ratio":           info.get("trailingPE") or info.get("forwardPE"),
        "eps":                info.get("trailingEps"),
        "high_52w":           info.get("fiftyTwoWeekHigh"),
        "low_52w":            info.get("fiftyTwoWeekLow"),
        "beta":               info.get("beta"),
        "dividend_yield":     info.get("dividendYield"),
        "sector":             info.get("sector"),
        "industry":           info.get("industry"),
        "description":        info.get("longBusinessSummary"),
        "exchange":           info.get("exchange") or info.get("fullExchangeName"),
        "currency":           info.get("currency"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "float_shares":       info.get("floatShares"),
        "bid":                info.get("bid"),
        "ask":                info.get("ask"),
        "day_high":           info.get("dayHigh") or info.get("regularMarketDayHigh"),
        "day_low":            info.get("dayLow") or info.get("regularMarketDayLow"),
        "open":               info.get("open") or info.get("regularMarketOpen"),
        "prev_close":         prev_close,
        "country":       info.get("country"),
        "sub_industry":  info.get("industryDisp"),
        "ceo":           _extract_ceo(info),
        "address":       _build_address(info),
        "phone":         info.get("phone"),
        "short_ratio":   info.get("shortRatio"),
        "forward_pe":    info.get("forwardPE"),
        "ev_ebitda":     info.get("enterpriseToEbitda"),
        "price_to_book": info.get("priceToBook"),
        "employees":     info.get("fullTimeEmployees"),
        "website":        info.get("website"),
        "target_price":   info.get("targetMeanPrice"),
        "recommendation":  info.get("recommendationKey"),
        "next_earnings":   _format_earnings_date(info.get("earningsTimestamp") or info.get("earningsDate")),
        "source":         "yfinance",
    }


@router.get("/equity/{ticker}/financials", response_model=FinancialsData)
async def get_financials(ticker: str):
    ticker = ticker.upper()

    cached = cache_get("financials", ticker, TTL["financials"])
    if cached:
        return FinancialsData(**cached)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        info_raw = await provider.get_ticker_info_raw(ticker)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}")

    if not info_raw:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    data = {
        "revenue_ttm":      info_raw.get("totalRevenue"),
        "net_income_ttm":   info_raw.get("netIncomeToCommon"),
        "eps_ttm":          info_raw.get("trailingEps"),
        "gross_margin":     info_raw.get("grossMargins"),
        "operating_margin": info_raw.get("operatingMargins"),
        "debt_to_equity":   info_raw.get("debtToEquity"),
        "current_ratio":    info_raw.get("currentRatio"),
        "return_on_equity": info_raw.get("returnOnEquity"),
        "return_on_assets": info_raw.get("returnOnAssets"),
        "revenue_growth":   info_raw.get("revenueGrowth"),
        "earnings_growth":  info_raw.get("earningsGrowth"),
    }
    cache_set("financials", ticker, data)
    return FinancialsData(**data)


async def _build_live(ticker: str) -> dict:
    cache_key = f"live_ext_{ticker}"

    if CIRCUIT.is_tripped("yfinance"):
        cached = cache_get("price", cache_key, 60)
        if cached:
            cached["cached"] = True
            return cached

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    fast = await provider.get_fast_quote_raw(ticker)

    slow_cached = cache_get("price", cache_key, 60)
    market_state_val = None
    pre_market_price = None
    pre_market_change = None
    pre_market_change_pct = None
    pre_market_time = None
    post_market_price = None
    post_market_change = None
    post_market_change_pct = None
    post_market_time = None
    regular_close = None
    regular_close_time = None

    if slow_cached:
        market_state_val = slow_cached.get("market_state")
        pre_market_price = slow_cached.get("pre_market_price")
        pre_market_change = slow_cached.get("pre_market_change")
        pre_market_change_pct = slow_cached.get("pre_market_change_pct")
        pre_market_time = slow_cached.get("pre_market_time")
        post_market_price = slow_cached.get("post_market_price")
        post_market_change = slow_cached.get("post_market_change")
        post_market_change_pct = slow_cached.get("post_market_change_pct")
        post_market_time = slow_cached.get("post_market_time")
        regular_close = slow_cached.get("regular_close")
        regular_close_time = slow_cached.get("regular_close_time")
    else:
        try:
            ext = await provider.get_extended_quote_raw(ticker)
            if ext and ext.get("ticker") == ticker:
                market_state_val = ext.get("market_state")
                pre_market_price = ext.get("pre_market_price")
                pre_market_change = ext.get("pre_market_change")
                pre_market_change_pct = ext.get("pre_market_change_pct")
                pre_market_time = ext.get("pre_market_time")
                post_market_price = ext.get("post_market_price")
                post_market_change = ext.get("post_market_change")
                post_market_change_pct = ext.get("post_market_change_pct")
                post_market_time = ext.get("post_market_time")
                regular_close = ext.get("regular_close")
                regular_close_time = ext.get("regular_market_time")
        except Exception:
            pass

    if market_state_val is None:
        market_state_val = _derive_market_state({"marketState": None})

    price = fast.get("price")
    prev_close = fast.get("prev_close")
    change = None
    change_pct = None
    if price and prev_close:
        change = round(price - prev_close, 4)
        change_pct = round((price - prev_close) / prev_close * 100, 4)

    resp = {
        "ticker": ticker,
        "price": price,
        "change": change,
        "change_pct": change_pct,
        "bid": fast.get("bid"),
        "ask": fast.get("ask"),
        "volume": fast.get("volume"),
        "day_high": fast.get("day_high"),
        "day_low": fast.get("day_low"),
        "market_state": market_state_val,
        "pre_market_price": pre_market_price,
        "pre_market_change": pre_market_change,
        "pre_market_change_pct": pre_market_change_pct,
        "pre_market_time": pre_market_time,
        "post_market_price": post_market_price,
        "post_market_change": post_market_change,
        "post_market_change_pct": post_market_change_pct,
        "post_market_time": post_market_time,
        "regular_close": regular_close,
        "regular_close_time": regular_close_time,
        "as_of": int(time.time()),
    }

    cache_set("price", cache_key, resp)
    return resp


@router.get("/equity/{ticker}/live")
async def get_equity_live(ticker: str):
    ticker = ticker.upper()
    hot_key = f"live_hot_{ticker}"
    cached = MEM.get(hot_key, ttl=0.5)
    if cached:
        return cached
    resp = await coalesce(hot_key, lambda: _build_live(ticker))
    MEM.set(hot_key, resp)
    return resp


@router.get("/equity/{ticker}/stream")
async def stream_equity(ticker: str):
    ticker = ticker.upper()
    async def gen():
        while True:
            try:
                data = await _build_live(ticker)
            except Exception as e:
                data = {"error": str(e), "ticker": ticker, "as_of": int(time.time())}
            yield f"data: {_json.dumps(data)}\n\n"
            await asyncio.sleep(1.0)
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _safe_float(val) -> float | None:
    try:
        v = float(val)
        return None if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


# ─── Market Snapshots ─────────────────────────────────────────────────────────

class MarketSnapshot(BaseModel):
    ticker: str
    name: str | None = None
    price: float | None = None
    change: float | None = None
    change_pct: float | None = None
    volume: int | None = None


class MarketSnapshotsResponse(BaseModel):
    snapshots: list[MarketSnapshot]
    source: str = "yfinance"
    cached: bool = False


MARKET_PROXY_ETFS = ["SPY", "QQQ", "DIA", "IWM", "VIX"]


@router.get("/equity/market-snapshots", response_model=MarketSnapshotsResponse)
async def get_market_snapshots():
    cache_key = "equity_market_snapshots"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return MarketSnapshotsResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        snapshots = []
        for ticker in MARKET_PROXY_ETFS:
            try:
                info = await provider.get_ticker_info_raw(ticker)
                if not info:
                    continue
                price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
                prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
                change = None
                change_pct = None
                if price and prev_close:
                    change = round(price - prev_close, 4)
                    change_pct = round((change / prev_close) * 100, 4)
                snapshots.append(MarketSnapshot(
                    ticker=ticker,
                    name=info.get("shortName") or info.get("longName"),
                    price=price,
                    change=change,
                    change_pct=change_pct,
                    volume=_safe_int(info.get("volume") or info.get("regularMarketVolume")),
                ))
            except Exception:
                continue

        data = {"snapshots": [s.model_dump() for s in snapshots], "source": "yfinance"}
        cache_set("price", cache_key, data)
        return MarketSnapshotsResponse(snapshots=snapshots, source="yfinance")
    except Exception as exc:
        fallback = cache_get("price", cache_key, TTL["price"] * 10)
        if fallback:
            return MarketSnapshotsResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Market snapshots failed: {exc}")


# ─── Management Compensation ─────────────────────────────────────────────────

class OfficerComp(BaseModel):
    name: str | None = None
    title: str | None = None
    total_pay: float | None = None
    fiscal_year: int | None = None


class ManagementResponse(BaseModel):
    ticker: str
    officers: list[OfficerComp]
    source: str = "yfinance"
    cached: bool = False


@router.get("/equity/{ticker}/management", response_model=ManagementResponse)
async def get_management(ticker: str):
    ticker = ticker.upper()
    cache_key = f"mgmt_{ticker}"
    cached = cache_get("financials", cache_key, TTL["financials"])
    if cached:
        return ManagementResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        info = await provider.get_ticker_info_raw(ticker)
        if not info:
            raise HTTPException(status_code=404, detail=f"No data for {ticker}")

        officers_raw = info.get("companyOfficers", [])
        officers = []
        if isinstance(officers_raw, list):
            for off in officers_raw[:15]:
                total_pay = off.get("totalPay")
                try:
                    total_pay = float(total_pay) if total_pay else None
                except (TypeError, ValueError):
                    total_pay = None
                fiscal_year = off.get("fiscalYear")
                try:
                    fiscal_year = int(fiscal_year) if fiscal_year else None
                except (TypeError, ValueError):
                    fiscal_year = None
                officers.append(OfficerComp(
                    name=off.get("name"),
                    title=off.get("title"),
                    total_pay=total_pay,
                    fiscal_year=fiscal_year,
                ))

        data = {"ticker": ticker, "officers": [o.model_dump() for o in officers], "source": "yfinance"}
        cache_set("financials", cache_key, data)
        return ManagementResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("financials", cache_key, TTL["financials"] * 10)
        if fallback:
            return ManagementResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Management fetch failed: {exc}")


# ─── Market Cap History ──────────────────────────────────────────────────────

class MarketCapBar(BaseModel):
    date: str
    market_cap: float | None = None
    price: float | None = None


class MarketCapHistoryResponse(BaseModel):
    ticker: str
    history: list[MarketCapBar]
    source: str = "yfinance"
    cached: bool = False


@router.get("/equity/{ticker}/market-cap-history", response_model=MarketCapHistoryResponse)
async def get_market_cap_history(
    ticker: str,
    period: str = Query(default="1y"),
):
    ticker = ticker.upper()
    cache_key = f"mktcap_{ticker}_{period}"
    cached = cache_get("chart", cache_key, TTL["daily"])
    if cached:
        return MarketCapHistoryResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        info_task = provider.get_ticker_info_raw(ticker)
        hist_task = provider.get_historical(ticker, period=period)
        info, df = await asyncio.gather(info_task, hist_task)

        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"No price history for {ticker}")

        shares = info.get("sharesOutstanding") if info else None
        history = []
        for idx, row in df.iterrows():
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
            close = _safe_float(row.get("Close"))
            mkt_cap = close * shares if close and shares else None
            history.append(MarketCapBar(date=date_str, market_cap=mkt_cap, price=close))

        data = {"ticker": ticker, "history": [h.model_dump() for h in history], "source": "yfinance"}
        cache_set("chart", cache_key, data)
        return MarketCapHistoryResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("chart", cache_key, TTL["daily"] * 10)
        if fallback:
            return MarketCapHistoryResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Market cap history failed: {exc}")


# ─── Analyst Estimates ────────────────────────────────────────────────────────

class EstimateEntry(BaseModel):
    period: str | None = None
    eps_estimate: float | None = None
    eps_actual: float | None = None
    revenue_estimate: float | None = None
    revenue_actual: float | None = None


class EstimatesResponse(BaseModel):
    ticker: str
    current_year: list[EstimateEntry]
    next_year: list[EstimateEntry]
    source: str = "yfinance"
    cached: bool = False


@router.get("/equity/{ticker}/estimates", response_model=EstimatesResponse)
async def get_estimates(ticker: str):
    ticker = ticker.upper()
    cache_key = f"estimates_{ticker}"
    cached = cache_get("financials", cache_key, TTL["financials"])
    if cached:
        return EstimatesResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        info = await provider.get_ticker_info_raw(ticker)
        if not info:
            raise HTTPException(status_code=404, detail=f"No data for {ticker}")

        # Extract available estimate data from yfinance info dict
        current_year = []
        next_year = []

        target_high = _safe_float(info.get("targetHighPrice"))
        target_low = _safe_float(info.get("targetLowPrice"))
        target_mean = _safe_float(info.get("targetMeanPrice"))
        target_median = _safe_float(info.get("targetMedianPrice"))
        num_analysts = _safe_int(info.get("numberOfAnalystOpinions"))

        current_year.append(EstimateEntry(
            period="consensus",
            eps_estimate=_safe_float(info.get("forwardEps")),
            eps_actual=_safe_float(info.get("trailingEps")),
            revenue_estimate=None,
            revenue_actual=None,
        ))

        data = {
            "ticker": ticker,
            "current_year": [e.model_dump() for e in current_year],
            "next_year": [e.model_dump() for e in next_year],
            "source": "yfinance",
        }
        cache_set("financials", cache_key, data)
        return EstimatesResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("financials", cache_key, TTL["financials"] * 10)
        if fallback:
            return EstimatesResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Estimates fetch failed: {exc}")


# ─── Peer Comparison ──────────────────────────────────────────────────────────

class PeerEntry(BaseModel):
    ticker: str
    company_name: str | None = None
    price: float | None = None
    change_pct: float | None = None
    market_cap: float | None = None
    pe_ratio: float | None = None
    sector: str | None = None
    industry: str | None = None


class CompareResponse(BaseModel):
    ticker: str
    peers: list[PeerEntry]
    source: str = "yfinance"
    cached: bool = False


@router.get("/equity/compare", response_model=CompareResponse)
async def compare_equities(
    tickers: str = Query(..., description="Comma-separated ticker list"),
):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=422, detail="At least one ticker required")

    cache_key = f"compare_{'_'.join(ticker_list)}"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return CompareResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        peers = []
        for t in ticker_list:
            try:
                info = await provider.get_ticker_info_raw(t)
                if not info:
                    peers.append(PeerEntry(ticker=t))
                    continue
                price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
                prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
                change_pct = round(((price - prev_close) / prev_close) * 100, 4) if price and prev_close else None
                peers.append(PeerEntry(
                    ticker=t,
                    company_name=info.get("longName") or info.get("shortName"),
                    price=price,
                    change_pct=change_pct,
                    market_cap=_safe_float(info.get("marketCap")),
                    pe_ratio=_safe_float(info.get("trailingPE") or info.get("forwardPE")),
                    sector=info.get("sector"),
                    industry=info.get("industry"),
                ))
            except Exception:
                peers.append(PeerEntry(ticker=t))

        data = {"ticker": ticker_list[0], "peers": [p.model_dump() for p in peers], "source": "yfinance"}
        cache_set("price", cache_key, data)
        return CompareResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("price", cache_key, TTL["price"] * 10)
        if fallback:
            return CompareResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Comparison failed: {exc}")


# ─── Calendar (IPO/Dividend/Splits) ───────────────────────────────────────────

class CalendarEntry(BaseModel):
    ticker: str
    company_name: str | None = None
    event_type: str  # "dividend", "split", "earnings"
    date: str | None = None
    details: str | None = None


class CalendarResponse(BaseModel):
    entries: list[CalendarEntry]
    source: str = "yfinance"
    cached: bool = False


CALENDAR_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "JNJ",
                    "WMT", "PG", "UNH", "HD", "MA", "DIS", "PYPL", "BAC", "NFLX", "INTC"]


@router.get("/equity/calendar", response_model=CalendarResponse)
async def get_equity_calendar():
    cache_key = "equity_calendar"
    cached = cache_get("price", cache_key, TTL["daily"])
    if cached:
        return CalendarResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        entries = []
        for t in CALENDAR_TICKERS:
            try:
                info = await provider.get_ticker_info_raw(t)
                if not info:
                    continue

                # Dividend date
                div_date = info.get("dividendDate")
                if div_date:
                    entries.append(CalendarEntry(
                        ticker=t,
                        company_name=info.get("shortName") or info.get("longName"),
                        event_type="dividend",
                        date=str(div_date) if div_date else None,
                        details=f"Yield: {info.get('dividendYield', 'N/A')}",
                    ))

                # Split (ex-date is not always available from info dict)
                split_date = info.get("lastSplitDate")
                if split_date:
                    entries.append(CalendarEntry(
                        ticker=t,
                        company_name=info.get("shortName") or info.get("longName"),
                        event_type="split",
                        date=str(split_date),
                        details=info.get("lastSplitFactor", "N/A"),
                    ))

                # Earnings date
                earnings_date = info.get("earningsTimestamp") or info.get("earningsDate")
                if earnings_date:
                    entries.append(CalendarEntry(
                        ticker=t,
                        company_name=info.get("shortName") or info.get("longName"),
                        event_type="earnings",
                        date=str(earnings_date),
                    ))
            except Exception:
                continue

        data = {"entries": [e.model_dump() for e in entries], "source": "yfinance"}
        cache_set("price", cache_key, data)
        return CalendarResponse(entries=entries, source="yfinance")
    except Exception as exc:
        fallback = cache_get("price", cache_key, TTL["daily"] * 10)
        if fallback:
            return CalendarResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Calendar fetch failed: {exc}")


# ─── Discovery (Gainers/Losers/Active) ───────────────────────────────────────

class DiscoveryEntry(BaseModel):
    ticker: str
    company_name: str | None = None
    price: float | None = None
    change_pct: float | None = None
    volume: int | None = None
    market_cap: float | None = None


class DiscoveryResponse(BaseModel):
    gainers: list[DiscoveryEntry]
    losers: list[DiscoveryEntry]
    active: list[DiscoveryEntry]
    source: str = "yfinance"
    cached: bool = False


DISCOVERY_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "NFLX", "CRM",
    "SPY", "QQQ", "IWM", "DIA", "BA", "GS", "CAT", "CVX", "XOM", "UNH",
    "JPM", "V", "MA", "BAC", "WFC", "C", "MS", "BLK", "SCHW",
    "JNJ", "PFE", "MRK", "ABBV", "LLY", "CVS", "TMO", "ABT", "DHR",
    "DIS", "WMT", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "COST", "TJX",
]


@router.get("/equity/discovery", response_model=DiscoveryResponse)
async def get_discovery():
    cache_key = "equity_discovery"
    cached = cache_get("price", cache_key, TTL["price"])
    if cached:
        return DiscoveryResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        entries = []
        for t in DISCOVERY_TICKERS:
            try:
                info = await provider.get_ticker_info_raw(t)
                if not info:
                    continue
                price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
                prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
                change_pct = round(((price - prev_close) / prev_close) * 100, 4) if price and prev_close else None
                entries.append(DiscoveryEntry(
                    ticker=t,
                    company_name=info.get("shortName") or info.get("longName"),
                    price=price,
                    change_pct=change_pct,
                    volume=_safe_int(info.get("volume") or info.get("regularMarketVolume")),
                    market_cap=_safe_float(info.get("marketCap")),
                ))
            except Exception:
                continue

        sorted_by_change = sorted(
            [e for e in entries if e.change_pct is not None],
            key=lambda e: e.change_pct,
        )
        sorted_by_volume = sorted(
            [e for e in entries if e.volume is not None],
            key=lambda e: e.volume,
            reverse=True,
        )

        gainers = sorted_by_change[-5:] if len(sorted_by_change) >= 5 else sorted_by_change
        losers = sorted_by_change[:5] if len(sorted_by_change) >= 5 else sorted_by_change
        active = sorted_by_volume[:10]

        data = {
            "gainers": [g.model_dump() for g in gainers],
            "losers": [l.model_dump() for l in losers],
            "active": [a.model_dump() for a in active],
            "source": "yfinance",
        }
        cache_set("price", cache_key, data)
        return DiscoveryResponse(gainers=gainers, losers=losers, active=active, source="yfinance")
    except Exception as exc:
        fallback = cache_get("price", cache_key, TTL["price"] * 10)
        if fallback:
            return DiscoveryResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Discovery fetch failed: {exc}")


# ─── Equity Ticker (catch-all — MUST be after all static /equity/* routes) ────

@router.get("/equity/{ticker}", response_model=EquityResponse)
async def get_equity(ticker: str):
    ticker = ticker.upper()

    cached = cache_get("price", ticker, TTL["price"])
    if cached:
        return EquityResponse(**cached, cached=True)

    provider = get_provider("yfinance")
    if not provider:
        raise HTTPException(status_code=502, detail="No equity provider available")

    try:
        info_raw = await provider.get_ticker_info_raw(ticker)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}")

    if not info_raw:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    data = _build_equity_response(ticker, info_raw)
    cache_set("price", ticker, data)

    return EquityResponse(**data)


# ─── Short Interest ────────────────────────────────────────────────────────────

class ShortInterestEntry(BaseModel):
    week_start_date: str | None = None
    short_volume: float | None = None
    total_volume: float | None = None
    short_ratio: float | None = None


class ShortInterestResponse(BaseModel):
    ticker: str
    entries: list[ShortInterestEntry]
    source: str = "finra"
    cached: bool = False


@router.get("/equity/{ticker}/shorts", response_model=ShortInterestResponse)
async def get_short_interest(ticker: str):
    ticker = ticker.upper()
    cache_key = f"shorts_{ticker}"
    cached = cache_get("price", cache_key, TTL["daily"])
    if cached:
        return ShortInterestResponse(**cached, cached=True)

    finra_provider = get_provider("finra")
    if not finra_provider:
        raise HTTPException(status_code=502, detail="FINRA provider not available")

    try:
        raw = await finra_provider.get_short_sale_volume(ticker=ticker, limit=30)
        entries = []
        if raw and isinstance(raw, list):
            for item in raw[:30]:
                short_vol = _safe_float(item.get("shortVolume"))
                total_vol = _safe_float(item.get("totalVolume"))
                short_ratio = round(short_vol / total_vol, 4) if short_vol and total_vol and total_vol > 0 else None
                entries.append(ShortInterestEntry(
                    week_start_date=item.get("weekStartDate"),
                    short_volume=short_vol,
                    total_volume=total_vol,
                    short_ratio=short_ratio,
                ))

        data = {"ticker": ticker, "entries": [e.model_dump() for e in entries], "source": "finra"}
        cache_set("price", cache_key, data)
        return ShortInterestResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        fallback = cache_get("price", cache_key, TTL["daily"] * 10)
        if fallback:
            return ShortInterestResponse(**fallback, cached=True)
        raise HTTPException(status_code=502, detail=f"Short interest fetch failed: {exc}")