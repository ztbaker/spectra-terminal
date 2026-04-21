import { useEffect, useState } from 'react'
import { submitBugReport } from '../lib/bugReport'

const AMBER = '#ff9900'
const GREEN = '#00ff41'
const RED   = '#ff3333'
const BG    = '#000000'

interface Props {
  open: boolean
  onClose: () => void
  onFiled?: (issueNumber: number) => void
  currentScreen?: string
  lastError?: string
}

export function BugReportDialog({ open, onClose, onFiled, currentScreen, lastError }: Props) {
  const [summary, setSummary]         = useState('')
  const [description, setDescription] = useState('')
  const [reporter, setReporter]       = useState(() => localStorage.getItem('spectra.reporter') || '')
  const [status, setStatus]           = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [message, setMessage]         = useState('')

  useEffect(() => {
    if (open) {
      setStatus('idle')
      setMessage('')
      setSummary('')
      setDescription('')
    }
  }, [open])

  if (!open) return null

  const canSubmit = summary.trim().length >= 3 && description.trim().length >= 1 && status !== 'sending'

  async function send() {
    setStatus('sending')
    try {
      localStorage.setItem('spectra.reporter', reporter)
      const res = await submitBugReport({
        summary,
        description,
        reporter,
        screen: currentScreen,
        lastError,
      })
      setStatus('ok')
      onClose()
      onFiled?.(res.issue_number)
    } catch (e: any) {
      setStatus('err')
      setMessage(e?.message || 'Failed to send')
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  }
  const box: React.CSSProperties = {
    background: BG, border: `1px solid ${AMBER}`,
    padding: 20, minWidth: 480, maxWidth: 640,
    color: AMBER, fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
  }
  const input: React.CSSProperties = {
    width: '100%', background: BG, color: AMBER,
    border: `1px solid ${AMBER}`, padding: 6,
    fontFamily: 'inherit', fontSize: 12, marginTop: 4,
  }
  const btn = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent', color: disabled ? '#554400' : AMBER,
    border: `1px solid ${disabled ? '#554400' : AMBER}`, padding: '6px 14px',
    fontFamily: 'inherit', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
  })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 13, marginBottom: 12, letterSpacing: '0.08em' }}>
          ■ REPORT BUG
        </div>

        <label>REPORTER (your name):
          <input style={input} value={reporter} onChange={e => setReporter(e.target.value)} />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>SUMMARY:
          <input style={input} value={summary} onChange={e => setSummary(e.target.value)}
                 placeholder="One line. What went wrong?" />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>DESCRIPTION:
          <textarea
            style={{ ...input, height: 140, resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Steps to reproduce, what you expected, what actually happened."
          />
        </label>

        <div style={{ marginTop: 10, fontSize: 11, color: '#886600' }}>
          CONTEXT ATTACHED: screen={currentScreen || '—'} · error={lastError ? 'yes' : 'no'}
        </div>

        {message && (
          <div style={{
            marginTop: 10, fontSize: 11,
            color: status === 'ok' ? GREEN : status === 'err' ? RED : AMBER,
          }}>
            {message}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn(false)} onClick={onClose}>CLOSE</button>
          <button style={btn(!canSubmit)} disabled={!canSubmit} onClick={send}>
            {status === 'sending' ? 'SENDING…' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  )
}
