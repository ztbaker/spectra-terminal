import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchIndices } from '../../lib/api'
import theme from '../../lib/theme'
import { usePriceFlash } from '../../lib/usePriceFlash'
import LiveDot from '../shared/LiveDot'
import Sparkline from '../shared/Sparkline'
import type { IndexQuote } from '../../types'

const { color, font } = theme

// ─── Market status ────────────────────────────────────────────────────────────

type MarketStatus = 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED'

function getMarketStatus(now: Date): MarketStatus {
  // Convert to US Eastern time
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et = new Date(etString)

  const day = et.getDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return 'CLOSED'

  const hours = et.getHours()
  const minutes = et.getMinutes()
  const totalMinutes = hours * 60 + minutes

  // 04:00 – 09:29 pre-market
  // 09:30 – 15:59 open
  // 16:00 – 20:00 after-hours
  // otherwise closed
  if (totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30) return 'PRE'
  if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60) return 'OPEN'
  if (totalMinutes >= 16 * 60 && totalMinutes < 20 * 60) return 'AFTER'
  return 'CLOSED'
}

function marketStatusDotColor(status: MarketStatus): string {
  switch (status) {
    case 'OPEN':   return color.accentPositive
    case 'PRE':    return color.accentWarning
    case 'AFTER':  return color.accentWarning
    case 'CLOSED': return color.accentNegative
  }
}

function marketStatusLabel(status: MarketStatus): string {
  switch (status) {
    case 'OPEN':   return 'OPEN'
    case 'PRE':    return 'PRE'
    case 'AFTER':  return 'AFTER'
    case 'CLOSED': return 'CLOSED'
  }
}

// ─── Clocks ───────────────────────────────────────────────────────────────────

