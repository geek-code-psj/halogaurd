# HaloGuard Error Log & Resolution Tracker

**Purpose**: Track all errors encountered during development with root causes and fixes  
**Updated**: Continuously as we progress  
**Review**: Weekly during standups

---

## Phase 0 Errors (Apr 1-12)

### ✅ RESOLVED ERRORS

#### ERROR #1: Redis Client Incompatibility
- **Date Found**: Apr 6
- **Error Message**: `defineCommand is not a function`
- **Component**: BullMQ queue initialization
- **Root Cause**: redis@4.6.12 incompatible with BullMQ v4.14.0 API
- **Severity**: 🔴 CRITICAL (blocks queue operations)
- **Fix**: Replaced redis package with ioredis@5.3.2
- **Changes**: 
  - Updated package.json dependency
  - Changed method calls: hSet→hset, hGet→hget, lPush→lpush
- **Test**: Run `npm run dev:backend` and verify "✅ BullMQ initialized"
- **Status**: ✅ COMPLETE (Apr 6)
- **Time to Fix**: ~2 hours
- **Reference**: Issue tracking - Redis BullMQ compatibility

---

#### ERROR #2: Prisma Module Load Failure
- **Date Found**: Apr 7
- **Error Message**: `PrismaClient cannot be instantiated`
- **Component**: shared-core/src/db.ts
- **Root Cause**: Eager initialization before DATABASE_URL environment variable loaded
- **Severity**: 🔴 CRITICAL (blocks database operations)
- **Fix**: Implemented lazy-loading Proxy pattern
- **Changes**:
  - Replaced `const prisma = new PrismaClient()` with lazy singleton pattern
  - Added `getPrismaClient()` function called on first access
  - Deferred client creation until after env vars loaded
- **Code Pattern Used**:
  ```typescript
  const prismaProxy = new Proxy({}, {
    get: (target, prop) => getPrismaClient()[prop]
  });
  ```
- **Test**: `npm run dev:backend` boots without errors
- **Status**: ✅ COMPLETE (Apr 7)
- **Time to Fix**: ~1 hour
- **Reference**: Lazy initialization pattern docs

---

#### ERROR #3: BullMQ Initialization Race Condition
- **Date Found**: Apr 7
- **Error Message**: `Cannot read property 'on' of undefined` (queues null)
- **Component**: Queue initialization in server.ts
- **Root Cause**: BullMQ queues created before Redis connection ready
- **Severity**: 🟡 HIGH (blocks async processing)
- **Fix**: Moved queue creation to `initializeBullMQQueues()` function
- **Changes**:
  - Added wait loop: redis.ping() retry up to 30s
  - Only create queues after redis.ping() succeeds
  - Added explicit success logging
- **Code Pattern**:
  ```typescript
  let retries = 0;
  while (retries < 30) {
    try {
      await redis.ping();
      await initializeBullMQQueues(); // AFTER ping succeeds
      break;
    } catch (e) {
      retries++;
      await delay(1000);
    }
  }
  ```
- **Test**: Check /ready endpoint shows `"bullmq":"ready"`
- **Status**: ✅ COMPLETE (Apr 7)
- **Time to Fix**: ~1.5 hours
- **Reference**: BullMQ + Redis initialization sequence

---

#### ERROR #4: Database Connection Timeout
- **Date Found**: Apr 8
- **Error Message**: `Can't reach db.ozlhebnzmoqvawyrwida.supabase.co:5432`
- **Component**: Prisma connection string (Supabase direct endpoint)
- **Root Cause**: Direct Supabase endpoint has strict connection pool limits (~100 connections)
- **Severity**: 🔴 CRITICAL (blocks database access)
- **Fix**: Switched to Supabase connection pooler endpoint
- **Changes**:
  - Old: `postgresql://[user]@db.ozlhebnzmoqvawyrwida.supabase.co:5432/postgres`
  - New: `postgresql://[user]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`
  - Regional AWS pooler endpoint with unlimited connections
- **Test**: `npm run dev:backend` connects successfully, /ready shows `"database":"connected"`
- **Status**: ✅ COMPLETE (Apr 8)
- **Time to Fix**: ~30 minutes
- **Reference**: Supabase pooler configuration docs

---

#### ERROR #5: Database Migrations Not Applied
- **Date Found**: Apr 8
- **Error Message**: `relation "public.sessions" does not exist`
- **Component**: Prisma schema tables not created in database
- **Root Cause**: Migrations not executed on Railway container startup
- **Severity**: 🔴 CRITICAL (schema missing)
- **Fix**: Added `prisma migrate deploy` to Dockerfile entrypoint
- **Changes**:
  - Modified Dockerfile entrypoint script
  - Runs: `cd /app/shared-core && npx prisma migrate deploy` before server start
  - All 12 tables created on first container run
- **Test**: Connect to database and verify: `SELECT table_name FROM information_schema.tables`
- **Status**: ✅ COMPLETE (Apr 8)
- **Time to Fix**: ~45 minutes
- **Reference**: Dockerfile entrypoint with migrations

