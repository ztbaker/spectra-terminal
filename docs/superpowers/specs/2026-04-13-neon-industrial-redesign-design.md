# SpectraTerminal V3 UI — Neon Industrial Redesign

**Date:** 2026-04-13
**Status:** Design approved — awaiting implementation plan

---

## Vision

SpectraTerminal becomes a **Neon Industrial** multi-panel workspace — pure black surfaces with glowing amber and electric cyan accents, geometric borders, and dramatic visual hierarchy. It keeps Bloomberg's functional DNA (command bar, typed commands, function keys) but sheds the retro-terminal aesthetic for something that feels like Vercel's dark mode collided with a cyberpunk trading floor.

**What someone remembers:** The glow. Panels with luminous borders, data that pulses with light, charts that feel alive. Not a spreadsheet with a dark theme — a spacecraft instrument panel.

---

## Aesthetic Direction: Neon Industrial

### Color System V3

```typescript
const C = {
  // ─── Surfaces (depth) ───
  surface0:     '#06060a',   // deepest — app background
  surface1:     '#0a0a10',   // panel base
  surface2:     '#101018',   // card/section
  surface3:     '#16161f',   // hover / elevated
  surfaceGlow:  '#0d0a00',   // warm glow behind active elements

  // ─── Borders ───
  border0:      '#1a1a25',   // subtle
  border1:      '#252535',   // standard
  border2:      '#35354a',   // emphasized

  // ─── Primary: Neon Amber ───
  amber:        '#F59E0B',   // primary accent — commands, active, highlights
  amberBright:  '#FBBF24',   // hover/active state
  amberDim:     '#92610A',   // secondary labels
  amberMute:    '#5C3D07',   // ghost text
  amberGlow:    'rgba(245, 158, 11, 0.12)',  // panel glow
  amberGlowStrong: 'rgba(245, 158, 11, 0.25)', // strong glow

  // ─── Accent: Electric Cyan ───
  cyan:         '#06B6D4',   // secondary accent — data, links, interactive
  cyanBright:   '#22D3EE',   // hover state
  cyanDim:      '#0E7490',   // muted data
  cyanGlow:     'rgba(6, 182, 212, 0.12)',   // cyan glow

  // ─── Data ───
  white:        '#E8E8ED',   // primary text
  whiteDim:     '#8888A0',   // secondary text
  whiteGhost:   '#4A4A62',   // placeholder

  // ─── Semantic ───
  green:        '#10B981',   // gains
  greenBright:  '#34D399',   // gain flash
  greenDim:     '#064E3B',   // green glow bg
  red:          '#EF4444',   // losses
  redBright:    '#F87171',   // loss flash
  redDim:       '#7F1D1D',   // red glow bg
  violet:       '#8B5CF6',   // AI/ASK, special data
  violetDim:    '#4C1D95',

  // ─── Fonts ───
  fontMono:     "'JetBrains Mono', monospace",
  fontDisplay:  "'Space Grotesk', sans-serif",  // NEW — geometric, sharp
  fontBody:     "'Inter', sans-serif",            // NEW — clean body text
} as const
```

**Why these fonts?** Space Grotesk is geometric and futuristic without being novelty — perfect for headers and data labels where JetBrains Mono is too heavy. Inter for body text is clean and high-contrast at small sizes. JetBrains Mono stays for all numerical data.

### Typography

- **Display:** Space Grotesk 700 — screen titles, panel headers, the BAKER wordmark
- **Data:** JetBrains Mono 400/500 — all numbers, prices, tables, command input
- **Body:** Inter 400/500 — descriptions, news text, metadata

Scale: `9 · 10 · 11 · 12 · 13 · 14 · 16 · 20 · 28 · 36`

### Motion Language

| Animation | Where | Style |
|-----------|-------|-------|
| `glowPulse` | Active panel borders, live indicators | 3s ease-in-out, subtle brightness oscillation |
| `neonFlash` | Price changes, live updates | 200ms bright flash → fade, not background tint |
| `panelSlideIn` | Panel open/close | 300ms `cubic-bezier(0.16, 1, 0.3, 1)` |
| `dataStreamIn` | Data grid row entry | 250ms stagger, 15ms/row, fade+translateX |
| `borderGlow` | Panel focus/hover | 150ms transition on border-color + box-shadow |

