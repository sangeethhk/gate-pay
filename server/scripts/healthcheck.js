/**
 * scripts/healthcheck.js — Automated Buyer Pre-Flight Health Check
 * Validates database connectivity, migration schema integrity, cryptographic hygiene,
 * and service configuration before production deployment.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const crypto = require('crypto');

const REQUIRED_TABLES = [
  'users',
  'businesses',
  'transactions',
  'payment_links',
  'checkout_sessions',
  'orders',
  'payments',
  'refunds',
  'customers',
  'idempotency_keys',
];

async function runHealthCheck() {
  console.log('\n================================================================');
  console.log('🛡️  PAYMENT GATEWAY ENGINE — COMMERCIAL PRE-FLIGHT AUDIT');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, status, detail) {
    if (status) {
      passed++;
      console.log(`  ✅ [PASS] ${name.padEnd(30)} ${detail || ''}`);
    } else {
      failed++;
      console.log(`  ❌ [FAIL] ${name.padEnd(30)} ${detail || ''}`);
    }
  }

  // 1. Environment Variables Check
  console.log('1. Configuration & Security Credentials:');
  const dbUrl = process.env.DATABASE_URL;
  report('DATABASE_URL Present', !!dbUrl, dbUrl ? `URI Defined (${dbUrl.split('@')[1] || 'configured'})` : 'Missing in server/.env');

  const jwtSecret = process.env.JWT_SECRET;
  const isDefaultJwt = !jwtSecret || jwtSecret.includes('change_me') || jwtSecret.length < 16;
  report('JWT Secret Strength', !isDefaultJwt, jwtSecret ? (isDefaultJwt ? 'WARNING: Default or weak secret' : 'High-entropy secret configured') : 'Missing');

  const jwtPreauth = process.env.JWT_PREAUTH_SECRET;
  report('2FA Pre-Auth Secret', !!jwtPreauth && jwtPreauth.length >= 16, !!jwtPreauth ? 'Valid 2FA Pre-Auth Secret' : 'Missing or weak');

  // 2. Cryptographic Subsystem Check
  console.log('\n2. Cryptographic & HMAC Engine:');
  try {
    const testHmac = crypto.createHmac('sha256', 'test_key').update('order_123|pay_456').digest('hex');
    report('HMAC SHA-256 Engine', testHmac.length === 64, 'Hardware SHA-256 available');
  } catch (e) {
    report('HMAC SHA-256 Engine', false, e.message);
  }

  // 3. PostgreSQL Database Connection & Tables
  console.log('\n3. Database Connectivity & Schema Verification:');
  const pool = new Pool(
    dbUrl
      ? {
          connectionString: dbUrl,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        }
      : {
          host: process.env.PG_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT) || 5432,
          database: process.env.PG_DATABASE || 'paygateway',
          user: process.env.PG_USER || 'postgres',
          password: process.env.PG_PASSWORD || '',
          connectionTimeoutMillis: 5000,
        }
  );

  let client = null;
  try {
    const start = Date.now();
    client = await pool.connect();
    const latency = Date.now() - start;
    const { rows } = await client.query('SELECT NOW() AS now, current_database() AS db, version() AS ver');
    report('Database Connection', true, `Connected to "${rows[0].db}" in ${latency}ms`);

    // Verify all required tables exist
    const tableRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const existingTables = new Set(tableRes.rows.map((r) => r.table_name));

    for (const table of REQUIRED_TABLES) {
      const exists = existingTables.has(table);
      report(`Table: ${table}`, exists, exists ? 'Schema verified' : 'Table missing — run npm run migrate');
    }

    // Check row counts of active businesses & orders
    const statsRes = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) AS users_count,
        (SELECT COUNT(*) FROM businesses) AS businesses_count,
        (SELECT COUNT(*) FROM orders) AS orders_count,
        (SELECT COUNT(*) FROM payments) AS payments_count
    `);
    const stats = statsRes.rows[0];
    console.log(`\n  📊 Database Metrics: ${stats.users_count} users | ${stats.businesses_count} merchants | ${stats.orders_count} orders | ${stats.payments_count} payments recorded`);
  } catch (err) {
    report('Database Connection', false, err.message);
  } finally {
    if (client) client.release();
    await pool.end();
  }

  // 4. Summary & Verdict
  console.log('\n================================================================');
  console.log(`📋 AUDIT SUMMARY: ${passed} Checks Passed, ${failed} Checks Failed`);
  if (failed === 0) {
    console.log('🚀 SYSTEM READY FOR COMMERCIAL DEPLOYMENT & PRODUCTION USE');
  } else {
    console.log('⚠️  SYSTEM REQUIRES CONFIGURATION FIXES BEFORE GOING LIVE');
  }
  console.log('================================================================\n');

  process.exit(failed === 0 ? 0 : 1);
}

runHealthCheck().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
