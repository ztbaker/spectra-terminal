import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEquity, fetchFinancials } from '../../lib/api'
import { usePolling } from '../../hooks/usePolling'
import type { EquityData, FinancialsData } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'

const { color, font } = theme

function formatLarge(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6)  return (n / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPrice(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return (n * 100).toFixed(2) + '%'
}

function formatMultiple(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toFixed(2) + 'x'
}

interface FieldProps {
  label: string
  value: string | number | null | undefined
  clr?: string
}

const Field: React.FC<FieldProps> = ({ label, value, clr = color.textPrimary }) => {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
      <span style={{ color: color.textTertiary, minWidth: '90px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: clr }}>{value}</span>
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <div style={{ marginBottom: '12px' }}>
    <div
      style={{
        color: color.textSecondary,
        fontFamily: font.sans,
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.02em',
        marginBottom: '4px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        paddingBottom: '2px',
      }}
    >
      {title}
    </div>
    {children}
  </div>
)

const OverviewTab: React.FC<{ data: EquityData }> = ({ data }) => {
  const [showFull, setShowFull] = useState(false)

  const desc = data.description ?? ''
  const descTruncated = desc.length > 300 && !showFull ? desc.slice(0, 300) + '…' : desc

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0 16px',
        padding: '8px',
        fontSize: '12px',
        overflowY: 'auto',
      }}
    >
      <div>
        <Section title="SECURITY IDENTIFIERS">
          <Field label="Ticker"    value={data.ticker} />
          <Field label="Exchange"  value={data.exchange} />
          <Field label="Currency"  value={data.currency} />
          <Field label="Country"   value={data.country} />
        </Section>

        <Section title="CLASSIFICATION">
          <Field label="Sector"    value={data.sector} />
          <Field label="Industry"  value={data.industry} />
          <Field label="Sub-Ind."  value={data.sub_industry} />
        </Section>

        <Section title="COMPANY DESCRIPTION">
          <div style={{ color: color.textPrimary, lineHeight: '1.5', marginBottom: '4px' }}>
            {descTruncated}
          </div>
          {desc.length > 300 && (
            <span
              style={{ color: color.accentInfo, cursor: 'pointer', fontSize: '11px' }}
              onClick={() => setShowFull(f => !f)}
            >
              {showFull ? '[SHOW LESS]' : '[SHOW MORE]'}
            </span>
          )}
        </Section>

        <Section title="CORPORATE INFO">
          <Field label="CEO"       value={data.ceo} />
          <Field label="Employees" value={data.employees?.toLocaleString('en-US') ?? null} />
          <Field label="Address"   value={data.address} />
          <Field label="Website"   value={data.website} />
          <Field label="Phone"     value={data.phone} />
        </Section>
      </div>

      <div>
        <Section title="PRICE &amp; TRADING">
          <Field label="Last Price" value={formatPrice(data.price)} />
          <Field label="52Wk High"  value={formatPrice(data.high_52w)} />
          <Field label="52Wk Low"   value={formatPrice(data.low_52w)} />
          <Field label="Volume"     value={formatLarge(data.volume)} />
          <Field label="Avg Volume" value={formatLarge(data.avg_volume)} />
          <Field label="Beta"       value={data.beta?.toFixed(2) ?? null} />
        </Section>

        <Section title="VALUATION">
          <Field label="Market Cap" value={formatLarge(data.market_cap)} />
          <Field label="P/E (TTM)"  value={data.pe_ratio ? data.pe_ratio.toFixed(1) + 'x' : null} />
          <Field label="Fwd P/E"    value={data.forward_pe ? data.forward_pe.toFixed(1) + 'x' : null} />
          <Field label="P/Book"     value={data.price_to_book ? data.price_to_book.toFixed(1) + 'x' : null} />
          <Field label="EV/EBITDA"  value={data.ev_ebitda ? data.ev_ebitda.toFixed(1) + 'x' : null} />
          <Field label="Div Yield"  value={formatPct(data.dividend_yield)} />
        </Section>

        <Section title="SHARES &amp; FLOAT">
          <Field label="Shares Out"  value={formatLarge(data.shares_outstanding)} />
          <Field label="Float"       value={formatLarge(data.float_shares)} />
          <Field label="Short Ratio" value={data.short_ratio?.toFixed(1) ?? null} />
        </Section>
      </div>
    </div>
  )
}

