# SpectraTerminal Frontend Redesign Plan

**Aesthetic direction:** Refined industrial luxury — think Bloomberg meets a Porsche instrument cluster. Not retro-terminal cosplay, but a *modern* terminal built by someone who respects Bloomberg's density while demanding contemporary polish.

**Tone:** Dark, high-contrast, surgically precise. Every pixel earns its place.

**What someone will remember:** The typography, the data density, and how alive it feels — subtle pulse animations on live data, smooth transitions between screens, and a command bar that feels like flying a spacecraft.

---

## Constraints (inherited — do not break)

- Inline styles only (no CSS-in-JS library, no Tailwind, no CSS modules)
- TradingView Lightweight Charts only
- React Query for server state
- JetBrains Mono stays as the monospace face
- Must work in Electron at any viewport ≥1280×720

---

## Design System Overhaul

### 1. Color System v2

The current palette is functional but flat. The redesign introduces **depth layers** and **semantic intensity**.

```typescript
const C = {
  // ─── Backgrounds (depth layers) ───
  bg0:        '#050505',   // deepest — app chrome
  bg1:        '#0a0a0a',   // panel base
  bg2:        '#111111',   // card/section
  bg3:        '#1a1a1a',   // hover / active row
  bgGlow:     '#0d0800',   // warm glow behind active elements

  // ─── Borders ───
  border0:    '#1a1a1a',   // subtle dividers
  border1:    '#2a2a2a',   // standard
  border2:    '#3a3a3a',   // emphasized

  // ─── Amber spectrum (primary) ───
  amber:      '#ff9900',   // primary — headlines, active
  amberHot:   '#ffaa22',   // hover state
  amberDim:   '#b37200',   // secondary labels
  amberMute:  '#664400',   // tertiary / metadata
  amberGhost: '#331f00',   // ghost text, disabled

  // ─── Data values ───
  white:      '#e8e8e8',   // primary data
  whiteDim:   '#999999',   // secondary data
  whiteGhost: '#555555',   // placeholder

  // ─── Semantic ───
  green:      '#00e639',   // gains — slightly desaturated from #00ff41
  greenDim:   '#00802b',   // green background tint
  red:        '#ff2b2b',   // losses
  redDim:     '#801616',   // red background tint
  blue:       '#3399ff',   // links, interactive
  blueDim:    '#1a4d80',   // blue tint
  yellow:     '#ffcc00',   // warnings, emphasis
  cyan:       '#00cccc',   // special data (IV, Greeks)

  // ─── Accent for new features ───
  violet:     '#9966ff',   // AI / ASK command
  violetDim:  '#4d3380',
} as const
```

### 2. Typography System

Introduce a **display font** alongside JetBrains Mono. Load via Google Fonts in `index.html`.

- **Display / headers:** `'DM Sans', sans-serif` — geometric, clean, modern. Used for screen titles, panel headers, home screen branding.
- **Data / mono:** `'JetBrains Mono', monospace` — all numbers, tables, command bar, code.
- **Body text:** `'DM Sans', sans-serif` — news articles, descriptions, long-form.

Font scale (in px): `10 · 11 · 12 · 13 · 14 · 16 · 20 · 28`

No font larger than 28px anywhere in the app. Density is the goal.

### 3. Spacing System

8px grid. All padding/margin values must be multiples of 4:
- `4` — tight (between related items)
- `8` — standard
- `12` — comfortable
- `16` — section padding
- `24` — panel padding
- `32` — screen-level padding

### 4. Shared Component Primitives

Every screen currently builds its own layout. Extract a tight set of composable primitives:

**`<Panel>`** — already exists, enhance:
```
- Add `variant: 'default' | 'highlight' | 'danger' | 'success'` — left-border accent color
- Add `glow?: boolean` — subtle box-shadow: `0 0 20px rgba(255, 153, 0, 0.03)`
- Add `collapsible?: boolean` with smooth height transition
```

**`<DataGrid>`** — new, replaces all ad-hoc table rendering:
```
- Column definitions with type: 'text' | 'number' | 'pct' | 'currency' | 'change' | 'sparkline'
- Auto-formatting per type (currency → $X.XX, pct → X.XX%, change → green/red with sign)
- Sortable columns (click header)
- Sticky header row
- Alternating row tint (bg1/bg2)
- Hover highlight (bg3)
- Virtual scrolling for >100 rows (use @tanstack/react-virtual)
```

