import React from 'react'
import type { FAResponse, FAPeriod } from '../../types'
import { color, font } from '../../lib/theme'
import { fmtCurrency } from './_format'

interface Props {
  data: FAResponse
}

interface RowDef {
  label: string
  key: keyof FAPeriod
  bold?: boolean
  highlight?: boolean
}

const rows: RowDef[] = [
  { label: 'Operating cash flow', key: 'operating_cash_flow', bold: true },
  { label: 'Capex', key: 'capex' },
  { label: 'Free cash flow', key: 'free_cash_flow', bold: true, highlight: true },
  { label: 'Investing cash flow', key: 'investing_cash_flow' },
  { label: 'Financing cash flow', key: 'financing_cash_flow' },
  { label: 'Dividends paid', key: 'dividends_paid' },
  { label: 'Share repurchases', key: 'share_repurchases' },
]

export default function CashFlowTable({ data }: Props) {
  const periods = data.cash_flow

  if (periods.length === 0) {
    return <div style={{ padding: 24, color: color.textTertiary, textAlign: 'center', fontFamily: font.sans }}>No data</div>
  }

  const cellBase: React.CSSProperties = {
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: font.mono,
    whiteSpace: 'nowrap' as const,
    borderRight: `1px solid ${color.borderSubtle}`,
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: font.mono }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${color.borderMedium}` }}>
            <th style={{ ...cellBase, textAlign: 'left', fontSize: '11px', letterSpacing: '0.02em', color: color.textSecondary, fontWeight: 500, fontFamily: font.sans, position: 'sticky' as const, left: 0, background: color.bgBase, zIndex: 2, minWidth: 140 }}>Metric</th>
            {periods.map((p) => (
              <th key={p.date} style={{ ...cellBase, textAlign: 'right', fontSize: '11px', letterSpacing: '0.02em', color: color.textSecondary, fontWeight: 500, fontFamily: font.sans }}>{p.date}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const bg = rowIdx % 2 === 0 ? color.bgBase : color.bgElevated
            return (
              <tr key={row.key} style={{ background: bg }}>
                <td style={{
                  ...cellBase,
                  textAlign: 'left',
                  fontSize: '12px',
                  color: row.highlight ? color.accentPositive : color.textSecondary,
                  fontWeight: row.bold ? 600 : 400,
                  fontFamily: font.sans,
                  position: 'sticky' as const,
                  left: 0,
                  background: bg,
                  zIndex: 1,
                  minWidth: 140,
                }}>
                  {row.label}
                </td>
                {periods.map((p) => {
                  const raw = p[row.key] as number | null
                  return (
                    <td key={p.date} style={{
                      ...cellBase,
                      textAlign: 'right',
                      color: row.highlight ? color.accentPositive : color.textPrimary,
                      fontWeight: row.bold ? 600 : 400,
                    }}>
                      {fmtCurrency(raw)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
