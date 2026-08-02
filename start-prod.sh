#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
#  KIVO Production Start Script
#
#  Starts all services needed for a production deployment:
#    1. Socket.IO chat mini-service  (port 3003)
#    2. Next.js standalone server     (port 3000)
#    3. Caddy reverse proxy           (port 81 → 3000, optional)
#
#  Usage:
#    chmod +x start-prod.sh
#    ./start-prod.sh              # start all services (foreground)
#    ./start-prod.sh --no-caddy   # skip Caddy (run behind external proxy)
#
#  Environment (all required unless noted):
#    DATABASE_URL                   PostgreSQL connection string
#    DIRECT_URL                     Direct (non-pooled) PostgreSQL URL
#    JWT_SECRET                     ≥32 char signing secret
#    FIREBASE_SERVICE_ACCOUNT_B64   Base64-encoded service account JSON
#    NEXT_PUBLIC_FIREBASE_API_KEY   Firebase web API key
#    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
#    NEXT_PUBLIC_FIREBASE_PROJECT_ID
#    NEXT_PUBLIC_FIREBASE_APP_ID
#    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
#    NEXT_PUBLIC_VAPID_KEY          FCM web push VAPID key
#    CLOUDINARY_CLOUD_NAME          (optional — media uploads)
#    CLOUDINARY_UPLOAD_PRESET       (optional — media uploads)
#    PORT                           Next.js port (default: 3000)
#    CAPACITOR_SERVER_URL           (optional — for Android APK builds only)
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Flags ──────────────────────────────────────────────────────────────────
USE_CADDY=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-caddy) USE_CADDY=false; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Resolve bun (prefer PATH, fall back to npx cache / ~/.bun) ──────────────
BUN=""
if command -v bun &>/dev/null; then
  BUN="bun"
else
  # Search npx caches (glob may match multiple dirs, only one has bun)
  for candidate in "$HOME"/.npm/_npx/*/node_modules/@oven/bun-linux-x64-baseline/bin/bun; do
    if [[ -x "$candidate" ]]; then BUN="$candidate"; break; fi
  done
  if [[ -z "$BUN" ]] && [[ -x "$HOME/.bun/bin/bun" ]]; then
    BUN="$HOME/.bun/bin/bun"
  fi
fi
if [[ -z "$BUN" ]]; then
  echo "❌ bun not found. Install it: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "🐰 bun: $BUN ($($BUN --version 2>/dev/null || echo 'unknown'))"

# ── Load .env ──────────────────────────────────────────────────────────────
if [[ -f .env ]]; then
  set -a; source <(sed -e '/^#/d' -e '/^$/d' -e 's/^export //' .env); set +a
  echo "📄 Loaded .env"
else
  echo "⚠️  No .env file found — relying on system environment variables"
fi

# ── Validate required env vars ─────────────────────────────────────────────
REQUIRED_VARS=(
  DATABASE_URL
  JWT_SECRET
  FIREBASE_SERVICE_ACCOUNT_B64
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_VAPID_KEY
)

MISSING=()
for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    MISSING+=("$VAR")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "❌ Missing required environment variables:"
  for VAR in "${MISSING[@]}"; do echo "   - $VAR"; done
  exit 1
fi

if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "❌ JWT_SECRET must be at least 32 characters (got ${#JWT_SECRET})"
  exit 1
fi

echo "✅ All required environment variables present"

# ── Verify standalone build exists ─────────────────────────────────────────
if [[ ! -f .next/standalone/server.js ]]; then
  echo "❌ .next/standalone/server.js not found. Run: bun run build"
  exit 1
fi

# ── Ports ──────────────────────────────────────────────────────────────────
NEXT_PORT="${PORT:-3000}"
CHAT_PORT=3003
CADDY_PORT="${CADDY_PORT:-81}"

# ── PID tracking ──────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  echo "🛑 Shutting down KIVO services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  sleep 2
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  echo "✅ All services stopped"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── 1. Chat mini-service (Socket.IO) ──────────────────────────────────────
echo ""
echo "🚀 Starting chat service (port $CHAT_PORT)..."
$BUN mini-services/kivo-chat-service/index.ts &
CHAT_PID=$!
PIDS+=("$CHAT_PID")
sleep 1
if ! kill -0 "$CHAT_PID" 2>/dev/null; then
  echo "❌ Chat service failed to start"
  exit 1
fi
echo "✅ Chat service running (PID: $CHAT_PID)"

# ── 2. Next.js standalone server ──────────────────────────────────────────
echo ""
echo "🚀 Starting Next.js server (port $NEXT_PORT)..."
NODE_ENV=production node .next/standalone/server.js &
NEXT_PID=$!
PIDS+=("$NEXT_PID")
sleep 2
if ! kill -0 "$NEXT_PID" 2>/dev/null; then
  echo "❌ Next.js server failed to start"
  exit 1
fi
echo "✅ Next.js server running (PID: $NEXT_PID)"

# ── 3. Caddy reverse proxy (optional) ─────────────────────────────────────
if $USE_CADDY && [[ -f Caddyfile ]]; then
  if command -v caddy &>/dev/null; then
    echo ""
    echo "🚀 Starting Caddy reverse proxy (port $CADDY_PORT)..."
    caddy run --config Caddyfile --adapter caddyfile &
    CADDY_PID=$!
    PIDS+=("$CADDY_PID")
    sleep 1
    if kill -0 "$CADDY_PID" 2>/dev/null; then
      echo "✅ Caddy running (PID: $CADDY_PID)"
    else
      echo "⚠️  Caddy failed to start — continuing without proxy"
    fi
  else
    echo ""
    echo "⚠️  Caddy not installed — running without reverse proxy"
    echo "   Install: https://caddyserver.com/docs/install"
  fi
elif ! $USE_CADDY; then
  echo ""
  echo "ℹ️  Caddy skipped (--no-caddy)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     KIVO is running                          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Web server:    http://localhost:$NEXT_PORT                      ║"
echo "║  Socket.IO:     ws://localhost:$CHAT_PORT                            ║"
if $USE_CADDY && [[ -f Caddyfile ]]; then
  echo "║  Reverse proxy: http://localhost:$CADDY_PORT (Caddy)                 ║"
fi
echo "║                                                            ║"
echo "║  Press Ctrl+C to stop all services                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Wait for any child to exit (keeps script running)
wait
