require('dotenv').config();
const { Pool } = require('pg');

// ─── Connection Pool ──────────────────────────────────────────────────────────
// Uses DATABASE_URL if set (Render, Railway, Supabase, etc.)
// Otherwise falls back to individual PG_* env vars (local dev)

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // Supabase & most cloud providers require SSL with self-signed certs
        ssl: { rejectUnauthorized: false },
        max: 20,               // max connections in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
    : {
        host:     process.env.PG_HOST     || 'localhost',
        port:     parseInt(process.env.PG_PORT) || 5432,
        database: process.env.PG_DATABASE || 'paygateway',
        user:     process.env.PG_USER     || 'postgres',
        password: process.env.PG_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);

// Log pool errors (never crash the process on pool-level errors)
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// ─── Helper: run a query ──────────────────────────────────────────────────────

/**
 * Execute a parameterized query.
 * @param {string} text  — SQL with $1, $2 ... placeholders
 * @param {Array}  params — parameter values
 * @returns {Promise<pg.QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

/**
 * Get a dedicated client for transactions (BEGIN / COMMIT / ROLLBACK).
 */
const getClient = () => pool.connect();

// ─── Test connection on startup ───────────────────────────────────────────────

const testConnection = async () => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now, version() AS pg_version');
    console.log('✅ PostgreSQL connected:', rows[0].now);
    console.log('   Version:', rows[0].pg_version.split(',')[0]);
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.error('   Check your .env PG_* settings or DATABASE_URL');
    process.exit(1); // Fatal — can't run without DB
  }
};

module.exports = { pool, query, getClient, testConnection };
