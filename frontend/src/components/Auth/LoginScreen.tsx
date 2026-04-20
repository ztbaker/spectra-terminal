import { useState, type FormEvent } from 'react'
import theme from '../../lib/theme'
import { useAuth, errorMessage } from '../../lib/auth'
import { authForgotPassword } from '../../lib/api'
import SpectraLogo from '../shared/SpectraLogo'

const { color, font, radius } = theme

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
    ? mode === 'login' ? 'SIGNING IN\u2026' : 'CREATING\u2026'
    : mode === 'login' ? '[ SIGN IN ]' : '[ CREATE ACCOUNT ]'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: color.bgBase,
        fontFamily: font.sans,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glows */}
      <div style={{
        position: 'absolute',
        top: '-100px',
        left: '20%',
        width: '500px',
        height: '400px',
        background: 'radial-gradient(ellipse at center, rgba(30, 79, 255, 0.10) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-80px',
        right: '15%',
        width: '500px',
        height: '400px',
        background: 'radial-gradient(ellipse at center, rgba(0, 217, 224, 0.08) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />
      <div style={{ marginBottom: '16px' }}>
        <SpectraLogo size={72} />
      </div>
      <div
        style={{
          fontFamily: font.sans,
          fontSize: '28px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          marginBottom: '6px',
          background: 'linear-gradient(135deg, #1E4FFF 0%, #22B7FF 40%, #6AF1B4 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        SPECTRA TERMINAL
      </div>
      <div
        style={{
          color: color.textSecondary,
          fontSize: '11px',
          letterSpacing: '0.3em',
          marginBottom: '36px',
        }}
      >
        MARKET DATA &middot; ALL SOURCES &middot; FREE TIER
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          background: 'rgba(19, 22, 25, 0.85)',
          backdropFilter: 'blur(40px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          borderRadius: radius.md,
          padding: '24px 28px',
          width: '360px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 217, 100, 0.03)',
        }}
      >
        {/* Tab row */}
        <div
          style={{
            display: 'flex',
            marginBottom: '22px',
            borderBottom: `1px solid ${color.borderSubtle}`,
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
                  borderBottom: active ? `2px solid ${color.accentPositive}` : '2px solid transparent',
                  color: active ? color.textPrimary : color.textTertiary,
                  fontFamily: font.sans,
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
              color: color.textTertiary,
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
                color: color.textSecondary,
                fontFamily: font.sans,
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
              color: color.accentNegative,
              fontSize: '11px',
              marginBottom: '14px',
              letterSpacing: '0.05em',
              border: `1px solid ${color.accentNegativeDim}`,
              padding: '6px 8px',
              borderRadius: radius.sm,
              background: color.accentNegativeDim,
            }}
          >
            ERROR: {error.toUpperCase()}
          </div>
        )}

        {info && (
          <div
            style={{
              color: color.textPrimary,
              fontSize: '11px',
              marginBottom: '14px',
              letterSpacing: '0.05em',
              border: `1px solid ${color.borderSubtle}`,
              padding: '6px 8px',
              borderRadius: radius.sm,
              background: color.bgSurface,
            }}
          >
            {info}
          </div>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '9px 0',
            fontSize: '12px',
            letterSpacing: '0.2em',
            fontWeight: 700,
            fontFamily: font.sans,
            background: color.accentPositive,
            color: color.textInverse,
            border: 'none',
            borderRadius: radius.sm,
            cursor: 'pointer',
            opacity: submitting ? 0.7 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {submitLabel}
        </button>
      </form>

      <div
        style={{
          marginTop: '24px',
          color: color.textTertiary,
          fontSize: '10px',
          letterSpacing: '0.2em',
        }}
      >
        YOUR WATCHLIST &middot; YOUR PORTFOLIO &middot; PRIVATE
      </div>

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
        background: `${color.bgBase}E6`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: 'rgba(19, 22, 25, 0.85)',
          backdropFilter: 'blur(40px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.3)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          borderRadius: radius.md,
          padding: '26px 32px',
          width: '360px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div
          style={{
            color: color.textPrimary,
            fontSize: '13px',
            fontWeight: 700,
            fontFamily: font.sans,
            letterSpacing: '0.2em',
            marginBottom: '4px',
          }}
        >
          FORGOT PASSWORD
        </div>
        <div
          style={{
            color: color.textSecondary,
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
              color: color.accentNegative,
              fontSize: '11px',
              marginBottom: '14px',
              border: `1px solid ${color.accentNegativeDim}`,
              padding: '6px 8px',
              borderRadius: radius.sm,
              background: color.accentNegativeDim,
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
              color: color.textSecondary,
              border: `1px solid ${color.borderMedium}`,
              borderRadius: radius.sm,
              padding: '7px 16px',
              fontSize: '11px',
              fontFamily: font.sans,
              letterSpacing: '0.15em',
              cursor: 'pointer',
            }}
          >
            CANCEL
          </button>
          <button
            type="submit"
            style={{
              background: color.accentPositive,
              color: color.textInverse,
              border: 'none',
              borderRadius: radius.sm,
              padding: '7px 18px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: font.sans,
              letterSpacing: '0.15em',
              cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
              transition: 'opacity 0.15s ease',
            }}
          >
            {busy ? 'SENDING\u2026' : 'SEND LINK'}
          </button>
        </div>
      </form>
    </div>
  )
}