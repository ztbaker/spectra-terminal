"""CME FedWatch implied rate probabilities (derived from Fed Funds futures).

Derives rate expectations from 30-day Fed Funds futures via yfinance,
computing hike/hold/cut probabilities for the next 3 FOMC meetings.
Falls back gracefully when data is unavailable.
"""

import logging
from datetime import datetime, timedelta, timezone

from cache import cache_get, cache_set
from macro.models import FedWatchMeeting, FedWatchState

logger = logging.getLogger(__name__)

_CACHE_KEY = "fedwatch_state"
_CACHE_TTL = 3600  # 1 hour

_FED_MEETING_MONTHS = [1, 3, 5, 6, 7, 9, 10, 12]


def _next_fomc_dates(count: int = 3) -> list[str]:
    now = datetime.now(timezone.utc)
    dates = []
    year = now.year
    month = now.month
    for _ in range(24):
        for m in _FED_MEETING_MONTHS:
            if (year, m) > (now.year, now.month) or (
                (year, m) == (now.year, now.month) and now.day < 15
            ):
                meeting_date = datetime(year, m, 15, tzinfo=timezone.utc)
                if meeting_date > now:
                    dates.append(meeting_date.strftime("%Y-%m-%d"))
                if len(dates) >= count:
                    return dates
        year += 1
        month = 1
    return dates[:count]


def _fed_funds_ticker(meeting_date_str: str) -> str:
    dt = datetime.strptime(meeting_date_str, "%Y-%m-%d")
    month_code = "FGHJKMNQUVXZ"[dt.month - 1]
    year_code = str(dt.year)[-1]
    return f"ZQ{month_code}{year_code}.CBT"


def _compute_probabilities(
    current_rate: float, futures_rates: dict[str, float]
) -> list[FedWatchMeeting]:
    meetings = []
    for meeting_date, implied_rate in futures_rates.items():
        rate_diff = implied_rate - current_rate

        if rate_diff > 0.125:
            direction = "hawkish"
        elif rate_diff < -0.125:
            direction = "dovish"
        else:
            direction = "neutral"

        prob_hike = max(0.0, min(100.0, (rate_diff / 0.25) * 100))
        prob_cut = max(0.0, min(100.0, (-rate_diff / 0.25) * 100))
        prob_hold = max(0.0, 100.0 - prob_hike - prob_cut)

        total = prob_hike + prob_hold + prob_cut
        if total > 0:
            prob_hike = prob_hike / total * 100
            prob_hold = prob_hold / total * 100
            prob_cut = prob_cut / total * 100

        meetings.append(FedWatchMeeting(
            date=meeting_date,
            prob_hike=round(prob_hike, 1),
            prob_hold=round(prob_hold, 1),
            prob_cut=round(prob_cut, 1),
            implied_rate=round(implied_rate, 3),
        ))
    return meetings


def _determine_direction(meetings: list[FedWatchMeeting]) -> str:
    if not meetings:
        return "unknown"
    first = meetings[0]
    if first.prob_hike > first.prob_cut + 10:
        return "hawkish"
    elif first.prob_cut > first.prob_hike + 10:
        return "dovish"
    return "neutral"


async def _fetch_current_rate() -> float | None:
    try:
        import yfinance as yf
        ticker = yf.Ticker("EFFR")
        hist = ticker.history(period="5d")
        if hist.empty:
            ticker2 = yf.Ticker("^IRX")
            hist2 = ticker2.history(period="5d")
            if not hist2.empty:
                return round(float(hist2["Close"].iloc[-1]) / 100, 4)
        if not hist.empty:
            return round(float(hist["Close"].iloc[-1]) / 100, 4)
    except Exception as exc:
        logger.error("Failed to fetch current Fed rate: %s", exc)
    return None


async def _fetch_futures_rates(meeting_dates: list[str]) -> dict[str, float]:
    try:
        import yfinance as yf
    except ImportError:
        logger.error("yfinance not available")
        return {}

    results = {}
    for meeting_date in meeting_dates:
        ticker_str = _fed_funds_ticker(meeting_date)
        try:
            ticker = yf.Ticker(ticker_str)
            hist = ticker.history(period="5d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1])
                implied_rate = round((100 - price) / 100, 4)
                results[meeting_date] = implied_rate
        except Exception as exc:
            logger.warning("Failed to fetch futures for %s (%s): %s", meeting_date, ticker_str, exc)

    if len(results) < len(meeting_dates):
        try:
            zm_ticker = yf.Ticker("ZQ=F")
            zm_hist = zm_ticker.history(period="5d")
            if not zm_hist.empty:
                default_rate = round((100 - float(zm_hist["Close"].iloc[-1])) / 100, 4)
                for md in meeting_dates:
                    if md not in results:
                        results[md] = default_rate
        except Exception as exc:
            logger.warning("Failed to fetch ZQ=F fallback: %s", exc)

    return results


async def fetch_fedwatch_probs() -> FedWatchState:
    cached = cache_get("macro", _CACHE_KEY, _CACHE_TTL)
    if cached is not None:
        return FedWatchState.model_validate(cached)

    meeting_dates = _next_fomc_dates(3)
    if not meeting_dates:
        now = datetime.now(timezone.utc).isoformat()
        return FedWatchState(as_of=now, meetings=[], implied_direction="unknown")

    current_rate = await _fetch_current_rate()

    if current_rate is None:
        try:
            import yfinance as yf
            ff_ticker = yf.Ticker("^IRX")
            ff_hist = ff_ticker.history(period="5d")
            if not ff_hist.empty:
                current_rate = round(float(ff_hist["Close"].iloc[-1]) / 100, 4)
        except Exception:
            pass

    if current_rate is None:
        current_rate = 5.33  # fallback: approximate current Fed rate

    futures_rates = await _fetch_futures_rates(meeting_dates)

    if not futures_rates:
        now = datetime.now(timezone.utc).isoformat()
        state = FedWatchState(
            as_of=now,
            meetings=[],
            implied_direction="unknown",
        )
        return state

    valid_dates = [d for d in meeting_dates if d in futures_rates]
    valid_rates = {d: futures_rates[d] for d in valid_dates}

    meetings = _compute_probabilities(current_rate, valid_rates)
    direction = _determine_direction(meetings)

    now = datetime.now(timezone.utc).isoformat()
    state = FedWatchState(
        as_of=now,
        meetings=meetings,
        implied_direction=direction,
    )

    cache_set("macro", _CACHE_KEY, state.model_dump())

    return state