---

### 🟡 IN-PROGRESS ERRORS

#### ERROR #6: POST /api/v1/sessions Returns 500
- **Date Found**: Apr 9
- **Error Message**: `{"error":"Failed to create session"}` - HTTP 500
- **Component**: POST /api/v1/sessions endpoint → getOrCreateSession() database function
- **Root Cause**: Unknown (investigating - likely database operation failure)
- **Severity**: 🔴 CRITICAL (blocking session creation)
- **Symptoms**:
  - GET /health: ✅ Works
  - GET /ready: ✅ Works (reports database:"connected")
  - POST /api/v1/sessions: ❌ HTTP 500
  - Error logs don't show specific error message
- **Investigation Done**:
  - ✅ Verified database connection pooler working
  - ✅ Verified migrations applied (all 12 tables exist)
  - ✅ Verified backend code has getOrCreateSession() function
  - ✅ Reviewed function logic (appears correct)
  - ⏳ Need to enable verbose logging to see actual error
- **Hypothesis**:
  1. Lazy Prisma proxy not properly initialized by time POST request arrives
  2. Database connection drops before write operation
  3. Missing unique constraint validation in Prisma schema
  4. Timeout in database write operation
- **Action Items**:
  - [ ] Check Railway logs for specific error messages
  - [ ] Add console.log() debugging in getOrCreateSession()
  - [ ] Enable verbose Prisma logging: `PrismaClient({ log: ['query', 'error'] })`
  - [ ] Test directly with psql to verify schema
  - [ ] If still broken: Roll back to previous commit
- **Test Plan**:
  ```bash
  curl -X POST http://localhost:8080/api/v1/sessions \
    -H "Content-Type: application/json" \
    -d '{"platform":"test","tabId":1}'
  # Should return: {"sessionId":"...", "createdAt":"..."}
  # Currently returns: {"error":"Failed to create session"} 500
  ```
- **Status**: 🟡 INVESTIGATING (Apr 9)
- **Time Spent**: ~2 hours
- **Next Review**: Apr 10 morning

---

#### ERROR #7: POST /api/v1/analyze Returns 500
- **Date Found**: Apr 9
- **Error Message**: `{"error":"Internal server error"}` - HTTP 500
- **Component**: POST /api/v1/analyze endpoint → runDetectionPipeline() execution
- **Root Cause**: Unknown (likely pipeline import or execution failure)
- **Severity**: 🔴 CRITICAL (blocking core detection)
- **Symptoms**:
  - Same as ERROR #6 - POST fails with 500
  - No specific error in logs
- **Investigation Done**:
  - ✅ Verified all tier files exist (tier0-4.ts)
  - ✅ Verified imports are syntactically correct
  - ✅ Verified runDetectionPipeline() function exists
  - ✅ Verified function signature matches endpoints expected call
  - ⏳ Need to enable detailed error logging
- **Hypothesis**:
  1. Dynamic import issue in runDetectionPipeline() function
  2. Cache/timeout in detection tiers
  3. Missing dependency in one of tier files
  4. Async/await execution issue in pipeline
- **Action Items**:
  - [ ] Enable verbose logging in detector/index.ts
  - [ ] Add try-catch with detailed error messages
  - [ ] Test detection pipeline directly: `npm run test` to verify all tiers
  - [ ] Check if issue is specific to pipeline or general endpoint issue
- **Test Plan**:
  ```bash
  curl -X POST http://localhost:8080/api/v1/analyze \
    -H "Content-Type: application/json" \
    -d '{"content":"You are absolutely right!","model":"gpt-4"}'
  # Should return: {"score":0.85,"flagged":true,"issues":[...]}
  # Currently returns: {"error":"Internal server error"} 500
  ```
- **Status**: 🟡 INVESTIGATING (Apr 9)
- **Time Spent**: ~1.5 hours
- **Next Review**: Apr 10 morning

---

## Phase 1 Errors (Apr 13+)

*Will be filled as Phase 1 begins*

---

## Error Statistics

### Summary by Phase
| Phase | Total | Resolved | In Progress | Success Rate |
|-------|-------|----------|-------------|--------------|
| Phase 0 | 7 | 5 | 2 | 71% |
| Phase 1 | - | - | - | - |
| Phase 2 | - | - | - | - |

### Summary by Severity
| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL | 7 | 5 resolved, 2 investigating |
| 🟡 HIGH | 0 | - |
| 🟢 MEDIUM | 0 | - |

### Error Categories
| Category | Count |
|----------|-------|
| Dependency/Package Compatibility | 1 |
| Module Initialization Order | 2 |
| Connection/Network | 2 |
| Database/Schema | 1 |
| API Endpoint Logic | 1 |

### Time to Resolution (Resolved Errors Only)
| Error | Time | Status |
|-------|------|--------|
| #1 Redis | 2 hrs | ✅ |
| #2 Prisma | 1 hr | ✅ |
| #3 BullMQ | 1.5 hrs | ✅ |
| #4 DB Connection | 0.5 hrs | ✅ |
| #5 Migrations | 0.75 hrs | ✅ |
| **Average** | **1.15 hrs** | ✅ |

