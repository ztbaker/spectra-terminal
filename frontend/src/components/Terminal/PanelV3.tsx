import React, { forwardRef, useState, useRef, useCallback } from 'react'
import C from '../../lib/colors'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { FreshnessProvider, useFreshness } from '../../lib/freshness'
import PanelCornerBrackets from '../shared/PanelCornerBrackets'

type AccentColor = 'amber' | 'cyan' | 'green' | 'red' | 'violet'

interface PanelV3Props {
  title: string
  accent?: AccentColor
  focused?: boolean
  panelId?: string
  onDragStart?: (panelId: string, e: React.PointerEvent<HTMLElement>) => void
  onClose?: () => void
  onMaximize?: () => void
  children: React.ReactNode
}

const ACCENT_MAP: Record<AccentColor, {
  border: string; glow: string; text: string; dim: string; gradient: string
}> = {
  amber: {
    border: C.amber,
    glow: C.amberGlow,
    text: C.amberBright,
    dim: C.amberDim,
    gradient: `linear-gradient(135deg, ${C.amberGlow}, transparent 60%)`,
  },
  cyan: {
    border: C.cyan,
    glow: C.cyanGlow,
    text: C.cyanBright,
    dim: C.cyanDim,
    gradient: `linear-gradient(135deg, ${C.cyanGlow}, transparent 60%)`,
  },
  green: {
    border: C.green,
    glow: C.greenGlow,
    text: C.greenBright,
    dim: C.greenDim,
    gradient: `linear-gradient(135deg, ${C.greenGlow}, transparent 60%)`,
  },
  red: {
    border: C.red,
    glow: C.redGlow,
    text: C.redBright,
    dim: C.redDim,
    gradient: `linear-gradient(135deg, ${C.redGlow}, transparent 60%)`,
  },
  violet: {
    border: C.violet,
    glow: C.violetGlow,
    text: C.violetBright,
    dim: C.violetDim,
    gradient: `linear-gradient(135deg, ${C.violetGlow}, transparent 60%)`,
  },
}

