import React, { forwardRef, useState, useRef, useCallback } from 'react'
import theme from '../../lib/theme'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { FreshnessProvider, useFreshness } from '../../lib/freshness'

const { color, font, radius, motion } = theme

interface PanelV3Props {
  title: string
  accent?: string  // kept for API compat but ignored — all panels are neutral now
  focused?: boolean
  panelId?: string
  onDragStart?: (panelId: string, e: React.PointerEvent<HTMLElement>) => void
  onClose?: () => void
  children: React.ReactNode
}

// Freshness dot — shows data staleness
const PanelFreshnessDot: React.FC<{ focused: boolean }> = ({ focused }) => {
  const { status } = useFreshness()
  if (status === 'none') return null
  const dotColor =
    status === 'fresh' ? color.accentPositive :
    status === 'stale' ? color.accentWarning :
    color.accentNegative
  return (
    <span
      title={`Data ${status}`}
      style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: dotColor,
        display: 'inline-block',
        marginLeft: 8,
        opacity: focused ? 1 : 0.6,
      }}
    />
  )
}

const PanelV3 = forwardRef<HTMLDivElement, PanelV3Props>(({
  title,
  focused = false,
  panelId,
  onDragStart,
  onClose,
  children,
}, ref) => {
  const bp = useBreakpoint()
  const isCompact = bp === 'compact'
  const btnSize = isCompact ? '22px' : '24px'

  // ── Drag state ──────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
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

  const bracketSize = '12px'
  const bracketThick = '2px'
  const bracketColor = focused ? color.accentPositive : 'rgba(255, 255, 255, 0.15)'
  const bracketStyle = (top: boolean, left: boolean): React.CSSProperties => ({
    position: 'absolute',
    width: bracketSize,
    height: bracketSize,
    pointerEvents: 'none',
    ...(top ? { top: '3px' } : { bottom: '3px' }),
    ...(left ? { left: '3px' } : { right: '3px' }),
    borderColor: bracketColor,
    borderStyle: 'solid',
    borderWidth: 0,
    ...(top && left ? { borderTopWidth: bracketThick, borderLeftWidth: bracketThick } : {}),
    ...(top && !left ? { borderTopWidth: bracketThick, borderRightWidth: bracketThick } : {}),
    ...(!top && left ? { borderBottomWidth: bracketThick, borderLeftWidth: bracketThick } : {}),
    ...(!top && !left ? { borderBottomWidth: bracketThick, borderRightWidth: bracketThick } : {}),
    transition: `border-color ${motion.normal} ${motion.ease}`,
  })

  return (
    <FreshnessProvider>
    <div
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        background: focused ? 'rgba(19, 22, 25, 0.85)' : 'rgba(19, 22, 25, 0.70)',
        backdropFilter: 'blur(30px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(30px) saturate(1.2)',
        borderRadius: radius.md,
        border: focused ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.06)',
        overflow: 'hidden',
        transition: `all ${motion.normal} ${motion.ease}`,
        boxShadow: focused
          ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 30px rgba(0, 217, 100, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
          : '0 4px 16px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Corner brackets */}
      <div style={bracketStyle(true, true)} />
      <div style={bracketStyle(true, false)} />
      <div style={bracketStyle(false, true)} />
      <div style={bracketStyle(false, false)} />
      {/* Header */}
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
          padding: isCompact ? '0 10px' : '0 14px',
          borderBottom: `1px solid ${color.borderSubtle}`,
          cursor: headerDraggingCursor,
          userSelect: dragging ? 'none' : 'auto',
        }}
      >
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              fontFamily: font.sans,
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: focused ? color.textPrimary : color.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: `color ${motion.normal} ${motion.ease}`,
            }}>
            {title}
          </span>
          <PanelFreshnessDot focused={focused} />
        </div>

        {/* Window controls */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: color.textTertiary,
                cursor: 'pointer',
                fontSize: '14px',
                width: btnSize,
                height: btnSize,
                lineHeight: btnSize,
                textAlign: 'center',
                borderRadius: radius.sm,
                fontFamily: font.mono,
                padding: 0,
                transition: `all ${motion.fast} ${motion.ease}`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = color.accentNegative
                e.currentTarget.style.background = color.accentNegativeDim
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = color.textTertiary
                e.currentTarget.style.background = 'none'
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="bb-screen-enter" style={{
        flex: 1,
        overflow: 'auto',
      }}>
        {children}
      </div>
    </div>
    </FreshnessProvider>
  )
})

export default PanelV3
