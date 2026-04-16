import { useState, type FormEvent } from 'react'
import C from '../../lib/colors'
import { useAuth, errorMessage } from '../../lib/auth'

type Mode = 'login' | 'signup'

export default function LoginScreen() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = (): string | null => {
    if (username.trim().length < 3) return 'Username must be at least 3 characters'
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
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await signup(username.trim(), password)
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
      {/* Masthead */}
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

      {/* Card */}
      <form
        onSubmit={onSubmit}
        style={{
          background: C.surface1,
          border: `1px solid ${C.amberMute}`,
          padding: '24px 28px',
          width: '340px',
          boxShadow: `0 0 28px ${C.amberGlow}`,
        }}
      >
        {/* Mode toggle — clearly a tab row */}
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

        {/* Username */}
        <label
          className="bb-label"
          style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}
        >
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

        {/* Password */}
        <label
          className="bb-label"
          style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}
        >
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
            fontSize: '10px',
            color: C.amberMute,
            marginBottom: '20px',
            letterSpacing: '0.05em',
          }}
        >
          {mode === 'signup'
            ? 'At least 6 characters. No recovery — remember it.'
            : '\u00A0'}
        </div>

        {/* Error */}
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

        {/* Submit — always enabled; validation happens on submit */}
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

      {/* Footer */}
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

      {/* CRT fx */}
      <div className="bb-scanlines" />
      <div className="bb-vignette" />
    </div>
  )
}
