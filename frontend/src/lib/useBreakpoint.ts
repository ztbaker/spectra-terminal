import { useState, useEffect } from 'react'

export type Breakpoint = 'compact' | 'standard' | 'expanded'

/**
 * Returns the current responsive breakpoint.
 * compact:  < 1440
 * standard: 1440 - 1919
 * expanded: >= 1920
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth))

  useEffect(() => {
    const handler = () => setBp(getBreakpoint(window.innerWidth))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return bp
}

function getBreakpoint(width: number): Breakpoint {
  if (width >= 1920) return 'expanded'
  if (width >= 1440) return 'standard'
  return 'compact'
}