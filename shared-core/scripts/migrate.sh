#!/bin/sh
# HaloGuard Migration Runner
# Ensures database schema is initialized before server starts

set -e  # Exit on any error

echo "================================"
echo "HaloGuard Database Migration"
echo "================================"

# Check environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "[ERROR] DATABASE_URL is not set"
  exit 1
fi

echo "[INFO] Running Prisma migrations..."
cd /app/shared-core

# Run migrations with error handling
if npx prisma migrate deploy --skip-generate 2>&1; then
  echo "[SUCCESS] Migrations completed successfully"
else
  MIGRATE_EXIT=$?
  echo "[ERROR] Prisma migration failed with exit code $MIGRATE_EXIT"
  echo "[ERROR] Database tables may not exist"
  exit 1
fi

# Verify schema exists by checking if session table exists
echo "[INFO] Verifying schema..."
if npx prisma db execute --stdin < /dev/null 2>&1 | grep -q "sessions"; then
  echo "[SUCCESS] Schema verified - sessions table exists"
elif npx prisma introspect 2>&1 | grep -q "sessions"; then
  echo "[SUCCESS] Schema verified - sessions table found via introspection"
else
  echo "[WARN] Could not verify sessions table exists, but migration completed"
fi

echo "[SUCCESS] Database initialization complete"
exit 0
