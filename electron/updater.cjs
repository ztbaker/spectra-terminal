'use strict'

const { autoUpdater } = require('electron-updater')
const { shell }       = require('electron')
const log             = require('electron-log')

const IS_MAC = process.platform === 'darwin'

autoUpdater.logger      = log
autoUpdater.logger.transports.file.level = 'info'

// On macOS we can't auto-install without a paid Apple Developer cert
// (Squirrel.Mac rejects unsigned/ad-hoc signed updates).
// So: check for updates but don't download on Mac — just notify the user.
autoUpdater.autoDownload          = !IS_MAC
autoUpdater.autoInstallOnAppQuit  = !IS_MAC

function initAutoUpdater(mainWindow) {
  const send = (channel, payload = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('checking-for-update',  () => send('update:checking'))
  autoUpdater.on('update-not-available', (info) => send('update:none', info))
  autoUpdater.on('error',                (err)  => send('update:error', { message: err?.message || String(err) }))

  if (IS_MAC) {
    // On Mac, when an update is available, tell the renderer immediately
    // with kind 'ready-external' so it shows a "Download" button instead
    // of trying Squirrel install.
    autoUpdater.on('update-available', (info) => {
      send('update:available-external', {
        version: info.version,
        url: `https://github.com/ztbaker/spectra-terminal/releases/tag/v${info.version}`,
      })
    })
  } else {
    // Windows: full auto-download + install flow
    autoUpdater.on('update-available',  (info) => send('update:available',  info))
    autoUpdater.on('download-progress', (p)    => send('update:progress',   p))
    autoUpdater.on('update-downloaded', (info) => send('update:downloaded', info))
  }

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function installUpdateAndRestart() {
  if (IS_MAC) return  // should not be called on Mac
  autoUpdater.quitAndInstall(false, true)
}

function openExternalUrl(urlStr) {
  shell.openExternal(urlStr).catch(() => {})
}

module.exports = { initAutoUpdater, installUpdateAndRestart, openExternalUrl }
