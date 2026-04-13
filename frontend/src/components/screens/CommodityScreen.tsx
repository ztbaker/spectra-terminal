import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import C from '../../lib/colors'
import TabBar from '../shared/TabBar'
import DataGrid from '../shared/DataGrid'
import Sparkline from '../shared/Sparkline'
import LiveDot from '../shared/LiveDot'
import LoadingBar from '../shared/LoadingBar'
import {
  fetchCommoditySpots,
  fetchCommodityEnergyOutlook,
  fetchCommodityEnergyStocks,
  fetchCommodityAgPSD,
} from '../../lib/api'

interface Props {
  onNavigate: (cmd: string) => void
}

type Tab = 'ENERGY' | 'METALS' | 'AGRICULTURE'

const TABS = [
  { key: 'ENERGY', label: 'ENERGY' },
  { key: 'METALS', label: 'METALS' },
  { key: 'AGRICULTURE', label: 'AGRICULTURE' },
]

// ─── Metric card ──────────────────────────────────────────────────────────────

const MetricCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color,
}) => (
  <div style={{
    background: C.bg2,
    border: `1px solid ${C.border0}`,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }}>
    <span style={{ color: C.whiteDim, fontSize: 9, fontFamily: C.fontSans, letterSpacing: '0.08em', fontWeight: 600 }}>
      {label}
    </span>
    <span style={{ color: color ?? C.white, fontSize: 16, fontFamily: C.fontMono, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      {value}
    </span>
    {sub && (
      <span style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontMono }}>{sub}</span>
    )}
  </div>
)

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CommodityScreen({ onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('ENERGY')

  // Spot prices (used by all tabs)
  const { data: spots, isLoading: spotsLoading } = useQuery({
    queryKey: ['commodity-spots'],
    queryFn: fetchCommoditySpots,
    staleTime: 60_000,
  })

  // Energy outlook
  const { data: outlook, isLoading: outlookLoading } = useQuery({
    queryKey: ['commodity-energy-outlook'],
    queryFn: fetchCommodityEnergyOutlook,
    enabled: activeTab === 'ENERGY',
    staleTime: 300_000,
  })

  // Energy stocks
  const { data: energyStocks, isLoading: stocksLoading } = useQuery({
    queryKey: ['commodity-energy-stocks'],
    queryFn: fetchCommodityEnergyStocks,
    enabled: activeTab === 'ENERGY',
    staleTime: 300_000,
  })

  // PSD data
  const { data: psd, isLoading: psdLoading } = useQuery({
    queryKey: ['commodity-ag-psd'],
    queryFn: fetchCommodityAgPSD,
    enabled: activeTab === 'AGRICULTURE',
    staleTime: 300_000,
  })

  const spotList = useMemo(() => (spots ?? []) as any[], [spots])
  const isLoading = activeTab === 'ENERGY'
    ? spotsLoading || outlookLoading || stocksLoading
    : activeTab === 'AGRICULTURE'
    ? spotsLoading || psdLoading
    : spotsLoading

  // ─── ENERGY tab ────────────────────────────────────────────────────────────

  const energyColumns = useMemo(() => [
    { key: 'symbol', header: 'SYMBOL', type: 'text' as const, width: '70px', render: (row: any) => (
      <span style={{ color: C.yellow, fontWeight: 700 }}>{row.symbol}</span>
    )},
    { key: 'name', header: 'NAME', type: 'text' as const },
    { key: 'price', header: 'PRICE', type: 'currency' as const, width: '100px' },
    { key: 'change', header: 'CHG', type: 'change' as const, width: '80px' },
    { key: 'change_pct', header: 'CHG%', type: 'pct' as const, width: '70px' },
  ], [])

  const energySpotItems = useMemo(() =>
    spotList.filter((s: any) => ['WTI', 'BRENT', 'NG', 'HH'].includes(s.symbol)),
    [spotList]
  )

  // ─── METALS tab ───────────────────────────────────────────────────────────

  const metalsColumns = useMemo(() => [
    { key: 'symbol', header: 'SYMBOL', type: 'text' as const, width: '70px', render: (row: any) => (
      <span style={{ color: C.yellow, fontWeight: 700 }}>{row.symbol}</span>
    )},
    { key: 'name', header: 'NAME', type: 'text' as const },
    { key: 'price', header: 'PRICE', type: 'currency' as const, width: '100px' },
    { key: 'change_pct', header: 'CHG%', type: 'pct' as const, width: '70px' },
    { key: 'sparkline', header: 'TREND', type: 'text' as const, width: '100px', render: (row: any) => {
      const sparkData = row.sparkline ?? row.change_pct != null ? [0, row.change_pct ?? 0] : []
      return sparkData.length > 1 ? (
        <Sparkline data={sparkData} width={80} height={20} color={row.change_pct >= 0 ? C.green : C.red} />
      ) : <span style={{ color: C.whiteGhost }}>—</span>
    }},
  ], [])

  const metalsItems = useMemo(() =>
    spotList.filter((s: any) => ['GOLD', 'SILVER'].includes(s.symbol)),
    [spotList]
  )

  // ─── AGRICULTURE tab ─────────────────────────────────────────────────────

  const psdColumns = useMemo(() => [
    { key: 'country', header: 'COUNTRY', type: 'text' as const, width: '120px', render: (row: any) => (
      <span style={{ color: C.white, fontWeight: 600 }}>{row.country ?? row.Country ?? '—'}</span>
    )},
    { key: 'commodity', header: 'COMMODITY', type: 'text' as const, width: '100px' },
    { key: 'year', header: 'YEAR', type: 'text' as const, width: '60px' },
    { key: 'production', header: 'PRODUCTION', type: 'number' as const, width: '100px' },
    { key: 'domestic_consumption', header: 'CONSUMPTION', type: 'number' as const, width: '100px' },
    { key: 'exports', header: 'EXPORTS', type: 'number' as const, width: '90px' },
  ], [])

  // Outlook summary section
  const outlookSeries = useMemo(() => {
    if (!outlook?.observations) return null
    return outlook.observations.filter((o: any) => o.value != null)
  }, [outlook])

  return (
    <Panel title="COMMODITIES" actions={<LiveDot label={isLoading ? 'LOADING' : 'LIVE'} active={!isLoading} />}>
      <LoadingBar loading={isLoading} />

      {/* Tab bar */}
      <div style={{ padding: '8px 12px 0', borderBottom: `1px solid ${C.border1}` }}>
        <TabBar tabs={TABS} activeKey={activeTab} onChange={(k) => setActiveTab(k as Tab)} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 12px' }}>
        {/* ── ENERGY ─────────────────────────────────────────────────────── */}
        {activeTab === 'ENERGY' && (
          <>
            {/* Summary metrics from spot prices */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px' }}>
              {energySpotItems.map((s: any) => (
                <MetricCard
                  key={s.symbol}
                  label={s.name}
                  value={s.price != null ? `$${s.price.toFixed(2)}` : '—'}
                  sub={s.change_pct != null ? `${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%` : undefined}
                  color={s.change_pct != null ? (s.change_pct >= 0 ? C.green : C.red) : undefined}
                />
              ))}
            </div>

            {/* Energy spot prices table */}
            <div style={{ padding: '0 16px' }}>
              <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6, marginTop: 8 }}>
                CRUDE + PRODUCTS
              </div>
              <DataGrid
                columns={energyColumns}
                data={energySpotItems as any[]}
                keyField="symbol"
                maxHeight="200px"
                emptyMessage="No energy data available"
              />
            </div>

            {/* STEO Outlook summary */}
            {outlookSeries && outlookSeries.length > 0 && (
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
                  STEO OUTLOOK — {outlook.title || 'EIA'}
                </div>
                <div style={{ background: C.bg2, border: `1px solid ${C.border0}`, padding: 12 }}>
                  <Sparkline
                    data={outlookSeries.map((o: any) => o.value)}
                    width={440}
                    height={100}
                    color={C.amber}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ color: C.whiteGhost, fontSize: 10, fontFamily: C.fontMono }}>
                      {outlookSeries[0]?.date}
                    </span>
                    <span style={{ color: C.white, fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                      Latest: {outlookSeries[outlookSeries.length - 1]?.value}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Energy stocks table */}
            {energyStocks?.data && energyStocks.data.length > 0 && (
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
                  PETROLEUM STOCKS (EIA)
                </div>
                <DataGrid
                  columns={[
                    { key: 'series', header: 'SERIES', type: 'text' as const, render: (row: any) => (
                      <span style={{ color: C.white }}>{row.series ?? row.Series ?? row.name ?? '—'}</span>
                    )},
                    { key: 'value', header: 'VALUE', type: 'number' as const, width: '120px' },
                    { key: 'date', header: 'DATE', type: 'text' as const, width: '100px' },
                  ]}
                  data={energyStocks.data as any[]}
                  keyField="series"
                  maxHeight="200px"
                  emptyMessage="No stocks data available"
                />
              </div>
            )}
          </>
        )}

        {/* ── METALS ────────────────────────────────────────────────────── */}
        {activeTab === 'METALS' && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
              SPOT PRICES
            </div>
            <DataGrid
              columns={metalsColumns}
              data={metalsItems as any[]}
              keyField="symbol"
              maxHeight="300px"
              emptyMessage="No metals data available"
            />

            {/* Quick nav */}
            <div style={{ marginTop: 16 }}>
              <div style={{ color: C.yellow, fontSize: 11, fontWeight: 700, marginBottom: 6, fontFamily: C.fontMono }}>QUICK ACCESS</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['GC=F GP', 'SI=F GP'].map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => onNavigate(cmd)}
                    style={{
                      background: C.bg2,
                      color: C.amber,
                      border: `1px solid ${C.border1}`,
                      padding: '5px 12px',
                      fontSize: 11,
                      fontFamily: C.fontMono,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.bgGlow; e.currentTarget.style.borderColor = C.amberMute }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.bg2; e.currentTarget.style.borderColor = C.border1 }}
                  >
                    {cmd.replace(' GP', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AGRICULTURE ──────────────────────────────────────────────── */}
        {activeTab === 'AGRICULTURE' && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ color: C.amberMute, fontSize: 10, fontFamily: C.fontSans, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
              USDA PSD — SUPPLY / DEMAND
            </div>
            {psd?.data && psd.data.length > 0 ? (
              <DataGrid
                columns={psdColumns}
                data={psd.data as any[]}
                keyField="country"
                maxHeight="400px"
                emptyMessage="No PSD data available"
              />
            ) : (
              !psdLoading && (
                <div style={{ padding: 24, color: C.whiteGhost, textAlign: 'center' }}>
                  No PSD data available. USDA provider may not be configured.
                </div>
              )
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}