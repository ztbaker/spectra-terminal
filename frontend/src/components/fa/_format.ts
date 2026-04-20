import { color } from '../../lib/theme'

export function fmtCurrency(n: number | null): string {
  if (n === null) return '\u2014'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`
  return `${sign}$${abs.toFixed(2)}`
}

export function fmtPct(n: number | null): string {
  if (n === null) return '\u2014'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export function fmtMultiple(n: number | null): string {
  if (n === null) return '\u2014'
  return `${n.toFixed(2)}x`
}

export function colorForDelta(n: number | null): string {
  if (n === null || n === 0) return color.textSecondary
  return n > 0 ? color.accentPositive : color.accentNegative
}
