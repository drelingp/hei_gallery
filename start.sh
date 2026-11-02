#!/usr/bin/env bash
# One-click local start for Hei Gallery (no Docker required).
# Usage on macOS: double-click start.command, or run: ./start.sh
set -e

cd "$(dirname "$0")"

LOCAL_URL="http://localhost:6765"
PROJECT_ROOT=$(pwd -P)
echo "── Hei Gallery · one-click start (Node + SQLite, no Docker) ──"

# 1. Check Node 20+
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js is not installed."
  echo "Install Node 20 LTS from: https://nodejs.org/  (pick the 'LTS' button)"
  echo "Then double-click start.command again."
  read -n 1 -s -r -p "Press any key to close…"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $NODE_MAJOR is too old. Please install Node 20+ from https://nodejs.org/"
  read -n 1 -s -r -p "Press any key to close…"
  exit 1
fi

# 2. First-run .env with a strong auto-generated SESSION_PASSWORD
if [ ! -f .env ]; then
  echo "First run — creating .env with a secure session password…"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    PW=$(openssl rand -base64 48 | tr -d '\n')
  else
    PW=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
  fi
  awk -v pw="$PW" '/^SESSION_PASSWORD=/{print "SESSION_PASSWORD=" pw; next} {print}' .env > .env.tmp && mv .env.tmp .env
  echo "  → .env created."
fi

# Enforce local defaults every run (idempotent).
awk '
  /^PORT=/{print "PORT=6765"; next}
  /^NEXT_PUBLIC_SITE_URL=/{print "NEXT_PUBLIC_SITE_URL=http://localhost:6765"; next}
  /^DATABASE_URL=/{print "DATABASE_URL=file:../data/hei.db"; next}
  /^UPLOAD_DIR=/{print "UPLOAD_DIR=./data/uploads"; next}
  /^NODE_ENV=/{print "NODE_ENV=production"; next}
  {print}
' .env > .env.tmp && mv .env.tmp .env

mkdir -p data/uploads

# 3. Install deps (only if missing)
if [ ! -d node_modules ]; then
  echo
  echo "Installing dependencies (one-time, ~1–2 minutes)…"
  npm install --no-audit --no-fund
fi

# 4. Prisma client + SQLite schema + seed defaults
echo "Preparing database…"
npx --yes prisma generate >/dev/null
npx --yes prisma db push --skip-generate >/dev/null
npx --yes tsx prisma/seed.ts >/dev/null 2>&1 || true

# 5. Build if needed
NEEDS_BUILD=0
if [ ! -f .next/BUILD_ID ]; then
  NEEDS_BUILD=1
else
  if find src public prisma -type f -newer .next/BUILD_ID 2>/dev/null | grep -q .; then
    NEEDS_BUILD=1
  fi
  for f in next.config.mjs tsconfig.json tailwind.config.ts postcss.config.mjs package.json package-lock.json; do
    if [ -f "$f" ] && [ "$f" -nt .next/BUILD_ID ]; then
      NEEDS_BUILD=1
      break
    fi
  done
fi

if [ "$NEEDS_BUILD" = "1" ]; then
  echo "Building the site (~1 minute)…"
  npm run build
fi

# Standalone output still needs static/public assets copied into the runtime tree.
mkdir -p .next/standalone/.next
rm -rf .next/standalone/public .next/standalone/.next/static
cp -R public .next/standalone/public
cp -R .next/static .next/standalone/.next/static

# 6. Stop any previous instance on the same port
if [ -f .hei.pid ] && kill -0 "$(cat .hei.pid)" 2>/dev/null; then
  kill "$(cat .hei.pid)" 2>/dev/null || true
  sleep 1
fi
if command -v lsof >/dev/null 2>&1; then
  EXISTING=$(lsof -ti :6765 || true)
  if [ -n "$EXISTING" ]; then kill $EXISTING 2>/dev/null || true; sleep 1; fi
fi

# 7. Start the server in the background, log to file
echo
echo "Starting server on $LOCAL_URL …"
mkdir -p data
PORT=6765 HOSTNAME=0.0.0.0 NODE_ENV=production \
  DATABASE_URL="file:${PROJECT_ROOT}/data/hei.db" \
  UPLOAD_DIR="$PROJECT_ROOT/data/uploads" \
  nohup node .next/standalone/server.js \
  >> data/server.log 2>&1 &
echo $! > .hei.pid

# 8. Wait until the site is responding
echo -n "Waiting for the site to come up"
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "$LOCAL_URL"; then
    echo " — ready!"
    break
  fi
  echo -n "."
  sleep 1
done

if ! curl -sf -o /dev/null "$LOCAL_URL"; then
  echo
  echo "⚠️  Server didn't respond. Last log lines:"
  tail -n 30 data/server.log || true
  read -n 1 -s -r -p "Press any key to close…"
  exit 1
fi

echo
echo "✅ Hei Gallery is running at:  $LOCAL_URL"
echo "   First-time admin setup:   $LOCAL_URL/admin"
echo "   Server log:               data/server.log"
echo
echo "To stop the site later, double-click stop.command or run: ./stop.sh"
echo

if command -v open >/dev/null 2>&1; then
  open "$LOCAL_URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$LOCAL_URL" >/dev/null 2>&1 || true
fi
