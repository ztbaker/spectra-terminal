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
  fmt?: (n: number | null) => string
}

const rows: RowDef[] = [
  { label: 'Total Revenue', key: 'total_revenue' },
  { label: 'Cost of Revenue', key: 'cost_of_revenue' },
  { label: 'Gross Profit', key: 'gross_profit', bold: true },
  { label: 'Operating Expense', key: 'operating_expense' },
  { label: 'Operating Income', key: 'operating_income', bold: true },
  { label: 'EBITDA', key: 'ebitda' },
  { label: 'Interest Expense', key: 'interest_expense' },
  { label: 'Pretax Income', key: 'pretax_income' },
  { label: 'Tax Provision', key: 'tax_provision' },
  { label: 'Net Income', key: 'net_income', bold: true, amber: true },
  { label: 'Diluted EPS', key: 'diluted_eps', fmt: (n) => n === null ? '\u2014' : n.toFixed(2) },
  { label: 'Basic EPS', key: 'basic_eps', fmt: (n) => n === null ? '\u2014' : n.toFixed(2) },
]

export default function IncomeTable({ data }: Props) {
  const periods = data.income_statement

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

  const deltas = periods.length > 1
    ? (() => {
        const out: { revDelta: number | null; niDelta: number | null; epsDelta: number | null }[] = []
        for (let i = 0; i < periods.length - 1; i++) {
          const cur = periods[i]
          const prev = periods[i + 1]
          const pctDelta = (c: number | null, p: number | null): number | null => {
            if (c === null || p === null || p === 0) return null
            return ((c - p) / Math.abs(p)) * 100
          }
          out.push({
            revDelta: pctDelta(cur.total_revenue, prev.total_revenue),
            niDelta: pctDelta(cur.net_income, prev.net_income),
            epsDelta: pctDelta(cur.diluted_eps, prev.diluted_eps),
          })
        }
        return out
      })()
    : null

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
          {deltas && (
            <>
              <tr style={{ height: 4 }} />
              <tr>
                <td colSpan={periods.length + 1} style={{ ...cellBase, fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 600, paddingTop: 10, borderBottom: `1px solid ${C.border1}` }}>
                  Period-over-Period Change
                </td>
              </tr>
              {(['revDelta', 'niDelta', 'epsDelta'] as const).map((deltaKey, di) => {
                const dLabels = ['Revenue \u0394%', 'NI \u0394%', 'EPS \u0394%']
                return (
                  <tr key={deltaKey} style={{ background: di % 2 === 0 ? C.surface0 : C.surface1 }}>
                    <td style={{ ...cellBase, textAlign: 'left', fontSize: '11px', color: C.whiteDim, position: 'sticky' as const, left: 0, background: di % 2 === 0 ? C.surface0 : C.surface1, zIndex: 1, minWidth: 140 }}>
                      {dLabels[di]}
                    </td>
                    {deltas.map((d, ci) => {
                      const v = d[deltaKey]
                      return (
                        <td key={ci} style={{ ...cellBase, textAlign: 'right', color: v !== null ? (v > 0 ? C.green : v < 0 ? C.red : C.whiteDim) : C.whiteDim, fontWeight: 600 }}>
                          {v === null ? '\u2014' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                        </td>
                      )
                    })}
                    {periods.length - deltas.length > 0 && Array.from({ length: periods.length - deltas.length }).map((_, ei) => (
                      <td key={`empty-${ei}`} style={{ ...cellBase, textAlign: 'right', color: C.whiteGhost }}>{'\u2014'}</td>
                    ))}
                  </tr>
                )
              })}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}