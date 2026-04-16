import { useState, useRef, useCallback, useEffect } from 'react'
import { fetchChartHistory } from '../lib/api'
import type { ChartData, OhlcvBar } from '../types'

interface ChartHistoryState {
  ohlcv: OhlcvBar[]
  isLoadingOlder: boolean
  hasMore: boolean
  truncated: boolean
  loadOlder: () => void
}

export function useChartHistory(
  ticker: string,
  period: string,
  interval: string,
  chartData: ChartData | null,
): ChartHistoryState {
  const [ohlcv, setOhlcv] = useState<OhlcvBar[]>([])
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [truncated, setTruncated] = useState(false)

  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const barsRef = useRef<OhlcvBar[]>([])
  const prevTickerRef = useRef(ticker)
  const fetchTokenRef = useRef(0)

  const computeStart = (end: string): string => {
    const INTRADAY = new Set(['1m', '5m', '15m', '30m', '1h'])
    const endMs = new Date(end).getTime()
    const delta = INTRADAY.has(interval) ? 5 : 365
    const startMs = endMs - delta * 24 * 60 * 60 * 1000
    return new Date(startMs).toISOString().slice(0, 10)
  }

  useEffect(() => {
    ++fetchTokenRef.current
    const tickerChanged = ticker !== prevTickerRef.current
    prevTickerRef.current = ticker

    if (tickerChanged) {
      barsRef.current = []
      setOhlcv([])
    }

    hasMoreRef.current = true
    loadingRef.current = false
    setHasMore(true)
    setTruncated(false)
    setIsLoadingOlder(false)
  }, [ticker, period, interval])

  useEffect(() => {
    if (!chartData) return
    const bars = chartData.ohlcv ?? []
    barsRef.current = bars
    setOhlcv(bars)
    setHasMore(chartData.has_more !== false)
    hasMoreRef.current = chartData.has_more !== false
    setTruncated(chartData.truncated ?? false)
  }, [chartData])

  const loadOlder = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return
    const bars = barsRef.current
    if (bars.length === 0) return

    loadingRef.current = true
    setIsLoadingOlder(true)

    const endBar = bars[0]
    const end = typeof endBar.time === 'number'
      ? new Date(endBar.time * 1000).toISOString().slice(0, 10)
      : String(endBar.time).slice(0, 10)

    const start = computeStart(end)
    const myToken = fetchTokenRef.current

    fetchChartHistory(ticker, start, end, interval)
      .then(data => {
        if (myToken !== fetchTokenRef.current) return
        const olderBars = data.ohlcv ?? []
        if (olderBars.length === 0) {
          hasMoreRef.current = false
          setHasMore(false)
          return
        }

        const timeSet = new Set(bars.map(b => String(b.time)))
        const deduped = olderBars.filter(b => !timeSet.has(String(b.time)))

        if (deduped.length === 0) {
          hasMoreRef.current = false
          setHasMore(false)
          return
        }

        const merged = [...deduped, ...bars].sort((a, b) => {
          const ta = typeof a.time === 'number' ? a.time : new Date(a.time).getTime() / 1000
          const tb = typeof b.time === 'number' ? b.time : new Date(b.time).getTime() / 1000
          return ta - tb
        })

        barsRef.current = merged
        setOhlcv(merged)
        setHasMore(data.has_more !== false)
        hasMoreRef.current = data.has_more !== false
        setTruncated(data.truncated ?? false)
      })
      .catch(() => {
        hasMoreRef.current = false
        setHasMore(false)
      })
      .finally(() => {
        loadingRef.current = false
        setIsLoadingOlder(false)
      })
  }, [ticker, interval])

  return { ohlcv, isLoadingOlder, hasMore, truncated, loadOlder }
}