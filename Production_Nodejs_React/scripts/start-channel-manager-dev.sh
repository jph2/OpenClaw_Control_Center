#!/usr/bin/env bash
# Start Channel Manager dev stack (Express + Vite) in the background — for SSH/Tailscale without Cursor.
# Usage (on the Ubuntu box):
#   chmod +x scripts/start-channel-manager-dev.sh
#   ./scripts/start-channel-manager-dev.sh
#
# Requires backend/.env with WORKSPACE_ROOT (see backend/.env.example).
# From your PC, open: http://<tailscale-ip>:5173/channels

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_LOG="${ROOT}/backend/backend-dev.log"
FRONTEND_LOG="${ROOT}/frontend/vite-dev.log"

cd "${ROOT}/backend"
: >> "${BACKEND_LOG}"
nohup node index.js >> "${BACKEND_LOG}" 2>&1 &
echo "Backend PID $! — http://0.0.0.0:3000 (PORT in backend/.env; log: ${BACKEND_LOG})"

cd "${ROOT}/frontend"
: >> "${FRONTEND_LOG}"
nohup npx vite >> "${FRONTEND_LOG}" 2>&1 &
echo "Vite PID $! — http://0.0.0.0:5173 (log: ${FRONTEND_LOG})"
echo "Stop: ./scripts/stop-channel-manager-dev.sh"
