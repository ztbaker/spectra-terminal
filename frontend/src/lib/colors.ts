const C = {
  // ─── Surfaces (depth) ───
  surface0:     '#06060a',
  surface1:     '#0a0a10',
  surface2:     '#101018',
  surface3:     '#16161f',
  surfaceGlow:  '#0d0a00',

  // ─── Borders ───
  border0:      '#1a1a25',
  border1:      '#252535',
  border2:      '#35354a',

  // ─── Primary: Neon Amber ───
  amber:        '#F59E0B',
  amberBright:  '#FBBF24',
  amberDim:     '#92610A',
  amberMute:    '#5C3D07',
  amberGlow:    'rgba(245, 158, 11, 0.12)',
  amberGlowStrong: 'rgba(245, 158, 11, 0.25)',

  // ─── Accent: Electric Cyan ───
  cyan:         '#06B6D4',
  cyanBright:   '#22D3EE',
  cyanDim:      '#0E7490',
  cyanGlow:     'rgba(6, 182, 212, 0.12)',

  // ─── Data ───
  white:        '#E8E8ED',
  whiteDim:     '#8888A0',
  whiteGhost:   '#4A4A62',

  // ─── Semantic ───
  green:        '#10B981',
  greenBright:  '#34D399',
  greenDim:     '#064E3B',
  red:          '#EF4444',
  redBright:    '#F87171',
  redDim:       '#7F1D1D',
  violet:       '#8B5CF6',
  violetDim:    '#4C1D95',

  // ─── Fonts ───
  fontMono:     "'JetBrains Mono', monospace",
  fontDisplay:  "'Space Grotesk', sans-serif",
  fontBody:     "'Inter', sans-serif",

  // ─── V2 Backward Compatibility (mapped to V3 equivalents) ───
  bg0:          '#06060a' as string,   // → surface0
  bg1:          '#0a0a10' as string,   // → surface1
  bg2:          '#101018' as string,   // → surface2
  bg3:          '#16161f' as string,   // → surface3
  bgGlow:       '#0d0a00' as string,   // → surfaceGlow
  bgPanel:      '#101018' as string,   // → surface2
  amberHot:     '#FBBF24' as string,   // → amberBright
  amberGhost:   '#5C3D07' as string,   // → amberMute
  fontSans:     "'Space Grotesk', sans-serif" as string, // → fontDisplay
  blue:         '#06B6D4' as string,   // → cyan
  blueDim:      '#0E7490' as string,   // → cyanDim
  yellow:       '#FBBF24' as string,   // → amberBright
  border:       '#1a1a25' as string,   // → border0
} as const

export default C