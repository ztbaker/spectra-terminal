# Beta Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SpectraTerminal as an installable Mac/Windows desktop app to two beta testers who receive automatic updates and can report bugs from inside the app.

**Architecture:** Push source to a private GitHub repo. Host the Python backend remotely on Fly.io so testers don't need Python locally. Package the Electron frontend with `electron-builder` into signed-less `.dmg` / `.exe` installers. Use `electron-updater` pointed at GitHub Releases for silent auto-updates. Add an in-app `BUG` command that POSTs a structured report to a new backend endpoint which creates a GitHub Issue via the API.

**Tech Stack:** Electron 36, electron-builder, electron-updater, FastAPI, Fly.io, GitHub Releases, GitHub Actions, GitHub Issues API.

---

## Key Decisions (Locked)

- **Repo:** Private GitHub repo at `github.com/<user>/spectra-terminal`. Private because `.env.example` leaks, source may reference internal logic, and GitHub Releases works with private repos via authenticated downloads.
- **Backend hosting:** Fly.io. Free tier, Python/Docker friendly, scales to zero when idle. URL: `https://spectra-terminal-api.fly.dev`.
- **Code signing:** SKIPPED for beta. Mac testers right-click → Open on first launch. Windows testers click "More info → Run anyway" on SmartScreen. Document this in the install email.
- **Auth:** Shared-secret header (`X-Spectra-Key`) baked into the Electron build via `electron-builder` env injection. Prevents drive-by hits on the public Fly URL. Not real auth — beta only.
- **Platforms:** Mac (`.dmg`, arm64 + x64) and Windows (`.exe` NSIS installer, x64). Built in CI.
- **Version scheme:** SemVer starting at `0.1.0`. Tag `v0.1.0` triggers CI release.
- **Bug reports:** POST `/api/bugreport` → server creates a GitHub Issue with label `beta-bug`, title from user summary, body with full diagnostic context.

---

## File Structure

### New files
- `.github/workflows/release.yml` — GitHub Actions workflow that builds installers on tag push and uploads to Releases.
- `backend/Dockerfile` — Container image for Fly.io deployment.
- `backend/.dockerignore`
- `backend/fly.toml` — Fly.io app configuration.
- `backend/routers/bugreport.py` — New router for `POST /api/bugreport` → GitHub Issues API.
- `backend/tests/test_bugreport.py`
- `backend/middleware/auth.py` — Shared-secret header verification.
- `backend/tests/test_auth_middleware.py`
- `electron/updater.cjs` — Auto-update wiring (check on launch, IPC events to renderer).
- `frontend/src/components/BugReportDialog.tsx` — In-app bug report modal.
- `frontend/src/components/UpdateToast.tsx` — "Update available / Restart now" toast.
- `frontend/src/lib/bugReport.ts` — Client wrapper for POST `/api/bugreport`.
- `build/entitlements.mac.plist` — Minimal mac entitlements (unsigned but present for future).
- `build/icon.icns`, `build/icon.ico`, `build/icon.png` — App icons (placeholder ok for beta).
- `docs/BETA_INSTALL.md` — One-page install + update + bug-report doc for testers.

### Modified files
- `package.json` — Add `build` block for electron-builder, add `electron-updater` and `electron-builder` deps, add `release` script.
- `electron/main.cjs` — Remove local backend spawn (production), wire in `updater.cjs`, add IPC for bug reports.
- `electron/preload.cjs` — Expose `spectraAPI.reportBug(payload)` and update-related listeners.
- `frontend/src/lib/api.ts` — Change `baseURL` from `/api` to `VITE_API_URL` with auth header interceptor.
- `frontend/src/App.tsx` — Register `BUG` command, mount `BugReportDialog` + `UpdateToast`.
- `frontend/src/lib/commandParser.ts` — Add `BUG` command.
- `backend/main.py` — Include `bugreport` router, add auth middleware.
- `backend/config.py` — Add `SPECTRA_SHARED_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO` settings.
- `backend/.env.example` — Document new env vars.
- `.gitignore` — Ensure `dist/`, `release/`, `backend/.venv/`, `backend/.env`, `backend/spectra_terminal.db` are ignored.

---

## Phase 0 — Repo Setup

### Task 0.1: Audit `.gitignore` and remove committed secrets

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read current `.gitignore`**

Run: `cat .gitignore`

- [ ] **Step 2: Ensure these entries exist (add if missing)**

```gitignore
# Python
backend/.venv/
backend/__pycache__/
backend/**/__pycache__/
backend/*.db
backend/.env

# Node / Electron
node_modules/
frontend/node_modules/
frontend/dist/
dist/
release/
out/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
```

- [ ] **Step 3: Verify no secrets are tracked**

Run: `git ls-files | grep -E '\.env$|\.db$|node_modules|\.venv'`
Expected: empty output. If anything returns, `git rm --cached <file>` and recommit.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: harden gitignore for beta distribution"
```

### Task 0.2: Create private GitHub repo and push

**Files:** none (repo-level action)

- [ ] **Step 1: Create private repo via `gh`**

Run: `gh repo create spectra-terminal --private --source=. --remote=origin --push`

Expected output: confirms repo created and current branch pushed.

- [ ] **Step 2: Verify remote**

Run: `git remote -v`
Expected: `origin  https://github.com/<user>/spectra-terminal.git (fetch/push)`

