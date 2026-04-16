"""Congress module — bills, bill text, bill info from Congress.gov."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from providers.registry import get_provider
from cache import cache_get, cache_set, TTL

router = APIRouter()

logger = logging.getLogger(__name__)


class Bill(BaseModel):
    bill_id: str
    title: str
    type: str
    congress: int
    latest_action: str | None = None
    update_date: str | None = None
    url: str | None = None


class BillsResponse(BaseModel):
    bills: list[Bill]
    cached: bool = False


class BillDetail(BaseModel):
    bill_id: str
    title: str
    type: str
    congress: int
    summary: str | None = None
    sponsor: str | None = None
    sponsor_party: str | None = None
    introduced_date: str | None = None
    latest_action: str | None = None
    url: str | None = None


class BillDetailResponse(BaseModel):
    bill: BillDetail
    cached: bool = False


@router.get("/congress/bills", response_model=BillsResponse)
async def get_bills(
    limit: int = Query(default=20, le=100),
    congress: int | None = Query(default=None),
):
    cache_key = f"congress_bills_{limit}_{congress or 118}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        bills = [Bill(**b) for b in cached]
        return BillsResponse(bills=bills, cached=True)

    congress_provider = get_provider("congress")
    if not congress_provider:
        raise HTTPException(status_code=502, detail="Congress provider not available")

    raw = await congress_provider.get_bills(limit=limit, congress=congress)
    bills = [Bill(**b) for b in raw]
    data = [b.model_dump() for b in bills]
    cache_set("econ", cache_key, data)
    return BillsResponse(bills=bills)


@router.get("/congress/bill/{bill_id}", response_model=BillDetailResponse)
async def get_bill(bill_id: str):
    cache_key = f"congress_bill_{bill_id}"
    cached = cache_get("econ", cache_key, TTL["econ"])
    if cached:
        return BillDetailResponse(**cached, cached=True)

    congress_provider = get_provider("congress")
    if not congress_provider:
        raise HTTPException(status_code=502, detail="Congress provider not available")

    # Parse bill_id like "HR1234" or "S567"
    bill_type = ""
    number = ""
    for i, c in enumerate(bill_id):
        if c.isdigit():
            bill_type = bill_id[:i].lower()
            number = bill_id[i:]
            break

    if not bill_type or not number:
        raise HTTPException(status_code=400, detail=f"Invalid bill_id format: {bill_id}")

    congress_num = 118
    result = await congress_provider.get_bill(congress_num, bill_type, number)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Bill not found: {bill_id}")

    bill_data = result.get("bill", result)
    detail = BillDetail(
        bill_id=bill_id.upper(),
        title=bill_data.get("title", ""),
        type=bill_type.upper(),
        congress=congress_num,
        summary=bill_data.get("summary", {}).get("text", None) if isinstance(bill_data.get("summary"), dict) else bill_data.get("summary", None),
        sponsor=bill_data.get("sponsors", [{}])[0].get("fullName", None) if bill_data.get("sponsors") else None,
        sponsor_party=bill_data.get("sponsors", [{}])[0].get("party", None) if bill_data.get("sponsors") else None,
        introduced_date=bill_data.get("introducedDate", None),
        latest_action=bill_data.get("latestAction", {}).get("text", None) if isinstance(bill_data.get("latestAction"), dict) else bill_data.get("latestAction", None),
        url=bill_data.get("url", None),
    )

    data = {"bill": detail.model_dump()}
    cache_set("econ", cache_key, data)
    return BillDetailResponse(bill=detail)