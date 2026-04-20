/**
 * Spectra Terminal — Design Tokens (Robinhood Legend aesthetic)
 *
 * Single source of truth for all visual tokens.
 * Replaces the old colors.ts amber/glow system with a quiet,
 * confident, dark-first palette inspired by Robinhood Legend.
 *
 * Rules:
 *   - No glows, no gradients-as-decoration, no glassmorphism
 *   - Panels separated by tone shift + spacing, not hard borders
 *   - One hero color (green) for positive/action; everything else neutral
 *   - Typography does the heavy lifting
 */

// ─── Color Scale ───────────────────────────────────────────────────────────────

export const color = {
  // Backgrounds — near-black, never pure #000
  bgBase:       '#0B0E11',    // app background
  bgElevated:   '#131619',    // panels, cards — one notch up
  bgSurface:    '#1A1E23',    // elevated surface (modals, popovers, active rows)
  bgHover:      '#1F2429',    // row/item hover
  bgActive:     '#252A30',    // pressed / active states

  // Borders — barely visible dividers, not structural lines
  borderSubtle: 'rgba(255, 255, 255, 0.06)',  // default panel/card edge
  borderMedium: 'rgba(255, 255, 255, 0.10)',  // separators, input borders
  borderStrong: 'rgba(255, 255, 255, 0.16)',  // focus rings, emphasis

  // Text
  textPrimary:    '#E8EAED',  // primary content — high contrast on dark
  textSecondary:  '#9AA0A6',  // labels, descriptions
  textTertiary:   '#5F6368',  // placeholders, disabled, timestamps
  textInverse:    '#0B0E11',  // text on filled buttons (green bg)

  // Accent — Robinhood green as the single hero color
  accentPositive:     '#00D964',  // primary action, gains, up
  accentPositiveHover:'#00C258',  // hover on green elements
  accentPositiveDim:  'rgba(0, 217, 100, 0.12)',  // subtle positive bg tint

  // Semantic — red for losses only
  accentNegative:     '#FF5252',  // losses, down, destructive confirm
  accentNegativeHover:'#E04848',
  accentNegativeDim:  'rgba(255, 82, 82, 0.12)',

  // Warning / neutral accent
  accentWarning:      '#FFB020',
  accentWarningDim:   'rgba(255, 176, 32, 0.12)',

  // Info — cool blue for links, info states
  accentInfo:         '#4C9AFF',
  accentInfoDim:      'rgba(76, 154, 255, 0.12)',

  // Ticker highlight — slightly warm white for ticker symbols
  ticker:             '#F1F3F5',
} as const

// ─── Spacing Scale (px) ────────────────────────────────────────────────────────

export const space = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  24,
  6:  32,
  7:  48,
  8:  64,
} as const

// ─── Typography ────────────────────────────────────────────────────────────────
// Display/body: Geist Sans — clean, modern, tabular-figures-enabled
// Mono: JetBrains Mono — tickers, timestamps, order IDs only

export const font = {
  sans:  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:  "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
} as const

export const type = {
  // Large price displays
  display: {
    fontFamily: font.sans,
    fontSize: '36px',
    fontWeight: 300,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  // Page titles
  h1: {
    fontFamily: font.sans,
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
  },
  // Section headers
  h2: {
    fontFamily: font.sans,
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '0em',
  },
  // Default body text
  body: {
    fontFamily: font.sans,
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0em',
  },
  // Smaller body / table cells
  bodySm: {
    fontFamily: font.sans,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0em',
  },
  // Labels, captions, metadata
  caption: {
    fontFamily: font.sans,
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
  },
  // Mono — tickers, timestamps
  monoSm: {
    fontFamily: font.mono,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0em',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  // Mono extra small — order IDs, hashes
  monoXs: {
    fontFamily: font.mono,
    fontSize: '10px',
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums' as const,
  },
} as const

// ─── Radii ─────────────────────────────────────────────────────────────────────

export const radius = {
  sm:   '4px',   // inputs, small elements
  md:   '8px',   // cards, panels
  lg:   '12px',  // modals, large cards
  full: '9999px', // pills, avatars
} as const

// ─── Shadows ───────────────────────────────────────────────────────────────────
// Minimal — prefer bg elevation over shadow. These exist for modals/popovers.

export const shadow = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
} as const

// ─── Motion ────────────────────────────────────────────────────────────────────

export const motion = {
  fast:     '100ms',
  normal:   '150ms',
  slow:     '250ms',
  easeOut:  'cubic-bezier(0.16, 1, 0.3, 1)',
  easeIn:   'cubic-bezier(0.4, 0, 1, 1)',
  ease:     'cubic-bezier(0.25, 0.1, 0.25, 1)',
} as const

// ─── Convenience: transition shorthand ─────────────────────────────────────────

export function transition(...props: string[]): string {
  return props.map(p => `${p} ${motion.normal} ${motion.ease}`).join(', ')
}

// ─── Chart theme (TradingView Lightweight Charts) ──────────────────────────────

export const chartTheme = {
  background:    color.bgElevated,
  textColor:     color.textTertiary,
  gridColor:     'rgba(255, 255, 255, 0.04)',
  crosshairColor:'rgba(255, 255, 255, 0.20)',
  upColor:       color.accentPositive,
  downColor:     color.accentNegative,
  upWickColor:   color.accentPositive,
  downWickColor: color.accentNegative,
  borderVisible: false,
} as const

// ─── Tabular nums helper ───────────────────────────────────────────────────────

export const tabularNums = {
  fontVariantNumeric: 'tabular-nums' as const,
  fontFeatureSettings: '"tnum"' as const,
} as const

// ─── Default export for drop-in compat ─────────────────────────────────────────

const theme = { color, space, font, type, radius, shadow, motion, chartTheme, transition, tabularNums } as const
export default theme