**`<Metric>`** — new, replaces all "label: value" patterns:
```
<Metric label="P/E" value={28.5} format="number" />
<Metric label="Mkt Cap" value={2.7e12} format="large" />
<Metric label="Change" value={-2.3} format="pct" color="semantic" />
```

**`<TabBar>`** — new, consistent tab navigation:
```
- Amber underline on active tab
- Smooth slide transition on tab change
- Keyboard navigable (left/right arrows)
```

**`<ChangeIndicator>`** — new micro-component:
```
- Green up-arrow + value for positive
- Red down-arrow + value for negative
- Animates on value change (brief flash)
```

**`<LiveDot>`** — new:
```
- 6px circle, green with subtle pulse animation
- Shown next to any live-updating data value
```

---

## Screen-by-Screen Redesign

### Command Bar (top chrome)

**Current:** 36px, flat black, basic input + blinking block cursor.

**Redesign:**
- Height: **40px** — slightly more breathing room
- Left zone: `BAKER` wordmark in DM Sans 700, 14px, amber — replace ASCII-style `[ZAC TERMINAL]`
- Add a **subtle warm gradient** on the bottom border: `linear-gradient(90deg, #ff990033, transparent 30%, transparent 70%, #ff990033)`
- Input: keep block cursor but add a **subtle amber glow** (`box-shadow: 0 0 8px rgba(255,153,0,0.15)`) when focused
- Active screen badge: move from plain text to a **pill** with bg3 background + amber text + rounded corners
- Add **breadcrumb trail**: `AAPL > EQUITY > FINANCIALS` when drilling down
- Autocomplete dropdown: add a **frosted glass** effect (`backdrop-filter: blur(8px)`, `background: rgba(10,10,10,0.9)`)

### Status Bar (bottom chrome)

**Current:** 24px, marquee ticker tape + clocks.

**Redesign:**
- Height: **28px**
- Market status pill: add a **pulsing dot** (green for OPEN, yellow for PRE/AFTER, red for CLOSED)
- Ticker tape: add **micro sparklines** (8px tall, inline SVG) next to each index change
- Clocks: add a **thin separator line** between each timezone, use `tabular-nums` for alignment
- Add a **connection indicator** on far right: green dot = backend healthy, red = disconnected

### Home Screen

**Current:** ASCII art + grid of buttons.

**Redesign — the showpiece:**
- Kill the ASCII art. Replace with:
  - `BAKER` in DM Sans 700, 28px, amber, letter-spacing 0.3em
  - `TERMINAL` below it in JetBrains Mono 400, 12px, amberDim, letter-spacing 0.5em
  - Subtle **radial gradient glow** behind the wordmark (`radial-gradient(ellipse at center, #ff990008 0%, transparent 60%)`)
- **Market overview strip** below branding: 4 inline tiles showing SPX / NDX / DJI / VIX with price + change + micro sparkline. Updates live.
- **Quick access grid:** redesign as a **2-column card layout** with:
  - Left column: "MARKETS" group (Equity, Chart, Options, ETF, Crypto, FX, Commodity, Bond)
  - Right column: "TOOLS" group (Screener, Portfolio, Watchlist, Earnings, News, Filings, Congress, Quant)
  - Each card: icon (inline SVG, 16px, amber) + label (DM Sans 700) + description (amberDim)
  - Hover: card border transitions from border0 → amber over 200ms, background shifts to bgGlow
- **Staggered fade-in** on page load: branding first (0ms), market strip (100ms), cards left column (200ms), cards right column (300ms). Use CSS `@keyframes fadeSlideUp` — no JS animation library needed.
- **Keyboard shortcuts** section: collapse into a `?` tooltip triggered by `Shift+?`, not permanent on-screen

### Equity Screen

**Current:** 527 lines, dense data panels.

**Redesign:**
- **Header bar:** ticker badge (large, 20px) + company name (DM Sans) + live price with ChangeIndicator + LiveDot
- **3-column layout** (responsive grid):
  - Left: Key stats (PE, EPS, beta, div yield) using `<Metric>` components in a 2×N grid
  - Center: intraday sparkline (128px tall) + 52-week range bar (redesigned — thicker, rounded, with gradient fill)
  - Right: Company info card (sector, industry, CEO, employees, website link)