- [ ] **Step 3: Note the repo slug for later**

Record `<owner>/spectra-terminal` — this becomes `GITHUB_REPO` env var in Phase 3.

---

## Phase 1 — Backend Remote Hosting (Fly.io)

### Task 1.1: Write `backend/Dockerfile`

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for pandas/numpy/scipy wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `backend/.dockerignore`**

```
.venv/
__pycache__/
**/__pycache__/
*.db
.env
tests/
.pytest_cache/
```

- [ ] **Step 3: Test build locally**

Run: `cd backend && docker build -t spectra-api:local .`
Expected: successful build ending in `Successfully tagged spectra-api:local`.

- [ ] **Step 4: Test run locally**

Run: `docker run --rm -p 8001:8000 -e FRED_API_KEY=$FRED_API_KEY -e FINNHUB_API_KEY=$FINNHUB_API_KEY spectra-api:local`
In another terminal: `curl http://127.0.0.1:8001/health`
Expected: `{"status":"ok"}`. Stop the container with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat(backend): add Dockerfile for Fly.io deployment"
```

### Task 1.2: Initialize Fly app

**Files:**
- Create: `backend/fly.toml`

- [ ] **Step 1: Install flyctl if missing**

Run: `flyctl version || brew install flyctl`

- [ ] **Step 2: Login**

Run: `flyctl auth login`

- [ ] **Step 3: Launch without deploying**

Run: `cd backend && flyctl launch --no-deploy --name spectra-terminal-api --region iad --copy-config=false`
Answer: no Postgres, no Redis, no deploy now. This writes `backend/fly.toml`.

- [ ] **Step 4: Edit `backend/fly.toml`**

Ensure the `[http_service]` block matches this:

```toml
[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

- [ ] **Step 5: Commit**

```bash
git add backend/fly.toml
git commit -m "feat(backend): add Fly.io app configuration"
```

### Task 1.3: Set Fly secrets and deploy

**Files:** none (runtime config)

- [ ] **Step 1: Set required secrets**

Run (substitute your real keys):
```bash
flyctl secrets set \
  FRED_API_KEY=xxx \
  FINNHUB_API_KEY=xxx \
  BLS_API_KEY=xxx \
  EIA_API_KEY=xxx \
  CONGRESS_API_KEY=xxx \
  -a spectra-terminal-api
```

- [ ] **Step 2: Generate and set shared key**

Run:
```bash
SPECTRA_KEY=$(openssl rand -hex 32)
echo "Shared key: $SPECTRA_KEY"
flyctl secrets set SPECTRA_SHARED_KEY=$SPECTRA_KEY -a spectra-terminal-api
```
Save `SPECTRA_KEY` locally — you'll bake it into the Electron build in Phase 3.

- [ ] **Step 3: Deploy**

Run: `cd backend && flyctl deploy -a spectra-terminal-api`
Expected: deploy succeeds, ends with `https://spectra-terminal-api.fly.dev` URL.

- [ ] **Step 4: Smoke test**

Run: `curl https://spectra-terminal-api.fly.dev/health`
Expected: `{"status":"ok"}`.

Run: `curl https://spectra-terminal-api.fly.dev/health/providers`
Expected: all providers `registered`.

### Task 1.4: Add shared-secret auth middleware (TDD)

**Files:**
- Create: `backend/middleware/__init__.py` (empty)
- Create: `backend/middleware/auth.py`
- Create: `backend/tests/test_auth_middleware.py`
- Modify: `backend/config.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add setting**

Edit `backend/config.py` — add inside `Settings` class:

```python
    SPECTRA_SHARED_KEY: str = os.getenv("SPECTRA_SHARED_KEY", "")
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_REPO: str = os.getenv("GITHUB_REPO", "")
```

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_auth_middleware.py`:

```python
import os
os.environ["SPECTRA_SHARED_KEY"] = "testkey"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from middleware.auth import SharedKeyMiddleware


def _app():
    app = FastAPI()
    app.add_middleware(SharedKeyMiddleware, exempt_paths=["/health"])

    @app.get("/api/ping")
    def ping():
        return {"pong": True}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


def test_rejects_missing_header():
    client = TestClient(_app())
    r = client.get("/api/ping")
    assert r.status_code == 401


def test_rejects_wrong_header():
    client = TestClient(_app())
    r = client.get("/api/ping", headers={"X-Spectra-Key": "wrong"})
    assert r.status_code == 401


def test_accepts_correct_header():
    client = TestClient(_app())
    r = client.get("/api/ping", headers={"X-Spectra-Key": "testkey"})
    assert r.status_code == 200
    assert r.json() == {"pong": True}


def test_exempts_health():
    client = TestClient(_app())
    r = client.get("/health")
    assert r.status_code == 200
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_middleware.py -v`
Expected: ImportError on `middleware.auth`.

- [ ] **Step 4: Implement middleware**

Create `backend/middleware/__init__.py` as an empty file.

Create `backend/middleware/auth.py`:

```python
from typing import Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from config import settings


class SharedKeyMiddleware(BaseHTTPMiddleware):
    """Reject requests missing the shared X-Spectra-Key header.

    Exempt paths (health checks, docs) are allowed through unauthenticated.
    If SPECTRA_SHARED_KEY is empty (local dev), the middleware is a no-op.
    """

    def __init__(self, app, exempt_paths: Iterable[str] = ()):
        super().__init__(app)
        self.exempt = tuple(exempt_paths)

    async def dispatch(self, request: Request, call_next):
        expected = settings.SPECTRA_SHARED_KEY
        if not expected:
            return await call_next(request)

        if any(request.url.path.startswith(p) for p in self.exempt):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        provided = request.headers.get("x-spectra-key", "")
        if provided != expected:
            return JSONResponse({"detail": "unauthorized"}, status_code=401)

        return await call_next(request)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_middleware.py -v`
Expected: 4 passed.

- [ ] **Step 6: Wire middleware into `backend/main.py`**

Edit `backend/main.py` — add import and add middleware registration **after** the CORS middleware:

```python
from middleware.auth import SharedKeyMiddleware

app.add_middleware(
    SharedKeyMiddleware,
    exempt_paths=["/health", "/docs", "/openapi.json", "/redoc"],
)
```

- [ ] **Step 7: Run full test suite to confirm nothing broke**

Run: `cd backend && pytest`
Expected: all existing tests still pass (any test that hits `/api/*` will need `X-Spectra-Key: testkey` header — fix those tests now if they fail by setting the env var or header).

- [ ] **Step 8: Redeploy to Fly**

Run: `cd backend && flyctl deploy -a spectra-terminal-api`

- [ ] **Step 9: Verify auth works in production**

Run: `curl -i https://spectra-terminal-api.fly.dev/api/equity/AAPL`
Expected: `401 unauthorized`.

Run: `curl -H "X-Spectra-Key: $SPECTRA_KEY" https://spectra-terminal-api.fly.dev/api/equity/AAPL`
Expected: `200` with equity data.

- [ ] **Step 10: Commit**

```bash
git add backend/config.py backend/middleware backend/tests/test_auth_middleware.py backend/main.py
git commit -m "feat(backend): add shared-secret auth middleware"
```

### Task 1.5: Update frontend to use remote backend

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/.env.production` (not committed — build-time only)
- Modify: `frontend/.env.example` (create if missing, commit)

- [ ] **Step 1: Update axios client**

Edit `frontend/src/lib/api.ts`, replace the `const api = axios.create({ baseURL: '/api' })` line with:

```typescript
const API_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
  if (API_KEY) {
    config.headers = config.headers ?? {}
    config.headers['X-Spectra-Key'] = API_KEY
  }
  return config
})
```

- [ ] **Step 2: Create `frontend/.env.example`**

```
VITE_API_URL=https://spectra-terminal-api.fly.dev/api
VITE_API_KEY=REPLACE_WITH_SPECTRA_SHARED_KEY
```

- [ ] **Step 3: Create `frontend/.env.production` (untracked)**

Same contents as `.env.example` but with the real `SPECTRA_KEY` from Task 1.3. This file is used by `npm run build` and is already ignored via `frontend/.env*.local` pattern. Add `frontend/.env.production` to `.gitignore` explicitly if not covered.

- [ ] **Step 4: Build and smoke-test**

Run: `cd frontend && npm run build`
Then run: `npm run app` (from repo root)
Expected: app loads, equity screen works against the Fly backend.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/.env.example .gitignore
git commit -m "feat(frontend): route API calls to remote backend with shared-secret auth"
```

