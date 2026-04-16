from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()


class Filing(BaseModel):
    form_type: str
    filed_date: str
    description: str
    url: str
    period_of_report: str
    accession_number: str


class FilingsResponse(BaseModel):
    ticker: str
    filings: list[Filing]
    cached: bool = False


class InstitutionSearchResult(BaseModel):
    name: str
    cik: str
    ticker: str = ""
    filing_date: str = ""


class InstitutionSearchResponse(BaseModel):
    results: list[InstitutionSearchResult]
    cached: bool = False


class Holding13F(BaseModel):
    nameOfIssuer: str = ""
    titleOfClass: str = ""
    cusip: str = ""
    value: str = ""
    sshPrnamt: str = ""
    sshPrnamtType: str = ""
    putCall: str = ""
    investmentDiscretion: str = ""


class Filing13FResponse(BaseModel):
    cik: str
    holdings: list[Holding13F]
    cached: bool = False


class LitigationItem(BaseModel):
    title: str
    link: str
    published: str
    summary: str


class LitigationResponse(BaseModel):
    items: list[LitigationItem]
    cached: bool = False


@router.get("/filings/{ticker}", response_model=FilingsResponse)
async def get_ticker_filings(
    ticker: str,
    type: str = "10-K",
    limit: int = 10,
) -> FilingsResponse:
    ticker = ticker.upper().strip()
    form_type = type.upper().strip()
    cache_key = f"{ticker}_filings_{form_type}"

    cached_data = cache_get("econ", cache_key, TTL["econ"])
    if cached_data is not None:
        filings = [Filing(**item) for item in cached_data]
        return FilingsResponse(ticker=ticker, filings=filings, cached=True)

    edgar_provider = get_provider("edgar")
    if not edgar_provider:
        raise HTTPException(status_code=502, detail="No EDGAR provider available")

    try:
        raw_filings = await edgar_provider.get_filings(ticker, form_type=form_type, limit=limit)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to retrieve filings for {ticker}: {exc}",
        ) from exc

    filings_data = [f.model_dump() for f in raw_filings]
    cache_set("econ", cache_key, filings_data)

    filings = [Filing(**d) for d in filings_data]
    return FilingsResponse(ticker=ticker, filings=filings, cached=False)


@router.get("/filings/institutions/search", response_model=InstitutionSearchResponse)
async def search_institutions(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, le=50),
):
    cache_key = f"institutions_search_{q.upper()}_{limit}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return InstitutionSearchResponse(**cached, cached=True)

    edgar_provider = get_provider("edgar")
    if not edgar_provider:
        raise HTTPException(status_code=502, detail="No EDGAR provider available")

    raw = await edgar_provider.search_institutions(q, limit=limit)
    results = [InstitutionSearchResult(**r) for r in raw]
    data = {"results": [r.model_dump() for r in results]}
    cache_set("econ", cache_key, data)
    return InstitutionSearchResponse(results=results)


@router.get("/filings/13f/{cik}", response_model=Filing13FResponse)
async def get_13f_holdings(cik: str):
    cik = cik.strip()
    cache_key = f"13f_{cik}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return Filing13FResponse(**cached, cached=True)

    edgar_provider = get_provider("edgar")
    if not edgar_provider:
        raise HTTPException(status_code=502, detail="No EDGAR provider available")

    raw = await edgar_provider.get_13f(cik)
    holdings = [Holding13F(**h) for h in raw]
    data = {"cik": cik, "holdings": [h.model_dump() for h in holdings]}
    cache_set("econ", cache_key, data)
    return Filing13FResponse(cik=cik, holdings=holdings)


@router.get("/filings/litigation", response_model=LitigationResponse)
async def get_litigation(
    limit: int = Query(default=20, le=50),
):
    cache_key = "litigation_feed"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return LitigationResponse(**cached, cached=True)

    edgar_provider = get_provider("edgar")
    if not edgar_provider:
        raise HTTPException(status_code=502, detail="No EDGAR provider available")

    raw = await edgar_provider.get_litigation(limit=limit)
    items = [LitigationItem(**r) for r in raw]
    data = {"items": [i.model_dump() for i in items]}
    cache_set("econ", cache_key, data)
    return LitigationResponse(items=items)