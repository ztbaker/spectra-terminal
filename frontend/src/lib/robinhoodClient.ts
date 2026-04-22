/**
 * Client-side Robinhood API client.
 *
 * Runs from the Electron renderer process — requests go directly from the
 * user's machine to api.robinhood.com, bypassing Fly.io IP blocks.
 * Electron's main process injects CORS headers for these requests.
 */

const RH_BASE = 'https://api.robinhood.com'
const RH_CLIENT_ID = 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS'
const RH_API_VERSION = '1.431.4'

// Headers Robinhood expects on all requests
function baseHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Robinhood-API-Version': RH_API_VERSION,
    'Origin': 'https://robinhood.com',
    'Referer': 'https://robinhood.com/',
  }
}

// Module-level auth state
let _accessToken: string | null = null
let _accountNumber: string | null = null

function generateDeviceToken(): string {
  return crypto.randomUUID()
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    ...baseHeaders(),
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (_accessToken) {
    h['Authorization'] = `Bearer ${_accessToken}`
  }
  return h
}

function jsonHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    ...baseHeaders(),
    'Content-Type': 'application/json',
  }
  if (_accessToken) {
    h['Authorization'] = `Bearer ${_accessToken}`
  }
  return h
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export interface RhLoginResult {
  status: 'ok' | 'mfa_required' | 'challenge' | 'error'
  message?: string
  mfa_type?: string
  challenge_type?: string
}

let _pendingDeviceToken: string | null = null
let _pendingPayload: URLSearchParams | null = null

export async function rhLogin(
  username: string,
  password: string,
  mfaCode?: string,
): Promise<RhLoginResult> {
  const deviceToken = _pendingDeviceToken || generateDeviceToken()
  _pendingDeviceToken = deviceToken

  const payload = new URLSearchParams({
    client_id: RH_CLIENT_ID,
    expires_in: '86400',
    grant_type: 'password',
    password,
    scope: 'internal',
    username,
    challenge_type: 'sms',
    device_token: deviceToken,
    try_passkeys: 'false',
    token_request_path: '/login',
    create_read_only_secondary_token: 'true',
  })

  if (mfaCode) {
    payload.set('mfa_code', mfaCode)
  }

  _pendingPayload = payload

  try {
    const res = await fetch(`${RH_BASE}/oauth2/token/`, {
      method: 'POST',
      headers: { ...baseHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    })

    const data = await res.json()

    // Direct success
    if (data.access_token) {
      _accessToken = data.access_token
      _pendingDeviceToken = null
      _pendingPayload = null
      await _loadAccountNumber()
      return { status: 'ok', message: 'Connected to Robinhood' }
    }

    // MFA required
    if (data.mfa_required) {
      return {
        status: 'mfa_required',
        mfa_type: data.mfa_type || 'app',
        message: 'Enter your authenticator code',
      }
    }

    // Verification workflow (push/sms/email)
    if (data.verification_workflow) {
      const workflowId = data.verification_workflow.id
      const result = await _handleVerificationWorkflow(deviceToken, workflowId)

      if (result === 'push_approved') {
        // Retry login after push approval
        const retryRes = await fetch(`${RH_BASE}/oauth2/token/`, {
          method: 'POST',
          headers: { ...baseHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: payload.toString(),
        })
        const retryData = await retryRes.json()
        if (retryData.access_token) {
          _accessToken = retryData.access_token
          _pendingDeviceToken = null
          _pendingPayload = null
          await _loadAccountNumber()
          return { status: 'ok', message: 'Connected to Robinhood' }
        }
        return { status: 'error', message: 'Login failed after push approval' }
      }

      if (result.startsWith('challenge:')) {
        return {
          status: 'challenge',
          challenge_type: result.split(':')[1],
          message: `Enter the ${result.split(':')[1]} verification code`,
        }
      }

      return { status: 'error', message: result }
    }

    // Unknown
    return { status: 'error', message: data.detail || JSON.stringify(data) }
  } catch (e: any) {
    return { status: 'error', message: e.message || 'Network error' }
  }
}

// Challenge state for SMS/email
let _pendingChallengeId: string | null = null

async function _handleVerificationWorkflow(
  deviceToken: string,
  workflowId: string,
): Promise<string> {
  try {
    // Start pathfinder flow
    const machineRes = await fetch(`${RH_BASE}/pathfinder/user_machine/`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        device_id: deviceToken,
        flow: 'suv',
        input: { workflow_id: workflowId },
      }),
    })
    const machineData = await machineRes.json()
    const machineId = machineData?.id

    if (!machineId) return 'Could not start verification'

    const inquiriesUrl = `${RH_BASE}/pathfinder/inquiries/${machineId}/user_view/`

    // Poll for challenge
    const start = Date.now()
    while (Date.now() - start < 30000) {
      await new Promise(r => setTimeout(r, 3000))

      const inqRes = await fetch(inquiriesUrl, { headers: authHeaders() })
      if (!inqRes.ok) continue
      const inqData = await inqRes.json()

      const challenge = inqData?.context?.sheriff_challenge
      if (!challenge) continue

      const { type, id, status } = challenge

      if (type === 'prompt') {
        // Push notification — poll until approved
        const promptUrl = `${RH_BASE}/push/${id}/get_prompts_status/`
        const pollStart = Date.now()
        while (Date.now() - pollStart < 90000) {
          await new Promise(r => setTimeout(r, 5000))
          const pRes = await fetch(promptUrl, { headers: authHeaders() })
          if (!pRes.ok) continue
          const pData = await pRes.json()
          if (pData?.challenge_status === 'validated') {
            return 'push_approved'
          }
        }
        return 'Push approval timed out — approve in your Robinhood app'
      }

      if ((type === 'sms' || type === 'email') && status === 'issued') {
        _pendingChallengeId = id
        return `challenge:${type}`
      }

      if (status === 'validated') {
        return 'push_approved'
      }
    }

    return 'Verification timed out'
  } catch (e: any) {
    return e.message || 'Verification error'
  }
}

