import { useQuery } from '@tanstack/react-query'
import { fetchEquityLive } from '../lib/api'
import { useReportTick } from '../lib/freshness'
import { useLiveStream } from './useLiveStream'
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

const SSE_SUPPORTED = typeof window !== 'undefined' && typeof window.EventSource !== 'undefined'

export function useLivePrice(ticker: string, intervalMs = 500, enabled = true) {
  const stream = useLiveStream(ticker, enabled && SSE_SUPPORTED)

  const poll = useQuery<LivePriceData>({
    queryKey: ['live-price', ticker],
    queryFn: () => fetchEquityLive(ticker),
    staleTime: 0,
    refetchInterval: enabled && !SSE_SUPPORTED ? intervalMs : false,
    refetchIntervalInBackground: false,
    retry: 1,
    enabled: enabled && !SSE_SUPPORTED,
  })

  const as_of = SSE_SUPPORTED ? stream.data?.as_of : poll.data?.as_of
  useReportTick(as_of)

  if (SSE_SUPPORTED) {
    return {
      data: stream.data ?? undefined,
      isLoading: stream.isLoading,
      isError: !!stream.error,
      error: stream.error,
      refetch: () => {},
    } as const
  }

  return poll
}