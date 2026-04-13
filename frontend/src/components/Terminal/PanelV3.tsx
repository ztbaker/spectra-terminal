import React from 'react'
import C from '../../lib/colors'

type AccentColor = 'amber' | 'cyan' | 'green' | 'red' | 'violet'

interface PanelV3Props {
  title: string
  accent?: AccentColor
  focused?: boolean
  onClose?: () => void
  onMaximize?: () => void
  children: React.ReactNode
}

const ACCENT_MAP: Record<AccentColor, { border: string; glow: string; text: string; dim: string }> = {
  amber:  { border: C.amber,  glow: C.amberGlow,  text: C.amberBright, dim: C.amberDim },
  cyan:   { border: C.cyan,   glow: C.cyanGlow,   text: C.cyanBright,  dim: C.cyanDim },
  green:  { border: C.green,  glow: C.greenDim,   text: C.greenBright,  dim: C.greenDim },
  red:    { border: C.red,    glow: C.redDim,     text: C.redBright,    dim: C.redDim },
  violet: { border: C.violet, glow: C.violetDim,  text: C.violet,       dim: C.violetDim },
}

/**
 * Neon Industrial panel — glowing borders when focused, dim when background.
 * Each screen renders inside a PanelV3.
 */
const PanelV3: React.FC<PanelV3Props> = ({
  title,
  accent = 'amber',
  focused = false,
  onClose,
  onMaximize,
  children,
}) => {
  const a = ACCENT_MAP[accent]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: C.surface1,
        border: `1px solid ${focused ? a.border : C.border1}`,
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: focused
          ? `0 0 20px ${a.glow}, inset 0 0 30px rgba(245,158,11,0.02)`
          : 'none',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        animation: 'panelSlideIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '32px',
          flexShrink: 0,
          borderBottom: `1px solid ${focused ? a.dim : C.border0}`,
          background: C.surface2,
          padding: '0 8px 0 12px',
        }}
      >
        <span style={{
          fontFamily: C.fontDisplay,
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: focused ? a.text : C.whiteGhost,
          textShadow: focused ? `0 0 8px ${a.glow}` : 'none',
          transition: 'color 150ms ease, text-shadow 150ms ease',
        }}>
          {title}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onMaximize && (
            <button
              onClick={onMaximize}
              style={{
                background: 'none',
                border: 'none',
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px 4px',
                lineHeight: 1,
                fontFamily: C.fontMono,
                transition: 'color 150ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = a.text }}
              onMouseLeave={e => { e.currentTarget.style.color = C.whiteGhost }}
            >
              □
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: C.whiteGhost,
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 4px',
                lineHeight: 1,
                fontFamily: C.fontMono,
                transition: 'color 150ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = a.text }}
              onMouseLeave={e => { e.currentTarget.style.color = C.whiteGhost }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

export default PanelV3