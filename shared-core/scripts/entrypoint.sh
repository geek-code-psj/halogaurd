#!/bin/sh
# HaloGuard Production Entrypoint
# Validates environment and runs database migrations before starting server

set -e

echo "================================================"
echo "HaloGuard Production Entrypoint"
echo "================================================"

# Validate DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "[ERROR] DATABASE_URL environment variable is NOT set"
  echo "[ERROR] Set DATABASE_URL in Railway Variables"
  exit 1
fi

echo "[INFO] DATABASE_URL is set ✓"

# Validate REDIS_URL  
if [ -z "$REDIS_URL" ]; then
  echo "[ERROR] REDIS_URL environment variable is NOT set"
  echo "[ERROR] Set REDIS_URL in Railway Variables"
  exit 1
fi

echo "[INFO] REDIS_URL is set ✓"

# Run database migrations BEFORE server starts
echo "[INFO] Starting database migrations..."
echo "[INFO] Command: cd /app/shared-core && npx prisma migrate deploy"

cd /app/shared-core

if npx prisma migrate deploy --skip-generate; then
  echo "[SUCCESS] ✅ Migrations completed successfully"
else
  MIGRATE_EXIT=$?
  echo "[ERROR] ❌ Migrations failed with exit code: $MIGRATE_EXIT"
  echo "[ERROR] Database schema was not applied - cannot start server"
  exit 1
fi

# Verify tables were created
echo "[INFO] Verifying database schema..."
cd /app

if npx tsx shared-core/src/migrate.ts; then
  echo "[SUCCESS] ✅ Schema verification passed"
else
  echo "[WARN] ⚠️  Schema verification had issues but starting server"
fi

echo "[INFO] Starting HaloGuard server..."
echo "================================================"

# Start the actual server
exec npx tsx shared-core/src/server.ts
