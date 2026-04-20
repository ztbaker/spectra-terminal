import Panel from '../Terminal/Panel'
import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import theme from '../../lib/theme'
const { color, font } = theme
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

const MetricCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color: accentColor,
}) => (
  <div style={{
    background: 'rgba(19, 22, 25, 0.6)',
    border: `1px solid ${color.borderSubtle}`,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }}>
    <span style={{ color: color.textTertiary, fontSize: 11, fontFamily: font.sans, letterSpacing: '0', fontWeight: 600 }}>
      {label}
    </span>
    <span style={{ color: accentColor ?? color.textPrimary, fontSize: 16, fontFamily: font.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      {value}
    </span>
    {sub && (
      <span style={{ color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>{sub}</span>
    )}
  </div>
)

export default function CommodityScreen({ onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('ENERGY')

  const { data: spots, isLoading: spotsLoading } = useQuery({
    queryKey: ['commodity-spots'],
    queryFn: fetchCommoditySpots,
    staleTime: 60_000,
  })

  const { data: outlook, isLoading: outlookLoading } = useQuery({
    queryKey: ['commodity-energy-outlook'],
    queryFn: fetchCommodityEnergyOutlook,
    enabled: activeTab === 'ENERGY',
    staleTime: 300_000,
  })

  const { data: energyStocks, isLoading: stocksLoading } = useQuery({
    queryKey: ['commodity-energy-stocks'],
    queryFn: fetchCommodityEnergyStocks,
    enabled: activeTab === 'ENERGY',
    staleTime: 300_000,
  })

  const { data: psd, isLoading: psdLoading } = useQuery({
    queryKey: ['commodity-ag-psd'],
    queryFn: () => fetchCommodityAgPSD(),
    enabled: activeTab === 'AGRICULTURE',
    staleTime: 300_000,
  })

  const spotList = useMemo(() => (spots ?? []) as any[], [spots])
  const isLoading = activeTab === 'ENERGY'
    ? spotsLoading || outlookLoading || stocksLoading
    : activeTab === 'AGRICULTURE'
    ? spotsLoading || psdLoading
    : spotsLoading

  const energyColumns = useMemo(() => [
    { key: 'symbol', header: 'SYMBOL', type: 'text' as const, width: '70px', render: (row: any) => (
      <span style={{ color: color.textPrimary, fontWeight: 700 }}>{row.symbol}</span>
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

  const metalsColumns = useMemo(() => [
    { key: 'symbol', header: 'SYMBOL', type: 'text' as const, width: '70px', render: (row: any) => (
      <span style={{ color: color.textPrimary, fontWeight: 700 }}>{row.symbol}</span>
    )},
    { key: 'name', header: 'NAME', type: 'text' as const },
    { key: 'price', header: 'PRICE', type: 'currency' as const, width: '100px' },
    { key: 'change_pct', header: 'CHG%', type: 'pct' as const, width: '70px' },
    { key: 'sparkline', header: 'TREND', type: 'text' as const, width: '100px', render: (row: any) => {
      const sparkData = row.sparkline ?? (row.change_pct != null ? [0, row.change_pct ?? 0] : [])
      return sparkData.length > 1 ? (
        <Sparkline data={sparkData} width={80} height={20} color={row.change_pct >= 0 ? color.accentPositive : color.accentNegative} />
      ) : <span style={{ color: color.textTertiary }}>—</span>
    }},
  ], [])

  const metalsItems = useMemo(() =>
    spotList.filter((s: any) => ['GOLD', 'SILVER'].includes(s.symbol)),
    [spotList]
  )

  const psdColumns = useMemo(() => [
    { key: 'country', header: 'COUNTRY', type: 'text' as const, width: '120px', render: (row: any) => (
      <span style={{ color: color.textPrimary, fontWeight: 600 }}>{row.country ?? row.Country ?? '—'}</span>
    )},
    { key: 'commodity', header: 'COMMODITY', type: 'text' as const, width: '100px' },
    { key: 'year', header: 'YEAR', type: 'text' as const, width: '60px' },
    { key: 'production', header: 'PRODUCTION', type: 'number' as const, width: '100px' },
    { key: 'domestic_consumption', header: 'CONSUMPTION', type: 'number' as const, width: '100px' },
    { key: 'exports', header: 'EXPORTS', type: 'number' as const, width: '90px' },
  ], [])

  const outlookSeries = useMemo(() => {
    if (!outlook?.observations) return null
    return outlook.observations.filter((o: any) => o.value != null)
  }, [outlook])

  return (
    <Panel title="COMMODITIES" actions={<LiveDot label={isLoading ? 'LOADING' : 'LIVE'} active={!isLoading} />}>
      <LoadingBar loading={isLoading} />

      <div style={{ padding: '8px 12px 0', borderBottom: `1px solid ${color.borderSubtle}` }}>
        <TabBar tabs={TABS} activeKey={activeTab} onChange={(k) => setActiveTab(k as Tab)} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 12px' }}>
        {activeTab === 'ENERGY' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px' }}>
              {energySpotItems.map((s: any) => (
                <MetricCard
                  key={s.symbol}
                  label={s.name}
                  value={s.price != null ? `$${s.price.toFixed(2)}` : '—'}
                  sub={s.change_pct != null ? `${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%` : undefined}
                  color={s.change_pct != null ? (s.change_pct >= 0 ? color.accentPositive : color.accentNegative) : undefined}
                />
              ))}
            </div>

            <div style={{ padding: '0 16px' }}>
              <div style={{ color: color.textSecondary, fontSize: 11, fontFamily: font.sans, fontWeight: 600, marginBottom: 6, marginTop: 8 }}>
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

            {outlookSeries && outlookSeries.length > 0 && (
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ color: color.textSecondary, fontSize: 11, fontFamily: font.sans, fontWeight: 600, marginBottom: 6 }}>
                  STEO OUTLOOK — {outlook.title || 'EIA'}
                </div>
                <div style={{ background: 'rgba(19, 22, 25, 0.6)', border: `1px solid ${color.borderSubtle}`, padding: 12 }}>
                  <Sparkline
                    data={outlookSeries.map((o: any) => o.value)}
                    width={440}
                    height={100}
                    color={color.textPrimary}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ color: color.textTertiary, fontSize: 10, fontFamily: font.mono }}>
                      {outlookSeries[0]?.date}
                    </span>
                    <span style={{ color: color.textPrimary, fontSize: 11, fontFamily: font.mono, fontWeight: 700 }}>
                      Latest: {outlookSeries[outlookSeries.length - 1]?.value}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {energyStocks?.data && energyStocks.data.length > 0 && (
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ color: color.textSecondary, fontSize: 11, fontFamily: font.sans, fontWeight: 600, marginBottom: 6 }}>
                  PETROLEUM STOCKS (EIA)
                </div>
                <DataGrid
                  columns={[
                    { key: 'series', header: 'SERIES', type: 'text' as const, render: (row: any) => (
                      <span style={{ color: color.textPrimary }}>{row.series ?? row.Series ?? row.name ?? '—'}</span>
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

        {activeTab === 'METALS' && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ color: color.textSecondary, fontSize: 11, fontFamily: font.sans, fontWeight: 600, marginBottom: 8 }}>
              SPOT PRICES
            </div>
            <DataGrid
              columns={metalsColumns}
              data={metalsItems as any[]}
              keyField="symbol"
              maxHeight="300px"
              emptyMessage="No metals data available"
            />

            <div style={{ marginTop: 16 }}>
              <div style={{ color: color.textPrimary, fontSize: 11, fontWeight: 700, marginBottom: 6, fontFamily: font.mono }}>QUICK ACCESS</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['GC=F GP', 'SI=F GP'].map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => onNavigate(cmd)}
                    style={{
                      background: 'rgba(19, 22, 25, 0.6)',
                      color: color.textPrimary,
                      border: `1px solid ${color.borderSubtle}`,
                      padding: '5px 12px',
                      fontSize: 11,
                      fontFamily: font.mono,
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = color.bgHover; e.currentTarget.style.borderColor = color.borderMedium }}
                    onMouseLeave={e => { e.currentTarget.style.background = color.bgElevated; e.currentTarget.style.borderColor = color.borderSubtle }}
                  >
                    {cmd.replace(' GP', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'AGRICULTURE' && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ color: color.textSecondary, fontSize: 11, fontFamily: font.sans, fontWeight: 600, marginBottom: 8 }}>
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
                <div style={{ padding: 24, color: color.textTertiary, textAlign: 'center' }}>
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