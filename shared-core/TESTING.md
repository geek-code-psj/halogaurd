# HaloGuard Backend Testing Guide

This document describes the complete testing infrastructure for the HaloGuard backend.

## Test Types

### 1. Unit Tests
Located in: `src/__tests__/` (integrated with Vitest)

```bash
# Run all unit tests
npm test

# Run with coverage report
npm test -- --coverage

# Run in watch mode
npm test:watch
```

### 2. Integration & E2E Tests
File: `src/__tests__/integration.test.ts`

Includes:
- Full pipeline analysis tests
- Database storage verification
- Session management tests
- Feedback submission tests
- Batch request handling
- API statistics validation

```bash
# Run integration tests (requires running backend)
npm run dev:backend &  # Start backend in background
npm test -- integration
```

### 3. Performance Benchmarks
Included in integration tests (`src/__tests__/integration.test.ts`)

Measures:
- **P50 Latency**: Median response time (target: <150ms)
- **P90 Latency**: 90th percentile (target: <350ms)
- **P99 Latency**: 99th percentile (target: <500ms)
- **Throughput**: Requests per second with 10 concurrent users
- **Accuracy**: Detection F1-score on test dataset (target: >80%)
- **Cache Hit Rate**: Expected >70% for repeated queries

### 4. Load Tests
File: `load-test.ts` (using k6)

Simulates realistic traffic patterns:
- Gradual ramp-up from 5 to 20 virtual users
- Mixed analysis requests with feedback loop
- Real-time metric collection

#### Prerequisites

Install k6:
```bash
# Windows (requires Chocolatey)
choco install k6

# macOS
brew install k6

# Linux (Ubuntu/Debian)
sudo apt-get install k6

# Linux (Fedora/RHEL)
sudo dnf install k6
```

#### Running Load Tests

```bash
# Basic load test (uses default 5-20 VU ramp)
k6 run load-test.ts

# With custom base URL
k6 run load-test.ts -e BASE_URL=https://haloguard-api.example.com

# With detailed output
k6 run load-test.ts --verbose

# Generate JSON report
k6 run load-test.ts -o json=results.json

# Stream results to Grafana Cloud (if configured)
k6 run load-test.ts -o cloud
```

#### Load Test Output Example

```
Check                  Trend   P90   P95   Max   Failed
latency                ~200ms  310ms 380ms 420ms 0%
http_req_duration      ~180ms  290ms 360ms 400ms 0%
analyses_processed     845
errors                 0
flagged_rate           38.2%
```

### 5. Database Tests

The database is tested via integration tests. Specific validations:

```bash
# Run database-specific tests
npm test -- db

# Test with fresh database
DATABASE_URL=postgresql://... npm test
```

Validates:
- Session creation and retrieval
- Analysis result storage
- Feedback persistence
- Cache TTL enforcement
- Query performance

## Complete Testing Workflow

### Pre-Deployment Checklist

```bash
# 1. Install dependencies
npm install

# 2. Start services
npm run dev:docker  # Start PostgreSQL, Redis

# 3. Run unit tests
npm test

# 4. Run integration tests (backend must be running)
npm run dev:backend &
npm test -- integration

# 5. Run load tests
k6 run load-test.ts

# 6. Check database stats
curl http://localhost:3000/api/v1/db-stats?hours=1

# 7. Validate API health
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### Performance Optimization Tips

If benchmarks don't meet targets:

1. **High Latency (>350ms P90)**
   - Check fact-checker Wikipedia query time
   - Verify Redis connection is local/fast
   - Profile NLI model inference time
   - Consider model quantization

2. **Low Accuracy (<80%)**
   - Review fact-checker evidence gathering
   - Check NLI model version (should be microsoft/deberta-v3-small)
   - Analyze false positive patterns in feedback
   - Consider threshold tuning per issue type

3. **Cache Hit Rate <70%**
   - Verify Redis is running and connected
   - Check cache key generation consistency
   - Monitor TTL settings (currently 24h)
   - Analyze cache miss patterns

## Test Configuration

### Test Dataset (`TEST_CASES` in integration.test.ts)

Current test cases cover:
1. Factual inaccuracies (Great Wall myth)
2. Accurate scientific facts
3. Geographic errors
4. Physics facts
5. Company founding dates

To add more test cases:

```typescript
const TEST_CASES = [
  {
    content: 'Your claim here',
    expectFlagged: true|false,
    expectedSeverity: 'critical|high|medium|low|none',
    type: 'factual_inaccuracy|logical_contradiction|etc',
    description: 'Descriptive test case name'
  },
  // ... more cases
];
```

### Performance Thresholds

Edit `/src/__tests__/integration.test.ts`:

```typescript
// Change these values to adjust targets
expect(p50).toBeLessThan(150);  // P50 target
expect(p90).toBeLessThan(350);  // P90 target
expect(accuracy).toBeGreaterThan(80);  // Accuracy target
```

### Load Test Configuration

Edit `load-test.ts` `options`:

```typescript
export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Customize stages
    { duration: '1m30s', target: 10 },
    { duration: '2m', target: 20 },
    { duration: '1m30s', target: 0 },
  ],
  thresholds: {
    'latency': ['p(90) < 350'],  // Customize thresholds
  },
};
```

## Continuous Integration

### GitHub Actions Workflow

Add `.github/workflows/test.yml`:

```yaml
name: Test & Benchmark

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run db:migrate:deploy
      - run: npm test
      - run: npm run build
```

## Metrics & Monitoring

### Real-time Metrics

Backend provides live metrics at:

```bash
# API statistics (last 24 hours)
curl http://localhost:3000/api/v1/db-stats?hours=24

# Session analytics
curl http://localhost:3000/api/v1/sessions/{sessionId}/analytics

# Health status
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### Prometheus Metrics (Optional)

Enable in `.env`:
```
PROMETHEUS_ENABLED=true
```

Access at: `http://localhost:3000/metrics`

## Troubleshooting

### Tests Fail with "Connection Refused"

```bash
# Check if backend is running
curl http://localhost:3000/health

# Start backend if needed
npm run dev:backend
```

### Database Tests Fail

```bash
# Check PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1"

# Run migrations
npm run db:migrate:deploy

# Seed test data
npm run db:seed
```

### Load Test Errors

```bash
# Check k6 memory usage
k6 run load-test.ts --no-summary

# Reduce VU count if memory constrained
# Edit load-test.ts stages: target: 5 → target: 2
```

## Success Criteria

✅ All tests pass
- Unit tests: 100% pass rate
- Integration tests: 100% pass rate
- Performance tests: P90 < 350ms
- Accuracy tests: >80% F1-score
- Load tests: <1% error rate at peak load

✅ Performance benchmarks met
- Latency: P50<150ms, P90<350ms, P99<500ms
- Throughput: >10 requests/sec per VU
- Cache Hit Rate: >70%
- Database: <50ms query time

✅ No blocking issues
- All database migrations successful
- Redis cache operational
- Python NLI service responsive
- Wikipedia API accessible

Once all criteria met, backend is production-ready! 🚀
