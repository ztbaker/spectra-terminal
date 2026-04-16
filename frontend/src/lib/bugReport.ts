import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0'

export interface BugReportPayload {
  summary: string
  description: string
  reporter?: string
  screen?: string
  lastError?: string
}

export async function submitBugReport(p: BugReportPayload) {
  const body = {
    summary:     p.summary,
    description: p.description,
    reporter:    p.reporter || localStorage.getItem('spectra.reporter') || 'anonymous',
    app_version: APP_VERSION,
    os:          navigator.platform,
    screen:      p.screen,
    last_error:  p.lastError,
  }
  const { data } = await axios.post(`${API_URL}/bugreport`, body, {
    headers: { 'X-Spectra-Key': API_KEY },
    timeout: 15_000,
  })
  return data as { issue_number: number; issue_url: string }
}
