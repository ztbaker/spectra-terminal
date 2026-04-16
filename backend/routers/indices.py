import asyncio
import time as _time
from functools import partial

import yfinance as yf
from fastapi import APIRouter, Query
from pydantic import BaseModel

from providers.registry import get_provider

router = APIRouter()

# ─── Status-bar indices (existing) ───────────────────────────────────────────

INDEX_TICKERS = [
    "^GSPC", "^DJI", "^IXIC", "^VIX",
    "^TNX", "GC=F", "CL=F", "BTC-USD",
]

LABELS = {
    "^GSPC":   "S&P 500",
    "^DJI":    "DOW",
    "^IXIC":   "NASDAQ",
    "^VIX":    "VIX",
    "^TNX":    "10Y",
    "GC=F":    "GOLD",
    "CL=F":    "OIL",
    "BTC-USD": "BTC",
}


class IndexQuote(BaseModel):
    ticker:     str
    label:      str
    price:      float | None
    change:     float | None
    change_pct: float | None


@router.get("/indices", response_model=list[IndexQuote])
async def get_indices():
    provider = get_provider("yfinance")
    if not provider:
        return []

    tasks = [provider.get_fast_quote_raw(t) for t in INDEX_TICKERS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for ticker, result in zip(INDEX_TICKERS, results):
        if isinstance(result, Exception):
            output.append(IndexQuote(
                ticker=ticker, label=LABELS.get(ticker, ticker),
                price=None, change=None, change_pct=None,
            ))
            continue

        price = result.get("price")
        prev  = result.get("prev_close")
        change     = round(price - prev, 4)       if price and prev else None
        change_pct = round((change / prev) * 100, 4) if change and prev else None

        output.append(IndexQuote(
            ticker=ticker, label=LABELS.get(ticker, ticker),
            price=price, change=change, change_pct=change_pct,
        ))

    return output


# ─── World equity indices (WEI) ───────────────────────────────────────────────

WORLD_INDICES = [
    # ── Americas ──────────────────────────────────────────────────────────────
    {"ticker": "^GSPC",    "name": "S&P 500",           "short": "SPX",    "country": "USA", "region": "Americas"},
    {"ticker": "^DJI",     "name": "Dow Jones",          "short": "DJIA",   "country": "USA", "region": "Americas"},
    {"ticker": "^IXIC",    "name": "Nasdaq Composite",   "short": "COMP",   "country": "USA", "region": "Americas"},
    {"ticker": "^RUT",     "name": "Russell 2000",       "short": "RTY",    "country": "USA", "region": "Americas"},
    {"ticker": "^GSPTSE",  "name": "TSX Composite",      "short": "TSX",    "country": "CAN", "region": "Americas"},
    {"ticker": "^MXX",     "name": "IPC Mexico",         "short": "IPC",    "country": "MEX", "region": "Americas"},
    {"ticker": "^BVSP",    "name": "Bovespa",            "short": "IBOV",   "country": "BRA", "region": "Americas"},
    # ── Europe ────────────────────────────────────────────────────────────────
    {"ticker": "^FTSE",    "name": "FTSE 100",           "short": "UKX",    "country": "GBR", "region": "Europe"},
    {"ticker": "^GDAXI",   "name": "DAX",                "short": "DAX",    "country": "DEU", "region": "Europe"},
    {"ticker": "^FCHI",    "name": "CAC 40",             "short": "CAC",    "country": "FRA", "region": "Europe"},
    {"ticker": "^STOXX50E","name": "Euro Stoxx 50",      "short": "SX5E",   "country": "EUR", "region": "Europe"},
    {"ticker": "^SSMI",    "name": "SMI",                "short": "SMI",    "country": "CHE", "region": "Europe"},
    {"ticker": "^AEX",     "name": "AEX",                "short": "AEX",    "country": "NLD", "region": "Europe"},
    {"ticker": "^IBEX",    "name": "IBEX 35",            "short": "IBEX",   "country": "ESP", "region": "Europe"},
    {"ticker": "^OMXS30",  "name": "OMX Stockholm 30",   "short": "OMX30",  "country": "SWE", "region": "Europe"},
    # ── Asia / Pacific ────────────────────────────────────────────────────────
    {"ticker": "^N225",    "name": "Nikkei 225",         "short": "NKY",    "country": "JPN", "region": "Asia/Pacific"},
    {"ticker": "^HSI",     "name": "Hang Seng",          "short": "HSI",    "country": "HKG", "region": "Asia/Pacific"},
    {"ticker": "^KS11",    "name": "KOSPI",              "short": "KOSPI",  "country": "KOR", "region": "Asia/Pacific"},
    {"ticker": "000001.SS","name": "Shanghai Composite", "short": "SHCOMP", "country": "CHN", "region": "Asia/Pacific"},
    {"ticker": "^AXJO",    "name": "ASX 200",            "short": "AS51",   "country": "AUS", "region": "Asia/Pacific"},
    {"ticker": "^BSESN",   "name": "Sensex",             "short": "SENSEX", "country": "IND", "region": "Asia/Pacific"},
    {"ticker": "^NSEI",    "name": "Nifty 50",           "short": "NIFTY",  "country": "IND", "region": "Asia/Pacific"},
    {"ticker": "^STI",     "name": "Straits Times",      "short": "STI",    "country": "SGP", "region": "Asia/Pacific"},
    {"ticker": "^TWII",    "name": "Taiwan Weighted",    "short": "TWSE",   "country": "TWN", "region": "Asia/Pacific"},
    # ── Middle East & Africa ──────────────────────────────────────────────────
    {"ticker": "^TA125.TA","name": "TA-125",             "short": "TA125",  "country": "ISR", "region": "Mid East/Africa"},
    {"ticker": "^JALSH",   "name": "JSE All Share",      "short": "JALSH",  "country": "ZAF", "region": "Mid East/Africa"},
]

_WORLD_CACHE:    dict | None = None
_WORLD_CACHE_TS: float       = 0.0
_WORLD_CACHE_TTL = 60  # seconds


class WorldIndexEntry(BaseModel):
    ticker:     str
    name:       str
    short:      str
    country:    str
    region:     str
    price:      float | None
    change:     float | None
    change_pct: float | None
    volume:     float | None
    year_high:  float | None
    year_low:   float | None
    currency:   str   | None
    error:      str   | None


class WorldIndicesResponse(BaseModel):
    indices:    list[WorldIndexEntry]
    fetched_at: float


def _fetch_index_sync(meta: dict) -> dict:
    """Blocking yfinance call — runs in a thread-pool executor."""
    ticker = meta["ticker"]
    try:
        t  = yf.Ticker(ticker)
        fi = t.fast_info

        price      = _safe_float(getattr(fi, "last_price",      None))
        prev_close = _safe_float(getattr(fi, "previous_close",  None))
        volume     = _safe_float(getattr(fi, "last_volume",     None))
        year_high  = _safe_float(getattr(fi, "year_high",       None))
        year_low   = _safe_float(getattr(fi, "year_low",        None))
        currency   = getattr(fi, "currency", None)

        change     = round(price - prev_close, 4)            if price and prev_close else None
        change_pct = round((change / prev_close) * 100, 4)  if change and prev_close else None

        return {**meta, "price": price, "change": change, "change_pct": change_pct,
                "volume": volume, "year_high": year_high, "year_low": year_low,
                "currency": currency, "error": None}
    except Exception as exc:
        return {**meta, "price": None, "change": None, "change_pct": None,
                "volume": None, "year_high": None, "year_low": None,
                "currency": None, "error": str(exc)}


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        return None if (f != f) else f   # reject NaN
    except (TypeError, ValueError):
        return None


async def _fetch_index(meta: dict) -> dict:
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, partial(_fetch_index_sync, meta)),
            timeout=8.0,
        )
    except asyncio.TimeoutError:
        return {**meta, "price": None, "change": None, "change_pct": None,
                "volume": None, "year_high": None, "year_low": None,
                "currency": None, "error": "timeout"}


