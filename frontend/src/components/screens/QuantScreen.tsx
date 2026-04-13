import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import Metric from '../shared/Metric'
import DataGrid from '../shared/DataGrid'
import LiveDot from '../shared/LiveDot'
import LoadingBar from '../shared/LoadingBar'
import {
  fetchAnalyticsSummary,
  fetchAnalyticsRegression,
  fetchAnalyticsCointegration,
  fetchAnalyticsFamaFrench,
  fetchChart,
} from '../../lib/api'
import {
  createChart,
  AreaSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

// ─── Inline chart for rolling vol / drawdown ─────────────────────────────────

interface InlineChartProps {
  data: { time: string; value: number }[]
  color: string
  inverted?: boolean
  height?: number
  title?: string
}

const InlineChart: React.FC<InlineChartProps> = ({ data, color, inverted = false, height = 160, title }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current || data.length < 2) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: C.bg1 },
        textColor: C.whiteGhost,
        fontFamily: C.fontMono,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: C.border0 },
        horzLines: { color: C.border0 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border1 },
      timeScale: { borderColor: C.border1, timeVisible: false },
    })

    const series = chart.addSeries(AreaSeries, {
      topColor: color,
      bottomColor: inverted ? 'transparent' : `${color}11`,
      lineColor: color,
      lineWidth: 1,
      priceFormat: { type: 'percent' },
    })

    series.setData(data.map(d => ({
      time: d.time as UTCTimestamp,
      value: d.value,
    })))

    chart.timeScale().fitContent()
    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [data, color, inverted, height])

  return (
    <div style={{ position: 'relative' }}>
      {title && (
        <div style={{
          position: 'absolute', top: 8, left: 12, zIndex: 2,
          color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.06em',
        }}>
          {title}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  )
}

// ─── Significance indicator ──────────────────────────────────────────────────

function significanceIndicator(pValue: number | null | undefined): { label: string; color: string } {
  if (pValue == null) return { label: '—', color: C.whiteGhost }
  if (pValue < 0.01) return { label: '***', color: C.green }
  if (pValue < 0.05) return { label: '**', color: C.green }
  if (pValue < 0.1) return { label: '*', color: C.yellow }
  return { label: '', color: C.whiteGhost }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function QuantScreen({ ticker, onNavigate: _onNavigate }: Props) {
  const sym = ticker.toUpperCase()

  // Summary stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['analytics-summary', sym],
    queryFn: () => fetchAnalyticsSummary(sym),
    staleTime: 300_000,
  })

  // Chart data for drawdown computation
  const { data: chartData } = useQuery({
    queryKey: ['chart', sym, '2y'],
    queryFn: () => fetchChart(sym, '2y'),
    staleTime: 300_000,
  })

  // Fama-French
  const { data: ff, isLoading: ffLoading } = useQuery({
    queryKey: ['analytics-fama-french', sym],
    queryFn: () => fetchAnalyticsFamaFrench(sym),
    staleTime: 300_000,
  })

  // Cointegration state
  const [cointTicker1, setCointTicker1] = useState(sym)
  const [cointTicker2, setCointTicker2] = useState('SPY')
  const [cointResult, setCointResult] = useState<any>(null)
  const [cointLoading, setCointLoading] = useState(false)

  const handleCointTest = useCallback(async () => {
    setCointLoading(true)
    try {
      const result = await fetchAnalyticsCointegration(cointTicker1.toUpperCase(), cointTicker2.toUpperCase())
      setCointResult(result)
    } catch {
      setCointResult({ error: 'Cointegration test failed' })
    } finally {
      setCointLoading(false)
    }
  }, [cointTicker1, cointTicker2])

  // Compute rolling volatility and drawdown from price data
  const rollingVol = useMemo(() => {
    if (!chartData?.ohlcv || chartData.ohlcv.length < 252) return []
    const closes = chartData.ohlcv.map((b: any) => b.close)
    const times = chartData.ohlcv.map((b: any) => b.time)
    const window = 252
    const result: { time: string; value: number }[] = []
    for (let i = window; i < closes.length; i++) {
      const slice = closes.slice(i - window, i)
      const returns = []
      for (let j = 1; j < slice.length; j++) {
        returns.push((slice[j] - slice[j - 1]) / slice[j - 1])
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
      const vol = Math.sqrt(variance) * Math.sqrt(252) * 100
      result.push({ time: String(times[i]), value: vol })
    }
    return result
  }, [chartData])

  const drawdown = useMemo(() => {
    if (!chartData?.ohlcv || chartData.ohlcv.length < 2) return []
    const closes = chartData.ohlcv.map((b: any) => b.close)
    const times = chartData.ohlcv.map((b: any) => b.time)
    const result: { time: string; value: number }[] = []
    let peak = closes[0]
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] > peak) peak = closes[i]
      const dd = ((closes[i] - peak) / peak) * 100
      result.push({ time: String(times[i]), value: dd })
    }
    return result
  }, [chartData])

  // Fama-French table rows
  const ffRows = useMemo(() => {
    if (!ff) return []
    return [
      {
        factor: 'Mkt-RF',
        beta: ff.mkt_beta,
        label: 'Market Risk Premium',
      },
      {
        factor: 'SMB',
        beta: ff.smb_beta,
        label: 'Small Minus Big',
      },
      {
        factor: 'HML',
        beta: ff.hml_beta,
        label: 'High Minus Low',
      },
    ]
  }, [ff])

  const ffColumns = [
    { key: 'factor', header: 'FACTOR', type: 'text' as const, width: '80px', render: (row: any) => (
      <span style={{ color: C.yellow, fontWeight: 700 }}>{row.factor}</span>
    )},
    { key: 'label', header: 'DESCRIPTION', type: 'text' as const },
    { key: 'beta', header: 'BETA', type: 'number' as const, width: '80px', render: (row: any) => {
      const b = row.beta
      return (
        <span style={{
          color: b != null ? (Math.abs(b) > 1 ? C.amber : b > 0 ? C.green : C.red) : C.whiteGhost,
          fontFamily: C.fontMono,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {b != null ? b.toFixed(4) : '—'}
        </span>
      )
    }},
  ]

  const isLoading = statsLoading && ffLoading

  return (
    <Panel title={`QUANT — ${sym}`} actions={<LiveDot label={isLoading ? 'LOADING' : 'LIVE'} active={!isLoading} />}>
      <LoadingBar loading={isLoading} />

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 16px' }}>
        {/* ── Summary stats ─────────────────────────────────────────────── */}
        {stats && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
              DISTRIBUTION STATISTICS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <Metric label="MEAN" value={stats.mean} format="pct" size="sm" />
              <Metric label="STD DEV" value={stats.std} format="pct" size="sm" />
              <Metric label="SKEW" value={stats.skew} format="number" size="sm" />
              <Metric label="KURTOSIS" value={stats.kurtosis} format="number" size="sm" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
              <Metric label="SHARPE" value={stats.sharpe} format="number" size="sm" color={stats.sharpe != null && stats.sharpe > 1 ? C.green : undefined} />
              <Metric label="MAX DD" value={stats.max_drawdown} format="pct" size="sm" color={C.red} />
              <Metric label="VaR 95%" value={stats.var_95} format="pct" size="sm" color={C.red} />
              <Metric label="ALPHA" value={ff?.alpha} format="pct" size="sm" color={ff?.alpha != null && ff.alpha > 0 ? C.green : undefined} />
            </div>
          </div>
        )}

        {/* ── Rolling volatility chart ───────────────────────────────────── */}
        {rollingVol.length > 0 && (
          <div style={{ padding: '8px 16px' }}>
            <InlineChart
              data={rollingVol}
              color={C.amber}
              height={160}
              title="ROLLING VOLATILITY (252D)"
            />
          </div>
        )}

        {/* ── Drawdown chart ─────────────────────────────────────────────── */}
        {drawdown.length > 0 && (
          <div style={{ padding: '8px 16px' }}>
            <InlineChart
              data={drawdown}
              color={C.red}
              inverted={true}
              height={140}
              title="DRAWDOWN"
            />
          </div>
        )}

        {/* ── Fama-French table ─────────────────────────────────────────── */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
            FAMA-FRENCH FACTORS {ff?.cached && <span style={{ color: C.amberMute, fontWeight: 400 }}>(CACHED)</span>}
          </div>
          <DataGrid
            columns={ffColumns}
            data={ffRows as any[]}
            keyField="factor"
            maxHeight="120px"
            emptyMessage={ffLoading ? 'Loading...' : 'No factor data'}
          />
        </div>

        {/* ── Cointegration test ─────────────────────────────────────────── */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
            COINTEGRATION QUICK-TEST
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              value={cointTicker1}
              onChange={e => setCointTicker1(e.target.value.toUpperCase())}
              style={{
                width: 80,
                background: C.bg2,
                border: `1px solid ${C.border1}`,
                color: C.white,
                fontFamily: C.fontMono,
                fontSize: 12,
                padding: '5px 8px',
                borderRadius: 2,
                outline: 'none',
              }}
            />
            <span style={{ color: C.whiteDim, fontSize: 11 }}>vs</span>
            <input
              value={cointTicker2}
              onChange={e => setCointTicker2(e.target.value.toUpperCase())}
              style={{
                width: 80,
                background: C.bg2,
                border: `1px solid ${C.border1}`,
                color: C.white,
                fontFamily: C.fontMono,
                fontSize: 12,
                padding: '5px 8px',
                borderRadius: 2,
                outline: 'none',
              }}
            />
            <button
              onClick={handleCointTest}
              disabled={cointLoading}
              style={{
                background: C.amberGhost,
                color: C.amber,
                border: `1px solid ${C.amberMute}`,
                padding: '5px 16px',
                fontSize: 11,
                fontFamily: C.fontMono,
                fontWeight: 700,
                cursor: cointLoading ? 'wait' : 'pointer',
                letterSpacing: '0.05em',
                borderRadius: 2,
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.amberDim; e.currentTarget.style.color = C.white }}
              onMouseLeave={e => { e.currentTarget.style.background = C.amberGhost; e.currentTarget.style.color = C.amber }}
            >
              {cointLoading ? '...' : 'TEST'}
            </button>
          </div>

          {cointResult && !cointResult.error && (
            <div style={{
              background: C.bg2,
              border: `1px solid ${C.border0}`,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}>
              <Metric label="ADF STAT" value={cointResult.adf_statistic} format="number" size="sm"
                color={cointResult.adf_statistic != null && cointResult.adf_statistic < -3.4 ? C.green : C.red} />
              <Metric label="P-VALUE" value={cointResult.p_value} format="number" size="sm"
                color={cointResult.p_value != null && cointResult.p_value < 0.05 ? C.green : C.yellow} />
              <Metric label="CRITICAL 5%" value={cointResult.critical_values?.['5%'] ?? null} format="number" size="sm" />
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  borderRadius: 2,
                  fontSize: 10,
                  fontFamily: C.fontMono,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  background: cointResult.p_value < 0.05 ? C.greenDim : C.redDim,
                  color: cointResult.p_value < 0.05 ? C.green : C.red,
                  border: `1px solid ${cointResult.p_value < 0.05 ? C.green : C.red}`,
                }}>
                  {cointResult.p_value < 0.05 ? 'COINTEGRATED' : 'NOT COINTEGRATED'}
                </span>
              </div>
            </div>
          )}

          {cointResult?.error && (
            <div style={{ padding: 12, color: C.red, fontSize: 11, fontFamily: C.fontMono }}>
              {cointResult.error}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}