- **Financials tab** below: income/balance/cash flow as a `<DataGrid>` with quarterly columns
- **Related actions** row: pill buttons → `GP` `OPT` `NEWS` `FILINGS` `QUANT` — navigate on click

### Chart Screen (GP)

**Current:** 801 lines, TradingView chart + indicator panel.

**Redesign:**
- Chart fills **full available width**, minimum 70% of viewport height
- **Floating indicator panel** (top-right, semi-transparent bg2 with blur) — toggle buttons for each indicator
- Active indicators shown as **amber pills** below the chart with a dismiss `×`
- Interval selector: horizontal pill bar (1m · 5m · 15m · 1h · 1D · 1W · 1M) with smooth slide indicator
- **Drawing tools sidebar** (left edge, 32px wide): trendline, horizontal, fibonacci — future phase but reserve the space
- Volume bars: use gradient fill (green→transparent for up, red→transparent for down)

### Options Screen (OPT) — major expansion

**Current:** 353 lines, chain only.

**Redesign with 5 tabs:**

**Tab 1: CHAIN** (existing, enhanced)
- Calls on left, puts on right, strike price column in center (Bloomberg layout)
- ITM rows: subtle greenDim/redDim background tint
- Greeks in compact columns: Δ, Γ, Θ, V (single character headers)
- ATM strike row: **highlighted border** (amber left + right borders)

**Tab 2: SURFACE** (new)
- 2D heatmap grid: X = strike, Y = expiry, color = IV
- Color scale: deep blue (low IV) → amber → red (high IV)
- Hover: tooltip with exact IV + strike + expiry
- Implemented as inline SVG `<rect>` grid (no canvas, no external lib)

**Tab 3: TERM** (new)
- Lightweight Charts line chart: X = days to expiry, Y = ATM IV
- Overlay: historical term structure (30 days ago, faded line)

**Tab 4: UNUSUAL** (new)
- `<DataGrid>` sorted by Vol/OI ratio descending
- Columns: ticker, strike, expiry, type (C/P), volume, OI, vol/OI, last price, IV
- High vol/OI rows (>5x): amber left border accent

**Tab 5: FLOW** (new — future, placeholder tab)
- "Coming soon" placeholder with amberMute text

### Screener Screen — DSL integration

**Current:** 463 lines, dropdown filters only.

**Redesign:**
- **DSL query bar** at top: monospace input, full width, amber border, placeholder text `pe<15 AND mktcap>1b AND sector="Technology"`
- Below: results `<DataGrid>` with columns auto-derived from query fields
- **Saved queries sidebar** (left, 200px): localStorage-backed, click to load
- **Quick filter chips** below query bar: clickable chips for common patterns (`Value`, `Growth`, `Dividend`, `Momentum`) that populate the DSL bar
- Keep existing dropdown UI as "Visual Builder" — toggle between DSL and Visual modes

### News Screen — tabbed

**Current:** 220 lines, single view.

**Redesign:**
- `<TabBar>` with 3 tabs: `COMPANY | WORLD | SENTIMENT`
- COMPANY tab: filtered by context ticker, each item = headline + source + time + sentiment badge (green/yellow/red pill)
- WORLD tab: topic selector chips (Economy, Tech, Energy, Crypto, Politics)
- SENTIMENT tab: sentiment histogram (inline SVG) + table sorted by sentiment score
- Each news item: hover shows 2-line preview if available

### Commodity Screen — tabbed

**Current:** 65 lines, flat table.

**Redesign:**
- `<TabBar>`: `ENERGY | METALS | AGRICULTURE`
- ENERGY: crude + products stocks chart (Lightweight Charts bar series) + STEO outlook
- METALS: spot prices grid with sparklines
- AGRICULTURE: PSD supply/demand table

### Quant Screen — charts + data

**Current:** 58 lines, tiles only.

**Redesign:**
- **Summary stats panel** (top): 2-row grid of `<Metric>` components
- **Rolling volatility chart** (Lightweight Charts area series, 252-day window)
- **Drawdown chart** below (inverted area, red fill)
- **Fama-French factor table**: β(Mkt-RF), β(SMB), β(HML) with significance indicators
- **Cointegration quick-test**: two ticker inputs + "TEST" button → result card

### Congress Screen — enhanced

**Current:** 47 lines, list only.

