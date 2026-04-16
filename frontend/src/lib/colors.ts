const C = {
  // ─── Surfaces (depth — Obsidian Flow) ───
  surface0:     '#03030a',
  surface1:     '#08081a',
  surface2:     '#0e0e24',
  surface3:     '#161636',
  surfaceGlow:  '#0d0a00',

  // ─── Glass ───
  glass:        'rgba(255, 255, 255, 0.03)',
  glassHover:   'rgba(255, 255, 255, 0.06)',
  glassBorder:  'rgba(255, 255, 255, 0.08)',
  glassBorderHover: 'rgba(255, 255, 255, 0.15)',

  // ─── Elevation Shadows ───
  shadow0:      '0 1px 2px rgba(0,0,0,0.4)',
  shadow1:      '0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)',
  shadow2:      '0 4px 16px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.3)',
  shadow3:      '0 8px 32px rgba(0,0,0,0.7), 0 4px 8px rgba(0,0,0,0.4)',
  shadowGlow:   '0 0 40px rgba(245, 158, 11, 0.08), 0 8px 32px rgba(0,0,0,0.6)',

  // ─── Borders ───
  border0:      '#1a1a30',
  border1:      '#252548',
  border2:      '#353568',

  // ─── Primary: Neon Amber ───
  amber:        '#F59E0B',
  amberBright:  '#FBBF24',
  amberDim:     '#92610A',
  amberMute:    '#5C3D07',
  amberGlow:    'rgba(245, 158, 11, 0.15)',
  amberGlowStrong: 'rgba(245, 158, 11, 0.30)',

  // ─── Accent: Electric Cyan ───
  cyan:         '#06B6D4',
  cyanBright:   '#22D3EE',
  cyanDim:      '#0E7490',
  cyanGlow:     'rgba(6, 182, 212, 0.15)',

  // ─── Accent: Violet (new) ───
  violet:       '#8B5CF6',
  violetBright: '#A78BFA',
  violetDim:    '#4C1D95',
  violetGlow:   'rgba(139, 92, 246, 0.15)',

  // ─── Data ───
  white:        '#EEEEF2',
  whiteDim:     '#9898B0',
  whiteGhost:   '#5A5A76',

  // ─── Semantic ───
  green:        '#10B981',
  greenBright:  '#34D399',
  greenDim:     '#064E3B',
  greenGlow:    'rgba(16, 185, 129, 0.15)',
  red:          '#EF4444',
  redBright:    '#F87171',
  redDim:       '#7F1D1D',
  redGlow:      'rgba(239, 68, 68, 0.15)',

  // ─── Gradient Accents ───
  gradientAmber:  'linear-gradient(135deg, #F59E0B, #D97706)',
  gradientCyan:   'linear-gradient(135deg, #06B6D4, #0891B2)',
  gradientHero:   'linear-gradient(135deg, #F59E0B, #8B5CF6)',

  // ─── Fonts ───
  fontMono:     "'JetBrains Mono', monospace",
  fontDisplay:  "'Space Grotesk', sans-serif",
  fontBody:     "'Inter', sans-serif",

  // ─── Typography constants ───
  tabularNums: { fontVariantNumeric: 'tabular-nums' as const, fontFeatureSettings: '"tnum"' as const },
  sectionHeader: { letterSpacing: '0.15em', textTransform: 'uppercase' as const, fontWeight: 700, fontSize: '10px', fontFamily: "'Space Grotesk', sans-serif" },
  heroPrice: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, fontVariantNumeric: 'tabular-nums' as const, fontFeatureSettings: '"tnum"' as const, lineHeight: 1 },

} as const

export default C