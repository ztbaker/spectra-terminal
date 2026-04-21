import logging
from typing import Any

import httpx

from providers.base import BaseProvider
from models.shared import Filing

logger = logging.getLogger(__name__)

_UA = "SpectraTerminal research@example.com"
_TIMEOUT = 15.0

_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
_ARCHIVE_BASE = (
    "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_nodash}/{doc}"
)

_ticker_to_cik: dict[str, str] = {}
_tickers_loaded: bool = False


def _make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(_TIMEOUT),
        headers={"User-Agent": _UA, "Accept": "application/json"},
        follow_redirects=True,
    )


async def _load_tickers() -> None:
    global _tickers_loaded, _ticker_to_cik
    if _tickers_loaded:
        return

    try:
        async with _make_client() as client:
            resp = await client.get(_TICKERS_URL)
            resp.raise_for_status()
            raw: dict[str, Any] = resp.json()

        for entry in raw.values():
            ticker: str = str(entry.get("ticker", "")).upper().strip()
            cik_int: int = int(entry.get("cik_str", 0))
            if ticker and cik_int:
                _ticker_to_cik[ticker] = f"{cik_int:010d}"

        _tickers_loaded = True
        logger.info("EDGAR ticker map loaded: %d entries", len(_ticker_to_cik))

    except Exception as exc:
        logger.error("Failed to load EDGAR ticker map: %s", exc)


