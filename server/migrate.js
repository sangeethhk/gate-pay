/**
 * migrate.js — Run to create / update all database tables.
 * Safe to re-run: uses IF NOT EXISTS and IF NOT EXISTS checks.
 * Usage: node migrate.js  |  npm run migrate
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { pool } = require('./db');

const migrations = [
  // ── 1. users (base table) ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    email        VARCHAR(255) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    totp_secret  VARCHAR(255) NOT NULL,
    is_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    role         VARCHAR(20)  NOT NULL DEFAULT 'client',
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  // For existing users table if already created without role/is_active:
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'client'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','business','client'));
    END IF;
  END $$;`,

  `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role)`,

  // ── 2. refresh_tokens ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens (token)`,

  // ── 3. businesses (profile for business-role users) ─────────────────────────
  `CREATE TABLE IF NOT EXISTS businesses (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    website      VARCHAR(255),
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses (user_id)`,

  // ── 4. payment_links (businesses create, clients use to pay) ─────────────────
  `CREATE TABLE IF NOT EXISTS payment_links (
    id          SERIAL PRIMARY KEY,
    business_id INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    amount      INTEGER,             -- NULL = let client enter amount
    currency    VARCHAR(10)  NOT NULL DEFAULT 'usd',
    slug        VARCHAR(100) NOT NULL UNIQUE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_payment_links_business_id ON payment_links (business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_links_slug        ON payment_links (slug)`,

  // ── 5. transactions ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS transactions (
    id                 SERIAL PRIMARY KEY,
    user_id            INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id        INTEGER     REFERENCES users(id),           -- NULL = direct payment
    payment_link_id    INTEGER     REFERENCES payment_links(id),   -- NULL = manual payment
    stripe_payment_id  VARCHAR(255) NOT NULL UNIQUE,
    amount             INTEGER     NOT NULL,
    currency           VARCHAR(10) NOT NULL DEFAULT 'usd',
    status             VARCHAR(20) NOT NULL
                         CHECK (status IN ('pending','succeeded','failed')),
    description        VARCHAR(500),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES users(id)`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_link_id INTEGER REFERENCES payment_links(id)`,

  // ── UPI Support Columns ──
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100)`,
  `ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100)`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'card'`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100)`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS utr_number VARCHAR(100)`,
  `ALTER TABLE transactions ALTER COLUMN stripe_payment_id DROP NOT NULL`,

  // ── Developer API & Checkout Sessions Support ──
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS api_key VARCHAR(100)`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS api_secret VARCHAR(100)`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(255)`,
  `CREATE INDEX IF NOT EXISTS idx_businesses_api_key ON businesses (api_key)`,

  `CREATE TABLE IF NOT EXISTS checkout_sessions (
    id              SERIAL PRIMARY KEY,
    session_id      VARCHAR(100) UNIQUE NOT NULL,
    business_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          INTEGER NOT NULL,
    currency        VARCHAR(10) NOT NULL DEFAULT 'inr',
    order_id        VARCHAR(100),
    customer_email  VARCHAR(255),
    customer_name   VARCHAR(255),
    description     VARCHAR(500),
    callback_url    TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
    payment_method  VARCHAR(20),
    utr_number      VARCHAR(100),
    upi_id          VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_checkout_sessions_session_id ON checkout_sessions (session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_checkout_sessions_business_id ON checkout_sessions (business_id)`,

  `CREATE INDEX IF NOT EXISTS idx_transactions_user_id           ON transactions (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_business_id       ON transactions (business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_stripe_payment_id ON transactions (stripe_payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_status            ON transactions (status)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_created_at        ON transactions (created_at DESC)`,

  // ── 6. Razorpay Full Backend Model ─────────────────────────────────────────
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS rzp_key_id VARCHAR(100)`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS rzp_key_secret VARCHAR(100)`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(100)`,
  `CREATE INDEX IF NOT EXISTS idx_businesses_rzp_key_id ON businesses (rzp_key_id)`,

  // Razorpay Orders Table
  `CREATE TABLE IF NOT EXISTS orders (
    id           VARCHAR(100) PRIMARY KEY,
    business_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount       INTEGER NOT NULL,
    amount_paid  INTEGER NOT NULL DEFAULT 0,
    amount_due   INTEGER NOT NULL,
    currency     VARCHAR(10) NOT NULL DEFAULT 'INR',
    receipt      VARCHAR(255),
    status       VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','attempted','paid')),
    attempts     INTEGER NOT NULL DEFAULT 0,
    notes        JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_business_id ON orders (business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders (created_at DESC)`,

  // Razorpay Payments Table
  `CREATE TABLE IF NOT EXISTS payments (
    id                VARCHAR(100) PRIMARY KEY,
    order_id          VARCHAR(100) REFERENCES orders(id) ON DELETE SET NULL,
    business_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount            INTEGER NOT NULL,
    currency          VARCHAR(10) NOT NULL DEFAULT 'INR',
    status            VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','authorized','captured','refunded','failed')),
    method            VARCHAR(50) NOT NULL DEFAULT 'upi',
    amount_refunded   INTEGER NOT NULL DEFAULT 0,
    refund_status     VARCHAR(20),
    captured          BOOLEAN NOT NULL DEFAULT TRUE,
    description       VARCHAR(500),
    vpa               VARCHAR(100),
    email             VARCHAR(255),
    contact           VARCHAR(50),
    bank              VARCHAR(50),
    wallet            VARCHAR(50),
    utr               VARCHAR(100),
    card_network      VARCHAR(50),
    card_last4        VARCHAR(10),
    fee               INTEGER NOT NULL DEFAULT 0,
    tax               INTEGER NOT NULL DEFAULT 0,
    error_code        VARCHAR(50),
    error_description VARCHAR(255),
    notes             JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payments_order_id    ON payments (order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_business_id ON payments (business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_status      ON payments (status)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_created_at  ON payments (created_at DESC)`,

  // Razorpay Refunds Table
  `CREATE TABLE IF NOT EXISTS refunds (
    id          VARCHAR(100) PRIMARY KEY,
    payment_id  VARCHAR(100) NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    business_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,
    currency    VARCHAR(10) NOT NULL DEFAULT 'INR',
    status      VARCHAR(20) NOT NULL DEFAULT 'processed',
    speed       VARCHAR(20) NOT NULL DEFAULT 'normal',
    receipt     VARCHAR(255),
    notes       JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_payment_id  ON refunds (payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_business_id ON refunds (business_id)`,

  // Razorpay Customers Table
  `CREATE TABLE IF NOT EXISTS customers (
    id          VARCHAR(100) PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255),
    email       VARCHAR(255),
    contact     VARCHAR(50),
    gstin       VARCHAR(50),
    notes       JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers (business_id)`,

  // Razorpay Settlements Table
  `CREATE TABLE IF NOT EXISTS settlements (
    id          VARCHAR(100) PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,
    fees        INTEGER NOT NULL DEFAULT 0,
    tax         INTEGER NOT NULL DEFAULT 0,
    utr         VARCHAR(100),
    status      VARCHAR(20) NOT NULL DEFAULT 'processed',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_settlements_business_id ON settlements (business_id)`,

  // Webhook Deliveries Table
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              SERIAL PRIMARY KEY,
    business_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event           VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    signature       VARCHAR(255) NOT NULL,
    response_status INTEGER,
    status          VARCHAR(20) NOT NULL DEFAULT 'delivered',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_business_id ON webhook_deliveries (business_id)`,

  // Idempotency Keys Table (Prevents double spending & replay attacks)
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    key             VARCHAR(255) PRIMARY KEY,
    user_id         INTEGER,
    route           VARCHAR(255) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body   JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at)`,
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...\n');
    for (let i = 0; i < migrations.length; i++) {
      const sql = migrations[i].trim();
      const preview = sql.split('\n')[0].substring(0, 70);
      try {
        await client.query(sql);
        console.log(`  ✅ [${i + 1}/${migrations.length}] ${preview}`);
      } catch (err) {
        console.error(`  ❌ [${i + 1}/${migrations.length}] ${preview}`);
        console.error('     Error:', err.message);
        throw err;
      }
    }
    console.log('\n🎉 All migrations completed!');
    console.log('   Tables: users, refresh_tokens, businesses, payment_links, transactions');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('\n💥 Migration failed:', err.message);
  process.exit(1);
});
