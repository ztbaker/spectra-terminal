/**
 * HSScreen — Historical Spread (Bloomberg HS style)
 *
 * Two-pane chart:
 *   Pane 0: Amber area chart — absolute spread level
 *   Pane 1: Green/red histogram — deviation from period average
 * Right sidebar: PRICE SUMMARY stats panel
 */
import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  AreaSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type BusinessDay,
  type AreaData,
  type HistogramData,
} from 'lightweight-charts'
import { fetchSpread } from '../../lib/api'
import type { SpreadData } from '../../types'
import LoadingBar from '../shared/LoadingBar'

// ─── Button styles ────────────────────────────────────────────────────────────

const ACTIVE_BTN: React.CSSProperties = {
  background:  '#ff9900',
  color:       '#000',
  border:      'none',
  fontWeight:  700,
  padding:     '1px 8px',
  fontSize:    10,
  fontFamily:  'inherit',
  cursor:      'pointer',
}

const INACTIVE_BTN: React.CSSProperties = {
  background:  'transparent',
  color:       '#554400',
  border:      'none',
  padding:     '1px 8px',
  fontSize:    10,
  fontFamily:  'inherit',
  cursor:      'pointer',
}

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset { id: string; label: string; ticker1: string; ticker2: string; desc: string }

const PRESETS: Preset[] = [
  { id: 'yc',   label: '10Y-3M',  ticker1: '^TNX', ticker2: '^IRX', desc: 'Yield Curve (10Y − 3M)' },
  { id: '5y3m', label: '5Y-3M',   ticker1: '^FVX', ticker2: '^IRX', desc: '5Y − 3M Spread' },
  { id: '30y',  label: '30Y-10Y', ticker1: '^TYX', ticker2: '^TNX', desc: '30Y − 10Y Spread' },
]

const PERIODS = ['1y', '2y', '5y', 'max'] as const
type PeriodKey = typeof PERIODS[number]
const PERIOD_LABELS: Record<PeriodKey, string> = { '1y': '1Y', '2y': '2Y', '5y': '5Y', 'max': 'MAX' }

// ─── PRICE SUMMARY sidebar ────────────────────────────────────────────────────

interface SummaryProps {
  data:         SpreadData | undefined
  crosshairVal: number | null
}

const PriceSummary: React.FC<SummaryProps> = ({ data, crosshairVal }) => {
  const last   = crosshairVal ?? data?.current ?? null
  const avg    = data?.avg    ?? null
  const high   = data?.high   ?? null
  const low    = data?.low    ?? null
  const offAvg = last != null && avg != null ? last - avg : null

  const fv = (n: number | null, sign = false): string => {
    if (n == null) return '—'
    const s = sign && n >= 0 ? '+' : ''
    return s + n.toFixed(2)
  }

  const offAvgColor = offAvg == null ? '#e0e0e0' : offAvg >= 0 ? '#00ff41' : '#ff3333'
  const lastColor   = last   == null ? '#554400' : last   >= 0 ? '#00ff41' : '#ff3333'

  const Row = ({ label, value, color = '#cccccc' }: { label: string; value: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ color: '#554400', fontSize: 9, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ color, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      width:         160,
      flexShrink:    0,
      background:    '#080808',
      borderLeft:    '1px solid #333',
      padding:       '10px 12px',
      fontFamily:    "'JetBrains Mono','Courier New',monospace",
      display:       'flex',
      flexDirection: 'column',
    }}>
      {/* Title */}
      <div style={{
        color:         '#ff9900',
        fontSize:      10,
        letterSpacing: '0.1em',
        marginBottom:  10,
        paddingBottom: 6,
        borderBottom:  '1px solid #2a2a2a',
      }}>
        PRICE SUMMARY
      </div>

      {/* Last — large prominent value */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#554400', fontSize: 9, letterSpacing: '0.08em', marginBottom: 3 }}>LAST</div>
        <div style={{ color: lastColor, fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 2 }}>
          {fv(last)}
        </div>
      </div>

      {/* Stats rows */}
      <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 8 }}>
        <Row
          label="Off Avg"
          value={fv(offAvg, true)}
          color={offAvgColor}
        />
        <Row label="High"  value={fv(high)}  color="#e0e0e0" />
        <Row label="Low"   value={fv(low)}   color="#e0e0e0" />
        <Row label="Avg"   value={fv(avg)}   color="#cc7700" />
      </div>

    </div>
  )
}

