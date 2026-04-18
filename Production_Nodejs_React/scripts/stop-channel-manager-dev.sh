#!/usr/bin/env bash
# Stop processes listening on CM dev ports (3000 backend, 5173 Vite).
set -euo pipefail
for port in 3000 5173; do
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -t -i ":${port}" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      kill ${pids} 2>/dev/null || true
      echo "Stopped listener(s) on port ${port}: ${pids}"
    else
      echo "No listener on port ${port}"
    fi
  else
    echo "lsof not found; install it or stop node/vite manually (ports 3000, 5173)."
    exit 1
  fi
done
