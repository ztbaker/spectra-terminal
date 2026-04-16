import { useEffect, useRef } from 'react'

/**
 * Calls refetchFn on a fixed interval while the component is mounted.
 * The interval is cleared on unmount or when enabled flips to false.
 *
 * @param refetchFn  Function to call on each tick (stable reference preferred)
 * @param intervalMs Milliseconds between calls
 * @param enabled    Set to false to pause polling (default: true)
 */
export function usePolling(
  refetchFn: () => void,
  intervalMs: number,
  enabled = true,
): void {
  // Keep a ref so we always call the latest version of refetchFn without
  // needing to restart the interval whenever the callback identity changes.
  const fnRef = useRef<() => void>(refetchFn)

  useEffect(() => {
    fnRef.current = refetchFn
  }, [refetchFn])

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      fnRef.current()
    }, intervalMs)

    return () => clearInterval(id)
  }, [intervalMs, enabled])
}
