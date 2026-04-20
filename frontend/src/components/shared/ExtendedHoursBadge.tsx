import React from 'react'
import type { MarketSession } from '../../types'
import { color, font } from '../../lib/theme'

interface ExtendedHoursBadgeProps {
  marketState: MarketSession | undefined
}

const LABELS: Record<MarketSession, string> = {
  PRE: 'Pre-market',
  OPEN: '',
  POST: 'After-hours',
  CLOSED: 'Closed',
}

const COLORS: Record<MarketSession, { bg: string; text: string }> = {
  PRE:    { bg: color.accentWarningDim,  text: color.accentWarning },
  OPEN:   { bg: 'transparent',           text: 'transparent' },
  POST:   { bg: color.accentInfoDim,     text: color.accentInfo },
  CLOSED: { bg: color.bgSurface,         text: color.textTertiary },
}

const ExtendedHoursBadge: React.FC<ExtendedHoursBadgeProps> = ({ marketState }) => {
  const state = marketState ?? 'CLOSED'
  const label = LABELS[state]
  if (!label) return null

  const { bg, text } = COLORS[state]

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 164,
      zIndex: 12,
      background: bg,
      border: `1px solid ${text}`,
      borderRadius: '4px',
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: 500,
      letterSpacing: '0em',
      color: text,
      fontFamily: font.sans,
      pointerEvents: 'none',
    }}>
      {label}
    </div>
  )
}

export default ExtendedHoursBadge
