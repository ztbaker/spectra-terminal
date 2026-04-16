from __future__ import annotations

from models.shared import FAPeriod, FARatios, FAGrowth, FAValuation


def _safe_div(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def _avg(current: float | None, prior: float | None) -> float | None:
    if current is None and prior is None:
        return None
    if prior is None:
        return current
    if current is None:
        return prior
    return (current + prior) / 2


def compute_ratios(
    income: list[dict],
    balance: list[dict],
    cashflow: list[dict],
) -> list[FARatios]:
    results: list[FARatios] = []
    for i in range(len(income)):
        inc = income[i]
        bal = balance[i] if i < len(balance) else {}
        cf = cashflow[i] if i < len(cashflow) else {}
        bal_prev = balance[i + 1] if i + 1 < len(balance) else {}

        rev = inc.get("total_revenue")
        gp = inc.get("gross_profit")
        oi = inc.get("operating_income")
        ni = inc.get("net_income")
        ebitda = inc.get("ebitda")
        pretax = inc.get("pretax_income")
        tax_prov = inc.get("tax_provision")

        ta_cur = bal.get("total_assets")
        te_cur = bal.get("total_equity")
        ca_cur = bal.get("current_assets")
        cl_cur = bal.get("current_liabilities")
        cash = bal.get("cash_and_equivalents")
        inv_cur = bal.get("inventory")
        rec_cur = bal.get("receivables")
        td = bal.get("total_debt")
        interest_exp = inc.get("interest_expense")

        ta_prev = bal_prev.get("total_assets")
        te_prev = bal_prev.get("total_equity")
        inv_prev = bal_prev.get("inventory")
        rec_prev = bal_prev.get("receivables")

        fcf = cf.get("free_cash_flow")

        tax_rate = 0.21
        if pretax and pretax != 0 and tax_prov is not None:
            computed_rate = tax_prov / pretax
            tax_rate = max(0.0, min(0.5, computed_rate))

        avg_equity = _avg(te_cur, te_prev)
        avg_assets = _avg(ta_cur, ta_prev)
        avg_inventory = _avg(inv_cur, inv_prev)
        avg_receivables = _avg(rec_cur, rec_prev)

        interest_exp_abs = abs(interest_exp) if interest_exp is not None else None
        cost_of_rev = inc.get("cost_of_revenue")

        results.append(
            FARatios(
                date=inc.get("date", ""),
                gross_margin=_safe_div(gp, rev),
                operating_margin=_safe_div(oi, rev),
                net_margin=_safe_div(ni, rev),
                ebitda_margin=_safe_div(ebitda, rev),
                roe=_safe_div(ni, avg_equity),
                roa=_safe_div(ni, avg_assets),
                roic=_safe_div(
                    oi * (1 - tax_rate) if oi is not None else None,
                    (td if td is not None else 0)
                    + (te_cur if te_cur is not None else 0)
                    if (td is not None or te_cur is not None)
                    else None,
                )
                if oi is not None and (td is not None or te_cur is not None)
                else None,
                current_ratio=_safe_div(ca_cur, cl_cur),
                quick_ratio=_safe_div(
                    (ca_cur - inv_cur)
                    if ca_cur is not None and inv_cur is not None
                    else None,
                    cl_cur,
                ),
                cash_ratio=_safe_div(cash, cl_cur),
                debt_to_equity=_safe_div(td, te_cur),
                debt_to_assets=_safe_div(td, ta_cur),
                interest_coverage=_safe_div(oi, interest_exp_abs),
                asset_turnover=_safe_div(rev, avg_assets),
                inventory_turnover=_safe_div(cost_of_rev, avg_inventory),
                receivables_turnover=_safe_div(rev, avg_receivables),
                fcf_margin=_safe_div(fcf, rev),
                fcf_to_net_income=_safe_div(fcf, ni),
            )
        )

    return results


def _yoy(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None or prior <= 0:
        return None
    return (current - prior) / prior


def _cagr(latest: float | None, base: float | None, years: int) -> float | None:
    if latest is None or base is None or base <= 0 or latest <= 0 or years <= 0:
        return None
    return (latest / base) ** (1 / years) - 1


def compute_growth(
    income: list[dict],
    cashflow: list[dict],
) -> FAGrowth:
    rev = [p.get("total_revenue") for p in income]
    ni = [p.get("net_income") for p in income]
    eps = [p.get("diluted_eps") for p in income]
    fcf = [p.get("free_cash_flow") for p in cashflow]
    oi = [p.get("operating_income") for p in income]

    return FAGrowth(
        revenue_yoy=_yoy(
            rev[0] if len(rev) > 0 else None, rev[1] if len(rev) > 1 else None
        ),
        revenue_3y_cagr=_cagr(
            rev[0] if len(rev) > 0 else None,
            rev[3] if len(rev) > 3 else None,
            3,
        ),
        revenue_5y_cagr=_cagr(
            rev[0] if len(rev) > 0 else None,
            rev[4] if len(rev) > 4 else None,
            4,
        ),
        net_income_yoy=_yoy(
            ni[0] if len(ni) > 0 else None, ni[1] if len(ni) > 1 else None
        ),
        eps_yoy=_yoy(
            eps[0] if len(eps) > 0 else None, eps[1] if len(eps) > 1 else None
        ),
        fcf_yoy=_yoy(
            fcf[0] if len(fcf) > 0 else None, fcf[1] if len(fcf) > 1 else None
        ),
        operating_income_yoy=_yoy(
            oi[0] if len(oi) > 0 else None, oi[1] if len(oi) > 1 else None
        ),
    )


def compute_valuation(
    info: dict,
    latest_period: dict,
    latest_ratios: FARatios | None,
) -> FAValuation:
    market_cap = info.get("marketCap")
    ev = info.get("enterpriseValue")
    pe = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    peg = info.get("pegRatio")
    ptb = info.get("priceToBook")
    pts = info.get("priceToSalesTrailing12Months")
    div_yield = info.get("dividendYield")
    payout = info.get("payoutRatio")
    price = info.get("currentPrice") or info.get("regularMarketPrice")

    td = latest_period.get("total_debt")
    cash = latest_period.get("cash_and_equivalents")
    ebitda = latest_period.get("ebitda")
    rev = latest_period.get("total_revenue")
    diluted_eps = latest_period.get("diluted_eps")
    fcf = latest_period.get("free_cash_flow")

    if ev is None and market_cap is not None:
        debt_minus_cash = (td or 0) - (cash or 0)
        ev = market_cap + debt_minus_cash

    if pe is None and price is not None:
        pe = _safe_div(price, diluted_eps)

    return FAValuation(
        market_cap=market_cap,
        enterprise_value=ev,
        pe_ratio=pe,
        forward_pe=forward_pe,
        peg_ratio=peg,
        price_to_book=ptb,
        price_to_sales=pts,
        ev_ebitda=_safe_div(ev, ebitda),
        ev_revenue=_safe_div(ev, rev),
        dividend_yield=div_yield,
        payout_ratio=payout,
        fcf_yield=_safe_div(fcf, market_cap),
    )
