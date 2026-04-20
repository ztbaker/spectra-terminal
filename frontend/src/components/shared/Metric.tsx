import React from 'react'
import { color, font } from '../../lib/theme'
import { usePriceFlash } from '../../lib/usePriceFlash'

type MetricFormat = 'number' | 'large' | 'pct' | 'currency' | 'text'

interface MetricProps {
  label: string
  value: number | string | null
  format?: MetricFormat
  color?: string
  size?: 'sm' | 'md' | 'lg'
  change?: number
  suffix?: string
  /** When true and value is numeric, flash background on value changes */
  flash?: boolean
}

function formatMetric(value: number | string | null, format: MetricFormat, suffix?: string): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  const s = suffix ?? ''
  switch (format) {
    case 'large': {
      if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T${s}`
      if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B${s}`
      if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M${s}`
      if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K${s}`
      return `${value.toFixed(2)}${s}`
    }
    case 'pct': return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
    case 'currency': return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'number': return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    default: return `${value}${s}`
  }
}

function changeIndicator(change: number): React.ReactNode {
  if (change > 0) return <span style={{ color: color.accentPositive, fontSize: '10px', marginLeft: '4px' }}>▲{change.toFixed(2)}%</span>
  if (change < 0) return <span style={{ color: color.accentNegative, fontSize: '10px', marginLeft: '4px' }}>▼{Math.abs(change).toFixed(2)}%</span>
  return null
}

const SIZES = {
  sm: { label: '9px', value: '13px' },
  md: { label: '10px', value: '16px' },
  lg: { label: '11px', value: '20px' },
} as const

/**
 * Metric display: label above, value below.
 * Supports number formatting, color, and change indicators.
 * When flash=true, numeric value changes trigger a green/red background flash.
 */
const Metric: React.FC<MetricProps> = ({
  label,
  value,
  format = 'text',
  color: colorProp,
  size = 'md',
  change,
  suffix,
  flash = false,
}) => {
  const sizes = SIZES[size]
  const displayValue = formatMetric(value, format, suffix)
  const valueColor = colorProp ?? (typeof value === 'number'
    ? (value > 0 ? color.accentPositive : value < 0 ? color.accentNegative : color.textPrimary)
    : color.textPrimary)

  const { flashStyle, triggerFlash } = usePriceFlash()
  const prevRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (flash && typeof value === 'number') {
      triggerFlash(value, prevRef.current)
      prevRef.current = value
    }
  }, [value, flash, triggerFlash])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ color: color.textSecondary, fontSize: sizes.label, letterSpacing: '0.02em', fontFamily: font.sans }}>
        {label}
      </span>
      <span style={{
        color: valueColor,
        fontSize: sizes.value,
        fontFamily: font.mono,
        fontVariantNumeric: 'tabular-nums',
        ...(flash && typeof value === 'number' ? flashStyle : {}),
      }}>
        {displayValue}
        {change !== undefined && changeIndicator(change)}
      </span>
    </div>
  )
}

export default Metric
