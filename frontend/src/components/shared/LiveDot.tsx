import React from 'react'
import theme from '../../lib/theme'

const { color: themeColor, font } = theme

interface LiveDotProps {
  size?: number
  color?: string
  active?: boolean
  label?: string
}

const LiveDot: React.FC<LiveDotProps> = ({
  size = 6,
  color = themeColor.accentPositive,
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
        opacity: active ? 1 : 0.4,
      }}
    />
    {label && (
      <span style={{
        color: themeColor.textTertiary,
        fontSize: '10px',
        fontFamily: font.sans,
        fontWeight: 500,
      }}>
        {label}
      </span>
    )}
  </span>
)

export default LiveDot
