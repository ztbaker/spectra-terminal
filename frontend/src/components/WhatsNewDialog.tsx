import { useEffect, useState } from 'react'
import C from '../lib/colors'
import { APP_VERSION, findNotesFor } from '../lib/releaseNotes'

const SEEN_KEY = 'spectra_last_seen_version'

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!APP_VERSION || APP_VERSION === '0.0.0') return
    const seen = localStorage.getItem(SEEN_KEY)

    // First ever launch: mark current version seen, no dialog.
    if (!seen) {
      localStorage.setItem(SEEN_KEY, APP_VERSION)
      return
    }

    // Already on this version: no dialog.
    if (seen === APP_VERSION) return

    // Only show if we actually have notes for the new version.
    if (findNotesFor(APP_VERSION)) {
      setOpen(true)
    } else {
      // No notes — just silently update the marker.
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
      background: `${C.surface0}E6`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
    }}>
      <div style={{
        background: C.surface1,
        border: `1px solid ${C.amber}`,
        padding: '28px 36px',
        minWidth: '420px',
        maxWidth: '560px',
        boxShadow: `0 0 30px ${C.amberGlow}`,
        borderRadius: '2px',
      }}>
        <div style={{
          color: C.amber,
          fontSize: '13px',
          fontWeight: 700,
          fontFamily: C.fontDisplay,
          letterSpacing: '0.2em',
          marginBottom: '4px',
        }}>
          WHAT&rsquo;S NEW
        </div>
        <div style={{
          color: C.amberDim,
          fontSize: '10px',
          fontFamily: C.fontDisplay,
          letterSpacing: '0.25em',
          marginBottom: '20px',
        }}>
          SPECTRA TERMINAL &middot; v{notes.version} &middot; {notes.date}
        </div>

        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          color: C.amber,
          fontSize: '12px',
          fontFamily: C.fontBody,
          lineHeight: 1.6,
        }}>
          {notes.highlights.map((h, i) => (
            <li key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <span style={{ color: C.amberDim, flexShrink: 0 }}>&rsaquo;</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={dismiss}
            autoFocus
            style={{
              background: C.amber,
              color: C.surface0,
              border: 'none',
              padding: '7px 20px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: C.fontDisplay,
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
