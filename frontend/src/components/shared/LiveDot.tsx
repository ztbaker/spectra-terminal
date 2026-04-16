import React from 'react'
import C from '../../lib/colors'

interface LiveDotProps {
  /** Size in pixels (default 6) */
  size?: number
  /** Color of the dot (default C.green) */
  color?: string
  /** Whether the pulse animation is active (default true) */
  active?: boolean
  /** Label shown next to the dot */
  label?: string
}

/**
 * 6px pulsing green circle for live-updating data.
 * Uses the pulseGlow keyframe from index.html.
 */
const LiveDot: React.FC<LiveDotProps> = ({
  size = 6,
  color = C.green,
  active = true,
  label,
}) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        animation: active ? 'pulseGlow 2s ease-in-out infinite' : 'none',
        boxShadow: active ? `0 0 4px ${color}` : 'none',
      }}
    />
    {label && (
      <span style={{
        color: C.whiteDim,
        fontSize: '10px',
        fontFamily: C.fontMono,
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
      }}>
        {label}
      </span>
    )}
  </span>
)

export default LiveDot