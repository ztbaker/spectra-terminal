import React from 'react'
import type { FAResponse, FAValuation, FAGrowth } from '../../types'
import C from '../../lib/colors'
import { fmtCurrency, fmtPct, fmtMultiple } from './_format'

interface Props {
  data: FAResponse
}

interface ValuationMetric {
  label: string
  key: keyof FAValuation
  fmt: (n: number | null) => string
  interpret: (n: number | null) => { text: string; color: string }
}

function interpretPE(n: number | null): { text: string; color: string } {
  if (n === null) return { text: '\u2014', color: C.whiteDim }
  if (n < 15) return { text: 'attractive', color: C.green }
  if (n <= 25) return { text: 'fair', color: C.amber }
  return { text: 'premium', color: C.red }
}

function interpretEVEBITDA(n: number | null): { text: string; color: string } {
  if (n === null) return { text: '\u2014', color: C.whiteDim }
  if (n < 10) return { text: 'cheap', color: C.green }
  if (n <= 18) return { text: 'fair', color: C.amber }
  return { text: 'rich', color: C.red }
}

function interpretFCFYield(n: number | null): { text: string; color: string } {
  if (n === null) return { text: '\u2014', color: C.whiteDim }
  if (n > 5) return { text: 'strong', color: C.green }
  if (n >= 2) return { text: 'moderate', color: C.amber }
  return { text: 'weak', color: C.red }
}

function interpretDivYield(n: number | null): { text: string; color: string } {
  if (n === null) return { text: 'minimal', color: C.whiteDim }
  if (n > 3) return { text: 'income', color: C.green }
  if (n >= 1) return { text: 'modest', color: C.amber }
  return { text: 'minimal', color: C.whiteDim }
}

function genericInterpret(_label: string, n: number | null): { text: string; color: string } {
  if (n === null) return { text: '\u2014', color: C.whiteDim }
  return { text: `${n.toFixed(2)}`, color: C.white }
}

const metrics: ValuationMetric[] = [
  { label: 'P/E', key: 'pe_ratio', fmt: fmtMultiple, interpret: interpretPE },
  { label: 'Forward P/E', key: 'forward_pe', fmt: fmtMultiple, interpret: (n) => genericInterpret('Forward P/E', n) },
  { label: 'PEG', key: 'peg_ratio', fmt: fmtMultiple, interpret: (n) => genericInterpret('PEG', n) },
  { label: 'P/B', key: 'price_to_book', fmt: fmtMultiple, interpret: (n) => genericInterpret('P/B', n) },
  { label: 'P/S', key: 'price_to_sales', fmt: fmtMultiple, interpret: (n) => genericInterpret('P/S', n) },
  { label: 'EV/EBITDA', key: 'ev_ebitda', fmt: fmtMultiple, interpret: interpretEVEBITDA },
  { label: 'EV/Revenue', key: 'ev_revenue', fmt: fmtMultiple, interpret: (n) => genericInterpret('EV/Rev', n) },
  { label: 'Mkt Cap', key: 'market_cap', fmt: fmtCurrency, interpret: (n) => genericInterpret('Mkt Cap', n) },
  { label: 'EV', key: 'enterprise_value', fmt: fmtCurrency, interpret: (n) => genericInterpret('EV', n) },
  { label: 'Div Yield', key: 'dividend_yield', fmt: fmtPct, interpret: interpretDivYield },
  { label: 'Payout', key: 'payout_ratio', fmt: fmtPct, interpret: (n) => genericInterpret('Payout', n) },
  { label: 'FCF Yield', key: 'fcf_yield', fmt: fmtPct, interpret: interpretFCFYield },
]

function buildQuickTake(v: FAValuation, g: FAGrowth): string[] {
  const bullets: string[] = []

  if (g.revenue_yoy !== null && v.price_to_sales !== null) {
    const growthAdj = g.revenue_yoy > 10 && v.price_to_sales < 5 ? 'growth-adjusted fair' : g.revenue_yoy > 10 ? 'growth premium' : 'value range'
    bullets.push(`Revenue growing ${g.revenue_yoy.toFixed(1)}% YoY with P/S ${v.price_to_sales.toFixed(1)} \u2192 ${growthAdj}`)
  }

  if (v.fcf_yield !== null) {
    const fcfQual = v.fcf_yield > 5 ? 'strong cash returns' : v.fcf_yield >= 2 ? 'moderate cash returns' : 'limited free cash flow'
    bullets.push(`FCF yield ${v.fcf_yield.toFixed(1)}% \u2192 ${fcfQual}`)
  }

  if (g.revenue_yoy !== null && v.ev_ebitda !== null) {
    const levQual = v.ev_ebitda > 18 ? 'elevated' : v.ev_ebitda > 10 ? 'moderate' : 'low'
    bullets.push(`EV/EBITDA ${v.ev_ebitda.toFixed(1)}x \u2192 ${levQual} valuation multiple`)
  }

  return bullets.length > 0 ? bullets : ['Insufficient data for quick take']
}

export default function ValuationPanel({ data }: Props) {
  const v = data.valuation
  const g = data.growth
  const quickTake = buildQuickTake(v, g)

  const cellBase: React.CSSProperties = {
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: C.fontMono,
    whiteSpace: 'nowrap' as const,
    borderRight: `1px solid ${C.border0}`,
  }

  return (
    <div style={{ display: 'flex', gap: 16, padding: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 400px', background: C.surface1, border: `1px solid ${C.border0}`, borderRadius: 4, padding: 12 }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 700, paddingBottom: 4, borderBottom: `1px solid ${C.amber}30`, marginBottom: 8 }}>Valuation Metrics</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.fontMono, fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border1}` }}>
              <th style={{ ...cellBase, textAlign: 'left', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 600 }}>Metric</th>
              <th style={{ ...cellBase, textAlign: 'right', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 600 }}>Value</th>
              <th style={{ ...cellBase, textAlign: 'left', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 600 }}>Signal</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, mi) => {
              const raw = v[m.key] as number | null
              const interp = m.interpret(raw)
              const rowBg = mi % 2 === 0 ? C.surface0 : 'transparent'
              return (
                <tr key={m.key} style={{ background: rowBg }}>
                  <td style={{ ...cellBase, textAlign: 'left', fontSize: '11px', color: C.whiteDim }}>{m.label}</td>
                  <td style={{ ...cellBase, textAlign: 'right', color: C.white, fontWeight: 600 }}>{m.fmt(raw)}</td>
                  <td style={{ ...cellBase, textAlign: 'left', fontSize: '10px', color: interp.color, fontWeight: 600, letterSpacing: '0.02em' }}>
                    {m.key === 'pe_ratio' || m.key === 'ev_ebitda' || m.key === 'fcf_yield' || m.key === 'dividend_yield'
                      ? `${m.label} ${raw === null ? '' : raw.toFixed(1)} \u2014 ${interp.text}`
                      : interp.text}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ flex: '0 0 280px', background: C.surface1, border: `1px solid ${C.border0}`, borderRadius: 4, padding: 12 }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.amberMute, fontWeight: 700, paddingBottom: 4, borderBottom: `1px solid ${C.amber}30`, marginBottom: 8 }}>Quick Take</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: C.fontMono, fontSize: '11px' }}>
          {quickTake.map((bullet, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, lineHeight: 1.5 }}>
              <span style={{ color: C.amber, flexShrink: 0 }}>{'\u2022'}</span>
              <span style={{ color: C.white }}>{bullet}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}