**Key difference from V2:** Animations are about *light*, not movement. Panels glow brighter when active. Data flashes with a neon pulse, not a background tint. The interface breathes light.

---

## Layout System: Multi-Panel Workspace

### Core Concept

Replace the single-screen + Panel wrapper with a **flexible panel grid**. Users type commands that open panels in a configurable layout. The command bar creates panels; the workspace holds them.

### Workspace Layout

```
┌─────────────────────────────────────────────────────────────┐
│  BAKER  │  < command input >            │  AAPL > EQUITY  │  <- CommandBar
├─────────┼──────────────────────────────┼──────────────────┤
│         │                              │                  │
│  PANEL  │        PANEL 2               │    PANEL 3       │
│   1     │                              │                  │
│ (EQUITY)│       (CHART)                │   (NEWS)         │
│         │                              │                  │
│  ▐▌▐▌  │      ▁▂▃▅▆▇█                │  Headlines...   │
│  Stats  │      ▇█▅▃▂▁                 │                  │
│         │                              │                  │
│         │                              │                  │
├─────────┴──────────────────────────────┴──────────────────┤
│  ● LIVE  │  SPX 5,234 ▲0.3% │ NDX 16,789 ▼0.1% │ 09:34 │  <- StatusBar
└─────────────────────────────────────────────────────────────┘
```

### Panel Architecture

**Each panel is an independent unit:**
- Has its own header with function name + context (e.g., "EQUITY · AAPL")
- Has its own close button (×) and maximize button (□)
- Can be dragged to rearrange (future phase — for now, fixed layouts)
- Glowing amber border when active/focused, dim border when background
- Subtle inner glow (`box-shadow: inset 0 0 30px rgba(245,158,11,0.03)`)

**Layout modes** (toggled via command bar):
- `1P` — single panel, full width
- `2P` — two panels side by side (50/50)
- `2PT` — two panels, top/bottom
- `3P` — three columns (40/35/25)
- `4P` — 2×2 grid
- `1P+1S` — one main + sidebar (70/30) — the default for most commands

**Default behavior:** When a user types `AAPL`, it opens EQUITY in the main panel. `AAPL GP` opens CHART in a second panel alongside. `AAPL N` adds NEWS as a third. This is the natural multi-panel flow.

### Panel Component V3

```
┌─ EQUITY · AAPL ─────────────────── × □ ┐
│                                          │
│  (glowing amber top border)              │
│  (subtle inner amber glow)               │
│                                          │
│  Content area                            │
│                                          │
└──────────────────────────────────────────┘
```

- Top border: 2px solid `C.amber` when focused, `C.border1` when not
- When focused: `box-shadow: 0 0 20px ${C.amberGlow}, inset 0 0 30px ${C.amberGlow}`
- Header: Space Grotesk 700, 11px, `C.amber` — function name · context
- Close (×) and maximize (□) buttons on right, `C.whiteGhost` → `C.amber` on hover
- Content: no padding at Panel level — each screen handles its own padding

---

## Screen Redesigns

### Home Screen

The command center. Not a menu — a **status dashboard**.

- Top: BAKER wordmark in Space Grotesk 700, 36px, `C.amber`, with a subtle text-shadow glow (`0 0 30px ${C.amberGlowStrong}`)
- Below: **market pulse strip** — 6 key indices (SPX, NDX, DJI, IWM, VIX, BTC) as horizontal bars, each showing price, ChangeIndicator, and a micro sparkline. The strip has a `border-bottom: 1px solid ${C.border1}` separator with a cyan glow accent on the left edge
- Center: **command suggestions** — not a grid of cards, but a typewriter-style list:
  ```
  > AAPL          View equity overview
  > AAPL GP       Launch chart with indicators
  > AAPL OPT      Options chain + surface
  > SCR pe<15     Screen stocks by fundamentals
  > BOND          Treasury yield curve
  > ASK why...    Ask AI about current screen
  ```
  Each line: command in JetBrains Mono `C.amber`, description in Inter `C.whiteDim`
  Active line has a cyan left border accent + background `C.surfaceGlow`
