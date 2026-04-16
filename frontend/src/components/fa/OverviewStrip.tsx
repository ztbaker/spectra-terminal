import React from 'react'
import type { FAOverview } from '../../types'
import C from '../../lib/colors'
import { fmtCurrency } from './_format'

interface Props {
  overview: FAOverview
  ticker: string
}

const dash = '\u2014'

export default function OverviewStrip({ overview, ticker }: Props) {
  const labelStyle: React.CSSProperties = {
    fontSize: '9px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: C.amberMute,
    lineHeight: 1.3,
  }
  const valStyle: React.CSSProperties = {
    fontSize: '13px',
    color: C.white,
    fontFamily: C.fontMono,
    lineHeight: 1.4,
  }

  const price = overview.current_price !== null
    ? `$${overview.current_price.toFixed(2)}`
    : dash
  const low = overview.week52_low !== null ? `$${overview.week52_low.toFixed(2)}` : dash
  const high = overview.week52_high !== null ? `$${overview.week52_high.toFixed(2)}` : dash

  const rangePct = (() => {
    if (overview.current_price === null || overview.week52_low === null || overview.week52_high === null) return null
    const span = overview.week52_high - overview.week52_low
    if (span === 0) return 0.5
    return (overview.current_price - overview.week52_low) / span
  })()

  const mktCap = (() => {
    if (overview.current_price === null || overview.shares_outstanding === null) return null
    return overview.current_price * overview.shares_outstanding
  })()

  const Cell: React.FC<{ lab: string; children: React.ReactNode; wide?: boolean }> = ({ lab, children, wide }) => (
    <div style={{
      padding: '8px 12px',
      borderRight: `1px solid ${C.border0}`,
      flex: wide ? '2 0 0' : '1 0 0',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div style={labelStyle}>{lab}</div>
      <div style={valStyle}>{children}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border0}`, background: C.surface1 }}>
      <Cell lab="" wide>
        <div style={{ ...valStyle, fontSize: '14px', fontWeight: 700, color: C.amber }}>{ticker}</div>
        <div style={{ ...valStyle, fontSize: '12px' }}>{overview.company_name ?? dash}</div>
        <div style={{ fontSize: '10px', color: C.whiteDim, marginTop: 2 }}>
          {[overview.sector, overview.industry].filter(Boolean).join(' / ') || dash}
        </div>
      </Cell>

      <Cell lab="Price">
        <span>{price}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, minWidth: 0 }}>
          <span style={{ fontSize: '10px', color: C.whiteDim, flexShrink: 0 }}>{low}</span>
          <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 16, maxWidth: 60, height: 4, background: C.border1, borderRadius: 2 }}>
            {rangePct !== null && (
              <div style={{
                position: 'absolute',
                top: -2,
                left: `${Math.max(0, Math.min(1, rangePct)) * 100}%`,
                width: 6,
                height: 6,
                borderRadius: 3,
                background: C.amber,
                transform: 'translateX(-50%)',
              }} />
            )}
          </div>
          <span style={{ fontSize: '10px', color: C.whiteDim, flexShrink: 0 }}>{high}</span>
        </div>
      </Cell>

      <Cell lab="Mkt Cap">{fmtCurrency(mktCap)}</Cell>
      <Cell lab="Employees">{overview.employees !== null ? overview.employees.toLocaleString() : dash}</Cell>
      <Cell lab="Beta">{overview.beta !== null ? overview.beta.toFixed(2) : dash}</Cell>
      <Cell lab="Exchange">{overview.exchange ?? dash}</Cell>
    </div>
  )
}