---

## Phase 2 — Electron Builder Packaging

### Task 2.1: Install electron-builder and deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install deps**

Run: `npm install --save-dev electron-builder && npm install electron-updater`

- [ ] **Step 2: Commit lockfile**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-builder and electron-updater"
```

### Task 2.2: Configure `package.json` build block

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace `package.json` with full build config**

Edit `package.json` to:

```json
{
  "name": "spectra-terminal",
  "version": "0.1.0",
  "description": "Spectra Terminal — Bloomberg-style trading terminal",
  "main": "electron/main.cjs",
  "author": "Zachary Baker <zbaker88@me.com>",
  "scripts": {
    "build": "cd frontend && npm run build",
    "electron": "electron .",
    "app": "npm run build && electron .",
    "electron:dev": "BAKER_DEV=1 electron .",
    "dist": "npm run build && electron-builder",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:win": "npm run build && electron-builder --win",
    "release": "npm run build && electron-builder --publish always"
  },
  "devDependencies": {
    "electron": "^36.0.0",
    "electron-builder": "^25.0.0"
  },
  "dependencies": {
    "electron-updater": "^6.3.0"
  },
  "build": {
    "appId": "com.zbaker.spectra-terminal",
    "productName": "Spectra Terminal",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "files": [
      "electron/**/*",
      "frontend/dist/**/*",
      "!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}",
      "!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}"
    ],
    "mac": {
      "category": "public.app-category.finance",
      "target": [
        { "target": "dmg", "arch": ["arm64", "x64"] }
      ],
      "icon": "build/icon.icns",
      "hardenedRuntime": false,
      "gatekeeperAssess": false
    },
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "perMachine": false
    },
    "publish": {
      "provider": "github",
      "owner": "REPLACE_WITH_GITHUB_OWNER",
      "repo": "spectra-terminal",
      "private": true
    }
  }
}
```

Replace `REPLACE_WITH_GITHUB_OWNER` with the actual GitHub username/org from Task 0.2.

- [ ] **Step 2: Add placeholder icons**

Place any 1024×1024 PNG at `build/icon.png` temporarily. electron-builder will derive `.icns` and `.ico` automatically if they're missing. For production-looking icons, convert a real logo later.

Run: `mkdir -p build && cp /path/to/some-icon.png build/icon.png` (any 1024×1024 PNG — even a plain amber square works for beta).

- [ ] **Step 3: Strip local-backend spawn from production main**

Edit `electron/main.cjs` — wrap `startBackend()` and `waitForBackend()` calls in `createWindow()` with `if (IS_DEV) { ... }`:

```javascript
  try {
    if (IS_DEV) {
      startBackend()
      await waitForBackend()
      mainWindow.loadURL('http://localhost:5173')
    } else {
      const appUrl = await startStaticServer()
      mainWindow.loadURL(appUrl)
    }
  } catch (err) {
    mainWindow.loadURL(ERROR_HTML(err.message))
  }