- Bottom: **recent activity** — last 5 commands executed, clickable to re-run
- Keyboard: arrow keys navigate suggestions, Enter executes

### Equity Screen (DES)

Reimagined as a **data-rich card stack**, not a wall of text.

- **Top band**: Ticker in Space Grotesk 700, 24px, `C.amber` + company name in Inter 400, 13px, `C.whiteDim` + sector badge (pill: `C.surface2` bg, `C.cyan` text) + LiveDot
- **Price hero**: Large price in JetBrains Mono 700, 36px, `C.white` with neon flash on change. ChangeIndicator to the right, 16px. Below: day range bar with gradient fill (`C.amberDim` → `C.amber` → `C.amberDim`)
- **Metrics grid**: 3×4 grid of Metric components on `C.surface1` cards. Each card: 1px `C.border0` border, 12px padding, metric label in Inter `C.whiteDim`, value in JetBrains Mono `C.white`. Cards for: P/E, EPS, Mkt Cap, 52W Range, Div Yield, Beta, Volume, Avg Volume, Next Earnings, Short Float, Target Price, Recommendation
- **Quick actions row**: pill buttons — `GP` `OPT` `NEWS` `FILINGS` `QUANT` — in `C.surface2` bg, `C.cyan` text, `C.cyan` border. On hover: bg → `C.cyanGlow`, text → `C.cyanBright`, glow effect
- **Company info** (bottom section, collapsible): sector, industry, CEO, employees, website — in a bordered card with `C.cyan` left accent

### Chart Screen (GP)

Chart-dominant with floating controls.

- Chart takes **100% of panel width**, 60%+ of panel height
- **Floating indicator pills** (top-right of chart): each active indicator = small pill with cyan text on `C.surface2` bg + dismiss ×. e.g., `SMA 20 ×` `RSI ×`
- **Interval bar** (top-left of chart): horizontal pills `1m · 5m · 15m · 1h · 1D · 1W · 1M`. Active = `C.amber` bg. Glass effect: `backdrop-filter: blur(12px)` on `C.surface2`
- **Chart crosshair**: `C.amber` horizontal line, `C.cyan` vertical line, price label in a frosted pill
- **Volume bars**: gradient fill — green bars go `C.green → transparent`, red bars go `C.red → transparent`
- **Drawing tools rail** (left edge, 40px): vertical strip with icon buttons for trendline, horizontal, fibonacci. Future phase — reserve the space

### Options Screen (OPT)

5-tab layout with dramatic visual differentiation per tab.

- **Tab bar**: horizontal, top of panel. Active tab = `C.amber` underline + `C.amber` text + subtle text-shadow glow. Inactive = `C.whiteGhost`
- **CHAIN**: Calls left, puts right, strike center — same as V2 but with neon accent:
  - ATM row: full row `background: ${C.amberGlow}` + `border-left: 3px solid ${C.amber}` + `box-shadow: -4px 0 12px ${C.amberGlow}` (glow bleeds left)
  - ITM calls: `border-left: 2px solid ${C.greenDim}`, slight green tint bg
  - ITM puts: `border-right: 2px solid ${C.redDim}`, slight red tint bg
  - Greek headers: single characters in `C.cyan` (Δ, Γ, Θ, V, ρ)
- **SURFACE**: SVG heatmap with neon color scale:
  - Low IV: deep blue-purple (`#1E1B4B`)
  - Mid IV: amber (`#F59E0B`)
  - High IV: hot red (`#EF4444`)
  - Each cell has a subtle `box-shadow: 0 0 2px ${C.amberGlow}` on hover
  - Color legend bar at top with gradient fill
