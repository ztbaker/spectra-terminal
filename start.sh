#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== SpectraTerminal ==="

# ── Backend ──────────────────────────────────────────────────────────────
echo "[1/3] Installing backend dependencies..."
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
  echo ""
  echo "  ⚠️  No .env found. Copying .env.example → .env"
  echo "  Edit backend/.env and add your FRED_API_KEY and FINNHUB_API_KEY"
  cp .env.example .env
fi

echo "[2/3] Starting backend on :8000..."
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────────────
echo "[3/3] Starting frontend on :5173..."
cd "$ROOT/frontend"
npm install --silent
npm run dev &
FRONTEND_PID=$!

# ── Open browser ─────────────────────────────────────────────────────────
sleep 2
open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null || true

echo ""
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo "  Press Ctrl+C to stop both servers."

# ── Cleanup on exit ──────────────────────────────────────────────────────
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
