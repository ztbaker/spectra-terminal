import React from 'react'
import type { FAResponse, FAPeriod } from '../../types'
import C from '../../lib/colors'
import { fmtCurrency } from './_format'

interface Props {
  data: FAResponse
}

interface RowDef {
  label: string
  key: keyof FAPeriod
  bold?: boolean
  amber?: boolean
  indent?: boolean
  fmt?: (n: number | null) => string
}

const rows: RowDef[] = [
  { label: 'Total Assets', key: 'total_assets', bold: true },
  { label: 'Current Assets', key: 'current_assets', indent: true },
  { label: 'Cash & Equivalents', key: 'cash_and_equivalents', indent: true },
  { label: 'Receivables', key: 'receivables', indent: true },
  { label: 'Inventory', key: 'inventory', indent: true },
  { label: 'PPE (Net)', key: 'ppe', indent: true },
  { label: 'Goodwill', key: 'goodwill', indent: true },
  { label: 'Total Liabilities', key: 'total_liabilities', bold: true },
  { label: 'Current Liabilities', key: 'current_liabilities', indent: true },
  { label: 'Long-Term Debt', key: 'long_term_debt', indent: true },
  { label: 'Total Debt', key: 'total_debt', indent: true },
  { label: 'Total Equity', key: 'total_equity', bold: true, amber: true },
  { label: 'Shares Outstanding', key: 'shares_outstanding', fmt: (n) => n === null ? '\u2014' : `${n.toLocaleString()} shs` },
]

export default function BalanceTable({ data }: Props) {
  const periods = data.balance_sheet

  if (periods.length === 0) {
    return <div style={{ padding: 24, color: C.whiteGhost, textAlign: 'center' }}>No data</div>
  }

  const cellBase: React.CSSProperties = {
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: C.fontMono,
    whiteSpace: 'nowrap' as const,
    borderRight: `1px solid ${C.border0}`,
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.fontMono }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.amber}20` }}>
            <th style={{ ...cellBase, textAlign: 'left', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 600, position: 'sticky' as const, left: 0, background: C.surface0, zIndex: 2, minWidth: 140 }}>Metric</th>
            {periods.map((p) => (
              <th key={p.date} style={{ ...cellBase, textAlign: 'right', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.whiteDim, fontWeight: 600 }}>{p.date}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const bg = rowIdx % 2 === 0 ? C.surface0 : C.surface1
            return (
              <tr key={row.key} style={{ background: bg }}>
                <td style={{
                  ...cellBase,
                  textAlign: 'left',
                  fontSize: '11px',
                  color: C.whiteDim,
                  fontWeight: row.bold ? 700 : 400,
                  position: 'sticky' as const,
                  left: 0,
                  background: bg,
                  zIndex: 1,
                  minWidth: 140,
                  paddingLeft: row.indent ? 20 : 8,
                  ...(row.amber ? { color: C.amber } : {}),
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
                      color: row.amber ? C.amber : C.white,
                      fontWeight: row.bold ? 700 : 400,
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