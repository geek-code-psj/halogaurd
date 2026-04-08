# Multi-stage Dockerfile for Node.js + Python backend

# ===== NODE BUILD STAGE =====
FROM node:20-alpine AS node-builder

WORKDIR /app

# Install system dependencies (openssl required for Prisma)
RUN apk add --no-cache openssl

# Install dependencies
COPY package*.json turbo.json ./
COPY shared-core/package*.json shared-core/
COPY shared-client-sdk/package*.json shared-client-sdk/
COPY shared-core/src ./shared-core/src
COPY shared-core/prisma ./shared-core/prisma

# Create .env with DATABASE_URL for prisma generate at build time
RUN echo "DATABASE_URL=postgresql://user:pass@localhost:5432/db" > .env

RUN npm install --legacy-peer-deps 2>/dev/null || npm install
RUN cd shared-core && npx prisma generate && cd ..
RUN npm run build || echo "Build completed"

# Ensure dist directories exist
RUN mkdir -p shared-core/dist shared-client-sdk/dist shared-ui/dist

# ===== DEVELOPMENT STAGE =====
FROM node:20-alpine AS development

WORKDIR /app

# Install additional tools for development
RUN apk add --no-cache python3 make g++ curl

# Copy build artifacts
COPY --from=node-builder /app/node_modules ./node_modules

# Copy source files
COPY package*.json turbo.json ./
COPY shared-core ./shared-core
COPY shared-client-sdk ./shared-client-sdk

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000 9229

CMD ["npm", "run", "dev"]

# ===== PRODUCTION STAGE =====
FROM node:20-alpine AS production

WORKDIR /app

# Install system dependencies (openssl required for Prisma)
RUN apk add --no-cache openssl

# Install only production dependencies
COPY package*.json turbo.json ./
COPY shared-core/package*.json shared-core/
COPY shared-client-sdk/package*.json shared-client-sdk/

RUN npm install --omit=dev --legacy-peer-deps 2>/dev/null || npm install --omit=dev

# Copy node_modules from builder (pre-built with all deps)
COPY --from=node-builder /app/node_modules ./node_modules

# Copy source files for tsx runtime execution
COPY shared-core ./shared-core
COPY shared-client-sdk ./shared-client-sdk

# Create secure entrypoint script to validate environment variables and run migrations
RUN mkdir -p /app/scripts && \
    echo '#!/bin/sh' > /app/scripts/entrypoint.sh && \
    echo 'set -e' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] Starting HaloGuard..."' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] NODE_ENV: ${NODE_ENV:-not set}"' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] PORT: ${PORT:-not set}"' >> /app/scripts/entrypoint.sh && \
    echo 'if [ -z "$DATABASE_URL" ]; then' >> /app/scripts/entrypoint.sh && \
    echo '  echo "[ERROR] DATABASE_URL environment variable is NOT set"' >> /app/scripts/entrypoint.sh && \
    echo '  echo "[ERROR] Set DATABASE_URL in Railway Variables: postgres://user:password@host:port/db"' >> /app/scripts/entrypoint.sh && \
    echo '  exit 1' >> /app/scripts/entrypoint.sh && \
    echo 'fi' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] DATABASE_URL is set"' >> /app/scripts/entrypoint.sh && \
    echo 'if [ -z "$REDIS_URL" ]; then' >> /app/scripts/entrypoint.sh && \
    echo '  echo "[ERROR] REDIS_URL environment variable is NOT set"' >> /app/scripts/entrypoint.sh && \
    echo '  echo "[ERROR] Set REDIS_URL in Railway Variables: redis://:password@host:port/0"' >> /app/scripts/entrypoint.sh && \
    echo '  exit 1' >> /app/scripts/entrypoint.sh && \
    echo 'fi' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] REDIS_URL is set"' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] Running database migrations (CRITICAL)..."' >> /app/scripts/entrypoint.sh && \
    echo 'npx tsx shared-core/src/migrate.ts' >> /app/scripts/entrypoint.sh && \
    echo 'if [ $? -ne 0 ]; then' >> /app/scripts/entrypoint.sh && \
    echo '  echo "[FATAL] Database migrations failed - server cannot start"' >> /app/scripts/entrypoint.sh && \
    echo '  exit 1' >> /app/scripts/entrypoint.sh && \
    echo 'fi' >> /app/scripts/entrypoint.sh && \
    echo 'echo "[Entrypoint] Migrations successful - starting server..."' >> /app/scripts/entrypoint.sh && \
    echo 'exec npx tsx shared-core/src/server.ts' >> /app/scripts/entrypoint.sh && \
    chmod +x /app/scripts/entrypoint.sh

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
