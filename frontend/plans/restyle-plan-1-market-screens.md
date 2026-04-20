# Plan 1: Restyle Market Instrument Screens

## Task
Migrate 7 market instrument screens from old `colors.ts` (amber/obsidian theme) to new `theme.ts` (Robinhood Legend dark theme). **Visual-only changes — no logic, API, or behavioral changes.**

## Files to Modify
1. `src/components/screens/OptionsScreen.tsx`
2. `src/components/screens/BondScreen.tsx`
3. `src/components/screens/ETFScreen.tsx`
4. `src/components/screens/FXScreen.tsx`
5. `src/components/screens/FXCScreen.tsx`
6. `src/components/screens/CryptoScreen.tsx`
7. `src/components/screens/CommodityScreen.tsx`

## Token Mapping (old → new)

Replace `import C from '../../lib/colors'` with `import theme from '../../lib/theme'` then destructure what you need: `const { color, font } = theme`

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
| `C.amber` | `color.textPrimary` (headings) or `color.accentPositive` (action buttons) |
| `C.amberBright` | `color.textPrimary` |
| `C.amberDim` | `color.textSecondary` |
| `C.amberMute` | `color.textTertiary` |
| `C.amberGlow` | remove (no glows) |
| `C.amberGlowStrong` | remove |
| `C.cyan` | `color.accentInfo` |
| `C.cyanBright` | `color.accentInfo` |
| `C.cyanDim` | `color.accentInfoDim` |
| `C.violet` | `color.accentInfo` |
| `C.white` | `color.textPrimary` |
| `C.whiteDim` | `color.textSecondary` |
| `C.whiteGhost` | `color.textTertiary` |
| `C.green` | `color.accentPositive` |
| `C.greenBright` | `color.accentPositive` |
| `C.greenDim` | `color.accentPositiveDim` |
| `C.greenGlow` | `color.accentPositiveDim` |
| `C.red` | `color.accentNegative` |
| `C.redBright` | `color.accentNegative` |
| `C.redDim` | `color.accentNegativeDim` |
| `C.redGlow` | `color.accentNegativeDim` |
| `C.shadow0` through `C.shadow3` | remove or use theme `shadow.sm`/`shadow.md` sparingly |
| `C.shadowGlow` | remove entirely |
| `C.gradientAmber` | remove (no decorative gradients) |
| `C.gradientCyan` | remove |
| `C.gradientHero` | remove |
| `C.fontMono` | `font.mono` |
| `C.fontDisplay` | `font.sans` |
| `C.fontBody` | `font.sans` |
| `C.tabularNums` | `{ fontVariantNumeric: 'tabular-nums' }` |
| `C.sectionHeader` | use `font.sans` + fontSize 11px + fontWeight 600 + color.textSecondary |
| `C.heroPrice` | use `font.sans` + fontWeight 300 + fontSize 36px + tabular-nums |

## Style Rules
1. **No glows, no gradients, no glassmorphism.** Remove any `boxShadow` that contains glow effects, `backdropFilter`, or gradient borders.
2. **Borders**: Use `color.borderSubtle` (`rgba(255,255,255,0.06)`) for most dividers. Only use `borderMedium` for active/focus states.
3. **Backgrounds**: Cards/panels use `color.bgElevated` (#131619). Hover states use `color.bgHover`. Never pure black.
4. **Typography**: Use `font.sans` (Inter) for all body text and headings. Use `font.mono` (JetBrains Mono) only for tickers, prices, timestamps, and code.
5. **Colors**: Gains = `color.accentPositive` (#00D964). Losses = `color.accentNegative` (#FF5252). Labels = `color.textSecondary`. Disabled = `color.textTertiary`.
6. **Ticker symbols**: Use `color.ticker` (#F1F3F5) + `font.mono` + fontWeight 600.
7. **Section headers**: Use `font.sans`, 11-12px, fontWeight 600, `color.textSecondary`. No uppercase letter-spacing unless it's a tiny label.
8. **Buttons**: Use CSS class `bb-btn` from index.css. Or inline: bg transparent, border `color.borderSubtle`, color `color.textSecondary`, hover → border `borderMedium` + color `textPrimary`.
9. **Tables**: Use CSS class `bb-table` from index.css. Or match: header row with `color.textSecondary`, 11px, fontWeight 500.
10. **Remove all references to**: `letterSpacing: '0.15em'`, `textTransform: 'uppercase'` on section headers (too Bloomberg), `C.fontDisplay` (Space Grotesk — gone).

## CSS Classes Available (from index.css)
- `.bb-panel` — panel container
- `.bb-header` — panel header
- `.bb-table` — data table
- `.bb-btn` — flat button
- `.bb-btn-active` — active button state
- `.bb-input` — text input
- `.bb-gain` — green text for gains
- `.bb-loss` — red text for losses

## Verification
After modifying all files, run: `npx tsc --noEmit` — must pass with zero errors.
