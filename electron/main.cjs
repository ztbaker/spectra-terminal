'use strict'

const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron')
const { spawn }  = require('child_process')
const path       = require('path')
const http       = require('http')
const fs         = require('fs')
const url        = require('url')
const { initAutoUpdater, installUpdateAndRestart, openExternalUrl } = require('./updater.cjs')

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT        = path.join(__dirname, '..')
const BACKEND_DIR = path.join(ROOT, 'backend')
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist')
const VENV_PYTHON = path.join(BACKEND_DIR, '.venv', 'bin', 'python3')
const BACKEND_URL = 'http://127.0.0.1:8000'
const IS_DEV      = !!process.env.BAKER_DEV

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow      = null
let backendProcess  = null
let staticServer    = null

// ─── Backend lifecycle ─────────────────────────────────────────────────────────

function startBackend() {
  backendProcess = spawn(
    VENV_PYTHON,
    ['-m', 'uvicorn', 'main:app', '--port', '8000', '--host', '127.0.0.1'],
    {
      cwd: BACKEND_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    }
  )

  backendProcess.stdout.on('data', d => process.stdout.write('[api] ' + d))
  backendProcess.stderr.on('data', d => process.stderr.write('[api] ' + d))
  backendProcess.on('exit', code => console.log('[api] process exited:', code))
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
}

// ─── Wait for backend ──────────────────────────────────────────────────────────

function waitForBackend(retries = 40, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      const req = http.get(`${BACKEND_URL}/health`, res => {
        if (res.statusCode === 200) {
          resolve()
        } else {
          retry()
        }
      })
      req.on('error', retry)
      req.end()
    }

    const retry = () => {
      if (++attempts >= retries) {
        reject(new Error(`Backend did not start after ${retries * intervalMs / 1000}s`))
      } else {
        setTimeout(check, intervalMs)
      }
    }

    check()
  })
}

// ─── Static file server (production) ──────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
}

function startStaticServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Proxy /api requests to backend
      if (req.url.startsWith('/api')) {
        const proxyReq = http.request(
          `${BACKEND_URL}${req.url}`,
          { method: req.method, headers: { ...req.headers, host: '127.0.0.1:8000' } },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
            proxyRes.pipe(res)
          }
        )
        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ detail: 'Backend unavailable' }))
        })
        req.pipe(proxyReq)
        return
      }

      // Serve static files from frontend/dist
      let filePath = path.join(FRONTEND_DIST, req.url === '/' ? 'index.html' : req.url)

      // SPA fallback: if file doesn't exist, serve index.html
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(FRONTEND_DIST, 'index.html')
      }

      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
          return
        }
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(data)
      })
    })

    server.listen(port, '127.0.0.1', () => {
      staticServer = server
      resolve(`http://127.0.0.1:${port}`)
    })

    server.on('error', reject)
  })
}

function stopStaticServer() {
  if (staticServer) {
    staticServer.close()
    staticServer = null
  }
}

// ─── Window ───────────────────────────────────────────────────────────────────

const LOADING_HTML = `
  data:text/html,
  <html>
    <body style="background:#000;margin:0;display:flex;align-items:center;
                 justify-content:center;height:100vh;
                 font-family:'Courier New',monospace">
      <div style="color:#ff9900;font-size:13px;letter-spacing:.08em">
        &#9632; SPECTRA TERMINAL STARTING&hellip;
      </div>
    </body>
  </html>
`.replace(/\s+/g, ' ').trim()

const ERROR_HTML = msg => `
  data:text/html,
  <html>
    <body style="background:#000;margin:0;display:flex;align-items:center;
                 justify-content:center;height:100vh;flex-direction:column;gap:12px;
                 font-family:'Courier New',monospace">
      <div style="color:#ff3333;font-size:13px">ERR: ${msg}</div>
      <div style="color:#554400;font-size:11px">
        Ensure backend/.venv exists and requirements are installed.
      </div>
    </body>
  </html>
`.replace(/\s+/g, ' ').trim()

async function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width:           1600,
    height:          1000,
    minWidth:        1024,
    minHeight:       700,
    backgroundColor: '#000000',
    titleBarStyle:   'default',
    title:           'Spectra Terminal',
    webPreferences:  {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.cjs'),
    },
  })

  // Reddit integration: override Electron's User-Agent (Reddit blocks it)
  // and inject CORS headers on responses (Reddit doesn't send them).
  const redditFilter = { urls: ['https://*.reddit.com/*'] }
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    redditFilter,
    (details, callback) => {
      const headers = Object.assign({}, details.requestHeaders)
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      callback({ requestHeaders: headers })
    },
  )
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    redditFilter,
    (details, callback) => {
      const headers = details.responseHeaders || {}
      headers['access-control-allow-origin'] = ['*']
      headers['access-control-allow-headers'] = ['*']
      callback({ responseHeaders: headers })
    },
  )

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(LOADING_HTML)

  try {
    if (IS_DEV) {
      startBackend()
      await waitForBackend()
      mainWindow.loadURL('http://localhost:5173')
    } else {
      // Production: frontend is built with VITE_API_URL pointing to remote API
      // Only start local backend if venv exists (dev packaging)
      if (fs.existsSync(VENV_PYTHON)) {
        startBackend()
        const appUrl = await startStaticServer()
        await waitForBackend()
        mainWindow.loadURL(appUrl)
      } else {
        // No local backend — serve frontend statically, API calls go to remote
        const appUrl = await startStaticServer()
        mainWindow.loadURL(appUrl)
      }
    }
  } catch (err) {
    mainWindow.loadURL(ERROR_HTML(err.message))
  }

  if (!IS_DEV) {
    initAutoUpdater(mainWindow)
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  stopBackend()
  stopStaticServer()
})

ipcMain.on('quit-app', () => {
  stopBackend()
  stopStaticServer()
  app.quit()
})

ipcMain.on('install-update', () => {
  installUpdateAndRestart()
})

ipcMain.on('open-external', (_, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    openExternalUrl(url)
  }
})

app.on('window-all-closed', () => {
  stopBackend()
  stopStaticServer()
  app.quit()
})