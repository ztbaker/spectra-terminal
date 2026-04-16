import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

interface FreshnessState {
  lastTickAt: number | null
}

interface FreshnessAPI extends FreshnessState {
  reportTick: () => void
}

const Ctx = createContext<FreshnessAPI | null>(null)

export const FreshnessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FreshnessState>({ lastTickAt: null })
  const api = useRef<FreshnessAPI>({
    lastTickAt: null,
    reportTick: () => setState({ lastTickAt: Date.now() }),
  })
  api.current.lastTickAt = state.lastTickAt
  return <Ctx.Provider value={api.current}>{children}</Ctx.Provider>
}

export function useReportTick(trigger: unknown): void {
  const ctx = useContext(Ctx)
  useEffect(() => {
    if (!ctx) return
    if (trigger == null) return
    ctx.reportTick()
  }, [ctx, trigger])
}

type Freshness = 'fresh' | 'stale' | 'cold' | 'none'

export function useFreshness(): { age: number | null; status: Freshness } {
  const ctx = useContext(Ctx)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (!ctx?.lastTickAt) return
    const id = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [ctx?.lastTickAt])

  if (!ctx?.lastTickAt) return { age: null, status: 'none' }
  const age = Date.now() - ctx.lastTickAt
  const status: Freshness = age < 5000 ? 'fresh' : age < 30_000 ? 'stale' : 'cold'
  return { age, status }
}
