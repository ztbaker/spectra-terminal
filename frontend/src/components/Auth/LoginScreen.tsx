import { useState, type FormEvent } from 'react'
import C from '../../lib/colors'
import { useAuth, errorMessage } from '../../lib/auth'
import { authForgotPassword } from '../../lib/api'

type Mode = 'login' | 'signup'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginScreen() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  const validate = (): string | null => {
    if (username.trim().length < 3) return 'Username must be at least 3 characters'
    if (mode === 'signup' && !EMAIL_RE.test(email.trim())) return 'Enter a valid email address'
    if (password.length < 6) return 'Password must be at least 6 characters'
    return null
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await signup(username.trim(), email.trim().toLowerCase(), password)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const submitLabel = submitting
    ? mode === 'login' ? 'SIGNING IN…' : 'CREATING…'
    : mode === 'login' ? '[ SIGN IN ]' : '[ CREATE ACCOUNT ]'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: C.surface0,
        fontFamily: C.fontBody,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          color: C.amber,
          fontFamily: C.fontDisplay,
          fontSize: '28px',
          fontWeight: 700,
          letterSpacing: '0.25em',
          textShadow: `0 0 12px ${C.amberGlow}`,
          marginBottom: '6px',
        }}
      >
        SPECTRA TERMINAL
      </div>
      <div
        style={{
          color: C.amberDim,
          fontSize: '11px',
          letterSpacing: '0.3em',
          marginBottom: '36px',
        }}
      >
        MARKET DATA · ALL SOURCES · FREE TIER
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          background: C.surface1,
          border: `1px solid ${C.amberMute}`,
          padding: '24px 28px',
          width: '360px',
          boxShadow: `0 0 28px ${C.amberGlow}`,
        }}
      >
        {/* Tab row */}
        <div
          style={{
            display: 'flex',
            marginBottom: '22px',
            borderBottom: `1px solid ${C.amberMute}`,
          }}
        >
          {(['login', 'signup'] as const).map(m => {
            const active = mode === m
            return (
              <button
                type="button"
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `2px solid ${C.amber}` : '2px solid transparent',
                  color: active ? C.amber : C.amberMute,
                  fontFamily: C.fontDisplay,
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: '-1px',
                }}
              >
                {m === 'login' ? 'SIGN IN' : 'SIGN UP'}
              </button>
            )
          })}
        </div>

        <label className="bb-label" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>
          USERNAME
        </label>
        <input
          className="bb-input"
          style={{ width: '100%', fontSize: '13px', marginBottom: '16px' }}
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          maxLength={32}
          spellCheck={false}
          disabled={submitting}
        />

        {mode === 'signup' && (
          <>
            <label className="bb-label" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>
              EMAIL
            </label>
            <input
              type="email"
              className="bb-input"
              style={{ width: '100%', fontSize: '13px', marginBottom: '16px' }}
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={128}
              spellCheck={false}
              disabled={submitting}
            />
          </>
        )}

        <label className="bb-label" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>
          PASSWORD
        </label>
        <input
          type="password"
          className="bb-input"
          style={{ width: '100%', fontSize: '13px', marginBottom: '8px' }}
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          maxLength={256}
          disabled={submitting}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            minHeight: '16px',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              color: C.amberMute,
              letterSpacing: '0.05em',
            }}
          >
            {mode === 'signup' ? 'At least 6 characters.' : '\u00A0'}
          </span>
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setError(null); setInfo(null); setForgotOpen(true) }}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.amberDim,
                fontFamily: C.fontBody,
                fontSize: '10px',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Forgot password?
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              color: C.red,
              fontSize: '11px',
              marginBottom: '14px',
              letterSpacing: '0.05em',
              border: `1px solid ${C.redDim}`,
              padding: '6px 8px',
              background: '#1a0000',
            }}
          >
            ERROR: {error.toUpperCase()}
          </div>
        )}

        {info && (
          <div
            style={{
              color: C.amber,
              fontSize: '11px',
              marginBottom: '14px',
              letterSpacing: '0.05em',
              border: `1px solid ${C.amberMute}`,
              padding: '6px 8px',
              background: C.surface0,
            }}
          >
            {info}
          </div>
        )}

        <button
          type="submit"
          className="bb-btn bb-btn-active"
          style={{
            width: '100%',
            padding: '9px 0',
            fontSize: '12px',
            letterSpacing: '0.2em',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitLabel}
        </button>
      </form>

      <div
        style={{
          marginTop: '24px',
          color: C.amberMute,
          fontSize: '10px',
          letterSpacing: '0.2em',
        }}
      >
        YOUR WATCHLIST &middot; YOUR PORTFOLIO &middot; PRIVATE
      </div>

      <div className="bb-scanlines" />
      <div className="bb-vignette" />

      {forgotOpen && (
        <ForgotPasswordDialog
          onClose={() => setForgotOpen(false)}
          onSent={(msg) => { setForgotOpen(false); setInfo(msg); setError(null) }}
        />
      )}
    </div>
  )
}

function ForgotPasswordDialog({
  onClose,
  onSent,
}: {
  onClose: () => void
  onSent: (msg: string) => void
}) {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!EMAIL_RE.test(email.trim())) {
      setErr('Enter a valid email')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await authForgotPassword(email.trim().toLowerCase())
      onSent('If that email is registered, a reset link is on the way. Check your inbox.')
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: `${C.surface0}E6`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: C.surface1,
          border: `1px solid ${C.amber}`,
          padding: '26px 32px',
          width: '360px',
          boxShadow: `0 0 28px ${C.amberGlow}`,
        }}
      >
        <div
          style={{
            color: C.amber,
            fontSize: '13px',
            fontWeight: 700,
            fontFamily: C.fontDisplay,
            letterSpacing: '0.2em',
            marginBottom: '4px',
          }}
        >
          FORGOT PASSWORD
        </div>
        <div
          style={{
            color: C.amberDim,
            fontSize: '11px',
            marginBottom: '20px',
          }}
        >
          We&rsquo;ll email you a link to set a new password.
        </div>

        <label className="bb-label" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>
          EMAIL
        </label>
        <input
          type="email"
          className="bb-input"
          style={{ width: '100%', fontSize: '13px', marginBottom: '18px' }}
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
          maxLength={128}
          spellCheck={false}
          disabled={busy}
        />

        {err && (
          <div
            style={{
              color: C.red,
              fontSize: '11px',
              marginBottom: '14px',
              border: `1px solid ${C.redDim}`,
              padding: '6px 8px',
              background: '#1a0000',
              letterSpacing: '0.05em',
            }}
          >
            ERROR: {err.toUpperCase()}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent',
              color: C.amberDim,
              border: `1px solid ${C.amberMute}`,
              padding: '7px 16px',
              fontSize: '11px',
              fontFamily: C.fontDisplay,
              letterSpacing: '0.15em',
              cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
          <button
            type="submit"
            style={{
              background: C.amber,
              color: C.surface0,
              border: 'none',
              padding: '7px 18px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: C.fontDisplay,
              letterSpacing: '0.15em',
              cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'SENDING…' : 'SEND LINK'}
          </button>
        </div>
      </form>
    </div>
  )
}