// ─── Ticker input ─────────────────────────────────────────────────────────────

const TickerInput: React.FC<{
  placeholder: string
  value: string
  onChange: (v: string) => void
  onEnter: () => void
}> = ({ placeholder, value, onChange, onEnter }) => (
  <input
    value={value}
    placeholder={placeholder}
    onChange={e => onChange(e.target.value.toUpperCase())}
    onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
    style={{
      background:  '#0d0d0d',
      border:      '1px solid #2a2a2a',
      color:       '#ff9900',
      fontFamily:  "'JetBrains Mono','Courier New',monospace",
      fontSize:    11,
      padding:     '2px 6px',
      width:       70,
      outline:     'none',
    }}
    spellCheck={false}
  />
)

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { onNavigate: (cmd: string) => void }

const HSScreen: React.FC<Props> = ({ onNavigate: _onNavigate }) => {
  const [presetId,  setPresetId]  = useState<string>('yc')
  const [period,    setPeriod]    = useState<PeriodKey>('2y')
  const [customT1,  setCustomT1]  = useState('')
  const [customT2,  setCustomT2]  = useState('')
  const [pendingT1, setPendingT1] = useState('')
  const [pendingT2, setPendingT2] = useState('')
  const [crosshairVal, setCrosshairVal] = useState<number | null>(null)

  const preset     = PRESETS.find(p => p.id === presetId)
  const ticker1    = presetId === 'custom' ? customT1 : (preset?.ticker1 ?? '^TNX')
  const ticker2    = presetId === 'custom' ? customT2 : (preset?.ticker2 ?? '^IRX')
  const queryReady = ticker1.length > 0 && ticker2.length > 0

  const { data, isLoading, error } = useQuery<SpreadData>({
    queryKey:  ['spread', ticker1, ticker2, period],
    queryFn:   () => fetchSpread(ticker1, ticker2, period),
    enabled:   queryReady,
    staleTime: 300_000,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const areaRef      = useRef<ISeriesApi<'Area'> | null>(null)
  const histRef      = useRef<ISeriesApi<'Histogram'> | null>(null)

  // ── Mount chart ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#000000' },
        textColor:  '#cc7700',
        fontFamily: "'JetBrains Mono','Courier New',monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: '#0e0e00' },
        horzLines: { color: '#141400' },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        textColor:   '#cc7700',
      },
      timeScale: {
        borderColor:    '#2a2a2a',
        timeVisible:    true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: '#ff990055', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#331100' },
        horzLine: { color: '#ff990055', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#331100' },
      },
    })

    // Pane 0: amber area — spread level (saturated fill)
    const area = chart.addSeries(AreaSeries, {
      lineColor:    '#ff9900',
      topColor:     'rgba(255,153,0,0.55)',
      bottomColor:  'rgba(255,100,0,0.03)',
      lineWidth:    2,
      priceScaleId: 'right',
    }, 0) as ISeriesApi<'Area'>

    // Pane 1: deviation histogram
    const hist = chart.addSeries(HistogramSeries, {
      priceScaleId: 'offavg',
      color:        '#00ff41',
      priceFormat:  { type: 'price', precision: 2, minMove: 0.01 },
    }, 1) as ISeriesApi<'Histogram'>
    hist.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })

    // Size panes: top ~70%, bottom ~30%
    try {
      const panes = chart.panes() as unknown as Array<{ setStretch?: (v: number) => void }>
      if (panes.length >= 2 && panes[0].setStretch && panes[1].setStretch) {
        panes[0].setStretch(3)
        panes[1].setStretch(1)
      }
    } catch { /* setStretch may not be available in all builds */ }

    chart.subscribeCrosshairMove(param => {
      if (param.time && areaRef.current) {
        const v = param.seriesData.get(areaRef.current) as { value?: number } | undefined
        if (v?.value != null) { setCrosshairVal(v.value); return }
      }
      setCrosshairVal(null)
    })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)

    chartRef.current = chart
    areaRef.current  = area
    histRef.current  = hist

    return () => { ro.disconnect(); chart.remove() }
  }, [])

  // ── Update data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!areaRef.current || !histRef.current || !data?.spread.length) return

    const avg = data.avg ?? 0

    const toTime = (t: string): BusinessDay => {
      const [year, month, day] = t.split('-').map(Number)
      return { year, month, day } as BusinessDay
    }

    const areaData: AreaData[] = data.spread.map(p => ({
      time:  toTime(p.time),
      value: p.value,
    }))

    const histData: HistogramData[] = data.spread.map(p => {
      const dev = p.value - avg
      return {
        time:  toTime(p.time),
        value: dev,
        color: dev >= 0 ? 'rgba(0,255,65,0.75)' : 'rgba(255,51,51,0.75)',
      }
    })

    areaRef.current.setData(areaData)
    histRef.current.setData(histData)
    chartRef.current?.timeScale().fitContent()
  }, [data])

  const applyCustom = () => {
    const t1 = pendingT1.trim().toUpperCase()
    const t2 = pendingT2.trim().toUpperCase()
    if (t1 && t2) { setCustomT1(t1); setCustomT2(t2) }
  }

  const label1     = data?.label1 ?? ticker1
  const label2     = data?.label2 ?? ticker2
  const isInverted = (data?.current ?? 0) < 0

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    '#000',
      overflow:      'hidden',
      fontFamily:    "'JetBrains Mono','Courier New',monospace",
    }}>
      <LoadingBar loading={isLoading} />

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:   0,
        background:   '#0d0d0d',
        borderBottom: '1px solid #2a2a2a',
        padding:      '6px 12px',
      }}>
        {/* Row 1: title + instruments + inversion badge + period buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
          <span style={{ color: '#ff9900', fontSize: 13, fontWeight: 700 }}>HS</span>
          <span style={{ color: '#554400', fontSize: 10, letterSpacing: '0.06em' }}>HISTORICAL SPREAD</span>

          <span style={{ color: '#333', fontSize: 11 }}>|</span>

          <span style={{ color: '#e0e0e0', fontSize: 11 }}>{label1}</span>
          <span style={{ color: '#554400', fontSize: 11 }}>−</span>
          <span style={{ color: '#e0e0e0', fontSize: 11 }}>{label2}</span>

          {presetId !== 'custom' && isInverted && data != null && (
            <span style={{
              color:         '#ff3333',
              fontSize:      10,
              fontWeight:    700,
              border:        '1px solid #ff3333',
              padding:       '1px 6px',
              letterSpacing: '0.06em',
            }}>
              ▼ INVERTED
            </span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {PERIODS.map(p => (
              <button
                key={p}
                style={period === p ? ACTIVE_BTN : INACTIVE_BTN}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: preset selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#2a2a2a', fontSize: 10, marginRight: 2 }}>PRESET:</span>
          {PRESETS.map(p => (
            <button
              key={p.id}
              style={presetId === p.id ? ACTIVE_BTN : INACTIVE_BTN}
              title={p.desc}
              onClick={() => setPresetId(p.id)}
            >
              {p.label}
            </button>
          ))}
          <button
            style={presetId === 'custom' ? ACTIVE_BTN : INACTIVE_BTN}
            onClick={() => setPresetId('custom')}
          >
            CUSTOM
          </button>

          {presetId === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <TickerInput placeholder="SEC1" value={pendingT1} onChange={setPendingT1} onEnter={applyCustom} />
              <span style={{ color: '#554400' }}>−</span>
              <TickerInput placeholder="SEC2" value={pendingT2} onChange={setPendingT2} onEnter={applyCustom} />
              <button style={INACTIVE_BTN} onClick={applyCustom}>GO</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content: chart + sidebar ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Chart */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {error && !isLoading ? (
            <div style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              color:          '#ff3333',
              fontSize:       12,
            }}>
              ERR: {(error as Error).message}
            </div>
          ) : (
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>

        {/* Stats sidebar */}
        <PriceSummary data={data} crosshairVal={crosshairVal} />
      </div>

      {/* ── Bottom label ──────────────────────────────────────────────────── */}
      <div style={{
        flexShrink:  0,
        background:  '#080808',
        borderTop:   '1px solid #2a2a2a',
        padding:     '3px 12px',
        textAlign:   'center',
        color:       '#333300',
        fontSize:    10,
        letterSpacing: '0.1em',
      }}>
        {preset?.desc?.toUpperCase() ?? `${ticker1} − ${ticker2} SPREAD`}
      </div>
    </div>
  )
}

export default HSScreen