class EdgarProvider(BaseProvider):
    name = "edgar"

    @staticmethod
    async def get_cik(ticker: str) -> str | None:
        ticker = ticker.upper().strip()
        await _load_tickers()
        return _ticker_to_cik.get(ticker)

    async def get_filings(
        self, ticker: str, form_type: str | None = "10-K", limit: int = 10
    ) -> list[Filing]:
        ticker = ticker.upper().strip()
        form_type = form_type.upper().strip() if form_type else None
        cik = await self.get_cik(ticker)
        if cik is None:
            logger.warning("EDGAR: no CIK for ticker %s", ticker)
            return []

        cik_int = int(cik)
        submissions_url = _SUBMISSIONS_URL.format(cik=cik)

        try:
            async with _make_client() as client:
                resp = await client.get(submissions_url)
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
        except Exception as exc:
            logger.error("EDGAR submissions fetch failed for %s: %s", ticker, exc)
            return []

        try:
            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            filing_dates = recent.get("filingDate", [])
            report_dates = recent.get("reportDate", [])
            accession_numbers = recent.get("accessionNumber", [])
            primary_docs = recent.get("primaryDocument", [])
            descriptions = recent.get("primaryDocDescription", [])
        except Exception as exc:
            logger.error("EDGAR parse failed for %s: %s", ticker, exc)
            return []

        results: list[Filing] = []
        for i in range(len(forms)):
            if len(results) >= limit:
                break
            raw_form = forms[i] if i < len(forms) else ""
            if form_type and raw_form.upper() != form_type and not raw_form.upper().startswith(
                form_type + "/"
            ):
                continue

            accession_number = accession_numbers[i] if i < len(accession_numbers) else ""
            primary_doc = primary_docs[i] if i < len(primary_docs) else None
            description = descriptions[i] if i < len(descriptions) else ""
            filed_date = filing_dates[i] if i < len(filing_dates) else ""
            period_of_report = report_dates[i] if i < len(report_dates) else ""

            if not accession_number:
                continue

            if primary_doc:
                url = _ARCHIVE_BASE.format(
                    cik_int=cik_int,
                    accession_nodash=accession_number.replace("-", ""),
                    doc=primary_doc,
                )
            else:
                url = (
                    f"https://www.sec.gov/Archives/edgar/data/{cik_int}"
                    f"/{accession_number.replace('-', '')}"
                    f"/{accession_number.replace('-', '')}-index.htm"
                )

            results.append(
                Filing(
                    form_type=raw_form,
                    filed_date=filed_date,
                    description=description or raw_form,
                    url=url,
                    period_of_report=period_of_report,
                    accession_number=accession_number,
                )
            )

        return results

    async def search_institutions(self, q: str, limit: int = 20) -> list[dict]:
        """Search SEC EDGAR full-text search for institutional investors (13F filers)."""
        url = "https://efts.sec.gov/LATEST/search-index"
        search_url = "https://efts.sec.gov/LATEST/search-index"
        params = {
            "q": f'"{q}"',
            "dateRange": "custom",
            "startdt": "2024-01-01",
            "enddt": "2025-12-31",
            "forms": "13F-HR",
            "from": "0",
            "size": str(limit),
        }
        try:
            async with _make_client() as client:
                resp = await client.get(
                    "https://efts.sec.gov/LATEST/search-index",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            pass

        search_url = "https://efts.sec.gov/LATEST/search-index"
        search_params = {
            "q": q,
            "forms": "13F-HR",
            "from": "0",
            "size": str(limit),
        }
        try:
            async with _make_client() as client:
                resp = await client.get(
                    "https://efts.sec.gov/LATEST/search-index",
                    params=search_params,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            pass

        search_url_fts = "https://efts.sec.gov/LATEST/search-index"
        params_fts = {
            "q": q,
            "forms": "13F-HR",
            "from": "0",
            "size": str(limit),
        }
        try:
            async with _make_client() as client:
                resp = await client.get(
                    "https://efts.sec.gov/LATEST/search-index",
                    params=params_fts,
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            pass

        await _load_tickers()
        lower_q = q.lower()
        results = []
        for ticker, cik in _ticker_to_cik.items():
            if lower_q in ticker.lower():
                results.append({"name": ticker, "cik": cik, "ticker": ticker})
            if len(results) >= limit:
                break

        if _tickers_loaded:
            try:
                async with _make_client() as client:
                    fts_resp = await client.get(
                        "https://efts.sec.gov/LATEST/search-index",
                        params={"q": q, "forms": "13F-HR", "from": "0", "size": str(limit)},
                    )
                    fts_resp.raise_for_status()
                    fts_data = fts_resp.json()
                    hits = fts_data.get("hits", {}).get("hits", [])
                    seen_ciks = {r["cik"] for r in results}
                    for hit in hits:
                        source = hit.get("_source", {})
                        cik = source.get("cik", "")
                        entity = source.get("entity", "")
                        filing_date = source.get("file_date", "")
                        if cik and cik not in seen_ciks:
                            results.append({
                                "name": entity,
                                "cik": cik,
                                "ticker": "",
                                "filing_date": filing_date,
                            })
                            seen_ciks.add(cik)
                            if len(results) >= limit:
                                break
            except Exception:
                pass

        return results

    async def get_13f(self, cik: str) -> list[dict]:
        """Fetch 13F-HR holdings for a given CIK from SEC EDGAR."""
        cik = cik.zfill(10)
        submissions_url = _SUBMISSIONS_URL.format(cik=cik)

        try:
            async with _make_client() as client:
                resp = await client.get(submissions_url)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("EDGAR 13F submissions fetch failed for CIK %s: %s", cik, exc)
            return []

        try:
            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            accession_numbers = recent.get("accessionNumber", [])
            primary_docs = recent.get("primaryDocument", [])
        except Exception as exc:
            logger.error("EDGAR 13F parse failed for CIK %s: %s", cik, exc)
            return []

        for i, form in enumerate(forms):
            if form != "13F-HR":
                continue
            accession = accession_numbers[i] if i < len(accession_numbers) else ""
            primary_doc = primary_docs[i] if i < len(primary_docs) else ""
            if not accession:
                continue

            accession_nodash = accession.replace("-", "")
            xml_url = (
                f"https://www.sec.gov/Archives/edgar/data/{int(cik)}"
                f"/{accession_nodash}/{primary_doc}"
            ) if primary_doc else (
                f"https://www.sec.gov/Archives/edgar/data/{int(cik)}"
                f"/{accession_nodash}/{accession_nodash}-index.htm"
            )

            try:
                async with _make_client() as client:
                    xml_resp = await client.get(xml_url)
                    xml_resp.raise_for_status()
                    content = xml_resp.text
            except Exception as exc:
                logger.error("EDGAR 13F XML fetch failed for CIK %s: %s", cik, exc)
                return []

            return _parse_13f_xml(content)

        return []

    async def get_litigation(self, limit: int = 20) -> list[dict]:
        """Fetch recent SEC litigation releases from the SEC EDGAR RSS feed."""
        import feedparser

        url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=LITIGATION&company=&dateb=&owner=include&count=20&output=atom"
        try:
            async with _make_client() as client:
                resp = await client.get(url)
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)
        except Exception as exc:
            logger.error("EDGAR litigation fetch failed: %s", exc)
            return []

        results = []
        for entry in feed.entries:
            results.append({
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "published": entry.get("published", ""),
                "summary": entry.get("summary", ""),
            })
            if len(results) >= limit:
                break
        return results


def _parse_13f_xml(xml_content: str) -> list[dict]:
    """Parse 13F-HR XML to extract holdings. Returns list of holding dicts."""
    import xml.etree.ElementTree as ET

    holdings = []
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError:
        ns = {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}
        try:
            root = ET.fromstring(xml_content)
        except Exception:
            return []

    ns = {"ns": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}

    for entry in root.iter():
        tag = entry.tag.split("}")[-1] if "}" in entry.tag else entry.tag
        if tag == "infoTable":
            holding = {}
            for child in entry:
                child_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                holding[child_tag] = child.text or ""
            holdings.append(holding)

    if not holdings:
        for info in root.findall(".//ns:infoTable", ns):
            holding = {}
            nameOfIssuer = info.findtext("ns:nameOfIssuer", default="", namespaces=ns)
            titleOfClass = info.findtext("ns:titleOfClass", default="", namespaces=ns)
            cusip = info.findtext("ns:cusip", default="", namespaces=ns)
            value = info.findtext("ns:value", default="", namespaces=ns)
            sshPrnamt = info.findtext("ns:shrsOrPrnAmt/ns:sshPrnamt", default="", namespaces=ns)
            sshPrnamtType = info.findtext("ns:shrsOrPrnAmt/ns:sshPrnamtType", default="", namespaces=ns)
            putCall = info.findtext("ns:putCall", default="", namespaces=ns)
            investmentDiscrete = info.findtext("ns:investmentDiscretion", default="", namespaces=ns)

            holdings.append({
                "nameOfIssuer": nameOfIssuer,
                "titleOfClass": titleOfClass,
                "cusip": cusip,
                "value": value,
                "sshPrnamt": sshPrnamt,
                "sshPrnamtType": sshPrnamtType,
                "putCall": putCall,
                "investmentDiscretion": investmentDiscrete,
            })

    return holdings