---

## Common Troubleshooting Guide

### "Backend won't start"
**Check**:
1. `docker-compose up -d` - all services running?
2. `docker-compose logs backend` - any errors?
3. `echo $DATABASE_URL` - env var set?
4. `npm run dev:backend` - syntax errors?

**Fix**:
- Stop all: `docker-compose down`
- Clean: `rm -rf node_modules && npm install`
- Restart: `docker-compose up -d`

### "Cannot connect to database"
**Check**:
1. Is Supabase connection string correct? (should use pooler endpoint)
2. Is DATABASE_URL set in .env?
3. Can you ping the database? `psql $DATABASE_URL -c "SELECT 1"`
4. Are migrations applied? `psql $DATABASE_URL -c "SELECT * FROM sessions"`

**Fix**:
- Verify pooler endpoint: `aws-1-ap-northeast-2.pooler.supabase.com`
- Check password doesn't have special characters
- Force re-apply migrations: `npx prisma migrate deploy --skip-generate`

### "Redis not connecting"
**Check**:
1. Is REDIS_URL set?
2. Can you connect? `redis-cli -u $REDIS_URL ping`
3. Is ioredis installed (not redis)? `npm ls | grep ioredis`

**Fix**:
- Reinstall: `npm install ioredis --save`
- Verify Redis Labs URL format
- Check firewall/IP whitelist on RedisLabs dashboard

### "BullMQ queues not initializing"
**Check**:
1. Is Redis connected first?
2. Check logs: "✅ BullMQ initialized"?
3. Are queue names correct?

**Fix**:
- Ensure Redis connection works before BullMQ init
- Check for typos in queue names
- Review `initializeBullMQQueues()` function order

### "POST endpoints return 500"
**Check**:
1. GET endpoints work? (test /health and /ready first)
2. Check logs: `docker-compose logs backend | tail -20`
3. Try direct database query: `psql $DATABASE_URL`

**Fix**:
- Enable verbose logging in server.ts
- Add console.log() before/after database operations
- Check if database tables exist: `psql $DATABASE_URL -c "\dt"`

---

## Debugging Commands

### Backend Logs
```bash
# Docker local
docker-compose logs backend -f

# Railway production
railway logs -f

# Verbose mode
LOG_LEVEL=debug npm run dev:backend
```

### Database Inspection
```bash
# Connect to database
psql $DATABASE_URL

# List tables
\dt

# Check sessions table
SELECT * FROM sessions LIMIT 5;

# Check analysis results
SELECT * FROM analysis_results LIMIT 5;
```

### API Testing
```bash
# Test health
curl http://localhost:8080/health

# Test ready
curl http://localhost:8080/ready

# Test analyze (fails now)
curl -X POST http://localhost:8080/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"content":"Test","model":"gpt-4"}'

# Test with verbose
curl -v http://localhost:8080/health
```

### Build & Deploy
```bash
# Build Docker image
docker build -t haloguard:latest .

# Test locally
docker run -p 8080:8080 haloguard:latest

# Push to Railway (auto-deploy on git push)
git add .
git commit -m "Fix: ..."
git push

# Check Railway status
railway logs
railway status
```

---

## Lessons Learned

### ✅ What Worked
1. Lazy-loading Proxy pattern for Prisma - prevents module load errors
2. Re-trying with backoff for connections - handles transient failures
3. Using Supabase pooler instead of direct endpoint - solves connection limits
4. Running migrations in Dockerfile entrypoint - schema always ready on startup
5. Switching to ioredis from redis package - solved BullMQ compatibility

### ❌ What Didn't Work
1. Eager initialization of services - caused race conditions
2. Direct database connection - too restrictive for Railway deployment
3. Not running migrations explicitly - schema wasn't created

### 💡 Lessons for Future
1. Always use lazy initialization for services with env dependencies
2. Always run migrations explicitly in deployment (don't rely on auto)
3. Test connection pooler endpoints early in development
4. Keep verbose logs enabled in production for debugging
5. Implement health checks to catch issues early (/health, /ready endpo ints)

---

## Next Error Prevention

### For Phase 1 (Chrome Extension)
- [ ] Test CSP violations early
- [ ] Test on different ChatGPT versions
- [ ] Test with real network latency (simulate slow API)
- [ ] Build error handling for API timeouts

### For Phase 2 (VS Code Extension)
- [ ] Test WebView rendering
- [ ] Test extension activation events
- [ ] Test with large code files
- [ ] Build error handling for missing Pylance

### For Phase 3-4
- [ ] Load test database with 10K concurrent users
- [ ] Load test WebSocket connections
- [ ] Test rate limiting
- [ ] Monitor memory usage over time

---

**Owner**: Development Team  
**Last Updated**: April 9, 2026  
**Review Cycle**: Weekly (every Monday AM)  
**Escalation**: If error unresolved >4 hours, escalate to team lead