// Small subcomponent that reads freshness from the Panel's FreshnessProvider context
const PanelFreshnessDot: React.FC<{ focused: boolean }> = ({ focused }) => {
  const { status } = useFreshness()
  if (status === 'none') return null
  const color =
    status === 'fresh' ? C.greenBright :
    status === 'stale' ? C.amberBright :
    C.redBright
  const glow =
    status === 'fresh' ? C.greenGlow :
    status === 'stale' ? C.amberGlow :
    C.redGlow
  return (
    <span
      title={`Data ${status}`}
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${glow}, 0 0 12px ${glow}`,
        animation: 'pulseGlow 2s ease-in-out infinite',
        display: 'inline-block',
        marginLeft: 8,
        opacity: focused ? 1 : 0.6,
      }}
    />
  )
}

const PanelV3 = forwardRef<HTMLDivElement, PanelV3Props>(({
  title,
  accent = 'amber',
  focused = false,
  panelId,
  onDragStart,
  onClose,
  onMaximize,
  children,
}, ref) => {
  const a = ACCENT_MAP[accent]
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const btnSize = isCompact ? '20px' : '24px'
  const headerPad = isCompact ? '8px 10px' : '8px 14px'

  // ── Mac-style drag state ──────────────────────────────────────────────────
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Only left-click
    if (e.button !== 0) return
    // Don't start drag from buttons
    if ((e.target as HTMLElement).closest('button')) return
    if (!panelId || !onDragStart) return
    e.preventDefault()
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    setDragging(false)
    const headerEl = headerRef.current
    if (headerEl) {
      ;(headerEl as HTMLElement).setPointerCapture(e.pointerId)
    }
  }, [panelId, onDragStart])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragStartRef.current || !panelId || !onDragStart) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    // Require 4px threshold before starting drag (prevents accidental drags on click)
    if (!dragging && Math.sqrt(dx * dx + dy * dy) < 4) return
    if (!dragging) {
      setDragging(true)
      onDragStart(panelId, e)
    }
  }, [panelId, onDragStart, dragging])

  const onPointerUp = useCallback(() => {
    dragStartRef.current = null
    setDragging(false)
  }, [])

  const headerCursor = panelId ? 'grab' : 'default'
  const headerDraggingCursor = dragging ? 'grabbing' : headerCursor

  return (
    <FreshnessProvider>
    <div
      ref={ref}
      className="bb-glass-refract"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        background: C.surface1,
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: focused
          ? `0 0 0 1px ${a.border}40, ${C.shadowGlow}, 0 0 60px ${a.glow}, inset 1px 1px 0 rgba(255,255,255,0.06), inset -1px -1px 0 rgba(0,0,0,0.35)`
          : `0 0 0 1px ${C.glassBorder}, ${C.shadow2}, inset 1px 1px 0 rgba(255,255,255,0.04), inset -1px -1px 0 rgba(0,0,0,0.30)`,
        transform: focused ? 'scale(1.002)' : 'scale(1)',
        filter: focused ? 'brightness(1)' : 'brightness(0.92)',
        animation: 'panelSlideIn 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        transition: 'box-shadow 300ms ease, border-color 300ms ease, transform 300ms ease, filter 300ms ease',
      }}
    >
      {/* Ambient gradient glow in top-left corner */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '80px',
        background: focused ? a.gradient : 'none',
        opacity: focused ? 0.6 : 0,
        transition: 'opacity 400ms ease',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* Corner brackets — focused panels only */}
      {focused && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
          <PanelCornerBrackets color={a.border} glow={a.glow} />
        </div>
      )}

      {/* Grain intensity overlay — stronger on unfocused panels to pull focus to active one */}
      {!focused && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
            background:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
            mixBlendMode: 'overlay',
            opacity: 0.55,
          }}
        />
      )}

      {/* Header — frosted glass bar, pointer-drag for Mac-style move */}
      <div
        ref={headerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '36px',
          flexShrink: 0,
          position: 'relative',
          zIndex: 2,
          background: focused
            ? `rgba(14, 14, 36, 0.8)`
            : C.surface2,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${focused ? `${a.border}30` : C.border0}`,
          padding: headerPad,
          transition: 'background 300ms ease, border-color 300ms ease',
          cursor: headerDraggingCursor,
          userSelect: dragging ? 'none' : 'auto',
        }}
      >
        {/* Accent dot + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
          {/* Accent indicator dot */}
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: focused ? a.border : C.whiteGhost,
            boxShadow: focused ? `0 0 8px ${a.glow}, 0 0 16px ${a.glow}` : `0 0 6px ${a.glow}`,
            transition: 'background 200ms, box-shadow 600ms ease-out',
            animation: focused ? 'borderBreathe 3s ease-in-out infinite' : 'none',
          }} />
          <span
            className={focused ? 'bb-chroma' : undefined}
            style={{
              fontFamily: C.fontDisplay,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: focused ? a.text : C.whiteGhost,
              textShadow: focused ? `0 0 12px ${a.glow}` : 'none',
              transition: 'color 200ms ease, text-shadow 200ms ease',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              maxWidth: 'calc(100% - 100px)',
            }}>
            {title}
          </span>
          <PanelFreshnessDot focused={focused} />
        </div>

        {/* Window controls */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {onMaximize && (
            <button
              onClick={onMaximize}
              style={{
                background: 'none',
                border: `1px solid ${C.glassBorder}`,
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '10px',
                width: btnSize,
                height: btnSize,
                lineHeight: btnSize,
                textAlign: 'center',
                borderRadius: '4px',
                fontFamily: C.fontMono,
                transition: 'all 150ms ease',
                padding: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = a.border
                e.currentTarget.style.color = a.text
                e.currentTarget.style.background = a.glow
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.glassBorder
                e.currentTarget.style.color = C.whiteGhost
                e.currentTarget.style.background = 'none'
              }}
            >
              □
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: `1px solid ${C.glassBorder}`,
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '12px',
                width: btnSize,
                height: btnSize,
                lineHeight: btnSize,
                textAlign: 'center',
                borderRadius: '4px',
                fontFamily: C.fontMono,
                transition: 'all 150ms ease',
                padding: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = C.red
                e.currentTarget.style.color = C.redBright
                e.currentTarget.style.background = C.redGlow
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.glassBorder
                e.currentTarget.style.color = C.whiteGhost
                e.currentTarget.style.background = 'none'
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content area with subtle inner shadow */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        zIndex: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
      }}>
        {children}
      </div>

      {/* Bottom accent line — animated width on focus */}
      <div style={{
        height: '1px',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          background: `linear-gradient(90deg, transparent, ${a.border}60, transparent)`,
          width: focused ? '100%' : '0%',
          transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>
    </div>
    </FreshnessProvider>
  )
})

export default PanelV3