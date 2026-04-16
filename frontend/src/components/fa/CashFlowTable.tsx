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
}

const rows: RowDef[] = [
  { label: 'Operating Cash Flow', key: 'operating_cash_flow', bold: true },
  { label: 'Capex', key: 'capex' },
  { label: 'Free Cash Flow', key: 'free_cash_flow', bold: true, amber: true },
  { label: 'Investing Cash Flow', key: 'investing_cash_flow' },
  { label: 'Financing Cash Flow', key: 'financing_cash_flow' },
  { label: 'Dividends Paid', key: 'dividends_paid' },
  { label: 'Share Repurchases', key: 'share_repurchases' },
]

export default function CashFlowTable({ data }: Props) {
  const periods = data.cash_flow

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
                  ...(row.amber ? { color: C.amber } : {}),
                }}>
                  {row.label}
                </td>
                {periods.map((p) => {
                  const raw = p[row.key] as number | null
                  return (
                    <td key={p.date} style={{
                      ...cellBase,
                      textAlign: 'right',
                      color: row.amber ? C.amber : C.white,
                      fontWeight: row.bold ? 700 : 400,
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