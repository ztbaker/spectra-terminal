import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEquity, fetchChart } from '../../lib/api'
import { useLivePrice } from '../../hooks/useLivePrice'
import { usePriceFlash } from '../../lib/usePriceFlash'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'
import Sparkline from '../shared/Sparkline'
import C from '../../lib/colors'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatPrice(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function formatLarge(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (abs >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return n.toFixed(2)
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return (n * 100).toFixed(2) + '%'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface RangeBarProps {
  low: number | null
  high: number | null
  current: number | null
  label: string
}

const RangeBar: React.FC<RangeBarProps> = ({ low, high, current, label }) => {
  const pct =
    low != null && high != null && current != null && high !== low
      ? Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100))
      : null

  return (
    <div style={{ marginBottom: '10px' }}>
      <div
        className="bb-range-bar"
        style={{ position: 'relative', height: '4px', background: C.border1, borderRadius: '2px' }}
      >
        {pct != null && (
          <>
            <div
              className="bb-range-fill"
              style={{ width: `${pct}%`, background: C.amber, height: '100%', position: 'absolute', left: 0, top: 0 }}
            />
            <div
              className="bb-range-dot"
              style={{
                left: `${pct}%`,
                position: 'absolute',
                top: '-2px',
                width: '8px',
                height: '8px',
                background: C.amberBright,
                borderRadius: '50%',
                transform: 'translateX(-50%)',
              }}
            />
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span className="bb-label">{label}:</span>
        <span style={{ color: C.amberDim, fontSize: '11px' }}>
          <span style={{ color: C.white }}>{formatPrice(low)}</span>
          <span style={{ color: C.amberMute, margin: '0 6px' }}>──●──</span>
          <span style={{ color: C.white }}>{formatPrice(high)}</span>
        </span>
      </div>
    </div>
  )
}

interface VolumeBarProps {
  volume: number | null
  avgVolume: number | null
}

const VolumeBar: React.FC<VolumeBarProps> = ({ volume, avgVolume }) => {
  const pct =
    volume != null && avgVolume != null && avgVolume > 0
      ? Math.min(150, (volume / avgVolume) * 100)
      : null

  const color = pct != null && pct >= 100 ? C.amber : C.amberDim

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span className="bb-label">VOLUME</span>
        <span className="bb-label">
          <span style={{ color: C.white }}>{formatLarge(volume)}</span>
          <span style={{ color: C.amberMute }}> / avg </span>
          <span style={{ color: C.white }}>{formatLarge(avgVolume)}</span>
          {pct != null && (
            <span style={{ color: color, marginLeft: '6px' }}>({pct.toFixed(0)}%)</span>
          )}
        </span>
      </div>
      <div style={{ height: '4px', background: C.border1, position: 'relative', borderRadius: '2px' }}>
        {pct != null && (
          <div
            style={{
              width: `${Math.min(100, pct)}%`,
              height: '100%',
              background: color,
              position: 'absolute',
              left: 0,
              top: 0,
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

const SKELETON_WIDTHS = [8, 12, 6, 10, 8, 14, 6, 12]

const SkeletonRows: React.FC = () => (
  <div style={{ padding: '12px', color: C.amber, opacity: 0.4 }}>
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{ marginBottom: '8px', fontSize: '13px' }}>
        {'█'.repeat(SKELETON_WIDTHS[i % SKELETON_WIDTHS.length])}
      </div>
    ))}
  </div>
)

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  ticker: string
  onNavigate: (cmd: string) => void
}

const EquityScreen: React.FC<Props> = ({ ticker, onNavigate }) => {
  const [descExpanded, setDescExpanded] = useState(false)

  const { data: equity, isLoading, error } = useQuery({
    queryKey: ['equity', ticker],
    queryFn: () => fetchEquity(ticker),
    staleTime: 60_000,
  })

  const { data: liveData } = useLivePrice(ticker, 500, true)

  const { data: chartData } = useQuery({
    queryKey: ['chart', ticker, '5d', '15m'],
    queryFn: () => fetchChart(ticker, '5d', '15m'),
    staleTime: 60_000,
    enabled: !!ticker,
  })

  const sparklineData: number[] = chartData?.ohlcv?.map(b => b.close) ?? []

  const livePrice = liveData?.price ?? equity?.price
  const liveChange = liveData?.change ?? equity?.change
  const liveChangePct = liveData?.change_pct ?? equity?.change_pct
  const liveBid = liveData?.bid ?? equity?.bid
  const liveAsk = liveData?.ask ?? equity?.ask
  const liveVolume = liveData?.volume ?? equity?.volume
  const liveDayHigh = liveData?.day_high ?? equity?.day_high
  const liveDayLow = liveData?.day_low ?? equity?.day_low

  // Price flash hook for live-updating price
  const { flashStyle: priceFlashStyle, triggerFlash: triggerPriceFlash } = usePriceFlash()
  const prevPriceRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (livePrice != null && typeof livePrice === 'number') {
      triggerPriceFlash(livePrice, prevPriceRef.current)
      prevPriceRef.current = livePrice
    }
  }, [livePrice, triggerPriceFlash])

  const isPositive = (liveChange ?? 0) >= 0

  const quickActions = [
    { label: 'GP',      cmd: `${ticker} GP` },
    { label: 'OPT',     cmd: `${ticker} OPT` },
    { label: 'NEWS',    cmd: `${ticker} NEWS` },
    { label: 'FILINGS', cmd: `${ticker} FILINGS` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface0 }}>
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Error */}
      {error && !isLoading && (
        <div style={{ padding: '12px', color: C.red, fontSize: '12px', borderBottom: `1px solid ${C.border1}` }}>
          ERR: {(error as Error).message ?? 'Failed to load equity data'}
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '1px' }}>

        {/* ── LEFT PANEL (60%) ─────────────────────────────────────── */}
        <div style={{ width: '60%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <Panel
            title={`EQUITY — ${ticker}`}
            actions={
              equity?.exchange
                ? <span style={{ color: C.amberDim, fontSize: '11px' }}>{equity.exchange}</span>
                : undefined
            }
          >
            {isLoading && !equity ? (
              <SkeletonRows />
            ) : (
              <div style={{ padding: '12px' }}>

                {/* ── Ticker + Company Name ── */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <span style={{ fontSize: '24px', color: C.amber, fontWeight: 700, letterSpacing: '0.05em' }}>
                      {ticker}
                    </span>
                    {equity?.company_name && (
                      <span style={{ fontSize: '14px', color: C.amberDim }}>
                        {equity.company_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Price Block ── */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '32px', color: C.white, fontWeight: 500, ...priceFlashStyle }}>
                    {formatPrice(livePrice)}
                  </span>
                  <TickerBadge value={liveChange ?? null} decimals={2} />
                  <TickerBadge value={liveChangePct ?? null} pct decimals={2} />
                  {equity?.currency && (
                    <span style={{ fontSize: '12px', color: C.amberMute }}>{equity.currency}</span>
                  )}
                </div>

                {/* ── Bid × Ask ── */}
                <div
                  style={{
                    display: 'flex',
                    gap: '24px',
                    marginBottom: '14px',
                    padding: '6px 8px',
                    background: C.surface1,
                    border: `1px solid ${C.border1}`,
                  }}
                >
                  <div>
                    <span className="bb-label">BID </span>
                    <span className="bb-value">{formatPrice(liveBid)}</span>
                  </div>
                  <span style={{ color: C.border1 }}>×</span>
                  <div>
                    <span className="bb-label">ASK </span>
                    <span className="bb-value">{formatPrice(liveAsk)}</span>
                  </div>
                  {liveBid != null && liveAsk != null && (
                    <div style={{ marginLeft: 'auto' }}>
                      <span className="bb-label">SPREAD </span>
                      <span style={{ color: C.amberBright, fontSize: '12px' }}>
                        {formatPrice(liveAsk - liveBid, 3)}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Day Range ── */}
                <RangeBar
                  label="DAY"
                  low={liveDayLow ?? null}
                  high={liveDayHigh ?? null}
                  current={livePrice ?? null}
                />
                <RangeBar
                  label="52WK"
                  low={equity?.low_52w ?? null}
                  high={equity?.high_52w ?? null}
                  current={livePrice ?? null}
                />
                <VolumeBar volume={liveVolume ?? null} avgVolume={equity?.avg_volume ?? null} />

                {/* ── Separator ── */}
                <div style={{ height: '1px', background: C.border1, margin: '12px 0' }} />

                {/* ── Key Stats Grid ── */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0',
                    border: `1px solid ${C.border1}`,
                    marginBottom: '14px',
                  }}
                >
                  {[
                    { label: 'P/E RATIO',   value: formatPrice(equity?.pe_ratio, 2) },
                    { label: 'EPS',         value: formatPrice(equity?.eps, 2) },
                    { label: 'MKT CAP',     value: formatLarge(equity?.market_cap) },
                    { label: 'BETA',        value: formatPrice(equity?.beta, 2) },
                    { label: 'DIV YIELD',   value: equity?.dividend_yield != null ? formatPct(equity.dividend_yield) : '—' },
                    { label: 'EXCHANGE',    value: equity?.exchange ?? '—' },
                    { label: 'SHARES OUT',  value: formatLarge(equity?.shares_outstanding) },
                    { label: 'FLOAT',       value: formatLarge(equity?.float_shares) },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 8px',
                        borderRight: idx % 4 !== 3 ? `1px solid ${C.border1}` : undefined,
                        borderBottom: idx < 4 ? `1px solid ${C.border1}` : undefined,
                        background: Math.floor(idx / 4) % 2 === 1 ? C.surfaceGlow : 'transparent',
                      }}
                    >
                      <div className="bb-label" style={{ fontSize: '10px', marginBottom: '2px' }}>
                        {item.label}
                      </div>
                      <div style={{ color: C.white, fontSize: '12px' }}>{item.value}</div>
                    </div>
                  ))}

                  {/* Sector (span 1) | Industry (span 2) | Currency (span 1) */}
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRight: `1px solid ${C.border1}`,
                      borderTop: `1px solid ${C.border1}`,
                    }}
                  >
                    <div className="bb-label" style={{ fontSize: '10px', marginBottom: '2px' }}>SECTOR</div>
                    <div style={{ color: C.white, fontSize: '11px' }}>{equity?.sector ?? '—'}</div>
                  </div>
                  <div
                    style={{
                      gridColumn: 'span 2',
                      padding: '6px 8px',
                      borderRight: `1px solid ${C.border1}`,
                      borderTop: `1px solid ${C.border1}`,
                    }}
                  >
                    <div className="bb-label" style={{ fontSize: '10px', marginBottom: '2px' }}>INDUSTRY</div>
                    <div style={{ color: C.white, fontSize: '11px' }}>{equity?.industry ?? '—'}</div>
                  </div>
                  <div
                    style={{
                      padding: '6px 8px',
                      borderTop: `1px solid ${C.border1}`,
                    }}
                  >
                    <div className="bb-label" style={{ fontSize: '10px', marginBottom: '2px' }}>CURRENCY</div>
                    <div style={{ color: C.white, fontSize: '12px' }}>{equity?.currency ?? '—'}</div>
                  </div>
                </div>

                {/* ── Description ── */}
                {equity?.description && (
                  <div
                    style={{
                      border: `1px solid ${C.border1}`,
                      padding: '8px',
                      background: C.surface1,
                    }}
                  >
                    <div className="bb-label" style={{ marginBottom: '4px' }}>DESCRIPTION</div>
                    <p
                      style={{
                        color: C.white,
                        fontSize: '11px',
                        lineHeight: '1.5',
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: descExpanded ? 'unset' : 3,
                        overflow: 'hidden',
                      }}
                    >
                      {equity.description}
                    </p>
                    <button
                      className="bb-btn"
                      style={{ marginTop: '6px', fontSize: '10px' }}
                      onClick={() => setDescExpanded(v => !v)}
                    >
                      {descExpanded ? '[ COLLAPSE ]' : '[ EXPAND ]'}
                    </button>
                  </div>
                )}

              </div>
            )}
          </Panel>
        </div>

        {/* ── RIGHT PANEL (40%) ────────────────────────────────────── */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'auto' }}>

          {/* Sparkline / mini chart */}
          <Panel title={`${ticker} — 5D PRICE`}>
            <div style={{ padding: '10px' }}>
              {sparklineData.length >= 2 ? (
                <div style={{ textAlign: 'center' }}>
                  <Sparkline
                    data={sparklineData}
                    width={260}
                    height={80}
                    color={isPositive ? C.green : C.red}
                  />
                  <div style={{ marginTop: '4px', fontSize: '10px', color: C.amberMute }}>
                    {sparklineData.length} bars · 15m interval
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    height: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px dashed ${C.border1}`,
                    color: C.amberMute,
                    fontSize: '12px',
                  }}
                >
                  TYPE&nbsp;
                  <button
                    className="bb-btn"
                    style={{ fontSize: '11px', margin: '0 4px' }}
                    onClick={() => onNavigate(`${ticker} GP`)}
                  >
                    [ GP ]
                  </button>
                  &nbsp;FOR CHART
                </div>
              )}
            </div>
          </Panel>

          {/* Quick command buttons */}
          <Panel title="QUICK ACTIONS">
            <div
              style={{
                padding: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '6px',
              }}
            >
              {quickActions.map(({ label, cmd }) => (
                <button
                  key={label}
                  className="bb-btn"
                  style={{
                    padding: '6px 0',
                    fontSize: '12px',
                    border: `1px solid ${C.amber}`,
                    color: C.amber,
                    textAlign: 'center',
                    letterSpacing: '0.08em',
                  }}
                  onClick={() => onNavigate(cmd)}
                >
                  [{label}]
                </button>
              ))}
            </div>
          </Panel>

          {/* OHLC / Session Stats */}
          <Panel title="SESSION STATS">
            <div style={{ padding: '0' }}>
              <table className="bb-table" style={{ width: '100%' }}>
                <tbody>
                  {[
                    { label: 'OPEN',       value: formatPrice(equity?.open) },
                    { label: 'PREV CLOSE', value: formatPrice(equity?.prev_close) },
                    { label: 'DAY HIGH',   value: formatPrice(equity?.day_high) },
                    { label: 'DAY LOW',    value: formatPrice(equity?.day_low) },
                  ].map(({ label, value }) => (
                    <tr key={label}>
                      <td style={{ color: C.amber, fontSize: '11px', padding: '4px 8px' }}>{label}</td>
                      <td style={{ textAlign: 'right', color: C.white, fontSize: '12px', padding: '4px 8px' }}>
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Additional stats if available */}
          <Panel title="VALUATION">
            <div style={{ padding: '0' }}>
              <table className="bb-table" style={{ width: '100%' }}>
                <tbody>
                  {[
                    { label: 'P/E RATIO',  value: formatPrice(equity?.pe_ratio, 2) },
                    { label: 'EPS (TTM)',  value: formatPrice(equity?.eps, 2) },
                    { label: 'MKT CAP',   value: formatLarge(equity?.market_cap) },
                    { label: 'BETA',       value: formatPrice(equity?.beta, 2) },
                    { label: 'DIV YIELD',  value: equity?.dividend_yield != null ? formatPct(equity.dividend_yield) : '—' },
                    { label: '52W HIGH',   value: formatPrice(equity?.high_52w) },
                    { label: '52W LOW',    value: formatPrice(equity?.low_52w) },
                  ].map(({ label, value }) => (
                    <tr key={label}>
                      <td style={{ color: C.amber, fontSize: '11px', padding: '3px 8px' }}>{label}</td>
                      <td style={{ textAlign: 'right', color: C.white, fontSize: '12px', padding: '3px 8px' }}>
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

        </div>
      </div>
    </div>
  )
}

export default EquityScreen