const FinancialsTab: React.FC<{
  fins: FinancialsData | undefined
  isLoading: boolean
  isError: boolean
}> = ({ fins, isLoading, isError }) => {
  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary }}>
        LOADING FINANCIAL DATA...
      </div>
    )
  }
  if (isError || !fins) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: color.accentNegative }}>
        FINANCIAL DATA UNAVAILABLE
      </div>
    )
  }

  const pctColor = (v: number | null) =>
    v === null ? color.textPrimary : v >= 0 ? color.accentPositive : color.accentNegative

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0 16px',
        padding: '8px',
        fontSize: '12px',
      }}
    >
      <div>
        <Section title="INCOME STATEMENT (TTM)">
          <Field label="Revenue"      value={formatLarge(fins.revenue_ttm)} />
          <Field label="Net Income"   value={formatLarge(fins.net_income_ttm)} />
          <Field label="EPS"          value={fins.eps_ttm?.toFixed(2) ?? null} />
          <Field label="Gross Margin" value={formatPct(fins.gross_margin)} />
          <Field label="Oper. Margin" value={formatPct(fins.operating_margin)} />
        </Section>
      </div>

      <div>
        <Section title="BALANCE SHEET &amp; RETURNS">
          <Field label="Debt/Equity"   value={formatMultiple(fins.debt_to_equity)} />
          <Field label="Current Ratio" value={formatMultiple(fins.current_ratio)} />
          <Field label="Return on Eq"  value={formatPct(fins.return_on_equity)} />
          <Field label="Return on As"  value={formatPct(fins.return_on_assets)} />
        </Section>

        <Section title="GROWTH">
          {fins.revenue_growth !== null && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
              <span style={{ color: color.textTertiary, minWidth: '90px' }}>Revenue Gr.</span>
              <span style={{ color: pctColor(fins.revenue_growth) }}>
                {fins.revenue_growth >= 0 ? '+' : ''}{formatPct(fins.revenue_growth)}
              </span>
            </div>
          )}
          {fins.earnings_growth !== null && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
              <span style={{ color: color.textTertiary, minWidth: '90px' }}>Earnings Gr.</span>
              <span style={{ color: pctColor(fins.earnings_growth) }}>
                {fins.earnings_growth >= 0 ? '+' : ''}{formatPct(fins.earnings_growth)}
              </span>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const DESScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activeTab, setActiveTab] = useState(1)

  const { data, isLoading, isError, isFetching, refetch } = useQuery<EquityData>({
    queryKey: ['equity', ticker],
    queryFn: () => fetchEquity(ticker),
    staleTime: 15_000,
  })
  usePolling(refetch, 15_000)

  const {
    data: fins,
    isLoading: finsLoading,
    isError: finsError,
  } = useQuery<FinancialsData>({
    queryKey: ['financials', ticker],
    queryFn: () => fetchFinancials(ticker),
    enabled: activeTab === 2,
    staleTime: 3_600_000,
  })

  const tabStyle = (tab: number): React.CSSProperties => ({
    padding: '0 8px',
    fontSize: '11px',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    border: activeTab === tab ? `1px solid ${color.accentPositive}` : `1px solid ${color.borderSubtle}`,
    color: activeTab === tab ? color.accentPositive : color.textTertiary,
    background: 'transparent',
    fontFamily: 'inherit',
    marginLeft: '4px',
  })

  const panelActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '10px', color: color.textTertiary }}>
        {isFetching && !isLoading ? 'REFRESHING...' : ''}
      </span>
      <button style={tabStyle(1)} onClick={() => setActiveTab(1)}>DES 1</button>
      <button style={tabStyle(2)} onClick={() => setActiveTab(2)}>DES 2</button>
    </div>
  )

  const pageHeader = data && (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '16px',
        padding: '4px 8px',
        borderBottom: `1px solid ${color.borderSubtle}`,
        fontSize: '12px',
      }}
    >
      <span style={{ color: color.textPrimary, fontWeight: 'bold' }}>
        {ticker} US Equity
      </span>
      <span style={{ color: color.textPrimary }}>{data.company_name}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: font.sans }}>
      <LoadingBar loading={isLoading || isFetching} />

      {isError ? (
        <div style={{ padding: '40px', textAlign: 'center', color: color.accentNegative, fontSize: '12px' }}>
          SECURITY UNAVAILABLE — {ticker} NOT FOUND
        </div>
      ) : isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: color.textTertiary, fontSize: '12px' }}>
          LOADING SECURITY DATA...
        </div>
      ) : data ? (
        <>
          {pageHeader}
          {panelActions}
          {activeTab === 1 && <OverviewTab data={data} />}
          {activeTab === 2 && (
            <FinancialsTab fins={fins} isLoading={finsLoading} isError={finsError} />
          )}
        </>
      ) : null}
    </div>
  )
}

export default DESScreen