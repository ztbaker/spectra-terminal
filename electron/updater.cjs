'use strict'

const { autoUpdater } = require('electron-updater')
const log             = require('electron-log')

autoUpdater.logger      = log
autoUpdater.logger.transports.file.level = 'info'
autoUpdater.autoDownload          = true
autoUpdater.autoInstallOnAppQuit  = true

function initAutoUpdater(mainWindow) {
  const send = (channel, payload = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('checking-for-update',  () => send('update:checking'))
  autoUpdater.on('update-available',     (info) => send('update:available',   info))
  autoUpdater.on('update-not-available', (info) => send('update:none',        info))
  autoUpdater.on('download-progress',    (p)    => send('update:progress',    p))
  autoUpdater.on('update-downloaded',    (info) => send('update:downloaded',  info))
  autoUpdater.on('error',                (err)  => send('update:error', { message: err?.message || String(err) }))

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function installUpdateAndRestart() {
  autoUpdater.quitAndInstall(false, true)
}

module.exports = { initAutoUpdater, installUpdateAndRestart }
