import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  LineSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type BusinessDay,
  type HistogramData,
} from 'lightweight-charts'
import { fetchSpread } from '../../lib/api'
import type { SpreadData } from '../../types'
import LoadingBar from '../shared/LoadingBar'
import theme from '../../lib/theme'

const { color, font } = theme

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODS = ['1m', '6m', 'ytd', '1y', '2y', '5y', 'max'] as const
type PeriodKey = typeof PERIODS[number]
const PERIOD_LABELS: Record<PeriodKey, string> = {
  '1m': '1M', '6m': '6M', 'ytd': 'YTD', '1y': '1Y', '2y': '2Y', '5y': '5Y', 'max': 'MAX',
}

const fv = (n: number | null | undefined, decimals = 4, sign = false): string => {
  if (n == null) return '\u2014'
  const s = sign && n >= 0 ? '+' : ''
  return s + n.toFixed(decimals)
}

const toTime = (t: string): BusinessDay => {
  const [year, month, day] = t.split('-').map(Number)
  return { year, month, day } as BusinessDay
}

const ACTIVE_BTN: React.CSSProperties = {
  background: color.accentPositive, color: color.textInverse,
  border: 'none', fontWeight: 700, padding: '1px 8px', fontSize: 10,
  fontFamily: 'inherit', cursor: 'pointer',
}
const INACTIVE_BTN: React.CSSProperties = {
  background: 'transparent', color: color.textTertiary,
  border: 'none', padding: '1px 8px', fontSize: 10,
  fontFamily: 'inherit', cursor: 'pointer',
}

// ─── Ticker input dialog ──────────────────────────────────────────────────────

function CompareDialog({
  ticker1,
  onSubmit,
  onCancel,
}: {
  ticker1: string
  onSubmit: (t2: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }} onClick={onCancel}>
      <div style={{
        background: color.bgBase, border: `1px solid #ff9900`,
        padding: 20, minWidth: 380, fontFamily: font.mono, fontSize: 12, color: '#ff9900',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 13, marginBottom: 12, letterSpacing: '0.08em' }}>
          HISTORICAL SPREAD
        </div>
        <div style={{ marginBottom: 12, fontSize: 11 }}>
          <span style={{ color: color.textPrimary }}>SECURITY 1:</span>{' '}
          <span style={{ color: color.accentPositive, fontWeight: 700 }}>{ticker1}</span>
        </div>
        <div style={{ marginBottom: 8, fontSize: 11 }}>
          <span style={{ color: color.textPrimary }}>SECURITY 2:</span>
        </div>
        <input
          ref={ref}
          value={val}
          onChange={e => setVal(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) onSubmit(val.trim()) }}
          placeholder="Enter ticker to compare..."
          spellCheck={false}
          style={{
            width: '100%', background: color.bgBase, color: '#ff9900',
            border: '1px solid #ff9900', padding: '6px 8px',
            fontFamily: 'inherit', fontSize: 12, outline: 'none',
            textTransform: 'uppercase', boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={{ ...INACTIVE_BTN, border: `1px solid ${color.borderSubtle}`, padding: '4px 12px' }} onClick={onCancel}>CANCEL</button>
          <button
            style={{ ...ACTIVE_BTN, padding: '4px 12px', opacity: val.trim() ? 1 : 0.4 }}
            disabled={!val.trim()}
            onClick={() => val.trim() && onSubmit(val.trim())}
          >COMPARE</button>
        </div>
      </div>
    </div>
  )
}

// ─── Distribution histogram (rotated 90°) ─────────────────────────────────────

function DistributionChart({ spread, current }: { spread: { time: string; value: number }[]; current: number | null }) {
  const bins = 30
  const values = spread.map(p => p.value)
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const binWidth = range / bins

  const counts = new Array(bins).fill(0)
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1)
    counts[idx]++
  }
  const maxCount = Math.max(...counts)

  const W = 80
  const H = 300
  const barH = H / bins

  // Which bin does current fall in?
  const currentBin = current != null ? Math.min(Math.floor((current - min) / binWidth), bins - 1) : -1

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {counts.map((c, i) => {
        const barW = maxCount > 0 ? (c / maxCount) * (W - 4) : 0
        const y = H - (i + 1) * barH
        const isCurrent = i === currentBin
        return (
          <rect
            key={i}
            x={0}
            y={y}
            width={barW}
            height={Math.max(barH - 1, 1)}
            fill={isCurrent ? '#ff9900' : 'rgba(0, 217, 100, 0.5)'}
          />
        )
      })}
    </svg>
  )
}

// ─── Summary stats panel ──────────────────────────────────────────────────────

