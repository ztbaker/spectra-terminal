from pydantic import BaseModel


class Quote(BaseModel):
    ticker: str
    price: float | None = None
    prev_close: float | None = None
    change: float | None = None
    change_pct: float | None = None
    open: float | None = None
    bid: float | None = None
    ask: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    volume: int | None = None
    avg_volume: int | None = None
    market_cap: float | None = None
    currency: str | None = None
    exchange: str | None = None
    source: str = ""
    cached: bool = False


class OHLCBar(BaseModel):
    time: str | float
    open: float
    high: float
    low: float
    close: float
    volume: int = 0


class Fundamental(BaseModel):
    ticker: str
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
    pe_ratio: float | None = None
    forward_pe: float | None = None
    ev_ebitda: float | None = None
    price_to_book: float | None = None
    sector: str | None = None
    industry: str | None = None
    company_name: str | None = None
    description: str | None = None
    country: str | None = None
    employees: int | None = None
    source: str = ""
    cached: bool = False


class NewsItem(BaseModel):
    headline: str
    source: str
    url: str
    datetime: int
    summary: str
    sentiment: str | None = None
    source_provider: str = ""


class OptionContract(BaseModel):
    strike: float | None = None
    last_price: float | None = None
    bid: float | None = None
    ask: float | None = None
    volume: int | None = None
    open_interest: int | None = None
    implied_volatility: float | None = None
    delta: float | None = None
    gamma: float | None = None
    theta: float | None = None
    vega: float | None = None
    in_the_money: bool = False
    expiration: str = ""


class EconSeries(BaseModel):
    series_id: str
    title: str = ""
    units: str = ""
    frequency: str = ""
    observations: list[dict] = []
    source: str = ""
    cached: bool = False


class Filing(BaseModel):
    form_type: str
    filed_date: str
    description: str
    url: str
    period_of_report: str = ""
    accession_number: str = ""


class InstitutionalHolding(BaseModel):
    ticker: str
    holder: str = ""
    shares: int | None = None
    value: float | None = None
    pct_of_portfolio: float | None = None
    report_date: str = ""


class EconIndicator(BaseModel):
    series_id: str
    label: str
    value: float | None = None
    prior: float | None = None
    change: float | None = None
    units: str = ""
    frequency: str = ""
    sparkline: list[float] = []


class TreasuryCurvePoint(BaseModel):
    tenor: str
    yield_value: float | None = None


class FAPeriod(BaseModel):
    date: str
    total_revenue: float | None = None
    cost_of_revenue: float | None = None
    gross_profit: float | None = None
    operating_expense: float | None = None
    operating_income: float | None = None
    ebitda: float | None = None
    interest_expense: float | None = None
    pretax_income: float | None = None
    tax_provision: float | None = None
    net_income: float | None = None
    diluted_eps: float | None = None
    basic_eps: float | None = None
    total_assets: float | None = None
    current_assets: float | None = None
    cash_and_equivalents: float | None = None
    inventory: float | None = None
    receivables: float | None = None
    ppe: float | None = None
    goodwill: float | None = None
    total_liabilities: float | None = None
    current_liabilities: float | None = None
    long_term_debt: float | None = None
    total_debt: float | None = None
    total_equity: float | None = None
    shares_outstanding: float | None = None
    operating_cash_flow: float | None = None
    investing_cash_flow: float | None = None
    financing_cash_flow: float | None = None
    capex: float | None = None
    free_cash_flow: float | None = None
    dividends_paid: float | None = None
    share_repurchases: float | None = None


class FARatios(BaseModel):
    date: str
    gross_margin: float | None = None
    operating_margin: float | None = None
    net_margin: float | None = None
    ebitda_margin: float | None = None
    roe: float | None = None
    roa: float | None = None
    roic: float | None = None
    current_ratio: float | None = None
    quick_ratio: float | None = None
    cash_ratio: float | None = None
    debt_to_equity: float | None = None
    debt_to_assets: float | None = None
    interest_coverage: float | None = None
    asset_turnover: float | None = None
    inventory_turnover: float | None = None
    receivables_turnover: float | None = None
    fcf_margin: float | None = None
    fcf_to_net_income: float | None = None


class FAValuation(BaseModel):
    market_cap: float | None = None
    enterprise_value: float | None = None
    pe_ratio: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    price_to_sales: float | None = None
    ev_ebitda: float | None = None
    ev_revenue: float | None = None
    dividend_yield: float | None = None
    payout_ratio: float | None = None
    fcf_yield: float | None = None


class FAGrowth(BaseModel):
    revenue_yoy: float | None = None
    revenue_3y_cagr: float | None = None
    revenue_5y_cagr: float | None = None
    net_income_yoy: float | None = None
    eps_yoy: float | None = None
    fcf_yoy: float | None = None
    operating_income_yoy: float | None = None


class FAOverview(BaseModel):
    company_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    employees: int | None = None
    description: str | None = None
    exchange: str | None = None
    shares_outstanding: float | None = None
    beta: float | None = None
    week52_high: float | None = None
    week52_low: float | None = None
    current_price: float | None = None


class FAResponse(BaseModel):
    ticker: str
    period: str
    currency: str = "USD"
    as_of: str
    overview: FAOverview
    income_statement: list[FAPeriod]
    balance_sheet: list[FAPeriod]
    cash_flow: list[FAPeriod]
    ratios: list[FARatios]
    valuation: FAValuation
    growth: FAGrowth
    cached: bool = False
