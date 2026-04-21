'use strict'

const { autoUpdater } = require('electron-updater')
const { app, shell }  = require('electron')
const log             = require('electron-log')
const https           = require('https')
const http            = require('http')
const fs              = require('fs')
const path            = require('path')
const { execSync }    = require('child_process')
const os              = require('os')

autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

const IS_MAC = process.platform === 'darwin'

// On macOS we handle updates ourselves (no code signing cert).
// On other platforms, let electron-updater do its thing.
autoUpdater.autoDownload         = !IS_MAC
autoUpdater.autoInstallOnAppQuit = !IS_MAC
autoUpdater.disableWebInstaller  = true
autoUpdater.allowPrerelease      = false

// ─── Custom macOS updater ──────────────────────────────────────────────────────
// Downloads the zip from GitHub, extracts with ditto, replaces the app bundle,
// and restarts. Bypasses Squirrel's code signature check and browser quarantine.

let macUpdateInProgress = false

function getZipAssetUrl(version) {
  const arch = process.arch === 'arm64' ? 'arm64-' : ''
  return `https://github.com/ztbaker/spectra-terminal/releases/download/v${version}/Spectra-Terminal-${version}-${arch}mac.zip`
}

function followRedirects(urlStr, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'))
    const mod = urlStr.startsWith('https') ? https : http
    mod.get(urlStr, { headers: { 'User-Agent': 'SpectraTerminal' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location, maxRedirects - 1).then(resolve, reject)
      } else if (res.statusCode === 200) {
        resolve(res)
      } else {
        reject(new Error(`HTTP ${res.statusCode}`))
      }
    }).on('error', reject)
  })
}

async function macDownloadAndInstall(version, send) {
  if (macUpdateInProgress) return
  macUpdateInProgress = true

  const zipUrl = getZipAssetUrl(version)
  const tmpDir = path.join(os.tmpdir(), `spectra-update-${version}`)
  const zipPath = path.join(tmpDir, 'update.zip')
  const extractDir = path.join(tmpDir, 'extracted')

  try {
    // Clean up any prior attempt
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })
    fs.mkdirSync(extractDir, { recursive: true })

    // Download zip
    send('update:progress', { percent: 0 })
    const res = await followRedirects(zipUrl)
    const contentLength = parseInt(res.headers['content-length'] || '0', 10)

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath)
      let downloaded = 0
      res.on('data', (chunk) => {
        downloaded += chunk.length
        file.write(chunk)
        if (contentLength > 0) {
          send('update:progress', { percent: Math.round((downloaded / contentLength) * 80) })
        }
      })
      res.on('end', () => { file.end(); resolve() })
      res.on('error', reject)
      file.on('error', reject)
    })

    send('update:progress', { percent: 85 })

    // Extract with ditto (macOS built-in, preserves everything)
    execSync(`ditto -xk "${zipPath}" "${extractDir}"`, { timeout: 30_000 })

    send('update:progress', { percent: 90 })

    // Find the .app bundle in the extracted directory
    const entries = fs.readdirSync(extractDir)
    const appBundle = entries.find(e => e.endsWith('.app'))
    if (!appBundle) throw new Error('No .app found in zip')

    const extractedApp = path.join(extractDir, appBundle)

    // Walk up from app.getAppPath() to find the .app bundle
    let currentApp = app.getAppPath()
    while (currentApp && currentApp !== '/' && !currentApp.endsWith('.app')) {
      currentApp = path.dirname(currentApp)
    }
    if (!currentApp || currentApp === '/' || !currentApp.endsWith('.app')) {
      throw new Error('Not running from .app bundle — cannot self-update')
    }

    send('update:progress', { percent: 95 })

    // Remove quarantine xattr from the extracted app
    try { execSync(`xattr -rd com.apple.quarantine "${extractedApp}"`, { timeout: 5_000 }) } catch {}

    // Ensure the main executable has the execute permission bit
    // (some zip tools strip +x during archive creation)
    try { execSync(`chmod +x "${extractedApp}/Contents/MacOS/"*`, { timeout: 5_000, shell: '/bin/bash' }) } catch {}

    // Replace the current app with the new one
    const backupPath = currentApp + '.bak'
    // Force-remove any leftover backup from a prior update (rm -rf handles
    // macOS edge cases like in-use files better than fs.rmSync)
    try { execSync(`rm -rf "${backupPath}"`, { timeout: 10_000 }) } catch {}
    execSync(`mv "${currentApp}" "${backupPath}"`, { timeout: 10_000 })
    execSync(`ditto "${extractedApp}" "${currentApp}"`, { timeout: 30_000 })

    // Ensure the installed executable has +x (safety net)
    try { execSync(`chmod +x "${currentApp}/Contents/MacOS/"*`, { timeout: 5_000, shell: '/bin/bash' }) } catch {}

    // Clean up backup and temp
    try { execSync(`rm -rf "${backupPath}"`, { timeout: 10_000 }) } catch {}
    try { execSync(`rm -rf "${tmpDir}"`, { timeout: 10_000 }) } catch {}

    send('update:progress', { percent: 100 })
    send('update:downloaded', { version })
  } catch (err) {
    log.error('[mac-updater]', err)
    // Restore backup if the current app was removed but backup exists
    let currentApp = app.getAppPath()
    while (currentApp && currentApp !== '/' && !currentApp.endsWith('.app')) {
      currentApp = path.dirname(currentApp)
    }
    const backupPath = currentApp + '.bak'
    if (fs.existsSync(backupPath) && !fs.existsSync(currentApp)) {
      try { execSync(`mv "${backupPath}" "${currentApp}"`, { timeout: 10_000 }) } catch {}
    }
    send('update:error', { message: `Update failed: ${err.message}` })
  } finally {
    macUpdateInProgress = false
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────

function initAutoUpdater(mainWindow) {
  const send = (channel, payload = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  if (IS_MAC) {
    // macOS: use electron-updater only for version checking, then handle update ourselves
    autoUpdater.on('checking-for-update', () => send('update:checking'))
    autoUpdater.on('update-available', (info) => {
      send('update:available', info)
      macDownloadAndInstall(info.version, send)
    })
    autoUpdater.on('update-not-available', (info) => send('update:none', info))
    autoUpdater.on('error', (err) => {
      // Suppress electron-updater errors on macOS — we handle updates ourselves
      log.info('[mac-updater] electron-updater error (suppressed):', err?.message)
    })
  } else {
    // Windows/Linux: standard electron-updater flow
    autoUpdater.on('checking-for-update', () => send('update:checking'))
    autoUpdater.on('update-available',    (info) => send('update:available', info))
    autoUpdater.on('update-not-available', (info) => send('update:none', info))
    autoUpdater.on('download-progress',   (p) => send('update:progress', p))
    autoUpdater.on('update-downloaded',   (info) => send('update:downloaded', info))
    autoUpdater.on('error',               (err) => send('update:error', { message: err?.message || String(err) }))
  }

  // Check 10s after launch, then every 30 minutes
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000)
}

function installUpdateAndRestart() {
  if (IS_MAC) {
    // On macOS we already replaced the app bundle — just relaunch
    app.relaunch()
    app.exit(0)
  } else {
    autoUpdater.quitAndInstall(false, true)
  }
}

function openExternalUrl(urlStr) {
  shell.openExternal(urlStr).catch(() => {})
}

module.exports = { initAutoUpdater, installUpdateAndRestart, openExternalUrl }