function SummaryPanel({
  data,
  crosshairVal,
}: {
  data: SpreadData | undefined
  crosshairVal: number | null
}) {
  const last       = crosshairVal ?? data?.current ?? null
  const avg        = data?.avg ?? null
  const median     = data?.median ?? null
  const stdev      = data?.stdev ?? null
  const high       = data?.high ?? null
  const low        = data?.low ?? null
  const highDate   = data?.high_date ?? null
  const lowDate    = data?.low_date ?? null
  const percentile = data?.percentile ?? null
  const offAvg     = last != null && avg != null ? last - avg : null

  const offAvgColor = offAvg == null ? color.textPrimary : offAvg >= 0 ? color.accentPositive : color.accentNegative
  const lastColor   = last == null ? color.textTertiary : last >= 0 ? color.accentPositive : color.accentNegative

  const Row = ({ label, value, clr = color.textPrimary }: { label: string; value: string; clr?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
      <span style={{ color: color.textTertiary, fontSize: 9, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ color: clr, fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      width: 160, flexShrink: 0, background: color.bgBase,
      borderLeft: `1px solid ${color.borderSubtle}`,
      padding: '8px 10px', fontFamily: font.mono,
      display: 'flex', flexDirection: 'column', overflow: 'auto',
    }}>
      <div style={{
        color: color.textPrimary, fontSize: 10, letterSpacing: '0.1em',
        marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${color.borderSubtle}`,
      }}>
        SUM SUMMARY
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ color: color.textTertiary, fontSize: 9, letterSpacing: '0.08em', marginBottom: 2 }}>LAST</div>
        <div style={{ color: lastColor, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
          {fv(last)}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${color.borderSubtle}`, paddingTop: 6 }}>
        <Row label="Mean"      value={fv(avg)} clr={color.textSecondary} />
        <Row label="Off Avg"   value={fv(offAvg, 4, true)} clr={offAvgColor} />
        <Row label="Median"    value={fv(median)} clr={color.textSecondary} />
        <Row label="StDev"     value={fv(stdev)} clr={color.textSecondary} />
        <Row
          label="StDev from mean"
          value={offAvg != null && stdev != null && stdev > 0 ? fv(offAvg / stdev, 4, true) : '\u2014'}
          clr={offAvgColor}
        />
        <Row
          label="Percentile"
          value={percentile != null ? `${percentile.toFixed(1)}%` : '\u2014'}
          clr={color.textSecondary}
        />
      </div>

      <div style={{ borderTop: `1px solid ${color.borderSubtle}`, paddingTop: 6, marginTop: 4 }}>
        <Row
          label={`High${highDate ? ' ' + highDate : ''}`}
          value={fv(high)}
          clr={color.accentPositive}
        />
        <Row
          label={`Low${lowDate ? ' ' + lowDate : ''}`}
          value={fv(low)}
          clr={color.accentNegative}
        />
      </div>

      {/* Distribution */}
      {data && data.spread.length > 2 && (
        <div style={{ borderTop: `1px solid ${color.borderSubtle}`, paddingTop: 6, marginTop: 4, flex: 1, minHeight: 0 }}>
          <div style={{ color: color.textTertiary, fontSize: 9, letterSpacing: '0.08em', marginBottom: 4 }}>DISTRIBUTION</div>
          <DistributionChart spread={data.spread} current={data.current} />
        </div>
      )}
    </div>
  )
}

// ─── Ticker input ─────────────────────────────────────────────────────────────

const TickerInput: React.FC<{
  label: string
  color: string
  value: string
  onChange: (v: string) => void
  onEnter: () => void
}> = ({ label, color: clr, value, onChange, onEnter }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <span style={{ color: clr, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</span>
    <input
      value={value}
      onChange={e => onChange(e.target.value.toUpperCase())}
      onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
      spellCheck={false}
      style={{
        background: color.bgElevated, border: `1px solid ${color.borderSubtle}`,
        color: clr, fontFamily: font.mono, fontSize: 11,
        padding: '2px 6px', width: 80, outline: 'none',
      }}
    />
  </div>
)

// ─── Main screen ──────────────────────────────────────────────────────────────

interface Props {
  ticker?: string
  onNavigate: (cmd: string) => void
}

const HSScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  // If opened via "NVDA HS", prompt for second ticker
  const [showCompare, setShowCompare] = useState(!!ticker)
  const [t1, setT1] = useState(ticker || '^TNX')
  const [t2, setT2] = useState(ticker ? '' : '^IRX')
  const [pendingT1, setPendingT1] = useState(ticker || '^TNX')
  const [pendingT2, setPendingT2] = useState(ticker ? '' : '^IRX')
  const [period, setPeriod] = useState<PeriodKey>('2y')
  const [normalize, setNormalize] = useState<'none' | 'percent'>('none')
  const [crosshairVal, setCrosshairVal] = useState<number | null>(null)

  const queryReady = t1.length > 0 && t2.length > 0

  const { data, isLoading, error } = useQuery<SpreadData>({
    queryKey: ['spread', t1, t2, period],
    queryFn: () => fetchSpread(t1, t2, period),
    enabled: queryReady,
    staleTime: 300_000,
  })

  // ── Chart ─────────────────────────────────────────────────────────────────

  const mainChartRef = useRef<HTMLDivElement>(null)
  const spreadChartRef = useRef<HTMLDivElement>(null)
  const mainApiRef = useRef<IChartApi | null>(null)
  const spreadApiRef = useRef<IChartApi | null>(null)
  const line1Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const line2Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const histRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  // Create charts — wait until compare dialog is closed so containers are sized
  useEffect(() => {
    if (showCompare) return
    if (!mainChartRef.current || !spreadChartRef.current) return
    // Already created
    if (mainApiRef.current) return

    const chartOpts = (el: HTMLElement) => ({
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: color.bgBase },
        textColor: color.textSecondary,
        fontFamily: font.mono,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: color.borderSubtle, textColor: color.textSecondary },
      timeScale: { borderColor: color.borderSubtle, timeVisible: false },
      crosshair: {
        vertLine: { color: color.borderMedium, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: color.bgElevated },
        horzLine: { color: color.borderMedium, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: color.bgElevated },
      },
    })

    // Main chart — two overlaid price lines
    const main = createChart(mainChartRef.current, chartOpts(mainChartRef.current))
    const line1 = main.addSeries(LineSeries, {
      color: '#ffffff', lineWidth: 2, priceScaleId: 'right',
      title: '',
    })
    const line2 = main.addSeries(LineSeries, {
      color: '#ff9900', lineWidth: 2, priceScaleId: 'left',
      title: '',
    })
    main.priceScale('left').applyOptions({
      borderColor: color.borderSubtle, textColor: '#ff9900', visible: true,
    })

    mainApiRef.current = main
    line1Ref.current = line1 as ISeriesApi<'Line'>
    line2Ref.current = line2 as ISeriesApi<'Line'>

    // Spread chart — histogram
    const spread = createChart(spreadChartRef.current, chartOpts(spreadChartRef.current))
    const hist = spread.addSeries(HistogramSeries, {
      color: color.accentPositive,
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
    })
    spreadApiRef.current = spread
    histRef.current = hist as ISeriesApi<'Histogram'>

    // Sync time scales
    main.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) spread.timeScale().setVisibleLogicalRange(range)
    })
    spread.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) main.timeScale().setVisibleLogicalRange(range)
    })

    // Crosshair on spread chart updates summary
    spread.subscribeCrosshairMove(param => {
      if (param.time && histRef.current) {
        const v = param.seriesData.get(histRef.current) as { value?: number } | undefined
        if (v?.value != null) {
          // The histogram shows spread value, not deviation
          setCrosshairVal(null)
          return
        }
      }
      setCrosshairVal(null)
    })

    const ro = new ResizeObserver(() => {
      if (mainChartRef.current) main.applyOptions({ width: mainChartRef.current.clientWidth, height: mainChartRef.current.clientHeight })
      if (spreadChartRef.current) spread.applyOptions({ width: spreadChartRef.current.clientWidth, height: spreadChartRef.current.clientHeight })
    })
    if (mainChartRef.current) ro.observe(mainChartRef.current)
    if (spreadChartRef.current) ro.observe(spreadChartRef.current)

    return () => {
      ro.disconnect()
      main.remove()
      spread.remove()
      mainApiRef.current = null
      spreadApiRef.current = null
      line1Ref.current = null
      line2Ref.current = null
      histRef.current = null
    }
  }, [showCompare])

  // Update data
  useEffect(() => {
    if (!line1Ref.current || !line2Ref.current || !histRef.current || !data) return

    const avg = data.avg ?? 0

    if (data.series1.length > 0 && data.series2.length > 0) {
      // For normalized percent view, rebase to 100
      if (normalize === 'percent' && data.series1.length > 0 && data.series2.length > 0) {
        const base1 = data.series1[0].value
        const base2 = data.series2[0].value
        line1Ref.current.setData(data.series1.map(p => ({
          time: toTime(p.time),
          value: base1 !== 0 ? ((p.value / base1) - 1) * 100 : 0,
        })))
        line2Ref.current.setData(data.series2.map(p => ({
          time: toTime(p.time),
          value: base2 !== 0 ? ((p.value / base2) - 1) * 100 : 0,
        })))
      } else {
        line1Ref.current.setData(data.series1.map(p => ({
          time: toTime(p.time), value: p.value,
        })))
        line2Ref.current.setData(data.series2.map(p => ({
          time: toTime(p.time), value: p.value,
        })))
      }
    }

    const histData: HistogramData[] = data.spread.map(p => {
      const dev = p.value - avg
      return {
        time: toTime(p.time),
        value: p.value,
        color: dev >= 0 ? 'rgba(0,255,65,0.7)' : 'rgba(255,51,51,0.7)',
      }
    })
    histRef.current.setData(histData)

    mainApiRef.current?.timeScale().fitContent()
    spreadApiRef.current?.timeScale().fitContent()
  }, [data, normalize])

  const applyCustom = () => {
    const a = pendingT1.trim().toUpperCase()
    const b = pendingT2.trim().toUpperCase()
    if (a && b) { setT1(a); setT2(b) }
  }

  const label1 = data?.label1 ?? t1
  const label2 = data?.label2 ?? t2

  // Handle compare dialog submission
  const handleCompareSubmit = (secondTicker: string) => {
    setT1(ticker || '')
    setT2(secondTicker)
    setPendingT1(ticker || '')
    setPendingT2(secondTicker)
    setShowCompare(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: color.bgBase, overflow: 'hidden', fontFamily: font.mono,
    }}>
      <LoadingBar loading={isLoading} />

      {/* Compare dialog when opened via "NVDA HS" */}
      {showCompare && ticker && (
        <CompareDialog
          ticker1={ticker}
          onSubmit={handleCompareSubmit}
          onCancel={() => {
            setShowCompare(false)
            // Fall back to default spread if cancelled
            if (!t2) { setT1('^TNX'); setT2('^IRX'); setPendingT1('^TNX'); setPendingT2('^IRX') }
          }}
        />
      )}

      {/* Header bar */}
      <div style={{
        flexShrink: 0, background: color.bgElevated,
        borderBottom: `1px solid ${color.borderSubtle}`, padding: '6px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
          <span style={{ color: color.textPrimary, fontSize: 13, fontWeight: 700 }}>HS</span>
          <span style={{ color: color.textTertiary, fontSize: 10, letterSpacing: '0.06em' }}>HISTORICAL SPREAD</span>

          <span style={{ color: color.textTertiary, fontSize: 11 }}>|</span>

          {/* Security labels */}
          <span style={{ color: '#ffffff', fontSize: 11, fontWeight: 600 }}>{label1}</span>
          <span style={{ color: color.textTertiary, fontSize: 11 }}>vs</span>
          <span style={{ color: '#ff9900', fontSize: 11, fontWeight: 600 }}>{label2}</span>

          {/* Normalize toggle */}
          <span style={{ color: color.textTertiary, fontSize: 11 }}>|</span>
          <button
            style={normalize === 'none' ? ACTIVE_BTN : INACTIVE_BTN}
            onClick={() => setNormalize('none')}
          >PRICE</button>
          <button
            style={normalize === 'percent' ? ACTIVE_BTN : INACTIVE_BTN}
            onClick={() => setNormalize('percent')}
          >PERCENT</button>

          {/* Period selector */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {PERIODS.map(p => (
              <button key={p} style={period === p ? ACTIVE_BTN : INACTIVE_BTN} onClick={() => setPeriod(p)}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Custom ticker inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TickerInput label="SEC 1" color="#ffffff" value={pendingT1} onChange={setPendingT1} onEnter={applyCustom} />
          <TickerInput label="SEC 2" color="#ff9900" value={pendingT2} onChange={setPendingT2} onEnter={applyCustom} />
          <button style={INACTIVE_BTN} onClick={applyCustom}>GO</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Charts column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {error && !isLoading ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: color.accentNegative, fontSize: 12,
            }}>
              ERR: {(error as Error).message}
            </div>
          ) : (
            <>
              {/* Main overlaid price chart — 65% */}
              <div ref={mainChartRef} style={{ flex: 65, position: 'relative', minHeight: 0 }} />

              {/* Spread histogram — 35% */}
              <div style={{
                borderTop: `1px solid ${color.borderSubtle}`,
                padding: '2px 12px 0',
                fontSize: 9, color: color.textTertiary, letterSpacing: '0.08em',
              }}>
                SPREAD ({label1} \u2212 {label2})
              </div>
              <div ref={spreadChartRef} style={{ flex: 35, position: 'relative', minHeight: 0 }} />
            </>
          )}
        </div>

        {/* Summary + distribution panel */}
        <SummaryPanel data={data} crosshairVal={crosshairVal} />
      </div>
    </div>
  )
}

export default HSScreen
