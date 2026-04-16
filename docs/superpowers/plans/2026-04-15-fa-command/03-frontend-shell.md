# Agent 3 — Frontend Shell & Integration

**Read `00-shared-contract.md` first. Agent 4 owns the presentational sub-components; you wire them up.**

## Scope

Everything that lets `AAPL FA` route through the command bar, hit the backend, and hand data to the (Agent 4) tables. You build the FA screen shell (tabs + period toggle + data fetching) and all plumbing — command parser, types, API client, App routing.

## Files

**Create:**
- `frontend/src/components/screens/FAScreen.tsx`

**Modify:**
- `frontend/src/types/index.ts` — add FA types
- `frontend/src/lib/api.ts` — add `fetchFA`
- `frontend/src/lib/commandParser.ts` — register `FA`
- `frontend/src/App.tsx` — route `screen === 'FA'` to `<FAScreen>`

**Do NOT touch:**
- Any file under `frontend/src/components/fa/` (Agent 4 owns them)
- Backend code

## Types (`types/index.ts`)

Mirror `00-shared-contract.md` exactly. All numeric fields `number | null`. Export:
`FAPeriod`, `FARatios`, `FAValuation`, `FAGrowth`, `FAOverview`, `FAResponse`.

## API Client (`lib/api.ts`)

```ts
export const fetchFA = (ticker: string, period: 'annual' | 'quarterly' = 'annual'): Promise<FAResponse> =>
  api.get(`/fa/${ticker}`, { params: { period } }).then(r => r.data)
```

## Command Parser (`lib/commandParser.ts`)

Add `FA` to the ticker-scoped screens list alongside `GP`, `OPT`, `QUANT`. A command like `AAPL FA` should parse to `{ screen: 'FA', ticker: 'AAPL' }`. Follow the existing pattern exactly — do not invent a new dispatch shape.

## App Routing (`App.tsx`)

Add a case in the screen-switching logic:
```tsx
case 'FA':
  return <FAScreen ticker={ticker} onNavigate={handleCommand} />
```

Import `FAScreen` lazily if other screens are lazy-loaded; match the surrounding convention.

## FAScreen Shell

```tsx
// frontend/src/components/screens/FAScreen.tsx
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFA } from '../../lib/api'
import LoadingBar from '../shared/LoadingBar'
import C from '../../lib/colors'
import type { FAResponse } from '../../types'

// From Agent 4:
import OverviewStrip     from '../fa/OverviewStrip'
import IncomeTable       from '../fa/IncomeTable'
import BalanceTable      from '../fa/BalanceTable'
import CashFlowTable     from '../fa/CashFlowTable'
import RatiosPanel       from '../fa/RatiosPanel'
import ValuationPanel    from '../fa/ValuationPanel'

type Tab = 'INCOME' | 'BALANCE' | 'CASH' | 'RATIOS' | 'VALUE'
type Period = 'annual' | 'quarterly'

interface Props { ticker: string; onNavigate: (cmd: string) => void }

const FAScreen: React.FC<Props> = ({ ticker, onNavigate: _onNavigate }) => {
  const [tab, setTab]       = useState<Tab>('INCOME')
  const [period, setPeriod] = useState<Period>('annual')

  const { data, isLoading, error } = useQuery<FAResponse>({
    queryKey: ['fa', ticker, period],
    queryFn:  () => fetchFA(ticker, period),
    staleTime: 60_000,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface0, overflow: 'hidden' }}>
      <LoadingBar loading={isLoading} />

      <div className="bb-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px' }}>
        <span>{ticker} FA — FINANCIAL ANALYSIS</span>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {data && <OverviewStrip overview={data.overview} ticker={ticker} />}

      <TabBar value={tab} onChange={setTab} />

      {error && <ErrorRow msg={(error as Error).message} />}

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {data && tab === 'INCOME'  && <IncomeTable   data={data} />}
        {data && tab === 'BALANCE' && <BalanceTable  data={data} />}
        {data && tab === 'CASH'    && <CashFlowTable data={data} />}
        {data && tab === 'RATIOS'  && <RatiosPanel   data={data} />}
        {data && tab === 'VALUE'   && <ValuationPanel data={data} />}
      </div>
    </div>
  )
}

export default FAScreen
```

Build `PeriodToggle`, `TabBar`, and `ErrorRow` inside this same file as small helper components — they're not reused elsewhere. Style them consistently with `EquityScreenV3.tsx` and `OptionsScreen.tsx` (amber for active, dim for inactive, 1px border separators).

## Tab Bar Styling

Tabs: INCOME · BALANCE · CASH FLOW · RATIOS · VALUATION.

- Row of 5 tabs, horizontal, `1px solid ${C.border0}` bottom border.
- Active tab: amber text, 2px amber underline.
- Inactive: `C.whiteDim`, hover → `C.amberMute`.
- Font size 11px, letter-spacing 0.08em, uppercase.
- Click handler sets `tab` state.

## Period Toggle

Two buttons: `ANNUAL` / `QUARTERLY`. Active one has amber background + black text, inactive is surface0 + amberDim text. Small (20px tall, 10px font).

## Shape Contract Between You and Agent 4

Every sub-component receives `data: FAResponse` (or a sub-slice) and renders itself. They don't fetch. You own the query and pass data down. Document this in a top-of-file comment inside `FAScreen.tsx`.

## Tests

Add `frontend/src/components/screens/FAScreen.test.tsx` (Vitest + RTL if the project uses them — otherwise skip this section and note why). At minimum:
1. Renders header with ticker.
2. Calls `fetchFA` on mount and on period change.
3. Tab click switches visible sub-component (mock all four sub-components to render their names).

## Done when

- Typing `AAPL FA` in the command bar navigates to the FA screen.
- Screen renders overview strip + 5 tabs + period toggle.
- Changing period re-fetches (React Query devtools / network tab confirms).
- No TS errors (`npm run build`).
- No direct chart library imports other than Lightweight Charts (you probably don't need any charts here — leave charts for ratios sparklines in Agent 4).
- Every sub-component imported from `../fa/*` — do not inline their markup.
