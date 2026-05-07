import { useEffect, useRef, useState } from 'react'
import { equityStreamUrl } from '../lib/api'
import { useReportTick } from '../lib/freshness'
import type { LivePriceData } from './useLivePrice'

export function useLiveStream(ticker: string, enabled = true) {
  const [data, setData] = useState<LivePriceData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !ticker) return
    const url = equityStreamUrl(ticker)
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data)
        if (parsed.error) {
          setError(parsed.error)
        } else {
          setData(parsed)
          setError(null)
        }
      } catch (e) {
        setError(String(e))
      }
    }
    es.onerror = () => {
      setError('stream connection error')
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [ticker, enabled])

  useReportTick(data?.as_of)
  return { data, error, isLoading: data === null && error === null }
}