- **TERM**: Lightweight Charts line in `C.cyan` on `C.surface0` background. Area fill below line in `C.cyanGlow`. Dot markers at data points
- **UNUSUAL**: DataGrid with neon row accents:
  - Vol/OI > 5x: `border-left: 3px solid ${C.amber}` + `box-shadow: -4px 0 12px ${C.amberGlow}`
  - Call contracts: `C.green` type badge
  - Put contracts: `C.red` type badge
- **FLOW**: Placeholder with a subtle animated scan line effect (CSS `@keyframes scanline`)

### Screener Screen (SCR)

Command-line aesthetic for the DSL bar.

- **Query bar**: full-width input on a `C.surface1` background with `border: 1px solid ${C.border1}`, focus → `border-color: ${C.cyan}` + `box-shadow: 0 0 12px ${C.cyanGlow}`. The cyan glow makes it feel like you're typing into a terminal-within-a-terminal
- **Filter chips**: horizontal row of `C.surface2` pills. Active chips get `C.amber` border + `C.amberGlow` background
- **Results**: DataGrid with alternating `C.surface1`/`C.surface2` rows. Ticker column in `C.cyan` (clickable). Sort indicators in `C.amber`
- **Saved queries sidebar** (left, 220px): `C.surface1` bg, `C.border1` right border. Each saved query: JetBrains Mono `C.amber` text, hover → `C.amberBright` + left accent. Add button at bottom: `+` in `C.cyan`

### News Screen (N)

Editorial layout with visual hierarchy.

- **Tab bar**: `COMPANY · WORLD · SENTIMENT`
- **COMPANY**: headline + source pill + time + sentiment dot (green/yellow/red 8px circle)
  - Headline in Inter 500, 13px, `C.white`
  - Source in Inter 400, 10px, `C.cyan` pill
  - Time in JetBrains Mono, `C.whiteGhost`
  - Hover: row background → `C.surfaceGlow`, headline → `C.amberBright`
- **WORLD**: topic chips at top (Economy, Tech, Energy, Crypto, Politics). Active = `C.amber` filled pill. News items below in same format
- **SENTIMENT**: SVG histogram bars with neon gradient fills. Positive bars: `C.green → transparent`. Negative bars: `C.red → transparent`. Neutral: `C.cyan → transparent`. DataGrid below sorted by score

### Quant Screen (QUANT)

Lab-instrument aesthetic — precise, clinical.

- **Stats panel**: 2×4 grid of Metric cards on `C.surface1` with `border: 1px solid ${C.border0}`. Values in JetBrains Mono, labels in Inter. Sharpe/VaR in `C.cyan` (special metrics). Max drawdown in `C.red`
- **Rolling vol chart**: Lightweight Charts area in `C.cyan` with `C.cyanGlow` fill. Clean grid, no decorations
- **Drawdown chart**: Inverted area in `C.red` with `C.redDim` fill. Label "MAX DRAWDOWN" in `C.red` at the trough point
- **Fama-French table**: DataGrid with factor names in `C.cyan`. β values colored by significance: |t| > 2 → `C.green`, else `C.whiteDim`
- **Cointegration test**: Two monospace inputs side by side + a `TEST →` button in `C.amber` on `C.surface1`. Result: large badge "COINTEGRATED" in `C.green` or "NOT" in `C.redDim`, with p-value below

### Commodity Screen (COMD)

Tabbed with distinct visual treatment per commodity type.

- **Tab bar**: `ENERGY · METALS · AGRICULTURE`
- **ENERGY**: Bar chart (Lightweight Charts) for petroleum stocks with `C.amber` bars + `C.amberGlow` gradient fill. STEO outlook as a Metric card row below
- **METALS**: Spot price cards in a 3-column grid. Each card: metal name in Space Grotesk, price in JetBrains Mono, Sparkline in `C.cyan`. Cards have `border: 1px solid ${C.border0}` with hover → `C.cyan` glow
- **AGRICULTURE**: DataGrid for PSD data. Supply columns in `C.greenDim` tint, demand in `C.redDim` tint

### Congress Screen (CONG)

