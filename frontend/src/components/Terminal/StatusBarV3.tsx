import React, { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchIndices } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useUpdater } from '../../lib/updater'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { usePriceFlash } from '../../lib/usePriceFlash'
import type { IndexQuote } from '../../types'

const { color, font, type: t, motion } = theme

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

// ─── Index price with flash ───────────────────────────────────────────────────

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
    ? { color: color.accentPositive, transition: 'color 0ms' }
    : dirFlash === 'down'
    ? { color: color.accentNegative, transition: 'color 0ms' }
    : { transition: `color ${motion.slow}` }
  return <span style={{ color: color.textPrimary, ...flashStyle, ...dirFlashStyle }}>{price}</span>
}

// ─── Single index item in the ticker tape ─────────────────────────────────────

function IndexItem({ q }: { q: IndexQuote }): React.ReactElement {
  const change = q.change !== null ? q.change.toFixed(2) : '—'
  const pct = q.change_pct !== null ? q.change_pct.toFixed(2) : '—'
  const isPos = q.change !== null && q.change > 0
  const isNeg = q.change !== null && q.change < 0
  const changeColor = isPos ? color.accentPositive : isNeg ? color.accentNegative : color.textTertiary
  const sign = isPos ? '+' : ''

  return (
    <span style={{
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      marginRight: '24px',
    }}>
      <span style={{
        color: color.textSecondary,
        fontFamily: font.mono,
        fontSize: '11px',
        fontWeight: 500,
      }}>{q.label}</span>
      <span style={{ fontFamily: font.mono, fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
        <IndexPrice quote={q} />
      </span>
      <span style={{ color: changeColor, fontFamily: font.mono, fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
        {sign}{change} ({sign}{pct}%)
      </span>
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

  const { data: indices } = useQuery<IndexQuote[]>({
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
    const duration = Math.max(25, (w / window.innerWidth) * 35)
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
  const { state: updateState, installAndRestart, openExternal } = useUpdater()
  const status = getMarketStatus(now)
  const isLive = status === 'OPEN' || status === 'PRE' || status === 'AFTER'

  const nyTime  = formatClock(now, 'America/New_York')
  const lonTime = formatClock(now, 'Europe/London')
  const hkTime  = formatClock(now, 'Asia/Hong_Kong')
  const hasIndices = Array.isArray(indices) && indices.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '32px',
        background: 'rgba(19, 22, 25, 0.75)',
        backdropFilter: 'blur(40px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        fontFamily: font.sans,
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* ── Left: market status ── */}
      <div
        style={{
          paddingLeft: '16px',
          paddingRight: '16px',
          whiteSpace: 'nowrap',
          borderRight: `1px solid ${color.borderSubtle}`,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isLive ? color.accentPositive : color.textTertiary,
            display: 'inline-block',
          }}
        />
        {!isCompact && (
          <span style={{
            color: isLive ? color.accentPositive : color.textTertiary,
            ...t.caption,
            fontSize: '10px',
          }}>
            {status === 'OPEN' ? 'LIVE' : status === 'PRE' ? 'PRE' : status === 'AFTER' ? 'AFTER' : 'CLOSED'}
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
        {hasIndices ? (
          <div
            ref={marqueeRef}
            className="bb-marquee-track"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              animation: 'bb-marquee 40s linear infinite',
              whiteSpace: 'nowrap',
              willChange: 'transform',
              paddingLeft: '16px',
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
          <span style={{ color: color.textTertiary, paddingLeft: '16px', ...t.caption, fontSize: '10px' }}>
            LOADING MARKET DATA...
          </span>
        )}
      </div>

      {/* ── Right: clocks + connection ── */}
      <div
        style={{
          paddingLeft: '12px',
          paddingRight: '16px',
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
          gap: '5px',
        }}>
          {!isCompact && (
            <span style={{ color: color.textTertiary, fontSize: '10px', fontWeight: 500, fontFamily: font.sans }}>
              {isExpanded ? 'NYC' : 'NY'}
            </span>
          )}
          <span style={{ color: color.textPrimary, fontFamily: font.mono, fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{nyTime}</span>
        </span>

        {/* LON */}
        {!isCompact && (
          <>
            <span style={{ width: '1px', height: '12px', background: color.borderSubtle, margin: '0 10px', display: 'inline-block' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: color.textTertiary, fontSize: '10px', fontWeight: 500, fontFamily: font.sans }}>
                {isExpanded ? 'LDN' : 'LN'}
              </span>
              <span style={{ color: color.textPrimary, fontFamily: font.mono, fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{lonTime}</span>
            </span>
          </>
        )}

        {/* HK */}
        {!isCompact && (
          <>
            <span style={{ width: '1px', height: '12px', background: color.borderSubtle, margin: '0 10px', display: 'inline-block' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: color.textTertiary, fontSize: '10px', fontWeight: 500, fontFamily: font.sans }}>
                {isExpanded ? 'HKG' : 'HK'}
              </span>
              <span style={{ color: color.textPrimary, fontFamily: font.mono, fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>{hkTime}</span>
            </span>
          </>
        )}

        {/* Separator */}
        <span style={{ width: '1px', height: '12px', background: color.borderSubtle, margin: '0 10px', display: 'inline-block' }} />

        {/* Connection indicator */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: backendHealthy ? color.accentPositive : color.accentNegative,
              display: 'inline-block',
            }}
          />
          {!isCompact && (
            <span style={{
              color: backendHealthy ? color.accentPositive : color.accentNegative,
              fontSize: '10px',
              fontWeight: 500,
              fontFamily: font.sans,
            }}>
              {backendHealthy ? 'Connected' : 'Offline'}
            </span>
          )}
        </span>

        {/* Update ready pill */}
        {(updateState.kind === 'ready' || updateState.kind === 'ready-external') && (
          <>
            <span style={{ width: '1px', height: '12px', background: color.borderSubtle, margin: '0 10px', display: 'inline-block' }} />
            <button
              onClick={() => {
                if (updateState.kind === 'ready-external') {
                  openExternal(updateState.url)
                } else {
                  installAndRestart()
                }
              }}
              title={
                updateState.kind === 'ready-external'
                  ? `Update v${updateState.version} available — click to download`
                  : `Update v${updateState.version} is ready — click to restart and install`
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: color.accentPositiveDim,
                border: `1px solid ${color.accentPositive}`,
                borderRadius: '4px',
                color: color.accentPositive,
                padding: '3px 10px',
                fontFamily: font.sans,
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isCompact
                ? (updateState.kind === 'ready-external' ? 'Download' : 'Restart')
                : updateState.kind === 'ready-external'
                  ? `v${updateState.version} — Download`
                  : `v${updateState.version} — Restart`}
            </button>
          </>
        )}

        {/* User / logout */}
        {user && (
          <>
            <span style={{ width: '1px', height: '12px', background: color.borderSubtle, margin: '0 10px', display: 'inline-block' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                color: color.textSecondary,
                fontFamily: font.sans,
                fontSize: '11px',
                fontWeight: 500,
              }}>
                {user.username}
              </span>
              <button
                onClick={() => { void logout() }}
                title="Sign out"
                style={{
                  background: 'transparent',
                  border: `1px solid ${color.borderMedium}`,
                  borderRadius: '4px',
                  color: color.textTertiary,
                  fontFamily: font.sans,
                  fontSize: '10px',
                  fontWeight: 500,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  transition: `all ${motion.normal} ${motion.ease}`,
                }}
              >
                Logout
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default StatusBarV3
