export interface ReleaseNote {
  version: string
  date: string
  highlights: string[]
}

// Ordered newest → oldest. Only versions listed here will trigger the
// "What's New" dialog on first launch after update.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.1.8',
    date: '2026-04-21',
    highlights: [
      'Price summary is now a collapsible dropdown — click to expand/collapse so it no longer covers the chart y-axis labels.',
    ],
  },
  {
    version: '1.1.7',
    date: '2026-04-21',
    highlights: [
      'Chat cashtags: type $AAPL in a message and it renders as an amber clickable link that opens the ticker menu for that security.',
    ],
  },
  {
    version: '1.1.6',
    date: '2026-04-21',
    highlights: [
      'Typing a bare ticker (e.g. "AAPL") now opens a Bloomberg-style function menu instead of jumping straight to equity. Select GP, OPT, FA, NEWS, FILINGS, HS, QUANT, and more from the menu or type the function in the command bar.',
    ],
  },
  {
    version: '1.1.5',
    date: '2026-04-21',
    highlights: [
      'Fixed BOND and ETF screens returning blank data — API auth header was missing from requests.',
    ],
  },
  {
    version: '1.1.4',
    date: '2026-04-21',
    highlights: [
      'HS screen rebuilt to match Bloomberg: dual overlaid price chart, spread histogram, full summary stats (mean, median, StDev, percentile, high/low with dates), and distribution histogram.',
      'Type "NVDA HS" to compare NVDA against any second ticker — a dialog prompts for the comparison security.',
      'Price/Percent normalize toggle and expanded period selectors (1M, 6M, YTD, 1Y, 2Y, 5Y, MAX).',
      'Custom ticker inputs always visible in the header bar for quick changes.',
    ],
  },
  {
    version: '1.1.3',
    date: '2026-04-21',
    highlights: [
      'MEME, FX, and MACRO screens now use a clean table layout matching WEI instead of cards.',
      'Command bar cursor no longer blinks when typing in chat or other inputs.',
      'Bug reports close immediately on send and show a confirmation toast.',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-04-21',
    highlights: [
      'News sharing: shared articles now appear as clickable headline cards instead of raw URLs.',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-04-21',
    highlights: [
      'Chat: reply now works correctly — your reply text appears below the quoted message instead of merging into the quote.',
      'Chat: composer supports multi-line input (Shift+Enter for newline, Enter to send).',
      'Fixed macOS auto-updater crash when replacing the app bundle.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-21',
    highlights: [
      'Chat: messages stay in the chat composer after sending — no more jumping back to the command bar.',
      'Chat: reply to any message with a hover REPLY button; replies show as quoted blocks.',
      'Chat: online/offline presence indicators next to usernames in the sidebar and messages.',
      'Chat: clickable URLs in messages open in the built-in reader.',
      'Chat: switching threads now stays in the same pane instead of opening a new one.',
      'Bug reports now auto-close after successful submission.',
      'Filings: browse 10-Q, 8-K, DEF 14A, and more — not just 10-K.',
      'Quant: new multi-period returns table (1M, 3M, 6M, YTD, 1Y, 3Y).',
      'New MEME command: real-time meme coin tracker with prices and 24h changes.',
      'New user profile cards — type PROF or PROF @username.',
    ],
  },
  {
    version: '0.1.13',
    date: '2026-04-17',
    highlights: [
      'WEI now shows the full S&P 500 (503 tickers) and NASDAQ-100 — first 50 load instantly, press "LOAD MORE" for the next batch.',
      'Header shows "50 OF 503 CONSTITUENTS" so you always know how many are loaded vs. total.',
    ],
  },
  {
    version: '0.1.12',
    date: '2026-04-16',
    highlights: [
      'macOS updates now show a "DOWNLOAD" button that opens the GitHub releases page instead of failing with a code-signature error.',
      'Windows auto-update still installs silently as before.',
    ],
  },
  {
    version: '0.1.11',
    date: '2026-04-16',
    highlights: [
      'Chat notifications: a toast pops up when you receive a new message in a joined room or DM, even while on another screen.',
      'Click the notification to jump straight into the conversation.',
    ],
  },
  {
    version: '0.1.10',
    date: '2026-04-16',
    highlights: [
      'One-time re-install required: download the v0.1.10 DMG from GitHub and replace the app in /Applications.',
      'After this install, future updates will apply silently on restart without the code-signature error.',
    ],
  },
  {
    version: '0.1.9',
    date: '2026-04-16',
    highlights: [
      'Fixed auto-update on macOS: the updater now has the ZIP archive it needs to install new versions in the background.',
      'After this update lands, future releases will install silently on app restart as intended.',
    ],
  },
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
