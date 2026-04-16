import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import axios from 'axios'
import {
  AUTH_INVALIDATED_EVENT,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  authLogin,
  authLogout,
  authMe,
  authSignup,
  type UserInfo,
} from './api'

interface AuthState {
  user: UserInfo | null
  status: 'loading' | 'anonymous' | 'authenticated'
  login: (username: string, password: string) => Promise<void>
  signup: (username: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

function readStoredUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.user_id === 'number' && typeof parsed?.username === 'string') {
      return parsed as UserInfo
    }
  } catch { /* ignore */ }
  return null
}

function clearStoredAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

function storeAuth(token: string, user: UserInfo) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => readStoredUser())
  const [status, setStatus] = useState<AuthState['status']>(() => {
    return localStorage.getItem(AUTH_TOKEN_KEY) ? 'loading' : 'anonymous'
  })

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) {
      setStatus('anonymous')
      return
    }
    authMe()
      .then(info => {
        if (cancelled) return
        setUser(info)
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(info))
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearStoredAuth()
        setUser(null)
        setStatus('anonymous')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_INVALIDATED_EVENT, handler)
    return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, handler)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await authLogin(username, password)
    const info: UserInfo = {
      user_id: res.user_id,
      username: res.username,
      email_verified: res.email_verified,
    }
    storeAuth(res.token, info)
    setUser(info)
    setStatus('authenticated')
  }, [])

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const res = await authSignup(username, email, password)
    const info: UserInfo = {
      user_id: res.user_id,
      username: res.username,
      email,
      email_verified: res.email_verified,
    }
    storeAuth(res.token, info)
    setUser(info)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authLogout()
    } catch { /* best effort */ }
    clearStoredAuth()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const info = await authMe()
      setUser(info)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(info))
    } catch { /* ignore */ }
  }, [])

  return (
    <AuthCtx.Provider value={{ user, status, login, signup, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (err.code === 'ERR_NETWORK') return 'Cannot reach server'
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}
