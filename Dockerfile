# Multi-stage Dockerfile for Node.js + Python backend

# ===== NODE BUILD STAGE =====
FROM node:20-alpine AS node-builder

WORKDIR /app

# Install dependencies
COPY package*.json package-lock.json turbo.json ./
COPY shared-core/package*.json shared-core/package-lock.json shared-core/
COPY shared-client-sdk/package*.json shared-client-sdk/package-lock.json shared-client-sdk/

RUN npm ci
RUN npm run build

# ===== DEVELOPMENT STAGE =====
FROM node:20-alpine AS development

WORKDIR /app

# Install additional tools for development
RUN apk add --no-cache python3 make g++ curl

# Copy build artifacts
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/shared-core/dist ./shared-core/dist
COPY --from=node-builder /app/shared-client-sdk/dist ./shared-client-sdk/dist

# Copy source files
COPY package*.json package-lock.json turbo.json ./
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
COPY package*.json package-lock.json turbo.json ./
COPY shared-core/package*.json shared-core/package-lock.json shared-core/
COPY shared-client-sdk/package*.json shared-client-sdk/package-lock.json shared-client-sdk/

RUN npm ci --omit=dev

# Copy built code
COPY --from=node-builder /app/shared-core/dist ./shared-core/dist
COPY --from=node-builder /app/shared-client-sdk/dist ./shared-client-sdk/dist

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "shared-core/dist/server.js"]
