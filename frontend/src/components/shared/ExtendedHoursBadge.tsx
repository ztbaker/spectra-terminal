import React from 'react'
import type { MarketSession } from '../../types'
import C from '../../lib/colors'

interface ExtendedHoursBadgeProps {
  marketState: MarketSession | undefined
}

const LABELS: Record<MarketSession, string> = {
  PRE: 'PRE-MARKET',
  OPEN: '',
  POST: 'AFTER-HOURS',
  CLOSED: 'CLOSED',
}

const COLORS: Record<MarketSession, { bg: string; text: string; glow: string }> = {
  PRE:   { bg: 'rgba(245,158,11,0.15)', text: C.amber, glow: '0 0 8px rgba(245,158,11,0.4)' },
  OPEN:  { bg: 'transparent',            text: 'transparent', glow: 'none' },
  POST:  { bg: 'rgba(6,182,212,0.15)',   text: C.cyanBright, glow: '0 0 8px rgba(6,182,212,0.4)' },
  CLOSED: { bg: 'rgba(90,90,118,0.15)',  text: C.whiteGhost, glow: 'none' },
}

const ExtendedHoursBadge: React.FC<ExtendedHoursBadgeProps> = ({ marketState }) => {
  const state = marketState ?? 'CLOSED'
  const label = LABELS[state]
  if (!label) return null

  const { bg, text, glow } = COLORS[state]

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 164,
      zIndex: 12,
      background: bg,
      border: `1px solid ${text}`,
      borderRadius: '3px',
      padding: '2px 8px',
      fontSize: '9px',
      fontWeight: 700,
      letterSpacing: '0.12em',
      color: text,
      boxShadow: glow,
      fontFamily: "'JetBrains Mono','Courier New',monospace",
      pointerEvents: 'none',
    }}>
      {label}
    </div>
  )
}

export default ExtendedHoursBadge