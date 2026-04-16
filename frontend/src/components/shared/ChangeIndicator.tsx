import React from 'react'
import C from '../../lib/colors'
import { usePriceFlash } from '../../lib/usePriceFlash'

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
  bright = false,
}) => {
  const { flashStyle, triggerFlash } = usePriceFlash()
  const prevRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    triggerFlash(value, prevRef.current)
    prevRef.current = value
  }, [value, triggerFlash])

  const fontSize = size === 'sm' ? '11px' : '13px'
  const arrowFontSize = size === 'sm' ? '9px' : '11px'
  const color = value > 0 ? (bright ? C.greenBright : C.green) : value < 0 ? (bright ? C.redBright : C.red) : C.whiteDim
  const arrow = value > 0 ? '▲' : value < 0 ? '▼' : ''
  const formatted = showSign && value > 0
    ? `+${value.toFixed(decimals)}`
    : value.toFixed(decimals)

  return (
    <span style={{
      color,
      fontSize,
      fontFamily: C.fontMono,
      fontVariantNumeric: 'tabular-nums',
      ...flashStyle,
    }}>
      {arrow && <span style={{ fontSize: arrowFontSize, marginRight: '2px' }}>{arrow}</span>}
      {formatted}
    </span>
  )
}

export default ChangeIndicator