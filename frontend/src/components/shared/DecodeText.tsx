import React, { useEffect, useState, useRef } from 'react'

interface Props {
  text: string
  duration?: number
  className?: string
  style?: React.CSSProperties
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789◇△▢'

const DecodeText: React.FC<Props> = ({ text, duration = 320, className, style }) => {
  const [display, setDisplay] = useState(text)
  const rafRef = useRef<number | null>(null)
  const lastTextRef = useRef(text)

  useEffect(() => {
    if (lastTextRef.current === text) return
    lastTextRef.current = text

    const start = performance.now()
    const finalChars = text.split('')

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const out = finalChars.map((ch, i) => {
        const progress = t * finalChars.length - i * 0.6
        if (ch === ' ' || ch === '·' || ch === '·') return ch
        if (progress >= 1) return ch
        if (progress <= 0) return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
      })
      setDisplay(out.join(''))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(text)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [text, duration])

  return <span className={className} style={style}>{display}</span>
}

export default DecodeText
