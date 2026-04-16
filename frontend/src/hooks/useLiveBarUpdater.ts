import { useEffect, useRef } from 'react'
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { LivePriceData } from './useLivePrice'

type ChartType = 'CANDLE' | 'LINE' | 'AREA' | 'BAR'
type MarketState = 'PRE' | 'OPEN' | 'POST' | 'CLOSED'

interface SyntheticCandle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

const INTERVAL_BUCKET_SECONDS: Record<string, number> = {
  '1m':   60,
  '5m':   300,
  '15m':  900,
  '1h':   3600,
  '1d':   86400,
  '1wk':  604800,
  '1mo':  2592000,
}

function getCurrentBucket(interval: string): number {
  const size = INTERVAL_BUCKET_SECONDS[interval] ?? 86400
  return Math.floor(Date.now() / 1000 / size) * size
}

export function getActivePrice(lp: LivePriceData): { price: number | null; state: MarketState } {
  const state = lp.market_state ?? 'CLOSED'
  switch (state) {
    case 'PRE':
      return { price: lp.pre_market_price ?? lp.price, state }
    case 'POST':
      return { price: lp.post_market_price ?? lp.price, state }
    case 'OPEN':
      return { price: lp.price, state }
    default:
      return { price: null, state }
  }
}

export function getActiveChange(lp: LivePriceData): { change: number | null; changePct: number | null } {
  const state = lp.market_state ?? 'CLOSED'
  switch (state) {
    case 'PRE':
      return { change: lp.pre_market_change, changePct: lp.pre_market_change_pct }
    case 'POST':
      return { change: lp.post_market_change, changePct: lp.post_market_change_pct }
    case 'OPEN':
      return { change: lp.change, changePct: lp.change_pct }
    default:
      return { change: null, changePct: null }
  }
}

interface UseLiveBarUpdaterArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  series: ISeriesApi<any> | null
  chartType: ChartType
  lastBarTimeRef: React.MutableRefObject<number>
  interval: string
  livePrice: LivePriceData | undefined
  marketState: MarketState | undefined
  allowPrePost?: boolean
}

export function useLiveBarUpdater({
  series,
  chartType,
  lastBarTimeRef,
  interval,
  livePrice,
  marketState,
  allowPrePost = false,
}: UseLiveBarUpdaterArgs) {
  const candleRef      = useRef<SyntheticCandle | null>(null)
  const bucketRef      = useRef<number>(0)
  const marketStateRef = useRef<MarketState | undefined>(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef      = useRef<ISeriesApi<any> | null>(null)
  const chartTypeRef   = useRef<ChartType>(chartType)
  const intervalRef    = useRef<string>(interval)
  const lastBarTimeRefInternal = useRef(lastBarTimeRef)

  useEffect(() => { marketStateRef.current = marketState }, [marketState])
  useEffect(() => { seriesRef.current = series }, [series])
  useEffect(() => { chartTypeRef.current = chartType }, [chartType])
  useEffect(() => { intervalRef.current = interval }, [interval])
  useEffect(() => { lastBarTimeRefInternal.current = lastBarTimeRef }, [lastBarTimeRef])

  useEffect(() => {
    if (!livePrice?.price) return
    if (!seriesRef.current) return
    if (document.visibilityState !== 'visible') return
    const ms = marketStateRef.current
    if (!ms) return
    if (ms !== 'OPEN' && !(allowPrePost && (ms === 'PRE' || ms === 'POST'))) return

    const price = livePrice.price
    const bucket = getCurrentBucket(intervalRef.current)
    const ct = chartTypeRef.current
    const ser = seriesRef.current

    if (ct === 'LINE' || ct === 'AREA') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ser.update({ time: lastBarTimeRefInternal.current.current as UTCTimestamp, value: price } as any)
      // eslint-disable-next-line no-empty
      } catch {}
      return
    }

    if (!candleRef.current || bucket !== bucketRef.current) {
      bucketRef.current = bucket
      candleRef.current = {
        time: bucket as UTCTimestamp,
        open: price,
        high: price,
        low: price,
        close: price,
      }
    } else {
      const c = candleRef.current
      c.close = price
      c.high = Math.max(c.high, price)
      c.low  = Math.min(c.low, price)
    }

    try {
      ser.update({
        time: candleRef.current.time,
        open: candleRef.current.open,
        high: candleRef.current.high,
        low: candleRef.current.low,
        close: candleRef.current.close,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    // eslint-disable-next-line no-empty
    } catch {}
  }, [livePrice?.price, livePrice?.as_of, allowPrePost])

  useEffect(() => {
    if (!series || !livePrice?.price) return
    if (marketState === 'OPEN' || (allowPrePost && (marketState === 'PRE' || marketState === 'POST'))) {
      const bucket = getCurrentBucket(interval)
      if (!candleRef.current || bucket !== bucketRef.current) {
        bucketRef.current = bucket
        if (chartType === 'CANDLE' || chartType === 'BAR') {
          candleRef.current = {
            time: bucket as UTCTimestamp,
            open: livePrice.price,
            high: livePrice.price,
            low: livePrice.price,
            close: livePrice.price,
          }
        }
      }
    }
  }, [series, chartType, interval, marketState, livePrice?.price, allowPrePost])
}