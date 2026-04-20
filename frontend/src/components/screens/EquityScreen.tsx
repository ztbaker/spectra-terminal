import Panel from '../Terminal/Panel'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEquity, fetchChart } from '../../lib/api'
import { useLivePrice } from '../../hooks/useLivePrice'
import { usePriceFlash } from '../../lib/usePriceFlash'
import LoadingBar from '../shared/LoadingBar'
import TickerBadge from '../shared/TickerBadge'
import Sparkline from '../shared/Sparkline'
import theme from '../../lib/theme'

const { color, font } = theme

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
        style={{ position: 'relative', height: '3px', background: color.borderSubtle, borderRadius: '2px' }}
      >
        {pct != null && (
          <>
            <div
              style={{ width: `${pct}%`, background: color.textSecondary, height: '100%', position: 'absolute', left: 0, top: 0, borderRadius: '2px' }}
            />
            <div
              style={{
                left: `${pct}%`,
                position: 'absolute',
                top: '-2px',
                width: '7px',
                height: '7px',
                background: color.textPrimary,
                borderRadius: '50%',
                transform: 'translateX(-50%)',
              }}
            />
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans }}>{label}:</span>
        <span style={{ fontSize: '11px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: color.textPrimary }}>{formatPrice(low)}</span>
          <span style={{ color: color.textTertiary, margin: '0 6px' }}>──●──</span>
          <span style={{ color: color.textPrimary }}>{formatPrice(high)}</span>
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

  const barColor = pct != null && pct >= 100 ? color.textPrimary : color.textSecondary

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans, fontWeight: 500 }}>Volume</span>
        <span style={{ fontSize: '11px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: color.textPrimary }}>{formatLarge(volume)}</span>
          <span style={{ color: color.textTertiary }}> / avg </span>
          <span style={{ color: color.textPrimary }}>{formatLarge(avgVolume)}</span>
          {pct != null && (
            <span style={{ color: barColor, marginLeft: '6px' }}>({pct.toFixed(0)}%)</span>
          )}
        </span>
      </div>
      <div style={{ height: '3px', background: color.borderSubtle, position: 'relative', borderRadius: '2px' }}>
        {pct != null && (
          <div
            style={{
              width: `${Math.min(100, pct)}%`,
              height: '100%',
              background: barColor,
              position: 'absolute',
              left: 0,
              top: 0,
              borderRadius: '2px',
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
  <div style={{ padding: '12px', color: color.textTertiary, opacity: 0.4 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
      {/* Loading bar */}
      <LoadingBar loading={isLoading} />

      {/* Error */}
      {error && !isLoading && (
        <div style={{ padding: '12px', color: color.accentNegative, fontSize: '12px', fontFamily: font.sans, borderBottom: `1px solid ${color.borderSubtle}` }}>
          ERR: {(error as Error).message ?? 'Failed to load equity data'}
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '1px' }}>

        {/* ── LEFT PANEL (60%) ─────────────────────────────────────── */}
        <div style={{ width: '60%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <Panel
            title={`Equity — ${ticker}`}
            actions={
              equity?.exchange
                ? <span style={{ color: color.textTertiary, fontSize: '11px', fontFamily: font.sans }}>{equity.exchange}</span>
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
                    <span style={{ fontSize: '24px', color: color.ticker, fontWeight: 700, fontFamily: font.mono, letterSpacing: '0.02em' }}>
                      {ticker}
                    </span>
                    {equity?.company_name && (
                      <span style={{ fontSize: '14px', color: color.textSecondary, fontFamily: font.sans }}>
                        {equity.company_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Price Block ── */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '32px', color: color.textPrimary, fontWeight: 500, fontFamily: font.mono, fontVariantNumeric: 'tabular-nums', ...priceFlashStyle }}>
                    {formatPrice(livePrice)}
                  </span>
                  <TickerBadge value={liveChange ?? null} decimals={2} />
                  <TickerBadge value={liveChangePct ?? null} pct decimals={2} />
                  {equity?.currency && (
                    <span style={{ fontSize: '12px', color: color.textTertiary, fontFamily: font.sans }}>{equity.currency}</span>
                  )}
                </div>

                {/* ── Bid × Ask ── */}
                <div
                  style={{
                    display: 'flex',
                    gap: '24px',
                    marginBottom: '14px',
                    padding: '6px 8px',
                    background: 'rgba(19, 22, 25, 0.6)',
                    border: `1px solid ${color.borderSubtle}`,
                    borderRadius: '4px',
                  }}
                >
                  <div>
                    <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans }}>BID </span>
                    <span style={{ color: color.textPrimary, fontSize: '12px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>{formatPrice(liveBid)}</span>
                  </div>
                  <span style={{ color: color.borderSubtle }}>×</span>
                  <div>
                    <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans }}>ASK </span>
                    <span style={{ color: color.textPrimary, fontSize: '12px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>{formatPrice(liveAsk)}</span>
                  </div>
                  {liveBid != null && liveAsk != null && (
                    <div style={{ marginLeft: 'auto' }}>
                      <span style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans }}>SPREAD </span>
                      <span style={{ color: color.textPrimary, fontSize: '12px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(liveAsk - liveBid, 3)}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Day Range ── */}
                <RangeBar
                  label="Day"
                  low={liveDayLow ?? null}
                  high={liveDayHigh ?? null}
                  current={livePrice ?? null}
                />
                <RangeBar
                  label="52wk"
                  low={equity?.low_52w ?? null}
                  high={equity?.high_52w ?? null}
                  current={livePrice ?? null}
                />
                <VolumeBar volume={liveVolume ?? null} avgVolume={equity?.avg_volume ?? null} />

                {/* ── Separator ── */}
                <div style={{ height: '1px', background: color.borderSubtle, margin: '12px 0' }} />

                {/* ── Key Stats Grid ── */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0',
                    border: `1px solid ${color.borderSubtle}`,
                    borderRadius: '4px',
                    marginBottom: '14px',
                    overflow: 'hidden',
                  }}
                >
                  {[
                    { label: 'P/E ratio',   value: formatPrice(equity?.pe_ratio, 2) },
                    { label: 'EPS',         value: formatPrice(equity?.eps, 2) },
                    { label: 'Mkt cap',     value: formatLarge(equity?.market_cap) },
                    { label: 'Beta',        value: formatPrice(equity?.beta, 2) },
                    { label: 'Div yield',   value: equity?.dividend_yield != null ? formatPct(equity.dividend_yield) : '—' },
                    { label: 'Exchange',    value: equity?.exchange ?? '—' },
                    { label: 'Shares out',  value: formatLarge(equity?.shares_outstanding) },
                    { label: 'Float',       value: formatLarge(equity?.float_shares) },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 8px',
                        borderRight: idx % 4 !== 3 ? `1px solid ${color.borderSubtle}` : undefined,
                        borderBottom: idx < 4 ? `1px solid ${color.borderSubtle}` : undefined,
                        background: Math.floor(idx / 4) % 2 === 1 ? color.bgElevated : 'transparent',
                      }}
                    >
                      <div style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans, marginBottom: '2px' }}>
                        {item.label}
                      </div>
                      <div style={{ color: color.textPrimary, fontSize: '12px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                    </div>
                  ))}

                  {/* Sector | Industry | Currency */}
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRight: `1px solid ${color.borderSubtle}`,
                      borderTop: `1px solid ${color.borderSubtle}`,
                    }}
                  >
                    <div style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans, marginBottom: '2px' }}>Sector</div>
                    <div style={{ color: color.textPrimary, fontSize: '11px', fontFamily: font.sans }}>{equity?.sector ?? '—'}</div>
                  </div>
                  <div
                    style={{
                      gridColumn: 'span 2',
                      padding: '6px 8px',
                      borderRight: `1px solid ${color.borderSubtle}`,
                      borderTop: `1px solid ${color.borderSubtle}`,
                    }}
                  >
                    <div style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans, marginBottom: '2px' }}>Industry</div>
                    <div style={{ color: color.textPrimary, fontSize: '11px', fontFamily: font.sans }}>{equity?.industry ?? '—'}</div>
                  </div>
                  <div
                    style={{
                      padding: '6px 8px',
                      borderTop: `1px solid ${color.borderSubtle}`,
                    }}
                  >
                    <div style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans, marginBottom: '2px' }}>Currency</div>
                    <div style={{ color: color.textPrimary, fontSize: '12px', fontFamily: font.mono }}>{equity?.currency ?? '—'}</div>
                  </div>
                </div>

                {/* ── Description ── */}
                {equity?.description && (
                  <div
                    style={{
                      border: `1px solid ${color.borderSubtle}`,
                      borderRadius: '4px',
                      padding: '8px',
                      background: 'rgba(19, 22, 25, 0.6)',
                    }}
                  >
                    <div style={{ color: color.textSecondary, fontSize: '10px', fontFamily: font.sans, marginBottom: '4px' }}>Description</div>
                    <p
                      style={{
                        color: color.textPrimary,
                        fontSize: '12px',
                        fontFamily: font.sans,
                        lineHeight: '1.5',
                        margin: 0,
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: descExpanded ? 'unset' : 3,
                        overflow: 'hidden',
                      }}
                    >
                      {equity.description}
                    </p>
                    <button
                      style={{
                        marginTop: '6px',
                        fontSize: '11px',
                        background: 'transparent',
                        border: `1px solid ${color.borderSubtle}`,
                        color: color.textSecondary,
                        cursor: 'pointer',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontFamily: font.sans,
                      }}
                      onClick={() => setDescExpanded(v => !v)}
                    >
                      {descExpanded ? 'Collapse' : 'Expand'}
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
          <Panel title={`${ticker} — 5D price`}>
            <div style={{ padding: '10px' }}>
              {sparklineData.length >= 2 ? (
                <div style={{ textAlign: 'center' }}>
                  <Sparkline
                    data={sparklineData}
                    width={260}
                    height={80}
                    color={isPositive ? color.accentPositive : color.accentNegative}
                  />
                  <div style={{ marginTop: '4px', fontSize: '11px', color: color.textTertiary, fontFamily: font.sans }}>
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
                    border: `1px dashed ${color.borderSubtle}`,
                    color: color.textTertiary,
                    fontSize: '12px',
                    fontFamily: font.sans,
                    borderRadius: '4px',
                  }}
                >
                  Type&nbsp;
                  <button
                    style={{
                      fontSize: '11px',
                      margin: '0 4px',
                      background: 'transparent',
                      border: `1px solid ${color.borderSubtle}`,
                      color: color.textSecondary,
                      cursor: 'pointer',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: font.mono,
                    }}
                    onClick={() => onNavigate(`${ticker} GP`)}
                  >
                    GP
                  </button>
                  &nbsp;for chart
                </div>
              )}
            </div>
          </Panel>

          {/* Quick command buttons */}
          <Panel title="Quick actions">
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
                  style={{
                    padding: '6px 0',
                    fontSize: '12px',
                    fontFamily: font.mono,
                    border: `1px solid ${color.borderSubtle}`,
                    background: 'rgba(19, 22, 25, 0.6)',
                    color: color.textSecondary,
                    textAlign: 'center',
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    transition: 'background 150ms ease',
                  }}
                  onClick={() => onNavigate(cmd)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Panel>

          {/* OHLC / Session Stats */}
          <Panel title="Session stats">
            <div style={{ padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'Open',       value: formatPrice(equity?.open) },
                    { label: 'Prev close', value: formatPrice(equity?.prev_close) },
                    { label: 'Day high',   value: formatPrice(equity?.day_high) },
                    { label: 'Day low',    value: formatPrice(equity?.day_low) },
                  ].map(({ label, value }) => (
                    <tr key={label}>
                      <td style={{ color: color.textSecondary, fontSize: '11px', padding: '4px 8px', fontFamily: font.sans }}>{label}</td>
                      <td style={{ textAlign: 'right', color: color.textPrimary, fontSize: '12px', padding: '4px 8px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Valuation */}
          <Panel title="Valuation">
            <div style={{ padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'P/E ratio',  value: formatPrice(equity?.pe_ratio, 2) },
                    { label: 'EPS (TTM)',  value: formatPrice(equity?.eps, 2) },
                    { label: 'Mkt cap',   value: formatLarge(equity?.market_cap) },
                    { label: 'Beta',       value: formatPrice(equity?.beta, 2) },
                    { label: 'Div yield',  value: equity?.dividend_yield != null ? formatPct(equity.dividend_yield) : '—' },
                    { label: '52W high',   value: formatPrice(equity?.high_52w) },
                    { label: '52W low',    value: formatPrice(equity?.low_52w) },
                  ].map(({ label, value }) => (
                    <tr key={label}>
                      <td style={{ color: color.textSecondary, fontSize: '11px', padding: '3px 8px', fontFamily: font.sans }}>{label}</td>
                      <td style={{ textAlign: 'right', color: color.textPrimary, fontSize: '12px', padding: '3px 8px', fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' }}>
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
