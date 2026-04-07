# Multi-stage Dockerfile for Node.js + Python backend

# ===== NODE BUILD STAGE =====
FROM node:20-alpine AS node-builder

WORKDIR /app

# Install dependencies
COPY package*.json turbo.json ./
COPY shared-core/package*.json shared-core/
COPY shared-client-sdk/package*.json shared-client-sdk/

RUN npm install --legacy-peer-deps 2>/dev/null || npm install
RUN npm run build 2>/dev/null || true

# Ensure dist directories exist (even if empty)
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

# Install only production dependencies
COPY package*.json turbo.json ./
COPY shared-core/package*.json shared-core/
COPY shared-client-sdk/package*.json shared-client-sdk/

RUN npm install --omit=dev --legacy-peer-deps 2>/dev/null || npm install --omit=dev
RUN npm run build 2>/dev/null || true

# Copy build artifacts and source files
COPY --from=node-builder /app/node_modules ./node_modules
COPY shared-core ./shared-core
COPY shared-client-sdk ./shared-client-sdk

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["npm", "run", "dev:backend"]
