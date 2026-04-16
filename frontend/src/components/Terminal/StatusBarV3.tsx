import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchIndices } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useUpdater } from '../../lib/updater'
import C from '../../lib/colors'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { usePriceFlash } from '../../lib/usePriceFlash'
import Sparkline from '../shared/Sparkline'
import type { IndexQuote } from '../../types'

// ─── Market status ────────────────────────────────────────────────────────────

type MarketStatus = 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED'

function getMarketStatus(now: Date): MarketStatus {
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et = new Date(etString)
  const day = et.getDay()
  if (day === 0 || day === 6) return 'CLOSED'
  const hours = et.getHours()
  const minutes = et.getMinutes()
  const totalMinutes = hours * 60 + minutes
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
  const [dirFlash, setDirFlash] = useState<'up' | 'down' | 'none'>('none')
  const dirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (quote.price !== null) {
      if (prevPriceRef.current !== null && quote.price !== prevPriceRef.current) {
        const dir = quote.price > prevPriceRef.current ? 'up' : 'down'
        setDirFlash(dir)
        if (dirTimerRef.current) clearTimeout(dirTimerRef.current)
        dirTimerRef.current = setTimeout(() => setDirFlash('none'), 400)
      }
      triggerFlash(quote.price, prevPriceRef.current)
      prevPriceRef.current = quote.price
    }
  }, [quote.price, triggerFlash])

  useEffect(() => () => { if (dirTimerRef.current) clearTimeout(dirTimerRef.current) }, [])

  const price = quote.price !== null ? quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
  const dirFlashStyle: React.CSSProperties = dirFlash === 'up'
    ? { color: C.greenBright, transition: 'color 0ms' }
    : dirFlash === 'down'
    ? { color: C.redBright, transition: 'color 0ms' }
    : { transition: 'color 300ms' }
  return <span style={{ color: C.white, ...flashStyle, ...dirFlashStyle }}>{price}</span>
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
      whiteSpace: 'nowrap' as const,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      <span style={{
        color: C.amber,
        fontFamily: C.fontDisplay,
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>{q.label}</span>
      <span style={{ fontFamily: C.fontMono, fontSize: '10px' }}>
        <IndexPrice quote={q} />
      </span>
      <span style={{ color, fontFamily: C.fontMono, fontSize: '9px' }}>{sign}{change} ({sign}{pct}%)</span>
      {sparkData.length >= 2 && (
        <Sparkline data={sparkData} width={24} height={8} color={sparkColor} />
      )}
      <span style={{
        width: '3px',
        height: '3px',
        borderRadius: '50%',
        background: C.amber,
        opacity: 0.4,
        marginLeft: '10px',
        flexShrink: 0,
      }} />
    </span>
  )
}

// ─── Marquee keyframe injection ──────────────────────────────────────────────

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

