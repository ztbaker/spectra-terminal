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
  fmt?: (n: number | null) => string
}

const rows: RowDef[] = [
  { label: 'Total revenue', key: 'total_revenue' },
  { label: 'Cost of revenue', key: 'cost_of_revenue' },
  { label: 'Gross profit', key: 'gross_profit', bold: true },
  { label: 'Operating expense', key: 'operating_expense' },
  { label: 'Operating income', key: 'operating_income', bold: true },
  { label: 'EBITDA', key: 'ebitda' },
  { label: 'Interest expense', key: 'interest_expense' },
  { label: 'Pretax income', key: 'pretax_income' },
  { label: 'Tax provision', key: 'tax_provision' },
  { label: 'Net income', key: 'net_income', bold: true, highlight: true },
  { label: 'Diluted EPS', key: 'diluted_eps', fmt: (n) => n === null ? '\u2014' : n.toFixed(2) },
  { label: 'Basic EPS', key: 'basic_eps', fmt: (n) => n === null ? '\u2014' : n.toFixed(2) },
]

export default function IncomeTable({ data }: Props) {
  const periods = data.income_statement

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
          {deltas && (
            <>
              <tr style={{ height: 4 }} />
              <tr>
                <td colSpan={periods.length + 1} style={{ ...cellBase, fontSize: '11px', letterSpacing: '0.02em', color: color.textSecondary, fontWeight: 500, fontFamily: font.sans, paddingTop: 10, borderBottom: `1px solid ${color.borderMedium}` }}>
                  Period-over-period change
                </td>
              </tr>
              {(['revDelta', 'niDelta', 'epsDelta'] as const).map((deltaKey, di) => {
                const dLabels = ['Revenue \u0394%', 'Net income \u0394%', 'EPS \u0394%']
                return (
                  <tr key={deltaKey} style={{ background: di % 2 === 0 ? color.bgBase : color.bgElevated }}>
                    <td style={{ ...cellBase, textAlign: 'left', fontSize: '12px', color: color.textSecondary, fontFamily: font.sans, position: 'sticky' as const, left: 0, background: di % 2 === 0 ? color.bgBase : color.bgElevated, zIndex: 1, minWidth: 140 }}>
                      {dLabels[di]}
                    </td>
                    {deltas.map((d, ci) => {
                      const v = d[deltaKey]
                      return (
                        <td key={ci} style={{ ...cellBase, textAlign: 'right', color: v !== null ? (v > 0 ? color.accentPositive : v < 0 ? color.accentNegative : color.textSecondary) : color.textSecondary, fontWeight: 600 }}>
                          {v === null ? '\u2014' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                        </td>
                      )
                    })}
                    {periods.length - deltas.length > 0 && Array.from({ length: periods.length - deltas.length }).map((_, ei) => (
                      <td key={`empty-${ei}`} style={{ ...cellBase, textAlign: 'right', color: color.textTertiary }}>{'\u2014'}</td>
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
