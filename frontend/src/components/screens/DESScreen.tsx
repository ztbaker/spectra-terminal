import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEquity, fetchFinancials } from '../../lib/api'
import type { EquityData, FinancialsData } from '../../types'
import Panel from '../Terminal/Panel'
import LoadingBar from '../shared/LoadingBar'

// ─── Formatting helpers ───────────────────────────────────────────────────────

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
  // yfinance returns margins/yields as 0–1 decimals
  if (n == null) return '—'
  return (n * 100).toFixed(2) + '%'
}

function formatMultiple(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toFixed(2) + 'x'
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  value: string | number | null | undefined
  color?: string
}

const Field: React.FC<FieldProps> = ({ label, value, color = '#e0e0e0' }) => {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
      <span style={{ color: '#554400', minWidth: '90px', flexShrink: 0 }}>{label}</span>
      <span style={{ color }}>{value}</span>
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
        color: '#cc7700',
        fontSize: '10px',
        letterSpacing: '0.08em',
        marginBottom: '4px',
        borderBottom: '1px solid #2a2a2a',
        paddingBottom: '2px',
      }}
    >
      {title}
    </div>
    {children}
  </div>
)

// ─── Tab 1: Overview ─────────────────────────────────────────────────────────

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
      {/* ── Left column ── */}
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
          <div style={{ color: '#e0e0e0', lineHeight: '1.5', marginBottom: '4px' }}>
            {descTruncated}
          </div>
          {desc.length > 300 && (
            <span
              style={{ color: '#ff9900', cursor: 'pointer', fontSize: '11px' }}
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

      {/* ── Right column ── */}
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

// ─── Tab 2: Financials ────────────────────────────────────────────────────────

const FinancialsTab: React.FC<{
  fins: FinancialsData | undefined
  isLoading: boolean
  isError: boolean
}> = ({ fins, isLoading, isError }) => {
  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#554400' }}>
        LOADING FINANCIAL DATA...
      </div>
    )
  }
  if (isError || !fins) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#ff3333' }}>
        FINANCIAL DATA UNAVAILABLE
      </div>
    )
  }

  const pctColor = (v: number | null) =>
    v === null ? '#e0e0e0' : v >= 0 ? '#00ff41' : '#ff3333'

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
      {/* Left: Income Statement */}
      <div>
        <Section title="INCOME STATEMENT (TTM)">
          <Field label="Revenue"      value={formatLarge(fins.revenue_ttm)} />
          <Field label="Net Income"   value={formatLarge(fins.net_income_ttm)} />
          <Field label="EPS"          value={fins.eps_ttm?.toFixed(2) ?? null} />
          <Field label="Gross Margin" value={formatPct(fins.gross_margin)} />
          <Field label="Oper. Margin" value={formatPct(fins.operating_margin)} />
        </Section>
      </div>

      {/* Right: Balance Sheet + Growth */}
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
              <span style={{ color: '#554400', minWidth: '90px' }}>Revenue Gr.</span>
              <span style={{ color: pctColor(fins.revenue_growth) }}>
                {fins.revenue_growth >= 0 ? '+' : ''}{formatPct(fins.revenue_growth)}
              </span>
            </div>
          )}
          {fins.earnings_growth !== null && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
              <span style={{ color: '#554400', minWidth: '90px' }}>Earnings Gr.</span>
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

// onNavigate reserved for future quick-links (e.g. GP, NEWS for same ticker)
const DESScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activeTab, setActiveTab] = useState(1)

  const { data, isLoading, isError, isFetching } = useQuery<EquityData>({
    queryKey: ['equity', ticker],
    queryFn: () => fetchEquity(ticker),
    staleTime: 60_000,
  })

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
    border: activeTab === tab ? '1px solid #ff9900' : '1px solid #2a2a2a',
    color: activeTab === tab ? '#ff9900' : '#554400',
    background: 'transparent',
    fontFamily: 'inherit',
    marginLeft: '4px',
  })

  const panelActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontSize: '10px', color: '#554400' }}>
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
        borderBottom: '1px solid #2a2a2a',
        fontSize: '12px',
      }}
    >
      <span style={{ color: '#ff9900', fontWeight: 'bold' }}>
        {ticker} US Equity
      </span>
      <span style={{ color: '#cccccc' }}>{data.company_name}</span>
    </div>
  )

  return (
    <Panel title="DES — SECURITY DESCRIPTION" actions={panelActions}>
      <LoadingBar loading={isLoading || isFetching} />

      {isError ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#ff3333', fontSize: '12px' }}>
          SECURITY UNAVAILABLE — {ticker} NOT FOUND
        </div>
      ) : isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#554400', fontSize: '12px' }}>
          LOADING SECURITY DATA...
        </div>
      ) : data ? (
        <>
          {pageHeader}
          {activeTab === 1 && <OverviewTab data={data} />}
          {activeTab === 2 && (
            <FinancialsTab fins={fins} isLoading={finsLoading} isError={finsError} />
          )}
        </>
      ) : null}
    </Panel>
  )
}

export default DESScreen
