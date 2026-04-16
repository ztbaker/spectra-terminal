export type AccentColor = 'amber' | 'cyan' | 'green' | 'red' | 'violet'

// Each screen gets a signature identity color. Choices aim for contrast between
// related screens (e.g. MACRO=green vs ECON=violet) and a strong memorable
// mapping to the domain.
export const SCREEN_ACCENT: Record<string, AccentColor> = {
  home:       'cyan',
  equity:     'amber',
  chart:      'amber',     // GP
  options:    'violet',    // OPT
  bond:       'cyan',      // BOND/YLD (was green — cyan reads more "fixed income")
  fx:         'cyan',
  fxc:        'cyan',
  crypto:     'violet',
  macro:      'green',
  econ:       'violet',
  ecst:       'violet',
  news:       'amber',
  portfolio:  'amber',
  watchlist:  'amber',
  earnings:   'green',     // was amber — green for calendar/events
  screener:   'cyan',      // was amber — cyan for exploration
  filings:    'green',     // filings = document color
  comd:       'amber',     // commodities = gold
  cong:       'red',       // Congress / political = red accent
  quant:      'violet',
  fa:         'amber',
  des:        'amber',     // DES = description / equity-like
  gpo:        'amber',
  gip:        'amber',
  graph:      'amber',
  wei:        'green',     // WEI = world economic indicators
  hs:         'cyan',      // HS = historical spread
  etf:        'green',
  ask:        'cyan',
  help:       'cyan',
  quit:       'red',
}

export function accentFor(screen: string): AccentColor {
  return SCREEN_ACCENT[screen] ?? 'amber'
}
