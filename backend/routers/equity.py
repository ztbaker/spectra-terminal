from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.yfinance_service import get_ticker_info
from cache import cache_get, cache_set, TTL

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
    # DES fields
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


def _extract_ceo(info: dict) -> str | None:
    """Return the name of the first officer whose title contains 'ceo' or 'chief executive'."""
    officers = info.get("companyOfficers")
    if not isinstance(officers, list):
        return None
    for officer in officers:
        title = (officer.get("title") or "").lower()
        if "ceo" in title or "chief executive" in title:
            return officer.get("name")
    return None


def _build_address(info: dict) -> str | None:
    """Concatenate address parts, skipping nulls. Returns None if all parts null."""
    parts = [info.get("address1"), info.get("city"), info.get("state")]
    joined = ", ".join(p for p in parts if p)
    return joined or None


def _parse_equity(ticker: str, info: dict) -> dict:
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
        # DES fields
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
        "website":       info.get("website"),
    }


@router.get("/equity/{ticker}/financials", response_model=FinancialsData)
async def get_financials(ticker: str):
    ticker = ticker.upper()

    cached = cache_get("financials", ticker, TTL["financials"])
    if cached:
        return FinancialsData(**cached)

    try:
        info = await get_ticker_info(ticker)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}")

    if not info:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    data = {
        "revenue_ttm":      info.get("totalRevenue"),
        "net_income_ttm":   info.get("netIncomeToCommon"),
        "eps_ttm":          info.get("trailingEps"),
        "gross_margin":     info.get("grossMargins"),
        "operating_margin": info.get("operatingMargins"),
        "debt_to_equity":   info.get("debtToEquity"),
        "current_ratio":    info.get("currentRatio"),
        "return_on_equity": info.get("returnOnEquity"),
        "return_on_assets": info.get("returnOnAssets"),
        "revenue_growth":   info.get("revenueGrowth"),
        "earnings_growth":  info.get("earningsGrowth"),
    }
    cache_set("financials", ticker, data)
    return FinancialsData(**data)


@router.get("/equity/{ticker}", response_model=EquityResponse)
async def get_equity(ticker: str):
    ticker = ticker.upper()

    cached = cache_get("price", ticker, TTL["price"])
    if cached:
        return EquityResponse(**cached, cached=True)

    try:
        info = await get_ticker_info(ticker)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {exc}")

    if not info:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    data = _parse_equity(ticker, info)
    cache_set("price", ticker, data)

    return EquityResponse(**data)
