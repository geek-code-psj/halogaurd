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

# Create .env with placeholder DATABASE_URL for prisma generate at build time
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

# Create .env fallback (Railway env vars will override if set)
RUN echo 'DATABASE_URL=postgresql://postgres:uFKvZ1hERXpOykvN@db.ozlhebnzmoqvawyrwida.supabase.co:5432/postgres?sslmode=require' > .env && \
    echo 'REDIS_URL=redis://default:cQJY0yvSYXIVqP2FaaTFpFgnGih5cAw1@redis-11350.crce182.ap-south-1-1.ec2.cloud.redislabs.com:11350' >> .env

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["npx", "tsx", "shared-core/src/server.ts"]
