/**
 * config/env.js — Runtime Environment Schema Validator
 * Enforces Zero-Trust configuration validation before server startup.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const requiredEnvVars = [
  { key: 'DATABASE_URL', description: 'PostgreSQL connection URI (Supabase or direct)' },
  { key: 'JWT_SECRET', description: 'Primary secret for signing authentication access tokens' },
  { key: 'JWT_PREAUTH_SECRET', description: 'Secret for 2FA pre-authorization tokens' },
];

function validateEnv() {
  const missing = [];
  const warnings = [];

  for (const { key, description } of requiredEnvVars) {
    if (!process.env[key] || process.env[key].trim() === '') {
      missing.push(`  ❌ [MISSING] ${key} — ${description}`);
    }
  }

  // Security checks
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.includes('change_me')) {
      missing.push('  ❌ [CRITICAL] JWT_SECRET contains insecure placeholder value in production!');
    }
    if (process.env.JWT_PREAUTH_SECRET && process.env.JWT_PREAUTH_SECRET.includes('change_me')) {
      missing.push('  ❌ [CRITICAL] JWT_PREAUTH_SECRET contains insecure placeholder value in production!');
    }
  }

  if (missing.length > 0) {
    console.error('\n💥 [FATAL CONFIGURATION ERROR] Environment validation failed:');
    missing.forEach((msg) => console.error(msg));
    console.error('\nPlease configure your server/.env file using server/.env.example as a template.\n');
    process.exit(1);
  }

  return {
    PORT: parseInt(process.env.PORT, 10) || 5000,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_SSL: process.env.DATABASE_SSL === 'true',
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_PREAUTH_SECRET: process.env.JWT_PREAUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@paygateway.com',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@123456',
    ADMIN_SECRET: process.env.ADMIN_SECRET || 'admin_master_secret',
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    NODE_ENV: process.env.NODE_ENV || 'development',
  };
}

module.exports = validateEnv();
