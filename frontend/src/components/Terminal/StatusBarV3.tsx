import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchIndices } from '../../lib/api'
import C from '../../lib/colors'
import { usePriceFlash } from '../../lib/usePriceFlash'
import Sparkline from '../shared/Sparkline'
import type { IndexQuote } from '../../types'

// ─── Market status ────────────────────────────────────────────────────────────

type MarketStatus = 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED'

function getMarketStatus(now: Date): MarketStatus {
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
  if (quote.price === null || quote.change === null) return []
  const start = quote.price - (quote.change || 0)
  const end = quote.price
  const points: number[] = []
  for (let i = 0; i < 8; i++) {
    const t = i / 7
    const noise = (Math.sin(i * 2.7 + start) * 0.3 + Math.cos(i * 1.3 + end) * 0.2) * Math.abs(quote.change || 0.5) * 0.15
    points.push(start + (end - start) * t + noise)
  }
  return points
}

function IndexPrice({ quote }: { quote: IndexQuote }) {
  const { flashStyle, triggerFlash } = usePriceFlash()
  const prevPriceRef = useRef<number | null>(null)

  useEffect(() => {
    if (quote.price !== null) {
      triggerFlash(quote.price, prevPriceRef.current)
      prevPriceRef.current = quote.price
    }
  }, [quote.price, triggerFlash])

  const price = quote.price !== null ? quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

  return <span style={{ color: C.white, ...flashStyle }}>{price}</span>
}

function IndexItem({ q }: { q: IndexQuote }): React.ReactElement {
  const change = q.change !== null ? q.change.toFixed(2) : '—'
  const pct = q.change_pct !== null ? q.change_pct.toFixed(2) : '—'
  const isPos = q.change !== null && q.change > 0
  const isNeg = q.change !== null && q.change < 0

  const color = isPos ? C.green : isNeg ? C.red : C.whiteDim
  const sign = isPos ? '+' : ''

  const sparkData = generateMicroSparkline(q)
  const sparkColor = isPos ? C.cyan : isNeg ? C.red : C.amberDim

  return (
    <span style={{
      marginRight: '24px',
      whiteSpace: 'nowrap' as const,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
    }}>
      <span style={{ color: C.amber, fontFamily: C.fontMono, fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em' }}>{q.label}</span>
      <span style={{ fontFamily: C.fontMono, fontSize: '10px' }}>
        <IndexPrice quote={q} />
      </span>
      <span style={{ color, fontFamily: C.fontMono, fontSize: '9px' }}>{sign}{change} ({sign}{pct}%)</span>
      {sparkData.length >= 2 && (
        <Sparkline data={sparkData} width={24} height={8} color={sparkColor} />
      )}
    </span>
  )
}

// ─── Marquee animation keyframe injection ─────────────────────────────────────

const MARQUEE_STYLE_ID = 'bb-marquee-keyframes'

// ─── Backend health check ─────────────────────────────────────────────────────

function useBackendHealth(): boolean {
  const queryClient = useQueryClient()

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

const StatusBarV3: React.FC = () => {
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
  const isLive = status === 'OPEN' || status === 'PRE' || status === 'AFTER'

  const nyTime  = formatClock(now, 'America/New_York')
  const lonTime = formatClock(now, 'Europe/London')
  const hkTime  = formatClock(now, 'Asia/Hong_Kong')

  const hasIndices = indices && indices.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '28px',
        background: C.surface0,
        fontFamily: C.fontBody,
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000,
        overflow: 'hidden',
        borderTop: '1px solid transparent',
        backgroundImage: `linear-gradient(${C.surface0}, ${C.surface0}), linear-gradient(90deg, ${C.amberGlow}, transparent 15%, transparent 85%, ${C.amberGlow})`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      }}
    >
      {/* ── Left: market status with pulsing dot ── */}
      <div
        style={{
          paddingLeft: '10px',
          paddingRight: '10px',
          whiteSpace: 'nowrap' as const,
          borderRight: `1px solid ${C.border1}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isLive ? C.green : C.whiteGhost,
            display: 'inline-block',
            animation: isLive ? 'pulseGlow 2s ease-in-out infinite' : 'none',
            boxShadow: isLive ? `0 0 4px ${C.green}` : 'none',
          }}
        />
        <span
          style={{
            color: isLive ? C.green : C.whiteGhost,
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontFamily: C.fontBody,
          }}
        >
          {isLive ? 'LIVE' : 'CLOSED'}
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
              whiteSpace: 'nowrap' as const,
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
          <span style={{ color: C.whiteGhost, paddingLeft: '8px', fontFamily: C.fontBody, fontSize: '9px', letterSpacing: '0.08em' }}>
            LOADING MARKET DATA...
          </span>
        )}
      </div>

      {/* ── Right: clocks with thin separators + connection indicator ── */}
      <div
        style={{
          paddingLeft: '10px',
          paddingRight: '10px',
          whiteSpace: 'nowrap' as const,
          borderLeft: `1px solid ${C.border1}`,
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
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          <span style={{ color: C.whiteDim, fontSize: '9px', letterSpacing: '0.06em', fontFamily: C.fontBody, fontWeight: 500 }}>NY</span>
          <span style={{ color: C.white, fontFamily: C.fontMono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' as const }}>{nyTime}</span>
        </span>

        {/* Thin separator */}
        <span style={{
          width: '1px',
          height: '12px',
          background: C.border0,
          margin: '0 8px',
          display: 'inline-block',
        }} />

        {/* LON */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          <span style={{ color: C.whiteDim, fontSize: '9px', letterSpacing: '0.06em', fontFamily: C.fontBody, fontWeight: 500 }}>LON</span>
          <span style={{ color: C.white, fontFamily: C.fontMono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' as const }}>{lonTime}</span>
        </span>

        {/* Thin separator */}
        <span style={{
          width: '1px',
          height: '12px',
          background: C.border0,
          margin: '0 8px',
          display: 'inline-block',
        }} />

        {/* HK */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          <span style={{ color: C.whiteDim, fontSize: '9px', letterSpacing: '0.06em', fontFamily: C.fontBody, fontWeight: 500 }}>HK</span>
          <span style={{ color: C.white, fontFamily: C.fontMono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' as const }}>{hkTime}</span>
        </span>

        {/* Thin separator */}
        <span style={{
          width: '1px',
          height: '12px',
          background: C.border0,
          margin: '0 8px',
          display: 'inline-block',
        }} />

        {/* Connection indicator */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: backendHealthy ? C.green : C.red,
              display: 'inline-block',
              animation: 'pulseGlow 2s ease-in-out infinite',
              boxShadow: backendHealthy ? `0 0 4px ${C.green}` : `0 0 4px ${C.red}`,
            }}
          />
          <span style={{
            color: backendHealthy ? C.green : C.red,
            fontSize: '9px',
            fontWeight: 500,
            letterSpacing: '0.06em',
            fontFamily: C.fontBody,
          }}>
            {backendHealthy ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </span>
      </div>
    </div>
  )
}

export default StatusBarV3