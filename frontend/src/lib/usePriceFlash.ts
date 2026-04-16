import { useState, useEffect, useRef, useCallback } from 'react'
import C from './colors'

type FlashState = 'none' | 'green' | 'red'

/**
 * Hook that provides a price flash animation for live-updating values.
 * When `triggerFlash` is called with a new value, the background briefly
 * flashes green (price up) or red (price down) for 300ms, then fades back.
 */
export function usePriceFlash(): {
  flashStyle: React.CSSProperties
  triggerFlash: (value: number, prevValue?: number | null) => void
} {
  const [flash, setFlash] = useState<FlashState>('none')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const triggerFlash = useCallback((value: number, prevValue?: number | null) => {
    if (prevValue == null || value === prevValue) return
    clearTimer()
    const next: FlashState = value > prevValue ? 'green' : 'red'
    setFlash(next)
    timerRef.current = setTimeout(() => setFlash('none'), 300)
  }, [clearTimer])

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer])

  const flashStyle: React.CSSProperties = {
    background: flash === 'green' ? C.greenDim : flash === 'red' ? C.redDim : 'transparent',
    transition: 'background 300ms ease-out',
    borderRadius: '2px',
    padding: '0 2px',
  }

  return { flashStyle, triggerFlash }
}