# Plan 3: Restyle Info, Utility & Misc Screens

## Task
Migrate 12 info/utility/misc screens from old `colors.ts` (amber/obsidian theme) to new `theme.ts` (Robinhood Legend dark theme). **Visual-only changes — no logic, API, or behavioral changes.**

## Files to Modify
1. `src/components/screens/HelpScreen.tsx`
2. `src/components/screens/WEIScreen.tsx`
3. `src/components/screens/HSScreen.tsx`
4. `src/components/screens/DESScreen.tsx`
5. `src/components/screens/ChatScreen.tsx`
6. `src/components/screens/GScreen.tsx`
7. `src/components/screens/GIPScreen.tsx`
8. `src/components/screens/GPOScreen.tsx`
9. `src/components/screens/HomeScreen.tsx` (legacy — not HomeScreenV3 which is already done)
10. `src/components/news/ReaderPanel.tsx`
11. `src/components/ChatNotificationToast.tsx`
12. `src/components/WhatsNewDialog.tsx`

## Token Mapping (old → new)

Replace `import C from '../../lib/colors'` (or `'../lib/colors'` depending on depth) with `import theme from '../../lib/theme'` (adjust path accordingly), then destructure: `const { color, font } = theme`

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

## Style Rules
1. **No glows, no gradients, no glassmorphism.**
2. **Borders**: `color.borderSubtle` for dividers. `borderMedium` for focus/active.
3. **Backgrounds**: Cards use `color.bgElevated`. Hover → `color.bgHover`.
4. **Typography**: `font.sans` (Inter) for body/headings. `font.mono` only for tickers, prices, timestamps, commands, code.
5. **Colors**: Gains = `color.accentPositive`. Losses = `color.accentNegative`. Labels = `color.textSecondary`. Disabled = `color.textTertiary`.
6. **Section headers**: `font.sans`, 11-12px, fontWeight 600, `color.textSecondary`.
7. **Remove**: decorative `letterSpacing: '0.15em'`, `textTransform: 'uppercase'` on large headers, Space Grotesk.

## Special Notes

### WhatsNewDialog.tsx
- This is a modal dialog. Background overlay should be `${color.bgBase}DA` (hex + alpha). Card bg = `color.bgElevated`.
- The "GOT IT" button should use `color.accentPositive` bg with `color.textInverse` text.
- Remove the amber glow styling.

### ChatNotificationToast.tsx
- Small toast popup. Use `color.bgSurface` bg, `color.borderSubtle` border.
- Text in `color.textPrimary`.

### ReaderPanel.tsx
- Article reader. Body text in `color.textPrimary`, links in `color.accentInfo`.
- Keep readable line-height (1.6+). Font = `font.sans`.

### HelpScreen.tsx
- Command reference. Commands in `font.mono` + `color.ticker`. Descriptions in `font.sans` + `color.textSecondary`.

### HomeScreen.tsx (legacy)
- This is the old home screen (before HomeScreenV3). Same restyling approach — just update tokens. If it's effectively dead code superseded by HomeScreenV3, still restyle it for consistency.

## CSS Classes Available
- `.bb-panel`, `.bb-header`, `.bb-table`, `.bb-btn`, `.bb-btn-active`, `.bb-input`, `.bb-gain`, `.bb-loss`

## Verification
After modifying all files, run: `npx tsc --noEmit` — must pass with zero errors.
