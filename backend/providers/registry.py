from providers.base import BaseProvider

_PROVIDERS: dict[str, BaseProvider] = {}
_PROVIDER_PRIORITY: dict[str, list[str]] = {
    "quote": ["yfinance"],
    "fundamentals": ["yfinance"],
    "historical": ["yfinance", "stooq"],
    "option_expiries": ["yfinance", "cboe"],
    "options_chain": ["yfinance", "cboe"],
    "news": ["finnhub"],
    "econ_series": ["fred", "bls", "eia", "ecb", "treasury", "usda"],
    "filings": ["edgar"],
    "search": ["yfinance"],
    "treasury_curve": ["treasury"],
    "vix_term": ["cboe"],
    "short_volume": ["finra"],
    "congress_bills": ["congress"],
    "commodity_energy": ["eia"],
    "commodity_ag": ["usda"],
}


def register_provider(provider: BaseProvider) -> None:
    _PROVIDERS[provider.name] = provider


def get_provider(name: str) -> BaseProvider | None:
    return _PROVIDERS.get(name)


def get_providers_for(operation: str) -> list[BaseProvider]:
    names = _PROVIDER_PRIORITY.get(operation, [])
    return [_PROVIDERS[n] for n in names if n in _PROVIDERS]


def _auto_register() -> None:
    from providers.yfinance_provider import YFinanceProvider
    from providers.finnhub_provider import FinnhubProvider
    from providers.fred_provider import FredProvider
    from providers.edgar_provider import EdgarProvider
    from providers.ecb_provider import ECBProvider
    from providers.bls_provider import BLSProvider
    from providers.eia_provider import EIAProvider
    from providers.usda_provider import USDAProvider
    from providers.cboe_provider import CBOEProvider
    from providers.finra_provider import FINRAProvider
    from providers.treasury_provider import TreasuryProvider
    from providers.congress_provider import CongressProvider
    from providers.stooq_provider import StooqProvider

    for cls in [
        YFinanceProvider,
        FinnhubProvider,
        FredProvider,
        EdgarProvider,
        ECBProvider,
        BLSProvider,
        EIAProvider,
        USDAProvider,
        CBOEProvider,
        FINRAProvider,
        TreasuryProvider,
        CongressProvider,
        StooqProvider,
    ]:
        provider = cls()
        register_provider(provider)


_auto_register()