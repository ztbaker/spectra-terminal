import { useEffect, useState } from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

const AMBER = '#ff9900'
const GREEN = '#00ff41'
const RED   = '#ff3333'
const BG    = '#000000'

export function UpdateToast() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  useEffect(() => {
    const updater = (window as any).spectraUpdater
    if (!updater) return

    updater.onAvailable((info: { version: string }) =>
      setState({ kind: 'available', version: info.version }),
    )
    updater.onProgress((p: { percent: number }) =>
      setState({ kind: 'progress', percent: Math.round(p.percent) }),
    )
    updater.onDownloaded((info: { version: string }) =>
      setState({ kind: 'ready', version: info.version }),
    )
    updater.onError((e: { message: string }) =>
      setState({ kind: 'error', message: e.message }),
    )
  }, [])

  if (state.kind === 'idle') return null

  const base: React.CSSProperties = {
    position: 'fixed',
    right: 16,
    bottom: 16,
    background: BG,
    border: `1px solid ${AMBER}`,
    padding: '10px 14px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: AMBER,
    zIndex: 9999,
    minWidth: 260,
  }

  if (state.kind === 'available') {
    return <div style={base}>UPDATE v{state.version} DOWNLOADING…</div>
  }
  if (state.kind === 'progress') {
    return <div style={base}>DOWNLOAD {state.percent}%</div>
  }
  if (state.kind === 'ready') {
    return (
      <div style={base}>
        <div style={{ color: GREEN, marginBottom: 6 }}>
          UPDATE v{state.version} READY
        </div>
        <button
          onClick={() => (window as any).spectraUpdater?.installAndRestart()}
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
    return <div style={{ ...base, borderColor: RED, color: RED }}>UPDATE ERR: {state.message}</div>
  }
  return null
}
