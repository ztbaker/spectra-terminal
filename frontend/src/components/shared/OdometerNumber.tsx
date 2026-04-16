import React, { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  decimals?: number
  style?: React.CSSProperties
  color?: string
  signed?: boolean
  suffix?: string
  prefix?: string
}

interface Cell {
  char: string
  direction: 'up' | 'down' | null
  version: number
}

function formatNumber(n: number, decimals: number, signed: boolean): string {
  const abs = Math.abs(n).toFixed(decimals)
  const sign = signed ? (n >= 0 ? '+' : '-') : (n < 0 ? '-' : '')
  return sign + abs
}

const OdometerNumber: React.FC<Props> = ({
  value,
  decimals = 2,
  style,
  color,
  signed = false,
  suffix,
  prefix,
}) => {
  const formatted = formatNumber(value, decimals, signed)
  const prevRef = useRef<string>(formatted)
  const prevValueRef = useRef<number>(value)
  const [cells, setCells] = useState<Cell[]>(() =>
    formatted.split('').map(char => ({ char, direction: null, version: 0 })),
  )
  const versionRef = useRef(0)

  useEffect(() => {
    const prev = prevRef.current
    if (prev === formatted) return

    const dir: 'up' | 'down' = value >= prevValueRef.current ? 'up' : 'down'
    const next = formatted.split('')
    const prevChars = prev.split('')

    // Right-align for change detection so digits line up by magnitude
    const padded = next.map((ch, i) => {
      const prevCh = prevChars[i - (next.length - prevChars.length)] ?? null
      const changed = ch !== prevCh
      if (changed && /[0-9]/.test(ch)) {
        versionRef.current += 1
        return { char: ch, direction: dir, version: versionRef.current }
      }
      return { char: ch, direction: null, version: 0 }
    })

    setCells(padded)
    prevRef.current = formatted
    prevValueRef.current = value
  }, [formatted, value])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', color, ...style }}>
      {prefix && <span>{prefix}</span>}
      <span className="bb-odometer" aria-label={formatted}>
        {cells.map((cell, i) => (
          <span key={`${i}-${cell.char}`} className="bb-odometer-cell" style={{ minWidth: cell.char === '.' ? undefined : '0.6em', textAlign: 'center' }}>
            <span
              key={`${cell.char}-${cell.version}`}
              className={cell.direction === 'down' ? 'bb-odometer-digit-down' : 'bb-odometer-digit'}
              style={{
                display: 'inline-block',
                animationPlayState: cell.direction ? 'running' : 'paused',
              }}
            >
              {cell.char}
            </span>
          </span>
        ))}
      </span>
      {suffix && <span>{suffix}</span>}
    </span>
  )
}

export default OdometerNumber
