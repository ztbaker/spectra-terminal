import { useQuery } from '@tanstack/react-query'
import { fetchEquityLive } from '../lib/api'
import { useReportTick } from '../lib/freshness'
import type { MarketSession } from '../types'

export interface LivePriceData {
  ticker: string
  price: number | null
  change: number | null
  change_pct: number | null
  bid: number | null
  ask: number | null
  volume: number | null
  day_high: number | null
  day_low: number | null
  market_state: MarketSession
  pre_market_price: number | null
  pre_market_change: number | null
  pre_market_change_pct: number | null
  pre_market_time: number | null
  post_market_price: number | null
  post_market_change: number | null
  post_market_change_pct: number | null
  post_market_time: number | null
  regular_close: number | null
  regular_close_time: number | null
  as_of: number
}

export function useLivePrice(ticker: string, intervalMs = 500, enabled = true) {
  const q = useQuery<LivePriceData>({
    queryKey: ['live-price', ticker],
    queryFn: () => fetchEquityLive(ticker),
    staleTime: 0,
    refetchInterval: enabled ? intervalMs : false,
    refetchIntervalInBackground: false,
    retry: false,
  })
  // Report freshness to the enclosing panel so the live dot reflects tick arrival
  useReportTick(q.data?.as_of)
  return q
}