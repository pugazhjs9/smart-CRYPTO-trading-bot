#!/usr/bin/env bash
# =============================================================
# CryptoAI Trading Assistant - One-shot runner
# Starts: MongoDB -> FastAPI backend (port 8001) -> React frontend (port 3000)
# Works on: Emergent container (supervisor) OR a normal Linux/Mac dev box.
# =============================================================
set -Eeuo pipefail

# ---- colors ----
GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[run.sh]${NC} $*"; }
ok()   { echo -e "${GRN}[ ok  ]${NC} $*"; }
warn() { echo -e "${YLW}[warn ]${NC} $*"; }
err()  { echo -e "${RED}[fail ]${NC} $*" >&2; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.run_logs"
mkdir -p "$LOG_DIR"

# =============================================================
# 0. Sanity checks for required .env files
# =============================================================
for f in "$BACKEND_DIR/.env" "$FRONTEND_DIR/.env"; do
  if [[ ! -f "$f" ]]; then
    err "Missing $f - see LEARN.md (Lesson 1) for the required variables."
    exit 1
  fi
done
ok ".env files found"

# =============================================================
# 1. Detect runtime: supervisor (Emergent) vs local dev
# =============================================================
if command -v supervisorctl >/dev/null 2>&1 && sudo -n supervisorctl status >/dev/null 2>&1; then
  MODE="supervisor"
else
  MODE="local"
fi
log "Detected mode: ${GRN}$MODE${NC}"

# =============================================================
# 2. Install backend deps (idempotent)
# =============================================================
# emergentintegrations lives on a private index, so pass --extra-index-url
# on the MAIN install too; otherwise pip aborts the whole resolution and
# nothing (fastapi, motor, pandas...) gets installed.
EMERGENT_INDEX="https://d33sy5i8bnduwe.cloudfront.net/simple/"

log "Installing backend Python deps (this is a no-op if already installed)..."
if ! python3 -m pip install --disable-pip-version-check \
      --extra-index-url "$EMERGENT_INDEX" \
      -r "$BACKEND_DIR/requirements.txt"; then
  warn "Full install failed. Retrying WITHOUT emergentintegrations (AI Explain will be disabled)."
  # Build a filtered requirements file on the fly
  TMP_REQ=$(mktemp)
  grep -viE '^emergentintegrations' "$BACKEND_DIR/requirements.txt" > "$TMP_REQ"
  python3 -m pip install --disable-pip-version-check -r "$TMP_REQ" \
    || { err "pip install failed. See output above."; exit 1; }
  rm -f "$TMP_REQ"
fi
ok "backend deps ready"

# =============================================================
# 3. Install frontend deps (yarn only - never npm)
# =============================================================
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  log "Installing frontend deps with yarn..."
  (cd "$FRONTEND_DIR" && yarn install --frozen-lockfile)
else
  ok "node_modules already present - skipping yarn install"
fi

# =============================================================
# 4a. SUPERVISOR path - just (re)start the managed services
# =============================================================
if [[ "$MODE" == "supervisor" ]]; then
  log "Restarting services via supervisor..."
  sudo supervisorctl restart backend >/dev/null
  sudo supervisorctl restart frontend >/dev/null
  sleep 2
  sudo supervisorctl status
  ok "Services restarted. Frontend: http://localhost:3000  Backend: http://localhost:8001/api"
  echo
  log "Tail logs:  tail -f /var/log/supervisor/backend.*.log /var/log/supervisor/frontend.*.log"
  exit 0
fi

# =============================================================
# 4b. LOCAL DEV path - start Mongo, backend, frontend ourselves
# =============================================================

# --- MongoDB ---
if ! pgrep -x mongod >/dev/null 2>&1; then
  if command -v mongod >/dev/null 2>&1; then
    log "Starting local mongod..."
    mkdir -p "$LOG_DIR/mongo-data"
    mongod --dbpath "$LOG_DIR/mongo-data" --bind_ip 127.0.0.1 --port 27017 \
      --fork --logpath "$LOG_DIR/mongod.log" >/dev/null
    ok "mongod started (log: $LOG_DIR/mongod.log)"
  else
    warn "mongod not found locally. Install MongoDB or point MONGO_URL in backend/.env to a remote cluster."
  fi
else
  ok "mongod already running"
fi

cleanup() {
  log "Shutting down dev servers..."
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  ok "bye"
}
trap cleanup EXIT INT TERM

# --- Backend (FastAPI) ---
log "Starting FastAPI backend on :8001 ..."
(
  cd "$BACKEND_DIR"
  exec python3 -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
) > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
ok "backend PID=$BACKEND_PID  (log: $LOG_DIR/backend.log)"

# Wait for backend health
for i in {1..30}; do
  if curl -fs http://localhost:8001/api/ >/dev/null 2>&1; then
    ok "backend is responding on /api/"
    break
  fi
  # if the process died, show the log and bail immediately
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "backend process died before responding. Last 40 lines of log:"
    echo "----------------------------------------------------------------"
    tail -n 40 "$LOG_DIR/backend.log" || true
    echo "----------------------------------------------------------------"
    exit 1
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    err "backend did not respond in 30s. Last 40 lines of log:"
    echo "----------------------------------------------------------------"
    tail -n 40 "$LOG_DIR/backend.log" || true
    echo "----------------------------------------------------------------"
    exit 1
  fi
done

# --- Frontend (CRA via craco) ---
log "Starting React frontend on :3000 ..."
(
  cd "$FRONTEND_DIR"
  exec yarn start
) > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
ok "frontend PID=$FRONTEND_PID  (log: $LOG_DIR/frontend.log)"

echo
echo -e "${GRN}==============================================================${NC}"
echo -e " CryptoAI is up."
echo -e "   Frontend : http://localhost:3000"
echo -e "   Backend  : http://localhost:8001/api"
echo -e "   Logs     : $LOG_DIR/"
echo -e " Press Ctrl+C to stop both servers."
echo -e "${GRN}==============================================================${NC}"

wait