Legal/governmental aesthetic — formal with accent colors.

- **Search bar**: same style as Screener DSL bar but with `C.amber` focus glow
- **Bills DataGrid**: status pills with defined colors:
  - Introduced: `C.amberMute` bg, `C.amber` text
  - Passed House: `C.cyanDim` bg, `C.cyan` text
  - Enacted: `C.greenDim` bg, `C.green` text
- **Detail panel** (slides in from right, 400px): `C.surface1` bg with `border-left: 2px solid ${C.amber}` + glow. Bill text in Inter, metadata in Metric-style rows. Link to Congress.gov in `C.cyan`

### Econ Screen (ECON)

Dashboard-driven with search as the entry point.

- **Search bar**: monospace input with `C.cyan` focus glow. Autocomplete dropdown with frosted glass
- **Favorites strip**: horizontal row of series pills (localStorage). Each pill: series ID in JetBrains Mono, latest value in `C.white`. Click → chart below. × to remove
- **Chart area**: Lightweight Charts line in `C.cyan` on `C.surface0`. Metadata card below: title, frequency, units, latest value in Metric format
- **Dashboard mode**: 2×2 grid of mini-charts for favorited series. Each mini-chart: 200px tall, thin `C.cyan` line, no axes — just the shape

### Bond Screen (BOND)

Yield curve as the hero visual.

- **Yield curve chart**: Lightweight Charts line in `C.amber` with area fill in `C.amberGlow`. X-axis: tenors (1M → 30Y). Current curve = solid `C.amber`, 1-week-ago curve = dashed `C.whiteGhost`
- **Curve stats**: 3 Metric cards below — 2s10s spread, 3m10y spread, EFFR — each with colored borders (inverted = `C.red`, steep = `C.green`, flat = `C.amber`)
- **Historical selector**: tenor pills (`2Y · 5Y · 10Y · 30Y`). Clicking one shows a line chart of that tenor's history in `C.cyan`

### ETF Screen (ETF)

Holdings-dominant layout.

- **Info header**: ETF name in Space Grotesk, expense ratio + AUM as Metric cards. Category badge in `C.cyan`
- **Holdings table**: DataGrid with top holdings. Ticker in `C.cyan` (clickable → equity), weight bar as inline gradient fill (0-5% = `C.amberDim` → `C.amber`)
- **Sector exposure**: horizontal bar chart (inline SVG). Each bar: sector name on left, bar fills right in `C.amber` with `C.amberGlow`. Percentage label in JetBrains Mono at bar end

---

## Command Bar V3

The spine of the interface.

```
┌──────────────────────────────────────────────────────────────┐
│  BAKER  │  █ type command...          │  AAPL > EQUITY > DES │
└──────────────────────────────────────────────────────────────┘
```

- Height: 44px
- Left: `BAKER` in Space Grotesk 700, 14px, `C.amber`, with text-shadow: `0 0 12px ${C.amberGlowStrong}` (the wordmark glows)
- Input: JetBrains Mono, `C.white`, block cursor in `C.amber`. Focus: `box-shadow: 0 0 12px ${C.amberGlow}` on the input area
- Bottom border: `1px solid ${C.border1}` with a gradient overlay: `linear-gradient(90deg, ${C.amberGlow}, transparent 15%, transparent 85%, ${C.amberGlow})` — amber light bleeds from the edges
- Breadcrumb: right-aligned, `AAPL > EQUITY > DES`. Current segment in `C.cyan`, previous in `C.whiteGhost`. `>` separators in `C.border1`
- Autocomplete dropdown: `backdrop-filter: blur(16px)` on `rgba(10,10,16,0.95)`. `C.border1` border with `C.amberGlow` shadow. Each suggestion: command in `C.amber` JetBrains Mono, description in `C.whiteDim` Inter. Hover row: `background: ${C.amberGlow}`, left accent `2px solid ${C.amber}`
- Active panel badge: pill with `C.surface2` bg, `C.amber` text, `1px solid ${C.amberDim}` border

## Status Bar V3

