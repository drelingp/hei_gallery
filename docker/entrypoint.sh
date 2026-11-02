#!/bin/sh
set -e

# Wait for Postgres if DATABASE_URL points at the bundled db service.
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy || {
    echo "Migration failed; will retry once after 5s..."
    sleep 5
    npx prisma migrate deploy
  }
fi

exec "$@"