function formatClock(date: Date, timeZone: string): string {
  return date.toLocaleTimeString('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ─── Ticker tape formatting ───────────────────────────────────────────────────

function generateMicroSparkline(quote: IndexQuote): (number | null)[] {
  // Generate a deterministic mini sparkline from the change data.
  // Since we don't have historical data for indices in the ticker tape,
  // we create a synthetic 8-point sparkline based on price and change.
  if (quote.price === null || quote.change === null) return []
  const start = quote.price - (quote.change || 0)
  const end = quote.price
  const points: number[] = []
  for (let i = 0; i < 8; i++) {
    const t = i / 7
    // Add slight variation for visual interest
    const noise = (Math.sin(i * 2.7 + start) * 0.3 + Math.cos(i * 1.3 + end) * 0.2) * Math.abs(quote.change || 0.5) * 0.15
    points.push(start + (end - start) * t + noise)
  }
  return points
}

function IndexPrice({ quote }: { quote: IndexQuote }) {
  const { flashStyle, triggerFlash } = usePriceFlash()
  const prevPriceRef = useRef<number | null>(null)

  // Trigger flash on price change
  useEffect(() => {
    if (quote.price !== null) {
      triggerFlash(quote.price, prevPriceRef.current)
      prevPriceRef.current = quote.price
    }
  }, [quote.price, triggerFlash])

  const price = quote.price !== null ? quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'

  return <span style={{ color: color.textPrimary, ...flashStyle }}>{price}</span>
}

function IndexItem({ q }: { q: IndexQuote }): React.ReactElement {
  const change = q.change !== null ? q.change.toFixed(2) : '\u2014'
  const pct = q.change_pct !== null ? q.change_pct.toFixed(2) : '\u2014'
  const isPos = q.change !== null && q.change > 0
  const isNeg = q.change !== null && q.change < 0

  const chgColor = isPos ? color.accentPositive : isNeg ? color.accentNegative : color.textSecondary
  const sign = isPos ? '+' : ''

  const sparkData = generateMicroSparkline(q)
  const sparkColor = isPos ? color.accentPositive : isNeg ? color.accentNegative : color.textTertiary

  return (
    <span style={{ marginRight: '28px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ color: color.textSecondary }}>{q.label}</span>
      <IndexPrice quote={q} />
      <span style={{ color: chgColor }}>{sign}{change} ({sign}{pct}%)</span>
      {sparkData.length >= 2 && (
        <Sparkline data={sparkData} width={32} height={8} color={sparkColor} />
      )}
    </span>
  )
}

// ─── Marquee animation styles (injected once) ─────────────────────────────────

const MARQUEE_STYLE_ID = 'bb-marquee-keyframes'

// ─── Backend health check ─────────────────────────────────────────────────────

function useBackendHealth(): boolean {
  const { data } = useQuery<{ status: string }>({
    queryKey: ['health'],
    queryFn: async () => {
      try {
        const resp = await fetch('/api/health')
        if (!resp.ok) throw new Error('unhealthy')
        return resp.json()
      } catch {
        return { status: 'error' }
      }
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  })

  return data?.status === 'ok'
}

// ─── Component ────────────────────────────────────────────────────────────────

const StatusBar: React.FC = () => {
  const [now, setNow] = useState(() => new Date())
  const marqueeRef = useRef<HTMLDivElement>(null)
  const backendHealthy = useBackendHealth()

  // Clock tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch indices every 30 seconds
  const { data: indices } = useQuery<IndexQuote[]>({
    queryKey: ['indices'],
    queryFn: fetchIndices,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })

  // Set up marquee keyframe once we know the inner div width
  useEffect(() => {
    if (!marqueeRef.current) return
    const w = marqueeRef.current.scrollWidth || 800
    // Remove previous style so it regenerates if data changes
    const existing = document.getElementById(MARQUEE_STYLE_ID)
    if (existing) existing.remove()
    const style = document.createElement('style')
    style.id = MARQUEE_STYLE_ID
    style.textContent = `
      @keyframes bb-marquee {
        0%   { transform: translateX(100vw); }
        100% { transform: translateX(-${w}px); }
      }
    `
    document.head.appendChild(style)
  }, [indices])

  const status = getMarketStatus(now)
  const statusDotColor = marketStatusDotColor(status)
  const statusLabel = marketStatusLabel(status)

  const nyTime  = formatClock(now, 'America/New_York')
  const lonTime = formatClock(now, 'Europe/London')
  const tkyTime = formatClock(now, 'Asia/Tokyo')

  const hasIndices = indices && indices.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '28px',
        background: color.bgElevated,
        borderTop: `1px solid ${color.borderSubtle}`,
        fontFamily: font.mono,
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* ── Left: market status pill with pulsing dot ── */}
      <div
        style={{
          paddingLeft: '10px',
          paddingRight: '10px',
          whiteSpace: 'nowrap',
          borderRight: `1px solid ${color.borderSubtle}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <LiveDot
          size={6}
          color={statusDotColor}
          active={status === 'OPEN' || status === 'PRE' || status === 'AFTER'}
        />
        <span
          style={{
            color: status === 'OPEN' ? color.accentPositive : status === 'CLOSED' ? color.accentNegative : color.accentWarning,
            fontSize: '10px',
            letterSpacing: '0.08em',
            fontFamily: font.mono,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* ── Center: scrolling ticker tape ── */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {hasIndices ? (
          <div
            ref={marqueeRef}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              animation: 'bb-marquee 40s linear infinite',
              whiteSpace: 'nowrap',
              willChange: 'transform',
            }}
          >
            {indices.map(q => (
              <IndexItem key={q.ticker} q={q} />
            ))}
            {/* Duplicate for seamless loop */}
            {indices.map(q => (
              <IndexItem key={`${q.ticker}-dup`} q={q} />
            ))}
          </div>
        ) : (
          <span style={{ color: color.textTertiary, paddingLeft: '8px' }}>
            LOADING MARKET DATA...
          </span>
        )}
      </div>

      {/* ── Right: clocks with thin separators + connection indicator ── */}
      <div
        style={{
          paddingLeft: '10px',
          paddingRight: '10px',
          whiteSpace: 'nowrap',
          borderLeft: `1px solid ${color.borderSubtle}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          flexShrink: 0,
        }}
      >
        {/* NY */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: color.textTertiary, fontSize: '10px', letterSpacing: '0.06em' }}>NY</span>
          <span style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{nyTime}</span>
        </span>

        {/* Thin separator */}
        <span style={{
          width: '1px',
          height: '12px',
          background: color.borderMedium,
          margin: '0 8px',
          display: 'inline-block',
        }} />

        {/* LON */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: color.textTertiary, fontSize: '10px', letterSpacing: '0.06em' }}>LON</span>
          <span style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{lonTime}</span>
        </span>

        {/* Thin separator */}
        <span style={{
          width: '1px',
          height: '12px',
          background: color.borderMedium,
          margin: '0 8px',
          display: 'inline-block',
        }} />

        {/* TKY */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: color.textTertiary, fontSize: '10px', letterSpacing: '0.06em' }}>TKY</span>
          <span style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{tkyTime}</span>
        </span>

        {/* Thin separator */}
        <span style={{
          width: '1px',
          height: '12px',
          background: color.borderMedium,
          margin: '0 8px',
          display: 'inline-block',
        }} />

        {/* Connection indicator */}
        <LiveDot
          size={6}
          color={backendHealthy ? color.accentPositive : color.accentNegative}
          active={true}
          label={backendHealthy ? 'LIVE' : 'OFFLINE'}
        />
      </div>
    </div>
  )
}

export default StatusBar