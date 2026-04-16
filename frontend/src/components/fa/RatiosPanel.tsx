import React from 'react'
import type { FAResponse, FARatios } from '../../types'
import C from '../../lib/colors'
import Sparkline from '../shared/Sparkline'
import { fmtPct, fmtMultiple } from './_format'

interface Props {
  data: FAResponse
}

interface MetricDef {
  label: string
  key: keyof FARatios
  isPct?: boolean
}

const sections: { title: string; metrics: MetricDef[] }[] = [
  {
    title: 'Profitability',
    metrics: [
      { label: 'Gross Margin', key: 'gross_margin', isPct: true },
      { label: 'Operating Margin', key: 'operating_margin', isPct: true },
      { label: 'Net Margin', key: 'net_margin', isPct: true },
      { label: 'EBITDA Margin', key: 'ebitda_margin', isPct: true },
      { label: 'ROE', key: 'roe', isPct: true },
      { label: 'ROA', key: 'roa', isPct: true },
      { label: 'ROIC', key: 'roic', isPct: true },
    ],
  },
  {
    title: 'Liquidity',
    metrics: [
      { label: 'Current Ratio', key: 'current_ratio' },
      { label: 'Quick Ratio', key: 'quick_ratio' },
      { label: 'Cash Ratio', key: 'cash_ratio' },
    ],
  },
  {
    title: 'Leverage',
    metrics: [
      { label: 'D/E', key: 'debt_to_equity' },
      { label: 'D/A', key: 'debt_to_assets' },
      { label: 'Interest Coverage', key: 'interest_coverage' },
    ],
  },
  {
    title: 'Efficiency',
    metrics: [
      { label: 'Asset Turnover', key: 'asset_turnover' },
      { label: 'Inventory Turnover', key: 'inventory_turnover' },
      { label: 'Receivables Turnover', key: 'receivables_turnover' },
    ],
  },
]

function DeltaChip({ cur, prev, isPct }: { cur: number | null; prev: number | null; isPct?: boolean }) {
  if (cur === null || prev === null) {
    return <span style={{ fontSize: '10px', color: C.whiteDim }}>{'\u2014'} flat</span>
  }
  const delta = cur - prev
  if (Math.abs(delta) < 0.005) {
    return <span style={{ fontSize: '10px', color: C.whiteDim }}>{'\u2014'} flat</span>
  }
  const sign = delta > 0 ? '+' : ''
  const unit = isPct ? 'pp' : 'x'
  const color = delta > 0 ? C.green : C.red
  const arrow = delta > 0 ? '\u25B2' : '\u25BC'
  return (
    <span style={{ fontSize: '10px', color, fontWeight: 600 }}>
      {arrow} {sign}{isPct ? delta.toFixed(1) : delta.toFixed(2)}{unit}
    </span>
  )
}

export default function RatiosPanel({ data }: Props) {
  const ratios = data.ratios
  if (ratios.length === 0) {
    return <div style={{ padding: 24, color: C.whiteGhost, textAlign: 'center' }}>No data</div>
  }

  const latest = ratios[0]
  const prev = ratios.length > 1 ? ratios[1] : null

  const headerStyle: React.CSSProperties = {
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: C.amberMute,
    fontWeight: 700,
    paddingBottom: 4,
    borderBottom: `1px solid ${C.amber}30`,
    marginBottom: 8,
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 16,
      padding: 8,
    }}>
      {sections.map((sec) => (
        <div key={sec.title} style={{ background: C.surface1, border: `1px solid ${C.border0}`, borderRadius: 4, padding: 12 }}>
          <div style={headerStyle}>{sec.title}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.fontMono, fontSize: '12px' }}>
            <tbody>
              {sec.metrics.map((m, mi) => {
                const val = latest[m.key] as number | null
                const histValues: (number | null)[] = [...ratios].reverse().map((r) => r[m.key] as number | null)
                const prevVal = prev ? (prev[m.key] as number | null) : null
                const isImproving = val !== null && prevVal !== null && val > prevVal
                const rowBg = mi % 2 === 0 ? C.surface0 : 'transparent'
                return (
                  <tr key={m.key} style={{ background: rowBg }}>
                    <td style={{ padding: '4px 6px', fontSize: '11px', color: C.whiteDim, whiteSpace: 'nowrap' as const, width: 140 }}>{m.label}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: isImproving ? C.green : (val !== null && prevVal !== null && val < prevVal) ? C.red : C.white, fontWeight: 600, minWidth: 60 }}>
                      {m.isPct ? fmtPct(val) : fmtMultiple(val)}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center', width: 80 }}>
                      <Sparkline data={histValues} width={70} height={20} color={C.amber} />
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', width: 90 }}>
                      <DeltaChip cur={val} prev={prevVal} isPct={m.isPct} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}