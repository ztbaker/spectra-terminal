# Plan 5: UI Design Upgrade — From Industrial to Cinematic

## Goal
Push the "Neon Industrial" aesthetic from good to unforgettable. The V3 suite is solid (82% quality score) — this plan targets the gaps to reach 95%+.

## Design Direction
**Cinematic Terminal** — Think Blade Runner 2049 meets Bloomberg Terminal. Dark, atmospheric, with purposeful light. Every glow has meaning. Every animation serves data comprehension.

## Tasks

### 1. Atmospheric Background Layer
**File:** `frontend/src/App.tsx` or new `BackgroundLayer.tsx`

Add a subtle, persistent background effect behind all panels:
- Very faint radial gradient centered on the focused panel: `radial-gradient(ellipse at ${panelCenter}, ${C.amber}03 0%, transparent 50%)`
- The gradient follows focus — when you click a panel, the ambient light shifts toward it (300ms transition)
- Add 1-2px noise texture overlay at 2% opacity for depth (CSS: `filter: url(#noise)` with an SVG filter, or a tiny repeating PNG)
- Optional: very subtle scan line effect at 1% opacity for CRT feel

### 2. Enhanced Panel Focus Transitions
**File:** `frontend/src/components/Terminal/PanelV3.tsx`

Upgrade the focus state:
- Add a subtle `scale(1.002)` transform on focused panel (barely perceptible but adds dimensionality)
- Unfocused panels get `filter: brightness(0.92)` to push them back visually
- The accent indicator dot should trail a fading afterglow when switching focus (CSS: `box-shadow` transition with longer duration on blur)
- Bottom accent line: animate width from 0% to 100% on focus (not instant appear)

### 3. Data-Driven Color Intensities
**File:** `frontend/src/components/screens/EquityScreenV3.tsx`, `HomeScreenV3.tsx`

Make colors respond to data magnitude:
- Price change > 3%: green/red gets brighter (use `C.greenBright` / `C.redBright`)
- Price change > 5%: add subtle `neonFlash` animation pulse
- Volume > 2x average: volume number gets cyan highlight
- This makes the terminal feel alive — large moves visually "pop"

### 4. Command Bar Interaction Polish
**File:** `frontend/src/components/Terminal/CommandBarV3.tsx`

- Autocomplete items: add a subtle left-to-right gradient wipe on hover (150ms)
- Active suggestion: amber left border should pulse once (200ms) on selection change
- Input cursor: replace default cursor with a custom block cursor (amber, blinking via `cursorBlink` animation)
- When typing, add a barely visible amber "ripple" emanating from the cursor position
- Keyboard shortcut hints in autocomplete should use a pill style: `background: ${C.surface2}`, `borderRadius: 3px`, `padding: 1px 5px`

### 5. Status Bar Ticker Tape Enhancement
**File:** `frontend/src/components/Terminal/StatusBarV3.tsx`

- Each ticker in the marquee should flash green/red briefly when its value changes between refreshes
- Add thin separator dots (amber, 3px diameter) between ticker items
- Market status indicator: add a 2-frame "breathing" shadow behind the status dot
- When market opens/closes, flash the entire status bar border once (amber pulse, 500ms)

### 6. Loading State Design
**Files:** All screens that show loading states

Replace generic loading with themed skeletons:
- Skeleton rows: `background: linear-gradient(90deg, ${C.surface1} 25%, ${C.surface2} 50%, ${C.surface1} 75%)` with `backgroundSize: 200% 100%` animated via `@keyframes shimmer { to { background-position: -200% 0 } }`
- Add this `shimmer` keyframe to `index.html`
- Skeleton text blocks: use `█████` characters in amber at 10% opacity, stagger-animated
- Loading overlay: semi-transparent surface with a thin amber progress bar at the top of the panel

### 7. Table/DataGrid Visual Upgrade
**Files:** All screens using `DataGrid` or `<table>`

- Header row: `background: ${C.surface1}`, `borderBottom: 2px solid ${C.amber}20`, `textTransform: 'uppercase'`, `letterSpacing: '0.08em'`, `fontSize: '9px'`
- Alternating row backgrounds: even rows `${C.surface0}`, odd rows `${C.surface0}80` (very subtle)
- Hover row: `background: ${C.surfaceGlow}` with 100ms transition
- Active/selected row: left amber border `3px solid ${C.amber}`
- Numbers right-aligned, text left-aligned (always)
- Negative numbers in `C.red`, positive in `C.green`, zero in `C.whiteDim`
- Add thin column separators: `borderRight: 1px solid ${C.border0}`

### 8. Chart Integration Polish
**File:** `frontend/src/components/screens/ChartScreen.tsx`

- Chart container: add `border: 1px solid ${C.border0}` with `borderRadius: 4px`
- Crosshair info overlay: glassmorphic card (`background: ${C.glass}`, `backdropFilter: blur(8px)`)
- Period selector buttons: currently flat — add subtle depth with `boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'`
- Active period: amber bottom border, not just color change
- Add a thin amber line at y=0 (previous close) for reference

### 9. Micro-Interaction Details
**Files:** Various

- All clickable elements: add `cursor: 'pointer'` and `transition: all 150ms ease`
- Buttons on press: `transform: scale(0.97)` for tactile feedback
- Focus outlines: replace `outline: none` with `outline: 2px solid ${C.amber}40` offset by 2px (accessibility)
- Tooltip style (if any tooltips exist): dark glass card with amber text, arrow pointer

### 10. Typography Refinement
**File:** `frontend/src/lib/colors.ts` + all screens

- Add a display font variant for large numbers: `fontDisplay` at weight 300 (light) for hero prices — gives a premium financial terminal feel
- Section headers: enforce `letterSpacing: '0.15em'` consistently
- Monospace numbers: add `fontVariantNumeric: 'tabular-nums'` to all number displays (prevents layout shift when digits change)
- Add `fontFeatureSettings: '"tnum"'` as a constant in colors.ts
