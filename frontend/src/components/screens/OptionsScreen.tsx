import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  LineSeries,
  CrosshairMode,
  type IChartApi,
} from 'lightweight-charts'
import theme from '../../lib/theme'
const { color, font } = theme
import { fetchOptions, fetchOptionsSurface, fetchOptionsTermStructure, fetchOptionsUnusual } from '../../lib/api'
import type { OptionContract, OptionsExpiry } from '../../types'
import TabBar from '../shared/TabBar'
import DataGrid from '../shared/DataGrid'
import type { DataGridColumn } from '../shared/DataGrid'
import LoadingBar from '../shared/LoadingBar'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(2)
}

function fmtIV(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return (v * 100).toFixed(1) + '%'
}

function fmtDelta(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(3)
}

function fmtGamma(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(4)
}

function fmtTheta(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(4)
}

function fmtVega(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(4)
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString()
}

// ─── Merge calls+puts by strike into sorted rows ──────────────────────────────

interface MergedRow {
  strike: number
  call: OptionContract | null
  put: OptionContract | null
}

function mergeStrikes(expiry: OptionsExpiry): MergedRow[] {
  const map = new Map<number, MergedRow>()

  for (const c of expiry.calls) {
    if (c.strike === null) continue
    const row = map.get(c.strike) ?? { strike: c.strike, call: null, put: null }
    row.call = c
    map.set(c.strike, row)
  }

  for (const p of expiry.puts) {
    if (p.strike === null) continue
    const row = map.get(p.strike) ?? { strike: p.strike, call: null, put: null }
    row.put = p
    map.set(p.strike, row)
  }

  return Array.from(map.values()).sort((a, b) => a.strike - b.strike)
}

// ─── Color interpolation for IV surface ────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function lerpColor(t: number): string {
  const lowRgb = hexToRgb('#1a2a4a')
  const midRgb = hexToRgb('#E8EAED')
  const highRgb = hexToRgb('#FF5252')

  let r: number, g: number, b: number
  if (t <= 0.5) {
    const s = t / 0.5
    r = lowRgb[0] + (midRgb[0] - lowRgb[0]) * s
    g = lowRgb[1] + (midRgb[1] - lowRgb[1]) * s
    b = lowRgb[2] + (midRgb[2] - lowRgb[2]) * s
  } else {
    const s = (t - 0.5) / 0.5
    r = midRgb[0] + (highRgb[0] - midRgb[0]) * s
    g = midRgb[1] + (highRgb[1] - midRgb[1]) * s
    b = midRgb[2] + (highRgb[2] - midRgb[2]) * s
  }
  return rgbToHex(r, g, b)
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'CHAIN', label: 'CHAIN' },
  { key: 'SURFACE', label: 'SURFACE' },
  { key: 'TERM', label: 'TERM' },
  { key: 'UNUSUAL', label: 'UNUSUAL' },
  { key: 'FLOW', label: 'FLOW' },
]

// ─── Unusual activity row type ────────────────────────────────────────────────

interface UnusualRow {
  [key: string]: unknown
  id: string
  strike: number | null
  expiry: string
  type: string
  volume: number | null
  open_interest: number | null
  vol_oi_ratio: number | null
  last_price: number | null
  implied_volatility: number | null
}

