#!/usr/bin/env tsx
/**
 * HaloGuard Database Migration Runner
 * 
 * MUST run before server starts to ensure database schema is present.
 * Exits with error code 1 if migrations fail - does not allow silent failures.
 */

import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';

const TIMEOUT_MS = 60000; // 60 second timeout

// Color codes for console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [MIGRATE]`;
  
  switch (level) {
    case 'success':
      console.log(`${colors.green}${prefix} ✓ ${message}${colors.reset}`);
      break;
    case 'error':
      console.error(`${colors.red}${prefix} ✗ ${message}${colors.reset}`);
      break;
    case 'warn':
      console.warn(`${colors.yellow}${prefix} ⚠ ${message}${colors.reset}`);
      break;
    default:
      console.log(`${colors.blue}${prefix} → ${message}${colors.reset}`);
  }
}

async function validateEnvironment(): Promise<boolean> {
  log('Validating environment variables...');
  
  if (!process.env.DATABASE_URL) {
    log('DATABASE_URL not set', 'error');
    log('Set DATABASE_URL in Railway Variables: postgres://user:password@host:port/db', 'error');
    return false;
  }
  
  const url = process.env.DATABASE_URL;
  const masked = url.replace(/:.*@/, ':***@');
  log(`DATABASE_URL is set: ${masked}`, 'success');
  
  // Validate it looks like a PostgreSQL connection string
  if (!url.includes('postgres') && !url.includes('postgresql')) {
    log('DATABASE_URL does not appear to be PostgreSQL', 'error');
    return false;
  }
  
  return true;
}

async function runMigrationsViaCommand(): Promise<boolean> {
  return new Promise((resolve) => {
    log('Running: npx prisma migrate deploy');
    
    const migrate = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      log('Migration timed out (60s)', 'error');
      migrate.kill();
    }, TIMEOUT_MS);
    
    migrate.on('close', (code) => {
      clearTimeout(timeout);
      
      if (timedOut) {
        resolve(false);
        return;
      }
      
      if (code === 0) {
        log('Migrations completed successfully', 'success');
        resolve(true);
      } else {
        log(`Migrations failed with exit code ${code}`, 'error');
        resolve(false);
      }
    });
    
    migrate.on('error', (err) => {
      clearTimeout(timeout);
      log(`Migration process error: ${err.message}`, 'error');
      resolve(false);
    });
  });
}

async function testDatabaseConnection(): Promise<boolean> {
  log('Testing database connection with Prisma...');
  
  try {
    const prisma = new PrismaClient({
      errorFormat: 'pretty',
    });
    
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 as connected`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timeout')), 10000)
      ),
    ]);
    
    await prisma.$disconnect();
    log('Database connection successful', 'success');
    return true;
  } catch (error: any) {
    log(`Database connection failed: ${error?.message || String(error)}`, 'error');
    return false;
  }
}

async function verifyTablesExist(): Promise<boolean> {
  log('Verifying that database tables exist...');
  
  try {
    const prisma = new PrismaClient();
    
    // Try to count sessions table (should exist after migration)
    const count = await prisma.session.count();
    log(`Sessions table exists (${count} records)`, 'success');
    
    await prisma.$disconnect();
    return true;
  } catch (error: any) {
    log(`Table verification failed: ${error?.message || String(error)}`, 'error');
    return false;
  }
}

async function main() {
  log('Starting HaloGuard database migration...');
  log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    // Step 1: Validate environment
    const envValid = await validateEnvironment();
    if (!envValid) {
      log('Environment validation failed - cannot proceed', 'error');
      process.exit(1);
    }
    
    // Step 2: Test connection
    const connected = await testDatabaseConnection();
    if (!connected) {
      log('Database connection test failed - cannot proceed', 'error');
      process.exit(1);
    }
    
    // Step 3: Run migrations
    const migrationsRan = await runMigrationsViaCommand();
    if (!migrationsRan) {
      log('Migrations failed - cannot proceed', 'error');
      process.exit(1);
    }
    
    // Step 4: Verify tables exist
    const tablesExist = await verifyTablesExist();
    if (!tablesExist) {
      log('Database tables not found after migration - migration may have failed silently', 'error');
      process.exit(1);
    }
    
    log('✅ All migration checks passed - database is ready', 'success');
    process.exit(0);
    
  } catch (error: any) {
    log(`Unexpected error: ${error?.message || String(error)}`, 'error');
    if (error?.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migrations
main().catch((error) => {
  log(`Fatal error: ${error?.message || String(error)}`, 'error');
  process.exit(1);
});
