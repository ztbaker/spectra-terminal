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
  indent?: boolean
  fmt?: (n: number | null) => string
}

const rows: RowDef[] = [
  { label: 'Total assets', key: 'total_assets', bold: true },
  { label: 'Current assets', key: 'current_assets', indent: true },
  { label: 'Cash & equivalents', key: 'cash_and_equivalents', indent: true },
  { label: 'Receivables', key: 'receivables', indent: true },
  { label: 'Inventory', key: 'inventory', indent: true },
  { label: 'PPE (net)', key: 'ppe', indent: true },
  { label: 'Goodwill', key: 'goodwill', indent: true },
  { label: 'Total liabilities', key: 'total_liabilities', bold: true },
  { label: 'Current liabilities', key: 'current_liabilities', indent: true },
  { label: 'Long-term debt', key: 'long_term_debt', indent: true },
  { label: 'Total debt', key: 'total_debt', indent: true },
  { label: 'Total equity', key: 'total_equity', bold: true, highlight: true },
  { label: 'Shares outstanding', key: 'shares_outstanding', fmt: (n) => n === null ? '\u2014' : `${n.toLocaleString()} shs` },
]

export default function BalanceTable({ data }: Props) {
  const periods = data.balance_sheet

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
                  paddingLeft: row.indent ? 20 : 8,
                }}>
                  {row.label}
                </td>
                {periods.map((p) => {
                  const raw = p[row.key] as number | null
                  const fmt = row.fmt ?? fmtCurrency
                  return (
                    <td key={p.date} style={{
                      ...cellBase,
                      textAlign: 'right',
                      color: row.highlight ? color.accentPositive : color.textPrimary,
                      fontWeight: row.bold ? 600 : 400,
                    }}>
                      {fmt(raw)}
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
