export interface ReleaseNote {
  version: string
  date: string
  highlights: string[]
}

// Ordered newest → oldest. Only versions listed here will trigger the
// "What's New" dialog on first launch after update.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.8',
    date: '2026-04-16',
    highlights: [
      'New CHAT screen: join public rooms or send private DMs to any Spectra user.',
      'Type \u201cCHAT\u201d to open the directory, \u201cCHAT #slug\u201d to jump into a room, or \u201cCHAT @username\u201d to start a direct message.',
    ],
  },
  {
    version: '0.1.7',
    date: '2026-04-16',
    highlights: [
      'Added a persistent "UPDATE · RESTART" button in the status bar whenever an update finishes downloading — restart whenever you\u2019re ready.',
      'The pop-up update toast can now be dismissed; the status-bar button stays until you restart.',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-04-16',
    highlights: [
      'Sign up now requires an email. A verification link is sent to you automatically.',
      'Added "Forgot password?" on the sign-in screen — we\u2019ll email you a secure reset link.',
      'Your sign-in is still just username + password; email is only for recovery and verification.',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-04-16',
    highlights: [
      'Fixed the login form: Sign In / Sign Up buttons now always respond, and validation errors appear inline instead of the button going silent.',
      'Redesigned the mode toggle as a clear tab row so it\u2019s no longer mistaken for the submit button.',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-04-16',
    highlights: [
      'New "What\u2019s New" summary on startup after every update.',
    ],
  },
  {
    version: '0.1.3',
    date: '2026-04-16',
    highlights: [
      'Updates now install silently the next time you close the app — no more "install now" clicks.',
    ],
  },
  {
    version: '0.1.2',
    date: '2026-04-16',
    highlights: [
      'Accounts are here: sign up once, then sign in on any machine.',
      'Your watchlist and portfolio are now private to your account.',
      'Data persists across app restarts and server updates.',
    ],
  },
]

export const APP_VERSION_RAW = import.meta.env.VITE_APP_VERSION || '0.0.0'
export const APP_VERSION = APP_VERSION_RAW.replace(/^v/, '')

export function findNotesFor(version: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find(n => n.version === version)
}