@router.get("/indices/world", response_model=WorldIndicesResponse)
async def get_world_indices():
    global _WORLD_CACHE, _WORLD_CACHE_TS

    now = _time.monotonic()
    if _WORLD_CACHE and (now - _WORLD_CACHE_TS) < _WORLD_CACHE_TTL:
        return _WORLD_CACHE

    results = await asyncio.gather(*[_fetch_index(m) for m in WORLD_INDICES])

    _WORLD_CACHE    = {"indices": list(results), "fetched_at": _time.time()}
    _WORLD_CACHE_TS = now
    return _WORLD_CACHE


# ─── Index constituents ───────────────────────────────────────────────────────

# Hardcoded member lists for supported indices (key = yfinance ticker)
CONSTITUENTS: dict[str, list[str]] = {
    # ── DJIA 30 ───────────────────────────────────────────────────────────────
    "^DJI": [
        "AAPL", "AMGN", "AMZN", "AXP", "BA",  "CAT", "CRM", "CSCO", "CVX",
        "DIS",  "DOW",  "GS",   "HD",  "HON", "IBM", "JNJ", "JPM",  "KO",
        "MCD",  "MMM",  "MRK",  "MSFT","NKE", "PG",  "SHW", "TRV",  "UNH",
        "V",    "VZ",   "WMT",
    ],
    # ── S&P 500 top-50 ────────────────────────────────────────────────────────
    "^GSPC": [
        "AAPL", "MSFT", "NVDA", "AMZN", "META",  "GOOGL", "BRK-B", "TSLA",
        "LLY",  "AVGO", "UNH",  "JPM",  "V",     "ORCL",  "XOM",   "MA",
        "JNJ",  "WMT",  "PG",   "HD",   "COST",  "ABBV",  "MRK",   "CRM",
        "BAC",  "CVX",  "NFLX", "KO",   "ADBE",  "AMD",   "CSCO",  "ACN",
        "PEP",  "LIN",  "TMO",  "WFC",  "DIS",   "ABT",   "MCD",   "INTC",
        "GE",   "AXP",  "IBM",  "CAT",  "PM",    "INTU",  "NOW",   "QCOM",
        "RTX",  "AMGN",
    ],
    # ── NASDAQ Composite (top NASDAQ-100 names) ───────────────────────────────
    "^IXIC": [
        "AAPL", "MSFT", "NVDA", "AMZN", "META",  "GOOGL", "GOOG",  "TSLA",
        "AVGO", "COST", "NFLX", "AMD",  "ADBE",  "QCOM",  "INTC",  "TMUS",
        "TXN",  "AMGN", "HON",  "INTU", "ISRG",  "CMCSA", "BKNG",  "AMAT",
        "MU",   "LRCX", "PANW", "KLAC", "MELI",  "SNPS",
    ],
    # ── Russell 2000 (sample — top liquid small-caps) ─────────────────────────
    "^RUT": [
        "INSM", "LUNR", "RIOT", "MARA", "PLUG", "SPWR", "NOVA", "ACHR",
        "JOBY", "SMAR", "PTON", "LAZR", "OPEN", "CLOV", "HIMS", "TASK",
        "BIRD", "BLNK", "CHPT", "EVGO", "NKLA", "GOEV", "WKHS", "DRTS",
        "SRPT", "AGIO", "ARWR", "BEAM", "EDIT", "FATE",
    ],
    # ── FTSE 100 ──────────────────────────────────────────────────────────────
    "^FTSE": [
        "AZN.L",  "HSBA.L", "SHEL.L", "BP.L",   "ULVR.L", "RIO.L",
        "GSK.L",  "BATS.L", "LSEG.L", "NWG.L",  "LLOY.L", "BA.L",
        "DGE.L",  "RKT.L",  "BT-A.L", "GLEN.L", "IMB.L",  "AAL.L",
        "VOD.L",  "EXPN.L", "REL.L",  "NG.L",   "SSE.L",  "SVT.L",
        "WPP.L",  "CNA.L",  "ABF.L",  "PSON.L", "LAND.L", "BKG.L",
    ],
    # ── DAX 40 ────────────────────────────────────────────────────────────────
    "^GDAXI": [
        "SAP.DE",  "DTE.DE",  "ALV.DE",  "BMW.DE",  "BAS.DE",  "BAYN.DE",
        "SIE.DE",  "ADS.DE",  "MUV2.DE", "DBK.DE",  "VOW3.DE", "HEN3.DE",
        "BEI.DE",  "FRE.DE",  "IFX.DE",  "MTX.DE",  "CON.DE",  "EOAN.DE",
        "RWE.DE",  "MBG.DE",  "AIR.DE",  "ZAL.DE",  "DHL.DE",  "SY1.DE",
        "DHER.DE", "HFG.DE",  "PUM.DE",  "1COV.DE", "ENR.DE",  "QIA.DE",
    ],
    # ── CAC 40 ────────────────────────────────────────────────────────────────
    "^FCHI": [
        "MC.PA",   "OR.PA",   "TTE.PA",  "SAN.PA",  "BNP.PA",  "AIR.PA",
        "SU.PA",   "AI.PA",   "ACA.PA",  "RI.PA",   "CS.PA",   "KER.PA",
        "SGO.PA",  "DG.PA",   "CAP.PA",  "ENGI.PA", "VIE.PA",  "ATO.PA",
        "VIV.PA",  "ORA.PA",  "DSY.PA",  "HO.PA",   "EL.PA",   "GLE.PA",
        "LR.PA",   "RNO.PA",  "STM.PA",  "ERF.PA",  "WLN.PA",  "RMS.PA",
    ],
    # ── Nikkei 225 (top-30 liquid) ────────────────────────────────────────────
    "^N225": [
        "7203.T", "6758.T", "9432.T", "8306.T", "6902.T", "4063.T", "8035.T",
        "6501.T", "7267.T", "4661.T", "6954.T", "9984.T", "7751.T", "8316.T",
        "3382.T", "4543.T", "6367.T", "7741.T", "6861.T", "2914.T",
        "9613.T", "8411.T", "4502.T", "6645.T", "9022.T", "7733.T",
        "8058.T", "6752.T", "4568.T", "6702.T",
    ],
    # ── Hang Seng ─────────────────────────────────────────────────────────────
    "^HSI": [
        "0700.HK", "0939.HK", "1299.HK", "0005.HK", "0941.HK", "3988.HK",
        "2318.HK", "1398.HK", "0388.HK", "9988.HK", "2020.HK", "0883.HK",
        "1177.HK", "0066.HK", "0823.HK", "6862.HK", "0267.HK", "1928.HK",
        "0688.HK", "3690.HK", "0016.HK", "0027.HK", "0011.HK", "9618.HK",
        "1810.HK", "0002.HK", "0003.HK", "0006.HK", "0101.HK", "0762.HK",
    ],
    # ── BSE Sensex ────────────────────────────────────────────────────────────
    "^BSESN": [
        "RELIANCE.NS", "TCS.NS",      "HDFCBANK.NS", "INFY.NS",     "ICICIBANK.NS",
        "HINDUNILVR.NS","ITC.NS",     "SBIN.NS",     "BHARTIARTL.NS","KOTAKBANK.NS",
        "BAJFINANCE.NS","ASIANPAINT.NS","HCLTECH.NS", "AXISBANK.NS", "MARUTI.NS",
        "SUNPHARMA.NS", "WIPRO.NS",   "ULTRACEMCO.NS","TATAMOTORS.NS","POWERGRID.NS",
        "NTPC.NS",      "M&M.NS",     "NESTLEIND.NS", "TITAN.NS",    "BAJAJFINSV.NS",
        "LT.NS",        "TECHM.NS",   "ADANIENT.NS",  "JSWSTEEL.NS", "COALINDIA.NS",
    ],
    # ── Nifty 50 ─────────────────────────────────────────────────────────────
    "^NSEI": [
        "RELIANCE.NS", "TCS.NS",     "HDFCBANK.NS", "INFY.NS",     "ICICIBANK.NS",
        "HINDUNILVR.NS","ITC.NS",    "SBIN.NS",     "BHARTIARTL.NS","KOTAKBANK.NS",
        "BAJFINANCE.NS","LT.NS",     "HCLTECH.NS",  "AXISBANK.NS", "MARUTI.NS",
        "SUNPHARMA.NS", "WIPRO.NS",  "ONGC.NS",     "TATAMOTORS.NS","POWERGRID.NS",
        "NTPC.NS",      "M&M.NS",    "NESTLEIND.NS", "TITAN.NS",   "BAJAJFINSV.NS",
        "ADANIENT.NS",  "TECHM.NS",  "JSWSTEEL.NS",  "COALINDIA.NS","GRASIM.NS",
    ],
}