export async function rhSubmitChallenge(code: string): Promise<RhLoginResult> {
  if (!_pendingChallengeId || !_pendingPayload) {
    return { status: 'error', message: 'No pending challenge' }
  }

  try {
    // Submit the code
    const challengeRes = await fetch(`${RH_BASE}/challenge/${_pendingChallengeId}/respond/`, {
      method: 'POST',
      headers: { ...baseHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ response: code }).toString(),
    })
    const challengeData = await challengeRes.json()

    if (challengeData?.status !== 'validated') {
      return { status: 'error', message: 'Invalid code' }
    }

    // Retry login
    const res = await fetch(`${RH_BASE}/oauth2/token/`, {
      method: 'POST',
      headers: { ...baseHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: _pendingPayload.toString(),
    })
    const data = await res.json()

    if (data.access_token) {
      _accessToken = data.access_token
      _pendingDeviceToken = null
      _pendingPayload = null
      _pendingChallengeId = null
      await _loadAccountNumber()
      return { status: 'ok', message: 'Connected to Robinhood' }
    }

    return { status: 'error', message: 'Login failed after verification' }
  } catch (e: any) {
    return { status: 'error', message: e.message || 'Verification error' }
  }
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

async function _loadAccountNumber(): Promise<void> {
  try {
    const res = await fetch(`${RH_BASE}/accounts/`, {
      headers: authHeaders(),
    })
    const data = await res.json()
    const results = data?.results || data
    if (Array.isArray(results) && results.length > 0) {
      _accountNumber = results[0].account_number
    }
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

export interface RhHolding {
  ticker: string
  shares: number
  avg_cost: number
  current_price: number
  equity: number
  pct_change: number
}

// Cache instrument URL → ticker to avoid repeated lookups
const _instrumentCache: Record<string, string> = {}

async function _getTickerFromInstrument(instrumentUrl: string): Promise<string> {
  if (_instrumentCache[instrumentUrl]) return _instrumentCache[instrumentUrl]
  try {
    const res = await fetch(instrumentUrl, { headers: authHeaders() })
    const data = await res.json()
    const symbol = data?.symbol || '???'
    _instrumentCache[instrumentUrl] = symbol
    return symbol
  } catch {
    return '???'
  }
}

export async function rhFetchHoldings(): Promise<RhHolding[]> {
  if (!_accessToken) throw new Error('Not connected to Robinhood')

  const res = await fetch(`${RH_BASE}/positions/?nonzero=true`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Positions request failed: ${res.status}`)

  const data = await res.json()
  const positions = data?.results || []

  // Resolve tickers in parallel
  const holdings: RhHolding[] = []
  const tickerPromises = positions.map((p: any) => _getTickerFromInstrument(p.instrument))
  const tickers = await Promise.all(tickerPromises)

  // Get current prices
  const tickerList = tickers.filter((t: string) => t !== '???')
  let quotes: Record<string, number> = {}
  if (tickerList.length > 0) {
    try {
      const qRes = await fetch(
        `${RH_BASE}/marketdata/quotes/?symbols=${tickerList.join(',')}`,
        { headers: authHeaders() },
      )
      const qData = await qRes.json()
      for (const q of qData?.results || []) {
        if (q?.symbol && q?.last_trade_price) {
          quotes[q.symbol] = parseFloat(q.last_trade_price)
        }
      }
    } catch {
      // non-fatal — prices will be 0
    }
  }

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const ticker = tickers[i]
    const shares = parseFloat(p.quantity || '0')
    const avgCost = parseFloat(p.average_buy_price || '0')
    if (shares <= 0) continue

    const price = quotes[ticker] || 0
    const equity = shares * price
    const costBasis = shares * avgCost
    const pctChange = costBasis > 0 ? ((equity - costBasis) / costBasis) * 100 : 0

    holdings.push({
      ticker,
      shares,
      avg_cost: Math.round(avgCost * 100) / 100,
      current_price: Math.round(price * 100) / 100,
      equity: Math.round(equity * 100) / 100,
      pct_change: Math.round(pctChange * 100) / 100,
    })
  }

  return holdings
}

// ---------------------------------------------------------------------------
// Portfolio History
// ---------------------------------------------------------------------------

export interface RhEquityPoint {
  date: string
  equity: number
}

export async function rhFetchHistory(
  span: string = 'year',
): Promise<{ points: RhEquityPoint[]; currentEquity: number | null }> {
  if (!_accessToken) throw new Error('Not connected to Robinhood')
  if (!_accountNumber) await _loadAccountNumber()
  if (!_accountNumber) throw new Error('Could not determine account number')

  const intervalMap: Record<string, [string, string]> = {
    day: ['5minute', 'day'],
    week: ['10minute', 'week'],
    month: ['day', 'month'],
    '3month': ['day', '3month'],
    year: ['day', 'year'],
    '5year': ['week', '5year'],
    all: ['week', 'all'],
  }

  const [interval, rhSpan] = intervalMap[span] || ['day', 'year']

  const res = await fetch(
    `${RH_BASE}/portfolios/historicals/${_accountNumber}/?bounds=regular&interval=${interval}&span=${rhSpan}`,
    { headers: authHeaders() },
  )
  if (!res.ok) throw new Error(`History request failed: ${res.status}`)

  const data = await res.json()
  const equityHistoricals = data?.equity_historicals || []

  const points: RhEquityPoint[] = []
  for (const p of equityHistoricals) {
    const eq = parseFloat(p.adjusted_close_equity || p.close_equity || '0')
    const dt = p.begins_at || ''
    if (eq > 0 && dt) {
      points.push({
        date: dt.substring(0, 10),
        equity: Math.round(eq * 100) / 100,
      })
    }
  }

  const currentEquity = points.length > 0 ? points[points.length - 1].equity : null

  return { points, currentEquity }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function rhIsConnected(): boolean {
  return _accessToken !== null
}

export function rhLogout(): void {
  _accessToken = null
  _accountNumber = null
  _pendingDeviceToken = null
  _pendingPayload = null
  _pendingChallengeId = null
}