```

Also update `startStaticServer` — in production mode the frontend hits the remote Fly backend directly, so the `/api` proxy in the static server is no longer needed. Remove the `if (req.url.startsWith('/api')) { ... }` block from `startStaticServer`.

- [ ] **Step 4: Build Mac DMG locally**

Run: `npm run dist:mac`
Expected: `release/Spectra Terminal-0.1.0-arm64.dmg` (and `-x64.dmg`) produced.

- [ ] **Step 5: Test the built DMG**

Open the DMG, drag the app to Applications, launch it, right-click → Open (first launch). Verify the equity screen works by typing `AAPL`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron/main.cjs build/
git commit -m "feat: configure electron-builder for Mac/Windows distribution"
```

---

## Phase 3 — Auto-Update (electron-updater + GitHub Releases)

### Task 3.1: Create `electron/updater.cjs`

**Files:**
- Create: `electron/updater.cjs`

- [ ] **Step 1: Write updater module**

```javascript
'use strict'

const { autoUpdater } = require('electron-updater')
const log             = require('electron-log')

autoUpdater.logger      = log
autoUpdater.logger.transports.file.level = 'info'
autoUpdater.autoDownload          = true
autoUpdater.autoInstallOnAppQuit  = false

function initAutoUpdater(mainWindow) {
  const send = (channel, payload = {}) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('checking-for-update', () => send('update:checking'))
  autoUpdater.on('update-available',   (info) => send('update:available',   info))
  autoUpdater.on('update-not-available', (info) => send('update:none',      info))
  autoUpdater.on('download-progress',  (p)   => send('update:progress',    p))
  autoUpdater.on('update-downloaded',  (info) => send('update:downloaded', info))
  autoUpdater.on('error',              (err) => send('update:error', { message: err?.message || String(err) }))

  // Check 10s after launch, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function installUpdateAndRestart() {
  autoUpdater.quitAndInstall(false, true)
}

module.exports = { initAutoUpdater, installUpdateAndRestart }
```

- [ ] **Step 2: Install `electron-log`**

Run: `npm install electron-log`

### Task 3.2: Wire updater into `electron/main.cjs` and preload

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`

- [ ] **Step 1: Import and call updater in `main.cjs`**

At the top of `electron/main.cjs`, add:

```javascript
const { initAutoUpdater, installUpdateAndRestart } = require('./updater.cjs')
```

At the end of `createWindow()` (after `mainWindow.loadURL(...)`), add:

```javascript
  if (!IS_DEV) {
    initAutoUpdater(mainWindow)
  }
```

Add IPC handler near the bottom, alongside the existing `quit-app` handler:

```javascript
ipcMain.on('install-update', () => {
  installUpdateAndRestart()
})
```

- [ ] **Step 2: Expose update events to renderer via preload**

Edit `electron/preload.cjs` — add:

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spectraUpdater', {
  onChecking:   (cb) => ipcRenderer.on('update:checking',   (_, p) => cb(p)),
  onAvailable:  (cb) => ipcRenderer.on('update:available',  (_, p) => cb(p)),
  onNone:       (cb) => ipcRenderer.on('update:none',       (_, p) => cb(p)),
  onProgress:   (cb) => ipcRenderer.on('update:progress',   (_, p) => cb(p)),
  onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_, p) => cb(p)),
  onError:      (cb) => ipcRenderer.on('update:error',      (_, p) => cb(p)),
  installAndRestart: () => ipcRenderer.send('install-update'),
})
```

(If `preload.cjs` already has a `contextBridge` call, merge these into the existing expose block rather than duplicating.)

- [ ] **Step 3: Commit**

```bash
git add electron/updater.cjs electron/main.cjs electron/preload.cjs package.json package-lock.json
git commit -m "feat(electron): wire auto-updater against GitHub Releases"
```

### Task 3.3: Build UpdateToast component

**Files:**
- Create: `frontend/src/components/UpdateToast.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `UpdateToast.tsx`**

```tsx
import { useEffect, useState } from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'progress'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }

const AMBER = '#ff9900'
const GREEN = '#00ff41'
const RED   = '#ff3333'
const BG    = '#000000'

