import { useEffect, useState, type CSSProperties } from 'react'
import { useUpdater } from '../lib/updater'

const AMBER = '#ff9900'
const AMBER_DIM = '#cc7a00'
const GREEN = '#00ff41'
const RED = '#ff3333'
const BG = '#000000'

export function UpdateToast() {
  const { state, installAndRestart } = useUpdater()
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  // A new 'ready' version re-opens the toast even if the user dismissed a prior one.
  useEffect(() => {
    if (state.kind !== 'ready' && state.kind !== 'error') {
      setDismissedVersion(null)
    }
  }, [state.kind])

  if (state.kind === 'idle' || state.kind === 'checking') return null

  const readyDismissed =
    state.kind === 'ready' && dismissedVersion === state.version
  if (readyDismissed) return null

  const base: CSSProperties = {
    position: 'fixed',
    right: 16,
    bottom: 46,
    background: BG,
    border: `1px solid ${AMBER}`,
    padding: '10px 14px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: AMBER,
    zIndex: 9999,
    minWidth: 260,
    boxShadow: `0 0 18px ${AMBER}22`,
  }

  if (state.kind === 'available') {
    return <div style={base}>UPDATE v{state.version} DOWNLOADING…</div>
  }
  if (state.kind === 'progress') {
    return <div style={base}>DOWNLOAD {state.percent}%</div>
  }
  if (state.kind === 'ready') {
    return (
      <div style={{ ...base, paddingRight: 32, position: 'fixed' }}>
        <button
          onClick={() => setDismissedVersion(state.version)}
          title="Dismiss (button stays in status bar)"
          aria-label="Dismiss update notification"
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            background: 'transparent',
            border: 'none',
            color: AMBER_DIM,
            fontFamily: 'inherit',
            fontSize: 12,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 2,
          }}
        >
          ×
        </button>
        <div style={{ color: GREEN, marginBottom: 6 }}>
          UPDATE v{state.version} READY
        </div>
        <button
          onClick={installAndRestart}
          style={{
            background: 'transparent',
            color: AMBER,
            border: `1px solid ${AMBER}`,
            padding: '4px 10px',
            fontFamily: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          RESTART NOW
        </button>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div style={{ ...base, borderColor: RED, color: RED }}>
        UPDATE ERR: {state.message}
      </div>
    )
  }
  return null
}
