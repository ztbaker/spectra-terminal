# Plan 4: Restyle Legacy Shell Components + ChartScreen Cleanup

## Task
Migrate the legacy shell components and finish ChartScreen from old `colors.ts` (amber/obsidian theme) to new `theme.ts` (Robinhood Legend dark theme). **Visual-only changes — no logic, API, or behavioral changes.**

## Files to Modify
1. `src/components/Terminal/CommandBar.tsx` (legacy — CommandBarV3 is already restyled)
2. `src/components/Terminal/StatusBar.tsx` (legacy — StatusBarV3 is already restyled)
3. `src/components/Auth/LoginScreen.tsx`
4. `src/components/screens/ChartScreen.tsx` (partial — toolbar and chart creation already restyled, but file still imports `C` for some remaining inline styles)

## Token Mapping (old → new)

Replace `import C from '../../lib/colors'` (or adjust path for Auth/) with `import theme from '../../lib/theme'`, destructure: `const { color, font } = theme`

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
| `C.amber` | `color.textPrimary` (headings) or `color.accentPositive` (actions/cursor) |
| `C.amberBright` | `color.textPrimary` |
| `C.amberDim` | `color.textSecondary` |
| `C.amberMute` | `color.textTertiary` |
| `C.amberGlow` / `C.amberGlowStrong` | remove |
| `C.cyan` / `C.cyanBright` | `color.accentInfo` |
| `C.white` | `color.textPrimary` |
| `C.whiteDim` | `color.textSecondary` |
| `C.whiteGhost` | `color.textTertiary` |
| `C.green` / `C.greenBright` | `color.accentPositive` |
| `C.greenDim` / `C.greenGlow` | `color.accentPositiveDim` |
| `C.red` / `C.redBright` | `color.accentNegative` |
| `C.redDim` / `C.redGlow` | `color.accentNegativeDim` |
| `C.shadow*` | remove or `shadow.sm` |
| `C.shadowGlow` | remove |
| `C.gradient*` | remove |
| `C.fontMono` | `font.mono` |
| `C.fontDisplay` | `font.sans` |
| `C.fontBody` | `font.sans` |

## Style Rules
1. **No glows, no gradients, no glassmorphism.**
2. **Borders**: `color.borderSubtle` for dividers. `borderMedium` for focus/active.
3. **Backgrounds**: Use `color.bgBase` for app shell. `color.bgElevated` for bars/panels.
4. **Typography**: `font.sans` (Inter) for body/headings. `font.mono` for tickers, prices, commands, timestamps.
5. **Colors**: Action/positive = `color.accentPositive`. Losses = `color.accentNegative`. Labels = `color.textSecondary`.

## Special Notes

### CommandBar.tsx (legacy)
- The app uses CommandBarV3 as primary. This legacy version may still be imported somewhere or kept as fallback.
- Apply same style as CommandBarV3: flat dark bar (`color.bgBase`), input text in `color.textPrimary`, cursor/caret in `color.accentPositive`.
- "SPECTRA" wordmark: use `font.sans`, fontWeight 700, `color.textPrimary` (not amber).
- Autocomplete dropdown: bg `color.bgSurface`, border `color.borderMedium`, items hover → `color.bgHover`.
- Remove: gradient border-bottom, amber glow, backdrop-filter blur, `backgroundImage` gradient tricks.

### StatusBar.tsx (legacy)
- Flat bar. bg = `color.bgElevated`. Top border = `color.borderSubtle`.
- Market status dot: use existing `LiveDot` component.  OPEN → `color.accentPositive`, PRE/AFTER → `color.accentWarning`, CLOSED → `color.accentNegative`.
- Clocks: labels in `color.textTertiary`, times in `color.textPrimary`, `font.mono`.
- Ticker tape: ticker labels in `color.textSecondary`, prices in `color.textPrimary`, changes colored by sign.
- Remove: marquee box-shadow effects, amber tints.

### LoginScreen.tsx
- Centered card. bg = `color.bgElevated`, border = `color.borderSubtle`, rounded 8px.
- "SPECTRA" title: `font.sans`, fontWeight 700, `color.textPrimary`, letterSpacing 0.12em.
- Input fields: use `bb-input` class or inline matching style.
- Login button: `color.accentPositive` bg, `color.textInverse` text, rounded 4px.
- Error messages: `color.accentNegative`.
- Remove: any amber glow on the login card, gradient accents.

### ChartScreen.tsx (partial cleanup)
- This file already had its chart creation opts and toolbar restyled in a prior pass.
- Find any remaining `C.` references and replace with theme tokens.
- The chart container, loading states, and any indicator panels that still reference C need updating.
- **Important**: Do NOT change the TradingView chart configuration logic — only style tokens for the surrounding UI.

## CSS Classes Available
- `.bb-panel`, `.bb-header`, `.bb-table`, `.bb-btn`, `.bb-btn-active`, `.bb-input`, `.bb-gain`, `.bb-loss`

## Verification
After modifying all files, run: `npx tsc --noEmit` — must pass with zero errors.

## Final Step (after all 4 plans complete)
Once all 4 plans are done, run `npx vite build` to confirm the production bundle builds cleanly. The large chunk warning (>500KB) is expected and acceptable.