const StatusBarV3: React.FC = () => {
  const [now, setNow] = useState(() => new Date())
  const marqueeRef = useRef<HTMLDivElement>(null)
  const backendHealthy = useBackendHealth()
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const isExpanded = bp === 'expanded'

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { data: indices, dataUpdatedAt } = useQuery<IndexQuote[]>({
    queryKey: ['indices'],
    queryFn: fetchIndices,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })

  const lastWidthRef = useRef(0)
  useEffect(() => {
    if (!marqueeRef.current) return
    const w = marqueeRef.current.scrollWidth || 800
    if (w === lastWidthRef.current) return
    lastWidthRef.current = w
    const duration = Math.max(20, (w / window.innerWidth) * 30)
    const existing = document.getElementById(MARQUEE_STYLE_ID)
    if (existing) existing.remove()
    const style = document.createElement('style')
    style.id = MARQUEE_STYLE_ID
    style.textContent = `
      @keyframes bb-marquee {
        0%   { transform: translateX(100vw); }
        100% { transform: translateX(-${w}px); }
      }
      .bb-marquee-track { animation-duration: ${duration}s !important; }
    `
    document.head.appendChild(style)
  }, [indices])

  const { user, logout } = useAuth()
  const { state: updateState, installAndRestart } = useUpdater()
  const status = getMarketStatus(now)
  const isLive = status === 'OPEN' || status === 'PRE' || status === 'AFTER'
  const [prevStatus, setPrevStatus] = useState(status)
  const [borderFlash, setBorderFlash] = useState(false)

  useEffect(() => {
    if (status !== prevStatus) {
      setPrevStatus(status)
      setBorderFlash(true)
      const t = setTimeout(() => setBorderFlash(false), 500)
      return () => clearTimeout(t)
    }
  }, [status, prevStatus])
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
        height: '30px',
        background: `linear-gradient(0deg, ${C.surface0}, ${C.surface1})`,
        fontFamily: C.fontBody,
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000,
        overflow: 'hidden',
        borderTop: '1px solid transparent',
        backgroundImage: `linear-gradient(${C.surface0}, ${C.surface0}), linear-gradient(90deg, ${borderFlash ? C.amber : C.amber}40, ${C.cyan}20, transparent 30%, transparent 70%, ${C.violet}20, ${borderFlash ? C.amber : C.amber}40)`,
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
        boxShadow: borderFlash ? `0 0 20px ${C.amberGlow}, 0 -1px 8px rgba(0,0,0,0.3)` : '0 -1px 8px rgba(0,0,0,0.3)',
        transition: 'border-image 300ms ease, box-shadow 300ms ease',
      }}
    >
      {/* ── Left: market status ── */}
      <div
        style={{
          paddingLeft: '14px',
          paddingRight: '14px',
          whiteSpace: 'nowrap' as const,
          borderRight: `1px solid ${C.glassBorder}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isLive ? C.green : C.whiteGhost,
            display: 'inline-block',
            animation: isLive ? 'pulseGlow 2s ease-in-out infinite' : 'none',
            boxShadow: isLive ? `0 0 6px ${C.greenGlow}, 0 0 12px ${C.greenGlow}` : 'none',
          }}
        />
        {!isCompact && (
          <span
            style={{
              color: isLive ? C.green : C.whiteGhost,
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontFamily: C.fontDisplay,
            }}
          >
            {isLive ? 'LIVE' : 'CLOSED'}
          </span>
        )}
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
        {/* Tick pulse — sweeps across the tape each time indices refetch */}
        {dataUpdatedAt > 0 && (
          <span
            key={dataUpdatedAt}
            aria-hidden
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              background: C.amberBright,
              boxShadow: `0 0 6px ${C.amberGlow}, 0 0 14px ${C.amberGlow}`,
              transform: 'translate(-10%, -50%)',
              animation: 'tickPulse 3.2s linear 1',
              pointerEvents: 'none',
              zIndex: 3,
              opacity: 0,
            }}
          />
        )}
        {hasIndices ? (
          <div
            ref={marqueeRef}
            className="bb-marquee-track"
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
            {indices.map(q => (
              <IndexItem key={`${q.ticker}-dup`} q={q} />
            ))}
          </div>
        ) : (
          <span style={{ color: C.whiteGhost, paddingLeft: '10px', fontFamily: C.fontMono, fontSize: '9px', letterSpacing: '0.08em' }}>
            LOADING MARKET DATA...
          </span>
        )}
      </div>

      {/* ── Right: clocks + connection ── */}
      <div
        style={{
          paddingLeft: '12px',
          paddingRight: '12px',
          whiteSpace: 'nowrap' as const,
          borderLeft: `1px solid ${C.glassBorder}`,
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
          gap: '5px',
          fontVariantNumeric: 'tabular-nums' as const,
        }}>
          {!isCompact && (
            <span style={{ color: C.whiteGhost, fontSize: '8px', letterSpacing: '0.08em', fontFamily: C.fontDisplay, fontWeight: 600 }}>
              {isExpanded ? 'NYC' : 'NY'}
            </span>
          )}
          <span style={{ color: C.white, fontFamily: C.fontMono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' as const }}>{nyTime}</span>
        </span>

        {/* LON — hidden on compact */}
        {!isCompact && (
          <>
            <span style={{
              width: '1px',
              height: '14px',
              background: C.glassBorder,
              margin: '0 10px',
              display: 'inline-block',
            }} />
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontVariantNumeric: 'tabular-nums' as const,
            }}>
              <span style={{ color: C.whiteGhost, fontSize: '8px', letterSpacing: '0.08em', fontFamily: C.fontDisplay, fontWeight: 600 }}>
                {isExpanded ? 'LDN' : 'LN'}
              </span>
              <span style={{ color: C.white, fontFamily: C.fontMono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' as const }}>{lonTime}</span>
            </span>
          </>
        )}

        {/* HK — hidden on compact */}
        {!isCompact && (
          <>
            <span style={{
              width: '1px',
              height: '14px',
              background: C.glassBorder,
              margin: '0 10px',
              display: 'inline-block',
            }} />
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontVariantNumeric: 'tabular-nums' as const,
            }}>
              <span style={{ color: C.whiteGhost, fontSize: '8px', letterSpacing: '0.08em', fontFamily: C.fontDisplay, fontWeight: 600 }}>
                {isExpanded ? 'HKG' : 'HK'}
              </span>
              <span style={{ color: C.white, fontFamily: C.fontMono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' as const }}>{hkTime}</span>
            </span>
          </>
        )}

        {/* Separator */}
        <span style={{
          width: '1px',
          height: '14px',
          background: C.glassBorder,
          margin: '0 10px',
          display: 'inline-block',
        }} />

        {/* Connection indicator */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: backendHealthy ? C.green : C.red,
              display: 'inline-block',
              animation: 'pulseGlow 2s ease-in-out infinite',
              boxShadow: backendHealthy ? `0 0 6px ${C.greenGlow}` : `0 0 6px ${C.redGlow}`,
            }}
          />
          {!isCompact && (
            <span style={{
              color: backendHealthy ? C.green : C.red,
              fontSize: '8px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              fontFamily: C.fontDisplay,
            }}>
              {backendHealthy ? 'CONNECTED' : 'OFFLINE'}
            </span>
          )}
        </span>

        {/* Update ready pill */}
        {updateState.kind === 'ready' && (
          <>
            <span style={{
              width: '1px',
              height: '14px',
              background: C.glassBorder,
              margin: '0 10px',
              display: 'inline-block',
            }} />
            <button
              onClick={installAndRestart}
              title={`Update v${updateState.version} is ready — click to restart and install`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: `1px solid ${C.amber}`,
                color: C.amber,
                padding: '3px 8px',
                fontFamily: C.fontDisplay,
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                textTransform: 'uppercase' as const,
                boxShadow: `0 0 8px ${C.amberGlow}`,
                animation: 'pulseGlow 2s ease-in-out infinite',
              }}
            >
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: C.amber,
                display: 'inline-block',
                boxShadow: `0 0 6px ${C.amberGlow}`,
              }} />
              {isCompact
                ? 'RESTART'
                : `UPDATE v${updateState.version} · RESTART`}
            </button>
          </>
        )}

        {/* User / logout */}
        {user && (
          <>
            <span style={{
              width: '1px',
              height: '14px',
              background: C.glassBorder,
              margin: '0 10px',
              display: 'inline-block',
            }} />
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span style={{
                color: C.amber,
                fontFamily: C.fontDisplay,
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
                {user.username}
              </span>
              <button
                onClick={() => { void logout() }}
                title="Sign out"
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.amberMute}`,
                  color: C.amberDim,
                  fontFamily: C.fontDisplay,
                  fontSize: '8px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                LOGOUT
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default StatusBarV3