# Index name lookup (for response label)
_INDEX_NAMES = {m["ticker"]: m["name"] for m in WORLD_INDICES}

_MEMBERS_CACHE:    dict[str, dict] = {}
_MEMBERS_CACHE_TS: dict[str, float] = {}
_MEMBERS_CACHE_TTL = 60


class IndexMember(BaseModel):
    ticker:     str
    price:      float | None
    change:     float | None
    change_pct: float | None
    volume:     float | None
    market_cap: float | None


class IndexMembersResponse(BaseModel):
    index_ticker: str
    index_name:   str
    members:      list[IndexMember]


@router.get("/indices/world/members", response_model=IndexMembersResponse)
async def get_index_members(ticker: str = Query(...)):
    """Return live quotes for constituent equities of a world index."""
    now = _time.monotonic()
    if ticker in _MEMBERS_CACHE and (now - _MEMBERS_CACHE_TS.get(ticker, 0)) < _MEMBERS_CACHE_TTL:
        return _MEMBERS_CACHE[ticker]

    constituent_tickers = CONSTITUENTS.get(ticker, [])
    index_name = _INDEX_NAMES.get(ticker, ticker)

    members: list[dict] = []
    if constituent_tickers:
        provider = get_provider("yfinance")
        if provider:
            bulk = await provider.get_bulk_quotes(constituent_tickers)
            for q in bulk:
                price = _safe_float(q.price)
                prev_close = _safe_float(q.prev_close)
                change = round(price - prev_close, 4) if price and prev_close else None
                change_pct = round((change / prev_close) * 100, 4) if change and prev_close else None
                members.append({
                    "ticker": q.ticker,
                    "price": price,
                    "change": change,
                    "change_pct": change_pct,
                    "volume": _safe_float(q.volume),
                    "market_cap": _safe_float(q.market_cap),
                })

    result = {
        "index_ticker": ticker,
        "index_name":   index_name,
        "members":      members,
    }
    _MEMBERS_CACHE[ticker]    = result
    _MEMBERS_CACHE_TS[ticker] = now
    return result
