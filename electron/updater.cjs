'use strict'

const { autoUpdater } = require('electron-updater')
const { shell }       = require('electron')
const log             = require('electron-log')

autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

// Allow auto-download and install on all platforms.
// Since the app is distributed unsigned (no Apple Developer cert),
// we skip signature verification so macOS updates work seamlessly
// via the zip target. Safe for a public repo distributed to friends.
process.env.UPDATER_SKIP_SIGNATURE_VALIDATION = '1'

autoUpdater.autoDownload         = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.disableWebInstaller  = true
autoUpdater.allowPrerelease      = false

function initAutoUpdater(mainWindow) {
  const send = (channel, payload = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('checking-for-update', () => send('update:checking'))
  autoUpdater.on('update-available',    (info) => send('update:available', info))
  autoUpdater.on('update-not-available', (info) => send('update:none', info))
  autoUpdater.on('download-progress',   (p) => send('update:progress', p))
  autoUpdater.on('update-downloaded',   (info) => send('update:downloaded', info))
  autoUpdater.on('error',               (err) => send('update:error', { message: err?.message || String(err) }))

  // Check 10s after launch, then every 30 minutes
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000)
}

function installUpdateAndRestart() {
  autoUpdater.quitAndInstall(false, true)
}

function openExternalUrl(urlStr) {
  shell.openExternal(urlStr).catch(() => {})
}

module.exports = { initAutoUpdater, installUpdateAndRestart, openExternalUrl }