const unusualColumns: DataGridColumn<UnusualRow>[] = [
  { key: 'strike', header: 'STRIKE', type: 'number', sortable: true, width: '80px' },
  { key: 'expiry', header: 'EXPIRY', type: 'text', align: 'center', sortable: true, width: '100px' },
  { key: 'type', header: 'TYPE', type: 'text', align: 'center', width: '50px',
    render: (row: UnusualRow) => (
      <span style={{
        color: row.type === 'C' || row.type === 'call' ? color.accentPositive : color.accentNegative,
        fontWeight: 700,
        fontFamily: font.mono,
      }}>
        {(row.type === 'call' ? 'C' : row.type === 'put' ? 'P' : row.type).toUpperCase()}
      </span>
    ),
  },
  { key: 'volume', header: 'VOL', type: 'number', sortable: true, width: '80px' },
  { key: 'open_interest', header: 'OI', type: 'number', sortable: true, width: '80px' },
  { key: 'vol_oi_ratio', header: 'VOL/OI', type: 'number', sortable: true, width: '80px',
    render: (row: UnusualRow) => {
      const v = row.vol_oi_ratio
      if (v === null || v === undefined) return '—'
      return <span style={{ color: v > 5 ? color.textPrimary : color.textPrimary, fontWeight: v > 5 ? 700 : 400 }}>{v.toFixed(2)}x</span>
    },
  },
  { key: 'last_price', header: 'LAST', type: 'currency', width: '70px' },
  { key: 'implied_volatility', header: 'IV', type: 'number', width: '70px',
    render: (row: UnusualRow) => {
      const v = row.implied_volatility
      if (v === null || v === undefined) return '—'
      return <span style={{ color: color.accentInfo }}>{(v * 100).toFixed(1)}%</span>
    },
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN TAB
// ═══════════════════════════════════════════════════════════════════════════════

const ChainTab: React.FC<{
  ticker: string
  data: { expiries: OptionsExpiry[]; spot: number | null; call_put_ratio?: number | null } | undefined
  isLoading: boolean
}> = ({ ticker, data, isLoading }) => {
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null)

  const expiries = data?.expiries?.slice(0, 6) ?? []
  const activeExpiry =
    expiries.find(e => e.expiry === selectedExpiry) ?? expiries[0] ?? null
  const spot = data?.spot ?? null
  const rows = activeExpiry ? mergeStrikes(activeExpiry) : []

  let atmIdx: number | null = null
  if (spot !== null && rows.length > 0) {
    const idx = rows.findIndex(r => r.strike >= spot)
    atmIdx = idx === -1 ? rows.length : idx
  }

  const expiryTabs = expiries.map(e => ({
    key: e.expiry,
    label: e.expiry,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <LoadingBar loading={isLoading} />

      {spot !== null && (
        <div style={{
          padding: '8px 12px',
          background: 'transparent',
          borderBottom: `1px solid ${color.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{
            color: color.textPrimary,
            fontSize: '11px',
            fontFamily: font.sans,
            fontWeight: 700,
          }}>
            SPOT
          </span>
          <span style={{
            color: color.textPrimary,
            fontSize: '18px',
            fontFamily: font.mono,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
          }}>
            ${spot.toFixed(2)}
          </span>
          <span style={{
            color: color.textTertiary,
            fontSize: '11px',
            fontFamily: font.mono,
            marginLeft: '8px',
          }}>
            {ticker}
          </span>
          {data?.call_put_ratio !== null && data?.call_put_ratio !== undefined && (
            <span style={{
              color: color.textSecondary,
              fontSize: '11px',
              fontFamily: font.mono,
              marginLeft: '16px',
            }}>
              C/P VOL: <span style={{
                color: data.call_put_ratio > 1 ? color.accentPositive : data.call_put_ratio < 1 ? color.accentNegative : color.textPrimary,
                fontWeight: 700,
              }}>{data.call_put_ratio.toFixed(3)}</span>
            </span>
          )}
        </div>
      )}

      {expiryTabs.length > 0 && (
        <div style={{ padding: '4px 8px', borderBottom: `1px solid ${color.borderSubtle}`, background: 'transparent' }}>
          <TabBar
            tabs={expiryTabs}
            activeKey={activeExpiry?.expiry ?? ''}
            onChange={setSelectedExpiry}
            variant="pill"
          />
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeExpiry && rows.length > 0 ? (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '11px',
            fontFamily: font.mono,
          }}>
            <colgroup>
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '52px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '64px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '50px' }} />
              <col style={{ minWidth: '52px' }} />
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '48px' }} />
              <col style={{ minWidth: '48px' }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
                <th style={{ ...thStyle, color: color.accentInfo }}>{'\u0394'}</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>{'\u0393'}</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>{'\u0398'}</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>V</th>
                <th style={thStyle}>IV</th>
                <th style={thStyle}>OI</th>
                <th style={thStyle}>VOL</th>
                <th style={thStyle}>ASK</th>
                <th style={thStyle}>BID</th>
                <th style={thStyle}>LAST</th>
                <th style={{ ...thStyle, textAlign: 'center' as const, color: color.textPrimary, background: 'transparent' }}>STRIKE</th>
                <th style={thStyle}>LAST</th>
                <th style={thStyle}>BID</th>
                <th style={thStyle}>ASK</th>
                <th style={thStyle}>VOL</th>
                <th style={thStyle}>OI</th>
                <th style={thStyle}>IV</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>V</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>{'\u0398'}</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>{'\u0393'}</th>
                <th style={{ ...thStyle, color: color.accentInfo }}>{'\u0394'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isAtm = atmIdx !== null && idx === atmIdx
                const callItm = row.call?.in_the_money ?? false
                const putItm = row.put?.in_the_money ?? false

                let rowBg: string = idx % 2 === 0 ? color.bgElevated : color.bgSurface
                if (callItm && !putItm) rowBg = color.accentPositiveDim
                else if (putItm && !callItm) rowBg = color.accentNegativeDim
                if (isAtm) rowBg = color.bgActive

                const atmBorder = isAtm
                  ? { borderLeft: `3px solid ${color.textPrimary}`, borderRight: `3px solid ${color.textPrimary}` }
                  : {}

                return (
                  <tr key={row.strike} style={{ background: rowBg, ...atmBorder }}>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtDelta(row.call?.delta)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtGamma(row.call?.gamma)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtTheta(row.call?.theta)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtVega(row.call?.vega)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtIV(row.call?.implied_volatility)}</td>
                    <td style={tdStyle}>{fmtInt(row.call?.open_interest)}</td>
                    <td style={tdStyle}>{fmtInt(row.call?.volume)}</td>
                    <td style={{ ...tdStyle, color: color.textSecondary }}>{fmtPrice(row.call?.ask)}</td>
                    <td style={{ ...tdStyle, color: color.textSecondary }}>{fmtPrice(row.call?.bid)}</td>
                    <td style={tdStyle}>{fmtPrice(row.call?.last_price)}</td>

                    <td style={{
                      textAlign: 'center' as const,
                      color: color.textPrimary,
                      fontSize: '12px',
                      fontWeight: 700,
                      background: 'transparent',
                      borderLeft: `1px solid ${color.borderSubtle}`,
                      borderRight: `1px solid ${color.borderSubtle}`,
                      padding: '2px 4px',
                      whiteSpace: 'nowrap' as const,
                    }}>
                      {isAtm && (
                        <span style={{ color: color.textPrimary, fontSize: '8px', marginRight: '3px', verticalAlign: 'super' }}>
                          {'\u25B6'}
                        </span>
                      )}
                      {row.strike.toFixed(0)}
                    </td>

                    <td style={tdStyle}>{fmtPrice(row.put?.last_price)}</td>
                    <td style={{ ...tdStyle, color: color.textSecondary }}>{fmtPrice(row.put?.bid)}</td>
                    <td style={{ ...tdStyle, color: color.textSecondary }}>{fmtPrice(row.put?.ask)}</td>
                    <td style={tdStyle}>{fmtInt(row.put?.volume)}</td>
                    <td style={tdStyle}>{fmtInt(row.put?.open_interest)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtIV(row.put?.implied_volatility)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtVega(row.put?.vega)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtTheta(row.put?.theta)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtGamma(row.put?.gamma)}</td>
                    <td style={{ ...tdStyle, color: color.accentInfo }}>{fmtDelta(row.put?.delta)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary, fontSize: '12px', fontFamily: font.mono }}>
            {isLoading ? 'Loading chain data...' : `No options data available for ${ticker}`}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared table cell/header styles ──────────────────────────────────────────

const thStyle: React.CSSProperties = {
  background: 'transparent',
  color: color.textSecondary,
  padding: '4px 4px',
  textAlign: 'right',
  fontWeight: 500,
  fontSize: '10px',
  fontFamily: font.mono,
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  borderBottom: `1px solid ${color.borderSubtle}`,
}

const tdStyle: React.CSSProperties = {
  padding: '2px 4px',
  textAlign: 'right',
  color: color.textPrimary,
  fontSize: '11px',
  fontFamily: font.mono,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  borderBottom: `1px solid ${color.borderSubtle}`,
}

// ═══════════════════════════════════════════════════════════════════════════════
// SURFACE TAB (IV heatmap)
// ═══════════════════════════════════════════════════════════════════════════════

const SurfaceTab: React.FC<{
  ticker: string
}> = ({ ticker }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['options-surface', ticker],
    queryFn: () => fetchOptionsSurface(ticker),
    staleTime: 60_000,
    enabled: !!ticker,
  })

  const [hoveredCell, setHoveredCell] = useState<{ expiry: string; strike: number; iv: number | null } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerWidth(e.contentRect.width)
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const surface = data?.surface
  const expiries: string[] = surface?.expiries ?? []
  const strikes: number[] = surface?.strikes ?? []
  const ivGrid: (number | null)[][] = surface?.iv ?? []

  const { ivMin, ivMax } = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const row of ivGrid) {
      for (const v of row) {
        if (v !== null && v !== undefined) {
          if (v < min) min = v
          if (v > max) max = v
        }
      }
    }
    if (!isFinite(min)) return { ivMin: 0, ivMax: 1 }
    return { ivMin: min, ivMax: max }
  }, [ivGrid])

  const cellWidth = strikes.length > 0 ? Math.max(containerWidth / strikes.length, 30) : 30
  const cellHeight = 24
  const labelWidth = 90

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <LoadingBar loading />
        <span style={{ color: color.textSecondary, fontSize: '12px', fontFamily: font.mono, marginTop: '12px', display: 'inline-block' }}>
          Loading IV surface...
        </span>
      </div>
    )
  }

  if (isError || !surface || expiries.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary, fontSize: '12px', fontFamily: font.mono }}>
        {isError ? 'Error loading IV surface data' : `No IV surface available for ${ticker}`}
      </div>
    )
  }

  const totalWidth = labelWidth + strikes.length * cellWidth
  const totalHeight = 30 + expiries.length * cellHeight

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0 8px 0',
        borderBottom: `1px solid ${color.borderSubtle}`,
        marginBottom: '8px',
      }}>
        <span style={{ color: color.textSecondary, fontSize: '11px', fontFamily: font.sans, fontWeight: 600 }}>
          IMPLIED VOLATILITY SURFACE
        </span>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.mono }}>
          {ticker} | {expiries.length} expiries x {strikes.length} strikes
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.mono }}>
          Low {(ivMin * 100).toFixed(0)}%
        </span>
        <div style={{ display: 'flex', height: '10px', borderRadius: '2px', overflow: 'hidden' }}>
          {Array.from({ length: 20 }).map((_, i) => {
            const t = i / 19
            return <div key={i} style={{ width: '12px', height: '10px', background: lerpColor(t) }} />
          })}
        </div>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.mono }}>
          High {(ivMax * 100).toFixed(0)}%
        </span>
      </div>

      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <svg width={totalWidth} height={totalHeight} style={{ display: 'block' }}>
          {strikes.map((strike, i) => (
            <text
              key={`strike-${i}`}
              x={labelWidth + i * cellWidth + cellWidth / 2}
              y={18}
              textAnchor="middle"
              fill={color.textSecondary}
              fontSize="9"
              fontFamily={font.mono}
            >
              {strike.toFixed(0)}
            </text>
          ))}

          {expiries.map((expiry, rowIdx) => {
            const ivRow = ivGrid[rowIdx] ?? []
            return (
              <g key={expiry}>
                <text
                  x={labelWidth - 6}
                  y={30 + rowIdx * cellHeight + cellHeight / 2 + 4}
                  textAnchor="end"
                  fill={color.textSecondary}
                  fontSize="9"
                  fontFamily={font.mono}
                >
                  {expiry}
                </text>
                {strikes.map((strike, colIdx) => {
                  const iv = ivRow[colIdx]
                  const t = iv !== null && iv !== undefined && ivMax > ivMin
                    ? (iv - ivMin) / (ivMax - ivMin)
                    : 0
                  const fill = iv !== null && iv !== undefined ? lerpColor(t) : color.bgSurface
                  const isHovered = hoveredCell?.expiry === expiry && hoveredCell?.strike === strike

                  return (
                    <rect
                      key={`${expiry}-${strike}`}
                      x={labelWidth + colIdx * cellWidth}
                      y={30 + rowIdx * cellHeight}
                      width={cellWidth}
                      height={cellHeight}
                      fill={fill}
                      stroke={isHovered ? color.textPrimary : color.bgBase}
                      strokeWidth={isHovered ? 1.5 : 0.5}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredCell({ expiry, strike, iv })}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>

        {hoveredCell && hoveredCell.iv !== null && (
          <div style={{
            position: 'absolute',
            left: Math.min(labelWidth + strikes.indexOf(hoveredCell.strike) * cellWidth + cellWidth, totalWidth - 140),
            top: Math.min(30 + expiries.indexOf(hoveredCell.expiry) * cellHeight - 28, totalHeight - 28),
            background: 'transparent',
            border: `1px solid ${color.borderMedium}`,
            padding: '4px 8px',
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: 10,
            fontSize: '10px',
            fontFamily: font.mono,
          }}>
            <span style={{ color: color.textPrimary }}>K={hoveredCell.strike.toFixed(0)}</span>
            <span style={{ color: color.textSecondary }}> | </span>
            <span style={{ color: color.textSecondary }}>{hoveredCell.expiry}</span>
            <span style={{ color: color.textSecondary }}> | </span>
            <span style={{ color: color.accentInfo }}>IV={(hoveredCell.iv * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERM TAB (ATM IV term structure chart)
// ═══════════════════════════════════════════════════════════════════════════════

const TermTab: React.FC<{
  ticker: string
}> = ({ ticker }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['options-term', ticker],
    queryFn: () => fetchOptionsTermStructure(ticker),
    staleTime: 60_000,
    enabled: !!ticker,
  })

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const termStructure: { expiry: string; atm_iv: number | null }[] = data?.term_structure ?? []

  useEffect(() => {
    if (!chartContainerRef.current) return
    if (termStructure.length === 0) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: color.bgBase },
        textColor: color.textSecondary,
        fontFamily: font.mono,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: color.accentInfo, width: 1, style: 2, labelBackgroundColor: color.bgElevated },
        horzLine: { color: color.accentInfo, width: 1, style: 2, labelBackgroundColor: color.bgElevated },
      },
      rightPriceScale: {
        borderColor: color.borderSubtle,
        textColor: color.textSecondary,
      },
      timeScale: {
        borderColor: color.borderSubtle,
        timeVisible: false,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    })

    chartRef.current = chart

    const series = chart.addSeries(LineSeries, {
      color: color.accentInfo,
      lineWidth: 2,
    })

    const chartData = termStructure
      .filter(p => p.atm_iv !== null && p.atm_iv !== undefined)
      .map((p) => {
        return {
          time: p.expiry as unknown as import('lightweight-charts').Time,
          value: (p.atm_iv as number) * 100,
        }
      })
      .sort((a, b) => (a.time as string).localeCompare(b.time as string))

    if (chartData.length > 0) {
      series.setData(chartData)
    }

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height })
      }
    })
    ro.observe(chartContainerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [termStructure])

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <LoadingBar loading />
        <span style={{ color: color.textSecondary, fontSize: '12px', fontFamily: font.mono, marginTop: '12px', display: 'inline-block' }}>
          Loading term structure...
        </span>
      </div>
    )
  }

  if (isError || termStructure.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary, fontSize: '12px', fontFamily: font.mono }}>
        {isError ? 'Error loading term structure data' : `No term structure available for ${ticker}`}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0 8px 0',
        borderBottom: `1px solid ${color.borderSubtle}`,
        marginBottom: '4px',
      }}>
        <span style={{ color: color.textSecondary, fontSize: '11px', fontFamily: font.sans, fontWeight: 600 }}>
          ATM IV TERM STRUCTURE
        </span>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.mono }}>
          {ticker} | {termStructure.length} expiries
        </span>
      </div>

      <div style={{ display: 'flex', gap: '16px', padding: '6px 0' }}>
        {termStructure.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: color.textSecondary, fontSize: '9px', fontFamily: font.sans, letterSpacing: '0.05em' }}>NEAREST</span>
              <span style={{ color: color.accentInfo, fontSize: '13px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                {termStructure[0].atm_iv !== null ? `${(termStructure[0].atm_iv * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: color.textSecondary, fontSize: '9px', fontFamily: font.sans, letterSpacing: '0.05em' }}>FURTHEST</span>
              <span style={{ color: color.accentInfo, fontSize: '13px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                {termStructure[termStructure.length - 1]!.atm_iv !== null ? `${(termStructure[termStructure.length - 1]!.atm_iv! * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
            {(() => {
              const validIVs = termStructure.filter(p => p.atm_iv !== null).map(p => p.atm_iv as number)
              const maxIV = validIVs.length > 0 ? Math.max(...validIVs) : null
              const minIV = validIVs.length > 0 ? Math.min(...validIVs) : null
              return (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: color.textSecondary, fontSize: '9px', fontFamily: font.sans, letterSpacing: '0.05em' }}>HIGH</span>
                    <span style={{ color: color.textPrimary, fontSize: '13px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {maxIV !== null ? `${(maxIV * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: color.textSecondary, fontSize: '9px', fontFamily: font.sans, letterSpacing: '0.05em' }}>LOW</span>
                    <span style={{ color: color.accentInfo, fontSize: '13px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {minIV !== null ? `${(minIV * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </>
              )
            })()}
          </>
        )}
      </div>

      <div ref={chartContainerRef} style={{ flex: 1, minHeight: '200px' }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNUSUAL TAB
// ═══════════════════════════════════════════════════════════════════════════════

const UnusualTab: React.FC<{
  ticker: string
}> = ({ ticker }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['options-unusual', ticker],
    queryFn: () => fetchOptionsUnusual(ticker),
    staleTime: 60_000,
    enabled: !!ticker,
  })

  const unusual: Array<Record<string, unknown>> = data?.unusual ?? []

  const rows: UnusualRow[] = unusual.map((item: Record<string, unknown>, idx: number) => ({
    id: `${(item.strike as number) ?? 'x'}-${item.expiration as string}-${item.type as string}-${idx}`,
    strike: (item.strike as number) ?? null,
    expiry: (item.expiration as string) ?? '',
    type: (item.type as string) ?? '',
    volume: (item.volume as number) ?? null,
    open_interest: (item.open_interest as number) ?? null,
    vol_oi_ratio: (item.vol_oi_ratio as number) ?? null,
    last_price: (item.last_price as number) ?? null,
    implied_volatility: (item.implied_volatility as number) ?? null,
  }))

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <LoadingBar loading />
        <span style={{ color: color.textSecondary, fontSize: '12px', fontFamily: font.mono, marginTop: '12px', display: 'inline-block' }}>
          Loading unusual activity...
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0 8px 0',
        borderBottom: `1px solid ${color.borderSubtle}`,
        marginBottom: '8px',
      }}>
        <span style={{ color: color.textSecondary, fontSize: '11px', fontFamily: font.sans, fontWeight: 600 }}>
          UNUSUAL OPTIONS ACTIVITY
        </span>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.mono }}>
          {ticker} | {rows.length} alerts | VOL/OI {'>'} 3x
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {isError ? (
          <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary, fontSize: '12px', fontFamily: font.mono }}>
            Error loading unusual activity data
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: color.textTertiary, fontSize: '12px', fontFamily: font.mono }}>
            No unusual activity detected for {ticker}
          </div>
        ) : (
          <DataGrid<UnusualRow>
            columns={unusualColumns}
            data={rows as unknown as UnusualRow[]}
            keyField="id"
            maxHeight="100%"
            stickyHeader
            rowAccent={(row: UnusualRow) => {
              const ratio = row.vol_oi_ratio
              if (ratio !== null && ratio > 5) return 'highlight'
              if (row.type === 'C' || row.type === 'call') return 'success'
              return 'danger'
            }}
            emptyMessage={`No unusual activity for ${ticker}`}
          />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW TAB (placeholder)
// ═══════════════════════════════════════════════════════════════════════════════

const FlowTab: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '12px',
    padding: '48px',
  }}>
    <span style={{
      color: color.textTertiary,
      fontSize: '20px',
      fontFamily: font.sans,
      fontWeight: 700,
    }}>
      COMING SOON
    </span>
    <span style={{
      color: color.textTertiary,
      fontSize: '12px',
      fontFamily: font.mono,
      textAlign: 'center',
      maxWidth: '360px',
      lineHeight: '1.6',
    }}>
      Options flow data will be available in a future release
    </span>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN OPTIONS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

const OptionsScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [activeTab, setActiveTab] = useState('CHAIN')

  const { data: chainData, isLoading: chainLoading } = useQuery({
    queryKey: ['options', ticker],
    queryFn: () => fetchOptions(ticker),
    staleTime: 60_000,
    enabled: !!ticker,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'transparent',
        borderBottom: `1px solid ${color.borderSubtle}`,
        flexShrink: 0,
      }}>
        <span style={{
          color: color.textPrimary,
          fontSize: '13px',
          fontFamily: font.sans,
          fontWeight: 700,
        }}>
          OPTIONS — {ticker}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {chainData?.spot !== null && chainData?.spot !== undefined && (
            <span style={{
              color: color.textPrimary,
              fontSize: '12px',
              fontFamily: font.mono,
              fontVariantNumeric: 'tabular-nums',
            }}>
              SPOT: <span style={{ color: color.textPrimary, fontWeight: 700 }}>${chainData!.spot!.toFixed(2)}</span>
            </span>
          )}
          {chainData?.call_put_ratio !== null && chainData?.call_put_ratio !== undefined && (
            <span style={{
              color: color.textSecondary,
              fontSize: '12px',
              fontFamily: font.mono,
              fontVariantNumeric: 'tabular-nums',
            }}>
              C/P RATIO: <span style={{
                color: chainData!.call_put_ratio! > 1 ? color.accentPositive : chainData!.call_put_ratio! < 1 ? color.accentNegative : color.textPrimary,
                fontWeight: 700,
              }}>{chainData!.call_put_ratio!.toFixed(3)}</span>
            </span>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, background: 'transparent' }}>
        <TabBar
          tabs={TABS}
          activeKey={activeTab}
          onChange={setActiveTab}
          variant="underline"
        />
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'CHAIN' && (
          <ChainTab
            ticker={ticker}
            data={chainData ? { expiries: chainData.expiries, spot: chainData.spot, call_put_ratio: chainData.call_put_ratio } : undefined}
            isLoading={chainLoading}
          />
        )}
        {activeTab === 'SURFACE' && <SurfaceTab ticker={ticker} />}
        {activeTab === 'TERM' && <TermTab ticker={ticker} />}
        {activeTab === 'UNUSUAL' && <UnusualTab ticker={ticker} />}
        {activeTab === 'FLOW' && <FlowTab />}
      </div>
    </div>
  )
}

export default OptionsScreen