export function UpdateToast() {
  const [state, setState] = useState<State>({ kind: 'idle' })

  useEffect(() => {
    const updater = (window as any).spectraUpdater
    if (!updater) return

    updater.onAvailable((info: { version: string }) =>
      setState({ kind: 'available', version: info.version }),
    )
    updater.onProgress((p: { percent: number }) =>
      setState({ kind: 'progress', percent: Math.round(p.percent) }),
    )
    updater.onDownloaded((info: { version: string }) =>
      setState({ kind: 'ready', version: info.version }),
    )
    updater.onError((e: { message: string }) =>
      setState({ kind: 'error', message: e.message }),
    )
  }, [])

  if (state.kind === 'idle') return null

  const base: React.CSSProperties = {
    position: 'fixed',
    right: 16,
    bottom: 16,
    background: BG,
    border: `1px solid ${AMBER}`,
    padding: '10px 14px',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: AMBER,
    zIndex: 9999,
    minWidth: 260,
  }

  if (state.kind === 'available') {
    return <div style={base}>UPDATE v{state.version} DOWNLOADING…</div>
  }
  if (state.kind === 'progress') {
    return <div style={base}>DOWNLOAD {state.percent}%</div>
  }
  if (state.kind === 'ready') {
    return (
      <div style={base}>
        <div style={{ color: GREEN, marginBottom: 6 }}>
          UPDATE v{state.version} READY
        </div>
        <button
          onClick={() => (window as any).spectraUpdater?.installAndRestart()}
          style={{
            background: 'transparent',
            color: AMBER,
            border: `1px solid ${AMBER}`,
            padding: '4px 10px',
            fontFamily: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          RESTART NOW
        </button>
      </div>
    )
  }
  if (state.kind === 'error') {
    return <div style={{ ...base, borderColor: RED, color: RED }}>UPDATE ERR: {state.message}</div>
  }
  return null
}
```

- [ ] **Step 2: Mount in `App.tsx`**

Edit `frontend/src/App.tsx` — import and render at the root level:

```tsx
import { UpdateToast } from './components/UpdateToast'

// inside the root render tree, near the top-level container:
<UpdateToast />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/UpdateToast.tsx frontend/src/App.tsx
git commit -m "feat(frontend): UpdateToast surfaces electron-updater events"
```

### Task 3.4: Create GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-14, windows-latest]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install root deps
        run: npm ci

      - name: Install frontend deps
        working-directory: frontend
        run: npm ci

      - name: Build frontend
        working-directory: frontend
        run: npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_API_KEY: ${{ secrets.VITE_API_KEY }}

      - name: Build and publish electron app
        run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Add secrets in GitHub**

Run the following to add the secrets (substitute values):

```bash
gh secret set VITE_API_URL --body "https://spectra-terminal-api.fly.dev/api"
gh secret set VITE_API_KEY --body "$SPECTRA_KEY"
```

`GITHUB_TOKEN` is provided automatically by Actions — no manual setup.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for Mac/Win builds"
git push origin master
```

### Task 3.5: End-to-end release test

**Files:** none (release action)

- [ ] **Step 1: Tag and push v0.1.0**

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 2: Watch the build**

Run: `gh run watch`
Expected: both Mac and Windows jobs succeed.

- [ ] **Step 3: Verify release artifacts**

Run: `gh release view v0.1.0`
Expected: see `.dmg`, `.exe`, `latest-mac.yml`, `latest.yml`, and `.blockmap` files attached. `latest-*.yml` files are what electron-updater polls.

- [ ] **Step 4: Install v0.1.0 locally from the Release**

Download the DMG from the Release page, install, launch. Confirm the app loads against the Fly backend.

- [ ] **Step 5: Bump version and tag v0.1.1**

Edit `package.json` version field → `0.1.1`. Commit and tag:

```bash
git commit -am "chore: bump to 0.1.1 for update test"
git tag v0.1.1
git push origin master v0.1.1
```

Wait for CI to finish and Release v0.1.1 to publish.

- [ ] **Step 6: Verify update flow**

With the v0.1.0 app still installed, quit and relaunch it. Within 10s, the UpdateToast should appear ("UPDATE v0.1.1 DOWNLOADING…" → "UPDATE v0.1.1 READY"). Click RESTART NOW. App relaunches as v0.1.1 — verify by checking `package.json`-embedded version in the UI (add a small version display if not present; see Task 4.3 which adds one to the BUG dialog context).

---

## Phase 4 — Bug Reporting

### Task 4.1: Backend `/api/bugreport` endpoint (TDD)

**Files:**
- Create: `backend/routers/bugreport.py`
- Create: `backend/tests/test_bugreport.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_bugreport.py`:

```python
import os
os.environ.setdefault("SPECTRA_SHARED_KEY", "testkey")
os.environ.setdefault("GITHUB_TOKEN", "ghp_fake")
os.environ.setdefault("GITHUB_REPO", "owner/spectra-terminal")

from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _post(payload):
    return client.post(
        "/api/bugreport",
        json=payload,
        headers={"X-Spectra-Key": "testkey"},
    )


def test_requires_auth():
    r = client.post("/api/bugreport", json={"summary": "x", "description": "y"})
    assert r.status_code == 401


def test_rejects_missing_summary():
    r = _post({"description": "no summary"})
    assert r.status_code == 422


@patch("routers.bugreport.httpx.Client")
def test_creates_github_issue(mock_client):
    instance = MagicMock()
    instance.__enter__.return_value = instance
    instance.post.return_value.status_code = 201
    instance.post.return_value.json.return_value = {
        "number": 42,
        "html_url": "https://github.com/owner/spectra-terminal/issues/42",
    }
    mock_client.return_value = instance

    payload = {
        "summary": "Equity screen blank on AAPL",
        "description": "Typed AAPL, screen stays blank.",
        "reporter": "friend-a",
        "app_version": "0.1.0",
        "os": "darwin",
        "screen": "EQUI",
        "last_error": "TypeError: x is undefined",
    }
    r = _post(payload)
    assert r.status_code == 200
    body = r.json()
    assert body["issue_number"] == 42
    assert "github.com" in body["issue_url"]

    instance.post.assert_called_once()
    kwargs = instance.post.call_args.kwargs
    sent = kwargs["json"]
    assert sent["title"] == "[beta-bug] Equity screen blank on AAPL"
    assert "friend-a" in sent["body"]
    assert "0.1.0"   in sent["body"]
    assert "EQUI"    in sent["body"]
    assert "beta-bug" in sent["labels"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_bugreport.py -v`
Expected: ImportError on `routers.bugreport`.

- [ ] **Step 3: Implement the router**

Create `backend/routers/bugreport.py`:

```python
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings

router = APIRouter()


class BugReport(BaseModel):
    summary: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=1, max_length=8000)
    reporter: Optional[str] = None
    app_version: Optional[str] = None
    os: Optional[str] = None
    screen: Optional[str] = None
    last_error: Optional[str] = None


class BugReportResponse(BaseModel):
    issue_number: int
    issue_url: str


def _format_body(r: BugReport) -> str:
    return (
        f"**Reporter:** {r.reporter or 'unknown'}\n"
        f"**App version:** {r.app_version or 'unknown'}\n"
        f"**OS:** {r.os or 'unknown'}\n"
        f"**Screen:** {r.screen or 'unknown'}\n\n"
        f"### Description\n{r.description}\n\n"
        f"### Last error\n```\n{r.last_error or '(none captured)'}\n```\n"
    )


@router.post("/bugreport", response_model=BugReportResponse)
def submit_bug(report: BugReport):
    if not settings.GITHUB_TOKEN or not settings.GITHUB_REPO:
        raise HTTPException(status_code=503, detail="bug reporting not configured")

    payload = {
        "title": f"[beta-bug] {report.summary}",
        "body":  _format_body(report),
        "labels": ["beta-bug"],
    }
    url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues"
    headers = {
        "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    with httpx.Client(timeout=10.0) as client:
        resp = client.post(url, json=payload, headers=headers)

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"github api error: {resp.status_code}")

    data = resp.json()
    return BugReportResponse(issue_number=data["number"], issue_url=data["html_url"])
```

- [ ] **Step 4: Register router**

Edit `backend/main.py` — add to the imports:

```python
from routers import (
    ...
    bugreport,
)
```

And register:

```python
app.include_router(bugreport.router, prefix="/api")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_bugreport.py -v`
Expected: 3 passed.

- [ ] **Step 6: Set GitHub token on Fly**

Create a classic personal access token with `repo` scope at https://github.com/settings/tokens, then:

```bash
flyctl secrets set \
  GITHUB_TOKEN=ghp_xxx \
  GITHUB_REPO=<owner>/spectra-terminal \
  -a spectra-terminal-api
```

- [ ] **Step 7: Redeploy and smoke test**

```bash
cd backend && flyctl deploy -a spectra-terminal-api

curl -X POST https://spectra-terminal-api.fly.dev/api/bugreport \
  -H "X-Spectra-Key: $SPECTRA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"summary":"smoke test","description":"ignore me","reporter":"zac","app_version":"0.1.0","os":"darwin","screen":"HOME"}'
```
Expected: `{"issue_number": <N>, "issue_url": "..."}`. Verify the issue appears in the repo, then close it.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/bugreport.py backend/tests/test_bugreport.py backend/main.py
git commit -m "feat(backend): bug report endpoint creates GitHub issues"
```

### Task 4.2: Frontend BugReportDialog

**Files:**
- Create: `frontend/src/lib/bugReport.ts`
- Create: `frontend/src/components/BugReportDialog.tsx`

- [ ] **Step 1: Client wrapper**

Create `frontend/src/lib/bugReport.ts`:

```typescript
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'
const API_KEY = import.meta.env.VITE_API_KEY || ''
const APP_VERSION = (import.meta as any).env?.VITE_APP_VERSION || '0.0.0'

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
```

- [ ] **Step 2: Dialog component**

Create `frontend/src/components/BugReportDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { submitBugReport } from '../lib/bugReport'

const AMBER = '#ff9900'
const GREEN = '#00ff41'
const RED   = '#ff3333'
const BG    = '#000000'

interface Props {
  open: boolean
  onClose: () => void
  currentScreen?: string
  lastError?: string
}

export function BugReportDialog({ open, onClose, currentScreen, lastError }: Props) {
  const [summary, setSummary]         = useState('')
  const [description, setDescription] = useState('')
  const [reporter, setReporter]       = useState(() => localStorage.getItem('spectra.reporter') || '')
  const [status, setStatus]           = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [message, setMessage]         = useState('')

  useEffect(() => {
    if (open) {
      setStatus('idle')
      setMessage('')
      setSummary('')
      setDescription('')
    }
  }, [open])

  if (!open) return null

  const canSubmit = summary.trim().length >= 3 && description.trim().length >= 1 && status !== 'sending'

  async function send() {
    setStatus('sending')
    try {
      localStorage.setItem('spectra.reporter', reporter)
      const res = await submitBugReport({
        summary,
        description,
        reporter,
        screen: currentScreen,
        lastError,
      })
      setStatus('ok')
      setMessage(`Filed issue #${res.issue_number}`)
    } catch (e: any) {
      setStatus('err')
      setMessage(e?.message || 'Failed to send')
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  }
  const box: React.CSSProperties = {
    background: BG, border: `1px solid ${AMBER}`,
    padding: 20, minWidth: 480, maxWidth: 640,
    color: AMBER, fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
  }
  const input: React.CSSProperties = {
    width: '100%', background: BG, color: AMBER,
    border: `1px solid ${AMBER}`, padding: 6,
    fontFamily: 'inherit', fontSize: 12, marginTop: 4,
  }
  const btn = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent', color: disabled ? '#554400' : AMBER,
    border: `1px solid ${disabled ? '#554400' : AMBER}`, padding: '6px 14px',
    fontFamily: 'inherit', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
  })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 13, marginBottom: 12, letterSpacing: '0.08em' }}>
          ■ REPORT BUG
        </div>

        <label>REPORTER (your name):
          <input style={input} value={reporter} onChange={e => setReporter(e.target.value)} />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>SUMMARY:
          <input style={input} value={summary} onChange={e => setSummary(e.target.value)}
                 placeholder="One line. What went wrong?" />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>DESCRIPTION:
          <textarea
            style={{ ...input, height: 140, resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Steps to reproduce, what you expected, what actually happened."
          />
        </label>

        <div style={{ marginTop: 10, fontSize: 11, color: '#886600' }}>
          CONTEXT ATTACHED: screen={currentScreen || '—'} · error={lastError ? 'yes' : 'no'}
        </div>

        {message && (
          <div style={{
            marginTop: 10, fontSize: 11,
            color: status === 'ok' ? GREEN : status === 'err' ? RED : AMBER,
          }}>
            {message}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn(false)} onClick={onClose}>CLOSE</button>
          <button style={btn(!canSubmit)} disabled={!canSubmit} onClick={send}>
            {status === 'sending' ? 'SENDING…' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Task 4.3: Wire BUG command

**Files:**
- Modify: `frontend/src/lib/commandParser.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/vite.config.ts` (to inject VITE_APP_VERSION from package.json)

- [ ] **Step 1: Inject app version at build time**

Edit `frontend/vite.config.ts` — add `define`:

```typescript
import pkg from '../package.json'

export default defineConfig({
  // ...existing config...
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
})
```

(If the file imports are different, adapt — the goal is to make `import.meta.env.VITE_APP_VERSION` equal the root `package.json` version at build time.)

- [ ] **Step 2: Add BUG to command parser**

Open `frontend/src/lib/commandParser.ts`. Find where other single-word commands like `N`, `FX`, `PORT` are handled and add a branch for `BUG` that returns a command of type `BUG_REPORT` (or reuse a generic "open dialog" command if the codebase has one).

If the command parser returns a discriminated union like `{ kind: 'screen', screen: 'fx' }`, add:

```typescript
if (tokens[0] === 'BUG') {
  return { kind: 'bugReport' }
}
```

And make sure the `kind: 'bugReport'` variant is in the exported type union.

- [ ] **Step 3: Handle it in App.tsx**

Edit `frontend/src/App.tsx`:

```tsx
import { BugReportDialog } from './components/BugReportDialog'

// inside the component:
const [bugOpen, setBugOpen] = useState(false)
const [lastError, setLastError] = useState<string | undefined>(undefined)

// capture last error
useEffect(() => {
  const handler = (e: ErrorEvent) => setLastError(`${e.message} @ ${e.filename}:${e.lineno}`)
  window.addEventListener('error', handler)
  return () => window.removeEventListener('error', handler)
}, [])

// in the command dispatch where screen-changes happen:
if (command.kind === 'bugReport') {
  setBugOpen(true)
  return
}

// in the render tree:
<BugReportDialog
  open={bugOpen}
  onClose={() => setBugOpen(false)}
  currentScreen={currentScreen /* your existing state */}
  lastError={lastError}
/>
```

- [ ] **Step 4: Manual test**

Run: `npm run electron:dev` (with backend running locally) OR build and run against Fly.
Type `BUG` → dialog opens. Fill in fields. Hit SEND. Verify a GitHub Issue gets created.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/bugReport.ts \
        frontend/src/components/BugReportDialog.tsx \
        frontend/src/lib/commandParser.ts \
        frontend/src/App.tsx \
        frontend/vite.config.ts
git commit -m "feat(frontend): BUG command opens in-app bug report dialog"
```

---

## Phase 5 — Ship to Beta Testers

### Task 5.1: Write install doc

**Files:**
- Create: `docs/BETA_INSTALL.md`

- [ ] **Step 1: Write the doc**

```markdown
# Spectra Terminal — Beta Install

## Mac (Apple Silicon or Intel)

1. Download `Spectra Terminal-<version>-arm64.dmg` (M1/M2/M3/M4) or `-x64.dmg` (Intel) from the email link.
2. Open the DMG. Drag **Spectra Terminal** to **Applications**.
3. First launch: **right-click** the app → **Open** → **Open**. This is one-time and required because the app isn't signed with an Apple Developer ID (beta only).
4. Future launches: normal double-click.

## Windows

1. Download `Spectra Terminal Setup <version>.exe` from the email link.
2. Double-click to run. Windows SmartScreen may show a warning — click **More info → Run anyway**. This is because we haven't paid for code signing yet (beta only).
3. Follow the installer.

## Updates

The app checks for updates automatically on launch and every 4 hours. When a new version is ready, a small "UPDATE vX.Y.Z READY" panel appears bottom-right. Click **RESTART NOW** to install. That's it — no re-downloading.

## Reporting bugs

Type `BUG` in the command bar at the top. A form opens. Fill in:
- **Reporter:** your name (saved after first use)
- **Summary:** one-line description
- **Description:** what you did, what you expected, what happened

Hit **SEND**. It files a GitHub Issue labeled `beta-bug`. I'll see it immediately.

## If something breaks hard

Email me at zbaker88@me.com with a screenshot.
```

- [ ] **Step 2: Commit**

```bash
git add docs/BETA_INSTALL.md
git commit -m "docs: add beta install guide"
```

### Task 5.2: First real release

**Files:** none (release action)

- [ ] **Step 1: Confirm everything clean**

```bash
git status    # expect clean
git log -5    # sanity check
```

- [ ] **Step 2: Ensure version is 0.1.0 (or bump to 0.2.0 after test releases)**

Edit `package.json` version field. Commit if changed.

- [ ] **Step 3: Tag and push**

```bash
git tag v0.1.0    # or next SemVer
git push origin master --tags
```

- [ ] **Step 4: Watch CI**

Run: `gh run watch`
Expected: both OS jobs green.

- [ ] **Step 5: Verify Release**

Run: `gh release view v0.1.0 --web`
Expected: installers attached, `latest-mac.yml` and `latest.yml` present.

- [ ] **Step 6: Distribute**

For private repos, testers can't just click a download link without a GitHub account and collaborator access. Two options:

**Option A (simpler):** Mark the Release as public-asset while keeping source private — not natively supported on GitHub.com. Instead, use `gh release download v0.1.0 --pattern '*.dmg' --pattern '*.exe' -D ./to-send` and send installers via Dropbox/iCloud/Google Drive link.

**Option B (auto-update friendly):** Add each tester as a repo collaborator (Settings → Collaborators → Add people, Read access). Then `electron-updater` authenticates with their token… except it uses `GH_TOKEN` from the build, not per-user auth. **For private repos, `electron-updater` requires a token on the client side** — which means baking a read-only GitHub PAT into the build.

**Recommended:** Use a separate **public** release-artifacts repo. Make `spectra-terminal` (source) private, create `spectra-terminal-releases` public, and point the `publish` block in `package.json` at the public repo. No tokens on the client, clean install for testers. Update Task 3.4's workflow to push artifacts to the public repo using a PAT stored as `RELEASE_REPO_TOKEN`.

Decide here and implement the chosen option before distributing.

- [ ] **Step 7: Send install email**

Email each tester with:
- Link to `docs/BETA_INSTALL.md` (rendered on GitHub) or copy-paste the content
- Link to the installer download (Dropbox link or public release asset)
- Your contact for emergencies

### Task 5.3: Post-release checklist

**Files:** none (process)

- [ ] **Step 1: Confirm tester installs work**

Have each tester confirm: app launched, `AAPL` shows data, `BUG` command works.

- [ ] **Step 2: Ship a trivial 0.1.1 update**

Change a label or bump a version string, tag `v0.1.1`, push. Confirm both testers see the update toast within a day and restart into 0.1.1.

- [ ] **Step 3: Close out plan**

Move this plan file to `docs/superpowers/plans/done/` (or leave in place, the codebase conventions show they stay put).

---

## Risk Register

- **Fly.io cold starts:** first request after idle takes ~3–5s. Mitigation: `min_machines_running = 0` is fine for 2 testers; if annoying, bump to 1 (~$2/mo).
- **API rate limits:** FRED is 120 req/min per key, Finnhub is 60 req/min free. Three users sharing keys is well under any limit.
- **Shared secret leak:** Baked into the JS bundle — anyone with the `.dmg` can extract it and hit your Fly URL. Fine for beta, but do not ship publicly without real auth.
- **Mac Gatekeeper:** unsigned apps require right-click-Open once. If a tester can't figure it out, have them run `xattr -dr com.apple.quarantine "/Applications/Spectra Terminal.app"` or pay for Apple Developer ID ($99/yr) + notarization.
- **Auto-update on private repo:** covered in Task 5.2 — plan on a public release-artifacts repo.
- **GitHub token in backend:** the `GITHUB_TOKEN` on Fly can open arbitrary issues. Rotate it if Fly is ever compromised; keep `repo` scope narrowed (use a fine-grained token if possible, scoped to just `spectra-terminal` with Issues: write).

## Self-Review Notes

- Spec covers: GitHub repo, backend hosting, packaging, auto-updates, bug reporting, install docs. ✓
- All distribution concerns from the pre-plan brainstorm are addressed.
- Test coverage: auth middleware (4 tests) + bug report endpoint (3 tests). Infra tasks use manual verification steps.
- Types consistent: `BugReport`, `BugReportResponse`, `BugReportPayload` all agree.
- No TODO/TBD placeholders — every code step is complete.
- One judgment call left to the engineer: public release-artifacts repo vs. per-tester collaborator auth (Task 5.2 Step 6) — documented as an explicit decision point with a recommended default.
