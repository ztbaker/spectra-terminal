from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings

router = APIRouter()


class BugReport(BaseModel):
    summary: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=1, max_length=8000)
    reporter: Optional[str] = None
    app_version: Optional[str] = None
    os: Optional[str] = None
    screen: Optional[str] = None
    last_error: Optional[str] = None


class BugReportResponse(BaseModel):
    issue_number: int
    issue_url: str


def _format_body(r: BugReport) -> str:
    return (
        f"**Reporter:** {r.reporter or 'unknown'}\n"
        f"**App version:** {r.app_version or 'unknown'}\n"
        f"**OS:** {r.os or 'unknown'}\n"
        f"**Screen:** {r.screen or 'unknown'}\n\n"
        f"### Description\n{r.description}\n\n"
        f"### Last error\n```\n{r.last_error or '(none captured)'}\n```\n"
    )


@router.post("/bugreport", response_model=BugReportResponse)
def submit_bug(report: BugReport):
    if not settings.GITHUB_TOKEN or not settings.GITHUB_REPO:
        raise HTTPException(status_code=503, detail="bug reporting not configured")

    payload = {
        "title": f"[beta-bug] {report.summary}",
        "body":  _format_body(report),
        "labels": ["beta-bug"],
    }
    url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues"
    headers = {
        "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    with httpx.Client(timeout=10.0) as client:
        resp = client.post(url, json=payload, headers=headers)

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"github api error: {resp.status_code}")

    data = resp.json()
    return BugReportResponse(issue_number=data["number"], issue_url=data["html_url"])