The information rail.

```
┌──────────────────────────────────────────────────────────────┐
│  ● LIVE  │  SPX 5,234 ▲0.3% │ NDX 16,789 ▼0.1% │ 09:34 ET │
└──────────────────────────────────────────────────────────────┘
```

- Height: 28px
- Left: LiveDot (pulsing green) + "LIVE" in Inter 700, 9px, `C.green`
- Market ticker: horizontal scroll of index quotes. Price in JetBrains Mono, change in ChangeIndicator. Each quote separated by `1px solid ${C.border1}` divider
- Micro sparklines: 24px wide, 8px tall, inline SVG in `C.cyan` for positive, `C.red` for negative
- Clocks: right-aligned, `tabular-nums`, thin `C.border0` dividers between zones
- Right edge: connection LiveDot. Green + "CONNECTED" or red + "OFFLINE"
- Top border: `1px solid ${C.border0}` with same gradient glow as command bar bottom

---

## Panel Component V3

The fundamental building block. Every screen lives inside a panel.

```typescript
interface PanelV3Props {
  title: string          // "EQUITY · AAPL"
  accent?: 'amber' | 'cyan' | 'green' | 'red' | 'violet'  // border accent color
  onClose?: () => void
  onMaximize?: () => void
  focused?: boolean      // is this the active panel?
  children: React.ReactNode
}
```

**Visual spec:**
- Background: `C.surface1`
- Border: `1px solid ${focused ? C.amber : C.border1}`
- When focused: `box-shadow: 0 0 20px ${C.amberGlow}, inset 0 0 30px rgba(245,158,11,0.02)`
- When unfocused: no shadow
- Header: 32px tall, `border-bottom: 1px solid ${focused ? C.amberDim : C.border0}`
- Title: Space Grotesk 700, 11px, `focused ? C.amber : C.whiteDim`, uppercase, letter-spacing 0.1em
- Close × and maximize □ buttons: 12px from right, `C.whiteGhost` → `C.amber` on hover, 20px hit area
- Accent variants: `cyan` → border `C.cyan`, glow `C.cyanGlow`. `green` → `C.green`/`C.greenDim`. `red` → `C.red`/`C.redDim`. `violet` → `C.violet`/`C.violetDim`

---

## Keyframe Animations (add to index.html)

```css
@keyframes glowPulse {
  0%, 100% { opacity: 1; filter: brightness(1); }
  50%      { opacity: 0.7; filter: brightness(0.8); }
}
@keyframes neonFlash {
  0%   { filter: brightness(2); }
  100% { filter: brightness(1); }
}
@keyframes panelSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dataStreamIn {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes borderGlow {
  0%, 100% { box-shadow: 0 0 15px var(--glow-color); }
  50%      { box-shadow: 0 0 25px var(--glow-color); }
}
@keyframes scanline {
  0%   { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
```

---

## Font Loading (update index.html)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
```

Remove DM Sans. Space Grotesk replaces it everywhere.

---

## What NOT to Change

- **Command bar paradigm** — typing commands stays. It's the UX core.
- **Inline styles** — project convention, don't break it.
- **React Query** — all data fetching patterns unchanged.
- **TradingView Lightweight Charts** — only chart library.
- **Free data sources only** — no paid APIs.
- **F-key shortcuts** — keep the mapping.
- **commandParser.ts** — don't change parsing logic.

---

## Definition of Done

1. Every screen renders with the V3 color system — no V2 hex values remain
2. Space Grotesk renders for all headers; JetBrains Mono for data; Inter for body text
3. Multi-panel workspace supports 1P, 2P, 2PT, 3P, 4P, 1P+1S layouts
4. Panels have glowing borders when focused, dim when background
5. Options screen has 5 functional tabs with neon-styled visuals
6. Home screen is a status dashboard with command suggestions, not a card grid
7. Command bar has glowing wordmark + cyan breadcrumb
8. Price flash uses neon flash (brightness filter), not background tint
9. `npm run build` produces zero errors
10. Bundle stays under 800KB gzipped