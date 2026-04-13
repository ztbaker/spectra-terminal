import React from 'react'

interface Props {
  value: number | null
  pct?: boolean      // append % sign
  decimals?: number  // default 2
  prefix?: string    // optional prefix string before sign/value
}

/**
 * Renders a value as a coloured span:
 *   positive → .bb-gain  (green)
 *   negative → .bb-loss  (red)
 *   zero / null → amber (#ff9900)
 *
 * Automatically prepends "+" for positive values.
 * Shows "—" when value is null.
 */
const TickerBadge: React.FC<Props> = ({
  value,
  pct = false,
  decimals = 2,
  prefix = '',
}) => {
  if (value === null) {
    return (
      <span style={{ color: '#F59E0B' }}>
        {prefix}—
      </span>
    )
  }

  const absFormatted = Math.abs(value).toFixed(decimals)
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  const pctSuffix = pct ? '%' : ''
  const display = `${prefix}${sign}${absFormatted}${pctSuffix}`

  let className = ''
  if (value > 0) className = 'bb-gain'
  else if (value < 0) className = 'bb-loss'

  return (
    <span
      className={className || undefined}
      style={value === 0 ? { color: '#F59E0B' } : undefined}
    >
      {display}
    </span>
  )
}

export default TickerBadge
