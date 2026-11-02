#!/usr/bin/env bash
# Stop the local Hei Gallery server.
set -e
cd "$(dirname "$0")"

STOPPED=0
if [ -f .hei.pid ]; then
  PID=$(cat .hei.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    STOPPED=1
  fi
  rm -f .hei.pid
fi

if command -v lsof >/dev/null 2>&1; then
  REM=$(lsof -ti :6765 || true)
  if [ -n "$REM" ]; then
    kill $REM 2>/dev/null || true
    STOPPED=1
  fi
fi

if [ "$STOPPED" = "1" ]; then
  echo "✅ Hei Gallery stopped."
else
  echo "Nothing running on port 6765."
fi