**Redesign:**
- Bills list with status pills (`Introduced`, `Passed House`, `Enacted`) in semantic colors
- Click row → slide-in detail panel (right side, 400px) with bill text + metadata
- Search/filter bar at top

### Economy Screen — search-driven

**Current:** Hardcoded series.

**Redesign:**
- **Search bar** (top): `/econ/search` autocomplete, amber border
- **Favorites** row: pinned series (stored in localStorage)
- Selecting a series → instant chart (Lightweight Charts) + metadata panel
- **Dashboard mode**: 4-panel grid of pinned charts (2×2)

---

## Animation & Motion

All animation CSS-only (no framer-motion, no GSAP). Inline `@keyframes` injected via a single `<style>` tag in `index.html`.

| Animation | Where | Duration | Easing |
|-----------|-------|----------|--------|
| `fadeSlideUp` | Home screen cards staggered entry | 400ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `pulseGlow` | Live price dots, market status | 2s loop | `ease-in-out` |
| `flashGreen` / `flashRed` | Price change moments | 300ms | `ease-out` |
| `slideRight` | Tab indicator underline | 200ms | `ease-out` |
| `expandDown` | Collapsible panels | 250ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `marquee` | Status bar ticker tape (existing) | 40s | `linear` |

**Price flash:** when a live price updates, the value's background briefly flashes greenDim or redDim (300ms), then fades back. Pure CSS transition on a `data-flash` attribute toggled by React.

---

## Implementation Phases

### Phase A — Design system foundation (do first)
1. Update `lib/colors.ts` with v2 palette
2. Add `<style>` block to `index.html` with all keyframe animations + `@import` for DM Sans
3. Create shared components: `DataGrid`, `Metric`, `TabBar`, `ChangeIndicator`, `LiveDot`
4. Redesign `CommandBar`, `StatusBar`, `PanelLayout`
5. Redesign `HomeScreen`

### Phase B — Core screens (highest-traffic)
6. Redesign `EquityScreen` with 3-column layout + Metric grid
7. Redesign `ChartScreen` with floating indicator panel
8. Redesign `OptionsScreen` with 5 tabs (CHAIN + SURFACE + TERM + UNUSUAL + FLOW)
9. Redesign `ScreenerScreen` with DSL bar + saved queries

### Phase C — New screen buildout
10. Redesign `NewsScreen` with 3 tabs
11. Redesign `CommodityScreen` with 3 tabs
12. Redesign `QuantScreen` with charts + FF table
13. Redesign `CongressScreen` with detail panel
14. Redesign `EconScreen` with search bar + dashboard mode

### Phase D — Polish
15. Add price flash animations to all live-updating values
16. Add staggered entry animations to all data grids
17. Virtual scrolling for any grid >100 rows
18. Electron: ensure all `backdrop-filter` effects work (Chromium supports them)
19. Responsive breakpoints: 1280 (compact), 1440 (standard), 1920 (expanded)

---

## Dependency graph

```
Phase A (design system)
   ├── Phase B (core screens)
   │      └── Phase D (polish)
   └── Phase C (new screens)
          └── Phase D (polish)
```

Phase A must be complete before B or C start. B and C can run in parallel. D runs last.

---

## What NOT to change

- **Command bar paradigm** — Bloomberg-style typing commands stays. It's the core UX.
- **Inline styles** — project convention, don't break it.
- **React Query** — keep all data fetching patterns.
- **TradingView Lightweight Charts** — only chart library allowed.
- **F-key shortcuts** — keep the mapping.
- **`lib/commandParser.ts`** — don't change parsing logic.

---

## Font loading

Add to `frontend/index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
```

JetBrains Mono is already loaded (verify — if not, add it the same way).

---

## Definition of done

1. Every screen renders with the v2 color system — no old hex values remain.
2. DM Sans renders for all headers; JetBrains Mono for all data.
3. All shared components (`DataGrid`, `Metric`, `TabBar`, `ChangeIndicator`, `LiveDot`) exist and are used by ≥3 screens each.
4. Options screen has 5 functional tabs consuming existing backend endpoints.
5. Screener has DSL query bar wired to `/screener/dsl`.
6. News, Commodity, Quant, Congress, Econ screens are fully built out.
7. Home screen staggered fade-in animation works.
8. Price flash animations work on live data.
9. `npm run build` produces zero errors.
10. Bundle stays under 800KB gzipped (currently 176KB — lots of headroom).
