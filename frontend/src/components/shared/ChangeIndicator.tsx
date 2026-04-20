import React from 'react'
import theme from '../../lib/theme'
import { usePriceFlash } from '../../lib/usePriceFlash'

const { color, font } = theme

interface ChangeIndicatorProps {
  value: number
  decimals?: number
  showSign?: boolean
  size?: 'sm' | 'md'
  bright?: boolean
}

const ChangeIndicator: React.FC<ChangeIndicatorProps> = ({
  value,
  decimals = 2,
  showSign = true,
  size = 'sm',
}) => {
  const { flashStyle, triggerFlash } = usePriceFlash()
  const prevRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    triggerFlash(value, prevRef.current)
    prevRef.current = value
  }, [value, triggerFlash])

  const fontSize = size === 'sm' ? '11px' : '13px'
  const arrowFontSize = size === 'sm' ? '9px' : '11px'
  const textColor = value > 0 ? color.accentPositive : value < 0 ? color.accentNegative : color.textTertiary
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : ''
  const formatted = showSign && value > 0
    ? `+${value.toFixed(decimals)}`
    : value.toFixed(decimals)

  return (
    <span style={{
      color: textColor,
      fontSize,
      fontFamily: font.mono,
      fontVariantNumeric: 'tabular-nums',
      ...flashStyle,
    }}>
      {arrow && <span style={{ fontSize: arrowFontSize, marginRight: '2px' }}>{arrow}</span>}
      {formatted}
    </span>
  )
}

export default ChangeIndicator
