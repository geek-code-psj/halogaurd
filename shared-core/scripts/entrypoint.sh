#!/bin/sh
# HaloGuard Production Entrypoint
# Validates environment and runs database migrations before starting server

set -e

echo "================================================"
echo "HaloGuard Production Entrypoint"
echo "================================================"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Validate DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "[FATAL] DATABASE_URL environment variable is NOT set"
  exit 1
fi
echo "[OK] DATABASE_URL is configured"

# Validate REDIS_URL  
if [ -z "$REDIS_URL" ]; then
  echo "[FATAL] REDIS_URL environment variable is NOT set"
  exit 1
fi
echo "[OK] REDIS_URL is configured"

# Check if Prisma CLI is available
if ! command -v npx &> /dev/null; then
  echo "[FATAL] npx command not found"
  exit 1
fi
echo "[OK] npx is available"

# Run database migrations
echo "================================================"
echo "Running Prisma migrations..."
echo "================================================"

cd /app/shared-core
pwd
ls -la prisma/ 2>/dev/null || echo "  (prisma dir not visible)"

# Run migration with explicit error handling
if npx prisma migrate deploy --skip-generate; then
  echo "[SUCCESS] Migrations completed"
else
  EXIT_CODE=$?
  echo "[FATAL] Prisma migration failed with exit code $EXIT_CODE"
  exit 1
fi

echo "================================================"
echo "Starting HaloGuard server..."
echo "================================================"

cd /app

# Start the server
exec npx tsx shared-core/src/server.ts
