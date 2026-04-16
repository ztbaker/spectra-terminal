// FAScreen — Fundamental Analysis shell
// Data flow: this component owns the React Query fetch and passes `data: FAResponse`
// (or sub-slices) to every sub-component. Sub-components never fetch.
// Agent 4 owns all components under ../fa/*.tsx.
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFA } from '../../lib/api'
import LoadingBar from '../shared/LoadingBar'
import C from '../../lib/colors'
import type { FAResponse } from '../../types'

import OverviewStrip from '../fa/OverviewStrip'
import IncomeTable from '../fa/IncomeTable'
import BalanceTable from '../fa/BalanceTable'
import CashFlowTable from '../fa/CashFlowTable'
import RatiosPanel from '../fa/RatiosPanel'
import ValuationPanel from '../fa/ValuationPanel'

type Tab = 'INCOME' | 'BALANCE' | 'CASH' | 'RATIOS' | 'VALUE'
type Period = 'annual' | 'quarterly'

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'INCOME', label: 'INCOME' },
  { key: 'BALANCE', label: 'BALANCE' },
  { key: 'CASH', label: 'CASH FLOW' },
  { key: 'RATIOS', label: 'RATIOS' },
  { key: 'VALUE', label: 'VALUATION' },
]

// ─── Inline helpers (not reused elsewhere) ────────────────────────────────────

const PeriodToggle: React.FC<{ value: Period; onChange: (p: Period) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: '2px' }}>
    {(['annual', 'quarterly'] as const).map(p => {
      const active = value === p
      return (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            height: '20px',
            padding: '0 8px',
            fontSize: '10px',
            fontFamily: C.fontMono,
            fontWeight: 700,
            letterSpacing: '0.06em',
            border: 'none',
            cursor: 'pointer',
            background: active ? C.amber : C.surface0,
            color: active ? C.surface0 : C.amberDim,
          }}
        >
          {p.toUpperCase()}
        </button>
      )
    })}
  </div>
)

const FATabBar: React.FC<{ value: Tab; onChange: (t: Tab) => void }> = ({ value, onChange }) => (
  <div
    role="tablist"
    style={{
      display: 'flex',
      borderBottom: `1px solid ${C.border0}`,
    }}
  >
    {TABS.map(tab => {
      const active = tab.key === value
      return (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(tab.key)}
          style={{
            background: 'transparent',
            color: active ? C.amber : C.whiteDim,
            border: 'none',
            borderBottom: active ? `2px solid ${C.amber}` : '2px solid transparent',
            padding: '8px 16px',
            fontSize: '11px',
            fontFamily: C.fontDisplay,
            fontWeight: active ? 700 : 400,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.amberMute }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.whiteDim }}
        >
          {tab.label}
        </button>
      )
    })}
  </div>
)

const ErrorRow: React.FC<{ msg: string }> = ({ msg }) => (
  <div style={{
    padding: '8px 12px',
    color: C.red,
    fontSize: '12px',
    fontFamily: C.fontMono,
    background: C.redGlow,
    borderBottom: `1px solid ${C.redDim}`,
  }}>
    {msg}
  </div>
)

// ─── Main screen ─────────────────────────────────────────────────────────────

const FAScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [tab, setTab] = useState<Tab>('INCOME')
  const [period, setPeriod] = useState<Period>('annual')

  const { data, isLoading, error } = useQuery<FAResponse>({
    queryKey: ['fa', ticker, period],
    queryFn: () => fetchFA(ticker, period),
    staleTime: 60_000,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface0, overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px' }}>
        <span style={{ fontFamily: C.fontDisplay, fontWeight: 700, fontSize: '12px', letterSpacing: '0.08em', color: C.amber }}>
          {ticker} FA — FINANCIAL ANALYSIS
        </span>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {data && <OverviewStrip overview={data.overview} ticker={ticker} />}

      <FATabBar value={tab} onChange={setTab} />

      {error && <ErrorRow msg={(error as Error).message} />}

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {data && tab === 'INCOME' && <IncomeTable data={data} />}
        {data && tab === 'BALANCE' && <BalanceTable data={data} />}
        {data && tab === 'CASH' && <CashFlowTable data={data} />}
        {data && tab === 'RATIOS' && <RatiosPanel data={data} />}
        {data && tab === 'VALUE' && <ValuationPanel data={data} />}
      </div>
    </div>
  )
}

export default FAScreen