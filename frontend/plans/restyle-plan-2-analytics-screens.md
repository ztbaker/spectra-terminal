# Plan 2: Restyle Analytics & Data Screens

## Task
Migrate 6 analytics/data screens from old `colors.ts` (amber/obsidian theme) to new `theme.ts` (Robinhood Legend dark theme). **Visual-only changes — no logic, API, or behavioral changes.**

## Files to Modify
1. `src/components/screens/ECSTScreen.tsx`
2. `src/components/screens/EarningsScreen.tsx`
3. `src/components/screens/ScreenerScreen.tsx`
4. `src/components/screens/QuantScreen.tsx`
5. `src/components/screens/FAScreen.tsx`
6. `src/components/screens/PortfolioScreen.tsx`
7. `src/components/fa/ValuationPanel.tsx`
8. `src/components/fa/RatiosPanel.tsx`

## Token Mapping (old → new)

Replace `import C from '../../lib/colors'` with `import theme from '../../lib/theme'` then destructure: `const { color, font } = theme`

| Old Token | New Token |
|-----------|-----------|
| `C.surface0` | `color.bgBase` |
| `C.surface1` | `color.bgElevated` |
| `C.surface2` | `color.bgSurface` |
| `C.surface3` | `color.bgActive` |
| `C.surfaceGlow` | `color.bgElevated` |
| `C.glass` | `color.bgElevated` |
| `C.glassHover` | `color.bgHover` |
| `C.glassBorder` | `color.borderSubtle` |
| `C.glassBorderHover` | `color.borderMedium` |
| `C.border0` | `color.borderSubtle` |
| `C.border1` | `color.borderSubtle` |
| `C.border2` | `color.borderMedium` |
| `C.amber` | `color.textPrimary` (headings) or `color.accentPositive` (actions) |
| `C.amberBright` | `color.textPrimary` |
| `C.amberDim` | `color.textSecondary` |
| `C.amberMute` | `color.textTertiary` |
| `C.amberGlow` / `C.amberGlowStrong` | remove |
| `C.cyan` / `C.cyanBright` | `color.accentInfo` |
| `C.cyanDim` | `color.accentInfoDim` |
| `C.violet` / `C.violetBright` | `color.accentInfo` |
| `C.white` | `color.textPrimary` |
| `C.whiteDim` | `color.textSecondary` |
| `C.whiteGhost` | `color.textTertiary` |
| `C.green` / `C.greenBright` | `color.accentPositive` |
| `C.greenDim` / `C.greenGlow` | `color.accentPositiveDim` |
| `C.red` / `C.redBright` | `color.accentNegative` |
| `C.redDim` / `C.redGlow` | `color.accentNegativeDim` |
| `C.shadow*` | remove or `shadow.sm` sparingly |
| `C.shadowGlow` | remove |
| `C.gradient*` | remove |
| `C.fontMono` | `font.mono` |
| `C.fontDisplay` | `font.sans` |
| `C.fontBody` | `font.sans` |
| `C.tabularNums` | `{ fontVariantNumeric: 'tabular-nums' }` |
| `C.sectionHeader` | `font.sans`, 11px, fontWeight 600, `color.textSecondary` |
| `C.heroPrice` | `font.sans`, fontWeight 300, fontSize 36px, tabular-nums |

## Style Rules
1. **No glows, no gradients, no glassmorphism.** Remove `boxShadow` glow effects, `backdropFilter`, gradient borders.
2. **Borders**: `color.borderSubtle` for dividers. `borderMedium` for focus/active.
3. **Backgrounds**: Cards use `color.bgElevated`. Hover → `color.bgHover`.
4. **Typography**: `font.sans` (Inter) for body/headings. `font.mono` only for tickers, prices, timestamps.
5. **Colors**: Gains = `color.accentPositive`. Losses = `color.accentNegative`. Labels = `color.textSecondary`. Disabled = `color.textTertiary`.
6. **Tickers**: `color.ticker` + `font.mono` + fontWeight 600.
7. **Section headers**: `font.sans`, 11-12px, fontWeight 600, `color.textSecondary`. No uppercase letter-spacing.
8. **Buttons**: CSS class `bb-btn` or inline flat style.
9. **Tables**: CSS class `bb-table` or match its style.
10. **Remove**: decorative `letterSpacing: '0.15em'`, `textTransform: 'uppercase'` on headers, Space Grotesk references.

## Special Notes for FA Components
- `ValuationPanel.tsx` and `RatiosPanel.tsx` are sub-panels of FAScreen
- Their import path to colors may be `'../../../lib/colors'` — adjust to `'../../../lib/theme'`
- Keep their data tables using the same `bb-table` class

## CSS Classes Available
- `.bb-panel`, `.bb-header`, `.bb-table`, `.bb-btn`, `.bb-btn-active`, `.bb-input`, `.bb-gain`, `.bb-loss`

## Verification
After modifying all files, run: `npx tsc --noEmit` — must pass with zero errors.
