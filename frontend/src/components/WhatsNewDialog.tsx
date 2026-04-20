import { useEffect, useState } from 'react'
import theme from '../lib/theme'
import { APP_VERSION, findNotesFor } from '../lib/releaseNotes'

const { color, font } = theme

const SEEN_KEY = 'spectra_last_seen_version'

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!APP_VERSION || APP_VERSION === '0.0.0') return
    const seen = localStorage.getItem(SEEN_KEY)

    if (!seen) {
      localStorage.setItem(SEEN_KEY, APP_VERSION)
      return
    }

    if (seen === APP_VERSION) return

    if (findNotesFor(APP_VERSION)) {
      setOpen(true)
    } else {
      localStorage.setItem(SEEN_KEY, APP_VERSION)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') dismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const notes = findNotesFor(APP_VERSION)
  if (!notes) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: `${color.bgBase}DA`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
    }}>
      <div style={{
        background: 'rgba(19, 22, 25, 0.90)',
        backdropFilter: 'blur(40px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
        border: `1px solid ${color.borderMedium}`,
        boxShadow: theme.shadow.md,
        padding: '28px 36px',
        minWidth: '420px',
        maxWidth: '560px',
        borderRadius: '2px',
      }}>
        <div style={{
          color: color.textPrimary,
          fontSize: '13px',
          fontWeight: 700,
          fontFamily: font.sans,
          letterSpacing: '0.2em',
          marginBottom: '4px',
        }}>
          WHAT&rsquo;S NEW
        </div>
        <div style={{
          color: color.textSecondary,
          fontSize: '10px',
          fontFamily: font.sans,
          letterSpacing: '0.25em',
          marginBottom: '20px',
        }}>
          SPECTRA TERMINAL &middot; v{notes.version} &middot; {notes.date}
        </div>

        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          color: color.textPrimary,
          fontSize: '12px',
          fontFamily: font.sans,
          lineHeight: 1.6,
        }}>
          {notes.highlights.map((h, i) => (
            <li key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <span style={{ color: color.textSecondary, flexShrink: 0 }}>&rsaquo;</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={dismiss}
            autoFocus
            style={{
              background: color.accentPositive,
              color: color.textInverse,
              border: 'none',
              padding: '7px 20px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: font.sans,
              cursor: 'pointer',
              letterSpacing: '0.15em',
            }}
          >
            GOT IT
          </button>
        </div>
      </div>
    </div>
  )
}